// A* on the tile grid. Diagonal steps are allowed when both sides are open.
import { canStep } from './sim.js';

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41],
];

// `goal(x, y)` says when we have arrived. `tx, ty` steers the search.
export function findPath(world, sx, sy, goal, tx, ty, limit = 4000) {
  const N = world.size;
  const id = (x, y) => y * N + x;
  const h = (x, y) => Math.hypot(tx - x, ty - y);
  const open = [{ x: sx, y: sy, g: 0, f: h(sx, sy) }];
  const came = new Map();
  const best = new Map([[id(sx, sy), 0]]);
  let steps = 0;

  while (open.length && steps++ < limit) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (goal(cur.x, cur.y)) {
      const path = [];
      let k = id(cur.x, cur.y);
      let node = cur;
      while (node) {
        path.push({ x: node.x, y: node.y });
        node = came.get(k);
        if (node) k = id(node.x, node.y);
      }
      path.reverse();
      path.shift(); // drop the tile we stand on
      return path;
    }
    for (const [dx, dy, cost] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!canStep(world, cur.x, cur.y, nx, ny)) continue;
      if (dx && dy && (!canStep(world, cur.x, cur.y, cur.x + dx, cur.y) || !canStep(world, cur.x, cur.y, cur.x, cur.y + dy))) continue;
      const g = cur.g + cost;
      const k = id(nx, ny);
      if (best.has(k) && best.get(k) <= g) continue;
      best.set(k, g);
      came.set(k, cur);
      open.push({ x: nx, y: ny, g, f: g + h(nx, ny) });
    }
  }
  return null;
}
