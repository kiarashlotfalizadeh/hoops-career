// Live game controller: plays the user's game possession by possession so the UI can
// animate it and the user can coach (timeouts, subs, tactic changes) in real time.

import type { GameResult, League, ScheduledGame, Tactics } from '../core/types';
import { GameSim } from '../core/sim/engine';
import type { PossLog } from '../core/sim/log';
import { Rng } from '../core/random';
import { buildSimInput, ensureRotation, neutralSite, playGame, userGameOnDay } from '../core/league/games';
import { advanceDay, postGame, simDay } from '../core/league/season';
import { schedulePlayoffDay } from '../core/league/playoffs';

/** Clutch time: the last five minutes of the fourth quarter. */
export const CLUTCH_SEC = 300;

export class LiveGame {
  sim: GameSim;
  game: ScheduledGame;
  userSide: 0 | 1;
  logs: PossLog[] = [];
  committed: GameResult | null = null;
  /** The league object and team the game was set up for: another league (or a reload of this one) or a switched team never resumes it. */
  readonly league: League;
  readonly userTid: number;
  /**
   * The user's tactics at tip-off (the saved tactics with tonight's game plan): what "Reset to game
   * plan" goes back to, and what "Keep changes" measures the night's changes against.
   */
  planned: Tactics;

  constructor(league: League, game: ScheduledGame) {
    this.league = league;
    this.userTid = league.userTid;
    this.game = game;
    this.userSide = game.home === league.userTid ? 0 : 1;
    ensureRotation(league, game.home);
    ensureRotation(league, game.away);
    const rng = new Rng((league.rng ^ (game.gid * 2654435761)) >>> 0);
    this.sim = new GameSim(buildSimInput(league, game.home, game.day, game.type, game.away, game), buildSimInput(league, game.away, game.day, game.type, game.home, game), {
      rng,
      type: game.type,
      record: true,
      keepShots: true,
      injuries: league.settings.injuries,
      neutral: neutralSite(game),
    });
    this.planned = this.sim.baseTactics(this.userSide);
  }

  get over() {
    return this.sim.over;
  }

  /** Advance one possession; returns the possession logs produced. */
  step(): PossLog[] {
    if (this.sim.over) return [];
    this.sim.step();
    const l = this.sim.drainLogs();
    this.logs.push(...l);
    return l;
  }

  /**
   * Fast-forward to the end of the period ('quarter': from a break, the next one), halftime, clutch
   * time (5:00 left in the fourth quarter) or the end of the game. Already past halftime or clutch
   * time, nothing is played.
   */
  simTo(cond: 'quarter' | 'half' | 'clutch' | 'end'): PossLog[] {
    const out: PossLog[] = [];
    const s = this.sim;
    if ((cond === 'half' && (s.q > 2 || (s.q === 2 && s.clock <= 0.05))) || (cond === 'clutch' && s.q >= 4 && s.clock <= CLUTCH_SEC)) return out;
    // stop at the buzzer: the next step() rolls straight into the next period and skips the break
    const done = () => (cond === 'quarter' ? s.clock <= 0.05 : cond === 'half' ? s.q === 2 && s.clock <= 0.05 : cond === 'clutch' ? s.q >= 4 && s.clock <= CLUTCH_SEC : false);
    let guard = 0;
    // from a break, the skip covers the next period
    do {
      out.push(...this.step());
    } while (!s.over && guard++ < 1000 && !done());
    return out;
  }

  /** The schedule entry this game still has to fill in `league`, if any: none once it's played, or in another league. */
  pendingIn(league: League): ScheduledGame | undefined {
    if (league !== this.league) return undefined;
    const g = league.schedule.find((x) => x.gid === this.game.gid);
    return g && !g.played ? g : undefined;
  }

  /**
   * Record the game (simming the rest first) and move to the next day. If the game was already
   * played without this controller, nothing is recorded again and that result is returned.
   */
  commit(league: League): GameResult {
    if (this.committed) return this.committed;
    if (current === this) current = null;
    const g = this.pendingIn(league);
    if (!g) {
      const res = league.games.find((x) => x.gid === this.game.gid);
      if (!res) throw new Error('This live game belongs to a league that is no longer open.');
      return res;
    }
    if (!this.sim.over) this.simTo('end');
    const res = playGame(league, g, { sim: this.sim });
    postGame(league, g, res.home.pts > res.away.pts);
    advanceDay(league);
    this.committed = res;
    return res;
  }
}

let current: LiveGame | null = null;

/** The user's live game that was started (the day's other games are done) but isn't recorded yet. */
export function pendingLive(league: League): LiveGame | null {
  // finished, played some other way, or set up for another league or team: never resume it
  if (current && (current.committed || current.userTid !== league.userTid || !current.pendingIn(league))) current = null;
  return current;
}

/**
 * What became of a live game the Live screen is coaching, given the open league: null while it's
 * still the screen's to finish; the gid of its report once it's recorded (by the screen, or by the
 * Play menu's sims without it); 'gone' once its league isn't the open one (the last save reloaded
 * after a sim error), where it can never be recorded.
 */
export function playedElsewhere(lg: LiveGame, league: League): number | 'gone' | null {
  if (lg.league !== league) return 'gone';
  if (lg.committed) return lg.committed.gid;
  return league.games.some((g) => g.gid === lg.game.gid) ? lg.game.gid : null;
}

/** Prepare today's user game: simulate the rest of the day's games first. Resumes an in-progress game. */
export function prepareLive(league: League): LiveGame | null {
  // games are only played in season: in preseason, opening night waits for "Start regular season"
  if (league.phase !== 'regular' && league.phase !== 'playin' && league.phase !== 'playoffs') return null;
  if (league.phase === 'playoffs') schedulePlayoffDay(league);
  const g = userGameOnDay(league, league.day);
  if (!g) return null;
  const pending = pendingLive(league);
  if (pending && pending.game.gid === g.gid) return pending;
  simDay(league, { skipGid: g.gid });
  current = new LiveGame(league, g);
  return current;
}

export function clearLive() {
  current = null;
}
