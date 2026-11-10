// Fouls and free throws: late-game intentional fouls (fouling when trailing, up three, a foul to give,
// hack-a-player), reach-ins and side outs, the penalty, who is charged with a shooting foul, personal
// fouls and foul-outs (a technical for each one past the sixth when nobody is left), and the line.

import { clamp } from '../../random';
import { GAME } from '../../constants';
import type { FinishType } from '../log';
import { K } from './constants';
import { TK } from './tk';
import type { SP, ST } from './state';
import type { GameSim } from './game';

export const foulsMethods = {
  intentionalFoul(this: GameSim, off: ST, def: ST): 'ft' | 'sideout' | null {
    const final = this.q >= 4;
    const clock = this.clock;
    const defDiff = def.score - off.score;
    let fouled: SP | null = null;
    let tag = '';
    this.foulAt = 0;
    if (final && def.t.manage.foulWhenTrailing && defDiff < 0) {
      // when on this trip the trailing defense fouls (decided once, as the ball comes in): now, or when
      // the clock gets down to it (see halfCourt)
      this.foulAt = this.lateFoulAt(def, -defDiff, clock, GAME.shotClock);
      if (this.foulAt > 0 && clock <= this.foulAt) {
        this.foulAt = 0;
        fouled = this.lateFoulTarget(off);
        tag = 'late_foul';
        // (now and then the pressure gets the ball before the foul: a pass picked off, a five-second call)
        if (clock > 2 && this.rng.chance(K.lateSteal.inbound)) {
          this.tick(this.rng.uniform(0.4, Math.min(3, clock - 0.5)));
          if (this.cur) this.cur.label = 'Turnover against the pressure';
          this.turnover(off, def, fouled, this.rng.chance(0.6) ? this.stealer(def) : null, 'misc');
          return 'ft';
        }
      }
    }
    if (!fouled && final && def.habit.foulUp3 && defDiff === 3 && clock <= 7 && clock >= 1.5) {
      const ws = off.on.map((p) => this.usageWeight(p, off, 'any'));
      fouled = off.on[this.rng.weighted(ws)];
      tag = 'foul_up3';
    }
    // a foul to give: they have the ball for the period's last shot, and a foul is only a side out, so
    // the ball handler is fouled at once and they inbound with less time (in the 4th quarter and
    // overtime only when up three or less, or tied)
    if (
      !fouled &&
      def.t.manage.foulToGive &&
      clock <= K.ftg.max &&
      clock > K.ftg.min &&
      (!final || (defDiff >= 0 && defDiff <= 3)) &&
      def.fouls + 1 < GAME.bonusFouls - (this.q > 4 ? 1 : 0) &&
      !(clock < 120 && def.foulsLast2 >= 1)
    ) {
      fouled = off.on.reduce((a, p) => (p.c.pnrHandle > a.c.pnrHandle ? p : a), off.on[0]);
      tag = 'foul_give';
    }
    // NBA: an away-from-the-play foul in the last two minutes of any period costs a free throw and the
    // ball; a game plan can name its targets (whatever they shoot) and the quarter it starts in
    const hack = def.t.manage.hackThreshold;
    const targets = def.t.manage.hackTargets;
    if (!fouled && (hack > 0 || targets?.length) && clock >= 120 && Math.min(this.q, 4) >= (def.t.manage.hackFromQ ?? 1)) {
      const target = off.on.filter((p) => p.ftPct * 100 < hack || targets?.includes(p.pid)).sort((a, b) => a.ftPct - b.ftPct)[0];
      if (target && this.rng.chance(0.8)) {
        fouled = target;
        tag = 'hack';
        off.hacked.set(target.pid, (off.hacked.get(target.pid) ?? 0) + 1);
      }
    }
    if (!fouled) return null;
    return this.commitFoul(off, def, fouled, tag);
  },

  /**
   * The seconds left at which the trailing defense (down `down` in the fourth quarter or overtime)
   * fouls on the trip just begun, or 0 for none on it. Down three or less, it fouls once the leader
   * could run the clock out (the game clock under the shot clock), as real teams do 81-86% of the
   * time: most at once, the rest after playing for a steal for a few seconds (the coach's habit; it
   * sets `trap`, see K.lateSteal and halfCourt), a little less often with only seconds left (there
   * isn't always time); with more time left now and then it fouls a few seconds in anyway, for two
   * trips to the leader's one (25-37% of the chances). Down four to nine it fouls by how far down it
   * is and how much time is left (K.lateFoul.by, the NBA's own shares): at once, or from about half a
   * minute on a trip begun before that.
   */
  lateFoulAt(this: GameSim, def: ST, down: number, clock: number, shotLeft: number): number {
    if (clock <= 1.2) return 0;
    const r = this.rng.next();
    const k = K.lateFoul;
    if (down <= 3) {
      if (clock <= shotLeft + 1) {
        if (clock <= 4) return r < k.last ? clock : 0;
        if (r < def.habit.lateFoul - K.lateSteal.first) return clock;
        // the steal first, then the foul (with no time for both, the foul)
        const at = clock - this.rng.uniform(K.lateSteal.time[0], K.lateSteal.time[1]);
        if (at < 1.5) return clock;
        this.trap = true;
        return at;
      }
      if (clock <= 40) return r < k.early ? clock - this.rng.uniform(2, 9) : 0;
      return 0;
    }
    if (down > 9 || clock <= 2.5 || clock > (down <= 6 ? 46 : 52)) return 0;
    const row = k.by[down - 4];
    if (clock > 32) return r < row[4] ? (down <= 6 ? this.rng.uniform(26, 33) : clock) : 0;
    return r < row[clock <= 5 ? 0 : clock <= 8 ? 1 : clock <= 14 ? 2 : 3] ? clock : 0;
  },

  /** Late in a game the offense gets the ball to its best free throw shooters, and the defense fouls whoever has it. */
  lateFoulTarget(this: GameSim, off: ST): SP {
    const ws = off.on.map((p) => Math.pow(p.ftPct, 6) * (0.5 + p.c.ballSec / 100));
    return off.on[this.rng.weighted(ws)];
  },

  /**
   * The trailing defense fouls as planned partway through the trip (see lateFoulAt): 'ft' when it sent
   * him to the line (the trip is over), 'sideout' when short of the penalty it was only a side out.
   */
  midTripFoul(this: GameSim, off: ST, def: ST): 'ft' | 'sideout' {
    this.foulAt = 0;
    return this.commitFoul(off, def, this.lateFoulTarget(off), 'late_foul');
  },

  commitFoul(this: GameSim, off: ST, def: ST, fouled: SP, tag: string): 'ft' | 'sideout' {
    if (this.cur) {
      this.cur.kind = 'ft';
      this.cur.label = tag === 'hack' ? `Hack-a-${fouled.name}` : tag === 'foul_give' ? 'Foul to give' : 'Intentional foul';
    }
    // late-game fouls come right on the catch and never let the clock run out; short of the
    // penalty a foul is only a side out, so a late foul is repeated until it sends him to the line
    for (let n = 0; n < 5 && this.clock > 0.3; n++) {
      const dt = tag === 'hack' ? this.rng.uniform(3, 7) : Math.min(this.clock - 0.3, this.rng.uniform(0.6, 2.4));
      this.tick(Math.max(0.2, dt));
      const fouler = def.on.reduce((a, p) => (p.fouls < a.fouls ? p : a), def.on[0]);
      if (this.record) {
        this.cur!.steps.push({ k: 'foul', pid: fouler.pid, pid2: fouled.pid });
        this.addPbp(def.side, tag === 'foul_give' ? `${fouler.name} fouls ${fouled.name} (a foul to give).` : `${fouler.name} intentional foul on ${fouled.name}.`, 'foul');
      }
      this.addFoul(def, fouler);
      if (tag === 'foul_give') {
        // now and then the whistle comes on the shot: two free throws instead of a worse last look
        if (this.rng.chance(K.ftg.inAct)) {
          this.impact('foul_give', off.side, 2 * fouled.ftPct - 1, fouled.pid);
          this.freeThrows(off, def, fouled, 2, 'misc');
          return 'ft';
        }
        // the inbounds play's worse first look, at about 0.15 points per unit of openness
        this.impact('foul_give', def.side, K.ftg.open * 0.15, fouled.pid);
        this.inbound = true;
        break;
      }
      if (this.bonus(def)) {
        // expected value vs a normal possession (~1.12)
        if (tag === 'hack') this.impact('hack', def.side, 1.12 - fouled.ftPct * 2, fouled.pid);
        this.freeThrows(off, def, fouled, 2, 'misc');
        return 'ft';
      }
      // a hack away from the penalty is just a side out: the possession goes on
      if (tag === 'hack') break;
    }
    return 'sideout';
  },

  /** In the penalty: from the fifth team foul of a quarter (fourth in overtime), or the second in a period's last two minutes. */
  bonus(this: GameSim, def: ST) {
    return def.fouls >= GAME.bonusFouls - (this.q > 4 ? 1 : 0) || (this.clock < 120 && def.foulsLast2 >= 2);
  },

  /** Reach-in / off-ball foul on the handler: free throws in the penalty (returns true), else a side out (sets sideOut). */
  nonShootingFoul(this: GameSim, off: ST, def: ST, handler: SP, defender: SP, finish: FinishType): boolean {
    const phys = this.phys(def);
    const pr = this.pressure(def);
    // (a clean, containing defense still reaches in now and then)
    const mult = Math.max(0.4, 1 + TK.phys.foul * phys + 0.4 * pr);
    // (a defense protecting a narrow lead in the last 24 seconds keeps its hands off)
    const lead = def.score - off.score;
    const careful = this.q >= 4 && this.clock <= 24 && lead >= 0 ? (lead <= 3 ? K.lateLeadFoul : K.clutchD.safe) : 1;
    const p = this.whistle(def, K.nonShootFoul * mult * (0.8 + handler.c.foulDraw / 250) * this.env.fouls * careful);
    if (this.rng.chance(p)) def.wpf++;
    else {
      // (now and then the defense kicks the ball instead: the offense keeps it, the shot clock at 14 or more)
      if (this.rng.chance(K.kicked)) {
        if (this.record) {
          this.addPbp(def.side, `Kicked ball violation on ${defender.name}.`, 'other');
          // (a whistle that stops play, as a foul's does)
          this.cur!.steps.push({ k: 'foul', pid: defender.pid });
        }
        this.sideOut = true;
      }
      return false;
    }
    const fouler = this.handsOff(def, this.rng.chance(clamp(0.7 * defender.tpf, 0.2, 0.92)) ? defender : def.on[this.rng.weighted(def.on.map((p) => p.tpf))]);
    // a hard foul now and then is a flagrant: two free throws and the ball
    const flagrant = this.rng.chance(K.flagrant);
    if (this.record) {
      this.addPbp(def.side, flagrant ? `Flagrant foul (1) on ${fouler.name}.` : `${this.fx.pick(['Foul', 'Reach-in foul', 'Holding foul', 'Foul'])} on ${fouler.name}.`, 'foul');
      this.cur!.steps.push({ k: 'foul', pid: fouler.pid, pid2: handler.pid });
    }
    this.addFoul(def, fouler);
    if (flagrant) {
      this.extraFreeThrow(off, def, handler, 'flagrant');
      this.extraFreeThrow(off, def, handler, 'flagrant');
      this.sideOut = true;
      return false;
    }
    if (this.bonus(def)) {
      // two free throws (~1.55) instead of the rest of the possession (~1.1)
      if (phys !== 0) this.impact(phys > 0 ? 'physicality' : 'clean_defense', off.side, (0.45 * TK.phys.foul * phys) / mult, handler.pid);
      if (pr !== 0) this.impact('pressure_foul', off.side, (0.45 * 0.4 * pr) / mult, handler.pid);
      this.freeThrows(off, def, handler, 2, finish);
      return true;
    }
    // side out: offense keeps the ball, and the shot clock restarts at 14 or more (see halfCourt)
    this.sideOut = true;
    return false;
  },

  /**
   * The inbound after a side-out foul in an action that plays on (one the shot clock wasn't rushing):
   * the ball comes in and the action is run again from the side, so its shot goes up a few seconds
   * after the whistle, never past the end of the period.
   */
  sideOutInbound(this: GameSim) {
    const dt = Math.min(this.rng.uniform(K.sideOutTime.min, K.sideOutTime.max), this.clock - 1.5);
    if (dt > 0) this.tick(dt);
  },

  /** Who is charged with a shooting foul: the help defender takes most contact, the beaten man some. */
  shootingFouler(this: GameSim, def: ST, c: SP | null, sh: SP): SP {
    const md = this.defOf(def, sh);
    const one = !c || c === md ? (c ?? md) : this.rng.weighted([0.6 * c.tpf, 0.4 * md.tpf]) === 0 ? c : md;
    return this.handsOff(def, one);
  },

  /**
   * A player on the floor in foul trouble (at the quarter's limit or past it: an AI coach riding with
   * him, or crunch time) plays with his hands off: a foul that would be his is a teammate's
   * 1 − K.foulRide.careful of the time.
   */
  handsOff(this: GameSim, def: ST, p: SP): SP {
    if (p.fouls < this.foulLimit(def) || this.rng.chance(K.foulRide.careful)) return p;
    const others = def.on.filter((x) => x !== p && x.fouls < GAME.foulOut - 1);
    return others.length ? others[this.rng.weighted(others.map((x) => x.tpf))] : p;
  },

  /** A defensive foul: counts toward the team's fouls for the penalty. */
  addFoul(this: GameSim, def: ST, p: SP) {
    def.fouls++;
    if (this.clock < 120) def.foulsLast2++;
    this.chargeFoul(def, p);
  },

  /** Charge a personal foul (offensive or defensive); the sixth fouls him out on the spot. */
  chargeFoul(this: GameSim, t: ST, p: SP) {
    p.fouls++;
    p.b.pf++;
    t.tot.pf++;
    if (p.fouls < GAME.foulOut) return;
    if (p.out === 0) {
      p.out = 1;
      p.outAt = this.elapsed;
      this.addPbp(t.side, `${p.name} has fouled out.`, 'foul');
    }
    // NBA rules: with nobody left to come in he stays on, and every foul from his sixth on adds a technical
    if (!this.replace(t, p)) this.technical(t);
  },

  /** Technical foul on `t`: one free throw for the other side's best shooter on the floor; the possession carries on. */
  technical(this: GameSim, t: ST, why = 'a disqualified player stays in') {
    const opp = this.T[1 - t.side];
    const sh = opp.on.reduce((a, x) => (x.ftPct > a.ftPct ? x : a), opp.on[0]);
    const made = this.extraFreeThrow(opp, t, sh, '', false);
    this.addPbp(opp.side, `Technical foul on ${t.team.abbrev} (${why}). ${sh.name} ${made ? 'makes' : 'misses'} the free throw.`, 'ft');
  },

  /**
   * One free throw that doesn't end anything (a technical's, a take foul's, a flagrant's): the point
   * is the game's, not this possession's play type or its fast-break or second-chance tallies.
   * `label`: its play-by-play line ('' for none, the caller writes it). A technical's point is nobody's
   * possession's; a take foul's or a flagrant's counts for the trip it came in (`own`).
   */
  extraFreeThrow(this: GameSim, team: ST, other: ST, sh: SP, label: string, own = true): boolean {
    sh.b.fta++;
    team.tot.fta++;
    for (const x of team.on) x.b.tFta++;
    const made = this.rng.chance(sh.ftPct);
    if (made) {
      sh.b.ftm++;
      team.tot.ftm++;
      const keep = { pts: this.possPts, second: this.secondChance, trans: this.inTransition, ctx: this.possCtxForTOPts };
      this.secondChance = this.inTransition = false;
      this.possCtxForTOPts = 'start';
      // (a point scored by the side on defense isn't this possession's)
      this.score(team, other, sh, 1);
      this.possPts = own ? keep.pts + 1 : keep.pts;
      this.secondChance = keep.second;
      this.inTransition = keep.trans;
      this.possCtxForTOPts = keep.ctx;
    }
    if (label && this.record) this.addPbp(team.side, `${sh.name} ${made ? 'makes' : 'misses'} the ${label} free throw.`, 'ft');
    return made;
  },

  /**
   * The chance the officials call a foul on `def` that its play draws at `p` (a shooting foul, a
   * reach-in): a little less while the calls have gone against it by more than its play has drawn,
   * a little more while they've gone its way (crews even out a night's luck: NBA 2025-26, the gap
   * between two teams' fouls in a game has an SD of 5.0, the sim's 7.1 with every whistle independent).
   * Only the luck: a side that draws fouls by its play keeps drawing them. And a hair less on the home
   * side (NBA 2024-26: 0.1-0.4 fewer fouls and 0.25-0.6 more free throws a game at home), and fewer
   * early in a game than late (K.whistleQ). Books the call the side's play drew.
   */
  whistle(this: GameSim, def: ST, p: number): number {
    // (the quarter's whistle, K.whistleQ, and the home side's are what its play draws tonight, not luck
    // to give back: booked before the evening-out, which had taken the home side's edge at the line away)
    p *= K.whistleQ[Math.min(this.q, 4) - 1] * (this.opts.neutral ? 1 : def.side === 0 ? 1 - K.homeWhistle : 1 + K.homeWhistle);
    def.xpf += p;
    const o = this.T[1 - def.side];
    const luck = def.wpf - def.xpf - (o.wpf - o.xpf);
    // (2 / (1 + e^x): what one side loses the other gains, so a night's calls add up as before)
    return (p * 2) / (1 + Math.exp(K.whistleBalance * luck));
  },

  /**
   * The officials' other calls between trips: technical fouls (about one a game: a player barking
   * at a call more often on the side being called for more and the side behind, sometimes the bench),
   * a second one an ejection. One free throw for the other side; play goes on.
   */
  randomTechnical(this: GameSim) {
    // (at the dead ball before a trip, on the side without the ball, so its free throw opens the trip:
    // the chance is doubled and the side drawn as either, the half of them that would land on the side
    // with the ball not given)
    if (this.over || this.atBuzzer() || (this.ctx !== 'made' && this.ctx !== 'ft' && this.ctx !== 'deadTO' && this.ctx !== 'oob') || !this.rng.chance(K.tech)) return;
    const w = this.T.map((t) => {
      const o = this.T[1 - t.side];
      return Math.exp(0.08 * (t.tot.pf - o.tot.pf) + 0.03 * Math.max(0, o.score - t.score));
    });
    const t = this.T[this.rng.weighted(w)];
    if (t.side === this.poss) return;
    if (this.rng.chance(0.22)) {
      this.technical(t, this.fx.pick(['bench', 'coach']));
      return;
    }
    const p = t.on[this.rng.weighted(t.on.map((x) => (1 + x.fouls) * (x.starter ? 1.6 : 1) * (0.6 + x.c.ballSec / 100)))];
    p.techs = (p.techs ?? 0) + 1;
    this.technical(t, p.name);
    // a second technical is an ejection, and now and then the first one is enough (NBA 2024-26: 5-7
    // ejections per 100 games; with second technicals alone, 1.6)
    const tossed = p.techs < 2 && this.rng.chance(K.ejectP);
    if ((p.techs >= 2 || tossed) && p.out === 0) {
      p.out = 1;
      p.outAt = this.elapsed;
      p.ejected = true;
      this.addPbp(t.side, `${p.name} is ejected${tossed ? '' : ' (second technical)'}.`, 'foul');
      this.replace(t, p);
    }
  },

  /** Free throws, booked to the play type that drew the foul (a missed last one included). */
  freeThrows(this: GameSim, off: ST, def: ST, sh: SP, n: number, finish: FinishType) {
    this.possFinish = finish;
    if (this.cur && !this.cur.finish) this.cur.finish = finish;
    let made = 0;
    let lastMade = false;
    const pressure = this.q >= 4 && this.clock < 60 && Math.abs(off.score - def.score) <= 4 ? 0.02 : 0;
    for (const pl of off.on) pl.b.tFta += n;
    for (let i = 0; i < n; i++) {
      const p = clamp(sh.ftPct * (0.99 + 0.01 * sh.energy) - pressure, 0.2, 0.97);
      lastMade = this.rng.chance(p);
      sh.b.fta++;
      off.tot.fta++;
      if (lastMade) {
        made++;
        sh.b.ftm++;
        off.tot.ftm++;
        this.score(off, def, sh, 1);
      }
    }
    if (this.record) {
      this.cur!.steps.push({ k: 'ft', pid: sh.pid, made: lastMade, v: made, n });
      this.addPbp(off.side, `${sh.name} ${made}/${n} from the line.`, 'ft');
    }
    if (lastMade) {
      this.ctx = 'ft';
      this.finishPoss(off, finish);
    } else {
      this.rebound(off, def, 'rim', false, true);
    }
  },
};
