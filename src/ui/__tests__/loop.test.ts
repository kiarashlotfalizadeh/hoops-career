// The Continue loop: sims that stop only for what needs an answer (a starter hurt, each playoff series
// of his once as it starts and each morning after a loss that has him behind; never a story, never a
// big night) and say what they passed, the Continue bar naming tonight's game, and big moments that
// end a sim on one card, the biggest.
import { describe, expect, it } from 'vitest';
import type { League, ScheduledGame } from '../../core/types';
import { addNews, standardRoster, teamCity } from '../../core/league/helpers';
import { userGameOnDay } from '../../core/league/games';
import { runSim } from '../../state/simCore';
import { settleCall, storeWorth, worthSig } from '../../core/league/calls';
import { agenda, simStopIds } from '../../core/league/agenda';
import { schedulePlayoffDay } from '../../core/league/playoffs';
import { flowActions } from '../flow';
import { currentMoments, pickMoments, type Moment } from '../moments';
import { testLeague } from '../../state/__tests__/fixtures';
import { buildDigest, digestMark, shownResults, type DigestResult } from '../today/digest';
import { isHisStory, isLeagueStory, topStory } from '../today/front';

/** A league that stops for things, with its mail read every day so a news stop can't get in first. */
function stopping(name: string): League {
  const l = testLeague(name);
  l.settings.stopOnNews = true;
  return l;
}
/**
 * Each day: the mail read, and no AI team's offer left standing (an offer stops a long sim: the
 * tests here are about the other stops), and the press's own front pages made briefs, so only the
 * stories a test writes are front pages (the real press writes plenty).
 */
const quiet = (l: League, mine: Set<number> = new Set()) => {
  const from = l.nextMsgId;
  return () => {
    l.inbox.forEach((m) => (m.read = true));
    delete l.proposals;
    for (const n of l.news) if (n.id >= from && !mine.has(n.id) && n.weight === 3) n.weight = 1;
  };
};
/** Add a story the test means, kept out of quiet's reach. */
const story = (l: League, mine: Set<number>, n: Parameters<typeof addNews>[1]) => {
  mine.add(l.nextMsgId);
  addNews(l, n);
};

/** The user's best player. */
const best = (l: League) => standardRoster(l, l.userTid).sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)[0];
const bestGuard = (l: League) =>
  standardRoster(l, l.userTid)
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
    .find((p) => p.pos === 'PG' || p.pos === 'SG')!;
/** Hurt him for `games` games, a new injury. */
const hurt = (p: ReturnType<typeof best>, games: number) => {
  p.injury = { type: 'Sprained ankle', gamesRemaining: games, gamesTotal: games, severity: 'moderate' };
  p.injuryCount++;
};

/** The user's games still to play, in order. */
const ahead = (l: League): ScheduledGame[] =>
  l.schedule.filter((g) => !g.played && g.day > l.day && (g.home === l.userTid || g.away === l.userTid)).sort((a, b) => a.day - b.day || a.gid - b.gid);

