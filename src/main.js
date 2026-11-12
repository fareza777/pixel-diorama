// Pixel Diorama: World Builder - app bootstrap: engine, world, input, UI, game loop, saving,
// lifecycle and adaptive quality.
import './styles.css';
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

const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// big icon on top of an announcement (sits above the spinning .burst background)
const evIcon = (name) => `<div style="position:relative;margin:0 auto 0.2em">${icon(name || 'event', 'xl')}</div>`;

const VERSION = '1.0.0';
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
    this.env.onThunder = (delay, power) => this.audio.thunder(delay, power);
    this.game = new Game();
    this.world = new World(engine, this.env, this.audio, this.game);
    this.interior = new Interior(this);
    this.cam = new CameraControl(canvas, engine);
    this.perf = new Perf((tier, extra) => this.applyQuality(tier, extra));
    this.ui = new UI(this);
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
    // hide the static splash
    document.getElementById('splash')?.classList.add('out');
    setTimeout(() => document.getElementById('splash')?.remove(), 700);
  }

  // ---------------------------------------------------------------- display

  fit() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const art = this.game.s?.settings.pixel ?? 1;
    // around 400 art pixels on the short side looks crisp and reads well on a phone
    const base = (Math.min(w, h) * dpr) / 400;
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
    this.world.setQuality({ grass: T.grass, mirror: T.mirror, lights: T.lights, smoke: T.smoke });
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
      ui.queueModal(() => ui.modal(`<div class="burst"></div>${evIcon('cake')}<h2>Happy Birthday, ${escH(p.name)}!</h2><p>"A present for me? You are the best Mayor ever!" ${escH(p.name)} is now a very close friend.</p>${ui.rewardHTML(got)}<button class="btn primary big" data-act="modal-ok">Hooray!</button>`, { cls: 'celebrate' }));
      this.saveSoon();
    });
    g.on('event:cure', ({ p, byMayor, left }) => {
      if (byMayor) this.audio.play('sparkle');
      ui.toast(`${p.name} ${byMayor ? 'feels much better, thank you!' : 'got over the cold.'}${left ? ` ${left} still sick.` : ''}`, { icon: 'heart', ms: 3000 });
    });
    g.on('event:host', ({ host, got, text }) => {
      if (host.k === 'bard') this.audio.play('chord', { notes: [60, 64, 67, 72, 76], dur: 3, gain: 0.05 });
      else this.audio.play('horn', { pitch: 1.3, dur: 1.4 });
      ui.popup(w.mayor.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), got);
      ui.toast(text, { icon: host.k === 'bard' ? 'music' : 'crown', ms: 5000 });
      this.saveSoon();
    });
    g.on('weather', (name) => this.env.setWeather(name));
    g.on('toast', (t) => ui.toast(t.text, { kind: t.kind, icon: t.icon }));
    g.on('crafted', ({ recipe, got }) => {
      this.audio.play('pop');
      ui.toast(`${recipe.name} is ready`, { icon: RES[Object.keys(recipe.out)[0]].icon, ms: 1600 });
    });
    g.on('newday', (d) => {
      ui.toast(`Day ${d} begins`, { icon: 'sun' });
      this.save();
    });
    g.on('island:switch', ({ id, summary }) => {
      this.world.load();
      this.resetCamera();
      this.env.setWeather(g.weatherName(), true);
      ui.refreshHUD(true);
      ui.toast(`Welcome to ${BIOMES[id].name}`, { icon: 'map', ms: 3000 });
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
        this.audio.setLoop('lofi', this.game.s.settings.music ? 0.75 : 0);
      } catch (e) {
        console.warn('audio blocked', e);
      }
    }
  }

  async start() {
    if (this.started) return;
    this.started = true;
    await this.unlockAudio();
    this.audio.play('quest');
    this.ui.hideTitle();
    this.resetCamera();
    this.ui.refreshHUD(true);
    const off = this.offline;
    if (off && Object.keys(off.got).length) {
      const h = Math.floor(off.seconds / 3600), m = Math.floor((off.seconds % 3600) / 60);
      this.ui.queueModal(() => this.ui.modal(`<h2>Welcome back!</h2><p>You were away for ${h ? h + ' h ' : ''}${m} min. Your villagers kept working:</p>${this.ui.rewardHTML(off.got)}<button class="btn primary big" data-act="modal-ok">Kumpulkan</button>`));
    }
    if (this.game.dailyStatus().available) this.ui.queueModal(() => this.ui.openDaily());
    this.ui._nextModal();
  }

  travel(id) {
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
      case 'music':
        this.audio.setLoop('lofi', S.music ? 0.75 : 0);
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
      case 'fps':
        document.getElementById('fps').classList.toggle('hidden', !S.fps);
        break;
    }
    this.saveSoon();
  }

  // ---------------------------------------------------------------- saving & lifecycle

  save() {
    if (!this.game.s) return;
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
    const away = (Date.now() - (this.hiddenAt || Date.now())) / 1000;
    const off = this.game.applyOffline(away);
    if (off && Object.keys(off.got).length && this.started) {
      const m = Math.round(off.seconds / 60);
      this.ui.queueModal(() => this.ui.modal(`<h2>Welcome back!</h2><p>In ${m} min, your villagers produced:</p>${this.ui.rewardHTML(off.got)}<button class="btn primary big" data-act="modal-ok">Kumpulkan</button>`));
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
    this.env.hour = this.started ? g.s.time.hour : TITLE_HOUR;
    const wn = this.started ? g.weatherName() : 'clear';
    if (this.env.weather !== wn) this.env.setWeather(wn);
    if (this.world.scene) this.env.center.set(0, 0, 0);
    this.env.update(dt);
    if (this.interior.active) this.interior.applyEnv(this.env, shared);
    if (this._terrainDirty) {
      this._terrainDirty = false;
      this.world.refreshTerrain();
    }
    this.world.update(dt, dtH);
    this.interior.update(dt);
    g.update(dt);
    if (!this.started) this.cam.goal.az += dt * 4;
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
      }
    }
  }
}

const app = new App();
window.__pd = app; // handy for debugging in a desktop browser
app.init().catch((e) => console.error(e));
