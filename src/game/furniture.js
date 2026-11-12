// Furniture, wallpapers and floors for house interiors. Every item is built from the same Builder
// primitives as the buildings, so interiors share the island's pixel-art look.
//
// Interiors are a grid of CELL x CELL squares. An item has a footprint `size: [w, d]` in cells and is
// modelled centred on that footprint, facing +z (its front) at rotation 0.
//   cat      shop tab           comfort  adds to the home's comfort (villager mood)
//   sleeps   beds: how many     spots    sleep / sit spots in item space { x, z, h, yaw }
//   layer    'rug': under other items    wall    hangs on a wall (no floor footprint)
//   light    { y, color, power } a warm lamp at night         cook   villagers cook here
//   fun      villagers enjoy it (reading, music...)           unlock player level
import { Builder } from './models.js';

export const CELL = 0.5;
const W = '#9a6a46', WL = '#c49a6c', WD = '#6b4a33', WX = '#4e3626', IRON = '#5a5e68', BRASS = '#d8a84a';
const LINEN = '#f1ece0', CREAM = '#efe3c8';
const FACE = -Math.PI / 2; // a figure facing +z

function legs4(b, w, d, h, c, inset = 0.03, t = 0.035) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(t, h, t, c, sx * (w / 2 - inset), 0, sz * (d / 2 - inset));
}
function pillow(b, x, y, z, w = 0.16, c = '#ffffff') {
  b.box(w, 0.045, 0.09, c, x, y, z, {}, 'smooth');
}
function plantPot(b, x, z, y = 0, pot = '#c56b44', leaf = '#4d8f45', r = 0.07, h = 0.09) {
  b.cyl(r, r * 0.8, h, pot, x, y, z, {}, 'rough', 8);
  b.cyl(r * 0.92, r * 0.92, 0.012, '#5a3e2a', x, y + h - 0.01, z, {}, 'rough', 8);
  return y + h;
}

// ---------------------------------------------------------------- catalog

