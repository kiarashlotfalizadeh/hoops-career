// Matchup preview: what's worth knowing about a scheduled game before tip-off (records and
// ranks, who is out or resting, the projected starters and matchups, how the opponent plays, the
// season series, playoff stakes and a projection), for Home's next-game card and the pre-game
// screen. It only reads the league: the projected lineups come from a throwaway game on a fixed
// seed, never from the league's random stream. Callers run ensureRotation on both teams first, so
// the starters are the ones the real game will start.

import type { GameType, League, Player, Pos, ScheduledGame, TeamSeason } from '../types';
import { GameSim } from '../sim/engine';
import { Rng } from '../random';
import { buildSimInput, neutralSite } from '../league/games';
import { playerName } from '../league/helpers';
import { standings } from '../league/standings';
import { seriesLabel } from '../league/playoffs';
import { planFor } from '../league/gamePlans';
import { scoutTeam } from '../ai/advisor';
import { COVERAGE_META, DEF_PRESETS, OFF_PRESETS, PRESS_META, SCHEME_META } from '../sim/tactics';
import { FINISH_LABEL, type FinishType } from '../sim/log';
import { playTypeBaselines, seasonPlayTypes, zScore } from './playTypes';

/** Net rating per point of a rotation's minutes-weighted OVR above the league's (fitted over simulated seasons, r ≈ 0.8). */
export const TALENT_NET = 1.7;
/** Games of this season's net rating that weigh as much as the talent prior (the blend predicts a season's final net best). */
export const PRIOR_GAMES = 15;
/** Points a home team gains in the engine (about 1.3, a 54% home win rate). */
export const HOME_EDGE = 1.3;
/** Spread of game margins for a given matchup (the engine's, like the NBA's, is near 13). */
export const MARGIN_SD = 13;

export interface PreviewPlayer {
  pid: number;
  name: string;
  pos: Pos;
  ovr: number;
}

/** A season number and where it ranks in the league (1 = best; 0 before the team has played). */
export interface Ranked {
  v: number;
  rank: number;
}

export interface PlayTypeTendency {
  key: string;
  label: string;
  poss: number;
  /** Share of their possessions that finish this way. */
  share: number;
  ppp: number;
  /** The league's points per possession for this type this season. */
  base: number;
  /** How unusual their efficiency is, in standard errors. */
  z: number;
}

export interface SidePreview {
  tid: number;
  won: number;
  lost: number;
  conf: 'E' | 'W';
  confRank: number;
  /** Games behind the conference leader. */
  gb: number;
  streak: number;
  /** "7-3". */
  lastTen: string;
  ortg: Ranked;
  drtg: Ranked;
  net: Ranked;
  /** Possessions per game (rank 1 = fastest). */
  pace: Ranked;
  /** Three-point attempts per game (rank 1 = most). */
  threes: Ranked;
  /** Second night of a back-to-back. */
  b2b: boolean;
  /** Injured players, worst first. */
  out: (PreviewPlayer & { injury: string; games: number })[];
  /** Healthy players held out to rest (back-to-backs). */
  resting: PreviewPlayer[];
  /** Healthy players with heavy legs (wear 55+), who play a little worse and get hurt more. */
  worn: (PreviewPlayer & { wear: number })[];
  /** The five on the floor for the tip, with the usual starter each one stands in for. */
  starters: (PreviewPlayer & { for?: PreviewPlayer })[];
  /** How their possessions have finished this season, most used first. */
  playTypes: PlayTypeTendency[];
  offense: { preset: string; pace: number; threePoint: number };
  defense: { preset: string; scheme: string; coverage: string | null; press: string | null; help: number; pressure: number };
  /** The head coach and how often he changes things in a game (an AI coach acts at a break or timeout with this chance). */
  coach: { name: string; rating: number; chance: number; adjusts: 'often' | 'sometimes' | 'rarely' | null };
}

export interface PreviewThreat {
  pid: number;
  name: string;
  why: string;
  /** Who guards him at tip-off (null: he doesn't start). */
  guard: PreviewPlayer | null;
  /** The defender the game plan assigns him, if any. */
  planned: PreviewPlayer | null;
  starts: boolean;
  resting: boolean;
}

