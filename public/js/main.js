// Boot, game loop, input and HUD.
import { ITEMS, ITEM_ORDER, AVATARS, ISLAND_NAMES, T, BUILDS, BUILD_CATS, VILLAGERS } from './data.js';
import { Sim, newWorldSave, loadWorld, toSave, heightAt, isWalkable, canStep, ensurePlayer, toolFor, tileAt, canAfford, applyPatch } from './sim.js';
import { connect } from './net.js';
import * as p2p from './p2p.js';
import { speak, stopSpeaking, unlockSpeech, isSpeaking } from './speech.js';
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
let sim = null;       // only in single player; the server runs it on shared islands
let net = null;       // connection to the island server, when there is one
let shared = null;    // id of the shared island we are on
let link = null;      // where our moves go on a shared island: the server, or a friend's device
let hosting = null;   // set while friends play on our island over WebRTC
const guests = new Map(); // their connection -> player
const remotes = new Map();
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
  angle: 0, moving: false, path: null, action: null, swing: 0, nextAct: 0, sel: 'hand', rot: 0,
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
    row.append(open);
    if (netOnline) {
      const share = document.createElement('button');
      share.className = 'del';
      share.textContent = '📡';
      share.setAttribute('aria-label', 'Dela ' + w.name + ' med alla på wifi:t');
      share.onclick = () => { const s = store.loadSave(w.id); if (s) { net.send({ t: 'upload', save: s }); toast2('Delar ' + w.name + '…'); } };
      row.append(share);
    }
    row.append(del);
    wl.appendChild(row);
  }
  renderShared();
}

// ---------------------------------------------------------------- shared islands (LAN)
let netOnline = false;
let serverWorlds = [];

function renderShared() {
  $('sharedWrap').hidden = !netOnline;
  if (!netOnline) return;
  const wl = $('sharedWorlds');
  wl.innerHTML = '';
  for (const w of serverWorlds) {
    const b = document.createElement('button');
    b.className = 'world world-open shared';
    b.innerHTML = `<span>🌍</span><span></span><span class="when"></span>`;
    b.children[1].textContent = w.name;
    b.children[2].textContent = w.online ? `${w.online} spelar nu` : ago(w.saved);
    b.onclick = () => joinShared(w.id);
    wl.appendChild(b);
  }
  if (!serverWorlds.length) wl.innerHTML = '<p class="small-note">Inga gemensamma öar än. Gör en ny!</p>';
}

function toast2(text) { const n = $('netNote'); n.textContent = text; }

function joinShared(id) {
  unlockAudio();
  saveProfile();
  shared = id;
  link = net;
  net.send({ t: 'join', world: id, player: { id: me.id, name: me.name, kind: me.kind } });
  toast2('Ansluter…');
}

function onNet(m) {
  if (m.t === 'worlds') { serverWorlds = m.list; renderShared(); }
  else if (m.t === 'created') { toast2('Klart! Ön finns nu under Tillsammans.'); }
  else if (m.t === 'joined') {
    remotes.clear();
    for (const o of m.others) remotes.set(o.id, { ...o, rx: o.x, ry: o.y });
    startGame(m.save, true);
    toast2('');
  } else if (m.t === 'hi') {
    remotes.set(m.p.id, { ...m.p, rx: m.p.x, ry: m.p.y });
    if (playing) toast(`${m.p.name || 'En kompis'} kom till ön! 👋`);
  } else if (m.t === 'bye') {
    const r = remotes.get(m.id);
    remotes.delete(m.id);
    if (playing && r) toast(`${r.name || 'En kompis'} gick hem`);
  } else if (m.t === 'pos') {
    const r = remotes.get(m.id);
    if (r) Object.assign(r, m);
  } else if (m.t === 'patches' && playing && shared) {
    for (const p of m.ps) applyPatch(world, p);
    handle(m.ps);
  }
}

