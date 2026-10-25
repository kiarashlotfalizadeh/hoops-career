// The game engine: books that add up under any conditions, NBA-like rates and endings, and the rule
// bookkeeping (fouls, free throws, caps, timeouts, late-game modes, play-by-play).
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { GameSim, K, engineDiag, resetEngineDiag, type SimTeamInput } from '../sim/engine';
import { FINISH_LABEL } from '../sim/log';
import { applyPatch, type TacticsPatch } from '../ai/lab';
import { dpoyScore } from '../league/awards';
import { blankStats, generatePlayer, DEFAULT_SCALE } from '../playerGen';
import { gameTime } from '../format';
import { Rng } from '../random';
import { GAME } from '../constants';
import type { Team } from '../types';

describe('game engine', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 11 });
  const side = (tid: number) => ({ team: league.teams[tid], players: teamPlayers(league, tid) });

  it('keeps the books straight in every game and plays NBA-like rates, rotations and endings', () => {
    // internally consistent box scores
    {
      const sim = new GameSim(side(0), side(1), { rng: new Rng(3), type: 'regular', record: true });
      const res = sim.simToEnd();
      expect(res.home.pts).not.toBe(res.away.pts);
      for (const tb of [res.home, res.away]) {
        expect(tb.players.reduce((a, p) => a + p.pts, 0)).toBe(tb.pts);
        expect(tb.t.fgm * 2 + tb.t.tpm + tb.t.ftm).toBe(tb.pts);
        expect(tb.t.fgm).toBeLessThanOrEqual(tb.t.fga);
        expect(Math.round(tb.players.reduce((a, p) => a + p.min, 0) * 10)).toBe(10 * 5 * (48 + 5 * res.ot));
        expect(tb.players.reduce((a, p) => a + p.pm, 0)).toBe((tb.pts - (tb === res.home ? res.away.pts : res.home.pts)) * 5);
      }
      expect(res.pbp!.length).toBeGreaterThan(200);
    }
    // the books stay straight with short benches, injuries, foul-outs, hacks and presses
    {
      const rng = new Rng(77);
      for (let g = 0; g < 24; g++) {
        const make = (tid: number) => {
          const team = structuredClone(league.teams[tid]);
          const players = structuredClone(teamPlayers(league, tid));
          // six to nine healthy players, a physical defense, hacking and pressing now and then
          const healthy = new Set(rng.shuffle(team.rotation.order.slice()).slice(0, rng.int(6, 9)));
          for (const p of players) p.injury = healthy.has(p.pid) ? null : { type: 'Sprained ankle', gamesRemaining: 2, gamesTotal: 2, severity: 'minor' };
          team.tactics.defense.physicality = rng.int(50, 100);
          team.tactics.defense.press = rng.pick(['none', 'afterMade', 'always'] as const);
          team.tactics.manage.hackThreshold = rng.chance(0.3) ? 65 : 0;
          return { team, players, injuryMult: 20 };
        };
        const sim = new GameSim(make(g % 30), make((g + 9) % 30), { rng: new Rng(g), type: g % 3 ? 'regular' : 'playoffs', keepShots: true });
        const res = sim.simToEnd();
        expect(res.home.pts).not.toBe(res.away.pts);
        for (const [i, tb] of [res.home, res.away].entries()) {
          const opp = i ? res.home : res.away;
          const t = sim.T[i];
          for (const k of ['fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pts'] as const)
            expect(tb.players.reduce((a, p) => a + p[k], 0)).toBe(tb.t[k]);
          for (const p of tb.players) expect(2 * p.fgm + p.tpm + p.ftm).toBe(p.pts);
          expect(tb.t.pts).toBe(tb.pts);
          expect(tb.quarters.reduce((a, b) => a + b, 0)).toBe(tb.pts);
          expect(Math.round(tb.players.reduce((a, p) => a + p.min, 0) * 10)).toBe(10 * 5 * (48 + 5 * res.ot));
          expect(tb.players.reduce((a, p) => a + p.pm, 0)).toBe(5 * (tb.pts - opp.pts));
          expect(tb.players.filter((p) => p.gs).length).toBe(5);
          // assists only on makes, blocks and boards only off misses, steals only on turnovers
          expect(tb.t.ast).toBeLessThanOrEqual(tb.t.fgm);
          expect(tb.t.blk).toBeLessThanOrEqual(opp.t.fga - opp.t.fgm);
          expect(tb.t.stl).toBeLessThanOrEqual(opp.t.tov);
          expect(tb.t.orb + opp.t.drb).toBeLessThanOrEqual(tb.t.fga - tb.t.fgm + tb.t.fta - tb.t.ftm);
          // every possession ends once, in one play type and one lineup
          expect(Object.values(tb.playTypes).reduce((a, x) => a + x.poss, 0)).toBe(tb.poss);
          const lineups = [...sim.lineups.values()].filter((l) => l.t === i);
          expect(lineups.reduce((a, l) => a + l.poss, 0)).toBe(tb.poss);
          expect(lineups.reduce((a, l) => a + l.ptsFor, 0)).toBe(tb.pts);
          expect(res.shots!.filter((s) => s.t === i).length).toBe(tb.t.fga);
          // nobody sits out disqualified or hurt while a healthy teammate could take his place
          for (const p of t.players) if (p.fouls >= GAME.foulOut) expect(p.out).not.toBe(0);
          if (t.players.filter((p) => p.out === 0).length >= 5) expect(t.on.every((p) => p.out === 0)).toBe(true);
        }
        expect(res.flow!.length).toBe(res.home.poss + res.away.poss);
      }
    }
    // near NBA league averages
    {
      const rng = new Rng(5);
      let pts = 0;
      let poss = 0;
      let tpa = 0;
      let fga = 0;
      const n = 120;
      for (let g = 0; g < n; g++) {
        const h = g % 30;
        const a = (h + 1 + (g % 29)) % 30;
        const res = new GameSim(side(h), side(a === h ? (h + 1) % 30 : a), { rng, type: 'regular' }).simToEnd();
        for (const tb of [res.home, res.away]) {
          pts += tb.pts;
          poss += tb.poss;
          tpa += tb.t.tpa;
          fga += tb.t.fga;
        }
      }
      const ortg = (pts / poss) * 100;
      expect(poss / (2 * n)).toBeGreaterThan(94);
      expect(poss / (2 * n)).toBeLessThan(106);
      expect(ortg).toBeGreaterThan(106);
      expect(ortg).toBeLessThan(122);
      expect(tpa / fga).toBeGreaterThan(0.33);
      expect(tpa / fga).toBeLessThan(0.5);
    }
    // it responds to tactics: packing the paint gives up more threes
    {
      const base = league.teams[1];
      const packed = { ...base, tactics: { ...base.tactics, defense: { ...base.tactics.defense, help: 95, scheme: 'man' as const } } };
      const home = { ...base, tactics: { ...base.tactics, defense: { ...base.tactics.defense, help: 5, scheme: 'man' as const } } };
      let open = 0;
      let packedImp = 0;
      for (let g = 0; g < 40; g++) {
        const r1 = new GameSim(side(0), { team: home, players: teamPlayers(league, 1) }, { rng: new Rng(100 + g), type: 'regular' }).simToEnd();
        const r2 = new GameSim(side(0), { team: packed, players: teamPlayers(league, 1) }, { rng: new Rng(100 + g), type: 'regular' }).simToEnd();
        open += r1.home.t.tpa;
        packedImp += r2.home.t.tpa;
      }
      expect(packedImp).toBeGreaterThan(open);
    }
    // assists at NBA rates (most threes assisted, about two thirds at the rim), and rim contests spread:
    // no team gets nearly all its blocks from one anchor
    {
      const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 21 });
      const side = (tid: number) => ({ team: league.teams[tid], players: teamPlayers(league, tid) });
      const blk = new Map<number, Map<number, number>>();
      let ast = 0;
      let teamGames = 0;
      resetEngineDiag();
      const rng = new Rng(9);
      // (eight games a team: at six, one team's handful of blocks could fall to one player by chance)
      for (let g = 0; g < 120; g++) {
        const h = g % 30;
        const a = (h + 7) % 30;
        const sim = new GameSim(side(h), side(a), { rng, type: 'regular' });
        const res = sim.simToEnd();
        for (const tb of [res.home, res.away]) {
          ast += tb.t.ast;
          teamGames++;
          const m = blk.get(tb.tid) ?? new Map<number, number>();
          for (const pl of tb.players) m.set(pl.pid, (m.get(pl.pid) ?? 0) + pl.blk);
          blk.set(tb.tid, m);
        }
      }
      const share = (z: 'rim' | 'paint' | 'mid' | 'three') => engineDiag.ast[z] / engineDiag.made[z];
      expect(share('three')).toBeGreaterThan(0.72);
      expect(share('rim')).toBeGreaterThan(0.55);
      expect(share('rim')).toBeLessThan(0.78);
      expect(share('mid')).toBeGreaterThan(0.25);
      expect(ast / teamGames).toBeGreaterThan(23);
      expect(ast / teamGames).toBeLessThan(30);
      const shares = [...blk.values()].map((m) => {
        const vals = [...m.values()];
        const tot = vals.reduce((a, b) => a + b, 0);
        return tot ? Math.max(...vals) / tot : 0;
      });
      const avg = shares.reduce((a, b) => a + b, 0) / shares.length;
      expect(avg).toBeLessThan(0.55);
      expect(Math.max(...shares)).toBeLessThan(0.8);
    }
    // the DPOY score caps event stats and weighs team defense, and favors a starter over a backup with the
    // same per-game events
    {
      const rng = new Rng(4);
      const mk = (pid: number, tid: number, o: { stl: number; blk: number; mpg: number; onPA?: number }) => {
        const p = generatePlayer(rng, { pid, season: 2027, tid, age: 27, talent: 0.8, scale: DEFAULT_SCALE });
        const s = blankStats(2027, tid, false);
        s.gp = 75;
        s.min = o.mpg * 75;
        s.stl = o.stl * 75;
        s.blk = o.blk * 75;
        s.drb = 6 * 75;
        s.onPoss = 2000;
        s.onPtsAgainst = (o.onPA ?? 110) * 20;
        return { p, s, gp: 75, mpg: o.mpg, gmsc: 12, winPct: 0.55, pmPerGame: 0 };
      };
      const ctx = {
        lgDRtg: 114,
        teamDRtg: new Map([
          [1, 108],
          [2, 118],
        ]),
      };
      const anchor = mk(1, 1, { stl: 0.9, blk: 2.4, mpg: 32, onPA: 106 });
      const gambler = mk(2, 2, { stl: 3.2, blk: 3.2, mpg: 32, onPA: 120 });
      // same ratings for both, so only production and team context differ
      gambler.p.ratings = { ...anchor.p.ratings };
      expect(dpoyScore(anchor, ctx)).toBeGreaterThan(dpoyScore(gambler, ctx));
      const starter = mk(3, 1, { stl: 1, blk: 2, mpg: 33 });
      const backup = mk(4, 1, { stl: 1, blk: 2, mpg: 20 });
      backup.p.ratings = { ...starter.p.ratings };
      expect(dpoyScore(starter, ctx)).toBeGreaterThan(dpoyScore(backup, ctx));
    }
    // garbage time: the deep bench stays on once a blowout is decided, starters don't come back with seconds left
    {
      const league = createLeague({ name: 'g', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 4 });
      const side = (tid: number) => ({ team: league.teams[tid], players: teamPlayers(league, tid) });
      const rng = new Rng(11);
      let lateReturns = 0;
      for (let g = 0; g < 200; g++) {
        const h = g % 30;
        const a = (h + 11) % 30;
        const sim = new GameSim(side(h), side(a), { rng, type: 'regular', record: true });
        sim.simToEnd();
        const starters = [h, a].flatMap((tid) => league.teams[tid].rotation.order.slice(0, 5).map((pid) => league.players[pid].lastName));
        // a starter subbed back in during the last 30 seconds of a game decided by 12+
        if (sim.pbp.some((e) => e.kind === 'sub' && e.q >= 4 && e.clock < 30 && Math.abs(e.hs - e.as) >= 12 && starters.some((n) => e.text.includes(`${n} in for`)))) lateReturns++;
      }
      expect(lateReturns).toBeLessThanOrEqual(4);
    }
    // the end of close games: a team holding for the last shot gets it up with time to spare, and the horn
    // decides a game about as often as in the NBA (a game-winner at the buzzer in about one game in a
    // hundred), instead of nearly every late winner coming with no time left
    {
      const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 23 });
      const side = (tid: number): SimTeamInput => ({ team: league.teams[tid], players: teamPlayers(league, tid), adjust: true });
      let late = 0;
      let horn = 0;
      const games = 1500;
      for (let g = 0; g < games; g++) {
        const a = g % 30;
        const b = (a + 1 + (g % 29)) % 30;
        const res = new GameSim(side(a), side(b), { rng: new Rng(4000 + g), type: 'regular', injuries: false }).simToEnd();
        const { flow, flowT } = res;
        if (!flow?.length || flowT?.length !== flow.length) continue;
        // the basket that put the winner ahead for good, and the seconds left when it fell (the flow's
        // clock is whole seconds: 0 is the last half second)
        const winner = res.home.pts > res.away.pts ? 1 : -1;
        let at = -1;
        let prev = 0;
        for (let i = 0; i < flow.length; i++) {
          const lead = winner * flow[i];
          if (lead > 0 && prev <= 0) at = i;
          prev = lead;
        }
        if (at < 0) continue;
        const left = 2880 + 300 * res.ot - flowT[at];
        if (left > 24) continue;
        late++;
        if (left < 1) horn++;
      }
      // games decided in the last 24 seconds: seven or eight in a hundred
      expect(late / games).toBeGreaterThan(0.04);
      expect(late / games).toBeLessThan(0.12);
      // and at the horn: about a quarter of the late ones, two games in a hundred (the NBA's about one
      // in a hundred; when every last shot waited for the horn it was nearly four in ten of them)
      expect(horn / late).toBeLessThan(0.33);
      expect(horn / games).toBeLessThan(0.03);
    }
  }, 300_000);
});

