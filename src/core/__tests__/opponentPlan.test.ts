// AI coaches game-plan against the user's team: never on easy, about half the games on normal,
// every game on hard; only in games against the user; the same plan for a game whatever is asked
// when (preview, Lab, live or simmed game, other games that day); items that answer the user's
// measured strengths; and the plan kept with the user's game results only.
import { describe, expect, it } from 'vitest';
import { testLeague, toGameDay, userGames } from '../../state/__tests__/fixtures';
import { prepareLive } from '../../state/live';
import { aiGamePlan, nextMeeting, oppPlanChance, oppPlanIn, preparesPlan, withOppPlan } from '../ai/opponentPlan';
import { counterCandidates } from '../ai/advisor';
import { buildSimInput, ensureRotation, playGame, userGameOnDay } from '../league/games';
import { matchupPreview } from '../analysis/preview';
import { simDay } from '../league/season';
import type { League, ScheduledGame } from '../types';

/** A real-league season `days` in (on easy, so far no plans), then at `difficulty`. */
function leagueAt(difficulty: League['settings']['difficulty'], days = 12): League {
  const l = testLeague();
  for (let i = 0; i < days; i++) simDay(l);
  l.settings.difficulty = difficulty;
  return l;
}

const aiTeams = (l: League) => l.teams.map((t) => t.tid).filter((tid) => tid !== l.userTid);
const oppOf = (l: League, g: ScheduledGame) => (g.home === l.userTid ? g.away : g.home);

