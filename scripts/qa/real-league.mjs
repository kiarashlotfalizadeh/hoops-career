// Real-league QA: New League with real rosters, preseason cuts, ratings and real-season stats.
// Usage: node scripts/qa/real-league.mjs <baseUrl> <outDir> [wide]
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const out = process.argv[3] ?? 'shots';
const wide = process.argv[4] === 'wide';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: wide ? { width: 820, height: 1180 } : { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const shot = async (name, full = false) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
  console.log('shot', name);
};
await page.goto(`${base}/#/start`);
await page.waitForTimeout(800);
await page.getByText('New League').click();
await page.waitForTimeout(400);
await shot('r01-newleague');
await page.getByText('Choose your team').click();
await page.getByText('West', { exact: true }).click();
await page.getByRole('button', { name: /Grizzlies/ }).click();
await page.waitForTimeout(300);
await shot('r02-team-pick', true);
await page.getByText(/Take over the/).click();
await page.fill('input[placeholder="Your name"]', 'QA Coach');
await page.getByText('Start career').click();
await page.waitForTimeout(2500);
await shot('r03-home', true);
await page.goto(`${base}/#/inbox`);
await page.waitForTimeout(400);
await page
  .getByText(/Preseason cuts/)
  .first()
  .click()
  .catch(() => console.log('no preseason cuts message'));
await shot('r04-inbox', true);
await page.goto(`${base}/#/roster`);
await page.waitForTimeout(400);
await shot('r05-roster', true);
await page
  .getByText('Ratings', { exact: true })
  .first()
  .click()
  .catch(() => {});
await shot('r06-roster-ratings');
await page.getByText('Players', { exact: true }).first().click();
await page.locator('.tm-rl-row').nth(1).click();
await page.waitForTimeout(500);
await shot('r07-player', true);
await page
  .getByText('Ratings', { exact: true })
  .first()
  .click()
  .catch(() => {});
await shot('r08-player-ratings', true);
await page
  .getByText('Stats', { exact: true })
  .first()
  .click()
  .catch(() => {});
await shot('r09-player-stats', true);
await page.goto(`${base}/#/league?tab=stats`);
await page.waitForTimeout(600);
await shot('r10-league-stats', true);
await page.goto(`${base}/#/league?tab=standings`);
await page.waitForTimeout(600);
await shot('r11-power', true);
console.log('errors:', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
