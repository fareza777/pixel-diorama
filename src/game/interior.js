// House interiors: tap a home (or the Town Hall, the Mayor's own house), press Enter, and the view
// switches to a cut-away diorama of the inside, rendered by the same pixel engine. The residents
// living there show up when the routine has them at home: they cook, eat, chat on the sofa, read,
// warm up by the fire, and at night they sleep in their beds while the lamps go out and moonlight
// comes through the windows. In decorating mode the player buys furniture and arranges it on a grid.
import * as THREE from 'three';
import { Builder, disposeModel } from './models.js';
import { fxMaterial, toon } from '../engine/materials.js';
import { Crowd } from './people.js';
import { FURNITURE, WALLPAPERS, FLOORS, CELL, furnitureModel, footprintOf, homeStats, roomSize, doorCell, defaultFurniture } from './furniture.js';
export { ENTERABLE } from './furniture.js';

const WALL_H = 1.12;
const WALL_T = 0.08;
const C = (hex) => new THREE.Color(hex);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- materials for the shell

let _quadMat = null;
function quadMat() {
  return (_quadMat ||= fxMaterial({
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        vec2 e = min(vUv, 1.0 - vUv);
        float edge = step(min(e.x, e.y), 0.08);
        gl_FragColor = vec4(uColor, edge > 0.5 ? 0.9 : 0.28);
        gNormal = vec4(0.0);
      }`,
    uniforms: { uColor: { value: new THREE.Color('#7fe08a') } },
  }));
}

// ---------------------------------------------------------------- the interior

export class Interior {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.scene = null;
    this.rec = null;
    this.items = []; // { f, group, def, i }
    this.people = new Map(); // npc id -> resident runtime
    this.time = 0;
    this._v = new THREE.Vector3();
    this.lampLevel = 0;
    this.selected = -1;
    this.place = null; // { t, x, z, r, fromInv, move }
  }
  get game() { return this.app.game; }
  get world() { return this.app.world; }
  get engine() { return this.app.engine; }

  // ---------------------------------------------------------------- enter / exit

  enter(rec) {
    if (this.active) this.exit(true);
    const g = this.game;
    this.rec = rec;
    if (!rec.furni) {
      rec.furni = defaultFurniture(rec, rec.type === 'balai' ? 1 : g.housingOf(rec));
      g.markFurni(rec);
    }
    rec.wall ??= 0;
    rec.floor ??= 0;
    const [W, D] = roomSize(rec);
    this.W = W;
    this.D = D;
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this._buildShell();
    this._buildItems();
    this._buildLights();
    this.crowd = new Crowd(24);
    this.root.add(this.crowd.group);
    this.cellQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), quadMat().clone());
    this.cellQuad.rotation.x = -Math.PI / 2;
    this.cellQuad.visible = false;
    this.cellQuad.renderOrder = 4;
    this.root.add(this.cellQuad);
    this.engine.prepareScene(this.scene);
    this._savedMirror = this.engine.mirror;
    this.engine.mirror = null;

    // the Mayor steps in through the door
    const [dx, dz] = doorCell(W, D);
    const [mx, mz] = this.cellPos(dx, dz);
    this.mayor = { id: 'mayor', pos: new THREE.Vector3(mx - CELL * 0.6, 0, mz), yaw: 0, anim: 'idle', phase: 0, path: null, slot: this.crowd.alloc(this.world.mayor.look) };
    this._walkTo(this.mayor, [dx + 1, dz]);
    this.people.clear();
    this._taken = new Map();
    this.time = 0;
    this._syncResidents(true);

    // camera: save the island view, frame the room
    const cam = this.app.cam, v = this.engine.view;
    this._saved = { az: cam.goal.az, el: cam.goal.el, zoom: cam.goal.zoom, target: cam.goal.target.clone(), limits: { ...cam.limits }, bounds: cam.bounds, follow: cam.follow };
    cam.follow = null;
    // fit the whole room on screen (portrait phones are limited by width)
    const aspect = this.engine.canvas.clientWidth / Math.max(1, this.engine.canvas.clientHeight);
    const across = (W + D) * CELL * 0.707 + 0.5;
    const tall = (W + D) * CELL * 0.707 * Math.sin(THREE.MathUtils.degToRad(38)) + WALL_H + 0.7;
    const z0 = Math.min((v.size * aspect) / (across * 1.06), v.size / (tall * 1.12));
    cam.limits = { zoom: [z0 * 0.85, z0 * 2.6], el: [24, 62] };
    cam.bounds = Math.max(W, D) * CELL * 0.55;
    cam.set({ az: 45, el: 38, zoom: z0, target: new THREE.Vector3(0, 0.15, 0) });
    this.active = true;
    this.app.audio.play('whoosh', { dur: 0.6, gain: 0.25 });
    this._cutaway(true);
  }

  exit(silent = false) {
    if (!this.active) return;
    this.active = false;
    this.place = null;
    this.selected = -1;
    const cam = this.app.cam, s = this._saved;
    if (s) {
      cam.limits = s.limits;
      cam.bounds = s.bounds;
      cam.set({ az: s.az, el: s.el, zoom: s.zoom, target: s.target });
    }
    this.engine.mirror = this._savedMirror ?? null;
    this.crowd?.dispose();
    for (const it of this.items) disposeModel(it.group);
    if (this.root) disposeModel(this.root);
    this.items = [];
    this.people.clear();
    this.scene = null;
    // the Mayor comes back out of the front door
    const door = this.world.doorTile(this.rec);
    if (door) {
      this.world.mayor.task = null;
      this.world.mayor.path = null;
      this.world.mayor.mode = 'idle';
      this.world._placeAt(this.world.mayor, door, false);
    }
    this.rec = null;
    if (!silent) this.app.audio.play('whoosh', { dur: 0.6, gain: 0.25 });
  }

  // ---------------------------------------------------------------- grid helpers

  cellPos(x, z) {
    return [(x + 0.5) * CELL - (this.W * CELL) / 2, (z + 0.5) * CELL - (this.D * CELL) / 2];
  }
  cellAt(px, pz) {
    return [Math.floor((px + (this.W * CELL) / 2) / CELL), Math.floor((pz + (this.D * CELL) / 2) / CELL)];
  }
  /** World transform of a placed item. */
  itemXform(f) {
    const d = FURNITURE[f.t];
    const hw = (this.W * CELL) / 2, hd = (this.D * CELL) / 2;
    if (d.wall) {
      const [cx, cz] = this.cellPos(f.x, f.z);
      if (f.r === 0) return { x: cx, z: -hd, ry: 0 };
      if (f.r === 1) return { x: -hw, z: cz, ry: Math.PI / 2 };
      if (f.r === 2) return { x: cx, z: hd, ry: Math.PI };
      return { x: hw, z: cz, ry: -Math.PI / 2 };
    }
    const [fw, fd] = footprintOf(f.t, f.r);
    return { x: (f.x + fw / 2) * CELL - hw, z: (f.z + fd / 2) * CELL - hd, ry: f.r * (Math.PI / 2) };
  }
  _blocked() {
    const set = new Set();
    for (const f of this.rec.furni) {
      const d = FURNITURE[f.t];
      if (!d || d.wall || d.layer === 'rug') continue;
      const [fw, fd] = footprintOf(f.t, f.r);
      for (let a = 0; a < fw; a++) for (let b = 0; b < fd; b++) set.add(`${f.x + a},${f.z + b}`);
    }
    return set;
  }
  canPlace(t, x, z, r, ignore = -1) {
    const d = FURNITURE[t];
    const W = this.W, D = this.D;
    if (d.wall) {
      const along = r % 2 ? z : x;
      if (along < 0 || along >= (r % 2 ? D : W)) return false;
      if (this.wallHoles[r]?.has(along)) return false;
      return !this.rec.furni.some((f, i) => i !== ignore && FURNITURE[f.t]?.wall && f.r === r && (r % 2 ? f.z === z : f.x === x));
    }
    const [fw, fd] = footprintOf(t, r);
    if (x < 0 || z < 0 || x + fw > W || z + fd > D) return false;
    const [dx, dz] = doorCell(W, D);
    const cells = [];
    for (let a = 0; a < fw; a++) for (let b = 0; b < fd; b++) cells.push([x + a, z + b]);
    if (d.layer !== 'rug' && cells.some(([a, b]) => b === dz && (a === dx || a === dx + 1))) return false;
    for (let i = 0; i < this.rec.furni.length; i++) {
      if (i === ignore) continue;
      const o = this.rec.furni[i], od = FURNITURE[o.t];
      if (!od || od.wall) continue;
      if ((od.layer === 'rug') !== (d.layer === 'rug')) continue;
      const [ow, oh] = footprintOf(o.t, o.r);
      if (x < o.x + ow && x + fw > o.x && z < o.z + oh && z + fd > o.z) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- building the room

  _buildShell() {
    const W = this.W, D = this.D, rec = this.rec;
    const w = W * CELL, d = D * CELL;
    const wp = WALLPAPERS[rec.wall] || WALLPAPERS[0];
    const fl = FLOORS[rec.floor] || FLOORS[0];
    const base = new Builder();
    // the diorama slab: soil and stone under the floorboards, like a slice of the island
    base.box(w + 0.34, 0.12, d + 0.34, '#6a5848', 0, -0.42, 0, {}, 'rough');
    base.box(w + 0.3, 0.18, d + 0.3, '#8e6444', 0, -0.3, 0, {}, 'rough');
    base.box(w + 0.26, 0.05, d + 0.26, '#5b9547', 0, -0.13, 0, {}, 'rough');
    base.box(w + 0.06, 0.06, d + 0.06, '#6b4a33', 0, -0.1, 0, {}, 'rough');
    // floor
    if (fl.tiles) {
      for (let x = 0; x < W; x++)
        for (let z = 0; z < D; z++) {
          const [cx, cz] = this.cellPos(x, z);
          base.box(CELL - 0.008, 0.05, CELL - 0.008, (x + z) % 2 ? fl.b : fl.a, cx, -0.05, cz, {}, 'smooth');
        }
    } else {
      const rows = Math.round(d / 0.125);
      for (let k = 0; k < rows; k++) {
        const z = -d / 2 + (k + 0.5) * 0.125;
        let x = -w / 2, n = k * 3;
        while (x < w / 2 - 0.01) {
          const len = Math.min(w / 2 - x, 0.45 + ((n * 37) % 5) * 0.12);
          base.box(len - 0.006, 0.05, 0.118, (n + k) % 3 ? fl.a : fl.b, x + len / 2, -0.05, z, {}, 'rough');
          x += len;
          n++;
        }
      }
    }
    this.root.add(this.floor = base.build());
    this.floor.userData.floor = true;

    // walls: four separate groups so the ones facing the camera can be cut away
    const [dx, dz] = doorCell(W, D);
    this.walls = [];
    const mk = (side) => {
      const b = new Builder();
      const along = side % 2 ? d : w; // length of this wall
      const L = along + WALL_T * 2;
      const paint = (x0, len, y0, h) => {
        if (wp.planks) {
          for (let y = y0; y < y0 + h - 0.01; y += 0.1) b.box(len, Math.min(0.1, y0 + h - y) - 0.006, WALL_T, Math.round(y * 10) % 2 ? wp.a : wp.b, x0 + len / 2, y, 0, {}, 'rough');
        } else if (wp.brick) {
          let row = 0;
          for (let y = y0; y < y0 + h - 0.01; y += 0.08, row++) {
            const hh = Math.min(0.08, y0 + h - y) - 0.008;
            let x = x0 - (row % 2 ? 0.08 : 0);
            while (x < x0 + len) {
              const a = Math.max(x, x0), e = Math.min(x + 0.16, x0 + len);
              if (e - a > 0.01) b.box(e - a - 0.008, hh, WALL_T, (row + Math.round(x * 7)) % 3 ? wp.a : wp.b, (a + e) / 2, y, 0, {}, 'rough');
              x += 0.16;
            }
          }
        } else {
          b.box(len, h, WALL_T, wp.a, x0 + len / 2, y0, 0, {}, 'solid');
          if (wp.stripes) for (let x = x0 + 0.06; x < x0 + len; x += 0.16) b.box(0.05, h, 0.004, wp.b, x, y0, WALL_T / 2, {}, 'solid');
          if (wp.stars) for (let k = 0; k < len * 6; k++) b.box(0.02, 0.02, 0.004, '#ffe8a0', x0 + ((k * 0.37) % len), y0 + 0.2 + ((k * 0.61) % (h - 0.3)), WALL_T / 2, {}, 'smooth');
        }
      };
      // openings along this wall: windows (back and right walls) and the door (left wall)
      const holes = [];
      if (side === 1) holes.push({ c: dz, kind: 'door' });
      if (side === 0) {
        holes.push({ c: Math.max(1, Math.floor(W * 0.28)), kind: 'win' });
        if (W >= 8) holes.push({ c: Math.min(W - 2, Math.floor(W * 0.72)), kind: 'win' });
      }
      if (side === 3) holes.push({ c: Math.floor(D / 2), kind: 'win' });
      if (side === 2 && W >= 9) holes.push({ c: Math.floor(W / 2), kind: 'win' });
      this.wallHoles[side] = new Set(holes.map((h) => h.c));
      // cell centre along the wall, in the wall's own x (the left and front walls run backwards)
      const flip = side === 1 || side === 2 ? -1 : 1;
      const local = (c) => flip * ((c + 0.5) * CELL - along / 2);
      // solid segments between holes
      let x = -L / 2;
      const hs = [...holes].sort((a, b) => local(a.c) - local(b.c));
      for (const h of hs) {
        const hw = h.kind === 'door' ? 0.36 : 0.34;
        const c0 = local(h.c) - hw / 2, c1 = local(h.c) + hw / 2;
        paint(x, c0 - x, 0, WALL_H);
        if (h.kind === 'door') paint(c0, hw, 0.74, WALL_H - 0.74);
        else {
          paint(c0, hw, 0, 0.36);
          paint(c0, hw, 0.8, WALL_H - 0.8);
        }
        x = c1;
      }
      paint(x, L / 2 - x, 0, WALL_H);
      // trim: skirting board and a crown along the top
      b.box(L, 0.07, WALL_T + 0.025, '#6b4a33', 0, 0, 0.012);
      b.box(L, 0.04, WALL_T + 0.03, '#8a6446', 0, WALL_H - 0.04, 0.0);
      // windows and door
      for (const h of hs) {
        const cx = local(h.c);
        if (h.kind === 'door') {
          b.box(0.4, 0.04, WALL_T + 0.04, '#6b4a33', cx, 0.74, 0);
          for (const s of [-1, 1]) b.box(0.04, 0.74, WALL_T + 0.04, '#6b4a33', cx + s * 0.2, 0, 0);
          b.box(0.32, 0.7, 0.03, '#8a5a38', cx, 0, -WALL_T / 2 + 0.01);
          for (const y of [0.12, 0.42]) b.box(0.24, 0.18, 0.01, '#9a6a46', cx, y, -WALL_T / 2 + 0.03);
          b.ball(0.018, '#d8a84a', cx + 0.11, 0.36, 0.0, {}, 'smooth', 0);
          b.box(0.34, 0.012, 0.18, '#a8402f', cx, 0, 0.12, {}, 'smooth');
        } else {
          b.box(0.4, 0.04, WALL_T + 0.08, '#efe6d6', cx, 0.34, 0.02);
          b.box(0.4, 0.04, WALL_T + 0.02, '#efe6d6', cx, 0.8, 0);
          for (const s of [-1, 1]) b.box(0.035, 0.46, WALL_T + 0.02, '#efe6d6', cx + s * 0.185, 0.36, 0);
          b.box(0.02, 0.44, 0.02, '#efe6d6', cx, 0.36, 0.0);
          b.box(0.34, 0.02, 0.02, '#efe6d6', cx, 0.57, 0.0);
          // curtains
          for (const s of [-1, 1]) b.box(0.07, 0.5, 0.02, s < 0 ? '#c94a3d' : '#c94a3d', cx + s * 0.23, 0.33, WALL_T / 2 + 0.02, {}, 'smooth');
          b.box(0.56, 0.025, 0.025, '#6b4a33', cx, 0.84, WALL_T / 2 + 0.03);
          b.cyl(0.03, 0.025, 0.05, '#c56b44', cx + 0.1, 0.36, 0.06, {}, 'rough', 6);
          b.ball(0.035, '#ff8fb1', cx + 0.1, 0.43, 0.06, {}, 'leaf', 0);
        }
      }
      const g = b.build();
      // window glass: its own material, coloured by the sky outside each frame
      for (const h of hs) {
        if (h.kind !== 'win') continue;
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.44, 0.01), this.glassMat ||= toon('#9fc8ff', { emissive: '#9fc8ff', emissiveIntensity: 1, noise: 0, snow: 0, wet: 0 }));
        glass.position.set(local(h.c), 0.58, -0.005);
        g.add(glass);
      }
      // a low stub that stays visible when the wall is cut away
      const sb = new Builder();
      sb.box(L, 0.09, WALL_T, wp.a, 0, 0, 0, {}, 'solid');
      sb.box(L, 0.025, WALL_T + 0.03, '#6b4a33', 0, 0.09, 0);
      const stub = sb.build();
      const grp = new THREE.Group();
      grp.add(g, stub);
      // place: side 0 back (z-), 1 left (x-), 2 front (z+), 3 right (x+); local +z faces inside
      const hw = w / 2 + WALL_T / 2, hd = d / 2 + WALL_T / 2;
      if (side === 0) grp.position.set(0, 0, -hd);
      if (side === 1) { grp.position.set(-hw, 0, 0); grp.rotation.y = Math.PI / 2; }
      if (side === 2) { grp.position.set(0, 0, hd); grp.rotation.y = Math.PI; }
      if (side === 3) { grp.position.set(hw, 0, 0); grp.rotation.y = -Math.PI / 2; }
      const out = [[0, -1], [-1, 0], [0, 1], [1, 0]][side];
      this.root.add(grp);
      this.walls.push({ side, grp, full: g, stub, out, items: [] });
    };
    this.wallHoles = [];
    for (let s = 0; s < 4; s++) mk(s);
    this.root.updateMatrixWorld(true);
  }

  _buildItems() {
    for (const it of this.items) {
      it.group.parent?.remove(it.group);
      disposeModel(it.group);
    }
    this.items = [];
    this.lightSources = [];
    this.rec.furni.forEach((f, i) => this._addItem(f, i));
  }

  _addItem(f, i) {
    const def = FURNITURE[f.t];
    if (!def) return;
    const group = furnitureModel(f.t, this.rec.id + i * 3);
    const X = this.itemXform(f);
    group.position.set(X.x, def.layer === 'rug' ? 0.002 : 0, X.z);
    group.rotation.y = X.ry;
    group.traverse((o) => (o.userData.fi = i));
    if (def.clock) {
      const hand = (len, w, color) => {
        const b = new Builder();
        b.box(w, len, 0.01, color, 0, 0, 0);
        const m = b.build();
        m.position.set(0, 0.6, 0.03);
        group.add(m);
        return m;
      };
      group.userData.hour = hand(0.055, 0.016, '#2a2e3a');
      group.userData.minute = hand(0.075, 0.01, '#2a2e3a');
    }
    const it = { f, i, def, group };
    // wall items ride with their wall so they disappear with it
    if (def.wall) {
      const w = this.walls[f.r];
      w.grp.updateMatrixWorld(true);
      w.grp.attach(group);
      w.items.push(it);
    } else this.root.add(group);
    if (def.light) {
      const L = def.light;
      const p = new THREE.Vector3(L.x || 0, L.y, L.z || 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), X.ry).add(new THREE.Vector3(X.x, 0, X.z));
      this.lightSources.push({ pos: p, color: new THREE.Color(L.color), power: L.power, flicker: L.flicker, fire: f.t === 'fireplace' || f.t === 'stove', it });
    }
    this.items[i] = it;
    return it;
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight('#dfe8ff', '#6b5a4a', 0.8);
    this.sun = new THREE.DirectionalLight('#fff0d8', 1.2);
    this.sun.castShadow = true;
    const S = Math.max(this.W, this.D) * CELL * 0.75;
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 0.5, far: 20 });
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.root.add(this.hemi, this.sun, this.sun.target);
    const n = Math.max(1, Math.min(3, this.world.quality.lights));
    this.pool = [];
    for (let k = 0; k < n; k++) {
      const l = new THREE.PointLight('#ffbe6b', 0, 2.6, 2);
      this.root.add(l);
      this.pool.push(l);
    }
    this._assignLights();
  }

  _assignLights() {
    const src = [...this.lightSources].sort((a, b) => (b.fire ? 2 : 0) + b.power - ((a.fire ? 2 : 0) + a.power));
    this.pool.forEach((l, k) => {
      const s = src[k];
      l.userData.src = s || null;
      if (s) {
        l.position.copy(s.pos);
        l.color.copy(s.color);
      }
      l.intensity = 0;
    });
  }

  rebuild() {
    // furniture or finishes changed: rebuild everything but keep the people where they are
    const keep = [...this.people.values()];
    const m = this.mayor;
    for (const it of this.items) disposeModel(it.group);
    for (const w of this.walls) {
      this.root.remove(w.grp);
      disposeModel(w.grp);
    }
    this.root.remove(this.floor);
    disposeModel(this.floor);
    for (const l of this.pool) this.root.remove(l);
    this.root.remove(this.hemi, this.sun, this.sun.target);
    this._buildShell();
    this._buildItems();
    this._buildLights();
    this.engine.prepareScene(this.scene);
    this.engine._forceShadow = true;
    this._cutaway(true);
    this._taken = new Map();
    for (const r of keep) {
      r.path = null;
      r.spot = null;
      r.act = null;
      r.plan = 0;
    }
    if (m) m.path = null;
  }

  // ---------------------------------------------------------------- residents

  _syncResidents(initial = false) {
    const g = this.game, rec = this.rec;
    const want = new Set();
    for (const rt of this.world.npcs.values()) {
      const p = rt.p;
      if (rec.type === 'balai') continue; // the Town Hall is the Mayor's home
      if (p.home !== rec.id) continue;
      if (rt.mode === 'inside' && rt.at === rec.id) want.add(p.id);
    }
    // arrivals
    for (const id of want) {
      if (this.people.has(id)) {
        const r = this.people.get(id);
        if (r.leaving) r.leaving = false;
        continue;
      }
      const rt = this.world.npcs.get(id);
      const slot = this.crowd.alloc(rt.p.look);
      if (slot < 0) continue;
      const [dx, dz] = doorCell(this.W, this.D);
      const r = { id, p: rt.p, rt, slot, pos: new THREE.Vector3(), yaw: 0, anim: 'idle', phase: Math.random() * 10, path: null, plan: 0, act: null, scale: rt.scale };
      if (initial) {
        // already home: start in place
        this._plan(r, true);
      } else {
        const [x, z] = this.cellPos(dx, dz);
        r.pos.set(x, 0, z);
        this._plan(r);
      }
      this.people.set(id, r);
    }
    // departures walk out of the door
    for (const r of this.people.values()) {
      if (want.has(r.id) || r.leaving) continue;
      r.leaving = true;
      r.act = null;
      const [dx, dz] = doorCell(this.W, this.D);
      if (!this._walkTo(r, [dx, dz])) this._removePerson(r);
    }
  }

  _removePerson(r) {
    this.crowd.release(r.slot);
    this.people.delete(r.id);
    this._releaseSpot(r);
  }

  _spots() {
    // every sit / sleep / work spot of the furniture, in room space
    const out = [];
    for (const it of this.items) {
      if (!it || !it.def.spots) continue;
      const X = this.itemXform(it.f);
      it.def.spots.forEach((s, k) => {
        const v = new THREE.Vector3(s.x, 0, s.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), X.ry);
        out.push({ key: `${it.i}:${k}`, it, pos: new THREE.Vector3(X.x + v.x, s.h, X.z + v.z), yaw: s.yaw + X.ry, kind: it.def.sleeps ? 'bed' : s.sit ? 'seat' : 'stand', def: it.def });
      });
    }
    return out;
  }

  _releaseSpot(r) {
    if (r.spot) this._taken?.delete(r.spot.key);
    r.spot = null;
  }

  /** Decide what a resident does next and walk them there. */
  _plan(r, snap = false) {
    this._taken ||= new Map();
    this._releaseSpot(r);
    const g = this.game;
    const h = g.s.time.hour;
    const sleeping = r.rt.goal?.kind === 'sleep' || h >= 22 || h < 6;
    const spots = this._spots().filter((s) => !this._taken.has(s.key));
    let pick = null, act = 'idle';
    if (sleeping) {
      pick = spots.find((s) => s.kind === 'bed');
      act = 'sleep';
    } else {
      const roll = Math.random();
      const seats = spots.filter((s) => s.kind === 'seat');
      const stands = spots.filter((s) => s.kind === 'stand');
      const hungry = r.p.need.food < 70 || (r.p.lastMeal && g.absHour() - r.p.lastMeal < 0.6);
      if (stands.length && roll < (hungry ? 0.45 : 0.22)) {
        pick = stands[Math.floor(Math.random() * stands.length)];
        act = pick.def.cook ? 'cook' : 'warm';
      } else if (seats.length && roll < 0.85) {
        pick = seats[Math.floor(Math.random() * seats.length)];
        const reading = this.items.some((it) => it && (it.f.t === 'bookshelf' || it.f.t === 'desk'));
        act = hungry && Math.random() < 0.6 ? 'sitEat' : reading && Math.random() < 0.35 ? 'sitRead' : 'sit';
      }
    }
    r.act = act;
    r.plan = 6 + Math.random() * 9;
    if (pick) {
      this._taken.set(pick.key, r.id);
      r.spot = pick;
      r.goalCell = null;
      const c = this._approachCell(pick);
      if (snap || !this._walkTo(r, c)) this._settle(r);
      return;
    }
    // no free spot: stand somewhere (by a window, or anywhere free), or a sleeping mat on the floor
    const free = this._freeCells();
    const c = free[Math.floor(Math.random() * free.length)] || doorCell(this.W, this.D);
    r.spot = null;
    r.goalCell = c;
    if (sleeping) r.act = 'floorSleep';
    if (snap || !this._walkTo(r, c)) this._settle(r);
  }

  _freeCells() {
    const bl = this._blocked();
    const out = [];
    const [dx, dz] = doorCell(this.W, this.D);
    for (let x = 0; x < this.W; x++) for (let z = 0; z < this.D; z++) if (!bl.has(`${x},${z}`) && !(z === dz && x <= dx + 1)) out.push([x, z]);
    return out;
  }

  /** The free cell next to a spot from which to step onto it. */
  _approachCell(spot) {
    const bl = this._blocked();
    const [sx, sz] = this.cellAt(spot.pos.x, spot.pos.z);
    const fwd = new THREE.Vector3(Math.cos(spot.yaw), 0, -Math.sin(spot.yaw));
    let best = null, bd = Infinity;
    for (let x = 0; x < this.W; x++)
      for (let z = 0; z < this.D; z++) {
        if (bl.has(`${x},${z}`)) continue;
        const [cx, cz] = this.cellPos(x, z);
        const d = Math.hypot(cx - spot.pos.x, cz - spot.pos.z) - 0.25 * ((cx - spot.pos.x) * fwd.x + (cz - spot.pos.z) * fwd.z);
        if (d < bd) {
          bd = d;
          best = [x, z];
        }
      }
    return best || [sx, sz];
  }

  _settle(r) {
    r.path = null;
    if (r.spot) {
      r.pos.copy(r.spot.pos);
      r.yaw = r.spot.yaw;
    } else {
      if (r.goalCell) {
        const [x, z] = this.cellPos(...r.goalCell);
        r.pos.set(x + (Math.random() - 0.5) * 0.1, 0, z + (Math.random() - 0.5) * 0.1);
      }
      // face into the room, or towards a friend
      r.yaw = Math.atan2(-(0 - r.pos.z), 0 - r.pos.x) + (Math.random() - 0.5) * 1.2;
    }
    r.anim = { sleep: 'sleep', floorSleep: 'sleep', sit: 'sit', sitEat: 'sitEat', sitRead: 'sitRead', cook: 'cook', warm: 'idle', idle: 'idle' }[r.act] || 'idle';
    r.settled = true;
  }

  // ---------------------------------------------------------------- walking on the grid

  _walkTo(r, goal) {
    const W = this.W, D = this.D;
    const bl = this._blocked();
    let [sx, sz] = this.cellAt(r.pos.x, r.pos.z);
    sx = Math.max(0, Math.min(W - 1, sx));
    sz = Math.max(0, Math.min(D - 1, sz));
    const key = (x, z) => z * W + x;
    const prev = new Map([[key(sx, sz), -1]]);
    const q = [[sx, sz]];
    let found = sx === goal[0] && sz === goal[1];
    while (q.length && !found) {
      const [x, z] = q.shift();
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ax, nz = z + az;
        if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
        const k = key(nx, nz);
        if (prev.has(k)) continue;
        const goalHere = nx === goal[0] && nz === goal[1];
        if (bl.has(`${nx},${nz}`) && !goalHere) continue;
        prev.set(k, key(x, z));
        if (goalHere) {
          found = true;
          break;
        }
        q.push([nx, nz]);
      }
    }
    if (!found) return false;
    const path = [];
    for (let k = key(goal[0], goal[1]); k !== -1 && k !== undefined; k = prev.get(k)) path.unshift([k % W, Math.floor(k / W)]);
    r.path = path.slice(1).map(([x, z]) => this.cellPos(x, z));
    if (r.spot) r.path.push([r.spot.pos.x, r.spot.pos.z]);
    r.settled = false;
    r.pos.y = 0;
    return true;
  }

  _step(r, dt, speed = 0.75) {
    if (!r.path || !r.path.length) return true;
    const [tx, tz] = r.path[0];
    const dx = tx - r.pos.x, dz = tz - r.pos.z, d = Math.hypot(dx, dz);
    const st = speed * dt;
    if (d <= st) {
      r.pos.x = tx;
      r.pos.z = tz;
      r.path.shift();
    } else {
      r.pos.x += (dx / d) * st;
      r.pos.z += (dz / d) * st;
    }
    if (d > 1e-4) r.yaw = Math.atan2(-dz, dx);
    r.phase += st * 11;
    r.anim = 'walk';
    return !r.path.length;
  }

  // ---------------------------------------------------------------- per frame

  update(dt) {
    if (!this.active) return;
    this.time += dt;
    // quality changes outside re-enable the water mirror; there is no water in here
    if (this.engine.mirror) {
      this._savedMirror = this.engine.mirror;
      this.engine.mirror = null;
    }
    const g = this.game, env = this.app.env;
    this._syncT = (this._syncT || 0) - dt;
    if (this._syncT <= 0) {
      this._syncT = 0.5;
      this._syncResidents();
    }
    const h = g.s.time.hour;
    const night = env.night;
    // residents
    let awake = 0;
    for (const r of [...this.people.values()]) {
      if (r.leaving) {
        if (this._step(r, dt)) this._removePerson(r);
        continue;
      }
      if (r.path) {
        if (this._step(r, dt)) this._settle(r);
      } else {
        r.phase += dt * 2;
        r.plan -= dt;
        const shouldSleep = r.rt.goal?.kind === 'sleep' || h >= 22 || h < 6;
        const isSleeping = r.act === 'sleep' || r.act === 'floorSleep';
        if (shouldSleep !== isSleeping || (!isSleeping && r.plan <= 0)) this._plan(r);
      }
      if (!(r.act === 'sleep' || r.act === 'floorSleep') || r.path) awake++;
    }
    // neighbours on seats chat with each other
    const seated = [...this.people.values()].filter((r) => !r.path && r.act === 'sit');
    if (seated.length >= 2) for (const r of seated) r.anim = Math.sin(this.time * 0.4 + r.phase) > 0 ? 'sitTalk' : 'sit';
    // the Mayor
    const m = this.mayor;
    if (m.path) {
      if (this._step(m, dt, 0.95)) m.anim = 'idle';
    } else if (m.anim !== 'sleep') {
      m.anim = 'idle';
      m.phase += dt;
    }
    // pose everyone
    for (const r of this.people.values()) this.crowd.pose(r.slot, { pos: r.pos, yaw: r.yaw, scale: r.scale, anim: r.anim, phase: r.phase, hat: !!r.p.look.hat, long: r.p.look.long });
    this.crowd.pose(m.slot, { pos: m.pos, yaw: m.yaw, scale: 1.08, anim: m.anim, phase: m.phase, hat: m.anim !== 'sleep' });
    this.crowd.commit();

    // light: daylight through the windows, lamps in the evening, darkness when everyone sleeps
    const day = 1 - night;
    const wantLamps = night > 0.35 || env.cur.clouds * day > 0.85 ? (awake > 0 || this.mayor.anim !== 'sleep' ? 1 : 0.12) : 0;
    this.lampLevel += (wantLamps - this.lampLevel) * (1 - Math.exp(-dt * 2.5));
    const k = env.k;
    this.hemi.color.copy(k.sky).lerp(C('#ffd9a8'), this.lampLevel * 0.5);
    this.hemi.groundColor.set('#5a4636');
    this.hemi.intensity = 0.32 + day * 0.55 * (1 - env.cur.clouds * 0.35) + this.lampLevel * 0.28;
    // the sun (or moon) shines in through the back windows
    const sunUp = k.sunI > 0.05;
    this.sun.color.copy(sunUp ? k.sun : C('#8fa8ff'));
    this.sun.intensity = sunUp ? Math.min(1.7, k.sunI * 0.75) * (1 - env.cur.clouds * 0.6) : 0.28 * smooth(0.5, 0.95, night) * (1 - env.cur.clouds * 0.7);
    const az = THREE.MathUtils.degToRad(sunUp ? -40 + (h - 6) * 9 : -120);
    this.sun.position.set(Math.sin(az) * 4 - 2, 5.5, -4 + Math.cos(az));
    this.sun.target.position.set(0, 0, 0);
    for (const l of this.pool) {
      const s = l.userData.src;
      if (!s) continue;
      const flick = s.flicker ? 1 + Math.sin(this.time * 11 + 1.3) * 0.08 + Math.sin(this.time * 23) * 0.06 : 1 + Math.sin(this.time * 7) * 0.02;
      const lvl = s.fire ? Math.max(0.35, this.lampLevel) * (0.45 + 0.55 * night) : this.lampLevel;
      l.intensity = s.power * lvl * flick;
    }
    // window glass shows the sky, flashes with lightning
    const sky = this._skyCol ||= new THREE.Color();
    sky.copy(env.post.skyBottom).lerp(env.post.skyTop, 0.4).multiplyScalar(0.8 + day * 0.9);
    this.glassMat.emissive.copy(sky).addScalar(env.flash * 0.8);
    this.glassMat.emissiveIntensity = 0.55 + day * 0.9;
    // clocks
    for (const it of this.items) {
      if (!it?.group.userData.hour) continue;
      it.group.userData.hour.rotation.z = -((h % 12) / 12) * Math.PI * 2;
      it.group.userData.minute.rotation.z = -(h % 1) * Math.PI * 2;
    }
    this._cutaway();
    // placement preview follows its cell
    if (this.place?.ghost) this._updateGhost();
  }

  /** Hide the walls between the camera and the room. */
  _cutaway(force = false) {
    const az = THREE.MathUtils.degToRad(this.engine.view.azimuth);
    const cx = Math.sin(az), cz = Math.cos(az);
    for (const w of this.walls) {
      const show = w.out[0] * cx + w.out[1] * cz < 0.25;
      if (force || w.full.visible !== show) {
        w.full.visible = show;
        for (const it of w.items) it.group.visible = show;
      }
    }
  }

  /** Called after env.update: keep outdoor weather out and give the room its own backdrop. */
  applyEnv(env, shared) {
    const P = env.post, night = env.night;
    P.skyTop.set('#1a1830').lerp(C('#2a3456'), 1 - night);
    P.skyBottom.set('#2a2140').lerp(C('#3e4a72'), 1 - night);
    P.stars = 0;
    P.fog = 0;
    P.flash = 0;
    P.milky = 0;
    P.aurora = 0;
    P.moon = 0;
    P.tint.set('#fff6ea').lerp(C('#dfe2ff'), night * 0.6);
    P.exposure = 1.05;
    shared.uCloudShadow.value = 0;
    shared.uSnow.value = 0;
    shared.uWet.value = 0;
    shared.uRain.value = 0;
    shared.uWindStrength.value = 0.04;
    shared.uLamps.value = this.lampLevel;
  }

  // ---------------------------------------------------------------- taps

  project(pos, out = { x: 0, y: 0, z: 0 }) {
    const v = this._v.copy(pos).project(this.engine.camera);
    const c = this.engine.canvas;
    out.x = ((v.x + 1) / 2) * c.clientWidth;
    out.y = ((1 - v.y) / 2) * c.clientHeight;
    out.z = v.z;
    return out;
  }

  /** Floating icons over people: Zzz for sleepers, food while eating, notes near music. */
  emotes(max = 14) {
    const out = [];
    for (const r of this.people.values()) {
      let ic = null;
      if (r.act === 'sleep' || r.act === 'floorSleep') ic = Math.sin(this.time * 1.3 + r.phase) > -0.2 ? 'sleep' : null;
      else if (r.anim === 'sitEat' && Math.sin(this.time * 0.8 + r.phase) > 0.3) ic = 'food';
      else if (r.anim === 'sitTalk' && Math.sin(this.time * 0.9 + r.phase * 2) > 0.6) ic = 'chat';
      else if (r.act === 'cook' && Math.sin(this.time * 0.7 + r.phase) > 0.5) ic = 'kitchen';
      if (!ic) continue;
      const lying = r.act === 'sleep' || r.act === 'floorSleep';
      const head = lying ? this._v.set(r.pos.x, r.pos.y + 0.32, r.pos.z).addScaledVector(new THREE.Vector3(-Math.cos(r.yaw), 0, Math.sin(r.yaw)), 0.45) : this._v.set(r.pos.x, r.pos.y + 0.8, r.pos.z);
      const p = this.project(head);
      out.push({ id: r.id, x: p.x, y: p.y, icon: ic });
      if (out.length >= max) break;
    }
    if (this.mayor.anim === 'sleep') {
      const p = this.project(this._v.set(this.mayor.pos.x, this.mayor.pos.y + 0.32, this.mayor.pos.z - 0.45));
      out.push({ id: 'mayor', x: p.x, y: p.y, icon: 'sleep' });
    }
    return out;
  }

  _ray(cx, cy) {
    const c = this.engine.canvas;
    return this.engine.raycaster(cx / c.clientWidth, cy / c.clientHeight);
  }

  /** Cell under a screen point (on the floor). */
  pickCell(cx, cy) {
    const rc = this._ray(cx, cy);
    const p = new THREE.Vector3();
    if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return null;
    const [x, z] = this.cellAt(p.x, p.z);
    return { x, z, px: p.x, pz: p.z, inside: x >= 0 && z >= 0 && x < this.W && z < this.D };
  }

  /** Item, person or cell under a screen point. */
  pick(cx, cy) {
    let best = null, bd = 28;
    const tryP = (pos, h, item) => {
      const p = this.project(this._v.set(pos.x, pos.y + h, pos.z));
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < bd) {
        bd = d;
        best = item;
      }
    };
    for (const r of this.people.values()) tryP(r.pos, r.act === 'sleep' ? 0.12 : 0.3, { type: 'npc', r });
    if (best) return best;
    const rc = this._ray(cx, cy);
    const objs = this.items.filter((it) => it && it.group.visible).map((it) => it.group);
    const hit = rc.intersectObjects(objs, true)[0];
    if (hit) {
      let o = hit.object;
      while (o && o.userData.fi === undefined) o = o.parent;
      if (o) return { type: 'item', i: o.userData.fi };
    }
    const c = this.pickCell(cx, cy);
    return c?.inside ? { type: 'cell', ...c } : null;
  }

  onTap(cx, cy) {
    const ui = this.app.ui;
    if (this.place) {
      const c = this.pickCell(cx, cy);
      if (c) this._moveGhost(c);
      return;
    }
    const hit = this.pick(cx, cy);
    if (!hit) return;
    if (ui.mode === 'furnish') {
      if (hit.type === 'item') {
        this.select(hit.i);
        ui.sfx('pop');
      } else this.select(-1);
      return;
    }
    if (hit.type === 'npc') {
      ui.openNpc(hit.r.id);
      return;
    }
    if (hit.type === 'item') {
      const it = this.items[hit.i];
      if (it?.def.sleeps && this.rec.type === 'balai') {
        ui.trySleep();
        return;
      }
      ui.toast(`${it.def.name} · Comfort +${it.def.comfort || 0}`, { icon: it.def.icon, ms: 1500 });
      const X = this.itemXform(it.f);
      const c = this._approachCell({ pos: new THREE.Vector3(X.x, 0, X.z), yaw: 0 });
      if (c) this._walkTo(this.mayor, c);
      return;
    }
    if (hit.type === 'cell' && !this._blocked().has(`${hit.x},${hit.z}`)) {
      this.mayor.spot = null;
      if (this._walkTo(this.mayor, [hit.x, hit.z])) ui.sfx('pop');
    }
  }

  /** The Mayor lies down in the nearest bed (for the night skip). */
  mayorToBed() {
    const bed = this._spots().find((s) => s.kind === 'bed');
    const m = this.mayor;
    m.path = null;
    if (bed) {
      m.pos.copy(bed.pos);
      m.yaw = bed.yaw;
    }
    m.anim = 'sleep';
  }
  mayorWake() {
    const m = this.mayor;
    const free = this._freeCells();
    const bed = this._spots().find((s) => s.kind === 'bed');
    const c = bed ? this._approachCell(bed) : free[0];
    if (c) {
      const [x, z] = this.cellPos(...c);
      m.pos.set(x, 0, z);
    }
    m.anim = 'idle';
  }

  // ---------------------------------------------------------------- decorating

  select(i) {
    this.selected = i;
    const it = this.items[i];
    if (!it) {
      this.cellQuad.visible = false;
      this.app.ui.renderPlacebar();
      return;
    }
    this._showCells(it.f.t, it.f.x, it.f.z, it.f.r, '#ffd23d');
    this.app.ui.renderPlacebar();
  }

  _showCells(t, x, z, r, color) {
    const d = FURNITURE[t];
    const q = this.cellQuad;
    q.material.uniforms.uColor.value.set(color);
    if (d.wall) {
      const X = this.itemXform({ t, x, z, r });
      q.scale.set(CELL, CELL, 1);
      const inward = 0.18;
      q.position.set(X.x + (r === 1 ? inward : r === 3 ? -inward : 0), 0.015, X.z + (r === 0 ? inward : r === 2 ? -inward : 0));
    } else {
      const [fw, fd] = footprintOf(t, r);
      q.scale.set(fw * CELL, fd * CELL, 1);
      const [x0, z0] = this.cellPos(x, z);
      q.position.set(x0 - CELL / 2 + (fw * CELL) / 2, 0.015, z0 - CELL / 2 + (fd * CELL) / 2);
    }
    q.visible = true;
  }

  /** Start placing a new item (bought or from storage) or moving an existing one. */
  startPlace(t, { fromInv = false, move = -1 } = {}) {
    const d = FURNITURE[t];
    let x = Math.floor(this.W / 2), z = Math.floor(this.D / 2), r = 0;
    if (move >= 0) ({ x, z, r } = this.rec.furni[move]);
    if (d.wall && move < 0) {
      r = 0;
      x = Math.floor(this.W / 2);
      z = 0;
    }
    const ghost = furnitureModel(t, this.rec.id + 99);
    ghost.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
    this.root.add(ghost);
    if (move >= 0 && this.items[move]) this.items[move].group.visible = false;
    this.place = { t, x, z, r, fromInv, move, ghost };
    this.selected = -1;
    this._updateGhost();
  }

  _moveGhost(c) {
    const P = this.place, d = FURNITURE[P.t];
    if (d.wall) {
      // snap to the nearest wall
      const hw = (this.W * CELL) / 2, hd = (this.D * CELL) / 2;
      const dists = [c.pz + hd, c.px + hw, hd - c.pz, hw - c.px];
      let r = 0;
      for (let k = 1; k < 4; k++) if (dists[k] < dists[r]) r = k;
      P.r = r;
      P.x = Math.max(0, Math.min(this.W - 1, c.x));
      P.z = Math.max(0, Math.min(this.D - 1, c.z));
    } else {
      const [fw, fd] = footprintOf(P.t, P.r);
      P.x = Math.max(0, Math.min(this.W - fw, c.x - Math.floor((fw - 1) / 2)));
      P.z = Math.max(0, Math.min(this.D - fd, c.z - Math.floor((fd - 1) / 2)));
    }
    this.app.ui.sfx('pop');
    this._updateGhost();
  }

  rotatePlace() {
    const P = this.place;
    if (!P) return;
    const d = FURNITURE[P.t];
    if (d.wall) P.r = (P.r + 1) % 4;
    else {
      P.r = (P.r + 1) % 4;
      const [fw, fd] = footprintOf(P.t, P.r);
      P.x = Math.min(P.x, this.W - fw);
      P.z = Math.min(P.z, this.D - fd);
    }
    this._updateGhost();
  }

  _updateGhost() {
    const P = this.place;
    const X = this.itemXform(P);
    P.ghost.position.set(X.x, FURNITURE[P.t].layer === 'rug' ? 0.004 : 0.02 + Math.abs(Math.sin(this.time * 4)) * 0.02, X.z);
    P.ghost.rotation.y = X.ry;
    P.ok = this.canPlace(P.t, P.x, P.z, P.r, P.move);
    this._showCells(P.t, P.x, P.z, P.r, P.ok ? '#7fe08a' : '#ff5d5d');
    // a wall item over a hidden wall would be invisible: turn the camera towards it
    if (FURNITURE[P.t].wall) P.ghost.visible = this.walls[P.r].full.visible;
    this.app.ui.renderPlacebar?.();
  }

  cancelPlace() {
    const P = this.place;
    if (!P) return;
    this.root.remove(P.ghost);
    disposeModel(P.ghost);
    if (P.move >= 0 && this.items[P.move]) this.items[P.move].group.visible = true;
    this.place = null;
    this.cellQuad.visible = false;
  }

  /** Commit the placement. Returns { ok, reason }. */
  confirmPlace() {
    const P = this.place, g = this.game;
    if (!P) return { ok: false };
    if (!this.canPlace(P.t, P.x, P.z, P.r, P.move)) return { ok: false, reason: "It doesn't fit there" };
    if (P.move >= 0) {
      Object.assign(this.rec.furni[P.move], { x: P.x, z: P.z, r: P.r });
    } else {
      if (P.fromInv) {
        if (!g.takeFurni(P.t)) return { ok: false, reason: 'Not in storage' };
      } else {
        const r = g.buyFurni(P.t);
        if (!r.ok) return r;
      }
      this.rec.furni.push({ t: P.t, x: P.x, z: P.z, r: P.r });
    }
    g.markFurni(this.rec);
    const t = P.t;
    this.root.remove(P.ghost);
    disposeModel(P.ghost);
    this.place = null;
    this.cellQuad.visible = false;
    this.rebuild();
    return { ok: true, t };
  }

  storeSelected() {
    const i = this.selected;
    const f = this.rec.furni[i];
    if (!f) return null;
    this.rec.furni.splice(i, 1);
    this.game.storeFurni(f.t);
    this.game.markFurni(this.rec);
    this.selected = -1;
    this.cellQuad.visible = false;
    this.rebuild();
    return f.t;
  }

  sellSelected() {
    const i = this.selected;
    const f = this.rec.furni[i];
    if (!f) return null;
    this.rec.furni.splice(i, 1);
    const got = this.game.sellFurni(f.t);
    this.game.markFurni(this.rec);
    this.selected = -1;
    this.cellQuad.visible = false;
    this.rebuild();
    return got;
  }

  stats() {
    return homeStats(this.rec?.furni);
  }
}
