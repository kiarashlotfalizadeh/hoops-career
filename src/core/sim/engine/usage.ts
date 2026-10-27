// Who gets the ball: each player's usage weight for an action (role, shot freedom, tendencies, form, a
// defense loading up on a high-usage player as the game goes on), his passing and shoot-vs-pass tilt,
// the actor of an action (a called isolation, a hunted matchup, the deny's and the chasers' fewer
// touches, the crunch-time go-to player), the action the offense runs next, what the lineup can run,
// and who the kick-out finds.

import type { ActionType } from '../../types';
import { clamp } from '../../random';
import { ROLE_USAGE } from '../../ratings';
import { shapeOf } from '../tactics';
import { K, lev, levW } from './constants';
import { type SP, type ST, type LateMode, ACTION_LIST } from './state';
import type { GameSim } from './game';

export const usageMethods = {
  usageWeight(this: GameSim, p: SP, t: ST, action: ActionType | 'any'): number {
    if (!p.on) return 0;
    const roleU = ROLE_USAGE[p.role];
    let skill: number;
    switch (action) {
      case 'pnr':
        skill = p.c.pnrHandle;
        if (p.role === 'roller' || p.role === 'stretch') skill *= 0.55;
        break;
      case 'iso':
        skill = 0.55 * p.c.create + 0.45 * Math.max(p.c.midShot, p.c.pu3, p.c.rim);
        break;
      case 'post':
        skill = p.c.postScore;
        break;
      case 'handoff':
        skill = p.c.offBall;
        break;
      case 'motion':
        skill = 0.5 * p.c.cut + 0.5 * p.c.c3;
        break;
      default:
        skill = (p.c.create + p.c.rim + p.c.c3) / 3;
    }
    let w = roleU * p.freedom * p.tu * p.tcr * Math.pow(Math.max(5, skill) / 50, K.usageExp) * (0.75 + 0.25 * p.energy) * p.perf;
    if (t.t.offense.hotHand && p.hot >= 3) w *= 1.25;
    // a wing stopper on him keeps the ball out of his hands a little
    if (this.T && this.T[1 - t.side].guardOf.get(p.pid)?.drole === 'stopper') w *= levW(K.role.stopperTouch);
    // defenses load up on a high-usage player as the game goes on (a junk defense's chaser sooner)
    const teamUse = p.b.tFga + 0.44 * p.b.tFta + p.b.tTov;
    if (teamUse >= 12.5) {
      const share = (p.b.fga + 0.44 * p.b.fta + p.b.tov) / teamUse;
      const cap = this.T && this.chased(this.T[1 - t.side], t).includes(p) ? p.useCap - lev(K.chaseCap) : p.useCap;
      if (share > cap) w *= Math.exp(-p.useDamp * (share - cap));
      if (share > K.useCeil.level) w *= Math.exp(-K.useCeil.damp * (share - K.useCeil.level));
    }
    // even a heliocentric offense moves the ball: past ~2/3 of his team's actions, others get it
    if (p.b.tActs >= 20) {
      const act = p.b.acts / p.b.tActs;
      if (act > K.actCap) w *= Math.exp(-5 * (act - K.actCap));
    }
    return w;
  },

  /**
   * Passing tendency right now: his fitted tendency, braked once he has assisted on more than
   * ~45% of his teammates' baskets in this game (real assist percentages top out near there).
   */
  passT(this: GameSim, p: SP): number {
    const mates = p.b.tFgm - p.b.fgm;
    if (mates < 10) return p.tp;
    const share = p.b.ast / mates;
    return share > K.astCap ? p.tp * Math.exp(-10 * (share - K.astCap)) : p.tp;
  },

  /** Shoot-vs-pass tilt for a player with the ball in an action: high-usage players hunt their own shot. */
  selfShot(this: GameSim, p: SP): number {
    return Math.pow(clamp(p.tu, 0.1, 25), K.selfShotExp);
  },

  pickActor(this: GameSim, t: ST, action: ActionType | 'any', exclude?: SP): SP {
    // a called isolation goes to the player it was called for
    const called = this.calledActor;
    this.calledActor = null;
    if (called && called.on && t.on.includes(called) && called !== exclude) {
      for (const p of t.on) p.b.tActs++;
      called.b.acts++;
      return called;
    }
    const ws = t.on.map((p) => (p === exclude ? 0 : this.usageWeight(p, t, action)));
    // hunting one defender: the player he guards gets the isolations, post-ups and ball screens (in
    // place of the automatic mismatch hunt)
    const hunted = action === 'iso' || action === 'post' || action === 'pnr' ? this.hunted(t, this.T[1 - t.side]) : null;
    if (hunted) ws[t.on.indexOf(hunted)] *= levW(K.hunt.pick);
    // mismatch hunting: favor the player with the weakest defender
    else if (t.t.offense.huntMismatch && (action === 'iso' || action === 'pnr')) {
      const def = this.T[1 - t.side];
      t.on.forEach((p, i) => {
        const d = def.guardOf.get(p.pid);
        if (d) ws[i] *= Math.exp(lev(clamp((p.c.create - d.c.perDef) / 40, -0.5, 0.9)));
      });
    }
    // a junk defense's chasers face-guard their men: the ball goes elsewhere
    const def = this.T[1 - t.side];
    for (const c of this.chased(def, t)) ws[t.on.indexOf(c)] *= levW(K.chaseTouch);
    // crunch time: the ball finds the go-to player (the one named, or else the staff's: his best scorer on the floor)
    const go = this.goTo(t);
    if (go) ws[t.on.indexOf(go)] *= go.pid === t.t.manage.goTo ? K.goToPick : K.goToAuto;
    const actor = t.on[this.rng.weighted(ws)];
    for (const p of t.on) p.b.tActs++;
    actor.b.acts++;
    return actor;
  },

  /**
   * The go-to player in crunch time (the last two minutes of the 4th quarter or overtime, within five):
   * the team's closer (see closer), whom the ball finds a little less when the coach didn't name him (K.goToAuto).
   */
  goTo(this: GameSim, t: ST): SP | null {
    if (this.q < 4 || this.clock > 120 || Math.abs(t.score - this.T[1 - t.side].score) > 5) return null;
    return this.closer(t);
  },

  /**
   * Who a team's last shots go to: the go-to player the coach named while he's on the floor, else the
   * best scorer on the floor (his shot creation and his own usage). The live game builds its late play
   * call around him.
   */
  closer(this: GameSim, t: ST): SP | null {
    const pid = t.t.manage.goTo;
    const p = pid == null ? undefined : t.byId.get(pid);
    if (p?.on) return p;
    let best: SP | null = null;
    let top = 0;
    for (const x of t.on) {
      const s = ROLE_USAGE[x.role] * x.tu * x.tcr * x.freedom * (0.55 * x.c.create + 0.45 * Math.max(x.c.midShot, x.c.pu3, x.c.rim)) ** 2;
      if (s > top) {
        top = s;
        best = x;
      }
    }
    return best;
  },

  chooseAction(this: GameSim, off: ST, late?: LateMode): ActionType {
    const a = off.t.offense.actions;
    const ws = ACTION_LIST.map((act) => {
      const emph = Math.pow(Math.max(1, a[act]) / 50, 1.4);
      return emph * off.cap[act];
    });
    // down three late the offense looks for the arc: hardly a post-up (its shots are twos)
    if (late?.need3) ws[ACTION_LIST.indexOf('post')] *= 0.1;
    // crunch time: more of what the go-to player does best
    const go = this.goTo(off);
    if (go) {
      const mine: ActionType[] = ['pnr', 'iso', 'post', 'handoff'];
      const best = mine.reduce((b, act) => (this.usageWeight(go, off, act) > this.usageWeight(go, off, b) ? act : b), mine[0]);
      ws[ACTION_LIST.indexOf(best)] *= go.pid === off.t.manage.goTo ? K.goToAction : K.goToAutoAction;
    }
    return ACTION_LIST[this.rng.weighted(ws)];
  },

  /** A set's fixed actor takes the ball, counted in the usage tallies as pickActor counts its pick. */
  useActor(this: GameSim, t: ST, p: SP): SP {
    for (const x of t.on) x.b.tActs++;
    p.b.acts++;
    return p;
  },

  /** How well the current lineup can run an action, in the offense's shape (see K.shape). */
  capability(this: GameSim, t: ST, act: ActionType): number {
    const c = this.baseCapability(t, act);
    switch (shapeOf(t.t.offense)) {
      case 'fiveOut':
        return act === 'post' ? c * levW(K.shape.fiveOut.post) : c;
      case 'horns': {
        if (act === 'pnr') return c * levW(K.shape.horns.pnr);
        if (act === 'motion') return c * levW(K.shape.horns.motion);
        if (act !== 'handoff') return c;
        // the elbow bigs run the handoffs: as well as the better passer of them
        const [a, b] = this.bigTwo(t);
        return c * levW(Math.max(0.9, K.shape.horns.handoff + (K.shape.horns.handoffW * (Math.max(a.c.passing, b.c.passing) - 55)) / 20));
      }
      case 'twoIn':
        return act === 'post' ? c * levW(K.shape.twoIn.post) : c;
      default:
        return c;
    }
  },

  /** How well the current lineup can run an action (0.2..~1.6). (Loops, not spreads: it runs at every substitution.) */
  baseCapability(this: GameSim, t: ST, act: ActionType): number {
    const on = t.on;
    let a = -Infinity;
    let b = -Infinity;
    switch (act) {
      case 'pnr': {
        for (const p of on) a = Math.max(a, p.c.pnrHandle);
        return Math.pow(a / 55, 2);
      }
      case 'iso': {
        for (const p of on) a = Math.max(a, 0.55 * p.c.create + 0.45 * Math.max(p.c.midShot, p.c.pu3, p.c.rim));
        return 0.4 * Math.pow(a / 60, 2.2);
      }
      case 'post': {
        for (const p of on) a = Math.max(a, p.c.postScore);
        return 0.36 * Math.pow(a / 62, 3);
      }
      case 'handoff': {
        // the two best off the ball
        for (const p of on) {
          const x = p.c.offBall;
          if (x > a) {
            b = a;
            a = x;
          } else if (x > b) b = x;
        }
        return Math.pow((a + b) / 2 / 55, 2);
      }
      case 'motion':
        return 1.5 * Math.pow((t.passQ + t.spacing) / 2 / 50, 1.5);
    }
  },

  kickTarget(this: GameSim, off: ST, ...exclude: SP[]): SP {
    const def = this.T[1 - off.side];
    const ws = off.on.map((p) =>
      exclude.includes(p)
        ? 0
        : ((Math.pow(Math.max(5, p.c.c3) / 50, 2) * Math.sqrt(p.t3) * Math.pow(p.tu, 0.75) * (0.6 + 0.4 * p.freedom) * (p.role === 'shooter' || p.role === 'glue' ? 1.3 : 1)) /
            Math.sqrt(p.tcr)) *
          // a top-locked shooter is hard to find
          (this.lock(def, off, p)?.kickW ?? 1),
    );
    return off.on[this.rng.weighted(ws)];
  },
};
