// The Play menu through a whole season and offseason: every stop offers a way forward, and taking
// it moves the league on (no dead ends, no buttons that do nothing).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { useStore, type TaskOp } from '../store';
import { flowActions, opponentText, type FlowAction } from '../../ui/flow';
import { simDay } from '../../core/league/season';
import { curTeamSeason, fmtDate } from '../../core/league/helpers';
import { userGameOnDay } from '../../core/league/games';
import { takeOverTeam } from '../../core/league/owner';
import { validateTrade } from '../../core/league/trades';
import type { League } from '../../core/types';
import { testLeague } from './fixtures';

const st = () => useStore.getState();

/** What useFlowRunner does for each command, without the router. */
const COMMANDS: Record<string, TaskOp> = {
  startRegular: { kind: 'startRegular' },
  startDraft: { kind: 'startDraft' },
  finishDraft: { kind: 'finishDraft' },
  startFA: { kind: 'startFA' },
  faDay: { kind: 'faAdvance', days: 1 },
  faWeek: { kind: 'faAdvance', days: 7 },
  newSeason: { kind: 'newSeason' },
};

async function run(a: FlowAction) {
  if (a.sim) await st().simulate(a.sim);
  else if (a.cmd === 'quickGame') await st().simulate({ kind: 'days', n: 1 });
  else if (a.cmd) expect(await st().task(a.label, COMMANDS[a.cmd!])).not.toBeNull();
}

const where = (l: League) => `${l.season} ${l.phase} d${l.day} fa${l.faDay} ${l.games.length}`;

afterEach(() => st().setLeague(null));

describe('Play menu', () => {
  it('always has a way forward, from opening night to the next preseason', { timeout: 300_000 }, async () => {
    st().setLeague(testLeague('flow'));
    // each sim and phase change hands back a new league object
    const lg = () => st().league!;
    const season = lg().season;
    const seen = new Set<string>();
    for (let i = 0; i < 200 && !(lg().season > season && lg().phase === 'preseason'); i++) {
      const l = lg();
      const acts = flowActions(l);
      const primary = acts.find((a) => a.primary);
      expect(primary, where(l)).toBeDefined();
      expect(primary!.disabled, where(l)).toBeUndefined();
      // take the fastest action that plays on: a route (draft board, re-sign) or live game is the player's to open
      const pick =
        acts.find((a) => a.id === 'endreg') ??
        acts.find((a) => a.id === 'quick') ??
        (primary!.sim || (primary!.cmd && primary!.cmd !== 'watchLive') ? primary! : acts.find((a) => a.sim || (a.cmd && a.cmd !== 'watchLive' && a.cmd !== 'faDay')));
      expect(pick, where(l)).toBeDefined();
      seen.add(`${l.phase}: ${pick!.label}`);
      const before = where(l);
      await run(pick!);
      expect(where(lg()), `"${pick!.label}" did nothing`).not.toBe(before);
    }
    expect(lg().season).toBe(season + 1);
    expect(lg().phase).toBe('preseason');
    expect([...seen]).toEqual(expect.arrayContaining(['regular: Sim to end of regular season', 'draftLottery: Go to the draft', 'resign: Open free agency']));
  });

  it('free agency past day 30 offers the new season instead of days that never come', () => {
    const l = testLeague('fa');
    l.phase = 'freeAgency';
    l.faDay = 12;
    expect(flowActions(l).map((a) => a.id)).toEqual(['fas', 'faday', 'faweek', 'new']);
    expect(flowActions(l)[0]).toMatchObject({ primary: true, sub: 'Day 13 of 30' });
    // day 30 is the last: no day 31 to advance to (faDay counts from 0 on opening day)
    for (const day of [29, 30]) {
      l.faDay = day;
      const a = flowActions(l);
      expect(a.map((x) => x.id)).toEqual(['fas', 'new']);
      expect(a.find((x) => x.primary)?.cmd).toBe('newSeason');
      expect(a[0].sub).toBe('Day 30 of 30: the market is winding down.');
    }
  });

  it('"Sim to next game" names the day of the next game, not today, and the opponent', () => {
    const l = testLeague('next');
    while (flowActions(l)[0].id !== 'next') l.day++;
    const next = l.schedule.filter((g) => !g.played && g.day > l.day && (g.home === l.userTid || g.away === l.userTid)).sort((a, b) => a.day - b.day)[0];
    const home = next.home === l.userTid;
    const opp = l.teams[home ? next.away : next.home].abbrev;
    expect(flowActions(l)[0].sub).toBe(`${fmtDate(l.season, next.day, { weekday: 'short', month: 'short', day: 'numeric' })} · ${home ? 'vs' : '@'} ${opp} (0-0)`);
  });

  it('"Watch & coach live" names tonight\'s opponent and its record; in the playoffs, the series', () => {
    const l = testLeague('tonight');
    while (flowActions(l)[0].id !== 'live') simDay(l);
    const g = userGameOnDay(l, l.day)!;
    const home = g.home === l.userTid;
    const opp = home ? g.away : g.home;
    const ts = curTeamSeason(l, opp);
    expect(flowActions(l)[0]).toMatchObject({ label: 'Watch & coach live', sub: `${home ? 'vs' : '@'} ${l.teams[opp].abbrev} (${ts.won}-${ts.lost}) · today` });
    // a playoff game shows the series from the user's side
    l.playoffs = [{ id: 'E1-0', round: 1, conf: 'E', high: opp, low: l.userTid, highSeed: 1, lowSeed: 8, highWins: 2, lowWins: 1 }];
    g.type = 'playoffs';
    g.seriesId = 'E1-0';
    expect(opponentText(l, g)).toBe(`${home ? 'vs' : '@'} ${l.teams[opp].abbrev} (series 1-2)`);
  });

  it("a fired coach finds a new job before the league moves on, and can't trade for the old team", () => {
    const l = testLeague('fired');
    l.phase = 'draftLottery';
    l.fired = true;
    const acts = flowActions(l);
    expect(acts[0]).toMatchObject({ id: 'job', primary: true, to: '/settings?sheet=switch' });
    expect(acts.filter((a) => a.primary)).toHaveLength(1);
    // the draft (and every other step forward) waits, saying why
    expect(acts.find((a) => a.cmd === 'startDraft')?.disabled).toMatch(/fired/);
    const other = (l.userTid + 1) % 30;
    const offer = { a: { tid: l.userTid, pids: [], dpids: [] }, b: { tid: other, pids: [], dpids: [] } };
    expect(validateTrade(l, offer).some((e) => /fired/.test(e))).toBe(true);
    takeOverTeam(l, other);
    expect(flowActions(l)[0]).toMatchObject({ cmd: 'startDraft', primary: true });
    expect(flowActions(l)[0].disabled).toBeUndefined();
    expect(validateTrade(l, { a: { ...offer.b }, b: { ...offer.a } }).some((e) => /fired/.test(e))).toBe(false);
  });
});
