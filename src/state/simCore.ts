// What the sim worker runs: days of the season up to a target, and the phase changes. Pure league
// code (no DOM, no store), so the same functions run in the worker and, where there are no workers
// (tests, a browser that can't start one), on a copy of the league in this thread.
import type { GameResult, League, Settings } from '../core/types';
import { faAdvance, finishDraftPhase, newSeason, regularGamesLeft, simDay, startDraft, startFreeAgency, startRegularSeason } from '../core/league/season';
import { userGameOnDay } from '../core/league/games';
import { schedulePlayoffDay } from '../core/league/playoffs';
import { simStopIds } from '../core/league/agenda';
import { staffMorning } from '../core/league/callMeasure';
import { markOffersSeen } from '../core/league/proposals';

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
  | { kind: 'month' };

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
 * Why a sim stopped short of its target: the user stopped it, the job itself (the owner's ultimatum,
 * the sack), or something that needs an answer (see agenda.ts's stopsSim: a decision the league
 * waits on, a trade offer, a trade request, a starter hurt, the trade deadline, a playoff series or
 * play-in game starting). What only happened waits in the digest.
 */
export type SimStop = 'target' | 'stopped' | 'news' | 'call';

/** The Continue loop's settings (each on unless set false). */
export type LoopSettings = Pick<Settings, 'digest'>;

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
 * Play days until `target` (or a stop): the league in hand moves on in place. Each morning (and the
 * one it starts on) the staff measures what its picks and the open cards wait on and makes its picks
 * (staffMorning: whatever the sim's length or settings, so a long sim and a short one make the same
 * ones). Under `stopOnNews`, a sim stops early (except one of a set number of days) only for what
 * needs an answer and wasn't open when it started (agenda.ts's stopsSim): a decision the league waits
 * on, an AI team's trade offer, a player's trade request, a starter hurt, the trade deadline, a
 * playoff series or play-in game of his starting. What it stopped for is kept (League.stopCall: the
 * action queue leads with it). Stopping early changes nothing that's played: the next sim carries on
 * from the same day.
 */
export async function runSim(l: League, target: SimTarget, hooks: SimHooks = {}): Promise<{ days: number; stop: SimStop }> {
  // (it starts from a screen whose queue lists every open offer: their dates stand from here)
  markOffersSeen(l);
  const startDay = l.day;
  const startPhase = l.phase;
  const total = estimateTotal(l, target);
  // the owner's ultimatum and the sack stop any sim, whatever the settings: nobody sims past them unseen
  const ultimatum = () => (l.ownerGoals?.ultimatum ? l.ownerGoals.season : undefined);
  const [firedBefore, ultimatumBefore] = [!!l.fired, ultimatum()];
  const stops = l.settings.stopOnNews !== false && target.kind !== 'days';
  // (what was open when it started doesn't stop it again)
  const before = new Set(stops ? simStopIds(l) : []);
  const every = hooks.checkpointDays ?? 20;
  let days = 0;
  /** The staff's morning: its measuring said on the progress bar, a stop asked for meanwhile honoured. */
  const morning = () =>
    staffMorning(l, {
      cancelled: hooks.shouldStop,
      between: hooks.yieldDay,
      onMeasure: () => hooks.progress?.({ label: 'The staff is measuring', done: days, total: Math.max(total, days) }),
    });
  /** Something that needs an answer opened since the sim started: it stops the sim, and the queue leads with it. */
  const called = () => {
    const id = simStopIds(l).find((x) => !before.has(x));
    if (id === undefined) return false;
    l.stopCall = { id, season: l.season, day: l.day };
    return true;
  };
  // (the morning it starts on first: a live game, a phase change or a change of his since the last sim can leave it to do)
  if (!(await morning())) return { days, stop: 'stopped' };
  if (stops && called()) return { days, stop: 'call' };
  for (;;) {
    if (hooks.shouldStop?.()) return { days, stop: 'stopped' };
    simDay(l);
    days++;
    hooks.progress?.({ label: 'Simulating', done: days, total: Math.max(total, days) });
    if (!(await morning())) return { days, stop: 'stopped' };
    if (targetDone(l, target, startDay, startPhase)) {
      if (stops) called();
      return { days, stop: 'target' };
    }
    if ((l.fired && !firedBefore) || (ultimatum() !== undefined && ultimatum() !== ultimatumBefore)) return { days, stop: 'news' };
    if (stops && called()) return { days, stop: 'call' };
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
 * which replaces them with copies without their play-by-play; and a recorded result can still change
 * (see resultMark). So a game id and its mark say whether two lists agree.
 */
export interface GamesDelta {
  keep: number;
  tail: GameResult[];
}

/**
 * What a result is as far as a change after it's recorded goes: how many of its fields are set. A
 * result changes only by gaining or losing one: an older game of the user's drops its play-by-play,
 * a live game's moves get their measured worth (movesWorth) once the final is in, maybe after a save
 * or a sim. Either one changes the count, so a copy made before it (the worker's, the device's) is
 * known to be out of date and goes again.
 */
export function resultMark(g: GameResult): number {
  let n = 0;
  for (const k in g) if (g[k as keyof GameResult] !== undefined) n++;
  return n;
}

/** What a list of results is, for comparing: [game id, mark] each. */
export type GamesSig = [number, number][];

export const gamesSig = (games: readonly GameResult[]): GamesSig => games.map((g) => [g.gid, resultMark(g)]);

/** What `games` adds to or changes from a list whose signature is `base`. */
export function diffGames(base: GamesSig | null, games: readonly GameResult[]): GamesDelta {
  let keep = 0;
  if (base) while (keep < base.length && keep < games.length && base[keep][0] === games[keep].gid && base[keep][1] === resultMark(games[keep])) keep++;
  return { keep, tail: games.slice(keep) };
}

/** What the worker says when a delta was made against results it doesn't hold: they go again whole. */
export const LOST_RESULTS = 'The sim worker lost track of the results.';

/** `base` brought up to date with a delta made against it. */
export const applyGames = (base: readonly GameResult[], d: GamesDelta): GameResult[] => base.slice(0, d.keep).concat(d.tail);

/** The signature of a list brought up to date with a delta, from the list's signature (taken when it was sent: the list may have changed since). */
export const applySig = (base: GamesSig, d: GamesDelta): GamesSig => base.slice(0, d.keep).concat(gamesSig(d.tail));

/** The league without its results, for the trip across. */
export const withoutGames = (l: League): League => ({ ...l, games: [] });
