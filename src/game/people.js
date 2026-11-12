// Instanced crowd renderer: every villager is drawn from a handful of InstancedMeshes (legs, arms,
// body, head, hair, hat, umbrella, tools), so a whole town costs about a dozen draw calls. Figures are
// modelled after noxe-pixel-engine's kit-people (MIT): ~0.58 units tall, facing +x.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
const boxAt = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// Tools are modelled in the right arm's local space: the shoulder is the origin, the arm hangs
// along -y and the hand is at y = -0.19. The handle carries on past the hand, so the tool always
// follows the swing. An overhead swing moves the tool towards local -x, so axe edges and pick
// points sit on that side and lead the motion.
const TOOL_GEO = {
  handle: () => boxAt(0.026, 0.27, 0.026, 0, -0.3, 0),
  axe: () => mergeGeometries([boxAt(0.075, 0.085, 0.02, -0.05, -0.4, 0), boxAt(0.03, 0.045, 0.034, 0.01, -0.4, 0)]),
  pick: () => mergeGeometries([boxAt(0.2, 0.03, 0.028, -0.03, -0.425, 0), boxAt(0.034, 0.034, 0.028, -0.13, -0.443, 0)]),
  shovel: () => mergeGeometries([boxAt(0.014, 0.1, 0.078, -0.006, -0.475, 0), boxAt(0.03, 0.02, 0.03, 0, -0.43, 0)]),
};

/**
 * Gathering animations. Each is a loop of T seconds; `hit` is the moment (0..1 of the loop) the
 * tool or hand lands, which is when the game deals the hit, plays the sound and spawns particles.
 */
