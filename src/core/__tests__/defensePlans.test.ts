// The plans around the new defensive tools: the staff's read on guarding each opponent and on
// which of their defenders to attack, the assistant's junk-defense and hunt counters (with the
// numbers behind them), and AI coaches answering a one-man offense with a box-and-one.
import { describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { simDay } from '../league/season';
import { teamPlayers } from '../league/helpers';
import { buildSimInput, ensureRotation } from '../league/games';
import { counterCandidates, impactCounter } from '../ai/advisor';
import { aiGamePlan, nextMeeting } from '../ai/opponentPlan';
import { guardAdvice, huntPick } from '../analysis/guarding';
import { projectedRotation } from '../analysis/scouting';
import { defaultTactics, hasCoachPlans, withoutCoachPlans } from '../sim/tactics';
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
    const lg = leagueAt('casual', 14);
    const them = projectedRotation(lg, 3, 8);
    const withGames = them.map((x) => guardAdvice(lg, x)).filter((a) => a.line.source === 'season');
    expect(withGames.length).toBeGreaterThan(4);
    for (const a of withGames.filter((x) => x.suggest)) expect(a.why).toMatch(/%|a game|\d/);
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
    const l = leagueAt('casual');
    const opp = 3;
    const star = oneManTeam(l, opp);
    const box = counterCandidates(l, l.userTid, opp).find((c) => c.id === 'box-1');
    expect(box).toBeDefined();
    expect(box!.label).toBe(`Box-and-one on ${star.lastName}`);
    expect(box!.patch).toEqual({ defense: { scheme: 'box1', chase: [star.pid] } });
    expect(box!.evidence).toMatch(/uses 38% of their possessions; the rest make 2\d\.\d% of their threes/);
  });

  it('the assistant suggests attacking a real weak link', () => {
    const l = leagueAt('casual', 2);
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
      expect(box.text).toBe(`plays a box-and-one on ${star.lastName}`);
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
