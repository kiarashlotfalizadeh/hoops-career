// Retired numbers: a retiring legend's number goes up with each franchise he gave five seasons and
// a career it remembers (the number he wore there, from his numbers by team), a journeyman's and a
// plain five-season player's don't; the news and the GM's mail; nobody who joins a team wears one
// of its retired numbers while a player who wore it there when it went up keeps it, every player
// on a team still wearing his own; and a damaged entry in a save is dropped.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { loadLeague, migrate, saveLeague } from '../../state/persistence';
import { JERSEYS, LEADER_POINTS, awardTeam, legendReason, mainTeam, numberTeam, retireNumbers, retiredNumbers } from '../league/jerseys';
import { ensureRotation } from '../league/games';
import { freeAgents, playerName, teamPlayers } from '../league/helpers';
import { releasePlayer, signPlayer } from '../league/contracts';
import { blankStats } from '../playerGen';
import { CAP } from '../constants';
import type { League, Player, PlayerStats } from '../types';
import { RETIRED } from '../types';

const base = testLeague('jerseys');
const fresh = () => structuredClone(base);
/** Two AI teams and the user's. */
const A = (base.userTid + 1) % 30;
const B = (base.userTid + 2) % 30;

const line = (season: number, tid: number, o: Partial<PlayerStats> = {}): PlayerStats => ({ ...blankStats(season, tid, false), gp: 70, min: 2100, pts: 1400, ...o });

/**
 * Give a player a career of `spells` (team, seasons) ending this season, his numbers by team, and
 * retire him as retirements() does. Returns him.
 */
function career(l: League, spells: [number, number][], opts: { jerseys?: Record<number, string>; jersey?: string; pts?: number; tid?: number } = {}): Player {
  const p = teamPlayers(l, opts.tid ?? spells[spells.length - 1][0])[0];
  const total = spells.reduce((a, [, n]) => a + n, 0);
  let season = l.season - total + 1;
  p.stats = spells.flatMap(([tid, n]) => Array.from({ length: n }, () => line(season++, tid, opts.pts !== undefined ? { pts: opts.pts } : {})));
  p.awards = [];
  p.hof = false;
  p.jerseys = opts.jerseys;
  if (opts.jersey) p.jersey = opts.jersey;
  p.tid = RETIRED;
  p.retiredSeason = l.season;
  return p;
}

