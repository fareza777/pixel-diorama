// The live 3D diorama for the active island: terrain, water, nature, buildings, villagers and their
// daily routines, the mayor, effects, lamps and picking.
import * as THREE from 'three';
import * as K from '../engine/kit.js';
import { fxMaterial, shared } from '../engine/materials.js';
import { N, HALF, idx, inside, tileCenter, tileAt, WALKABLE, ROADS } from './island.js';
import { BUILDINGS, BIOMES, NODES, SEASON_LOOK } from './data.js';
import { buildingModel, nodeGeometry, materialFor, disposeModel, Builder } from './models.js';
import { Crowd, GATHER_ANIMS, randomLook } from './people.js';
import { Ambient } from './ambient.js';
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
const ease = (x) => x * x * (3 - 2 * x);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- villagers at work
// What villagers do at each workplace: an animation from people.js (looped actions use their own
// tool), an occasional second one for variety, and particles when the tool lands.
const WORK_ANIM = {
  ladang: { anim: 'hoe', alt: 'pick' }, kebun: { anim: 'pick', alt: 'carryStand' }, peternakan: { anim: 'pick', alt: 'sweep' },
  penebang: { anim: 'chop' }, tambang: { anim: 'mine' }, bijih: { anim: 'mine', alt: 'dig' }, pasir: { anim: 'dig' },
  nelayan: { anim: 'fish' }, bengkel: { anim: 'hammer', alt: 'saw' }, penggergajian: { anim: 'saw', alt: 'hammer' },
  tungku: { anim: 'dig', alt: 'hammer' }, kaca: { anim: 'work', alt: 'hammer' }, kristal: { anim: 'work', alt: 'point' },
  pasar: { anim: 'vend', alt: 'talk' }, toko: { anim: 'vend', alt: 'sweep' }, kedai: { anim: 'cook', alt: 'vend' },
  sekolah: { anim: 'talk', alt: 'point' }, perpustakaan: { anim: 'sweep', alt: 'point' }, klinik: { anim: 'talk', alt: 'work' },
  panggung: { anim: 'dance', alt: 'clap' }, gudang: { anim: 'work', alt: 'sweep' }, kincir: { anim: 'work' },
};
// porters carry a crate on the way to these jobs
const CARRY_TO = new Set(['gudang', 'pasar', 'toko', 'kedai', 'penggergajian', 'bengkel', 'kebun']);
// particles when a villager's tool lands: [colour, count, glow, height, reach]
const HIT_FX = {
  chop: ['#c9a070', 2, 1, 0.22, 0.34], mine: ['#c9ccd4', 2, 1, 0.2, 0.36], dig: ['#d8b98a', 3, 1, 0.05, 0.33], hoe: ['#8e6444', 3, 1, 0.04, 0.4],
  hammer: ['#ffd08a', 2, 2.8, 0.2, 0.3], sweep: ['#d8d0c0', 2, 1, 0.03, 0.34], saw: ['#e3c690', 3, 1, 0.22, 0.3], pick: ['#5a9e4b', 1, 1, 0.25, 0.25],
};
// what busy buildings give off: local point, particles per second (at 2 workers) and the burst
const WORK_FX = {
  bengkel: { p: [-0.12, 0.18, 0.3], rate: 1.6, o: { n: 2, color: '#ffb05a', speed: 0.6, up: 0.9, life: 0.35, gravity: 4, glow: 3 } },
  kedai: { p: [0.15, 0.75, -0.1], rate: 1.2, o: { n: 1, color: '#eef2f6', speed: 0.05, up: 0.3, life: 1.6, gravity: -0.3 } },
  kristal: { p: [0, 1.3, 0], rate: 2.2, o: { n: 1, color: '#7df9ff', speed: 0.25, up: 0.4, life: 1.2, gravity: -0.5, glow: 3, spread: 0.3 } },
  tungku: { p: [-0.05, 0.12, 0.3], rate: 2, o: { n: 1, color: '#ff8a3a', speed: 0.15, up: 0.7, life: 0.9, gravity: -0.4, glow: 3.5 } },
  kaca: { p: [-0.18, 0.12, 0.22], rate: 1.6, o: { n: 2, color: '#ffc06a', speed: 0.4, up: 0.6, life: 0.4, gravity: 3, glow: 3 } },
  penggergajian: { p: [0.12, 0.26, 0.05], rate: 3, o: { n: 2, color: '#e3c690', speed: 0.5, up: 0.5, life: 0.5, gravity: 2.5 } },
  pasar: { p: [0, 0.6, 0], rate: 0.5, o: { n: 2, color: '#ffd23d', speed: 0.4, up: 1, life: 0.7, glow: 2.5, spread: 1 } },
  toko: { p: [0, 0.55, 0.3], rate: 0.35, o: { n: 2, color: '#ffd23d', speed: 0.3, up: 0.9, life: 0.7, glow: 2.5 } },
  sekolah: { p: [-0.1, 1.0, -0.45], rate: 0.4, o: { n: 1, color: '#ffe08a', speed: 0.1, up: 0.5, life: 1.2, gravity: -0.3, glow: 2 } },
  panggung: { p: [0, 0.7, -0.15], rate: 1.6, o: { n: 1, color: '#ff8ad8', speed: 0.3, up: 0.6, life: 1.5, gravity: -0.35, glow: 2.6, spread: 0.6 } },
  ladang: { p: [0, 0.3, 0], rate: 0.6, o: { n: 1, color: '#9ccf5a', speed: 0.3, up: 0.6, life: 0.9, gravity: 1, spread: 1.4 } },
};
const NOTE_COL = ['#ff8ad8', '#ffd23d', '#7fe08a', '#86b8e8', '#c9a0ff'];
const BUILDER_LOOK = (r) => ({ ...randomLook(r), coat: '#e8913a', pants: '#3a4a6a', hat: '#ffd23d', tool: '#8a5a38', toolHead: '#9aa0aa' });
const MAX_BUILDERS = 6;
const _upV = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- gathering

