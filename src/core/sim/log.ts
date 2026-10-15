import type { ActionType, DefScheme, PnrCoverage, ShotZone } from '../types';

export type FinishType = 'pnrBH' | 'pnrRoll' | 'iso' | 'post' | 'spotup' | 'offscreen' | 'handoff' | 'cut' | 'transition' | 'putback' | 'misc';

export const FINISH_LABEL: Record<FinishType, string> = {
  pnrBH: 'P&R ball handler',
  pnrRoll: 'P&R roll/pop',
  iso: 'Isolation',
  post: 'Post-up',
  spotup: 'Spot-up',
  offscreen: 'Off screen',
  handoff: 'Handoff',
  cut: 'Cut',
  transition: 'Transition',
  putback: 'Putback',
  misc: 'Other: press, clock, late fouls',
};

export type StepKind =
  | 'advance' // bring ball up
  | 'press'
  | 'transition'
  | 'screen'
  | 'drive'
  | 'pass'
  | 'post'
  | 'cut'
  | 'handoff'
  | 'trap'
  | 'shot'
  | 'block'
  | 'reb'
  | 'to'
  | 'steal'
  | 'foul'
  | 'ft'
  | 'timeout';

/** One beat of a possession, used by the 2D court to animate and by the PBP feed. */
export interface PossStep {
  k: StepKind;
  pid?: number;
  pid2?: number;
  zone?: ShotZone;
  x?: number;
  y?: number;
  made?: boolean;
  /** For shots: points value. */
  v?: number;
  /** For shots: finishing play type. */
  f?: FinishType;
  /** For free throws: attempts (v counts the makes). */
  n?: number;
  /** For timeouts: the team that called it (0 home, 1 away). */
  t?: 0 | 1;
}

/**
 * A play called from the bench in a live game: an offensive call (go for three, a quick two, run the
 * clock for a last shot, an isolation for one player) is run on the side's next trip, "foul" on its
 * next defensive one. Calls change what the team tries, never how well it executes.
 */
export type PlayCall = { kind: 'three' | 'two' | 'hold' | 'foul' } | { kind: 'iso'; pid: number };

export interface PossLog {
  off: 0 | 1;
  q: number;
  clockStart: number;
  clockEnd: number;
  kind: 'half' | 'transition' | 'ft' | 'press';
  action?: ActionType;
  coverage?: PnrCoverage | 'zone';
  finish?: FinishType;
  steps: PossStep[];
  pts: number;
  score: [number, number];
  /** Short headline for the court overlay: 'P&R: Brunson + Towns vs drop'. */
  label: string;
  /** PBP lines produced in this possession. */
  lines: string[];
  /** On-court pids at the start of the possession: [home five, away five]. */
  on: [number[], number[]];
  /** Offensive pid -> defender pid at possession start. */
  guards: Record<number, number>;
  /** Defensive scheme in use (for drawing zones). */
  scheme: DefScheme;
  /** A junk defense's chased players (offensive pids), face-guarded by their defenders while the rest play the zone. */
  chase?: number[];
  help: number;
  /** A called play this possession ran, and the side that called it. */
  call?: PlayCall & { t: 0 | 1 };
  /** Each side's situational plan in effect ('' for none), when either has one. */
  sit?: [string, string];
}
