// Isolations (called, mismatch-hunted, or what a switch leaves) and double teams: the creator's edge
// on his man against ball pressure, help and the zone, the star plan's double and heavy help's, and
// the 4-on-3 a double hands the offense (Post split's cut and flare when it's the set's post player).

import type { ShotZone } from '../../types';
import { clamp } from '../../random';
import type { FinishType } from '../log';
import { SPLIT_DOUBLE } from '../sets';
import { K, blowByTag, lev, levExtra } from './constants';
import type { SP, ST, SetPlay, LateMode, ActionResult } from './state';
import type { GameSim } from './game';

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
    if (!fixed) adv -= this.denyCatch(def, off, A, 'iso');
    if (!fixed && def.byId.get(off.t.offense.huntTarget ?? -1) === D) this.huntEdge(def, D, 'iso', A.pid);
    const pr = this.pressure(def);
    // pressure: aggressive defenders get blown by, quick creators most of all
    const edge = this.blowBy(def, A, 'iso');
    adv += edge;
    if (pr > 0) {
      const blow = lev(pr * clamp((A.c.create - 55) / 50, 0, 0.5));
      adv += blow;
      // (the share of the whole edge's worth this part adds)
      this.impact('pressure_blowby', off.side, blowByTag(edge + blow, 'iso') - blowByTag(edge, 'iso'), A.pid);
    }
    const zd = this.zone(def);
    if (zd) {
      adv -= lev(zd.iso);
      this.impact('zone_paint', def.side, lev(zd.isoTag), A.pid);
    }
    // the Star plan doubles him; heavy help sends a second defender at anyone who beats his man
    const starDouble = def.t.defense.starPlan === 'double' && this.starTarget(def, off) === A;
    let doubled = false;
    if (starDouble) doubled = this.rng.chance(0.75);
    else if (adv > 0.7 && help > 0) doubled = this.rng.chance(lev(0.25 * help));
    if (this.record) this.cur!.steps.push({ k: 'drive', pid: A.pid });
    // (a switched pick-and-roll's isolation is booked to the handler's play type throughout)
    if (doubled) return this.doubleTeam(off, def, A, finish, starDouble);

    const pTO = this.toChance(K.toBase * 0.95, A, def);
    if (this.rng.chance(pTO)) {
      this.turnover(off, def, A, this.stealBy(D, 0.55), finish);
      return 'done';
    }
    if (this.nonShootingFoul(off, def, A, D, finish)) return 'done';
    if (this.sideOut) {
      if (forced) return { carry: 0, ball: A };
      this.sideOutInbound();
    }
    if (!D.on) D = this.defOf(def, A);
    const spacing = this.spacingBonus(off);
    const rimOpen = adv * 0.35 + spacing * 0.5 - lev(help * 0.25);
    const sizeEdge = (A.r.hgt - D.r.hgt) / 25;
    const ss = this.selfShot(A);
    const opts = [
      Math.pow(A.c.rim / 50, 1.7) * pf.rim * A.td * (1 + rimOpen) * ss,
      Math.pow(A.c.midShot / 50, 2.3) * pf.mid * 0.9 * Math.sqrt(A.tm) * ss,
      Math.pow(A.c.pu3 / 50, 2.5) * pf.three * 0.6 * A.t3 * ss,
      sizeEdge > 0.3 ? Math.pow(A.c.postScore / 50, 2) * sizeEdge : 0,
      Math.pow(A.c.passing / 50, 1.2) * 0.8 * this.passT(A) * (1 + lev(Math.max(0, help))),
      forced ? 0 : K.continueBase * (adv < -0.3 ? 1.4 : 0.5),
    ];
    const c = this.rng.weighted(opts);
    const advOpen = clamp(adv * 0.35, -0.7, 0.75);
    switch (c) {
      case 0: {
        const zone: ShotZone = this.rimOr(A, 0.62);
        const hp = -lev(help * 0.25);
        const tags: [string, number][] = [
          ['help_paint', hp],
          ['spacing', spacing * 0.5],
        ];
        const body = this.body(def, A);
        if (body) tags.push(['pd_body', -lev(K.pd.body.drive)]);
        const sag = this.sagHelp(def, off, A);
        if (sag) tags.push([this.sagKey, -sag]);
        this.shoot(off, def, {
          shooter: A,
          zone,
          open: advOpen + spacing * 0.5 + hp - 0.08 - (body ? lev(K.pd.body.drive) : 0) - sag,
          contest: zone === 'rim' ? this.rimContester(def, D) : D,
          assister: null,
          finish,
          tags,
          ...body,
        });
        return 'done';
      }
      case 1:
        this.shoot(off, def, { shooter: A, zone: this.midOr(A, 0.7), open: advOpen - 0.12, contest: D, assister: null, finish, pullup: true });
        return 'done';
      case 2:
        this.shoot(off, def, { shooter: A, zone: 'ab3', open: advOpen * 0.6 - 0.2, contest: D, assister: null, finish, pullup: true });
        return 'done';
      case 3:
        return this.post(off, def, open, forced, { actor: A, defender: D, tag: fixed?.tag ?? 'mismatch_post', entry: null, tagW: fixed?.tagW });
      case 4: {
        const sh = this.kickTarget(off, A);
        this.passStep(A, sh);
        const ko = 0.15 + lev(Math.max(0, help) * 0.3);
        this.spotUp(off, def, {
          shooter: sh,
          zone: this.cornerOrWing(off, sh),
          open: ko + advOpen * 0.3,
          contest: this.defOf(def, sh),
          assister: A,
          finish: 'spotup',
          tags: [['help_kick', lev(Math.max(0, help) * 0.3)]],
        });
        return 'done';
      }
      default:
        return { carry: 0, ball: A };
    }
  },

  /**
   * A double team; only the Star plan's doubles are tagged as the plan's doing. Doubling Post split's
   * post player sends the ball out to the pair splitting around him: the cutter or the flare, with the
   * split's edge on the 4-on-3. A Star plan double plays its edges over the usual look at the tactical
   * leverage: the turnovers it forces past a usual 6%, the open 4-on-3 past a usual kick-out's 0.15
   * openness, and the forced shot of a star who splits it past a usual pull-up's -0.12.
   */
  doubleTeam(this: GameSim, off: ST, def: ST, A: SP, from: 'iso' | 'pnrBH' | 'post', star: boolean, play: SetPlay | null = null): 'done' {
    if (this.cur) this.cur.label = `${A.name} gets doubled!`;
    if (this.record) this.cur!.steps.push({ k: 'trap', pid: A.pid });
    const escape = (A.c.passing - 55) / 100;
    const pTO0 = clamp((0.1 - escape * 0.25) * A.ttv, 0.03, 0.2);
    const pTO = star ? pTO0 + levExtra(pTO0 - 0.06) : pTO0;
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
      const o0 = 0.5 + escape * 0.5;
      const o = star ? o0 + levExtra(o0 - 0.15) : o0;
      this.impact('double_kick', off.side, o * 0.06 * 3 * 0.35, sh.pid);
      // (what the defense has read of the split takes its share off this look too)
      const read = split ? play!.read : 0;
      const tags: [string, number][] | undefined = split ? [['set_postSplit', lev(SPLIT_DOUBLE)], ...(read ? [['set_read', -read] as [string, number]] : [])] : undefined;
      const so = split ? lev(SPLIT_DOUBLE) - read : 0;
      if (split ? sh === split.c : this.rng.chance(0.3) && sh.c.rim > 52) {
        this.shoot(off, def, { shooter: sh, zone: 'rim', open: o * 0.6 + so, contest: this.rimContester(def, this.defOf(def, sh), 1.2), assister: A, finish: 'cut', tags });
      } else {
        this.spotUp(off, def, { shooter: sh, zone: this.cornerOrWing(off, sh), open: o + so, contest: this.defOf(def, sh), assister: A, finish: 'spotup', tags });
      }
      return 'done';
    }
    // tries to split the double anyway
    this.shoot(off, def, {
      shooter: A,
      zone: this.midOr(A, 0.5),
      open: star ? -0.55 - levExtra(0.43) : -0.55,
      contest: this.defOf(def, A),
      assister: null,
      finish: from,
      tags: star ? [['star_double', -lev(0.4)]] : undefined,
    });
    return 'done';
  },
};