export const FURNITURE = {
  // ---- beds
  mat: {
    name: 'Straw Mat', cat: 'bed', icon: 'bed', size: [1, 2], cost: { coins: 20, wood: 2 }, comfort: 1, sleeps: 1, unlock: 1,
    spots: [{ x: 0, z: 0.2, h: 0.04, yaw: FACE }],
    build(b) {
      b.box(0.42, 0.035, 0.9, '#d8c08a', 0, 0, 0, {}, 'rough');
      for (let k = -3; k <= 3; k++) b.box(0.42, 0.006, 0.02, '#b89a62', 0, 0.035, k * 0.12, {}, 'rough');
      b.box(0.4, 0.05, 0.5, '#9a8a6a', 0, 0.035, 0.18, {}, 'smooth');
      pillow(b, 0, 0.035, -0.34, 0.24, CREAM);
    },
  },
  bed: {
    name: 'Wooden Bed', cat: 'bed', icon: 'bed', size: [1, 2], cost: { coins: 60, plank: 3 }, comfort: 3, sleeps: 1, unlock: 1,
    spots: [{ x: 0, z: 0.2, h: 0.2, yaw: FACE }],
    build(b, c) {
      legs4(b, 0.44, 0.94, 0.12, WD);
      b.box(0.46, 0.06, 0.94, W, 0, 0.1, 0);
      b.box(0.42, 0.06, 0.9, LINEN, 0, 0.14, 0, {}, 'smooth');
      b.box(0.46, 0.34, 0.05, W, 0, 0, -0.47);
      b.box(0.46, 0.04, 0.06, WL, 0, 0.34, -0.47);
      b.box(0.46, 0.2, 0.04, W, 0, 0, 0.47);
      b.box(0.44, 0.07, 0.56, c.blanket, 0, 0.2, 0.16, {}, 'smooth');
      b.box(0.45, 0.02, 0.1, c.blanket2, 0, 0.255, -0.1, {}, 'smooth');
      pillow(b, 0, 0.2, -0.36, 0.26);
    },
  },
  bunk: {
    name: 'Bunk Bed', cat: 'bed', icon: 'bed', size: [1, 2], cost: { coins: 140, plank: 6 }, comfort: 3, sleeps: 2, unlock: 3,
    spots: [{ x: 0, z: 0.2, h: 0.18, yaw: FACE }, { x: 0, z: 0.2, h: 0.6, yaw: FACE }],
    build(b, c) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.045, 0.9, 0.045, WD, sx * 0.21, 0, sz * 0.45);
      for (const y of [0.1, 0.52]) {
        b.box(0.44, 0.05, 0.9, W, 0, y, 0);
        b.box(0.4, 0.05, 0.86, LINEN, 0, y + 0.05, 0, {}, 'smooth');
        b.box(0.42, 0.07, 0.52, y > 0.3 ? c.blanket2 : c.blanket, 0, y + 0.1, 0.16, {}, 'smooth');
        pillow(b, 0, y + 0.1, -0.33, 0.24);
      }
      b.box(0.44, 0.04, 0.04, WD, 0, 0.78, 0.45);
      b.box(0.44, 0.04, 0.04, WD, 0, 0.78, -0.45);
      // ladder
      for (let k = 0; k < 4; k++) b.box(0.03, 0.03, 0.16, WL, 0.24, 0.16 + k * 0.13, 0.32);
    },
  },
  double: {
    name: 'Double Bed', cat: 'bed', icon: 'bed', size: [2, 2], cost: { coins: 240, plank: 6, wood: 4 }, comfort: 6, sleeps: 2, unlock: 4,
    spots: [{ x: -0.12, z: 0.2, h: 0.21, yaw: FACE }, { x: 0.13, z: 0.2, h: 0.21, yaw: FACE }],
    build(b, c) {
      legs4(b, 0.84, 0.94, 0.12, WD);
      b.box(0.86, 0.06, 0.94, W, 0, 0.1, 0);
      b.box(0.82, 0.07, 0.9, LINEN, 0, 0.14, 0, {}, 'smooth');
      b.box(0.86, 0.42, 0.06, W, 0, 0, -0.47);
      b.box(0.7, 0.18, 0.02, WL, 0, 0.16, -0.435);
      b.box(0.9, 0.05, 0.08, WD, 0, 0.42, -0.47);
      b.box(0.86, 0.2, 0.04, W, 0, 0, 0.47);
      b.box(0.84, 0.07, 0.56, c.blanket, 0, 0.21, 0.16, {}, 'smooth');
      b.box(0.85, 0.02, 0.12, c.blanket2, 0, 0.265, -0.1, {}, 'smooth');
      pillow(b, -0.18, 0.21, -0.35, 0.3);
      pillow(b, 0.18, 0.21, -0.35, 0.3);
    },
  },
  canopy: {
    name: 'Canopy Bed', cat: 'bed', icon: 'bed', size: [2, 2], cost: { coins: 650, plank: 10, glass: 2 }, comfort: 11, sleeps: 2, unlock: 9,
    spots: [{ x: -0.12, z: 0.2, h: 0.23, yaw: FACE }, { x: 0.13, z: 0.2, h: 0.23, yaw: FACE }],
    build(b, c) {
      b.box(0.88, 0.14, 0.96, WD, 0, 0, 0);
      b.box(0.84, 0.09, 0.92, LINEN, 0, 0.14, 0, {}, 'smooth');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.025, 0.03, 1.15, WD, sx * 0.42, 0, sz * 0.46, {}, 'smooth', 6);
      b.box(0.9, 0.06, 0.98, c.blanket2, 0, 1.12, 0, {}, 'smooth');
      for (const sx of [-1, 1]) b.box(0.03, 0.55, 0.9, c.blanket2, sx * 0.43, 0.57, 0, {}, 'smooth');
      b.box(0.86, 0.5, 0.06, '#7a3a4a', 0, 0.14, -0.47);
      for (let k = -3; k <= 3; k++) b.ball(0.025, BRASS, k * 0.12, 0.62, -0.47, {}, 'smooth', 0);
      b.box(0.86, 0.08, 0.58, c.blanket, 0, 0.23, 0.16, {}, 'smooth');
      b.box(0.87, 0.02, 0.12, '#f4e6c0', 0, 0.3, -0.1, {}, 'smooth');
      pillow(b, -0.18, 0.23, -0.35, 0.3);
      pillow(b, 0.18, 0.23, -0.35, 0.3);
      pillow(b, 0, 0.27, -0.38, 0.2, '#f2c9d6');
    },
  },
  cradle: {
    name: 'Cradle', cat: 'bed', icon: 'bed', size: [1, 1], cost: { coins: 90, plank: 3 }, comfort: 3, unlock: 6,
    build(b, c) {
      for (const sx of [-1, 1]) b.box(0.03, 0.04, 0.32, WD, sx * 0.12, 0, 0);
      b.box(0.26, 0.16, 0.34, W, 0, 0.06, 0);
      b.box(0.22, 0.04, 0.3, c.blanket2, 0, 0.21, 0, {}, 'smooth');
      b.box(0.26, 0.12, 0.03, WL, 0, 0.2, -0.16);
    },
  },

  // ---- seating
  stool: {
    name: 'Stool', cat: 'seat', icon: 'chair', size: [1, 1], cost: { coins: 15, wood: 2 }, comfort: 1, unlock: 1,
    spots: [{ x: 0, z: -0.04, h: 0.09, yaw: FACE, sit: 1 }],
    build(b) {
      for (const [x, z] of [[-0.07, -0.07], [0.07, -0.07], [0, 0.08]]) b.box(0.03, 0.16, 0.03, WD, x, 0, z);
      b.cyl(0.12, 0.12, 0.04, WL, 0, 0.15, 0, {}, 'solid', 10);
    },
  },
  chair: {
    name: 'Wooden Chair', cat: 'seat', icon: 'chair', size: [1, 1], cost: { coins: 30, plank: 1 }, comfort: 2, unlock: 1,
    spots: [{ x: 0, z: -0.03, h: 0.11, yaw: FACE, sit: 1 }],
    build(b, c) {
      legs4(b, 0.24, 0.24, 0.16, WD);
      b.box(0.26, 0.04, 0.26, W, 0, 0.15, 0);
      b.box(0.24, 0.02, 0.22, c.cushion, 0, 0.19, 0.01, {}, 'smooth');
      b.box(0.26, 0.3, 0.04, W, 0, 0.15, -0.12);
      b.box(0.18, 0.08, 0.02, WL, 0, 0.3, -0.1);
    },
  },
  armchair: {
    name: 'Armchair', cat: 'seat', icon: 'furniture', size: [1, 1], cost: { coins: 110, plank: 2, wood: 2 }, comfort: 4, unlock: 2,
    spots: [{ x: 0, z: -0.02, h: 0.12, yaw: FACE, sit: 1 }],
    build(b, c) {
      b.box(0.38, 0.12, 0.36, c.sofa2, 0, 0.03, 0, {}, 'smooth');
      b.box(0.3, 0.07, 0.3, c.sofa, 0, 0.15, 0.03, {}, 'smooth');
      b.box(0.38, 0.38, 0.09, c.sofa, 0, 0.03, -0.14, {}, 'smooth');
      for (const sx of [-1, 1]) b.box(0.07, 0.24, 0.36, c.sofa, sx * 0.17, 0.03, 0, {}, 'smooth');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.035, 0.035, 0.035, WD, sx * 0.16, 0, sz * 0.15);
    },
  },
  sofa: {
    name: 'Sofa', cat: 'seat', icon: 'sofa', size: [2, 1], cost: { coins: 200, plank: 3, wood: 3 }, comfort: 6, unlock: 3,
    spots: [{ x: -0.17, z: -0.02, h: 0.12, yaw: FACE, sit: 1 }, { x: 0.17, z: -0.02, h: 0.12, yaw: FACE, sit: 1 }],
    build(b, c) {
      b.box(0.86, 0.12, 0.38, c.sofa2, 0, 0.03, 0, {}, 'smooth');
      for (const sx of [-1, 1]) b.box(0.34, 0.07, 0.3, c.sofa, sx * 0.17, 0.15, 0.03, {}, 'smooth');
      b.box(0.86, 0.36, 0.1, c.sofa, 0, 0.03, -0.15, {}, 'smooth');
      for (const sx of [-1, 1]) b.box(0.08, 0.25, 0.38, c.sofa, sx * 0.4, 0.03, 0, {}, 'smooth');
      b.box(0.13, 0.12, 0.05, '#f2d36b', -0.28, 0.21, -0.08, { rx: -0.3 }, 'smooth');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.035, 0.035, 0.035, WD, sx * 0.38, 0, sz * 0.15);
    },
  },
  beanbag: {
    name: 'Bean Bag', cat: 'seat', icon: 'furniture', size: [1, 1], cost: { coins: 80, food: 4 }, comfort: 3, unlock: 5,
    spots: [{ x: 0, z: 0.0, h: 0.05, yaw: FACE, sit: 1 }],
    build(b, c) {
      b.dome(0.2, c.cushion, 0, 0, 0, { sy: 0.7 }, 'smooth', 10);
      b.ball(0.13, c.cushion, 0, 0.12, -0.1, { sy: 1.2 }, 'smooth', 1);
    },
  },
  bench: {
    name: 'Garden Bench', cat: 'seat', icon: 'chair', size: [2, 1], cost: { coins: 60, wood: 6 }, comfort: 2, unlock: 2,
    spots: [{ x: -0.17, z: -0.02, h: 0.08, yaw: FACE, sit: 1 }, { x: 0.17, z: -0.02, h: 0.08, yaw: FACE, sit: 1 }],
    build(b) {
      for (const sx of [-1, 1]) b.box(0.05, 0.16, 0.26, WD, sx * 0.36, 0, 0);
      for (let k = 0; k < 3; k++) b.box(0.84, 0.03, 0.07, k % 2 ? WL : W, 0, 0.15, -0.08 + k * 0.08);
      b.box(0.84, 0.18, 0.03, W, 0, 0.2, -0.12);
    },
  },

  // ---- tables & desks
  table: {
    name: 'Small Table', cat: 'table', icon: 'table', size: [1, 1], cost: { coins: 35, plank: 2 }, comfort: 1, unlock: 1,
    build(b) {
      b.cyl(0.035, 0.05, 0.26, WD, 0, 0, 0, {}, 'solid', 6);
      b.cyl(0.12, 0.12, 0.02, WD, 0, 0, 0, {}, 'solid', 8);
      b.cyl(0.2, 0.2, 0.035, WL, 0, 0.26, 0, {}, 'solid', 12);
      b.cyl(0.06, 0.05, 0.05, '#e9e4da', 0.06, 0.295, 0.03, {}, 'smooth', 8);
    },
  },
  dining: {
    name: 'Dining Table', cat: 'table', icon: 'table', size: [2, 1], cost: { coins: 90, plank: 4 }, comfort: 2, unlock: 1,
    build(b, c) {
      legs4(b, 0.8, 0.38, 0.27, WD);
      b.box(0.86, 0.04, 0.42, W, 0, 0.27, 0);
      b.box(0.5, 0.005, 0.3, c.cloth, 0, 0.31, 0, {}, 'smooth');
      b.cyl(0.05, 0.04, 0.05, '#e9e4da', -0.2, 0.31, 0, {}, 'smooth', 8);
      b.cyl(0.07, 0.06, 0.02, '#e9e4da', 0.18, 0.31, 0.04, {}, 'smooth', 8);
      b.ball(0.035, '#e94f4f', 0.17, 0.35, 0.04, {}, 'smooth', 0);
      b.ball(0.03, '#ffd23d', 0.2, 0.34, 0.01, {}, 'smooth', 0);
    },
  },
  coffee: {
    name: 'Coffee Table', cat: 'table', icon: 'table', size: [1, 1], cost: { coins: 50, plank: 2 }, comfort: 1, unlock: 2,
    build(b) {
      legs4(b, 0.34, 0.26, 0.11, WD);
      b.box(0.38, 0.035, 0.3, WL, 0, 0.11, 0);
      b.box(0.12, 0.025, 0.09, '#c94a3d', -0.06, 0.145, 0.02, { ry: 0.3 }, 'smooth');
      b.box(0.11, 0.02, 0.08, '#3f6fb0', -0.05, 0.17, 0.02, { ry: 0.1 }, 'smooth');
    },
  },
  desk: {
    name: 'Writing Desk', cat: 'table', icon: 'desk', size: [2, 1], cost: { coins: 120, plank: 4, glass: 1 }, comfort: 3, fun: 1, unlock: 4,
    build(b) {
      b.box(0.82, 0.04, 0.38, W, 0, 0.3, 0);
      b.box(0.26, 0.3, 0.36, WD, 0.27, 0, 0);
      for (let k = 0; k < 3; k++) b.box(0.22, 0.07, 0.01, WL, 0.27, 0.03 + k * 0.09, 0.18);
      for (const sz of [-1, 1]) b.box(0.035, 0.3, 0.035, WD, -0.38, 0, sz * 0.16);
      b.box(0.2, 0.012, 0.15, '#f4f1ea', -0.12, 0.34, 0.03, { ry: 0.2 }, 'smooth');
      b.cyl(0.03, 0.03, 0.06, '#2a2e3a', 0.12, 0.34, -0.08, {}, 'smooth', 6);
      b.box(0.005, 0.1, 0.005, '#f4f1ea', 0.13, 0.4, -0.08, { rz: 0.4 });
      // little desk lamp
      b.cyl(0.04, 0.05, 0.02, BRASS, 0.3, 0.34, -0.1, {}, 'smooth', 8);
      b.box(0.012, 0.16, 0.012, BRASS, 0.3, 0.36, -0.1);
      b.glowBox(0.09, 0.05, 0.09, '#ffd28a', 4, 0.3, 0.5, -0.1, {}, '#e9d8b8');
    },
    light: { x: 0.3, y: 0.55, z: -0.1, color: '#ffcf8a', power: 0.9 },
  },

  // ---- storage
  crate: {
    name: 'Wooden Crate', cat: 'storage', icon: 'storage', size: [1, 1], cost: { coins: 10, wood: 3 }, comfort: 0, unlock: 1,
    build(b) {
      b.box(0.3, 0.26, 0.3, W, 0, 0, 0, {}, 'rough');
      for (const y of [0.02, 0.22]) b.box(0.32, 0.03, 0.32, WD, 0, y, 0, {}, 'rough');
      b.box(0.31, 0.03, 0.04, WD, 0, 0.12, 0, { ry: 0.78 }, 'rough');
      b.ball(0.05, '#e94f4f', -0.05, 0.3, 0.04, {}, 'smooth', 0);
      b.ball(0.045, '#7fb84e', 0.05, 0.29, -0.03, {}, 'smooth', 0);
    },
  },
  bookshelf: {
    name: 'Bookshelf', cat: 'storage', icon: 'shelf', size: [1, 1], cost: { coins: 90, plank: 4 }, comfort: 3, fun: 1, unlock: 2,
    build(b) {
      b.box(0.44, 0.9, 0.04, WD, 0, 0, -0.14);
      for (const sx of [-1, 1]) b.box(0.04, 0.9, 0.3, W, sx * 0.21, 0, -0.01);
      for (let k = 0; k < 4; k++) b.box(0.42, 0.03, 0.28, W, 0, 0.02 + k * 0.22, -0.01);
      b.box(0.46, 0.04, 0.32, WL, 0, 0.88, -0.01);
      const BK = ['#c94a3d', '#3f6fb0', '#e2b33c', '#3f6e4f', '#6b4a8a', '#d8d2c4', '#b8673a'];
      let n = 0;
      for (let k = 0; k < 3; k++) {
        let x = -0.17;
        while (x < 0.17) {
          const w = 0.035 + ((n * 7) % 3) * 0.012, h = 0.13 + ((n * 5) % 4) * 0.015;
          b.box(w, h, 0.2, BK[n % BK.length], x + w / 2, 0.05 + k * 0.22, 0, { rz: n % 9 === 4 ? 0.25 : 0 }, 'smooth');
          x += w + 0.008;
          n++;
        }
      }
      plantPot(b, 0.1, 0, 0.71, '#e9e4da', '#4d8f45', 0.04, 0.05);
      b.ball(0.05, '#5aa84b', 0.1, 0.8, 0, {}, 'leaf', 0);
    },
  },
  wardrobe: {
    name: 'Wardrobe', cat: 'storage', icon: 'wardrobe', size: [1, 1], cost: { coins: 110, plank: 5 }, comfort: 2, unlock: 3,
    build(b) {
      b.box(0.44, 0.92, 0.3, W, 0, 0.03, -0.04);
      b.box(0.46, 0.05, 0.32, WD, 0, 0.93, -0.04);
      b.box(0.44, 0.04, 0.3, WD, 0, 0, -0.04);
      for (const sx of [-1, 1]) {
        b.box(0.19, 0.74, 0.012, WL, sx * 0.105, 0.12, 0.11);
        b.ball(0.016, BRASS, sx * 0.03, 0.5, 0.125, {}, 'smooth', 0);
      }
    },
  },
  dresser: {
    name: 'Chest of Drawers', cat: 'storage', icon: 'wardrobe', size: [1, 1], cost: { coins: 80, plank: 3 }, comfort: 2, unlock: 2,
    build(b) {
      b.box(0.42, 0.42, 0.28, W, 0, 0.03, -0.05);
      b.box(0.44, 0.03, 0.3, WD, 0, 0.45, -0.05);
      for (let k = 0; k < 3; k++) {
        b.box(0.38, 0.11, 0.012, WL, 0, 0.06 + k * 0.13, 0.095);
        b.box(0.06, 0.015, 0.015, BRASS, 0, 0.11 + k * 0.13, 0.105);
      }
      b.cyl(0.04, 0.05, 0.1, '#86b8e8', -0.12, 0.48, -0.05, {}, 'smooth', 8);
      b.ball(0.04, '#ff8fb1', -0.12, 0.6, -0.05, {}, 'leaf', 0);
      b.box(0.12, 0.14, 0.02, BRASS, 0.1, 0.48, -0.12, { rx: -0.15 });
      b.box(0.09, 0.1, 0.01, '#9fd0ff', 0.1, 0.5, -0.11, { rx: -0.15 }, 'smooth');
    },
  },
  chest: {
    name: 'Toy Chest', cat: 'storage', icon: 'chest', size: [1, 1], cost: { coins: 60, plank: 2 }, comfort: 2, fun: 1, unlock: 4,
    build(b) {
      b.box(0.36, 0.2, 0.24, '#c94a3d', 0, 0, 0);
      b.box(0.38, 0.06, 0.26, '#e2b33c', 0, 0.2, 0);
      b.box(0.06, 0.06, 0.02, BRASS, 0, 0.15, 0.125);
      b.ball(0.06, '#7fb84e', 0.12, 0.3, -0.02, {}, 'smooth', 1);
      b.box(0.08, 0.08, 0.08, '#3f8fc2', -0.1, 0.26, 0.02, { ry: 0.5 }, 'smooth');
    },
  },

  // ---- kitchen & bath
  stove: {
    name: 'Iron Stove', cat: 'kitchen', icon: 'kitchen', size: [1, 1], cost: { coins: 90, stone: 6, ore: 2 }, comfort: 2, cook: true, unlock: 1,
    spots: [{ x: 0, z: 0.34, h: 0, yaw: Math.PI / 2 }],
    build(b) {
      b.box(0.4, 0.34, 0.34, '#3a3e48', 0, 0, -0.06);
      b.box(0.42, 0.03, 0.36, '#5a5e68', 0, 0.34, -0.06);
      b.box(0.2, 0.12, 0.01, '#2a2e3a', 0, 0.06, 0.11);
      b.glowBox(0.16, 0.08, 0.012, '#ff8a3d', 5, 0, 0.08, 0.112, {}, '#4a2a1a', true);
      b.box(0.07, 0.62, 0.07, '#4a4e58', 0.12, 0.37, -0.16);
      b.cyl(0.07, 0.06, 0.08, '#8d919c', -0.08, 0.37, -0.02, {}, 'smooth', 10);
      b.cyl(0.075, 0.075, 0.012, '#6a6e78', -0.08, 0.45, -0.02, {}, 'smooth', 10);
    },
    light: { x: 0, y: 0.15, z: 0.2, color: '#ff9a4a', power: 0.7 },
  },
  counter: {
    name: 'Kitchen Counter', cat: 'kitchen', icon: 'kitchen', size: [1, 1], cost: { coins: 60, plank: 2, stone: 2 }, comfort: 1, cook: true, unlock: 2,
    spots: [{ x: 0, z: 0.34, h: 0, yaw: Math.PI / 2 }],
    build(b) {
      b.box(0.46, 0.34, 0.36, '#e9e4da', 0, 0, -0.06);
      b.box(0.48, 0.035, 0.38, '#8d7a6a', 0, 0.34, -0.06, {}, 'rough');
      for (const sx of [-1, 1]) b.box(0.2, 0.26, 0.012, '#d8d0c2', sx * 0.11, 0.04, 0.125);
      b.box(0.22, 0.02, 0.14, WL, -0.08, 0.375, -0.04);
      b.ball(0.035, '#e94f4f', -0.04, 0.41, -0.03, {}, 'smooth', 0);
      b.cyl(0.03, 0.02, 0.12, '#7fb84e', 0.12, 0.375, -0.12, { rz: 0.3 }, 'smooth', 6);
      b.cyl(0.045, 0.04, 0.11, '#3f6fb0', 0.15, 0.375, 0.02, {}, 'smooth', 8);
    },
  },
  icebox: {
    name: 'Icebox', cat: 'kitchen', icon: 'kitchen', size: [1, 1], cost: { coins: 130, plank: 2, ore: 3 }, comfort: 3, unlock: 5,
    build(b) {
      b.box(0.4, 0.72, 0.34, '#dfe8ee', 0, 0, -0.06, {}, 'smooth');
      b.box(0.36, 0.3, 0.01, '#cfd8de', 0, 0.38, 0.115, {}, 'smooth');
      b.box(0.36, 0.3, 0.01, '#cfd8de', 0, 0.04, 0.115, {}, 'smooth');
      for (const y of [0.5, 0.2]) b.box(0.03, 0.12, 0.02, '#8d919c', 0.14, y, 0.125);
      b.box(0.08, 0.06, 0.01, '#e94f4f', -0.08, 0.52, 0.122, {}, 'smooth');
    },
  },
  barrel: {
    name: 'Water Barrel', cat: 'kitchen', icon: 'kitchen', size: [1, 1], cost: { coins: 25, wood: 4 }, comfort: 1, unlock: 1,
    build(b) {
      b.cyl(0.15, 0.13, 0.38, W, 0, 0, 0, {}, 'rough', 10);
      for (const y of [0.06, 0.3]) b.cyl(0.155, 0.155, 0.03, IRON, 0, y, 0, {}, 'smooth', 10);
      b.cyl(0.13, 0.13, 0.01, '#5fb8d8', 0, 0.37, 0, {}, 'smooth', 10);
    },
  },
  bathtub: {
    name: 'Bathtub', cat: 'bath', icon: 'bath', size: [2, 1], cost: { coins: 260, ore: 4, glass: 2 }, comfort: 7, unlock: 6,
    build(b) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.ball(0.035, BRASS, sx * 0.32, 0.03, sz * 0.13, {}, 'smooth', 0);
      b.box(0.82, 0.26, 0.38, '#f4f6fb', 0, 0.04, 0, {}, 'smooth');
      b.box(0.7, 0.02, 0.28, '#7fd6ee', 0, 0.26, 0, {}, 'smooth');
      for (let k = 0; k < 6; k++) b.ball(0.035 + (k % 3) * 0.01, '#ffffff', -0.2 + k * 0.08, 0.29, (k % 2 ? 0.05 : -0.04), {}, 'smooth', 0);
      b.box(0.05, 0.1, 0.05, '#c9ccd4', 0.36, 0.3, 0, {}, 'smooth');
      b.ball(0.035, '#ffd23d', 0.15, 0.29, 0.06, {}, 'smooth', 0);
    },
  },
  basin: {
    name: 'Washbasin', cat: 'bath', icon: 'bath', size: [1, 1], cost: { coins: 90, stone: 3, glass: 1 }, comfort: 2, unlock: 3,
    build(b) {
      b.cyl(0.05, 0.07, 0.3, '#e9eef4', 0, 0, -0.06, {}, 'smooth', 8);
      b.cyl(0.15, 0.1, 0.07, '#f4f6fb', 0, 0.3, -0.06, {}, 'smooth', 12);
      b.cyl(0.12, 0.12, 0.01, '#7fd6ee', 0, 0.36, -0.06, {}, 'smooth', 12);
      b.box(0.22, 0.28, 0.02, '#c9ccd4', 0, 0.44, -0.2, {}, 'smooth');
      b.box(0.18, 0.24, 0.01, '#bfe3ff', 0, 0.46, -0.19, {}, 'smooth');
    },
  },

  // ---- lights & warmth
  candle: {
    name: 'Candle Stand', cat: 'light', icon: 'lamp', size: [1, 1], cost: { coins: 25, wood: 1 }, comfort: 1, unlock: 1,
    build(b) {
      b.cyl(0.06, 0.08, 0.02, BRASS, 0, 0, 0, {}, 'smooth', 8);
      b.cyl(0.015, 0.015, 0.34, BRASS, 0, 0.02, 0, {}, 'smooth', 6);
      b.cyl(0.05, 0.03, 0.03, BRASS, 0, 0.36, 0, {}, 'smooth', 8);
      b.cyl(0.022, 0.022, 0.07, '#f4ead2', 0, 0.39, 0, {}, 'smooth', 6);
      b.glowBall(0.02, '#ffb84a', 6, 0, 0.48, 0, '#ffe0a0');
    },
    light: { y: 0.5, color: '#ffb35a', power: 0.8 },
  },
  lamp: {
    name: 'Floor Lamp', cat: 'light', icon: 'lamp', size: [1, 1], cost: { coins: 70, plank: 1, glass: 1 }, comfort: 2, unlock: 2,
    build(b, c) {
      b.cyl(0.08, 0.09, 0.025, WD, 0, 0, 0, {}, 'smooth', 10);
      b.cyl(0.015, 0.015, 0.6, WD, 0, 0.02, 0, {}, 'smooth', 6);
      b.glowBox(0.16, 0.13, 0.16, '#ffd59a', 3.5, 0, 0.6, 0, {}, c.shade);
    },
    light: { y: 0.66, color: '#ffcf8a', power: 1.2 },
  },
  lantern: {
    name: 'Hanging Lantern', cat: 'light', icon: 'lantern', size: [1, 1], cost: { coins: 55, ore: 1, glass: 1 }, comfort: 2, unlock: 3,
    build(b) {
      b.box(0.03, 0.85, 0.03, WD, 0.12, 0, -0.12);
      b.box(0.2, 0.03, 0.03, WD, 0.03, 0.83, -0.12);
      b.box(0.01, 0.1, 0.01, IRON, -0.05, 0.74, -0.12);
      b.box(0.1, 0.02, 0.1, IRON, -0.05, 0.72, -0.12);
      b.glowBox(0.08, 0.1, 0.08, '#ffc36b', 5, -0.05, 0.62, -0.12, {}, '#e0c080');
      b.box(0.1, 0.02, 0.1, IRON, -0.05, 0.6, -0.12);
    },
    light: { x: -0.05, y: 0.65, z: -0.12, color: '#ffc36b', power: 1.1 },
  },
  fireplace: {
    name: 'Stone Fireplace', cat: 'light', icon: 'fireplace', size: [2, 1], cost: { coins: 320, stone: 14, brick: 6 }, comfort: 9, unlock: 4,
    spots: [{ x: 0.2, z: 0.4, h: 0, yaw: Math.PI / 2 }],
    build(b) {
      b.box(0.86, 0.66, 0.26, '#8d909b', 0, 0, -0.11, {}, 'rough');
      b.box(0.94, 0.06, 0.32, '#6a4630', 0, 0.66, -0.1);
      b.box(0.4, 0.3, 0.06, '#2a2420', 0, 0.04, 0.0, {}, 'rough');
      b.box(0.54, 0.05, 0.12, '#70737e', 0, 0, 0.08, {}, 'rough');
      for (const x of [-0.1, 0.05]) b.cyl(0.03, 0.03, 0.22, '#6a4630', x, 0.06, 0.02, { rz: Math.PI / 2, ry: x * 3 }, 'rough', 6);
      b.glowBox(0.24, 0.12, 0.04, '#ff7a2a', 7, -0.02, 0.07, 0.03, {}, '#ff7a2a', true);
      b.glowBox(0.12, 0.08, 0.03, '#ffd04a', 8, 0.0, 0.1, 0.05, {}, '#ffd04a', true);
      b.box(0.62, 0.36, 0.2, '#9a9da8', 0, 0.72, -0.13, {}, 'rough');
      b.cyl(0.04, 0.05, 0.1, '#e9e4da', -0.3, 0.72, -0.04, {}, 'smooth', 8);
      b.box(0.14, 0.18, 0.02, BRASS, 0.24, 0.72, -0.05);
      b.box(0.1, 0.13, 0.01, '#7fb4d8', 0.24, 0.745, -0.038, {}, 'smooth');
    },
    light: { x: 0, y: 0.25, z: 0.25, color: '#ff8a3a', power: 2.0, flicker: 1 },
  },

  // ---- rugs
  rugRound: {
    name: 'Round Rug', cat: 'rug', icon: 'rug', size: [2, 2], cost: { coins: 60, food: 3 }, comfort: 2, layer: 'rug', unlock: 1,
    build(b, c) {
      b.cyl(0.46, 0.46, 0.012, c.rug, 0, 0, 0, {}, 'smooth', 16);
      b.cyl(0.36, 0.36, 0.014, c.rug2, 0, 0, 0, {}, 'smooth', 16);
      b.cyl(0.2, 0.2, 0.016, c.rug, 0, 0, 0, {}, 'smooth', 16);
    },
  },
  rugLong: {
    name: 'Runner Rug', cat: 'rug', icon: 'rug', size: [1, 3], cost: { coins: 50, food: 2 }, comfort: 1, layer: 'rug', unlock: 1,
    build(b, c) {
      b.box(0.4, 0.012, 1.38, c.rug2, 0, 0, 0, {}, 'smooth');
      b.box(0.3, 0.014, 1.26, c.rug, 0, 0, 0, {}, 'smooth');
      for (let k = -2; k <= 2; k++) b.box(0.12, 0.016, 0.12, c.rug2, 0, 0, k * 0.26, { ry: 0.785 }, 'smooth');
    },
  },
  rugFancy: {
    name: 'Woven Carpet', cat: 'rug', icon: 'rug', size: [3, 2], cost: { coins: 180, food: 6, crystal: 1 }, comfort: 4, layer: 'rug', unlock: 6,
    build(b, c) {
      b.box(1.4, 0.012, 0.92, '#7a2a3a', 0, 0, 0, {}, 'smooth');
      b.box(1.28, 0.014, 0.8, '#c9a04a', 0, 0, 0, {}, 'smooth');
      b.box(1.18, 0.016, 0.7, '#8a3040', 0, 0, 0, {}, 'smooth');
      b.box(0.3, 0.018, 0.3, '#e2c070', 0, 0, 0, { ry: 0.785 }, 'smooth');
      for (const sx of [-1, 1]) b.box(0.16, 0.018, 0.16, '#3f5a8a', sx * 0.38, 0, 0, { ry: 0.785 }, 'smooth');
      for (let k = -6; k <= 6; k++) for (const sx of [-1, 1]) b.box(0.02, 0.006, 0.05, CREAM, sx * 0.72, 0, k * 0.065);
    },
  },

  // ---- plants & decor
  plant: {
    name: 'Potted Plant', cat: 'deco', icon: 'plant', size: [1, 1], cost: { coins: 20, food: 1 }, comfort: 1, unlock: 1,
    build(b) {
      const top = plantPot(b, 0, 0, 0, '#c56b44', '#4d8f45', 0.09, 0.14);
      b.ball(0.12, '#4d8f45', 0, top + 0.1, 0, {}, 'leaf', 1);
      b.ball(0.08, '#5aa84b', 0.06, top + 0.18, 0.03, {}, 'leaf', 1);
    },
  },
  fern: {
    name: 'Big Fern', cat: 'deco', icon: 'plant', size: [1, 1], cost: { coins: 45, food: 2 }, comfort: 2, unlock: 2,
    build(b) {
      const top = plantPot(b, 0, 0, 0, '#e9e4da', '#4d8f45', 0.1, 0.18);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        b.box(0.05, 0.015, 0.26, k % 2 ? '#3f8a35' : '#4f9a3c', Math.cos(a) * 0.08, top + 0.02, Math.sin(a) * 0.08, { ry: -a + Math.PI / 2, rx: -0.6 }, 'leaf');
      }
      b.ball(0.07, '#4f9a3c', 0, top + 0.06, 0, {}, 'leaf', 0);
    },
  },
  cactus: {
    name: 'Cactus Pot', cat: 'deco', icon: 'plant', size: [1, 1], cost: { coins: 30, sand: 2 }, comfort: 1, unlock: 3,
    build(b) {
      const top = plantPot(b, 0, 0, 0, '#d8a35c', '#5f9a4c', 0.08, 0.1);
      b.cyl(0.045, 0.05, 0.22, '#5f9a4c', 0, top, 0, {}, 'leaf', 7);
      b.cyl(0.025, 0.025, 0.08, '#5f9a4c', 0.06, top + 0.08, 0, {}, 'leaf', 6);
      b.ball(0.025, '#ff8fb1', 0, top + 0.23, 0, {}, 'leaf', 0);
    },
  },
  vase: {
    name: 'Flower Vase', cat: 'deco', icon: 'flower', size: [1, 1], cost: { coins: 35, glass: 1 }, comfort: 2, unlock: 2,
    build(b) {
      b.box(0.24, 0.3, 0.24, WL, 0, 0, 0);
      b.box(0.26, 0.025, 0.26, W, 0, 0.3, 0);
      b.cyl(0.05, 0.035, 0.12, '#86b8e8', 0, 0.325, 0, {}, 'smooth', 8);
      for (let k = 0; k < 5; k++) {
        const a = k * 1.3;
        b.box(0.006, 0.12, 0.006, '#4d8f45', Math.cos(a) * 0.02, 0.43, Math.sin(a) * 0.02, { rz: Math.cos(a) * 0.3, rx: Math.sin(a) * 0.3 });
        b.ball(0.025, ['#ff8fb1', '#ffd85c', '#b58cff', '#ff6a5a', '#ffffff'][k], Math.cos(a) * 0.05, 0.55, Math.sin(a) * 0.05, {}, 'leaf', 0);
      }
    },
  },
  globe: {
    name: 'Globe', cat: 'deco', icon: 'compass', size: [1, 1], cost: { coins: 120, plank: 1, glass: 1 }, comfort: 2, fun: 1, unlock: 5,
    build(b) {
      b.cyl(0.06, 0.08, 0.02, WD, 0, 0, 0, {}, 'smooth', 8);
      b.cyl(0.012, 0.012, 0.32, BRASS, 0, 0.02, 0, {}, 'smooth', 6);
      b.ball(0.12, '#3f8fc2', 0, 0.42, 0, { rz: 0.4 }, 'smooth', 2);
      b.ball(0.05, '#7fb84e', 0.06, 0.47, 0.07, {}, 'smooth', 0);
      b.ball(0.04, '#7fb84e', -0.07, 0.38, 0.07, {}, 'smooth', 0);
    },
  },
  easel: {
    name: 'Painting Easel', cat: 'deco', icon: 'paint', size: [1, 1], cost: { coins: 90, plank: 2 }, comfort: 2, fun: 1, unlock: 4,
    build(b) {
      for (const sx of [-1, 1]) b.box(0.025, 0.7, 0.025, WL, sx * 0.1, 0, 0.04, { rz: -sx * 0.12 });
      b.box(0.025, 0.66, 0.025, WL, 0, 0, -0.1, { rx: 0.3 });
      b.box(0.26, 0.2, 0.02, '#f4f1ea', 0, 0.32, 0.06, { rx: -0.08 }, 'smooth');
      b.box(0.1, 0.06, 0.005, '#86b8e8', -0.05, 0.42, 0.072, { rx: -0.08 }, 'smooth');
      b.box(0.08, 0.05, 0.005, '#7fb84e', 0.05, 0.36, 0.072, { rx: -0.08 }, 'smooth');
      b.ball(0.025, '#ffd23d', 0.08, 0.47, 0.07, {}, 'smooth', 0);
      b.box(0.3, 0.02, 0.04, WD, 0, 0.3, 0.07);
    },
  },
  catbed: {
    name: 'Cat Basket', cat: 'deco', icon: 'heart', size: [1, 1], cost: { coins: 70, food: 4, wood: 2 }, comfort: 3, unlock: 3,
    build(b) {
      b.cyl(0.17, 0.15, 0.08, '#c8a060', 0, 0, 0, {}, 'rough', 12);
      b.cyl(0.14, 0.14, 0.02, '#e94f6a', 0, 0.06, 0, {}, 'smooth', 12);
      // a sleeping cat curled up
      b.ball(0.08, '#e8913a', 0, 0.1, 0, { sy: 0.6 }, 'smooth', 1);
      b.ball(0.045, '#e8913a', 0.07, 0.12, 0.03, {}, 'smooth', 1);
      for (const sz of [-1, 1]) b.box(0.015, 0.025, 0.015, '#e8913a', 0.08, 0.16, 0.03 + sz * 0.02);
      b.box(0.12, 0.025, 0.03, '#c8742a', -0.02, 0.1, 0.07, { ry: 0.6 }, 'smooth');
    },
  },
  aquarium: {
    name: 'Aquarium', cat: 'deco', icon: 'aquarium', size: [1, 1], cost: { coins: 220, glass: 4, sand: 2 }, comfort: 4, fun: 1, unlock: 6,
    build(b) {
      b.box(0.44, 0.3, 0.3, WD, 0, 0, -0.04);
      b.glowBox(0.4, 0.24, 0.24, '#5fd0f0', 1.4, 0, 0.3, -0.04, {}, '#7fd6ee', true);
      b.box(0.42, 0.03, 0.26, '#3a3e48', 0, 0.54, -0.04);
      b.box(0.36, 0.03, 0.2, '#e8d3a0', 0, 0.31, -0.04, {}, 'rough');
      b.box(0.05, 0.03, 0.01, '#ff8a3d', -0.06, 0.42, 0.085);
      b.box(0.04, 0.025, 0.01, '#ffd23d', 0.08, 0.38, 0.085);
      b.box(0.02, 0.12, 0.02, '#3f8a35', 0.12, 0.33, -0.08, {}, 'leaf');
    },
    light: { y: 0.42, z: 0.15, color: '#6fd8ff', power: 0.5 },
  },
  piano: {
    name: 'Upright Piano', cat: 'deco', icon: 'piano', size: [2, 1], cost: { coins: 520, plank: 8, ore: 3 }, comfort: 5, fun: 2, unlock: 7,
    build(b) {
      b.box(0.84, 0.66, 0.24, '#2a1e1a', 0, 0, -0.12, {}, 'smooth');
      b.box(0.86, 0.04, 0.26, '#3a2a24', 0, 0.66, -0.12, {}, 'smooth');
      b.box(0.8, 0.04, 0.14, '#f4f1ea', 0, 0.34, 0.06, {}, 'smooth');
      for (let k = 0; k < 11; k++) b.box(0.025, 0.02, 0.08, '#1b1d2b', -0.33 + k * 0.066, 0.38, 0.03, {}, 'smooth');
      b.box(0.82, 0.05, 0.16, '#2a1e1a', 0, 0.3, 0.06, {}, 'smooth');
      for (const sx of [-1, 1]) b.box(0.04, 0.3, 0.04, '#2a1e1a', sx * 0.38, 0, 0.1);
      b.box(0.24, 0.16, 0.02, '#f4f1ea', 0, 0.46, -0.0, { rx: -0.2 }, 'smooth');
      b.cyl(0.03, 0.03, 0.08, BRASS, 0.3, 0.7, -0.12, {}, 'smooth', 6);
    },
  },
  gramophone: {
    name: 'Gramophone', cat: 'deco', icon: 'music', size: [1, 1], cost: { coins: 180, plank: 2, ore: 2 }, comfort: 3, fun: 2, unlock: 5,
    build(b) {
      b.box(0.26, 0.3, 0.26, WD, 0, 0, 0);
      b.box(0.24, 0.08, 0.24, W, 0, 0.3, 0);
      b.cyl(0.1, 0.1, 0.01, '#1b1d2b', 0, 0.385, 0, {}, 'smooth', 12);
      b.box(0.015, 0.16, 0.015, BRASS, 0.08, 0.38, -0.08, { rz: -0.4 });
      b.cyl(0.13, 0.02, 0.16, BRASS, 0.13, 0.5, -0.11, { rz: -0.9, ry: 0.6 }, 'smooth', 10);
    },
  },
  tv: {
    name: 'Retro TV', cat: 'deco', icon: 'tv', size: [1, 1], cost: { coins: 300, glass: 3, ore: 3 }, comfort: 4, fun: 2, unlock: 8,
    build(b) {
      b.box(0.42, 0.22, 0.3, WD, 0, 0, -0.04);
      b.box(0.38, 0.3, 0.26, '#3a3e48', 0, 0.22, -0.05, {}, 'smooth');
      b.glowBox(0.28, 0.2, 0.01, '#9fd8ff', 2.2, -0.03, 0.26, 0.08, {}, '#3a4a5a', true);
      b.ball(0.02, '#e2b33c', 0.15, 0.4, 0.08, {}, 'smooth', 0);
      b.ball(0.02, '#e2b33c', 0.15, 0.33, 0.08, {}, 'smooth', 0);
      for (const sx of [-1, 1]) b.box(0.008, 0.18, 0.008, IRON, sx * 0.06, 0.52, -0.08, { rz: sx * 0.5 });
    },
    light: { y: 0.36, z: 0.25, color: '#9fd8ff', power: 0.6 },
  },
  telescope: {
    name: 'Telescope', cat: 'deco', icon: 'eye', size: [1, 1], cost: { coins: 260, glass: 3, ore: 2 }, comfort: 3, fun: 2, unlock: 7,
    build(b) {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        b.box(0.02, 0.4, 0.02, WD, Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07, { rz: Math.cos(a) * 0.25, rx: -Math.sin(a) * 0.25 });
      }
      b.cyl(0.04, 0.05, 0.42, BRASS, 0, 0.42, 0, { rx: -1.0 }, 'smooth', 8);
      b.cyl(0.055, 0.055, 0.04, '#3a3e48', 0, 0.42, 0.19, { rx: -1.0 }, 'smooth', 8);
    },
  },
  trophy: {
    name: 'Trophy Pedestal', cat: 'deco', icon: 'trophy', size: [1, 1], cost: { coins: 400, crystal: 4 }, comfort: 4, unlock: 10,
    build(b) {
      b.box(0.26, 0.4, 0.26, '#efe6d6', 0, 0, 0, {}, 'smooth');
      b.box(0.3, 0.04, 0.3, '#d8cfbf', 0, 0.4, 0, {}, 'smooth');
      b.cyl(0.03, 0.05, 0.05, BRASS, 0, 0.44, 0, {}, 'smooth', 8);
      b.cyl(0.08, 0.03, 0.12, '#ffd23d', 0, 0.49, 0, {}, 'smooth', 10);
      for (const sx of [-1, 1]) b.box(0.03, 0.06, 0.012, '#ffd23d', sx * 0.09, 0.54, 0);
    },
  },
  crystalOrb: {
    name: 'Crystal Orb', cat: 'deco', icon: 'crystal', size: [1, 1], cost: { coins: 350, crystal: 6, essence: 1 }, comfort: 5, fun: 1, unlock: 12,
    build(b) {
      b.cyl(0.07, 0.1, 0.3, '#4a3a80', 0, 0, 0, {}, 'smooth', 8);
      b.cyl(0.08, 0.06, 0.04, BRASS, 0, 0.3, 0, {}, 'smooth', 8);
      b.glowBall(0.1, '#b58cff', 3, 0, 0.42, 0, '#c9a0ff', true);
    },
    light: { y: 0.45, color: '#b58cff', power: 0.9 },
  },

  // ---- on the walls
  frame: {
    name: 'Landscape Painting', cat: 'wall', icon: 'frame', size: [1, 1], cost: { coins: 40, plank: 1 }, comfort: 2, wall: true, unlock: 1,
    build(b) {
      b.box(0.34, 0.26, 0.03, BRASS, 0, 0.5, 0);
      b.box(0.29, 0.21, 0.01, '#86c0e8', 0, 0.525, 0.015, {}, 'smooth');
      b.box(0.29, 0.07, 0.012, '#6eb156', 0, 0.525, 0.016, {}, 'smooth');
      b.box(0.1, 0.06, 0.013, '#4d8f45', 0.06, 0.58, 0.017, {}, 'smooth');
      b.ball(0.025, '#ffd23d', -0.08, 0.66, 0.016, {}, 'smooth', 0);
    },
  },
  portrait: {
    name: 'Family Portrait', cat: 'wall', icon: 'frame', size: [1, 1], cost: { coins: 60, plank: 1 }, comfort: 3, wall: true, unlock: 3,
    build(b) {
      b.box(0.24, 0.32, 0.03, WD, 0, 0.46, 0);
      b.box(0.19, 0.27, 0.01, '#3a3048', 0, 0.485, 0.015, {}, 'smooth');
      b.ball(0.04, '#f1c7a3', 0, 0.64, 0.02, {}, 'smooth', 0);
      b.box(0.12, 0.1, 0.01, '#c94a3d', 0, 0.52, 0.02, {}, 'smooth');
    },
  },
  clock: {
    name: 'Wall Clock', cat: 'wall', icon: 'clock', size: [1, 1], cost: { coins: 70, plank: 1, ore: 1 }, comfort: 2, wall: true, clock: true, unlock: 2,
    build(b) {
      b.cyl(0.11, 0.11, 0.03, WD, 0, 0.6, 0, { rx: Math.PI / 2 }, 'smooth', 12);
      b.cyl(0.09, 0.09, 0.012, '#f4f1ea', 0, 0.6, 0.02, { rx: Math.PI / 2 }, 'smooth', 12);
    },
  },
  shelfWall: {
    name: 'Wall Shelf', cat: 'wall', icon: 'shelf', size: [1, 1], cost: { coins: 35, plank: 1 }, comfort: 2, wall: true, unlock: 1,
    build(b) {
      b.box(0.4, 0.025, 0.12, W, 0, 0.55, 0.05);
      for (const sx of [-1, 1]) b.box(0.02, 0.06, 0.08, WD, sx * 0.16, 0.5, 0.03);
      b.cyl(0.03, 0.025, 0.06, '#c56b44', -0.12, 0.575, 0.05, {}, 'rough', 6);
      b.ball(0.04, '#5aa84b', -0.12, 0.66, 0.05, {}, 'leaf', 0);
      b.box(0.05, 0.1, 0.07, '#3f6fb0', 0.04, 0.575, 0.05, {}, 'smooth');
      b.box(0.04, 0.09, 0.07, '#c94a3d', 0.09, 0.575, 0.05, {}, 'smooth');
      b.cyl(0.025, 0.025, 0.07, '#e9e4da', 0.15, 0.575, 0.05, {}, 'smooth', 6);
    },
  },
  mirror: {
    name: 'Mirror', cat: 'wall', icon: 'frame', size: [1, 1], cost: { coins: 80, glass: 2 }, comfort: 2, wall: true, unlock: 4,
    build(b) {
      b.box(0.2, 0.34, 0.025, BRASS, 0, 0.38, 0);
      b.glowBox(0.16, 0.3, 0.01, '#cfe8ff', 0.5, 0, 0.4, 0.015, {}, '#bfe0ff', true);
    },
  },
  banner: {
    name: 'Island Banner', cat: 'wall', icon: 'festival', size: [1, 1], cost: { coins: 50, food: 2 }, comfort: 2, wall: true, unlock: 2,
    build(b, c) {
      b.cyl(0.012, 0.012, 0.34, WD, 0, 0.76, 0.03, { rz: Math.PI / 2 }, 'smooth', 6);
      b.box(0.26, 0.36, 0.012, c.rug, 0, 0.4, 0.03, {}, 'smooth');
      b.box(0.2, 0.04, 0.014, '#ffd23d', 0, 0.62, 0.032, {}, 'smooth');
      b.box(0.1, 0.1, 0.014, '#ffd23d', 0, 0.48, 0.032, { rz: 0.785 }, 'smooth');
    },
  },
  fairy: {
    name: 'Fairy Lights', cat: 'wall', icon: 'sparkle', size: [1, 1], cost: { coins: 45, glass: 1 }, comfort: 2, wall: true, unlock: 3,
    build(b) {
      for (let k = 0; k < 7; k++) {
        const x = -0.2 + k * 0.066, y = 0.85 - Math.sin((k / 6) * Math.PI) * 0.07;
        b.glowBall(0.018, ['#ffd23d', '#ff8fb1', '#7df9ff', '#b6ff8a'][k % 4], 5, x, y, 0.03, '#efe0b0');
      }
      b.box(0.44, 0.006, 0.006, '#3a3e48', 0, 0.85, 0.03);
    },
  },
};

