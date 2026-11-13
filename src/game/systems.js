// v1.2 "Grand Update" systems, mixed into Game:
//   research   a four-branch tech tree with permanent bonuses (real-time, keeps going offline)
//   orders     trade contracts on the Order Board (deliver goods for coins, XP and rare items)
//   missions   three daily missions plus a bonus chest when all are done
//   rating     a 0-5 star rating per island, with first-time rewards and a production bonus
//   fires      buildings can catch fire; the Mayor or a Fire Station puts them out, or they burn down
// All player-visible text is English, like the rest of the game.
import { RES, BUILDINGS, BIOME_KEYS } from './data.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const todayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------- research

export const TECH_BRANCHES = [
  { id: 'farm', name: 'Agriculture', icon: 'food', color: '#7fe08a' },
  { id: 'ind', name: 'Industry', icon: 'tool', color: '#e2a05a' },
  { id: 'com', name: 'Commerce', icon: 'coin', color: '#ffd23d' },
  { id: 'civ', name: 'Civic', icon: 'happy', color: '#86b8e8' },
];

// fx: prod { res | coin | xp | all: +share }, tax, sell, storage, build, orders, regrow, research,
//     craft, consume (share less input), xp, mood (+points), arrivals, fire (share fewer fires),
//     gather (+per swing), offline (+hours of offline earnings)
// time: real seconds at base speed (Research Labs and the Utopia tech make it faster)
export const TECHS = [
  { id: 'farm1', br: 'farm', tier: 1, name: 'Crop Rotation', desc: 'Food production +10%.', lvl: 3, time: 45, cost: { coins: 250, food: 30 }, fx: { prod: { food: 0.1 } } },
  { id: 'farm2', br: 'farm', tier: 2, name: 'Irrigation', desc: 'Food production +15%.', lvl: 5, time: 120, cost: { coins: 700, stone: 40, plank: 15 }, fx: { prod: { food: 0.15 } } },
  { id: 'farm3', br: 'farm', tier: 3, name: 'Forestry', desc: 'Wood production +25% and trees regrow 30% faster.', lvl: 7, time: 200, cost: { coins: 1200, wood: 80, plank: 20 }, fx: { prod: { wood: 0.25 }, regrow: 0.3 } },
  { id: 'farm4', br: 'farm', tier: 4, name: 'Animal Husbandry', desc: 'Food production +20%.', lvl: 10, time: 300, cost: { coins: 2200, food: 120, brick: 30 }, fx: { prod: { food: 0.2 } } },
  { id: 'farm5', br: 'farm', tier: 5, name: 'Golden Harvest', desc: 'Food +25% and wood +15%.', lvl: 15, time: 480, cost: { coins: 4500, food: 200, tool: 8 }, fx: { prod: { food: 0.25, wood: 0.15 } } },

  { id: 'ind1', br: 'ind', tier: 1, name: 'Sharper Tools', desc: 'The Mayor gathers +1 per swing.', lvl: 3, time: 50, cost: { coins: 300, stone: 30, wood: 30 }, fx: { gather: 1 } },
  { id: 'ind2', br: 'ind', tier: 2, name: 'Masonry', desc: 'Stone +20% and bricks +15%.', lvl: 5, time: 130, cost: { coins: 800, stone: 60 }, fx: { prod: { stone: 0.2, brick: 0.15 } } },
  { id: 'ind3', br: 'ind', tier: 3, name: 'Efficient Furnaces', desc: 'Sawmills, kilns, glassworks and bakeries use 20% less input. Glass +15%.', lvl: 8, time: 220, cost: { coins: 1500, brick: 30, plank: 20 }, fx: { consume: 0.2, prod: { glass: 0.15 } } },
  { id: 'ind4', br: 'ind', tier: 4, name: 'Master Smithing', desc: 'Crafting is 30% faster and ore +20%.', lvl: 11, time: 320, cost: { coins: 2600, tool: 6, ore: 40 }, fx: { craft: 0.3, prod: { ore: 0.2 } } },
  { id: 'ind5', br: 'ind', tier: 5, name: 'Steam Power', desc: 'All production +10%.', lvl: 16, time: 500, cost: { coins: 5000, tool: 12, glass: 30 }, fx: { prod: { all: 0.1 } } },

  { id: 'com1', br: 'com', tier: 1, name: 'Bookkeeping', desc: 'Home taxes +15%.', lvl: 3, time: 50, cost: { coins: 350 }, fx: { tax: 0.15 } },
  { id: 'com2', br: 'com', tier: 2, name: 'Trade Routes', desc: 'Market prices +10% and trade orders pay 15% more.', lvl: 6, time: 140, cost: { coins: 900, plank: 20 }, fx: { sell: 0.1, orders: 0.15 } },
  { id: 'com3', br: 'com', tier: 3, name: 'Grand Warehouses', desc: 'Storage capacity +30%.', lvl: 8, time: 220, cost: { coins: 1600, brick: 30, plank: 30 }, fx: { storage: 0.3 } },
  { id: 'com4', br: 'com', tier: 4, name: 'Banking', desc: 'Home taxes +20% and offline earnings last 4 hours longer.', lvl: 12, time: 340, cost: { coins: 3000, glass: 20, brick: 30 }, fx: { tax: 0.2, offline: 4 } },
  { id: 'com5', br: 'com', tier: 5, name: 'Golden Age', desc: 'Coin income +15%, market prices +10%, orders pay 20% more.', lvl: 17, time: 520, cost: { coins: 6000, crystal: 10, tool: 10 }, fx: { prod: { coin: 0.15 }, sell: 0.1, orders: 0.2 } },

  { id: 'civ1', br: 'civ', tier: 1, name: 'Town Planning', desc: 'Construction is 35% faster.', lvl: 2, time: 40, cost: { coins: 200, wood: 30 }, fx: { build: 0.35 } },
  { id: 'civ2', br: 'civ', tier: 2, name: 'Public Health', desc: 'Villagers are happier (+4 mood).', lvl: 5, time: 120, cost: { coins: 700, food: 50, glass: 5 }, fx: { mood: 4 } },
  { id: 'civ3', br: 'civ', tier: 3, name: 'Fire Brigade', desc: 'Half as many fires, and they spread more slowly.', lvl: 7, time: 180, cost: { coins: 1100, brick: 15, tool: 3 }, fx: { fire: 0.5 } },
  { id: 'civ4', br: 'civ', tier: 4, name: 'Culture & Arts', desc: '+4 mood and 30% more newcomers.', lvl: 10, time: 300, cost: { coins: 2400, glass: 15, plank: 30 }, fx: { mood: 4, arrivals: 0.3 } },
  { id: 'civ5', br: 'civ', tier: 5, name: 'Utopia', desc: '+6 mood, XP from schools +25%, research 25% faster.', lvl: 18, time: 600, cost: { coins: 7000, essence: 3, crystal: 15 }, fx: { mood: 6, prod: { xp: 0.25 }, research: 0.25 } },
];
export const TECH_BY_ID = Object.fromEntries(TECHS.map((t) => [t.id, t]));
const techReq = (t) => TECHS.find((x) => x.br === t.br && x.tier === t.tier - 1);

