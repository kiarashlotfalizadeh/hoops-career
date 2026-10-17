// Front Office screens on a phone viewport: Office, Trade, Free Agents, Draft, Finances,
// Settings, Re-sign. With stage "all" it also sims a season to capture the offseason
// (lottery, live draft, re-sign window, free agency).
// Usage: node scripts/qa/office-screens.mjs <baseUrl> <outDir> [pre|all]
import { chromium } from 'playwright';
import { clearMoments } from './moments.mjs';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const out = process.argv[3] ?? 'shots';
const stage = process.argv[4] ?? 'pre';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror ${page.url()}] ${e}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console ${page.url()}] ${m.text()}`);
});
const shot = async (name, full = false) => {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
  console.log('shot', name);
};
const go = async (hash) => {
  await page.goto(`${base}/#${hash}`);
  await page.waitForTimeout(500);
};
const closeSheet = async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
};
const scrollSheet = async () => {
  await page
    .locator('.sheet')
    .evaluate((el) => (el.scrollTop = el.scrollHeight))
    .catch(() => {});
};
const waitSim = async () => {
  await page.waitForTimeout(400);
  await page.waitForSelector('.simbar', { state: 'detached', timeout: 240000 }).catch(() => {});
  await clearMoments(page);
};
const tryClick = async (locator, label) => {
  try {
    await locator.click({ timeout: 4000 });
    return true;
  } catch {
    console.log('skip:', label);
    return false;
  }
};

// ------------------------------------------------------------------ new league
await page.goto(`${base}/#/start`);
await page.waitForTimeout(800);
await page.getByText('New League').click();
await page.getByRole('heading', { name: 'Fictional League' }).click();
await page.getByText('Choose your team').click();
await page.getByText(/Take over the/).click();
await page.fill('input[placeholder="Your name"]', 'QA Coach');
await page.getByText('Start career').click();
await page.waitForTimeout(2500);

// ------------------------------------------------------------------ preseason screens
await go('/office');
await shot('o01-office');
await shot('o02-office-full', true);
if (await tryClick(page.locator('table.fo-contracts tbody tr.clickable').first(), 'contract row')) {
  await shot('o03-contract-sheet');
  if (await tryClick(page.locator('.sheet').getByRole('button', { name: 'Release', exact: true }), 'release')) {
    await shot('o04-release-confirm');
    await tryClick(page.getByRole('button', { name: 'Keep him' }), 'keep');
  }
  await closeSheet();
}

await go('/trade?with=3');
await shot('o05-trade');
await tryClick(page.locator('.fo-asset:visible').nth(0), 'their player');
await tryClick(page.getByRole('radio', { name: /Your assets/ }), 'your assets tab');
await tryClick(page.locator('.fo-asset:visible').nth(3), 'my player');
await shot('o06-trade-selected');
await shot('o07-trade-full', true);
if (await tryClick(page.getByRole('button', { name: 'What would make this work?' }), 'make it work')) await shot('o08-trade-makework');
await tryClick(page.getByRole('radio', { name: 'Trading block' }), 'block tab');
await tryClick(page.locator('.hscroll .chip').first(), 'block chip');
await page.waitForTimeout(600);
await shot('o09-trade-block');
await shot('o09b-trade-block-full', true);

await go('/free-agents');
await shot('o10-fa');
await shot('o10b-fa-full', true);
if (await tryClick(page.locator('.fo-prow').first(), 'fa row')) {
  await shot('o11-fa-offer');
  await scrollSheet();
  await shot('o12-fa-offer-bottom');
  await closeSheet();
}

await go('/draft');
await shot('o13-draft-board');
await tryClick(page.getByRole('radio', { name: 'Combine' }), 'combine');
await shot('o14-draft-combine');
await tryClick(page.getByRole('radio', { name: 'Your picks' }), 'your picks');
await shot('o15-draft-mypicks');
await tryClick(page.getByRole('radio', { name: 'Big board' }), 'board');
if (await tryClick(page.locator('.fo-prow').first(), 'prospect')) {
  await shot('o16-draft-prospect');
  await closeSheet();
}

await go('/finances');
await shot('o17-finances');
await tryClick(page.getByRole('radio', { name: 'Budget' }), 'budget');
await shot('o18-finances-budget', true);
await tryClick(page.getByRole('radio', { name: 'Owner' }), 'owner');
await shot('o19-owner', true);
await tryClick(page.getByRole('radio', { name: 'History' }), 'history');
await shot('o20-fin-history');

