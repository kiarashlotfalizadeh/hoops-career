// Star check: plays the real league for N seasons in several leagues at once (one per rng seed, each
// in its own process, the user's team auto-managed as in season-test) and watches what fans
// screenshot as broken: the scoring leaders with their usage, the night's biggest scoring games, the
// best record and the longest winning streak, how the best players age, and in the first season how
// the real league's top scorers' lines hold up. Fails (exit 1) when any league has a season whose
// scoring leader averages more than MAX_PPG or a game over MAX_GAME_PTS, or when more seasons than
// BEST_RECORD_ALLOWANCE allows end with a record better than MAX_WINS.
// Usage: npx tsx scripts/star-check.ts [seasons] [rngSeed[:TEAM],...]   (env QUIET=1: leaders only,
//   TEAM=<abbrev>: the user's team where a league names none, Orlando by default; DIFFICULTY=easy|normal|hard)
import { readFileSync } from 'node:fs';
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createLeague, defaultSettings, type SeedData } from '../src/core/league/create';
import { startRegularSeason, simDay, startDraft, finishDraftPhase, startFreeAgency, newSeason, autoDraftUserPick } from '../src/core/league/season';
import { playerName, standardRoster, freeAgents } from '../src/core/league/helpers';
import { CAP, TARGETS } from '../src/core/constants';
import { standings } from '../src/core/league/standings';
import { nextPick } from '../src/core/league/draft';
import { expiringPlayers, userOffer, userResign } from '../src/core/league/freeAgency';
import { askingContract, releasePlayer } from '../src/core/league/contracts';
import { takeJob } from '../src/core/league/jobs';
import { aiMatchVerdict, restrictedFreeAgents, sheetDecisionBlocked, userDecideSheet } from '../src/core/league/rfa';
import { playerAge } from '../src/core/playerGen';
import { FRANCHISES } from '../src/core/teams';
import type { League, Player } from '../src/core/types';

/** No one has averaged more than 38.4 over a full season since 1963: a leader past 39 is the engine running away. */
const MAX_PPG = 39;
/**
 * Only Chamberlain (several times) and Kobe Bryant's 81 have topped Dončić's 73: a 74-point night is
 * a once-in-a-generation game, and one in a check's few dozen seasons is the engine running away.
 */
const MAX_GAME_PTS = 73;
/** The best record ever is 73-9 (Golden State, 2015-16): a 74-win season is a record the engine shouldn't be breaking. */
const MAX_WINS = 73;
/**
 * Seasons per one that may still end with a record over MAX_WINS. The NBA has seen 70 wins three
 * times in 78 seasons, so a sim league that is right at the top should almost never get there; one
 * in twenty leaves room for a stacked roster and a lucky year, while an engine whose best team runs
 * 77-5 as a matter of course fails in every league.
 */
const BEST_RECORD_ALLOWANCE = 20;
/**
 * The leagues CI plays: four different runs from the same opening night, one of them with the user
 * running the Thunder, the opening night's best team (a user keeps his core together, as AI front
 * offices over the tax don't: that league is where 77-5 seasons came from).
 */
const DEFAULT_SEEDS = ['42', '7', '2026', '1234:OKC'];
const DEFAULT_SEASONS = 8;

/** What a league reports back for each season. */
interface SeasonReport {
  season: number;
  leader: { name: string; ppg: number };
  game: { name: string; pts: number };
  best: { team: string; won: number; lost: number };
  streak: { team: string; games: number };
}

const quiet = !!process.env.QUIET;
const seasons = Number(process.argv[2] ?? DEFAULT_SEASONS);
const seeds = process.argv[3] ? process.argv[3].split(',') : DEFAULT_SEEDS;
if (!Number.isInteger(seasons) || seasons < 1 || seeds.some((s) => !Number.isFinite(Number(s.split(':')[0])))) throw new Error('Usage: star-check [seasons] [rngSeed[:TEAM],...]');

