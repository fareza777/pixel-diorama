// Generates the app icon, adaptive icon layers, splash screens and the Play Store icon as PNGs.
// The art is a tiny isometric diorama drawn on a 64x64 pixel grid, scaled up nearest-neighbour.
// No dependencies: PNG encoding uses node:zlib.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// ---------------------------------------------------------------- PNG
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- art
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
class Grid {
  constructor(n) {
    this.n = n;
    this.px = new Array(n * n).fill(null);
  }
  set(x, y, c) {
    if (x >= 0 && y >= 0 && x < this.n && y < this.n) this.px[y * this.n + x] = c;
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < this.n && y < this.n ? this.px[y * this.n + x] : null;
  }
  poly(pts, c) {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
      for (let x = 0; x < this.n; x++) {
        const px = x + 0.5, py = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(x, y, c);
      }
  }
  disc(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, c);
  }
  outline(c) {
    const add = [];
    for (let y = 0; y < this.n; y++)
      for (let x = 0; x < this.n; x++)
        if (!this.get(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => this.get(x + a, y + b) && this.get(x + a, y + b) !== c)) add.push([x, y]);
    for (const [x, y] of add) this.set(x, y, c);
  }
}

function diorama() {
  const G = new Grid(64);
  const K = 12, OX = 32, OY = 31;
  const iso = (x, y, z) => [OX + (x - z) * K, OY + ((x + z) * K) / 2 - y * K];
  const quad = (a, b, c, d, col) => G.poly([iso(...a), iso(...b), iso(...c), iso(...d)], hex(col));
  // island block with strata
  const top = 0, depth = -1.05;
  const bands = [[0, -0.12, '#5b9547', '#4d8a3e'], [-0.12, -0.5, '#8e6444', '#7a5236'], [-0.5, -0.8, '#7f593c', '#6a4630'], [-0.8, depth, '#62646f', '#545660']];
  for (const [y0, y1, cl, cr] of bands) {
    quad([-1, y0, 1], [1, y0, 1], [1, y1, 1], [-1, y1, 1], cl);
    quad([1, y0, 1], [1, y0, -1], [1, y1, -1], [1, y1, 1], cr);
  }
  quad([-1, top, -1], [1, top, -1], [1, top, 1], [-1, top, 1], '#6eb156');
  // water corner
  quad([0.25, 0.001, 0.3], [1, 0.001, 0.3], [1, 0.001, 1], [0.25, 0.001, 1], '#3f8fc2');
  quad([0.25, 0.002, 0.3], [1, 0.002, 0.3], [1, 0.002, 0.45], [0.25, 0.002, 0.45], '#86d0e8');
  quad([1, 0, 0.3], [1, 0, 1], [1, -0.4, 1], [1, -0.4, 0.3], '#2f6ab0');
  quad([0.25, 0, 1], [1, 0, 1], [1, -0.4, 1], [0.25, -0.4, 1], '#3f7ac0');
  // path
  quad([-0.15, 0.003, 0.15], [0.05, 0.003, 0.15], [0.05, 0.003, 1], [-0.15, 0.003, 1], '#d4b383');
  // house
  const x0 = -0.75, x1 = -0.05, z0 = -0.65, z1 = 0.05, h = 0.55, ridge = 0.95;
  quad([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], '#efe5d2');
  quad([x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], '#d8ccb6');
  const zm = (z0 + z1) / 2;
  G.poly([iso(x1, h, z1), iso(x1, h, z0), iso(x1, ridge, zm)], hex('#d8ccb6'));
  quad([x0 - 0.06, h - 0.05, z1 + 0.1], [x1 + 0.06, h - 0.05, z1 + 0.1], [x1 + 0.06, ridge, zm], [x0 - 0.06, ridge, zm], '#c94a3d');
  quad([x0 - 0.06, ridge, zm], [x1 + 0.06, ridge, zm], [x1 + 0.06, h - 0.05, z0 - 0.1], [x0 - 0.06, h - 0.05, z0 - 0.1], '#a8382f');
  quad([-0.32, 0, z1 + 0.001], [-0.18, 0, z1 + 0.001], [-0.18, 0.3, z1 + 0.001], [-0.32, 0.3, z1 + 0.001], '#5e3f2b');
  quad([-0.62, 0.18, z1 + 0.001], [-0.46, 0.18, z1 + 0.001], [-0.46, 0.34, z1 + 0.001], [-0.62, 0.34, z1 + 0.001], '#ffc36b');
  quad([x1 + 0.001, 0.18, -0.2], [x1 + 0.001, 0.18, -0.38], [x1 + 0.001, 0.34, -0.38], [x1 + 0.001, 0.34, -0.2], '#ffb05a');
  // tree
  const [tx, ty] = iso(0.55, 0, -0.45);
  G.poly([[tx - 1, ty], [tx + 1, ty], [tx + 1, ty - 8], [tx - 1, ty - 8]], hex('#6a4630'));
  G.disc(tx, ty - 12, 6.5, hex('#3d7a4b'));
  G.disc(tx - 1.5, ty - 13.5, 4.2, hex('#4d8f45'));
  G.disc(tx - 2.5, ty - 15, 1.6, hex('#6aa84e'));
  // person
  const [px, py] = iso(0.1, 0, 0.55);
  G.poly([[px - 1, py], [px + 1, py], [px + 1, py - 3], [px - 1, py - 3]], hex('#2b2f3a'));
  G.poly([[px - 1.5, py - 3], [px + 1.5, py - 3], [px + 1.5, py - 6], [px - 1.5, py - 6]], hex('#2f4a7a'));
  G.poly([[px - 1, py - 6], [px + 1, py - 6], [px + 1, py - 8], [px - 1, py - 8]], hex('#f1c7a3'));
  G.poly([[px - 1.5, py - 8], [px + 1.5, py - 8], [px + 1.5, py - 9], [px - 1.5, py - 9]], hex('#c94a3d'));
  G.outline(hex('#141826'));
  return G;
}

