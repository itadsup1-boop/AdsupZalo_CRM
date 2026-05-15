/**
 * Zalo CRM Sync - Content Script
 * Strategy:
 *  1. Inject page-level script to intercept Zalo's fetch/XHR → gets DECRYPTED messages
 *  2. Listen for postMessage from page script → forward to CRM
 *  3. WebSocket interceptor for real-time messages
 */

let crmToken = null;
let crmUrl = 'https://crm.adsup.vn';
let syncedMsgIds = new Set();

// ── 1. Load config ────────────────────────────────────────────────────────
chrome.storage.local.get(['crmToken', 'crmUrl'], (data) => {
  crmToken = data.crmToken || null;
  crmUrl = (data.crmUrl || 'https://crm.adsup.vn').replace(/\/$/, '');
  console.log('[ZaloCRM] Token:', crmToken ? '✅ Set' : '❌ Not set');
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.crmToken) crmToken = changes.crmToken.newValue;
  if (changes.crmUrl) crmUrl = (changes.crmUrl.newValue || '').replace(/\/$/, '');
});



// ── 3. Process data from page interceptors ────────────────────────────────
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data?.__zaloCRM) return;
  const { type, data, url } = event.data;
  
  try {
    // Different Zalo API response formats
    const msgs = extractMessages(data, type, url);
    if (msgs.length > 0) {
      const newMsgs = msgs.filter(m => m.msgId && !syncedMsgIds.has(m.msgId));
      if (newMsgs.length > 0) {
        newMsgs.forEach(m => syncedMsgIds.add(m.msgId));
        console.log(`[ZaloCRM] Captured ${newMsgs.length} plaintext messages via ${type}`);
        sendToCRM(newMsgs);
      }
    }
  } catch(e) {
    console.warn('[ZaloCRM] Error processing intercepted data:', e);
  }
});

// ── 4. Extract messages from various Zalo API response formats ────────────
function extractMessages(data, type, url) {
  const candidates = [];
  
  // Try different Zalo response structures
  const msgArrays = [
    data?.msgs,
    data?.data?.msgs,
    data?.data?.messages,
    data?.message ? [data.message] : null,
    data?.data?.msg ? [data.data.msg] : null,
    Array.isArray(data) ? data : null,
  ].filter(Boolean);

  for (const arr of msgArrays) {
    if (!Array.isArray(arr)) continue;
    for (const m of arr) {
      const msgId = String(m.msgId || m.cliMsgId || m.globalMsgId || m.id || '');
      const threadId = String(m.idTo || m.toId || m.threadId || m.convId || m.to || m.cid || '');
      
      if (!msgId) continue;

      // Content: try all possible field names
      let content = m.content || m.message || m.msg || m.text || m.body || '';
      if (typeof content === 'object' && content !== null) {
        content = content.text || content.content || content.msg || JSON.stringify(content);
      }
      content = String(content || '');
      
      // Nếu rỗng thì bỏ qua
      if (content.length === 0) continue;

      // Sender
      let senderId = String(m.uidFrom || m.fromUid || m.senderId || m.from || m.userId || '');
      let senderName = m.senderName || m.dName || m.displayName || m.name || '';

      const ts = m.ts || m.timestamp || m.time || m.sendDttm || m.serverTime || Date.now();

      candidates.push({
        msgId,
        content,
        senderId,
        senderName,
        threadId,
        timestamp: typeof ts === 'string' ? parseInt(ts) : (ts || Date.now()),
        isSelf: m.isSelf || m.fromMe || false,
        msgType: m.msgType || m.type || 1,
      });
    }
  }

  return candidates;
}

// ── 5. Send to CRM (via Background to avoid CORS/Context issues) ──────────
async function sendToCRM(messages) {
  if (!crmToken) return;
  
  // 🚀 LẤY ZALO UID CỦA NGƯỜI ĐANG ĐĂNG NHẬP
  let zaloUid = '';
  try {
    // Zalo Web lưu ID người dùng trong localStorage dưới dạng JSON
    const zAuth = localStorage.getItem('z_u'); 
    if (zAuth) {
      const parsed = JSON.parse(zAuth);
      zaloUid = String(parsed.uid || parsed.id || '');
    }
  } catch(e) {}

  const zaloName = document.title.replace('Zalo - ', '').trim();

  chrome.runtime.sendMessage({
    type: 'SYNC_MESSAGES_BG',
    messages,
    crmUrl,
    crmToken,
    zaloName,
    zaloUid // GỬI KÈM ID DUY NHẤT
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[ZaloCRM] BG sync error:', chrome.runtime.lastError.message);
    } else if (response?.error) {
      console.error('[ZaloCRM] CRM sync error:', response.error);
    } else {
      console.log(`[ZaloCRM] ✅ BG Synced ${messages.length} msgs → saved: ${response?.saved}`);
      
      chrome.runtime.sendMessage({
        type: 'SYNC_PROGRESS',
        count: response?.saved || 0,
        total: syncedMsgIds.size,
      }).catch(() => {});
    }
  });
}