function onNetStatus(up) {
  const was = netOnline;
  netOnline = up;
  if (up) {
    net.send({ t: 'list' });
    // Back after a hiccup: hop onto the same island again.
    if (playing && shared && link === net && !was) net.send({ t: 'join', world: shared, player: { id: me.id, name: me.name, kind: me.kind } });
  }
  if (!playing) renderTitle();
  if (playing && shared && link === net && !up) toast('Tappade kontakten med servern…');
}

// Only the island server answers this; inside an artifact or a plain file it fails quietly.
fetch('api/hello').then((r) => (r.ok ? r.json() : null)).then((j) => {
  if (j && j.myson) net = connect(onNet, onNetStatus);
}).catch(() => {});

// ---------------------------------------------------------------- friends over WebRTC (phone to phone)
const clean = (p) => ({
  id: String(p?.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 20) || 'p' + Math.random().toString(36).slice(2, 8),
  name: String(p?.name || '').slice(0, 14),
  kind: kindOf(String(p?.kind || '')),
});
const myInfo = () => ({ id: me.id, name: me.name, kind: me.kind, x: me.x, y: me.y, z: me.z, angle: me.angle });

async function startHosting() {
  if (hosting || shared || !playing) return;
  $('inviteBtn').disabled = true;
  toast('Gör en kod…');
  try {
    hosting = await p2p.host(onGuest, onGuestLeft);
  } catch {
    toast('Det gick inte att bjuda in just nu 😕');
    $('inviteBtn').disabled = false;
    return;
  }
  $('inviteBtn').disabled = false;
  showInvite();
  speak('Koden är ' + hosting.code.replace('-', ' '));
}

function stopHosting() {
  if (!hosting) return;
  hosting.close();
  hosting = null;
  guests.clear();
  remotes.clear();
  showInvite();
}

function showInvite() {
  const pill = $('inviteCode');
  pill.hidden = !hosting;
  $('inviteBtn').hidden = !!shared;
  $('inviteBtn').setAttribute('aria-pressed', String(!!hosting));
  if (!hosting) return;
  const n = guests.size;
  pill.innerHTML = `Kod: <b></b><span></span>`;
  pill.children[0].textContent = hosting.code;
  pill.children[1].textContent = n ? ` · ${n} ${n === 1 ? 'kompis' : 'kompisar'} här` : ' · väntar på kompisar';
}

function onGuest(conn, m) {
  if (!playing || !hosting || !m || typeof m !== 'object') return;
  if (m.t === 'join') {
    const p = clean(m.player);
    guests.set(conn, p);
    ensurePlayer(world, p.id, { name: p.name, kind: p.kind });
    dirty = true;
    const others = [myInfo(), ...[...guests.values()].filter((g) => g !== p).map((g) => ({ ...g, ...remotes.get(g.id) }))];
    hosting.send(conn, { t: 'joined', save: toSave(world), others });
    hosting.broadcast({ t: 'hi', p }, conn);
    remotes.set(p.id, { ...p, x: world.spawn.x, y: world.spawn.y, z: 1, rx: world.spawn.x, ry: world.spawn.y });
    toast(`${p.name || 'En kompis'} kom till ön! 👋`);
    sfx.gain();
    showInvite();
    return;
  }
  const p = guests.get(conn);
  if (!p) return;
  if (m.t === 'act' && m.a && typeof m.a === 'object') {
    share(sim.act({ ...m.a, by: p.id }));
  } else if (m.t === 'pos') {
    const pos = { x: +m.x || 0, y: +m.y || 0, z: +m.z || 0, angle: +m.angle || 0, moving: !!m.moving, swing: +m.swing || 0 };
    const r = remotes.get(p.id);
    if (r) Object.assign(r, pos);
    const pl = world.players[p.id];
    if (pl) { pl.x = pos.x; pl.y = pos.y; }
    hosting.broadcast({ t: 'pos', id: p.id, ...pos }, conn);
  } else if (m.t === 'leave') {
    conn.close();
  }
}

