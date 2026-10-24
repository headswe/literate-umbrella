// Seeded island generator. Same seed gives the same island on every device.
import { WORLD_SIZE, T } from './data.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise on a coarse grid.
function makeNoise(rand, cell) {
  const g = {};
  const at = (i, j) => {
    const k = i + ',' + j;
    if (g[k] === undefined) g[k] = rand();
    return g[k];
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell, fy = y / cell;
    const i = Math.floor(fx), j = Math.floor(fy);
    const u = smooth(fx - i), v = smooth(fy - j);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

export const key = (x, y) => x + ',' + y;

export function generateWorld(seed, size = WORLD_SIZE) {
  const N = size;
  const rand = mulberry32(seed);
  const shape = makeNoise(rand, 7);
  const hills = makeNoise(rand, 9);
  const forest = makeNoise(rand, 6);

  const terrain = new Array(N * N);
  const height = new Array(N * N);
  const c = (N - 1) / 2;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (x - c) / c, dy = (y - c) / c;
      const d = Math.sqrt(dx * dx + dy * dy);
      const land = 1 - d * 1.15 + (shape(x, y) - 0.5) * 0.55;
      const i = y * N + x;
      if (land < 0.12) {
        terrain[i] = T.WATER; height[i] = 0;
      } else if (land < 0.22) {
        terrain[i] = T.SAND; height[i] = 1;
      } else {
        terrain[i] = T.GRASS;
        const h = hills(x, y);
        height[i] = land > 0.5 && h > 0.62 ? 3 : land > 0.32 && h > 0.45 ? 2 : 1;
      }
    }
  }

  // Keep the middle flat and open so everyone starts somewhere nice.
  const cx = Math.round(c), cy = Math.round(c);
  for (let y = cy - 3; y <= cy + 3; y++) {
    for (let x = cx - 3; x <= cx + 3; x++) {
      const i = y * N + x;
      terrain[i] = T.GRASS; height[i] = 1;
    }
  }

  const objects = {};
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      if (Math.abs(x - cx) <= 3 && Math.abs(y - cy) <= 3) continue;
      const i = y * N + x;
      const r = rand();
      if (terrain[i] === T.GRASS) {
        const f = forest(x, y);
        if (f > 0.58 && r < 0.45) {
          objects[key(x, y)] = { type: rand() < 0.35 ? 'pine' : 'tree', hp: 3 };
        } else if (r < 0.025) {
          objects[key(x, y)] = { type: 'fruittree', hp: 3, apples: 3 };
        } else if (r < 0.045) {
          objects[key(x, y)] = { type: 'rock', hp: 3 };
        } else if (r < 0.1) {
          objects[key(x, y)] = { type: 'flower', color: Math.floor(rand() * 4) };
        }
      } else if (terrain[i] === T.SAND && r < 0.05) {
        objects[key(x, y)] = { type: 'shell' };
      }
    }
  }

  // A few treasures to dig up, away from the middle.
  for (let n = 0, tries = 0; n < 4 && tries < 400; tries++) {
    const x = 2 + Math.floor(rand() * (N - 4)), y = 2 + Math.floor(rand() * (N - 4));
    if (terrain[y * N + x] !== T.GRASS || objects[key(x, y)] || Math.hypot(x - cx, y - cy) < 6) continue;
    objects[key(x, y)] = { type: 'buried' };
    n++;
  }

  return { size: N, seed, terrain, height, objects, spawn: { x: cx + 0.5, y: cy + 0.5 } };
}
