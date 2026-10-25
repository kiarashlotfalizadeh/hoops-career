// Defensive depth in the engine: the junk defenses (box-and-one, triangle-and-two), hunting one
// defender (and an AI coach hiding him), and the foul to give. Each does what its help text says and has a cost, and none of it touches a game that
// doesn't use it.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { GameSim, K, type SimTeamInput } from '../sim/engine';
import type { PossLog } from '../sim/log';
import { applyPatch, pairedDelta, runLab, type LabSummary, type TacticsPatch } from '../ai/lab';
import { composites } from '../ratings';
import { Rng } from '../random';
import type { Player, TacticImpact, Tactics } from '../types';

/** The tactics without the overhaul's shape and out-of-possession roles: the games these numbers were taken from. */
function basic(t: Tactics): Tactics {
  const out = structuredClone(t);
  delete out.offense.shape;
  delete out.defense.roles;
  return out;
}

describe('engine defense', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
  const side = (tid: number, patch?: TacticsPatch, players?: Player[], tactics?: Tactics): SimTeamInput => ({
    team: { ...league.teams[tid], tactics: applyPatch(basic(tactics ?? league.teams[tid].tactics), patch) },
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

  it('plays junk defenses, hunting a defender and the foul to give as their help texts say, and games without them as before', () => {
    // junk defenses
    // a box-and-one takes the ball out of the chased star’s hands, but the others get more threes and the glass gets softer
    {
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
    }

    // plays man-to-man while the players it is named for sit, chases their main creators when it names nobody, and a triangle chases two
    {
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
    }
    // hunting a defender
    {
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
      // runs isolations and ball screens at the man he guards, and costs ball movement
      {
        // their starter with the worst perimeter defense
        const starters = new Set(league.teams[3].rotation.order.slice(0, 5));
        const target = teamPlayers(league, 3)
          .filter((p) => starters.has(p.pid))
          .sort((a, b) => composites(a.ratings).perDef - composites(b.ratings).perDef)[0];
        let isoAt = [0, 0];
        let screens = [0, 0];
        const tags = [0, 0];
        for (let g = 0; g < 24; g++)
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
      }

      // an AI coach hides a defender being hunted with success on their weakest scorer, and only then
      {
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
      }
    }
    // the foul to give
    {
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
      // fouls at once for the last shot of a period when it is only a side out, and never otherwise
      {
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
      }
    }
    // leaves games that use none of it exactly as they were
    {
      // box-score fingerprints taken from the engine before junk defenses, hunting and the foul to give
      // (taken again when side-out fouls started restarting the shot clock at 14, a rule every game plays, and when
      // tactics were made to matter twice as much: the tactical-leverage check below plays these games at 1x leverage and gets
      // the fingerprints from before that, and again when the late game, crunch-time touches, home court and the
      // staff's substitutions were polished, and when the AI's playbooks were recalibrated and the league's rates
      // recentred, and again when a side-out foul's inbound started taking its seconds, a narrow late lead stopped reaching in and offensive fouls came up to the NBA's rate, and when the off-ball switches' tags were weighed by what they're worth, which the AI coaches' adjustments read, and when pressure and the blitz were cut to a realistic size and the league's turnovers, fouls and blocks recentred, and when a player's share of his team's possessions was made to level off past 32%, and when the credit for assisted twos was trimmed to the NBA's rate, and when the big decisions were made to matter and AI coaches came to play their own defenses)
      const expected: Record<string, number[][]> = {
        default: [
          [101, 127, 79, 33, 8, 33, 8, 0],
          [134, 144, 79, 34, 7, 27, 15, 0],
          [118, 117, 88, 37, 5, 20, 15, 0],
        ],
        zone23: [
          [120, 101, 88, 42, 10, 22, 10, 0],
          [132, 119, 87, 35, 11, 23, 12, 0],
          [115, 107, 89, 35, 6, 14, 14, 0],
        ],
        zone32: [
          [115, 120, 79, 39, 9, 36, 12, 0],
          [124, 116, 85, 16, 8, 23, 12, 0],
          [128, 130, 101, 34, 6, 27, 14, 1],
        ],
        double: [
          [109, 122, 79, 37, 7, 17, 11, 0],
          [145, 139, 84, 31, 9, 36, 13, 0],
          [113, 110, 91, 41, 7, 12, 13, 0],
        ],
        // (the first game's box score is the default one: it hacks nobody, and the possession-paired streams bring
        // the couple of trips the mismatch hunt changes back to the same team lines)
        hunt: [
          [109, 129, 83, 34, 7, 34, 7, 0],
          [137, 134, 83, 34, 6, 25, 13, 0],
          [118, 117, 88, 37, 5, 20, 15, 0],
        ],
      };
      const patches: Record<string, TacticsPatch | undefined> = {
        default: undefined,
        zone23: { defense: { scheme: 'zone23' } },
        zone32: { defense: { scheme: 'zone32' } },
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
    }
  }, 120_000);

  // Tactical leverage (K.tacticEdge): the owner's call to make tactics matter about twice as much as
  // they did. At 1x the engine plays every tactical edge at its written size (exactly as it did before
  // the change, until the big decisions were made to matter in 2026-10 and their 1x sizes moved with
  // them), and at the game's 2x the edge a choice gets from fitting the opponent is about twice as big
  // both ways.
  it('weighs tactics at twice their old size: 1x plays every edge at its written size, and a box-and-one aimed at a star with non-shooters around him is a weapon, one against a shooting team a loser, each at least twice as much as at 1x', () => {
    const EDGE = K.tacticEdge;
    try {
      // the game at 2x, and every game played exactly as before at 1x
      expect(K.tacticEdge).toBe(2);
      K.tacticEdge = 1;
      // box-score fingerprints from the engine before the change (with no in-game adjustments, which read the
      // tags, so the tags can be made more honest without moving them): games using none of the tactical tools,
      // the zones and a box-and-one, a star plan with switching, the pressure tools with crashing and running,
      // and mismatch hunting with a set package, heavy help and getting back (taken again at 1x when the late
      // game, crunch-time touches, home court and the staff's substitutions were polished, and when the AI's
      // playbooks were recalibrated and the league's rates recentred, and again when a side-out foul's inbound started taking its seconds, a narrow late lead stopped reaching in and offensive fouls came up to the NBA's rate, and when pressure and the blitz were cut to a realistic size (the pressure, double and hunting games: a trap's and a press's turnovers at 1x moved with them), and the 3-2 zone and box-and-one games when a game's last shot started going up with time to spare: what this pins is that 1x leverage plays
      // every tactical edge at its 1x size, game after game; all of them again when a player's share of his team's possessions was made to level off past 32%, and when the credit for assisted twos was trimmed to the NBA's rate, and when the big decisions were made to matter: a decision's looks counting by who takes them, the coverages' and the zone's sizes, the press centred on the league's handlers)
      const expected: Record<string, number[][]> = {
        default: [
          [108, 119, 77, 31, 8, 24, 11, 0],
          [141, 114, 91, 23, 12, 35, 11, 0],
          [114, 119, 102, 33, 15, 25, 11, 0],
        ],
        zone23: [
          [123, 106, 73, 37, 9, 24, 7, 0],
          [116, 103, 91, 24, 16, 25, 12, 0],
          [109, 119, 93, 36, 14, 12, 12, 0],
        ],
        zone32: [
          [123, 112, 81, 33, 10, 35, 10, 0],
          [117, 113, 82, 22, 10, 34, 18, 0],
          [104, 116, 92, 30, 12, 21, 15, 0],
        ],
        box1: [
          [113, 123, 84, 40, 10, 37, 13, 0],
          [121, 112, 95, 27, 19, 24, 10, 0],
          [122, 97, 89, 26, 12, 17, 14, 0],
        ],
        double: [
          [112, 122, 78, 30, 5, 26, 9, 0],
          [113, 120, 91, 37, 15, 22, 16, 0],
          [131, 117, 89, 30, 12, 20, 10, 0],
        ],
        pressure: [
          [109, 99, 90, 41, 15, 29, 12, 0],
          [128, 144, 92, 28, 10, 34, 19, 0],
          [124, 114, 97, 33, 12, 20, 13, 0],
        ],
        hunting: [
          [110, 114, 76, 44, 9, 19, 15, 0],
          [117, 137, 80, 27, 4, 17, 17, 0],
          [123, 112, 94, 33, 9, 27, 10, 0],
        ],
      };
      const patches: Record<string, TacticsPatch | undefined> = {
        default: undefined,
        zone23: { defense: { scheme: 'zone23' } },
        zone32: { defense: { scheme: 'zone32' } },
        box1: { defense: { scheme: 'box1' } },
        double: { defense: { starPlan: 'double', pnr: 'switch', switchOffBall: true } },
        pressure: { defense: { pressure: 90, press: 'afterMade', pnr: 'blitz', physicality: 80 }, offense: { crashBoards: 85, transition: 90 } },
        hunting: { offense: { huntMismatch: true, sets: ['spain', 'floppy', 'hammer', 'postSplit'] }, defense: { help: 80, getBack: 85 } },
      };
      for (const [name, patch] of Object.entries(patches)) {
        const got: number[][] = [];
        for (let g = 0; g < 3; g++) {
          const res = new GameSim(side(10 + g, patch), side(20 + g, g === 1 ? patch : undefined), { rng: new Rng(800 + g), type: 'regular', injuries: true }).simToEnd();
          got.push([res.home.pts, res.away.pts, res.home.t.fga, res.away.t.tpa, res.home.t.orb, res.away.t.fta, res.home.t.tov, res.ot]);
        }
        expect(got, name).toEqual(expected[name]);
      }
      // the box-and-one in Lab runs, team 4 defending team 9 reshaped
      const lab = (kind: 'helio' | 'shooters', edge: number, games: number, from = 0): [LabSummary, LabSummary] => {
        K.tacticEdge = edge;
        const s = shaped(9, kind);
        const off = side(9, undefined, s.players, s.tactics);
        const chase = kind === 'helio' ? [s.star.pid] : undefined;
        // (runLab seeds game g from seed + g * 2654435761: games from `from` on)
        const run = (patch: TacticsPatch) => runLab({ a: side(4, patch), b: off, games, seed: (31 + Math.imul(from, 2654435761)) >>> 0 });
        return [run(man), run({ defense: { ...man.defense, scheme: 'box1', ...(chase && { chase }) } })];
      };
      // a weapon against a star with non-shooters around him and a loser against a shooting team (400 games)
      const [h400, s400] = [lab('helio', 2, 400), lab('shooters', 2, 400)];
      const helio = pairedDelta(...h400);
      const shooters = pairedDelta(...s400);
      expect(helio.delta).toBeGreaterThan(0);
      expect(shooters.delta).toBeLessThan(0);
      expect(helio.delta - shooters.delta).toBeGreaterThan(2 * Math.hypot(helio.se, shooters.se));
      // about twice as much as at 1x, both ways (500 games: the 400 above and 100 more)
      const join = (a: LabSummary, b: LabSummary): LabSummary => ({
        ...a,
        games: a.games + b.games,
        margins: [...a.margins, ...b.margins],
        pace: (a.pace * a.games + b.pace * b.games) / (a.games + b.games),
      });
      const at2 = (kind: 'helio' | 'shooters', first: [LabSummary, LabSummary]) => {
        const more = lab(kind, 2, 100, 400);
        return pairedDelta(join(first[0], more[0]), join(first[1], more[1]));
      };
      const [r1, w1, r2, w2] = [pairedDelta(...lab('helio', 1, 500)), pairedDelta(...lab('shooters', 1, 500)), at2('helio', h400), at2('shooters', s400)];
      // aimed right it gains more and aimed wrong it costs more, and the gap between the two (the part of
      // its value that comes from the matchup) is at least twice what it was: more, since the open looks
      // it leaves count by who takes them (K.matchup), in full past a room the leverage gets them to
      // (about +2.4 and -1.9 per 100 at 1x here, +4.9 and -8.2 at 2x: a gap 3.1 times as wide)
      expect(r2.delta).toBeGreaterThan(r1.delta);
      expect(w2.delta).toBeLessThan(w1.delta - 1);
      const ratio = (r2.delta - w2.delta) / (r1.delta - w1.delta);
      expect(ratio).toBeGreaterThan(1.5);
      expect(ratio).toBeLessThan(3.6);
    } finally {
      K.tacticEdge = EDGE;
    }
  }, 180_000);
});
