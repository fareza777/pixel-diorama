// Connects to the game's WebView on an Android device/emulator (debug build) through adb + DevTools,
// prints renderer info and errors, and saves a screenshot rendered by the WebView itself.
// Usage: node tools/device-check.mjs <adb-serial>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const serial = process.argv[2] || 'emulator-5554';
const adb = `${process.env.ANDROID_HOME}/platform-tools/adb.exe`;
const sh = (...a) => execFileSync(adb, ['-s', serial, ...a], { encoding: 'utf8' });
const pid = sh('shell', 'pidof', 'com.f7developer.pixeldiorama').trim();
if (!pid) throw new Error('app is not running');
sh('forward', 'tcp:9333', `localabstract:webview_devtools_remote_${pid}`);
const res = await fetch('http://127.0.0.1:9333/json/version');
const { webSocketDebuggerUrl } = await res.json();
const browser = await puppeteer.connect({ browserWSEndpoint: webSocketDebuggerUrl, defaultViewport: null });
const [page] = await browser.pages();
const info = await page.evaluate(() => {
  const app = window.__pd;
  const gl = app?.engine?.renderer?.getContext();
  const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
  return {
    ready: !!app?.ui,
    started: app?.started,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER),
    webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
    fps: app?.perf?.fps, tier: app?.perf?.tier, pixel: app?.engine?.look.pixelSize, low: app?.engine?.low,
    css: [innerWidth, innerHeight, devicePixelRatio], online: navigator.onLine,
    sat: getComputedStyle(document.documentElement).getPropertyValue('--sat'),
  };
});
console.log(JSON.stringify(info, null, 1));
if (process.argv.includes('--start')) {
  await page.evaluate(() => window.__pd.start());
  await new Promise((r) => setTimeout(r, 4000));
}
fs.mkdirSync('tools/shots', { recursive: true });
await page.screenshot({ path: `tools/shots/device-${serial.replace(/\W/g, '')}${process.argv.includes('--start') ? '-play' : ''}.png` });
console.log('screenshot saved');
browser.disconnect();
sh('forward', '--remove', 'tcp:9333');
