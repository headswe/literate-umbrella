// Isometric voxel renderer on a plain 2D canvas.
import { T } from './data.js';
import { key } from './worldgen.js';
import { refresh } from './sim.js';

export const TW = 64;   // tile width in px at zoom 1
export const TH = 32;   // tile height
export const CUBE = 22; // height of one block

export function project(x, y, z = 0) {
  return { sx: (x - y) * (TW / 2), sy: (x + y) * (TH / 2) - z * CUBE };
}

// ---- colors ----------------------------------------------------------------
const shadeCache = new Map();
function shade(hex, f) {
  const k = hex + f;
  let v = shadeCache.get(k);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
    const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
    const b = Math.min(255, Math.round((n & 255) * f));
    v = `rgb(${r},${g},${b})`;
    shadeCache.set(k, v);
  }
  return v;
}

const C = {
  water: '#4fb3d9', waterDeep: '#3a9cc8', foam: '#bfe9f5',
  grass: '#7ccf5b', grass2: '#74c653', dirt: '#9a6b45', sand: '#f1d68a', sand2: '#ebcd7c',
  trunk: '#8a5a34', leaf: '#4fae4a', leaf2: '#5cbf52', pine: '#2f8a52', fruitLeaf: '#6cc45c',
  apple: '#e8473d', rock: '#9aa3ad', rock2: '#b4bcc4', stem: '#3f9c3f',
  petals: ['#ff7eb6', '#ffd23f', '#b48cff', '#ffffff'], shell: '#ffb3c1',
};

