// The defense: who guards whom (the matchup solver, a junk defense's chasers on the creators), the
// coverage a ball screen gets (the base coverage, Ice's side screens, the small screens most teams
// switch, a star's double), the scheme played now (zones and junk defenses in stretches, each one's
// table scaled to the two fives on the floor), the star plan's target, a roamer's help, the defender
// being hunted and what attacking him is worth, help, ball pressure and physicality, the rim contest,
// the turnovers pressure forces and who gets the steal. Each edge is tagged with its expected points.
// Rewritten from scratch in November 2026 (tactics v2): every size is in tk.ts.

import type { DefScheme, PnrCoverage } from '../../types';
import { clamp } from '../../random';
import { ROLE_USAGE, defRoleFitsFrom } from '../../ratings';
import { solveMatchups } from '../matchups';
import { shapeOf } from '../tactics';
import { K } from './constants';
import { TK, type ZoneT, roomWorth } from './tk';
import { type SP, type ST, NONE, mix } from './state';
import type { GameSim } from './game';

/** A junk defense's chaser top-locking his man, as the actions play it, with the tags for what it takes away and gives back. */
export interface Lock {
  kickW: number;
  c3: number;
  offScreen: number;
  beat: number;
  cutW: number;
  tag: string;
  beatTag: string;
}

/** The coverage a ball screen gets: the zone's, or a man defense's on this screen. */
export type ScreenCov = PnrCoverage | 'zone';

const isJunkScheme = (s: DefScheme) => s === 'box1' || s === 'tri2';

