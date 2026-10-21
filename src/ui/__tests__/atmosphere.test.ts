// The live game's atmosphere (ui/live/atmosphere.ts): runs, leads and ties, clutch time, the big
// plays, the crowd, the callouts' pace, the break's story and the play-by-play's voice, from crafted
// possession logs and from a whole simulated game.
import { describe, expect, it } from 'vitest';
import type { PossLog, PossStep } from '../../core/sim/log';
import {
  advance,
  breakStory,
  CALL_GAP,
  crowdLevel,
  currentRun,
  foldAll,
  isClutch,
  newTally,
  pickCall,
  voiceLog,
  type AtmoCtx,
  type AtmoEvent,
  type Tally,
} from '../live/atmosphere';
import { feedRows } from '../live/useAtmosphere';
import { createLeague, defaultSettings } from '../../core/league/create';
import { teamPlayers } from '../../core/league/helpers';
import { GameSim } from '../../core/sim/engine';
import { Rng } from '../../core/random';

const NAMES: Record<number, string> = { 1: 'Brunson', 2: 'Bridges', 3: 'Anunoby', 4: 'Hart', 5: 'Towns', 11: 'Maxey', 12: 'Oubre', 13: 'George', 14: 'Drummond', 15: 'Embiid' };
const ctx = (o: Partial<AtmoCtx> = {}): AtmoCtx => ({
  gid: 7,
  user: 0,
  teams: ['Knicks', '76ers'],
  abbrevs: ['NYK', 'PHI'],
  arena: 'Madison Square Garden',
  name: (pid) => NAMES[pid] ?? `#${pid}`,
  stakes: 0,
  ...o,
});

/** A possession by `off` ending with `score`, from `steps`. */
function poss(off: 0 | 1, score: [number, number], steps: PossStep[], o: Partial<PossLog> = {}): PossLog {
  return {
    off,
    q: 1,
    clockStart: 600,
    clockEnd: 590,
    kind: 'half',
    steps,
    pts: steps.reduce((x, s) => x + (s.k === 'shot' && s.made ? (s.v ?? 2) : s.k === 'ft' ? (s.v ?? 0) : 0), 0),
    score,
    label: 'test',
    lines: [],
    on: [
      [1, 2, 3, 4, 5],
      [11, 12, 13, 14, 15],
    ],
    guards: {},
    scheme: 'man',
    help: 50,
    ...o,
  };
}
const make = (pid: number, v = 2, o: Partial<PossStep> = {}): PossStep => ({
  k: 'shot',
  pid,
  made: true,
  v,
  zone: v === 3 ? 'ab3' : 'mid',
  x: 0,
  y: v === 3 ? 30 : 20,
  d: v === 3 ? 'three-pointer' : 'pull-up jumper',
  ...o,
});
const miss = (pid: number, v = 2): PossStep => ({ k: 'shot', pid, made: false, v, zone: 'mid', x: 0, y: 20, d: 'jumper' });

/** A run of possessions: `seq` lists who scores how much in turn (0 home, 1 away; points 0 = a miss), clock running down from `start`. */
function game(seq: [0 | 1, number][], q = 1, start = 600): PossLog[] {
  const score: [number, number] = [0, 0];
  return seq.map(([off, pts], i) => {
    score[off] += pts;
    const shooter = off === 0 ? 1 : 11;
    return poss(off, [...score], [pts ? make(shooter, pts) : miss(shooter)], { q, clockStart: start - i * 12, clockEnd: start - (i + 1) * 12 });
  });
}
const fold = (logs: PossLog[], c = ctx()) => foldAll(logs, c);
const allEvents = (r: { events: AtmoEvent[][] }) => r.events.flat();

