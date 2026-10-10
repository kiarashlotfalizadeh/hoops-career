// Multi-season integration test: create a league and play N full seasons end to end.
// Usage: npx tsx scripts/season-test.ts [seasons] [--seed path/to/seed.json]
import { readFileSync, existsSync } from 'node:fs';
import { createLeague, defaultSettings, type SeedData } from '../src/core/league/create';
import { startRegularSeason, simDay, startDraft, finishDraftPhase, startFreeAgency, newSeason, autoDraftUserPick } from '../src/core/league/season';
import { teamPlayers, payroll, curTeamSeason, playerName, CAP_FOR } from '../src/core/league/helpers';
import { standings } from '../src/core/league/standings';
import { nextPick } from '../src/core/league/draft';
import { expiringPlayers, userResign } from '../src/core/league/freeAgency';
import { askingContract } from '../src/core/league/contracts';

const seasons = Number(process.argv[2] ?? 2);
const seedIdx = process.argv.indexOf('--seed');
const seedPath = seedIdx > 0 ? process.argv[seedIdx + 1] : 'src/data/seed.json';
const seed: SeedData | null = existsSync(seedPath) ? JSON.parse(readFileSync(seedPath, 'utf8')) : null;
console.log(seed ? `Using seed ${seedPath} (${seed.players.length} players)` : 'Fictional league');
const t0 = performance.now();
const league = createLeague({ name: 'Test', userTid: 19, coachName: 'Test Coach', settings: defaultSettings(), seed, rngSeed: 42 });
console.log(`created in ${(performance.now() - t0).toFixed(0)}ms; players ${Object.keys(league.players).length}`);

for (let s = 0; s < seasons; s++) {
  const errs = startRegularSeason(league);
  if (errs.length) {
    console.log('cannot start:', errs);
    // auto-fix user roster for the test
    const roster = teamPlayers(league, league.userTid).sort((a, b) => a.ovr - b.ovr);
    while (teamPlayers(league, league.userTid).length > 15) {
      const p = roster.shift()!;
      p.tid = -1;
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
  const best = [...st].sort((a, b) => b.pct - a.pct).slice(0, 4).map((r) => `${league.teams[r.tid].abbrev} ${r.won}-${r.lost}`);
  const worst = [...st].sort((a, b) => a.pct - b.pct).slice(0, 3).map((r) => `${league.teams[r.tid].abbrev} ${r.won}-${r.lost}`);
  console.log('Best:', best.join(', '), '| Worst:', worst.join(', '));
  console.log(`Champion: ${league.teams[aw.champion!].abbrev}; Finals MVP ${nm(aw.finalsMvp)}; MVP ${nm(aw.mvp)}; DPOY ${nm(aw.dpoy)}; ROY ${nm(aw.roy)}`);
  // league scoring leaders
  const ps = Object.values(league.players).map((p) => ({ p, s: p.stats.find((x) => x.season === league.season && !x.playoffs) })).filter((x) => x.s && x.s.gp >= 50);
  const lead = (f: (s: NonNullable<(typeof ps)[0]['s']>) => number, label: string) => {
    const top = [...ps].sort((a, b) => f(b.s!) - f(a.s!)).slice(0, 3);
    console.log(`${label}: ${top.map((x) => `${playerName(x.p)} ${f(x.s!).toFixed(1)}`).join(', ')}`);
  };
  lead((s) => s.pts / s.gp, 'PPG');
  lead((s) => (s.orb + s.drb) / s.gp, 'RPG');
  lead((s) => s.ast / s.gp, 'APG');
  lead((s) => s.min / s.gp, 'MPG');
  const user = curTeamSeason(league, league.userTid);
  console.log(`User team ${league.teams[league.userTid].abbrev}: ${user.won}-${user.lost}, playoffRound ${user.playoffRound}, revenue ${(user.revenue / 1000).toFixed(0)}M, expenses ${(user.expenses / 1000).toFixed(0)}M, payroll ${(payroll(league, league.userTid) / 1000).toFixed(0)}M`);
  const injured = Object.values(league.players).filter((p) => p.injuryCount > 0).length;
  console.log(`Players injured at least once (cumulative): ${injured}; news items ${league.news.length}; games stored ${league.games.length}`);

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
  newSeason(league);
  const sizes = league.teams.map((t) => teamPlayers(league, t.tid).length);
  const pays = league.teams.map((t) => payroll(league, t.tid) / 1000);
  console.log(`New season ${league.season}: roster sizes ${Math.min(...sizes)}-${Math.max(...sizes)}, payroll ${Math.min(...pays).toFixed(0)}-${Math.max(...pays).toFixed(0)}M (cap ${(CAP_FOR(league).salaryCap / 1000).toFixed(0)}M); players ${Object.keys(league.players).length}; FAs ${Object.values(league.players).filter((p) => p.tid === -1).length}`);
  const json = JSON.stringify(league);
  console.log(`League JSON size: ${(json.length / 1e6).toFixed(2)} MB`);
}
console.log(`\nTotal ${(performance.now() - t0) / 1000}s`);