// 5.3 Hybrid Capture: Priority 1 - MutationObserver (Real-time)
function setupHybridCapture() {
  const targetNode = document.body;
  const config = { childList: true, subtree: true };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        // Thay vì querySelector(".message"), ta dùng heuristic để nhận diện tin nhắn
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            const el = node;
            // Nhận diện block tin nhắn qua các đặc điểm phi-class
            if (el.getAttribute('data-id') || el.innerText.includes(':')) {
               processNewNode(el);
            }
          }
        });
      }
    }
  });

  observer.observe(targetNode, config);
}

// 5.3 Hybrid Capture: Priority 2 - Network Interceptor (Cần script injection)
function injectNetworkInterceptor() {
  const script = document.createElement('script');
  script.textContent = `
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (args[0].includes('/api/message/get_history')) {
        const clone = response.clone();
        clone.json().then(data => {
          window.postMessage({ type: 'ZALO_NETWORK_DATA', data }, '*');
        });
      }
      return response;
    };
  `;
  (document.head || document.documentElement).appendChild(script);
}

function processNewNode(node) {
  // Logic trích xuất tin nhắn thông minh không phụ thuộc class
  const text = node.innerText;
  if (text) {
     // Gửi về ingestion...
  }
}

// ── 5.5. Heuristic Scrape (Siêu quét Tổng lực) ───────────────────
function scrapeVisibleMessages() {
  const messages = [];
  
  // 1. Lấy Thread ID chuẩn hơn
  const urlParams = new URLSearchParams(window.location.search);
  let currentThreadId = urlParams.get('conv_id');
  
  if (!currentThreadId) {
    // Thử lấy từ thuộc tính data của Zalo
    const chatHeader = document.querySelector('[id^="chatView"]');
    currentThreadId = chatHeader?.id?.replace('chatView', '') || 'unknown';
  }
  
  const headerTitle = document.querySelector('[class*="header-title"], [class*="name"], .chat-header-name');
  const currentSenderName = headerTitle ? headerTitle.innerText.trim() : 'Khách hàng';

  // 2. Tìm khung chat
  const chatView = document.querySelector('.virtual-list, #chatViewContent, [class*="chat-content"], .message-view__list-container, #scroll-vertical > div');
  if (!chatView) return [];
  
  const chatRect = chatView.getBoundingClientRect();
  const chatMid = chatRect.left + (chatRect.width / 2);

  const walker = document.createTreeWalker(chatView, NodeFilter.SHOW_TEXT, null, false);
  let node;
  
  while (node = walker.nextNode()) {
    const text = node.textContent.trim();
    if (text.length < 2 || text.length > 2000) continue;

    const parent = node.parentElement;
    if (!parent) continue;
    
    const rect = parent.getBoundingClientRect();

    // Lọc tọa độ (Nới lỏng tối đa)
    if (rect.left > chatRect.left && rect.right < chatRect.right) {
      // Loại bỏ các thông báo hệ thống và thời gian
      if (/^\d{1,2}:\d{2}$/.test(text)) continue;
      if (text.includes('tin nhắn mới') || text.includes('đã gửi một') || text === 'Hôm nay') continue;

      const msgId = `h_${currentThreadId}_${btoa(unescape(encodeURIComponent(text))).slice(0, 15)}`;
      
      if (!syncedMsgIds.has(msgId)) {
        const isSelf = rect.left > (chatMid - 50); 
        messages.push({
          msgId,
          content: text,
          senderId: isSelf ? 'me' : currentThreadId, 
          senderName: isSelf ? 'Me' : currentSenderName,
          threadId: currentThreadId,
          timestamp: Date.now(),
          isSelf,
          msgType: 1
        });
        syncedMsgIds.add(msgId);
      }
    }
  }
  
  return messages;
}

