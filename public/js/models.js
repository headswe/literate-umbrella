// Voxel models for everything that stands on the island, drawn into shared instanced meshes.
import * as THREE from 'three';
import { growth } from './sim.js';

// A set of instanced meshes, one per material. Used for the world and for catalog pictures.
export class PartSet {
  constructor(scene, tex, cap = 2000) {
    const L = (o) => new THREE.MeshLambertMaterial(o);
    const barkMats = [L({ map: tex.bark }), L({ map: tex.bark }), L({ map: tex.logTop }), L({ map: tex.logTop }), L({ map: tex.bark }), L({ map: tex.bark })];
    const box = new THREE.BoxGeometry(1, 1, 1);
    const make = (mat, opts = {}) => {
      const m = new THREE.InstancedMesh(box, mat, cap);
      m.castShadow = opts.cast !== false;
      m.receiveShadow = true;
      m.count = 0;
      m.userData.keys = [];
      scene.add(m);
      return m;
    };
    this.meshes = {
      trunk: make(barkMats),
      leaves: make(L({ map: tex.leaves })),
      pine: make(L({ map: tex.pine })),
      rock: make(L({ map: tex.stone })),
      solid: make(L({ color: '#ffffff' })),
      soil: make(L({ map: tex.soil }), { cast: false }),
      planks: make(L({ map: tex.planks })),
      cobble: make(L({ map: tex.cobble })),
      glow: make(new THREE.MeshBasicMaterial({ color: '#ffffff' }), { cast: false }),
    };
    this.tmp = new THREE.Object3D();
    this.color = new THREE.Color();
    this.group = null;
  }

  begin() { for (const m of Object.values(this.meshes)) m.count = 0; }

  end() {
    for (const m of Object.values(this.meshes)) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }

  // Box with corner (x, y, z) and size (sx, sy, sz) in tile units; z is up.
  part(name, k, x, y, z, sx, sy, sz, color) {
    const mesh = this.meshes[name];
    if (mesh.count >= mesh.instanceMatrix.count) return;
    this.tmp.position.set(x + sx / 2, z + sz / 2, y + sy / 2);
    this.tmp.scale.set(sx, sz, sy);
    this.tmp.updateMatrix();
    if (this.group) this.tmp.matrix.premultiply(this.group);
    const i = mesh.count++;
    mesh.setMatrixAt(i, this.tmp.matrix);
    if (color) mesh.setColorAt(i, this.color.set(color));
    mesh.userData.keys[i] = k;
  }

  // Parts drawn after this are scaled, tipped and turned around the base of tile (x, y).
  setGroup(x, y, z, { scale = 1, tip = 0, tipDir = 0, yaw = 0 } = {}) {
    if (scale === 1 && !tip && !yaw) { this.group = null; return; }
    const m = this.group || (this.group = new THREE.Matrix4());
    const pivot = new THREE.Vector3(x + 0.5, z, y + 0.5);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    if (tip) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(tipDir), 0, -Math.sin(tipDir)), tip));
    m.compose(pivot, q, new THREE.Vector3(scale, scale, scale));
    m.multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
  }

  clearGroup() { this.group = null; }
}

export function drawTree(ps, k, type, x, y, z, apples) {
  const p = ps.part.bind(ps);
  if (type === 'pine') {
    p('trunk', k, x + 0.39, y + 0.39, z, 0.22, 0.22, 0.8);
    p('pine', k, x + 0.08, y + 0.08, z + 0.6, 0.84, 0.84, 0.6);
    p('pine', k, x + 0.2, y + 0.2, z + 1.2, 0.6, 0.6, 0.6);
    p('pine', k, x + 0.32, y + 0.32, z + 1.8, 0.36, 0.36, 0.55);
    return;
  }
  p('trunk', k, x + 0.38, y + 0.38, z, 0.24, 0.24, 1.3);
  p('leaves', k, x + 0.1, y + 0.1, z + 1.05, 0.8, 0.8, 0.85);
  p('leaves', k, x + 0.26, y + 0.26, z + 1.9, 0.48, 0.48, 0.42);
  if (type === 'fruittree') {
    const spots = [[0.9, 0.3, 1.45], [0.9, 0.66, 1.2], [0.45, 0.9, 1.4]];
    for (let i = 0; i < (apples || 0); i++) {
      const [ax, ay, az] = spots[i];
      p('solid', k, x + ax - 0.08, y + ay - 0.08, z + az, 0.16, 0.16, 0.16, '#e8473d');
    }
  }
}

