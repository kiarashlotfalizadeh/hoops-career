// Rebounds and second chances: who wins the board (crashing, getting back, the zones' softer glass,
// each tagged), team rebounds, the putback, and the reset on a 14-second shot clock.

import type { ShotZone } from '../../types';
import { clamp } from '../../random';
import { K, lev, levExtra, levW } from './constants';
import { shapeOf } from '../tactics';
import type { SP, ST } from './state';
import type { GameSim } from './game';

export const reboundsMethods = {
  rebound(this: GameSim, off: ST, def: ST, zone: ShotZone, blocked: boolean, ft: boolean) {
    // the ball in the air and the scramble for it: the clock runs (a free throw's miss is live sooner)
    this.tick(ft ? this.rng.uniform(K.reboundTime.ft[0], K.reboundTime.ft[1]) : this.rng.uniform(K.reboundTime.shot[0], K.reboundTime.shot[1]));
    // blocked shots sometimes go out of bounds to the offense
    if (blocked && this.rng.chance(0.3)) {
      this.ctx = 'orb';
      this.continueAfterOrb(off, def, null);
      return;
    }
    // the fight for the ball: a loose-ball foul, or two players tied up for a jump ball
    if (this.looseBall(off, def, ft)) return;
    // (a player sent to the glass is in the fight for it more often, one sent back less)
    const inside = shapeOf(off.t.offense) === 'twoIn' ? this.bigTwo(off) : null;
    const offR = off.on.reduce((a, p) => a + Math.pow(p.c.orb * (0.85 + 0.15 * p.energy), 1.2) * this.glassW(p, inside), 0);
    const offR0 = inside ? off.on.reduce((a, p) => a + Math.pow(p.c.orb * (0.85 + 0.15 * p.energy), 1.2) * this.glassW(p), 0) : offR;
    const defR = def.on.reduce((a, p) => a + Math.pow(p.c.drb * (0.85 + 0.15 * p.energy), 1.2), 0);
    // crashing wins offensive boards (the fourth and fifth crasher add less); sprinting back
    // on the shot (transition D above 50) gives some up
    const crash = (this.crashOf(off) - 50) / 50;
    const glass =
      (1 + lev((crash > 0 ? 0.22 : K.crashLow.orb) * crash) - lev(K.crashFade * Math.max(0, crash) ** 2)) *
      (1 - lev(K.getBackOrb * Math.max(0, (off.t.defense.getBack - 50) / 50)));
    let pOrb = K.orbBase * (1 + levExtra(K.recenter.orb)) * Math.pow(offR / defR, 1.05) * glass;
    if (zone === 'c3' || zone === 'ab3') pOrb *= 1.03;
    if (ft) pOrb *= 0.5;
    // the tags count the boards a scheme adds at an average rate: half as many off a free throw
    const orbRate = K.orbBase * (ft ? 0.5 : 1);
    const zd = this.zone(def);
    if (zd) {
      pOrb *= 1 + lev(zd.glassTag);
      this.impact('zone_glass', off.side, orbRate * lev(zd.glassTag) * K.orbPts);
    }
    if (glass !== 1) this.impact('crash_orb', off.side, orbRate * (glass - 1) * K.orbPts * K.crashTag.orb);
    // the shape: five-out has nobody near the glass, the double post two bigs under it (as much as they rebound)
    const sg = this.shapeGlass(off) + (offR0 !== offR ? Math.pow(offR / offR0, 1.05) - 1 : 0);
    if (this.shapeGlass(off)) pOrb *= 1 + this.shapeGlass(off);
    if (sg) this.impact('shape_glass', off.side, orbRate * sg * K.orbPts);
    // switching off-ball screens leaves smalls boxing out bigs
    if (!zd && def.t.defense.switchOffBall && K.switchGlass) {
      pOrb *= 1 + lev(K.switchGlass);
      this.impact('switch_mismatch', off.side, orbRate * lev(K.switchGlass) * K.orbPts * K.offBallTag.glass);
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
    this.ctx = 'dreb';
    this.finishPoss(off, this.possFinish);
  },

  /**
   * A loose-ball foul or a held ball on the rebound (see K.looseBall, K.heldBall): true when it settled
   * who has the ball. A loose-ball foul on the crashing side hands the ball over; one on a defender
   * boxing out keeps it for the offense (two free throws in the penalty). A held ball goes to a jump.
   */
  looseBall(this: GameSim, off: ST, def: ST, ft: boolean): boolean {
    const r = this.rng.next();
    if (r < K.looseBall) {
      const onOffense = this.rng.chance(0.45);
      const t = onOffense ? off : def;
      const o = onOffense ? def : off;
      const fouler = t.on[this.rng.weighted(t.on.map((p) => Math.pow(p.c.orb + p.c.drb, 1.5) * p.tpf))];
      const fouled = o.on[this.rng.weighted(o.on.map((p) => Math.pow(p.c.orb + p.c.drb, 1.5)))];
      if (this.record) {
        this.addPbp(t.side, `Loose ball foul on ${fouler.name}.`, 'foul');
        this.cur!.steps.push({ k: 'foul', pid: fouler.pid, pid2: fouled.pid });
      }
      this.addFoul(t, fouler);
      if (onOffense) {
        if (this.cur && !this.cur.label) this.cur.label = 'Loose ball foul';
        this.ctx = 'deadTO';
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
      this.halfCourt(off, def, 14, this.lateMode(off, def), this.paceF(off));
      return true;
    }
    if (r < K.looseBall + K.heldBall && !ft) {
      const a = off.on.reduce((x, p) => (p.c.orb > x.c.orb ? p : x), off.on[0]);
      const b = def.on.reduce((x, p) => (p.c.drb > x.c.drb ? p : x), def.on[0]);
      const offWins = this.rng.chance(0.42);
      if (this.record) {
        this.addPbp(-1, `Jump ball: ${a.name} vs. ${b.name}. ${(offWins ? off : def).team.abbrev} gains possession.`, 'other');
        // (the court shows it as a team rebound)
        this.cur!.steps.push({ k: 'reb' });
      }
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

  /** A player's weight among the offensive rebounders: his glass duty, and a double post's bigs (`inside`) under the basket. */
  glassW(this: GameSim, p: SP, inside?: SP[] | null) {
    const duty = p.glass === 1 ? K.glassDuty.crash : p.glass === -1 ? K.glassDuty.back : 1;
    return inside?.includes(p) ? duty * levW(K.shape.twoIn.glassW) : duty;
  },

  /** The share of offensive boards five-out gives up (nobody near the glass). */
  shapeGlass(this: GameSim, off: ST) {
    return shapeOf(off.t.offense) === 'fiveOut' ? lev(K.shape.fiveOut.glass) : 0;
  },

  continueAfterOrb(this: GameSim, off: ST, def: ST, rebounder: SP | null) {
    this.secondChance = true;
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
    const kick = this.rng.chance(K.putback.kick);
    const setup = Math.min(kick ? this.rng.uniform(0.2, 0.8) : this.rng.uniform(1.5, 4.5), Math.max(0.3, this.clock * 0.4));
    this.early = kick ? 'kick' : false;
    this.tick(setup);
    if (this.clock <= 0.05) {
      this.clockOut(off);
      return;
    }
    this.halfCourt(off, def, 14 - setup, late, paceF);
  },
};