/** How much of his out-of-possession role's edge a defender brings: none at a fit of TK.role.fitAt, all of it TK.role.fitPer above, a cost below (a poor defender asked to stop the ball gets beaten). */
export function roleEdge(p: Pick<SP, 'drole' | 'c' | 'r'>): number {
  if (p.drole === 'standard' || p.drole === 'hide') return 1;
  const k = TK.role;
  return clamp((defRoleFitsFrom(p.c, p.r)[p.drole] - k.fitAt) / k.fitPer, -1, k.fitMax);
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
    const scorers = O.map((o) => ({ pid: o.pid, hgt: o.r.hgt, big: o.big, threat: this.threat(o, off), handle: this.usageWeight(o, off, 'pnr'), shoot: o.c.spacing }));
    // a junk defense sends its best perimeter defenders to chase: the players it chases count as its
    // top threats, guarded on the perimeter whatever their size (whether or not it's in a stretch of it)
    const targets = this.junkTargets(def, off);
    if (targets.length) {
      const top = Math.max(...scorers.map((s) => s.threat)) * 1.5 || 1;
      for (const s of scorers) if (targets.some((c) => c.pid === s.pid)) Object.assign(s, { threat: top, big: false });
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
    if (def.t.defense.starTarget != null) return off.on.find((p) => p.pid === def.t.defense.starTarget) ?? null;
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
   * The players a junk defense would chase on the floor (a box-and-one one, a triangle-and-two two):
   * named ones first, then their main creators; none in man-to-man or a zone. One named for players is
   * only played while one of them is on the floor.
   */
  junkTargets(this: GameSim, def: ST, off: ST): SP[] {
    const s = def.t.defense.scheme;
    const n = s === 'box1' ? 1 : s === 'tri2' ? 2 : 0;
    if (!n) return NONE;
    const out: SP[] = [];
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

  /** The players a junk defense chases right now: its targets while it's in a stretch of it (see zone), else none. */
  chased(this: GameSim, def: ST, off: ST): SP[] {
    if (!isJunkScheme(def.t.defense.scheme)) return NONE;
    return this.zone(def) ? this.junkTargets(def, off) : NONE;
  },

  /** How often a player gets the ball in the half court where nobody runs a play for him: a junk defense's chased players less. */
  touch(this: GameSim, def: ST, off: ST, p: SP): number {
    return isJunkScheme(def.t.defense.scheme) && this.chased(def, off).includes(p) ? TK.chase.touch : 1;
  },

  /**
   * Whether offensive player `p` is top-locked off the ball (a junk defense's chaser face-guards him),
   * with the tags for what it takes away (his catch-and-shoot and off-screen looks) and what it gives
   * back (drives on the catch, curls and back-cuts against a defender caught high).
   */
  lock(this: GameSim, def: ST, off: ST, p: SP): Lock | null {
    if (!isJunkScheme(def.t.defense.scheme) || !this.chased(def, off).includes(p)) return null;
    const k = TK.chase;
    return { kickW: k.kickW, c3: k.c3, offScreen: k.offScreen, beat: k.beat, cutW: k.cutW, tag: 'box_chase', beatTag: 'box_beat' };
  },

  /** Rim openness taken off a shot at the basket because roamers help off their men (teammates of the shooter's off the ball, two at most); tagged 'role_roam'. */
  roamHelp(this: GameSim, def: ST, off: ST, ...onBall: SP[]): number {
    let roam = 0;
    // (each roamer's help as much as his reads bring: roleEdge)
    for (const p of off.on) {
      const d = def.guardOf.get(p.pid);
      if (!onBall.includes(p) && d?.drole === 'roamer' && roam < 2) roam += d.dm;
    }
    return roam * TK.role.roamHelp;
  },

  /** The offensive player the defender being hunted guards (while both are on the floor), or null. */
  hunted(this: GameSim, off: ST, def: ST): SP | null {
    const pid = off.t.offense.huntTarget;
    if (pid == null) return null;
    const target = def.byId.get(pid);
    if (!target?.on) return null;
    return off.on.find((p) => def.guardOf.get(p.pid) === target) ?? null;
  },

  /** Tag what attacking the hunted defender `d` is worth on this action: his defense against his teammates' on the floor (negative when he's no weak link). */
  huntEdge(this: GameSim, def: ST, d: SP, kind: 'iso' | 'post' | 'pnr', pid: number) {
    this.impact('hunt', (1 - def.side) as 0 | 1, (this.huntGap(def, d, kind) / 20) * K.advPts[kind], pid);
  },

  /** How far a defender's perimeter (or, on a post-up, interior) defense is below his teammates' on the floor. */
  huntGap(this: GameSim, def: ST, d: SP, kind: 'iso' | 'post' | 'pnr') {
    const q = (x: SP) => (kind === 'post' ? x.c.intDef : x.c.perDef) * this.dq(x);
    return def.on.reduce((a, x) => a + q(x), 0) / def.on.length - q(d);
  },

  /** The best mismatch on the floor for the hunt-mismatches setting: the largest gap between an attacker's creation and his defender's on-ball defense, over the defense's average (rating points). */
  bestMismatch(this: GameSim, off: ST, def: ST): number {
    let best = 0;
    const avg = def.on.reduce((a, x) => a + x.c.perDef * this.dq(x), 0) / Math.max(1, def.on.length);
    for (const p of off.on) {
      const d = def.guardOf.get(p.pid);
      if (!d) continue;
      const gap = ((p.c.create - 50) * 0.5 + (avg - d.c.perDef * this.dq(d))) * (p.c.create >= 50 ? 1 : 0.5);
      if (gap > best) best = gap;
    }
    return best;
  },

  defOf(this: GameSim, def: ST, o: SP): SP {
    return def.guardOf.get(o.pid) ?? def.on[0];
  },

  /**
   * Who contests a shot at the rim: the shooter's own man or a helper, weighted by rim protection (a
   * real anchor gets to a big share of them, not all) and how hard the scheme helps. `pull` scales
   * the helpers (drop parks the big at the rim; a scrambled transition defense has fewer back).
   */
  rimContester(this: GameSim, def: ST, own: SP | null, pull = 1): SP {
    const help = Math.max(0.15, 1 + 0.8 * this.help(def));
    const ws = def.on.map((p) => {
      const w = Math.pow(Math.max(10, p.c.rimProt * this.dq(p)) / 50, 3);
      return p === own ? w * 2.2 : w * help * pull * (p.drole === 'anchor' ? Math.max(0.5, 1 + (TK.role.anchorRim - 1) * p.dm) : 1);
    });
    return def.on[this.rng.weighted(ws)];
  },

  /** How far the help comes: -1 staying home .. +1 packing the paint, at TK.help's size. */
  help(this: GameSim, def: ST) {
    return ((def.t.defense.help - 50) / 50) * TK.help;
  },

  /** Ball pressure, -1 sagging .. +1 swarming. */
  pressure(this: GameSim, def: ST) {
    return (def.t.defense.pressure - 50) / 50;
  },

  /** Physicality, -1 hands off .. +1 rough it up. */
  phys(this: GameSim, def: ST) {
    return (def.t.defense.physicality - 50) / 50;
  },

  /**
   * Whether the defense is in a stretch of something it plays only part of the time (a share of the
   * game, in stretches of TK.zoneStretch seconds, drawn from the game's seed: the simulation's own
   * stream is untouched). `salt` keeps different habits apart.
   */
  inStretch(this: GameSim, def: ST, share: number, salt: number): boolean {
    if (share >= 1) return true;
    if (share <= 0) return false;
    return mix(this.seed, salt + 977 * def.side + 31 * this.q + Math.floor(this.elapsed / TK.zoneStretch)) / 4294967296 < share;
  },

  /**
   * The zone the defense plays now (its table scaled to the two fives), or null for man-to-man. A base
   * zone or a game plan's is played `habit.zone` of the time (an AI staff's in stretches, the user's
   * always); a man defense's AI coach mixes in his own zone at his style's share (`habit.zoneMix`); a
   * junk defense is played while someone it chases is on the floor, an AI plan's in stretches
   * (`habit.junk`).
   */
  zone(this: GameSim, def: ST): ZoneT | null {
    const s = def.t.defense.scheme;
    const off = this.T[1 - def.side];
    let kind: Exclude<DefScheme, 'man'> | null = null;
    if (s === 'man') {
      if (def.habit.zoneMix > 0 && this.inStretch(def, def.habit.zoneMix, 0x5a11)) kind = def.habit.zoneKind;
    } else if (isJunkScheme(s)) {
      if (this.junkTargets(def, off).length && this.inStretch(def, def.habit.junk, 0x7c33)) kind = s;
    } else if (this.inStretch(def, def.habit.zone, 0x2e19)) kind = s;
    if (!kind) return null;
    // (the offense reads it as the game goes: the table moves every few trips, see TK.zoneRead)
    const r = TK.zoneRead;
    const seen = Math.min(r.trips, Math.floor(off.zoneSeen / r.step) * r.step);
    const key = `${kind}|${def.lineupKey}|${off.lineupKey}|${seen}`;
    if (def.zk?.key !== key) def.zk = { key, kind, z: this.zoneFor(TK.zone[kind], def, off, seen) };
    return def.zk.z;
  },

  /** A zone's table against these five from this five (TK.zoneFit), read `seen` trips into the game (TK.zoneRead). */
  zoneFor(this: GameSim, z: ZoneT, def: ST, off: ST, seen = 0): ZoneT {
    const f = TK.zoneFit;
    // the longer the offense has seen it, the more its gaps open and its walls give (the high post, the
    // ball reversal), and the more its glass gives up
    const read = (TK.zoneRead.max * Math.min(seen, TK.zoneRead.trips)) / TK.zoneRead.trips;
    const avg = (t: ST, g: (p: SP) => number) => t.on.reduce((a, p) => a + g(p), 0) / Math.max(1, t.on.length);
    const len = avg(def, (p) => p.r.hgt) - f.hgt;
    const mid = Math.max(0, ...off.on.map((p) => (p.c.passing + p.c.midShot) / 2)) - f.mid;
    const wall = clamp(1 + f.wallLen * len - f.wallMid * mid, f.min, f.max) * (1 - TK.zoneRead.wall * read);
    const arc = clamp(1 + f.arcPass * (off.passQ - f.pass) - f.arcLen * len, f.min, f.max) * (1 + read);
    const glass = clamp(1 + f.glassOrb * (avg(off, (p) => p.c.orb) - f.orb), f.min, f.max) * (1 + read);
    // (an open look widens with the arc's factor; a closeout's contest, a negative, tightens against it)
    const open = (v: number) => (v >= 0 ? v * arc : v * (2 - arc));
    return {
      roll: z.roll * wall,
      pnr: z.pnr * wall,
      iso: z.iso * wall,
      post: z.post * wall,
      drive: z.drive * wall,
      kick: open(z.kick),
      pop: open(z.pop),
      handoff: open(z.handoff),
      swing: open(z.swing),
      swingW: 1 + (z.swingW - 1) * arc,
      corner: z.corner,
      cutW: z.cutW * wall,
      cut: z.cut * wall,
      glass: 1 + (z.glass - 1) * glass,
    };
  },

  /** A zone's hiding of a weak on-ball defender (and wasting of a good one): the handler's extra edge on his man, 0 out of a zone. */
  zoneHide(this: GameSim, def: ST, d: SP): number {
    if (!this.zone(def)) return 0;
    return (TK.zoneFit.hide * (d.c.perDef * this.dq(d) - TK.zoneFit.hideAt)) / 20;
  },

  /** The scheme played now: a zone or a junk defense in a stretch of it, else man-to-man. */
  schemeNow(this: GameSim, def: ST): DefScheme {
    return this.zone(def) ? def.zk!.kind : 'man';
  },

  /** The zone being played, as the court's captions name it. */
  zoneName(this: GameSim, def: ST) {
    const s = this.schemeNow(def);
    return s === 'box1' ? 'box-and-one' : s === 'tri2' ? 'triangle-and-two' : s === 'zone32' ? '3-2 zone' : 'zone';
  },

  /** The impact key for the open looks a zone leaves: a junk defense's are 'box_open'. */
  openKey(this: GameSim, def: ST) {
    return isJunkScheme(this.schemeNow(def)) ? 'box_open' : 'zone_3pt';
  },

  /**
   * The coverage a ball screen by `S` for `H` gets. A zone plays its own. A star plan's double traps
   * the star. A man defense switches a small's screen for a handler of his size by habit (whatever its
   * coverage, unless it blitzes or already switches), ices only the side screens (the middle ones are
   * dropped), and otherwise plays its base coverage. Horns' screens are at the elbows: the middle.
   */
  screenCoverage(this: GameSim, def: ST, off: ST, H: SP, S: SP, set: boolean): { cov: ScreenCov; side: boolean } {
    const side = shapeOf(off.t.offense) !== 'horns' && this.rng.chance(TK.screen.side);
    if (this.zone(def)) return { cov: 'zone', side };
    const base = def.t.defense.pnr;
    if (def.t.defense.starPlan === 'double' && this.starTarget(def, off) === H) return { cov: 'blitz', side };
    // (shown high: his ball screens are hedged, everyone else's get the base coverage)
    if (def.t.defense.starPlan === 'show' && this.starTarget(def, off) === H) return { cov: 'hedge', side };
    // an AI staff traps an elite scorer who isn't much of a passer now and then, as NBA teams do
    if (
      !set &&
      def.habit.blitzStar > 0 &&
      H.c.passing < TK.blitzStar.pass &&
      Math.max(H.c.pu3, H.c.midShot) >= TK.blitzStar.score &&
      H === this.mainCreator(off.on) &&
      this.rng.chance(def.habit.blitzStar)
    )
      return { cov: 'blitz', side };
    // (a set's screens go as drawn: no habit switch)
    if (!set && base !== 'switch' && base !== 'blitz' && !S.big && !H.big && Math.abs(H.r.hgt - S.r.hgt) <= TK.screen.smallGap && this.rng.chance(def.habit.smallSwitch))
      return { cov: 'switch', side };
    // an AI drop staff comes up on an elite pull-up shooter's screens (shows high) rather than give him the jumper
    if (!set && (base === 'drop' || base === 'ice') && def.habit.upShooter > 0 && Math.max(H.c.pu3, H.c.midShot) >= TK.upShooter && this.rng.chance(def.habit.upShooter))
      return { cov: 'hedge', side };
    if (base === 'ice') return { cov: side ? 'ice' : 'drop', side };
    return { cov: base, side };
  },

  /**
   * A look's tactical room as the shooter makes of it (TK.use): room left open counts by his skill
   * for the shot, room taken away costs everyone alike. Each tag's share is scaled the same way, in
   * place, so the tags keep adding up to the openness played.
   */
  room(this: GameSim, sh: SP, zone: 'rim' | 'paint' | 'mid' | 'c3' | 'pu3', tags: [string, number][]): number {
    const a = TK.use.avg[zone];
    const skill = zone === 'rim' ? sh.c.rim : zone === 'paint' ? sh.c.close : zone === 'mid' ? sh.c.midShot : zone === 'pu3' ? sh.c.pu3 : sh.c.c3;
    const u = roomWorth(skill * sh.perf, a);
    let sum = 0;
    for (const t of tags) {
      if (t[1] > 0) t[1] *= u;
      sum += t[1];
    }
    return sum;
  },

  /** A junk defense's chaser: when the face-guarded player does get the ball, he catches it late and further out. */
  chaseCatch(this: GameSim, def: ST, off: ST, p: SP, from: 'pnr' | 'handoff' | 'iso' | 'post'): number {
    if (!this.chased(def, off).includes(p)) return 0;
    this.impact('box_chase', def.side, TK.chase.catch * K.advPts[from], p.pid);
    return TK.chase.catch;
  },

  /** Defensive effectiveness modifier from fatigue. */
  dq(this: GameSim, p: SP) {
    return (0.86 + 0.14 * p.energy) * (0.97 + 0.03 * p.perf);
  },

  /**
   * A turnover's chance on an action: the base rate, ball pressure's swing (as much as the defenders'
   * hands and feet make of it, leaning on the offense's ball security), the handler's security, the
   * shape (horns' structure), a point-of-attack stopper on him, and `extra` (a coverage's, a drive's).
   */
  toChance(this: GameSim, base: number, handler: SP, def: ST, extra = 0) {
    const k = TK.pressure;
    const pr0 = this.pressure(def);
    const off = this.T[1 - def.side];
    const sec = pr0 > 0 ? Math.max(0.2, 1 - (off.secQ - k.secAvg) / k.secTo) : 1;
    const pr = (pr0 > 0 ? pr0 * clamp(0.5 + (def.pressQ - 50) / k.pressQ, k.qMin, k.qMax) : pr0 * k.contain) * sec;
    const swing = pr > 0 ? k.to : 0.32;
    const horns = shapeOf(off.t.offense) === 'horns' ? TK.shape.horns.tov : 0;
    const dh = this.defOf(def, handler);
    const poa = dh.drole === 'poa' && handler.on ? TK.role.poaTO * dh.dm : 0;
    const ment = off.t.mentality ?? 0;
    const sys = (1 + horns + poa) * (1 + (ment > 0 ? TK.mentality.to : TK.mentality.toLow) * ment);
    const sure = 1 - (handler.c.ballSec - 50) / 140;
    const p = (base * (1 + K.recenter.tov + swing * pr) * sure + extra) * handler.ttv * sys;
    if (pr !== 0) this.impact('pressure_to', def.side, base * swing * pr * sure * handler.ttv * K.toPts * K.pressureTag, handler.pid);
    const sysTo = base * sure * handler.ttv * K.toPts;
    if (horns) this.impact('shape_tov', off.side, -horns * sysTo, handler.pid);
    if (poa) this.impact('role_poa', def.side, poa * sysTo, handler.pid);
    // (a trip for the tie or the lead in the last seconds is run for one safe look)
    const m = off.score - def.score;
    const last = this.q >= 4 && this.clock <= 24 && m <= 0 && m >= -3 ? K.lastTripTO : 1;
    // (and late in a close game the side ahead is the one that gives it away: K.clutchD)
    const c = K.clutchD;
    const tight = this.q >= 4 && this.clock < c.sec && m !== 0 && Math.abs(m) <= c.within ? (m > 0 ? c.leadTO : c.trailTO) : 1;
    return clamp(p * last * tight, 0.01, 0.4);
  },

  /** The handler's edge against ball pressure: an overplaying defender gets beaten off the dribble (more the harder he presses), a containing one stays in front. */
  blowBy(this: GameSim, def: ST, h: SP, from: 'pnr' | 'handoff' | 'iso'): number {
    const k = TK.pressure;
    const pr = this.pressure(def);
    const beat = pr > 0 ? clamp(1 + (this.T[1 - def.side].secQ - k.secAvg) / k.secOpen, 0.25, 1.5) : 1;
    const edge = (k.blowBy * pr + k.convex * Math.max(0, pr) ** 2) * beat;
    if (edge !== 0) this.impact('pressure_blowby', (1 - def.side) as 0 | 1, blowByTag(edge, from), h.pid);
    const dh = this.defOf(def, h);
    const poa = dh.drole === 'poa' ? TK.role.poaBlowBy * dh.dm : 0;
    if (poa) this.impact('role_poa', def.side, blowByTag(poa, from), h.pid);
    return edge - poa;
  },

  /** The openness a defense overplaying the ball gives up on the half-court shots that do get off, as much as the offense's handlers make of it. */
  overplay(this: GameSim, off: ST, def: ST): number {
    const pr = this.pressure(def);
    if (pr <= 0) return 0;
    const k = TK.pressure;
    return k.over * pr * clamp(1 + (off.secQ - k.secAvg) / k.secOpen, 0.25, 1.5);
  },

  /** The defender who gets his hands on the ball when nobody in particular is beaten: quick hands, steal tendency. */
  stealer(this: GameSim, def: ST): SP {
    return def.on[this.rng.weighted(def.on.map((p) => p.c.steal * p.tsl))];
  },

  /** Live-ball steal by `d` with base chance `base`, scaled by his steal tendency (a point-of-attack stopper's own man's by TK.role.poaSteal: `onBall`), less often past his third of the night; else a dead-ball turnover. */
  stealBy(this: GameSim, d: SP, base: number, onBall = false): SP | null {
    const over = d.b.stl - K.stealCap.from;
    const p =
      base * K.stealShare * Math.pow(d.tsl, K.stealSpread) * (onBall && d.drole === 'poa' ? TK.role.poaSteal : 1) * (over >= 0 ? Math.exp(-K.stealCap.damp * (over + 1)) : 1);
    return this.rng.chance(clamp(p, 0, 0.92)) ? d : null;
  },
};

/**
 * The expected points of a blow-by edge of this size, for impact tags: the openness an advantage buys
 * is capped (a beaten defender is only so far behind), so the bigger the edge the less each unit of it
 * is worth.
 */
export const blowByTag = (edge: number, from: keyof typeof K.advPts) => (edge * K.advPts[from]) / (1 + (edge / K.blowBySat) ** 2);
