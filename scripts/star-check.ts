// Star check: plays the real league for N seasons (12 by default, the user's team auto-managed as in
// season-test) and watches the top of the league: the scoring leaders with their usage, how the
// best players age, and in the first season how the real league's top scorers' lines hold up. Fails
// (exit 1) if any season's scoring leader averages more than MAX_PPG.
// Usage: npx tsx scripts/star-check.ts [seasons] [rngSeed]   (env QUIET=1: leaders only)
import { readFileSync } from 'node:fs';
import { createLeague, defaultSettings, type SeedData } from '../src/core/league/create';
import { startRegularSeason, simDay, startDraft, finishDraftPhase, startFreeAgency, newSeason, autoDraftUserPick } from '../src/core/league/season';
import { playerName, standardRoster, freeAgents } from '../src/core/league/helpers';
import { CAP } from '../src/core/constants';
import { standings } from '../src/core/league/standings';
import { nextPick } from '../src/core/league/draft';
import { expiringPlayers, userOffer, userResign } from '../src/core/league/freeAgency';
import { askingContract, releasePlayer } from '../src/core/league/contracts';
import { takeJob } from '../src/core/league/jobs';
import { aiMatchVerdict, restrictedFreeAgents, sheetDecisionBlocked, userDecideSheet } from '../src/core/league/rfa';
import { playerAge } from '../src/core/playerGen';
import type { Player } from '../src/core/types';

/** No one has averaged more than 38.4 over a full season since 1963: a leader past 39 is the engine running away. */
const MAX_PPG = 39;

const [seasons, rngSeed] = [12, 42].map((d, i) => Number(process.argv[i + 2] ?? d));
const quiet = !!process.env.QUIET;
const seed: SeedData = JSON.parse(readFileSync('src/data/seed.json', 'utf8'));
const t0 = performance.now();
const league = createLeague({ name: 'Stars', userTid: 19, coachName: 'Check', settings: defaultSettings(), seed, rngSeed });
league.id = `star_check_${rngSeed}`;

/** His regular season: per-game line and his share of his team's possessions while he was on the floor. */
function line(p: Player, season: number) {
  const rows = p.stats.filter((s) => s.season === season && !s.playoffs);
  const sum = (k: 'gp' | 'pts' | 'min' | 'fga' | 'fta' | 'tov' | 'teamFga' | 'teamFta' | 'teamTov') => rows.reduce((a, s) => a + s[k], 0);
  const gp = sum('gp');
  const use = sum('teamFga') + 0.44 * sum('teamFta') + sum('teamTov');
  return { gp, ppg: sum('pts') / Math.max(1, gp), mpg: sum('min') / Math.max(1, gp), usg: use > 0 ? (sum('fga') + 0.44 * sum('fta') + sum('tov')) / use : 0 };
}
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

// the real league's top 20 scorers of 2025-26 (40+ games), measured in the first simulated season
const realSeason = league.season - 1;
const realTop = Object.values(league.players)
  // (real lines carry no on-floor team totals: their usage is Basketball Reference's)
  .map((p) => ({ p, r: { ...line(p, realSeason), usg: (p.stats.find((s) => s.real && s.season === realSeason && s.adv)?.adv?.usg ?? 0) / 100 } }))
  .filter((x) => x.r.gp >= 40)
  .sort((a, b) => b.r.ppg - a.r.ppg)
  .slice(0, 20);

const startTop = Object.values(league.players)
  .filter((p) => p.tid >= 0)
  .sort((a, b) => b.ovr - a.ovr)
  .slice(0, 10);

