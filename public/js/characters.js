// Full-body voxel animals built from boxes, with a simple walk cycle.
import * as THREE from 'three';

const geo = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map();
function mat(color, emissive) {
  const k = color + (emissive || '');
  if (!mats.has(k)) {
    const m = new THREE.MeshLambertMaterial({ color });
    if (emissive) m.emissive = new THREE.Color(emissive);
    mats.set(k, m);
  }
  return mats.get(k);
}

function box(parent, w, h, d, color, x, y, z, emissive) {
  const m = new THREE.Mesh(geo, mat(color, emissive));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// A leg that swings from the hip.
function leg(parent, w, h, color, x, y, z, foot) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  box(pivot, w, h, w, color, 0, -h / 2, 0);
  if (foot) box(pivot, w * 1.05, 0.05, w * 1.05, foot, 0, -h + 0.025, 0);
  parent.add(pivot);
  return pivot;
}

const PALETTE = {
  unicorn: { body: '#fbf7ff', dark: '#e9def7', accent: '#ff7eb6', accent2: '#b48cff', foot: '#c9b3e6' },
  cat: { body: '#f4a259', dark: '#d9853c', accent: '#ffd9b0', foot: '#ffd9b0' },
  dog: { body: '#c98d5a', dark: '#7a4f2c', accent: '#f3e0c8', foot: '#7a4f2c' },
  bunny: { body: '#f5f1ec', dark: '#d9d2ca', accent: '#ffb3c8', foot: '#e6ddd3' },
  frog: { body: '#69c35a', dark: '#4f9e43', accent: '#e6f5a6', foot: '#4f9e43' },
  fox: { body: '#e8742f', dark: '#3a2a22', accent: '#fff4e6', foot: '#3a2a22' },
  panda: { body: '#f7f7f2', dark: '#2b2b33', accent: '#2b2b33', foot: '#2b2b33' },
  bear: { body: '#a8714a', dark: '#7a4f2c', accent: '#e8c9a0', foot: '#7a4f2c' },
  pig: { body: '#ffb8c8', dark: '#f08da6', accent: '#ff9cb8', foot: '#e07b95' },
  robot: { body: '#c9d3df', dark: '#7d8aa0', accent: '#4fd2ff', foot: '#5b667a' },
};