export interface Meeting {
  gid: number;
  day: number;
  /** The reference side played at home. */
  home: boolean;
  us: number;
  them: number;
  won: boolean;
}

export interface SeasonSeries {
  won: number;
  lost: number;
  /** Regular-season meetings already played, oldest first. */
  games: Meeting[];
  /** Regular-season meetings still to play (this one included when it is one). */
  left: number;
  /** This game's number among the season's meetings (regular-season games only). */
  meeting?: number;
  total: number;
}

export interface SeriesState {
  id: string;
  /** "East First Round". */
  label: string;
  /** "R1 · Game 5", "Finals · Game 2". */
  tag: string;
  round: number;
  game: number;
  wins: number;
  losses: number;
  /** The reference side's season ends with a loss. */
  elimination: boolean;
  /** A win takes the series. */
  clinch: boolean;
  homeCourt: boolean;
}

export interface PlayInState {
  id: string;
  elimination: boolean;
  /** What's at stake: "The winner is the 7th seed; the loser gets another chance." */
  note: string;
}

export interface Projection {
  /** Points the reference side is projected to win by (negative: lose by), home court included. */
  margin: number;
  /** Chance the reference side wins. */
  win: number;
  /** Net ratings per 100 possessions behind it: this season's, regressed toward what each roster's talent tonight suggests. */
  netUs: number;
  netThem: number;
  /** Home-court points in the margin (positive: the reference side's). */
  edge: number;
}

export interface MatchupPreview {
  gid: number;
  day: number;
  type: GameType;
  seriesId?: string;
  /** Days until tip-off (0: today). */
  days: number;
  neutral: boolean;
  home: number;
  away: number;
  /** The user's team plays: `us` is the user's side, otherwise the home team's. */
  userGame: boolean;
  usHome: boolean;
  us: SidePreview;
  them: SidePreview;
  /** Their key players and who of ours guards them at tip-off. */
  threats: PreviewThreat[];
  series: SeasonSeries;
  playoff?: SeriesState;
  playIn?: PlayInState;
  projection: Projection;
}

const preview = (p: Player): PreviewPlayer => ({ pid: p.pid, name: playerName(p), pos: p.pos, ovr: p.ovr });

const lastTenText = (ts: TeamSeason | undefined) => (ts ? `${ts.lastTen.filter((x) => x === 1).length}-${ts.lastTen.filter((x) => x === 0).length}` : '0-0');

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, error under 1.5e-7). */
function phi(x: number) {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Chance of winning a game projected at `margin` points. */
export const winChance = (margin: number) => phi(margin / MARGIN_SD);

/**
 * A team's net rating estimate: this season's per-100 net, weighted by games played against a
 * prior from tonight's rotation talent (`talent`: its minutes-weighted OVR above the league's).
 */
export function blendNet(net: number, gp: number, talent: number) {
  const w = gp / (gp + PRIOR_GAMES);
  return w * net + (1 - w) * talent * TALENT_NET;
}

/** The projected margin for `us`: the net ratings' difference at the game's pace, plus home court (`edge`). */
export function projectMargin(netUs: number, netThem: number, pace: number, edge: number) {
  return ((netUs - netThem) * pace) / 100 + edge;
}

/** Season ratings of every team that has played, ranked. */
function leagueRatings(league: League) {
  const rows = league.teams.map((t) => {
    const ts = t.seasons.find((s) => s.season === league.season);
    const gp = ts ? ts.won + ts.lost : 0;
    const ortg = ts?.poss ? (ts.ptsFor / ts.poss) * 100 : 0;
    const drtg = ts?.oppPoss ? (ts.ptsAgainst / ts.oppPoss) * 100 : 0;
    return { tid: t.tid, gp, ortg, drtg, net: ortg - drtg, pace: gp && ts ? ts.poss / gp : 0, threes: gp && ts ? ts.t.tpa / gp : 0 };
  });
  const played = rows.filter((r) => r.gp > 0);
  const rank = (tid: number, key: 'ortg' | 'drtg' | 'net' | 'pace' | 'threes', higherFirst = true): Ranked => {
    const r = rows[tid];
    if (!r.gp) return { v: 0, rank: 0 };
    const better = played.filter((o) => (higherFirst ? o[key] > r[key] : o[key] < r[key])).length;
    return { v: r[key], rank: better + 1 };
  };
  return { rows, rank };
}

/** Minutes-weighted OVR of every team's healthy rotation, for the league average the talent prior is measured from. */
function rotationTalent(league: League, tid: number) {
  const rot = league.teams[tid].rotation;
  let sum = 0;
  let min = 0;
  for (const pid of rot.order) {
    const p = league.players[pid];
    const m = rot.minutes[pid] ?? 0;
    if (!p || p.tid !== tid || p.injury || m <= 0) continue;
    sum += p.ovr * m;
    min += m;
  }
  return min ? sum / min : 0;
}

function playedOn(league: League, tid: number, day: number) {
  return league.schedule.some((g) => g.day === day && (g.home === tid || g.away === tid));
}

/** The usual starting five: most starts with the team this season, or the depth chart before anyone has started. */
function usualStarters(league: League, tid: number, roster: Player[]): Player[] {
  const gs = (p: Player) => p.stats.filter((s) => s.season === league.season && s.tid === tid && !s.real).reduce((a, s) => a + s.gs, 0);
  const starts = roster.map((p) => ({ p, n: gs(p) })).filter((x) => x.n > 0);
  if (starts.length >= 5)
    return starts
      .sort((a, b) => b.n - a.n || b.p.ovr - a.p.ovr)
      .map((x) => x.p)
      .slice(0, 5);
  const order = league.teams[tid].rotation.order;
  return order
    .map((pid) => league.players[pid])
    .filter((p): p is Player => !!p && p.tid === tid)
    .slice(0, 5);
}

const POS_IDX: Record<Pos, number> = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };

