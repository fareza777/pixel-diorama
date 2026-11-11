// The live 3D diorama for the active island: terrain, water, nature, buildings, villagers and their
// daily routines, the mayor, effects, lamps and picking.
import * as THREE from 'three';
import * as K from '../engine/kit.js';
import { fxMaterial, shared } from '../engine/materials.js';
import { N, HALF, idx, inside, tileCenter, tileAt, WALKABLE, ROADS } from './island.js';
import { BUILDINGS, BIOMES, NODES } from './data.js';
import { buildingModel, nodeGeometry, materialFor, disposeModel, Builder } from './models.js';
import { Crowd } from './people.js';
import { findPath } from './path.js';
import { footprint, WALKABLE_BUILDINGS, SECONDS_PER_GAME_HOUR } from './game.js';

const BASE = -2.6;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (k, s = 0) => {
  let h = Math.imul(k + 1, 2654435761) ^ Math.imul(s + 7, 40503);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

// ---------------------------------------------------------------- terrain colours

const GROUND = {
  desa: { g: ['#6eb156', '#7fc264', '#5f9f4b'], soil: ['#8e6444', '#7f593c'], stone: ['#70737e', '#62646f'], lip: '#5b9547' },
  hutan: { g: ['#4f9a4a', '#5fa852', '#468a42'], soil: ['#7a5236', '#6a4630'], stone: ['#626470', '#565862'], lip: '#3f7a3c' },
  pantai: { g: ['#7fc25a', '#8bcd62', '#72b452'], soil: ['#c9a874', '#b8935e'], stone: ['#8d8a84', '#7a7770'], lip: '#6aa84e' },
  gunung: { g: ['#6a9a5a', '#5f8f52', '#76a462'], soil: ['#6e5a4e', '#5e4c42'], stone: ['#6a7488', '#5a6478'], lip: '#cfd8e6' },
  gurun: { g: ['#8fbf5a', '#9cc864', '#82b152'], soil: ['#d8a35c', '#c8873f'], stone: ['#b8703a', '#a8602f'], lip: '#e2b56e' },
  kota: { g: ['#6fae55', '#7aba5e', '#64a04e'], soil: ['#8d919c', '#7e828c'], stone: ['#6a6e78', '#5e626c'], lip: '#9a9ea8' },
  fantasi: { g: ['#9a7ad8', '#a98ae0', '#8a6ac8'], soil: ['#6a5aa0', '#5a4a90'], stone: ['#4a3a80', '#3e3070'], lip: '#b49af0' },
};
const TYPE_COL = {
  s: ['#e5cf99', '#ead6a4', '#dcc48e'], r: ['#8d909b', '#9a9da8', '#80838e'], n: ['#e9eef6', '#f2f5fa', '#dfe6f0'],
  d: ['#9a7a56', '#8a6a4a'], p: ['#d4b383', '#c9a878', '#dcc092'], a: ['#454852', '#4c4f5a'], v: ['#b9bcc4', '#aeb1ba'],
  m: null, w: ['#c4ad7c', '#9a8c6c'],
};
TYPE_COL.n = ['#f4f8ff', '#ffffff', '#e6eefa'];
const WATER_COL = {
  desa: ['#5fcfc6', '#1f5a96'], hutan: ['#4fb8b0', '#1d4c6a'], pantai: ['#5fe0d0', '#1f6ab0'], gunung: ['#7fc8e0', '#2a5a8a'],
  gurun: ['#5fd8c8', '#1f6a96'], kota: ['#4a8ab0', '#1a3a5a'], fantasi: ['#a8e0ff', '#5a3aa0'],
};
const GRASS_COL = {
  desa: ['#78bb5b', '#68a94f', '#8bc865', '#5c9a47'], hutan: ['#5fa852', '#4f9a4a', '#6ab65a'], pantai: ['#8bcd62', '#7fc25a'],
  gunung: ['#7aa86a', '#6a9a5a'], gurun: ['#9cc864', '#8fbf5a'], kota: ['#7aba5e', '#6fae55'], fantasi: ['#b49af0', '#9a7ad8', '#c9a0ff', '#7df9ff'],
};

// ---------------------------------------------------------------- small particle bursts

class Bursts {
  constructor(max = 320) {
    this.max = max;
    this.p = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = fxMaterial({
      vertexShader: /* glsl */`
        attribute vec4 aCol;
        varying vec4 vC;
        void main() { vC = aCol; gl_PointSize = aCol.a > 0.6 ? 2.0 : 1.0; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec4 vC;
        void main() { if (vC.a < 0.02) discard; gl_FragColor = vec4(vC.rgb, min(1.0, vC.a * 1.4)); gNormal = vec4(0.0); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  emit(at, { n = 12, color = '#ffffff', speed = 1.2, up = 1.2, life = 0.8, gravity = 3, glow = 1 } = {}) {
    const c = new THREE.Color(color).multiplyScalar(glow);
    for (let k = 0; k < n; k++) {
      if (this.p.length >= this.max) this.p.shift();
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      this.p.push({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * s, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * s, t: 0, life: life * (0.6 + Math.random() * 0.6), c, g: gravity });
    }
  }
  update(dt) {
    const P = this.p;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.t += dt;
      if (q.t >= q.life) {
        P.splice(i, 1);
        continue;
      }
      q.vy -= q.g * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      q.vx *= 0.96;
      q.vz *= 0.96;
    }
    for (let i = 0; i < this.max; i++) {
      const q = P[i];
      if (q) {
        this.pos.set([q.x, q.y, q.z], i * 3);
        this.col.set([q.c.r, q.c.g, q.c.b, 1 - q.t / q.life], i * 4);
      } else this.col[i * 4 + 3] = 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aCol.needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(1, P.length));
  }
}

// ---------------------------------------------------------------- tile highlight

function quadMaterial(color) {
  return fxMaterial({
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 e = min(vUv, 1.0 - vUv);
        float edge = step(min(e.x, e.y), 0.06);
        float a = mix(0.22, 0.85, edge) * (0.75 + 0.25 * sin(uTime * 5.0));
        gl_FragColor = vec4(uColor * 1.4, a);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: shared.uTime },
  });
}

// ---------------------------------------------------------------- world

export class World {
  constructor(engine, env, audio, game) {
    this.engine = engine;
    this.env = env;
    this.audio = audio;
    this.game = game;
    this.quality = { grass: 1, mirror: true, lights: 6, smoke: true };
    this.scene = null;
    this.buildings = new Map();
    this.npcs = new Map();
    this.nodeMeshes = new Map();
    this.nodeIndex = new Map();
    this.nodeAnims = new Map();
    this.lights = [];
    this.smokes = [];
    this.presence = new Map();
    this.time = 0;
    this.selected = null;
    this.ghost = null;
    this.raycaster = new THREE.Raycaster();
    this._v = new THREE.Vector3();
    this._grassDirty = false;
    this._lightTimer = 0;
  }

  get I() {
    return this.game.I;
  }

  setQuality(q) {
    const relight = q.lights !== this.quality.lights;
    this.quality = { ...this.quality, ...q };
    if (!this.scene) return;
    if (relight) this._makeLightPool();
    this.engine.mirror = this.quality.mirror && this.hasWater ? { y: 0 } : null;
    this._grassDirty = true;
  }

  // ---------------------------------------------------------------- load / unload

  load() {
    this.dispose();
    const I = this.I, biome = this.game.biome;
    this.biome = biome;
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.hasWater = I.t.includes('w');

    this._buildTerrain();
    if (this.hasWater) this._buildWater();
    this.crowd = new Crowd(110);
    this.root.add(this.crowd.group);
    this.bursts = new Bursts();
    this.root.add(this.bursts.points);
    this.selQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), quadMaterial('#ffd23d'));
    this.selQuad.rotation.x = -Math.PI / 2;
    this.selQuad.visible = false;
    this.selQuad.renderOrder = 3;
    this.root.add(this.selQuad);
    this.ghostQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), quadMaterial('#7fe08a'));
    this.ghostQuad.rotation.x = -Math.PI / 2;
    this.ghostQuad.visible = false;
    this.ghostQuad.renderOrder = 3;
    this.root.add(this.ghostQuad);
    this.markerQuad = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), quadMaterial('#86b8e8'));
    this.markerQuad.rotation.x = -Math.PI / 2;
    this.markerQuad.visible = false;
    this.root.add(this.markerQuad);

    for (const rec of I.buildings) this.addBuilding(rec, true);
    this.rebuildNodes();
    this._buildGrass();
    this._makeLightPool();
    this._spawnPeople();
    this._makeProps();

    const B = BIOMES[biome];
    const maxH = Math.max(...I.h);
    this.info = {
      size: N, top: maxH + 1.2, bottom: BASE,
      surfaceAt: (x, z) => Math.max(this.heightAt(x, z), 0),
      isLand: (x, z) => this.heightAt(x, z) > 0.1,
    };
    this.env.sky = { milky: 0, aurora: 0, moon: 0.9, moonPos: [0.82, 0.8], ...(B.sky || {}) };
    this.env.attach(this.scene, this.info);
    this.engine.mirror = this.quality.mirror && this.hasWater ? { y: 0 } : null;
    this.engine.prepareScene(this.scene);
    this.audio.scene = B.audio || {};
    this.audio.loopLevels = { ...(this.audio.loopLevels?.lofi ? { lofi: this.audio.loopLevels.lofi } : {}) };
    if (this.audio.loops) for (const [name, L] of Object.entries(this.audio.loops)) if (name !== 'lofi') L.gain.gain.value = 0;
    for (const [name, lvl] of Object.entries(B.loops || {})) this.audio.setLoop(name, lvl);
    this._loopBase = { ...(B.loops || {}) };
  }

  dispose() {
    if (!this.scene) return;
    for (const b of this.buildings.values()) disposeModel(b.group);
    this.buildings.clear();
    this.npcs.clear();
    for (const m of this.nodeMeshes.values()) m.dispose();
    this.nodeMeshes.clear();
    this.nodeIndex.clear();
    this.crowd?.dispose();
    this.terrain?.mesh.geometry.dispose();
    this.terrain?.mesh.material.dispose();
    if (this.water) disposeModel(this.water);
    if (this.grass) {
      this.grass.geometry.dispose();
      this.grass.material.dispose();
    }
    if (this.flowers) {
      this.flowers.geometry.dispose();
      this.flowers.material.dispose();
    }
    for (const s of this.smokes) {
      s.geometry.dispose();
      s.material.dispose();
    }
    this.smokes = [];
    this.lights = [];
    this.scene = null;
  }

  // ---------------------------------------------------------------- terrain + water

  heightAt(x, z) {
    const [i, j] = tileAt(x, z);
    const ci = Math.min(N - 1, Math.max(0, i)), cj = Math.min(N - 1, Math.max(0, j));
    return this.I.h[idx(ci, cj)];
  }
  tileH(i, j) {
    return this.I.h[idx(Math.min(N - 1, Math.max(0, i)), Math.min(N - 1, Math.max(0, j)))];
  }

  _buildTerrain() {
    const I = this.I, biome = this.game.biome;
    const G = GROUND[biome];
    const noise = K.noise2(I.seed + 5);
    if (this.terrain) {
      this.root.remove(this.terrain.mesh);
      this.terrain.mesh.geometry.dispose();
      this.terrain.mesh.material.dispose();
    }
    const typeAt = (x, z) => {
      const [i, j] = tileAt(x, z);
      return I.t[idx(Math.min(N - 1, Math.max(0, i)), Math.min(N - 1, Math.max(0, j)))];
    };
    const T = K.terrain({
      size: N, cells: N * 2, step: 0.25, base: BASE,
      height: (x, z) => this.heightAt(x, z),
      top: (x, z, h, c) => {
        const t = typeAt(x, z);
        const v = noise(x * 1.3 + 3, z * 1.3);
        let list = TYPE_COL[t];
        if (t === 'g' || t === 'm' || !list) list = G.g;
        if (t === 's' && biome === 'gurun') list = ['#e7c27a', '#ecca86', '#dfb76c'];
        if (t === 'w') return c.set(h < -0.6 ? list[1] : list[0]);
        if (t === 'a') {
          // lane markings on the centre of city roads
          const fx = x + HALF - Math.floor(x + HALF), fz = z + HALF - Math.floor(z + HALF);
          const [i, j] = tileAt(x, z);
          const horiz = j % 6 === 2 && i % 6 !== 2, vert = i % 6 === 2 && j % 6 !== 2;
          if ((horiz && fz > 0.4 && fz < 0.6 && fx < 0.5) || (vert && fx > 0.4 && fx < 0.6 && fz < 0.5)) return c.set('#d8c060');
        }
        if (t === 'p') {
          const pebble = hash(Math.floor((x + HALF) * 2) * 97 + Math.floor((z + HALF) * 2), 3);
          return c.set(list[Math.floor(pebble * list.length)]);
        }
        const k = v > 0.62 ? 1 : v < 0.38 ? 2 : 0;
        return c.set(list[Math.min(k, list.length - 1)]);
      },
      side: (x, z, y, h, outer, c) => {
        const t = typeAt(x, z);
        if (h - y < 0.11 && h >= 0.2) {
          if (t === 'g' || t === 'm') return c.set(G.lip);
          if (t === 'n') return c.set('#cfd8e6');
          if (t === 's') return c.set('#d4b985');
          if (t === 'a' || t === 'v') return c.set('#8d919c');
        }
        if (y > -1.0) return c.set(Math.floor(y / 0.5) % 2 ? G.soil[0] : G.soil[1]);
        return c.set(Math.floor(y / 0.5) % 2 ? G.stone[0] : G.stone[1]);
      },
    });
    this.terrain = T;
    T.mesh.userData.terrain = true;
    this.root.add(T.mesh);
  }

  _buildWater() {
    const [sh, dp] = WATER_COL[this.game.biome];
    this.water = K.water({ size: N, level: 0, heightAt: (x, z) => this.heightAt(x, z), segments: 44, edgeCells: N * 2, base: BASE, shallow: sh, deep: dp, deepAt: 0.9, reflect: 0.28, wall: [sh, dp] });
    this.root.add(this.water);
  }

  /** Terrain changed (roads, levelling): rebuild the mesh and anything sitting on it. */
  refreshTerrain() {
    this._buildTerrain();
    this._grassDirty = true;
    this.engine._forceShadow = true;
  }

  // ---------------------------------------------------------------- nature nodes

  rebuildNodes() {
    const I = this.I;
    const groups = new Map();
    for (const [key, n] of Object.entries(I.nodes)) {
      if (n.hp === 0) continue;
      const g = `${n.k}:${n.v}`;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(+key);
    }
    for (const m of this.nodeMeshes.values()) m.count = 0;
    this.nodeIndex.clear();
    const dummy = new THREE.Object3D();
    for (const [g, keys] of groups) {
      const [kind, v] = g.split(':');
      const parts = nodeGeometry(kind, +v);
      parts.forEach((part, pi) => {
        const mk = `${g}:${pi}`;
        let mesh = this.nodeMeshes.get(mk);
        if (!mesh) {
          mesh = new THREE.InstancedMesh(part.geo, materialFor(part.bucket), N * N);
          mesh.castShadow = !part.bucket.startsWith('glow');
          mesh.receiveShadow = true;
          mesh.userData.nodeKeys = [];
          mesh.userData.nodeKind = kind;
          this.nodeMeshes.set(mk, mesh);
          this.root.add(mesh);
        }
        mesh.userData.nodeKeys = keys;
        keys.forEach((k, ii) => {
          this._nodeMatrix(dummy, k, 1);
          mesh.setMatrixAt(ii, dummy.matrix);
          if (!this.nodeIndex.has(k)) this.nodeIndex.set(k, []);
          this.nodeIndex.get(k).push({ mesh, i: ii });
        });
        mesh.count = keys.length;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      });
      for (const k of keys) {
        const n = I.nodes[k];
        if (n.fresh) {
          this.nodeAnims.set(k, { t: 0, kind: 'grow' });
          n.fresh = 0;
        }
      }
    }
    this.engine._forceShadow = true;
  }

  _nodeMatrix(o, k, s = 1, shake = 0) {
    const i = Math.floor(k / N), j = k % N;
    const [x, z] = tileCenter(i, j);
    const ox = (hash(k, 1) - 0.5) * 0.3, oz = (hash(k, 2) - 0.5) * 0.3;
    o.position.set(x + ox, this.I.h[k], z + oz);
    o.rotation.set(shake * 0.12, hash(k, 3) * Math.PI * 2, shake * 0.08);
    o.scale.setScalar((0.85 + hash(k, 4) * 0.3) * s);
    o.updateMatrix();
  }

  nodeWorldPos(k) {
    const i = Math.floor(k / N), j = k % N;
    const [x, z] = tileCenter(i, j);
    return new THREE.Vector3(x, this.I.h[k], z);
  }

  shakeNode(k) {
    this.nodeAnims.set(k, { t: 0, kind: 'shake' });
  }

  _updateNodeAnims(dt) {
    if (!this.nodeAnims.size) return;
    const dummy = new THREE.Object3D();
    for (const [k, a] of this.nodeAnims) {
      a.t += dt;
      const entries = this.nodeIndex.get(k);
      if (!entries) {
        this.nodeAnims.delete(k);
        continue;
      }
      let s = 1, sh = 0;
      if (a.kind === 'grow') s = Math.min(1, 0.2 + a.t * 1.6) * (1 + Math.sin(Math.min(1, a.t * 1.6) * Math.PI) * 0.15);
      else sh = Math.sin(a.t * 40) * Math.max(0, 1 - a.t * 3);
      this._nodeMatrix(dummy, k, s, sh);
      for (const e of entries) {
        e.mesh.setMatrixAt(e.i, dummy.matrix);
        e.mesh.instanceMatrix.needsUpdate = true;
      }
      if ((a.kind === 'grow' && a.t > 0.8) || (a.kind === 'shake' && a.t > 0.35)) {
        this._nodeMatrix(dummy, k, 1);
        for (const e of entries) e.mesh.setMatrixAt(e.i, dummy.matrix);
        this.nodeAnims.delete(k);
      }
    }
  }

  // ---------------------------------------------------------------- grass

  _buildGrass() {
    const I = this.I, biome = this.game.biome;
    if (this.grass) {
      this.root.remove(this.grass);
      this.grass.geometry.dispose();
      this.grass.material.dispose();
      this.grass = null;
    }
    if (this.flowers) {
      this.root.remove(this.flowers);
      this.flowers.geometry.dispose();
      this.flowers.material.dispose();
      this.flowers = null;
    }
    const count = Math.round(1500 * this.quality.grass);
    if (count < 50) return;
    const occ = this.game.occ;
    const rand = K.rng(I.seed + 99);
    const ok = (x, z) => {
      const [i, j] = tileAt(x, z);
      if (!inside(i, j)) return null;
      const k = idx(i, j);
      const t = I.t[k];
      if (t !== 'g' && t !== 'm') return null;
      if (occ[k] && !['taman'].includes(this.buildings.get(occ[k])?.rec.type)) return null;
      return [x, I.h[k], z];
    };
    this.grass = K.grass(rand, count, (r) => ok((r() - 0.5) * N * 0.99, (r() - 0.5) * N * 0.99), GRASS_COL[biome]);
    this.root.add(this.grass);
    if (['desa', 'hutan', 'fantasi', 'pantai', 'gunung'].includes(biome)) {
      const cols = biome === 'fantasi' ? ['#7df9ff', '#ff8af0', '#fff7ee'] : ['#f4f1ea', '#ffd85c', '#ff8fb1', '#b58cff'];
      this.flowers = K.flowers(rand, Math.round(140 * this.quality.grass), (r) => ok((r() - 0.5) * N * 0.95, (r() - 0.5) * N * 0.95), cols);
      this.root.add(this.flowers);
    }
  }

  // ---------------------------------------------------------------- buildings

  addBuilding(rec, initial = false) {
    const def = BUILDINGS[rec.type];
    const group = buildingModel(rec, this.game.biome);
    const s = def.size;
    const [x0, z0] = tileCenter(rec.i, rec.j);
    const cx = x0 + (s - 1) / 2, cz = z0 + (s - 1) / 2;
    const h = this.I.h[idx(rec.i, rec.j)];
    group.position.set(cx, h, cz);
    group.rotation.y = (rec.rot || 0) * (Math.PI / 2);
    group.userData.buildingId = rec.id;
    group.traverse((o) => {
      o.userData.buildingId = rec.id;
      if (o.userData.noMirror) o.raycast = () => {};
    });
    const entry = { rec, group, anim: [], center: new THREE.Vector3(cx, h, cz), smoke: [] };
    group.traverse((o) => {
      if (o.userData.spin || o.userData.clock || o.userData.bob || o.userData.pulse) entry.anim.push(o);
    });
    if (!rec.built) group.scale.set(1, 0.02, 1);
    this.root.add(group);
    this.buildings.set(rec.id, entry);
    // chimney smoke
    if (this.quality.smoke && this.smokes.length < 10)
      for (const p of group.userData.smoke || []) {
        const wp = p.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), group.rotation.y).add(group.position);
        const sm = K.smoke(wp, { count: 22 });
        sm.material.uniforms.uOn.value = rec.built ? 0.9 : 0;
        this.root.add(sm);
        this.smokes.push(sm);
        entry.smoke.push(sm);
      }
    if (!initial) {
      this.engine.prepareScene(this.scene);
      this._grassDirty = true;
      this._lightTimer = 0;
      this.engine._forceShadow = true;
    }
    return entry;
  }

  removeBuilding(rec) {
    const e = this.buildings.get(rec.id);
    if (!e) return;
    this.root.remove(e.group);
    disposeModel(e.group);
    for (const sm of e.smoke) {
      this.root.remove(sm);
      sm.geometry.dispose();
      sm.material.dispose();
      this.smokes = this.smokes.filter((x) => x !== sm);
    }
    this.buildings.delete(rec.id);
    this.bursts.emit(e.center.clone().add(new THREE.Vector3(0, 0.3, 0)), { n: 30, color: '#c9b48a', speed: 1.4, up: 1.4, life: 0.9 });
    if (this.selected === rec) this.select(null);
    this._grassDirty = true;
    this._lightTimer = 0;
    this.engine._forceShadow = true;
  }

  refreshBuilding(rec) {
    const e = this.buildings.get(rec.id);
    const progress = e?.group.scale.y ?? 1;
    this.removeBuilding(rec);
    const n = this.addBuilding(rec);
    if (!rec.built) n.group.scale.y = progress;
    else this.bursts.emit(n.center.clone().add(new THREE.Vector3(0, 0.5, 0)), { n: 18, color: '#ffe08a', speed: 1, up: 1.6, life: 0.8, glow: 2 });
    if (this.selected?.id === rec.id) this.select(rec);
  }

  buildingCenter(rec) {
    return this.buildings.get(rec.id)?.center;
  }

  /** The walkable tile in front of a building's door. */
  doorTile(rec) {
    const def = BUILDINGS[rec.type];
    const s = def.size, r = rec.rot || 0;
    const I = this.I, occ = this.game.occ;
    const fronts = [];
    for (let a = 0; a < s; a++) {
      if (r === 0) fronts.push([rec.i + a, rec.j + s]);
      if (r === 1) fronts.push([rec.i + s, rec.j + a]);
      if (r === 2) fronts.push([rec.i + a, rec.j - 1]);
      if (r === 3) fronts.push([rec.i - 1, rec.j + a]);
    }
    const free = ([i, j]) => inside(i, j) && WALKABLE.has(I.t[idx(i, j)]) && (!occ[idx(i, j)] || WALKABLE_BUILDINGS.has(this.buildings.get(occ[idx(i, j)])?.rec.type)) && Math.abs(I.h[idx(i, j)] - I.h[idx(rec.i, rec.j)]) <= 0.5;
    for (const t of fronts) if (free(t)) return t;
    for (let a = -1; a <= s; a++)
      for (let b = -1; b <= s; b++) {
        if (a >= 0 && a < s && b >= 0 && b < s) continue;
        const t = [rec.i + a, rec.j + b];
        if (free(t)) return t;
      }
    return WALKABLE_BUILDINGS.has(rec.type) ? [rec.i, rec.j] : null;
  }

  select(rec) {
    this.selected = rec;
    if (!rec) {
      this.selQuad.visible = false;
      return;
    }
    const s = BUILDINGS[rec.type].size;
    const e = this.buildings.get(rec.id);
    this.selQuad.scale.set(s, s, 1);
    this.selQuad.position.set(e.center.x, e.center.y + 0.03, e.center.z);
    this.selQuad.visible = true;
  }

  // ---------------------------------------------------------------- placement preview

  setGhost(type, i, j, rot, valid) {
    const key = `${type}:${rot}`;
    if (!this.ghost || this.ghost.key !== key) {
      this.clearGhost();
      const group = buildingModel({ id: 999999, type, level: 1, paint: 0, rot }, this.game.biome);
      group.traverse((o) => {
        if (o.isMesh) o.castShadow = false;
      });
      this.root.add(group);
      this.ghost = { key, group, type };
    }
    const s = BUILDINGS[type].size;
    const [x0, z0] = tileCenter(i, j);
    let h = -9;
    for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) h = Math.max(h, this.tileH(i + a, j + b));
    const cx = x0 + (s - 1) / 2, cz = z0 + (s - 1) / 2;
    this.ghost.group.position.set(cx, h + 0.02, cz);
    this.ghost.group.rotation.y = rot * (Math.PI / 2);
    this.ghost.i = i;
    this.ghost.j = j;
    this.ghostQuad.visible = true;
    this.ghostQuad.scale.set(s, s, 1);
    this.ghostQuad.position.set(cx, h + 0.04, cz);
    this.ghostQuad.material.uniforms.uColor.value.set(valid ? '#7fe08a' : '#ff5d5d');
  }

  clearGhost() {
    if (this.ghost) {
      this.root.remove(this.ghost.group);
      disposeModel(this.ghost.group);
      this.ghost = null;
    }
    if (this.ghostQuad) this.ghostQuad.visible = false;
  }

  showMarker(i, j, color = '#86b8e8') {
    const [x, z] = tileCenter(i, j);
    this.markerQuad.position.set(x, this.tileH(i, j) + 0.04, z);
    this.markerQuad.material.uniforms.uColor.value.set(color);
    this.markerQuad.visible = true;
    this._markerT = 1.2;
  }

  // ---------------------------------------------------------------- lamps

  _makeLightPool() {
    for (const l of this.lights) this.root.remove(l);
    this.lights = [];
    for (let k = 0; k < this.quality.lights; k++) {
      const l = new THREE.PointLight('#ffbe6b', 0, 4.2, 2);
      l.userData.power = 0;
      l.userData.phase = Math.random() * 10;
      this.root.add(l);
      this.lights.push(l);
    }
    this._lightTimer = 0;
  }

  _assignLights() {
    const target = this.engine.view.target;
    const cands = [];
    for (const e of this.buildings.values()) {
      if (!e.rec.built) continue;
      for (const L of e.group.userData.lights || []) {
        const wp = L.pos.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), e.group.rotation.y).add(e.group.position);
        cands.push({ wp, L, d: wp.distanceToSquared(target) });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    this.lights.forEach((l, i) => {
      const c = cands[i];
      if (!c) {
        l.userData.power = 0;
        return;
      }
      l.position.copy(c.wp);
      l.color.set(c.L.color);
      l.userData.power = c.L.power;
    });
  }

  // ---------------------------------------------------------------- people

  _spawnPeople() {
    const I = this.I;
    for (const p of I.npcs) this.addNpc(p, true);
    // the mayor
    const look = { skin: '#f1c7a3', coat: '#2f4a7a', pants: '#2b2f3a', hair: '#2a1e17', hat: '#c94a3d', umbrella: '#ffd23d', tool: '#9a6a46', long: false };
    const slot = this.crowd.alloc(look);
    const door = this.doorTile(I.buildings.find((b) => b.type === 'balai')) || [I.plaza.i, I.plaza.j + 2];
    const [x, z] = tileCenter(door[0], door[1]);
    this.mayor = {
      mayor: true, slot, look, pos: new THREE.Vector3(x + 0.3, this.tileH(...door), z), yaw: -Math.PI / 4, anim: 'idle', phase: 0,
      path: null, pi: 0, mode: 'idle', task: null, speed: 1.35, scale: 1.08,
    };
    // visitor (event)
    if (I.visitor) this._spawnVisitor();
  }

  _spawnVisitor() {
    const I = this.I;
    if (!I.visitor || this.visitor) return;
    const slot = this.crowd.alloc(I.visitor.look);
    const t = this.game.randomFreeTile() || { i: I.plaza.i, j: I.plaza.j + 3 };
    const [x, z] = tileCenter(t.i, t.j);
    this.visitor = { visitor: true, slot, look: I.visitor.look, pos: new THREE.Vector3(x, this.tileH(t.i, t.j), z), yaw: 0, anim: 'idle', phase: 0, path: null, pi: 0, mode: 'idle', wait: 2, speed: 0.7, scale: 1.05 };
  }

  addNpc(p, initial = false) {
    const slot = this.crowd.alloc(p.look);
    if (slot < 0) return null;
    const rt = { p, slot, pos: new THREE.Vector3(), yaw: Math.random() * 6, anim: 'idle', phase: Math.random() * 10, path: null, pi: 0, mode: 'idle', goal: null, think: Math.random(), wait: 0, ox: (Math.random() - 0.5) * 0.4, oz: (Math.random() - 0.5) * 0.4, speed: 0.85 + Math.random() * 0.25, scale: 0.9 + Math.random() * 0.15, visible: true };
    this.npcs.set(p.id, rt);
    // start where the routine says they should be
    const want = this._want(rt);
    let tile = null;
    if (p.arriving && !initial) {
      tile = this._edgeTile();
      p.arriving = 0;
    } else tile = this._goalTile(rt, want);
    if (!tile) tile = [this.I.plaza.i, this.I.plaza.j + 2];
    this._placeAt(rt, tile);
    if (!(p.arriving === 0 && !initial)) this._arrive(rt, want, tile, true);
    rt.think = 0.2 + Math.random();
    return rt;
  }

  removeNpc(p) {
    const rt = this.npcs.get(p.id);
    if (!rt) return;
    this.bursts.emit(rt.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), { n: 10, color: '#c3d0e2', speed: 0.6 });
    this.crowd.release(rt.slot);
    this.npcs.delete(p.id);
  }

  _edgeTile() {
    const I = this.I;
    for (let t = 0; t < 60; t++) {
      const side = Math.floor(Math.random() * 4), a = 1 + Math.floor(Math.random() * (N - 2));
      const [i, j] = [[0, a], [N - 1, a], [a, 0], [a, N - 1]][side];
      if (WALKABLE.has(I.t[idx(i, j)]) && !this.game.occ[idx(i, j)]) return [i, j];
    }
    return null;
  }

  _placeAt(rt, [i, j], offset = true) {
    const [x, z] = tileCenter(i, j);
    rt.pos.set(x + (offset ? rt.ox ?? 0 : 0), this.tileH(i, j), z + (offset ? rt.oz ?? 0 : 0));
  }

  _passable = (k) => {
    const id = this.game.occ[k];
    if (!id) return true;
    const e = this.buildings.get(id);
    return !!e && WALKABLE_BUILDINGS.has(e.rec.type);
  };

  _walkTo(rt, tile, goal) {
    const from = tileAt(rt.pos.x, rt.pos.z).map((v) => Math.min(N - 1, Math.max(0, v)));
    const path = findPath(this.I, this._passable, from, tile);
    if (!path) {
      rt.fail = (rt.fail || 0) + 1;
      return false;
    }
    rt.fail = 0;
    rt.path = path;
    rt.pi = 0;
    rt.mode = 'walk';
    rt.goal = goal;
    rt.goalTile = tile;
    rt.seg = null;
    return true;
  }

  /** What the routine wants right now. */
  _want(rt) {
    const p = rt.p;
    const g = this.game;
    const h = ((g.s.time.hour - (p.offs || 0)) % 24 + 24) % 24;
    const ev = g.s.event?.island === g.biome ? g.s.event.id : null;
    const w = g.weatherName();
    const bad = w === 'storm' || (w === 'rain' && Math.random() < 0.5 && rt.mode !== 'walk') || w === 'snow' && Math.random() < 0.2;
    if (h < 6 || h >= 22) return { kind: 'sleep' };
    if (ev === 'festival' && h >= 9 && h < 21.5) return { kind: 'festival' };
    if (h < 7.6) return { kind: 'home' };
    const working = (h >= 8 && h < 12) || (h >= 13 && h < 17);
    if (working) return p.job ? { kind: 'work' } : bad ? { kind: 'home' } : { kind: 'wander' };
    if (h >= 12 && h < 13) {
      const kedai = this._nearestOfType('kedai', rt.pos);
      if (kedai && p.need.food < 75) return { kind: 'eat', bid: kedai.id };
      return p.job ? { kind: 'work' } : { kind: 'wander' };
    }
    if (h >= 17 && h < 21) return w === 'storm' || w === 'rain' ? { kind: 'home' } : { kind: 'leisure' };
    return { kind: 'home' };
  }

  _nearestOfType(type, pos) {
    let best = null, bd = Infinity;
    for (const e of this.buildings.values()) {
      if (e.rec.type !== type || !e.rec.built) continue;
      const d = e.center.distanceToSquared(pos);
      if (d < bd) {
        bd = d;
        best = e.rec;
      }
    }
    return best;
  }

  _leisureSpot(rt) {
    const list = [];
    const tr = this.game.traitOf(rt.p);
    for (const e of this.buildings.values()) {
      const def = BUILDINGS[e.rec.type];
      if (!def.leisure || !e.rec.built) continue;
      const d = Math.max(1, e.center.distanceTo(rt.pos));
      let w = (1 + def.happy?.amount / 6 || 1) / Math.pow(d, tr.wander ? 0.4 : 0.8);
      if (tr.leisure && e.rec.type === tr.leisure) w *= 3;
      list.push({ rec: e.rec, w });
    }
    if (!list.length) return null;
    const total = list.reduce((a, x) => a + x.w, 0);
    let r = Math.random() * total;
    for (const x of list) {
      r -= x.w;
      if (r <= 0) return x.rec;
    }
    return list[0].rec;
  }

  _goalTile(rt, want) {
    const g = this.game, I = this.I;
    const p = rt.p;
    const balai = I.buildings.find((b) => b.type === 'balai');
    switch (want.kind) {
      case 'sleep':
      case 'home': {
        const home = p.home ? g.buildingById(p.home) : null;
        return this.doorTile(home && home.built ? home : balai);
      }
      case 'work': {
        const job = g.buildingById(p.job);
        if (!job || !job.built) return null;
        if (WALKABLE_BUILDINGS.has(job.type)) {
          const s = BUILDINGS[job.type].size;
          return [job.i + Math.floor(Math.random() * s), job.j + Math.floor(Math.random() * s)];
        }
        return this.doorTile(job);
      }
      case 'eat': {
        const b = g.buildingById(want.bid);
        return b ? this.doorTile(b) : null;
      }
      case 'leisure': {
        const spot = this._leisureSpot(rt) || balai;
        rt.spot = spot.id;
        if (WALKABLE_BUILDINGS.has(spot.type)) {
          const s = BUILDINGS[spot.type].size;
          return [spot.i + Math.floor(Math.random() * s), spot.j + Math.floor(Math.random() * s)];
        }
        const d = this.doorTile(spot);
        return d && this._nearbyFree(d, 1);
      }
      case 'festival': {
        const d = this.doorTile(balai);
        return d && this._nearbyFree(d, 2);
      }
      case 'wander':
      default: {
        const [ci, cj] = tileAt(rt.pos.x, rt.pos.z);
        const r = 2 + Math.floor(Math.random() * 4 * (g.traitOf(p).wander || 1));
        return this._nearbyFree([ci, cj], r);
      }
    }
  }

  _nearbyFree([ci, cj], r) {
    const I = this.I, occ = this.game.occ;
    for (let t = 0; t < 20; t++) {
      const i = ci + Math.round((Math.random() * 2 - 1) * r), j = cj + Math.round((Math.random() * 2 - 1) * r);
      if (!inside(i, j)) continue;
      const k = idx(i, j);
      if (WALKABLE.has(I.t[k]) && this._passable(k) && !(I.nodes[k] && I.nodes[k].hp !== 0)) return [i, j];
    }
    return [ci, cj];
  }

  _arrive(rt, want, tile, instant = false) {
    const p = rt.p;
    const g = this.game;
    rt.path = null;
    rt.goal = want;
    rt.arrived = want.kind;
    rt.wait = 2 + Math.random() * 6;
    switch (want.kind) {
      case 'sleep':
      case 'home': {
        const home = p.home ? g.buildingById(p.home) : null;
        if (home && home.built) {
          rt.mode = 'inside';
          rt.at = home.id;
        } else {
          rt.mode = want.kind === 'sleep' ? 'inside' : 'idle';
          rt.at = 0;
        }
        break;
      }
      case 'work': {
        rt.mode = 'work';
        rt.at = p.job;
        const job = g.buildingById(p.job);
        if (job) this._face(rt, this.buildings.get(job.id)?.center);
        break;
      }
      case 'eat': {
        rt.mode = 'leisure';
        if (!instant && g.eat(p)) {
          p.lastMeal = g.absHour();
          this.emote(rt, 'food', 2.5);
        }
        break;
      }
      case 'leisure':
        rt.mode = 'leisure';
        rt.wait = 6 + Math.random() * 10;
        if (rt.spot) this._face(rt, this.buildings.get(rt.spot)?.center);
        break;
      case 'festival':
        rt.mode = 'dance';
        break;
      default:
        rt.mode = 'idle';
    }
  }

  _face(rt, target) {
    if (!target) return;
    rt.yaw = Math.atan2(-(target.z - rt.pos.z), target.x - rt.pos.x);
  }

  emote(rt, icon, secs = 3) {
    rt.emote = { icon, until: this.time + secs };
  }

  _think(rt) {
    const p = rt.p;
    const g = this.game;
    if (rt.talkHold > this.time) return;
    const want = this._want(rt);
    const now = g.absHour();
    // meals at home
    if (rt.mode === 'inside' && rt.at && p.need.food < 60 && (!p.lastMeal || now - p.lastMeal > 3.5)) {
      if (g.eat(p)) p.lastMeal = now;
    }
    if (rt.mode === 'work' && p.need.food < 35 && (!p.lastMeal || now - p.lastMeal > 4)) {
      if (g.eat(p)) {
        p.lastMeal = now;
        this.emote(rt, 'food', 2);
      }
    }
    const same = rt.goal && rt.goal.kind === want.kind && (want.kind !== 'eat' || rt.goal.bid === want.bid);
    if (same && rt.mode === 'walk') return;
    if (same && rt.mode !== 'walk') {
      rt.wait -= 1;
      if (rt.wait > 0) return;
      // fidget: move around within the activity
      if (want.kind === 'wander' || want.kind === 'leisure' || want.kind === 'festival' || (want.kind === 'work' && WALKABLE_BUILDINGS.has(g.buildingById(p.job)?.type))) {
        const tile = this._goalTile(rt, want);
        if (tile) this._walkTo(rt, tile, want);
      }
      rt.wait = 4 + Math.random() * 8;
      return;
    }
    const tile = this._goalTile(rt, want);
    if (!tile) {
      if (want.kind !== 'wander') {
        const t2 = this._goalTile(rt, { kind: 'wander' });
        if (t2) this._walkTo(rt, t2, { kind: 'wander' });
      }
      return;
    }
    const [ci, cj] = tileAt(rt.pos.x, rt.pos.z);
    if (ci === tile[0] && cj === tile[1]) {
      this._arrive(rt, want, tile);
      return;
    }
    if (rt.mode === 'inside') {
      // step out of the door
      const home = g.buildingById(rt.at);
      const door = home ? this.doorTile(home) : null;
      if (door) this._placeAt(rt, door, false);
    }
    if (!this._walkTo(rt, tile, want) && rt.fail > 3) {
      // stuck somewhere unreachable: pop over to the goal
      this._placeAt(rt, tile);
      this._arrive(rt, want, tile);
    }
  }

  _move(rt, dt) {
    if (!rt.path) return false;
    if (rt.pi >= rt.path.length) {
      rt.path = null;
      return true;
    }
    const [ti, tj] = rt.path[rt.pi];
    const last = rt.pi === rt.path.length - 1;
    const [tx, tz] = tileCenter(ti, tj);
    const gx = tx + (last ? rt.ox ?? 0 : 0), gz = tz + (last ? rt.oz ?? 0 : 0);
    if (!rt.seg) {
      const [fi, fj] = tileAt(rt.pos.x, rt.pos.z);
      rt.seg = { h0: this.tileH(fi, fj), h1: this.tileH(ti, tj), len: Math.max(0.01, Math.hypot(gx - rt.pos.x, gz - rt.pos.z)) };
    }
    const dx = gx - rt.pos.x, dz = gz - rt.pos.z;
    const d = Math.hypot(dx, dz);
    const road = ROADS.has(this.I.t[idx(ti, tj)]);
    const speed = rt.speed * (road ? 1.45 : 1) * this.walkScale;
    const step = speed * dt;
    if (d <= step) {
      rt.pos.x = gx;
      rt.pos.z = gz;
      rt.pi++;
      rt.seg = null;
    } else {
      rt.pos.x += (dx / d) * step;
      rt.pos.z += (dz / d) * step;
    }
    if (d > 1e-4) rt.yaw = Math.atan2(-dz, dx);
    const k = rt.seg ? 1 - Math.min(1, d / rt.seg.len) : 1;
    rt.pos.y = rt.seg ? rt.seg.h0 + (rt.seg.h1 - rt.seg.h0) * smooth(0.25, 0.75, k) : this.tileH(ti, tj);
    rt.phase += step * 11;
    rt.anim = 'walk';
    if (rt.pi >= rt.path.length) {
      rt.path = null;
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- mayor control

  mayorGoTo(i, j) {
    const m = this.mayor;
    m.task = null;
    this._mayorPath([i, j]);
    this.showMarker(i, j);
  }

  mayorGather(k) {
    const m = this.mayor;
    const i = Math.floor(k / N), j = k % N;
    // stand on a free neighbour, the nearest one
    let best = null, bd = Infinity;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const ni = i + di, nj = j + dj;
      if (!inside(ni, nj)) continue;
      const nk = idx(ni, nj);
      if (!WALKABLE.has(this.I.t[nk]) || !this._passable(nk)) continue;
      if (Math.abs(this.I.h[nk] - this.I.h[k]) > 0.75) continue;
      const [x, z] = tileCenter(ni, nj);
      const dd = Math.hypot(x - m.pos.x, z - m.pos.z) + (this.I.nodes[nk]?.hp ? 3 : 0);
      if (dd < bd) {
        bd = dd;
        best = [ni, nj];
      }
    }
    if (!best) return false;
    m.task = { kind: 'gather', k, swing: 0 };
    const [ci, cj] = tileAt(m.pos.x, m.pos.z);
    if (ci === best[0] && cj === best[1]) {
      m.path = null;
      m.mode = 'task';
    } else this._mayorPath(best);
    this.showMarker(i, j, '#ffd23d');
    return true;
  }

  mayorFetch(kind, i, j) {
    const m = this.mayor;
    m.task = { kind, i, j };
    const [ci, cj] = tileAt(m.pos.x, m.pos.z);
    if (Math.abs(ci - i) <= 1 && Math.abs(cj - j) <= 1) {
      m.path = null;
      m.mode = 'task';
      return;
    }
    let target = [i, j];
    if (!this._passable(idx(i, j))) target = this._nearbyFree([i, j], 1);
    this._mayorPath(target);
  }

  _mayorPath(tile) {
    const m = this.mayor;
    const from = tileAt(m.pos.x, m.pos.z).map((v) => Math.min(N - 1, Math.max(0, v)));
    const path = findPath(this.I, this._passable, from, tile, 1400);
    if (path) {
      m.path = path;
      m.pi = 0;
      m.seg = null;
      m.mode = 'walk';
      m.ox = 0;
      m.oz = 0;
    } else {
      this.game.emit('toast', { text: 'Tidak ada jalan ke sana', kind: 'warn' });
      m.task = null;
    }
  }

  _updateMayor(dt) {
    const m = this.mayor;
    if (m.mode === 'walk') {
      const done = this._move(m, dt * 1.6);
      if (done) m.mode = m.task ? 'task' : 'idle';
      return;
    }
    if (m.mode === 'task' && m.task) {
      const t = m.task;
      if (t.kind === 'gather') {
        const node = this.game.nodeAt(t.k);
        if (!node) {
          m.task = null;
          m.mode = 'idle';
          return;
        }
        this._face(m, this.nodeWorldPos(t.k));
        m.anim = 'chop';
        m.phase += dt * 3.2;
        t.swing += dt;
        // a hit lands at the bottom of each swing
        const period = (Math.PI * 2) / (2.2 * 3.2);
        if (t.swing >= period) {
          t.swing -= period;
          const nd = NODES[node.k];
          this.audio.play(nd.sfx);
          this.shakeNode(t.k);
          const wp = this.nodeWorldPos(t.k).add(new THREE.Vector3(0, 0.4, 0));
          const col = { wood: '#c9a070', stone: '#c9ccd4', food: '#e94f4f', ore: '#e2a05a', sand: '#efdcab', crystal: '#7df9ff' }[nd.res] || '#ffffff';
          this.bursts.emit(wp, { n: 8, color: col, speed: 0.9, up: 1.2, life: 0.6, glow: nd.res === 'crystal' ? 3 : 1 });
          const res = this.game.gather(t.k);
          if (!res || res.depleted) {
            this.bursts.emit(wp, { n: 16, color: col, speed: 1.3, up: 1.5, life: 0.8 });
            m.task = null;
            m.mode = 'idle';
            this.rebuildNodes();
          }
        }
        return;
      }
      if (t.kind === 'chest' || t.kind === 'cat' || t.kind === 'visitor') {
        const [x, z] = tileCenter(t.i, t.j);
        this._face(m, new THREE.Vector3(x, 0, z));
        m.mode = 'idle';
        m.task = null;
        this.game.emit('mayor:reach', t);
        return;
      }
    }
    m.anim = 'idle';
    m.phase += dt;
  }

  // ---------------------------------------------------------------- props (chest, cat)

  _makeProps() {
    const b = new Builder();
    b.box(0.36, 0.2, 0.26, '#a8794c', 0, 0, 0);
    b.box(0.38, 0.03, 0.28, '#ffd23d', 0, 0.12, 0);
    b.box(0.38, 0.1, 0.28, '#8a5a38', 0, 0.2, 0, { rx: -0.1 });
    b.glowBox(0.06, 0.06, 0.02, '#ffe08a', 6, 0, 0.1, 0.14, {}, '#e2b33c', true);
    this.chest = b.build();
    this.chest.visible = false;
    this.root.add(this.chest);
    const c = new Builder();
    c.box(0.22, 0.1, 0.1, '#e8913a', 0, 0.06, 0);
    c.box(0.1, 0.1, 0.1, '#e8913a', 0.13, 0.12, 0);
    c.box(0.03, 0.04, 0.03, '#e8913a', 0.15, 0.22, 0.03);
    c.box(0.03, 0.04, 0.03, '#e8913a', 0.15, 0.22, -0.03);
    c.box(0.03, 0.03, 0.03, '#1b1d2b', 0.18, 0.14, 0.03);
    c.box(0.03, 0.03, 0.03, '#1b1d2b', 0.18, 0.14, -0.03);
    c.box(0.02, 0.16, 0.02, '#e8913a', -0.12, 0.1, 0, { rz: 0.5 });
    for (const [x, z] of [[0.07, 0.03], [0.07, -0.03], [-0.07, 0.03], [-0.07, -0.03]]) c.box(0.025, 0.06, 0.025, '#c8742a', x, 0, z);
    this.cat = c.build();
    this.cat.visible = false;
    this.root.add(this.cat);
  }

  _updateProps(dt) {
    const I = this.I;
    if (I.chest) {
      const [x, z] = tileCenter(I.chest.i, I.chest.j);
      this.chest.visible = true;
      this.chest.position.set(x, this.tileH(I.chest.i, I.chest.j) + Math.abs(Math.sin(this.time * 2)) * 0.03, z);
      this.chest.rotation.y = 0.6;
      if (Math.random() < dt * 3) this.bursts.emit(this.chest.position.clone().add(new THREE.Vector3(0, 0.35, 0)), { n: 1, color: '#ffe08a', speed: 0.3, up: 0.5, life: 0.8, gravity: 0, glow: 3 });
    } else this.chest.visible = false;
    if (I.cat) {
      this.cat.visible = true;
      this._catT = (this._catT || 0) - dt;
      if (this._catT <= 0) {
        this._catT = 3 + Math.random() * 4;
        const t = this._nearbyFree([I.cat.i, I.cat.j], 1);
        if (t && !this.game.occ[idx(t[0], t[1])]) {
          I.cat.i = t[0];
          I.cat.j = t[1];
          this.audio.play('meow');
        }
      }
      const [x, z] = tileCenter(I.cat.i, I.cat.j);
      const p = this.cat.position;
      const tx = x + 0.2, tz = z + 0.15;
      const dx = tx - p.x, dz = tz - p.z;
      if (Math.hypot(dx, dz) > 2) p.set(tx, 0, tz);
      p.x += dx * Math.min(1, dt * 1.5);
      p.z += dz * Math.min(1, dt * 1.5);
      p.y = this.heightAt(p.x, p.z);
      if (Math.hypot(dx, dz) > 0.02) this.cat.rotation.y = Math.atan2(-dz, dx);
    } else this.cat.visible = false;
    if (I.visitor && !this.visitor) this._spawnVisitor();
    if (!I.visitor && this.visitor) {
      this.crowd.release(this.visitor.slot);
      this.visitor = null;
    }
  }

  // ---------------------------------------------------------------- per-frame

  update(dt, dtH) {
    this.time += dt;
    const g = this.game;
    this.walkScale = Math.min(3, g.s.settings.speed || 1);
    const env = this.env;

    // construction
    for (const e of this.buildings.values()) {
      const r = e.rec;
      if (!r.built) {
        const dur = 2.5 + BUILDINGS[r.type].size * 2;
        r.progress = Math.min(1, (r.progress || 0) + dt / dur);
        const k = r.progress;
        const s = k < 1 ? Math.min(1, 1 - Math.pow(1 - k, 3) * 1.0) : 1;
        e.group.scale.set(1, Math.max(0.02, s), 1);
        if (Math.random() < dt * 8) this.bursts.emit(e.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.05, (Math.random() - 0.5) * 0.8)), { n: 2, color: '#c9b48a', speed: 0.5, up: 0.6, life: 0.6 });
        if (r.progress >= 1) {
          e.group.scale.set(1, 1, 1);
          g.finishConstruction(r);
          this.audio.play('place');
          this.bursts.emit(e.center.clone().add(new THREE.Vector3(0, 0.4, 0)), { n: 28, color: '#ffe08a', speed: 1.4, up: 2, life: 1, glow: 2.5 });
          for (const sm of e.smoke) sm.material.uniforms.uOn.value = 0.9;
          this._lightTimer = 0;
          this.engine._forceShadow = true;
        }
      }
      for (const o of e.anim) {
        if (o.userData.spin === 'z') o.rotation.z += dt * (1.2 + env.cur.wind * 3);
        if (o.userData.spin === 'y') o.rotation.y += dt * 0.9;
        if (o.userData.bob) o.scale.y = 1 + Math.sin(this.time * 6) * 0.15;
        if (o.userData.pulse) o.scale.setScalar(1 + ((this.time * 1.5) % 1) * 0.6);
        if (o.userData.clock) {
          const h = g.s.time.hour;
          o.userData.clock.hour.rotation.z = -((h % 12) / 12) * Math.PI * 2;
          o.userData.clock.minute.rotation.z = -((h % 1)) * Math.PI * 2;
        }
      }
    }

    // people
    this.presence.clear();
    const festival = g.s.event?.id === 'festival' && g.s.event.island === g.biome;
    const raining = env.cur.rain > 0.25 || env.cur.snow > 0.4;
    for (const rt of this.npcs.values()) {
      rt.think -= dt;
      if (rt.think <= 0) {
        rt.think = 0.8 + Math.random() * 0.6;
        this._think(rt);
      }
      if (rt.mode === 'walk') {
        if (this._move(rt, dt)) this._arrive(rt, rt.goal, rt.goalTile);
      } else {
        rt.phase += dt * 2;
        rt.anim = rt.mode === 'work' ? 'work' : rt.mode === 'dance' ? 'dance' : rt.mode === 'leisure' ? (rt.chat > this.time ? 'talk' : 'idle') : 'idle';
        if (rt.talkHold > this.time) rt.anim = 'wave';
      }
      if (rt.mode === 'work' && rt.at) this.presence.set(rt.at, (this.presence.get(rt.at) || 0) + (g.traitOf(rt.p).work || 1));
      g.npcTick(rt.p, { sleeping: rt.mode === 'inside' && (g.s.time.hour >= 21 || g.s.time.hour < 7), leisure: rt.mode === 'leisure' || rt.mode === 'dance', working: rt.mode === 'work', festival }, dtH);
      rt.visible = rt.mode !== 'inside';
      rt.umbrella = raining && rt.visible && rt.mode !== 'work';
      // emotes
      if (!rt.emote || rt.emote.until < this.time) {
        rt.emote = null;
        if (rt.p.req) rt.emote = { icon: 'quest', until: this.time + 1 };
        else if (rt.visible && Math.random() < dt * 0.05) {
          if (rt.p.need.food < 20) this.emote(rt, 'food');
          else if (!rt.p.home) this.emote(rt, 'home');
          else if (rt.p.mood < 30) this.emote(rt, 'sad');
          else if (rt.mode === 'dance') this.emote(rt, 'music', 2);
          else if (rt.mode === 'leisure' && rt.p.mood > 70) this.emote(rt, 'heart', 2);
        }
      }
    }
    // neighbours chat when they relax next to each other
    if (Math.random() < dt * 0.8) {
      const list = [...this.npcs.values()].filter((r) => r.mode === 'leisure');
      if (list.length > 1) {
        const a = list[Math.floor(Math.random() * list.length)];
        const b = list.find((r) => r !== a && r.pos.distanceTo(a.pos) < 1.2);
        if (b) {
          a.chat = b.chat = this.time + 3;
          this._face(a, b.pos);
          this._face(b, a.pos);
          this.emote(a, 'chat', 2.5);
        }
      }
    }
    this._updateMayor(dt);
    if (this.visitor) {
      const v = this.visitor;
      if (v.path) this._move(v, dt);
      else {
        v.anim = 'idle';
        v.phase += dt;
        v.wait -= dt;
        if (v.wait <= 0) {
          v.wait = 4 + Math.random() * 5;
          const t = this._nearbyFree(tileAt(v.pos.x, v.pos.z), 3);
          const from = tileAt(v.pos.x, v.pos.z);
          const path = findPath(this.I, this._passable, from, t);
          if (path) {
            v.path = path;
            v.pi = 0;
            v.seg = null;
          }
        }
      }
    }

    // pose the crowd
    for (const rt of this.npcs.values()) {
      if (!rt.visible) {
        this.crowd.hide(rt.slot);
        continue;
      }
      this.crowd.pose(rt.slot, { pos: rt.pos, yaw: rt.yaw, scale: rt.scale, anim: rt.anim, phase: rt.phase, umbrella: rt.umbrella, hat: !!rt.p.look.hat, long: rt.p.look.long });
    }
    const m = this.mayor;
    this.crowd.pose(m.slot, { pos: m.pos, yaw: m.yaw, scale: m.scale, anim: m.anim, phase: m.phase, umbrella: raining && m.anim !== 'chop', hat: true, tool: true });
    if (this.visitor) this.crowd.pose(this.visitor.slot, { pos: this.visitor.pos, yaw: this.visitor.yaw, scale: 1.05, anim: this.visitor.anim, phase: this.visitor.phase, umbrella: raining, hat: true, long: true });
    this.crowd.commit();

    this._updateNodeAnims(dt);
    this._updateProps(dt);
    this.bursts.update(dt);
    if (this._markerT > 0) {
      this._markerT -= dt;
      if (this._markerT <= 0) this.markerQuad.visible = false;
    }

    // lamps
    this._lightTimer -= dt;
    if (this._lightTimer <= 0) {
      this._lightTimer = 0.7;
      this._assignLights();
    }
    for (const l of this.lights) {
      const f = 1 + Math.sin(this.time * 9 + l.userData.phase) * 0.04 + Math.sin(this.time * 23 + l.userData.phase * 3) * 0.03;
      l.intensity = l.userData.power * env.lamps * f;
    }
    // ambience: city traffic is a daytime thing
    if (this._loopBase?.traffic) this.audio.setLoop('traffic', this._loopBase.traffic * (0.35 + 0.65 * env.daylight));
    if (this._loopBase?.cicadas) this.audio.setLoop('cicadas', this._loopBase.cicadas * env.daylight * (1 - env.cur.rain));
    if (festival) this.audio.setLoop('fire', 0);

    if (this._grassDirty) {
      this._grassAcc = (this._grassAcc || 0) + dt;
      if (this._grassAcc > 0.4) {
        this._grassAcc = 0;
        this._grassDirty = false;
        this._buildGrass();
      }
    }
  }

  // ---------------------------------------------------------------- picking

  project(pos, out = { x: 0, y: 0, z: 0 }) {
    const v = this._v.copy(pos).project(this.engine.camera);
    const c = this.engine.canvas;
    out.x = ((v.x + 1) / 2) * c.clientWidth;
    out.y = ((1 - v.y) / 2) * c.clientHeight;
    out.z = v.z;
    return out;
  }

  /** What is under a point on the canvas (CSS pixels). */
  pick(cx, cy) {
    const c = this.engine.canvas;
    const thr = 26;
    let best = null, bd = thr;
    const tryChar = (pos, h, item) => {
      const p = this.project(this._v.set(pos.x, pos.y + h, pos.z));
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < bd) {
        bd = d;
        best = item;
      }
    };
    for (const rt of this.npcs.values()) if (rt.visible) tryChar(rt.pos, 0.3 * rt.scale, { type: 'npc', rt });
    if (this.visitor) tryChar(this.visitor.pos, 0.3, { type: 'visitor', rt: this.visitor });
    if (this.chest.visible) tryChar(this.chest.position, 0.15, { type: 'chest', i: this.I.chest.i, j: this.I.chest.j });
    if (this.cat.visible) tryChar(this.cat.position, 0.1, { type: 'cat', i: this.I.cat.i, j: this.I.cat.j });
    tryChar(this.mayor.pos, 0.32, { type: 'mayor' });
    if (best) return best;

    const rc = this.engine.raycaster(cx / c.clientWidth, cy / c.clientHeight);
    const objs = [this.terrain.mesh];
    for (const e of this.buildings.values()) objs.push(e.group);
    for (const m of this.nodeMeshes.values()) if (m.count) objs.push(m);
    const hits = rc.intersectObjects(objs, true);
    for (const h of hits) {
      const o = h.object;
      if (o.isInstancedMesh && o.userData.nodeKeys) {
        const k = o.userData.nodeKeys[h.instanceId];
        if (k !== undefined) return { type: 'node', k, point: h.point };
      }
      if (o.userData.buildingId) {
        const e = this.buildings.get(o.userData.buildingId);
        if (e) return { type: 'building', rec: e.rec, point: h.point };
      }
      if (o.userData.terrain) {
        // tiny nudge into the face so side hits map to the right tile
        const p = h.point.clone().addScaledVector(h.face.normal, -0.01);
        const [i, j] = tileAt(p.x, p.z);
        if (!inside(i, j)) return null;
        const k = idx(i, j);
        const id = this.game.occ[k];
        if (id && this.buildings.get(id)) return { type: 'building', rec: this.buildings.get(id).rec, point: h.point, i, j };
        const node = this.game.nodeAt(k);
        if (node) return { type: 'node', k, point: h.point };
        return { type: 'tile', i, j, point: h.point };
      }
    }
    return null;
  }

  /** Tile under a canvas point (terrain only) - used while placing or painting roads. */
  pickTile(cx, cy) {
    const c = this.engine.canvas;
    const rc = this.engine.raycaster(cx / c.clientWidth, cy / c.clientHeight);
    const hit = rc.intersectObject(this.terrain.mesh, false)[0];
    if (hit) {
      const p = hit.point.clone().addScaledVector(hit.face.normal, -0.01);
      const [i, j] = tileAt(p.x, p.z);
      if (inside(i, j)) return [i, j];
    }
    // fall back to the y = 0.25 plane
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.25);
    const pt = new THREE.Vector3();
    if (rc.ray.intersectPlane(plane, pt)) {
      const [i, j] = tileAt(pt.x, pt.z);
      if (inside(i, j)) return [i, j];
    }
    return null;
  }

  /** Visible emotes for the UI (screen positions). */
  emotes(max = 14) {
    const out = [];
    for (const rt of this.npcs.values()) {
      if (!rt.emote || !rt.visible) continue;
      const p = this.project(this._v.set(rt.pos.x, rt.pos.y + 0.78 * rt.scale, rt.pos.z));
      out.push({ id: rt.p.id, x: p.x, y: p.y, icon: rt.emote.icon });
      if (out.length >= max) break;
    }
    return out;
  }

  npcRuntime(id) {
    return this.npcs.get(id);
  }
}
