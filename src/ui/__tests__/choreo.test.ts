// The live court's keyframes: players (1.45 ft circles) shouldn't be drawn on top of each other.
import { describe, expect, it } from 'vitest';
import { buildScript, type Frame } from '../live/choreo';
import type { PossLog, PossStep } from '../../core/sim/log';

const off = [1, 2, 3, 4, 5];
const def = [11, 12, 13, 14, 15];
const info = (pid: number) => ({ pid, hgt: pid % 10 === 5 ? 90 : 50, shoot: 60 - (pid % 10), handle: 60 });

function log(steps: PossStep[], scheme: PossLog['scheme'] = 'man'): PossLog {
  return {
    off: 0,
    q: 1,
    clockStart: 700,
    clockEnd: 690,
    kind: 'half',
    steps,
    pts: 0,
    score: [0, 0],
    label: 'test',
    lines: [],
    on: [off, def],
    guards: Object.fromEntries(off.map((o, i) => [o, def[i]])),
    scheme,
    help: 50,
  };
}

const closest = (f: Frame) => {
  const all = [...f.o, ...f.d];
  let min = Infinity;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) min = Math.min(min, Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y));
  return min;
};

describe('live court choreography', () => {
  it('lines up free throws on separate lane spots', () => {
    const s = buildScript(
      log([
        { k: 'advance', pid: 1 },
        { k: 'foul', pid: 12 },
        { k: 'ft', pid: 3, v: 1 },
        { k: 'ft', pid: 3, v: 1 },
      ]),
      info,
    );
    const last = s.frames[s.frames.length - 1];
    expect(closest(last)).toBeGreaterThanOrEqual(2.9);
  });

  it('closes out on a shot at the rim without standing on the shooter', () => {
    const s = buildScript(
      log([
        { k: 'advance', pid: 1 },
        { k: 'drive', pid: 1 },
        { k: 'shot', pid: 1, x: 0.5, y: 6.5, zone: 'rim', made: true, v: 2 },
      ]),
      info,
    );
    const contest = s.frames[s.frames.length - 2];
    const shooter = contest.o[0];
    const nearest = Math.min(...contest.d.map((p) => Math.hypot(p.x - shooter.x, p.y - shooter.y)));
    expect(nearest).toBeGreaterThanOrEqual(2.9);
  });

  it('draws a 3-2 zone with three defenders up top', () => {
    const s = buildScript(log([{ k: 'advance', pid: 1 }], 'zone32'), info);
    const set = s.frames[s.frames.length - 1].d;
    expect(set.filter((p) => p.y >= 18).length).toBe(3);
  });
});