function side(
  league: League,
  sim: GameSim,
  s: 0 | 1,
  g: ScheduledGame,
  rest: number[],
  ratings: ReturnType<typeof leagueRatings>,
  row?: { confRank: number; gb: number },
): SidePreview {
  const st = sim.T[s];
  const tid = st.tid;
  const team = league.teams[tid];
  const ts = team.seasons.find((x) => x.season === league.season);
  const roster = Object.values(league.players).filter((p) => p.tid === tid);
  const byPid = (pid: number) => league.players[pid];
  // the five on the floor for the tip, by position, each matched to the usual starter he stands in for
  const five = st.players
    .filter((p) => p.starter)
    .map((p) => byPid(p.pid))
    .filter((p): p is Player => !!p)
    .sort((a, b) => POS_IDX[a.pos] - POS_IDX[b.pos]);
  const usual = usualStarters(league, tid, roster);
  const missing = usual.filter((p) => !five.includes(p));
  const starters = five.map((p) => {
    if (usual.includes(p) || !missing.length) return preview(p);
    const i = missing.reduce((best, m, j) => (Math.abs(POS_IDX[m.pos] - POS_IDX[p.pos]) < Math.abs(POS_IDX[missing[best].pos] - POS_IDX[p.pos]) ? j : best), 0);
    const [stood] = missing.splice(i, 1);
    return { ...preview(p), for: preview(stood) };
  });
  const injured = roster.filter((p) => p.injury && p.injury.gamesRemaining > 0);
  const restSet = new Set(rest);
  // play types as the season's games show them, against the league's points per possession
  const base = playTypeBaselines(league);
  const pts = seasonPlayTypes(league, tid).filter((x) => x.off.poss > 0 && x.key !== 'misc');
  const totalPoss = pts.reduce((a, x) => a + x.off.poss, 0) || 1;
  const playTypes = pts
    .map((x) => {
      const b = base[x.key] ?? 1;
      return {
        key: x.key,
        label: FINISH_LABEL[x.key as FinishType] ?? x.key,
        poss: x.off.poss,
        share: x.off.poss / totalPoss,
        ppp: x.off.pts / x.off.poss,
        base: b,
        z: zScore(x.off, b),
      };
    })
    .sort((a, b) => b.share - a.share);
  // (the tactics the game starts with: the user's include his game plan for this opponent)
  const t = st.t;
  const man = t.defense.scheme === 'man';
  const isUser = tid === league.userTid;
  const chance = isUser ? 0 : 0.15 + 0.6 * (team.coach.tactics / 100);
  return {
    tid,
    won: ts?.won ?? 0,
    lost: ts?.lost ?? 0,
    conf: team.conf,
    confRank: row?.confRank ?? 0,
    gb: row?.gb ?? 0,
    streak: ts?.streak ?? 0,
    lastTen: lastTenText(ts),
    ortg: ratings.rank(tid, 'ortg'),
    drtg: ratings.rank(tid, 'drtg', false),
    net: ratings.rank(tid, 'net'),
    pace: ratings.rank(tid, 'pace'),
    threes: ratings.rank(tid, 'threes'),
    b2b: playedOn(league, tid, g.day - 1),
    out: injured.sort((a, b) => b.ovr - a.ovr).map((p) => ({ ...preview(p), injury: p.injury!.type, games: p.injury!.gamesRemaining })),
    resting: roster.filter((p) => restSet.has(p.pid) && !injured.includes(p)).map(preview),
    worn: roster
      .filter((p) => p.wear >= 55 && !injured.includes(p))
      .sort((a, b) => b.wear - a.wear)
      .map((p) => ({ ...preview(p), wear: Math.round(p.wear) })),
    starters,
    playTypes,
    offense: { preset: OFF_PRESETS.find((x) => x.id === t.offPreset)?.name ?? 'Custom', pace: t.offense.pace, threePoint: t.offense.threePoint },
    defense: {
      preset: DEF_PRESETS.find((x) => x.id === t.defPreset)?.name ?? 'Custom',
      scheme: SCHEME_META[t.defense.scheme].label,
      coverage: man ? COVERAGE_META[t.defense.pnr].label : null,
      press: t.defense.press !== 'none' ? PRESS_META[t.defense.press].label : null,
      help: t.defense.help,
      pressure: t.defense.pressure,
    },
    coach: { name: team.coach.name, rating: team.coach.tactics, chance, adjusts: isUser ? null : chance >= 0.5 ? 'often' : chance >= 0.3 ? 'sometimes' : 'rarely' },
  };
}

