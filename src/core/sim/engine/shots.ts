// Shots: the make probability (zone, skill, openness, the contest, the offense's feel against the
// team defense, fatigue, physicality, home court, the night's conditions and the score), the tags'
// expected points, blocks, shooting fouls and and-ones, assists, the box score and play-by-play of
// the attempt; the spot-up catch (shoot it, or attack a hard closeout); and where shots come from.

import type { ShotZone } from '../../types';
import { clamp } from '../../random';
import type { FinishType, PossStep } from '../log';
import { K, engineDiag, lev, levExtra, levGift, levW } from './constants';
import { linkKey, type SP, type ST, type ShotOpts } from './state';
import type { GameSim } from './game';

/** Who gets the block on a contested miss: mostly timing and instincts (BLK), some length and pop. */
const blockSkill = (p: { r: { blk: number; hgt: number; ath: number } }) => 0.7 * p.r.blk + 0.18 * p.r.hgt + 0.12 * p.r.ath;

/**
 * What the chance a made two off a pass is credited as an assist keeps of its finish's rate (see
 * assistProb): at the full rates 60% of two-point makes were assisted (55% now), and the league
 * handed out 28.7 assists a game, 67% of its baskets (now 27.1 and 63%; the NBA's 2025-26: 26.6 and
 * 64%, on a league field-goal percentage 1.3 points lower).
 */
const TWO_ASSIST = 0.91;

/** No partnership effect (shared: never added to). */
const NONE_TAGS: [string, number][] = [];

export type MatchupFamily = keyof typeof K.matchup.open;

const familyOf = new Map<string, MatchupFamily | null>();
/** The big decision an impact tag is one of (K.matchup.family), if any. */
export function matchupFamily(k: string): MatchupFamily | null {
  let f = familyOf.get(k);
  if (f === undefined) {
    f = (Object.entries(K.matchup.family).find(([, ps]) => ps.some((p) => k.startsWith(p)))?.[0] as MatchupFamily | undefined) ?? null;
    familyOf.set(k, f);
  }
  return f;
}

/** Room a big decision leaves on a look that gets its full skill term (K.matchup): less room, a share of it. */
const FULL_ROOM = 0.3;

