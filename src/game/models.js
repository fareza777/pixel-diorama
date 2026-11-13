// Procedural models for buildings, nature nodes and props. Everything is built from primitives with
// vertex colours and merged into one mesh per shared material, so a building costs 1-4 draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, fxMaterial, shared } from '../engine/materials.js';
import { paint, clean, jitter, pineGeometry, bushGeometry, rockGeometry, rng } from '../engine/kit.js';
import { STYLE, PAINTS } from './data.js';

// ---------------------------------------------------------------- shared materials

const MATS = {};
function sharedMat(key, make) {
  if (!MATS[key]) {
    MATS[key] = make();
    MATS[key].userData.shared = true;
  }
  return MATS[key];
}
export const mats = {
  solid: () => sharedMat('solid', () => toon('#ffffff', { vertexColors: true, noise: 0.12, noiseScale: 3.2 })),
  rough: () => sharedMat('rough', () => toon('#ffffff', { vertexColors: true, noise: 0.22, noiseScale: 5.5 })),
  smooth: () => sharedMat('smooth', () => toon('#ffffff', { vertexColors: true, noise: 0.03, snow: 0.6 })),
  leaf: () => sharedMat('leaf', () => toon('#ffffff', { vertexColors: true, ramp: 'foliage', wind: 0.05, noise: 0.18, noiseScale: 4, foliage: 1 })),
  crop: () => sharedMat('crop', () => toon('#ffffff', { vertexColors: true, ramp: 'foliage', wind: 0.9, noise: 0.1, noiseScale: 6, snow: 0.6, foliage: 0.85 })),
  win: () =>
    sharedMat('win', () =>
      toon('#ffffff', {
        vertexColors: true, noise: 0.16, noiseScale: 5,
        windows: { size: [0.25, 0.3], offset: [0.125, 0.125], frac: [0.5, 0.56], base: 0.42, top: 60, lit: 0.72 },
      }),
    ),
  glow: (color = '#ffc36b', power = 5, day = '#2a3247', always = false) =>
    sharedMat(`glow:${color}:${power}:${day}:${always}`, () => toon(day, { emissive: color, emissiveIntensity: power, lamp: !always, noise: 0, snow: 0, wet: 0 })),
  water: () => sharedMat('fwater', () => toon('#6fd0e8', { emissive: '#2a7fa8', emissiveIntensity: 0.25, noise: 0.05, snow: 0, wet: 0 })),
};

// ---------------------------------------------------------------- builder

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

function xf(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  // yaw last, so tilted parts (roof slabs) keep their tilt when the whole roof is turned
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  geo.applyMatrix4(_m);
  return geo;
}

/** Collects painted primitives per material bucket and bakes them into a group. */
export class Builder {
  constructor() {
    this.parts = new Map();
    this.lights = [];
    this.smoke = [];
    this.keep = [];
  }
  add(bucket, geo, color, t) {
    const g = clean(geo);
    paint(g, color);
    xf(g, t);
    if (!this.parts.has(bucket)) this.parts.set(bucket, []);
    this.parts.get(bucket).push(g);
    return g;
  }
  /** box with its base at y */
  box(w, h, d, color, x = 0, y = 0, z = 0, t = {}, bucket = 'solid') {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    return this.add(bucket, g, color, { x, y, z, ...t });
  }
  cyl(rt, rb, h, color, x = 0, y = 0, z = 0, t = {}, bucket = 'solid', seg = 8) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    g.translate(0, h / 2, 0);
    return this.add(bucket, g, color, { x, y, z, ...t });
  }
  cone(r, h, color, x = 0, y = 0, z = 0, t = {}, bucket = 'solid', seg = 8) {
    const g = new THREE.ConeGeometry(r, h, seg);
    g.translate(0, h / 2, 0);
    const n = g.toNonIndexed();
    n.computeVertexNormals();
    return this.add(bucket, n, color, { x, y, z, ...t });
  }
  ball(r, color, x = 0, y = 0, z = 0, t = {}, bucket = 'solid', detail = 1) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    return this.add(bucket, g, color, { x, y, z, ...t });
  }
  dome(r, color, x = 0, y = 0, z = 0, t = {}, bucket = 'solid', seg = 10) {
    const g = new THREE.SphereGeometry(r, seg, Math.max(3, seg >> 1), 0, Math.PI * 2, 0, Math.PI / 2);
    return this.add(bucket, g, color, { x, y, z, ...t });
  }
  /** triangular prism, ridge along x, base at y */
  prism(w, d, h, color, x = 0, y = 0, z = 0, t = {}, bucket = 'solid') {
    const hw = w / 2, hd = d / 2;
    const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], D = [-hw, 0, hd], R1 = [-hw, h, 0], R2 = [hw, h, 0];
    const tris = [D, C, R2, D, R2, R1, B, A, R1, B, R1, R2, A, D, R1, C, B, R2];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
    g.computeVertexNormals();
    return this.add(bucket, g, color, { x, y, z, ...t });
  }
  /** gabled roof: wall-coloured gable ends plus two roof slabs, ridge along x */
  gable(w, d, top, wall, roof, { pitch = 0.6, over = 0.08, thick = 0.06, x = 0, z = 0, ry = 0 } = {}) {
    const rh = (d / 2) * Math.tan(pitch);
    const g = new THREE.Group();
    this.prism(w, d, rh, wall, x, top, z, { ry });
    const slabLen = (d / 2 + over) / Math.cos(pitch);
    const mid = (d / 2 + over) / 2;
    for (const s of [-1, 1]) {
      const geo = new THREE.BoxGeometry(w + over * 2, thick, slabLen);
      const lz = s * mid, ly = top + rh - mid * Math.tan(pitch) + thick * 0.6;
      // rotate the local offset with the roof
      const cx = x + Math.sin(ry) * lz, cz = z + Math.cos(ry) * lz;
      this.add('rough', geo, roof, { x: cx, y: ly, z: cz, rx: s * pitch, ry });
    }
    return top + rh;
  }
  /** four-sided pyramid roof (hip), base at y */
  hip(w, h, color, x = 0, y = 0, z = 0, bucket = 'rough') {
    const g = new THREE.ConeGeometry(w * 0.72, h, 4);
    g.translate(0, h / 2, 0);
    const n = g.toNonIndexed();
    n.computeVertexNormals();
    return this.add(bucket, n, color, { x, y, z, ry: Math.PI / 4 });
  }
  glowBox(w, h, d, color, power, x, y, z, t = {}, day = '#2a3247', always = false) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    return this.add(`glow|${color}|${power}|${day}|${always ? 1 : 0}`, g, '#ffffff', { x, y, z, ...t });
  }
  glowBall(r, color, power, x, y, z, day = '#59627a', always = false) {
    return this.add(`glow|${color}|${power}|${day}|${always ? 1 : 0}`, new THREE.IcosahedronGeometry(r, 1), '#ffffff', { x, y, z });
  }
  light(x, y, z, color = '#ffbe6b', power = 2.2) {
    this.lights.push({ pos: new THREE.Vector3(x, y, z), color, power });
  }
  /** a separate animated mesh (not merged) */
  part(obj) {
    this.keep.push(obj);
    return obj;
  }
  build() {
    const group = new THREE.Group();
    for (const [bucket, geos] of this.parts) {
      const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      let mat;
      if (bucket.startsWith('glow|')) {
        const [, color, power, day, always] = bucket.split('|');
        mat = mats.glow(color, +power, day, always === '1');
      } else mat = (mats[bucket] || mats.solid)();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = !bucket.startsWith('glow') && bucket !== 'crop';
      m.receiveShadow = true;
      group.add(m);
    }
    for (const k of this.keep) group.add(k);
    group.userData.lights = this.lights;
    group.userData.smoke = this.smoke;
    return group;
  }
}

// ---------------------------------------------------------------- palette helpers

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return '#' + c.getHexString();
};
export function colorsFor(biome, paintIdx = 0) {
  const st = STYLE[biome] || STYLE.desa;
  const p = PAINTS[paintIdx] || PAINTS[0];
  return { wall: p.wall || st.wall, roof: p.roof || st.roof, trim: st.trim, stone: st.stone };
}

const WOOD = '#9a6a46', WOOD_D = '#6b4a33', DARK = '#2c3140', LEAF = '#4d8f45', LEAF2 = '#3d7a4b';

// ---------------------------------------------------------------- houses by biome

function door(b, x, z, ry, color, h = 0.3, w = 0.16) {
  b.box(w, h, 0.04, color, x, 0.05, z, { ry });
}
function windowPane(b, x, y, z, ry, frame, s = 0.14) {
  b.box(s + 0.05, s + 0.05, 0.03, frame, x, y - 0.025, z, { ry });
  b.glowBox(s, s, 0.04, '#ffc36b', 4.5, x, y, z, { ry });
}

function houseCottage(b, c, level) {
  const w = 0.74, d = 0.58, wallH = 0.4 + (level - 1) * 0.24;
  b.box(w + 0.08, 0.06, d + 0.08, c.stone, 0, 0, 0, {}, 'rough');
  b.box(w, wallH, d, c.wall, 0, 0.06, 0);
  if (level >= 2) b.box(w + 0.02, 0.03, d + 0.02, c.trim, 0, 0.06 + 0.4, 0);
  const top = 0.06 + wallH;
  b.gable(w, d, top, c.wall, c.roof, { pitch: 0.62 });
  door(b, 0.16, d / 2 + 0.01, 0, c.trim);
  windowPane(b, -0.16, 0.24, d / 2 + 0.01, 0, c.trim);
  windowPane(b, w / 2 + 0.01, 0.24, 0, Math.PI / 2, c.trim);
  if (level >= 2) {
    windowPane(b, -0.16, 0.5, d / 2 + 0.01, 0, c.trim);
    windowPane(b, 0.16, 0.5, d / 2 + 0.01, 0, c.trim);
  }
  b.box(0.11, 0.3, 0.11, c.stone, -0.22, top + 0.04, -0.12, {}, 'rough');
  b.smoke.push(new THREE.Vector3(-0.22, top + 0.4, -0.12));
  b.light(0.2, 0.32, d / 2 + 0.3);
  if (level >= 3) {
    // garden fence and flower boxes
    for (let k = -3; k <= 3; k++) b.box(0.03, 0.12, 0.03, '#efe6d6', k * 0.12, 0, 0.45);
    b.box(0.76, 0.025, 0.02, '#efe6d6', 0, 0.08, 0.45);
    for (let k = 0; k < 4; k++) b.ball(0.04, ['#ff8fb1', '#ffd85c', '#b58cff', '#f4f1ea'][k], -0.3 + k * 0.08, 0.06, 0.38, {}, 'leaf', 0);
  }
}

function houseCabin(b, c, level) {
  const w = 0.72, d = 0.56, wallH = 0.38 + (level - 1) * 0.22;
  b.box(w + 0.06, 0.05, d + 0.06, c.stone, 0, 0, 0, {}, 'rough');
  const logs = Math.round(wallH / 0.07);
  for (let k = 0; k < logs; k++) b.box(w + (k % 2 ? 0.04 : 0), 0.07, d + (k % 2 ? 0 : 0.04), k % 2 ? c.wall : shade(c.wall, 0.86), 0, 0.05 + k * 0.07, 0, {}, 'rough');
  const top = 0.05 + logs * 0.07;
  b.gable(w, d, top, shade(c.wall, 0.9), c.roof, { pitch: 0.78, over: 0.1 });
  door(b, 0.14, d / 2 + 0.02, 0, c.trim, 0.3);
  windowPane(b, -0.16, 0.24, d / 2 + 0.02, 0, c.trim);
  windowPane(b, w / 2 + 0.02, 0.26, 0.05, Math.PI / 2, c.trim);
  // porch
  b.box(w, 0.04, 0.2, WOOD, 0, 0.04, d / 2 + 0.1);
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) b.box(0.035, 0.34, 0.035, WOOD_D, x, 0.05, d / 2 + 0.18);
  b.box(0.12, 0.34, 0.12, c.stone, w / 2 - 0.14, top - 0.05, -0.1, {}, 'rough');
  b.smoke.push(new THREE.Vector3(w / 2 - 0.14, top + 0.4, -0.1));
  b.light(0.15, 0.3, d / 2 + 0.35);
  if (level >= 3) for (let k = 0; k < 3; k++) b.cyl(0.035, 0.035, 0.3, '#8a5a38', -0.45, 0.04 + k * 0.07, -0.2 + k * 0.02, { rz: Math.PI / 2 });
}

function houseStilt(b, c, level) {
  const w = 0.7, d = 0.56, lift = 0.22, wallH = 0.34 + (level - 1) * 0.18;
  for (const [x, z] of [[-0.3, -0.24], [0.3, -0.24], [-0.3, 0.24], [0.3, 0.24]]) b.cyl(0.03, 0.035, lift + 0.02, WOOD_D, x, 0, z);
  b.box(w + 0.14, 0.05, d + 0.14, WOOD, 0, lift, 0);
  const stripes = 5;
  for (let k = 0; k < stripes; k++) b.box(w / stripes - 0.005, wallH, d, k % 2 ? c.wall : shade(c.wall, 0.9), -w / 2 + (k + 0.5) * (w / stripes), lift + 0.05, 0);
  b.hip(w + 0.36, 0.42 + level * 0.04, c.roof, 0, lift + 0.05 + wallH, 0);
  door(b, 0.12, d / 2 + 0.01, 0, c.trim, 0.26);
  windowPane(b, -0.16, lift + 0.2, d / 2 + 0.01, 0, c.trim, 0.12);
  windowPane(b, w / 2 + 0.01, lift + 0.2, 0, Math.PI / 2, c.trim, 0.12);
  // ladder
  for (let k = 0; k < 3; k++) b.box(0.16, 0.02, 0.03, WOOD, 0.12, 0.04 + k * 0.07, d / 2 + 0.16);
  b.light(0.12, lift + 0.3, d / 2 + 0.3);
  if (level >= 2) b.box(0.3, 0.02, 0.22, '#ffffff', -0.25, lift + 0.05, d / 2 + 0.13, {}, 'smooth');
  if (level >= 3) b.cyl(0.02, 0.02, 0.5, WOOD_D, 0.45, 0, 0.42), b.cone(0.22, 0.1, '#e94f4f', 0.45, 0.48, 0.42, {}, 'smooth', 8);
}

