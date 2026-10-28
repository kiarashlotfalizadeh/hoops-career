// The Continue loop: sims that stop for the right things (a new staff call, each playoff series of
// his once as it starts and each morning after a loss that has him behind, the morning of one of his
// biggest games, never a story) and say a call they passed, "Sim to the next big night" from a
// game's billing as it reads each day, the Continue bar naming tonight's stakes, and big moments
// that end a sim on one story, the biggest.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { League, ScheduledGame } from '../../core/types';
import { billingFor, type Billing } from '../../core/analysis/gameStory';
import { addNews, standardRoster } from '../../core/league/helpers';
import { userGameOnDay } from '../../core/league/games';
import { runSim } from '../../state/simCore';
import { newCall, openCallIds, settleCall, storeWorth, worthSig } from '../../core/league/calls';
import { schedulePlayoffDay } from '../../core/league/playoffs';
import { flowActions, nextBigNight } from '../flow';
import { currentMoments, pickMoments, type Moment } from '../moments';
import { testLeague } from '../../state/__tests__/fixtures';
import { buildDigest, digestMark, shownResults, type DigestResult } from '../today/digest';
import { isHisStory, isLeagueStory, topStory } from '../today/front';
import { freshAdvice, STALE_DAYS } from '../today/staffAge';
import type { AssistantCard } from '../../core/ai/assistant';

vi.mock('../../core/analysis/gameStory', async (load) => {
  const m = await load<typeof import('../../core/analysis/gameStory')>();
  return { ...m, billingFor: vi.fn(() => null) };
});

/** Bill these games (by gid); every other night is ordinary. */
function bill(nights: Record<number, Billing>) {
  vi.mocked(billingFor).mockImplementation((_l, g) => nights[g.gid] ?? null);
}

/** A league that stops for things, with its mail read every day so a news stop can't get in first. */
function stopping(name: string): League {
  const l = testLeague(name);
  l.settings.stopOnNews = true;
  return l;
}
/**
 * Each day: the mail read, so a news stop can't get in first, and the press's own front pages made
 * briefs, so only the stories a test writes can stop it (the real press writes plenty).
 */
