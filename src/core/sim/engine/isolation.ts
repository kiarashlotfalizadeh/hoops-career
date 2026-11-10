// Isolations (called, mismatch-hunted, or what a switch leaves) and double teams: the creator's edge
// on his man against ball pressure, help and the zone, the star plan's double and heavy help's, and
// the 4-on-3 a double hands the offense (Post split's cut and flare when it's the set's post player).
// Rewritten in November 2026 (tactics v2): every size is in tk.ts.

import type { ShotZone } from '../../types';
import { clamp } from '../../random';
import type { FinishType } from '../log';
import { SPLIT_DOUBLE } from '../sets';
import { K } from './constants';
import { TK } from './tk';
import { blowByTag } from './defense';
import type { SP, ST, SetPlay, LateMode, ActionResult } from './state';
import type { GameSim } from './game';

type Tags = [string, number][];

export const isolationMethods = {
  iso(
    this: GameSim,
    off: ST,
    def: ST,
    open: number,
    late: LateMode,
    forced: boolean,
    fixed: { actor: SP; defender: SP; tag: string; fromPnr?: boolean; tagW?: number } | null,
  ): ActionResult {
    const A = fixed?.actor ?? this.pickActor(off, 'iso');
    let D = fixed?.defender ?? this.defOf(def, A);
    const finish: FinishType = fixed?.fromPnr ? 'pnrBH' : 'iso';
    if (this.cur && !fixed && !this.cur.set) this.cur.label = `Isolation: ${A.name} on ${D.name}`;
    if (this.cur && fixed) this.cur.label = `Switch! ${A.name} attacks ${D.name}`;
    const pf = this.prefs(off, late);
    const help = this.help(def);
    let adv = (A.c.create * A.perf - D.c.perDef * this.dq(D)) / 20 + (A.r.str - D.r.str) / 140 + this.rng.normal(0, 0.6) + open;
    if (!fixed) adv -= this.chaseCatch(def, off, A, 'iso');
    if (!fixed && def.byId.get(off.t.offense.huntTarget ?? -1) === D) this.huntEdge(def, D, 'iso', A.pid);
    const pr = this.pressure(def);
    // pressure: aggressive defenders get blown by, quick creators most of all
    const edge = this.blowBy(def, A, 'iso');
    adv += edge;
    if (pr > 0) {
      const blow = pr * clamp((A.c.create - 55) / 50, 0, 0.5) * 2;
      adv += blow;
      this.impact('pressure_blowby', off.side, blowByTag(edge + blow, 'iso') - blowByTag(edge, 'iso'), A.pid);
    }
    const zd = this.zone(def);
    if (zd) {
      adv -= zd.iso - this.zoneHide(def, D);
      this.impact('zone_paint', def.side, zd.iso * 0.1, A.pid);
    }
    // the star plan doubles him; heavy help sends a second defender at anyone who beats his man
    const starDouble = def.t.defense.starPlan === 'double' && this.starTarget(def, off) === A;
    let doubled = false;
    if (starDouble) doubled = this.rng.chance(TK.double.p);
    else if (adv > 0.7 && help > 0) doubled = this.rng.chance(0.5 * help);
    if (this.record) this.cur!.steps.push({ k: 'drive', pid: A.pid });
    if (doubled) return this.doubleTeam(off, def, A, finish, starDouble);

    const pTO = this.toChance(K.toBase * 0.95, A, def, this.driveRisk(off) * 0.5);
    if (this.rng.chance(pTO)) {
      this.turnover(off, def, A, this.stealBy(D, 0.55, true), finish);
      return 'done';
    }
    if (this.nonShootingFoul(off, def, A, D, finish)) return 'done';
    if (this.sideOut) {
      if (forced) return { carry: 0, ball: A };
      this.sideOutInbound();
    }
    if (!D.on) D = this.defOf(def, A);
    const spacing = this.spacingBonus(off);
    const rimOpen = adv * 0.35 + spacing * 0.5 - help * 0.5;
    const sizeEdge = (A.r.hgt - D.r.hgt) / 25;
    const ss = this.selfShot(A);
    const opts = [
      Math.pow(A.c.rim / 50, 1.7) * pf.rim * A.td * Math.max(0.1, 1 + rimOpen) * ss * this.shapeW(off, A).drive,
      Math.pow(A.c.midShot / 50, 2.3) * pf.mid * 0.7 * Math.sqrt(A.tm) * ss,
      Math.pow(A.c.pu3 / 50, 2.5) * pf.three * 0.6 * A.t3 * ss,
      sizeEdge > 0.3 ? Math.pow(A.c.postScore / 50, 2) * sizeEdge : 0,
      Math.pow(A.c.passing / 50, 1.2) * 0.8 * this.passT(A) * (1 + Math.max(0, help)),
      forced ? 0 : K.continueBase * (adv < -0.3 ? 1.4 : 0.5),
    ];
    const c = this.rng.weighted(opts);
    const advOpen = clamp(adv * 0.35, -0.7, 0.75);
    switch (c) {
      case 0: {
        const z: ShotZone = this.rimOr(A, 0.62);
        const tags: Tags = [
          ['help_paint', -help * 0.5],
          ['spacing', spacing * 0.5],
        ];
        const roam = this.roamHelp(def, off, A);
        if (roam) tags.push(['role_roam', -roam]);
        this.shoot(off, def, {
          shooter: A,
          zone: z,
          open: advOpen + this.room(A, z === 'rim' ? 'rim' : 'paint', tags) - 0.08,
          contest: z === 'rim' ? this.rimContester(def, D) : D,
          assister: null,
          finish,
          tags,
          drive: true,
        });
        return 'done';
      }
      case 1:
        this.shoot(off, def, { shooter: A, zone: this.midOr(A, 0.6), open: advOpen - 0.12, contest: D, assister: null, finish, pullup: true });
        return 'done';
      case 2:
        this.shoot(off, def, { shooter: A, zone: 'ab3', open: advOpen * 0.6 - 0.2, contest: D, assister: null, finish, pullup: true });
        return 'done';
      case 3:
        return this.post(off, def, open, forced, { actor: A, defender: D, tag: fixed?.tag ?? 'mismatch_post', entry: null, tagW: fixed?.tagW });
      case 4: {
        const sh = this.kickTarget(off, A);
        this.passStep(A, sh);
        const tags: Tags = [['help_kick', Math.max(0, help) * 0.6]];
        this.spotUp(off, def, {
          shooter: sh,
          zone: this.cornerOrWing(off, sh),
          open: 0.15 + this.room(sh, 'c3', tags) + advOpen * 0.3,
          contest: this.defOf(def, sh),
          assister: A,
          finish: 'spotup',
          tags,
        });
        return 'done';
      }
      default:
        return { carry: 0, ball: A };
    }
  },

  /**
   * A double team; only the star plan's doubles are tagged as the plan's doing. Doubling Post split's
   * post player sends the ball out to the pair splitting around him: the cutter or the flare, with the
   * split's edge on the 4-on-3.
   */
  doubleTeam(this: GameSim, off: ST, def: ST, A: SP, from: 'iso' | 'pnrBH' | 'post', star: boolean, play: SetPlay | null = null): 'done' {
    const k = TK.double;
    if (this.cur) this.cur.label = `${A.name} gets doubled!`;
    if (this.record) this.cur!.steps.push({ k: 'trap', pid: A.pid });
    const escape = (A.c.passing - 55) / 40;
    const pTO0 = clamp((0.1 - escape * 0.25) * A.ttv, 0.03, 0.2);
    const pTO = star ? clamp((k.to - escape * k.escape) * A.ttv, k.toMin, k.toMax) : pTO0;
    if (star) this.impact('star_double', def.side, (pTO - 0.06) * 1.1 + 0.12, A.pid);
    if (this.rng.chance(pTO)) {
      this.turnover(off, def, A, this.stealer(def), from);
      return 'done';
    }
    // forced to give it up: 4-on-3 for teammates
    if (this.rng.chance(0.82)) {
      const split = play?.cast.id === 'postSplit' ? play.cast : null;
      const sh = split ? (this.rng.chance(0.5) ? split.c : split.d!) : this.kickTarget(off, A);
      this.passStep(A, sh);
      const o = star ? k.kick + escape : 0.5 + escape * 0.5;
      if (!star) this.impact('double_kick', off.side, o * 0.06 * 3 * 0.35, sh.pid);
      // (what the defense has read of the split takes its share off this look too)
      const read = split ? play!.read : 0;
      const tags = (room: number): Tags | undefined =>
        split ? [['set_postSplit', SPLIT_DOUBLE * 2], ...(read ? [['set_read', -read] as [string, number]] : [])] : star ? [['double_kick', room]] : undefined;
      const so = split ? SPLIT_DOUBLE * 2 - read : 0;
      if (split ? sh === split.c : this.rng.chance(0.3) && sh.c.rim > 52) {
        const t = tags(o * 0.6);
        const extra = star && t ? this.room(sh, 'rim', t) - o * 0.6 : 0;
        this.shoot(off, def, {
          shooter: sh,
          zone: 'rim',
          open: o * 0.6 + so + extra,
          contest: this.rimContester(def, this.defOf(def, sh), 1.2),
          assister: A,
          finish: 'cut',
          tags: t,
        });
      } else {
        const t = tags(o);
        const extra = star && t ? this.room(sh, 'c3', t) - o : 0;
        this.spotUp(off, def, { shooter: sh, zone: this.cornerOrWing(off, sh), open: o + so + extra, contest: this.defOf(def, sh), assister: A, finish: 'spotup', tags: t });
      }
      return 'done';
    }
    // tries to split the double anyway
    this.shoot(off, def, {
      shooter: A,
      zone: this.midOr(A, 0.5),
      open: star ? k.split : -0.55,
      contest: this.defOf(def, A),
      assister: null,
      finish: from,
      tags: star ? [['star_double', k.split + 0.55]] : undefined,
    });
    return 'done';
  },
};
