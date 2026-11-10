// Part 3, the AI league as it plays: the real league (seed.json) on a fixed rngSeed, K seasons through
// the season runner as scripts/season-test.ts drives it, every team on automatic tactics and rotation
// (the user's team too, run by its staff). The runner doesn't keep possession logs, so the league is
// sampled twice a season (two weeks in, and just after the All-Star break): every team plays N games
// against random opponents in GameSims built as the season builds them (buildSimInput, record: true),
// on a random stream of the kit's own, and nothing is written back (a season plays the same with or
// without the samples). Play types by each possession's last finish (Synergy's kinds) and points per
// possession, from each game result's play-type tallies: the log's own finish field is the first
// shot's play type, so it never says putback. From the logs: the ball-screen coverage on every trip
// with a ball screen, the scheme on every half-court trip, the run-outs; the coaches' in-game
// adjustments. From the season's real results: team pace, three-point rate, offensive rebounding,
// turnovers, free throws. The teams' presets and glass settings, and how crashing goes with the
// opponents' run-outs. And the play types against real NBA Synergy team data.
// Usage: npx tsx scripts/tactics-lab/league.ts <label> [--quick] [--seasons K] [--per-team N] [--rng-seed N] [--synergy path]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLeague, defaultSettings, type SeedData } from '../../src/core/league/create';
import { autoDraftUserPick, finishDraftPhase, newSeason, simDay, startDraft, startFreeAgency, startRegularSeason } from '../../src/core/league/season';
import { buildSimInput } from '../../src/core/league/games';

/** Sampled games' own ids (see the sampler). */
let sampleIx = 0;
import { freeAgents, standardRoster } from '../../src/core/league/helpers';
import { CAP } from '../../src/core/constants';
import { standings } from '../../src/core/league/standings';
import { nextPick } from '../../src/core/league/draft';
import { expiringPlayers, userOffer, userResign } from '../../src/core/league/freeAgency';
import { askingContract, releasePlayer } from '../../src/core/league/contracts';
import { takeJob } from '../../src/core/league/jobs';
import { aiMatchVerdict, restrictedFreeAgents, sheetDecisionBlocked, userDecideSheet } from '../../src/core/league/rfa';
import { GameSim } from '../../src/core/sim/engine';
import { Rng } from '../../src/core/random';
import type { League } from '../../src/core/types';
import { corr, isMain, mean, parseArgs, REPO, round, runMeta, SEED_FILE, sd, writeJson, type LabArgs, type RunMeta } from './common';

export const RNG_SEED = 307;
export const USER_TID = 19;
/** The early sample: this many days into the regular season. */
export const EARLY_DAY = 14;
const SYNERGY_FILES = [join(REPO, 'data/raw/synergy/teams.json'), '/Users/kiarash/Downloads/hoops-career/data/raw/synergy/teams.json'];

/** Synergy's ten play types (the sim's 'misc' is kept apart: Synergy's tables leave it out). */
export const KINDS = ['isolation', 'transition', 'pnrBH', 'pnrRoll', 'post', 'spotup', 'handoff', 'offscreen', 'cut', 'putback'] as const;
export type Kind = (typeof KINDS)[number] | 'misc';
const FINISH_TO_KIND: Record<string, Kind> = {
  iso: 'isolation',
  transition: 'transition',
  pnrBH: 'pnrBH',
  pnrRoll: 'pnrRoll',
  post: 'post',
  spotup: 'spotup',
  handoff: 'handoff',
  offscreen: 'offscreen',
  cut: 'cut',
  putback: 'putback',
  misc: 'misc',
};
const ALL_KINDS: Kind[] = [...KINDS, 'misc'];

