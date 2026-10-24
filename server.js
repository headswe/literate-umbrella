// Serves the game and hosts shared islands for everyone on the same Wi-Fi.
// Run `npm start` and open http://<this computer's IP>:8080 on each device.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Sim, newWorldSave, loadWorld, toSave, ensurePlayer } from './public/js/sim.js';
import { ISLAND_NAMES } from './public/js/data.js';

const PORT = Number(process.env.PORT) || 8080;
const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, 'public');
const SAVES = process.env.SAVES_DIR || join(HERE, 'saves');
const VENDOR = { '/vendor/three.module.min.js': join(HERE, 'node_modules/three/build/three.module.min.js') };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

// ---------------------------------------------------------------- static files
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/hello') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ myson: true }));
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '').replace(/^(\.\.[/\\])+/, '');
  const file = VENDOR[url.pathname] || join(ROOT, rel || 'index.html');
  if (!VENDOR[url.pathname] && !file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file.endsWith('/') ? join(file, 'index.html') : file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

// ---------------------------------------------------------------- shared islands
const rooms = new Map(); // world id -> { world, sim, clients: Map<ws, player>, dirty }

const safeId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);

async function listWorlds() {
  await mkdir(SAVES, { recursive: true });
  const out = [];
  for (const f of await readdir(SAVES)) {
    if (!f.endsWith('.json')) continue;
    try {
      const s = JSON.parse(await readFile(join(SAVES, f), 'utf8'));
      const room = rooms.get(s.id);
      out.push({ id: s.id, name: s.name, saved: s.saved, online: room ? room.clients.size : 0 });
    } catch { /* skip broken file */ }
  }
  return out.sort((a, b) => (b.saved || 0) - (a.saved || 0));
}

async function saveRoom(room) {
  if (!room.dirty) return;
  room.dirty = false;
  await mkdir(SAVES, { recursive: true });
  const file = join(SAVES, safeId(room.world.id) + '.json');
  await writeFile(file + '.tmp', JSON.stringify(toSave(room.world)));
  await rename(file + '.tmp', file);
}

async function openRoom(id) {
  id = safeId(id);
  if (rooms.has(id)) return rooms.get(id);
  const save = JSON.parse(await readFile(join(SAVES, id + '.json'), 'utf8'));
  const world = loadWorld(save);
  const room = { world, sim: new Sim(world), clients: new Map(), dirty: false };
  rooms.set(id, room);
  return room;
}

async function createWorld(save) {
  await mkdir(SAVES, { recursive: true });
  save.id = safeId(save.id) || 'w' + Date.now().toString(36);
  delete save.players; // everyone gets their own bag on the shared island
  await writeFile(join(SAVES, save.id + '.json'), JSON.stringify({ ...save, players: {}, saved: Date.now() }));
  return save.id;
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, except) {
  const data = JSON.stringify(msg);
  for (const ws of room.clients.keys()) if (ws !== except && ws.readyState === 1) ws.send(data);
}

function online(room) {
  return [...room.clients.values()];
}

// Tell everyone which islands exist and who is playing where.
async function announce() {
  const data = JSON.stringify({ t: 'worlds', list: await listWorlds() });
  for (const c of wss.clients) if (c.readyState === 1) c.send(data);
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4 * 1024 * 1024 });

wss.on('connection', (ws) => {
  let room = null;
  let me = null;

  ws.on('message', async (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    try {
      if (m.t === 'list') {
        send(ws, { t: 'worlds', list: await listWorlds() });
      } else if (m.t === 'create') {
        const seed = Math.floor(Math.random() * 2 ** 31);
        const name = String(m.name || ISLAND_NAMES[Math.floor(Math.random() * ISLAND_NAMES.length)]).slice(0, 30);
        const id = await createWorld(newWorldSave(name, seed));
        send(ws, { t: 'created', id });
        await announce();
      } else if (m.t === 'upload' && m.save && Number.isInteger(m.save.seed)) {
        const id = await createWorld({ ...m.save, id: m.save.id + 's' });
        send(ws, { t: 'created', id });
        await announce();
      } else if (m.t === 'leave') {
        leave();
      } else if (m.t === 'join') {
        leave();
        room = await openRoom(m.world);
        const p = m.player || {};
        me = { id: safeId(p.id) || 'p' + Date.now().toString(36), name: String(p.name || '').slice(0, 14), kind: String(p.kind || 'cat').slice(0, 12), x: 0, y: 0, z: 1, angle: 0 };
        ensurePlayer(room.world, me.id, { name: me.name, kind: me.kind });
        room.clients.set(ws, me);
        room.dirty = true;
        send(ws, { t: 'joined', save: toSave(room.world), others: online(room).filter((o) => o !== me) });
        broadcast(room, { t: 'hi', p: me }, ws);
        await announce();
      } else if (room && me && m.t === 'act') {
        const patches = room.sim.act({ ...m.a, by: me.id });
        if (patches.length) {
          room.dirty = true;
          broadcast(room, { t: 'patches', ps: patches });
        }
      } else if (room && me && m.t === 'pos') {
        Object.assign(me, { x: +m.x || 0, y: +m.y || 0, z: +m.z || 0, angle: +m.angle || 0, moving: !!m.moving, swing: +m.swing || 0 });
        const pl = room.world.players[me.id];
        pl.x = me.x; pl.y = me.y;
        broadcast(room, { t: 'pos', id: me.id, x: me.x, y: me.y, z: me.z, angle: me.angle, moving: me.moving, swing: me.swing }, ws);
      }
    } catch (err) {
      send(ws, { t: 'error', message: 'Något gick fel på servern.' });
      console.error(err);
    }
  });

  function leave() {
    if (!room || !me) return;
    const r = room;
    r.clients.delete(ws);
    broadcast(r, { t: 'bye', id: me.id });
    r.dirty = true;
    saveRoom(r).catch(console.error);
    if (!r.clients.size) rooms.delete(r.world.id);
    room = null;
    me = null;
    announce().catch(console.error);
  }

  ws.on('close', leave);
});

// The island keeps living while someone is on it: trees grow, villagers walk.
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const patches = room.sim.tick(now);
    if (patches.length) {
      if (patches.some((p) => p.k !== 'vil')) room.dirty = true;
      broadcast(room, { t: 'patches', ps: patches });
    }
  }
}, 100);

setInterval(() => { for (const room of rooms.values()) saveRoom(room).catch(console.error); }, 10000);

async function shutdown() {
  for (const room of rooms.values()) { room.dirty = true; await saveRoom(room).catch(console.error); }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  console.log(`Mysön körs på http://localhost:${PORT}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  På samma wifi: http://${a.address}:${PORT}`);
  }
});
