// Adaptive quality: picks a starting tier from the device, watches frame times and steps down (or
// carefully back up) to hold 60 fps. Also caps rendering at 60 fps on high-refresh screens.

export const TIERS = {
  // v1.3: crisper outlines, far less aerial haze, a much softer miniature blur (off by default) and cheap
  // edge smoothing (aa). art: art pixels on the short side of the screen (more = sharper but heavier;
  // measured on a Snapdragon 680 phone: 540 art pixels ran at 21 fps on Medium, 360 at 32)
  low: { name: 'Low', shadow: 1024, shadowEvery: 2, bloom: 0, mirror: false, lights: 2, grass: 0.35, smoke: false, outline: 0.55, ambient: 0.4, tilt: 0, haze: 0.03, split: 0.15, aa: 0.8, art: 400 },
  medium: { name: 'Medium', shadow: 1024, shadowEvery: 1, bloom: 0.6, mirror: false, lights: 4, grass: 0.7, smoke: true, outline: 0.6, ambient: 0.7, tilt: 0.25, haze: 0.04, split: 0.2, aa: 1, art: 400 },
  high: { name: 'High', shadow: 2048, shadowEvery: 1, bloom: 0.7, mirror: true, lights: 6, grass: 1, smoke: true, outline: 0.6, ambient: 1, tilt: 0.3, haze: 0.05, split: 0.22, aa: 1, art: 540 },
};
// Below the low tier the game gives up detail in this order (Perf.extraPixel):
//   1 = drop the crease highlights (the costliest part of the pixel pass), same resolution
//   2 = one step bigger art pixels
// Bigger steps made the picture look blurry on 1080p phones, so they are not used any more.
export const MAX_EXTRA = 2;
export const extraPixelSize = (extra) => Math.max(0, extra - 1);
const ORDER = ['low', 'medium', 'high'];

export function guessTier() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const px = window.screen.width * window.screen.height * (window.devicePixelRatio || 1) ** 2;
  if (cores >= 8 && mem >= 6) return 'high';
  if (cores <= 4 || mem <= 2 || px > 4e6 && cores < 6) return 'low';
  return 'medium';
}

export class Perf {
  constructor(apply) {
    this.apply = apply; // (tierName, extraPixel) => void
    this.mode = 'auto';
    this.tier = guessTier();
    this.extraPixel = 0;
    this.samples = [];
    this.windowT = 0;
    this.lowWindows = 0;
    this.goodWindows = 0;
    this.raises = 0;
    this.lastChange = 0;
    this.fps = 60;
    this.frameMs = 16.7;
    this._acc = 0;
  }

  setMode(mode) {
    this.mode = mode;
    if (mode !== 'auto') {
      this.tier = mode;
      this.extraPixel = 0;
    }
    this.apply(this.tier, this.extraPixel);
  }

  /** Frame limiter: returns true when this animation frame should render. */
  shouldRender(deltaMs) {
    this._acc += deltaMs;
    const target = 1000 / 60;
    if (this._acc < target - 1.5) return false;
    this._acc = Math.min(this._acc - target, target);
    if (this._acc < 0) this._acc = 0;
    return true;
  }

  sample(dtMs, now) {
    this.samples.push(dtMs);
    this.windowT += dtMs;
    if (this.windowT < 2000) return;
    const s = this.samples.sort((a, b) => a - b);
    // 80th percentile frame time: robust against single hitches (GC, shader compiles)
    const p80 = s[Math.floor(s.length * 0.8)] || 16.7;
    const avg = s.reduce((a, b) => a + b, 0) / s.length;
    this.fps = Math.round(1000 / avg);
    this.frameMs = p80;
    this.samples = [];
    this.windowT = 0;
    if (this.mode !== 'auto' || now - this.lastChange < 4000) return;
    if (p80 > 21) {
      this.lowWindows++;
      this.goodWindows = 0;
    } else if (p80 < 17.6) {
      this.goodWindows++;
      this.lowWindows = 0;
    } else {
      this.lowWindows = 0;
      this.goodWindows = 0;
    }
    if (this.lowWindows >= 2) {
      this.lowWindows = 0;
      const i = ORDER.indexOf(this.tier);
      if (i > 0) this.tier = ORDER[i - 1];
      else if (this.extraPixel < MAX_EXTRA) this.extraPixel++;
      else return;
      this.lastChange = now;
      this.apply(this.tier, this.extraPixel);
    } else if (this.goodWindows >= 8 && this.raises < 2) {
      this.goodWindows = 0;
      if (this.extraPixel > 0) this.extraPixel--;
      else {
        const i = ORDER.indexOf(this.tier);
        if (i >= ORDER.length - 1) return;
        this.tier = ORDER[i + 1];
      }
      this.raises++;
      this.lastChange = now;
      this.apply(this.tier, this.extraPixel);
    }
  }
}
