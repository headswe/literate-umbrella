// Game rules. The sim owns the world and turns player actions into patches.
// In single player it runs in the browser; the LAN server will run the same code.
import { NATURE, ITEMS, STARTER_KIT, ALWAYS_TOOLS, MAX_HEIGHT, RECIPES, CATCH, BUGS, COLLECTION, CROP_MS, GROW_MS, BUILDS, VILLAGERS, T, WORLD_SIZE, OLD_WORLD_SIZE } from './data.js';
import { generateWorld, key, mulberry32 } from './worldgen.js';

export function newWorldSave(name, seed) {
  const gen = generateWorld(seed, WORLD_SIZE);
  return {
    id: 'w' + seed.toString(36) + Date.now().toString(36),
    name,
    seed,
    size: WORLD_SIZE,
    created: Date.now(),
    version: 2,
    tiles: {},
    players: {},
    objects: gen.objects,
    villagers: {},
  };
}

// The first friend lives in a tent next to where everyone starts.
function settleFirstVillager(w) {
  if (w.villagers && Object.keys(w.villagers).length) return;
  w.villagers = {};
  const sx = Math.floor(w.spawn.x) + 2, sy = Math.floor(w.spawn.y) - 2;
  const k = key(sx, sy);
  w.objects[k] = { type: 'build', id: 'tent', rot: 0, owner: 'stjarna' };
  w.villagers.stjarna = newVillager('stjarna', k, sx + 0.5, sy + 1.5);
}

function newVillager(id, home, x, y) {
  return { id, home, x, y, tx: x, ty: y, hearts: 0, wish: null, nextWish: 0, nextStep: 0 };
}

// Where a villager's front door is, in tile coordinates.
export function doorOf(w, home) {
  const [x, y] = home.split(',').map(Number);
  const o = w.objects[home];
  const size = o ? BUILDS[o.id]?.size || 1 : 1;
  return { x: x + size / 2, y: y + size + 0.5 };
}

// A playable world: the save plus terrain rebuilt from the seed, with dug and filled tiles on top.
export function loadWorld(save) {
  const gen = generateWorld(save.seed, save.size || OLD_WORLD_SIZE);
  const w = { ...save, size: gen.size, terrain: gen.terrain, height: gen.height, spawn: gen.spawn };
  w.tiles = { ...(save.tiles || {}) };
  for (const [k, [t, h]] of Object.entries(w.tiles)) {
    const [x, y] = k.split(',').map(Number);
    if (x >= 0 && y >= 0 && x < w.size && y < w.size) { w.terrain[y * w.size + x] = t; w.height[y * w.size + x] = h; }
  }
  w.players = w.players || {};
  for (const p of Object.values(w.players)) for (const t of ALWAYS_TOOLS) if (!p.inv[t]) p.inv[t] = 1;
  if (!save.version) {
    // Version 1 saves had one shared bag and trees that never fell.
    w.legacyInv = save.inv;
    for (const o of Object.values(w.objects)) {
      if (NATURE[o.type]?.hp > 1) { o.hp = 3; delete o.left; delete o.rest; }
      if (o.type === 'fruittree') o.apples = 3;
    }
    w.version = 2;
  }
  settleFirstVillager(w);
  return w;
}

export function toSave(world) {
  const { id, name, seed, size, created, version, players, objects, villagers, tiles, museum } = world;
  return { id, name, seed, size, created, version, players, objects, villagers, tiles, museum, saved: Date.now() };
}

// Make sure a player has a bag. New players get the starter kit.
export function ensurePlayer(world, pid, info = {}) {
  let p = world.players[pid];
  if (!p) {
    p = world.players[pid] = { inv: { ...STARTER_KIT } };
    if (world.legacyInv) {
      for (const [k, n] of Object.entries(world.legacyInv)) if (ITEMS[k]) p.inv[k] = (p.inv[k] || 0) + n;
      delete world.legacyInv;
    }
  }
  Object.assign(p, info);
  return p;
}

export function tileAt(world, x, y) {
  if (x < 0 || y < 0 || x >= world.size || y >= world.size) return null;
  const i = y * world.size + x;
  return { t: world.terrain[i], h: world.height[i] };
}

