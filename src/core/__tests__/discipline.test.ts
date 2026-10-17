// Technical and flagrant fouls, ejections and suspensions: the engine's rates and mechanics (one
// technical free throw with the ball and the shot clock where they were, a flagrant's two shots and
// the ball, two technicals or a Flagrant 2 sending a player off for good, never leaving a team four),
// a game nobody is whistled in playing exactly as without them, the NBA's suspension lines, the
// suspended sitting their teams' games wherever availability is decided, saves and live journals.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { buildSimInput, ensureRotation, playGame } from '../league/games';
import { newSeason, simDay, startRegularSeason } from '../league/season';
import { teamPlayers } from '../league/helpers';
import { SUSPEND, applyDiscipline, disciplineTotals, flagrantSuspension, nextTechLine, techLines, techSuspension } from '../league/discipline';
import { missesAllStarGame } from '../league/awards';
import { autoRotation } from '../ai/coachAI';
import { isOut, suspensionLabel } from '../availability';
import { GameSim } from '../sim/engine';
import { DISC, temperament } from '../sim/discipline';
import type { PossLog } from '../sim/log';
import { Rng } from '../random';
import { contractExp } from '../playerGen';
import type { BoxLine, GameResult, League, ScheduledGame } from '../types';
import { migrate } from '../../state/persistence';
import { prepareLive, dropLive, type LiveGame } from '../../state/live';
import { useStore } from '../../state/store';
import { testLeague, toGameDay } from '../../state/__tests__/fixtures';

const seed = seedJson as unknown as SeedData;
const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: seed.players.length ? seed : null, rngSeed: 7 });
for (const t of league.teams) ensureRotation(league, t.tid);
// each team's side as real games build it, once (building one reads the whole league)
const sides = league.teams.map((t) => buildSimInput(league, t.tid, 1, 'regular', (t.tid + 1) % 30));
const opts = (seed: number, more: Partial<ConstructorParameters<typeof GameSim>[2]> = {}) => ({ rng: new Rng(seed), type: 'regular' as const, injuries: false, ...more });

/** The engine's internals these checks read. */
type SPx = {
  pid: number;
  full: string;
  name: string;
  on: boolean;
  out: number;
  fouls: number;
  ftPct: number;
  ej?: string;
  b: { tf: number; f1: number; f2: number; pf: number; fta: number; ftm: number };
};
type STx = { side: 0 | 1; on: SPx[]; players: SPx[]; fouls: number; foulsLast2: number; score: number; coachT: number; coachOut: boolean };
type In = { T: [STx, STx]; poss: 0 | 1; ctx: string; clock: number; q: number; pbp: { text: string }[]; techFoul(t: STx, p: SPx | null): void };
const inn = (s: GameSim) => s as unknown as In;

/** Discipline rates changed for one test (and put back after it). */
const saved = structuredClone(DISC);
afterEach(() => Object.assign(DISC, structuredClone(saved)));

const incidents = (r: GameResult) => [r.home, r.away].some((tb) => tb.coachTf || tb.players.some((b) => b.tf || b.f1 || b.f2));

