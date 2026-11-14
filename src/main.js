// Pixel Diorama: City Builder - app bootstrap: engine, world, input, UI, game loop, saving,
// lifecycle and adaptive quality.
import './styles.css';
import './styles-story.css';
import * as THREE from 'three';
import { PixelEngine } from './engine/pixel-engine.js';
import { Environment } from './engine/environment.js';
import { Ambience } from './engine/audio.js';
import { Game, SECONDS_PER_GAME_HOUR } from './game/game.js';
import { World } from './game/world.js';
import { Interior } from './game/interior.js';
import { shared } from './engine/materials.js';
import { CameraControl } from './game/camera.js';
import { Perf, TIERS, extraPixelSize } from './game/perf.js';
import { UI, fmt } from './ui/ui.js';
import * as platform from './platform.js';
import { BIOMES, BUILDINGS, RES } from './game/data.js';
import { N, tileCenter } from './game/island.js';
import { icon } from './ui/icons.js';
import { Cinematic } from './ui/cinematic.js';
import { initAds, showBanner, hideBanner, maybeInterstitial, showRewarded, showAdPrivacy } from './ads.js';
import { initBilling, refreshPurchases, buyRemoveAds, restorePurchases, onBillingChange } from './billing.js';

const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// big icon on top of an announcement (sits above the spinning .burst background)
const evIcon = (name) => `<div style="position:relative;margin:0 auto 0.2em">${icon(name || 'event', 'xl')}</div>`;

const VERSION = '1.3.0';
const SPLASH_MIN_MS = 1700; // how long the studio card shows at least
const SPLASH_T0 = performance.now(); // when the page (and the splash) came up
const TITLE_HOUR = 10.5;

class App {
  constructor() {
    this.version = VERSION;
    this.paused = false;
    this.started = false;
    this._saveT = 0;
    this._tutT = 0;
    this._terrainDirty = false;
    this._fullT = 0;
  }

  async init() {
    const canvas = (this.canvas = document.getElementById('c'));
    let engine;
    try {
      engine = this.engine = new PixelEngine(canvas);
    } catch (e) {
      document.getElementById('ui').innerHTML = '<div class="fatal"><h2>Graphics not supported</h2><p>This device does not support WebGL 2, which Pixel Diorama needs to run.</p></div>';
      throw e;
    }
    engine.view.snap = true;
    this.env = new Environment();
    this.env.cycle = false;
    this.audio = new Ambience();
    this.env.onThunder = (delay, power) => {
      this.audio.thunder(delay, power);
      setTimeout(() => this.engine.shake(0.05 + power * 0.07), delay * 1000);
    };
    this.game = new Game();
    this.world = new World(engine, this.env, this.audio, this.game);
    this.interior = new Interior(this);
    this.cam = new CameraControl(canvas, engine);
    this.perf = new Perf((tier, extra) => this.applyQuality(tier, extra));
    this.ui = new UI(this);
    this.cine = new Cinematic(this);
    this.cam.onTap = (x, y) => this.started && this.ui.onTap(x, y);
    this.cam.onPaint = (x, y, ph) => this.ui.onPaint(x, y, ph);

    // load or start a world
    let hasSave = false;
    try {
      const raw = await platform.loadSave();
      if (raw) {
        this.game.load(raw);
        hasSave = true;
      }
    } catch (e) {
      console.warn('save could not be loaded, starting fresh', e);
    }
    if (!hasSave) this.game.newGame();
    this.offline = hasSave ? this.game.applyOffline((Date.now() - (this.game.s.saved || Date.now())) / 1000) : null;

    this._wire();
    const S = this.game.s.settings;
    platform.setHaptics(S.haptics);
    this.engine.shakeScale = S.shake === false ? 0 : 1;
    this.audio.setVolume(S.volume);
    this.audio.setSfxVolume(S.sfx);
    this.perf.mode = S.quality;
    if (S.quality !== 'auto') this.perf.tier = S.quality;
    this.fit();
    this.applyQuality(this.perf.tier, 0, true);
    this.world.load();
    this.resetCamera();
    this.env.hour = TITLE_HOUR;
    this.env.setWeather('clear', true);
    document.getElementById('fps').classList.toggle('hidden', !S.fps);
    window.addEventListener('resize', () => this.fit());
    platform.onLifecycle({ pause: () => this.pause(), resume: () => this.resume(), back: () => this.back() });
    this.last = performance.now();
    this.lastFrame = this.last;
    requestAnimationFrame((t) => this.loop(t));
    this.ui.ready(hasSave);
    // hide the static splash (after its studio card and logo had time to show)
    // studio card -> fades away on the dark splash -> the splash opens onto the title (never overlapping)
    const wait = Math.max(0, SPLASH_MIN_MS - (performance.now() - SPLASH_T0));
    const splash = document.getElementById('splash');
    setTimeout(() => splash?.classList.add('studio-out'), wait);
    setTimeout(() => {
      splash?.classList.add('out');
      document.body.classList.remove('splashing');
      setTimeout(() => splash?.remove(), 700);
      let fresh = false;
      try {
        fresh = sessionStorage.getItem('pd-newgame') === '1';
        sessionStorage.removeItem('pd-newgame');
      } catch {}
      if (fresh) this.begin();
    }, wait + 450);
    // billing first, so a player who bought Remove Ads never sees a banner flash in
    initBilling().finally(() => initAds());
    onBillingChange(() => this.ui.onBillingChange?.());
  }

