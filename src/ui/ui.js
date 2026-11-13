// DOM interface over the canvas: HUD, toolbars, bottom sheets, dialogs, toasts, floating popups,
// villager emotes, title screen and tutorial hints. Touch-first, sized for phones in either
// orientation, with safe-area padding.
import * as THREE from 'three';
import { icon, iconURL, WEATHER_ICON, WEATHER_NAME } from './icons.js';
import { thumb, thumbFurni } from './thumbs.js';
import { FURNITURE, FURNI_CATS, WALLPAPERS, FLOORS, ENTERABLE, comfortStars, homeStats } from '../game/furniture.js';
import {
  RES, RES_KEYS, BIOMES, BIOME_KEYS, BUILDINGS, BUILD_CATS, MAX_LEVEL, upgradeCost, RECIPES, TOOL_TIERS, NODES,
  QUESTS, ACHIEVEMENTS, TALK, PAINTS, xpForLevel, TIPS, EVENTS,
} from '../game/data.js';
import { TIERS } from '../game/perf.js';
import { N, idx, tileCenter } from '../game/island.js';
import { buzz } from '../platform.js';
import NOXE_LICENSE from '../engine/LICENSE-noxe-pixel-engine.txt?raw';
import { TownMixin } from './town.js';
import { FrontierUIMixin } from './frontier-ui.js';
import { MenuMixin } from './menu.js';
import { StoryUIMixin } from './story-ui.js';
import { JuiceMixin } from './juice.js';
import { TECHS } from '../game/systems.js';

