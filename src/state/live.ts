// Live game controller: plays the user's game possession by possession so the UI can
// animate it and the user can coach (timeouts, subs, tactic changes) in real time.

import type { GameResult, League, ScheduledGame } from '../core/types';
import { GameSim } from '../core/sim/engine';
import type { PossLog } from '../core/sim/log';
import { Rng } from '../core/random';
import { buildSimInput, ensureRotation, playGame, userGameOnDay } from '../core/league/games';
import { advanceDay, postGame, simDay } from '../core/league/season';
import { schedulePlayoffDay } from '../core/league/playoffs';

export class LiveGame {
  sim: GameSim;
  game: ScheduledGame;
  userSide: 0 | 1;
  logs: PossLog[] = [];
  committed: GameResult | null = null;

  constructor(league: League, game: ScheduledGame) {
    this.game = game;
    this.userSide = game.home === league.userTid ? 0 : 1;
    ensureRotation(league, game.home);
    ensureRotation(league, game.away);
    const rng = new Rng((league.rng ^ (game.gid * 2654435761)) >>> 0);
    this.sim = new GameSim(buildSimInput(league, game.home, game.day, game.type, game.away), buildSimInput(league, game.away, game.day, game.type, game.home), {
      rng,
      type: game.type,
      record: true,
      keepShots: true,
      injuries: league.settings.injuries,
    });
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

  /** Fast-forward to a condition (end of quarter / game). */
  simTo(cond: 'quarter' | 'end'): PossLog[] {
    const q = this.sim.q;
    const out: PossLog[] = [];
    let guard = 0;
    while (!this.sim.over && guard++ < 1000) {
      out.push(...this.step());
      if (cond === 'quarter' && this.sim.q !== q) break;
    }
    return out;
  }

  commit(league: League): GameResult {
    if (this.committed) return this.committed;
    if (!this.sim.over) this.simTo('end');
    const res = playGame(league, this.game, { sim: this.sim });
    postGame(league, this.game, res.home.pts > res.away.pts);
    advanceDay(league);
    this.committed = res;
    return res;
  }
}

let current: LiveGame | null = null;

/** Prepare today's user game: simulate the rest of the day's games first. Resumes an in-progress game. */
export function prepareLive(league: League): LiveGame | null {
  if (league.phase === 'playoffs') schedulePlayoffDay(league);
  const g = userGameOnDay(league, league.day);
  if (!g) return null;
  if (current && current.game.gid === g.gid && !current.committed) return current;
  simDay(league, { skipGid: g.gid });
  current = new LiveGame(league, g);
  return current;
}

export function clearLive() {
  current = null;
}
