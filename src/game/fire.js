// Fire visuals (v1.2): flames and smoke on burning buildings, the Fire Station crew hosing them
// down, the Mayor's water bucket, and smouldering ruins. State lives in game (I.fires, rec.ruin).
import * as THREE from 'three';
import { BUILDINGS } from './data.js';
import { mats, disposeModel } from './models.js';

const FLAME_COL = ['#ffe27a', '#ffb347', '#ff7a2a', '#ff4a2a'];
const CREW_LOOK = { skin: '#e0ac85', coat: '#d8323a', pants: '#2a2e3a', hair: '#3a2a1a', hat: '#ffd23d', umbrella: '#d8323a', tool: '#8a8d98', toolHead: '#c8cdd6' };
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _box = new THREE.Box3();

export class FireFx {
  constructor(world) {
    this.w = world;
    this.flames = new Map(); // bid -> { group, cones[], crew[], top, r }
    this._sprayT = 0;
    this._alarmT = 0;
  }

  get game() {
    return this.w.game;
  }

  _top(e) {
    if (e.fireTop === undefined) {
      _box.setFromObject(e.group);
      e.fireTop = Math.max(0.35, Math.min(2.4, _box.max.y - e.center.y));
    }
    return e.fireTop;
  }

  _make(e) {
    const s = BUILDINGS[e.rec.type].size;
    const group = new THREE.Group();
    const cones = [];
    const n = 3 + s * 2;
    for (let k = 0; k < n; k++) {
      const col = FLAME_COL[k % 3];
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.07 + Math.random() * 0.05, 0.3, 5).translate(0, 0.15, 0), mats.glow(col, 6, col, true));
      const a = (k / n) * Math.PI * 2, r = s * 0.28 * Math.sqrt(Math.random());
      m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      m.userData.ph = Math.random() * 10;
      m.castShadow = false;
      m.raycast = () => {};
      group.add(m);
      cones.push(m);
    }
    group.position.copy(e.center);
    this.w.root.add(group);
    const F = { group, cones, crew: [], top: this._top(e), r: s * 0.3 };
    this.flames.set(e.rec.id, F);
    return F;
  }

  _drop(bid) {
    const F = this.flames.get(bid);
    if (!F) return;
    this.w.root.remove(F.group);
    disposeModel(F.group);
    for (const c of F.crew) this.w.crowd.release(c.slot);
    this.flames.delete(bid);
  }

  /** Where the hose / bucket aims: a point near the roof. */
  aimAt(bid, out = _w) {
    const e = this.w.buildings.get(bid);
    if (!e) return null;
    return out.copy(e.center).setY(e.center.y + this._top(e) * 0.7);
  }

  _spray(from, to, n = 2) {
    const B = this.w.bursts;
    const dx = to.x - from.x, dz = to.z - from.z, d = Math.max(0.2, Math.hypot(dx, dz));
    for (let k = 0; k < n; k++)
      B.emit(_v.copy(from), { n: 1, color: k % 2 ? '#bfe9ff' : '#ffffff', speed: 0.12, up: 1.1 + (to.y - from.y) * 0.8, life: 0.7, gravity: 3.2, glow: 1.4, push: { x: (dx / d) * 1.9, z: (dz / d) * 1.9 } });
  }

  _crewFor(F, e) {
    if (F.crew.length) return;
    const ring = BUILDINGS[e.rec.type].size * 0.5 + 0.45;
    for (let k = 0; k < 2; k++) {
      const slot = this.w.crowd.alloc(CREW_LOOK);
      if (slot < 0) break;
      const a = Math.random() * Math.PI * 2 + k * 2.2;
      const pos = new THREE.Vector3(e.center.x + Math.cos(a) * ring, 0, e.center.z + Math.sin(a) * ring);
      pos.y = this.w.heightAt(pos.x, pos.z);
      const yaw = Math.atan2(-(e.center.z - pos.z), e.center.x - pos.x);
      F.crew.push({ slot, pos, yaw, phase: Math.random() * 10 });
      this.w.bursts.emit(_v.copy(pos).setY(pos.y + 0.3), { n: 10, color: '#ffd23d', speed: 0.6, up: 1, life: 0.6, glow: 2 });
    }
  }

  update(dt) {
    const w = this.w, g = this.game, I = g.I, B = w.bursts, T = w.time;
    const fires = I.fires || [];
    const L = Math.max(0.35, w.quality.ambient);
    for (const bid of [...this.flames.keys()]) if (!fires.some((f) => f.bid === bid)) {
      const F = this.flames.get(bid);
      // a last puff of steam as the fire goes out
      B.emit(_v.copy(F.group.position).setY(F.group.position.y + F.top), { n: 26, color: '#e8eef6', speed: 0.7, up: 1.4, life: 1.2, gravity: -0.4, spread: F.r * 2 });
      this._drop(bid);
    }
    let heat = 0;
    for (const f of fires) {
      const e = w.buildings.get(f.bid);
      if (!e) continue;
      const F = this.flames.get(f.bid) || this._make(e);
      const hp = Math.max(0.15, f.hp);
      heat += hp;
      F.group.position.set(e.center.x, e.center.y + F.top * 0.82, e.center.z);
      for (const c of F.cones) {
        const u = c.userData;
        const fl = 0.6 + 0.4 * Math.sin(T * 13 + u.ph) * Math.sin(T * 7.3 + u.ph * 2);
        c.scale.set(0.8 + hp * 0.6, (0.6 + hp * 1.4) * (0.75 + fl * 0.5), 0.8 + hp * 0.6);
        c.rotation.z = Math.sin(T * 5 + u.ph) * 0.18;
        c.rotation.x = Math.cos(T * 4.3 + u.ph) * 0.15;
      }
      // flames, embers and a column of smoke
      if (Math.random() < dt * 30 * hp * L) B.emit(_v.set(e.center.x + (Math.random() - 0.5) * F.r * 2, e.center.y + F.top * (0.6 + Math.random() * 0.4), e.center.z + (Math.random() - 0.5) * F.r * 2), { n: 1, color: FLAME_COL[Math.floor(Math.random() * 4)], speed: 0.15, up: 1.2, life: 0.6, gravity: -1.8, glow: 3.5 });
      if (Math.random() < dt * 6 * L) B.emit(_v.set(e.center.x + (Math.random() - 0.5) * F.r, e.center.y + F.top + 0.1, e.center.z + (Math.random() - 0.5) * F.r), { n: 1, color: '#ffd23d', speed: 0.5, up: 1.8, life: 1.1, gravity: 0.6, glow: 4 });
      if (Math.random() < dt * 10 * L) B.emit(_v.set(e.center.x + (Math.random() - 0.5) * F.r, e.center.y + F.top + 0.3, e.center.z + (Math.random() - 0.5) * F.r), { n: 1, color: Math.random() < 0.5 ? '#3a3540' : '#5a5560', speed: 0.12, up: 0.4, life: 2.2, gravity: -0.55, glow: 0.7, push: { x: w.env.cur.wind * 0.4, z: 0 } });
      // the Fire Station crew
      if (f.crew) {
        this._crewFor(F, e);
        const aim = this.aimAt(f.bid, _w);
        for (const c of F.crew) {
          c.phase += dt * 2;
          w.crowd.pose(c.slot, { pos: c.pos, yaw: c.yaw, scale: 1, anim: 'point', phase: c.phase, hat: true });
          if (aim && Math.random() < dt * 22) {
            const fx = Math.cos(c.yaw), fz = -Math.sin(c.yaw);
            this._spray(_v.set(c.pos.x + fx * 0.22, c.pos.y + 0.36, c.pos.z + fz * 0.22), aim, 1);
          }
        }
      } else if (F.crew.length) {
        for (const c of F.crew) w.crowd.release(c.slot);
        F.crew = [];
      }
    }
    // smouldering ruins
    for (const e of w.buildings.values()) {
      if (!e.rec.ruin || Math.random() > dt * 2.5 * L) continue;
      B.emit(_v.set(e.center.x + (Math.random() - 0.5) * 0.5, e.center.y + 0.3, e.center.z + (Math.random() - 0.5) * 0.5), { n: 1, color: '#4a4550', speed: 0.06, up: 0.25, life: 2.4, gravity: -0.3, glow: 0.6 });
    }
    // the crackle of the flames, louder with more fire
    const loud = heat > 0 && !w.suspendSeason ? Math.min(1, 0.35 + heat * 0.35) : 0;
    if (loud || this._loud) w.audio.setLoop('fire', loud);
    this._loud = loud;
    if (heat > 0) {
      this._alarmT -= dt;
      if (this._alarmT <= 0) {
        this._alarmT = 6;
        w.audio.play('bell', { pitch: 1.5, gain: 0.5 });
      }
    } else this._alarmT = 0;
  }

  /** The Mayor throws water at a fire (called every frame while he works). */
  mayorSpray(m, t, dt) {
    const w = this.w;
    const aim = this.aimAt(t.bid, _w);
    if (!aim || !this.game.I.fires?.some((f) => f.bid === t.bid)) {
      m.task = null;
      m.mode = 'idle';
      return;
    }
    w._face(m, aim);
    m.anim = 'point';
    m.phase += dt * 2;
    const fx = Math.cos(m.yaw), fz = -Math.sin(m.yaw);
    if (Math.random() < dt * 30) this._spray(_v.set(m.pos.x + fx * 0.22, m.pos.y + 0.38, m.pos.z + fz * 0.22), aim, 2);
    this._sprayT -= dt;
    if (this._sprayT <= 0) {
      this._sprayT = 0.25;
      if (Math.random() < 0.3) w.audio.play('splash', { gain: 0.4 });
      const r = this.game.douse(t.bid, 0.075);
      if (r?.out) {
        m.task = null;
        m.mode = 'idle';
      }
    }
  }

  /** Fire icons over burning buildings, for the emote layer. */
  markers(out) {
    for (const f of this.game.I.fires || []) {
      const e = this.w.buildings.get(f.bid);
      if (!e) continue;
      const p = this.w.project(_v.copy(e.center).setY(e.center.y + this._top(e) + 0.55));
      out.push({ id: -f.bid, x: p.x, y: p.y + Math.sin(this.w.time * 6) * 3, icon: 'fire' });
    }
  }

  /** Charred colours for a burnt-down building. */
  static char(group) {
    group.traverse((o) => {
      const c = o.isMesh && o.geometry?.attributes?.color;
      if (!c) return;
      for (let i = 0; i < c.count; i++) {
        const k = 0.28 + ((i * 7919) % 13) / 100;
        c.setXYZ(i, c.getX(i) * k + 0.02, c.getY(i) * k + 0.015, c.getZ(i) * k + 0.02);
      }
      c.needsUpdate = true;
    });
    group.scale.set(1, 0.72, 1);
    group.rotation.z = 0.035;
  }

  dispose() {
    for (const bid of [...this.flames.keys()]) this._drop(bid);
    if (this._loud) this.w.audio.setLoop('fire', 0);
    this._loud = 0;
  }
}
