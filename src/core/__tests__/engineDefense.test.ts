// Defensive depth in the engine: the junk defenses (box-and-one, triangle-and-two), hunting one
// defender (and an AI coach hiding him), and the foul to give. Each does what its help text says and has a cost, and none of it touches a game that
// doesn't use it.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { GameSim, type SimTeamInput } from '../sim/engine';
import { TK } from '../sim/engine/tk';
import type { PossLog } from '../sim/log';
import { applyPatch, pairedDelta, runLab, type TacticsPatch } from '../ai/lab';
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
    // a box-and-one takes some of the ball out of the chased star’s hands, but the zone behind it leaves
    // the others open looks and the glass gets softer (tactics v2, 2026-11-10: he keeps TK.chase.touch of
    // the touches nobody runs a play for him, a real box's cost, where he had kept a sixth of them)
    {
      const helio = shaped(7, 'helio');
      const box1: TacticsPatch = { defense: { scheme: 'box1', chase: [helio.star.pid] } };
      const [base, box] = paired(3, 7, helio, box1, 480, 100, [helio.star.pid]);
      // his share of the possessions he plays drops, but he keeps most of it, and he takes far fewer threes
      // (2026-11-10: from 0.389 to 0.363 over 480 games, and a quarter fewer threes; a fifth or more before)
      expect(usage(box)).toBeLessThan(usage(base) * 0.97);
      expect(usage(box)).toBeGreaterThan(usage(base) * 0.8);
      expect(box.tpa).toBeLessThan(base.tpa * 0.9);
      // the zone behind it walls off the paint and leaves everyone else open looks (non-shooters here: they
      // take about as many threes as before, a few more open)
      expect(box.impacts['zone_paint:d']).toBeGreaterThan(0);
      // and the offense gets more of its misses back. A game has too few boards to tell a softer glass
      // apart, so the same misses are rebounded many times over against each defense (the trip after the
      // board left out)
      const boards = (patch: TacticsPatch, n: number) => {
        const sim = new GameSim(side(3, { ...patch, defense: { ...man.defense, ...patch.defense } }), side(7, undefined, helio.players, helio.tactics), opts(1)) as unknown as {
          T: unknown[];
          poss: number;
          ctx: string;
          continueAfterOrb(): void;
          finishPoss(): void;
          looseBall(): boolean;
          tick(): void;
          rebound(off: unknown, def: unknown, zone: string, blocked: boolean, ft: boolean): void;
        };
        sim.poss = 1;
        sim.continueAfterOrb = () => {};
        sim.finishPoss = () => {};
        // (the boards alone: no loose-ball fouls or jump balls, and the clock held: since boards at the horn
        // came to be nobody's, 2026-11-09, all but the first few hundred of these had been dead balls at 0:00)
        sim.looseBall = () => false;
        sim.tick = () => {};
        let orb = 0;
        for (let i = 0; i < n; i++) {
          sim.rebound(sim.T[1], sim.T[0], i % 3 ? 'ab3' : 'rim', false, false);
          if (sim.ctx === 'orb') orb++;
        }
        return orb / n;
      };
      // (2026-11-10: 0.229 of them against man, 0.267 against the box)
      const [manOrb, boxOrb] = [boards(man, 20000), boards(box1, 20000)];
      expect(boxOrb - manOrb).toBeGreaterThan(2 * Math.sqrt((manOrb * (1 - manOrb) + boxOrb * (1 - boxOrb)) / 20000));
      expect(boxOrb / manOrb).toBeGreaterThan(1.08);
      expect(box.impacts['box_chase:d']).toBeGreaterThan(0);
      expect(box.impacts['box_open:o']).toBeGreaterThan(0);
      expect(base.impacts['box_chase:d']).toBeUndefined();
    }

    // plays man-to-man while the players it is named for sit, chases their main creators when it names nobody, and a triangle chases two
    {
      const helio = shaped(7, 'helio');
      const star = helio.star.pid;
      // (a game the star plays through: on some nights foul trouble sits him for most of it)
      const logs = (patch: TacticsPatch) => {
        const sim = new GameSim(side(3, patch), side(7, undefined, helio.players, helio.tactics), opts(8, true));
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
      // an AI coach plays one in stretches (tactics v2, 2026-11-10: TK.junkPlanned of the time, TK.zoneStretch
      // seconds at a time) and man-to-man between them, chasing only in them; the user's side, above, all game
      // (2026-11-10: 0.49 of the trips with the star on over 40 games, from 0.09 to 0.81 in one game)
      {
        const trips: PossLog[] = [];
        for (let g = 0; g < 12; g++) {
          const sim = new GameSim(
            { ...side(3, { defense: { scheme: 'box1', chase: [star] } }), adjust: true },
            side(7, undefined, helio.players, helio.tactics),
            opts(8 + g, true),
          );
          // (its habits, without the adjustments at the breaks: a box picked apart goes back to man-to-man)
          (sim as unknown as { T: { adjust: number }[] }).T[0].adjust = 0;
          while (sim.step()) trips.push(...sim.drainLogs().filter((l) => l.off === 1 && l.kind === 'half' && l.on[1].includes(star)));
        }
        for (const l of trips) expect(l.chase).toEqual(l.scheme === 'box1' ? [star] : undefined);
        const boxed = trips.filter((l) => l.scheme === 'box1').length / trips.length;
        expect(boxed).toBeGreaterThan(TK.junkPlanned - 0.15);
        expect(boxed).toBeLessThan(TK.junkPlanned + 0.15);
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
      // recentred, and again when a side-out foul's inbound started taking its seconds, a narrow late lead stopped reaching in and offensive fouls came up to the NBA's rate, and when the off-ball switches' tags were weighed by what they're worth, which the AI coaches' adjustments read, and when pressure and the blitz were cut to a realistic size and the league's turnovers, fouls and blocks recentred, and when a player's share of his team's possessions was made to level off past 32%, and when the credit for assisted twos was trimmed to the NBA's rate, and when the big decisions were made to matter and AI coaches came to play their own defenses, and when crunch time came to need a game still in reach, the AI's rotations floored their two best players' minutes and severe injuries were made rarer, and the zone games when garbage time came for both benches from late in the third quarter, with the team up big easing off and calling off its press, and all of them when a shooter's threes came to level off past his share of the shots and his skill to count for less at the top of the scale, and a defender's steals to come less often past his second of the night, and all again when the AI's staffs were refit to what each style measures, the league's threes, fouls and turnovers recentred and a switched ball screen's tags weighed by what they're worth)
      // (and again 2026-10-26, when the zones came to play to the two fives on the floor, K.zoneFit, the 2-3's open looks and glass grew, the playbooks were rebalanced and the AI's staffs refit with no zone ban, and garbage time came from the half; the pressure games when a press's steals came under the nightly cap)
      // All of them again 2026-10-27, when a shooter past his share of the threes came to get tougher ones (K.threeUse.contest), and again when a share of the possessions past K.useCeil came to cost more.
      // All of them again 2026-10-28, when the threes were recentred (K.recenter.three) after partnerships and familiarity were deleted. And again the same day, when Five-Out, Pace & Space, Ice and the 2-3 zone were retuned and the staffs' reads refit.
      // All of them again 2026-11-09, the game-day realism round 3: the go-to player's last shots, the late game's fouls, timeouts and tempo, timeouts as tendencies, the stint plan's shape, boards at the horn and out of bounds, the whistle by quarter, steals by rate, the pace, and the seed refit to it.
      // All of them again 2026-11-10, the tactics rewrite (tactics v2): every tactical size at its played size in
      // engine/tk.ts, ball screens covered screen by screen, zones and junk defenses in stretches, the AI coaches
      // playing their own styles and adjusting at both ends (the tactical-leverage check that played these games
      // at 1x went with the multiplier). The hunt games again, and the last game of the zone32 and double ones (an
      // AI coach's adjustment can turn hunting on), when hunting mismatches came to mean a capable creator against a
      // weaker defender than the rest, the same day; and the AI's after-timeout sets came to fit the late score and its
      // planned zones to be played a fifth of the time, all but a few.
      const expected: Record<string, number[][]> = {
        default: [
          [136, 116, 88, 43, 15, 25, 10, 0],
          [109, 112, 91, 20, 6, 33, 6, 0],
          [118, 95, 90, 28, 5, 22, 14, 0],
        ],
        zone23: [
          [119, 106, 83, 44, 8, 24, 10, 0],
          [106, 96, 91, 25, 8, 19, 5, 0],
          [113, 111, 83, 28, 4, 25, 17, 0],
        ],
        zone32: [
          [114, 88, 87, 40, 11, 18, 9, 0],
          [109, 115, 95, 17, 7, 30, 6, 0],
          [113, 90, 87, 20, 8, 21, 13, 0],
        ],
        double: [
          [125, 121, 84, 43, 12, 14, 12, 0],
          [104, 118, 86, 21, 6, 24, 10, 0],
          [120, 97, 85, 26, 1, 20, 15, 0],
        ],
        hunt: [
          [126, 121, 93, 45, 12, 21, 8, 0],
          [90, 100, 85, 22, 4, 26, 10, 0],
          [103, 104, 90, 27, 10, 29, 15, 0],
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

  // A junk defense is a matchup call, not a blanket gain (tactics v2, 2026-11-10: the tactical leverage
  // multiplier, K.tacticEdge, is gone, and every tactical size is the engine's own, in engine/tk.ts). The
  // zone behind a box-and-one's chaser leaves open threes and a softer glass for everyone he isn't on:
  // shooters make it pay, so aimed at a team of them the box loses clearly; aimed at a lone star with
  // non-shooters around him those threes are worth little, and it holds up.
  it('makes a box-and-one a matchup call: against a team of shooters a clear loser, aimed at a star with non-shooters around him far better', () => {
    // the box-and-one in Lab runs, team 4 defending team 9 reshaped, paired against its drop
    const lab = (kind: 'helio' | 'shooters') => {
      const s = shaped(9, kind);
      const off = side(9, undefined, s.players, s.tactics);
      const chase = kind === 'helio' ? [s.star.pid] : undefined;
      const run = (patch: TacticsPatch) => runLab({ a: side(4, patch), b: off, games: 600, seed: 31 });
      return pairedDelta(run(man), run({ defense: { ...man.defense, scheme: 'box1', ...(chase && { chase }) } }));
    };
    const [helio, shooters] = [lab('helio'), lab('shooters')];
    // (measured 2026-11-10, per 100 possessions against the drop: against the shooters -3.5, -4.5 and -3.7,
    // ± 0.4 over 1,500 games on each of three seed streams; aimed at the star +1.1, -0.2 and +0.9 ± 0.4. That
    // is this defense: over 600 games against each of twelve of this league's defenses the aimed box came out
    // from -2.0 to +1.6, -0.5 on average, so it beats the drop only for a few)
    expect(shooters.delta).toBeLessThan(-2 * shooters.se);
    expect(helio.delta - shooters.delta).toBeGreaterThan(Math.max(2, 2 * Math.hypot(helio.se, shooters.se)));
    expect(helio.delta).toBeGreaterThan(-2 * helio.se);
  }, 180_000);
});
