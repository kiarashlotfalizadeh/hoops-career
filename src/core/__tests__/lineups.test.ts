// The lineup lab's numbers: five-man units and the pairs and trios inside them, on/off splits from
// the season lines, and the Rotation edits that put a unit on the floor.
import { beforeAll, describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { simDay } from '../league/season';
import { rosterSorted } from '../league/helpers';
import { depthOrder, lineupUnits, onOffSplits, seasonLineups, swapSpots, unitToClosers, unitToStarters } from '../analysis/lineups';
import { startingFive } from '../../ui/stats';
import type { League } from '../types';

let l: League;
beforeAll(() => {
  l = testLeague('lineups');
  for (let i = 0; i < 12; i++) simDay(l);
});

describe('lineup units', () => {
  it('every five-man stint counts for each pair (4 per player) and trio (6 per player) on the floor', () => {
    const fives = lineupUnits(l, l.userTid, 5);
    const trios = lineupUnits(l, l.userTid, 3);
    const pairs = lineupUnits(l, l.userTid, 2);
    expect(fives.length).toBeGreaterThan(5);
    const pids = [...new Set(fives.flatMap((u) => u.pids))];
    for (const pid of pids) {
      const sum = (us: typeof fives, f: (u: (typeof fives)[0]) => number) => us.filter((u) => u.pids.includes(pid)).reduce((a, u) => a + f(u), 0);
      const five = sum(fives, (u) => u.min);
      expect(sum(pairs, (u) => u.min)).toBeCloseTo(4 * five, 6);
      expect(sum(trios, (u) => u.min)).toBeCloseTo(6 * five, 6);
      expect(sum(pairs, (u) => u.poss)).toBe(4 * sum(fives, (u) => u.poss));
      expect(sum(trios, (u) => u.ptsFor)).toBe(6 * sum(fives, (u) => u.ptsFor));
    }
    expect(pairs.every((u) => u.pids.length === 2) && trios.every((u) => u.pids.length === 3)).toBe(true);
    // most minutes first
    expect(trios.every((u, i) => i === 0 || trios[i - 1].min >= u.min)).toBe(true);
  });

  it("keeps every one of the user's units, however short: a game's add up to his possessions, points and minutes", () => {
    let games = 0;
    for (const g of l.games) {
      const side = g.home.tid === l.userTid ? 0 : g.away.tid === l.userTid ? 1 : -1;
      if (side < 0) continue;
      games++;
      const box = side === 0 ? g.home : g.away;
      const ls = g.lineups ?? [];
      // (the other side's aren't read, so they aren't kept)
      expect(ls.every((x) => x.t === side)).toBe(true);
      expect(ls.reduce((a, x) => a + x.poss, 0)).toBe(box.poss);
      expect(ls.reduce((a, x) => a + x.ptsFor, 0)).toBe(box.pts);
      expect(Math.abs(ls.reduce((a, x) => a + x.sec, 0) - (2880 + 300 * g.ot))).toBeLessThan(1);
    }
    expect(games).toBeGreaterThan(4);
  });

  it('rates a unit per 100 of its possessions, as a hand count of its stints does', () => {
    const unit = seasonLineups(l)[0];
    let poss = 0;
    let pf = 0;
    let pa = 0;
    for (const g of l.games) {
      const side = g.home.tid === l.userTid ? 0 : g.away.tid === l.userTid ? 1 : -1;
      for (const s of g.lineups ?? [])
        if (side >= 0 && s.t === side && [...s.pids].sort((a, b) => a - b).join('-') === unit.key) {
          poss += s.poss;
          pf += s.ptsFor;
          pa += s.ptsAgainst;
        }
    }
    expect(unit.poss).toBe(poss);
    expect(unit.ortg).toBeCloseTo((100 * pf) / poss, 10);
    expect(unit.drtg).toBeCloseTo((100 * pa) / poss, 10);
    expect(unit.net).toBeCloseTo((100 * (pf - pa)) / poss, 10);
    // another season's games aren't mixed in
    expect(lineupUnits(l, l.userTid, 5, l.season - 1)).toEqual([]);
  });
});

describe('on/off', () => {
  it("on and off the floor add up to the team's season, for any team", () => {
    for (const tid of [l.userTid, (l.userTid + 3) % 30]) {
      const ts = l.teams[tid].seasons.find((s) => s.season === l.season)!;
      const rows = onOffSplits(l, tid);
      expect(rows.length).toBeGreaterThan(8);
      for (const r of rows) {
        expect(r.on.poss + r.off.poss).toBe(ts.poss);
        expect(r.on.ptsFor + r.off.ptsFor).toBe(ts.ptsFor);
        expect(r.diff).toBeCloseTo(r.on.net - r.off.net, 10);
      }
      // five players on the floor for every possession
      expect(rows.reduce((a, r) => a + r.on.poss, 0)).toBe(5 * ts.poss);
      const r = rows[0];
      expect(r.off.net).toBeCloseTo((100 * (ts.ptsFor - r.on.ptsFor - (ts.ptsAgainst - r.on.ptsAgainst))) / (ts.poss - r.on.poss), 10);
    }
    expect(onOffSplits(l, l.userTid, l.season - 1)).toEqual([]);
  });
});

describe('putting a unit on the floor', () => {
  const fresh = () => {
    const lg = testLeague('units');
    const players = rosterSorted(lg, lg.userTid);
    for (const p of players) p.injury = null;
    return { lg, players, r: lg.teams[lg.userTid].rotation };
  };

  it('swaps a unit into the starting five, minutes moving with the spots', () => {
    const { players, r } = fresh();
    const order = depthOrder(r, players);
    const unit = [order[0], order[1], order[5], order[6], order[7]];
    const mins = { ...r.minutes };
    r.manual = false;
    expect(unitToStarters(r, players, unit)).toBe(true);
    const byId = new Map(players.map((p) => [p.pid, p]));
    expect(startingFive(depthOrder(r, players).map((pid) => byId.get(pid)!))).toEqual(new Set(unit));
    // the bench players took the starters' spots and minutes, and the other way round
    expect(r.minutes[order[5]]).toBe(mins[order[2]]);
    expect(r.minutes[order[2]]).toBe(mins[order[5]]);
    expect(r.manual).toBe(true);
    expect(Object.values(r.minutes).reduce((a, b) => a + b, 0)).toBe(Object.values(mins).reduce((a, b) => a + b, 0));
  });

  it('an injured starter is skipped as the engine skips him, and an injured or departed unit player stops it', () => {
    const { lg, players, r } = fresh();
    const order = depthOrder(r, players);
    players.find((p) => p.pid === order[0])!.injury = { type: 'Sprain', gamesRemaining: 3, gamesTotal: 3, severity: 'minor' };
    const unit = [order[1], order[2], order[3], order[4], order[7]];
    expect(unitToStarters(r, players, unit)).toBe(true);
    const byId = new Map(players.map((p) => [p.pid, p]));
    expect(startingFive(depthOrder(r, players).map((pid) => byId.get(pid)!))).toEqual(new Set(unit));
    const before = structuredClone(r);
    expect(unitToStarters(r, players, [order[0], order[1], order[2], order[3], order[4]])).toBe(false);
    const gone = Object.values(lg.players).find((p) => p.tid !== lg.userTid)!.pid;
    expect(unitToStarters(r, players, [gone, order[1], order[2], order[3], order[4]])).toBe(false);
    expect(unitToClosers(r, players, [gone, order[1], order[2], order[3], order[4]])).toBe(false);
    expect(r).toEqual(before);
  });

  it('a unit as the closers, in depth-chart order', () => {
    const { players, r } = fresh();
    const order = depthOrder(r, players);
    expect(unitToClosers(r, players, [order[8], order[0], order[3], order[2], order[1]])).toBe(true);
    expect(r.closers).toEqual([order[0], order[1], order[2], order[3], order[8]]);
  });

  it("the Rotation screen's swap trades spots and minutes", () => {
    const { players, r } = fresh();
    const order = depthOrder(r, players);
    const [a, b] = [order[1], order[9]];
    const [ma, mb] = [r.minutes[a] ?? 0, r.minutes[b] ?? 0];
    swapSpots(r, order, a, b);
    expect(r.order.indexOf(a)).toBe(9);
    expect(r.order.indexOf(b)).toBe(1);
    expect([r.minutes[a], r.minutes[b]]).toEqual([mb, ma]);
  });
});