export const FURNI_CATS = [
  { id: 'bed', name: 'Beds' },
  { id: 'seat', name: 'Seating' },
  { id: 'table', name: 'Tables' },
  { id: 'storage', name: 'Storage' },
  { id: 'kitchen', name: 'Kitchen' },
  { id: 'bath', name: 'Bath' },
  { id: 'light', name: 'Lights' },
  { id: 'rug', name: 'Rugs' },
  { id: 'deco', name: 'Decor' },
  { id: 'wall', name: 'Wall' },
];

// Wall and floor finishes. Index 0 is free (the default).
export const WALLPAPERS = [
  { name: 'Plaster', a: '#e9dcc4', b: '#dccbb0', cost: null },
  { name: 'Pine Planks', a: '#c9a06c', b: '#b88f5c', planks: 1, cost: { coins: 60, plank: 4 } },
  { name: 'Sage Stripes', a: '#b9cfa8', b: '#a6bf94', stripes: 1, cost: { coins: 80 } },
  { name: 'Rose Stripes', a: '#efc6c6', b: '#e2b1b4', stripes: 1, cost: { coins: 80 } },
  { name: 'Sky Blue', a: '#bcd6ee', b: '#a9c6e2', cost: { coins: 70 } },
  { name: 'Brick', a: '#b8634a', b: '#a0523e', brick: 1, cost: { coins: 120, brick: 4 } },
  { name: 'Stone', a: '#a4a7b0', b: '#8f939c', brick: 1, cost: { coins: 120, stone: 8 } },
  { name: 'Royal Plum', a: '#7a5a8a', b: '#6a4a7a', stripes: 1, cost: { coins: 260, crystal: 2 } },
  { name: 'Midnight Stars', a: '#2f3a68', b: '#26305a', stars: 1, cost: { coins: 320, crystal: 3 } },
];
export const FLOORS = [
  { name: 'Oak Boards', a: '#b07e52', b: '#9f6f46', cost: null },
  { name: 'Dark Walnut', a: '#6e4a34', b: '#5e3e2b', cost: { coins: 90, plank: 4 } },
  { name: 'Birch', a: '#dcc39a', b: '#cdb28a', cost: { coins: 90, plank: 4 } },
  { name: 'Checker Tiles', a: '#e9e4da', b: '#3a3e48', tiles: 1, cost: { coins: 140, stone: 6 } },
  { name: 'Terracotta', a: '#c8704a', b: '#b8603e', tiles: 1, cost: { coins: 120, brick: 4 } },
  { name: 'Mint Tiles', a: '#a8dcc4', b: '#94ccb2', tiles: 1, cost: { coins: 120, stone: 4, glass: 1 } },
  { name: 'Marble', a: '#eef0f4', b: '#d8dce4', tiles: 1, cost: { coins: 300, stone: 10, crystal: 2 } },
];