// The engine's rule bookkeeping: fouls, free throws, caps, late-game modes, play-by-play.
describe('engine rules', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
  const side = (tid: number, patch?: TacticsPatch, team?: Partial<Team>): SimTeamInput => ({
    team: { ...league.teams[tid], ...team, tactics: applyPatch(league.teams[tid].tactics, patch) },
    players: teamPlayers(league, tid),
  });
  // private engine internals, for rule-level checks
  type Internals = {
    T: { fouls: number; foulsLast2: number; on: { out: number; pid: number }[]; players: { out: number; pid: number; fouls: number; on: boolean }[] }[];
    q: number;
    clock: number;
    bonus(t: unknown): boolean;
    chargeFoul(t: unknown, p: unknown): void;
    lateMode(off: unknown, def: unknown): { hurry: boolean };
  };

  it('runs the clock, the fouls, the substitutions and the timeouts by the rules', () => {
    // hard minute caps hold, crunch time included
    {
      const team = league.teams[2];
      const star = team.rotation.order[0];
      let over = 0;
      let total = 0;
      for (let g = 0; g < 20; g++) {
        const res = new GameSim(side(2, undefined, { rotation: { ...team.rotation, caps: { [star]: 20 } } }), side(3), {
          rng: new Rng(40 + g),
          type: 'regular',
          injuries: false,
        }).simToEnd();
        const min = res.home.players.find((p) => p.pid === star)!.min;
        total += min;
        if (min > 21) over++;
      }
      expect(over).toBe(0);
      expect(total / 20).toBeGreaterThan(17);
    }
    // the shot clock runs from the inbound: breaking a full-court press uses some of it
    {
      let trips = 0;
      let over = 0;
      // (five games: with the press's edges at full tactical leverage, more presses are broken into
      // run-outs, which don't count here)
      for (let g = 0; g < 5; g++) {
        const sim = new GameSim(side(4, { defense: { press: 'always' } }), side(5), { rng: new Rng(g), type: 'regular', record: true, injuries: false });
        sim.simToEnd();
        for (const l of sim.drainLogs()) {
          // one trip up the floor: no second chance (a board, a block out of bounds) and no foul to stop the clock
          if (
            l.steps[0]?.k !== 'press' ||
            l.kind === 'transition' ||
            l.steps.some((s) => s.k === 'block' || s.k === 'foul' || (s.k === 'reb' && (s.pid === undefined || l.on[l.off].includes(s.pid))))
          )
            continue;
          trips++;
          if (l.clockStart - l.clockEnd > GAME.shotClock + 1e-6) over++;
        }
      }
      expect(trips).toBeGreaterThan(100);
      expect(over).toBe(0);
    }
    // the coverage chosen is played, switching off the ball only off the ball
    {
      const cov: Record<string, number> = {};
      for (let g = 0; g < 4; g++) {
        const sim = new GameSim(side(4, { defense: { scheme: 'man', pnr: 'drop', switchOffBall: true, starPlan: 'none' } }), side(5), {
          rng: new Rng(g),
          type: 'regular',
          record: true,
          injuries: false,
        });
        sim.simToEnd();
        for (const l of sim.drainLogs()) if (l.off === 1 && l.coverage) cov[l.coverage] = (cov[l.coverage] ?? 0) + 1;
      }
      expect(cov.drop).toBeGreaterThan(20);
      expect(cov.switch ?? 0).toBe(0);
    }
    // a player fouls out on his sixth foul, offensive fouls included
    {
      const sim = new GameSim(side(0), side(1), { rng: new Rng(1), type: 'regular', injuries: false }) as unknown as Internals;
      const t = sim.T[0];
      const p = t.players.find((x) => x.on)!;
      p.fouls = 5;
      sim.chargeFoul(t, p);
      expect(p.out).toBe(1);
      expect(p.on).toBe(false);
      expect(t.on.length).toBe(5);
      expect(t.on.every((x) => x.out === 0)).toBe(true);
    }
    // a fouled-out player is replaced with the staff's choice, who isn't subbed straight back out
    {
      type R = Internals & { T: { on: { pid: number }[] }[]; step(): boolean; checkSubs(t: unknown, force?: boolean): void };
      let undone = 0;
      for (let g = 0; g < 12; g++) {
        const sim = new GameSim(side(2), side(3), { rng: new Rng(60 + g), type: g % 2 ? 'playoffs' : 'regular', injuries: false }) as unknown as R;
        while (sim.q < 2 || sim.clock > 200 + 20 * g) sim.step();
        for (const t of sim.T) {
          sim.checkSubs(t, true);
          const p = t.players.find((x) => x.on && x.out === 0)!;
          p.fouls = 5;
          sim.chargeFoul(t, p);
          const lineup = t.on.map((x) => x.pid).join();
          sim.checkSubs(t, true);
          if (t.on.map((x) => x.pid).join() !== lineup) undone++;
        }
      }
      expect(undone).toBe(0);
    }
    // never four on the floor: a sixth foul with nobody left costs a technical, and the last man disqualified
    // comes back for an injured one
    {
      type SP = { out: number; pid: number; fouls: number; on: boolean; outAt?: number };
      type Short = {
        T: { on: SP[]; players: SP[]; tot: { fta: number } }[];
        chargeFoul(t: unknown, p: unknown): void;
        replace(t: unknown, p: unknown): boolean;
      };
      const sim = new GameSim(side(0), side(1), { rng: new Rng(4), type: 'regular', injuries: false }) as unknown as Short;
      const [t, opp] = sim.T;
      const bench = t.players.filter((x) => !x.on);
      bench.forEach((x, i) => {
        x.out = i < 2 ? 1 : 2;
        x.fouls = i < 2 ? 6 : 0;
        x.outAt = i < 2 ? 100 * (i + 1) : undefined;
      });
      const p = t.on[0];
      p.fouls = 5;
      const fta = opp.tot.fta;
      sim.chargeFoul(t, p);
      expect(p.out).toBe(1);
      expect(p.on).toBe(true);
      expect(t.on.length).toBe(5);
      expect(opp.tot.fta).toBe(fta + 1);
      // an injury with no healthy sub: the most recently disqualified player (bench[1]) returns
      const hurt = t.on[1];
      hurt.out = 2;
      expect(sim.replace(t, hurt)).toBe(true);
      expect(hurt.on).toBe(false);
      expect(bench[1].on).toBe(true);
      expect(new Set(t.on.map((x) => x.pid)).size).toBe(5);
    }
    // exactly 48 minutes (box score included), the opening five booked as starters, and a shot off late in a period
    {
      for (let g = 0; g < 4; g++) {
        const sim = new GameSim(side(2), side(3), { rng: new Rng(300 + g), type: 'regular', injuries: false });
        const opening = sim.T.map((t) => t.on.map((p) => p.pid).sort((a, b) => a - b));
        const res = sim.simToEnd();
        const total = 5 * (48 + 5 * res.ot) * 60;
        for (const [i, tb] of [res.home, res.away].entries()) {
          expect(Math.abs(sim.T[i].players.reduce((a, p) => a + p.b.sec, 0) - total)).toBeLessThan(1e-6);
          // the box score adds up too, to the tenth, and nobody who got on the floor shows 0 minutes
          expect(Math.round(tb.players.reduce((a, p) => a + p.min, 0) * 10)).toBe(total / 6);
          for (const p of sim.T[i].players) expect(tb.players.find((x) => x.pid === p.pid)!.min > 0).toBe(p.b.sec > 0);
          expect(
            tb.players
              .filter((p) => p.gs)
              .map((p) => p.pid)
              .sort((a, b) => a - b),
          ).toEqual(opening[i]);
        }
      }
      // five seconds left before the half: the offense gets a shot (or a trip to the line) off; eight
      // or twenty seconds left in a 12-point game (the shot clock off), the leader lets the clock run out instead
      const lastPossession = (q: number, clock: number, lead: number) => {
        let shots = 0;
        for (let g = 0; g < 20; g++) {
          const sim = new GameSim(side(4), side(5), { rng: new Rng(500 + g), type: 'regular', injuries: false }) as unknown as Internals & {
            T: { tot: { fga: number; fta: number; tov: number }; score: number }[];
            poss: number;
            step(): boolean;
          };
          sim.q = q;
          sim.clock = clock;
          sim.T[sim.poss].score += lead;
          const off = sim.T[sim.poss].tot;
          const before = off.fga + off.fta + off.tov;
          sim.step();
          if (off.fga + off.fta + off.tov > before) shots++;
        }
        return shots;
      };
      expect(lastPossession(2, 5, 0)).toBeGreaterThanOrEqual(18);
      // down one with two seconds left in the game: still a shot at the win
      expect(lastPossession(4, 2, -1)).toBeGreaterThanOrEqual(18);
      expect(lastPossession(4, 8, 12)).toBeLessThanOrEqual(2);
      expect(lastPossession(4, 20, 12)).toBeLessThanOrEqual(2);
    }
    // the starters come back as soon as a blowout gets back within reach
    {
      type G = {
        q: number;
        clock: number;
        T: { score: number; garbage: boolean; subSig: number[]; on: { pid: number }[]; t: Team['tactics']; team: Team }[];
        subSignature(t: unknown): number[];
        checkSubs(t: unknown): void;
      };
      const sim = new GameSim(side(6), side(7), { rng: new Rng(8), type: 'regular', injuries: false }) as unknown as G;
      const t = sim.T[0];
      sim.q = 4;
      sim.clock = 100;
      t.score = 100;
      sim.T[1].score = 85;
      t.garbage = true;
      sim.checkSubs(t);
      const starters = t.team.rotation.order.slice(0, 5);
      expect(t.on.some((p) => starters.includes(p.pid))).toBe(false);
      // a deep-bench player who gets hurt is replaced from the deep bench, not by a starter
      const hurt = t.on[0] as { pid: number; out: number };
      hurt.out = 2;
      (sim as unknown as { replace(t: unknown, p: unknown): boolean }).replace(t, hurt);
      expect(t.on.some((p) => starters.includes(p.pid))).toBe(false);
      // the lead falls to 8 with 1:40 left: no minute mark or fatigue change needed to react
      t.subSig = sim.subSignature(t);
      sim.T[1].score = 92;
      sim.checkSubs(t);
      expect(t.garbage).toBe(false);
      expect(t.on.filter((p) => starters.includes(p.pid)).length).toBeGreaterThanOrEqual(3);
    }
    // the bench empties as soon as a game turns into a blowout, and manual subs expire
    {
      type G = {
        q: number;
        clock: number;
        elapsed: number;
        T: { score: number; garbage: boolean; subSig: number[]; subLock: Map<number, number>; on: { pid: number }[]; team: Team }[];
        subSignature(t: unknown): number[];
        checkSubs(t: unknown): void;
      };
      const game = new GameSim(side(6), side(7), { rng: new Rng(8), type: 'regular', injuries: false });
      const sim = game as unknown as G;
      const t = sim.T[0];
      sim.q = 4;
      sim.clock = 160;
      t.score = 100;
      sim.T[1].score = 82;
      sim.checkSubs(t);
      expect(t.garbage).toBe(false);
      // 18 up with 2:29 left is a blowout: the bench comes in now, not at the next minute mark
      t.subSig = sim.subSignature(t);
      sim.clock = 149;
      sim.checkSubs(t);
      expect(t.garbage).toBe(true);
      const starters = t.team.rotation.order.slice(0, 5);
      expect(t.on.some((p) => starters.includes(p.pid))).toBe(false);
      // a manual sub holds for four minutes, then the lock is gone
      const bench = t.team.rotation.order.find((pid) => !t.on.some((p) => p.pid === pid))!;
      expect(game.substitute(0, t.on[0].pid, bench)).toBe(true);
      expect(t.subLock.size).toBe(2);
      sim.elapsed += 241;
      sim.checkSubs(t);
      expect(t.subLock.size).toBe(0);
    }
    // only two timeouts after the 3:00 mark of the fourth quarter
    {
      const game = new GameSim(side(0), side(1), { rng: new Rng(1), type: 'regular', injuries: false });
      const sim = game as unknown as Internals & { T: { timeouts: number }[] };
      sim.q = 4;
      sim.clock = 170;
      sim.T[0].timeouts = 4;
      expect(game.callTimeout(0)).toBe(true);
      expect(sim.T[0].timeouts).toBe(1);
      expect(game.callTimeout(0)).toBe(true);
      expect(game.callTimeout(0)).toBe(false);
    }
    // a timeout stops play: the trip out of it is an inbound, never a run-out, and opens with the after-timeout play
    {
      // timeouts called with the ball, between possessions, as the Live screen calls them (after steals and defensive boards too)
      const from: Record<string, number> = {};
      let trips = 0;
      for (let g = 0; g < 40; g++) {
        const sim = new GameSim(side(6, { manage: { ato: 'spain', autoTimeouts: false } }), side(7, { manage: { autoTimeouts: false } }), {
          rng: new Rng(500 + g),
          type: 'regular',
          record: true,
          injuries: false,
        });
        const s = sim as unknown as { poss: number; ctx: string; clock: number; T: { timeouts: number }[] };
        let n = 0;
        while (!sim.over) {
          const ctx = s.ctx;
          const called = s.poss === 0 && s.clock > 30 && s.T[0].timeouts > 2 && ++n % 5 === 0 && sim.callTimeout(0);
          sim.step();
          const l = sim.drainLogs()[0];
          if (!called || !l) continue;
          expect(l.steps[0]).toEqual({ k: 'timeout', t: 0 });
          expect(l.kind, `out of a timeout after ${ctx}`).not.toBe('transition');
          // (a trip that ends in free throws before any action keeps the play for the next one)
          if (l.kind !== 'half') continue;
          expect(l.set?.id, `the after-timeout set, after ${ctx}`).toBe('spain');
          from[ctx] = (from[ctx] ?? 0) + 1;
          trips++;
        }
      }
      expect(trips).toBeGreaterThan(150);
      expect(from.steal).toBeGreaterThan(5);
      expect(from.dreb).toBeGreaterThan(20);
    }
    // a timeout asked for during the other side’s live ball comes at the next dead ball, and the staff calls one
    // only when it may
    {
      type S = { poss: number; ctx: string; clock: number; T: { timeouts: number; run: number }[]; autoTimeouts(): void };
      let waited = 0;
      for (let g = 0; g < 12; g++) {
        const quiet: TacticsPatch = { manage: { autoTimeouts: false } };
        const sim = new GameSim(side(8, quiet), side(9, quiet), { rng: new Rng(700 + g), type: 'regular', record: true, injuries: false });
        const s = sim as unknown as S;
        // the other side has the ball after a steal or a defensive board: a live ball
        while (!sim.over && !(s.poss === 1 && (s.ctx === 'steal' || s.ctx === 'dreb') && s.clock > 60)) sim.step();
        if (sim.over) continue;
        sim.drainLogs();
        const left = s.T[0].timeouts;
        expect(sim.callTimeout(0)).toBe(true);
        expect([sim.timeoutWaiting(0), s.T[0].timeouts, sim.timeoutOpens()]).toEqual([true, left, null]);
        sim.step();
        // their trip plays on (a run-out off the steal included), and the timeout comes at the dead ball after it
        const theirs = sim.drainLogs()[0];
        expect(theirs.off).toBe(1);
        expect(theirs.steps.some((st) => st.k === 'timeout')).toBe(false);
        expect([sim.timeoutWaiting(0), s.T[0].timeouts, sim.timeoutOpens()]).toEqual([false, left - 1, 0]);
        sim.step();
        const mine = sim.drainLogs()[0];
        expect([mine.off, mine.steps[0]]).toEqual([0, { k: 'timeout', t: 0 }]);
        expect(mine.kind).not.toBe('transition');
        waited++;
      }
      expect(waited).toBeGreaterThan(8);
      // the staff stops a run only when it may: not while the other side has a live ball
      const sim = new GameSim(side(8), side(9), { rng: new Rng(1), type: 'regular', injuries: false });
      const s = sim as unknown as S;
      s.T[1].run = 14;
      s.ctx = 'dreb';
      s.poss = 1;
      s.autoTimeouts();
      expect(s.T[0].timeouts).toBe(7);
      s.poss = 0;
      s.autoTimeouts();
      expect(s.T[0].timeouts).toBe(6);
    }
    // the shot clock restarts at 14 or more after a side-out foul
    {
      // trips from one inbound (no press, run-out or second chance) with a non-shooting foul that was only a side out
      let sideOuts = 0;
      let longer = 0;
      for (let g = 0; g < 36; g++) {
        const sim = new GameSim(side(10, { defense: { physicality: 90, pressure: 80 } }), side(11, { defense: { physicality: 90, pressure: 80 } }), {
          rng: new Rng(900 + g),
          type: 'regular',
          record: true,
          injuries: false,
        });
        sim.simToEnd();
        for (const l of sim.drainLogs()) {
          if (l.kind !== 'half' || l.steps.some((st) => st.k === 'reb' || st.k === 'block' || st.k === 'press' || st.k === 'timeout')) continue;
          const i = l.steps.findIndex((st) => st.k === 'foul');
          if (i < 0 || l.steps[i + 1]?.k === 'ft' || l.label === 'Intentional foul' || l.label.startsWith('Hack-a') || l.label === 'Foul to give') continue;
          sideOuts++;
          const used = l.clockStart - l.clockEnd;
          // the 24 seconds it had, and at most 14 more for each stop (with the game clock still running)
          expect(used).toBeLessThan(GAME.shotClock + 14 * l.steps.filter((st) => st.k === 'foul').length + 1e-6);
          if (used > GAME.shotClock + 0.5) longer++;
        }
      }
      expect(sideOuts).toBeGreaterThan(150);
      // without the reset no such trip could last past 24 seconds
      expect(longer).toBeGreaterThan(7);
    }
    // free throws only in the penalty, with the two-minute rule in every period and four fouls in overtime
    {
      const sim = new GameSim(side(0), side(1), { rng: new Rng(1), type: 'regular', injuries: false }) as unknown as Internals;
      const t = sim.T[1];
      const at = (q: number, clock: number, fouls: number, last2: number) => {
        sim.q = q;
        sim.clock = clock;
        t.fouls = fouls;
        t.foulsLast2 = last2;
        return sim.bonus(t);
      };
      expect(at(2, 400, 4, 0)).toBe(false);
      expect(at(2, 400, 5, 0)).toBe(true);
      expect(at(2, 100, 2, 1)).toBe(false);
      expect(at(2, 100, 2, 2)).toBe(true);
      expect(at(5, 200, 3, 0)).toBe(false);
      expect(at(5, 200, 4, 0)).toBe(true);
    }
    // free throws without a shot are booked to the action that drew them, and every attempt counts in usage
    {
      for (let g = 0; g < 6; g++) {
        const sim = new GameSim(side(6), side(7), { rng: new Rng(70 + g), type: 'regular', record: true, injuries: false });
        const res = sim.simToEnd();
        for (const l of sim.drainLogs()) {
          // a reach-in in the penalty counts for the action, made or missed; only late intentional fouls are 'misc'
          if (l.steps.some((s) => s.k === 'ft') && !l.steps.some((s) => s.k === 'shot')) expect(l.kind === 'ft' ? ['misc'] : ['pnrBH', 'iso']).toContain(l.finish);
          if (!l.steps.some((s) => s.k === 'shot')) expect(l.finish).not.toBe('putback');
        }
        for (const tb of [res.home, res.away]) {
          const onCourtFta = sim
            .rawBoxes()
            .filter((r) => r.tid === tb.tid)
            .reduce((a, r) => a + r.b.tFta, 0);
          expect(onCourtFta).toBe(5 * tb.t.fta);
        }
      }
    }
  });

  it('plays the late game, writes the play-by-play and runs the coaching hooks as intended', () => {
    // a switched pick-and-roll's isolation is booked to the handler's play type, its turnovers included
    {
      type In = {
        poss: 0 | 1;
        T: { on: unknown[]; pt: Record<string, { poss: number }> }[];
        toChance(): number;
        iso(off: unknown, def: unknown, open: number, late: unknown, forced: boolean, fixed: unknown): unknown;
      };
      // no star plan or help to double him
      const s = new GameSim(side(6), side(7, { defense: { help: 50, starPlan: 'none' } }), { rng: new Rng(4), type: 'regular', injuries: false }) as unknown as In;
      const off = s.T[s.poss];
      const def = s.T[1 - s.poss];
      s.toChance = () => 1;
      const late = { hold: false, quick: false, milk: false, need3: false, hurry: false, tie: false };
      s.iso(off, def, 0, late, false, { actor: off.on[0], defender: def.on[0], tag: 'switch_mismatch', fromPnr: true });
      expect(off.pt.pnrBH?.poss).toBe(1);
      expect(off.pt.iso).toBeUndefined();
    }
    // fast-break points count whether or not the game is recorded
    {
      let quiet = 0;
      let recorded = 0;
      for (let g = 0; g < 6; g++) {
        for (const record of [false, true]) {
          const res = new GameSim(side(8), side(9), { rng: new Rng(90 + g), type: 'regular', record, injuries: false }).simToEnd();
          const fb = res.home.extra.fastBreak + res.away.extra.fastBreak;
          if (record) recorded += fb;
          else quiet += fb;
        }
      }
      expect(quiet).toBeGreaterThan(0);
      // cosmetic draws don't touch the simulation, so recording doesn't change the game
      expect(quiet).toBe(recorded);
    }
    // a team trailing late fouls only while a foul can still buy another shot
    {
      type F = Internals & { T: { score: number }[]; intentionalFoul(off: unknown, def: unknown): string | null };
      const at = (clock: number, down: number) => {
        const sim = new GameSim(side(0), side(1), { rng: new Rng(2), type: 'regular', injuries: false }) as unknown as F;
        const [off, def] = sim.T;
        sim.q = 4;
        sim.clock = clock;
        off.score = 100 + down;
        def.score = 100;
        return sim.intentionalFoul(off, def);
      };
      expect(at(20, 2)).not.toBeNull();
      expect(at(2, 2)).not.toBeNull();
      // down three a stop and a three tie it: they defend rather than make it a two-possession game
      expect(at(20, 3)).toBeNull();
      expect(at(3, 3)).toBeNull();
      // down four to six they defend until the leader could run the shot clock out, then foul
      expect(at(40, 5)).toBeNull();
      expect(at(25, 5)).not.toBeNull();
      expect(at(4, 7)).toBeNull();
      // down seven to nine they foul sooner, though fewer coaches do the further down they are
      const fouls = (down: number) => {
        let n = 0;
        for (let g = 0; g < 40; g++) {
          const sim = new GameSim(side(0), side(1), { rng: new Rng(g), type: 'regular', injuries: false }) as unknown as F;
          const [off, def] = sim.T;
          sim.q = 4;
          sim.clock = 40;
          off.score = 100 + down;
          def.score = 100;
          if (sim.intentionalFoul(off, def)) n++;
        }
        return n;
      };
      expect(fouls(7)).toBeGreaterThan(fouls(9));
      expect(fouls(9)).toBeGreaterThan(0);
      expect(fouls(10)).toBe(0);
    }
    // a poor free-throw shooter is hacked only before the last two minutes of a period
    {
      type F = Internals & { intentionalFoul(off: unknown, def: unknown): string | null };
      const hacks = (q: number, clock: number) => {
        let n = 0;
        for (let g = 0; g < 10; g++) {
          const sim = new GameSim(side(0), side(1, { manage: { hackThreshold: 99 } }), { rng: new Rng(g), type: 'regular', injuries: false }) as unknown as F;
          sim.q = q;
          sim.clock = clock;
          if (sim.intentionalFoul(sim.T[0], sim.T[1])) n++;
        }
        return n;
      };
      expect(hacks(2, 300)).toBeGreaterThan(5);
      expect(hacks(2, 100)).toBe(0);
      expect(hacks(4, 100)).toBe(0);
    }
    // a team hurries when two possessions down late, but not in a lost cause
    {
      const sim = new GameSim(side(0), side(1), { rng: new Rng(1), type: 'regular', injuries: false }) as unknown as Internals & { T: { score: number }[] };
      const [off, def] = sim.T;
      sim.q = 4;
      const at = (clock: number, down: number) => {
        sim.clock = clock;
        off.score = 100;
        def.score = 100 + down;
        return sim.lateMode(off, def).hurry;
      };
      expect(at(50, 6)).toBe(true);
      expect(at(100, 9)).toBe(true);
      expect(at(150, 25)).toBe(false);
      expect(at(50, 2)).toBe(false);
      expect(at(400, 6)).toBe(false);
    }
    // the log has subs, timeouts and period changes, with clean punctuation and distinct names
    {
      const sim = new GameSim(side(10), side(11), { rng: new Rng(5), type: 'regular', record: true });
      const res = sim.simToEnd();
      const pbp = res.pbp!;
      // the court shows each timeout as the next possession's first beat, and gives every possession a headline
      const logs = sim.drainLogs();
      expect(logs.some((l) => l.steps[0]?.k === 'timeout')).toBe(true);
      for (const l of logs) {
        expect(l.steps.findIndex((st) => st.k === 'timeout')).toBeLessThanOrEqual(0);
        expect(l.label).not.toBe(FINISH_LABEL.misc);
        for (const st of l.steps) if (st.k === 'pass') expect(st.pid2).not.toBe(st.pid);
      }
      for (const kind of ['sub', 'timeout', 'period'] as const) expect(pbp.some((e) => e.kind === kind && e.text.length > 8)).toBe(true);
      for (const e of pbp) expect(e.text).not.toMatch(/[!.?]\.$|\.\.|\s\./);
      // an and-one names the fouler, an alley-oop always has its assist, and a three is a three-pointer
      expect(pbp.some((e) => / — good.*, and one! Foul on .+\.$/.test(e.text))).toBe(true);
      for (const e of pbp) {
        if (e.text.includes('and one')) expect(e.text).toMatch(/and one! Foul on .+\.$/);
        if (e.text.includes('alley-oop — good')) expect(e.text).toMatch(/assist\)/);
        expect(e.text).not.toMatch(/(misses|fouled on) three(\.| by)/);
      }
      // a rebound line names a player only when the box score credits him (the rest are team rebounds)
      const named = pbp.filter((e) => /^(Offensive|Defensive) rebound /.test(e.text)).length;
      expect(named).toBe(res.home.t.orb + res.home.t.drb + res.away.t.orb + res.away.t.drb);
      expect(res.flowPeriods!.slice(0, 4)).toEqual([...res.flowPeriods!.slice(0, 4)].sort((a, b) => a - b));
      expect(res.flowPeriods!.length).toBe(4 + res.ot);
      expect(res.flowPeriods![0]).toBe(0);
    }
    // "Jr." names without a double period, and overtimes as OT, 2OT
    {
      const base = side(14);
      const players = base.players.map((p) => ({ ...p, lastName: `${p.lastName} Jr.` }));
      let ot = 0;
      for (let g = 0; g < 200 && ot < 2; g++) {
        const res = new GameSim({ ...base, players }, side(15), { rng: new Rng(700 + g), type: 'regular', record: true, injuries: false }).simToEnd();
        for (const e of res.pbp!) expect(e.text).not.toMatch(/\.\./);
        if (!res.ot) continue;
        ot++;
        expect(res.pbp!.some((e) => e.text === 'Start of OT.')).toBe(true);
        if (res.ot >= 2) expect(res.pbp!.some((e) => e.text.startsWith('Start of 2OT.'))).toBe(true);
        expect(res.pbp!.some((e) => /OT\d/.test(e.text))).toBe(false);
      }
      expect(ot).toBeGreaterThan(0);
    }
    // a moment of a game in text: the period and the clock, a sub-minute clock with its minutes so "Q4 0:35.0"
    // never reads as thirty-five minutes
    {
      expect(gameTime(1, 720)).toBe('Q1 12:00');
      expect(gameTime(4, 303.6)).toBe('Q4 5:03');
      expect(gameTime(4, 35)).toBe('Q4 0:35.0');
      expect(gameTime(4, 1)).toBe('Q4 0:01.0');
      expect(gameTime(4, 0.04)).toBe('Q4 0:00.0');
      expect(gameTime(2, 24.3)).toBe('Q2 0:24.3');
      expect(gameTime(5, 126)).toBe('OT 2:06');
      expect(gameTime(6, 0.4)).toBe('2OT 0:00.4');
    }
    // teammates who share a last name are told apart in play-by-play
    {
      const base = side(12);
      const players = base.players.map((p, i) => (i < 3 ? { ...p, lastName: 'Williams', firstName: ['Jalen', 'Jaylin', 'Kenrich'][i] } : p));
      const sim = new GameSim({ ...base, players }, side(13), { rng: new Rng(3), type: 'regular' }) as unknown as { T: { players: { pid: number; name: string }[] }[] };
      const names = players.slice(0, 3).map((p) => sim.T[0].players.find((x) => x.pid === p.pid)!.name);
      expect(names).toEqual(['Jal. Williams', 'Jay. Williams', 'K. Williams']);
    }
    // an AI coach adjusts in-game, deterministically, and never touches the other team's plan
    {
      const run = () => {
        const home = { ...side(14), adjust: true };
        const away = side(15);
        const before = JSON.stringify(away.team.tactics);
        let changes = 0;
        const results: number[] = [];
        for (let g = 0; g < 20; g++) {
          const sim = new GameSim(home, away, { rng: new Rng(200 + g), type: 'regular', record: true, injuries: false });
          const res = sim.simToEnd();
          changes += res.pbp!.filter((e) => e.text.includes('adjusts:')).length;
          expect(JSON.stringify((sim as unknown as { T: { t: unknown }[] }).T[1].t)).toBe(before);
          results.push(res.home.pts * 1000 + res.away.pts);
        }
        return { changes, results };
      };
      const a = run();
      expect(a.changes).toBeGreaterThan(0);
      expect(run()).toEqual(a);
    }
    // the overtime jump ball is drawn from its own stream, so paired games stay paired
    {
      type O = { q: number; clock: number; poss: number; rng: Rng; endPeriod(): boolean };
      const winners = new Set<number>();
      for (let k = 0; k < 8; k++) {
        const sim = new GameSim(side(0), side(1), { rng: new Rng(3), type: 'regular', injuries: false }) as unknown as O;
        sim.q = 4;
        sim.clock = 0;
        // a different last possession of regulation
        for (let i = 0; i < k; i++) sim.rng.next();
        expect(sim.endPeriod()).toBe(true);
        winners.add(sim.poss);
      }
      expect(winners.size).toBe(1);
    }
    // nobody is injured twice when nobody is left to replace him
    {
      type I = { T: { on: { pid: number }[]; players: { on: boolean; out: number }[] }[]; injuries: { pid: number }[]; injuryCheck(): void };
      const sim = new GameSim(side(0), side(1), { rng: new Rng(4), type: 'regular' }) as unknown as I;
      for (const p of sim.T[0].players) if (!p.on) p.out = 2;
      const rate = K.injuryRate;
      K.injuryRate = 1;
      try {
        sim.injuryCheck();
        sim.injuryCheck();
      } finally {
        K.injuryRate = rate;
      }
      expect(sim.injuries.length).toBe(2);
      expect(new Set(sim.injuries.map((i) => i.pid)).size).toBe(2);
    }
    // ball screens are set by the preferred screeners in the order listed
    {
      const order = league.teams[20].rotation.order;
      const [first, second] = [order[4], order[3]];
      const sim = new GameSim(side(20, { offense: { screeners: [first, second] } }), side(21), { rng: new Rng(12), type: 'regular', record: true, injuries: false });
      sim.simToEnd();
      let screens = 0;
      for (const l of sim.drainLogs()) {
        if (l.off !== 0) continue;
        for (const st of l.steps) {
          if (st.k !== 'screen' || st.pid2 === first || !l.on[0].includes(first)) continue;
          screens++;
          expect(st.pid).toBe(first);
        }
      }
      expect(screens).toBeGreaterThan(5);
    }
    // the boards a crashing offense or a zone gives up are tagged at half weight off a missed free throw
    {
      type Rb = { T: unknown[]; impact(key: string, benefit: number, pts: number): void; rebound(off: unknown, def: unknown, zone: string, blocked: boolean, ft: boolean): void };
      const first = (ft: boolean) => {
        const sim = new GameSim(side(0, { offense: { crashBoards: 100 } }), side(1, { defense: { scheme: 'zone23' } }), {
          rng: new Rng(1),
          type: 'regular',
          injuries: false,
        }) as unknown as Rb;
        const tags: Record<string, number> = {};
        sim.impact = (key, _benefit, pts) => void (tags[key] ??= pts);
        sim.rebound(sim.T[0], sim.T[1], 'rim', false, ft);
        return tags;
      };
      const [shot, ft] = [first(false), first(true)];
      for (const key of ['crash_orb', 'zone_glass']) {
        expect(shot[key]).toBeGreaterThan(0);
        expect(ft[key]).toBeCloseTo(shot[key] / 2, 9);
      }
    }
    // double teams are credited to the Star plan only when the plan sent them
    {
      const doubles = (plan: 'none' | 'double') => {
        let n = 0;
        for (let g = 0; g < 6; g++) {
          const d = { defense: { starPlan: plan, starTarget: null, help: 90, scheme: 'man' as const } };
          const res = new GameSim(side(18, d), side(19, d), { rng: new Rng(30 + g), type: 'regular', injuries: false }).simToEnd();
          n += res.impacts!.filter((i) => i.key.startsWith('star_double')).length;
        }
        return n;
      };
      expect(doubles('none')).toBe(0);
      expect(doubles('double')).toBeGreaterThan(0);
    }
  });
});