function houseChalet(b, c, level) {
  const w = 0.74, d = 0.6, base = 0.2, wallH = 0.3 + (level - 1) * 0.22;
  b.box(w + 0.04, base, d + 0.04, c.stone, 0, 0, 0, {}, 'rough');
  b.box(w, wallH, d, c.wall, 0, base, 0, {}, 'rough');
  const top = base + wallH;
  b.gable(d, w, top, c.wall, c.roof, { pitch: 0.95, over: 0.1, ry: Math.PI / 2 });
  door(b, 0, d / 2 + 0.02, 0, c.trim, 0.26);
  windowPane(b, -0.2, base + 0.12, d / 2 + 0.02, 0, c.trim);
  windowPane(b, 0.2, base + 0.12, d / 2 + 0.02, 0, c.trim);
  windowPane(b, 0, top + 0.12, d / 2 + 0.02, 0, c.trim, 0.12);
  // balcony
  b.box(w + 0.1, 0.03, 0.14, WOOD, 0, top - 0.02, d / 2 + 0.07);
  b.box(w + 0.1, 0.08, 0.02, WOOD_D, 0, top, d / 2 + 0.14);
  b.box(0.12, 0.42, 0.12, c.stone, -0.24, top, -0.1, {}, 'rough');
  b.smoke.push(new THREE.Vector3(-0.24, top + 0.5, -0.1));
  b.light(0, 0.3, d / 2 + 0.35, '#ffb05a');
  if (level >= 3) for (let k = 0; k < 4; k++) b.cyl(0.03, 0.03, 0.22, '#7a5236', 0.46, 0.0 + k * 0.06, -0.15 + (k % 2) * 0.03, { rx: Math.PI / 2 });
}

function houseAdobe(b, c, level) {
  const w = 0.72, d = 0.6, wallH = 0.38;
  b.box(w, wallH, d, c.wall, 0, 0, 0, {}, 'rough');
  b.box(w + 0.04, 0.06, d + 0.04, shade(c.wall, 0.92), 0, wallH, 0, {}, 'rough');
  for (let k = -2; k <= 2; k++) b.cyl(0.018, 0.018, 0.1, WOOD_D, k * 0.14, wallH - 0.08, d / 2 + 0.03, { rx: Math.PI / 2 });
  door(b, 0.14, d / 2 + 0.01, 0, '#5a3a22', 0.27, 0.15);
  windowPane(b, -0.16, 0.2, d / 2 + 0.01, 0, c.trim, 0.11);
  windowPane(b, w / 2 + 0.01, 0.2, 0, Math.PI / 2, c.trim, 0.11);
  let top = wallH + 0.06;
  if (level >= 2) {
    b.box(w * 0.55, 0.3, d * 0.6, c.wall, -0.12, top, -0.08, {}, 'rough');
    windowPane(b, -0.12, top + 0.13, -0.08 + d * 0.3 + 0.01, 0, c.trim, 0.1);
    b.box(w * 0.57, 0.05, d * 0.62, shade(c.wall, 0.92), -0.12, top + 0.3, -0.08, {}, 'rough');
  }
  if (level >= 3) {
    b.box(0.3, 0.02, 0.3, c.roof, 0.18, top + 0.32, 0.1, {}, 'smooth');
    for (const [x, z] of [[0.05, -0.02], [0.31, -0.02], [0.05, 0.22], [0.31, 0.22]]) b.cyl(0.012, 0.012, 0.32, WOOD_D, x, top, z);
  }
  b.cyl(0.06, 0.05, 0.12, c.roof, w / 2 + 0.08, 0, 0.2);
  b.light(0.14, 0.3, d / 2 + 0.32, '#ffb05a');
}

function houseTown(b, c, level) {
  const w = 0.75, d = 0.75, h = 0.9 + level * 0.36;
  b.box(w, h, d, c.wall, 0, 0, 0, {}, 'win');
  b.box(w + 0.05, 0.06, d + 0.05, c.trim, 0, h, 0);
  b.box(w + 0.02, 0.1, d + 0.02, c.wall, 0, h + 0.06, 0);
  b.box(0.2, 0.14, 0.16, '#b9bcc4', 0.12, h + 0.06, -0.1, {}, 'smooth');
  b.glowBox(0.2, 0.26, 0.04, '#ffd9a0', 4, 0, 0.0, d / 2 + 0.01, {}, '#2b3346');
  b.box(0.34, 0.03, 0.14, c.roof, 0, 0.3, d / 2 + 0.07, { rx: 0.3 });
  b.light(0, 0.3, d / 2 + 0.3, '#ffd28a');
}

function houseMushroom(b, c, level) {
  const r = 0.26 + level * 0.03, h = 0.36 + level * 0.1;
  b.cyl(r * 0.9, r, h, c.wall, 0, 0, 0, {}, 'smooth', 10);
  b.dome(r + 0.2, c.roof, 0, h - 0.04, 0, { sy: 0.7 }, 'smooth', 12);
  const rr = rng(level * 13);
  for (let k = 0; k < 7; k++) {
    const a = rr() * Math.PI * 2, el = 0.25 + rr() * 0.9;
    b.ball(0.035, '#fff7ee', Math.cos(a) * Math.cos(el) * (r + 0.2), h - 0.04 + Math.sin(el) * (r + 0.2) * 0.7, Math.sin(a) * Math.cos(el) * (r + 0.2), {}, 'smooth', 0);
  }
  b.box(0.12, 0.2, 0.04, c.trim, 0, 0, r - 0.01);
  b.glowBall(0.05, '#9dfcff', 5, r * 0.75, 0.24, r * 0.55, '#6a5aa0');
  b.glowBall(0.05, '#ff9de3', 5, -r * 0.75, 0.22, r * 0.55, '#6a5aa0');
  b.light(0, 0.3, r + 0.3, '#c9a0ff');
}

const HOUSE = { desa: houseCottage, hutan: houseCabin, pantai: houseStilt, gunung: houseChalet, gurun: houseAdobe, kota: houseTown, fantasi: houseMushroom };

// ---------------------------------------------------------------- trees (shared by nodes and decorations)

export function treeParts(b, kind, rand, s = 1, x = 0, z = 0) {
  if (kind === 'pine') {
    const leafA = '#2f6a46', leafB = '#3d8150';
    b.cyl(0.05 * s, 0.07 * s, 0.4 * s, '#6a4630', x, 0, z);
    for (let k = 0; k < 3; k++) b.cone((0.42 - k * 0.1) * s, (0.5 - k * 0.06) * s, k % 2 ? leafB : leafA, x, (0.3 + k * 0.3) * s, z, { ry: rand() }, 'leaf', 7);
  } else if (kind === 'palm') {
    const segs = 5;
    for (let k = 0; k < segs; k++) b.cyl(0.045 * s, 0.055 * s, 0.2 * s, k % 2 ? '#a77c52' : '#8a6040', x + k * 0.03 * s, k * 0.19 * s, z);
    const tx = x + segs * 0.03 * s, ty = segs * 0.19 * s;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + rand() * 0.3;
      const g = new THREE.BoxGeometry(0.5 * s, 0.02 * s, 0.12 * s);
      g.translate(0.25 * s, 0, 0);
      b.add('leaf', g, k % 2 ? '#4f9a3c' : '#3f8a35', { x: tx, y: ty, z, ry: a, rz: -0.45 });
    }
    b.ball(0.05 * s, '#6b4a2b', tx + 0.04, ty - 0.05, z + 0.03, {}, 'solid', 0);
  } else if (kind === 'cactus') {
    b.cyl(0.08 * s, 0.09 * s, 0.6 * s, '#5f9a4c', x, 0, z, {}, 'leaf', 7);
    b.cyl(0.05 * s, 0.05 * s, 0.22 * s, '#5f9a4c', x + 0.12 * s, 0.22 * s, z, {}, 'leaf', 6);
    b.cyl(0.05 * s, 0.05 * s, 0.12 * s, '#5f9a4c', x + 0.08 * s, 0.2 * s, z, { rz: Math.PI / 2 }, 'leaf', 6);
    b.cyl(0.045 * s, 0.045 * s, 0.18 * s, '#68a756', x - 0.11 * s, 0.3 * s, z, {}, 'leaf', 6);
    b.ball(0.035 * s, '#ff8fb1', x, 0.62 * s, z, {}, 'leaf', 0);
  } else if (kind === 'mushroom') {
    b.cyl(0.07 * s, 0.09 * s, 0.42 * s, '#f1e6d2', x, 0, z, {}, 'smooth', 8);
    b.dome(0.3 * s, rand() < 0.5 ? '#e0524a' : '#b56cff', x, 0.4 * s, z, { sy: 0.6 }, 'smooth', 10);
    b.ball(0.04 * s, '#fff7ee', x + 0.12 * s, 0.52 * s, z + 0.08 * s, {}, 'smooth', 0);
    b.ball(0.035 * s, '#fff7ee', x - 0.1 * s, 0.55 * s, z - 0.06 * s, {}, 'smooth', 0);
  } else if (kind === 'crystaltree') {
    b.cyl(0.05 * s, 0.07 * s, 0.45 * s, '#7a5aa0', x, 0, z);
    for (let k = 0; k < 4; k++) b.ball((0.22 - k * 0.03) * s, k % 2 ? '#c9a0ff' : '#9a7bff', x + (rand() - 0.5) * 0.2 * s, (0.5 + k * 0.12) * s, z + (rand() - 0.5) * 0.2 * s, {}, 'leaf', 0);
  } else {
    // round deciduous tree
    b.cyl(0.05 * s, 0.07 * s, 0.45 * s, '#6a4630', x, 0, z);
    const leaf = [LEAF, '#5a9e4b', LEAF2][Math.floor(rand() * 3)];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + rand();
      b.ball((0.2 + rand() * 0.08) * s, leaf, x + Math.cos(a) * 0.1 * s, (0.55 + rand() * 0.15) * s, z + Math.sin(a) * 0.1 * s, {}, 'leaf', 1);
    }
  }
}

// ---------------------------------------------------------------- other buildings

function balai(b, c, level, biome) {
  b.box(1.8, 0.08, 1.8, c.stone, 0, 0, 0, {}, 'rough');
  b.box(1.5, 0.06, 1.2, shade(c.stone, 1.1), 0, 0.08, 0.1, {}, 'rough');
  if (biome === 'kota') {
    b.box(1.25, 0.9, 0.9, c.wall, 0, 0.14, -0.05, {}, 'win');
    b.box(1.35, 0.08, 1.0, c.trim, 0, 1.04, -0.05);
    for (let k = -2; k <= 2; k++) b.cyl(0.04, 0.04, 0.5, '#efe6d6', k * 0.24, 0.14, 0.5);
    b.box(1.3, 0.06, 0.2, '#efe6d6', 0, 0.64, 0.5);
    b.prism(1.3, 0.24, 0.16, '#efe6d6', 0, 0.7, 0.5);
  } else {
    const wallH = 0.55;
    b.box(1.3, wallH, 0.9, c.wall, 0, 0.14, -0.05);
    b.gable(1.3, 0.9, 0.14 + wallH, c.wall, c.roof, { pitch: 0.6, over: 0.1, z: -0.05 });
    for (let k = -1; k <= 1; k++) windowPane(b, k * 0.4, 0.38, 0.41, 0, c.trim, 0.16);
    b.box(0.22, 0.34, 0.04, c.trim, 0.0, 0.14, 0.41);
    // bell tower
    b.box(0.26, 0.4, 0.26, c.wall, 0, 0.9, -0.05);
    b.hip(0.36, 0.3, c.roof, 0, 1.3, -0.05);
  }
  b.cyl(0.015, 0.015, 0.9, DARK, 0.75, 0.08, 0.7);
  const flag = new THREE.Group();
  flag.add(partMesh(new THREE.BoxGeometry(0.22, 0.12, 0.01).translate(0.11, 0.06, 0), '#e94f4f', mats.smooth()));
  flag.position.set(0.755, 0.8, 0.7);
  flag.userData.flag = 1;
  b.part(flag);
  b.glowBox(0.1, 0.12, 0.1, '#ffc36b', 6, -0.75, 0.6, 0.7);
  b.cyl(0.03, 0.04, 0.6, DARK, -0.75, 0, 0.7);
  b.light(-0.75, 0.7, 0.7);
  b.light(0, 0.4, 0.75);
}

function vila(b, c, level) {
  b.box(1.85, 0.04, 1.85, '#6eb156', 0, 0, 0, {}, 'leaf');
  const h = 0.45 + (level - 1) * 0.2;
  b.box(1.1, h, 0.6, c.wall, -0.2, 0.04, -0.35);
  b.gable(1.1, 0.6, 0.04 + h, c.wall, c.roof, { x: -0.2, z: -0.35 });
  b.box(0.55, h, 0.8, c.wall, 0.45, 0.04, 0.05);
  b.gable(0.8, 0.55, 0.04 + h, c.wall, c.roof, { x: 0.45, z: 0.05, ry: Math.PI / 2 });
  for (const x of [-0.5, -0.15]) windowPane(b, x, 0.28, -0.04, 0, c.trim, 0.15);
  windowPane(b, 0.73, 0.28, 0.1, Math.PI / 2, c.trim, 0.15);
  door(b, 0.3, 0.46, 0, c.trim, 0.32);
  // pool + hedge
  b.box(0.55, 0.05, 0.45, '#4ab0d8', -0.45, 0.02, 0.45, {}, 'smooth');
  for (let k = 0; k < 7; k++) b.box(0.22, 0.12, 0.12, LEAF2, -0.8 + k * 0.27, 0.02, 0.86, {}, 'leaf');
  b.light(0.3, 0.35, 0.75);
  b.light(-0.4, 0.35, 0.1);
}

function apartemen(b, c, level) {
  const h = 1.6 + level * 0.6;
  b.box(0.75, h, 0.75, c.wall, 0, 0, 0, {}, 'win');
  b.box(0.8, 0.06, 0.8, c.trim, 0, h, 0);
  b.cyl(0.1, 0.1, 0.18, '#a8714a', -0.15, h + 0.06, -0.15, {}, 'rough');
  b.cone(0.12, 0.06, '#7a5236', -0.15, h + 0.24, -0.15);
  b.glowBox(0.22, 0.28, 0.04, '#ffe0a8', 4, 0, 0, 0.39, {}, '#2b3346');
  b.light(0, 0.3, 0.6, '#ffd28a');
}