// Ground height, counting stacked blocks you can stand on.
export function heightAt(world, x, y) {
  const t = tileAt(world, x, y);
  if (!t) return 0;
  const o = world.objects[key(x, y)];
  return t.h + (o && o.type === 'build' && BUILDS[o.id]?.stack ? o.h || 1 : 0);
}

export function blocks(o) {
  if (!o) return false;
  if (o.type === 'part') return true;
  if (o.type === 'build') { const b = BUILDS[o.id]; return !(b.flat || b.stack); }
  return !!NATURE[o.type]?.blocks;
}

export function isWalkable(world, x, y) {
  const t = tileAt(world, x, y);
  if (!t || t.t === T.WATER) return false;
  return !blocks(world.objects[key(x, y)]);
}

export function canAfford(inv, cost) {
  return Object.entries(cost).every(([k, n]) => (inv[k] || 0) >= n);
}

// You can climb or drop one block at a time, like hopping in Minecraft.
export function canStep(world, ax, ay, bx, by) {
  if (!isWalkable(world, bx, by)) return false;
  return Math.abs(heightAt(world, ax, ay) - heightAt(world, bx, by)) <= 1;
}

// Apples grow back on their own.
export function refresh(o, now) {
  if (o && o.type === 'fruittree' && o.appleRest && o.appleRest <= now) {
    o.apples = NATURE.fruittree.apples;
    delete o.appleRest;
  }
  if (o && o.type === 'berrybush' && o.berryRest && o.berryRest <= now) {
    o.berries = NATURE.berrybush.berries;
    delete o.berryRest;
  }
  return o;
}

// How grown a sapling is, 0..1. Garden plants are quicker than trees.
export function growth(o, now) {
  return Math.max(0, Math.min(1, (now - o.t0) / (NATURE[o.grows]?.crop ? CROP_MS : GROW_MS)));
}

// Which item a tap on this object should use, if the player has it.
export function toolFor(o, selected) {
  if (!o) return null;
  if (o.type === 'fruittree') return selected === 'axe' ? 'axe' : 'hand';
  if (o.type === 'bug') return 'net';
  return NATURE[o.type]?.tool || null;
}

export class Sim {
  constructor(world) {
    this.world = world;
    this.rand = mulberry32((Date.now() ^ world.seed) >>> 0);
    this.nextSpawn = 0;
    this.nextGrow = 0;
  }

  give(out, pid, item, n) {
    const inv = this.world.players[pid].inv;
    put(out, this.world, { k: 'inv', pid, item, n: Math.max(0, (inv[item] || 0) + n) });
  }