export function makeCharacter(kind) {
  const p = PALETTE[kind] || PALETTE.cat;
  const root = new THREE.Group();   // placed in the world, rotates to face
  const bodyG = new THREE.Group();  // bobs while walking
  root.add(bodyG);
  bodyG.scale.setScalar(1.35);
  const legs = [];
  let tail = null;
  let head;

  if (kind === 'robot') {
    // A friendly little droid on two legs.
    legs.push(leg(bodyG, 0.13, 0.26, p.dark, -0.1, 0.28, 0, p.foot));
    legs.push(leg(bodyG, 0.13, 0.26, p.dark, 0.1, 0.28, 0, p.foot));
    box(bodyG, 0.38, 0.32, 0.28, p.body, 0, 0.44, 0);
    box(bodyG, 0.2, 0.08, 0.02, p.accent, 0, 0.47, 0.145, p.accent);
    box(bodyG, 0.06, 0.22, 0.08, p.dark, -0.23, 0.44, 0);
    box(bodyG, 0.06, 0.22, 0.08, p.dark, 0.23, 0.44, 0);
    head = new THREE.Group();
    head.position.set(0, 0.74, 0);
    box(head, 0.4, 0.28, 0.32, p.body, 0, 0, 0);
    box(head, 0.32, 0.1, 0.02, '#1d2333', 0, 0.02, 0.165);
    box(head, 0.07, 0.05, 0.02, p.accent, -0.08, 0.02, 0.175, p.accent);
    box(head, 0.07, 0.05, 0.02, p.accent, 0.08, 0.02, 0.175, p.accent);
    box(head, 0.03, 0.14, 0.03, p.dark, 0.12, 0.2, 0);
    box(head, 0.06, 0.06, 0.06, '#ff6f6f', 0.12, 0.29, 0, '#ff3030');
    bodyG.add(head);
    return finish(root, bodyG, head, legs, tail, true);
  }

  const frog = kind === 'frog';
  const legH = frog ? 0.14 : 0.24;
  const bodyY = legH + (frog ? 0.12 : 0.14);
  const bw = frog ? 0.46 : 0.34, bh = frog ? 0.24 : 0.28, bd = frog ? 0.44 : 0.52;
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    legs.push(leg(bodyG, 0.11, legH, kind === 'panda' ? p.dark : p.body, x * (bw / 2 - 0.07), legH, z * (bd / 2 - 0.08), p.foot));
  }
  box(bodyG, bw, bh, bd, p.body, 0, bodyY, 0);
  if (kind === 'fox') box(bodyG, bw * 0.7, bh * 0.6, 0.05, p.accent, 0, bodyY - 0.03, bd / 2);
  if (kind === 'panda') box(bodyG, bw + 0.01, bh * 0.45, bd * 0.35, p.dark, 0, bodyY + 0.02, bd * 0.18);

  head = new THREE.Group();
  const hs = frog ? 0.36 : 0.34;
  head.position.set(0, bodyY + (frog ? 0.12 : 0.24), bd / 2 - (frog ? 0.02 : 0.02));
  bodyG.add(head);
  box(head, hs, hs * (frog ? 0.7 : 0.92), hs, p.body, 0, 0, 0);
  // Eyes and cheeks.
  const ey = frog ? hs * 0.42 : 0.03, ez = hs / 2 + 0.005;
  if (frog) {
    box(head, 0.12, 0.1, 0.12, p.body, -0.11, ey, 0.06);
    box(head, 0.12, 0.1, 0.12, p.body, 0.11, ey, 0.06);
    box(head, 0.06, 0.06, 0.02, '#1b1b22', -0.11, ey + 0.01, 0.125);
    box(head, 0.06, 0.06, 0.02, '#1b1b22', 0.11, ey + 0.01, 0.125);
    box(head, 0.18, 0.02, 0.02, '#c0457a', 0, -0.05, ez);
  } else {
    if (kind === 'panda') {
      box(head, 0.1, 0.09, 0.02, p.dark, -0.08, ey, ez);
      box(head, 0.1, 0.09, 0.02, p.dark, 0.08, ey, ez);
    }
    box(head, 0.05, 0.07, 0.02, '#1b1b22', -0.08, ey, ez + 0.006);
    box(head, 0.05, 0.07, 0.02, '#1b1b22', 0.08, ey, ez + 0.006);
    box(head, 0.02, 0.025, 0.021, '#ffffff', -0.07, ey + 0.02, ez + 0.012);
    box(head, 0.02, 0.025, 0.021, '#ffffff', 0.09, ey + 0.02, ez + 0.012);
    box(head, 0.06, 0.03, 0.02, '#ff9cb8', -0.13, ey - 0.07, ez);
    box(head, 0.06, 0.03, 0.02, '#ff9cb8', 0.13, ey - 0.07, ez);
    // Snout.
    const snout = kind === 'dog' || kind === 'fox' || kind === 'bear' ? p.accent : kind === 'unicorn' ? p.dark : kind === 'pig' ? p.dark : null;
    if (snout) box(head, 0.16, 0.1, 0.08, snout, 0, -0.08, ez + 0.03);
    box(head, 0.05, 0.035, 0.02, '#3a2a2a', 0, -0.05, ez + (snout ? 0.075 : 0.004));
  }

  // Ears and special bits.
  if (kind === 'cat' || kind === 'fox') {
    box(head, 0.09, 0.1, 0.06, kind === 'fox' ? p.body : p.body, -0.11, hs / 2 + 0.05, -0.04);
    box(head, 0.09, 0.1, 0.06, p.body, 0.11, hs / 2 + 0.05, -0.04);
    box(head, 0.05, 0.05, 0.02, kind === 'fox' ? p.dark : '#ff9cb8', -0.11, hs / 2 + 0.07, -0.005);
    box(head, 0.05, 0.05, 0.02, kind === 'fox' ? p.dark : '#ff9cb8', 0.11, hs / 2 + 0.07, -0.005);
  } else if (kind === 'dog') {
    box(head, 0.06, 0.18, 0.1, p.dark, -hs / 2 - 0.02, 0.0, -0.02);
    box(head, 0.06, 0.18, 0.1, p.dark, hs / 2 + 0.02, 0.0, -0.02);
  } else if (kind === 'bunny') {
    box(head, 0.08, 0.28, 0.05, p.body, -0.08, hs / 2 + 0.14, -0.04);
    box(head, 0.08, 0.28, 0.05, p.body, 0.08, hs / 2 + 0.14, -0.04);
    box(head, 0.04, 0.2, 0.01, p.accent, -0.08, hs / 2 + 0.14, -0.01);
    box(head, 0.04, 0.2, 0.01, p.accent, 0.08, hs / 2 + 0.14, -0.01);
  } else if (kind === 'bear') {
    box(head, 0.1, 0.1, 0.06, p.body, -0.13, hs / 2 + 0.03, -0.04);
    box(head, 0.1, 0.1, 0.06, p.body, 0.13, hs / 2 + 0.03, -0.04);
  } else if (kind === 'pig') {
    box(head, 0.09, 0.07, 0.06, p.dark, -0.12, hs / 2 + 0.02, 0.02).rotation.x = 0.4;
    box(head, 0.09, 0.07, 0.06, p.dark, 0.12, hs / 2 + 0.02, 0.02).rotation.x = 0.4;
  } else if (kind === 'panda') {
    box(head, 0.09, 0.09, 0.06, p.dark, -0.13, hs / 2 + 0.03, -0.04);
    box(head, 0.09, 0.09, 0.06, p.dark, 0.13, hs / 2 + 0.03, -0.04);
  } else if (kind === 'unicorn') {
    box(head, 0.07, 0.09, 0.05, p.body, -0.1, hs / 2 + 0.04, -0.06);
    box(head, 0.07, 0.09, 0.05, p.body, 0.1, hs / 2 + 0.04, -0.06);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.26, 6), mat('#ffd23f', '#5a4400'));
    horn.position.set(0, hs / 2 + 0.13, 0.06);
    horn.rotation.x = 0.25;
    horn.castShadow = true;
    head.add(horn);
    // Mane in two colours down the back of the head and neck.
    box(head, 0.1, 0.12, 0.1, p.accent, 0, hs / 2 + 0.02, -0.06);
    box(head, 0.1, 0.22, 0.08, p.accent2, 0, 0.0, -hs / 2 - 0.03);
    box(bodyG, 0.1, 0.1, 0.18, p.accent, 0, bodyY + bh / 2 + 0.04, bd / 2 - 0.16);
  }

  // Tails.
  tail = new THREE.Group();
  tail.position.set(0, bodyY + 0.06, -bd / 2);
  bodyG.add(tail);
  if (kind === 'unicorn') {
    box(tail, 0.1, 0.12, 0.12, p.accent, 0, 0, -0.05);
    box(tail, 0.1, 0.18, 0.1, p.accent2, 0, -0.1, -0.1);
  } else if (kind === 'cat') {
    box(tail, 0.07, 0.07, 0.3, p.dark, 0, 0.1, -0.12).rotation.x = -0.8;
  } else if (kind === 'fox') {
    box(tail, 0.14, 0.14, 0.3, p.body, 0, 0.02, -0.14);
    box(tail, 0.15, 0.15, 0.08, p.accent, 0, 0.02, -0.3);
  } else if (kind === 'dog') {
    box(tail, 0.06, 0.06, 0.18, p.body, 0, 0.06, -0.07).rotation.x = -0.6;
  } else if (kind === 'pig') {
    box(tail, 0.05, 0.05, 0.1, p.dark, 0, 0.04, -0.03).rotation.z = 0.8;
  } else if (kind === 'bunny' || kind === 'panda' || kind === 'bear') {
    box(tail, 0.12, 0.12, 0.08, kind === 'panda' ? p.dark : '#ffffff', 0, 0, -0.02);
  }

  return finish(root, bodyG, head, legs, tail, false);
}