// ---- emoji sprites -----------------------------------------------------------
const emojiCache = new Map();
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
export function emojiSprite(ch) {
  let c = emojiCache.get(ch);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    g.font = `76px ${EMOJI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, 48, 54);
    emojiCache.set(ch, c);
  }
  return c;
}

// ---- renderer --------------------------------------------------------------
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.zoom = 1;
    this.cam = { x: 0, y: 0, z: 1 };
    this.particles = [];
    this.floaters = [];
    this.shakes = new Map();
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.dpr = dpr;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    // Show about 9 tiles across on a phone, more on big screens.
    const base = Math.min(this.W, this.H * 1.4) / (TW * 11);
    this.baseZoom = Math.max(0.68, Math.min(1.3, base));
    if (!this.userZoom) this.userZoom = 1;
    this.zoom = this.baseZoom * this.userZoom;
  }

  setUserZoom(z) {
    this.userZoom = Math.max(0.55, Math.min(2.2, z));
    this.zoom = this.baseZoom * this.userZoom;
  }

  // Screen point (CSS px) to projected px.
  toProjected(x, y) {
    const c = project(this.cam.x, this.cam.y, this.cam.z);
    return { px: (x - this.W / 2) / this.zoom + c.sx, py: (y - this.H / 2) / this.zoom + c.sy };
  }

  // What is under a screen point? Objects first, then the ground.
  pick(world, x, y) {
    const { px, py } = this.toProjected(x, y);
    let best = null;
    const N = world.size;
    for (let ty = 0; ty < N; ty++) {
      for (let tx = 0; tx < N; tx++) {
        const i = ty * N + tx;
        const h = world.terrain[i] === T.WATER ? 0 : world.height[i];
        const p = project(tx + 0.5, ty + 0.5, h);
        const dx = Math.abs(px - p.sx), dy = py - p.sy;
        if (dx > TW || dy > TH || dy < -CUBE * 4) continue;
        const o = world.objects[key(tx, ty)];
        const depth = tx + ty;
        if (o && (o.type === 'tree' || o.type === 'pine' || o.type === 'fruittree' || o.type === 'rock')) {
          const top = o.type === 'rock' ? 1.2 : 3;
          if (dx < TW * 0.36 && dy < TH * 0.45 && dy > -top * CUBE) {
            if (!best || depth + 0.5 > best.depth) best = { x: tx, y: ty, depth: depth + 0.5, obj: o };
          }
        }
        if (dx / (TW / 2) + Math.abs(dy) / (TH / 2) <= 1.05) {
          if (!best || depth > best.depth) best = { x: tx, y: ty, depth, obj: o || null };
        }
      }
    }
    return best;
  }

  shake(x, y, now) { this.shakes.set(key(x, y), now + 260); }

  burst(x, y, z, color, n = 8) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + 0.5, y: y + 0.5, z: z + 1 + Math.random(),
        vx: (Math.random() - 0.5) * 2.4, vy: (Math.random() - 0.5) * 2.4, vz: 2 + Math.random() * 3,
        life: 0.8 + Math.random() * 0.4, color, s: 3 + Math.random() * 3,
      });
    }
  }

  floatText(x, y, z, icon, text) {
    this.floaters.push({ x: x + 0.5, y: y + 0.5, z: z + 2, icon, text, t: 0 });
  }

  // ---- drawing helpers ----
  box(x, y, z, sx, sy, sz, color, top = color) {
    const g = this.ctx;
    const a = project(x, y, z + sz), b = project(x + sx, y, z + sz);
    const c = project(x + sx, y + sy, z + sz), d = project(x, y + sy, z + sz);
    const bh = sz * CUBE;
    // left face (+y)
    g.fillStyle = shade(color, 0.72);
    g.beginPath();
    g.moveTo(d.sx, d.sy); g.lineTo(c.sx, c.sy); g.lineTo(c.sx, c.sy + bh); g.lineTo(d.sx, d.sy + bh);
    g.fill();
    // right face (+x)
    g.fillStyle = shade(color, 0.86);
    g.beginPath();
    g.moveTo(b.sx, b.sy); g.lineTo(c.sx, c.sy); g.lineTo(c.sx, c.sy + bh); g.lineTo(b.sx, b.sy + bh);
    g.fill();
    // top
    g.fillStyle = top;
    g.beginPath();
    g.moveTo(a.sx, a.sy); g.lineTo(b.sx, b.sy); g.lineTo(c.sx, c.sy); g.lineTo(d.sx, d.sy);
    g.fill();
  }

  diamond(x, y, z, fill, inset = 0) {
    const g = this.ctx;
    const a = project(x + inset, y + inset, z), b = project(x + 1 - inset, y + inset, z);
    const c = project(x + 1 - inset, y + 1 - inset, z), d = project(x + inset, y + 1 - inset, z);
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(a.sx, a.sy); g.lineTo(b.sx, b.sy); g.lineTo(c.sx, c.sy); g.lineTo(d.sx, d.sy);
    g.fill();
  }

  // ---- terrain ----
  drawTile(world, x, y, t, h, now) {
    const odd = (x + y) & 1;
    if (t === T.WATER) {
      // Foam where water meets land.
      const N = world.size;
      const near = (ax, ay) => ax >= 0 && ay >= 0 && ax < N && ay < N && world.terrain[ay * N + ax] !== T.WATER;
      if (near(x - 1, y) || near(x, y - 1) || near(x + 1, y) || near(x, y + 1)) {
        const wob = 0.06 + Math.sin(now / 700 + x + y) * 0.04;
        this.diamond(x, y, 0.15, C.foam, wob);
      } else if (((x * 7 + y * 13) % 11) === 0) {
        const wob = Math.sin(now / 900 + x * 3 + y) * 0.5 + 0.5;
        this.ctx.globalAlpha = 0.35 * wob;
        this.diamond(x, y, 0.1, '#ffffff', 0.38);
        this.ctx.globalAlpha = 1;
      }
      return;
    }
    const base = -0.2;
    const top = t === T.SAND ? (odd ? C.sand : C.sand2) : (odd ? C.grass : C.grass2);
    const side = t === T.SAND ? C.sand : C.dirt;
    this.box(x, y, base, 1, 1, h - base, side, top);
    if (t === T.GRASS) {
      // Green band at the top of the dirt, like a grass block.
      this.box(x, y, h - 0.22, 1, 1, 0.22, C.grass, top);
    }
  }

  // ---- nature ----
  drawObject(o, x, y, z, now) {
    const sk = this.shakes.get(key(x, y));
    let dx = 0;
    if (sk && sk > now) dx = Math.sin(now / 25) * 0.05;
    const bx = x + dx, by = y - dx;
    switch (o.type) {
      case 'tree': case 'fruittree': {
        if (!o.left) { this.box(bx + 0.38, by + 0.38, z, 0.24, 0.24, 0.35, C.trunk); this.zzz(x, y, z + 0.6, now); break; }
        this.shadow(x, y, z, 0.42);
        this.box(bx + 0.4, by + 0.4, z, 0.2, 0.2, 1.3, C.trunk);
        const leaf = o.type === 'fruittree' ? C.fruitLeaf : C.leaf;
        this.box(bx + 0.12, by + 0.12, z + 1.1, 0.76, 0.76, 0.85, leaf, C.leaf2);
        this.box(bx + 0.28, by + 0.28, z + 1.95, 0.44, 0.44, 0.4, leaf, C.leaf2);
        if (o.type === 'fruittree') {
          const spots = [[0.88, 0.3, 1.55], [0.88, 0.62, 1.25], [0.45, 0.88, 1.45]];
          for (let i = 0; i < o.left; i++) {
            const [ax, ay, az] = spots[i];
            this.box(bx + ax - 0.06, by + ay - 0.06, z + az, 0.13, 0.13, 0.15, C.apple);
          }
        }
        break;
      }
      case 'pine': {
        if (!o.left) { this.box(bx + 0.38, by + 0.38, z, 0.24, 0.24, 0.35, C.trunk); this.zzz(x, y, z + 0.6, now); break; }
        this.shadow(x, y, z, 0.4);
        this.box(bx + 0.4, by + 0.4, z, 0.2, 0.2, 0.7, C.trunk);
        this.box(bx + 0.1, by + 0.1, z + 0.6, 0.8, 0.8, 0.6, C.pine);
        this.box(bx + 0.22, by + 0.22, z + 1.2, 0.56, 0.56, 0.6, C.pine);
        this.box(bx + 0.34, by + 0.34, z + 1.8, 0.32, 0.32, 0.55, C.pine);
        break;
      }
      case 'rock': {
        if (!o.left) { this.box(bx + 0.35, by + 0.4, z, 0.3, 0.25, 0.2, C.rock); this.zzz(x, y, z + 0.5, now); break; }
        this.shadow(x, y, z, 0.38);
        this.box(bx + 0.15, by + 0.18, z, 0.55, 0.5, 0.45, C.rock, C.rock2);
        this.box(bx + 0.42, by + 0.4, z, 0.42, 0.42, 0.7, C.rock, C.rock2);
        if (o.left > 1) this.box(bx + 0.2, by + 0.6, z, 0.3, 0.28, 0.3, C.rock, C.rock2);
        break;
      }
      case 'flower': {
        const bob = Math.sin(now / 600 + x * 2 + y) * 0.02;
        this.box(x + 0.47, y + 0.47, z, 0.06, 0.06, 0.35, C.stem);
        this.box(x + 0.39 + bob, y + 0.39, z + 0.35, 0.22, 0.22, 0.14, C.petals[o.color || 0]);
        this.box(x + 0.46 + bob, y + 0.46, z + 0.49, 0.08, 0.08, 0.04, '#ffe066');
        break;
      }
      case 'shell': {
        this.box(x + 0.36, y + 0.4, z, 0.28, 0.22, 0.1, C.shell, '#ffd6de');
        break;
      }
    }
  }

  shadow(x, y, z, r) {
    const p = project(x + 0.5, y + 0.5, z);
    const g = this.ctx;
    g.fillStyle = 'rgba(30,60,30,0.22)';
    g.beginPath();
    g.ellipse(p.sx, p.sy, TW * r * 0.5, TH * r * 0.5, 0, 0, Math.PI * 2);
    g.fill();
  }

  zzz(x, y, z, now) {
    const p = project(x + 0.5, y + 0.5, z);
    const t = (now / 1200) % 1;
    const g = this.ctx;
    g.globalAlpha = 1 - t;
    g.fillStyle = '#ffffff';
    g.font = '700 13px "Fredoka", sans-serif';
    g.textAlign = 'center';
    g.fillText('z', p.sx + 6 + t * 6, p.sy - 8 - t * 18);
    g.globalAlpha = 1;
  }

  drawPlayer(p, now) {
    const g = this.ctx;
    this.shadow(p.x - 0.5, p.y - 0.5, p.z, 0.32);
    const pos = project(p.x, p.y, p.z);
    const bob = p.moving ? Math.abs(Math.sin(now / 110)) * 5 : Math.sin(now / 500) * 1.2;
    const s = 46;
    const spr = emojiSprite(p.avatar);
    g.save();
    g.translate(pos.sx, pos.sy - s * 0.5 - bob);
    if (p.facing > 0) g.scale(-1, 1); // emoji face left by default
    if (p.swing && p.swing > now) g.rotate(Math.sin((p.swing - now) / 40) * 0.25);
    g.drawImage(spr, -s / 2, -s / 2, s, s);
    g.restore();
    if (p.name) {
      g.font = '600 12px "Fredoka", sans-serif';
      g.textAlign = 'center';
      const w = g.measureText(p.name).width + 12;
      const ty = pos.sy - s - 12 - bob;
      g.fillStyle = 'rgba(43,38,70,0.72)';
      roundRect(g, pos.sx - w / 2, ty - 10, w, 17, 8);
      g.fill();
      g.fillStyle = '#ffffff';
      g.fillText(p.name, pos.sx, ty + 3);
    }
  }

  drawMarker(m, world, now) {
    const h = world.height[m.y * world.size + m.x];
    const pulse = 0.12 + Math.sin(now / 160) * 0.05;
    this.ctx.globalAlpha = 0.55;
    this.diamond(m.x, m.y, h + 0.01, '#ffffff', pulse);
    this.ctx.globalAlpha = 1;
  }

  // ---- frame ----
  render(world, players, marker, now, dt) {
    const g = this.ctx;
    const N = world.size;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const grad = g.createLinearGradient(0, 0, 0, this.H);
    grad.addColorStop(0, C.water);
    grad.addColorStop(1, C.waterDeep);
    g.fillStyle = grad;
    g.fillRect(0, 0, this.W, this.H);

    const c = project(this.cam.x, this.cam.y, this.cam.z);
    const z = this.zoom * this.dpr;
    g.setTransform(z, 0, 0, z, this.dpr * (this.W / 2) - c.sx * z, this.dpr * (this.H / 2) - c.sy * z);

    const halfW = this.W / 2 / this.zoom + TW, halfH = this.H / 2 / this.zoom + CUBE * 4;

    // Players bucketed by the diagonal they stand on, so hills can hide them.
    const buckets = new Map();
    for (const p of players) {
      const d = Math.floor(p.x) + Math.floor(p.y);
      if (!buckets.has(d)) buckets.set(d, []);
      buckets.get(d).push(p);
    }

    for (let d = 0; d <= 2 * (N - 1); d++) {
      for (let x = Math.max(0, d - N + 1); x <= Math.min(d, N - 1); x++) {
        const y = d - x;
        const i = y * N + x;
        const t = world.terrain[i], h = t === T.WATER ? 0 : world.height[i];
        const p = project(x + 0.5, y + 0.5, h);
        if (Math.abs(p.sx - c.sx) > halfW || p.sy - c.sy > halfH + CUBE * 3 || p.sy - c.sy < -halfH - CUBE * 2) continue;
        this.drawTile(world, x, y, t, h, now);
        if (marker && marker.x === x && marker.y === y) this.drawMarker(marker, world, now);
        const o = world.objects[key(x, y)];
        if (o) this.drawObject(refresh(o, now), x, y, h, now);
      }
      const list = buckets.get(d);
      if (list) for (const p of list) this.drawPlayer(p, now);
    }

    // Particles: little flying cubes.
    this.particles = this.particles.filter((q) => (q.life -= dt) > 0);
    for (const q of this.particles) {
      q.vz -= 9 * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z = Math.max(0, q.z + q.vz * dt);
      const p = project(q.x, q.y, q.z);
      g.globalAlpha = Math.min(1, q.life * 2);
      g.fillStyle = q.color;
      g.fillRect(p.sx - q.s / 2, p.sy - q.s / 2, q.s, q.s);
    }
    g.globalAlpha = 1;

    // "+1" floaters.
    this.floaters = this.floaters.filter((f) => (f.t += dt) < 1.1);
    g.textAlign = 'center';
    for (const f of this.floaters) {
      const p = project(f.x, f.y, f.z + f.t * 1.6);
      g.globalAlpha = Math.min(1, (1.1 - f.t) * 3);
      g.drawImage(emojiSprite(f.icon), p.sx - 30, p.sy - 18, 28, 28);
      g.font = '700 20px "Fredoka", sans-serif';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(43,38,70,0.8)';
      g.strokeText(f.text, p.sx + 12, p.sy + 3);
      g.fillStyle = '#ffffff';
      g.fillText(f.text, p.sx + 12, p.sy + 3);
    }
    g.globalAlpha = 1;
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
