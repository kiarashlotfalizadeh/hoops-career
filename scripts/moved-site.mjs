// The site for an address the game has moved away from (GitHub Pages, once clipboardgm.com is live):
// every page forwards to the new address, keeping the in-app #route, and a service worker replaces
// the old offline copy, clears its caches and unregisters, so a home-screen install forwards too.
//
//   node scripts/moved-site.mjs https://clipboardgm.com dist
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [to, out = 'dist'] = process.argv.slice(2);
if (!/^https:\/\/[a-z0-9.-]+\/?$/i.test(to ?? '')) {
  console.error('usage: node scripts/moved-site.mjs https://new.example dist');
  process.exit(1);
}
const base = to.replace(/\/$/, '');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const page = (path) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Clipboard GM has moved</title>
    <link rel="canonical" href="${esc(base + path)}" />
    <meta http-equiv="refresh" content="2; url=${esc(base + path)}" />
    <script>location.replace(${JSON.stringify(base + path)} + location.hash);</script>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f3efe7; color: #1b1915; font: 17px/1.5 system-ui, sans-serif; text-align: center; padding: 24px; }
      a { color: inherit; font-weight: 700; }
    </style>
  </head>
  <body>
    <p>Clipboard GM has moved to <a href="${esc(base + path)}">${esc(base.replace(/^https:\/\//, ''))}</a>.</p>
  </body>
</html>
`;

const killSwitch = `// Clipboard GM moved to ${base}: this replaces the old offline copy, then steps aside.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.registration.unregister();
      await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
    })(),
  );
});
`;

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), page('/'));
writeFileSync(join(out, '404.html'), page('/'));
writeFileSync(join(out, 'privacy.html'), page('/privacy.html'));
writeFileSync(join(out, 'sw.js'), killSwitch);
console.log(`Moved site written to ${out}/, forwarding to ${base}`);
