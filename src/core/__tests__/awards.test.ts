// Award votes that read like the NBA's: an MVP from a contender, a Most Improved Player who broke
// out rather than got minutes, a Defensive Player of the Year who isn't simply the best team's
// go-to scorer.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { curTeamSeason, standardRoster, statsLine } from '../league/helpers';
import { computeRegularSeasonAwards } from '../league/awards';
import type { League, Player } from '../types';

const U = 19;
const league = () => createLeague({ name: 'a', userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 11 });

/** Every rostered player gets a quiet season (6 a game in 24 minutes); `line` sets one player's. */
function seasonOf(l: League) {
  for (const t of l.teams) [curTeamSeason(l, t.tid).won, curTeamSeason(l, t.tid).lost] = [41, 41];
  const line = (p: Player, o: { gp?: number; gs?: number; mpg?: number; ppg: number; bpg?: number }, season = l.season) => {
    const gp = o.gp ?? 70;
    const s = statsLine(p, season, p.tid, false);
    Object.assign(s, { gp, gs: o.gs ?? gp, min: (o.mpg ?? 24) * gp, pts: o.ppg * gp, fgm: (o.ppg / 2.2) * gp, fga: (o.ppg / 1.1) * gp, blk: (o.bpg ?? 0) * gp });
  };
  for (const p of Object.values(l.players)) if (p.tid >= 0) line(p, { ppg: 6 });
  return line;
}

const veterans = (l: League, tid: number) => standardRoster(l, tid).filter((p) => p.draft.year !== l.season - 1);

describe('season awards', () => {
  it("MVP: a contender's star over a bigger scorer on a .500 team", () => {
    const l = league();
    const line = seasonOf(l);
    const other = l.teams.find((t) => t.tid !== U)!.tid;
    const [mine] = veterans(l, U);
    const [theirs] = veterans(l, other);
    [curTeamSeason(l, U).won, curTeamSeason(l, U).lost] = [62, 20];
    line(mine, { ppg: 28, mpg: 35 });
    line(theirs, { ppg: 33, mpg: 35 });
    expect(computeRegularSeasonAwards(l).mvp).toBe(mine.pid);
  });

  it('Most Improved: a breakout from a real role, not a bench player handed minutes', () => {
    const l = league();
    const line = seasonOf(l);
    const [benchGuy, breakout] = veterans(l, U);
    // 2 points in 3 minutes to 12 in 26
    line(benchGuy, { ppg: 2, mpg: 3, gp: 40 }, l.season - 1);
    line(benchGuy, { ppg: 12, mpg: 26 });
    // 12 in 24 to 20 in 32
    line(breakout, { ppg: 12, mpg: 24 }, l.season - 1);
    line(breakout, { ppg: 20, mpg: 32 });
    expect(computeRegularSeasonAwards(l).mip).toBe(breakout.pid);
  });

  it("Defensive Player of the Year: a 32-point scorer's blocks don't outweigh a defender's", () => {
    const l = league();
    const line = seasonOf(l);
    const [scorer, anchor] = veterans(l, U);
    // the league's best defender by his ratings, twice over
    Object.assign(scorer.ratings, { perD: 95, intD: 95, blk: 95, stl: 90, diq: 95, hgt: 85 });
    anchor.ratings = { ...scorer.ratings };
    line(scorer, { ppg: 32, mpg: 34, bpg: 2.2 });
    line(anchor, { ppg: 12, mpg: 34, bpg: 2.0 });
    expect(computeRegularSeasonAwards(l).dpoy).toBe(anchor.pid);
  });
});
