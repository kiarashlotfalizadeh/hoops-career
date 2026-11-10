// The coaches' side of a game, between possessions: new base tactics from the bench, timeouts (who may
// call one in a live ball, the late-game limits, the staff's automatic ones against a run, one asked
// for in the other side's live ball waiting for the dead ball) and an AI coach's adjustments at the
// breaks, read from the tags the other side is cashing in.

import type { Tactics } from '../../types';
import { archetype } from '../../ratings';
import { GAME } from '../../constants';
import type { FinishType } from '../log';
import { cloneTactics, defRoleOf, withMentality } from '../tactics';
import { type ST, ACTION_LIST, freedomMult } from './state';
import type { GameSim } from './game';
import { K } from './constants';

/**
 * The adjustments the user's assistant doesn't make at the breaks of a simmed game (the side whose
 * team is marked `assistant`: see buildSimInput), measured for the user's side (12 teams' first 12
 * games, 120 seeds each, injuries off; scratch round/gameday/adjust.mts, 2026-10-25), each kind kept
 * alone against none over 7,200 paired games, in points of margin: going from Drop to Hedge cost 1.9
 * a game where it was made, backing off the ball 0.35 and staying home on shooters 3.4 (on 36 games).
 * Over 17,280 paired games against no adjustments (injuries off): with every kind, +0.31 ± 0.09 a game;
 * without these three, +0.47 ± 0.09. Re-measured with injuries on (28,160 paired games over 32 team
 * runs, 2026-10-26): +0.05 ± 0.15, about even, swinging from +0.64 to −0.37 by matchups. AI coaches
 * make all of them as before.
 */
const ASSISTANT_SKIPS = new Set(['hedge', 'backoff', 'home']);

