// Tactics in the UI: the Tactics screen's board, its phases, playbook fit, change summaries and
// season insights; the live game's quick changes (a short curated row, each one a real
// change, a pressed one going back to the game plan, a Hack-a only when the engine would send that
// shooter to the line); and "Keep changes after this game" (tonight's changes go into the saved
// tactics, the game plan for tonight's opponent and tonight's matchups don't, and taking a change back
// takes it out again).
import { describe, expect, it } from 'vitest';
import { DEF_SPOTS, OFF_SPOTS, fitPts, place, startersOf, strengthsOf, type BoardPlayer, type Spot } from '../tactics/formation';
import { PHASES, phaseId } from '../tactics/phases';
import { byFit, fitTone, handOverLine, readText, shownFit, userStaffTactics } from '../tactics/fit';
import { defenseLabel } from '../../core/sim/playbooks';
import { screenChanges, changesLine } from '../tactics/changes';
import { seasonImpacts, seasonPlayTypes } from '../seasonAnalysis';
import { hackThreshold, livePills, offPlan, resetToPlan, type PillContext } from '../live/pills';
import { keptTactics } from '../live/keep';
import type { Quality, SystemReport } from '../../core/analysis/system';
import { offPresetFit, offPresetTerms, defPresetFit, defPresetTerms, type RosterProfile } from '../../core/ai/coachAI';
import { OFF_PRESETS, applyPatch, cloneTactics, defaultTactics, tacticsDiff } from '../../core/sim/tactics';
import { createLeague, defaultSettings } from '../../core/league/create';
import { simDay, startRegularSeason } from '../../core/league/season';
import type { Tactics } from '../../core/types';

const P = (pid: number, role: string, hgt: number, handle = 50, shoot = 50): BoardPlayer => ({ pid, role: role as BoardPlayer['role'], hgt, handle, shoot });

/** Two spots' plates clear each other: a plate's width (35) across or its height (18) down. */
const clear = (a: Spot, b: Spot) => Math.abs(a.x - b.x) >= 35 || Math.abs(a.y - b.y) >= 18;

/** A roster profile with every quality at `v` (and a given lead creator), no players behind them. */
function profile(v: number, starCreator = v): RosterProfile {
  const keys = [
    'starCreator',
    'creatorGap',
    'shooting',
    'passing',
    'bigPassing',
    'postScoring',
    'rimProtection',
    'athleticism',
    'size',
    'perimeterD',
    'depth',
    'steals',
    'bigMobility',
  ];
  const pr = Object.fromEntries(keys.map((k) => [k, v])) as unknown as RosterProfile;
  return { ...pr, starCreator, creatorGap: 8, depth: 5, drivers: Object.fromEntries(keys.map((k) => [k, []])) } as unknown as RosterProfile;
}

const ctx = (over: Partial<PillContext> = {}): PillContext => ({
  q: 2,
  clock: 400,
  oppOn: [
    { pid: 1, name: 'Shooter', ftPct: 0.88 },
    { pid: 2, name: 'Brick', ftPct: 0.52 },
  ],
  oppThreat: { pid: 1, name: 'Shooter' },
  ...over,
});

const ids = (t: Tactics, c: PillContext) => livePills(t, t, c).map((p) => p.id);
const press = (t: Tactics, plan: Tactics, c: PillContext, id: string) => {
  const p = livePills(t, plan, c).find((x) => x.id === id)!;
  const out = cloneTactics(t);
  p.apply(out);
  return out;
};