/** NBA.com team names (the Synergy file's keys) to the league's abbreviations. */
export const NBA_ABBR: Record<string, string> = {
  'Atlanta Hawks': 'ATL',
  'Boston Celtics': 'BOS',
  'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA',
  'Chicago Bulls': 'CHI',
  'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL',
  'Denver Nuggets': 'DEN',
  'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW',
  'Houston Rockets': 'HOU',
  'Indiana Pacers': 'IND',
  'LA Clippers': 'LAC',
  'Los Angeles Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL',
  'Memphis Grizzlies': 'MEM',
  'Miami Heat': 'MIA',
  'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN',
  'New Orleans Pelicans': 'NOP',
  'New York Knicks': 'NYK',
  'Oklahoma City Thunder': 'OKC',
  'Orlando Magic': 'ORL',
  'Philadelphia 76ers': 'PHI',
  'Phoenix Suns': 'PHX',
  'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC',
  'San Antonio Spurs': 'SAS',
  'Toronto Raptors': 'TOR',
  'Utah Jazz': 'UTA',
  'Washington Wizards': 'WAS',
};

// ------------------------------------------------------------------ the samples

/** Possessions and points by kind. */
type Tally = Record<Kind, { n: number; pts: number }>;
const newTally = (): Tally => Object.fromEntries(ALL_KINDS.map((k) => [k, { n: 0, pts: 0 }])) as Tally;

interface TeamSample {
  /** The team's possessions by how they finished, and its opponents'. */
  off: Tally;
  def: Tally;
  /** Ball-screen coverage on each of its defensive trips with a ball screen, and the scheme on each half-court trip. */
  cov: Record<string, number>;
  scheme: Record<string, number>;
  /** Its opponents' trips the log calls transition (the run-out itself, whatever the finish). */
  oppRunouts: number;
  games: number;
  adjustments: number;
}

/** The settings a team plays at the moment (read loosely: they are the tactics layer's, which may change). */
interface TacticsNow {
  offPreset: unknown;
  defPreset: unknown;
  pace: unknown;
  transition: unknown;
  crashBoards: unknown;
  getBack: unknown;
  scheme: unknown;
  pnr: unknown;
  switchOffBall: unknown;
  mentality: unknown;
}

interface Sample {
  season: number;
  point: 'early' | 'postASB';
  day: number;
  games: number;
  seconds: number;
  userTid: number;
  teams: TeamSample[];
  tactics: TacticsNow[];
  adjustments: Record<string, number>;
  /** Finish types the kit has no Synergy kind for (counted as misc). */
  unmapped: Record<string, number>;
  /** The league's possessions by the log's own finish field (the first shot's play type), for reference. */
  logFinish: Record<string, number>;
}

function tacticsNow(league: League, tid: number): TacticsNow {
  const t = league.teams[tid].tactics as unknown as Record<string, unknown> & { offense?: Record<string, unknown>; defense?: Record<string, unknown> };
  const o = t.offense ?? {};
  const d = t.defense ?? {};
  return {
    offPreset: t.offPreset ?? null,
    defPreset: t.defPreset ?? null,
    pace: o.pace ?? null,
    transition: o.transition ?? null,
    crashBoards: o.crashBoards ?? null,
    getBack: d.getBack ?? null,
    scheme: d.scheme ?? null,
    pnr: d.pnr ?? null,
    switchOffBall: d.switchOffBall ?? null,
    mentality: t.mentality ?? 0,
  };
}

/** An adjustment's text with player names taken out, so the same kind counts together. */
const adjKey = (text: string) => text.replace(/^hides .+ on .+$/, 'hides <player> on <player>');

