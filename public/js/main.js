// Boot, game loop, input and HUD.
import { ITEMS, ITEM_ORDER, NATURE, AVATARS, ISLAND_NAMES } from './data.js';
import { Sim, newWorldSave, loadWorld, toSave, heightAt, isWalkable, canStep } from './sim.js';
import { Renderer, project, TW, TH } from './render.js';
import { findPath } from './path.js';
import { sfx, unlockAudio, setMuted, isMuted } from './audio.js';
import * as store from './storage.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new Renderer(canvas);

const SPEED = 3.6; // tiles per second
const ACT_COOLDOWN = 300;

let world = null;     // the world being shown
let sim = null;
let playing = false;
let dirty = false;
let lastSave = 0;
let marker = null;
let hintShown = true;

const profile = store.loadProfile();
const me = {
  x: 0, y: 0, z: 1, avatar: profile.avatar || '🦄', name: profile.name || '',
  facing: 1, moving: false, path: null, action: null, swing: 0, nextAct: 0,
};

// ---------------------------------------------------------------- title screen
function renderTitle() {
  const av = $('avatars');
  av.innerHTML = '';
  for (const a of AVATARS) {
    const b = document.createElement('button');
    b.className = 'avatar';
    b.textContent = a;
    b.setAttribute('aria-pressed', String(a === me.avatar));
    b.onclick = () => { me.avatar = a; saveProfile(); renderTitle(); sfx.pop(); };
    av.appendChild(b);
  }
  $('playerName').value = me.name;

  const list = store.listWorlds();
  $('worldsWrap').hidden = list.length === 0;
  const wl = $('worlds');
  wl.innerHTML = '';
  for (const w of list) {
    const row = document.createElement('div');
    row.className = 'world';
    const open = document.createElement('button');
    open.className = 'world';
    open.style.cssText = 'flex:1;padding:0;background:none';
    open.innerHTML = `<span>🏝️</span><span></span><span class="when"></span>`;
    open.children[1].textContent = w.name;
    open.children[2].textContent = ago(w.saved);
    open.onclick = () => { const s = store.loadSave(w.id); if (s) startGame(s); };
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '🗑️';
    del.setAttribute('aria-label', 'Ta bort ' + w.name);
    del.onclick = () => {
      if (row.classList.contains('confirm')) { store.deleteSave(w.id); renderTitle(); return; }
      row.classList.add('confirm');
      del.textContent = 'Ta bort?';
      setTimeout(() => { row.classList.remove('confirm'); del.textContent = '🗑️'; }, 3000);
    };
    row.append(open, del);
    wl.appendChild(row);
  }
}

function ago(t) {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'nyss';
  if (m < 60) return m + ' min sedan';
  const h = Math.round(m / 60);
  if (h < 24) return h + ' tim sedan';
  return Math.round(h / 24) + ' dagar sedan';
}

function saveProfile() {
  me.name = $('playerName').value.trim().slice(0, 14);
  store.storeProfile({ avatar: me.avatar, name: me.name });
}

$('playerName').addEventListener('input', saveProfile);
$('newWorld').onclick = () => {
  unlockAudio();
  const seed = Math.floor(Math.random() * 2 ** 31);
  const name = ISLAND_NAMES[Math.floor(Math.random() * ISLAND_NAMES.length)];
  const save = newWorldSave(name, seed);
  store.storeSave(save);
  startGame(save);
};

// A slowly turning demo island behind the title card.
function showDemo() {
  world = loadWorld(newWorldSave('demo', 20261024));
  sim = null;
  playing = false;
  renderer.cam.x = world.spawn.x; renderer.cam.y = world.spawn.y; renderer.cam.z = 1;
}

// ---------------------------------------------------------------- game
function startGame(save) {
  unlockAudio();
  saveProfile();
  world = loadWorld(save);
  sim = new Sim(world);
  const pos = save.me && isWalkable(world, Math.floor(save.me.x), Math.floor(save.me.y)) ? save.me : world.spawn;
  me.x = pos.x; me.y = pos.y; me.z = heightAt(world, Math.floor(me.x), Math.floor(me.y));
  me.path = null; me.action = null; marker = null;
  renderer.cam.x = me.x; renderer.cam.y = me.y; renderer.cam.z = me.z;
  playing = true;
  $('title').hidden = true;
  $('hud').hidden = false;
  $('islandName').textContent = world.name;
  hintShown = !Object.values(world.inv).some((n) => n > 0);
  $('hint').hidden = !hintShown;
  renderInventory();
  lastSave = performance.now();
}

function save() {
  if (!playing || !world) return;
  store.storeSave({ ...toSave(world), me: { x: me.x, y: me.y } });
  dirty = false;
}

function goHome() {
  save();
  showDemo();
  $('hud').hidden = true;
  $('title').hidden = false;
  renderTitle();
}

