// Big moments (moments.ts): read from the league as it stands, each with a key that stays the same, so
// only the ones that happen while the app is open are shown.
import { describe, expect, it } from 'vitest';
import type { League, PlayoffSeries } from '../../core/types';
import { createLeague, defaultSettings } from '../../core/league/create';
import { teamPlayers } from '../../core/league/helpers';
import { BIG_SIGNING_OVR, currentMoments, newMoments } from '../moments';

const series = (id: string, round: number, high: number, low: number, winner?: number): PlayoffSeries => ({
  id,
  round,
  conf: round === 4 ? 'F' : 'E',
  high,
  low,
  highSeed: 1,
  lowSeed: 8,
  highWins: winner === high ? 4 : 1,
  lowWins: winner === low ? 4 : 1,
  ...(winner !== undefined ? { winner } : {}),
});

function league(): League {
  const l = createLeague({ name: 'm', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 11 });
  l.phase = 'playoffs';
  return l;
}

describe('moments', () => {
  it('a series the user wins is a moment; one he loses or still plays is not', () => {
    const l = league();
    l.playoffs = [series('E1-0', 1, 0, 1, 0), series('E1-1', 1, 2, 3, 3), series('E2-0', 2, 0, 3)];
    const m = currentMoments(l);
    expect(m.map((x) => x.kind)).toEqual(['series']);
    expect(m[0].sub).toMatch(/^4-1 over the /);
  });

  it('winning the Finals is the title, with confetti', () => {
    const l = league();
    l.playoffs = [series('F', 4, 0, 16, 0)];
    const [m] = currentMoments(l);
    expect(m).toMatchObject({ kind: 'title', title: 'Champions', big: true });
  });

  it('keys stay the same, so only what is new since the last read shows', () => {
    const l = league();
    l.playoffs = [series('E1-0', 1, 0, 1, 0)];
    const seen = new Set(currentMoments(l).map((x) => x.key));
    expect(newMoments(currentMoments(l), seen)).toEqual([]);
    l.playoffs.push(series('E2-0', 2, 0, 3, 0));
    expect(newMoments(currentMoments(l), seen).map((x) => x.kind)).toEqual(['series']);
  });

  it('only a good free agent makes his signing a moment', () => {
    const l = league();
    const ranked = [...teamPlayers(l, 0)].sort((a, b) => b.ovr - a.ovr);
    const [star, scrub] = [ranked[0], ranked[ranked.length - 1]];
    star.ovr = Math.max(star.ovr, BIG_SIGNING_OVR);
    scrub.ovr = Math.min(scrub.ovr, BIG_SIGNING_OVR - 10);
    l.transactions = [
      { id: 1, season: l.season, day: 0, phase: 'freeAgency', kind: 'sign', tids: [0], pid: star.pid, name: 'a', amount: 30000, years: 4 },
      { id: 2, season: l.season, day: 0, phase: 'freeAgency', kind: 'sign', tids: [0], pid: scrub.pid, name: 'b', amount: 1200, years: 1 },
    ];
    const m = currentMoments(l).filter((x) => x.kind === 'signing');
    expect(m.map((x) => x.pid)).toEqual([star.pid]);
    expect(m[0].sub).toContain('4 years · $30.0M a year');
  });
});
