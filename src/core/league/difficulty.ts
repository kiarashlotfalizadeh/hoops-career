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
}

export const DIFFICULTY: Record<Difficulty, DifficultyPreset> = {
  easy: {
    label: 'Easy',
    line: 'Deals 12% under value go through, players ask 10% less, no opponent game plans, a patient owner.',
    tradeAsk: 0.88,
    contractAsk: 0.9,
    opponentPlans: 'never',
    ownerPressure: 0.7,
  },
  normal: {
    label: 'Normal',
    line: 'Fair value in trades and contracts. About half your opponents game-plan for you.',
    tradeAsk: 1,
    contractAsk: 1,
    opponentPlans: 'sometimes',
    ownerPressure: 1,
  },
  hard: {
    label: 'Hard',
    line: 'AI GMs want a 12% premium, players ask 12% more, every coach game-plans you, an impatient owner.',
    tradeAsk: 1.12,
    contractAsk: 1.12,
    opponentPlans: 'always',
    ownerPressure: 1.3,
  },
};

export const DIFFICULTIES = Object.keys(DIFFICULTY) as Difficulty[];

export const preset = (league: Pick<League, 'settings'>): DifficultyPreset => DIFFICULTY[league.settings.difficulty] ?? DIFFICULTY.normal;
