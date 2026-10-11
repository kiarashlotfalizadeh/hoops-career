// Visual tour: every screen and tab of the real league on a phone and a tablet, at several
// points of a season. For design review, not assertions; page errors are collected and printed.
// Usage: node scripts/qa/tour.mjs <devServerUrl> <outDir> [stages=pre,mid,post,draft,fa]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const out = process.argv[3] ?? 'tour';
const stages = (process.argv[4] ?? 'pre,mid,post,draft,resign,fa').split(',');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const phone = await ctx.newPage();
const tablet = await ctx.newPage();
await tablet.setViewportSize({ width: 820, height: 1180 });
const errors = [];
for (const [n, pg] of [['phone', phone], ['tablet', tablet]]) {
  pg.on('pageerror', (e) => errors.push(`${n}: ${e}`));
  pg.on('console', (m) => { if (m.type() === 'error') errors.push(`${n}: ${m.text()}`); });
}
const t0 = Date.now();
const log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
const waitSim = async (pg) => { await pg.waitForTimeout(300); await pg.waitForSelector('.simbar', { state: 'detached', timeout: 600000 }).catch(() => {}); await pg.waitForTimeout(300); };
const phase = async () => `${await phone.locator('.topbar').first().getAttribute('data-phase')} · ${(await phone.locator('.topbar .sub').first().textContent())?.trim()}`;
const play = async (label) => {
  await phone.getByRole('button', { name: 'Play', exact: true }).click();
  await phone.waitForTimeout(300);
  const b = phone.locator('.sheet').getByRole('button', { name: new RegExp('^' + label) }).first();
  if (!(await b.count()) || (await b.isDisabled())) { await phone.keyboard.press('Escape'); await phone.locator('.sheet-backdrop').click({ position: { x: 5, y: 5 } }).catch(() => {}); return false; }
  await b.click();
  await waitSim(phone);
  log(`${label} → ${await phase()}`);
  return true;
};
const league = () => phone.evaluate(() => {
  const l = window.__hc.store.getState().league;
  const mine = Object.values(l.players).filter((p) => p.tid === l.userTid).sort((a, b) => b.ovr - a.ovr);
  const g = [...l.games].reverse().find((x) => x.home.tid === l.userTid || x.away.tid === l.userTid);
  return { star: mine[0]?.pid, rookie: Object.values(l.players).find((p) => p.tid === l.userTid && p.draft?.year === l.season)?.pid, gid: g?.gid, other: (l.userTid + 7) % 30, phase: l.phase };
});
const save = () => phone.evaluate(() => window.__hc.store.getState().save());

async function snap(pg, dir, name, route) {
  await pg.goto(`${base}/#${route}`);
  await pg.waitForTimeout(700);
  await pg.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  // every tab of the screen's first tab bar
  const tabs = pg.locator('main [role=tablist], .page [role=tablist], [role=tablist]').first().locator('[role=tab]');
  const n = Math.min(await tabs.count(), 9);
  for (let i = 1; i < n; i++) {
    const t = tabs.nth(i);
    const label = ((await t.textContent()) ?? `t${i}`).trim().replace(/[^a-z0-9]+/gi, '_').slice(0, 20);
    await t.click().catch(() => {});
    await pg.waitForTimeout(500);
    await pg.screenshot({ path: `${dir}/${name}-${label}.png`, fullPage: true });
  }
}

async function tour(stage) {
  await save();
  const ids = await league();
  const routes = [
    ['home', '/'], ['roster', '/roster'], ['player', `/player/${ids.star}`], ['rotation', '/rotation'], ['tactics', '/tactics'],
    ['lab', '/lab'], ['league', '/league'], ['team', `/team/${ids.other}`], ['office', '/office'], ['trade', '/trade'],
    ['fa', '/free-agents'], ['resign', '/resign'], ['draft', '/draft'], ['finances', '/finances'], ['inbox', '/inbox'],
    ['settings', '/settings'], ['history', '/history'],
  ];
  if (ids.gid) routes.push(['game', `/game/${ids.gid}`]);
  if (ids.rookie) routes.push(['rookie', `/player/${ids.rookie}`]);
  for (const [dev, pg] of [['phone', phone], ['tablet', tablet]]) {
    const dir = `${out}/${stage}/${dev}`;
    mkdirSync(dir, { recursive: true });
    if (dev === 'tablet') { await tablet.goto(`${base}/#/`); await tablet.reload(); await tablet.waitForTimeout(1500); }
    for (const [name, route] of routes) await snap(pg, dir, name, route).catch((e) => log(`  ${dev} ${name}: ${e.message.split('\n')[0]}`));
  }
  await phone.goto(`${base}/#/`);
  await phone.waitForTimeout(500);
  log(`toured ${stage} (${ids.phase})`);
}

await phone.goto(`${base}/#/start`);
await phone.waitForTimeout(800);
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

if (stages.includes('pre')) await tour('pre');
await play('Start regular season');
if (stages.includes('mid')) {
  await play('Sim to next game');
  // a live game for the game view and live screens
  await phone.getByRole('button', { name: 'Play', exact: true }).click();
  await phone.waitForTimeout(300);
  const live = phone.locator('.sheet').getByRole('button', { name: /^Watch & coach live/ }).first();
  if (await live.count()) {
    await live.click();
    await phone.waitForTimeout(4000);
    mkdirSync(`${out}/live`, { recursive: true });
    await phone.screenshot({ path: `${out}/live/phone-live.png` });
    for (const name of ['Box', 'Tactics', 'Subs', 'Plays', 'Coach']) {
      const b = phone.getByRole('tab', { name: new RegExp(name, 'i') }).first();
      if (await b.count()) { await b.click().catch(() => {}); await phone.waitForTimeout(400); await phone.screenshot({ path: `${out}/live/phone-live-${name}.png`, fullPage: true }); }
    }
    await phone.getByRole('button', { name: 'End' }).click().catch(() => {});
    await phone.waitForTimeout(2500);
    await phone.screenshot({ path: `${out}/live/phone-final.png`, fullPage: true });
  } else await phone.keyboard.press('Escape');
  await phone.goto(`${base}/#/`);
  await play('Sim to trade deadline');
  await tour('mid');
}
for (let i = 0; i < 25 && /Regular Season/.test((await phase()) ?? ''); i++) await play('Sim to end of regular season');
for (let i = 0; i < 4 && /Play-in|Playoffs/i.test((await phase()) ?? ''); i++) await play('Sim (through play-in|to end of playoffs)');
if (stages.includes('post')) await tour('post');
for (let i = 0; i < 4 && !/NBA Draft/.test((await phase()) ?? ''); i++) if (!(await play('(Go to the draft)'))) break;
if (stages.includes('draft')) await tour('draft');
for (let i = 0; i < 3 && /NBA Draft/.test((await phase()) ?? ''); i++) if (!(await play('Auto-draft the rest'))) break;
if (stages.includes('resign')) await tour('resign');
for (let i = 0; i < 3 && !/Free Agency/i.test((await phase()) ?? ''); i++) if (!(await play('Open free agency'))) break;
if (stages.includes('fa')) await tour('fa');
console.log(`errors: ${errors.length}`);
for (const e of [...new Set(errors)].slice(0, 30)) console.log('  ' + e.slice(0, 300));
await browser.close();
