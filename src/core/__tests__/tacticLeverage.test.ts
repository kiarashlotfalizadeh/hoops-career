// Tactical leverage (K.tacticEdge): the owner's call to make tactics matter about twice as much as
// they did. At 1x the engine plays exactly as it did before the change (box-score fingerprints taken
// from the engine before it), and at the game's 2x the edge a choice gets from fitting the opponent is
// about twice as big both ways: a well-aimed choice gains more and a wrong one costs about twice as
// much, the gap between them about twice as wide.
import { afterEach, describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { GameSim, K, type SimTeamInput } from '../sim/engine';
import { applyPatch, pairedDelta, runLab, type LabSummary, type TacticsPatch } from '../ai/lab';
import { Rng } from '../random';
import type { Player, Tactics } from '../types';

/** The tactics without the overhaul's shape and out-of-possession roles: the games these numbers were taken from. */
function basic(t: Tactics): Tactics {
  const out = structuredClone(t);
  delete out.offense.shape;
  delete out.defense.roles;
  return out;
}

describe('tactical leverage', () => {
  const EDGE = K.tacticEdge;
  afterEach(() => void (K.tacticEdge = EDGE));
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
  const side = (tid: number, patch?: TacticsPatch, players?: Player[], tactics?: Tactics): SimTeamInput => ({
    team: { ...league.teams[tid], tactics: applyPatch(basic(tactics ?? league.teams[tid].tactics), patch) },
    players: players ?? teamPlayers(league, tid),
  });
  const man: TacticsPatch = { defense: { scheme: 'man', pnr: 'drop', switchOffBall: false } };

  it('is the game at 2x, and plays every game exactly as before at 1x', () => {
    expect(K.tacticEdge).toBe(2);
    K.tacticEdge = 1;
    // box-score fingerprints from the engine before the change (with no in-game adjustments, which read the
    // tags, so the tags can be made more honest without moving them): games using none of the tactical tools,
    // the zones and a box-and-one, a star plan with switching, the pressure tools with crashing and running,
    // and mismatch hunting with a set package, heavy help and getting back (taken again at 1x when the late
    // game, crunch-time touches, home court and the staff's substitutions were polished, and when the AI's
    // playbooks were recalibrated and the league's rates recentred, and again when a side-out foul's inbound started taking its seconds, a narrow late lead stopped reaching in and offensive fouls came up to the NBA's rate: what this pins is that 1x leverage plays
    // every tactical edge at its 1x size, game after game)
    const expected: Record<string, number[][]> = {
      default: [
        [106, 97, 76, 33, 16, 20, 15, 0],
        [110, 115, 109, 19, 23, 41, 10, 0],
        [118, 122, 91, 28, 7, 29, 11, 0],
      ],
      zone23: [
        [133, 121, 76, 41, 11, 19, 13, 0],
        [127, 106, 97, 39, 17, 27, 11, 0],
        [115, 114, 98, 33, 11, 12, 12, 0],
      ],
      zone32: [
        [105, 108, 75, 44, 12, 22, 14, 0],
        [121, 112, 95, 25, 17, 26, 11, 0],
        [127, 118, 87, 31, 9, 20, 12, 0],
      ],
      box1: [
        [109, 108, 77, 42, 10, 25, 17, 0],
        [134, 127, 98, 28, 17, 42, 18, 1],
        [129, 116, 87, 36, 11, 18, 14, 0],
      ],
      double: [
        [118, 113, 78, 31, 14, 23, 11, 0],
        [117, 111, 104, 27, 21, 28, 12, 0],
        [115, 111, 93, 28, 12, 14, 12, 0],
      ],
      pressure: [
        [135, 129, 92, 44, 14, 34, 21, 1],
        [139, 125, 92, 25, 12, 40, 18, 0],
        [122, 111, 102, 37, 12, 21, 17, 0],
      ],
      hunting: [
        [119, 114, 80, 37, 13, 23, 16, 0],
        [135, 123, 90, 26, 9, 37, 10, 0],
        [116, 104, 96, 36, 12, 20, 14, 0],
      ],
    };
    const patches: Record<string, TacticsPatch | undefined> = {
      default: undefined,
      zone23: { defense: { scheme: 'zone23' } },
      zone32: { defense: { scheme: 'zone32', starPlan: 'deny' } },
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
  });

  it('makes a box-and-one aimed at a star with non-shooters around him worth about twice as much, and one against a shooting team cost about twice as much', () => {
    // engineDefense's shapes and Lab runs (team 4 defending, team 9 reshaped)
    const shaped = (kind: 'helio' | 'shooters') => {
      const players = structuredClone(teamPlayers(league, 9)).sort((a, b) => b.ovr - a.ovr);
      const tactics = structuredClone(league.teams[9].tactics);
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
    };
    const value = (kind: 'helio' | 'shooters', edge: number) => {
      K.tacticEdge = edge;
      const s = shaped(kind);
      const off = side(9, undefined, s.players, s.tactics);
      const run = (patch: TacticsPatch): LabSummary => runLab({ a: side(4, patch), b: off, games: 500, seed: 31 });
      return pairedDelta(run(man), run({ defense: { ...man.defense, scheme: 'box1', ...(kind === 'helio' && { chase: [s.star.pid] }) } }));
    };
    const [r1, w1, r2, w2] = [value('helio', 1), value('shooters', 1), value('helio', 2), value('shooters', 2)];
    // aimed right it gains more and aimed wrong it costs more, and the gap between the two (the part of
    // its value that comes from the matchup) is about twice what it was
    // (about +0.7 and -2.6 per 100 at 1x here, +1.2 and -4.8 at 2x: a gap 1.8 times as wide)
    expect(r2.delta).toBeGreaterThan(r1.delta);
    expect(w2.delta).toBeLessThan(w1.delta - 1);
    const ratio = (r2.delta - w2.delta) / (r1.delta - w1.delta);
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(2.6);
  });
});