function ladang(b, c, level, biome) {
  const soil = biome === 'gurun' ? '#b88a56' : biome === 'gunung' ? '#7e6a5a' : '#7a5236';
  b.box(1.8, 0.05, 1.8, soil, 0, 0, 0, {}, 'rough');
  const crop = level >= 3 ? '#e2b33c' : level === 2 ? '#c8c24a' : '#7fb84e';
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    b.box(1.5, 0.04, 0.12, shade(soil, 0.8), 0.1, 0.05, -0.65 + r * 0.26, {}, 'rough');
    for (let k = 0; k < 8; k++) {
      const g = new THREE.ConeGeometry(0.06, 0.2, 4);
      g.translate(0, 0.1, 0);
      b.add('crop', g, k % 2 ? crop : shade(crop, 0.9), { x: -0.55 + k * 0.19, y: 0.08, z: -0.65 + r * 0.26 });
    }
  }
  // shed + a bird-scaring pole with a red flag and shiny tins (no figure)
  b.box(0.32, 0.26, 0.3, WOOD, -0.72, 0.05, 0.7);
  b.prism(0.32, 0.3, 0.14, c.roof, -0.72, 0.31, 0.7);
  b.cyl(0.015, 0.015, 0.5, WOOD_D, 0.75, 0.05, 0.75);
  b.box(0.26, 0.03, 0.03, WOOD_D, 0.75, 0.32, 0.75);
  b.box(0.14, 0.09, 0.01, '#c94a3d', 0.83, 0.47, 0.75);
  for (const sx of [-1, 1]) b.cyl(0.02, 0.02, 0.05, '#c8ccd4', 0.75 + sx * 0.11, 0.25, 0.75, {}, 'smooth', 6);
}

function penebang(b, c, level) {
  b.box(0.85, 0.04, 0.85, '#8a6a4a', 0, 0, 0, {}, 'rough');
  b.box(0.48, 0.32, 0.4, c.wall === STYLE.desa.wall ? WOOD : c.wall, -0.12, 0.04, -0.14, {}, 'rough');
  b.prism(0.5, 0.42, 0.16, c.roof, -0.12, 0.36, -0.14);
  door(b, -0.12, 0.07, 0, WOOD_D, 0.24);
  for (let k = 0; k < 3 + level; k++) b.cyl(0.05, 0.05, 0.36, k % 2 ? '#a77c52' : '#8a6040', 0.25, 0.09 + (k % 3) * 0.09, -0.05 + Math.floor(k / 3) * 0.1, { rx: Math.PI / 2 });
  b.cyl(0.08, 0.09, 0.1, '#8a6040', 0.15, 0.04, 0.3);
  b.box(0.02, 0.14, 0.02, WOOD_D, 0.15, 0.14, 0.3, { rz: 0.4 });
  b.light(0, 0.3, 0.35);
}

function tambang(b, c, level) {
  b.box(0.85, 0.04, 0.85, '#8d909b', 0, 0, 0, {}, 'rough');
  const rr = rng(7);
  for (let k = 0; k < 5 + level; k++) {
    const g = new THREE.IcosahedronGeometry(0.12 + rr() * 0.1, 0);
    jitter(g, 0.05, k);
    g.computeVertexNormals();
    b.add('rough', g, k % 2 ? '#8d909b' : '#a3a6b0', { x: -0.25 + rr() * 0.5, y: 0.08 + rr() * 0.12, z: -0.3 + rr() * 0.25 });
  }
  b.box(0.3, 0.3, 0.06, '#1f2230', 0, 0.04, -0.12);
  for (const x of [-0.17, 0.17]) b.box(0.05, 0.36, 0.06, WOOD_D, x, 0.04, -0.08);
  b.box(0.42, 0.06, 0.07, WOOD_D, 0, 0.38, -0.08);
  b.box(0.22, 0.1, 0.14, '#6a6e78', 0.2, 0.08, 0.25);
  b.box(0.18, 0.06, 0.1, '#a3a6b0', 0.2, 0.18, 0.25, {}, 'rough');
  b.glowBox(0.06, 0.08, 0.06, '#ffc36b', 5, -0.2, 0.32, -0.04);
  b.light(-0.2, 0.36, 0.1);
}

function nelayan(b, c) {
  // hut on land, pier toward +z (rotated to face the water when placed)
  b.box(0.42, 0.28, 0.36, c.wall === STYLE.kota.wall ? WOOD : c.wall, -0.15, 0.03, -0.18);
  b.prism(0.46, 0.4, 0.16, c.roof, -0.15, 0.31, -0.18);
  b.box(0.36, 0.04, 1.2, WOOD, 0.15, 0.02, 0.35);
  for (const z of [0.4, 0.8]) for (const x of [0.0, 0.3]) b.cyl(0.025, 0.025, 0.6, WOOD_D, x, -0.55, z);
  b.box(0.12, 0.1, 0.12, '#a8794c', 0.08, 0.06, 0.1);
  b.cyl(0.05, 0.05, 0.12, '#8a5a38', 0.25, 0.06, 0.2);
  b.cyl(0.012, 0.012, 0.45, WOOD_D, 0.28, 0.06, 0.85, { rx: -0.5 });
  b.glowBox(0.07, 0.09, 0.07, '#ffc36b', 5, 0.28, 0.3, 0.92);
  b.light(0.25, 0.4, 0.9);
}

function bijih(b, c, level) {
  b.box(0.9, 0.04, 0.9, '#6a6e78', 0, 0, 0, {}, 'rough');
  const g = new THREE.IcosahedronGeometry(0.45, 1);
  jitter(g, 0.08, 3);
  g.scale(1, 0.6, 1);
  g.computeVertexNormals();
  b.add('rough', g, '#7d808b', { x: -0.1, y: 0.04, z: -0.15 });
  b.box(0.24, 0.26, 0.2, '#1f2230', 0.0, 0.04, 0.12);
  for (const x of [-0.14, 0.14]) b.box(0.05, 0.3, 0.05, WOOD_D, x, 0.04, 0.22);
  b.box(0.34, 0.05, 0.06, WOOD_D, 0, 0.32, 0.22);
  for (const x of [-0.06, 0.06]) b.box(0.02, 0.02, 0.5, '#5a5e68', x, 0.05, 0.42);
  b.box(0.18, 0.1, 0.14, '#5a5e68', 0, 0.08, 0.36);
  b.ball(0.06, '#c97a4a', 0.02, 0.2, 0.36, {}, 'rough', 0);
  b.glowBox(0.05, 0.07, 0.05, '#ffc36b', 5, 0.2, 0.3, 0.24);
  b.light(0.2, 0.32, 0.4);
  if (level >= 2) b.cyl(0.06, 0.06, 0.4, '#5a5e68', 0.3, 0.04, -0.3);
}

function pasir(b, c, level) {
  b.box(0.85, 0.04, 0.85, '#d8bf8a', 0, 0, 0, {}, 'rough');
  b.dome(0.35, '#e8d3a0', -0.12, 0.04, -0.12, { sy: 0.55 }, 'rough');
  for (const [x, z] of [[0.15, 0.1], [0.4, 0.1], [0.15, 0.35], [0.4, 0.35]]) b.box(0.03, 0.28, 0.03, WOOD_D, x, 0.04, z);
  b.box(0.3, 0.03, 0.3, '#c9b48a', 0.275, 0.28, 0.225, {}, 'rough');
  b.cyl(0.05, 0.04, 0.08, '#4a7ab0', -0.3, 0.04, 0.3);
  b.cyl(0.05, 0.04, 0.08, '#c94a3d', -0.18, 0.04, 0.35);
  if (level >= 2) b.cyl(0.01, 0.01, 0.4, WOOD_D, 0.38, 0.04, -0.3), b.box(0.16, 0.1, 0.01, c.roof, 0.46, 0.34, -0.3);
}

function kristal(b, c, level) {
  b.cyl(0.32, 0.36, 0.08, '#8a7fc0', 0, 0, 0, {}, 'rough', 8);
  b.cyl(0.14, 0.2, 0.9 + level * 0.2, '#6a5aa0', 0, 0.08, 0, {}, 'solid', 8);
  const top = 0.98 + level * 0.2;
  b.cyl(0.24, 0.14, 0.08, '#7b3dff', 0, top, 0, {}, 'solid', 8);
  const g = new THREE.OctahedronGeometry(0.16, 0);
  g.scale(0.8, 1.5, 0.8);
  const gem = new THREE.Mesh(g, mats.glow('#7df9ff', 7, '#4a9ad0', true));
  gem.position.set(0, top + 0.32, 0);
  gem.userData.float = 1;
  b.part(gem);
  for (let k = 0; k < 3; k++) {
    const s = new THREE.OctahedronGeometry(0.07, 0);
    s.scale(0.7, 1.6, 0.7);
    const a = (k / 3) * Math.PI * 2;
    b.add('glow|#ff8af0|5|#a04a9a|1', s, '#ffffff', { x: Math.cos(a) * 0.3, y: 0.12, z: Math.sin(a) * 0.3, rz: 0.3 });
  }
  b.light(0, top + 0.3, 0, '#8af4ff', 3);
}

function kincir(b, c) {
  b.cyl(0.18, 0.28, 1.0, c.wall, 0, 0, 0, {}, 'rough', 8);
  b.cone(0.24, 0.26, c.roof, 0, 1.0, 0, {}, 'rough', 8);
  door(b, 0, 0.27, 0, c.trim, 0.24, 0.12);
  windowPane(b, 0, 0.6, 0.22, 0, c.trim, 0.09);
  // blades: an animated part
  const bl = new Builder();
  bl.cyl(0.04, 0.04, 0.08, WOOD_D, 0, -0.04, 0, { rx: Math.PI / 2 });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    const g = new THREE.BoxGeometry(0.1, 0.5, 0.015);
    g.translate(0.02, 0.3, 0);
    bl.add('solid', g, k % 2 ? '#efe6d6' : '#d8d0c0', { rz: a });
  }
  const blades = bl.build();
  blades.position.set(0, 0.88, 0.3);
  blades.userData.spin = 'z';
  b.part(blades);
}

function gudang(b, c, level) {
  const w = 0.8, d = 0.66, h = 0.42 + level * 0.06;
  b.box(w, h, d, c.wall === STYLE.desa.wall ? '#b8483a' : c.wall, 0, 0, 0);
  b.gable(d, w, h, c.wall === STYLE.desa.wall ? '#b8483a' : c.wall, c.roof === STYLE.desa.roof ? '#5b5f6b' : c.roof, { pitch: 0.55, ry: Math.PI / 2 });
  b.box(0.32, 0.34, 0.03, '#efe6d6', 0, 0, d / 2 + 0.01);
  b.box(0.26, 0.3, 0.035, '#8a3a30', 0, 0.02, d / 2 + 0.01);
  b.box(0.3, 0.02, 0.04, '#efe6d6', 0, 0.15, d / 2 + 0.02, { rz: 0.8 });
  for (let k = 0; k < level + 1; k++) b.box(0.14, 0.14, 0.14, '#a8794c', w / 2 + 0.05, k * 0.14 * 0.5, -0.2 + k * 0.17, { ry: k * 0.4 }, 'rough');
  b.light(0, 0.4, d / 2 + 0.3);
}

function bengkel(b, c, level) {
  b.box(0.7, 0.36, 0.55, c.wall, 0, 0, -0.1, {}, 'rough');
  b.box(0.78, 0.05, 0.66, c.roof, 0, 0.42, -0.08, { rx: -0.18 }, 'rough');
  b.box(0.3, 0.26, 0.03, '#1f2230', -0.12, 0.0, 0.18);
  b.glowBox(0.3, 0.2, 0.03, '#ff8a3d', 3, -0.12, 0.02, 0.185, {}, '#2a2230');
  windowPane(b, 0.2, 0.22, 0.18, 0, c.trim, 0.12);
  b.box(0.12, 0.5, 0.12, '#6a6e78', 0.24, 0.3, -0.25, {}, 'rough');
  b.smoke.push(new THREE.Vector3(0.24, 0.9, -0.25));
  b.box(0.12, 0.08, 0.08, '#3a3d48', 0.25, 0.08, 0.32);
  b.box(0.06, 0.08, 0.05, '#3a3d48', 0.25, 0.0, 0.32);
  b.light(-0.1, 0.3, 0.45, '#ff9a5a');
  if (level >= 2) b.box(0.18, 0.18, 0.18, '#a8794c', -0.35, 0.0, 0.3, {}, 'rough');
}

function pasar(b, c, level) {
  b.box(1.85, 0.04, 1.85, '#c9b48a', 0, 0, 0, {}, 'rough');
  const stalls = [[-0.45, -0.45, '#c94a3d'], [0.45, -0.45, '#2f6e5b'], [-0.45, 0.45, '#e2b33c'], [0.45, 0.45, '#3f6fb0']];
  stalls.slice(0, 2 + level).forEach(([x, z, col], si) => {
    b.box(0.6, 0.2, 0.32, WOOD, x, 0.04, z);
    for (const [px, pz] of [[-0.27, -0.14], [0.27, -0.14], [-0.27, 0.14], [0.27, 0.14]]) b.box(0.03, 0.45, 0.03, WOOD_D, x + px, 0.04, z + pz);
    const aw = new THREE.BoxGeometry(0.68, 0.04, 0.42, 6, 1, 1).toNonIndexed();
    const pos = aw.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const ca = new THREE.Color(col), cb = new THREE.Color('#efe7d6');
    for (let i = 0; i < pos.count; i += 3) {
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const s = Math.floor((cx + 1) / 0.113) % 2 ? ca : cb;
      for (let k = 0; k < 3; k++) cols.set([s.r, s.g, s.b], (i + k) * 3);
    }
    const g = clean(aw);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    xf(g, { x, y: 0.5, z, rx: 0.15 });
    if (!b.parts.has('solid')) b.parts.set('solid', []);
    b.parts.get('solid').push(g);
    const goods = [['#e94f4f', '#ffb21f', '#7fc264'], ['#a8794c', '#8d909b', '#d8d0c0'], ['#ffd85c', '#ff8fb1', '#b58cff'], ['#86b8e8', '#e3c690', '#c97a4a']][si];
    goods.forEach((gc, k) => b.ball(0.05, gc, x - 0.15 + k * 0.15, 0.27, z, {}, 'smooth', 0));
  });
  b.glowBox(0.08, 0.1, 0.08, '#ffc36b', 5, 0, 0.62, 0);
  b.cyl(0.025, 0.03, 0.62, DARK, 0, 0.04, 0);
  b.light(0, 0.6, 0, '#ffc36b', 3);
}

