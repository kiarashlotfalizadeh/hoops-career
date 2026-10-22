// The Play menu through a whole season and offseason: every stop offers a way forward, and taking
// it moves the league on (no dead ends, no buttons that do nothing). A backup made mid-draft or in
// free agency along the way plays on after import.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { useStore, type TaskOp } from '../store';
import { importLeague } from '../backup';
import { flowActions, opponentText, type FlowAction } from '../../ui/flow';
import { faAdvance, finishDraftPhase, newSeason, simDay } from '../../core/league/season';
import { nextPick } from '../../core/league/draft';
import { curTeamSeason, fmtDate } from '../../core/league/helpers';
import { userGameOnDay } from '../../core/league/games';
import { billingFor } from '../../core/analysis/gameStory';
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

/** What Export writes, read back the way Import reads it. */
async function roundTrip(l: League) {
  const back = await importLeague(new File([JSON.stringify(l)], 'backup.json', { type: 'application/json' }));
  expect(back).toEqual(JSON.parse(JSON.stringify({ ...l, id: back.id, name: back.name })));
  return back;
}

afterEach(() => st().setLeague(null));

describe('Play menu', () => {
  it('always has a way forward, from opening night to the next preseason, and names what each stop is', { timeout: 300_000 }, async () => {
    // free agency past day 30 offers the new season instead of days that never come
    const fa = testLeague('fa');
    fa.phase = 'freeAgency';
    fa.faDay = 12;
    expect(flowActions(fa).map((a) => a.id)).toEqual(['fas', 'faday', 'faweek', 'new']);
    expect(flowActions(fa)[0]).toMatchObject({ primary: true, sub: 'Day 13 of 30' });
    // day 30 is the last: no day 31 to advance to (faDay counts from 0 on opening day)
    for (const day of [29, 30]) {
      fa.faDay = day;
      const a = flowActions(fa);
      expect(a.map((x) => x.id)).toEqual(['fas', 'new']);
      expect(a.find((x) => x.primary)?.cmd).toBe('newSeason');
      expect(a[0].sub).toBe('Day 30 of 30: the market is winding down.');
    }

    // "Sim to next game" names the day of the next game, not today, and the opponent
    const nx = testLeague('next');
    while (flowActions(nx)[0].id !== 'next') nx.day++;
    const next = nx.schedule.filter((g) => !g.played && g.day > nx.day && (g.home === nx.userTid || g.away === nx.userTid)).sort((a, b) => a.day - b.day)[0];
    const nextHome = next.home === nx.userTid;
    // (a billed game leads with its billing: "Rivalry · Fri, Oct 23 · @ BOS (0-0)")
    const nextTag = billingFor(nx, next)?.tag;
    expect(flowActions(nx)[0].sub).toBe(
      `${nextTag ? `${nextTag} · ` : ''}${fmtDate(nx.season, next.day, { weekday: 'short', month: 'short', day: 'numeric' })} · ${nextHome ? 'vs' : '@'} ${nx.teams[nextHome ? next.away : next.home].abbrev} (0-0)`,
    );

    // "Watch & coach live" names tonight's opponent and its record; in the playoffs, the series
    const tn = testLeague('tonight');
    while (flowActions(tn)[0].id !== 'live') simDay(tn);
    const g = userGameOnDay(tn, tn.day)!;
    const home = g.home === tn.userTid;
    const opp = home ? g.away : g.home;
    const ts = curTeamSeason(tn, opp);
    const tag = billingFor(tn, g)?.tag;
    const vs = `${home ? 'vs' : '@'} ${tn.teams[opp].abbrev} (${ts.won}-${ts.lost})`;
    expect(flowActions(tn)[0]).toMatchObject({ label: 'Watch & coach live', sub: tag ? `${tag} · ${vs}` : `${vs} · today` });
    // a playoff game shows the series from the user's side
    tn.playoffs = [{ id: 'E1-0', round: 1, conf: 'E', high: opp, low: tn.userTid, highSeed: 1, lowSeed: 8, highWins: 2, lowWins: 1 }];
    g.type = 'playoffs';
    g.seriesId = 'E1-0';
    expect(opponentText(tn, g)).toBe(`${home ? 'vs' : '@'} ${tn.teams[opp].abbrev} (series 1-2)`);

    // once your team is out of the postseason: "Sim to end of playoffs" (UI1-17)
    const out = testLeague('out');
    const winner = (out.userTid + 1) % out.teams.length;
    out.phase = 'playoffs';
    out.day = out.regularSeasonDays + 20;
    out.playoffs = [{ id: 'E1-1', round: 1, conf: out.teams[out.userTid].conf, high: winner, low: out.userTid, highSeed: 1, lowSeed: 8, highWins: 4, lowWins: 1, winner }];
    curTeamSeason(out, out.userTid).playoffRound = 1;
    const po = flowActions(out);
    expect(po[0]).toMatchObject({ label: 'Sim to end of playoffs', primary: true, sim: { kind: 'endPlayoffs' } });
    expect(po.some((x) => x.id === 'next')).toBe(false);
    out.phase = 'playin';
    curTeamSeason(out, out.userTid).playoffRound = -1;
    expect(flowActions(out)[0].sim).toEqual({ kind: 'endPlayoffs' });
    // a top-six seed waiting out the play-in still has a next game
    curTeamSeason(out, out.userTid).playoffRound = 1;
    expect(flowActions(out)[0].id).toBe('next');

    // a fired coach finds a new job before the league moves on, and can't trade for the old team
    const fired = testLeague('fired');
    fired.phase = 'draftLottery';
    fired.fired = true;
    const acts = flowActions(fired);
    expect(acts[0]).toMatchObject({ id: 'agenda', label: 'Find a new job', primary: true, to: '/office/career' });
    expect(acts.filter((a) => a.primary)).toHaveLength(1);
    // the draft (and every other step forward) waits, saying why
    expect(acts.find((a) => a.cmd === 'startDraft')?.disabled).toMatch(/new job/);
    const other = (fired.userTid + 1) % 30;
    const offer = { a: { tid: fired.userTid, pids: [], dpids: [] }, b: { tid: other, pids: [], dpids: [] } };
    expect(validateTrade(fired, offer).some((e) => /fired/.test(e))).toBe(true);
    takeOverTeam(fired, other);
    expect(flowActions(fired)[0]).toMatchObject({ cmd: 'startDraft', primary: true });
    expect(flowActions(fired)[0].disabled).toBeUndefined();
    expect(validateTrade(fired, { a: { ...offer.b }, b: { ...offer.a } }).some((e) => /fired/.test(e))).toBe(false);

    // the whole season and offseason, through the menu
    st().setLeague(testLeague('flow'));
    // each sim and phase change hands back a new league object
    const lg = () => st().league!;
    const season = lg().season;
    const seen = new Set<string>();
    const backedUp = new Set<string>();
    for (let i = 0; i < 200 && !(lg().season > season && lg().phase === 'preseason'); i++) {
      const l = lg();
      // a league exported mid-draft or in free agency plays on after import
      if (l.phase === 'draft' && !backedUp.has('draft')) {
        backedUp.add('draft');
        const draft = await roundTrip(l);
        expect(finishDraftPhase(draft)).toBe(true);
        expect(draft.phase).toBe('resign');
        expect(nextPick(draft)).toBeUndefined();
      }
      if (l.phase === 'freeAgency' && !backedUp.has('fa')) {
        backedUp.add('fa');
        const c = structuredClone(l);
        faAdvance(c, 3);
        const back = await roundTrip(c);
        faAdvance(back, 7);
        expect(back.faDay).toBe(10);
        expect(newSeason(back)).toBe(true);
        expect(back.phase).toBe('preseason');
      }
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
    expect([...backedUp]).toEqual(['draft', 'fa']);
  });
});
