// Who gets the ball: each player's usage weight for an action (role, shot freedom, tendencies, form, a
// defense loading up on a high-usage player as the game goes on), his passing and shoot-vs-pass tilt,
// the actor of an action (a called isolation, a hunted matchup, the deny's and the chasers' fewer
// touches, the crunch-time go-to player), the action the offense runs next, what the lineup can run,
// and who the kick-out finds.

import type { ActionType } from '../../types';
import { clamp } from '../../random';
import { ROLE_USAGE } from '../../ratings';
import { K, lev, levW } from './constants';
import { type SP, type ST, ACTION_LIST } from './state';
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
    // defenses load up on a high-usage player as the game goes on (a junk defense's chaser sooner)
    const teamUse = p.b.tFga + 0.44 * p.b.tFta + p.b.tTov;
    if (teamUse >= 12.5) {
      const share = (p.b.fga + 0.44 * p.b.fta + p.b.tov) / teamUse;
      const cap = this.T && this.chased(this.T[1 - t.side], t).includes(p) ? p.useCap - lev(K.chaseCap) : p.useCap;
      if (share > cap) w *= Math.exp(-p.useDamp * (share - cap));
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
    // star plan "deny": face-guarding keeps the ball out of his hands, as a junk defense's chasers do
    const def = this.T[1 - t.side];
    const denied = def.t.defense.starPlan === 'deny' ? this.starTarget(def, t) : null;
    if (def.t.defense.starPlan === 'deny') {
      const i = t.on.indexOf(denied!);
      if (i >= 0) ws[i] *= levW(K.denyTouch);
    }
    for (const c of this.chased(def, t)) ws[t.on.indexOf(c)] *= c === denied ? levW(K.chaseTouch) / levW(K.denyTouch) : levW(K.chaseTouch);
    // crunch time: the ball finds the go-to player
    const go = this.goTo(t);
    if (go) ws[t.on.indexOf(go)] *= K.goToPick;
    const actor = t.on[this.rng.weighted(ws)];
    for (const p of t.on) p.b.tActs++;
    actor.b.acts++;
    return actor;
  },

  /** The go-to player, when he is on the floor in crunch time: the last two minutes of the 4th quarter or overtime, within five. */
  goTo(this: GameSim, t: ST): SP | null {
    const pid = t.t.manage.goTo;
    if (pid == null || this.q < 4 || this.clock > 120 || Math.abs(t.score - this.T[1 - t.side].score) > 5) return null;
    const p = t.byId.get(pid);
    return p?.on ? p : null;
  },

  chooseAction(this: GameSim, off: ST): ActionType {
    const a = off.t.offense.actions;
    const ws = ACTION_LIST.map((act) => {
      const emph = Math.pow(Math.max(1, a[act]) / 50, 1.4);
      return emph * off.cap[act];
    });
    // a called three looks for the arc: no post-up (its shots are twos)
    // crunch time: more of what the go-to player does best
    const go = this.goTo(off);
    if (go) {
      const mine: ActionType[] = ['pnr', 'iso', 'post', 'handoff'];
      const best = mine.reduce((b, act) => (this.usageWeight(go, off, act) > this.usageWeight(go, off, b) ? act : b), mine[0]);
      ws[ACTION_LIST.indexOf(best)] *= K.goToAction;
    }
    return ACTION_LIST[this.rng.weighted(ws)];
  },

  /** A set's fixed actor takes the ball, counted in the usage tallies as pickActor counts its pick. */
  useActor(this: GameSim, t: ST, p: SP): SP {
    for (const x of t.on) x.b.tActs++;
    p.b.acts++;
    return p;
  },

  /** How well the current lineup can run an action (0.2..~1.6). */
  capability(this: GameSim, t: ST, act: ActionType): number {
    const on = t.on;
    switch (act) {
      case 'pnr': {
        const h = Math.max(...on.map((p) => p.c.pnrHandle));
        return Math.pow(h / 55, 2);
      }
      case 'iso': {
        const c = Math.max(...on.map((p) => 0.55 * p.c.create + 0.45 * Math.max(p.c.midShot, p.c.pu3, p.c.rim)));
        return 0.4 * Math.pow(c / 60, 2.2);
      }
      case 'post': {
        const ps = Math.max(...on.map((p) => p.c.postScore));
        return 0.36 * Math.pow(ps / 62, 3);
      }
      case 'handoff': {
        const s = on.map((p) => p.c.offBall).sort((a, b) => b - a);
        return Math.pow((s[0] + s[1]) / 2 / 55, 2);
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