function kedai(b, c, level) {
  b.box(0.72, 0.42, 0.5, c.wall, 0, 0, -0.15);
  b.gable(0.72, 0.5, 0.42, c.wall, c.roof, { z: -0.15 });
  b.glowBox(0.42, 0.18, 0.03, '#ffb05a', 5, 0.0, 0.14, 0.11);
  door(b, -0.24, 0.11, 0, c.trim, 0.28, 0.12);
  b.cyl(0.012, 0.012, 0.22, DARK, 0.38, 0.32, 0.12, { rz: Math.PI / 2 });
  b.box(0.02, 0.12, 0.16, '#e2b33c', 0.46, 0.2, 0.12, {}, 'smooth');
  for (const x of [-0.18, 0.2]) {
    b.cyl(0.1, 0.1, 0.03, WOOD, x, 0.14, 0.33);
    b.cyl(0.02, 0.02, 0.14, WOOD_D, x, 0, 0.33);
    b.cyl(0.012, 0.012, 0.4, DARK, x, 0.17, 0.33);
    b.cone(0.18, 0.08, x < 0 ? '#c94a3d' : '#2f6e5b', x, 0.5, 0.33, {}, 'smooth', 8);
  }
  b.glowBox(0.05, 0.05, 0.05, '#ffc36b', 6, 0.38, 0.4, 0.2);
  b.light(0, 0.3, 0.45, '#ffb05a', 2.6);
}

function toko(b, c, level, biome) {
  const h = 0.5 + level * 0.12;
  b.box(0.75, h, 0.62, c.wall, 0, 0, -0.06, {}, biome === 'kota' ? 'win' : 'solid');
  b.box(0.79, 0.06, 0.66, c.trim, 0, h, -0.06);
  b.glowBox(0.5, 0.22, 0.03, '#ffe0a8', 5, 0.06, 0.06, 0.26, {}, '#323a52');
  door(b, -0.27, 0.26, 0, c.trim, 0.28, 0.12);
  const aw = new THREE.BoxGeometry(0.7, 0.03, 0.2);
  b.add('solid', aw, c.roof, { x: 0, y: 0.36, z: 0.34, rx: 0.4 });
  b.box(0.36, 0.08, 0.02, '#2a2e3a', 0.06, h - 0.12, 0.26);
  b.glowBox(0.3, 0.05, 0.02, biome === 'kota' ? '#ff3d8b' : '#ffd23d', 6, 0.06, h - 0.105, 0.272, {}, '#2a2230');
  b.light(0.05, 0.25, 0.5, '#ffe0a8', 2.4);
}

function sumur(b, c) {
  b.cyl(0.22, 0.24, 0.2, c.stone, 0, 0, 0, {}, 'rough', 10);
  b.cyl(0.17, 0.17, 0.02, '#3f8fc2', 0, 0.17, 0, {}, 'smooth', 10);
  for (const x of [-0.2, 0.2]) b.box(0.035, 0.42, 0.035, WOOD_D, x, 0.1, 0);
  b.prism(0.5, 0.36, 0.14, c.roof, 0, 0.5, 0);
  b.cyl(0.015, 0.015, 0.42, WOOD, 0, 0.4, 0, { rz: Math.PI / 2 });
  b.cyl(0.04, 0.035, 0.07, '#8a5a38', 0.05, 0.27, 0);
}

function taman(b, c, level, biome) {
  const grassC = biome === 'fantasi' ? '#b48ae8' : biome === 'gurun' ? '#9cc46a' : '#7fc264';
  b.box(0.92, 0.04, 0.92, grassC, 0, 0, 0, {}, 'leaf');
  b.box(0.9, 0.012, 0.16, '#d4b383', 0, 0.04, 0, {}, 'rough');
  const rr = rng(5);
  treeParts(b, biome === 'pantai' || biome === 'gurun' ? 'palm' : biome === 'fantasi' ? 'crystaltree' : 'tree', rr, 0.75, -0.25, -0.25);
  for (let k = 0; k < 10; k++) b.ball(0.035, ['#ff8fb1', '#ffd85c', '#b58cff', '#f4f1ea', '#e94f4f'][k % 5], 0.1 + rr() * 0.3, 0.05, -0.38 + rr() * 0.25, {}, 'leaf', 0);
  b.box(0.36, 0.03, 0.1, WOOD, 0.15, 0.13, 0.28);
  b.box(0.36, 0.08, 0.02, WOOD, 0.15, 0.17, 0.33);
  for (const x of [0.0, 0.3]) b.box(0.02, 0.1, 0.08, DARK, x, 0.04, 0.28);
  b.box(0.1, 0.06, 0.1, '#8b8d96', -0.3, 0.04, 0.3, {}, 'rough');
}

function lampu(b, c, level, biome) {
  const col = biome === 'kota' ? '#ffe9c0' : biome === 'fantasi' ? '#b6f3ff' : '#ffc36b';
  b.cyl(0.05, 0.06, 0.05, DARK, 0, 0, 0);
  b.cyl(0.02, 0.03, 0.7, DARK, 0, 0.05, 0, {}, 'solid', 6);
  b.glowBox(0.09, 0.1, 0.09, col, 6, 0, 0.74, 0);
  b.cone(0.09, 0.07, DARK, 0, 0.84, 0, { ry: Math.PI / 4 }, 'solid', 4);
  b.light(0, 0.78, 0, col, 2.4);
}

function pohonHias(b, c, level, biome, rand) {
  const kind = { pantai: 'palm', gurun: 'palm', gunung: 'pine', hutan: 'pine', fantasi: 'crystaltree' }[biome] || 'tree';
  b.cyl(0.18, 0.2, 0.05, c.stone, 0, 0, 0, {}, 'rough', 8);
  treeParts(b, kind, rand, 1.05, 0, 0);
}

function bunga(b, c, level, biome) {
  b.box(0.8, 0.08, 0.5, WOOD, 0, 0, 0);
  b.box(0.72, 0.03, 0.42, '#5a3a22', 0, 0.06, 0, {}, 'rough');
  const cols = biome === 'fantasi' ? ['#7df9ff', '#ff8af0', '#c9a0ff'] : ['#ff8fb1', '#ffd85c', '#e94f4f', '#b58cff', '#f4f1ea'];
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 4; j++) {
      b.cyl(0.006, 0.006, 0.1, '#4d8f45', -0.3 + i * 0.12, 0.08, -0.15 + j * 0.1, {}, 'crop', 4);
      b.ball(0.03, cols[(i + j) % cols.length], -0.3 + i * 0.12, 0.18, -0.15 + j * 0.1, {}, 'crop', 0);
    }
}

function bangku(b, c, level, biome) {
  b.box(0.5, 0.03, 0.15, WOOD, 0, 0.14, 0);
  b.box(0.5, 0.1, 0.025, WOOD, 0, 0.19, -0.07);
  for (const x of [-0.2, 0.2]) b.box(0.03, 0.14, 0.13, DARK, x, 0, 0);
  if (biome !== 'kota') b.ball(0.12, LEAF2, 0.34, 0.08, -0.12, {}, 'leaf', 1);
  else b.cyl(0.07, 0.06, 0.22, '#2f6e5b', 0.33, 0, -0.05);
}

function airmancur(b, c, level) {
  b.cyl(0.42, 0.44, 0.14, c.stone, 0, 0, 0, {}, 'rough', 12);
  b.cyl(0.36, 0.36, 0.02, '#6fd0e8', 0, 0.12, 0, {}, 'smooth', 12);
  b.cyl(0.07, 0.09, 0.4, c.stone, 0, 0.12, 0, {}, 'rough', 8);
  b.cyl(0.18, 0.12, 0.06, c.stone, 0, 0.5, 0, {}, 'rough', 10);
  b.cyl(0.15, 0.15, 0.02, '#6fd0e8', 0, 0.55, 0, {}, 'smooth', 10);
  const jet = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), mats.water());
  jet.position.set(0, 0.66, 0);
  jet.rotation.x = Math.PI;
  jet.userData.bob = 1;
  b.part(jet);
  const drops = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 4, 10), mats.water());
  drops.rotation.x = Math.PI / 2;
  drops.position.set(0, 0.58, 0);
  drops.userData.pulse = 1;
  b.part(drops);
}

function monumen(b, c, level) {
  // a stone pillar crowned with a golden globe and its ring (no figures)
  b.box(0.6, 0.12, 0.6, c.stone, 0, 0, 0, {}, 'rough');
  b.box(0.4, 0.42, 0.4, shade(c.stone, 1.1), 0, 0.12, 0, {}, 'rough');
  b.box(0.46, 0.05, 0.46, c.stone, 0, 0.54, 0, {}, 'rough');
  const gold = '#e2b33c';
  b.cyl(0.05, 0.08, 0.12, gold, 0, 0.59, 0, {}, 'smooth', 8);
  b.ball(0.13, gold, 0, 0.84, 0, {}, 'smooth', 1);
  b.cyl(0.18, 0.18, 0.02, shade(gold, 0.85), 0, 0.83, 0, { rx: 0.45, rz: 0.3 }, 'smooth', 16);
  b.glowBox(0.03, 0.06, 0.03, '#ffe08a', 8, 0, 0.98, 0, {}, '#c8a040');
  b.light(0, 1.0, 0.3, '#ffe08a', 2);
}

function lumbung(b, c, level) {
  const red = '#b8483a';
  b.box(1.85, 0.04, 1.85, '#c9b48a', 0, 0, 0, {}, 'rough');
  b.box(1.1, 0.7, 0.9, red, -0.25, 0.04, -0.1);
  b.gable(0.9, 1.1, 0.74, red, '#5b5f6b', { pitch: 0.75, x: -0.25, z: -0.1, ry: Math.PI / 2 });
  b.box(0.42, 0.5, 0.03, '#efe6d6', -0.25, 0.04, 0.36);
  b.box(0.36, 0.46, 0.035, '#8a3a30', -0.25, 0.06, 0.36);
  for (const s of [0.8, -0.8]) b.box(0.5, 0.03, 0.04, '#efe6d6', -0.25, 0.28, 0.375, { rz: s });
  b.glowBox(0.18, 0.12, 0.03, '#ffc36b', 4, -0.25, 0.92, 0.36);
  b.cyl(0.24, 0.24, 1.1, '#d8d0c0', 0.6, 0.04, -0.4, {}, 'rough', 10);
  b.dome(0.25, '#8d919c', 0.6, 1.14, -0.4, {}, 'smooth', 10);
  for (let k = 0; k < 4; k++) b.cyl(0.12, 0.12, 0.2, '#e2c35a', 0.5 - k * 0.1, 0.04, 0.6, { rx: Math.PI / 2 }, 'rough', 8);
  b.light(-0.25, 0.4, 0.7);
}

function rumahPohon(b, c, level, biome, rand) {
  b.cyl(0.18, 0.28, 1.1, '#6a4630', 0, 0, 0, {}, 'rough', 8);
  for (let k = 0; k < 3; k++) b.cyl(0.05, 0.08, 0.3, '#6a4630', Math.cos(k * 2.1) * 0.25, 0, Math.sin(k * 2.1) * 0.25, { rz: Math.cos(k * 2.1) * 0.6, rx: -Math.sin(k * 2.1) * 0.6 });
  b.box(0.7, 0.05, 0.7, WOOD, 0, 0.9, 0);
  b.box(0.42, 0.3, 0.38, c.wall, 0.05, 0.95, 0.0, {}, 'rough');
  b.prism(0.46, 0.42, 0.18, c.roof, 0.05, 1.25, 0.0);
  windowPane(b, 0.05, 1.08, 0.2, 0, c.trim, 0.1);
  for (let k = 0; k < 6; k++) b.box(0.16, 0.02, 0.03, WOOD, 0.22, 0.12 + k * 0.14, 0.32);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    b.ball(0.32, k % 2 ? '#2f6a46' : '#3d8150', Math.cos(a) * 0.32, 1.45 + (k % 2) * 0.1, Math.sin(a) * 0.32, {}, 'leaf', 1);
  }
  b.ball(0.35, '#3d8150', 0, 1.7, 0, {}, 'leaf', 1);
  b.glowBox(0.05, 0.06, 0.05, '#ffc36b', 6, -0.3, 0.8, 0.3);
  b.light(0, 1.0, 0.4, '#ffc36b', 2.6);
}

function observatorium(b, c, level) {
  b.box(1.85, 0.06, 1.85, c.stone, 0, 0, 0, {}, 'rough');
  b.cyl(0.6, 0.65, 0.6, '#d8d0c0', 0, 0.06, 0, {}, 'rough', 14);
  b.dome(0.62, '#c9ced8', 0, 0.66, 0, {}, 'smooth', 14);
  b.box(0.18, 0.5, 0.06, '#1f2230', 0, 0.75, 0.55, { rx: -0.5 });
  const tel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 8), mats.solid());
  paint(tel.geometry, '#5a5e68');
  tel.position.set(0, 1.1, 0.3);
  tel.rotation.x = 0.7;
  b.part(tel);
  b.box(0.3, 0.3, 0.04, '#5a3a22', 0, 0.06, 0.64);
  for (let k = 0; k < 3; k++) b.box(0.4, 0.04, 0.12, c.stone, 0, 0.0 + k * 0.02, 0.76 + k * 0.1, {}, 'rough');
  for (const a of [0.8, 2.2, 3.8, 5.2]) b.glowBox(0.1, 0.12, 0.03, '#ffc36b', 4, Math.cos(a) * 0.61, 0.35, Math.sin(a) * 0.61, { ry: -a + Math.PI / 2 });
  b.light(0, 0.4, 0.9);
}

