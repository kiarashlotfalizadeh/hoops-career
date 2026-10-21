// "While you were away" (ui/today/digest.ts): built once when a sim ends, from what the league holds
// since the mark the store took when it started. A scripted week: the user's results and their
// record, his stories (not his games, which are the results), the league's, new mail, a new injury,
// and the conference rank before and after; a short sim has no digest.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { runSim } from '../../state/simCore';
import { useStore } from '../../state/store';
import { addInbox, addNews, teamPlayers } from '../../core/league/helpers';
import { buildDigest, digestLine, digestMark } from '../today/digest';
import { testLeague, userGames } from '../../state/__tests__/fixtures';

const st = () => useStore.getState();
afterEach(() => st().setLeague(null));

describe('the digest', () => {
  it('tells a week: results with the record, his stories, the league, mail, injuries and standings', async () => {
    const l = testLeague('digest');
    // a couple of weeks in, so the standings have a rank to move from
    await runSim(l, { kind: 'days', n: 10 });
    const mark = digestMark(l);
    const before = userGames(l).length;
    await runSim(l, { kind: 'days', n: 7 });
    const me = l.userTid;
    const other = (me + 1) % 30;
    // what the press, the development watch and the legacy would have written meanwhile
    addNews(l, { kind: 'honor', head: 'Player of the Week', text: 'He averaged 31.', tids: [me], pids: [], weight: 2 });
    addNews(l, { kind: 'game', head: 'A night at the Garden', text: 'The story of his game.', tids: [me, other], pids: [], weight: 3 });
    addNews(l, { kind: 'milestone', head: 'A milestone', text: 'Ten thousand points.', tids: [me], pids: [], weight: 3 });
    addNews(l, { kind: 'column', head: 'Somebody else entirely', text: 'Another team.', tids: [other], pids: [], weight: 3 });
    addNews(l, { kind: 'injury', text: 'A brief about another team.', tids: [other], pids: [] });
    addInbox(l, { from: 'Owner', subject: 'A word', body: 'Keep it up.', important: true });
    const hurt = teamPlayers(l, me).find((p) => !p.injury)!;
    hurt.injury = { type: 'ankle sprain', gamesRemaining: 6, gamesTotal: 6, severity: 'moderate' };

    const d = buildDigest(mark, l)!;
    expect(d).not.toBeNull();
    const played = userGames(l).length - before;
    expect(d.results.length).toBe(played);
    expect(d.record).toEqual({ w: d.results.filter((r) => r.won).length, l: d.results.filter((r) => !r.won).length });
    // newest first, as the schedule's own games
    const mine = userGames(l).slice(before).reverse();
    expect(d.results.map((r) => r.gid)).toEqual(mine.map((g) => g.gid));
    // his stories, the biggest first (the press may have written more of its own meanwhile); his
    // game is told in the results, not twice
    const heads = d.stories.map((s) => s.head);
    expect(heads).toEqual(expect.arrayContaining(['A milestone', 'Player of the Week']));
    expect(heads.indexOf('A milestone')).toBeLessThan(heads.indexOf('Player of the Week'));
    expect(heads).not.toContain('A night at the Garden');
    expect(d.stories.find((s) => s.head === 'A milestone')).toMatchObject({ dek: 'Ten thousand points.', weight: 3 });
    // around the league: stories only, not briefs
    expect(d.around.map((s) => s.head)).toContain('Somebody else entirely');
    expect(d.around.every((s) => s.weight >= 2)).toBe(true);
    expect(d.mail).toContain(l.inbox[0].id);
    expect(d.injuries.some((x) => x.startsWith(`${hurt.lastName}`) && x.includes('Ankle sprain') && x.includes('out 6 games'))).toBe(true);
    expect(d.seed?.before).toBe(mark.seed);
    expect(d.seed?.after).toBeGreaterThan(0);
    expect(digestLine(d)).toMatch(/^\d+-\d+ · /);
  });

  it('a sim of a day, or a couple without two of his games, has none', async () => {
    const l = testLeague('short');
    const mark = digestMark(l);
    await runSim(l, { kind: 'days', n: 1 });
    expect(buildDigest(mark, l)).toBeNull();
  });

  it('only counts what came after the mark', async () => {
    const l = testLeague('after');
    addNews(l, { kind: 'milestone', head: 'Old news', text: 'Before the sim.', tids: [l.userTid], pids: [], weight: 3 });
    const mark = digestMark(l);
    await runSim(l, { kind: 'days', n: 6 });
    const d = buildDigest(mark, l);
    expect(d?.stories.some((s) => s.head === 'Old news')).toBeFalsy();
  });

  it('the store builds it when a long sim ends, opens it, and a short sim retires it', async () => {
    st().setLeague(testLeague('store'));
    await st().simulate({ kind: 'week' });
    expect(st().digest).not.toBeNull();
    expect(st().digestOpen).toBe(true);
    st().showDigest(false);
    // closed, it's still there for Today's link
    expect(st().digest).not.toBeNull();
    await st().simulate({ kind: 'days', n: 1 });
    expect(st().digest).toBeNull();
    // with the setting off it's built but waits on Today
    st().mutate((x) => void ((x.settings as { digest?: boolean }).digest = false));
    await st().simulate({ kind: 'week' });
    expect(st().digest).not.toBeNull();
    expect(st().digestOpen).toBe(false);
  });
});