describe('runs', () => {
  const pl = (s: 0 | 1, p: number, t = 0) => ({ s, p, t, q: 1 });
  it('find a 12-0, a 14-2 and a 16-4, not a 12-6, and only while the side is the one scoring', () => {
    expect(currentRun([pl(1, 2), ...Array.from({ length: 6 }, () => pl(0, 2))], 0)).toMatchObject({ a: 12, b: 0 });
    expect(currentRun([pl(0, 6), pl(1, 2), pl(0, 8)], 0)).toMatchObject({ a: 14, b: 2 });
    expect(currentRun([pl(0, 8), pl(1, 4), pl(0, 8)], 0)).toMatchObject({ a: 16, b: 4 });
    expect(currentRun([pl(0, 6), pl(1, 6), pl(0, 6)], 0)).toBeNull();
    // the other side scored last: no run on
    expect(currentRun([pl(0, 12), pl(1, 2)], 0)).toBeNull();
    // a run starts with its own basket: the 2 they scored before it isn't in it
    expect(currentRun([pl(1, 2), pl(0, 10)], 0)).toMatchObject({ a: 10, b: 0 });
  });

  it('call a run in the play-by-play at 8 and over the court at 10, once each, and the timeout into it', () => {
    const logs = game([
      [1, 2],
      [0, 3],
      [1, 0],
      [0, 2],
      [1, 0],
      [0, 3],
      [1, 0],
      [0, 2],
      [1, 0],
      [0, 2],
      [1, 0],
      [0, 3],
    ]);
    // their coach calls timeout as their next possession opens
    logs.push(poss(1, [15, 2], [{ k: 'timeout', t: 1 }, miss(11)], { clockStart: 450, clockEnd: 440 }));
    const runs = allEvents(fold(logs)).filter((e) => e.kind === 'run');
    expect(runs.map((e) => [e.title, e.weight])).toEqual([
      ['Knicks on an 8-0 run', 1],
      ['Knicks on a 10-0 run', 2],
      ['Knicks on a 15-0 run', 2],
    ]);
    const to = allEvents(fold(logs)).find((e) => e.kind === 'timeout')!;
    expect(to).toMatchObject({ title: '76ers call timeout', weight: 2 });
    expect(to.line).toContain("The Knicks' 15-0 run");
    expect(to.line).toContain('The Garden is on its feet');
    // the user's own timeout is in the play-by-play only
    expect(allEvents(fold(logs, ctx({ user: 1 }))).find((e) => e.kind === 'timeout')!.weight).toBe(1);
  });
});

describe('leads, ties and clutch time', () => {
  it("count a lead change through a tie (a tie doesn't end a lead), and call a first lead", () => {
    const r = fold(
      game([
        [0, 2],
        [1, 2],
        [1, 3],
        [0, 2],
        [0, 2],
      ]),
    );
    // 2-0 home, 2-2 tied, 2-5 away (a change), 4-5, 6-5 home (a change)
    expect(r.t.ties).toBe(1);
    expect(r.t.leadChanges).toBe(2);
    const titles = allEvents(r).map((e) => e.title);
    expect(titles).toContain('76ers take the lead, 5-2');
    expect(titles).toContain('Knicks back in front, 6-5');
  });

  it('know clutch time: the last five minutes within five, overtime included', () => {
    expect(isClutch(4, 299, 5)).toBe(true);
    expect(isClutch(4, 299, -6)).toBe(false);
    expect(isClutch(4, 301, 0)).toBe(false);
    expect(isClutch(3, 100, 0)).toBe(false);
    expect(isClutch(5, 250, 3)).toBe(true);
  });

  it('call clutch time once a period, and the go-ahead late, bigger in the last 24 seconds', () => {
    const t0: Tally = { ...newTally(ctx()), score: [98, 99], leader: 1, lastLed: 1, led: [true, true], q: 4 };
    const late = (clock: number) =>
      advance(
        t0,
        poss(
          0,
          [101, 99],
          [make(1, 3, { d: 'three from the wing' })].slice(0, 1).map((s) => ({ ...s, v: 2 })),
          { q: 4, clockStart: clock + 10, clockEnd: clock },
        ),
        ctx(),
      );
    const at90 = late(90);
    expect(at90.events.find((e) => e.kind === 'clutch')?.title).toBe('Knicks by 2, 1:30 to play');
    expect(at90.events.find((e) => e.kicker === 'Go-ahead')).toMatchObject({ title: 'Brunson puts the Knicks in front', weight: 2 });
    expect(late(12).events.find((e) => e.kicker === 'Go-ahead')!.weight).toBe(3);
    // once a period: the next possession in clutch time doesn't call it again
    const again = advance(at90.t, poss(1, [101, 101], [make(11)], { q: 4, clockStart: 80, clockEnd: 70 }), ctx());
    expect(again.events.some((e) => e.kind === 'clutch')).toBe(false);
    expect(again.events.find((e) => e.kind === 'tie')).toMatchObject({ title: 'Tied at 101', weight: 2 });
  });
});

