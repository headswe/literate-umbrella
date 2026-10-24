// Connection to the island server on the local network. Only works when the game was opened from `npm start`.
export function connect(onMessage, onStatus) {
  if (!/^https?:$/.test(location.protocol)) return null;
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  let ws = null;
  let closed = false;
  let retry = 1000;
  const queue = [];

  function open() {
    try { ws = new WebSocket(url); } catch { onStatus(false); return; }
    ws.onopen = () => {
      retry = 1000;
      onStatus(true);
      while (queue.length) ws.send(queue.shift());
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      onMessage(m);
    };
    ws.onclose = () => {
      onStatus(false);
      if (!closed) setTimeout(open, retry = Math.min(retry * 2, 10000));
    };
    ws.onerror = () => {};
  }
  open();

  return {
    send(msg) {
      const data = JSON.stringify(msg);
      if (ws && ws.readyState === 1) ws.send(data);
      else if (queue.length < 50) queue.push(data);
    },
    get ready() { return ws && ws.readyState === 1; },
    close() { closed = true; ws?.close(); },
  };
}
