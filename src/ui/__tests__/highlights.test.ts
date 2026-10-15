// The night's highlights: the plays a broadcast would cut to, the late and decisive ones first.
import { describe, expect, it } from 'vitest';
import type { PossLog, PossStep } from '../../core/sim/log';
import { pickHighlights, playValue } from '../live/highlights';
import { createLeague, defaultSettings } from '../../core/league/create';
import { teamPlayers } from '../../core/league/helpers';
import { GameSim } from '../../core/sim/engine';
import { Rng } from '../../core/random';

function poss(steps: PossStep[], o: Partial<PossLog> = {}): PossLog {
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
    on: [
      [1, 2, 3, 4, 5],
      [11, 12, 13, 14, 15],
    ],
    guards: {},
    scheme: 'man',
    help: 50,
    ...o,
  };
}

describe('highlights', () => {
  it('value a dunk over a layup, an and-one over both, and a block for the defense', () => {
    const dunk = playValue(poss([{ k: 'shot', pid: 1, made: true, v: 2, zone: 'rim', d: 'dunk' }], { pts: 2 }), [0, 0]);
    const layup = playValue(poss([{ k: 'shot', pid: 1, made: true, v: 2, zone: 'rim', d: 'layup' }], { pts: 2 }), [0, 0]);
    const andOne = playValue(
      poss(
        [
          { k: 'shot', pid: 1, made: true, v: 2, zone: 'rim', d: 'layup' },
          { k: 'foul', pid: 12 },
          { k: 'ft', pid: 1, v: 1, n: 1 },
        ],
        { pts: 3 },
      ),
      [0, 0],
    );
    expect(dunk.score).toBeGreaterThan(layup.score);
    expect(andOne.score).toBeGreaterThan(layup.score);
    const block = playValue(
      poss([
        { k: 'shot', pid: 1, made: false, v: 2, zone: 'rim' },
        { k: 'block', pid: 13, pid2: 1 },
      ]),
      [0, 0],
    );
    expect(block).toEqual({ score: 2, side: 1 });
    expect(playValue(poss([{ k: 'shot', pid: 1, made: false, v: 3, zone: 'ab3' }]), [0, 0]).score).toBe(0);
  });

  it('count late plays in a close game double, and the shot that wins it at the buzzer most of all', () => {
    const three = (o: Partial<PossLog>, before: [number, number]) => playValue(poss([{ k: 'shot', pid: 1, made: true, v: 3, zone: 'ab3' }], { pts: 3, ...o }), before).score;
    const early = three({}, [10, 10]);
    expect(three({ q: 4, clockStart: 100, clockEnd: 90 }, [90, 92])).toBeGreaterThan(early * 2);
    expect(three({ q: 4, clockStart: 3, clockEnd: 0 }, [99, 100])).toBeGreaterThan(three({ q: 2, clockStart: 3, clockEnd: 0 }, [50, 40]));
  });

  it('pick at most eight plays from a real game, three a period at most, in the order they happened', () => {
    const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
    const sim = new GameSim(
      { team: league.teams[0], players: teamPlayers(league, 0) },
      { team: league.teams[1], players: teamPlayers(league, 1) },
      { rng: new Rng(9), type: 'regular', record: true, injuries: false },
    );
    const logs: PossLog[] = [];
    while (!sim.over) {
      sim.step();
      logs.push(...sim.drainLogs());
    }
    const reel = pickHighlights(logs, 0);
    expect(reel.length).toBe(8);
    expect(reel.map((h) => h.i)).toEqual([...reel.map((h) => h.i)].sort((a, b) => a - b));
    const perQ = new Map<number, number>();
    for (const h of reel) perQ.set(logs[h.i].q, (perQ.get(logs[h.i].q) ?? 0) + 1);
    expect(Math.max(...perQ.values())).toBeLessThanOrEqual(3);
    // both teams' plays can make it
    expect(pickHighlights(logs, 1).length).toBe(8);
    expect(pickHighlights([], 0)).toEqual([]);
  });
});
