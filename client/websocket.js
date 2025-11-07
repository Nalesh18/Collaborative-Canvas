(function() {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  let ws = null;
  const listeners = {};
  let reconnectTimer = null;

  function connect() {
    // Clear any existing timer
    if (reconnectTimer) clearTimeout(reconnectTimer);
    
    ws = new WebSocket(url);
    
    ws.addEventListener('open', () => {
      console.log('WebSocket connected.');
      dispatch('open');
    });
    
    ws.addEventListener('message', ev => {
      let parsed;
      try { parsed = JSON.parse(ev.data); }
      catch(e) { 
        console.error('Invalid JSON received:', ev.data);
        return; 
      }
      if (parsed && parsed.type) {
        dispatch(parsed.type, parsed.payload);
      }
    });
    
    ws.addEventListener('close', () => {
      dispatch('close');
      // Exponential backoff would be better, but this is simple and robust.
      reconnectTimer = setTimeout(connect, 1000 + Math.random() * 2000);
      console.log('WebSocket closed. Reconnecting...');
    });
    
    ws.addEventListener('error', (err) => {
      console.error('WebSocket error:', err);
      // Close will be called automatically after an error.
      try { ws.close(); } catch(e){}
    });
  }

  function dispatch(type, payload) {
    (listeners[type] || []).forEach(cb => {
      try { cb(payload); } catch (e) { console.error('listener error', e); }
    });
  }

  function send(type, payload) {
    const msg = JSON.stringify({ type, payload });
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    } else {
      // You could queue messages here if needed
      console.warn('WebSocket not open. Message not sent:', msg);
    }
  }

  window.net = {
    connect,
    on: (type, cb) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(cb);
    },
    send
  };

  // Kick off connection immediately
  connect();
})();