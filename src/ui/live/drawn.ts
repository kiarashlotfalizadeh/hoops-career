// The live game as the court has drawn it. The sim runs a possession ahead of the court, so
// anything read straight from it (the box score, energy, fouls, timeouts, runs, the tactical
// tallies) would give away the play still being drawn: the Live screen takes this snapshot just
// before each step and shows it until the court has drawn the next one.

import type { GameResult, SetId, TacticImpact } from '../../core/types';
import type { GameSim } from '../../core/sim/engine';

export interface DrawnPlayer {
  pid: number;
  energy: number;
  fouls: number;
  pts: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  /** 0 ok, 1 fouled out, 2 injured or held out, 3 ejected. */
  out: 0 | 1 | 2 | 3;
  /** Technical fouls tonight. */
  tf: number;
  /** Ejected: for two technicals or a Flagrant 2. */
  ej?: 'tech' | 'flagrant';
  on: boolean;
  /** Field goals in a row: made (positive) or missed (negative), the latest shots first. */
  streak: number;
  /** His free-throw percentage (0..1), as the engine shoots them. */
  ftPct: number;
}

export interface DrawnSide {
  score: number;
  timeouts: number;
  /** Unanswered points. */
  run: number;
  /** Team fouls this period. */
  fouls: number;
  /** In the bonus: this team's opponent is in the penalty, so its fouls send this team to the line. */
  bonus: boolean;
  /** The five on the floor, in the sim's order. */
  on: number[];
  players: DrawnPlayer[];
  /** Possessions and points per play type so far. */
  pt: Record<string, { poss: number; pts: number }>;
  /** The sets this side has run so far: how often, and the openness the other defense's read takes off each one's look next time. */
  sets: { id: SetId; runs: number; read: number }[];
}

export interface Drawn {
  q: number;
  /** Seconds left in the period. */
  clock: number;
  /** Game seconds played. */
  elapsed: number;
  /**
   * The side with the ball for the next possession (0 home, 1 away): the other team, after the
   * possession just drawn; null at the end of a period (the next one starts by its own rule).
   */
  ball: 0 | 1 | null;
  /** [home, away]. */
  sides: [DrawnSide, DrawnSide];
  /** The tactical edges so far (copies). */
  impacts: TacticImpact[];
  /** How many of the sim's coaching adjustments, in-game injuries, flow points, shots and play-by-play lines it includes. */
  adjustments: number;
  injuries: number;
  flowLen: number;
  shotsLen: number;
  pbpLen: number;
  /** The box score (its play types copied: they're the sim's running tallies). */
  box: GameResult;
}

/** Made (positive) or missed (negative) field goals in a row for each shooter, from a game's shot log. */
export function streaks(shots: { pid: number; made: boolean }[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of shots) {
    const cur = out.get(s.pid) ?? 0;
    out.set(s.pid, s.made ? (cur > 0 ? cur + 1 : 1) : cur < 0 ? cur - 1 : -1);
  }
  return out;
}

/** The game as it stands in the sim right now. */
export function snapshot(sim: GameSim): Drawn {
  const res = sim.result();
  const pt = (t: GameResult['home']) => ({ ...t, playTypes: Object.fromEntries(Object.entries(t.playTypes).map(([k, v]) => [k, { ...v }])) });
  // the flow, shots and lineups are the sim's own growing lists too (the play-by-play isn't needed)
  const box: GameResult = {
    ...res,
    home: pt(res.home),
    away: pt(res.away),
    flow: res.flow?.slice(),
    flowPeriods: res.flowPeriods?.slice(),
    flowT: res.flowT?.slice(),
    flowPoss: res.flowPoss?.slice(),
    shots: res.shots?.slice(),
    lineups: res.lineups?.map((l) => ({ ...l })),
    impacts: res.impacts?.map((im) => ({ ...im, players: { ...im.players } })),
    pbp: undefined,
  };
  const streak = streaks(sim.shots);
  const side = (i: 0 | 1): DrawnSide => {
    const t = sim.T[i];
    return {
      score: t.score,
      timeouts: t.timeouts,
      run: t.run,
      fouls: t.fouls,
      bonus: sim.bonus(sim.T[1 - i]),
      on: t.on.map((p) => p.pid),
      players: t.players.map((p) => ({
        pid: p.pid,
        energy: p.energy,
        fouls: p.fouls,
        pts: p.b.pts,
        fgm: p.b.fgm,
        fga: p.b.fga,
        ftm: p.b.ftm,
        fta: p.b.fta,
        out: p.out,
        tf: p.b.tf,
        ...(p.ej ? { ej: p.ej } : {}),
        on: p.on,
        streak: streak.get(p.pid) ?? 0,
        ftPct: p.ftPct,
      })),
      pt: (i === 0 ? box.home : box.away).playTypes,
      sets: sim.setReads(i),
    };
  };
  return {
    q: sim.q,
    clock: sim.clock,
    elapsed: sim.elapsed,
    ball: sim.clock <= 0.05 ? null : sim.poss,
    sides: [side(0), side(1)],
    impacts: [...sim.impacts.values()].map((im) => ({ ...im, players: { ...im.players } })),
    adjustments: sim.adjustments.length,
    injuries: sim.injuries.length,
    flowLen: sim.flow.length,
    shotsLen: sim.shots.length,
    pbpLen: sim.pbp.length,
    box,
  };
}

/** A player in the drawn game (either side). */
export function drawnPlayer(d: Drawn, pid: number): DrawnPlayer | undefined {
  for (const s of d.sides) {
    const p = s.players.find((x) => x.pid === pid);
    if (p) return p;
  }
  return undefined;
}

/** What the Subs sheet needs of the sim's player: his own numbers, for one the drawing doesn't have. */
export interface SubsSource {
  pid: number;
  energy: number;
  fouls: number;
  out: 0 | 1 | 2 | 3;
  b: { pts: number; sec: number; tf: number };
}

/**
 * One of a side's players as the Subs sheet lists him, as the court has drawn the game: his energy,
 * fouls, points and minutes, his technicals (only when he has one), and whether he can't play (1 fouled out,
 * 2 hurt or resting, 3 ejected). The sim
 * runs a possession ahead, so read from it a foul-out or an injury in the play still being drawn
 * would show before it happens. The sim's own numbers only stand in for a player the drawing lacks.
 */
export function subsLine(d: Drawn, side: 0 | 1, sp: SubsSource): { energy: number; fouls: number; pts: number; min: number; out: 0 | 1 | 2 | 3; tf?: number } {
  const p = d.sides[side].players.find((x) => x.pid === sp.pid);
  const box = (side === 0 ? d.box.home : d.box.away).players.find((x) => x.pid === sp.pid);
  return {
    energy: Math.round((p?.energy ?? sp.energy) * 100),
    fouls: p?.fouls ?? sp.fouls,
    pts: p?.pts ?? sp.b.pts,
    min: Math.round(box?.min ?? sp.b.sec / 60),
    out: p?.out ?? sp.out,
    ...((p?.tf ?? sp.b.tf) ? { tf: p?.tf ?? sp.b.tf } : {}),
  };
}