// Nature: rocks, flowers, shells, soil and saplings.
export function drawNature(ps, k, o, x, y, z, now, dx = 0) {
  const p = ps.part.bind(ps);
  const bx = x + dx, by = y - dx;
  switch (o.type) {
    case 'tree': case 'fruittree': case 'pine':
      drawTree(ps, k, o.type, bx, by, z, o.apples);
      break;
    case 'rock': {
      const hp = o.hp || 3;
      p('rock', k, bx + 0.12, by + 0.16, z, 0.58, 0.52, 0.3 + hp * 0.05);
      if (hp > 1) p('rock', k, bx + 0.4, by + 0.38, z, 0.46, 0.46, 0.5 + hp * 0.08);
      if (hp > 2) p('rock', k, bx + 0.16, by + 0.58, z, 0.32, 0.3, 0.3);
      break;
    }
    case 'flower': {
      const c = ['#ff7eb6', '#ffd23f', '#b48cff', '#ffffff'][o.color || 0];
      p('solid', k, x + 0.46, y + 0.46, z, 0.08, 0.08, 0.32, '#3f9c3f');
      p('solid', k, x + 0.36, y + 0.36, z + 0.32, 0.28, 0.28, 0.12, c);
      p('solid', k, x + 0.45, y + 0.45, z + 0.44, 0.1, 0.1, 0.04, '#ffe066');
      p('solid', k, x + 0.5, y + 0.3, z + 0.12, 0.14, 0.06, 0.06, '#4fae4a');
      break;
    }
    case 'shell':
      p('solid', k, x + 0.34, y + 0.38, z, 0.32, 0.26, 0.1, '#ffb3c1');
      p('solid', k, x + 0.4, y + 0.42, z + 0.1, 0.2, 0.16, 0.05, '#ffd6de');
      break;
    case 'soil':
      p('soil', k, x + 0.04, y + 0.04, z, 0.92, 0.92, 0.05);
      break;
    case 'sapling': {
      p('soil', k, x + 0.04, y + 0.04, z, 0.92, 0.92, 0.05);
      const g = growth(o, now);
      if (g < 0.3) {
        const h = 0.12 + g * 0.6;
        p('solid', k, x + 0.47, y + 0.47, z + 0.05, 0.06, 0.06, h, '#4fae4a');
        p('solid', k, x + 0.33, y + 0.45, z + 0.05 + h, 0.14, 0.1, 0.05, '#63c759');
        p('solid', k, x + 0.53, y + 0.45, z + 0.05 + h, 0.14, 0.1, 0.05, '#63c759');
      } else {
        ps.setGroup(x, y, z + 0.05, { scale: 0.25 + 0.6 * g });
        drawTree(ps, k, o.grows, x, y, z + 0.05, 0);
        ps.clearGroup();
      }
      break;
    }
    case 'build':
      drawBuild(ps, k, o, x, y, z, now, null);
      break;
  }
}

const RAINBOW = ['#ff5d5d', '#ffa53f', '#ffe14d', '#6bd66b', '#4fb3ff', '#a77bff'];

