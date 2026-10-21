// The Continue loop: sims that stop for the right things (a front-page story about the user's team,
// the morning of one of his biggest games), "Sim to the next big night" from a game's billing, the
// Continue bar naming tonight's stakes, and big moments that end a sim on one story, the biggest.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { League, ScheduledGame } from '../../core/types';
import { billingFor, type Billing } from '../../core/analysis/gameStory';
import { addNews } from '../../core/league/helpers';
import { userGameOnDay } from '../../core/league/games';
import { runSim } from '../../state/simCore';
import { flowActions, nextBigNight } from '../flow';
import { currentMoments, pickMoments, type Moment } from '../moments';
import { testLeague } from '../../state/__tests__/fixtures';

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

/** The user's games still to play, in order. */
const ahead = (l: League): ScheduledGame[] =>
  l.schedule.filter((g) => !g.played && g.day > l.day && (g.home === l.userTid || g.away === l.userTid)).sort((a, b) => a.day - b.day || a.gid - b.gid);

beforeEach(() => vi.mocked(billingFor).mockImplementation(() => null));
afterEach(() => vi.mocked(billingFor).mockReset());

describe('sims that stop for the right things', () => {
  it('a front-page story about his team stops a long sim the day it comes out', async () => {
    const l = stopping('front');
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
          // day 3: a milestone for the user's team (and on day 2 a front page about someone else, and
          // the power rankings about him, which don't stop it)
          if (++n === 2) {
            story(l, mine, { kind: 'milestone', head: 'Not yours', text: '.', tids: [(l.userTid + 1) % 30], pids: [], weight: 3 });
            story(l, mine, { kind: 'power', head: 'Power rankings', text: '.', tids: [l.userTid], pids: [], weight: 3 });
          }
          if (n === 3) story(l, mine, { kind: 'milestone', head: 'Yours', text: '.', tids: [l.userTid], pids: [], weight: 3 });
        },
      },
    );
    expect(out).toEqual({ days: 3, stop: 'frontPage' });
    expect(l.day).toBe(day0 + 3);
  });

  it('a story of weight 2, or the setting off, or no stops at all, plays on', async () => {
    for (const set of [{ weight: 2 as const }, { off: 'stopOnFrontPage' }, { off: 'stopOnNews' }]) {
      const l = stopping(`front-${JSON.stringify(set)}`);
      if ('off' in set) (l.settings as unknown as Record<string, boolean>)[set.off!] = false;
      const mine = new Set<number>();
      const hush = quiet(l, mine);
      let n = 0;
      const out = await runSim(
        l,
        { kind: 'week' },
        {
          progress: () => {
            hush();
            if (++n === 2) story(l, mine, { kind: 'honor', head: 'Yours', text: '.', tids: [l.userTid], pids: [], weight: 'weight' in set ? set.weight : 3 });
          },
        },
      );
      expect(out.stop, JSON.stringify(set)).toBe('target');
    }
  });

  it('a sim of a set number of days never stops for it', async () => {
    const l = stopping('days');
    const out = await runSim(l, { kind: 'days', n: 4 }, { progress: () => addNews(l, { kind: 'milestone', head: 'x', text: '.', tids: [l.userTid], pids: [], weight: 3 }) });
    expect(out).toEqual({ days: 4, stop: 'target' });
  });

  it('stops on the morning of one of his biggest games, before it is played', async () => {
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
  });
});

describe('sim to the next big night', () => {
  it('finds his next billed game of weight 2 or more and sims to its morning', async () => {
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
  });

  it('is not offered when the next big night is simply the next game, or there is none', () => {
    const l = testLeague('nobig');
    expect(flowActions(l).some((a) => a.id === 'bignight')).toBe(false);
    const next = ahead(l)[0];
    // (unless today is a game day: then the next game is today's)
    if (userGameOnDay(l, l.day)) return;
    bill({ [next.gid]: { tag: 'Rivalry', line: '.', weight: 3 } });
    expect(flowActions(l).some((a) => a.id === 'bignight')).toBe(false);
  });

  it('the Continue bar names what is on the line tonight, and Sim 1 month is on offer', () => {
    const l = testLeague('tonight');
    const g = userGameOnDay(l, l.day) ?? ahead(l)[0];
    l.day = g.day;
    bill({ [g.gid]: { tag: 'Rivalry night', line: '.', weight: 2 } });
    const live = flowActions(l).find((a) => a.id === 'live');
    expect(live?.sub).toMatch(/^Rivalry night · (vs|@) [A-Z]{3}/);
    expect(flowActions(l).find((a) => a.id === 'month')?.sim).toEqual({ kind: 'month' });
  });
});

describe('moments from the front page', () => {
  const story = (key: string, rank: number): Moment => ({ key, kind: 'story', over: '', title: key, sub: '', rank });

  it('of the stories that come out together, only the biggest takes the screen', () => {
    expect(pickMoments([story('a', 3), story('b', 9), story('c', 5)]).map((m) => m.key)).toEqual(['b']);
  });

  it('a career moment outranks every story; a title outranks the series on the way', () => {
    const clinch: Moment = { key: 'clinch', kind: 'clinch', over: '', title: '', sub: '' };
    expect(pickMoments([story('a', 9), clinch]).map((m) => m.key)).toEqual(['clinch']);
    const series: Moment = { key: 's', kind: 'series', over: '', title: '', sub: '' };
    const title: Moment = { key: 't', kind: 'title', over: '', title: '', sub: '', big: true };
    expect(pickMoments([series, title]).map((m) => m.key)).toEqual(['t']);
  });

  it("reads this season's front-page stories about his team as moments, a milestone above a game", () => {
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
  });
});