/** Every team plays `perTeam` games against random opponents, as tonight's games would be built; nothing is written back to the league. */
function takeSample(league: League, rng: Rng, perTeam: number, point: Sample['point']): Sample {
  const t0 = performance.now();
  const n = league.teams.length;
  const day = league.day;
  const teams: TeamSample[] = league.teams.map(() => ({ off: newTally(), def: newTally(), cov: {}, scheme: {}, oppRunouts: 0, games: 0, adjustments: 0 }));
  const adjustments: Record<string, number> = {};
  const unmapped: Record<string, number> = {};
  const logFinish: Record<string, number> = {};
  let games = 0;
  for (let tid = 0; tid < n; tid++) {
    for (let g = 0; g < perTeam; g++) {
      let opp = rng.int(0, n - 2);
      if (opp >= tid) opp++;
      const [home, away] = g % 2 === 0 ? [tid, opp] : [opp, tid];
      // (a game id of its own, so an AI coach game-plans for it as for a scheduled game: ids past the schedule's never collide with one)
      const sched = { gid: 900000 + sampleIx++, day };
      const sim = new GameSim(buildSimInput(league, home, day, 'regular', away, sched), buildSimInput(league, away, day, 'regular', home, sched), {
        rng,
        type: 'regular',
        record: true,
      });
      const res = sim.simToEnd();
      games++;
      const tidOf = (side: number) => (side === 0 ? home : away);
      teams[home].games++;
      teams[away].games++;
      // play types by each possession's last finish, as the engine tallies them for the box score (and
      // the lab's summaries): the log's own finish field is the first shot's play type, never a putback
      for (const side of [0, 1] as const) {
        const box = (side === 0 ? res.home : res.away) as unknown as { playTypes?: Record<string, { poss: number; pts: number }> };
        const off = teams[tidOf(side)];
        const def = teams[tidOf(1 - side)];
        for (const [finish, v] of Object.entries(box.playTypes ?? {})) {
          const kind = FINISH_TO_KIND[finish];
          if (!kind) unmapped[finish] = (unmapped[finish] ?? 0) + v.poss;
          const k = kind ?? 'misc';
          off.off[k].n += v.poss;
          off.off[k].pts += v.pts;
          def.def[k].n += v.poss;
          def.def[k].pts += v.pts;
        }
      }
      for (const raw of sim.logs) {
        const log = raw as unknown as { off: 0 | 1; finish?: string; coverage?: string; kind?: string; scheme?: string; pts: number };
        const def = teams[tidOf(1 - log.off)];
        const lf = log.finish ?? 'none';
        logFinish[lf] = (logFinish[lf] ?? 0) + 1;
        if (log.coverage) def.cov[log.coverage] = (def.cov[log.coverage] ?? 0) + 1;
        if (log.kind === 'half' && log.scheme) def.scheme[log.scheme] = (def.scheme[log.scheme] ?? 0) + 1;
        if (log.kind === 'transition') def.oppRunouts++;
      }
      for (const a of (sim as unknown as { adjustments?: { t: 0 | 1; text: string }[] }).adjustments ?? []) {
        const key = adjKey(a.text);
        adjustments[key] = (adjustments[key] ?? 0) + 1;
        teams[tidOf(a.t)].adjustments++;
      }
    }
  }
  return {
    season: league.season,
    point,
    day,
    games,
    seconds: round((performance.now() - t0) / 1000, 1),
    userTid: league.userTid,
    teams,
    tactics: league.teams.map((t) => tacticsNow(league, t.tid)),
    adjustments,
    unmapped,
    logFinish,
  };
}

// ------------------------------------------------------------------ the season's real results

const TEAM_STATS = ['pace', 'threeRate', 'orb', 'tov', 'ftRate', 'oppTov'] as const;

function seasonStats(league: League, season: number) {
  const rows = league.teams.map((t) => {
    const ts = t.seasons.find((s) => s.season === season);
    if (!ts) return null;
    const gp = Math.max(1, ts.won + ts.lost);
    return {
      tid: t.tid,
      abbrev: t.abbrev,
      won: ts.won,
      lost: ts.lost,
      pace: round(ts.poss / gp, 2),
      threeRate: round(ts.t.tpa / Math.max(1, ts.t.fga), 4),
      orb: round(ts.t.orb / Math.max(1, ts.t.orb + ts.o.drb), 4),
      tov: round(ts.t.tov / Math.max(1, ts.poss), 4),
      ftRate: round(ts.t.fta / Math.max(1, ts.t.fga), 4),
      oppTov: round(ts.o.tov / Math.max(1, ts.oppPoss), 4),
      ortg: round((ts.ptsFor / Math.max(1, ts.poss)) * 100, 1),
      drtg: round((ts.ptsAgainst / Math.max(1, ts.oppPoss)) * 100, 1),
    };
  });
  const ok = rows.filter((r): r is NonNullable<typeof r> => !!r);
  return {
    season,
    teams: ok,
    summary: Object.fromEntries(TEAM_STATS.map((k) => [k, { mean: round(mean(ok.map((r) => r[k])), 4), sd: round(sd(ok.map((r) => r[k])), 4) }])) as Record<
      (typeof TEAM_STATS)[number],
      { mean: number; sd: number }
    >,
  };
}