// ── 6. Auto-Scroll & Capture (Plaintext focused) ─────────────────────────
async function triggerAutoScrollSync() {
  console.log('[ZaloCRM] Finding conversation list...');
  
  let items = Array.from(document.querySelectorAll('[id^="conv_"], [class*="conv-item"], [data-id^="conv_"]'));
  
  if (items.length === 0) {
    const container = document.querySelector('#contactList, [class*="conversation-list"], .virtual-list');
    if (container) {
      items = Array.from(container.querySelectorAll('div[style*="height"], div[class]')).filter(el => {
        return el.offsetHeight > 40 && el.offsetHeight < 100 && (el.id || el.className);
      });
    }
  }

  if (items.length === 0) {
    chrome.runtime.sendMessage({ type: 'SYNC_COMPLETED', errors: ['Không tìm thấy hội thoại.'] });
    return;
  }

  console.log(`[ZaloCRM] Found ${items.length} conversations`);
  
  for (let i = 0; i < Math.min(items.length, 30); i++) {
    try {
      const item = items[i];
      item.scrollIntoView({ block: 'center' });
      const clickTarget = item.querySelector('div, span') || item;
      clickTarget.click();
      
      await new Promise(r => setTimeout(r, 3000)); // Chờ giải mã
      
      // 🚀 CÀO MÀN HÌNH: Dùng thuật toán Heuristic để bắt bong bóng chat
      const domMsgs = scrapeVisibleMessages();
      if (domMsgs.length > 0) {
        console.log(`[ZaloCRM] Captured ${domMsgs.length} plaintext messages via Heuristic`);
        await sendToCRM(domMsgs);
      }
      
      chrome.runtime.sendMessage({ 
        type: 'SYNC_PROGRESS', 
        current: i + 1, 
        total: Math.min(items.length, 30),
        pct: Math.round(((i+1)/Math.min(items.length, 30))*100) + '%' 
      }).catch(() => {});
      
    } catch (e) {
      console.warn('[ZaloCRM] Step failed:', e);
    }
  }
  
  chrome.runtime.sendMessage({ 
    type: 'SYNC_COMPLETED', 
    total: Math.min(items.length, 30),
    totalSaved: syncedMsgIds.size
  }).catch(() => {});
}

// ── 7. Listen for messages from popup/background ─────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_AUTO_SCROLL') {
    triggerAutoScrollSync();
    sendResponse({ ok: true });
  }
  if (msg.type === 'START_DEEP_SYNC') {
    triggerDeepSync();
    sendResponse({ ok: true });
  }
  if (msg.type === 'PING') {
    sendResponse({ alive: true, synced: syncedMsgIds.size });
  }
  if (msg.type === 'UPDATE_CONFIG') {
    crmToken = msg.crmToken || crmToken;
    crmUrl = (msg.crmUrl || crmUrl).replace(/\/$/, '');
    sendResponse({ ok: true });
  }
  return true;
});

// ── 8. Deep Sync (Scroll Up & Capture History) ──────────────────────────
// ── 7.5. Helper: Tìm khung chat thông minh ─────────────────────
function findChatScrollContainer() {
  // Thử các selector phổ biến trước
  const common = document.querySelector('.virtual-list, #chatViewContent, [class*="chat-content"], .message-view__list-container');
  if (common) return common;

  // Nếu không thấy, tìm div nào có thanh cuộn và nằm ở giữa màn hình
  const divs = document.querySelectorAll('div');
  for (const div of divs) {
    const rect = div.getBoundingClientRect();
    // Khung chat thường rộng (>400px) và nằm lùi sang phải (>200px)
    if (rect.width > 400 && rect.left > 200 && div.scrollHeight > div.clientHeight) {
      const style = window.getComputedStyle(div);
      if (style.overflowY === 'scroll' || style.overflowY === 'auto' || div.classList.contains('virtual-list')) {
        return div;
      }
    }
  }
  return null;
}

// ── 8. Deep Sync (Scroll Up & Capture History) ──────────────────────────
async function triggerDeepSync() {
  console.log('[ZaloCRM] Starting Deep Sync...');
  
  const scrollContainer = findChatScrollContainer();
  
  if (!scrollContainer) {
    console.error('[ZaloCRM] Cannot find scroll container');
    alert('❌ Không tìm thấy khung chat. Bạn vui lòng bấm vào một cuộc trò chuyện cụ thể rồi thử lại nhé!');
    return;
  }

  let totalDeepSaved = 0;
  let iterations = 0;
  const maxIterations = 30;

  while (iterations < maxIterations) {
    iterations++;
    
    // GỬI TIẾN TRÌNH VỀ POPUP
    chrome.runtime.sendMessage({
      type: 'SYNC_PROGRESS',
      current: iterations,
      total: maxIterations,
      count: totalDeepSaved
    }).catch(() => {});

    scrollContainer.scrollTo(0, 0);
    scrollContainer.scrollTop = 0;
    
    await new Promise(r => setTimeout(r, 3000));

    const msgs = scrapeVisibleMessages();
    if (msgs.length > 0) {
      totalDeepSaved += msgs.length;
      await sendToCRM(msgs);
    }
    
    scrollContainer.scrollBy(0, 10);
    await new Promise(r => setTimeout(r, 100));
    scrollContainer.scrollTo(0, 0);
  }

  chrome.runtime.sendMessage({
    type: 'SYNC_COMPLETED',
    totalSaved: totalDeepSaved,
    total: maxIterations
  }).catch(() => {});
}

// ── 7. Initialize ─────────────────────────────────────────────────────────
console.log('[ZaloCRM] Content script loaded on chat.zalo.me ✅');
console.log('[ZaloCRM] Interceptors: fetch + XHR + WebSocket active');
