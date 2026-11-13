// The live court's keyframes: players (1.45 ft circles) shouldn't be drawn on top of each other, the
// sets and defenses look like themselves, its score follows the scoreboard, timeouts name their caller
// and the captions call the play.
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FLOOR_L, FLOOR_W, pose, type Stage } from '../live/Court';
import { attackDir, BASKET, buildScript, captionAt, COURT_LEN, faceWorld, standing, toWorld, type Frame, type Pt, type Script, type Standing } from '../live/choreo';
import { Director, REPLAY_GAP, type BigKind } from '../live/court3d/director';
import { ballIn, Spacing, sunk } from '../live/court3d/spacing';
import { blocked, CAM_KINDS, camKind, clearSeat, Operator, seen, shot, type View } from '../live/court3d/cameras';
import { captured, CHANNELS, CLIPS, DUNK_AT, DUNKS, GESTURES, I, mirror, N, PASSES, sample, span } from '../live/court3d/clips';
import { occasionOf } from '../live/occasion';
import { figureGeo } from '../live/court3d/figure';
import { readGlb } from '../live/court3d/glb';
import arenaGlb from '../live/court3d/models/arena.glb?inline';
import figureGlb from '../live/court3d/models/figure.glb?inline';
import peopleGlb from '../live/court3d/models/people.glb?inline';
import { bouncePass, meets, planShot, RIM_H, shotAt, shotSpeed, spinFor, Spring, stretch, type How } from '../live/court3d/ballistics';
import { NET, NetSim } from '../live/court3d/net';
import { BALL_R, baseClip, bodyOf, hash, HIP, J, Puppet } from '../live/court3d/puppet';
import { House } from '../live/court3d/boards';
import { ShotClock, shotText } from '../live/shotClock';
import { createTicker } from '../live/ticker';
import { Rig, unshadowed } from '../live/court3d/rig';
import { lit, ROWS } from '../live/court3d/bowl';
import type { PossLog, PossStep } from '../../core/sim/log';
import type { League } from '../../core/types';
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

