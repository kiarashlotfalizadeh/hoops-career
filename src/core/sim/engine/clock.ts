// Time: the game clock running (players tiring on the floor and resting off it, a chaser or a denier
// tiring faster), the end of a period and the break after it (the possession arrow, the coaches'
// adjustments, a fresh lineup), the pace of setups and actions, and the late-game modes the clock and
// the score put an offense in (hold for the last shot, milk a lead, go for three, hurry, two-for-one).

import { Rng } from '../../random';
import { GAME } from '../../constants';
import { K } from './constants';
import { TK } from './tk';
import { type ST, type LateMode, NONE, mix } from './state';
import type { GameSim } from './game';

export const clockMethods = {
  endPeriod(this: GameSim): boolean {
    // the last fraction of a second still counts: exactly 48 minutes (plus overtime) are played
    this.tick(this.clock);
    // and the game clock doesn't drift: the next period starts on its minute of the stint plan
    this.elapsed = Math.min(this.q, 4) * GAME.quarterSec + Math.max(0, this.q - 4) * GAME.otSec;
    const [h, a] = this.T;
    if (this.q >= 4 && h.score !== a.score) {
      this.over = true;
      this.addPbp(-1, `End of game. ${h.team.abbrev} ${h.score}, ${a.team.abbrev} ${a.score}.`, 'period');
      return false;
    }
    const label = periodName(this.q);
    this.addPbp(-1, `End of ${label}. ${h.team.abbrev} ${h.score}, ${a.team.abbrev} ${a.score}.`, 'period');
    this.q++;
    this.flowPeriods.push(this.flow.length);
    this.clock = this.q <= 4 ? GAME.quarterSec : GAME.otSec;
    for (const t of this.T) {
      t.fouls = 0;
      t.foulsLast2 = 0;
      t.qTimeouts = 0;
      t.advance = false;
      t.qs.push(0);
      if (this.q === 4) t.timeouts = Math.min(t.timeouts, 4);
      if (this.q >= 5) t.timeouts = 2;
      for (const p of t.players) p.energy = Math.min(1, p.energy + (this.q === 3 ? 0.3 : 0.1));
      // a queued set and the hack-a-player count are for one period, and the break is the stop a
      // waiting timeout was for
      t.nextSet = null;
      t.atoNext = false;
      t.toWait = null;
      t.hacked.clear();
    }
    // the break draws from its own stream, so the possessions around it stay paired in batch comparisons
    this.owed = null;
    this.rng = new Rng(mix(this.seed, 0x7ff00000 + this.q));
    this.mandatory.n = 0;
    for (const t of this.T) this.adjust(t);
    // possession arrow: loser of tip gets Q2 & Q3, winner Q4; OT is a jump
    if (this.q === 2 || this.q === 3) this.poss = (1 - this.tipWinner) as 0 | 1;
    else if (this.q === 4) this.poss = this.tipWinner;
    else this.poss = this.rng.chance(0.5) ? 0 : 1;
    this.flowPoss.push(this.poss);
    this.ctx = 'start';
    this.T[0].run = 0;
    this.T[1].run = 0;
    this.checkSubs(this.T[0], true);
    this.checkSubs(this.T[1], true);
    this.addPbp(-1, `Start of ${periodName(this.q)}.`, 'period');
    return true;
  },

  tick(this: GameSim, dt: number) {
    if (dt <= 0) return;
    if (dt > this.clock) dt = this.clock;
    this.clock -= dt;
    this.elapsed += dt;
    for (const t of this.T) {
      const press = this.T[1 - t.side].t.defense.press !== 'none' || t.t.defense.press !== 'none';
      // (0.9 to 1.1 until 2026-11-09: an early look is worth more now, see K.tempo, and pushing for it costs more legs)
      const paceMult = 0.87 + (t.t.offense.pace / 100) * 0.26;
      // (and crashing the glass on every miss: TK.crash.drain)
      const crashMult = 1 + TK.crash.drain * Math.max(0, (t.t.offense.crashBoards - 50) / 50);
      // chasing in a junk defense wears out the chasers
      const off = this.T[1 - t.side];
      const chased = t.side !== this.poss ? this.chased(t, off) : NONE;
      for (const p of t.players) {
        if (p.on) {
          p.b.sec += dt;
          let drain = K.drain * (1.4 - 0.75 * (p.r.end / 100)) * paceMult * crashMult;
          if (press) drain *= TK.press.both;
          // (and the pressing side runs more of it)
          if (t.t.defense.press !== 'none') drain *= TK.press.drain;
          if (t.t.defense.press === 'always') drain *= TK.press.always;
          if (chased.length && chased.some((c) => t.guardOf.get(c.pid) === p)) drain *= TK.chase.drain;
          // (the chasing roles wear their players down on defense)
          else if (t.side !== this.poss && (p.drole === 'poa' || p.drole === 'stopper')) drain *= TK.role.drain;
          p.energy = Math.max(0.2, p.energy - drain * dt);
        } else if (p.out === 0 || p.out === 1) {
          p.energy = Math.min(1, p.energy + K.recover * dt);
        }
      }
    }
    for (const t of this.T) {
      const ls = this.lineupStat(t);
      ls.sec += dt;
    }
  },

  /** The period runs out before the offense gets a shot off: the trip counts for its last shot, if it had one. */
  clockOut(this: GameSim, off: ST) {
    if (this.cur && !this.cur.label) this.cur.label = 'Clock runs out';
    this.finishPoss(off, this.possFinish);
  },

  /** Time multiplier for setups and actions: the team's pace, in this game's tempo. */
  paceF(this: GameSim, off: ST) {
    return ((1.12 - 0.24 * (off.t.offense.pace / 100)) / this.env.pace) * (this.q > 4 ? K.otPace : 1);
  },

  lateMode(this: GameSim, off: ST, def: ST): LateMode {
    const diff = off.score - def.score;
    const final = this.q >= 4;
    const clock = this.clock;
    const res = { hold: false, quick: false, milk: false, need3: false, hurry: false, rush: false, dash: false, two: false, slow: false, push: false };
    // (tied, a team holds for the last shot; behind by one or two with time for more than one trip, it
    // goes now and plays on: NBA 2024-26, down one or two, half the shots in the last 24 seconds come before the last 5)
    if (final && clock <= 26 && diff >= -2 && diff <= 0 && (diff === 0 || clock <= K.holdBehind)) res.hold = true;
    else if (!final && clock <= 24 && clock > 3) res.hold = true;
    else if (final && clock < 50 && diff > 0) res.milk = true;
    // the last three minutes of a game still in reach: the leader works the shot clock, the trailing
    // side gets into its offense early (NBA 2024-26: up 1-8 in the last 3:00, 58-59% of trips after
    // the other side scored used 18 seconds or more; behind, about half got a shot off within 8)
    else if (final && clock <= K.lateSlow.from && diff > 0 && diff <= K.lateSlow.lead) res.slow = true;
    if (final && clock <= K.lateSlow.from && clock >= 24 && diff < 0 && diff >= -K.lateSlow.lead) res.push = true;
    if (final && clock <= 35 && diff <= -3 && diff >= -5) res.need3 = true;
    // down one with the last shot: a two wins it
    if (final && clock <= 24 && diff === -1) res.two = true;
    // two possessions or more down late, still within reach: quick shots, more of them threes
    if (final && diff <= -4 && (diff >= -9 || diff >= -3 - clock / 12) && clock > 1 && clock <= 10 + 7 * -diff) res.hurry = true;
    // behind by a possession in the last half minute, not holding for the last shot: it gets a shot up
    // quickly, to have time to foul and come back down
    if (final && diff < 0 && diff >= -3 && clock <= K.lateRush.from && clock > 3 && !res.hold) res.rush = true;
    // and with seconds left it shoots the first look it gets: a make leaves time to foul, a miss to rebound
    if (final && diff < 0 && diff >= -9 && clock <= K.lateRush.dashFrom && !res.hold) res.dash = true;
    if (clock >= 29 && clock <= 40 && !(final && diff > 0) && this.takesTwoForOne(off)) res.quick = true;
    return res;
  },

  /** Whether this coach goes for the two-for-one this period: his habit (ST.habit), decided once a period. */
  takesTwoForOne(this: GameSim, off: ST): boolean {
    const h = off.habit.twoForOne;
    return h >= 1 || (h > 0 && mix(this.seed, 0x2f100000 + 2 * this.q + off.side) / 4294967296 < h);
  },
};

function ordinal(n: number) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

/** "1st quarter" ... "4th quarter", then "OT", "2OT", "3OT" as the box score writes them. */
function periodName(q: number) {
  return q <= 4 ? `${ordinal(q)} quarter` : q === 5 ? 'OT' : `${q - 4}OT`;
}
