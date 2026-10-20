// Live game controller: plays the user's game possession by possession so the UI can
// animate it and the user can coach (timeouts, subs, tactic changes) in real time. The game is
// journaled in the league as it's played (League.live: how it started, and every coaching move
// with the possession it came after), so it survives the app being closed: the engine draws each
// possession from the game's seed, and playing the journal back rebuilds the same game.

import type { GameResult, League, LiveJournal, LiveOp, ScheduledGame, Tactics } from '../core/types';
import { GameSim, type SimTeamInput } from '../core/sim/engine';
import type { PossLog } from '../core/sim/log';
import { Rng } from '../core/random';
import { cloneTactics } from '../core/sim/tactics';
import { buildSimInput, ensureRotation, neutralSite, playGame, tipoffEdge, userGameOnDay } from '../core/league/games';
import { advanceDay, postGame, simDay } from '../core/league/season';
import { schedulePlayoffDay } from '../core/league/playoffs';
import { oppPlanIn, planTeam } from '../core/ai/opponentPlan';
import { reelOf } from '../core/analysis/highlights';
import { coachMoves, slotMatcher, slotMoveName } from '../core/analysis/moves';
import { shortName } from '../core/league/helpers';

/** Clutch time: the last five minutes of the fourth quarter. */
export const CLUTCH_SEC = 300;
/** Most possessions a journal can play back (a game takes about 200; the engine's own guard is 2000), so a damaged one can't run forever. */
export const MAX_STEPS = 2000;

/** A coaching move as the game made it: the move, the possession logs played by then, and where the game was. */
export interface LiveMark {
  op: LiveOp;
  /** How many possession logs the game had when the move was made: everything from this index on came after it. */
  log: number;
  q: number;
  clock: number;
  /** A tactics change: the tactics it replaced. */
  before?: Tactics;
}

