// The game's state as the engine keeps it: each player (ratings and composites, tendencies, energy,
// fouls, his box score and on-floor tallies) and each team (tactics in effect and the coach's base,
// the five on the floor and the matchups, the lineup's cached qualities, the score, timeouts, team
// fouls, calls from the bench, the sets run), the inputs a game takes, and the small types and helpers
// the engine's modules share.

import type { ActionType, LineupStat, OffRole, Player, Pos, Ratings, SetId, ShotZone, Tactics, Team, TeamBox, TeamTotals, GameType } from '../../types';
import type { Rng } from '../../random';
import type { Composites } from '../../ratings';
import type { FinishType } from '../log';
import type { Cast, Slot } from '../sets';
import { K } from './constants';

export interface Box {
  sec: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pts: number;
  pm: number;
  rimM: number;
  rimA: number;
  midM: number;
  midA: number;
  c3M: number;
  c3A: number;
  astM: number; // assisted makes
  onPoss: number;
  onPF: number;
  onPA: number;
  tFga: number;
  tFta: number;
  tTov: number;
  /** actions run as the primary actor, and team actions while on the floor */
  acts: number;
  tActs: number;
  /** team field goals made while on the floor */
  tFgm: number;
}

export const newBox = (): Box => ({
  sec: 0,
  fgm: 0,
  fga: 0,
  tpm: 0,
  tpa: 0,
  ftm: 0,
  fta: 0,
  orb: 0,
  drb: 0,
  ast: 0,
  stl: 0,
  blk: 0,
  tov: 0,
  pf: 0,
  pts: 0,
  pm: 0,
  rimM: 0,
  rimA: 0,
  midM: 0,
  midA: 0,
  c3M: 0,
  c3A: 0,
  astM: 0,
  onPoss: 0,
  onPF: 0,
  onPA: 0,
  tFga: 0,
  tFta: 0,
  tTov: 0,
  acts: 0,
  tActs: 0,
  tFgm: 0,
});

export interface SP {
  pid: number;
  name: string; // display (last name)
  full: string;
  pos: Pos;
  r: Ratings;
  c: Composites;
  role: OffRole;
  freedom: number; // usage multiplier from shot freedom
  energy: number;
  fouls: number;
  on: boolean;
  out: 0 | 1 | 2; // 0 ok, 1 fouled out, 2 injured or held out (rest)
  /** Game second he fouled out. */
  outAt?: number;
  starter: boolean;
  ftPct: number;
  hot: number;
  perf: number; // wear multiplier around 1
  guard: boolean;
  big: boolean;
  /** Tendencies: usage, three, drive, pass multipliers. */
  tu: number;
  t3: number;
  td: number;
  tp: number;
  /** hidden event tendencies: blocks, steals, offensive / defensive boards, turnovers */
  tbk: number;
  tsl: number;
  tor: number;
  tdr: number;
  ttv: number;
  tpf: number;
  /** usage share above which defenses load up: real players carry their own fitted usage */
  useCap: number;
  useDamp: number;
  /** shot-diet tendencies: mid-range, corner threes, self-creation */
  tm: number;
  tcn: number;
  tcr: number;
  b: Box;
  /** Played at least a second. */
  played: boolean;
  dnp?: string;
  /** Hard minute cap from the rotation (load management). */
  cap?: number;
  /** Minutes in the stint plan. */
  planMin: number;
  /** In-game injury risk multiplier: 1, or K.gameTimeRisk for an injured player cleared to play. */
  risk: number;
}

export interface ST {
  side: 0 | 1;
  tid: number;
  team: Team;
  t: Tactics;
  players: SP[];
  byId: Map<number, SP>;
  on: SP[];
  plan: number[][];
  score: number;
  qs: number[];
  timeouts: number;
  fouls: number; // team fouls this period
  foulsLast2: number;
  tot: TeamTotals;
  poss: number;
  pt: Record<string, { poss: number; pts: number }>;
  ex: TeamBox['extra'];
  run: number; // unanswered points
  /** The deep bench is finishing a blowout (stays on until the game is back within reach). */
  garbage: boolean;
  // caches for current lineup
  spacing: number;
  passQ: number;
  helpQ: number;
  speed: number;
  /** How much bite ball pressure has with this lineup: quick hands and on-ball defense. */
  pressQ: number;
  /** The unit's ball security (its players' average): how much it makes of a defense overplaying the ball. */
  secQ: number;
  /** The unit's feel on offense (reads, passing, handling) and its team defense (help, on-ball, inside). */
  feelQ: number;
  defQ: number;
  /** guardOf[offensePid] = my defender (filled on the DEFENSIVE team). */
  guardOf: Map<number, SP>;
  lineupKey: string;
  ls: LineupStat | null;
  cap: Record<ActionType, number>;
  subSig: string;
  manualSubs: boolean; // user drives subs live
  injMult: number;
  subLock: Map<number, number>; // pid -> game second until which a manual sub sticks
  /** Chance an AI coach acts on what the opponent is exploiting at a break (0: never). */
  adjust: number;
  /** Period of the coach's last adjustment (one per period). */
  adjustedQ: number;
  /** The tactics the coach set; `t` is what is played: these, with the situational plan in effect on top. */
  base: Tactics;
  /** The situational plan in effect. */
  sit: { id: string; label: string } | null;
  /** Times each player has been hacked this period. */
  hacked: Map<number, number>;
  /** A set queued for the side's next half-court trip this period (runSet: the engine's tests and measurement scripts). */
  nextSet: { id: SetId; pid: number | null } | null;
  /** A timeout asked for while the other side had a live ball (the reason given): taken at the next dead ball. */
  toWait: string | null;
  /** One of the team's timeouts was called: its next trip runs the after-timeout play. */
  atoNext: boolean;
  /** Times each set has been run tonight: what the other defense has read of it. */
  setRuns: Map<SetId, number>;
}

