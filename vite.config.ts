/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import pkg from './package.json' with { type: 'json' };

// version + commit shown in Settings → About, so bug reports name the exact build
const commit = (() => {
  try {
    return (process.env.GITHUB_SHA ?? execSync('git rev-parse HEAD').toString()).trim().slice(0, 7);
  } catch {
    return 'dev';
  }
})();

// BASE_PATH lets GitHub Pages serve the app from /<repo>/ while Capacitor and local dev use '/'.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_BUILD__: JSON.stringify(commit) },
  plugins: [
    react(),
    VitePWA({
      // registered from main.tsx (web only); a new version waits for the next launch instead of reloading mid-game
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: 'hoops-career',
        name: 'Hoops Career',
        short_name: 'Hoops',
        description: 'Run an NBA franchise as GM and head coach. Deep tactics, real 2026-27 rosters.',
        theme_color: '#06080c',
        background_color: '#06080c',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        categories: ['games', 'sports'],
        shortcuts: [
          { name: 'Tactics', url: './#/tactics' },
          { name: 'League', url: './#/league' },
          { name: 'Front Office', url: './#/office' },
        ],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // woff2 only: every browser that supports service workers reads it, so the .woff fallbacks just waste the precache
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        globIgnores: ['**/*.woff'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'], testTimeout: 60_000 },
});