// ---------------------------------------------------------------- orders

export const ORDER_CLIENTS = [
  { name: 'Captain Hale', icon: 'compass', line: 'My ship sails at dawn. Can you fill the hold?' },
  { name: "Rosa's Bakery", icon: 'food', line: 'The ovens are hungry, Mayor!' },
  { name: 'The Royal Court', icon: 'crown', line: 'His Majesty requests the finest goods.' },
  { name: 'Mountain Guild', icon: 'ore', line: 'We are building a new hall up north.' },
  { name: 'Harbor Traders', icon: 'fish', line: 'Good prices, fair deals, fast ships.' },
  { name: 'Festival Committee', icon: 'festival', line: 'The big fair needs supplies!' },
  { name: 'Wandering Scholar', icon: 'xp', line: 'For my research, if you would be so kind.' },
  { name: 'City Builders', icon: 'build', line: 'Skyscrapers do not build themselves.' },
  { name: 'Lighthouse Keeper', icon: 'lantern', line: 'A long winter is coming. Help me prepare.' },
  { name: 'Grandma Ellie', icon: 'heart', line: 'Just a little something for my grandchildren.' },
];
const ORDER_CD = 45 * 1000; // after a delivery, ms
const ORDER_SKIP_CD = 90 * 1000;
export const ORDERS_UNLOCK = 4;