// Built things. `nb(dx, dy)` tells if a neighbour has the same build id (for fences).
export function drawBuild(ps, k, o, x, y, z, now, nb) {
  const p = ps.part.bind(ps);
  ps.setGroup(x, y, z, { yaw: (o.rot || 0) * Math.PI / 2 });
  switch (o.id) {
    case 'planks': case 'cobble':
      for (let l = 0; l < (o.h || 1); l++) p(o.id, k, x, y, z + l, 1, 1, 1);
      break;
    case 'floor':
      p('planks', k, x, y, z, 1, 1, 0.06);
      break;
    case 'path':
      p('cobble', k, x + 0.04, y + 0.04, z, 0.92, 0.92, 0.06);
      break;
    case 'fence': {
      ps.clearGroup();
      p('planks', k, x + 0.42, y + 0.42, z, 0.16, 0.16, 0.85);
      p('planks', k, x + 0.4, y + 0.4, z + 0.85, 0.2, 0.2, 0.06);
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let any = false;
      for (const [dx, dy] of dirs) {
        if (!nb || !nb(dx, dy)) continue;
        any = true;
        const sx = dx ? 0.5 : 0.08, sy = dy ? 0.5 : 0.08;
        const ox = dx > 0 ? 0.5 : dx < 0 ? 0 : 0.46, oy = dy > 0 ? 0.5 : dy < 0 ? 0 : 0.46;
        p('planks', k, x + ox, y + oy, z + 0.3, sx, sy, 0.1);
        p('planks', k, x + ox, y + oy, z + 0.62, sx, sy, 0.1);
      }
      if (!any) {
        p('planks', k, x + 0.1, y + 0.46, z + 0.3, 0.8, 0.08, 0.1);
        p('planks', k, x + 0.1, y + 0.46, z + 0.62, 0.8, 0.08, 0.1);
      }
      break;
    }
    case 'chair':
      for (const [lx, ly] of [[0.25, 0.25], [0.67, 0.25], [0.25, 0.67], [0.67, 0.67]]) p('planks', k, x + lx, y + ly, z, 0.08, 0.08, 0.4);
      p('planks', k, x + 0.22, y + 0.22, z + 0.4, 0.56, 0.56, 0.08);
      p('planks', k, x + 0.22, y + 0.22, z + 0.48, 0.56, 0.08, 0.5);
      p('solid', k, x + 0.27, y + 0.3, z + 0.48, 0.46, 0.4, 0.05, '#ff9cb8');
      break;
    case 'table':
      for (const [lx, ly] of [[0.14, 0.14], [0.78, 0.14], [0.14, 0.78], [0.78, 0.78]]) p('planks', k, x + lx, y + ly, z, 0.08, 0.08, 0.62);
      p('planks', k, x + 0.08, y + 0.08, z + 0.62, 0.84, 0.84, 0.08);
      p('solid', k, x + 0.4, y + 0.4, z + 0.7, 0.2, 0.2, 0.06, '#ffffff');
      p('solid', k, x + 0.44, y + 0.44, z + 0.76, 0.12, 0.12, 0.06, '#e8473d');
      break;
    case 'bench':
      p('planks', k, x + 0.04, y + 0.3, z, 0.1, 0.4, 0.38);
      p('planks', k, x + 0.86, y + 0.3, z, 0.1, 0.4, 0.38);
      p('planks', k, x + 0.02, y + 0.28, z + 0.38, 0.96, 0.46, 0.08);
      p('planks', k, x + 0.02, y + 0.26, z + 0.46, 0.96, 0.08, 0.38);
      break;
    case 'bed':
      p('planks', k, x + 0.12, y + 0.02, z, 0.76, 0.96, 0.25);
      p('planks', k, x + 0.1, y + 0.0, z, 0.8, 0.1, 0.62);
      p('solid', k, x + 0.15, y + 0.08, z + 0.25, 0.7, 0.86, 0.12, '#ffffff');
      p('solid', k, x + 0.22, y + 0.12, z + 0.37, 0.56, 0.2, 0.08, '#fff6e0');
      p('solid', k, x + 0.14, y + 0.38, z + 0.33, 0.72, 0.6, 0.1, '#ff7eb6');
      p('solid', k, x + 0.14, y + 0.5, z + 0.36, 0.72, 0.06, 0.08, '#ffd23f');
      break;
    case 'shelf': {
      p('planks', k, x + 0.08, y + 0.1, z, 0.84, 0.36, 1.4);
      const books = ['#e8473d', '#4fb3ff', '#ffd23f', '#6bd66b', '#a77bff', '#ff9cb8'];
      for (let r = 0; r < 3; r++) {
        let bx = 0.14;
        for (let i = 0; i < 6; i++) {
          const w = 0.09 + ((i * 7 + r * 3) % 4) * 0.02;
          if (bx + w > 0.86) break;
          p('solid', k, x + bx, y + 0.46, z + 0.12 + r * 0.42, w, 0.04, 0.3 - (i % 3) * 0.04, books[(i + r * 2) % books.length]);
          bx += w + 0.02;
        }
      }
      break;
    }
    case 'lamp':
      p('solid', k, x + 0.38, y + 0.38, z, 0.24, 0.24, 0.08, '#3d3a4a');
      p('solid', k, x + 0.46, y + 0.46, z + 0.08, 0.08, 0.08, 0.95, '#3d3a4a');
      p('solid', k, x + 0.34, y + 0.34, z + 1.03, 0.32, 0.32, 0.06, '#3d3a4a');
      p('glow', k, x + 0.37, y + 0.37, z + 1.09, 0.26, 0.26, 0.26, '#ffe8a3');
      p('solid', k, x + 0.33, y + 0.33, z + 1.35, 0.34, 0.34, 0.06, '#3d3a4a');
      break;
    case 'pot': {
      p('solid', k, x + 0.3, y + 0.3, z, 0.4, 0.4, 0.34, '#d9774a');
      p('solid', k, x + 0.27, y + 0.27, z + 0.3, 0.46, 0.46, 0.08, '#e58a5c');
      p('soil', k, x + 0.32, y + 0.32, z + 0.36, 0.36, 0.36, 0.02);
      p('solid', k, x + 0.47, y + 0.47, z + 0.36, 0.06, 0.06, 0.3, '#3f9c3f');
      p('solid', k, x + 0.38, y + 0.38, z + 0.66, 0.24, 0.24, 0.12, '#ff7eb6');
      p('solid', k, x + 0.46, y + 0.46, z + 0.78, 0.08, 0.08, 0.04, '#ffe066');
      break;
    }
    case 'campfire': {
      ps.clearGroup();
      for (const [sx, sy] of [[0.15, 0.4], [0.68, 0.4], [0.4, 0.15], [0.4, 0.68], [0.2, 0.2], [0.63, 0.2], [0.2, 0.63], [0.63, 0.63]]) {
        p('cobble', k, x + sx, y + sy, z, 0.17, 0.17, 0.14);
      }
      p('trunk', k, x + 0.28, y + 0.44, z + 0.04, 0.44, 0.12, 0.12);
      p('trunk', k, x + 0.44, y + 0.28, z + 0.1, 0.12, 0.44, 0.12);
      const t = now / 120;
      const f = (i) => 0.75 + Math.sin(t + i * 2.1) * 0.25;
      p('glow', k, x + 0.36, y + 0.36, z + 0.18, 0.28, 0.28, 0.26 * f(0), '#ff8a3d');
      p('glow', k, x + 0.4, y + 0.4, z + 0.3, 0.2, 0.2, 0.3 * f(1), '#ffb13d');
      p('glow', k, x + 0.45, y + 0.45, z + 0.45, 0.1, 0.1, 0.22 * f(2), '#ffe066');
      break;
    }
    case 'mailbox':
      p('planks', k, x + 0.45, y + 0.45, z, 0.1, 0.1, 0.7);
      p('solid', k, x + 0.32, y + 0.3, z + 0.7, 0.36, 0.44, 0.28, '#e8473d');
      p('solid', k, x + 0.3, y + 0.74, z + 0.75, 0.04, 0.04, 0.3, '#ffd23f');
      p('solid', k, x + 0.36, y + 0.73, z + 0.76, 0.28, 0.02, 0.06, '#3d3a4a');
      break;
    case 'fountain':
      ps.clearGroup();
      p('cobble', k, x + 0.04, y + 0.04, z, 0.92, 0.92, 0.12);
      p('cobble', k, x + 0.04, y + 0.04, z + 0.12, 0.92, 0.1, 0.22);
      p('cobble', k, x + 0.04, y + 0.86, z + 0.12, 0.92, 0.1, 0.22);
      p('cobble', k, x + 0.04, y + 0.14, z + 0.12, 0.1, 0.72, 0.22);
      p('cobble', k, x + 0.86, y + 0.14, z + 0.12, 0.1, 0.72, 0.22);
      p('solid', k, x + 0.14, y + 0.14, z + 0.12, 0.72, 0.72, 0.16, '#5ec8f0');
      p('cobble', k, x + 0.4, y + 0.4, z + 0.12, 0.2, 0.2, 0.55);
      p('solid', k, x + 0.32, y + 0.32, z + 0.67, 0.36, 0.36, 0.08, '#ffb3c1');
      p('glow', k, x + 0.44, y + 0.44, z + 0.75, 0.12, 0.12, 0.18 + Math.sin(now / 200) * 0.04, '#bfeaff');
      break;
    case 'statue':
      p('cobble', k, x + 0.15, y + 0.15, z, 0.7, 0.7, 0.35);
      p('solid', k, x + 0.3, y + 0.22, z + 0.35, 0.08, 0.08, 0.22, '#fbf7ff');
      p('solid', k, x + 0.62, y + 0.22, z + 0.35, 0.08, 0.08, 0.22, '#fbf7ff');
      p('solid', k, x + 0.3, y + 0.62, z + 0.35, 0.08, 0.08, 0.22, '#fbf7ff');
      p('solid', k, x + 0.62, y + 0.62, z + 0.35, 0.08, 0.08, 0.22, '#fbf7ff');
      p('solid', k, x + 0.28, y + 0.2, z + 0.57, 0.44, 0.52, 0.22, '#fbf7ff');
      p('solid', k, x + 0.33, y + 0.62, z + 0.68, 0.34, 0.3, 0.3, '#fbf7ff');
      p('solid', k, x + 0.46, y + 0.72, z + 0.98, 0.08, 0.08, 0.22, '#ffd23f');
      p('solid', k, x + 0.44, y + 0.5, z + 0.8, 0.12, 0.14, 0.24, '#ff7eb6');
      p('solid', k, x + 0.44, y + 0.12, z + 0.55, 0.12, 0.12, 0.26, '#b48cff');
      break;
    case 'rocket':
      p('cobble', k, x + 0.2, y + 0.2, z, 0.6, 0.6, 0.08);
      p('solid', k, x + 0.32, y + 0.32, z + 0.08, 0.36, 0.36, 1.1, '#e9eef5');
      p('solid', k, x + 0.36, y + 0.36, z + 1.18, 0.28, 0.28, 0.2, '#e8473d');
      p('solid', k, x + 0.42, y + 0.42, z + 1.38, 0.16, 0.16, 0.14, '#e8473d');
      p('glow', k, x + 0.4, y + 0.66, z + 0.75, 0.2, 0.04, 0.2, '#7fdcff');
      p('solid', k, x + 0.12, y + 0.42, z + 0.08, 0.2, 0.16, 0.4, '#e8473d');
      p('solid', k, x + 0.68, y + 0.42, z + 0.08, 0.2, 0.16, 0.4, '#e8473d');
      p('solid', k, x + 0.42, y + 0.12, z + 0.08, 0.16, 0.2, 0.4, '#e8473d');
      break;
    case 'rainbow': {
      for (let b = 0; b < RAINBOW.length; b++) {
        const r = 0.5 - b * 0.06;
        for (let i = 0; i <= 8; i++) {
          const a = Math.PI * i / 8;
          const cx = 0.5 + Math.cos(a) * r, cz = Math.sin(a) * r * 1.6;
          p('solid', k, x + cx - 0.05, y + 0.44, z + cz, 0.1, 0.12, 0.1, RAINBOW[b]);
        }
      }
      p('solid', k, x + 0.0, y + 0.38, z, 0.2, 0.24, 0.12, '#ffffff');
      p('solid', k, x + 0.8, y + 0.38, z, 0.2, 0.24, 0.12, '#ffffff');
      break;
    }
  }
  ps.clearGroup();
}
