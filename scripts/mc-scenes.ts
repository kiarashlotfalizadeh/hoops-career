// The measurements scripts/mc-check.ts times and hashes (and scripts/mc-pool-bench.ts plays in a browser,
// in one thread and over the rollout pool): the staff's live calls at three stops, the huddle's late
// play-call options, the night's moves after the final and the counters before a game, each on a fixed
// league and fixed games. The live calls run with no time budget (a budget cuts them off by the clock,
// which no hash can pin).
import { createLeague, defaultSettings, type SeedData } from '../src/core/league/create';
import { buildSimInput, ensureRotation } from '../src/core/league/games';
import { startRegularSeason } from '../src/core/league/season';
import { GameSim } from '../src/core/sim/engine';
import { Rng } from '../src/core/random';
import { counterWorth } from '../src/core/ai/counterWorth';
import { cloneTactics } from '../src/core/sim/tactics';
import type { Runner } from '../src/core/sim/rollouts';
import { CALL_CONFIRM, CALL_CONFIRM_CRUNCH, forkSim, measureCalls, measureChoices, nightWorth, type LiveChoice } from '../src/state/liveWorth';
import type { LiveOp } from '../src/core/types';

export interface Scene {
  name: string;
  run: (runner: Runner) => Promise<unknown>;
}

export function scenes(seed: SeedData, quick = false): { scenes: Scene[]; liveGame: (seed: number) => GameSim; playTo: (sim: GameSim, done: (s: GameSim) => boolean) => GameSim } {
  const L = createLeague({ name: 'MC check', userTid: 0, coachName: 'C', settings: defaultSettings(), seed, rngSeed: 31 });
  for (const t of L.teams) ensureRotation(L, t.tid);
  const errs = startRegularSeason(L);
  if (errs.length) throw new Error(errs.join('; '));
  const OPP = 7;

  /** A live game as the Live screen starts one: the user's side without the assistant's adjustments, recorded. */
  const liveGame = (gameSeed: number): GameSim => {
    const mine = { ...buildSimInput(L, 0, L.day, 'regular', OPP), adjust: false };
    const theirs = buildSimInput(L, OPP, L.day, 'regular', 0);
    return new GameSim(mine, theirs, { rng: new Rng(gameSeed), type: 'regular', record: true, keepShots: true, injuries: true });
  };
  const playTo = (sim: GameSim, done: (s: GameSim) => boolean) => {
    while (!done(sim) && sim.step()) sim.drainLogs();
    return sim;
  };

  /** The changes a stop drafts: tactics B and C, a lever, a timeout and a sub. */
  const changes = (sim: GameSim): LiveChoice[] => {
    const base = sim.baseTactics(0);
    const zone = cloneTactics(base);
    zone.defense.scheme = 'zone23';
    const sw = cloneTactics(base);
    sw.defense.pnr = 'switch';
    sw.defense.switchOffBall = true;
    const pace = cloneTactics(base);
    pace.offense.pace = 85;
    const t = sim.T[0];
    const out = [...t.on].sort((a, b) => a.energy - b.energy)[0];
    const inn = t.players.find((p) => !p.on && p.out === 0 && p.planMin > 0)!;
    return [
      { kind: 'tactics', tactics: zone },
      { kind: 'tactics', tactics: sw },
      { kind: 'tactics', tactics: pace },
      { kind: 'timeout' },
      { kind: 'sub', out: out.pid, in: inn.pid },
    ];
  };

  const out: Scene[] = [];
  const spots: { name: string; seed: number; at: (s: GameSim) => boolean; by: 'pts' | 'win'; confirm: number }[] = [
    { name: 'call end of Q1', seed: 202, at: (s) => s.q === 1 && s.clock <= 0.05, by: 'pts', confirm: CALL_CONFIRM },
    { name: 'call end of Q3', seed: 303, at: (s) => s.q === 3 && s.clock <= 0.05, by: 'pts', confirm: CALL_CONFIRM },
    { name: 'call crunch', seed: 404, at: (s) => s.q === 4 && s.clock <= 240, by: 'win', confirm: CALL_CONFIRM_CRUNCH },
  ];
  for (const sp of quick ? spots.slice(0, 1) : spots) {
    const sim = playTo(liveGame(sp.seed), sp.at);
    out.push({ name: sp.name, run: (runner) => measureCalls(forkSim(sim), 0, changes(sim), { by: sp.by, confirm: sp.confirm, budgetMs: Infinity, runner }) });
  }

  {
    const sim = playTo(liveGame(505), (s) => s.q === 4 && s.clock <= 50);
    const t = sim.T[0];
    const star = [...t.on].sort((a, b) => b.r.oiq + b.r.tp - (a.r.oiq + a.r.tp))[0].pid;
    const choices: LiveChoice[] = [
      { kind: 'noPlay' },
      { kind: 'play', set: 'iso', pid: star },
      { kind: 'play', set: 'hammer', pid: star },
      { kind: 'play', set: 'floppy', pid: star },
    ];
    out.push({ name: 'huddle choices', run: (runner) => measureChoices(forkSim(sim), 0, choices, { ...(quick ? { games: 100 } : {}), runner }) });
  }

  {
    const sim = liveGame(606);
    const tip = forkSim(sim);
    const ops: LiveOp[] = [];
    let at = 0;
    const op = (m: Omit<LiveOp, 'at'>) => ops.push({ ...m, at } as LiveOp);
    while (sim.step()) {
      at++;
      sim.drainLogs();
      if (at === 40) {
        const t = sim.T[0];
        const o = t.on[1];
        const inn = t.players.find((p) => !p.on && p.out === 0 && p.planMin > 0);
        if (inn && sim.substitute(0, o.pid, inn.pid)) op({ op: 'sub', args: { out: o.pid, in: inn.pid } });
      }
      if (at === 90) {
        const tz = sim.baseTactics(0);
        tz.defense.scheme = 'zone23';
        sim.setTactics(0, tz);
        op({ op: 'tactics', args: { tactics: cloneTactics(tz) } });
      }
      if (at === 150 && sim.callTimeout(0, 'mc')) op({ op: 'timeout', args: { reason: 'mc' } });
      if (at === 160 && sim.runSet(0, 'iso', sim.T[0].on[0].pid)) op({ op: 'play', args: { set: 'iso', pid: sim.T[0].on[0].pid } });
    }
    out.push({ name: 'night worth', run: (runner) => nightWorth(forkSim(tip), 0, ops, { ...(quick ? { games: 40 } : {}), runner }) });
  }

  out.push({ name: 'counter worth', run: (runner) => counterWorth(L, OPP, undefined, { ...(quick ? { games: 60, counters: 2 } : {}), runner }) });
  return { scenes: out, liveGame, playTo };
}
