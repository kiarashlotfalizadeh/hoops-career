// The plans around the new defensive tools: the staff's read on guarding each opponent and on
// which of their defenders to attack, the assistant's junk-defense and hunt counters (with the
// numbers behind them), and AI coaches answering a one-man offense with a box-and-one.
import { describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { simDay } from '../league/season';
import { shortName, teamPlayers } from '../league/helpers';
import { buildSimInput, ensureRotation } from '../league/games';
import { counterCandidates, impactCounter } from '../ai/advisor';
import { aiGamePlan, nextMeeting } from '../ai/opponentPlan';
import { guardAdvice, huntPick } from '../analysis/guarding';
import { projectedRotation } from '../analysis/scouting';
import { applyPatch, cloneTactics, defaultTactics, hasCoachPlans, withoutCoachPlans } from '../sim/tactics';
import { persistableTactics } from '../league/gamePlans';
import { keptTactics } from '../../ui/live/keep';
import { GameSim } from '../sim/engine';
import { Rng } from '../random';
import type { PossLog } from '../sim/log';
import type { League, Player } from '../types';

function leagueAt(difficulty: League['settings']['difficulty'], days = 14): League {
  const l = testLeague();
  for (let i = 0; i < days; i++) simDay(l);
  l.settings.difficulty = difficulty;
  return l;
}

/** A team whose offense runs through one player (his line this season made to use 38% of the possessions) and whose others make 25% of their threes. */
function oneManTeam(l: League, tid: number): Player {
  const players = teamPlayers(l, tid);
  const line = (p: Player) => p.stats.find((s) => s.season === l.season && s.tid === tid && !s.playoffs);
  const use = (p: Player) => {
    const s = line(p)!;
    return (s.fga + 0.44 * s.fta + s.tov) / (s.teamFga + 0.44 * s.teamFta + s.teamTov);
  };
  // their healthy player who already uses the most possessions, and nobody resting on back-to-backs
  const star = players.filter((p) => !p.injury && line(p) && line(p)!.gp >= 5 && line(p)!.min >= 20 * line(p)!.gp).sort((a, b) => use(b) - use(a))[0];
  l.teams[tid].rotation.restB2B = [];
  for (const p of players) {
    const s = line(p);
    if (!s) continue;
    if (p === star) {
      const teamUse = s.teamFga + 0.44 * s.teamFta + s.teamTov;
      s.fga = Math.round(0.38 * teamUse - 0.44 * s.fta - s.tov);
      s.min = Math.max(s.min, 34 * s.gp);
    } else {
      s.tpa = Math.max(s.tpa, 6);
      s.tpm = Math.floor(s.tpa * 0.25);
    }
  }
  return star;
}

describe('guarding their players', () => {
  const l = testLeague();
  const p = structuredClone(teamPlayers(l, 3)[0]);
  // ratings only: no games this season or last
  p.stats = [];
  const advise = (r: Partial<Player['ratings']>) => guardAdvice(l, { ...p, ratings: { ...p.ratings, ...r } }).suggest;

  it('suggests going under on a ball handler who can’t shoot, top-locking a shooter who can’t drive, sagging off a non-shooter, getting physical with a poor free-throw shooter inside', () => {
    expect(advise({ hnd: 90, pas: 85, oiq: 80, tp: 25, mid: 50, spd: 70 })).toBe('under');
    expect(advise({ tp: 92, hnd: 35, spd: 35, oiq: 60, ath: 40, str: 40 })).toBe('tight');
    expect(advise({ tp: 20, hnd: 40, pas: 40 })).toBe('sag');
    expect(advise({ tp: 40, post: 90, str: 90, hgt: 90, ins: 85, ft: 35, hnd: 40, pas: 40 })).toBe('body');
    // a complete player: nothing clearly fits
    expect(advise({ tp: 80, hnd: 80, pas: 80, oiq: 80, spd: 80, mid: 80, ft: 85, post: 50 })).toBeUndefined();
  });

  it('reads his games when there are enough, and says so', () => {
    const lg = leagueAt('easy', 14);
    const them = projectedRotation(lg, 3, 8);
    const withGames = them.map((x) => guardAdvice(lg, x)).filter((a) => a.line.source === 'season');
    expect(withGames.length).toBeGreaterThan(4);
    for (const a of withGames.filter((x) => x.suggest)) expect(a.why).toMatch(/%|a game|\d/);
  });

  it('quotes his three-point percentage only on enough threes to mean something', () => {
    const lg = leagueAt('easy', 14);
    const q = structuredClone(projectedRotation(lg, 3, 8).find((x) => (x.stats.find((s) => s.season === lg.season && s.tid === 3 && !s.playoffs)?.gp ?? 0) >= 5)!);
    const s = q.stats.find((x) => x.season === lg.season && x.tid === 3 && !x.playoffs)!;
    // a non-shooter who isn't a handler or a post scorer, and makes his free throws
    Object.assign(q.ratings, { tp: 10, hnd: 35, pas: 40, post: 30, ins: 40, ft: 85 });
    s.ftm = s.fta;
    // one three in his games, and he made it
    s.tpa = s.tpm = 1;
    const one = guardAdvice(lg, q);
    expect(one.suggest).toBe('sag');
    expect(one.why).toBe(`Rarely shoots threes (1 three in his ${s.gp} games).`);
    s.tpa = s.tpm = 0;
    expect(guardAdvice(lg, q).why).toBe(`Doesn't shoot threes (no threes in his ${s.gp} games).`);
    // enough of them to mean something: the percentage
    s.tpa = 2 * s.gp;
    s.tpm = Math.floor(s.tpa / 5);
    expect(guardAdvice(lg, q).why).toMatch(/^Doesn't shoot threes \(\d+\.\d% from three on 2\.0 a game\)\.$/);
    // last season's numbers (before five games with his team this season) say so
    q.stats = [{ ...s, season: lg.season - 1, real: undefined }];
    expect(guardAdvice(lg, q).line.source).toBe('last');
    expect(guardAdvice(lg, q).why).toMatch(/^Doesn't shoot threes \(\d+\.\d% from three on 2\.0 a game last season\)\.$/);
  });

  it('picks their weakest perimeter defender to attack, and says when he isn’t much of a weak link', () => {
    const lg = testLeague();
    ensureRotation(lg, 3);
    const rot = projectedRotation(lg, 3, 8);
    const pick = huntPick(lg, 3)!;
    expect(rot.slice(0, 7).map((x) => x.pid)).toContain(pick.pid);
    expect(pick.perDef).toBeLessThanOrEqual(pick.teamPerDef);
    // make one of their starters a sieve: he's the pick, and worth it
    const sieve = rot[1];
    Object.assign(sieve.ratings, { perD: 10, spd: 20, diq: 20 });
    const now = huntPick(lg, 3)!;
    expect(now.pid).toBe(sieve.pid);
    expect(now.worth).toBe(true);
  });
});

describe('counters and opposing plans', () => {
  it('the assistant suggests a box-and-one on a one-man offense whose others can’t shoot, with the numbers', () => {
    const l = leagueAt('easy');
    const opp = 3;
    const star = oneManTeam(l, opp);
    const box = counterCandidates(l, l.userTid, opp).find((c) => c.id === 'box-1');
    expect(box).toBeDefined();
    expect(box!.label).toBe(`Box-and-one on ${star.lastName}`);
    expect(box!.patch).toEqual({ defense: { scheme: 'box1', chase: [star.pid] } });
    expect(box!.evidence).toMatch(/uses 38% of their possessions; the rest make 2\d\.\d% of their threes/);
  });

  it('the assistant suggests attacking a real weak link', () => {
    const l = leagueAt('easy', 2);
    const opp = 4;
    ensureRotation(l, opp);
    const rot = projectedRotation(l, opp, 8);
    Object.assign(rot[0].ratings, { perD: 5, spd: 15, diq: 15 });
    const hunt = counterCandidates(l, l.userTid, opp).find((c) => c.id === 'hunt');
    expect(hunt?.patch).toEqual({ offense: { huntTarget: rot[0].pid } });
    expect(hunt?.label).toBe(`Attack ${rot[0].lastName}`);
  });

  it('an AI coach answers a one-man offense that can’t shoot around him with a box-and-one on him, and an AI team never plays the user’s game-by-game settings', () => {
    const l = leagueAt('hard');
    const star = oneManTeam(l, l.userTid);
    let found = 0;
    for (const tid of l.teams.map((t) => t.tid).filter((t) => t !== l.userTid)) {
      const g = nextMeeting(l, tid);
      if (!g) continue;
      l.teams[tid].tactics.defense.scheme = 'man';
      const plan = aiGamePlan(l, tid, l.userTid, g);
      const box = plan?.items.find((it) => it.id === 'box1');
      if (!box) continue;
      found++;
      expect(box.text).toBe(`plays a box-and-one on ${shortName(l, star)}`);
      expect(box.why).toMatch(/uses 38% of your possessions, and the rest of your team makes 2\d\.\d% of its threes/);
      const t = buildSimInput(l, tid, g.day, g.type, l.userTid, g).team.tactics;
      expect(t.defense).toMatchObject({ scheme: 'box1', chase: [star.pid] });
    }
    expect(found).toBeGreaterThan(5);
    // a team the user left keeps none of his game-by-game settings or his foul to give
    const t = defaultTactics();
    expect(hasCoachPlans(t)).toBe(false);
    t.manage.foulToGive = true;
    t.offense.huntTarget = 3;
    t.defense.chase = [4];
    t.defense.playerD = { 5: 'sag' };
    expect(hasCoachPlans(t)).toBe(true);
    const ai = withoutCoachPlans(t);
    expect([ai.manage.foulToGive, ai.offense.huntTarget, ai.defense.chase, ai.defense.playerD]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('AI coaches can attack the user’s weakest perimeter defender and plan how to guard one of his regulars, and play it in the game', () => {
    const l = leagueAt('hard');
    ensureRotation(l, l.userTid);
    const rot = projectedRotation(l, l.userTid, 8);
    const sieve = rot[1];
    Object.assign(sieve.ratings, { perD: 5, spd: 15, diq: 15 });
    // and a starter who doesn't shoot threes, in his ratings and his games
    const brick = rot[2];
    Object.assign(brick.ratings, { tp: 5 });
    for (const s of brick.stats) if (s.season === l.season) s.tpa = s.tpm = 0;
    let hunts = 0;
    let guards = 0;
    for (const tid of l.teams.map((t) => t.tid).filter((t) => t !== l.userTid)) {
      const g = nextMeeting(l, tid);
      if (!g) continue;
      l.teams[tid].tactics.defense.scheme = 'man';
      l.teams[tid].tactics.defense.pnr = 'drop';
      const plan = aiGamePlan(l, tid, l.userTid, g);
      const t = () => buildSimInput(l, tid, g.day, g.type, l.userTid, g).team.tactics;
      const hunt = plan?.items.find((it) => it.id === 'hunt');
      if (hunt) {
        hunts++;
        expect(hunt.text).toBe(`attacks ${shortName(l, sieve)} on defense`);
        expect(hunt.why).toMatch(/defends the perimeter at \d+, your rotation at \d+\./);
        expect(t().offense.huntTarget).toBe(sieve.pid);
      }
      const guard = plan?.items.find((it) => it.group === 'guard');
      if (guard) {
        guards++;
        const [pid, how] = Object.entries(guard.patch.defense!.playerD!)[0];
        expect(rot.slice(0, 7).map((p) => p.pid)).toContain(Number(pid));
        expect(guard.id).toBe(`guard-${how}`);
        expect(t().defense.playerD).toEqual({ [pid]: how });
      }
    }
    expect(hunts).toBeGreaterThan(3);
    expect(guards).toBeGreaterThan(0);
  });

  it('AI coaches don’t plan for a player of the user’s who rests tonight', () => {
    const l = leagueAt('hard');
    ensureRotation(l, l.userTid);
    const rot = projectedRotation(l, l.userTid, 8);
    const sieve = rot[1];
    Object.assign(sieve.ratings, { perD: 5, spd: 15, diq: 15 });
    const brick = rot[2];
    Object.assign(brick.ratings, { tp: 5 });
    for (const s of brick.stats) if (s.season === l.season) s.tpa = s.tpm = 0;
    l.teams[l.userTid].rotation.restB2B = [sieve.pid, brick.pid];
    // a night with no game the night before, then the same night as the second of a back-to-back
    const me = l.userTid;
    let day = l.day + 30;
    while (l.schedule.some((g) => g.day === day - 1 && (g.home === me || g.away === me))) day++;
    const targets = () => {
      const named = new Set<number>();
      for (const tid of l.teams.map((t) => t.tid).filter((t) => t !== me)) {
        Object.assign(l.teams[tid].tactics.defense, { scheme: 'man', pnr: 'drop' });
        for (const it of aiGamePlan(l, tid, me, { gid: 90000 + tid, day })?.items ?? []) {
          const d = it.patch.defense;
          for (const pid of [it.patch.offense?.huntTarget, d?.starTarget, ...(d?.chase ?? []), ...Object.keys(d?.playerD ?? {}).map(Number)]) if (pid != null) named.add(pid);
        }
      }
      return named;
    };
    const rested = targets();
    expect(rested.has(sieve.pid) || rested.has(brick.pid)).toBe(true);
    l.schedule.push({ gid: l.nextGid++, day: day - 1, home: me, away: (me + 1) % 30, type: 'regular', played: true });
    const b2b = targets();
    expect(b2b.has(sieve.pid)).toBe(false);
    expect(b2b.has(brick.pid)).toBe(false);
    expect(b2b.size).toBeGreaterThan(0);
  });

  it('a junk defense named for their players stays with that opponent: the Lab’s Always and Keep changes never make it the default', () => {
    const l = testLeague();
    const mine = l.teams[l.userTid].tactics;
    mine.defense.scheme = 'zone23';
    const star = teamPlayers(l, 5).sort((a, b) => b.ovr - a.ovr)[0];
    const patch = { defense: { scheme: 'box1' as const, chase: [star.pid] } };
    // nothing to keep for every game (the Lab hides Always), and kept anyway it's the scheme it was drawn up over
    expect(persistableTactics(applyPatch(mine, patch), mine)).toEqual(persistableTactics(mine, mine));
    expect(persistableTactics(applyPatch(mine, patch)).defense.scheme).toBe('man');
    // named live and kept after the game: the saved scheme stays
    expect(keptTactics(mine, cloneTactics(mine), applyPatch(mine, patch)).defense.scheme).toBe('zone23');
    // a box-and-one you set for every game, chasing whoever runs their offense, is yours to keep
    const auto = { defense: { scheme: 'box1' as const } };
    expect(persistableTactics(applyPatch(mine, auto), mine).defense.scheme).toBe('box1');
    expect(keptTactics(mine, cloneTactics(mine), applyPatch(mine, auto)).defense.scheme).toBe('box1');
  });

  it('a box-and-one chases the first name it has: a second one left from a triangle-and-two doesn’t count', () => {
    const l = testLeague();
    const [a, b] = projectedRotation(l, 4, 8);
    const t = cloneTactics(l.teams[l.userTid].tactics);
    t.defense.scheme = 'box1';
    t.defense.chase = [a.pid, b.pid];
    const sim = new GameSim(
      { team: { ...l.teams[l.userTid], tactics: t }, players: teamPlayers(l, l.userTid) },
      { team: l.teams[4], players: teamPlayers(l, 4), rest: [a.pid] },
      { rng: new Rng(3), type: 'regular', record: true, injuries: false },
    );
    const logs: PossLog[] = [];
    while (sim.step()) logs.push(...sim.drainLogs());
    const theirs = logs.filter((x) => x.off === 1);
    // their first name sits tonight: man-to-man all game, nobody chased
    expect(theirs.every((x) => x.scheme === 'man' && !x.chase?.length)).toBe(true);
  });

  it('the live one-tap fixes take a junk defense, an instruction or a hunt away', () => {
    const t = defaultTactics();
    t.defense.scheme = 'tri2';
    t.defense.playerD = { 3: 'under', 4: 'sag' };
    t.offense.huntTarget = 9;
    const fix = (key: string) => {
      const c = impactCounter(key, t)!;
      const after = structuredClone(t);
      c.apply(after);
      return { label: c.label, after };
    };
    expect(fix('box_open:o').after.defense.scheme).toBe('man');
    expect(fix('pd_under:o').after.defense.playerD).toEqual({ 4: 'sag' });
    expect(fix('hunt:d').after.offense.huntTarget).toBeNull();
    expect(fix('box_chase:d').label).toBe('Move the ball');
  });
});
