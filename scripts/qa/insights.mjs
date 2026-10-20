// Tactics insights and the rotation after a few games of a fictional league, on a phone and a
// tablet. Works on any build (dev server or preview).
// Usage: node scripts/qa/insights.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import { play } from './play.mjs';
const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const out = process.argv[3] ?? 'shots';
const browser = await chromium.launch();
const errors = [];
async function run(viewport, prefix) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: viewport.width < 600, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const shot = async (name, full = true) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${prefix}-${name}.png`, fullPage: full });
    console.log('shot', prefix, name);
  };
  await page.goto(`${base}/#/start`);
  await page.waitForTimeout(600);
  await page.getByText('New League').click();
  await page.getByRole('heading', { name: 'Fictional League' }).click();
  await page.getByText('Choose your team').click();
  await page.getByText(/Take over the/).click();
  await page.fill('input[placeholder="Your name"]', 'QA');
  await page.getByText('Start career').click();
  await page.waitForTimeout(1500);
  await play(page, 'Start regular season');
  // a few games: quick-sim the game on a game day, sim to the next game otherwise
  for (let i = 0; i < 4; i++) {
    await page.goto(`${base}/#/`);
    await page.waitForTimeout(400);
    if (!(await play(page, 'Quick sim this game'))) await play(page, 'Sim to next game');
  }
  await page.goto(`${base}/#/tactics?tab=insights`);
  await shot('insights');
  await page.goto(`${base}/#/rotation`);
  await shot('rotation');
  await page.goto(`${base}/#/`);
  await shot('home');
  await ctx.close();
}
await run({ width: 390, height: 844 }, 'phone');
await run({ width: 820, height: 1180 }, 'tablet');
console.log('errors:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
await browser.close();