// ------------------------------------------------------------------ the season runner (season-test.ts's loop)

/** The user's roster to 13-15 the way season-test.ts does it, so the season can start. */
function startSeason(league: League) {
  const errs = startRegularSeason(league);
  if (!errs.length) return;
  const roster = standardRoster(league, league.userTid).sort((a, b) => a.ovr - b.ovr);
  while (standardRoster(league, league.userTid).length > CAP.rosterMax) releasePlayer(league, roster.shift()!, { news: false });
  for (const p of freeAgents(league).sort((a, b) => b.ovr - a.ovr)) {
    if (standardRoster(league, league.userTid).length >= CAP.rosterMin) break;
    userOffer(league, p.pid, askingContract(league, p, league.userTid).amount, 1);
  }
  const e2 = startRegularSeason(league);
  if (e2.length) throw new Error(`league: the season can't start: ${e2.join('; ')}`);
}

/** The offseason as season-test.ts plays it: a fired coach takes a job, the draft, re-signings, free agency, the new season. */
function offseason(league: League) {
  if (league.fired) {
    const st = standings(league);
    const to = league.jobOffers?.offers[0]?.tid ?? [...st].sort((a, b) => a.pct - b.pct).find((r) => r.tid !== league.userTid)!.tid;
    takeJob(league, to);
  }
  startDraft(league);
  let g = 0;
  while (nextPick(league) && g++ < 100) autoDraftUserPick(league);
  finishDraftPhase(league);
  for (const p of expiringPlayers(league, league.userTid)) {
    const ask = askingContract(league, p, league.userTid);
    if (p.ovr >= 72) userResign(league, p.pid, ask.amount, ask.years);
  }
  startFreeAgency(league);
  for (let k = 0; k < 5 && !newSeason(league); k++)
    for (const p of restrictedFreeAgents(league, league.userTid).filter((x) => x.rfa!.sheet))
      userDecideSheet(league, p.pid, aiMatchVerdict(league, p).match && !sheetDecisionBlocked(league, p.pid, true));
  if (league.phase !== 'preseason') throw new Error(`league: the new season didn't start (phase ${league.phase})`);
}

// ------------------------------------------------------------------ aggregation

interface TeamAgg {
  tid: number;
  abbrev: string;
  /** Shares of the ten Synergy kinds (misc left out), percent; misc as a share of every possession. */
  shares: Record<string, number>;
  miscShare: number;
  ppp: Record<string, number>;
  poss: number;
}

const newTeamSample = (): TeamSample => ({ off: newTally(), def: newTally(), cov: {}, scheme: {}, oppRunouts: 0, games: 0, adjustments: 0 });

function addInto(o: TeamSample, t: TeamSample) {
  for (const k of ALL_KINDS) {
    o.off[k].n += t.off[k].n;
    o.off[k].pts += t.off[k].pts;
    o.def[k].n += t.def[k].n;
    o.def[k].pts += t.def[k].pts;
  }
  for (const [c, v] of Object.entries(t.cov)) o.cov[c] = (o.cov[c] ?? 0) + v;
  for (const [c, v] of Object.entries(t.scheme)) o.scheme[c] = (o.scheme[c] ?? 0) + v;
  o.oppRunouts += t.oppRunouts;
  o.games += t.games;
  o.adjustments += t.adjustments;
}

