const logEl = document.getElementById('log');
const statusBox = document.getElementById('status-box');
const statusText = document.getElementById('status-text');
const progressBox = document.getElementById('progress-box');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const statSynced = document.getElementById('stat-synced');
const statConv = document.getElementById('stat-conv');

let totalSynced = 0;

function addLog(msg) {
  const line = document.createElement('div');
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// ── Load saved settings ────────────────────────────────────────────────────
chrome.storage.local.get(['crmToken', 'crmUrl'], data => {
  if (data.crmUrl) document.getElementById('crm-url').value = data.crmUrl;
  if (data.crmToken) document.getElementById('crm-token').value = data.crmToken;
  
  if (data.crmToken) {
    checkCrmStatus(data.crmUrl || 'https://crm.adsup.vn', data.crmToken);
  }
});

// ── Save settings ──────────────────────────────────────────────────────────
document.getElementById('btn-save').addEventListener('click', () => {
  const url = document.getElementById('crm-url').value.trim().replace(/\/$/, '');
  const token = document.getElementById('crm-token').value.trim();
  
  if (!url || !token) {
    addLog('❌ Vui lòng nhập đầy đủ URL và Token');
    return;
  }
  
  chrome.storage.local.set({ crmUrl: url, crmToken: token }, () => {
    addLog('✅ Đã lưu cấu hình');
    checkCrmStatus(url, token);
    
    // Update content script
    chrome.tabs.query({ url: 'https://chat.zalo.me/*' }, tabs => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'PING' }, response => {
          if (response?.alive) addLog(`✅ Đã kết nối với Zalo Web tab ${tab.id}`);
        });
      });
    });
  });
});

