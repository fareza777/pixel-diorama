// Game state and rules: resources, economy, buildings, population, crafting, market, progression,
// quests, achievements, random events, daily rewards and offline progress. No rendering here.
import {
  RES, RES_KEYS, BIOMES, BIOME_KEYS, BUILDINGS, MAX_LEVEL, upgradeCost, RECIPES, TOOL_TIERS, NODES, FIRST_NAMES, TRAITS,
  QUESTS, ACHIEVEMENTS, EVENTS, EVENT_BY_ID, LEGACY_NAMES, xpForLevel, MAX_PLAYER_LEVEL, DAILY_REWARDS, START, PAINTS,
  SEASONS, SEASON_DAYS, WALKABLE_TYPES,
} from './data.js';
import { N, idx, inside, generateIsland, packIsland, unpackIsland, WALKABLE, ROADS, STEP } from './island.js';
import { randomLook } from './people.js';
import { rng } from '../engine/kit.js';
import { FURNITURE, WALLPAPERS, FLOORS, homeStats, defaultFurniture, ENTERABLE } from './furniture.js';
import { SystemsMixin } from './systems.js';
import { FrontierMixin } from './frontier.js';
import { StoryMixin } from './story.js';

export const SAVE_VERSION = 1;
export const SECONDS_PER_GAME_HOUR = 30; // a full day takes 12 real minutes at 1x
const OFFLINE_CAP_S = 8 * 3600;
const OFFLINE_EFF = 0.4;
const WALKABLE_BUILDINGS = new Set(WALKABLE_TYPES);
// buildings that turn raw goods into crafted ones (count for the Industrialist achievement)
const CHAIN_TYPES = new Set(['penggergajian', 'tungku', 'kaca']);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const NO_FX = Object.freeze({});
const NIGHT_SALE = (h) => h >= 18 || h < 5;
const todayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function footprint(rec) {
  const s = BUILDINGS[rec.type].size;
  const out = [];
  for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) out.push([rec.i + a, rec.j + b]);
  return out;
}

export class Game {
  constructor() {
    this.s = null;
    this.handlers = {};
    this.occ = null; // tile -> building id for the current island
    this.happyMap = null;
    this.rand = Math.random;
    this._achTimer = 0;
  }

  on(type, fn) {
    (this.handlers[type] ||= []).push(fn);
  }
  emit(type, data) {
    for (const fn of this.handlers[type] || []) fn(data);
    for (const fn of this.handlers['*'] || []) fn(type, data);
  }

  // ---------------------------------------------------------------- lifecycle

  newGame() {
    const seed = Math.floor(Math.random() * 1e6) + 1;
    this.s = {
      v: SAVE_VERSION,
      created: Date.now(),
      saved: Date.now(),
      seed,
      player: { name: 'Mayor', level: 1, xp: 0, coins: START.coins, tool: 0 },
      res: Object.fromEntries(RES_KEYS.map((k) => [k, START.res[k] || 0])),
      stats: { built: 0, gathered: 0, crafted: 0, sold: 0, talked: 0, gifts: 0, quests: 0, events: 0, chests: 0, cats: 0, landmarks: 0, days: 0, essence: 0, upgrades: 0, seasons: 0, chained: 0, learned: 0 },
      quests: { done: [], base: {} },
      ach: {},
      daily: { last: '', streak: 0 },
      market: Object.fromEntries(RES_KEYS.map((k) => [k, 1])),
      craft: { queue: [] },
      islands: {},
      current: 'desa',
      time: { hour: 7.5, day: 1 },
      event: null,
      eventCd: 6,
      weather: {},
      settings: { sound: true, volume: 0.7, sfx: 0.9, quality: 'auto', pixel: 1, fps: false, speed: 1, haptics: true, shake: true, tilt: false, gfx13: true, voice: true },
      tips: 0,
      tutorial: 0,
      furn: {}, // furniture in storage: id -> count
      finishes: { wall: [0], floor: [0] }, // wallpapers and floors the player owns
    };
    this.s.islands.desa = generateIsland('desa', seed);
    const I = this.s.islands.desa;
    // two founding villagers
    for (let k = 0; k < 2; k++) this.spawnNpc(I, true);
    this.refreshIsland();
    this.refreshQuests();
    this.initSystems();
    this.initFrontier();
    this.initStory();
  }

  serialize() {
    this.s.saved = Date.now();
    const out = { ...this.s, islands: {} };
    for (const [k, I] of Object.entries(this.s.islands)) out.islands[k] = packIsland(I);
    return JSON.stringify(out);
  }

  load(json) {
    const d = typeof json === 'string' ? JSON.parse(json) : json;
    if (!d || !d.v || !d.islands) throw new Error('invalid save');
    // fill in anything newer versions added
    const base = (() => {
      const g = new Game();
      g.newGame();
      return g.s;
    })();
    d.player = { ...base.player, ...d.player };
    d.res = { ...Object.fromEntries(RES_KEYS.map((k) => [k, 0])), ...d.res };
    d.stats = { ...base.stats, ...d.stats };
    // v1.3 sharper look: the miniature blur starts off once for older saves (players can turn it back on)
    const preGfx13 = !d.settings?.gfx13;
    d.settings = { ...base.settings, ...d.settings, ...(preGfx13 ? { tilt: false, gfx13: true } : {}) };
    d.market = { ...base.market, ...d.market };
    d.quests = d.quests || base.quests;
    d.craft = d.craft || base.craft;
    d.weather = d.weather || {};
    d.daily = d.daily || base.daily;
    d.ach = d.ach || {};
    d.furn = d.furn || {};
    d.finishes = d.finishes || { wall: [0], floor: [0] };
    // events: drop ones this version does not know, fill fields older saves lack
    if (d.event && (!EVENT_BY_ID[d.event.id] || !d.islands[d.event.island])) d.event = null;
    if (d.event) {
      d.event.start ??= d.event.until - EVENT_BY_ID[d.event.id].hours;
      d.event.gain ||= {};
      d.event.got ||= {};
    }
    d.eventCd = d.eventCd ?? 0;
    for (const k of Object.keys(d.islands)) d.islands[k] = unpackIsland(d.islands[k]);
    // v1.3: villagers from older saves get the matching global name
    for (const I of Object.values(d.islands)) for (const p of I.npcs || []) {
      const i = LEGACY_NAMES.indexOf(p.name);
      if (i >= 0) p.name = FIRST_NAMES[i];
    }
    if (!d.islands[d.current]) d.current = 'desa';
    this.s = d;
    this.initSystems();
    this.initFrontier();
    this.initStory();
    this.refreshIsland();
    this.refreshQuests();
  }

  get I() {
    return this.s.islands[this.s.current];
  }
  get biome() {
    return this.s.current;
  }
  absHour() {
    return this.s.time.day * 24 + this.s.time.hour;
  }

  // ---------------------------------------------------------------- per-island caches

  refreshIsland() {
    const I = this.I;
    this.occ = new Int32Array(N * N);
    for (const b of I.buildings) for (const [i, j] of footprint(b)) if (inside(i, j)) this.occ[idx(i, j)] = b.id;
    this.computeHappyMap();
    this.assignHomes(I);
    this.assignJobs(I);
  }

