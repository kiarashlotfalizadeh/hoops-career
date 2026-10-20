// Multi-season integration test: create a league and play N full seasons end to end.
// Usage: npx tsx scripts/season-test.ts [seasons] [--seed path/to/seed.json]
import { readFileSync, existsSync } from 'node:fs';
import { createLeague, defaultSettings, type SeedData } from '../src/core/league/create';
import { startRegularSeason, simDay, startDraft, finishDraftPhase, startFreeAgency, newSeason, autoDraftUserPick } from '../src/core/league/season';
import { teamPlayers, payroll, curTeamSeason, playerName, CAP_FOR, standardRoster, freeAgents } from '../src/core/league/helpers';
import { CAP } from '../src/core/constants';
import { standings } from '../src/core/league/standings';
import { nextPick } from '../src/core/league/draft';
import { expiringPlayers, userOffer, userResign } from '../src/core/league/freeAgency';
import { askingContract, releasePlayer } from '../src/core/league/contracts';
import { takeJob } from '../src/core/league/jobs';
import { aiMatchVerdict, restrictedFreeAgents, sheetDecisionBlocked, userDecideSheet } from '../src/core/league/rfa';
import { ovrRaw } from '../src/core/ratings';

const seedIdx = process.argv.indexOf('--seed');
const seedPath = seedIdx > 0 ? process.argv[seedIdx + 1] : 'src/data/seed.json';
// the season count is whichever argument isn't the seed option, so `--seed x` alone still plays the default
const countArg = process.argv.slice(2).find((a, i, args) => a !== '--seed' && args[i - 1] !== '--seed');
const seasons = Number(countArg ?? 2);
if (!Number.isInteger(seasons) || seasons < 1) throw new Error(`Usage: season-test [seasons] [--seed path/to/seed.json] (got "${countArg}" seasons)`);
// a seed asked for by name must exist; without --seed, a missing default seed means a fictional league
if (seedIdx > 0 && !existsSync(seedPath)) throw new Error(`No seed at ${seedPath}`);
const seed: SeedData | null = existsSync(seedPath) ? JSON.parse(readFileSync(seedPath, 'utf8')) : null;
console.log(seed ? `Using seed ${seedPath} (${seed.players.length} players)` : 'Fictional league');
const t0 = performance.now();
const league = createLeague({ name: 'Test', userTid: 19, coachName: 'Test Coach', settings: defaultSettings(), seed, rngSeed: 42 });
// a fixed id: the lottery draws ties from it, so every run is the same
league.id = 'season_test';
console.log(`created in ${(performance.now() - t0).toFixed(0)}ms; players ${Object.keys(league.players).length}`);