describe('the engine calls technicals and flagrants', () => {
  it('at NBA-like rates: about 0.45 technicals a team game (one in twenty on a coach), 0.06 Flagrant 1s, 0.004 Flagrant 2s and 0.02 ejections', () => {
    const c = { tf: 0, ctf: 0, f1: 0, f2: 0, ej: 0, games: 0 };
    const rng = new Rng(2024);
    for (let g = 0; g < 1500; g++) {
      const h = g % 30;
      const a = (h + 1 + rng.int(0, 28)) % 30;
      const res = new GameSim(sides[h], sides[a], opts(10_000 + g)).simToEnd();
      c.games++;
      for (const tb of [res.home, res.away]) {
        c.ctf += tb.coachTf ?? 0;
        c.ej += tb.coachEj ? 1 : 0;
        for (const b of tb.players) {
          c.tf += b.tf ?? 0;
          c.f1 += b.f1 ?? 0;
          c.f2 += b.f2 ?? 0;
          c.ej += b.ej ? 1 : 0;
        }
      }
    }
    const per = (x: number) => x / (2 * c.games);
    expect(per(c.tf + c.ctf)).toBeGreaterThan(0.45 * 0.9);
    expect(per(c.tf + c.ctf)).toBeLessThan(0.45 * 1.1);
    expect(c.ctf / (c.tf + c.ctf)).toBeGreaterThan(0.025);
    expect(c.ctf / (c.tf + c.ctf)).toBeLessThan(0.09);
    expect(per(c.f1)).toBeGreaterThan(0.06 * 0.75);
    expect(per(c.f1)).toBeLessThan(0.06 * 1.25);
    // (a few dozen in 3,000 team games: the range is wide)
    expect(per(c.f2)).toBeGreaterThan(0.001);
    expect(per(c.f2)).toBeLessThan(0.009);
    expect(per(c.ej)).toBeGreaterThan(0.02 * 0.65);
    expect(per(c.ej)).toBeLessThan(0.02 * 1.35);
  }, 120_000);

  it('gives the other side one free throw for a technical, by its best shooter on the floor: the ball, the clock, the fouls stay', () => {
    const sim = new GameSim(sides[3], sides[4], opts(5, { record: true }));
    for (let i = 0; i < 30; i++) sim.step();
    const s = inn(sim);
    const [t, opp] = s.T;
    const p = t.on[0];
    const sh = opp.on.reduce((a, x) => (x.ftPct > a.ftPct ? x : a), opp.on[0]);
    const before = {
      poss: s.poss,
      ctx: s.ctx,
      clock: s.clock,
      q: s.q,
      fouls: [t.fouls, opp.fouls],
      pf: p.b.pf,
      pfouls: p.fouls,
      fta: sh.b.fta,
      ftm: sh.b.ftm,
      score: [t.score, opp.score],
    };
    s.techFoul(t, p);
    expect([s.poss, s.ctx, s.clock, s.q]).toEqual([before.poss, before.ctx, before.clock, before.q]);
    // not a team foul or one of his personal fouls
    expect([t.fouls, opp.fouls, p.b.pf, p.fouls]).toEqual([...before.fouls, before.pf, before.pfouls]);
    expect(sh.b.fta).toBe(before.fta + 1);
    expect(opp.score - before.score[1]).toBe(sh.b.ftm - before.ftm);
    expect(t.score).toBe(before.score[0]);
    expect(p.b.tf).toBe(1);
    expect(s.pbp.some((e) => e.text === `Technical foul on ${p.full} (1st).`)).toBe(true);
    // the court opens the next possession with it
    sim.step();
    const log = sim.drainLogs().at(-1)!;
    expect(log.steps[0]).toMatchObject({ k: 'tech', pid: p.pid, pid2: sh.pid, t: 1 });
    // a coach's: one free throw too, and a second sends him off while the game goes on
    s.techFoul(t, null);
    s.techFoul(t, null);
    expect([t.coachT, t.coachOut]).toEqual([2, true]);
    expect(sim.simToEnd().home).toMatchObject({ coachTf: 2, coachEj: true });
  });

  it('ejects a player for his second technical: he leaves at once, never comes back, and his team never plays four', () => {
    // tempers far hotter than the league's
    DISC.tech.dead = 0.03;
    DISC.tech.whistle = 0.06;
    let ejected = 0;
    for (let g = 0; g < 6; g++) {
      const sim = new GameSim(sides[g], sides[g + 10], opts(70 + g, { record: true }));
      const logs: PossLog[] = [];
      while (sim.step()) logs.push(...sim.drainLogs());
      logs.push(...sim.drainLogs());
      const res = sim.result();
      for (const [i, tb] of [res.home, res.away].entries()) {
        for (const b of tb.players.filter((x) => x.ej === 'tech')) {
          ejected++;
          expect(b.tf).toBe(2);
          // the possession whose log has his ejection, then none of the later ones with him on the floor
          const at = logs.findIndex((l) => l.steps.some((st) => st.k === 'eject' && st.pid === b.pid));
          expect(at).toBeGreaterThanOrEqual(0);
          expect(logs.slice(at + 1).some((l) => l.on[i].includes(b.pid))).toBe(false);
          expect(inn(sim).T[i].players.find((x) => x.pid === b.pid)!.out).toBe(3);
        }
        // nobody with two technicals plays on, and five are always on the floor
        expect(tb.players.every((b) => (b.tf ?? 0) < 2 || b.ej)).toBe(true);
        expect(logs.every((l) => new Set(l.on[i]).size === 5)).toBe(true);
      }
      expect(res.home.players.reduce((a, b) => a + b.min, 0)).toBeCloseTo(240 + 25 * res.ot, 5);
    }
    expect(ejected).toBeGreaterThan(5);
  });

  it('upgrades hard fouls to flagrants: two shots whatever became of the shot, then the ball; a personal and a team foul; a Flagrant 2 ejects', () => {
    // every hard foul a flagrant (a fifth of them Flagrant 2s), and no technicals to muddle the steps
    DISC.flagrant.rim = 1;
    DISC.flagrant.f2 = 0.15;
    DISC.tech.dead = 0;
    DISC.tech.whistle = 0;
    let flagrants = 0;
    let onMakes = 0;
    let f2 = 0;
    for (let g = 0; g < 4; g++) {
      const sim = new GameSim(sides[g + 2], sides[g + 14], opts(300 + g, { record: true }));
      const logs: PossLog[] = [];
      while (sim.step()) logs.push(...sim.drainLogs());
      logs.push(...sim.drainLogs());
      const res = sim.result();
      for (const l of logs)
        l.steps.forEach((st, i) => {
          if (st.k !== 'foul' || !st.d?.startsWith('flagrant')) return;
          flagrants++;
          if (l.steps[i - 1]?.k === 'shot' && l.steps[i - 1].made) onMakes++;
          // (a Flagrant 2's ejection comes first)
          const next = l.steps.slice(i + 1).find((x) => x.k !== 'eject');
          expect(next).toMatchObject({ k: 'ft', pid: st.pid2, n: 2 });
          // the fouled team keeps the ball: the same trip goes on (unless the period ran out)
          const after = l.steps.slice(l.steps.indexOf(next!) + 1);
          if (l.clockEnd > 0.05) expect(after[0]?.k).toBe('advance');
        });
      for (const tb of [res.home, res.away])
        for (const b of tb.players) {
          expect(b.pf).toBeGreaterThanOrEqual((b.f1 ?? 0) + (b.f2 ?? 0));
          if (b.f2) {
            f2++;
            expect(b.ej).toBeDefined();
          }
        }
      // the books still balance: every possession once, five on the floor, 48 minutes a man
      for (const tb of [res.home, res.away]) {
        expect(Object.values(tb.playTypes).reduce((a, x) => a + x.poss, 0)).toBe(tb.poss);
        expect(tb.players.reduce((a, p) => a + p.pts, 0)).toBe(tb.pts);
        expect(tb.t.fgm * 2 + tb.t.tpm + tb.t.ftm).toBe(tb.pts);
      }
    }
    expect(flagrants).toBeGreaterThan(20);
    expect(onMakes).toBeGreaterThan(0);
    expect(f2).toBeGreaterThan(0);
  });

  it('plays a game nobody is whistled in exactly as the engine without technicals and flagrants does', () => {
    let quiet = 0;
    let loud = 0;
    for (let g = 0; g < 30; g++) {
      const [h, a] = [sides[g % 30], sides[(g + 7) % 30]];
      const on = new GameSim(h, a, opts(500 + g, { record: true, injuries: true })).simToEnd();
      const off = new GameSim(h, a, opts(500 + g, { record: true, injuries: true, discipline: false })).simToEnd();
      if (incidents(on)) {
        loud++;
        continue;
      }
      quiet++;
      expect(JSON.stringify(on)).toBe(JSON.stringify(off));
    }
    expect(quiet).toBeGreaterThan(5);
    expect(loud).toBeGreaterThan(5);
  });

  it('calls none in an All-Star Game', () => {
    DISC.tech.dead = 0.05;
    DISC.flagrant.rim = 1;
    for (let g = 0; g < 3; g++) {
      const res = new GameSim(sides[g], sides[g + 1], opts(40 + g, { type: 'allstar', neutral: true })).simToEnd();
      expect(incidents(res)).toBe(false);
      expect([res.home, res.away].some((tb) => tb.players.some((b) => b.ej))).toBe(false);
    }
  });

  it("keeps every player's temperament the same game to game, most of them calm and a few hotheads", () => {
    const ps = Object.values(league.players).filter((p) => p.tid >= 0);
    const t = ps.map(temperament).sort((a, b) => a - b);
    expect(ps.map(temperament)).toEqual(ps.map(temperament));
    expect(t[Math.floor(t.length / 2)]).toBeLessThan(0.15);
    expect(t[Math.floor(t.length * 0.97)]).toBeGreaterThan(0.5);
    expect(t.every((x) => x >= 0 && x <= 1)).toBe(true);
  });
});

