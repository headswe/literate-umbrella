// Phone-to-phone play. One device hosts the island; the others join with a short code.
// Two ways to reach each other, tried side by side:
//  - WebRTC (PeerJS): devices talk directly. Fast, but home Wi-Fi often blocks it.
//  - A free public MQTT relay: messages pass through a server. Works almost everywhere.
// The guest uses whichever answers first. The host listens on all of them.
const PREFIX = 'myson-island-';
const TOPIC = 'mysonisland/v1/';
const SCRIPTS = {
  Peer: ['vendor/peerjs.min.js', 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'],
  mqtt: ['vendor/mqtt.min.js', 'https://cdn.jsdelivr.net/npm/mqtt@5.10.4/dist/mqtt.min.js'],
};
const RELAYS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt'];

// For testing: ?peer=host:port uses your own PeerJS server, ?peer=off skips WebRTC,
// ?relay=ws://host:port uses your own MQTT server.
const q = new URLSearchParams(location.search);
const peerOff = q.get('peer') === 'off';
const relays = q.get('relay') ? [q.get('relay')] : RELAYS;
function peerOptions() {
  const m = /^([^:]+):(\d+)$/.exec(q.get('peer') || '');
  return m ? { host: m[1], port: +m[2], path: '/', secure: location.protocol === 'https:' } : {};
}

const loading = {};
function load(name) {
  if (window[name]) return Promise.resolve(window[name]);
  if (loading[name]) return loading[name];
  loading[name] = new Promise((resolve, reject) => {
    const tryNext = (i) => {
      if (i >= SCRIPTS[name].length) { loading[name] = null; reject(new Error(name)); return; }
      const s = document.createElement('script');
      s.src = SCRIPTS[name][i];
      s.onload = () => (window[name] ? resolve(window[name]) : tryNext(i + 1));
      s.onerror = () => { s.remove(); tryNext(i + 1); };
      document.head.appendChild(s);
    };
    tryNext(0);
  });
  return loading[name];
}

const WORDS = ['SOL', 'MOLN', 'KATT', 'HUND', 'GRIS', 'HUS', 'FISK', 'BI', 'UGGLA', 'KOTTE'];
// Codes kids can read out loud: a word and two digits, like "SOL-42".
function makeCode() {
  return WORDS[Math.floor(Math.random() * WORDS.length)] + '-' + (10 + Math.floor(Math.random() * 90));
}
// "sol 42", "SOL-42" and "sol42" all find the same island.
const norm = (code) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const randomId = () => Math.random().toString(36).slice(2, 10);
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

function mqttConnect(url, will) {
  return load('mqtt').then((mqtt) => withTimeout(new Promise((resolve, reject) => {
    const c = mqtt.connect(url, { keepalive: 15, reconnectPeriod: 2000, connectTimeout: 8000, clean: true, will });
    c.once('connect', () => resolve(c));
    c.once('error', (e) => { c.end(true); reject(e); });
  }), 9000));
}
const pub = (c, topic, msg, opts = {}) => c.publish(topic, typeof msg === 'string' ? msg : JSON.stringify(msg), opts);
const parse = (buf) => { try { return JSON.parse(String(buf)); } catch { return null; } };

// Picks a code that no island is using on the relay right now.
async function freeCode() {
  for (const url of relays) {
    let probe;
    try { probe = await mqttConnect(url); } catch { continue; }
    try {
      for (let tries = 0; tries < 5; tries++) {
        const code = makeCode();
        const t = TOPIC + norm(code) + '/host';
        const taken = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(false), 700);
          probe.on('message', (topic, buf) => { if (topic === t && String(buf)) { clearTimeout(timer); resolve(true); } });
          probe.subscribe(t);
        });
        probe.unsubscribe(t);
        if (!taken) return code;
      }
    } finally { probe.end(true); }
  }
  return makeCode();
}

// ---------------------------------------------------------------- host
// Calls onMessage(conn, msg) for each message and onLeave(conn) when someone goes.
// A conn has send(msg) and close().
export async function host(onMessage, onLeave) {
  const conns = new Set();
  const add = (conn) => conns.add(conn);
  const gone = (conn) => { if (conns.delete(conn)) onLeave(conn); };
  const closers = [];
  const code = await freeCode();
  const started = await Promise.allSettled([
    ...relays.map((url) => hostRelay(url, code, onMessage, add, gone).then((close) => closers.push(close))),
    peerOff ? Promise.reject(new Error('off')) : hostPeer(code, onMessage, add, gone).then((close) => closers.push(close)),
  ]);
  if (!started.some((r) => r.status === 'fulfilled')) throw new Error('nothing reachable');
  return {
    code,
    send(conn, msg) { conn.send(msg); },
    broadcast(msg, except) { for (const c of conns) if (c !== except) c.send(msg); },
    get count() { return conns.size; },
    close() { for (const close of closers) close(); conns.clear(); },
  };
}