/** At most this share of pairs of men a frame have trunks inside each other, and of frames a man's ball inside his own body (a real game, as the 3D court draws it: about 0.00007 and none; the ball was in 5% of frames before it was kept out). */
const TRUNKS_MAX = 0.0002;
const MINE_MAX = 0.005;

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
    // the building's lamps: four throw shadows, each map holding the whole floor; a slow device keeps two, then
    // none; the house lights come down for the open and a timeout, and the lamps stay as they were
    {
      const world = new Scene();
      const rig = new Rig(world);
      expect(rig.lamps.filter((l) => l.castShadow)).toHaveLength(4);
      for (const l of rig.lamps) {
        const c = l.shadow.camera;
        expect(c.right - c.left).toBeGreaterThan(FLOOR_W);
        expect(c.top - c.bottom).toBeGreaterThan(FLOOR_W);
        expect((c.right - c.left) * (c.top - c.bottom)).toBeGreaterThan(FLOOR_L * FLOOR_W);
      }
      // (the far side's two maps are drawn in turn after the first frames: three of the four a frame)
      const drawn = () => (rig.turn(), rig.lamps.filter((l) => l.shadow.autoUpdate || l.shadow.needsUpdate).length);
      expect([drawn(), drawn(), drawn(), drawn(), drawn()]).toEqual([4, 4, 3, 3, 3]);
      expect(rig.lamps[2].shadow.needsUpdate).not.toBe(rig.lamps[3].shadow.needsUpdate);
      rig.lite(1);
      expect(rig.lamps.filter((l) => l.castShadow)).toHaveLength(2);
      rig.lite(3);
      expect(rig.lamps.some((l) => l.castShadow)).toBe(false);
      const [sky, env, lamp] = [rig.sky.intensity, world.environmentIntensity, rig.key.intensity];
      rig.mood(1, 1e9);
      expect(rig.drama).toBeCloseTo(1);
      expect(rig.sky.intensity).toBeLessThan(sky * 0.6);
      expect(world.environmentIntensity).toBeLessThan(env);
      expect(rig.key.intensity).toBe(lamp);
      rig.mood(0, 1e9);
      expect(rig.sky.intensity).toBeCloseTo(sky);
      // the stands sit under the floor's light, less of it every row up: by the floor most of a stop down, the back rows two
      const rows = Array.from({ length: ROWS }, (_, i) => lit(i));
      expect(rows[0]).toBeLessThan(0.75);
      expect(rows[0]).toBeGreaterThan(0.5);
      expect(rows[ROWS - 1]).toBeLessThan(rows[0] / 2);
      expect(rows[ROWS - 1]).toBeGreaterThan(0.15);
      for (let i = 1; i < ROWS; i++) expect(rows[i]).toBeLessThan(rows[i - 1]);
      // (a material no shadow falls on carries none of the lamps' shadow maps)
      const sh = { vertexShader: 'void main() {}', fragmentShader: 'void main() {}' };
      unshadowed(sh);
      expect(sh.vertexShader.startsWith('#undef USE_SHADOWMAP')).toBe(true);
      expect(sh.fragmentShader.startsWith('#undef USE_SHADOWMAP')).toBe(true);
    }
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
      // the scorebug keeps its own shot clock off the same frames, and shows what the boards show
      const bug = new ShotClock();
      expect(bug.read(s, { i: 1, clock: 700 })).toBe(24);
      expect(bug.read(s, { i: s.frames.length, clock: 690 })).toBe(house.shot);
      expect([shotText(24), shotText(13.2), shotText(4.96), shotText(0.04)]).toEqual(['24', '14', '4.9', '0.0']);
      // the ticker carries it to the scorebug; a jump (a skip, a break) leaves it off until the court plays on
      const ticker = createTicker(720, [0, 0]);
      ticker.set(700, [0, 0], false, 24);
      expect(ticker.get().shot).toBe(24);
      ticker.set(650, [2, 0], true);
      expect(ticker.get()).toMatchObject({ clock: 650, score: [2, 0], shot: null });
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
      // (out of bounds, the one man who is: he has a look with it over his head before he throws it in)
      expect(next.frames[1].o[next.frames[1].hold!].y).toBeGreaterThan(94);
      expect(next.frames[2].hold).toBe(next.frames[1].hold);
      expect(next.frames[2].act[next.frames[1].hold!]).toBe('inbound');
      expect(next.frames[2].o.filter((p) => p.y > 94)).toHaveLength(1);
      expect(next.frames[3].hold).toBe(0);
      expect(next.frames[3].act[next.frames[1].hold!]).toBe('pass');
      expect(next.frames[3].act[0]).toBe('catch');
      // the game's first possession opens with the tip: both fives round the circle, the two centres up for it, tapped to a guard
      const tipped = buildScript({ ...log([{ k: 'advance', pid: 1 }]), clockStart: 720 }, info);
      expect(tipped.frames[0].o.every((p) => p.y >= 47 && p.y < 60) && tipped.frames[0].d.every((p) => p.y <= 47 && p.y > 34)).toBe(true);
      expect(tipped.frames[1].act.map((x, j) => (x === 'tip' ? j : -1)).filter((j) => j >= 0)).toEqual([4, 9]);
      expect([tipped.frames[1].hold, tipped.frames[2].hold, tipped.frames[2].act[4]]).toEqual([-1, 0, 'land']);
      expect(Math.max(...tipped.frames.at(-1)!.o.map((p) => p.y))).toBeLessThan(40);
      // a shot is up: each man who goes to the glass has a defender's back in him (a body's width off, on the rim's side), nobody boxes out air
      const up = buildScript(
        log([
          { k: 'advance', pid: 1 },
          { k: 'shot', pid: 1, x: 0, y: 26, v: 3, made: false, zone: 'ab3' },
        ]),
        info,
      ).frames.at(-1)!;
      const [crash, box] = [up.act.flatMap((x, j) => (x === 'crash' ? [up.o[j]] : [])), up.act.flatMap((x, j) => (x === 'boxout' ? [up.d[j - 5]] : []))];
      expect(crash.length).toBeGreaterThan(0);
      expect(box).toHaveLength(crash.length);
      for (const b of box) {
        const man = crash.find((c) => Math.hypot(c.x - b.x, c.y - b.y) < 3.2)!;
        expect(Math.hypot(man.x, man.y - 5.25)).toBeGreaterThan(Math.hypot(b.x, b.y - 5.25) + 2);
      }
      // the moves those are: a clip each, and a man out of bounds with it holds it over his head
      for (const id of ['tip', 'putback', 'hook', 'pull', 'start'] as const) expect(span(CLIPS[id])[1]).toBeGreaterThan(300);
      expect([baseClip('inbound', true, 0, 0, 0), baseClip('crash', false, 0, 0, 0), baseClip('crash', false, 12, 12, 0)]).toEqual(['inbound', 'crash', 'jog']);
      expect(sample(CLIPS.inbound, 0.2, new Float32Array(N))[I.by]).toBeGreaterThan(7);
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
      // (and the scorebug's, frame by frame, the same)
      const bug = new ShotClock();
      for (let i = 1; i <= s.frames.length; i++) bug.read(s, { i, clock: 40 - i });
      expect(bug.line).toBe(true);
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
      expect([...geo.order].sort((x, y) => x - y)).toEqual(Array.from({ length: 31 }, (_, i) => i));
      expect(geo.wears).toEqual(expect.arrayContaining(['skin', 'hair', 'jersey', 'trim', 'cloth', 'shoe', 'white']));
      const w = geo.body.getAttribute('skinWeight');
      for (let i = 0; i < w.count; i += 37) expect(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i)).toBeCloseTo(1, 3);
      // (6 ft 6 and his soles, standing as built)
      geo.body.computeBoundingBox();
      const tall = geo.body.boundingBox!.max.y - geo.body.boundingBox!.min.y;
      expect(tall).toBeGreaterThan(6.5);
      expect(tall).toBeLessThan(6.9);
      expect([...glb(peopleGlb).keys()].sort()).toEqual(['bench', 'benchFar', 'official', 'officialFar', 'staff', 'staffFar']);
      expect([...glb(arenaGlb).keys()].sort()).toEqual([
        'ball',
        'chair',
        'fanA',
        'fanB',
        'fanC',
        'fanD',
        'fanE',
        'fanF',
        'fanFar',
        'fanKid',
        'fanLow',
        'fanMidA',
        'fanMidB',
        'hoop',
        'net',
        'rim',
        'scoreboard',
        'stall',
        'table',
      ]);
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
      // (a man's stride for that speed, about three steps a second: not a patter of little ones)
      expect(steps).toBeGreaterThan(6);
      expect(steps).toBeLessThan(10);
      expect(slid).toBeLessThan(0.02);
      expect(p.clip).toBe('run');
      // a fast break as the plan runs it (50 ft/s), at the 3D court's half pace and on the play's own time: however
      // fast, a planted foot is never dragged (what it can't cover he covers in the air between strides)
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
      expect(drag(1)).toBeLessThan(0.02);
      // a runner's foot rolls (heel up as he leaves it, toes up before it lands), two men at one speed don't run in
      // step, and what hangs off him trails him when he stops dead and settles
      const men = [3, 11].map((who) => ({ who, m: new Puppet(bodyOf(who === 3 ? 75 : 83, who === 3 ? 190 : 250)), up: [] as boolean[] }));
      let toesDown = 0;
      let toesUp = 0;
      for (let t = 0; t < 4000; t += 16)
        for (const r of men) {
          r.m.update({ x: Math.min(t, 3000) * 0.018, z: 3, yaw: Math.PI / 2, act: t < 3000 ? 'move' : 'stand', ms: t, dur: 4000, ball: false, who: r.who }, 16);
          if (t > 600 && t < 3000) {
            r.up.push(r.m.feet[0].swing);
            toesDown = Math.max(toesDown, r.m.feet[0].pitch);
            toesUp = Math.min(toesUp, r.m.feet[0].pitch);
          }
          if (r.who === 3 && t === 3008) expect(Math.abs(r.m.trail.z)).toBeGreaterThan(0.03);
        }
      expect(toesDown).toBeGreaterThan(0.5);
      expect(toesUp).toBeLessThan(-0.05);
      expect(men[0].up.filter((u, i) => u !== men[1].up[i]).length / men[0].up.length).toBeGreaterThan(0.15);
      expect(Math.hypot(men[0].m.trail.x, men[0].m.trail.y, men[0].m.trail.z)).toBeLessThan(0.06);
      // a jump off two feet is a take's: a crouch, up to its top as a thrown thing goes (most of the height in the
      // first half of the way up), and a landing that gives
      const hipAt = (t: number) => sample(CLIPS.rebound, t, new Float32Array(N))[I.hip];
      const [r0, r1] = span(CLIPS.rebound);
      const hips = Array.from({ length: 80 }, (_, i) => hipAt(r0 + ((r1 - r0) * i) / 79));
      const top = hips.indexOf(Math.max(...hips));
      expect(hipAt(0)).toBeGreaterThan(1.3);
      expect(Math.min(...hips.slice(0, top))).toBeLessThan(-0.3);
      expect(Math.min(...hips.slice(top))).toBeLessThan(-0.25);
      const off = hips
        .slice(0, top)
        .reverse()
        .findIndex((h) => h <= 0);
      expect(hips[top - Math.round(off / 2)]).toBeGreaterThan(hipAt(0) * 0.6);
      // about to pass, he draws it in: the wind-up is one of his passes, the ball still in his hands
      const ps = new Puppet(bodyOf(78, 215));
      for (let t = 0; t < 400; t += 16) ps.update({ x: 0, z: 0, yaw: 0, act: 'hold', ms: t, dur: 400, ball: true, pass: 400 - t, who: 5 }, 16);
      expect(PASSES).toContain(ps.one?.id);
      expect(ps.one!.tau).toBeLessThan(0);
      expect(Math.max(ps.pose[I.gl], ps.pose[I.gr])).toBeGreaterThan(0.9);
      // a man on the side his dribble is on: it goes to his other hand, and stays clear of that man's middle
      const pr = new Puppet(bodyOf(78, 215));
      const on = { x: -1.2, z: 0.7 };
      let near = 9;
      for (let t = 0; t < 2000; t += 16) {
        pr.update({ x: 0, z: 0, yaw: 0, act: 'dribble', ms: t, dur: 2000, ball: true, press: on, who: 5 }, 16);
        const ball = pr.carry({ x: 0, y: 0, z: 0 });
        if (t > 400) near = Math.min(near, Math.hypot(ball.x - on.x, ball.z - on.z));
      }
      expect(pr.lefty).toBe(true);
      expect(near).toBeGreaterThan(1);
      // pulling up out of a run is a take's stop; knocked over, he goes down and gets up
      const st = new Puppet(bodyOf(78, 215));
      const seen = new Set<string>();
      let lowest = 9;
      for (let t = 0; t < 4200; t += 16) {
        if (t === 2496) st.stumble();
        st.update({ x: Math.min(t, 1200) * 0.018, z: 0, yaw: Math.PI / 2, act: t < 1200 ? 'move' : 'stand', ms: t, dur: 4200, ball: false, who: 5 }, 16);
        seen.add(st.clip);
        if (t > 2496) lowest = Math.min(lowest, st.j[J.hips * 3 + 1]);
      }
      expect(seen.has('stop')).toBe(true);
      expect(seen.has('stumble')).toBe(true);
      // (all the way down: his seat on the floor)
      expect(lowest).toBeLessThan(1.2);
      expect(st.clip).not.toBe('stumble');
      // a dunk's way up is a thrown thing's: most of its height in the first half of the rise
      const dk = (t: number) => sample(CLIPS.dunk, t, new Float32Array(N))[I.hip];
      expect(dk(55)).toBeGreaterThan(dk(150) * 0.7);
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
      for (const id of [
        'walk',
        'jog',
        'run',
        'sprint',
        'shuffle',
        'stance',
        'dribble',
        'dribbleRun',
        'dribbleWalk',
        'crossover',
        'pass',
        'jumper',
        'freeThrow',
        'layup',
        'rebound',
      ] as const)
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
        const ball = dr.bounced(dr.carry(out));
        dr.arms(ball);
        low = Math.min(low, ball.y);
        high = Math.max(high, ball.y);
        if (t > 300 && dr.pose[I.gr] > 0.95) expect(Math.hypot(dr.j[J.hr * 3] - ball.x, dr.j[J.hr * 3 + 1] - ball.y, dr.j[J.hr * 3 + 2] - ball.z)).toBeLessThan(BALL_R + 0.2);
      }
      expect(low).toBeLessThan(BALL_R + 0.25);
      expect(high).toBeGreaterThan(2);
      // the same dribble as the ball's flight reads it: a bounce of a real length, let go from his hand, that runs
      // 0 to 1 and never backward, his hand on the ball when it's back; nothing to read once the ball is gone
      const hk = new Puppet(bodyOf(78, 215));
      let was = 1;
      let flights = 0;
      for (let t = 0; t < 3000; t += 16) {
        hk.update({ x: 0, z: 0, yaw: 0, act: 'dribble', ms: t, dur: 3000, ball: true, who: 9 }, 16);
        const b = hk.dribble;
        if (hk.clip !== 'dribble' || !b) continue;
        expect(b.period).toBeGreaterThan(250);
        expect(b.period).toBeLessThan(650);
        expect(b.push.y).toBeGreaterThan(2);
        expect(Math.hypot(b.floor.x, b.floor.z)).toBeLessThan(3);
        if (b.phase < was && was < 1) expect(b.phase).toBeLessThan(0.3);
        if (b.phase < 1 && was === 1) flights++;
        if (b.phase === 1 && t > 300) {
          const ball = hk.carry(out);
          hk.arms(ball);
          const k = (b.hand > 0 ? J.hl : J.hr) * 3;
          expect(Math.hypot(hk.j[k] - ball.x, hk.j[k + 1] - ball.y, hk.j[k + 2] - ball.z)).toBeLessThan(BALL_R + 0.45);
        }
        was = b.phase;
      }
      expect(flights).toBeGreaterThan(1);
      hk.update({ x: 0, z: 0, yaw: 0, act: 'stand', ms: 0, dur: 500, ball: false, who: 9 }, 16);
      expect(hk.dribble).toBeNull();
      // a catch into a dribble on the move: his hands go round the ball, from its sides to its top, they don't jump there
      const cd = new Puppet(bodyOf(78, 215));
      let jump = 0;
      const hand = [0, 0, 0];
      for (let t = 0; t < 900; t += 16) {
        cd.update({ x: 0, z: t * 0.01, yaw: 0, act: t < 300 ? 'catch' : 'dribble', ms: t < 300 ? t : t - 300, dur: t < 300 ? 300 : 600, ball: true, who: 7 }, 16);
        cd.arms(cd.bounced(cd.carry(out)));
        const k = J.hl * 3;
        if (t > 250 && t < 520) jump = Math.max(jump, Math.hypot(cd.j[k] - hand[0], cd.j[k + 1] - hand[1], cd.j[k + 2] - hand[2]));
        [hand[0], hand[1], hand[2]] = [cd.j[k], cd.j[k + 1], cd.j[k + 2]];
      }
      expect(jump).toBeLessThan(0.4);
      // a hanging dunk keeps his hands on the ring for a beat after the slam
      const hg = new Puppet(bodyOf(78, 215));
      // (a man whose first dunk is that one)
      let hanger = 0;
      while (DUNKS[Math.floor(hash(hanger, 1) * DUNKS.length)] !== 'dunkHang') hanger++;
      let hung = 0;
      for (let t = 0; t < 1400; t += 16) {
        const up = t < 400;
        hg.update({ x: 4, z: 0, yaw: -Math.PI / 2, act: up ? 'dunk' : 'release', ms: up ? t : t - 400, dur: up ? 400 : 1000, ball: up, aim: { x: 0, z: 0 }, who: hanger }, 16);
        hg.arms(null);
        if (hg.onRim) {
          hung += 16;
          expect(hg.j[J.hr * 3 + 1]).toBeGreaterThan(9);
        }
      }
      expect(hung).toBeGreaterThan(250);
      expect(hg.onRim).toBe(false);
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
      for (let t = 0; t < 1400; t += 16) tired.update({ x: 96, z: 0, yaw: Math.PI / 2, act: 'stand', ms: t, dur: 9000, ball: false, rest: true }, 16);
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
      expect(baseClip('move', false, 10, 10, 0)).toBe('jog');
      expect(baseClip('dribble', true, 5, -4.5, 0)).toBe('dribbleBack');
      // nothing about a man is left to chance (the same man moves the same way every time the game is played), a man off
      // the ball with the play live is ready for it, not stood to attention, and he turns to a thing behind him as a body does
      const twin = [0, 1].map(() => new Puppet(bodyOf(78, 215)));
      let spin = 0;
      let snap = 0;
      let turned = 0;
      for (let t = 0; t < 1500; t += 16)
        for (const m of twin) {
          const before = m.yaw;
          m.update({ x: 0, z: 0, yaw: t < 700 ? 0 : 3, act: 'stand', ms: t, dur: 1500, ball: false, who: 41 }, 16);
          spin = Math.max(spin, Math.abs(m.yaw - before));
          // (the turn gathers speed and gives it up over frames: it never starts or stops in one)
          if (m === twin[0]) [snap, turned] = [Math.max(snap, Math.abs(m.yaw - before - turned)), m.yaw - before];
        }
      for (let i = 0; i < N; i++) expect(twin[0].pose[i]).toBe(twin[1].pose[i]);
      expect(twin[0].clip.startsWith('spot')).toBe(true);
      expect(twin[0].pose[I.hip]).toBeLessThan(-0.05);
      expect(Math.abs(twin[0].yaw - 3)).toBeLessThan(0.1);
      expect(spin).toBeLessThan(0.2);
      expect(snap).toBeLessThan(0.04);
      // a dribble as the scene flies it: off the floor, and the palm on the ball as it leaves his hand and as it comes back
      const bd = new Puppet(bodyOf(78, 215));
      let flying = 1;
      let floorY = 9;
      for (let t = 0; t < 3000; t += 16) {
        bd.update({ x: 0, z: t * 0.004, yaw: 0, act: 'dribble', ms: t / 2, dur: 3000, ball: true, who: 9 }, 8, 16);
        const ball = bd.bounced(bd.carry(out));
        bd.arms(ball);
        const b = bd.dribble;
        const now = b?.phase ?? 1;
        if (b && t > 600 && now < 1 !== flying < 1) {
          const k = (b.hand > 0 ? J.hl : J.hr) * 3;
          const hand = bd.world(bd.j[k], bd.j[k + 1], bd.j[k + 2], { x: 0, y: 0, z: 0 });
          expect(Math.hypot(hand.x - ball.x, hand.y - ball.y - BALL_R - 0.12, hand.z - ball.z)).toBeLessThan(0.15);
        }
        if (t > 600) floorY = Math.min(floorY, ball.y);
        flying = now;
      }
      expect(floorY).toBeLessThan(BALL_R + 0.2);
    }

    // the ten of a real game as the 3D court draws them (the plan's spots kept apart, then the bodies): no two trunks
    // go into each other and no man's ball goes through his own head or legs (spacing.ts's shapes, as the motion lab
    // measures whole games); two big men side by side are kept as far apart as their shoulders need, and two who meet
    // (a box-out) are drawn body to body and no nearer
    {
      const lg = newLeague();
      const sim = new GameSim(
        { team: lg.teams[2], players: teamPlayers(lg, 2) },
        { team: lg.teams[5], players: teamPlayers(lg, 5) },
        { rng: new Rng(23), type: 'regular', record: true, injuries: false },
      );
      const plays: Script[] = [];
      let before: [number, number] = [0, 0];
      let left: { at: Standing; q: number } | undefined;
      while (!sim.over && plays.length < 24) {
        sim.step();
        for (const l of sim.drainLogs()) {
          const sc = buildScript(l, info, before, undefined, undefined, undefined, left?.q === l.q ? left.at : undefined);
          before = [...l.score] as [number, number];
          left = { at: standing(sc), q: l.q };
          if (sc.frames.length) plays.push(sc);
        }
      }
      const space = new Spacing();
      const men = new Map<number, Puppet>();
      const world = new Map<number, Float32Array>();
      const [at, go, build] = [new Float32Array(20), new Float32Array(20), new Float32Array(30)];
      const v = { x: 0, y: 0, z: 0 };
      const scene = (p: Pt, dir: 1 | -1) => {
        const w = toWorld(p, dir);
        return { x: w.y - COURT_LEN / 2, z: -w.x };
      };
      let frames = 0;
      let trunks = 0;
      let mine = 0;
      for (const sc of plays) {
        const pids = [...sc.oPids, ...sc.dPids];
        const total = sc.frames.reduce((n, f) => n + f.dur, 0);
        const rim = scene(BASKET, sc.dir);
        for (let t = 0; t <= total; t += 16) {
          const play = pose(sc, t, false);
          const carried = play.carried ? play.a.hold! : -1;
          pids.forEach((pid, j) => {
            const now = scene(j < 5 ? play.o[j] : play.d[j - 5], sc.dir);
            const a = scene(j < 5 ? play.a.o[j] : play.a.d[j - 5], sc.dir);
            const b = scene(j < 5 ? play.b.o[j] : play.b.d[j - 5], sc.dir);
            [at[j * 2], at[j * 2 + 1], go[j * 2], go[j * 2 + 1]] = [now.x, now.z, b.x - a.x, b.z - a.z];
            const m = men.get(pid);
            const k = m ? m.body.s * Math.sqrt(m.body.bulk) : 1;
            [build[j * 3], build[j * 3 + 1], build[j * 3 + 2]] = [1.12 * k, 0.48 * k, m?.placed ? m.yaw : NaN];
          });
          space.place(at, go, pids, 32, 16, t === 0, [], build);
          frames++;
          pids.forEach((pid, j) => {
            let m = men.get(pid);
            const pl = lg.players[pid];
            if (!m) men.set(pid, (m = new Puppet(bodyOf(pl?.heightIn ?? 78, pl?.weightLb ?? 215, pl?.ratings.str))));
            const act = play.b.act[j];
            const aimed = act === 'layup' || act === 'dunk' || act === 'floater' || act === 'jumper' || act === 'release';
            m.update(
              {
                x: at[j * 2],
                z: at[j * 2 + 1],
                yaw: Math.PI - faceWorld(play.b.face[j], sc.dir),
                act,
                ms: play.ms,
                dur: play.dur,
                ball: j === carried,
                aim: aimed ? rim : undefined,
                cut: t === 0,
                who: pid,
              },
              16,
              32,
              16,
            );
            let w = world.get(pid);
            if (!w) world.set(pid, (w = new Float32Array(45)));
            for (let q = 0; q < 15; q++) {
              m.world(m.j[q * 3], m.j[q * 3 + 1], m.j[q * 3 + 2], v);
              [w[q * 3], w[q * 3 + 1], w[q * 3 + 2]] = [v.x, v.y, v.z];
            }
            if (j === carried && ballIn(m.bounced(m.carry(v)), w, m.body.s, m.body.bulk, BALL_R, false) > 0.1) mine++;
          });
          for (let i = 0; i < 10; i++)
            for (let j = i + 1; j < 10; j++) {
              const [a, b] = [men.get(pids[i])!, men.get(pids[j])!];
              if (sunk(world.get(pids[i])!, a.body.s, a.body.bulk, world.get(pids[j])!, b.body.s, b.body.bulk, false) > 0.1) trunks++;
            }
        }
      }
      expect(frames).toBeGreaterThan(3000);
      expect(trunks / (frames * 45)).toBeLessThan(TRUNKS_MAX);
      expect(mine / frames).toBeLessThan(MINE_MAX);
      // (two big men side by side, the plan a shoulder's width too near: kept apart by their shoulders; two who meet, touching)
      const pair = new Spacing();
      const two = new Float32Array([0, 0, 2.3, 0, 9, 9]);
      for (let k = 0; k < 30; k++) {
        two.set([0, 0, 2.3, 0, 9, 9]);
        pair.place(two, new Float32Array(6), [1, 2, 3], 16, 16, false, [], new Float32Array([1.35, 0.55, 0, 1.35, 0.55, 0, 1.1, 0.5, 0]));
      }
      expect(two[2] - two[0]).toBeGreaterThan(2.7);
      for (let k = 0; k < 30; k++) {
        two.set([0, 0, 0, 2.9, 9, 9]);
        pair.place(two, new Float32Array(6), [1, 2, 3], 16, 16, false, [{ i: 0, j: 1, w: 1, near: 1.25, share: 0.5 }], new Float32Array([1.1, 0.5, 0, 1.1, 0.5, 0, 1.1, 0.5, 0]));
      }
      expect(Math.hypot(two[2] - two[0], two[3] - two[1])).toBeCloseTo(1.25, 1);
      expect([two[4], two[5]]).toEqual([9, 9]);
    }

    // the cameras that follow the play (cameras.ts): each of the five, in a wide frame and a phone's
    {
      // a half-court set at the right basket: five out, five on them
      const set = [20, 0, 30, 20, 30, -20, 44, 22, 40, -6, 24, 0, 33, 16, 33, -16, 42, 17, 41, -3];
      const view = (aspect: number, bx: number, men = set): View => ({ ball: { x: bx, y: 4, z: 2 }, men, n: 10, end: 1, aspect, near: 0, tight: 0 });
      expect(camKind('nope')).toBe('tv');
      expect(camKind('low')).toBe('low');
      for (const kind of CAM_KINDS)
        for (const aspect of [1.69, 1.3]) {
          const op = new Operator();
          const s = shot();
          const v = view(aspect, 20);
          expect(op.aim(kind, v, 16, false, s)).toBe(true);
          for (let i = 0; i < 300; i++) expect(op.aim(kind, v, 16, false, s)).toBe(false);
          // settled, it holds the ball and its man; all but the two on the men round the ball the rim too, and all ten, head to foot
          const inside = (x: number, y: number, z: number) => {
            const p = seen(s, aspect, x, y, z);
            expect(p.d).toBeGreaterThan(4);
            expect(Math.abs(p.x), `${kind} ${aspect}: ${x}, ${y}, ${z}`).toBeLessThan(1);
            expect(Math.abs(p.y)).toBeLessThan(1);
          };
          inside(20, 4, 2);
          inside(20, 7, 0);
          if (kind !== 'low' && kind !== 'side') inside(47 - 5.25, 10, 0);
          if (kind === 'tv' || kind === 'end' || kind === 'top')
            for (let i = 0; i < 10; i++) {
              inside(set[i * 2], 0, set[i * 2 + 1]);
              inside(set[i * 2], 7, set[i * 2 + 1]);
            }
          // (the gantry never sees under the near side's seats, where nothing is built)
          if (kind === 'tv') expect(seen(s, aspect, s.lx, 0, 46).y).toBeLessThan(-1);
          // a break the other way at 30 ft a second: the ball stays in the picture, the picture never jumps and never cuts
          let worst = 0;
          const was = { ...s };
          // (the cameras at an end follow it as far as the middle of the floor: a play going away from its own basket is not theirs)
          for (let i = 0; i < (kind === 'low' || kind === 'end' ? 70 : 150); i++) {
            const bx = 20 - i * 0.5;
            const run = view(
              aspect,
              bx,
              set.map((m, j) => (j % 2 ? m : m - i * 0.45)),
            );
            run.end = kind === 'low' || kind === 'end' ? 1 : -1;
            expect(op.aim(kind, run, 16, false, s)).toBe(false);
            const p = seen(s, aspect, bx, 4, 2);
            expect(Math.max(Math.abs(p.x), Math.abs(p.y)), `${kind} ${aspect} frame ${i}: ${p.x.toFixed(2)}, ${p.y.toFixed(2)}`).toBeLessThan(1);
            worst = Math.max(worst, Math.hypot(s.lx - was.lx, s.ly - was.ly, s.lz - was.lz));
            Object.assign(was, s);
          }
          expect(worst).toBeLessThan(2);
          // reduced motion: a still picture of the half the ball is in, and a cut when it is well into the other
          const calm = shot();
          op.aim(kind, view(aspect, 20), 16, true, calm);
          const still = { ...calm };
          expect(op.aim(kind, view(aspect, 9), 16, true, calm)).toBe(false);
          expect(calm).toEqual(still);
          expect(op.aim(kind, view(aspect, -9), 16, true, calm)).toBe(true);
          expect(calm).not.toEqual(still);
        }
      // a close-up's camera: in front of his face when nobody is there, round a man who is, never behind the basket's post
      const seat = { x: 0, z: 0 };
      expect(clearSeat(0, 0, 0, [], 0, 22, seat)).toBeLessThan(3);
      expect(seat.z).toBeGreaterThan(15);
      const inTheWay = [0, 8, 3, 9, -3, 9];
      expect(clearSeat(0, 0, 0, inTheWay, 3, 22, seat)).toBeLessThan(3);
      expect(blocked(0, 0, seat.x, seat.z, inTheWay, 3)).toBe(false);
      expect(blocked(0, 0, 0, 22, inTheWay, 3)).toBe(true);
      clearSeat(40, 0, Math.PI / 2, [], 0, 22, seat);
      expect(Math.abs(seat.z)).toBeGreaterThan(4);
    }
    // an instant replay (director.ts) keeps its outcome in the picture, clear of the lower third and the Replay bug, from
    // whichever camera: the man with the ball at its moment (a block's shooter and blocker before it, an and-one's foul),
    // the ball's flight and the basket from the release until the ball is out of the net; a shot from range is seen from
    // behind the shooter; and the picture never jumps. Drawn on stand-ins for the scene's bodies and ball
    {
      const MID = COURT_LEN / 2;
      const PACE = 0.5;
      const STEP = 1000 / 60;
      const RANK: Record<BigKind, number> = { winner: 6, buzzer: 5, and1: 4.5, dunk: 4, three: 2, block: 1 };
      const on = (p: Pt, sc: Script) => ({ x: toWorld(p, sc.dir).y - MID, z: -toWorld(p, sc.dir).x });
      const startOf = (sc: Script, k: number) => sc.frames.slice(1, k).reduce((t, f) => t + f.dur, 0);
      // the big play of each possession of four real games, as the scene notes it
      const bigs: { sc: Script; k: number; kind: BigKind; star: number; shooter: number; fouler: number }[] = [];
      const league = newLeague();
      for (const [h, a, seed] of [
        [0, 1, 5],
        [2, 3, 7],
        [4, 9, 11],
        [6, 8, 13],
      ]) {
        const sim = new GameSim(
          { team: league.teams[h], players: teamPlayers(league, h) },
          { team: league.teams[a], players: teamPlayers(league, a) },
          { rng: new Rng(seed), type: 'regular', record: true, injuries: false },
        );
        while (!sim.over) {
          sim.step();
          for (const l of sim.drainLogs()) {
            const sc = buildScript(l, info);
            let best: (typeof bigs)[number] | null = null;
            for (let k = 1; k < sc.frames.length; k++) {
              const [g, f, nx] = [sc.frames[k - 1], sc.frames[k], sc.frames[k + 1]];
              const shooter = g.hold ?? -1;
              const kind: BigKind | null =
                shooter < 0
                  ? null
                  : f.swat !== undefined
                    ? 'block'
                    : f.fx === 'make' && g.act[shooter] !== 'ft'
                      ? (sc.moment ?? (nx?.flash?.text === 'And one!' ? 'and1' : g.act[shooter] === 'dunk' ? 'dunk' : f.flash?.text === '+3' ? 'three' : null))
                      : null;
              if (kind && (!best || RANK[kind] > RANK[best.kind]))
                best = { sc, k, kind, star: kind === 'block' ? f.swat! : shooter, shooter, fouler: kind === 'and1' ? (nx.foul ?? -1) : -1 };
            }
            if (best) bigs.push(best);
          }
        }
      }
      // (inside the picture, and off what the lower third and the bug cover of it, px)
      const safe = (p: Vector3, w: number, h: number) =>
        p.z < 1 && Math.abs(p.x) < 0.97 && Math.abs(p.y) < 0.96 && !(p.x < -1 + 524 / w && p.y < -1 + 124 / h) && !(p.x < -1 + 200 / w && p.y > 1 - 72 / h);
      let [reels, kept, behind, turned, zoomed] = [0, 0, 0, 0, 0];
      const missed: string[] = [];
      // as a desktop and a phone show it
      for (const [w, h] of [
        [820, 436],
        [375, 288],
      ]) {
        const d = new Director();
        const cam = new PerspectiveCamera(30, w / h, 0.3, 500);
        const [fwd, was] = [new Vector3(), new Vector3()];
        for (const b of bigs) {
          const { sc, k } = b;
          const live: Stage = { script: sc, play: pose(sc, 1e9, false), standers: [], ball: null };
          d.feed(live, REPLAY_GAP * PACE, REPLAY_GAP, REPLAY_GAP, false);
          const pids = [...sc.oPids, ...sc.dPids];
          d.note(sc, k, b.kind, pids[b.star], b.star < sc.oPids.length ? sc.off : ((1 - sc.off) as 0 | 1));
          if (!d.start(sc)) continue;
          const nO = sc.oPids.length;
          const rim = on(BASKET, sc);
          const [g, fk] = [sc.frames[k - 1], sc.frames[k]];
          const rel = startOf(sc, k);
          const dunk = g.act[b.shooter] === 'dunk';
          const at = rel + fk.dur * (b.kind === 'block' ? 0.32 : 0.86);
          // where a man is at `t`, up for his shot or his block and down again
          const man = (t: number, j: number) => {
            const pl = pose(sc, t, false);
            const up = j === b.shooter || j === b.star ? (dunk ? 3.2 : j === b.star && b.kind === 'block' ? 2.4 : 1.6) : 0;
            const [s0, s1] = [rel - g.dur * 0.5, rel + fk.dur * (dunk ? 0.6 : 0.35)];
            return { ...on(j < nO ? pl.o[j] : pl.d[j - nO], sc), y: t > s0 && t < s1 ? up * Math.sin((Math.PI * (t - s0)) / (s1 - s0)) : 0 };
          };
          // the ball: in the hands that have it, up into the shot, thrown as the scene throws it (ballistics.ts), slammed
          // through the rim, or off the blocker's hand
          const from = { ...on(g.o[b.shooter] ?? g.ball, sc), y: dunk ? 9.6 : 8.6 };
          const flight = planShot({ from, rim, kind: g.act[b.shooter] === 'layup' ? 'layup' : 'jumper', made: true, secs: fk.dur / 1000 / PACE, next: null, r: [0.3, 0.6, 0.4] });
          const hand = b.kind === 'block' ? { ...on(fk.d[b.star - nO], sc), y: 9.4 } : from;
          const fall = (p: { x: number; y: number; z: number }, vx: number, vy: number, vz: number, s: number) =>
            new Vector3(p.x + vx * s, Math.max(0.4, p.y + vy * s - 16 * s * s), p.z + vz * s);
          const ballAt = (t: number) => {
            const pl = pose(sc, t, false);
            const secs = (ms: number) => (t - rel - ms) / 1000 / PACE;
            if (t < rel) {
              if (!pl.carried) return new Vector3(on(pl.ball, sc).x, 4, on(pl.ball, sc).z);
              const m = man(t, pl.a.hold!);
              return new Vector3(m.x, m.y + (pl.i === k - 1 && pl.a.hold === b.shooter ? 4 + (from.y - 4) * Math.min(1, pl.ms / pl.dur) : 3.6), m.z);
            }
            const u = (t - rel) / fk.dur;
            if (b.kind === 'block') {
              if (u < 0.32) return new Vector3(from.x, from.y, from.z).lerp(new Vector3(hand.x, hand.y, hand.z), u / 0.32);
              const l = Math.hypot(hand.x - from.x, hand.z - from.z) || 1;
              return fall(hand, ((hand.x - from.x) / l) * 16, 2, ((hand.z - from.z) / l) * 16, secs(0.32 * fk.dur));
            }
            if (dunk) {
              const m = man(t, b.shooter);
              const v = Math.min(1, (t - rel) / 90);
              return t - rel < 90
                ? new Vector3(m.x + (rim.x - m.x) * v, from.y + (RIM_H - 0.2 - from.y) * v, m.z + (rim.z - m.z) * v)
                : fall({ ...rim, y: RIM_H - 0.2 }, 0, -17, 0, secs(90));
            }
            if (u <= 1) return Object.assign(new Vector3(), shotAt(flight, u, { x: 0, y: 0, z: 0 }));
            const [end, v] = [shotAt(flight, 1, { x: 0, y: 0, z: 0 }), shotSpeed(flight, 1, { x: 0, y: 0, z: 0 })];
            return fall(end, v.x * 0.3, v.y, v.z * 0.3, secs(fk.dur));
          };
          let [ok, moment, look, fov] = [true, false, '', 0];
          for (let f = 0; f < 4000 && d.phase !== 'off'; f++) {
            d.feed(live, STEP * PACE, STEP, STEP, false);
            const r = d.reel;
            if (!d.onAir || !r) continue;
            const t = r.t;
            const m = man(t, b.star);
            const [chest, head, ball] = [{ x: m.x, y: 4.5 + m.y, z: m.z }, { x: m.x, y: 6.4 + m.y, z: m.z }, ballAt(t)];
            d.aimReel(cam, chest, head, ball, w / h, STEP, h);
            cam.updateMatrixWorld();
            cam.getWorldDirection(fwd);
            // (the same look from one frame to the next turns and zooms as an operator does, never at once)
            if (look === `${r.cam}${r.t0}` && r.swap < 0) {
              turned = Math.max(turned, (fwd.angleTo(was) * 180) / Math.PI);
              zoomed = Math.max(zoomed, Math.abs(cam.fov - fov));
            }
            [look, fov] = [`${r.cam}${r.t0}`, cam.fov];
            was.copy(fwd);
            if (r.swap >= 0) continue;
            const see = (what: string, x: number, y: number, z: number) => {
              if (safe(new Vector3(x, y, z).project(cam), w, h)) return;
              if (ok) missed.push(`${b.kind} ${r.cam} ${w}px: ${what} at ${(t - rel).toFixed(0)} ms`);
              ok = false;
            };
            if (b.kind !== 'block' && t >= rel && t <= r.t1) {
              if (t < (dunk ? rel + 90 : at) || ball.y >= 6) see('ball', ball.x, ball.y, ball.z);
              see('rim', rim.x, RIM_H, rim.z);
            }
            if (b.kind === 'block' && t < at) {
              const s = man(t, b.shooter);
              see('shooter', s.x, 5 + s.y, s.z);
              see('blocker', chest.x, chest.y, chest.z);
            }
            if (!moment && t >= at) {
              moment = true;
              see('man', chest.x, chest.y, chest.z);
              see('head', head.x, head.y, head.z);
              if (b.kind === 'block') see('ball', ball.x, ball.y, ball.z);
              if (b.fouler >= 0) see('foul', man(t, b.fouler).x, 5, man(t, b.fouler).z);
            }
            // (over his shoulder: behind him, the rim past him)
            if (r.back && t === r.t0 && Math.hypot(r.seat.x - rim.x, r.seat.z - rim.z) > Math.hypot(from.x - rim.x, from.z - rim.z)) behind++;
          }
          d.end();
          reels++;
          if (ok) kept++;
        }
      }
      expect(reels).toBeGreaterThan(300);
      expect(kept / reels, missed.slice(0, 6).join('; ')).toBeGreaterThanOrEqual(0.99);
      expect(behind).toBeGreaterThan(20);
      expect(turned).toBeLessThan(8);
      expect(zoomed).toBeLessThan(3);
    }
    // the ball's flight: every shot starts in the hand, a make ends under the net and a miss never goes down through the
    // ring, whichever way it ends; a jumper spins back; the rim rings and comes to rest
    {
      const rim = { x: -41.75, z: 0 };
      const seen = new Set<How>();
      const at = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < 400; i++) {
        const made = i % 2 === 0;
        const kind = (['jumper', 'layup', 'floater', 'ft'] as const)[(i >> 1) % 4];
        const a = ((i * 37) % 170) * (Math.PI / 180) - Math.PI / 2 + 0.09;
        const far = kind === 'layup' ? 3 : kind === 'ft' ? 13.75 : 6 + ((i * 7) % 20);
        const from = { x: rim.x + Math.cos(a) * far, y: 8 + (i % 3) * 0.5, z: Math.sin(a) * far };
        const r = [(i * 0.618) % 1, (i * 0.377) % 1, (i * 0.251) % 1] as [number, number, number];
        const shot = planShot({ from, rim, kind, made, secs: 0.8 + far * 0.03, next: made ? null : { x: rim.x + 4, y: 0, z: 3 }, r });
        seen.add(shot.how);
        shotAt(shot, 0, at);
        expect(Math.hypot(at.x - from.x, at.y - from.y, at.z - from.z), `${shot.how} leaves the hand`).toBeLessThan(1e-6);
        expect(shot.hits.some((h) => h.what === 'net')).toBe(made);
        shotAt(shot, 1, at);
        if (made) {
          expect(Math.hypot(at.x - rim.x, at.z - rim.z), `${shot.how} ends under the ring`).toBeLessThan(0.2);
          expect(at.y).toBeLessThan(RIM_H - 1.3);
          expect(shotSpeed(shot, 1, at).y).toBeLessThan(0);
        } else {
          let through = false;
          let top = 0;
          for (let u = 0; u <= 1.001; u += 0.02) {
            shotAt(shot, u, at);
            top = Math.max(top, at.y);
            if (at.y < RIM_H - 0.2 && at.y > RIM_H - 1.3 && Math.hypot(at.x - rim.x, at.z - rim.z) < 0.4) through = true;
          }
          expect(through, `${shot.how} misses`).toBe(false);
          expect(top).toBeLessThan(22);
        }
      }
      expect([...seen].sort()).toEqual(['air', 'back', 'backIn', 'bank', 'edge', 'front', 'glass', 'kiss', 'roll', 'round', 'side', 'swish']);
      // (a ball going +x: a shot's top comes back toward the shooter, a rolling one's goes on ahead)
      expect(spinFor('shot', 10, 0, at)!.z).toBeGreaterThan(0);
      expect(spinFor('roll', 10, 0, at)!.z).toBeLessThan(0);
      expect(spinFor('held', 10, 0, at)).toEqual({ x: 0, y: 0, z: 0 });
      expect(spinFor('loose', 10, 0, at)).toBeNull();
      const hinge = new Spring(5.5, 0.16);
      hinge.kick(-3.3);
      let low = 0;
      for (let t = 0; t < 180; t++) {
        hinge.step(1 / 60);
        low = Math.min(low, hinge.x);
      }
      expect(low).toBeLessThan(-0.05);
      expect(low).toBeGreaterThan(-0.3);
      expect(hinge.x).toBe(0);
      // (held down by a man hanging on it, it stays down)
      for (let t = 0; t < 120; t++) hinge.step(1 / 60, -0.1);
      expect(hinge.x).toBeCloseTo(-0.1, 2);
      // a loose ball: dropped on the front of the iron it comes off it upward and outward, thrown at the glass it comes
      // back, dropped down the middle it goes through (slowed by the cords) and never through the bar
      const hoops = [{ x: rim.x, z: 0, out: 1 as const }];
      const fall = (x: number, y: number, vx: number, vy: number) => {
        const p = { x, y, z: 0 };
        const v = { x: vx, y: vy, z: 0 };
        let met = 0;
        for (let t = 0; t < 60 && p.y > 7; t++) {
          v.y -= 32 / 120;
          p.x += v.x / 120;
          p.y += v.y / 120;
          const now = meets(p, v, 1 / 120, hoops);
          met ||= now;
          expect(Math.hypot(Math.abs(p.x - rim.x) - 0.776, p.y - RIM_H)).toBeGreaterThan(0.41);
        }
        return { p, v, met };
      };
      const iron = fall(rim.x + 0.95, 10.8, 0, -8);
      expect(iron.met).toBeGreaterThan(0);
      expect(iron.p.x).toBeGreaterThan(rim.x + 0.95);
      const glass = fall(rim.x - 0.5, 11.5, -12, 0);
      expect(glass.met).toBeLessThan(0);
      expect(glass.v.x).toBeGreaterThan(0);
      const clean = fall(rim.x, 10.8, 0, -14);
      expect(clean.met).toBe(0);
      expect(clean.p.y).toBeLessThanOrEqual(7);
      expect(clean.v.y).toBeGreaterThan(-19);
      // a bounce pass meets the floor where it is asked to and ends in the hands; only a fast ball is drawn long
      expect(bouncePass(4, 3.5, BALL_R, 0.6, 0.6, 0.5)).toBeCloseTo(BALL_R, 5);
      expect(bouncePass(4, 3.5, BALL_R, 0.6, 1, 0.5)).toBeCloseTo(3.5, 5);
      expect(bouncePass(4, 3.5, BALL_R, 0.6, 0, 0.5)).toBeCloseTo(4, 5);
      expect(stretch(20)).toBe(0);
      expect(stretch(200)).toBeLessThan(0.2);
    }

    // the net: it hangs still, a ball through it moves it and stretches no cord past what cord gives, and it comes to rest
    {
      const net = new NetSim();
      expect(net.step(1 / 60, null, 0)).toBe(false);
      const rest = Float32Array.from(net.at);
      let moved = 0;
      for (let f = 0; f < 40; f++) {
        net.step(1 / 60, { x: 0, y: 0.7 - f * 0.07, z: 0 }, 0);
        for (let i = 0; i < rest.length; i++) moved = Math.max(moved, Math.abs(net.at[i] - rest[i]));
        expect(Array.from(net.at).every(Number.isFinite)).toBe(true);
        for (let l = 0; l < net.links.length; l += 2) {
          const [a, b] = [net.links[l] * 3, net.links[l + 1] * 3];
          expect(Math.hypot(net.at[a] - net.at[b], net.at[a + 1] - net.at[b + 1], net.at[a + 2] - net.at[b + 2])).toBeLessThan(0.75);
        }
      }
      expect(moved).toBeGreaterThan(0.08);
      // (its hooks stay on the ring)
      for (let i = 0; i < NET.n * 3; i++) expect(net.at[i]).toBe(rest[i]);
      for (let f = 0; f < 600 && net.awake; f++) net.step(1 / 60, null, 0);
      expect(net.awake).toBe(false);
      let off = 0;
      for (let i = 0; i < rest.length; i++) off = Math.max(off, Math.abs(net.at[i] - rest[i]));
      expect(off).toBeLessThan(0.2);
    }

    // the end of a game: what kind of win it is (the 3D court celebrates each its own way)
    {
      const at = (q: number, clockEnd: number, score: [number, number]): PossLog => ({ ...log([]), q, clockEnd, score });
      const logs = [at(1, 600, [2, 0]), at(4, 30, [98, 99]), at(4, 4, [100, 99])];
      const lg = { playoffs: [{ id: 's', round: 2, conf: 'E', high: 0, low: 1, highSeed: 1, lowSeed: 8, highWins: 2, lowWins: 1 }] as League['playoffs'] };
      expect(occasionOf(lg, { type: 'regular' }, logs, 0)).toBe('late');
      // (the lead taken with half a minute left, or a lead kept from the start, is just a win)
      expect(occasionOf(lg, { type: 'regular' }, [at(1, 600, [2, 0]), at(4, 30, [100, 99])], 0)).toBe('win');
      expect(occasionOf(lg, { type: 'regular' }, logs, 1)).toBe('win');
      expect(occasionOf(lg, { type: 'playoffs', seriesId: 's' }, logs.slice(0, 2), 1)).toBe('playoff');
      lg.playoffs[0].highWins = 4;
      lg.playoffs[0].winner = 0;
      expect(occasionOf(lg, { type: 'playoffs', seriesId: 's' }, logs, 0)).toBe('clinch');
      lg.playoffs[0].round = 4;
      expect(occasionOf(lg, { type: 'playoffs', seriesId: 's' }, logs, 0)).toBe('title');
      expect(occasionOf(lg, { type: 'cup', cup: 'final' }, logs, 1)).toBe('title');
      // (its moves: down on his knees and sat on the floor are off his feet, below a crouch; a handshake reaches out at the waist)
      const pose = (id: 'kneel' | 'floor' | 'crouch' | 'hug') => sample(CLIPS[id], 0.3, new Float32Array(N));
      expect(pose('kneel')[I.air]).toBe(1);
      expect(pose('floor')[I.hip]).toBeLessThan(pose('kneel')[I.hip]);
      expect(pose('kneel')[I.hip]).toBeLessThan(pose('crouch')[I.hip] + 0.1);
      expect(pose('hug')[I.lz]).toBeGreaterThan(0.6);
      const shake = sample(GESTURES.shake, 480, new Float32Array(N));
      expect(shake[I.rz]).toBeGreaterThan(1);
      expect(shake[I.ry]).toBeLessThan(-0.5);
    }
  });
});