describe('suspensions', () => {
  it('follow the NBA lines: the 16th technical and every second one after it, the 7th in the playoffs; 4 flagrant points (3), then a game a point', () => {
    expect(techSuspension(14, 15, false)).toBe(0);
    expect(techSuspension(15, 16, false)).toBe(1);
    expect(techSuspension(16, 17, false)).toBe(0);
    expect(techSuspension(17, 18, false)).toBe(1);
    expect(techSuspension(15, 18, false)).toBe(2);
    expect(techSuspension(19, 20, false)).toBe(1);
    expect(techLines(19, 21, false)).toEqual([20]);
    expect(techLines(14, 18, false)).toEqual([16, 18]);
    expect(techSuspension(5, 6, true)).toBe(0);
    expect(techSuspension(6, 7, true)).toBe(1);
    expect(techSuspension(7, 8, true)).toBe(0);
    expect(techSuspension(8, 9, true)).toBe(1);
    expect([nextTechLine(9, false), nextTechLine(16, false), nextTechLine(17, false), nextTechLine(3, true), nextTechLine(7, true)]).toEqual([16, 18, 18, 7, 9]);
    // regular season: reaching four points, then each Flagrant 1 one game and each Flagrant 2 two
    expect(flagrantSuspension(2, 1, false)).toBe(0);
    expect(flagrantSuspension(3, 1, false)).toBe(1);
    expect(flagrantSuspension(2, 2, false)).toBe(1);
    expect(flagrantSuspension(3, 2, false)).toBe(1);
    expect(flagrantSuspension(4, 1, false)).toBe(1);
    expect(flagrantSuspension(4, 2, false)).toBe(2);
    expect(flagrantSuspension(1, 2, false)).toBe(0);
    // the playoffs: three points
    expect(flagrantSuspension(2, 1, true)).toBe(1);
    expect(flagrantSuspension(1, 2, true)).toBe(1);
    expect(flagrantSuspension(3, 2, true)).toBe(2);
    expect(SUSPEND.review).toBeCloseTo(1 / 3);
  });

  /** A game result with one line on each side (the others as they're stored). */
  function result(l: League, g: ScheduledGame, lines: Partial<BoxLine>[]): GameResult {
    const line = (pid: number, x: Partial<BoxLine>): BoxLine => ({
      pid,
      name: '',
      pos: 'PG',
      gs: false,
      min: 20,
      fgm: 0,
      fga: 0,
      tpm: 0,
      tpa: 0,
      ftm: 0,
      fta: 0,
      orb: 0,
      drb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      tov: 0,
      pf: 0,
      pts: 0,
      pm: 0,
      energy: 1,
      ...x,
    });
    const box = (tid: number) => ({
      tid,
      pts: 100,
      quarters: [25, 25, 25, 25],
      players: lines.filter((x) => l.players[x.pid!].tid === tid).map((x) => line(x.pid!, x)),
      t: {},
      poss: 100,
      timeoutsLeft: 0,
      playTypes: {},
      extra: {},
    });
    return { gid: g.gid, season: l.season, day: g.day, type: g.type, home: box(g.home), away: box(g.away), ot: 0 } as unknown as GameResult;
  }

  it('suspend a player as his counts cross a line, in the news and (for yours) the inbox, and count the postseason from scratch', () => {
    const l = testLeague('susp');
    const g: ScheduledGame = { gid: 99_001, day: l.day, home: l.userTid, away: (l.userTid + 1) % 30, type: 'regular' };
    const p = teamPlayers(l, l.userTid)[0];
    const s =
      p.stats.find((x) => x.season === l.season && !x.playoffs && !x.real) ??
      (p.stats.push({ ...structuredClone(p.stats[0]), season: l.season, tid: l.userTid, playoffs: false, real: undefined }), p.stats.at(-1)!);
    s.tf = 15;
    applyDiscipline(l, g, result(l, g, [{ pid: p.pid, tf: 1 }]));
    expect(p.suspension).toEqual({ games: 1, why: '16th technical foul' });
    expect(disciplineTotals(p, l.season, false).tf).toBe(16);
    expect(l.news.at(-1)!.text).toBe(`${p.firstName} ${p.lastName} (${l.teams[l.userTid].abbrev}) has been suspended one game for his 16th technical foul of the season.`);
    expect(l.news.at(-1)!.kind).toBe('discipline');
    expect(l.inbox[0].subject).toBe(`${p.firstName} ${p.lastName} suspended one game`);
    // the 17th costs nothing, the 18th another game (on top of the one he hasn't served)
    applyDiscipline(l, { ...g, gid: 99_002 }, result(l, g, [{ pid: p.pid, tf: 1 }]));
    expect(p.suspension!.games).toBe(1);
    applyDiscipline(l, { ...g, gid: 99_003 }, result(l, g, [{ pid: p.pid, tf: 1 }]));
    expect(p.suspension!.games).toBe(2);
    // a game sat out counts toward it
    applyDiscipline(l, { ...g, gid: 99_004 }, result(l, g, [{ pid: p.pid, min: 0, dnp: 'Suspended' }]));
    expect(p.suspension!.games).toBe(1);
    // the playoffs count from scratch: six technicals cost nothing, the 7th a game
    const po: ScheduledGame = { ...g, gid: 99_010, type: 'playoffs' };
    for (let i = 0; i < 6; i++) applyDiscipline(l, { ...po, gid: 99_010 + i }, result(l, po, [{ pid: p.pid, tf: 1 }]));
    expect(p.suspension!.games).toBe(1);
    applyDiscipline(l, { ...po, gid: 99_020 }, result(l, po, [{ pid: p.pid, tf: 1 }]));
    expect(p.suspension!.games).toBe(2);
    expect(disciplineTotals(p, l.season, true).tf).toBe(7);
    expect(disciplineTotals(p, l.season, false).tf).toBe(18);
    // flagrant points: three, then a Flagrant 1 reaches four (one game), and a Flagrant 2 past it costs two (more with the review)
    const q = teamPlayers(l, (l.userTid + 1) % 30)[0];
    for (let i = 0; i < 3; i++) applyDiscipline(l, { ...g, gid: 99_100 + i }, result(l, g, [{ pid: q.pid, f1: 1 }]));
    expect(q.suspension).toBeUndefined();
    expect(disciplineTotals(q, l.season, false).fp).toBe(3);
    applyDiscipline(l, { ...g, gid: 99_103 }, result(l, g, [{ pid: q.pid, f1: 1 }]));
    expect(q.suspension?.games).toBe(1);
    applyDiscipline(l, { ...g, gid: 99_104 }, result(l, g, [{ pid: q.pid, f2: 1, ej: 'flagrant' }]));
    expect([3, 4]).toContain(q.suspension!.games);
    expect(disciplineTotals(q, l.season, false).fp).toBe(6);
    expect(l.news.at(-1)!.text).toMatch(/has been suspended (two|three) games after his Flagrant 2 against /);
  });

  it('review a Flagrant 2 into an extra game about a third of the time, the same way every time for the same foul', () => {
    const l = testLeague('review');
    const g: ScheduledGame = { gid: 1, day: l.day, home: 3, away: 4, type: 'regular' };
    const ps = teamPlayers(l, 3);
    // (the same fouls in a copy of the league: the same verdicts)
    const again = structuredClone(l);
    let extra = 0;
    let n = 0;
    for (let k = 0; k < 120; k++) {
      const game = { ...g, gid: 50_000 + k };
      const verdict = (x: League) => {
        const p = x.players[ps[k % ps.length].pid];
        delete p.suspension;
        for (const s of p.stats) delete s.fp;
        applyDiscipline(x, game, result(x, game, [{ pid: p.pid, f2: 1 }]));
        return !!p.suspension;
      };
      const v = verdict(l);
      expect(verdict(again)).toBe(v);
      n++;
      if (v) extra++;
    }
    expect(extra / n).toBeGreaterThan(0.2);
    expect(extra / n).toBeLessThan(0.47);
  });

  it('sit a suspended player for his team’s next games, simulated or played live, in any phase, everywhere availability is decided', () => {
    const l = testLeague('sit');
    const team = l.teams[l.userTid];
    expect(team.rotation.manual).toBeFalsy();
    const star = team.rotation.order.map((pid) => l.players[pid]).find((p) => !p.injury)!;
    star.suspension = { games: 2, why: 'test' };
    expect(isOut(star)).toBe(true);
    expect(suspensionLabel(star)).toBe('Suspended (2 games)');
    // the assistant plans around him, and every game type but the All-Star Game holds him out
    ensureRotation(l, l.userTid);
    expect(l.teams[l.userTid].rotation.minutes[star.pid] ?? 0).toBe(0);
    expect(autoRotation(teamPlayers(l, l.userTid)).minutes[star.pid] ?? 0).toBe(0);
    for (const type of ['regular', 'playin', 'playoffs'] as const) expect(buildSimInput(l, l.userTid, l.day, type).suspended).toEqual([star.pid]);
    expect(buildSimInput(l, l.userTid, l.day, 'allstar').suspended).toBeUndefined();
    // two of his team's games sat out, simulated
    const sat: number[] = [];
    for (let d = 0; d < 12 && star.suspension; d++) {
      const before = l.games.length;
      simDay(l);
      for (const r of l.games.slice(before)) {
        const line = [r.home, r.away].flatMap((tb) => tb.players).find((b) => b.pid === star.pid);
        if (!line) continue;
        expect(line).toMatchObject({ min: 0, dnp: 'Suspended' });
        sat.push(r.gid);
      }
    }
    expect(sat.length).toBe(2);
    expect(star.suspension).toBeUndefined();
    // and a postseason game sits him too (the same rule in every phase): one live, one simulated
    star.suspension = { games: 2, why: 'test' };
    toGameDay(l);
    useStore.getState().setLeague(l);
    let lg: LiveGame | null = null;
    useStore.getState().mutate((x) => void (lg = prepareLive(x)));
    const live = lg as unknown as LiveGame;
    expect(live.sim.T[live.userSide].players.find((p) => p.pid === star.pid)).toMatchObject({ out: 2, dnp: 'Suspended' });
    const res = live.commit(l);
    expect((live.userSide === 0 ? res.home : res.away).players.find((b) => b.pid === star.pid)).toMatchObject({ min: 0, dnp: 'Suspended' });
    expect(star.suspension?.games).toBe(1);
    dropLive();
    const opp = (l.userTid + 1) % 30;
    const po: ScheduledGame = { gid: 999_999, day: l.day, home: l.userTid, away: opp, type: 'playoffs', seriesId: 'test' };
    const pr = playGame(l, po);
    expect(pr.home.players.find((b) => b.pid === star.pid)).toMatchObject({ min: 0, dnp: 'Suspended' });
    expect(star.suspension).toBeUndefined();
    // a long suspension keeps an All-Star out of the game, as a long injury does
    expect(missesAllStarGame({ ...star, suspension: { games: 3, why: 'x' } })).toBe(true);
    expect(missesAllStarGame({ ...star, suspension: { games: 1, why: 'x' } })).toBe(false);
  });

  it('carry a suspension from the regular season into the postseason and over the summer into the next season', () => {
    const l = testLeague('carry');
    const me = l.userTid;
    // a young regular signed beyond next season (so the summer doesn't move him)
    const p = teamPlayers(l, me).find((x) => !x.injury && contractExp(x.contract) > l.season + 1 && x.experience < 8)!;
    p.suspension = { games: 3, why: '16th technical foul' };
    const sat = (r: GameResult) => (r.home.tid === me ? r.home : r.away).players.find((b) => b.pid === p.pid);
    // one in the regular season...
    for (let d = 0; d < 10 && p.suspension.games === 3; d++) simDay(l);
    expect(p.suspension).toEqual({ games: 2, why: '16th technical foul' });
    expect(sat(l.games.filter((g) => g.home.tid === me || g.away.tid === me).at(-1)!)).toMatchObject({ min: 0, dnp: 'Suspended' });
    // ...one in the playoffs...
    const po = playGame(l, { gid: 999_998, day: l.day, home: me, away: (me + 1) % 30, type: 'playoffs', seriesId: 'test' });
    expect(sat(po)).toMatchObject({ min: 0, dnp: 'Suspended' });
    expect(p.suspension.games).toBe(1);
    // ...and the last one on the next opening night: the summer heals injuries, not suspensions
    l.phase = 'freeAgency';
    l.faDay = 30;
    expect(newSeason(l)).toBe(true);
    expect(p.tid).toBe(me);
    expect(p.suspension).toEqual({ games: 1, why: '16th technical foul' });
    expect(isOut(p)).toBe(true);
    expect(startRegularSeason(l)).toEqual([]);
    expect(l.teams[me].rotation.minutes[p.pid] ?? 0).toBe(0);
    const before = l.games.length;
    for (let d = 0; d < 10 && p.suspension; d++) simDay(l);
    const mine = l.games.slice(before).filter((g) => g.home.tid === me || g.away.tid === me);
    expect(mine.length).toBe(1);
    expect(mine[0].season).toBe(l.season);
    expect(sat(mine[0])).toMatchObject({ min: 0, dnp: 'Suspended' });
    expect(p.suspension).toBeUndefined();
    // and he's back for the next one
    const served = l.games.length;
    for (let d = 0; d < 10 && !l.games.slice(served).some((g) => g.home.tid === me || g.away.tid === me); d++) simDay(l);
    expect(sat(l.games.slice(served).find((g) => g.home.tid === me || g.away.tid === me)!)?.dnp).not.toBe('Suspended');
  });
});

