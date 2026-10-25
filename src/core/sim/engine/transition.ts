// The full-court press (turnovers forced against easy baskets given up when it's broken) and the
// open floor: run-outs off steals, defensive boards, makes and a broken press, against the defenders
// who got back.

import { clamp } from '../../random';
import { K, lev } from './constants';
import type { ST, Ctx } from './state';
import type { GameSim } from './game';

export const transitionMethods = {
  press(this: GameSim, off: ST, def: ST): 'to' | 'broken' | 'neutral' {
    const handlers = [...off.on].sort((a, b) => b.c.ballSec - a.c.ballSec);
    const h = handlers[0];
    const trapQ = def.on.reduce((a, p) => a + p.c.steal + p.r.spd, 0) / (def.on.length * 2);
    const secQ = (h.c.ballSec + handlers[1].c.ballSec + off.passQ) / 3;
    const k = K.pressAdv;
    const adv = (secQ - k.sec - (trapQ - k.trap)) / k.per;
    const pTO = clamp(K.pressTO - lev(adv * k.to), 0.004, 0.16);
    const pBroken = clamp(k.broken + lev(adv * k.brokenAdv), 0.06, 0.7);
    // (secure handlers beat it sooner: less of the shot clock is gone)
    this.tick(this.rng.uniform(K.pressTime.min, K.pressTime.max) * clamp(1 - K.pressTime.beat * adv, 0.5, 1.3));
    if (this.cur) {
      this.cur.kind = 'press';
      this.cur.label = 'Full-court press';
      this.cur.steps.push({ k: 'press', pid: h.pid });
    }
    // expected value accounting: TOs forced vs easy baskets given up (a broken press is a run-out
    // three times in four, with the runners a step ahead)
    this.impact('press_to', def.side, (pTO - 0.012) * K.toPts);
    this.impact('press_break', off.side, pBroken * 0.75 * (K.runOutPts + 0.6 * K.transAdvPts));
    const r = this.rng.next();
    if (r < pTO) {
      this.turnover(off, def, h, this.stealer(def), 'press');
      return 'to';
    }
    if (r < pTO + pBroken) return 'broken';
    return 'neutral';
  },

  /** The runners' edge off a defensive board against a team that crashed the glass (negative against one that got back). */
  crashRunOut(this: GameSim, def: ST, ctx: Ctx) {
    if (ctx !== 'dreb') return 0;
    // (and less of one against a team that sent fewer to the glass: its defenders are back)
    const c = (this.crashOf(def) - 50) / 50;
    return c > 0 ? lev(K.crashRunOut * c) : lev(K.crashLow.back * c);
  },

  transition(this: GameSim, off: ST, def: ST, ctx: Ctx, pressBroken: boolean) {
    this.inTransition = true;
    if (this.cur) {
      this.cur.kind = 'transition';
      this.cur.label = pressBroken ? 'Press broken!' : ctx === 'steal' ? 'Run-out off the steal' : 'Transition';
    }
    const ws = off.on.map((p) => (p.r.spd + p.c.create * 0.6) * (p.guard ? 1.4 : 0.7) * Math.sqrt(p.tu));
    const h = off.on[this.rng.weighted(ws)];
    this.tick(this.rng.uniform(3, 6.5));
    if (this.record) this.cur!.steps.push({ k: 'transition', pid: h.pid });
    let adv = (off.speed - def.speed) / 25 + (ctx === 'steal' ? 0.7 : 0.15) + (pressBroken ? 0.6 : 0);
    adv -= lev((def.t.defense.getBack - 50) / 100);
    // fewer defenders back when they crashed the glass
    adv += this.crashRunOut(def, ctx);
    adv += this.rng.normal(0, 0.5);
    // turnover in the open floor
    const pTO = clamp((0.085 - (h.c.ballSec - 50) / 900) * h.ttv, 0.02, 0.18);
    if (this.rng.chance(pTO)) {
      this.turnover(off, def, h, this.stealBy(this.stealer(def), 0.5), 'transition');
      return;
    }
    // shot selection
    const trailer = off.on.filter((p) => p !== h).sort((a, b) => b.c.c3 - a.c.c3)[0];
    const threePref = 0.5 + off.t.offense.threePoint / 100;
    const opts = [
      Math.pow(h.c.rim / 50, 1.5) * 0.6 * h.td * (1 + adv * 0.3) * this.selfShot(h), // attack rim
      Math.pow(trailer.c.c3 / 50, 2) * 0.55 * threePref * trailer.t3 * (this.passT(h) / h.tp), // trailing three
      Math.pow(h.c.pu3 / 50, 2) * 0.35 * threePref * h.t3 * this.selfShot(h), // pull-up three
      1.0 * Math.pow(Math.max(5, h.c.passing) / 50, 1.2) * this.passT(h), // drop-off to a runner
    ];
    const c = this.rng.weighted(opts);
    const d = this.defOf(def, h);
    if (c === 0) {
      this.shoot(off, def, { shooter: h, zone: 'rim', open: -0.08 + adv * 0.3, contest: this.rimContester(def, d, 0.8), assister: null, finish: 'transition' });
    } else if (c === 1) {
      this.passStep(h, trailer);
      this.shoot(off, def, {
        shooter: trailer,
        zone: this.rng.chance(0.4) ? 'c3' : 'ab3',
        open: 0.08 + adv * 0.25,
        contest: this.defOf(def, trailer),
        assister: h,
        finish: 'transition',
      });
    } else if (c === 2) {
      this.shoot(off, def, { shooter: h, zone: 'ab3', open: 0.1 + adv * 0.2, contest: d, assister: null, finish: 'transition', pullup: true });
    } else {
      const runners = off.on.filter((p) => p !== h);
      const runner = runners[this.rng.weighted(runners.map((p) => p.c.rim + p.r.spd))];
      this.passStep(h, runner);
      this.shoot(off, def, {
        shooter: runner,
        zone: 'rim',
        open: 0.06 + adv * 0.3,
        contest: this.rimContester(def, this.defOf(def, runner), 0.8),
        assister: h,
        finish: 'transition',
      });
    }
  },
};
