// Restricted free agency on a phone viewport: builds a fictional league, shapes the user's expiring
// young players through the dev store hook (window.__hc: a dev server, or a build with VITE_QA=1),
// and drives Re-sign (qualifying offers), the open-free-agency confirm, Free Agents (your
// restricted free agents, an offer sheet on one, signing another team's to a sheet), the Inbox's
// Match button, the Office spotlight, the Play menu, the player page and the Moves tab, with
// screenshots. Fails on page errors, console errors or a page wider than the phone.
// Usage: npx vite --port 5183 & node scripts/qa/rfa-screens.mjs http://localhost:5183 <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183';
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
const scrollSheet = async () => {
  await page
    .locator('.sheet')
    .evaluate((el) => (el.scrollTop = el.scrollHeight))
    .catch(() => {});
};
const waitSim = async () => {
  await page.waitForTimeout(400);
  await page.waitForSelector('.simbar', { state: 'detached', timeout: 240000 }).catch(() => {});
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

// ------------------------------------------------------------------ new league, then the re-sign period
await page.goto(`${base}/#/start`);
await page.waitForTimeout(800);
await page.getByText('New League').click();
await page.getByRole('heading', { name: 'Fictional League' }).click();
await page.getByText('Choose your team').click();
await page.getByText(/Take over the/).click();
await page.fill('input[placeholder="Your name"]', 'QA Coach');
await page.getByText('Start career').click();
await page.waitForTimeout(2500);

const names = await mutate((l) => {
  l.phase = 'resign';
  const mine = Object.values(l.players)
    .filter((p) => p.tid === l.userTid)
    .sort((a, b) => b.ovr - a.ovr);
  // a second-rounder at 2 seasons, a first-rounder finishing his rookie scale, a veteran
  const [a, b, c] = [mine[3], mine[5], mine[1]];
  a.contract = { start: l.season - 1, salaries: [2400, 2600] };
  a.experience = 2;
  a.draft = { year: l.season - 2, round: 2, pick: 44, tid: l.userTid };
  b.contract = { start: l.season - 3, salaries: [4200, 4400, 4600, 4800], rookie: true };
  b.experience = 3;
  b.draft = { year: l.season - 4, round: 1, pick: 12, tid: l.userTid };
  c.contract = { start: l.season - 2, salaries: [18000, 19000, 20000] };
  c.experience = 7;
  for (const p of [a, b, c]) {
    p.mood.tradeRequest = false;
    p.asking = undefined;
  }
  return [a, b, c].map((p) => ({ pid: p.pid, name: `${p.firstName} ${p.lastName}`.trim(), last: p.lastName }));
});
console.log('expiring', names.map((x) => x.name).join(', '));

await go('/resign');
await shot('d01-resign', true);
await page.getByRole('button', { name: `Extend ${names[0].name} a qualifying offer` }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: `Extend ${names[1].name} a qualifying offer` }).click();
await page.waitForTimeout(400);
await shot('d02-resign-qualified', true);
await page.locator('.fo-hero').first().scrollIntoViewIfNeeded();
await shot('d02b-resign-top');
await go('/office');
await shot('d03-office-resign');
await go(`/player/${names[0].pid}`);
await shot('d04-player-qualified', true);
await go('/resign');
await page.getByRole('button', { name: /Done — open free agency/ }).click();
await page.waitForTimeout(400);
await shot('d05-open-fa-confirm');
await page.locator('.sheet').getByRole('button', { name: 'Open free agency' }).click();
await waitSim();
await page.waitForTimeout(1200);

// ------------------------------------------------------------------ free agency: your restricted free agents
await go('/free-agents');
await shot('d06-fa-top');
await shot('d06b-fa-full', true);
await page.getByRole('button', { name: 'Withdraw offer' }).first().click();
await page.waitForTimeout(300);
await shot('d07-withdraw-confirm');
await page.getByRole('button', { name: 'Keep his rights' }).click();
await page.waitForTimeout(300);
await page
  .getByRole('button', { name: /Re-sign/ })
  .first()
  .click();
