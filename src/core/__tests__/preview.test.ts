// The matchup preview: the projected starters are the ones the real game starts, the injury and
// rest report matches the rosters, the season series matches the stored results, and building it
// leaves the league (its random stream included) exactly as it was.
import { afterEach, describe, expect, it } from 'vitest';
import { testLeague, toGameDay } from '../../state/__tests__/fixtures';
import { clearLive, prepareLive } from '../../state/live';
import { HOME_EDGE, matchupPreview, projectMargin, winChance } from '../analysis/preview';
import { ensureRotation, userGameOnDay } from '../league/games';
import { simDay } from '../league/season';
import { teamPlayers } from '../league/helpers';
import { setPlanMatchup } from '../league/gamePlans';
import { createLeague, defaultSettings } from '../league/create';
import { runLab } from '../ai/lab';
import type { League, ScheduledGame } from '../types';

afterEach(() => clearLive());

function nextGame(l: League) {
  const g = userGameOnDay(l, l.day)!;
  ensureRotation(l, g.home);
  ensureRotation(l, g.away);
  return g;
}

describe('matchup preview', () => {
  it('projects the starters the live game starts, and leaves the league untouched', () => {
    const l = testLeague('starters');
    toGameDay(l);
    const g = nextGame(l);
    const before = { rng: l.rng, games: l.games.length, schedule: JSON.stringify(l.schedule), players: JSON.stringify(l.players) };
    const pv = matchupPreview(l, g.gid)!;
    expect({ rng: l.rng, games: l.games.length, schedule: JSON.stringify(l.schedule), players: JSON.stringify(l.players) }).toEqual(before);
    expect(pv.userGame).toBe(true);
    expect(pv.us.tid).toBe(l.userTid);
    const live = prepareLive(l)!;
    expect(live.game.gid).toBe(g.gid);
    const startersOf = (s: 0 | 1) =>
      live.sim.T[s].players
        .filter((p) => p.starter)
        .map((p) => p.pid)
        .sort();
    const usSide = pv.usHome ? 0 : 1;
    expect(pv.us.starters.map((p) => p.pid).sort()).toEqual(startersOf(usSide));
    expect(pv.them.starters.map((p) => p.pid).sort()).toEqual(startersOf((1 - usSide) as 0 | 1));
    // a threat who starts has one of our starters on him at the tip
    for (const th of pv.threats.filter((x) => x.starts)) expect(pv.us.starters.map((p) => p.pid)).toContain(th.guard?.pid);
  });

  it('lists the injured as out, the rested on a back-to-back as resting, and keeps both out of the five', () => {
    const l = testLeague('out');
    toGameDay(l);
    const g = nextGame(l);
    const opp = g.home === l.userTid ? g.away : g.home;
    const hurt = teamPlayers(l, opp).sort((a, b) => b.ovr - a.ovr)[0];
    hurt.injury = { type: 'Sprained Ankle', gamesRemaining: 4, gamesTotal: 6, severity: 'moderate' };
    ensureRotation(l, opp);
    // a back-to-back: the user's team played yesterday, and its best player rests on the second night
    const star = teamPlayers(l, l.userTid).sort((a, b) => b.ovr - a.ovr)[0];
    l.teams[l.userTid].rotation.restB2B = [star.pid];
    l.schedule.push({ gid: l.nextGid++, day: g.day - 1, home: l.userTid, away: opp, type: 'regular', played: true });
    const pv = matchupPreview(l, g.gid)!;
    const injured = teamPlayers(l, opp)
      .filter((p) => p.injury)
      .map((p) => p.pid)
      .sort();
    expect(pv.them.out.map((p) => p.pid).sort()).toEqual(injured);
    expect(pv.them.out.find((p) => p.pid === hurt.pid)).toMatchObject({ injury: 'Sprained Ankle', games: 4 });
    expect(pv.them.starters.map((p) => p.pid)).not.toContain(hurt.pid);
    expect(pv.us.b2b).toBe(true);
    expect(pv.us.resting.map((p) => p.pid)).toEqual([star.pid]);
    expect(pv.us.starters.map((p) => p.pid)).not.toContain(star.pid);
    // whoever starts in his place says so
    if (pv.us.starters.some((p) => p.for)) expect(pv.us.starters.map((p) => p.for?.pid)).toContain(star.pid);
  });

  it('counts the season series from the stored results, and follows planned matchups at the tip', () => {
    const l = testLeague('series');
    // play on until the next game is against a team already met
    let g = userGameOnDay(l, l.day);
    const met = (opp: number) => l.games.some((r) => r.type === 'regular' && [r.home.tid, r.away.tid].includes(opp) && [r.home.tid, r.away.tid].includes(l.userTid));
    for (let i = 0; i < 200 && !(g && met(g.home === l.userTid ? g.away : g.home)); i++) {
      simDay(l);
      g = userGameOnDay(l, l.day);
    }
    g = nextGame(l);
    const opp = g.home === l.userTid ? g.away : g.home;
    const pv = matchupPreview(l, g.gid)!;
    const meetings = l.games.filter((r) => r.season === l.season && r.type === 'regular' && [r.home.tid, r.away.tid].includes(opp) && [r.home.tid, r.away.tid].includes(l.userTid));
    const won = meetings.filter((r) => (r.home.tid === l.userTid ? r.home.pts > r.away.pts : r.away.pts > r.home.pts)).length;
    expect(meetings.length).toBeGreaterThan(0);
    expect(pv.series.games.map((m) => m.gid)).toEqual(meetings.map((r) => r.gid));
    expect([pv.series.won, pv.series.lost]).toEqual([won, meetings.length - won]);
    expect(pv.series.meeting).toBe(meetings.length + 1);
    // planned matchups: their first threat gets our pick, as the real game would assign him
    const th = pv.threats.find((x) => x.starts);
    if (th) {
      const mine = pv.us.starters.find((p) => p.pid !== th.guard?.pid)!;
      setPlanMatchup(l, opp, th.pid, mine.pid);
      const after = matchupPreview(l, g.gid)!.threats.find((x) => x.pid === th.pid)!;
      expect(after.planned?.pid).toBe(mine.pid);
      expect(after.guard?.pid).toBe(mine.pid);
    }
  });

  it('projects a margin that grows with the net-rating gap, and home court counts for whoever is at home', () => {
    let last = -Infinity;
    for (let d = -10; d <= 10; d += 2) {
      const m = projectMargin(d, 0, 100, 0);
      expect(m).toBeGreaterThan(last);
      last = m;
    }
    expect(winChance(0)).toBeCloseTo(0.5, 6);
    expect(winChance(5) + winChance(-5)).toBeCloseTo(1, 6);
    expect(winChance(5)).toBeGreaterThan(winChance(2));
    // the same game with the floors swapped: the edge moves with home court and nothing else does
    const l = testLeague('swap');
    toGameDay(l);
    const g = nextGame(l);
    const a = matchupPreview(l, g.gid)!;
    [g.home, g.away] = [g.away, g.home];
    const b = matchupPreview(l, g.gid)!;
    expect(a.usHome).not.toBe(b.usHome);
    const [home, away] = a.usHome ? [a, b] : [b, a];
    expect(home.projection.edge).toBe(HOME_EDGE);
    expect(away.projection.edge).toBe(-HOME_EDGE);
    expect(home.projection.margin - away.projection.margin).toBeCloseTo(2 * HOME_EDGE, 6);
    expect(home.projection.win).toBeGreaterThan(away.projection.win);
  });

  it('playoff games carry the series: game number, elimination and clinch, and the tag Home shows', () => {
    const l = testLeague('playoffs');
    const opp = (l.userTid + 1) % 30;
    l.playoffs = [{ id: 'E1-0', round: 1, conf: 'E', high: opp, low: l.userTid, highSeed: 1, lowSeed: 8, highWins: 3, lowWins: 1 }];
    const g: ScheduledGame = { gid: l.nextGid++, day: l.day, home: opp, away: l.userTid, type: 'playoffs', seriesId: 'E1-0' };
    l.schedule.push(g);
    ensureRotation(l, opp);
    ensureRotation(l, l.userTid);
    expect(matchupPreview(l, g.gid)!.playoff).toMatchObject({ tag: 'R1 · Game 5', game: 5, wins: 1, losses: 3, elimination: true, clinch: false, homeCourt: false });
    l.playoffs[0].lowWins = 3;
    const pv = matchupPreview(l, g.gid)!;
    expect(pv.playoff).toMatchObject({ tag: 'R1 · Game 7', elimination: true, clinch: true });
    expect(pv.us.tid).toBe(l.userTid);
    expect(pv.usHome).toBe(false);
    expect(pv.projection.edge).toBe(-HOME_EDGE);
  });

  it('the Lab plays every game at A’s floor with venue a, and takes turns by default as before', () => {
    const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
    const side = (tid: number) => ({ team: league.teams[tid], players: teamPlayers(league, tid) });
    const run = (venue?: 'a' | 'b' | 'neutral') => runLab({ a: side(0), b: side(1), games: 6, seed: 42, venue }).margins;
    const turns = run();
    const atA = run('a');
    const atB = run('b');
    // each game has its own seed: A hosts the even games by default, so those match venue a and the odd ones venue b
    expect(atA.filter((_, i) => i % 2 === 0)).toEqual(turns.filter((_, i) => i % 2 === 0));
    expect(atB.filter((_, i) => i % 2 === 1)).toEqual(turns.filter((_, i) => i % 2 === 1));
    expect(atA.filter((_, i) => i % 2 === 1)).not.toEqual(turns.filter((_, i) => i % 2 === 1));
    expect(run('neutral')).toHaveLength(6);
  });
});
