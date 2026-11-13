// Fog of war (v1.3). Game side (FogMixin, mixed into Game): which tiles are explored, revealing land
// around the Mayor, buildings and Scout Towers, and small discovery rewards. World side (FogLayer):
// a thin drifting mist over unexplored land that clears as the land is revealed.
import * as THREE from 'three';
import { shared, fxMaterial } from '../engine/materials.js';
import { BUILDINGS } from './data.js';
import { N, idx, inside, tileCenter, revealArea } from './island.js';

export const MAYOR_SIGHT = 2.6; // tiles revealed around the walking Mayor
export const BUILD_SIGHT = 2.5; // around a new building site (plus half its size)
const DISCOVERY_EVERY = 36; // newly explored tiles per discovery gift
const GIFTS = [{ wood: 12 }, { stone: 10 }, { food: 12 }, { coins: 60 }, { wood: 8, stone: 6 }];

export const FogMixin = {
  isSeen(i, j, I = this.I) {
    return !I.seen || !!I.seen[idx(i, j)];
  },
  /** Share of the island's tiles that are explored (0..1). */
  exploredShare(I = this.I) {
    if (!I.seen) return 1;
    return I.seen.reduce((a, v) => a + v, 0) / (N * N);
  },
  /** Reveal land around (ci, cj); emits 'fog:reveal' with the new keys and gives discovery gifts. */
  reveal(ci, cj, r, I = this.I) {
    if (!I.seen) return [];
    const keys = revealArea(I, ci, cj, r);
    if (!keys.length) return keys;
    if (I === this.I) this.emit('fog:reveal', keys);
    this.s.stats.explored = (this.s.stats.explored || 0) + keys.length;
    I.discover = (I.discover || 0) + keys.length;
    while (I.discover >= DISCOVERY_EVERY) {
      I.discover -= DISCOVERY_EVERY;
      this._discovery(I, keys);
    }
    return keys;
  },
  _discovery(I, keys) {
    this.addXp(12);
    // now and then an old chest is waiting in the new land; otherwise a small find
    const free = keys.filter((k) => this._freeForProp(I, k));
    if (!I.chest && free.length && Math.random() < 0.35) {
      const k = free[Math.floor(Math.random() * free.length)];
      I.chest = { i: Math.floor(k / N), j: k % N };
      this.emit('discover', { chest: true });
      return;
    }
    const got = this.give(GIFTS[Math.floor(Math.random() * GIFTS.length)]);
    this.emit('discover', { got });
  },
  _freeForProp(I, k) {
    const t = I.t[k];
    return t !== 'w' && t !== 'r' && !I.nodes[k] && !this.occ?.[k];
  },
  /** A building site and a finished Scout Tower clear the mist around them. */
  revealForBuilding(rec, done = false) {
    const def = BUILDINGS[rec.type], s = def.size || 1;
    const r = (done && def.scout) || BUILD_SIGHT + s / 2;
    this.reveal(rec.i + s / 2, rec.j + s / 2, r);
  },
  /** True when every tile of a footprint is explored. */
  footprintSeen(i, j, s, I = this.I) {
    if (!I.seen) return true;
    for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) if (inside(i + a, j + b) && !I.seen[idx(i + a, j + b)]) return false;
    return true;
  },
};

// ---------------------------------------------------------------- thin mist (world side)

const RES2 = 2; // fog texture cells per tile (the field is blurred, so edges stay soft)
const FADE = 1.1; // seconds for revealed land to clear
const LAYERS = [
  { lift: 0.12, alpha: 0.34, scale: 4.2, speed: 0.05 },
  { lift: 0.55, alpha: 0.2, scale: 2.6, speed: -0.035 },
];

const MIST_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const MIST_FRAG = /* glsl */`
  uniform sampler2D uFog;
  uniform float uTime;
  uniform float uDaylight;
  uniform float uAlpha;
  uniform float uScale;
  uniform float uSpeed;
  varying vec2 vUv;
  varying vec3 vW;
  float h2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float n2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float f = texture(uFog, vUv).r;
    if (f < 0.01) discard;
    // slow drifting wisps: two octaves of noise moving in different directions
    vec2 p = vW.xz / uScale;
    float wisp = n2(p + vec2(uTime * uSpeed, uTime * uSpeed * 0.6)) * 0.65 + n2(p * 2.3 - vec2(uTime * uSpeed * 1.7, 0.0)) * 0.35;
    float a = f * uAlpha * smoothstep(0.15, 0.85, wisp) * 1.6;
    vec3 day = vec3(0.86, 0.9, 0.98);
    vec3 night = vec3(0.16, 0.19, 0.3);
    gl_FragColor = vec4(mix(night, day, uDaylight), clamp(a, 0.0, 0.62));
    gNormal = vec4(0.0);
  }`;

