// Morale as the screens show it (moraleView.ts): the row marker, the pulls behind a mood, the
// effect on play read from the engine's own multipliers, and a minutes target short of what a
// player expects by the weekly rule.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { standardRoster } from '../league/helpers';
import { lockerRoomPerf, moodPerf } from '../league/morale';
import { effectFigure, effectLine, moodMarker, moodReasons, moraleEffect, roomLine, shortOfMinutes } from '../league/moraleView';

function setup() {
  const l = createLeague({ name: 'mv', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
  const roster = standardRoster(l, 0).sort((a, b) => b.ovr - a.ovr);
  for (const p of roster) p.mood = { ...p.mood, score: 0, tradeRequest: false, ptComponent: 0, winComponent: 0, roleComponent: 0, contractComponent: 0 };
  return { l, roster };
}

describe('moraleView', () => {
  it('marks only the moods that matter', () => {
    const { roster } = setup();
    const p = roster[0];
    expect(moodMarker(p)).toBeNull();
    p.mood.score = -3;
    expect(moodMarker(p)).toEqual({ label: 'Unhappy', tone: 'warn' });
    p.mood.score = -7;
    expect(moodMarker(p)?.label).toBe('Furious');
    p.mood.tradeRequest = true;
    expect(moodMarker(p)).toEqual({ label: 'Wants a trade', tone: 'bad' });
  });

  it('lists the pulls on his mood, biggest first, small ones left out', () => {
    const { roster } = setup();
    const p = roster[0];
    p.mood.expectedMin = 33;
    p.mood.ptComponent = -2.4;
    p.mood.winComponent = 1;
    p.mood.contractComponent = 0.1;
    const r = moodReasons(p);
    expect(r.map((x) => x.key)).toEqual(['minutes', 'winning']);
    expect(r[0].text).toBe('Wants more minutes: expects about 33');
    expect(r[1].v).toBe(1);
  });

  it('reads the effect on play from the engine multipliers', () => {
    const { l, roster } = setup();
    const [p, other] = roster;
    expect(effectLine(moraleEffect(l, p))).toBe('Playing at his usual level');
    expect(effectFigure(moraleEffect(l, p))).toBe('0%');
    p.mood.score = -7.5;
    other.mood.tradeRequest = true;
    const e = moraleEffect(l, p);
    expect(e.total).toBeCloseTo(moodPerf(p) * lockerRoomPerf(standardRoster(l, 0), p) - 1, 10);
    // −3% from his mood, −0.6% from a teammate who asked out
    expect(effectLine(e)).toBe('Playing about 4% below his best');
    expect(effectFigure(e)).toBe('−4%');
    expect(roomLine(e)).toBe('0.6% of it from teammates who want out');
    p.mood.score = 6;
    other.mood.tradeRequest = false;
    expect(effectLine(moraleEffect(l, p))).toBe('Playing about 2% above his usual level');
  });

  it('flags a minutes target short of his expectation as the weekly rule does', () => {
    const { roster } = setup();
    const p = roster[0];
    p.ovr = 80;
    p.mood.expectedMin = 32;
    expect(shortOfMinutes(p, 30)).toBe(false);
    expect(shortOfMinutes(p, 26)).toBe(true);
    // a fringe player minds it less
    p.ovr = 60;
    expect(shortOfMinutes(p, 26)).toBe(false);
    expect(shortOfMinutes(p, 15)).toBe(true);
  });
});
