// DOM interface over the canvas: HUD, toolbars, bottom sheets, dialogs, toasts, floating popups,
// villager emotes, title screen and tutorial hints. Touch-first, sized for phones in either
// orientation, with safe-area padding.
import * as THREE from 'three';
import { icon, iconURL, WEATHER_ICON, WEATHER_NAME } from './icons.js';
import { thumb } from './thumbs.js';
import {
  RES, RES_KEYS, BIOMES, BIOME_KEYS, BUILDINGS, BUILD_CATS, MAX_LEVEL, upgradeCost, RECIPES, TOOL_TIERS, NODES,
  QUESTS, ACHIEVEMENTS, TALK, PAINTS, xpForLevel, TIPS, EVENTS,
} from '../game/data.js';
import { TIERS } from '../game/perf.js';
import { N, idx, tileCenter } from '../game/island.js';
import { buzz } from '../platform.js';
import NOXE_LICENSE from '../engine/LICENSE-noxe-pixel-engine.txt?raw';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const fmt = (n) => {
  n = Math.floor(n);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + 'jt';
  if (Math.abs(n) >= 1e5) return Math.round(n / 1e3) + 'rb';
  return n.toLocaleString('id-ID');
};
const resIcon = (k) => (k === 'coins' ? 'coin' : k === 'xp' ? 'xp' : RES[k]?.icon || 'info');
const resName = (k) => (k === 'coins' ? 'Koin' : k === 'xp' ? 'XP' : RES[k]?.name || k);
const pad2 = (n) => String(Math.floor(n)).padStart(2, '0');

export class UI {
  constructor(app) {
    this.app = app;
    this.game = app.game;
    this.mode = 'explore';
    this.placeType = null;
    this.placeRot = 0;
    this.placeTile = null;
    this.panel = null;
    this.popups = [];
    this.emoteEls = [];
    this._hudT = 0;
    this.root = document.getElementById('ui');
    this.build();
  }

  get world() {
    return this.app.world;
  }
  sfx(name) {
    this.app.audio.play(name);
  }

  // ---------------------------------------------------------------- skeleton

  build() {
    this.root.innerHTML = `
      <div id="hud">
        <div class="hud-row">
          <button class="lvl" data-act="profile"><div class="ring"><b id="lvl">1</b></div></button>
          <div class="chips">
            <div class="chip big" id="c-coins">${icon('coin')}<span>0</span></div>
            <div class="chip" id="c-pop">${icon('pop')}<span>0</span></div>
            <div class="chip" id="c-happy">${icon('happy')}<span>0%</span></div>
          </div>
          <div class="spacer"></div>
          <button class="chip clock" data-act="speed" id="c-clock">${icon('sun')}<span>Hari 1 · 08:00</span><em id="c-speed">1x</em></button>
          <button class="ibtn" data-act="settings">${icon('gear')}</button>
        </div>
        <div class="hud-row res" id="resbar" data-act="inventory"></div>
        <div id="event" class="banner hidden" data-act="eventinfo"></div>
      </div>
      <div id="side">
        <button class="ibtn" data-act="quests">${icon('quest')}<i class="badge hidden" id="b-quests"></i><small>Misi</small></button>
        <button class="ibtn" data-act="daily" id="btn-daily">${icon('gift')}<i class="badge hidden" id="b-daily">!</i><small>Hadiah</small></button>
        <button class="ibtn" data-act="map">${icon('map')}<small>Peta</small></button>
        <button class="ibtn" data-act="achievements">${icon('trophy')}<small>Prestasi</small></button>
        <button class="ibtn" data-act="citizens">${icon('people')}<small>Warga</small></button>
      </div>
      <div id="camctl">
        <button class="ibtn sm" data-act="rotl">${icon('rotl')}</button>
        <button class="ibtn sm" data-act="rotr">${icon('rotr')}</button>
        <button class="ibtn sm" data-act="follow" id="btn-follow">${icon('center')}</button>
      </div>
      <div id="toolbar">
        <button class="tbtn" data-act="build">${icon('build')}<span>Bangun</span></button>
        <button class="tbtn" data-act="road">${icon('road')}<span>Jalan</span></button>
        <button class="tbtn" data-act="craft">${icon('craft')}<span>Kerajinan</span></button>
        <button class="tbtn" data-act="market">${icon('market')}<span>Pasar</span></button>
      </div>
      <div id="placebar" class="hidden"></div>
      <div id="hint" class="hidden"></div>
      <div id="sheet" class="hidden"><div class="sheet-head"><h2 id="sheet-title"></h2><button class="ibtn sm close" data-act="close">${icon('close')}</button></div><div id="sheet-body"></div></div>
      <div id="modal" class="hidden"><div class="modal-box"><div id="modal-body"></div></div></div>
      <div id="toasts"></div>
      <div id="popups"></div>
      <div id="emotes"></div>
      <div id="fps" class="hidden"></div>
      <div id="title">
        <div class="title-box">
          <div class="logo"><span class="l1">PIXEL</span><span class="l2">DIORAMA</span><span class="l3">World Builder</span></div>
          <button class="btn primary big" data-act="start" id="btn-start">Memuat...</button>
          <div class="credit">F7 Developer</div>
        </div>
      </div>`;
    this.root.addEventListener('click', (e) => this._click(e));
    this.root.addEventListener('pointerdown', () => this.app.unlockAudio?.(), { once: true });
    // emote pool
    const em = $('#emotes');
    for (let k = 0; k < 14; k++) {
      const el = document.createElement('img');
      el.className = 'emote';
      el.draggable = false;
      em.appendChild(el);
      this.emoteEls.push(el);
    }
  }

  ready(hasSave) {
    const b = $('#btn-start');
    b.textContent = hasSave ? 'Lanjutkan' : 'Mulai Bermain';
    b.disabled = false;
  }

  hideTitle() {
    const t = $('#title');
    t.classList.add('out');
    document.body.classList.remove('intro');
    setTimeout(() => t.remove(), 600);
    this.titleGone = true;
  }

  // ---------------------------------------------------------------- clicks