/** A coaching move before it's journaled: the possession it comes after is added then. */
type Move = WithoutAt<LiveOp>;
type WithoutAt<T> = T extends unknown ? Omit<T, 'at'> : never;

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
  /** Possessions played so far (engine steps): what the journal counts in. */
  steps = 0;
  /**
   * Each coaching move as it was made (or played back from the journal): the move, how many
   * possession logs there were by then, and for a tactics change the tactics it replaced. The
   * night's moves and what each did since are read from these and the logs (see ui/live/moves.ts).
   */
  marks: LiveMark[] = [];
  /** The projected home margin at tip-off (GameResult.edge): where win probability starts. */
  readonly edge: number;
  /** This game's journal: the league's `live` while the game is pending (see checkpoint). */
  readonly journal: LiveJournal;
  /**
   * How the game was set up when it didn't start fresh: picked up from the save's journal, or
   * started over from tip-off because the journal couldn't be played back. The Live screen says
   * so once (and clears it).
   */
  resumed?: 'journal' | 'restarted';

  /** A new game from tip-off, or (with `from`) the game a journal describes, at tip-off: replay() plays it back. */
  constructor(league: League, game: ScheduledGame, from?: LiveJournal) {
    this.league = league;
    this.userTid = league.userTid;
    this.game = game;
    this.userSide = game.home === league.userTid ? 0 : 1;
    // a journaled game takes the teams as they were saved after its tip-off: nothing to bring up to date
    if (!from) {
      ensureRotation(league, game.home);
      ensureRotation(league, game.away);
    }
    const seed = from ? from.seed : (league.rng ^ (game.gid * 2654435761)) >>> 0;
    const input = (tid: number, opp: number): SimTeamInput => {
      const base = buildSimInput(league, tid, game.day, game.type, opp, game);
      if (tid !== league.userTid) {
        // the other coach's tactics and game plan as they were at tip-off: a replay never draws them again
        const o = from?.opp;
        if (!o) return base;
        const tactics = cloneTactics(o.tactics);
        return { ...base, team: o.plan ? planTeam(league.teams[tid], tactics, structuredClone(o.plan)) : { ...league.teams[tid], tactics } };
      }
      // the user coaches this one: the assistant's adjustments at breaks are for simmed games
      const u = from?.user;
      if (!u) return { ...base, adjust: false };
      return {
        ...base,
        team: { ...base.team, tactics: cloneTactics(u.tactics), rotation: structuredClone(u.rotation) },
        perf: { ...u.perf },
        rest: [...u.rest],
        injuryMult: u.injuryMult,
        // the questionable players cleared at tip-off (none in a journal from before game-time decisions)
        play: u.play ? [...u.play] : undefined,
        adjust: false,
      };
    };
    const sides = [input(game.home, game.away), input(game.away, game.home)];
    // (as the engine reads it: on unless switched off)
    const injuries = from ? from.injuries : league.settings.injuries !== false;
    this.sim = new GameSim(sides[0], sides[1], { rng: new Rng(seed), type: game.type, record: true, keepShots: true, injuries, neutral: neutralSite(game) });
    this.planned = this.sim.baseTactics(this.userSide);
    // (a journal from before win probability has none: the projection is worked out again from the tip)
    this.edge = from?.edge ?? tipoffEdge(league, game, this.sim);
    if (from && from.edge === undefined) from.edge = this.edge;
    const mine = sides[this.userSide];
    const theirs = sides[1 - this.userSide];
    const oppPlan = oppPlanIn(this.sim, (1 - this.userSide) as 0 | 1);
    this.journal = from ?? {
      gid: game.gid,
      tid: league.userTid,
      seed,
      injuries,
      user: {
        tactics: cloneTactics(mine.team.tactics),
        rotation: structuredClone(mine.team.rotation),
        perf: { ...mine.perf },
        rest: [...(mine.rest ?? [])],
        injuryMult: mine.injuryMult ?? 1,
        ...(mine.play?.length ? { play: [...mine.play] } : {}),
      },
      edge: this.edge,
      opp: { tactics: cloneTactics(theirs.team.tactics), ...(oppPlan ? { plan: structuredClone(oppPlan) } : {}) },
      steps: 0,
      q: this.sim.q,
      clock: this.sim.clock,
      score: [0, 0],
      ops: [],
    };
  }

  get over() {
    return this.sim.over;
  }

  /** Advance one possession; returns the possession logs produced. */
  step(): PossLog[] {
    if (this.sim.over) return [];
    this.sim.step();
    this.steps++;
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

  // ------------------------------------------------------------ coaching (the user's side)
  // Every move goes through these and into the journal, so a replay makes it at the same point.

  /** Sub `inPid` in for `outPid`: false (and nothing changes) when that isn't possible right now. */
  substitute(outPid: number, inPid: number): boolean {
    return this.record({ op: 'sub', args: { out: outPid, in: inPid } });
  }

  /** New tactics to play from; `plan`: they're also what "Reset to game plan" goes back to; `staff`: the staff made the change, and why. */
  setTactics(tactics: Tactics, plan = false, staff?: string) {
    this.record({ op: 'tactics', args: { tactics: cloneTactics(tactics), ...(plan && { plan }), ...(staff && { staff }) } });
  }

  /** Call one of the user's timeouts: false when none is left or the period has run out (one asked for in the other side's live ball waits for the next dead ball). */
  callTimeout(reason?: string): boolean {
    return this.record({ op: 'timeout', args: reason ? { reason } : {} });
  }

  /** The user asked for a timeout while the other side had a live ball: it's taken at the next dead ball (see GameSim.callTimeout). */
  get timeoutWaiting(): boolean {
    return this.sim.timeoutWaiting(this.userSide);
  }

  /** Whether the user makes the substitutions (the staff calls no timeouts to stop runs then either). */
  get manualSubs() {
    return this.sim.T[this.userSide].manualSubs;
  }

  setManualSubs(on: boolean) {
    this.record({ op: 'manualSubs', args: { on } });
  }

  /** "Keep changes after this game": the saved tactics as they were when it was turned on (null while it's off). */
  get keep(): Tactics | null {
    return this.journal.keep ?? null;
  }

  setKeep(saved: Tactics | null) {
    if (saved) this.journal.keep = cloneTactics(saved);
    else delete this.journal.keep;
  }

  /** Hashes of the user's tactics and rotation as the Live screen last saw them (absent until it has). */
  get seen(): [number, number] | undefined {
    return this.journal.seen;
  }

  markSeen(seen: [number, number]) {
    this.journal.seen = seen;
  }

  private record(m: Move): boolean {
    const op = { ...m, at: this.steps } as LiveOp;
    this.journal.ops.push(op);
    const ok = this.apply(op);
    this.checkpoint();
    return ok;
  }

  private apply(o: LiveOp): boolean {
    const s = this.sim;
    const side = this.userSide;
    const mark = (ok: boolean, before?: Tactics) => {
      if (ok) this.marks.push({ op: o, log: this.logs.length, q: s.q, clock: s.clock, ...(before && { before }) });
      return ok;
    };
    switch (o.op) {
      case 'sub':
        return mark(s.substitute(side, o.args.out, o.args.in));
      case 'tactics': {
        const before = s.baseTactics(side);
        s.setTactics(side, o.args.tactics);
        if (o.args.plan) this.planned = cloneTactics(o.args.tactics);
        // (edits made away from the Live screen become the plan: not a move made in the game)
        return o.args.plan ? true : mark(true, before);
      }
      case 'timeout':
        return mark(s.callTimeout(side, o.args.reason));
      case 'manualSubs':
        s.T[side].manualSubs = !!o.args.on;
        return true;
    }
    throw new Error(`Unknown live-game move: ${(o as { op: unknown }).op}`);
  }

  /**
   * Bring the journal up to the possession the game is on. The Live screen does at breaks, on
   * pause and with every move, and the store when the app is hidden: not every possession, since
   * saving the league that often would be too heavy (a save in between keeps the last checkpoint,
   * which is as good a place to pick up from). Returns whether the journal changed.
   */
  checkpoint(): boolean {
    const j = this.journal;
    let changed = false;
    // the league's copy was put back from an earlier one (a change that threw, undone by the store's attempt or task): this game's goes on
    if (this.league.live !== j && !this.committed && this.pendingIn(this.league)) {
      this.league.live = j;
      changed = true;
    }
    if (j.steps === this.steps) return changed;
    const s = this.sim;
    j.steps = this.steps;
    j.q = s.q;
    j.clock = s.clock;
    j.score = [s.T[0].score, s.T[1].score];
    return true;
  }

  /**
   * Play a journaled game back to its last checkpoint: the same possessions, with each move made
   * after as many of them as it was. Throws unless it lands where the journal says the game was
   * (a damaged journal, or something the game was built from has changed since).
   */
  private replay() {
    const j = this.journal;
    const to = j.steps;
    if (!Number.isInteger(to) || to < 0 || to > MAX_STEPS || !Array.isArray(j.ops)) throw new Error('The journal is damaged.');
    const playTo = (n: number) => {
      while (this.steps < n) {
        if (this.sim.over) throw new Error('The game ended before the journal did.');
        this.step();
      }
    };
    let last = 0;
    for (const op of j.ops) {
      if (!Number.isInteger(op.at) || op.at < last || op.at > to) throw new Error('The journal is out of order.');
      playTo(op.at);
      this.apply(op);
      last = op.at;
    }
    playTo(to);
    const s = this.sim;
    if (s.q !== j.q || Math.abs(s.clock - j.clock) > 1e-6 || s.T[0].score !== j.score[0] || s.T[1].score !== j.score[1])
      throw new Error(`The replay doesn't match the journal (${s.T[0].score}-${s.T[1].score} in Q${s.q}, not ${j.score.join('-')} in Q${j.q}).`);
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
    // the tactic slots as tonight's game plan plays them (the plan is used up with the result)
    const slotOf = slotMatcher(league, g);
    const slotName = (t: Tactics) => {
      const i = slotOf(t);
      return i === null ? null : slotMoveName(league, i);
    };
    // (recording it ends its journal)
    const res = playGame(league, g, { sim: this.sim, edge: this.edge });
    // the coach's moves and what each did, for the game's report
    const moves = coachMoves(this.marks, this.logs, this.userSide, (pid) => (league.players[pid] ? shortName(league, league.players[pid]) : `#${pid}`), slotName);
    if (moves.length) res.moves = moves;
    // its highlights stay with the save for its game report, until the next live game
    const reel = reelOf(g.gid, this.logs, this.userSide);
    if (reel.plays.length) league.reel = reel;
    else delete league.reel;
    postGame(league, g, res.home.pts > res.away.pts);
    advanceDay(league);
    this.committed = res;
    return res;
  }

  /**
   * The game the league's journal describes, played back to its last checkpoint; null when the
   * journal has none for today, 'failed' when it can't be played back. Either way a journal that
   * can't be picked up is dropped.
   */
  static fromJournal(league: League): LiveGame | 'failed' | null {
    const j = league.live;
    if (!j) return null;
    const g = journaledGame(league);
    if (!g) {
      // a game since played, another team's, or out of season: nothing to pick up
      delete league.live;
      return null;
    }
    try {
      const lg = new LiveGame(league, g, j);
      lg.replay();
      lg.resumed = 'journal';
      return lg;
    } catch (e) {
      console.warn('The live game in progress could not be picked up:', e);
      delete league.live;
      return 'failed';
    }
  }
}