for (let s = 0; s < seasons; s++) {
  const errs = startRegularSeason(league);
  if (errs.length) {
    console.log('cannot start:', errs);
    // auto-manage the user roster for the test: cut extras, sign minimum deals to reach 13
    const roster = standardRoster(league, league.userTid).sort((a, b) => a.ovr - b.ovr);
    while (standardRoster(league, league.userTid).length > CAP.rosterMax) releasePlayer(league, roster.shift()!, { news: false });
    for (const p of freeAgents(league).sort((a, b) => b.ovr - a.ovr)) {
      if (standardRoster(league, league.userTid).length >= CAP.rosterMin) break;
      // over the cap only minimum deals go through; take the best player who'll sign one
      userOffer(league, p.pid, askingContract(league, p, league.userTid).amount, 1);
    }
    const e2 = startRegularSeason(league);
    if (e2.length) throw new Error(e2.join(';'));
  }
  const ts0 = performance.now();
  let guard = 0;
  while ((league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs') && guard++ < 600) simDay(league);
  const simMs = performance.now() - ts0;
  const st = standings(league).slice(0, 30);
  const aw = league.awards.find((a) => a.season === league.season)!;
  const nm = (pid?: number) => (pid !== undefined && league.players[pid] ? `${playerName(league.players[pid])} (${league.players[pid].ovr})` : '-');
  console.log(`\n=== Season ${league.season} simulated in ${(simMs / 1000).toFixed(1)}s, phase now ${league.phase}`);
  const best = [...st]
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4)
    .map((r) => `${league.teams[r.tid].abbrev} ${r.won}-${r.lost}`);
  const worst = [...st]
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3)
    .map((r) => `${league.teams[r.tid].abbrev} ${r.won}-${r.lost}`);
  console.log('Best:', best.join(', '), '| Worst:', worst.join(', '));
  console.log(`Champion: ${league.teams[aw.champion!].abbrev}; Finals MVP ${nm(aw.finalsMvp)}; MVP ${nm(aw.mvp)}; DPOY ${nm(aw.dpoy)}; ROY ${nm(aw.roy)}`);
  // league scoring leaders
  const ps = Object.values(league.players)
    .map((p) => ({ p, s: p.stats.find((x) => x.season === league.season && !x.playoffs) }))
    .filter((x) => x.s && x.s.gp >= 50);
  const lead = (f: (s: NonNullable<(typeof ps)[0]['s']>) => number, label: string) => {
    const top = [...ps].sort((a, b) => f(b.s!) - f(a.s!)).slice(0, 3);
    console.log(`${label}: ${top.map((x) => `${playerName(x.p)} ${f(x.s!).toFixed(1)}`).join(', ')}`);
  };
  lead((s) => s.pts / s.gp, 'PPG');
  lead((s) => (s.orb + s.drb) / s.gp, 'RPG');
  lead((s) => s.ast / s.gp, 'APG');
  lead((s) => s.min / s.gp, 'MPG');
  const user = curTeamSeason(league, league.userTid);
  console.log(
    `User team ${league.teams[league.userTid].abbrev}: ${user.won}-${user.lost}, playoffRound ${user.playoffRound}, revenue ${(user.revenue / 1000).toFixed(0)}M, expenses ${(user.expenses / 1000).toFixed(0)}M, payroll ${(payroll(league, league.userTid) / 1000).toFixed(0)}M`,
  );
  const profits = league.teams
    .map((t) => curTeamSeason(league, t.tid))
    .map((ts) => ts.revenue - ts.expenses)
    .sort((a, b) => a - b);
  console.log(
    `League money: median profit ${(profits[15] / 1000).toFixed(0)}M (range ${(profits[0] / 1000).toFixed(0)} to ${(profits[29] / 1000).toFixed(0)}M), cash ${(Math.min(...league.teams.map((t) => t.cash)) / 1000).toFixed(0)} to ${(Math.max(...league.teams.map((t) => t.cash)) / 1000).toFixed(0)}M`,
  );
  const injured = Object.values(league.players).filter((p) => p.injuryCount > 0).length;
  console.log(`Players injured at least once (cumulative): ${injured}; news items ${league.news.length}; games stored ${league.games.length}`);

  // a fired coach takes the best job on offer (or the worst team's) so the league can go on
  if (league.fired) {
    const to = league.jobOffers?.offers[0]?.tid ?? [...st].sort((a, b) => a.pct - b.pct).find((r) => r.tid !== league.userTid)!.tid;
    console.log(`Fired: takes over ${league.teams[to].abbrev}`);
    takeJob(league, to);
  }
  // offseason
  startDraft(league);
  let g2 = 0;
  while (nextPick(league) && g2++ < 100) autoDraftUserPick(league);
  finishDraftPhase(league);
  for (const p of expiringPlayers(league, league.userTid)) {
    const ask = askingContract(league, p, league.userTid);
    if (p.ovr >= 72) console.log('resign', playerName(p), userResign(league, p.pid, ask.amount, ask.years).reason);
  }
  startFreeAgency(league);
  // an offer sheet on one of the user's restricted free agents waits for his call: decide it as his staff would
  for (let k = 0; k < 5 && !newSeason(league); k++)
    for (const p of restrictedFreeAgents(league, league.userTid).filter((x) => x.rfa!.sheet))
      userDecideSheet(league, p.pid, aiMatchVerdict(league, p).match && !sheetDecisionBlocked(league, p.pid, true));
  if (league.phase !== 'preseason') throw new Error(`The new season didn't start (phase ${league.phase})`);
  const sizes = league.teams.map((t) => teamPlayers(league, t.tid).length);
  const pays = league.teams.map((t) => payroll(league, t.tid) / 1000);
  console.log(
    `New season ${league.season}: roster sizes ${Math.min(...sizes)}-${Math.max(...sizes)}, payroll ${Math.min(...pays).toFixed(0)}-${Math.max(...pays).toFixed(0)}M (cap ${(CAP_FOR(league).salaryCap / 1000).toFixed(0)}M); players ${Object.keys(league.players).length}; FAs ${Object.values(league.players).filter((p) => p.tid === -1).length}`,
  );
  const json = JSON.stringify(league);
  console.log(`League JSON size: ${(json.length / 1e6).toFixed(2)} MB`);
  // long-run health: rating distribution, raw skill level, economy, scoring
  const rostered = Object.values(league.players).filter((p) => p.tid >= 0);
  const ovrs = rostered.map((p) => p.ovr).sort((a, b) => b - a);
  const rawMean = rostered.reduce((a, p) => a + ovrRaw(p.ratings), 0) / rostered.length;
  const sal = rostered.map((p) => p.contract.salaries[Math.max(0, league.season - p.contract.start)] ?? 0).sort((a, b) => b - a);
  const games = league.games.filter((g) => g.season === league.season - 1 && g.type === 'regular');
  const ppg = games.reduce((a, g) => a + g.home.pts + g.away.pts, 0) / Math.max(1, games.length * 2);
  const capNow = CAP_FOR(league).salaryCap;
  const maxDeals = sal.filter((x) => x >= capNow * 0.25).length;
  const capX = league.teams.map((t) => ({ t: t.abbrev, x: payroll(league, t.tid) / capNow, user: t.tid === league.userTid })).sort((a, b) => b.x - a.x);
  console.log(
    `  payroll / cap: ${capX
      .slice(0, 5)
      .map((r) => `${r.t}${r.user ? '*' : ''} ${r.x.toFixed(2)}`)
      .join(', ')} … median ${capX[15].x.toFixed(2)}, min ${capX[29].x.toFixed(2)}`,
  );
  console.log(
    `  health: rostered ${rostered.length}, OVR mean ${(ovrs.reduce((a, b) => a + b, 0) / ovrs.length).toFixed(1)}, ≥90: ${ovrs.filter((o) => o >= 90).length}, ≥85: ${ovrs.filter((o) => o >= 85).length}, raw mean ${rawMean.toFixed(1)} | salaries ≥25% cap: ${maxDeals}, top-15 avg ${(sal.slice(0, 15).reduce((a, b) => a + b, 0) / 15 / 1000).toFixed(0)}M | last season ppg ${ppg.toFixed(1)} | retired ${Object.values(league.players).filter((p) => p.tid === -3).length}`,
  );
}
console.log(`\nTotal ${(performance.now() - t0) / 1000}s`);
