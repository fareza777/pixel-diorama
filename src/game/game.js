// Game state and rules: resources, economy, buildings, population, crafting, market, progression,
// quests, achievements, random events, daily rewards and offline progress. No rendering here.
import {
  RES, RES_KEYS, BIOMES, BIOME_KEYS, BUILDINGS, MAX_LEVEL, upgradeCost, RECIPES, TOOL_TIERS, NODES, FIRST_NAMES, TRAITS,
  QUESTS, ACHIEVEMENTS, EVENTS, xpForLevel, MAX_PLAYER_LEVEL, DAILY_REWARDS, START, PAINTS,
} from './data.js';
import { N, idx, inside, generateIsland, packIsland, unpackIsland, WALKABLE, ROADS, STEP } from './island.js';
import { randomLook } from './people.js';
import { rng } from '../engine/kit.js';

export const SAVE_VERSION = 1;
export const SECONDS_PER_GAME_HOUR = 30; // a full day takes 12 real minutes at 1x
const OFFLINE_CAP_S = 8 * 3600;
const OFFLINE_EFF = 0.4;
const WALKABLE_BUILDINGS = new Set(['ladang', 'taman', 'pasar']);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
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
      player: { name: 'Kepala Desa', level: 1, xp: 0, coins: START.coins, tool: 0 },
      res: Object.fromEntries(RES_KEYS.map((k) => [k, START.res[k] || 0])),
      stats: { built: 0, gathered: 0, crafted: 0, sold: 0, talked: 0, gifts: 0, quests: 0, events: 0, chests: 0, cats: 0, landmarks: 0, days: 0, essence: 0, upgrades: 0 },
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
      settings: { sound: true, music: true, volume: 0.7, sfx: 0.9, quality: 'auto', pixel: 1, fps: false, speed: 1, haptics: true },
      tips: 0,
      tutorial: 0,
    };
    this.s.islands.desa = generateIsland('desa', seed);
    const I = this.s.islands.desa;
    // two founding villagers
    for (let k = 0; k < 2; k++) this.spawnNpc(I, true);
    this.refreshIsland();
    this.refreshQuests();
  }

  serialize() {
    this.s.saved = Date.now();
    const out = { ...this.s, islands: {} };
    for (const [k, I] of Object.entries(this.s.islands)) out.islands[k] = packIsland(I);
    return JSON.stringify(out);
  }

  load(json) {
    const d = typeof json === 'string' ? JSON.parse(json) : json;
    if (!d || !d.v || !d.islands) throw new Error('save tidak valid');
    // fill in anything newer versions added
    const base = (() => {
      const g = new Game();
      g.newGame();
      return g.s;
    })();
    d.player = { ...base.player, ...d.player };
    d.res = { ...Object.fromEntries(RES_KEYS.map((k) => [k, 0])), ...d.res };
    d.stats = { ...base.stats, ...d.stats };
    d.settings = { ...base.settings, ...d.settings };
    d.market = { ...base.market, ...d.market };
    d.quests = d.quests || base.quests;
    d.craft = d.craft || base.craft;
    d.weather = d.weather || {};
    d.daily = d.daily || base.daily;
    d.ach = d.ach || {};
    for (const k of Object.keys(d.islands)) d.islands[k] = unpackIsland(d.islands[k]);
    if (!d.islands[d.current]) d.current = 'desa';
    this.s = d;
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
      if (!def.happy || !b.built) continue;
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
    if (!def.housing || !b.built) return 0;
    return def.housing + (def.housingPerLevel || 0) * ((b.level || 1) - 1);
  }
  jobsOf(b) {
    const def = BUILDINGS[b.type];
    if (!def.jobs || !b.built) return 0;
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
        if (def.storage && b.built) cap += def.storage + (def.storagePerLevel || 0) * ((b.level || 1) - 1);
      }
    return cap;
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
      if (have < v) out.push(`${k === 'coins' ? 'Koin' : RES[k]?.name || k} ${v - have}`);
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
    if (!def) return { ok: false, reason: 'Tidak dikenal' };
    if (!this.isUnlocked(type)) return { ok: false, reason: `Terbuka di level ${def.unlock}` };
    if (!this.biomeAllows(type)) return { ok: false, reason: 'Tidak cocok untuk pulau ini' };
    if (def.limit && this.countType(type, I) >= def.limit) return { ok: false, reason: 'Hanya boleh satu di pulau ini' };
    const s = def.size;
    let hMax = -99, hMin = 99;
    for (let a = 0; a < s; a++)
      for (let b = 0; b < s; b++) {
        const ii = i + a, jj = j + b;
        if (!inside(ii, jj)) return { ok: false, reason: 'Di luar pulau' };
        const k = idx(ii, jj);
        if (I.t[k] === 'w') return { ok: false, reason: 'Tidak bisa di atas air' };
        if (this.occ[k]) return { ok: false, reason: 'Petak sudah terisi' };
        if (I.npcBlock?.has?.(k)) return { ok: false, reason: 'Ada sesuatu di sini' };
        hMax = Math.max(hMax, I.h[k]);
        hMin = Math.min(hMin, I.h[k]);
      }
    if (hMax - hMin > 0.75) return { ok: false, reason: 'Tanah terlalu curam' };
    if (def.needWater && !this.nearWater(i, j, s, I)) return { ok: false, reason: 'Harus di tepi air' };
    if (!this.has(def.cost)) return { ok: false, reason: 'Kurang: ' + this.missing(def.cost).join(', '), cost: true };
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
  waterRot(i, j, I = this.I) {
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // rot 0 faces +z, 1 faces +x (pier along local +z)
    for (let r = 0; r < 4; r++) {
      const [di, dj] = dirs[r];
      if (inside(i + di, j + dj) && I.t[idx(i + di, j + dj)] === 'w') return r;
    }
    return 0;
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
    const rec = { id: I.nextId++, type, i, j, rot: def.needWater ? this.waterRot(i, j) : rot, level: 1, paint: 0, built: 0, progress: 0 };
    I.buildings.push(rec);
    for (const [ii, jj] of footprint(rec)) this.occ[idx(ii, jj)] = rec.id;
    this.give(gained, { silent: true });
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
    if (rec.level >= MAX_LEVEL || def.fixed || def.small) return { ok: false, reason: 'Sudah maksimal' };
    const cost = upgradeCost(def, rec.level);
    if (!this.pay(cost)) return { ok: false, reason: 'Kurang: ' + this.missing(cost).join(', ') };
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
    if (def.fixed) return { ok: false, reason: 'Tidak bisa dibongkar' };
    const I = this.I;
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
        this.emit('toast', { text: 'Butuh 1 batu per petak jalan', kind: 'warn' });
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
    const y = TOOL_TIERS[this.s.player.tool].yield;
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
      n.re = this.absHour() + def.regrow;
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
    N2.food = clamp(N2.food - dtH * 4.2 * (tr.hunger || 1), 0, 100);
    if (ctx.sleeping) N2.energy = clamp(N2.energy + dtH * 13, 0, 100);
    else N2.energy = clamp(N2.energy - dtH * (ctx.working ? 4 : 2.5), 0, 100);
    if (ctx.leisure) N2.fun = clamp(N2.fun + dtH * (ctx.festival ? 30 : 14) * (tr.social || 1), 0, 100);
    else if (!ctx.sleeping) N2.fun = clamp(N2.fun - dtH * 2.2, 0, 100);
    const home = p.home ? this.buildingById(p.home) : null;
    let env = 10;
    if (home) {
      const k = idx(home.i, home.j);
      env = 42 + 8 * ((home.level || 1) - 1) + Math.min(40, this.happyMap ? this.happyMap[k] : 0);
    }
    const job = p.job ? 8 : this.I.npcs.length < 3 ? 4 : -6;
    const ev = this.s.event?.id === 'festival' ? 10 : this.s.event?.id === 'storm' ? -6 : 0;
    const target = clamp(0.28 * N2.food + 0.14 * N2.energy + 0.22 * N2.fun + 0.36 * env + job + ev, 0, 100);
    p.mood += (target - p.mood) * (1 - Math.exp(-dtH * 0.45 * (tr.mood || 1)));
    p.mood = clamp(p.mood, 0, 100);
    if (!home) p.homeless = (p.homeless || 0) + dtH;
    else p.homeless = 0;
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
    if (!this.pay({ food: 5 })) return { ok: false, reason: 'Butuh 5 makanan' };
    p.friend = clamp((p.friend || 0) + 12, 0, 100);
    p.need.food = clamp(p.need.food + 30, 0, 100);
    p.mood = clamp(p.mood + 8, 0, 100);
    this.s.stats.gifts++;
    this.addXp(5);
    return { ok: true };
  }

  fulfilRequest(p) {
    const r = p.req;
    if (!r) return { ok: false };
    if (!this.pay({ [r.res]: r.n })) return { ok: false, reason: `Butuh ${r.n} ${RES[r.res].name}` };
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
  tick(dtH, presence) {
    const T = this.s.time;
    const prevHour = Math.floor(T.hour);
    T.hour += dtH;
    if (T.hour >= 24) {
      T.hour -= 24;
      T.day++;
      this.s.stats.days++;
      // a quiet daily bonus: XP for every resident
      this.addXp(Math.max(5, this.population()));
      this.emit('newday', T.day);
    }
    this.I.lastAbs = this.absHour();
    this.produce(dtH, presence);
    if (Math.floor(T.hour) !== prevHour) this.hourly();
  }

  multipliers(res) {
    let m = 1;
    const ev = this.s.event?.island === this.biome ? this.s.event.id : null;
    if (ev === 'harvest' && res === 'food') m *= 2;
    if (ev === 'pest' && res === 'food') m *= 0.5;
    if (ev === 'storm') m *= 0.7;
    if (ev === 'inspire') m *= 1.25;
    const bonus = BIOMES[this.biome].bonus || {};
    if (bonus[res]) m *= bonus[res];
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

  windmillBoost(b) {
    let m = 1;
    for (const w of this.I.buildings) {
      if (w.type !== 'kincir' || !w.built) continue;
      if (Math.hypot(w.i - b.i, w.j - b.j) <= BUILDINGS.kincir.boost.radius) m += BUILDINGS.kincir.boost.amount;
    }
    return Math.min(m, 1.9);
  }

  produce(dtH, presence) {
    const I = this.I;
    const mood = this.islandHappiness();
    const moodK = 0.7 + mood / 200;
    for (const b of I.buildings) {
      const def = BUILDINGS[b.type];
      if (!b.built) continue;
      if (def.produce) {
        const workers = presence.get(b.id) || 0;
        if (!workers) continue;
        b.acc ||= {};
        const lvl = 1 + 0.5 * ((b.level || 1) - 1);
        let k = workers * lvl * moodK * dtH;
        if (def.nearNode) k *= this.nodeBonus(b, def.nearNode);
        if (b.type === 'ladang') k *= this.windmillBoost(b);
        for (const [r, rate] of Object.entries(def.produce)) {
          b.acc[r] = (b.acc[r] || 0) + rate * k * this.multipliers(r === 'coins' ? 'coin' : r);
          if (b.acc[r] >= 1) {
            const n = Math.floor(b.acc[r]);
            b.acc[r] -= n;
            const got = this.give({ [r]: n }, { silent: true });
            if (got[r]) this.emit('produce', { b, res: r, n: got[r] });
          }
        }
      }
      if (def.housing) {
        const residents = I.npcs.filter((p) => p.home === b.id).length;
        if (residents) {
          b.tax = (b.tax || 0) + residents * def.tax * 0.3 * moodK * dtH * this.multipliers('coin');
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
    // weather changes now and then
    const W = this.s.weather[this.biome];
    const now = this.absHour();
    if (!W || now >= W.until) this.rollWeather();
    // new residents
    const happy = this.islandHappiness();
    const free = this.housingCap() - I.npcs.length;
    if (free > 0 && h >= 7 && h <= 19 && happy >= 35 && this.s.res.food > 0) {
      const chance = 0.3 + happy / 220;
      if (Math.random() < chance) {
        const p = this.spawnNpc(I);
        p.arriving = 1;
        this.addXp(6);
        this.emit('npc:add', p);
        this.emit('toast', { text: `${p.name} pindah ke ${BIOMES[this.biome].short}!`, icon: 'pop' });
      }
    }
    // unhappy or homeless residents may leave
    for (const p of [...I.npcs]) {
      if ((p.homeless > 16 && I.npcs.length > 2) || (p.mood < 15 && Math.random() < 0.04)) {
        this.removeNpc(I, p);
        this.emit('toast', { text: `${p.name} meninggalkan pulau...`, kind: 'warn', icon: 'sad' });
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
    // events
    this.updateEvent();
    this.assignJobs(I);
    this.refreshQuests();
  }

  rollWeather() {
    const B = BIOMES[this.biome];
    const ev = this.s.event;
    let name;
    if (ev && ev.id === 'storm' && ev.island === this.biome) name = 'storm';
    else {
      const entries = Object.entries(B.weather);
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

  updateEvent() {
    const now = this.absHour();
    const ev = this.s.event;
    if (ev && now >= ev.until) {
      this.emit('event:end', ev);
      this.s.event = null;
      this.s.eventCd = now + 3 + Math.random() * 4;
      const I = this.s.islands[ev.island];
      if (I) {
        I.chest = null;
        I.cat = null;
        I.visitor = null;
      }
      if (ev.id === 'storm') this.rollWeather();
      return;
    }
    if (ev || now < (this.s.eventCd || 0)) return;
    if (Math.random() > 0.3) return;
    const h = this.s.time.hour;
    const night = h < 5.5 || h > 20;
    const pop = this.I.npcs.length;
    const eligible = EVENTS.filter(
      (e) => (!e.minLevel || this.s.player.level >= e.minLevel) && (!e.minPop || pop >= e.minPop) && (e.night === undefined || e.night === night) && (!e.notBiomes || !e.notBiomes.includes(this.biome)),
    );
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
    this.startEvent(pick.id);
  }

  startEvent(id) {
    const e = EVENTS.find((x) => x.id === id);
    const now = this.absHour();
    this.s.event = { id, until: now + e.hours, island: this.biome };
    this.s.stats.events++;
    const I = this.I;
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
    if (id === 'storm') this.rollWeather();
    this.emit('event:start', { ...this.s.event, def: e });
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
    const lvl = this.s.player.level;
    const reward = { coins: 80 + lvl * 25 + Math.floor(Math.random() * 100), xp: 30 + lvl * 5 };
    const extra = ['plank', 'brick', 'glass', 'tool', 'crystal'].filter((r) => (r !== 'crystal' || lvl >= 10) && (r !== 'tool' || lvl >= 5));
    const r = extra[Math.floor(Math.random() * extra.length)];
    reward[r] = 3 + Math.floor(Math.random() * 5);
    this.s.stats.chests++;
    this.give(reward);
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
    return this.s.event?.id === 'caravan' ? 1.5 : 1;
  }

  // ---------------------------------------------------------------- market

  hasMarket() {
    return Object.values(this.s.islands).some((I) => I.buildings.some((b) => b.type === 'pasar' && b.built));
  }
  sellPrice(r) {
    return Math.max(1, Math.round(RES[r].price * this.s.market[r] * this.sellMultiplier()));
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
    if (n <= 0) return { ok: false, reason: 'Gudang penuh' };
    for (let k = 0; k < n; k++) total += this.buyPrice(r);
    if (this.s.player.coins < total) return { ok: false, reason: 'Koin tidak cukup' };
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
    if (this.s.player.level < R.unlock) return { ok: false, reason: `Terbuka di level ${R.unlock}` };
    const slots = this.craftSlots();
    if (!slots) return { ok: false, reason: 'Bangun Bengkel dulu' };
    if (this.s.craft.queue.length >= slots + 3) return { ok: false, reason: 'Antrean penuh' };
    if (!this.pay(R.in)) return { ok: false, reason: 'Kurang: ' + this.missing(R.in).join(', ') };
    const now = Date.now();
    // jobs run in parallel up to the slot count; extra jobs wait in line
    const running = this.s.craft.queue.slice(0, slots);
    const start = running.length < slots ? now : Math.min(...running.map((q) => q.end));
    this.s.craft.queue.push({ id, start, end: start + R.time * 1000 });
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
          Q[i].end = now + R.time * 1000;
        }
      }
      this.emit('craft');
    }
  }

  upgradeTool() {
    const next = TOOL_TIERS[this.s.player.tool + 1];
    if (!next) return { ok: false, reason: 'Sudah alat terbaik' };
    if (!this.pay(next.cost)) return { ok: false, reason: 'Kurang: ' + this.missing(next.cost).join(', ') };
    this.s.player.tool++;
    this.addXp(40);
    return { ok: true, tool: next };
  }

  // ---------------------------------------------------------------- islands

  islandStatus(id) {
    const B = BIOMES[id];
    if (this.s.islands[id]) return { open: true };
    if (this.s.player.level < B.unlock) return { open: false, reason: `Butuh level ${B.unlock}`, canBuy: false };
    return { open: false, canBuy: this.s.player.coins >= B.cost, cost: B.cost };
  }
  unlockIsland(id) {
    const st = this.islandStatus(id);
    if (st.open) return { ok: true };
    if (!st.canBuy) return { ok: false, reason: st.reason || 'Koin tidak cukup' };
    this.s.player.coins -= BIOMES[id].cost;
    const I = generateIsland(id, this.s.seed + BIOME_KEYS.indexOf(id) * 17);
    I.lastAbs = this.absHour();
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
      if (!b.built) continue;
      const w = workers.get(b.id) || 0;
      if (def.produce && w) {
        const lvl = 1 + 0.5 * ((b.level || 1) - 1);
        for (const [r, rate] of Object.entries(def.produce)) add(r, rate * w * lvl * moodK * (9 / 24) * hours * eff * (bonus[r] || 1));
      }
      if (def.housing) {
        const residents = I.npcs.filter((p) => p.home === b.id).length;
        add('coins', residents * def.tax * 0.3 * moodK * hours * eff * (bonus.coin || 1));
      }
    }
    // people eat three meals a day
    add('food', -I.npcs.length * (3 / 24) * hours);
    const out = {};
    for (const [r, v] of Object.entries(got)) out[r] = Math.round(v);
    if (out.food < 0) {
      this.s.res.food = Math.max(0, this.s.res.food + out.food);
      delete out.food;
    }
    const given = this.give(out, { silent: true });
    return given;
  }

  /** Called when the app comes back after being closed or in the background. */
  applyOffline(seconds) {
    const s = clamp(seconds, 0, OFFLINE_CAP_S);
    if (s < 120) return null;
    const hours = s / SECONDS_PER_GAME_HOUR;
    const total = {};
    for (const [id, I] of Object.entries(this.s.islands)) {
      const got = this.abstractProduce(I, id, hours, OFFLINE_EFF);
      for (const [r, v] of Object.entries(got)) total[r] = (total[r] || 0) + v;
    }
    this.updateCrafting(Date.now());
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
      case 'happy': return [Math.round(Math.max(...Object.values(this.s.islands).map((I) => this.islandHappiness(I)))), g.n];
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
    }
  }
}

export { WALKABLE_BUILDINGS, STEP };