/** Regular-season meetings of two teams this season, from `us`'s side. */
export function seasonSeries(league: League, us: number, them: number, gid?: number): SeasonSeries {
  const games: Meeting[] = [];
  for (const r of league.games) {
    if (r.season !== league.season || r.type !== 'regular') continue;
    const home = r.home.tid === us && r.away.tid === them;
    if (!home && !(r.away.tid === us && r.home.tid === them)) continue;
    const u = home ? r.home.pts : r.away.pts;
    const o = home ? r.away.pts : r.home.pts;
    games.push({ gid: r.gid, day: r.day, home, us: u, them: o, won: u > o });
  }
  games.sort((a, b) => a.day - b.day || a.gid - b.gid);
  const all = league.schedule
    .filter((g) => g.type === 'regular' && ((g.home === us && g.away === them) || (g.home === them && g.away === us)))
    .sort((a, b) => a.day - b.day || a.gid - b.gid);
  const at = gid === undefined ? -1 : all.findIndex((g) => g.gid === gid);
  return {
    won: games.filter((x) => x.won).length,
    lost: games.filter((x) => !x.won).length,
    games,
    left: all.filter((g) => !g.played).length,
    meeting: at >= 0 ? at + 1 : undefined,
    total: all.length,
  };
}

/** A playoff game's series as it stands going in, from `us`'s side. */
export function seriesState(league: League, g: Pick<ScheduledGame, 'seriesId' | 'type'>, us: number): SeriesState | undefined {
  if (g.type !== 'playoffs' || !g.seriesId) return undefined;
  const s = league.playoffs.find((x) => x.id === g.seriesId);
  if (!s) return undefined;
  const high = s.high === us;
  const wins = high ? s.highWins : s.lowWins;
  const losses = high ? s.lowWins : s.highWins;
  const game = s.highWins + s.lowWins + 1;
  return {
    id: s.id,
    label: seriesLabel(s),
    tag: `${s.round === 4 ? 'Finals' : `R${s.round}`} · Game ${game}`,
    round: s.round,
    game,
    wins,
    losses,
    elimination: losses === 3,
    clinch: wins === 3,
    homeCourt: high,
  };
}

