// Pixel-art thumbnails of buildings for the build menu, rendered with a second, tiny PixelEngine so
// they look exactly like the world. Rendered lazily, a few per frame, and cached.
import * as THREE from 'three';
import { PixelEngine } from '../engine/pixel-engine.js';
import { Environment } from '../engine/environment.js';
import { buildingModel, disposeModel, Builder } from '../game/models.js';
import { BUILDINGS } from '../game/data.js';

const SIZE = 120;
const cache = new Map();
const queue = [];
let eng = null, env = null, scene = null, busy = false;

const GROUND = { desa: '#6eb156', hutan: '#4f9a4a', pantai: '#e5cf99', gunung: '#e9eef6', gurun: '#e7c27a', kota: '#b9bcc4', fantasi: '#a98ae0' };

function setup() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  eng = new PixelEngine(canvas);
  eng.renderer.setClearColor(0x000000, 0);
  eng.setOutput(SIZE, SIZE);
  Object.assign(eng.look, { pixelSize: 2, vignette: 0, bloom: 0.5, outline: 0.55 });
  eng.applyLook();
  scene = new THREE.Scene();
  env = new Environment();
  env.attach(scene, { size: 4, top: 3, bottom: -1, surfaceAt: () => 0, isLand: () => true });
  env.key.shadow.mapSize.set(512, 512);
  env.setHour(10.5);
  env.setWeather('clear', true);
}

function render(type, biome, paint) {
  if (!eng) setup();
  const def = BUILDINGS[type];
  const group = new THREE.Group();
  const model = buildingModel({ id: 7, type, level: 1, paint, rot: 0 }, biome);
  group.add(model);
  const b = new Builder();
  b.box(def.size + 0.1, 0.2, def.size + 0.1, GROUND[biome] || '#6eb156', 0, -0.2, 0, {}, 'solid');
  const base = b.build();
  group.add(base);
  scene.add(group);
  const box = new THREE.Box3().setFromObject(model);
  const h = box.max.y - Math.min(0, box.min.y);
  eng.view.target.set(0, Math.min(h * 0.45, 1.2), 0);
  eng.view.size = Math.max(def.size * 1.45, h * 1.25, 1.3);
  eng.view.azimuth = 38;
  eng.view.elevation = 28;
  eng.view.snap = false;
  env.update(0.016);
  env.post.skyTop.set('#20284a');
  env.post.skyBottom.set('#20284a');
  env.post.stars = 0;
  eng.prepareScene(scene);
  eng.render(scene, env);
  const url = eng.canvas.toDataURL('image/png');
  scene.remove(group);
  disposeModel(group);
  return url;
}

/** Returns a cached data URL or null (and schedules rendering). cb(url) fires when ready. */
export function thumb(type, biome, paint = 0, cb) {
  const key = `${biome}:${type}:${paint}`;
  if (cache.has(key)) return cache.get(key);
  queue.push({ key, type, biome, paint, cb });
  pump();
  return null;
}

function pump() {
  if (busy) return;
  busy = true;
  const step = () => {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 8) {
      const job = queue.shift();
      if (!cache.has(job.key)) {
        try {
          cache.set(job.key, render(job.type, job.biome, job.paint));
        } catch (e) {
          console.warn('thumbnail failed', e);
          cache.set(job.key, '');
        }
      }
      job.cb?.(cache.get(job.key));
    }
    if (queue.length) requestAnimationFrame(step);
    else busy = false;
  };
  requestAnimationFrame(step);
}