// Soft furnishings colours, picked per home so neighbours' houses look different.
const SETS = [
  { blanket: '#c94a3d', blanket2: '#f2d36b', cushion: '#e2b33c', sofa: '#3f6e4f', sofa2: '#2f5a3f', cloth: '#f4f1ea', rug: '#c94a3d', rug2: '#f2d36b', shade: '#f4e6c8' },
  { blanket: '#3f6fb0', blanket2: '#bcd6ee', cushion: '#86b8e8', sofa: '#2f4a7a', sofa2: '#23385e', cloth: '#e9eef6', rug: '#2f4a7a', rug2: '#bcd6ee', shade: '#e6eef8' },
  { blanket: '#6b4a8a', blanket2: '#e8c8f0', cushion: '#b58cff', sofa: '#8a5a9a', sofa2: '#6a447a', cloth: '#f4ecf8', rug: '#6b4a8a', rug2: '#e8c8f0', shade: '#f2e6f6' },
  { blanket: '#3f8a5a', blanket2: '#f4e6c0', cushion: '#e8913a', sofa: '#b8673a', sofa2: '#94522e', cloth: '#f4f1ea', rug: '#b8673a', rug2: '#f4e6c0', shade: '#f6ead4' },
  { blanket: '#e86a9a', blanket2: '#ffe0ea', cushion: '#ff8fb1', sofa: '#c9a06c', sofa2: '#a8844f', cloth: '#fff4f6', rug: '#e86a9a', rug2: '#ffe0ea', shade: '#fff0f4' },
];
export const softColors = (seed) => SETS[((seed % SETS.length) + SETS.length) % SETS.length];

