// Scouting from the games actually played: a team's pace, efficiency and four factors with league
// ranks, its play types at both ends against the league's, its key players with on/off numbers and
// what the user's own games against it showed, read into plain-English tendencies, exploits and the
// counters the numbers back (counterCandidates in src/core/ai/advisor.ts attaches them as evidence).

import type { League, PlayerStats, TeamSeason } from '../types';
import { FINISH_LABEL, type FinishType } from '../sim/log';
import { DEFAULT_PPP, zScore } from './playTypes';
import { IMPACT_TEXT, impactSentence, teamRef } from './gameReport';
import { playerName, seasonTotals, teamPlayers } from '../league/helpers';

/** Games a team needs this season before its own numbers are read instead of last season's. */
export const SCOUT_MIN_GAMES = 5;

/** Possessions of a play type before its points per possession count as a tendency. */
const MIN_PT_POSS = 40;

/** A value and where it ranks in the league (1 = best, or for a style number such as pace, the most). */
export interface Ranked {
  v: number;
  rank: number;
}

/** Dean Oliver's four factors at one end (rank 1 = the best at that end). */
export interface FourFactors {
  /** Effective field-goal percentage. */
  efg: Ranked;
  /** Turnovers per possession. */
  tov: Ranked;
  /** Share of the misses at that end rebounded by the offense. */
  orb: Ranked;
  /** Free-throw attempts per field-goal attempt. */
  ftr: Ranked;
}

export interface PlayTypeRow {
  key: FinishType;
  poss: number;
  pts: number;
  /** Share of the team's possessions (offense) or of its opponents' (defense). */
  share: number;
  ppp: number;
  /** The league's points per possession for this play type. */
  base: number;
  /** How far the points per possession are from the league's, in standard errors (positive: more points). */
  z: number;
  /** League rank by share: 1 = runs it (or, on defense, faces it) most. */
  shareRank: number;
  /** League rank by points per possession: 1 = scores the most (offense) or allows the fewest (defense). */
  pppRank: number;
}

export interface ScoutPlayer {
  pid: number;
  name: string;
  gp: number;
  /** Per game. */
  min: number;
  pts: number;
  fta: number;
  /** Share of the team's possessions he used while on the floor. */
  usg: number;
  ts: number;
  ft: number;
  /** His numbers are from another team (a newcomer): no on/off for this one. */
  elsewhere: boolean;
  /** Net rating with him on the floor and off it, per 100 possessions (none without on-court data). */
  on?: number;
  off?: number;
  /** Offensive possessions with him on and off the floor (they add up to the team's). */
  onPoss: number;
  offPoss: number;
}

export interface HeadToHeadGame {
  gid: number;
  season: number;
  day: number;
  /** The user's team won. */
  won: boolean;
  us: number;
  them: number;
  home: boolean;
  /** The NBA Cup final, on a neutral floor: neither side was at home. */
  cupFinal?: boolean;
}

export interface ScoutEffect {
  key: string;
  /** The effect helped the user's team. */
  forUser: boolean;
  /** Points a game, over the meetings that tracked effects. */
  perGame: number;
}

export interface ScoutData {
  tid: number;
  /** The season the team numbers are from. */
  season: number;
  /** Fewer than SCOUT_MIN_GAMES this season: last season's numbers are shown instead. */
  lastSeason: boolean;
  /** Regular-season games in that season. */
  gp: number;
  /** There are enough games to read the numbers. */
  enough: boolean;
  /** Teams in the rankings. */
  teams: number;
  /** Possessions a game (rank 1 = fastest). */
  pace: Ranked;
  ortg: Ranked;
  drtg: Ranked;
  net: Ranked;
  off: FourFactors;
  def: FourFactors;
  /** Share of their shots from three, and at the rim (rank 1 = the most). */
  threeRate: Ranked;
  rimRate: Ranked;
  /** Stored games the play types come from. */
  ptGames: number;
  playTypes: PlayTypeRow[];
  defPlayTypes: PlayTypeRow[];
  players: ScoutPlayer[];
  /** The player they run their offense through (30%+ usage), when the numbers show one. */
  star?: number;
  /** `tracked`: the meetings whose tactical effects were kept, which the effects' per-game numbers are over. */
  h2h: { games: HeadToHeadGame[]; won: number; lost: number; effects: ScoutEffect[]; tracked: number };
  tendencies: string[];
  exploits: string[];
  /** Counter ids (see counterCandidates) the numbers back, with the evidence for each. */
  counters: Record<string, string>;
}

