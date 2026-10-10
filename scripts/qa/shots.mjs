// Phone-size screenshots of key flows. Usage: node scripts/qa/shots.mjs <baseUrl> <outDir> [flow]
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const out = process.argv[3] ?? 'shots';
const flow = process.argv[4] ?? 'new';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${name}.png`, fullPage: false }); console.log('shot', name); };
await page.goto(`${base}/#/start`);
await page.waitForTimeout(800);
await shot('01-start');
if (flow === 'new') {
  await page.getByText('New League').click();
  await page.waitForTimeout(600);
  await shot('02-new-type');
  const fict = page.getByRole('heading', { name: 'Fictional League' });
  await fict.click();
  await page.getByText('Choose your team').click();
  await page.waitForTimeout(300);
  await shot('03-new-team');
  await page.getByText(/Take over the/).click();
  await page.waitForTimeout(300);
  await page.fill('input[placeholder="Your name"]', 'QA Coach');
  await shot('04-new-setup');
  await page.getByText('Start career').click();
  await page.waitForTimeout(2500);
  await shot('05-home');
}
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