function obelisk(b, c) {
  b.box(0.7, 0.1, 0.7, c.stone, 0, 0, 0, {}, 'rough');
  b.box(0.5, 0.1, 0.5, shade(c.stone, 0.9), 0, 0.1, 0, {}, 'rough');
  const g = new THREE.CylinderGeometry(0.1, 0.18, 1.8, 4);
  g.translate(0, 0.9, 0);
  const n = g.toNonIndexed();
  n.computeVertexNormals();
  b.add('rough', n, '#e0b27a', { y: 0.2, ry: Math.PI / 4 });
  const tip = new THREE.ConeGeometry(0.14, 0.24, 4);
  tip.translate(0, 0.12, 0);
  b.add('glow|#ffd23d|7|#e2b33c|0', tip, '#ffffff', { y: 2.0, ry: Math.PI / 4 });
  b.light(0, 2.0, 0, '#ffd23d', 3);
}

function menaraJam(b, c, level) {
  b.box(0.7, 0.1, 0.7, c.stone, 0, 0, 0, {}, 'rough');
  b.box(0.5, 2.0, 0.5, '#b0a89a', 0, 0.1, 0, {}, 'rough');
  b.box(0.56, 0.08, 0.56, c.trim, 0, 2.1, 0);
  b.box(0.48, 0.4, 0.48, '#b0a89a', 0, 2.18, 0, {}, 'rough');
  b.hip(0.6, 0.6, '#3f6e4f', 0, 2.58, 0, 'rough');
  for (const [x, z, ry] of [[0, 0.255, 0], [0.255, 0, Math.PI / 2]]) {
    const face = new THREE.CircleGeometry(0.16, 16);
    b.add('glow|#fff2c8|3|#efe6d6|0', face, '#ffffff', { x, y: 2.38, z, ry });
  }
  const hands = new THREE.Group();
  const mk = (len, w) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.01), mats.solid());
    paint(m.geometry, '#1b1d24');
    m.geometry.translate(0, len / 2, 0);
    return m;
  };
  const hour = mk(0.09, 0.025), minute = mk(0.13, 0.016);
  hands.add(hour, minute);
  hands.position.set(0, 2.38, 0.265);
  hands.userData.clock = { hour, minute };
  b.part(hands);
  for (let k = 0; k < 4; k++) b.glowBox(0.08, 0.12, 0.03, '#ffd28a', 4, -0.12 + (k % 2) * 0.24, 0.5 + Math.floor(k / 2) * 0.6, 0.255);
  b.light(0, 2.4, 0.5, '#fff2c8', 2.5);
}

function pohonKehidupan(b, c, level, biome, rand) {
  b.box(1.85, 0.04, 1.85, '#b48ae8', 0, 0, 0, {}, 'leaf');
  b.cyl(0.25, 0.42, 1.4, '#7a5aa0', 0, 0, 0, {}, 'rough', 10);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    b.cyl(0.05, 0.12, 0.5, '#6a4a90', Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4, { rz: Math.cos(a) * 0.9, rx: -Math.sin(a) * 0.9 });
  }
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    b.ball(0.45, k % 2 ? '#c9a0ff' : '#9a7bff', Math.cos(a) * 0.5, 1.5 + (k % 3) * 0.12, Math.sin(a) * 0.5, {}, 'leaf', 1);
  }
  b.ball(0.55, '#d8b8ff', 0, 1.9, 0, {}, 'leaf', 1);
  for (let k = 0; k < 9; k++) {
    const a = rand() * Math.PI * 2, r = 0.5 + rand() * 0.45;
    b.glowBall(0.06, k % 2 ? '#7df9ff' : '#ff8af0', 6, Math.cos(a) * r, 1.25 + rand() * 0.8, Math.sin(a) * r, '#8a6ac0', true);
  }
  b.light(0, 1.6, 0.6, '#c9a0ff', 3.5);
}

// ---------------------------------------------------------------- v1.1 buildings

/** A painted mesh for animated parts (not merged), using a shared material. */
function partMesh(geo, color, mat = mats.solid()) {
  const g = clean(geo);
  paint(g, color);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function peternakan(b, c, level, biome) {
  const ground = biome === 'gurun' ? '#d8b98a' : '#a88a5a';
  b.box(0.9, 0.035, 0.9, ground, 0, 0, 0, {}, 'rough');
  // the coop on stilts
  for (const [x, z] of [[-0.3, -0.32], [0.08, -0.32], [-0.3, -0.04], [0.08, -0.04]]) b.box(0.035, 0.14, 0.035, WOOD_D, x, 0.03, z);
  b.box(0.46, 0.26, 0.36, c.wall === STYLE.desa.wall ? '#c9533f' : c.wall, -0.11, 0.17, -0.18);
  b.prism(0.5, 0.42, 0.16, c.roof, -0.11, 0.43, -0.18);
  b.box(0.1, 0.12, 0.02, '#2a2230', -0.11, 0.2, 0.01);
  b.box(0.1, 0.02, 0.26, WOOD, -0.11, 0.1, 0.12, { rx: 0.5 });
  // nest box with straw and eggs
  b.box(0.22, 0.1, 0.16, WOOD, 0.26, 0.035, -0.26);
  b.box(0.2, 0.03, 0.14, '#e8cf6a', 0.26, 0.135, -0.26, {}, 'leaf');
  for (let k = 0; k < 2 + level; k++) b.ball(0.025, '#f8f1e2', 0.2 + k * 0.05, 0.16, -0.26, { sy: 1.25 }, 'smooth', 0);
  // trough and a low fence
  b.box(0.3, 0.06, 0.08, WOOD_D, 0.18, 0.035, 0.22);
  b.box(0.26, 0.02, 0.05, '#e8c860', 0.18, 0.085, 0.22, {}, 'rough');
  for (let k = -3; k <= 3; k++) {
    b.box(0.025, 0.12, 0.025, '#efe6d6', k * 0.14, 0.03, 0.42);
    b.box(0.025, 0.12, 0.025, '#efe6d6', 0.42, 0.03, k * 0.14);
  }
  b.box(0.86, 0.02, 0.02, '#efe6d6', 0, 0.11, 0.42);
  b.box(0.02, 0.02, 0.86, '#efe6d6', 0.42, 0.11, 0);
  b.light(0.1, 0.35, 0.3, '#ffcf8a', 1.6);
}

function kebun(b, c, level, biome, rand) {
  const grass = biome === 'fantasi' ? '#b48ae8' : '#79b65a';
  b.box(1.85, 0.04, 1.85, grass, 0, 0, 0, {}, 'leaf');
  const fruit = biome === 'fantasi' ? ['#7df9ff', '#ff8af0'] : biome === 'pantai' ? ['#ffb21f', '#7fb84e'] : ['#e94f4f', '#ffb21f'];
  const n = level >= 2 ? 3 : 2;
  const step = n === 3 ? 0.58 : 0.8;
  for (let a = 0; a < n; a++)
    for (let z = 0; z < n; z++) {
      const x = (a - (n - 1) / 2) * step + (rand() - 0.5) * 0.08, zz = (z - (n - 1) / 2) * step + (rand() - 0.5) * 0.08;
      b.cyl(0.035, 0.05, 0.3, '#7a5236', x, 0.04, zz, {}, 'rough', 6);
      const r = 0.2 + rand() * 0.05;
      b.ball(r, k2(rand), x, 0.42, zz, { sy: 0.85 }, 'leaf', 1);
      for (let f = 0; f < 4; f++) {
        const ang = rand() * Math.PI * 2;
        b.ball(0.035, fruit[f % 2], x + Math.cos(ang) * r * 0.85, 0.36 + rand() * 0.14, zz + Math.sin(ang) * r * 0.85, {}, 'smooth', 0);
      }
    }
  // baskets of picked fruit and a ladder
  for (const [x, z] of [[0.75, 0.78], [0.6, 0.82]]) {
    b.cyl(0.07, 0.06, 0.08, '#b08454', x, 0.04, z, {}, 'rough', 8);
    b.ball(0.05, fruit[0], x, 0.12, z, {}, 'smooth', 0);
  }
  b.box(0.05, 0.42, 0.02, WOOD, -0.78, 0.04, 0.78, { rz: 0.25 });
}
function k2(rand) {
  return rand() < 0.5 ? '#4d8f45' : '#5a9e4b';
}

function penggergajian(b, c, level) {
  b.box(0.9, 0.04, 0.9, '#8a6a4a', 0, 0, 0, {}, 'rough');
  // open shed: back wall, posts and a sloped roof
  b.box(0.7, 0.42, 0.06, c.wall === STYLE.desa.wall ? WOOD : c.wall, 0, 0.04, -0.33, {}, 'rough');
  for (const x of [-0.33, 0.33]) b.box(0.05, 0.46, 0.05, WOOD_D, x, 0.04, 0.12);
  b.box(0.8, 0.04, 0.6, c.roof, 0, 0.5, -0.1, { rx: 0.14 }, 'rough');
  // saw bench and the spinning blade
  b.box(0.5, 0.16, 0.16, WOOD_D, 0, 0.04, -0.05);
  b.cyl(0.04, 0.04, 0.46, '#a77c52', -0.05, 0.24, -0.05, { rz: Math.PI / 2 });
  const blade = partMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 12), '#c8cdd6', mats.smooth());
  blade.rotation.x = Math.PI / 2;
  const hub = new THREE.Group();
  hub.add(blade);
  hub.position.set(0.12, 0.24, -0.05);
  hub.userData.spin = 'saw';
  b.part(hub);
  // log pile and planks
  for (let k = 0; k < 3 + level; k++) b.cyl(0.055, 0.055, 0.42, k % 2 ? '#a77c52' : '#8a6040', -0.26 + (k % 3) * 0.11, 0.09 + Math.floor(k / 3) * 0.1, 0.32, { rz: Math.PI / 2, ry: Math.PI / 2 });
  for (let k = 0; k < 3; k++) b.box(0.4, 0.025, 0.1, '#d8b080', 0.24, 0.04 + k * 0.03, 0.3, { ry: 0.1 * k });
  b.box(0.08, 0.3, 0.08, '#6a6e78', 0.28, 0.5, -0.3, {}, 'rough');
  b.smoke.push(new THREE.Vector3(0.28, 0.85, -0.3));
  b.light(0, 0.35, 0.3, '#ffcf8a', 1.8);
}

function tungku(b, c, level) {
  const brick = '#b8603f';
  b.box(0.9, 0.04, 0.9, '#8d7a6a', 0, 0, 0, {}, 'rough');
  b.dome(0.32, brick, -0.05, 0.04, -0.08, { sy: 1.15 }, 'rough', 10);
  b.cyl(0.33, 0.33, 0.08, shade(brick, 0.8), -0.05, 0.04, -0.08, {}, 'rough', 10);
  b.box(0.16, 0.14, 0.06, '#2a1a14', -0.05, 0.06, 0.22);
  b.glowBox(0.12, 0.1, 0.03, '#ff7a2a', 6, -0.05, 0.07, 0.25, {}, '#ff7a2a', true);
  b.cyl(0.06, 0.08, 0.55, shade(brick, 0.9), -0.05, 0.38, -0.15, {}, 'rough', 6);
  b.smoke.push(new THREE.Vector3(-0.05, 1.0, -0.15));
  // brick stacks and firewood
  for (let k = 0; k < 2 + level; k++) b.box(0.18, 0.08, 0.1, brick, 0.3, 0.04 + (k % 3) * 0.08, 0.25 - Math.floor(k / 3) * 0.14, {}, 'rough');
  for (let k = 0; k < 4; k++) b.cyl(0.03, 0.03, 0.28, '#8a6040', 0.3, 0.06 + (k % 2) * 0.06, -0.3 + Math.floor(k / 2) * 0.07, { rz: Math.PI / 2, ry: Math.PI / 2 });
  b.light(-0.05, 0.2, 0.4, '#ff8a3d', 2.4);
}

function kaca(b, c, level) {
  b.box(0.9, 0.04, 0.9, c.stone, 0, 0, 0, {}, 'rough');
  b.box(0.62, 0.42, 0.5, c.wall, -0.05, 0.04, -0.12, {}, 'rough');
  b.gable(0.62, 0.5, 0.46, c.wall, c.roof, { pitch: 0.5, x: -0.05, z: -0.12 });
  b.cone(0.14, 0.7, '#8a8d98', 0.18, 0.46, -0.2, {}, 'rough', 8);
  b.smoke.push(new THREE.Vector3(0.18, 1.2, -0.2));
  // the furnace mouth glows, glass cools on racks outside
  b.box(0.2, 0.18, 0.04, '#1f1a20', -0.18, 0.04, 0.14);
  b.glowBox(0.16, 0.14, 0.03, '#ffb04a', 7, -0.18, 0.05, 0.16, {}, '#ffb04a', true);
  windowPane(b, 0.15, 0.24, 0.14, 0, c.trim, 0.12);
  b.box(0.04, 0.3, 0.3, WOOD_D, 0.36, 0.04, 0.22);
  for (let k = 0; k < 2 + level; k++) b.box(0.02, 0.16, 0.12, k % 2 ? '#bfe9ff' : '#9fd8f0', 0.36 - 0.04, 0.12 + (k % 2) * 0.01, 0.12 + k * 0.08 - 0.08, {}, 'smooth');
  b.light(-0.18, 0.2, 0.4, '#ffb04a', 2.6);
}

function klinik(b, c, level) {
  b.box(0.9, 0.04, 0.9, '#c9ccd4', 0, 0, 0, {}, 'rough');
  const h = 0.5 + (level - 1) * 0.12;
  b.box(0.7, h, 0.56, '#f4f6fb', 0, 0.04, -0.08);
  b.box(0.76, 0.06, 0.62, '#c9d2dc', 0, 0.04 + h, -0.08);
  // red cross on the front and on the roof
  b.box(0.16, 0.05, 0.02, '#e0303a', 0, 0.04 + h * 0.72, 0.21, {}, 'smooth');
  b.box(0.05, 0.16, 0.02, '#e0303a', 0, 0.04 + h * 0.72 - 0.055, 0.21, {}, 'smooth');
  b.box(0.22, 0.02, 0.07, '#e0303a', 0, 0.1 + h, -0.08, {}, 'smooth');
  b.box(0.07, 0.02, 0.22, '#e0303a', 0, 0.1 + h, -0.08, {}, 'smooth');
  door(b, 0.2, 0.21, 0, '#7fb8d8', 0.28, 0.16);
  windowPane(b, -0.2, 0.22, 0.21, 0, '#c9d2dc', 0.14);
  windowPane(b, 0.36, 0.22, -0.08, Math.PI / 2, '#c9d2dc', 0.14);
  b.box(0.16, 0.02, 0.2, '#c9d2dc', 0.2, 0.36, 0.3);
  b.glowBox(0.05, 0.05, 0.05, '#ff4a4a', 6, -0.33, 0.04 + h - 0.05, 0.21);
  b.light(0.2, 0.32, 0.45, '#e8f4ff', 2);
}