  // Returns a list of patches. Every client applies them with applyPatch.
  act(a, now = Date.now()) {
    const w = this.world;
    const pl = w.players[a.by];
    if (!pl) return [];
    if (a.type === 'build') return this.build(a, pl, now);
    if (a.type === 'pickup') return this.pickup(a);
    if (a.type === 'give') return this.giveWish(a, pl, now);
    if (a.type === 'cook') return this.cook(a, pl);
    if (a.type === 'eat') return this.eat(a, pl);
    if (a.type === 'treat') return this.treat(a, pl, now);
    if (a.type === 'donate') return this.donate(a, pl);
    if (a.type !== 'use') return [];
    const item = a.item || 'hand';
    if (item !== 'hand' && !(pl.inv[item] > 0)) return [];
    const k = key(a.x, a.y);
    const o = refresh(w.objects[k], now);
    const def = o && NATURE[o.type];
    const out = [];
    const fx = (name, extra) => put(out, w, { k: 'fx', fx: name, x: a.x, y: a.y, by: a.by, obj: o?.type, ...extra });

    if (item === 'hand') {
      if (o && (o.type === 'flower' || o.type === 'shell')) {
        put(out, w, { k: 'obj', key: k, v: null });
        this.give(out, a.by, def.gives, 1);
        fx('gain', { item: def.gives, n: 1 });
      } else if (o && o.type === 'carrot') {
        // Pull the carrots up; the soil stays for planting again, sometimes with a new seed.
        put(out, w, { k: 'obj', key: k, v: { type: 'soil' } });
        this.give(out, a.by, 'carrot', 2);
        fx('gain', { item: 'carrot', n: 2 });
        if (this.rand() < 0.6) { this.give(out, a.by, 'seed_carrot', 1); fx('gain', { item: 'seed_carrot', n: 1, delay: 350 }); }
      } else if (o && o.type === 'berrybush') {
        if (!o.berries) fx('noberries');
        else {
          const berries = o.berries - 1;
          put(out, w, { k: 'obj', key: k, v: { ...o, berries, ...(berries ? {} : { berryRest: now + def.berryRest }) } });
          this.give(out, a.by, 'berry', 1);
          fx('gain', { item: 'berry', n: 1 });
        }
      } else if (o && o.type === 'fruittree') {
        if (!o.apples) fx('noapples');
        else {
          const apples = o.apples - 1;
          put(out, w, { k: 'obj', key: k, v: { ...o, apples, ...(apples ? {} : { appleRest: now + def.appleRest }) } });
          this.give(out, a.by, 'fruit', 1);
          fx('gain', { item: 'fruit', n: 1 });
        }
      }
    } else if (o && def && def.tool === item) {
      // Axe on trees, pickaxe on rocks: a few hits and it is gone.
      const hp = (o.hp || def.hp) - 1;
      this.give(out, a.by, def.gives, 1);
      fx('gain', { item: def.gives, n: 1 });
      if (hp > 0) {
        put(out, w, { k: 'obj', key: k, v: { ...o, hp } });
      } else {
        put(out, w, { k: 'obj', key: k, v: null });
        fx(o.type === 'rock' ? 'break' : 'fell');
        if (def.seed) {
          const n = this.rand() < 0.5 ? 2 : 1;
          this.give(out, a.by, def.seed, n);
          fx('gain', { item: def.seed, n, delay: 350 });
        } else if (this.rand() < 0.2) {
          this.give(out, a.by, 'star', 1);
          fx('gain', { item: 'star', n: 1, delay: 350 });
        }
      }
    } else if (item === 'hoe') {
      const t = tileAt(w, a.x, a.y);
      if (t && t.t === T.GRASS && (!o || o.type === 'flower')) {
        if (o) { this.give(out, a.by, 'flower', 1); fx('gain', { item: 'flower', n: 1 }); }
        put(out, w, { k: 'obj', key: k, v: { type: 'soil' } });
        fx('till');
      } else fx('nope');
    } else if (item === 'rod') {
      const t = tileAt(w, a.x, a.y);
      if (!t || t.t !== T.WATER) { fx('nope'); return out; }
      let r = this.rand(), got = CATCH[0][0];
      for (const [id, p] of CATCH) { if (r < p) { got = id; break; } r -= p; }
      this.give(out, a.by, got, 1);
      fx('fish', { item: got, n: 1, delay: 1500 + Math.floor(this.rand() * 1200) });
    } else if (item === 'net') {
      if (!o || o.type !== 'bug') { fx('nope'); return out; }
      put(out, w, { k: 'obj', key: k, v: null });
      this.give(out, a.by, o.kind, 1);
      fx('caught', { item: o.kind, n: 1 });
    } else if (item === 'shovel') {
      this.dig(out, a, o, fx);
    } else if (item === 'dirt') {
      this.fill(out, a, o, fx);
    } else if (ITEMS[item]?.kind === 'seed') {
      if (o && o.type === 'soil') {
        put(out, w, { k: 'obj', key: k, v: { type: 'sapling', grows: ITEMS[item].grows, t0: now } });
        this.give(out, a.by, item, -1);
        fx('plant');
      } else fx('needsoil');
    } else {
      fx('nope');
    }
    return out;
  }

  pickBug() {
    let r = this.rand();
    for (const [id, p] of BUGS) { if (r < p) return id; r -= p; }
    return BUGS[0][0];
  }

