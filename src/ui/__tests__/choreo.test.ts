// The live court's keyframes: players (1.45 ft circles) shouldn't be drawn on top of each other, the
// sets and defenses look like themselves, its score follows the scoreboard, timeouts name their caller
// and the captions call the play.
import { describe, expect, it, vi } from 'vitest';
import { attackDir, buildScript, captionAt, faceWorld, standing, toWorld, type Frame } from '../live/choreo';
import { captured, CHANNELS, CLIPS, DUNK_AT, DUNKS, I, mirror, N, sample } from '../live/court3d/clips';
import { figureGeo } from '../live/court3d/figure';
import { readGlb } from '../live/court3d/glb';
import arenaGlb from '../live/court3d/models/arena.glb?inline';
import figureGlb from '../live/court3d/models/figure.glb?inline';
import peopleGlb from '../live/court3d/models/people.glb?inline';
import { BALL_R, baseClip, bodyOf, HIP, J, Puppet } from '../live/court3d/puppet';
import { House } from '../live/court3d/boards';
import type { PossLog, PossStep } from '../../core/sim/log';
import { createLeague, defaultSettings } from '../../core/league/create';
import { teamPlayers } from '../../core/league/helpers';
import { applyPatch } from '../../core/ai/lab';
import { GameSim } from '../../core/sim/engine';
import { Rng } from '../../core/random';

const off = [1, 2, 3, 4, 5];
const def = [11, 12, 13, 14, 15];
const info = (pid: number) => ({ pid, hgt: pid % 10 === 5 ? 90 : 50, shoot: 60 - (pid % 10), handle: 60 });
const names = (pid: number) => `P${pid}`;
const newLeague = () => createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });

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

const scores = (s: ReturnType<typeof buildScript>) => s.frames.filter((f) => f.score).map((f) => f.score);

