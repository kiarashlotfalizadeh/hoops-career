// Time: the game clock running (players tiring on the floor and resting off it, a chaser or a denier
// tiring faster), the end of a period and the break after it (the possession arrow, the coaches'
// adjustments, a fresh lineup), the pace of setups and actions, and the late-game modes the clock and
// the score put an offense in (hold for the last shot, milk a lead, go for three, hurry, two-for-one).

import { Rng } from '../../random';
import { GAME } from '../../constants';
import { K, levW } from './constants';
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
    this.rng = new Rng(mix(this.seed, 0x7ff00000 + this.q));
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
      const paceMult = 0.9 + (t.t.offense.pace / 100) * 0.2;
      // chasing in a junk defense wears out the chasers
      const off = this.T[1 - t.side];
      const chased = t.side !== this.poss ? this.chased(t, off) : NONE;
      for (const p of t.players) {
        if (p.on) {
          p.b.sec += dt;
          let drain = K.drain * (1.4 - 0.75 * (p.r.end / 100)) * paceMult;
          if (press) drain *= levW(1.15);
          // (and the pressing side runs more of it)
          if (t.t.defense.press !== 'none') drain *= levW(K.pressAdv.drain);
          if (t.t.defense.press === 'always') drain *= levW(1.12);
          if (chased.length && chased.some((c) => t.guardOf.get(c.pid) === p)) drain *= levW(K.chaseDrain);
          // (the chasing roles wear their players down on defense)
          else if (t.side !== this.poss && (p.drole === 'poa' || p.drole === 'stopper')) drain *= K.role.drain;
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
    return (1.12 - 0.24 * (off.t.offense.pace / 100)) / this.env.pace;
  },

  lateMode(this: GameSim, off: ST, def: ST): LateMode {
    const diff = off.score - def.score;
    const final = this.q >= 4;
    const clock = this.clock;
    const res = { hold: false, quick: false, milk: false, need3: false, hurry: false, tie: false };
    if (final && clock <= 26 && diff >= -2 && diff <= 0) res.hold = true;
    else if (!final && clock <= 24 && clock > 3) res.hold = true;
    else if (final && clock < 50 && diff > 0) res.milk = true;
    if (final && clock <= 35 && diff <= -3 && diff >= -5) res.need3 = true;
    // down two with the last shot: most coaches play for the tie
    if (final && clock <= 24 && diff === -2) res.tie = true;
    // two possessions or more down late, still within reach: quick shots, more of them threes
    if (final && diff <= -4 && diff >= -3 - clock / 12 && clock > 1 && clock <= 20 + 10 * -diff) res.hurry = true;
    if (off.t.manage.twoForOne && clock >= 29 && clock <= 40 && !(final && diff > 0)) res.quick = true;
    return res;
  },
};

function ordinal(n: number) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

/** "1st quarter" ... "4th quarter", then "OT", "2OT", "3OT" as the box score writes them. */
function periodName(q: number) {
  return q <= 4 ? `${ordinal(q)} quarter` : q === 5 ? 'OT' : `${q - 4}OT`;
}