async function hostRelay(url, code, onMessage, add, gone) {
  const base = TOPIC + norm(code) + '/';
  // If the host vanishes, the relay clears the "host" topic, which tells the guests.
  const c = await mqttConnect(url, { topic: base + 'host', payload: '', retain: true, qos: 1 });
  const guests = new Map(); // guest id -> conn
  c.on('message', (topic, buf) => {
    const id = topic.slice((base + 'up/').length);
    const m = parse(buf);
    if (!m || !id) return;
    let conn = guests.get(id);
    if (m.t === 'hello') {
      if (!conn) {
        conn = {
          send(msg) { pub(c, base + 'down/' + id, msg); },
          close() { pub(c, base + 'down/' + id, { t: 'kick' }); guests.delete(id); gone(conn); },
        };
        guests.set(id, conn);
        add(conn);
      }
      conn.send({ t: 'welcome' });
    } else if (m.t === 'gone') {
      if (conn) { guests.delete(id); gone(conn); }
    } else if (conn) onMessage(conn, m);
  });
  c.subscribe(base + 'up/+');
  pub(c, base + 'host', { at: Date.now() }, { retain: true, qos: 1 });
  return () => {
    for (const id of guests.keys()) pub(c, base + 'down/' + id, { t: 'kick' });
    pub(c, base + 'host', '', { retain: true, qos: 1 }, () => c.end());
    setTimeout(() => c.end(true), 1500);
  };
}

async function hostPeer(code, onMessage, add, gone) {
  const Peer = await load('Peer');
  const peer = new Peer(PREFIX + norm(code), peerOptions());
  await withTimeout(new Promise((resolve, reject) => {
    peer.on('open', resolve);
    peer.on('error', reject);
  }), 8000).catch((e) => { peer.destroy(); throw e; });
  peer.on('connection', (dc) => {
    const conn = { send(msg) { if (dc.open) dc.send(msg); }, close() { dc.close(); } };
    dc.on('open', () => add(conn));
    dc.on('data', (d) => onMessage(conn, d));
    dc.on('close', () => gone(conn));
    dc.on('error', () => gone(conn));
  });
  // The broker link can drop while games keep running; reconnect so new friends can still join.
  peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* ignore */ } });
  return () => peer.destroy();
}

// ---------------------------------------------------------------- guest
// Resolves with {send, close} once connected; onClose runs if the host goes away.
export async function join(code, onMessage, onClose) {
  const tries = [...relays.map((url) => joinRelay(url, code)), ...(peerOff ? [] : [joinPeer(code)])];
  let link;
  try {
    link = await Promise.any(tries);
  } catch {
    throw new Error('not found');
  }
  // Close the slower ways in once they finish.
  for (const t of tries) t.then((l) => { if (l !== link) l.close(); }, () => {});
  link.start(onMessage, onClose);
  return { send: link.send, close: link.close };
}

async function joinRelay(url, code) {
  const id = randomId();
  const base = TOPIC + norm(code) + '/';
  const c = await mqttConnect(url, { topic: base + 'up/' + id, payload: JSON.stringify({ t: 'gone' }), qos: 1 });
  let handlers = null;
  let closed = false;
  const queue = [];
  const end = () => { closed = true; c.end(true); };
  const welcomed = new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error('timeout')), 10000);
    c.on('message', (topic, buf) => {
      if (closed) return;
      if (topic === base + 'host') {
        if (!String(buf) && handlers) { end(); handlers.onClose(); }
        return;
      }
      const m = parse(buf);
      if (!m) return;
      if (m.t === 'welcome') resolve();
      else if (m.t === 'kick') { end(); handlers?.onClose(); }
      else if (handlers) handlers.onMessage(m);
      else queue.push(m);
    });
  });
  c.subscribe([base + 'down/' + id, base + 'host']);
  pub(c, base + 'up/' + id, { t: 'hello' });
  // Say hello again now and then in case the first one was lost.
  const again = setInterval(() => pub(c, base + 'up/' + id, { t: 'hello' }), 2500);
  try { await welcomed; } catch (e) { end(); throw e; } finally { clearInterval(again); }
  return {
    send: (msg) => { if (!closed) pub(c, base + 'up/' + id, msg); },
    close: () => {
      if (closed) return;
      closed = true;
      pub(c, base + 'up/' + id, { t: 'gone' }, { qos: 1 }, () => c.end());
      setTimeout(() => c.end(true), 1000);
    },
    start(onMessage, onClose) { handlers = { onMessage, onClose }; while (queue.length) onMessage(queue.shift()); },
  };
}

async function joinPeer(code) {
  const Peer = await load('Peer');
  const peer = new Peer(peerOptions());
  try {
    await withTimeout(new Promise((resolve, reject) => { peer.on('open', resolve); peer.on('error', reject); }), 8000);
    const dc = peer.connect(PREFIX + norm(code), { reliable: true });
    await withTimeout(new Promise((resolve, reject) => { dc.on('open', resolve); peer.on('error', reject); }), 10000);
    let handlers = null;
    const queue = [];
    dc.on('data', (m) => (handlers ? handlers.onMessage(m) : queue.push(m)));
    dc.on('close', () => handlers?.onClose());
    return {
      send: (msg) => { if (dc.open) dc.send(msg); },
      close: () => peer.destroy(),
      start(onMessage, onClose) { handlers = { onMessage, onClose }; while (queue.length) onMessage(queue.shift()); },
    };
  } catch (e) {
    peer.destroy();
    throw e;
  }
}
