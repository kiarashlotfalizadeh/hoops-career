// The live court's keyframes: players (1.45 ft circles) shouldn't be drawn on top of each other,
// and its score follows the scoreboard.
import { describe, expect, it } from 'vitest';
import { buildScript, captionAt, type Frame } from '../live/choreo';
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

  it('gets the ball to the man an action is for: a ball screen brings him up from the corner, a drive and a post-up start with the pass', () => {
    // (1 brings it up; 2 stands in the right corner, 5 is the big on the left block)
    const names = (pid: number) => `P${pid}`;
    const screen = buildScript(
      log([
        { k: 'advance', pid: 1 },
        { k: 'screen', pid: 5, pid2: 2 },
      ]),
      info,
      undefined,
      undefined,
      names,
    );
    const at = screen.frames.findIndex((f) => f.cap === 'P5 screens for P2');
    expect(screen.frames.slice(0, at).some((f) => f.cap === 'P1 finds P2')).toBe(true);
    expect(screen.frames[at].hold).toBe(off.indexOf(2));
    // never sent over the baseline
    for (const f of screen.frames) expect(f.o[off.indexOf(2)].y).toBeGreaterThanOrEqual(4);
    const drive = buildScript(
      log([
        { k: 'advance', pid: 1 },
        { k: 'drive', pid: 3 },
      ]),
      info,
      undefined,
      undefined,
      names,
    );
    const drives = drive.frames.find((f) => f.cap === 'P3 drives')!;
    expect(drives.hold).toBe(off.indexOf(3));
    // his man stays a step off him, on his hip, not on top of him
    const driver = drives.o[off.indexOf(3)];
    expect(Math.min(...drives.d.map((p) => Math.hypot(p.x - driver.x, p.y - driver.y)))).toBeGreaterThanOrEqual(1.9);
    const post = buildScript(
      log([
        { k: 'advance', pid: 1 },
        { k: 'post', pid: 5 },
      ]),
      info,
    );
    expect(post.frames.at(-1)!.hold).toBe(off.indexOf(5));
  });

  it('fills the lanes in transition: the four without the ball never share one', () => {
    for (const pid of off) {
      const s = buildScript(log([{ k: 'transition', pid }]), info);
      expect(closest(s.frames[1])).toBeGreaterThan(2.9);
    }
  });

  it('draws a 3-2 zone with three defenders up top', () => {
    const s = buildScript(log([{ k: 'advance', pid: 1 }], 'zone32'), info);
    const set = s.frames[s.frames.length - 1].d;
    expect(set.filter((p) => p.y >= 18).length).toBe(3);
  });

  it('draws a junk defense: the chasers on their men, the others in the box or the triangle', () => {
    for (const [scheme, chase, zone] of [
      ['box1', [3], 4],
      ['tri2', [3, 4], 3],
    ] as const) {
      const s = buildScript({ ...log([{ k: 'advance', pid: 1 }], scheme), chase: [...chase] }, info);
      const f = s.frames[s.frames.length - 1];
      // chasers: within a few feet of their men (guards[o] = the defender at the same index)
      for (const o of chase) {
        const i = off.indexOf(o);
        expect(Math.hypot(f.d[i].x - f.o[i].x, f.d[i].y - f.o[i].y)).toBeLessThan(3);
      }
      // the rest hold their spots around the paint
      const rest = f.d.filter((_, i) => !(chase as readonly number[]).includes(off[i]));
      expect(rest).toHaveLength(zone);
      for (const p of rest) expect(Math.abs(p.x) <= 9 && p.y <= 20).toBe(true);
      expect(closest(f)).toBeGreaterThan(1.45);
    }
  });
});

