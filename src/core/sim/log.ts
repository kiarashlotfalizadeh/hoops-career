import type { ActionType, PnrCoverage, ShotZone } from '../types';

export type FinishType =
  | 'pnrBH'
  | 'pnrRoll'
  | 'iso'
  | 'post'
  | 'spotup'
  | 'offscreen'
  | 'handoff'
  | 'cut'
  | 'transition'
  | 'putback'
  | 'misc';

export const FINISH_LABEL: Record<FinishType, string> = {
  pnrBH: 'P&R Ball Handler',
  pnrRoll: 'P&R Roll/Pop',
  iso: 'Isolation',
  post: 'Post-Up',
  spotup: 'Spot-Up',
  offscreen: 'Off Screen',
  handoff: 'Handoff',
  cut: 'Cut',
  transition: 'Transition',
  putback: 'Putback',
  misc: 'Other',
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
  | 'sub'
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
}

export interface PossLog {
  off: 0 | 1;
  q: number;
  clockStart: number;
  clockEnd: number;
  kind: 'half' | 'transition' | 'putback' | 'ft' | 'press';
  action?: ActionType;
  coverage?: PnrCoverage | 'zone';
  finish?: FinishType;
  steps: PossStep[];
  pts: number;
  score: [number, number];
  /** Short headline for the court overlay: 'PnR: Brunson + Towns vs Drop'. */
  label: string;
  /** PBP lines produced in this possession. */
  lines: string[];
  /** Assistant-coach style note when something notable happened (tactic tag). */
  note?: string;
  /** On-court pids at the start of the possession: [home five, away five]. */
  on: [number[], number[]];
  /** Offensive pid -> defender pid at possession start. */
  guards: Record<number, number>;
  /** Defensive scheme in use (for drawing zones). */
  scheme: 'man' | 'zone23' | 'zone32';
  help: number;
}
