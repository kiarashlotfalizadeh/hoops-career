// The parts of the tactics as the coach and the staff use them: shapes and out-of-possession roles,
// the system report grading it all against the league; mentality, the headline decisions, the live
// game's one-tap counters, the reports' words for the engine's tags and the tactics diffs "Keep
// changes" saves.
import { describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import {
  FOCUS_META,
  GLASS_LEVELS,
  PLAY_FOCI,
  applyFocus,
  applyPatch,
  cloneTactics,
  defaultTactics,
  emptyPatch,
  focusOf,
  glassLevel,
  namedJunk,
  setGlassLevel,
  tacticsDiff,
  withMentality,
} from '../sim/tactics';
import { solveMatchups } from '../sim/matchups';
import { autoDefRoles, autoRoles, autoShape, autoTactics, shapeFits } from '../ai/coachAI';
import { DEF_QUALITIES, OFF_QUALITIES, betterFit, defRoleFits, fitStars, gradeChanges, gradeOf, miscast, roleFits, roleScale, roleStars, systemReport } from '../analysis/system';
import { IMPACT_TEXT, impactSentence } from '../analysis/gameReport';
import { impactCounter } from '../ai/advisor';
import { Rng } from '../random';
import { DEF_ROLES, type DefRole, type DefScheme, type League, type Player, type PnrCoverage, type PressMode, type StarPlan, type Tactics } from '../types';

const baseLeague = testLeague();
const fresh = () => structuredClone(baseLeague);
const user = (l: League) => l.teams[l.userTid];
const roster = (l: League) => teamPlayers(l, l.userTid);

/** Tactics with every setting an impact's `uses` reads spread over its range. */
function randomTactics(rng: Rng): Tactics {
  const t = defaultTactics();
  t.defense.scheme = rng.pick<DefScheme>(['man', 'man', 'zone23', 'zone32', 'box1', 'tri2']);
  // a hunt, a foul to give, how much the ball moves
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
  t.defense.starPlan = rng.pick<StarPlan>(['none', 'double']);
  t.offense.crashBoards = rng.int(0, 100);
  t.offense.transition = rng.int(0, 100);
  t.manage.hackThreshold = rng.chance(0.5) ? 0 : rng.int(40, 65);
  return t;
}

describe('roles and the system', () => {
  it('casts roles that suit, fits the shape to the roster, and grades the system', () => {
    {
      // the staff's shape follows the roster: five-out for five shooters, never for non-shooters, and
      // four-out otherwise (since partnerships went, no roster quality reads horns or the double post
      // better in the games: their reads are flat, 2026-10-28)
      const shooters = (ps: Player[]) => ps.map((p) => ({ ...p, ratings: { ...p.ratings, tp: Math.max(p.ratings.tp, 85) }, injury: null }));
      const bruisers = (ps: Player[]) =>
        ps.map((p) => ({ ...p, ratings: { ...p.ratings, ...(p.ratings.hgt >= 55 ? { tp: 10, oreb: 90, ins: 85, post: 85 } : { tp: Math.min(p.ratings.tp, 35) }) }, injury: null }));
      const l = fresh();
      const ps = roster(l);
      const order = user(l).rotation.order;
      expect(shapeFits(shooters(ps), undefined, order).fiveOut).toBeGreaterThan(shapeFits(bruisers(ps), undefined, order).fiveOut + 15);
      expect(autoShape(shooters(ps), undefined, order)).toBe('fiveOut');
      expect(autoShape(bruisers(ps), undefined, order)).toBe('fourOut');
      // it gives each out-of-possession role to a player who suits it, at most once a unit
      const defRoles = autoDefRoles(ps, user(l).rotation);
      const byId = new Map(ps.map((p) => [p.pid, p]));
      for (const [pid, r] of Object.entries(defRoles)) expect(defRoleFits(byId.get(+pid)!)[r]).toBeGreaterThanOrEqual(66);
      const starterRoles = order
        .slice(0, 5)
        .map((pid) => defRoles[pid])
        .filter(Boolean);
      expect(new Set(starterRoles).size).toBe(starterRoles.length);
      // in season it keeps its system unless another fits clearly better: a playbook about as good as the best stays
      const other = l.teams[(l.userTid + 3) % 30];
      const theirs = teamPlayers(l, other.tid);
      const best = autoTactics(other, theirs, false);
      const kept = autoTactics({ ...other, tactics: { ...best, offPreset: best.offPreset } }, theirs, false, { sticky: true });
      expect(kept.offPreset).toBe(best.offPreset);
    }
    {
      // out-of-possession roles send their players to the man their job is
      const off = [
        { pid: 1, hgt: 30, big: false, threat: 10, handle: 9, shoot: 70 },
        { pid: 2, hgt: 45, big: false, threat: 8, handle: 1, shoot: 60 },
        { pid: 3, hgt: 50, big: false, threat: 2, handle: 0, shoot: 5 },
        { pid: 4, hgt: 60, big: true, threat: 3, handle: 0, shoot: 60 },
        { pid: 5, hgt: 75, big: true, threat: 2, handle: 0, shoot: 5 },
      ];
      const d = (pid: number, hgt: number, role?: 'poa' | 'stopper' | 'anchor' | 'roamer' | 'hide') => ({ pid, hgt, intDef: 55, perDef: 55, ...(role && { role }) });
      // the anchor is the tallest and guards the non-shooting big; the roamer leaves the non-shooting wing
      const def = [d(11, 40, 'poa'), d(12, 46, 'stopper'), d(13, 50, 'roamer'), d(14, 62), d(15, 76, 'anchor')];
      const pick = solveMatchups(off, def);
      expect(def[pick[0]].pid).toBe(11);
      expect(def[pick[1]].pid).toBe(12);
      expect(def[pick[2]].pid).toBe(13);
      expect(def[pick[4]].pid).toBe(15);
    }

    // the system report: seven qualities at each end, ranked among the league
    const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
    const r = systemReport(league, 0);
    expect(r.off.map((q) => q.id)).toEqual(OFF_QUALITIES);
    expect(r.def.map((q) => q.id)).toEqual(DEF_QUALITIES);
    for (const q of [...r.off, ...r.def]) {
      expect(q.of).toBe(league.teams.length);
      expect(q.rank).toBeGreaterThanOrEqual(1);
      expect(q.rank).toBeLessThanOrEqual(q.of);
      expect(q.grade).toBe(gradeOf(q.rank, q.of));
      // its first part is who carries it; the rest are settings, each worth something
      expect(q.parts[0].text.length).toBeGreaterThan(3);
    }
    expect(gradeOf(1, 30)).toBe('A+');
    expect(gradeOf(30, 30)).toBe('F');
    {
      // it moves with the settings as the engine plays them, each a trade-off
      const t = league.teams[0].tactics;
      const base = systemReport(league, 0);
      const crash = cloneTactics(t);
      crash.offense.crashBoards = 100;
      const c = systemReport(league, 0, crash, base.others);
      const q = (rep: typeof base, id: string) => [...rep.off, ...rep.def].find((x) => x.id === id)!.raw;
      expect(q(c, 'glass')).toBeGreaterThan(q(base, 'glass'));
      expect(q(c, 'transD')).toBeLessThan(q(base, 'transD'));
      const pack = cloneTactics(t);
      pack.defense.help = 100;
      const p = systemReport(league, 0, pack, base.others);
      expect(q(p, 'rimD')).toBeGreaterThan(q(base, 'rimD'));
      expect(q(p, 'threeD')).toBeLessThan(q(base, 'threeD'));
      const zone = cloneTactics(t);
      zone.defense.scheme = 'zone32';
      const z = systemReport(league, 0, zone, base.others);
      expect(q(z, 'threeD')).toBeGreaterThan(q(base, 'threeD'));
      expect(q(z, 'boards')).toBeLessThan(q(base, 'boards'));
      // the same tactics, the same report; the change lists what moved
      expect(gradeChanges(base, systemReport(league, 0, cloneTactics(t), base.others))).toEqual([]);
      expect(gradeChanges(base, c).every((x) => typeof x.up === 'boolean')).toBe(true);
    }
    {
      // it fits each player to each role by what it asks of him
      const ps = teamPlayers(league, 0);
      const shooter = [...ps].sort((a, b) => b.ratings.tp - a.ratings.tp)[0];
      const big = [...ps].sort((a, b) => b.ratings.hgt - a.ratings.hgt)[0];
      const fs = roleFits(shooter);
      const fb = roleFits(big);
      expect(fs.shooter).toBeGreaterThan(fs.roller);
      expect(fb.roller).toBeGreaterThan(fb.shooter - 10);
      for (const v of Object.values(fs)) expect(fitStars(v)).toBeGreaterThanOrEqual(1);
      expect(fitStars(90)).toBe(5);
    }
    // a miscast player is two stars or more short of his best role; one star is within the fits
    const fits = { creator: 70, scorer: 60, shooter: 45 };
    expect(miscast(fits, 'creator')).toBeNull();
    expect(miscast(fits, 'scorer')).toBeNull();
    expect(miscast(fits, 'shooter')).toBe('creator');
    // never Hidden: its fit is how poor a defender he is, not a role he'd play better in
    expect(miscast<string>({ standard: 35, poa: 40, stopper: 38, anchor: 20, roamer: 36, hide: 75 }, 'standard')).toBeNull();
    {
      // the screens' stars rank a fit against the league's rotation players at that role: each team's
      // best players read three stars or more at their best role, and the flag never shows fewer stars
      const scale = roleScale(league);
      const best = league.teams.map((t) => [...teamPlayers(league, t.tid)].sort((a, b) => b.ovr - a.ovr)[0]);
      for (const p of best) {
        const f = roleFits(p);
        const r = (Object.keys(f) as (keyof typeof f)[]).reduce((a, b) => (f[b] > f[a] ? b : a));
        expect(roleStars(scale.off[r], f[r])).toBeGreaterThanOrEqual(3);
      }
      expect([roleStars([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 5), roleStars([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 95)]).toEqual([1, 5]);
      for (const t of league.teams.slice(0, 6))
        for (const p of teamPlayers(league, t.tid)) {
          const df = defRoleFits(p);
          const b = betterFit(scale.def, df, 'standard');
          expect(b).not.toBe('hide');
          if (b) expect(roleStars(scale.def[b], df[b])).toBeGreaterThan(roleStars(scale.def.standard, df.standard));
        }
    }
    // and the staff leaves nobody that way, but for the lead creator
    for (const team of league.teams) {
      const ps = teamPlayers(league, team.tid);
      const { roles } = autoRoles(ps);
      expect(Object.values(roles).filter((x) => x === 'creator').length).toBeLessThanOrEqual(1);
      for (const p of ps) if (roles[p.pid] !== 'creator') expect(miscast(roleFits(p), roles[p.pid]) ?? 'creator').toBe('creator');
    }
  });
});

describe('the controls', () => {
  it('set the mentality and the headline decisions, diff tactics for Keep changes, name every engine tag, and counter every edge the tactics give away', () => {
    {
      // mentality nudges the risk the whole system takes, and balanced plays the settings as they are
      const t = cloneTactics(user(baseLeague).tactics);
      expect(withMentality(t)).toBe(t);
      t.mentality = 2;
      const hot = withMentality(t);
      expect(hot.offense.pace).toBeGreaterThan(t.offense.pace);
      expect(hot.defense.getBack).toBeLessThan(t.defense.getBack);
      t.mentality = -2;
      const cold = withMentality(t);
      expect(cold.offense.crashBoards).toBeLessThan(t.offense.crashBoards);
      expect(applyPatch(t, { mentality: 1 }).mentality).toBe(1);
    }
    {
      // headline decisions: read and set what the half court plays through
      const o = cloneTactics(user(baseLeague).tactics).offense;
      for (const f of PLAY_FOCI) {
        applyFocus(o, f);
        expect(o.actions).toEqual(FOCUS_META[f].actions);
        expect(focusOf(o)).toBe(f);
      }
      // a mix far from every focus is its own
      o.actions = { pnr: 100, iso: 0, post: 100, handoff: 0, motion: 100 };
      expect(focusOf(o)).toBeNull();
      // and when a shot goes up, both ends at once
      const t = cloneTactics(user(baseLeague).tactics);
      GLASS_LEVELS.forEach((lv, i) => {
        setGlassLevel(t, i);
        expect([t.offense.crashBoards, t.defense.getBack]).toEqual([lv.crash, lv.getBack]);
        expect(glassLevel(t)).toBe(i);
      });
    }
    {
      // diffs give back the changed tactics when applied, except tonight's matchups, star, chase and hunt targets, instructions by player and a named junk defense
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
        expect(d.defense && ['matchups', 'starTarget', 'chase'].some((k) => k in d.defense!)).toBeFalsy();
        expect(d.offense && 'huntTarget' in d.offense).toBeFalsy();
        const back = applyPatch(a, d);
        const game = (t: Tactics) => ({
          matchups: t.defense.matchups,
          starTarget: t.defense.starTarget,
          chase: t.defense.chase,
          huntTarget: t.offense.huntTarget,
        });
        const { matchups, starTarget, chase, huntTarget } = game(b);
        // a junk defense named for their players is tonight's too: the scheme stays as it was
        const junk = namedJunk(b.defense);
        if (junk) expect(back.defense.scheme).toBe(a.defense.scheme);
        const withB = {
          ...back,
          offense: { ...back.offense, huntTarget },
          defense: { ...back.defense, matchups, starTarget, chase, ...(junk ? { scheme: b.defense.scheme } : {}) },
        };
        for (const x of [withB.offense, withB.defense] as Record<string, unknown>[]) for (const k of Object.keys(x)) if (x[k] === undefined) delete x[k];
        expect(withB).toEqual(b);
        expect(game(back)).toEqual(game(a));
        // the patch owns nothing of b's
        expect(back.offense.roles).not.toBe(b.offense.roles);
      }
      // empty between equal tactics, and carrying only what changed
      const a = defaultTactics();
      expect(emptyPatch(tacticsDiff(a, cloneTactics(a)))).toBe(true);
      const b = cloneTactics(a);
      b.defense.pnr = 'hedge';
      b.offense.actions.iso = 90;
      b.defense.matchups = { 3: 4 };
      expect(tacticsDiff(a, b)).toEqual({ offense: { actions: { iso: 90 } }, defense: { pnr: 'hedge' } });
    }
    {
      // a one-tap counter exists for every edge your tactics give away, and takes it away; none when they no longer do
      const keys = Object.keys(IMPACT_TEXT).filter((k) => IMPACT_TEXT[k].uses);
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
      // nothing for an edge without a tactical cause
      expect(impactCounter('mismatch_post:o', defaultTactics())).toBeUndefined();
      expect(impactCounter('nonsense', defaultTactics())).toBeUndefined();
    }
    // the staff has words for every engine tag of the shapes and the out-of-possession roles
    for (const key of [
      'shape_glass:o',
      'shape_glass:d',
      'shape_space:o',
      'shape_space:d',
      'shape_tov:o',
      'role_poa:d',
      'role_stopper:d',
      'role_anchor:d',
      'role_anchor:o',
      'role_roam:d',
      'role_roam:o',
    ]) {
      expect(IMPACT_TEXT[key], key).toBeDefined();
      expect(impactSentence(key, 'the Aces', 'the Bees', ' (Smith)')).toMatch(/^[A-Z].*\.$/);
    }
  });
});
