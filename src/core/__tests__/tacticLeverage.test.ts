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

describe('tactical leverage', () => {
  const EDGE = K.tacticEdge;
  afterEach(() => void (K.tacticEdge = EDGE));
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
  const side = (tid: number, patch?: TacticsPatch, players?: Player[], tactics?: Tactics): SimTeamInput => ({
    team: { ...league.teams[tid], tactics: applyPatch(tactics ?? league.teams[tid].tactics, patch) },
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
    // game, crunch-time touches, home court and the staff's substitutions were polished: what this pins is
    // that 1x leverage plays every tactical edge at its 1x size, game after game)
    const expected: Record<string, number[][]> = {
      default: [
        [118, 112, 85, 50, 14, 14, 17, 0],
        [113, 102, 97, 19, 14, 34, 10, 0],
        [104, 102, 91, 26, 11, 16, 18, 0],
      ],
      zone23: [
        [118, 106, 85, 49, 13, 16, 14, 0],
        [118, 105, 92, 21, 11, 36, 10, 0],
        [118, 124, 89, 32, 10, 21, 16, 0],
      ],
      zone32: [
        [117, 101, 86, 37, 15, 22, 14, 0],
        [112, 102, 84, 19, 7, 21, 13, 0],
        [108, 109, 91, 34, 11, 26, 18, 0],
      ],
      box1: [
        [123, 91, 83, 48, 12, 19, 17, 0],
        [122, 119, 85, 21, 10, 21, 13, 0],
        [108, 115, 100, 43, 15, 14, 21, 1],
      ],
      double: [
        [106, 116, 82, 35, 18, 28, 16, 0],
        [118, 113, 94, 30, 15, 17, 9, 0],
        [109, 89, 97, 30, 13, 11, 13, 0],
      ],
      pressure: [
        [116, 106, 83, 38, 11, 25, 21, 0],
        [115, 129, 80, 20, 7, 38, 17, 0],
        [110, 113, 103, 32, 14, 23, 12, 0],
      ],
      hunting: [
        [117, 115, 78, 50, 6, 14, 19, 0],
        [112, 111, 84, 16, 12, 16, 13, 0],
        [126, 105, 103, 35, 13, 16, 10, 0],
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