describe('big plays', () => {
  const one = (log: PossLog, t = newTally(ctx())) => advance(t, log, ctx());
  it('call a dunk through contact a poster, an alley-oop, a breakaway off a steal and a third block', () => {
    const poster = one(poss(0, [3, 0], [make(5, 2, { zone: 'rim', d: 'dunk' }), { k: 'foul', pid: 15, pid2: 5 }, { k: 'ft', pid: 5, v: 1, n: 1 }]));
    expect(poster.events.find((e) => e.kind === 'play')).toMatchObject({ kicker: 'And one', title: 'Towns dunks on Embiid', weight: 2 });
    expect(poster.voice[0]!.text).toMatch(/Embiid/);
    expect(poster.voice[0]!.tier).toBe(1);

    const oop = one(poss(0, [2, 0], [make(5, 2, { zone: 'rim', d: 'alley-oop', pid2: 1 })]));
    expect(oop.events.find((e) => e.kind === 'play')).toMatchObject({ kicker: 'Alley-oop', title: 'Brunson to Towns' });

    // a steal at the end of their possession, and the stealer finishes the break
    const stolen = one(poss(1, [0, 0], [{ k: 'steal', pid: 11, pid2: 2 }]));
    expect(stolen.voice[0]!.text).toMatch(/Bridges/);
    const brk = advance(stolen.t, poss(0, [2, 0], [{ k: 'transition', pid: 2 }, make(2, 2, { zone: 'rim', d: 'layup' })], { kind: 'transition' }), ctx());
    expect(brk.events.find((e) => e.kind === 'play')).toMatchObject({ kicker: 'Steal and score', title: 'Bridges picks it off and finishes' });

    // blocks: routine ones stay in the play-by-play, a shot-blocker's third goes up
    const blk = (t: Tally) => advance(t, poss(1, [0, 0], [miss(11), { k: 'block', pid: 5, pid2: 11 }]), ctx());
    const b1 = blk(newTally(ctx()));
    const b2 = blk(b1.t);
    const b3 = blk(b2.t);
    expect(b1.events.some((e) => e.kind === 'play')).toBe(false);
    expect(b3.events.find((e) => e.kind === 'play')).toMatchObject({ kicker: 'Rejected', line: 'His 3rd block tonight' });
    expect(b3.voice[1]!.text).toContain('3rd block tonight');
  });

  it('call a buzzer-beater and a shooter heating up', () => {
    const buzz = advance(newTally(ctx()), poss(0, [3, 0], [make(1, 3)], { q: 2, clockStart: 3, clockEnd: 0 }), ctx());
    expect(buzz.events.find((e) => e.kicker === 'At the buzzer')).toMatchObject({ title: 'Brunson beats the halftime buzzer', weight: 2 });
    expect(buzz.voice[0]!.text).toContain('at the half');
    let t = newTally(ctx());
    const heat: AtmoEvent[] = [];
    for (let i = 1; i <= 3; i++) {
      const r = advance(t, poss(0, [3 * i, 0], [make(2, 3)]), ctx());
      t = r.t;
      heat.push(...r.events.filter((e) => e.kind === 'heat'));
      if (i === 3) expect(r.voice[0]!.text).toMatch(/3/);
    }
    expect(heat).toHaveLength(1);
    expect(heat[0]).toMatchObject({ title: 'Bridges is on fire', line: '3 straight threes' });
  });

  it('size the calls: a routine basket is calm, a game-winner at the buzzer is the biggest', () => {
    const t: Tally = { ...newTally(ctx()), score: [99, 100], leader: 1, lastLed: 1 };
    const routine = voiceLog(newTally(ctx()), poss(0, [2, 0], [make(1)]), ctx())[0]!;
    expect(routine.tier).toBe(0);
    expect(routine.text.endsWith('.')).toBe(true);
    const winner = voiceLog(t, poss(0, [101, 100], [make(1)], { q: 4, clockStart: 4, clockEnd: 0 }), ctx())[0]!;
    expect(winner.tier).toBe(3);
    expect(winner.text).toMatch(/Knicks/);
    expect(winner.text.endsWith('!')).toBe(true);
  });
});

