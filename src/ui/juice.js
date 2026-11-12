// UI polish (v1.2): cinematic title cards, reward icons that fly into the HUD, a rolling coin
// counter and photo mode. Mixed into UI (see ui.js).
import { icon, iconURL } from './icons.js';
import { RES } from '../game/data.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const resIcon = (k) => (k === 'coins' ? 'coin' : k === 'xp' ? 'xp' : RES[k]?.icon || 'info');

// photo mode looks: changes on top of the player's current look
const FILTERS = [
  { id: 'natural', name: 'Natural', look: {} },
  { id: 'golden', name: 'Golden', look: { exposure: 1.2, saturation: 1.32, contrast: 1.08, vignette: 0.28, split: 0.5 } },
  { id: 'dream', name: 'Dreamy', look: { exposure: 1.24, contrast: 0.94, saturation: 1.05, bloom: 1.6, vignette: 0.22, tilt: 0.95 } },
  { id: 'vivid', name: 'Vivid', look: { saturation: 1.55, contrast: 1.14 } },
  { id: 'noir', name: 'Noir', look: { saturation: 0, contrast: 1.28, vignette: 0.42 } },
  { id: 'retro', name: 'Retro', look: { quantize: 'palette', dither: 0.75, outline: 0.65 } },
];
const LOOK_KEYS = ['exposure', 'saturation', 'contrast', 'vignette', 'split', 'bloom', 'tilt', 'quantize', 'dither', 'outline'];

