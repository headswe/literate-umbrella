// Game rules. The sim owns the world and turns player actions into patches.
// In single player it runs in the browser; the LAN server will run the same code.
import { NATURE, ITEMS, STARTER_KIT, GROW_MS, BUILDS, T } from './data.js';
import { generateWorld, key, mulberry32 } from './worldgen.js';

export function newWorldSave(name, seed) {
  const gen = generateWorld(seed);
  return {
    id: 'w' + seed.toString(36) + Date.now().toString(36),
    name,
    seed,
    created: Date.now(),
    version: 2,
    players: {},
    objects: gen.objects,
  };
}

// A playable world: the save plus terrain rebuilt from the seed.
export function loadWorld(save) {
  const gen = generateWorld(save.seed);
  const w = { ...save, size: gen.size, terrain: gen.terrain, height: gen.height, spawn: gen.spawn };
  w.players = w.players || {};
  if (!save.version) {
    // Version 1 saves had one shared bag and trees that never fell.
    w.legacyInv = save.inv;
    for (const o of Object.values(w.objects)) {
      if (NATURE[o.type]?.hp > 1) { o.hp = 3; delete o.left; delete o.rest; }
      if (o.type === 'fruittree') o.apples = 3;
    }
    w.version = 2;
  }
  return w;
}

export function toSave(world) {
  const { id, name, seed, created, version, players, objects } = world;
  return { id, name, seed, created, version, players, objects, saved: Date.now() };
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
  return o;
}

// How grown a sapling is, 0..1.
export function growth(o, now) {
  return Math.max(0, Math.min(1, (now - o.t0) / GROW_MS));
}

// Which item a tap on this object should use, if the player has it.
export function toolFor(o, selected) {
  if (!o) return null;
  if (o.type === 'fruittree') return selected === 'axe' ? 'axe' : 'hand';
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
    if (a.type === 'build') return this.build(a, pl);
    if (a.type === 'pickup') return this.pickup(a);
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

  build(a, pl) {
    const w = this.world, out = [];
    const def = BUILDS[a.id];
    const k = key(a.x, a.y);
    const o = w.objects[k];
    const t = tileAt(w, a.x, a.y);
    const fx = (name, extra) => put(out, w, { k: 'fx', fx: name, x: a.x, y: a.y, by: a.by, ...extra });
    if (!def || !t || t.t === T.WATER) { fx('nope'); return out; }
    if (!canAfford(pl.inv, def.cost)) { fx('cantafford', { id: a.id }); return out; }
    let v;
    if (o && o.type === 'build' && o.id === a.id && def.stack) {
      if ((o.h || 1) >= def.stack) { fx('nope'); return out; }
      v = { ...o, h: (o.h || 1) + 1 };
    } else if (!o || o.type === 'flower' || o.type === 'shell') {
      if (o) { this.give(out, a.by, NATURE[o.type].gives, 1); }
      v = { type: 'build', id: a.id, rot: a.rot || 0, ...(def.stack ? { h: 1 } : {}), by: a.by };
    } else { fx('occupied'); return out; }
    for (const [item, n] of Object.entries(def.cost)) this.give(out, a.by, item, -n);
    put(out, w, { k: 'obj', key: k, v });
    fx('built', { id: a.id });
    return out;
  }

  // Pick a built thing up again; whoever picks it up gets the materials back.
  pickup(a) {
    const w = this.world, out = [];
    const k = key(a.x, a.y);
    const o = w.objects[k];
    if (!o || o.type !== 'build') { put(out, w, { k: 'fx', fx: 'nope', x: a.x, y: a.y, by: a.by }); return out; }
    const def = BUILDS[o.id];
    for (const [item, n] of Object.entries(def.cost)) this.give(out, a.by, item, n);
    put(out, w, { k: 'obj', key: k, v: (o.h || 1) > 1 ? { ...o, h: o.h - 1 } : null });
    put(out, w, { k: 'fx', fx: 'pickedup', x: a.x, y: a.y, by: a.by, id: o.id });
    return out;
  }

  // Saplings grow up, new flowers bloom, shells wash ashore and new rocks appear.
  tick(now = Date.now()) {
    const w = this.world;
    const out = [];
    if (now >= this.nextGrow) {
      this.nextGrow = now + 1000;
      for (const k in w.objects) {
        const o = w.objects[k];
        if (o.type === 'sapling' && growth(o, now) >= 1) {
          const v = { type: o.grows, hp: NATURE[o.grows].hp };
          if (o.grows === 'fruittree') v.apples = NATURE.fruittree.apples;
          const [x, y] = k.split(',').map(Number);
          out.push({ k: 'obj', key: k, v }, { k: 'fx', fx: 'grown', x, y, obj: o.grows });
        }
      }
    }
    if (now >= this.nextSpawn) {
      this.nextSpawn = now + 6000;
      let flowers = 0, shells = 0, rocks = 0;
      for (const k in w.objects) {
        const t = w.objects[k].type;
        if (t === 'flower') flowers++;
        else if (t === 'shell') shells++;
        else if (t === 'rock') rocks++;
      }
      const want = rocks < 14 ? 'rock' : flowers < 60 ? 'flower' : shells < 20 ? 'shell' : null;
      for (let tries = 0; want && tries < 30; tries++) {
        const x = 1 + Math.floor(this.rand() * (w.size - 2));
        const y = 1 + Math.floor(this.rand() * (w.size - 2));
        const t = tileAt(w, x, y);
        const k = key(x, y);
        if (w.objects[k] || this.nearPlayer(x, y)) continue;
        if (want === 'shell' ? t.t !== T.SAND : t.t !== T.GRASS) continue;
        const v = want === 'flower' ? { type: 'flower', color: Math.floor(this.rand() * 4) } : want === 'rock' ? { type: 'rock', hp: 3 } : { type: 'shell' };
        out.push({ k: 'obj', key: k, v });
        break;
      }
    }
    for (const p of out) applyPatch(w, p);
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
  } else if (p.k === 'inv') {
    const pl = w.players[p.pid] || (w.players[p.pid] = { inv: {} });
    if (p.n > 0) pl.inv[p.item] = p.n;
    else delete pl.inv[p.item];
  }
}
