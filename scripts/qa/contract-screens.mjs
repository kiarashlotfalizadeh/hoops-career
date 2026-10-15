// Contract negotiation, the stretch provision, the exceptions and 10-day contracts on a phone
// viewport: builds a fictional league, shapes players through the dev store hook (window.__hc: a dev
// server, or a build with VITE_QA=1), and drives Re-sign (talks: a lowball, his counter, Accept
// counter), an extension, Free Agents (the exceptions, an offer over the cap, 10-day contracts and a
// hardship spot), the Release confirmation (as it is and stretched, and a buyout), Finances' dead
// money, the Office cap sheet, the roster, the player page and the inbox's 10-day notice, with
// screenshots. Fails on page errors, console errors or a page wider than the phone.
// Usage: npx vite --port 5186 & node scripts/qa/contract-screens.mjs http://localhost:5186 <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:5186';
const out = process.argv[3] ?? 'shots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
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
  // no sideways scroll at 390px
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 0) errors.push(`[overflow ${name}] ${over}px wider than the viewport`);
  console.log('shot', name);
};
const go = async (hash) => {
  await page.goto(`${base}/#${hash}`);
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
};
const closeSheet = async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
};
const scrollSheet = async (to = 'bottom') => {
  await page
    .locator('.sheet')
    .last()
    .evaluate((el, t) => (el.scrollTop = t === 'bottom' ? el.scrollHeight : 0), to)
    .catch(() => {});
  await page.waitForTimeout(200);
};
/** Run `fn` on the league in the page (fn's source is sent over; it gets the league and `arg`). */
const mutate = (fn, arg) =>
  page.evaluate(
    ([src, a]) => {
      let out;
      window.__hc.store.getState().mutate((l) => {
        out = new Function('l', 'a', `return (${src})(l, a)`)(l, a);
      });
      return out;
    },
    [fn.toString(), arg],
  );

// ------------------------------------------------------------------ a new league
await page.goto(`${base}/#/start`);
await page.waitForTimeout(800);
await page.getByText('New League').click();
await page.getByRole('heading', { name: 'Fictional League' }).click();
await page.getByText('Choose your team').click();
await page.getByText(/Take over the/).click();
await page.fill('input[placeholder="Your name"]', 'QA Coach');
await page.getByText('Start career').click();
await page.waitForTimeout(2500);

// ------------------------------------------------------------------ re-sign period: talks
const resign = await mutate((l) => {
  l.phase = 'resign';
  const mine = Object.values(l.players)
    .filter((p) => p.tid === l.userTid && !p.contract.twoWay)
    .sort((a, b) => b.ovr - a.ovr);
  const p = mine[2];
  p.contract = { start: l.season - 1, salaries: [9000, 9500] };
  p.experience = 6;
  p.bornYear = l.season - 27;
  p.mood.tradeRequest = false;
  p.mood.score = 1;
  delete p.promise;
  return { pid: p.pid, name: `${p.firstName} ${p.lastName}`.trim() };
});
await go('/resign');
await shot('e01-resign');
await page.getByRole('button', { name: `Negotiate with ${resign.name}` }).click();
await page.waitForTimeout(500);
await shot('e02-resign-sheet');
// a lowball: the minimum
await page.locator('.sheet').getByRole('button', { name: /^Min / }).click();
await page.waitForTimeout(200);
await scrollSheet();
await shot('e03-resign-lowball-warning');
await page
  .locator('.sheet')
  .getByRole('button', { name: /^Make offer/ })
  .click();
await page.waitForTimeout(500);
await scrollSheet();
await shot('e04-resign-counter');
// options: a player option on a three-year deal
await scrollSheet('top');
await page.locator('.sheet .fo-yr', { hasText: /^3/ }).click();
await page.locator('.sheet').getByRole('radio', { name: 'Player option', exact: true }).click();
await page.waitForTimeout(200);
await shot('e05-resign-option');
await scrollSheet();
const accept = page.locator('.sheet').getByRole('button', { name: 'Accept counter' });
if (await accept.count()) {
  await accept.click();
  await page.waitForTimeout(600);
}
await shot('e06-resign-after-accept');
await closeSheet();

// ------------------------------------------------------------------ the season: exceptions, an extension, a release
const setup = await mutate((l) => {
  l.phase = 'regular';
  l.day = 30;
  const s = l.season;
  const mine = Object.values(l.players)
    .filter((p) => p.tid === l.userTid && !p.contract.twoWay)
    .sort((a, b) => b.ovr - a.ovr);
  // over the cap, under the tax: the mid-level and the bi-annual are open
  l.teams[l.userTid].deadMoney = [{ pid: -1, name: 'Old Contract', season: s, amount: 60000 }];
  const ext = mine[1];
  ext.contract = { start: s - 2, salaries: [14000, 14500, 15000] };
  ext.experience = 6;
  ext.mood.tradeRequest = false;
  ext.mood.score = 1;
  delete ext.tradeLock;
  delete ext.promise;
  delete ext.talks;
  const vet = mine[6];
  vet.contract = { start: s - 1, salaries: [11000, 11500, 12000, 12500] };
  vet.bornYear = s - 33;
  vet.experience = 11;
  return { ext: { pid: ext.pid, name: `${ext.firstName} ${ext.lastName}`.trim() }, vet: { pid: vet.pid, name: `${vet.firstName} ${vet.lastName}`.trim() } };
});
await go('/office');
await shot('e07-office-cap-sheet');
await page
  .locator('.fo-hero')
  .first()
  .screenshot({ path: `${out}/e07b-office-exceptions.png` });