// How the mayor works each kind of node: which animation (see GATHER_ANIMS in people.js), the
// node's rough radius at scale 1 where the tool lands (the trunk for trees), the height of the
// hit, and particle colours. `woody` nodes tip over when felled, the rest break up.
const GATHER = {
  tree: { anim: 'chop', r: 0.065, woody: true, leaf: '#5a9e4b', top: 0.7 },
  pine: { anim: 'chop', r: 0.07, woody: true, leaf: '#3d8150', top: 0.8 },
  palm: { anim: 'chop', r: 0.055, woody: true, leaf: '#4f9a3c', top: 0.95 },
  cactus: { anim: 'chop', r: 0.09, woody: true, leaf: null, top: 0.5 },
  mushroom: { anim: 'chop', r: 0.09, woody: true, leaf: '#fff7ee', top: 0.5 },
  rock: { anim: 'mine', r: 0.27 },
  ore: { anim: 'mine', r: 0.27, spark: '#ffd08a' },
  crystal: { anim: 'mine', r: 0.17, spark: '#7df9ff' },
  dune: { anim: 'dig', r: 0.26 },
  bush: { anim: 'pick', r: 0.24, leaf: '#4d8f45', fruit: '#e94f4f' },
};
// how far in front of the mayor (from his centre) each animation lands, at his scale
const REACH = { chop: 0.38, mine: 0.4, dig: 0.37, pick: 0.21 };
const HIT_Y = { chop: 0.22, mine: 0.24, dig: 0.06, pick: 0.28 };
const RES_COLOR = { wood: '#c9a070', stone: '#c9ccd4', food: '#e94f4f', ore: '#e2a05a', sand: '#efdcab', crystal: '#7df9ff' };
// tool head colour per tool tier: crude stone, stone, iron, crystal
const TOOL_COLORS = ['#8f877a', '#a19c92', '#c8cdd6', '#8ff4ff'];
const UP = new THREE.Vector3(0, 1, 0);
const _qa = new THREE.Quaternion(), _axis = new THREE.Vector3(), _tmpV = new THREE.Vector3();
const _eclTop = new THREE.Color('#05060f'), _eclBot = new THREE.Color('#2a2040'), _eclTint = new THREE.Color('#9fa8ff');

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
  emit(at, { n = 12, color = '#ffffff', speed = 1.2, up = 1.2, life = 0.8, gravity = 3, glow = 1, push = null, spread = 0 } = {}) {
    const c = new THREE.Color(color).multiplyScalar(glow);
    for (let k = 0; k < n; k++) {
      if (this.p.length >= this.max) this.p.shift();
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      const ox = spread ? (Math.random() - 0.5) * spread : 0, oz = spread ? (Math.random() - 0.5) * spread : 0;
      this.p.push({ x: at.x + ox, y: at.y, z: at.z + oz, vx: Math.cos(a) * s + (push?.x || 0), vy: up * (0.5 + Math.random()), vz: Math.sin(a) * s + (push?.z || 0), t: 0, life: life * (0.6 + Math.random() * 0.6), c, g: gravity });
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
    const pos = this.pos, col = this.col;
    for (let i = 0; i < this.max; i++) {
      const q = P[i];
      if (q) {
        const a = i * 3, b = i * 4;
        pos[a] = q.x;
        pos[a + 1] = q.y;
        pos[a + 2] = q.z;
        col[b] = q.c.r;
        col[b + 1] = q.c.g;
        col[b + 2] = q.c.b;
        col[b + 3] = 1 - q.t / q.life;
      } else col[i * 4 + 3] = 0;
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
    this.quality = { grass: 1, mirror: true, lights: 6, smoke: true, ambient: 1 };
    this.dying = [];
    this.builderCount = 0;
    this.suspendSeason = false;
    this._sb = [0, 1, 0, 0];
    this._ecl = 0;
    this._quakeT = 2;
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
    this.ambient?.setLevel(this.quality.ambient);
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
    this.crowd = new Crowd(130);
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
    this.builderCount = 0;
    this._spawnPeople();
    this._makeProps();
    this.ambient = new Ambient(this);
    this.ambient.setLevel(this.quality.ambient);
    this.root.add(this.ambient.group);
    this.ambient.attach();

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
    for (const b of this.buildings.values()) {
      disposeModel(b.group);
      if (b.scaffold) disposeModel(b.scaffold);
    }
    this.buildings.clear();
    for (const d of this.dying) disposeModel(d.group);
    this.dying = [];
    this.ambient?.dispose();
    this.ambient = null;
    this.builderCount = 0;
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
    this._disposeEventFx();
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

  /**
   * Instance matrix for node k. s scales it uniformly; fx adds the hit / fall reactions:
   * { tilt, dir: {x, z} } tips it about its base, away along dir; sy / sxz squash it; dy sinks it.
   */
  _nodeMatrix(o, k, s = 1, fx = null) {
    const b = this._nodeBase(k);
    o.position.set(b.x, b.y + (fx?.dy || 0), b.z);
    o.quaternion.setFromAxisAngle(UP, hash(k, 3) * Math.PI * 2);
    if (fx?.tilt) {
      // rotate "up" towards dir: the axis is up x dir
      _qa.setFromAxisAngle(_axis.set(fx.dir.z, 0, -fx.dir.x).normalize(), fx.tilt);
      o.quaternion.premultiply(_qa);
    }
    const sc = b.s * s, sxz = fx?.sxz ?? 1, sy = fx?.sy ?? 1;
    o.scale.set(sc * sxz, sc * sy, sc * sxz);
    o.updateMatrix();
  }

  /** Where node k's instance actually stands (tile centre plus its random offset) and its scale. */
  _nodeBase(k) {
    const i = Math.floor(k / N), j = k % N;
    const [x, z] = tileCenter(i, j);
    return { x: x + (hash(k, 1) - 0.5) * 0.3, y: this.I.h[k], z: z + (hash(k, 2) - 0.5) * 0.3, s: 0.85 + hash(k, 4) * 0.3 };
  }

  nodeWorldPos(k) {
    const i = Math.floor(k / N), j = k % N;
    const [x, z] = tileCenter(i, j);
    return new THREE.Vector3(x, this.I.h[k], z);
  }

  shakeNode(k, dir = { x: 1, z: 0 }) {
    const kind = this.I.nodes[k]?.k;
    this.nodeAnims.set(k, { t: 0, kind: 'hit', node: kind, st: GATHER[kind] || GATHER.rock, dir });
  }

  /** The last hit: trees tip over away from the mayor and land, everything else breaks up. */
  fellNode(k, kind, dir) {
    const st = GATHER[kind] || GATHER.rock;
    this.nodeAnims.set(k, { t: 0, kind: 'fall', node: kind, st, dir, landed: false });
    if (st.woody) this.audio.play('timber', { land: 0.8 });
    else this.audio.play('crumble');
  }

  _updateNodeAnims(dt) {
    if (!this.nodeAnims.size) return;
    const dummy = new THREE.Object3D();
    let rebuild = false;
    for (const [k, a] of this.nodeAnims) {
      a.t += dt;
      const entries = this.nodeIndex.get(k);
      if (!entries) {
        this.nodeAnims.delete(k);
        continue;
      }
      const t = a.t;
      let s = 1, fx = null, done = false;
      if (a.kind === 'grow') {
        s = Math.min(1, 0.2 + t * 1.6) * (1 + Math.sin(Math.min(1, t * 1.6) * Math.PI) * 0.15);
        done = t > 0.8;
      } else if (a.kind === 'hit') {
        const st = a.st;
        if (st.woody) {
          // knocked away from the axe, then sways back and settles
          fx = { tilt: 0.17 * Math.exp(-5.5 * t) * Math.sin(t * 23), dir: a.dir };
          done = t > 0.9;
        } else if (st.anim === 'pick') {
          const q = Math.exp(-7 * t);
          fx = { tilt: 0.11 * q * Math.sin(t * 26), dir: a.dir, sy: 1 - 0.07 * q * Math.cos(t * 30), sxz: 1 + 0.035 * q * Math.cos(t * 30) };
          done = t > 0.6;
        } else {
          // stone and sand don't sway: a quick squash and a tremble
          const q = Math.exp(-15 * t) * Math.cos(t * 40);
          fx = { tilt: 0.025 * Math.exp(-10 * t) * Math.sin(t * 55), dir: a.dir, sy: 1 - (st.anim === 'dig' ? 0.14 : 0.07) * q, sxz: 1 + 0.035 * q };
          done = t > 0.4;
        }
      } else if (a.kind === 'fall') {
        const st = a.st;
        if (st.woody) {
          // tips over slowly, then faster (gravity), bounces once on its crown, lies a moment, then sinks away
          const T1 = 0.8, REST = 1.32;
          let tilt;
          if (t < T1) {
            const x = t / T1;
            tilt = REST * x * x * (0.35 + 0.65 * x);
          } else {
            const y = t - T1;
            tilt = REST - 0.13 * Math.exp(-6 * y) * Math.abs(Math.sin(y * 14));
            if (!a.landed) {
              a.landed = true;
              this._fellBurst(k, a);
            }
          }
          let dy = 0;
          if (t > 1.6) {
            const z = Math.min(1, (t - 1.6) / 0.5);
            s = Math.max(0.001, 1 - ease(z));
            dy = -0.08 * z;
          }
          fx = { tilt, dir: a.dir, dy };
          done = t > 2.1;
        } else {
          const z = Math.min(1, t / 0.38);
          s = Math.max(0.001, 1 - z * z);
          fx = { sy: 1 - 0.45 * z, sxz: 1 + 0.2 * Math.sin(z * Math.PI), dir: a.dir };
          done = t > 0.38;
        }
        if (done) rebuild = true;
      }
      this._nodeMatrix(dummy, k, s, fx);
      for (const e of entries) {
        e.mesh.setMatrixAt(e.i, dummy.matrix);
        e.mesh.instanceMatrix.needsUpdate = true;
      }
      if (done) {
        if (a.kind !== 'fall') {
          this._nodeMatrix(dummy, k, 1);
          for (const e of entries) e.mesh.setMatrixAt(e.i, dummy.matrix);
        }
        this.nodeAnims.delete(k);
      }
    }
    // a felled node is only removed from the instanced meshes once its animation is over
    if (rebuild) this.rebuildNodes();
  }

  /** Dust and leaves where a felled tree lands. */
  _fellBurst(k, a) {
    const b = this._nodeBase(k), st = a.st;
    const len = st.top * b.s;
    const at = new THREE.Vector3(b.x + a.dir.x * len * 0.75, b.y + 0.05, b.z + a.dir.z * len * 0.75);
    this.bursts.emit(at, { n: 16, color: '#d8c9a6', speed: 0.9, up: 0.45, life: 0.7, gravity: 1.5, spread: 0.4 });
    this.engine.shake?.(0.035);
    if (st.leaf) this.bursts.emit(at.setY(b.y + 0.2), { n: 12, color: st.leaf, speed: 0.6, up: 0.9, life: 1.2, gravity: 0.8, spread: 0.35 });
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
      const u = o.userData;
      if (u.spin || u.clock || u.bob || u.pulse || u.float || u.flag || u.swing || u.seesaw) {
        u.y0 = o.position.y;
        u.ph = Math.random() * 10;
        entry.anim.push(o);
      }
    });
    entry.builders = [];
    if (!rec.built) {
      // a scaffold stands around the site until the building is done
      const box = new THREE.Box3().setFromObject(group);
      entry.height = Math.min(2.6, Math.max(0.45, box.max.y - h));
      this._makeScaffold(entry, s);
      group.scale.set(1, 0.02, 1);
    }
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

  /** Scaffolding (poles, planks, braces) around a building site. */
  _makeScaffold(e, size) {
    const b = new Builder();
    const w = size * 0.94, H = e.height + 0.08, hw = w / 2;
    for (const [x, z] of [[-hw, -hw], [hw, -hw], [-hw, hw], [hw, hw]]) b.box(0.03, H, 0.03, '#9a6a46', x, 0, z, {}, 'rough');
    for (let y = 0.28; y < H; y += 0.3) {
      b.box(w, 0.022, 0.06, '#c9a070', 0, y, hw, {}, 'rough');
      b.box(w, 0.022, 0.06, '#c9a070', 0, y, -hw, {}, 'rough');
      b.box(0.06, 0.022, w, '#c9a070', hw, y, 0, {}, 'rough');
      b.box(0.06, 0.022, w, '#c9a070', -hw, y, 0, {}, 'rough');
    }
    const diag = Math.atan2(w, Math.min(H, 0.9));
    b.box(0.02, Math.hypot(w, Math.min(H, 0.9)), 0.02, '#8a5a38', 0, 0, hw + 0.02, { rz: diag, x: -hw });
    b.box(0.02, Math.hypot(w, Math.min(H, 0.9)), 0.02, '#8a5a38', hw + 0.02, 0, 0, { rx: -diag, z: -hw });
    // a pile of materials
    b.box(0.2, 0.06, 0.1, '#c9a070', hw + 0.16, 0, hw - 0.1, { ry: 0.3 }, 'rough');
    b.box(0.12, 0.1, 0.12, '#a8794c', hw + 0.14, 0, hw - 0.3, {}, 'rough');
    const g = b.build();
    g.position.copy(e.group.position);
    g.rotation.y = e.group.rotation.y;
    g.traverse((o) => (o.raycast = () => {}));
    this.root.add(g);
    e.scaffold = g;
  }

  _dropScaffold(e) {
    if (!e.scaffold) return;
    this.dying.push({ group: e.scaffold, t: 0, scaffold: true, y0: e.scaffold.position.y, center: e.center.clone() });
    e.scaffold = null;
  }

  _releaseBuilders(e, burst = false) {
    for (const bd of e.builders || []) {
      if (burst) this.bursts.emit(bd.pos.clone().setY(bd.pos.y + 0.3), { n: 6, color: '#ffe08a', speed: 0.6, up: 1, life: 0.6, glow: 2 });
      this.crowd.release(bd.slot);
      this.builderCount--;
    }
    e.builders = [];
  }

  /** Builders hammer away around unfinished buildings. */
  _updateSite(e, dt) {
    const s = BUILDINGS[e.rec.type].size;
    const want = this.quality.ambient > 0.3 ? (s > 1 ? 2 : 1) : 0;
    while (e.builders.length < want && this.builderCount < MAX_BUILDERS) {
      const slot = this.crowd.alloc(BUILDER_LOOK(Math.random));
      if (slot < 0) break;
      this.builderCount++;
      const n = e.builders.length;
      const hw = s * 0.47 + 0.22;
      const side = [[hw, 0.1], [-0.1, hw], [-hw, -0.1], [0.1, -hw]][(n * 2 + (e.rec.id % 2)) % 4];
      const ry = e.group.rotation.y;
      const x = e.center.x + side[0] * Math.cos(ry) + side[1] * Math.sin(ry), z = e.center.z - side[0] * Math.sin(ry) + side[1] * Math.cos(ry);
      const pos = new THREE.Vector3(x, this.heightAt(x, z), z);
      const bd = { slot, pos, yaw: Math.atan2(-(e.center.z - z), e.center.x - x), phase: Math.random() * 10, pace: 0.85 + Math.random() * 0.3, scale: 0.95 + Math.random() * 0.1, hit: 0 };
      e.builders.push(bd);
      this.bursts.emit(pos.clone().setY(pos.y + 0.3), { n: 8, color: '#c9b48a', speed: 0.5, up: 0.8, life: 0.5 });
    }
    const T = GATHER_ANIMS.hammer.T;
    for (const bd of e.builders) {
      const u0 = (bd.phase / TAU) % 1;
      bd.phase += (dt * TAU * bd.pace) / T;
      const u1 = (bd.phase / TAU) % 1;
      if (u1 < u0 || (u0 < GATHER_ANIMS.hammer.hit && u1 >= GATHER_ANIMS.hammer.hit)) {
        const fx = Math.cos(bd.yaw), fz = -Math.sin(bd.yaw);
        this.bursts.emit(_tmpV.set(bd.pos.x + fx * 0.3, bd.pos.y + 0.2 + Math.random() * 0.2, bd.pos.z + fz * 0.3), { n: 2, color: Math.random() < 0.5 ? '#ffd08a' : '#c9b48a', speed: 0.5, up: 0.7, life: 0.35, gravity: 3, glow: 2 });
        if (Math.random() < 0.12) this.audio.play('chop');
      }
    }
  }

  removeBuilding(rec, animate = true) {
    const e = this.buildings.get(rec.id);
    if (!e) return;
    this._releaseBuilders(e);
    if (e.scaffold) {
      this.root.remove(e.scaffold);
      disposeModel(e.scaffold);
      e.scaffold = null;
    }
    if (animate) {
      // the old building shudders, sinks and crumbles away before it disappears
      this.dying.push({ group: e.group, t: 0, y0: e.group.position.y, center: e.center.clone(), size: BUILDINGS[rec.type].size });
      e.group.traverse((o) => (o.raycast = () => {}));
      this.engine.shake?.(0.06);
      this.audio.play('crumble');
    } else {
      this.root.remove(e.group);
      disposeModel(e.group);
    }
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
    this.removeBuilding(rec, false);
    const n = this.addBuilding(rec);
    if (!rec.built) n.group.scale.y = progress;
    else n.pop = 0;
    if (rec.built) this.bursts.emit(n.center.clone().add(new THREE.Vector3(0, 0.5, 0)), { n: 18, color: '#ffe08a', speed: 1, up: 1.6, life: 0.8, glow: 2 });
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
    const look = { skin: '#f1c7a3', coat: '#2f4a7a', pants: '#2b2f3a', hair: '#2a1e17', hat: '#c94a3d', umbrella: '#ffd23d', tool: '#9a6a46', toolHead: TOOL_COLORS[0], long: false };
    const slot = this.crowd.alloc(look);
    this._toolTier = -1;
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
    const rt = { noUmb: hash(p.id, 9) < 0.28, fid: null, fidT: Math.random() * 6, workAlt: 0, altT: 4 + Math.random() * 8, tool: false, p, slot, pos: new THREE.Vector3(), yaw: Math.random() * 6, anim: 'idle', phase: Math.random() * 10, path: null, pi: 0, mode: 'idle', goal: null, think: Math.random(), wait: 0, ox: (Math.random() - 0.5) * 0.4, oz: (Math.random() - 0.5) * 0.4, speed: 0.85 + Math.random() * 0.25, scale: 0.9 + Math.random() * 0.15, visible: true };
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
    const w = g.weatherName();
    const bad = w === 'storm' || (w === 'rain' && Math.random() < 0.5 && rt.mode !== 'walk') || w === 'snow' && Math.random() < 0.2 || !!g.evFx().indoors;
    const gather = g.eventGather(h);
    if (gather) return { kind: 'festival', pose: gather };
    if (h < 6 || h >= 22) return { kind: 'sleep' };
    if (h < 7.6) return { kind: 'home' };
    const working = (h >= 8 && h < 12) || (h >= 13 && h < 17);
    if (working) return p.job ? { kind: 'work' } : bad ? { kind: 'home' } : { kind: 'wander' };
    if (h >= 12 && h < 13) {
      const kedai = this._nearestOfType('kedai', rt.pos);
      if (kedai && p.need.food < 75) return { kind: 'eat', bid: kedai.id };
      return p.job ? { kind: 'work' } : { kind: 'wander' };
    }
    if (h >= 17 && h < 21) return w === 'storm' || w === 'rain' || g.evFx().indoors ? { kind: 'home' } : { kind: 'leisure' };
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
        const je = job && this.buildings.get(job.id);
        if (je) this._face(rt, je.center);
        // fishers walk out onto the pier and face the water
        if (job?.type === 'nelayan' && je) {
          const ry = je.group.rotation.y;
          const lx = 0.15, lz = 0.55 + (p.id % 2) * 0.22;
          rt.pier = { tile: tileAt(rt.pos.x, rt.pos.z) };
          rt.pos.set(je.center.x + lx * Math.cos(ry) + lz * Math.sin(ry), je.center.y + 0.06, je.center.z - lx * Math.sin(ry) + lz * Math.cos(ry));
          rt.yaw = Math.atan2(-Math.cos(ry), Math.sin(ry));
        }
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
        rt.mode = want.pose === 'wave' ? 'cheer' : 'dance';
        rt.festPose = want.pose || 'dance';
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
    if (rt.pier) {
      // back off the pier before walking anywhere
      this._placeAt(rt, rt.pier.tile, false);
      rt.pier = null;
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
    const speed = rt.speed * (road ? 1.45 : 1) * this.walkScale * (rt.run ? 1.75 : 1);
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
      // prefer the straight sides: from a diagonal the tool cannot reach
      const dd = Math.hypot(x - m.pos.x, z - m.pos.z) + (this.I.nodes[nk]?.hp ? 3 : 0) + (di && dj ? 1.2 : 0);
      if (dd < bd) {
        bd = dd;
        best = [ni, nj];
      }
    }
    if (!best) return false;
    m.task = { kind: 'gather', k };
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
      this.game.emit('toast', { text: "Can't find a way there", kind: 'warn' });
      m.task = null;
    }
  }

  /**
   * Gathering, in three steps: walk the last few steps up to the node so the tool really reaches it,
   * ease into the pose, then loop the animation. The hit (sound, particles, resources, the node's
   * reaction) happens on the exact frame the tool lands. After the last hit the pose eases out.
   */
  _updateGather(m, t, dt) {
    if (!t.st) {
      const node = this.game.nodeAt(t.k);
      if (!node) {
        m.task = null;
        m.mode = 'idle';
        return;
      }
      const st = GATHER[node.k] || GATHER.rock;
      const b = this._nodeBase(t.k);
      let dx = m.pos.x - b.x, dz = m.pos.z - b.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      const want = REACH[st.anim] + st.r * b.s;
      // never step off the mayor's own tile
      const [ti, tj] = tileAt(m.pos.x, m.pos.z);
      const [cx, cz] = tileCenter(ti, tj);
      const keep = (v, c) => Math.min(c + 0.46, Math.max(c - 0.46, v));
      t.stand = { x: keep(b.x + dx * want, cx), z: keep(b.z + dz * want, cz) };
      Object.assign(t, { st, b, u: 0, blend: 0, done: false, placed: false, dir: { x: -dx, z: -dz } });
    }
    const st = t.st, A = GATHER_ANIMS[st.anim], b = t.b;
    const target = _tmpV.set(b.x, 0, b.z);
    if (!t.placed) {
      const dx = t.stand.x - m.pos.x, dz = t.stand.z - m.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.01) {
        const step = Math.min(d, dt * 1.1);
        m.pos.x += (dx / d) * step;
        m.pos.z += (dz / d) * step;
        m.phase += step * 11;
        m.anim = 'walk';
        this._face(m, target);
        return;
      }
      t.placed = true;
    }
    this._face(m, target);
    m.anim = st.anim;
    if (t.done) {
      t.u = Math.min(0.999, t.u + dt / A.T);
      t.blend = Math.max(0, t.blend - dt / 0.35);
      if (t.blend <= 0) {
        m.task = null;
        m.mode = 'idle';
      }
      return;
    }
    if (t.blend < 1) {
      t.blend = Math.min(1, t.blend + dt / 0.22);
      return;
    }
    const node = this.game.nodeAt(t.k);
    if (!node) {
      t.done = true;
      return;
    }
    const u0 = t.u, u1 = u0 + dt / A.T;
    if (u0 < A.hit && u1 >= A.hit) this._gatherHit(t, node);
    if (A.toss && u0 < A.toss && u1 >= A.toss) this._gatherToss(m, t);
    t.u = u1 >= 1 ? u1 - 1 : u1;
  }

  _gatherHit(t, node) {
    const st = t.st, b = t.b, nd = NODES[node.k], dir = t.dir;
    this.audio.play(nd.sfx);
    const at = new THREE.Vector3(b.x - dir.x * st.r * b.s, b.y + HIT_Y[st.anim], b.z - dir.z * st.r * b.s);
    const col = RES_COLOR[nd.res] || '#ffffff';
    const back = { x: -dir.x * 0.45, z: -dir.z * 0.45 };
    if (st.anim === 'chop') {
      // wood chips spray out of the cut, a few leaves drift down from the crown
      this.bursts.emit(at, { n: 6, color: col, speed: 0.7, up: 0.9, life: 0.5, push: back });
      if (st.leaf) this.bursts.emit(new THREE.Vector3(b.x, b.y + st.top * b.s * 0.85, b.z), { n: 3, color: st.leaf, speed: 0.3, up: 0.15, life: 1.4, gravity: 0.45, spread: 0.3 });
    } else if (st.anim === 'mine') {
      this.bursts.emit(at, { n: 6, color: col, speed: 0.7, up: 1.0, life: 0.45, push: { x: back.x * 0.5, z: back.z * 0.5 } });
      this.bursts.emit(at.clone().addScaledVector(_axis.set(dir.x, 0, dir.z), 0.05), { n: 3, color: st.spark || '#fff2c8', speed: 0.8, up: 0.7, life: 0.2, gravity: 1, glow: 3 });
    } else if (st.anim === 'dig') {
      this.bursts.emit(at, { n: 8, color: col, speed: 0.5, up: 0.6, life: 0.45, spread: 0.1 });
    } else {
      this.bursts.emit(at, { n: 4, color: st.leaf, speed: 0.4, up: 0.6, life: 0.6, gravity: 1.5 });
      this.bursts.emit(at, { n: 2, color: st.fruit, speed: 0.3, up: 0.8, life: 0.6 });
    }
    const res = this.game.gather(t.k);
    if (!res || res.depleted) {
      t.done = true;
      if (!st.woody) this.bursts.emit(at.setY(b.y + 0.15), { n: 18, color: col, speed: 1.1, up: 1.2, life: 0.7, spread: 0.3 });
      this.fellNode(t.k, node.k, dir);
    } else this.shakeNode(t.k, dir);
  }

  /** Digging: the spadeful of sand is thrown off to the side. */
  _gatherToss(m, t) {
    const d = t.dir, side = { x: -d.z, z: d.x };
    const at = new THREE.Vector3(m.pos.x + d.x * 0.2 + side.x * 0.1, m.pos.y + 0.55, m.pos.z + d.z * 0.2 + side.z * 0.1);
    this.bursts.emit(at, { n: 10, color: RES_COLOR.sand, speed: 0.25, up: 0.8, life: 0.6, gravity: 3.2, push: { x: side.x * 0.8, z: side.z * 0.8 } });
  }

  _updateMayor(dt) {
    const m = this.mayor;
    const tier = this.game.s.player.tool | 0;
    if (this._toolTier !== tier) {
      this._toolTier = tier;
      this.crowd.setToolColor(m.slot, TOOL_COLORS[Math.min(tier, TOOL_COLORS.length - 1)]);
    }
    if (m.mode === 'walk') {
      const done = this._move(m, dt * 1.6);
      if (done) m.mode = m.task ? 'task' : 'idle';
      return;
    }
    if (m.mode === 'task' && m.task) {
      const t = m.task;
      if (t.kind === 'gather') {
        this._updateGather(m, t, dt);
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

  // ---------------------------------------------------------------- event visuals
  // What random events add to the diorama: tappable props the Mayor walks up to (stars, chests, a
  // puppy, hiding kids, bee swarms, wisps, a dig spot, a pot of gold), visiting hosts (bard, royal),
  // one pool of glowing motes (lanterns, fireflies, butterflies, petals, sand, shooting stars...),
  // a harvest moon and a rainbow billboard, plus small env tints, ambience loops and one-shots.
  // Cost: one Points draw call, up to two quads and a handful of tiny meshes. Nothing is allocated
  // per frame apart from the occasional Bursts.emit. Data tables are at the end of this file.

  _evInit() {
    const max = EV_MAX_MOTES;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(max * 3), col = new Float32Array(max * 4), size = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = fxMaterial({
      vertexShader: /* glsl */`
        attribute vec4 aCol;
        attribute float aSize;
        varying vec4 vC;
        void main() { vC = aCol; gl_PointSize = aSize; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec4 vC;
        void main() { if (vC.a < 0.02) discard; gl_FragColor = vec4(vC.rgb, min(1.0, vC.a)); gNormal = vec4(0.0); }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    pts.visible = false;
    this.root.add(pts);
    const motes = [];
    for (let i = 0; i < max; i++) motes.push({ type: 0, x: 0, y: 0, z: 0, ax: 0, ay: 0, az: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, ph: 0, r: 1, g: 1, b: 1, a: 0, s: 1, k: 0, c: 0, lead: null });
    const beeAt = [];
    for (let i = 0; i < 8; i++) beeAt.push(new THREE.Vector3());
    this.evfx = {
      id: null, ev: null, vis: null, k: 0, pts, geo, pos, col, size, motes, count: 0, plist: [], host: null, moon: null, rainbow: null,
      tm: {}, loops: null, aurora: false, moonSave: null, emT: 0, anchorT: 0, plaza: new THREE.Vector3(), markets: [], farms: [], homes: [], water: [], sites: [],
      beeAt, nBee: 0, v: new THREE.Vector3(), spot: { ax: 0, ay: 0, az: 0 },
      pose: { pos: null, yaw: 0, scale: 1, anim: 'idle', phase: 0, umbrella: false, hat: true, long: false },
    };
    return this.evfx;
  }

  _disposeEventFx() {
    const F = this.evfx;
    if (!F) return;
    if (F.id) this._evTeardown(true);
    F.geo.dispose();
    F.pts.material.dispose();
    for (const m of [F.moon, F.rainbow]) if (m) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this.evfx = null;
  }

  _evSetup(ev) {
    const F = this.evfx;
    const vis = EV_VIS[ev.id] || EV_NONE;
    F.id = ev.id;
    F.ev = ev;
    F.vis = vis;
    F.k = 0;
    F.tm = {};
    F.emT = 0;
    this._evAnchors();
    let n = 0;
    for (const [type, count] of vis.motes || []) for (let c = 0; c < count && n < EV_MAX_MOTES; c++) {
      const m = F.motes[n];
      m.type = type;
      m.c = c;
      m.k = type === M_STREAK ? c % 6 : 0;
      m.lead = type === M_STREAK ? F.motes[n - m.k] : null;
      m.ph = Math.random() * 6.283;
      this._moteSpawn(m, true);
      n++;
    }
    F.count = n;
    F.pts.visible = n > 0;
    F.geo.setDrawRange(0, n);
    if (vis.aurora && !this.env.auroraOn) {
      this.env.auroraOn = true;
      F.aurora = true;
    }
    if (vis.moon) {
      F.moonSave = this.env.sky.moon ?? 0.9;
      this.env.sky.moon = 0; // our big orange moon replaces the usual one
    }
    F.loops = vis.loops || null;
  }

  _evTeardown(disposing = false) {
    const F = this.evfx;
    for (const rt of F.plist) this._evDropProp(rt, false, disposing);
    F.plist.length = 0;
    if (F.host) {
      if (!disposing) this.crowd.release(F.host.slot);
      F.host = null;
    }
    for (let i = 0; i < F.count; i++) F.motes[i].type = 0;
    F.count = 0;
    F.geo.setDrawRange(0, 0);
    F.pts.visible = false;
    if (F.moon) F.moon.visible = false;
    if (F.rainbow) F.rainbow.visible = false;
    if (F.aurora) {
      this.env.auroraOn = false;
      F.aurora = false;
    }
    if (F.moonSave !== null) {
      this.env.sky.moon = F.moonSave;
      F.moonSave = null;
    }
    if (F.loops && !disposing) for (const name in F.loops) this.audio.setLoop(name, this._loopBase?.[name] || 0);
    F.loops = null;
    F.id = null;
    F.ev = null;
    F.vis = null;
  }

  /** Where things happen: the plaza, markets, farms, homes, construction sites, water by the docks. */
  _evAnchors() {
    const F = this.evfx, I = this.I;
    const balai = I.buildings.find((b) => b.type === 'balai');
    const door = this.doorTile(balai) || [I.plaza.i, I.plaza.j + 2];
    const [px, pz] = tileCenter(door[0], door[1]);
    F.plaza.set(px, this.tileH(door[0], door[1]), pz);
    const markets = [], farms = [], homes = [], water = [], sites = [];
    for (const e of this.buildings.values()) {
      const r = e.rec;
      if (!r.built) {
        sites.push(e.center);
        continue;
      }
      const def = BUILDINGS[r.type];
      if (r.type === 'pasar') markets.push(e.center);
      if (r.type === 'ladang') farms.push(e.center);
      if (def.housing) homes.push(e.center);
      if (r.type === 'nelayan' && water.length < 16)
        for (let a = -2; a <= def.size + 1; a++)
          for (let b = -2; b <= def.size + 1; b++) {
            const i = r.i + a, j = r.j + b;
            if (inside(i, j) && I.t[idx(i, j)] === 'w' && water.length < 16) {
              const [x, z] = tileCenter(i, j);
              water.push(new THREE.Vector3(x, 0.02, z));
            }
          }
    }
    F.markets = markets.length ? markets : [F.plaza];
    F.farms = farms.length ? farms : [F.plaza];
    F.homes = homes.length ? homes : [F.plaza];
    F.water = water;
    F.sites = sites;
  }

  /** A random spot on dry land; sets m.ax/ay/az. */
  _evLand(m, lift = 0) {
    for (let t = 0; t < 12; t++) {
      const x = (Math.random() - 0.5) * HALF * 1.8, z = (Math.random() - 0.5) * HALF * 1.8;
      const h = this.heightAt(x, z);
      if (h > 0.1) {
        m.ax = x;
        m.az = z;
        m.ay = h + lift;
        return;
      }
    }
    m.ax = this.evfx.plaza.x;
    m.az = this.evfx.plaza.z;
    m.ay = this.evfx.plaza.y + lift;
  }

  _evPick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  _moteSpawn(m, initial) {
    const F = this.evfx;
    const rnd = Math.random;
    m.t = 0;
    switch (m.type) {
      case M_LANTERN: {
        const a = F.plaza;
        m.ax = a.x + (rnd() - 0.5) * 5;
        m.az = a.z + (rnd() - 0.5) * 5;
        m.ay = a.y + 0.3;
        m.vy = 0.22 + rnd() * 0.16;
        m.life = 12 + rnd() * 5;
        if (initial) m.t = rnd() * m.life;
        m.r = 1.9;
        m.g = 0.7 + rnd() * 0.3;
        m.b = 0.15;
        m.s = 3;
        break;
      }
      case M_HANG: {
        const a = this._evPick(F.markets);
        const ang = rnd() * 6.283, rad = 0.9 + rnd() * 1.1;
        m.ax = a.x + Math.cos(ang) * rad;
        m.az = a.z + Math.sin(ang) * rad;
        m.ay = a.y + 0.95 + rnd() * 0.45;
        const c = this._evPick(HANG_COL);
        m.r = c[0] * 1.35;
        m.g = c[1] * 1.35;
        m.b = c[2] * 1.35;
        m.s = 2;
        break;
      }
      case M_FLY:
        this._evLand(m, 0.25 + rnd() * 1.1);
        m.r = 1.0;
        m.g = 1.9;
        m.b = 0.3;
        m.s = 2;
        break;
      case M_BFLY: {
        this._evLand(m, 0.35 + rnd() * 0.4);
        const c = this._evPick(BFLY_COL);
        m.r = c[0] * 1.15;
        m.g = c[1] * 1.15;
        m.b = c[2] * 1.15;
        break;
      }
      case M_WISP: {
        this._evLand(m, 0.45 + rnd() * 0.9);
        const cyan = rnd() < 0.35;
        m.r = cyan ? 0.4 : 1.05;
        m.g = cyan ? 1.25 : 0.5;
        m.b = 1.5;
        m.s = 2;
        break;
      }
      case M_PETAL: {
        this._evLand(m, 0);
        m.x = m.ax;
        m.z = m.az;
        m.y = initial ? m.ay + rnd() * 5 : m.ay + 3 + rnd() * 2.5;
        m.vy = -(0.28 + rnd() * 0.2);
        const c = this._evPick(PETAL_COL);
        m.r = c[0];
        m.g = c[1];
        m.b = c[2];
        m.s = rnd() < 0.3 ? 2 : 1;
        break;
      }
      case M_SAND: {
        const L = HALF * 1.1;
        m.x = (rnd() - 0.5) * 2 * L;
        m.z = (rnd() - 0.5) * 2 * L;
        m.y = 0.1 + rnd() * 2.6;
        m.vx = 3 + rnd() * 2.5;
        const c = this._evPick(SAND_COL);
        m.r = c[0];
        m.g = c[1];
        m.b = c[2];
        m.a = 0.7 + rnd() * 0.3;
        m.s = rnd() < 0.55 ? 2 : 1;
        break;
      }
      case M_HEAT:
        this._evLand(m, 0.05);
        m.life = 2.5 + rnd() * 2;
        if (initial) m.t = rnd() * m.life;
        m.r = 1.3;
        m.g = 1.25;
        m.b = 1.15;
        m.s = 1;
        break;
      case M_EMBER: {
        const a = this._evPick(F.farms);
        m.ax = a.x + (rnd() - 0.5) * 2.6;
        m.az = a.z + (rnd() - 0.5) * 2.6;
        m.ay = a.y + 0.15;
        m.vy = 0.25 + rnd() * 0.2;
        m.life = 4 + rnd() * 3;
        if (initial) m.t = rnd() * m.life;
        m.r = 1.45;
        m.g = 0.7;
        m.b = 0.18;
        m.s = rnd() < 0.4 ? 2 : 1;
        break;
      }
      case M_BEE: {
        const dark = m.c % 3 === 0;
        m.r = dark ? 0.25 : 1.3;
        m.g = dark ? 0.2 : 1.05;
        m.b = dark ? 0.1 : 0.2;
        m.s = 1;
        break;
      }
      case M_STREAK:
        if (m.k === 0) {
          // only the head of each streak owns the path; the tail reads it
          const top = (this.info?.top || 4) + 3 + rnd() * 3.5;
          const a = rnd() * 6.283;
          m.ax = Math.cos(a) * HALF * (0.4 + rnd() * 0.8);
          m.az = Math.sin(a) * HALF * (0.4 + rnd() * 0.8);
          m.ay = top;
          const d = rnd() * 6.283, sp = 11 + rnd() * 6;
          m.vx = Math.cos(d) * sp;
          m.vz = Math.sin(d) * sp;
          m.vy = -sp * (0.25 + rnd() * 0.2);
          m.life = 0.55 + rnd() * 0.35;
          m.t = -(initial ? rnd() * 3 : 0.6 + rnd() * 2.8);
        }
        m.r = 1.6;
        m.g = 1.5;
        m.b = 1.05;
        m.s = m.k === 0 ? 2 : 1;
        break;
    }
  }

  _evUpdateMotes(dt, F) {
    const T = this.time, env = this.env, k = F.k;
    const night = env.night, day = env.daylight;
    const wx = env.windDir.x, wz = env.windDir.y;
    const L = HALF * 1.1;
    const P = F.pos, C = F.col, S = F.size;
    for (let i = 0; i < F.count; i++) {
      const m = F.motes[i];
      let a = 1;
      switch (m.type) {
        case M_LANTERN:
          m.t += dt;
          if (m.t > m.life) this._moteSpawn(m, false);
          m.y = m.ay + m.vy * m.t;
          m.x = m.ax + Math.sin(m.t * 0.8 + m.ph) * 0.25 + m.t * 0.05;
          m.z = m.az + Math.cos(m.t * 0.6 + m.ph) * 0.2 + m.t * 0.035;
          a = Math.min(1, m.t / 1.2) * Math.min(1, (m.life - m.t) / 3) * (0.85 + 0.15 * Math.sin(T * 11 + m.ph * 7));
          m.s = m.y - m.ay > 4.5 ? 2 : 3;
          break;
        case M_HANG:
          m.x = m.ax;
          m.z = m.az;
          m.y = m.ay + Math.sin(T * 1.5 + m.ph) * 0.03;
          a = (0.35 + 0.65 * night) * (0.85 + 0.15 * Math.sin(T * 9 + m.ph * 5));
          break;
        case M_FLY: {
          m.x = m.ax + Math.sin(T * 0.7 + m.ph) * 0.45;
          m.y = m.ay + Math.sin(T * 1.1 + m.ph * 2) * 0.2;
          m.z = m.az + Math.cos(T * 0.6 + m.ph) * 0.45;
          const bl = Math.max(0, Math.sin(T * 2.1 + m.ph * 3));
          a = bl * bl * (0.15 + 0.85 * night);
          m.s = a > 0.45 ? 2 : 1;
          break;
        }
        case M_BFLY: {
          const u = T * 0.9 + m.ph;
          m.x = m.ax + Math.sin(u) * 0.9 + Math.sin(u * 2.3) * 0.3;
          m.z = m.az + Math.cos(u * 0.8) * 0.9;
          m.y = m.ay + 0.25 * Math.sin(u * 1.7);
          m.s = Math.sin(T * 18 + m.ph * 9) > -0.2 ? 2 : 1;
          a = 0.35 + 0.65 * day;
          break;
        }
        case M_WISP:
          m.x = m.ax + Math.sin(T * 0.35 + m.ph) * 0.8;
          m.z = m.az + Math.cos(T * 0.3 + m.ph * 1.7) * 0.8;
          m.y = m.ay + Math.sin(T * 0.9 + m.ph) * 0.15;
          a = 0.55 + 0.45 * Math.sin(T * 2 + m.ph);
          break;
        case M_PETAL:
          m.y += m.vy * dt;
          m.x += (Math.sin(T * 1.3 + m.ph) * 0.3 + 0.15) * dt;
          m.z += Math.cos(T * 1.1 + m.ph) * 0.2 * dt;
          if (m.y < m.ay) this._moteSpawn(m, false);
          break;
        case M_SAND:
          m.x += wx * m.vx * dt;
          m.z += wz * m.vx * dt;
          m.y += Math.sin(T * 3 + m.ph) * 0.2 * dt;
          if (m.x > L) m.x -= 2 * L;
          else if (m.x < -L) m.x += 2 * L;
          if (m.z > L) m.z -= 2 * L;
          else if (m.z < -L) m.z += 2 * L;
          a = m.a;
          break;
        case M_HEAT:
          m.t += dt;
          if (m.t > m.life) this._moteSpawn(m, false);
          m.x = m.ax + Math.sin(T * 2 + m.ph) * 0.05;
          m.y = m.ay + m.t * 0.45;
          m.z = m.az;
          a = 0.25 * Math.sin((Math.PI * m.t) / m.life) * day;
          break;
        case M_EMBER:
          m.t += dt;
          if (m.t > m.life) this._moteSpawn(m, false);
          m.x = m.ax + Math.sin(m.t * 1.7 + m.ph) * 0.15;
          m.y = m.ay + m.t * m.vy;
          m.z = m.az + Math.cos(m.t * 1.3 + m.ph) * 0.15;
          a = Math.sin((Math.PI * m.t) / m.life) * (0.3 + 0.7 * night);
          break;
        case M_BEE: {
          if (!F.nBee) {
            a = 0;
            break;
          }
          const c = F.beeAt[m.c % F.nBee];
          m.x = c.x + Math.cos(T * 7 + m.ph) * 0.24 + Math.sin(T * 3.1 + m.ph) * 0.08;
          m.y = c.y + 0.4 + Math.sin(T * 11 + m.ph) * 0.12;
          m.z = c.z + Math.sin(T * 6 + m.ph * 1.3) * 0.24;
          break;
        }
        case M_STREAK: {
          const h = m.lead;
          if (m.k === 0) {
            h.t += dt;
            if (h.t > h.life) this._moteSpawn(h, false);
          }
          const tt = h.t - m.k * 0.035;
          if (tt < 0 || tt > h.life) {
            a = 0;
            break;
          }
          m.x = h.ax + h.vx * tt;
          m.y = h.ay + h.vy * tt;
          m.z = h.az + h.vz * tt;
          a = (1 - m.k / 6) * Math.min(1, (h.life - tt) / 0.2) * (0.2 + 0.8 * night);
          break;
        }
        default:
          a = 0;
      }
      const p3 = i * 3, p4 = i * 4;
      P[p3] = m.x;
      P[p3 + 1] = m.y;
      P[p3 + 2] = m.z;
      C[p4] = m.r;
      C[p4 + 1] = m.g;
      C[p4 + 2] = m.b;
      C[p4 + 3] = a * k;
      S[i] = m.s;
    }
    if (F.count) {
      F.geo.attributes.position.needsUpdate = true;
      F.geo.attributes.aCol.needsUpdate = true;
      F.geo.attributes.aSize.needsUpdate = true;
    }
  }

  // ---- props

  _evModel(kind) {
    const b = new Builder();
    switch (kind) {
      case 'star':
        b.glowBall(0.085, '#fff1a0', 7, 0, 0, 0, '#e8c860', true);
        b.glowBox(0.32, 0.03, 0.03, '#fff6c8', 5, 0, -0.015, 0, {}, '#e8c860', true);
        b.glowBox(0.32, 0.03, 0.03, '#fff6c8', 5, 0, -0.015, 0, { ry: Math.PI / 2 }, '#e8c860', true);
        b.glowBox(0.03, 0.32, 0.03, '#fff6c8', 5, 0, -0.16, 0, {}, '#e8c860', true);
        break;
      case 'gold':
        b.cyl(0.11, 0.13, 0.15, '#2b2b36', 0, 0, 0);
        b.cyl(0.135, 0.135, 0.03, '#3a3a48', 0, 0.14, 0);
        b.glowBall(0.09, '#ffd23d', 2.5, 0, 0.17, 0, '#e2b33c', true);
        b.glowBall(0.05, '#ffe08a', 3, 0.07, 0.21, 0.03, '#e2b33c', true);
        b.glowBall(0.045, '#ffe08a', 3, -0.06, 0.2, -0.04, '#e2b33c', true);
        break;
      case 'dog':
        b.box(0.24, 0.11, 0.12, '#f2e6d4', 0, 0.07, 0);
        b.box(0.1, 0.025, 0.125, '#8a5a38', -0.02, 0.165, 0);
        b.box(0.12, 0.12, 0.12, '#f2e6d4', 0.15, 0.12, 0);
        b.box(0.05, 0.05, 0.07, '#8a5a38', 0.225, 0.13, 0);
        b.box(0.03, 0.03, 0.03, '#1b1d2b', 0.255, 0.165, 0);
        b.box(0.04, 0.07, 0.03, '#8a5a38', 0.14, 0.2, 0.065, { rx: 0.3 });
        b.box(0.04, 0.07, 0.03, '#8a5a38', 0.14, 0.2, -0.065, { rx: -0.3 });
        b.box(0.025, 0.025, 0.025, '#1b1d2b', 0.21, 0.19, 0.035);
        b.box(0.025, 0.025, 0.025, '#1b1d2b', 0.21, 0.19, -0.035);
        b.box(0.03, 0.1, 0.03, '#8a5a38', -0.13, 0.13, 0, { rz: 0.7 });
        for (const [x, z] of [[0.08, 0.04], [0.08, -0.04], [-0.08, 0.04], [-0.08, -0.04]]) b.box(0.035, 0.07, 0.035, '#d8c8b0', x, 0, z);
        b.box(0.02, 0.03, 0.13, '#d8323a', 0.1, 0.16, 0);
        break;
      case 'chest':
        b.box(0.32, 0.18, 0.24, '#7a5a3a', 0, 0, 0);
        b.box(0.34, 0.03, 0.26, '#c9b48a', 0, 0.1, 0);
        b.box(0.34, 0.09, 0.26, '#5e3f2b', 0, 0.18, 0, { rx: -0.1 });
        b.glowBox(0.06, 0.06, 0.02, '#ffe08a', 6, 0, 0.09, 0.13, {}, '#e2b33c', true);
        break;
      case 'dig':
        b.glowBox(0.56, 0.02, 0.09, '#ff4a4a', 1.6, 0, 0.012, 0, { ry: Math.PI / 4 }, '#d8323a', true);
        b.glowBox(0.56, 0.02, 0.09, '#ff4a4a', 1.6, 0, 0.012, 0, { ry: -Math.PI / 4 }, '#d8323a', true);
        b.dome(0.13, '#8e6444', 0.32, 0, 0.12, { sy: 0.6 });
        b.box(0.025, 0.3, 0.025, '#9a6a46', 0.36, 0.05, 0.12, { rz: 0.35 });
        b.box(0.08, 0.1, 0.02, '#c8cdd6', 0.4, 0.0, 0.12, { rz: 0.35 });
        break;
      case 'wisp':
        b.glowBall(0.065, '#d9b8ff', 6, 0, 0, 0, '#9a7ad8', true);
        b.glowBall(0.03, '#ffffff', 6, 0.035, 0.03, 0.045, '#ffffff', true);
        break;
      case 'bees':
        b.dome(0.12, '#e0b04a', 0, 0, 0, { sy: 1.3 });
        b.cyl(0.115, 0.122, 0.025, '#a8742a', 0, 0.05, 0);
        b.cyl(0.085, 0.095, 0.025, '#a8742a', 0, 0.11, 0);
        b.box(0.04, 0.035, 0.02, '#3a2a1a', 0, 0.02, 0.11);
        break;
      default:
        return null;
    }
    return b.build();
  }

  _evMakeProp(pr) {
    const F = this.evfx;
    const rt = { pr, obj: null, slot: -1, pos: new THREE.Vector3(), yaw: Math.random() * 6.283, anim: 'idle', phase: Math.random() * 10, t: 0, drop: 0, moveT: 2, waveT: 2 + Math.random() * 3, sfxT: 2 + Math.random() * 3, bx: 0, by: 0, bz: 0, hy: 0.15, item: { type: 'tile', i: pr.i, j: pr.j } };
    this._evTile(rt);
    rt.pos.set(rt.bx, rt.by, rt.bz);
    if (pr.k === 'kid') {
      rt.slot = this.crowd.alloc(pr.look);
      rt.hy = 0.22;
      // stand half hidden behind the nearest tree or rock
      rt.pos.x += (Math.random() - 0.5) * 0.3;
      rt.pos.z += (Math.random() - 0.5) * 0.3;
    } else {
      rt.obj = this._evModel(pr.k);
      if (rt.obj) {
        rt.obj.position.copy(rt.pos);
        this.root.add(rt.obj);
      }
    }
    if (pr.k === 'wisp' || pr.k === 'star') rt.hy = 0.25;
    // stars that land after the event began fall out of the sky
    if (pr.k === 'star' && F.k >= 1) {
      rt.drop = 1;
      this.audio.play('whoosh', { dur: 0.9 });
    }
    return rt;
  }

  _evTile(rt) {
    const [x, z] = tileCenter(rt.pr.i, rt.pr.j);
    rt.bx = x;
    rt.bz = z;
    rt.by = this.tileH(rt.pr.i, rt.pr.j);
    rt.item.i = rt.pr.i;
    rt.item.j = rt.pr.j;
  }

  _evDropProp(rt, burst, disposing = false) {
    if (burst) {
      const col = PROP_COLOR[rt.pr.k] || '#ffe08a';
      this.bursts.emit(this.evfx.v.copy(rt.pos).setY(rt.pos.y + 0.25), { n: 22, color: col, speed: 1.2, up: 1.8, life: 0.9, glow: 2.5 });
    }
    if (rt.obj) {
      this.root.remove(rt.obj);
      disposeModel(rt.obj);
      rt.obj = null;
    }
    if (rt.slot >= 0 && !disposing) this.crowd.release(rt.slot);
    rt.slot = -1;
  }

  _evSyncProps(F, ev) {
    const list = ev.props;
    if (!list) return;
    for (const pr of list) {
      if (pr.done) continue;
      let have = false;
      for (const rt of F.plist) if (rt.pr === pr) have = true;
      if (!have) F.plist.push(this._evMakeProp(pr));
    }
  }

  _evUpdateProps(dt, F, fading) {
    const m = this.mayor, T = this.time, B = this.bursts, v = F.v;
    F.nBee = 0;
    for (let n = 0; n < F.plist.length; n++) {
      const rt = F.plist[n], pr = rt.pr;
      if (pr.done) {
        this._evDropProp(rt, true);
        F.plist.splice(n--, 1);
        continue;
      }
      rt.t += dt;
      const dmx = rt.pos.x - m.pos.x, dmz = rt.pos.z - m.pos.z;
      const md2 = dmx * dmx + dmz * dmz;
      switch (pr.k) {
        case 'star':
          if (rt.drop > 0) {
            rt.drop = Math.max(0, rt.drop - dt * 1.5);
            rt.pos.set(rt.bx - rt.drop * 3, rt.by + 0.2 + rt.drop * rt.drop * 8, rt.bz - rt.drop * 2);
            B.emit(rt.pos, { n: 2, color: '#fff2b0', speed: 0.15, up: 0.1, life: 0.5, gravity: 0, glow: 3 });
            if (rt.drop === 0) {
              B.emit(v.set(rt.bx, rt.by + 0.1, rt.bz), { n: 26, color: '#ffe08a', speed: 1.4, up: 1.6, life: 0.9, glow: 3 });
              this.audio.play('sparkle');
            }
          } else {
            rt.pos.set(rt.bx, rt.by + 0.22 + Math.sin(T * 2 + rt.phase) * 0.04, rt.bz);
            if (Math.random() < dt * 2.5) B.emit(v.copy(rt.pos), { n: 1, color: '#fff6c8', speed: 0.3, up: 0.4, life: 0.8, gravity: 0, glow: 3 });
          }
          rt.obj.rotation.y += dt * 1.4;
          break;
        case 'gold':
        case 'chest':
          rt.pos.y = rt.by + (pr.k === 'chest' ? Math.abs(Math.sin(T * 2)) * 0.03 : 0);
          if (Math.random() < dt * 2.5) B.emit(v.set(rt.pos.x, rt.pos.y + 0.3, rt.pos.z), { n: 1, color: '#ffe08a', speed: 0.3, up: 0.5, life: 0.8, gravity: 0, glow: 3 });
          rt.obj.rotation.y = 0.6;
          break;
        case 'dig':
          rt.obj.scale.setScalar(1 + Math.sin(T * 4) * 0.06);
          if (Math.random() < dt * 9) B.emit(v.set(rt.bx + (Math.random() - 0.5) * 0.2, rt.by + 0.1, rt.bz + (Math.random() - 0.5) * 0.2), { n: 1, color: '#ffd23d', speed: 0.04, up: 0.4, life: 1.8, gravity: -0.9, glow: 3 });
          break;
        case 'wisp':
          rt.pos.set(rt.bx + Math.sin(T * 0.6 + rt.phase) * 0.25, rt.by + 0.7 + Math.sin(T * 1.3 + rt.phase) * 0.12, rt.bz + Math.cos(T * 0.5 + rt.phase) * 0.25);
          if (Math.random() < dt * 5) B.emit(v.copy(rt.pos), { n: 1, color: '#c9a0ff', speed: 0.1, up: 0.1, life: 0.9, gravity: -0.2, glow: 2.5 });
          break;
        case 'bees':
          if (F.nBee < F.beeAt.length) F.beeAt[F.nBee++].set(rt.bx, rt.by, rt.bz);
          break;
        case 'dog': {
          rt.moveT -= dt;
          if (rt.moveT <= 0) {
            rt.moveT = 2.5 + Math.random() * 4;
            // the puppy waits for the Mayor once he gets close
            if (md2 > 6) {
              const t = this._nearbyFree([pr.i, pr.j], 1);
              if (t && !this.game.occ[idx(t[0], t[1])]) {
                pr.i = t[0];
                pr.j = t[1];
                this._evTile(rt);
              }
            }
            if (Math.random() < 0.5) this.audio.play('talk', { pitch: 1.9 });
          }
          const tx = rt.bx + 0.15, tz = rt.bz + 0.1;
          const dx = tx - rt.pos.x, dz = tz - rt.pos.z, d = Math.hypot(dx, dz);
          if (d > 2) rt.pos.set(tx, rt.by, tz);
          rt.pos.x += dx * Math.min(1, dt * 1.8);
          rt.pos.z += dz * Math.min(1, dt * 1.8);
          rt.pos.y = this.tileH(pr.i, pr.j) + (d > 0.03 ? Math.abs(Math.sin(T * 14)) * 0.04 : 0);
          if (d > 0.02) rt.obj.rotation.y = Math.atan2(-dz, dx);
          else if (md2 < 9) rt.obj.rotation.y = Math.atan2(dmz, -dmx); // look at the Mayor
          break;
        }
        case 'kid':
          rt.phase += dt * 2;
          rt.waveT -= dt;
          if (rt.waveT <= 0) rt.waveT = 3 + Math.random() * 4;
          rt.anim = rt.waveT < 1.2 ? 'wave' : 'idle';
          if (md2 < 12) {
            rt.yaw = Math.atan2(dmz, -dmx);
            rt.sfxT -= dt;
            if (rt.sfxT <= 0) {
              rt.sfxT = 3 + Math.random() * 4;
              this.audio.play('talk', { pitch: 1.7 });
            }
          }
          break;
      }
      if (rt.obj) rt.obj.position.copy(rt.pos);
      // the Mayor walks up to it
      if (!fading && rt.drop === 0 && md2 < 0.45) this.game.collectEventProp(pr.id);
    }
  }

  _evUpdateHost(dt, F, ev, fading) {
    if (!ev.host) return;
    let h = F.host;
    if (!h) {
      const k = ev.host.k;
      const slot = this.crowd.alloc(HOST_LOOK[k] || HOST_LOOK.bard);
      if (slot < 0) return;
      const tile = this._nearbyFree(tileAt(F.plaza.x, F.plaza.z), 1);
      const [x, z] = tileCenter(tile[0], tile[1]);
      h = F.host = { k, slot, pos: new THREE.Vector3(x, this.tileH(tile[0], tile[1]), z), yaw: -Math.PI / 4, anim: 'idle', phase: 0, path: null, pi: 0, seg: null, speed: 0.55, scale: k === 'royal' ? 1.12 : 1.02, long: k === 'royal', wait: 2, item: { type: 'tile', i: tile[0], j: tile[1], evTap: true } };
      this.bursts.emit(F.v.copy(h.pos).setY(h.pos.y + 0.4), { n: 20, color: k === 'royal' ? '#ffd23d' : '#7fe08a', speed: 1, up: 1.4, life: 0.9, glow: 2.5 });
    }
    if (h.path) this._move(h, dt);
    else {
      h.phase += dt * 2;
      if (h.k === 'bard') h.anim = 'talk';
      else {
        h.anim = 'wave';
        h.wait -= dt;
        if (h.wait <= 0) {
          h.wait = 5 + Math.random() * 4;
          const from = tileAt(h.pos.x, h.pos.z);
          const t = this._nearbyFree(tileAt(F.plaza.x, F.plaza.z), 3);
          const path = findPath(this.I, this._passable, from, t);
          if (path) {
            h.path = path;
            h.pi = 0;
            h.seg = null;
          }
        }
      }
    }
    const m = this.mayor;
    const dx = h.pos.x - m.pos.x, dz = h.pos.z - m.pos.z;
    if (!h.path && dx * dx + dz * dz < 9) this._face(h, m.pos);
    if (!fading && !ev.host.met && this.time - (this._evTapT ?? -1e9) < 40 && dx * dx + dz * dz < 0.8) this.game.meetHost();
  }

  /** Pose the event's people (host, hiding kids); called before the crowd is committed. */
  _poseEventCrowd(dt, raining) {
    const F = this.evfx;
    if (!F || !F.id) return;
    const f = F.pose;
    const h = F.host;
    if (h) {
      f.pos = h.pos;
      f.yaw = h.yaw;
      f.scale = h.scale;
      f.anim = h.anim;
      f.phase = h.phase;
      f.umbrella = raining;
      f.hat = true;
      f.long = h.long;
      this.crowd.pose(h.slot, f);
    }
    for (const rt of F.plist) {
      if (rt.slot < 0 || rt.pr.done) continue;
      f.pos = rt.pos;
      f.yaw = rt.yaw;
      f.scale = 0.62;
      f.anim = rt.anim;
      f.phase = rt.phase;
      f.umbrella = false;
      f.hat = !!rt.pr.look.hat;
      f.long = !!rt.pr.look.long;
      this.crowd.pose(rt.slot, f);
    }
  }

  /** Make event props and hosts tappable: a tap sends the Mayor to their tile. */
  _pickEventFx(tryChar) {
    const F = this.evfx;
    if (!F || !F.id) return;
    for (const rt of F.plist) if (!rt.pr.done) tryChar(rt.pos, rt.hy, rt.item);
    const h = F.host;
    if (h) {
      const [i, j] = tileAt(h.pos.x, h.pos.z);
      h.item.i = Math.min(N - 1, Math.max(0, i));
      h.item.j = Math.min(N - 1, Math.max(0, j));
      tryChar(h.pos, 0.3, h.item);
    }
  }

  // ---- sky billboards: the harvest moon and the rainbow

  _evSkyMesh(kind) {
    const F = this.evfx;
    if (F[kind]) return F[kind];
    let geo, frag;
    if (kind === 'moon') {
      geo = new THREE.PlaneGeometry(2, 2);
      frag = /* glsl */`
        uniform float uAmt;
        varying vec2 vUv;
        varying vec2 vP;
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float d = length(p);
          float disc = 1.0 - smoothstep(0.56, 0.6, d);
          float halo = (1.0 - smoothstep(0.58, 1.0, d)) * 0.3;
          float cr = smoothstep(0.17, 0.0, length(p - vec2(-0.17, 0.12))) * 0.16 + smoothstep(0.12, 0.0, length(p - vec2(0.2, -0.16))) * 0.14 + smoothstep(0.08, 0.0, length(p - vec2(0.06, 0.3))) * 0.12;
          vec3 c = mix(vec3(1.3, 0.34, 0.04), vec3(1.25, 0.62, 0.14), clamp(0.55 + p.y * 0.5, 0.0, 1.0)) * (1.0 - cr * 1.6);
          float a = max(disc * 0.95, halo) * uAmt;
          if (a < 0.01) discard;
          gl_FragColor = vec4(c * mix(0.9, 1.05, disc), a);
          gNormal = vec4(0.0);
        }`;
    } else {
      geo = new THREE.RingGeometry(0.84, 1, 64, 1, 0, Math.PI);
      frag = /* glsl */`
        uniform float uAmt;
        varying vec2 vUv;
        varying vec2 vP;
        vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void main() {
          float r = length(vP);
          float t = clamp((r - 0.84) / 0.16, 0.0, 1.0);
          vec3 c = hue((1.0 - t) * 0.78);
          float edge = smoothstep(0.0, 0.15, t) * smoothstep(1.0, 0.85, t);
          float ends = smoothstep(0.0, 0.4, vP.y / max(r, 0.001));
          float a = 0.36 * edge * ends * uAmt;
          if (a < 0.01) discard;
          gl_FragColor = vec4(c * 1.2, a);
          gNormal = vec4(0.0);
        }`;
    }
    const mat = fxMaterial({
      vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec2 vP;
        void main() { vUv = uv; vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: frag,
      uniforms: { uAmt: { value: 0 } },
      side: THREE.DoubleSide,
      // on a phone in portrait the island fills the view and hides the sky, so these sit on top
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    mesh.layers.set(3); // not in the water reflection
    this.root.add(mesh);
    F[kind] = mesh;
    return mesh;
  }

  /** Billboards that sit in the sky behind the island, facing the camera. */
  _evUpdateSky(F) {
    const vis = F.vis, env = this.env;
    if (!vis.moon && !vis.rainbow) return;
    const cam = this.engine.camera, tgt = this.engine.view.target;
    const R = _evR.setFromMatrixColumn(cam.matrixWorld, 0), U = _evU.setFromMatrixColumn(cam.matrixWorld, 1), Bk = _evB.setFromMatrixColumn(cam.matrixWorld, 2);
    const hh = cam.top, hw = cam.right;
    if (vis.moon) {
      const mesh = this._evSkyMesh('moon');
      const amt = F.k * smooth(0.35, 0.8, env.night) * (1 - env.cur.clouds * 0.8);
      mesh.visible = amt > 0.01;
      mesh.material.uniforms.uAmt.value = amt;
      mesh.position.copy(tgt).addScaledVector(R, hw * 0.45).addScaledVector(U, hh * 0.52).addScaledVector(Bk, -45);
      mesh.quaternion.copy(cam.quaternion);
      mesh.scale.setScalar(Math.min(hh, hw * 2) * 0.2);
    }
    if (vis.rainbow) {
      const mesh = this._evSkyMesh('rainbow');
      const amt = F.k * env.daylight * (1 - env.cur.rain);
      mesh.visible = amt > 0.01;
      mesh.material.uniforms.uAmt.value = amt;
      mesh.position.copy(tgt).addScaledVector(U, -hh * 0.05).addScaledVector(Bk, -40);
      mesh.quaternion.copy(cam.quaternion);
      mesh.scale.setScalar(Math.min(hh * 0.9, hw * 1.1));
    }
  }

  // ---- per frame

  _evTick(key, dt, secs) {
    const tm = this.evfx.tm;
    tm[key] = (tm[key] ?? Math.random() * secs) - dt;
    if (tm[key] > 0) return false;
    tm[key] = secs * (0.7 + Math.random() * 0.6);
    return true;
  }

  _evEmote(id, icon) {
    const rt = this.npcs.get(id);
    if (!rt || !rt.visible) return;
    if (rt.emote?.icon === icon) rt.emote.until = this.time + 1.2;
    else this.emote(rt, icon, 1.2);
  }

  _evConfetti(at, y = 0.8) {
    const B = this.bursts, v = this.evfx.v;
    v.set(at.x, at.y + y, at.z);
    B.emit(v, { n: 8, color: this._evPick(CONFETTI), speed: 1.1, up: 2.2, life: 1.3, gravity: 2.6 });
    B.emit(v, { n: 8, color: this._evPick(CONFETTI), speed: 1.1, up: 2.2, life: 1.3, gravity: 2.6 });
  }

  _evPeriodic(dt, F, ev) {
    const vis = F.vis, B = this.bursts, v = F.v, env = this.env, A = this.audio;
    if (vis.sfx && this._evTick('sfx', dt, vis.sfx[1])) A.play(vis.sfx[0], vis.sfx[2] || EV_NONE);
    if (vis.chord && this._evTick('chord', dt, vis.chord)) A.play('chord', { notes: this._evPick(CHORDS), dur: 3.5, gain: 0.03 });
    if (vis.music && F.host && this._evTick('music', dt, vis.music)) {
      const n = this._evPick(PENTA);
      A.play('chord', { notes: [n, n + (Math.random() < 0.5 ? 4 : 7)], dur: 1.5, gain: 0.04 });
      B.emit(v.copy(F.host.pos).setY(F.host.pos.y + 0.75), { n: 2, color: this._evPick(CONFETTI), speed: 0.25, up: 0.5, life: 1.4, gravity: -0.25, glow: 2 });
    }
    if (vis.confetti && this._evTick('confetti', dt, vis.confetti)) this._evConfetti(vis.confettiAt === 'homes' ? this._evPick(F.homes) : F.plaza, vis.confettiAt === 'homes' ? 1.2 : 0.8);
    if (vis.coins && this._evTick('coins', dt, vis.coins)) {
      const a = this._evPick(F.markets);
      B.emit(v.set(a.x + (Math.random() - 0.5), a.y + 0.9, a.z + (Math.random() - 0.5)), { n: 4, color: '#ffd23d', speed: 0.5, up: 1.2, life: 0.9, glow: 2.5 });
    }
    if (vis.party && ev.npc && this._evTick('party', dt, vis.party)) {
      const rt = this.npcs.get(ev.npc);
      if (rt?.visible) this._evConfetti(rt.pos, 0.7);
    }
    if (vis.fireworks && this._evTick('fw', dt, vis.fireworks)) {
      v.set(F.plaza.x + (Math.random() - 0.5) * 4, F.plaza.y + 4 + Math.random() * 1.5, F.plaza.z + (Math.random() - 0.5) * 4);
      B.emit(v, { n: 26, color: this._evPick(CONFETTI), speed: 2.2, up: 0.5, life: 1.3, gravity: 0.8, glow: 3 });
      B.emit(v, { n: 10, color: '#fff6c8', speed: 1.4, up: 0.4, life: 0.8, gravity: 0.8, glow: 3 });
      env.flash = Math.max(env.flash, 0.08 * env.night + 0.02);
      A.play('boom', { power: 0.18, delay: 0.25 });
    }
    if (vis.splash && F.water.length && this._evTick('splash', dt, vis.splash)) {
      const w = this._evPick(F.water);
      v.set(w.x + (Math.random() - 0.5) * 0.6, 0.05, w.z + (Math.random() - 0.5) * 0.6);
      B.emit(v, { n: 8, color: '#d8f4ff', speed: 0.6, up: 1.4, life: 0.6, gravity: 4 });
      if (Math.random() < 0.4) B.emit(v, { n: 1, color: '#ff9a4a', speed: 0.6, up: 2.6, life: 0.9, gravity: 5 }); // a fish jumps
      if (Math.random() < 0.3) A.play('splash');
    }
    if (vis.chimney && this._evTick('chimney', dt, vis.chimney)) {
      const h = this._evPick(F.homes);
      B.emit(v.set(h.x + 0.2, h.y + 1.2, h.z - 0.1), { n: 2, color: '#d8dde6', speed: 0.08, up: 0.3, life: 2.6, gravity: -0.35 });
    }
    if (vis.construction && F.sites.length && this._evTick('build', dt, vis.construction)) {
      const s = this._evPick(F.sites);
      B.emit(v.set(s.x + (Math.random() - 0.5) * 0.8, s.y + 0.3, s.z + (Math.random() - 0.5) * 0.8), { n: 5, color: '#ffe08a', speed: 0.8, up: 1.2, life: 0.5, glow: 2 });
      A.play(Math.random() < 0.5 ? 'place' : 'chop');
    }
    if (vis.flowers && this._evTick('flowers', dt, vis.flowers)) {
      if (vis.flowersAt === 'farms') {
        const f = this._evPick(F.farms);
        v.set(f.x + (Math.random() - 0.5) * 1.6, f.y + 0.25, f.z + (Math.random() - 0.5) * 1.6);
      } else {
        this._evLand(F.spot, 0.15);
        v.set(F.spot.ax, F.spot.ay, F.spot.az);
      }
      B.emit(v, { n: 5, color: this._evPick(vis.flowerCol || FLOWER_COL), speed: 0.45, up: 0.9, life: 1, gravity: 1.2, glow: 1.6 });
    }
    if (vis.sneeze && ev.sick?.length && this._evTick('sneeze', dt, vis.sneeze)) {
      const rt = this.npcs.get(this._evPick(ev.sick));
      if (rt?.visible) {
        B.emit(v.copy(rt.pos).setY(rt.pos.y + 0.55), { n: 6, color: '#bfe8a0', speed: 0.5, up: 0.3, life: 0.6, gravity: 0.4, push: { x: Math.cos(rt.yaw) * 0.8, z: -Math.sin(rt.yaw) * 0.8 } });
        A.play('pop');
      }
    }
    // bubbles over the villagers the event is about
    F.emT -= dt;
    if (F.emT <= 0) {
      F.emT = 0.7;
      if (ev.npc) this._evEmote(ev.npc, 'cake');
      if (ev.sick) for (const id of ev.sick) this._evEmote(id, 'sickness');
    }
  }

  _updateEventFx(dt) {
    const g = this.game;
    const F = this.evfx || this._evInit();
    const ev = g.eventHere();
    if (F.ev !== ev) {
      // let the old event fade out before the next one takes over
      if (F.id && F.k > 0) {
        F.k = Math.max(0, F.k - dt * 1.6);
        if (F.k > 0) {
          this._evFrame(dt, F, F.ev, true);
          return;
        }
      }
      if (F.id) this._evTeardown();
      if (ev) this._evSetup(ev);
    }
    if (!F.id) return;
    F.k = Math.min(1, F.k + dt * 0.7);
    this._evFrame(dt, F, ev, false);
  }

  _evFrame(dt, F, ev, fading) {
    const vis = F.vis, env = this.env, k = F.k;
    F.anchorT -= dt;
    if (F.anchorT <= 0) {
      F.anchorT = 5;
      this._evAnchors();
    }
    if (!fading) this._evSyncProps(F, ev);
    this._evUpdateProps(dt, F, fading);
    if (vis.beeFarms) {
      F.nBee = 0;
      for (const f of F.farms) if (F.nBee < F.beeAt.length) F.beeAt[F.nBee++].copy(f);
    }
    this._evUpdateHost(dt, F, ev, fading);
    this._evUpdateMotes(dt, F);
    this._evUpdateSky(F);
    if (vis.tint) {
      const f = k * (vis.tintNight ? env.night : 1), t = env.post.tint;
      t.r *= 1 + (vis.tint[0] - 1) * f;
      t.g *= 1 + (vis.tint[1] - 1) * f;
      t.b *= 1 + (vis.tint[2] - 1) * f;
    }
    if (vis.fog) env.post.fogColor.lerp(vis.fog, 0.7 * k);
    if (F.loops) for (const name in F.loops) this.audio.setLoop(name, F.loops[name] * k);
    if (!fading) this._evPeriodic(dt, F, ev);
  }

  // ---------------------------------------------------------------- per-frame

  update(dt, dtH) {
    this.time += dt;
    const g = this.game;
    this.walkScale = Math.min(3, g.s.settings.speed || 1);
    const env = this.env;

    // construction
    const buildSpeed = g.buildSpeed();
    for (const e of this.buildings.values()) {
      const r = e.rec;
      if (!r.built) {
        const dur = (2.5 + BUILDINGS[r.type].size * 2) / buildSpeed;
        r.progress = Math.min(1, (r.progress || 0) + dt / dur);
        const k = r.progress;
        const s = k < 1 ? Math.min(1, 1 - Math.pow(1 - k, 3) * 1.0) : 1;
        e.group.scale.set(1, Math.max(0.02, s), 1);
        if (Math.random() < dt * 8) this.bursts.emit(e.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.05, (Math.random() - 0.5) * 0.8)), { n: 2, color: '#c9b48a', speed: 0.5, up: 0.6, life: 0.6 });
        // the rising building wobbles a little as it goes up
        e.group.rotation.z = Math.sin(this.time * 9 + r.id) * 0.008 * (1 - k);
        this._updateSite(e, dt);
        if (r.progress >= 1) {
          e.group.scale.set(1, 1, 1);
          e.group.rotation.z = 0;
          g.finishConstruction(r);
          this.audio.play('place');
          this.bursts.emit(e.center.clone().add(new THREE.Vector3(0, 0.4, 0)), { n: 28, color: '#ffe08a', speed: 1.4, up: 2, life: 1, glow: 2.5 });
          // a ring of dust, a bounce and a thump
          this.bursts.emit(e.center.clone().add(new THREE.Vector3(0, 0.06, 0)), { n: 26, color: '#d8c9a6', speed: 1.8, up: 0.25, life: 0.6, gravity: 1.2, spread: 0.3 });
          this._releaseBuilders(e, true);
          this._dropScaffold(e);
          e.pop = 0;
          this.engine.shake?.(0.045);
          for (const sm of e.smoke) sm.material.uniforms.uOn.value = 0.9;
          this._lightTimer = 0;
          this.engine._forceShadow = true;
        }
      }
      if (e.pop !== undefined) {
        // squash and stretch when a building is finished or upgraded
        e.pop += dt;
        const t = e.pop, q = Math.exp(-5.5 * t) * Math.sin(t * 17);
        e.group.scale.set(1 - q * 0.07, 1 + q * 0.14, 1 - q * 0.07);
        if (t > 1.1) {
          e.group.scale.set(1, 1, 1);
          e.pop = undefined;
        }
      }
      for (const o of e.anim) {
        const u = o.userData;
        if (u.spin === 'z') o.rotation.z += dt * (1.2 + env.cur.wind * 3);
        if (u.spin === 'y') o.rotation.y += dt * 0.9;
        if (u.spin === 'saw') o.rotation.z -= dt * (this.presence.get(e.rec.id) || !e.rec.built ? 14 : 2);
        if (u.float) {
          o.position.y = u.y0 + Math.sin(this.time * 1.8 + u.ph) * 0.06;
          o.rotation.y += dt * 0.9;
        }
        if (u.flag) {
          o.rotation.y = Math.sin(this.time * 3.1 + u.ph) * 0.35 * (0.35 + env.cur.wind) + 0.3;
          o.scale.x = 1 + Math.sin(this.time * 7.3 + u.ph) * 0.07;
          o.scale.y = 1 - Math.abs(Math.sin(this.time * 2.1 + u.ph)) * 0.05;
        }
        if (u.swing) o.rotation.z = Math.sin(this.time * 2.3 + u.swing * 1.7) * 0.5;
        if (u.seesaw) o.rotation.z = Math.sin(this.time * 1.4 + u.ph) * 0.22;
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
    const quake = g.evFx().quake;
    this._cold = env.cur.snow > 0.3 || (this._sb[3] > 0.5 && SEASON_LOOK[this.biome]?.snow > 0) || g.evFx().burnWood;
    for (const rt of this.npcs.values()) {
      rt.think -= dt;
      if (rt.think <= 0) {
        rt.think = 0.8 + Math.random() * 0.6;
        this._think(rt);
      }
      rt.tool = false;
      if (rt.mode === 'walk') {
        const job = rt.goal?.kind === 'work' ? g.buildingById(rt.p.job) : null;
        const lh = ((g.s.time.hour - (rt.p.offs || 0)) % 24 + 24) % 24;
        rt.carry = !!job && CARRY_TO.has(job.type);
        rt.run = (raining && rt.noUmb && !rt.carry) || (!!job && lh > 8.3 && lh < 9.6) || !!quake;
        if (this._move(rt, dt)) this._arrive(rt, rt.goal, rt.goalTile);
        if (rt.mode === 'walk' || rt.anim === 'walk') rt.anim = rt.run ? 'run' : rt.carry ? 'carry' : 'walk';
      } else {
        rt.run = rt.carry = false;
        this._npcAnim(rt, dt, raining);
      }
      if (rt.mode === 'work' && rt.at) this.presence.set(rt.at, (this.presence.get(rt.at) || 0) + (g.traitOf(rt.p).work || 1));
      g.npcTick(rt.p, { sleeping: rt.mode === 'inside' && (g.s.time.hour >= 21 || g.s.time.hour < 7), leisure: rt.mode === 'leisure' || rt.mode === 'dance' || rt.mode === 'cheer', working: rt.mode === 'work', festival }, dtH);
      rt.visible = rt.mode !== 'inside';
      rt.umbrella = raining && rt.visible && rt.mode !== 'work' && !rt.noUmb && !rt.carry && !GATHER_ANIMS[rt.anim];
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
      this.crowd.pose(rt.slot, { pos: rt.pos, yaw: rt.yaw, scale: rt.scale, anim: rt.anim, phase: rt.phase, umbrella: rt.umbrella, hat: !!rt.p.look.hat, long: rt.p.look.long, tool: rt.tool });
    }
    // construction crews
    for (const e of this.buildings.values())
      for (const bd of e.builders || []) this.crowd.pose(bd.slot, { pos: bd.pos, yaw: bd.yaw, scale: bd.scale, anim: 'hammer', phase: bd.phase, hat: true, tool: true });
    const m = this.mayor;
    const gt = m.task?.kind === 'gather' ? m.task : null;
    const gathering = gt && m.anim === gt.st?.anim;
    this.crowd.pose(m.slot, { pos: m.pos, yaw: m.yaw, scale: m.scale, anim: m.anim, phase: m.phase, u: gt?.u, blend: gt?.blend, umbrella: raining && !gathering, hat: true, tool: true });
    if (this.visitor) this.crowd.pose(this.visitor.slot, { pos: this.visitor.pos, yaw: this.visitor.yaw, scale: 1.05, anim: this.visitor.anim, phase: this.visitor.phase, umbrella: raining, hat: true, long: true });
    this._poseEventCrowd(dt, raining);
    this.crowd.commit();

    this._updateNodeAnims(dt);
    this._updateProps(dt);
    this._updateEventFx(dt);
    this._updateWorkFx(dt);
    this._updateDying(dt);
    this._updateSeason();
    this._updateSpectacle(dt);
    this.ambient?.update(dt);
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

  // ---------------------------------------------------------------- villager animation variety

  /** Animation for a villager who is not walking: job actions, chats, fidgets, festival moves. */
  _npcAnim(rt, dt, raining) {
    const g = this.game, T = this.time;
    let anim = 'idle', rate = 2;
    if (rt.mode === 'work') {
      const job = g.buildingById(rt.p.job);
      const W = (job && WORK_ANIM[job.type]) || { anim: 'work' };
      rt.altT -= dt;
      if (rt.altT <= 0) {
        rt.altT = 5 + Math.random() * 9;
        rt.workAlt = W.alt && W.alt !== 'carryStand' && Math.random() < 0.3 ? 1 : 0;
      }
      anim = rt.workAlt ? W.alt : W.anim;
      const A = GATHER_ANIMS[anim];
      if (A) {
        rt.tool = true;
        rate = (TAU / A.T) * (0.85 + hash(rt.p.id, 5) * 0.3);
        const u0 = (rt.phase / TAU) % 1, u1 = ((rt.phase + dt * rate) / TAU) % 1;
        if (u1 < u0 ? A.hit >= u0 || A.hit < u1 : u0 < A.hit && u1 >= A.hit) this._workHit(rt, anim);
      }
      // a quick look up from the work now and then
      if (!A && Math.random() < dt * 0.05) rt.fid = { a: 'lookAround', until: T + 2.5 };
    } else if (rt.mode === 'dance' || rt.mode === 'cheer') {
      const base = rt.mode === 'cheer' ? 'wave' : rt.festPose || 'dance';
      const k = Math.floor(T / 4.5 + hash(rt.p.id, 2) * 7) % 5;
      anim = [base, base, 'cheer', 'clap', base === 'dance' ? 'dance' : 'cheer'][k];
    } else if (rt.mode === 'leisure' || rt.mode === 'idle') {
      if (rt.chat > T) {
        // one talks, the other laughs, then they swap
        anim = Math.floor(T * 0.6 + hash(rt.p.id, 3) * 3) % 3 === 0 ? 'laugh' : 'talk';
      } else {
        const spot = rt.mode === 'leisure' && rt.spot ? this.buildings.get(rt.spot)?.rec.type : null;
        if (spot === 'panggung') anim = Math.floor(T / 5 + hash(rt.p.id, 4) * 4) % 3 ? 'dance' : 'clap';
        else if (spot === 'taman_bermain') anim = Math.floor(T / 4 + hash(rt.p.id, 4) * 4) % 3 ? 'cheer' : 'laugh';
        else {
          rt.fidT -= dt;
          if (rt.fidT <= 0) {
            if (rt.fid) {
              rt.fid = null;
              rt.fidT = 3 + Math.random() * 7;
            } else {
              const h = g.s.time.hour;
              const pool = this._cold ? ['shiver', 'shiver', 'lookAround'] : h > 20.5 || h < 7 ? ['stretch', 'lookAround'] : ['lookAround', 'stretch', 'point', 'lookAround', 'clap'];
              rt.fid = { a: pool[Math.floor(Math.random() * pool.length)] };
              rt.fidT = 2.5 + Math.random() * 2.5;
            }
          }
          if (rt.fid) anim = rt.fid.a;
        }
      }
    }
    if (rt.fid?.until && rt.fid.until > T && rt.mode === 'work') anim = rt.fid.a;
    else if (rt.fid?.until && rt.fid.until <= T) rt.fid = null;
    if (rt.talkHold > T) anim = 'wave';
    if (anim === 'shiver' || anim === 'clap' || anim === 'laugh') rate = 2.2;
    rt.phase += dt * rate;
    rt.anim = anim;
  }

  /** A villager's tool lands: chips, sparks, dust, a splash for the fishers. */
  _workHit(rt, anim) {
    if (Math.random() > this.quality.ambient) return;
    const fx = Math.cos(rt.yaw), fz = -Math.sin(rt.yaw);
    if (anim === 'fish') {
      const x = rt.pos.x + fx * 0.85, z = rt.pos.z + fz * 0.85;
      this.bursts.emit(_tmpV.set(x, 0.03, z), { n: 5, color: '#e6f6ff', speed: 0.35, up: 0.8, life: 0.4, gravity: 4 });
      this.ambient?._ripple(x, z, 0.9);
      return;
    }
    const H = HIT_FX[anim];
    if (!H) return;
    const sc = rt.scale || 1;
    this.bursts.emit(_tmpV.set(rt.pos.x + fx * H[4] * sc, rt.pos.y + H[3], rt.pos.z + fz * H[4] * sc), { n: H[1], color: H[0], speed: 0.45, up: 0.7, life: 0.4, gravity: 3, glow: H[2] });
  }

  /** Busy buildings give off sparks, steam, sawdust, coins or music notes. */
  _updateWorkFx(dt) {
    const L = this.quality.ambient;
    if (L <= 0) return;
    const h = this.game.s.time.hour;
    for (const e of this.buildings.values()) {
      const W = WORK_FX[e.rec.type];
      if (!W || !e.rec.built || e.dyingSoon) continue;
      let workers = this.presence.get(e.rec.id) || 0;
      if (e.rec.type === 'panggung' && h >= 17 && h < 22) workers = Math.max(workers, 2);
      if (!workers || e.rec.stalled) continue;
      if (Math.random() > dt * W.rate * Math.min(2, workers) * 0.5 * L) continue;
      const ry = e.group.rotation.y, [lx, ly, lz] = W.p;
      _tmpV.set(e.center.x + lx * Math.cos(ry) + lz * Math.sin(ry), e.center.y + ly, e.center.z - lx * Math.sin(ry) + lz * Math.cos(ry));
      const o = e.rec.type === 'panggung' ? { ...W.o, color: NOTE_COL[Math.floor(Math.random() * NOTE_COL.length)] } : W.o;
      this.bursts.emit(_tmpV, o);
    }
  }

  /** Demolished buildings shudder, sink and crumble; dropped scaffolds fold away. */
  _updateDying(dt) {
    for (let n = this.dying.length - 1; n >= 0; n--) {
      const d = this.dying[n];
      d.t += dt;
      const g = d.group;
      if (d.scaffold) {
        const k = Math.min(1, d.t / 0.5);
        g.scale.set(1, Math.max(0.001, 1 - ease(k)), 1);
        if (k >= 1) {
          this.root.remove(g);
          disposeModel(g);
          this.dying.splice(n, 1);
        }
        continue;
      }
      const T1 = 0.75, k = Math.min(1, d.t / T1);
      g.position.y = d.y0 - ease(k) * 0.35 * (d.size || 1);
      g.rotation.x = Math.sin(d.t * 47) * 0.025 * (1 - k);
      g.rotation.z = Math.sin(d.t * 39 + 1) * 0.025 * (1 - k);
      g.scale.set(1 + k * 0.05, Math.max(0.001, 1 - k * k), 1 + k * 0.05);
      if (Math.random() < dt * 22) this.bursts.emit(_tmpV.set(d.center.x + (Math.random() - 0.5) * (d.size || 1), d.center.y + 0.1 + Math.random() * 0.3, d.center.z + (Math.random() - 0.5) * (d.size || 1)), { n: 3, color: Math.random() < 0.5 ? '#c9b48a' : '#a8a29a', speed: 0.7, up: 1, life: 0.7 });
      if (k >= 1) {
        this.root.remove(g);
        disposeModel(g);
        this.dying.splice(n, 1);
        this.engine._forceShadow = true;
      }
    }
  }

  /** Season colours for the foliage shader and snow that stays on the ground in winter. */
  _updateSeason() {
    const g = this.game, sb = g.seasonBlend(this._sb);
    shared.uSeason.value.set(sb[0], sb[1], sb[2], sb[3]);
    const look = SEASON_LOOK[this.biome] || { amt: 1, snow: 0 };
    shared.uSeasonAmt.value = this.suspendSeason ? 0 : look.amt;
    this.env.snowFloor = this.suspendSeason ? 0 : sb[3] * look.snow * smooth(0.2, 1, sb[3]);
  }

  /** Big moments: a solar eclipse darkens the sky, tremors shake the island. */
  _updateSpectacle(dt) {
    const g = this.game, fx = g.evFx(), env = this.env;
    // eclipse
    this._ecl += ((fx.eclipse ? 1 : 0) - this._ecl) * Math.min(1, dt * 0.5);
    if (this._ecl > 0.005 && !this.suspendSeason) {
      const k = this._ecl, P = env.post;
      P.skyTop.lerp(_eclTop, k * 0.9);
      P.skyBottom.lerp(_eclBot, k * 0.85);
      P.stars = Math.max(P.stars, k * 0.85);
      P.tint.lerp(_eclTint, k * 0.6);
      env.key.intensity *= 1 - 0.85 * k;
      env.hemi.intensity *= 1 - 0.45 * k;
      env.lampsOverride = k > 0.35 ? 1 : null;
      this._eclOn = true;
    } else if (this._eclOn) {
      env.lampsOverride = null;
      this._eclOn = false;
    }
    // tremors
    if (fx.quake) {
      this._quakeT -= dt;
      if (this._quakeT <= 0) {
        this._quakeT = 3 + Math.random() * 4;
        this.engine.shake?.(0.16);
        this.audio.play('rumble');
        let n = 0;
        for (const e of this.buildings.values()) {
          if (n++ > 6) break;
          if (Math.random() < 0.5) this.bursts.emit(_tmpV.copy(e.center).setY(e.center.y + 0.2), { n: 8, color: '#b8ab98', speed: 0.9, up: 0.8, life: 0.8, spread: 0.6 });
          e.pop = 0.35;
        }
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
    this._pickEventFx(tryChar);
    tryChar(this.mayor.pos, 0.32, { type: 'mayor' });
    if (best?.evTap) this._evTapT = this.time;
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

// ---------------------------------------------------------------- event visuals: data

const M_LANTERN = 1, M_HANG = 2, M_FLY = 3, M_BFLY = 4, M_WISP = 5, M_PETAL = 6, M_SAND = 7, M_HEAT = 8, M_EMBER = 9, M_BEE = 10, M_STREAK = 11;
const EV_MAX_MOTES = 120;
const EV_NONE = Object.freeze({});
const _evR = new THREE.Vector3(), _evU = new THREE.Vector3(), _evB = new THREE.Vector3();
const rgb = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
const HANG_COL = ['#ff5a4a', '#ffb347', '#ffd23d', '#ff7ab8'].map(rgb);
const BFLY_COL = ['#ff9a3a', '#5ab8ff', '#ffe04a', '#ffffff', '#ff7ad8', '#9a7aff'].map(rgb);
const PETAL_COL = ['#ffb8e0', '#ffffff', '#ff8ad8', '#ffe0f0', '#d9b8ff'].map(rgb);
const SAND_COL = ['#d8b070', '#c89858', '#e8c890'].map(rgb);
const CONFETTI = ['#ff5d9e', '#ffd23d', '#7fe08a', '#86b8e8', '#c9a0ff', '#ff8a4a'];
const FLOWER_COL = ['#ff8ad8', '#ffd23d', '#ffffff', '#b58cff', '#ff6a6a'];
const PROP_COLOR = { star: '#fff1a0', gold: '#ffd23d', dog: '#ffffff', kid: '#ff8ad8', chest: '#ffe08a', dig: '#ffd23d', bees: '#ffd23d', wisp: '#c9a0ff' };
const PENTA = [60, 62, 64, 67, 69, 72, 74, 76];
const CHORDS = [[60, 64, 67, 72], [57, 60, 64, 69], [55, 59, 62, 67], [53, 57, 60, 65]];
const HOST_LOOK = {
  bard: { skin: '#f1c7a3', coat: '#3d8a5a', pants: '#5a3a22', hair: '#c9853a', hat: '#b8483a', umbrella: '#3d8a5a', long: false },
  royal: { skin: '#f1d0b0', coat: '#a8243a', pants: '#f2e2bf', hair: '#e8d4a0', hat: '#ffd23d', umbrella: '#a8243a', long: true },
};

// Per event: motes [[type, count]], sky billboards (moon, rainbow), aurora, env tint [r,g,b]
// (tintNight: only at night), fog colour, ambience loops, a periodic one-shot sfx [name, secs, opts]
// and periodic effects (seconds between them): chord, music, confetti, coins, party, fireworks,
// splash, chimney, construction, flowers, sneeze.
const EV_VIS = {
  caravan: { coins: 1.2 },
  harvest: { flowers: 0.5, flowersAt: 'farms', flowerCol: ['#e94f4f', '#ffd23d', '#7fe08a', '#ff9a3a'] },
  festival: { motes: [[M_HANG, 18]], confetti: 1.4, sfx: ['bell', 9, { pitch: 1.2 }] },
  inspire: { confetti: 3.5 },
  pest: { motes: [[M_BEE, 24]], beeFarms: true, loops: { buzz: 0.25 } },
  meteor: { motes: [[M_STREAK, 18]] },
  nightmarket: { motes: [[M_HANG, 28]], coins: 1.5, sfx: ['bell', 10, { pitch: 0.8 }] },
  lantern: { motes: [[M_LANTERN, 44]], sfx: ['bell', 8, { pitch: 0.6 }], chord: 11 },
  bard: { music: 2.2 },
  birthday: { party: 1.8 },
  taxholiday: { confetti: 1.6, confettiAt: 'homes' },
  royal: { fireworks: 2.8, sfx: ['horn', 16, { pitch: 1.3, dur: 1.2 }] },
  fishing: { splash: 0.55, sfx: ['gull', 6] },
  boom: { construction: 0.45 },
  starfall: { motes: [[M_STREAK, 30]] },
  rainbow: { rainbow: true },
  mystery: {},
  treasure: {},
  puppy: {},
  hideseek: {},
  spooky: { motes: [[M_WISP, 26]], tint: [0.86, 0.8, 1.12], fog: new THREE.Color('#5a3a8a'), sfx: ['owl', 8], loops: { hum: 0.45 } },
  bees: { motes: [[M_BEE, 36]], loops: { buzz: 0.5 } },
  flu: { sneeze: 2.6 },
  heatwave: { motes: [[M_HEAT, 40]], tint: [1.07, 1.0, 0.88], loops: { cicadas: 0.7 } },
  coldsnap: { chimney: 0.7, tint: [0.92, 0.97, 1.08], loops: { howl: 0.35, fire: 0.15 } },
  sandstorm: { motes: [[M_SAND, 110]], tint: [1.1, 0.94, 0.74], fog: new THREE.Color('#d8a868'), loops: { howl: 0.55 } },
  harvestmoon: { moon: true, motes: [[M_EMBER, 28]], tint: [1.06, 0.96, 0.86], tintNight: true },
  fireflies: { motes: [[M_FLY, 90]], sfx: ['owl', 15] },
  butterflies: { motes: [[M_BFLY, 50]] },
  aurora: { aurora: true, motes: [[M_FLY, 24]], loops: { hum: 0.3 }, chord: 14 },
  bloom: { motes: [[M_PETAL, 60]], flowers: 0.35 },
  // v1.1
  springfair: { motes: [[M_PETAL, 40], [M_HANG, 14]], confetti: 1.8, flowers: 0.6, sfx: ['bell', 11, { pitch: 1.3 }] },
  harvestfest: { motes: [[M_EMBER, 22], [M_HANG, 16]], flowers: 0.5, flowersAt: 'farms', flowerCol: ['#e8823a', '#ffd23d', '#e94f4f', '#c86a2a'], confetti: 2.6, tint: [1.05, 0.98, 0.9] },
  snowfest: { motes: [[M_HANG, 20]], confetti: 2.2, chimney: 0.9, loops: { fire: 0.12 } },
  drought: { motes: [[M_HEAT, 40]], tint: [1.08, 1.0, 0.86], loops: { cicadas: 0.6 } },
  eclipse: { motes: [[M_FLY, 30]], loops: { hum: 0.35 }, chord: 9 },
  migration: { sfx: ['gull', 5] },
  earthquake: { loops: { howl: 0.15 } },
  tourists: { coins: 1.1, confetti: 4, confettiAt: 'homes' },
};
