// Rebounds and second chances: who wins the board (crashing, getting back, the zones' softer glass,
// each tagged), team rebounds, the putback, and the reset on a 14-second shot clock.

import type { ShotZone } from '../../types';
import { clamp } from '../../random';
import { K } from './constants';
import { TK } from './tk';
import type { SP, ST } from './state';
import type { GameSim } from './game';

export const reboundsMethods = {
  rebound(this: GameSim, off: ST, def: ST, zone: ShotZone, blocked: boolean, ft: boolean) {
    // the ball in the air and the scramble for it: the clock runs (a free throw's miss is live sooner);
    // a shot that went up with time for it comes down before the horn, if only just
    const flight = ft ? this.rng.uniform(K.reboundTime.ft[0], K.reboundTime.ft[1]) : this.rng.uniform(K.reboundTime.shot[0], K.reboundTime.shot[1]);
    this.tick(flight >= this.clock && this.clock > K.reboundTime.horn ? this.clock - this.rng.uniform(0.1, 0.4) : flight);
    // blocked shots sometimes go out of bounds to the offense
    if (blocked && this.rng.chance(0.3)) {
      this.ctx = 'orb';
      this.continueAfterOrb(off, def, null);
      return;
    }
    // the horn sounded with the ball in the air or loose: nobody is credited with a board (NBA 2024-26:
    // 0.04 player rebounds a game at 0:00.0; crediting whoever came down with it, 2.3)
    if (this.atBuzzer()) {
      this.ctx = 'oob';
      this.finishPoss(off, this.possFinish);
      return;
    }
    // the fight for the ball: a loose-ball foul, or two players tied up for a jump ball
    if (this.looseBall(off, def, ft)) return;
    // (a player sent to the glass is in the fight for it more often, one sent back less)
    const inside = this.shapeOf(off) === 'twoIn' ? this.bigTwo(off) : null;
    const offR = off.on.reduce((a, p) => a + Math.pow(p.c.orb * (0.85 + 0.15 * p.energy), 1.2) * this.glassW(p, inside), 0);
    const offR0 = inside ? off.on.reduce((a, p) => a + Math.pow(p.c.orb * (0.85 + 0.15 * p.energy), 1.2) * this.glassW(p), 0) : offR;
    const defR = def.on.reduce((a, p) => a + Math.pow(p.c.drb * (0.85 + 0.15 * p.energy), 1.2), 0);
    // crashing wins offensive boards (the fourth and fifth crasher add less), sending fewer gives them
    // up; sprinting back on the shot (the side's own get-back setting) gives a few up too
    const k = TK.crash;
    const crash = (this.crashOf(off) - 50) / 50;
    const glass = (crash > 0 ? 1 + k.orb * crash - k.fade * crash * crash : 1 + k.low * crash) * (1 - TK.getBack.orb * Math.max(0, (off.t.defense.getBack - 50) / 50));
    let pOrb = K.orbBase * (1 + K.recenter.orb) * Math.pow(offR / defR, 1.05) * glass;
    if (zone === 'c3' || zone === 'ab3') pOrb *= 1.03;
    if (ft) pOrb *= 0.5;
    // the tags count the boards a scheme adds at an average rate: half as many off a free throw
    const orbRate = K.orbBase * (ft ? 0.5 : 1);
    const zd = this.zone(def);
    if (zd) {
      pOrb *= zd.glass;
      this.impact('zone_glass', off.side, orbRate * (zd.glass - 1) * K.orbPts);
    }
    if (glass !== 1) this.impact('crash_orb', off.side, orbRate * (glass - 1) * K.orbPts * K.crashTag.orb);
    // the shape: five-out has nobody near the glass, the double post two bigs under it (as much as they rebound)
    const sgl = this.shapeGlass(off);
    const sg = sgl + (offR0 !== offR ? Math.pow(offR / offR0, 1.05) - 1 : 0);
    if (sgl) pOrb *= 1 + sgl;
    if (sg) this.impact('shape_glass', off.side, orbRate * sg * K.orbPts);
    // switching off-ball screens leaves smalls boxing out bigs
    if (!zd && def.t.defense.switchOffBall) {
      pOrb *= 1 + TK.offBall.glass;
      this.impact('switch_mismatch', off.side, orbRate * TK.offBall.glass * K.orbPts * K.offBallTag.glass);
    }
    pOrb = clamp(pOrb, 0.08, 0.45);
    if (this.rng.chance(pOrb)) {
      // the shooter has a step on his own miss (not on a free throw)
      const ws = off.on.map((p) => Math.pow(p.c.orb, 2) * p.tor * this.glassW(p) * (p === this.lastShooter && !ft ? 1.3 : 1));
      const r = off.on[this.rng.weighted(ws)];
      // a few loose balls are team rebounds (out of bounds off the defense, tie-ups): nobody is credited, and nobody puts it back
      const team = this.rng.chance(K.teamReb.orb);
      if (!team) {
        r.b.orb++;
        off.tot.orb++;
      }
      if (this.record) {
        this.addPbp(off.side, team ? `${off.team.abbrev} team rebound.` : `Offensive rebound ${r.name}.`, 'other');
        this.cur!.steps.push(team ? { k: 'reb' } : { k: 'reb', pid: r.pid });
      }
      this.ctx = 'orb';
      this.continueAfterOrb(off, def, team ? null : r);
      return;
    }
    // the defense has it, but now and then the ball goes out of bounds off it: the offense's ball, a
    // team rebound nobody is credited with (K.teamReb.keep)
    if (!ft && this.rng.chance(K.teamReb.keep)) {
      if (this.record) {
        this.addPbp(off.side, `${off.team.abbrev} team rebound.`, 'other');
        this.cur!.steps.push({ k: 'reb' });
      }
      this.ctx = 'orb';
      this.continueAfterOrb(off, def, null, true);
      return;
    }
    const ws = def.on.map((p) => Math.pow(p.c.drb, 2.2) * p.tdr);
    const r = def.on[this.rng.weighted(ws)];
    const team = this.rng.chance(K.teamReb.drb);
    if (!team) {
      r.b.drb++;
      def.tot.drb++;
    }
    if (this.record) {
      this.cur!.steps.push(team ? { k: 'reb' } : { k: 'reb', pid: r.pid });
      this.addPbp(def.side, team ? `${def.team.abbrev} team rebound.` : `Defensive rebound ${r.name}.`, 'other');
    }
    // (a team rebound is a dead ball, out of bounds off the offense: the trip after it starts with an
    // inbound, not a push; played as a live board, 13.5% of those trips shot or turned it over within
    // 4 seconds, the NBA's 0.7%)
    this.ctx = team ? 'oob' : 'dreb';
    // (a missed three comes off long: the next trip's run-out chance, see TK.longRebound)
    this.longReb = !ft && (zone === 'c3' || zone === 'ab3');
    this.finishPoss(off, this.possFinish);
  },

  /**
   * A loose-ball foul or a held ball on the rebound (see K.looseBall, K.heldBall): true when it settled
   * who has the ball. Either follows the board: the player fouled had it, or position for it, and is
   * credited with it (the NBA logs 84% of its loose-ball fouls right after a rebound at the same
   * clock; replacing the board, they took 1.6 rebounds a team-game off the box). A loose-ball foul on
   * the crashing side hands the ball over (in the penalty, two free throws at the other end first: see
   * `owed`); one on a defender boxing out keeps it for the offense (two free throws in the penalty). A
   * held ball goes to a jump, and the board to the side that wins it. Neither is called at the horn.
   */
  looseBall(this: GameSim, off: ST, def: ST, ft: boolean): boolean {
    const r = this.rng.next();
    if (this.clock <= 0.3) return false;
    if (r < K.looseBall) {
      const onOffense = this.rng.chance(0.45);
      const t = onOffense ? off : def;
      const o = onOffense ? def : off;
      const fouler = t.on[this.rng.weighted(t.on.map((p) => Math.pow(p.c.orb + p.c.drb, 1.5) * p.tpf))];
      const fouled = o.on[this.rng.weighted(o.on.map((p) => Math.pow(p.c.orb + p.c.drb, 1.5)))];
      this.creditBoard(o, fouled, !onOffense);
      if (this.record) {
        this.addPbp(t.side, `Loose ball foul on ${fouler.name}.`, 'foul');
        this.cur!.steps.push({ k: 'foul', pid: fouler.pid, pid2: fouled.pid });
      }
      this.addFoul(t, fouler);
      if (onOffense) {
        if (this.cur && !this.cur.label) this.cur.label = 'Loose ball foul';
        this.ctx = 'deadTO';
        if (this.bonus(off)) this.owed = fouled;
        this.finishPoss(off, this.possFinish);
        return true;
      }
      if (this.bonus(def)) {
        this.freeThrows(off, def, fouled, 2, this.possFinish);
        return true;
      }
      // the offense inbounds it, a 14-second shot clock
      this.secondChance = true;
      this.tick(Math.min(this.rng.uniform(2, 4), Math.max(0, this.clock - 0.3)));
      if (this.clock <= 0.3) {
        this.clockOut(off);
        return true;
      }
      this.shotStart = this.clock + 10;
      this.liveStart = false;
      this.halfCourt(off, def, 14, this.lateMode(off, def), this.paceF(off));
      return true;
    }
    if (r < K.looseBall + K.heldBall && !ft) {
      const a = off.on.reduce((x, p) => (p.c.orb > x.c.orb ? p : x), off.on[0]);
      const b = def.on.reduce((x, p) => (p.c.drb > x.c.drb ? p : x), def.on[0]);
      const offWins = this.rng.chance(0.42);
      if (offWins) this.creditBoard(off, a, true);
      else this.creditBoard(def, b, false);
      if (this.record) this.addPbp(-1, `Jump ball: ${a.name} vs. ${b.name}. ${(offWins ? off : def).team.abbrev} gains possession.`, 'other');
      this.tick(Math.min(this.rng.uniform(2, 5), Math.max(0, this.clock - 0.3)));
      if (offWins && this.clock > 0.3) {
        this.ctx = 'orb';
        this.continueAfterOrb(off, def, null);
        return true;
      }
      if (this.cur && !this.cur.label) this.cur.label = 'Jump ball';
      this.ctx = 'deadTO';
      this.finishPoss(off, this.possFinish);
      return true;
    }
    return false;
  },

  /** A rebound for `p` in the box score and the play-by-play (one the scramble's whistle or tie-up follows). */
  creditBoard(this: GameSim, t: ST, p: SP, offensive: boolean) {
    if (offensive) {
      p.b.orb++;
      t.tot.orb++;
    } else {
      p.b.drb++;
      t.tot.drb++;
    }
    if (this.record) {
      this.addPbp(t.side, `${offensive ? 'Offensive' : 'Defensive'} rebound ${p.name}.`, 'other');
      this.cur!.steps.push({ k: 'reb', pid: p.pid });
    }
  },

  /** A player's weight among the offensive rebounders: his glass duty, and a double post's bigs (`inside`) under the basket. */
  glassW(this: GameSim, p: SP, inside?: SP[] | null) {
    const duty = p.glass === 1 ? TK.glassDuty.crash : p.glass === -1 ? TK.glassDuty.back : 1;
    return inside?.includes(p) ? duty * (1 + TK.shape.twoIn.glass) : duty;
  },

  /** The share of offensive boards five-out gives up (nobody near the glass). */
  shapeGlass(this: GameSim, off: ST) {
    return this.shapeOf(off) === 'fiveOut' ? TK.shape.fiveOut.glass : 0;
  },

  /** `dead`: the ball went out of bounds to the offense (nobody's board): an inbound, no kick-out on the spot. */
  continueAfterOrb(this: GameSim, off: ST, def: ST, rebounder: SP | null, dead = false) {
    this.secondChance = true;
    // (the shot clock is back at 14: ten seconds of a full one gone, for what the look is worth)
    this.shotStart = this.clock + 10;
    this.liveStart = false;
    this.tripActs = 0;
    if (this.clock <= 0.3) {
      this.clockOut(off);
      return;
    }
    // immediate putback for bigs near the rim
    if (rebounder && this.rng.chance(clamp(K.putback.base + (rebounder.r.hgt - 50) / 100 + (rebounder.c.rim - 50) / 150, 0.1, K.putback.max))) {
      this.tick(this.rng.uniform(K.putback.time[0], K.putback.time[1]));
      this.shoot(off, def, {
        shooter: rebounder,
        zone: this.rimOr(rebounder, 0.75),
        open: this.rng.normal(-0.3, 0.3),
        contest: this.rimContester(def, this.defOf(def, rebounder), 1.2),
        assister: null,
        finish: 'putback',
      });
      return;
    }
    // reset with a 14-second shot clock
    const late = this.lateMode(off, def);
    const paceF = this.paceF(off);
    // (often a kick-out on the spot to a shooter, the defense still scrambled back)
    const kick = !dead && this.rng.chance(K.putback.kick);
    const setup = Math.min(kick ? this.rng.uniform(0.2, 0.8) : dead ? this.rng.uniform(2.5, 5) : this.rng.uniform(1.5, 4.5), Math.max(0.3, this.clock * 0.4));
    this.early = kick ? 'kick' : false;
    this.tick(setup);
    if (this.clock <= 0.05) {
      this.clockOut(off);
      return;
    }
    this.halfCourt(off, def, 14 - setup, late, paceF);
  },
};