const TECH_IDS = TECHS.map((t) => t.id);
const TECH_COST = Object.fromEntries(TECHS.map((t) => [t.id, t.cost]));

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const fmt = (n) => {
  n = Math.floor(n);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e5) return Math.round(n / 1e3) + 'k';
  return n.toLocaleString('en-US');
};
const resIcon = (k) => (k === 'coins' ? 'coin' : k === 'xp' ? 'xp' : RES[k]?.icon || 'info');
const resName = (k) => (k === 'coins' ? 'Coins' : k === 'xp' ? 'XP' : RES[k]?.name || k);
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
          <button class="chip clock" data-act="speed" id="c-clock">${icon('sun')}<i id="c-season" class="season">${icon('flower')}</i><span>Day 1 · 08:00</span><em id="c-speed">1x</em></button>
          <button class="ibtn" data-act="settings">${icon('gear')}</button>
        </div>
        <div class="hud-row res" id="resbar" data-act="inventory"></div>
        <div id="event" class="banner hidden" data-act="eventinfo"></div>
        <button id="story" class="hidden" data-act="story"></button>
      </div>
      <div id="side">
        <button class="ibtn" data-act="quests">${icon('quest')}<i class="badge hidden" id="b-quests"></i><small>Quests</small></button>
        <button class="ibtn" data-act="daily" id="btn-daily">${icon('gift')}<i class="badge hidden" id="b-daily">!</i><small>Rewards</small></button>
        <button class="ibtn" data-act="map">${icon('map')}<small>Map</small></button>
        <button class="ibtn" data-act="achievements">${icon('trophy')}<small>Awards</small></button>
        <button class="ibtn" data-act="citizens">${icon('people')}<small>Villagers</small></button>
      </div>
      <div id="camctl">
        <button class="ibtn sm" data-act="rotl">${icon('rotl')}</button>
        <button class="ibtn sm" data-act="rotr">${icon('rotr')}</button>
        <button class="ibtn sm" data-act="follow" id="btn-follow">${icon('center')}</button>
        <button class="ibtn sm" data-act="photo">${icon('camera')}</button>
      </div>
      <div id="toolbar">
        <button class="tbtn" data-act="build">${icon('build')}<span>Build</span></button>
        <button class="tbtn" data-act="road">${icon('road')}<span>Road</span></button>
        <button class="tbtn" data-act="craft">${icon('craft')}<span>Craft</span></button>
        <button class="tbtn" data-act="market">${icon('market')}<span>Market</span></button>
        <button class="tbtn" data-act="town" id="btn-town">${icon('town')}<span>Town</span><i class="badge hidden" id="b-town"></i><i class="tprog hidden" id="t-prog"><b></b></i></button>
      </div>
      <div id="placebar" class="hidden"></div>
      <div id="hint" class="hidden"></div>
      <div id="sheet" class="hidden"><div class="sheet-head"><h2 id="sheet-title"></h2><button class="ibtn sm close" data-act="close">${icon('close')}</button></div><div id="sheet-body"></div></div>
      <div id="modal" class="hidden"><div class="modal-box"><div id="modal-body"></div></div></div>
      <div id="toasts"></div>
      <div id="popups"></div>
      <div id="emotes"></div>
      <div id="fps" class="hidden"></div>
      ${this.titleHTML()}`;
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
    b.textContent = hasSave ? 'Continue' : 'Play';
    b.disabled = false;
    $('#btn-new').classList.toggle('hidden', !hasSave);
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
      case 'start': this.app.begin(); break;
      case 'close': this.closeSheet(); break;
      case 'modal-ok': this.closeModal(el.dataset.next); break;
      case 'settings': this.openSettings(); break;
      case 'speed': {
        const sp = g.s.settings.speed >= 3 ? 1 : g.s.settings.speed + 1;
        g.s.settings.speed = sp;
        this.toast(`Game speed ${sp}x`);
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
      case 'b-enter': this.closeSheet(); this.app.enterHouse(this._bRec); break;
      case 'in-exit': this.app.leaveHouse(); break;
      case 'in-furnish': this.setFurnish(true); break;
      case 'in-done': this.setFurnish(false); break;
      case 'in-shop': this.openFurniShop(arg); break;
      case 'in-store': this.openFurniStorage(); break;
      case 'in-style': this.openFinishes(arg); break;
      case 'in-sleep': this.trySleep(); break;
      case 'in-info': this.openHouseInfo(); break;
      case 'furn-buy': this.startFurni(arg, false); break;
      case 'furn-inv': this.startFurni(arg, true); break;
      case 'fp-ok': this.confirmFurni(); break;
      case 'fp-rot': this.app.interior.rotatePlace(); this.sfx('pop'); break;
      case 'fp-cancel': this.app.interior.cancelPlace(); this.renderPlacebar(); break;
      case 'f-move': { const I = this.app.interior; const f = I.rec.furni[I.selected]; if (f) { I.startPlace(f.t, { move: I.selected }); this.renderPlacebar(); } break; }
      case 'f-store': { const t = this.app.interior.storeSelected(); if (t) this.toast(`${FURNITURE[t].name} put in storage`, { icon: 'storage', ms: 1400 }); this.renderPlacebar(); break; }
      case 'f-sell': this.sellFurni(); break;
      case 'f-desel': this.app.interior.select(-1); break;
      case 'style-set': this.applyFinish(el.dataset.kind, +arg); break;
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
      default: this._townClick(act, arg) || this._frontierClick(act, arg) || this._menuClick(act) || this._storyClick(act, arg) || this._photoClick(act, arg); break;
    }
  }

  // ---------------------------------------------------------------- HUD

  refreshHUD(force = false) {
    const g = this.game, s = g.s;
    const P = s.player;
    $('#lvl').textContent = P.level;
    const pct = Math.min(1, P.xp / xpForLevel(P.level));
    $('.ring').style.setProperty('--p', `${Math.round(pct * 100)}%`);
    if (force) this._coinShown = P.coins;
    const I = g.I;
    // villagers / beds: red when someone has no home yet
    const beds = g.housingCap();
    $('#c-pop span').textContent = `${I.npcs.length}/${beds}`;
    $('#c-pop').classList.toggle('low', I.npcs.length > beds);
    $('#c-pop').title = `${I.npcs.length} villagers, room for ${beds}`;
    const hap = Math.round(g.islandHappiness());
    $('#c-happy span').textContent = `${hap}%`;
    $('#c-happy img').src = iconURL(hap >= 45 ? 'happy' : 'sad');
    const T = s.time;
    const w = g.weatherName();
    const night = T.hour < 6 || T.hour >= 19.5;
    $('#c-clock img').src = iconURL(w === 'clear' ? (night ? 'moon' : 'sun') : WEATHER_ICON[w]);
    $('#c-clock span').textContent = `Day ${T.day} · ${pad2(T.hour)}:${pad2((T.hour % 1) * 60)}`;
    $('#c-speed').textContent = `${s.settings.speed}x`;
    const SD = g.seasonDef();
    if (this._seasonId !== SD.id) {
      this._seasonId = SD.id;
      $('#c-season img').src = iconURL(SD.icon);
      $('#c-season').title = SD.name;
    }
    // resources: always the basics, plus anything the player owns
    const cap = g.storageCap();
    // one compact row: the three basics, then a "+N" chip for everything else (tap opens the inventory)
    const BASIC = ['wood', 'stone', 'food'];
    const extra = RES_KEYS.filter((k) => !BASIC.includes(k) && s.res[k] > 0);
    const extraFull = extra.some((k) => s.res[k] >= cap);
    const html = BASIC.map((k) => `<div class="chip sm ${s.res[k] >= cap ? 'full' : ''} ${k === 'food' && s.res[k] < I.npcs.length * 2 ? 'low' : ''}">${icon(RES[k].icon)}<span>${fmt(s.res[k])}</span></div>`).join('')
      + (extra.length ? `<div class="chip sm more ${extraFull ? 'full' : ''}">${icon(RES[extra[0]].icon)}<span>+${extra.length}</span></div>` : '')
      + `<div class="chip sm cap">${icon('storage')}<span>${fmt(cap)}</span></div>`;
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
      const prog = ev.props?.length ? ` · ${ev.found || 0}/${ev.props.length}` : ev.sick ? ` · ${ev.sick.length} sick` : '';
      eb.innerHTML = `${icon(def.icon || 'event')}<b>${esc(def.name)}${prog}</b><span>${Math.floor(left)}h ${pad2((left % 1) * 60)}m</span>`;
      eb.classList.toggle('bad', def.kind === 'bad');
      eb.classList.remove('hidden');
    } else eb.classList.add('hidden');
    $('#btn-follow').classList.toggle('on', !!this.app.cam.follow);
    // the Town button: ready orders and missions, and the running research
    this.refreshStory();
    const nt = g.readyOrders() + g.claimableMissions() + g.readyVoyages();
    const bt = $('#b-town');
    bt.classList.toggle('hidden', !nt);
    bt.textContent = nt;
    const rc = s.research.cur;
    const tp = $('#t-prog');
    tp.classList.toggle('hidden', !rc);
    if (rc) tp.firstChild.style.width = `${Math.min(100, Math.round(((Date.now() - rc.start) / Math.max(1, rc.end - rc.start)) * 100))}%`;
    $('#btn-town').classList.toggle('glow', !rc && P.level >= 2 && !!this._anyTechOpen());
    // the indoor bar shows live status (who sleeps, bedtime)
    if (this.mode === 'interior' && this.app.interior.active) {
      const h = this.interiorBarHTML();
      if (h !== this._ibHTML) {
        $('#placebar').innerHTML = h;
        this._ibHTML = h;
      }
    }
    if (this.panel?.live) this.panel.live();
  }

  _anyTechOpen() {
    const g = this.game;
    this._techT = (this._techT || 0) + 1;
    if (this._techT % 8 && this._techOpen !== undefined) return this._techOpen;
    this._techOpen = TECH_IDS.some((id) => g.techStatus(id).state === 'open' && g.has(TECH_COST[id]));
    return this._techOpen;
  }

  update(dt) {
    this._tickCoins(dt, fmt);
    this._hudT -= dt;
    if (this._hudT <= 0) {
      this._hudT = 0.25;
      this.refreshHUD();
      if (this.game.s.settings.fps) {
        const p = this.app.perf;
        $('#fps').textContent = `${p.fps} fps · ${TIERS[p.tier].name}${p.extraPixel ? ' +' + p.extraPixel : ''}`;
      }
    }
    // popups follow the world (hidden while indoors: they belong to the island)
    const now = performance.now();
    const indoors = this.app.interior.active;
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
      P.el.style.opacity = indoors ? 0 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    }
    // emotes
    const list = (indoors ? this.app.interior : this.world).emotes(this.emoteEls.length);
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
    this.modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="row"><button class="btn" data-act="modal-ok">Cancel</button><button class="btn danger" id="confirm-yes">${esc(yes)}</button></div>`);
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
    const body = $('#sheet-body');
    body.innerHTML = html;
    body.classList.add('fresh');
    clearTimeout(this._freshT);
    this._freshT = setTimeout(() => body.classList.remove('fresh'), 450);
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

  /** Costs (red when the player is short) or, with reward = true, a plain list of what is given. */
  costHTML(cost, mult = 1, reward = false) {
    const g = this.game;
    return Object.entries(cost || {}).map(([k, v]) => {
      const n = Math.ceil(v * mult);
      const have = reward || k === 'xp' ? Infinity : k === 'coins' ? g.s.player.coins : g.s.res[k] || 0;
      return `<span class="cost ${have < n ? 'short' : ''}">${icon(resIcon(k))}${fmt(n)}</span>`;
    }).join('');
  }

  // ---------------------------------------------------------------- build menu & placement

  openBuild(cat = this._buildCat || 'home') {
    this._buildCat = cat;
    const g = this.game, biome = g.biome;
    const tabs = BUILD_CATS.map((c) => `<button class="tab ${c.id === cat ? 'on' : ''}" data-act="buildcat" data-arg="${c.id}">${esc(c.name)}</button>`).join('');
    // buildings of other islands are listed last as a preview of what those islands offer
    const here = (id) => g.biomeAllows(id);
    const cards = Object.entries(BUILDINGS)
      .filter(([, d]) => d.cat === cat && !d.fixed)
      .sort((a, b) => (here(a[0]) ? 0 : 1) - (here(b[0]) ? 0 : 1) || a[1].unlock - b[1].unlock)
      .map(([id, d]) => {
        if (!here(id)) {
          const where = (d.biomes || []).map((bi) => BIOMES[bi]?.short).filter(Boolean).join(', ');
          return `<button class="card locked away" disabled>
          <div class="thumb"><img src="${iconURL('map')}" alt=""></div>
          <b>${esc(d.name)}</b>
          <div class="lockline">${icon('map')} ${where ? `Only on ${esc(where)}` : 'Not on this island'}</div>
        </button>`;
        }
        const locked = !g.isUnlocked(id);
        const limited = d.limit && g.countType(id, g.I) >= d.limit;
        const src = thumb(id, biome, 0, (url) => {
          const im = document.querySelector(`img[data-thumb="${biome}:${id}"]`);
          if (im && url) im.src = url;
        });
        return `<button class="card ${locked ? 'locked' : ''} ${limited ? 'done' : ''}" data-act="pick-build" data-arg="${id}" ${locked || limited ? 'disabled' : ''}>
          <div class="thumb"><img data-thumb="${biome}:${id}" src="${src || iconURL('build')}" alt=""></div>
          <b>${esc(d.name)}</b>
          ${locked ? `<div class="lockline">${icon('lock')} Level ${d.unlock}</div>` : limited ? `<div class="lockline">Already built</div>` : `<div class="costs">${this.costHTML(d.cost)}</div>`}
        </button>`;
      }).join('');
    this.openSheet(`${icon('build')} Build · ${esc(BIOMES[biome].short)}`, `<div class="tabs">${tabs}</div><div class="cards">${cards || '<p class="muted">No buildings in this category for this island yet.</p>'}</div>`, { kind: 'build', wide: true });
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
    this.showHint(`Tap a tile to move the ${BUILDINGS[type].name}. Drag to look around.`, 'place');
  }

  updateGhost() {
    if (this.mode !== 'place' || !this.placeTile) return;
    const [i, j] = this.placeTile;
    const chk = this.game.canPlace(this.placeType, i, j);
    this._placeChk = chk;
    const rot = BUILDINGS[this.placeType].needWater && chk.ok ? this.game.waterRot(i, j, this.game.I, BUILDINGS[this.placeType].size) : this.placeRot;
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
      bar.innerHTML = `<div class="pb-info"><b>${this.roadErase ? 'Remove Road' : 'Build Road'}</b><div class="muted">${this.roadErase ? 'Tap or drag to remove' : 'Tap or drag · 1 stone per tile'}</div></div>
        <button class="ibtn ${!this.roadErase ? 'on' : ''}" data-act="road-on">${icon('road')}</button>
        <button class="ibtn ${this.roadErase ? 'on' : ''}" data-act="road-off">${icon('trash')}</button>
        <button class="ibtn ok" data-act="road-done">${icon('check')}</button>`;
    } else if (this.mode === 'interior' || this.mode === 'furnish') {
      bar.innerHTML = this.interiorBarHTML();
    }
    bar.classList.toggle('hidden', this.mode === 'explore');
    bar.classList.toggle('inbar', this.mode === 'interior' || this.mode === 'furnish');
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
    this.toast(`Building ${BUILDINGS[type].name}...`, { icon: 'build' });
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
    this.showHint('Drag one finger to draw roads. Use two fingers to move the camera.', 'road');
  }

  exitMode() {
    if (this.mode === 'photo') return this.exitPhoto();
    if (this.mode === 'furnish') return this.setFurnish(false);
    if (this.mode === 'interior') return this.app.leaveHouse();
    this.mode = 'explore';
    this.placeType = null;
    this.world.clearGhost();
    this.app.cam.mode = 'pan';
    document.body.classList.remove('placing');
    this.renderPlacebar();
    if (this._hintKind === 'place' || this._hintKind === 'road') this.dismissHint();
  }

  // ---------------------------------------------------------------- house interiors

  iconHTML(name, cls = '') {
    return icon(name, cls);
  }
  starsHTML(n, max = 5) {
    return `<span class="cstars">${Array.from({ length: max }, (_, k) => `<i class="cstar ${k < n ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  houseTitle(rec = this.app.interior.rec) {
    if (!rec) return '';
    if (rec.type === 'balai') return "Mayor's House";
    const res = this.game.I.npcs.filter((p) => p.home === rec.id);
    if (!res.length) return `Empty ${BUILDINGS[rec.type].name}`;
    if (res.length === 1) return `${res[0].name}'s home`;
    return `${res[0].name}'s family`;
  }

  onEnterHouse(rec) {
    this.closeSheet();
    this.mode = 'interior';
    document.body.classList.add('indoors');
    this.renderPlacebar();
    const g = this.game;
    if (!g.s.seenInterior) {
      g.s.seenInterior = 1;
      this.showHint(rec.type === 'balai' ? 'This is your own house. Tap the floor to walk, tap the bed at night to sleep until morning, and press Decorate to furnish it.' : 'Tap the floor to walk around. Residents come home in the evening and sleep here at night. Press Decorate to buy and arrange furniture: comfy homes make happier villagers.', 'interior');
    } else this.toast(this.houseTitle(rec), { icon: 'home', ms: 1600 });
  }

  onLeaveHouse() {
    this.mode = 'explore';
    document.body.classList.remove('indoors');
    if (this._hintKind === 'interior' || this._hintKind === 'furnish') this.dismissHint();
    this.renderPlacebar();
    this.refreshHUD(true);
  }

  interiorBarHTML() {
    const I = this.app.interior, g = this.game;
    if (!I.active) return '';
    const rec = I.rec;
    if (this.mode === 'furnish') {
      if (I.place) {
        const d = FURNITURE[I.place.t];
        const cost = I.place.move >= 0 || I.place.fromInv ? `<div class="muted">${I.place.move >= 0 ? 'Moving' : 'From storage'}</div>` : `<div class="costs">${this.costHTML(d.cost)}</div>`;
        return `<div class="pb-info"><b>${esc(d.name)}</b>${cost}${I.place.ok ? '' : `<div class="warn">${d.wall ? 'Pick a free spot on a wall' : "Doesn't fit here"}</div>`}</div>
          <button class="ibtn" data-act="fp-cancel">${icon('cross')}</button>
          <button class="ibtn" data-act="fp-rot">${icon('rotate')}</button>
          <button class="ibtn ok ${I.place.ok ? '' : 'off'}" data-act="fp-ok">${icon('check')}</button>`;
      }
      const f = rec.furni[I.selected];
      if (f) {
        const d = FURNITURE[f.t];
        return `<div class="pb-info"><b>${esc(d.name)}</b><div class="muted">Comfort +${d.comfort || 0}${d.sleeps ? ` · sleeps ${d.sleeps}` : ''}</div></div>
          <button class="ibtn" data-act="f-move">${icon('move')}</button>
          <button class="ibtn" data-act="f-store">${icon('storage')}</button>
          <button class="ibtn" data-act="f-sell">${icon('coin')}</button>
          <button class="ibtn ok" data-act="f-desel">${icon('check')}</button>`;
      }
      const st = I.stats();
      return `<div class="pb-info"><b>Decorating</b><div class="muted">Comfort ${this.starsHTML(comfortStars(st.comfort))}</div></div>
        <button class="ibtn" data-act="in-shop">${icon('shop')}<small>Shop</small></button>
        <button class="ibtn" data-act="in-store">${icon('storage')}<small>Stored</small></button>
        <button class="ibtn" data-act="in-style">${icon('paint')}<small>Style</small></button>
        <button class="ibtn ok" data-act="in-done">${icon('check')}</button>`;
    }
    const st = I.stats();
    const res = rec.type === 'balai' ? 1 : this.game.residentsOf(rec);
    const home = [...I.people.values()];
    const asleep = home.filter((r) => r.act === 'sleep' || r.act === 'floorSleep').length;
    const status = rec.type === 'balai' ? (g.canSleep() ? 'Bedtime' : g.isRested() ? 'Well rested' : 'Home') : home.length ? (asleep ? `${asleep} asleep` : `${home.length} home`) : 'All out';
    return `<button class="pb-info" data-act="in-info"><b>${esc(this.houseTitle(rec))}</b><div class="muted">${this.starsHTML(comfortStars(st.comfort))} ${icon('bed')}${st.sleeps}/${res} · ${esc(status)}</div></button>
      <button class="ibtn" data-act="in-exit">${icon('exit')}<small>Leave</small></button>
      ${rec.type === 'balai' ? `<button class="ibtn ${g.canSleep() ? 'glow' : ''}" data-act="in-sleep">${icon('sleep')}<small>Sleep</small></button>` : ''}
      <button class="ibtn ok" data-act="in-furnish">${icon('furniture')}<small>Decorate</small></button>`;
  }

  setFurnish(on) {
    const I = this.app.interior;
    if (!I.active) return;
    if (!on) {
      I.cancelPlace();
      I.select(-1);
    }
    this.mode = on ? 'furnish' : 'interior';
    this.renderPlacebar();
    if (on && !this.game.s.seenFurnish) {
      this.game.s.seenFurnish = 1;
      this.showHint('Open the Shop to buy furniture. Tap an item in the room to move, store or sell it. Rotate the camera to reach the other walls.', 'furnish');
    }
  }

  openFurniShop(cat = this._furniCat || 'bed') {
    this._furniCat = cat;
    const g = this.game;
    const tabs = FURNI_CATS.map((c) => `<button class="tab ${c.id === cat ? 'on' : ''}" data-act="in-shop" data-arg="${c.id}">${esc(c.name)}</button>`).join('');
    const cards = Object.entries(FURNITURE)
      .filter(([, d]) => d.cat === cat)
      .sort((a, b) => (a[1].unlock || 1) - (b[1].unlock || 1))
      .map(([id, d]) => {
        const locked = !g.furniUnlocked(id);
        const src = thumbFurni(id, (url) => {
          const im = document.querySelector(`img[data-fthumb="${id}"]`);
          if (im && url) im.src = url;
        });
        const owned = g.s.furn[id] || 0;
        return `<button class="card furn ${locked ? 'locked' : ''}" data-act="furn-buy" data-arg="${id}" ${locked ? 'disabled' : ''}>
          <div class="thumb"><img data-fthumb="${id}" src="${src || iconURL(d.icon)}" alt="">${owned ? `<i class="fcount">${owned}</i>` : ''}</div>
          <b>${esc(d.name)}</b>
          <div class="fmeta">${icon('heart')}+${d.comfort || 0}${d.sleeps ? ` ${icon('bed')}${d.sleeps}` : ''}${d.fun ? ` ${icon('fun')}` : ''}</div>
          ${locked ? `<div class="lockline">${icon('lock')} Level ${d.unlock}</div>` : `<div class="costs">${this.costHTML(d.cost)}</div>`}
        </button>`;
      }).join('');
    this.openSheet(`${icon('shop')} Furniture Shop`, `<div class="tabs">${tabs}</div><div class="cards">${cards}</div>`, { kind: 'furni', wide: true });
  }

  openFurniStorage() {
    const g = this.game;
    const items = Object.entries(g.s.furn).filter(([id, n]) => n > 0 && FURNITURE[id]);
    const cards = items.map(([id, n]) => {
      const d = FURNITURE[id];
      const src = thumbFurni(id, (url) => {
        const im = document.querySelector(`img[data-fthumb="${id}"]`);
        if (im && url) im.src = url;
      });
      return `<button class="card furn" data-act="furn-inv" data-arg="${id}"><div class="thumb"><img data-fthumb="${id}" src="${src || iconURL(d.icon)}" alt=""><i class="fcount">${n}</i></div><b>${esc(d.name)}</b><div class="fmeta">${icon('heart')}+${d.comfort || 0}</div></button>`;
    }).join('');
    this.openSheet(`${icon('storage')} Stored furniture`, items.length ? `<div class="cards">${cards}</div>` : `<p class="muted">Nothing in storage. Tap an item in the room and press ${icon('storage')} to store it here.</p>`, { kind: 'furni', wide: true });
  }

  startFurni(id, fromInv) {
    const g = this.game, d = FURNITURE[id];
    if (!fromInv && !g.has(d.cost)) {
      this.sfx('error');
      return this.toast('Need: ' + g.missing(d.cost).join(', '), { kind: 'warn' });
    }
    this.closeSheet();
    if (this.mode !== 'furnish') this.setFurnish(true);
    this.app.interior.startPlace(id, { fromInv });
    this.renderPlacebar();
  }

  confirmFurni() {
    const I = this.app.interior;
    const P = I.place;
    if (!P) return;
    const moving = P.move >= 0;
    const r = I.confirmPlace();
    if (!r.ok) {
      this.sfx('error');
      return this.toast(r.reason || "Doesn't fit there", { kind: 'warn' });
    }
    this.sfx('place');
    buzz('medium');
    const d = FURNITURE[r.t];
    if (!moving) this.toast(`${d.name} placed · Comfort +${d.comfort || 0}`, { icon: d.icon, ms: 1600 });
    this.renderPlacebar();
    this.refreshHUD(true);
  }

  sellFurni() {
    const I = this.app.interior;
    const f = I.rec.furni[I.selected];
    if (!f) return;
    const d = FURNITURE[f.t];
    this.confirm(`Sell ${d.name}?`, `You get ${Math.floor((d.cost.coins || 0) * 0.5)} coins back.`, 'Sell', () => {
      const got = I.sellSelected();
      this.sfx('coin');
      this.toast(`Sold for ${got} coins`, { icon: 'coin' });
      this.renderPlacebar();
    });
  }

  openFinishes(kind = this._finishKind || 'wall') {
    if (kind !== 'wall' && kind !== 'floor') kind = 'wall';
    this._finishKind = kind;
    const g = this.game, rec = this.app.interior.rec;
    const list = kind === 'wall' ? WALLPAPERS : FLOORS;
    const owned = g.s.finishes[kind];
    const cur = rec[kind] || 0;
    const tabs = `<button class="tab ${kind === 'wall' ? 'on' : ''}" data-act="in-style" data-arg="wall">Wallpaper</button><button class="tab ${kind === 'floor' ? 'on' : ''}" data-act="in-style" data-arg="floor">Floor</button>`;
    const cards = list.map((d, i) => {
      const have = owned.includes(i);
      const sw = kind === 'wall'
        ? `background:${d.stripes ? `repeating-linear-gradient(90deg, ${d.a} 0 10px, ${d.b} 10px 16px)` : d.brick ? `repeating-linear-gradient(0deg, ${d.a} 0 9px, ${d.b} 9px 11px)` : d.planks ? `repeating-linear-gradient(0deg, ${d.a} 0 10px, ${d.b} 10px 20px)` : d.a}`
        : `background:${d.tiles ? `repeating-conic-gradient(${d.a} 0 25%, ${d.b} 0 50%) 0 0 / 24px 24px` : `repeating-linear-gradient(0deg, ${d.a} 0 8px, ${d.b} 8px 16px)`}`;
      return `<button class="card swatch ${i === cur ? 'done' : ''}" data-act="style-set" data-kind="${kind}" data-arg="${i}">
        <div class="thumb"><div class="sw" style="${sw}"></div></div><b>${esc(d.name)}</b>
        ${i === cur ? `<div class="lockline">${icon('check')} In use</div>` : have ? '<div class="lockline">Owned</div>' : `<div class="costs">${this.costHTML(d.cost)}</div>`}
      </button>`;
    }).join('');
    this.openSheet(`${icon('paint')} Room style`, `<div class="tabs">${tabs}</div><div class="cards">${cards}</div>`, { kind: 'furni', wide: true });
  }

  applyFinish(kind, i) {
    const r = this.game.setFinish(this.app.interior.rec, kind, i);
    if (!r.ok) {
      this.sfx('error');
      return r.reason && this.toast(r.reason, { kind: 'warn' });
    }
    this.sfx('place');
    this.app.interior.rebuild();
    this.openFinishes(kind);
  }

  trySleep() {
    const I = this.app.interior;
    if (!I.active || I.rec.type !== 'balai') return this.toast('You can only sleep in your own house: the Town Hall.', { icon: 'sleep' });
    this.app.sleepNight();
  }

  openHouseInfo() {
    const I = this.app.interior, g = this.game, rec = I.rec;
    const st = I.stats();
    const residents = rec.type === 'balai' ? [] : g.I.npcs.filter((p) => p.home === rec.id);
    const where = (p) => {
      const r = I.people.get(p.id);
      if (r) return r.act === 'sleep' || r.act === 'floorSleep' ? `${icon('sleep')} Sleeping` : r.anim === 'sitEat' ? `${icon('food')} Eating` : r.act === 'cook' ? `${icon('kitchen')} Cooking` : `${icon('home')} At home`;
      const rt = this.world.npcRuntime(p.id);
      return rt?.mode === 'work' ? `${icon('work')} At work` : `${icon('people')} Out and about`;
    };
    const rows = residents.map((p) => `<button class="row" data-act="npc-goto" data-arg="${p.id}"><b>${esc(p.name)}</b><span class="muted">${where(p)}</span></button>`).join('');
    const tips = [];
    if (st.sleeps < residents.length) tips.push(`${icon('bed')} Not enough beds: ${residents.length - st.sleeps} sleep on the floor (mood -8).`);
    if (!st.cook && rec.type !== 'balai') tips.push(`${icon('kitchen')} A stove lets residents cook at home.`);
    if (comfortStars(st.comfort) < 3) tips.push(`${icon('heart')} More furniture, rugs and plants make the home cosier.`);
    this.openSheet(`${icon('home')} ${esc(this.houseTitle(rec))}`, `
      <div class="stat">${icon('furniture')} Comfort ${this.starsHTML(comfortStars(st.comfort))} <small>(${st.comfort})</small></div>
      <div class="stat">${icon('bed')} Beds for ${st.sleeps} · ${icon('lamp')} ${st.lights} lights · ${rec.furni.length} items</div>
      ${rows ? `<h3>Residents</h3><div class="list">${rows}</div>` : ''}
      ${tips.length ? `<h3>Tips</h3>${tips.map((t) => `<p class="muted">${t}</p>`).join('')}` : ''}`, { kind: 'house' });
  }

  // ---------------------------------------------------------------- taps in the world

  onTap(x, y) {
    const w = this.world, g = this.game;
    if (this.app.interior.active) return this.app.interior.onTap(x, y);
    if (this.mode === 'photo') {
      document.body.classList.toggle('photo-clean');
      return;
    }
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
        // a burning building: the Mayor runs over with a bucket straight away
        if (g.fireOf(hit.rec) && w.mayor.task?.bid !== hit.rec.id) {
          if (w.mayorFight(hit.rec)) {
            this.sfx('pop');
            this.toast('The Mayor grabs a bucket!', { icon: 'fire', ms: 1500 });
          }
          break;
        }
        this.openBuilding(hit.rec);
        break;
      case 'node': {
        if (w.mayorGather(hit.k)) {
          this.sfx('pop');
          const n = g.I.nodes[hit.k];
          if (!g.s.tips) this.toast(`Gathering ${NODES[n.k].name}...`, { icon: RES[NODES[n.k].res].icon, ms: 1400 });
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
    // ease the camera part of the way toward the building
    const c = this.world.buildingCenter(rec);
    if (c && !this.app.cam.follow) {
      const t = this.app.cam.goal.target;
      t.x += (c.x - t.x) * 0.45;
      t.z += (c.z - t.z) * 0.45;
    }
    const render = () => {
      const g = this.game;
      const d = BUILDINGS[rec.type];
      const lvl = rec.level || 1;
      const stars = Array.from({ length: MAX_LEVEL }, (_, k) => `<i class="star ${k < lvl ? 'on' : ''}"></i>`).join('');
      const lines = [];
      if (!rec.built) lines.push(`<div class="stat">${icon('build')} Under construction... ${Math.round((rec.progress || 0) * 100)}%</div>`);
      if (d.housing) {
        const res = g.I.npcs.filter((p) => p.home === rec.id);
        lines.push(`<div class="stat">${icon('home')} Residents ${res.length}/${g.housingOf(rec)}</div>`);
        if (res.length) lines.push(`<div class="names">${res.map((p) => `<button class="pill" data-act="npc-goto" data-arg="${p.id}">${esc(p.name)}</button>`).join('')}</div>`);
        const hs = g.homeStatsOf(rec);
        lines.push(`<div class="stat">${icon('furniture')} Comfort ${this.starsHTML(comfortStars(hs.comfort))} <small>${icon('bed')} ${hs.sleeps} beds</small></div>`);
      }
      if (d.jobs) {
        const ws = g.I.npcs.filter((p) => p.job === rec.id);
        const here = this.world.presence.get(rec.id) || 0;
        lines.push(`<div class="stat">${icon('work')} Workers ${ws.length}/${g.jobsOf(rec)} <small>(${Math.round(here * 10) / 10} on site)</small></div>`);
        if (ws.length) lines.push(`<div class="names">${ws.map((p) => `<button class="pill" data-act="npc-goto" data-arg="${p.id}">${esc(p.name)}</button>`).join('')}</div>`);
      }
      if (d.produce) {
        const lv = 1 + 0.5 * (lvl - 1);
        lines.push(`<div class="stat">${Object.entries(d.produce).map(([r, v]) => `${icon(resIcon(r))} ${(v * lv).toFixed(1)}/h per worker`).join(' ')}</div>`);
      }
      if (d.storage) lines.push(`<div class="stat">${icon('storage')} Storage +${d.storage + (d.storagePerLevel || 0) * (lvl - 1)}</div>`);
      if (d.happy) lines.push(`<div class="stat">${icon('happy')} Happiness +${d.happy.amount} (radius ${d.happy.radius})</div>`);
      if (d.boost) lines.push(`<div class="stat">${icon('up')} Nearby farms +${Math.round(d.boost.amount * 100)}%</div>`);
      const canUp = !d.fixed && !d.small && lvl < MAX_LEVEL && rec.built && !rec.ruin;
      const upCost = canUp ? upgradeCost(d, lvl) : null;
      const extra = this._buildingExtras(rec);
      lines.unshift(...extra.lines);
      const btns = [...extra.btns];
      if (ENTERABLE.has(rec.type) && rec.built && !rec.ruin) btns.push(`<button class="btn primary" data-act="b-enter">${icon('enter')} ${rec.type === 'balai' ? "Enter the Mayor's house" : 'Go inside'}</button>`);
      if (canUp) btns.push(`<button class="btn primary" data-act="b-upgrade">${icon('up')} Upgrade <span class="costs">${this.costHTML(upCost)}</span></button>`);
      if (rec.type === 'bengkel') btns.push(`<button class="btn" data-act="b-craft">${icon('craft')} Craft</button>`);
      if (rec.type === 'pasar') btns.push(`<button class="btn" data-act="b-market">${icon('market')} Trade</button>`);
      if (!d.fixed) {
        btns.push(`<button class="btn" data-act="b-paint">${icon('paint')} Paint: ${esc(PAINTS[rec.paint || 0].name)}</button>`);
        if (!d.needWater) btns.push(`<button class="btn" data-act="b-rotate">${icon('rotr')} Rotate</button>`);
        btns.push(`<button class="btn danger" data-act="b-demolish">${icon('trash')} Demolish</button>`);
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
    this.toast(`${BUILDINGS[this._bRec.type].name} reached level ${this._bRec.level}!`, { icon: 'up' });
  }
  doPaint() {
    const p = this.game.repaint(this._bRec);
    this.sfx('pop');
    this.toast(`Paint: ${p.name}`, { icon: 'paint', ms: 1200 });
  }
  doRotate() {
    this.game.rotate(this._bRec);
  }
  doDemolish() {
    const rec = this._bRec;
    this.confirm('Demolish building?', `The ${BUILDINGS[rec.type].name} will be torn down. You get half the cost back.`, 'Demolish', () => {
      const r = this.game.demolish(rec);
      if (r.ok) {
        this.closeSheet();
        this.sfx('place');
        this.toast('Building demolished', { icon: 'trash' });
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
      const doing = !st ? '' : { walk: 'Walking', work: 'Working', leisure: 'Relaxing', dance: 'Partying!', inside: 'At home', idle: 'Taking it easy' }[st.mode] || '';
      const req = p.req ? `<div class="request">${icon('quest')}<div><b>Request</b><p>"Could you bring me ${p.req.n} ${esc(RES[p.req.res].name)}?"</p><div class="costs">Reward: ${this.costHTML(p.req.reward)}</div></div><button class="btn primary" data-act="npc-req">Give</button></div>` : '';
      return `<div class="npc-head">
          <div class="face" style="--skin:${p.look.skin};--hair:${p.look.hair};--coat:${p.look.coat}"><i class="h"></i><i class="s"></i><i class="b"></i></div>
          <div><div class="trait">${esc(tr.name)} · <small>${esc(tr.desc)}</small></div>
          <div class="hearts">${Array.from({ length: 5 }, (_, k) => `<img class="ic ${k < hearts ? '' : 'dim'}" src="${iconURL('heart')}">`).join('')}</div>
          <div class="muted">${doing}${job ? ` · ${this.skillStars(p)}` : ''}</div></div>
        </div>
        <div class="speech">"${esc(this._npcLine)}"</div>
        <div class="needs">${bar(p.mood, p.mood > 45 ? 'happy' : 'sad', 'Mood')}${bar(p.need.food, 'food', 'Food')}${bar(p.need.energy, 'energy', 'Energy')}${bar(p.need.fun, 'fun', 'Fun')}</div>
        <div class="stat">${icon('home')} ${home ? esc(BUILDINGS[home.type].name) : '<span class="warn">No home yet</span>'} &nbsp; ${icon('work')} ${job ? esc(BUILDINGS[job.type].name) : '<span class="muted">Unemployed</span>'}</div>
        ${req}
        <div class="btns"><button class="btn" data-act="npc-talk">${icon('chat')} Chat</button><button class="btn" data-act="npc-gift">${icon('gift')} Give food (5)</button></div>`;
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
    this._npcLine = 'Oh, thank you so much!';
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
    this._npcLine = 'You really are the best Mayor!';
    this.toast('Request fulfilled!', { icon: 'heart' });
    const rt = this.world.npcRuntime(p.id);
    if (rt) this.popup(rt.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), r.reward);
    this._nHTML = '';
  }
  focusNpc(id) {
    if (this.app.interior.active) return this.openNpc(id);
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
      const job = p.job ? BUILDINGS[g.buildingById(p.job)?.type]?.name : 'Unemployed';
      return `<button class="row-item" data-act="npc-goto" data-arg="${p.id}">
        <div class="face sm" style="--skin:${p.look.skin};--hair:${p.look.hair};--coat:${p.look.coat}"><i class="h"></i><i class="s"></i><i class="b"></i></div>
        <div class="grow"><b>${esc(p.name)}</b> ${p.req ? icon('quest') : ''}<div class="muted">${esc(job || '')}${p.home ? '' : ' · homeless'}</div></div>
        <div class="mood">${icon(p.mood > 45 ? 'happy' : 'sad')}${Math.round(p.mood)}%</div></button>`;
    }).join('');
    const free = g.housingCap() - g.I.npcs.length;
    const jobsFree = g.jobsCap() - g.I.npcs.filter((p) => p.job).length;
    this.openSheet(`${icon('people')} Villagers of ${esc(BIOMES[g.biome].short)}`, `<div class="summary"><span>${icon('home')} Free beds: ${Math.max(0, free)}</span><span>${icon('work')} Open jobs: ${Math.max(0, jobsFree)}</span><span>${icon('happy')} ${Math.round(g.islandHappiness())}%</span></div>${rows || '<p class="muted">No villagers yet. Build a house!</p>'}`, { kind: 'citizens' });
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
        return `<div class="qitem ${i < slots ? '' : 'wait'}">${icon(RES[Object.keys(R.out)[0]].icon)}<div class="bar"><i style="width:${Math.round(p * 100)}%"></i></div><small>${i < slots ? Math.max(0, Math.ceil((q.end - now) / 1000)) + 's' : 'queued'}</small></div>`;
      }).join('');
      const recipes = RECIPES.map((R) => {
        const locked = g.s.player.level < R.unlock;
        const can = !locked && slots && g.has(R.in);
        return `<div class="recipe ${locked ? 'locked' : ''}">
          <div class="rin">${this.costHTML(R.in)}</div><span class="arrow">→</span><div class="rout">${Object.entries(R.out).map(([k, v]) => `${icon(RES[k].icon)}<b>${v}</b>`).join('')}<small>${esc(R.name)} · ${R.time}s</small></div>
          ${locked ? `<span class="lockline">${icon('lock')} Lv ${R.unlock}</span>` : `<button class="btn sm ${can ? 'primary' : ''}" data-act="craft-do" data-arg="${R.id}" ${can ? '' : 'disabled'}>Make</button>`}
        </div>`;
      }).join('');
      const T = TOOL_TIERS[g.s.player.tool], next = TOOL_TIERS[g.s.player.tool + 1];
      const tool = `<div class="toolbox">${icon('tool', 'lg')}<div class="grow"><b>${esc(T.name)}</b><div class="muted">Yield per swing: ${T.yield}</div></div>${next ? `<button class="btn" data-act="tool-up">${esc(next.name)} <span class="costs">${this.costHTML(next.cost)}</span></button>` : '<span class="muted">Best tool!</span>'}</div>`;
      return `${slots ? `<div class="muted">Craft slots: ${slots}</div>` : `<div class="warn">Build a Workshop to start crafting.</div>`}<div class="queue">${queue}</div>${recipes}<h3>Mayor's Tools</h3>${tool}`;
    };
    this.openSheet(`${icon('craft')} Craft`, render(), {
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
    this.toast(`New tool: ${r.tool.name}!`, { icon: 'tool' });
    this._cHTML = '';
  }

  // ---------------------------------------------------------------- market

  openMarket() {
    const render = () => {
      const g = this.game;
      if (!g.hasMarket()) return `<div class="empty">${icon('market', 'xl')}<p>Build a <b>Market</b> (level 3) to trade with merchants from other islands.</p></div>`;
      const ev = g.s.event?.id === 'caravan' ? `<div class="banner-in">${icon('event')} Merchant Caravan: sell prices +50%!</div>` : '';
      const rows = RES_KEYS.map((k) => {
        const have = g.s.res[k];
        const sp = g.sellPrice(k), bp = g.buyPrice(k);
        const trend = g.s.market[k] < 0.85 ? 'down' : g.s.market[k] > 1.08 ? 'up' : '';
        return `<div class="mrow">${icon(RES[k].icon)}<div class="grow"><b>${esc(RES[k].name)}</b><div class="muted">Owned ${fmt(have)}</div></div>
          <div class="price ${trend}">${icon('coin')}${sp}</div>
          <button class="btn sm" data-act="sell" data-arg="${k}" data-n="1" ${have < 1 ? 'disabled' : ''}>Sell 1</button>
          <button class="btn sm" data-act="sell" data-arg="${k}" data-n="10" ${have < 10 ? 'disabled' : ''}>10</button>
          <button class="btn sm buy" data-act="buy" data-arg="${k}" data-n="5" ${g.s.player.coins < bp * 5 ? 'disabled' : ''}>Buy 5 · ${bp * 5}</button></div>`;
      }).join('');
      return `${ev}<p class="muted">Prices drop when you sell a lot and recover slowly every hour.</p>${rows}`;
    };
    this.openSheet(`${icon('market')} Market`, render(), {
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
      this.toast(`Sold ${n} ${RES[r].name}: +${got} coins`, { icon: 'coin', ms: 1400 });
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
      if (!qs.length) return `<div class="empty">${icon('trophy', 'xl')}<p>All quests complete. You're amazing!</p></div>`;
      return qs.map((q) => {
        const done = g.questDone(q);
        const goals = q.goals.map((gl) => {
          const [a, b] = g.goalProgress(q, gl);
          return `<div class="goal"><div class="bar"><i style="width:${Math.min(100, Math.round((a / b) * 100))}%"></i></div><small>${fmt(Math.min(a, b))}/${fmt(b)}</small></div>`;
        }).join('');
        return `<div class="quest ${done ? 'done' : ''}"><div class="grow"><b>${esc(q.title)}</b><p>${esc(q.desc)}</p>${goals}<div class="costs">${this.costHTML(q.reward, 1, true)}</div></div>
          ${done ? `<button class="btn primary" data-act="quest-claim" data-arg="${q.id}">Claim</button>` : ''}</div>`;
      }).join('') + `<p class="muted">${g.s.quests.done.length}/${QUESTS.length} quests done</p>`;
    };
    this.openSheet(`${icon('quest')} Quests`, render(), {
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
    this.queueModal(() => this.modal(`<div class="burst"></div><h2>Quest Complete!</h2><p>${esc(q.title)}</p>${this.rewardHTML(got)}<button class="btn primary big" data-act="modal-ok">Hooray!</button>`, { cls: 'celebrate' }));
  }

  openAchievements() {
    const g = this.game;
    const got = ACHIEVEMENTS.filter((a) => g.s.ach[a.id]).length;
    const html = ACHIEVEMENTS.map((a) => {
      const v = g.statValue(a.stat);
      const done = !!g.s.ach[a.id];
      return `<div class="ach ${done ? 'done' : ''}">${icon(done ? 'trophy' : 'lock', 'lg')}<div class="grow"><b>${esc(a.name)}</b><p>${esc(a.desc)}</p>${done ? '' : `<div class="bar"><i style="width:${Math.min(100, Math.round((v / a.n) * 100))}%"></i></div>`}${a.unlocks ? `<small class="muted">Unlocks: ${esc(a.unlocks)}</small>` : ''}</div><div class="costs">${this.costHTML(a.reward, 1, true)}</div></div>`;
    }).join('');
    this.openSheet(`${icon('trophy')} Achievements ${got}/${ACHIEVEMENTS.length}`, html, { kind: 'ach' });
  }

  openDaily() {
    const g = this.game;
    const st = g.dailyStatus();
    const days = [1, 2, 3, 4, 5, 6, 7].map((d) => {
      const streak = st.available ? st.streak : g.s.daily.streak;
      const pos = ((streak - 1) % 7) + 1;
      const cls = d < pos || (!st.available && d === pos) ? 'got' : d === pos && st.available ? 'today' : '';
      return `<div class="day ${cls}"><small>Day ${d}</small>${icon(d === 7 ? 'chest' : 'gift', 'lg')}</div>`;
    }).join('');
    this.openSheet(`${icon('calendar')} Daily Reward`, `<div class="days">${days}</div>
      ${st.available ? `<p>Today's reward (${st.streak}-day streak):</p>${this.rewardHTML(st.reward)}<button class="btn primary big" data-act="daily-claim">Claim</button>` : `<p class="muted">Already claimed today. Come back tomorrow to keep your ${g.s.daily.streak}-day streak!</p>`}`, { kind: 'daily' });
  }
  claimDaily() {
    const r = this.game.claimDaily();
    if (!r) return;
    this.closeSheet();
    this.sfx('sparkle');
    this.sfx('coin');
    buzz('medium');
    this.queueModal(() => this.modal(`<div class="burst"></div><h2>Day ${r.streak} Reward</h2>${this.rewardHTML(r.got)}<button class="btn primary big" data-act="modal-ok">Thanks!</button>`, { cls: 'celebrate' }));
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
      if (cur) action = `<span class="pill on">You are here</span>`;
      else if (st.open) action = `<button class="btn primary" data-act="island-go" data-arg="${id}">Visit</button>`;
      else if (st.reason) action = `<span class="lockline">${icon('lock')} ${esc(st.reason)}</span>`;
      else action = `<button class="btn ${st.canBuy ? 'primary' : ''}" data-act="island-buy" data-arg="${id}" ${st.canBuy ? '' : 'disabled'}>Unlock ${icon('coin')}${fmt(B.cost)}</button>`;
      return `<div class="island ${st.open ? '' : 'locked'} ${cur ? 'cur' : ''}"><div class="swatch" style="--c:${B.color}"></div><div class="grow"><b>${esc(B.name)}</b><p>${esc(B.desc)}</p>${I ? `<small class="muted">${icon('pop')} ${I.npcs.length} villagers · ${I.buildings.length} buildings</small>` : ''}</div>${action}</div>`;
    }).join('');
    this.openSheet(`${icon('map')} Island Map`, cards, { kind: 'map' });
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
    this.queueModal(() => this.modal(`<div class="burst"></div><h2>New Island!</h2><p><b>${esc(BIOMES[id].name)}</b> is now open.</p><p class="muted">${esc(BIOMES[id].desc)}</p><button class="btn primary big" data-act="modal-ok">Set sail!</button>`, { cls: 'celebrate', onClose: () => this.app.travel(id) }));
  }

  // ---------------------------------------------------------------- profile, inventory, event

  openProfile() {
    const g = this.game, P = g.s.player, S = g.s.stats;
    const need = xpForLevel(P.level);
    const next = Object.entries(BUILDINGS).filter(([, d]) => d.unlock > P.level && d.unlock < 99).sort((a, b) => a[1].unlock - b[1].unlock).slice(0, 4);
    this.openSheet(`${icon('star')} Mayor · Level ${P.level}`, `
      <div class="goal"><div class="bar xp"><i style="width:${Math.round((P.xp / need) * 100)}%"></i></div><small>${fmt(P.xp)}/${fmt(need)} XP</small></div>
      <div class="statgrid">
        <div>${icon('build')}<b>${fmt(S.built)}</b><small>built</small></div>
        <div>${icon('wood')}<b>${fmt(S.gathered)}</b><small>gathered</small></div>
        <div>${icon('craft')}<b>${fmt(S.crafted)}</b><small>crafted</small></div>
        <div>${icon('coin')}<b>${fmt(S.sold)}</b><small>sold</small></div>
        <div>${icon('pop')}<b>${fmt(g.population())}</b><small>villagers</small></div>
        <div>${icon('calendar')}<b>${fmt(g.s.time.day)}</b><small>days</small></div>
      </div>
      <h3>Coming soon</h3>
      <div class="names">${next.map(([, d]) => `<span class="pill">${icon('lock')} ${esc(d.name)} · Lv ${d.unlock}</span>`).join('') || '<span class="muted">All buildings unlocked!</span>'}</div>
      <h3>Tips</h3><p class="muted">${esc(TIPS[(g.s.time.day + P.level) % TIPS.length])}</p>`, { kind: 'profile' });
  }

  openInventory() {
    const g = this.game;
    const cap = g.storageCap();
    const rows = RES_KEYS.map((k) => `<div class="mrow">${icon(RES[k].icon)}<div class="grow"><b>${esc(RES[k].name)}</b><div class="bar"><i style="width:${Math.min(100, (g.s.res[k] / cap) * 100)}%"></i></div></div><b>${fmt(g.s.res[k])}</b></div>`).join('');
    this.openSheet(`${icon('storage')} Storage · capacity ${fmt(cap)}`, `<p class="muted">Build a Storage to raise the capacity for each resource.</p>${rows}`, { kind: 'inv' });
  }

  openEventInfo() {
    const g = this.game;
    const ev = g.s.event;
    if (!ev) return;
    const def = EVENTS.find((e) => e.id === ev.id);
    const bad = def.kind === 'bad';
    const left = Math.max(0, ev.until - g.absHour());
    const pills = (def.effect || []).map((e) => `<span class="pill ${bad ? '' : 'on'} ${ev.guarded ? 'struck' : ''}">${esc(e)}</span>`).join('');
    let prog = '';
    if (ev.props?.length) prog = `<p><b>Found ${ev.found || 0} of ${ev.props.length}</b></p>`;
    if (ev.sick) prog = `<p><b>${ev.sick.length} of ${ev.total} villagers still sick</b></p>`;
    if (ev.host) prog += `<p class="muted">${ev.host.met ? 'You already greeted the guest.' : 'You have not greeted the guest yet.'}</p>`;
    prog += this.hazardNote(ev, def);
    if (ev.id === 'birthday') {
      const p = g.I.npcs.find((q) => q.id === ev.npc);
      if (p) prog = `<p><b>New home: ${esc(p.name)}</b>${ev.gifted ? ' · gift given' : ''}</p>`;
    }
    if (ev.id === 'royal') prog += `<p>Happiness now: <b>${Math.round(g.islandHappiness())}%</b> (needs 60%)</p>`;
    this.openSheet(
      `${icon(def.icon || 'event')} ${esc(def.name)}`,
      `<p>${esc(def.flavor || def.desc)}</p><div class="names">${pills}</div>${prog}${def.tip ? `<p class="muted">${icon('info')} ${esc(def.tip)}</p>` : ''}<p class="muted">${icon('event')} ${Math.floor(left)}h ${pad2((left % 1) * 60)}m left</p>`,
      { kind: 'event' },
    );
  }

  // ---------------------------------------------------------------- settings & credits

  openSettings() {
    const S = this.game.s.settings;
    const opt = (key, v, label) => `<button class="seg ${String(S[key]) === String(v) ? 'on' : ''}" data-act="set" data-arg="${key}" data-v="${v}">${label}</button>`;
    const html = `
      <div class="setting"><span>${icon('sound')} Sound</span><div class="segs">${opt('sound', true, 'On')}${opt('sound', false, 'Off')}</div></div>
      <div class="setting"><span>${icon('chat')} Story voice</span><div class="segs">${opt('voice', true, 'On')}${opt('voice', false, 'Off')}</div></div>
      <div class="setting"><span>Ambience volume</span><div class="segs">${opt('volume', 0.3, 'Low')}${opt('volume', 0.7, 'Medium')}${opt('volume', 1, 'High')}</div></div>
      <div class="setting"><span>Effects volume</span><div class="segs">${opt('sfx', 0.4, 'Low')}${opt('sfx', 0.9, 'Medium')}${opt('sfx', 1.4, 'High')}</div></div>
      <div class="setting"><span>Graphics quality</span><div class="segs">${opt('quality', 'auto', 'Auto')}${opt('quality', 'low', 'Low')}${opt('quality', 'medium', 'Medium')}${opt('quality', 'high', 'High')}</div></div>
      <div class="setting"><span>Pixel size</span><div class="segs">${opt('pixel', 0.75, 'Fine')}${opt('pixel', 1, 'Medium')}${opt('pixel', 1.4, 'Chunky')}</div></div>
      <div class="setting"><span>Game speed</span><div class="segs">${opt('speed', 1, '1x')}${opt('speed', 2, '2x')}${opt('speed', 3, '3x')}</div></div>
      <div class="setting"><span>Vibration</span><div class="segs">${opt('haptics', true, 'On')}${opt('haptics', false, 'Off')}</div></div>
      <div class="setting"><span>Screen shake</span><div class="segs">${opt('shake', true, 'On')}${opt('shake', false, 'Off')}</div></div>
      <div class="setting"><span>Miniature focus</span><div class="segs">${opt('tilt', true, 'On')}${opt('tilt', false, 'Off')}</div></div>
      <div class="setting"><span>Show FPS</span><div class="segs">${opt('fps', true, 'Yes')}${opt('fps', false, 'No')}</div></div>
      <div class="btns"><button class="btn" data-act="journal">${icon('quest')} Journal</button><button class="btn" data-act="credits">${icon('info')} Credits & Licenses</button><button class="btn" data-act="menu-privacy">${icon('eye')} Ad privacy</button><button class="btn danger" data-act="wipe">${icon('trash')} Delete Data</button></div>
      <p class="muted center">Pixel Diorama: World Builder v${this.app.version} · Plays offline · Ads by Google AdMob · No in-app purchases.</p>`;
    this.openSheet(`${icon('gear')} Settings`, html, { kind: 'settings' });
  }

  changeSetting(key, raw) {
    const S = this.game.s.settings;
    const v = raw === 'true' ? true : raw === 'false' ? false : isNaN(+raw) ? raw : +raw;
    S[key] = v;
    this.app.applySettings(key);
    this.openSettings();
  }

  openCredits() {
    this.openSheet(`${icon('info')} Credits & Licenses`, `
      <div class="credits">
        <h3>Pixel Diorama: World Builder</h3>
        <p>© 2026 F7 Developer. All rights reserved.</p>
        <h3>Graphics & sound engine</h3>
        <p>The pixel-art renderer, day-night cycle, weather, materials and procedural audio are built on <b>noxe-pixel-engine</b> by Daniel Jankulovski, released under the MIT license.<br><small>github.com/danieljan-design/noxe-pixel-engine</small></p>
        <pre>${esc(NOXE_LICENSE)}</pre>
        <h3>Open source libraries</h3>
        <p><b>three.js</b> © 2010-2026 three.js authors, MIT license.<br><b>Capacitor</b> © Ionic, MIT license.</p>
        <p class="muted">All models, icons and sounds in this game are generated procedurally by code. The story narration was made with neural text-to-speech. Ads are served by Google AdMob.</p>
      </div>`, { kind: 'credits' });
  }

  confirmWipe() {
    this.confirm('Delete all data?', 'All islands, villagers and progress will be lost forever. This cannot be undone.', 'Delete', () => this.app.wipe());
  }

  // ---------------------------------------------------------------- follow & hints

  toggleFollow() {
    const cam = this.app.cam;
    if (this.app.interior.active) {
      cam.goal.target.set(0, 0.3, 0);
      return;
    }
    if (cam.follow) cam.follow = null;
    else {
      cam.follow = () => this.world.mayor.pos;
      cam.goal.zoom = Math.max(cam.goal.zoom, 1.3);
    }
    this.refreshHUD();
  }

  /** A short tip above the toolbar; `target` (a selector) gets a pulsing ring so the tip points at it. */
  showHint(text, kind = 'tip', target = null) {
    const h = $('#hint');
    h.innerHTML = `${icon('info')}<span>${esc(text)}</span><button class="ibtn sm" data-act="hint-ok">${icon('close')}</button>`;
    h.classList.remove('hidden');
    this._hintKind = kind;
    this._coach(target);
  }
  _coach(target) {
    document.querySelectorAll('.coach').forEach((el) => el.classList.remove('coach'));
    if (target) document.querySelector(target)?.classList.add('coach');
  }
  dismissHint() {
    $('#hint').classList.add('hidden');
    this._coach(null);
    if (this._hintKind === 'tutorial') this.game.s.tutorialSkip = (this.game.s.tutorialSkip || 0) + 1;
    this._hintKind = null;
  }

  /** Step-by-step first-run guidance, driven by what the player has done. */
  tutorial() {
    const g = this.game, s = g.s;
    if (this.app.interior.active) return;
    if (this.mode !== 'explore' || (s.tutorialSkip || 0) > 0 && s.tutorial >= 99) return;
    const steps = [
      { done: () => s.stats.gathered >= 1, text: 'Welcome, Mayor! Tap a tree or rock to gather it.' },
      { done: () => g.countType('rumah') >= 1, text: 'Great! Tap Build and put up a House.', target: '[data-act="build"]' },
      { done: () => g.countType('ladang') >= 1, text: 'Villagers need food. Build a Farm (Production tab).', target: '[data-act="build"]' },
      { done: () => s.quests.done.length >= 1, text: 'Finish Quests for big rewards!', target: '[data-act="quests"]' },
      { done: () => s.stats.talked >= 1, text: 'Tap a villager to chat and see what they need.' },
    ];
    while (s.tutorial < steps.length && steps[s.tutorial].done()) s.tutorial++;
    if (s.tutorial >= steps.length) {
      if (this._hintKind === 'tutorial') this.dismissHint();
      s.tutorial = 99;
      return;
    }
    if ((s.tutorialSkip || 0) >= 3) return;
    const { text, target } = steps[s.tutorial];
    if (this._hintText !== text || this._hintKind !== 'tutorial') {
      if (this._hintKind && this._hintKind !== 'tutorial') return;
      this.showHint(text, 'tutorial', target);
      this._hintText = text;
    }
  }
}

Object.assign(UI.prototype, TownMixin, JuiceMixin, FrontierUIMixin, MenuMixin, StoryUIMixin);
