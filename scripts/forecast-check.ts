// Forecast check: plays real and fictional leagues from opening night (each in its own process, as
// many at once as there are cores, the user's team auto-managed as in star-check) and holds the
// season forecast (src/core/analysis/odds.ts: the projected wins and 10th-90th percentile band the
// owner's goals, Today's odds and the press's "projected for N wins" all read) to what the seasons
// then do. Fails (exit 1) when, over every season played in either kind of league, the actual wins
// per projected win (the slope) leave SLOPE, the top or the bottom fifth of the projections miss by
// more than TAIL_WINS on average, the band holds a share of the seasons outside BAND, or the
// seasons spread more or less than the forecast says they should (SPREAD); when the real league's
// first seasons leave a team systematically off its projection (BIAS_WINS for the league's spread
// of such misses, OFF_WINS for any one team beyond its noise); or when the default newcomer team
// (src/ui/newLeague.ts) meets its owner's opening goals in fewer than half of its first seasons, or
// opens over the tax or with a roster to cut. The thresholds sit between what the calibrated forecast
// does (October 2026, two runs of the default leagues) and what it did before (in brackets).
// Usage: npx tsx scripts/forecast-check.ts [seasons] [league,...]   (a league: an rng seed for the
//   real league, with the user's team after a colon (the default team when none), or f<rng seed> for
//   a fictional one; env QUIET=1: the summary only, DUMP=<file>: every team season as JSON lines,
//   JOBS=<n>: leagues at once, every core by default)
import { readFileSync, writeFileSync } from 'node:fs';
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createLeague, defaultSettings, type SeedData } from '../src/core/league/create';
import { startRegularSeason, simDay, startDraft, finishDraftPhase, startFreeAgency, newSeason, autoDraftUserPick } from '../src/core/league/season';
import { freeAgents, payroll, standardRoster } from '../src/core/league/helpers';
import { CAP } from '../src/core/constants';
import { standings } from '../src/core/league/standings';
import { nextPick } from '../src/core/league/draft';
import { expiringPlayers, userOffer, userResign } from '../src/core/league/freeAgency';
import { askingContract, releasePlayer } from '../src/core/league/contracts';
import { takeJob } from '../src/core/league/jobs';
import { aiMatchVerdict, restrictedFreeAgents, sheetDecisionBlocked, userDecideSheet } from '../src/core/league/rfa';
import { forecast } from '../src/core/analysis/odds';
import { leagueOutlook, planOwnerGoals, postseasonLevel } from '../src/core/league/ownerGoals';
import { defaultTeam, seedRanks, seedRosterSizes } from '../src/ui/newLeague';
import { FRANCHISES } from '../src/core/teams';

/** Actual wins per projected win, over every team season of a kind of league: 1 is a forecast whose spread is right (1.00-1.04; [1.29-1.33]). */
const SLOPE: [number, number] = [0.9, 1.15];
/** The most the top and the bottom fifth of the projections may miss by on average (wins): the tails a compressed forecast gets wrong (1.2 at most; [−4.4, +3.3]). */
const TAIL_WINS = 2.5;
/** The share of seasons inside the 10th-90th percentile band, 80% when the band is right (76-83%; [74-78%]). */
const BAND: [number, number] = [0.72, 0.9];
/**
 * The seasons' spread of wins over the spread the forecast says they should have (its projections'
 * spread and each band's width together): 1 when the forecast is as sure as it should be (1.00-1.05;
 * [1.21]).
 */
const SPREAD: [number, number] = [0.9, 1.12];
/**
 * The real league's first seasons, team by team over the leagues: the spread of their mean misses
 * beyond what the seasons' noise accounts for (wins), and the most any one team may miss by on
 * average beyond OFF_SE of its own noise (2.1-3.2 wins, the most off the Hawks at −6.6 ± 1.9; [5.7,
 * the Kings at −13.2 ± 1.5 and the Timberwolves at +10.4 ± 1.5]). The user's team runs on his
 * staff's calls and has its own check (the default team's), so these are the AI's teams.
 */
const BIAS_WINS = 4;
const OFF_WINS = 5;
const OFF_SE = 2.5;
/**
 * The share of its first seasons in which the default team must meet both its owner's opening goals
 * (the wins and the postseason): its median season meets them (the Wizards: 18 of 20; [1 of 10]).
 */
const DEFAULT_MET = 0.5;

/** The leagues CI plays: real leagues from the same opening night (the default team the user's), and fictional ones. */
const DEFAULT_LEAGUES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6'];
const DEFAULT_SEASONS = 2;

