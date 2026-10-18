// What the sim worker runs: days of the season up to a target, and the phase changes. Pure league
// code (no DOM, no store), so the same functions run in the worker and, where there are no workers
// (tests, a browser that can't start one), on a copy of the league in this thread.
import type { GameResult, League } from '../core/types';
import { faAdvance, finishDraftPhase, newSeason, regularGamesLeft, simDay, startDraft, startFreeAgency, startRegularSeason } from '../core/league/season';
import { userGameOnDay } from '../core/league/games';
import { schedulePlayoffDay } from '../core/league/playoffs';

export type SimTarget =
  | { kind: 'days'; n: number }
  | { kind: 'untilUserGame' }
  | { kind: 'week' }
  | { kind: 'allStar' }
  | { kind: 'deadline' }
  | { kind: 'endRegular' }
  | { kind: 'endPostseason' }
  /** Through the play-in and the playoffs in one go (for teams that are out). */
  | { kind: 'endPlayoffs' };

/** The phase changes, by name (a worker can't be handed a function). */
export type TaskOp =
  { kind: 'startRegular' } | { kind: 'startDraft' } | { kind: 'finishDraft' } | { kind: 'startFA' } | { kind: 'faAdvance'; days: number } | { kind: 'newSeason' };

/** What a phase change reports back: startRegular's errors, newSeason's "it went through". */
export type TaskResult = { errors?: string[]; done?: boolean };

export interface SimProgress {
  label: string;
  done: number;
  total: number;
}

/** Why a sim stopped short of its target: the user stopped it, or big news for the user's team. */
export type SimStop = 'target' | 'stopped' | 'news';

/** Day "Sim to All-Star break" lands on: the day before the All-Star Game, so the user can act first. */
export function allStarStop(l: League) {
  return l.allStarDay - 1;
}

export function targetDone(l: League, target: SimTarget, startDay: number, startPhase: string): boolean {
  if (target.kind === 'endPlayoffs') return l.phase !== 'playin' && l.phase !== 'playoffs';
  if (l.phase !== startPhase) return true;
  if (!(l.phase === 'regular' || l.phase === 'playin' || l.phase === 'playoffs')) return true;
  switch (target.kind) {
    case 'days':
      return l.day - startDay >= target.n;
    case 'week':
      return l.day - startDay >= 7;
    case 'untilUserGame':
      if (l.day === startDay) return false;
      if (l.phase === 'playoffs') schedulePlayoffDay(l);
      return !!userGameOnDay(l, l.day);
    case 'allStar':
      // stop the day before the All-Star Game (played at the end of allStarDay), mid-break
      return l.phase !== 'regular' || l.day >= allStarStop(l);
    case 'deadline':
      // deadline day itself is the last day trades are allowed
      return l.phase !== 'regular' || l.day >= l.tradeDeadlineDay;
    case 'endRegular':
      return l.phase !== 'regular' || regularGamesLeft(l) === 0;
    case 'endPostseason':
      return false;
  }
}

export function estimateTotal(l: League, target: SimTarget): number {
  switch (target.kind) {
    case 'days':
      return target.n;
    case 'week':
      return 7;
    case 'untilUserGame':
      return 3;
    case 'allStar':
      return Math.max(1, allStarStop(l) - l.day);
    case 'deadline':
      return Math.max(1, l.tradeDeadlineDay - l.day);
    case 'endRegular':
      return Math.max(1, l.regularSeasonDays - l.day + 1);
    case 'endPostseason':
    case 'endPlayoffs':
      return 60;
  }
}

export interface SimHooks {
  /** After each day. */
  progress?: (p: SimProgress) => void;
  /** Asked between days: true stops the sim there. */
  shouldStop?: () => boolean;
  /** Every `checkpointDays` days: the league as it stands, to show and save. */
  checkpoint?: (l: League) => void | Promise<void>;
  checkpointDays?: number;
  /** Between days, so a stop can arrive (the worker yields to its message queue). */
  yieldDay?: () => Promise<void>;
}

/**
 * Play days until `target` (or a stop): the league in hand moves on in place. Stops early for big
 * news for the user's team (an important unread message) when `stopOnNews`, except on a sim of a
 * set number of days.
 */
export async function runSim(l: League, target: SimTarget, hooks: SimHooks = {}): Promise<{ days: number; stop: SimStop }> {
  const startDay = l.day;
  const startPhase = l.phase;
  const total = estimateTotal(l, target);
  const bigNews = () => l.inbox.filter((m) => !m.read && m.important).length;
  const newsBefore = bigNews();
  const every = hooks.checkpointDays ?? 20;
  let days = 0;
  for (;;) {
    if (hooks.shouldStop?.()) return { days, stop: 'stopped' };
    simDay(l);
    days++;
    hooks.progress?.({ label: 'Simulating', done: days, total: Math.max(total, days) });
    if (targetDone(l, target, startDay, startPhase)) return { days, stop: 'target' };
    // smart stop: big news for your team during a long sim (routine injuries just land in the inbox)
    if (l.settings.stopOnNews !== false && days > 1 && target.kind !== 'days' && bigNews() > newsBefore) return { days, stop: 'news' };
    if (days % every === 0) await hooks.checkpoint?.(l);
    await hooks.yieldDay?.();
  }
}

export function runTask(l: League, op: TaskOp): TaskResult {
  switch (op.kind) {
    case 'startRegular':
      return { errors: startRegularSeason(l) };
    case 'startDraft':
      return { done: startDraft(l) !== false };
    case 'finishDraft':
      return { done: finishDraftPhase(l) !== false };
    case 'startFA':
      return { done: startFreeAgency(l) !== false };
    case 'faAdvance':
      faAdvance(l, op.days);
      return { done: true };
    case 'newSeason':
      return { done: newSeason(l) !== false };
  }
}

// ---------------------------------------------------------------- results across the thread boundary

/**
 * A season of results is most of a league (about 8 MB of 10 by the playoffs), so the worker keeps
 * its own copy and only what changed crosses over: the results both sides already share (`keep`,
 * from the start of the list) and the rest. Results are only ever added, except at a new season,
 * which replaces them with copies without their play-by-play, so a game id and whether it still has
 * its play-by-play say whether two lists agree.
 */
export interface GamesDelta {
  keep: number;
  tail: GameResult[];
}

/** What a list of results is, for comparing: [game id, has play-by-play] each. */
export type GamesSig = [number, boolean][];

export const gamesSig = (games: readonly GameResult[]): GamesSig => games.map((g) => [g.gid, !!g.pbp]);

/** What `games` adds to or changes from a list whose signature is `base`. */
export function diffGames(base: GamesSig | null, games: readonly GameResult[]): GamesDelta {
  let keep = 0;
  if (base) while (keep < base.length && keep < games.length && base[keep][0] === games[keep].gid && base[keep][1] === !!games[keep].pbp) keep++;
  return { keep, tail: games.slice(keep) };
}

/** `base` brought up to date with a delta made against it. */
export const applyGames = (base: readonly GameResult[], d: GamesDelta): GameResult[] => base.slice(0, d.keep).concat(d.tail);

/** The league without its results, for the trip across. */
export const withoutGames = (l: League): League => ({ ...l, games: [] });
