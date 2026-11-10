// The offense's own tactical machinery, between the actions: the shape (its spacing, the paint it
// opens or crowds, which drives and cuts it runs more), the defense keying on what the offense runs
// most, what attacking the rim risks, and how hard the five on the floor crash the glass. Written in
// November 2026 (tactics v2): every size is in tk.ts.

import type { ActionType, OffShape, ShotZone } from '../../types';
import { clamp } from '../../random';
import { shapeOf as shapeOfTactics } from '../tactics';
import type { FinishType } from '../log';
import { TK } from './tk';
import { type SP, type ST, ACTION_LIST } from './state';
import type { GameSim } from './game';

export const offenseMethods = {
  /** The shape the team plays (four-out, one-in when none is set). */
  shapeOf(this: GameSim, t: ST): OffShape {
    return shapeOfTactics(t.t.offense);
  },

  /** The lineup's spacing: its five's average (horns crowds it a little). */
  shapeSpacing(this: GameSim, t: ST): number {
    const avg = t.on.reduce((a, p) => a + p.c.spacing, 0) / t.on.length;
    return this.shapeOf(t) === 'horns' ? avg + TK.shape.horns.space : avg;
  },

  /** How much more (or less) this player's drives and cuts are run in the team's shape. */
  shapeW(this: GameSim, t: ST, p: SP): { drive: number; cut: number } {
    switch (this.shapeOf(t)) {
      case 'fiveOut':
        return { drive: TK.shape.fiveOut.driveW, cut: TK.shape.fiveOut.cutW };
      case 'twoIn': {
        const [a, b] = this.bigTwo(t);
        return p === a || p === b ? { drive: 1, cut: 1 } : { drive: TK.shape.twoIn.driveW, cut: 1 };
      }
      default:
        return { drive: 1, cut: 1 };
    }
  },

  /**
   * The openness the shape gives a half-court shot (none in transition or on a putback): five-out's
   * open paint for shots at the rim and in it, as much as the five's shooting keeps the defense out;
   * the double post's crowded paint for everyone but its bigs, who finish better inside.
   */
  shapeOpen(this: GameSim, t: ST, sh: SP, zone: ShotZone, finish: FinishType): number {
    if (finish === 'transition' || finish === 'putback' || (zone !== 'rim' && zone !== 'paint')) return 0;
    const shape = this.shapeOf(t);
    if (shape === 'fiveOut') {
      const k = TK.shape.fiveOut;
      let exposed = 0;
      for (const p of t.on) exposed += Math.max(0, 40 - p.c.spacing) / 40;
      return k.rim * (1 - k.exposed * exposed);
    }
    if (shape === 'twoIn') {
      const k = TK.shape.twoIn;
      const [a, b] = this.bigTwo(t);
      if (sh === a || sh === b) return k.bigs;
      const waste = Math.max(0, a.c.spacing - k.inside) + Math.max(0, b.c.spacing - k.inside);
      return -(k.crowd + k.waste * waste);
    }
    return 0;
  },

  /** The two biggest players on the floor (by height, then rebounding): a double post's bigs, horns' elbows. */
  bigTwo(this: GameSim, t: ST): [SP, SP] {
    const s = [...t.on].sort((a, b) => b.r.hgt - a.r.hgt || b.c.orb - a.c.orb);
    return [s[0], s[1] ?? s[0]];
  },

  /** The team's offensive crashing (0-100) with the five on the floor: the team's setting, and each player's glass duty on top. */
  crashOf(this: GameSim, t: ST): number {
    let duty = 0;
    for (const p of t.on) duty += p.glass;
    return duty ? clamp(t.t.offense.crashBoards + TK.glassDuty.team * duty, 0, 100) : t.t.offense.crashBoards;
  },

  /** The extra turnover chance on a drive from attacking the rim (charges, strips in traffic): above 50 only. */
  driveRisk(this: GameSim, t: ST): number {
    return TK.rim.to * Math.max(0, (t.t.offense.rimAttack - 50) / 50);
  },

  /**
   * The openness an action starts down because the defense has keyed on it: past TK.key.ref of the
   * team's half-court actions tonight (from TK.key.from of them on), TK.key.per for each unit of share
   * over it. Tagged 'keyed' to the defense.
   */
  keyed(this: GameSim, t: ST, a: ActionType): number {
    const k = TK.key;
    if (t.acts.n < k.from) return 0;
    // (a five built to run it, its natural share by what its players do best, can run it that much more)
    let sum = 0;
    for (const x of ACTION_LIST) sum += t.cap[x];
    const ref = Math.max(k.ref[a], k.nat * (t.cap[a] / Math.max(1e-6, sum)));
    const over = t.acts[a] / t.acts.n - ref;
    return over > 0 ? k.per * over : 0;
  },

  /** Count an action the team chose to run (not a forced or a called one): what the defense keys on. */
  countAction(this: GameSim, t: ST, a: ActionType) {
    t.acts[a]++;
    t.acts.n++;
  },
};
