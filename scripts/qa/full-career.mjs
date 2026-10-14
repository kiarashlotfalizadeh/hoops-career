// End-to-end career QA on a phone viewport with the real league: every phase of one full
// season and offseason, driven only through the in-app Play menu, as a player would.
// Usage: node scripts/qa/full-career.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
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
const t0 = Date.now();
const log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
const shot = async (name, full = true) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
};
const waitSim = async () => {
  await page.waitForTimeout(400);
  await page.waitForSelector('.simbar', { state: 'detached', timeout: 600000 }).catch(() => {});
  await page.waitForTimeout(400);
};
const phase = async () => `${await page.locator('.topbar').first().getAttribute('data-phase')} · ${(await page.locator('.topbar .sub').first().textContent())?.trim()}`;
const play = async (label) => {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(300);
  const b = page
    .locator('.sheet')
    .getByRole('button', { name: new RegExp('^' + label) })
    .first();
  if (!(await b.count())) {
    log(`  (no "${label}" in Play menu)`);
    await page.keyboard.press('Escape');
    return false;
  }
  if (await b.isDisabled()) {
    log(`  "${label}" disabled: ${(await b.textContent())?.trim()}`);
    await page.keyboard.press('Escape');
    return false;
  }
  await b.click();
  await waitSim();
  log(`${label} → ${await phase()}`);
  return true;
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
log(`created → ${await phase()}`);

await play('Start regular season');
// one live game, coached to the end
await play('Sim to next game');
await page.getByRole('button', { name: 'Play', exact: true }).click();
await page.waitForTimeout(300);
const live = page
  .locator('.sheet')
  .getByRole('button', { name: /^Watch & coach live/ })
  .first();
if (await live.count()) {
  await live.click();
  await page.waitForTimeout(5000);
  await shot('01-live', false);
  await page.getByRole('button', { name: 'Skip ahead', exact: true }).click();
  await page
    .locator('.sheet')
    .getByRole('button', { name: /Sim to final/ })
    .click();
  await page.waitForTimeout(2500);
  await shot('02-live-final', false);
  const rep = page.getByRole('button', { name: /Game report/ });
  if (await rep.count()) {
    await rep.click();
    await page.waitForTimeout(800);
    await shot('03-report');
  }
  log('live game finished');
} else await page.keyboard.press('Escape');
await page.goto(`${base}/#/`);
// big news (a long injury, a trade request) pauses the sim: keep going until the deadline is reached
for (let i = 0; i < 10 && (await play('Sim to trade deadline')); i++);
await page.goto(`${base}/#/trade`);
await page.waitForTimeout(800);
await shot('04-trade');
await page.goto(`${base}/#/`);
let stops = 0;
for (let i = 0; i < 25 && /Regular season/i.test((await phase()) ?? ''); i++) {
  await play('Sim to end of regular season');
  if (/Regular season/i.test((await phase()) ?? '')) {
    stops++;
    const msg = await page
      .locator('.toast')
      .first()
      .textContent()
      .catch(() => '');
    const top = await page.evaluate(() =>
      [...document.querySelectorAll('a, div')]
        .map((e) => e.textContent)
        .find((t) => /Trade request|Medical Staff|Owner/.test(t ?? ''))
        ?.slice(0, 120),
    );
    log(`  paused for news (${stops}): ${msg ?? ''} ${top ?? ''}`);
  }
}
log(`regular season done with ${stops} pauses for big news`);
await shot('05-home-end-regular');
await page.goto(`${base}/#/league?tab=standings`);
await page.waitForTimeout(600);
await shot('06-standings');
await page.goto(`${base}/#/`);
// big news pauses the postseason sim too: keep going until the playoffs are over
for (let i = 0; i < 10 && /Play-in|Playoffs/i.test((await phase()) ?? ''); i++) await play('Sim (through play-in|to end of playoffs)');
await page.goto(`${base}/#/league?tab=playoffs`);
await page.waitForTimeout(600);
await shot('07-playoffs');
await page.goto(`${base}/#/league?tab=awards`);
await page.waitForTimeout(600);
await shot('08-awards');
await page.goto(`${base}/#/draft`);
await page.waitForTimeout(800);
await shot('09-draft-lottery');
await page.goto(`${base}/#/`);
await play('Go to the draft');
await page.goto(`${base}/#/draft`);
await page.waitForTimeout(800);
const auto = page.getByRole('button', { name: /Auto-pick for me/ });
if (await auto.count()) {
  await auto.click();
  await waitSim();
  log('auto-picked one');
}
await shot('10-draft');
await play('Auto-draft the rest');
await page.goto(`${base}/#/resign`);
await page.waitForTimeout(800);
await shot('11-resign');
await page.goto(`${base}/#/`);
await play('Open free agency');
await page.goto(`${base}/#/free-agents`);
await page.waitForTimeout(800);
await shot('12-free-agents');
await page.goto(`${base}/#/`);
await play('Advance 1 week');
await play('Start \\d{4}-\\d{2} season');
await shot('13-new-preseason');
await page.goto(`${base}/#/roster`);
await page.waitForTimeout(600);
await shot('14-roster-y2');
// the draft can leave more than 15 standard contracts: cut the cheapest one, as a player would, until the season can start
for (let i = 0; i < 5; i++) {
  await page.goto(`${base}/#/`);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(300);
  const start = page
    .locator('.sheet')
    .getByRole('button', { name: /^Start regular season/ })
    .first();
  const over = (await start.count()) && (await start.isDisabled()) && /Release or trade down/.test((await start.textContent()) ?? '');
  await page.keyboard.press('Escape');
  if (!over) break;
  await page.goto(`${base}/#/office`);
  await page.waitForTimeout(600);
  // two-way deals don't count toward the 15
  const row = page.locator('table.fo-contracts tbody tr.clickable').filter({ hasNotText: '2W' }).last();
  const who = (await row.locator('.fo-name').first().textContent())?.trim();
  await row.click();
  await page.locator('.sheet').getByRole('button', { name: 'Release', exact: true }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Release', exact: true }).click();
  await page.waitForTimeout(400);
  log(`  released ${who} to get down to 15`);
}
await page.goto(`${base}/#/`);
await play('Start regular season');
log(`final phase: ${await phase()}`);
console.log('errors:', errors.length ? errors.slice(0, 12) : 'none');
await browser.close();
