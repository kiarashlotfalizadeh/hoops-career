// The defense: who guards whom (the matchup solver, a junk defense's chasers on the creators), the
// scheme played now (the zone tables, a junk defense playing man while its chased players sit), the
// star plan's target, scouting-report instructions on one player (under, top-lock, sag, physical), the
// defender being hunted and what attacking him is worth, help and ball pressure, the rim contest,
// the turnovers pressure forces and who gets the steal. Each edge is tagged with its expected points.

import type { DefScheme, PlayerDefense } from '../../types';
import { clamp } from '../../random';
import { ROLE_USAGE } from '../../ratings';
import { solveMatchups } from '../matchups';
import { shapeOf } from '../tactics';
import { K, blowByTag, lev, levExtra, levGift, levGiftW, levW, type ZoneK } from './constants';
import { type SP, type ST, NONE } from './state';
import type { GameSim } from './game';

/** A top-lock on one player as the actions play it (K.lock's table at the tactical leverage), with the tags for what it takes away and what it gives back. */
export interface Lock {
  kickW: number;
  c3: number;
  offScreen: number;
  beat: number;
  cutW: number;
  tag: string;
  beatTag: string;
}

export const defenseMethods = {
  /** Assign defenders (on the defensive team) to each offensive player. */
  assignMatchups(this: GameSim, def: ST, off: ST) {
    def.guardOf.clear();
    const O = off.on;
    const D = def.on;
    if (O.length < 5 || D.length < 5) {
      O.forEach((o, i) => def.guardOf.set(o.pid, D[i % D.length]));
      return;
    }
    // threat: how much the offense runs through him
    const scorers = O.map((o) => ({ pid: o.pid, hgt: o.r.hgt, big: o.big, threat: this.threat(o, off), handle: this.usageWeight(o, off, 'pnr'), shoot: o.c.spacing }));
    // a junk defense sends its best perimeter defenders to chase: the chased count as its top
    // threats, guarded on the perimeter whatever their size
    const chased = this.chased(def, off);
    if (chased.length) {
      const top = Math.max(...scorers.map((s) => s.threat)) * 1.5 || 1;
      for (const s of scorers) if (chased.some((c) => c.pid === s.pid)) Object.assign(s, { threat: top, big: false });
    }
    const best = solveMatchups(
      scorers,
      D.map((d) => ({ pid: d.pid, hgt: d.r.hgt, intDef: d.c.intDef, perDef: d.c.perDef, role: d.drole })),
      def.t.defense.matchups,
    );
    O.forEach((o, i) => def.guardOf.set(o.pid, D[best[i]]));
  },

  /** How much the offense runs through a player, as the matchups weigh it: his isolations and ball screens. */
  threat(this: GameSim, o: SP, off: ST) {
    return this.usageWeight(o, off, 'iso') + this.usageWeight(o, off, 'pnr');
  },

  refreshMatchups(this: GameSim) {
    this.assignMatchups(this.T[1], this.T[0]);
    this.assignMatchups(this.T[0], this.T[1]);
  },

  starTarget(this: GameSim, def: ST, off: ST): SP | null {
    if (def.t.defense.starPlan === 'none') return null;
    if (def.t.defense.starTarget != null) {
      return off.on.find((p) => p.pid === def.t.defense.starTarget) ?? null;
    }
    // auto: the opponent's main creator on the floor
    return this.mainCreator(off.on);
  },

  /** The main creator among `players` (the star plan's and the junk defenses' automatic pick): the first of the best. */
  mainCreator(this: GameSim, players: SP[]): SP | null {
    let best: SP | null = null;
    let bw = 0;
    for (const p of players) {
      const w = ROLE_USAGE[p.role] * p.freedom * (p.c.create + p.c.pnrHandle + p.c.postScore);
      if (w > bw) {
        bw = w;
        best = p;
      }
    }
    return best;
  },

  /**
   * The players a junk defense chases on the floor (a box-and-one one, a triangle-and-two two), named
   * ones first, then their main creators; none in man-to-man or a zone. A junk defense named for
   * players is only played while one of them is on the floor: without them it's man-to-man.
   */
  chased(this: GameSim, def: ST, off: ST): SP[] {
    const s = def.t.defense.scheme;
    const n = s === 'box1' ? 1 : s === 'tri2' ? 2 : 0;
    if (!n) return NONE;
    const out: SP[] = [];
    // (names past the scheme's chasers, left from a triangle-and-two switched to a box, don't count)
    const named = (def.t.defense.chase ?? []).slice(0, n);
    for (const pid of named) {
      const p = off.on.find((x) => x.pid === pid);
      if (p && !out.includes(p) && out.length < n) out.push(p);
    }
    if (named.length && !out.length) return NONE;
    while (out.length < n) {
      const p = this.mainCreator(off.on.filter((x) => !out.includes(x)));
      if (!p) break;
      out.push(p);
    }
    return out;
  },

  /** How often a player gets the ball in the half court where nobody runs a play for him: a junk defense's chased players far less. */
  touch(this: GameSim, def: ST, off: ST, p: SP): number {
    return def.t.defense.scheme !== 'box1' && def.t.defense.scheme !== 'tri2' ? 1 : this.chased(def, off).includes(p) ? levW(K.chaseTouch) : 1;
  },

  /** The scouting-report instruction for guarding offensive player `p`, if any. */
  pd(this: GameSim, def: ST, p: SP): PlayerDefense | undefined {
    return def.t.defense.playerD?.[p.pid];
  },

  /**
   * Whether offensive player `p` is top-locked off the ball, and how hard: a junk defense's chaser
   * face-guards him, or a "tight" instruction runs him off the line. With the impact tags for what
   * it takes away (his catch-and-shoot and off-screen looks) and what it gives back (drives on the
   * catch, curls and back-cuts against a defender caught high), at the tactical leverage: a "tight"
   * instruction's give-back grows as an instruction's does (see K.giftExp).
   */
  lock(this: GameSim, def: ST, off: ST, p: SP): Lock | null {
    if (def.t.defense.scheme === 'box1' || def.t.defense.scheme === 'tri2') {
      if (this.chased(def, off).includes(p)) {
        const k = K.lock.box;
        return { kickW: levW(k.kickW), c3: lev(k.c3), offScreen: lev(k.offScreen), beat: lev(k.beat), cutW: levW(k.cutW), tag: 'box_chase', beatTag: 'box_beat' };
      }
    }
    if (this.pd(def, p) === 'tight') {
      const k = K.lock.tight;
      return { kickW: levW(k.kickW), c3: lev(k.c3), offScreen: lev(k.offScreen), beat: levGift(k.beat), cutW: levGiftW(k.cutW), tag: 'pd_tight', beatTag: 'pd_tight' };
    }
    return null;
  },

  /**
   * Rim openness taken off a shot at the basket by `sh` because the defense sags off non-shooters
   * ("sag" instructions on teammates of his who are off the ball, and roamers off theirs), up to two
   * of them; `sagKey` is the tag it goes under (whichever gives more of it).
   */
  sagHelp(this: GameSim, def: ST, off: ST, ...onBall: SP[]): number {
    const pd = def.t.defense.playerD;
    let n = 0;
    let roam = 0;
    for (const p of off.on) {
      if (onBall.includes(p)) continue;
      if (pd?.[p.pid] === 'sag') n++;
      // a roamer helps off his man as a sag would, a little less
      else if (def.guardOf.get(p.pid)?.drole === 'roamer') roam += K.role.roamHelp;
    }
    this.sagKey = roam > n ? 'role_roam' : 'pd_sag';
    return Math.min(2, n + roam) * lev(K.pd.sag.help);
  },

  /** The offensive player the defender being hunted guards (while both are on the floor), or null. */
  hunted(this: GameSim, off: ST, def: ST): SP | null {
    const pid = off.t.offense.huntTarget;
    if (pid == null) return null;
    const target = def.byId.get(pid);
    if (!target?.on) return null;
    return off.on.find((p) => def.guardOf.get(p.pid) === target) ?? null;
  },

  /**
   * Tag what attacking the hunted defender `d` is worth on this action: his defense against the
   * average of his teammates on the floor (negative when he's no weak link: hunting him costs).
   */
  huntEdge(this: GameSim, def: ST, d: SP, kind: 'iso' | 'post' | 'pnr', pid: number) {
    this.impact('hunt', (1 - def.side) as 0 | 1, (this.huntGap(def, d, kind) / 20) * K.advPts[kind], pid);
  },

  /** How far a defender's perimeter (or, on a post-up, interior) defense is below his teammates' on the floor. */
  huntGap(this: GameSim, def: ST, d: SP, kind: 'iso' | 'post' | 'pnr') {
    const q = (x: SP) => (kind === 'post' ? x.c.intDef : x.c.perDef) * this.dq(x);
    return def.on.reduce((a, x) => a + q(x), 0) / def.on.length - q(d);
  },

  defOf(this: GameSim, def: ST, o: SP): SP {
    return def.guardOf.get(o.pid) ?? def.on[0];
  },

  /**
   * Who contests a shot at the rim: the shooter's own man or a helper, weighted by rim
   * protection (a real anchor gets to a big share of them, not all) and how hard the scheme
   * helps. `pull` scales the helpers (drop coverage parks the big at the rim; a scrambled
   * transition defense has fewer helpers back).
   */
  rimContester(this: GameSim, def: ST, own: SP | null, pull = 1): SP {
    const help = 1 + 0.4 * lev(this.help(def));
    const ws = def.on.map((p) => {
      const w = Math.pow(Math.max(10, p.c.rimProt * this.dq(p)) / 50, 3);
      // (a rim anchor lives in the paint: he gets to more of the shots there that aren't his man's)
      return p === own ? w * 2.2 : w * help * pull * (p.drole === 'anchor' ? levW(K.role.anchorRim) : 1);
    });
    return def.on[this.rng.weighted(ws)];
  },

  help(this: GameSim, def: ST) {
    return (def.t.defense.help - 50) / 50; // -1 stay home .. +1 pack paint
  },

  pressure(this: GameSim, def: ST) {
    return (def.t.defense.pressure - 50) / 50;
  },

  /** The zone the defense plays (its table in K.zone), or null for man-to-man. */
  zone(this: GameSim, def: ST): ZoneK | null {
    const s = def.t.defense.scheme;
    if (s === 'man') return null;
    // a junk defense whose chased players are all on the bench plays man-to-man
    if ((s === 'box1' || s === 'tri2') && !this.chased(def, this.T[1 - def.side]).length) return null;
    return K.zone[s];
  },

  /** The scheme played now: the one set, or man-to-man while a junk defense has nobody to chase. */
  schemeNow(this: GameSim, def: ST): DefScheme {
    return this.zone(def) ? def.t.defense.scheme : 'man';
  },

  /** The zone being played, as the court's captions name it. */
  zoneName(this: GameSim, def: ST) {
    const s = def.t.defense.scheme;
    return s === 'box1' ? 'box-and-one' : s === 'tri2' ? 'triangle-and-two' : 'zone';
  },

  /** The impact key for the open looks a zone leaves: a junk defense's are 'box_open' (and its chased players never get them). */
  openKey(this: GameSim, def: ST) {
    return def.t.defense.scheme === 'box1' || def.t.defense.scheme === 'tri2' ? 'box_open' : 'zone_3pt';
  },

  /** "Get physical with him": the shooting fouls he draws, as a shot's options take them (none without the instruction). */
  body(this: GameSim, def: ST, p: SP): { forcedFoulMult: number; foulTag: [string, number] } | undefined {
    return this.pd(def, p) === 'body' ? { forcedFoulMult: levGiftW(K.pd.body.foul), foulTag: ['pd_body', levGiftW(K.pd.body.foul)] } : undefined;
  },

  /**
   * Star plan "deny", and a junk defense's chaser: when the face-guarded player does get the ball,
   * he catches it late and further out (the chaser's doing when both are on him).
   */
  denyCatch(this: GameSim, def: ST, off: ST, p: SP, from: 'pnr' | 'handoff' | 'iso' | 'post'): number {
    if (this.chased(def, off).includes(p)) {
      this.impact('box_chase', def.side, lev(K.chaseCatch) * K.advPts[from], p.pid);
      return lev(K.chaseCatch);
    }
    if (def.t.defense.starPlan !== 'deny' || this.starTarget(def, off) !== p) return 0;
    this.impact('star_deny', def.side, lev(K.denyCatch) * K.advPts[from], p.pid);
    return lev(K.denyCatch);
  },

  /** Defensive effectiveness modifier from fatigue. */
  dq(this: GameSim, p: SP) {
    return (0.86 + 0.14 * p.energy) * (0.97 + 0.03 * p.perf);
  },

  toChance(this: GameSim, base: number, handler: SP, def: ST, extra = 0) {
    // pressing forces turnovers only as well as the defenders can: an average lineup gets about
    // half of what quick hands and feet would (containing costs turnovers whoever plays)
    // (and past 1x leverage, the turnovers it forces lean on the offense's ball security: more
    // against a loose-handling unit, fewer against a secure one, the same against the league's)
    const pr0 = this.pressure(def);
    const off = this.T[1 - def.side];
    const sec = pr0 > 0 ? Math.max(0.2, 1 - levExtra((off.secQ - K.tradeOff.sec.avg) / K.tradeOff.sec.to)) : 1;
    // (backing off gives up a smaller share of the turnovers than pressing forces: containing is a
    // trade, not a trap; see K.containTO)
    const pr = lev(pr0 > 0 ? pr0 * clamp(0.5 + (def.pressQ - 50) / K.pressQ.per, K.pressQ.min, K.pressQ.max) : pr0 * K.containTO) * sec;
    // (the league's recentring moves the base rate only: the turnovers pressure forces keep their size)
    const swing = pr > 0 ? K.pressureTO : 0.32;
    // what the offense knows of its system (an unfamiliar one turns it over more), the structure of a
    // horns set (fewer), and a point-of-attack stopper on the handler (more)
    const fam = off.famOff * K.fam.tov;
    const horns = shapeOf(off.t.offense) === 'horns' ? lev(K.shape.horns.tov) : 0;
    const poa = this.defOf(def, handler).drole === 'poa' && handler.on ? lev(K.role.poaTO) : 0;
    const sys = 1 + fam + horns + poa;
    const p = (base * (1 + levExtra(K.recenter.tov) + swing * pr) * (1 - (handler.c.ballSec - 50) / 140) + extra) * handler.ttv * sys;
    if (pr !== 0) this.impact('pressure_to', def.side, base * swing * pr * (1 - (handler.c.ballSec - 50) / 140) * handler.ttv * K.toPts, handler.pid);
    const sysTo = base * (1 - (handler.c.ballSec - 50) / 140) * handler.ttv * K.toPts;
    if (fam) this.impact('fam_off', def.side, fam * sysTo, handler.pid);
    if (horns) this.impact('shape_tov', off.side, -horns * sysTo, handler.pid);
    if (poa) this.impact('role_poa', def.side, poa * sysTo, handler.pid);
    return clamp(p, 0.01, 0.4);
  },

  /**
   * The handler's edge against ball pressure: an overplaying defender gets beaten off the
   * dribble (more so the harder he presses), a containing one stays in front.
   */
  blowBy(this: GameSim, def: ST, h: SP, from: 'pnr' | 'handoff' | 'iso'): number {
    const pr = this.pressure(def);
    const edge = lev(K.blowBy * pr + K.blowByConvex * Math.max(0, pr) ** 2);
    if (edge !== 0) this.impact('pressure_blowby', (1 - def.side) as 0 | 1, blowByTag(edge, from), h.pid);
    // a point-of-attack stopper on him stays in front more often
    const poa = this.defOf(def, h).drole === 'poa' ? lev(K.role.poaBlowBy) : 0;
    if (poa) this.impact('role_poa', def.side, blowByTag(poa, from), h.pid);
    return edge - poa;
  },

  /** The defender who gets his hands on the ball when nobody in particular is beaten: quick hands, steal tendency. */
  stealer(this: GameSim, def: ST): SP {
    return def.on[this.rng.weighted(def.on.map((p) => p.c.steal * p.tsl))];
  },

  /** Live-ball steal by `d` with base chance `base`, scaled by his steal tendency; else a dead-ball turnover. */
  stealBy(this: GameSim, d: SP, base: number): SP | null {
    return this.rng.chance(clamp(base * K.stealShare * d.tsl, 0, 0.92)) ? d : null;
  },
};