// ---------------------------------------------------------------- missions

export const MISSION_POOL = [
  { id: 'gather', stat: 'gathered', icon: 'wood', n: (l) => 10 + l, text: (n) => `Gather resources ${n} times` },
  { id: 'craft', stat: 'crafted', icon: 'craft', min: 2, n: (l) => 3 + Math.floor(l / 3), text: (n) => `Craft ${n} items` },
  { id: 'sell', stat: 'sold', icon: 'market', min: 3, n: (l) => 20 + l * 3, text: (n) => `Sell ${n} goods at the Market` },
  { id: 'build', stat: 'built', icon: 'build', n: (l) => 2 + Math.floor(l / 8), text: (n) => `Build ${n} buildings` },
  { id: 'talk', stat: 'talked', icon: 'chat', n: () => 3, text: (n) => `Chat with ${n} villagers` },
  { id: 'orders', stat: 'orders', icon: 'order', min: ORDERS_UNLOCK, n: (l) => 2 + Math.floor(l / 10), text: (n) => `Deliver ${n} trade orders` },
  { id: 'upgrade', stat: 'upgrades', icon: 'up', min: 3, n: (l) => 1 + Math.floor(l / 12), text: (n) => `Upgrade ${n} building${n > 1 ? 's' : ''}` },
  { id: 'gift', stat: 'gifts', icon: 'gift', n: () => 2, text: (n) => `Give ${n} gifts to villagers` },
  { id: 'research', stat: 'researched', icon: 'research', min: 3, n: () => 1, text: () => 'Finish a research project' },
];

// ---------------------------------------------------------------- rating

export const STAR_AT = [30, 80, 140, 200, 250];

// ---------------------------------------------------------------- fires

const FIRE_GROW = 0.35; // intensity per game hour
const FIRE_SPREAD_H = 2.5;
const FIRE_RUIN_H = 5;
export const FIRE_STATION_R = 6;

// ---------------------------------------------------------------- mixin