/** Each team's tallies over the samples. */
function sumSamples(samples: Sample[], n: number): TeamSample[] {
  const out = Array.from({ length: n }, newTeamSample);
  for (const s of samples) s.teams.forEach((t, tid) => addInto(out[tid], t));
  return out;
}

/** Every team's tallies added into one (the league's). */
function sumAll(ts: TeamSample[]): TeamSample {
  const o = newTeamSample();
  for (const t of ts) addInto(o, t);
  return o;
}

function teamAgg(t: TeamSample, tid: number, abbrev: string): TeamAgg {
  const ten = KINDS.reduce((a, k) => a + t.off[k].n, 0) || 1;
  const all = ten + t.off.misc.n;
  return {
    tid,
    abbrev,
    shares: Object.fromEntries(KINDS.map((k) => [k, round((t.off[k].n / ten) * 100, 2)])),
    miscShare: round((t.off.misc.n / Math.max(1, all)) * 100, 2),
    ppp: Object.fromEntries(ALL_KINDS.map((k) => [k, round(t.off[k].n ? t.off[k].pts / t.off[k].n : NaN, 3)])),
    poss: all,
  };
}

const shareOf = (m: Record<string, number>) => {
  const total = Object.values(m).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round((v / total) * 100, 2)]));
};

function merge(ms: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of ms) for (const [k, v] of Object.entries(m)) out[k] = (out[k] ?? 0) + v;
  return out;
}

// ------------------------------------------------------------------ the run

export interface LeagueOut {
  meta: RunMeta;
  params: { rngSeed: number; seasons: number; perTeam: number; earlyDay: number; userTid: number; quick: boolean };
  timing: { season: number; simSeconds: number; sampleSeconds: number }[];
  samples: { season: number; point: string; day: number; games: number; seconds: number; userTid: number }[];
  /** (a) play types by team and season (shares of the ten kinds, percent), and the league's. */
  playTypes: { season: number; league: TeamAgg; teams: TeamAgg[] }[];
  /** (b) ball-screen coverage and half-court scheme shares, percent: by season, overall, and by team (all samples). */
  coverage: {
    bySeason: { season: number; trips: number; shares: Record<string, number>; schemeShares: Record<string, number>; halfTrips: number }[];
    overall: { trips: number; shares: Record<string, number>; schemeShares: Record<string, number>; halfTrips: number };
    teams: { tid: number; abbrev: string; trips: number; shares: Record<string, number>; schemeShares: Record<string, number> }[];
  };
  /** (c) in-game adjustments. */
  adjustments: { games: number; total: number; perGame: number; perTeamGame: number; bySeason: { season: number; perGame: number }[]; byText: Record<string, number> };
  /** (d) team stats from the seasons' results. */
  teamStats: ReturnType<typeof seasonStats>[];
  /** (e) presets and glass settings by team at each sample, and how crashing goes with the opponents' run-outs. */
  presets: {
    samples: { season: number; point: string; teams: (TacticsNow & { tid: number; abbrev: string; oppTransition: number; oppRunouts: number })[] }[];
    corrCrashOppTransition: { season: number; point: string; r: number; rRunouts: number; rGetBack: number }[];
    pooled: { r: number; rRunouts: number; rGetBack: number; n: number };
    offPresets: Record<string, number>;
    defPresets: Record<string, number>;
  };
  /** (f) against real NBA Synergy team data. */
  synergy: {
    file: string | null;
    note?: string;
    kinds: {
      kind: string;
      simMean: number;
      real26Mean: number;
      real25Mean: number;
      simSD: number;
      real26SD: number;
      real25SD: number;
      corrSim1Real26: number;
      corrSim1Real25: number;
      corrReal25Real26: number;
      corrSim1Sim2: number;
      corrSim2Sim3: number;
      simPPP: number;
      real26PPP: number;
    }[];
  };
  unmapped: Record<string, number>;
  /** The league's possessions by the log's own finish field (the first shot's play type: never a putback), percent. */
  logFinishShares: Record<string, number>;
}

