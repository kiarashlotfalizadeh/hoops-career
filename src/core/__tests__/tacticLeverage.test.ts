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
    // game, crunch-time touches, home court and the staff's substitutions were polished, and when the AI's
    // playbooks were recalibrated and the league's rates recentred: what this pins is that 1x leverage plays
    // every tactical edge at its 1x size, game after game)
    const expected: Record<string, number[][]> = {
      default: [
        [104, 122, 67, 38, 9, 18, 18, 0],
        [128, 107, 109, 25, 22, 34, 9, 0],
        [121, 110, 96, 33, 13, 18, 10, 0],
      ],
      zone23: [
        [114, 109, 77, 40, 12, 14, 12, 0],
        [114, 122, 101, 25, 21, 30, 11, 0],
        [114, 118, 96, 34, 9, 13, 12, 0],
      ],
      zone32: [
        [115, 124, 71, 43, 12, 19, 16, 0],
        [119, 129, 88, 21, 11, 28, 10, 0],
        [126, 112, 85, 33, 9, 24, 13, 0],
      ],
      box1: [
        [113, 124, 79, 44, 13, 22, 16, 0],
        [128, 125, 97, 31, 13, 29, 11, 0],
        [123, 102, 94, 37, 9, 14, 11, 0],
      ],
      double: [
        [121, 114, 76, 36, 10, 26, 14, 0],
        [121, 114, 97, 33, 18, 17, 12, 0],
        [119, 109, 94, 27, 14, 16, 12, 0],
      ],
      pressure: [
        [113, 128, 78, 49, 12, 33, 24, 0],
        [130, 129, 93, 26, 14, 34, 21, 0],
        [112, 120, 92, 24, 13, 28, 21, 0],
      ],
      hunting: [
        [115, 105, 79, 44, 10, 14, 15, 0],
        [123, 124, 92, 28, 12, 30, 16, 0],
        [118, 97, 97, 28, 11, 14, 10, 0],
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