describe('live court choreography', () => {
  it('spaces the players, draws actions, sets and defenses, keeps the score, flashes timeouts and captions the play', () => {
    // free throws lined up on separate lane spots
    {
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
    }

    // a closeout on a shot at the rim without standing on the shooter
    {
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
    }

    // the ball gets to the man an action is for: a ball screen brings him up from the corner, a drive and a post-up start with the pass
    {
      // (1 brings it up; 2 stands in the right corner, 5 is the big on the left block)
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
    }

    // the lanes filled in transition: the four without the ball never share one
    for (const pid of off) {
      const s = buildScript(log([{ k: 'transition', pid }]), info);
      expect(closest(s.frames[1])).toBeGreaterThan(2.9);
    }

    // a 3-2 zone with three defenders up top
    {
      const s = buildScript(log([{ k: 'advance', pid: 1 }], 'zone32'), info);
      const set = s.frames[s.frames.length - 1].d;
      expect(set.filter((p) => p.y >= 18).length).toBe(3);
    }

    // a junk defense: the chasers on their men, the others in the box or the triangle
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

    // a set's off-ball screens: its name on the first, its man where the set sends him
    {
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
      expect(floppy.frames.filter((f) => f.flash?.text === 'Floppy')).toHaveLength(1);
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
    }

    // the sets a real game runs drawn without breaking the court
    {
      const league = newLeague();
      const sim = new GameSim(
        { team: league.teams[4], players: teamPlayers(league, 4) },
        { team: league.teams[9], players: teamPlayers(league, 9) },
        { rng: new Rng(11), type: 'regular', record: true, injuries: false },
      );
      // (each set called from the bench now and then)
      const calls = ['floppy', 'spain', 'hammer', 'postSplit'] as const;
      let sets = 0;
      for (let n = 0; !sim.over; n++) {
        if (n % 20 === 3) sim.runSet(0, calls[((n / 20) % calls.length) | 0]);
        sim.step();
        for (const l of sim.drainLogs()) {
          const s = buildScript(l, info);
          if (!l.set) continue;
          sets++;
          expect(s.label.length).toBeGreaterThan(3);
          for (const f of s.frames) for (const p of [...f.o, ...f.d, f.ball]) expect(Math.abs(p.x) <= 25 && p.y >= 0 && p.y <= 47).toBe(true);
        }
      }
      expect(sets).toBeGreaterThanOrEqual(4);
    }

    // a technical free throw (which has no step of its own) counted when it's made, not on the other team's basket
    {
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
      expect(s.frames.at(-1)!.flash?.text).toBe('Tech FT');
    }

    // every possession of real games ends on the scoreboard, technical free throws included, and never runs backwards
    {
      const league = newLeague();
      // six players against a physical, pressing defense: fouled-out players stay on and cost technicals
      const home = {
        team: { ...league.teams[0], tactics: applyPatch(league.teams[0].tactics, { defense: { physicality: 100, pressure: 100 } }) },
        players: teamPlayers(league, 0).slice(0, 6),
      };
      const away = { team: league.teams[1], players: teamPlayers(league, 1) };
      let techs = 0;
      for (const seed of [103, 113]) {
        const sim = new GameSim(home, away, { rng: new Rng(seed), type: 'regular', record: true, injuries: false });
        let shown: [number, number] = [0, 0];
        while (!sim.over) {
          // as the Live screen draws it: the score before the step, then the possession it played
          const from: [number, number] = [sim.T[0].score, sim.T[1].score];
          sim.step();
          for (const l of sim.drainLogs()) {
            const s = buildScript(l, info, from);
            techs += s.frames.filter((f) => f.flash?.text === 'Tech FT').length;
            for (const sc of scores(s)) {
              expect(sc![0] >= shown[0] && sc![1] >= shown[1]).toBe(true);
              shown = sc!;
            }
            expect(shown).toEqual(l.score);
          }
        }
      }
      expect(techs).toBeGreaterThan(0);
    }

    // a timeout flashes once, naming the team that called it
    {
      const s = buildScript(
        log([
          { k: 'timeout', t: 1 },
          { k: 'advance', pid: 1 },
        ]),
        info,
        undefined,
        ['OKC', 'BOS'],
      );
      expect(s.frames.filter((f) => f.flash?.text.startsWith('Timeout')).map((f) => f.flash!.text)).toEqual(['Timeout BOS']);
      // the building's boards read it off the court as it plays: the caller's timeout, and the shot clock running from 24
      const house = new House();
      const at = (i: number, clock: number) =>
        house.read({ script: s, play: { i, clock } as never, standers: [], ball: null }, { abbrevs: ['OKC', 'BOS'], score: [0, 0], clock, q: 1 }, undefined, false, 16);
      at(1, 700);
      expect(house.shot).toBe(24);
      at(s.frames.length, 690);
      expect(house.moment).toMatchObject({ call: 'timeout', side: 1 });
      expect(house.shot).toBe(14);
    }

    // the caller of a real timeout named: the engine's step says whose it was
    {
      const league = newLeague();
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
      expect(s.frames.filter((f) => f.flash?.text.startsWith('Timeout')).map((f) => f.flash!.text)).toEqual([`Timeout ${league.teams[1].abbrev}`]);
    }

    // a full court: the next possession starts where the last one left everyone and runs the floor the other way
    {
      const made = buildScript(
        log([
          { k: 'advance', pid: 1 },
          { k: 'shot', pid: 1, x: 0, y: 6, zone: 'rim', made: true, v: 2 },
        ]),
        info,
      );
      // the home team goes at one end in the first half and the other in the second; the visitors at the opposite one
      expect(made.dir).toBe(1);
      expect([attackDir(0, 1), attackDir(1, 1), attackDir(0, 3), attackDir(1, 4), attackDir(0, 5)]).toEqual([1, -1, -1, 1, -1]);
      expect(toWorld(toWorld({ x: 3, y: 20 }, -1), -1)).toEqual({ x: 3, y: 20 });
      const was = standing(made);
      const back: PossLog = { ...log([{ k: 'advance', pid: 11 }]), off: 1 };
      const next = buildScript(back, info, undefined, undefined, undefined, undefined, was);
      expect(next.dir).toBe(-1);
      // nobody jumps: its first frame is the last one's, seen from the other end
      next.oPids.forEach((pid, i) =>
        expect(Math.hypot(toWorld(next.frames[0].o[i], -1).x - was.at.get(pid)!.x, toWorld(next.frames[0].o[i], -1).y - was.at.get(pid)!.y)).toBeLessThan(0.01),
      );
      // the ball is inbounded to the man who brings it up, from the far end, over half court, into the set
      expect(next.frames[0].ball.y).toBeGreaterThan(80);
      // (a teammate picks it up behind the baseline and gets it in to him)
      expect(next.frames[1].hold).toBeGreaterThan(0);
      expect(next.frames[1].hold).toBeLessThan(5);
      expect(next.frames[1].o[next.frames[1].hold!].y).toBeGreaterThan(90);
      expect(next.frames[2].hold).toBe(0);
      expect(next.frames[2].act[next.frames[1].hold!]).toBe('pass');
      expect(next.frames[2].act[0]).toBe('catch');
      expect(next.frames.some((f) => f.o[0].y > 47)).toBe(true);
      const end = next.frames.at(-1)!;
      expect(Math.max(...end.o.map((p) => p.y), ...end.d.map((p) => p.y))).toBeLessThan(40);
      for (const f of next.frames) expect(closest(f)).toBeGreaterThanOrEqual(2.9);
      // a long run takes longer than a step in the half court, at a pace that still reads
      expect(Math.max(...next.frames.map((f) => f.dur))).toBeLessThan(1200);
      // a steal goes the other way: the thief is off with it, and the break starts from where he is
      const stolen = buildScript(
        log([
          { k: 'advance', pid: 1 },
          { k: 'steal', pid: 1, pid2: 11 },
        ]),
        info,
        undefined,
        undefined,
        undefined,
        undefined,
        standing(next),
      );
      const thief = stolen.frames.at(-1)!;
      expect(thief.hold).toBe(off.length);
      expect(thief.d[0].y).toBeGreaterThan(stolen.frames.at(-2)!.d[0].y);
      const brk = buildScript({ ...log([{ k: 'transition', pid: 11 }]), off: 1, kind: 'transition' }, info, undefined, undefined, undefined, undefined, standing(stolen));
      expect(brk.frames[0].hold).toBe(0);
      // (the defense is still getting back as the ball crosses half court)
      expect(brk.frames[1].d.some((p) => p.y > 30)).toBe(true);
    }

    // captions call the play by name as the court reaches each beat, and the shot as the play-by-play does
    {
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
    }

    // without names they stay on the play label, and whoever has the ball is tagged
    {
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
    }

    // an and-one called, and a make late in a close game that changes who leads
    {
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
      expect(s.frames.some((f) => f.flash?.text === 'And one!')).toBe(true);
      expect(caps).toContain('And one! Foul on P12');
      expect(s.moment).toBeUndefined();
      // as the building sees it, frame by frame: the basket, the and-one, the free throw; at the line the shot clock is off
      const house = new House();
      const calls: string[] = [];
      for (let i = 1; i <= s.frames.length; i++) {
        house.read(
          { script: s, play: { i, clock: 40 - i } as never, standers: [], ball: null },
          { abbrevs: ['OKC', 'BOS'], score: [98, 100], clock: 40 - i, q: 4 },
          undefined,
          true,
          16,
        );
        const c = house.moment?.call;
        if (c && c !== calls[calls.length - 1]) calls.push(c);
      }
      expect(calls).toEqual(['basket', 'andOne', 'free']);
      expect(house.line).toBe(true);
      expect(house.shot).toBeNull();
    }

    // a make as the clock runs out marked: at the buzzer, and the shot that wins it from behind in the 4th
    {
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
      expect(winner.frames.some((f) => f.flash?.text === 'Game winner')).toBe(true);
      // already ahead: a buzzer beater, not the winner
      expect(shot(4, [104, 100]).moment).toBe('buzzer');
      // a miss at the buzzer is no moment
      const miss = buildScript({ ...log([{ k: 'shot', pid: 1, x: 0, y: 25, zone: 'ab3', made: false, v: 3 }]), clockEnd: 0 }, info);
      expect(miss.moment).toBeUndefined();
    }

    // every player named on a real game, and never a caption left empty
    {
      const league = newLeague();
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
          // every frame says what all ten are doing and where they face
          for (const f of s.frames) {
            expect(f.act.length).toBe(10);
            expect(f.face.every((a) => Number.isFinite(a))).toBe(true);
          }
          // whoever has the ball is doing something with it; a shot goes up and then is away
          for (const f of s.frames) if (f.hold !== undefined && f.hold >= 0) expect(f.act[f.hold]).not.toMatch(/^(stand|move|guard|defend|boxout)$/);
          s.frames.forEach((f, i) => {
            const who = f.act.indexOf('release');
            if (who >= 0) expect(s.frames[i - 1].act[who]).toMatch(/^(jumper|floater|layup|dunk|ft)$/);
          });
          for (const st of l.steps) if (st.k === 'shot') shots += st.d ? 1 : 0;
        }
      }
      expect(shots).toBeGreaterThan(100);
    }

    // what the players are doing and where they look, for the 3D figures
    {
      const s = buildScript(
        log([
          { k: 'advance', pid: 1 },
          { k: 'pass', pid: 1, pid2: 2 },
          { k: 'shot', pid: 2, x: 16, y: 22, zone: 'ab3', made: false, v: 3 },
          { k: 'block', pid: 12, pid2: 2 },
          { k: 'reb', pid: 15 },
        ]),
        info,
      );
      const acts = (j: number) => s.frames.map((f) => f.act[j]);
      expect(acts(0)).toContain('pass');
      expect(acts(1).join()).toMatch(/catch,jumper,release/);
      // the man who blocks it goes up with the shooter, and the flight knows whose hand it meets
      expect(acts(6).join()).toMatch(/block,land/);
      expect(s.frames.find((f) => f.swat !== undefined)?.swat).toBe(6);
      expect(acts(9)).toContain('rebound');
      // the shooter faces the basket as he goes up; his defender faces him
      const up = s.frames.find((f) => f.act[1] === 'jumper')!;
      const to = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.y - a.y, b.x - a.x);
      expect(up.face[1]).toBeCloseTo(to(up.o[1], { x: 0, y: 5.25 }), 5);
      expect(Math.cos(up.face[6] - to(up.d[1], up.o[1]))).toBeGreaterThan(0.99);
      // the far end's headings are turned half round on the court itself
      expect(faceWorld(0.5, 1)).toBe(0.5);
      expect(faceWorld(0.5, -1)).toBeCloseTo(0.5 + Math.PI);
      // rim finishes by the play-by-play's word
      const finish = (d: string) => buildScript(log([{ k: 'shot', pid: 1, x: 1, y: 6, zone: 'rim', made: true, v: 2, d }]), info).frames.map((f) => f.act[0]);
      expect(finish('slam dunk')).toContain('dunk');
      expect(finish('driving layup')).toContain('layup');
    }

    // the models Blender built: the player hangs on the puppet's own bones (every point of him on some), and the bench, the coach and the building's props are in their files
    {
      const glb = (file: string) => readGlb(Uint8Array.from(atob(file.slice(file.indexOf(',') + 1)), (ch) => ch.charCodeAt(0)).buffer);
      const geo = figureGeo((o) => o, glb(figureGlb));
      expect([...geo.order].sort((x, y) => x - y)).toEqual(Array.from({ length: 18 }, (_, i) => i));
      expect(geo.wears).toEqual(expect.arrayContaining(['skin', 'hair', 'jersey', 'trim', 'cloth', 'shoe', 'white']));
      const w = geo.body.getAttribute('skinWeight');
      for (let i = 0; i < w.count; i += 37) expect(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i)).toBeCloseTo(1, 3);
      // (6 ft 6 and his soles, standing as built)
      geo.body.computeBoundingBox();
      const tall = geo.body.boundingBox!.max.y - geo.body.boundingBox!.min.y;
      expect(tall).toBeGreaterThan(6.5);
      expect(tall).toBeLessThan(6.9);
      expect([...glb(peopleGlb).keys()].sort()).toEqual(['benchA', 'benchB', 'coach']);
      expect([...glb(arenaGlb).keys()].sort()).toEqual(['ball', 'chair', 'fan', 'fanFar', 'hoop', 'net', 'rim', 'scoreboard', 'table']);
    }

    // the figures: a planted foot stays where it landed, the ball stays in his hands, a big man is bigger
    {
      const big = bodyOf(86, 260, 70);
      const small = bodyOf(73, 180, 40);
      expect(big.s).toBeGreaterThan(small.s);
      expect(big.bulk).toBeGreaterThan(small.bulk);
      expect(CHANNELS.length).toBe(N);
      expect(Object.keys(CLIPS).length).toBeGreaterThanOrEqual(25);
      for (const c of Object.values(CLIPS)) expect(c.at.every((t, i) => i === 0 || t > c.at[i - 1])).toBe(true);
      // running in a straight line at a half-court pace: while a foot is down it doesn't slide
      const p = new Puppet(bodyOf(78, 215));
      let slid = 0;
      let steps = 0;
      const down: ({ x: number; z: number } | null)[] = [null, null];
      for (let t = 0; t < 2400; t += 16) {
        p.update({ x: t * 0.016, z: 3, yaw: Math.PI / 2, act: 'move', ms: t, dur: 2400, ball: false }, 16);
        p.feet.forEach((f, k) => {
          if (f.swing) {
            if (down[k]) steps++;
            down[k] = null;
          } else if (!down[k]) down[k] = { x: f.x, z: f.z };
          else if (t > 400) slid = Math.max(slid, Math.hypot(f.x - down[k]!.x, f.z - down[k]!.z));
        });
        // (his feet are on the floor under him, his head above his hips)
        expect(p.j[J.fl * 3 + 1]).toBeGreaterThan(0);
        expect(p.j[J.head * 3 + 1]).toBeGreaterThan(p.j[J.hips * 3 + 1] + 2);
      }
      expect(steps).toBeGreaterThan(6);
      expect(slid).toBeLessThan(0.02);
      expect(p.clip).toBe('run');
      // a fast break as the plan runs it (50 ft/s): the 3D court plays it at half pace on the body's own
      // time, so his legs keep up; on the play's time they can't, and a planted foot is dragged
      const drag = (pace: number) => {
        const q = new Puppet(bodyOf(78, 215));
        const at: ({ x: number; z: number } | null)[] = [null, null];
        let worst = 0;
        for (let t = 0; t < 1400; t += 16 * pace) {
          q.update({ x: t * 0.05, z: 3, yaw: Math.PI / 2, act: 'move', ms: t, dur: 1400, ball: false }, 16 * pace, 16);
          q.feet.forEach((f, k) => {
            if (f.swing) at[k] = null;
            else if (!at[k]) at[k] = { x: f.x, z: f.z };
            else if (t > 400) worst = Math.max(worst, Math.hypot(f.x - at[k]!.x, f.z - at[k]!.z));
          });
        }
        return worst;
      };
      expect(drag(0.5)).toBeLessThan(0.02);
      expect(drag(1)).toBeGreaterThan(0.5);
      // a jump shot, from the gather to the landing: until the release the shooting hand is on the ball
      const sh = new Puppet(bodyOf(78, 215));
      const out = { x: 0, y: 0, z: 0 };
      let peak = 0;
      for (let t = 0; t < 1100; t += 16) {
        const up = t < 400;
        sh.update({ x: 0, z: 0, yaw: 0, act: up ? 'jumper' : 'release', ms: up ? t : t - 400, dur: up ? 400 : 700, ball: up }, 16);
        const ball = sh.carry(out);
        sh.arms(up ? ball : null);
        if (up && t > 200) expect(Math.hypot(sh.j[J.hr * 3] - ball.x, sh.j[J.hr * 3 + 1] - ball.y, sh.j[J.hr * 3 + 2] - ball.z)).toBeLessThan(BALL_R + 0.2);
        peak = Math.max(peak, sh.j[J.hips * 3 + 1]);
      }
      expect(sh.clip).not.toBe('jumper');
      expect(peak).toBeGreaterThan(HIP + 0.8);
      // the moves a take covers are captured motion (measured on these same channels); the rest are keyed
      for (const id of ['walk', 'run', 'sprint', 'shuffle', 'stance', 'dribble', 'dribbleRun', 'crossover', 'pass', 'jumper', 'freeThrow', 'layup'] as const)
        expect(captured(id)).toBe(true);
      expect(captured('dunk')).toBe(false);
      for (const c of Object.values(CLIPS)) for (const pose of c.poses) expect(pose.length).toBe(N);
      // a loop ends where it began; a pose flipped twice is itself
      for (const id of ['idle', 'dribble', 'run'] as const) {
        const c = CLIPS[id];
        for (let i = 0; i < N; i++) expect(c.poses[c.poses.length - 1][i]).toBeCloseTo(c.poses[0][i], 5);
      }
      const once = sample(CLIPS.dribble, 0.3, new Float32Array(N));
      const twice = Float32Array.from(once);
      mirror(twice);
      expect(twice[I.bx]).toBeCloseTo(-once[I.bx], 5);
      mirror(twice);
      for (let i = 0; i < N; i++) expect(twice[i]).toBeCloseTo(once[i], 5);
      // a dribble: the ball comes down to the floor and back up to his hand, which is on it at the top
      const dr = new Puppet(bodyOf(78, 215));
      let low = 9;
      let high = 0;
      for (let t = 0; t < 2600; t += 16) {
        dr.update({ x: 0, z: 0, yaw: 0, act: 'dribble', ms: t, dur: 2600, ball: true }, 16);
        const ball = dr.carry(out);
        dr.arms(ball);
        low = Math.min(low, ball.y);
        high = Math.max(high, ball.y);
        if (t > 300 && dr.pose[I.gr] > 0.95) expect(Math.hypot(dr.j[J.hr * 3] - ball.x, dr.j[J.hr * 3 + 1] - ball.y, dr.j[J.hr * 3 + 2] - ball.z)).toBeLessThan(BALL_R + 0.2);
      }
      expect(low).toBeLessThan(BALL_R + 0.25);
      expect(high).toBeGreaterThan(2);
      // a crossover leaves it in his other hand, and the dribble that follows is that hand's
      const cr = new Puppet(bodyOf(78, 215));
      for (let t = 0; t < 900; t += 16) cr.update({ x: 0, z: t * 0.006, yaw: 0, act: 'drive', ms: t, dur: 900, ball: true }, 16);
      expect(cr.lefty).toBe(true);
      // he looks at what the scene gives him (his head turns to it, and back when there's nothing), and not at a thing behind him
      // (his idle, his breath and his beat held to one draw: what is measured is where he looks, not where his idle leans him)
      const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const lk = new Puppet(bodyOf(78, 215));
      rnd.mockRestore();
      const stand = (t: number, look?: { x: number; y: number; z: number }, extra = {}) =>
        lk.update({ x: 0, z: 0, yaw: 0, act: 'stand', ms: t, dur: 9000, ball: false, look, ...extra }, 16);
      for (let t = 0; t < 600; t += 16) stand(t, { x: 12, y: 5, z: 6 });
      expect(lk.pose[I.turn] + lk.pose[I.twist]).toBeGreaterThan(0.8);
      for (let t = 600; t < 1200; t += 16) stand(t, { x: -1, y: 5, z: -12 });
      expect(Math.abs(lk.pose[I.turn] + lk.pose[I.twist])).toBeLessThan(0.25);
      // a gesture runs over whatever he's doing and ends: a hand up for the foul goes over his head
      lk.cue('handUp');
      let up = 0;
      for (let t = 1200; t < 3000; t += 16) {
        stand(t);
        lk.arms(null);
        up = Math.max(up, lk.j[J.hr * 3 + 1] - lk.j[J.head * 3 + 1]);
      }
      expect(up).toBeGreaterThan(0.8);
      expect(lk.gesturing).toBeNull();
      // a dead ball after a long run: bent over, hands on his knees; at the line he bounces it before it goes up
      const tired = new Puppet(bodyOf(78, 215));
      for (let t = 0; t < 3200; t += 16) tired.update({ x: t * 0.03, z: 0, yaw: Math.PI / 2, act: 'move', ms: t, dur: 3200, ball: false }, 16);
      for (let t = 0; t < 400; t += 16) tired.update({ x: 96, z: 0, yaw: Math.PI / 2, act: 'stand', ms: t, dur: 9000, ball: false, rest: true }, 16);
      expect(tired.clip).toBe('knees');
      const ft = new Puppet(bodyOf(78, 215));
      let floor = 9;
      for (let t = 0; t < 450; t += 16) {
        ft.update({ x: 0, z: 0, yaw: 0, act: 'hold', ms: t, dur: 450, ball: true, ft: 450 - t }, 16);
        floor = Math.min(floor, ft.carry(out).y);
      }
      expect(floor).toBeLessThan(BALL_R + 0.3);
      // every dunk is up at the rim at the slam
      for (const id of DUNKS) expect(sample(CLIPS[id], DUNK_AT, new Float32Array(N))[I.hip]).toBeGreaterThan(2);
      // what he does picks the clip, not the other way round
      expect(baseClip('guard', false, 0, 0, 0)).toBe('stance');
      expect(baseClip('defend', false, 20, -18, 2)).toBe('backpedal');
      expect(baseClip('dribble', true, 25, 24, 0)).toBe('dribbleRun');
      expect(baseClip('move', false, 40, 39, 0)).toBe('sprint');
    }
  });
});
