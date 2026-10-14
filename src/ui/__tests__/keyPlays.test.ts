// "Key plays" mode draws crunch time, the ends of periods, runs, timeouts and anything the
// assistant flags, and fast-forwards the rest.
import { describe, expect, it } from 'vitest';
import type { PossLog } from '../../core/sim/log';
import { isKey, type KeyContext } from '../live/keyPlays';

const log = (over: Partial<PossLog> = {}): PossLog => ({
  off: 0,
  q: 2,
  clockStart: 400,
  clockEnd: 385,
  kind: 'half',
  steps: [{ k: 'advance', pid: 1 }],
  pts: 2,
  score: [40, 30],
  label: 'test',
  lines: [],
  on: [
    [1, 2, 3, 4, 5],
    [11, 12, 13, 14, 15],
  ],
  guards: {},
  scheme: 'man',
  help: 50,
  ...over,
});
const calm: KeyContext = { runBefore: [2, 0], runAfter: [4, 0], event: false };

describe('key plays', () => {
  it('skips an ordinary possession', () => {
    expect(isKey(log(), calm)).toBe(false);
  });

  it('draws crunch time of a close game, overtime and the end of every period', () => {
    expect(isKey(log({ q: 4, clockStart: 290, clockEnd: 275, score: [100, 95] }), calm)).toBe(true);
    // a blowout's last minutes aren't
    expect(isKey(log({ q: 4, clockStart: 290, clockEnd: 275, score: [120, 95] }), calm)).toBe(false);
    expect(isKey(log({ q: 5, score: [120, 95] }), calm)).toBe(true);
    expect(isKey(log({ clockStart: 30, clockEnd: 20 }), calm)).toBe(true);
  });

  it('draws a run reaching 8-0, a timeout and anything the assistant brings up', () => {
    expect(isKey(log(), { runBefore: [6, 0], runAfter: [8, 0], event: false })).toBe(true);
    // a run already past 8 going on isn't news every time
    expect(isKey(log(), { runBefore: [9, 0], runAfter: [11, 0], event: false })).toBe(false);
    expect(
      isKey(
        log({
          steps: [
            { k: 'timeout', t: 1 },
            { k: 'advance', pid: 1 },
          ],
        }),
        calm,
      ),
    ).toBe(true);
    expect(isKey(log(), { ...calm, event: true })).toBe(true);
  });
});
