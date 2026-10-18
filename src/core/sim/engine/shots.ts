// Shots: the make probability (zone, skill, openness, the contest, the offense's feel against the
// team defense, fatigue, physicality, home court, the night's conditions and the score), the tags'
// expected points, blocks, shooting fouls and and-ones, assists, the box score and play-by-play of
// the attempt; the spot-up catch (shoot it, or attack a hard closeout); and where shots come from.

import type { ShotZone } from '../../types';
import { clamp } from '../../random';
import type { FinishType, PossStep } from '../log';
import { K, engineDiag, lev, levExtra, levGift } from './constants';
import type { SP, ST, ShotOpts } from './state';
import type { GameSim } from './game';

/** Who gets the block on a contested miss: mostly timing and instincts (BLK), some length and pop. */
const blockSkill = (p: { r: { blk: number; hgt: number; ath: number } }) => 0.7 * p.r.blk + 0.18 * p.r.hgt + 0.12 * p.r.ath;

export const shotsMethods = {
  /**
   * Second-half score effects: a big lead makes the leader ease off and the trailer play loose;
   * late in a close game the leader plays not to lose and the trailer presses.
   */
  scoreEffect(this: GameSim, off: ST, def: ST) {
    if (this.q < 3) return 0;
    const m = off.score - def.score;
    let x = clamp((Math.abs(m) - K.easeFrom) / K.easeSpan, 0, 1) * K.ease;
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
        skill = s.pullup ? sh.c.pu3 : sh.c.c3;
    }
    // past 1x tactical leverage, a defense overplaying the ball is a step out of position on the
    // half-court shots that do get off, as much as the offense's handlers make of it (the trade-off
    // that keeps heavy pressure from a free win against teams that can handle it)
    const beat = clamp(1 + (off.secQ - K.tradeOff.sec.avg) / K.tradeOff.sec.open, 0.25, 1.5);
    const over = s.finish === 'putback' || s.finish === 'transition' ? 0 : levExtra(K.tradeOff.pressure * Math.max(0, this.pressure(def)) * beat);
    // (the room tactics have to open or close a look grows with the tactical leverage)
    const open = clamp(s.open + over + this.rng.normal(0, 0.18), -lev(1.2), lev(1.3));
    let p = K.zoneBase[zone] + ((skill * sh.perf - 50) / 50) * K.zoneSkill[zone] + open * K.zoneOpen[zone];
    if (s.pullup && three) p -= 0.012;
    // contesting defender quality
    const c = s.contest;
    if (c) {
      if (zone === 'rim' || zone === 'paint') p -= ((c.c.rimProt * this.dq(c) - 50) / 50) * 0.07;
      else p -= ((c.c.perDef * this.dq(c) - 50) / 50) * 0.022;
    }
    // the offense's feel (reads, passing, handling) against the defense's team defense (help,
    // on-ball, inside): what lets good teams get good shots and bad ones not, beyond the matchups
    p += ((off.feelQ - def.defQ - K.feelGap) / 50) * K.feel;
    // fatigue
    p -= (1 - sh.energy) * 0.12;
    // physicality: tighter contests
    const phys = lev((def.t.defense.physicality - 50) / 50);
    p -= phys * K.physContest;
    // home court, the game's shooting conditions and the score
    if (!this.opts.neutral) p += off.side === 0 ? K.home : -K.home * 0.3;
    p += this.env.shoot + this.scoreEffect(off, def);
    // late-game nerves: close and late, a player short on feel (offensive IQ) shoots a little worse, one with plenty a little better
    if (this.q >= 4 && this.clock < 120 && Math.abs(off.score - def.score) <= 5) p -= (60 - sh.r.oiq) / 2000;
    p = clamp(p, 0.04, 0.93);

    // impact accounting: each tag's openness contribution in expected points
    if (s.tags) {
      for (const [k, d] of s.tags) {
        if (d === 0) continue;
        this.impact(k, off.side, d * K.zoneOpen[zone] * value, sh.pid);
      }
    }
    if (over) this.impact('pressure_blowby', off.side, over * K.zoneOpen[zone] * value, sh.pid);
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
      this.impact(s.foulTag[0], off.side, (pFoul - pFoul / s.foulTag[1]) * foulGain, sh.pid);
    }
    const fouled = this.rng.chance(pFoul);
    let made: boolean;
    if (fouled) made = this.rng.chance(p * (zone === 'rim' || zone === 'paint' ? 0.45 : 0.25));
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
      for (const pl of off.on) pl.b.tFga++;
      if (three) {
        sh.b.tpa++;
        off.tot.tpa++;
      }
      if (zone === 'rim') sh.b.rimA++;
      if (zone === 'mid') sh.b.midA++;
      if (zone === 'c3') sh.b.c3A++;
      if (xy) {
        this.shots.push({ t: off.side, pid: sh.pid, x: Math.round(xy.x * 10) / 10, y: Math.round(xy.y * 10) / 10, made, zone, q: this.q });
      }
    }
    const shotStep: PossStep | null = this.record ? { k: 'shot', pid: sh.pid, zone, x: xy!.x, y: xy!.y, made, v: value, pid2: ast?.pid, f: s.finish } : null;
    if (shotStep) {
      this.cur!.steps.push(shotStep);
      if (blocker) this.cur!.steps.push({ k: 'block', pid: blocker.pid, pid2: sh.pid });
    }
    if (!this.cur?.finish && this.cur) this.cur.finish = s.finish;
    this.possFinish = s.finish;
    this.lastShooter = sh;

    const desc = this.record ? this.shotDesc(zone, s.finish, !!s.pullup, !!ast) : '';
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
    // top-locked (a junk defense's chaser, or run off the line): a hand in his face on the catch (none
    // of a junk zone's open looks reach him), but his man closes out high and can be driven past
    const lk = this.lock(def, off, sh);
    if (lk) {
      const key = this.openKey(def);
      const zoneOpen = lk.tag === 'box_chase' ? (s.tags ?? []).reduce((a, [k, x]) => (k === key ? a + x : a), 0) : 0;
      s = { ...s, open: s.open - zoneOpen - lk.c3, tags: [...(s.tags ?? []).filter(([k]) => lk.tag !== 'box_chase' || k !== key), [lk.tag, -lk.c3]] };
    } else if (this.pd(def, sh) === 'sag') {
      // sagged off: the kick-out finds him open
      s = { ...s, open: s.open + levGift(K.pd.sag.kick), tags: [...(s.tags ?? []), ['pd_sag', levGift(K.pd.sag.kick)]] };
    }
    const t3 = off.t.offense.threePoint / 100;
    const wShoot = Math.pow(Math.max(5, sh.c.c3) / 50, 2.2) * (0.55 + t3) * (1 + levExtra(K.recenter.three)) * sh.t3 * (1 + 0.6 * clamp(s.open, -0.5, 1));
    let wDrive = Math.pow(Math.max(5, sh.c.create) / 50, 2) * 0.42 * sh.td * (0.7 + 0.6 * (off.t.offense.rimAttack / 100)) * (1 - 0.35 * clamp(s.open, -0.5, 1));
    // (a defender closing out high gets attacked off the catch)
    if (lk) wDrive *= 1 + 2 * lk.beat;
    if (this.go3) wDrive *= 0.05;
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
    const body = this.body(def, sh);
    if (body) {
      o -= lev(K.pd.body.drive);
      tags.push(['pd_body', -lev(K.pd.body.drive)]);
    }
    const sag = zone !== 'mid' ? this.sagHelp(def, off, sh) : 0;
    if (sag) {
      o -= sag;
      tags.push(['pd_sag', -sag]);
    }
    this.shoot(off, def, { shooter: sh, zone, open: o, contest: zone === 'rim' ? this.rimContester(def, d) : d, assister: s.assister, finish: 'spotup', tags, ...body });
  },

  /** Chance a made shot off a pass is credited as an assist (NBA: ~85% of threes, ~65% at the rim, ~40% of mid-range). */
  assistProb(this: GameSim, f: FinishType, zone: ShotZone) {
    const three = zone === 'c3' || zone === 'ab3';
    switch (f) {
      case 'spotup':
        return three ? 0.98 : 0.75;
      case 'cut':
        return 0.98;
      case 'pnrRoll':
        return 0.97;
      case 'offscreen':
      case 'handoff':
        return three ? 0.96 : zone === 'rim' ? 0.5 : 0.7;
      case 'transition':
        return 0.92;
      case 'post':
        return 0.25;
      default:
        return 0.6;
    }
  },

  /** Play-by-play wording for a shot (an alley-oop needs the pass it's credited to). */
  shotDesc(this: GameSim, zone: ShotZone, f: FinishType, pullup: boolean, assisted: boolean) {
    const r = this.fx;
    switch (zone) {
      case 'rim':
        if (f === 'putback') return r.pick(['putback', 'tip-in', 'putback dunk', 'putback layup']);
        if (f === 'post') return r.pick(['drop-step layup', 'layup', 'dunk', 'up-and-under']);
        return f === 'pnrRoll' || f === 'cut' || f === 'transition'
          ? r.pick(['dunk', 'layup', assisted ? 'alley-oop' : 'dunk', 'layup'])
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