describe('who is a legend', () => {
  it("a franchise retires the number its MVP wore there, not the one he wore last, and his later team doesn't", () => {
    const l = fresh();
    const p = career(l, [
      [A, 6],
      [B, 2],
    ]);
    p.jerseys = { [A]: '8', [B]: '24' };
    p.jersey = '24';
    p.awards.push({ season: l.season - 4, type: 'MVP' });
    expect(awardTeam(p, p.awards[0])).toBe(A);
    expect(legendReason(l, p, A)).toBe('MVP');
    expect(legendReason(l, p, B)).toBeNull();
    const news = l.news.length;
    expect(retireNumbers(l, p)).toEqual([A]);
    expect(l.teams[A].retired).toEqual([{ jersey: '8', pid: p.pid, name: playerName(p), season: l.season }]);
    expect(l.teams[B].retired).toBeUndefined();
    expect(l.news.slice(news).map((n) => n.text)).toEqual([`The ${l.teams[A].name} will retire ${playerName(p)}'s No. 8.`]);
    expect(l.news[l.news.length - 1]).toMatchObject({ kind: 'retire', tids: [A], pids: [p.pid] });
    // his numbers by team were kept for this; a second call changes nothing
    expect(p.jerseys).toBeUndefined();
    expect(retireNumbers(l, p)).toEqual([]);
    expect(l.teams[A].retired).toHaveLength(1);
  });

  it("a journeyman's number isn't retired anywhere, whatever he won", () => {
    const l = fresh();
    const p = career(l, [
      [A, 3],
      [B, 4],
      [A, 1],
    ]);
    p.jerseys = { [A]: '3', [B]: '4' };
    p.hof = true;
    p.awards.push({ season: l.season - 3, type: 'MVP' });
    expect(retireNumbers(l, p)).toEqual([]);
    // four seasons with A, and one more makes five: his seasons there needn't run together
    const q = career(l, [
      [A, 3],
      [B, 1],
      [A, 2],
    ]);
    q.jerseys = { [A]: '3' };
    q.hof = true;
    expect(retireNumbers(l, q)).toEqual([A]);
  });

  it("five seasons without honours aren't enough, nor is leading a franchise in scoring short of 15,000 points", () => {
    const l = fresh();
    const p = career(l, [[A, 5]], { jerseys: { [A]: '11' } });
    expect(legendReason(l, p, A)).toBeNull();
    // a title alone isn't, nor with one All-NBA selection; two make it
    p.awards.push({ season: l.season, type: 'Champion' });
    expect(legendReason(l, p, A)).toBeNull();
    p.awards.push({ season: l.season - 1, type: 'All-NBA 2nd Team' });
    expect(legendReason(l, p, A)).toBeNull();
    p.awards.push({ season: l.season - 2, type: 'All-NBA 3rd Team' });
    expect(legendReason(l, p, A)).toBe('title and All-NBA');
    // two All-NBA selections and four All-Star nods aren't, a fifth All-Star nod is
    for (let i = 0; i < 4; i++) p.awards.push({ season: l.season - i, type: 'All-Star' });
    p.awards = p.awards.filter((a) => a.type !== 'Champion');
    expect(legendReason(l, p, A)).toBeNull();
    p.awards.push({ season: l.season - 4, type: 'All-Star' });
    expect(legendReason(l, p, A)).toBe('All-Star');
    expect(retireNumbers(l, p)).toEqual([A]);
  });

  it('the Hall of Fame (with his main team), a Finals MVP, three All-NBA selections or the franchise scoring record are each enough', () => {
    const l = fresh();
    const hof = career(l, [[A, 5]], { jerseys: { [A]: '1' } });
    hof.hof = true;
    expect(legendReason(l, hof, A)).toBe('Hall of Fame');
    const fmvp = career(l, [[A, 5]], { jerseys: { [A]: '2' }, tid: A });
    fmvp.awards.push({ season: l.season, type: 'Finals MVP' });
    expect(legendReason(l, fmvp, A)).toBe('Finals MVP');
    const nba = career(l, [[B, 5]], { jerseys: { [B]: '3' } });
    for (let i = 0; i < 3; i++) nba.awards.push({ season: l.season - i, type: `All-NBA ${['1st', '2nd', '3rd'][i]} Team` });
    expect(legendReason(l, nba, B)).toBe('All-NBA');
    // the most points for the franchise in this league's seasons, 15,000 at least
    const scorer = career(l, [[B, 5]], { jerseys: { [B]: '4' }, pts: Math.ceil(LEADER_POINTS / 5), tid: B });
    expect(legendReason(l, scorer, B)).toBe('scoring leader');
    // (real seasons from before the league aren't this league's)
    for (const s of scorer.stats.slice(0, 2)) s.real = true;
    expect(legendReason(l, scorer, B)).toBeNull();
    for (const s of scorer.stats) delete s.real;
    // and nobody else has more
    const other = teamPlayers(l, B)[0];
    other.stats.push(line(l.season, B, { pts: LEADER_POINTS + 1 }));
    expect(legendReason(l, scorer, B)).toBeNull();
  });

  it("a Hall of Famer's number goes up with the team he played the most seasons for (the most games, tied), not every team he gave five", () => {
    const l = fresh();
    const p = career(
      l,
      [
        [A, 5],
        [B, 6],
      ],
      { jerseys: { [A]: '6', [B]: '16' } },
    );
    p.hof = true;
    expect(mainTeam(p)).toBe(B);
    expect(legendReason(l, p, A)).toBeNull();
    expect(retireNumbers(l, p)).toEqual([B]);
    expect(l.teams[B].retired![0].jersey).toBe('16');
    const q = career(
      l,
      [
        [A, 5],
        [B, 5],
      ],
      { jerseys: { [A]: '6', [B]: '16' } },
    );
    q.stats[0].gp = 82;
    expect(mainTeam(q)).toBe(A);
  });

  it("an award counts for the team he won it with: the last he played for that season, a title's in the playoffs", () => {
    const l = fresh();
    const p = career(l, [[A, 5]], { jerseys: { [A]: '5' } });
    const season = l.season - 1;
    // traded to B during his MVP season, and won the title with B
    p.stats.push(line(season, B, { gp: 20 }), { ...line(season, B), playoffs: true });
    p.awards.push({ season, type: 'MVP' }, { season, type: 'Champion' });
    expect(awardTeam(p, p.awards[0])).toBe(B);
    expect(awardTeam(p, p.awards[1])).toBe(B);
    expect(legendReason(l, p, A)).toBeNull();
  });

  it("a seeded player's real seasons count toward the five, and they carry the team", () => {
    const l = fresh();
    const p = career(l, [[A, 5]], { jerseys: { [A]: '30' } });
    for (const s of p.stats.slice(0, 3)) s.real = true;
    p.hof = true;
    expect(retireNumbers(l, p)).toEqual([A]);
    expect(l.teams[A].retired![0].jersey).toBe('30');
  });

  it('from a save before numbers were kept by team, only the last team he played for knows the number: the one he wears', () => {
    const l = fresh();
    const p = career(
      l,
      [
        [A, 5],
        [B, 6],
      ],
      { jersey: '34' },
    );
    // a legend for both: an MVP with A, the Hall of Fame with B
    p.hof = true;
    p.awards.push({ season: l.season - 8, type: 'MVP' });
    expect(legendReason(l, p, A)).toBe('MVP');
    expect(retireNumbers(l, p)).toEqual([B]);
    expect(l.teams[B].retired![0].jersey).toBe('34');
    // numbered by a team since (he may wear its number now), not even that one
    const q = career(
      l,
      [
        [A, 5],
        [B, 6],
      ],
      { jersey: '35', jerseys: { [(B + 1) % 30]: '35' } },
    );
    q.hof = true;
    expect(retireNumbers(l, q)).toEqual([]);
  });

  it("the user's franchise hears about the ceremony; another team's legend is only news", () => {
    const l = fresh();
    const U = l.userTid;
    const mine = career(l, [[U, 5]], { jerseys: { [U]: '9' } });
    mine.hof = true;
    const inbox = l.inbox.length;
    retireNumbers(l, mine);
    expect(l.inbox.length).toBe(inbox + 1);
    expect(l.inbox[0]).toMatchObject({ from: 'Owner', subject: 'No. 9 to the rafters', tone: 'good', link: `/history?tid=${U}` });
    expect(l.inbox[0].body).toBe(`${playerName(mine)}'s No. 9 goes up to the rafters at the home opener, and nobody wears it for the ${l.teams[U].name} again.`);
    const theirs = career(l, [[A, 5]], { jerseys: { [A]: '9' } });
    theirs.hof = true;
    retireNumbers(l, theirs);
    expect(l.inbox.length).toBe(inbox + 1);
    expect(l.news[l.news.length - 1].text).toBe(`The ${l.teams[A].name} will retire ${playerName(theirs)}'s No. 9.`);
  });
});