export const coachMethods = {
  /** Plays the team's base tactics (new ones from the bench), with the mentality's nudges on top. No random draws. */
  rebase(this: GameSim, t: ST) {
    const shape = t.t.offense.shape;
    t.t = withMentality(cloneTactics(t.base));
    // (a role the tactics no longer set goes back to his archetype's, as at the tip)
    for (const p of t.players) {
      p.role = t.t.offense.roles[p.pid] ?? archetype(p.r).role;
      p.freedom = freedomMult(t.t.offense.freedom[p.pid] ?? 0);
      p.drole = defRoleOf(t.t.defense, p.pid);
      p.glass = t.t.offense.glass?.[p.pid] ?? 0;
    }
    this.refreshMatchups();
    // (a new shape is new spacing for the five on the floor)
    if (t.t.offense.shape !== shape && t.on.length) {
      t.spacing = this.shapeSpacing(t);
      for (const a of ACTION_LIST) t.cap[a] = this.capability(t, a);
    }
  },

  /** Whether the team on `side` may call a timeout now: in a dead ball, or with the ball in its hands. */
  mayCallTimeout(this: GameSim, side: 0 | 1): boolean {
    return this.poss === side || (this.ctx !== 'steal' && this.ctx !== 'dreb');
  },

  /**
   * After a possession: a timeout asked for during the other side's live ball is taken now, at the dead
   * ball (or the change of possession) that ended it, unless the period ran out first.
   */
  takeWaitingTimeouts(this: GameSim) {
    for (const t of this.T) {
      if (t.toWait === null) continue;
      const reason = t.toWait;
      t.toWait = null;
      if (this.atBuzzer()) continue;
      // (none left by now, under the late-game limits: it isn't taken)
      if (this.mayCallTimeout(t.side)) this.callTimeout(t.side, reason);
      else t.toWait = reason;
    }
  },

  /** Points the team on `side` has gained from an impact key (e.g. 'drop_pullup:o') so far, per 12 minutes played. */
  gainedRate(this: GameSim, side: 0 | 1, key: string) {
    return ((this.impacts.get(`${key}|${side}`)?.pts ?? 0) * GAME.quarterSec) / Math.max(360, this.elapsed);
  },

  /**
   * In-game adjustments by an AI coach at a break: if the opponent is exploiting something
   * (per the impact tags and play-type PPP), change one thing, more often the better the coach.
   */
  adjust(this: GameSim, t: ST) {
    if (!t.adjust || t.adjustedQ === this.q || this.elapsed < 360 || !this.rng.chance(t.adjust)) return;
    const opp = this.T[1 - t.side];
    const d = t.t.defense;
    const rate = (key: string) => this.gainedRate(opp.side, key);
    const ppp = (f: FinishType) => {
      const x = opp.pt[f];
      return x && x.poss >= 6 ? x.pts / x.poss : 0;
    };
    // the change is decided on what is being played, and made to the base tactics too
    let what = '';
    /** Which kind of change it is (see ASSISTANT_SKIPS). */
    let kind = '';
    let change = (x: Tactics) => void x;
    // a defender the other bench hunts with success gets hidden on their weakest scorer on the floor
    // (only ever when the opponent hunts one: never in a game between AI teams)
    const huntedD = rate('hunt:o') >= 0.5 ? t.byId.get(opp.t.offense.huntTarget ?? -1) : undefined;
    const weak = huntedD?.on ? opp.on.filter((p) => t.guardOf.get(p.pid) !== huntedD).sort((a, b) => this.threat(a, opp) - this.threat(b, opp) || a.pid - b.pid)[0] : undefined;
    const junk = d.scheme === 'box1' || d.scheme === 'tri2';
    if (huntedD && weak) {
      change = (x) => {
        for (const k of Object.keys(x.defense.matchups)) if (x.defense.matchups[+k] === huntedD.pid) delete x.defense.matchups[+k];
        x.defense.matchups[weak.pid] = huntedD.pid;
      };
      what = `hides ${huntedD.name} on ${weak.name}`;
      kind = 'hide';
    } else if (d.scheme !== 'man') {
      if (rate('zone_3pt:o') + rate('zone_glass:o') + rate('box_open:o') + rate('box_beat:o') >= 1) {
        change = (x) => void (x.defense.scheme = 'man');
        what = 'goes back to man-to-man';
        kind = 'man';
      }
    } else if (d.pnr === 'drop' && (rate('drop_pullup:o') + rate('drop_pop:o') >= 0.8 || ppp('pnrBH') >= 1.15)) {
      change = (x) => void (x.defense.pnr = 'hedge');
      what = 'hedges ball screens instead of dropping';
      kind = 'hedge';
    } else if (d.pnr === 'blitz' && rate('blitz_4v3:o') >= 0.6) {
      change = (x) => void (x.defense.pnr = 'hedge');
      what = 'stops blitzing ball screens';
      kind = 'unblitz';
      // (0.3 a quarter of mismatch points: the off-ball switches' tags count what they're worth, K.offBallTag,
      // so this is the 0.8 the coaches read before, the same games for them to react to; 0.5 since the
      // switched ball screen's tags went from half their estimate to 0.95 of it, K.switchTag)
    } else if (d.pnr !== 'drop' && (ppp('pnrRoll') >= 1.45 || rate('switch_mismatch:o') >= 0.5 || rate('hedge_roll:o') >= 0.6)) {
      change = (x) => {
        x.defense.pnr = 'drop';
        x.defense.switchOffBall = false;
      };
      what = 'drops the big on ball screens';
      kind = 'drop';
    }
    if (!what) {
      if (rate('help_kick:o') >= 0.6 && d.help > 30) {
        change = (x) => void (x.defense.help = Math.max(0, x.defense.help - 15));
        what = 'stays home on shooters';
        kind = 'home';
      } else if (rate('help_paint:o') + rate('spacing:o') >= 0.6 && d.help < 75) {
        change = (x) => void (x.defense.help = Math.min(100, x.defense.help + 15));
        what = 'packs the paint';
        kind = 'pack';
        // (backing off and crashing less pay only from an extreme: the change stops at the middle,
        // where giving up turnovers or boards would cost more than the blow-bys or run-outs it saves)
      } else if (rate('pressure_blowby:o') + rate('pressure_backdoor:o') + rate('pressure_foul:o') >= 0.5 && d.pressure > 60) {
        change = (x) => void (x.defense.pressure = Math.max(50, x.defense.pressure - 15));
        what = 'backs off the ball';
        kind = 'backoff';
      } else if (rate('crash_leak:o') >= 0.5 && t.t.offense.crashBoards > 65) {
        change = (x) => void (x.offense.crashBoards = Math.max(55, x.offense.crashBoards - 20));
        what = 'sends fewer players to the offensive glass';
        kind = 'glass';
      } else if (rate('getback:o') >= 0.4 && d.getBack < 80) {
        change = (x) => void (x.defense.getBack = Math.min(100, x.defense.getBack + 15));
        what = 'sprints back in transition';
        kind = 'getback';
      }
    }
    // (the user's assistant leaves the kinds that cost his side alone, and may look again at the next stop)
    if (!what || (t.team.assistant && ASSISTANT_SKIPS.has(kind))) return;
    change(t.t);
    change(t.base);
    // a hidden defender and chasers called off are new assignments
    if ((huntedD && weak) || junk) this.refreshMatchups();
    t.adjustedQ = this.q;
    this.adjustments.push({ t: t.side, q: this.q, clock: Math.round(this.clock), text: what });
    this.addPbp(t.side, `${t.team.abbrev} adjusts: ${what}.`, 'other');
  },

  /** NBA: no more than two timeouts each after the 3:00 mark of the fourth quarter. */
  lateTimeouts(this: GameSim) {
    if (this.q === 4 && this.clock <= 180) for (const t of this.T) t.timeouts = Math.min(t.timeouts, 2);
  },

  /**
   * The staff's timeouts (a team with auto timeouts on, not driven live): against a run, at the end of
   * a close game with the ball (to advance it, set a play, or after the other side scores), and the
   * TV's two a quarter. NBA 2024-26: 5.4 a team-game, 35% of them in the fourth quarter, 2.2 in the
   * last two minutes of games within five (both teams); at 1.6 a game, all of them against runs, the
   * sim's coaches still had most of theirs at the final horn.
   */
  autoTimeouts(this: GameSim) {
    this.lateTimeouts();
    const final = this.q >= 4;
    for (const t of this.T) {
      const opp = this.T[1 - t.side];
      // (in a live ball only the team with the ball may call one)
      if (!t.t.manage.autoTimeouts || t.manualSubs || !this.mayCallTimeout(t.side)) continue;
      // (one timeout at a dead ball is enough for both benches)
      if (this.timeoutStep) break;
      const late = final && this.clock < 120;
      const reserve = late ? 0 : final ? 1 : 2;
      const k = K.quarterTO;
      // through a quarter, to the last three minutes of the fourth, an AI coach's timeouts are a habit
      // (see K.quarterTO); the user's staff, and anyone in the last minutes, stops a run at the number set
      const habit = t.habit.calls > 0 && this.q <= 4 && (this.q < 4 || this.clock > 180);
      if (!habit && opp.run >= t.t.manage.timeoutRun && t.timeouts > reserve) {
        this.callTimeout(t.side, `${opp.run}-0 run`);
        continue;
      }
      // the other side has just scored (a few unanswered, or the coach wants a word)
      if (habit && this.poss === t.side && (this.ctx === 'made' || this.ctx === 'ft') && t.timeouts > (this.q < 4 ? 3 : 2) && this.clock > 20) {
        // (one that isn't against a real run only when play has gone a while without one, and in the
        // first three quarters only while the quarter's two breaks haven't both come, with time left
        // for it to be worth one)
        const since = this.elapsed - this.lastTO;
        const word = since >= k.quiet && (this.q === 4 || (this.T[0].qTimeouts + this.T[1].qTimeouts < 2 && this.clock > 120));
        const mid = this.clock <= 420 && this.clock > 180 ? k.mid : 1;
        const run = opp.run;
        const p =
          (run >= 8 ? k.run8 + k.per * (run - 8) : run >= 6 ? (since >= k.quiet / 2 ? k.run6 : 0) : !word ? 0 : (run >= 4 ? k.run4 : k.any) * mid) * (this.q === 4 ? k.q4 : 1);
        if (this.rng.chance(t.habit.calls * p)) {
          // (a real run is an occasion to adjust; a word with the team isn't)
          this.callTimeout(t.side, run >= 4 ? `${run}-0 run` : '', run < 6);
          continue;
        }
      }
      // the end of a close game, with the ball: behind or tied in the last half minute (it advances the
      // ball), ahead by a basket or less after the other side scored, or to set up a trip in the last two
      // minutes
      const diff = t.score - opp.score;
      const dead = this.ctx === 'made' || this.ctx === 'ft' || this.ctx === 'deadTO' || this.ctx === 'oob';
      // timeouts past the two a team may keep after 3:00 of the fourth are used before it or lost: now
      // and then a coach spends one at a dead ball rather than lose it
      if (this.q === 4 && this.clock > 180 && this.clock <= K.lateTO.spend && t.timeouts > 2 && dead && Math.abs(diff) <= 12 && this.rng.chance(K.lateTO.spendP)) {
        this.callTimeout(t.side, '', true);
        continue;
      }
      if (!final || this.poss !== t.side || t.timeouts <= 0 || this.clock > 120 || this.clock < 0.8) continue;
      const lt = K.lateTO;
      const last = this.clock <= lt.at;
      const p =
        this.clock <= lt.from && diff <= 0 && diff >= -6
          ? last
            ? lt.behind
            : lt.behindEarly
          : this.clock <= lt.from && diff >= 1 && diff <= 6 && dead
            ? last
              ? lt.ahead
              : lt.aheadEarly
            : Math.abs(diff) <= 5 && dead
              ? lt.close
              : 0;
      if (p && this.rng.chance(p)) this.callTimeout(t.side, '', true);
    }
    this.mandatoryTimeout();
  },

  /**
   * The TV's timeouts: at the first dead ball under 7:00 and under 3:00 of each quarter, one is taken
   * if nobody has called one in that stretch, charged to the side that has used fewer (the home side
   * on a tie) while it has more than it keeps for the end.
   */
  mandatoryTimeout(this: GameSim) {
    if (!K.tvTimeouts || this.q > 4 || this.ctx === 'steal' || this.ctx === 'dreb' || this.ctx === 'orb') return;
    // (a quarter that reaches its last minute and a half without a dead ball goes without the second one)
    const mark = this.clock < 90 ? 0 : this.clock < 180 ? 2 : this.clock < 420 ? 1 : 0;
    const key = this.q * 10 + mark;
    if (!mark || this.mandatory.q >= key) return;
    this.mandatory.q = key;
    const taken = this.T[0].qTimeouts + this.T[1].qTimeouts;
    if (taken > this.mandatory.n) {
      this.mandatory.n = taken;
      return;
    }
    const reserve = this.q >= 4 ? 1 : 2;
    const ok = this.T.filter((t) => t.t.manage.autoTimeouts && !t.manualSubs && t.timeouts > reserve);
    if (ok.length) {
      const t = ok.length === 2 && ok[1].timeouts > ok[0].timeouts ? ok[1] : ok[0];
      this.callTimeout(t.side, '', true);
    }
    this.mandatory.n = this.T[0].qTimeouts + this.T[1].qTimeouts;
  },
};