/** Every league in its own process, as many at once as there are cores; their output is printed a league at a time. */
async function playLeagues() {
  const t0 = performance.now();
  const self = fileURLToPath(import.meta.url);
  const all: (SeasonReport & { seed: string })[] = [];
  let next = 0;
  const run = async (): Promise<void> => {
    while (next < seeds.length) {
      const seed = seeds[next++];
      const child = fork(self, [String(seasons), seed], { stdio: ['ignore', 'pipe', 'inherit', 'ipc'] });
      let out = '';
      child.stdout!.on('data', (d) => (out += d));
      const reports = await new Promise<SeasonReport[]>((resolve, reject) => {
        let got: SeasonReport[] | null = null;
        child.on('message', (m) => (got = m as SeasonReport[]));
        child.on('exit', (code) => (got ? resolve(got) : reject(new Error(`League ${seed} stopped (exit ${code}):\n${out}`))));
      });
      console.log(`\n--- rng seed ${seed}\n${out.trimEnd()}`);
      all.push(...reports.map((r) => ({ seed, ...r })));
    }
  };
  await Promise.all(Array.from({ length: Math.min(seeds.length, Math.max(1, availableParallelism())) }, run));
  console.log(`\n${seeds.length} leagues of ${seasons} seasons in ${((performance.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(verdict(all) ? 0 : 1);
}

/** The thresholds over every season played; prints the summary and returns whether they all hold. */
function verdict(all: (SeasonReport & { seed: string })[]): boolean {
  const at = (r: SeasonReport & { seed: string }) => `${r.season} (rng ${r.seed})`;
  const failures: string[] = [];
  for (const r of all) {
    if (r.leader.ppg > MAX_PPG) failures.push(`${at(r)}: ${r.leader.name} led the league with ${r.leader.ppg.toFixed(1)} PPG (max ${MAX_PPG})`);
    if (r.game.pts > MAX_GAME_PTS) failures.push(`${at(r)}: ${r.game.name} scored ${r.game.pts} in a game (max ${MAX_GAME_PTS})`);
  }
  const over = all.filter((r) => r.best.won > MAX_WINS);
  const allowed = Math.floor(all.length / BEST_RECORD_ALLOWANCE);
  if (over.length > allowed)
    failures.push(
      `${over.length} of ${all.length} seasons had a team over ${MAX_WINS} wins (${allowed} allowed): ${over.map((r) => `${at(r)} ${r.best.team} ${r.best.won}-${r.best.lost}`).join(', ')}`,
    );
  const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
  const wins = sorted(all.map((r) => r.best.won));
  const streaks = sorted(all.map((r) => r.streak.games));
  const mid = (xs: number[]) => xs[Math.floor(xs.length / 2)];
  console.log(
    `Over ${all.length} seasons: scoring leader max ${Math.max(...all.map((r) => r.leader.ppg)).toFixed(1)} PPG, game high max ${Math.max(...all.map((r) => r.game.pts))}; best record median ${mid(wins)} wins (max ${wins[wins.length - 1]}), ${over.length} over ${MAX_WINS}; longest streak median ${mid(streaks)} (max ${streaks[streaks.length - 1]})`,
  );
  if (failures.length) {
    console.error(`FAIL: ${failures.join('; ')}`);
    return false;
  }
  console.log(`OK: no scoring leader above ${MAX_PPG} PPG, no game above ${MAX_GAME_PTS} points, at most ${allowed} season(s) above ${MAX_WINS} wins`);
  return true;
}

/** His regular season: per-game line and his share of his team's possessions while he was on the floor. */
function line(p: Player, season: number) {
  const rows = p.stats.filter((s) => s.season === season && !s.playoffs);
  const sum = (k: 'gp' | 'pts' | 'min' | 'fga' | 'fta' | 'tov' | 'teamFga' | 'teamFta' | 'teamTov') => rows.reduce((a, s) => a + s[k], 0);
  const gp = sum('gp');
  const use = sum('teamFga') + 0.44 * sum('teamFta') + sum('teamTov');
  return { gp, ppg: sum('pts') / Math.max(1, gp), mpg: sum('min') / Math.max(1, gp), usg: use > 0 ? (sum('fga') + 0.44 * sum('fta') + sum('tov')) / use : 0 };
}
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

/** The season's regular-season games: the biggest scoring night, each team's longest winning streak, and the league's assists. */
function seasonGames(league: League, season: number) {
  const games = league.games.filter((g) => g.season === season && g.type === 'regular').sort((a, b) => a.day - b.day);
  let game = { name: '-', pts: 0 };
  const run = new Map<number, number>();
  let streak = { tid: -1, games: 0 };
  let ast = 0;
  for (const g of games) {
    for (const side of [g.home, g.away]) {
      ast += side.t.ast;
      for (const b of side.players) if (b.pts > game.pts) game = { name: b.name, pts: b.pts };
      const won = side.pts > (side === g.home ? g.away : g.home).pts;
      const n = won ? (run.get(side.tid) ?? 0) + 1 : 0;
      run.set(side.tid, n);
      if (n > streak.games) streak = { tid: side.tid, games: n };
    }
  }
  return { game, streak, astPerGame: ast / Math.max(1, 2 * games.length) };
}

/** One league, start to finish: prints its seasons and returns what the thresholds look at. */
function playLeague(spec: string): SeasonReport[] {
  const [rngSeed, team = process.env.TEAM] = [Number(spec.split(':')[0]), spec.split(':')[1]];
  const seed: SeedData = JSON.parse(readFileSync('src/data/seed.json', 'utf8'));
  const t0 = performance.now();
  const userTid = team ? FRANCHISES.findIndex((f) => f.abbrev === team.toUpperCase()) : 19;
  if (userTid < 0) throw new Error(`${team} is no team in the seed`);
  const settings = { ...defaultSettings(), ...(process.env.DIFFICULTY && { difficulty: process.env.DIFFICULTY as League['settings']['difficulty'] }) };
  const league = createLeague({ name: 'Stars', userTid, coachName: 'Check', settings, seed, rngSeed });
  league.id = `star_check_${rngSeed}`;

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

  const reports: SeasonReport[] = [];
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
    const { game, streak, astPerGame } = seasonGames(league, season);
    const table = [...standings(league)].sort((a, b) => b.won - a.won);
    const abbrev = (tid: number) => league.teams[tid]?.abbrev ?? '-';
    const best = { team: abbrev(table[0].tid), won: table[0].won, lost: table[0].lost };
    reports.push({ season, leader: { name: lead ? playerName(lead.p) : '-', ppg: lead?.ppg ?? 0 }, game, best, streak: { team: abbrev(streak.tid), games: streak.games } });
    console.log(
      `${season}: ${rows
        .slice(0, quiet ? 3 : 5)
        .map((x) => `${playerName(x.p)} ${x.ppg.toFixed(1)} (${x.age}, ${x.p.ovr}, usg ${pct(x.usg)})`)
        .join(', ')} · ${over30} at 30+ · high ${game.name} ${game.pts} · best ${table
        .slice(0, 3)
        .map((r) => `${abbrev(r.tid)} ${r.won}-${r.lost}`)
        .join(', ')} · streak ${abbrev(streak.tid)} ${streak.games}`,
    );
    if (!quiet) {
      const best5 = Object.values(league.players)
        .filter((p) => p.tid >= 0)
        .sort((a, b) => b.ovr - a.ovr)
        .slice(0, 5);
      // the oldest regulars' minutes: real 34-and-up stars play about 30-32
      const vets = rows
        .filter((x) => x.age >= 34 && x.mpg >= 20)
        .sort((a, b) => b.mpg - a.mpg)
        .slice(0, 4);
      // the best team: its net rating per 100 and the players it was built on
      const top = league.teams[table[0].tid];
      const ts = top.seasons.find((x) => x.season === season)!;
      const core = Object.values(league.players)
        .filter((p) => p.tid === top.tid)
        .sort((a, b) => b.ovr - a.ovr)
        .slice(0, 4);
      console.log(
        `  ${top.abbrev}: net ${((100 * (ts.ptsFor - ts.ptsAgainst)) / Math.max(1, (ts.poss + ts.oppPoss) / 2)).toFixed(1)}, ${core.map((p) => `${playerName(p)} ${p.ovr}`).join(', ')}`,
      );
      console.log(
        `  top OVR: ${best5.map((p) => `${playerName(p)} ${p.ovr} (${playerAge(p, season)})`).join(', ')} · team AST ${astPerGame.toFixed(1)} (${TARGETS.ast}) · 34+ MPG: ${
          vets.map((x) => `${playerName(x.p)} ${x.mpg.toFixed(1)} (${x.age})`).join(', ') || 'none'
        }`,
      );
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
  console.log(`${seasons} seasons in ${((performance.now() - t0) / 1000).toFixed(0)}s`);
  return reports;
}

if (seeds.length === 1) {
  const reports = playLeague(seeds[0]);
  // (a league run by playLeagues hands its seasons back; on its own it judges them itself)
  if (process.send) process.send(reports);
  else process.exit(verdict(reports.map((r) => ({ seed: seeds[0], ...r }))) ? 0 : 1);
} else {
  void playLeagues();
}