// ---------------------------------------------------------------- league-wide aggregation

type PT = Record<string, { poss: number; pts: number }>;

interface TeamAgg {
  ts: TeamSeason | null;
  gp: number;
  off: PT;
  def: PT;
  ptGames: number;
  rimA: number;
}

type StatKey = 'pace' | 'ortg' | 'drtg' | 'net' | 'efg' | 'tov' | 'orb' | 'ftr' | 'oEfg' | 'oTov' | 'oOrb' | 'oFtr' | 'threeRate' | 'rimRate';

interface SeasonAgg {
  season: number;
  teams: TeamAgg[];
  base: Record<string, number>;
  ranked: Record<StatKey, Ranked[]>;
  off: Record<string, { share: number[]; shareRank: number[]; pppRank: number[] }>;
  def: Record<string, { share: number[]; shareRank: number[]; pppRank: number[] }>;
}

const div = (a: number, b: number) => (b > 0 ? a / b : NaN);

/** Each stat, read from a team's season, and whether a higher value ranks first. */
const STATS: Record<StatKey, { get: (ts: TeamSeason, tm: TeamAgg) => number; high: boolean }> = {
  pace: { get: (ts, tm) => div(ts.poss, tm.gp), high: true },
  ortg: { get: (ts) => div(ts.ptsFor, ts.poss) * 100, high: true },
  drtg: { get: (ts) => div(ts.ptsAgainst, ts.oppPoss) * 100, high: false },
  net: { get: (ts) => div(ts.ptsFor, ts.poss) * 100 - div(ts.ptsAgainst, ts.oppPoss) * 100, high: true },
  efg: { get: (ts) => div(ts.t.fgm + 0.5 * ts.t.tpm, ts.t.fga), high: true },
  tov: { get: (ts) => div(ts.t.tov, ts.poss), high: false },
  orb: { get: (ts) => div(ts.t.orb, ts.t.orb + ts.o.drb), high: true },
  ftr: { get: (ts) => div(ts.t.fta, ts.t.fga), high: true },
  oEfg: { get: (ts) => div(ts.o.fgm + 0.5 * ts.o.tpm, ts.o.fga), high: false },
  oTov: { get: (ts) => div(ts.o.tov, ts.oppPoss), high: true },
  oOrb: { get: (ts) => div(ts.o.orb, ts.o.orb + ts.t.drb), high: false },
  oFtr: { get: (ts) => div(ts.o.fta, ts.o.fga), high: false },
  threeRate: { get: (ts) => div(ts.t.tpa, ts.t.fga), high: true },
  rimRate: { get: (ts, tm) => div(tm.rimA, ts.t.fga), high: true },
};

/** Ranks 1..n by value (teams without one go last), ties by team id. */
function rankOf(values: number[], high: boolean): number[] {
  const order = values.map((v, tid) => ({ v, tid }));
  order.sort((a, b) => {
    const na = !isFinite(a.v);
    const nb = !isFinite(b.v);
    if (na || nb) return na === nb ? a.tid - b.tid : na ? 1 : -1;
    return (high ? b.v - a.v : a.v - b.v) || a.tid - b.tid;
  });
  const out = new Array<number>(values.length);
  order.forEach((x, i) => (out[x.tid] = i + 1));
  return out;
}

function addPt(into: PT, from: PT | undefined) {
  for (const k in from) {
    const v = from[k];
    const e = (into[k] ??= { poss: 0, pts: 0 });
    e.poss += v.poss;
    e.pts += v.pts;
  }
}

/** A season's play types summed from the stored games, by team, as far as `done` games into the list. */
interface PlayTypeSums {
  games: League['games'];
  done: number;
  off: PT[];
  def: PT[];
  ptGames: number[];
  all: PT;
}

const ptCache = new WeakMap<League, Map<number, PlayTypeSums>>();

/**
 * Play types come from the stored games: every game of this season, only the user's of earlier ones.
 * The list only grows within a season (a new season starts a new one), so each game is added once.
 */
