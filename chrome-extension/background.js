/**
 * Background Service Worker
 * Reads IndexedDB from Zalo Web tab directly — no large message transfer needed
 */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_SYNC_BG') {
    sendResponse({ received: true });
    // Background does everything: read IndexedDB + send to CRM
    doFullSync(msg.tabId, msg.crmUrl, msg.crmToken);
    return true;
  }
  if (msg.type === 'SYNC_STARTED') {
    chrome.action.setBadgeText({ text: '...' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  }
  if (msg.type === 'SYNC_PROGRESS') {
    chrome.action.setBadgeText({ text: String(msg.pct || msg.current || '') });
  }
  if (msg.type === 'SYNC_COMPLETED') {
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 8000);
  }
});

async function doFullSync(tabId, crmUrl, crmToken) {
  chrome.action.setBadgeText({ text: '...' });
  chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  
  try {
    // Step 1: Read IndexedDB via executeScript (runs in page context)
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        return new Promise(async (resolve) => {
          const allMessages = [];
          try {
            const dbs = await indexedDB.databases();
            const msginfoDBs = dbs.filter(d => d.name && d.name.startsWith('msginfo_'));
            
            for (const dbInfo of msginfoDBs) {
              const db = await new Promise((res, rej) => {
                const r = indexedDB.open(dbInfo.name);
                r.onsuccess = e => res(e.target.result);
                r.onerror = rej;
              });
              
              const threadMsgs = await new Promise((res) => {
                try {
                  const tx = db.transaction('ThreadMsg', 'readonly');
                  const r = tx.objectStore('ThreadMsg').getAll();
                  r.onsuccess = () => res(r.result);
                  r.onerror = () => res([]);
                } catch(e) { res([]); }
              });
              
              db.close();
              
              for (const r of threadMsgs) {
                const msgId = String(r.cliMsgId || r.globalMsgId || '');
                const threadId = String(r.convId || '');
                if (!msgId || !threadId) continue;
                
                let content = r.msg || '';
                if (typeof content === 'object' && content !== null) {
                  content = content.text || content.content || JSON.stringify(content);
                }
                content = String(content || '').slice(0, 2000);
                
                // 🛡️ CHỐNG MÃ HÓA: Nếu content là base64 dài và không có dấu cách -> Khả năng cao là E2EE
                const isEncrypted = content.length > 20 && /^[A-Za-z0-9+/=]+$/.test(content.replace(/\s/g, ''));
                if (isEncrypted) continue; 

                let senderId = '';
                if (r.fromD && typeof r.fromD === 'object') {
                  senderId = String(r.fromD.userId || r.fromD.uid || r.fromD.id || '');
                } else {
                  senderId = String(r.fromD || '');
                }
                
                const ts = r.sendDttm || r.ts || r.timestamp || r.time || 0;
                
                allMessages.push({
                  msgId,
                  content,
                  senderId,
                  senderName: r.fromD?.dName || 'Sync', // Lấy tên nếu có
                  threadId,
                  timestamp: typeof ts === 'string' ? parseInt(ts) : (ts || Date.now()),
                  isSelf: r.isSelf || false,
                  msgType: r.cliMsgType || 1,
                });
              }
            }
          } catch(e) {
            console.error('[ZaloCRM BG]', e);
          }
          resolve(allMessages);
        });
      }
    });

    const messages = injectionResults[0]?.result || [];
    console.log(`[ZaloCRM BG] Read ${messages.length} messages from IndexedDB`);
    
    if (messages.length === 0) {
      notifyPopup({ type: 'SYNC_COMPLETED', totalSaved: 0, totalSkipped: 0, total: 0, errors: ['No messages found in IndexedDB'] });
      chrome.action.setBadgeText({ text: '0' });
      return;
    }

    // Step 2: Send to CRM in batches
    const BATCH = 50;
    let totalSaved = 0;
    let totalSkipped = 0;
    const errors = [];

    for (let i = 0; i < messages.length; i += BATCH) {
      const batch = messages.slice(i, i + BATCH);
      const pct = Math.round(((i + BATCH) / messages.length) * 100);
      
      chrome.action.setBadgeText({ text: `${pct}%` });
      notifyPopup({ type: 'SYNC_PROGRESS', current: i + BATCH, total: messages.length, pct: `${pct}%` });

      try {
        const res = await fetch(`${crmUrl}/api/v1/zalo/extension-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${crmToken}`,
          },
          body: JSON.stringify({ messages: batch }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          errors.push(`Batch ${i}: HTTP ${res.status} — ${text.slice(0, 150)}`);
        } else {
          const json = await res.json();
          totalSaved += json.saved || 0;
          totalSkipped += json.skipped || 0;
        }
      } catch(e) {
        errors.push(`Batch ${i}: ${e.message}`);
      }

      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[ZaloCRM BG] Done: saved=${totalSaved}, skipped=${totalSkipped}, errors=${errors.length}`);
    
    chrome.action.setBadgeText({ text: String(totalSaved) });
    chrome.action.setBadgeBackgroundColor({ color: totalSaved > 0 ? '#10b981' : '#ef4444' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 10000);

    notifyPopup({ type: 'SYNC_COMPLETED', totalSaved, totalSkipped, total: messages.length, errors });

  } catch(e) {
    console.error('[ZaloCRM BG] Fatal error:', e);
    chrome.action.setBadgeText({ text: 'ERR' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    notifyPopup({ type: 'SYNC_COMPLETED', totalSaved: 0, totalSkipped: 0, total: 0, errors: [e.message] });
  }
}

// ── Heartbeat Mechanism (Báo cáo trạng thái Online) ─────────────────────
setInterval(async () => {
  const tabs = await chrome.tabs.query({ url: "*://chat.zalo.me/*" });
  if (tabs.length === 0) return;

  chrome.storage.local.get(['crmToken', 'crmUrl'], async (data) => {
    if (!data.crmToken || !data.crmUrl) return;

    for (const tab of tabs) {
      try {
        // Gửi nhịp đập cho từng tab (từng account)
        await fetch(`${data.crmUrl.replace(/\/$/, '')}/api/v1/zalo/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.crmToken}`,
          },
          body: JSON.stringify({ 
            tabId: tab.id,
            url: tab.url,
            title: tab.title 
          }),
        });
      } catch (e) {
        console.warn('[ZaloCRM] Heartbeat failed for tab', tab.id);
      }
    }
  });
}, 120000); // 2 phút gửi 1 lần

function notifyPopup(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// ── Handle messages from content script ──────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SYNC_MESSAGES_BG') {
    handleCrmSync(msg.messages, msg.crmUrl, msg.crmToken, msg.zaloName, msg.zaloUid)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ error: err.message }));
    return true; // async
  }
});

async function handleCrmSync(messages, crmUrl, crmToken, zaloName, zaloUid) {
  if (!crmToken || !crmUrl) throw new Error('Missing config');
  
  // Dùng lại endpoint cũ để chắc chắn không bị 404, nhưng gửi kèm zaloName và zaloUid
  const res = await fetch(`${crmUrl.replace(/\/$/, '')}/api/v1/zalo/extension-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${crmToken}`,
    },
    body: JSON.stringify({ 
      messages,
      zaloName,
      zaloUid 
    }),
  });
  
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
