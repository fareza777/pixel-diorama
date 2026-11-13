// v1.3 systems, mixed into Game:
//   relief     early-game safety net: neighbours send food when a young town runs out
//   projects   island-wide Grand Projects, three costly stages each with permanent bonuses (late-game coin sink)
//   voyages    the Harbor sends a merchant ship to another island; it returns with coins and that island's goods
//   skills     villagers get better at their job the longer they work (up to 5 stars)
// Project bonuses use the same fx keys as research (see TECHS in systems.js) plus `hazard`
// (share of bad biome hazards that never happen). All player-visible text is English.
import { RES, BIOMES } from './data.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------- relief

const RELIEF_MAX_LEVEL = 8;
const FOOD_BUILDINGS = ['ladang', 'nelayan', 'kebun', 'peternakan', 'roti'];

// ---------------------------------------------------------------- projects

export const PROJECTS_UNLOCK = 8;
export const PROJECTS = [
  {
    id: 'bridge', name: 'Great Bridge', icon: 'road',
    desc: 'A stone bridge for the trade carts. Orders pay more and market prices rise.',
    stages: [
      { cost: { coins: 3000, stone: 150, plank: 60 }, fx: { orders: 0.08, sell: 0.04 } },
      { cost: { coins: 9000, brick: 120, tool: 12 }, fx: { orders: 0.1, sell: 0.05 } },
      { cost: { coins: 24000, brick: 200, glass: 60, tool: 25 }, fx: { orders: 0.12, sell: 0.06 } },
    ],
  },
  {
    id: 'aqueduct', name: 'Aqueduct', icon: 'rain',
    desc: 'Arches that carry fresh water to every field. More food and happier villagers.',
    stages: [
      { cost: { coins: 2500, stone: 200, brick: 30 }, fx: { prod: { food: 0.08 }, mood: 1 } },
      { cost: { coins: 8000, brick: 140, glass: 20 }, fx: { prod: { food: 0.1 }, mood: 1 } },
      { cost: { coins: 22000, brick: 220, tool: 20 }, fx: { prod: { food: 0.12 }, mood: 2 } },
    ],
  },
  {
    id: 'academy', name: 'Grand Academy', icon: 'research',
    desc: 'A hall of learning for every island. Research and XP get faster.',
    stages: [
      { cost: { coins: 4000, plank: 80, glass: 20 }, fx: { research: 0.1, prod: { xp: 0.05 } } },
      { cost: { coins: 11000, brick: 100, glass: 50 }, fx: { research: 0.12, prod: { xp: 0.08 } } },
      { cost: { coins: 28000, glass: 90, crystal: 20, tool: 20 }, fx: { research: 0.15, prod: { xp: 0.1 } } },
    ],
  },
  {
    id: 'warehouse', name: 'Warehouse District', icon: 'storage',
    desc: 'Rows of sturdy warehouses by the docks. Much more storage for everything.',
    stages: [
      { cost: { coins: 3500, plank: 120, brick: 40 }, fx: { storage: 0.2 } },
      { cost: { coins: 9500, brick: 150, tool: 10 }, fx: { storage: 0.25 } },
      { cost: { coins: 26000, brick: 240, glass: 40, tool: 20 }, fx: { storage: 0.3 } },
    ],
  },
  {
    id: 'shield', name: 'Island Defences', icon: 'wave',
    desc: 'Sea walls, drainage and firebreaks across all islands. Fewer floods, rockslides, sandstorms and fires.',
    stages: [
      { cost: { coins: 3000, stone: 250, wood: 100 }, fx: { hazard: 0.15, fire: 0.1 } },
      { cost: { coins: 9000, stone: 300, brick: 100 }, fx: { hazard: 0.15, fire: 0.1 } },
      { cost: { coins: 23000, brick: 200, tool: 25 }, fx: { hazard: 0.2, fire: 0.1 } },
    ],
  },
];
export const PROJECT_BY_ID = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));

// ---------------------------------------------------------------- voyages

// what each island sends back with a returning ship (per 10 cargo)
export const ISLAND_GOODS = {
  desa: { food: 6, wood: 3 }, hutan: { wood: 6, food: 2 }, pantai: { food: 5, sand: 4 }, gunung: { ore: 4, stone: 4 },
  gurun: { sand: 5, glass: 1 }, kota: { tool: 1, brick: 3 }, fantasi: { crystal: 2, essence: 0.2 },
};
const VOYAGE_PAY = 1.6; // coins: cargo market value x this
const VOYAGE_MIN = 20, VOYAGE_MAX = 200;
export const voyageCargo = () => ['food', 'wood', 'stone', 'plank', 'brick', 'glass', 'ore', 'tool', 'sand'];

// ---------------------------------------------------------------- skills

export const SKILL_MAX = 5;
const SKILL_HOURS = [0, 8, 24, 56, 110, 200]; // work hours needed for each star
const SKILL_BONUS = 0.06; // production per star

