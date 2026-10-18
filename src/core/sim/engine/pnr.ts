// The pick-and-roll: the handler and screener (a set's, a hunted defender's man, the preferred
// screeners, the bigs), the coverage (drop, switch, hedge, blitz, ice or the zone, a blitz on a doubled
// star), what each leaves open (pull-ups, the drive, the roll, the pop, the kick-out), the
// instructions on the handler and screener, help and spacing, and the handler's decision.

import type { PnrCoverage, ShotZone } from '../../types';
import { clamp } from '../../random';
import { K } from './constants';
import type { SP, ST, LateMode, ActionResult } from './state';
import type { GameSim } from './game';

export const pnrMethods = {
  pnr(this: GameSim, off: ST, def: ST, open: number, late: LateMode, forced: boolean): ActionResult {
    // a set (Spain, Horns for a shooting big) names the handler and the screener
    const play = this.takePlay('pnr');
    const H = play ? this.useActor(off, play.cast.a) : this.pickActor(off, 'pnr');
    // hunting a defender: the player he guards sets the screen more often than not, so a switch
    // puts him on the ball handler
    const hunted = this.hunted(off, def);
    let S: SP | undefined = play ? play.cast.b : hunted && hunted !== H && this.rng.chance(K.hunt.screen) ? hunted : undefined;
    // screener: the first preferred screener on the floor, else bigs / rollers / poppers
    if (!S)
      for (const pid of off.t.offense.screeners) {
        S = off.on.find((p) => p.pid === pid && p !== H);
        if (S) break;
      }
    if (!S) {
      const ws = off.on.map((p) => {
        if (p === H) return 0;
        let w = Math.max(p.c.roll, p.c.pop * 0.9) * (p.big ? 2 : 0.6);
        if (p.role === 'roller' || p.role === 'stretch' || p.role === 'hub') w *= 1.6;
        if (off.t.offense.huntMismatch && !hunted) {
          const d = this.defOf(def, p);
          w *= Math.exp(clamp((60 - d.c.perDef) / 30, -0.4, 0.9));
        }
        return Math.pow(w / 50, 2) * Math.pow(p.tu, 0.75);
      });
      S = off.on[this.rng.weighted(ws)];
    }
    let dH = this.defOf(def, H);
    let dS = this.defOf(def, S);
    const zone = this.zone(def);
    let cov: PnrCoverage | 'zone' = zone ? 'zone' : def.t.defense.pnr;
    // star plan double -> blitz the star
    const star = this.starTarget(def, off);
    if (star === H && def.t.defense.starPlan === 'double' && !zone) cov = 'blitz';
    if (this.cur) {
      this.cur.coverage = cov;
      // (a trip a set opened keeps its name when it resets into another action)
      if (play || !this.cur.set) this.cur.label = play ? play.label : `P&R: ${H.name} + ${S.name} vs ${cov === 'zone' ? this.zoneName(def) : cov}`;
      this.cur.steps.push({ k: 'screen', pid: S.pid, pid2: H.pid });
      // Spain: the shooter screens the roll man's defender as he dives
      if (play?.cast.id === 'spain') this.cur.steps.push({ k: 'pin', pid: play.cast.c.pid, pid2: S.pid });
    }
    const pf = this.prefs(off, late);
    const screen = (S.r.str * 0.5 + S.r.hgt * 0.3 + S.r.oiq * 0.2 - 50) / 100;
    const help = this.help(def);
    const spacing = this.spacingBonus(off);
    let advH = (H.c.pnrHandle * H.perf - dH.c.perDef * this.dq(dH)) / 22 + screen + this.rng.normal(0, 0.55) + open;

    // ---- coverage branches
    if (cov === 'switch') {
      // after the switch: H vs dS (often a big), S vs dH (often a guard). The switch takes away
      // the screen's advantage; the offense gains (or loses) whatever the new matchup is worth
      // compared with the one it had
      const isoAdv = (H.c.create - dS.c.perDef * this.dq(dS)) / 20;
      const postAdv = (S.c.postScore - dH.c.intDef * this.dq(dH)) / 20 + (S.r.hgt - dH.r.hgt) / 50;
      this.impact('switch_screen', def.side, K.switchScreen, H.pid);
      if (postAdv > isoAdv + 0.25 && S.c.postScore > 50 && this.rng.chance(0.7)) {
        const gain = ((dS.c.intDef * this.dq(dS) - dH.c.intDef * this.dq(dH)) / 20 + (dS.r.hgt - dH.r.hgt) / 70) * K.advPts.post;
        this.impact('switch_mismatch', off.side, gain, S.pid);
        this.passStep(H, S);
        return this.post(off, def, open + 0.1, forced, { actor: S, defender: dH, tag: 'switch_mismatch', entry: H });
      }
      this.impact('switch_mismatch', off.side, ((dH.c.perDef * this.dq(dH) - dS.c.perDef * this.dq(dS)) / 20) * K.advPts.iso, H.pid);
      return this.iso(off, def, open, late, forced, { actor: H, defender: dS, tag: 'switch_mismatch', fromPnr: true });
    }

    // a denied star catches it late (a switch has already traded his matchup for another)
    advH -= this.denyCatch(def, off, H, 'pnr');
    if (cov !== 'blitz') advH += this.blowBy(def, H, 'pnr');
    if (hunted === H) this.huntEdge(def, dH, 'pnr', H.pid);
    // screen-hunting: a weak defender dragged into the two-man game can't hold up his end of the coverage
    if (hunted === S && cov !== 'zone') {
      const edge = clamp(this.huntGap(def, dS, 'pnr') / K.hunt.screenEdge, -0.4, 0.8);
      advH += edge;
      this.impact('hunt', off.side, edge * K.advPts.pnr, H.pid);
    }
    let pullOpen = 0;
    let rimOpen = 0;
    let rollOpen = 0;
    let popOpen = 0;
    let kickOpen = 0.05;
    let toExtra = 0;
    const tagsPull: [string, number][] = [];
    const tagsRim: [string, number][] = [];
    const tagsRoll: [string, number][] = [];
    const tagsPop: [string, number][] = [];
    const tagsKick: [string, number][] = [];
    let handlerShoots = 1;

    if (cov === 'drop') {
      // big sags; trailing guard -> pull-up space
      const big = dS;
      const deep = 0.35 + (big.c.rimProt - 50) / 200;
      pullOpen += 0.38;
      tagsPull.push(['drop_pullup', 0.38]);
      rimOpen -= deep;
      tagsRim.push(['drop_rim', -deep]);
      rollOpen -= 0.3;
      tagsRoll.push(['drop_rim', -0.3]);
      if (S.c.pop > 55) {
        popOpen += 0.45;
        tagsPop.push(['drop_pop', 0.45]);
      }
    } else if (cov === 'hedge') {
      const recover = (dS.r.spd - S.r.spd) / 60 + (dS.r.diq - 50) / 150;
      advH -= 0.28;
      this.impact('hedge_stall', def.side, 0.28 * 0.08, H.pid);
      rollOpen += 0.15 - recover;
      tagsRoll.push(['hedge_roll', 0.15 - recover]);
      kickOpen += 0.12;
      tagsKick.push(['hedge_rotate', 0.12]);
      toExtra += 0.01;
    } else if (cov === 'blitz') {
      handlerShoots = 0.18;
      const trap = ((dH.c.steal + dS.c.steal) / 2 + (dH.r.hgt + dS.r.hgt) / 4 - 50) / 100;
      const escape = (H.c.passing - 55) / 100;
      const pTrapTO = clamp(K.blitzTO + trap * 0.2 - escape * 0.3, 0.02, 0.18);
      toExtra += pTrapTO;
      this.impact('blitz_to', def.side, pTrapTO * H.ttv * K.toPts, H.pid);
      // 4-on-3 behind the trap: quality scales with the handler's passing and the short-roll big
      const fourThree = K.blitz4v3 + escape * 0.6 + (S.c.passing - 50) / 200;
      rollOpen += fourThree;
      tagsRoll.push(['blitz_4v3', fourThree]);
      kickOpen += fourThree * 0.9;
      tagsKick.push(['blitz_4v3', fourThree * 0.9]);
      if (this.record) this.cur!.steps.push({ k: 'trap', pid: H.pid });
    } else if (cov === 'ice') {
      pullOpen -= 0.18;
      tagsPull.push(['ice_contain', -0.18]);
      rimOpen -= 0.2;
      tagsRim.push(['ice_contain', -0.2]);
      rollOpen -= 0.1;
      tagsRoll.push(['ice_contain', -0.1]);
      toExtra += 0.006;
    } else if (zone) {
      advH -= zone.pnr;
      this.impact('zone_paint', def.side, zone.pnrTag);
      kickOpen += zone.kick;
      tagsKick.push([this.openKey(def), zone.kick]);
      // (a chased screener's chaser stays with him)
      if (!this.chased(def, off).includes(S)) {
        popOpen += zone.pop;
        tagsPop.push([this.openKey(def), zone.pop]);
      }
    }
    // going under the screen on this handler: room for his pull-ups, none for his drive, and the
    // screener's man stays home
    if (cov !== 'blitz' && cov !== 'zone' && this.pd(def, H) === 'under') {
      const u = K.pd.under;
      pullOpen += u.pull;
      tagsPull.push(['pd_under', u.pull]);
      rimOpen -= u.drive;
      tagsRim.push(['pd_under', -u.drive]);
      rollOpen -= u.roll;
      tagsRoll.push(['pd_under', -u.roll]);
      popOpen -= u.roll;
      tagsPop.push(['pd_under', -u.roll]);
    }
    // a screener top-locked off the ball pops into a hand in his face
    const sLock = this.lock(def, off, S);
    if (sLock) {
      popOpen -= sLock.k.c3;
      tagsPop.push([sLock.tag, -sLock.k.c3]);
    }
    // defenders sagging off non-shooters help at the rim
    const sag = this.sagHelp(def, off, H, S);
    if (sag) {
      rimOpen -= sag;
      tagsRim.push(['pd_sag', -sag]);
      rollOpen -= sag;
      tagsRoll.push(['pd_sag', -sag]);
    }

    // help defense / spacing on drives
    rimOpen += spacing * 0.6 - help * 0.28;
    if (help !== 0) {
      tagsRim.push(['help_paint', -help * 0.28]);
      kickOpen += help * 0.3;
      tagsKick.push(['help_kick', help * 0.3]);
    }
    if (spacing !== 0) tagsRim.push(['spacing', spacing * 0.6]);
    // a set's edges against this coverage, and what the defense has read of it
    if (play) {
      rollOpen += this.setOpen(play, 'roll', tagsRoll);
      popOpen += this.setOpen(play, 'pop', tagsPop);
      kickOpen += this.setOpen(play, 'kick', tagsKick);
      rimOpen += this.setOpen(play, 'drive', tagsRim);
    }

    // turnover
    const pTO = this.toChance(K.toBase * 1.05, H, def, toExtra + this.setJump(play, def, H));
    if (this.rng.chance(pTO)) {
      // the screener's man makes the play: the pocket pass to the roller (a roll-man turnover)
      const onRoll = !this.rng.chance(0.6);
      this.turnover(off, def, H, this.stealBy(onRoll ? dS : dH, 0.6), onRoll ? 'pnrRoll' : 'pnrBH');
      return 'done';
    }
    // non-shooting foul: free throws in the penalty, else a side out (the shot clock restarts at 14 or
    // more: an action the shot clock was rushing is reset, any other plays on), with a defender who
    // fouled out on it replaced
    if (this.nonShootingFoul(off, def, H, dH, 'pnrBH')) return 'done';
    if (this.sideOut && forced) return { carry: 0, ball: H };
    if (!dH.on || !dS.on) {
      dH = this.defOf(def, H);
      dS = this.defOf(def, S);
    }

    // decision: a high-usage handler looks for his own shot more, a low-usage one moves it on
    const fr = H.freedom * this.selfShot(H);
    const opts = [
      handlerShoots * Math.pow(H.c.pu3 / 50, 2.4) * pf.three * 0.27 * fr * H.t3 * (1 + pullOpen), // pull-up 3
      handlerShoots * Math.pow(H.c.midShot / 50, 2.2) * pf.mid * 0.22 * fr * Math.sqrt(H.tm) * (1 + pullOpen), // pull-up 2
      handlerShoots * Math.pow(H.c.rim / 50, 1.6) * pf.rim * 0.32 * fr * H.td * (1 + advH * 0.4 + rimOpen * 0.5), // drive
      Math.pow(H.c.passing / 50, 1.2) *
        this.passT(H) *
        Math.pow(Math.max(S.c.roll, 5) / 50, 1.5) *
        (Math.pow(S.tu, 0.75) / Math.sqrt(S.tcr)) *
        0.85 *
        (1 + rollOpen) *
        (S.c.pop > S.c.roll ? 0.4 : 1), // roll
      S.c.pop > 50
        ? Math.pow(H.c.passing / 50, 1.2) *
          this.passT(H) *
          Math.pow(S.c.pop / 50, 2) *
          (Math.pow(S.tu, 0.75) / Math.sqrt(S.tcr)) *
          0.45 *
          pf.three *
          S.t3 *
          (1 + popOpen) *
          (sLock?.k.kickW ?? 1)
        : 0.01, // pop
      Math.pow(H.c.passing / 50, 1.3) * this.passT(H) * (off.spacing / 50) * 1.1 * (1 + kickOpen), // kick out
      forced ? 0 : K.continueBase * (advH < 0 ? 1.6 : 0.7) * (late.hold ? 0.5 : 1), // reset
    ];
    if (cov === 'blitz') opts[2] *= 0.3;
    if (this.go3) opts[3] *= 0.05;
    // a set goes for its look
    if (play) (['pull3', 'pull2', 'drive', 'roll', 'pop', 'kick'] as const).forEach((slot, i) => (opts[i] *= play.w[slot] ?? 1));
    const c = this.rng.weighted(opts);
    const advOpen = clamp(advH * 0.35, -0.6, 0.7);
    switch (c) {
      case 0:
        this.shoot(off, def, { shooter: H, zone: 'ab3', open: advOpen * 0.7 + pullOpen - 0.12 + open, contest: dH, assister: null, finish: 'pnrBH', tags: tagsPull, pullup: true });
        return 'done';
      case 1:
        this.shoot(off, def, {
          shooter: H,
          zone: this.midOr(H, 0.55),
          open: advOpen + pullOpen + open,
          contest: dH,
          assister: null,
          finish: 'pnrBH',
          tags: tagsPull,
          pullup: true,
        });
        return 'done';
      case 2: {
        if (this.record) this.cur!.steps.push({ k: 'drive', pid: H.pid });
        const zone: ShotZone = this.rimOr(H, 0.68);
        const body = this.body(def, H);
        this.shoot(off, def, {
          shooter: H,
          zone,
          open: advOpen + rimOpen + open - (body ? K.pd.body.drive : 0),
          contest: zone === 'rim' ? this.rimContester(def, dH, cov === 'drop' ? 1.5 : 1) : dS,
          assister: null,
          finish: 'pnrBH',
          tags: body ? [...tagsRim, ['pd_body', -K.pd.body.drive]] : tagsRim,
          ...body,
        });
        return 'done';
      }
      case 3: {
        this.passStep(H, S);
        const shortRoll = clamp(0.04 + (S.c.passing - 50) / 300, 0.01, 0.2) * Math.sqrt(this.passT(S)) * (cov === 'blitz' || cov === 'hedge' ? 1.8 : 1);
        if (this.rng.chance(clamp(shortRoll, 0, 0.5))) {
          const sh = this.kickTarget(off, H, S);
          this.passStep(S, sh);
          const d = this.defOf(def, sh);
          this.spotUp(off, def, {
            shooter: sh,
            zone: this.cornerOrWing(off, sh),
            open: 0.12 + Math.max(0, rollOpen) * 0.5 + open,
            contest: d,
            assister: S,
            finish: 'spotup',
            // the kick-out keeps half of what the coverage left open for the roller
            tags: tagsRoll.filter(([, x]) => x > 0).map(([k, x]): [string, number] => [k, x * 0.5]),
          });
          return 'done';
        }
        const rollAdv = (S.c.roll - dS.c.intDef * this.dq(dS)) / 25;
        const body = this.body(def, S);
        this.shoot(off, def, {
          shooter: S,
          zone: this.rimOr(S, 0.75),
          open: rollAdv * 0.4 + rollOpen - 0.32 + open - (body ? K.pd.body.drive : 0),
          contest: cov === 'blitz' ? this.rimContester(def, null, 1) : this.rimContester(def, dS, cov === 'drop' ? 1.3 : 1),
          assister: H,
          finish: 'pnrRoll',
          tags: body ? [...tagsRoll, ['pd_body', -K.pd.body.drive]] : tagsRoll,
          ...body,
        });
        return 'done';
      }
      case 4: {
        this.passStep(H, S);
        this.shoot(off, def, { shooter: S, zone: 'ab3', open: popOpen + 0.05 + open, contest: dS, assister: H, finish: 'pnrRoll', tags: tagsPop });
        return 'done';
      }
      case 5: {
        // Spain: the kick-out is the back screener's three (his man helped on the roll)
        const sh = play?.cast.id === 'spain' ? play.cast.c : this.kickTarget(off, H, S);
        this.passStep(H, sh);
        const d = this.defOf(def, sh);
        const closeout = (d.c.perDef * this.dq(d) - 50) / 200;
        this.spotUp(off, def, {
          shooter: sh,
          zone: this.cornerOrWing(off, sh),
          open: kickOpen + advOpen * 0.4 - closeout + open,
          contest: d,
          assister: H,
          finish: 'spotup',
          tags: tagsKick,
        });
        return 'done';
      }
      default:
        return { carry: clamp(advOpen * 0.3, -0.1, 0.2), ball: H };
    }
  },
};