  // Spade: dig up treasure, turn grass into a dirt road, or dig a road down (a pond at the bottom).
  dig(out, a, o, fx) {
    const w = this.world, k = key(a.x, a.y), t = tileAt(w, a.x, a.y);
    if (o && o.type === 'buried') {
      put(out, w, { k: 'obj', key: k, v: null });
      const loot = ['shell', 'seed_fruit', 'seed_carrot', 'seed_berry', 'seed_pine'][Math.floor(this.rand() * 5)];
      this.give(out, a.by, 'star', 2);
      this.give(out, a.by, loot, 1);
      fx('treasure', { item: 'star', n: 2, loot });
      return;
    }
    if (!t || t.t === T.WATER || (o && o.type !== 'flower')) { fx('nope'); return; }
    if (o) { put(out, w, { k: 'obj', key: k, v: null }); this.give(out, a.by, 'flower', 1); }
    if (t.t === T.GRASS) {
      put(out, w, { k: 'tile', key: k, t: T.DIRT, h: t.h });
      fx('road');
      return;
    }
    put(out, w, t.h > 1 ? { k: 'tile', key: k, t: t.t, h: t.h - 1 } : { k: 'tile', key: k, t: T.WATER, h: 0 });
    this.give(out, a.by, 'dirt', 1);
    fx('dig', { item: 'dirt', n: 1 });
  }

  // Earth: fill a pond, mend a road back to grass, or make a hill one step higher.
  fill(out, a, o, fx) {
    const w = this.world, k = key(a.x, a.y), t = tileAt(w, a.x, a.y);
    if (!t || (o && o.type !== 'flower' && o.type !== 'shell')) { fx('nope'); return; }
    let v;
    if (t.t === T.WATER) v = { t: T.GRASS, h: 1 };
    else if (t.t === T.DIRT) v = { t: T.GRASS, h: t.h };
    else if (t.h < MAX_HEIGHT) v = { t: T.GRASS, h: t.h + 1 };
    else { fx('toohigh'); return; }
    if (o) { put(out, w, { k: 'obj', key: k, v: null }); this.give(out, a.by, NATURE[o.type].gives, 1); }
    put(out, w, { k: 'tile', key: k, ...v });
    this.give(out, a.by, 'dirt', -1);
    fx('fill');
  }

