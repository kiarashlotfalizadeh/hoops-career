// The coaches' side of a game, between possessions: new base tactics from the bench, timeouts (who may
// call one in a live ball, the late-game limits, the staff's automatic ones against a run, one asked
// for in the other side's live ball waiting for the dead ball) and an AI coach's adjustments at the
// breaks, read from the tags the other side is cashing in.

import type { Tactics } from '../../types';
import { archetype } from '../../ratings';
import { GAME } from '../../constants';
import type { FinishType } from '../log';
import { cloneTactics, defRoleOf, withMentality } from '../tactics';
import { type SP, type ST, ACTION_LIST, freedomMult } from './state';
import type { GameSim } from './game';
import { roleEdge } from './defense';
import { K } from './constants';
import { TK } from './tk';

/**
 * The adjustments a coach makes at a break, by kind, and the kinds measured as losing for the side
 * that makes them, which nobody makes (2026-11, scripts/tactics-lab: each kind alone against none in
 * paired AI games). Before, AI coaches made two the code's own notes had measured as losing (drop to
 * hedge, -1.9 a game where made; staying home on shooters, -3.4) and never touched their offense.
 */
export const LOSING_ADJUSTMENTS = new Set<string>([]);

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
      p.dm = roleEdge(p);
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
   * In-game adjustments by a coach at a break (an AI coach, or the user's assistant in a simmed game):
   * if the other side is cashing in on something, or his own offense is stuck, he changes one thing,
   * more often the better the coach. Read from the tags each side is cashing in (impact rates per 12
   * minutes) and the play types' points per trip. Defense first, then offense; one a period. A kind
   * measured as losing is never made (LOSING_ADJUSTMENTS); `opts.adjustOnly` (the measuring kit) limits
   * the kinds made.
   */
  adjust(this: GameSim, t: ST) {
    if (!t.adjust || t.adjustedQ === this.q || this.elapsed < 360 || !this.rng.chance(t.adjust)) return;
    const opp = this.T[1 - t.side];
    const d = t.t.defense;
    const o = t.t.offense;
    const rate = (key: string) => this.gainedRate(opp.side, key);
    const ppp = (side: ST, f: FinishType) => {
      const x = side.pt[f];
      return x && x.poss >= 6 ? x.pts / x.poss : 0;
    };
    type Move = { kind: string; what: string; change: (x: Tactics) => void; rematch?: boolean };
    const moves: Move[] = [];
    // ---- defense
    // a defender the other bench hunts with success gets hidden on their weakest scorer on the floor
    const huntedD = rate('hunt:o') >= 0.5 ? t.byId.get(opp.t.offense.huntTarget ?? -1) : undefined;
    const weak = huntedD?.on ? opp.on.filter((p) => t.guardOf.get(p.pid) !== huntedD).sort((a, b) => this.threat(a, opp) - this.threat(b, opp) || a.pid - b.pid)[0] : undefined;
    if (huntedD && weak)
      moves.push({
        kind: 'hide',
        what: `hides ${huntedD.name} on ${weak.name}`,
        rematch: true,
        change: (x) => {
          for (const k of Object.keys(x.defense.matchups)) if (x.defense.matchups[+k] === huntedD.pid) delete x.defense.matchups[+k];
          x.defense.matchups[weak.pid] = huntedD.pid;
        },
      });
    // a zone or a junk defense being picked apart goes back to man-to-man, for good
    const zoneHurt = rate('zone_3pt:o') + rate('zone_glass:o') + rate('box_open:o') + rate('box_beat:o');
    if ((d.scheme !== 'man' || t.habit.zoneMix > 0) && zoneHurt >= 0.9)
      moves.push({
        kind: 'man',
        what: 'goes back to man-to-man',
        rematch: d.scheme === 'box1' || d.scheme === 'tri2',
        change: (x) => {
          x.defense.scheme = 'man';
          t.habit.zoneMix = 0;
        },
      });
    if (d.scheme === 'man') {
      // a handler who can shoot it is pulling up over the drop: ice the side screens and stay up on the middle ones
      const lead = this.leadHandler(opp);
      if (d.pnr === 'drop' && rate('drop_pullup:o') + rate('drop_pop:o') >= 0.8 && lead && Math.max(lead.c.pu3, lead.c.midShot) >= 62)
        moves.push({ kind: 'ice', what: `ices ${lead.name}'s ball screens instead of dropping`, change: (x) => void (x.defense.pnr = 'ice') });
      // the trap's 4-on-3 is burning them: back to the drop
      if (d.pnr === 'blitz' && rate('blitz_4v3:o') >= 0.6) moves.push({ kind: 'unblitz', what: 'stops blitzing ball screens', change: (x) => void (x.defense.pnr = 'drop') });
      // the roll man (or the switch's mismatches) are eating them alive: drop the big
      // (only with a rim protector on the floor to drop: without one it measured as a loss)
      const anchor = Math.max(...t.on.map((p) => p.c.rimProt));
      if (d.pnr !== 'drop' && d.pnr !== 'ice' && anchor >= 62 && (ppp(opp, 'pnrRoll') >= 1.45 || rate('switch_mismatch:o') >= 0.6 || rate('hedge_roll:o') >= 0.6))
        moves.push({
          kind: 'drop',
          what: 'drops the big on ball screens',
          change: (x) => {
            x.defense.pnr = 'drop';
            x.defense.switchOffBall = false;
          },
        });
    }
    if (rate('help_paint:o') + rate('spacing:o') + rate('drop_rim:o') >= 0.7 && d.help < 70)
      moves.push({ kind: 'pack', what: 'packs the paint', change: (x) => void (x.defense.help = Math.min(100, x.defense.help + 15)) });
    if (rate('help_kick:o') >= 0.7 && d.help > 60 && this.shooters(opp) >= 3)
      moves.push({ kind: 'home', what: 'stays home on shooters', change: (x) => void (x.defense.help = Math.max(45, x.defense.help - 15)) });
    // (against handlers secure enough to make the pressure pay: against loose ones it's the turnovers that count)
    if (rate('pressure_blowby:o') + rate('pressure_backdoor:o') + rate('pressure_foul:o') >= 0.6 && d.pressure > 62 && opp.secQ >= 57)
      moves.push({ kind: 'backoff', what: 'backs off the ball', change: (x) => void (x.defense.pressure = Math.max(50, x.defense.pressure - 15)) });
    if (rate('getback:o') + rate('crash_leak:o') >= 0.6 && d.getBack < 75)
      moves.push({
        kind: 'getback',
        what: 'sprints back in transition',
        change: (x) => {
          x.defense.getBack = Math.min(100, x.defense.getBack + 15);
          x.offense.crashBoards = Math.max(35, x.offense.crashBoards - 10);
        },
      });
    // ---- offense
    if (t.habit.offAdj > 0) {
      const zoned = this.schemeNow(opp) !== 'man' || opp.habit.zoneMix > 0.15;
      // against a zone or a junk defense: move it, flash the high post, find the shooters
      if (zoned && rate('zone_paint:d') >= 0.4 && o.actions.motion < 80)
        moves.push({
          kind: 'attackZone',
          what: 'attacks the zone with ball movement',
          change: (x) => {
            x.offense.actions.motion = Math.min(100, x.offense.actions.motion + 20);
            x.offense.actions.handoff = Math.min(100, x.offense.actions.handoff + 10);
            x.offense.actions.iso = Math.max(10, x.offense.actions.iso - 15);
          },
        });
      // a defender in foul trouble gets attacked
      const trouble = this.foulTarget(t, opp);
      if (trouble && o.huntTarget == null)
        moves.push({ kind: 'foulHunt', what: `goes at ${trouble.name} in foul trouble`, change: (x) => void (x.offense.huntTarget = trouble.pid) });
      // a switching defense hands out mismatches: go get them
      if (!o.huntMismatch && opp.t.defense.pnr === 'switch' && this.bestMismatch(t, opp) >= 12)
        moves.push({ kind: 'hunt', what: 'hunts the mismatches the switches leave', change: (x) => void (x.offense.huntMismatch = true) });
      // behind by double figures in the fourth quarter: more possessions, more risk
      const down = opp.score - t.score;
      if (this.q >= 4 && this.clock <= 600 && down >= 10 && down <= 22 && (t.t.mentality ?? 0) < 1)
        moves.push({ kind: 'chase', what: 'pushes the pace to chase the game', change: (x) => void (x.mentality = 1) });
    }
    const only = this.opts.adjustOnly;
    const move = moves.find((m) => !LOSING_ADJUSTMENTS.has(m.kind) && (!only || only.includes(m.kind)));
    if (!move) return;
    // (a new mentality is played from the base, as new base tactics are: see rebase)
    if (move.kind === 'chase') {
      move.change(t.base);
      this.rebase(t);
    } else {
      move.change(t.t);
      move.change(t.base);
      if (move.rematch) this.refreshMatchups();
    }
    // (attacking the zone is the high-post flash and the ball reversal it calls for: the zone is read sooner)
    if (move.kind === 'attackZone') t.zoneSeen += TK.zoneRead.answer;
    t.adjustedQ = this.q;
    this.adjustments.push({ t: t.side, q: this.q, clock: Math.round(this.clock), text: move.what, kind: move.kind });
    this.addPbp(t.side, `${t.team.abbrev} adjusts: ${move.what}.`, 'other');
  },

  /** The other side's lead ball handler on the floor (the one with the most pick-and-roll handling). */
  leadHandler(this: GameSim, t: ST): SP | null {
    let best: SP | null = null;
    for (const p of t.on) if (!best || p.c.pnrHandle * p.tu > best.c.pnrHandle * best.tu) best = p;
    return best;
  },

  /** How many players on the floor can shoot it (catch-and-shoot 55 and up). */
  shooters(this: GameSim, t: ST): number {
    return t.on.filter((p) => p.c.c3 >= 55).length;
  },

  /** A defender worth attacking in foul trouble: one on the floor with four fouls (five in the fourth) who plays inside or guards the ball. */
  foulTarget(this: GameSim, _off: ST, def: ST): SP | null {
    const limit = this.q >= 4 ? 5 : 4;
    const cands = def.on.filter((p) => p.fouls >= limit && p.planMin >= 20);
    if (!cands.length) return null;
    return cands.sort((a, b) => b.planMin - a.planMin)[0];
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