function sekolah(b, c, level) {
  b.box(1.85, 0.04, 1.85, '#c9b48a', 0, 0, 0, {}, 'rough');
  const h = 0.45 + (level - 1) * 0.15;
  b.box(1.4, h, 0.6, c.wall, -0.1, 0.04, -0.45);
  b.gable(1.4, 0.6, 0.04 + h, c.wall, c.roof, { x: -0.1, z: -0.45 });
  for (let k = 0; k < 4; k++) windowPane(b, -0.65 + k * 0.32, 0.26, -0.14, 0, c.trim, 0.14);
  door(b, 0.45, -0.14, 0, c.trim, 0.32, 0.18);
  // bell tower with a bell
  b.box(0.22, 0.32, 0.22, c.wall, -0.1, 0.04 + h + 0.2, -0.45);
  b.hip(0.32, 0.22, c.roof, -0.1, 0.36 + h + 0.2, -0.45);
  b.cone(0.06, 0.08, '#e2b33c', -0.1, 0.14 + h + 0.2, -0.33, {}, 'smooth', 8);
  // flagpole with an animated flag
  b.cyl(0.015, 0.015, 1.0, '#c8cdd6', 0.75, 0.04, 0.55);
  const flag = new THREE.Group();
  const cloth = partMesh(new THREE.BoxGeometry(0.24, 0.14, 0.01).translate(0.12, 0, 0), '#e94f4f', mats.smooth());
  flag.add(cloth);
  flag.position.set(0.765, 0.94, 0.55);
  flag.userData.flag = 1;
  b.part(flag);
  // a little sports yard
  b.box(0.7, 0.01, 0.5, '#d89a5a', -0.35, 0.04, 0.45, {}, 'rough');
  b.box(0.02, 0.3, 0.02, '#efe6d6', -0.68, 0.04, 0.45);
  b.box(0.12, 0.1, 0.02, '#efe6d6', -0.68, 0.32, 0.45);
  b.light(0.45, 0.35, 0.1);
}

function perpustakaan(b, c, level) {
  b.box(0.9, 0.06, 0.9, '#d8d0c0', 0, 0, 0, {}, 'rough');
  b.box(0.76, 0.06, 0.4, '#e8e0d0', 0, 0.06, 0.24, {}, 'rough');
  b.box(0.7, 0.48, 0.5, c.wall === STYLE.desa.wall ? '#e8dcc8' : c.wall, 0, 0.06, -0.12, {}, 'rough');
  for (let k = 0; k < 4; k++) b.cyl(0.035, 0.035, 0.42, '#f4f1ea', -0.27 + k * 0.18, 0.12, 0.19, {}, 'smooth', 8);
  b.box(0.78, 0.06, 0.24, '#f4f1ea', 0, 0.54, 0.16);
  b.prism(0.78, 0.24, 0.12, '#f4f1ea', 0, 0.6, 0.16);
  b.hip(0.62, 0.22, c.roof, 0, 0.54, -0.12);
  // book-lined windows glow warm in the evening
  for (const x of [-0.18, 0.18]) {
    b.box(0.16, 0.24, 0.02, '#3a2a20', x, 0.18, 0.135);
    b.glowBox(0.12, 0.2, 0.02, '#ffd28a', 3.5, x, 0.2, 0.14);
    for (let s = 0; s < 3; s++) b.box(0.13, 0.015, 0.025, ['#c94a3d', '#3f6fb0', '#e2b33c'][s], x, 0.24 + s * 0.06, 0.15);
  }
  b.light(0, 0.35, 0.5, '#ffd28a', 2);
}

function tamanBermain(b, c, level, biome) {
  const grass = biome === 'fantasi' ? '#b48ae8' : biome === 'gurun' ? '#d8bf8a' : '#7fc264';
  b.box(0.92, 0.04, 0.92, grass, 0, 0, 0, {}, 'leaf');
  b.box(0.46, 0.015, 0.3, '#e8d3a0', -0.18, 0.04, 0.22, {}, 'rough');
  // swing frame and two swinging seats
  for (const x of [-0.42, 0.06]) {
    b.box(0.03, 0.5, 0.03, '#d8323a', x, 0.04, 0.14, { rx: 0.2 });
    b.box(0.03, 0.5, 0.03, '#d8323a', x, 0.04, 0.32, { rx: -0.2 });
  }
  b.box(0.52, 0.03, 0.03, '#d8323a', -0.18, 0.52, 0.22);
  for (const [x, ph] of [[-0.3, 0], [-0.06, 1]]) {
    const sw = new THREE.Group();
    sw.add(partMesh(new THREE.BoxGeometry(0.008, 0.36, 0.008).translate(0, -0.18, -0.04), '#5a5e68'));
    sw.add(partMesh(new THREE.BoxGeometry(0.008, 0.36, 0.008).translate(0, -0.18, 0.04), '#5a5e68'));
    sw.add(partMesh(new THREE.BoxGeometry(0.1, 0.02, 0.1).translate(0, -0.37, 0), '#ffd23d'));
    sw.position.set(x, 0.52, 0.22);
    sw.rotation.y = Math.PI / 2;
    sw.userData.swing = 1 + ph;
    b.part(sw);
  }
  // slide
  b.box(0.16, 0.3, 0.16, '#3f6fb0', 0.28, 0.04, -0.28);
  b.box(0.14, 0.02, 0.5, '#ffd23d', 0.28, 0.2, -0.02, { rx: 0.62 });
  for (let k = 0; k < 4; k++) b.box(0.14, 0.015, 0.03, '#efe6d6', 0.28, 0.08 + k * 0.07, -0.38);
  // seesaw
  b.box(0.05, 0.07, 0.05, '#7a5236', -0.25, 0.04, -0.25);
  const ss = new THREE.Group();
  ss.add(partMesh(new THREE.BoxGeometry(0.5, 0.02, 0.06), '#7fb84e'));
  ss.position.set(-0.25, 0.12, -0.25);
  ss.userData.seesaw = 1;
  b.part(ss);
}

function panggung(b, c, level) {
  b.box(1.85, 0.04, 1.85, '#c9b48a', 0, 0, 0, {}, 'rough');
  b.cyl(0.62, 0.66, 0.14, c.stone, 0, 0.04, -0.15, {}, 'rough', 12);
  b.cyl(0.6, 0.6, 0.02, WOOD, 0, 0.18, -0.15, {}, 'solid', 12);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.26;
    b.cyl(0.025, 0.025, 0.62, '#efe6d6', Math.cos(a) * 0.55, 0.18, -0.15 + Math.sin(a) * 0.55, {}, 'smooth', 6);
  }
  b.cone(0.74, 0.32, c.roof, 0, 0.8, -0.15, {}, 'rough', 12);
  b.ball(0.05, '#e2b33c', 0, 1.12, -0.15, {}, 'smooth', 0);
  // a low tea table with a board game and cushions
  b.cyl(0.2, 0.2, 0.04, WOOD_D, 0, 0.26, -0.15, {}, 'solid', 10);
  b.cyl(0.04, 0.05, 0.08, WOOD_D, 0, 0.18, -0.15, {}, 'solid', 6);
  b.box(0.16, 0.012, 0.16, '#f4f1ea', 0, 0.3, -0.15, {}, 'smooth');
  for (let k = 0; k < 4; k++) b.box(0.04, 0.014, 0.04, '#1f2230', -0.04 + (k % 2) * 0.08, 0.305, -0.19 + Math.floor(k / 2) * 0.08, {}, 'smooth');
  b.ball(0.035, '#f4f1ea', 0.13, 0.32, -0.05, { sy: 0.8 }, 'smooth', 1);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.78;
    b.box(0.14, 0.04, 0.14, ['#e94f4f', '#86b8e8', '#7fe08a', '#ffd23d'][k], Math.cos(a) * 0.34, 0.2, -0.15 + Math.sin(a) * 0.34, {}, 'rough');
  }
  // string lights around the roof
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    b.glowBall(0.025, ['#ffd23d', '#ff8ad8', '#7fe08a', '#86b8e8'][k % 4], 6, Math.cos(a) * 0.66, 0.78, -0.15 + Math.sin(a) * 0.66);
  }
  // benches for the audience
  for (const x of [-0.45, 0.45]) b.box(0.5, 0.06, 0.12, WOOD, x, 0.1, 0.72), b.box(0.04, 0.1, 0.1, WOOD_D, x - 0.2, 0.04, 0.72), b.box(0.04, 0.1, 0.1, WOOD_D, x + 0.2, 0.04, 0.72);
  b.light(0, 0.6, -0.1, '#ffd8a8', 3);
}

function menaraAir(b, c, level) {
  b.box(0.8, 0.04, 0.8, c.stone, 0, 0, 0, {}, 'rough');
  const H = 1.2 + level * 0.15;
  for (const [x, z] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) b.box(0.05, H, 0.05, '#6a6e78', x, 0.04, z, { rx: z > 0 ? -0.06 : 0.06, rz: x > 0 ? 0.06 : -0.06 });
  for (const y of [0.4, 0.8]) {
    b.box(0.5, 0.025, 0.025, '#5a5e68', 0, y, 0.22);
    b.box(0.5, 0.025, 0.025, '#5a5e68', 0, y, -0.22);
    b.box(0.025, 0.025, 0.5, '#5a5e68', 0.22, y, 0);
    b.box(0.025, 0.025, 0.5, '#5a5e68', -0.22, y, 0);
  }
  b.cyl(0.34, 0.34, 0.4, c.wall === STYLE.desa.wall ? '#86b8e8' : c.wall, 0, H, 0, {}, 'solid', 12);
  b.cyl(0.35, 0.35, 0.04, '#5a5e68', 0, H + 0.13, 0, {}, 'solid', 12);
  b.cone(0.38, 0.22, c.roof, 0, H + 0.4, 0, {}, 'rough', 12);
  for (let k = 0; k < 8; k++) b.box(0.08, 0.012, 0.02, '#c8cdd6', 0.3, 0.1 + k * 0.14, 0.27);
  b.glowBox(0.04, 0.04, 0.04, '#ff4a4a', 7, 0, H + 0.6, 0, {}, '#a83a3a');
}

// ---------------------------------------------------------------- v1.2 buildings

function flagPart(color, x, y, z, w = 0.2, h = 0.11) {
  const flag = new THREE.Group();
  flag.add(partMesh(new THREE.BoxGeometry(w, h, 0.01).translate(w / 2, h / 2, 0), color, mats.smooth()));
  flag.position.set(x, y, z);
  flag.userData.flag = 1;
  return flag;
}

function pemadam(b, c, level) {
  const red = '#d8323a', redD = '#a82630';
  b.box(0.92, 0.04, 0.92, '#8d909b', 0, 0, 0, {}, 'rough');
  // the station: brick red with a wide garage door and a hose tower
  b.box(0.62, 0.44, 0.5, red, -0.06, 0.04, -0.14, {}, 'rough');
  b.box(0.66, 0.05, 0.54, '#efe6d6', -0.06, 0.48, -0.14);
  b.box(0.3, 0.3, 0.02, '#e8e4dc', -0.14, 0.04, 0.12);
  for (let k = 0; k < 4; k++) b.box(0.3, 0.012, 0.025, '#b8b2a6', -0.14, 0.08 + k * 0.07, 0.13);
  windowPane(b, 0.14, 0.26, 0.12, 0, '#efe6d6', 0.1);
  const H = 0.95 + (level - 1) * 0.12;
  b.box(0.2, H, 0.2, redD, 0.3, 0.04, -0.28, {}, 'rough');
  b.box(0.24, 0.04, 0.24, '#efe6d6', 0.3, 0.04 + H, -0.28);
  b.hip(0.24, 0.16, '#3a3e4a', 0.3, 0.08 + H, -0.28);
  // the alarm bell and a spinning beacon on the tower
  b.ball(0.045, '#ffd23d', 0.3, H - 0.12, -0.17, {}, 'smooth', 0);
  const beacon = new THREE.Group();
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.035), mats.glow('#ff3a3a', 7, '#a83a3a', true));
  beacon.add(lamp);
  beacon.position.set(0.3, 0.3 + H, -0.28);
  beacon.userData.spin = 'y';
  b.part(beacon);
  // the little fire truck parked in front
  b.box(0.34, 0.1, 0.16, red, -0.14, 0.06, 0.3, {}, 'smooth');
  b.box(0.12, 0.08, 0.15, red, 0.02, 0.16, 0.3, {}, 'smooth');
  b.box(0.1, 0.05, 0.155, '#bfe9ff', 0.03, 0.18, 0.3, {}, 'smooth');
  b.box(0.22, 0.02, 0.04, '#c8cdd6', -0.18, 0.17, 0.3);
  for (const [x, z] of [[-0.24, 0.22], [-0.24, 0.38], [0.0, 0.22], [0.0, 0.38]]) b.cyl(0.035, 0.035, 0.03, '#1f2230', x, 0.04, z, { rx: Math.PI / 2 });
  b.glowBox(0.03, 0.03, 0.03, '#ff3a3a', 6, 0.05, 0.24, 0.3, {}, '#a83a3a');
  // hose reel and hydrant
  b.cyl(0.07, 0.07, 0.05, '#e8c860', 0.3, 0.1, 0.12, { rx: Math.PI / 2 });
  b.cyl(0.035, 0.04, 0.14, red, 0.38, 0.04, 0.36);
  b.ball(0.035, red, 0.38, 0.18, 0.36, {}, 'smooth', 0);
  b.light(-0.1, 0.38, 0.35, '#ffd8b0', 1.8);
}