describe('sets on the court', () => {
  it("draws a set's off-ball screens: its name on the first, its man where the set sends him", () => {
    // Floppy for 3: from under the basket off the stagger (4 and 5) to the wing, then the pass from 1
    const floppy = buildScript(
      {
        ...log([
          { k: 'advance', pid: 1 },
          { k: 'pin', pid: 4, pid2: 3 },
          { k: 'pin', pid: 5, pid2: 3 },
          { k: 'pass', pid: 1, pid2: 3 },
        ]),
        set: { id: 'floppy', pid: 3, n: 1 },
      },
      info,
    );
    expect(floppy.frames.filter((f) => f.flash?.text === 'FLOPPY')).toHaveLength(1);
    const end = floppy.frames.at(-1)!;
    const shooter = end.o[off.indexOf(3)];
    expect(Math.abs(shooter.x)).toBeGreaterThan(12);
    expect(shooter.y).toBeGreaterThan(15);
    // the ball found him
    expect(Math.hypot(end.ball.x - shooter.x, end.ball.y - shooter.y)).toBeLessThan(0.01);
    // Elevator: the doors are side by side at the top of the key, and he comes up between them
    const elevator = buildScript(
      {
        ...log([
          { k: 'advance', pid: 1 },
          { k: 'pin', pid: 4, pid2: 3 },
          { k: 'pin', pid: 5, pid2: 3 },
        ]),
        set: { id: 'elevator', pid: 3, n: 1 },
      },
      info,
    );
    const e = elevator.frames.at(-1)!;
    const [s, d1, d2] = [e.o[off.indexOf(3)], e.o[off.indexOf(4)], e.o[off.indexOf(5)]];
    expect(Math.abs(s.x)).toBeLessThan(1);
    expect(Math.min(d1.x, d2.x)).toBeLessThan(s.x);
    expect(Math.max(d1.x, d2.x)).toBeGreaterThan(s.x);
    for (const f of [...floppy.frames, ...elevator.frames]) expect(closest(f)).toBeGreaterThan(1.2);
    // Horns: the two bigs set up at the elbows
    const horns = buildScript({ ...log([{ k: 'advance', pid: 1 }]), set: { id: 'horns', pid: 5, n: 1 } }, info);
    const h = horns.frames.at(-1)!;
    const elbows = off
      .filter((pid) => pid !== 1)
      .map((pid) => h.o[off.indexOf(pid)])
      .filter((p) => Math.abs(Math.abs(p.x) - 6) < 0.01 && Math.abs(p.y - 19.5) < 0.01);
    expect(elbows).toHaveLength(2);
  });

  it('draws the sets a real game runs without breaking the court', () => {
    const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
    const tactics = { ...league.teams[4].tactics, offense: { ...league.teams[4].tactics.offense, sets: ['floppy', 'spain', 'hammer', 'postSplit'] as const } };
    const sim = new GameSim(
      { team: { ...league.teams[4], tactics: { ...tactics, offense: { ...tactics.offense, sets: [...tactics.offense.sets] } } }, players: teamPlayers(league, 4) },
      { team: league.teams[9], players: teamPlayers(league, 9) },
      { rng: new Rng(11), type: 'regular', record: true, injuries: false },
    );
    let sets = 0;
    while (!sim.over) {
      sim.step();
      for (const l of sim.drainLogs()) {
        const s = buildScript(l, info);
        if (!l.set) continue;
        sets++;
        expect(s.label.length).toBeGreaterThan(3);
        for (const f of s.frames) for (const p of [...f.o, ...f.d, f.ball]) expect(Math.abs(p.x) <= 25 && p.y >= 0 && p.y <= 47).toBe(true);
      }
    }
    expect(sets).toBeGreaterThan(4);
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

describe("the court's captions", () => {
  const names = (pid: number) => `P${pid}`;

  it('call the play by name as the court reaches each beat, and the shot as the play-by-play does', () => {
    const s = buildScript(
      log([
        { k: 'advance', pid: 1 },
        { k: 'screen', pid: 5, pid2: 1 },
        { k: 'pass', pid: 1, pid2: 3 },
        { k: 'shot', pid: 3, x: 20, y: 12, zone: 'ab3', made: true, v: 3, pid2: 1, d: 'catch-and-shoot three' },
      ]),
      info,
      [0, 0],
      ['OKC', 'BOS'],
      names,
    );
    const caps = s.frames.map((f) => f.cap).filter(Boolean);
    expect(caps[0]).toBe('test');
    expect(caps).toContain('P5 screens for P1');
    expect(caps).toContain('P1 finds P3');
    expect(caps).toContain('P3, catch-and-shoot three…');
    expect(caps.at(-1)).toBe('P3 catch-and-shoot three: good! (P1 assist)');
    // between captions the last one carries on; before any, the play's label
    expect(captionAt(s, 0)).toBe('test');
    expect(captionAt(s, s.frames.length - 1)).toBe('P3 catch-and-shoot three: good! (P1 assist)');
  });

  it('stay on the play label without names, and tag whoever has the ball', () => {
    const s = buildScript(
      log([
        { k: 'advance', pid: 1 },
        { k: 'pass', pid: 1, pid2: 2 },
        { k: 'shot', pid: 2, x: 0, y: 6, zone: 'rim', made: false, v: 2 },
        { k: 'reb', pid: 12 },
      ]),
      info,
    );
    expect(s.frames.every((f) => f.cap === undefined)).toBe(true);
    expect(captionAt(s, 3)).toBe('test');
    // the pass lands with P2 (offense index 1); the ball in the air is nobody's; the rebound is the defense's
    const pass = s.frames.findIndex((f) => f.hold === 1);
    expect(pass).toBeGreaterThan(0);
    expect(s.frames.some((f) => f.ballZ && f.hold === -1)).toBe(true);
    expect(s.frames.at(-1)!.hold).toBe(off.length + def.indexOf(12));
    expect(s.frames.find((f) => f.ballZ)?.fx).toBe('miss');
  });

  it('call an and-one, and a make late in a close game that changes who leads', () => {
    const late = {
      ...log([
        { k: 'advance', pid: 1 },
        { k: 'shot', pid: 1, x: 0, y: 6, zone: 'rim', made: true, v: 2, d: 'driving layup' },
        { k: 'foul', pid: 12, pid2: 1 },
        { k: 'ft', pid: 1, v: 1, n: 1 },
      ]),
      q: 4,
      clockStart: 40,
      clockEnd: 31,
      pts: 3,
      score: [101, 100] as [number, number],
    };
    const s = buildScript(late, info, [98, 100], ['OKC', 'BOS'], names);
    const caps = s.frames.map((f) => f.cap).filter(Boolean);
    expect(caps).toContain('P1 driving layup: good! Tied at 100!');
    expect(s.frames.some((f) => f.flash?.text === 'AND ONE!')).toBe(true);
    expect(caps).toContain('And one! Foul on P12');
    expect(s.moment).toBeUndefined();
  });

  it('mark a make as the clock runs out: at the buzzer, and the shot that wins it from behind in the 4th', () => {
    const shot = (q: number, before: [number, number], v = 3) =>
      buildScript(
        {
          ...log([
            { k: 'advance', pid: 1 },
            { k: 'shot', pid: 1, x: 0, y: 25, zone: 'ab3', made: true, v },
          ]),
          q,
          clockStart: 6,
          clockEnd: 0,
          pts: v,
          score: [before[0] + v, before[1]] as [number, number],
        },
        info,
        before,
        ['OKC', 'BOS'],
        names,
      );
    expect(shot(2, [50, 40]).moment).toBe('buzzer');
    const winner = shot(4, [99, 100]);
    expect(winner.moment).toBe('winner');
    expect(winner.frames.some((f) => f.flash?.text === 'GAME WINNER')).toBe(true);
    // already ahead: a buzzer beater, not the winner
    expect(shot(4, [104, 100]).moment).toBe('buzzer');
    // a miss at the buzzer is no moment
    const miss = buildScript({ ...log([{ k: 'shot', pid: 1, x: 0, y: 25, zone: 'ab3', made: false, v: 3 }]), clockEnd: 0 }, info);
    expect(miss.moment).toBeUndefined();
  });

  it('name every player on a real game, and never leave a caption empty', () => {
    const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
    const sim = new GameSim(
      { team: league.teams[2], players: teamPlayers(league, 2) },
      { team: league.teams[3], players: teamPlayers(league, 3) },
      { rng: new Rng(5), type: 'regular', record: true, injuries: false },
    );
    const nm = (pid: number) => league.players[pid].lastName;
    let shots = 0;
    while (!sim.over) {
      sim.step();
      for (const l of sim.drainLogs()) {
        const s = buildScript(l, info, undefined, [league.teams[2].abbrev, league.teams[3].abbrev], nm);
        for (const f of s.frames) if (f.cap !== undefined) expect(f.cap).not.toMatch(/^\s|undefined| {2}|^, |\bfor $/);
        for (const st of l.steps) if (st.k === 'shot') shots += st.d ? 1 : 0;
      }
    }
    expect(shots).toBeGreaterThan(100);
  });
});
