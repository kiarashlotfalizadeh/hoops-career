// The live game's tactical plumbing: a one-tap counter for every tactical edge an opponent can get
// (it always takes the edge away), and tactics diffs that "Keep changes" saves.
import { describe, expect, it } from 'vitest';
import { IMPACT_TEXT } from '../analysis/gameReport';
import { impactCounter } from '../ai/advisor';
import { applyPatch, cloneTactics, defaultTactics, emptyPatch, namedJunk, tacticsDiff } from '../sim/tactics';
import { Rng } from '../random';
import { DEF_ROLES, PLAYER_DEFENSES, SET_IDS, type DefRole, type DefScheme, type PlayerDefense, type PnrCoverage, type PressMode, type StarPlan, type Tactics } from '../types';

/** Tactics with every setting an impact's `uses` reads spread over its range. */
function randomTactics(rng: Rng): Tactics {
  const t = defaultTactics();
  t.defense.scheme = rng.pick<DefScheme>(['man', 'man', 'zone23', 'zone32', 'box1', 'tri2']);
  // instructions on a couple of their players, a hunt, a foul to give, how much the ball moves
  const pd: Record<number, PlayerDefense> = {};
  for (const pid of [31, 32]) if (rng.chance(0.4)) pd[pid] = rng.pick(PLAYER_DEFENSES);
  if (Object.keys(pd).length) t.defense.playerD = pd;
  // out-of-possession roles on a couple of your players
  const roles: Record<number, DefRole> = {};
  for (const pid of [1, 2]) if (rng.chance(0.5)) roles[pid] = rng.pick(DEF_ROLES);
  if (Object.keys(roles).length) t.defense.roles = roles;
  if (rng.chance(0.3)) t.offense.huntTarget = 33;
  t.manage.foulToGive = rng.chance(0.5);
  t.offense.actions.motion = rng.int(0, 100);
  t.offense.actions.handoff = rng.int(0, 100);
  t.defense.pnr = rng.pick<PnrCoverage>(['drop', 'switch', 'hedge', 'blitz', 'ice']);
  t.defense.help = rng.int(0, 100);
  t.defense.pressure = rng.int(0, 100);
  t.defense.press = rng.pick<PressMode>(['none', 'afterMade', 'always']);
  t.defense.getBack = rng.int(0, 100);
  t.defense.physicality = rng.int(0, 100);
  t.defense.switchOffBall = rng.chance(0.5);
  t.defense.starPlan = rng.pick<StarPlan>(['none', 'deny', 'double']);
  t.offense.crashBoards = rng.int(0, 100);
  t.offense.transition = rng.int(0, 100);
  t.manage.hackThreshold = rng.chance(0.5) ? 0 : rng.int(40, 65);
  // a set package now and then: up to four of the sets
  const pkg = SET_IDS.filter(() => rng.chance(0.3)).slice(0, 4);
  if (pkg.length) t.offense.sets = pkg;
  return t;
}

describe('impact counters', () => {
  const keys = Object.keys(IMPACT_TEXT).filter((k) => IMPACT_TEXT[k].uses);

  it('exist for every edge your tactics give away, and take it away; none when they no longer do', () => {
    expect(keys.length).toBeGreaterThan(15);
    const rng = new Rng(2024);
    const used = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const t = randomTactics(rng);
      for (const key of keys) {
        const uses = IMPACT_TEXT[key].uses!;
        const c = impactCounter(key, t);
        if (!uses(t)) {
          expect(c, `${key} on tactics that don't use it`).toBeUndefined();
          continue;
        }
        used.add(key);
        expect(c, `${key} has no counter`).toBeDefined();
        const after = cloneTactics(t);
        c!.apply(after);
        expect(uses(after), `${key}: ${c!.label} leaves it in place`).toBe(false);
      }
    }
    // every key was in play at least once
    expect([...used].sort()).toEqual([...keys].sort());
  });

  it('have nothing for an edge without a tactical cause', () => {
    expect(impactCounter('mismatch_post:o', defaultTactics())).toBeUndefined();
    expect(impactCounter('nonsense', defaultTactics())).toBeUndefined();
  });
});

describe('tactics diffs', () => {
  it('give back the changed tactics when applied, except tonight’s matchups, star, chase and hunt targets, instructions by player and a named junk defense', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 200; i++) {
      const a = randomTactics(rng);
      a.offense.roles = { 5: 'creator' };
      const b = randomTactics(rng);
      b.offense.actions = { ...a.offense.actions, pnr: rng.int(0, 100), motion: rng.int(0, 100) };
      b.offense.roles = rng.chance(0.5) ? { 5: 'creator' } : { 5: 'shooter', 8: 'roller' };
      b.offense.freedom = rng.chance(0.5) ? {} : { 5: 1 };
      b.offense.screeners = rng.chance(0.5) ? [] : [8, 9];
      b.offense.pace = rng.int(0, 100);
      b.offense.hotHand = rng.chance(0.5);
      b.manage.foulTrouble = rng.pick(['loose', 'standard', 'strict'] as const);
      b.manage.fatigueSub = rng.pick([0.5, 0.55, 0.6]);
      b.defense.matchups = { 20: 5 };
      b.defense.starTarget = 21;
      b.defense.chase = [22];
      const d = tacticsDiff(a, b);
      expect(d.defense && ['matchups', 'starTarget', 'chase', 'playerD'].some((k) => k in d.defense!)).toBeFalsy();
      expect(d.offense && 'huntTarget' in d.offense).toBeFalsy();
      const back = applyPatch(a, d);
      const game = (t: Tactics) => ({
        matchups: t.defense.matchups,
        starTarget: t.defense.starTarget,
        chase: t.defense.chase,
        playerD: t.defense.playerD,
        huntTarget: t.offense.huntTarget,
      });
      const { matchups, starTarget, chase, playerD, huntTarget } = game(b);
      // a junk defense named for their players is tonight's too: the scheme stays as it was
      const junk = namedJunk(b.defense);
      if (junk) expect(back.defense.scheme).toBe(a.defense.scheme);
      const withB = {
        ...back,
        offense: { ...back.offense, huntTarget },
        defense: { ...back.defense, matchups, starTarget, chase, playerD, ...(junk ? { scheme: b.defense.scheme } : {}) },
      };
      for (const x of [withB.offense, withB.defense] as Record<string, unknown>[]) for (const k of Object.keys(x)) if (x[k] === undefined) delete x[k];
      expect(withB).toEqual(b);
      expect(game(back)).toEqual(game(a));
      // the patch owns nothing of b's
      expect(back.offense.roles).not.toBe(b.offense.roles);
    }
  });

  it('are empty between equal tactics, and carry only what changed', () => {
    const a = defaultTactics();
    expect(emptyPatch(tacticsDiff(a, cloneTactics(a)))).toBe(true);
    const b = cloneTactics(a);
    b.defense.pnr = 'hedge';
    b.offense.actions.iso = 90;
    b.defense.matchups = { 3: 4 };
    expect(tacticsDiff(a, b)).toEqual({ offense: { actions: { iso: 90 } }, defense: { pnr: 'hedge' } });
  });
});