function playInState(g: ScheduledGame): PlayInState | undefined {
  if (g.type !== 'playin' || !g.seriesId) return undefined;
  if (g.seriesId.endsWith('-78')) return { id: g.seriesId, elimination: false, note: 'The winner is the 7th seed; the loser gets another chance for the 8th.' };
  if (g.seriesId.endsWith('-910')) return { id: g.seriesId, elimination: true, note: 'The loser is out; the winner plays for the 8th seed.' };
  return { id: g.seriesId, elimination: true, note: 'The winner is the 8th seed; the loser is out.' };
}

export function matchupPreview(league: League, gid: number): MatchupPreview | null {
  const g = league.schedule.find((x) => x.gid === gid);
  if (!g) return null;
  const userGame = g.home === league.userTid || g.away === league.userTid;
  const usHome = !userGame || g.home === league.userTid;
  const [usTid, themTid] = usHome ? [g.home, g.away] : [g.away, g.home];
  const neutral = neutralSite(g);
  const homeIn = buildSimInput(league, g.home, g.day, g.type, g.away, g);
  const awayIn = buildSimInput(league, g.away, g.day, g.type, g.home, g);
  // a throwaway game on a fixed seed: setting one up plans both rotations and matchups for the tip, and draws nothing from the league
  const sim = new GameSim(homeIn, awayIn, { rng: new Rng(1), type: g.type, injuries: false, neutral });
  const ratings = leagueRatings(league);
  const rows = new Map(standings(league).map((r) => [r.tid, r]));
  const sHome = side(league, sim, 0, g, homeIn.rest ?? [], ratings, rows.get(g.home));
  const sAway = side(league, sim, 1, g, awayIn.rest ?? [], ratings, rows.get(g.away));
  const [us, them] = usHome ? [sHome, sAway] : [sAway, sHome];
  const usSide: 0 | 1 = usHome ? 0 : 1;
  const usT = sim.T[usSide];
  const themT = sim.T[1 - usSide];
  // their key players and who of ours has them at the tip (the defense's guardOf names our defender)
  const plan = userGame ? planFor(league, themTid, g) : null;
  const threats: PreviewThreat[] = scoutTeam(league, themTid).threats.map((th) => {
    const sp = themT.byId.get(th.pid);
    const d = sp?.on ? usT.guardOf.get(th.pid) : undefined;
    const planned = plan?.matchups?.[th.pid];
    const dp = d ? league.players[d.pid] : undefined;
    const pp = planned !== undefined ? league.players[planned] : undefined;
    return { pid: th.pid, name: th.name, why: th.why, guard: dp ? preview(dp) : null, planned: pp ? preview(pp) : null, starts: !!sp?.starter, resting: sp?.dnp === 'Rest' };
  });
  // projection: each side's net rating regressed toward tonight's rotation talent, at the two teams' pace
  const avgTalent = league.teams.reduce((a, t) => a + rotationTalent(league, t.tid), 0) / Math.max(1, league.teams.length);
  const tonight = (s: 0 | 1) => {
    let sum = 0;
    let min = 0;
    for (const p of sim.T[s].players) {
      if (p.out || !p.planMin) continue;
      sum += (league.players[p.pid]?.ovr ?? 0) * p.planMin;
      min += p.planMin;
    }
    return min ? sum / min - avgTalent : 0;
  };
  const est = (s: SidePreview, at: 0 | 1) => blendNet(s.net.v, s.won + s.lost, tonight(at));
  const netUs = est(us, usSide);
  const netThem = est(them, (1 - usSide) as 0 | 1);
  const paces = [us, them].filter((x) => x.pace.rank).map((x) => x.pace.v);
  const pace = paces.length ? paces.reduce((a, b) => a + b, 0) / paces.length : 100;
  const edge = neutral ? 0 : usHome ? HOME_EDGE : -HOME_EDGE;
  const margin = projectMargin(netUs, netThem, pace, edge);
  return {
    gid: g.gid,
    day: g.day,
    type: g.type,
    seriesId: g.seriesId,
    days: g.day - league.day,
    neutral,
    home: g.home,
    away: g.away,
    userGame,
    usHome,
    us,
    them,
    threats,
    series: seasonSeries(league, usTid, themTid, g.gid),
    playoff: seriesState(league, g, usTid),
    playIn: playInState(g),
    projection: { margin, win: winChance(margin), netUs, netThem, edge },
  };
}

/** "Today", "Tomorrow", "In 3 days". */
export function countdownLabel(days: number) {
  return days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
}