describe('AI game plans against the user', () => {
  it('never on easy, about half the games for an average coach on normal, every game on hard', () => {
    const l = leagueAt('easy');
    const tid = aiTeams(l)[0];
    expect(oppPlanChance(l, tid)).toBe(0);
    for (const opp of aiTeams(l)) {
      const g = nextMeeting(l, opp);
      if (g) expect(aiGamePlan(l, opp, l.userTid, g)).toBeNull();
    }
    l.settings.difficulty = 'hard';
    expect(oppPlanChance(l, tid)).toBe(1);
    l.settings.difficulty = 'normal';
    l.teams[tid].coach.tactics = 60;
    expect(oppPlanChance(l, tid)).toBeCloseTo(0.5, 9);
    // the better the coach, the more often: over many games the share follows the chance
    const share = (rating: number) => {
      l.teams[tid].coach.tactics = rating;
      let n = 0;
      for (let gid = 0; gid < 2000; gid++) if (preparesPlan(l, tid, gid)) n++;
      return n / 2000;
    };
    const avg = share(60);
    expect(avg).toBeGreaterThan(0.45);
    expect(avg).toBeLessThan(0.55);
    expect(share(85)).toBeGreaterThan(share(35));
  });

  it('is the same plan every time it is asked for a game, and draws nothing from the league', () => {
    const l = leagueAt('hard');
    const rng = l.rng;
    let planned = 0;
    for (const opp of aiTeams(l)) {
      const g = nextMeeting(l, opp);
      if (!g) continue;
      const a = aiGamePlan(l, opp, l.userTid, g);
      expect(a).not.toBeNull();
      expect(aiGamePlan(structuredClone(l), opp, l.userTid, g)).toEqual(a);
      expect(a!.items.length).toBeGreaterThan(0);
      expect(a!.items.length).toBeLessThanOrEqual(2);
      // one item per group, and each changes something in their usual tactics
      expect(new Set(a!.items.map((x) => x.group)).size).toBe(a!.items.length);
      expect(withOppPlan(l.teams[opp].tactics, a)).not.toEqual(l.teams[opp].tactics);
      planned++;
    }
    expect(planned).toBeGreaterThan(20);
    expect(l.rng).toBe(rng);
  });

  it('never applies in games between AI teams', () => {
    const l = leagueAt('hard');
    const g = l.schedule.find((x) => !x.played && x.home !== l.userTid && x.away !== l.userTid)!;
    for (const [tid, opp] of [
      [g.home, g.away],
      [g.away, g.home],
    ]) {
      expect(aiGamePlan(l, tid, opp, g)).toBeNull();
      const input = buildSimInput(l, tid, g.day, g.type, opp, g);
      expect(input.team).toBe(l.teams[tid]);
    }
    // a day of simmed games keeps a plan only on the user's game
    toGameDay(l);
    const day = l.day;
    simDay(l);
    const played = l.games.filter((x) => x.day === day);
    expect(played.length).toBeGreaterThan(1);
    for (const r of played) {
      const user = r.home.tid === l.userTid || r.away.tid === l.userTid;
      if (user) expect(r.oppPlan?.length).toBeGreaterThan(0);
      else expect(r.oppPlan).toBeUndefined();
    }
  });

  it('on hard every game against the user brings a plan, kept with the result', () => {
    const l = leagueAt('hard', 6);
    const before = userGames(l).length;
    for (let i = 0; i < 12; i++) simDay(l);
    const after = userGames(l).slice(before);
    expect(after.length).toBeGreaterThan(3);
    for (const r of after) {
      expect(r.oppPlan?.length).toBeGreaterThan(0);
      expect(r.oppPlan!.length).toBeLessThanOrEqual(2);
    }
    // and none on easy
    l.settings.difficulty = 'easy';
    const n = userGames(l).length;
    for (let i = 0; i < 6; i++) simDay(l);
    for (const r of userGames(l).slice(n)) expect(r.oppPlan).toBeUndefined();
  });

  it("answers the user's measured strengths: a hot pick-and-roll ball handler gets a coverage change", () => {
    const l = leagueAt('hard');
    // the user's stored games show his handlers scoring 1.5 points per pick-and-roll
    for (const r of userGames(l)) {
      const box = r.home.tid === l.userTid ? r.home : r.away;
      box.playTypes = { ...box.playTypes, pnrBH: { poss: 60, pts: 90 } };
    }
    const g = nextMeeting(
      l,
      aiTeams(l).find((tid) => nextMeeting(l, tid))!,
    )!;
    const opp = oppOf(l, g);
    const d = l.teams[opp].tactics.defense;
    d.scheme = 'man';
    d.pnr = 'drop';
    const plan = aiGamePlan(l, opp, l.userTid, g)!;
    expect(['cov-hedge', 'cov-ice']).toContain(plan.items[0].id);
    expect(plan.items[0].why).toMatch(/ball handlers/);
    const tactics = buildSimInput(l, opp, g.day, g.type, l.userTid, g).team.tactics;
    expect(tactics.defense.pnr).not.toBe('drop');
    // a zone stays a zone: no coverage change from one
    d.scheme = 'zone23';
    expect(aiGamePlan(l, opp, l.userTid, g)!.items.some((x) => x.group === 'coverage')).toBe(false);
  });

  it("leaves the user's counters reading their usual tactics", () => {
    const l = leagueAt('easy');
    toGameDay(l);
    const opp = oppOf(l, userGameOnDay(l, l.day)!);
    const casual = counterCandidates(l, l.userTid, opp);
    l.settings.difficulty = 'hard';
    expect(counterCandidates(l, l.userTid, opp)).toEqual(casual);
  });

  it('the preview, the Lab and the real game play the same opponent tactics, whatever else is played that day', () => {
    const l = leagueAt('hard');
    toGameDay(l);
    const g = userGameOnDay(l, l.day)!;
    const opp = oppOf(l, g);
    ensureRotation(l, g.home);
    ensureRotation(l, g.away);
    const plan = aiGamePlan(l, opp, l.userTid, g)!;
    expect(plan).not.toBeNull();
    // the preview lists it and projects with it, the Lab (from today, for the next meeting) plays it
    const pv = matchupPreview(l, g.gid)!;
    expect(pv.oppPlan).toEqual(plan.items);
    const preview = buildSimInput(l, opp, g.day, g.type, l.userTid, g).team.tactics;
    const lab = buildSimInput(l, opp, l.day, 'regular', l.userTid, nextMeeting(l, opp)).team.tactics;
    expect(lab).toEqual(preview);
    expect(preview).toEqual(withOppPlan(l.teams[opp].tactics, plan));
    // the live game sims the day's other games first: the plan it tips off with is the same
    const lg = prepareLive(l)!;
    expect(l.games.filter((x) => x.day === l.day).length).toBeGreaterThan(0);
    expect(oppPlanIn(lg.sim, (1 - lg.userSide) as 0 | 1)).toEqual(plan);
    expect(lg.sim.baseTactics((1 - lg.userSide) as 0 | 1)).toEqual(preview);
    // (the night's other games never count: even absurd numbers in them change nothing)
    for (const r of l.games.filter((x) => x.day === l.day)) for (const b of [r.home, r.away]) b.playTypes = { ...b.playTypes, pnrBH: { poss: 500, pts: 0 } };
    expect(aiGamePlan(l, opp, l.userTid, g)).toEqual(plan);
    const res = lg.commit(l);
    expect(res.oppPlan).toEqual(plan.items.map((x) => x.text));
    expect(l.games.find((x) => x.gid === g.gid)!.oppPlan).toEqual(res.oppPlan);
  });

  it('a simmed game keeps the plan it was played with', () => {
    const l = leagueAt('hard');
    toGameDay(l);
    const g = userGameOnDay(l, l.day)!;
    ensureRotation(l, g.home);
    ensureRotation(l, g.away);
    const plan = aiGamePlan(l, oppOf(l, g), l.userTid, g)!;
    const res = playGame(l, g);
    expect(res.oppPlan).toEqual(plan.items.map((x) => x.text));
  });
});