  _click(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act, arg = el.dataset.arg;
    if (el.disabled) return;
    const g = this.game;
    const keepSound = ['close', 'start'];
    if (!keepSound.includes(act)) this.sfx('ui');
    buzz('light');
    switch (act) {
      case 'start': this.app.start(); break;
      case 'close': this.closeSheet(); break;
      case 'modal-ok': this.closeModal(el.dataset.next); break;
      case 'settings': this.openSettings(); break;
      case 'speed': {
        const sp = g.s.settings.speed >= 3 ? 1 : g.s.settings.speed + 1;
        g.s.settings.speed = sp;
        this.toast(`Kecepatan waktu ${sp}x`);
        this.refreshHUD(true);
        break;
      }
      case 'inventory': this.openInventory(); break;
      case 'profile': this.openProfile(); break;
      case 'quests': this.openQuests(); break;
      case 'daily': this.openDaily(); break;
      case 'map': this.openMap(); break;
      case 'achievements': this.openAchievements(); break;
      case 'citizens': this.openCitizens(); break;
      case 'eventinfo': this.openEventInfo(); break;
      case 'rotl': this.app.cam.rotateBy(-90); break;
      case 'rotr': this.app.cam.rotateBy(90); break;
      case 'follow': this.toggleFollow(); break;
      case 'build': this.openBuild(); break;
      case 'road': this.enterRoad(); break;
      case 'craft': this.openCraft(); break;
      case 'market': this.openMarket(); break;
      case 'buildcat': this.openBuild(arg); break;
      case 'pick-build': this.startPlace(arg); break;
      case 'place-rot': this.placeRot = (this.placeRot + 1) % 4; this.updateGhost(); break;
      case 'place-ok': this.confirmPlace(); break;
      case 'place-cancel': this.exitMode(); break;
      case 'road-on': this.roadErase = false; this.renderPlacebar(); break;
      case 'road-off': this.roadErase = true; this.renderPlacebar(); break;
      case 'road-done': this.exitMode(); break;
      case 'b-upgrade': this.doUpgrade(); break;
      case 'b-paint': this.doPaint(); break;
      case 'b-rotate': this.doRotate(); break;
      case 'b-demolish': this.doDemolish(); break;
      case 'b-craft': this.openCraft(); break;
      case 'b-market': this.openMarket(); break;
      case 'npc-talk': this.npcTalk(); break;
      case 'npc-gift': this.npcGift(); break;
      case 'npc-req': this.npcRequest(); break;
      case 'npc-goto': this.focusNpc(+arg); break;
      case 'craft-do': this.doCraft(arg); break;
      case 'tool-up': this.doToolUp(); break;
      case 'sell': this.doSell(arg, +el.dataset.n); break;
      case 'buy': this.doBuy(arg, +el.dataset.n); break;
      case 'quest-claim': this.claimQuest(arg); break;
      case 'daily-claim': this.claimDaily(); break;
      case 'island-go': this.goIsland(arg); break;
      case 'island-buy': this.buyIsland(arg); break;
      case 'set': this.changeSetting(arg, el.dataset.v); break;
      case 'credits': this.openCredits(); break;
      case 'wipe': this.confirmWipe(); break;
      case 'hint-ok': this.dismissHint(); break;
      case 'tab': this._tab(el); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- HUD

  refreshHUD(force = false) {
    const g = this.game, s = g.s;
    const P = s.player;
    $('#lvl').textContent = P.level;
    const pct = Math.min(1, P.xp / xpForLevel(P.level));
    $('.ring').style.setProperty('--p', `${Math.round(pct * 100)}%`);
    $('#c-coins span').textContent = fmt(P.coins);
    const I = g.I;
    $('#c-pop span').textContent = `${I.npcs.length}/${g.housingCap()}`;
    const hap = Math.round(g.islandHappiness());
    $('#c-happy span').textContent = `${hap}%`;
    $('#c-happy img').src = iconURL(hap >= 45 ? 'happy' : 'sad');
    const T = s.time;
    const w = g.weatherName();
    const night = T.hour < 6 || T.hour >= 19.5;
    $('#c-clock img').src = iconURL(w === 'clear' ? (night ? 'moon' : 'sun') : WEATHER_ICON[w]);
    $('#c-clock span').textContent = `Hari ${T.day} · ${pad2(T.hour)}:${pad2((T.hour % 1) * 60)}`;
    $('#c-speed').textContent = `${s.settings.speed}x`;
    // resources: always the basics, plus anything the player owns
    const cap = g.storageCap();
    const keys = RES_KEYS.filter((k) => ['wood', 'stone', 'food'].includes(k) || s.res[k] > 0);
    const html = keys.map((k) => `<div class="chip sm ${s.res[k] >= cap ? 'full' : ''} ${k === 'food' && s.res[k] < I.npcs.length * 2 ? 'low' : ''}">${icon(RES[k].icon)}<span>${fmt(s.res[k])}</span></div>`).join('') + `<div class="chip sm cap">${icon('storage')}<span>${fmt(cap)}</span></div>`;
    if (html !== this._resHTML) {
      $('#resbar').innerHTML = html;
      this._resHTML = html;
    }
    const cq = g.claimableQuests();
    const bq = $('#b-quests');
    bq.classList.toggle('hidden', !cq);
    bq.textContent = cq;
    $('#b-daily').classList.toggle('hidden', !g.dailyStatus().available);
    $('#btn-daily').classList.toggle('glow', g.dailyStatus().available);
    const ev = s.event;
    const eb = $('#event');
    if (ev && ev.island === g.biome) {
      const def = EVENTS.find((e) => e.id === ev.id);
      const left = Math.max(0, ev.until - g.absHour());
      eb.innerHTML = `${icon('event')}<b>${esc(def.name)}</b><span>${Math.floor(left)}j ${pad2((left % 1) * 60)}m</span>`;
      eb.classList.remove('hidden');
    } else eb.classList.add('hidden');
    $('#btn-follow').classList.toggle('on', !!this.app.cam.follow);
    if (this.panel?.live) this.panel.live();
  }

  update(dt) {
    this._hudT -= dt;
    if (this._hudT <= 0) {
      this._hudT = 0.25;
      this.refreshHUD();
      if (this.game.s.settings.fps) {
        const p = this.app.perf;
        $('#fps').textContent = `${p.fps} fps · ${TIERS[p.tier].name}${p.extraPixel ? ' +' + p.extraPixel : ''}`;
      }
    }
    // popups follow the world
    const now = performance.now();
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const P = this.popups[i];
      const t = (now - P.t0) / 1400;
      if (t >= 1) {
        P.el.remove();
        this.popups.splice(i, 1);
        continue;
      }
      const s = this.world.project(P.pos);
      P.el.style.transform = `translate(${s.x}px, ${s.y - t * 36}px) translate(-50%, -100%)`;
      P.el.style.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    }
    // emotes
    const list = this.world.emotes(this.emoteEls.length);
    this.emoteEls.forEach((el, i) => {
      const e = list[i];
      if (!e) {
        if (el.style.display !== 'none') el.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      const src = iconURL(e.icon);
      if (el.dataset.ic !== e.icon) {
        el.src = src;
        el.dataset.ic = e.icon;
      }
      el.style.transform = `translate(${e.x}px, ${e.y}px) translate(-50%, -100%)`;
    });
  }

  // ---------------------------------------------------------------- toasts, popups, modals

  toast(text, { kind = '', icon: ic = null, ms = 2600 } = {}) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = `${ic ? icon(ic) : ''}<span>${esc(text)}</span>`;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 400);
  }

  popup(pos, items) {
    if (this.popups.length > 24) return;
    const el = document.createElement('div');
    el.className = 'popup';
    el.innerHTML = Object.entries(items).map(([k, v]) => `<span>${icon(resIcon(k))}+${fmt(v)}</span>`).join('');
    $('#popups').appendChild(el);
    this.popups.push({ el, pos: pos.clone(), t0: performance.now() });
  }

