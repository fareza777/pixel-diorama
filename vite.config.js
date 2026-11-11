import { defineConfig } from 'vite';

// Capacitor loads the build from the app bundle, so every asset path must be relative.
export default defineConfig({
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
});
