// The user's legacy (legacy.ts, legacyPulse.ts, legacyReview.ts) over a whole season: milestones
// fire once and at the right counts, a save from before the legacy marks what it had already
// reached without news, the cabinet keeps a Coach of the Month after the press prunes it, the pulse
// keeps a point a week, the owner checks in once a month in his own voice, the season's review says
// what happened and the owner's verdict opens it, and none of it changes how the league plays out.
import { beforeAll, describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { simDay } from '../league/season';
import { coachCareer, userCoach } from '../league/coaches';
import { userGameOnDay } from '../league/games';
import { STREAK_MARKS, WIN_MARKS, cabinet, coachRanks, ensureLegacy, legacyDay, legacyGame, reviewPath, winValue } from '../league/legacy';
import { PULSE_EVERY, PULSE_KEPT, fanLine, fanScore, pulseNow } from '../league/legacyPulse';
import { buildSeasonReview, vsPress } from '../league/legacyReview';
import type { League } from '../types';

const U = 19;

/** The league with everything the legacy writes taken out: what's left must be the same with or without it. */
function withoutLegacy(l: League) {
  const { legacy, inbox, news, nextMsgId, ...rest } = l;
  void legacy;
  void inbox;
  void news;
  void nextMsgId;
  return JSON.stringify(rest);
}

describe('the legacy over a season', () => {
  let l: League;
  /** The league halfway through the regular season, before its day is played. */
  let mid: League;
  beforeAll(() => {
    l = testLeague('legacy');
    l.id = 'lg_legacy';
    for (let i = 0; i < 400 && l.phase !== 'draftLottery'; i++) {
      if (l.day === 90 && l.phase === 'regular') mid = structuredClone(l);
      simDay(l);
    }
  }, 240_000);

  it('fires each milestone once, with its news and a mail', () => {
    const s = l.legacy!;
    expect(new Set(s.done).size).toBe(s.done.length);
    expect(new Set(s.milestones.map((m) => m.key)).size).toBe(s.milestones.length);
    for (const m of s.milestones) {
      expect(m.head.length).toBeGreaterThan(10);
      expect(l.inbox.some((x) => x.season === m.season && x.link === '/office/career?tab=milestones')).toBe(true);
    }
    // the first win of the career, in the game it came in
    const k = coachCareer(l, userCoach(l)!);
    if (k.won > 0) {
      const first = s.milestones.find((m) => m.key.startsWith('job:'))!;
      const g = l.games.find((x) => x.gid === first.gid)!;
      const mine = l.games
        .filter((x) => x.type === 'regular' && (x.home.tid === U || x.away.tid === U))
        .find((x) => (x.home.tid === U ? x.home.pts > x.away.pts : x.away.pts > x.home.pts));
      expect(g.gid).toBe(mine!.gid);
      // (its news, unless the season's stories have pushed it out of the 400 the save keeps)
      if (l.news[0].season < l.season || l.news[0].day <= first.day) expect(l.news.some((n) => n.kind === 'milestone' && n.head === first.head && n.weight === 3)).toBe(true);
    }
    // career wins: every mark passed, none to come
    for (const n of WIN_MARKS) expect(s.done.includes(`wins:${n}`)).toBe(k.won >= n);
  });

  it('marks a career from before the legacy as reached, without news or mail', () => {
    const x = structuredClone(l);
    delete x.legacy;
    const mail = x.inbox.length;
    const news = x.news.length;
    const s = ensureLegacy(x);
    expect(s.milestones).toHaveLength(0);
    expect(x.inbox.length).toBe(mail);
    expect(x.news.length).toBe(news);
    const k = coachCareer(x, userCoach(x)!);
    for (const n of WIN_MARKS) expect(s.done.includes(`wins:${n}`)).toBe(k.won >= n);
    if (k.playoffs) expect(s.done).toContain('playoffs:first');
    if (k.titles) expect(s.done).toContain('title:first');
  });

  it('reaches career wins and a streak at the game that gets there, once', () => {
    const x = structuredClone(mid);
    delete x.legacy;
    const ts = x.teams[U].seasons.find((s) => s.season === x.season)!;
    // two wins from a hundred, and a nine-game streak: the next win makes ten
    const k0 = coachCareer(x, userCoach(x)!);
    ts.won += 98 - k0.won;
    ts.streak = 9;
    ensureLegacy(x);
    expect(x.legacy!.done).toContain('wins:50');
    expect(x.legacy!.done).not.toContain('wins:100');
    let reached100: number | undefined;
    for (let i = 0; i < 60 && reached100 === undefined; i++) {
      const before = ts.won;
      simDay(x);
      if (ts.won >= 100 && before < 100) reached100 = x.day;
    }
    expect(reached100).toBeDefined();
    const ms = x.legacy!.milestones.filter((m) => m.key === 'wins:100');
    expect(ms).toHaveLength(1);
    expect(x.news.filter((n) => n.kind === 'milestone' && n.head === ms[0].head && n.weight === 3)).toHaveLength(1);
    expect(x.inbox.filter((m) => m.subject === ms[0].head)).toHaveLength(1);
    // the win that made it a hundred is the game it names
    const g = x.games.find((r) => r.gid === ms[0].gid)!;
    expect(g.home.tid === U ? g.home.pts > g.away.pts : g.away.pts > g.home.pts).toBe(true);
    // the streak's ten fired only if the streak got there
    const streakMs = x.legacy!.milestones.filter((m) => m.key === `streak:${x.season}:10`);
    expect(streakMs.length).toBeLessThanOrEqual(1);
    for (let i = 0; i < 10; i++) simDay(x);
    expect(x.legacy!.milestones.filter((m) => m.key === 'wins:100')).toHaveLength(1);
    expect(STREAK_MARKS[0]).toBe(10);
  });

  it('keeps a Coach of the Month in the cabinet after the press has pruned it', () => {
    const x = structuredClone(mid);
    const day = x.day;
    x.media = { honors: [{ season: x.season, day, kind: 'cotm', conf: 'E', tid: U, line: 'The Knicks went 12-3 in December.' }] };
    legacyDay(x);
    legacyDay(x);
    expect(x.legacy!.honors).toHaveLength(1);
    expect(x.inbox.filter((m) => m.subject === 'Coach of the Month')).toHaveLength(1);
    x.media.honors = [];
    expect(cabinet(x).filter((t) => t.kind === 'cotm')).toHaveLength(1);
    // another team's honor isn't his
    x.media.honors = [{ season: x.season, day: day + 1, kind: 'cotm', conf: 'W', tid: 3, line: 'x' }];
    legacyDay(x);
    expect(x.legacy!.honors).toHaveLength(1);
  });

  it('keeps a point a week of the owner and the fans, a season at most', () => {
    const p = l.legacy!.pulse!;
    expect(p.season).toBe(l.season);
    expect(p.pts.length).toBeGreaterThan(20);
    expect(p.pts.length).toBeLessThanOrEqual(PULSE_KEPT);
    for (let i = 1; i < p.pts.length; i++) expect(p.pts[i][0] - p.pts[i - 1][0]).toBeGreaterThanOrEqual(PULSE_EVERY);
    for (const [, o, f] of p.pts) {
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(100);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(100);
    }
    const now = pulseNow(mid);
    expect(['up', 'down', 'flat']).toContain(now.owner.trend);
    // the fans' line names the city or the arena
    const line = fanLine(mid);
    expect(line).toMatch(/New York|Madison Square Garden|Knicks/);
    expect(fanScore(mid)).toBeGreaterThanOrEqual(0);
  });

  it('has the owner check in once a month, in his voice', () => {
    const mails = l.inbox.filter((m) => m.season === l.season && / check-in: /.test(m.subject));
    expect(mails.length).toBeGreaterThanOrEqual(3);
    expect(mails.length).toBeLessThanOrEqual(5);
    const months = mails.map((m) => m.subject.split(' ')[0]);
    expect(new Set(months).size).toBe(months.length);
    for (const m of mails) {
      expect(m.from).toBe('Owner');
      expect(m.subject).toMatch(/^(December|January|February|March|April) check-in: [a-z ]+$/);
      // the record and the pace, against his goal
      expect(m.body).toMatch(/you're on pace for \d+ wins; I asked for \d+/);
      expect(m.important).toBeFalsy();
    }
    // (the All-Star break keeps its own check-in)
    expect(l.inbox.filter((m) => m.subject === 'All-Star break check-in')).toHaveLength(1);
  });

  it('reviews the season when the Finals end, and the owner’s verdict opens it', () => {
    const r = l.legacy!.reviews.find((x) => x.season === l.season)!;
    expect(r).toBeDefined();
    const ts = l.teams[U].seasons.find((s) => s.season === l.season)!;
    expect([r.won, r.lost]).toEqual([ts.won, ts.lost]);
    expect(r.round).toBe(ts.playoffRound);
    expect(r.ownerWins).toBe(l.ownerGoals!.goals.find((g) => g.kind === 'wins')!.target);
    if (r.best) expect(r.best.season).toBe(l.season);
    expect(r.star?.name.length).toBeGreaterThan(3);
    expect(r.records.length).toBeLessThanOrEqual(4);
    expect(r.next!.wins).toBeGreaterThan(10);
    expect(r.next!.wins).toBeLessThan(72);
    const verdict = l.inbox.find((m) => m.season === l.season && m.subject === 'Season review')!;
    expect(verdict.link).toBe(reviewPath(l.season));
    // with the press's prediction, the season against it
    const x = structuredClone(l);
    x.media = { preseason: { season: x.season, rows: [{ tid: U, wins: 40, confRank: 9 }] } };
    const rx = buildSeasonReview(x)!;
    expect(rx.press).toEqual({ wins: 40, confRank: 9, champ: false });
    expect(vsPress(rx)).toMatch(/on the prediction|Right on the prediction/);
    // his rank among the coaches in charge
    const ranks = coachRanks(l)!;
    expect(ranks.wins).toBeGreaterThanOrEqual(1);
    expect(ranks.wins).toBeLessThanOrEqual(ranks.of);
  });

  it('ranks signature wins by how big they were', () => {
    expect(winValue({ kind: 'title', score: [100, 90], round: 4 })).toBeGreaterThan(winValue({ kind: 'series', score: [100, 90], round: 3 }));
    expect(winValue({ kind: 'upset', score: [100, 99], p: 10 })).toBeGreaterThan(winValue({ kind: 'upset', score: [100, 99], p: 28 }));
    const w = l.legacy!.wins;
    for (let i = 1; i < w.length; i++) expect(w[i - 1].v).toBeGreaterThanOrEqual(w[i].v);
  });

  it('changes nothing about how the league plays out', () => {
    // the legacy's hooks on a copy: everything but its own state, the mail and the news stays as it was
    const a = structuredClone(mid);
    const b = structuredClone(mid);
    const before = withoutLegacy(a);
    for (let d = 0; d < 3; d++) {
      for (const g of b.schedule.filter((x) => x.played && x.day === b.day - 1 - d)) legacyGame(b, g);
      legacyDay(b);
    }
    const after = withoutLegacy(b);
    expect(after.length).toBe(before.length);
    expect(after).toBe(before);
    expect(b.rng).toBe(a.rng);
    // and a season sims to the same results whatever the legacy has kept
    const c = structuredClone(mid);
    const e = structuredClone(mid);
    delete e.legacy;
    for (let i = 0; i < 25; i++) {
      simDay(c);
      simDay(e);
    }
    expect(c.rng).toBe(e.rng);
    expect(c.games.map((g) => [g.gid, g.home.pts, g.away.pts])).toEqual(e.games.map((g) => [g.gid, g.home.pts, g.away.pts]));
    expect(userGameOnDay(c, c.day)?.gid).toBe(userGameOnDay(e, e.day)?.gid);
  });
});