export const JuiceMixin = {
  /** A big animated banner across the middle of the screen (new day, new island...). */
  titleCard(title, sub = '', ic = null) {
    if (!this.titleGone || this.mode === 'photo') return;
    $('#tcard')?.remove();
    const el = document.createElement('div');
    el.id = 'tcard';
    el.innerHTML = `<div class="tc-line"></div><div class="tc-body">${ic ? icon(ic, 'lg') : ''}<b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div><div class="tc-line"></div>`;
    this.root.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3300);
  },

  /** Reward icons burst out of an element (or the screen centre) and fly into their HUD chips. */
  flyRewards(items, fromEl = null) {
    const r = fromEl?.getBoundingClientRect?.();
    const x0 = r ? r.left + r.width / 2 : window.innerWidth / 2, y0 = r ? r.top + r.height / 2 : window.innerHeight / 2;
    let delay = 0, kinds = 0;
    for (const [k, v] of Object.entries(items || {})) {
      if (!v || kinds++ > 4) continue;
      const target = this._flyTarget(k);
      if (!target) continue;
      const tr = target.getBoundingClientRect();
      const x1 = tr.left + tr.width / 2, y1 = tr.top + tr.height / 2;
      const n = Math.min(6, 2 + Math.floor(Math.log10(Math.max(1, v)) * 1.5));
      for (let i = 0; i < n; i++) {
        const el = document.createElement('img');
        el.className = 'fly';
        el.src = iconURL(resIcon(k));
        el.draggable = false;
        this.root.appendChild(el);
        const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 40;
        const mx = x0 + Math.cos(a) * d, my = y0 + Math.sin(a) * d - 20;
        const anim = el.animate(
          [
            { transform: `translate(${x0}px, ${y0}px) scale(0.4)`, opacity: 0 },
            { transform: `translate(${mx}px, ${my}px) scale(1.25)`, opacity: 1, offset: 0.3 },
            { transform: `translate(${x1}px, ${y1}px) scale(0.7)`, opacity: 1 },
          ],
          { duration: 720 + Math.random() * 160, delay, easing: 'cubic-bezier(0.45, 0, 0.6, 1)', fill: 'both' },
        );
        delay += 45;
        anim.onfinish = () => {
          el.remove();
          target.classList.remove('bump');
          void target.offsetWidth;
          target.classList.add('bump');
          if (performance.now() - (this._flySfxT || 0) > 70) {
            this._flySfxT = performance.now();
            this.app.audio.play(k === 'coins' ? 'coin' : 'pop', { gain: 0.5 });
          }
        };
      }
    }
  },
  _flyTarget(k) {
    if (k === 'coins') return $('#c-coins');
    if (k === 'xp') return $('.lvl .ring');
    const src = iconURL(resIcon(k));
    for (const img of document.querySelectorAll('#resbar .chip img')) if (img.getAttribute('src') === src) return img.parentElement;
    return $('#resbar .chip.cap') || $('#c-coins');
  },

  /** The coin chip rolls toward the real amount instead of jumping. */
  _tickCoins(dt, fmt) {
    const P = this.game.s.player;
    if (this._coinShown === undefined || Math.abs(P.coins - this._coinShown) > 1e6) this._coinShown = P.coins;
    const diff = P.coins - this._coinShown;
    if (Math.abs(diff) < 0.5) this._coinShown = P.coins;
    else this._coinShown += diff * Math.min(1, dt * 7) + Math.sign(diff) * Math.min(Math.abs(diff), dt * 20);
    const txt = fmt(Math.round(this._coinShown));
    if (txt !== this._coinTxt) {
      this._coinTxt = txt;
      $('#c-coins span').textContent = txt;
      if (diff > 0) $('#c-coins').classList.add('up');
    } else if (Math.abs(diff) < 0.5) $('#c-coins').classList.remove('up');
  },

  // ---------------- photo mode

  enterPhoto() {
    const app = this.app;
    if (app.interior.active || this.mode === 'photo') return;
    this.exitMode?.();
    this.closeSheet?.();
    this.mode = 'photo';
    const L = app.engine.look;
    this._photoLook = Object.fromEntries(LOOK_KEYS.map((k) => [k, L[k]]));
    app.photo = { hour: null, orbit: false, filter: 'natural' };
    document.body.classList.add('photo');
    let bar = $('#photobar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'photobar';
      this.root.appendChild(bar);
    }
    this._renderPhotoBar();
    this.sfx('whoosh');
  },
  _renderPhotoBar() {
    const P = this.app.photo;
    const hour = P.hour ?? this.game.s.time.hour;
    const filters = FILTERS.map((f) => `<button class="seg ${P.filter === f.id ? 'on' : ''}" data-act="ph-filter" data-arg="${f.id}">${f.name}</button>`).join('');
    $('#photobar').innerHTML = `
      <div class="ph-row"><span>${icon(hour >= 6 && hour < 19 ? 'sun' : 'moon')} Time</span><input type="range" id="ph-hour" min="0" max="23.75" step="0.25" value="${hour}"><b id="ph-clock">${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}</b></div>
      <div class="ph-row segs">${filters}</div>
      <div class="ph-row btnrow">
        <button class="btn sm ${P.orbit ? 'primary' : ''}" data-act="ph-orbit">${icon('rotr')} Orbit</button>
        <button class="btn sm" data-act="ph-live">${icon('sun')} Live time</button>
        <button class="btn sm buy" data-act="ph-snap">${icon('camera')} Snap</button>
        <button class="btn sm danger" data-act="ph-exit">${icon('close')} Done</button>
      </div>`;
    const inp = $('#ph-hour');
    inp.oninput = () => {
      P.hour = +inp.value;
      $('#ph-clock').textContent = `${String(Math.floor(P.hour)).padStart(2, '0')}:${String(Math.round((P.hour % 1) * 60)).padStart(2, '0')}`;
    };
  },
  _applyFilter(id) {
    const app = this.app, L = app.engine.look;
    Object.assign(L, this._photoLook);
    const f = FILTERS.find((x) => x.id === id) || FILTERS[0];
    // tone values scale the player's own look (defaults: exposure 1.12, saturation 1.16, contrast 1.05)
    const REL = { exposure: 1.12, saturation: 1.16, contrast: 1.05 };
    for (const [k, v] of Object.entries(f.look)) L[k] = REL[k] ? this._photoLook[k] * (v / REL[k]) : v;
    app.engine.applyLook();
    app.photo.filter = id;
  },
  exitPhoto() {
    if (this.mode !== 'photo') return;
    const app = this.app;
    Object.assign(app.engine.look, this._photoLook);
    app.engine.applyLook();
    app.photo = null;
    this.mode = 'explore';
    document.body.classList.remove('photo', 'photo-clean');
    $('#photobar')?.remove();
    app.applyQuality(app.perf.tier, app.perf.extraPixel);
    this.sfx('back');
  },
  _photoClick(act, arg) {
    const P = this.app.photo;
    switch (act) {
      case 'photo': this.enterPhoto(); return true;
      case 'ph-exit': this.exitPhoto(); return true;
      case 'ph-filter': this._applyFilter(arg); this._renderPhotoBar(); return true;
      case 'ph-orbit': P.orbit = !P.orbit; this._renderPhotoBar(); return true;
      case 'ph-live': P.hour = null; this._renderPhotoBar(); return true;
      case 'ph-snap': {
        // a shutter flash, then the bar hides for a clean screenshot
        this.app.audio.play('tick', { pitch: 0.6 });
        this.app.audio.play('whoosh', { dur: 0.25, gain: 0.4 });
        const fl = document.createElement('div');
        fl.className = 'shutter';
        document.body.appendChild(fl);
        setTimeout(() => fl.remove(), 500);
        document.body.classList.add('photo-clean');
        clearTimeout(this._cleanT);
        this._cleanT = setTimeout(() => document.body.classList.remove('photo-clean'), 4000);
        return true;
      }
    }
    return false;
  },
};