describe('the Continue loop', () => {
  it('stops sims for the right things, names tonight on the Continue bar, and ends a sim on its biggest moment', async () => {
    // a front-page story about his team never stops a long sim (the digest leads with it); a new
    // staff call does, the day it opens: here his best player out for 20 games
    {
      const l = stopping('call');
      const day0 = l.day;
      const mine = new Set<number>();
      const hush = quiet(l, mine);
      let n = 0;
      const out = await runSim(
        l,
        { kind: 'week' },
        {
          progress: () => {
            hush();
            if (++n === 2) story(l, mine, { kind: 'milestone', head: 'Yours', text: '.', tids: [l.userTid], pids: [], weight: 3 });
            if (n === 3) {
              hurt(best(l), 20);
              // (measured as a real loss: a star the team holds up without is no call, and that turns on the night's matchup)
              const id = `injury:${best(l).pid}:${best(l).injuryCount}`;
              l.callWorth = { ...l.callWorth, [id]: { gid: ahead(l)[0].gid, sig: 0, day: l.day, pts: 3, raw: 3, se: 1 } };
            }
          },
        },
      );
      expect(out).toEqual({ days: 3, stop: 'call' });
      expect(l.day).toBe(day0 + 3);
      expect(simStopIds(l)).toEqual([`injury:${best(l).pid}:${best(l).injuryCount}`]);
      // what the sim's end says: the item new since it started
      expect(agenda(l).find((i) => i.id === l.stopCall?.id)?.kind).toBe('injury');
    }

    // a sim through the playoffs stops the morning each series of his starts (Game 1 on the calendar,
    // a call: plan it or leave it to the staff) when a counter measures as a gain against them (pinned
    // here; with none a gain it's no call: agenda.test), once: the next sim plays the series on
    {
      const l = stopping('series');
      const me = l.userTid;
      const conf = l.teams[me].conf;
      const [opp, a, b] = l.teams.filter((t) => t.tid !== me && t.conf === conf).map((t) => t.tid);
      l.phase = 'playoffs';
      l.schedule = l.schedule.filter((g) => g.played);
      l.playoffs = [];
      const hush = quiet(l);
      let n = 0;
      const out = await runSim(
        l,
        { kind: 'endPostseason' },
        {
          progress: () => {
            hush();
            // the next round's draw two days in
            if (++n !== 2) return;
            l.playoffs.push(
              { id: `${conf}2-0`, round: 2, conf, high: me, low: opp, highSeed: 1, lowSeed: 4, highWins: 0, lowWins: 0 },
              { id: `${conf}2-1`, round: 2, conf, high: a, low: b, highSeed: 2, lowSeed: 3, highWins: 0, lowWins: 0 },
            );
            schedulePlayoffDay(l);
            const g = l.schedule.find((x) => x.seriesId === `${conf}2-0` && !x.played)!;
            storeWorth(l, `series:${l.season}:${conf}2-0`, {
              gid: g.gid,
              sig: worthSig(l, opp, g),
              day: l.day,
              items: [{ id: 'zone23', label: 'Zone 2-3', patch: {}, pts: 0.8 }],
            });
          },
        },
      );
      expect(out).toEqual({ days: 2, stop: 'call' });
      expect(userGameOnDay(l, l.day)?.seriesId).toBe(`${conf}2-0`);
      expect(simStopIds(l)).toEqual([`series:${l.season}:${conf}2-0`]);
      // a week on: Game 1 and the games after it, no second stop for the series' start; only the morning
      // after a loss that has him behind (its call names the score: the staff's adjustment for that game)
      for (let i = 0; i < 4; i++) {
        const before = new Set(simStopIds(l));
        const r = await runSim(l, { kind: 'week' }, { progress: quiet(l) });
        if (r.stop === 'target') break;
        const s = l.playoffs[0];
        expect(r.stop).toBe('call');
        expect(s.highWins).toBeLessThan(s.lowWins);
        expect(simStopIds(l).find((x) => !before.has(x))).toBe(`series:${l.season}:${conf}2-0:${s.highWins}-${s.lowWins}`);
      }
      expect(l.playoffs[0].highWins + l.playoffs[0].lowWins).toBeGreaterThan(1);
    }

    // a call that was open when the sim started, or that he settled, or a short absence, or no stops at all, plays on
    for (const set of ['open', 'settled', 'short', 'off'] as const) {
      const l = stopping(`call-${set}`);
      // (only the injury made here: one of his other five best hurt in the week is a call of its own)
      l.settings.injuries = false;
      if (set === 'off') l.settings.stopOnNews = false;
      const star = best(l);
      if (set === 'open') hurt(star, 40);
      const hush = quiet(l);
      let n = 0;
      const out = await runSim(
        l,
        { kind: 'week' },
        {
          progress: () => {
            hush();
            if (++n !== 2 || set === 'open') return;
            hurt(star, set === 'short' ? 6 : 20);
            if (set === 'settled') settleCall(l, `injury:${star.pid}:${star.injuryCount}`);
          },
        },
      );
      expect(out.stop, `${set}: ${simStopIds(l).join()}`).toBe('target');
    }

    // a sim of a set number of days never stops for it, but a call that opened on the way is still said at its end
    {
      const l = stopping('days');
      const before = new Set(simStopIds(l));
      let n = 0;
      const out = await runSim(
        l,
        { kind: 'days', n: 4 },
        {
          progress: () => {
            delete l.proposals;
            addNews(l, { kind: 'milestone', head: 'x', text: '.', tids: [l.userTid], pids: [], weight: 3 });
            // (out long enough that a trade is still an answer when it ends: a real choice. His best guard: the
            // staff has cover or a trade to offer for one, which it may not for the roster's best player, a center)
            if (++n === 2) hurt(bestGuard(l), 30);
          },
        },
      );
      expect(out).toEqual({ days: 4, stop: 'target' });
      expect(agenda(l).find((i) => simStopIds(l).includes(i.id) && !before.has(i.id))?.kind).toBe('injury');
    }

    // the Continue bar names tonight's game, Sim 1 month is on offer, and no sim aims at a "big night"
    {
      const l = testLeague('tonight');
      const g = userGameOnDay(l, l.day) ?? ahead(l)[0];
      l.day = g.day;
      const live = flowActions(l).find((a) => a.id === 'live');
      expect(live?.sub).toMatch(/^(vs|@) [A-Z]{3}.* · today$/);
      expect(flowActions(l).find((a) => a.id === 'month')?.sim).toEqual({ kind: 'month' });
      expect(flowActions(l).some((a) => a.id === 'bignight')).toBe(false);
    }

    // one card a sim, the biggest career moment: a title outranks the series on the way, and the rest wait
    {
      const clinch: Moment = { key: 'clinch', kind: 'clinch', over: '', title: '', sub: '' };
      const series: Moment = { key: 's', kind: 'series', over: '', title: '', sub: '' };
      const title: Moment = { key: 't', kind: 'title', over: '', title: '', sub: '', big: true };
      expect(pickMoments([series, title]).map((m) => m.key)).toEqual(['t']);
      const award: Moment = { key: 'aw', kind: 'award', over: '', title: '', sub: '' };
      const cup: Moment = { key: 'cup', kind: 'cup', over: '', title: '', sub: '' };
      expect(pickMoments([award, clinch, cup]).map((m) => m.key)).toEqual(['cup']);
      expect(pickMoments([])).toEqual([]);
    }

    // the press's front pages about his team never take the screen: a story is no moment
    {
      const l = testLeague('moments');
      const me = l.userTid;
      const pid = Object.values(l.players).find((p) => p.tid === me)!.pid;
      addNews(l, { kind: 'milestone', head: 'Ten thousand', text: 'He got there.', tids: [me], pids: [pid], weight: 3 });
      addNews(l, { kind: 'game', head: 'At the buzzer', text: 'A win.', tids: [me, 3], pids: [], weight: 3 });
      expect(currentMoments(l).some((m) => m.title === 'Ten thousand' || m.title === 'At the buzzer')).toBe(false);
    }

    // a long stretch's digest lists its 2 newest results and then its 3 biggest nights; a short one its newest
    {
      const res = (gid: number, weight: number): DigestResult => ({ gid, won: true, score: '1-0', opp: 1, home: true, weight });
      const long = [res(15, 1), res(14, 1), res(13, 1), res(12, 3), res(11, 1), res(10, 2), res(9, 1), res(8, 3), res(7, 1), res(6, 1)];
      expect(shownResults(long).map((r) => r.gid)).toEqual([15, 14, 12, 10, 8]);
      expect(shownResults(long.slice(0, 7)).map((r) => r.gid)).toEqual([15, 14, 13, 12, 11]);
      // the power rankings are a figure in it, not his news
      const l = testLeague('digest');
      const me = l.userTid;
      const mark = digestMark(l);
      addNews(l, { kind: 'power', head: `Power rankings: ${teamCity(l, me)} slips to 16th`, text: '.', tids: [me], pids: [], weight: 2 });
      addNews(l, { kind: 'honor', head: 'Coach of the Month', text: '.', tids: [me], pids: [], weight: 2 });
      // (a long stretch leads with its biggest story under the front page, its moment, told once)
      const d = buildDigest(mark, l, { long: true })!;
      expect([d.moment?.head, ...d.stories.map((s) => s.head)]).toEqual(['Coach of the Month']);
      expect(d.moment).toMatchObject({ kind: 'honor', to: expect.stringMatching(/^\/league\/news\?story=\d+$/) });
      // a front page takes the screen as a big moment before the digest: the digest doesn't lead with it
      addNews(l, { kind: 'milestone', head: 'Big one', text: '.', tids: [me], pids: [], weight: 3 });
      const d2 = buildDigest(mark, l, { long: true })!;
      expect(d2.moment?.head).toBe('Coach of the Month');
      expect(d2.stories.map((s) => s.head)).toEqual(['Big one']);
    }

    // his news: a league-wide column that names him on the way (the season's wrap) is the league's; the lead
    // story prefers this week's story to a bigger one gone stale
    {
      const l = testLeague('front');
      const me = l.userTid;
      const other = (me + 1) % 30;
      l.day = 30;
      addNews(l, { kind: 'column', head: `Season wrap: ${teamCity(l, other)}'s year`, text: '.', tids: [other, me], pids: [], weight: 2 });
      const wrap = l.news.at(-1)!;
      expect([isHisStory(l, wrap), isLeagueStory(l, wrap)]).toEqual([false, true]);
      addNews(l, { kind: 'milestone', head: 'Old and big', text: '.', tids: [me], pids: [], weight: 3 });
      l.news.at(-1)!.day = 19;
      addNews(l, { kind: 'honor', head: 'New and smaller', text: '.', tids: [me], pids: [], weight: 2 });
      l.news.at(-1)!.day = 28;
      expect(topStory(l)?.head).toBe('New and smaller');
      addNews(l, { kind: 'milestone', head: 'New and big', text: '.', tids: [me], pids: [], weight: 3 });
      l.news.at(-1)!.day = 27;
      expect(topStory(l)?.head).toBe('New and big');
    }
  }, 180_000);
});
