// Difficulty presets: one table for everything the difficulty changes, so every system reads the
// same numbers and the New League and Settings screens can show them side by side.
import type { League, Settings } from '../types';

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
   * their game for you on Hard, a little slack on Easy.
   */
  court: number;
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
    winFloor: 0.3,
    rebuildSeasons: 2,
  },
  hard: {
    label: 'Hard',
    line: 'AI GMs want a 12% premium, players ask 12% more, every coach game-plans you, opponents play 2 points a game better against you, an impatient owner.',
    tradeAsk: 1.12,
    contractAsk: 1.12,
    opponentPlans: 'always',
    ownerPressure: 1.3,
    court: -2,
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

/** Points a game the difficulty gives team `tid` in a game against `opp` (the user's side; 0 for a game he isn't in). */
export function courtPoints(league: Pick<League, 'settings' | 'userTid'>, tid: number, opp: number): number {
  const pts = DIFFICULTY[league.settings.difficulty]?.court ?? 0;
  return tid === league.userTid ? pts : opp === league.userTid ? -pts : 0;
}

/**
 * The difficulty's edge on the court for a game (SimOptions.edge): field-goal percentage added to
 * each side's shots (home first), half of it to the user's and half taken off his opponent's.
 * Undefined for a game he isn't in, or on Normal.
 */
export function courtEdge(league: Pick<League, 'settings' | 'userTid'>, home: number, away: number): [number, number] | undefined {
  const pts = courtPoints(league, home, away);
  return pts ? [(pts / 2) * FG_PER_POINT, (-pts / 2) * FG_PER_POINT] : undefined;
}
