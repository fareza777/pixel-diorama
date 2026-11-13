// Fog of war (v1.3). Game side (FogMixin, mixed into Game): which tiles are explored, revealing land
// around the Mayor, buildings and Scout Towers, and small discovery rewards. World side (FogLayer):
// a soft sea of instanced cloud puffs over unexplored tiles that shrink away as the land is revealed.
import * as THREE from 'three';
import { shared } from '../engine/materials.js';
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
  /** A building site and a finished Scout Tower clear the clouds around them. */
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

// ---------------------------------------------------------------- clouds (world side)

const PUFFS = 1; // per tile (big, overlapping puffs read as one soft cloud bank)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const hash = (k, n) => {
  const x = Math.sin(k * 127.1 + n * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Cheap, opaque cloud shading: white tops, soft blue-grey undersides, dimmed and cooled at night.
 * No lights or shadows (the cloud bank covers a lot of screen, so the fragment cost matters on phones).
 */
function cloudMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uDaylight: shared.uDaylight, uDark: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec3 color;
      varying vec3 vC;
      varying float vUp;
      void main() {
        vC = color;
        vUp = normalize(mat3(modelMatrix * instanceMatrix) * normal).y;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: 'layout(location = 1) out highp vec4 gNormal;\n' + /* glsl */`
      uniform float uDaylight;
      uniform float uDark;
      varying vec3 vC;
      varying float vUp;
      void main() {
        float shade = 0.72 + 0.28 * smoothstep(-0.4, 0.8, vUp);
        vec3 day = vC * shade * 1.05;
        vec3 night = vC * shade * vec3(0.16, 0.19, 0.3);
        vec3 c = mix(night, day, uDaylight);
        // 'Dark' fog style: a deep blue-black veil with a faint lighter top
        vec3 dark = vec3(0.045, 0.05, 0.085) + vec3(0.03, 0.035, 0.06) * smoothstep(0.2, 1.0, vUp);
        gl_FragColor = vec4(mix(c, dark, uDark), 1.0);
        gNormal = vec4(0.0);
      }`,
  });
}

/** A low-poly puff, white on top and soft blue-grey underneath (vertex colours). */
function puffGeometry() {
  const g = new THREE.IcosahedronGeometry(0.5, 0); // 20 triangles, smooth normals keep it round
  const pos = g.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3);
  const top = new THREE.Color('#ffffff'), bot = new THREE.Color('#c9d2ec'), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    pos.setY(i, y * 0.72);
    c.copy(bot).lerp(top, Math.min(1, Math.max(0, y + 0.5)));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export class FogLayer {
  constructor(world) {
    this.world = world;
    const I = world.I;
    // only fogged tiles take instance slots (compacted as land is revealed), so the GPU never draws hidden puffs
    this.tiles = [];
    this.slot = new Map(); // tile key -> index in this.tiles
    if (I.seen) for (let k = 0; k < N * N; k++) if (!I.seen[k]) {
      this.slot.set(k, this.tiles.length);
      this.tiles.push(k);
    }
    this.mesh = new THREE.InstancedMesh(puffGeometry(), cloudMaterial(), Math.max(1, this.tiles.length * PUFFS));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.fading = new Map(); // tile key -> time left
    this.tiles.forEach((k, n) => this._write(n, k, 1));
    this.mesh.count = this.tiles.length * PUFFS;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  _write(slot, k, f) {
    const i = Math.floor(k / N), j = k % N;
    const [x, z] = tileCenter(i, j);
    const h = Math.max(0.25, this.world.tileH(i, j));
    for (let n = 0; n < PUFFS; n++) {
      const s = (1.35 + hash(k, n) * 0.5) * (0.25 + 0.75 * f);
      const y = h + 0.35 + hash(k, n + 7) * 0.35 + (1 - f) * 0.6;
      _m.compose(_p.set(x + (hash(k, n + 3) - 0.5) * 0.55, y, z + (hash(k, n + 5) - 0.5) * 0.55), _q, _s.set(s, s, s));
      this.mesh.setMatrixAt(slot * PUFFS + n, f > 0.001 ? _m : ZERO);
    }
  }

  /** Remove a tile's slot by moving the last tile into it. */
  _drop(k) {
    const at = this.slot.get(k);
    if (at === undefined) return;
    const last = this.tiles.pop();
    this.slot.delete(k);
    if (last !== k) {
      this.tiles[at] = last;
      this.slot.set(last, at);
      this._write(at, last, this.fading.has(last) ? this.fading.get(last) / 0.7 : 1);
    }
    this.mesh.count = this.tiles.length * PUFFS;
  }

  /** Newly explored tiles: their clouds shrink and lift away. */
  reveal(keys) {
    for (const k of keys) if (this.slot.has(k)) this.fading.set(k, 0.7);
  }

  update(dt) {
    this.mesh.material.uniforms.uDark.value = this.world.game.s.settings.fog === 'dark' ? 1 : 0;
    if (!this.fading.size) return;
    for (const [k, t] of this.fading) {
      const left = t - dt;
      if (left <= 0) {
        this.fading.delete(k);
        this._drop(k);
      } else {
        this.fading.set(k, left);
        this._write(this.slot.get(k), k, left / 0.7);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
