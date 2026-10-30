// Drives the core coaching loop on a phone viewport and captures screenshots: tactics, rotation,
// roster, the pre-game screen, a live game and its report. Works on any build.
// Usage: node scripts/qa/core-screens.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import { play } from './play.mjs';
const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const out = process.argv[3] ?? 'shots';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
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
await page.waitForTimeout(600);
await page.getByText('New League').click();
await page.getByRole('heading', { name: 'Fictional League' }).click();
await page.getByText('Choose your team').click();
await page.getByText(/Take over the/).click();
await page.fill('input[placeholder="Your name"]', 'QA Coach');
await page.getByText('Start career').click();
await page.waitForTimeout(2000);
await page.goto(`${base}/#/tactics`);
await shot('10-tactics', true);
await page.goto(`${base}/#/team/tactics/instructions?phase=outPoss`);
await shot('11-tactics-def', true);
await page.goto(`${base}/#/rotation`);
await shot('12-rotation', true);
await page.goto(`${base}/#/roster`);
await shot('13-roster');
// (a player's row on the roster opens his page)
const first = page.locator('.tm-rl-row').first();
await first.click();
await page.waitForTimeout(400);
await shot('14-player', true);
// start season
await page.goto(`${base}/#/`);
await page.waitForTimeout(400);
await play(page, 'Start regular season');
await shot('17-home-season');
// on to the first game day (opening night may be it already)
await play(page, 'Sim to next game');
await page.goto(`${base}/#/`);
await page.waitForTimeout(500);
await shot('18-home-gameday', true);
// the pre-game screen for that game (its matchup page's Preview)
await page.goto(`${base}/#/preview`);
await page.waitForTimeout(800);
await shot('18b-preview', true);
await page.goto(`${base}/#/live`);
await page.waitForTimeout(6000);
await shot('19-live');
// the console's game plan: tonight's numbers beside their levers
await page.locator('.lv-bb-views').getByRole('tab', { name: 'Tactics' }).click();
await shot('20-live-plan');
await page.locator('.lv-bb-views').getByRole('tab', { name: /^Now/ }).click();
// the live game's playback controls come up with a tap on the court
if (await page.locator('.lv-pb:not(.up)').count()) await page.locator('.lv-pb').click({ position: { x: 12, y: 12 } });
await page.getByRole('button', { name: 'Skip ahead', exact: true }).click();
await page
  .locator('.sheet')
  .getByRole('button', { name: /Sim to final/ })
  .click();
await page.waitForTimeout(1500);
await shot('21-live-final');
await page.getByRole('button', { name: /Game report/ }).click();
await page.waitForTimeout(800);
await shot('22-report', true);
console.log('errors:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
await browser.close();
