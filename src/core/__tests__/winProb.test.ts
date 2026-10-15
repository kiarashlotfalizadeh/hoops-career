// Win probability: the model behaves (monotone in the margin, decided at the final horn, a tie goes to
// overtime at about even, the ball and the projection count), the engine keeps what the line needs
// (possession times, who had the ball), and it's calibrated against engine games: better than the
// margin alone, and what it says is about what happens.
import { describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { advanceDay, postGame } from '../league/season';
import { buildSimInput, ensureRotation, gamesOnDay, neutralSite, playGame } from '../league/games';
import { GameSim } from '../sim/engine';
import { Rng } from '../random';
import { projectGame } from '../analysis/projection';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { biggestSwings, overtimeWin, playAt, swingWords, winProb, wpSeries, wpStory, wpText, WP, type WpState } from '../analysis/winProb';
import type { GameResult } from '../types';
import type { PossLog } from '../sim/log';

const st = (over: Partial<WpState>): WpState => ({ margin: 0, q: 1, clock: 720, ball: null, edge: 0, ...over });

describe('the win-probability model', () => {
  it('rises with the margin and the projection, and is decided at the final horn', () => {
    for (const [q, clock] of [
      [1, 720],
      [2, 300],
      [3, 30],
      [4, 600],
      [4, 40],
      [4, 3],
      [5, 120],
    ]) {
      let prev = -1;
      for (let m = -30; m <= 30; m++) {
        const p = winProb(st({ margin: m, q, clock, edge: 2 }));
        // (a blowout late is 0 or 1 to the last digit)
        if (Math.abs(m) <= 5) expect(p).toBeGreaterThan(prev);
        else expect(p).toBeGreaterThanOrEqual(prev);
        prev = p;
      }
    }
    expect(winProb(st({ edge: 6 }))).toBeGreaterThan(winProb(st({ edge: 1 })));
    expect(winProb(st({ edge: 0 }))).toBeCloseTo(0.5, 6);
    // a lead is safer the less time is left
    expect(winProb(st({ margin: 6, q: 4, clock: 60 }))).toBeGreaterThan(winProb(st({ margin: 6, q: 3, clock: 720 })));
    expect(winProb(st({ margin: 1, q: 4, clock: 0 }))).toBe(1);
    expect(winProb(st({ margin: -1, q: 4, clock: 0 }))).toBe(0);
    expect(winProb(st({ margin: 2, q: 6, clock: 0 }))).toBe(1);
    // the end of the first half decides nothing
    expect(winProb(st({ margin: 12, q: 2, clock: 0 }))).toBeLessThan(1);
  });

  it('sends a tie at the horn to overtime at about even, shaded by the projection, and counts the ball', () => {
    expect(winProb(st({ q: 4, clock: 0, edge: 0 }))).toBeCloseTo(0.5, 6);
    const tie = winProb(st({ q: 4, clock: 0, edge: 5 }));
    expect(tie).toBeGreaterThan(0.5);
    expect(tie).toBeLessThan(0.6);
    expect(tie).toBe(overtimeWin(5));
    // in overtime the projection is worth only five minutes
    expect(winProb(st({ q: 5, clock: 300, edge: 5 }))).toBeLessThan(winProb(st({ q: 1, clock: 720, edge: 5 })));
    // the ball: worth most when little time is left
    const withBall = winProb(st({ q: 4, clock: 10, ball: 0 }));
    const without = winProb(st({ q: 4, clock: 10, ball: 1 }));
    expect(withBall).toBeGreaterThan(0.55);
    expect(without).toBeLessThan(0.45);
    expect(withBall - without).toBeGreaterThan(winProb(st({ q: 1, clock: 700, ball: 0 })) - winProb(st({ q: 1, clock: 700, ball: 1 })));
  });

  it('reads an older game without possession times, possession or a projection', () => {
    const flow = [2, 2, 0, -3, -3, -1, 1, 4, 4, 6];
    const g = { flow, flowPeriods: [0, 3, 5, 8], type: 'regular' } as Pick<GameResult, 'flow' | 'flowPeriods' | 'type'>;
    const s = wpSeries(g)!;
    expect(s).toHaveLength(flow.length + 1);
    for (let j = 1; j < s.length; j++) expect(s[j].t).toBeGreaterThanOrEqual(s[j - 1].t);
    expect(s[s.length - 1].wp).toBe(1);
    // the home court alone at tip-off
    expect(s[0].wp).toBeGreaterThan(0.5);
    expect(s[0].wp).toBeLessThan(0.6);
  });
});

describe('a game still being played', () => {
  it('never reads as decided, however big the lead, until the horn', () => {
    for (const [margin, clock] of [
      [30, 45],
      [25, 10],
      [-25, 10],
      [60, 0.5],
    ])
      for (const ball of [0, 1, null] as const) {
        const v = winProb(st({ q: 4, clock, margin, ball }));
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(1);
        expect(wpText(v)).toBe(margin > 0 ? '>99%' : '<1%');
      }
    expect([winProb(st({ q: 4, clock: 0, margin: 1 })), winProb(st({ q: 4, clock: 0, margin: -1 }))]).toEqual([1, 0]);
  });
});

describe('win probability from engine games', () => {
  it('keeps the possession clock and who had the ball, as the possession logs show them', () => {
    const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
    for (const seed of [4, 9, 13]) {
      const sim = new GameSim(
        { team: league.teams[2], players: teamPlayers(league, 2), adjust: true },
        { team: league.teams[3], players: teamPlayers(league, 3), adjust: true },
        { rng: new Rng(seed), type: 'regular', record: true, keepShots: true, injuries: false },
      );
      const logs: PossLog[] = [];
      while (sim.step()) logs.push(...sim.drainLogs());
      logs.push(...sim.drainLogs());
      const res = sim.result();
      const flow = res.flow!;
      expect(res.flowT).toHaveLength(flow.length);
      expect(res.flowPoss).toHaveLength(res.flowPeriods!.length);
      for (let i = 1; i < flow.length; i++) expect(res.flowT![i]).toBeGreaterThanOrEqual(res.flowT![i - 1]);
      expect(res.flowT![flow.length - 1]).toBe(2880 + 300 * res.ot);
      // one log a possession: the side flowPoss and the alternation say had it is the side that did
      expect(logs).toHaveLength(flow.length);
      res.flowPeriods!.forEach((from, p) => {
        const to = res.flowPeriods![p + 1] ?? flow.length;
        for (let i = from; i < to; i++) expect(logs[i].off).toBe((res.flowPoss![p] + (i - from)) % 2);
      });
      // and the clock it ended on
      logs.forEach((l, i) => expect(Math.abs(res.flowT![i] - (l.q <= 4 ? l.q * 720 : 2880 + (l.q - 4) * 300) + l.clockEnd)).toBeLessThanOrEqual(0.5 + 1e-9));
      // the last point is the result; the turning point is named from the play-by-play
      const s = wpSeries(res)!;
      expect(s[s.length - 1].wp).toBe(res.home.pts > res.away.pts ? 1 : 0);
      const story = wpStory(res)!;
      expect(story.turn.to).toBeGreaterThan(story.turn.from);
      // every possession's play is the side's that had the ball, never the other side's last miss
      for (const p of s) {
        const play = p.i >= 0 ? playAt(res, p) : null;
        if (play) expect(play.t).toBe(logs[p.i].off);
      }
      for (const x of biggestSwings(s, 5)) {
        const p = s[x.at];
        const play = playAt(res, p);
        if (p.margin !== s[x.at - 1].margin) {
          expect(play).not.toBeNull();
          expect(play!.hs - play!.as).toBe(p.margin);
          expect(['make', 'ft']).toContain(play!.kind);
        }
      }
    }
  });

  it('is calibrated: better than the margin alone, and about as often right as it says', () => {
    const l = testLeague('wp', 5);
    const games: (Pick<GameResult, 'flow' | 'flowPeriods' | 'flowT' | 'flowPoss' | 'edge' | 'type'> & { won: number })[] = [];
    while (games.length < 160) {
      for (const g of gamesOnDay(l, l.day)) {
        ensureRotation(l, g.home);
        ensureRotation(l, g.away);
        const rng = new Rng(l.rng);
        const sim = new GameSim(buildSimInput(l, g.home, g.day, g.type, g.away, g), buildSimInput(l, g.away, g.day, g.type, g.home, g), {
          rng,
          type: g.type,
          injuries: l.settings.injuries,
          neutral: neutralSite(g),
        });
        const edge = projectGame(l, sim, neutralSite(g)).margin;
        sim.simToEnd();
        l.rng = rng.state;
        const res = playGame(l, g, { sim });
        games.push({ flow: sim.flow, flowPeriods: sim.flowPeriods, flowT: sim.flowT, flowPoss: sim.flowPoss, edge, type: g.type, won: res.home.pts > res.away.pts ? 1 : 0 });
        postGame(l, g, res.home.pts > res.away.pts);
      }
      advanceDay(l);
    }
    const rows = (k = WP, strip = false) =>
      games.flatMap((g) =>
        wpSeries(strip ? { ...g, edge: 0, flowPoss: undefined } : g, k)!
          .slice(0, -1)
          .map((p) => ({ wp: p.wp, y: g.won })),
      );
    const brier = (r: { wp: number; y: number }[]) => r.reduce((a, x) => a + (x.wp - x.y) ** 2, 0) / r.length;
    const model = rows();
    // the margin alone: no projection, no ball, a plain random walk
    const base = rows({ sd: 13, alpha: 1, revert: 0, full: 1, ball: 0, floor: 1e-6 }, true);
    expect(brier(model)).toBeLessThan(brier(base) - 0.005);
    // reliability: in every band with enough states, what it says is within 7 points of what happened
    for (let b = 0; b < 5; b++) {
      const band = model.filter((x) => x.wp >= b / 5 && x.wp < (b + 1) / 5);
      if (band.length < 1000) continue;
      const said = band.reduce((a, x) => a + x.wp, 0) / band.length;
      const did = band.reduce((a, x) => a + x.y, 0) / band.length;
      expect(Math.abs(said - did)).toBeLessThan(0.07);
    }
  });
});

describe('swing words', () => {
  it('print a chance the way a broadcast does: never 0% or 100% while the game is on', () => {
    expect([0, 0.004, 0.012, 0.5, 0.987, 0.996, 1].map(wpText)).toEqual(['0%', '<1%', '1%', '50%', '99%', '>99%', '100%']);
  });

  it('say what a possession did to the score from one side', () => {
    expect(swingWords(-1, 2)).toBe('took a 2-point lead');
    expect(swingWords(-2, 0)).toBe('tied it');
    expect(swingWords(-6, -3)).toBe('cut it to 3');
    expect(swingWords(4, 7)).toBe('stretched the lead to 7');
    expect(swingWords(-3, -3)).toBe('got a stop down 3');
  });
});
