// Island generation and tile helpers. Pure data (no three.js objects), so islands serialise directly.
import { rng, noise2 } from '../engine/kit.js';

export const N = 22; // tiles per side
export const STEP = 0.25; // height step
export const WATER_Y = 0;
export const HALF = N / 2;

// tile types
export const T = {
  grass: 'g', sand: 's', water: 'w', rock: 'r', snow: 'n', dirt: 'd', path: 'p', magic: 'm', asphalt: 'a', pave: 'v',
};
export const WALKABLE = new Set(['g', 's', 'r', 'n', 'd', 'p', 'm', 'a', 'v']);
export const ROADS = new Set(['p', 'a']);

export const idx = (i, j) => i * N + j;
export const inside = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
export const tileCenter = (i, j) => [i - HALF + 0.5, j - HALF + 0.5];
export const tileAt = (x, z) => [Math.floor(x + HALF), Math.floor(z + HALF)];
const q = (h) => Math.round(h / STEP) * STEP;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function blank(biome, seed) {
  return {
    biome,
    seed,
    h: new Array(N * N).fill(STEP),
    t: new Array(N * N).fill('g'),
    nodes: {},
    buildings: [],
    npcs: [],
    nextId: 1,
    unlocked: true,
    day: 1,
    hour: 7.5,
    happiness: 60,
    lastSim: 0,
  };
}

function addNode(I, i, j, kind, rand) {
  if (!inside(i, j)) return;
  const k = idx(i, j);
  if (I.nodes[k] || I.t[k] === 'w' || ROADS.has(I.t[k]) || I.t[k] === 'v') return;
  I.nodes[k] = { k: kind, v: Math.floor(rand() * 3), hp: -1, re: 0 };
}

function reservePlaza(I, ci, cj) {
  // 2x2 town hall plus a ring of free tiles, levelled to one height
  let hMax = STEP;
  for (let i = ci - 2; i <= ci + 3; i++) for (let j = cj - 2; j <= cj + 3; j++) if (inside(i, j)) hMax = Math.max(hMax, I.h[idx(i, j)]);
  const hPlaza = Math.min(hMax, 1.0);
  for (let i = ci - 2; i <= ci + 3; i++)
    for (let j = cj - 2; j <= cj + 3; j++) {
      if (!inside(i, j)) continue;
      const k = idx(i, j);
      I.h[k] = hPlaza;
      if (I.t[k] === 'w' || I.t[k] === 'r' || I.t[k] === 'n') I.t[k] = I.biome === 'gunung' ? 'n' : I.biome === 'gurun' ? 's' : I.biome === 'fantasi' ? 'm' : 'g';
      delete I.nodes[k];
    }
  return hPlaza;
}

function pathLine(I, i0, j0, i1, j1, type = 'p') {
  let i = i0, j = j0;
  let guard = 0;
  while ((i !== i1 || j !== j1) && guard++ < 200) {
    if (inside(i, j) && I.t[idx(i, j)] !== 'w') {
      I.t[idx(i, j)] = type;
      delete I.nodes[idx(i, j)];
    }
    if (Math.abs(i1 - i) > Math.abs(j1 - j)) i += Math.sign(i1 - i);
    else j += Math.sign(j1 - j);
  }
}