  build(a, pl, now = Date.now()) {
    const w = this.world, out = [];
    const def = BUILDS[a.id];
    const k = key(a.x, a.y);
    const o = w.objects[k];
    const t = tileAt(w, a.x, a.y);
    const fx = (name, extra) => put(out, w, { k: 'fx', fx: name, x: a.x, y: a.y, by: a.by, ...extra });
    if (!def || !t || t.t === T.WATER) { fx('nope'); return out; }
    if (!canAfford(pl.inv, def.cost)) { fx('cantafford', { id: a.id }); return out; }
    let v;
    const size = def.size || 1;
    const cells = [];
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) cells.push([a.x + dx, a.y + dy]);
    if (size > 1) {
      // Big things need flat, empty land under every tile.
      const ok = cells.every(([cx, cy]) => {
        const ct = tileAt(w, cx, cy), co = w.objects[key(cx, cy)];
        return ct && ct.t !== T.WATER && ct.h === t.h && (!co || co.type === 'flower' || co.type === 'shell');
      });
      if (!ok) { fx('noroom'); return out; }
      for (const [cx, cy] of cells.slice(1)) {
        const co = w.objects[key(cx, cy)];
        if (co) this.give(out, a.by, NATURE[co.type].gives, 1);
        put(out, w, { k: 'obj', key: key(cx, cy), v: { type: 'part', of: k } });
      }
    }
    if (o && o.type === 'build' && o.id === a.id && def.stack) {
      if ((o.h || 1) >= def.stack) { fx('nope'); return out; }
      v = { ...o, h: (o.h || 1) + 1 };
    } else if (!o || o.type === 'flower' || o.type === 'shell') {
      if (o) { this.give(out, a.by, NATURE[o.type].gives, 1); }
      v = { type: 'build', id: a.id, rot: size > 1 ? 0 : a.rot || 0, ...(def.stack ? { h: 1 } : {}), by: a.by, t: now };
    } else { fx('occupied'); return out; }
    for (const [item, n] of Object.entries(def.cost)) this.give(out, a.by, item, -n);
    put(out, w, { k: 'obj', key: k, v });
    fx('built', { id: a.id });
    // Did someone wish for exactly this near their home?
    for (const vil of Object.values(w.villagers || {})) {
      if (vil.wish?.kind !== 'build' || vil.wish.id !== a.id) continue;
      const d = doorOf(w, vil.home);
      if (Math.hypot(a.x + 0.5 - d.x, a.y + 0.5 - d.y) <= 6) { this.fulfil(out, vil, a.by, now); break; }
    }
    return out;
  }

  // Pick a built thing up again; whoever picks it up gets the materials back.
  pickup(a) {
    const w = this.world, out = [];
    let k = key(a.x, a.y);
    let o = w.objects[k];
    if (o && o.type === 'part') { k = o.of; o = w.objects[k]; }
    if (!o || o.type !== 'build') { put(out, w, { k: 'fx', fx: 'nope', x: a.x, y: a.y, by: a.by }); return out; }
    if (o.owner) { put(out, w, { k: 'fx', fx: 'someonelives', x: a.x, y: a.y, by: a.by, vid: o.owner }); return out; }
    const def = BUILDS[o.id];
    if (def.size > 1) {
      const [ax, ay] = k.split(',').map(Number);
      for (let dy = 0; dy < def.size; dy++) for (let dx = 0; dx < def.size; dx++) if (dx || dy) put(out, w, { k: 'obj', key: key(ax + dx, ay + dy), v: null });
    }
    for (const [item, n] of Object.entries(def.cost)) this.give(out, a.by, item, n);
    put(out, w, { k: 'obj', key: k, v: (o.h || 1) > 1 ? { ...o, h: o.h - 1 } : null });
    put(out, w, { k: 'fx', fx: 'pickedup', x: a.x, y: a.y, by: a.by, id: o.id });
    return out;
  }

  // Give a villager what they wished for.
  giveWish(a, pl, now) {
    const out = [];
    const vil = this.world.villagers?.[a.vid];
    const wish = vil?.wish;
    if (!wish || wish.kind !== 'give') return out;
    if ((pl.inv[wish.item] || 0) < wish.n) {
      put(out, this.world, { k: 'fx', fx: 'notenough', vid: vil.id, by: a.by, item: wish.item, n: wish.n });
      return out;
    }
    this.give(out, a.by, wish.item, -wish.n);
    this.fulfil(out, vil, a.by, now);
    return out;
  }

  // Campfire: turn fish and apples into food.
  cook(a, pl) {
    const out = [];
    const r = RECIPES.find((x) => x.id === a.recipe);
    const o = this.world.objects[key(a.x, a.y)];
    if (!r || !o || o.type !== 'build' || o.id !== 'campfire') return out;
    if (!canAfford(pl.inv, r.needs)) { put(out, this.world, { k: 'fx', fx: 'nope', x: a.x, y: a.y, by: a.by }); return out; }
    for (const [item, n] of Object.entries(r.needs)) this.give(out, a.by, item, -n);
    this.give(out, a.by, r.id, 1);
    put(out, this.world, { k: 'fx', fx: 'cooked', x: a.x, y: a.y, by: a.by, item: r.id });
    return out;
  }

  // Eating is a treat: you run fast for a while. Nothing bad happens if you never eat.
  eat(a, pl) {
    const out = [];
    const def = ITEMS[a.item];
    if (!def?.eat || !(pl.inv[a.item] > 0)) return out;
    this.give(out, a.by, a.item, -1);
    put(out, this.world, { k: 'fx', fx: 'ate', by: a.by, item: a.item, secs: def.eat });
    return out;
  }

  // The museum keeps one of each fish and little animal, with the name of who found it.
  donate(a, pl) {
    const out = [], w = this.world;
    const o = w.objects[key(a.x, a.y)];
    if (!o || o.type !== 'build' || o.id !== 'museum' || !COLLECTION.includes(a.item)) return out;
    w.museum = w.museum || {};
    if (w.museum[a.item] || !(pl.inv[a.item] > 0)) return out;
    this.give(out, a.by, a.item, -1);
    this.give(out, a.by, 'star', 1);
    put(out, w, { k: 'museum', item: a.item, who: pl.name || '' });
    put(out, w, { k: 'fx', fx: 'donated', x: a.x, y: a.y, by: a.by, item: a.item });
    return out;
  }

  // Give a friend some food just because. They love it.
  treat(a, pl, now) {
    const out = [];
    const vil = this.world.villagers?.[a.vid];
    if (!vil || !ITEMS[a.item]?.eat || !(pl.inv[a.item] > 0)) return out;
    if (vil.treatAt > now) { put(out, this.world, { k: 'fx', fx: 'full', vid: vil.id, by: a.by }); return out; }
    this.give(out, a.by, a.item, -1);
    put(out, this.world, { k: 'vil', id: vil.id, v: { ...vil, hearts: vil.hearts + 1, treatAt: now + 60000 } });
    put(out, this.world, { k: 'fx', fx: 'treated', vid: vil.id, by: a.by, item: a.item });
    return out;
  }

  fulfil(out, vil, by, now) {
    const hearts = vil.hearts + 1;
    const stars = hearts % 3 === 0 ? 2 : 1;
    const info = VILLAGERS.find((v) => v.id === vil.id);
    const gift = info.gives[Math.floor(this.rand() * info.gives.length)];
    this.give(out, by, 'star', stars);
    this.give(out, by, gift, 2);
    put(out, this.world, { k: 'vil', id: vil.id, v: { ...vil, hearts, wish: null, nextWish: now + 20000 + this.rand() * 20000 } });
    put(out, this.world, { k: 'fx', fx: 'wishdone', vid: vil.id, by, stars, gift });
  }

  newWish(vil) {
    const info = VILLAGERS.find((v) => v.id === vil.id);
    if (this.rand() < 0.45) {
      const id = info.likes[Math.floor(this.rand() * info.likes.length)];
      return { kind: 'build', id };
    }
    const items = ['wood', 'stone', 'fruit', 'flower', 'shell', 'fish', 'goldfish', 'grilled', 'pie', 'soup'];
    const item = items[Math.floor(this.rand() * items.length)];
    // Cooked food and goldfish take more work, so one is enough.
    const one = ITEMS[item].eat > 20 || item === 'goldfish';
    return { kind: 'give', item, n: one ? 1 : 1 + Math.floor(this.rand() * 3) };
  }

  // Villagers stroll around their home, think up wishes, and new ones move into empty houses.
  tickVillagers(now, out) {
    const w = this.world;
    w.villagers = w.villagers || {};
    for (const vil of Object.values(w.villagers)) {
      let v = null;
      if (!vil.wish && now >= vil.nextWish) v = { ...vil, wish: this.newWish(vil) };
      if (now >= vil.nextStep) {
        const cur = v || vil;
        const door = doorOf(w, vil.home);
        const fx = Math.floor(cur.tx), fy = Math.floor(cur.ty);
        const opts = [];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = fx + dx, ny = fy + dy;
          if (Math.hypot(nx + 0.5 - door.x, ny + 0.5 - door.y) > 4.5) continue;
          if (canStep(w, fx, fy, nx, ny)) opts.push([nx, ny]);
        }
        const pause = this.rand() < 0.4 ? 1500 + this.rand() * 3500 : 0;
        if (opts.length && !pause) {
          const [nx, ny] = opts[Math.floor(this.rand() * opts.length)];
          v = { ...cur, x: cur.tx, y: cur.ty, tx: nx + 0.5, ty: ny + 0.5, nextStep: now + 700 };
        } else if (!isWalkable(w, fx, fy)) {
          // Someone built on top of us: hop back to the door.
          v = { ...cur, x: door.x, y: door.y, tx: door.x, ty: door.y, nextStep: now + 500 };
        } else {
          v = { ...cur, x: cur.tx, y: cur.ty, nextStep: now + 400 + pause };
        }
      }
      if (v) put(out, w, { k: 'vil', id: vil.id, v });
    }
    // Empty houses get a new neighbour after a short while.
    for (const [k, o] of Object.entries(w.objects)) {
      if (o.type !== 'build' || o.id !== 'house' || o.owner || now - (o.t || 0) < 6000) continue;
      const next = VILLAGERS.find((v) => !w.villagers[v.id]);
      if (!next) break;
      const door = doorOf(w, k);
      put(out, w, { k: 'obj', key: k, v: { ...o, owner: next.id } });
      put(out, w, { k: 'vil', id: next.id, v: newVillager(next.id, k, door.x, door.y) });
      const [x, y] = k.split(',').map(Number);
      put(out, w, { k: 'fx', fx: 'movein', vid: next.id, x: x + 1, y: y + 1 });
      break;
    }
  }

  // Saplings grow up, new flowers bloom, shells wash ashore and new rocks appear.
  tick(now = Date.now()) {
    const w = this.world;
    const out = [];
    if (now >= (this.nextVil || 0)) {
      this.nextVil = now + 250;
      this.tickVillagers(now, out);
    }
    if (now >= this.nextGrow) {
      this.nextGrow = now + 1000;
      for (const k in w.objects) {
        const o = w.objects[k];
        if (o.type === 'bug' && now - o.t0 > 120000) {
          // Little animals don't stay forever; new ones come instead.
          put(out, w, { k: 'obj', key: k, v: null });
          continue;
        }
        if (o.type === 'sapling' && growth(o, now) >= 1) {
          const v = { type: o.grows, hp: NATURE[o.grows].hp };
          if (o.grows === 'fruittree') v.apples = NATURE.fruittree.apples;
          if (o.grows === 'berrybush') v.berries = NATURE.berrybush.berries;
          if (NATURE[o.grows].crop) delete v.hp;
          const [x, y] = k.split(',').map(Number);
          put(out, w, { k: 'obj', key: k, v });
          put(out, w, { k: 'fx', fx: 'grown', x, y, obj: o.grows });
        }
      }
    }
    if (now >= this.nextSpawn) {
      this.nextSpawn = now + 6000;
      let flowers = 0, shells = 0, rocks = 0, buried = 0, bugs = 0;
      for (const k in w.objects) {
        const t = w.objects[k].type;
        if (t === 'flower') flowers++;
        else if (t === 'shell') shells++;
        else if (t === 'rock') rocks++;
        else if (t === 'buried') buried++;
        else if (t === 'bug') bugs++;
      }
      const room = (w.size / OLD_WORLD_SIZE) ** 2; // bigger islands get more of everything
      const want = rocks < 14 * room ? 'rock' : buried < 3 ? 'buried' : bugs < 5 * room ? 'bug' : flowers < 60 * room ? 'flower' : shells < 20 * room ? 'shell' : null;
      for (let tries = 0; want && tries < 30; tries++) {
        const x = 1 + Math.floor(this.rand() * (w.size - 2));
        const y = 1 + Math.floor(this.rand() * (w.size - 2));
        const t = tileAt(w, x, y);
        const k = key(x, y);
        if (w.objects[k] || this.nearPlayer(x, y)) continue;
        if (want === 'shell' ? t.t !== T.SAND : t.t !== T.GRASS) continue;
        const v = want === 'flower' ? { type: 'flower', color: Math.floor(this.rand() * 4) } : want === 'rock' ? { type: 'rock', hp: 3 }
          : want === 'bug' ? { type: 'bug', kind: this.pickBug(), t0: now } : { type: want };
        put(out, w, { k: 'obj', key: k, v });
        break;
      }
    }
    return out;
  }

  // Players' positions are reported by the game so new rocks don't pop up under anyone.
  nearPlayer(x, y) {
    for (const p of Object.values(this.world.players)) {
      if (p.x !== undefined && Math.abs(p.x - x - 0.5) < 2 && Math.abs(p.y - y - 0.5) < 2) return true;
    }
    return false;
  }
}

function put(out, w, p) {
  applyPatch(w, p);
  out.push(p);
}

export function applyPatch(w, p) {
  if (p.k === 'obj') {
    if (p.v) w.objects[p.key] = p.v;
    else delete w.objects[p.key];
  } else if (p.k === 'tile') {
    const [x, y] = p.key.split(',').map(Number);
    w.terrain[y * w.size + x] = p.t;
    w.height[y * w.size + x] = p.h;
    (w.tiles || (w.tiles = {}))[p.key] = [p.t, p.h];
  } else if (p.k === 'museum') {
    (w.museum || (w.museum = {}))[p.item] = p.who || '🙂';
  } else if (p.k === 'vil') {
    (w.villagers || (w.villagers = {}))[p.id] = p.v;
  } else if (p.k === 'inv') {
    const pl = w.players[p.pid] || (w.players[p.pid] = { inv: {} });
    if (p.n > 0) pl.inv[p.item] = p.n;
    else delete pl.inv[p.item];
  }
}
