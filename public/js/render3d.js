// WebGL renderer: real 3D blocks, light and shadows, seen from an isometric-style camera.
import * as THREE from 'three';
import { T } from './data.js';
import { key } from './worldgen.js';
import { refresh } from './sim.js';
import { BUILDS } from './data.js';
import { PartSet, drawTree, drawNature, drawBuild } from './models.js';
import { makeTextures } from './textures.js';
import { makeCharacter } from './characters.js';

const WATER_Y = 0.82;
const SKY = '#a9e0f5';

export class Renderer3D {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    // Quality steps down by itself if frames get slow (older iPads, phones).
    this.low = /[?&]low\b/.test(location.search);
    this.maxRatio = this.low ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    this.gl.setPixelRatio(this.maxRatio);
    this.gl.shadowMap.enabled = !this.low;
    this.frameTimes = [];
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 40, 80);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.5, 200);
    this.yaw = Math.PI / 4;
    this.yawTarget = this.yaw;
    this.pitch = 0.92;
    this.dist = 16;
    this.target = new THREE.Vector3();

    this.scene.add(new THREE.HemisphereLight('#e4f6ff', '#6f9a52', 1.6));
    const sun = new THREE.DirectionalLight('#fff1d6', 2.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    const sc = sun.shadow.camera;
    sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);
    this.sun = sun;

    this.tex = makeTextures();
    this.raycaster = new THREE.Raycaster();
    this.unitBox = new THREE.BoxGeometry(1, 1, 1);
    this.tmp = new THREE.Object3D();
    this.color = new THREE.Color();

    this.chars = new Map();
    this.tags = new Map();
    this.bubbles = new Map();
    this.floaters = [];
    this.particles = [];
    this.shakes = new Map();
    this.fallers = [];
    this.world = null;
    this.layers = [];
    this.natureDirty = true;
    this.lastNature = 0;

    this.makeParticles();
    this.makeMarker();
    this.resize();
  }

  resize() {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.gl.setSize(this.W, this.H, false);
    this.camera.aspect = this.W / this.H;
    this.camera.updateProjectionMatrix();
    if (!this.userDist) this.dist = this.W < 600 ? 12 : 14;
  }

  zoomBy(f) {
    this.dist = Math.max(7, Math.min(32, this.dist / f));
    this.userDist = true;
  }

  rotate(dir) { this.yawTarget += dir * Math.PI / 4; }

  // ---------------------------------------------------------------- world
  setWorld(world) {
    for (const l of this.layers) { this.scene.remove(l); l.dispose?.(); }
    this.layers = [];
    for (const c of this.chars.values()) this.scene.remove(c.root);
    this.chars.clear();
    for (const t of this.tags.values()) t.remove();
    this.tags.clear();
    for (const b of this.bubbles.values()) b.remove();
    this.bubbles.clear();
    this.world = world;
    if (!world) return;
    this.buildTerrain(world);
    this.buildNature();
    this.natureDirty = true;
  }

  instanced(material, count, opts = {}) {
    const m = new THREE.InstancedMesh(opts.geo || this.unitBox, material, Math.max(1, count));
    m.castShadow = opts.cast !== false;
    m.receiveShadow = true;
    m.count = 0;
    this.scene.add(m);
    this.layers.push(m);
    return m;
  }

  buildTerrain(w) {
    const N = w.size, tx = this.tex;
    const L = (map) => new THREE.MeshLambertMaterial({ map });
    const grassMats = [L(tx.grassSide), L(tx.grassSide), L(tx.grassTop), L(tx.dirt), L(tx.grassSide), L(tx.grassSide)];
    let grassN = 0, dirtN = 0, sandN = 0;
    for (let i = 0; i < N * N; i++) {
      if (w.terrain[i] === T.GRASS) { grassN++; dirtN += w.height[i]; } else if (w.terrain[i] === T.SAND) sandN += w.height[i];
    }
    const grass = this.instanced(grassMats, grassN);
    const dirt = this.instanced(L(tx.dirt), dirtN);
    const sand = this.instanced(L(tx.sand), sandN);
    grass.userData.tiles = []; dirt.userData.tiles = []; sand.userData.tiles = [];

    const put = (mesh, x, y, level, shade) => {
      this.tmp.position.set(x + 0.5, level + 0.5, y + 0.5);
      this.tmp.scale.set(1, 1, 1);
      this.tmp.updateMatrix();
      mesh.setMatrixAt(mesh.count, this.tmp.matrix);
      mesh.setColorAt(mesh.count, this.color.setScalar(shade));
      mesh.userData.tiles.push({ x, y });
      mesh.count++;
    };

    const foam = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x, t = w.terrain[i], h = w.height[i];
        const shade = ((x + y) & 1) ? 1 : 0.94;
        if (t === T.GRASS) {
          for (let l = 0; l < h - 1; l++) put(dirt, x, y, l, 0.92);
          put(grass, x, y, h - 1, shade);
        } else if (t === T.SAND) {
          for (let l = 0; l < h; l++) put(sand, x, y, l, l === h - 1 ? shade : 0.9);
        } else {
          const land = (ax, ay) => ax >= 0 && ay >= 0 && ax < N && ay < N && w.terrain[ay * N + ax] !== T.WATER;
          if (land(x - 1, y) || land(x + 1, y) || land(x, y - 1) || land(x, y + 1)) foam.push({ x, y });
        }
      }
    }
    for (const m of [grass, dirt, sand]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); }
    this.terrainMeshes = [grass, dirt, sand];

    // Sea floor and water.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(N + 160, N + 160), new THREE.MeshLambertMaterial({ color: '#e3cf8e' }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(N / 2, 0.02, N / 2);
    floor.receiveShadow = true;
    this.scene.add(floor); this.layers.push(floor);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(N + 160, N + 160),
      new THREE.MeshLambertMaterial({ color: '#3fa9d6', transparent: true, opacity: 0.72 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(N / 2, WATER_Y, N / 2);
    water.receiveShadow = true;
    this.scene.add(water); this.layers.push(water);
    this.water = water;

    // Soft white foam where waves meet the beach.
    const foamMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false });
    const foamMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), foamMat, Math.max(1, foam.length));
    foam.forEach((f, i) => {
      this.tmp.position.set(f.x + 0.5, WATER_Y + 0.01, f.y + 0.5);
      this.tmp.rotation.set(-Math.PI / 2, 0, 0);
      this.tmp.scale.set(0.96, 0.96, 1);
      this.tmp.updateMatrix();
      foamMesh.setMatrixAt(i, this.tmp.matrix);
    });
    this.tmp.rotation.set(0, 0, 0);
    this.scene.add(foamMesh); this.layers.push(foamMesh);
    this.foam = foamMesh;
  }

  buildNature() {
    this.ps = new PartSet(this.scene, this.tex, 3000);
    this.layers.push(...Object.values(this.ps.meshes));
  }

  // A chopped tree tips over and shrinks away.
  fall(x, y, type, now) {
    const z = this.world.height[y * this.world.size + x];
    const c = this.camAxes().right;
    this.fallers.push({ x, y, z, type, t0: now, dir: Math.atan2(-c.y, c.x) });
    this.natureDirty = true;
  }

  rebuildNature(now) {
    const w = this.world, ps = this.ps;
    ps.begin();
    let busy = false, animated = false;
    for (const k in w.objects) {
      const o = refresh(w.objects[k], now);
      const [x, y] = k.split(',').map(Number);
      const z = w.height[y * w.size + x];
      let dx = 0;
      const sk = this.shakes.get(k);
      if (sk && sk > now) { dx = Math.sin(now / 22) * 0.06; busy = true; }
      if (o.type === 'build') {
        const nb = (ax, ay) => w.objects[key(x + ax, y + ay)]?.id === o.id;
        drawBuild(ps, k, o, x, y, z, now, nb);
        if (BUILDS[o.id]?.animated) animated = true;
      } else {
        drawNature(ps, k, o, x, y, z, now, dx);
        if (o.type === 'sapling') animated = true;
      }
    }
    this.fallers = this.fallers.filter((f) => {
      const t = (now - f.t0) / 700;
      if (t >= 1) return false;
      busy = true;
      ps.setGroup(f.x, f.y, f.z, { scale: 1 - Math.max(0, t - 0.6) * 2.5, tip: Math.min(1, t * 1.6) * Math.PI / 2, tipDir: f.dir });
      drawTree(ps, null, f.type, f.x, f.y, f.z, 0);
      ps.clearGroup();
      return true;
    });
    ps.end();
    this.natureDirty = busy;
    this.growing = animated;
  }

  // Pictures of each buildable thing for the build menu, made once with a small second renderer.
  thumbnails(ids, BUILDSDEF) {
    const size = 128;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(size, size, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#8a9a7a', 2.2));
    const sun = new THREE.DirectionalLight('#fff4e0', 1.6);
    sun.position.set(-3, 6, 4);
    scene.add(sun);
    const ps = new PartSet(scene, this.tex, 400);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
    const out = {};
    for (const id of ids) {
      ps.begin();
      const o = { type: 'build', id, rot: 0, h: BUILDSDEF[id].stack ? 2 : 1 };
      const half = (BUILDSDEF[id].size || 1) / 2;
      drawBuild(ps, null, o, -half, -half, 0, 1000, (dx) => dx !== 0);
      ps.end();
      const tall = half > 0.5 ? 2.1 : id === 'shelf' || id === 'rocket' || id === 'lamp' || o.h > 1 ? 1.25 : 0.85;
      cam.left = -tall; cam.right = tall; cam.top = tall; cam.bottom = -tall;
      cam.position.set(4, 4.2, 4);
      cam.lookAt(0, tall * 0.55, 0);
      cam.updateProjectionMatrix();
      r.render(scene, cam);
      out[id] = r.domElement.toDataURL();
    }
    r.dispose();
    r.forceContextLoss?.();
    return out;
  }

  markDirty() { this.natureDirty = true; }

  shake(x, y, now) { this.shakes.set(key(x, y), now + 260); this.natureDirty = true; }

  // ---------------------------------------------------------------- effects
  makeParticles() {
    this.pmesh = new THREE.InstancedMesh(this.unitBox, new THREE.MeshLambertMaterial({ color: '#ffffff' }), 240);
    this.pmesh.count = 0;
    this.pmesh.frustumCulled = false;
    this.scene.add(this.pmesh);
  }

  burst(x, y, z, color, n = 8) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + 0.5, y: z + 1 + Math.random() * 0.8, z: y + 0.5,
        vx: (Math.random() - 0.5) * 3, vy: 2.5 + Math.random() * 2.5, vz: (Math.random() - 0.5) * 3,
        life: 0.7 + Math.random() * 0.4, color, s: 0.07 + Math.random() * 0.06,
      });
    }
    if (this.particles.length > 240) this.particles.splice(0, this.particles.length - 240);
  }

  floatText(x, y, z, icon, text) {
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = icon + ' ' + text;
    this.overlay.appendChild(el);
    this.floaters.push({ el, x: x + 0.5, y: z + 2.2, z: y + 0.5, t: 0 });
  }

  makeMarker() {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.4, 24),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    this.scene.add(m);
    this.marker = m;
  }

  // ---------------------------------------------------------------- picking
  ndc(sx, sy) { return new THREE.Vector2((sx / this.W) * 2 - 1, -(sy / this.H) * 2 + 1); }

  pick(sx, sy) {
    if (!this.world) return null;
    this.raycaster.setFromCamera(this.ndc(sx, sy), this.camera);
    const hits = this.raycaster.intersectObjects([...Object.values(this.ps.meshes), ...this.terrainMeshes], false);
    for (const h of hits) {
      const ud = h.object.userData;
      if (ud.keys) {
        const k = ud.keys[h.instanceId];
        if (!k) continue;
        const [x, y] = k.split(',').map(Number);
        return { x, y, obj: this.world.objects[k] || null };
      }
      if (ud.tiles) {
        const t = ud.tiles[h.instanceId];
        return { x: t.x, y: t.y, obj: this.world.objects[key(t.x, t.y)] || null };
      }
    }
    return null;
  }

  // Where the pointer meets a flat floor at height h, in tile coordinates.
  groundPoint(sx, sy, h) {
    this.raycaster.setFromCamera(this.ndc(sx, sy), this.camera);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), p)) return null;
    return { x: p.x, y: p.z };
  }

  // Camera-relative directions for the keyboard.
  camAxes() {
    const f = { x: -Math.sin(this.yaw), y: -Math.cos(this.yaw) };
    return { fwd: f, right: { x: -f.y, y: f.x } };
  }

  // ---------------------------------------------------------------- frame
  syncPlayers(players, t, dt) {
    const seen = new Set();
    for (const p of players) {
      seen.add(p.id);
      let c = this.chars.get(p.id);
      if (!c || c.kind !== p.kind) {
        if (c) this.scene.remove(c.root);
        c = makeCharacter(p.kind);
        c.kind = p.kind;
        c.angle = p.angle || 0;
        c.root.userData.actor = p.id;
        this.scene.add(c.root);
        this.chars.set(p.id, c);
      }
      let da = (p.angle || 0) - c.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      c.angle += da * Math.min(1, dt * 12);
      const hop = p.swing && p.swing > Date.now() ? Math.sin((p.swing - Date.now()) / 200 * Math.PI) * 0.15 : 0;
      c.root.position.set(p.x, p.z + hop, p.y);
      c.root.rotation.y = c.angle;
      c.update(dt, p.moving, t);

      let tag = this.tags.get(p.id);
      if (p.name) {
        if (!tag) { tag = document.createElement('div'); tag.className = 'nametag'; this.overlay.appendChild(tag); this.tags.set(p.id, tag); }
        if (tag.textContent !== p.name) tag.textContent = p.name;
        this.place(tag, p.x, p.z + 1.25, p.y);
      } else if (tag) { tag.remove(); this.tags.delete(p.id); }

      // Thought bubble with what a villager wishes for.
      let bub = this.bubbles.get(p.id);
      if (p.bubble) {
        if (!bub) { bub = document.createElement('div'); bub.className = 'bubble'; this.overlay.appendChild(bub); this.bubbles.set(p.id, bub); }
        if (bub.dataset.html !== p.bubble) { bub.innerHTML = p.bubble; bub.dataset.html = p.bubble; }
        this.place(bub, p.x, p.z + 1.75 + Math.sin(t * 2.5) * 0.04, p.y);
      } else if (bub) { bub.remove(); this.bubbles.delete(p.id); }
    }
    for (const [id, c] of this.chars) {
      if (seen.has(id)) continue;
      this.scene.remove(c.root); this.chars.delete(id);
      this.tags.get(id)?.remove(); this.tags.delete(id);
      this.bubbles.get(id)?.remove(); this.bubbles.delete(id);
    }
  }

  // Which character is under a screen point, if any.
  pickActor(sx, sy) {
    this.raycaster.setFromCamera(this.ndc(sx, sy), this.camera);
    const roots = [...this.chars.values()].map((c) => c.root);
    const hit = this.raycaster.intersectObjects(roots, true)[0];
    let o = hit?.object;
    while (o && !o.userData.actor) o = o.parent;
    return o ? o.userData.actor : null;
  }

  place(el, x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.transform = `translate(${((v.x + 1) / 2) * this.W}px, ${((1 - v.y) / 2) * this.H}px) translate(-50%, -100%)`;
  }

  // Watch frame times and lower resolution, then shadows, when the device struggles.
  adapt(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (avg < 0.024) return;
    const r = this.gl.getPixelRatio();
    if (r > 1.01) this.gl.setPixelRatio(Math.max(1, r - 0.5));
    else if (this.gl.shadowMap.enabled) {
      this.gl.shadowMap.enabled = false;
      this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
    }
    this.gl.setSize(this.W, this.H, false);
  }

  render({ players = [], marker = null, focus, t, dt, now }) {
    if (!this.world) return;
    this.adapt(dt);
    // Camera follows the focus point.
    this.yaw += (this.yawTarget - this.yaw) * Math.min(1, dt * 8);
    const k = Math.min(1, dt * 5);
    this.target.x += (focus.x - this.target.x) * k;
    this.target.y += (focus.z + 0.5 - this.target.y) * k;
    this.target.z += (focus.y - this.target.z) * k;
    const cp = Math.cos(this.pitch) * this.dist;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp,
    );
    this.camera.lookAt(this.target);

    this.sun.position.set(this.target.x - 10, this.target.y + 22, this.target.z + 6);
    this.sun.target.position.copy(this.target);

    if (this.natureDirty || now - this.lastNature > (this.growing ? 200 : 1000)) { this.rebuildNature(now); this.lastNature = now; }

    this.foam.material.opacity = 0.35 + Math.sin(t * 1.6) * 0.15;
    this.water.position.y = WATER_Y + Math.sin(t * 0.9) * 0.025;

    this.syncPlayers(players, t, dt);

    if (marker) {
      this.marker.visible = true;
      const h = this.world.height[marker.y * this.world.size + marker.x];
      this.marker.position.set(marker.x + 0.5, h + 0.02, marker.y + 0.5);
      const s = 1 + Math.sin(t * 8) * 0.12;
      this.marker.scale.set(s, s, s);
    } else this.marker.visible = false;

    // Particles.
    this.particles = this.particles.filter((q) => (q.life -= dt) > 0);
    this.pmesh.count = this.particles.length;
    this.particles.forEach((q, i) => {
      q.vy -= 12 * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      this.tmp.position.set(q.x, q.y, q.z);
      const s = q.s * Math.min(1, q.life * 3);
      this.tmp.scale.set(s, s, s);
      this.tmp.updateMatrix();
      this.pmesh.setMatrixAt(i, this.tmp.matrix);
      this.pmesh.setColorAt(i, this.color.set(q.color));
    });
    this.pmesh.instanceMatrix.needsUpdate = true;
    if (this.pmesh.instanceColor) this.pmesh.instanceColor.needsUpdate = true;

    this.gl.render(this.scene, this.camera);

    // DOM floaters after the camera is placed.
    this.floaters = this.floaters.filter((f) => {
      f.t += dt;
      if (f.t > 1.1) { f.el.remove(); return false; }
      this.place(f.el, f.x, f.y + f.t * 1.2, f.z);
      f.el.style.opacity = String(Math.min(1, (1.1 - f.t) * 3));
      return true;
    });
  }
}