function playTypeSums(league: League, season: number): PlayTypeSums {
  let bySeason = ptCache.get(league);
  if (!bySeason) ptCache.set(league, (bySeason = new Map()));
  let st = bySeason.get(season);
  const n = league.teams.length;
  if (!st || st.games !== league.games || st.done > league.games.length) {
    st = { games: league.games, done: 0, off: Array.from({ length: n }, () => ({})), def: Array.from({ length: n }, () => ({})), ptGames: new Array<number>(n).fill(0), all: {} };
    bySeason.set(season, st);
  }
  for (let i = st.done; i < league.games.length; i++) {
    const g = league.games[i];
    if (g.season !== season || g.type === 'allstar') continue;
    for (const [mine, opp] of [
      [g.home, g.away],
      [g.away, g.home],
    ]) {
      if (!(mine.tid >= 0 && mine.tid < n)) continue;
      st.ptGames[mine.tid]++;
      addPt(st.off[mine.tid], mine.playTypes);
      addPt(st.def[mine.tid], opp.playTypes);
      addPt(st.all, mine.playTypes);
    }
  }
  st.done = league.games.length;
  return st;
}

function buildSeason(league: League, season: number): SeasonAgg {
  const sums = playTypeSums(league, season);
  const all = sums.all;
  const teams: TeamAgg[] = league.teams.map((t, tid) => {
    const ts = t.seasons.find((s) => s.season === season) ?? null;
    return { ts, gp: ts ? ts.won + ts.lost : 0, off: sums.off[tid], def: sums.def[tid], ptGames: sums.ptGames[tid], rimA: 0 };
  });
  // shots at the rim are kept per player (the team totals don't split them by zone)
  for (const p of Object.values(league.players)) for (const s of p.stats) if (s.season === season && !s.playoffs && teams[s.tid]) teams[s.tid].rimA += s.rimA;
  // the league's points per play type, as playTypeBaselines reads them for the current season
  const base = { ...DEFAULT_PPP };
  for (const [k, v] of Object.entries(all)) if (v.poss >= 300) base[k] = v.pts / v.poss;
  const ranked = {} as SeasonAgg['ranked'];
  for (const [k, st] of Object.entries(STATS) as [StatKey, (typeof STATS)[StatKey]][]) {
    const values = teams.map((tm) => (tm.ts && tm.gp > 0 ? st.get(tm.ts, tm) : NaN));
    const ranks = rankOf(values, st.high);
    ranked[k] = values.map((v, tid) => ({ v, rank: ranks[tid] }));
  }
  // play types are ranked among the teams with enough stored games: an earlier season keeps only the
  // user's, so his opponents then have just their meetings with him (see playTypeRows)
  const ptRanks = (side: 'off' | 'def') => {
    const out: SeasonAgg['off'] = {};
    for (const key of Object.keys(FINISH_LABEL)) {
      const share = teams.map((tm) => {
        const total = Object.values(tm[side]).reduce((a, x) => a + x.poss, 0);
        return total && tm.ptGames >= SCOUT_MIN_GAMES ? (tm[side][key]?.poss ?? 0) / total : NaN;
      });
      const ppp = teams.map((tm) => (tm[side][key]?.poss && tm.ptGames >= SCOUT_MIN_GAMES ? tm[side][key].pts / tm[side][key].poss : NaN));
      out[key] = { share, shareRank: rankOf(share, true), pppRank: rankOf(ppp, side === 'off') };
    }
    return out;
  };
  return { season, teams, base, ranked, off: ptRanks('off'), def: ptRanks('def') };
}

const seasonCache = new WeakMap<League, Map<number, { key: string; agg: SeasonAgg }>>();

/**
 * A season's league-wide numbers, kept until a game is played (or the season or phase changes):
 * the screens read them on every league change, and a slider drag changes nothing they count.
 */
function seasonAgg(league: League, season: number): SeasonAgg {
  const key = `${league.season}|${league.phase}|${league.games.length}`;
  let bySeason = seasonCache.get(league);
  if (!bySeason) seasonCache.set(league, (bySeason = new Map()));
  const hit = bySeason.get(season);
  if (hit && hit.key === key) return hit.agg;
  const agg = buildSeason(league, season);
  bySeason.set(season, { key, agg });
  return agg;
}

// ---------------------------------------------------------------- one team

/** A team's healthy players the way its rotation plans them, most planned minutes first (`out`: others who sit tonight). */
export function projectedRotation(league: League, tid: number, n: number, out?: Set<number>) {
  const team = league.teams[tid];
  const order = new Map(team.rotation.order.map((pid, i) => [pid, i]));
  return teamPlayers(league, tid)
    .filter((p) => !p.injury && !out?.has(p.pid))
    .sort((a, b) => (team.rotation.minutes[b.pid] ?? 0) - (team.rotation.minutes[a.pid] ?? 0) || (order.get(a.pid) ?? 99) - (order.get(b.pid) ?? 99) || b.ovr - a.ovr)
    .slice(0, n);
}