function roti(b, c, level) {
  b.box(0.9, 0.04, 0.9, c.stone, 0, 0, 0, {}, 'rough');
  const wallH = 0.4 + (level - 1) * 0.12;
  b.box(0.66, wallH, 0.52, c.wall, 0, 0.04, -0.1);
  const top = b.gable(0.66, 0.52, 0.04 + wallH, c.wall, c.roof, { pitch: 0.55, z: -0.1 });
  // a striped awning over the shop window
  for (let k = 0; k < 6; k++) b.box(0.11, 0.015, 0.2, k % 2 ? '#fff6e8' : '#e8913a', -0.275 + k * 0.11, 0.33, 0.24, { rx: 0.35 });
  b.box(0.3, 0.16, 0.03, '#2a2230', -0.12, 0.13, 0.17);
  b.glowBox(0.28, 0.14, 0.02, '#ffc36b', 3.5, -0.12, 0.14, 0.18);
  for (let k = 0; k < 3; k++) b.ball(0.035, '#d8954a', -0.21 + k * 0.09, 0.18, 0.2, { sx: 1.6, sy: 0.8 }, 'smooth', 0);
  door(b, 0.2, 0.17, 0, c.trim, 0.28, 0.14);
  // brick oven chimney and a big bread sign
  b.box(0.14, 0.42, 0.14, '#b8603f', -0.2, top - 0.25, -0.2, {}, 'rough');
  b.smoke.push(new THREE.Vector3(-0.2, top + 0.25, -0.2));
  b.box(0.02, 0.18, 0.02, WOOD_D, 0.34, 0.3, 0.19);
  const sign = new THREE.Group();
  sign.add(partMesh(new THREE.BoxGeometry(0.2, 0.1, 0.02).translate(0, -0.05, 0), '#efe6d6', mats.smooth()));
  sign.add(partMesh(new THREE.SphereGeometry(0.035, 6, 4).scale(1.8, 0.8, 0.6).translate(0, -0.05, 0.02), '#d8954a', mats.smooth()));
  sign.position.set(0.34, 0.46, 0.27);
  sign.userData.swing = 1;
  b.part(sign);
  // flour sacks and a bread cart
  for (let k = 0; k < 2 + (level - 1); k++) b.cyl(0.06, 0.07, 0.14, '#efe6d6', 0.32 - k * 0.12, 0.04, -0.34, {}, 'rough', 6);
  b.box(0.18, 0.08, 0.12, WOOD, -0.3, 0.07, 0.34);
  for (let k = 0; k < 3; k++) b.ball(0.03, '#e8a858', -0.36 + k * 0.06, 0.16, 0.34, { sx: 1.5 }, 'smooth', 0);
  b.cyl(0.04, 0.04, 0.02, '#3a3e4a', -0.3, 0.04, 0.27, { rx: Math.PI / 2 });
  b.light(0, 0.3, 0.4, '#ffcf8a', 2);
}

function lab(b, c, level) {
  b.box(0.92, 0.04, 0.92, '#c9ccd4', 0, 0, 0, {}, 'rough');
  const h = 0.48 + (level - 1) * 0.12;
  b.box(0.64, h, 0.5, '#e8ecf4', -0.04, 0.04, -0.1);
  b.box(0.68, 0.05, 0.54, '#7a8496', -0.04, 0.04 + h, -0.1);
  // long lab windows that glow cyan at night
  for (const x of [-0.24, 0.06]) {
    b.box(0.2, 0.14, 0.03, '#7a8496', x, 0.2, 0.15);
    b.glowBox(0.17, 0.11, 0.03, '#8af4ff', 4.5, x, 0.215, 0.16);
  }
  door(b, 0.21, 0.16, 0, '#5a6a8a', 0.28, 0.13);
  // observatory dome with a rotating satellite dish
  b.dome(0.2, '#c8cdd6', -0.18, 0.09 + h, -0.18, {}, 'smooth', 12);
  b.box(0.04, 0.18, 0.08, '#2a3247', -0.18, 0.12 + h, -0.01, { rx: -0.5 });
  const dish = new THREE.Group();
  dish.add(partMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6).translate(0, 0.08, 0), '#7a8496', mats.smooth()));
  const bowl = partMesh(new THREE.SphereGeometry(0.12, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2.6).scale(1, 0.45, 1), '#f4f6fb', mats.smooth());
  bowl.rotation.x = -1.0;
  bowl.position.set(0, 0.18, 0.02);
  dish.add(bowl);
  dish.position.set(0.18, 0.09 + h, -0.2);
  dish.userData.spin = 'y';
  b.part(dish);
  // bubbling flasks on the bench outside
  b.box(0.3, 0.12, 0.12, '#7a8496', 0.22, 0.04, 0.32);
  const cols = ['#7fe08a', '#ff8ad8', '#8af4ff'];
  for (let k = 0; k < 3; k++) {
    b.cyl(0.012, 0.03, 0.05, '#dff4ff', 0.12 + k * 0.1, 0.16, 0.32, {}, 'smooth', 6);
    b.glowBall(0.026, cols[k], 4, 0.12 + k * 0.1, 0.18, 0.32, '#5a6a8a', true);
  }
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 1), mats.glow('#8af4ff', 6, '#4a9ad0', true));
  orb.position.set(0.22, 0.33, 0.32);
  orb.userData.float = 1;
  b.part(orb);
  b.light(0.1, 0.3, 0.4, '#8af4ff', 2.2);
}

function pelabuhan(b, c, level) {
  // land side (-z): a warehouse and crates; the long pier runs out over the water (+z)
  b.box(1.9, 0.04, 0.9, c.stone, 0, 0, -0.5, {}, 'rough');
  b.box(0.9, 0.46, 0.56, c.wall === STYLE.desa.wall ? WOOD : c.wall, -0.42, 0.04, -0.58, {}, 'rough');
  b.gable(0.9, 0.56, 0.5, c.wall === STYLE.desa.wall ? WOOD : c.wall, c.roof, { pitch: 0.5, x: -0.42, z: -0.58 });
  b.box(0.3, 0.3, 0.02, '#2a2230', -0.42, 0.04, -0.29);
  windowPane(b, -0.72, 0.3, -0.29, 0, c.trim, 0.1);
  for (let k = 0; k < 3 + level; k++) b.box(0.16, 0.14, 0.16, k % 2 ? '#a8794c' : '#c9a070', 0.3 + (k % 3) * 0.18, 0.04 + Math.floor(k / 3) * 0.14, -0.62, { ry: (k % 2) * 0.3 }, 'rough');
  for (let k = 0; k < 2; k++) b.cyl(0.07, 0.07, 0.16, '#8a5a38', 0.82, 0.04, -0.3 - k * 0.16, {}, 'rough', 8);
  // the pier
  b.box(1.6, 0.05, 0.9, WOOD, 0, 0.02, 0.45);
  for (let k = 0; k < 8; k++) b.box(1.6, 0.006, 0.01, WOOD_D, 0, 0.072, 0.06 + k * 0.11);
  for (const x of [-0.75, -0.25, 0.25, 0.75]) for (const z of [0.15, 0.85]) b.cyl(0.035, 0.035, 0.7, WOOD_D, x, -0.6, z);
  for (const x of [-0.7, 0.7]) b.cyl(0.03, 0.04, 0.12, '#3a3e4a', x, 0.07, 0.86);
  // a little loading crane
  b.box(0.06, 0.7, 0.06, '#3a3e4a', 0.68, 0.07, 0.15);
  b.box(0.06, 0.04, 0.5, '#3a3e4a', 0.68, 0.74, 0.35);
  b.box(0.01, 0.3, 0.01, '#c8cdd6', 0.68, 0.45, 0.56);
  b.box(0.12, 0.08, 0.12, '#c9a070', 0.68, 0.38, 0.56, {}, 'rough');
  // the merchant ship moored alongside (animated: bobs, and sails off with every delivered order)
  const sb = new Builder();
  sb.box(1.0, 0.12, 0.3, '#7a4a2a', 0, 0, 0, {}, 'rough');
  sb.box(0.86, 0.06, 0.26, '#a8794c', 0, 0.12, 0);
  sb.box(0.22, 0.08, 0.28, '#a8794c', -0.38, 0.12, 0);
  sb.box(0.1, 0.06, 0.3, '#5a3a22', 0.52, 0.02, 0, {}, 'rough');
  sb.cyl(0.02, 0.02, 0.85, WOOD_D, 0.05, 0.12, 0);
  sb.box(0.02, 0.4, 0.34, '#f4efe2', 0.07, 0.36, 0, {}, 'smooth');
  sb.box(0.02, 0.22, 0.22, '#f4efe2', 0.07, 0.8, 0, {}, 'smooth');
  sb.box(0.14, 0.06, 0.01, '#e94f4f', 0.12, 0.92, 0, {}, 'smooth');
  for (let k = 0; k < 2; k++) sb.box(0.12, 0.1, 0.12, '#c9a070', -0.15 - k * 0.15, 0.18, 0, {}, 'rough');
  sb.glowBox(0.04, 0.05, 0.04, '#ffc36b', 5, -0.46, 0.22, 0);
  const ship = sb.build();
  ship.position.set(-0.1, -0.06, 1.12);
  ship.userData.ship = 1;
  b.part(ship);
  b.glowBox(0.06, 0.08, 0.06, '#ffc36b', 5, -0.7, 0.24, 0.86);
  b.light(-0.4, 0.4, 0.2, '#ffcf8a', 2.2);
  b.light(0.6, 0.3, 0.8, '#ffcf8a', 1.6);
}

function bank(b, c, level) {
  const marble = '#e8e4dc', marbleD = '#c8c2b6';
  b.box(0.92, 0.04, 0.92, marbleD, 0, 0, 0, {}, 'rough');
  // steps, columns, a pediment and a golden dome
  for (let k = 0; k < 3; k++) b.box(0.8 - k * 0.06, 0.035, 0.24 - k * 0.04, marble, 0, 0.04 + k * 0.035, 0.28 - k * 0.02);
  const h = 0.5 + (level - 1) * 0.1;
  b.box(0.7, h, 0.44, '#f0ece4', 0, 0.04, -0.12);
  for (let k = 0; k < 4; k++) b.cyl(0.035, 0.04, h - 0.04, marble, -0.27 + k * 0.18, 0.145, 0.15, {}, 'smooth', 8);
  b.box(0.76, 0.05, 0.12, marble, 0, 0.04 + h, 0.14);
  b.prism(0.78, 0.18, 0.12, marble, 0, 0.09 + h, 0.14);
  b.box(0.74, 0.06, 0.5, marbleD, 0, 0.04 + h, -0.12);
  b.dome(0.17, '#ffd23d', 0, 0.1 + h, -0.14, {}, 'smooth', 12);
  b.cyl(0.012, 0.012, 0.12, '#ffd23d', 0, 0.27 + h, -0.14);
  b.box(0.18, 0.28, 0.02, '#3a2a1a', 0, 0.145, -0.02 + 0.13 - 0.12);
  b.glowBox(0.1, 0.05, 0.02, '#ffd23d', 3, 0, 0.18 + h * 0.7, 0.21, {}, '#e2b33c', true);
  b.part(flagPart('#2f7a4c', 0.012, 0.36 + h, -0.14, 0.16, 0.09));
  // gold bars by the vault door and a lamp each side
  for (let k = 0; k < 2 + level; k++) b.box(0.08, 0.035, 0.04, '#ffd23d', 0.32, 0.04 + (k % 2) * 0.035, 0.36 - Math.floor(k / 2) * 0.05, {}, 'smooth');
  for (const x of [-0.38, 0.38]) {
    b.cyl(0.012, 0.012, 0.3, DARK, x, 0.04, 0.4);
    b.glowBall(0.03, '#ffd88a', 5, x, 0.36, 0.4);
  }
  b.light(0, 0.4, 0.45, '#ffe0a0', 2);
}

function museum(b, c, level) {
  const stone = '#ddd6c8', stoneD = '#b8b0a0';
  b.box(1.9, 0.04, 1.9, stoneD, 0, 0, 0, {}, 'rough');
  // a wide stair, a colonnade and a great hall behind it
  for (let k = 0; k < 4; k++) b.box(1.4 - k * 0.08, 0.035, 0.36 - k * 0.06, stone, 0, 0.04 + k * 0.035, 0.72 - k * 0.03);
  const h = 0.78 + (level - 1) * 0.12;
  b.box(1.5, h, 1.0, '#ece6da', 0, 0.04, -0.2);
  for (let k = 0; k < 6; k++) b.cyl(0.045, 0.05, h - 0.06, stone, -0.6 + k * 0.24, 0.18, 0.42, {}, 'smooth', 8);
  b.box(1.56, 0.07, 0.24, stone, 0, 0.04 + h + 0.0, 0.4);
  b.prism(1.58, 0.3, 0.2, stone, 0, 0.11 + h, 0.4);
  b.box(1.56, 0.07, 1.04, stoneD, 0, 0.04 + h, -0.2);
  b.box(0.9, 0.24, 0.6, '#ece6da', 0, 0.11 + h, -0.3);
  b.dome(0.36, '#5aa8a0', 0, 0.35 + h, -0.3, {}, 'smooth', 14);
  b.glowBox(0.04, 0.05, 0.04, '#ffd23d', 4, 0, 0.7 + h, -0.3, {}, '#e2b33c', true);
  // tall glowing windows behind the columns
  for (let k = 0; k < 4; k++) b.glowBox(0.12, h * 0.5, 0.02, '#ffd8a0', 3, -0.42 + k * 0.28, 0.2, 0.31);
  b.box(0.26, 0.4, 0.02, '#3a2a1a', 0, 0.18, 0.305);
  // banners on the facade and a dinosaur skeleton in the garden
  for (const [x, col] of [[-0.66, '#c94a3d'], [0.66, '#4a6ab0']]) {
    b.box(0.1, 0.36, 0.01, col, x, 0.3, 0.31, {}, 'smooth');
    b.box(0.1, 0.03, 0.012, '#ffd23d', x, 0.62, 0.312, {}, 'smooth');
  }
  const bone = '#f4efe2';
  b.box(0.5, 0.04, 0.04, bone, 0.55, 0.32, 0.86, { rz: 0.1 }, 'smooth');
  for (let k = 0; k < 5; k++) b.box(0.015, 0.1, 0.12, bone, 0.4 + k * 0.07, 0.26, 0.86, {}, 'smooth');
  b.box(0.12, 0.06, 0.06, bone, 0.82, 0.38, 0.86, {}, 'smooth');
  for (const x of [0.42, 0.68]) b.box(0.025, 0.28, 0.025, bone, x, 0.04, 0.86, {}, 'smooth');
  b.box(0.14, 0.04, 0.02, bone, 0.24, 0.3, 0.86, { rz: -0.4 }, 'smooth');
  b.box(0.36, 0.04, 0.2, stone, 0.55, 0.04, 0.86, {}, 'rough');
  b.part(flagPart('#ffd23d', 0.012, 0.95 + h, -0.3, 0.2, 0.1));
  b.cyl(0.01, 0.01, 0.25, DARK, 0, 0.7 + h, -0.3);
  b.light(0, 0.5, 0.9, '#ffe0a0', 2.6);
  b.light(-0.6, 0.4, 0.9, '#ffe0a0', 1.6);
}