const MODEL_CACHE = new Map();
/** A furniture model (THREE.Group, centred on its footprint, facing +z). */
export function furnitureModel(id, seed = 0) {
  const def = FURNITURE[id];
  const b = new Builder();
  def.build(b, softColors(seed));
  const g = b.build();
  g.userData.furniture = id;
  return g;
}

/** Footprint in cells after rotation r (0..3). */
export function footprintOf(id, r = 0) {
  const [w, d] = FURNITURE[id].size;
  return r % 2 ? [d, w] : [w, d];
}

/** Total comfort and sleeping places of a furnished home. */
export function homeStats(furni = []) {
  let comfort = 0, sleeps = 0, fun = 0, lights = 0, cook = false;
  const seen = new Map();
  for (const f of furni) {
    const d = FURNITURE[f.t];
    if (!d) continue;
    // repeats of the same item count less: a room full of plants is not twice as cosy
    const n = (seen.get(f.t) || 0) + 1;
    seen.set(f.t, n);
    comfort += (d.comfort || 0) / Math.sqrt(n);
    sleeps += d.sleeps || 0;
    fun += d.fun || 0;
    if (d.light) lights++;
    if (d.cook) cook = true;
  }
  return { comfort: Math.round(comfort * 10) / 10, sleeps, fun, lights, cook };
}