function playerLine(league: League, s: PlayerStats, ts: TeamSeason | null, elsewhere: boolean, pid: number): ScoutPlayer {
  const gp = Math.max(1, s.gp);
  const tsa = s.fga + 0.44 * s.fta;
  const use = s.fga + 0.44 * s.fta + s.tov;
  const teamUse = s.teamFga + 0.44 * s.teamFta + s.teamTov;
  const out: ScoutPlayer = {
    pid,
    name: playerName(league.players[pid]),
    gp: s.gp,
    min: s.min / gp,
    pts: s.pts / gp,
    fta: s.fta / gp,
    usg: s.adv ? s.adv.usg / 100 : teamUse ? use / teamUse : 0,
    ts: tsa ? s.pts / (2 * tsa) : 0,
    ft: s.fta ? s.ftm / s.fta : 0,
    elsewhere,
    onPoss: 0,
    offPoss: 0,
  };
  // on/off from the on-court numbers (simulated seasons only), the rest of the team's season off
  if (!elsewhere && ts && s.onPoss > 0) {
    out.onPoss = s.onPoss;
    out.offPoss = ts.poss - s.onPoss;
    out.on = ((s.onPtsFor - s.onPtsAgainst) / s.onPoss) * 100;
    if (out.offPoss > 0) out.off = ((ts.ptsFor - s.onPtsFor - (ts.ptsAgainst - s.onPtsAgainst)) / out.offPoss) * 100;
  }
  return out;
}

/** A team's play types at one end: none from fewer than SCOUT_MIN_GAMES stored games (last season's opponents of the user's, on opening nights). */
function playTypeRows(agg: SeasonAgg, tid: number, side: 'off' | 'def'): PlayTypeRow[] {
  const pt = agg.teams[tid]?.[side] ?? {};
  const total = Object.values(pt).reduce((a, x) => a + x.poss, 0);
  if (!total || agg.teams[tid].ptGames < SCOUT_MIN_GAMES) return [];
  return (Object.entries(pt) as [FinishType, { poss: number; pts: number }][])
    .filter(([k, v]) => FINISH_LABEL[k] && v.poss > 0)
    .map(([key, v]) => {
      const base = agg.base[key] ?? DEFAULT_PPP[key] ?? 1;
      const r = agg[side][key];
      return { key, poss: v.poss, pts: v.pts, share: v.poss / total, ppp: v.pts / v.poss, base, z: zScore(v, base), shareRank: r.shareRank[tid], pppRank: r.pppRank[tid] };
    })
    .sort((a, b) => b.poss - a.poss);
}

// ---------------------------------------------------------------- reading the numbers

const sfx = (n: number) => {
  const v = Math.abs(n) % 100;
  return v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][v % 10] ?? 'th');
};
const nth = (n: number) => `${n}${sfx(n)}`;
/** "the most", "the 3rd-most" (or fastest, worst...). */
const most = (k: number, word = 'most') => (k === 1 ? `the ${word}` : `the ${nth(k)}-${word}`);
const pct0 = (v: number) => `${Math.round(v * 100)}%`;
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;
const ppp = (v: number) => v.toFixed(2);

/** Play types as a sentence names them. */
const PT_NOUN: Record<FinishType, string> = {
  pnrBH: 'pick-and-roll ball-handler plays',
  pnrRoll: 'rolls and pops off the pick-and-roll',
  iso: 'isolations',
  post: 'post-ups',
  spotup: 'spot-up shots',
  offscreen: 'shots off screens',
  handoff: 'handoffs',
  cut: 'cuts',
  transition: 'transition plays',
  putback: 'putbacks',
  misc: 'other plays',
};

/** How to attack a defense that gives up a play type. */
const PT_ATTACK: Partial<Record<FinishType, string>> = {
  pnrBH: 'Put your handlers in ball screens.',
  pnrRoll: 'Roll your bigs hard.',
  iso: 'Isolate your best scorer.',
  post: 'Post up.',
  spotup: 'Spread the floor.',
  offscreen: 'Run your shooters off screens.',
  handoff: 'Run handoffs.',
  cut: 'Cut hard.',
  transition: 'Push the pace.',
  putback: 'Crash the glass.',
};