$('homeBtn').onclick = goHome;
$('muteBtn').onclick = () => {
  setMuted(!isMuted());
  $('muteBtn').textContent = isMuted() ? '🔇' : '🔊';
};
$('zoomIn').onclick = () => renderer.setUserZoom(renderer.userZoom * 1.2);
$('zoomOut').onclick = () => renderer.setUserZoom(renderer.userZoom / 1.2);
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

// ---------------------------------------------------------------- HUD
const slotEls = {};
function renderInventory() {
  const inv = $('inventory');
  inv.innerHTML = '';
  for (const id of ITEM_ORDER) {
    if (id === 'star' && !world.inv.star) continue;
    const s = document.createElement('div');
    s.className = 'slot';
    s.title = ITEMS[id].name;
    s.innerHTML = `<span class="ic">${ITEMS[id].icon}</span><span class="n"></span>`;
    s.querySelector('.n').textContent = world.inv[id] || 0;
    slotEls[id] = s;
    inv.appendChild(s);
  }
}

function bump(id) {
  const s = slotEls[id];
  if (!s) return renderInventory();
  s.querySelector('.n').textContent = world.inv[id] || 0;
  s.classList.remove('bump');
  void s.offsetWidth;
  s.classList.add('bump');
}

let toastTimer = 0;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.style.opacity = '0'), 1800);
}

// ---------------------------------------------------------------- patches → effects
const BURST = { tree: '#5cbf52', pine: '#2f8a52', fruittree: '#e8473d', rock: '#b4bcc4', flower: '#ff7eb6', shell: '#ffb3c1' };

function handle(patches) {
  const now = performance.now();
  for (const p of patches) {
    if (p.k === 'obj' || p.k === 'inv') dirty = true;
    if (p.k === 'inv') bump(p.item);
    if (p.k === 'fx' && p.fx === 'gain') {
      const z = heightAt(world, p.x, p.y);
      renderer.shake(p.x, p.y, Date.now());
      renderer.burst(p.x, p.y, z, BURST[p.obj] || '#fff', p.obj === 'flower' || p.obj === 'shell' ? 6 : 9);
      renderer.floatText(p.x, p.y, z, ITEMS[p.item].icon, '+1');
      if (p.obj === 'rock') sfx.clink(); else if (p.obj === 'flower' || p.obj === 'shell') sfx.pop(); else sfx.chop();
      setTimeout(sfx.gain, 120);
      if (hintShown) { hintShown = false; $('hint').hidden = true; }
    }
    if (p.k === 'fx' && p.fx === 'tired') {
      renderer.shake(p.x, p.y, Date.now());
      sfx.nope();
      const o = world.objects[p.x + ',' + p.y];
      toast(o && o.type === 'rock' ? 'Stenen vilar 💤 Kom tillbaka snart!' : 'Trädet vilar 💤 Kom tillbaka snart!');
    }
  }
  void now;
}

// ---------------------------------------------------------------- actions
function near(tx, ty) {
  return Math.abs(Math.floor(me.x) - tx) <= 1 && Math.abs(Math.floor(me.y) - ty) <= 1;
}

function doGather(tx, ty) {
  const t = performance.now();
  if (t < me.nextAct) return;
  me.nextAct = t + ACT_COOLDOWN;
  me.facing = (tx + 0.5 - me.x) - (ty + 0.5 - me.y) >= 0 ? 1 : -1;
  me.swing = Date.now() + 200;
  handle(sim.act({ type: 'gather', x: tx, y: ty, by: 'me' }));
}

function tapAt(sx, sy) {
  if (!playing) return;
  const hit = renderer.pick(world, sx, sy);
  if (!hit) return;
  const { x, y, obj } = hit;
  if (obj && NATURE[obj.type]) {
    if (near(x, y)) { me.path = null; marker = null; doGather(x, y); return; }
    const path = findPath(world, Math.floor(me.x), Math.floor(me.y),
      (ax, ay) => Math.abs(ax - x) <= 1 && Math.abs(ay - y) <= 1, x, y);
    if (!path) { sfx.nope(); return; }
    me.path = path; me.action = { x, y }; marker = null;
    return;
  }
  if (!isWalkable(world, x, y)) { sfx.nope(); return; }
  const path = findPath(world, Math.floor(me.x), Math.floor(me.y), (ax, ay) => ax === x && ay === y, x, y);
  if (!path) { sfx.nope(); return; }
  me.path = path; me.action = null; marker = { x, y };
}

// ---------------------------------------------------------------- input
const pointers = new Map();
let hold = null;    // {x, y} screen point the player walks toward
let pinch = null;

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: renderer.userZoom };
    hold = null;
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX; p.y = e.clientY;
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    renderer.setUserZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
    return;
  }
  if (!pinch && (Math.hypot(p.x - p.sx, p.y - p.sy) > 22 || hold)) {
    hold = { x: p.x, y: p.y };
    me.path = null; me.action = null; marker = null;
  }
});