const quiet = (l: League, mine: Set<number> = new Set()) => {
  const from = l.nextMsgId;
  return () => {
    l.inbox.forEach((m) => (m.read = true));
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
/** Hurt him for `games` games, a new injury. */
const hurt = (p: ReturnType<typeof best>, games: number) => {
  p.injury = { type: 'Sprained ankle', gamesRemaining: games, gamesTotal: games, severity: 'moderate' };
  p.injuryCount++;
};

/** The user's games still to play, in order. */
const ahead = (l: League): ScheduledGame[] =>
  l.schedule.filter((g) => !g.played && g.day > l.day && (g.home === l.userTid || g.away === l.userTid)).sort((a, b) => a.day - b.day || a.gid - b.gid);

beforeEach(() => vi.mocked(billingFor).mockImplementation(() => null));
afterEach(() => vi.mocked(billingFor).mockReset());

describe('the Continue loop', () => {
  it('stops sims for the right things, sims to the next big night, names tonight on the Continue bar, and ends a sim on its biggest moment', async () => {
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
            if (n === 3) hurt(best(l), 20);
          },
        },
      );
      expect(out).toEqual({ days: 3, stop: 'call' });
      expect(l.day).toBe(day0 + 3);
      expect(openCallIds(l)).toEqual([`injury:${best(l).pid}:${best(l).injuryCount}`]);
      // what the sim's end says: the call new since it started
      expect(newCall(l, openCallIds(l), new Set())).toMatchObject({ card: { kind: 'injury' }, due: false });
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
      expect(openCallIds(l)).toEqual([`series:${l.season}:${conf}2-0`]);
      // a week on: Game 1 and the games after it, no second stop for the series' start; only the morning
      // after a loss that has him behind (its call names the score: the staff's adjustment for that game)
      for (let i = 0; i < 4; i++) {
        const before = new Set(openCallIds(l));
        const r = await runSim(l, { kind: 'week' }, { progress: quiet(l) });
        if (r.stop === 'target') break;
        const s = l.playoffs[0];
        expect(r.stop).toBe('call');
        expect(s.highWins).toBeLessThan(s.lowWins);
        expect(newCall(l, openCallIds(l), before)?.card.id).toBe(`series:${l.season}:${conf}2-0:${s.highWins}-${s.lowWins}`);
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
      expect(out.stop, `${set}: ${openCallIds(l).join()}`).toBe('target');
    }

    // a sim of a set number of days never stops for it, but a call that opened on the way is still said at its end
    {
      const l = stopping('days');
      const before = new Set(openCallIds(l));
      let n = 0;
      const out = await runSim(
        l,
        { kind: 'days', n: 4 },
        {
          progress: () => {
            addNews(l, { kind: 'milestone', head: 'x', text: '.', tids: [l.userTid], pids: [], weight: 3 });
            // (out long enough that a trade is still an answer when it ends: a real choice)
            if (++n === 2) hurt(best(l), 30);
          },
        },
      );
      expect(out).toEqual({ days: 4, stop: 'target' });
      expect(newCall(l, openCallIds(l), before)?.card.kind).toBe('injury');
    }

    // a sim stops on the morning of one of his biggest games, before it is played
    {
      const l = stopping('biggame');
      const g = ahead(l)[3];
      bill({ [g.gid]: { tag: 'Game 7', line: 'Winner goes on.', weight: 3 } });
      const out = await runSim(l, { kind: 'endRegular' }, { progress: quiet(l) });
      expect(out.stop).toBe('bigGame');
      expect(l.day).toBe(g.day);
      expect(userGameOnDay(l, l.day)?.gid).toBe(g.gid);
      // a big night of weight 2 isn't a reason to stop
      const l2 = stopping('biggame2');
      const g2 = ahead(l2)[1];
      bill({ [g2.gid]: { tag: 'Rivalry', line: 'Again.', weight: 2 } });
      // (a week that reaches past it)
      expect(g2.day - l2.day).toBeLessThan(7);
      expect((await runSim(l2, { kind: 'week' }, { progress: quiet(l2) })).stop).toBe('target');
    }

    // sim to the next big night: his next billed game of weight 2 or more, simmed to its morning
    {
      const l = testLeague('bignight');
      const games = ahead(l);
      const [small, big] = [games[1], games[4]];
      bill({ [small.gid]: { tag: 'Back-to-back', line: '.', weight: 1 }, [big.gid]: { tag: 'Rivalry', line: 'Boston again.', weight: 2 } });
      expect(nextBigNight(l)?.g.gid).toBe(big.gid);
      const opt = flowActions(l).find((a) => a.id === 'bignight');
      expect(opt?.sim).toEqual({ kind: 'bigNight', day: big.day });
      expect(opt?.sub).toMatch(/^Rivalry · /);
      await runSim(l, opt!.sim!);
      expect(l.day).toBe(big.day);
      expect(userGameOnDay(l, l.day)?.gid).toBe(big.gid);
      // the billing is read each day it sims: a night that has become big on the way stops it there
      const m = testLeague('bignight-on-the-way');
      const [, , mid, , far] = ahead(m);
      const farNight = { [far.gid]: { tag: 'Rivalry', line: '.', weight: 2 as const } };
      bill(farNight);
      let n = 0;
      await runSim(
        m,
        { kind: 'bigNight', day: nextBigNight(m)!.g.day },
        { progress: () => void (++n === 1 && bill({ ...farNight, [mid.gid]: { tag: 'Showdown', line: '.', weight: 2 } })) },
      );
      expect(m.day).toBe(mid.day);
    }

    // not offered when the next big night is simply the next game, or there is none
    {
      bill({});
      const l = testLeague('nobig');
      expect(flowActions(l).some((a) => a.id === 'bignight')).toBe(false);
      const next = ahead(l)[0];
      // (unless today is a game day: then the next game is today's)
      if (!userGameOnDay(l, l.day)) {
        bill({ [next.gid]: { tag: 'Rivalry', line: '.', weight: 3 } });
        expect(flowActions(l).some((a) => a.id === 'bignight')).toBe(false);
      }
    }

    // the Continue bar names what is on the line tonight, and Sim 1 month is on offer
    {
      const l = testLeague('tonight');
      const g = userGameOnDay(l, l.day) ?? ahead(l)[0];
      l.day = g.day;
      bill({ [g.gid]: { tag: 'Rivalry night', line: '.', weight: 2 } });
      const live = flowActions(l).find((a) => a.id === 'live');
      expect(live?.sub).toMatch(/^Rivalry night · (vs|@) [A-Z]{3}/);
      expect(flowActions(l).find((a) => a.id === 'month')?.sim).toEqual({ kind: 'month' });
    }

    // moments from the front page
    {
      const story = (key: string, rank: number): Moment => ({ key, kind: 'story', over: '', title: key, sub: '', rank });
      // of the stories that come out together, only the biggest takes the screen
      expect(pickMoments([story('a', 3), story('b', 9), story('c', 5)]).map((m) => m.key)).toEqual(['b']);
      // a career moment outranks every story; a title outranks the series on the way
      const clinch: Moment = { key: 'clinch', kind: 'clinch', over: '', title: '', sub: '' };
      expect(pickMoments([story('a', 9), clinch]).map((m) => m.key)).toEqual(['clinch']);
      const series: Moment = { key: 's', kind: 'series', over: '', title: '', sub: '' };
      const title: Moment = { key: 't', kind: 'title', over: '', title: '', sub: '', big: true };
      expect(pickMoments([series, title]).map((m) => m.key)).toEqual(['t']);
      // one card, the biggest: the rest wait in the digest
      const award: Moment = { key: 'aw', kind: 'award', over: '', title: '', sub: '' };
      const cup: Moment = { key: 'cup', kind: 'cup', over: '', title: '', sub: '' };
      expect(pickMoments([award, clinch, cup, story('a', 9)]).map((m) => m.key)).toEqual(['cup']);
    }

    // this season's front-page stories about his team read as moments, a milestone above a game
    {
      bill({});
      const l = testLeague('moments');
      const me = l.userTid;
      // (the press's own stories from opening night aside)
      const from = l.nextMsgId;
      const pid = Object.values(l.players).find((p) => p.tid === me)!.pid;
      addNews(l, { kind: 'milestone', head: 'Ten thousand', text: 'He got there.', tids: [me], pids: [pid], weight: 3 });
      addNews(l, { kind: 'game', head: 'At the buzzer', text: 'A win.', tids: [me, 3], pids: [], weight: 3 });
      addNews(l, { kind: 'honor', head: 'A small one', text: '.', tids: [me], pids: [], weight: 2 });
      addNews(l, { kind: 'milestone', head: 'Not his', text: '.', tids: [(me + 1) % 30], pids: [], weight: 3 });
      const stories = currentMoments(l).filter((m) => m.kind === 'story' && Number(m.key.slice(5)) >= from);
      expect(stories.map((m) => m.title).sort()).toEqual(['At the buzzer', 'Ten thousand']);
      const [top] = pickMoments(stories);
      expect(top).toMatchObject({ title: 'Ten thousand', sub: 'He got there.', pid });
      expect(top.link).toMatch(/^\/league\/news\?story=\d+$/);
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
      addNews(l, { kind: 'power', head: `Power rankings: the ${l.teams[me].name} slip to 16th`, text: '.', tids: [me], pids: [], weight: 2 });
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
      addNews(l, { kind: 'column', head: `Season wrap: the ${l.teams[other].name}' year`, text: '.', tids: [other, me], pids: [], weight: 2 });
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

    // From your staff: a card shown a week without being acted on gives way (it's in All advice), the days
    // ahead come first, and an extension never sits on Today
    {
      const card = (id: string, area: AssistantCard['area'] = 'team'): AssistantCard => ({ id, area, tone: 'tip', title: id, line: '', weight: 50 });
      const feed = [card('extend:1', 'office'), card('alert:lineup-1'), card('alert:wear-7'), card('open-spot', 'office')];
      expect(freshAdvice(feed, {}, 100).map((c) => c.id)).toEqual(['alert:wear-7', 'alert:lineup-1', 'open-spot']);
      expect(freshAdvice(feed, { 'alert:wear-7': 100 - STALE_DAYS, 'alert:lineup-1': 99 }, 100).map((c) => c.id)).toEqual(['alert:lineup-1', 'open-spot']);
    }
  }, 180_000);
});
