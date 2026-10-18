// Fouls and free throws: late-game intentional fouls (fouling when trailing, up three, a foul to give,
// hack-a-player), reach-ins and side outs, the penalty, who is charged with a shooting foul, personal
// fouls and foul-outs (a technical for each one past the sixth when nobody is left), and the line.

import { clamp } from '../../random';
import { GAME } from '../../constants';
import type { FinishType } from '../log';
import { K } from './constants';
import type { SP, ST } from './state';
import type { GameSim } from './game';

export const foulsMethods = {
  intentionalFoul(this: GameSim, off: ST, def: ST): 'ft' | 'sideout' | null {
    const final = this.q >= 4;
    const clock = this.clock;
    const defDiff = def.score - off.score;
    let fouled: SP | null = null;
    let tag = '';
    // "foul now", called from the bench: their worst free-throw shooter on the floor
    if (def.call?.kind === 'foul' && clock > 0.3) {
      if (this.cur) this.cur.call = { kind: 'foul', t: def.side };
      def.call = null;
      fouled = off.on.reduce((a, p) => (p.ftPct < a.ftPct ? p : a), off.on[0]);
      tag = 'late_foul';
    }
    if (!fouled && final && def.t.manage.foulWhenTrailing && defDiff < 0) {
      const down = -defDiff;
      // only while there is time to score twice more after the free throws: down one or two, a foul
      // still buys a last shot; down three or more with seconds left it only pads the margin
      if ((down >= 4 && down <= 9 && clock <= 50 && clock > 6) || (down <= 3 && clock <= 24 && clock > (down === 3 ? 6 : 1.2))) {
        // offense gets the ball to its best free throw shooters
        const ws = off.on.map((p) => Math.pow(p.ftPct, 6) * (0.5 + p.c.ballSec / 100));
        fouled = off.on[this.rng.weighted(ws)];
        tag = 'late_foul';
      }
    }
    if (!fouled && final && def.t.manage.foulUp3 && defDiff === 3 && clock <= 7 && clock >= 1.5) {
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
    const phys = (def.t.defense.physicality - 50) / 50;
    const pr = this.pressure(def);
    // (getting physical with him: more reach-ins on him too)
    const body = this.pd(def, handler) === 'body' ? K.pd.body.foul : 1;
    const p = K.nonShootFoul * (1 + 0.3 * phys + 0.25 * pr) * (0.8 + handler.c.foulDraw / 250) * this.env.fouls * body;
    if (!this.rng.chance(p)) return false;
    const fouler = this.rng.chance(clamp(0.7 * defender.tpf, 0.2, 0.92)) ? defender : def.on[this.rng.weighted(def.on.map((p) => p.tpf))];
    if (this.record) {
      this.addPbp(def.side, `Foul on ${fouler.name}.`, 'foul');
      this.cur!.steps.push({ k: 'foul', pid: fouler.pid, pid2: handler.pid });
    }
    this.addFoul(def, fouler);
    if (this.bonus(def)) {
      // two free throws (~1.55) instead of the rest of the possession (~1.1)
      const mult = 1 + 0.3 * phys + 0.25 * pr;
      if (phys !== 0) this.impact(phys > 0 ? 'physicality' : 'clean_defense', off.side, (0.45 * 0.3 * phys) / mult, handler.pid);
      if (pr !== 0) this.impact('pressure_foul', off.side, (0.45 * 0.25 * pr) / mult, handler.pid);
      if (body !== 1) this.impact('pd_body', off.side, (0.45 * (body - 1)) / body, handler.pid);
      this.freeThrows(off, def, handler, 2, finish);
      return true;
    }
    // side out: offense keeps the ball, and the shot clock restarts at 14 or more (see halfCourt)
    this.sideOut = true;
    return false;
  },

  /** Who is charged with a shooting foul: the help defender takes most contact, the beaten man some. */
  shootingFouler(this: GameSim, def: ST, c: SP | null, sh: SP): SP {
    const md = this.defOf(def, sh);
    if (!c || c === md) return c ?? md;
    return this.rng.weighted([0.6 * c.tpf, 0.4 * md.tpf]) === 0 ? c : md;
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
  technical(this: GameSim, t: ST) {
    const opp = this.T[1 - t.side];
    const sh = opp.on.reduce((a, x) => (x.ftPct > a.ftPct ? x : a), opp.on[0]);
    sh.b.fta++;
    opp.tot.fta++;
    for (const x of opp.on) x.b.tFta++;
    const made = this.rng.chance(sh.ftPct);
    if (made) {
      sh.b.ftm++;
      opp.tot.ftm++;
      // a point for the game, not for this possession's play type or its fast-break / second-chance tallies
      const keep = { pts: this.possPts, second: this.secondChance, trans: this.inTransition, ctx: this.possCtxForTOPts };
      this.secondChance = this.inTransition = false;
      this.possCtxForTOPts = 'start';
      this.score(opp, t, sh, 1);
      this.possPts = keep.pts;
      this.secondChance = keep.second;
      this.inTransition = keep.trans;
      this.possCtxForTOPts = keep.ctx;
    }
    this.addPbp(opp.side, `Technical foul on ${t.team.abbrev} (a disqualified player stays in). ${sh.name} ${made ? 'makes' : 'misses'} the free throw.`, 'ft');
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
