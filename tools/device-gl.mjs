// Debug helper: inspects WebGL state of the running app on a device (debug build).
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const serial = process.argv[2] || 'emulator-5554';
const adb = `${process.env.ANDROID_HOME}/platform-tools/adb.exe`;
const sh = (...a) => execFileSync(adb, ['-s', serial, ...a], { encoding: 'utf8' });
const pid = sh('shell', 'pidof', 'com.f7developer.pixeldiorama').trim();
sh('forward', 'tcp:9333', `localabstract:webview_devtools_remote_${pid}`);
const { webSocketDebuggerUrl } = await (await fetch('http://127.0.0.1:9333/json/version')).json();
const browser = await puppeteer.connect({ browserWSEndpoint: webSocketDebuggerUrl, defaultViewport: null });
const [page] = await browser.pages();
const msgs = [];
page.on('console', (m) => msgs.push(m.text()));
const out = await page.evaluate(() => {
  const app = window.__pd, r = app.engine.renderer, gl = r.getContext();
  const exts = ['EXT_color_buffer_float', 'EXT_color_buffer_half_float', 'OES_texture_float_linear'].map((e) => [e, !!gl.getExtension(e)]);
  app.engine.render(app.world.scene, app.env);
  const err = gl.getError();
  const px = new Uint8Array(4);
  gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const c = document.getElementById('c');
  return {
    exts, err, px: [...px], buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], css: [c.clientWidth, c.clientHeight],
    programs: r.info.programs?.length, maxDraw: gl.getParameter(gl.MAX_DRAW_BUFFERS), lost: gl.isContextLost(),
    diag: r.info.programs?.map((p) => p.diagnostics).filter(Boolean).slice(0, 2).map((d) => JSON.stringify(d).slice(0, 600)),
  };
});
console.log(JSON.stringify(out, null, 1));
const url = await page.evaluate(() => {
  const app = window.__pd;
  app.engine.render(app.world.scene, app.env);
  return app.canvas.toDataURL('image/png');
});
(await import('node:fs')).writeFileSync('tools/shots/device-canvas.png', Buffer.from(url.split(',')[1], 'base64'));
await new Promise((r) => setTimeout(r, 1000));
console.log(msgs.slice(0, 10).join('\n'));
browser.disconnect();
sh('forward', '--remove', 'tcp:9333');