let current: LiveGame | null = null;

/** Today's game of the user's team, if the league's journal is for it (it may be unplayable still: see fromJournal). */
function journaledGame(league: League): ScheduledGame | undefined {
  const j = league.live;
  if (!j || j.tid !== league.userTid || (league.phase !== 'regular' && league.phase !== 'playin' && league.phase !== 'playoffs')) return undefined;
  const g = userGameOnDay(league, league.day);
  return g && g.gid === j.gid ? g : undefined;
}

/** The user's live game that was started (the day's other games are done) and is open in this session, but isn't recorded yet. */
export function pendingLive(league: League): LiveGame | null {
  // finished, played some other way, or set up for another league or team: never resume it
  if (current && (current.committed || current.userTid !== league.userTid || !current.pendingIn(league))) current = null;
  return current;
}

/** Where the user's game in progress stands, the user's score first. */
export interface LiveStatus {
  gid: number;
  q: number;
  clock: number;
  score: [number, number];
}

/**
 * The user's game in progress: open in this session, or journaled in the save (the app was closed
 * mid-game) and to be picked up from there. What the Play menu and the screens that wait for a
 * live game to finish go by.
 */
export function liveInProgress(league: League): LiveStatus | null {
  const lg = pendingLive(league);
  if (lg) {
    const s = lg.sim;
    return { gid: lg.game.gid, q: s.q, clock: s.clock, score: [s.T[lg.userSide].score, s.T[1 - lg.userSide].score] };
  }
  const j = league.live;
  const g = journaledGame(league);
  if (!j || !g) return null;
  const side = g.home === j.tid ? 0 : 1;
  return { gid: j.gid, q: j.q, clock: j.clock, score: [j.score[side], j.score[1 - side]] };
}

