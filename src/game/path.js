// A* on the tile grid with 8-way moves, road preference and step-height limits.
import { N, idx, inside, WALKABLE, ROADS } from './island.js';

const MAX_STEP = 0.5;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

class Heap {
  constructor() {
    this.a = [];
  }
  push(k, f) {
    const a = this.a;
    a.push([f, k]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[1];
  }
  get size() {
    return this.a.length;
  }
}

/**
 * passable(k) decides building tiles; everything else comes from the island.
 * Returns a list of [i, j] from start (exclusive) to goal (inclusive), or null.
 */
export function findPath(I, passable, from, to, maxExpand = 900) {
  const [si, sj] = from, [ti, tj] = to;
  if (!inside(ti, tj)) return null;
  const goal = idx(ti, tj), start = idx(si, sj);
  if (start === goal) return [];
  const ok = (i, j) => {
    if (!inside(i, j)) return false;
    const k = idx(i, j);
    if (k === goal || k === start) return true;
    return WALKABLE.has(I.t[k]) && passable(k);
  };
  const g = new Float32Array(N * N).fill(Infinity);
  const came = new Int32Array(N * N).fill(-1);
  const closed = new Uint8Array(N * N);
  const h = (i, j) => Math.hypot(i - ti, j - tj) * 0.55;
  const open = new Heap();
  g[start] = 0;
  open.push(start, h(si, sj));
  let expanded = 0;
  while (open.size && expanded++ < maxExpand) {
    const k = open.pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === goal) break;
    const i = Math.floor(k / N), j = k % N;
    for (const [di, dj, c] of DIRS) {
      const ni = i + di, nj = j + dj;
      if (!ok(ni, nj)) continue;
      if (di && dj && (!ok(i + di, j) || !ok(i, j + dj))) continue; // no corner cutting
      const nk = idx(ni, nj);
      if (Math.abs(I.h[nk] - I.h[k]) > MAX_STEP) continue;
      const t = I.t[nk];
      let cost = c * (ROADS.has(t) ? 0.55 : t === 's' ? 1.15 : 1);
      if (I.nodes[nk] && I.nodes[nk].hp !== 0) cost += 2.5;
      const ng = g[k] + cost;
      if (ng < g[nk]) {
        g[nk] = ng;
        came[nk] = k;
        open.push(nk, ng + h(ni, nj));
      }
    }
  }
  if (came[goal] < 0) return null;
  const out = [];
  for (let k = goal; k !== start && k >= 0; k = came[k]) out.push([Math.floor(k / N), k % N]);
  return out.reverse();
}