  modal(html, { onClose = null, cls = '' } = {}) {
    const m = $('#modal');
    $('#modal-body').innerHTML = html;
    m.className = cls;
    m.classList.remove('hidden');
    this._modalClose = onClose;
    this._modalOpen = true;
  }
  closeModal() {
    $('#modal').classList.add('hidden');
    this._modalOpen = false;
    const fn = this._modalClose;
    this._modalClose = null;
    fn?.();
    this._nextModal();
  }
  /** Queue modals so rewards never stack on top of each other. */
  queueModal(fn) {
    (this._mq ||= []).push(fn);
    if (!this._modalOpen && this.titleGone) this._nextModal();
  }
  _nextModal() {
    if (this._modalOpen || !this._mq?.length) return;
    const fn = this._mq.shift();
    fn();
  }
  rewardHTML(items) {
    return `<div class="rewards">${Object.entries(items || {}).filter(([, v]) => v).map(([k, v]) => `<div class="rw">${icon(resIcon(k), 'lg')}<b>+${fmt(v)}</b><small>${esc(resName(k))}</small></div>`).join('')}</div>`;
  }
  confirm(title, text, yes, onYes) {
    this.modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="row"><button class="btn" data-act="modal-ok">Batal</button><button class="btn danger" id="confirm-yes">${esc(yes)}</button></div>`);
    $('#confirm-yes').onclick = () => {
      this._modalClose = null;
      this.closeModal();
      onYes();
    };
  }

  // ---------------------------------------------------------------- sheet (bottom panel)

  openSheet(title, html, { live = null, wide = false, kind = '' } = {}) {
    const sh = $('#sheet');
    $('#sheet-title').innerHTML = title;
    $('#sheet-body').innerHTML = html;
    sh.className = wide ? 'wide' : '';
    sh.dataset.kind = kind;
    this.panel = { kind, live };
    document.body.classList.add('sheet-open');
  }
  closeSheet() {
    $('#sheet').classList.add('hidden');
    document.body.classList.remove('sheet-open');
    this.sfx('back');
    if (this.panel?.kind === 'building') this.world.select(null);
    if (this.panel?.kind === 'npc') {
      const rt = this.world.npcRuntime(this._npcId);
      if (rt) rt.talkHold = 0;
    }
    this.panel = null;
  }
  get sheetOpen() {
    return !!this.panel;
  }

  _tab(el) {
    const group = el.closest('.tabs');
    group.querySelectorAll('[data-act="tab"]').forEach((b) => b.classList.toggle('on', b === el));
    const host = group.parentElement;
    host.querySelectorAll('[data-tab]').forEach((p) => p.classList.toggle('hidden', p.dataset.tab !== el.dataset.arg));
  }

  costHTML(cost, mult = 1) {
    const g = this.game;
    return Object.entries(cost || {}).map(([k, v]) => {
      const n = Math.ceil(v * mult);
      const have = k === 'coins' ? g.s.player.coins : g.s.res[k] || 0;
      return `<span class="cost ${have < n ? 'short' : ''}">${icon(resIcon(k))}${fmt(n)}</span>`;
    }).join('');
  }

  // ---------------------------------------------------------------- build menu & placement

  openBuild(cat = this._buildCat || 'home') {
    this._buildCat = cat;
    const g = this.game, biome = g.biome;
    const tabs = BUILD_CATS.map((c) => `<button class="tab ${c.id === cat ? 'on' : ''}" data-act="buildcat" data-arg="${c.id}">${esc(c.name)}</button>`).join('');
    const cards = Object.entries(BUILDINGS)
      .filter(([id, d]) => d.cat === cat && !d.fixed && g.biomeAllows(id))
      .sort((a, b) => a[1].unlock - b[1].unlock)
      .map(([id, d]) => {
        const locked = !g.isUnlocked(id);
        const limited = d.limit && g.countType(id, g.I) >= d.limit;
        const src = thumb(id, biome, 0, (url) => {
          const im = document.querySelector(`img[data-thumb="${biome}:${id}"]`);
          if (im && url) im.src = url;
        });
        return `<button class="card ${locked ? 'locked' : ''} ${limited ? 'done' : ''}" data-act="pick-build" data-arg="${id}" ${locked || limited ? 'disabled' : ''}>
          <div class="thumb"><img data-thumb="${biome}:${id}" src="${src || iconURL('build')}" alt=""></div>
          <b>${esc(d.name)}</b>
          ${locked ? `<div class="lockline">${icon('lock')} Level ${d.unlock}</div>` : limited ? `<div class="lockline">Sudah dibangun</div>` : `<div class="costs">${this.costHTML(d.cost)}</div>`}
        </button>`;
      }).join('');
    this.openSheet(`${icon('build')} Bangun di ${esc(BIOMES[biome].short)}`, `<div class="tabs">${tabs}</div><div class="cards">${cards || '<p class="muted">Belum ada bangunan di kategori ini untuk pulau ini.</p>'}</div>`, { kind: 'build', wide: true });
  }

  startPlace(type) {
    this.closeSheet();
    this.mode = 'place';
    this.placeType = type;
    this.placeRot = 0;
    const t = this.app.centerTile();
    this.placeTile = t;
    document.body.classList.add('placing');
    this.updateGhost();
    this.showHint(`Ketuk petak untuk memindahkan ${BUILDINGS[type].name}. Geser untuk melihat sekeliling.`, 'place');
  }

  updateGhost() {
    if (this.mode !== 'place' || !this.placeTile) return;
    const [i, j] = this.placeTile;
    const chk = this.game.canPlace(this.placeType, i, j);
    this._placeChk = chk;
    const rot = BUILDINGS[this.placeType].needWater && chk.ok ? this.game.waterRot(i, j) : this.placeRot;
    this.world.setGhost(this.placeType, i, j, rot, chk.ok);
    this.renderPlacebar();
  }

  renderPlacebar() {
    const bar = $('#placebar');
    if (this.mode === 'place') {
      const d = BUILDINGS[this.placeType];
      const chk = this._placeChk || { ok: false };
      bar.innerHTML = `<div class="pb-info"><b>${esc(d.name)}</b><div class="costs">${this.costHTML(d.cost)}</div>${chk.ok ? '' : `<div class="warn">${esc(chk.reason || '')}</div>`}</div>
        <button class="ibtn" data-act="place-cancel">${icon('cross')}</button>
        <button class="ibtn" data-act="place-rot">${icon('rotr')}</button>
        <button class="ibtn ok ${chk.ok ? '' : 'off'}" data-act="place-ok">${icon('check')}</button>`;
    } else if (this.mode === 'road') {
      bar.innerHTML = `<div class="pb-info"><b>${this.roadErase ? 'Hapus Jalan' : 'Bangun Jalan'}</b><div class="muted">${this.roadErase ? 'Ketuk atau seret untuk menghapus' : 'Ketuk atau seret · 1 batu per petak'}</div></div>
        <button class="ibtn ${!this.roadErase ? 'on' : ''}" data-act="road-on">${icon('road')}</button>
        <button class="ibtn ${this.roadErase ? 'on' : ''}" data-act="road-off">${icon('trash')}</button>
        <button class="ibtn ok" data-act="road-done">${icon('check')}</button>`;
    }
    bar.classList.toggle('hidden', this.mode === 'explore');
    $('#toolbar').classList.toggle('hidden', this.mode !== 'explore');
  }

  confirmPlace() {
    const [i, j] = this.placeTile;
    const type = this.placeType;
    const res = this.game.place(type, i, j, this.placeRot);
    if (!res.ok) {
      this.sfx('error');
      this.toast(res.reason, { kind: 'warn' });
      return;
    }
    this.sfx('place');
    buzz('medium');
    this.toast(`${BUILDINGS[type].name} sedang dibangun`, { icon: 'build' });
    const d = BUILDINGS[type];
    // keep placing small things; leave placement for big ones or when out of money
    if (d.small && this.game.has(d.cost)) {
      this.world.clearGhost();
      this.updateGhost();
    } else this.exitMode();
  }

  enterRoad() {
    this.closeSheet();
    this.mode = 'road';
    this.roadErase = false;
    this.app.cam.mode = 'paint';
    document.body.classList.add('placing');
    this.renderPlacebar();
    this.showHint('Seret satu jari untuk menggambar jalan. Pakai dua jari untuk menggeser kamera.', 'road');
  }

  exitMode() {
    this.mode = 'explore';
    this.placeType = null;
    this.world.clearGhost();
    this.app.cam.mode = 'pan';
    document.body.classList.remove('placing');
    this.renderPlacebar();
    if (this._hintKind === 'place' || this._hintKind === 'road') this.dismissHint();
  }

  // ---------------------------------------------------------------- taps in the world

  onTap(x, y) {
    const w = this.world, g = this.game;
    if (this.mode === 'place') {
      const t = w.pickTile(x, y);
      if (t) {
        const s = BUILDINGS[this.placeType].size;
        this.placeTile = [Math.min(N - s, t[0]), Math.min(N - s, t[1])];
        this.updateGhost();
        this.sfx('pop');
      }
      return;
    }
    if (this.mode === 'road') {
      const t = w.pickTile(x, y);
      if (t && g.paintRoad(t[0], t[1], !this.roadErase)) this.sfx('pop');
      return;
    }
    const hit = w.pick(x, y);
    if (!hit) return;
    switch (hit.type) {
      case 'npc':
        this.openNpc(hit.rt.p.id);
        break;
      case 'visitor':
        w.mayorFetch('visitor', ...this._tileOf(hit.rt.pos));
        break;
      case 'chest':
        w.mayorFetch('chest', hit.i, hit.j);
        this.sfx('pop');
        break;
      case 'cat':
        w.mayorFetch('cat', hit.i, hit.j);
        this.sfx('pop');
        break;
      case 'mayor':
        this.openProfile();
        break;
      case 'building':
        this.openBuilding(hit.rec);
        break;
      case 'node': {
        if (w.mayorGather(hit.k)) {
          this.sfx('pop');
          const n = g.I.nodes[hit.k];
          if (!g.s.tips) this.toast(`Mengumpulkan ${NODES[n.k].name}...`, { icon: RES[NODES[n.k].res].icon, ms: 1400 });
        }
        break;
      }
      case 'tile':
        w.mayorGoTo(hit.i, hit.j);
        break;
    }
  }

  _tileOf(pos) {
    return [Math.floor(pos.x + N / 2), Math.floor(pos.z + N / 2)];
  }

  onPaint(x, y, phase) {
    if (this.mode !== 'road' || phase === 'cancel') return;
    const t = this.world.pickTile(x, y);
    if (!t) return;
    const key = t[0] * 100 + t[1];
    if (phase === 'start') this._painted = new Set();
    if (this._painted?.has(key)) return;
    this._painted?.add(key);
    if (this.game.paintRoad(t[0], t[1], !this.roadErase)) this.sfx('pop');
  }

  // ---------------------------------------------------------------- building panel

  openBuilding(rec) {
    this.world.select(rec);
    this._bRec = rec;
    const render = () => {
      const g = this.game;
      const d = BUILDINGS[rec.type];
      const lvl = rec.level || 1;
      const stars = Array.from({ length: MAX_LEVEL }, (_, k) => `<i class="star ${k < lvl ? 'on' : ''}"></i>`).join('');
      const lines = [];
      if (!rec.built) lines.push(`<div class="stat">${icon('build')} Sedang dibangun... ${Math.round((rec.progress || 0) * 100)}%</div>`);
      if (d.housing) {
        const res = g.I.npcs.filter((p) => p.home === rec.id);
        lines.push(`<div class="stat">${icon('home')} Penghuni ${res.length}/${g.housingOf(rec)}</div>`);
        if (res.length) lines.push(`<div class="names">${res.map((p) => `<button class="pill" data-act="npc-goto" data-arg="${p.id}">${esc(p.name)}</button>`).join('')}</div>`);
      }
      if (d.jobs) {
        const ws = g.I.npcs.filter((p) => p.job === rec.id);
        const here = this.world.presence.get(rec.id) || 0;
        lines.push(`<div class="stat">${icon('work')} Pekerja ${ws.length}/${g.jobsOf(rec)} <small>(${Math.round(here * 10) / 10} sedang bekerja)</small></div>`);
        if (ws.length) lines.push(`<div class="names">${ws.map((p) => `<button class="pill" data-act="npc-goto" data-arg="${p.id}">${esc(p.name)}</button>`).join('')}</div>`);
      }
      if (d.produce) {
        const lv = 1 + 0.5 * (lvl - 1);
        lines.push(`<div class="stat">${Object.entries(d.produce).map(([r, v]) => `${icon(resIcon(r))} ${(v * lv).toFixed(1)}/jam per pekerja`).join(' ')}</div>`);
      }
      if (d.storage) lines.push(`<div class="stat">${icon('storage')} Penyimpanan +${d.storage + (d.storagePerLevel || 0) * (lvl - 1)}</div>`);
      if (d.happy) lines.push(`<div class="stat">${icon('happy')} Kebahagiaan +${d.happy.amount} (radius ${d.happy.radius})</div>`);
      if (d.boost) lines.push(`<div class="stat">${icon('up')} Ladang sekitar +${Math.round(d.boost.amount * 100)}%</div>`);
      const canUp = !d.fixed && !d.small && lvl < MAX_LEVEL && rec.built;
      const upCost = canUp ? upgradeCost(d, lvl) : null;
      const btns = [];
      if (canUp) btns.push(`<button class="btn primary" data-act="b-upgrade">${icon('up')} Tingkatkan <span class="costs">${this.costHTML(upCost)}</span></button>`);
      if (rec.type === 'bengkel') btns.push(`<button class="btn" data-act="b-craft">${icon('craft')} Kerajinan</button>`);
      if (rec.type === 'pasar') btns.push(`<button class="btn" data-act="b-market">${icon('market')} Berdagang</button>`);
      if (!d.fixed) {
        btns.push(`<button class="btn" data-act="b-paint">${icon('paint')} Cat: ${esc(PAINTS[rec.paint || 0].name)}</button>`);
        if (!d.needWater) btns.push(`<button class="btn" data-act="b-rotate">${icon('rotr')} Putar</button>`);
        btns.push(`<button class="btn danger" data-act="b-demolish">${icon('trash')} Bongkar</button>`);
      }
      return `<p class="desc">${esc(d.desc)}</p><div class="stars">${stars}</div>${lines.join('')}<div class="btns">${btns.join('')}</div>`;
    };
    const d = BUILDINGS[rec.type];
    this.openSheet(`${esc(d.name)}`, render(), {
      kind: 'building',
      live: () => {
        if (this._bRec !== rec) return;
        const html = render();
        if (html !== this._bHTML) {
          $('#sheet-body').innerHTML = html;
          this._bHTML = html;
        }
      },
    });
    this._bHTML = '';
  }

  doUpgrade() {
    const r = this.game.upgrade(this._bRec);
    if (!r.ok) {
      this.sfx('error');
      return this.toast(r.reason, { kind: 'warn' });
    }
    this.sfx('levelup');
    buzz('medium');
    this.toast(`${BUILDINGS[this._bRec.type].name} naik ke level ${this._bRec.level}!`, { icon: 'up' });
  }
  doPaint() {
    const p = this.game.repaint(this._bRec);
    this.sfx('pop');
    this.toast(`Cat: ${p.name}`, { icon: 'paint', ms: 1200 });
  }
  doRotate() {
    this.game.rotate(this._bRec);
  }
  doDemolish() {
    const rec = this._bRec;
    this.confirm('Bongkar bangunan?', `${BUILDINGS[rec.type].name} akan dibongkar. Kamu mendapat kembali setengah biayanya.`, 'Bongkar', () => {
      const r = this.game.demolish(rec);
      if (r.ok) {
        this.closeSheet();
        this.sfx('place');
        this.toast('Bangunan dibongkar', { icon: 'trash' });
      }
    });
  }

  // ---------------------------------------------------------------- villagers

  openNpc(id) {
    const g = this.game;
    const p = g.I.npcs.find((q) => q.id === id);
    if (!p) return;
    this._npcId = id;
    const rt = this.world.npcRuntime(id);
    if (rt) {
      rt.talkHold = this.world.time + 6;
      this.world._face(rt, this.world.mayor.pos);
    }
    this._npcLine = this.npcLine(p);
    const render = () => {
      const tr = g.traitOf(p);
      const home = p.home ? g.buildingById(p.home) : null;
      const job = p.job ? g.buildingById(p.job) : null;
      const bar = (v, ic, label) => `<div class="need">${icon(ic)}<small>${label}</small><div class="bar"><i style="width:${Math.round(v)}%" class="${v < 25 ? 'bad' : v < 55 ? 'mid' : ''}"></i></div></div>`;
      const hearts = Math.round((p.friend || 0) / 20);
      const st = this.world.npcRuntime(id);
      const doing = !st ? '' : { walk: 'Sedang berjalan', work: 'Sedang bekerja', leisure: 'Sedang bersantai', dance: 'Berpesta!', inside: 'Di dalam rumah', idle: 'Sedang santai' }[st.mode] || '';
      const req = p.req ? `<div class="request">${icon('quest')}<div><b>Permintaan</b><p>"Bisa bawakan ${p.req.n} ${esc(RES[p.req.res].name)}?"</p><div class="costs">Hadiah: ${this.costHTML(p.req.reward)}</div></div><button class="btn primary" data-act="npc-req">Berikan</button></div>` : '';
      return `<div class="npc-head">
          <div class="face" style="--skin:${p.look.skin};--hair:${p.look.hair};--coat:${p.look.coat}"><i class="h"></i><i class="s"></i><i class="b"></i></div>
          <div><div class="trait">${esc(tr.name)} · <small>${esc(tr.desc)}</small></div>
          <div class="hearts">${Array.from({ length: 5 }, (_, k) => `<img class="ic ${k < hearts ? '' : 'dim'}" src="${iconURL('heart')}">`).join('')}</div>
          <div class="muted">${doing}</div></div>
        </div>
        <div class="speech">"${esc(this._npcLine)}"</div>
        <div class="needs">${bar(p.mood, p.mood > 45 ? 'happy' : 'sad', 'Suasana hati')}${bar(p.need.food, 'food', 'Kenyang')}${bar(p.need.energy, 'energy', 'Energi')}${bar(p.need.fun, 'fun', 'Hiburan')}</div>
        <div class="stat">${icon('home')} ${home ? esc(BUILDINGS[home.type].name) : '<span class="warn">Belum punya rumah</span>'} &nbsp; ${icon('work')} ${job ? esc(BUILDINGS[job.type].name) : '<span class="muted">Menganggur</span>'}</div>
        ${req}
        <div class="btns"><button class="btn" data-act="npc-talk">${icon('chat')} Ngobrol</button><button class="btn" data-act="npc-gift">${icon('gift')} Beri makanan (5)</button></div>`;
    };
    this.openSheet(esc(p.name), render(), {
      kind: 'npc',
      live: () => {
        if (!g.I.npcs.includes(p)) return this.closeSheet();
        const html = render();
        if (html !== this._nHTML) {
          $('#sheet-body').innerHTML = html;
          this._nHTML = html;
        }
        const r = this.world.npcRuntime(id);
        if (r) r.talkHold = this.world.time + 2;
      },
    });
    this._nHTML = '';
    this.app.audio.play('talk', { pitch: 0.8 + (id % 7) * 0.07 });
  }

  npcLine(p) {
    const g = this.game;
    const pickL = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const w = g.weatherName();
    const h = g.s.time.hour;
    if (g.s.event?.id === 'festival') return pickL(TALK.festival);
    if (!p.home) return pickL(TALK.homeless);
    if (p.need.food < 25) return pickL(TALK.hungry);
    if (!p.job && g.I.npcs.length > 2 && Math.random() < 0.6) return pickL(TALK.jobless);
    if (w === 'rain' || w === 'storm') if (Math.random() < 0.5) return pickL(TALK.rain);
    if (w === 'snow' && Math.random() < 0.5) return pickL(TALK.snow);
    if (h < 9 && Math.random() < 0.4) return pickL(TALK.morning);
    if ((h > 19 || h < 5) && Math.random() < 0.4) return pickL(TALK.night);
    if (p.mood > 70) return pickL(TALK.happy);
    if (p.mood < 35) return pickL(TALK.sad);
    return pickL(Math.random() < 0.5 ? TALK.ok : TALK.work);
  }

  _npc() {
    return this.game.I.npcs.find((q) => q.id === this._npcId);
  }
  npcTalk() {
    const p = this._npc();
    if (!p) return;
    const fresh = this.game.talk(p);
    this._npcLine = this.npcLine(p);
    this.app.audio.play('talk', { pitch: 0.8 + (p.id % 7) * 0.07 });
    const rt = this.world.npcRuntime(p.id);
    if (rt) this.world.emote(rt, fresh ? 'heart' : 'chat', 2);
    this._nHTML = '';
    this.panel?.live?.();
  }
  npcGift() {
    const p = this._npc();
    if (!p) return;
    const r = this.game.giftNpc(p);
    if (!r.ok) {
      this.sfx('error');
      return this.toast(r.reason, { kind: 'warn' });
    }
    this.sfx('sparkle');
    this._npcLine = 'Wah, terima kasih banyak!';
    const rt = this.world.npcRuntime(p.id);
    if (rt) this.world.emote(rt, 'heart', 3);
    this._nHTML = '';
  }
  npcRequest() {
    const p = this._npc();
    if (!p) return;
    const r = this.game.fulfilRequest(p);
    if (!r.ok) {
      this.sfx('error');
      return this.toast(r.reason, { kind: 'warn' });
    }
    this.sfx('coin');
    this._npcLine = 'Kamu memang Kepala Desa terbaik!';
    this.toast('Permintaan terpenuhi!', { icon: 'heart' });
    const rt = this.world.npcRuntime(p.id);
    if (rt) this.popup(rt.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), r.reward);
    this._nHTML = '';
  }
  focusNpc(id) {
    const rt = this.world.npcRuntime(id);
    if (rt) {
      this.app.cam.focus(rt.pos, 1.6);
      this.openNpc(id);
    }
  }

  openCitizens() {
    const g = this.game;
    const list = [...g.I.npcs].sort((a, b) => a.mood - b.mood);
    const rows = list.map((p) => {
      const job = p.job ? BUILDINGS[g.buildingById(p.job)?.type]?.name : 'Menganggur';
      return `<button class="row-item" data-act="npc-goto" data-arg="${p.id}">
        <div class="face sm" style="--skin:${p.look.skin};--hair:${p.look.hair};--coat:${p.look.coat}"><i class="h"></i><i class="s"></i><i class="b"></i></div>
        <div class="grow"><b>${esc(p.name)}</b> ${p.req ? icon('quest') : ''}<div class="muted">${esc(job || '')}${p.home ? '' : ' · tanpa rumah'}</div></div>
        <div class="mood">${icon(p.mood > 45 ? 'happy' : 'sad')}${Math.round(p.mood)}%</div></button>`;
    }).join('');
    const free = g.housingCap() - g.I.npcs.length;
    const jobsFree = g.jobsCap() - g.I.npcs.filter((p) => p.job).length;
    this.openSheet(`${icon('people')} Warga ${esc(BIOMES[g.biome].short)}`, `<div class="summary"><span>${icon('home')} Rumah kosong: ${Math.max(0, free)}</span><span>${icon('work')} Lowongan: ${Math.max(0, jobsFree)}</span><span>${icon('happy')} ${Math.round(g.islandHappiness())}%</span></div>${rows || '<p class="muted">Belum ada warga. Bangun rumah!</p>'}`, { kind: 'citizens' });
  }

  // ---------------------------------------------------------------- crafting

  openCraft() {
    const render = () => {
      const g = this.game;
      const slots = g.craftSlots();
      const now = Date.now();
      const Q = g.s.craft.queue;
      const queue = Q.map((q, i) => {
        const R = RECIPES.find((r) => r.id === q.id);
        const p = q.start > now ? 0 : Math.min(1, (now - q.start) / (q.end - q.start));
        return `<div class="qitem ${i < slots ? '' : 'wait'}">${icon(RES[Object.keys(R.out)[0]].icon)}<div class="bar"><i style="width:${Math.round(p * 100)}%"></i></div><small>${i < slots ? Math.max(0, Math.ceil((q.end - now) / 1000)) + 'd' : 'antre'}</small></div>`;
      }).join('');
      const recipes = RECIPES.map((R) => {
        const locked = g.s.player.level < R.unlock;
        const can = !locked && slots && g.has(R.in);
        return `<div class="recipe ${locked ? 'locked' : ''}">
          <div class="rin">${this.costHTML(R.in)}</div><span class="arrow">→</span><div class="rout">${Object.entries(R.out).map(([k, v]) => `${icon(RES[k].icon)}<b>${v}</b>`).join('')}<small>${esc(R.name)} · ${R.time}d</small></div>
          ${locked ? `<span class="lockline">${icon('lock')} Lv ${R.unlock}</span>` : `<button class="btn sm ${can ? 'primary' : ''}" data-act="craft-do" data-arg="${R.id}" ${can ? '' : 'disabled'}>Buat</button>`}
        </div>`;
      }).join('');
      const T = TOOL_TIERS[g.s.player.tool], next = TOOL_TIERS[g.s.player.tool + 1];
      const tool = `<div class="toolbox">${icon('tool', 'lg')}<div class="grow"><b>${esc(T.name)}</b><div class="muted">Hasil per ayunan: ${T.yield}</div></div>${next ? `<button class="btn" data-act="tool-up">${esc(next.name)} <span class="costs">${this.costHTML(next.cost)}</span></button>` : '<span class="muted">Terbaik!</span>'}</div>`;
      return `${slots ? `<div class="muted">Slot pengerjaan: ${slots}</div>` : `<div class="warn">Bangun Bengkel untuk mulai membuat barang.</div>`}<div class="queue">${queue}</div>${recipes}<h3>Alat Kepala Desa</h3>${tool}`;
    };
    this.openSheet(`${icon('craft')} Kerajinan`, render(), {
      kind: 'craft',
      live: () => {
        const html = render();
        if (html !== this._cHTML) {
          $('#sheet-body').innerHTML = html;
          this._cHTML = html;
        }
      },
    });
    this._cHTML = '';
  }
  doCraft(id) {
    const r = this.game.craft(id);
    if (!r.ok) {
      this.sfx('error');
      return this.toast(r.reason, { kind: 'warn' });
    }
    this.sfx('craft');
    this._cHTML = '';
    this.panel?.live?.();
  }
  doToolUp() {
    const r = this.game.upgradeTool();
    if (!r.ok) {
      this.sfx('error');
      return this.toast(r.reason, { kind: 'warn' });
    }
    this.sfx('levelup');
    this.toast(`Alat baru: ${r.tool.name}!`, { icon: 'tool' });
    this._cHTML = '';
  }

  // ---------------------------------------------------------------- market

  openMarket() {
    const render = () => {
      const g = this.game;
      if (!g.hasMarket()) return `<div class="empty">${icon('market', 'xl')}<p>Bangun <b>Pasar</b> (level 3) untuk berdagang dengan pedagang dari pulau lain.</p></div>`;
      const ev = g.s.event?.id === 'caravan' ? `<div class="banner-in">${icon('event')} Karavan Pedagang: harga jual +50%!</div>` : '';
      const rows = RES_KEYS.map((k) => {
        const have = g.s.res[k];
        const sp = g.sellPrice(k), bp = g.buyPrice(k);
        const trend = g.s.market[k] < 0.85 ? 'down' : g.s.market[k] > 1.08 ? 'up' : '';
        return `<div class="mrow">${icon(RES[k].icon)}<div class="grow"><b>${esc(RES[k].name)}</b><div class="muted">Punya ${fmt(have)}</div></div>
          <div class="price ${trend}">${icon('coin')}${sp}</div>
          <button class="btn sm" data-act="sell" data-arg="${k}" data-n="1" ${have < 1 ? 'disabled' : ''}>Jual 1</button>
          <button class="btn sm" data-act="sell" data-arg="${k}" data-n="10" ${have < 10 ? 'disabled' : ''}>10</button>
          <button class="btn sm buy" data-act="buy" data-arg="${k}" data-n="5" ${g.s.player.coins < bp * 5 ? 'disabled' : ''}>Beli 5 · ${bp * 5}</button></div>`;
      }).join('');
      return `${ev}<p class="muted">Harga turun saat kamu menjual banyak dan pulih perlahan setiap jam.</p>${rows}`;
    };
    this.openSheet(`${icon('market')} Pasar`, render(), {
      kind: 'market',
      live: () => {
        const html = render();
        if (html !== this._mHTML) {
          $('#sheet-body').innerHTML = html;
          this._mHTML = html;
        }
      },
    });
    this._mHTML = '';
  }
  doSell(r, n) {
    const got = this.game.sell(r, n);
    if (got) {
      this.sfx('coin');
      this.toast(`Terjual ${n} ${RES[r].name}: +${got} koin`, { icon: 'coin', ms: 1400 });
    }
  }
  doBuy(r, n) {
    const res = this.game.buy(r, n);
    if (!res.ok) {
      this.sfx('error');
      return this.toast(res.reason, { kind: 'warn' });
    }
    this.sfx('coin');
  }

  // ---------------------------------------------------------------- quests, achievements, daily

  openQuests() {
    const render = () => {
      const g = this.game;
      const qs = g.activeQuests();
      if (!qs.length) return `<div class="empty">${icon('trophy', 'xl')}<p>Semua misi selesai. Kamu luar biasa!</p></div>`;
      return qs.map((q) => {
        const done = g.questDone(q);
        const goals = q.goals.map((gl) => {
          const [a, b] = g.goalProgress(q, gl);
          return `<div class="goal"><div class="bar"><i style="width:${Math.min(100, Math.round((a / b) * 100))}%"></i></div><small>${fmt(Math.min(a, b))}/${fmt(b)}</small></div>`;
        }).join('');
        return `<div class="quest ${done ? 'done' : ''}"><div class="grow"><b>${esc(q.title)}</b><p>${esc(q.desc)}</p>${goals}<div class="costs">${this.costHTML(q.reward)}</div></div>
          ${done ? `<button class="btn primary" data-act="quest-claim" data-arg="${q.id}">Klaim</button>` : ''}</div>`;
      }).join('') + `<p class="muted">${g.s.quests.done.length}/${QUESTS.length} misi selesai</p>`;
    };
    this.openSheet(`${icon('quest')} Misi`, render(), {
      kind: 'quests',
      live: () => {
        const html = render();
        if (html !== this._qHTML) {
          $('#sheet-body').innerHTML = html;
          this._qHTML = html;
        }
      },
    });
    this._qHTML = '';
  }
  claimQuest(id) {
    const got = this.game.claimQuest(id);
    if (!got) return;
    this.sfx('quest');
    buzz('medium');
    const q = QUESTS.find((x) => x.id === id);
    this.queueModal(() => this.modal(`<div class="burst"></div><h2>Misi Selesai!</h2><p>${esc(q.title)}</p>${this.rewardHTML(got)}<button class="btn primary big" data-act="modal-ok">Hore!</button>`, { cls: 'celebrate' }));
  }

  openAchievements() {
    const g = this.game;
    const got = ACHIEVEMENTS.filter((a) => g.s.ach[a.id]).length;
    const html = ACHIEVEMENTS.map((a) => {
      const v = g.statValue(a.stat);
      const done = !!g.s.ach[a.id];
      return `<div class="ach ${done ? 'done' : ''}">${icon(done ? 'trophy' : 'lock', 'lg')}<div class="grow"><b>${esc(a.name)}</b><p>${esc(a.desc)}</p>${done ? '' : `<div class="bar"><i style="width:${Math.min(100, Math.round((v / a.n) * 100))}%"></i></div>`}${a.unlocks ? `<small class="muted">Membuka: ${esc(a.unlocks)}</small>` : ''}</div><div class="costs">${this.costHTML(a.reward)}</div></div>`;
    }).join('');
    this.openSheet(`${icon('trophy')} Prestasi ${got}/${ACHIEVEMENTS.length}`, html, { kind: 'ach' });
  }

  openDaily() {
    const g = this.game;
    const st = g.dailyStatus();
    const days = [1, 2, 3, 4, 5, 6, 7].map((d) => {
      const streak = st.available ? st.streak : g.s.daily.streak;
      const pos = ((streak - 1) % 7) + 1;
      const cls = d < pos || (!st.available && d === pos) ? 'got' : d === pos && st.available ? 'today' : '';
      return `<div class="day ${cls}"><small>Hari ${d}</small>${icon(d === 7 ? 'chest' : 'gift', 'lg')}</div>`;
    }).join('');
    this.openSheet(`${icon('calendar')} Hadiah Harian`, `<div class="days">${days}</div>
      ${st.available ? `<p>Hadiah hari ini (beruntun ${st.streak} hari):</p>${this.rewardHTML(st.reward)}<button class="btn primary big" data-act="daily-claim">Ambil Hadiah</button>` : `<p class="muted">Sudah diambil hari ini. Kembali besok untuk menjaga rantai ${g.s.daily.streak} hari!</p>`}`, { kind: 'daily' });
  }
  claimDaily() {
    const r = this.game.claimDaily();
    if (!r) return;
    this.closeSheet();
    this.sfx('sparkle');
    this.sfx('coin');
    buzz('medium');
    this.queueModal(() => this.modal(`<div class="burst"></div><h2>Hadiah Hari ke-${r.streak}</h2>${this.rewardHTML(r.got)}<button class="btn primary big" data-act="modal-ok">Terima kasih!</button>`, { cls: 'celebrate' }));
  }

  // ---------------------------------------------------------------- map

  openMap() {
    const g = this.game;
    const cards = BIOME_KEYS.map((id) => {
      const B = BIOMES[id];
      const st = g.islandStatus(id);
      const I = g.s.islands[id];
      const cur = id === g.biome;
      let action = '';
      if (cur) action = `<span class="pill on">Kamu di sini</span>`;
      else if (st.open) action = `<button class="btn primary" data-act="island-go" data-arg="${id}">Kunjungi</button>`;
      else if (st.reason) action = `<span class="lockline">${icon('lock')} ${esc(st.reason)}</span>`;
      else action = `<button class="btn ${st.canBuy ? 'primary' : ''}" data-act="island-buy" data-arg="${id}" ${st.canBuy ? '' : 'disabled'}>Buka ${icon('coin')}${fmt(B.cost)}</button>`;
      return `<div class="island ${st.open ? '' : 'locked'} ${cur ? 'cur' : ''}"><div class="swatch" style="--c:${B.color}"></div><div class="grow"><b>${esc(B.name)}</b><p>${esc(B.desc)}</p>${I ? `<small class="muted">${icon('pop')} ${I.npcs.length} warga · ${I.buildings.length} bangunan</small>` : ''}</div>${action}</div>`;
    }).join('');
    this.openSheet(`${icon('map')} Peta Kepulauan`, cards, { kind: 'map' });
  }
  goIsland(id) {
    this.closeSheet();
    this.app.travel(id);
  }
  buyIsland(id) {
    const r = this.game.unlockIsland(id);
    if (!r.ok) {
      this.sfx('error');
      return this.toast(r.reason, { kind: 'warn' });
    }
    this.sfx('levelup');
    buzz('heavy');
    this.closeSheet();
    this.queueModal(() => this.modal(`<div class="burst"></div><h2>Pulau Baru!</h2><p><b>${esc(BIOMES[id].name)}</b> kini terbuka.</p><p class="muted">${esc(BIOMES[id].desc)}</p><button class="btn primary big" data-act="modal-ok">Berangkat!</button>`, { cls: 'celebrate', onClose: () => this.app.travel(id) }));
  }

  // ---------------------------------------------------------------- profile, inventory, event

  openProfile() {
    const g = this.game, P = g.s.player, S = g.s.stats;
    const need = xpForLevel(P.level);
    const next = Object.entries(BUILDINGS).filter(([, d]) => d.unlock > P.level && d.unlock < 99).sort((a, b) => a[1].unlock - b[1].unlock).slice(0, 4);
    this.openSheet(`${icon('star')} Kepala Desa · Level ${P.level}`, `
      <div class="goal"><div class="bar xp"><i style="width:${Math.round((P.xp / need) * 100)}%"></i></div><small>${fmt(P.xp)}/${fmt(need)} XP</small></div>
      <div class="statgrid">
        <div>${icon('build')}<b>${fmt(S.built)}</b><small>dibangun</small></div>
        <div>${icon('wood')}<b>${fmt(S.gathered)}</b><small>dikumpulkan</small></div>
        <div>${icon('craft')}<b>${fmt(S.crafted)}</b><small>dibuat</small></div>
        <div>${icon('coin')}<b>${fmt(S.sold)}</b><small>dijual</small></div>
        <div>${icon('pop')}<b>${fmt(g.population())}</b><small>warga</small></div>
        <div>${icon('calendar')}<b>${fmt(g.s.time.day)}</b><small>hari</small></div>
      </div>
      <h3>Segera terbuka</h3>
      <div class="names">${next.map(([, d]) => `<span class="pill">${icon('lock')} ${esc(d.name)} · Lv ${d.unlock}</span>`).join('') || '<span class="muted">Semua bangunan terbuka!</span>'}</div>
      <h3>Tips</h3><p class="muted">${esc(TIPS[(g.s.time.day + P.level) % TIPS.length])}</p>`, { kind: 'profile' });
  }

  openInventory() {
    const g = this.game;
    const cap = g.storageCap();
    const rows = RES_KEYS.map((k) => `<div class="mrow">${icon(RES[k].icon)}<div class="grow"><b>${esc(RES[k].name)}</b><div class="bar"><i style="width:${Math.min(100, (g.s.res[k] / cap) * 100)}%"></i></div></div><b>${fmt(g.s.res[k])}</b></div>`).join('');
    this.openSheet(`${icon('storage')} Gudang · kapasitas ${fmt(cap)}`, `<p class="muted">Bangun Gudang untuk menambah kapasitas tiap sumber daya.</p>${rows}`, { kind: 'inv' });
  }

  openEventInfo() {
    const ev = this.game.s.event;
    if (!ev) return;
    const def = EVENTS.find((e) => e.id === ev.id);
    this.openSheet(`${icon('event')} ${esc(def.name)}`, `<p>${esc(def.desc)}</p>`, { kind: 'event' });
  }

  // ---------------------------------------------------------------- settings & credits

  openSettings() {
    const S = this.game.s.settings;
    const opt = (key, v, label) => `<button class="seg ${String(S[key]) === String(v) ? 'on' : ''}" data-act="set" data-arg="${key}" data-v="${v}">${label}</button>`;
    const html = `
      <div class="setting"><span>${icon('sound')} Suara</span><div class="segs">${opt('sound', true, 'Nyala')}${opt('sound', false, 'Mati')}</div></div>
      <div class="setting"><span>${icon('music')} Musik</span><div class="segs">${opt('music', true, 'Nyala')}${opt('music', false, 'Mati')}</div></div>
      <div class="setting"><span>Volume suasana</span><div class="segs">${opt('volume', 0.3, 'Pelan')}${opt('volume', 0.7, 'Sedang')}${opt('volume', 1, 'Keras')}</div></div>
      <div class="setting"><span>Volume efek</span><div class="segs">${opt('sfx', 0.4, 'Pelan')}${opt('sfx', 0.9, 'Sedang')}${opt('sfx', 1.4, 'Keras')}</div></div>
      <div class="setting"><span>Kualitas grafis</span><div class="segs">${opt('quality', 'auto', 'Otomatis')}${opt('quality', 'low', 'Rendah')}${opt('quality', 'medium', 'Sedang')}${opt('quality', 'high', 'Tinggi')}</div></div>
      <div class="setting"><span>Ukuran piksel</span><div class="segs">${opt('pixel', 0.75, 'Halus')}${opt('pixel', 1, 'Sedang')}${opt('pixel', 1.4, 'Kasar')}</div></div>
      <div class="setting"><span>Kecepatan waktu</span><div class="segs">${opt('speed', 1, '1x')}${opt('speed', 2, '2x')}${opt('speed', 3, '3x')}</div></div>
      <div class="setting"><span>Getar</span><div class="segs">${opt('haptics', true, 'Nyala')}${opt('haptics', false, 'Mati')}</div></div>
      <div class="setting"><span>Tampilkan FPS</span><div class="segs">${opt('fps', true, 'Ya')}${opt('fps', false, 'Tidak')}</div></div>
      <div class="btns"><button class="btn" data-act="credits">${icon('info')} Kredit & Lisensi</button><button class="btn danger" data-act="wipe">${icon('trash')} Hapus Data</button></div>
      <p class="muted center">Pixel Diorama: World Builder v${this.app.version} · Game sepenuhnya offline, tanpa iklan, tanpa pembelian dalam aplikasi.</p>`;
    this.openSheet(`${icon('gear')} Pengaturan`, html, { kind: 'settings' });
  }

  changeSetting(key, raw) {
    const S = this.game.s.settings;
    const v = raw === 'true' ? true : raw === 'false' ? false : isNaN(+raw) ? raw : +raw;
    S[key] = v;
    this.app.applySettings(key);
    this.openSettings();
  }

  openCredits() {
    this.openSheet(`${icon('info')} Kredit & Lisensi`, `
      <div class="credits">
        <h3>Pixel Diorama: World Builder</h3>
        <p>© 2026 F7 Developer. Semua hak dilindungi.</p>
        <h3>Mesin grafis & suara</h3>
        <p>Renderer pixel-art, siklus siang-malam, cuaca, material, dan audio prosedural dikembangkan dari <b>noxe-pixel-engine</b> karya Daniel Jankulovski, dirilis dengan lisensi MIT.<br><small>github.com/danieljan-design/noxe-pixel-engine</small></p>
        <pre>${esc(NOXE_LICENSE)}</pre>
        <h3>Pustaka sumber terbuka</h3>
        <p><b>three.js</b> © 2010-2026 three.js authors, lisensi MIT.<br><b>Capacitor</b> © Ionic, lisensi MIT.</p>
        <p class="muted">Semua model, ikon, dan suara dalam game ini dibuat secara prosedural oleh kode. Tidak ada aset pihak ketiga.</p>
      </div>`, { kind: 'credits' });
  }

  confirmWipe() {
    this.confirm('Hapus semua data?', 'Seluruh pulau, warga, dan kemajuan akan hilang selamanya. Tindakan ini tidak bisa dibatalkan.', 'Hapus', () => this.app.wipe());
  }

  // ---------------------------------------------------------------- follow & hints

  toggleFollow() {
    const cam = this.app.cam;
    if (cam.follow) cam.follow = null;
    else {
      cam.follow = () => this.world.mayor.pos;
      cam.goal.zoom = Math.max(cam.goal.zoom, 1.3);
    }
    this.refreshHUD();
  }

  showHint(text, kind = 'tip') {
    const h = $('#hint');
    h.innerHTML = `${icon('info')}<span>${esc(text)}</span><button class="ibtn sm" data-act="hint-ok">${icon('close')}</button>`;
    h.classList.remove('hidden');
    this._hintKind = kind;
  }
  dismissHint() {
    $('#hint').classList.add('hidden');
    if (this._hintKind === 'tutorial') this.game.s.tutorialSkip = (this.game.s.tutorialSkip || 0) + 1;
    this._hintKind = null;
  }

  /** Step-by-step first-run guidance, driven by what the player has done. */
  tutorial() {
    const g = this.game, s = g.s;
    if (this.mode !== 'explore' || (s.tutorialSkip || 0) > 0 && s.tutorial >= 99) return;
    const steps = [
      { done: () => s.stats.gathered >= 1, text: 'Selamat datang, Kepala Desa! Ketuk pohon atau batu agar kamu mengumpulkannya.' },
      { done: () => g.countType('rumah') >= 1, text: 'Hebat! Buka menu Bangun di bawah dan dirikan sebuah Rumah.' },
      { done: () => g.countType('ladang') >= 1, text: 'Warga butuh makan. Bangun Ladang (kategori Produksi).' },
      { done: () => s.quests.done.length >= 1, text: 'Lihat Misi di sisi kanan. Selesaikan misi untuk hadiah besar!' },
      { done: () => s.stats.talked >= 1, text: 'Ketuk seorang warga untuk mengobrol dan melihat kebutuhannya.' },
    ];
    while (s.tutorial < steps.length && steps[s.tutorial].done()) s.tutorial++;
    if (s.tutorial >= steps.length) {
      if (this._hintKind === 'tutorial') this.dismissHint();
      s.tutorial = 99;
      return;
    }
    if ((s.tutorialSkip || 0) >= 3) return;
    const text = steps[s.tutorial].text;
    if (this._hintText !== text || this._hintKind !== 'tutorial') {
      if (this._hintKind && this._hintKind !== 'tutorial') return;
      this.showHint(text, 'tutorial');
      this._hintText = text;
    }
  }
}
