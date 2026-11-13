// Wild animals (v1.3): at night wolves and boars come out of the unexplored land (or the island's edge)
// and head for the farms to raid the food stores. Tap one and the Mayor runs over and shoos it away; a
// staffed Guard Post chases them off on its own. Nobody gets hurt: a chased animal runs back into the
// wild. Animals are simple block shapes without faces. Nothing here is saved; nights start fresh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, fxMaterial } from '../engine/materials.js';
import { BUILDINGS } from './data.js';
import { N, idx, inside, tileCenter, tileAt, WALKABLE } from './island.js';
import { findPath } from './path.js';

const MAX = 4;
const SIZE = 1.8; // animals are drawn bigger than life so they read clearly on a phone
const FOOD_TYPES = ['ladang', 'kebun', 'peternakan', 'nelayan', 'lumbung', 'roti'];
const KINDS = {
  wolf: { hp: 3, speed: 1.25, reward: { coins: 25, xp: 20 } },
  boar: { hp: 5, speed: 0.95, reward: { coins: 35, xp: 24 } },
};
const BIOME_KINDS = { desa: ['boar', 'wolf'], hutan: ['wolf', 'boar'], pantai: ['boar'], gunung: ['wolf'], gurun: ['wolf'], fantasi: ['wolf', 'boar'], kota: [] };
const TINT = { gurun: { wolf: '#c8a46a' }, fantasi: { wolf: '#7a6aa8', boar: '#6a4a7a' } };
const RAID_EVERY = 5; // seconds between food thefts
const RAID_FOR = 40; // an unbothered animal leaves after this long
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const HIP = { wolf: 0.15, boar: 0.12 };
const _t = new THREE.Matrix4(), _lm = new THREE.Matrix4();
const _m = new THREE.Matrix4(), _l = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color(), _v = new THREE.Vector3();