describe('saves', () => {
  it('keep suspensions, counts and box-score marks in shape, and drop damaged ones', () => {
    const l = testLeague('save');
    simDay(l);
    const [a, b, c] = teamPlayers(l, 5);
    a.suspension = { games: 2, why: '16th technical foul' };
    (b as { suspension?: unknown }).suspension = { games: 'two', why: 'x' };
    (c as { suspension?: unknown }).suspension = { games: 0, why: 'x' };
    const s = a.stats.at(-1)!;
    s.tf = 3;
    s.fp = 1;
    const t = b.stats.at(-1)!;
    (t as { tf?: unknown }).tf = -1;
    (t as { fp?: unknown }).fp = 1.5;
    const g = l.games[0];
    const [x, y] = g.home.players;
    Object.assign(x, { tf: 1, f1: 1, ej: 'tech' });
    Object.assign(y, { tf: 0, f2: 'x', ej: 'mad' });
    Object.assign(g.home, { coachTf: 2, coachEj: true });
    Object.assign(g.away, { coachTf: 'x', coachEj: 1 });
    const m = migrate(structuredClone(l));
    expect(m.players[a.pid].suspension).toEqual({ games: 2, why: '16th technical foul' });
    expect(m.players[b.pid].suspension).toBeUndefined();
    expect(m.players[c.pid].suspension).toBeUndefined();
    expect(m.players[a.pid].stats.at(-1)).toMatchObject({ tf: 3, fp: 1 });
    expect(m.players[b.pid].stats.at(-1)!.tf).toBeUndefined();
    expect(m.players[b.pid].stats.at(-1)!.fp).toBeUndefined();
    const mg = m.games[0];
    expect(mg.home.players[0]).toMatchObject({ tf: 1, f1: 1, ej: 'tech' });
    expect([mg.home.players[1].tf, mg.home.players[1].f2, mg.home.players[1].ej]).toEqual([undefined, undefined, undefined]);
    expect([mg.home.coachTf, mg.home.coachEj, mg.away.coachTf, mg.away.coachEj]).toEqual([2, true, undefined, undefined]);
  });

  it('play a live game with an ejection back from its journal to the same score', () => {
    // hot tempers, so somebody is ejected early
    DISC.tech.dead = 0.03;
    DISC.tech.whistle = 0.06;
    const l = testLeague('eject-journal');
    toGameDay(l);
    useStore.getState().setLeague(l);
    let lg: LiveGame | null = null;
    useStore.getState().mutate((x) => void (lg = prepareLive(x)));
    const live = lg as unknown as LiveGame;
    const ejected = () => live.sim.T.some((t) => t.players.some((p) => p.out === 3));
    for (let i = 0; i < 400 && !ejected(); i++) live.step();
    expect(ejected()).toBe(true);
    // a coaching move after it, and a few more possessions
    const mine = live.sim.T[live.userSide];
    const bench = mine.players.find((p) => !p.on && p.out === 0)!;
    live.substitute(mine.on[0].pid, bench.pid);
    for (let i = 0; i < 6; i++) live.step();
    live.checkpoint();
    const back = structuredClone(l);
    useStore.getState().setLeague(back);
    const again = prepareLive(back)!;
    expect(again.resumed).toBe('journal');
    expect([again.sim.q, again.sim.clock, again.sim.T[0].score, again.sim.T[1].score]).toEqual([live.sim.q, live.sim.clock, live.sim.T[0].score, live.sim.T[1].score]);
    expect(again.sim.result()).toEqual(live.sim.result());
    expect(again.sim.T.map((t) => t.players.filter((p) => p.out === 3).map((p) => p.pid))).toEqual(live.sim.T.map((t) => t.players.filter((p) => p.out === 3).map((p) => p.pid)));
    dropLive();
  });
});
