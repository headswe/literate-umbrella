// Boot, game loop, input and HUD.
import { ITEMS, ITEM_ORDER, AVATARS, ISLAND_NAMES, T } from './data.js';
import { Sim, newWorldSave, loadWorld, toSave, heightAt, isWalkable, canStep, ensurePlayer, toolFor, tileAt } from './sim.js';
import { Renderer3D } from './render3d.js';
import { findPath } from './path.js';
import { sfx, unlockAudio, setMuted, isMuted } from './audio.js';
import * as store from './storage.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new Renderer3D(canvas, $('overlay'));

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
const kindOf = (a) => (AVATARS.find((v) => v.id === a || v.icon === a) || AVATARS[0]).id;
if (!profile.id) profile.id = 'p' + Math.random().toString(36).slice(2, 10);
const me = {
  id: profile.id, x: 0, y: 0, z: 1, kind: kindOf(profile.avatar), name: profile.name || '',
  angle: 0, moving: false, path: null, action: null, swing: 0, nextAct: 0, sel: 'hand',
};
const inv = () => world.players[me.id].inv;

// ---------------------------------------------------------------- title screen
function renderTitle() {
  const av = $('avatars');
  av.innerHTML = '';
  for (const a of AVATARS) {
    const b = document.createElement('button');
    b.className = 'avatar';
    b.textContent = a.icon;
    b.setAttribute('aria-label', a.name);
    b.setAttribute('aria-pressed', String(a.id === me.kind));
    b.onclick = () => { me.kind = a.id; saveProfile(); renderTitle(); sfx.pop(); };
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
    open.className = 'world-open';
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
  store.storeProfile({ id: me.id, avatar: me.kind, name: me.name });
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
  renderer.setWorld(world);
}

// ---------------------------------------------------------------- game
function startGame(save) {
  unlockAudio();
  saveProfile();
  world = loadWorld(save);
  sim = new Sim(world);
  renderer.setWorld(world);
  const pl = ensurePlayer(world, me.id, { name: me.name, kind: me.kind });
  const saved = pl.x !== undefined ? pl : save.me;
  const pos = saved && isWalkable(world, Math.floor(saved.x), Math.floor(saved.y)) ? saved : world.spawn;
  me.sel = pl.sel && (pl.sel === 'hand' || inv()[pl.sel]) ? pl.sel : 'hand';
  me.x = pos.x; me.y = pos.y; me.z = heightAt(world, Math.floor(me.x), Math.floor(me.y));
  me.path = null; me.action = null; marker = null;
  renderer.target.set(me.x, me.z, me.y);
  renderer.yawTarget = Math.round(renderer.yaw / (Math.PI / 4)) * (Math.PI / 4);
  playing = true;
  $('title').hidden = true;
  $('hud').hidden = false;
  $('islandName').textContent = world.name;
  hintShown = !(inv().wood > 0);
  $('hint').hidden = !hintShown;
  $('bagSheet').hidden = true;
  renderInventory();
  lastSave = performance.now();
}

function save() {
  if (!playing || !world) return;
  Object.assign(world.players[me.id], { x: me.x, y: me.y, sel: me.sel });
  store.storeSave(toSave(world));
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
$('zoomIn').onclick = () => renderer.zoomBy(1.2);
$('zoomOut').onclick = () => renderer.zoomBy(1 / 1.2);
$('rotL').onclick = () => renderer.rotate(-1);
$('rotR').onclick = () => renderer.rotate(1);
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

// ---------------------------------------------------------------- HUD
const iconHTML = (id) => {
  const it = ITEMS[id];
  return `<span class="ic" aria-hidden="true">${it.svg || it.icon}</span>`;
};
const usable = (id) => ITEMS[id].kind === 'tool' || ITEMS[id].kind === 'seed';

// Hotbar: hand, tools and seeds you have. Materials live in the backpack.
function renderInventory() {
  const bag = inv();
  if (me.sel !== 'hand' && !bag[me.sel]) me.sel = 'hand';
  const bar = $('hotbar');
  bar.innerHTML = '';
  for (const id of ITEM_ORDER) {
    if (!usable(id) || (id !== 'hand' && !bag[id])) continue;
    const b = document.createElement('button');
    b.className = 'slot';
    b.dataset.id = id;
    b.setAttribute('aria-label', ITEMS[id].name);
    b.setAttribute('aria-pressed', String(me.sel === id));
    b.innerHTML = iconHTML(id) + (ITEMS[id].kind === 'seed' ? `<span class="n">${bag[id]}</span>` : '');
    b.onclick = () => select(id);
    bar.appendChild(b);
  }
  const bagBtn = document.createElement('button');
  bagBtn.className = 'slot bag';
  bagBtn.id = 'bagBtn';
  bagBtn.setAttribute('aria-label', 'Ryggsäck');
  bagBtn.innerHTML = '<span class="ic">🎒</span>';
  bagBtn.onclick = openBag;
  bar.appendChild(bagBtn);
  if (!$('bagSheet').hidden) renderBag();
}

function renderBag() {
  const bag = inv();
  const use = $('bagUse'), things = $('bagThings');
  use.innerHTML = ''; things.innerHTML = '';
  for (const id of ITEM_ORDER) {
    const n = id === 'hand' ? 1 : bag[id] || 0;
    if (!n) continue;
    const b = document.createElement('button');
    b.className = 'bag-item';
    b.innerHTML = `${iconHTML(id)}<span></span><span class="cnt"></span>`;
    b.children[1].textContent = ITEMS[id].name;
    b.children[2].textContent = ITEMS[id].kind === 'tool' ? '' : '× ' + n;
    if (usable(id)) {
      b.setAttribute('aria-pressed', String(me.sel === id));
      b.onclick = () => { select(id); closeBag(); };
      use.appendChild(b);
    } else {
      b.disabled = true;
      things.appendChild(b);
    }
  }
  if (!things.children.length) things.innerHTML = '<p class="small-note">Tomt än så länge. Samla trä, sten och blommor!</p>';
}

function openBag() { $('bagSheet').hidden = false; renderBag(); sfx.pop(); }
function closeBag() { $('bagSheet').hidden = true; }
$('bagClose').onclick = closeBag;
$('bagSheet').addEventListener('pointerdown', (e) => { if (e.target === $('bagSheet')) closeBag(); });

function select(id) {
  me.sel = id;
  sfx.pop();
  for (const b of $('hotbar').children) if (b.dataset.id) b.setAttribute('aria-pressed', String(b.dataset.id === id));
  const tips = { hoe: 'Tryck på gräset för att göra jord', axe: 'Tryck på ett träd för att hugga', pickaxe: 'Tryck på en sten för att hacka' };
  if (ITEMS[id].kind === 'seed') toast('Tryck på jorden för att plantera');
  else if (tips[id]) toast(tips[id]);
}

function bump(id) {
  renderInventory();
  const target = usable(id) ? [...$('hotbar').children].find((b) => b.dataset.id === id) : $('bagBtn');
  if (!target) return;
  target.classList.remove('bump');
  void target.offsetWidth;
  target.classList.add('bump');
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
const SAY = {
  noapples: 'Inga äpplen just nu 🍎 Hugg med yxan 🪓?',
  needsoil: 'Gör jord först med jordhackan',
  needtool: 'Du behöver rätt verktyg',
};

function handle(patches) {
  for (const p of patches) {
    if (p.k === 'obj') { dirty = true; renderer.markDirty(); }
    if (p.k === 'inv') { dirty = true; if (p.pid === me.id) bump(p.item); }
    if (p.k !== 'fx') continue;
    const z = heightAt(world, p.x, p.y);
    const mine = p.by === me.id;
    switch (p.fx) {
      case 'gain': {
        const show = () => renderer.floatText(p.x, p.y, z, ITEMS[p.item].svg ? '🌱' : ITEMS[p.item].icon, '+' + p.n);
        if (p.delay) setTimeout(show, p.delay); else show();
        if (p.delay) break;
        renderer.shake(p.x, p.y, Date.now());
        renderer.burst(p.x, p.y, z, BURST[p.obj] || '#fff', p.obj === 'flower' || p.obj === 'shell' ? 6 : 10);
        if (mine) {
          if (p.obj === 'rock') sfx.clink(); else if (p.obj === 'flower' || p.obj === 'shell') sfx.pop(); else sfx.chop();
          setTimeout(sfx.gain, 120);
        }
        if (hintShown && mine) { hintShown = false; $('hint').hidden = true; }
        break;
      }
      case 'fell':
        renderer.fall(p.x, p.y, p.obj, Date.now());
        renderer.burst(p.x, p.y, z + 1, BURST[p.obj] || '#5cbf52', 24);
        renderer.burst(p.x, p.y, z, '#8a5a34', 8);
        if (mine) sfx.fell();
        break;
      case 'break':
        renderer.burst(p.x, p.y, z, '#b4bcc4', 20);
        if (mine) sfx.crumble();
        break;
      case 'till':
        renderer.burst(p.x, p.y, z - 0.6, '#6b4329', 12);
        if (mine) sfx.dig();
        break;
      case 'plant':
        renderer.burst(p.x, p.y, z - 0.5, '#63c759', 8);
        if (mine) sfx.plant();
        break;
      case 'grown':
        renderer.burst(p.x, p.y, z + 1, '#63c759', 16);
        sfx.grow();
        break;
      default:
        if (mine) {
          renderer.shake(p.x, p.y, Date.now());
          sfx.nope();
          if (SAY[p.fx]) toast(SAY[p.fx]);
        }
    }
  }
}

// ---------------------------------------------------------------- actions
function near(tx, ty) {
  return Math.abs(Math.floor(me.x) - tx) <= 1 && Math.abs(Math.floor(me.y) - ty) <= 1;
}

function face(dx, dy) {
  if (dx || dy) me.angle = Math.atan2(dx, dy);
}

function doUse(tx, ty, item) {
  const t = performance.now();
  if (t < me.nextAct) return;
  me.nextAct = t + ACT_COOLDOWN;
  face(tx + 0.5 - me.x, ty + 0.5 - me.y);
  me.swing = Date.now() + 200;
  handle(sim.act({ type: 'use', x: tx, y: ty, item, by: me.id }));
}

// Walk next to a tile, then use an item on it.
function goUse(x, y, item) {
  if (near(x, y)) { me.path = null; marker = null; doUse(x, y, item); return; }
  const path = findPath(world, Math.floor(me.x), Math.floor(me.y),
    (ax, ay) => Math.abs(ax - x) <= 1 && Math.abs(ay - y) <= 1, x, y);
  if (!path) { sfx.nope(); return; }
  me.path = path; me.action = { x, y, item }; marker = null;
}

function tapAt(sx, sy) {
  if (!playing) return;
  const hit = renderer.pick(sx, sy);
  if (!hit) return;
  const { x, y, obj } = hit;
  const sel = me.sel;
  const kind = ITEMS[sel].kind;

  // Seeds go in soil, the hoe works on grass.
  if (kind === 'seed' && obj && obj.type === 'soil') return goUse(x, y, sel);
  if (sel === 'hoe' && (!obj || obj.type === 'flower') && tileAt(world, x, y)?.t === T.GRASS) return goUse(x, y, 'hoe');

  // Trees, rocks, flowers: pick the right tool by itself so little hands don't get stuck.
  const tool = toolFor(obj, sel);
  if (tool) {
    if (tool !== 'hand' && !inv()[tool]) { sfx.nope(); toast(SAY.needtool); return; }
    if (tool !== sel && tool !== 'hand') select(tool);
    return goUse(x, y, tool);
  }
  if (kind === 'seed' && !(obj && obj.type === 'soil')) toast(SAY.needsoil);

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
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x) };
    hold = null;
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX; p.y = e.clientY;
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    renderer.zoomBy(d / pinch.d);
    pinch.d = d;
    // Twisting two fingers turns the camera.
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    let da = ang - pinch.a;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    renderer.yawTarget -= da;
    renderer.yaw -= da;
    pinch.a = ang;
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
  if (pinch) {
    if (pointers.size === 0) {
      pinch = null;
      renderer.yawTarget = Math.round(renderer.yaw / (Math.PI / 4)) * (Math.PI / 4);
    }
    return;
  }
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
  renderer.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
}, { passive: false });