describe('the voice', () => {
  it('is the same every time for the same game and possession, and varied across possessions', () => {
    const logs = Array.from({ length: 40 }, (_, i) => poss(0, [2 * (i + 1), 0], [make(5, 2, { zone: 'rim', d: 'dunk', pid2: 1 })]));
    const a = fold(logs).voices.map((v) => v[0]!.text);
    const b = fold(logs).voices.map((v) => v[0]!.text);
    expect(a).toEqual(b);
    // many phrasings of the same play, and another game picks differently
    expect(new Set(a.map((x) => x.replace(/,? ?\(?Brunson[^.]*|that's.*|Towns has.*|\d+ tonight.*/g, ''))).size).toBeGreaterThanOrEqual(4);
    expect(fold(logs, ctx({ gid: 8 })).voices.map((v) => v[0]!.text)).not.toEqual(a);
  });

  it('says a player passing 20 and 30, and an 8-footer with its article', () => {
    let t = newTally(ctx());
    const said: string[] = [];
    for (let i = 0; i < 16; i++) {
      const r = advance(t, poss(0, [2 * (i + 1), 0], [make(1, 2, { y: 13.25, d: 'short jumper' })]), ctx());
      t = r.t;
      said.push(r.voice[0]!.text);
    }
    expect(said[9]).toMatch(/20/);
    expect(said[14]).toMatch(/30/);
    expect(said.join(' ')).not.toMatch(/\ba 8-footer/);
  });
});

describe('the crowd and the callouts', () => {
  it('rises on a home run and goes quiet on a road run, with a line now and then', () => {
    const home = fold(game(Array.from({ length: 16 }, (_, i) => [i % 2 === 0 ? 0 : 1, i % 2 === 0 ? 3 : 0] as [0 | 1, number])));
    expect(crowdLevel(home.t.crowd)).toBeGreaterThanOrEqual(3);
    expect(home.t.momentum).toBeGreaterThan(0.4);
    const away = fold(
      game(
        Array.from({ length: 30 }, (_, i) => [i % 2 === 0 ? 1 : 0, i % 2 === 0 ? 3 : 0] as [0 | 1, number]),
        2,
      ),
    );
    expect(crowdLevel(away.t.crowd)).toBeLessThanOrEqual(1);
    expect(away.t.momentum).toBeLessThan(-0.4);
    const lines = allEvents(away).filter((e) => e.kind === 'crowd');
    expect(lines.length).toBe(1);
    expect(lines[0].title).toMatch(/Madison Square Garden|The Garden|Knicks/);
    // a neutral floor's crowd never hushes
    const neutral = fold(
      game(
        Array.from({ length: 30 }, (_, i) => [i % 2 === 0 ? 1 : 0, i % 2 === 0 ? 3 : 0] as [0 | 1, number]),
        2,
      ),
      ctx({ arena: undefined }),
    );
    expect(crowdLevel(neutral.t.crowd)).toBeGreaterThanOrEqual(2);
  });

  it('put up one callout now and then, a big one whenever', () => {
    const ev = (weight: 1 | 2 | 3, at: number, o: Partial<AtmoEvent> = {}): AtmoEvent => ({
      id: `e${at}`,
      kind: 'run',
      side: 0,
      weight,
      pri: 50,
      kicker: 'Run',
      title: 'x',
      at,
      q: 2,
      clock: 400,
      ...o,
    });
    expect(pickCall([ev(1, 100)], null)).toBeNull();
    expect(pickCall([ev(2, 100)], null)?.id).toBe('e100');
    expect(pickCall([ev(2, 100 + CALL_GAP - 1)], 100)).toBeNull();
    expect(pickCall([ev(2, 100 + CALL_GAP)], 100)).not.toBeNull();
    expect(pickCall([ev(3, 101)], 100)).not.toBeNull();
    // clutch time waits less
    expect(pickCall([ev(2, 120, { q: 4, clock: 200 })], 100)).not.toBeNull();
    // the biggest of a possession's
    expect(pickCall([ev(2, 300, { id: 'a', pri: 30 }), ev(2, 300, { id: 'b', pri: 90 })], null)?.id).toBe('b');
  });

  it('tell the story so far at a break', () => {
    const logs = game([[0, 2], [1, 2], ...Array.from({ length: 16 }, (_, i) => [i % 2 === 0 ? 1 : 0, i % 2 === 0 ? 2 : i === 7 ? 2 : 0] as [0 | 1, number])], 2);
    const r = fold(logs);
    const story = breakStory(r.t, ctx(), 2, [[{ pid: 1, pts: 18 }], [{ pid: 15, pts: 12 }]]);
    expect(story).toMatch(/^(Down|Trailing by) \d+ at the half after the 76ers' \d+-\d+ second-quarter run; Brunson (has|leads you with) 18\.$/);
    // after one: no "after one after"
    const q1 = breakStory({ ...r.t, runs: { 1: r.t.runs[2] } }, ctx(), 1, [[{ pid: 1, pts: 9 }], []]);
    expect(q1).toContain('after one following');
  });
});

describe('a whole game', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
  const sim = new GameSim(
    { team: league.teams[0], players: teamPlayers(league, 0) },
    { team: league.teams[1], players: teamPlayers(league, 1) },
    { rng: new Rng(9), type: 'regular', record: true, injuries: false },
  );
  const logs: PossLog[] = [];
  while (!sim.over) {
    sim.step();
    logs.push(...sim.drainLogs());
  }
  const c = ctx({ name: (pid) => league.players[pid]?.lastName ?? '?' });

  it('folds the same night twice, and in pieces as it does whole', () => {
    const whole = foldAll(logs, c);
    expect(JSON.stringify(foldAll(logs, c))).toBe(JSON.stringify(whole));
    const half = foldAll(logs.slice(0, 90), c);
    const rest = foldAll(logs, c, half.t);
    expect(JSON.stringify(rest.t)).toBe(JSON.stringify(whole.t));
    expect(rest.voices.slice(90)).toEqual(whole.voices.slice(90));
    expect(whole.t.score).toEqual(logs[logs.length - 1].score);
  });

  it('calls a proportionate number of moments over the court', () => {
    const r = foldAll(logs, c);
    let last: number | null = null;
    let calls = 0;
    for (const evs of r.events) {
      const top = pickCall(evs, last);
      if (top) {
        last = top.at;
        calls++;
      }
    }
    expect(calls).toBeGreaterThanOrEqual(4);
    expect(calls).toBeLessThanOrEqual(30);
  });

  it("voices the sim's own play-by-play lines in place, losing none", () => {
    const r = foldAll(logs, c);
    const rows = feedRows(sim.pbp, 0, logs, 0, r.voices, r.events);
    const plain = rows.filter((x) => !x.beat);
    expect(plain).toHaveLength(sim.pbp.length);
    expect(plain.map((x) => x.key)).toEqual(sim.pbp.map((_, i) => `p${i}`));
    // every made basket is voiced: none reads as the engine's "— good"
    const makes = plain.filter((x) => x.e.kind === 'make');
    expect(makes.length).toBeGreaterThan(20);
    expect(makes.every((x) => !x.e.text.includes('— good'))).toBe(true);
    // the scores stay the sim's
    plain.forEach((x, i) => expect([x.e.hs, x.e.as]).toEqual([sim.pbp[i].hs, sim.pbp[i].as]));
  });
});
