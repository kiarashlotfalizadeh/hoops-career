// Phone-size screenshots of the League hub, Team, History and Inbox screens.
// Usage: node scripts/qa/league-screens.mjs [baseUrl] [outDir] [stage]
//   stage: "mid"   = new league, start season and sim to the trade deadline (default)
//          "post"  = also finish the regular season, play-in and playoffs
//          "visit" = only screenshot the league already saved in PROFILE (no new league, no sims)
// Env: WIDE=1 for a 820px tablet viewport; PROFILE=/dir keeps the browser profile (IndexedDB saves)
// between runs; CHROMIUM=/path/to/chrome or PLAYWRIGHT_BROWSERS_PATH if browsers are elsewhere.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const out = process.argv[3] ?? 'shots/league';
const stage = process.argv[4] ?? 'mid';
const wide = process.env.WIDE === '1';
mkdirSync(out, { recursive: true });

const ctxOpts = wide ? { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1 } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const executablePath = process.env.CHROMIUM || undefined;
let ctx;
if (process.env.PROFILE) {
  ctx = await chromium.launchPersistentContext(process.env.PROFILE, { ...ctxOpts, executablePath });
} else {
  const browser = await chromium.launch({ executablePath });
  ctx = await browser.newContext(ctxOpts);
}
const page = ctx.pages()[0] ?? (await ctx.newPage());
const onFail = async (e) => {
  console.error('FAILED:', e?.message ?? e);
  console.error('url:', page.url());
  await page.screenshot({ path: `${out}/zz-failure.png` }).catch(() => {});
  console.error(errors.length ? `errors (${errors.length}):\n${errors.join('\n')}` : 'errors: none');
  process.exit(1);
};
process.on('unhandledRejection', onFail);
process.on('uncaughtException', onFail);
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
});

const shot = async (name, { scrolls = 1 } = {}) => {
  await page.waitForTimeout(350);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = page.viewportSize().height;
  const n = Math.min(scrolls, Math.max(1, Math.ceil(height / (vh - 120))));
  for (let i = 0; i < n; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * (vh - 160));
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${out}/${name}${n > 1 ? `-${i + 1}` : ''}.png` });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  console.log('shot', name, n > 1 ? `(${n})` : '');
};

const waitSim = async () => {
  await page.waitForTimeout(400);
  await page.waitForSelector('.simbar', { state: 'detached', timeout: 300_000 });
  await page.waitForTimeout(300);
};

/** Open the top-bar Play sheet and run the action with this label. Returns false if unavailable. */
const play = async (label) => {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(250);
  const btn = page.locator('.sheet button', { hasText: label }).first();
  if (!(await btn.count()) || (await btn.isDisabled())) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    return false;
  }
  await btn.click();
  await waitSim();
  return true;
};

const simUntilGone = async (label, max = 30) => {
  for (let i = 0; i < max; i++) {
    if (!(await play(label))) return;
  }
};

const go = async (hash) => {
  await page.goto(`${base}/${hash}`);
  await page.waitForTimeout(500);
};

const visit = async (prefix) => {
  const pages = [
    ['standings', '#/league?tab=standings', 2],
    ['standings-splits', '#/league?tab=standings&cols=splits', 1],
    ['standings-league', '#/league?tab=standings&view=league', 1],
    ['power', '#/league?tab=standings&view=power', 2],
    ['schedule', '#/league?tab=schedule', 2],
    ['schedule-day', '#/league?tab=schedule&sched=day', 2],
    ['stats-leaders', '#/league?tab=stats', 3],
    ['stats-players', '#/league?tab=stats&sv=players', 1],
    ['stats-teams', '#/league?tab=stats&sv=teams', 1],
    ['playoffs', '#/league?tab=playoffs', 3],
    ['awards', '#/league?tab=awards', 3],
    ['news', '#/league?tab=news', 2],
    ['team5', '#/team/5', 3],
    ['team5-stats', '#/team/5?tab=roster&rv=stats', 1],
    ['team5-contracts', '#/team/5?tab=roster&rv=contracts', 1],
    ['team5-tactics', '#/team/5?tab=tactics', 3],
    ['team5-scouting', '#/team/5?tab=scouting', 2],
    ['team5-schedule', '#/team/5?tab=schedule', 1],
    ['team5-picks', '#/team/5?tab=picks', 1],
    ['team5-history', '#/team/5?tab=history', 1],
    ['history', '#/history', 2],
    ['history-league', '#/history?view=league', 1],
    ['history-hof', '#/history?view=hof', 1],
    ['inbox', '#/inbox', 2],
  ];
  for (const [name, hash, scrolls] of pages) {
    await go(hash);
    await shot(`${prefix}-${name}`, { scrolls });
  }
  // interactions
  await go('#/inbox');
  const first = page.locator('.lg-msg').first();
  if (await first.count()) {
    await first.click();
    await shot(`${prefix}-inbox-open`);
  }
  await go('#/league?tab=playoffs');
  const series = page.locator('button.bk-s').first();
  if (await series.count()) {
    await series.click();
    await shot(`${prefix}-series-sheet`);
    await page.keyboard.press('Escape');
  }
  await go('#/league?tab=schedule');
  const row = page.locator('a.lg-g-row').first();
  if (await row.count()) {
    await row.click();
    await page.waitForTimeout(400);
    console.log('schedule row ->', page.url());
  }
};

if (stage === 'visit') {
  await go('#/');
  await page.waitForSelector('.topbar', { timeout: 15_000 });
  await visit(wide ? 'wide' : 'visit');
  console.log(errors.length ? `errors (${errors.length}):\n${errors.join('\n')}` : 'errors: none');
  await ctx.close();
  process.exit(0);
}

// ---------------------------------------------------------------- new league
await go('#/start');
await page.getByText('New League').click();
await page.waitForTimeout(500);
await page.getByRole('heading', { name: 'Fictional League' }).click();
await page.getByText('Choose your team').click();
await page.waitForTimeout(300);
await page.getByText(/Take over the/).click();
await page.waitForTimeout(300);
await page.fill('input[placeholder="Your name"]', 'QA Coach');
await page.getByText('Start career').click();
await page.waitForSelector('.topbar', { timeout: 60_000 });
await page.waitForTimeout(1200);

// preseason views (empty states)
await go('#/league?tab=playoffs');
await shot('00-pre-playoffs');
await go('#/league?tab=awards');
await shot('00-pre-awards');
await go('#/inbox');
await shot('00-pre-inbox');

// ---------------------------------------------------------------- season
await play('Start regular season');
await page.waitForTimeout(800);
await simUntilGone('Sim to trade deadline');

await visit('mid');

if (stage === 'post') {
  await simUntilGone('Sim to end of regular season');
  await go('#/league?tab=awards');
  await shot('post-awards-final', { scrolls: 3 });
  await go('#/league?tab=playoffs');
  await shot('post-playin', { scrolls: 2 });
  await simUntilGone('Sim through play-in');
  await go('#/league?tab=playoffs');
  await shot('post-playoffs-r1', { scrolls: 2 });
  await simUntilGone('Sim to end of playoffs', 60);
  await visit('post');
}

console.log(errors.length ? `errors (${errors.length}):\n${errors.join('\n')}` : 'errors: none');
await ctx.close();
