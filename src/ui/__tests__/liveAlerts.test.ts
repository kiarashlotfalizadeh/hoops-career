// The live assistant reads the game as the court has drawn it: a snapshot taken before a step
// says the same thing however far the sim has run since, and its alerts only speak up when the
// staff won't handle it (tired legs, foul trouble, runs) or when a decision is the coach's alone.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../../core/league/create';
import { teamPlayers } from '../../core/league/helpers';
import { GameSim } from '../../core/sim/engine';
import { Rng } from '../../core/random';
import { DEFAULT_PPP } from '../../core/analysis/playTypes';
import { snapshot, streaks, type Drawn } from '../live/drawn';
import { foulLimit, liveAlerts, newEvents, staffCallsTimeout, type AlertInput } from '../live/alerts';

function game(seed = 5) {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
  const sim = new GameSim(
    { team: league.teams[0], players: teamPlayers(league, 0), adjust: false },
    { team: league.teams[1], players: teamPlayers(league, 1), adjust: true },
    { rng: new Rng(seed), type: 'regular', record: true, keepShots: true, injuries: false },
  );
  return { league, sim };
}

function input(g: ReturnType<typeof game>, view: Drawn, over: Partial<AlertInput> = {}): AlertInput {
  const { league, sim } = g;
  return {
    view,
    side: 0,
    teams: [league.teams[0], league.teams[1]],
    tactics: sim.baseTactics(0),
    manualSubs: false,
    atBreak: false,
    timeoutPending: false,
    events: [],
    names: (pid) => `P${pid}`,
    baselines: DEFAULT_PPP,
    subFor: (pid) => sim.T[0].players.find((p) => !p.on && p.out === 0 && p.pid !== pid)?.pid,
    ...over,
  };
}

/** A copy of a snapshot with one of the user's players on the floor changed. */
function withPlayer(view: Drawn, i: number, patch: Partial<Drawn['sides'][0]['players'][0]>): Drawn {
  const v = structuredClone(view);
  const pid = v.sides[0].on[i];
  Object.assign(
    v.sides[0].players.find((p) => p.pid === pid)!,
    patch,
  );
  return v;
}

/** Alerts without their action functions, to compare. */
const plain = (a: ReturnType<typeof liveAlerts>) => a.map((x) => ({ ...x, action: x.action && { ...x.action, apply: undefined } }));

