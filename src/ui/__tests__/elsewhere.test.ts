// What happened while the user looked elsewhere. "While you were away" (ui/today/digest.ts): built once
// when a sim ends, from what the league holds since the mark the store took when it started. A scripted
// week: the user's results and their record, his stories (not his games, which are the results), the
// league's, new mail, a new injury, and the conference rank before and after; a short sim has no digest.
// Around the league: the night's other games tick along with the user's live game, each tipping at its
// home team's local time and read from its quarters, the ones that matter to the user first.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { runSim } from '../../state/simCore';
import { useStore } from '../../state/store';
import { clearLive, prepareLive } from '../../state/live';
import { addInbox, addNews, teamPlayers } from '../../core/league/helpers';
import { simDay } from '../../core/league/season';
import type { GameResult } from '../../core/types';
import { buildDigest, digestLine, digestMark } from '../today/digest';
import { broadcastTime, otherGames, scoreAt, tipLabel, tipMinute, type OtherGame } from '../live/scoreboard';
import { testLeague, toGameDay, userGames } from '../../state/__tests__/fixtures';

const st = () => useStore.getState();
afterEach(() => {
  st().setLeague(null);
  clearLive();
});

const otherGame = (home: number[], away: number[], offset = 0): OtherGame => ({
  res: {
    gid: 1,
    home: { tid: 0, quarters: home, pts: home.reduce((a, b) => a + b, 0) },
    away: { tid: 1, quarters: away, pts: away.reduce((a, b) => a + b, 0) },
  } as unknown as GameResult,
  offset,
});

describe('what happened elsewhere', () => {
  it('tells a sim in a digest the store keeps, and ticks the night’s other games along with the user’s', async () => {
    // a week told: results with the record, his stories, the league, mail, injuries and standings
    {
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
    }

    // a sim of a day, or a couple without two of his games, has none
    {
      const l = testLeague('short');
      const mark = digestMark(l);
      await runSim(l, { kind: 'days', n: 1 });
      expect(buildDigest(mark, l)).toBeNull();
    }

    // only what came after the mark counts
    {
      const l = testLeague('after');
      addNews(l, { kind: 'milestone', head: 'Old news', text: 'Before the sim.', tids: [l.userTid], pids: [], weight: 3 });
      const mark = digestMark(l);
      await runSim(l, { kind: 'days', n: 6 });
      const d = buildDigest(mark, l);
      expect(d?.stories.some((s) => s.head === 'Old news')).toBeFalsy();
    }

    // the store builds it when a long sim ends, opens it, and a short sim retires it
    {
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
      st().setLeague(null);
    }

    // breaks counted on the broadcast clock: two minutes between quarters, fifteen at the half
    expect(broadcastTime(0)).toBe(0);
    expect(broadcastTime(720)).toBe(720);
    expect(broadcastTime(721)).toBe(720 + 43 + 1);
    expect(broadcastTime(1441)).toBe(1440 + 43 + 320 + 1);

    // a game read from its quarters: not yet on, its periods and breaks in order, never above its final, and final at the end
    {
      const g = otherGame([30, 25, 28, 22], [20, 30, 26, 27]);
      expect(scoreAt(otherGame([30], [20], 30), 100).state).toBe('pre');
      const at = (t: number) => scoreAt(g, t);
      expect(at(360)).toMatchObject({ state: 'live', q: 1, clock: 360, score: [15, 10] });
      // tipped together, both are in the 2nd after the user's first quarter; one that tipped half a minute later is still at its break
      expect(at(721)).toMatchObject({ state: 'live', q: 2 });
      expect(scoreAt(otherGame([30, 25, 28, 22], [20, 30, 26, 27], 0.5), 721)).toMatchObject({ state: 'break', q: 1, score: [30, 20] });
      // the user's game at the start of the 3rd: the other one (same tip) too, past its halftime
      expect(at(1441).state).toBe('live');
      expect(at(1441).q).toBe(3);
      let last: [number, number] = [0, 0];
      for (let t = 0; t <= 2880; t += 30) {
        const s = at(t).score;
        expect(s[0] >= last[0] && s[1] >= last[1]).toBe(true);
        expect(s[0] <= 105 && s[1] <= 103).toBe(true);
        last = s;
      }
      expect(at(2880)).toMatchObject({ state: 'final', score: [105, 103] });
      // a game that started an hour earlier ends before the user's does
      expect(scoreAt(otherGame([30, 25, 28, 22], [20, 30, 26, 27], -60), 1800).state).toBe('final');
      // overtime, and the night over once the user's game is
      const ot = otherGame([25, 25, 25, 25, 10], [25, 25, 25, 25, 8]);
      expect(scoreAt(ot, 2700).state).toBe('live');
      expect(scoreAt(ot, 0, true)).toMatchObject({ state: 'final', ot: 1, score: [110, 108] });
    }

    // the night's other games listed once they're played, the ones that matter to the user first
    const l = testLeague('sb-night', 3);
    for (let i = 0; i < 25; i++) simDay(l);
    toGameDay(l);
    const lg = prepareLive(l)!;
    const list = otherGames(l, lg.game.gid, lg.game.day, l.userTid);
    const day = l.games.filter((g) => g.day === lg.game.day && g.season === l.season);
    expect(list.length).toBe(day.length);
    expect(list.every((o) => o.res.gid !== lg.game.gid)).toBe(true);
    const firstPlain = list.findIndex((o) => !o.why);
    if (firstPlain >= 0) expect(list.slice(firstPlain).every((o) => !o.why)).toBe(true);

    // each game tipped at its home team's local 7:00 or 7:30, in Eastern time (on the same league: tips
    // read only the franchise)
    const tid = (ab: string) => l.teams.find((t) => t.abbrev === ab)!.tid;
    expect(tipMinute(l, tid('BOS'), 2)).toBe(0);
    expect(tipMinute(l, tid('BOS'), 3)).toBe(30);
    expect(tipMinute(l, tid('SAS'), 2)).toBe(60);
    expect(tipMinute(l, tid('DEN'), 2)).toBe(120);
    expect(tipMinute(l, tid('LAL'), 3)).toBe(210);
    // a team god mode renames still plays in its city
    const lal = tid('LAL');
    l.teams[lal].abbrev = 'LAX';
    expect(tipMinute(l, lal, 3)).toBe(210);
    expect(tipLabel(0)).toBe('7:00 PM');
    expect(tipLabel(210)).toBe('10:30 PM');
  }, 180_000);
});
