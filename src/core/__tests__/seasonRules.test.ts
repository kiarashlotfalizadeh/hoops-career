// Season-loop rules from an audit: a tie of three or more teams is broken the NBA's multi-team way
// (no step for the record against the other conference's playoff teams), teams on the same record
// pick in reverse order in the second round, a knock short enough to keep an All-Star his place
// heals over the break, and a coach who moves on leaves no minute caps or rests behind.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { curTeamSeason } from '../league/helpers';
import { standings } from '../league/standings';
import { runLottery } from '../league/draft';
import { takeOverTeam } from '../league/owner';
import { simDay } from '../league/season';
import { Rng } from '../random';
import { testLeague } from '../../state/__tests__/fixtures';
import type { League } from '../types';

const fictional = (rngSeed: number, userTid = 19) => createLeague({ name: 'r', userTid, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });

describe('tiebreakers', () => {
  it('three teams on the same record skip the other-conference step: point differential decides', () => {
    const l = fictional(7);
    const east = l.teams.filter((t) => t.conf === 'E');
    const west = l.teams.filter((t) => t.conf === 'W');
    const divs = [...new Set(east.map((t) => t.div))];
    const inDiv = (d: number) => east.filter((t) => t.div === divs[d]).map((t) => t.tid);
    // one non-leader from each East division, all 41-41 with the same conference record
    const [A, B, C] = [inDiv(0)[1], inDiv(1)[1], inDiv(2)[1]];
    const rec = (tid: number, w: number, cw: number) => Object.assign(curTeamSeason(l, tid), { won: w, lost: 82 - w, confWon: cw, confLost: 52 - cw });
    for (const t of l.teams) rec(t.tid, 30, 20);
    for (const d of [0, 1, 2]) rec(inDiv(d)[0], 60, 40);
    for (const t of west) rec(t.tid, 50, 30);
    for (const tid of [A, B, C]) rec(tid, 41, 26);
    Object.assign(curTeamSeason(l, A), { ptsFor: 9000, ptsAgainst: 9100 });
    Object.assign(curTeamSeason(l, B), { ptsFor: 9000, ptsAgainst: 9000 });
    Object.assign(curTeamSeason(l, C), { ptsFor: 9100, ptsAgainst: 9000 });
    // against the West's playoff teams A won one, B lost one (a two-team tie would read this)
    const g = (w: number, lo: number) => ({ type: 'regular', season: l.season, home: { tid: w, pts: 110 }, away: { tid: lo, pts: 100 } });
    l.games = [g(A, west[0].tid), g(west[1].tid, B)] as unknown as League['games'];
    expect(
      standings(l)
        .filter((r) => [A, B, C].includes(r.tid))
        .map((r) => r.tid),
    ).toEqual([C, B, A]);
  });
});

describe('draft order', () => {
  it('teams on the same record pick in reverse order in the second round', () => {
    const l = fictional(5, 7);
    for (const t of l.teams) {
      const w = t.tid === 20 || t.tid === 21 ? 50 : 10 + t.tid * 2;
      Object.assign(curTeamSeason(l, t.tid), { won: w, lost: 82 - w, playoffRound: w >= 46 ? 1 : -1 });
    }
    runLottery(l, new Rng(3));
    const pick = (tid: number, round: number) => l.draftPicks.find((d) => d.season === l.season && d.round === round && d.originalTid === tid)!.pick!;
    const [first, second] = pick(20, 1) < pick(21, 1) ? [20, 21] : [21, 20];
    expect(pick(second, 2)).toBeLessThan(pick(first, 2));
  });
});

describe('the All-Star break', () => {
  it('heals a knock short enough to keep an All-Star his place, for everyone; a longer injury still counts games', () => {
    const l = testLeague('all-star-knock');
    // (the break moved up: 15 games in, enough for All-Star candidates)
    while (l.day < 32) simDay(l);
    l.allStarDay = l.day;
    const pool = Object.values(l.players).filter((p) => p.tid >= 0 && !p.injury);
    const knocked = pool.slice(0, 5);
    for (const p of knocked) p.injury = { type: 'Sprained Ankle', gamesRemaining: 2, gamesTotal: 2, severity: 'minor' };
    const longer = pool[5];
    longer.injury = { type: 'Hamstring Strain', gamesRemaining: 6, gamesTotal: 8, severity: 'moderate' };
    simDay(l);
    for (const p of knocked) expect(p.injury, p.lastName).toBeNull();
    // a longer injury still counts games
    expect(longer.injury?.gamesRemaining).toBe(6);
    const aw = l.awards.find((a) => a.season === l.season)!;
    expect(aw.allStarMvp).toBeDefined();
  }, 180_000);
});

describe('taking over another team', () => {
  it("leaves no minute caps or back-to-back rests on the old team's AI-run rotation", () => {
    const l = testLeague('takeover-caps');
    const old = l.teams[l.userTid];
    const [a, b] = old.rotation.order;
    old.rotation.caps = { [a]: 24, [b]: 24 };
    old.rotation.restB2B = [a, b];
    takeOverTeam(l, (l.userTid + 1) % l.teams.length);
    expect(old.rotation.caps).toEqual({});
    expect(old.rotation.restB2B).toEqual([]);
    simDay(l);
    expect(old.rotation.caps).toEqual({});
  });
});
