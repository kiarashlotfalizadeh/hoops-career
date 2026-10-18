// Defensive depth in the engine: the junk defenses (box-and-one, triangle-and-two), scouting-report
// instructions on single players, hunting one defender (and an AI coach hiding him), and the foul to
// give. Each does what its help text says and has a cost, and none of it touches a game that
// doesn't use it.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { GameSim, type SimTeamInput } from '../sim/engine';
import type { PossLog } from '../sim/log';
import { applyPatch, pairedDelta, runLab, type TacticsPatch } from '../ai/lab';
import { composites } from '../ratings';
import { Rng } from '../random';
import type { Player, PlayerDefense, TacticImpact, Tactics } from '../types';

describe('engine defense', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
  const side = (tid: number, patch?: TacticsPatch, players?: Player[], tactics?: Tactics): SimTeamInput => ({
    team: { ...league.teams[tid], tactics: applyPatch(tactics ?? league.teams[tid].tactics, patch) },
    players: players ?? teamPlayers(league, tid),
  });
  const opts = (seed: number, record = false) => ({ rng: new Rng(seed), type: 'regular' as const, record, injuries: false });
  const man: TacticsPatch = { defense: { scheme: 'man', pnr: 'drop', switchOffBall: false } };

  /**
   * A team reshaped: its best player a star creator on a green light and everyone else a
   * non-shooter (helio), or every player a shooter and nobody a creator (shooters).
   */
  function shaped(tid: number, kind: 'helio' | 'shooters'): { players: Player[]; tactics: Tactics; star: Player } {
    const players = structuredClone(teamPlayers(league, tid)).sort((a, b) => b.ovr - a.ovr);
    const tactics = structuredClone(league.teams[tid].tactics);
    players.forEach((p, i) => {
      if (kind === 'shooters') Object.assign(p.ratings, { tp: 82, hnd: Math.min(p.ratings.hnd, 60), mid: 64 });
      else if (i === 0) Object.assign(p.ratings, { hnd: 92, pas: 86, oiq: 90, tp: 84, mid: 84, spd: 84, ins: 78, drw: 80 });
      else Object.assign(p.ratings, { tp: 22, hnd: Math.min(p.ratings.hnd, 45), mid: Math.min(p.ratings.mid, 45) });
    });
    if (kind === 'helio') {
      tactics.offense.roles[players[0].pid] = 'creator';
      tactics.offense.freedom[players[0].pid] = 1;
    }
    return { players, tactics, star: players[0] };
  }

  type Box = { fga: number; tpa: number; fta: number; tov: number; tFga: number; tFta: number; tTov: number; rimA: number; sec: number };
  /** Sums of the raw box lines of `pids` over `games` paired games, with and without a patch on the defense (at home, against team `offTid`). */
  function paired(def: number, offTid: number, off: { players: Player[]; tactics: Tactics }, patch: TacticsPatch, games: number, seed: number, pids: number[]) {
    const sum = () => ({ fga: 0, tpa: 0, fta: 0, tov: 0, tFga: 0, tFta: 0, tTov: 0, rimA: 0, sec: 0, orb: 0, drb: 0, oppTpa: 0, oppFga: 0, impacts: {} as Record<string, number> });
    const out = [sum(), sum()];
    for (let g = 0; g < games; g++) {
      for (const i of [0, 1]) {
        const o = out[i];
        const sim = new GameSim(
          side(def, i ? { ...patch, defense: { ...man.defense, ...patch.defense } } : man),
          side(offTid, undefined, off.players, off.tactics),
          opts(seed + g),
        );
        const res = sim.simToEnd();
        for (const rb of sim.rawBoxes()) {
          if (!pids.includes(rb.pid)) continue;
          for (const k of ['fga', 'tpa', 'fta', 'tov', 'tFga', 'tFta', 'tTov', 'rimA', 'sec'] as (keyof Box)[]) o[k] += rb.b[k];
        }
        o.orb += res.away.t.orb;
        o.drb += res.home.t.drb;
        o.oppTpa += res.away.t.tpa;
        o.oppFga += res.away.t.fga;
        for (const im of res.impacts ?? []) o.impacts[im.key] = (o.impacts[im.key] ?? 0) + im.pts;
      }
    }
    return out;
  }
  const usage = (b: Box) => (b.fga + 0.44 * b.fta + b.tov) / (b.tFga + 0.44 * b.tFta + b.tTov);

  describe('junk defenses', () => {
    it('a box-and-one takes the ball out of the chased star’s hands, but the others get more threes and the glass gets softer', () => {
      const helio = shaped(7, 'helio');
      const box1: TacticsPatch = { defense: { scheme: 'box1', chase: [helio.star.pid] } };
      const [base, box] = paired(3, 7, helio, box1, 30, 100, [helio.star.pid]);
      // his share of the possessions he plays drops by a fifth or more
      expect(usage(box)).toBeLessThan(usage(base) * 0.85);
      expect(box.tpa).toBeLessThan(base.tpa * 0.9);
      // everyone else gets more threes (their share of the team's shots barely moves, as they take more twos too)
      expect(box.oppTpa - box.tpa).toBeGreaterThan(base.oppTpa - base.tpa);
      // and the offense gets more of its misses back. A game has too few boards to tell an 8% softer glass
      // apart, so the same misses are rebounded many times over against each defense (the trip after the
      // board left out)
      const boards = (patch: TacticsPatch, n: number) => {
        const sim = new GameSim(side(3, { ...patch, defense: { ...man.defense, ...patch.defense } }), side(7, undefined, helio.players, helio.tactics), opts(1)) as unknown as {
          T: unknown[];
          poss: number;
          ctx: string;
          continueAfterOrb(): void;
          finishPoss(): void;
          rebound(off: unknown, def: unknown, zone: string, blocked: boolean, ft: boolean): void;
        };
        sim.poss = 1;
        sim.continueAfterOrb = () => {};
        sim.finishPoss = () => {};
        let orb = 0;
        for (let i = 0; i < n; i++) {
          sim.rebound(sim.T[1], sim.T[0], i % 3 ? 'ab3' : 'rim', false, false);
          if (sim.ctx === 'orb') orb++;
        }
        return orb / n;
      };
      const [manOrb, boxOrb] = [boards(man, 20000), boards(box1, 20000)];
      expect(boxOrb - manOrb).toBeGreaterThan(2 * Math.sqrt((manOrb * (1 - manOrb) + boxOrb * (1 - boxOrb)) / 20000));
      expect(box.impacts['box_chase:d']).toBeGreaterThan(0);
      expect(box.impacts['box_open:o']).toBeGreaterThan(0);
      expect(base.impacts['box_chase:d']).toBeUndefined();
    });

    it('plays man-to-man while the players it is named for sit, chases their main creators when it names nobody, and a triangle chases two', () => {
      const helio = shaped(7, 'helio');
      const star = helio.star.pid;
      const logs = (patch: TacticsPatch) => {
        const sim = new GameSim(side(3, patch), side(7, undefined, helio.players, helio.tactics), opts(5, true));
        const out: PossLog[] = [];
        while (sim.step()) out.push(...sim.drainLogs().filter((l) => l.off === 1 && l.kind === 'half'));
        return out;
      };
      let on = 0;
      let off = 0;
      for (const l of logs({ defense: { scheme: 'box1', chase: [star] } })) {
        if (l.on[1].includes(star)) {
          on++;
          expect(l.scheme).toBe('box1');
          expect(l.chase).toEqual([star]);
        } else {
          off++;
          expect(l.scheme).toBe('man');
          expect(l.chase).toBeUndefined();
        }
      }
      expect(on).toBeGreaterThan(20);
      expect(off).toBeGreaterThan(5);
      // nobody named: always a box, on someone on the floor (the star whenever he plays)
      for (const l of logs({ defense: { scheme: 'box1' } })) {
        expect(l.scheme).toBe('box1');
        expect(l.chase).toHaveLength(1);
        expect(l.on[1]).toContain(l.chase![0]);
        if (l.on[1].includes(star)) expect(l.chase).toEqual([star]);
      }
      for (const l of logs({ defense: { scheme: 'tri2', chase: [star] } })) {
        if (!l.on[1].includes(star)) continue;
        expect(l.chase).toHaveLength(2);
        expect(l.chase![0]).toBe(star);
        // the chasers are among the best perimeter defenders on the floor
        const def = l.on[0].map((pid) => league.players[pid]);
        const chasers = l.chase!.map((pid) => league.players[l.guards[pid]]);
        const best = [...def].sort((a, b) => composites(b.ratings).perDef - composites(a.ratings).perDef).slice(0, 2);
        expect(chasers.reduce((a, p) => a + composites(p.ratings).perDef, 0)).toBeGreaterThanOrEqual(best.reduce((a, p) => a + composites(p.ratings).perDef, 0) - 12);
      }
    });

    it('is a weapon against a star with non-shooters around him and a loser against a shooting team', () => {
      const delta = (kind: 'helio' | 'shooters') => {
        const s = shaped(9, kind);
        const off = side(9, undefined, s.players, s.tactics);
        const chase = kind === 'helio' ? [s.star.pid] : undefined;
        const run = (patch: TacticsPatch) => runLab({ a: side(4, patch), b: off, games: 400, seed: 31 });
        return pairedDelta(run(man), run({ defense: { ...man.defense, scheme: 'box1', ...(chase && { chase }) } }));
      };
      const helio = delta('helio');
      const shooters = delta('shooters');
      expect(helio.delta).toBeGreaterThan(0);
      expect(shooters.delta).toBeLessThan(0);
      expect(helio.delta - shooters.delta).toBeGreaterThan(2 * Math.hypot(helio.se, shooters.se));
    });
  });

  describe('instructions by player', () => {
    /** Their starters with an instruction for each (as `patchFor` picks), and the raw lines of the players named. */
    const lines = (patchFor: (players: Player[]) => Record<number, PlayerDefense>, games = 20) => {
      const players = teamPlayers(league, 12);
      const starters = new Set(league.teams[12].rotation.order.slice(0, 5));
      const pd = patchFor(players.filter((p) => starters.has(p.pid)));
      const pids = Object.keys(pd).map(Number);
      const [base, inst] = paired(11, 12, { players, tactics: league.teams[12].tactics }, { defense: { playerD: pd } }, games, 300, pids);
      return { base, inst };
    };
    const by = (players: Player[], f: (c: ReturnType<typeof composites>) => number) => [...players].sort((a, b) => f(composites(b.ratings)) - f(composites(a.ratings)));

    it('"under" gives his pull-ups room and takes his drives away; "tight" trades his threes for drives', () => {
      // (the tags are the engine's own accounting: openness his pull-ups gained, his drives and the roll lost)
      const under = lines((ps) => ({ [by(ps, (c) => c.pnrHandle)[0].pid]: 'under' }));
      expect(under.inst.impacts['pd_under:o']).toBeGreaterThan(0);
      expect(under.inst.impacts['pd_under:d']).toBeGreaterThan(0);
      expect(under.base.impacts['pd_under:o']).toBeUndefined();
      const tight = lines((ps) => ({ [by(ps, (c) => c.c3)[0].pid]: 'tight' }));
      expect(tight.inst.tpa).toBeLessThan(tight.base.tpa * 0.92);
      expect(tight.inst.rimA).toBeGreaterThan(tight.base.rimA);
      expect(tight.inst.impacts['pd_tight:d']).toBeGreaterThan(0);
    });

    it('"sag" helps at the rim and leaves him open; "body" makes his finishes harder and sends him to the line more', () => {
      const sag = lines((ps) => ({ [by(ps, (c) => -c.c3)[0].pid]: 'sag' }));
      expect(sag.inst.impacts['pd_sag:d']).toBeGreaterThan(0);
      const body = lines((ps) => ({ [by(ps, (c) => c.postScore + c.rim)[0].pid]: 'body' }), 30);
      expect(body.inst.fta).toBeGreaterThan(body.base.fta);
      expect(body.inst.impacts['pd_body:d']).toBeGreaterThan(0);
      expect(body.inst.impacts['pd_body:o']).toBeGreaterThan(0);
    });

    it('fit one player and cost against another: sagging off a shooter gives up the open looks it leaves him', () => {
      const ps = structuredClone(teamPlayers(league, 12));
      const starters = new Set(league.teams[12].rotation.order.slice(0, 5));
      const target = ps.filter((p) => starters.has(p.pid)).sort((a, b) => composites(a.ratings).c3 - composites(b.ratings).c3)[0];
      // (a shooter's tendencies, or a non-shooter's, come with his rating: none, so only the rating differs)
      delete target.tend;
      const run = (tp: number) => {
        target.ratings.tp = tp;
        return paired(11, 12, { players: ps, tactics: league.teams[12].tactics }, { defense: { playerD: { [target.pid]: 'sag' } } }, 25, 500, [target.pid])[1].impacts;
      };
      const nonShooter = run(15);
      const shooter = run(90);
      // the help at the rim is about the same; the open looks it gives up grow with his shooting
      expect(nonShooter['pd_sag:d']).toBeGreaterThan(nonShooter['pd_sag:o'] ?? 0);
      expect(Math.abs(shooter['pd_sag:d'] - nonShooter['pd_sag:d'])).toBeLessThan(0.3 * nonShooter['pd_sag:d']);
      expect(shooter['pd_sag:o']).toBeGreaterThan(3 * (nonShooter['pd_sag:o'] ?? 0) + 2);
    });
  });

  describe('hunting a defender', () => {
    type In = {
      T: {
        on: { pid: number }[];
        guardOf: Map<number, { pid: number }>;
        t: Tactics;
        base: Tactics;
        adjust: number;
        byId: Map<number, { pid: number; name: string; on: boolean }>;
      }[];
      q: number;
      elapsed: number;
      impacts: Map<string, TacticImpact>;
      adjust(t: unknown): void;
      adjustments: { text: string }[];
    };

    it('runs isolations and ball screens at the man he guards, and costs ball movement', () => {
      // their starter with the worst perimeter defense
      const starters = new Set(league.teams[3].rotation.order.slice(0, 5));
      const target = teamPlayers(league, 3)
        .filter((p) => starters.has(p.pid))
        .sort((a, b) => composites(a.ratings).perDef - composites(b.ratings).perDef)[0];
      let isoAt = [0, 0];
      let screens = [0, 0];
      const tags = [0, 0];
      for (let g = 0; g < 12; g++)
        for (const i of [0, 1]) {
          const sim = new GameSim(side(5, i ? { offense: { huntTarget: target.pid } } : undefined), side(3), opts(60 + g, true));
          const s = sim as unknown as In;
          while (sim.step()) {
            for (const l of sim.drainLogs()) {
              if (l.off !== 0 || !l.on[1].includes(target.pid)) continue;
              const hunted = Object.entries(l.guards).find(([, d]) => d === target.pid)?.[0];
              if (hunted === undefined) continue;
              for (const st of l.steps) if (st.k === 'screen' && st.pid === +hunted) screens = screens.map((x, k) => (k === i ? x + 1 : x));
              if (l.action === 'iso' && l.label.endsWith(` on ${s.T[1].byId.get(target.pid)!.name}`)) isoAt = isoAt.map((x, k) => (k === i ? x + 1 : x));
            }
          }
          tags[i] += sim.result().impacts?.filter((im) => im.key.startsWith('hunt')).length ?? 0;
        }
      expect(isoAt[1]).toBeGreaterThan(isoAt[0] * 1.3);
      expect(screens[1]).toBeGreaterThan(screens[0] * 2);
      expect(tags[0]).toBe(0);
      expect(tags[1]).toBeGreaterThan(0);
    });

    it('an AI coach hides a defender being hunted with success on their weakest scorer, and only then', () => {
      const sim = new GameSim(side(5), side(3), opts(3)) as unknown as In;
      const ai = sim.T[1];
      ai.adjust = 1;
      sim.q = 2;
      sim.elapsed = 1000;
      const target = ai.on[0].pid;
      sim.T[0].t.offense.huntTarget = target;
      sim.adjust(ai);
      // not hunted with success yet: no reason to hide him
      expect(Object.values(ai.t.defense.matchups)).not.toContain(target);
      sim.impacts.set('hunt:o|0', { key: 'hunt:o', t: 0, count: 30, pts: 20, players: {} });
      sim.adjust(ai);
      expect(sim.adjustments.at(-1)!.text).toMatch(/^hides /);
      const weak = Number(Object.entries(ai.t.defense.matchups).find(([, d]) => d === target)![0]);
      expect(ai.guardOf.get(weak)!.pid).toBe(target);
      expect(ai.base.defense.matchups[weak]).toBe(target);
    });
  });

  describe('foul to give', () => {
    type In = {
      T: { fouls: number; foulsLast2: number; score: number; t: Tactics; base: Tactics }[];
      q: number;
      clock: number;
      cur: unknown;
      intentionalFoul(off: unknown, def: unknown): string | null;
      pbp: { text: string }[];
    };
    const at = (q: number, clock: number, lead: number, on = true, fouls = 0, last2 = 0) => {
      // (the other late-game fouls off, to see this one alone)
      const sim = new GameSim(side(0), side(1, { manage: { foulToGive: on, foulUp3: false, foulWhenTrailing: false } }), opts(4, true)) as unknown as In;
      sim.q = q;
      sim.clock = clock;
      sim.T[1].score = 50 + lead;
      sim.T[0].score = 50;
      sim.T[1].fouls = fouls;
      sim.T[1].foulsLast2 = last2;
      // (the trip being logged, as at the start of a possession)
      sim.cur = { steps: [], lines: [], kind: 'half', label: '' };
      const res = sim.intentionalFoul(sim.T[0], sim.T[1]);
      return { res, text: sim.pbp.at(-1)?.text ?? '' };
    };

    it('fouls at once for the last shot of a period when it is only a side out, and never otherwise', () => {
      const f = at(4, 6, 2);
      expect(f.res).toBe('sideout');
      expect(f.text).toMatch(/a foul to give/);
      expect(at(2, 7, -9).res).toBe('sideout');
      expect(at(4, 6, 0).res).toBe('sideout');
      // off, too early, too late, a lead of four or more (or trailing) in the 4th, or it would put them in the bonus
      expect(at(4, 6, 2, false).res).toBeNull();
      expect(at(4, 9, 2).res).toBeNull();
      expect(at(4, 2, 2).res).toBeNull();
      expect(at(4, 6, 4).res).toBeNull();
      expect(at(4, 6, -1).res).toBeNull();
      expect(at(4, 6, 2, true, 4).res).toBeNull();
      expect(at(3, 6, 2, true, 2, 1).res).toBeNull();
      expect(at(3, 6, 2, true, 2, 0).res).toBe('sideout');
    });
  });

  it('leaves games that use none of it exactly as they were', () => {
    // box-score fingerprints taken from the engine before junk defenses, instructions, hunting and the foul to give
    // (taken again when side-out fouls started restarting the shot clock at 14, a rule every game plays, and when
    // tactics were made to matter twice as much: tacticLeverage.test.ts plays these games at 1x leverage and gets
    // the fingerprints from before that)
    const expected: Record<string, number[][]> = {
      default: [
        [131, 125, 88, 44, 15, 18, 16, 0],
        [116, 114, 91, 18, 18, 21, 17, 0],
        [132, 91, 90, 27, 8, 22, 13, 0],
      ],
      zone23: [
        [114, 104, 81, 48, 13, 22, 12, 0],
        [115, 120, 96, 15, 17, 37, 9, 0],
        [122, 132, 110, 29, 19, 28, 14, 1],
      ],
      zone32: [
        [109, 99, 80, 43, 11, 19, 19, 0],
        [109, 110, 94, 16, 16, 22, 15, 0],
        [99, 97, 97, 28, 16, 17, 17, 0],
      ],
      double: [
        [119, 105, 91, 36, 18, 18, 18, 0],
        [113, 115, 86, 27, 13, 27, 16, 0],
        [110, 80, 92, 26, 11, 26, 14, 0],
      ],
      // (the first game's box score is the default one: it hacks nobody, and the possession-paired streams bring
      // the couple of trips the mismatch hunt changes back to the same team lines)
      hunt: [
        [131, 125, 88, 44, 15, 18, 16, 0],
        [141, 143, 102, 24, 20, 29, 18, 1],
        [108, 115, 89, 29, 5, 32, 15, 0],
      ],
    };
    const patches: Record<string, TacticsPatch | undefined> = {
      default: undefined,
      zone23: { defense: { scheme: 'zone23' } },
      zone32: { defense: { scheme: 'zone32', starPlan: 'deny' } },
      double: { defense: { starPlan: 'double', pnr: 'switch', switchOffBall: true } },
      hunt: { offense: { huntMismatch: true }, manage: { hackThreshold: 62 } },
    };
    for (const [name, patch] of Object.entries(patches)) {
      const got: number[][] = [];
      for (let g = 0; g < 3; g++) {
        const a = { ...side(10 + g, patch), adjust: true };
        const b = { ...side(20 + g, g === 1 ? patch : undefined), adjust: true };
        const res = new GameSim(a, b, { rng: new Rng(800 + g), type: 'regular', injuries: true }).simToEnd();
        got.push([res.home.pts, res.away.pts, res.home.t.fga, res.away.t.tpa, res.home.t.orb, res.away.t.fta, res.home.t.tov, res.ot]);
      }
      expect(got, name).toEqual(expected[name]);
    }
  });
});
