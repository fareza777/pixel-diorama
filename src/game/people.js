// Instanced crowd renderer: every villager is drawn from a handful of InstancedMeshes (legs, arms,
// body, head, hair, hat, umbrella), so a whole town costs about 8 draw calls. Figures are modelled
// after noxe-pixel-engine's kit-people (MIT): ~0.58 units tall, facing +x.
import * as THREE from 'three';
import { toon } from '../engine/materials.js';

const SKIN = ['#f1c7a3', '#e0ac85', '#c98f66', '#b97c55', '#8a5a3c'];
const COATS = ['#c94a3d', '#2f4a7a', '#e2b33c', '#3f6e4f', '#6b4a8a', '#2a2e3a', '#d8d2c4', '#b8673a', '#3f8fc2', '#e86a9a', '#7fb84e'];
const PANTS = ['#2b2f3a', '#3a3f52', '#4a3a2a', '#2f3f5f', '#5a5048'];
const HAIR = ['#2a1e17', '#5a3a22', '#c99a52', '#141414', '#9a9a9a', '#8a3a20'];
const UMBR = ['#e94f4f', '#3f6fb0', '#ffd23d', '#7fb84e', '#b58cff'];
const pick = (rand, list) => list[Math.floor(rand() * list.length)];

export function randomLook(rand) {
  return {
    skin: pick(rand, SKIN), coat: pick(rand, COATS), pants: pick(rand, PANTS), hair: pick(rand, HAIR),
    umbrella: pick(rand, UMBR), hat: rand() < 0.2 ? pick(rand, ['#c99a52', '#2a2e3a', '#e94f4f', '#efe6d6']) : null,
    long: rand() < 0.45,
  };
}

const box = (w, h, d, ty = 0, tx = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(tx, ty, 0);
  return g;
};

const PARTS = {
  leg: { geo: () => box(0.075, 0.23, 0.075, -0.115), per: 2, cast: true },
  arm: { geo: () => box(0.055, 0.2, 0.055, -0.095), per: 2, cast: false },
  body: { geo: () => box(0.14, 0.23, 0.18), per: 1, cast: true },
  head: { geo: () => box(0.115, 0.115, 0.115), per: 1, cast: true },
  hair: { geo: () => box(0.125, 0.045, 0.125), per: 1, cast: false },
  hairBack: { geo: () => box(0.04, 0.11, 0.125), per: 1, cast: false },
  hat: { geo: () => box(0.14, 0.06, 0.14), per: 1, cast: false },
  umbrella: {
    geo: () => {
      const c = new THREE.ConeGeometry(0.3, 0.13, 8);
      c.translate(0, 0.33, 0);
      const p = new THREE.CylinderGeometry(0.012, 0.012, 0.36, 4);
      p.translate(0, 0.12, 0);
      const merged = new THREE.BufferGeometry();
      const a = c.toNonIndexed(), b = p.toNonIndexed();
      const pos = new Float32Array([...a.attributes.position.array, ...b.attributes.position.array]);
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      merged.computeVertexNormals();
      return merged;
    },
    per: 1, cast: true,
  },
  tool: {
    geo: () => {
      const handle = box(0.2, 0.025, 0.025, -0.19, 0.08).toNonIndexed();
      const head = box(0.05, 0.09, 0.03, -0.19, 0.17).toNonIndexed();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...handle.attributes.position.array, ...head.attributes.position.array]), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([...handle.attributes.normal.array, ...head.attributes.normal.array]), 3));
      return g;
    },
    per: 1, cast: false,
  },
};

const _m = new THREE.Matrix4(), _base = new THREE.Matrix4(), _l = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const WHITE = new THREE.Color('#ffffff');

