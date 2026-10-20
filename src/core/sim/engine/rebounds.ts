// Rebounds and second chances: who wins the board (crashing, getting back, the zones' softer glass,
// each tagged), team rebounds, the putback, and the reset on a 14-second shot clock.

import type { ShotZone } from '../../types';
import { clamp } from '../../random';
import { K, lev, levExtra } from './constants';
import type { SP, ST } from './state';
import type { GameSim } from './game';

export const reboundsMethods = {
  rebound(this: GameSim, off: ST, def: ST, zone: ShotZone, blocked: boolean, ft: boolean) {
    // blocked shots sometimes go out of bounds to the offense
    if (blocked && this.rng.chance(0.3)) {
      this.ctx = 'orb';
      this.continueAfterOrb(off, def, null);
      return;
    }
    const offR = off.on.reduce((a, p) => a + Math.pow(p.c.orb * (0.85 + 0.15 * p.energy), 1.2), 0);
    const defR = def.on.reduce((a, p) => a + Math.pow(p.c.drb * (0.85 + 0.15 * p.energy), 1.2), 0);
    // crashing wins offensive boards (the fourth and fifth crasher add less); sprinting back
    // on the shot (transition D above 50) gives some up
    const crash = (off.t.offense.crashBoards - 50) / 50;
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
    if (glass !== 1) this.impact('crash_orb', off.side, orbRate * (glass - 1) * K.orbPts);
    // switching off-ball screens leaves smalls boxing out bigs
    if (!zd && def.t.defense.switchOffBall && K.switchGlass) {
      pOrb *= 1 + lev(K.switchGlass);
      this.impact('switch_mismatch', off.side, orbRate * lev(K.switchGlass) * K.orbPts);
    }
    pOrb = clamp(pOrb, 0.08, 0.45);
    if (this.rng.chance(pOrb)) {
      // the shooter has a step on his own miss (not on a free throw)
      const ws = off.on.map((p) => Math.pow(p.c.orb, 2) * p.tor * (p === this.lastShooter && !ft ? 1.3 : 1));
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

  continueAfterOrb(this: GameSim, off: ST, def: ST, rebounder: SP | null) {
    this.secondChance = true;
    if (this.clock <= 0.3) {
      this.clockOut(off);
      return;
    }
    // immediate putback for bigs near the rim
    if (rebounder && this.rng.chance(clamp(0.25 + (rebounder.r.hgt - 50) / 100 + (rebounder.c.rim - 50) / 150, 0.1, 0.65))) {
      this.tick(this.rng.uniform(0.8, 2.5));
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
    const setup = Math.min(this.rng.uniform(1.5, 4), Math.max(0.3, this.clock * 0.4));
    this.tick(setup);
    if (this.clock <= 0.05) {
      this.clockOut(off);
      return;
    }
    this.halfCourt(off, def, 14 - setup, late, paceF);
  },
};