/** The user's game in progress as a controller: the one open in this session, or the save's journal played back (null if neither, or it can't be). */
export function resumeLive(league: League): LiveGame | null {
  const pending = pendingLive(league);
  if (pending) return pending;
  const back = LiveGame.fromJournal(league);
  return back instanceof LiveGame ? (current = back) : null;
}

/** Bring the journal of the league's live game up to where it is (see LiveGame.checkpoint); returns whether it changed. */
export function checkpointLive(league: League): boolean {
  return pendingLive(league)?.checkpoint() ?? false;
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

/**
 * Prepare today's user game: simulate the rest of the day's games first. Resumes an in-progress
 * game: the one open in this session, or the one in the save's journal (after the app was closed),
 * played back to where it was saved. A journal that can't be played back starts the game over.
 */
export function prepareLive(league: League): LiveGame | null {
  // games are only played in season: in preseason, opening night waits for "Start regular season"
  if (league.phase !== 'regular' && league.phase !== 'playin' && league.phase !== 'playoffs') return null;
  if (league.phase === 'playoffs') schedulePlayoffDay(league);
  const g = userGameOnDay(league, league.day);
  if (!g) return null;
  const pending = pendingLive(league);
  if (pending && pending.game.gid === g.gid) return pending;
  const back = LiveGame.fromJournal(league);
  if (back instanceof LiveGame) return (current = back);
  // (the day's other games are already done when the journal had this game)
  simDay(league, { skipGid: g.gid });
  current = new LiveGame(league, g);
  league.live = current.journal;
  if (back === 'failed') current.resumed = 'restarted';
  return current;
}

/** Forget the controller of a league that was closed or replaced: its journal stays in that league, to pick the game up when it's opened again. */
export function dropLive() {
  current = null;
}

/** Abandon the live game: its controller and its journal both go (a recorded game's journal is gone already). */
export function clearLive() {
  if (current && current.league.live === current.journal) delete current.league.live;
  current = null;
}
