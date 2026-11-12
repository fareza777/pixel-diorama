// Ambient life on the active island: birds that circle, land and peck (bats after dark), fish that
// jump with splashes and ripples, a duck family on the pond, chickens around farms and coops,
// butterflies over the meadows, falling leaves or petals by season and pollen drifting in the sun.
// Everything is instanced (about a dozen draw calls in total) and nothing allocates per frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, fxMaterial, shared } from '../engine/materials.js';
import { N, idx, inside, tileCenter, tileAt } from './island.js';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4(), _l = new THREE.Matrix4(), _bm = new THREE.Matrix4(), _wm = new THREE.Matrix4(), _fold = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YZX');
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
};

/** A box with vertex colour, positioned in the critter's local space (facing +x). */
function cbox(w, h, d, color, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const merged = (...g) => mergeGeometries(g, false);

class Pool {
  constructor(geo, mat, n, cast = false) {
    const m = (this.mesh = new THREE.InstancedMesh(geo, mat, n));
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = cast;
    m.receiveShadow = false;
    for (let i = 0; i < n; i++) {
      m.setMatrixAt(i, ZERO);
      m.setColorAt(i, _c.set('#ffffff'));
    }
    this.n = n;
  }
  color(i, hex) {
    this.mesh.setColorAt(i, _c.set(hex));
    this.mesh.instanceColor.needsUpdate = true;
  }
  set(i, m) {
    this.mesh.setMatrixAt(i, m);
  }
  hide(i) {
    this.mesh.setMatrixAt(i, ZERO);
  }
  commit() {
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Matrix for a critter at p facing yaw (figure faces +x), pitched nose up by `pitch`, rolled by `roll`. */
function frame(out, x, y, z, yaw, pitch = 0, roll = 0, s = 1) {
  _e.set(roll, yaw, pitch, 'YZX');
  _q.setFromEuler(_e);
  return out.compose(_p.set(x, y, z), _q, _s.set(s, s, s));
}
/** out = base * (translate(x, y, z) * rotX(rx)) */
function child(out, base, x, y, z, rx = 0, rz = 0) {
  _e.set(rx, 0, rz, 'XYZ');
  _q.setFromEuler(_e);
  _l.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
  return out.multiplyMatrices(base, _l);
}

const BIRD_COL = {
  desa: ['#8a6a4a', '#6a5040', '#f2efe8'], hutan: ['#4a3a2a', '#c94a3d', '#6a5a40'], pantai: ['#f4f6fb', '#e8ecf2', '#d8dde6'],
  gunung: ['#3a3d48', '#5a5e68', '#e8ecf2'], gurun: ['#6a4a3a', '#2a2a30', '#b8703a'], kota: ['#8d919c', '#6a6e78', '#4a4d57'],
  fantasi: ['#ff8af0', '#7df9ff', '#ffd23d'],
};
const FLY_COL = ['#ff9a3a', '#5ab8ff', '#ffe04a', '#ffffff', '#ff7ad8', '#9a7aff'];
const FISH_COL = { fantasi: '#ff8af0', kota: '#c9d2dc', gunung: '#c9d2dc' };
const POLLEN_VERT = /* glsl */`
uniform float uTime;
uniform float uAmount;
attribute vec4 aSeed;
varying float vA;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.21 + aSeed.x * 30.0) * 0.5 + sin(uTime * 0.53 + aSeed.y * 9.0) * 0.12;
  p.y += sin(uTime * 0.33 + aSeed.z * 25.0) * 0.22;
  p.z += cos(uTime * 0.19 + aSeed.y * 30.0) * 0.5;
  float tw = 0.5 + 0.5 * sin(uTime * (0.8 + aSeed.w * 1.5) + aSeed.x * 40.0);
  vA = step(aSeed.w, uAmount) * tw;
  gl_PointSize = 1.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const POLLEN_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vA;
void main() {
  if (vA < 0.15) discard;
  gl_FragColor = vec4(uColor, vA * 0.75);
  gNormal = vec4(0.0);
}`;
const RING_VERT = /* glsl */`
varying float vA;
void main() {
  vec4 p = vec4(position, 1.0);
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
#endif
#ifdef USE_INSTANCING_COLOR
  vA = instanceColor.r;
#else
  vA = 1.0;
#endif
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * p;
}`;
const RING_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vA;
void main() {
  if (vA < 0.02) discard;
  gl_FragColor = vec4(uColor, vA);
  gNormal = vec4(0.0);
}`;

export class Ambient {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.level = 1;
    this.t = 0;
    this._v = new THREE.Vector3();
    this.mat = toon('#ffffff', { vertexColors: true, noise: 0.03, snow: 0.2, wet: 0.2 });
    // ---- birds (bats at night): body with beak, two wings
    this.birdBody = new Pool(merged(cbox(0.12, 0.045, 0.05, '#ffffff'), cbox(0.045, 0.04, 0.04, '#ffffff', 0.07, 0.015, 0), cbox(0.03, 0.012, 0.016, '#f0a030', 0.105, 0.012, 0), cbox(0.05, 0.01, 0.05, '#ffffff', -0.075, 0.008, 0)), this.mat, 30, true);
    this.birdWL = new Pool(cbox(0.06, 0.008, 0.13, '#ffffff', 0, 0, 0.065), this.mat, 30);
    this.birdWR = new Pool(cbox(0.06, 0.008, 0.13, '#ffffff', 0, 0, -0.065), this.mat, 30);
    // ---- fish
    this.fish = new Pool(merged(cbox(0.12, 0.05, 0.03, '#ffffff'), cbox(0.04, 0.06, 0.012, '#ffffff', -0.075, 0, 0)), this.mat, 3);
    // ---- ducks (mother + ducklings): body, head, beak painted per vertex, tinted per instance
    this.duck = new Pool(merged(cbox(0.15, 0.07, 0.09, '#f4f1ea', 0, 0.035, 0), cbox(0.04, 0.03, 0.06, '#f4f1ea', -0.085, 0.06, 0), cbox(0.055, 0.06, 0.05, '#3d8a5a', 0.07, 0.1, 0), cbox(0.035, 0.014, 0.03, '#f0a030', 0.11, 0.095, 0)), this.mat, 4, true);
    // ---- chickens
    this.hen = new Pool(merged(cbox(0.1, 0.075, 0.07, '#f4f1ea', 0, 0.07, 0), cbox(0.04, 0.05, 0.05, '#f4f1ea', -0.06, 0.1, 0), cbox(0.045, 0.05, 0.045, '#f4f1ea', 0.055, 0.125, 0), cbox(0.02, 0.025, 0.012, '#d8323a', 0.06, 0.16, 0), cbox(0.022, 0.012, 0.02, '#f0a030', 0.085, 0.12, 0), cbox(0.012, 0.04, 0.012, '#f0a030', 0, 0.02, 0.02), cbox(0.012, 0.04, 0.012, '#f0a030', 0, 0.02, -0.02)), this.mat, 9, true);
    // ---- butterflies
    this.flyL = new Pool(cbox(0.05, 0.004, 0.05, '#ffffff', 0, 0, 0.026), this.mat, 12);
    this.flyR = new Pool(cbox(0.05, 0.004, 0.05, '#ffffff', 0, 0, -0.026), this.mat, 12);
    // ---- ripples on the water
    const ring = new THREE.RingGeometry(0.05, 0.075, 18);
    ring.rotateX(-Math.PI / 2);
    this.ringMat = fxMaterial({ vertexShader: RING_VERT, fragmentShader: RING_FRAG, uniforms: { uColor: { value: new THREE.Color('#e6f6ff') } } });
    this.rings = new Pool(ring, this.ringMat, 10);
    this.rings.mesh.renderOrder = 4;
    for (let i = 0; i < 10; i++) this.rings.color(i, '#000000');
    this.ringState = Array.from({ length: 10 }, () => ({ t: 9, x: 0, z: 0, s: 1 }));
    this.ringNext = 0;
    for (const P of [this.birdBody, this.birdWL, this.birdWR, this.fish, this.duck, this.hen, this.flyL, this.flyR, this.rings]) this.group.add(P.mesh);
    this.pools = [this.birdBody, this.birdWL, this.birdWR, this.fish, this.duck, this.hen, this.flyL, this.flyR, this.rings];
    this.pollen = null;
  }

  setLevel(level) {
    this.level = level;
  }

  /** Called after the world (re)loads an island. */
  attach() {
    const W = this.world, I = W.I, biome = W.biome;
    this.biome = biome;
    // tiles worth knowing about
    this.water = [];
    this.deep = [];
    this.land = [];
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const k = idx(i, j), t = I.t[k];
        if (t === 'w') {
          this.water.push(k);
          if (I.h[k] < -0.35) this.deep.push(k);
        } else if (t === 'g' || t === 'm' || t === 's' || t === 'n') this.land.push(k);
      }
    const maxH = Math.max(...I.h);
    this.skyY = maxH + 1.6;
    // birds
    const cols = BIRD_COL[biome] || BIRD_COL.desa;
    this.birds = [];
    for (let n = 0; n < 30; n++) {
      const b = {
        n, mode: 'fly', ang: Math.random() * TAU, spd: rnd(0.35, 0.6) * (Math.random() < 0.5 ? -1 : 1), r: rnd(3, N * 0.38),
        cx: rnd(-2, 2), cz: rnd(-2, 2), y: this.skyY + rnd(0, 2.2), ph: Math.random() * 10, x: 0, yy: this.skyY + 2, z: 0, yaw: 0, pitch: 0,
        flap: 0, glide: 0, t: rnd(5, 20), gx: 0, gy: 0, gz: 0, hop: 0, col: cols[n % cols.length], bat: false, vis: 0,
      };
      b.x = b.cx + Math.cos(b.ang) * b.r;
      b.z = b.cz + Math.sin(b.ang) * b.r;
      this.birds.push(b);
      this.birdBody.color(n, b.col);
      this.birdWL.color(n, b.col);
      this.birdWR.color(n, b.col);
    }
    // fish
    this.fishT = rnd(1, 3);
    this.fishes = [0, 1, 2].map(() => ({ on: false, t: 0, x: 0, z: 0, dx: 1, dz: 0, len: 0.6, dur: 0.8, h: 0.3 }));
    for (let i = 0; i < 3; i++) this.fish.color(i, FISH_COL[biome] || (i % 2 ? '#e8a24a' : '#c9d2dc'));
    // ducks on ponds in the green islands
    this.ducks = [];
    if (this.water.length >= 6 && ['desa', 'hutan', 'fantasi', 'kota'].includes(biome)) {
      const k = this.water[Math.floor(Math.random() * this.water.length)];
      const [x, z] = tileCenter(Math.floor(k / N), k % N);
      for (let n = 0; n < 4; n++) {
        this.ducks.push({ n, x: x - n * 0.2, z, yaw: 0, tx: x, tz: z, wait: rnd(1, 4), dip: 0, ph: Math.random() * 10, s: n ? 0.55 : 1 });
        this.duck.color(n, n === 0 ? (biome === 'fantasi' ? '#ffd8ff' : '#ffffff') : '#ffe066');
      }
    }
    // chickens: spawned lazily around farms and coops
    this.hens = [];
    this.henT = 0;
    // butterflies
    this.flies = [];
    if (['desa', 'hutan', 'fantasi', 'pantai', 'gunung'].includes(biome) && this.land.length)
      for (let n = 0; n < 12; n++) {
        const f = { n, ax: 0, az: 0, ay: 0, ph: Math.random() * 10, re: 0, col: FLY_COL[n % FLY_COL.length] };
        this._flyAnchor(f);
        this.flies.push(f);
        this.flyL.color(n, f.col);
        this.flyR.color(n, f.col);
      }
    this.leafT = 0;
    this._buildPollen();
  }

  _buildPollen() {
    if (this.pollen) {
      this.group.remove(this.pollen);
      this.pollen.geometry.dispose();
      this.pollen.material.dispose();
      this.pollen = null;
    }
    if (!this.land.length) return;
    const W = this.world, I = W.I;
    const n = 90;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const k = this.land[Math.floor(Math.random() * this.land.length)];
      const [x, z] = tileCenter(Math.floor(k / N), k % N);
      pos.set([x + rnd(-0.5, 0.5), I.h[k] + rnd(0.25, 1.7), z + rnd(-0.5, 0.5)], i * 3);
      seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const col = this.biome === 'fantasi' ? new THREE.Color('#c9f6ff') : new THREE.Color('#fff4d0');
    const mat = fxMaterial({ vertexShader: POLLEN_VERT, fragmentShader: POLLEN_FRAG, uniforms: { uTime: shared.uTime, uAmount: { value: 0 }, uColor: { value: col.multiplyScalar(1.6) } } });
    this.pollen = new THREE.Points(g, mat);
    this.pollen.frustumCulled = false;
    this.pollen.renderOrder = 5;
    this.group.add(this.pollen);
  }

  _flyAnchor(f) {
    const I = this.world.I;
    const k = this.land[Math.floor(Math.random() * this.land.length)];
    const [x, z] = tileCenter(Math.floor(k / N), k % N);
    f.ax = x;
    f.az = z;
    f.ay = I.h[k];
    f.re = rnd(6, 14);
  }

  _ripple(x, z, s = 1) {
    const r = this.ringState[this.ringNext];
    this.ringNext = (this.ringNext + 1) % this.ringState.length;
    r.t = 0;
    r.x = x;
    r.z = z;
    r.s = s;
  }

  _isWater(x, z) {
    const [i, j] = tileAt(x, z);
    return inside(i, j) && this.world.I.t[idx(i, j)] === 'w';
  }

  /** A free spot for a bird to land on (open ground, no building, no tree). */
  _landSpot() {
    const W = this.world, I = W.I, occ = W.game.occ;
    for (let t = 0; t < 12 && this.land.length; t++) {
      const k = this.land[Math.floor(Math.random() * this.land.length)];
      if (occ[k] || (I.nodes[k] && I.nodes[k].hp !== 0)) continue;
      const [x, z] = tileCenter(Math.floor(k / N), k % N);
      return [x + rnd(-0.3, 0.3), I.h[k], z + rnd(-0.3, 0.3)];
    }
    return null;
  }

  update(dt) {
    if (!this.birds) return;
    this.t += dt;
    const W = this.world, env = W.env, g = W.game, I = W.I;
    const T = this.t, L = this.level;
    const day = env.daylight, night = env.night, rain = Math.max(env.cur.rain, env.cur.snow * 0.6);
    const evId = g.eventHere()?.id;
    const season = g.season?.() || null;

    // ---------------------------------------------------------------- birds / bats
    const batTime = night > 0.62 && ['hutan', 'gunung', 'fantasi', 'desa', 'gurun'].includes(this.biome);
    let want = Math.round((batTime ? 6 : 10 * day) * L * (1 - rain * 0.75));
    if (evId === 'migration') want = Math.round(30 * Math.max(0.5, L));
    want = Math.min(30, want);
    const m = W.mayor;
    for (const b of this.birds) {
      const active = b.n < want;
      if (b.bat !== batTime && b.vis < 0.02) {
        // swap species while out of sight
        b.bat = batTime;
        const c = batTime ? (this.biome === 'fantasi' ? '#5a3a8a' : '#2a2433') : b.col;
        this.birdBody.color(b.n, c);
        this.birdWL.color(b.n, c);
        this.birdWR.color(b.n, c);
        b.mode = 'fly';
        b.yy = this.skyY + 2.5;
      }
      b.vis += ((active && b.bat === batTime ? 1 : 0) - b.vis) * Math.min(1, dt * 1.5);
      if (b.vis < 0.01) {
        this.birdBody.hide(b.n);
        this.birdWL.hide(b.n);
        this.birdWR.hide(b.n);
        continue;
      }
      b.t -= dt;
      let tx, ty, tz, flapAmp = 0.95, flapSpd = 15, pitchT = 0;
      if (b.mode === 'fly') {
        const spd = b.bat ? b.spd * 1.9 : evId === 'migration' ? 0.75 * Math.sign(b.spd) : b.spd;
        b.ang += (spd / Math.max(1, b.r * 0.35)) * dt;
        const wob = b.bat ? Math.sin(T * 3.1 + b.ph) * 0.8 : 0;
        tx = b.cx + Math.cos(b.ang) * (b.r + wob);
        tz = b.cz + Math.sin(b.ang) * (b.r + wob);
        ty = b.y + Math.sin(T * 0.6 + b.ph) * 0.35 + (b.bat ? Math.sin(T * 4 + b.ph) * 0.2 : 0);
        b.glide = Math.sin(T * 0.45 + b.ph * 3) > 0.35 && !b.bat ? 1 : 0;
        if (b.bat) flapSpd = 26;
        // land now and then (birds only, fair weather)
        if (b.t <= 0) {
          b.t = rnd(8, 22);
          const spot = !b.bat && rain < 0.2 && day > 0.5 && Math.random() < 0.55 ? this._landSpot() : null;
          if (spot) {
            [b.gx, b.gy, b.gz] = spot;
            b.mode = 'land';
          } else if (Math.random() < 0.3) {
            b.cx = rnd(-3, 3);
            b.cz = rnd(-3, 3);
          }
        }
      } else if (b.mode === 'land') {
        tx = b.gx;
        ty = b.gy;
        tz = b.gz;
        const d = Math.hypot(b.x - tx, b.z - tz) + Math.abs(b.yy - ty);
        flapAmp = d < 0.8 ? 1.2 : 0.6;
        flapSpd = d < 0.8 ? 22 : 12;
        if (d < 0.05) {
          b.mode = 'ground';
          b.t = rnd(4, 11);
          b.hop = 0;
        }
      } else {
        // on the ground: hop about and peck; fly off when someone comes close or it rains
        tx = b.gx;
        ty = b.gy;
        tz = b.gz;
        flapAmp = 0;
        b.hop -= dt;
        if (b.hop <= 0) {
          b.hop = rnd(0.5, 1.6);
          if (Math.random() < 0.5) {
            const a = Math.random() * TAU;
            const nx = b.gx + Math.cos(a) * 0.12, nz = b.gz + Math.sin(a) * 0.12;
            if (!this._isWater(nx, nz)) {
              b.gx = nx;
              b.gz = nz;
              b.gy = W.heightAt(nx, nz);
            }
          }
        }
        pitchT = Math.max(0, Math.sin(T * 9 + b.ph)) > 0.75 ? -0.6 : 0;
        const near = Math.hypot(m.pos.x - b.x, m.pos.z - b.z) < 1.1;
        if (b.t <= 0 || near || rain > 0.3 || day < 0.35) {
          b.mode = 'fly';
          b.t = rnd(10, 25);
          if (near) W.audio.play?.('whoosh', { dur: 0.3, gain: 0.25 });
        }
      }
      // steer
      const k = b.mode === 'ground' ? Math.min(1, dt * 14) : Math.min(1, dt * (b.mode === 'land' ? 2.2 : 1.6));
      const ox = b.x, oz = b.z, oy = b.yy;
      b.x += (tx - b.x) * k;
      b.z += (tz - b.z) * k;
      const hopY = b.mode === 'ground' ? Math.max(0, Math.sin((b.hop / 1.6) * Math.PI * 6)) * 0.03 * (b.hop > 1.2 ? 1 : 0) : 0;
      b.yy += (ty - b.yy) * k;
      const vx = b.x - ox, vz = b.z - oz, vy = b.yy - oy;
      if (Math.abs(vx) + Math.abs(vz) > 1e-5) b.yaw = lerpAngle(b.yaw, Math.atan2(-vz, vx), Math.min(1, dt * 8));
      const pitch = b.mode === 'ground' ? pitchT : Math.max(-0.5, Math.min(0.5, (vy / Math.max(1e-4, dt)) * 0.25));
      b.pitch += (pitch - b.pitch) * Math.min(1, dt * 10);
      const roll = b.mode === 'fly' ? -Math.sign(b.spd) * 0.35 : 0;
      const flap = b.glide && b.mode === 'fly' ? 0.12 : Math.sin(T * flapSpd + b.ph) * flapAmp;
      const s = (b.bat ? 0.85 : 1) * b.vis;
      frame(_m, b.x, b.yy + hopY + 0.025, b.z, b.yaw, b.pitch, roll, s);
      this.birdBody.set(b.n, _m);
      const fold = b.mode === 'ground' ? 0.25 : 1;
      _bm.copy(_m);
      child(_wm, _bm, 0, 0.02, 0.022, -flap * fold - (b.mode === 'ground' ? 1.2 : 0));
      if (b.mode === 'ground') _wm.multiply(_fold.makeScale(1, 1, fold));
      this.birdWL.set(b.n, _wm);
      child(_wm, _bm, 0, 0.02, -0.022, flap * fold + (b.mode === 'ground' ? 1.2 : 0));
      if (b.mode === 'ground') _wm.multiply(_fold.makeScale(1, 1, fold));
      this.birdWR.set(b.n, _wm);
    }

    // ---------------------------------------------------------------- fish
    if (this.deep.length) {
      this.fishT -= dt * L * (evId === 'fishing' ? 3 : 1);
      if (this.fishT <= 0) {
        this.fishT = rnd(1.8, 5.5);
        const f = this.fishes.find((q) => !q.on);
        if (f) {
          const k = this.deep[Math.floor(Math.random() * this.deep.length)];
          const [x, z] = tileCenter(Math.floor(k / N), k % N);
          const a = Math.random() * TAU;
          Object.assign(f, { on: true, t: 0, x: x + rnd(-0.3, 0.3), z: z + rnd(-0.3, 0.3), dx: Math.cos(a), dz: Math.sin(a), len: rnd(0.45, 0.8), dur: rnd(0.65, 0.9), h: rnd(0.22, 0.38) });
          W.bursts.emit(this._v.set(f.x, 0.03, f.z), { n: 6, color: '#e6f6ff', speed: 0.45, up: 1.1, life: 0.45, gravity: 4 });
          this._ripple(f.x, f.z, 1);
        }
      }
      for (let n = 0; n < 3; n++) {
        const f = this.fishes[n];
        if (!f.on) {
          this.fish.hide(n);
          continue;
        }
        f.t += dt / f.dur;
        if (f.t >= 1) {
          f.on = false;
          const ex = f.x + f.dx * f.len, ez = f.z + f.dz * f.len;
          W.bursts.emit(this._v.set(ex, 0.03, ez), { n: 9, color: '#e6f6ff', speed: 0.55, up: 1.3, life: 0.5, gravity: 4 });
          this._ripple(ex, ez, 1.3);
          if (Math.random() < 0.35) W.audio.play?.('splash', { gain: 0.35 });
          this.fish.hide(n);
          continue;
        }
        const u = f.t;
        const y = Math.sin(Math.PI * u) * f.h - 0.02;
        const pitch = Math.atan2(Math.PI * f.h * Math.cos(Math.PI * u), f.len);
        frame(_m, f.x + f.dx * f.len * u, y, f.z + f.dz * f.len * u, Math.atan2(-f.dz, f.dx), pitch, Math.sin(u * 30) * 0.3, 1);
        this.fish.set(n, _m);
      }
    }

    // ---------------------------------------------------------------- ducks
    for (const d of this.ducks) {
      if (d.n === 0) {
        const dist = Math.hypot(d.tx - d.x, d.tz - d.z);
        if (dist < 0.05) {
          d.wait -= dt;
          if (d.wait <= 0) {
            d.wait = rnd(2, 6);
            for (let t = 0; t < 8; t++) {
              const a = Math.random() * TAU, r = rnd(0.6, 2.2);
              const nx = d.x + Math.cos(a) * r, nz = d.z + Math.sin(a) * r;
              let ok = true;
              for (let s = 1; s <= 6 && ok; s++) ok = this._isWater(d.x + (nx - d.x) * (s / 6), d.z + (nz - d.z) * (s / 6)) && this._isWater(nx + 0.2, nz) && this._isWater(nx - 0.2, nz) && this._isWater(nx, nz + 0.2) && this._isWater(nx, nz - 0.2);
              if (ok) {
                d.tx = nx;
                d.tz = nz;
                break;
              }
            }
          }
          // a dive for food now and then
          if (d.dip <= 0 && Math.random() < dt * 0.25) {
            d.dip = 1.2;
            this._ripple(d.x, d.z, 0.8);
          }
        } else {
          const st = Math.min(dist, dt * 0.24);
          const vx = (d.tx - d.x) / dist, vz = (d.tz - d.z) / dist;
          d.x += vx * st;
          d.z += vz * st;
          d.yaw = lerpAngle(d.yaw, Math.atan2(-vz, vx), Math.min(1, dt * 4));
          if (Math.random() < dt * 1.2) this._ripple(d.x - vx * 0.08, d.z - vz * 0.08, 0.6);
        }
      } else {
        // ducklings follow in a line
        const lead = this.ducks[d.n - 1];
        const dx = lead.x - d.x, dz = lead.z - d.z, dist = Math.hypot(dx, dz);
        const gap = d.n === 1 ? 0.2 : 0.13;
        if (dist > gap) {
          const st = Math.min(dist - gap, dt * 0.4);
          d.x += (dx / dist) * st;
          d.z += (dz / dist) * st;
          d.yaw = lerpAngle(d.yaw, Math.atan2(-dz, dx), Math.min(1, dt * 6));
        }
      }
      d.dip = Math.max(0, d.dip - dt);
      const dipA = d.dip > 0 ? Math.sin((1 - d.dip / 1.2) * Math.PI) * -1.3 : 0;
      frame(_m, d.x, -0.03 + Math.sin(T * 2 + d.ph) * 0.006, d.z, d.yaw, dipA, Math.sin(T * 1.7 + d.ph) * 0.05, d.s);
      this.duck.set(d.n, _m);
    }

    // ---------------------------------------------------------------- chickens
    this.henT -= dt;
    if (this.henT <= 0) {
      this.henT = 3;
      this._syncHens();
    }
    const hensOut = night < 0.7 && rain < 0.5;
    for (const h of this.hens) {
      h.vis += ((hensOut ? 1 : 0) - h.vis) * Math.min(1, dt * 1.2);
      if (h.vis < 0.02) {
        this.hen.hide(h.n);
        continue;
      }
      h.wait -= dt;
      const dist = Math.hypot(h.tx - h.x, h.tz - h.z);
      let pitch = 0, bounce = 0;
      if (dist > 0.02) {
        const st = Math.min(dist, dt * 0.35);
        const vx = (h.tx - h.x) / dist, vz = (h.tz - h.z) / dist;
        h.x += vx * st;
        h.z += vz * st;
        h.yaw = lerpAngle(h.yaw, Math.atan2(-vz, vx), Math.min(1, dt * 8));
        bounce = Math.abs(Math.sin(T * 18 + h.ph)) * 0.015;
      } else {
        pitch = Math.max(0, Math.sin(T * 7 + h.ph)) > 0.6 ? -0.7 : 0;
        if (h.wait <= 0) {
          h.wait = rnd(1.5, 5);
          const a = Math.random() * TAU, r = rnd(0.2, h.r);
          const nx = h.cx + Math.cos(a) * r, nz = h.cz + Math.sin(a) * r;
          const [i, j] = tileAt(nx, nz);
          const k = inside(i, j) ? idx(i, j) : -1;
          if (k >= 0 && I.t[k] !== 'w' && (!g.occ[k] || g.occ[k] === h.home)) {
            h.tx = nx;
            h.tz = nz;
          }
          if (Math.random() < 0.08) W.audio.play?.('talk', { pitch: 2.6, gain: 0.15 });
        }
      }
      h.pitch += (pitch - h.pitch) * Math.min(1, dt * 14);
      frame(_m, h.x, W.heightAt(h.x, h.z) + bounce, h.z, h.yaw, h.pitch, 0, 0.9 * h.vis);
      this.hen.set(h.n, _m);
    }

    // ---------------------------------------------------------------- butterflies
    const flyOn = day > 0.5 && rain < 0.15 && season !== 'winter';
    const nFly = flyOn ? Math.round((evId === 'butterflies' ? 12 : 6) * L) : 0;
    for (const f of this.flies) {
      if (f.n >= nFly) {
        this.flyL.hide(f.n);
        this.flyR.hide(f.n);
        continue;
      }
      f.re -= dt;
      if (f.re <= 0) this._flyAnchor(f);
      const x = f.ax + Math.sin(T * 0.7 + f.ph) * 0.45 + Math.sin(T * 1.9 + f.ph * 2) * 0.12;
      const z = f.az + Math.cos(T * 0.6 + f.ph * 1.3) * 0.45;
      const y = f.ay + 0.28 + Math.sin(T * 2.3 + f.ph) * 0.1 + Math.max(0, Math.sin(T * 0.4 + f.ph)) * 0.25;
      const yaw = Math.atan2(-(Math.sin(T * 0.6 + f.ph * 1.3) * -0.27), Math.cos(T * 0.7 + f.ph) * 0.31);
      frame(_m, x, y, z, yaw, 0.2, 0, 1);
      const flap = Math.sin(T * 24 + f.ph * 5) * 1.15;
      child(_wm, _m, 0, 0, 0, -Math.abs(flap) - 0.1);
      this.flyL.set(f.n, _wm);
      child(_wm, _m, 0, 0, 0, Math.abs(flap) + 0.1);
      this.flyR.set(f.n, _wm);
    }

    // ---------------------------------------------------------------- leaves and petals
    this._leaves(dt, season, rain);

    // ---------------------------------------------------------------- ripples
    for (let n = 0; n < this.ringState.length; n++) {
      const r = this.ringState[n];
      r.t += dt;
      if (r.t > 1.4) {
        this.rings.hide(n);
        continue;
      }
      const u = r.t / 1.4;
      const s = (1 + u * 4) * r.s;
      _m.compose(_p.set(r.x, 0.015, r.z), _q.identity(), _s.set(s, 1, s));
      this.rings.set(n, _m);
      this.rings.mesh.setColorAt(n, _c.setRGB((1 - u) * 0.6, 0, 0));
    }
    this.rings.mesh.instanceColor.needsUpdate = true;

    // ---------------------------------------------------------------- pollen
    if (this.pollen) {
      const sun = day * (1 - env.cur.clouds * 0.7) * (1 - rain) * (1 - env.cur.fog);
      this.pollen.material.uniforms.uAmount.value = Math.min(1, sun * 0.8 * L * (season === 'spring' || season === 'summer' ? 1.2 : 0.7));
      this.pollen.visible = this.pollen.material.uniforms.uAmount.value > 0.02;
    }

    for (const P of this.pools) P.commit();
  }

  /** Keep two or three chickens around every farm and coop (up to 9). */
  _syncHens() {
    const W = this.world;
    const homes = [];
    for (const e of W.buildings.values()) if (e.rec.built && (e.rec.type === 'peternakan' || e.rec.type === 'ladang')) homes.push(e);
    homes.sort((a, b) => (b.rec.type === 'peternakan') - (a.rec.type === 'peternakan'));
    const want = [];
    for (const e of homes) for (let k = 0; k < (e.rec.type === 'peternakan' ? 4 : 2); k++) want.push(e);
    want.length = Math.min(want.length, Math.round(9 * Math.max(0.45, this.level)));
    // drop hens whose home is gone
    this.hens = this.hens.filter((h) => {
      const ok = W.buildings.has(h.home) && want.some((e) => e.rec.id === h.home);
      if (!ok) this.hen.hide(h.n);
      return ok;
    });
    const used = new Set(this.hens.map((h) => h.n));
    const count = new Map();
    for (const h of this.hens) count.set(h.home, (count.get(h.home) || 0) + 1);
    for (const e of want) {
      const c = count.get(e.rec.id) || 0;
      const need = want.filter((x) => x === e).length;
      if (c >= need) continue;
      let n = 0;
      while (used.has(n)) n++;
      if (n >= 9) break;
      used.add(n);
      count.set(e.rec.id, c + 1);
      const coop = e.rec.type === 'peternakan';
      const r = coop ? 1.0 : 0.8;
      const a = Math.random() * TAU;
      const x = e.center.x + Math.cos(a) * r * 0.7, z = e.center.z + Math.sin(a) * r * 0.7;
      this.hens.push({ n, home: e.rec.id, cx: e.center.x, cz: e.center.z, r, x, z, tx: x, tz: z, yaw: Math.random() * TAU, pitch: 0, wait: rnd(0.5, 3), ph: Math.random() * 10, vis: 0 });
      this.hen.color(n, Math.random() < 0.35 ? '#c98a4a' : '#ffffff');
    }
  }

  _leaves(dt, season, rain) {
    const W = this.world, I = W.I;
    const autumn = season === 'autumn', spring = season === 'spring';
    let rate = 0, col = null;
    if (autumn) {
      rate = 4;
      col = ['#e8823a', '#d8503a', '#f0b040', '#c86a2a'];
    } else if (spring && ['desa', 'hutan', 'fantasi', 'gunung'].includes(this.biome)) {
      rate = 3;
      col = this.biome === 'fantasi' ? ['#ff8af0', '#c9a0ff', '#ffffff'] : ['#ffc0d8', '#ffe0ec', '#ffffff'];
    } else if (this.biome === 'hutan' || W.env.cur.wind > 0.7) {
      rate = 1;
      col = ['#5a9e4b', '#7fb84e', '#4d8f45'];
    }
    if (!rate) return;
    rate *= this.level * (1 + W.env.cur.wind) * (1 - rain * 0.5);
    this.leafT -= dt * rate;
    if (this.leafT > 0) return;
    this.leafT = 1;
    // a random tree near the camera target
    const tg = W.engine.view.target;
    const keys = this._treeKeys ||= [];
    if (!keys.length || Math.random() < 0.02) {
      keys.length = 0;
      for (const [k, n] of Object.entries(I.nodes)) if (n.hp !== 0 && ['tree', 'pine', 'palm', 'mushroom'].includes(n.k)) keys.push(+k);
    }
    if (!keys.length) return;
    let best = keys[Math.floor(Math.random() * keys.length)];
    for (let t = 0; t < 3; t++) {
      const k = keys[Math.floor(Math.random() * keys.length)];
      const a = W._nodeBase(k), b = W._nodeBase(best);
      if ((a.x - tg.x) ** 2 + (a.z - tg.z) ** 2 < (b.x - tg.x) ** 2 + (b.z - tg.z) ** 2) best = k;
    }
    const nb = W._nodeBase(best);
    const wd = W.env.windDir, ws = 0.25 + W.env.cur.wind * 0.6;
    W.bursts.emit(this._v.set(nb.x + rnd(-0.2, 0.2), nb.y + 0.55 * nb.s + rnd(0, 0.25), nb.z + rnd(-0.2, 0.2)), {
      n: 1, color: col[Math.floor(Math.random() * col.length)], speed: 0.12, up: 0.05, life: 3.2, gravity: 0.16, push: { x: wd.x * ws, z: wd.y * ws },
    });
  }

  dispose() {
    for (const P of this.pools) P.mesh.dispose();
    for (const P of this.pools) P.mesh.geometry.dispose();
    this.mat.dispose();
    this.ringMat.dispose();
    if (this.pollen) {
      this.pollen.geometry.dispose();
      this.pollen.material.dispose();
    }
  }
}
