/**
 * Zalo CRM - Page Level Interceptor
 * This runs in the MAIN world to bypass CSP and access decrypted data
 */
(function() {
  if (window.__zaloCRM_injected) return;
  window.__zaloCRM_injected = true;

  function postToCRM(type, data, url) {
    window.postMessage({ __zaloCRM: true, type, data, url }, '*');
  }

  // Intercept Fetch - Bắt mọi dữ liệu JSON có cấu trúc tin nhắn
  const origFetch = window.fetch;
  window.fetch = async function(input, init) {
    const url = (typeof input === 'string') ? input : (input?.url || '');
    const res = await origFetch.call(this, input, init);
    
    if (res.ok) {
      res.clone().text().then(text => {
        if (text.includes('"msg"') || text.includes('"content"') || text.includes('"msgs"')) {
          try {
            const data = JSON.parse(text);
            postToCRM('FETCH', data, url);
          } catch(e) {}
        }
      }).catch(() => {});
    }
    return res;
  };

  // Intercept XHR
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u) { this.__url = u; return origOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('load', function() {
      if (this.__url && (this.__url.includes('getchathistory') || this.__url.includes('getmsgid'))) {
        try { postToCRM('XHR', JSON.parse(this.responseText), this.__url); } catch(e) {}
      }
    });
    return origSend.apply(this, arguments);
  };

  // Intercept WebSocket
  const OrigWS = window.WebSocket;
  window.WebSocket = function(...args) {
    const ws = new OrigWS(...args);
    ws.addEventListener('message', (e) => {
      if (typeof e.data === 'string') {
        try {
          const d = JSON.parse(e.data);
          if (d && (d.msgs || d.msg)) postToCRM('WS', d, 'websocket');
        } catch(err) {}
      }
    });
    return ws;
  };
  window.WebSocket.prototype = OrigWS.prototype;

  console.log('[ZaloCRM] Page-level interceptors active (World: MAIN) ✅');
})();