function finish(root, bodyG, head, legs, tail, biped) {
  let phase = 0;
  return {
    root,
    // `waving`: lift a front paw (a hand, for the robot) and wiggle it hello.
    update(dt, moving, t, waving = false) {
      if (moving) phase += dt * 13;
      const swing = moving ? Math.sin(phase) * 0.7 : 0;
      const k = Math.min(1, dt * 20);
      legs.forEach((l, i) => {
        let s = biped ? (i ? -swing : swing) : (i === 0 || i === 3 ? swing : -swing);
        let wz = 0;
        if (waving && i === 1) { s = -2.3; wz = Math.sin(t * 16) * 0.45; }
        l.rotation.x += (s - l.rotation.x) * k;
        l.rotation.z += (wz - l.rotation.z) * k;
      });
      bodyG.position.y = moving ? Math.abs(Math.sin(phase)) * 0.05 : Math.sin(t * 2) * 0.01;
      head.rotation.z = moving ? 0 : Math.sin(t * 1.3) * 0.05;
      if (tail) tail.rotation.y = Math.sin(t * (moving ? 10 : 3)) * 0.35;
    },
  };
}

// ---------------------------------------------------------------- little animals
// Butterflies, bees and friends that visit the island. Each wanders around its own tile;
// `seed` makes every one move a little differently.
export function makeBug(kind, seed = 0) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const wings = [];
  const segs = [];
  const ph = seed * 2.4;
  switch (kind) {
    case 'butterfly': {
      box(body, 0.04, 0.04, 0.16, '#2b2646', 0, 0, 0);
      for (const sx of [-1, 1]) {
        const wg = new THREE.Group();
        box(wg, 0.16, 0.02, 0.2, '#ff7eb6', sx * 0.09, 0, 0.02);
        box(wg, 0.06, 0.025, 0.06, '#ffd23f', sx * 0.11, 0, 0.04);
        box(wg, 0.11, 0.02, 0.12, '#b48cff', sx * 0.07, 0, -0.1);
        body.add(wg);
        wings.push([wg, sx]);
      }
      break;
    }
    case 'bee': {
      box(body, 0.12, 0.11, 0.18, '#ffd23f', 0, 0, 0);
      box(body, 0.125, 0.115, 0.04, '#2b2646', 0, 0, -0.02);
      box(body, 0.125, 0.115, 0.03, '#2b2646', 0, 0, -0.08);
      for (const sx of [-1, 1]) {
        const wg = new THREE.Group();
        wg.position.set(0, 0.06, 0.02);
        box(wg, 0.12, 0.015, 0.08, '#e9f6ff', sx * 0.07, 0, 0);
        body.add(wg);
        wings.push([wg, sx]);
      }
      break;
    }
    case 'ladybug':
      box(body, 0.16, 0.08, 0.18, '#e8322f', 0, 0.04, 0);
      box(body, 0.1, 0.06, 0.06, '#1b1b22', 0, 0.03, 0.11);
      for (const [dx, dz] of [[-0.04, 0.03], [0.045, -0.02], [-0.03, -0.05], [0.03, 0.05]]) box(body, 0.035, 0.02, 0.035, '#1b1b22', dx, 0.085, dz);
      break;
    case 'snail':
      box(body, 0.08, 0.05, 0.26, '#d9c79a', 0, 0.025, 0);
      box(body, 0.14, 0.14, 0.14, '#b77b45', 0, 0.12, -0.03);
      box(body, 0.08, 0.08, 0.145, '#d79b5f', 0, 0.12, -0.03);
      box(body, 0.015, 0.07, 0.015, '#d9c79a', -0.02, 0.08, 0.12);
      box(body, 0.015, 0.07, 0.015, '#d9c79a', 0.02, 0.08, 0.12);
      break;
    case 'cricket':
      box(body, 0.07, 0.07, 0.24, '#6fbf3f', 0, 0.06, 0);
      box(body, 0.08, 0.08, 0.07, '#5aa632', 0, 0.07, 0.13);
      for (const sx of [-1, 1]) box(body, 0.02, 0.1, 0.16, '#4f9a2c', sx * 0.05, 0.08, -0.06);
      break;
    default: // caterpillar
      for (let i = 0; i < 5; i++) segs.push(box(body, 0.08, 0.08, 0.07, i === 4 ? '#3f9c3f' : i % 2 ? '#7fd35c' : '#63c759', 0, 0.04, -0.14 + i * 0.07));
      box(body, 0.02, 0.02, 0.02, '#1b1b22', 0.025, 0.07, 0.15);
      break;
  }
  root.scale.setScalar(1.4); // a bit bigger than life, so small fingers can see them
  return {
    root,
    // Moves the animal around the middle of its tile (cx, cy) on ground height z.
    update(t, cx, cy, z) {
      const T = t + ph;
      let x = 0, y = 0, h = 0, yaw = 0;
      if (kind === 'butterfly' || kind === 'bee') {
        const r = kind === 'bee' ? 0.25 : 0.35;
        x = Math.cos(T * 0.9) * r; y = Math.sin(T * 1.3) * r;
        h = (kind === 'bee' ? 0.6 : 0.7) + Math.sin(T * 2.1) * 0.15;
        yaw = Math.atan2(-Math.sin(T * 0.9) * 0.9, Math.cos(T * 1.3) * 1.3);
        const flap = kind === 'bee' ? Math.sin(T * 60) * 0.5 : Math.sin(T * 14) * 0.9;
        for (const [wg, sx] of wings) wg.rotation.z = sx * flap;
      } else if (kind === 'cricket') {
        const hop = (T * 0.8) % 2;
        const a = Math.floor(T * 0.4) * 2.1;
        const s = Math.min(1, hop);
        x = Math.cos(a) * 0.25 * s; y = Math.sin(a) * 0.25 * s;
        h = hop < 1 ? Math.sin(hop * Math.PI) * 0.35 : 0;
        yaw = a;
      } else {
        const speed = kind === 'snail' ? 0.15 : kind === 'caterpillar' ? 0.25 : 0.5;
        x = Math.cos(T * speed) * 0.25; y = Math.sin(T * speed) * 0.25;
        yaw = Math.atan2(-Math.sin(T * speed), Math.cos(T * speed));
        segs.forEach((sg, i) => { sg.position.y = 0.04 + Math.max(0, Math.sin(T * 6 - i)) * 0.03; });
      }
      root.position.set(cx + x, z + h, cy + y);
      root.rotation.y = yaw;
    },
  };
}