// ---------------------------------------------------------------- rooms

// interior grid (cells) per building type and level
const ROOM = {
  rumah: [[7, 5], [8, 6], [9, 6]],
  vila: [[10, 7], [11, 8], [12, 8]],
  apartemen: [[9, 6], [10, 7], [11, 7]],
  balai: [[9, 7], [10, 7], [11, 8]],
};
export const ENTERABLE = new Set(Object.keys(ROOM));
export function roomSize(rec) {
  const r = ROOM[rec.type] || ROOM.rumah;
  return r[Math.min(2, Math.max(0, (rec.level || 1) - 1))];
}
/** The entrance cell: on the left wall, near the front. */
export const doorCell = (W, D) => [0, D - 2];


// ---------------------------------------------------------------- default furnishing

/**
 * A pleasant starting layout for a home, scored placement rather than fixed coordinates so it
 * works for every room size: beds against the back wall, kitchen in the back corner, a table on a
 * rug with chairs around it, a plant and a lamp in the corners, pictures on the walls.
 */
export function defaultFurniture(rec, residents) {
  const [W, D] = roomSize(rec);
  const out = [];
  const occ = new Set(), wallOcc = new Set();
  const [dx, dz] = doorCell(W, D);
  occ.add(`${dx},${dz}`);
  occ.add(`${dx + 1},${dz}`);
  const fits = (t, x, z, r) => {
    const [fw, fd] = footprintOf(t, r);
    if (x < 0 || z < 0 || x + fw > W || z + fd > D) return false;
    if (FURNITURE[t].layer === 'rug') return true;
    for (let a = 0; a < fw; a++) for (let b = 0; b < fd; b++) if (occ.has(`${x + a},${z + b}`)) return false;
    return true;
  };
  const put = (t, x, z, r) => {
    const [fw, fd] = footprintOf(t, r);
    if (FURNITURE[t].layer !== 'rug') for (let a = 0; a < fw; a++) for (let b = 0; b < fd; b++) occ.add(`${x + a},${z + b}`);
    const f = { t, x, z, r };
    out.push(f);
    return f;
  };
  const best = (t, score, rots = [0, 1, 2, 3]) => {
    let pick = null, bs = -Infinity;
    for (const r of rots)
      for (let x = 0; x < W; x++)
        for (let z = 0; z < D; z++) {
          if (!fits(t, x, z, r)) continue;
          const [fw, fd] = footprintOf(t, r);
          const s = score(x, z, r, x + fw / 2, z + fd / 2, fw, fd);
          if (s > bs) {
            bs = s;
            pick = [x, z, r];
          }
        }
    return pick ? put(t, ...pick) : null;
  };
  const wall = (t, prefer) => {
    // r: 0 back wall (z = 0), 1 left wall (x = 0)
    for (const [r, i] of prefer) {
      const key = `${r}:${i}`;
      if (wallOcc.has(key)) continue;
      if (r === 1 && i >= dz - 1) continue; // keep clear of the door
      wallOcc.add(key);
      out.push({ t, x: r === 0 ? i : 0, z: r === 1 ? i : 0, r });
      return;
    }
  };

  const mayor = rec.type === 'balai';
  const n = Math.max(1, residents);
  // beds against the back wall, from the left
  const beds = [];
  if (mayor) beds.push('double');
  else {
    let left = n;
    while (left > 0) {
      if (left >= 2 && (rec.level || 1) >= 2 && beds.filter((b) => b === 'double').length < 1) { beds.push('double'); left -= 2; }
      else if (left >= 2) { beds.push('bunk'); left -= 2; }
      else { beds.push('bed'); left -= 1; }
    }
  }
  for (const t of beds) {
    if (!best(t, (x, z, r) => (r === 0 && z === 0 ? 100 : r === 1 && x === 0 ? 60 : -50) - x * 2 - z)) best('mat', (x, z) => -x - z * 2);
  }
  // kitchen in the back-right corner
  if (!mayor) {
    best('stove', (x, z, r) => (r === 0 && z === 0 ? 50 : -40) + x * 3);
    best('counter', (x, z, r) => (r === 0 && z === 0 ? 50 : -40) + x * 2);
    if (W >= 8) best('barrel', (x, z, r) => (z === 0 ? 30 : 0) + x * 2 - (r ? 5 : 0));
  } else {
    best('fireplace', (x, z, r) => (r === 0 && z === 0 ? 60 : -40) + x * 2);
    best('bookshelf', (x, z, r) => (r === 0 && z === 0 ? 50 : -40) + x * 3);
    best('desk', (x, z, r, cx, cz) => (r === 1 && x === 0 ? 30 : r === 0 && z === 0 ? 25 : -20) - cz);
    best('wardrobe', (x, z, r) => (r === 1 && x === 0 ? 40 : -30) - z * 2);
  }
  // table on a rug in the middle, chairs around it
  const midX = W / 2 + 0.5, midZ = D / 2 + 0.6;
  const tbl = best(mayor ? 'coffee' : 'dining', (x, z, r, cx, cz) => -Math.abs(cx - midX) - Math.abs(cz - midZ) * 1.3 - (r ? 0.5 : 0), [0, 1]);
  if (tbl) {
    const [fw, fd] = footprintOf(tbl.t, tbl.r);
    const tx = tbl.x + fw / 2, tz = tbl.z + fd / 2;
    out.unshift({ t: mayor ? 'rugFancy' : 'rugRound', x: Math.max(0, Math.min(W - (mayor ? 3 : 2), Math.round(tx - (mayor ? 1.5 : 1)))), z: Math.max(0, Math.min(D - 2, Math.round(tz - 1))), r: 0 });
    const seats = mayor ? ['armchair', 'sofa'] : n >= 3 ? ['chair', 'chair', 'chair', 'stool'] : ['chair', 'chair'];
    for (const s of seats) {
      best(s, (x, z, r, cx, cz) => {
        const ddx = tx - cx, ddz = tz - cz, d = Math.hypot(ddx, ddz);
        const face = [[0, 1], [1, 0], [0, -1], [-1, 0]][r];
        return -d * 3 + ((face[0] * ddx + face[1] * ddz) / (d || 1)) * 4;
      });
    }
  }
  // corners and walls
  best('plant', (x, z, r, cx, cz) => cx + cz * 1.2 - (r ? 0.1 : 0));
  best('candle', (x, z, r, cx, cz) => (z === 0 ? 4 : 0) + (x === W - 1 ? 3 : 0) - Math.abs(cx - W * 0.6) * 0.3 - (r ? 0.1 : 0));
  if (mayor) best('lamp', (x, z, r, cx, cz) => (x === 0 ? 5 : 0) + cz * 0.5 - (r ? 0.1 : 0));
  wall('frame', [[0, Math.floor(W / 2)], [0, Math.floor(W / 2) + 1], [1, 1]]);
  wall('clock', [[1, Math.floor(D / 2) - 1], [1, 1], [0, W - 2]]);
  wall('shelfWall', [[0, W - 3], [0, 1], [1, 2]]);
  if ((rec.level || 1) >= 2 || mayor) wall('portrait', [[1, 0], [0, 2], [0, W - 4]]);
  return out;
}



/** Comfort -> 0..5 stars for the UI. */
export const comfortStars = (c) => Math.max(0, Math.min(5, Math.floor(c / 6)));