const failures: string[] = [];
for (let s = 0; s < seasons; s++) {
  if (startRegularSeason(league).length) {
    // auto-manage the user roster: cut extras, sign minimum deals to reach the minimum
    const roster = standardRoster(league, league.userTid).sort((a, b) => a.ovr - b.ovr);
    while (standardRoster(league, league.userTid).length > CAP.rosterMax) releasePlayer(league, roster.shift()!, { news: false });
    for (const p of freeAgents(league).sort((a, b) => b.ovr - a.ovr)) {
      if (standardRoster(league, league.userTid).length >= CAP.rosterMin) break;
      userOffer(league, p.pid, askingContract(league, p, league.userTid).amount, 1);
    }
    const errs = startRegularSeason(league);
    if (errs.length) throw new Error(errs.join('; '));
  }
  let guard = 0;
  while ((league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs') && guard++ < 600) simDay(league);
  const season = league.season;
  const rows = Object.values(league.players)
    .map((p) => ({ p, ...line(p, season), age: playerAge(p, season) }))
    .filter((x) => x.gp >= 50)
    .sort((a, b) => b.ppg - a.ppg);
  const lead = rows[0];
  const over30 = rows.filter((x) => x.ppg >= 30).length;
  console.log(
    `${season}: ${rows
      .slice(0, quiet ? 3 : 5)
      .map((x) => `${playerName(x.p)} ${x.ppg.toFixed(1)} (${x.age}, ${x.p.ovr}, usg ${pct(x.usg)})`)
      .join(', ')} · ${over30} at 30+`,
  );
  if (lead && lead.ppg > MAX_PPG) failures.push(`${season}: ${playerName(lead.p)} led the league with ${lead.ppg.toFixed(1)} PPG (max ${MAX_PPG})`);
  if (!quiet) {
    const best = Object.values(league.players)
      .filter((p) => p.tid >= 0)
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 5);
    console.log(`  top OVR: ${best.map((p) => `${playerName(p)} ${p.ovr} (${playerAge(p, season)})`).join(', ')}`);
  }
  if (s === 0) {
    const miss = realTop.map((x) => ({ ...x, sim: line(x.p, season) })).filter((x) => x.sim.gp >= 20);
    const mae = miss.reduce((a, x) => a + Math.abs(x.sim.ppg - x.r.ppg), 0) / Math.max(1, miss.length);
    const off = miss.filter((x) => Math.abs(x.sim.ppg - x.r.ppg) > 3);
    console.log(
      `  real top-20 scorers (sim vs 2025-26, ${miss.length} with 20+ games): MAE ${mae.toFixed(1)}, ${off.length} more than 3 off${
        quiet ? '' : `\n    ${miss.map((x) => `${playerName(x.p)} ${x.sim.ppg.toFixed(1)} (${x.r.ppg.toFixed(1)}) usg ${pct(x.sim.usg)} (${pct(x.r.usg)})`).join('\n    ')}`
      }`,
    );
  }
  if (s === seasons - 1) break;
  if (league.fired) takeJob(league, league.jobOffers?.offers[0]?.tid ?? standings(league).find((r) => r.tid !== league.userTid)!.tid);
  startDraft(league);
  let picks = 0;
  while (nextPick(league) && picks++ < 100) autoDraftUserPick(league);
  finishDraftPhase(league);
  for (const p of expiringPlayers(league, league.userTid)) {
    const ask = askingContract(league, p, league.userTid);
    if (p.ovr >= 72) userResign(league, p.pid, ask.amount, ask.years);
  }
  startFreeAgency(league);
  for (let k = 0; k < 5 && !newSeason(league); k++)
    for (const p of restrictedFreeAgents(league, league.userTid).filter((x) => x.rfa!.sheet))
      userDecideSheet(league, p.pid, aiMatchVerdict(league, p).match && !sheetDecisionBlocked(league, p.pid, true));
  if (league.phase !== 'preseason') throw new Error(`The new season didn't start (phase ${league.phase})`);
}
if (!quiet) {
  // how the opening night's best aged: OVR each summer, by age
  console.log('\nOpening night top 10 by OVR, each summer:');
  for (const p of startTop) {
    const arc = p.ratingsHistory.filter((h) => h.season >= league.season - seasons + 1).map((h) => `${playerAge(p, h.season)}:${h.ovr}`);
    console.log(`  ${playerName(p).padEnd(24)} ${arc.join(' ')}${p.tid === -3 ? ' (retired)' : ''}`);
  }
}
console.log(`\n${seasons} seasons in ${((performance.now() - t0) / 1000).toFixed(0)}s`);
if (failures.length) {
  console.error(`FAIL: ${failures.join('; ')}`);
  process.exit(1);
}
console.log(`OK: no scoring leader above ${MAX_PPG} PPG`);
