// Visual tour: every screen and tab of the real league on a phone and a tablet, at several
// points of a season. For design review, not assertions; page errors are collected and printed.
// Usage: node scripts/qa/tour.mjs <devServerUrl> <outDir> [stages=pre,mid,post,draft,resign,fa]
// It reads the league through window.__hc (player and game ids, saves), which only dev servers
// (npm run dev) and builds made with VITE_QA=1 expose: for a production-like run,
// `VITE_QA=1 npm run build && npm run preview`.
import { chromium } from 'playwright';
import { clearMoments } from './moments.mjs';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const out = process.argv[3] ?? 'tour';
const stages = (process.argv[4] ?? 'pre,mid,post,draft,resign,fa').split(',');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
// one page for both sizes: a second window on the same league would be a stale copy the moment
// either one saves (opening a screen can tick off a step of the first-week guide)
const phone = await ctx.newPage();
const errors = [];
phone.on('pageerror', (e) => errors.push(`${e}`));
phone.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const t0 = Date.now();
const log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
const waitSim = async (pg) => {
  await pg.waitForTimeout(300);
  await pg.waitForSelector('.simbar', { state: 'detached', timeout: 600000 }).catch(() => {});
  await pg.waitForTimeout(300);
  await clearMoments(pg);
};
const phase = async () => `${await phone.locator('.topbar').first().getAttribute('data-phase')} · ${(await phone.locator('.topbar .sub').first().textContent())?.trim()}`;
const play = async (label) => {
  await clearMoments(phone);
  await phone.getByRole('button', { name: 'Play options', exact: true }).click();
  await phone.waitForTimeout(300);
  const b = phone
    .locator('.sheet')
    .getByRole('button', { name: new RegExp('^' + label) })
    .first();
  if (!(await b.count()) || (await b.isDisabled())) {
    await phone.keyboard.press('Escape');
    await phone
      .locator('.sheet-backdrop')
      .click({ position: { x: 5, y: 5 } })
      .catch(() => {});
    return false;
  }
  await b.click();
  await waitSim(phone);
  log(`${label} → ${await phase()}`);
  return true;
};
const league = () =>
  phone.evaluate(() => {
    const l = window.__hc.store.getState().league;
    const mine = Object.values(l.players)
      .filter((p) => p.tid === l.userTid)
      .sort((a, b) => b.ovr - a.ovr);
    const g = [...l.games].reverse().find((x) => x.home.tid === l.userTid || x.away.tid === l.userTid);
    return {
      star: mine[0]?.pid,
      rookie: Object.values(l.players).find((p) => p.tid === l.userTid && p.draft?.year === l.season)?.pid,
      gid: g?.gid,
      other: (l.userTid + 7) % 30,
      // the next opponent (or any other team between seasons), for its matchup page
      opp: (() => {
        const n = l.schedule.filter((x) => !x.played && x.day >= l.day && (x.home === l.userTid || x.away === l.userTid)).sort((a, b) => a.day - b.day)[0];
        return n ? (n.home === l.userTid ? n.away : n.home) : (l.userTid + 7) % 30;
      })(),
      phase: l.phase,
    };
  });
const save = () => phone.evaluate(() => window.__hc.store.getState().save());

async function snap(pg, dir, name, route) {
  await pg.goto(`${base}/#${route}`);
  await pg.waitForTimeout(700);
  await pg.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  // (Settings' radio groups change the league: its difficulty, its live-game defaults)
  if (route.startsWith('/settings')) return;
  // every option of the screen's first tab bar (segmented bars are radio groups)
  const tabs = pg.locator('main [role=tablist], main [role=radiogroup]').first().locator('[role=tab], [role=radio]');
  const n = Math.min(await tabs.count(), 9);
  for (let i = 1; i < n; i++) {
    const t = tabs.nth(i);
    const label = ((await t.textContent()) ?? `t${i}`)
      .trim()
      .replace(/[^a-z0-9]+/gi, '_')
      .slice(0, 20);
    await t.click().catch(() => {});
    await pg.waitForTimeout(500);
    await pg.screenshot({ path: `${dir}/${name}-${label}.png`, fullPage: true });
  }
}

async function tour(stage) {
  await save();
  const ids = await league();
  const routes = [
    ['today', '/'],
    ['inbox', '/inbox'],
    ['settings', '/settings'],
    ['roster', '/team'],
    ['rotation', '/team/rotation'],
    ['tactics', '/team/tactics'],
    ['lineups', '/team/lineups'],
    ['player', `/player/${ids.star}`],
    ['games', '/games'],
    ['matchup', `/games/${ids.opp}`],
    ['lab', '/lab'],
    ['league', '/league'],
    ['team', `/teams/${ids.other}`],
    ['history', '/league/history'],
    ['office', '/office'],
    ['trade', '/office/trade'],
    ['fa', '/office/free-agents'],
    ['resign', '/office/resign'],
    ['draft', '/office/draft'],
    ['assets', '/office/assets'],
    ['finances', '/office/finances'],
    ['owner', '/office/owner'],
    ['career', '/office/career'],
  ];
  if (ids.gid) routes.push(['game', `/game/${ids.gid}`]);
  if (ids.rookie) routes.push(['rookie', `/player/${ids.rookie}`]);
  for (const [dev, size] of [
    ['phone', { width: 390, height: 844 }],
    ['tablet', { width: 820, height: 1180 }],
  ]) {
    const dir = `${out}/${stage}/${dev}`;
    mkdirSync(dir, { recursive: true });
    await phone.setViewportSize(size);
    for (const [name, route] of routes) await snap(phone, dir, name, route).catch((e) => log(`  ${dev} ${name}: ${e.message.split('\n')[0]}`));
  }
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`${base}/#/`);
  await phone.waitForTimeout(500);
  log(`toured ${stage} (${ids.phase})`);
}