await page.waitForTimeout(400);
await shot('d08-rfa-resign-sheet');
await scrollSheet();
await shot('d08b-rfa-resign-sheet-bottom');
await closeSheet();

// an AI team signs the first one to an offer sheet (as signOfferSheet would): the cards, the inbox
const sheetTeam = await mutate(
  (l, a) => {
    const p = l.players[a.pid];
    const tid = (l.userTid + 3) % l.teams.length;
    p.rfa.sheet = { tid, amount: 9000, years: 4, route: 'space', day: l.faDay, until: l.faDay + 1 };
    l.inbox.unshift({
      id: l.nextMsgId++,
      season: l.season,
      day: l.day,
      read: false,
      from: 'Assistant GM',
      subject: `${l.teams[tid].abbrev} signed ${p.firstName} ${p.lastName} to an offer sheet`,
      body: 'Match it by the end of day 2 and he stays with us on exactly those terms. Let it go, or leave it unanswered until then, and he joins them. Matching needs a roster spot, not cap room.',
      tone: 'alert',
      important: true,
      link: '/free-agents',
      sheet: p.pid,
    });
    return l.teams[tid].abbrev;
  },
  { pid: names[0].pid },
);
console.log('sheet from', sheetTeam);
await go('/free-agents');
await shot('d09-fa-sheet-decision');
await go('/office');
await shot('d10-office-fa-sheet');
// the season can't start until he decides
await page.getByRole('button', { name: 'Play options', exact: true }).click();
await page.waitForTimeout(400);
await shot('d11-play-menu-blocked');
await closeSheet();
await go('/inbox');
await page.locator('.lg-msg-top').first().click();
await page.waitForTimeout(300);
await shot('d12-inbox-sheet');
await page.locator('.lg-msg-body').getByRole('button', { name: /Match/ }).click();
await page.waitForTimeout(500);
await shot('d13-inbox-matched');

// ------------------------------------------------------------------ another team's restricted free agent: an offer sheet
const target = await mutate((l) => {
  const s = l.season + 1;
  // room to spend: the user's deals on next season's minimum
  for (const p of Object.values(l.players))
    if (p.tid === l.userTid && p.contract.start + p.contract.salaries.length - 1 >= s && !p.contract.twoWay) p.contract = { start: s, salaries: [2500] };
  l.teams[l.userTid].deadMoney = [];
  const fa = Object.values(l.players)
    .filter((p) => p.tid === -1 && !p.rfa && !p.waivers)
    .sort((a, b) => b.ovr - a.ovr)[0];
  const tid = (l.userTid + 5) % l.teams.length;
  fa.rfa = { tid, qo: 5200, hold: 11000 };
  fa.bornYear = l.season - 23;
  fa.experience = 2;
  return { pid: fa.pid, name: `${fa.firstName} ${fa.lastName}`.trim(), team: l.teams[tid].abbrev };
});
await go('/free-agents');
await shot('d14-fa-list-rfa');
const row = page.locator('.fo-prow', { hasText: target.name }).first();
await row.scrollIntoViewIfNeeded();
await shot('d14b-fa-row-rfa');
await row.click();
await page.waitForTimeout(500);
await shot('d15-offer-sheet');
await scrollSheet();
await shot('d15b-offer-sheet-bottom');
const sign = page.locator('.sheet').getByRole('button', { name: /^Offer sheet ·/ });
await page
  .locator('.sheet')
  .getByRole('button', { name: /^His ask/ })
  .click()
  .catch(() => {});
await page.waitForTimeout(300);
if (await sign.isEnabled()) {
  await sign.click();
  await page.waitForTimeout(500);
} else console.log('offer sheet button disabled');
await go('/free-agents');
await shot('d16-fa-your-sheets');
await go(`/player/${target.pid}`);
await shot('d17-player-rfa-sheet', true);
await go(`/team/${await page.evaluate(() => window.__hc.store.getState().league.userTid)}?tab=moves`);
await page.waitForTimeout(500);
await shot('d18-moves', true);
await browser.close();
console.log(errors.length ? `\nERRORS:\n${errors.join('\n')}` : '\nNo errors.');
process.exitCode = errors.length ? 1 : 0;