  computeHappyMap() {
    const I = this.I;
    const H = new Float32Array(N * N);
    for (const b of I.buildings) {
      const def = BUILDINGS[b.type];
      if (!def.happy || !b.built || b.ruin) continue;
      const amt = def.happy.amount * (1 + 0.25 * ((b.level || 1) - 1));
      const r = def.happy.radius + (def.size - 1) * 0.5;
      const ci = b.i + (def.size - 1) / 2, cj = b.j + (def.size - 1) / 2;
      for (let i = Math.floor(ci - r); i <= Math.ceil(ci + r); i++)
        for (let j = Math.floor(cj - r); j <= Math.ceil(cj + r); j++) {
          if (!inside(i, j)) continue;
          const d = Math.hypot(i - ci, j - cj);
          if (d <= r) H[idx(i, j)] += amt * (1 - (d / (r + 1)) * 0.5);
        }
    }
    // trees and water nearby make a nicer neighbourhood
    for (const k of Object.keys(I.nodes)) {
      const n = I.nodes[k];
      if (n.hp === 0 || !['tree', 'pine', 'palm', 'mushroom', 'crystal'].includes(n.k)) continue;
      const i = Math.floor(k / N), j = k % N;
      for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) if (inside(i + a, j + c)) H[idx(i + a, j + c)] += 0.8;
    }
    this.happyMap = H;
  }

  buildingById(id, I = this.I) {
    return I.buildings.find((b) => b.id === id);
  }

  housingOf(b) {
    const def = BUILDINGS[b.type];
    if (!def.housing || !b.built || b.ruin) return 0;
    return def.housing + (def.housingPerLevel || 0) * ((b.level || 1) - 1);
  }
  jobsOf(b) {
    const def = BUILDINGS[b.type];
    if (!def.jobs || !b.built || b.ruin) return 0;
    return def.jobs + ((b.level || 1) - 1);
  }
  housingCap(I = this.I) {
    return I.buildings.reduce((a, b) => a + this.housingOf(b), 0);
  }
  jobsCap(I = this.I) {
    return I.buildings.reduce((a, b) => a + this.jobsOf(b), 0);
  }
  population() {
    return Object.values(this.s.islands).reduce((a, I) => a + I.npcs.length, 0);
  }
  storageCap() {
    let cap = START.baseStorage;
    for (const I of Object.values(this.s.islands))
      for (const b of I.buildings) {
        const def = BUILDINGS[b.type];
        if (def.storage && b.built && !b.ruin) cap += def.storage + (def.storagePerLevel || 0) * ((b.level || 1) - 1);
      }
    return Math.round(cap * (1 + (this.techFx().storage || 0)));
  }

  assignHomes(I) {
    const cap = new Map();
    for (const b of I.buildings) if (this.housingOf(b) > 0) cap.set(b.id, this.housingOf(b));
    const used = new Map();
    for (const p of I.npcs) {
      if (p.home && cap.has(p.home) && (used.get(p.home) || 0) < cap.get(p.home)) used.set(p.home, (used.get(p.home) || 0) + 1);
      else p.home = 0;
    }
    for (const p of I.npcs) {
      if (p.home) continue;
      for (const [id, c] of cap)
        if ((used.get(id) || 0) < c) {
          p.home = id;
          used.set(id, (used.get(id) || 0) + 1);
          break;
        }
    }
  }

  assignJobs(I) {
    const slots = new Map();
    for (const b of I.buildings) if (this.jobsOf(b) > 0) slots.set(b.id, this.jobsOf(b));
    const used = new Map();
    for (const p of I.npcs) {
      if (p.job && slots.has(p.job) && (used.get(p.job) || 0) < slots.get(p.job)) used.set(p.job, (used.get(p.job) || 0) + 1);
      else p.job = 0;
    }
    // food first when stocks run low, then the rest in build order
    const lowFood = this.s.res.food < Math.max(20, I.npcs.length * 3);
    const order = [...slots.keys()].sort((a, b) => {
      const pa = this._jobPriority(this.buildingById(a, I), lowFood), pb = this._jobPriority(this.buildingById(b, I), lowFood);
      return pb - pa || a - b;
    });
    for (const p of I.npcs) {
      if (p.job) continue;
      for (const id of order)
        if ((used.get(id) || 0) < slots.get(id)) {
          p.job = id;
          used.set(id, (used.get(id) || 0) + 1);
          break;
        }
    }
    // move workers from buildings that produce nothing to open productive slots
    for (const id of order) {
      const b = this.buildingById(id, I);
      if (this._jobPriority(b, lowFood) < 4) continue;
      while ((used.get(id) || 0) < slots.get(id)) {
        const donor = I.npcs.find((p) => p.job && this._jobPriority(this.buildingById(p.job, I), lowFood) <= 1);
        if (!donor) break;
        used.set(donor.job, used.get(donor.job) - 1);
        donor.job = id;
        used.set(id, (used.get(id) || 0) + 1);
      }
    }
  }
  _jobPriority(b, lowFood) {
    const def = BUILDINGS[b.type];
    if (def.produce?.food) return lowFood ? 10 : 5;
    if (def.consume || def.produce?.xp) return 2;
    if (def.produce?.coins) return 3;
    if (def.produce) return 4;
    return 1;
  }

  // ---------------------------------------------------------------- resources

  has(cost) {
    for (const [k, v] of Object.entries(cost || {})) {
      if (k === 'coins') {
        if (this.s.player.coins < v) return false;
      } else if ((this.s.res[k] || 0) < v) return false;
    }
    return true;
  }
  missing(cost) {
    const out = [];
    for (const [k, v] of Object.entries(cost || {})) {
      const have = k === 'coins' ? this.s.player.coins : this.s.res[k] || 0;
      if (have < v) out.push(`${k === 'coins' ? 'Coins' : RES[k]?.name || k} ${v - have}`);
    }
    return out;
  }
  pay(cost) {
    if (!this.has(cost)) return false;
    for (const [k, v] of Object.entries(cost || {})) {
      if (k === 'coins') this.s.player.coins -= v;
      else this.s.res[k] -= v;
    }
    this.emit('res');
    return true;
  }
  /** Give coins, xp and resources (resources respect storage). Returns what was actually added. */
  give(items, { silent = false } = {}) {
    const cap = this.storageCap();
    const got = {};
    for (const [k, v] of Object.entries(items || {})) {
      if (!v) continue;
      if (k === 'coins') {
        this.s.player.coins += Math.round(v);
        got.coins = Math.round(v);
      } else if (k === 'xp') this.addXp(v);
      else if (RES[k]) {
        const room = Math.max(0, cap - this.s.res[k]);
        const add = Math.min(room, Math.round(v));
        this.s.res[k] += add;
        if (add > 0) got[k] = add;
        else if (!silent) this.emit('full', k);
      }
    }
    this.emit('res');
    return got;
  }

  addXp(n) {
    const P = this.s.player;
    P.xp += Math.round(n);
    while (P.level < MAX_PLAYER_LEVEL && P.xp >= xpForLevel(P.level)) {
      P.xp -= xpForLevel(P.level);
      P.level++;
      const reward = { coins: 50 * P.level };
      this.give(reward, { silent: true });
      const unlocked = Object.entries(BUILDINGS).filter(([, d]) => d.unlock === P.level).map(([, d]) => d.name);
      const islands = Object.entries(BIOMES).filter(([, b]) => b.unlock === P.level).map(([, b]) => b.name);
      const recipes = RECIPES.filter((r) => r.unlock === P.level).map((r) => r.name);
      this.emit('levelup', { level: P.level, reward, unlocked, islands, recipes });
    }
    if (P.level >= MAX_PLAYER_LEVEL) P.xp = Math.min(P.xp, xpForLevel(P.level));
    this.emit('xp');
  }

  // ---------------------------------------------------------------- building

  isUnlocked(type) {
    const def = BUILDINGS[type];
    return this.s.player.level >= def.unlock;
  }
  biomeAllows(type, biome = this.biome) {
    const def = BUILDINGS[type];
    if (def.fixed) return false;
    if (def.biomes && !def.biomes.includes(biome)) return false;
    if (def.notBiomes && def.notBiomes.includes(biome)) return false;
    return true;
  }
  countType(type, I = null) {
    const list = I ? [I] : Object.values(this.s.islands);
    return list.reduce((a, isl) => a + isl.buildings.filter((b) => b.type === type).length, 0);
  }

  canPlace(type, i, j, I = this.I) {
    const def = BUILDINGS[type];
    if (!def) return { ok: false, reason: 'Unknown building' };
    if (!this.isUnlocked(type)) return { ok: false, reason: `Unlocks at level ${def.unlock}` };
    if (!this.biomeAllows(type)) return { ok: false, reason: "Can't be built on this island" };
    if (def.limit && this.countType(type, I) >= def.limit) return { ok: false, reason: 'Only one per island' };
    const s = def.size;
    let hMax = -99, hMin = 99;
    for (let a = 0; a < s; a++)
      for (let b = 0; b < s; b++) {
        const ii = i + a, jj = j + b;
        if (!inside(ii, jj)) return { ok: false, reason: 'Outside the island' };
        const k = idx(ii, jj);
        if (I.t[k] === 'w') return { ok: false, reason: "Can't build on water" };
        if (this.occ[k]) return { ok: false, reason: 'This spot is taken' };
        if (I.npcBlock?.has?.(k)) return { ok: false, reason: 'Something is in the way' };
        hMax = Math.max(hMax, I.h[k]);
        hMin = Math.min(hMin, I.h[k]);
      }
    if (hMax - hMin > 0.75) return { ok: false, reason: 'Ground is too steep' };
    if (def.needWater && !this.nearWater(i, j, s, I)) return { ok: false, reason: 'Must be next to water' };
    if (!this.has(def.cost)) return { ok: false, reason: 'Need: ' + this.missing(def.cost).join(', '), cost: true };
    return { ok: true };
  }

  nearWater(i, j, s = 1, I = this.I) {
    for (let a = -1; a <= s; a++)
      for (let b = -1; b <= s; b++) {
        const ii = i + a, jj = j + b;
        if (inside(ii, jj) && I.t[idx(ii, jj)] === 'w') return true;
      }
    return false;
  }

  /** Rotation that faces the nearest water (fishing docks) */
  waterRot(i, j, I = this.I, s = 1) {
    // rot 0 faces +z, 1 faces +x (pier along local +z); bigger docks face the side with the most water
    let best = 0, bestN = 0;
    for (let r = 0; r < 4; r++) {
      let n = 0;
      for (let a = 0; a < s; a++) {
        const [ii, jj] = [[i + a, j + s], [i + s, j + a], [i + a, j - 1], [i - 1, j + a]][r];
        if (inside(ii, jj) && I.t[idx(ii, jj)] === 'w') n++;
      }
      if (n > bestN) {
        best = r;
        bestN = n;
      }
    }
    return best;
  }

  place(type, i, j, rot = 0) {
    const I = this.I;
    const chk = this.canPlace(type, i, j);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    const def = BUILDINGS[type];
    this.pay(def.cost);
    // level the footprint and clear nature (gathering what was there)
    let h = 0;
    for (let a = 0; a < def.size; a++) for (let b = 0; b < def.size; b++) h = Math.max(h, I.h[idx(i + a, j + b)]);
    const gained = {};
    for (let a = 0; a < def.size; a++)
      for (let b = 0; b < def.size; b++) {
        const k = idx(i + a, j + b);
        I.h[k] = h;
        const n = I.nodes[k];
        if (n && n.hp !== 0) {
          const nd = NODES[n.k];
          gained[nd.res] = (gained[nd.res] || 0) + 2;
        }
        delete I.nodes[k];
        if (ROADS.has(I.t[k]) && this.biome !== 'kota') I.t[k] = this.defaultGround();
      }
    const rec = { id: I.nextId++, type, i, j, rot: def.needWater ? this.waterRot(i, j, I, def.size) : rot, level: 1, paint: 0, built: 0, progress: 0 };
    I.buildings.push(rec);
    for (const [ii, jj] of footprint(rec)) this.occ[idx(ii, jj)] = rec.id;
    this.give(gained, { silent: true });
    // Building Boom: the builders hand back part of the materials
    const refund = this.evFx().refund;
    if (refund) {
      const back = {};
      for (const [k, v] of Object.entries(def.cost)) if (k !== 'coins' && v * refund >= 1) back[k] = Math.floor(v * refund);
      const got = this.give(back, { silent: true });
      if (Object.keys(got).length) this.emit('toast', { text: `Builders refunded ${Object.entries(got).map(([k, v]) => `${v} ${RES[k].name}`).join(', ')}`, icon: 'build' });
    }
    this.s.stats.built++;
    if (def.landmark) this.s.stats.landmarks++;
    this.addXp(5 + Math.round((def.cost.coins || 0) / 10));
    this.emit('building:add', rec);
    this.emit('terrain');
    return { ok: true, rec };
  }

  defaultGround() {
    return { gurun: 's', fantasi: 'm', gunung: 'n', kota: 'v' }[this.biome] || 'g';
  }

  finishConstruction(rec) {
    rec.built = 1;
    rec.progress = 1;
    this.computeHappyMap();
    this.assignHomes(this.I);
    this.assignJobs(this.I);
    this.emit('building:built', rec);
  }

  upgrade(rec) {
    const def = BUILDINGS[rec.type];
    if (rec.level >= MAX_LEVEL || def.fixed || def.small) return { ok: false, reason: 'Already at max level' };
    const cost = upgradeCost(def, rec.level);
    if (!this.pay(cost)) return { ok: false, reason: 'Need: ' + this.missing(cost).join(', ') };
    rec.level++;
    this.s.stats.upgrades++;
    this.addXp(15 * rec.level);
    this.computeHappyMap();
    this.assignHomes(this.I);
    this.assignJobs(this.I);
    this.emit('building:update', rec);
    return { ok: true };
  }

  repaint(rec) {
    const avail = PAINTS.map((p, i) => i).filter((i) => !PAINTS[i].unlock || this.s.ach[PAINTS[i].unlock]);
    const cur = avail.indexOf(rec.paint || 0);
    rec.paint = avail[(cur + 1) % avail.length];
    this.emit('building:update', rec);
    return PAINTS[rec.paint];
  }

  rotate(rec) {
    rec.rot = ((rec.rot || 0) + 1) % 4;
    this.emit('building:update', rec);
  }

  demolish(rec) {
    const def = BUILDINGS[rec.type];
    if (def.fixed) return { ok: false, reason: "Can't be demolished" };
    const I = this.I;
    if (I.fires?.length) I.fires = I.fires.filter((f) => f.bid !== rec.id);
    I.buildings = I.buildings.filter((b) => b !== rec);
    for (const [i, j] of footprint(rec)) this.occ[idx(i, j)] = 0;
    const refund = {};
    for (const [k, v] of Object.entries(def.cost)) refund[k] = Math.floor(v * 0.5);
    this.give(refund, { silent: true });
    if (def.landmark) this.s.stats.landmarks = Math.max(0, this.s.stats.landmarks - 1);
    this.computeHappyMap();
    this.assignHomes(I);
    this.assignJobs(I);
    this.emit('building:remove', rec);
    return { ok: true, refund };
  }

  // roads: 2 stone per tile, removing gives nothing back
  paintRoad(i, j, on) {
    const I = this.I;
    if (!inside(i, j)) return false;
    const k = idx(i, j);
    if (I.t[k] === 'w' || this.occ[k]) return false;
    const road = this.biome === 'kota' ? 'a' : 'p';
    if (on) {
      if (ROADS.has(I.t[k])) return false;
      if (!this.pay({ stone: 1 })) {
        this.emit('toast', { text: 'Each road tile costs 1 stone', kind: 'warn' });
        return false;
      }
      I.t[k] = road;
      if (I.nodes[k]) {
        const nd = NODES[I.nodes[k].k];
        if (I.nodes[k].hp !== 0) this.give({ [nd.res]: 1 }, { silent: true });
        delete I.nodes[k];
        this.emit('nodes');
      }
    } else {
      if (!ROADS.has(I.t[k])) return false;
      I.t[k] = this.defaultGround();
    }
    this.emit('terrain');
    return true;
  }

  // ---------------------------------------------------------------- nature

  nodeAt(k) {
    const n = this.I.nodes[k];
    return n && n.hp !== 0 ? n : null;
  }

  /** One swing of the mayor's tool. Returns { got, depleted } */
  gather(k) {
    const I = this.I;
    const n = I.nodes[k];
    if (!n || n.hp === 0) return null;
    const def = NODES[n.k];
    if (n.hp < 0) n.hp = def.hp;
    let y = TOOL_TIERS[this.s.player.tool].yield;
    if (this.isRested()) y += 1;
    y += (this.evFx().gatherBonus || 0) + (this.techFx().gather || 0);
    const items = { [def.res]: y };
    if (def.bonus && this.rand() < 0.35) Object.assign(items, def.bonus);
    if (this.rand() < 0.04) items.coins = 5 + Math.floor(this.rand() * 15);
    const got = this.give(items);
    n.hp--;
    this.s.stats.gathered++;
    this.addXp(2);
    let depleted = false;
    if (n.hp <= 0) {
      n.hp = 0;
      n.re = this.absHour() + def.regrow * (1 - (this.techFx().regrow || 0));
      depleted = true;
      this.computeHappyMap();
    }
    this.emit('gather', { k, got, depleted, kind: n.k });
    return { got, depleted };
  }

  regrowNodes() {
    const now = this.absHour();
    let changed = false;
    for (const I of Object.values(this.s.islands))
      for (const n of Object.values(I.nodes))
        if (n.hp === 0 && now >= n.re) {
          n.hp = -1;
          changed = true;
          n.fresh = I === this.I ? 1 : 0;
        }
    if (changed) {
      this.computeHappyMap();
      this.emit('nodes');
    }
  }

  // ---------------------------------------------------------------- people

  spawnNpc(I, founder = false) {
    const rand = Math.random;
    const used = new Set(I.npcs.map((p) => p.name));
    let name = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)];
    for (let t = 0; t < 10 && used.has(name); t++) name = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)];
    const trait = TRAITS[Math.floor(rand() * TRAITS.length)].id;
    const p = {
      id: I.nextId++, name, look: randomLook(rand), home: 0, job: 0, trait,
      need: { food: 70 + rand() * 20, energy: 70 + rand() * 20, fun: 50 + rand() * 30 }, mood: 60, friend: founder ? 20 : 0,
      offs: (rand() - 0.5) * 1.5, born: this.s ? this.absHour() : 0, homeless: 0, req: null,
    };
    I.npcs.push(p);
    if (this.s && I === this.I) {
      this.assignHomes(I);
      this.assignJobs(I);
    }
    return p;
  }

  removeNpc(I, p) {
    I.npcs = I.npcs.filter((q) => q !== p);
    this.emit('npc:remove', p);
  }

  traitOf(p) {
    return TRAITS.find((t) => t.id === p.trait) || TRAITS[0];
  }

  /** Needs and mood. ctx: { sleeping, eating, leisure, working, festival, talking } */
  npcTick(p, ctx, dtH) {
    const tr = this.traitOf(p);
    const N2 = p.need;
    const fx = this.evFx();
    const evNow = this.eventHere();
    const sick = !!evNow?.sick?.includes(p.id);
    N2.food = clamp(N2.food - dtH * 4.2 * (tr.hunger || 1) * (fx.hunger || 1), 0, 100);
    if (ctx.sleeping) N2.energy = clamp(N2.energy + dtH * 13 * (fx.sleep || 1) * (sick ? 0.6 : 1), 0, 100);
    else N2.energy = clamp(N2.energy - dtH * (ctx.working ? 4 : 2.5) * (fx.energy || 1) * (sick ? 1.8 : 1), 0, 100);
    if (ctx.working && p.job) this.trainNpc(p, dtH);
    if (ctx.leisure) N2.fun = clamp(N2.fun + dtH * (ctx.festival ? 30 : 14 * (fx.fun || 1)) * (tr.social || 1), 0, 100);
    else if (!ctx.sleeping) N2.fun = clamp(N2.fun - dtH * 2.2, 0, 100);
    const home = p.home ? this.buildingById(p.home) : null;
    let env = 10;
    if (home) {
      const k = idx(home.i, home.j);
      env = 42 + 8 * ((home.level || 1) - 1) + Math.min(40, this.happyMap ? this.happyMap[k] : 0);
      // a cosy, well furnished home lifts the mood; not enough beds does the opposite
      const hs = this.homeStatsOf(home);
      env += Math.min(18, hs.comfort * 0.45);
      if (hs.sleeps < this.residentsOf(home)) env -= 8;
    }
    const job = p.job ? 8 : this.I.npcs.length < 3 ? 4 : -6;
    let ev = (fx.mood || 0) + (this.seasonDef().mood || 0) + (this.techFx().mood || 0);
    if (home?.fire) ev -= 14;
    if (evNow) {
      if (sick) ev -= 8;
      if (fx.burnWood && evNow.warm !== undefined) ev += evNow.warm ? 5 : -8;
      if (evNow.npc === p.id) ev += 10;
    }
    const target = clamp(0.28 * N2.food + 0.14 * N2.energy + 0.22 * N2.fun + 0.36 * env + job + ev, 0, 100);
    p.mood += (target - p.mood) * (1 - Math.exp(-dtH * 0.45 * (tr.mood || 1)));
    p.mood = clamp(p.mood, 0, 100);
    if (!home) p.homeless = (p.homeless || 0) + dtH;
    else p.homeless = 0;
  }

  // ---------------------------------------------------------------- homes, furniture, sleep

  residentsOf(rec, I = this.I) {
    return I.npcs.reduce((a, p) => a + (p.home === rec.id ? 1 : 0), 0);
  }

  /** Comfort, beds etc. of a home (a never-visited home counts with its starter furniture). */
  homeStatsOf(rec) {
    this._hs ||= new WeakMap();
    let s = this._hs.get(rec);
    if (!s) {
      const furni = rec.furni || (ENTERABLE.has(rec.type) ? defaultFurniture(rec, rec.type === 'balai' ? 1 : this.housingOf(rec)) : []);
      s = homeStats(furni);
      this._hs.set(rec, s);
    }
    return s;
  }
  markFurni(rec) {
    this._hs?.delete(rec);
    this.emit('furni', rec);
  }

  furniUnlocked(id) {
    return (FURNITURE[id]?.unlock || 1) <= this.s.player.level;
  }
  buyFurni(id) {
    const d = FURNITURE[id];
    if (!d) return { ok: false, reason: 'Unknown item' };
    if (!this.furniUnlocked(id)) return { ok: false, reason: `Unlocks at level ${d.unlock}` };
    if (!this.pay(d.cost)) return { ok: false, reason: 'Need: ' + this.missing(d.cost).join(', ') };
    this.s.stats.furniture = (this.s.stats.furniture || 0) + 1;
    this.addXp(2 + Math.round((d.comfort || 0) * 1.5));
    return { ok: true };
  }
  storeFurni(id) {
    this.s.furn[id] = (this.s.furn[id] || 0) + 1;
  }
  takeFurni(id) {
    if (!this.s.furn[id]) return false;
    if (--this.s.furn[id] <= 0) delete this.s.furn[id];
    return true;
  }
  /** Selling gives half the coins back (materials are gone). */
  sellFurni(id) {
    const coins = Math.floor((FURNITURE[id]?.cost?.coins || 0) * 0.5);
    this.give({ coins }, { silent: true });
    return coins;
  }

  /** Wallpaper / floor: buy once, then switch freely. kind: 'wall' | 'floor' */
  setFinish(rec, kind, i) {
    const list = kind === 'wall' ? WALLPAPERS : FLOORS;
    const def = list[i];
    if (!def) return { ok: false };
    const owned = this.s.finishes[kind];
    if (!owned.includes(i)) {
      if (!this.pay(def.cost)) return { ok: false, reason: 'Need: ' + this.missing(def.cost).join(', ') };
      owned.push(i);
      this.addXp(5);
    }
    rec[kind] = i;
    this.markFurni(rec);
    return { ok: true };
  }

  /** The Mayor's rest buff after a night in bed: +1 per swing while gathering. */
  isRested() {
    return (this.s.player.rested || 0) > this.absHour();
  }
  canSleep() {
    const h = this.s.time.hour;
    return h >= 20 || h < 5;
  }
  /**
   * Sleep through the night: the clock runs on to 06:30 in quarter-hour steps (hourly rules,
   * production, the new day all happen as usual) while every villager sleeps. Returns hours slept.
   */
  sleepUntilMorning(wake = 6.5) {
    const T = this.s.time;
    let hours = (wake - T.hour + 24) % 24;
    if (hours > 12) hours = 0;
    const slept = hours;
    const quiet = new Map();
    while (hours > 0.001) {
      const step = Math.min(0.25, hours);
      this.tick(step, quiet);
      for (const p of this.I.npcs) this.npcTick(p, { sleeping: true }, step);
      hours -= step;
    }
    this.s.player.rested = this.absHour() + 4;
    this.s.stats.nights = (this.s.stats.nights || 0) + 1;
    return slept;
  }

  /** NPC eats one meal from the shared stores. */
  eat(p) {
    if (this.s.res.food <= 0) return false;
    this.s.res.food -= 1;
    p.need.food = clamp(p.need.food + 48, 0, 100);
    this.emit('res');
    return true;
  }

  islandHappiness(I = this.I) {
    if (!I.npcs.length) return 60;
    return I.npcs.reduce((a, p) => a + p.mood, 0) / I.npcs.length;
  }

  talk(p) {
    const now = this.absHour();
    const fresh = !p.lastTalk || now - p.lastTalk > 6;
    p.lastTalk = now;
    if (fresh) {
      p.friend = clamp((p.friend || 0) + 6, 0, 100);
      p.need.fun = clamp(p.need.fun + 12, 0, 100);
      this.s.stats.talked++;
      this.addXp(3);
    }
    return fresh;
  }

  giftNpc(p) {
    if (!this.pay({ food: 5 })) return { ok: false, reason: 'Need 5 food' };
    p.friend = clamp((p.friend || 0) + 12, 0, 100);
    p.need.food = clamp(p.need.food + 30, 0, 100);
    p.mood = clamp(p.mood + 8, 0, 100);
    this.s.stats.gifts++;
    this.addXp(5);
    this._eventGift(p);
    return { ok: true };
  }

  fulfilRequest(p) {
    const r = p.req;
    if (!r) return { ok: false };
    if (!this.pay({ [r.res]: r.n })) return { ok: false, reason: `Need ${r.n} ${RES[r.res].name}` };
    p.req = null;
    p.friend = clamp((p.friend || 0) + 15, 0, 100);
    p.mood = clamp(p.mood + 12, 0, 100);
    this.give(r.reward);
    return { ok: true, reward: r.reward };
  }

  // ---------------------------------------------------------------- simulation tick (game hours)

  /**
   * Advance the world clock and run hourly rules for the active island.
   * presence: Map buildingId -> workers on site (from the NPC simulation)
   */
  // ---------------------------------------------------------------- seasons

  /** Season index 0..3 (spring, summer, autumn, winter) for a day number. */
  seasonIndex(day = this.s.time.day) {
    return Math.floor((Math.max(1, day) - 1) / SEASON_DAYS) % SEASONS.length;
  }
  season() {
    return SEASONS[this.seasonIndex()].id;
  }
  seasonDef() {
    return SEASONS[this.seasonIndex()];
  }
  /** Day within the season (1..SEASON_DAYS). */
  seasonDay() {
    return ((Math.max(1, this.s.time.day) - 1) % SEASON_DAYS) + 1;
  }
  /**
   * Season weights for the visuals: [spring, summer, autumn, winter], blending into the next
   * season over the last half day of each one.
   */
  seasonBlend(out = [0, 0, 0, 0]) {
    const T = this.s.time;
    const d = (Math.max(1, T.day) - 1) + T.hour / 24;
    const pos = d / SEASON_DAYS;
    const i = Math.floor(pos) % 4, f = pos - Math.floor(pos);
    const k = Math.min(1, Math.max(0, (f * SEASON_DAYS - (SEASON_DAYS - 0.5)) / 0.5));
    out.fill(0);
    out[i] += 1 - k;
    out[(i + 1) % 4] += k;
    return out;
  }

  tick(dtH, presence) {
    const T = this.s.time;
    const prevHour = Math.floor(T.hour);
    T.hour += dtH;
    if (T.hour >= 24) {
      T.hour -= 24;
      const before = this.seasonIndex(T.day);
      T.day++;
      this.s.stats.days++;
      if (this.seasonIndex(T.day) !== before) {
        this.s.stats.seasons = (this.s.stats.seasons || 0) + 1;
        this.emit('season', this.seasonDef());
      }
      // a quiet daily bonus: XP for every resident
      this.addXp(Math.max(5, this.population()));
      this.bankInterest();
      this.emit('newday', T.day);
    }
    this.I.lastAbs = this.absHour();
    this.produce(dtH, presence);
    this.fireTick(dtH);
    if (Math.floor(T.hour) !== prevHour) this.hourly();
    // end an event the moment its time runs out (not at the next full hour)
    else if (this.s.event && this.I.lastAbs >= this.s.event.until) this.endEvent('time');
  }

  multipliers(res) {
    return this.eventMult(res) * this.baseMult(res);
  }
  baseMult(res, biome = this.biome) {
    const bonus = BIOMES[biome].bonus || {};
    return (bonus[res] || 1) * (this.seasonDef().prod[res] || 1) * this.techMult(res) * (biome === this.biome ? this.starMult() : 1);
  }
  /** Production multiplier from the running event on this island (res: resource key or 'coin'). */
  eventMult(res) {
    const ev = this.eventHere();
    if (!ev) return 1;
    const fx = this.fxOf(ev);
    let m = 1;
    if (fx.mult) m *= (fx.mult[res] ?? 1) * (fx.mult.all ?? 1);
    if (ev.id === 'bees' && res === 'food') m *= Math.max(0.4, 1 - 0.15 * this.propsLeft(ev));
    if (ev.sick?.length) m *= 1 - 0.4 * Math.min(1, ev.sick.length / Math.max(1, this.I.npcs.length));
    return m;
  }

  nodeBonus(b, kinds) {
    let n = 0;
    const I = this.I;
    for (let a = -3; a <= 3; a++)
      for (let c = -3; c <= 3; c++) {
        const k = idx(b.i + a, b.j + c);
        if (!inside(b.i + a, b.j + c)) continue;
        const nd = I.nodes[k];
        if (nd && nd.hp !== 0 && kinds.includes(nd.k)) n++;
      }
    return 1 + Math.min(0.6, n * 0.06);
  }

  /** Boost from windmills, water towers and the like in range of building b (capped at x1.9). */
  boostOf(b, I = this.I) {
    let m = 1;
    for (const w of I.buildings) {
      const bo = BUILDINGS[w.type].boost;
      if (!bo || !w.built) continue;
      const types = Array.isArray(bo.type) ? bo.type : [bo.type];
      if (!types.includes(b.type)) continue;
      if (Math.hypot(w.i - b.i, w.j - b.j) <= bo.radius) m += bo.amount;
    }
    return Math.min(m, 1.9);
  }
  windmillBoost(b) {
    return this.boostOf(b);
  }
  /** Is building b within range of a built building of type t? */
  inRangeOf(b, t, I = this.I) {
    const r = BUILDINGS[t]?.boost?.radius ?? 5;
    return I.buildings.some((w) => w.type === t && w.built && Math.hypot(w.i - b.i, w.j - b.j) <= r);
  }

  produce(dtH, presence) {
    const I = this.I;
    const mood = this.islandHappiness();
    const moodK = 0.7 + mood / 200;
    const ev = this.eventHere();
    const fx = this.fxOf(ev);
    for (const b of I.buildings) {
      const def = BUILDINGS[b.type];
      if (!b.built || b.ruin) continue;
      if (def.produce && !b.fire) {
        const workers = presence.get(b.id) || 0;
        if (!workers) continue;
        b.acc ||= {};
        const lvl = 1 + 0.5 * ((b.level || 1) - 1);
        let k = workers * lvl * moodK * dtH;
        if (def.nearNode) k *= this.nodeBonus(b, def.nearNode);
        k *= this.boostOf(b) * this.skillMult(b, I);
        // processing buildings use up their inputs from storage; without them they stall
        if (def.consume) {
          const save = 1 - (this.techFx().consume || 0);
          let f = 1;
          for (const [r, rate] of Object.entries(def.consume)) f = Math.min(f, (this.s.res[r] || 0) / Math.max(1e-6, rate * save * k));
          f = Math.max(0, Math.min(1, f));
          b.stalled = f < 0.05;
          if (f <= 0) continue;
          k *= f;
          b.used ||= {};
          for (const [r, rate] of Object.entries(def.consume)) {
            b.used[r] = (b.used[r] || 0) + rate * save * k;
            if (b.used[r] >= 1) {
              const n = Math.min(Math.floor(b.used[r]), this.s.res[r] || 0);
              b.used[r] -= n;
              this.s.res[r] -= n;
            }
          }
        }
        const tm = fx.type?.[b.type] ?? 1;
        for (const [r, rate] of Object.entries(def.produce)) {
          const rk = r === 'coins' ? 'coin' : r;
          const base = rate * k * (r === 'xp' ? 1 : this.baseMult(rk));
          let em = ev ? this.eventMult(rk) * tm : 1;
          // a water tower keeps its fields green through a dry spell
          if (ev?.id === 'drought' && r === 'food' && this.inRangeOf(b, 'menara_air')) em = Math.max(em, 1);
          b.acc[r] = (b.acc[r] || 0) + base * em;
          // what the event added, for the summary when it ends
          if (em > 1) ev.gain[r] = (ev.gain[r] || 0) + base * (em - 1);
          if (b.acc[r] >= 1) {
            const n = Math.floor(b.acc[r]);
            b.acc[r] -= n;
            if (r === 'xp') {
              this.addXp(n);
              this.s.stats.learned = (this.s.stats.learned || 0) + n;
              this.emit('produce', { b, res: 'xp', n });
              continue;
            }
            const got = this.give({ [r]: n }, { silent: true });
            if (got[r]) {
              if (CHAIN_TYPES.has(b.type)) this.s.stats.chained = (this.s.stats.chained || 0) + got[r];
              this.emit('produce', { b, res: r, n: got[r] });
            }
          }
        }
      }
      if (def.housing) {
        const residents = I.npcs.filter((p) => p.home === b.id).length;
        if (residents) {
          const em = this.eventMult('coin') * (fx.tax ?? 1);
          const base = residents * def.tax * 0.3 * moodK * dtH * this.baseMult('coin') * (1 + (this.techFx().tax || 0));
          b.tax = (b.tax || 0) + base * em;
          if (em > 1) ev.gain.coins = (ev.gain.coins || 0) + base * (em - 1);
          if (b.tax >= 6) {
            const n = Math.floor(b.tax);
            b.tax -= n;
            this.give({ coins: n });
            this.emit('produce', { b, res: 'coins', n });
          }
        }
      }
    }
  }

  hourly() {
    const I = this.I;
    const h = this.s.time.hour;
    this.regrowNodes();
    this.reliefHourly();
    // weather changes now and then
    const W = this.s.weather[this.biome];
    const now = this.absHour();
    if (!W || now >= W.until) this.rollWeather();
    // new residents
    const happy = this.islandHappiness();
    const free = this.housingCap() - I.npcs.length;
    if (free > 0 && h >= 7 && h <= 19 && happy >= 35 && this.s.res.food > 0) {
      const chance = (0.3 + happy / 220) * (this.evFx().arrivals || 1) * (1 + (this.techFx().arrivals || 0));
      if (Math.random() < chance) {
        const p = this.spawnNpc(I);
        p.arriving = 1;
        this.addXp(6);
        this.emit('npc:add', p);
        this.emit('toast', { text: `${p.name} moved to ${BIOMES[this.biome].short}!`, icon: 'pop' });
      }
    }
    // unhappy or homeless residents may leave
    for (const p of [...I.npcs]) {
      if ((p.homeless > 16 && I.npcs.length > 2) || (p.mood < 15 && Math.random() < 0.04)) {
        this.removeNpc(I, p);
        this.emit('toast', { text: `${p.name} left the island...`, kind: 'warn', icon: 'sad' });
      }
    }
    // a resident asks for something now and then
    if (I.npcs.length >= 2 && Math.random() < 0.12) {
      const cand = I.npcs.filter((p) => !p.req);
      if (cand.length) {
        const p = cand[Math.floor(Math.random() * cand.length)];
        const pool = ['wood', 'stone', 'food'];
        if (this.s.player.level >= 3) pool.push('plank');
        if (this.s.player.level >= 4) pool.push('brick');
        if (this.s.player.level >= 6) pool.push('glass', 'ore');
        const res = pool[Math.floor(Math.random() * pool.length)];
        const n = Math.max(3, Math.round((10 + Math.random() * 15) * (RES[res].price < 6 ? 1 : 0.4)));
        p.req = { res, n, reward: { coins: Math.round(n * RES[res].price * 2.2), xp: 20 + n }, until: now + 24 };
        this.emit('npc:request', p);
      }
    }
    for (const p of I.npcs) if (p.req && now > p.req.until) p.req = null;
    // market prices drift back
    for (const k of RES_KEYS) this.s.market[k] += (1 - this.s.market[k]) * 0.05;
    this.fireHourly();
    this.checkRatings();
    // events
    this.eventHourly();
    this.updateEvent();
    this.assignJobs(I);
    this.refreshQuests();
  }

  rollWeather() {
    const B = BIOMES[this.biome];
    const ev = this.s.event;
    let name;
    const forced = ev && ev.island === this.biome ? this.fxOf(ev).weather : null;
    if (forced) name = forced;
    else {
      const S = this.seasonDef();
      const table = { ...B.weather };
      if (S.add && !S.noSnow?.includes(this.biome)) for (const [k, v] of Object.entries(S.add)) table[k] = (table[k] || 0) + v;
      for (const k of Object.keys(table)) {
        table[k] *= S.weather?.[k] ?? 1;
        if (k === 'snow' && S.noSnow?.includes(this.biome)) table[k] = 0;
      }
      if (!Object.values(table).some((w) => w > 0)) table.clear = 1;
      const entries = Object.entries(table).filter(([, w]) => w > 0);
      const total = entries.reduce((a, [, w]) => a + w, 0);
      let r = Math.random() * total;
      name = entries[0][0];
      for (const [k, w] of entries) {
        r -= w;
        if (r <= 0) {
          name = k;
          break;
        }
      }
    }
    this.s.weather[this.biome] = { name, until: this.absHour() + 3 + Math.random() * 5 };
    this.emit('weather', name);
  }
  weatherName() {
    return this.s.weather[this.biome]?.name || 'clear';
  }

  // ---------------------------------------------------------------- random events

  /** The running event, if it is on the island being simulated. */
  eventHere() {
    const ev = this.s.event;
    return ev && ev.island === this.biome ? ev : null;
  }
  /** The running event's simulation hooks on this island (an empty object when there are none). */
  evFx() {
    return this.fxOf(this.eventHere());
  }
  /** An event's effects; a hazard met by its counter building (Sea Wall, Windbreak...) uses the mild guardFx. */
  fxOf(ev) {
    const d = ev && EVENT_BY_ID[ev.id];
    if (!d) return NO_FX;
    return (ev.guarded && d.guardFx) || d.fx || NO_FX;
  }
  buildSpeed() {
    return (this.evFx().build || 1) * (1 + (this.techFx().build || 0));
  }
  /** Pose ('clap' | 'wave') when villagers should gather at the plaza at hour h, else null. */
  eventGather(h) {
    const ev = this.eventHere();
    const fx = ev && EVENT_BY_ID[ev.id]?.fx;
    if (!fx?.gather) return null;
    if (fx.gatherFor && this.absHour() - (ev.start ?? 0) > fx.gatherFor) return null;
    return h >= fx.gather[0] && h < fx.gather[1] ? fx.pose || 'clap' : null;
  }
  propsLeft(ev = this.s.event) {
    if (!ev?.props) return 0;
    let n = 0;
    for (const p of ev.props) if (!p.done) n++;
    return n;
  }

  eventEligible(e) {
    const h = this.s.time.hour;
    const night = h < 5.5 || h > 20;
    const I = this.I, w = this.weatherName();
    if (e.minLevel && this.s.player.level < e.minLevel) return false;
    if (e.minPop && I.npcs.length < e.minPop) return false;
    if (e.night !== undefined && e.night !== night) return false;
    if (e.start) {
      const [a, b] = e.start;
      if (a <= b ? h < a || h >= b : h < a && h >= b) return false;
    }
    if (e.biomes && !e.biomes.includes(this.biome)) return false;
    if (e.seasons && !e.seasons.includes(this.season())) return false;
    if (e.notBiomes && e.notBiomes.includes(this.biome)) return false;
    if (e.weatherIn && !e.weatherIn.includes(w)) return false;
    if (e.notWeather && e.notWeather.includes(w)) return false;
    if (e.needs && !I.buildings.some((b) => b.type === e.needs && b.built)) return false;
    return e.id !== this.s.lastEvent; // never the same one twice in a row
  }

  updateEvent() {
    const now = this.absHour();
    const ev = this.s.event;
    if (ev && now >= ev.until) {
      this.endEvent('time');
      return;
    }
    if (ev || now < (this.s.eventCd || 0)) return;
    if (Math.random() > 0.35) return;
    const eligible = EVENTS.filter((e) => this.eventEligible(e));
    if (!eligible.length) return;
    const total = eligible.reduce((a, e) => a + e.weight, 0);
    let r = Math.random() * total;
    let pick = eligible[0];
    for (const e of eligible) {
      r -= e.weight;
      if (r <= 0) {
        pick = e;
        break;
      }
    }
    // Island Defences (Grand Project) stop some bad biome hazards before they start
    if (pick.counter && Math.random() < (this.techFx().hazard || 0)) return;
    this.startEvent(pick.id);
  }

  /**
   * Start an event on the current island (any running event ends first). Conditions are not
   * checked here, so this also works for testing: window.__pd.game.startEvent('lantern').
   */
  startEvent(id) {
    const e = EVENT_BY_ID[id];
    if (!e) return null;
    if (this.s.event) this.endEvent('replaced');
    const now = this.absHour();
    const ev = (this.s.event = { id, until: now + e.hours, island: this.biome, start: now, gain: {}, got: {} });
    this.s.stats.events++;
    this.s.lastEvent = id;
    const I = this.I;
    if (e.counter && I.buildings.some((b) => b.type === e.counter && b.built && !b.ruin)) ev.guarded = 1;
    if (id === 'chest') I.chest = this.randomFreeTile();
    if (id === 'cat') I.cat = this.randomFreeTile();
    if (id === 'visitor') I.visitor = { look: { skin: '#e0ac85', coat: '#6b4a8a', pants: '#2a2e3a', hair: '#9a9a9a', hat: '#2a2e3a', umbrella: '#6b4a8a' }, talked: false };
    if (id === 'meteor') {
      const kind = this.biome === 'fantasi' ? 'crystal' : 'ore';
      for (let n = 0; n < 4; n++) {
        const t = this.randomFreeTile();
        if (t) I.nodes[idx(t.i, t.j)] = { k: kind, v: n % 3, hp: -1, re: 0, fresh: 1 };
      }
      this.emit('nodes');
    }
    if (id === 'harvestmoon') {
      let n = 0;
      for (const nd of Object.values(I.nodes))
        if (nd.k === 'bush' && nd.hp === 0) {
          nd.hp = -1;
          nd.fresh = 1;
          n++;
        }
      if (n) {
        this.computeHappyMap();
        this.emit('nodes');
      }
    }
    if (e.props) {
      ev.props = [];
      ev.pid = 1;
      ev.found = 0;
      for (let n = 0; n < e.props.n; n++) this._spawnProp(ev, e.props.kind);
    }
    if (e.host) ev.host = { k: e.host, met: 0 };
    if (e.npc === 'birthday' && I.npcs.length) ev.npc = I.npcs[Math.floor(Math.random() * I.npcs.length)].id;
    if (e.npc === 'sick' && I.npcs.length) {
      const ids = I.npcs.map((p) => p.id);
      for (let k = ids.length - 1; k > 0; k--) {
        const r = Math.floor(Math.random() * (k + 1));
        [ids[k], ids[r]] = [ids[r], ids[k]];
      }
      ev.sick = ids.slice(0, Math.max(1, Math.ceil(ids.length * 0.4)));
      ev.total = ev.sick.length;
      ev.cured = 0;
    }
    if (e.fx?.weather) this.rollWeather();
    this.emit('event:start', { ...ev, def: e });
    return ev;
  }

  /** End the running event: clears its props, restores the weather and reports a summary. */
  endEvent(reason = 'time') {
    const ev = this.s.event;
    if (!ev) return null;
    const def = EVENT_BY_ID[ev.id];
    const summary = this._eventSummary(ev, def, reason);
    this.s.event = null;
    this.s.eventCd = this.absHour() + 2.5 + Math.random() * 3;
    const I = this.s.islands[ev.island];
    if (I) {
      I.chest = null;
      I.cat = null;
      I.visitor = null;
    }
    if (def?.fx?.weather) {
      if (ev.island === this.biome) this.rollWeather();
      else delete this.s.weather[ev.island];
    }
    this.emit('event:end', { ...ev, def, reason, summary });
    return summary;
  }

  _eventSummary(ev, def, reason) {
    const lines = [];
    let reward = null, title = null, big = false;
    const lvl = this.s.player.level;
    const I = this.s.islands[ev.island];
    if (def?.prize && reason !== 'replaced') {
      if (ev.id === 'fishing') {
        const fish = Math.round(ev.gain.food || 0);
        reward = this._grant(ev, { coins: 60 + lvl * 12 + fish * 3, xp: 30 + Math.round(fish / 2) });
        title = 'Tournament Results';
        lines.push(fish ? `Your fishers landed ${fish} extra food and won the cup!` : 'Nobody caught much, but there is a prize for taking part.');
        big = true;
      } else if (ev.id === 'royal' && I) {
        const h = Math.round(this.islandHappiness(I));
        if (h >= 60) {
          reward = this._grant(ev, { coins: 300 + lvl * 40, xp: 120 + lvl * 5, crystal: 3 });
          title = 'Royal Approval!';
          lines.push(`Happiness was ${h}%. The royal leaves a generous gift.`);
        } else {
          reward = this._grant(ev, { coins: 40 + lvl * 5 });
          title = 'The Royal Departs';
          lines.push(`Happiness was only ${h}%. Maybe next time!`);
        }
        big = true;
      }
    }
    if (ev.props?.length) lines.push(reason === 'done' ? `Found all ${ev.props.length}!` : `Found ${ev.found || 0} of ${ev.props.length}.`);
    if (ev.sick) lines.push(ev.sick.length ? `${ev.total - ev.sick.length} of ${ev.total} villagers recovered.` : 'Everyone is healthy again!');
    if (ev.burned) lines.push(`Burned ${ev.burned} wood to keep warm.`);
    if (ev.id === 'birthday') lines.push(ev.gifted ? 'The housewarming was a hit!' : 'Nobody brought a gift...');
    const extra = {};
    for (const [k, v] of Object.entries(ev.gain || {})) if (Math.round(v) > 0) extra[k] = Math.round(v);
    return { title, text: lines.join(' '), reward, extra, big };
  }

  /** Give a reward that belongs to the running event (tracked for its summary). Returns what was given, xp included. */
  _grant(ev, reward) {
    const got = this.give(reward);
    if (reward.xp) got.xp = reward.xp;
    if (ev) for (const [k, v] of Object.entries(got)) ev.got[k] = (ev.got[k] || 0) + v;
    return got;
  }
  _cheer(n) {
    for (const p of this.I.npcs) p.mood = clamp(p.mood + n, 0, 100);
  }

  /** Hourly rules of the running event: new props, firewood, colds clearing up. */
  eventHourly() {
    const ev = this.eventHere();
    if (!ev) return;
    const def = EVENT_BY_ID[ev.id];
    const fx = def.fx || NO_FX;
    const I = this.I;
    if (def.props?.perHour && this.propsLeft(ev) < (def.props.max || 6)) for (let n = 0; n < def.props.perHour; n++) this._spawnProp(ev, def.props.kind);
    if (fx.burnWood) {
      let homes = 0;
      for (const b of I.buildings) if (this.housingOf(b) > 0 && I.npcs.some((p) => p.home === b.id)) homes++;
      const need = homes * fx.burnWood;
      const burn = Math.min(need, Math.floor(this.s.res.wood));
      this.s.res.wood -= burn;
      ev.burned = (ev.burned || 0) + burn;
      const warm = burn >= need;
      if (!warm && ev.warm !== false) this.emit('toast', { text: 'Out of firewood! The villagers are freezing.', kind: 'warn', icon: 'snowflake' });
      ev.warm = warm;
      this.emit('res');
    }
    if (ev.sick?.length) {
      for (const id of [...ev.sick]) {
        const p = I.npcs.find((q) => q.id === id);
        if (!p) this._cure(ev, id, false);
        else if (this._hasClinic(I) ? p.need.food > 40 && Math.random() < 0.55 : p.need.food > 60 && p.need.energy > 55 && Math.random() < 0.2) this._cure(ev, id, false, p);
        if (this.s.event !== ev) break;
      }
    }
  }

  _hasClinic(I = this.I) {
    return I.buildings.some((b) => BUILDINGS[b.type].clinic && b.built);
  }

  _cure(ev, id, byMayor, p = null) {
    ev.sick = ev.sick.filter((x) => x !== id);
    if (byMayor) ev.cured = (ev.cured || 0) + 1;
    if (p) this.emit('event:cure', { p, byMayor, left: ev.sick.length });
    if (!ev.sick.length && EVENT_BY_ID[ev.id].endWhenDone) this.endEvent('done');
  }

  /** Gifts during events: the housewarming villager, or curing a sick one. */
  _eventGift(p) {
    const ev = this.eventHere();
    if (!ev) return;
    if (ev.id === 'birthday' && ev.npc === p.id && !ev.gifted) {
      ev.gifted = 1;
      p.friend = clamp((p.friend || 0) + 24, 0, 100); // 3x the usual friendship
      p.mood = clamp(p.mood + 15, 0, 100);
      const lvl = this.s.player.level;
      const got = this._grant(ev, { coins: 80 + lvl * 20, xp: 40 + lvl * 2 });
      this.emit('event:gift', { kind: 'birthday', p, got });
    } else if (ev.sick?.includes(p.id)) {
      p.need.energy = clamp(p.need.energy + 30, 0, 100);
      this._grant(ev, { xp: 15 });
      this._cure(ev, p.id, true, p);
    }
  }

  _spawnProp(ev, kind) {
    const t = this._propTile(ev, kind);
    if (!t) return null;
    const pr = { id: ev.pid++, k: kind, i: t.i, j: t.j };
    if (kind === 'kid') pr.look = randomLook(Math.random);
    ev.props.push(pr);
    this.emit('event:prop', { ev, prop: pr });
    return pr;
  }
  _propTile(ev, kind) {
    const I = this.I;
    if (kind === 'bees') {
      const farms = I.buildings.filter((b) => b.type === 'ladang' && b.built);
      const s = BUILDINGS.ladang.size;
      for (let t = 0; t < 8 && farms.length; t++) {
        const f = farms[Math.floor(Math.random() * farms.length)];
        const tile = this._freeTileNear(ev, f.i + (s - 1) / 2, f.j + (s - 1) / 2, s);
        if (tile) return tile;
      }
    }
    if (kind === 'kid') {
      const keys = Object.keys(I.nodes).filter((k) => I.nodes[k].hp !== 0);
      for (let t = 0; t < 12 && keys.length; t++) {
        const k = +keys[Math.floor(Math.random() * keys.length)];
        const tile = this._freeTileNear(ev, Math.floor(k / N), k % N, 1);
        if (tile) return tile;
      }
    }
    for (let t = 0; t < 10; t++) {
      const tile = this.randomFreeTile();
      if (tile && !this._propAt(ev, tile.i, tile.j)) return tile;
    }
    return null;
  }
  _propAt(ev, i, j) {
    return !!ev.props?.some((p) => !p.done && Math.abs(p.i - i) + Math.abs(p.j - j) < 2);
  }
  _freeTileNear(ev, ci, cj, r) {
    const I = this.I;
    for (let t = 0; t < 24; t++) {
      const i = Math.round(ci + (Math.random() * 2 - 1) * (r + 0.5)), j = Math.round(cj + (Math.random() * 2 - 1) * (r + 0.5));
      if (!inside(i, j)) continue;
      const k = idx(i, j);
      if (WALKABLE.has(I.t[k]) && !this.occ[k] && !I.nodes[k] && !this._propAt(ev, i, j)) return { i, j };
    }
    return null;
  }

  /** The Mayor reached an event prop (see World event visuals). Returns what was given, or null. */
  collectEventProp(pid) {
    const ev = this.eventHere();
    const pr = ev?.props?.find((p) => p.id === pid && !p.done);
    if (!pr) return null;
    pr.done = 1;
    ev.found = (ev.found || 0) + 1;
    const lvl = this.s.player.level;
    let reward, text;
    switch (pr.k) {
      case 'star': reward = { essence: 1, crystal: 1 + Math.floor(lvl / 8), xp: 25 }; text = 'You caught a fallen star!'; break;
      case 'gold': reward = { coins: 200 + lvl * 35, xp: 40 }; text = 'A pot of gold at the end of the rainbow!'; break;
      case 'dog': reward = { coins: 60 + lvl * 20, xp: 40 }; text = 'The puppy is back home. Its family is overjoyed!'; this._cheer(6); break;
      case 'kid': reward = { coins: 30 + lvl * 10, xp: 20 }; text = '"Aww, you found me!"'; this._cheer(2); break;
      case 'chest': reward = this.chestReward(); this.s.stats.chests++; text = 'You found a hidden chest!'; break;
      case 'dig': reward = this.chestReward(1.8); this.s.stats.chests++; text = 'X marks the spot: buried treasure!'; break;
      case 'bees': reward = { food: 8 + lvl * 2, coins: 15 + lvl * 3, xp: 15 }; text = 'Shoo! The swarm left its honey behind.'; break;
      case 'wisp': reward = { crystal: 1 + (lvl >= 8 ? 1 : 0), coins: 20 + lvl * 5, xp: 15 }; text = 'You caught a glowing marsh light!'; break;
      default: reward = { xp: 10 }; text = '';
    }
    const got = this._grant(ev, reward);
    const def = EVENT_BY_ID[ev.id];
    const left = this.propsLeft(ev);
    this.emit('event:collect', { ev, def, prop: pr, got, text, left });
    if (def.endWhenDone && !left) this.endEvent('done');
    return got;
  }

  /** The Mayor greets the event's visiting host (storyteller, royal). */
  meetHost() {
    const ev = this.eventHere();
    if (!ev?.host || ev.host.met) return null;
    ev.host.met = 1;
    let got, text;
    if (ev.host.k === 'bard') {
      for (const p of this.I.npcs) {
        p.need.fun = clamp(p.need.fun + 25, 0, 100);
        p.mood = clamp(p.mood + 4, 0, 100);
      }
      got = this._grant(ev, { xp: 30 });
      text = '"Here is a tale just for you, Mayor!" The whole village laughs along.';
    } else {
      const h = Math.round(this.islandHappiness());
      got = this._grant(ev, { xp: 50 });
      text = `"What a charming island!" Happiness is ${h}%. Keep it above 60% for a royal reward.`;
    }
    this.emit('event:host', { ev, host: ev.host, got, text });
    return got;
  }

  randomFreeTile() {
    const I = this.I;
    for (let t = 0; t < 200; t++) {
      const i = 1 + Math.floor(Math.random() * (N - 2)), j = 1 + Math.floor(Math.random() * (N - 2));
      const k = idx(i, j);
      if (WALKABLE.has(I.t[k]) && !this.occ[k] && !I.nodes[k]) return { i, j };
    }
    return null;
  }

  openChest() {
    const I = this.I;
    if (!I.chest) return null;
    I.chest = null;
    const reward = this.chestReward();
    this.s.stats.chests++;
    this.give(reward);
    return reward;
  }
  chestReward(scale = 1) {
    const lvl = this.s.player.level;
    const reward = { coins: Math.round((80 + lvl * 25 + Math.floor(Math.random() * 100)) * scale), xp: Math.round((30 + lvl * 5) * scale) };
    const extra = ['plank', 'brick', 'glass', 'tool', 'crystal'].filter((r) => (r !== 'crystal' || lvl >= 10) && (r !== 'tool' || lvl >= 5));
    const r = extra[Math.floor(Math.random() * extra.length)];
    reward[r] = Math.round((3 + Math.floor(Math.random() * 5)) * scale);
    return reward;
  }

  rescueCat() {
    const I = this.I;
    if (!I.cat) return null;
    I.cat = null;
    for (const p of I.npcs) p.mood = clamp(p.mood + 6, 0, 100);
    const reward = { coins: 60 + this.s.player.level * 20, xp: 40 };
    this.s.stats.cats++;
    this.give(reward);
    return reward;
  }

  talkVisitor() {
    const I = this.I;
    if (!I.visitor || I.visitor.talked) return null;
    I.visitor.talked = true;
    const lvl = this.s.player.level;
    const options = [{ coins: 150 + lvl * 30 }, { tool: 2 + Math.floor(lvl / 4) }, { glass: 6, brick: 6 }, { crystal: 3, xp: 80 }];
    const reward = { ...options[Math.floor(Math.random() * options.length)], xp: 50 };
    this.give(reward);
    return reward;
  }

  sellMultiplier() {
    const ev = this.s.event;
    const fx = ev && EVENT_BY_ID[ev.id]?.fx;
    if (!fx?.sell) return 1;
    if (fx.sellNight && !NIGHT_SALE(this.s.time.hour)) return 1;
    return fx.sell;
  }

  // ---------------------------------------------------------------- market

  hasMarket() {
    return Object.values(this.s.islands).some((I) => I.buildings.some((b) => b.type === 'pasar' && b.built));
  }
  sellPrice(r) {
    return Math.max(1, Math.round(RES[r].price * this.s.market[r] * this.sellMultiplier() * (1 + (this.techFx().sell || 0))));
  }
  buyPrice(r) {
    return Math.max(2, Math.round(RES[r].price * 1.7 * (2 - this.s.market[r])));
  }
  sell(r, n) {
    n = Math.min(n, this.s.res[r]);
    if (n <= 0) return 0;
    let total = 0;
    for (let k = 0; k < n; k++) {
      total += this.sellPrice(r);
      this.s.market[r] = Math.max(0.4, this.s.market[r] - 0.012);
    }
    this.s.res[r] -= n;
    this.s.player.coins += total;
    this.s.stats.sold += n;
    this.addXp(Math.ceil(n / 4));
    this.emit('res');
    return total;
  }
  buy(r, n) {
    let total = 0;
    const cap = this.storageCap();
    n = Math.min(n, cap - this.s.res[r]);
    if (n <= 0) return { ok: false, reason: 'Storage is full' };
    for (let k = 0; k < n; k++) total += this.buyPrice(r);
    if (this.s.player.coins < total) return { ok: false, reason: 'Not enough Coins' };
    this.s.player.coins -= total;
    this.s.res[r] += n;
    this.s.market[r] = Math.min(1.4, this.s.market[r] + 0.01 * n);
    this.emit('res');
    return { ok: true, total };
  }

  // ---------------------------------------------------------------- crafting

  craftSlots() {
    let n = 0;
    for (const I of Object.values(this.s.islands)) for (const b of I.buildings) if (b.type === 'bengkel' && b.built) n += BUILDINGS.bengkel.craftSlots + ((b.level || 1) - 1);
    return Math.min(n, 6);
  }
  craft(id) {
    const R = RECIPES.find((r) => r.id === id);
    if (!R) return { ok: false };
    if (this.s.player.level < R.unlock) return { ok: false, reason: `Unlocks at level ${R.unlock}` };
    const slots = this.craftSlots();
    if (!slots) return { ok: false, reason: 'Build a Workshop first' };
    if (this.s.craft.queue.length >= slots + 3) return { ok: false, reason: 'Queue is full' };
    if (!this.pay(R.in)) return { ok: false, reason: 'Need: ' + this.missing(R.in).join(', ') };
    const now = Date.now();
    // jobs run in parallel up to the slot count; extra jobs wait in line
    const running = this.s.craft.queue.slice(0, slots);
    const start = running.length < slots ? now : Math.min(...running.map((q) => q.end));
    this.s.craft.queue.push({ id, start, end: start + this.craftTime(R) * 1000 });
    this.emit('craft');
    return { ok: true };
  }
  updateCrafting(now = Date.now()) {
    const Q = this.s.craft.queue;
    let changed = false;
    for (let i = 0; i < Q.length; i++) {
      const q = Q[i];
      if (now >= q.end) {
        const R = RECIPES.find((r) => r.id === q.id);
        const got = this.give(R.out, { silent: true });
        this.s.stats.crafted++;
        if (q.id === 'essence') this.s.stats.essence++;
        this.addXp(3 + Math.round(R.time / 4));
        Q.splice(i, 1);
        i--;
        changed = true;
        this.emit('crafted', { recipe: R, got });
      }
    }
    if (changed) {
      // re-time waiting jobs so the next one starts when a slot frees up
      const slots = Math.max(1, this.craftSlots());
      for (let i = 0; i < Q.length; i++) {
        if (i < slots && Q[i].start > now) {
          const R = RECIPES.find((r) => r.id === Q[i].id);
          Q[i].start = now;
          Q[i].end = now + this.craftTime(R) * 1000;
        }
      }
      this.emit('craft');
    }
  }

  craftTime(R) {
    return R.time * (1 - (this.techFx().craft || 0));
  }

  upgradeTool() {
    const next = TOOL_TIERS[this.s.player.tool + 1];
    if (!next) return { ok: false, reason: 'You have the best tool' };
    if (!this.pay(next.cost)) return { ok: false, reason: 'Need: ' + this.missing(next.cost).join(', ') };
    this.s.player.tool++;
    this.addXp(40);
    return { ok: true, tool: next };
  }

  // ---------------------------------------------------------------- islands

  islandStatus(id) {
    const B = BIOMES[id];
    if (this.s.islands[id]) return { open: true };
    if (this.s.player.level < B.unlock) return { open: false, reason: `Needs level ${B.unlock}`, canBuy: false };
    return { open: false, canBuy: this.s.player.coins >= B.cost, cost: B.cost };
  }
  unlockIsland(id) {
    const st = this.islandStatus(id);
    if (st.open) return { ok: true };
    if (!st.canBuy) return { ok: false, reason: st.reason || 'Not enough Coins' };
    this.s.player.coins -= BIOMES[id].cost;
    const I = generateIsland(id, this.s.seed + BIOME_KEYS.indexOf(id) * 17);
    I.lastAbs = this.absHour();
    I.fires = [];
    I.starBest = 0;
    this.s.islands[id] = I;
    for (let k = 0; k < 2; k++) this.spawnNpc(I, true);
    this.addXp(100);
    this.emit('island:unlock', id);
    this.refreshQuests();
    return { ok: true };
  }
  switchIsland(id) {
    if (!this.s.islands[id] || id === this.s.current) return false;
    this.I.lastAbs = this.absHour();
    this.s.current = id;
    const I = this.I;
    // catch up the time the island was left alone
    const away = clamp(this.absHour() - (I.lastAbs || this.absHour()), 0, 48);
    let summary = null;
    if (away > 0.5) summary = this.abstractProduce(I, id, away, 0.6);
    this.refreshIsland();
    I.lastAbs = this.absHour();
    this.emit('island:switch', { id, summary });
    return true;
  }

  /** Production for an island that is not being simulated in detail. */
  abstractProduce(I, biome, hours, eff) {
    const got = {};
    const add = (r, v) => (got[r] = (got[r] || 0) + v);
    const bonus = BIOMES[biome].bonus || {};
    const mood = this.islandHappiness(I);
    const moodK = 0.7 + mood / 200;
    const workers = new Map();
    for (const p of I.npcs) if (p.job) workers.set(p.job, (workers.get(p.job) || 0) + 1);
    for (const b of I.buildings) {
      const def = BUILDINGS[b.type];
      if (!b.built || b.ruin) continue;
      const w = workers.get(b.id) || 0;
      if (def.produce && w) {
        const lvl = 1 + 0.5 * ((b.level || 1) - 1);
        let k = w * lvl * moodK * (9 / 24) * hours * eff;
        if (def.consume) {
          // limited by what is in storage
          let f = 1;
          for (const [r, rate] of Object.entries(def.consume)) f = Math.min(f, (this.s.res[r] || 0) / Math.max(1e-6, rate * k));
          f = Math.max(0, Math.min(1, f));
          k *= f;
          for (const [r, rate] of Object.entries(def.consume)) this.s.res[r] = Math.max(0, (this.s.res[r] || 0) - Math.round(rate * k));
        }
        const sp = SEASONS[this.seasonIndex()].prod;
        for (const [r, rate] of Object.entries(def.produce)) {
          const rk = r === 'coins' ? 'coin' : r;
          if (r === 'xp') add('xp', rate * k);
          else add(r, rate * k * (bonus[rk] || 1) * (sp[rk] || 1) * this.techMult(rk));
        }
      }
      if (def.housing) {
        const residents = I.npcs.filter((p) => p.home === b.id).length;
        add('coins', residents * def.tax * 0.3 * moodK * hours * eff * (bonus.coin || 1) * (1 + (this.techFx().tax || 0)));
      }
    }
    // people eat three meals a day
    add('food', -I.npcs.length * (3 / 24) * hours);
    const out = {};
    for (const [r, v] of Object.entries(got)) out[r] = Math.round(v);
    if (out.xp) {
      this.addXp(out.xp);
      delete out.xp;
    }
    if (out.food < 0) {
      this.s.res.food = Math.max(0, this.s.res.food + out.food);
      delete out.food;
    }
    const given = this.give(out, { silent: true });
    return given;
  }

  /** Called when the app comes back after being closed or in the background. */
  applyOffline(seconds) {
    const s = clamp(seconds, 0, OFFLINE_CAP_S + (this.techFx().offline || 0) * 3600);
    if (s < 120) return null;
    const hours = s / SECONDS_PER_GAME_HOUR;
    const total = {};
    for (const [id, I] of Object.entries(this.s.islands)) {
      const got = this.abstractProduce(I, id, hours, OFFLINE_EFF);
      for (const [r, v] of Object.entries(got)) total[r] = (total[r] || 0) + v;
    }
    this.updateCrafting(Date.now());
    this.updateResearch(Date.now());
    return { seconds: s, got: total };
  }

  // ---------------------------------------------------------------- quests

  questAvailable(q) {
    const done = this.s.quests.done;
    return !done.includes(q.id) && (!q.after || done.includes(q.after));
  }
  activeQuests() {
    return QUESTS.filter((q) => this.questAvailable(q)).slice(0, 3);
  }
  refreshQuests() {
    for (const q of this.activeQuests()) if (!this.s.quests.base[q.id]) this.s.quests.base[q.id] = { ...this.s.stats };
  }
  goalProgress(q, g) {
    const base = this.s.quests.base[q.id] || this.s.stats;
    const S = this.s.stats;
    switch (g.type) {
      case 'build': return [Object.values(this.s.islands).reduce((a, I) => a + I.buildings.filter((b) => b.type === g.id && b.built).length, 0), g.n];
      case 'pop': return [this.population(), g.n];
      case 'have': return [this.s.res[g.id] || 0, g.n];
      case 'craft': return [S.crafted - (base.crafted || 0), g.n];
      case 'gather': return [S.gathered - (base.gathered || 0), g.n];
      case 'sell': return [S.sold - (base.sold || 0), g.n];
      case 'talk': return [S.talked - (base.talked || 0), g.n];
      case 'upgrade': return [S.upgrades - (base.upgrades || 0), g.n];
      case 'level': return [this.s.player.level, g.n];
      case 'island': return [this.s.islands[g.id] ? 1 : 0, 1];
      case 'seasons': return [(S.seasons || 0) - (base.seasons || 0), g.n];
      case 'chain': return [Object.values(this.s.islands).reduce((a, I) => a + I.buildings.filter((b) => CHAIN_TYPES.has(b.type) && b.built).length, 0), g.n];
      case 'happy': return [Math.round(Math.max(...Object.values(this.s.islands).map((I) => this.islandHappiness(I)))), g.n];
      case 'research': return [this.s.research.done.length, g.n];
      case 'orders': return [(S.orders || 0) - (base.orders || 0), g.n];
      case 'fires': return [(S.fires || 0) - (base.fires || 0), g.n];
      case 'stars': return [Math.max(0, ...Object.values(this.s.islands).map((I) => I.starBest || 0)), g.n];
      default: return [0, 1];
    }
  }
  questDone(q) {
    return q.goals.every((g) => {
      const [a, b] = this.goalProgress(q, g);
      return a >= b;
    });
  }
  claimQuest(id) {
    const q = QUESTS.find((x) => x.id === id);
    if (!q || !this.questAvailable(q) || !this.questDone(q)) return null;
    this.s.quests.done.push(id);
    delete this.s.quests.base[id];
    this.s.stats.quests++;
    const got = this.give(q.reward);
    if (q.reward.xp) got.xp = q.reward.xp;
    this.refreshQuests();
    this.emit('quest:claim', { q, got });
    return got;
  }
  claimableQuests() {
    return this.activeQuests().filter((q) => this.questDone(q)).length;
  }

  // ---------------------------------------------------------------- achievements

  statValue(stat) {
    switch (stat) {
      case 'pop': return this.population();
      case 'coins': return this.s.player.coins;
      case 'islands': return Object.keys(this.s.islands).length;
      case 'kota': return this.s.islands.kota ? 1 : 0;
      case 'level': return this.s.player.level;
      case 'streak': return this.s.daily.streak;
      case 'maxstars': return Math.max(0, ...Object.values(this.s.islands).map((I) => I.starBest || 0));
      default: return this.s.stats[stat] || 0;
    }
  }
  checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (this.s.ach[a.id]) continue;
      if (this.statValue(a.stat) >= a.n) {
        this.s.ach[a.id] = Date.now();
        this.give(a.reward, { silent: true });
        this.emit('achievement', a);
      }
    }
  }

  // ---------------------------------------------------------------- daily reward

  dailyStatus() {
    const today = todayStr();
    const D = this.s.daily;
    if (D.last === today) return { available: false, streak: D.streak };
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const next = D.last === todayStr(y) ? D.streak + 1 : 1;
    return { available: true, streak: next, reward: DAILY_REWARDS[(next - 1) % DAILY_REWARDS.length] };
  }
  claimDaily() {
    const st = this.dailyStatus();
    if (!st.available) return null;
    this.s.daily = { last: todayStr(), streak: st.streak };
    const got = this.give(st.reward);
    this.addXp(20 + st.streak * 5);
    return { ...st, got };
  }

  // ---------------------------------------------------------------- frame update (real seconds)

  update(dtReal) {
    this._achTimer += dtReal;
    if (this._achTimer > 1.5) {
      this._achTimer = 0;
      this.checkAchievements();
      this.updateCrafting();
      this.updateSystems();
    }
  }
}

Object.assign(Game.prototype, SystemsMixin, FrontierMixin, StoryMixin);

export { WALKABLE_BUILDINGS, STEP };
