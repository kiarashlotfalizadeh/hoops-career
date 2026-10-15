// The live game's Skip sheet names the period being played (the court runs a possession behind the
// game, and its view a possession behind that at a period's start), and offers what a skip can still do.
import { describe, expect, it } from 'vitest';
import { skipChoices } from '../live/skip';

const ids = (c: ReturnType<typeof skipChoices>) => c.map((x) => x.id);
const label = (c: ReturnType<typeof skipChoices>) => c[0].label;

describe('skip choices', () => {
  it("name the period the court is drawing, not the one the drawn view still reads at a period's start", () => {
    // the first possession of the 4th quarter (the view taken before the step still says Q3)
    const q4 = skipChoices(4, false, { q: 4, clock: 705 });
    expect(label(q4)).toBe('End of Q4');
    expect(ids(q4)).toEqual(['quarter', 'clutch', 'end']);
    // the first possession of the 2nd quarter: its end is halftime, so no separate Halftime
    expect(ids(skipChoices(2, false, { q: 2, clock: 700 }))).toEqual(['quarter', 'clutch', 'end']);
    expect(label(skipChoices(2, false, { q: 2, clock: 700 }))).toBe('End of Q2');
  });

  it('at a break, name the period about to start', () => {
    expect(label(skipChoices(4, true, { q: 3, clock: 0 }))).toBe('End of Q4');
    expect(ids(skipChoices(4, true, { q: 3, clock: 0 }))).toEqual(['quarter', 'clutch', 'end']);
    expect(ids(skipChoices(2, true, { q: 1, clock: 0 }))).toEqual(['quarter', 'clutch', 'end']);
    expect(label(skipChoices(5, true, { q: 4, clock: 0 }))).toBe('End of OT');
  });

  it('offer halftime only in the first quarter, and clutch time only before the game reaches it', () => {
    // the court draws the first quarter's last possession, the game at its buzzer
    expect(ids(skipChoices(1, false, { q: 1, clock: 0 }))).toEqual(['quarter', 'half', 'clutch', 'end']);
    expect(ids(skipChoices(4, false, { q: 4, clock: 280 }))).toEqual(['quarter', 'end']);
    expect(ids(skipChoices(5, false, { q: 5, clock: 290 }))).toEqual(['quarter', 'end']);
  });
});
