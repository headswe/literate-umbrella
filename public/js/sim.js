// Game rules. The sim owns the world and turns player actions into patches.
// In single player it runs in the browser; later the LAN server runs the same code.
import { NATURE, ITEM_ORDER, T } from './data.js';
import { generateWorld, key, mulberry32 } from './worldgen.js';

export function newWorldSave(name, seed) {
  const gen = generateWorld(seed);
  const inv = {};
  for (const id of ITEM_ORDER) inv[id] = 0;
  return {
    id: 'w' + seed.toString(36) + Date.now().toString(36),
    name,
    seed,
    created: Date.now(),
    inv,
    objects: gen.objects,
  };
}

// A playable world: the save plus terrain rebuilt from the seed.
export function loadWorld(save) {
  const gen = generateWorld(save.seed);
  return {
    ...save,
    size: gen.size,
    terrain: gen.terrain,
    height: gen.height,
    spawn: gen.spawn,
  };
}

export function toSave(world) {
  const { id, name, seed, created, inv, objects } = world;
  return { id, name, seed, created, inv, objects, saved: Date.now() };
}

export function tileAt(world, x, y) {
  if (x < 0 || y < 0 || x >= world.size || y >= world.size) return null;
  const i = y * world.size + x;
  return { t: world.terrain[i], h: world.height[i] };
}

export function heightAt(world, x, y) {
  const t = tileAt(world, x, y);
  return t ? t.h : 0;
}

export function isWalkable(world, x, y) {
  const t = tileAt(world, x, y);
  if (!t || t.t === T.WATER) return false;
  const o = world.objects[key(x, y)];
  if (o && NATURE[o.type]?.blocks) return false;
  return true;
}

// You can climb or drop one block at a time, like hopping in Minecraft.
export function canStep(world, ax, ay, bx, by) {
  if (!isWalkable(world, bx, by)) return false;
  return Math.abs(heightAt(world, ax, ay) - heightAt(world, bx, by)) <= 1;
}

// Has a resting tree or rock woken up again?
export function refresh(o, now) {
  if (o && o.rest && o.rest <= now) {
    o.left = NATURE[o.type].uses;
    delete o.rest;
  }
  return o;
}

export class Sim {
  constructor(world) {
    this.world = world;
    this.rand = mulberry32((Date.now() ^ world.seed) >>> 0);
    this.nextSpawn = 0;
  }

  // Returns a list of patches. Every client applies them with applyPatch.
  act(a, now = Date.now()) {
    const w = this.world;
    if (a.type === 'gather') {
      const k = key(a.x, a.y);
      const o = refresh(w.objects[k], now);
      const def = o && NATURE[o.type];
      if (!def) return [];
      const out = [];
      if (def.once) {
        out.push({ k: 'obj', key: k, v: null });
      } else {
        if (!o.left) return [{ k: 'fx', fx: 'tired', x: a.x, y: a.y }];
        const left = o.left - 1;
        const next = { ...o, left };
        if (left === 0) next.rest = now + def.rest;
        out.push({ k: 'obj', key: k, v: next });
      }
      out.push({ k: 'inv', item: def.gives, n: (w.inv[def.gives] || 0) + 1 });
      out.push({ k: 'fx', fx: 'gain', x: a.x, y: a.y, item: def.gives, by: a.by, obj: o.type });
      for (const p of out) applyPatch(w, p);
      return out;
    }
    return [];
  }

  // Slowly grows new flowers and washes up new shells.
  tick(now = Date.now()) {
    if (now < this.nextSpawn) return [];
    this.nextSpawn = now + 6000;
    const w = this.world;
    let flowers = 0, shells = 0;
    for (const k in w.objects) {
      const t = w.objects[k].type;
      if (t === 'flower') flowers++;
      else if (t === 'shell') shells++;
    }
    const out = [];
    const want = flowers < 60 ? 'flower' : shells < 20 ? 'shell' : null;
    if (!want) return out;
    for (let tries = 0; tries < 30; tries++) {
      const x = 1 + Math.floor(this.rand() * (w.size - 2));
      const y = 1 + Math.floor(this.rand() * (w.size - 2));
      const t = tileAt(w, x, y);
      const k = key(x, y);
      if (w.objects[k]) continue;
      if (want === 'flower' && t.t === T.GRASS) {
        out.push({ k: 'obj', key: k, v: { type: 'flower', color: Math.floor(this.rand() * 4) } });
        break;
      }
      if (want === 'shell' && t.t === T.SAND) {
        out.push({ k: 'obj', key: k, v: { type: 'shell' } });
        break;
      }
    }
    for (const p of out) applyPatch(w, p);
    return out;
  }
}

export function applyPatch(w, p) {
  if (p.k === 'obj') {
    if (p.v) w.objects[p.key] = p.v;
    else delete w.objects[p.key];
  } else if (p.k === 'inv') {
    w.inv[p.item] = p.n;
  }
}