describe('numbers on a team', () => {
  const unique = (l: League, tid: number) => {
    const numbers = teamPlayers(l, tid).map((p) => p.jersey);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers.every((j) => /^\d{1,2}$/.test(j))).toBe(true);
  };

  it('nobody who joins gets a retired number, while the player who wore it there when it went up keeps it until he leaves', () => {
    const l = fresh();
    numberTeam(l, A);
    const [incumbent] = teamPlayers(l, A);
    const n = incumbent.jersey;
    // a number nobody on the team wears goes up too
    const m = JERSEYS.find((j) => !teamPlayers(l, A).some((p) => p.jersey === j))!;
    l.teams[A].retired = [
      { jersey: n, pid: 999_001, name: 'Old Legend', season: l.season - 1 },
      { jersey: m, pid: 999_002, name: 'Older Legend', season: l.season - 2 },
    ];
    ensureRotation(l, A);
    expect(incumbent.jersey).toBe(n);
    unique(l, A);
    // a trade arrival with the other retired number: as a trade brings him in, then the next game
    const arrival = teamPlayers(l, B)[0];
    arrival.jersey = m;
    arrival.tid = A;
    l.teams[A].rotation.order.push(arrival.pid);
    ensureRotation(l, A);
    expect(arrival.jersey).not.toBe(m);
    expect(retiredNumbers(l.teams[A]).has(arrival.jersey)).toBe(false);
    expect(arrival.jerseys?.[A]).toBe(arrival.jersey);
    // the incumbent leaves; a free agent who wore his number signs and takes another at once
    releasePlayer(l, incumbent, { news: false });
    delete incumbent.waivers;
    const fa = freeAgents(l).find((p) => p.pid !== incumbent.pid)!;
    fa.jersey = n;
    signPlayer(l, fa, A, CAP.minContract, 1, { news: false });
    expect(fa.jersey).not.toBe(n);
    expect(retiredNumbers(l.teams[A]).has(fa.jersey)).toBe(false);
    unique(l, A);
    // and the incumbent back later is a newcomer like any other
    incumbent.jersey = n;
    signPlayer(l, incumbent, A, CAP.minContract, 1, { news: false });
    expect(incumbent.jersey).not.toBe(n);
    unique(l, A);
  });

  it('a team can always number a full roster: every usual number retired, then nearly every number', () => {
    const l = fresh();
    const t = l.teams[A];
    t.retired = JERSEYS.map((jersey, i) => ({ jersey, pid: 990_000 + i, name: `Legend ${i}`, season: l.season }));
    // nobody keeps a retired number he wasn't wearing here before
    t.numbered = [];
    numberTeam(l, A);
    unique(l, A);
    expect(teamPlayers(l, A).every((p) => !retiredNumbers(t).has(p.jersey))).toBe(true);
    // with only a few numbers left, retired ones come back before two players share one
    t.retired = Array.from({ length: 95 }, (_, i) => ({ jersey: String(i), pid: 980_000 + i, name: `Legend ${i}`, season: l.season }));
    t.numbered = [];
    numberTeam(l, A);
    unique(l, A);
    const free = teamPlayers(l, A).filter((p) => Number(p.jersey) >= 95);
    expect(free.length).toBe(5);
  });
});