/** One team season: its opening-night projection, its owner's opening goals and what it did. */
interface Row {
  league: string;
  kind: 'real' | 'fictional';
  /** Season of the league (0: its first). */
  s: number;
  tid: number;
  team: string;
  user: boolean;
  w: number;
  lo: number;
  hi: number;
  won: number;
  /** The owner's opening wins target and postseason level (see POSTSEASON), and the level reached. */
  target: number | null;
  post: number;
  reached: number;
  /** Opening payroll and roster: the default team's other conditions. */
  payroll: number;
  roster: number;
}

const quiet = !!process.env.QUIET;
const seasons = Number(process.argv[2] ?? DEFAULT_SEASONS);
const leagues = process.argv[3] ? process.argv[3].split(',') : DEFAULT_LEAGUES;
if (!Number.isInteger(seasons) || seasons < 1 || leagues.some((l) => !Number.isFinite(Number(l.replace(/^f/, '').split(':')[0]))))
  throw new Error('Usage: forecast-check [seasons] [rngSeed[:TEAM] | f<rngSeed>,...]');

/** One league, start to finish: every team's opening projection and season, a season at a time. */
function playLeague(spec: string): { rows: Row[]; ms: number[] } {
  const fictional = spec.startsWith('f');
  const [rngSeed, team] = [Number(spec.replace(/^f/, '').split(':')[0]), spec.split(':')[1]];
  const seed: SeedData = JSON.parse(readFileSync('src/data/seed.json', 'utf8'));
  // (the New League screen's pick, a fictional league's too: see defaultTeam)
  const userTid = team ? FRANCHISES.findIndex((f) => f.abbrev === team.toUpperCase()) : (defaultTeam(seed, seedRanks(seed)) ?? 0);
  if (userTid < 0) throw new Error(`${team} is no team`);
  const league = createLeague({ name: 'Forecast', userTid, coachName: 'Check', settings: defaultSettings(), seed: fictional ? null : seed, rngSeed });
  league.id = `forecast_check_${spec}`;
  const rows: Row[] = [];
  const ms: number[] = [];
  for (let s = 0; s < seasons; s++) {
    if (startRegularSeason(league).length) {
      const roster = standardRoster(league, league.userTid).sort((a, b) => a.ovr - b.ovr);
      while (standardRoster(league, league.userTid).length > CAP.rosterMax) releasePlayer(league, roster.shift()!, { news: false });
      for (const p of freeAgents(league).sort((a, b) => b.ovr - a.ovr)) {
        if (standardRoster(league, league.userTid).length >= CAP.rosterMin) break;
        userOffer(league, p.pid, askingContract(league, p, league.userTid).amount, 1);
      }
      const errs = startRegularSeason(league);
      if (errs.length) throw new Error(errs.join('; '));
    }
    // opening night: the forecast as the screens read it, and every owner's goals from it
    const t0 = performance.now();
    const f = forecast(league)!;
    ms.push(performance.now() - t0);
    const outlook = leagueOutlook(league);
    const opening = league.teams.map((t) => {
      const og = planOwnerGoals(league, t.tid, outlook);
      return {
        target: og?.goals.find((g) => g.kind === 'wins')?.target ?? null,
        post: og?.goals.find((g) => g.kind === 'postseason')?.target ?? 0,
        payroll: payroll(league, t.tid),
        roster: standardRoster(league, t.tid).length,
      };
    });
    let guard = 0;
    while ((league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs') && guard++ < 600) simDay(league);
    for (const t of league.teams) {
      const ts = t.seasons.find((x) => x.season === league.season)!;
      const o = f.teams[t.tid];
      rows.push({
        league: spec,
        kind: fictional ? 'fictional' : 'real',
        s,
        tid: t.tid,
        team: t.abbrev,
        user: t.tid === league.userTid,
        w: o.w,
        lo: o.lo,
        hi: o.hi,
        won: ts.won,
        ...opening[t.tid],
        reached: postseasonLevel(ts),
      });
    }
    if (!quiet) {
      const me = rows[rows.length - league.teams.length + league.userTid];
      const off = rows.slice(-league.teams.length).filter((r) => Math.abs(r.won - r.w) >= 10);
      console.log(
        `${league.season}: ${me.team} (user) projected ${me.w.toFixed(1)} (${me.lo}-${me.hi}), won ${me.won}, owner asked ${me.target ?? '-'} and level ${me.post}, reached ${me.reached} · 10+ off: ${off.map((r) => `${r.team} ${r.w.toFixed(0)}->${r.won}`).join(', ') || 'none'}`,
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
  return { rows, ms };
}

/** Every league in its own process, as many at once as there are cores. */
async function playLeagues() {
  const t0 = performance.now();
  const self = fileURLToPath(import.meta.url);
  const rows: Row[] = [];
  const ms: number[] = [];
  let next = 0;
  const run = async (): Promise<void> => {
    while (next < leagues.length) {
      const spec = leagues[next++];
      const child = fork(self, [String(seasons), spec], { stdio: ['ignore', 'pipe', 'inherit', 'ipc'] });
      let out = '';
      child.stdout!.on('data', (d) => (out += d));
      const got = await new Promise<{ rows: Row[]; ms: number[] }>((resolve, reject) => {
        let msg: { rows: Row[]; ms: number[] } | null = null;
        child.on('message', (m) => (msg = m as { rows: Row[]; ms: number[] }));
        child.on('exit', (code) => (msg ? resolve(msg) : reject(new Error(`League ${spec} stopped (exit ${code}):\n${out}`))));
      });
      if (out.trim()) console.log(`--- league ${spec}\n${out.trimEnd()}`);
      rows.push(...got.rows);
      ms.push(...got.ms);
    }
  };
  await Promise.all(Array.from({ length: Math.min(leagues.length, Math.max(1, Number(process.env.JOBS) || availableParallelism())) }, run));
  console.log(`${leagues.length} leagues of ${seasons} seasons in ${((performance.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(verdict(rows, ms) ? 0 : 1);
}

const league30 = (rows: Row[]) => new Set(rows.map((r) => r.team)).size;
const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};
/** A band's standard deviation from its 10th-90th percentiles (a normal's are 2.563 SDs apart). */
const bandSd = (r: Row) => (r.hi - r.lo) / 2.563;

/** The calibration of one set of team seasons: slope, tails, band, spread. */
function calibration(rows: Row[]) {
  const w = rows.map((r) => r.w);
  const a = rows.map((r) => r.won);
  const mw = mean(w);
  const ma = mean(a);
  const slope =
    rows.reduce((s, r) => s + (r.w - mw) * (r.won - ma), 0) /
    Math.max(
      1e-9,
      rows.reduce((s, r) => s + (r.w - mw) ** 2, 0),
    );
  const sorted = [...rows].sort((x, y) => x.w - y.w);
  const fifth = Math.max(1, Math.floor(rows.length / 5));
  const miss = (rs: Row[]) => mean(rs.map((r) => r.won - r.w));
  const expected = Math.sqrt(sd(w) ** 2 + mean(rows.map((r) => bandSd(r) ** 2)));
  return {
    n: rows.length,
    slope,
    r: slope * (sd(w) / Math.max(1e-9, sd(a))),
    mae: mean(rows.map((r) => Math.abs(r.won - r.w))),
    bottom: miss(sorted.slice(0, fifth)),
    top: miss(sorted.slice(-fifth)),
    band: mean(rows.map((r) => (r.won >= r.lo && r.won <= r.hi ? 1 : 0))),
    below: mean(rows.map((r) => (r.won < r.lo ? 1 : 0))),
    spread: sd(a) / Math.max(1e-9, expected),
    projSd: sd(w),
    winSd: sd(a),
  };
}

/** The thresholds over every team season played; prints the summary and returns whether they all hold. */
function verdict(rows: Row[], ms: number[]): boolean {
  const failures: string[] = [];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  for (const kind of ['real', 'fictional'] as const) {
    const rs = rows.filter((r) => r.kind === kind);
    if (!rs.length) continue;
    const c = calibration(rs);
    console.log(
      `${kind}: ${c.n} team seasons · slope ${c.slope.toFixed(2)} (r ${c.r.toFixed(2)}, MAE ${c.mae.toFixed(1)}) · bottom fifth ${c.bottom >= 0 ? '+' : ''}${c.bottom.toFixed(1)}, top fifth ${c.top >= 0 ? '+' : ''}${c.top.toFixed(1)} · band ${pct(c.band)} (${pct(c.below)} under it) · spread ${c.spread.toFixed(2)} (projections ${c.projSd.toFixed(1)}, wins ${c.winSd.toFixed(1)})`,
    );
    if (c.slope < SLOPE[0] || c.slope > SLOPE[1]) failures.push(`${kind}: ${c.slope.toFixed(2)} actual wins per projected win (${SLOPE.join('-')})`);
    if (Math.abs(c.bottom) > TAIL_WINS || Math.abs(c.top) > TAIL_WINS)
      failures.push(`${kind}: the projections' bottom and top fifths miss by ${c.bottom.toFixed(1)} and ${c.top.toFixed(1)} wins (at most ${TAIL_WINS})`);
    if (c.band < BAND[0] || c.band > BAND[1]) failures.push(`${kind}: the 10-90 band held ${pct(c.band)} of seasons (${BAND.map(pct).join('-')})`);
    if (c.spread < SPREAD[0] || c.spread > SPREAD[1]) failures.push(`${kind}: wins spread ${c.spread.toFixed(2)} times what the forecast says (${SPREAD.join('-')})`);
  }

  // the real league's first seasons, team by team: the same rosters every league
  const first = rows.filter((r) => r.kind === 'real' && r.s === 0);
  const n = new Set(first.map((r) => r.league)).size;
  if (n < 3) console.log(`(the team-by-team and default-team checks need 3 real leagues or more: ${n} played)`);
  else {
    const ai = first.filter((r) => !r.user);
    const teams = [...new Set(ai.map((r) => r.team))]
      .filter((team) => ai.filter((r) => r.team === team).length >= 3)
      .map((team) => {
        const miss = ai.filter((r) => r.team === team).map((r) => r.won - r.w);
        return {
          team,
          miss: mean(miss),
          se: (sd(miss) * Math.sqrt(miss.length / Math.max(1, miss.length - 1))) / Math.sqrt(miss.length),
          w: mean(ai.filter((r) => r.team === team).map((r) => r.w)),
        };
      });
    teams.sort((a, b) => a.miss - b.miss);
    const bias = Math.sqrt(Math.max(0, mean(teams.map((t) => t.miss ** 2)) - mean(teams.map((t) => t.se ** 2))));
    const show = (t: (typeof teams)[number]) => `${t.team} ${t.miss >= 0 ? '+' : ''}${t.miss.toFixed(1)} (±${t.se.toFixed(1)}, proj ${t.w.toFixed(0)})`;
    console.log(
      `real league's first season over ${n} leagues: systematic miss ${bias.toFixed(1)} wins · most under ${teams.slice(0, 3).map(show).join(', ')} · most over ${teams.slice(-3).reverse().map(show).join(', ')}`,
    );
    if (!quiet) console.log(`  ${teams.map(show).join(' · ')}`);
    if (bias > BIAS_WINS) failures.push(`the real league's teams miss their projections by ${bias.toFixed(1)} wins systematically (at most ${BIAS_WINS})`);
    const off = teams.filter((t) => Math.abs(t.miss) > OFF_WINS + OFF_SE * t.se);
    if (off.length) failures.push(`${off.map(show).join(', ')}: off their projections by more than ${OFF_WINS} wins beyond ${OFF_SE} standard errors`);

    // the default team (the user's in every league): its first seasons against its owner's opening goals
    const mine = first.filter((r) => r.user);
    const def = mine[0];
    const seed: SeedData = JSON.parse(readFileSync('src/data/seed.json', 'utf8'));
    if (def && def.tid === defaultTeam(seed, seedRanks(seed)) && mine.every((r) => r.tid === def.tid)) {
      const met = mine.filter((r) => r.won >= (r.target ?? 0) && r.reached >= r.post).length;
      const rank = (r: Row) => 1 + first.filter((o) => o.league === r.league && o.w > r.w).length;
      console.log(
        `default team ${def.team}: projected ${mean(mine.map((r) => r.w)).toFixed(1)} (ranked ${median(mine.map(rank))} of ${league30(first)}), median ${median(mine.map((r) => r.won))} wins against the owner's ${median(mine.map((r) => r.target ?? 0))} · postseason level ${median(mine.map((r) => r.reached))} against ${median(mine.map((r) => r.post))} · both goals met in ${met} of ${mine.length} · payroll ${(def.payroll / 1000).toFixed(1)}M (tax ${(CAP.luxuryTax / 1000).toFixed(1)}M), ${seedRosterSizes(seed)[def.tid]} players in camp`,
      );
      if (met < DEFAULT_MET * mine.length)
        failures.push(`the default team ${def.team} met its owner's opening goals in ${met} of ${mine.length} first seasons (at least ${pct(DEFAULT_MET)})`);
      if (def.payroll >= CAP.luxuryTax || seedRosterSizes(seed)[def.tid] < CAP.rosterMin || seedRosterSizes(seed)[def.tid] > CAP.rosterMax)
        failures.push(`the default team ${def.team} opens over the tax or with an illegal roster`);
    }
  }
  console.log(`forecast: ${mean(ms).toFixed(0)} ms on opening night (${Math.max(...ms).toFixed(0)} at most)`);
  if (process.env.DUMP) writeFileSync(process.env.DUMP, rows.map((r) => JSON.stringify(r)).join('\n'));
  if (failures.length) {
    console.error(`FAIL: ${failures.join('; ')}`);
    return false;
  }
  console.log(
    `OK: slope within ${SLOPE.join('-')}, tails within ${TAIL_WINS} wins, the band holding ${BAND.map(pct).join('-')}, spread within ${SPREAD.join('-')}, the real league's systematic miss within ${BIAS_WINS} wins and no team past ${OFF_WINS} beyond its noise, the default team meeting its owner's opening goals in at least ${pct(DEFAULT_MET)} of its first seasons`,
  );
  return true;
}

if (leagues.length === 1) {
  const got = playLeague(leagues[0]);
  // (a league run by playLeagues hands its seasons back; on its own it judges them itself)
  if (process.send) process.send(got);
  else process.exit(verdict(got.rows, got.ms) ? 0 : 1);
} else {
  void playLeagues();
}
