// Matchup preview: what's worth knowing about a scheduled game before tip-off (records and
// ranks, who is out or resting, the projected starters and matchups, how the opponent plays, the
// season series, playoff stakes and a projection), for Home's next-game card and the pre-game
// screen. It only reads the league: the projected lineups come from a throwaway game on a fixed
// seed, never from the league's random stream. Callers run ensureRotation on both teams first, so
// the starters are the ones the real game will start.

import type { GameType, League, Player, Pos, ScheduledGame, TeamSeason } from '../types';
import type { Ranked } from './projection';
import { GameSim } from '../sim/engine';
import { Rng } from '../random';
import { buildSimInput, neutralSite } from '../league/games';
import { playerName } from '../league/helpers';
import { standings } from '../league/standings';
import { seriesLabel } from '../league/playoffs';
import { planFor } from '../league/gamePlans';
import { clearedToPlay, isQuestionable } from '../league/injuries';
import { scoutTeam } from '../ai/advisor';
import { oppPlanIn, type OppPlanItem } from '../ai/opponentPlan';
import { COVERAGE_META, DEF_PRESETS, OFF_PRESETS, PRESS_META, SCHEME_META } from '../sim/tactics';
import { FINISH_LABEL, type FinishType } from '../sim/log';
import { playTypeBaselines, seasonPlayTypes, zScore } from './playTypes';
import { leagueRatings, projectGame, winChance } from './projection';

// (the projection lives in ./projection, which the game pipeline uses too)

/** A playoff round as the schedule's tags name it ("1st Round G4"). */
const ROUND_TAG = ['Play-In', '1st Round', '2nd Round', 'Conf. Finals', 'Finals'];
export { blendNet, HOME_EDGE, MARGIN_SD, PRIOR_GAMES, projectGame, projectMargin, TALENT_NET, winChance, type Ranked } from './projection';

export interface PreviewPlayer {
  pid: number;
  name: string;
  pos: Pos;
  ovr: number;
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
  /** Injured players, worst first (the user's questionable ones for his next game are listed apart). */
  out: (PreviewPlayer & { injury: string; games: number })[];
  /**
   * The user's team, its next game: players one game from returning from a minor or moderate
   * injury (see isQuestionable), who sit unless he clears them (`cleared`).
   */
  questionable: (PreviewPlayer & { injury: string; cleared: boolean })[];
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
  /** "1st Round · Game 5", "Finals · Game 2" (the rounds as the schedule names them). */
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
  /** What their coach changes from his usual tactics for this game against the user's team, when he game-plans for it. */
  oppPlan?: OppPlanItem[];
  series: SeasonSeries;
  playoff?: SeriesState;
  playIn?: PlayInState;
  projection: Projection;
}

const preview = (p: Player): PreviewPlayer => ({ pid: p.pid, name: playerName(p), pos: p.pos, ovr: p.ovr });

const lastTenText = (ts: TeamSeason | undefined) => (ts ? `${ts.lastTen.filter((x) => x === 1).length}-${ts.lastTen.filter((x) => x === 0).length}` : '0-0');

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
  // game-time decisions are the user's, for his next game
  const decides = tid === league.userTid && nextUserGame(league)?.gid === g.gid;
  const questionable = decides ? injured.filter(isQuestionable) : [];
  const cleared = new Set(clearedToPlay(league, g.gid));
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
  // the user's tactics as the game starts them, his game plan for this opponent included; an AI
  // team's usual ones, as its scouting reads them (a plan of its coach's for this game is listed apart)
  const isUser = tid === league.userTid;
  const t = isUser ? st.t : team.tactics;
  const man = t.defense.scheme === 'man';
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
    out: injured
      .filter((p) => !questionable.includes(p))
      .sort((a, b) => b.ovr - a.ovr)
      .map((p) => ({ ...preview(p), injury: p.injury!.type, games: p.injury!.gamesRemaining })),
    questionable: questionable.sort((a, b) => b.ovr - a.ovr).map((p) => ({ ...preview(p), injury: p.injury!.type, cleared: cleared.has(p.pid) })),
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
function seasonSeries(league: League, us: number, them: number, gid?: number): SeasonSeries {
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
function seriesState(league: League, g: Pick<ScheduledGame, 'seriesId' | 'type'>, us: number): SeriesState | undefined {
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
    tag: `${ROUND_TAG[s.round] ?? 'Playoffs'} · Game ${game}`,
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

/**
 * A scheduled game set up as it will tip off: both sides' inputs and a throwaway game on a fixed
 * seed (setting one up plans both rotations and matchups for the tip, and draws nothing from the league).
 */
function setUpGame(league: League, g: ScheduledGame) {
  const neutral = neutralSite(g);
  const homeIn = buildSimInput(league, g.home, g.day, g.type, g.away, g);
  const awayIn = buildSimInput(league, g.away, g.day, g.type, g.home, g);
  const sim = new GameSim(homeIn, awayIn, { rng: new Rng(1), type: g.type, injuries: false, neutral });
  return { sim, homeIn, awayIn, neutral };
}

/**
 * A scheduled game's win chance before tip-off, from the home side: the matchup preview's projection
 * (and the one the game keeps), so every screen that quotes one quotes the same number. Pass
 * `ratings` when projecting a day's games.
 */
export function gameProjection(league: League, g: ScheduledGame, ratings = leagueRatings(league)): { margin: number; win: number } {
  const { sim, neutral } = setUpGame(league, g);
  const { margin } = projectGame(league, sim, neutral, ratings);
  return { margin, win: winChance(margin) };
}

export function matchupPreview(league: League, gid: number): MatchupPreview | null {
  const g = league.schedule.find((x) => x.gid === gid);
  if (!g) return null;
  const userGame = g.home === league.userTid || g.away === league.userTid;
  const usHome = !userGame || g.home === league.userTid;
  const [usTid, themTid] = usHome ? [g.home, g.away] : [g.away, g.home];
  const { sim, homeIn, awayIn, neutral } = setUpGame(league, g);
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
  const proj = projectGame(league, sim, neutral, ratings);
  const [netUs, netThem] = usHome ? [proj.netHome, proj.netAway] : [proj.netAway, proj.netHome];
  const edge = usHome ? proj.edge : -proj.edge;
  const margin = usHome ? proj.margin : -proj.margin;
  // the plan their coach brings to this game, as the game itself will set it up
  const theirPlan = userGame ? oppPlanIn(sim, (1 - usSide) as 0 | 1) : undefined;
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
    ...(theirPlan ? { oppPlan: theirPlan.items } : {}),
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

/** The user's next game: today's if there is one, else the first unplayed one ahead (none outside the season's games). */
export function nextUserGame(league: League): ScheduledGame | undefined {
  if (league.phase !== 'regular' && league.phase !== 'playin' && league.phase !== 'playoffs') return undefined;
  return league.schedule
    .filter((g) => !g.played && g.day >= league.day && (g.home === league.userTid || g.away === league.userTid))
    .sort((a, b) => a.day - b.day || a.gid - b.gid)[0];
}
