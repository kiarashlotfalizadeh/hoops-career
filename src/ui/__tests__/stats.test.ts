// Display helpers shared by the screens.
import { describe, expect, it } from 'vitest';
import type { League, Player, PlayerStats } from '../../core/types';
import { blankStats } from '../../core/playerGen';
import { f0, f1, finalLabel, fmtClock, gamesMemo, ordinal, ordinalSuffix, p0, p1, playerSeason, seasonLine, signed, startingFive, wholeMinutes } from '../stats';

describe('ordinal', () => {
  it('reads 1st, 2nd, 3rd and the teens as "th" (scouting percentiles printed "52th")', () => {
    const cases: [number, string][] = [
      [1, '1st'],
      [2, '2nd'],
      [3, '3rd'],
      [4, '4th'],
      [11, '11th'],
      [12, '12th'],
      [13, '13th'],
      [21, '21st'],
      [22, '22nd'],
      [23, '23rd'],
      [52, '52nd'],
      [99, '99th'],
      [101, '101st'],
      [111, '111th'],
      [112, '112th'],
    ];
    for (const [n, s] of cases) expect(ordinal(n)).toBe(s);
    expect(ordinalSuffix(53)).toBe('rd');
  });
});

describe('number formats', () => {
  it('never print "-0.0": a value that rounds to zero reads as zero, with no sign', () => {
    // a -1 plus-minus over 30 games, a net rating that rounds to nothing
    expect(signed(-1 / 30)).toBe('0.0');
    expect(signed(-0.04)).toBe('0.0');
    expect(signed(0)).toBe('0.0');
    expect(signed(-0.4, 0)).toBe('0');
    expect(signed(0.06)).toBe('+0.1');
    expect(signed(-0.06)).toBe('-0.1');
    expect(signed(3)).toBe('+3.0');
    expect(f1(-0.04)).toBe('0.0');
    expect(f1(-2.35)).toBe('-2.4');
    expect(f0(-0.4)).toBe('0');
    expect(p1(-0.0002)).toBe('0.0%');
    expect(p0(0.456)).toBe('46%');
    expect(signed(NaN)).toBe('—');
    expect(f1(Infinity)).toBe('—');
  });
});

describe('finalLabel', () => {
  it('marks overtime finals as the game report does', () => {
    expect(finalLabel(0)).toBe('FINAL');
    expect(finalLabel(1)).toBe('F/OT');
    expect(finalLabel(2)).toBe('F/2OT');
  });
});

describe('fmtClock', () => {
  it('shows minutes, then tenths in the last minute, never rounding up to the next second', () => {
    expect(fmtClock(720)).toBe('12:00');
    expect(fmtClock(61.9)).toBe('1:01');
    expect(fmtClock(60)).toBe('1:00');
    expect(fmtClock(59.97)).toBe('59.9');
    expect(fmtClock(24.3)).toBe('24.3');
    expect(fmtClock(0.04)).toBe('0.0');
    expect(fmtClock(-1)).toBe('0.0');
  });
});

describe('gamesMemo', () => {
  it('works a value out again only when a game is played or the date, phase, season or team changes', () => {
    const league = { season: 2027, phase: 'regular', day: 10, faDay: 0, userTid: 3, games: [] as unknown[], name: 'a' } as unknown as League;
    const cache = new WeakMap<League, { key: string; value: number }>();
    let runs = 0;
    const get = () => gamesMemo(cache, league, () => ++runs);
    expect(get()).toBe(1);
    league.name = 'b'; // an edit that changes nothing a scan of the games would find
    expect(get()).toBe(1);
    (league.games as unknown[]).push({});
    expect(get()).toBe(2);
    league.userTid = 4;
    expect(get()).toBe(3);
  });
});

describe('wholeMinutes', () => {
  it('rounds a box score to whole minutes that still add up to the team total', () => {
    // 240.0 at the tenth, as the engine books it; rounding each line alone gives 241
    const box = [36.5, 35.5, 33.5, 31.5, 30.5, 22.4, 18.3, 15.2, 10.6, 6.0].map((min, pid) => ({ pid, min }));
    expect(box.reduce((a, p) => a + Math.round(p.min), 0)).toBe(242);
    const m = wholeMinutes(box);
    expect(box.reduce((a, p) => a + m(p.pid), 0)).toBe(240);
    for (const p of box) expect(Math.abs(m(p.pid) - p.min)).toBeLessThan(1);
  });
});

describe('startingFive', () => {
  it('starts the first five healthy players in depth-chart order (the Roster list marked an injured starter "S")', () => {
    const hurt = { type: 'Sprained ankle', gamesRemaining: 6 };
    const order = [10, 11, 12, 13, 14, 15, 16, 17].map((pid) => ({ pid, injury: pid === 10 || pid === 12 ? hurt : null }));
    expect([...startingFive(order)]).toEqual([11, 13, 14, 15, 16]);
    // short-handed: whoever is healthy
    expect([...startingFive(order.slice(0, 4))]).toEqual([11, 13]);
  });
});

describe('seasonLine', () => {
  // Trae Young's 2025-26 as imported: 10 games for Atlanta, 5 for Washington
  const adv = (per: number, usg: number, ws: number, bpm: number) => ({
    per,
    ts: 0.6,
    usg,
    astPct: 45,
    trbPct: 3,
    stlPct: 1.5,
    blkPct: 0.5,
    tovPct: 15,
    ws,
    ws48: 0,
    obpm: 0,
    dbpm: 0,
    bpm,
    vorp: 0.2,
  });
  const row = (tid: number, gp: number, min: number, a: PlayerStats['adv']): PlayerStats => ({
    ...blankStats(2026, tid, false),
    real: true,
    gp,
    min,
    fga: gp * 13,
    pts: gp * 18,
    adv: a,
  });
  const p = { stats: [row(0, 10, 280, adv(19.8, 28.8, 1, 1.8)), row(29, 5, 140, adv(24.5, 26.3, 0.4, 5.6))] } as unknown as Player;

  it("combines a traded player's imported advanced numbers: rates by minutes, win shares added up", () => {
    const t = seasonLine(p, 2026)!;
    expect(t.gp).toBe(15);
    expect(t.adv!.ws).toBeCloseTo(1.4);
    expect(t.adv!.per).toBeCloseTo((19.8 * 280 + 24.5 * 140) / 420);
    expect(t.adv!.bpm).toBeCloseTo((1.8 * 280 + 5.6 * 140) / 420);
    expect(t.adv!.ws48).toBeCloseTo((1.4 * 48) / 420);
    // the merged line kept no usage at all: imported rows carry no on-court team totals to work it out from
    expect(playerSeason(p, 2026)!.usg).toBeCloseTo((28.8 * 280 + 26.3 * 140) / 420 / 100);
  });
  it("keeps the season's EPM once: every team's row carries the whole season's", () => {
    const epm = { oepm: 4.1, depm: -0.6, epm: 3.5 };
    const q = { stats: p.stats.map((r) => ({ ...r, adv: { ...r.adv!, ...epm } })) } as unknown as Player;
    expect(seasonLine(q, 2026)!.adv).toMatchObject(epm);
    // a seed built without EPM has none to show
    expect(seasonLine(p, 2026)!.adv!.epm).toBeUndefined();
  });
  it('leaves a one-team season as it is', () => {
    expect(seasonLine({ stats: [p.stats[0]] } as unknown as Player, 2026)).toBe(p.stats[0]);
    expect(seasonLine(p, 2025)).toBeNull();
  });
});