function onGuestLeft(conn) {
  const p = guests.get(conn);
  if (!p) return;
  guests.delete(conn);
  remotes.delete(p.id);
  hosting?.broadcast({ t: 'bye', id: p.id });
  if (playing) toast(`${p.name || 'En kompis'} gick hem`);
  save();
  showInvite();
}

async function joinFriend() {
  const code = $('joinCode').value.trim();
  const note = $('joinNote');
  if (!code) { $('joinCode').focus(); return; }
  unlockAudio();
  saveProfile();
  note.textContent = 'Letar efter ön…';
  $('joinBtn').disabled = true;
  let conn;
  try {
    conn = await p2p.join(code, onNet, () => {
      if (link !== conn) return;
      // goHome while still marked as a guest, so the friend's island is not saved as our own.
      if (playing) { goHome(); $('joinNote').textContent = 'Kompisen stängde sin ö.'; }
      else { shared = null; link = null; }
    });
  } catch {
    note.textContent = 'Hittade ingen ö med den koden. Kolla koden och att kompisen har ön öppen.';
    $('joinBtn').disabled = false;
    return;
  }
  $('joinBtn').disabled = false;
  note.textContent = 'Hittade ön! Går in…';
  stopHosting();
  shared = 'friend:' + code;
  link = conn;
  conn.send({ t: 'join', player: { id: me.id, name: me.name, kind: me.kind } });
}

