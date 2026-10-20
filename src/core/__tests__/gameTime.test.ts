// A moment of a game in text (core/format.ts gameTime): the period and the clock, a sub-minute clock
// with its minutes so "Q4 0:35.0" never reads as thirty-five minutes.
import { describe, expect, it } from 'vitest';
import { gameTime } from '../format';

describe('gameTime', () => {
  it('writes the period and the clock, minutes always there', () => {
    expect(gameTime(1, 720)).toBe('Q1 12:00');
    expect(gameTime(4, 303.6)).toBe('Q4 5:03');
    expect(gameTime(4, 35)).toBe('Q4 0:35.0');
    expect(gameTime(4, 1)).toBe('Q4 0:01.0');
    expect(gameTime(4, 0.04)).toBe('Q4 0:00.0');
    expect(gameTime(2, 24.3)).toBe('Q2 0:24.3');
    expect(gameTime(5, 126)).toBe('OT 2:06');
    expect(gameTime(6, 0.4)).toBe('2OT 0:00.4');
  });
});
