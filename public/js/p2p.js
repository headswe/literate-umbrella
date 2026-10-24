// Phone-to-phone play over WebRTC. One device hosts the island; the others join with a short code.
// PeerJS's free public broker only introduces the devices; game data then goes directly between them.
const PEER_URLS = ['vendor/peerjs.min.js', 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'];
const PREFIX = 'myson-island-';

// ?peer=host:port uses your own PeerJS server instead of the free public one (handy for testing).
function options() {
  const m = /[?&]peer=([^&:]+):(\d+)/.exec(location.search);
  return m ? { host: m[1], port: +m[2], path: '/', secure: location.protocol === 'https:' } : {};
}

let loading = null;
function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const tryNext = (i) => {
      if (i >= PEER_URLS.length) { loading = null; reject(new Error('peerjs')); return; }
      const s = document.createElement('script');
      s.src = PEER_URLS[i];
      s.onload = () => (window.Peer ? resolve(window.Peer) : tryNext(i + 1));
      s.onerror = () => { s.remove(); tryNext(i + 1); };
      document.head.appendChild(s);
    };
    tryNext(0);
  });
  return loading;
}

const WORDS = ['SOL', 'MOLN', 'KATT', 'HUND', 'GRIS', 'HUS', 'FISK', 'BI', 'UGGLA', 'KOTTE'];
// Codes kids can read out loud: a word and two digits, like "SOL-42".
function makeCode() {
  return WORDS[Math.floor(Math.random() * WORDS.length)] + '-' + (10 + Math.floor(Math.random() * 90));
}
// "sol 42", "SOL-42" and "sol42" all find the same island.
const peerId = (code) => PREFIX + code.toUpperCase().replace(/[^A-Z0-9]/g, '');

// Host: calls onMessage(conn, msg) for each message, onLeave(conn) when someone goes.
export async function host(onMessage, onLeave) {
  const Peer = await loadPeer();
  for (let tries = 0; tries < 4; tries++) {
    const code = makeCode();
    const peer = new Peer(peerId(code), options());
    const ok = await new Promise((resolve) => {
      peer.on('open', () => resolve(true));
      peer.on('error', (e) => resolve(e.type === 'unavailable-id' ? false : e));
    });
    if (ok === false) { peer.destroy(); continue; }
    if (ok !== true) { peer.destroy(); throw ok; }
    const conns = new Set();
    peer.on('connection', (conn) => {
      conn.on('open', () => conns.add(conn));
      conn.on('data', (d) => onMessage(conn, d));
      const gone = () => { if (conns.delete(conn)) onLeave(conn); };
      conn.on('close', gone);
      conn.on('error', gone);
    });
    // The broker link can drop while games keep running; reconnect so new friends can still join.
    peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* ignore */ } });
    return {
      code,
      send(conn, msg) { if (conn.open) conn.send(msg); },
      broadcast(msg, except) { for (const c of conns) if (c !== except && c.open) c.send(msg); },
      get count() { return conns.size; },
      close() { peer.destroy(); },
    };
  }
  throw new Error('no code');
}

// Guest: connects to a host's code. Resolves when connected.
export async function join(code, onMessage, onClose) {
  const Peer = await loadPeer();
  const peer = new Peer(options());
  await new Promise((resolve, reject) => {
    peer.on('open', resolve);
    peer.on('error', reject);
  });
  const conn = peer.connect(peerId(code), { reliable: true });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 12000);
    conn.on('open', () => { clearTimeout(t); resolve(); });
    peer.on('error', (e) => { clearTimeout(t); reject(e); });
  });
  conn.on('data', onMessage);
  conn.on('close', onClose);
  return {
    send(msg) { if (conn.open) conn.send(msg); },
    close() { peer.destroy(); },
  };
}