// ---- v1.3 exploring and guarding
function scout(b, c) {
  // a tall wooden lookout on four legs with a ladder, a roofed platform and a pennant
  b.box(0.7, 0.04, 0.7, '#8a6a4a', 0, 0, 0, {}, 'rough');
  const H = 1.25;
  for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) b.box(0.06, H, 0.06, WOOD_D, x, 0.04, z, { rx: z * 0.15, rz: -x * 0.15 });
  for (const y of [0.35, 0.75]) {
    b.box(0.46, 0.035, 0.035, WOOD, 0, y, 0.2);
    b.box(0.46, 0.035, 0.035, WOOD, 0, y, -0.2);
    b.box(0.035, 0.035, 0.46, WOOD, 0.2, y, 0);
    b.box(0.035, 0.035, 0.46, WOOD, -0.2, y, 0);
  }
  for (let k = 0; k < 6; k++) b.box(0.16, 0.025, 0.025, WOOD, 0, 0.12 + k * 0.19, 0.3);
  b.box(0.58, 0.05, 0.58, WOOD, 0, H, 0);
  for (const s of [-1, 1]) {
    b.box(0.58, 0.14, 0.03, WOOD_D, 0, H + 0.05, s * 0.28);
    b.box(0.03, 0.14, 0.58, WOOD_D, s * 0.28, H + 0.05, 0);
  }
  for (const [x, z] of [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]]) b.box(0.035, 0.32, 0.035, WOOD_D, x, H + 0.05, z);
  b.cone(0.48, 0.3, c.roof, 0, H + 0.37, 0, { ry: Math.PI / 4 }, 'rough', 4);
  b.box(0.02, 0.3, 0.02, '#5a5e68', 0, H + 0.6, 0);
  b.box(0.16, 0.08, 0.01, '#e94f4f', 0.08, H + 0.82, 0);
  b.glowBox(0.05, 0.07, 0.05, '#ffc36b', 5, 0.18, H + 0.12, 0.18, {}, '#c8a040');
  b.light(0.18, H + 0.2, 0.18, '#ffc36b', 1.4);
}

function guard(b, c) {
  // a small stone watch hut with a wooden fence, a lantern and a signal horn on a post
  b.box(0.9, 0.04, 0.9, '#8a7a62', 0, 0, 0, {}, 'rough');
  b.box(0.46, 0.42, 0.42, shade(c.stone, 1.05), -0.1, 0.04, -0.1, {}, 'rough');
  b.prism(0.5, 0.46, 0.22, c.roof, -0.1, 0.46, -0.1);
  b.box(0.14, 0.24, 0.02, '#4a3020', -0.1, 0.04, 0.115);
  b.glowBox(0.1, 0.08, 0.02, '#ffc36b', 4, 0.06, 0.26, 0.115, {}, '#3a3046');
  for (let k = 0; k < 6; k++) b.box(0.04, 0.2, 0.04, WOOD_D, -0.4 + k * 0.16, 0.04, 0.38);
  b.box(0.86, 0.03, 0.03, WOOD, 0, 0.18, 0.38);
  b.box(0.04, 0.6, 0.04, WOOD_D, 0.32, 0.04, -0.3);
  b.cyl(0.03, 0.07, 0.16, '#d8b060', 0.32, 0.62, -0.3, { rz: -1.2 }, 'smooth', 8);
  b.cyl(0.03, 0.03, 0.08, '#2c3140', 0.3, 0.32, 0.12, {}, 'smooth', 6);
  b.glowBox(0.06, 0.07, 0.06, '#ffe08a', 6, 0.3, 0.38, 0.12, {}, '#c8a040');
  b.light(0.3, 0.45, 0.2, '#ffd08a', 1.6);
}

// ---- v1.3 hazard defences
function seawall(b, c) {
  // a curved stone breakwater with a walkway, mooring posts and a small warning light
  b.box(0.96, 0.04, 0.96, '#c9b48a', 0, 0, 0, {}, 'rough');
  for (let k = 0; k < 5; k++) {
    const x = -0.4 + k * 0.2;
    b.box(0.2, 0.34 + (k % 2) * 0.03, 0.34, shade(c.stone, 0.9 + (k % 2) * 0.12), x, 0.04, -0.22, {}, 'rough');
  }
  b.box(0.96, 0.05, 0.4, shade(c.stone, 1.15), 0, 0.38, -0.22, {}, 'rough');
  for (let k = 0; k < 6; k++) b.box(0.14, 0.1, 0.14, shade(c.stone, 0.75), -0.4 + k * 0.16, 0.04, 0.14 + (k % 2) * 0.08, { ry: k * 0.7 }, 'rough');
  for (const x of [-0.36, 0.36]) b.cyl(0.035, 0.035, 0.16, WOOD_D, x, 0.43, -0.08, {}, 'solid', 6);
  b.cyl(0.03, 0.03, 0.34, '#e9e4da', 0.42, 0.43, -0.34, {}, 'smooth', 6);
  b.glowBox(0.07, 0.07, 0.07, '#ff6a4a', 6, 0.42, 0.78, -0.34, {}, '#c8402a');
  b.light(0.42, 0.85, -0.34, '#ff8a6a', 1.2);
}

function terracewall(b, c) {
  // three stepped dry-stone terraces with a few shrubs on top
  for (let k = 0; k < 3; k++) {
    const z = 0.3 - k * 0.3, h = 0.16 + k * 0.16;
    for (let n = 0; n < 4; n++) b.box(0.22, h, 0.26, shade(c.stone, 0.85 + ((n + k) % 3) * 0.1), -0.33 + n * 0.22, 0, z, {}, 'rough');
    b.box(0.9, 0.04, 0.26, '#6eb156', 0, h, z, {}, 'leaf');
  }
  for (const [x, z] of [[-0.25, -0.3], [0.2, 0.0], [0.3, -0.32]]) b.ball(0.09, LEAF, x, 0.52 - (z > -0.1 ? 0.16 : 0), z, {}, 'leaf', 0);
}

function windbreak(b, c) {
  // a reed fence in front of a row of date palms
  b.box(0.96, 0.04, 0.96, '#e2c48a', 0, 0, 0, {}, 'rough');
  for (let k = 0; k < 11; k++) b.box(0.05, 0.42 + (k % 3) * 0.04, 0.04, k % 2 ? '#c8a060' : '#b08850', -0.42 + k * 0.084, 0.04, 0.3, {}, 'rough');
  b.box(0.92, 0.03, 0.03, WOOD_D, 0, 0.3, 0.33);
  for (const x of [-0.3, 0.05, 0.36]) {
    b.cyl(0.04, 0.055, 0.7, '#8a6a46', x, 0.04, -0.15, { rz: x * 0.15 }, 'rough', 6);
    for (let a = 0; a < 5; a++) b.box(0.32, 0.02, 0.07, '#4f9a4a', x + Math.cos(a * 1.26) * 0.12, 0.74, -0.15 + Math.sin(a * 1.26) * 0.12, { ry: -a * 1.26, rz: -0.35 }, 'leaf');
  }
}

const BUILDERS = {
  balai, vila, apartemen, ladang, penebang, tambang, nelayan, bijih, pasir, kristal, kincir, gudang, bengkel, pasar, kedai, toko,
  sumur, taman, lampu, pohon: pohonHias, bunga, bangku, airmancur, monumen, lumbung, rumahpohon: rumahPohon, observatorium, obelisk,
  menarajam: menaraJam, pohonkehidupan: pohonKehidupan,
  peternakan, kebun, penggergajian, tungku, kaca, klinik, sekolah, perpustakaan, taman_bermain: tamanBermain, panggung, menara_air: menaraAir,
  pemadam, roti, lab, pelabuhan, bank, museum, seawall, terracewall, windbreak, scout, guard,
};

/**
 * Build the mesh for a building record. Returns a group (local origin = footprint centre, base y = 0)
 * with userData.lights, userData.smoke and animated parts.
 */
export function buildingModel(rec, biome) {
  const b = new Builder();
  const c = colorsFor(biome, rec.paint || 0);
  const level = rec.level || 1;
  const rand = rng(rec.id * 977 + 13);
  if (rec.type === 'rumah') (HOUSE[biome] || houseCottage)(b, c, level);
  else if (rec.type === 'mercusuar') lighthouseInto(b, c, level);
  else (BUILDERS[rec.type] || sumur)(b, c, level, biome, rand);
  const g = b.build();
  if (rec.type === 'mercusuar') g.add(b._beam);
  return g;
}

function lighthouseInto(b, c, level) {
  const h = 1.7, r = 0.26;
  b.cyl(0.36, 0.38, 0.08, c.stone, 0, 0, 0, {}, 'rough', 10);
  const seg = 6;
  for (let k = 0; k < seg; k++) {
    const t0 = k / seg, t1 = (k + 1) / seg;
    b.cyl(r * (1 - t1 * 0.28), r * (1 - t0 * 0.28), h / seg, k % 2 ? '#c8433a' : '#f2efe8', 0, 0.08 + t0 * h, 0, {}, 'solid', 12);
  }
  b.cyl(r * 0.95, r * 0.95, 0.05, DARK, 0, 0.08 + h, 0, {}, 'solid', 12);
  b.glowBox(0.26, 0.22, 0.26, '#ffe08a', 8, 0, 0.13 + h, 0, {}, '#59627a');
  b.cone(r * 0.75, 0.22, '#c8433a', 0, 0.35 + h, 0, {}, 'smooth', 8);
  b.light(0, 0.25 + h, 0, '#ffe08a', 4);
  const L = 5;
  const parts = [];
  for (const s of [1, -1]) {
    const g = new THREE.ConeGeometry(0.45, L, 16, 1, true);
    g.translate(0, -L / 2, 0);
    g.rotateZ((s * Math.PI) / 2);
    g.deleteAttribute('uv');
    parts.push(g);
  }
  const beamMat = fxMaterial({
    vertexShader: /* glsl */`
      uniform float uLen;
      varying float vD;
      void main() { vD = abs(position.x) / uLen; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uLamps;
      uniform vec3 uColor;
      varying float vD;
      void main() { gl_FragColor = vec4(uColor * 2.0, uLamps * (1.0 - vD) * (1.0 - vD) * 0.28); gNormal = vec4(0.0); }`,
    uniforms: { uLen: { value: L }, uLamps: shared.uLamps, uColor: { value: new THREE.Color('#ffe08a') } },
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(mergeGeometries(parts, false), beamMat);
  beam.position.y = 0.24 + h;
  beam.frustumCulled = false;
  beam.userData.spin = 'y';
  beam.userData.noMirror = true;
  b._beam = beam;
}

// ---------------------------------------------------------------- nature node geometry

/** One merged geometry per node kind and variant, for instancing. */
const NODE_GEO = {};
export function nodeGeometry(kind, v) {
  const key = `${kind}:${v}`;
  if (NODE_GEO[key]) return NODE_GEO[key];
  const rand = rng(31 + v * 101 + kind.length * 7);
  const b = new Builder();
  switch (kind) {
    case 'tree':
    case 'pine':
    case 'palm':
    case 'cactus':
    case 'mushroom':
      treeParts(b, kind, rand, 0.95 + v * 0.15);
      break;
    case 'bush': {
      const g = bushGeometry(rand, { r: 0.24 + v * 0.03, blobs: 3, leaf: '#4d8f45' });
      b.add('leaf', g, '#4d8f45');
      for (let k = 0; k < 5; k++) b.ball(0.03, '#e94f4f', (rand() - 0.5) * 0.4, 0.22 + rand() * 0.15, (rand() - 0.5) * 0.4, {}, 'leaf', 0);
      break;
    }
    case 'rock': {
      const g = rockGeometry(rand, 0.28 + v * 0.06, '#8d909b');
      b.add('rough', g, v === 1 ? '#9a9da8' : '#8d909b', { y: 0.08 });
      const g2 = rockGeometry(rand, 0.14, '#7d808b');
      b.add('rough', g2, '#7d808b', { x: 0.22, y: 0.04, z: 0.12 });
      break;
    }
    case 'ore': {
      const g = rockGeometry(rand, 0.3, '#6a6e78');
      b.add('rough', g, '#6a6e78', { y: 0.1 });
      for (let k = 0; k < 4; k++) b.ball(0.05, k % 2 ? '#c97a4a' : '#e2a05a', (rand() - 0.5) * 0.3, 0.12 + rand() * 0.15, (rand() - 0.5) * 0.3, {}, 'solid', 0);
      break;
    }
    case 'dune': {
      b.dome(0.34, '#e8d3a0', 0, -0.02, 0, { sy: 0.45 }, 'rough');
      b.dome(0.18, '#efdcab', 0.2, -0.02, 0.15, { sy: 0.5 }, 'rough');
      break;
    }
    case 'crystal': {
      for (let k = 0; k < 4; k++) {
        const g = new THREE.OctahedronGeometry(0.1 + rand() * 0.06, 0);
        g.scale(0.7, 2.0, 0.7);
        b.add('glow|#7df9ff|4|#5aa8d8|1', g, '#ffffff', { x: (rand() - 0.5) * 0.3, y: 0.15, z: (rand() - 0.5) * 0.3, rz: (rand() - 0.5) * 0.6, rx: (rand() - 0.5) * 0.6 });
      }
      b.ball(0.12, '#8a7fc0', 0, 0.02, 0, {}, 'rough', 0);
      break;
    }
  }
  const out = [];
  for (const [bucket, geos] of b.parts) out.push({ bucket, geo: geos.length === 1 ? geos[0] : mergeGeometries(geos, false) });
  NODE_GEO[key] = out;
  return out;
}

export function materialFor(bucket) {
  if (bucket.startsWith('glow|')) {
    const [, color, power, day, always] = bucket.split('|');
    return mats.glow(color, +power, day, always === '1');
  }
  return (mats[bucket] || mats.solid)();
}

/** Dispose geometries under an object; shared materials are kept. */
export function disposeModel(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    if (m && !m.userData?.shared) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
  });
}
