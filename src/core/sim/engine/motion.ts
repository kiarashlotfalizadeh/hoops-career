// Motion: ball movement, cuts and drive-and-kick (Hammer's baseline drive and corner three), against
// help and the zone's walls, backdoor cuts against pressure, a switching defense's cross-screen
// mismatch, top-locked players back-cutting, sagging off non-shooters, and the shape's drives and
// cuts. Rewritten in November 2026 (tactics v2): every size is in tk.ts.

import type { ShotZone } from '../../types';
import { clamp } from '../../random';
import { K } from './constants';
import { TK } from './tk';
import type { SP, ST, LateMode, ActionResult } from './state';
import type { GameSim } from './game';

type Tags = [string, number][];

export const motionMethods = {
  motion(this: GameSim, off: ST, def: ST, open: number, ballFrom: SP | null, late: LateMode, forced: boolean): ActionResult {
    // Hammer: its driver starts it with the ball, and the drive's kick-out goes to its corner shooter
    const play = this.takePlay('motion');
    const pf = this.prefs(off, late);
    const help = this.help(def);
    const pr = this.pressure(def);
    const zone = this.zone(def);
    let adv = (off.passQ - def.helpQ) / 22 + this.spacingBonus(off) * 0.8 + this.rng.normal(0, 0.55) + open;
    const sw = def.t.defense.switchOffBall && !zone;
    if (sw) {
      adv -= TK.offBall.motion;
      this.impact('switch_deny', def.side, TK.offBall.motion * 0.2 * K.offBallTag.deny);
    }
    // the ball sticks while the offense waits on the matchup it hunts
    if (this.hunted(off, def)) {
      adv -= TK.hunt.flow;
      this.impact('hunt', def.side, TK.hunt.flow * 0.1);
    } else if (off.t.offense.huntMismatch) {
      adv -= TK.hunt.flowAuto;
      this.impact('hunt', def.side, TK.hunt.flowAuto * 0.1);
    }
    if (this.cur && (play || !this.cur.set)) this.cur.label = play ? play.label : zone ? `Ball movement vs ${this.zoneName(def)}` : 'Motion offense';
    // the ball swings: after a reset it often finds the offense's hub before the next action
    const passer = play
      ? this.useActor(off, play.cast.a)
      : ballFrom && this.rng.chance(0.5)
        ? ballFrom
        : off.on[this.rng.weighted(off.on.map((p) => Math.pow(Math.max(5, p.c.passing) / 50, 2) * this.passT(p) * this.touch(def, off, p)))];
    const pTO = this.toChance(K.toBase * 0.8, passer, def, this.setJump(play, def, passer));
    if (this.rng.chance(pTO)) {
      this.turnover(off, def, passer, this.stealBy(this.stealer(def), 0.6), 'spotup');
      return 'done';
    }
    // a guard-to-big cross-screen against a switching defense now and then leaves the smallest
    // defender on the best post scorer (not in a set: it's a play of its own)
    if (sw && !play) {
      const P = off.on.filter((p) => p !== passer && p.big).sort((a, b) => b.c.postScore - a.c.postScore)[0];
      const small = off.on.filter((p) => p !== P && p !== passer).sort((a, b) => a.r.hgt - b.r.hgt)[0];
      const own = P && this.defOf(def, P);
      const nd = small && this.defOf(def, small);
      if (P && own && nd && nd !== own && P.c.postScore > 50 && P.r.hgt - nd.r.hgt >= TK.offBall.crossSize && this.rng.chance(TK.offBall.cross)) {
        const gain = ((own.c.intDef * this.dq(own) - nd.c.intDef * this.dq(nd)) / 20 + (own.r.hgt - nd.r.hgt) / 70) * K.advPts.post;
        this.impact('switch_mismatch', off.side, gain * K.offBallTag.cross, P.pid);
        if (this.cur) this.cur.label = `Switch! ${P.name} posts up ${nd.name}`;
        this.passStep(passer, P);
        return this.post(off, def, open + TK.offBall.scramble, forced, { actor: P, defender: nd, tag: 'switch_mismatch', entry: passer, tagW: K.offBallTag.cross });
      }
    }
    const cutters = off.on.filter((p) => p !== passer);
    // (a top-locked player back-cuts the defender caught high)
    const cutW = cutters.map(
      (p) =>
        ((Math.pow(p.c.cut / 50, 2.2) * Math.pow(p.tu, 0.75) * (p.role === 'slasher' || p.role === 'roller' ? 1.4 : 1)) / Math.sqrt(p.tcr)) *
        (this.lock(def, off, p)?.cutW ?? 1) *
        this.shapeW(off, p).cut,
    );
    const advOpen = clamp(adv * 0.35, -0.6, 0.75);
    // backdoor cuts punish ball pressure and denial
    const backdoor = Math.max(0, pr) * 0.6;
    const zoneCut = zone ? -zone.cutW : 0;
    const opts = [
      (cutW.reduce((a, b) => a + b, 0) / 4) * 0.25 * Math.max(0.1, 1 + backdoor + zoneCut) * pf.rim, // cut
      Math.pow(off.spacing / 50, 1.2) * 0.85 * pf.three * (zone ? zone.swingW : 1), // swing for a spot-up three
      0.6 * pf.rim * (1 + this.spacingBonus(off)) * (this.shapeOf(off) === 'fiveOut' ? TK.shape.fiveOut.driveW : 1), // drive and kick
      Math.pow(Math.max(...off.on.map((p) => p.c.midShot)) / 50, 2) * 0.25 * pf.mid, // flare / mid
      forced ? 0 : K.continueBase * (adv < 0 ? 1.5 : 0.7),
    ];
    // a set goes for its look
    if (play) (['cut', 'swing', 'drive', 'mid'] as const).forEach((slot, i) => (opts[i] *= play.w[slot] ?? 1));
    const c = this.rng.weighted(opts);
    switch (c) {
      case 0: {
        const cutter = cutters[this.rng.weighted(cutW)];
        if (this.record) this.cur!.steps.push({ k: 'cut', pid: cutter.pid });
        this.passStep(passer, cutter);
        const tags: Tags = [];
        if (backdoor > 0) tags.push(['pressure_backdoor', backdoor * 0.8]);
        if (zone) tags.push(['zone_paint', -zone.cut]);
        const cd = this.defOf(def, cutter);
        const lk = this.lock(def, off, cutter);
        if (lk) tags.push([lk.beatTag, lk.beat]);
        const roam = this.roamHelp(def, off, cutter, passer);
        if (roam) tags.push(['role_roam', -roam]);
        const z = this.rimOr(cutter, 0.8);
        const o = advOpen - 0.06 + (cutter.c.cut - cd.c.helpD * this.dq(cd)) / 100 + this.room(cutter, z === 'rim' ? 'rim' : 'paint', tags);
        this.shoot(off, def, { shooter: cutter, zone: z, open: o, contest: this.rimContester(def, cd), assister: passer, finish: 'cut', tags });
        return 'done';
      }
      case 1: {
        const sh = this.kickTarget(off, passer);
        this.passStep(passer, sh);
        const tags: Tags = [];
        if (zone) tags.push([this.openKey(def), zone.swing]);
        if (help !== 0) tags.push(['help_kick', help * 0.3]);
        const d = this.defOf(def, sh);
        this.spotUp(off, def, {
          shooter: sh,
          zone: zone && this.rng.chance(zone.corner) ? 'c3' : this.cornerOrWing(off, sh),
          open: advOpen + 0.08 + this.room(sh, 'c3', tags),
          contest: d,
          assister: passer,
          finish: 'spotup',
          tags,
        });
        return 'done';
      }
      case 2: {
        const drivers = off.on.filter((p) => p !== passer);
        const dr = play
          ? passer
          : drivers[
              this.rng.weighted(
                drivers.map((p) => Math.pow(Math.max(5, p.c.create) / 50, 2.5) * p.freedom * p.td * p.tu * Math.sqrt(p.tcr) * this.touch(def, off, p) * this.shapeW(off, p).drive),
              )
            ];
        if (this.record) this.cur!.steps.push({ k: 'drive', pid: dr.pid });
        const d = this.defOf(def, dr);
        const dAdv = (dr.c.create - d.c.perDef * this.dq(d)) / 20 + advOpen + (zone ? this.zoneHide(def, d) - zone.drive : 0);
        // (Hammer's baseline drive is run to kick it to the corner)
        const kickP = play ? 0.75 + help * 0.3 : 0.45 + dr.c.passing / 200 + help * 0.3;
        if (this.rng.chance(clamp(kickP, 0.2, play ? 0.9 : 0.8))) {
          // the kick-out after the defense collapses
          const sh = play ? play.cast.b : this.kickTarget(off, dr);
          if (play && this.record) this.cur!.steps.push({ k: 'pin', pid: play.cast.c.pid, pid2: sh.pid });
          this.passStep(dr, sh);
          const tags: Tags = [['help_kick', Math.max(0, help) * 0.6]];
          if (play) this.setOpen(play, 'kick', tags);
          const ko = 0.12 + Math.max(0, dAdv) * 0.2 + this.room(sh, 'c3', tags);
          this.spotUp(off, def, { shooter: sh, zone: play ? 'c3' : this.cornerOrWing(off, sh), open: ko, contest: this.defOf(def, sh), assister: dr, finish: 'spotup', tags });
        } else {
          const z: ShotZone = this.rimOr(dr, 0.6);
          const tags: Tags = [
            ['help_paint', -help * 0.5],
            ['spacing', this.spacingBonus(off) * 0.4],
          ];
          const roam = this.roamHelp(def, off, dr, passer);
          if (roam) tags.push(['role_roam', -roam]);
          const o = dAdv * 0.35 + this.room(dr, z === 'rim' ? 'rim' : 'paint', tags);
          if (this.rng.chance(this.driveRisk(off))) {
            this.turnover(off, def, dr, null, 'spotup');
            return 'done';
          }
          this.shoot(off, def, { shooter: dr, zone: z, open: o, contest: z === 'rim' ? this.rimContester(def, d) : d, assister: passer, finish: 'spotup', tags, drive: true });
        }
        return 'done';
      }
      case 3: {
        const sh = off.on[this.rng.weighted(off.on.map((p) => Math.pow(p.c.midShot / 50, 3) * p.freedom * Math.pow(p.tu, 0.75) * p.tm * this.touch(def, off, p)))];
        if (sh !== passer) this.passStep(passer, sh);
        this.shoot(off, def, { shooter: sh, zone: 'mid', open: advOpen * 0.5, contest: this.defOf(def, sh), assister: sh === passer ? null : passer, finish: 'spotup' });
        return 'done';
      }
      default:
        return { carry: clamp(advOpen * 0.25, -0.1, 0.25), ball: passer };
    }
  },
};