await go('/settings');
await shot('o21-settings', true);
if (await tryClick(page.getByRole('button', { name: 'Switch team' }), 'switch')) {
  await tryClick(page.locator('.fo-teamgrid button:not([disabled])').first(), 'pick team');
  await shot('o22-switch-sheet');
  await closeSheet();
}

await go('/resign');
await shot('o23-resign-off', true);

// ------------------------------------------------------------------ season → offseason
if (stage === 'all') {
  const play = async (re) => {
    await clearMoments(page);
    await page.getByRole('button', { name: 'Play options', exact: true }).click();
    await page.waitForTimeout(350);
    const btn = page.locator('.sheet button').filter({ hasText: re }).first();
    if (!(await btn.count())) {
      await closeSheet();
      return false;
    }
    await btn.click();
    return true;
  };
  const simWhile = async (re, max = 40) => {
    for (let i = 0; i < max; i++) {
      if (!(await play(re))) return;
      await waitSim();
    }
  };
  await go('/');
  await play(/Start regular season/);
  await page.waitForTimeout(800);
  await play(/Sim 1 week/);
  await waitSim();
  await go('/office');
  await shot('s01-office-regular');
  await go('/trade?with=5');
  await shot('s02-trade-regular');
  await go('/');
  await simWhile(/Sim to end of regular season/);
  await simWhile(/Sim through play-in|Sim to end of playoffs/);
  await go('/draft');
  await shot('s03-draft-lottery', true);
  await go('/office');
  await shot('s04-office-lottery');
  await go('/draft');
  await tryClick(page.getByRole('button', { name: /Start the draft/ }), 'start draft');
  await page.waitForTimeout(600);
  await shot('s05-draft-live');
  await shot('s05b-draft-live-full', true);
  // each prospect's Draft button sits next to his row (".fo-prow"), not inside it
  if (await tryClick(page.locator('button.btn.sm.good').first(), 'draft btn')) {
    await shot('s06-draft-confirm');
    await tryClick(page.getByRole('button', { name: 'Draft him' }), 'draft him');
    await page.waitForTimeout(600);
    await shot('s07-draft-after-pick');
  }
  await tryClick(page.getByRole('button', { name: /Sim to end/ }).first(), 'sim to end');
  // asked only while you still hold a pick; the simmed draft then stays open until you move on
  await tryClick(page.getByRole('button', { name: 'Sim the draft' }), 'confirm sim');
  await page.waitForTimeout(600);
  await tryClick(page.getByRole('button', { name: /Continue to re-signing/ }), 'continue to re-signing');
  await waitSim();
  await page.waitForTimeout(800);
  await go('/resign');
  await shot('s08-resign', true);
  if (await tryClick(page.getByRole('button', { name: /Negotiate/ }).first(), 'negotiate')) {
    await shot('s09-resign-sheet');
    await scrollSheet();
    await shot('s10-resign-sheet-bottom');
    await closeSheet();
  }
  await go('/office');
  await shot('s11-office-resign');
  await go('/resign');
  await tryClick(page.getByRole('button', { name: /Done — open free agency/ }), 'done');
  await tryClick(page.locator('.sheet').getByRole('button', { name: 'Open free agency' }), 'confirm fa');
  await page.waitForTimeout(800);
  await shot('s12-fa-day1');
  await tryClick(page.getByRole('button', { name: /Next day/ }), 'next day');
  await page.waitForTimeout(500);
  await shot('s13-fa-day2', true);
  if (await tryClick(page.locator('.fo-prow').first(), 'fa row')) {
    await shot('s14-fa-offer-offseason');
    await closeSheet();
  }
  await go('/office');
  await shot('s15-office-fa', true);
  await go('/draft');
  await shot('s16-draft-results');
  await go('/finances');
  await tryClick(page.getByRole('radio', { name: 'History' }), 'history');
  await shot('s17-fin-history');
  await tryClick(page.getByRole('radio', { name: 'Owner' }), 'owner');
  await shot('s18-owner-after', true);
}

console.log('errors:', errors.length ? `\n${errors.join('\n')}` : 'none');
await browser.close();