export const FrontierMixin = {
  initFrontier() {
    const s = this.s;
    s.relief ||= { day: 0, n: 0 };
    s.projects ||= {};
    s.voyages ||= [];
    for (const k of ['projects', 'voyages', 'relief']) s.stats[k] ??= 0;
  },

  // ---------------- relief

  /** Morning check: a hungry young town with no food buildings gets a care package once a day. */
  reliefHourly() {
    const s = this.s, I = this.I, T = s.time;
    if (Math.floor(T.hour) !== 7 || s.relief.day === T.day) return;
    if (s.player.level >= RELIEF_MAX_LEVEL || !I.npcs.length) return;
    const pop = I.npcs.length;
    const hasFood = I.buildings.some((b) => FOOD_BUILDINGS.includes(b.type) && b.built && !b.ruin);
    const gift = {};
    if (s.res.food < pop * 2 && !hasFood) gift.food = Math.max(20, pop * 6);
    if (s.res.wood < 10 && s.res.stone < 5) gift.wood = 20;
    if (!Object.keys(gift).length) return;
    s.relief = { day: T.day, n: (s.relief.n || 0) + 1 };
    s.stats.relief++;
    const got = this.give(gift);
    this.emit('relief', { got, needFarm: !hasFood });
  },

  // ---------------- projects

  projectsUnlocked() {
    return this.s.player.level >= PROJECTS_UNLOCK;
  },
  projectStage(id) {
    return this.s.projects[id] || 0;
  },
  /** Sum of the bonuses of every finished project stage (merged into techFx). */
  projectFx(out) {
    for (const [id, n] of Object.entries(this.s.projects || {})) {
      const P = PROJECT_BY_ID[id];
      if (!P) continue;
      for (let k = 0; k < Math.min(n, P.stages.length); k++) {
        for (const [key, v] of Object.entries(P.stages[k].fx)) {
          if (key === 'prod') for (const [r, x] of Object.entries(v)) out.prod[r] = (out.prod[r] || 0) + x;
          else out[key] = (out[key] || 0) + v;
        }
      }
    }
    return out;
  },
  buildProject(id) {
    const P = PROJECT_BY_ID[id];
    if (!P) return { ok: false, reason: 'Unknown project' };
    if (!this.projectsUnlocked()) return { ok: false, reason: `Unlocks at level ${PROJECTS_UNLOCK}` };
    const n = this.projectStage(id);
    if (n >= P.stages.length) return { ok: false, reason: 'Already complete' };
    const st = P.stages[n];
    if (!this.pay(st.cost)) return { ok: false, reason: 'Need: ' + this.missing(st.cost).join(', ') };
    this.s.projects = { ...this.s.projects, [id]: n + 1 };
    this.s.stats.projects++;
    this._tfx = null;
    this.addXp(150 * (n + 1));
    this.emit('project', { P, stage: n + 1, done: n + 1 >= P.stages.length });
    return { ok: true, stage: n + 1 };
  },

  // ---------------- voyages

  harborIslands() {
    return Object.entries(this.s.islands)
      .filter(([, I]) => I.buildings.some((b) => b.type === 'pelabuhan' && b.built && !b.ruin))
      .map(([k]) => k);
  },
  voyageFrom(from) {
    return this.s.voyages.find((v) => v.from === from) || null;
  },
  /** Destinations: every other unlocked island. Voyage time grows with the island's tier. */
  voyageDests(from) {
    return Object.keys(this.s.islands).filter((k) => k !== from);
  },
  voyageMinutes(to) {
    const order = Object.keys(BIOMES);
    return 4 + 2 * Math.max(0, order.indexOf(to));
  },
  /** What a voyage would bring back (coins and the destination's goods). */
  voyageReturn(to, r, n) {
    const coins = Math.round(RES[r].price * n * VOYAGE_PAY * (1 + (this.techFx().orders || 0)));
    const goods = {};
    for (const [g, per10] of Object.entries(ISLAND_GOODS[to] || {})) {
      const amt = Math.floor((per10 * n) / 10);
      if (amt > 0) goods[g] = amt;
    }
    return { coins, ...goods };
  },
  startVoyage(from, to, r, n) {
    n = Math.floor(clamp(n, VOYAGE_MIN, VOYAGE_MAX));
    if (!this.harborIslands().includes(from)) return { ok: false, reason: 'Build a Harbor first' };
    if (!this.s.islands[to] || to === from) return { ok: false, reason: 'Pick another island' };
    if (this.voyageFrom(from)) return { ok: false, reason: 'The ship is already at sea' };
    if (!voyageCargo().includes(r)) return { ok: false, reason: 'That cargo cannot be shipped' };
    if (!this.pay({ [r]: n })) return { ok: false, reason: `Need ${n} ${RES[r].name}` };
    const now = Date.now();
    const ret = this.voyageReturn(to, r, n);
    this.s.voyages = [...this.s.voyages, { from, to, r, n, start: now, end: now + this.voyageMinutes(to) * 60000, ret }];
    this.emit('voyage:start', { from, to });
    return { ok: true };
  },
  voyageReady(v, now = Date.now()) {
    return now >= v.end;
  },
  claimVoyage(from) {
    const v = this.voyageFrom(from);
    if (!v || !this.voyageReady(v)) return null;
    this.s.voyages = this.s.voyages.filter((x) => x !== v);
    this.s.stats.voyages++;
    const got = this.give(v.ret);
    this.addXp(25 + Math.round(v.n / 4));
    this.emit('voyage:back', { v, got });
    return got;
  },
  readyVoyages(now = Date.now()) {
    return this.s.voyages.filter((v) => this.voyageReady(v, now)).length;
  },

  // ---------------- skills

  skillOf(p) {
    const h = p.wx || 0;
    let n = 0;
    while (n < SKILL_MAX && h >= SKILL_HOURS[n + 1]) n++;
    return n;
  },
  /** Called while a villager works: adds work hours and reports a new star. */
  trainNpc(p, dtH) {
    const before = this.skillOf(p);
    p.wx = (p.wx || 0) + dtH;
    const after = this.skillOf(p);
    if (after > before) this.emit('skill', { p, stars: after });
  },
  /** Production multiplier of a workplace from its workers' skill. */
  skillMult(b, I = this.I) {
    let n = 0, sum = 0;
    for (const p of I.npcs) {
      if (p.job !== b.id) continue;
      n++;
      sum += this.skillOf(p);
    }
    return n ? 1 + (SKILL_BONUS * sum) / n : 1;
  },
};
