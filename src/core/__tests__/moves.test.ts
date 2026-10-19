// The coach's moves in a live game and what each did (analysis/moves.ts): each measured while it was
// in effect against the stretch before it, and called better, worse or early against the noise.
import { describe, expect, it } from 'vitest';
import { coachMoves, moveText, moveVerdict, MOVE_MIN_TRIPS } from '../analysis/moves';
import { defaultTactics, cloneTactics } from '../sim/tactics';
import type { PossLog } from '../sim/log';
import type { CoachMove, LiveOp } from '../types';

/** A possession log: who had it, its points and how it finished. */
const trip = (off: 0 | 1, pts: number, finish: PossLog['finish'] = 'spotup'): PossLog => ({
  off,
  q: 1,
  clockStart: 600,
  clockEnd: 590,
  kind: 'half',
  finish,
  steps: [],
  pts,
  score: [0, 0],
  label: '',
  lines: [],
  on: [[], []],
  guards: {},
  scheme: 'man',
  help: 50,
});

describe('coach moves', () => {
  const names = (pid: number) => `P${pid}`;

  it('measure a change of coverage on their pick-and-roll trips while it was in effect, and name it as Tactics does', () => {
    const before = defaultTactics();
    const after = cloneTactics(before);
    after.defense.pnr = 'hedge';
    // 20 trips each way before: their P&R scores 2 a trip; 20 after: 0.5
    const logs: PossLog[] = [];
    for (let i = 0; i < 20; i++) logs.push(trip(0, 1), trip(1, 2, 'pnrBH'));
    const at = logs.length;
    for (let i = 0; i < 20; i++) logs.push(trip(0, 1), trip(1, i % 2 ? 1 : 0, 'pnrBH'));
    const op: LiveOp = { at: 0, op: 'tactics', args: { tactics: after } };
    const [m] = coachMoves([{ op, log: at, q: 2, clock: 431.6, before }], logs, 0, names);
    expect(m).toMatchObject({ kind: 'tactics', q: 2, clock: 432, end: 'def', text: 'Pick-and-roll coverage: Drop → Hedge' });
    expect(m.before.focus).toEqual({ poss: 20, pts: 40 });
    expect(m.after.focus).toEqual({ poss: 20, pts: 10 });
    expect(moveVerdict(m)).toMatchObject({ what: 'focus', now: 0.5, was: 2, verdict: 'better' });
  });

  it('measure a substitution over the stint it started, and a timeout over the trips either side of it', () => {
    const logs: PossLog[] = [];
    for (let i = 0; i < 30; i++) logs.push(trip(0, i < 15 ? 0 : 2), trip(1, i < 15 ? 2 : 0));
    const moves = coachMoves(
      [
        { op: { at: 0, op: 'sub', args: { out: 1, in: 2 } }, log: 30, q: 1, clock: 300 },
        { op: { at: 0, op: 'timeout', args: {} }, log: 30, q: 1, clock: 300 },
      ],
      logs,
      0,
      names,
    );
    expect(moves.map((m) => m.text)).toEqual(['P2 in for P1', 'Timeout']);
    expect(moves[0].after).toMatchObject({ us: { poss: 15, pts: 30 }, them: { poss: 15, pts: 0 } });
    expect(moveVerdict(moves[0]).verdict).toBe('better');
    // a timeout reads the eight trips each way either side of it
    expect(moves[1].before.us.poss + moves[1].before.them.poss).toBe(16);
    expect(moves[1].after.us.poss + moves[1].after.them.poss).toBe(16);
  });

  it('call a move early until enough trips are in, and the same when the rate barely moved', () => {
    const t = { poss: MOVE_MIN_TRIPS - 1, pts: MOVE_MIN_TRIPS };
    const m: CoachMove = { kind: 'tactics', q: 1, clock: 100, text: 'x', end: 'off', before: { us: { poss: 20, pts: 22 }, them: t }, after: { us: t, them: t } };
    expect(moveVerdict(m).verdict).toBe('early');
    m.after.us = { poss: 30, pts: 34 };
    expect(moveVerdict(m).verdict).toBe('same');
  });

  it('name game-specific orders: a matchup, an instruction, a hunt', () => {
    const a = defaultTactics();
    const b = cloneTactics(a);
    b.defense.matchups = { 7: 3 };
    b.defense.playerD = { 9: 'under' };
    b.offense.huntTarget = 11;
    expect(moveText(a, b, names)).toBe('P3 guards P7 · Go under: P9 · Attack P11');
  });
});