$('joinBtn').onclick = joinFriend;
$('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinFriend(); });
$('inviteBtn').onclick = () => (hosting ? toast('Koden är ' + hosting.code) : startHosting());

$('newShared').onclick = () => { net.send({ t: 'create' }); toast2('Skapar en ny ö…'); };

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
function startGame(save, onServer = false) {
  unlockAudio();
  saveProfile();
  if (!onServer) { shared = null; remotes.clear(); }
  world = loadWorld(save);
  sim = onServer ? null : new Sim(world);
  renderer.setWorld(world);
  const pl = ensurePlayer(world, me.id, { name: me.name, kind: me.kind });
  const saved = pl.x !== undefined ? pl : save.me;
  const pos = saved && isWalkable(world, Math.floor(saved.x), Math.floor(saved.y)) ? saved : world.spawn;
  me.sel = pl.sel && (pl.sel === 'hand' || inv()[pl.sel] || pl.sel.startsWith('build:') || pl.sel === 'pickup') ? pl.sel : 'hand';
  $('rotBuild').hidden = !me.sel.startsWith('build:');
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
  $('buildSheet').hidden = true;
  $('talkSheet').hidden = true;
  ensureThumbs();
  vilPos.clear();
  renderInventory();
  showInvite();
  lastSave = performance.now();
}

function save() {
  if (!playing || !world || shared) return;
  Object.assign(world.players[me.id], { x: me.x, y: me.y, sel: me.sel });
  store.storeSave(toSave(world));
  dirty = false;
}

function goHome() {
  save();
  if (shared) { link?.send({ t: 'leave' }); if (link !== net) link?.close(); shared = null; link = null; remotes.clear(); }
  stopHosting();
  showDemo();
  $('hud').hidden = true;
  $('title').hidden = false;
  renderTitle();
}

$('homeBtn').onclick = goHome;
$('muteBtn').onclick = () => {
  setMuted(!isMuted());
  $('muteBtn').textContent = isMuted() ? '🔇' : '🔊';
  try { localStorage.setItem('myson.muted', isMuted() ? '1' : '0'); } catch { /* ignore */ }
  if (isMuted()) stopSpeaking();
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
  if (ITEMS[me.sel] && me.sel !== 'hand' && !bag[me.sel]) me.sel = 'hand';
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
  // Build button, plus the thing you are building right now.
  if (me.sel.startsWith('build:') || me.sel === 'pickup') {
    const b = document.createElement('button');
    b.className = 'slot';
    b.dataset.id = me.sel;
    b.setAttribute('aria-pressed', 'true');
    if (me.sel === 'pickup') { b.innerHTML = '<span class="ic">♻️</span>'; b.setAttribute('aria-label', 'Plocka upp'); }
    else {
      const id = me.sel.slice(6);
      b.setAttribute('aria-label', BUILDS[id].name);
      b.innerHTML = thumbs[id] ? `<img class="thumb" src="${thumbs[id]}" alt="">` : '<span class="ic">🧱</span>';
    }
    b.onclick = openBuild;
    bar.appendChild(b);
  }
  const buildBtn = document.createElement('button');
  buildBtn.className = 'slot build';
  buildBtn.setAttribute('aria-label', 'Bygg');
  buildBtn.innerHTML = '<span class="ic">🔨</span>';
  buildBtn.onclick = openBuild;
  bar.appendChild(buildBtn);
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

// ---------------------------------------------------------------- build menu
let thumbs = {};
function costText(id) {
  const need = Object.entries(BUILDS[id].cost).map(([k, n]) => `${n} ${ITEMS[k].icon}`).join(' + ');
  return `${BUILDS[id].name} kostar ${need}`;
}

function ensureThumbs() {
  if (Object.keys(thumbs).length) return;
  try { thumbs = renderer.thumbnails(Object.keys(BUILDS).filter((id) => BUILDS[id].cat !== 'hidden'), BUILDS); } catch { thumbs = {}; }
}

function openBuild() {
  ensureThumbs();
  renderBuild();
  $('buildSheet').hidden = false;
  sfx.pop();
}
function closeBuild() { $('buildSheet').hidden = true; }

function renderBuild() {
  const bag = inv();
  const list = $('buildList');
  list.innerHTML = '';
  for (const cat of BUILD_CATS) {
    const h = document.createElement('p');
    h.className = 'label';
    h.textContent = cat.name;
    const grid = document.createElement('div');
    grid.className = 'bag-grid';
    for (const [id, def] of Object.entries(BUILDS)) {
      if (def.cat !== cat.id) continue;
      const ok = canAfford(bag, def.cost);
      const b = document.createElement('button');
      b.className = 'bag-item build-item' + (ok ? '' : ' poor');
      b.setAttribute('aria-pressed', String(me.sel === 'build:' + id));
      b.innerHTML = `${thumbs[id] ? `<img class="thumb" src="${thumbs[id]}" alt="">` : '<span class="ic">🧱</span>'}<span class="nm"></span><span class="cost"></span>`;
      b.querySelector('.nm').textContent = def.name;
      b.querySelector('.cost').innerHTML = Object.entries(def.cost)
        .map(([k, n]) => `<span class="${(bag[k] || 0) >= n ? '' : 'short'}">${n}${ITEMS[k].icon}</span>`).join('');
      b.onclick = () => { select('build:' + id); renderInventory(); closeBuild(); };
      grid.appendChild(b);
    }
    list.append(h, grid);
  }
}
$('buildClose').onclick = closeBuild;
$('buildSheet').addEventListener('pointerdown', (e) => { if (e.target === $('buildSheet')) closeBuild(); });
$('pickupBtn').onclick = () => { select('pickup'); renderInventory(); closeBuild(); };
$('buildStop').onclick = () => { select('hand'); renderInventory(); closeBuild(); };
$('rotBuild').onclick = () => { me.rot = (me.rot + 1) % 4; sfx.pop(); toast('Vriden ↻'); };

function openBag() { $('bagSheet').hidden = false; renderBag(); sfx.pop(); }
function closeBag() { $('bagSheet').hidden = true; }
$('bagClose').onclick = closeBag;
$('bagSheet').addEventListener('pointerdown', (e) => { if (e.target === $('bagSheet')) closeBag(); });

function select(id) {
  me.sel = id;
  sfx.pop();
  for (const b of $('hotbar').children) if (b.dataset.id) b.setAttribute('aria-pressed', String(b.dataset.id === id));
  $('rotBuild').hidden = !id.startsWith('build:');
  if (hintShown) { hintShown = false; $('hint').hidden = true; }
  const tips = { hoe: 'Tryck på gräset för att göra jord', axe: 'Tryck på ett träd för att hugga', pickaxe: 'Tryck på en sten för att hacka', pickup: 'Tryck på något du byggt för att plocka upp det' };
  if (ITEMS[id]?.kind === 'seed') toast('Tryck på jorden för att plantera');
  else if (id.startsWith('build:')) toast('Tryck där du vill bygga');
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
  occupied: 'Här står redan något',
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
      case 'built':
        renderer.burst(p.x, p.y, heightAt(world, p.x, p.y) - 1, '#c99a63', 10);
        if (mine) sfx.build();
        break;
      case 'pickedup':
        renderer.burst(p.x, p.y, z - 0.5, '#ffffff', 8);
        if (mine) sfx.pop();
        break;
      case 'wishdone': {
        const info = VIL[p.vid];
        const vp = vilPos.get(p.vid);
        if (vp) { vp.swing = Date.now() + 400; renderer.burst(vp.x - 0.5, vp.y - 0.5, vp.z, '#ff7eb6', 18); renderer.floatText(vp.x - 0.5, vp.y - 0.5, vp.z, '⭐', '+' + p.stars); }
        sfx.grow();
        if (mine) {
          const msg = `Tack så jättemycket! Här får du ${p.stars} ${p.stars > 1 ? 'stjärnor' : 'stjärna'} och ${amount(p.gift, 2)}!`;
          if (talking === p.vid) { $('talkText').textContent = msg; $('talkGive').hidden = true; $('talkHearts').textContent = '❤️'.repeat(Math.min(10, world.villagers[p.vid].hearts)); }
          else toast(`${info.name} blev jätteglad! ⭐`);
          say(p.vid, msg);
        }
        break;
      }
      case 'notenough':
        if (mine) { sfx.nope(); toast(`Du behöver ${amount(p.item, p.n)}`); }
        break;
      case 'movein': {
        const info = VIL[p.vid];
        renderer.burst(p.x, p.y, z + 1, '#ffd23f', 30);
        sfx.grow();
        toast(`${info.name} har flyttat in! 🏠`);
        // The bubble shows once they have walked out; the voice starts right away.
        setTimeout(() => say(p.vid, `Hej allihop! Jag heter ${info.name}. Nu bor jag här på ön!`), 600);
        break;
      }
      case 'someonelives':
        if (mine) { sfx.nope(); toast(`${VIL[p.vid].name} bor här!`); }
        break;
      case 'noroom':
        if (mine) { sfx.nope(); toast('Det behövs plats: 2 × 2 platt mark'); }
        break;
      case 'cantafford':
        if (mine) { sfx.nope(); toast(costText(p.id)); }
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

// On a shared island the server decides; alone, the local rules do.
function act(a) {
  if (shared) link.send({ t: 'act', a });
  else share(sim.act(a));
}

// Run patches here, and pass them on to friends playing on our island.
function share(ps) {
  handle(ps);
  if (hosting && ps.length) hosting.broadcast({ t: 'patches', ps });
}

function goTalk(vid) {
  const v = world.villagers[vid];
  const vx = Math.floor(v.tx), vy = Math.floor(v.ty);
  goAct(vx, vy, { type: 'talk', vid });
}

function doAct(tx, ty, what) {
  if (what.type === 'talk') {
    const v = world.villagers[what.vid];
    face(v.x - me.x, v.y - me.y);
    openTalk(what.vid);
    return;
  }
  const t = performance.now();
  if (t < me.nextAct) return;
  me.nextAct = t + ACT_COOLDOWN;
  face(tx + 0.5 - me.x, ty + 0.5 - me.y);
  me.swing = Date.now() + 200;
  act({ ...what, x: tx, y: ty, by: me.id });
}

// Walk next to a tile, then do something to it.
function goAct(x, y, act) {
  if (near(x, y)) { me.path = null; marker = null; doAct(x, y, act); return; }
  const path = findPath(world, Math.floor(me.x), Math.floor(me.y),
    (ax, ay) => Math.abs(ax - x) <= 1 && Math.abs(ay - y) <= 1, x, y);
  if (!path) { sfx.nope(); return; }
  me.path = path; me.action = { x, y, act }; marker = { x, y };
}
const goUse = (x, y, item) => goAct(x, y, { type: 'use', item });

function tapAt(sx, sy) {
  if (!playing) return;
  const actor = renderer.pickActor(sx, sy);
  if (actor && actor.startsWith('v:')) return goTalk(actor.slice(2));
  const hit = renderer.pick(sx, sy);
  if (!hit) return;
  let { x, y, obj } = hit;
  if (obj && obj.type === 'part') { [x, y] = obj.of.split(',').map(Number); obj = world.objects[obj.of]; }
  const sel = me.sel;
  const kind = ITEMS[sel]?.kind;

  // Building: place the chosen thing, or pick things up again.
  if (sel.startsWith('build:')) {
    const id = sel.slice(6);
    if (!obj || obj.type === 'flower' || obj.type === 'shell' || (obj.type === 'build' && obj.id === id && BUILDS[id].stack)) {
      if (!canAfford(inv(), BUILDS[id].cost)) { sfx.nope(); toast(costText(id)); return; }
      return goAct(x, y, { type: 'build', id, rot: me.rot });
    }
    if (obj.type === 'build') return goAct(x, y, { type: 'pickup' });
  }
  if (sel === 'pickup') {
    if (obj && obj.type === 'build') return goAct(x, y, { type: 'pickup' });
  }

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

// ---------------------------------------------------------------- other players
let lastPos = 0, lastSent = '';
function sendPos(t) {
  if (t - lastPos < 100) return;
  lastPos = t;
  const msg = { t: 'pos', x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), angle: +me.angle.toFixed(2), moving: me.moving, swing: me.swing };
  const sig = JSON.stringify(msg);
  if (sig === lastSent && !me.moving) return;
  lastSent = sig;
  if (hosting) hosting.broadcast({ ...msg, id: me.id });
  else link.send(msg);
}

function remoteActors(dt) {
  const out = [];
  for (const r of remotes.values()) {
    const k = Math.min(1, dt * 12);
    r.rx += (r.x - r.rx) * k; r.ry += (r.y - r.ry) * k;
    if (Math.hypot(r.x - r.rx, r.y - r.ry) > 4) { r.rx = r.x; r.ry = r.y; }
    out.push({ id: 'p:' + r.id, kind: r.kind, x: r.rx, y: r.ry, z: r.z, angle: r.angle, moving: r.moving, name: r.name || '🙂', swing: r.swing });
  }
  return out;
}

// ---------------------------------------------------------------- villagers
const vilPos = new Map();
const VIL = Object.fromEntries(VILLAGERS.map((v) => [v.id, v]));
const VIL_SPEED = 1.6;

function wishBubble(v) {
  const w = v.wish;
  if (!w) return '<span class="think">💭</span>';
  if (w.kind === 'give') return `${ITEMS[w.item].icon}<b>×${w.n}</b>`;
  return thumbs[w.id] ? `<img src="${thumbs[w.id]}" alt="">` : '🔨';
}

// Smoothly walk each villager toward the tile the rules picked for them.
function villagerActors(dt) {
  const out = [];
  for (const v of Object.values(world.villagers || {})) {
    let p = vilPos.get(v.id);
    if (!p) { p = { x: v.x, y: v.y, angle: 0 }; vilPos.set(v.id, p); }
    const dx = v.tx - p.x, dy = v.ty - p.y, d = Math.hypot(dx, dy);
    const step = VIL_SPEED * dt;
    let moving = false;
    if (d > 3) { p.x = v.tx; p.y = v.ty; }
    else if (d > 0.01) { const k = Math.min(1, step / d); p.x += dx * k; p.y += dy * k; p.angle = Math.atan2(dx, dy); moving = true; }
    p.z = (p.z ?? heightAt(world, Math.floor(p.x), Math.floor(p.y)));
    p.z += (heightAt(world, Math.floor(p.x), Math.floor(p.y)) - p.z) * Math.min(1, dt * 12);
    const bubble = p.sayUntil > Date.now() ? `<span class="say">${escapeHtml(p.sayText)}</span>` : wishBubble(v);
    out.push({ id: 'v:' + v.id, kind: VIL[v.id].kind, x: p.x, y: p.y, z: p.z, angle: p.angle, moving, name: VIL[v.id].name, bubble, swing: p.swing });
  }
  return out;
}

const NUM = ['', '', 'två', 'tre', 'fyra'];
function amount(item, n) { return n === 1 ? ITEMS[item].one : `${NUM[n] || n} ${ITEMS[item].plural}`; }

function wishText(v) {
  const w = v.wish;
  if (!w) return 'Jag funderar på vad jag önskar mig… Kom tillbaka snart!';
  if (w.kind === 'give') return `Kan du ge mig ${amount(w.item, w.n)}? Det skulle göra mig så glad!`;
  const b = BUILDS[w.id];
  return `Jag önskar mig ${b.art || 'en'} ${b.name.toLowerCase()} nära mitt hus. Kan du bygga det?`;
}

const HELLO = ['Hej {namn}!', 'Hejsan {namn}!', 'Åh, hej {namn}!', 'Vad roligt att se dig, {namn}!'];
let talking = null;

// ---------------------------------------------------------------- villagers talking out loud
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const escapeHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const GREET = {
  unicorn: ['Hej {namn}! Vilken magisk dag!', 'Hallå {namn}! Glitter och regnbågar!'],
  bear: ['Mmm, hej {namn}.', 'Nämen, hej {namn}! Har du sett några äpplen?'],
  robot: ['Pip pip! Hej {namn}!', 'Bip bop! Hej {namn}, min kompis!'],
  bunny: ['Hoppsan! Hej {namn}!', 'Hej {namn}! Jag hoppar av glädje!'],
  fox: ['Hej {namn}! Hittar du något kul?', 'Psst, {namn}! Vad gör du?'],
  frog: ['Kvack kvack! Hej {namn}!', 'Hej {namn}! Vattnet är så skönt idag.'],
  pig: ['Nöff! Hej {namn}!', 'Hej {namn}! Jag är lite hungrig.'],
  cat: ['Mjau! Hej {namn}!', 'Hej {namn}. Jag tog just en tupplur.'],
};
const CHAT = ['Vilket fint väder idag!', 'Jag tycker om vår ö.', 'Tryck på mig om du vill prata!', 'Har du sett blommorna?', 'Du är en bra kompis!'];
const BYE = ['Hej då!', 'Vi ses!', 'Hej då, kom snart tillbaka!', 'Ha det så bra!'];
const greetAt = new Map();  // villager id -> when they may greet again
let nextChat = 0;           // nobody starts chatting before this

// A villager says something: out loud in their own voice, and in a speech bubble.
function say(vid, text, polite = false) {
  const p = vilPos.get(vid);
  if (p) { p.sayText = text; p.sayUntil = Date.now() + Math.max(3500, text.length * 110); }
  speak(text, VIL[vid].voice, polite);
}

// Friends say hello when you walk past, now and then, but never all at once.
function greetNearby(now) {
  if (now < nextChat || talking || isSpeaking()) return;
  for (const v of Object.values(world.villagers || {})) {
    const p = vilPos.get(v.id);
    if (!p || Math.hypot(p.x - me.x, p.y - me.y) > 2.6 || (greetAt.get(v.id) || 0) > now) continue;
    const hello = pick(GREET[VIL[v.id].kind] || HELLO).replace('{namn}', me.name || 'kompis');
    say(v.id, Math.random() < 0.35 ? `${hello} ${pick(CHAT)}` : hello, true);
    p.angle = Math.atan2(me.x - p.x, me.y - p.y);
    p.swing = now + 300;
    greetAt.set(v.id, now + 60000);
    nextChat = now + 9000;
    return;
  }
}

function openTalk(vid) {
  const v = world.villagers[vid], info = VIL[vid];
  talking = vid;
  const hello = HELLO[Math.floor(Math.random() * HELLO.length)].replace('{namn}', me.name || 'kompis');
  const text = `${hello} ${wishText(v)}`;
  $('talkFace').textContent = (AVATARS.find((a) => a.id === info.kind) || {}).icon || { bear: '🐻', pig: '🐷' }[info.kind] || '🙂';
  $('talkName').textContent = info.name;
  $('talkHearts').textContent = '❤️'.repeat(Math.min(10, v.hearts)) || '🤍';
  $('talkText').textContent = text;
  const give = $('talkGive');
  if (v.wish?.kind === 'give') {
    const has = (inv()[v.wish.item] || 0) >= v.wish.n;
    give.hidden = false;
    give.disabled = !has;
    give.textContent = has ? `Ge ${v.wish.n} ${ITEMS[v.wish.item].icon}` : `Du har ${inv()[v.wish.item] || 0} av ${v.wish.n} ${ITEMS[v.wish.item].icon}`;
  } else give.hidden = true;
  $('talkSheet').hidden = false;
  speak(text, info.voice);
  greetAt.set(vid, Date.now() + 60000);
  const p = vilPos.get(vid);
  if (p) { p.angle = Math.atan2(me.x - p.x, me.y - p.y); p.swing = Date.now() + 250; }
}

function closeTalk() {
  if ($('talkSheet').hidden) return;
  const vid = talking;
  $('talkSheet').hidden = true;
  talking = null;
  if (vid) say(vid, pick(BYE)); else stopSpeaking();
  nextChat = Date.now() + 6000;
}
$('talkBye').onclick = closeTalk;
$('talkSay').onclick = () => talking && speak($('talkText').textContent, VIL[talking].voice);
$('talkSheet').addEventListener('pointerdown', (e) => { if (e.target === $('talkSheet')) closeTalk(); });
$('talkGive').onclick = () => {
  if (!talking) return;
  act({ type: 'give', vid: talking, by: me.id });
};

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
      if (me.action) {
        const a = me.action; me.action = null;
        // Villagers wander, so aim at where they are now.
        if (a.act.type === 'talk') { const v = world.villagers[a.act.vid]; if (Math.hypot(v.x - me.x, v.y - me.y) > 2.2) goTalk(a.act.vid); else doAct(0, 0, a.act); }
        else doAct(a.x, a.y, a.act);
      }
    }
    if (me.moving && (stepTimer -= dt) < 0) { stepTimer = 0.28; sfx.step(); }

    const gz = heightAt(world, Math.floor(me.x), Math.floor(me.y));
    me.z += (gz - me.z) * Math.min(1, dt * 14);

    const pl = world.players[me.id];
    pl.x = me.x; pl.y = me.y;
    if (sim) share(sim.tick(now));
    if (shared || hosting) sendPos(t);
    if (dirty && t - lastSave > 4000) { save(); lastSave = t; }
    greetNearby(now);
    renderer.render({ players: [me, ...remoteActors(dt), ...villagerActors(dt)], marker, focus: me, t: t / 1000, dt, now });
  } else if (world) {
    renderer.yawTarget += dt * 0.12;
    renderer.render({ focus: { x: world.spawn.x, y: world.spawn.y, z: 1 }, t: t / 1000, dt, now });
  }
  requestAnimationFrame(frame);
}

try {
  if (localStorage.getItem('myson.muted') === '1') { setMuted(true); $('muteBtn').textContent = '🔇'; }
} catch { /* ignore */ }
showDemo();
renderTitle();
requestAnimationFrame(frame);

// Speech on iPad and iPhone has to be started from a tap.
for (const ev of ['click', 'touchend']) document.addEventListener(ev, unlockSpeech, { capture: true, passive: true });

// Test hook for automated browser checks: open the game with ?debug.
if (/[?&]debug\b/.test(location.search)) window.__myson = { renderer, me, remotes, act, vilPos, get world() { return world; }, get sim() { return sim; }, get shared() { return shared; } };