  // ---------------------------------------------------------------- display

  fit() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const art = this.game.s?.settings.pixel ?? 1;
    // art pixels on the short side follow the quality tier (400 on Low/Medium, 540 on High)
    const base = (Math.min(w, h) * dpr) / (TIERS[this.perf?.tier]?.art || 400);
    const ps = Math.max(1, Math.round(base * art)) + extraPixelSize(this.perf?.extraPixel || 0);
    const W = Math.max(ps, Math.round((w * dpr) / ps) * ps), H = Math.max(ps, Math.round((h * dpr) / ps) * ps);
    const e = this.engine;
    if (e.look.pixelSize !== ps) {
      e.look.pixelSize = ps;
      e.applyLook();
    }
    if (e.out.w !== W || e.out.h !== H) e.setOutput(W, H);
    const aspect = w / h;
    e.view.size = aspect < 1 ? 11.5 / Math.sqrt(aspect) : 12.5;
  }

  applyQuality(tier, extra = 0, initial = false) {
    const T = TIERS[tier];
    this.env.setShadowSize(T.shadow);
    this.engine.shadowEvery = T.shadowEvery;
    const look = this.engine.look;
    look.bloom = T.bloom;
    look.outline = T.outline;
    look.highlight = (this.perf?.extraPixel || 0) >= 1 ? 0 : 0.3;
    // the miniature focus follows the player's setting on top of the tier
    look.tilt = this.game.s?.settings.tilt === false ? 0 : T.tilt;
    look.haze = T.haze;
    look.split = T.split;
    look.aa = T.aa;
    this.world.setQuality({ grass: T.grass, mirror: T.mirror, lights: T.lights, smoke: T.smoke, ambient: T.ambient });
    if (this.engine.low) this.engine.applyLook();
    if (!initial) this.fit();
  }

  resetCamera() {
    const I = this.game.I;
    const [x, z] = tileCenter(I.plaza.i, I.plaza.j);
    this.cam.set({ az: 45, el: 32, zoom: 1, target: new THREE.Vector3(x + 0.5, 0.6, z + 1.5) });
  }

  centerTile() {
    const c = this.canvas;
    return this.world.pickTile(c.clientWidth / 2, c.clientHeight / 2) || [this.game.I.plaza.i, this.game.I.plaza.j + 3];
  }

  // ---------------------------------------------------------------- game events -> world / UI

  _wire() {
    const g = this.game, w = this.world, ui = this.ui;
    g.on('building:add', (rec) => {
      w.addBuilding(rec);
      this.saveSoon();
    });
    g.on('building:remove', (rec) => {
      w.removeBuilding(rec);
      this.saveSoon();
    });
    g.on('building:update', (rec) => {
      w.refreshBuilding(rec);
      this.saveSoon();
    });
    g.on('building:built', (rec) => {
      const c = w.buildingCenter(rec);
      ui.toast(`${BUILDINGS[rec.type].name} is complete!`, { icon: 'check' });
      if (c) this._burstAt(c);
      platform.buzz('light');
    });
    g.on('terrain', () => (this._terrainDirty = true));
    g.on('nodes', () => w.rebuildNodes());
    g.on('npc:add', (p) => w.addNpc(p));
    g.on('npc:remove', (p) => w.removeNpc(p));
    g.on('gather', ({ k, got }) => {
      if (Object.keys(got).length) ui.popup(w.nodeWorldPos(k).add(new THREE.Vector3(0, 0.9, 0)), got);
    });
    g.on('produce', ({ b, res, n }) => {
      const c = w.buildingCenter(b);
      if (!c) return;
      const s = w.project(c);
      if (s.x < 0 || s.y < 0 || s.x > this.canvas.clientWidth || s.y > this.canvas.clientHeight) return;
      ui.popup(c.clone().add(new THREE.Vector3(0, 1.1, 0)), { [res]: n });
      if (res === 'coins' && Math.random() < 0.3) this.audio.play('coin');
    });
    g.on('full', (k) => {
      if (performance.now() - this._fullT < 6000) return;
      this._fullT = performance.now();
      ui.toast(`Storage is full for ${RES[k].name}. Build a Warehouse or sell at the Market.`, { kind: 'warn', icon: 'storage', ms: 3500 });
    });
    g.on('levelup', (d) => {
      this.audio.play('levelup');
      platform.buzz('heavy');
      ui.queueModal(() =>
        ui.modal(
          `<div class="burst"></div><div class="bigstar">${d.level}</div><h2>Level Up!</h2><p>You are now a level ${d.level} Mayor.</p>${ui.rewardHTML(d.reward)}
          ${d.unlocked.length ? `<h3>New buildings</h3><div class="names">${d.unlocked.map((n) => `<span class="pill on">${n}</span>`).join('')}</div>` : ''}
          ${d.recipes.length ? `<h3>New recipes</h3><div class="names">${d.recipes.map((n) => `<span class="pill on">${n}</span>`).join('')}</div>` : ''}
          ${d.islands.length ? `<h3>Islands available</h3><div class="names">${d.islands.map((n) => `<span class="pill on">${n}</span>`).join('')}</div>` : ''}
          <button class="btn primary big" data-act="modal-ok">Continue</button>`,
          { cls: 'celebrate' },
        ),
      );
      this.saveSoon();
    });
    g.on('achievement', (a) => {
      this.audio.play('quest');
      ui.toast(`Achievement: ${a.name}!`, { icon: 'trophy', ms: 3500 });
      this.saveSoon();
    });
    g.on('event:start', (ev) => this._eventStart(ev));
    g.on('event:end', (ev) => this._eventEnd(ev));
    g.on('event:collect', (d) => this._eventCollect(d));
    g.on('event:gift', ({ p, got }) => {
      this.audio.play('levelup');
      this.audio.play('chord', { notes: [67, 72, 76, 79], dur: 2.5, gain: 0.04 });
      const rt = w.npcRuntime(p.id);
      if (rt) this._burstAt(rt.pos);
      ui.queueModal(() => ui.modal(`<div class="burst"></div>${evIcon('home')}<h2>Welcome home, ${escH(p.name)}!</h2><p>"A housewarming gift for me? You are the best Mayor ever!" ${escH(p.name)} is now a very close friend.</p>${ui.rewardHTML(got)}<button class="btn primary big" data-act="modal-ok">Hooray!</button>`, { cls: 'celebrate' }));
      this.saveSoon();
    });
    g.on('event:cure', ({ p, byMayor, left }) => {
      if (byMayor) this.audio.play('sparkle');
      ui.toast(`${p.name} ${byMayor ? 'feels much better, thank you!' : 'got over the cold.'}${left ? ` ${left} still sick.` : ''}`, { icon: 'heart', ms: 3000 });
    });
    g.on('fog:reveal', (keys) => w.onReveal(keys));
    g.on('discover', ({ got, chest }) => {
      this.audio.play('sparkle');
      if (chest) ui.toast('You found an old treasure chest in the new land!', { icon: 'chest', ms: 3000 });
      else if (got) {
        ui.popup(w.mayor.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), got);
        ui.toast('New land explored!', { icon: 'map', ms: 1600 });
      }
    });
    g.on('wild:spawn', ({ kind }) => {
      this.audio.play('coyote', { pitch: kind === 'boar' ? 0.6 : 1 });
      if (!this._wildWarned) {
        this._wildWarned = true;
        ui.toast(`A ${kind === 'boar' ? 'wild boar' : 'wolf'} is heading for your farms! Tap it to chase it away.`, { icon: 'bug', ms: 4200, kind: 'warn' });
      }
    });
    g.on('wild:raid', ({ kind, take }) => {
      const now = performance.now();
      if (now - (this._raidToast || 0) > 8000) {
        this._raidToast = now;
        ui.toast(`A ${kind === 'boar' ? 'boar' : 'wolf'} is eating your food! -${take} Food`, { icon: 'food', ms: 2400, kind: 'warn' });
      }
    });
    g.on('wild:chased', ({ got, byMayor, pos }) => {
      this.audio.play('coin');
      ui.popup(pos.clone().add(new THREE.Vector3(0, 0.6, 0)), got);
      if (byMayor) platform.buzz('medium');
    });
    g.on('story:chapter', (e) => ui.showChapter(e));
    g.on('story:finale', (F) => ui.showFinale(F));
    g.on('event:host', ({ host, got, text }) => {
      if (host.k === 'bard') this.audio.play('sparkle');
      else this.audio.play('horn', { pitch: 1.3, dur: 1.4 });
      ui.popup(w.mayor.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), got);
      ui.toast(text, { icon: host.k === 'bard' ? 'chat' : 'crown', ms: 5000 });
      this.saveSoon();
    });
    g.on('weather', (name) => this.env.setWeather(name));
    g.on('toast', (t) => ui.toast(t.text, { kind: t.kind, icon: t.icon }));
    g.on('crafted', ({ recipe, got }) => {
      this.audio.play('pop');
      ui.toast(`${recipe.name} is ready`, { icon: RES[Object.keys(recipe.out)[0]].icon, ms: 1600 });
    });
    g.on('newday', (d) => {
      ui.titleCard(`Day ${d}`, `${g.seasonDef().name} · day ${g.seasonDay()} of the season`, 'sunrise');
      this.audio.play('chord', { notes: [62, 66, 69, 74], dur: 2.4, gain: 0.035 });
      this.save();
    });
    // ---- v1.3 systems
    g.on('relief', ({ got, needFarm }) => {
      this.audio.play('sparkle');
      ui.popup(w.mayor.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), got);
      ui.toast(`Neighbours sent supplies to help out!${needFarm ? ' Build a Farm so it never runs out.' : ''}`, { icon: 'gift', ms: 5000 });
      this.saveSoon();
    });
    g.on('project', ({ P, stage, done }) => {
      this.audio.play('chord', { notes: [60, 64, 67, 72], dur: 2.5, gain: 0.05 });
      ui.titleCard(P.name, done ? 'Project complete! Every island benefits.' : `Stage ${stage} of ${P.stages.length} finished`, P.icon);
      this.save();
    });
    g.on('voyage:start', ({ to }) => {
      ui.toast(`The merchant ship sets sail for ${BIOMES[to].short}.`, { icon: 'compass', ms: 3000 });
      this.saveSoon();
    });
    g.on('voyage:back', ({ got }) => {
      this.audio.play('coin');
      ui.popup(w.mayor.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), got);
      this.save();
    });
    g.on('skill', ({ p, stars }) => {
      if (stars >= 2) ui.toast(`${p.name} got better at the job: ${'★'.repeat(stars)}`, { icon: 'work', ms: 2600 });
    });
    // ---- v1.2 systems
    g.on('fire:start', ({ rec }) => {
      this.audio.play('bell', { pitch: 1.4 });
      this.audio.play('bell', { pitch: 1.4, delay: 0.35 });
      this.audio.play('horn', { pitch: 0.9, dur: 1.2, delay: 0.2 });
      platform.buzz('heavy');
      this.engine.shake(0.03);
      ui.toast(`Fire at the ${BUILDINGS[rec.type].name}! Tap it to put it out.`, { kind: 'warn', icon: 'fire', ms: 4500 });
      this.saveSoon();
    });
    g.on('fire:out', ({ rec, by, got }) => {
      if (!rec) return;
      const c = w.buildingCenter(rec);
      if (by === 'mayor') {
        this.audio.play('sparkle');
        this.audio.play('quest');
        platform.buzz('medium');
        if (c && got) ui.popup(c.clone().add(new THREE.Vector3(0, 1.2, 0)), got);
        ui.toast(`You saved the ${BUILDINGS[rec.type].name}! The villagers cheer.`, { icon: 'heart', ms: 3200 });
        for (const rt of w.npcs.values()) if (rt.visible && c && rt.pos.distanceTo(c) < 4) w.emote(rt, 'heart', 2.5);
      } else ui.toast(`The fire crew saved the ${BUILDINGS[rec.type].name}.`, { icon: 'fire', ms: 3000 });
      this.saveSoon();
    });
    g.on('fire:ruin', ({ rec }) => {
      this.audio.play('crumble');
      this.audio.play('boom', { gain: 0.5 });
      this.engine.shake(0.07);
      platform.buzz('heavy');
      const c = w.buildingCenter(rec);
      if (c) w.bursts.emit(c.clone().add(new THREE.Vector3(0, 0.4, 0)), { n: 40, color: '#4a4550', speed: 1.4, up: 1.6, life: 1.4, gravity: -0.2 });
      ui.toast(`The ${BUILDINGS[rec.type].name} burned down. Tap it to rebuild it.`, { kind: 'warn', icon: 'fire', ms: 5000 });
      this.saveSoon();
    });
    g.on('research:done', (t) => {
      this.audio.play('levelup');
      this.audio.play('chord', { notes: [60, 64, 67, 72, 76], dur: 3, gain: 0.05 });
      platform.buzz('medium');
      ui.queueModal(() => ui.modal(`<div class="burst"></div>${ui.iconHTML('research', 'xl')}<h2>Research Complete!</h2><p><b>${escH(t.name)}</b></p><p class="muted">${escH(t.desc)}</p><button class="btn primary big" data-act="modal-ok">Excellent</button>`, { cls: 'celebrate' }));
      this.save();
    });
    g.on('order:done', () => {
      w.sailShips();
      this.saveSoon();
    });
    g.on('stars', ({ id, stars, got }) => {
      this.audio.play('levelup');
      this.audio.play('sparkle');
      platform.buzz('heavy');
      ui.queueModal(() => ui.modal(`<div class="burst"></div><div class="bigstars">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= stars ? 'on' : ''}" style="--d:${n * 0.12}s"></i>`).join('')}</div><h2>${stars}-Star Island!</h2><p>${escH(BIOMES[id].name)} earned a new rating. Every star adds 3% to production here.</p>${ui.rewardHTML(got)}<button class="btn primary big" data-act="modal-ok">Wonderful</button>`, { cls: 'celebrate' }));
      this.saveSoon();
    });
    g.on('season', (S) => {
      this.audio.play('chord', { notes: [60, 64, 67, 71, 74], dur: 3, gain: 0.05 });
      this.audio.play('sparkle');
      const eff = Object.entries(S.prod || {}).map(([k, v]) => `<span class="pill ${v >= 1 ? 'on' : ''}">${k === 'coin' ? 'Coins' : RES[k]?.name || k} ${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%</span>`).join('');
      ui.queueModal(() => ui.modal(`<div class="burst"></div>${ui.iconHTML(S.icon, 'xl')}<h2>${escH(S.name)} has come</h2><p>${escH(S.desc)}</p><div class="names">${eff}</div><button class="btn primary big" data-act="modal-ok">Lovely</button>`, { cls: 'celebrate' }));
      this.saveSoon();
    });
    g.on('island:switch', ({ id, summary }) => {
      this.world.load();
      this.resetCamera();
      this.env.setWeather(g.weatherName(), true);
      ui.refreshHUD(true);
      ui.titleCard(BIOMES[id].name, BIOMES[id].desc, 'map');
      if (summary && Object.keys(summary).length) ui.queueModal(() => ui.modal(`<h2>While you were away...</h2><p>The villagers of ${BIOMES[id].short} kept working.</p>${ui.rewardHTML(summary)}<button class="btn primary big" data-act="modal-ok">Nice!</button>`));
      this.save();
    });
    g.on('mayor:reach', (t) => {
      if (t.kind === 'chest') {
        const r = g.openChest();
        if (!r) return;
        this.audio.play('sparkle');
        this.audio.play('coin');
        this._burstAt(w.chest.position);
        ui.queueModal(() => ui.modal(`<div class="burst"></div><h2>Treasure Chest!</h2>${ui.rewardHTML(r)}<button class="btn primary big" data-act="modal-ok">Collect</button>`, { cls: 'celebrate' }));
      } else if (t.kind === 'cat') {
        const r = g.rescueCat();
        if (!r) return;
        this.audio.play('meow');
        ui.queueModal(() => ui.modal(`<div class="burst"></div><h2>Cat found!</h2><p>Its owner is so grateful, and the whole village is happier.</p>${ui.rewardHTML(r)}<button class="btn primary big" data-act="modal-ok">Meow!</button>`, { cls: 'celebrate' }));
      } else if (t.kind === 'visitor') {
        const r = g.talkVisitor();
        this.audio.play('talk', { pitch: 0.7 });
        if (!r) return ui.toast('"Safe travels, Mayor."', { icon: 'chat' });
        ui.queueModal(() => ui.modal(`<h2>Mysterious Traveler</h2><p>"Your island is lovely. Please accept this small gift from my travels."</p>${ui.rewardHTML(r)}<button class="btn primary big" data-act="modal-ok">Thank you</button>`));
      }
      this.saveSoon();
    });
  }

  _burstAt(pos) {
    this.world.bursts.emit(pos.clone().add(new THREE.Vector3(0, 0.5, 0)), { n: 24, color: '#ffe08a', speed: 1.3, up: 2, life: 1, glow: 2.5 });
  }

  // ---------------------------------------------------------------- random events: announcement, pickups, summary

  _eventStart(ev) {
    const def = ev.def, ui = this.ui;
    const bad = def.kind === 'bad';
    if (bad) this.audio.play('horn', { pitch: 0.75, dur: 1.6 });
    else if (def.kind === 'visit') {
      this.audio.play('bell', { pitch: 0.9 });
      this.audio.play('chord', { notes: [62, 66, 69, 74], dur: 2.2, gain: 0.04, delay: 0.3 });
    } else {
      this.audio.play('sparkle');
      this.audio.play('chord', { notes: [60, 64, 67, 72], dur: 2.5, gain: 0.05 });
    }
    if (ev.id === 'royal') this.audio.play('horn', { pitch: 1.4, dur: 1.2, delay: 0.6 });
    platform.buzz('light');
    const effects = (def.effect || [def.desc]).map((e) => `<span class="pill ${bad ? '' : 'on'}">${escH(e)}</span>`).join('');
    const hours = Math.round(def.hours);
    ui.queueModal(() => {
      // skip the announcement if the event is already over by the time the queue gets here
      if (this.game.s.event?.id !== ev.id) return ui._nextModal();
      ui.modal(
        `${bad ? '' : '<div class="burst"></div>'}${evIcon(def.icon)}<h2>${escH(def.name)}</h2><p>${escH(def.flavor || def.desc)}</p>
        <div class="names">${effects}</div>${def.tip ? `<p class="muted">${icon('info')} ${escH(def.tip)}</p>` : ''}
        <p class="muted">${icon('event')} Lasts about ${hours} hour${hours === 1 ? '' : 's'}</p>
        <button class="btn primary big" data-act="modal-ok">${bad ? 'We can handle it' : "Let's go!"}</button>`,
        { cls: bad ? '' : 'celebrate' },
      );
    });
    this.saveSoon();
  }

  _eventEnd(ev) {
    const def = ev.def, S = ev.summary || {}, ui = this.ui;
    if (!def || ev.reason === 'replaced') return;
    if (S.big && S.reward) {
      this.audio.play('quest');
      ui.queueModal(() => ui.modal(`<div class="burst"></div>${evIcon(def.icon)}<h2>${escH(S.title || def.name)}</h2><p>${escH(S.text)}</p>${ui.rewardHTML(S.reward)}<button class="btn primary big" data-act="modal-ok">Collect</button>`, { cls: 'celebrate' }));
    } else {
      const extra = Object.entries(S.extra || {}).slice(0, 3).map(([k, v]) => `+${fmt(v)} ${k === 'coins' ? 'Coins' : RES[k]?.name || k}`).join(', ');
      ui.toast(`${def.name} has ended.${S.text ? ' ' + S.text : ''}${extra ? ' Event bonus: ' + extra + '.' : ''}`, { icon: def.icon || 'event', ms: 4500 });
    }
    this.saveSoon();
  }

  _eventCollect({ def, prop, got, text, left }) {
    const ui = this.ui, A = this.audio;
    const [x, z] = tileCenter(prop.i, prop.j);
    const pos = new THREE.Vector3(x, this.world.tileH(prop.i, prop.j) + 0.9, z);
    ui.popup(pos, got);
    const sfx = { star: ['sparkle', 'coin'], gold: ['coin', 'sparkle'], dog: ['talk', 'quest'], kid: ['talk', 'pop'], chest: ['sparkle', 'coin'], dig: ['harvest', 'coin'], bees: ['whoosh', 'pop'], wisp: ['spark', 'sparkle'] }[prop.k] || ['pop'];
    for (const s of sfx) A.play(s, s === 'talk' ? { pitch: 1.8 } : s === 'whoosh' ? { dur: 0.8 } : {});
    platform.buzz('light');
    if (prop.k === 'dig' || prop.k === 'gold' || prop.k === 'dog') {
      const title = { dig: 'Buried Treasure!', gold: 'Pot of Gold!', dog: 'Puppy Found!' }[prop.k];
      ui.queueModal(() => ui.modal(`<div class="burst"></div>${evIcon(def.icon)}<h2>${title}</h2><p>${escH(text)}</p>${ui.rewardHTML(got)}<button class="btn primary big" data-act="modal-ok">Collect</button>`, { cls: 'celebrate' }));
    } else ui.toast(`${text}${left ? ` ${left} left.` : ''}`, { icon: def.icon || 'event', ms: 2600 });
    this.saveSoon();
  }

  // ---------------------------------------------------------------- start, travel, settings

  async unlockAudio() {
    if (this.game.s.settings.sound && !this.audio.on) {
      try {
        await this.audio.start();
      } catch (e) {
        console.warn('audio blocked', e);
      }
    }
  }

  /** Play / Continue on the title: a brand-new story starts with the intro film. */
  begin() {
    if (this.started || this.cine.active) return;
    if (!this.game.s.story?.intro) this.playIntro(true);
    else this.start();
  }

  /** The intro film; from the menu it returns to the title, the first time it leads into the game. */
  async playIntro(thenStart = false) {
    if (this.cine.active) return;
    await this.unlockAudio();
    this.cine.play(() => {
      this.game.s.story.intro = 1;
      if (thenStart) this.start();
      else this.resetCamera();
    });
  }

  /** Rewarded ad on the Welcome back card: the offline earnings are paid a second time. */
  async offlineDouble() {
    const off = this.offline;
    if (!off || this._offX2) return;
    if (!(await this.rewardedAd())) return;
    this._offX2 = true;
    const got = this.game.give(off.got);
    this.ui.closeModal();
    this.ui.popup(this.world.mayor.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), got);
    this.audio.play('coin');
    this.save();
  }

  /** Settings > Remove Ads: Google Play purchase flow. */
  async buyRemoveAds() {
    const r = await buyRemoveAds();
    if (r === 'owned') {
      this.audio.play('quest');
      this.ui.toast('Thank you! Ads are removed for good.', { icon: 'check', ms: 3000 });
    } else if (r === 'pending') {
      this.ui.toast('Your payment is pending. Ads will be removed as soon as Google Play confirms it.', { icon: 'info', ms: 4200 });
    } else if (r === 'error') {
      this.ui.toast('The purchase could not be completed. Please try again later.', { kind: 'warn' });
    }
  }

  /** Settings > Restore purchases. */
  async restorePurchases() {
    const ok = await restorePurchases();
    this.ui.toast(ok ? 'Purchase restored: ads are removed.' : 'No Remove Ads purchase was found for this Google account.', { icon: ok ? 'check' : 'info', ms: 3200 });
  }

  adPrivacy() {
    showAdPrivacy().then((ok) => !ok && this.ui.toast('Ad privacy options are not needed in your region.', { icon: 'info' }));
  }

  /** Opt-in rewarded ad; resolves true when the reward was earned. */
  async rewardedAd() {
    this.audio.setVolume(0);
    const ok = await showRewarded();
    this.audio.setVolume(this.game.s.settings.volume);
    if (!ok) this.ui.toast('The ad did not finish, so there is no reward this time.', { kind: 'warn' });
    return ok;
  }

  async start() {
    if (this.started) return;
    this.started = true;
    showBanner();
    setTimeout(() => this.game.checkStory(), 1200);
    await this.unlockAudio();
    this.audio.play('quest');
    this.ui.hideTitle();
    this.resetCamera();
    this.ui.refreshHUD(true);
    const off = this.offline;
    if (off && Object.keys(off.got).length) {
      const h = Math.floor(off.seconds / 3600), m = Math.floor((off.seconds % 3600) / 60);
      this.ui.queueModal(() => this.ui.modal(`<h2>Welcome back!</h2><p>You were away for ${h ? h + ' h ' : ''}${m} min. Your villagers kept working:</p>${this.ui.rewardHTML(off.got)}<div class="row"><button class="btn" data-act="modal-ok">Collect</button><button class="btn buy" data-act="offline-x2">${icon('xp')} Watch ad: x2</button></div>`));
    }
    // a brand-new player meets the story first; the Rewards button still glows for the daily gift
    if (this.game.dailyStatus().available && this.game.s.story.ch > 0) this.ui.queueModal(() => this.ui.openDaily());
    this.ui._nextModal();
  }

  async travel(id) {
    await maybeInterstitial();
    const fade = document.getElementById('fade') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'fade' });
    fade.innerHTML = '';
    fade.classList.add('on');
    this.audio.play('whoosh', { dur: 1.4, gain: 0.6 });
    setTimeout(() => {
      if (this.interior.active) {
        this.interior.exit(true);
        this.ui.onLeaveHouse();
      }
      this.ui.exitMode();
      this.game.switchIsland(id);
      setTimeout(() => fade.classList.remove('on'), 120);
    }, 450);
  }

  applySettings(key) {
    const S = this.game.s.settings;
    switch (key) {
      case 'sound':
        if (S.sound) this.unlockAudio();
        else this.audio.stop();
        break;
      case 'volume':
        this.audio.setVolume(S.volume);
        break;
      case 'sfx':
        this.audio.setSfxVolume(S.sfx);
        break;
      case 'quality':
        this.perf.setMode(S.quality);
        break;
      case 'pixel':
        this.fit();
        break;
      case 'haptics':
        platform.setHaptics(S.haptics);
        break;
      case 'shake':
        this.engine.shakeScale = S.shake === false ? 0 : 1;
        if (S.shake !== false) this.engine.shake(0.08);
        break;
      case 'tilt':
        this.applyQuality(this.perf.tier, this.perf.extraPixel);
        break;
      case 'fps':
        document.getElementById('fps').classList.toggle('hidden', !S.fps);
        break;
    }
    this.saveSoon();
  }

  // ---------------------------------------------------------------- saving & lifecycle

  save() {
    if (!this.game.s || this.wiping) return;
    platform.writeSave(this.game.serialize());
    this._saveT = 0;
  }
  saveSoon() {
    this._saveT = Math.max(this._saveT, 20 - 2);
  }

  async wipe() {
    this.wiping = true;
    await platform.wipeSave();
    location.reload();
  }

  pause() {
    if (this.paused || this.wiping) return;
    this.paused = true;
    this.hiddenAt = Date.now();
    this.save();
    this.audio.suspend();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.last = performance.now();
    this.lastFrame = this.last;
    this.audio.resume();
    refreshPurchases();
    const away = (Date.now() - (this.hiddenAt || Date.now())) / 1000;
    const off = this.game.applyOffline(away);
    if (off && Object.keys(off.got).length && this.started) {
      const m = Math.round(off.seconds / 60);
      this.ui.queueModal(() => this.ui.modal(`<h2>Welcome back!</h2><p>In ${m} min, your villagers produced:</p>${this.ui.rewardHTML(off.got)}<button class="btn primary big" data-act="modal-ok">Collect</button>`));
    }
  }

  back() {
    const ui = this.ui;
    if (ui._modalOpen) return ui.closeModal();
    if (ui.sheetOpen) return ui.closeSheet();
    if (ui.mode !== 'explore') return ui.exitMode();
    ui.confirm('Quit the game?', 'Your progress is saved automatically.', 'Quit', () => {
      this.save();
      setTimeout(() => platform.exitApp(), 250);
    });
  }

  // ---------------------------------------------------------------- houses

  enterHouse(rec) {
    this._fade(() => {
      this.interior.enter(rec);
      this.ui.onEnterHouse(rec);
    });
  }
  leaveHouse() {
    if (!this.interior.active) return;
    this._fade(() => {
      this.interior.exit();
      this.ui.onLeaveHouse();
    });
  }
  /** Fade to black, run fn while it is dark, fade back in. */
  _fade(fn, hold = 120, text = '') {
    const fade = document.getElementById('fade') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'fade' });
    fade.innerHTML = text ? `<div class="fade-text">${text}</div>` : '';
    fade.classList.add('on');
    setTimeout(() => {
      try {
        fn();
      } finally {
        setTimeout(() => fade.classList.remove('on'), hold);
      }
    }, 420);
  }

  /** The Mayor goes to bed and the night passes. */
  sleepNight() {
    const g = this.game, ui = this.ui;
    if (!g.canSleep()) return ui.toast('You can only go to bed at night (from 20:00).', { icon: 'sleep', kind: 'warn' });
    this.interior.mayorToBed();
    this.audio.play('chord', { notes: [57, 60, 64], dur: 2.2, gain: 0.04 });
    setTimeout(() => {
      this._fade(() => {
        const before = { coins: g.s.player.coins, ...g.s.res };
        const hours = g.sleepUntilMorning();
        this.env.setHour(g.s.time.hour);
        for (const rt of this.world.npcs.values()) rt.think = Math.random() * 0.5;
        this.interior.mayorWake();
        const got = {};
        for (const k of Object.keys(before)) {
          const now = k === 'coins' ? g.s.player.coins : g.s.res[k];
          if (now - before[k] > 0) got[k] = now - before[k];
        }
        this.save();
        setTimeout(() => {
          this.audio.play('quest');
          ui.queueModal(() => ui.modal(`<div class="burst"></div>${ui.iconHTML('sunrise', 'xl')}<h2>Good morning!</h2><p>You slept ${Math.round(hours)} hours. Well rested: <b>+1</b> to every swing for 4 hours.</p>${Object.keys(got).length ? `<h3>While you slept</h3>${ui.rewardHTML(got)}` : ''}<button class="btn primary big" data-act="modal-ok">Rise and shine</button>`, { cls: 'celebrate' }));
        }, 900);
      }, 1400, '<b>Z z z</b><small>Good night...</small>');
    }, 1300);
  }

  // ---------------------------------------------------------------- loop

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const delta = now - this.last;
    this.last = now;
    if (this.paused) return;
    if (!this.perf.shouldRender(delta)) return;
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.perf.sample(dt * 1000, now);
    try {
      this.step(dt);
      this.engine.render(this.interior.active ? this.interior.scene : this.world.scene, this.env);
    } catch (e) {
      console.error(e);
      if (!this._errShown) {
        this._errShown = true;
        this.ui.toast('Something went wrong, but the game is still running.', { kind: 'warn' });
      }
    }
  }

  step(dt) {
    const g = this.game, S = g.s.settings;
    const dtH = this.started ? (dt * S.speed) / SECONDS_PER_GAME_HOUR : dt / (SECONDS_PER_GAME_HOUR * 4);
    g.tick(dtH, this.world.presence);
    this.env.tween = null;
    // the title screen always shows the island on a clear morning; the real clock and weather
    // take over once play starts (weather blends in, the hour cuts under the title fade)
    this.env.hour = this.cine.active ? this.cine.hour : this.photo?.hour ?? (this.started ? g.s.time.hour : TITLE_HOUR);
    const wn = this.cine.active ? this.cine.weather : this.started ? g.weatherName() : 'clear';
    if (this.env.weather !== wn) this.env.setWeather(wn);
    if (this.world.scene) this.env.center.set(0, 0, 0);
    this.env.update(dt);
    if (this.interior.active) this.interior.applyEnv(this.env, shared);
    this.world.suspendSeason = this.interior.active;
    if (this._terrainDirty) {
      this._terrainDirty = false;
      this.world.refreshTerrain();
    }
    this.world.update(dt, dtH);
    this.interior.update(dt);
    g.update(dt);
    if (this.cine.active) this.cine.update(dt);
    else if (!this.started) this.cam.goal.az += dt * 4;
    if (this.photo?.orbit) this.cam.goal.az += dt * 7;
    this.cam.update(dt);
    this.audio.update(dt, this.env);
    this.ui.update(dt);
    if (this.started) {
      this._saveT += dt;
      if (this._saveT > 20) this.save();
      this._tutT += dt;
      if (this._tutT > 1) {
        this._tutT = 0;
        this.ui.tutorial();
        this.game.checkStory();
      }
    }
  }
}

const app = new App();
window.__pd = app; // handy for debugging in a desktop browser
app.init().catch((e) => console.error(e));