// ── Check CRM connection ───────────────────────────────────────────────────
async function checkCrmStatus(url, token) {
  try {
    const res = await fetch(`${url}/api/v1/status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      statusBox.className = 'status-box connected';
      statusText.textContent = `🟢 Đã kết nối CRM: ${url}`;
      addLog(`✅ CRM online`);
    } else {
      statusBox.className = 'status-box disconnected';
      statusText.textContent = `🔴 CRM lỗi: HTTP ${res.status}`;
    }
  } catch (e) {
    statusBox.className = 'status-box disconnected';
    statusText.textContent = `🔴 Không kết nối được CRM`;
    addLog(`❌ CRM error: ${e.message}`);
  }
}

// ── Check if Zalo Web tab is open and inject if needed ────────────────────
async function ensureContentScriptInjected(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'PING' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        // Content script not running — inject it now
        addLog('⚙️ Đang inject content script vào tab...');
        chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        }, () => {
          if (chrome.runtime.lastError) {
            addLog('❌ Inject thất bại: ' + chrome.runtime.lastError.message);
            resolve(false);
          } else {
            addLog('✅ Đã inject content script thành công!');
            setTimeout(() => resolve(true), 500);
          }
        });
      } else {
        addLog(`✅ Content script đang chạy. Đã sync: ${response.synced} tin nhắn`);
        statSynced.textContent = response.synced;
        resolve(true);
      }
    });
  });
}

chrome.tabs.query({ url: 'https://chat.zalo.me/*' }, async (tabs) => {
  if (tabs.length === 0) {
    document.getElementById('main-ui').style.display = 'none';
    document.getElementById('not-zalo').style.display = 'block';
  } else {
    addLog(`✅ Tìm thấy ${tabs.length} tab Zalo Web`);
    await ensureContentScriptInjected(tabs[0].id);
  }
});

// ── Start sync — background does everything ────────────────────────────────
document.getElementById('btn-sync').addEventListener('click', async () => {
  const crmUrl = document.getElementById('crm-url').value.trim().replace(/\/$/, '');
  const crmToken = document.getElementById('crm-token').value.trim();
  
  if (!crmUrl || !crmToken) {
    addLog('❌ Vui lòng nhập URL và Token trước');
    return;
  }
  
  chrome.tabs.query({ url: 'https://chat.zalo.me/*' }, (tabs) => {
    if (tabs.length === 0) {
      addLog('❌ Vui lòng mở chat.zalo.me trước');
      return;
    }
    
    addLog('🚀 Đang khởi động sync qua Background Worker...');
    progressBox.classList.add('active');
    progressBar.style.width = '5%';
    progressText.textContent = 'Background đang đọc IndexedDB và gửi lên CRM...';
    
    // Send only lightweight params — background reads IndexedDB itself
    chrome.runtime.sendMessage({
      type: 'START_SYNC_BG',
      tabId: tabs[0].id,
      crmUrl,
      crmToken,
    }, (response) => {
      if (chrome.runtime.lastError) {
        addLog('❌ Background error: ' + chrome.runtime.lastError.message);
        return;
      }
      if (response?.received) {
        addLog('✅ Background đã nhận lệnh. Đang đọc & đồng bộ...');
        addLog('💡 Badge icon hiển thị % tiến trình. Bạn có thể đóng popup.');
      }
    });
  });
});




// ── Start Auto-Scroll sync (Plaintext) ────────────────────────────────────
document.getElementById('btn-auto-scroll').addEventListener('click', () => {
  addLog('🚀 Bắt đầu quét hội thoại để lấy tin nhắn thật...');
  progressBox.classList.add('active');
  progressText.textContent = 'Đang quét... vui lòng không đóng Zalo tab';
  
  chrome.tabs.query({ url: 'https://chat.zalo.me/*' }, (tabs) => {
    if (tabs.length === 0) {
      addLog('❌ Vui lòng mở chat.zalo.me');
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { type: 'START_AUTO_SCROLL' }, (res) => {
      if (res?.ok) addLog('✅ Đã gửi lệnh quét. Xem tiến trình trên thanh progress.');
    });
  });
});

// ── Start Deep Sync (Scroll Up) ───────────────────────────────────────────
document.getElementById('btn-deep-sync')?.addEventListener('click', () => {
  addLog('💎 Bắt đầu đồng bộ chuyên sâu (Cuộn ngược lịch sử)...');
  chrome.tabs.query({ url: 'https://chat.zalo.me/*' }, (tabs) => {
    if (tabs.length === 0) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: 'START_DEEP_SYNC' });
  });
});

// ── Inspect IndexedDB directly via executeScript ───────────────────────────
document.getElementById('id-inspect')?.addEventListener('click', () => {
  chrome.tabs.query({ url: 'https://chat.zalo.me/*' }, async (tabs) => {
    if (tabs.length === 0) {
      addLog('❌ Vui lòng mở chat.zalo.me trước');
      return;
    }
    
    addLog('🔍 Đang đọc trực tiếp từ IndexedDB...');
    
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: async () => {
        const results = [];
        const dbs = await indexedDB.databases();
        
        for (const dbInfo of dbs) {
          if (!dbInfo.name || !dbInfo.name.startsWith('msginfo_')) continue;
          
          try {
            const db = await new Promise((res, rej) => {
              const r = indexedDB.open(dbInfo.name);
              r.onsuccess = e => res(e.target.result);
              r.onerror = () => rej();
            });
            
            const stores = Array.from(db.objectStoreNames);
            const storeInfo = [];
            
            for (const storeName of stores) {
              try {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const count = await new Promise(res => {
                  const r = store.count();
                  r.onsuccess = () => res(r.result);
                  r.onerror = () => res(0);
                });
                
                let sample = null;
                if (count > 0) {
                  const records = await new Promise(res => {
                    const r = store.getAll(null, 1);
                    r.onsuccess = () => res(r.result);
                    r.onerror = () => res([]);
                  });
                  sample = records[0];
                }
                
                storeInfo.push({ store: storeName, count, sample });
              } catch(e) {
                storeInfo.push({ store: storeName, count: -1, error: e.message });
              }
            }
            
            results.push({ db: dbInfo.name, stores: storeInfo });
            db.close();
          } catch(e) {
            results.push({ db: dbInfo.name, error: e.message });
          }
        }
        
        return results;
      }
    }, (injectionResults) => {
      if (chrome.runtime.lastError) {
        addLog('❌ ' + chrome.runtime.lastError.message);
        return;
      }
      
      const results = injectionResults[0]?.result;
      if (!results || results.length === 0) {
        addLog('❌ Không tìm thấy database msginfo_*');
        return;
      }
      
      for (const dbResult of results) {
        addLog(`📦 DB: ${dbResult.db}`);
        if (dbResult.stores) {
          for (const s of dbResult.stores) {
            addLog(`  • ${s.store}: ${s.count} records`);
            if (s.sample) {
              const keys = Object.keys(s.sample).slice(0, 8);
              addLog(`    Fields: ${keys.join(', ')}`);
            }
          }
        }
      }
      
      // Send to background for full logging
      console.log('[ZaloCRM Debug]', JSON.stringify(results, null, 2));
    });
  });
});

// ── Listen for progress updates ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SYNC_PROGRESS') {
    totalSynced += (msg.count || 0);
    statSynced.textContent = totalSynced;
    if (msg.current && msg.total) {
      const pct = Math.round((msg.current / msg.total) * 100);
      progressBar.style.width = pct + '%';
      progressText.textContent = `Đang quét hội thoại ${msg.current}/${msg.total}...`;
      statConv.textContent = msg.current;
      addLog(`📨 Hội thoại ${msg.current}/${msg.total} - Tổng: ${totalSynced} tin nhắn`);
    }
  }
  if (msg.type === 'SYNC_COMPLETED') {
    progressBar.style.width = '100%';
    const saved = msg.totalSaved || 0;
    const skipped = msg.totalSkipped || 0;
    progressText.textContent = `✅ Hoàn tất! ${saved} tin nhắn mới | ${skipped} đã có sẵn`;
    addLog(`🎉 Hoàn tất! Lưu mới: ${saved} | Đã có: ${skipped} | Tổng: ${msg.total}`);
    statSynced.textContent = saved;
    if (msg.errors && msg.errors.length > 0) {
      addLog(`⚠️ ${msg.errors.length} lỗi:`);
      msg.errors.slice(0, 5).forEach(e => addLog(`  • ${e}`));
    }
  }
});