export class Crowd {
  constructor(capacity = 96) {
    this.capacity = capacity;
    this.group = new THREE.Group();
    this.mat = toon('#ffffff', { noise: 0.04, snow: 0.5, wet: 0.3 });
    this.meshes = {};
    for (const [name, P] of Object.entries(PARTS)) {
      const m = new THREE.InstancedMesh(P.geo(), this.mat, capacity * P.per);
      m.castShadow = P.cast;
      m.receiveShadow = false;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < capacity * P.per; i++) {
        m.setMatrixAt(i, ZERO);
        m.setColorAt(i, WHITE);
      }
      this.meshes[name] = m;
      this.group.add(m);
    }
    this.free = [];
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
  }

  alloc(look) {
    const slot = this.free.pop();
    if (slot === undefined) return -1;
    this.setLook(slot, look);
    return slot;
  }

  release(slot) {
    if (slot < 0) return;
    this.hide(slot);
    this.free.push(slot);
  }

  setLook(slot, look) {
    const c = new THREE.Color();
    const M = this.meshes;
    M.leg.setColorAt(slot * 2, c.set(look.pants));
    M.leg.setColorAt(slot * 2 + 1, c);
    M.arm.setColorAt(slot * 2, c.set(look.coat));
    M.arm.setColorAt(slot * 2 + 1, c);
    M.body.setColorAt(slot, c);
    M.head.setColorAt(slot, c.set(look.skin));
    M.hair.setColorAt(slot, c.set(look.hair));
    M.hairBack.setColorAt(slot, c);
    M.hat.setColorAt(slot, c.set(look.hat || look.hair));
    M.umbrella.setColorAt(slot, c.set(look.umbrella || '#e94f4f'));
    M.tool.setColorAt(slot, c.set(look.tool || '#8a5a38'));
    for (const m of Object.values(M)) m.instanceColor.needsUpdate = true;
  }

  hide(slot) {
    const M = this.meshes;
    for (const [name, P] of Object.entries(PARTS)) for (let k = 0; k < P.per; k++) M[name].setMatrixAt(slot * P.per + k, ZERO);
  }

  /**
   * Pose one figure. f: { pos, yaw, scale, anim, phase, umbrella, hat, long, tool }
   * anim: 'walk' | 'idle' | 'work' | 'chop' | 'wave' | 'dance' | 'sit' | 'talk'
   */
  pose(slot, f) {
    const M = this.meshes;
    _e.set(0, f.yaw, 0);
    _q.setFromEuler(_e);
    const sc = f.scale ?? 1;
    let bob = 0, lean = 0;
    const ph = f.phase || 0;
    let legSw = 0, armL = 0, armR = 0, legLift = 0, sit = false;
    switch (f.anim) {
      case 'walk':
        legSw = Math.sin(ph) * 0.6;
        armL = -legSw * 0.8;
        armR = legSw * 0.8;
        bob = Math.abs(Math.sin(ph)) * 0.02;
        break;
      case 'work':
        armR = -1.2 + Math.sin(ph * 1.6) * 0.6;
        armL = -0.6 + Math.sin(ph * 1.6 + 1) * 0.4;
        lean = 0.12;
        bob = Math.abs(Math.sin(ph * 1.6)) * 0.01;
        break;
      case 'chop': {
        const s = Math.sin(ph * 2.2);
        armR = -2.2 + (s * 0.5 + 0.5) * 2.0;
        armL = armR * 0.9;
        lean = 0.1 + (s * 0.5 + 0.5) * 0.15;
        break;
      }
      case 'wave':
        armR = -2.6 + Math.sin(ph * 3) * 0.35;
        armL = 0.1;
        break;
      case 'dance':
        legSw = Math.sin(ph * 2) * 0.3;
        armL = -2.4 + Math.sin(ph * 2) * 0.5;
        armR = -2.4 - Math.sin(ph * 2) * 0.5;
        bob = Math.abs(Math.sin(ph * 2)) * 0.06;
        break;
      case 'talk':
        armR = -0.5 + Math.sin(ph * 2.5) * 0.3;
        armL = 0.1;
        break;
      case 'sit':
        sit = true;
        break;
      default:
        armL = Math.sin(ph * 0.5) * 0.04;
        armR = -armL;
    }
    _base.compose(_v.set(f.pos.x, f.pos.y + bob * sc - (sit ? 0.06 * sc : 0), f.pos.z), _q, _s.set(sc, sc, sc));

    const set = (mesh, i, x, y, z, rz = 0, rx = 0) => {
      _e.set(rx, 0, rz);
      _q.setFromEuler(_e);
      _l.compose(_v.set(x, y, z), _q, _s.set(1, 1, 1));
      _m.multiplyMatrices(_base, _l);
      mesh.setMatrixAt(i, _m);
    };
    if (sit) {
      set(M.leg, slot * 2, 0, 0.2, 0.045, Math.PI / 2);
      set(M.leg, slot * 2 + 1, 0, 0.2, -0.045, Math.PI / 2);
    } else {
      set(M.leg, slot * 2, 0, 0.23 + legLift, 0.045, legSw);
      set(M.leg, slot * 2 + 1, 0, 0.23, -0.045, -legSw);
    }
    const ly = 0.34, lx = lean * 0.12;
    set(M.body, slot, lx * 0.5, ly, 0, -lean);
    set(M.head, slot, lx, 0.515, 0, -lean);
    set(M.hair, slot, lx - 0.01, 0.575, 0, -lean);
    if (f.long) set(M.hairBack, slot, lx - 0.05, 0.5, 0, -lean);
    else M.hairBack.setMatrixAt(slot, ZERO);
    if (f.hat) set(M.hat, slot, lx - 0.005, 0.61, 0, -lean);
    else M.hat.setMatrixAt(slot, ZERO);
    if (f.umbrella && f.anim !== 'chop') {
      set(M.arm, slot * 2 + 1, lx, 0.44, -0.12, 1.05);
      set(M.umbrella, slot, 0.06, 0.5, -0.04);
    } else {
      set(M.arm, slot * 2 + 1, lx, 0.44, -0.12, armR);
      M.umbrella.setMatrixAt(slot, ZERO);
    }
    set(M.arm, slot * 2, lx, 0.44, 0.12, armL);
    if (f.tool && (f.anim === 'chop' || f.anim === 'work')) {
      // the tool sits in the right hand: follow the arm rotation
      _e.set(0, 0, armR);
      _q.setFromEuler(_e);
      _l.compose(_v.set(lx, 0.44, -0.12), _q, _s.set(1, 1, 1));
      _m.multiplyMatrices(_base, _l);
      M.tool.setMatrixAt(slot, _m);
    } else M.tool.setMatrixAt(slot, ZERO);
  }

  commit() {
    for (const m of Object.values(this.meshes)) m.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const m of Object.values(this.meshes)) {
      m.geometry.dispose();
      m.dispose();
    }
    this.mat.dispose();
  }
}
