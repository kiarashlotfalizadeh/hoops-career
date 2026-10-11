// Real-league live game QA on phone and tablet viewports: OKC (15-man roster), opening night.
// Usage: node scripts/qa/real-live.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const out = process.argv[3] ?? 'shots';
const browser = await chromium.launch();
const errors = [];
for (const [tag, viewport] of [
  ['phone', { width: 390, height: 844 }],
  ['tablet', { width: 1180, height: 820 }],
]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag}: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`);
  });
  const shot = async (name, full = false) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage: full });
    console.log('shot', tag, name);
  };
  await page.goto(`${base}/#/start`);
  await page.waitForTimeout(800);
  await page.getByText('New League').click();
  await page.getByText('Choose your team').click();
  await page.getByText('West', { exact: true }).click();
  await page.getByRole('button', { name: /Thunder/ }).click();
  await page.getByText(/Take over the/).click();
  await page.fill('input[placeholder="Your name"]', 'QA Coach');
  await page.getByText('Start career').click();
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Start regular season' }).first().click();
  await page.waitForTimeout(1200);
  await shot('home', true);
  await page.goto(`${base}/#/live`);
  await page.waitForTimeout(8000);
  await shot('live');
  await page
    .getByRole('button', { name: 'Box' })
    .click()
    .catch(() => {});
  await shot('live-box');
  await ctx.close();
}
console.log('errors:', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
