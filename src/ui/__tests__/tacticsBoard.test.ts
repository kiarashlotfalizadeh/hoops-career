import { describe, expect, it } from 'vitest';
import { DEF_SPOTS, OFF_SPOTS, famTone, fitPts, place, type BoardPlayer, type Spot } from '../tactics/formation';
import { PHASES, offHabit, phaseFam, phaseId } from '../tactics/fam';
import { linkLine, plateAt, startersOf, strengthsOf } from '../tactics/partners';
import type { Quality, SystemReport } from '../../core/analysis/system';
import { defaultTactics } from '../../core/sim/tactics';
import type { Familiarity } from '../../core/types';

const P = (pid: number, role: string, hgt: number, handle = 50, shoot = 50): BoardPlayer => ({ pid, role: role as BoardPlayer['role'], hgt, handle, shoot });

/** Two spots' plates clear each other: a plate's width (35) across or its height (18) down. */
const clear = (a: Spot, b: Spot) => Math.abs(a.x - b.x) >= 35 || Math.abs(a.y - b.y) >= 18;

describe('the tactics board', () => {
  it('keeps every formation’s five plates apart', () => {
    for (const spots of [...Object.values(OFF_SPOTS), ...Object.values(DEF_SPOTS)]) {
      expect(spots).toHaveLength(5);
      for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(clear(spots[i], spots[j]), `${spots[i].name} / ${spots[j].name}`).toBe(true);
    }
  });

  it('puts the creator on the ball and the bigs in the bigs’ spots', () => {
    const five = [P(1, 'shooter', 40, 40, 80), P(2, 'creator', 35, 85, 60), P(3, 'roller', 80, 20, 10), P(4, 'glue', 50, 45, 65), P(5, 'post', 75, 30, 20)];
    const twoIn = place(OFF_SPOTS.twoIn, five);
    expect(twoIn.size).toBe(5);
    expect(twoIn.get(2)!.kind).toBe('ball');
    expect(twoIn.get(3)!.kind).toBe('big');
    expect(twoIn.get(5)!.kind).toBe('big');
    // four-out: one big inside, the shooters in the corner or on a wing
    const fourOut = place(OFF_SPOTS.fourOut, five);
    expect(fourOut.get(3)!.kind).toBe('big');
    expect(['corner', 'wing']).toContain(fourOut.get(1)!.kind);
    // every player has his own spot
    expect(new Set([...fourOut.values()]).size).toBe(5);
  });

  it('sends the point-of-attack stopper to the ball and the anchor to the paint, in man and in a zone', () => {
    const five = [P(1, 'standard', 45), P(2, 'poa', 30), P(3, 'anchor', 85), P(4, 'stopper', 55), P(5, 'standard', 70)];
    const man = place(DEF_SPOTS.man, five);
    expect(man.get(2)!.kind).toBe('ball');
    expect(man.get(3)!.kind).toBe('anchor');
    const zone = place(DEF_SPOTS.zone23, five);
    expect(zone.get(3)!.kind).toBe('anchor');
    expect(zone.get(2)!.kind).toBe('top');
    // a junk defense's chaser is a stopper
    const box = place(DEF_SPOTS.box1, five);
    expect(['poa', 'stopper']).toContain(five.find((p) => box.get(p.pid)!.kind === 'chase')!.role);
  });

  it('places fewer than five without a fuss', () => {
    expect(place(OFF_SPOTS.fiveOut, [P(1, 'creator', 40)]).size).toBe(1);
    expect(place(OFF_SPOTS.fiveOut, []).size).toBe(0);
  });

  it('says a shape’s fit in points per 100 and a familiarity’s band', () => {
    expect(fitPts(11)).toBe('+1.1');
    expect(fitPts(-9.4)).toBe('−0.9');
    expect(fitPts(0.3)).toBe('±0');
    expect([famTone(92), famTone(80), famTone(60), famTone(20)]).toEqual(['good', 'good', 'warn', 'bad']);
  });
});

