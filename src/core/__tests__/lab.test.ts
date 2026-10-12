import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { applyPatch, pairedDelta, runLab, type TacticsPatch } from '../ai/lab';
import { counterCandidates, liveCounter, scoutTeam, teamAlerts } from '../ai/advisor';
import { fitRoster, offPresetFit, rosterProfile } from '../ai/coachAI';
import { buildGameReport, impactAdvice } from '../analysis/gameReport';
import { playGame } from '../league/games';
import { FINISH_LABEL, type FinishType } from '../sim/log';
import { OFF_PRESETS, cloneTactics } from '../sim/tactics';
import type { GameResult, Tactics } from '../types';

describe('tactics lab & reports', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
  const side = (tid: number) => ({ team: league.teams[tid], players: teamPlayers(league, tid) });
  it('is deterministic and paired', () => {
    const a = runLab({ a: side(0), b: side(1), games: 6, seed: 42 });
    const b = runLab({ a: side(0), b: side(1), games: 6, seed: 42 });
    expect(pairedDelta(a, b)).toEqual({ delta: 0, se: 0 });
    const c = runLab({ a: side(0), b: side(1), games: 6, seed: 42, patch: { defense: { pnr: 'blitz' } } });
    expect(c.margins.length).toBe(6);
  });
  it('builds a post-game report for the user team', () => {
    const g = league.schedule.find((x) => x.home === 0 || x.away === 0)!;
    league.phase = 'regular';
    const res = playGame(league, g);
    const rep = buildGameReport(league, res)!;
    expect(rep.headline.length).toBeGreaterThan(10);
    expect(rep.playTypes.length).toBeGreaterThan(3);
    expect(rep.grades.length).toBeGreaterThan(4);
  });
  it("headlines a factor that went the winner's way, with one colon, and no nail-biter in overtime", () => {
    league.phase = 'regular';
    const g = playGame(
      league,
      league.schedule.find((x) => !x.played && (x.home === 0 || x.away === 0))!,
    );
    const side = g.home.tid === 0 ? 'home' : 'away';
    const oppSide = side === 'home' ? 'away' : 'home';
    const [me, them]: (0 | 1)[] = side === 'home' ? [0, 1] : [1, 0];
    // a one-point overtime loss where the biggest effect by far went the user's way
    const res: GameResult = {
      ...g,
      ot: 1,
      [side]: { ...g[side], pts: 120 },
      [oppSide]: { ...g[oppSide], pts: 121 },
      impacts: [
        { key: 'drop_pullup:o', t: me, count: 30, pts: 40, players: {} },
        { key: 'help_kick:o', t: them, count: 1, pts: 0.9, players: {} },
      ],
    };
    const rep = buildGameReport(league, res)!;
    expect(rep.userWon).toBe(false);
    expect(rep.factors[0].pts).toBeGreaterThan(0);
    expect(rep.headline).toMatch(/^The .+ fell to the .+ 121-120 in OT\. Biggest factor: /);
    expect(rep.headline).not.toMatch(/pull-up|nail-biter/);
    expect(rep.headline.split(':')).toHaveLength(2);
    expect(rep.factors.find((f) => f.title.includes('kick-out'))!.detail).toMatch(/over 1 play\.$/);
    // an opposing star's big night suggests a Star plan only to a team without one
    const star: GameResult = { ...res, [oppSide]: { ...res[oppSide], players: res[oppSide].players.map((p, i) => (i === 0 ? { ...p, pts: 45 } : p)) } };
    const t = league.teams[0].tactics;
    expect(buildGameReport(league, star)!.factors.find((f) => f.category === 'stars' && f.pts < 0)!.advice).toMatch(/Star plan \(Defense\)/);
    league.teams[0].tactics = applyPatch(t, { defense: { starPlan: 'deny' } });
    expect(buildGameReport(league, star)!.factors.find((f) => f.category === 'stars' && f.pts < 0)!.advice).toBeUndefined();
    league.teams[0].tactics = t;
  });
  it('only gives advice the team still needs: no "try Hedge" for a team already hedging', () => {
    const t = league.teams[0].tactics;
    const drop = applyPatch(t, { defense: { scheme: 'man', pnr: 'drop', starPlan: 'none' } });
    const hedge = applyPatch(t, { defense: { scheme: 'man', pnr: 'hedge', starPlan: 'none' } });
    expect(impactAdvice('drop_pullup:o', drop)).toMatch(/Hedge/);
    expect(impactAdvice('drop_pullup:o', hedge)).toBeUndefined();
    expect(impactAdvice('blitz_4v3:o', hedge)).toBeUndefined();
    expect(impactAdvice('blitz_4v3:o', applyPatch(hedge, { defense: { starPlan: 'double' } }))).toMatch(/Star plan/);
    expect(impactAdvice('fatigue:d', hedge)).toMatch(/sooner/);
    // in the post-game report, against the user's current plan
    league.phase = 'regular';
    const g = playGame(
      league,
      league.schedule.find((x) => !x.played && (x.home === 0 || x.away === 0))!,
    );
    const opp: 0 | 1 = g.home.tid === 0 ? 1 : 0;
    const res = { ...g, impacts: [{ key: 'drop_pullup:o', t: opp, count: 12, pts: 3.2, players: {} }] };
    league.teams[0].tactics = hedge;
    expect(buildGameReport(league, res)!.factors.find((f) => f.title.includes('pull-up'))!.advice).toBeUndefined();
    league.teams[0].tactics = drop;
    expect(buildGameReport(league, res)!.factors.find((f) => f.title.includes('pull-up'))!.advice).toMatch(/Hedge/);
    league.teams[0].tactics = t;
  });
  it("quotes playbook fits on the Tactics screen's scale: 100 for the best fit, 45 for the worst", () => {
    const team = league.teams[0];
    const saved = team.tactics;
    const fits = offPresetFit(rosterProfile(fitRoster(teamPlayers(league, 0))));
    const [best, worst] = [Object.keys(fits).sort((a, b) => fits[b] - fits[a])[0], Object.keys(fits).sort((a, b) => fits[a] - fits[b])[0]];
    expect(fits[best] - fits[worst]).toBeGreaterThan(12);
    team.tactics = { ...applyPatch(saved), offPreset: worst, manual: true };
    const alert = teamAlerts(league, 0).find((a) => a.id === 'off-fit')!;
    expect(alert.title).toBe(`Offense may not fit: try ${OFF_PRESETS.find((p) => p.id === best)!.name}`);
    expect(alert.body).toMatch(/\(fit 100 vs 45\)\.$/);
    team.tactics = saved;
  });
  it('warns about a slow big only where the engine hunts him: on switched ball screens, not off-ball switches', () => {
    const team = league.teams[1];
    const saved = team.tactics;
    const big = league.players[team.rotation.order[0]];
    const r = { ...big.ratings };
    big.ratings.hgt = 70;
    big.ratings.spd = 30;
    const ids = () => teamAlerts(league, 1).map((a) => a.id);
    const slowWeakness = () => scoutTeam(league, 1).weaknesses.some((w) => w.startsWith('Switching with a slow big'));
    // drop coverage that switches off the ball: "use Drop or Ice" would be advice it already follows
    team.tactics = applyPatch(saved, { defense: { scheme: 'man', pnr: 'drop', switchOffBall: true } });
    expect(ids()).not.toContain('switch-slow');
    expect(slowWeakness()).toBe(false);
    expect(counterCandidates(league, 0, 1).find((c) => c.id === 'vs-switch')!.why).toMatch(/^They switch off-ball screens;/);
    team.tactics = applyPatch(saved, { defense: { scheme: 'man', pnr: 'switch', switchOffBall: true } });
    expect(teamAlerts(league, 1).find((a) => a.id === 'switch-slow')!.body).toContain(big.lastName);
    expect(slowWeakness()).toBe(true);
    expect(counterCandidates(league, 0, 1).find((c) => c.id === 'vs-switch')!.why).toMatch(/^They switch everything;/);
    big.ratings = r;
    team.tactics = saved;
  });
  it("judges the five healthy starters and counts an injured player's minutes, as the engine does", () => {
    const team = league.teams[1];
    const [tactics, rotation] = [team.tactics, team.rotation];
    const big = league.players[team.rotation.order[0]];
    const r = { ...big.ratings };
    big.ratings.hgt = 70;
    big.ratings.spd = 30;
    team.tactics = applyPatch(tactics, { defense: { scheme: 'man', pnr: 'switch' } });
    // a custom rotation whose targets add up to 240, the slow big starting
    const minutes = Object.fromEntries(rotation.order.map((pid, i) => [pid, [36, 34, 33, 31, 29, 24, 20, 16, 12, 5][i] ?? 0]));
    team.rotation = { ...rotation, minutes, manual: true };
    const ids = () => teamAlerts(league, 1).map((a) => a.id);
    expect(ids()).toContain('switch-slow');
    expect(ids()).not.toContain('min-total');
    // out injured, he neither starts nor takes his 36 minutes away from the total
    big.injury = { type: 'Sprained ankle', gamesRemaining: 4, gamesTotal: 4, severity: 'minor' };
    expect(ids()).not.toContain('switch-slow');
    expect(ids()).not.toContain('min-total');
    big.injury = null;
    big.ratings = r;
    [team.tactics, team.rotation] = [tactics, rotation];
  });
  it('only tells you to rest a worn-down player on back-to-backs when he does not already', () => {
    const rotation = league.teams[2].rotation;
    const p = teamPlayers(league, 2)[0];
    const wear = p.wear;
    p.wear = 70;
    const body = () => teamAlerts(league, 2).find((a) => a.id === `wear-${p.pid}`)!.body;
    league.teams[2].rotation = { ...rotation, restB2B: [], caps: {} };
    expect(body()).toMatch(/^Season wear 70\. .* Rest him on back-to-backs \(Rotation\)\.$/);
    league.teams[2].rotation = { ...rotation, restB2B: [p.pid], caps: {} };
    expect(body()).toMatch(/already rests on back-to-backs: a hard minute cap \(Rotation\)/);
    league.teams[2].rotation = { ...rotation, restB2B: [p.pid], caps: { [p.pid]: 28 } };
    expect(body()).toMatch(/lowering his 28-minute cap \(Rotation\)/);
    league.teams[2].rotation = rotation;
    p.wear = wear;
  });
  it("only offers a live game's quick counter when it changes something, and never pulls a slider back", () => {
    const at = (patch: TacticsPatch) => applyPatch(league.teams[0].tactics, patch);
    const after = (ft: FinishType, t: Tactics) => {
      const x = cloneTactics(t);
      liveCounter(ft, t)!.apply(x);
      return x;
    };
    // already getting back and off the glass: "Sprint back" would do nothing
    expect(liveCounter('transition', at({ defense: { getBack: 85 }, offense: { crashBoards: 30 } }))).toBeUndefined();
    expect(liveCounter('transition', at({ defense: { getBack: 95 }, offense: { crashBoards: 10 } }))).toBeUndefined();
    // still crashing: it pulls back from the glass and keeps the faster transition defense
    const crashing = after('transition', at({ defense: { getBack: 95 }, offense: { crashBoards: 60 } }));
    expect([crashing.defense.getBack, crashing.offense.crashBoards]).toEqual([95, 30]);
    // already doubling the post: no "Double the post" that would lower help from 90 to 80
    expect(liveCounter('post', at({ defense: { help: 80 } }))).toBeUndefined();
    expect(liveCounter('post', at({ defense: { help: 90 } }))).toBeUndefined();
    expect(after('post', at({ defense: { help: 60 } })).defense.help).toBe(80);
    // whatever the tactics, an offered counter changes them
    for (const ft of Object.keys(FINISH_LABEL) as FinishType[])
      for (const patch of [
        {},
        { defense: { scheme: 'man', pnr: 'drop', help: 70 } },
        { defense: { scheme: 'zone23', help: 40 } },
        { defense: { scheme: 'man', pnr: 'switch', help: 85 } },
      ] as TacticsPatch[]) {
        const t = at(patch);
        if (liveCounter(ft, t)) expect(JSON.stringify(after(ft, t))).not.toBe(JSON.stringify(t));
      }
  });
  it('only offers counters that change something', () => {
    const [mine, opp] = [league.teams[0], league.teams[1]];
    const saved = [mine.tactics, opp.tactics];
    opp.tactics = applyPatch(opp.tactics, { defense: { scheme: 'man', pnr: 'drop' } });
    mine.tactics = applyPatch(mine.tactics, { offense: { actions: { ...mine.tactics.offense.actions, pnr: 60, handoff: 60 } } });
    expect(counterCandidates(league, 0, 1).map((c) => c.id)).toContain('vs-drop');
    mine.tactics = applyPatch(mine.tactics, { offense: { actions: { ...mine.tactics.offense.actions, pnr: 100, handoff: 100 } } });
    expect(counterCandidates(league, 0, 1).map((c) => c.id)).not.toContain('vs-drop');
    [mine.tactics, opp.tactics] = saved;
  });
  it('gives a zone no ball-screen coverage advice, and says when a coverage counter leaves your zone', () => {
    const [mine, opp] = [league.teams[0], league.teams[1]];
    const saved = [mine.tactics, opp.tactics];
    // a zone keeps the coverage it had in man-to-man, but the engine ignores it
    opp.tactics = applyPatch(opp.tactics, { defense: { scheme: 'zone23', pnr: 'drop', switchOffBall: true } });
    const rep = scoutTeam(league, 1);
    expect(rep.defense[0]).toMatch(/no ball-screen coverage/);
    expect(rep.weaknesses.join(' ')).not.toMatch(/Drop|Switching|Blitz/);
    expect(counterCandidates(league, 0, 1).map((c) => c.id)).not.toContain('vs-switch');
    expect(teamAlerts(league, 1).map((a) => a.id)).not.toContain('drop-noprot');
    // from a zone, a coverage counter is a move to man-to-man too, and only Switch switches off the ball
    mine.tactics = applyPatch(mine.tactics, { defense: { scheme: 'zone23', pnr: 'switch', switchOffBall: false } });
    const covs = counterCandidates(league, 0, 1).filter((c) => c.id.startsWith('cov-'));
    expect(covs.map((c) => c.id)).toContain('cov-switch');
    for (const c of covs) {
      expect(c.patch.defense).toMatchObject({ scheme: 'man' });
      expect(c.patch.defense?.switchOffBall).toBe(c.id === 'cov-switch' ? true : undefined);
      expect(c.why).toMatch(/man-to-man instead of your zone/);
    }
    [mine.tactics, opp.tactics] = saved;
  });
  it('reads spacing as scouting does: a zone only against the poor spacing it flags, never pack the paint and stay home at once', () => {
    const mine = league.teams[0];
    const saved = mine.tactics;
    mine.tactics = applyPatch(saved, { defense: { scheme: 'man', help: 55 } });
    let flagged = 0;
    for (let tid = 1; tid < 30; tid++) {
      const poor = scoutTeam(league, tid).weaknesses.some((w) => w.startsWith('Poor spacing'));
      const ids = counterCandidates(league, 0, tid).map((c) => c.id);
      expect(ids.includes('zone')).toBe(poor);
      if (poor) expect(ids).toContain('help-high');
      expect(ids.includes('help-high') && ids.includes('help-low')).toBe(false);
      flagged += +poor;
    }
    expect(flagged).toBeGreaterThan(0);
    expect(flagged).toBeLessThan(15);
    mine.tactics = saved;
  });
  it('scouts in plain English: plural team names, the creator role named once', () => {
    for (let tid = 1; tid < 30; tid++) {
      for (const t of scoutTeam(league, tid).threats) expect(t.why).not.toMatch(/Primary creator \(Primary Creator\)/);
      for (const c of counterCandidates(league, 0, tid)) expect(c.why).not.toMatch(new RegExp(`^${league.teams[tid].name} (is|spaces)\\b`));
    }
  });
});
