/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import pkg from './package.json' with { type: 'json' };
import policy from './src/ui/screens/privacy.json' with { type: 'json' };

// version + commit shown in Settings → About, so bug reports name the exact build
const commit = (() => {
  try {
    return (process.env.GITHUB_SHA ?? execSync('git rev-parse HEAD').toString()).trim().slice(0, 7);
  } catch {
    return 'dev';
  }
})();

/**
 * The privacy policy as a page of its own (privacy.html, beside index.html): the address a store
 * listing asks for, readable without the app. The same text as the in-app page (ui/screens/Privacy.tsx).
 */
function privacyPage(): Plugin {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return {
    name: 'privacy-page',
    apply: 'build',
    generateBundle() {
      const sections = policy.sections
        .map((s) => {
          const link = 'link' in s && s.link ? `<p><a href="${esc(s.link.href)}">${esc(s.link.label)}</a></p>` : '';
          return `<h2>${esc(s.h)}</h2>${s.p.map((t) => `<p>${esc(t)}</p>`).join('')}${link}`;
        })
        .join('\n      ');
      const source = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>${esc(policy.title)} · Hoops Career</title>
    <link rel="icon" href="icon.svg" type="image/svg+xml" />
    <style>
      :root { --bg: #f3efe7; --ink: #1b1915; --dim: #5b564c; }
      @media (prefers-color-scheme: dark) { :root { --bg: #171512; --ink: #f1ece2; --dim: #b3ac9e; } }
      body { margin: 0; background: var(--bg); color: var(--dim); font: 16px/1.55 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
      main { max-width: 62ch; margin: 0 auto; padding: 40px 20px 64px; }
      h1, h2, .lead, a { color: var(--ink); }
      h1 { margin: 0; font-size: 34px; line-height: 1.1; letter-spacing: -0.02em; }
      h2 { margin: 26px 0 4px; font-size: 17px; }
      p { margin: 0 0 8px; }
      .lead { margin: 18px 0 0; font-size: 20px; font-weight: 700; line-height: 1.3; }
      .small { font-size: 13.5px; }
      a { text-underline-offset: 3px; overflow-wrap: anywhere; }
    </style>
  </head>
  <body>
    <main>
      <p class="small"><a href="./">Hoops Career</a></p>
      <h1>${esc(policy.title)}</h1>
      <p class="small">Updated ${esc(policy.updated)}</p>
      <p class="lead">${esc(policy.lead)}</p>
      ${sections}
      <p class="small" style="margin-top: 32px">Hoops Career is not affiliated with the NBA or NBPA.</p>
    </main>
  </body>
</html>
`;
      this.emitFile({ type: 'asset', fileName: 'privacy.html', source });
    },
  };
}

// BASE_PATH lets GitHub Pages serve the app from /<repo>/ while Capacitor and local dev use '/'.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_BUILD__: JSON.stringify(commit) },
  plugins: [
    react(),
    privacyPage(),
    VitePWA({
      // registered from main.tsx (web only); a new version waits for the next launch instead of reloading mid-game
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: 'hoops-career',
        name: 'Hoops Career',
        short_name: 'Hoops',
        description: 'A basketball GM and head coach game, with a tactics layer that tells you why.',
        theme_color: '#f3efe7',
        background_color: '#f3efe7',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        categories: ['games', 'sports'],
        shortcuts: [
          { name: 'Tactics', url: './#/tactics', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'League', url: './#/league', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Front Office', url: './#/office', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // the app and the 2D court, kept from the first visit (woff2 only: every browser that supports
        // service workers reads it, so the .woff fallbacks just waste the precache)
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // the 3D court's models and textures (about 4 MB) are not: they're kept the first time a live game asks for them
        globIgnores: ['**/skin-anat*.png'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // the first visit's page is the worker's from the moment it's ready, so that first live game's models are kept too
        clientsClaim: true,
        runtimeCaching: [
          {
            // (their names carry their contents' hash: a kept copy is never stale, and a new build's push the old ones out)
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/[^/]+\.(?:glb|bin)$|\/assets\/skin-anat[^/]*\.png$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'court3d-models', expiration: { maxEntries: 12 }, cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
  // (the 3D court's models: files to serve, not code)
  assetsInclude: ['**/*.glb', '**/faces.bin'],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // the libraries the first screen needs, in a chunk of their own: they change less often than
        // the app, so an update downloads only the app's code and keeps them from the cache
        manualChunks: (id) => (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|zustand|idb|comlink|@capacitor\/core)\//.test(id) ? 'vendor' : undefined),
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'], testTimeout: 60_000 },
});
