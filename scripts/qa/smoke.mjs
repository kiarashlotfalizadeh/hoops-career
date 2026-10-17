// Browser smoke test for CI: serves the production build, coaches the opening-night game live
// and plays the opening week of the real league on a phone viewport, opens every main screen
// (phone and tablet), runs the Tactics Lab's worker, round-trips a backup export/import and picks a
// live game up after a reload.
// Fails on any page error, console error or missing screen.
// Usage: npm run build && npm run smoke (SMOKE_PORT picks the preview port, default 4179)
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { clearMoments } from './moments.mjs';

if (!existsSync(join('dist', 'index.html'))) {
  console.error('No production build in dist/: run npm run build first.');
  process.exit(1);
}
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
  // up to a minute: a machine busy with a build or a test run can take more than half of that
  for (let i = 0; i < 120; i++) {
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
  const waitSim = async () => {
    await page.waitForSelector('.simbar', { state: 'detached', timeout: 120_000 }).catch(() => {});
    await clearMoments(page);
  };

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

  await clearMoments(page);

  await page.getByRole('button', { name: 'Play options', exact: true }).click();
  await page
    .locator('.sheet')
    .getByRole('button', { name: /^Start regular season/ })
    .click();
  await page.waitForTimeout(800);

  // the opening-night game, live: the court plays, then sims to the final
  await clearMoments(page);
  await page.getByRole('button', { name: 'Play options', exact: true }).click();
  const watch = page.locator('.sheet').getByRole('button', { name: /^Watch & coach live/ });
  if (!(await watch.count())) {
    await page
      .locator('.sheet')
      .getByRole('button', { name: /^Sim to next game/ })
      .click();
    await waitSim();
    await clearMoments(page);
    await page.getByRole('button', { name: 'Play options', exact: true }).click();
  }
  await watch.click();
  // the starting lineups go up first: tip it off
  await page
    .getByRole('button', { name: 'Tip off', exact: true })
    .click({ timeout: 10_000 })
    .then(
      () => step('tipped off from the starting lineups'),
      () => fail.push('no starting lineups before the tip'),
    );
  const bug = page.locator('.live-bug');
  const tipoff = await bug.getAttribute('aria-label', { timeout: 15_000 });
  await page
    .waitForFunction((was) => document.querySelector('.live-bug')?.getAttribute('aria-label') !== was, tipoff, { timeout: 15_000 })
    .catch(() => fail.push(`live game clock never moved (${tipoff})`));
  await page.getByRole('button', { name: 'Skip ahead', exact: true }).click();
  await page
    .locator('.sheet')
    .getByRole('button', { name: /Sim to final/ })
    .click();
  await page.getByRole('button', { name: /Game report/ }).waitFor({ timeout: 30_000 });
  step(`coached a live game to the final (${await bug.getAttribute('aria-label')})`);

  await page.goto(`${base}/#/`);
  await clearMoments(page);
  await page.getByRole('button', { name: 'Play options', exact: true }).click();
  await page
    .locator('.sheet')
    .getByRole('button', { name: /^Sim 1 week/ })
    .click();
  await waitSim();
  const phase = await page.locator('.topbar').getAttribute('data-phase');
  if (!/^Regular season$/i.test(phase ?? '')) fail.push(`expected regular season, got ${phase}`);
  step(`played into the season (${await page.locator('.topbar .sub').textContent()})`);

  const routes = [
    '/',
    '/preview',
    '/roster',
    '/rotation',
    '/lineups',
    '/tactics',
    '/lab',
    '/league',
    '/league?tab=stats',
    '/league?tab=ratings',
    '/team/5',
    '/team/5?tab=scouting',
    '/gameplan/5',
    '/office',
    '/trade',
    '/free-agents',
    '/draft',
    '/finances',
    '/inbox',
    '/settings',
    '/god',
    '/history',
    '/history?view=records',
    '/history?view=records&part=season',
  ];
  // two real players side by side: the league leaders' links
  await page.goto(`${base}/#/league?tab=stats`);
  const leaders = page.locator('a.lg-lead-top[href^="#/player/"]');
  await leaders
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
  const pids = [...new Set((await leaders.evaluateAll((as) => as.map((a) => a.getAttribute('href')))).map((h) => h.split('/').pop()))];
  if (pids.length >= 2) routes.push(`/compare?a=${pids[0]}&b=${pids[1]}`);
  else fail.push('no league leaders to compare');
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
  // the screen it came from stays up until Home has loaded
  await recent.waitFor({ timeout: 15_000 }).catch(() => {});
  if (await recent.count()) {
    await recent.click();
    await page.waitForSelector('text=Game report');
    step('opened a game report');
  } else fail.push('no recent game on Home');

  // the Tactics Lab sims in a Web Worker, which the production build bundles on its own
  await page.goto(`${base}/#/lab`);
  await page.getByRole('button', { name: '20 games', exact: true }).click();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page
    .getByText('Win %', { exact: true })
    .waitFor({ timeout: 60_000 })
    .then(
      () => step('ran a Tactics Lab projection'),
      () => fail.push('the Tactics Lab never showed a result'),
    );

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

  // the app closed mid-game (a reload, last: a file input doesn't take a file after one): a pause
  // saves where the game is, and the game picks up there instead of at tip-off
  await page.goto(`${base}/#/`);
  await clearMoments(page);
  await page.getByRole('button', { name: 'Play options', exact: true }).click();
  if (!(await watch.count())) {
    await page
      .locator('.sheet')
      .getByRole('button', { name: /^Sim to next game/ })
      .click();
    await waitSim();
    await clearMoments(page);
    await page.getByRole('button', { name: 'Play options', exact: true }).click();
  }
  await watch.click();
  await page
    .getByRole('button', { name: 'Tip off', exact: true })
    .click({ timeout: 10_000 })
    .catch(() => {});
  const start = await bug.getAttribute('aria-label', { timeout: 15_000 });
  await page.waitForFunction((was) => document.querySelector('.live-bug')?.getAttribute('aria-label') !== was, start, { timeout: 15_000 }).catch(() => {});
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForTimeout(2500);
  const left = await bug.getAttribute('aria-label');
  await page.reload();
  await page
    .getByText(/^Picked up where you left off/)
    .waitFor({ timeout: 30_000 })
    .then(
      () => step(`picked a live game up after a reload (${left})`),
      () => fail.push('a live game did not pick up where it was left after a reload'),
    );
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