/** Effects that went the opponent's way in the user's games, and the counter that answers each. */
const IMPACT_COUNTER: Record<string, string[]> = {
  'drop_pullup:o': ['cov-hedge', 'cov-ice'],
  'drop_pop:o': ['cov-switch'],
  'drop_handoff:o': ['cov-switch'],
  'switch_mismatch:o': ['cov-drop'],
  'hedge_roll:o': ['cov-drop'],
  'blitz_4v3:o': ['cov-hedge'],
  'help_kick:o': ['help-low'],
  'help_paint:o': ['help-high'],
  'crash_leak:o': ['getback'],
  'getback:o': ['getback'],
  'physicality:o': ['physicality-down'],
  'transition:o': ['getback'],
};

interface Signal {
  text: string;
  weight: number;
}

/**
 * The scouting numbers for team `tid`: this season's, or last season's (labelled) while it has
 * played fewer than SCOUT_MIN_GAMES. Head-to-head covers the user's meetings with it this season and last.
 */
export function scoutData(league: League, tid: number): ScoutData {
  let agg = seasonAgg(league, league.season);
  let lastSeason = false;
  if ((agg.teams[tid]?.gp ?? 0) < SCOUT_MIN_GAMES) {
    const prev = seasonAgg(league, league.season - 1);
    if ((prev.teams[tid]?.gp ?? 0) >= SCOUT_MIN_GAMES) {
      agg = prev;
      lastSeason = true;
    }
  }
  const tm = agg.teams[tid];
  const r = (k: StatKey): Ranked => agg.ranked[k][tid] ?? { v: NaN, rank: league.teams.length };
  const n = league.teams.length;
  const gp = tm?.gp ?? 0;
  const enough = gp >= SCOUT_MIN_GAMES;
  const playTypes = playTypeRows(agg, tid, 'off');
  const defPlayTypes = playTypeRows(agg, tid, 'def');
  // key players: the projected rotation, with that season's numbers (here, or elsewhere for a newcomer)
  const players = projectedRotation(league, tid, 9).flatMap((p) => {
    const here = p.stats.find((s) => s.season === agg.season && s.tid === tid && !s.playoffs && s.gp > 0);
    const line = here ?? seasonTotals(p, agg.season);
    return line && line.gp > 0 ? [playerLine(league, line, tm?.ts ?? null, !here, p.pid)] : [];
  });
  const h2h = headToHead(league, tid);
  const d: ScoutData = {
    tid,
    season: agg.season,
    lastSeason,
    gp,
    enough,
    teams: n,
    pace: r('pace'),
    ortg: r('ortg'),
    drtg: r('drtg'),
    net: r('net'),
    off: { efg: r('efg'), tov: r('tov'), orb: r('orb'), ftr: r('ftr') },
    def: { efg: r('oEfg'), tov: r('oTov'), orb: r('oOrb'), ftr: r('oFtr') },
    threeRate: r('threeRate'),
    rimRate: r('rimRate'),
    ptGames: tm?.ptGames ?? 0,
    playTypes,
    defPlayTypes,
    players,
    h2h,
    tendencies: [],
    exploits: [],
    counters: {},
  };
  if (enough) read(league, d);
  else readHeadToHead(league, d, new Map());
  return d;
}

function headToHead(league: League, tid: number): ScoutData['h2h'] {
  const me = league.userTid;
  const games: HeadToHeadGame[] = [];
  const sums = new Map<string, number>();
  let tracked = 0;
  if (tid === me) return { games, won: 0, lost: 0, effects: [], tracked: 0 };
  for (const g of league.games) {
    if (g.type === 'allstar' || g.season < league.season - 1) continue;
    const home = g.home.tid === me && g.away.tid === tid;
    if (!home && !(g.away.tid === me && g.home.tid === tid)) continue;
    const us = home ? g.home.pts : g.away.pts;
    const them = home ? g.away.pts : g.home.pts;
    games.push({ gid: g.gid, season: g.season, day: g.day, won: us > them, us, them, home, ...(g.cup === 'final' ? { cupFinal: true } : {}) });
    if (!g.impacts) continue;
    tracked++;
    const side = home ? 0 : 1;
    for (const im of g.impacts) {
      const k = `${im.key}|${im.t === side ? 1 : 0}`;
      sums.set(k, (sums.get(k) ?? 0) + im.pts);
    }
  }
  games.sort((a, b) => a.season - b.season || a.day - b.day);
  const effects = [...sums.entries()]
    .map(([k, v]) => {
      const [key, f] = k.split('|');
      return { key, forUser: f === '1', perGame: v / tracked };
    })
    .filter((e) => IMPACT_TEXT[e.key])
    .sort((a, b) => b.perGame - a.perGame);
  return { games, won: games.filter((g) => g.won).length, lost: games.filter((g) => !g.won).length, effects, tracked };
}

