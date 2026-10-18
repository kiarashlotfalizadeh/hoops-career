// Quick screenshots of a few screens, for checking a change by eye without the whole tour. The
// league lives in a browser profile kept between runs, so only the first run creates it (and sims
// to the trade deadline with --mid).
// Usage: node scripts/qa/snap.mjs <devServerUrl> <outDir> [--profile dir] [--mid] [--tablet] name=/route ...
// e.g.   node scripts/qa/snap.mjs http://127.0.0.1:5173 shots --mid today=/ roster=/team office=/office
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { clearMoments } from './moments.mjs';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const [base, out] = args;
const profile = opt('--profile', `${out}/.profile`);
const routes = args.filter((a) => /^[\w-]+=\//.test(a)).map((a) => a.split(/=(.*)/s).slice(0, 2));
if (!base || !out || !routes.length) {
  console.error('Usage: node scripts/qa/snap.mjs <devServerUrl> <outDir> [--profile dir] [--mid] [--tablet] name=/route ...');
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const size = flag('--tablet') ? { width: 820, height: 1180 } : { width: 390, height: 844 };
const ctx = await chromium.launchPersistentContext(profile, { viewport: size, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = ctx.pages()[0] ?? (await ctx.newPage());
const errors = [];
page.on('pageerror', (e) => errors.push(`${e}`));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const play = async (label) => {
  await clearMoments(page);
  await page.getByRole('button', { name: 'Play options', exact: true }).click();
  await page.waitForTimeout(300);
  await page
    .locator('.sheet')
    .getByRole('button', { name: new RegExp('^' + label) })
    .first()
    .click();
  await page.waitForTimeout(300);
  await page.waitForSelector('.simbar', { state: 'detached', timeout: 600000 }).catch(() => {});
  await page.waitForTimeout(300);
  await clearMoments(page);
};

await page.goto(`${base}/#/start`);
await page.waitForTimeout(800);
if (await page.locator('.st-continue').count()) {
  await page.locator('.st-continue').click();
  await page.waitForTimeout(1200);
} else {
  console.log('creating a league (Thunder)…');
  await page.getByText('New League').click();
  await page.getByText('Choose your team').click();
  await page.getByText('West', { exact: true }).click();
  await page.getByRole('button', { name: /Thunder/ }).click();
  await page.getByText(/Take over the/).click();
  await page.fill('input[placeholder="Your name"]', 'QA Coach');
  await page.getByText('Start career').click();
  await page.waitForTimeout(2500);
  if (flag('--mid')) {
    await play('Start regular season');
    await play('Sim to trade deadline');
    await page.evaluate(() => window.__hc?.store.getState().save());
  }
}
for (const [name, route] of routes) {
  await page.goto(`${base}/#${route}`);
  await page.waitForTimeout(700);
  await clearMoments(page);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
await ctx.close();
if (errors.length) console.log(`errors:\n${errors.join('\n')}`);
console.log(`${routes.length} screens → ${out}`);