export function generateIsland(biome, seed = 1) {
  const I = blank(biome, seed);
  const rand = rng(seed * 7919 + biome.length * 131);
  const n1 = noise2(seed * 3 + 1), n2 = noise2(seed * 5 + 2), n3 = noise2(seed * 11 + 3);
  const C = HALF - 1; // plaza corner
  const set = (i, j, h, t) => {
    const k = idx(i, j);
    I.h[k] = h;
    I.t[k] = t;
  };

  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const [x, z] = tileCenter(i, j);
      const r = Math.hypot(x, z);
      const a = n1(i * 0.18, j * 0.18), b = n2(i * 0.35, j * 0.35), c = n3(i * 0.6, j * 0.6);
      switch (biome) {
        case 'desa': {
          let h = 0.25 + Math.max(0, a - 0.45) * 2.4;
          set(i, j, q(h), 'g');
          break;
        }
        case 'hutan': {
          const river = Math.abs(z - Math.sin(x * 0.42 + seed) * 3.2 - 4.5);
          let h = 0.25 + Math.max(0, a - 0.4) * 2.0 + (r > 8 ? 0.25 : 0);
          if (river < 0.9) set(i, j, river < 0.45 ? -0.75 : -0.5, 'w');
          else set(i, j, q(h), c > 0.72 ? 'd' : 'g');
          break;
        }
        case 'pantai': {
          const shore = 7.2 + (a - 0.5) * 3.2;
          if (r > shore) set(i, j, r > shore + 1.4 ? -1.0 : -0.5, 'w');
          else if (r > shore - 2.0) set(i, j, 0.25, 's');
          else set(i, j, q(0.25 + Math.max(0, b - 0.55) * 1.4), 'g');
          break;
        }
        case 'gunung': {
          const ridge = Math.max(0, r - 4.5) * 0.32 + Math.max(0, a - 0.35) * 2.2 + (b - 0.5) * 0.6;
          const h = q(clamp(0.25 + ridge, 0.25, 3.25));
          const lake = Math.hypot(x + 4.5, z - 4.2) < 1.8;
          if (lake) set(i, j, -0.5, 'w');
          else set(i, j, h, h >= 1.5 ? 'n' : h >= 1.0 && c > 0.5 ? 'r' : c > 0.66 ? 'r' : 'n');
          break;
        }
        case 'gurun': {
          const dune = Math.sin(x * 0.55 + a * 3) * 0.5 + 0.5;
          let h = q(0.25 + dune * 0.6 * (b > 0.4 ? 1 : 0.5));
          const oasis = Math.hypot(x - 4.0, z + 3.5);
          if (oasis < 1.7) set(i, j, -0.5, 'w');
          else if (oasis < 3.0) set(i, j, 0.25, 'g');
          else if (r > 8.5 && c > 0.6) set(i, j, q(1.5 + c * 1.6), 'r');
          else set(i, j, h, 's');
          break;
        }
        case 'kota': {
          const canal = z > 8.0;
          if (canal) set(i, j, -0.75, 'w');
          else {
            const road = i % 6 === 2 || j % 6 === 2;
            set(i, j, 0.25, road ? 'a' : 'v');
            if (!road && c > 0.75) I.t[idx(i, j)] = 'g';
          }
          break;
        }
        case 'fantasi': {
          let h = 0.25 + Math.max(0, a - 0.42) * 2.6;
          const pond = Math.hypot(x + 3.8, z + 3.6) < 1.9;
          if (pond) set(i, j, -0.5, 'w');
          else set(i, j, q(h), r > 9.6 && c > 0.5 ? 'r' : 'm');
          break;
        }
        default:
          set(i, j, 0.25, 'g');
      }
    }

  // a pond for the village
  if (biome === 'desa') {
    const px = 4.6, pz = 4.2;
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const [x, z] = tileCenter(i, j);
        const d = Math.hypot(x - px, (z - pz) * 1.2);
        if (d < 2.3) set(i, j, d < 1.3 ? -0.75 : -0.5, 'w');
        else if (d < 3.0) set(i, j, 0.25, 's');
      }
  }

  // nature
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const k = idx(i, j);
      const t = I.t[k];
      if (t === 'w') continue;
      const a = n2(i * 0.3 + 11, j * 0.3), roll = rand();
      switch (biome) {
        case 'desa':
          if (a > 0.6 && roll < 0.55) addNode(I, i, j, roll < 0.12 ? 'pine' : 'tree', rand);
          else if (roll < 0.05) addNode(I, i, j, 'rock', rand);
          else if (roll < 0.09) addNode(I, i, j, 'bush', rand);
          break;
        case 'hutan':
          if (roll < (a > 0.45 ? 0.55 : 0.18)) addNode(I, i, j, 'pine', rand);
          else if (roll < 0.62 && a > 0.5) addNode(I, i, j, 'mushroom', rand);
          else if (rand() < 0.05) addNode(I, i, j, 'rock', rand);
          else if (rand() < 0.06) addNode(I, i, j, 'bush', rand);
          break;
        case 'pantai':
          if (t === 's' && roll < 0.2) addNode(I, i, j, 'palm', rand);
          else if (t === 's' && roll < 0.24) addNode(I, i, j, 'dune', rand);
          else if (t === 'g' && roll < 0.22) addNode(I, i, j, roll < 0.1 ? 'palm' : 'bush', rand);
          else if (roll < 0.27) addNode(I, i, j, 'rock', rand);
          break;
        case 'gunung':
          if (t === 'r' && roll < 0.35) addNode(I, i, j, roll < 0.18 ? 'ore' : 'rock', rand);
          else if (I.h[k] < 1.6 && roll < 0.28) addNode(I, i, j, 'pine', rand);
          else if (roll < 0.33) addNode(I, i, j, 'rock', rand);
          break;
        case 'gurun':
          if (t === 'g' && roll < 0.4) addNode(I, i, j, roll < 0.25 ? 'palm' : 'bush', rand);
          else if (t === 's' && roll < 0.1) addNode(I, i, j, 'cactus', rand);
          else if (t === 's' && roll < 0.16) addNode(I, i, j, 'dune', rand);
          else if (t === 'r' && roll < 0.3) addNode(I, i, j, roll < 0.12 ? 'ore' : 'rock', rand);
          break;
        case 'kota':
          if (t === 'g' && roll < 0.6) addNode(I, i, j, 'tree', rand);
          break;
        case 'fantasi':
          if (roll < 0.12) addNode(I, i, j, 'crystal', rand);
          else if (roll < 0.3 && a > 0.45) addNode(I, i, j, 'mushroom', rand);
          else if (roll < 0.36) addNode(I, i, j, 'tree', rand);
          else if (t === 'r' && roll < 0.5) addNode(I, i, j, 'ore', rand);
          break;
      }
    }

  // plaza + town hall in the middle
  const hp = reservePlaza(I, C, C);
  I.plaza = { i: C, j: C, h: hp };
  const roadT = biome === 'kota' ? 'a' : 'p';
  if (biome !== 'kota') {
    // a small path cross from the plaza
    pathLine(I, C - 1, C + 2, C - 1, Math.min(N - 2, C + 6), roadT);
    pathLine(I, C + 2, C, Math.min(N - 2, C + 6), C, roadT);
    pathLine(I, C, C - 1, C, Math.max(1, C - 5), roadT);
  }
  I.buildings.push({ id: I.nextId++, type: 'balai', i: C, j: C, rot: 0, level: 1, paint: 0, built: 1, progress: 0 });
  return I;
}

// ---------------------------------------------------------------- serialisation

const H_OFF = 8;
export function packIsland(I) {
  return {
    ...I,
    h: I.h.map((v) => String.fromCharCode(48 + Math.round(v / STEP) + H_OFF)).join(''),
    t: I.t.join(''),
    npcs: I.npcs.map((p) => ({ ...p, path: undefined, pos: undefined, vis: undefined, state: undefined })),
  };
}
export function unpackIsland(P) {
  const I = { ...P };
  I.h = typeof P.h === 'string' ? [...P.h].map((ch) => (ch.charCodeAt(0) - 48 - H_OFF) * STEP) : P.h;
  I.t = typeof P.t === 'string' ? [...P.t] : P.t;
  I.nodes = P.nodes || {};
  I.buildings = P.buildings || [];
  I.npcs = P.npcs || [];
  return I;
}