export const SystemsMixin = {
  /** Fill in state for the new systems (new games and older saves). */
  initSystems() {
    const s = this.s;
    s.research ||= { done: [], cur: null };
    s.research.done ||= [];
    s.orders ||= { slots: [], seq: 1 };
    s.missions ||= { day: '', list: [], bonus: 0 };
    for (const k of ['orders', 'researched', 'fires', 'missions', 'stars', 'repairs'])
      s.stats[k] ??= 0;
    for (const I of Object.values(s.islands)) {
      I.fires ||= [];
      I.starBest ??= 0;
    }
    this._tfx = null;
    this.refreshOrders();
    this.refreshMissions();
  },

  // ---------------- research

  /** Sum of every finished tech's effects (cached). */
  techFx() {
    if (this._tfx) return this._tfx;
    const out = { prod: {} };
    for (const id of this.s.research?.done || []) {
      const t = TECH_BY_ID[id];
      if (!t) continue;
      for (const [k, v] of Object.entries(t.fx)) {
        if (k === 'prod') for (const [r, x] of Object.entries(v)) out.prod[r] = (out.prod[r] || 0) + x;
        else out[k] = (out[k] || 0) + v;
      }
    }
    this.projectFx?.(out);
    this._tfx = out;
    return out;
  },
  /** Multiplier on production of res ('coin' for coins) from research. */
  techMult(res) {
    const p = this.techFx().prod;
    return 1 + (p[res] || 0) + (res === 'xp' ? 0 : p.all || 0);
  },
  labCount() {
    let n = 0;
    for (const I of Object.values(this.s.islands)) for (const b of I.buildings) if (b.type === 'lab' && b.built && !b.ruin) n++;
    return Math.min(3, n);
  },
  researchSpeed() {
    return 1 + 0.2 * this.labCount() + (this.techFx().research || 0);
  },
  techStatus(id) {
    const t = TECH_BY_ID[id];
    const R = this.s.research;
    if (R.done.includes(id)) return { state: 'done' };
    if (R.cur?.id === id) return { state: 'cur' };
    const req = techReq(t);
    if (req && !R.done.includes(req.id)) return { state: 'locked', reason: `Needs ${req.name}` };
    if (this.s.player.level < t.lvl) return { state: 'locked', reason: `Needs level ${t.lvl}` };
    return { state: 'open', busy: !!R.cur };
  },
  startResearch(id) {
    const t = TECH_BY_ID[id];
    if (!t) return { ok: false, reason: 'Unknown research' };
    const st = this.techStatus(id);
    if (st.state === 'done') return { ok: false, reason: 'Already researched' };
    if (st.state === 'locked') return { ok: false, reason: st.reason };
    if (this.s.research.cur) return { ok: false, reason: 'Already researching something' };
    if (!this.pay(t.cost)) return { ok: false, reason: 'Need: ' + this.missing(t.cost).join(', ') };
    const now = Date.now();
    this.s.research.cur = { id, start: now, end: now + (t.time * 1000) / this.researchSpeed() };
    this.emit('research:start', t);
    return { ok: true };
  },
  researchLeft(now = Date.now()) {
    const c = this.s.research.cur;
    return c ? Math.max(0, (c.end - now) / 1000) : 0;
  },
  rushCost(now = Date.now()) {
    return Math.max(1, Math.ceil(this.researchLeft(now) / 60));
  },
  /** Rewarded ad: halves the time left on the running research (once per project). */
  adSpeedResearch() {
    const c = this.s.research.cur;
    if (!c || c.ad) return { ok: false };
    const now = Date.now();
    c.ad = 1;
    c.end = now + Math.max(0, (c.end - now) / 2);
    this.updateResearch();
    return { ok: true };
  },
  rushResearch() {
    const c = this.s.research.cur;
    if (!c) return { ok: false };
    const n = this.rushCost();
    if (!this.pay({ crystal: n })) return { ok: false, reason: `Need ${n} Crystal` };
    c.end = Date.now();
    this.updateResearch();
    return { ok: true };
  },
  updateResearch(now = Date.now()) {
    const c = this.s.research?.cur;
    if (!c || now < c.end) return;
    const t = TECH_BY_ID[c.id];
    this.s.research.cur = null;
    if (!t) return;
    this.s.research.done.push(t.id);
    this.s.stats.researched++;
    this._tfx = null;
    this.addXp(30 + t.tier * 25);
    this.computeHappyMap?.();
    this.emit('research:done', t);
    this.emit('res');
  },

  // ---------------- orders

  ordersUnlocked() {
    return this.s.player.level >= ORDERS_UNLOCK;
  },
  hasHarbor() {
    return Object.values(this.s.islands).some((I) => I.buildings.some((b) => b.type === 'pelabuhan' && b.built && !b.ruin));
  },
  orderSlots() {
    return 3 + (this.hasHarbor() ? 1 : 0) + (this.s.player.level >= 15 ? 1 : 0);
  },
  /** Resources the player can reasonably produce at this point. */
  _orderPool() {
    const l = this.s.player.level, r = this.s.res, isl = this.s.islands;
    const pool = ['wood', 'stone', 'food'];
    if (l >= 3) pool.push('plank');
    if (l >= 4) pool.push('brick');
    if (isl.pantai || isl.gurun || r.sand > 0) pool.push('sand');
    if (l >= 6) pool.push('ore');
    if (l >= 8 || r.glass > 0) pool.push('glass');
    if (l >= 7) pool.push('tool');
    if (isl.fantasi || r.crystal > 5) pool.push('crystal');
    if (l >= 18) pool.push('essence');
    return pool;
  },
  genOrder() {
    const l = this.s.player.level;
    const pool = this._orderPool();
    let k = 1 + (l >= 5 && Math.random() < 0.55 ? 1 : 0) + (l >= 10 && Math.random() < 0.4 ? 1 : 0);
    k = Math.min(k, pool.length);
    const value = (70 + l * 38) * (0.7 + Math.random() * 0.6);
    const need = {};
    const left = [...pool];
    for (let n = 0; n < k; n++) {
      const res = left.splice(Math.floor(Math.random() * left.length), 1)[0];
      let n = Math.max(2, Math.round(value / k / RES[res].price));
      // rare goods come in small numbers
      if (res === 'tool') n = Math.min(n, 2 + Math.floor(l / 3));
      if (res === 'crystal') n = Math.min(n, 1 + Math.floor(l / 4));
      if (res === 'essence') n = Math.min(n, 1 + Math.floor(l / 12));
      need[res] = n;
    }
    const worth = Object.entries(need).reduce((a, [r, n]) => a + n * RES[r].price, 0);
    const mult = (1 + (this.techFx().orders || 0)) * (this.hasHarbor() ? 1.25 : 1);
    const reward = { coins: Math.round(worth * 1.7 * mult), xp: Math.round(12 + worth / 5) };
    const roll = Math.random();
    if (l >= 18 && roll < 0.08) reward.essence = 1;
    else if (l >= 10 && roll < 0.22) reward.crystal = 1 + Math.floor(Math.random() * 3);
    else if (l >= 6 && roll < 0.35) reward.tool = 1 + Math.floor(Math.random() * 2);
    // a client who is not already waiting at the board
    const busy = new Set(this.s.orders.slots.filter((sl) => sl.o).map((sl) => sl.o.client));
    const free = ORDER_CLIENTS.map((_, i) => i).filter((i) => !busy.has(i));
    const client = pick(free.length ? free : ORDER_CLIENTS.map((_, i) => i));
    return { id: this.s.orders.seq++, need, reward, client };
  },
  refreshOrders(now = Date.now()) {
    const O = this.s.orders;
    if (!this.ordersUnlocked()) return;
    const n = this.orderSlots();
    while (O.slots.length < n) O.slots.push({ o: null, ready: 0 });
    let changed = false;
    for (const sl of O.slots)
      if (!sl.o && now >= (sl.ready || 0)) {
        sl.o = this.genOrder();
        changed = true;
      }
    if (changed) this.emit('orders');
  },
  readyOrders() {
    if (!this.ordersUnlocked()) return 0;
    return this.s.orders.slots.filter((sl) => sl.o && this.has(sl.o.need)).length;
  },
  deliverOrder(i) {
    const sl = this.s.orders.slots[i];
    if (!sl?.o) return { ok: false };
    if (!this.pay(sl.o.need)) return { ok: false, reason: 'Need: ' + this.missing(sl.o.need).join(', ') };
    const o = sl.o;
    const got = this.give(o.reward);
    if (o.reward.xp) got.xp = o.reward.xp;
    sl.o = null;
    sl.ready = Date.now() + ORDER_CD;
    this.s.stats.orders++;
    this.emit('order:done', { o, got });
    return { ok: true, got, o };
  },
  skipOrder(i) {
    const sl = this.s.orders.slots[i];
    if (!sl?.o) return false;
    sl.o = null;
    sl.ready = Date.now() + ORDER_SKIP_CD;
    return true;
  },

  // ---------------- daily missions

  refreshMissions() {
    const M = this.s.missions;
    const today = todayStr();
    if (M.day === today && M.list.length) return;
    const l = this.s.player.level;
    const pool = MISSION_POOL.filter((m) => !m.min || l >= m.min);
    const list = [];
    const left = [...pool];
    while (list.length < 3 && left.length) {
      const m = left.splice(Math.floor(Math.random() * left.length), 1)[0];
      const n = Math.max(1, Math.round(m.n(l)));
      const extra = pick(['wood', 'stone', 'plank', 'brick', l >= 8 ? 'glass' : 'food', l >= 8 ? 'tool' : 'food']);
      const reward = { coins: 60 + l * 25, xp: 30 + l * 8, [extra]: Math.max(2, Math.round((6 + l) * (extra === 'tool' ? 0.25 : 1))) };
      list.push({ id: m.id, stat: m.stat, n, base: this.s.stats[m.stat] || 0, reward, claimed: 0 });
    }
    this.s.missions = { day: today, list, bonus: 0 };
    this.emit('missions');
  },
  missionProgress(m) {
    return clamp((this.s.stats[m.stat] || 0) - m.base, 0, m.n);
  },
  missionDef(m) {
    return MISSION_POOL.find((x) => x.id === m.id);
  },
  claimMission(i) {
    const m = this.s.missions.list[i];
    if (!m || m.claimed || this.missionProgress(m) < m.n) return null;
    m.claimed = 1;
    const got = this.give(m.reward);
    if (m.reward.xp) got.xp = m.reward.xp;
    this.s.stats.missions++;
    return got;
  },
  missionBonusReward() {
    const l = this.s.player.level;
    const r = { coins: 200 + l * 60, xp: 100 + l * 10 };
    if (l >= 6) r.tool = 2;
    if (l >= 8) r.crystal = 2;
    return r;
  },
  canClaimMissionBonus() {
    const M = this.s.missions;
    return !M.bonus && M.list.length > 0 && M.list.every((m) => m.claimed);
  },
  claimMissionBonus() {
    if (!this.canClaimMissionBonus()) return null;
    this.s.missions.bonus = 1;
    const r = this.missionBonusReward();
    const got = this.give(r);
    got.xp = r.xp;
    this.s.stats.chests++;
    return got;
  },
  claimableMissions() {
    const M = this.s.missions;
    return M.list.filter((m) => !m.claimed && this.missionProgress(m) >= m.n).length + (this.canClaimMissionBonus() ? 1 : 0);
  },

  // ---------------- island rating

  islandScore(I = this.I) {
    const built = I.buildings.filter((b) => b.built && !b.ruin);
    const types = new Set(built.map((b) => b.type));
    let beauty = 0, services = 0, landmark = 0;
    for (const b of built) {
      const d = BUILDINGS[b.type];
      if ((d.cat === 'deco' || d.cat === 'special') && d.happy) beauty += d.happy.amount * (1 + 0.25 * ((b.level || 1) - 1));
      if (d.cat === 'service') services++;
      if (d.landmark) landmark = 1;
    }
    const happy = this.islandHappiness(I);
    const parts = [
      { k: 'pop', name: 'Population', icon: 'pop', v: Math.min(60, I.npcs.length * 3), max: 60 },
      { k: 'happy', name: 'Happiness', icon: 'happy', v: Math.round(clamp((happy - 40) * 1.25, 0, 50)), max: 50 },
      { k: 'variety', name: 'Variety', icon: 'build', v: Math.min(60, types.size * 3), max: 60 },
      { k: 'beauty', name: 'Beauty', icon: 'flower', v: Math.round(Math.min(50, beauty * 0.6)), max: 50 },
      { k: 'services', name: 'Services', icon: 'work', v: Math.min(30, services * 4), max: 30 },
      { k: 'landmark', name: 'Landmark', icon: 'crown', v: landmark * 30, max: 30 },
    ];
    const score = parts.reduce((a, p) => a + p.v, 0);
    let stars = 0;
    while (stars < 5 && score >= STAR_AT[stars]) stars++;
    return { score, stars, parts, next: STAR_AT[stars] ?? null };
  },
  starReward(id, star) {
    const k = 1 + BIOME_KEYS.indexOf(id) * 0.5;
    const r = { coins: Math.round(150 * star * k), xp: 40 * star };
    if (star >= 3) r.tool = star - 1;
    if (star >= 4) r.crystal = star === 5 ? 5 : 2;
    return r;
  },
  /** Current island's stars give +3% production each. */
  starMult() {
    return 1 + 0.03 * (this.I?.stars || 0);
  },
  checkRatings() {
    for (const [id, I] of Object.entries(this.s.islands)) {
      if (id !== this.biome && I.stars !== undefined) continue;
      const { stars } = this.islandScore(I);
      I.stars = stars;
      if (stars > (I.starBest || 0)) {
        const reward = {};
        for (let n = (I.starBest || 0) + 1; n <= stars; n++) for (const [k, v] of Object.entries(this.starReward(id, n))) reward[k] = (reward[k] || 0) + v;
        I.starBest = stars;
        this.s.stats.stars = Object.values(this.s.islands).reduce((a, x) => a + (x.starBest || 0), 0);
        const got = this.give(reward, { silent: true });
        if (reward.xp) got.xp = reward.xp;
        this.emit('stars', { id, stars, got });
      }
    }
  },

  // ---------------- fires

  fireOf(rec, I = this.I) {
    return I.fires?.find((f) => f.bid === rec.id) || null;
  },
  fireCovered(b, I = this.I) {
    return I.buildings.some((w) => w.type === 'pemadam' && w.built && !w.ruin && w !== b && Math.hypot(w.i - b.i, w.j - b.j) <= FIRE_STATION_R);
  },
  canBurn(b) {
    const d = BUILDINGS[b.type];
    return b.built && !b.ruin && !d.fixed && !d.small && d.cat !== 'deco' && b.type !== 'pemadam' && b.type !== 'sumur';
  },
  /** Start a fire (random building if rec is not given). Also handy for testing. */
  igniteFire(rec = null) {
    const I = this.I;
    I.fires ||= [];
    if (!rec) {
      const cand = I.buildings.filter((b) => this.canBurn(b) && !this.fireOf(b));
      if (!cand.length) return null;
      rec = pick(cand);
    }
    if (this.fireOf(rec) || !this.canBurn(rec)) return null;
    const f = { bid: rec.id, t: 0, hp: 0.35, spread: 0 };
    I.fires.push(f);
    rec.fire = 1;
    this.emit('fire:start', { rec, f });
    return f;
  },
  _fireChance() {
    const I = this.I;
    const l = this.s.player.level;
    if (l < 4 || I.buildings.filter((b) => b.built).length < 6) return 0;
    const season = { spring: 0.8, summer: 1.8, autumn: 1.2, winter: 0.6 }[this.season()] || 1;
    const w = { storm: 2.2, rain: 0.35, snow: 0.3, fog: 0.8 }[this.weatherName()] ?? 1;
    const ev = this.s.event?.island === this.biome ? this.s.event.id : null;
    const evK = ev === 'drought' || ev === 'heatwave' ? 2.5 : 1;
    return 0.018 * season * w * evK * (1 - (this.techFx().fire || 0));
  },
  fireHourly() {
    const I = this.I;
    I.fires ||= [];
    if (I.fires.length >= 2) return;
    if (Math.random() >= this._fireChance()) return;
    const cand = I.buildings.filter((b) => this.canBurn(b) && !this.fireOf(b));
    if (!cand.length) return;
    const rec = pick(cand);
    // a Fire Station nearby makes fires much rarer
    if (this.fireCovered(rec) && Math.random() < 0.6) return;
    this.igniteFire(rec);
  },
  fireTick(dtH) {
    const I = this.I;
    if (!I.fires?.length) return;
    const slow = 1 - (this.techFx().fire || 0) * 0.5;
    for (const f of [...I.fires]) {
      const rec = this.buildingById(f.bid);
      if (!rec) {
        I.fires = I.fires.filter((x) => x !== f);
        continue;
      }
      f.t += dtH;
      // the crew of a nearby Fire Station arrives after half an hour and hoses it down
      f.crew = this.fireCovered(rec) && f.t > 0.5 ? 1 : 0;
      if (f.crew) f.hp -= dtH * 1.6;
      else f.hp = Math.min(1, f.hp + dtH * FIRE_GROW * slow);
      if (f.hp <= 0) {
        this.extinguish(f, 'crew');
        continue;
      }
      if (!f.spread && f.t > FIRE_SPREAD_H / slow) {
        f.spread = 1;
        const near = I.buildings
          .filter((b) => b !== rec && this.canBurn(b) && !this.fireOf(b) && Math.hypot(b.i - rec.i, b.j - rec.j) <= 3)
          .sort((a, b) => Math.hypot(a.i - rec.i, a.j - rec.j) - Math.hypot(b.i - rec.i, b.j - rec.j))[0];
        if (near && Math.random() < 0.7) {
          this.igniteFire(near);
          this.emit('toast', { text: `The fire spread to the ${BUILDINGS[near.type].name}!`, kind: 'warn', icon: 'fire' });
        }
      }
      if (f.t > FIRE_RUIN_H / slow) {
        I.fires = I.fires.filter((x) => x !== f);
        rec.fire = 0;
        rec.ruin = 1;
        this.computeHappyMap();
        this.assignHomes(I);
        this.assignJobs(I);
        this.emit('fire:ruin', { rec });
        this.emit('building:update', rec);
      }
    }
  },
  /** The Mayor's bucket: amount of intensity removed. Returns the reward when the fire is out. */
  douse(bid, amount) {
    const f = this.I.fires?.find((x) => x.bid === bid);
    if (!f) return null;
    f.hp -= amount;
    if (f.hp > 0) return { left: f.hp };
    return this.extinguish(f, 'mayor');
  },
  extinguish(f, by) {
    const I = this.I;
    I.fires = I.fires.filter((x) => x !== f);
    const rec = this.buildingById(f.bid);
    if (rec) rec.fire = 0;
    this.s.stats.fires++;
    let got = null;
    if (by === 'mayor') {
      const l = this.s.player.level;
      got = this.give({ coins: 40 + l * 15 });
      this.addXp(25 + l * 2);
      got.xp = 25 + l * 2;
      for (const p of I.npcs) p.mood = clamp(p.mood + 3, 0, 100);
    }
    this.emit('fire:out', { rec, by, got });
    return { out: true, got };
  },
  repairCost(rec) {
    const out = {};
    for (const [k, v] of Object.entries(BUILDINGS[rec.type].cost)) out[k] = Math.ceil(v * 0.4);
    return out;
  },
  repair(rec) {
    if (!rec.ruin) return { ok: false };
    const cost = this.repairCost(rec);
    if (!this.pay(cost)) return { ok: false, reason: 'Need: ' + this.missing(cost).join(', ') };
    rec.ruin = 0;
    rec.built = 0;
    rec.progress = 0.4;
    this.s.stats.repairs++;
    this.addXp(10);
    this.emit('building:update', rec);
    return { ok: true };
  },

  // ---------------- bank interest

  bankInterest() {
    let pay = 0;
    for (const I of Object.values(this.s.islands))
      for (const b of I.buildings) if (b.type === 'bank' && b.built && !b.ruin) pay += Math.min(300 * (b.level || 1), this.s.player.coins * 0.01);
    pay = Math.round(pay);
    if (pay > 0) {
      this.give({ coins: pay }, { silent: true });
      this.emit('toast', { text: `The Bank paid ${pay} coins of interest`, icon: 'coin' });
    }
  },

  /** Real-time bookkeeping for the new systems (called from Game.update). */
  updateSystems(now = Date.now()) {
    this.updateResearch(now);
    this.refreshOrders(now);
    this.refreshMissions();
  },
};