function loadSynergy(path?: string): { file: string; data: Record<string, Record<string, Record<string, { poss: number; freq: number; ppp: number }>>> } | null {
  const file = path ?? SYNERGY_FILES.find((f) => existsSync(f));
  if (!file || !existsSync(file)) return null;
  return { file, data: JSON.parse(readFileSync(file, 'utf8')) };
}

export async function runLeague(args: LabArgs): Promise<LeagueOut> {
  const t0 = performance.now();
  const started = new Date();
  const seasons = args.seasons ?? (args.quick ? 1 : 3);
  const perTeam = args.perTeam ?? 12;
  const rngSeed = args.rngSeed ?? RNG_SEED;
  const seed: SeedData = JSON.parse(readFileSync(SEED_FILE, 'utf8'));
  const league = createLeague({ name: 'Tactics lab', userTid: USER_TID, coachName: 'Lab Coach', settings: defaultSettings(), seed, rngSeed });
  // a fixed id: the lottery draws ties from it, so every run is the same (as season-test.ts)
  league.id = 'tactics_lab';
  const n = league.teams.length;
  const abbrev = league.teams.map((t) => t.abbrev);
  const samples: Sample[] = [];
  const stats: ReturnType<typeof seasonStats>[] = [];
  const timing: LeagueOut['timing'] = [];
  console.log(`[league] ${seasons} season(s), rngSeed ${rngSeed}, ${perTeam} sampled games a team twice a season`);
  for (let s = 0; s < seasons; s++) {
    startSeason(league);
    const season = league.season;
    // the kit's own stream for the sampled games, from the season: the league's own draws never see it
    const rng = new Rng((rngSeed * 7919 + season * 104729) >>> 0);
    const ts0 = performance.now();
    let sampleSec = 0;
    let early = false;
    let post = false;
    let guard = 0;
    while (league.phase === 'regular' && guard++ < 400) {
      if (!early && league.day >= EARLY_DAY) {
        samples.push(takeSample(league, rng, perTeam, 'early'));
        sampleSec += samples[samples.length - 1].seconds;
        early = true;
      }
      if (!post && league.day > league.allStarDay) {
        samples.push(takeSample(league, rng, perTeam, 'postASB'));
        sampleSec += samples[samples.length - 1].seconds;
        post = true;
      }
      simDay(league);
    }
    stats.push(seasonStats(league, season));
    // the postseason (its results don't count here), then the offseason, unless this was the last season
    if (s < seasons - 1) {
      guard = 0;
      while ((league.phase === 'playin' || league.phase === 'playoffs') && guard++ < 200) simDay(league);
      offseason(league);
    }
    const simSeconds = round((performance.now() - ts0) / 1000 - sampleSec, 1);
    timing.push({ season, simSeconds, sampleSeconds: round(sampleSec, 1) });
    console.log(`[league] season ${season}: ${early && post ? 'two samples' : 'samples missing!'}, simulated in ${simSeconds}s, sampled in ${round(sampleSec, 1)}s`);
  }
  const seasonList = [...new Set(samples.map((x) => x.season))];

  // (a) play types
  const playTypes = seasonList.map((season) => {
    const sum = sumSamples(
      samples.filter((x) => x.season === season),
      n,
    );
    return { season, league: teamAgg(sumAll(sum), -1, 'league'), teams: sum.map((t, tid) => teamAgg(t, tid, abbrev[tid])) };
  });

  // (b) coverage and schemes
  const covBlock = (ts: TeamSample[]) => {
    const cov = merge(ts.map((t) => t.cov));
    const sch = merge(ts.map((t) => t.scheme));
    return { trips: Object.values(cov).reduce((a, b) => a + b, 0), shares: shareOf(cov), schemeShares: shareOf(sch), halfTrips: Object.values(sch).reduce((a, b) => a + b, 0) };
  };
  const allTeams = sumSamples(samples, n);
  const coverage: LeagueOut['coverage'] = {
    bySeason: seasonList.map((season) => ({ season, ...covBlock(samples.filter((x) => x.season === season).flatMap((x) => x.teams)) })),
    overall: covBlock(samples.flatMap((x) => x.teams)),
    teams: allTeams.map((t, tid) => ({
      tid,
      abbrev: abbrev[tid],
      trips: Object.values(t.cov).reduce((a, b) => a + b, 0),
      shares: shareOf(t.cov),
      schemeShares: shareOf(t.scheme),
    })),
  };

  // (c) adjustments
  const games = samples.reduce((a, x) => a + x.games, 0);
  const total = samples.reduce((a, x) => a + Object.values(x.adjustments).reduce((p, q) => p + q, 0), 0);
  const byText = Object.fromEntries(Object.entries(merge(samples.map((x) => x.adjustments))).sort((a, b) => b[1] - a[1]));
  const adjustments: LeagueOut['adjustments'] = {
    games,
    total,
    perGame: round(total / Math.max(1, games), 3),
    perTeamGame: round(total / Math.max(1, 2 * games), 3),
    bySeason: seasonList.map((season) => {
      const xs = samples.filter((x) => x.season === season);
      const g = xs.reduce((a, x) => a + x.games, 0);
      return { season, perGame: round(xs.reduce((a, x) => a + Object.values(x.adjustments).reduce((p, q) => p + q, 0), 0) / Math.max(1, g), 3) };
    }),
    byText,
  };

  // (e) presets, glass settings and the opponents' run-outs
  const presetSamples = samples.map((x) => ({
    season: x.season,
    point: x.point,
    teams: x.tactics.map((tc, tid) => {
      const t = x.teams[tid];
      const all = ALL_KINDS.reduce((a, k) => a + t.def[k].n, 0) || 1;
      return { ...tc, tid, abbrev: abbrev[tid], oppTransition: round((t.def.transition.n / all) * 100, 2), oppRunouts: round((t.oppRunouts / all) * 100, 2) };
    }),
  }));
  const num = (v: unknown) => (typeof v === 'number' ? v : NaN);
  const corrOf = (ts: (typeof presetSamples)[number]['teams']) => {
    const ok = ts.filter((t) => Number.isFinite(num(t.crashBoards)));
    const okG = ts.filter((t) => Number.isFinite(num(t.getBack)));
    return {
      r: round(
        corr(
          ok.map((t) => num(t.crashBoards)),
          ok.map((t) => t.oppTransition),
        ),
      ),
      rRunouts: round(
        corr(
          ok.map((t) => num(t.crashBoards)),
          ok.map((t) => t.oppRunouts),
        ),
      ),
      rGetBack: round(
        corr(
          okG.map((t) => num(t.getBack)),
          okG.map((t) => t.oppTransition),
        ),
      ),
    };
  };
  const count = (vals: unknown[]) => Object.fromEntries(Object.entries(merge(vals.map((v) => ({ [String(v)]: 1 })))).sort((a, b) => b[1] - a[1]));
  const presets: LeagueOut['presets'] = {
    samples: presetSamples,
    corrCrashOppTransition: presetSamples.map((x) => ({ season: x.season, point: x.point, ...corrOf(x.teams) })),
    pooled: { ...corrOf(presetSamples.flatMap((x) => x.teams)), n: presetSamples.reduce((a, x) => a + x.teams.length, 0) },
    offPresets: count(presetSamples.flatMap((x) => x.teams.map((t) => t.offPreset))),
    defPresets: count(presetSamples.flatMap((x) => x.teams.map((t) => t.defPreset))),
  };

  // (f) Synergy
  const syn = loadSynergy(args.synergy);
  const synergy: LeagueOut['synergy'] = { file: syn?.file ?? null, kinds: [] };
  if (!syn) synergy.note = `no Synergy file (looked for ${SYNERGY_FILES.join(', ')}; pass --synergy <path>)`;
  else {
    const realShares = (key: string) => {
      const season = syn.data[key];
      if (!season) return null;
      const byAbbr: Record<string, { shares: Record<string, number>; ppp: Record<string, number> }> = {};
      for (const [name, row] of Object.entries(season)) {
        const ab = NBA_ABBR[name];
        if (!ab) continue;
        const ten = KINDS.reduce((a, k) => a + (row[k]?.freq ?? 0), 0) || 1;
        byAbbr[ab] = { shares: Object.fromEntries(KINDS.map((k) => [k, ((row[k]?.freq ?? 0) / ten) * 100])), ppp: Object.fromEntries(KINDS.map((k) => [k, row[k]?.ppp ?? NaN])) };
      }
      return byAbbr;
    };
    const r26 = realShares('2025-26');
    const r25 = realShares('2024-25');
    const missing = abbrev.filter((ab) => !r26?.[ab] || !r25?.[ab]);
    if (missing.length) synergy.note = `no real data for ${missing.join(', ')} (left out of the correlations)`;
    const teamsBoth = abbrev.map((ab, tid) => ({ ab, tid })).filter(({ ab }) => r26?.[ab] && r25?.[ab]);
    const simSeason = (i: number) => playTypes[i]?.teams;
    const vec = (ts: TeamAgg[] | undefined, k: string) => (ts ? teamsBoth.map(({ tid }) => ts[tid].shares[k]) : []);
    const realVec = (r: typeof r26, k: string) => teamsBoth.map(({ ab }) => r![ab].shares[k]);
    // the league's points per play by kind, real (weighted by possessions)
    const realPPP = (key: string, k: string) => {
      const season = syn.data[key] ?? {};
      let poss = 0;
      let pts = 0;
      for (const row of Object.values(season)) {
        poss += row[k]?.poss ?? 0;
        pts += (row[k]?.poss ?? 0) * (row[k]?.ppp ?? 0);
      }
      return poss ? pts / poss : NaN;
    };
    synergy.kinds = KINDS.map((k) => {
      const s1 = vec(simSeason(0), k);
      return {
        kind: k,
        simMean: round(mean(s1), 2),
        real26Mean: round(mean(realVec(r26, k)), 2),
        real25Mean: round(mean(realVec(r25, k)), 2),
        simSD: round(sd(s1), 2),
        real26SD: round(sd(realVec(r26, k)), 2),
        real25SD: round(sd(realVec(r25, k)), 2),
        corrSim1Real26: round(corr(s1, realVec(r26, k))),
        corrSim1Real25: round(corr(s1, realVec(r25, k))),
        corrReal25Real26: round(corr(realVec(r25, k), realVec(r26, k))),
        corrSim1Sim2: round(corr(s1, vec(simSeason(1), k))),
        corrSim2Sim3: round(corr(vec(simSeason(1), k), vec(simSeason(2), k))),
        simPPP: playTypes[0]?.league.ppp[k] ?? NaN,
        real26PPP: round(realPPP('2025-26', k), 3),
      };
    });
  }

  const out: LeagueOut = {
    meta: runMeta(args.label, t0, started),
    params: { rngSeed, seasons, perTeam, earlyDay: EARLY_DAY, userTid: USER_TID, quick: args.quick },
    timing,
    samples: samples.map(({ season, point, day, games: g, seconds, userTid }) => ({ season, point, day, games: g, seconds, userTid })),
    playTypes,
    coverage,
    adjustments,
    teamStats: stats,
    presets,
    synergy,
    unmapped: merge(samples.map((x) => x.unmapped)),
    logFinishShares: shareOf(merge(samples.map((x) => x.logFinish))),
  };
  writeJson(args.label, 'league.json', out);
  console.log(`[league] done in ${out.meta.seconds}s`);
  return out;
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  await runLeague(args);
  // (run.ts writes the digest itself once every part is done)
  if (!process.argv.includes('--no-summary')) (await import('./summary')).writeSummary(args.label);
}
