import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { GameSim, type SimTeamInput } from '../sim/engine';
import { applyPatch, type TacticsPatch } from '../ai/lab';
import { Rng } from '../random';
import type { Team } from '../types';

// The engine's rule bookkeeping: fouls, free throws, caps, late-game modes, play-by-play.
describe('engine rules', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
  const side = (tid: number, patch?: TacticsPatch, team?: Partial<Team>): SimTeamInput => ({
    team: { ...league.teams[tid], ...team, tactics: applyPatch(league.teams[tid].tactics, patch) },
    players: teamPlayers(league, tid),
  });
  // private engine internals, for rule-level checks
  type Internals = { T: { fouls: number; foulsLast2: number; on: { out: number; pid: number }[]; players: { out: number; pid: number; fouls: number; on: boolean }[] }[]; q: number; clock: number; bonus(t: unknown): boolean; chargeFoul(t: unknown, p: unknown): void; lateMode(off: unknown, def: unknown): { hurry: boolean }; };

  it('honors hard minute caps, crunch time included', () => {
    const team = league.teams[2];
    const star = team.rotation.order[0];
    let over = 0;
    let total = 0;
    for (let g = 0; g < 20; g++) {
      const res = new GameSim(side(2, undefined, { rotation: { ...team.rotation, caps: { [star]: 20 } } }), side(3), { rng: new Rng(40 + g), type: 'regular', injuries: false }).simToEnd();
      const min = res.home.players.find((p) => p.pid === star)!.min;
      total += min;
      if (min > 21) over++;
    }
    expect(over).toBe(0);
    expect(total / 20).toBeGreaterThan(17);
  });

  it('plays the coverage that was chosen, switching off the ball only off the ball', () => {
    const cov: Record<string, number> = {};
    for (let g = 0; g < 4; g++) {
      const sim = new GameSim(side(4, { defense: { scheme: 'man', pnr: 'drop', switchOffBall: true, starPlan: 'none' } }), side(5), { rng: new Rng(g), type: 'regular', record: true, injuries: false });
      sim.simToEnd();
      for (const l of sim.drainLogs()) if (l.off === 1 && l.coverage) cov[l.coverage] = (cov[l.coverage] ?? 0) + 1;
    }
    expect(cov.drop).toBeGreaterThan(20);
    expect(cov.switch ?? 0).toBe(0);
  });

  it('fouls a player out on his sixth foul, offensive fouls included', () => {
    const sim = new GameSim(side(0), side(1), { rng: new Rng(1), type: 'regular', injuries: false }) as unknown as Internals;
    const t = sim.T[0];
    const p = t.players.find((x) => x.on)!;
    p.fouls = 5;
    sim.chargeFoul(t, p);
    expect(p.out).toBe(1);
    expect(p.on).toBe(false);
    expect(t.on.length).toBe(5);
    expect(t.on.every((x) => x.out === 0)).toBe(true);
  });

  it('awards free throws only in the penalty, with the two-minute rule in every period and four fouls in overtime', () => {
    const sim = new GameSim(side(0), side(1), { rng: new Rng(1), type: 'regular', injuries: false }) as unknown as Internals;
    const t = sim.T[1];
    const at = (q: number, clock: number, fouls: number, last2: number) => {
      sim.q = q;
      sim.clock = clock;
      t.fouls = fouls;
      t.foulsLast2 = last2;
      return sim.bonus(t);
    };
    expect(at(2, 400, 4, 0)).toBe(false);
    expect(at(2, 400, 5, 0)).toBe(true);
    expect(at(2, 100, 2, 1)).toBe(false);
    expect(at(2, 100, 2, 2)).toBe(true);
    expect(at(5, 200, 3, 0)).toBe(false);
    expect(at(5, 200, 4, 0)).toBe(true);
  });

  it('books free throws without a shot to the action that drew them, and counts every attempt in usage', () => {
    for (let g = 0; g < 6; g++) {
      const sim = new GameSim(side(6), side(7), { rng: new Rng(70 + g), type: 'regular', record: true, injuries: false });
      const res = sim.simToEnd();
      for (const l of sim.drainLogs()) {
        if (l.steps.some((s) => s.k === 'ft') && !l.steps.some((s) => s.k === 'shot')) expect(['pnrBH', 'iso', 'misc']).toContain(l.finish);
      }
      for (const tb of [res.home, res.away]) {
        const onCourtFta = sim.rawBoxes().filter((r) => r.tid === tb.tid).reduce((a, r) => a + r.b.tFta, 0);
        expect(onCourtFta).toBe(5 * tb.t.fta);
      }
    }
  });

  it('counts fast-break points whether or not the game is recorded', () => {
    let quiet = 0;
    let recorded = 0;
    for (let g = 0; g < 6; g++) {
      for (const record of [false, true]) {
        const res = new GameSim(side(8), side(9), { rng: new Rng(90 + g), type: 'regular', record, injuries: false }).simToEnd();
        const fb = res.home.extra.fastBreak + res.away.extra.fastBreak;
        if (record) recorded += fb;
        else quiet += fb;
      }
    }
    expect(quiet).toBeGreaterThan(0);
    // cosmetic draws don't touch the simulation, so recording doesn't change the game
    expect(quiet).toBe(recorded);
  });

  it('hurries when two possessions down late, but not in a lost cause', () => {
    const sim = new GameSim(side(0), side(1), { rng: new Rng(1), type: 'regular', injuries: false }) as unknown as Internals & { T: { score: number }[] };
    const [off, def] = sim.T;
    sim.q = 4;
    const at = (clock: number, down: number) => {
      sim.clock = clock;
      off.score = 100;
      def.score = 100 + down;
      return sim.lateMode(off, def).hurry;
    };
    expect(at(50, 6)).toBe(true);
    expect(at(100, 9)).toBe(true);
    expect(at(150, 25)).toBe(false);
    expect(at(50, 2)).toBe(false);
    expect(at(400, 6)).toBe(false);
  });

  it('logs subs, timeouts and period changes, with clean punctuation and distinct names', () => {
    const res = new GameSim(side(10), side(11), { rng: new Rng(5), type: 'regular', record: true }).simToEnd();
    const pbp = res.pbp!;
    for (const kind of ['sub', 'timeout', 'period'] as const) expect(pbp.some((e) => e.kind === kind && e.text.length > 8)).toBe(true);
    for (const e of pbp) expect(e.text).not.toMatch(/[!.?]\.$|\.\.|\s\./);
    expect(res.flowPeriods!.slice(0, 4)).toEqual([...res.flowPeriods!.slice(0, 4)].sort((a, b) => a - b));
    expect(res.flowPeriods!.length).toBe(4 + res.ot);
    expect(res.flowPeriods![0]).toBe(0);
  });

  it('tells teammates who share a last name apart in play-by-play', () => {
    const base = side(12);
    const players = base.players.map((p, i) => (i < 3 ? { ...p, lastName: 'Williams', firstName: ['Jalen', 'Jaylin', 'Kenrich'][i] } : p));
    const sim = new GameSim({ ...base, players }, side(13), { rng: new Rng(3), type: 'regular' }) as unknown as { T: { players: { pid: number; name: string }[] }[] };
    const names = players.slice(0, 3).map((p) => sim.T[0].players.find((x) => x.pid === p.pid)!.name);
    expect(names).toEqual(['Jal. Williams', 'Jay. Williams', 'K. Williams']);
  });

  it("lets an AI coach adjust in-game, deterministically, and never touches the other team's plan", () => {
    const run = () => {
      const home = { ...side(14), adjust: true };
      const away = side(15);
      const before = JSON.stringify(away.team.tactics);
      let changes = 0;
      const results: number[] = [];
      for (let g = 0; g < 20; g++) {
        const sim = new GameSim(home, away, { rng: new Rng(200 + g), type: 'regular', record: true, injuries: false });
        const res = sim.simToEnd();
        changes += res.pbp!.filter((e) => e.text.includes('adjusts:')).length;
        expect(JSON.stringify((sim as unknown as { T: { t: unknown }[] }).T[1].t)).toBe(before);
        results.push(res.home.pts * 1000 + res.away.pts);
      }
      return { changes, results };
    };
    const a = run();
    expect(a.changes).toBeGreaterThan(0);
    expect(run()).toEqual(a);
  });
});
