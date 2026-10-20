// Substitutions: the lineup the stint plan wants for this minute, overridden for foul trouble, fatigue,
// hard minute caps, hack-a-player and garbage time; the staff's checks at dead balls (manual subs
// stick for four minutes), immediate replacements for a player who fouls out or gets hurt (a team
// never plays four), and in-game injuries.

import { K } from './constants';
import type { SP, ST } from './state';
import type { GameSim } from './game';

export const rotationMethods = {
  planSlot(this: GameSim): number {
    const reg = Math.min(this.elapsed, 2880 - 0.001);
    return Math.min(47, Math.floor(reg / 60));
  },

  foulLimit(this: GameSim, t: ST): number {
    const mode = t.t.manage.foulTrouble;
    const q = Math.min(this.q, 4);
    const base = q + 1; // 2 in Q1, 3 in Q2, 4 in Q3, 5 in Q4
    return mode === 'strict' ? base - (q === 1 ? 0 : 1) : mode === 'loose' ? base + 1 : base;
  },

  /** At his hard minute cap: he sits unless nobody else can play. Subs wait for a dead ball and a
   * live-ball run can last a minute or two, so he comes out up to 40 seconds early rather than late. */
  capped(this: GameSim, p: SP) {
    return p.cap !== undefined && p.b.sec >= p.cap * 60 - 40;
  },

  /**
   * Whether the game is a blowout the deep bench should finish: 22 points up with five minutes
   * left or 16 with 2:30 left (nobody empties the bench for the last half minute). Once the bench
   * is in it stays until the game is back within reach: a lead dipping to 14 with seconds left
   * doesn't bring the starters back.
   */
  wantsGarbage(this: GameSim, t: ST): boolean {
    const margin = Math.abs(this.T[0].score - this.T[1].score);
    if (this.q >= 4 && this.clock >= 30 && ((this.clock < 300 && margin >= 22) || (this.clock < 150 && margin >= 16))) return true;
    return margin <= 6 + this.clock / 30 ? false : t.garbage;
  },

  /** The deep bench is finishing a blowout (if the coach empties his bench in garbage time). */
  inGarbageTime(this: GameSim, t: ST): boolean {
    return t.t.manage.garbageTime && this.q >= 4 && t.garbage;
  },

  desiredLineup(this: GameSim, t: ST): SP[] {
    const avail = (p: SP) => p.out === 0 && !this.capped(p);
    let desired: SP[];
    t.garbage = this.wantsGarbage(t);
    const ordered = t.players.filter(avail);
    if (this.inGarbageTime(t) && ordered.length >= 8) {
      // deep bench finishes blowouts
      desired = ordered.slice(-5);
      if (!desired.some((p) => p.guard)) {
        const g = ordered.slice(5).find((p) => p.guard && !desired.includes(p));
        if (g) desired[0] = g;
      }
      return desired;
    }
    if (this.q <= 4) {
      const slot = t.plan[this.planSlot()] ?? [];
      desired = slot.map((pid) => t.byId.get(pid)!).filter((p) => p && avail(p));
    } else {
      // overtime: closers / best players with energy
      const closers = t.team.rotation.closers.map((pid) => t.byId.get(pid)).filter((p): p is SP => !!p && avail(p));
      desired = closers.length >= 5 ? closers.slice(0, 5) : [...closers];
      for (const p of ordered) {
        if (desired.length >= 5) break;
        if (!desired.includes(p)) desired.push(p);
      }
    }
    // foul trouble: bench players at the limit (except crunch time)
    const crunch = this.q >= 4 && this.clock < 360;
    const limit = this.foulLimit(t);
    const bigsWanted = desired.filter((p) => p.big).length;
    desired = desired.filter((p) => crunch || p.fouls < limit);
    // fatigue: swap exhausted players for rested teammates of the same type from the rotation (a
    // coach doesn't reach past it for a breather: the deep bench plays in blowouts and emergencies)
    const fatigueLine = t.t.manage.fatigueSub;
    const playoffs = this.opts.type === 'playoffs';
    const bench = ordered.filter((p) => !desired.includes(p) && (crunch || p.fouls < limit));
    desired = desired.map((p) => {
      if (p.energy >= fatigueLine || crunch) return p;
      const alt = bench.filter((b) => b.energy > 0.82 && b.big === p.big && b.planMin > 0).sort((a, b) => b.c.helpD + b.c.create - (a.c.helpD + a.c.create))[0];
      if (alt) {
        bench.splice(bench.indexOf(alt), 1);
        return alt;
      }
      return p;
    });
    // hack-a-player: someone hacked twice this period sits for the rest of it (crunch time aside), when
    // a teammate his size can come in
    if (!crunch && t.hacked.size) {
      desired = desired.map((p) => {
        if ((t.hacked.get(p.pid) ?? 0) < 2) return p;
        const alt = bench
          .filter((b) => b.big === p.big && (t.hacked.get(b.pid) ?? 0) < 2 && (!playoffs || b.planMin > 0))
          .sort((a, b) => b.c.helpD + b.c.create - (a.c.helpD + a.c.create))[0];
        if (!alt) return p;
        bench.splice(bench.indexOf(alt), 1);
        return alt;
      });
    }
    // fill to five from the bench: first the rotation's players of the size that sat (a big in foul
    // trouble makes way for a big), then in depth order
    let bigs = desired.filter((p) => p.big).length;
    for (const p of bench) {
      if (desired.length >= 5) break;
      if (desired.includes(p) || p.planMin <= 0 || (p.big ? bigs >= bigsWanted : 5 - desired.length <= bigsWanted - bigs)) continue;
      desired.push(p);
      if (p.big) bigs++;
    }
    for (const p of bench) {
      if (desired.length >= 5) break;
      if (!desired.includes(p)) desired.push(p);
    }
    // last resort: allow players over the foul limit, then players past their minute cap
    for (const p of [...ordered, ...t.players.filter((x) => x.out === 0)]) {
      if (desired.length >= 5) break;
      if (!desired.includes(p)) desired.push(p);
    }
    return desired.slice(0, 5);
  },

  /**
   * What the staff's lineup decision depends on (the minute of the plan, the foul limit, crunch time, a
   * blowout, and each player's availability, fatigue, fouls, minute cap and hack count): checkSubs
   * looks at the lineup again only when it changes. Numbers, not a string: it's built twice a trip.
   */
  subSignature(this: GameSim, t: ST): number[] {
    const fl = t.t.manage.fatigueSub;
    // (a blowout, or one getting back within reach, changes the lineup now, not at the next minute mark)
    const sig = [this.q <= 4 ? this.planSlot() : 100 + this.q, this.foulLimit(t), this.q >= 4 && this.clock < 360 ? 1 : 0, this.wantsGarbage(t) ? 1 : 0];
    for (const p of t.players) {
      const state = p.on ? (p.energy < fl ? 0 : 1) : p.energy > 0.82 ? 2 : 3;
      sig.push(p.out + 4 * state + 16 * p.fouls + (this.capped(p) ? 1024 : 0) + (t.hacked.size && (t.hacked.get(p.pid) ?? 0) >= 2 ? 2048 : 0));
    }
    return sig;
  },

  checkSubs(this: GameSim, t: ST, force = false) {
    // a manual sub sticks for four minutes; when one runs out, the staff looks at the lineup again
    let expired = false;
    for (const [pid, until] of t.subLock) {
      if (until > this.elapsed) continue;
      t.subLock.delete(pid);
      expired = true;
    }
    if (!force) {
      const sig = this.subSignature(t);
      const prev = t.subSig;
      if (!t.subLock.size && !expired && sig.length === prev.length && sig.every((x, i) => x === prev[i])) return;
      t.subSig = sig;
    }
    if (t.manualSubs && !force) {
      // still replace players who can't continue
      const broken = t.on.filter((p) => p.out !== 0);
      if (!broken.length) return;
    }
    let desired = this.desiredLineup(t);
    if (desired.length < 5) return;
    // respect manual sub locks
    const locked = (p: SP) => (t.subLock.get(p.pid) ?? -1) > this.elapsed;
    if (t.manualSubs || t.subLock.size) {
      const keep = t.on.filter((p) => p.out === 0 && (t.manualSubs || locked(p)));
      const lockedOut = new Set(t.players.filter((p) => !p.on && locked(p)).map((p) => p.pid));
      const rest = desired.filter((p) => !keep.includes(p) && !lockedOut.has(p.pid));
      desired = [...keep, ...rest].slice(0, 5);
      if (desired.length < 5) {
        for (const p of t.players) {
          if (desired.length >= 5) break;
          if (p.out === 0 && !desired.includes(p)) desired.push(p);
        }
      }
    }
    const same = desired.length === t.on.length && desired.every((p) => p.on);
    if (same) return;
    this.applySub(t, desired);
  },

  applySub(this: GameSim, t: ST, lineup: SP[]) {
    const outs = t.on.filter((p) => !lineup.includes(p));
    const ins = lineup.filter((p) => !p.on);
    if (!outs.length && !ins.length) return;
    this.setLineup(t, lineup);
    this.refreshMatchups();
    if (this.record && ins.length) {
      const text = ins.map((p, i) => `${p.name} in${outs[i] ? ` for ${outs[i].name}` : ''}`).join(', ');
      this.addPbp(t.side, `${t.team.abbrev} sub: ${text}.`, 'sub');
    }
  },

  /**
   * Immediate replacement for a player who can't continue: same size if possible, never one at his
   * minute cap if anyone else can go. With nobody left, an injured player is replaced by the most
   * recently disqualified one (NBA rules); a team never plays four.
   */
  replace(this: GameSim, t: ST, p: SP): boolean {
    let bench = t.players.filter((x) => !x.on && x.out === 0);
    if (!bench.length && p.out === 2)
      bench = t.players
        .filter((x) => !x.on && x.out === 1)
        .sort((a, b) => (b.outAt ?? 0) - (a.outAt ?? 0))
        .slice(0, 1);
    if (!bench.length) return false;
    // whoever the staff would send in at this point of the game (the stint plan, fatigue, fouls) goes
    // first, so he isn't subbed straight back out at the next dead ball; in garbage time the deep
    // bench fills in for its own: a starter doesn't come back to replace one
    const wanted = this.desiredLineup(t);
    const garbage = this.inGarbageTime(t);
    const score = (x: SP) => (wanted.includes(x) ? 8 : 0) + (this.capped(x) ? 0 : 4) + (garbage && x.starter ? 0 : 2) + (x.big === p.big ? 1 : 0);
    const rep = bench.reduce((a, x) => (score(x) > score(a) ? x : a), bench[0]);
    this.applySub(
      t,
      t.on.map((x) => (x === p ? rep : x)),
    );
    return true;
  },

  injuryCheck(this: GameSim) {
    for (const t of this.T) {
      for (const p of t.on) {
        // one left on the floor hurt (nobody to replace him) can't get hurt again
        if (p.out === 2) continue;
        const fatigue = p.energy < 0.6 ? 1.6 : 1;
        // (risk is exactly 1 for everyone not playing through an injury: the draw is unchanged for them)
        if (this.rng.chance(K.injuryRate * t.injMult * fatigue * p.risk)) {
          p.out = 2;
          this.injuries.push({ pid: p.pid, tid: t.tid, q: this.q });
          this.addPbp(t.side, `${p.name} is injured and leaves the game.`, 'other');
          this.replace(t, p);
          return;
        }
      }
    }
  },
};