function render(G, size, opts = {}) {
  return png(size, size, renderRaw(G, size, opts));
}
function renderRaw(G, size, { bg = null, scale = 1, stars = false, round = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const bgc = bg ? hex(bg) : null;
  const n = G.n;
  const art = size * scale;
  const off = (size - art) / 2;
  const r2 = (size / 2) ** 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (round && (x + 0.5 - size / 2) ** 2 + (y + 0.5 - size / 2) ** 2 > r2) continue;
      let c = null;
      const gx = Math.floor(((x - off) / art) * n), gy = Math.floor(((y - off) / art) * n);
      if (gx >= 0 && gy >= 0 && gx < n && gy < n) c = G.get(gx, gy);
      if (!c && bgc) {
        // soft vertical gradient and a few stars
        const t = y / size;
        c = [Math.round(bgc[0] * (1.25 - t * 0.5)), Math.round(bgc[1] * (1.25 - t * 0.5)), Math.round(bgc[2] * (1.2 - t * 0.4)), 255];
        if (stars) {
          const sx = Math.floor((x / size) * 64), sy = Math.floor((y / size) * 64);
          const hsh = ((sx * 73856093) ^ (sy * 19349663)) >>> 0;
          if (hsh % 97 === 0 && sy < 30) c = [230, 236, 255, 255];
        }
      }
      if (c) buf.set(c.map((v) => Math.min(255, Math.max(0, v))), i);
    }
  return buf;
}

// ---------------------------------------------------------------- outputs
const G = diorama();
const BG = '#1b2240';
const write = (p, data) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
};
write('public/icon-192.png', render(G, 192, { bg: BG, scale: 0.9, stars: true }));
write('public/icon-512.png', render(G, 512, { bg: BG, scale: 0.9, stars: true }));
write('store/play-icon-512.png', render(G, 512, { bg: BG, scale: 0.9, stars: true }));

const res = 'android/app/src/main/res';
if (fs.existsSync(res)) {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    write(`${res}/mipmap-${d}/ic_launcher.png`, render(G, Math.round(48 * k), { bg: BG, scale: 0.92, stars: true }));
    write(`${res}/mipmap-${d}/ic_launcher_round.png`, render(G, Math.round(48 * k), { bg: BG, scale: 0.85, stars: true, round: true }));
    // adaptive foreground: art inside the 66dp safe zone of the 108dp canvas
    write(`${res}/mipmap-${d}/ic_launcher_foreground.png`, render(G, Math.round(108 * k), { scale: 0.62 }));
  }
  write(`${res}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);
  // splash screens: replace every splash.png the template ships with
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  for (const f of walk(res).filter((f) => path.basename(f) === 'splash.png')) {
    const head = fs.readFileSync(f);
    const w = head.readUInt32BE(16), h = head.readUInt32BE(20);
    const s = Math.min(w, h);
    const sq = renderRaw(G, s, { scale: 0.42 });
    // center the square art on a full background canvas
    const out = Buffer.alloc(w * h * 4);
    const bg = hex('#0b0d1a');
    for (let i = 0; i < w * h; i++) out.set(bg, i * 4);
    const ox = Math.floor((w - s) / 2), oy = Math.floor((h - s) / 2);
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        const si = (y * s + x) * 4;
        if (sq[si + 3]) out.set(sq.subarray(si, si + 4), ((y + oy) * w + x + ox) * 4);
      }
    write(f, png(w, h, out));
  }
  console.log('android icons and splash written');
}
console.log('icons written');
