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
  type Internals = {
    T: { fouls: number; foulsLast2: number; on: { out: number; pid: number }[]; players: { out: number; pid: number; fouls: number; on: boolean }[] }[];
    q: number;
    clock: number;
    bonus(t: unknown): boolean;
    chargeFoul(t: unknown, p: unknown): void;
    lateMode(off: unknown, def: unknown): { hurry: boolean };
  };

  it('honors hard minute caps, crunch time included', () => {
    const team = league.teams[2];
    const star = team.rotation.order[0];
    let over = 0;
    let total = 0;
    for (let g = 0; g < 20; g++) {
      const res = new GameSim(side(2, undefined, { rotation: { ...team.rotation, caps: { [star]: 20 } } }), side(3), {
        rng: new Rng(40 + g),
        type: 'regular',
        injuries: false,
      }).simToEnd();
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
      const sim = new GameSim(side(4, { defense: { scheme: 'man', pnr: 'drop', switchOffBall: true, starPlan: 'none' } }), side(5), {
        rng: new Rng(g),
        type: 'regular',
        record: true,
        injuries: false,
      });
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

  it('never plays four: a sixth foul with nobody left costs a technical, and the last man disqualified comes back for an injured one', () => {
    type SP = { out: number; pid: number; fouls: number; on: boolean; outAt?: number };
    type Short = {
      T: { on: SP[]; players: SP[]; tot: { fta: number } }[];
      chargeFoul(t: unknown, p: unknown): void;
      replace(t: unknown, p: unknown): boolean;
    };
    const sim = new GameSim(side(0), side(1), { rng: new Rng(4), type: 'regular', injuries: false }) as unknown as Short;
    const [t, opp] = sim.T;
    const bench = t.players.filter((x) => !x.on);
    bench.forEach((x, i) => {
      x.out = i < 2 ? 1 : 2;
      x.fouls = i < 2 ? 6 : 0;
      x.outAt = i < 2 ? 100 * (i + 1) : undefined;
    });
    const p = t.on[0];
    p.fouls = 5;
    const fta = opp.tot.fta;
    sim.chargeFoul(t, p);
    expect(p.out).toBe(1);
    expect(p.on).toBe(true);
    expect(t.on.length).toBe(5);
    expect(opp.tot.fta).toBe(fta + 1);
    // an injury with no healthy sub: the most recently disqualified player (bench[1]) returns
    const hurt = t.on[1];
    hurt.out = 2;
    expect(sim.replace(t, hurt)).toBe(true);
    expect(hurt.on).toBe(false);
    expect(bench[1].on).toBe(true);
    expect(new Set(t.on.map((x) => x.pid)).size).toBe(5);
  });

  it('plays exactly 48 minutes (box score included), books the opening five as starters and gets a shot off late in a period', () => {
    for (let g = 0; g < 4; g++) {
      const sim = new GameSim(side(2), side(3), { rng: new Rng(300 + g), type: 'regular', injuries: false });
      const opening = sim.T.map((t) => t.on.map((p) => p.pid).sort((a, b) => a - b));
      const res = sim.simToEnd();
      const total = 5 * (48 + 5 * res.ot) * 60;
      for (const [i, tb] of [res.home, res.away].entries()) {
        expect(Math.abs(sim.T[i].players.reduce((a, p) => a + p.b.sec, 0) - total)).toBeLessThan(1e-6);
        // the box score adds up too, to the tenth, and nobody who got on the floor shows 0 minutes
        expect(Math.round(tb.players.reduce((a, p) => a + p.min, 0) * 10)).toBe(total / 6);
        for (const p of sim.T[i].players) expect(tb.players.find((x) => x.pid === p.pid)!.min > 0).toBe(p.b.sec > 0);
        expect(
          tb.players
            .filter((p) => p.gs)
            .map((p) => p.pid)
            .sort((a, b) => a - b),
        ).toEqual(opening[i]);
      }
    }
    // five seconds left before the half: the offense gets a shot (or a trip to the line) off; eight
    // seconds left in a 12-point game, the leader lets the clock run out instead
    const lastPossession = (q: number, clock: number, lead: number) => {
      let shots = 0;
      for (let g = 0; g < 20; g++) {
        const sim = new GameSim(side(4), side(5), { rng: new Rng(500 + g), type: 'regular', injuries: false }) as unknown as Internals & {
          T: { tot: { fga: number; fta: number; tov: number }; score: number }[];
          poss: number;
          step(): boolean;
        };
        sim.q = q;
        sim.clock = clock;
        sim.T[sim.poss].score += lead;
        const off = sim.T[sim.poss].tot;
        const before = off.fga + off.fta + off.tov;
        sim.step();
        if (off.fga + off.fta + off.tov > before) shots++;
      }
      return shots;
    };
    expect(lastPossession(2, 5, 0)).toBeGreaterThanOrEqual(18);
    expect(lastPossession(4, 8, 12)).toBeLessThanOrEqual(2);
  });

  it('brings the starters back as soon as a blowout gets back within reach', () => {
    type G = {
      q: number;
      clock: number;
      T: { score: number; garbage: boolean; subSig: string; on: { pid: number }[]; t: Team['tactics']; team: Team }[];
      subSignature(t: unknown): string;
      checkSubs(t: unknown): void;
    };
    const sim = new GameSim(side(6), side(7), { rng: new Rng(8), type: 'regular', injuries: false }) as unknown as G;
    const t = sim.T[0];
    sim.q = 4;
    sim.clock = 100;
    t.score = 100;
    sim.T[1].score = 85;
    t.garbage = true;
    sim.checkSubs(t);
    const starters = t.team.rotation.order.slice(0, 5);
    expect(t.on.some((p) => starters.includes(p.pid))).toBe(false);
    // a deep-bench player who gets hurt is replaced from the deep bench, not by a starter
    const hurt = t.on[0] as { pid: number; out: number };
    hurt.out = 2;
    (sim as unknown as { replace(t: unknown, p: unknown): boolean }).replace(t, hurt);
    expect(t.on.some((p) => starters.includes(p.pid))).toBe(false);
    // the lead falls to 8 with 1:40 left: no minute mark or fatigue change needed to react
    t.subSig = sim.subSignature(t);
    sim.T[1].score = 92;
    sim.checkSubs(t);
    expect(t.garbage).toBe(false);
    expect(t.on.filter((p) => starters.includes(p.pid)).length).toBeGreaterThanOrEqual(3);
  });

  it('empties the bench as soon as a game turns into a blowout, and lets manual subs expire', () => {
    type G = {
      q: number;
      clock: number;
      elapsed: number;
      T: { score: number; garbage: boolean; subSig: string; subLock: Map<number, number>; on: { pid: number }[]; team: Team }[];
      subSignature(t: unknown): string;
      checkSubs(t: unknown): void;
    };
    const game = new GameSim(side(6), side(7), { rng: new Rng(8), type: 'regular', injuries: false });
    const sim = game as unknown as G;
    const t = sim.T[0];
    sim.q = 4;
    sim.clock = 160;
    t.score = 100;
    sim.T[1].score = 82;
    sim.checkSubs(t);
    expect(t.garbage).toBe(false);
    // 18 up with 2:29 left is a blowout: the bench comes in now, not at the next minute mark
    t.subSig = sim.subSignature(t);
    sim.clock = 149;
    sim.checkSubs(t);
    expect(t.garbage).toBe(true);
    const starters = t.team.rotation.order.slice(0, 5);
    expect(t.on.some((p) => starters.includes(p.pid))).toBe(false);
    // a manual sub holds for four minutes, then the lock is gone
    const bench = t.team.rotation.order.find((pid) => !t.on.some((p) => p.pid === pid))!;
    expect(game.substitute(0, t.on[0].pid, bench)).toBe(true);
    expect(t.subLock.size).toBe(2);
    sim.elapsed += 241;
    sim.checkSubs(t);
    expect(t.subLock.size).toBe(0);
  });

  it('allows only two timeouts after the 3:00 mark of the fourth quarter', () => {
    const game = new GameSim(side(0), side(1), { rng: new Rng(1), type: 'regular', injuries: false });
    const sim = game as unknown as Internals & { T: { timeouts: number }[] };
    sim.q = 4;
    sim.clock = 170;
    sim.T[0].timeouts = 4;
    expect(game.callTimeout(0)).toBe(true);
    expect(sim.T[0].timeouts).toBe(1);
    expect(game.callTimeout(0)).toBe(true);
    expect(game.callTimeout(0)).toBe(false);
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
        const onCourtFta = sim
          .rawBoxes()
          .filter((r) => r.tid === tb.tid)
          .reduce((a, r) => a + r.b.tFta, 0);
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

  it('fouls when trailing late only while a foul can still buy another shot', () => {
    type F = Internals & { T: { score: number }[]; intentionalFoul(off: unknown, def: unknown): string | null };
    const at = (clock: number, down: number) => {
      const sim = new GameSim(side(0), side(1), { rng: new Rng(2), type: 'regular', injuries: false }) as unknown as F;
      const [off, def] = sim.T;
      sim.q = 4;
      sim.clock = clock;
      off.score = 100 + down;
      def.score = 100;
      return sim.intentionalFoul(off, def);
    };
    expect(at(20, 2)).not.toBeNull();
    expect(at(2, 2)).not.toBeNull();
    expect(at(20, 3)).not.toBeNull();
    expect(at(3, 3)).toBeNull();
    expect(at(40, 7)).not.toBeNull();
    expect(at(4, 7)).toBeNull();
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

  it('writes "Jr." names without a double period, and overtimes as OT, 2OT', () => {
    const base = side(14);
    const players = base.players.map((p) => ({ ...p, lastName: `${p.lastName} Jr.` }));
    let ot = 0;
    for (let g = 0; g < 80 && ot < 2; g++) {
      const res = new GameSim({ ...base, players }, side(15), { rng: new Rng(700 + g), type: 'regular', record: true, injuries: false }).simToEnd();
      for (const e of res.pbp!) expect(e.text).not.toMatch(/\.\./);
      if (!res.ot) continue;
      ot++;
      expect(res.pbp!.some((e) => e.text === 'Start of OT.')).toBe(true);
      if (res.ot >= 2) expect(res.pbp!.some((e) => e.text.startsWith('Start of 2OT.'))).toBe(true);
      expect(res.pbp!.some((e) => /OT\d/.test(e.text))).toBe(false);
    }
    expect(ot).toBeGreaterThan(0);
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

  it('keeps the best defender on a denied star (threat ignores the deny itself)', () => {
    type Sim = { T: { guardOf: Map<number, { pid: number }> }[]; starTarget(def: unknown, off: unknown): { pid: number } };
    const sim = (plan: 'none' | 'deny') =>
      new GameSim(side(16), side(17, { defense: { starPlan: plan, starTarget: null } }), { rng: new Rng(2), type: 'regular' }) as unknown as Sim;
    const denied = sim('deny');
    const star = denied.starTarget(denied.T[1], denied.T[0]).pid;
    expect(denied.T[1].guardOf.get(star)!.pid).toBe(sim('none').T[1].guardOf.get(star)!.pid);
  });
});