/**
 * Thin, drifting mist over unexplored land (v1.3): two translucent layers that follow the ground,
 * driven by a small blurred fog texture, so the edge of the known world is soft and the land beneath
 * still shows through. Revealed land clears with a short fade.
 */
export class FogLayer {
  constructor(world) {
    this.world = world;
    const I = world.I;
    const R = N * RES2;
    this.R = R;
    this.amount = new Float32Array(N * N); // per tile, 1 = fogged
    if (I.seen) for (let k = 0; k < N * N; k++) this.amount[k] = I.seen[k] ? 0 : 1;
    this.data = new Uint8Array(R * R * 4);
    this.tex = new THREE.DataTexture(this.data, R, R, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.fading = new Map(); // tile key -> time left
    this._bake();
    this.mesh = new THREE.Group();
    this.mats = [];
    for (const L of LAYERS) {
      const mat = fxMaterial({
        vertexShader: MIST_VERT,
        fragmentShader: MIST_FRAG,
        uniforms: { uFog: { value: this.tex }, uTime: shared.uTime, uDaylight: shared.uDaylight, uAlpha: { value: L.alpha }, uScale: { value: L.scale }, uSpeed: { value: L.speed } },
      });
      const m = new THREE.Mesh(this._sheet(L.lift), mat);
      m.renderOrder = 5;
      m.frustumCulled = false;
      this.mesh.add(m);
      this.mats.push(mat);
    }
    this.mesh.visible = this.amount.some((v) => v > 0);
  }

  /** A grid over the island that hugs the terrain (each vertex sits above the highest nearby tile). */
  _sheet(lift) {
    const g = new THREE.PlaneGeometry(N, N, N, N);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), z = pos.getZ(v);
      const ci = Math.round(x + N / 2), cj = Math.round(z + N / 2);
      let h = 0;
      for (let a = -1; a <= 0; a++) for (let b = -1; b <= 0; b++) {
        const i = Math.min(N - 1, Math.max(0, ci + a)), j = Math.min(N - 1, Math.max(0, cj + b));
        h = Math.max(h, this.world.tileH(i, j));
      }
      pos.setY(v, Math.max(0.05, h) + lift);
      // texture rows follow tile i (x), columns tile j (z)
      uv.setXY(v, (z + N / 2) / N, (x + N / 2) / N);
    }
    g.computeVertexNormals();
    return g;
  }

  /** Write the per-tile amounts into the texture with a soft 3x3 blur at double resolution. */
  _bake() {
    const R = this.R, A = this.amount, d = this.data;
    const at = (i, j) => A[Math.min(N - 1, Math.max(0, i)) * N + Math.min(N - 1, Math.max(0, j))];
    for (let y = 0; y < R; y++)
      for (let x = 0; x < R; x++) {
        const fi = (y + 0.5) / RES2 - 0.5, fj = (x + 0.5) / RES2 - 0.5;
        const i0 = Math.floor(fi), j0 = Math.floor(fj), ti = fi - i0, tj = fj - j0;
        let v = 0, w = 0;
        for (let a = -1; a <= 2; a++) for (let b = -1; b <= 2; b++) {
          const wt = Math.max(0, 1.5 - Math.hypot(a - ti, b - tj));
          v += at(i0 + a, j0 + b) * wt;
          w += wt;
        }
        const o = (y * R + x) * 4;
        d[o] = Math.round((v / w) * 255);
        d[o + 3] = 255;
      }
    this.tex.needsUpdate = true;
  }

  /** Newly explored tiles: their mist thins out and clears. */
  reveal(keys) {
    for (const k of keys) if (this.amount[k] > 0) this.fading.set(k, FADE);
  }

  update(dt) {
    if (!this.fading.size) return;
    for (const [k, t] of this.fading) {
      const left = t - dt;
      this.amount[k] = Math.max(0, left / FADE);
      if (left <= 0) this.fading.delete(k);
      else this.fading.set(k, left);
    }
    this._bakeT = (this._bakeT || 0) - dt;
    if (this._bakeT <= 0 || !this.fading.size) {
      this._bakeT = 0.08;
      this._bake();
    }
    if (!this.fading.size) this.mesh.visible = this.amount.some((v) => v > 0);
  }

  dispose() {
    for (const m of this.mesh.children) m.geometry.dispose();
    for (const mat of this.mats) mat.dispose();
    this.tex.dispose();
  }
}