function endPointer(e) {
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (!p) return;
  if (pinch) { if (pointers.size === 0) pinch = null; return; }
  if (!hold && performance.now() - p.t < 450) tapAt(p.x, p.y);
  hold = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

// Long press without moving also walks toward the finger.
setInterval(() => {
  if (pinch || hold || pointers.size !== 1) return;
  const p = [...pointers.values()][0];
  if (performance.now() - p.t > 450) { hold = { x: p.x, y: p.y }; me.path = null; marker = null; }
}, 100);

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  renderer.setUserZoom(renderer.userZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
}, { passive: false });

const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.key.toLowerCase());
  if (keys.size) { me.path = null; marker = null; }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', () => renderer.resize());

// Screen direction to world direction.
function screenToWorldDir(dx, dy) {
  const wx = dx / (TW / 2) + dy / (TH / 2);
  const wy = dy / (TH / 2) - dx / (TW / 2);
  const l = Math.hypot(wx, wy) || 1;
  return { x: wx / l, y: wy / l };
}

function freeMove(dir, dt) {
  const step = SPEED * dt;
  const tryMove = (nx, ny) => {
    const cx = Math.floor(me.x), cy = Math.floor(me.y);
    // Look a bit ahead so we don't hug walls.
    const lx = Math.floor(nx + Math.sign(nx - me.x) * 0.22), ly = Math.floor(ny + Math.sign(ny - me.y) * 0.22);
    if ((lx !== cx || ly !== cy) && !canStep(world, cx, cy, lx, ly)) return false;
    me.x = nx; me.y = ny;
    return true;
  };
  const moved = tryMove(me.x + dir.x * step, me.y + dir.y * step)
    || tryMove(me.x + dir.x * step, me.y)
    || tryMove(me.x, me.y + dir.y * step);
  if (moved) me.facing = (dir.x - dir.y) >= 0 ? 1 : -1;
  return moved;
}

// ---------------------------------------------------------------- loop
let last = performance.now();
let stepTimer = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  const now = Date.now();

  if (playing) {
    me.moving = false;
    // Keyboard / hold: walk freely.
    let dir = null;
    if (keys.size) {
      let sx = 0, sy = 0;
      if (keys.has('arrowup') || keys.has('w')) sy -= 1;
      if (keys.has('arrowdown') || keys.has('s')) sy += 1;
      if (keys.has('arrowleft') || keys.has('a')) sx -= 1;
      if (keys.has('arrowright') || keys.has('d')) sx += 1;
      if (sx || sy) dir = screenToWorldDir(sx * TW / 2, sy * TW / 2);
    } else if (hold) {
      const p = project(me.x, me.y, me.z), c = project(renderer.cam.x, renderer.cam.y, renderer.cam.z);
      const px = (p.sx - c.sx) * renderer.zoom + renderer.W / 2;
      const py = (p.sy - c.sy - 20) * renderer.zoom + renderer.H / 2;
      if (Math.hypot(hold.x - px, hold.y - py) > 18) dir = screenToWorldDir(hold.x - px, hold.y - py);
    }
    if (dir) me.moving = freeMove(dir, dt);
    else if (me.path && me.path.length) {
      const n = me.path[0];
      const tx = n.x + 0.5, ty = n.y + 0.5;
      const dx = tx - me.x, dy = ty - me.y, d = Math.hypot(dx, dy);
      const step = SPEED * dt;
      if (d <= step) { me.x = tx; me.y = ty; me.path.shift(); } else { me.x += dx / d * step; me.y += dy / d * step; }
      me.facing = (dx - dy) >= 0 ? 1 : (dx - dy) < 0 ? -1 : me.facing;
      me.moving = true;
    } else if (me.path) {
      me.path = null;
      marker = null;
      if (me.action) { const a = me.action; me.action = null; doGather(a.x, a.y); }
    }
    if (me.moving && (stepTimer -= dt) < 0) { stepTimer = 0.28; sfx.step(); }

    const gz = heightAt(world, Math.floor(me.x), Math.floor(me.y));
    me.z += (gz - me.z) * Math.min(1, dt * 14);

    const cam = renderer.cam;
    const k = Math.min(1, dt * 5);
    cam.x += (me.x - cam.x) * k; cam.y += (me.y - cam.y) * k; cam.z += (me.z - cam.z) * k;

    handle(sim.tick(now));
    if (dirty && t - lastSave > 4000) { save(); lastSave = t; }
    renderer.render(world, [me], marker, now, dt);
  } else if (world) {
    // Demo island drifts in a slow circle.
    const a = t / 9000;
    renderer.cam.x = world.spawn.x + Math.cos(a) * 6;
    renderer.cam.y = world.spawn.y + Math.sin(a) * 6;
    renderer.render(world, [], null, now, dt);
  }
  requestAnimationFrame(frame);
}

showDemo();
renderTitle();
requestAnimationFrame(frame);