describe('live alerts', () => {
  it('come from the drawn snapshot: the sim running on changes nothing they say', () => {
    const g = game();
    for (let i = 0; i < 60; i++) g.sim.step();
    const view = snapshot(g.sim);
    const before = plain(liveAlerts(input(g, view)));
    const box = JSON.stringify(view.box);
    for (let i = 0; i < 40; i++) g.sim.step();
    expect(plain(liveAlerts(input(g, view)))).toEqual(before);
    expect(JSON.stringify(view.box)).toBe(box);
    expect(view.sides[0].score + view.sides[1].score).toBeLessThan(g.sim.T[0].score + g.sim.T[1].score);
  });

  it('only flag tired legs when the staff won’t sub them out: manual subs or crunch time', () => {
    const g = game();
    for (let i = 0; i < 30; i++) g.sim.step();
    const view = withPlayer(snapshot(g.sim), 0, { energy: 0.4 });
    const tired = (a: AlertInput) => liveAlerts(a).filter((x) => x.id.startsWith('tired-'));
    expect(view.q).toBeLessThan(4);
    expect(tired(input(g, view))).toEqual([]);
    const manual = tired(input(g, view, { manualSubs: true }));
    expect(manual).toHaveLength(1);
    expect(manual[0].action?.kind).toBe('sub');
    // below the coach's own line only: a lower "sub out tired players at" quiets it
    const t = g.sim.baseTactics(0);
    t.manage.fatigueSub = 0.35;
    expect(tired(input(g, view, { manualSubs: true, tactics: t }))).toEqual([]);
    const crunch = structuredClone(view);
    crunch.q = 4;
    crunch.clock = 200;
    expect(tired(input(g, crunch))).toHaveLength(1);
  });

  it('flag 5 fouls in the fourth quarter with a Sit him button, crunch time or not', () => {
    const g = game();
    for (let i = 0; i < 30; i++) g.sim.step();
    const view = withPlayer(snapshot(g.sim), 1, { fouls: 5 });
    const pid = view.sides[0].on[1];
    expect(liveAlerts(input(g, view)).filter((x) => x.id.startsWith('fouls-'))).toEqual([]);
    for (const clock of [500, 100]) {
      const late = structuredClone(view);
      late.q = 4;
      late.clock = clock;
      const a = liveAlerts(input(g, late)).filter((x) => x.id.startsWith('fouls-'));
      expect(a).toHaveLength(1);
      expect(a[0].text).toContain('5 fouls');
      expect(a[0].action).toMatchObject({ kind: 'sub', out: pid, label: 'Sit him' });
    }
  });

  it("flag foul trouble at the staff's limit only when you handle subs", () => {
    const g = game();
    for (let i = 0; i < 20; i++) g.sim.step();
    const view = withPlayer(snapshot(g.sim), 2, { fouls: foulLimit(1, 'standard') });
    expect(view.q).toBe(1);
    expect(liveAlerts(input(g, view)).some((x) => x.id.startsWith('fouls-'))).toBe(false);
    const a = liveAlerts(input(g, view, { manualSubs: true })).find((x) => x.id.startsWith('fouls-'));
    expect(a?.action?.label).toBe('Sit him');
    expect(foulLimit(2, 'strict')).toBe(2);
    expect(foulLimit(4, 'loose')).toBe(6);
    expect(foulLimit(6, 'standard')).toBe(5);
  });

  it("offer a timeout against a run the staff won't stop, saying what a timeout really does", () => {
    const g = game();
    for (let i = 0; i < 20; i++) g.sim.step();
    const view = structuredClone(snapshot(g.sim));
    view.sides[1].run = 9;
    view.sides[0].timeouts = 5;
    // the staff calls its own at 8-0 (a run is only the coach's call with manual subs or auto timeouts off)
    expect(staffCallsTimeout(view, 0, g.sim.baseTactics(0).manage, false)).toBe(true);
    expect(liveAlerts(input(g, view)).some((x) => x.id.startsWith('run-'))).toBe(false);
    const run = liveAlerts(input(g, view, { manualSubs: true })).find((x) => x.id.startsWith('run-'))!;
    expect(run.action?.kind).toBe('timeout');
    expect(run.text).toMatch(/rests legs.*resets the run.*their coach a chance to adjust/);
    expect(run.text).not.toMatch(/momentum/i);
    // already called, or at a break: nothing to offer
    expect(liveAlerts(input(g, view, { manualSubs: true, timeoutPending: true })).some((x) => x.id.startsWith('run-'))).toBe(false);
    expect(liveAlerts(input(g, view, { manualSubs: true, atBreak: true })).some((x) => x.id.startsWith('run-'))).toBe(false);
  });

  it('turn injuries, foul-outs and the other coach’s adjustments into events, then alerts for a couple of minutes', () => {
    const g = game();
    for (let i = 0; i < 30; i++) g.sim.step();
    const prev = snapshot(g.sim);
    const next = structuredClone(prev);
    const mine = next.sides[0].on[0];
    next.sides[0].players.find((p) => p.pid === mine)!.out = 1;
    next.adjustments = prev.adjustments + 1;
    next.injuries = prev.injuries + 1;
    const theirs = next.sides[1].on[0];
    const adjustments = [...g.sim.adjustments.slice(0, prev.adjustments), { t: 1 as const, q: 1, clock: 300, text: 'hedges ball screens instead of dropping' }];
    const injuries = [...g.sim.injuries.slice(0, prev.injuries), { pid: theirs, tid: g.league.teams[1].tid, q: 1 }];
    const ev = newEvents(prev, next, adjustments, injuries, [g.league.teams[0], g.league.teams[1]], (pid) => `P${pid}`);
    expect(ev.map((e) => [e.kind, e.side])).toEqual([
      ['injury', 1],
      ['foulout', 0],
      ['adjust', 1],
    ]);
    expect(ev[2].text).toBe(`${g.league.teams[1].abbrev} adjusts: hedges ball screens instead of dropping.`);
    // nothing new the next time round
    expect(newEvents(next, next, adjustments, injuries, [g.league.teams[0], g.league.teams[1]], (pid) => `P${pid}`)).toEqual([]);
    const a = liveAlerts(input(g, next, { events: ev }));
    // yours and the other coach's change; their injury is a banner only
    expect(a.map((x) => x.id).filter((id) => /^(inj|fo|adj)-/.test(id))).toEqual([`fo-${mine}`, ev[2].id]);
    const later = structuredClone(next);
    later.elapsed += 200;
    expect(liveAlerts(input(g, later, { events: ev })).some((x) => /^(inj|fo|adj)-/.test(x.id))).toBe(false);
  });

  it('turn the biggest edge against you into a one-tap fix', () => {
    const g = game();
    for (let i = 0; i < 40; i++) g.sim.step();
    const t = g.sim.baseTactics(0);
    t.defense.scheme = 'man';
    t.defense.pnr = 'drop';
    const view = structuredClone(snapshot(g.sim));
    view.impacts = [{ key: 'drop_pullup:o', t: 1, count: 6, pts: 4.2, players: {} }];
    const a = liveAlerts(input(g, view, { tactics: t })).find((x) => x.id === 'imp-drop_pullup:o')!;
    expect(a.action?.kind).toBe('tactics');
    if (a.action?.kind !== 'tactics') return;
    a.action.apply(t);
    expect(t.defense.pnr).not.toBe('drop');
    // fixed: the edge no longer applies, so nothing more to say about it
    expect(liveAlerts(input(g, view, { tactics: t })).some((x) => x.id === 'imp-drop_pullup:o')).toBe(false);
  });

  it('count straight makes and misses from the shot log', () => {
    const s = streaks([
      { pid: 1, made: true },
      { pid: 2, made: false },
      { pid: 1, made: true },
      { pid: 1, made: true },
      { pid: 2, made: false },
      { pid: 3, made: true },
      { pid: 3, made: false },
    ]);
    expect([s.get(1), s.get(2), s.get(3)]).toEqual([3, -2, -1]);
  });
});
