// Post-ups (a set's, a mismatch, what a switch leaves): the entry pass, the post player's edge on his
// man, the double team, a small switched onto a big fouling to hold his ground, getting physical with
// him, and the shot or the pass out (Post split's cutter and flare).

import { clamp } from '../../random';
import { K, lev, levGiftW } from './constants';
import type { SP, ST, ActionResult } from './state';
import type { GameSim } from './game';

export const postUpMethods = {
  post(this: GameSim, off: ST, def: ST, open: number, forced: boolean, fixed: { actor: SP; defender: SP; tag: string; entry: SP | null } | null): ActionResult {
    // Post split: its post player, its entry passer, and the pair splitting around him
    const play = fixed ? null : this.takePlay('post');
    const A = fixed?.actor ?? (play ? this.useActor(off, play.cast.a) : this.pickActor(off, 'post'));
    const D = fixed?.defender ?? this.defOf(def, A);
    // the entry pass: a post score off a good feed counts as an assisted basket now and then
    let entry: SP | null = null;
    if (fixed) entry = fixed.entry;
    else if (play) entry = play.cast.b;
    else {
      const feeders = off.on.filter((p) => p !== A);
      entry = feeders[this.rng.weighted(feeders.map((p) => Math.pow(Math.max(5, p.c.passing) / 50, 2) * p.tp))] ?? null;
    }
    if (this.cur && !fixed && (play || !this.cur.set)) this.cur.label = play ? play.label : `Post-up: ${A.name} vs ${D.name}`;
    if (this.record) this.cur!.steps.push({ k: 'post', pid: A.pid });
    // the split: one screens for the other off the ball
    if (play && this.record) this.cur!.steps.push({ k: 'pin', pid: play.cast.d!.pid, pid2: play.cast.c.pid });
    const help = this.help(def);
    let adv = (A.c.postScore * A.perf - D.c.intDef * this.dq(D)) / 20 + (A.r.str - D.r.str) / 80 + (A.r.hgt - D.r.hgt) / 70 + this.rng.normal(0, 0.55) + open;
    if (!fixed) adv -= this.denyCatch(def, off, A, 'post');
    if (!fixed && def.byId.get(off.t.offense.huntTarget ?? -1) === D) this.huntEdge(def, D, 'post', A.pid);
    // getting physical with him: a tougher post-up, at the price of more shooting fouls
    const body = this.body(def, A);
    if (body) {
      adv -= lev(K.pd.body.post);
      this.impact('pd_body', def.side, lev(K.pd.body.post) * K.advPts.post, A.pid);
    }
    const zd = this.zone(def);
    if (zd) {
      adv -= lev(zd.post);
      this.impact('zone_paint', def.side, lev(zd.postTag), A.pid);
    }
    if (fixed?.tag === 'mismatch_post') this.impact(fixed.tag, off.side, Math.max(0, (A.r.hgt - D.r.hgt) / 70) * K.advPts.post, A.pid);
    const starDouble = def.t.defense.starPlan === 'double' && this.starTarget(def, off) === A;
    const doubleP = starDouble ? 0.75 : 0.08 + lev(Math.max(0, help) * 0.15) + (adv > 0.6 ? 0.15 : 0);
    if (this.rng.chance(doubleP)) return this.doubleTeam(off, def, A, 'post', starDouble, play);
    const pTO = this.toChance(K.toBase * 1.1, A, def, this.setJump(play, def, A));
    if (this.rng.chance(pTO)) {
      this.turnover(off, def, A, this.stealBy(D, 0.4), 'post');
      return 'done';
    }
    const advOpen = clamp(adv * 0.4, -0.7, 0.8);
    // a small switched onto a big can only hold his ground by fouling
    let reach = fixed?.tag === 'switch_mismatch' ? 1 + lev(Math.max(0, A.r.hgt - D.r.hgt) / K.mismatchFoul) : 1;
    let foulTag: [string, number] | undefined = reach > 1 ? ['switch_mismatch', reach] : undefined;
    // (the physical defender's extra fouls go to the instruction unless a switch already put a small on him)
    if (body) {
      reach *= levGiftW(K.pd.body.foul);
      foulTag ??= body.foulTag;
    }
    const ss = this.selfShot(A);
    const opts = [
      Math.pow(A.c.close / 50, 2) * 1.1 * ss, // hook / short shot
      Math.pow(A.c.rim / 50, 1.6) * 0.8 * (1 + advOpen) * ss, // drop step
      Math.pow(A.c.midShot / 50, 2) * 0.35 * ss, // fadeaway
      Math.pow(A.c.passing / 50, 1.4) * 0.45 * this.passT(A), // pass out
      forced ? 0 : K.continueBase * 0.6,
    ];
    // a set goes for its look
    if (play) (['post', 'post', 'post', 'pass'] as const).forEach((slot, i) => (opts[i] *= play.w[slot] ?? 1));
    const c = this.rng.weighted(opts);
    switch (c) {
      case 0:
        this.shoot(off, def, { shooter: A, zone: 'paint', open: advOpen - 0.05, contest: D, assister: entry, finish: 'post', forcedFoulMult: 1.3 * reach, foulTag });
        return 'done';
      case 1:
        this.shoot(off, def, {
          shooter: A,
          zone: 'rim',
          open: advOpen - 0.1,
          contest: this.rimContester(def, D),
          assister: entry,
          finish: 'post',
          forcedFoulMult: 1.25 * reach,
          foulTag,
        });
        return 'done';
      case 2:
        this.shoot(off, def, { shooter: A, zone: 'mid', open: advOpen - 0.2, contest: D, assister: entry, finish: 'post' });
        return 'done';
      case 3: {
        // (Post split: the split sends one cutting and one flaring, the cut more often than not)
        const cutter = this.rng.chance(play ? 0.55 : 0.3);
        const tgt = play ? (cutter ? play.cast.c : play.cast.d!) : cutter ? off.on.filter((p) => p !== A).sort((a, b) => b.c.cut - a.c.cut)[0] : this.kickTarget(off, A);
        if (play && cutter && this.record) this.cur!.steps.push({ k: 'cut', pid: tgt.pid });
        this.passStep(A, tgt);
        if (cutter) {
          const ct: [string, number][] = [];
          const so = play ? this.setOpen(play, 'cut', ct) : 0;
          this.shoot(off, def, {
            shooter: tgt,
            zone: 'rim',
            open: 0.25 + advOpen * 0.3 + so,
            contest: this.rimContester(def, this.defOf(def, tgt), 1.2),
            assister: A,
            finish: 'cut',
            ...(ct.length ? { tags: ct } : {}),
          });
        } else {
          const kt: [string, number][] = [['help_kick', lev(Math.max(0, help) * 0.25)]];
          const so = play ? this.setOpen(play, 'kick', kt) : 0;
          this.spotUp(off, def, {
            shooter: tgt,
            zone: this.cornerOrWing(off, tgt),
            open: 0.2 + lev(Math.max(0, help) * 0.25) + so,
            contest: this.defOf(def, tgt),
            assister: A,
            finish: 'spotup',
            tags: kt,
          });
        }
        return 'done';
      }
      default:
        return { carry: 0, ball: A };
    }
  },
};