/**
 * A set being run on this action (see sets.ts): its cast, and what it does to the action's options
 * (by name): openness from its edges against this defense and the defense's read of it, the tags
 * behind that openness, and the weight multipliers that send the team to its look.
 */
export interface SetPlay {
  cast: Cast<SP>;
  label: string;
  /** The openness the defense's read takes off its look (already in `open` for its look's options). */
  read: number;
  open: Partial<Record<Slot, number>>;
  tags: Partial<Record<Slot, [string, number][]>>;
  w: Partial<Record<Slot, number>>;
}

export interface SimTeamInput {
  team: Team;
  players: Player[];
  /** Team-specific injury risk multiplier (practice intensity, medical staff). */
  injuryMult?: number;
  /** Per-player performance multipliers (wear, a questionable player's step slow), at most 1. */
  perf?: Record<number, number>;
  /** Players held out (rest / coach decision). */
  rest?: number[];
  /**
   * Injured players who play anyway (game-time decisions on questionable players): dressed instead
   * of sitting out, at K.gameTimeRisk times the usual in-game injury risk. Their form is in `perf`.
   */
  play?: number[];
  /** A coach (AI, or the user's assistant in simmed games) who may adjust the game plan at quarter breaks and timeouts. */
  adjust?: boolean;
}

export interface SimOptions {
  rng: Rng;
  type: GameType;
  record?: boolean;
  neutral?: boolean;
  injuries?: boolean;
  /** Keep shot locations even when not recording play-by-play. */
  keepShots?: boolean;
}

export interface InGameInjury {
  pid: number;
  tid: number;
  q: number;
}

/** How a possession starts; 'orb' only marks a live offensive board, and a trip that ends on one hands the ball over as a defensive rebound. */
export type Ctx = 'start' | 'made' | 'dreb' | 'steal' | 'ft' | 'deadTO' | 'orb';

export interface ShotOpts {
  shooter: SP;
  zone: ShotZone;
  open: number;
  contest: SP | null;
  assister: SP | null;
  finish: FinishType;
  /** openness contributions per impact tag */
  tags?: [string, number][];
  pullup?: boolean;
  forcedFoulMult?: number;
  /** The impact tag owed the fouls drawn above the shot's usual rate, and the multiplier that drew them. */
  foulTag?: [string, number];
}

/** The late-game modes the clock and the score put an offense in (see lateMode). */
export interface LateMode {
  /** Hold for the last shot of the period. */
  hold: boolean;
  /** A quick shot: a two-for-one. */
  quick: boolean;
  /** Milk a late lead: the clock dies with the ball. */
  milk: boolean;
  /** Down three to five late: go for three. */
  need3: boolean;
  /** Two possessions or more down late, still within reach: quick shots, more of them threes. */
  hurry: boolean;
}

/** How an action ends: the possession is over ('done'), or the ball moves on to the next action with what's left of the advantage. */
export type ActionResult = 'done' | { carry: number; ball: SP | null };

export const ACTION_LIST: ActionType[] = ['pnr', 'iso', 'post', 'handoff', 'motion'];

/** No players (shared: never added to). */
export const NONE: SP[] = [];

/** Usage multiplier for a player's shot freedom: green light (1), normal (0) or limited (-1). */
export function freedomMult(fr: number) {
  return fr === 1 ? K.freedomGreen : fr === -1 ? K.freedomLimited : 1;
}

/** Well-mixed 32-bit hash of a seed and a counter (murmur3 finalizer), for derived RNG streams. */
export function mix(seed: number, n: number): number {
  let h = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