await phone.goto(`${base}/#/start`);
await phone.waitForTimeout(800);
if (!(await phone.evaluate(() => !!window.__hc))) {
  console.error(`${base} doesn't expose window.__hc: point the tour at a dev server (npm run dev) or a build made with VITE_QA=1.`);
  await browser.close();
  process.exit(1);
}
mkdirSync(`${out}/start`, { recursive: true });
await phone.screenshot({ path: `${out}/start/phone-start.png`, fullPage: true });
await phone.getByText('New League').click();
await phone.waitForTimeout(500);
await phone.screenshot({ path: `${out}/start/phone-new.png`, fullPage: true });
await phone.getByText('Choose your team').click();
await phone.waitForTimeout(400);
await phone.screenshot({ path: `${out}/start/phone-pick.png`, fullPage: true });
await phone.getByText('West', { exact: true }).click();
await phone.getByRole('button', { name: /Thunder/ }).click();
await phone.waitForTimeout(400);
await phone.screenshot({ path: `${out}/start/phone-picked.png`, fullPage: true });
await phone.getByText(/Take over the/).click();
await phone.fill('input[placeholder="Your name"]', 'QA Coach');
await phone.screenshot({ path: `${out}/start/phone-name.png`, fullPage: true });
await phone.getByText('Start career').click();
await phone.waitForTimeout(2500);
log(`created → ${await phase()}`);

// stages come in season order: stop simming once the last one asked for is captured
const ORDER = ['pre', 'mid', 'post', 'draft', 'resign', 'fa'];
const want = (stage) => stages.some((s) => ORDER.indexOf(s) >= ORDER.indexOf(stage));
if (stages.includes('pre')) await tour('pre');
if (want('mid')) await play('Start regular season');
if (stages.includes('mid')) {
  await play('Sim to next game');
  // a live game for the game view and live screens
  await clearMoments(phone);
  await phone.getByRole('button', { name: 'Play options', exact: true }).click();
  await phone.waitForTimeout(300);
  const live = phone
    .locator('.sheet')
    .getByRole('button', { name: /^Watch & coach live/ })
    .first();
  if (await live.count()) {
    await live.click();
    await phone.waitForTimeout(4000);
    mkdirSync(`${out}/live`, { recursive: true });
    await phone.screenshot({ path: `${out}/live/phone-live.png` });
    // the in-game sheets: the lineup, the calls and the clipboard
    for (const name of ['Subs', 'Call', 'Clipboard']) {
      const b = phone.getByRole('button', { name, exact: true }).first();
      if (await b.count()) {
        await b.click().catch(() => {});
        await phone.waitForTimeout(400);
        await phone.screenshot({ path: `${out}/live/phone-live-${name}.png`, fullPage: true });
        await phone.keyboard.press('Escape');
        await phone.waitForTimeout(200);
      }
    }
    // the live game's playback controls come up with a tap on the court
    if (await phone.locator('.pb:not(.up)').count()) await phone.locator('.pb').click({ position: { x: 12, y: 12 } });
    await phone
      .getByRole('button', { name: 'Skip ahead', exact: true })
      .click()
      .catch(() => {});
    await phone
      .locator('.sheet')
      .getByRole('button', { name: /Sim to final/ })
      .click()
      .catch(() => {});
    await phone.waitForTimeout(2500);
    await phone.screenshot({ path: `${out}/live/phone-final.png`, fullPage: true });
  } else await phone.keyboard.press('Escape');
  await phone.goto(`${base}/#/`);
  // big news (a long injury, a trade request) pauses the sim: keep going until the deadline is reached
  for (let i = 0; i < 10 && (await play('Sim to trade deadline')); i++);
  await tour('mid');
}
if (want('post')) {
  for (let i = 0; i < 25 && /Regular season/i.test((await phase()) ?? ''); i++) await play('Sim to end of regular season');
  for (let i = 0; i < 10 && /Play-in|Playoffs/i.test((await phase()) ?? ''); i++) await play('Sim (through play-in|to end of playoffs)');
}
if (stages.includes('post')) await tour('post');
if (want('draft')) for (let i = 0; i < 4 && !/NBA draft/i.test((await phase()) ?? ''); i++) if (!(await play('(Go to the draft)'))) break;
if (stages.includes('draft')) await tour('draft');
if (want('resign')) for (let i = 0; i < 3 && /NBA draft/i.test((await phase()) ?? ''); i++) if (!(await play('Auto-draft the rest'))) break;
if (stages.includes('resign')) await tour('resign');
if (want('fa')) for (let i = 0; i < 3 && !/Free Agency/i.test((await phase()) ?? ''); i++) if (!(await play('Open free agency'))) break;
if (stages.includes('fa')) await tour('fa');
console.log(`errors: ${errors.length}`);
for (const e of [...new Set(errors)].slice(0, 30)) console.log('  ' + e.slice(0, 300));
await browser.close();
