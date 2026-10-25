// Difficulty presets: one table for everything the difficulty changes, so every system reads the
// same numbers and the New League and Settings screens can show them side by side.
import type { League, Settings } from '../types';
import { clamp } from '../random';
import { ROSTER_NET, rosterWorth } from '../analysis/worth';

export type Difficulty = Settings['difficulty'];

export interface DifficultyPreset {
  label: string;
  /** One line for the picker. */
  line: string;
  /**
   * What AI GMs need back in a trade, as a share of fair value: under 1 takes a little less (the
   * user's own assets only, never ones he got in a trade this season), over 1 wants a premium.
   */
  tradeAsk: number;
  /** What the user's own players and free agents ask of the user's team, as a share of their market price. */
  contractAsk: number;
  /** AI coaches who game-plan against the user: 'never', 'sometimes' (by tactics rating) or 'always'. */
  opponentPlans: 'never' | 'sometimes' | 'always';
  /** How fast the owner's patience runs out: scales how far a season's grade moves his standing. */
  ownerPressure: number;
  /**
   * On the court: points a game the user's team gains (or, under 0, its opponents gain) over what
   * the rosters and the tactics are worth, as home court is (see courtEdge): opponents who raise
   * their game for you on Hard, a little slack on Easy. For a team of average strength: see courtGrowth.
   */
  court: number;
  /**
   * How `court` grows with the user's team: its share more for each point of projected net rating
   * (see userCourtPoints), between COURT_RANGE's half and two and a half times it. 0 keeps it flat.
   */
  courtGrowth: number;
  /** The least the owner's win goal asks, as a win% (see ownerGoals.ts). */
  winFloor: number;
  /** Seasons in a row the owner accepts a rebuild (no postseason goal) before he wants the play-in. */
  rebuildSeasons: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyPreset> = {
  easy: {
    label: 'Easy',
    line: 'Deals 12% under value go through, players ask 10% less, no opponent game plans, a 1.5-point edge on the court, a patient owner.',
    tradeAsk: 0.88,
    contractAsk: 0.9,
    opponentPlans: 'never',
    ownerPressure: 0.7,
    court: 1.5,
    courtGrowth: 0,
    winFloor: 0.25,
    rebuildSeasons: 3,
  },
  normal: {
    label: 'Normal',
    line: 'Fair value in trades and contracts. About half your opponents game-plan for you.',
    tradeAsk: 1,
    contractAsk: 1,
    opponentPlans: 'sometimes',
    ownerPressure: 1,
    court: 0,
    courtGrowth: 0,
    winFloor: 0.3,
    rebuildSeasons: 2,
  },
  hard: {
    label: 'Hard',
    line: 'AI GMs want a 12% premium, players ask 12% more, every coach game-plans you, opponents play 1 to 5 points a game better against you (the better your team, the more), an impatient owner.',
    tradeAsk: 1.12,
    contractAsk: 1.12,
    opponentPlans: 'always',
    ownerPressure: 1.3,
    court: -2,
    courtGrowth: 0.125,
    winFloor: 0.35,
    rebuildSeasons: 1,
  },
};

export const DIFFICULTIES = Object.keys(DIFFICULTY) as Difficulty[];

export const preset = (league: Pick<League, 'settings'>): DifficultyPreset => DIFFICULTY[league.settings.difficulty] ?? DIFFICULTY.normal;

/**
 * Field-goal percentage that moves a game's margin a point, split between the two sides' shots:
 * measured over 3,000 games a side at each setting (home court's own rate, 0.0117 / HOME_EDGE,
 * moved it 0.85 of a point). At this rate Hard's 2 points measured 2.2, Easy's 1.5 measured 1.6.
 */
const FG_PER_POINT = 0.0076;

/**
 * How far the edge on the court can move from the preset's `court` as it grows with the user's team:
 * half of it for the weakest (Hard's 2 points a game cost an average team about 4 wins, so a bad one
 * that keeps 1 isn't buried for it), two and a half times it for the strongest.
 */
export const COURT_RANGE: [number, number] = [0.5, 2.5];

/**
 * Projected net rating (points per 100 possessions) of the user's team: what its roster is worth
 * over the rest of the regular season against the league's average roster, at the season
 * forecast's rate (ROSTER_NET). The roster alone, not its record, which the edge itself moves.
 */
export function userProjectedNet(league: Pick<League, 'players' | 'teams' | 'userTid' | 'season'>): number {
  const rosters = league.teams.map((): League['players'][number][] => []);
  for (const p of Object.values(league.players)) if (p.tid >= 0 && p.tid < rosters.length) rosters[p.tid].push(p);
  const ts = league.teams[league.userTid]?.seasons.find((s) => s.season === league.season);
  const left = Math.max(1, 82 - (ts ? ts.won + ts.lost : 0));
  const worth = rosters.map((r) => rosterWorth(r, left));
  const avg = worth.reduce((a, b) => a + b, 0) / Math.max(1, worth.length);
  return ROSTER_NET * ((worth[league.userTid] ?? avg) - avg);
}

/**
 * Points a game the difficulty gives the user's team (under 0, takes from it) in each of his games.
 * Flat on Easy; on Hard it grows with his team's projected strength (courtGrowth): an average
 * roster's opponents play 2 points a game better, the opening night's Thunder's (+9 by this measure,
 * a 66-win team) 4.2, a juggernaut's 5, while a lottery team's play 1 better. Over 24 opening
 * seasons each, Hard against Normal cost the Thunder 8 wins (66.5 to 58.5), the Lakers (average) 2.7
 * and the Nets (20 wins) 1.8; at a flat 2 points it had cost them 3.3, 2.0 and 4.5: the contender,
 * whose wins were safest, felt it least.
 */
export function userCourtPoints(league: Pick<League, 'settings' | 'players' | 'teams' | 'userTid' | 'season'>): number {
  const d = DIFFICULTY[league.settings.difficulty] ?? DIFFICULTY.normal;
  if (!d.court || !d.courtGrowth) return d.court;
  const grown = d.court * (1 + d.courtGrowth * userProjectedNet(league));
  const [lo, hi] = [d.court * COURT_RANGE[0], d.court * COURT_RANGE[1]];
  return clamp(grown, Math.min(lo, hi), Math.max(lo, hi));
}

/** Points a game the difficulty gives team `tid` in a game against `opp` (the user's side; 0 for a game he isn't in). */
export function courtPoints(league: Pick<League, 'settings' | 'players' | 'teams' | 'userTid' | 'season'>, tid: number, opp: number): number {
  if (tid !== league.userTid && opp !== league.userTid) return 0;
  const pts = userCourtPoints(league);
  return tid === league.userTid ? pts : -pts;
}

/**
 * The difficulty's edge on the court for a game (SimOptions.edge): field-goal percentage added to
 * each side's shots (home first), half of it to the user's and half taken off his opponent's.
 * Undefined for a game he isn't in, or on Normal.
 */
export function courtEdge(league: Pick<League, 'settings' | 'players' | 'teams' | 'userTid' | 'season'>, home: number, away: number): [number, number] | undefined {
  const pts = courtPoints(league, home, away);
  return pts ? [(pts / 2) * FG_PER_POINT, (-pts / 2) * FG_PER_POINT] : undefined;
}

// ---------------------------------------------------------------- changing it mid-career

/**
 * A change to the difficulty or to job security from Settings. One that could ease a season under way
 * (any new difficulty: its owner's grace, its edge on the court, its asks; job security turned off)
 * waits for the next opening night (Settings.pending, see applyPendingSettings), so it can't dodge a
 * review or a firing; job security turned back on counts at once. Choosing what's in force again
 * cancels the wait.
 */
export function requestSetting(league: Pick<League, 'settings'>, k: 'difficulty' | 'jobSecurity', v: Difficulty | boolean) {
  const st = league.settings;
  const pending = { ...st.pending };
  if (k === 'difficulty') {
    if (v === st.difficulty) delete pending.difficulty;
    else pending.difficulty = v as Difficulty;
  } else if (v) {
    delete pending.jobSecurity;
    st.jobSecurity = true;
  } else if (st.jobSecurity) pending.jobSecurity = false;
  if (Object.keys(pending).length) st.pending = pending;
  else delete st.pending;
}

/** What Settings shows as chosen: the change waiting for opening night, else what's in force. */
export function chosenSetting(league: Pick<League, 'settings'>): { difficulty: Difficulty; jobSecurity: boolean } {
  const st = league.settings;
  return { difficulty: st.pending?.difficulty ?? st.difficulty, jobSecurity: st.pending?.jobSecurity ?? st.jobSecurity };
}

/** On opening night (startRegularSeason, before the owner sets his goals): the changes waiting in Settings take effect. */
export function applyPendingSettings(league: Pick<League, 'settings'>) {
  const p = league.settings.pending;
  if (!p) return;
  if (p.difficulty && DIFFICULTY[p.difficulty]) league.settings.difficulty = p.difficulty;
  if (p.jobSecurity === false) league.settings.jobSecurity = false;
  delete league.settings.pending;
}
