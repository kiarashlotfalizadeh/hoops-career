// The pick-and-roll: the handler and screener (a set's, a hunted defender's man, the preferred
// screeners, the bigs, a screener whose man can't guard the ball when the offense hunts mismatches),
// the coverage this screen gets (see screenCoverage), what each coverage leaves open (pull-ups, the
// drive, the roll, the pop, the kick-out), help and spacing, and the handler's decision. Rewritten
// from scratch in November 2026 (tactics v2): every size is in tk.ts.

import type { ShotZone } from '../../types';
import { clamp } from '../../random';
import { K } from './constants';
import { TK } from './tk';
import type { SP, ST, LateMode, ActionResult } from './state';
import type { GameSim } from './game';

type Tags = [string, number][];

export const pnrMethods = {
  pnr(this: GameSim, off: ST, def: ST, open: number, late: LateMode, forced: boolean): ActionResult {
    // a set (Spain, Horns for a shooting big) names the handler and the screener
    const play = this.takePlay('pnr');
    const H = play ? this.useActor(off, play.cast.a) : this.pickActor(off, 'pnr');
    const S = play ? play.cast.b : this.screenerFor(off, def, H);
    let dH = this.defOf(def, H);
    let dS = this.defOf(def, S);
    const hunted = this.hunted(off, def);
    const { cov } = this.screenCoverage(def, off, H, S, !!play);
    const zone = cov === 'zone' ? this.zone(def) : null;
    if (this.cur) {
      this.cur.coverage = cov;
      // (a trip a set opened keeps its name when it resets into another action)
      if (play || !this.cur.set) this.cur.label = play ? play.label : `P&R: ${H.name} + ${S.name} vs ${cov === 'zone' ? this.zoneName(def) : cov}`;
      this.cur.steps.push({ k: 'screen', pid: S.pid, pid2: H.pid });
      // Spain: the shooter screens the roll man's defender as he dives
      if (play?.cast.id === 'spain') this.cur.steps.push({ k: 'pin', pid: play.cast.c.pid, pid2: S.pid });
    }
    const pf = this.prefs(off, late);
    const horns = this.shapeOf(off) === 'horns';
    const screen = (S.r.str * 0.5 + S.r.hgt * 0.3 + S.r.oiq * 0.2 - 50) / 100 + (horns ? TK.shape.horns.pnr : 0);
    const help = this.help(def);
    const spacing = this.spacingBonus(off);
    let advH = (H.c.pnrHandle * H.perf - dH.c.perDef * this.dq(dH)) / 22 + screen + this.rng.normal(0, 0.55) + open;

    // ---- the switch: the matchup it leaves is played (a rolling screener slips it first now and then)
    if (cov === 'switch') {
      const k = TK.cov.switch;
      if (!play && S.c.roll > 45 && this.rng.chance(k.slip * clamp(S.c.roll / 60, 0.3, 1.5))) {
        this.passStep(H, S);
        this.shoot(off, def, {
          shooter: S,
          zone: this.rimOr(S, 0.75),
          open: k.slipOpen - 0.1 + open,
          contest: this.rimContester(def, dS, 1),
          assister: H,
          finish: 'pnrRoll',
          tags: [['switch_slip', k.slipOpen]],
        });
        return 'done';
      }
      // after the switch: H vs dS (often a big), S vs dH (often a guard)
      const isoAdv = (H.c.create - dS.c.perDef * this.dq(dS)) / 20;
      const postAdv = (S.c.postScore - dH.c.intDef * this.dq(dH)) / 20 + (S.r.hgt - dH.r.hgt) / 50;
      this.impact('switch_screen', def.side, K.switchScreen, H.pid);
      if (postAdv > isoAdv + 0.25 && S.c.postScore > 50 && this.rng.chance(k.post)) {
        const gain = ((dS.c.intDef * this.dq(dS) - dH.c.intDef * this.dq(dH)) / 20 + (dS.r.hgt - dH.r.hgt) / 70) * K.advPts.post;
        this.impact('switch_mismatch', off.side, gain * K.switchTag, S.pid);
        this.passStep(H, S);
        return this.post(off, def, open + 0.1 + k.scramble, forced, { actor: S, defender: dH, tag: 'switch_mismatch', entry: H, tagW: K.switchTag });
      }
      // (the switch is a step late on a quick handler: a scramble on top of the matchup)
      const swap = (dH.c.perDef * this.dq(dH) - dS.c.perDef * this.dq(dS)) / 20;
      const lag = k.scramble + (k.speed * Math.max(0, H.r.spd - dS.r.spd)) / 50;
      this.impact('switch_mismatch', off.side, (swap + lag) * K.advPts.iso * K.switchTag, H.pid);
      return this.iso(off, def, open + lag, late, forced, { actor: H, defender: dS, tag: 'switch_mismatch', fromPnr: true });
    }

    // a chased handler catches it late
    advH -= this.chaseCatch(def, off, H, 'pnr');
    if (cov !== 'blitz') advH += this.blowBy(def, H, 'pnr');
    if (hunted === H) this.huntEdge(def, dH, 'pnr', H.pid);
    // screen-hunting: a weak defender dragged into the two-man game can't hold up his end of the coverage
    if (hunted === S && cov !== 'zone') {
      const edge = clamp(this.huntGap(def, dS, 'pnr') / TK.hunt.screenEdge, -0.4, 0.8) * 2;
      advH += edge;
      this.impact('hunt', off.side, edge * K.advPts.pnr, H.pid);
    }
    let pull = 0;
    let rim = 0;
    let roll = 0;
    let pop = 0;
    let kick = 0.05;
    let toExtra = 0;
    const tPull: Tags = [];
    const tRim: Tags = [];
    const tRoll: Tags = [];
    const tPop: Tags = [];
    const tKick: Tags = [];
    let shoots = 1;
    let driveW = 1;
    let shortW = 1;
    let rimPull = 1;
    let rollPull = 1;

    if (cov === 'drop') {
      // the big sags: the handler's pull-ups open, the drive and the roll walled by his rim protection
      const k = TK.cov.drop;
      const deep = k.rim + (dS.c.rimProt - 50) / k.rimProt;
      pull += k.pull;
      tPull.push(['drop_pullup', k.pull]);
      rim -= deep;
      tRim.push(['drop_rim', -deep]);
      roll -= k.roll;
      tRoll.push(['drop_rim', -k.roll]);
      if (S.c.pop > 55) {
        pop += k.pop;
        tPop.push(['drop_pop', k.pop]);
      }
      rimPull = k.contest;
      rollPull = 1 + (k.contest - 1) * 0.6;
    } else if (cov === 'hedge') {
      const k = TK.cov.hedge;
      const recover = (dS.r.spd - S.r.spd) / k.speed + (dS.r.diq - 50) / 150;
      advH -= k.stall;
      this.impact('hedge_stall', def.side, k.stall * 0.08, H.pid);
      roll += k.roll - recover;
      tRoll.push(['hedge_roll', k.roll - recover]);
      kick += k.kick;
      tKick.push(['hedge_rotate', k.kick]);
      toExtra += k.to;
      shortW = 1.8;
    } else if (cov === 'blitz') {
      const k = TK.cov.blitz;
      shoots = k.shoot;
      driveW = 0.1;
      shortW = k.short;
      const trap = ((dH.c.steal + dS.c.steal) / 2 + (dH.r.hgt + dS.r.hgt) / 4 - 50) / 100;
      const escape = (H.c.passing - 55) / k.per;
      const pTrap = clamp(k.to + trap * k.hands - escape * k.escape, 0.02, 0.18);
      toExtra += pTrap;
      this.impact('blitz_to', def.side, pTrap * H.ttv * K.toPts, H.pid);
      // the 4-on-3 behind the trap: as good as the handler's escape and the short-roll big's passing
      const four = Math.max(0.2, k.fourThree + escape * 0.6 + (S.c.passing - 50) / 150);
      roll += four;
      tRoll.push(['blitz_4v3', four]);
      kick += four * 0.9;
      tKick.push(['blitz_4v3', four * 0.9]);
      if (this.record) this.cur!.steps.push({ k: 'trap', pid: H.pid });
    } else if (cov === 'ice') {
      // the side screen pushed to the baseline: the middle taken away, the weak side's corner open
      const k = TK.cov.ice;
      pull -= k.pull;
      tPull.push(['ice_contain', -k.pull]);
      rim -= k.rim;
      tRim.push(['ice_contain', -k.rim]);
      roll -= k.roll;
      tRoll.push(['ice_contain', -k.roll]);
      kick += k.kick;
      tKick.push(['ice_corner', k.kick]);
      toExtra += k.to;
    } else if (zone) {
      advH -= zone.pnr - this.zoneHide(def, dH);
      this.impact('zone_paint', def.side, zone.pnr * 0.1);
      // the back line waits for the roller, as a drop big does
      roll -= zone.roll;
      tRoll.push(['zone_paint', -zone.roll]);
      kick += zone.kick;
      tKick.push([this.openKey(def), zone.kick]);
      // (a chased screener's chaser stays with him)
      if (!this.chased(def, off).includes(S)) {
        pop += zone.pop;
        tPop.push([this.openKey(def), zone.pop]);
      }
    }
    // a screener top-locked off the ball pops into a hand in his face
    const sLock = this.lock(def, off, S);
    if (sLock) {
      pop -= sLock.c3;
      tPop.push([sLock.tag, -sLock.c3]);
    }
    // roamers off their men help at the rim
    const roam = this.roamHelp(def, off, H, S);
    if (roam) {
      rim -= roam;
      tRim.push(['role_roam', -roam]);
      roll -= roam;
      tRoll.push(['role_roam', -roam]);
    }
    // help and spacing on the drive, and the kick-out the help leaves
    rim += spacing * 0.6 - help * 0.56;
    if (help !== 0) {
      tRim.push(['help_paint', -help * 0.56]);
      kick += help * 0.6;
      tKick.push(['help_kick', help * 0.6]);
    }
    if (spacing !== 0) tRim.push(['spacing', spacing * 0.6]);
    // a set's edges against this coverage, and what the defense has read of it
    if (play) {
      roll += this.setOpen(play, 'roll', tRoll);
      pop += this.setOpen(play, 'pop', tPop);
      kick += this.setOpen(play, 'kick', tKick);
      rim += this.setOpen(play, 'drive', tRim);
    }

    // turnover: the screener's man makes the play now and then (a pocket pass to the roller jumped)
    const pTO = this.toChance(K.toBase * 1.05, H, def, toExtra + this.setJump(play, def, H) + this.driveRisk(off) * 0.4);
    if (this.rng.chance(pTO)) {
      const onRoll = !this.rng.chance(0.6);
      this.turnover(off, def, H, this.stealBy(onRoll ? dS : dH, 0.6, !onRoll), onRoll ? 'pnrRoll' : 'pnrBH');
      return 'done';
    }
    // non-shooting foul: free throws in the penalty, else a side out
    if (this.nonShootingFoul(off, def, H, dH, 'pnrBH')) return 'done';
    if (this.sideOut) {
      if (forced) return { carry: 0, ball: H };
      this.sideOutInbound();
    }
    if (!dH.on || !dS.on) {
      dH = this.defOf(def, H);
      dS = this.defOf(def, S);
    }

    // the handler's decision: a high-usage handler looks for his own shot more, a low-usage one moves it on
    const fr = H.freedom * this.selfShot(H);
    const shape = this.shapeW(off, H);
    const opts = [
      shoots * Math.pow(H.c.pu3 / 50, 2.4) * pf.three * 0.27 * fr * H.t3 * (1 + pull), // pull-up 3
      shoots * Math.pow(H.c.midShot / 50, 2.2) * pf.mid * 0.17 * fr * Math.sqrt(H.tm) * (1 + pull), // pull-up 2
      shoots * driveW * shape.drive * Math.pow(H.c.rim / 50, 1.6) * pf.rim * 0.32 * fr * H.td * Math.max(0.1, 1 + advH * 0.4 + rim * 0.5), // drive
      TK.rollW *
        Math.pow(H.c.passing / 50, 1.2) *
        this.passT(H) *
        Math.pow(Math.max(S.c.roll, 5) / 50, 1.5) *
        (Math.pow(S.tu, 0.75) / Math.sqrt(S.tcr)) *
        Math.max(0.1, 1 + roll) *
        (S.c.pop > S.c.roll ? 0.4 : 1) *
        pf.two, // roll
      S.c.pop > 50
        ? Math.pow(H.c.passing / 50, 1.2) *
          this.passT(H) *
          Math.pow(S.c.pop / 50, 2) *
          (Math.pow(S.tu, 0.75) / Math.sqrt(S.tcr)) *
          0.35 *
          pf.three *
          S.t3 *
          Math.max(0.1, 1 + pop) *
          (sLock?.kickW ?? 1)
        : 0.01, // pop
      Math.pow(H.c.passing / 50, 1.3) * this.passT(H) * (off.spacing / 50) * 0.78 * Math.max(0.1, 1 + kick), // kick out
      forced ? 0 : K.continueBase * (advH < 0 ? 1.6 : 0.7) * (late.hold ? 0.5 : 1), // reset
    ];
    // a set goes for its look
    if (play) (['pull3', 'pull2', 'drive', 'roll', 'pop', 'kick'] as const).forEach((slot, i) => (opts[i] *= play.w[slot] ?? 1));
    const c = this.rng.weighted(opts);
    const advOpen = clamp(advH * 0.35, -0.6, 0.7);
    switch (c) {
      case 0:
        this.shoot(off, def, {
          shooter: H,
          zone: 'ab3',
          open: advOpen * 0.7 + this.room(H, 'pu3', tPull) - 0.17 + open,
          contest: dH,
          assister: null,
          finish: 'pnrBH',
          tags: tPull,
          pullup: true,
        });
        return 'done';
      case 1: {
        const z = this.midOr(H, 0.45);
        this.shoot(off, def, {
          shooter: H,
          zone: z,
          open: advOpen + this.room(H, z === 'mid' ? 'mid' : 'paint', tPull) - 0.05 + open,
          contest: dH,
          assister: null,
          finish: 'pnrBH',
          tags: tPull,
          pullup: true,
        });
        return 'done';
      }
      case 2: {
        if (this.record) this.cur!.steps.push({ k: 'drive', pid: H.pid });
        const z: ShotZone = this.rimOr(H, 0.68);
        this.shoot(off, def, {
          shooter: H,
          zone: z,
          open: advOpen + this.room(H, z === 'rim' ? 'rim' : 'paint', tRim) - 0.05 + open,
          contest: z === 'rim' ? this.rimContester(def, dH, rimPull) : dS,
          assister: null,
          finish: 'pnrBH',
          tags: tRim,
          drive: true,
        });
        return 'done';
      }
      case 3: {
        this.passStep(H, S);
        const short = clamp(0.04 + (S.c.passing - 50) / 300, 0.01, 0.2) * Math.sqrt(this.passT(S)) * shortW;
        if (this.rng.chance(clamp(short, 0, 0.5))) {
          // the short roll: the screener makes the next play, a kick-out to a shooter
          const sh = this.kickTarget(off, H, S);
          this.passStep(S, sh);
          const kt: Tags = tRoll.filter(([, x]) => x > 0).map(([key, x]): [string, number] => [key, x * 0.5]);
          this.spotUp(off, def, {
            shooter: sh,
            zone: this.cornerOrWing(off, sh),
            open: 0.12 + this.room(sh, 'c3', kt) + open,
            contest: this.defOf(def, sh),
            assister: S,
            finish: 'spotup',
            tags: kt,
          });
          return 'done';
        }
        const rollAdv = (S.c.roll - dS.c.intDef * this.dq(dS)) / 25;
        const z = this.rimOr(S, 0.75);
        this.shoot(off, def, {
          shooter: S,
          zone: z,
          open: rollAdv * 0.4 + this.room(S, z === 'rim' ? 'rim' : 'paint', tRoll) - 0.32 + open,
          contest: cov === 'blitz' ? this.rimContester(def, null, 1) : this.rimContester(def, dS, rollPull),
          assister: H,
          finish: 'pnrRoll',
          tags: tRoll,
        });
        return 'done';
      }
      case 4:
        this.passStep(H, S);
        this.shoot(off, def, { shooter: S, zone: 'ab3', open: this.room(S, 'c3', tPop) + 0.05 + open, contest: dS, assister: H, finish: 'pnrRoll', tags: tPop });
        return 'done';
      case 5: {
        // Spain: the kick-out is the back screener's three (his man helped on the roll)
        const sh = play?.cast.id === 'spain' ? play.cast.c : this.kickTarget(off, H, S);
        this.passStep(H, sh);
        const d = this.defOf(def, sh);
        const closeout = (d.c.perDef * this.dq(d) - 50) / 200;
        this.spotUp(off, def, {
          shooter: sh,
          zone: this.cornerOrWing(off, sh),
          open: this.room(sh, 'c3', tKick) + advOpen * 0.4 - closeout + 0.03 + open,
          contest: d,
          assister: H,
          finish: 'spotup',
          tags: tKick,
        });
        return 'done';
      }
      default:
        return { carry: clamp(advOpen * 0.3, -0.1, 0.2), ball: H };
    }
  },

  /**
   * The screener for a ball screen: a hunted defender's man more often than not (a switch puts the
   * hunted man on the ball), else the first preferred screener on the floor, else the bigs, rollers
   * and poppers by how well they screen and finish, tilted (when the offense hunts mismatches) toward
   * the one whose man can't guard the ball.
   */
  screenerFor(this: GameSim, off: ST, def: ST, H: SP): SP {
    const hunted = this.hunted(off, def);
    if (hunted && hunted !== H && this.rng.chance(TK.hunt.screen)) return hunted;
    for (const pid of off.t.offense.screeners) {
      const s = off.on.find((p) => p.pid === pid && p !== H);
      if (s) return s;
    }
    // (hunting mismatches: the screener whose man is the weakest on-ball defender on the floor, to bring him into the action)
    const huntAvg = off.t.offense.huntMismatch && !hunted ? def.on.reduce((a, d) => a + d.c.perDef * this.dq(d), 0) / Math.max(1, def.on.length) : null;
    const ws = off.on.map((p) => {
      if (p === H) return 0;
      let w = Math.max(p.c.roll, p.c.pop * 0.9) * (p.big ? 2 : 0.6);
      if (p.role === 'roller' || p.role === 'stretch' || p.role === 'hub') w *= 1.6;
      if (huntAvg !== null) {
        const d = this.defOf(def, p);
        w *= Math.exp(TK.hunt.tilt * clamp((huntAvg - d.c.perDef * this.dq(d)) / TK.hunt.weakPer, TK.hunt.tiltMin, TK.hunt.tiltMax));
      }
      return Math.pow(w / 50, 2) * Math.pow(p.tu, 0.75);
    });
    return off.on[this.rng.weighted(ws)];
  },
};
