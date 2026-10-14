// The live court's keyframes: players (1.45 ft circles) shouldn't be drawn on top of each other,
// and its score follows the scoreboard.
import { describe, expect, it } from 'vitest';
import { buildScript, type Frame } from '../live/choreo';
import type { PossLog, PossStep } from '../../core/sim/log';
import { createLeague, defaultSettings } from '../../core/league/create';
import { teamPlayers } from '../../core/league/helpers';
import { applyPatch } from '../../core/ai/lab';
import { GameSim } from '../../core/sim/engine';
import { Rng } from '../../core/random';

const off = [1, 2, 3, 4, 5];
const def = [11, 12, 13, 14, 15];
const info = (pid: number) => ({ pid, hgt: pid % 10 === 5 ? 90 : 50, shoot: 60 - (pid % 10), handle: 60 });

function log(steps: PossStep[], scheme: PossLog['scheme'] = 'man'): PossLog {
  return {
    off: 0,
    q: 1,
    clockStart: 700,
    clockEnd: 690,
    kind: 'half',
    steps,
    pts: 0,
    score: [0, 0],
    label: 'test',
    lines: [],
    on: [off, def],
    guards: Object.fromEntries(off.map((o, i) => [o, def[i]])),
    scheme,
    help: 50,
  };
}

const closest = (f: Frame) => {
  const all = [...f.o, ...f.d];
  let min = Infinity;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) min = Math.min(min, Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y));
  return min;
};

describe('live court choreography', () => {
  it('lines up free throws on separate lane spots', () => {
    const s = buildScript(
      log([
        { k: 'advance', pid: 1 },
        { k: 'foul', pid: 12 },
        { k: 'ft', pid: 3, v: 1 },
        { k: 'ft', pid: 3, v: 1 },
      ]),
      info,
    );
    const last = s.frames[s.frames.length - 1];
    expect(closest(last)).toBeGreaterThanOrEqual(2.9);
  });

  it('closes out on a shot at the rim without standing on the shooter', () => {
    const s = buildScript(
      log([
        { k: 'advance', pid: 1 },
        { k: 'drive', pid: 1 },
        { k: 'shot', pid: 1, x: 0.5, y: 6.5, zone: 'rim', made: true, v: 2 },
      ]),
      info,
    );
    const contest = s.frames[s.frames.length - 2];
    const shooter = contest.o[0];
    const nearest = Math.min(...contest.d.map((p) => Math.hypot(p.x - shooter.x, p.y - shooter.y)));
    expect(nearest).toBeGreaterThanOrEqual(2.9);
  });

  it('draws a 3-2 zone with three defenders up top', () => {
    const s = buildScript(log([{ k: 'advance', pid: 1 }], 'zone32'), info);
    const set = s.frames[s.frames.length - 1].d;
    expect(set.filter((p) => p.y >= 18).length).toBe(3);
  });
});

describe('the live court score', () => {
  const scores = (s: ReturnType<typeof buildScript>) => s.frames.filter((f) => f.score).map((f) => f.score);

  it("counts a technical free throw (which has no step of its own) when it's made, not on the other team's basket", () => {
    // home scores two from 40-38; a disqualified home player's foul gave the visitors a technical point
    const l = {
      ...log([
        { k: 'advance', pid: 1 },
        { k: 'foul', pid: 3 },
        { k: 'shot', pid: 1, x: 0, y: 6, zone: 'rim', made: true, v: 2 },
      ]),
      pts: 2,
      score: [42, 39] as [number, number],
    };
    expect(scores(buildScript(l, info, [40, 38]))).toEqual([
      [42, 38],
      [42, 39],
    ]);
    // no basket at all: the court still ends on the scoreboard's score
    const quiet = {
      ...log([
        { k: 'advance', pid: 1 },
        { k: 'foul', pid: 12 },
        { k: 'reb', pid: 13 },
      ]),
      score: [41, 38] as [number, number],
    };
    const s = buildScript(quiet, info, [40, 38]);
    expect(scores(s)).toEqual([[41, 38]]);
    expect(s.frames.at(-1)!.flash?.text).toBe('TECH FT');
  });

  it('ends every possession on the scoreboard, technical free throws included, and never runs backwards', () => {
    const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
    // six players against a physical, pressing defense: fouled-out players stay on and cost technicals
    const home = {
      team: { ...league.teams[0], tactics: applyPatch(league.teams[0].tactics, { defense: { physicality: 100, pressure: 100 } }) },
      players: teamPlayers(league, 0).slice(0, 6),
    };
    const away = { team: league.teams[1], players: teamPlayers(league, 1) };
    let techs = 0;
    for (const seed of [103, 106]) {
      const sim = new GameSim(home, away, { rng: new Rng(seed), type: 'regular', record: true, injuries: false });
      let shown: [number, number] = [0, 0];
      while (!sim.over) {
        // as the Live screen draws it: the score before the step, then the possession it played
        const from: [number, number] = [sim.T[0].score, sim.T[1].score];
        sim.step();
        for (const l of sim.drainLogs()) {
          const s = buildScript(l, info, from);
          techs += s.frames.filter((f) => f.flash?.text === 'TECH FT').length;
          for (const sc of scores(s)) {
            expect(sc![0] >= shown[0] && sc![1] >= shown[1]).toBe(true);
            shown = sc!;
          }
          expect(shown).toEqual(l.score);
        }
      }
    }
    expect(techs).toBeGreaterThan(0);
  });
});

describe('timeouts on the court', () => {
  it('flash once, naming the team that called it', () => {
    const s = buildScript(
      log([
        { k: 'timeout', t: 1 },
        { k: 'advance', pid: 1 },
      ]),
      info,
      undefined,
      ['OKC', 'BOS'],
    );
    expect(s.frames.filter((f) => f.flash?.text.startsWith('TIMEOUT')).map((f) => f.flash!.text)).toEqual(['TIMEOUT BOS']);
  });

  it("name the caller of a real timeout: the engine's step says whose it was", () => {
    const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
    const sim = new GameSim(
      { team: league.teams[0], players: teamPlayers(league, 0) },
      { team: league.teams[1], players: teamPlayers(league, 1) },
      { rng: new Rng(3), type: 'regular', record: true, injuries: false },
    );
    for (let i = 0; i < 10; i++) sim.step();
    sim.drainLogs();
    expect(sim.callTimeout(1)).toBe(true);
    sim.step();
    const [first] = sim.drainLogs();
    const s = buildScript(first, info, undefined, [league.teams[0].abbrev, league.teams[1].abbrev]);
    expect(s.frames.filter((f) => f.flash?.text.startsWith('TIMEOUT')).map((f) => f.flash!.text)).toEqual([`TIMEOUT ${league.teams[1].abbrev}`]);
  });
});