/** Evidence from the user's own games against them: the effects that went their way. */
function readHeadToHead(league: League, d: ScoutData, counters: Map<string, Signal>) {
  const opp = league.teams[d.tid];
  // (the meetings the per-game numbers are over: this season's and last, playoffs included)
  const n = d.h2h.tracked;
  for (const e of d.h2h.effects) {
    if (e.forUser || e.perGame < 1 || !IMPACT_COUNTER[e.key]) continue;
    const text = `In your games against them: ${impactSentence(e.key, teamRef(opp), 'your team').replace(/\.$/, '')} (+${e.perGame.toFixed(1)} points a game for them over ${n === 1 ? 'one game' : `${n} games`}).`;
    for (const id of IMPACT_COUNTER[e.key]) backs(counters, id, text, 3 + e.perGame);
  }
  for (const [id, s] of counters) d.counters[id] = s.text;
}

/** Keep the strongest evidence for each counter. */
function backs(counters: Map<string, Signal>, id: string, text: string, weight: number) {
  const cur = counters.get(id);
  if (!cur || weight > cur.weight) counters.set(id, { text, weight });
}

function read(league: League, d: ScoutData) {
  const n = d.teams;
  const tendencies: Signal[] = [];
  const exploits: Signal[] = [];
  const counters = new Map<string, Signal>();
  /** Rank from the other end: 1 = the worst (most turnovers, most rebounds allowed...). */
  const worst = (x: Ranked) => n + 1 - x.rank;
  const off = (k: FinishType) => d.playTypes.find((x) => x.key === k && x.poss >= MIN_PT_POSS);
  const def = (k: FinishType) => d.defPlayTypes.find((x) => x.key === k && x.poss >= MIN_PT_POSS);
  const vsLeague = (row: PlayTypeRow) => `${ppp(row.ppp)} per possession (league ${ppp(row.base)})`;

  // ---- style
  if (d.pace.rank <= 3)
    tendencies.push({ text: `Play at ${most(d.pace.rank, 'fastest')} pace in the league (${d.pace.v.toFixed(1)} possessions a game).`, weight: 4 - d.pace.rank });
  else if (worst(d.pace) <= 3)
    tendencies.push({ text: `Play at ${most(worst(d.pace), 'slowest')} pace in the league (${d.pace.v.toFixed(1)} possessions a game).`, weight: 4 - worst(d.pace) });
  for (const row of d.playTypes) {
    if (row.key === 'misc' || row.share < 0.04 || row.shareRank > 3) continue;
    tendencies.push({
      text: `Run ${most(row.shareRank)} ${PT_NOUN[row.key]} in the league: ${pct0(row.share)} of their possessions, ${ppp(row.ppp)} points each (league ${ppp(row.base)}).`,
      weight: 5 - row.shareRank,
    });
  }
  if (d.threeRate.rank <= 3)
    tendencies.push({ text: `Live behind the arc: ${pct0(d.threeRate.v)} of their shots are threes, ${most(d.threeRate.rank)} in the league.`, weight: 4 - d.threeRate.rank });
  if (d.rimRate.rank <= 3)
    tendencies.push({ text: `Get to the rim: ${pct0(d.rimRate.v)} of their shots come there, ${most(d.rimRate.rank)} in the league.`, weight: 4 - d.rimRate.rank });
  if (d.off.orb.rank <= 3)
    tendencies.push({ text: `Crash the offensive glass: they rebound ${pct0(d.off.orb.v)} of their misses, ${most(d.off.orb.rank)} in the league.`, weight: 4 - d.off.orb.rank });
  if (d.off.ftr.rank <= 3)
    tendencies.push({ text: `Get to the line: ${d.off.ftr.v.toFixed(2)} free throws per shot, ${most(d.off.ftr.rank)} in the league.`, weight: 4 - d.off.ftr.rank });
  if (d.def.tov.rank <= 3)
    tendencies.push({ text: `Force turnovers on ${pct1(d.def.tov.v)} of opponents' possessions, ${most(d.def.tov.rank)} in the league.`, weight: 4 - d.def.tov.rank });
  // "the league's best offense", "the league's 2nd-best"
  const best = (k: number) => (k === 1 ? 'best' : `${nth(k)}-best`);
  if (d.ortg.rank <= 3) tendencies.push({ text: `Score ${d.ortg.v.toFixed(1)} points per 100 possessions, the league's ${best(d.ortg.rank)} offense.`, weight: 3.5 - d.ortg.rank });
  if (d.drtg.rank <= 3) tendencies.push({ text: `Allow ${d.drtg.v.toFixed(1)} points per 100 possessions, the league's ${best(d.drtg.rank)} defense.`, weight: 3.5 - d.drtg.rank });
  // the player who swings them most (enough minutes on and off to mean something)
  const swing = d.players
    .filter((p) => p.on !== undefined && p.off !== undefined && p.onPoss >= 300 && p.offPoss >= 200)
    .sort((a, b) => Math.abs(b.on! - b.off!) - Math.abs(a.on! - a.off!))[0];
  if (swing && Math.abs(swing.on! - swing.off!) >= 8) {
    const gap = swing.on! - swing.off!;
    tendencies.push({
      text: `${gap > 0 ? 'Much better' : 'Worse'} with ${swing.name} on the floor: ${gap > 0 ? '+' : ''}${gap.toFixed(1)} net rating per 100 possessions on vs off.`,
      weight: Math.abs(gap) / 10,
    });
  }

  // ---- their offense: what the user's defense should take away
  const bh = off('pnrBH');
  if (bh && bh.z >= 2) for (const id of ['cov-hedge', 'cov-ice']) backs(counters, id, `Their pick-and-roll ball handlers score ${vsLeague(bh)}.`, bh.z);
  const roll = off('pnrRoll');
  if (roll && roll.z >= 2) for (const id of ['cov-drop', 'cov-ice']) backs(counters, id, `Their roll and pop men score ${vsLeague(roll)}.`, roll.z);
  const spot = off('spotup');
  if (spot && spot.z >= 2) backs(counters, 'help-low', `Their spot-up shooters score ${vsLeague(spot)}.`, spot.z);
  if (d.threeRate.rank <= 5) backs(counters, 'help-low', `${pct0(d.threeRate.v)} of their shots are threes, ${most(d.threeRate.rank)} in the league.`, 6 - d.threeRate.rank);
  const iso = off('iso');
  if (iso && iso.z >= 2) backs(counters, 'star-deny', `Their isolations score ${vsLeague(iso)}.`, iso.z);
  const post = off('post');
  if (post && post.z >= 2) backs(counters, 'help-high', `Their post-ups score ${vsLeague(post)}.`, post.z);
  if (d.rimRate.rank <= 5 && worst(d.threeRate) <= 10)
    backs(
      counters,
      'help-high',
      `${pct0(d.rimRate.v)} of their shots come at the rim (${most(d.rimRate.rank)} in the league) and only ${pct0(d.threeRate.v)} from three.`,
      6 - d.rimRate.rank,
    );
  if (worst(d.threeRate) <= 5)
    backs(counters, 'zone', `They rarely shoot threes: ${pct0(d.threeRate.v)} of their shots, ${most(worst(d.threeRate), 'fewest')} in the league.`, 6 - worst(d.threeRate));
  const tr = d.playTypes.find((x) => x.key === 'transition');
  if (tr && (tr.shareRank <= 5 || (tr.poss >= MIN_PT_POSS && tr.z >= 2)))
    backs(
      counters,
      'getback',
      `They run: ${pct0(tr.share)} of their possessions in transition (${most(tr.shareRank)} in the league), ${ppp(tr.ppp)} points each.`,
      Math.max(6 - tr.shareRank, tr.z),
    );
  if (d.off.ftr.rank <= 5)
    backs(counters, 'physicality-down', `They live at the line: ${d.off.ftr.v.toFixed(2)} free throws per shot, ${most(d.off.ftr.rank)} in the league.`, 6 - d.off.ftr.rank);
  if (worst(d.off.tov) <= 5) {
    const text = `They turn it over on ${pct1(d.off.tov.v)} of their possessions, ${most(worst(d.off.tov))} in the league.`;
    for (const id of ['pressure-up', 'press-on']) backs(counters, id, text, 6 - worst(d.off.tov));
    exploits.push({
      text: `Loose with the ball: ${pct1(d.off.tov.v)} of their possessions end in a turnover, ${most(worst(d.off.tov))} in the league. Pressure them.`,
      weight: 6 - worst(d.off.tov),
    });
  }
  const star = [...d.players].filter((p) => !p.elsewhere && p.min >= 20).sort((a, b) => b.usg - a.usg)[0];
  if (star && star.usg >= 0.3) {
    d.star = star.pid;
    for (const id of ['star-double', 'star-deny']) backs(counters, id, `${star.name} uses ${pct0(star.usg)} of their possessions when he plays.`, 2 + (star.usg - 0.3) * 20);
  }

  // ---- their defense: what the user's offense should attack
  for (const row of d.defPlayTypes) {
    if (row.key === 'misc' || row.poss < MIN_PT_POSS || row.z < 2) continue;
    exploits.push({ text: `Their defense gives up ${vsLeague(row)} on ${PT_NOUN[row.key]}. ${PT_ATTACK[row.key] ?? ''}`.trim(), weight: row.z });
  }
  const dBh = def('pnrBH');
  if (dBh && dBh.z >= 2) backs(counters, 'vs-drop', `Their defense gives up ${vsLeague(dBh)} on pick-and-roll ball-handler plays.`, dBh.z);
  const dSpot = def('spotup');
  if (dSpot && dSpot.z >= 2) backs(counters, 'vs-pack', `Their defense gives up ${vsLeague(dSpot)} on spot-up shots.`, dSpot.z);
  const dPost = def('post');
  if (dPost && dPost.z >= 2) backs(counters, 'post-up', `Their defense gives up ${vsLeague(dPost)} on post-ups.`, dPost.z);
  const dIso = def('iso');
  if (dIso && dIso.z >= 2) backs(counters, 'vs-switch', `Their defense gives up ${vsLeague(dIso)} on isolations.`, dIso.z);
  const dCut = def('cut');
  if (dCut && dCut.z >= 2) backs(counters, 'vs-pressure', `Cutters score ${vsLeague(dCut)} against them.`, dCut.z);
  if (d.def.tov.rank <= 5)
    backs(counters, 'vs-pressure', `They force turnovers on ${pct1(d.def.tov.v)} of possessions, ${most(d.def.tov.rank)} in the league.`, 6 - d.def.tov.rank);
  const dTr = def('transition');
  if (dTr && dTr.z >= 2) backs(counters, 'pace-up', `Opponents score ${vsLeague(dTr)} in transition against them.`, dTr.z);
  if (worst(d.def.efg) <= 5) {
    exploits.push({ text: `Opponents shoot an effective ${pct1(d.def.efg.v)} against them, ${most(worst(d.def.efg), 'worst')} in the league.`, weight: 6 - worst(d.def.efg) });
    backs(counters, 'vs-pack', `Opponents shoot an effective ${pct1(d.def.efg.v)} against them, ${most(worst(d.def.efg), 'worst')} in the league.`, 6 - worst(d.def.efg));
  }
  if (worst(d.def.orb) <= 5) {
    const text = `Opponents rebound ${pct0(d.def.orb.v)} of their misses against them, ${most(worst(d.def.orb))} in the league.`;
    exploits.push({ text: `Weak on the defensive glass: ${text.charAt(0).toLowerCase()}${text.slice(1, -1)}. Crash the boards.`, weight: 6 - worst(d.def.orb) });
    backs(counters, 'crash', text, 6 - worst(d.def.orb));
  }
  if (worst(d.def.ftr) <= 5) {
    const text = `They foul: opponents get ${d.def.ftr.v.toFixed(2)} free throws per shot, ${most(worst(d.def.ftr))} in the league.`;
    exploits.push({ text: `${text} Attack the rim.`, weight: 6 - worst(d.def.ftr) });
    backs(counters, 'attack-rim', text, 6 - worst(d.def.ftr));
  }

  // ---- players
  const volume = [...d.players].filter((p) => !p.elsewhere && p.gp >= SCOUT_MIN_GAMES && p.min >= 20).sort((a, b) => b.usg - a.usg)[0];
  if (volume && volume.usg >= 0.25 && volume.ts < 0.54)
    exploits.push({
      text: `${volume.name} uses ${pct0(volume.usg)} of their possessions at ${pct1(volume.ts)} true shooting: let him shoot, and take away everyone else.`,
      weight: 2 + (0.54 - volume.ts) * 40,
    });
  const brick = d.players.filter((p) => p.min >= 15 && p.fta >= 2 && p.ft < 0.6).sort((a, b) => a.ft - b.ft)[0];
  if (brick) exploits.push({ text: `${brick.name} makes ${pct0(brick.ft)} of his free throws: a Hack-a candidate late in quarters.`, weight: 1.5 + (0.6 - brick.ft) * 10 });

  readHeadToHead(league, d, counters);
  d.tendencies = tendencies
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6)
    .map((x) => x.text);
  d.exploits = exploits
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map((x) => x.text);
}