const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'q') return renderer.rotate(-1);
  if (k === 'e') return renderer.rotate(1);
  keys.add(k);
  me.path = null; marker = null;
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', () => renderer.resize());

function freeMove(dir, dt) {
  const step = SPEED * dt;
  const tryMove = (nx, ny) => {
    const cx = Math.floor(me.x), cy = Math.floor(me.y);
    // Look a bit ahead so we don't walk into trees.
    const lx = Math.floor(nx + Math.sign(nx - me.x) * 0.22), ly = Math.floor(ny + Math.sign(ny - me.y) * 0.22);
    if ((lx !== cx || ly !== cy) && !canStep(world, cx, cy, lx, ly)) return false;
    me.x = nx; me.y = ny;
    return true;
  };
  const moved = tryMove(me.x + dir.x * step, me.y + dir.y * step)
    || tryMove(me.x + dir.x * step, me.y)
    || tryMove(me.x, me.y + dir.y * step);
  if (moved) face(dir.x, dir.y);
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
    let dir = null;
    if (keys.size) {
      let f = 0, r = 0;
      if (keys.has('arrowup') || keys.has('w')) f += 1;
      if (keys.has('arrowdown') || keys.has('s')) f -= 1;
      if (keys.has('arrowleft') || keys.has('a')) r -= 1;
      if (keys.has('arrowright') || keys.has('d')) r += 1;
      if (f || r) {
        const { fwd, right } = renderer.camAxes();
        const x = fwd.x * f + right.x * r, y = fwd.y * f + right.y * r, l = Math.hypot(x, y);
        dir = { x: x / l, y: y / l };
      }
    } else if (hold) {
      const g = renderer.groundPoint(hold.x, hold.y, me.z + 0.4);
      if (g) {
        const dx = g.x - me.x, dy = g.y - me.y, l = Math.hypot(dx, dy);
        if (l > 0.35) dir = { x: dx / l, y: dy / l };
      }
    }
    if (dir) me.moving = freeMove(dir, dt);
    else if (me.path && me.path.length) {
      const n = me.path[0];
      const tx = n.x + 0.5, ty = n.y + 0.5;
      const dx = tx - me.x, dy = ty - me.y, d = Math.hypot(dx, dy);
      const step = SPEED * dt;
      if (d <= step) { me.x = tx; me.y = ty; me.path.shift(); } else { me.x += dx / d * step; me.y += dy / d * step; }
      face(dx, dy);
      me.moving = true;
    } else if (me.path) {
      me.path = null;
      marker = null;
      if (me.action) { const a = me.action; me.action = null; doUse(a.x, a.y, a.item); }
    }
    if (me.moving && (stepTimer -= dt) < 0) { stepTimer = 0.28; sfx.step(); }

    const gz = heightAt(world, Math.floor(me.x), Math.floor(me.y));
    me.z += (gz - me.z) * Math.min(1, dt * 14);

    const pl = world.players[me.id];
    pl.x = me.x; pl.y = me.y;
    handle(sim.tick(now));
    if (dirty && t - lastSave > 4000) { save(); lastSave = t; }
    renderer.render({ players: [me], marker, focus: me, t: t / 1000, dt, now });
  } else if (world) {
    renderer.yawTarget += dt * 0.12;
    renderer.render({ focus: { x: world.spawn.x, y: world.spawn.y, z: 1 }, t: t / 1000, dt, now });
  }
  requestAnimationFrame(frame);
}

showDemo();
renderTitle();
requestAnimationFrame(frame);

// Test hook for automated browser checks: open the game with ?debug.
if (/[?&]debug\b/.test(location.search)) window.__myson = { renderer, me, get world() { return world; } };
