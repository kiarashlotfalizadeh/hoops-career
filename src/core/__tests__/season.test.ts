import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { finishDraftPhase, newSeason, simDay, startDraft, startFreeAgency, startRegularSeason } from '../league/season';
import { curTeamSeason, teamPlayers } from '../league/helpers';
import { evaluateTrade, validateTrade } from '../league/trades';
import { makeItWork } from '../league/tradeHelp';
import { CAP } from '../constants';

describe('full season', () => {
  it('plays a season, crowns a champion, drafts and rolls over', () => {
    const league = createLeague({ name: 't', userTid: 3, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 21 });
    const n = teamPlayers(league, 3).length;
    if (n > CAP.rosterMax) for (const p of teamPlayers(league, 3).slice(CAP.rosterMax)) p.tid = -1;
    expect(startRegularSeason(league)).toEqual([]);
    let guard = 0;
    while (['regular', 'playin', 'playoffs'].includes(league.phase) && guard++ < 500) simDay(league);
    expect(league.phase).toBe('draftLottery');
    const wins = league.teams.reduce((a, t) => a + curTeamSeason(league, t.tid).won, 0);
    expect(wins).toBe(1230);
    const aw = league.awards.find((a) => a.season === league.season)!;
    expect(aw.champion).toBeDefined();
    expect(aw.mvp).toBeDefined();
    expect(aw.allNba.flat().length).toBe(15);
    startDraft(league);
    finishDraftPhase(league);
    const rookies = Object.values(league.players).filter((p) => p.draft.year === league.season && p.draft.round > 0);
    expect(rookies.length).toBe(60);
    startFreeAgency(league);
    newSeason(league);
    expect(league.season).toBe(2028);
    // 80 games per team up front; the NBA Cup knockout window adds the last two per team
    expect(league.schedule.length).toBe(1200);
    expect(league.cup?.season).toBe(2028);
    for (const t of league.teams) if (t.tid !== league.userTid) expect(teamPlayers(league, t.tid).length).toBeGreaterThanOrEqual(CAP.rosterMin);
  }, 180_000);
});

describe('trades', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 4 });
  it('rejects lopsided deals and can find a fair version', () => {
    const mine = teamPlayers(league, 0).sort((a, b) => a.ovr - b.ovr);
    const theirs = teamPlayers(league, 1).sort((a, b) => b.ovr - a.ovr);
    const offer = { a: { tid: 0, pids: [mine[0].pid], dpids: [] }, b: { tid: 1, pids: [theirs[0].pid], dpids: [] } };
    const ev = evaluateTrade(league, offer);
    expect(ev.accept).toBe(false);
    const fixed = makeItWork(league, offer).offer;
    if (fixed) expect(evaluateTrade(league, fixed).accept).toBe(true);
  });
  it('enforces roster limits', () => {
    const mine = teamPlayers(league, 0);
    const theirs = teamPlayers(league, 1).slice(0, 3);
    const offer = { a: { tid: 0, pids: [], dpids: [] }, b: { tid: 1, pids: theirs.map((p) => p.pid), dpids: [] } };
    // 15 is the in-season limit (the offseason allows 21)
    league.phase = 'regular';
    if (mine.length + 3 > CAP.rosterMax) expect(validateTrade(league, offer).some((e) => e.includes('max'))).toBe(true);
    league.phase = 'preseason';
  });
});
