// The bench (live/staff.ts): who's scoring on whom from the possession logs, the staff's calls (a hot
// scorer with who could take him, the defender of theirs you're beating, your own actions stalling),
// each with real changes on offer, and its read of the game in a sentence.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../../core/league/create';
import { teamPlayers } from '../../core/league/helpers';
import { GameSim } from '../../core/sim/engine';
import { Rng } from '../../core/random';
import { composites } from '../../core/ratings';
import { cloneTactics } from '../../core/sim/tactics';
import { DEFAULT_PPP } from '../../core/analysis/playTypes';
import type { PossLog } from '../../core/sim/log';
import { snapshot } from '../live/drawn';
import { finisher, matchups, staffNotes, staffRead, sumBy, type StaffInput } from '../live/staff';

function game(seed = 5) {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
  const sim = new GameSim(
    { team: league.teams[0], players: teamPlayers(league, 0), adjust: false },
    { team: league.teams[1], players: teamPlayers(league, 1), adjust: true },
    { rng: new Rng(seed), type: 'regular', record: true, keepShots: true, injuries: false },
  );
  const logs: PossLog[] = [];
  return { league, sim, logs };
}

function input(g: ReturnType<typeof game>, over: Partial<StaffInput> = {}): StaffInput {
  const { league, sim } = g;
  return {
    view: snapshot(sim, g.logs.length),
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
    logs: g.logs,
    defense: (pid) => {
      const p = league.players[pid];
      const c = composites(p.ratings);
      return { per: c.perDef, int: c.intDef, hgt: p.ratings.hgt };
    },
    ...over,
  };
}

const play = (g: ReturnType<typeof game>, n: number) => {
  for (let i = 0; i < n && !g.sim.over; i++) {
    g.sim.step();
    g.logs.push(...g.sim.drainLogs());
  }
};

describe('the bench', () => {
  it('credits each trip to the player who finished it and the defender on him', () => {
    const g = game();
    play(g, 120);
    for (const l of g.logs.slice(0, 40)) {
      const f = finisher(l);
      if (f !== undefined) expect([...l.on[0], ...l.on[1]]).toContain(f);
    }
    const theirs = matchups(g.logs, 1);
    const trips = theirs.reduce((a, r) => a + r.trips, 0);
    const pts = theirs.reduce((a, r) => a + r.pts, 0);
    // (free-throw-only trips aren't a matchup)
    expect(trips).toBeGreaterThan(30);
    expect(pts).toBeLessThanOrEqual(g.logs.filter((l) => l.off === 1).reduce((a, l) => a + l.pts, 0));
    expect([...sumBy(theirs, 'def').keys()].every((pid) => g.sim.T[0].players.some((p) => p.pid === pid))).toBe(true);
  });

  it('calls out their hot scorer with real changes: a better defender on him, deny or double', () => {
    const g = game();
    play(g, 60);
    const base = input(g);
    // their scorer, made hot
    const view = structuredClone(base.view);
    const them = view.sides[1];
    const star = them.players.find((p) => them.on.includes(p.pid))!;
    Object.assign(star, { pts: 16, fgm: 7, fga: 9, streak: 4 });
    const notes = staffNotes({ ...base, view });
    const hot = notes.find((n) => n.id === `hot-${star.pid}`)!;
    expect(hot.kind).toBe('decision');
    expect(hot.fig).toEqual({ v: '16', unit: 'pts' });
    const t = cloneTactics(base.tactics);
    for (const a of hot.actions) if (a.kind === 'tactics') a.apply(t);
    // every action changes something: the last applied doubles him
    expect([t.defense.starPlan, t.defense.starTarget]).toEqual(['double', star.pid]);
    // once he's targeted, the staff doesn't ask again
    expect(staffNotes({ ...base, view, tactics: t }).some((n) => n.id === `hot-${star.pid}`)).toBe(false);
  });

  it("says what's working and stalling on your own end, with a change to lean into or away from it", () => {
    const g = game();
    play(g, 60);
    const base = input(g);
    const view = structuredClone(base.view);
    view.sides[0].pt.iso = { poss: 14, pts: 4 };
    view.sides[0].pt.pnrBH = { poss: 14, pts: 26 };
    const t = cloneTactics(base.tactics);
    t.offense.actions.iso = 60;
    t.offense.actions.pnr = 50;
    const notes = staffNotes({ ...base, view, tactics: t });
    const cold = notes.find((n) => n.id === 'cold-iso')!;
    const warm = notes.find((n) => n.id === 'work-pnrBH')!;
    expect(cold.tone).toBe('warn');
    expect(warm.tone).toBe('good');
    const x = cloneTactics(t);
    if (cold.actions[0].kind === 'tactics') cold.actions[0].apply(x);
    expect(x.offense.actions.iso).toBeLessThan(t.offense.actions.iso);
    expect(x.offense.actions.motion).toBeGreaterThan(t.offense.actions.motion);
  });

  it('reads the game in a sentence: the score early, then the biggest edges in the box score', () => {
    const g = game();
    play(g, 2);
    expect(staffRead(input(g))).toMatch(/Early/);
    play(g, 80);
    const read = staffRead(input(g));
    expect(read.length).toBeGreaterThan(10);
    expect(read).toMatch(/\.$/);
  });
});