await go(`/player/${setup.ext.pid}`);
await page.getByRole('button', { name: 'Extend', exact: true }).click();
await page.waitForTimeout(500);
await shot('e08-extend-sheet');
await scrollSheet();
await shot('e09-extend-sheet-bottom');
await closeSheet();

// release: as it is and stretched side by side, and the buyout
await go(`/player/${setup.vet.pid}`);
await page.getByRole('button', { name: 'Release', exact: true }).click();
await page.waitForTimeout(500);
await shot('e10-release-confirm');
await scrollSheet();
await shot('e11-release-confirm-bottom');
await page.getByRole('button', { name: /^Release and stretch over/ }).click();
await page.waitForTimeout(600);
await go('/office');
await page.locator('.fo-contracts').scrollIntoViewIfNeeded();
await shot('e12-office-dead-stretched');
await go('/finances');
await shot('e13-finances-dead', true);

// free agents over the cap: the exceptions
const fa = await mutate((l) => {
  const p = Object.values(l.players)
    .filter((x) => x.tid === -1 && !x.waivers && !x.rfa)
    .sort((a, b) => b.ovr - a.ovr)[0];
  p.asking = { amount: 9000, years: 3 };
  // a full roster leaves room for one
  const mine = Object.values(l.players).filter((x) => x.tid === l.userTid && !x.contract.twoWay);
  for (const x of mine.slice(14)) x.tid = -1;
  // $5M over the cap, well under the tax: the mid-level and the bi-annual are open
  const t = l.teams[l.userTid];
  const old = t.deadMoney.find((d) => d.pid === -1);
  const pay = Object.values(l.players)
    .filter((x) => x.tid === l.userTid && !x.contract.twoWay)
    .reduce((a, x) => a + (x.contract.salaries[l.season - x.contract.start] ?? 0), 0);
  const dead = t.deadMoney.filter((d) => d.season === l.season && d !== old).reduce((a, d) => a + d.amount, 0);
  old.amount = Math.max(10, 174900 - pay - dead);
  return { pid: p.pid, name: `${p.firstName} ${p.lastName}`.trim() };
});
await go('/free-agents');
await shot('e14-fa-top');
await page.locator('.fo-prow', { hasText: fa.name }).first().click();
await page.waitForTimeout(500);
await page.locator('.sheet').getByRole('button', { name: /^Max / }).click();
await page.waitForTimeout(300);
await scrollSheet();
await shot('e15-fa-over-cap-exceptions');
const bae = page.locator('.sheet').getByRole('button', { name: /Use the bi-annual exception/ });
if (await bae.count()) {
  await bae.click();
  await page.waitForTimeout(300);
}
await scrollSheet();
await shot('e16-fa-bae-offer');
await closeSheet();

// ------------------------------------------------------------------ 10-day contracts and hardship
await mutate((l) => {
  l.day = 77;
  for (const p of Object.values(l.players)) if (p.tid === -1 && !p.waivers && !p.rfa) p.asking = { amount: 2400, years: 1 };
});
await go('/free-agents');
await page.getByRole('button', { name: '10-day contracts' }).click();
await page.waitForTimeout(300);
await shot('e17-fa-ten-day-list');
await page.locator('.fo-prow').first().click();
await page.waitForTimeout(400);
await shot('e18-ten-day-sheet');
await page.getByRole('button', { name: 'Sign to a 10-day' }).click();
await page.waitForTimeout(500);
// hardship: a full roster with four players out
const hard = await mutate((l) => {
  const mine = Object.values(l.players).filter((x) => x.tid === l.userTid && !x.contract.twoWay);
  for (const x of mine.slice(0, 4)) x.injury = { type: 'Sprained Ankle', gamesRemaining: 8, gamesTotal: 8, severity: 'minor' };
  const ten = mine.find((x) => x.contract.tenDay);
  return { n: mine.length, ten: ten && { pid: ten.pid, name: `${ten.firstName} ${ten.lastName}`.trim() } };
});
console.log('roster', hard.n, 'ten-day', hard.ten?.name);
await go('/free-agents');
// (the screen keeps its mode between visits)
const chip = page.getByRole('button', { name: '10-day contracts' });
if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
await page.waitForTimeout(300);
await page.locator('.fo-prow').first().click();
await page.waitForTimeout(400);
await shot('e19-ten-day-hardship');
await closeSheet();
await go('/roster');
await shot('e20-roster-ten-day', true);
await go(`/player/${hard.ten.pid}`);
await page.getByText('Contract', { exact: true }).scrollIntoViewIfNeeded();
await shot('e21-player-ten-day');
// his last day: the notice and its buttons
await mutate(
  (l, a) => {
    const p = l.players[a.pid];
    p.contract.tenDay.until = l.day + 1;
    l.inbox.unshift({
      id: l.nextMsgId++,
      season: l.season,
      day: l.day,
      read: false,
      from: 'Assistant GM',
      subject: `${p.firstName} ${p.lastName}'s 10-day contract ends tonight`,
      body: `${p.firstName} ${p.lastName}'s first 10-day contract with us ends after today's games.\nSign him to a second 10-day, for the rest of the season at his minimum, or let him go: doing nothing lets him go tomorrow, with no dead money.`,
      tone: 'alert',
      link: `/player/${p.pid}`,
      tenDay: p.pid,
    });
  },
  { pid: hard.ten.pid },
);
await go('/inbox');
await page.locator('.lg-msg-top').first().click();
await page.waitForTimeout(300);
await shot('e22-inbox-ten-day');
await page
  .locator('.lg-msg-body')
  .getByRole('button', { name: /Second 10-day/ })
  .click();
await page.waitForTimeout(500);
await shot('e23-inbox-ten-day-second');
await go('/office');
await page.locator('.fo-contracts').scrollIntoViewIfNeeded();
await shot('e24-office-ten-day');

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('ok');