export const GATHER_ANIMS = {
  chop: { T: 1.0, hit: 0.6, tool: 'axe' }, // sideways swing at a trunk
  mine: { T: 1.1, hit: 0.6, tool: 'pick' }, // overhead swing down onto rock
  dig: { T: 1.05, hit: 0.28, toss: 0.66, tool: 'shovel' }, // spade in, lever, toss
  pick: { T: 0.8, hit: 0.5, tool: null }, // picking berries by hand
};

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (x) => x * x * (3 - 2 * x);
const easeIn = (x) => x * x * x;
const easeOut = (x) => 1 - (1 - x) * (1 - x);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** Gathering pose at loop time u (0..1). Arm angles: a = pitch (0 down, PI/2 forward, PI up), y = yaw to the right. */
function gatherPose(anim, u, P) {
  switch (anim) {
    case 'chop': {
      // rest -> axe raised over the head (a little to the tool side) -> short hold -> fast diagonal
      // swing down into the trunk -> rebound -> rest. Reads clearly from the isometric camera.
      const rest = [1.15, 0.25], up = [3.1, 0.4], hit = [1.0, 0.12];
      let a, y, lean, twist;
      if (u < 0.4) {
        const x = ease(u / 0.4);
        a = lerp(rest[0], up[0], x); y = lerp(rest[1], up[1], x); lean = lerp(0.1, -0.1, x); twist = lerp(0, 0.22, x);
      } else if (u < 0.5) {
        const x = (u - 0.4) / 0.1;
        a = up[0] + 0.06 * x; y = up[1]; lean = -0.1 - 0.02 * x; twist = 0.22;
      } else if (u < 0.6) {
        const x = easeIn((u - 0.5) / 0.1);
        a = lerp(up[0] + 0.06, hit[0], x); y = lerp(up[1], hit[1], x); lean = lerp(-0.12, 0.26, x); twist = lerp(0.22, -0.08, x);
      } else if (u < 0.72) {
        const x = (u - 0.6) / 0.12;
        a = hit[0] + 0.16 * Math.sin(Math.PI * x); y = hit[1]; lean = lerp(0.26, 0.18, x); twist = -0.08;
      } else {
        const x = ease((u - 0.72) / 0.28);
        a = lerp(hit[0], rest[0], x); y = lerp(hit[1], rest[1], x); lean = lerp(0.18, 0.1, x); twist = lerp(-0.08, 0, x);
      }
      P.aR = P.aL = a; P.yR = P.yL = y; P.lean = lean; P.twist = twist; P.stance = 0.3;
      break;
    }
    case 'mine': {
      const rest = 1.2, up = 3.35, hit = 0.95;
      let a, lean, crouch = 0;
      if (u < 0.42) {
        const x = ease(u / 0.42);
        a = lerp(rest, up, x); lean = lerp(0.1, -0.12, x);
      } else if (u < 0.5) {
        a = up + 0.04 * ((u - 0.42) / 0.08); lean = -0.12;
      } else if (u < 0.6) {
        const x = easeIn((u - 0.5) / 0.1);
        a = lerp(up + 0.04, hit, x); lean = lerp(-0.12, 0.32, x);
      } else if (u < 0.72) {
        const x = (u - 0.6) / 0.12;
        a = hit + 0.22 * Math.sin(Math.PI * x); lean = lerp(0.32, 0.24, x); crouch = 0.018 * (1 - x);
      } else {
        const x = ease((u - 0.72) / 0.28);
        a = lerp(hit, rest, x); lean = lerp(0.24, 0.1, x);
      }
      P.aR = P.aL = a; P.yR = P.yL = 0.06; P.lean = lean; P.twist = 0; P.stance = 0.32; P.crouch = crouch;
      break;
    }
    case 'dig': {
      let a, lean, twist = 0;
      if (u < 0.28) {
        const x = easeIn(u / 0.28);
        a = lerp(1.75, 0.72, x); lean = lerp(0.05, 0.3, x);
      } else if (u < 0.5) {
        const x = ease((u - 0.28) / 0.22);
        a = lerp(0.72, 1.05, x); lean = lerp(0.3, 0.2, x);
      } else if (u < 0.7) {
        const x = easeOut((u - 0.5) / 0.2);
        a = lerp(1.05, 2.2, x); lean = lerp(0.2, -0.05, x); twist = lerp(0, -0.45, x);
      } else {
        const x = ease((u - 0.7) / 0.3);
        a = lerp(2.2, 1.75, x); lean = lerp(-0.05, 0.05, x); twist = lerp(-0.45, 0, x);
      }
      P.aR = P.aL = a; P.yR = P.yL = 0.05; P.lean = lean; P.twist = twist; P.stance = 0.3;
      break;
    }
    case 'pick': {
      const s = Math.sin(u * Math.PI * 2);
      P.aR = 0.95 + 0.3 * s; P.aL = 0.95 - 0.3 * s;
      P.yR = -0.25; P.yL = 0.25;
      P.lean = 0.3 + 0.04 * Math.abs(s); P.twist = 0.08 * s; P.stance = 0.2;
      P.crouch = 0.01 + 0.006 * Math.abs(Math.sin(u * Math.PI * 4));
      break;
    }
  }
  return P;
}

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
  // the mayor's tools (see TOOL_GEO): one handle, and one head per tool kind
  handle: { geo: TOOL_GEO.handle, per: 1, cast: false },
  axe: { geo: TOOL_GEO.axe, per: 1, cast: false },
  pick: { geo: TOOL_GEO.pick, per: 1, cast: false },
  shovel: { geo: TOOL_GEO.shovel, per: 1, cast: false },
};
const TOOL_HEADS = ['axe', 'pick', 'shovel'];