describe('saves', () => {
  it('retired numbers and numbers by team survive a save; a damaged entry is dropped', async () => {
    const l = fresh();
    for (const t of l.teams) ensureRotation(l, t.tid);
    l.teams[A].retired = [{ jersey: '23', pid: 77, name: 'Old Legend', season: l.season - 1 }];
    await saveLeague(l);
    const back = (await loadLeague(l.id))!;
    expect(back.teams[A].retired).toEqual(l.teams[A].retired);
    const p = teamPlayers(back, A)[0];
    expect(p.jerseys?.[A]).toBe(p.jersey);

    const bad = structuredClone(l) as unknown as { teams: { retired?: unknown }[]; players: Record<number, { jerseys?: unknown }> };
    bad.teams[A].retired = [
      { jersey: '23', pid: 77, name: 'Old Legend', season: l.season - 1 },
      { jersey: 23, pid: 78, name: 'Number', season: l.season },
      { jersey: '7', pid: 'x', name: 'Pid', season: l.season },
      { jersey: '7', pid: 79, season: l.season },
      'junk',
    ];
    bad.teams[B].retired = 'junk';
    bad.players[p.pid].jerseys = { [A]: '12', 99: '13', x: '14', [B]: 15 };
    const q = teamPlayers(l, B)[0];
    bad.players[q.pid].jerseys = ['12'];
    const fixed = migrate(bad);
    expect(fixed.teams[A].retired).toEqual([{ jersey: '23', pid: 77, name: 'Old Legend', season: l.season - 1 }]);
    expect(fixed.teams[B].retired).toEqual([]);
    expect(fixed.players[p.pid].jerseys).toEqual({ [A]: '12' });
    expect(fixed.players[q.pid].jerseys).toBeUndefined();
    // a save from before retired numbers has none, and that's fine
    expect(fixed.teams[(A + 3) % 30].retired).toBeUndefined();
    // the players a team numbered, out of shape, go: it numbers its roster again (it threw at the next game)
    const odd = structuredClone(l) as unknown as { teams: { numbered?: unknown }[] };
    odd.teams[A].numbered = 5;
    odd.teams[B].numbered = { x: 1 };
    const kept = l.teams[(A + 3) % 30].numbered;
    const back2 = migrate(odd);
    expect(back2.teams[A].numbered).toBeUndefined();
    expect(back2.teams[B].numbered).toBeUndefined();
    expect(back2.teams[(A + 3) % 30].numbered).toEqual(kept);
    expect(() => numberTeam(back2, A)).not.toThrow();
  });
});