describe('familiarity on the Tactics screen', () => {
  const dims = { shape: 90, actions: 60, tempo: 30, roles: 80, scheme: 100, coverage: 40, pressure: 70 };
  it('reads each of the three phases from its parts, and an old link’s phase as its new one', () => {
    expect(phaseFam(dims, 'inPoss')).toBe(60);
    // transition, both ways: tempo and pressure
    expect(phaseFam(dims, 'inTrans')).toBe(50);
    expect(phaseFam(dims, 'outPoss')).toBe(70);
    expect(PHASES.map((p) => p.end)).toEqual(['off', 'both', 'def']);
    expect(phaseId('defTrans')).toBe('inTrans');
    expect(phaseId('outPoss')).toBe('outPoss');
    expect(phaseId(null)).toBe('inPoss');
    expect(phaseId('nonsense')).toBe('inPoss');
  });

  it('says where a setting was drilled and what moving it costs', () => {
    const t = defaultTactics('balanced', 'drop');
    const fam: Familiarity = { opt: {}, habit: { pace: t.offense.pace, help: t.defense.help }, know: {}, roles: {} };
    // where it was drilled: nothing to say
    expect(offHabit(fam, t, 'pace', 'pace')).toBeNull();
    // two levels faster than drilled: the tempo part pays for it
    const fast = { ...t, offense: { ...t.offense, pace: 100 } };
    const off = offHabit(fam, fast, 'pace', 'pace');
    expect(off).not.toBeNull();
    expect(off!.drilled).toBe('Balanced');
    expect(off!.cost).toBeGreaterThan(10);
    // a defensive setting counts against pressure & help, which spreads it over more habits: cheaper per point
    const packed = { ...t, defense: { ...t.defense, help: 100 } };
    const d = offHabit(fam, packed, 'help', 'help')!;
    expect(d.cost).toBeGreaterThan(0);
    expect(d.cost).toBeLessThan(off!.cost);
    // a setting never drilled (no habit kept) costs nothing to show
    expect(offHabit(fam, fast, 'a_pnr', 'action')).toBeNull();
  });
});

describe('partnerships and grades on the Tactics screen', () => {
  it('starts the rotation’s first five and benches the rest, anyone it leaves out last', () => {
    const ps = [1, 2, 3, 4, 5, 6, 7].map((pid) => ({ pid }));
    const { five, bench } = startersOf([7, 6, 5, 4, 3], ps);
    expect(five.map((p) => p.pid)).toEqual([7, 6, 5, 4, 3]);
    expect(bench.map((p) => p.pid)).toEqual([1, 2]);
    expect(startersOf([], ps.slice(0, 3)).bench).toEqual([]);
  });

  it('names the two best and two worst grades, never one as both', () => {
    const q = (id: string, rank: number) => ({ id, rank, of: 30, raw: 0, grade: 'B', parts: [] }) as unknown as Quality;
    const r: SystemReport = { off: [q('creation', 3), q('spacing', 1), q('rim', 20)], def: [q('rimD', 28), q('perimD', 2)] };
    const { strengths, weaknesses } = strengthsOf(r);
    expect(strengths.map((x) => x.id)).toEqual(['spacing', 'perimD']);
    expect(weaknesses.map((x) => x.id)).toEqual(['rimD', 'rim']);
    // three grades: two strengths leave one weakness
    const small: SystemReport = { off: [q('creation', 1), q('spacing', 2)], def: [q('rimD', 3)] };
    expect(strengthsOf(small).weaknesses.map((x) => x.id)).toEqual(['rimD']);
  });

  it('draws a link heavier the more of it plays, a dashed hairline when it plays at little', () => {
    const weak = linkLine(0.1);
    const full = linkLine(1.2);
    expect(weak.dashed).toBe(true);
    expect(full.dashed).toBe(false);
    expect(full.width).toBeGreaterThan(weak.width);
    expect(full.opacity).toBeGreaterThan(weak.opacity);
    expect(full).toEqual(linkLine(1));
  });

  it('keeps a line’s ends where the plates sit, a half plate in from the court’s edges', () => {
    expect(plateAt({ x: 5, y: 2 })).toEqual({ x: 16.5, y: 8.5 });
    expect(plateAt({ x: 50, y: 40 })).toEqual({ x: 50, y: 40 });
  });
});