export const shotsMethods = {
  /**
   * The big decisions' looks on this shot, counted by who gets them (K.matchup): for each family that
   * left it open (and the room ball pressure gives up, `over`), the shooter's skill for it over the
   * league's in openness, by tag (the first of the family's tags on the look). `skill` is his rating
   * for the shot; his form counts.
   */
  matchupOpen(this: GameSim, sh: SP, zone: ShotZone, pullup: boolean, skill: number, tags: [string, number][] | undefined, over: number): [string, number][] {
    const m = K.matchup;
    // (by family: its net room, and the tag the term goes to, the family's largest the same way as the net)
    let fams: [MatchupFamily, string, number, [string, number][]][] | null = null;
    if (tags)
      for (const [k, d] of tags) {
        const f = matchupFamily(k);
        if (!f) continue;
        const e = (fams ??= []).find((x) => x[0] === f);
        if (e) {
          e[2] += d;
          e[3].push([k, d]);
        } else fams.push([f, k, d, [[k, d]]]);
      }
    for (const e of fams ?? []) e[1] = e[3].reduce((a, x) => ((e[2] >= 0 ? x[1] > a[1] : x[1] < a[1]) ? x : a), e[3][0])[0];
    if (!fams && over <= 0) return NONE_TAGS;
    const avg = zone === 'rim' ? m.avg.rim : zone === 'paint' ? m.avg.paint : zone === 'mid' ? m.avg.mid : pullup ? m.avg.pu3 : m.avg.c3;
    const z = (f: MatchupFamily) => clamp((skill * sh.perf - avg - m.center[f]) / m.per, -m.cap, m.cap);
    // (the room keeps `floor` of its size at worst for a shooter who can't use it, and a look taken
    // away keeps as much of its cost: the term never turns a decision's room into its opposite)
    const term = (f: MatchupFamily, d: number) => {
      const x = m.open[f] * z(f) * clamp(d / FULL_ROOM, -1, 1);
      return d > 0 ? Math.max(x, -d * (1 - m.floor)) : Math.min(x, -d * (1 - m.floor));
    };
    const out: [string, number][] = [];
    for (const [f, k, d] of fams ?? []) if (d !== 0) out.push([k, term(f, d)]);
    if (over > 0) out.push(['pressure_blowby', term('pressure', over)]);
    return out;
  },

  /**
   * How much of his three-point tendency a shooter keeps tonight: all of it until his threes pass
   * K.threeUse.level of his team's shots while he's on the floor, then less (the defense runs him off
   * the line and the ball finds others), as K.useLevel levels off a player's share of the possessions.
   */
  threeDamp(this: GameSim, p: SP): number {
    const over = p.b.tpa / p.b.tFga - K.threeUse.level;
    return over > 0 ? Math.exp(-K.threeUse.damp * over) : 1;
  },

  /**
   * Second-half score effects: a big lead makes the leader ease off and the trailer play loose;
   * late in a close game the leader plays not to lose and the trailer presses.
   */
  scoreEffect(this: GameSim, off: ST, def: ST) {
    if (this.q < 3) return 0;
    const m = off.score - def.score;
    let x = clamp((Math.abs(m) - K.easeFrom) / K.easeSpan, 0, 1) * K.ease + clamp((Math.abs(m) - K.easeBig.from) / K.easeBig.span, 0, 1) * K.easeBig.x;
    if (this.q >= 4 && this.clock < K.clutchSec && m !== 0 && Math.abs(m) <= 6) x += K.clutchEase;
    return m > 0 ? -x : x;
  },

  cornerOrWing(this: GameSim, off: ST, sh?: SP): ShotZone {
    const base = 0.27 + (off.t.offense.threePoint - 50) / 400;
    const w = base * (sh?.tcn ?? 1);
    return this.rng.chance(w / (w + 1 - base)) ? 'c3' : 'ab3';
  },

  /** Close finish: at the rim with base probability `pRim`, else a floater/hook; tilted by his drive tendency. */
  rimOr(this: GameSim, p: SP, pRim: number): ShotZone {
    const w = pRim * Math.sqrt(p.td);
    return this.rng.chance(w / (w + 1 - pRim)) ? 'rim' : 'paint';
  },

  /** Pull-up / floater zone: mid-range with base probability `pMid`, tilted by his mid-range tendency. */
  midOr(this: GameSim, p: SP, pMid: number): ShotZone {
    const w = pMid * p.tm;
    return this.rng.chance(w / (w + 1 - pMid)) ? 'mid' : 'paint';
  },

  shotXY(this: GameSim, zone: ShotZone): { x: number; y: number } {
    const r = this.fx;
    const by = 5.25;
    switch (zone) {
      case 'rim': {
        const d = r.uniform(0, 4);
        const a = r.uniform(0.1, Math.PI - 0.1);
        return { x: d * Math.cos(a), y: by + d * Math.sin(a) * 0.9 };
      }
      case 'paint': {
        const d = r.uniform(4, 13);
        const a = r.uniform(0.35, Math.PI - 0.35);
        return { x: clamp(d * Math.cos(a), -7.5, 7.5), y: by + d * Math.sin(a) };
      }
      case 'mid': {
        const d = r.uniform(13, 21.5);
        const a = r.uniform(0.25, Math.PI - 0.25);
        return { x: d * Math.cos(a), y: by + d * Math.sin(a) };
      }
      case 'c3':
        return { x: (r.chance(0.5) ? -1 : 1) * r.uniform(22, 23.5), y: r.uniform(1, 13) };
      default: {
        const d = r.uniform(24, 27);
        const a = r.uniform(0.42, Math.PI - 0.42);
        return { x: d * Math.cos(a), y: by + d * Math.sin(a) };
      }
    }
  },

  /**
   * The wall's edge against a handler (see src/core/sim/links.ts): when his man is a point-of-attack
   * stopper with a rim anchor behind him, the handler's edge on the pick-and-roll or the isolation is
   * smaller, by the link's strength; tagged for the defense.
   */
  wallEdge(this: GameSim, def: ST, guard: SP, act: 'pnr' | 'iso', pid: number): number {
    const w = def.wall?.get(guard.pid);
    if (!w) return 0;
    const edge = lev(K.link.wall * w);
    this.impact('link_wall', def.side, edge * K.advPts[act] * (K.link.tag.link_wall ?? 1), pid);
    return edge;
  },

  /**
   * What partnerships do to a half-court shot (see src/core/sim/links.ts), as openness by impact tag:
   * the passer's link with the shooter where the action is theirs (inside-out's kick-out, the handoff
   * chain's handoffs and cuts), and the crowded paint everyone but its bigs drives into.
   */
  linkOpen(this: GameSim, off: ST, s: ShotOpts): [string, number][] {
    const f = s.finish;
    if ((!off.links && !off.crowd) || f === 'transition' || f === 'putback' || f === 'misc') return NONE_TAGS;
    const a = s.assister;
    const l = a && off.links?.get(linkKey(a.pid, s.shooter.pid));
    // (the two-man game and the pick-and-pop play in the pick-and-roll itself, see pnr.ts)
    const link = l && (l.id === 'inOut' ? f === 'spotup' : l.id === 'dho' && (f === 'handoff' || f === 'offscreen' || f === 'cut')) ? l : null;
    const crowd = !!off.crowd && (s.zone === 'rim' || s.zone === 'paint') && f !== 'post' && !off.crowd.has(s.shooter.pid);
    if (!link && !crowd) return NONE_TAGS;
    const out: [string, number][] = [];
    if (link) out.push([`link_${link.id}`, lev(K.link[link.id] * link.s)]);
    if (crowd) out.push(['clash_crowd', -lev(K.link.crowd)]);
    return out;
  },

  shoot(this: GameSim, off: ST, def: ST, s: ShotOpts) {
    const sh = s.shooter;
    const zone = s.zone;
    const three = zone === 'c3' || zone === 'ab3';
    const value = three ? 3 : 2;
    // skill for the zone
    let skill: number;
    switch (zone) {
      case 'rim':
        skill = sh.c.rim;
        break;
      case 'paint':
        skill = sh.c.close;
        break;
      case 'mid':
        skill = sh.c.midShot;
        break;
      default:
        // (past K.threeTop.from a three-point shooter's skill counts at K.threeTop.keep: see there)
        skill = s.pullup ? sh.c.pu3 : sh.c.c3;
        if (skill > K.threeTop.from) {
          const t = K.threeTop;
          skill = t.from + (Math.min(skill, t.top) - t.from) * t.keep + Math.max(0, skill - t.top) * t.keepTop;
        }
    }
    // past 1x tactical leverage, a defense overplaying the ball is a step out of position on the
    // half-court shots that do get off, as much as the offense's handlers make of it (the trade-off
    // that keeps heavy pressure from a free win against teams that can handle it)
    const beat = clamp(1 + (off.secQ - K.tradeOff.sec.avg) / K.tradeOff.sec.open, 0.25, 1.5);
    const over = s.finish === 'putback' || s.finish === 'transition' ? 0 : levExtra(K.tradeOff.pressure * Math.max(0, this.pressure(def)) * beat);
    // (the room tactics have to open or close a look grows with the tactical leverage)
    // the big decisions' looks count by who gets them (K.matchup): the room the scheme, the coverage,
    // help, the double or ball pressure left him, by his skill for the shot
    const fit = s.finish === 'putback' || s.finish === 'transition' ? NONE_TAGS : this.matchupOpen(sh, zone, !!s.pullup, skill, s.tags, over);
    let mine = 0;
    for (const [, v] of fit) mine += v;
    // the shape: five-out's open paint, the double post's crowded one (and its bigs inside)
    const shape = this.shapeOpen(off, sh, zone, s.finish);
    // partnerships: the passer and the shooter's link, the wall a drive meets, the crowded paint
    const links = this.linkOpen(off, s);
    let link = 0;
    for (const [, v] of links) link += v;
    const open = clamp(s.open + over + mine + shape + link + this.rng.normal(0, 0.18), -lev(1.2), lev(1.3));
    let p = K.zoneBase[zone] + ((skill * sh.perf - 50) / 50) * K.zoneSkill[zone] + open * K.zoneOpen[zone];
    if (s.pullup && three) p -= 0.012;
    // contesting defender quality
    const c = s.contest;
    let stopper = 0;
    if (c) {
      if (zone === 'rim' || zone === 'paint') p -= ((c.c.rimProt * this.dq(c) - 50) / 50) * 0.07;
      else p -= ((c.c.perDef * this.dq(c) - 50) / 50) * 0.022;
      // a wing stopper on his own man makes every look a little tougher
      if (c.drole === 'stopper' && def.guardOf.get(sh.pid) === c) stopper = lev(K.role.stopperContest);
      p -= stopper;
    }
    // the offense's feel (reads, passing, handling) against the defense's team defense (help,
    // on-ball, inside): what lets good teams get good shots and bad ones not, beyond the matchups
    p += ((off.feelQ - def.defQ - K.feelGap) / 50) * K.feel;
    // familiarity: an offense that doesn't know what it's running gets worse looks, a defense that
    // doesn't know its rotations gives up better ones (none for a fluid unit)
    const famO = off.famOff * K.fam.shot;
    const famD = def.famDef * K.fam.shotD;
    p += famD - famO;
    // fatigue
    p -= (1 - sh.energy) * 0.12;
    // physicality: tighter contests
    const phys = lev((def.t.defense.physicality - 50) / 50);
    p -= phys * K.physContest;
    // home court, the game's shooting conditions and the score
    if (!this.opts.neutral) p += off.side === 0 ? K.home : -K.home * 0.3;
    if (this.opts.edge) p += this.opts.edge[off.side];
    p += this.env.shoot + this.scoreEffect(off, def);
    // late-game nerves: close and late, a player short on feel (offensive IQ) shoots a little worse, one with plenty a little better
    if (this.q >= 4 && this.clock < 120 && Math.abs(off.score - def.score) <= 5) p -= (60 - sh.r.oiq) / 2000;
    // a trip begun with the period nearly over gets a scrambled look (see halfCourt)
    p *= this.scramble;
    p = clamp(p, 0.04, 0.93);

    // impact accounting: each tag's openness contribution in expected points (a big decision's with
    // what the shooter made of it: see matchupOpen)
    // (once a key: a family's term goes to its first tag on the look)
    const credited = fit.length ? new Set<string>() : null;
    const extra = (k: string) => {
      if (!credited || credited.has(k)) return 0;
      credited.add(k);
      return fit.reduce((a, [fk, v]) => (fk === k ? a + v : a), 0);
    };
    if (s.tags) {
      for (const [k, d] of s.tags) {
        if (d === 0) continue;
        this.impact(k, off.side, (d + extra(k)) * K.zoneOpen[zone] * value, sh.pid);
      }
    }
    if (over) this.impact('pressure_blowby', off.side, (over + extra('pressure_blowby')) * K.zoneOpen[zone] * value, sh.pid);
    if (famO) this.impact('fam_off', def.side, famO * value, sh.pid);
    if (shape) this.impact('shape_space', off.side, shape * K.zoneOpen[zone] * value, sh.pid);
    for (const [k, v] of links) this.impact(k, off.side, v * (K.link.tag[k] ?? 1) * K.zoneOpen[zone] * value, sh.pid);
    if (stopper) this.impact('role_stopper', def.side, stopper * value, sh.pid);
    // (the anchor's share of the rim's contests beyond what he'd get as anyone else, at his edge over an average contester)
    if (c?.drole === 'anchor' && (zone === 'rim' || zone === 'paint') && def.guardOf.get(sh.pid) !== c) {
      const extra = 1 - 1 / levW(K.role.anchorRim);
      this.impact('role_anchor', def.side, extra * ((c.c.rimProt * this.dq(c) - 50) / 50) * 0.07 * value, sh.pid);
    }
    if (famD) this.impact('fam_def', off.side, famD * value, sh.pid);
    if (sh.energy < 0.7) this.impact('fatigue', def.side, (1 - sh.energy) * 0.12 * value * 0.5, sh.pid);

    // block?
    let blocker: SP | null = null;
    const pBlk = c ? K.blockMiss[zone] * (1 + levExtra(K.recenter.blk)) * Math.pow(clamp(blockSkill(c), 10, 100) / 55, 2) * c.tbk * (1 - 0.3 * clamp(open, -1, 1)) : 0;
    // shooting foul?
    const draw = Math.pow(clamp(sh.c.foulDraw, 10, 100) / 50, 0.9) * (1 + 0.3 * phys) * (s.forcedFoulMult ?? 1);
    const pFoul = K.foulRate[zone] * (1 + levExtra(K.recenter.foul)) * draw * this.env.fouls;
    if (phys !== 0) {
      // net of the extra fouls (a trip to the line instead of the shot) and the tighter contest
      const andOne = p * (zone === 'rim' || zone === 'paint' ? 0.45 : 0.25);
      const foulGain = andOne * (value + 0.78) + (1 - andOne) * value * 0.78 - p * value;
      const extraFouls = pFoul - pFoul / (1 + 0.3 * phys);
      this.impact(phys > 0 ? 'physicality' : 'clean_defense', off.side, extraFouls * foulGain - K.physContest * phys * value * (1 - pFoul), sh.pid);
    }
    if (s.foulTag) {
      const andOne = p * (zone === 'rim' || zone === 'paint' ? 0.45 : 0.25);
      const foulGain = andOne * (value + 0.78) + (1 - andOne) * value * 0.78 - p * value;
      this.impact(s.foulTag[0], off.side, (pFoul - pFoul / s.foulTag[1]) * foulGain * (s.foulTag[2] ?? 1), sh.pid);
    }
    const fouled = this.rng.chance(pFoul);
    // (fouled, it goes in less often: an and-one)
    const pMake = fouled ? p * (zone === 'rim' || zone === 'paint' ? 0.45 : 0.25) : p;
    let made: boolean;
    if (fouled) made = this.rng.chance(pMake);
    else {
      made = this.rng.chance(p);
      if (!made && c && this.rng.chance(clamp(pBlk, 0, 0.6))) blocker = c;
      else if (!made && c) {
        // the shooter's own man can get a piece of it too: timing and length, less about size
        const md = this.defOf(def, sh);
        const chase = K.chaseBlock[zone] * Math.pow(clamp(blockSkill(md), 10, 100) / 55, 2) * md.tbk * (1 - 0.3 * clamp(open, -1, 1));
        if (md !== c && this.rng.chance(clamp(chase, 0, 0.3))) blocker = md;
      }
    }

    // record attempt
    const xy = this.record || this.opts.keepShots ? this.shotXY(zone) : null;
    const ast = made && s.assister && s.assister !== sh && this.rng.chance(this.assistProb(s.finish, zone)) ? s.assister : null;
    if (!fouled || made) {
      sh.b.fga++;
      off.tot.fga++;
      if (three) {
        sh.b.tpa++;
        off.tot.tpa++;
      }
      for (const pl of off.on) {
        pl.b.tFga++;
        if (pl.b.tFga >= K.threeUse.from) pl.t3 = pl.t3o * this.threeDamp(pl);
      }
      if (zone === 'rim') sh.b.rimA++;
      if (zone === 'mid') sh.b.midA++;
      if (zone === 'c3') sh.b.c3A++;
      // what the look was worth before it fell or didn't (an attempt a foul wiped out isn't one)
      const xs = this.xShots[off.side];
      xs.pts += pMake * value;
      if (three) xs.tpm += pMake;
      if (xy) {
        this.shots.push({ t: off.side, pid: sh.pid, x: Math.round(xy.x * 10) / 10, y: Math.round(xy.y * 10) / 10, made, zone, q: this.q });
      }
    } else this.xFouledMiss[off.side] += pMake * value;
    const shotStep: PossStep | null = this.record ? { k: 'shot', pid: sh.pid, zone, x: xy!.x, y: xy!.y, made, v: value, pid2: ast?.pid, f: s.finish } : null;
    if (shotStep) {
      this.cur!.steps.push(shotStep);
      if (blocker) this.cur!.steps.push({ k: 'block', pid: blocker.pid, pid2: sh.pid });
    }
    if (!this.cur?.finish && this.cur) this.cur.finish = s.finish;
    this.possFinish = s.finish;
    this.lastShooter = sh;

    const desc = this.record ? this.shotDesc(zone, s.finish, !!s.pullup, !!ast, made, !!blocker) : '';
    // the court's captions call the shot as the play-by-play does
    if (shotStep) shotStep.d = desc;
    if (made) {
      sh.b.fgm++;
      off.tot.fgm++;
      if (three) {
        sh.b.tpm++;
        off.tot.tpm++;
      }
      if (zone === 'rim') sh.b.rimM++;
      if (zone === 'mid') sh.b.midM++;
      if (zone === 'c3') sh.b.c3M++;
      for (const pl of off.on) pl.b.tFgm++;
      const dz = three ? 'three' : zone === 'rim' ? 'rim' : zone === 'paint' ? 'paint' : 'mid';
      engineDiag.made[dz]++;
      if (ast) engineDiag.ast[dz]++;
      if (ast) {
        sh.b.astM++;
        ast.b.ast++;
        off.tot.ast++;
      }
      if (zone === 'rim' || zone === 'paint') off.ex.paint += 2;
      sh.hot = Math.min(5, sh.hot + 1);
      this.score(off, def, sh, value);
      const fouler = fouled ? this.shootingFouler(def, c, sh) : null;
      if (this.record) this.addPbp(off.side, `${sh.name} ${desc} — good${ast ? ` (${ast.name} assist)` : ''}${fouler ? `, and one! Foul on ${fouler.name}.` : '.'}`, 'make');
      if (fouler) {
        if (this.record) this.cur!.steps.push({ k: 'foul', pid: fouler.pid, pid2: sh.pid });
        this.addFoul(def, fouler);
        this.freeThrows(off, def, sh, 1, s.finish);
        return;
      }
      this.ctx = 'made';
      this.finishPoss(off, s.finish);
      return;
    }
    sh.hot = Math.max(0, sh.hot - 1);
    if (fouled) {
      const fouler = this.shootingFouler(def, c, sh);
      if (this.record) this.addPbp(off.side, `${sh.name} fouled on ${desc} by ${fouler.name}.`, 'foul');
      this.addFoul(def, fouler);
      if (this.record) this.cur!.steps.push({ k: 'foul', pid: fouler.pid, pid2: sh.pid });
      this.freeThrows(off, def, sh, value, s.finish);
      return;
    }
    if (blocker) {
      blocker.b.blk++;
      def.tot.blk++;
      if (this.record) this.addPbp(off.side, `${sh.name} ${desc} — blocked by ${blocker.name}.`, 'miss');
    } else if (this.record) this.addPbp(off.side, `${sh.name} misses ${desc}.`, 'miss');
    this.rebound(off, def, zone, !!blocker, false);
  },

  /** Catch on a kick-out: let it fly, or attack a hard closeout. */
  spotUp(this: GameSim, off: ST, def: ST, s: ShotOpts) {
    const sh = s.shooter;
    // top-locked by a junk defense's chaser: a hand in his face on the catch (none of the junk zone's
    // open looks reach him), but his man closes out high and can be driven past
    const lk = this.lock(def, off, sh);
    if (lk) {
      const key = this.openKey(def);
      const zoneOpen = (s.tags ?? []).reduce((a, [k, x]) => (k === key ? a + x : a), 0);
      s = { ...s, open: s.open - zoneOpen - lk.c3, tags: [...(s.tags ?? []).filter(([k]) => k !== key), [lk.tag, -lk.c3]] };
    } else {
      // a roamer has left him to help, and a rim anchor stays home in the paint: the catch is open
      // (the anchor's man only as far as he's a shooter)
      const md = def.guardOf.get(sh.pid);
      const gift = md?.drole === 'roamer' ? levGift(K.role.roamKick) : md?.drole === 'anchor' ? lev(K.role.anchorKick) * clamp((sh.c.c3 - 40) / 30, 0, 1.5) : 0;
      if (gift) s = { ...s, open: s.open + gift, tags: [...(s.tags ?? []), [md!.drole === 'roamer' ? 'role_roam' : 'role_anchor', gift]] };
    }
    const t3 = off.t.offense.threePoint / 100;
    const wShoot =
      Math.pow(Math.max(5, sh.c.c3) / 50, 2.2) *
      (0.55 + t3) *
      (1 + levExtra(K.recenter.three)) *
      sh.t3 *
      (1 + 0.6 * clamp(s.open, -0.5, 1)) *
      (this.eases(off) ? K.garbage.three : 1);
    let wDrive = Math.pow(Math.max(5, sh.c.create) / 50, 2) * 0.42 * sh.td * (0.7 + 0.6 * (off.t.offense.rimAttack / 100)) * (1 - 0.35 * clamp(s.open, -0.5, 1));
    // (a defender closing out high gets attacked off the catch)
    if (lk) wDrive *= 1 + 2 * lk.beat;
    // (down three late, the catch is for the three)
    if (this.q >= 4 && this.clock <= 35) wDrive *= this.prefs(off, this.lateMode(off, def)).two;
    if (this.rng.weighted([wShoot, wDrive]) === 0) {
      this.shoot(off, def, s);
      return;
    }
    if (this.record) this.cur!.steps.push({ k: 'drive', pid: sh.pid });
    const d = s.contest ?? this.defOf(def, sh);
    const adv = (sh.c.create - d.c.perDef * this.dq(d)) / 20 + Math.max(0, s.open) * 0.6;
    const r = this.rng.next();
    const pMid = (0.15 * sh.tm) / (0.15 * sh.tm + 0.85);
    const zone: ShotZone = r < pMid ? 'mid' : this.rimOr(sh, 0.65);
    const help = this.help(def);
    const tags: [string, number][] = [['help_paint', -lev(help * 0.2)]];
    let o = adv * 0.3 + this.spacingBonus(off) * 0.4 - lev(help * 0.2);
    if (lk) {
      o += lk.beat;
      tags.push([lk.beatTag, lk.beat]);
    }
    // (a zone walls off the drive off the catch as it does any other)
    const zd = this.zone(def);
    if (zd && zone !== 'mid') {
      o -= lev(zd.drive);
      tags.push(['zone_paint', -lev(zd.drive)]);
    }
    const roam = zone !== 'mid' ? this.roamHelp(def, off, sh) : 0;
    if (roam) {
      o -= roam;
      tags.push(['role_roam', -roam]);
    }
    this.shoot(off, def, { shooter: sh, zone, open: o, contest: zone === 'rim' ? this.rimContester(def, d) : d, assister: s.assister, finish: 'spotup', tags });
  },

  /**
   * Chance a made shot off a pass is credited as an assist. A catch-and-shoot three, a lob or a dump-off
   * at the rim nearly always is; a floater, a runner or a pull-up after the catch only when the pass
   * led straight to it (about half the time). With TWO_ASSIST the league's makes are assisted about
   * 61% of the time at the rim, 44% in the paint, 39% from mid-range and 82% from three: 63% of its
   * baskets, the NBA's 64% (2025-26: 26.6 assists on 41.8 baskets a game).
   */
  assistProb(this: GameSim, f: FinishType, zone: ShotZone) {
    const three = zone === 'c3' || zone === 'ab3';
    return three ? this.finishAssist(f, zone, true) : TWO_ASSIST * this.finishAssist(f, zone, false);
  },

  /** A finish's assist rate before TWO_ASSIST (see assistProb). */
  finishAssist(this: GameSim, f: FinishType, zone: ShotZone, three: boolean) {
    switch (f) {
      case 'spotup':
        return three ? 0.98 : zone === 'rim' ? 0.7 : zone === 'paint' ? 0.5 : 0.75;
      case 'cut':
      case 'pnrRoll':
        return zone === 'paint' ? 0.85 : 0.93;
      case 'offscreen':
      case 'handoff':
        return three ? 0.96 : zone === 'rim' ? 0.5 : zone === 'paint' ? 0.55 : 0.65;
      case 'transition':
        // (an outlet or a hit-ahead the runner still has to take to the basket himself, often enough)
        return 0.8;
      case 'post':
        return 0.25;
      default:
        return 0.6;
    }
  },

  /**
   * Play-by-play wording for a shot (an alley-oop needs the pass it's credited to). A dunk is nearly
   * always good (about 9 in 10 go down, against about 6 in 10 layups), so a miss at the rim, and most
   * blocks there, are layups.
   */
  shotDesc(this: GameSim, zone: ShotZone, f: FinishType, pullup: boolean, assisted: boolean, made = true, blocked = false) {
    const r = this.fx;
    switch (zone) {
      case 'rim':
        if (!made) {
          if (r.chance(blocked ? 0.08 : 0.06)) return f === 'putback' ? 'putback dunk' : 'dunk';
          if (f === 'putback') return r.pick(['putback', 'tip-in', 'putback layup']);
          if (f === 'post') return r.pick(['drop-step layup', 'layup', 'up-and-under']);
          return f === 'pnrRoll' || f === 'cut' || f === 'transition' ? 'layup' : r.pick(['driving layup', 'layup', 'reverse layup', 'layup']);
        }
        if (f === 'putback') return r.pick(['putback', 'tip-in', 'putback dunk', 'putback layup']);
        if (f === 'post') return r.pick(['drop-step layup', 'layup', 'dunk', 'up-and-under']);
        return f === 'pnrRoll' || f === 'cut' || f === 'transition'
          ? r.pick(['dunk', 'layup', assisted ? 'alley-oop' : 'dunk', 'dunk'])
          : r.pick(['driving layup', 'layup', 'dunk', 'reverse layup']);
      case 'paint':
        if (f === 'putback') return r.pick(['putback', 'tip-in', 'putback']);
        return f === 'post' ? r.pick(['hook shot', 'turnaround', 'post fadeaway']) : r.pick(['floater', 'runner', 'short jumper']);
      case 'mid':
        return pullup ? 'pull-up jumper' : r.pick(['mid-range jumper', 'elbow jumper', 'baseline jumper']);
      case 'c3':
        return 'corner three';
      default:
        return pullup ? r.pick(['pull-up three', 'step-back three']) : r.pick(['three-pointer', 'catch-and-shoot three', 'three from the wing']);
    }
  },
};
