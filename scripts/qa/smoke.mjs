// Browser smoke test for CI: serves the production build, plays the opening week of the real
// league on a phone viewport, opens every main screen (phone and tablet) and round-trips a
// backup export/import. Fails on any page error, console error or missing screen.
// Usage: npm run build && node scripts/qa/smoke.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const port = Number(process.env.SMOKE_PORT ?? 4179);
const base = `http://127.0.0.1:${port}`;
// a server already on the port (say, a leftover preview of another checkout) would be tested instead of this build
const portTaken = await fetch(base).then(
  () => true,
  () => false,
);
if (portTaken) {
  console.error(`Port ${port} is already in use: stop that server or set SMOKE_PORT.`);
  process.exit(1);
}
// vite itself, not through npx: killing npx would leave the preview server running
const server = spawn(process.execPath, [join('node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
  stdio: 'ignore',
});
const fail = [];
const step = (s) => console.log(`- ${s}`);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && fail.push(`console: ${m.text()}`));
  const waitSim = () => page.waitForSelector('.simbar', { state: 'detached', timeout: 120_000 }).catch(() => {});

  await page.goto(`${base}/#/start`);
  await page.getByText('New League').click();
  await page.getByText('Choose your team').click();
  await page.getByText('West', { exact: true }).click();
  await page.getByRole('button', { name: /Thunder/ }).click();
  await page.getByText(/Take over the/).click();
  await page.fill('input[placeholder="Your name"]', 'Smoke Coach');
  await page.getByText('Start career').click();
  await page.waitForSelector('.topbar', { timeout: 30_000 });
  step('created the real league');

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page
    .locator('.sheet')
    .getByRole('button', { name: /^Start regular season/ })
    .click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const quick = page
    .locator('.sheet')
    .getByRole('button', { name: /^Quick sim this game|^Sim 1 week/ })
    .first();
  await quick.click();
  await waitSim();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page
    .locator('.sheet')
    .getByRole('button', { name: /^Sim 1 week/ })
    .click();
  await waitSim();
  const phase = await page.locator('.topbar').getAttribute('data-phase');
  if (phase !== 'Regular Season') fail.push(`expected regular season, got ${phase}`);
  step(`played into the season (${await page.locator('.topbar .sub').textContent()})`);

  const routes = [
    '/',
    '/roster',
    '/rotation',
    '/tactics',
    '/lab',
    '/league',
    '/league?tab=stats',
    '/team/5',
    '/office',
    '/trade',
    '/free-agents',
    '/draft',
    '/finances',
    '/inbox',
    '/settings',
    '/history',
  ];
  for (const [w, h] of [
    [390, 844],
    [820, 1180],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    for (const r of routes) {
      await page.goto(`${base}/#${r}`);
      await page.waitForSelector('main', { timeout: 15_000 }).catch(() => fail.push(`no <main> on ${r} at ${w}px`));
      if (await page.getByText('This screen hit a problem').count()) fail.push(`error boundary on ${r} at ${w}px`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 2) fail.push(`horizontal overflow ${overflow}px on ${r} at ${w}px`);
    }
    step(`opened ${routes.length} screens at ${w}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // a game report from the week
  await page.goto(`${base}/#/`);
  const recent = page.locator('a[href^="#/game/"]').first();
  if (await recent.count()) {
    await recent.click();
    await page.waitForSelector('text=Game report');
    step('opened a game report');
  } else fail.push('no recent game on Home');

  // backup round trip
  await page.goto(`${base}/#/settings`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export backup/ }).click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'hc-')), download.suggestedFilename());
  await download.saveAs(file);
  await page.goto(`${base}/#/start`);
  await page.locator('input[type=file]').setInputFiles(file);
  await page.waitForSelector('.topbar', { timeout: 30_000 });
  await page.goto(`${base}/#/start`);
  if (!(await page.getByText(/\(imported\)/).count())) fail.push('imported league not listed');
  step('exported and re-imported a backup');
} catch (e) {
  fail.push(`crash: ${e instanceof Error ? e.message : e}`);
} finally {
  await browser?.close();
  server.kill();
}

if (fail.length) {
  console.error(`\nSMOKE FAILED (${fail.length}):`);
  for (const f of [...new Set(fail)]) console.error(`  ${f}`);
  process.exit(1);
}
console.log('\nsmoke ok');
