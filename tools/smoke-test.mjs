// Headless smoke test: serves dist/, opens the game in Chrome with a phone viewport, plays a few
// scripted actions through the debug handle and saves screenshots to tools/shots/.
// Usage: npm run build && node tools/smoke-test.mjs [chromePath]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve('dist');
const shots = path.resolve('tools/shots');
fs.mkdirSync(shots, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(p, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(5199, r));

const chrome = process.argv[2] || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const [w, h] = (process.env.VIEW || '412x892').split('x').map(Number);
await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto('http://localhost:5199/index.html', { waitUntil: 'load' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.waitForFunction(() => window.__pd && window.__pd.ui && !document.querySelector('#btn-start').disabled, { timeout: 60000 });
await wait(1500);
await page.screenshot({ path: `${shots}/01-title.png` });
await page.click('#btn-start');
await wait(1500);
await page.screenshot({ path: `${shots}/02-start.png` });

const run = (fn, ...args) => page.evaluate(fn, ...args);
// close any modal (daily reward), then play
await run(() => {
  const ui = window.__pd.ui;
  while (ui._modalOpen) ui.closeModal();
  if (ui.sheetOpen) ui.closeSheet();
});
const report = await run(() => {
  const app = window.__pd, g = app.game;
  g.s.player.coins = 5000;
  Object.assign(g.s.res, { wood: 300, stone: 300, food: 200, plank: 60, brick: 40, glass: 20, ore: 30, tool: 10 });
  g.s.player.level = 12;
  const I = g.I;
  const out = [];
  const tryPlace = (type, i, j) => {
    const r = g.place(type, i, j, 0);
    out.push(`${type}@${i},${j}: ${r.ok ? 'ok' : r.reason}`);
    return r.rec;
  };
  const p = I.plaza;
  tryPlace('rumah', p.i - 2, p.j + 3);
  tryPlace('rumah', p.i - 3, p.j + 1);
  tryPlace('rumah', p.i + 3, p.j + 2);
  tryPlace('ladang', p.i + 2, p.j - 3);
  tryPlace('penebang', p.i - 3, p.j - 2);
  tryPlace('taman', p.i + 1, p.j + 3);
  tryPlace('sumur', p.i + 3, p.j - 1);
  tryPlace('lampu', p.i + 2, p.j + 3);
  tryPlace('kedai', p.i - 2, p.j - 1);
  tryPlace('bengkel', p.i + 4, p.j);
  tryPlace('pasar', p.i - 5, p.j + 3);
  tryPlace('kincir', p.i + 4, p.j - 3);
  for (const b of I.buildings) b.progress = 0.99;
  return out;
});
console.log(report.join('\n'));
await wait(2500);
await run(() => {
  const app = window.__pd;
  app.cam.goal.zoom = 1.25;
});
await wait(1200);
await page.screenshot({ path: `${shots}/03-built.png` });

// time passes: villagers, production
await run(() => {
  const g = window.__pd.game;
  for (let k = 0; k < 4; k++) g.spawnNpc(g.I).arriving = 0;
  g.refreshIsland();
  for (const p of g.I.npcs) window.__pd.world.npcs.has(p.id) || window.__pd.world.addNpc(p);
  g.s.time.hour = 9.2;
});
await wait(4000);
await page.screenshot({ path: `${shots}/04-morning.png` });
await run(() => {
  const g = window.__pd.game;
  g.s.time.hour = 19.4;
  g.s.weather[g.biome] = { name: 'rain', until: g.absHour() + 5 };
});
await wait(5000);
await page.screenshot({ path: `${shots}/05-dusk-rain.png` });
await run(() => {
  const g = window.__pd.game;
  g.s.time.hour = 23;
  g.s.weather[g.biome] = { name: 'clear', until: g.absHour() + 5 };
});
await wait(4500);
await page.screenshot({ path: `${shots}/06-night.png` });

// UI panels
await run(() => {
  const g = window.__pd.game;
  g.s.time.hour = 11;
  window.__pd.ui.openBuild('home');
});
await wait(3000);
await page.screenshot({ path: `${shots}/07-build-menu.png` });
await run(() => window.__pd.ui.openQuests());
await wait(600);
await page.screenshot({ path: `${shots}/08-quests.png` });
await run(() => {
  const ui = window.__pd.ui, g = window.__pd.game;
  ui.openNpc(g.I.npcs[0].id);
});
await wait(600);
await page.screenshot({ path: `${shots}/09-npc.png` });
await run(() => window.__pd.ui.openCraft());
await wait(500);
await page.screenshot({ path: `${shots}/10-craft.png` });
await run(() => window.__pd.ui.openMap());
await wait(500);
await page.screenshot({ path: `${shots}/11-map.png` });

// gameplay checks on a fresh world
const play = await run(async () => {
  const app = window.__pd, g = app.game, w = app.world, ui = app.ui;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  ui.closeSheet();
  g.newGame();
  g.s.settings.speed = 3;
  w.load();
  app.resetCamera();
  const out = {};
  const I = g.I;
  // 1. gather the nearest tree
  const m = w.mayor;
  let best = null, bd = 1e9;
  for (const [k, n] of Object.entries(I.nodes)) {
    if (n.hp === 0 || !['tree', 'pine', 'rock', 'bush'].includes(n.k)) continue;
    const p = w.nodeWorldPos(+k);
    const d = p.distanceTo(m.pos);
    if (d < bd) { bd = d; best = +k; }
  }
  const before = { ...g.s.res };
  out.gatherStarted = w.mayorGather(best);
  await sleep(9000);
  out.gathered = g.s.stats.gathered;
  out.resDelta = Object.fromEntries(Object.keys(before).map((k) => [k, g.s.res[k] - before[k]]).filter(([, v]) => v));
  // 2. place a house through the UI flow
  ui.startPlace('rumah');
  const p = I.plaza;
  let placed = false;
  for (let di = -6; di <= 6 && !placed; di++) for (let dj = -6; dj <= 6 && !placed; dj++) {
    if (g.canPlace('rumah', p.i + di, p.j + dj).ok) { ui.placeTile = [p.i + di, p.j + dj]; ui.updateGhost(); ui.confirmPlace(); placed = true; }
  }
  out.housePlaced = g.countType('rumah');
  out.modeAfter = ui.mode;
  // 3. farm + workshop, workers and production
  g.s.player.level = 3;
  g.s.player.coins = 2000;
  Object.assign(g.s.res, { wood: 200, stone: 200, food: 100 });
  const placeAny = (type) => {
    for (let r = 2; r < 9; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      const res = g.place(type, p.i + di, p.j + dj, 0);
      if (res.ok) return res.rec;
    }
    return null;
  };
  const farm = placeAny('ladang');
  const shop = placeAny('bengkel');
  out.farm = !!farm;
  out.shop = !!shop;
  await sleep(12000);
  out.built = g.I.buildings.filter((b) => b.built).map((b) => b.type);
  out.jobs = g.I.npcs.map((q) => q.job && g.buildingById(q.job)?.type);
  g.s.time.hour = 9;
  const food0 = g.s.res.food;
  await sleep(15000);
  out.presence = [...w.presence.entries()];
  out.npcModes = [...w.npcs.values()].map((r) => r.mode);
  out.foodChange = g.s.res.food - food0;
  // 4. crafting
  const c = g.craft('plank');
  out.craft = c.ok || c.reason;
  if (g.s.craft.queue[0]) g.s.craft.queue[0].end = Date.now();
  await sleep(2500);
  out.plank = g.s.res.plank;
  // 5. road
  out.road = g.paintRoad(p.i - 4, p.j - 4, true) || g.paintRoad(p.i - 5, p.j - 5, true);
  // 6. market requires a market; sell checks math
  g.s.player.level = 4;
  const mk = placeAny('pasar');
  if (mk) mk.built = 1;
  const coins0 = g.s.player.coins;
  out.sold = g.sell('wood', 10);
  out.coinsUp = g.s.player.coins - coins0;
  // 7. quests
  out.claimable = g.claimableQuests();
  out.claim = g.activeQuests().filter((q) => g.questDone(q)).map((q) => q.id && !!g.claimQuest(q.id));
  // 8. tap picking at screen centre
  const cv = app.canvas;
  out.pickCentre = w.pick(cv.clientWidth / 2, cv.clientHeight / 2)?.type || null;
  out.hour = g.s.time.hour;
  return out;
});
console.log('gameplay', JSON.stringify(play, null, 1));
await page.screenshot({ path: `${shots}/12-gameplay.png` });

// every biome
const biomes = (process.env.BIOMES || 'hutan,pantai,gunung,gurun,kota,fantasi').split(',').filter(Boolean);
for (const b of biomes) {
  await run((b) => {
    const app = window.__pd, g = app.game;
    app.ui.closeSheet();
    g.s.player.level = 25;
    g.s.player.coins = 99999;
    g.unlockIsland(b);
    g.switchIsland(b);
    g.s.time.hour = 16.5;
    const p = g.I.plaza;
    Object.assign(g.s.res, { wood: 300, stone: 300, plank: 90, brick: 90, glass: 90, tool: 30, crystal: 60, essence: 10 });
    for (const [t, di, dj] of [['rumah', -2, 3], ['rumah', -3, 1], ['rumah', 3, 2], ['taman', 1, 3], ['lampu', 2, 3], ['toko', -2, -1], ['airmancur', 3, -1]]) g.place(t, p.i + di, p.j + dj, 0);
    const lm = { hutan: 'rumahpohon', pantai: 'mercusuar', gunung: 'observatorium', gurun: 'obelisk', kota: 'menarajam', fantasi: 'pohonkehidupan' }[b];
    g.place(lm, p.i + 3, p.j + 3, 0);
    if (b === 'kota') g.place('apartemen', p.i - 4, p.j + 3, 0);
    for (const r of g.I.buildings) r.progress = 0.99;
    while (app.ui._modalOpen) app.ui.closeModal();
  }, b);
  await wait(3500);
  await page.screenshot({ path: `${shots}/20-${b}.png` });
}

const stats = await run(() => {
  const app = window.__pd;
  const r = app.engine.renderer.info.render;
  return { calls: r.calls, tris: r.triangles, fps: app.perf.fps, tier: app.perf.tier, ps: app.engine.look.pixelSize, low: app.engine.low, npcs: app.game.I.npcs.length };
});
console.log('stats', JSON.stringify(stats));
// round-trip the save
const saveOk = await run(() => {
  const g = window.__pd.game;
  const json = g.serialize();
  const G = g.constructor;
  const g2 = new G();
  g2.load(json);
  return { bytes: json.length, islands: Object.keys(g2.s.islands).length, buildings: g2.I.buildings.length };
});
console.log('save', JSON.stringify(saveOk));
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 40).join('\n') : 'no console errors');
await browser.close();
server.close();