function cbox(w, h, d, color, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
  g.deleteAttribute('uv');
  const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const merged = (...g) => mergeGeometries(g, false);

// bodies face +x; white parts are tinted per instance, other colours stay as painted
const WOLF = () => merged(
  cbox(0.3, 0.13, 0.12, '#ffffff', 0, 0.2, 0), cbox(0.12, 0.12, 0.13, '#ffffff', 0.15, 0.24, 0),
  cbox(0.1, 0.09, 0.09, '#ffffff', 0.24, 0.29, 0), cbox(0.07, 0.05, 0.06, '#d8d8d8', 0.32, 0.27, 0),
  cbox(0.03, 0.06, 0.03, '#ffffff', 0.24, 0.36, 0.03), cbox(0.03, 0.06, 0.03, '#ffffff', 0.24, 0.36, -0.03),
  cbox(0.14, 0.04, 0.04, '#ffffff', -0.2, 0.25, 0, 0),
);
const BOAR = () => merged(
  cbox(0.32, 0.17, 0.16, '#ffffff', 0, 0.21, 0), cbox(0.13, 0.13, 0.13, '#ffffff', 0.19, 0.2, 0),
  cbox(0.06, 0.06, 0.08, '#c89a8a', 0.28, 0.18, 0), cbox(0.02, 0.05, 0.02, '#f4f1ea', 0.27, 0.22, 0.05),
  cbox(0.02, 0.05, 0.02, '#f4f1ea', 0.27, 0.22, -0.05), cbox(0.26, 0.04, 0.05, '#3a2a20', 0, 0.31, 0),
);
const LEGS = (len) => merged(cbox(0.04, len, 0.04, '#ffffff', 0.1, len / 2, 0.045), cbox(0.04, len, 0.04, '#ffffff', -0.1, len / 2, -0.045));
const MARK = () => {
  const g = new THREE.OctahedronGeometry(0.06, 0);
  g.scale(1, 1.6, 1);
  return g;
};

class Pool {
  constructor(geo, mat, n) {
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    for (let i = 0; i < n; i++) {
      this.mesh.setMatrixAt(i, ZERO);
      this.mesh.setColorAt(i, _c.set('#ffffff'));
    }
  }
}

export class Wildlife {
  constructor(world) {
    this.world = world;
    this.game = world.game;
    this.group = new THREE.Group();
    this.list = [];
    this.spawnT = 20;
    this.guardT = 1;
    const mat = toon('#ffffff', { vertexColors: true, noise: 0.04, snow: 0.15, wet: 0.2 });
    this.mat = mat;
    this.pools = {
      wolf: { body: new Pool(WOLF(), mat, MAX), a: new Pool(LEGS(0.15), mat, MAX), b: new Pool(LEGS(0.15), mat, MAX) },
      boar: { body: new Pool(BOAR(), mat, MAX), a: new Pool(LEGS(0.12), mat, MAX), b: new Pool(LEGS(0.12), mat, MAX) },
    };
    this.markMat = fxMaterial({
      vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: 'void main() { gl_FragColor = vec4(1.6, 0.42, 0.3, 1.0); gNormal = vec4(0.0); }',
    });
    this.mark = new Pool(MARK(), this.markMat, MAX);
    this.mark.mesh.castShadow = false;
    for (const P of Object.values(this.pools)) for (const pool of Object.values(P)) this.group.add(pool.mesh);
    this.group.add(this.mark.mesh);
  }

  get I() {
    return this.world.I;
  }

  // ---------------------------------------------------------------- spawning

  _night() {
    const h = this.game.s.time.hour;
    return h >= 20.5 || h < 4.5;
  }

  _targets() {
    return this.I.buildings.filter((b) => FOOD_TYPES.includes(b.type) && b.built && !b.ruin);
  }

  /** A tile at the edge of the explored land (or of the island) where an animal can step out. */
  _spawnTile() {
    const I = this.I;
    const ok = (k) => WALKABLE.has(I.t[k]) && !this.game.occ[k];
    for (let t = 0; t < 300; t++) {
      const i = Math.floor(Math.random() * N), j = Math.floor(Math.random() * N);
      const k = idx(i, j);
      if (!ok(k)) continue;
      if (I.seen && !I.seen[k]) {
        // just inside the mist, next to explored land
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inside(i + a, j + b) && I.seen[idx(i + a, j + b)])) return [i, j];
      } else if (i === 0 || j === 0 || i === N - 1 || j === N - 1) return [i, j];
    }
    return null;
  }

  _spawn() {
    const kinds = BIOME_KINDS[this.world.biome] || [];
    const targets = this._targets();
    if (!kinds.length || !targets.length) return;
    const from = this._spawnTile();
    if (!from) return;
    const rec = targets[Math.floor(Math.random() * targets.length)];
    const to = this.world.doorTile(rec) || [rec.i, rec.j];
    const path = findPath(this.I, this.world._passable, from, to, 1600);
    if (!path) return;
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const [x, z] = tileCenter(from[0], from[1]);
    const a = { kind, slot: this._freeSlot(kind), hp: KINDS[kind].hp, max: KINDS[kind].hp, pos: new THREE.Vector3(x, this.world.tileH(from[0], from[1]), z), yaw: 0, path, pi: 0, state: 'approach', bid: rec.id, t: 0, raidT: 0, hitT: 0, from, fade: 1, step: Math.random() * 6 };
    if (a.slot < 0) return;
    this.list.push(a);
    const P = this.pools[kind];
    const tint = TINT[this.world.biome]?.[kind] || (kind === 'wolf' ? '#b4b9c6' : '#9a6a48');
    for (const pool of [P.body, P.a, P.b]) {
      pool.mesh.setColorAt(a.slot, _c.set(tint));
      pool.mesh.instanceColor.needsUpdate = true;
    }
    this.game.emit('wild:spawn', { kind, rec });
  }

  _freeSlot(kind) {
    for (let s = 0; s < MAX; s++) if (!this.list.some((a) => a.kind === kind && a.slot === s)) return s;
    return -1;
  }

  // ---------------------------------------------------------------- chasing

  /** Shoo an animal; at zero it runs back into the wild and the chaser gets the reward. */
  hit(a, byMayor) {
    if (a.state === 'flee') return;
    a.hp -= 1;
    a.hitT = 0.3;
    this.world.bursts.emit(a.pos.clone().add(_v.set(0, 0.25, 0)), { n: 6, color: '#f4f1ea', speed: 0.6, up: 0.6, life: 0.5 });
    this.world.audio.play('whoosh', { dur: 0.25, gain: 0.35 });
    if (a.hp > 0) return;
    a.state = 'flee';
    a.t = 0;
    const away = this._spawnTile() || a.from;
    a.path = findPath(this.I, this.world._passable, tileAt(a.pos.x, a.pos.z), away, 1600) || null;
    a.pi = 0;
    const r = KINDS[a.kind].reward;
    const got = this.game.give(byMayor ? r : { coins: Math.round(r.coins / 2), xp: Math.round(r.xp / 2) });
    this.game.s.stats.chased = (this.game.s.stats.chased || 0) + 1;
    this.game.emit('wild:chased', { kind: a.kind, got, byMayor, pos: a.pos.clone() });
  }

  /** The Mayor's 'chase' task (see World._updateMayor). */
  mayorTask(m, t, dt) {
    const a = t.a;
    if (!this.list.includes(a) || a.state === 'flee') {
      m.task = null;
      m.mode = 'idle';
      return;
    }
    const d = Math.hypot(a.pos.x - m.pos.x, a.pos.z - m.pos.z);
    if (d > 0.95) {
      t.repath = (t.repath || 0) - dt;
      if (t.repath <= 0) {
        t.repath = 0.6;
        this.world._mayorPath(tileAt(a.pos.x, a.pos.z));
        if (m.mode !== 'walk') m.mode = 'task';
      }
      return;
    }
    this.world._face(m, a.pos);
    m.anim = 'wave';
    m.phase += dt;
    t.swing = (t.swing || 0) - dt;
    if (t.swing <= 0) {
      t.swing = 0.5;
      this.hit(a, true);
    }
  }

  pick(cx, cy) {
    let best = null, bd = 36;
    for (const a of this.list) {
      if (a.state === 'flee') continue;
      const p = this.world.project(_v.set(a.pos.x, a.pos.y + 0.4, a.pos.z));
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < bd) {
        bd = d;
        best = { type: 'wild', a };
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- frame

  update(dt) {
    const g = this.game;
    // spawning: only at night, only once there is food worth raiding
    if (this._night() && g.s.player.level >= 2 && this.I.npcs.length >= 2) {
      this.spawnT -= dt;
      const cap = Math.min(3, 1 + Math.floor(g.s.player.level / 6));
      if (this.spawnT <= 0) {
        this.spawnT = 25 + Math.random() * 35;
        if (this.list.filter((a) => a.state !== 'flee').length < cap) this._spawn();
      }
    } else this.spawnT = Math.min(this.spawnT, 12);
    // Guard Posts with a watchman on duty shoo animals in range
    this.guardT -= dt;
    if (this.guardT <= 0) {
      this.guardT = 1;
      this._guards();
    }
    for (const a of [...this.list]) this._step(a, dt);
    this._draw();
  }

  _guards() {
    const posts = this.I.buildings.filter((b) => BUILDINGS[b.type].guard && b.built && !b.ruin && this.I.npcs.some((p) => p.job === b.id));
    for (const b of posts) {
      const [x, z] = tileCenter(b.i, b.j);
      const R = BUILDINGS[b.type].guard;
      for (const a of this.list) if (a.state !== 'flee' && Math.hypot(a.pos.x - x, a.pos.z - z) < R) {
        this.hit(a, false);
        if (Math.random() < 0.3) this.world.audio.play('horn', { pitch: 1.6, dur: 0.5 });
      }
    }
  }

  _step(a, dt) {
    a.t += dt;
    a.hitT = Math.max(0, a.hitT - dt);
    const spd = KINDS[a.kind].speed * (a.state === 'flee' ? 2 : 1) * (a.hitT > 0 ? 0.3 : 1);
    if (a.state === 'raid') {
      a.raidT -= dt;
      a.step += dt * 2;
      if (a.raidT <= 0) {
        a.raidT = RAID_EVERY;
        const s = this.game.s.res;
        const take = Math.min(s.food || 0, 4);
        if (take > 0) {
          s.food -= take;
          this.game.emit('wild:raid', { kind: a.kind, bid: a.bid, take, pos: a.pos.clone() });
        }
      }
      if (a.t > RAID_FOR || !this._night()) {
        a.hp = 0;
        a.state = 'flee';
        a.path = findPath(this.I, this.world._passable, tileAt(a.pos.x, a.pos.z), this._spawnTile() || a.from, 1600);
        a.pi = 0;
      }
      return;
    }
    if (a.state === 'flee') {
      a.fade -= dt / 3.5;
      if (a.fade <= 0) {
        this.list.splice(this.list.indexOf(a), 1);
        return;
      }
    }
    // follow the path, tile by tile
    const path = a.path;
    if (!path || a.pi >= path.length) {
      if (a.state === 'approach') {
        a.state = 'raid';
        a.t = 0;
        a.raidT = 1.5;
      }
      return;
    }
    const [ti, tj] = path[a.pi];
    const [x, z] = tileCenter(ti, tj);
    const dx = x - a.pos.x, dz = z - a.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) {
      a.pi++;
      return;
    }
    const mv = Math.min(d, spd * dt);
    a.pos.x += (dx / d) * mv;
    a.pos.z += (dz / d) * mv;
    const [ci, cj] = tileAt(a.pos.x, a.pos.z);
    if (inside(ci, cj)) a.pos.y += (this.world.tileH(ci, cj) - a.pos.y) * Math.min(1, dt * 10);
    const want = Math.atan2(-dz, dx);
    let dy = ((want - a.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    a.yaw += dy * Math.min(1, dt * 10);
    a.step += mv * 9;
  }

  _draw() {
    for (const [kind, P] of Object.entries(this.pools)) {
      for (let s = 0; s < MAX; s++) {
        const a = this.list.find((x) => x.kind === kind && x.slot === s);
        if (!a) {
          P.body.mesh.setMatrixAt(s, ZERO);
          P.a.mesh.setMatrixAt(s, ZERO);
          P.b.mesh.setMatrixAt(s, ZERO);
          continue;
        }
        const sc = SIZE * (a.state === 'flee' ? Math.max(0.01, a.fade) : 1);
        const hop = a.hitT > 0 ? Math.sin(a.hitT * 30) * 0.03 : Math.abs(Math.sin(a.step)) * 0.015;
        _e.set(0, a.yaw, 0);
        _q.setFromEuler(_e);
        _m.compose(_p.set(a.pos.x, a.pos.y + hop, a.pos.z), _q, _s.set(sc, sc, sc));
        P.body.mesh.setMatrixAt(s, _m);
        // legs swing from the hip: T(hip) * R * T(-hip)
        const swing = Math.sin(a.step) * 0.5, hip = HIP[kind];
        for (const [pool, sign] of [[P.a, 1], [P.b, -1]]) {
          _l.makeRotationZ(swing * sign);
          _l.premultiply(_t.makeTranslation(0, hip, 0)).multiply(_t.makeTranslation(0, -hip, 0));
          pool.mesh.setMatrixAt(s, _lm.multiplyMatrices(_m, _l));
        }
      }
      for (const pool of [P.body, P.a, P.b]) pool.mesh.instanceMatrix.needsUpdate = true;
    }
    // a small warning mark floats over every animal that is still causing trouble
    for (let i = 0; i < MAX; i++) {
      const a = this.list.filter((x) => x.state !== 'flee')[i];
      if (!a) {
        this.mark.mesh.setMatrixAt(i, ZERO);
        continue;
      }
      _m.compose(_p.set(a.pos.x, a.pos.y + 0.95 + Math.sin(this.world.time * 4 + i) * 0.06, a.pos.z), _q.identity(), _s.set(1.7, 1.7, 1.7));
      this.mark.mesh.setMatrixAt(i, _m);
    }
    this.mark.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const P of Object.values(this.pools)) for (const pool of Object.values(P)) pool.mesh.geometry.dispose();
    this.mark.mesh.geometry.dispose();
    this.mat.dispose();
    this.markMat.dispose();
  }
}
