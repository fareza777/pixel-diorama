import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// `vite build --mode release` (npm run build:release / android:release) ships the real AdMob ids.
// Refuse to build it while any placeholder or Google test id is still in place.
function releaseAdsGuard(mode) {
  if (mode !== 'release') return;
  const cfg = readFileSync(new URL('./src/ads-config.js', import.meta.url), 'utf8');
  const release = cfg.slice(cfg.indexOf('RELEASE_UNITS'), cfg.indexOf('TEST_UNITS'));
  if (/REPLACE_|3940256099942544/.test(release)) throw new Error('src/ads-config.js: set the real AdMob ad unit ids before a release build');
  const strings = readFileSync(new URL('./android/app/src/main/res/values/strings.xml', import.meta.url), 'utf8');
  if (/3940256099942544|REPLACE_/.test(strings)) throw new Error('strings.xml: set the real admob_app_id before a release build');
}

// Capacitor loads the build from the app bundle, so every asset path must be relative.
export default defineConfig(({ mode }) => {
  releaseAdsGuard(mode);
  return {
    base: './',
    build: {
      target: 'es2022',
      outDir: 'dist',
      assetsInlineLimit: 0,
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
      reportCompressedSize: true,
    },
    server: { port: 5190 },
  };
});