const _m = new THREE.Matrix4(), _base = new THREE.Matrix4(), _upper = new THREE.Matrix4(), _l = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _pose = { aR: 0, aL: 0, yR: 0, yL: 0, lean: 0, twist: 0, stance: 0, crouch: 0 };
// lying down: tip the figure onto its back (its up axis turns to face backwards)
const _qLie = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
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
    M.handle.setColorAt(slot, c.set(look.tool || '#8a5a38'));
    for (const h of TOOL_HEADS) M[h].setColorAt(slot, c.set(look.toolHead || '#b9bec8'));
    for (const m of Object.values(M)) m.instanceColor.needsUpdate = true;
  }

  /** Recolour the tool heads (the mayor's tool tier: stone, iron, crystal...). */
  setToolColor(slot, color) {
    const c = new THREE.Color(color);
    for (const h of TOOL_HEADS) {
      this.meshes[h].setColorAt(slot, c);
      this.meshes[h].instanceColor.needsUpdate = true;
    }
  }

  hide(slot) {
    const M = this.meshes;
    for (const [name, P] of Object.entries(PARTS)) for (let k = 0; k < P.per; k++) M[name].setMatrixAt(slot * P.per + k, ZERO);
  }

  /**
   * Pose one figure. f: { pos, yaw, scale, anim, phase, umbrella, hat, long, tool }
   * anim: 'walk' | 'idle' | 'work' | 'wave' | 'dance' | 'sit' | 'talk', or a gathering animation
   * from GATHER_ANIMS ('chop' | 'mine' | 'dig' | 'pick') driven by f.u (0..1 through the loop) and
   * f.blend (0 = standing, 1 = full pose) so it eases in and out instead of snapping.
   * Arm angles are pitch around the shoulder: 0 hangs down, PI/2 points forward, PI points up.
   */
  pose(slot, f) {
    const M = this.meshes;
    _e.set(0, f.yaw, 0);
    _q.setFromEuler(_e);
    const sc = f.scale ?? 1;
    let bob = 0, lean = 0, twist = 0;
    const ph = f.phase || 0;
    let legSw = 0, armL = 0, armR = 0, yawL = 0, yawR = 0, sit = false;
    let tool = null;
    const G = GATHER_ANIMS[f.anim];
    if (G) {
      const P = gatherPose(f.anim, f.u ?? ((ph / (Math.PI * 2)) % 1), _pose);
      const w = clamp01(f.blend ?? 1);
      armR = P.aR * w; armL = P.aL * w; yawR = P.yR * w; yawL = P.yL * w;
      lean = P.lean * w; twist = P.twist * w;
      legSw = P.stance * w;
      // a split stance lowers the hips; keep the feet on the ground
      bob = -0.23 * (1 - Math.cos(legSw)) - P.crouch * w;
      if (f.tool && w > 0.05) tool = G.tool;
      P.crouch = 0;
    } else switch (f.anim) {
      case 'walk':
        legSw = Math.sin(ph) * 0.6;
        armL = -legSw * 0.8;
        armR = legSw * 0.8;
        bob = Math.abs(Math.sin(ph)) * 0.02;
        break;
      case 'work':
        // hammering / tending in front of the body
        armR = 1.15 + Math.sin(ph * 1.6) * 0.55;
        armL = 0.7 + Math.sin(ph * 1.6 + 1) * 0.3;
        lean = 0.14;
        bob = -Math.abs(Math.sin(ph * 1.6)) * 0.008;
        break;
      case 'wave':
        armR = 2.7 + Math.sin(ph * 3) * 0.3;
        yawR = 0.35;
        armL = 0.08;
        break;
      case 'dance':
        legSw = Math.sin(ph * 2) * 0.3;
        armL = 2.5 + Math.sin(ph * 2) * 0.45;
        armR = 2.5 - Math.sin(ph * 2) * 0.45;
        twist = Math.sin(ph * 2) * 0.25;
        bob = Math.abs(Math.sin(ph * 2)) * 0.06;
        break;
      case 'talk':
        armR = 0.55 + Math.sin(ph * 2.5) * 0.3;
        yawR = -0.2;
        armL = 0.08;
        break;
      case 'sit':
      case 'sitEat':
      case 'sitRead':
      case 'sitTalk':
        sit = true;
        if (f.anim === 'sitEat') {
          // spoon from the plate to the mouth and back
          const s = Math.max(0, Math.sin(ph * 1.4));
          armR = 0.9 + s * 1.2;
          yawR = -0.35 * s;
          armL = 0.75;
          lean = 0.1 - s * 0.05;
        } else if (f.anim === 'sitRead') {
          armR = armL = 1.05 + Math.sin(ph * 0.3) * 0.04;
          yawR = -0.25;
          yawL = 0.25;
          lean = 0.12;
        } else if (f.anim === 'sitTalk') {
          armR = 0.55 + Math.max(0, Math.sin(ph * 2.2)) * 0.5;
          armL = 0.45;
          twist = Math.sin(ph * 0.7) * 0.12;
        } else {
          armR = armL = 0.5;
          lean = 0.04 + Math.sin(ph * 0.6) * 0.02;
        }
        break;
      case 'cook':
        // stirring a pot: the right hand circles, the left steadies
        armR = 1.2 + Math.sin(ph * 2.4) * 0.18;
        yawR = -0.25 + Math.cos(ph * 2.4) * 0.3;
        armL = 0.9;
        yawL = 0.2;
        lean = 0.1;
        break;
      case 'sleep':
        // lying on the back, slow breathing; feet at pos, head towards -facing
        armR = armL = 0.04;
        bob = 0.09 + Math.sin(ph * 0.9) * 0.004;
        break;
      default:
        armL = Math.sin(ph * 0.5) * 0.04;
        armR = -armL;
    }
    if (f.anim === 'sleep') _q.multiply(_qLie);
    _base.compose(_v.set(f.pos.x, f.pos.y + bob * sc - (sit ? 0.06 * sc : 0), f.pos.z), _q, _s.set(sc, sc, sc));
    // the upper body can turn on the hips (wind-ups, dancing)
    _upper.copy(_base);
    if (twist) _upper.multiply(_l.makeRotationY(twist));

    const set = (mesh, i, x, y, z, rz = 0, ry = 0, frame = _base) => {
      _e.set(0, ry, rz);
      _q.setFromEuler(_e);
      _l.compose(_v.set(x, y, z), _q, _s.set(1, 1, 1));
      _m.multiplyMatrices(frame, _l);
      mesh.setMatrixAt(i, _m);
    };
    if (sit) {
      set(M.leg, slot * 2, 0, 0.2, 0.045, Math.PI / 2);
      set(M.leg, slot * 2 + 1, 0, 0.2, -0.045, Math.PI / 2);
    } else {
      set(M.leg, slot * 2, 0, 0.23, 0.045, legSw);
      set(M.leg, slot * 2 + 1, 0, 0.23, -0.045, -legSw);
    }
    const ly = 0.34, lx = lean * 0.12, U = _upper;
    set(M.body, slot, lx * 0.5, ly, 0, -lean, 0, U);
    set(M.head, slot, lx, 0.515, 0, -lean, 0, U);
    set(M.hair, slot, lx - 0.01, 0.575, 0, -lean, 0, U);
    if (f.long) set(M.hairBack, slot, lx - 0.05, 0.5, 0, -lean, 0, U);
    else M.hairBack.setMatrixAt(slot, ZERO);
    if (f.hat) set(M.hat, slot, lx - 0.005, 0.61, 0, -lean, 0, U);
    else M.hat.setMatrixAt(slot, ZERO);
    if (f.umbrella && !G) {
      set(M.arm, slot * 2 + 1, lx, 0.44, -0.12, 1.05, 0, U);
      set(M.umbrella, slot, 0.06, 0.5, -0.04, 0, 0, U);
    } else {
      set(M.arm, slot * 2 + 1, lx, 0.44, -0.12, armR, yawR, U);
      M.umbrella.setMatrixAt(slot, ZERO);
    }
    set(M.arm, slot * 2, lx, 0.44, 0.12, armL, yawL, U);
    // the tool is modelled in the tool arm's space, so it follows the swing exactly
    if (tool) set(M.handle, slot, lx, 0.44, -0.12, armR, yawR, U);
    else M.handle.setMatrixAt(slot, ZERO);
    for (const h of TOOL_HEADS) {
      if (h === tool) set(M[h], slot, lx, 0.44, -0.12, armR, yawR, U);
      else M[h].setMatrixAt(slot, ZERO);
    }
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
