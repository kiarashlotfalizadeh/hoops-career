// Handoffs and off-ball screens (Floppy, Elevator, Chicago, Horns from the elbow): the shooter coming
// off it and the hub, the switch that denies it (and the mismatch post-ups and isolations a switched
// handoff hands out), drop's soft spot, the zone's room, a junk defense's top-lock, and the shot.
// Rewritten in November 2026 (tactics v2): every size is in tk.ts.

import { clamp } from '../../random';
import type { FinishType, PossStep } from '../log';
import type { Cast } from '../sets';
import { K } from './constants';
import { TK } from './tk';
import type { SP, ST, LateMode, ActionResult } from './state';
import type { GameSim } from './game';

type Tags = [string, number][];

export const handoffMethods = {
  handoff(this: GameSim, off: ST, def: ST, open: number, late: LateMode, forced: boolean): ActionResult {
    const play = this.takePlay('handoff');
    const Sh = play ? this.useActor(off, play.cast.a) : this.pickActor(off, 'handoff');
    // the hub: best passing big, else best passer
    const hubs = off.on.filter((p) => p !== Sh);
    const B = play
      ? play.cast.b
      : hubs[
          this.rng.weighted(
            hubs.map((p) => Math.pow((p.c.passing + (p.big ? 15 : 0) + (p.role === 'hub' ? 20 : 0)) / 50, 2.5) * Math.sqrt(this.passT(p)) * this.touch(def, off, p)),
          )
        ];
    const D = this.defOf(def, Sh);
    const dB = this.defOf(def, B);
    const pf = this.prefs(off, late);
    // (Floppy and Elevator are off-ball screens; Chicago and the elbow handoff are handoffs)
    const finish: FinishType = play
      ? play.cast.id === 'floppy' || play.cast.id === 'elevator'
        ? 'offscreen'
        : 'handoff'
      : this.rng.chance(Sh.role === 'shooter' ? 0.75 : 0.3)
        ? 'offscreen'
        : 'handoff';
    if (this.cur) {
      if (play || !this.cur.set) this.cur.label = play ? play.label : `${finish === 'offscreen' ? 'Off-ball screen' : 'Handoff'}: ${B.name} to ${Sh.name}`;
      this.cur.steps.push(...(play ? this.handoffSetSteps(play.cast) : [{ k: 'handoff' as const, pid: B.pid, pid2: Sh.pid }]));
    }
    // (the hub's read: the keep, the give or the back-cut, as well as he passes)
    let adv =
      (Sh.c.offBall * Sh.perf - (D.c.perDef * 0.6 + D.c.helpD * 0.4) * this.dq(D)) / 22 +
      (B.r.str + B.r.hgt - 100) / 200 +
      (B.c.passing - K.hubRead.at) / K.hubRead.per +
      this.rng.normal(0, 0.55) +
      open;
    adv += this.blowBy(def, Sh, 'handoff') - this.chaseCatch(def, off, Sh, 'handoff');
    const tags: Tags = [];
    const zd = this.zone(def);
    const sw = !zd && (def.t.defense.pnr === 'switch' || def.t.defense.switchOffBall);
    if (sw) {
      adv -= TK.offBall.handoff;
      tags.push(['switch_deny', -TK.offBall.handoff * 0.5 * K.offBallTag.deny]);
    }
    if (!sw && def.t.defense.pnr === 'drop' && !zd) {
      adv += 0.36;
      tags.push(['drop_handoff', 0.36 * 0.35]);
    }
    // (a chased shooter's chaser trails him off the screen: none of the zone's room)
    if (zd && !this.chased(def, off).includes(Sh)) {
      adv += zd.handoff;
      tags.push([this.openKey(def), zd.handoff * 0.35]);
    }
    // top-locked coming off the screen: a tougher catch, but a defender caught high gives up the curl and the back-cut
    const lk = this.lock(def, off, Sh);
    if (lk) {
      adv -= lk.offScreen;
      tags.push([lk.tag, -lk.offScreen * 0.35]);
    }
    // the ball sticks while the offense waits on the matchup it hunts
    if (this.hunted(off, def)) {
      adv -= TK.hunt.flow;
      tags.push(['hunt', -TK.hunt.flow * 0.35]);
    } else if (off.t.offense.huntMismatch) {
      adv -= TK.hunt.flowAuto;
      tags.push(['hunt', -TK.hunt.flowAuto * 0.35]);
    }
    // the switch puts the shooter's man on the hub and the hub's man on the shooter: a big switched
    // onto a guard gets attacked off the dribble, a guard switched onto a big gets posted up
    if (sw) {
      const k = TK.offBall;
      const isoAdv = (Sh.c.create - dB.c.perDef * this.dq(dB)) / 20;
      const postAdv = (B.c.postScore - D.c.intDef * this.dq(D)) / 20 + (B.r.hgt - D.r.hgt) / 50;
      const edge = Math.max(isoAdv, postAdv);
      if (edge > k.huntFrom && this.rng.chance(clamp((edge - k.huntFrom) * k.hunt, 0, k.huntMax))) {
        if (postAdv >= isoAdv && B.c.postScore > 50) {
          const gain = ((dB.c.intDef * this.dq(dB) - D.c.intDef * this.dq(D)) / 20 + (dB.r.hgt - D.r.hgt) / 70) * K.advPts.post;
          this.impact('switch_mismatch', off.side, gain * K.offBallTag.hunt, B.pid);
          if (this.cur) this.cur.label = `Switch! ${B.name} posts up ${D.name}`;
          this.passStep(Sh, B);
          return this.post(off, def, open + k.scramble, forced, { actor: B, defender: D, tag: 'switch_mismatch', entry: Sh, tagW: K.offBallTag.hunt });
        }
        const swap = (D.c.perDef * this.dq(D) - dB.c.perDef * this.dq(dB)) / 20;
        this.impact('switch_mismatch', off.side, swap * K.advPts.iso * K.offBallTag.hunt, Sh.pid);
        return this.iso(off, def, open + k.scramble, late, forced, { actor: Sh, defender: dB, tag: 'switch_mismatch', tagW: K.offBallTag.hunt });
      }
    }
    const pTO = this.toChance(K.toBase * 0.7, B, def, this.setJump(play, def, B));
    if (this.rng.chance(pTO)) {
      this.turnover(off, def, this.rng.chance(B.ttv / (B.ttv + Sh.ttv)) ? B : Sh, this.stealBy(D, 0.5, true), finish);
      return 'done';
    }
    const advOpen = clamp(adv * 0.35, -0.6, 0.75);
    const opts = [
      Math.pow(Sh.c.c3 / 50, 2.6) * pf.three * 1.25 * Sh.freedom * Sh.t3,
      Math.pow(Sh.c.midShot / 50, 2) * pf.mid * 0.45,
      Math.pow(Sh.c.rim / 50, 1.6) * pf.rim * 0.45 * (1 + this.spacingBonus(off)) * (lk ? 1 + 2 * lk.beat : 1) * this.shapeW(off, Sh).drive,
      Math.pow(B.c.roll / 50, 1.5) * Math.pow(Sh.c.passing / 50, 1.2) * 0.2,
      forced ? 0 : K.continueBase * (adv < 0 ? 1.4 : 0.6),
    ];
    // a set goes for its look
    if (play) (['three', 'mid', 'rim', 'roll'] as const).forEach((slot, i) => (opts[i] *= play.w[slot] ?? 1));
    const c = this.rng.weighted(opts);
    switch (c) {
      case 0: {
        const st: Tags = [...tags];
        const so = play ? this.setOpen(play, 'three', st) : 0;
        this.shoot(off, def, {
          shooter: Sh,
          // (Elevator's doors are at the top of the key)
          zone: play?.cast.id === 'elevator' ? 'ab3' : this.rng.chance(0.2) ? 'c3' : 'ab3',
          open: advOpen - 0.02 + so,
          contest: D,
          assister: B,
          finish,
          tags: st,
        });
        return 'done';
      }
      case 1: {
        // the zone's open threes are for shooters who stay outside
        const key = this.openKey(def);
        const mt = tags.filter(([k]) => k !== key);
        const so = play ? this.setOpen(play, 'mid', mt) : 0;
        this.shoot(off, def, { shooter: Sh, zone: this.midOr(Sh, 0.5), open: advOpen - 0.05 + so, contest: D, assister: B, finish, tags: mt });
        return 'done';
      }
      case 2: {
        if (this.record) this.cur!.steps.push({ k: 'drive', pid: Sh.pid });
        const rt: Tags = [['help_paint', -this.help(def) * 0.4]];
        if (lk) rt.push([lk.beatTag, lk.beat]);
        const roam = this.roamHelp(def, off, Sh, B);
        if (roam) rt.push(['role_roam', -roam]);
        if (play) this.setOpen(play, 'rim', rt);
        const o = advOpen * 0.6 + this.room(Sh, 'rim', rt);
        this.shoot(off, def, { shooter: Sh, zone: 'rim', open: o, contest: this.rimContester(def, D), assister: B, finish, tags: rt, drive: true });
        return 'done';
      }
      case 3: {
        this.passStep(Sh, B);
        const rt: Tags = [];
        const so = play ? this.setOpen(play, 'roll', rt) : 0;
        this.shoot(off, def, { shooter: B, zone: 'rim', open: 0.1 + advOpen * 0.4 + so, contest: dB, assister: Sh, finish: 'pnrRoll', ...(rt.length ? { tags: rt } : {}) });
        return 'done';
      }
      default:
        return { carry: clamp(advOpen * 0.25, -0.1, 0.2), ball: B };
    }
  },

  /** The court's beats for a set run as a handoff: its screens, then the catch or the handoff. */
  handoffSetSteps(this: GameSim, c: Cast<SP>): PossStep[] {
    switch (c.id) {
      case 'floppy':
      case 'elevator': {
        const pins: PossStep[] = [{ k: 'pin', pid: c.c.pid, pid2: c.a.pid }];
        if (c.d) pins.push({ k: 'pin', pid: c.d.pid, pid2: c.a.pid });
        return [...pins, { k: 'pass', pid: c.b.pid, pid2: c.a.pid }];
      }
      case 'chicago':
        return [
          { k: 'pin', pid: c.c.pid, pid2: c.a.pid },
          { k: 'handoff', pid: c.b.pid, pid2: c.a.pid },
        ];
      default:
        return [
          { k: 'pass', pid: c.a.pid, pid2: c.b.pid },
          { k: 'handoff', pid: c.b.pid, pid2: c.a.pid },
        ];
    }
  },
};
