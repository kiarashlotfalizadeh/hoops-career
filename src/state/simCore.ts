// What the sim worker runs: days of the season up to a target, and the phase changes. Pure league
// code (no DOM, no store), so the same functions run in the worker and, where there are no workers
// (tests, a browser that can't start one), on a copy of the league in this thread.
import type { GameResult, League, NewsItem, Settings } from '../core/types';
import { faAdvance, finishDraftPhase, newSeason, regularGamesLeft, simDay, startDraft, startFreeAgency, startRegularSeason } from '../core/league/season';
import { userGameOnDay } from '../core/league/games';
import { schedulePlayoffDay } from '../core/league/playoffs';
import { billingFor } from '../core/analysis/gameStory';
import { openCallIds } from '../core/league/calls';

export type SimTarget =
  | { kind: 'days'; n: number }
  | { kind: 'untilUserGame' }
  | { kind: 'week' }
  | { kind: 'allStar' }
  | { kind: 'deadline' }
  | { kind: 'endRegular' }
  | { kind: 'endPostseason' }
  /** Through the play-in and the playoffs in one go (for teams that are out). */
  | { kind: 'endPlayoffs' }
  /** A month of the calendar (30 days), stopping for what's worth stopping for, as a week does. */
  | { kind: 'month' }
  /** To the morning of a big night (`day`, the user's game with a billing): see flow.ts's nextBigNight. */
  | { kind: 'bigNight'; day: number };

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

/**
 * Why a sim stopped short of its target: the user stopped it, mail that needs an answer (an
 * important message: the owner, a job offer, an offer sheet), a new staff call (see calls.ts: a
 * star hurt, the playoff odds gone, the owner's floor, the trade deadline, a playoff series or
 * play-in game starting, the books) or one still open as its due date nears, or the morning of one
 * of his biggest games. What only happened (a milestone, a streak, a front-page story) waits in the
 * digest.
 */
export type SimStop = 'target' | 'stopped' | 'news' | 'call' | 'bigGame';

/** The Continue loop's settings (each on unless set false). */
export type LoopSettings = Pick<Settings, 'stopForBigGames' | 'digest'>;

/** A Continue-loop setting: on unless it's been turned off. */
export const loopSetting = (l: Pick<League, 'settings'>, k: keyof LoopSettings) => l.settings[k] !== false;

/** The day "Sim 1 month" runs to. */
export const MONTH_DAYS = 30;

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
    case 'month':
      return l.day - startDay >= MONTH_DAYS;
    case 'bigNight':
      return l.day >= target.day;
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
    case 'month':
      return MONTH_DAYS;
    case 'bigNight':
      return Math.max(1, target.day - l.day);
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
 * Play days until `target` (or a stop): the league in hand moves on in place. Under `stopOnNews`, a
 * sim stops early (except one of a set number of days) for what needs an answer: an important
 * unread message, a staff call that wasn't open when it started (or came due since: see
 * openCallIds; each playoff series of his once, the morning it starts), or the morning of one of his
 * biggest games (with a setting of its own). Stopping early changes nothing that's played: the next
 * sim carries on from the same day.
 */
export async function runSim(l: League, target: SimTarget, hooks: SimHooks = {}): Promise<{ days: number; stop: SimStop }> {
  const startDay = l.day;
  const startPhase = l.phase;
  const total = estimateTotal(l, target);
  const bigNews = () => l.inbox.filter((m) => !m.read && m.important).length;
  const newsBefore = bigNews();
  const stops = l.settings.stopOnNews !== false && target.kind !== 'days';
  // (a call open when it started, or settled, doesn't stop it again; one coming due is a new id)
  const callsBefore = new Set(stops ? openCallIds(l) : []);
  // (a sim to the next game, or to a big night, stops there anyway)
  const bigGames = stops && loopSetting(l, 'stopForBigGames') && target.kind !== 'untilUserGame' && target.kind !== 'bigNight';
  const every = hooks.checkpointDays ?? 20;
  let days = 0;
  for (;;) {
    if (hooks.shouldStop?.()) return { days, stop: 'stopped' };
    simDay(l);
    days++;
    hooks.progress?.({ label: 'Simulating', done: days, total: Math.max(total, days) });
    if (targetDone(l, target, startDay, startPhase)) return { days, stop: 'target' };
    // smart stop: big news for your team during a long sim (routine injuries just land in the inbox)
    if (stops && days > 1 && bigNews() > newsBefore) return { days, stop: 'news' };
    if (stops && openCallIds(l).some((id) => !callsBefore.has(id))) return { days, stop: 'call' };
    if (bigGames && bigNightToday(l)) return { days, stop: 'bigGame' };
    if (days % every === 0) await hooks.checkpoint?.(l);
    await hooks.yieldDay?.();
  }
}

/** The press's opinions (the power rankings, a column, a preview), as against what happened. */
export const OPINION: ReadonlySet<NewsItem['kind']> = new Set(['power', 'column', 'preview']);

/** A front-page story (weight 3) about the user's team that's an event, not an opinion: the digest leads with it, and it can take the screen. */
export const isFrontPage = (l: League, n: NewsItem) => n.weight === 3 && n.tids.includes(l.userTid) && !OPINION.has(n.kind);

/** The user plays one of his biggest games today (a billing of weight 3: a Game 7, a homecoming...). */
export function bigNightToday(l: League): boolean {
  const g = userGameOnDay(l, l.day);
  return !!g && billingFor(l, g)?.weight === 3;
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