describe('tactics in the UI', () => {
  it('draws the board, reads its phases, fit, changes and insights, and makes and keeps live changes', () => {
    // every formation's five plates kept apart
    for (const spots of [...Object.values(OFF_SPOTS), ...Object.values(DEF_SPOTS)]) {
      expect(spots).toHaveLength(5);
      for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(clear(spots[i], spots[j]), `${spots[i].name} / ${spots[j].name}`).toBe(true);
    }

    // the creator on the ball and the bigs in the bigs' spots
    {
      const five = [P(1, 'shooter', 40, 40, 80), P(2, 'creator', 35, 85, 60), P(3, 'roller', 80, 20, 10), P(4, 'glue', 50, 45, 65), P(5, 'post', 75, 30, 20)];
      const twoIn = place(OFF_SPOTS.twoIn, five);
      expect(twoIn.size).toBe(5);
      expect(twoIn.get(2)!.kind).toBe('ball');
      expect(twoIn.get(3)!.kind).toBe('big');
      expect(twoIn.get(5)!.kind).toBe('big');
      // four-out: one big inside, the shooters in the corner or on a wing
      const fourOut = place(OFF_SPOTS.fourOut, five);
      expect(fourOut.get(3)!.kind).toBe('big');
      expect(['corner', 'wing']).toContain(fourOut.get(1)!.kind);
      // every player has his own spot
      expect(new Set([...fourOut.values()]).size).toBe(5);
    }

    // the point-of-attack stopper to the ball and the anchor to the paint, in man and in a zone
    {
      const five = [P(1, 'standard', 45), P(2, 'poa', 30), P(3, 'anchor', 85), P(4, 'stopper', 55), P(5, 'standard', 70)];
      const man = place(DEF_SPOTS.man, five);
      expect(man.get(2)!.kind).toBe('ball');
      expect(man.get(3)!.kind).toBe('anchor');
      const zone = place(DEF_SPOTS.zone23, five);
      expect(zone.get(3)!.kind).toBe('anchor');
      expect(zone.get(2)!.kind).toBe('top');
      // a junk defense's chaser is a stopper
      const box = place(DEF_SPOTS.box1, five);
      expect(['poa', 'stopper']).toContain(five.find((p) => box.get(p.pid)!.kind === 'chase')!.role);
    }

    // fewer than five placed without a fuss
    expect(place(OFF_SPOTS.fiveOut, [P(1, 'creator', 40)]).size).toBe(1);
    expect(place(OFF_SPOTS.fiveOut, []).size).toBe(0);

    // a shape's fit in points per 100
    expect(fitPts(11)).toBe('+1.1');
    expect(fitPts(-9.4)).toBe('−0.9');
    expect(fitPts(0.3)).toBe('±0');

    // the three phases, and an old link's phase as its new one
    {
      expect(PHASES.map((p) => p.id)).toEqual(['inPoss', 'inTrans', 'outPoss']);
      expect(phaseId('defTrans')).toBe('inTrans');
      expect(phaseId('outPoss')).toBe('outPoss');
      expect(phaseId(null)).toBe('inPoss');
      expect(phaseId('nonsense')).toBe('inPoss');
    }

    // the board: the rotation's first five start and the rest are benched, anyone it leaves out last
    {
      const ps = [1, 2, 3, 4, 5, 6, 7].map((pid) => ({ pid }));
      const { five, bench } = startersOf([7, 6, 5, 4, 3], ps);
      expect(five.map((p) => p.pid)).toEqual([7, 6, 5, 4, 3]);
      expect(bench.map((p) => p.pid)).toEqual([1, 2]);
      expect(startersOf([], ps.slice(0, 3)).bench).toEqual([]);
    }

    // grades: the two best and two worst named, never one as both
    {
      const q = (id: string, rank: number) => ({ id, rank, of: 30, raw: 0, grade: 'B', parts: [] }) as unknown as Quality;
      const r: SystemReport = { off: [q('creation', 3), q('spacing', 1), q('rim', 20)], def: [q('rimD', 28), q('perimD', 2)] };
      const { strengths, weaknesses } = strengthsOf(r);
      expect(strengths.map((x) => x.id)).toEqual(['spacing', 'perimD']);
      expect(weaknesses.map((x) => x.id)).toEqual(['rimD', 'rim']);
      // three grades: two strengths leave one weakness
      const small: SystemReport = { off: [q('creation', 1), q('spacing', 2)], def: [q('rimD', 3)] };
      expect(strengthsOf(small).weaknesses.map((x) => x.id)).toEqual(['rimD']);
    }

    // playbook fit as shown, the staff's read in points a game: its start and parts add up to its worth
    // against an average playbook exactly, and the row says what it's worth against the one in use
    for (const pr of [profile(50), profile(62, 85), profile(40, 70)]) {
      for (const [terms, fits] of [
        [offPresetTerms(pr), offPresetFit(pr)],
        [defPresetTerms(pr), defPresetFit(pr)],
      ] as const) {
        const ids = Object.keys(fits);
        for (const id of ids) {
          const f = shownFit(id, terms[id], fits, ids[0]);
          expect(Math.round((f.start + f.parts.reduce((a, p) => a + p.v, 0)) * 10) + 0).toBe(Math.round(f.total * 10) + 0);
          expect(f.vs).toBeCloseTo((fits[id] - fits[ids[0]]) / 10, 1);
          expect(shownFit(id, terms[id], fits, id).vs).toBe(0);
        }
      }
    }
    // the best ranked first
    {
      const fits = offPresetFit(profile(62, 85));
      const order = byFit(OFF_PRESETS, fits);
      expect(fits[order[0].id]).toBe(Math.max(...Object.values(fits)));
      expect(shownFit(order[0].id, offPresetTerms(profile(62, 85))[order[0].id], fits, 'balanced').rank).toBe(1);
    }
    // half a point a game either way reads as a gain or a cost, as a measured change does
    expect([fitTone(0.6), fitTone(0.5), fitTone(0.4), fitTone(-0.4), fitTone(-0.5)]).toEqual(['good', 'good', '', '', 'bad']);
    expect([readText(0.6), readText(-1.24), readText(0)]).toEqual(['+0.6', '−1.2', '0.0']);
    {
      // the hand-over names what the staff would run and its read against the user's; a moved playbook reads as Custom
      const l = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
      const staff = userStaffTactics(l);
      expect(handOverLine(l, staff)).toMatch(/^The staff would keep .+ · .+, with their own settings, roles and shape\.$/);
      const t = l.teams[0].tactics;
      const other = staff.defPreset === 'hedge' ? 'drop' : 'hedge';
      l.teams[0].tactics = { ...t, defPreset: other, defense: applyPatch(t, { defense: { scheme: 'man' } }).defense, manual: true };
      expect(handOverLine(l, staff)).toMatch(/^Staff would run .+ · .+: \+\d\.\d a game against yours \(the staff's read\)\.$/);
      expect(defenseLabel(l.teams[0].tactics)).toMatch(/^Custom .+$/);
    }

    // changes name each setting as its control on the Tactics screen
    {
      const a = defaultTactics('balanced', 'drop');
      const b = cloneTactics(a);
      b.defense.pnr = 'hedge';
      b.defense.scheme = 'zone23';
      b.offense.crashBoards = 100;
      expect(changesLine(screenChanges(a, b))).toBe('Crash the offensive glass: Balanced → Crash hard · Scheme: Man-to-man → 2-3 Zone · Ball-screen coverage: Drop → Hedge');
    }

    // season aggregates behind the Insights tab
    {
      const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
      startRegularSeason(league);
      for (let i = 0; i < 6; i++) simDay(league);
      const played = (tid: number) => league.games.filter((g) => g.home.tid === tid || g.away.tid === tid).length;
      // every game that tracked effects counted, however small each effect is
      const { games, effects } = seasonImpacts(league);
      expect(games).toBe(played(0));
      expect(games).toBeGreaterThan(0);
      // the Insights tab lists only the bigger ones: its "N games" can't come from that list
      expect(effects.some((x) => x.perGame < 0.3)).toBe(true);
      // a team taken over mid-season has play types from before, but no tracked games
      const other = league.teams.find((t) => t.tid !== 0 && played(t.tid) > 0)!.tid;
      expect(seasonPlayTypes(league, other).length).toBeGreaterThan(0);
      expect(seasonImpacts(league, other)).toEqual({ games: 0, effects: [] });
    }

    // live pills: a game plan's Hack-a targets counted, shown on, and pressed off stops them (and the quarter they wait for) too
    {
      const t = defaultTactics();
      t.manage.hackTargets = [2];
      t.manage.hackFromQ = 3;
      expect(livePills(t, t, ctx()).find((p) => p.id === 'hack')!.on).toBe(true);
      const off = press(t, t, ctx(), 'hack');
      expect(off.manage.hackTargets).toBeUndefined();
      expect(off.manage.hackFromQ).toBeUndefined();
      expect(off.manage.hackThreshold).toBe(0);
      // a plan hacking someone who isn't on the floor: Stop Hack-a-player is offered
      const away = defaultTactics();
      away.manage.hackTargets = [99];
      const stop = livePills(away, away, ctx({ oppOn: [{ pid: 1, name: 'Shooter', ftPct: 0.88 }] })).find((p) => p.id === 'hack')!;
      expect(stop.label).toBe('Stop Hack-a-player');
      // hacking from now on starts a plan's later quarter now
      const later = defaultTactics();
      later.manage.hackFromQ = 4;
      const on = press(later, later, ctx({ q: 2 }), 'hack');
      expect(on.manage.hackThreshold).toBe(hackThreshold(0.52));
      expect(on.manage.hackFromQ).toBe(2);
    }

    // a short curated row, slowing it down instead of pushing only to protect a lead in the fourth
    {
      const t = defaultTactics();
      expect(ids(t, ctx({ q: 4 }))).toEqual(['zone', 'push', 'pack', 'getback', 'double', 'hack']);
      expect(ids(t, ctx({ q: 4, margin: 6 }))).toEqual(['zone', 'slow', 'pack', 'getback', 'double', 'hack']);
      // a lead earlier on: still push
      expect(ids(t, ctx({ q: 2, margin: 6 }))).toContain('push');
      // never more than seven
      expect(livePills(t, t, ctx({ q: 4 })).length).toBeLessThanOrEqual(7);
      // the one in effect stays on offer, pressed, whatever the score
      const fast = press(t, t, ctx(), 'push');
      expect(livePills(fast, t, ctx({ q: 4, margin: 6 })).find((p) => p.id === 'push')!.on).toBe(true);
      const slow = press(t, t, ctx({ q: 4, margin: 6 }), 'slow');
      expect(slow.offense.pace).toBe(20);
      expect(livePills(slow, t, ctx({ q: 1, margin: -4 })).find((p) => p.id === 'slow')!.on).toBe(true);
    }

    // each changes something, and pressed goes back to the game plan
    {
      const plan = defaultTactics();
      plan.offense.pace = 45;
      const fast = press(plan, plan, ctx(), 'push');
      expect(fast.offense.pace).toBe(80);
      expect(livePills(fast, plan, ctx()).find((p) => p.id === 'push')!.on).toBe(true);
      expect(press(fast, plan, ctx(), 'push').offense.pace).toBe(45);
      const zone = press(plan, plan, ctx(), 'zone');
      expect(zone.defense.scheme).toBe('zone23');
      expect(press(zone, plan, ctx(), 'man').defense.scheme).toBe('man');
      const doubled = press(plan, plan, ctx(), 'double');
      expect([doubled.defense.starPlan, doubled.defense.starTarget]).toEqual(['double', 1]);
      expect(press(doubled, plan, ctx(), 'double').defense.starPlan).toBe('none');
    }

    // a Hack-a offered on their worst free-throw shooter, only while it is legal, at a threshold that targets him
    {
      const t = defaultTactics();
      const pill = livePills(t, t, ctx()).find((p) => p.id === 'hack')!;
      expect(pill.label).toBe('Hack-a-Brick');
      const after = press(t, t, ctx(), 'hack');
      expect(after.manage.hackThreshold).toBe(hackThreshold(0.52));
      // the engine fouls a player whose FT% × 100 is under the threshold
      expect(0.52 * 100 < after.manage.hackThreshold).toBe(true);
      expect(0.88 * 100 < after.manage.hackThreshold).toBe(false);
      expect(livePills(after, t, ctx()).find((p) => p.id === 'hack')!.on).toBe(true);
      // the last two minutes of a period: no hack (the engine wouldn't foul)
      expect(ids(t, ctx({ clock: 100 }))).not.toContain('hack');
      // nobody bad enough from the line
      expect(ids(t, ctx({ oppOn: [{ pid: 1, name: 'Shooter', ftPct: 0.88 }] }))).not.toContain('hack');
    }

    // the tactics known to be off the game plan, and the reset gets them back
    {
      const plan = defaultTactics();
      expect(offPlan(plan, plan)).toBe(false);
      const t = press(press(plan, plan, ctx(), 'push'), plan, ctx(), 'pack');
      t.defense.matchups = { 7: 3 };
      expect(offPlan(t, plan)).toBe(true);
      const back = cloneTactics(t);
      resetToPlan(back, plan);
      expect(back).toEqual(plan);
    }

    // kept tactics
    {
      const saved = defaultTactics();
      saved.defense.matchups = { 40: 2 };
      // tonight's game plan: hedge their ball screens, and who guards whom
      const planned = applyPatch(saved, { defense: { pnr: 'hedge' } });
      planned.defense.matchups = { 7: 3 };

      // what changed tonight taken in, from before it was turned on too
      {
        const now = cloneTactics(planned);
        now.offense.pace = 85;
        now.defense.help = 20;
        const kept = keptTactics(saved, planned, now);
        expect([kept.offense.pace, kept.defense.help, kept.manual]).toEqual([85, 20, true]);
        // the plan's coverage stays the plan's
        expect(kept.defense.pnr).toBe(saved.defense.pnr);
      }

      // tonight's matchups or star target never saved
      {
        const now = cloneTactics(planned);
        now.defense.matchups = { 7: 4, 9: 1 };
        now.defense.starPlan = 'double';
        now.defense.starTarget = 7;
        const kept = keptTactics(saved, planned, now);
        expect(kept.defense.matchups).toEqual({ 40: 2 });
        expect([kept.defense.starPlan, kept.defense.starTarget]).toEqual(['double', null]);
      }

      // what was taken off tonight taken off (a setting whose key the screens delete)
      {
        const plannedOn = cloneTactics(planned);
        plannedOn.manage.atoPid = 7;
        plannedOn.manage.assistantAdjusts = true;
        const now = cloneTactics(plannedOn);
        delete now.manage.atoPid;
        delete now.manage.assistantAdjusts;
        const savedOn = cloneTactics(saved);
        Object.assign(savedOn.manage, { atoPid: 7, assistantAdjusts: true });
        const kept = keptTactics(savedOn, plannedOn, now);
        expect(kept.manage).not.toHaveProperty('atoPid');
        expect(kept.manage).not.toHaveProperty('assistantAdjusts');
        // the diff gives tonight's tactics back from the plan, as it says
        expect(applyPatch(plannedOn, tacticsDiff(plannedOn, now))).toEqual(now);
      }

      // back to the saved tactics when tonight is back to the plan
      {
        const now = cloneTactics(planned);
        now.offense.pace = 85;
        expect(keptTactics(saved, planned, now)).not.toEqual(saved);
        expect(keptTactics(saved, planned, cloneTactics(planned))).toEqual(saved);
      }
    }
  });
});
