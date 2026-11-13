// Touch-first camera: one finger pans (or paints, in road mode), two fingers pinch to zoom, twist to
// rotate and slide up/down to tilt. Mouse: drag pans, right-drag rotates, wheel zooms. Smoothed with
// inertia; the engine's orthographic camera keeps snapping to whole pixels.
import * as THREE from 'three';
import { HALF } from './island.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAP_PX = 9;

export class CameraControl {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.engine = engine;
    const v = engine.view;
    this.goal = { az: v.azimuth, el: v.elevation, zoom: v.zoom, target: v.target.clone() };
    this.vel = new THREE.Vector2();
    this.pointers = new Map();
    this.mode = 'pan'; // 'pan' | 'paint'
    this.follow = null; // () => Vector3
    this.onTap = null;
    this.onPaint = null; // (x, y, phase)
    this.onHover = null;
    this.enabled = true;
    this.limits = { zoom: [0.32, 2.8], el: [18, 72] };
    this._gesture = null;
    const opts = { passive: false };
    canvas.addEventListener('pointerdown', (e) => this._down(e), opts);
    canvas.addEventListener('pointermove', (e) => this._move(e), opts);
    canvas.addEventListener('pointerup', (e) => this._up(e), opts);
    canvas.addEventListener('pointercancel', (e) => this._up(e, true), opts);
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this._up(e, true);
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(Math.exp(-e.deltaY * 0.0015));
    }, opts);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  set(view) {
    const v = this.engine.view;
    Object.assign(v, { azimuth: view.az ?? v.azimuth, elevation: view.el ?? v.elevation, zoom: view.zoom ?? v.zoom });
    if (view.target) v.target.copy(view.target);
    this.goal = { az: v.azimuth, el: v.elevation, zoom: v.zoom, target: v.target.clone() };
  }

  zoomBy(k) {
    this.goal.zoom = clamp(this.goal.zoom * k, ...this.limits.zoom);
  }
  rotateBy(deg) {
    this.goal.az += deg;
  }
  focus(pos, zoom) {
    this.goal.target.set(pos.x, Math.max(0.2, pos.y * 0.5 + 0.2), pos.z);
    if (zoom) this.goal.zoom = clamp(zoom, ...this.limits.zoom);
    this.vel.set(0, 0);
  }

  _units() {
    const v = this.engine.view;
    return v.size / v.zoom / Math.max(1, this.canvas.clientHeight);
  }

  _panBy(dx, dy) {
    const v = this.engine.view;
    const az = THREE.MathUtils.degToRad(v.azimuth), el = THREE.MathUtils.degToRad(v.elevation);
    const u = this._units();
    const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
    const fwd = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az));
    this.goal.target.addScaledVector(right, -dx * u).addScaledVector(fwd, (dy * u) / Math.max(0.3, Math.sin(el)));
    this._clampTarget();
    if (this.follow) this.follow = null;
  }

  _clampTarget() {
    const t = this.goal.target;
    const lim = this.bounds ?? HALF + 1;
    t.x = clamp(t.x, -lim, lim);
    t.z = clamp(t.z, -lim, lim);
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _down(e) {
    if (!this.enabled) return;
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this._pos(e);
    this.pointers.set(e.pointerId, { ...p, sx: p.x, sy: p.y, t: performance.now(), button: e.button, type: e.pointerType });
    this.vel.set(0, 0);
    if (this.pointers.size === 2) this._startGesture();
    else if (this.pointers.size === 1) {
      this._moved = false;
      this._painting = false;
    }
  }

  _startGesture() {
    const [a, b] = [...this.pointers.values()];
    this._gesture = {
      d: Math.hypot(a.x - b.x, a.y - b.y),
      ang: Math.atan2(b.y - a.y, b.x - a.x),
      cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
    };
    this._moved = true;
    if (this._painting) {
      this.onPaint?.(0, 0, 'cancel');
      this._painting = false;
    }
  }

  _move(e) {
    const P = this.pointers.get(e.pointerId);
    if (!P) {
      if (e.pointerType === 'mouse') this.onHover?.(this._pos(e));
      return;
    }
    e.preventDefault();
    const p = this._pos(e);
    const dx = p.x - P.x, dy = p.y - P.y;
    P.x = p.x;
    P.y = p.y;
    if (this.pointers.size >= 2 && this._gesture) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const G = this._gesture;
      if (G.d > 10) this.goal.zoom = clamp(this.goal.zoom * (d / G.d), ...this.limits.zoom);
      let da = ang - G.ang;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      this.goal.az -= THREE.MathUtils.radToDeg(da);
      // both fingers sliding vertically tilts; sideways pans
      this.goal.el = clamp(this.goal.el + (cy - G.cy) * 0.18, ...this.limits.el);
      this._panBy((cx - G.cx) * 0.9, 0);
      Object.assign(G, { d, ang, cx, cy });
      return;
    }
    const total = Math.hypot(p.x - P.sx, p.y - P.sy);
    if (!this._moved && total < TAP_PX) return;
    if (!this._moved) {
      this._moved = true;
      if (this.mode === 'paint' && P.button === 0) {
        this._painting = true;
        this.onPaint?.(P.sx, P.sy, 'start');
      }
    }
    if (this._painting) {
      this.onPaint?.(p.x, p.y, 'move');
      return;
    }
    if (P.button === 2 || (P.type === 'mouse' && e.shiftKey)) {
      this.goal.az -= dx * 0.35;
      this.goal.el = clamp(this.goal.el + dy * 0.25, ...this.limits.el);
      return;
    }
    this._panBy(dx, dy);
    const dt = Math.max(1, performance.now() - (P.lt || P.t));
    P.lt = performance.now();
    this.vel.set((dx / dt) * 16, (dy / dt) * 16);
  }

  _up(e, cancel = false) {
    const P = this.pointers.get(e.pointerId);
    if (!P) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this._gesture = null;
    if (this._painting && this.pointers.size === 0) {
      this.onPaint?.(P.x, P.y, 'end');
      this._painting = false;
      return;
    }
    if (this.pointers.size === 1) {
      // lifting one finger of a pinch: carry on panning with the other without a jump
      const [o] = [...this.pointers.values()];
      o.sx = o.x;
      o.sy = o.y;
      return;
    }
    if (cancel) return;
    const dur = performance.now() - P.t;
    if (!this._moved && dur < 600 && P.button !== 2) this.onTap?.(P.x, P.y);
    if (performance.now() - (P.lt || 0) > 80) this.vel.set(0, 0);
  }

  update(dt) {
    const v = this.engine.view;
    // inertia after a flick
    if (this.pointers.size === 0 && this.vel.lengthSq() > 0.01) {
      this._panBy(this.vel.x * dt * 60, this.vel.y * dt * 60);
      this.vel.multiplyScalar(Math.exp(-dt * 5));
    }
    if (this.follow) {
      const f = this.follow();
      if (f) this.goal.target.lerp(new THREE.Vector3(f.x, Math.max(0.2, f.y * 0.5 + 0.2), f.z), 1 - Math.exp(-dt * 3));
    }
    const k = 1 - Math.exp(-dt * 10);
    v.azimuth += (this.goal.az - v.azimuth) * k;
    v.elevation += (this.goal.el - v.elevation) * k;
    v.zoom += (this.goal.zoom - v.zoom) * k;
    v.target.lerp(this.goal.target, k);
  }

  get moving() {
    const v = this.engine.view;
    return Math.abs(this.goal.az - v.azimuth) > 0.05 || Math.abs(this.goal.zoom - v.zoom) > 0.002 || v.target.distanceToSquared(this.goal.target) > 1e-5 || this.pointers.size > 0;
  }
}
