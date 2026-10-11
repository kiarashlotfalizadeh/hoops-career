// Possession-by-possession game engine.
//
// Every possession is resolved through concrete basketball actions (pick & roll,
// isolation, post-up, handoffs, motion, transition) with explicit actors, defenders
// and defensive coverages. Each tactical modifier is tagged, and its expected-points
// effect is accumulated so post-game reports can say *why* a game was won or lost.

import type {
  ActionType,
  BoxLine,
  GameResult,
  GameType,
  LineupStat,
  OffRole,
  PbpEntry,
  Player,
  PnrCoverage,
  Pos,
  Ratings,
  ShotRecord,
  ShotZone,
  Tactics,
  TacticImpact,
  Team,
  TeamBox,
  TeamTotals,
} from '../types';
import { Rng, clamp } from '../random';
import { archetype, composites, type Composites, ROLE_USAGE } from '../ratings';
import { GAME } from '../constants';
import { buildMinutePlan, type PlanPlayer } from './rotationPlan';
import { FINISH_LABEL, type FinishType, type PossLog, type PossStep } from './log';
import { cloneTactics } from './tactics';

// ---------------------------------------------------------------- tuning constants

/** Who gets the block on a contested miss: mostly timing and instincts (BLK), some length and pop. */
const blockSkill = (p: { r: { blk: number; hgt: number; ath: number } }) => 0.7 * p.r.blk + 0.18 * p.r.hgt + 0.12 * p.r.ath;

export const K = {
  zoneBase: { rim: 0.652, paint: 0.462, mid: 0.42, c3: 0.383, ab3: 0.346 } as Record<ShotZone, number>,
  zoneSkill: { rim: 0.15, paint: 0.13, mid: 0.13, c3: 0.1, ab3: 0.1 } as Record<ShotZone, number>,
  zoneOpen: { rim: 0.1, paint: 0.07, mid: 0.055, c3: 0.06, ab3: 0.06 } as Record<ShotZone, number>,
  foulRate: { rim: 0.212, paint: 0.108, mid: 0.042, c3: 0.014, ab3: 0.016 } as Record<ShotZone, number>,
  /** Share of misses that are blocks, for an average contesting defender. */
  blockMiss: { rim: 0.235, paint: 0.155, mid: 0.042, c3: 0.017, ab3: 0.017 } as Record<ShotZone, number>,
  /** Extra share of misses blocked by the shooter's own defender (from behind, on the contest). */
  chaseBlock: { rim: 0.06, paint: 0.048, mid: 0.026, c3: 0.01, ab3: 0.01 } as Record<ShotZone, number>,
  orbBase: 0.248,
  toBase: 0.15,
  nonShootFoul: 0.13,
  transitionBase: { steal: 0.62, dreb: 0.19, made: 0.035, ft: 0.03, deadTO: 0.03, start: 0, orb: 0 } as Record<string, number>,
  setup: { made: 8.6, dreb: 4.9, steal: 2.0, ft: 8.4, deadTO: 8.0, start: 5.6, orb: 1.0 } as Record<string, number>,
  actionTime: 7.0,
  continueBase: 0.38,
  injuryRate: 0.00042,
  drain: 0.00068,
  recover: 0.0012,
  home: 0.007,
  usageExp: 2.0,
  usageDamp: 5,
  freedomGreen: 1.25,
  freedomLimited: 0.55,
};

// ---------------------------------------------------------------- internal state

interface Box {
  sec: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pts: number;
  pm: number;
  rimM: number;
  rimA: number;
  midM: number;
  midA: number;
  onPoss: number;
  onPF: number;
  onPA: number;
  tFga: number;
  tFta: number;
  tTov: number;
}

const newBox = (): Box => ({
  sec: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
  pts: 0, pm: 0, rimM: 0, rimA: 0, midM: 0, midA: 0, onPoss: 0, onPF: 0, onPA: 0, tFga: 0, tFta: 0, tTov: 0,
});

export interface SP {
  pid: number;
  name: string; // display (last name)
  full: string;
  pos: Pos;
  jersey: string;
  r: Ratings;
  c: Composites;
  role: OffRole;
  freedom: number; // usage multiplier from shot freedom
  energy: number;
  fouls: number;
  on: boolean;
  out: 0 | 1 | 2; // 0 ok, 1 fouled out, 2 injured
  starter: boolean;
  ftPct: number;
  hot: number;
  perf: number; // morale/wear multiplier around 1
  guard: boolean;
  big: boolean;
  stint: number;
  /** Tendencies: usage, three, drive, pass multipliers. */
  tu: number;
  t3: number;
  td: number;
  tp: number;
  /** hidden event tendencies: blocks, steals, offensive / defensive boards, turnovers */
  tbk: number;
  tsl: number;
  tor: number;
  tdr: number;
  ttv: number;
  tpf: number;
  /** usage share above which defenses load up: real players carry their own fitted usage */
  useCap: number;
  useDamp: number;
  b: Box;
  injured?: boolean;
  /** Played at least a second. */
  played: boolean;
  dnp?: string;
}

export interface ST {
  side: 0 | 1;
  tid: number;
  team: Team;
  t: Tactics;
  players: SP[];
  on: SP[];
  plan: number[][];
  score: number;
  qs: number[];
  timeouts: number;
  fouls: number; // team fouls this period
  foulsLast2: number;
  tot: TeamTotals;
  poss: number;
  pt: Record<string, { poss: number; pts: number }>;
  ex: TeamBox['extra'];
  run: number; // unanswered points
  // caches for current lineup
  spacing: number;
  passQ: number;
  helpQ: number;
  anchor: SP | null; // best rim protector on floor
  speed: number;
  /** guardOf[offensePid] = my defender (filled on the DEFENSIVE team). */
  guardOf: Map<number, SP>;
  lineupKey: string;
  ls: LineupStat | null;
  cap: Record<ActionType, number>;
  subSig: string;
  manualSubs: boolean; // user drives subs live
  injMult: number;
  subLock: Map<number, number>; // pid -> game second until which a manual sub sticks
}

export interface SimTeamInput {
  team: Team;
  players: Player[];
  /** Team-specific injury risk multiplier (practice intensity, medical staff). */
  injuryMult?: number;
  /** Per-player performance multipliers (morale, wear), ~0.95..1.03. */
  perf?: Record<number, number>;
  /** Players held out (rest / coach decision). */
  rest?: number[];
}

export interface SimOptions {
  rng: Rng;
  type: GameType;
  record?: boolean;
  neutral?: boolean;
  injuries?: boolean;
  injuryMult?: number;
  /** Disable end-of-game fouling and timeouts (fast lab sims keep them on). */
  simple?: boolean;
  /** Keep shot locations even when not recording play-by-play. */
  keepShots?: boolean;
}

export interface InGameInjury {
  pid: number;
  tid: number;
  q: number;
}

type Ctx = 'start' | 'made' | 'dreb' | 'steal' | 'ft' | 'deadTO' | 'orb';

interface ShotOpts {
  shooter: SP;
  zone: ShotZone;
  open: number;
  contest: SP | null;
  assister: SP | null;
  finish: FinishType;
  /** openness contributions per impact tag */
  tags?: [string, number][];
  pullup?: boolean;
  forcedFoulMult?: number;
}

const ACTION_LIST: ActionType[] = ['pnr', 'iso', 'post', 'handoff', 'motion'];

/** All 120 orderings of five defenders. */
const PERMS5: number[][] = (() => {
  const out: number[][] = [];
  const rec = (cur: number[], rest: number[]) => {
    if (!rest.length) return void out.push(cur);
    for (let i = 0; i < rest.length; i++) rec([...cur, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)]);
  };
  rec([], [0, 1, 2, 3, 4]);
  return out;
})();

function shortName(p: Player) {
  return p.lastName || p.firstName;
}

// ---------------------------------------------------------------- engine

export class GameSim {
  T: [ST, ST];
  rng: Rng;
  opts: SimOptions;
  q = 1;
  clock: number = GAME.quarterSec;
  elapsed = 0; // game seconds elapsed
  poss: 0 | 1 = 0;
  ctx: Ctx = 'start';
  tipWinner: 0 | 1 = 0;
  over = false;
  record: boolean;
  logs: PossLog[] = [];
  pbp: PbpEntry[] = [];
  shots: ShotRecord[] = [];
  flow: number[] = [];
  impacts = new Map<string, TacticImpact>();
  private impactSlots = new Map<string, (TacticImpact | null)[]>();
  lineups = new Map<string, LineupStat>();
  injuries: InGameInjury[] = [];
  private cur: PossLog | null = null;
  private lastShooter: SP | null = null;
  private lastFinish: FinishType = 'misc';
  private possPts = 0;
  private possCtxForTOPts: Ctx = 'start';
  private secondChance = false;

  constructor(home: SimTeamInput, away: SimTeamInput, opts: SimOptions) {
    this.rng = opts.rng;
    this.opts = opts;
    this.record = !!opts.record;
    this.T = [this.makeTeam(home, 0), this.makeTeam(away, 1)];
    for (const t of this.T) {
      t.plan = this.makePlan(t);
      this.setLineup(t, this.initialLineup(t));
    }
    this.refreshMatchups();
    // opening tip: size + explosiveness of the centers
    const jumper = (t: ST) => t.on.reduce((best, p) => (p.r.hgt + p.r.ath > best.r.hgt + best.r.ath ? p : best), t.on[0]);
    const j0 = jumper(this.T[0]);
    const j1 = jumper(this.T[1]);
    const p0 = clamp(0.5 + (j0.r.hgt + j0.r.ath - j1.r.hgt - j1.r.ath) / 200, 0.2, 0.8);
    this.tipWinner = this.rng.chance(p0) ? 0 : 1;
    this.poss = this.tipWinner;
    this.addPbp(-1, `Start of 1st quarter. ${this.T[this.tipWinner].team.abbrev} wins the tip.`, 'period');
  }

  // ------------------------------------------------------------ setup

  private makeTeam(input: SimTeamInput, side: 0 | 1): ST {
    const tactics = cloneTactics(input.team.tactics);
    const rot = input.team.rotation;
    const orderIdx = new Map<number, number>();
    rot.order.forEach((pid, i) => orderIdx.set(pid, i));
    const roster = [...input.players].sort((a, b) => (orderIdx.get(a.pid) ?? 99 + (100 - a.ovr)) - (orderIdx.get(b.pid) ?? 99 + (100 - b.ovr)));
    const rest = new Set(input.rest ?? []);
    const players: SP[] = roster.map((p) => {
      const role = tactics.offense.roles[p.pid] ?? archetype(p.ratings).role;
      const fr = tactics.offense.freedom[p.pid] ?? 0;
      const sp: SP = {
        pid: p.pid,
        name: shortName(p),
        full: `${p.firstName} ${p.lastName}`.trim(),
        pos: p.pos,
        jersey: p.jersey,
        r: p.ratings,
        c: composites(p.ratings),
        role,
        freedom: fr === 1 ? K.freedomGreen : fr === -1 ? K.freedomLimited : 1,
        energy: 1,
        fouls: 0,
        on: false,
        out: 0,
        starter: false,
        ftPct: clamp(0.42 + 0.0052 * p.ratings.ft, 0.3, 0.95),
        hot: 0,
        perf: input.perf?.[p.pid] ?? 1,
        guard: p.ratings.hnd >= 55 || p.pos === 'PG' || p.pos === 'SG',
        big: p.ratings.hgt >= 60 || p.pos === 'C',
        stint: 0,
        tu: p.tend?.use ?? 1,
        t3: p.tend?.three ?? 1,
        td: p.tend?.drive ?? 1,
        tp: p.tend?.pass ?? 1,
        tbk: p.tend?.blk ?? 1,
        tsl: p.tend?.stl ?? 1,
        tor: p.tend?.orb ?? 1,
        tdr: p.tend?.drb ?? 1,
        ttv: p.tend?.tov ?? 1,
        tpf: p.tend?.pf ?? 1,
        useCap: p.tend ? 0.38 : 0.3,
        useDamp: p.tend ? K.usageDamp : 7,
        b: newBox(),
        played: false,
      };
      if (p.injury && p.injury.gamesRemaining > 0) {
        sp.out = 2;
        sp.dnp = `Injured (${p.injury.type})`;
      } else if (rest.has(p.pid)) {
        sp.out = 2;
        sp.dnp = 'Rest';
      }
      return sp;
    });
    return {
      side,
      tid: input.team.tid,
      team: input.team,
      t: tactics,
      players,
      on: [],
      plan: [],
      score: 0,
      qs: [0],
      timeouts: GAME.timeouts,
      fouls: 0,
      foulsLast2: 0,
      tot: { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0 },
      poss: 0,
      pt: {},
      ex: { biggestLead: 0, fastBreak: 0, paint: 0, secondChance: 0, offTov: 0, bench: 0 },
      run: 0,
      spacing: 50,
      passQ: 50,
      helpQ: 50,
      anchor: null,
      speed: 50,
      guardOf: new Map(),
      lineupKey: '',
      ls: null,
      cap: { pnr: 1, iso: 1, post: 1, handoff: 1, motion: 1 },
      injMult: input.injuryMult ?? 1,
      subSig: '',
      manualSubs: false,
      subLock: new Map(),
    };
  }

  private available(t: ST): SP[] {
    return t.players.filter((p) => p.out === 0);
  }

  private makePlan(t: ST): number[][] {
    const rot = t.team.rotation;
    const avail = this.available(t);
    if (avail.length === 0) return [];
    const inOrder = new Map(rot.order.map((pid, i) => [pid, i]));
    // starters are the first five available in the depth order
    const ordered = [...avail].sort((a, b) => (inOrder.get(a.pid) ?? 99) - (inOrder.get(b.pid) ?? 99));
    const starters = new Set(ordered.slice(0, 5).map((p) => p.pid));
    // minutes: redistribute unavailable players' minutes down the depth chart
    const missing = t.players
      .filter((p) => p.out !== 0)
      .reduce((a, p) => a + (rot.minutes[p.pid] ?? 0), 0);
    const mins = ordered.map((p) => rot.minutes[p.pid] ?? 0);
    let toGive = missing;
    if (toGive > 0) {
      // give to the next bench players first (those with low minutes), then spread
      for (let i = 0; i < mins.length && toGive > 0; i++) {
        if (i < 5) continue;
        const add = Math.min(toGive, Math.max(0, 22 - mins[i]));
        mins[i] += add;
        toGive -= add;
      }
      for (let i = 0; i < mins.length && toGive > 0; i++) {
        const add = Math.min(toGive, Math.max(0, 38 - mins[i]));
        mins[i] += add;
        toGive -= add;
      }
    }
    // starters missing from order with zero minutes get sensible defaults
    ordered.forEach((p, i) => {
      if (starters.has(p.pid) && mins[i] < 16) mins[i] = 24;
      const cap = rot.caps[p.pid];
      if (cap && mins[i] > cap) mins[i] = cap;
    });
    const closerSet = new Set(rot.closers.filter((pid) => avail.some((p) => p.pid === pid)));
    if (closerSet.size < 5) {
      for (const p of ordered) {
        if (closerSet.size >= 5) break;
        closerSet.add(p.pid);
      }
    }
    const planPlayers: PlanPlayer[] = ordered.map((p, i) => ({
      pid: p.pid,
      minutes: mins[i],
      starter: starters.has(p.pid),
      closer: closerSet.has(p.pid),
      guard: p.guard,
      big: p.big,
      endurance: p.r.end,
    }));
    for (const p of ordered) p.starter = starters.has(p.pid);
    return buildMinutePlan(planPlayers);
  }

  private initialLineup(t: ST): SP[] {
    const ids = t.plan[0] ?? [];
    const byId = new Map(t.players.map((p) => [p.pid, p]));
    const lineup = ids.map((id) => byId.get(id)!).filter(Boolean);
    const avail = this.available(t);
    for (const p of avail) {
      if (lineup.length >= 5) break;
      if (!lineup.includes(p)) lineup.push(p);
    }
    // extreme emergency: fewer than 5 healthy players -> bring back injured/rested
    for (const p of t.players) {
      if (lineup.length >= 5) break;
      if (!lineup.includes(p)) {
        p.out = 0;
        lineup.push(p);
      }
    }
    return lineup.slice(0, 5);
  }

  private setLineup(t: ST, lineup: SP[]) {
    for (const p of t.on) p.on = false;
    t.on = lineup;
    for (const p of lineup) {
      p.on = true;
      p.played = true;
    }
    this.updateCaches(t);
  }

  private updateCaches(t: ST) {
    const on = t.on;
    t.spacing = on.reduce((a, p) => a + p.c.spacing, 0) / on.length;
    const passes = on.map((p) => p.c.passing).sort((a, b) => b - a);
    t.passQ = (passes[0] * 0.45 + passes[1] * 0.35 + passes[2] * 0.2) || 50;
    t.helpQ = on.reduce((a, p) => a + p.c.helpD, 0) / on.length;
    t.anchor = on.reduce<SP | null>((best, p) => (!best || p.c.rimProt > best.c.rimProt ? p : best), null);
    t.speed = on.reduce((a, p) => a + p.r.spd, 0) / on.length;
    t.lineupKey = on.map((p) => p.pid).sort((a, b) => a - b).join('-');
    t.ls = null;
    for (const a of ACTION_LIST) t.cap[a] = this.capability(t, a);
  }

  /** Assign defenders (on the defensive team) to each offensive player. */
  private assignMatchups(def: ST, off: ST) {
    def.guardOf.clear();
    const O = off.on;
    const D = def.on;
    if (O.length < 5 || D.length < 5) {
      O.forEach((o, i) => def.guardOf.set(o.pid, D[i % D.length]));
      return;
    }
    const manual = def.t.defense.matchups;
    // threat: how much the offense runs through him
    const threat = O.map((o) => this.usageWeight(o, off, 'iso') + this.usageWeight(o, off, 'pnr'));
    const maxThreat = Math.max(...threat) || 1;
    // cost[i][j]: defender j guarding offensive player i
    const cost: number[] = new Array(25);
    for (let i = 0; i < 5; i++) {
      const o = O[i];
      const m = manual[o.pid];
      for (let j = 0; j < 5; j++) {
        const d = D[j];
        let c = Math.abs(o.r.hgt - d.r.hgt) * 0.09;
        const quality = o.big ? d.c.intDef : d.c.perDef;
        c -= (threat[i] / maxThreat) * (quality - 50) * 0.06;
        if (m !== undefined) c += m === d.pid ? -50 : 4;
        cost[i * 5 + j] = c;
      }
    }
    let best = PERMS5[0];
    let bestCost = Infinity;
    for (const p of PERMS5) {
      const c = cost[p[0]] + cost[5 + p[1]] + cost[10 + p[2]] + cost[15 + p[3]] + cost[20 + p[4]];
      if (c < bestCost) {
        bestCost = c;
        best = p;
      }
    }
    O.forEach((o, i) => def.guardOf.set(o.pid, D[best[i]]));
  }

  refreshMatchups() {
    this.assignMatchups(this.T[1], this.T[0]);
    this.assignMatchups(this.T[0], this.T[1]);
  }

  // ------------------------------------------------------------ public control API (live games)

  setTactics(side: 0 | 1, tactics: Tactics) {
    const t = this.T[side];
    t.t = cloneTactics(tactics);
    for (const p of t.players) {
      p.role = t.t.offense.roles[p.pid] ?? p.role;
      const fr = t.t.offense.freedom[p.pid] ?? 0;
      p.freedom = fr === 1 ? K.freedomGreen : fr === -1 ? K.freedomLimited : 1;
    }
    this.refreshMatchups();
  }

  /** Manual substitution from the live game UI. */
  substitute(side: 0 | 1, outPid: number, inPid: number) {
    const t = this.T[side];
    const outP = t.on.find((p) => p.pid === outPid);
    const inP = t.players.find((p) => p.pid === inPid && !p.on && p.out === 0);
    if (!outP || !inP) return false;
    const lineup = t.on.map((p) => (p === outP ? inP : p));
    this.applySub(t, lineup);
    t.subLock.set(inPid, this.elapsed + 240);
    t.subLock.set(outPid, this.elapsed + 240);
    return true;
  }

  callTimeout(side: 0 | 1, reason = '') {
    const t = this.T[side];
    if (t.timeouts <= 0) return false;
    t.timeouts--;
    for (const tm of this.T) for (const p of tm.players) p.energy = Math.min(1, p.energy + (p.on ? 0.05 : 0.02));
    this.T[0].run = 0;
    this.T[1].run = 0;
    this.addPbp(side, `Timeout ${t.team.abbrev}${reason ? ` (${reason})` : ''}.`, 'timeout');
    if (this.cur) this.cur.steps.push({ k: 'timeout' });
    this.checkSubs(this.T[0], true);
    this.checkSubs(this.T[1], true);
    return true;
  }

  // ------------------------------------------------------------ main loop

  /** Simulate one possession. Returns false when the game is over. */
  step(): boolean {
    if (this.over) return false;
    if (this.clock <= 0.05) {
      if (!this.endPeriod()) return false;
    }
    // substitutions at stoppages
    if (this.ctx !== 'steal' && this.ctx !== 'dreb' && this.ctx !== 'orb') {
      this.checkSubs(this.T[0]);
      this.checkSubs(this.T[1]);
    } else if (this.rng.chance(0.15)) {
      // emergency fatigue subs happen eventually even during long stretches
      this.checkSubs(this.T[0]);
      this.checkSubs(this.T[1]);
    }
    if (!this.opts.simple) this.autoTimeouts();
    this.possession();
    return !this.over;
  }

  simToEnd(): GameResult {
    let guard = 0;
    while (this.step() && guard++ < 2000);
    return this.result();
  }

  private endPeriod(): boolean {
    const [h, a] = this.T;
    if (this.q >= 4 && h.score !== a.score) {
      this.over = true;
      this.addPbp(-1, `End of game. ${h.team.abbrev} ${h.score}, ${a.team.abbrev} ${a.score}.`, 'period');
      return false;
    }
    const label = this.q <= 4 ? `${ordinal(this.q)} quarter` : `OT${this.q - 4 > 1 ? this.q - 4 : ''}`;
    this.addPbp(-1, `End of ${label}. ${h.team.abbrev} ${h.score}, ${a.team.abbrev} ${a.score}.`, 'period');
    this.q++;
    this.clock = this.q <= 4 ? GAME.quarterSec : GAME.otSec;
    for (const t of this.T) {
      t.fouls = 0;
      t.foulsLast2 = 0;
      t.qs.push(0);
      if (this.q === 4) t.timeouts = Math.min(t.timeouts, 4);
      if (this.q >= 5) t.timeouts = 2;
      for (const p of t.players) {
        p.energy = Math.min(1, p.energy + (this.q === 3 ? 0.3 : 0.1));
        p.stint = 0;
      }
    }
    // possession arrow: loser of tip gets Q2 & Q3, winner Q4; OT is a jump
    if (this.q === 2 || this.q === 3) this.poss = (1 - this.tipWinner) as 0 | 1;
    else if (this.q === 4) this.poss = this.tipWinner;
    else this.poss = this.rng.chance(0.5) ? 0 : 1;
    this.ctx = 'start';
    this.T[0].run = 0;
    this.T[1].run = 0;
    this.checkSubs(this.T[0], true);
    this.checkSubs(this.T[1], true);
    const label2 = this.q <= 4 ? `${ordinal(this.q)} quarter` : `overtime`;
    this.addPbp(-1, `Start of ${label2}.`, 'period');
    return true;
  }

  // ------------------------------------------------------------ substitutions

  private planSlot(): number {
    const reg = Math.min(this.elapsed, 2880 - 0.001);
    return Math.min(47, Math.floor(reg / 60));
  }

  private foulLimit(t: ST): number {
    const mode = t.t.manage.foulTrouble;
    const q = Math.min(this.q, 4);
    const base = q + 1; // 2 in Q1, 3 in Q2, 4 in Q3, 5 in Q4
    return mode === 'strict' ? base - (q === 1 ? 0 : 1) : mode === 'loose' ? base + 1 : base;
  }

  private desiredLineup(t: ST): SP[] {
    const byId = new Map(t.players.map((p) => [p.pid, p]));
    const avail = (p: SP) => p.out === 0;
    let desired: SP[];
    const margin = Math.abs(this.T[0].score - this.T[1].score);
    const garbage =
      t.t.manage.garbageTime && this.q >= 4 && ((this.clock < 300 && margin >= 22) || (this.clock < 150 && margin >= 16));
    const ordered = t.players.filter(avail);
    if (garbage && ordered.length >= 8) {
      // deep bench finishes blowouts
      desired = ordered.slice(-5);
      if (!desired.some((p) => p.guard)) {
        const g = ordered.slice(5).find((p) => p.guard && !desired.includes(p));
        if (g) desired[0] = g;
      }
      return desired;
    }
    if (this.q <= 4) {
      const slot = t.plan[this.planSlot()] ?? [];
      desired = slot.map((pid) => byId.get(pid)!).filter((p) => p && avail(p));
    } else {
      // overtime: closers / best players with energy
      const closers = t.team.rotation.closers.map((pid) => byId.get(pid)).filter((p): p is SP => !!p && avail(p));
      desired = closers.length >= 5 ? closers.slice(0, 5) : [...closers];
      for (const p of ordered) {
        if (desired.length >= 5) break;
        if (!desired.includes(p)) desired.push(p);
      }
    }
    // foul trouble: bench players at the limit (except crunch time)
    const crunch = this.q >= 4 && this.clock < 360;
    const limit = this.foulLimit(t);
    desired = desired.filter((p) => crunch || p.fouls < limit);
    // fatigue: swap exhausted players for rested teammates of the same type
    const fatigueLine = t.t.manage.fatigueSub;
    const bench = ordered.filter((p) => !desired.includes(p) && (crunch || p.fouls < limit));
    desired = desired.map((p) => {
      if (p.energy >= fatigueLine || crunch) return p;
      const alt = bench
        .filter((b) => b.energy > 0.82 && b.big === p.big)
        .sort((a, b) => b.c.helpD + b.c.create - (a.c.helpD + a.c.create))[0];
      if (alt) {
        bench.splice(bench.indexOf(alt), 1);
        return alt;
      }
      return p;
    });
    // fill to five from the bench in depth order, preferring positional balance
    for (const p of bench) {
      if (desired.length >= 5) break;
      if (!desired.includes(p)) desired.push(p);
    }
    // last resort: allow players over the foul limit
    for (const p of ordered) {
      if (desired.length >= 5) break;
      if (!desired.includes(p)) desired.push(p);
    }
    return desired.slice(0, 5);
  }

  private subSignature(t: ST): string {
    const fl = t.t.manage.fatigueSub;
    let sig = `${this.q <= 4 ? this.planSlot() : 'ot' + this.q}|${this.foulLimit(t)}|`;
    for (const p of t.players) sig += p.out + (p.on ? (p.energy < fl ? 'f' : 'o') : p.energy > 0.82 ? 'r' : 'b') + p.fouls;
    const margin = Math.abs(this.T[0].score - this.T[1].score);
    if (this.q >= 4 && this.clock < 360) sig += `c${margin >= 16 ? (this.clock < 300 ? 'g' : 'x') : ''}`;
    return sig;
  }

  private checkSubs(t: ST, force = false) {
    if (!force) {
      const sig = this.subSignature(t);
      if (sig === t.subSig && !t.subLock.size) return;
      t.subSig = sig;
    }
    if (t.manualSubs && !force) {
      // still replace players who can't continue
      const broken = t.on.filter((p) => p.out !== 0);
      if (!broken.length) return;
    }
    let desired = this.desiredLineup(t);
    if (desired.length < 5) return;
    // respect manual sub locks
    const locked = (p: SP) => (t.subLock.get(p.pid) ?? -1) > this.elapsed;
    if (t.manualSubs || t.subLock.size) {
      const keep = t.on.filter((p) => p.out === 0 && (t.manualSubs || locked(p)));
      const lockedOut = new Set(
        t.players.filter((p) => !p.on && locked(p)).map((p) => p.pid),
      );
      const rest = desired.filter((p) => !keep.includes(p) && !lockedOut.has(p.pid));
      desired = [...keep, ...rest].slice(0, 5);
      if (desired.length < 5) {
        for (const p of t.players) {
          if (desired.length >= 5) break;
          if (p.out === 0 && !desired.includes(p)) desired.push(p);
        }
      }
    }
    const same = desired.length === t.on.length && desired.every((p) => p.on);
    if (same) return;
    this.applySub(t, desired);
  }

  private applySub(t: ST, lineup: SP[]) {
    const outs = t.on.filter((p) => !lineup.includes(p));
    const ins = lineup.filter((p) => !p.on);
    if (!outs.length && !ins.length) return;
    this.setLineup(t, lineup);
    for (const p of ins) p.stint = 0;
    this.refreshMatchups();
    if (this.record && ins.length) {
      const text = ins.map((p, i) => `${p.name} in${outs[i] ? ` for ${outs[i].name}` : ''}`).join(', ');
      this.addPbp(t.side, `${t.team.abbrev} sub: ${text}.`, 'sub');
    }
  }

  private autoTimeouts() {
    for (const t of this.T) {
      const opp = this.T[1 - t.side];
      if (!t.t.manage.autoTimeouts || t.manualSubs) continue;
      const late = this.q >= 4 && this.clock < 120;
      const reserve = late ? 0 : this.q >= 4 ? 1 : 2;
      if (opp.run >= t.t.manage.timeoutRun && t.timeouts > reserve) {
        this.callTimeout(t.side, `${opp.run}-0 run`);
      }
    }
  }

  // ------------------------------------------------------------ time

  private tick(dt: number) {
    if (dt <= 0) return;
    if (dt > this.clock) dt = this.clock;
    this.clock -= dt;
    this.elapsed += dt;
    for (const t of this.T) {
      const press = this.T[1 - t.side].t.defense.press !== 'none' || t.t.defense.press !== 'none';
      const paceMult = 0.9 + (t.t.offense.pace / 100) * 0.2;
      for (const p of t.players) {
        if (p.on) {
          p.b.sec += dt;
          p.stint += dt;
          let drain = K.drain * (1.4 - 0.75 * (p.r.end / 100)) * paceMult;
          if (press) drain *= 1.15;
          if (t.t.defense.press === 'always') drain *= 1.12;
          p.energy = Math.max(0.2, p.energy - drain * dt);
        } else if (p.out === 0 || p.out === 1) {
          p.energy = Math.min(1, p.energy + K.recover * dt);
        }
      }
    }
    for (const t of this.T) {
      const ls = this.lineupStat(t);
      ls.sec += dt;
    }
  }

  private lineupStat(t: ST): LineupStat {
    if (t.ls) return t.ls;
    const key = `${t.side}:${t.lineupKey}`;
    let ls = this.lineups.get(key);
    if (!ls) {
      ls = { t: t.side, pids: t.on.map((p) => p.pid), poss: 0, ptsFor: 0, ptsAgainst: 0, sec: 0 };
      this.lineups.set(key, ls);
    }
    t.ls = ls;
    return ls;
  }

  // ------------------------------------------------------------ usage

  private usageWeight(p: SP, t: ST, action: ActionType | 'any'): number {
    if (!p.on) return 0;
    const roleU = ROLE_USAGE[p.role];
    let skill: number;
    switch (action) {
      case 'pnr':
        skill = p.c.pnrHandle;
        if (p.role === 'roller' || p.role === 'stretch') skill *= 0.55;
        break;
      case 'iso':
        skill = 0.55 * p.c.create + 0.45 * Math.max(p.c.midShot, p.c.pu3, p.c.rim);
        break;
      case 'post':
        skill = p.c.postScore;
        break;
      case 'handoff':
        skill = p.c.offBall;
        break;
      case 'motion':
        skill = 0.5 * p.c.cut + 0.5 * p.c.c3;
        break;
      default:
        skill = (p.c.create + p.c.rim + p.c.c3) / 3;
    }
    let w = roleU * p.freedom * p.tu * Math.pow(Math.max(5, skill) / 50, K.usageExp) * (0.75 + 0.25 * p.energy) * p.perf;
    if (t.t.offense.hotHand && p.hot >= 3) w *= 1.25;
    // defenses load up on a high-usage player as the game goes on
    const teamUse = p.b.tFga + 0.44 * p.b.tFta + p.b.tTov;
    if (teamUse >= 12) {
      const share = (p.b.fga + 0.44 * p.b.fta + p.b.tov) / teamUse;
      if (share > p.useCap) w *= Math.exp(-p.useDamp * (share - p.useCap));
    }
    // star plan "deny": fewer touches
    const def = this.T[1 - t.side];
    if (def.t.defense.starPlan === 'deny' && this.starTarget(def, t) === p) w *= 0.62;
    return w;
  }

  private pickActor(t: ST, action: ActionType | 'any', exclude?: SP): SP {
    const ws = t.on.map((p) => (p === exclude ? 0 : this.usageWeight(p, t, action)));
    // mismatch hunting: favor the player with the weakest defender
    if (t.t.offense.huntMismatch && (action === 'iso' || action === 'pnr')) {
      const def = this.T[1 - t.side];
      t.on.forEach((p, i) => {
        const d = def.guardOf.get(p.pid);
        if (d) ws[i] *= Math.exp(clamp((p.c.create - d.c.perDef) / 40, -0.5, 0.9));
      });
    }
    return t.on[this.rng.weighted(ws)];
  }

  private starTarget(def: ST, off: ST): SP | null {
    if (def.t.defense.starPlan === 'none') return null;
    if (def.t.defense.starTarget != null) {
      return off.on.find((p) => p.pid === def.t.defense.starTarget) ?? null;
    }
    // auto: the opponent's main creator on the floor
    let best: SP | null = null;
    let bw = 0;
    for (const p of off.on) {
      const w = ROLE_USAGE[p.role] * p.freedom * (p.c.create + p.c.pnrHandle + p.c.postScore);
      if (w > bw) {
        bw = w;
        best = p;
      }
    }
    return best;
  }

  private defOf(def: ST, o: SP): SP {
    return def.guardOf.get(o.pid) ?? def.on[0];
  }

  // ------------------------------------------------------------ impacts

  /**
   * Record an expected-points effect. `benefit` is the side the effect is meant to help;
   * negative pts flip it to the other side. Keys are stored with the beneficiary's role in
   * the possession (':o' offense, ':d' defense) so reports can phrase them correctly.
   */
  private impact(key: string, benefit: 0 | 1, pts: number, pid?: number) {
    if (!pts) return;
    if (pts < 0) {
      benefit = (1 - benefit) as 0 | 1;
      pts = -pts;
    }
    const roleO = benefit === this.poss;
    let slots = this.impactSlots.get(key);
    if (!slots) {
      slots = [null, null, null, null];
      this.impactSlots.set(key, slots);
    }
    const si = benefit * 2 + (roleO ? 0 : 1);
    let im = slots[si];
    if (!im) {
      const full = `${key}:${roleO ? 'o' : 'd'}`;
      im = { key: full, t: benefit, count: 0, pts: 0, players: {} };
      slots[si] = im;
      this.impacts.set(`${full}|${benefit}`, im);
    }
    im.count++;
    im.pts += pts;
    if (pid !== undefined) im.players[pid] = (im.players[pid] ?? 0) + 1;
  }

  // ------------------------------------------------------------ possession

  private possession() {
    const o = this.poss;
    const off = this.T[o];
    const def = this.T[1 - o];
    const ctx = this.ctx;
    this.possPts = 0;
    this.secondChance = false;
    this.possCtxForTOPts = ctx;
    const clockStart = this.clock;
    if (this.record) {
      this.cur = {
        off: o,
        q: this.q,
        clockStart,
        clockEnd: clockStart,
        kind: 'half',
        steps: [],
        pts: 0,
        score: [this.T[0].score, this.T[1].score],
        label: '',
        lines: [],
        on: [this.T[0].on.map((p) => p.pid), this.T[1].on.map((p) => p.pid)],
        guards: Object.fromEntries(off.on.map((p) => [p.pid, this.defOf(def, p).pid])),
        scheme: def.t.defense.scheme,
        help: def.t.defense.help,
      };
    }
    off.poss++;
    for (const p of off.on) p.b.onPoss++;
    const ls = this.lineupStat(off);
    ls.poss++;

    // ---- end-of-game: intentional fouls by the defense
    if (!this.opts.simple && this.intentionalFoul(off, def)) return;

    const late = this.lateMode(off, def);
    const paceF = 1.12 - 0.24 * (off.t.offense.pace / 100);

    // ---- full court press
    let pressBroken = false;
    const pressOn =
      def.t.defense.press === 'always' || (def.t.defense.press === 'afterMade' && (ctx === 'made' || ctx === 'ft'));
    if (pressOn && (ctx === 'made' || ctx === 'ft' || ctx === 'deadTO' || ctx === 'start') && !late.hold) {
      const res = this.press(off, def);
      if (res === 'to') return;
      pressBroken = res === 'broken';
    }

    // ---- transition
    let transP = (K.transitionBase[ctx] ?? 0) * (0.55 + 0.9 * (off.t.offense.transition / 100));
    transP *= 1 + (off.speed - def.speed) / 120;
    const getBack = def.t.defense.getBack / 100;
    transP *= 1.25 - 0.5 * getBack;
    // crashing the offensive glass leaves you exposed (defense team crashed on its last possession)
    const crashLeak = (def.t.offense.crashBoards - 50) / 50;
    if (ctx === 'dreb') transP *= 1 + 0.35 * crashLeak;
    if (pressBroken) transP = 0.75;
    if (late.hold || late.milk) transP *= 0.2;
    if (ctx === 'dreb' && crashLeak !== 0) {
      // the defense crashing changes the odds of a run-out: value ~ +0.25 pts per transition
      const dp = (K.transitionBase.dreb * 0.35 * crashLeak) * 0.25;
      this.impact('crash_leak', o, dp);
    }
    if (ctx === 'dreb' || ctx === 'steal') {
      const dpGetBack = (K.transitionBase[ctx] ?? 0) * (0.5 * (getBack - 0.5)) * 0.25;
      this.impact('getback', (1 - o) as 0 | 1, dpGetBack);
    }

    if (this.clock > 2 && this.rng.chance(clamp(transP, 0, 0.85))) {
      this.transition(off, def, ctx, pressBroken);
      return;
    }

    // ---- half court
    if (this.cur) this.cur.kind = 'half';
    let setup = (K.setup[ctx] ?? 4) * paceF * this.rng.uniform(0.75, 1.25);
    if (late.milk) setup += 6;
    if (late.hold) {
      // run the clock down for a last shot
      setup = Math.max(setup, this.clock - 6.5);
    }
    if (late.quick) setup = Math.min(setup, 2.5);
    let shotClock = GAME.shotClock - (ctx === 'orb' ? 10 : 0);
    if (this.record) this.cur!.steps.push({ k: 'advance', pid: off.on.reduce((a, p) => (p.c.pnrHandle > a.c.pnrHandle ? p : a), off.on[0]).pid });
    setup = Math.min(setup, shotClock - 4);
    this.tick(setup);
    shotClock -= setup;
    if (this.clock <= 0.05) {
      this.finishPoss(off, def, 'misc');
      return;
    }
    this.halfCourt(off, def, shotClock, late, paceF);
  }

  private lateMode(off: ST, def: ST) {
    const diff = off.score - def.score;
    const final = this.q >= 4;
    const clock = this.clock;
    const res = { hold: false, quick: false, milk: false, need3: false };
    if (final && clock <= 26 && diff >= -2 && diff <= 0) res.hold = true;
    else if (!final && clock <= 24 && clock > 3) res.hold = true;
    else if (final && clock < 50 && diff > 0) res.milk = true;
    if (final && clock <= 35 && diff <= -3 && diff >= -5) res.need3 = true;
    if (final && clock <= 12 && diff === -3) res.need3 = true;
    if (off.t.manage.twoForOne && clock >= 29 && clock <= 40 && !(final && diff > 0)) res.quick = true;
    return res;
  }

  private intentionalFoul(off: ST, def: ST): boolean {
    const final = this.q >= 4;
    const clock = this.clock;
    const defDiff = def.score - off.score;
    let fouled: SP | null = null;
    let tag = '';
    if (final && def.t.manage.foulWhenTrailing && defDiff < 0) {
      const down = -defDiff;
      if ((down >= 4 && down <= 9 && clock <= 50 && clock > 1) || (down <= 3 && clock <= 24 && clock > 1.2)) {
        // offense gets the ball to its best free throw shooters
        const ws = off.on.map((p) => Math.pow(p.ftPct, 6) * (0.5 + p.c.ballSec / 100));
        fouled = off.on[this.rng.weighted(ws)];
        tag = 'late_foul';
      }
    }
    if (!fouled && final && def.t.manage.foulUp3 && defDiff === 3 && clock <= 7 && clock >= 1.5 && def.fouls >= 0) {
      const ws = off.on.map((p) => this.usageWeight(p, off, 'any'));
      fouled = off.on[this.rng.weighted(ws)];
      tag = 'foul_up3';
    }
    const hack = def.t.manage.hackThreshold;
    if (!fouled && hack > 0 && !(final && clock < 120) && this.rng.chance(0.8)) {
      const target = off.on
        .filter((p) => p.ftPct * 100 < hack)
        .sort((a, b) => a.ftPct - b.ftPct)[0];
      if (target) {
        fouled = target;
        tag = 'hack';
      }
    }
    if (!fouled) return false;
    // late-game fouls come right on the catch; never let them run out the clock
    const dt = tag === 'hack' ? this.rng.uniform(3, 7) : Math.min(this.clock - 0.3, this.rng.uniform(0.6, 2.4));
    this.tick(Math.max(0.2, dt));
    const fouler = def.on.reduce((a, p) => (p.fouls < a.fouls ? p : a), def.on[0]);
    this.addFoul(def, fouler, false);
    if (this.cur) {
      this.cur.kind = 'ft';
      this.cur.label = tag === 'hack' ? `Hack-a-${fouled.name}` : 'Intentional foul';
      this.cur.steps.push({ k: 'foul', pid: fouler.pid, pid2: fouled.pid });
    }
    this.addPbp(def.side, `${fouler.name} intentional foul on ${fouled.name}.`, 'foul');
    if (tag === 'hack') {
      // expected value vs a normal possession (~1.12)
      this.impact('hack', def.side, 1.12 - fouled.ftPct * 2, fouled.pid);
    }
    // simplification: intentional fouls always send the fouled player to the line
    this.freeThrows(off, def, fouled, 2, tag === 'hack' ? 'hack' : undefined);
    return true;
  }

  // ------------------------------------------------------------ press

  private press(off: ST, def: ST): 'to' | 'broken' | 'neutral' {
    const handlers = [...off.on].sort((a, b) => b.c.ballSec - a.c.ballSec);
    const h = handlers[0];
    const trapQ = def.on.reduce((a, p) => a + p.c.steal + p.r.spd, 0) / (def.on.length * 2);
    const secQ = (h.c.ballSec + handlers[1].c.ballSec + off.passQ) / 3;
    const adv = (secQ - trapQ) / 20;
    const pTO = clamp(0.075 - adv * 0.035, 0.02, 0.16);
    const pBroken = clamp(0.2 + adv * 0.08, 0.06, 0.4);
    this.tick(this.rng.uniform(3, 6));
    if (this.cur) {
      this.cur.kind = 'press';
      this.cur.steps.push({ k: 'press', pid: h.pid });
    }
    // expected value accounting: TOs forced vs easy baskets given up
    this.impact('press_to', def.side, (pTO - 0.012) * 1.15);
    this.impact('press_break', off.side, pBroken * 0.28);
    const r = this.rng.next();
    if (r < pTO) {
      const stealer = def.on[this.rng.weighted(def.on.map((p) => p.c.steal * p.tsl))];
      this.turnover(off, def, h, stealer, 'press');
      return 'to';
    }
    if (r < pTO + pBroken) return 'broken';
    return 'neutral';
  }

  // ------------------------------------------------------------ transition

  private transition(off: ST, def: ST, ctx: Ctx, pressBroken: boolean) {
    if (this.cur) {
      this.cur.kind = 'transition';
      this.cur.label = pressBroken ? 'Press broken!' : ctx === 'steal' ? 'Run-out off the steal' : 'Transition';
    }
    const ws = off.on.map((p) => (p.r.spd + p.c.create * 0.6) * (p.guard ? 1.4 : 0.7));
    const h = off.on[this.rng.weighted(ws)];
    this.tick(this.rng.uniform(3, 6.5));
    if (this.record) this.cur!.steps.push({ k: 'transition', pid: h.pid });
    let adv = (off.speed - def.speed) / 25 + (ctx === 'steal' ? 0.7 : 0.15) + (pressBroken ? 0.6 : 0);
    adv -= (def.t.defense.getBack - 50) / 100;
    adv += this.rng.normal(0, 0.5);
    // turnover in the open floor
    const pTO = clamp((0.085 - (h.c.ballSec - 50) / 900) * h.ttv, 0.02, 0.18);
    if (this.rng.chance(pTO)) {
      const st = def.on[this.rng.weighted(def.on.map((p) => p.c.steal * p.tsl))];
      this.turnover(off, def, h, this.stealBy(st, 0.5), 'transition');
      return;
    }
    // shot selection
    const trailer = off.on.filter((p) => p !== h).sort((a, b) => b.c.c3 - a.c.c3)[0];
    const threePref = 0.5 + off.t.offense.threePoint / 100;
    const opts = [
      Math.pow(h.c.rim / 50, 1.5) * 0.6 * h.td * (1 + adv * 0.3), // attack rim
      Math.pow(trailer.c.c3 / 50, 2) * 0.55 * threePref * trailer.t3, // trailing three
      Math.pow(h.c.pu3 / 50, 2) * 0.35 * threePref * h.t3, // pull-up three
      1.0 * Math.pow(Math.max(5, h.c.passing) / 50, 1.2) * h.tp, // drop-off to a runner
    ];
    const c = this.rng.weighted(opts);
    const d = this.defOf(def, h);
    // value of the transition chance vs a half-court trip (~0.25 pts), attributed to pace/push
    this.impact('transition', off.side, 0.25 * ((off.t.offense.transition - 50) / 100 + 0.5));
    if (c === 0) {
      this.shoot(off, def, { shooter: h, zone: 'rim', open: -0.08 + adv * 0.3, contest: def.anchor, assister: null, finish: 'transition' });
    } else if (c === 1) {
      this.passStep(h, trailer);
      this.shoot(off, def, { shooter: trailer, zone: this.rng.chance(0.4) ? 'c3' : 'ab3', open: 0.08 + adv * 0.25, contest: this.defOf(def, trailer), assister: h, finish: 'transition' });
    } else if (c === 2) {
      this.shoot(off, def, { shooter: h, zone: 'ab3', open: 0.1 + adv * 0.2, contest: d, assister: null, finish: 'transition', pullup: true });
    } else {
      const runners = off.on.filter((p) => p !== h);
      const runner = runners[this.rng.weighted(runners.map((p) => p.c.rim + p.r.spd))];
      this.passStep(h, runner);
      this.shoot(off, def, { shooter: runner, zone: 'rim', open: 0.06 + adv * 0.3, contest: def.anchor, assister: h, finish: 'transition' });
    }
  }

  // ------------------------------------------------------------ half court

  private halfCourt(off: ST, def: ST, shotClock: number, late: ReturnType<GameSim['lateMode']>, paceF: number) {
    let carryOpen = 0;
    let ballFrom: SP | null = null;
    let forced = false;
    for (let n = 0; n < 6; n++) {
      if (this.clock <= 0.05) {
        this.finishPoss(off, def, 'misc');
        return;
      }
      const left = Math.min(shotClock, this.clock);
      forced = left <= 4.5 || n === 5;
      const action = forced ? (this.rng.chance(0.6) ? 'iso' : 'pnr') : this.chooseAction(off, def);
      let dt = forced ? Math.max(0.5, left - this.rng.uniform(0.3, 1.5)) : K.actionTime * paceF * this.rng.uniform(0.6, 1.4);
      if (late.quick && n === 0) dt = Math.min(dt, 3.5);
      let buzzer = false;
      if (dt >= left - 0.3) {
        dt = Math.max(0, left - this.rng.uniform(0.2, 0.9));
        buzzer = true;
      }
      this.tick(dt);
      shotClock -= dt;
      const urgency = buzzer || forced ? -0.45 : 0;
      const ctxOpen = carryOpen + urgency;
      const res = this.runAction(action, off, def, ctxOpen, ballFrom, late, forced || buzzer);
      if (res === 'done') return;
      // continue: ball reversed, maybe with a small residual advantage
      carryOpen = res.carry;
      ballFrom = res.ball;
      if (shotClock <= 0.3) {
        // shot clock violation
        this.turnover(off, def, res.ball ?? off.on[0], null, 'shotclock');
        return;
      }
    }
    this.finishPoss(off, def, 'misc');
  }

  private chooseAction(off: ST, def: ST): ActionType {
    const a = off.t.offense.actions;
    const ws = ACTION_LIST.map((act) => {
      const emph = Math.pow(Math.max(1, a[act]) / 50, 1.4);
      return emph * off.cap[act];
    });
    void def;
    return ACTION_LIST[this.rng.weighted(ws)];
  }

  /** How well the current lineup can run an action (0.2..~1.6). */
  private capability(t: ST, act: ActionType): number {
    const on = t.on;
    switch (act) {
      case 'pnr': {
        const h = Math.max(...on.map((p) => p.c.pnrHandle));
        return Math.pow(h / 55, 2);
      }
      case 'iso': {
        const c = Math.max(...on.map((p) => 0.55 * p.c.create + 0.45 * Math.max(p.c.midShot, p.c.pu3, p.c.rim)));
        return 0.4 * Math.pow(c / 60, 2.2);
      }
      case 'post': {
        const ps = Math.max(...on.map((p) => p.c.postScore));
        return 0.36 * Math.pow(ps / 62, 3);
      }
      case 'handoff': {
        const s = on.map((p) => p.c.offBall).sort((a, b) => b - a);
        return Math.pow((s[0] + s[1]) / 2 / 55, 2);
      }
      case 'motion':
        return 1.5 * Math.pow(((t.passQ + t.spacing) / 2) / 50, 1.5);
    }
  }

  private runAction(
    action: ActionType,
    off: ST,
    def: ST,
    open: number,
    ballFrom: SP | null,
    late: ReturnType<GameSim['lateMode']>,
    forced: boolean,
  ): 'done' | { carry: number; ball: SP | null } {
    if (this.cur && !this.cur.action) this.cur.action = action;
    switch (action) {
      case 'pnr':
        return this.pnr(off, def, open, late, forced);
      case 'iso':
        return this.iso(off, def, open, late, forced, null);
      case 'post':
        return this.post(off, def, open, forced, null);
      case 'handoff':
        return this.handoff(off, def, open, late, forced);
      case 'motion':
        return this.motion(off, def, open, ballFrom, late, forced);
    }
  }

  // shared helpers ------------------------------------------------

  private help(def: ST) {
    return (def.t.defense.help - 50) / 50; // -1 stay home .. +1 pack paint
  }
  private pressure(def: ST) {
    return (def.t.defense.pressure - 50) / 50;
  }
  private zone(def: ST) {
    return def.t.defense.scheme !== 'man';
  }
  private prefs(off: ST, late: ReturnType<GameSim['lateMode']>) {
    const t3 = off.t.offense.threePoint / 100;
    let three = 0.46 + 0.8 * t3;
    let mid = 1.45 - 0.95 * t3;
    const rim = 0.7 + 0.6 * (off.t.offense.rimAttack / 100);
    if (late.need3) {
      three *= 6;
      mid *= 0.1;
    }
    return { three, mid, rim: late.need3 ? rim * 0.15 : rim };
  }
  /** Defensive effectiveness modifier from fatigue. */
  private dq(p: SP) {
    return (0.86 + 0.14 * p.energy) * (0.97 + 0.03 * p.perf);
  }
  private spacingBonus(off: ST) {
    return (off.spacing - 45) / 100; // ~ -0.3..+0.35
  }
  private toChance(base: number, handler: SP, def: ST, extra = 0) {
    const pr = this.pressure(def);
    const p = base * (1 + 0.32 * pr) * (1 - (handler.c.ballSec - 50) / 140) * handler.ttv + extra;
    if (pr !== 0) this.impact('pressure_to', def.side, base * 0.32 * pr * 1.05, handler.pid);
    return clamp(p, 0.01, 0.4);
  }
  /** Live-ball steal by `d` with base chance `base`, scaled by his steal tendency; else a dead-ball turnover. */
  private stealBy(d: SP, base: number): SP | null {
    return this.rng.chance(clamp(base * d.tsl, 0, 0.92)) ? d : null;
  }
  private passStep(from: SP, to: SP) {
    if (this.record) this.cur!.steps.push({ k: 'pass', pid: from.pid, pid2: to.pid });
  }

  // PICK AND ROLL -------------------------------------------------

  private pnr(off: ST, def: ST, open: number, late: ReturnType<GameSim['lateMode']>, forced: boolean): 'done' | { carry: number; ball: SP | null } {
    const H = this.pickActor(off, 'pnr');
    // screener: preferred screeners, else bigs / rollers / poppers
    const pref = off.t.offense.screeners;
    let S: SP | undefined = pref.length ? off.on.find((p) => p !== H && pref.includes(p.pid)) : undefined;
    if (!S) {
      const ws = off.on.map((p) => {
        if (p === H) return 0;
        let w = Math.max(p.c.roll, p.c.pop * 0.9) * (p.big ? 2 : 0.6);
        if (p.role === 'roller' || p.role === 'stretch' || p.role === 'hub') w *= 1.6;
        if (off.t.offense.huntMismatch) {
          const d = this.defOf(def, p);
          w *= Math.exp(clamp((60 - d.c.perDef) / 30, -0.4, 0.9));
        }
        return Math.pow(w / 50, 2) * Math.pow(p.tu, 0.75);
      });
      S = off.on[this.rng.weighted(ws)];
    }
    const dH = this.defOf(def, H);
    const dS = this.defOf(def, S);
    const zone = this.zone(def);
    let cov: PnrCoverage | 'zone' = zone ? 'zone' : def.t.defense.pnr;
    if (def.t.defense.switchOffBall && !zone) cov = 'switch';
    // star plan double -> blitz the star
    const star = this.starTarget(def, off);
    if (star === H && def.t.defense.starPlan === 'double' && !zone) cov = 'blitz';
    if (this.cur) {
      this.cur.coverage = cov;
      this.cur.label = `P&R: ${H.name} + ${S.name}${cov === 'zone' ? ' vs zone' : ` vs ${cov}`}`;
      this.cur.steps.push({ k: 'screen', pid: S.pid, pid2: H.pid });
    }
    const pf = this.prefs(off, late);
    const screen = (S.r.str * 0.5 + S.r.hgt * 0.3 + S.r.oiq * 0.2 - 50) / 100;
    const help = this.help(def);
    const spacing = this.spacingBonus(off);
    let advH = (H.c.pnrHandle * H.perf - dH.c.perDef * this.dq(dH)) / 22 + screen + this.rng.normal(0, 0.55) + open;

    // ---- coverage branches
    if (cov === 'switch') {
      // after the switch: H vs dS (often a big), S vs dH (often a guard)
      const isoAdv = (H.c.create - dS.c.perDef * this.dq(dS)) / 20;
      const postAdv = (S.c.postScore - dH.c.intDef * this.dq(dH)) / 20 + (S.r.hgt - dH.r.hgt) / 50;
      const baseIso = (H.c.create - dH.c.perDef) / 20;
      const gain = Math.max(isoAdv, postAdv) - baseIso;
      this.impact('switch_mismatch', off.side, gain * 0.12, H.pid);
      if (postAdv > isoAdv + 0.25 && S.c.postScore > 50 && this.rng.chance(0.7)) {
        this.passStep(H, S);
        return this.post(off, def, open + 0.1, forced, { actor: S, defender: dH, tag: 'switch_mismatch' });
      }
      return this.iso(off, def, open, late, forced, { actor: H, defender: dS, tag: 'switch_mismatch', fromPnr: true });
    }

    let pullOpen = 0;
    let rimOpen = 0;
    let rollOpen = 0;
    let popOpen = 0;
    let kickOpen = 0.05;
    let toExtra = 0;
    const tagsPull: [string, number][] = [];
    const tagsRim: [string, number][] = [];
    const tagsRoll: [string, number][] = [];
    const tagsPop: [string, number][] = [];
    const tagsKick: [string, number][] = [];
    let handlerShoots = 1;

    if (cov === 'drop') {
      // big sags; trailing guard -> pull-up space
      const big = dS;
      const deep = 0.35 + (big.c.rimProt - 50) / 200;
      pullOpen += 0.38;
      tagsPull.push(['drop_pullup', 0.38]);
      rimOpen -= deep;
      tagsRim.push(['drop_rim', -deep]);
      rollOpen -= 0.3;
      tagsRoll.push(['drop_rim', -0.3]);
      if (S.c.pop > 55) {
        popOpen += 0.45;
        tagsPop.push(['drop_pop', 0.45]);
      }
    } else if (cov === 'hedge') {
      const recover = (dS.r.spd - S.r.spd) / 60 + (dS.r.diq - 50) / 150;
      advH -= 0.28;
      this.impact('hedge_stall', def.side, 0.28 * 0.08, H.pid);
      rollOpen += 0.15 - recover;
      tagsRoll.push(['hedge_roll', 0.15 - recover]);
      kickOpen += 0.12;
      tagsKick.push(['hedge_rotate', 0.12]);
      toExtra += 0.01;
    } else if (cov === 'blitz') {
      handlerShoots = 0.18;
      const trap = ((dH.c.steal + dS.c.steal) / 2 + (dH.r.hgt + dS.r.hgt) / 4 - 50) / 100;
      const escape = (H.c.passing - 55) / 100;
      const pTrapTO = clamp(0.085 + trap * 0.25 - escape * 0.3, 0.025, 0.22);
      toExtra += pTrapTO;
      this.impact('blitz_to', def.side, pTrapTO * 1.12, H.pid);
      // 4-on-3 behind the trap: quality scales with the handler's passing and the short-roll big
      const fourThree = 0.45 + escape * 0.6 + (S.c.passing - 50) / 200;
      rollOpen += fourThree;
      tagsRoll.push(['blitz_4v3', fourThree]);
      kickOpen += fourThree * 0.9;
      tagsKick.push(['blitz_4v3', fourThree * 0.9]);
      if (this.record) this.cur!.steps.push({ k: 'trap', pid: H.pid });
    } else if (cov === 'ice') {
      pullOpen -= 0.18;
      tagsPull.push(['ice_contain', -0.18]);
      rimOpen -= 0.2;
      tagsRim.push(['ice_contain', -0.2]);
      rollOpen -= 0.1;
      toExtra += 0.006;
    } else if (cov === 'zone') {
      advH -= 0.3;
      this.impact('zone_paint', def.side, 0.3 * 0.1);
      kickOpen += 0.2;
      tagsKick.push(['zone_3pt', 0.2]);
      popOpen += 0.15;
      tagsPop.push(['zone_3pt', 0.15]);
    }

    // help defense / spacing on drives
    rimOpen += spacing * 0.6 - help * 0.28;
    if (help !== 0) {
      tagsRim.push(['help_paint', -help * 0.28]);
      kickOpen += help * 0.3;
      tagsKick.push(['help_kick', help * 0.3]);
    }
    if (spacing !== 0) tagsRim.push(['spacing', spacing * 0.6]);

    // turnover
    const pTO = this.toChance(K.toBase * 1.05, H, def, toExtra);
    if (this.rng.chance(pTO)) {
      const stealer = this.stealBy(this.rng.chance(0.6) ? dH : dS, 0.6);
      this.turnover(off, def, H, stealer, 'pnrBH');
      return 'done';
    }
    // non-shooting foul
    if (this.nonShootingFoul(off, def, H, dH)) return 'done';

    // decision
    const fr = H.freedom;
    const opts = [
      handlerShoots * Math.pow(H.c.pu3 / 50, 2.4) * pf.three * 0.27 * fr * H.t3 * (1 + pullOpen), // pull-up 3
      handlerShoots * Math.pow(H.c.midShot / 50, 2.2) * pf.mid * 0.22 * fr * (1 + pullOpen), // pull-up 2
      handlerShoots * Math.pow(H.c.rim / 50, 1.6) * pf.rim * 0.32 * fr * H.td * (1 + advH * 0.4 + rimOpen * 0.5), // drive
      Math.pow(H.c.passing / 50, 1.2) * H.tp * Math.pow(Math.max(S.c.roll, 5) / 50, 1.5) * Math.pow(S.tu, 0.75) * 0.85 * (1 + rollOpen) * (S.c.pop > S.c.roll ? 0.4 : 1), // roll
      S.c.pop > 50 ? Math.pow(H.c.passing / 50, 1.2) * H.tp * Math.pow(S.c.pop / 50, 2) * Math.pow(S.tu, 0.75) * 0.45 * pf.three * S.t3 * (1 + popOpen) : 0.01, // pop
      Math.pow(H.c.passing / 50, 1.3) * H.tp * (off.spacing / 50) * 1.1 * (1 + kickOpen), // kick out
      forced ? 0 : K.continueBase * (advH < 0 ? 1.6 : 0.7) * (late.hold ? 0.5 : 1), // reset
    ];
    if (cov === 'blitz') opts[2] *= 0.3;
    const c = this.rng.weighted(opts);
    const advOpen = clamp(advH * 0.35, -0.6, 0.7);
    switch (c) {
      case 0:
        this.shoot(off, def, { shooter: H, zone: 'ab3', open: advOpen * 0.7 + pullOpen - 0.12 + open, contest: dH, assister: null, finish: 'pnrBH', tags: tagsPull, pullup: true });
        return 'done';
      case 1:
        this.shoot(off, def, { shooter: H, zone: this.rng.chance(0.55) ? 'mid' : 'paint', open: advOpen + pullOpen + open, contest: dH, assister: null, finish: 'pnrBH', tags: tagsPull, pullup: true });
        return 'done';
      case 2: {
        if (this.record) this.cur!.steps.push({ k: 'drive', pid: H.pid });
        const zone: ShotZone = this.rng.chance(0.68) ? 'rim' : 'paint';
        this.shoot(off, def, { shooter: H, zone, open: advOpen + rimOpen + open, contest: zone === 'rim' ? def.anchor : dS, assister: null, finish: 'pnrBH', tags: tagsRim });
        return 'done';
      }
      case 3: {
        this.passStep(H, S);
        const rollAdv = (S.c.roll - dS.c.intDef * this.dq(dS)) / 25;
        this.shoot(off, def, { shooter: S, zone: this.rng.chance(0.75) ? 'rim' : 'paint', open: rollAdv * 0.4 + rollOpen - 0.32 + open, contest: cov === 'blitz' ? def.on.find((p) => p !== dH && p !== dS) ?? def.anchor : def.anchor, assister: H, finish: 'pnrRoll', tags: tagsRoll });
        return 'done';
      }
      case 4: {
        this.passStep(H, S);
        this.shoot(off, def, { shooter: S, zone: 'ab3', open: popOpen + 0.05 + open, contest: dS, assister: H, finish: 'pnrRoll', tags: tagsPop });
        return 'done';
      }
      case 5: {
        const sh = this.kickTarget(off, H, S);
        this.passStep(H, sh);
        const d = this.defOf(def, sh);
        const closeout = (d.c.perDef * this.dq(d) - 50) / 200;
        this.spotUp(off, def, { shooter: sh, zone: this.cornerOrWing(off), open: kickOpen + advOpen * 0.4 - closeout + open, contest: d, assister: H, finish: 'spotup', tags: tagsKick });
        return 'done';
      }
      default:
        return { carry: clamp(advOpen * 0.3, -0.1, 0.2), ball: H };
    }
  }

  private kickTarget(off: ST, ...exclude: SP[]): SP {
    const ws = off.on.map((p) => (exclude.includes(p) ? 0 : Math.pow(p.c.c3 / 50, 3) * p.t3 * Math.pow(p.tu, 0.75) * (0.6 + 0.4 * p.freedom) * (p.role === 'shooter' || p.role === 'glue' ? 1.3 : 1)));
    return off.on[this.rng.weighted(ws)];
  }

  private cornerOrWing(off: ST): ShotZone {
    return this.rng.chance(0.27 + (off.t.offense.threePoint - 50) / 400) ? 'c3' : 'ab3';
  }

  // ISOLATION -------------------------------------------------------

  private iso(
    off: ST,
    def: ST,
    open: number,
    late: ReturnType<GameSim['lateMode']>,
    forced: boolean,
    fixed: { actor: SP; defender: SP; tag: string; fromPnr?: boolean } | null,
  ): 'done' | { carry: number; ball: SP | null } {
    const A = fixed?.actor ?? this.pickActor(off, 'iso');
    const D = fixed?.defender ?? this.defOf(def, A);
    if (this.cur && !fixed) this.cur.label = `Isolation: ${A.name} on ${D.name}`;
    if (this.cur && fixed) this.cur.label = `Switch! ${A.name} attacks ${D.name}`;
    const pf = this.prefs(off, late);
    const help = this.help(def);
    let adv = (A.c.create * A.perf - D.c.perDef * this.dq(D)) / 20 + (A.r.str - D.r.str) / 140 + this.rng.normal(0, 0.6) + open;
    const pr = this.pressure(def);
    // pressure: aggressive defenders get blown by more often
    if (pr > 0) {
      const blow = pr * clamp((A.c.create - 55) / 50, 0, 0.5);
      adv += blow;
      this.impact('pressure_blowby', off.side, blow * 0.1, A.pid);
    }
    if (this.zone(def)) {
      adv -= 0.35;
      this.impact('zone_paint', def.side, 0.035, A.pid);
    }
    const star = this.starTarget(def, off);
    let doubled = false;
    if (star === A && def.t.defense.starPlan === 'double') doubled = this.rng.chance(0.75);
    else if (adv > 0.7 && help > 0) doubled = this.rng.chance(0.25 * help);
    if (this.record) this.cur!.steps.push({ k: 'drive', pid: A.pid });
    if (doubled) return this.doubleTeam(off, def, A, 'iso');

    const pTO = this.toChance(K.toBase * 0.95, A, def);
    if (this.rng.chance(pTO)) {
      this.turnover(off, def, A, this.stealBy(D, 0.55), 'iso');
      return 'done';
    }
    if (this.nonShootingFoul(off, def, A, D)) return 'done';
    const spacing = this.spacingBonus(off);
    const rimOpen = adv * 0.35 + spacing * 0.5 - help * 0.25;
    const sizeEdge = (A.r.hgt - D.r.hgt) / 25;
    const opts = [
      Math.pow(A.c.rim / 50, 1.7) * pf.rim * A.td * (1 + rimOpen),
      Math.pow(A.c.midShot / 50, 2.3) * pf.mid * 0.9,
      Math.pow(A.c.pu3 / 50, 2.5) * pf.three * 0.6 * A.t3,
      sizeEdge > 0.3 ? Math.pow(A.c.postScore / 50, 2) * sizeEdge : 0,
      Math.pow(A.c.passing / 50, 1.2) * 0.8 * A.tp * (1 + Math.max(0, help)),
      forced ? 0 : K.continueBase * (adv < -0.3 ? 1.4 : 0.5),
    ];
    const c = this.rng.weighted(opts);
    const advOpen = clamp(adv * 0.35, -0.7, 0.75);
    const finish: FinishType = fixed?.fromPnr ? 'pnrBH' : 'iso';
    const tagged = (extra: [string, number][]) => extra;
    switch (c) {
      case 0: {
        const zone: ShotZone = this.rng.chance(0.62) ? 'rim' : 'paint';
        const hp = -help * 0.25;
        this.shoot(off, def, { shooter: A, zone, open: advOpen + spacing * 0.5 + hp - 0.08, contest: zone === 'rim' && this.rng.chance(0.55) ? def.anchor : D, assister: null, finish, tags: tagged([['help_paint', hp], ['spacing', spacing * 0.5]]) });
        return 'done';
      }
      case 1:
        this.shoot(off, def, { shooter: A, zone: this.rng.chance(0.7) ? 'mid' : 'paint', open: advOpen - 0.12, contest: D, assister: null, finish, tags: tagged([]), pullup: true });
        return 'done';
      case 2:
        this.shoot(off, def, { shooter: A, zone: 'ab3', open: advOpen * 0.6 - 0.2, contest: D, assister: null, finish, tags: tagged([]), pullup: true });
        return 'done';
      case 3:
        return this.post(off, def, open, forced, { actor: A, defender: D, tag: fixed?.tag ?? 'mismatch_post' });
      case 4: {
        const sh = this.kickTarget(off, A);
        this.passStep(A, sh);
        const ko = 0.15 + Math.max(0, help) * 0.3;
        this.spotUp(off, def, { shooter: sh, zone: this.cornerOrWing(off), open: ko + advOpen * 0.3, contest: this.defOf(def, sh), assister: A, finish: 'spotup', tags: [['help_kick', Math.max(0, help) * 0.3]] });
        return 'done';
      }
      default:
        return { carry: 0, ball: A };
    }
  }

  private doubleTeam(off: ST, def: ST, A: SP, from: 'iso' | 'post'): 'done' {
    if (this.cur) this.cur.label = `${A.name} gets doubled!`;
    if (this.record) this.cur!.steps.push({ k: 'trap', pid: A.pid });
    const escape = (A.c.passing - 55) / 100;
    const pTO = clamp(0.1 - escape * 0.25, 0.03, 0.2);
    this.impact('star_double', def.side, (pTO - 0.06) * 1.1 + 0.12, A.pid);
    if (this.rng.chance(pTO)) {
      this.turnover(off, def, A, def.on[this.rng.weighted(def.on.map((p) => p.c.steal * p.tsl))], from);
      return 'done';
    }
    // forced to give it up: 4-on-3 for teammates
    if (this.rng.chance(0.82)) {
      const sh = this.kickTarget(off, A);
      this.passStep(A, sh);
      const o = 0.5 + escape * 0.5;
      this.impact('double_kick', off.side, o * 0.06 * 3 * 0.35, sh.pid);
      if (this.rng.chance(0.3) && sh.c.rim > 52) {
        this.shoot(off, def, { shooter: sh, zone: 'rim', open: o * 0.6, contest: def.anchor, assister: A, finish: 'cut' });
      } else {
        this.spotUp(off, def, { shooter: sh, zone: this.cornerOrWing(off), open: o, contest: this.defOf(def, sh), assister: A, finish: 'spotup' });
      }
      return 'done';
    }
    // tries to split the double anyway
    this.shoot(off, def, { shooter: A, zone: this.rng.chance(0.5) ? 'mid' : 'paint', open: -0.55, contest: this.defOf(def, A), assister: null, finish: from === 'post' ? 'post' : 'iso', tags: [['star_double', -0.4]] });
    return 'done';
  }

  // POST UP ---------------------------------------------------------

  private post(
    off: ST,
    def: ST,
    open: number,
    forced: boolean,
    fixed: { actor: SP; defender: SP; tag: string } | null,
  ): 'done' | { carry: number; ball: SP | null } {
    const A = fixed?.actor ?? this.pickActor(off, 'post');
    const D = fixed?.defender ?? this.defOf(def, A);
    if (this.cur && !fixed) this.cur.label = `Post-up: ${A.name} vs ${D.name}`;
    if (this.record) this.cur!.steps.push({ k: 'post', pid: A.pid });
    const help = this.help(def);
    let adv = (A.c.postScore * A.perf - D.c.intDef * this.dq(D)) / 20 + (A.r.str - D.r.str) / 80 + (A.r.hgt - D.r.hgt) / 70 + this.rng.normal(0, 0.55) + open;
    if (this.zone(def)) {
      adv -= 0.25;
      this.impact('zone_paint', def.side, 0.025, A.pid);
    }
    if (fixed?.tag) this.impact(fixed.tag, off.side, Math.max(0, (A.r.hgt - D.r.hgt) / 70) * 0.25, A.pid);
    const star = this.starTarget(def, off);
    let doubleP = 0.08 + Math.max(0, help) * 0.15 + (adv > 0.6 ? 0.15 : 0);
    if (star === A && def.t.defense.starPlan === 'double') doubleP = 0.75;
    if (this.rng.chance(doubleP)) return this.doubleTeam(off, def, A, 'post');
    const pTO = this.toChance(K.toBase * 1.1, A, def);
    if (this.rng.chance(pTO)) {
      this.turnover(off, def, A, this.stealBy(D, 0.4), 'post');
      return 'done';
    }
    const advOpen = clamp(adv * 0.4, -0.7, 0.8);
    const opts = [
      Math.pow(A.c.close / 50, 2) * 1.1, // hook / short shot
      Math.pow(A.c.rim / 50, 1.6) * 0.8 * (1 + advOpen), // drop step
      Math.pow(A.c.midShot / 50, 2) * 0.35, // fadeaway
      Math.pow(A.c.passing / 50, 1.4) * 0.45 * A.tp, // pass out
      forced ? 0 : K.continueBase * 0.6,
    ];
    const c = this.rng.weighted(opts);
    switch (c) {
      case 0:
        this.shoot(off, def, { shooter: A, zone: 'paint', open: advOpen - 0.05, contest: D, assister: null, finish: 'post', forcedFoulMult: 1.3 });
        return 'done';
      case 1:
        this.shoot(off, def, { shooter: A, zone: 'rim', open: advOpen - 0.1, contest: this.rng.chance(0.5) ? def.anchor : D, assister: null, finish: 'post', forcedFoulMult: 1.25 });
        return 'done';
      case 2:
        this.shoot(off, def, { shooter: A, zone: 'mid', open: advOpen - 0.2, contest: D, assister: null, finish: 'post' });
        return 'done';
      case 3: {
        const cutter = this.rng.chance(0.3);
        const tgt = cutter ? off.on.filter((p) => p !== A).sort((a, b) => b.c.cut - a.c.cut)[0] : this.kickTarget(off, A);
        this.passStep(A, tgt);
        if (cutter) this.shoot(off, def, { shooter: tgt, zone: 'rim', open: 0.25 + advOpen * 0.3, contest: def.anchor, assister: A, finish: 'cut' });
        else this.spotUp(off, def, { shooter: tgt, zone: this.cornerOrWing(off), open: 0.2 + Math.max(0, help) * 0.25, contest: this.defOf(def, tgt), assister: A, finish: 'spotup', tags: [['help_kick', Math.max(0, help) * 0.25]] });
        return 'done';
      }
      default:
        return { carry: 0, ball: A };
    }
  }

  // HANDOFFS / OFF-BALL SCREENS --------------------------------------

  private handoff(off: ST, def: ST, open: number, late: ReturnType<GameSim['lateMode']>, forced: boolean): 'done' | { carry: number; ball: SP | null } {
    const Sh = this.pickActor(off, 'handoff');
    // the hub: best passing big, else best passer
    const hubs = off.on.filter((p) => p !== Sh);
    const B = hubs[this.rng.weighted(hubs.map((p) => Math.pow((p.c.passing + (p.big ? 15 : 0) + (p.role === 'hub' ? 20 : 0)) / 50, 2.5)))];
    const D = this.defOf(def, Sh);
    const dB = this.defOf(def, B);
    const pf = this.prefs(off, late);
    const finish: FinishType = Sh.role === 'shooter' || this.rng.chance(0.4) ? 'offscreen' : 'handoff';
    if (this.cur) {
      this.cur.label = `${finish === 'offscreen' ? 'Off-ball screen' : 'Handoff'}: ${B.name} to ${Sh.name}`;
      this.cur.steps.push({ k: 'handoff', pid: B.pid, pid2: Sh.pid });
    }
    let adv = (Sh.c.offBall * Sh.perf - (D.c.perDef * 0.6 + D.c.helpD * 0.4) * this.dq(D)) / 22 + (B.r.str + B.r.hgt - 100) / 200 + this.rng.normal(0, 0.55) + open;
    const tags: [string, number][] = [];
    const sw = !this.zone(def) && (def.t.defense.pnr === 'switch' || def.t.defense.switchOffBall);
    if (sw) {
      adv -= 0.35;
      tags.push(['switch_deny', -0.35 * 0.35]);
    }
    if (!sw && def.t.defense.pnr === 'drop' && !this.zone(def)) {
      adv += 0.18;
      tags.push(['drop_handoff', 0.18 * 0.35]);
    }
    if (this.zone(def)) {
      adv += 0.1;
      tags.push(['zone_3pt', 0.1 * 0.35]);
    }
    const pTO = this.toChance(K.toBase * 0.7, B, def);
    if (this.rng.chance(pTO)) {
      this.turnover(off, def, this.rng.chance(0.5) ? B : Sh, this.stealBy(D, 0.5), finish);
      return 'done';
    }
    const advOpen = clamp(adv * 0.35, -0.6, 0.75);
    const opts = [
      Math.pow(Sh.c.c3 / 50, 2.6) * pf.three * 1.25 * Sh.freedom * Sh.t3,
      Math.pow(Sh.c.midShot / 50, 2) * pf.mid * 0.45,
      Math.pow(Sh.c.rim / 50, 1.6) * pf.rim * 0.45 * (1 + this.spacingBonus(off)),
      Math.pow(B.c.roll / 50, 1.5) * Math.pow(Sh.c.passing / 50, 1.2) * 0.3,
      forced ? 0 : K.continueBase * (adv < 0 ? 1.4 : 0.6),
    ];
    const c = this.rng.weighted(opts);
    switch (c) {
      case 0:
        this.shoot(off, def, { shooter: Sh, zone: this.rng.chance(0.2) ? 'c3' : 'ab3', open: advOpen - 0.02, contest: D, assister: B, finish, tags });
        return 'done';
      case 1:
        this.shoot(off, def, { shooter: Sh, zone: this.rng.chance(0.5) ? 'mid' : 'paint', open: advOpen - 0.05, contest: D, assister: this.rng.chance(0.4) ? B : null, finish, tags });
        return 'done';
      case 2:
        if (this.record) this.cur!.steps.push({ k: 'drive', pid: Sh.pid });
        this.shoot(off, def, { shooter: Sh, zone: 'rim', open: advOpen * 0.6 - this.help(def) * 0.2, contest: def.anchor, assister: null, finish, tags: [['help_paint', -this.help(def) * 0.2]] });
        return 'done';
      case 3:
        this.passStep(Sh, B);
        this.shoot(off, def, { shooter: B, zone: 'rim', open: 0.1 + advOpen * 0.4, contest: dB, assister: Sh, finish: 'pnrRoll' });
        return 'done';
      default:
        return { carry: clamp(advOpen * 0.25, -0.1, 0.2), ball: B };
    }
  }

  // MOTION / CUTS / DRIVE & KICK ------------------------------------

  private motion(off: ST, def: ST, open: number, ballFrom: SP | null, late: ReturnType<GameSim['lateMode']>, forced: boolean): 'done' | { carry: number; ball: SP | null } {
    const pf = this.prefs(off, late);
    const help = this.help(def);
    const pr = this.pressure(def);
    const zone = this.zone(def);
    let adv = (off.passQ - def.helpQ) / 22 + this.spacingBonus(off) * 0.8 + this.rng.normal(0, 0.55) + open;
    const sw = def.t.defense.switchOffBall && !zone;
    if (sw) {
      adv -= 0.15;
      this.impact('switch_deny', def.side, 0.15 * 0.1);
    }
    if (this.cur) this.cur.label = zone ? 'Ball movement vs zone' : 'Motion offense';
    const passer = ballFrom ?? off.on[this.rng.weighted(off.on.map((p) => Math.pow(p.c.passing / 50, 2)))];
    const pTO = this.toChance(K.toBase * 0.8, passer, def);
    if (this.rng.chance(pTO)) {
      const st = def.on[this.rng.weighted(def.on.map((p) => p.c.steal * p.tsl))];
      this.turnover(off, def, passer, this.stealBy(st, 0.6), 'spotup');
      return 'done';
    }
    const cutters = off.on.filter((p) => p !== passer);
    const cutW = cutters.map((p) => Math.pow(p.c.cut / 50, 2.2) * Math.pow(p.tu, 0.75) * (p.role === 'slasher' || p.role === 'roller' ? 1.4 : 1));
    const advOpen = clamp(adv * 0.35, -0.6, 0.75);
    // backdoor cuts punish ball pressure / denial
    const backdoor = Math.max(0, pr) * 0.3;
    const zoneCut = zone ? -0.25 : 0;
    const opts = [
      cutW.reduce((a, b) => a + b, 0) / 4 * 0.55 * (1 + backdoor + zoneCut) * pf.rim, // cut
      Math.pow(off.spacing / 50, 1.2) * 0.9 * pf.three * (zone ? 1.35 : 1), // swing for spot-up 3
      0.55 * pf.rim * (1 + this.spacingBonus(off)), // drive & kick
      Math.pow(Math.max(...off.on.map((p) => p.c.midShot)) / 50, 2) * 0.25 * pf.mid, // flare/mid
      forced ? 0 : K.continueBase * (adv < 0 ? 1.5 : 0.7),
    ];
    const c = this.rng.weighted(opts);
    switch (c) {
      case 0: {
        const cutter = cutters[this.rng.weighted(cutW)];
        if (this.record) this.cur!.steps.push({ k: 'cut', pid: cutter.pid });
        this.passStep(passer, cutter);
        const tags: [string, number][] = [];
        if (backdoor > 0) tags.push(['pressure_backdoor', backdoor * 0.8]);
        if (zone) tags.push(['zone_paint', -0.2]);
        const cd = this.defOf(def, cutter);
        const o = advOpen - 0.06 + backdoor * 0.8 + (cutter.c.cut - cd.c.helpD * this.dq(cd)) / 100 + (zone ? -0.2 : 0);
        this.shoot(off, def, { shooter: cutter, zone: this.rng.chance(0.8) ? 'rim' : 'paint', open: o, contest: this.rng.chance(0.5) ? def.anchor : cd, assister: passer, finish: 'cut', tags });
        return 'done';
      }
      case 1: {
        const sh = this.kickTarget(off, passer);
        this.passStep(passer, sh);
        const tags: [string, number][] = [];
        let o = advOpen + 0.05;
        if (zone) {
          const zw = def.t.defense.scheme === 'zone23' ? 0.22 : 0.08;
          o += zw;
          tags.push(['zone_3pt', zw]);
        }
        if (help !== 0) {
          o += help * 0.15;
          tags.push(['help_kick', help * 0.15]);
        }
        const d = this.defOf(def, sh);
        this.spotUp(off, def, { shooter: sh, zone: def.t.defense.scheme === 'zone23' && this.rng.chance(0.45) ? 'c3' : this.cornerOrWing(off), open: o, contest: d, assister: passer, finish: 'spotup', tags });
        return 'done';
      }
      case 2: {
        const drivers = off.on.filter((p) => p !== passer);
        const dr = drivers[this.rng.weighted(drivers.map((p) => Math.pow(p.c.create / 50, 2.5) * p.freedom * p.td * Math.pow(p.tu, 0.75)))];
        if (this.record) this.cur!.steps.push({ k: 'drive', pid: dr.pid });
        const d = this.defOf(def, dr);
        const dAdv = (dr.c.create - d.c.perDef * this.dq(d)) / 20 + advOpen + (zone ? -0.3 : 0);
        if (this.rng.chance(clamp(0.45 + dr.c.passing / 200 + help * 0.15, 0.2, 0.8))) {
          // kick out after collapsing the defense
          const sh = this.kickTarget(off, dr);
          this.passStep(dr, sh);
          const ko = 0.12 + Math.max(0, help) * 0.3 + Math.max(0, dAdv) * 0.2;
          this.spotUp(off, def, { shooter: sh, zone: this.cornerOrWing(off), open: ko, contest: this.defOf(def, sh), assister: dr, finish: 'spotup', tags: [['help_kick', Math.max(0, help) * 0.3]] });
        } else {
          const zoneS: ShotZone = this.rng.chance(0.6) ? 'rim' : 'paint';
          this.shoot(off, def, { shooter: dr, zone: zoneS, open: dAdv * 0.35 - help * 0.25 + this.spacingBonus(off) * 0.4, contest: zoneS === 'rim' ? def.anchor : d, assister: passer, finish: 'spotup', tags: [['help_paint', -help * 0.25], ['spacing', this.spacingBonus(off) * 0.4]] });
        }
        return 'done';
      }
      case 3: {
        const sh = off.on[this.rng.weighted(off.on.map((p) => Math.pow(p.c.midShot / 50, 3) * p.freedom * Math.pow(p.tu, 0.75)))];
        this.passStep(passer, sh);
        this.shoot(off, def, { shooter: sh, zone: 'mid', open: advOpen * 0.5, contest: this.defOf(def, sh), assister: this.rng.chance(0.5) ? passer : null, finish: 'spotup' });
        return 'done';
      }
      default:
        return { carry: clamp(advOpen * 0.25, -0.1, 0.25), ball: passer };
    }
  }

  // ------------------------------------------------------------ events

  private nonShootingFoul(off: ST, def: ST, handler: SP, defender: SP): boolean {
    const phys = (def.t.defense.physicality - 50) / 50;
    const pr = this.pressure(def);
    const p = K.nonShootFoul * (1 + 0.3 * phys + 0.25 * pr) * (0.8 + handler.c.foulDraw / 250);
    if (!this.rng.chance(p)) return false;
    const fouler = this.rng.chance(clamp(0.7 * defender.tpf, 0.2, 0.92)) ? defender : def.on[this.rng.weighted(def.on.map((p) => p.tpf))];
    this.addFoul(def, fouler, false);
    this.addPbp(def.side, `Foul on ${fouler.name}.`, 'foul');
    if (this.record) this.cur!.steps.push({ k: 'foul', pid: fouler.pid, pid2: handler.pid });
    const bonus = def.fouls >= GAME.bonusFouls || (this.q >= 4 && this.clock < 120 && def.foulsLast2 >= 2);
    if (bonus) {
      this.freeThrows(off, def, handler, 2);
      return true;
    }
    // side out: offense keeps the ball; treat as a fresh possession phase
    return false;
  }

  /** Who is charged with a shooting foul: the help defender takes most contact, the beaten man some. */
  private shootingFouler(def: ST, c: SP | null, sh: SP): SP {
    const md = this.defOf(def, sh);
    if (!c || c === md) return c ?? md;
    return this.rng.weighted([0.6 * c.tpf, 0.4 * md.tpf]) === 0 ? c : md;
  }

  private addFoul(def: ST, p: SP, shooting: boolean) {
    p.fouls++;
    p.b.pf++;
    def.tot.pf++;
    def.fouls++;
    if (this.clock < 120) def.foulsLast2++;
    void shooting;
    if (p.fouls >= GAME.foulOut) {
      p.out = 1;
      this.addPbp(def.side, `${p.name} has fouled out.`, 'foul');
      // immediate replacement
      const t = def;
      const bench = t.players.filter((x) => !x.on && x.out === 0);
      if (bench.length) {
        const rep = bench.sort((a, b) => (b.big === p.big ? 1 : 0) - (a.big === p.big ? 1 : 0))[0];
        this.applySub(t, t.on.map((x) => (x === p ? rep : x)));
      }
    }
  }

  private turnover(off: ST, def: ST, handler: SP, stealer: SP | null, finish: FinishType | 'press' | 'transition' | 'shotclock') {
    handler.b.tov++;
    off.tot.tov++;
    for (const p of off.on) p.b.tTov++;
    const live = !!stealer;
    if (stealer) {
      stealer.b.stl++;
      def.tot.stl++;
    }
    let text: string;
    if (finish === 'shotclock') text = `Shot clock violation, ${off.team.abbrev}.`;
    else if (stealer) text = `${handler.name} turnover, stolen by ${stealer.name}.`;
    else if (this.rng.chance(0.24)) {
      text = `${handler.name} offensive foul.`;
      handler.b.pf++;
      handler.fouls++;
      off.tot.pf++;
    } else text = `${handler.name} turnover (${this.rng.pick(['bad pass', 'lost ball', 'traveling', 'out of bounds', 'bad pass'])}).`;
    this.addPbp(off.side, text, 'to');
    if (this.record) {
      this.cur!.steps.push({ k: stealer ? 'steal' : 'to', pid: handler.pid, pid2: stealer?.pid });
    }
    const ft: FinishType =
      finish === 'press' || finish === 'shotclock' ? 'misc' : finish === 'transition' ? 'transition' : finish;
    this.ctx = live ? 'steal' : 'deadTO';
    this.finishPoss(off, def, ft, true);
  }

  private shotXY(zone: ShotZone): { x: number; y: number } {
    const r = this.rng;
    const by = 5.25;
    switch (zone) {
      case 'rim': {
        const d = r.uniform(0, 4);
        const a = r.uniform(0.1, Math.PI - 0.1);
        return { x: d * Math.cos(a), y: by + d * Math.sin(a) * 0.9 };
      }
      case 'paint': {
        const d = r.uniform(4, 13);
        const a = r.uniform(0.35, Math.PI - 0.35);
        return { x: clamp(d * Math.cos(a), -7.5, 7.5), y: by + d * Math.sin(a) };
      }
      case 'mid': {
        const d = r.uniform(13, 21.5);
        const a = r.uniform(0.25, Math.PI - 0.25);
        return { x: d * Math.cos(a), y: by + d * Math.sin(a) };
      }
      case 'c3':
        return { x: (r.chance(0.5) ? -1 : 1) * r.uniform(22, 23.5), y: r.uniform(1, 13) };
      default: {
        const d = r.uniform(24, 27);
        const a = r.uniform(0.42, Math.PI - 0.42);
        return { x: d * Math.cos(a), y: by + d * Math.sin(a) };
      }
    }
  }

  private shoot(off: ST, def: ST, s: ShotOpts) {
    const sh = s.shooter;
    const zone = s.zone;
    const three = zone === 'c3' || zone === 'ab3';
    const value = three ? 3 : 2;
    // skill for the zone
    let skill: number;
    switch (zone) {
      case 'rim':
        skill = sh.c.rim;
        break;
      case 'paint':
        skill = sh.c.close;
        break;
      case 'mid':
        skill = sh.c.midShot;
        break;
      default:
        skill = s.pullup ? sh.c.pu3 : sh.c.c3;
    }
    const open = clamp(s.open + this.rng.normal(0, 0.18), -1.2, 1.3);
    let p = K.zoneBase[zone] + ((skill * sh.perf - 50) / 50) * K.zoneSkill[zone] + open * K.zoneOpen[zone];
    if (s.pullup && three) p -= 0.012;
    // contesting defender quality
    const c = s.contest;
    if (c) {
      if (zone === 'rim' || zone === 'paint') p -= ((c.c.rimProt * this.dq(c) - 50) / 50) * 0.07;
      else p -= ((c.c.perDef * this.dq(c) - 50) / 50) * 0.022;
    }
    // fatigue
    p -= (1 - sh.energy) * 0.12;
    // physicality: tighter contests
    const phys = (def.t.defense.physicality - 50) / 50;
    p -= phys * 0.01;
    // home court
    if (!this.opts.neutral) p += off.side === 0 ? K.home : -K.home * 0.3;
    // late-game nerves for poor shooters
    if (this.q >= 4 && this.clock < 120 && Math.abs(off.score - def.score) <= 5) p -= (60 - sh.r.oiq) / 2000;
    p = clamp(p, 0.04, 0.93);

    // impact accounting: each tag's openness contribution in expected points
    if (s.tags) {
      for (const [k, d] of s.tags) {
        if (d === 0) continue;
        this.impact(k, off.side, d * K.zoneOpen[zone] * value, sh.pid);
      }
    }
    if (sh.energy < 0.7) this.impact('fatigue', def.side, (1 - sh.energy) * 0.12 * value * 0.5, sh.pid);

    // block?
    let blocker: SP | null = null;
    const pBlk = c ? K.blockMiss[zone] * Math.pow(clamp(blockSkill(c), 10, 100) / 55, 2) * c.tbk * (1 - 0.3 * clamp(open, -1, 1)) : 0;
    // shooting foul?
    const draw = Math.pow(clamp(sh.c.foulDraw, 10, 100) / 50, 0.9) * (1 + 0.3 * phys) * (s.forcedFoulMult ?? 1);
    const pFoul = K.foulRate[zone] * draw;
    if (phys !== 0) this.impact('physicality', off.side, K.foulRate[zone] * 0.3 * phys * 1.4, sh.pid);
    const fouled = this.rng.chance(pFoul);
    let made: boolean;
    if (fouled) made = this.rng.chance(p * (zone === 'rim' || zone === 'paint' ? 0.45 : 0.25));
    else {
      made = this.rng.chance(p);
      if (!made && c && this.rng.chance(clamp(pBlk, 0, 0.6))) blocker = c;
      else if (!made && c) {
        // the shooter's own man can get a piece of it too: timing and length, less about size
        const md = this.defOf(def, sh);
        const chase = K.chaseBlock[zone] * Math.pow(clamp(blockSkill(md), 10, 100) / 55, 2) * md.tbk * (1 - 0.3 * clamp(open, -1, 1));
        if (md !== c && this.rng.chance(clamp(chase, 0, 0.3))) blocker = md;
      }
    }

    // record attempt
    const xy = this.shotXY(zone);
    const ast = made && s.assister && s.assister !== sh && this.rng.chance(this.assistProb(s.finish, zone)) ? s.assister : null;
    if (!fouled || made) {
      sh.b.fga++;
      off.tot.fga++;
      for (const pl of off.on) pl.b.tFga++;
      if (three) {
        sh.b.tpa++;
        off.tot.tpa++;
      }
      if (zone === 'rim') sh.b.rimA++;
      if (zone === 'mid') sh.b.midA++;
      if (this.record || this.opts.keepShots) {
        this.shots.push({ t: off.side, pid: sh.pid, x: Math.round(xy.x * 10) / 10, y: Math.round(xy.y * 10) / 10, made, zone, q: this.q });
      }
    }
    if (this.record) {
      this.cur!.steps.push({ k: 'shot', pid: sh.pid, zone, x: xy.x, y: xy.y, made, v: value, pid2: ast?.pid, f: s.finish });
      if (blocker) this.cur!.steps.push({ k: 'block', pid: blocker.pid, pid2: sh.pid });
    }
    if (!this.cur?.finish && this.cur) this.cur.finish = s.finish;
    this.lastFinish = s.finish;
    this.lastShooter = sh;

    const desc = this.shotDesc(zone, s.finish, s.pullup);
    if (made) {
      sh.b.fgm++;
      off.tot.fgm++;
      if (three) {
        sh.b.tpm++;
        off.tot.tpm++;
      }
      if (zone === 'rim') sh.b.rimM++;
      if (zone === 'mid') sh.b.midM++;
      if (ast) {
        ast.b.ast++;
        off.tot.ast++;
      }
      if (zone === 'rim' || zone === 'paint') off.ex.paint += 2;
      sh.hot = Math.min(5, sh.hot + 1);
      this.score(off, def, sh, value);
      this.addPbp(off.side, `${sh.name} ${desc} — good${ast ? ` (${ast.name} assist)` : ''}${fouled ? ', and one!' : ''}.`, 'make');
      if (fouled) {
        const fouler = this.shootingFouler(def, c, sh);
        this.addFoul(def, fouler, true);
        this.freeThrows(off, def, sh, 1);
        return;
      }
      this.ctx = 'made';
      this.finishPoss(off, def, s.finish);
      return;
    }
    sh.hot = Math.max(0, sh.hot - 1);
    if (fouled) {
      const fouler = this.shootingFouler(def, c, sh);
      this.addPbp(off.side, `${sh.name} fouled on ${desc} by ${fouler.name}.`, 'foul');
      this.addFoul(def, fouler, true);
      if (this.record) this.cur!.steps.push({ k: 'foul', pid: fouler.pid, pid2: sh.pid });
      this.freeThrows(off, def, sh, value);
      return;
    }
    if (blocker) {
      blocker.b.blk++;
      def.tot.blk++;
      this.addPbp(off.side, `${sh.name} ${desc} — blocked by ${blocker.name}.`, 'miss');
    } else {
      this.addPbp(off.side, `${sh.name} misses ${desc}.`, 'miss');
    }
    this.rebound(off, def, zone, !!blocker, false);
  }

  /** Catch on a kick-out: let it fly, or attack a hard closeout. */
  private spotUp(off: ST, def: ST, s: ShotOpts) {
    const sh = s.shooter;
    const t3 = off.t.offense.threePoint / 100;
    const wShoot = Math.pow(Math.max(5, sh.c.c3) / 50, 2.2) * (0.5 + t3) * sh.t3 * (1 + 0.6 * clamp(s.open, -0.5, 1));
    const wDrive = Math.pow(Math.max(5, sh.c.create) / 50, 2) * 0.42 * sh.td * (0.7 + 0.6 * (off.t.offense.rimAttack / 100)) * (1 - 0.35 * clamp(s.open, -0.5, 1));
    if (this.rng.weighted([wShoot, wDrive]) === 0) {
      this.shoot(off, def, s);
      return;
    }
    if (this.record) this.cur!.steps.push({ k: 'drive', pid: sh.pid });
    const d = s.contest ?? this.defOf(def, sh);
    const adv = (sh.c.create - d.c.perDef * this.dq(d)) / 20 + Math.max(0, s.open) * 0.6;
    const r = this.rng.next();
    const zone: ShotZone = r < 0.55 ? 'rim' : r < 0.85 ? 'paint' : 'mid';
    const help = this.help(def);
    this.shoot(off, def, {
      shooter: sh,
      zone,
      open: adv * 0.3 + this.spacingBonus(off) * 0.4 - help * 0.2,
      contest: zone === 'rim' ? def.anchor : d,
      assister: s.assister,
      finish: 'spotup',
      tags: [['help_paint', -help * 0.2]],
    });
  }

  private assistProb(f: FinishType, zone: ShotZone) {
    switch (f) {
      case 'spotup':
        return zone === 'c3' || zone === 'ab3' ? 0.93 : 0.7;
      case 'cut':
        return 0.96;
      case 'pnrRoll':
        return 0.93;
      case 'offscreen':
      case 'handoff':
        return 0.9;
      case 'transition':
        return 0.85;
      case 'post':
        return 0.15;
      default:
        return 0.6;
    }
  }

  private shotDesc(zone: ShotZone, f: FinishType, pullup?: boolean) {
    const r = this.rng;
    switch (zone) {
      case 'rim':
        return f === 'pnrRoll' || f === 'cut' || f === 'transition' ? r.pick(['dunk', 'layup', 'alley-oop', 'layup']) : r.pick(['driving layup', 'layup', 'dunk', 'reverse layup']);
      case 'paint':
        return f === 'post' ? r.pick(['hook shot', 'turnaround', 'post fadeaway']) : r.pick(['floater', 'runner', 'short jumper']);
      case 'mid':
        return pullup ? 'pull-up jumper' : r.pick(['mid-range jumper', 'elbow jumper', 'baseline jumper']);
      case 'c3':
        return 'corner three';
      default:
        return pullup ? r.pick(['pull-up three', 'step-back three']) : r.pick(['three', 'catch-and-shoot three', 'three from the wing']);
    }
  }

  private freeThrows(off: ST, def: ST, sh: SP, n: number, tag?: string) {
    let made = 0;
    let lastMade = false;
    const pressure = this.q >= 4 && this.clock < 60 && Math.abs(off.score - def.score) <= 4 ? 0.02 : 0;
    for (let i = 0; i < n; i++) {
      const p = clamp(sh.ftPct * (0.97 + 0.03 * sh.energy) - pressure, 0.2, 0.97);
      lastMade = this.rng.chance(p);
      sh.b.fta++;
      off.tot.fta++;
      if (i === 0) for (const pl of off.on) pl.b.tFta++;
      if (lastMade) {
        made++;
        sh.b.ftm++;
        off.tot.ftm++;
        this.score(off, def, sh, 1);
      }
    }
    if (this.record) this.cur!.steps.push({ k: 'ft', pid: sh.pid, made: lastMade, v: made });
    this.addPbp(off.side, `${sh.name} ${made}/${n} from the line${tag === 'hack' ? ' (Hack-a)' : ''}.`, 'ft');
    if (lastMade) {
      this.ctx = 'ft';
      this.finishPoss(off, def, this.cur?.finish ?? this.lastFinish);
    } else {
      this.rebound(off, def, 'rim', false, true);
    }
  }

  private rebound(off: ST, def: ST, zone: ShotZone, blocked: boolean, ft: boolean) {
    // blocked shots sometimes go out of bounds to the offense
    if (blocked && this.rng.chance(0.3)) {
      this.ctx = 'orb';
      this.continueAfterOrb(off, def, null);
      return;
    }
    const offR = off.on.reduce((a, p) => a + Math.pow(p.c.orb * (0.85 + 0.15 * p.energy), 1.2), 0);
    const defR = def.on.reduce((a, p) => a + Math.pow(p.c.drb * (0.85 + 0.15 * p.energy), 1.2), 0);
    const crash = (off.t.offense.crashBoards - 50) / 50;
    let pOrb = K.orbBase * Math.pow(offR / defR, 1.05) * (1 + 0.22 * crash);
    if (zone === 'c3' || zone === 'ab3') pOrb *= 1.03;
    if (ft) pOrb *= 0.5;
    if (this.zone(def)) {
      pOrb *= 1.12;
      this.impact('zone_glass', off.side, K.orbBase * 0.12 * 1.05);
    }
    if (crash !== 0) this.impact('crash_orb', off.side, K.orbBase * 0.22 * crash * 1.05);
    pOrb = clamp(pOrb, 0.08, 0.45);
    if (this.rng.chance(pOrb)) {
      const ws = off.on.map((p) => Math.pow(p.c.orb, 2) * p.tor * (p === this.lastShooter ? 1.3 : 1));
      const r = off.on[this.rng.weighted(ws)];
      r.b.orb++;
      off.tot.orb++;
      this.addPbp(off.side, `Offensive rebound ${r.name}.`, 'other');
      if (this.record) this.cur!.steps.push({ k: 'reb', pid: r.pid });
      this.ctx = 'orb';
      this.continueAfterOrb(off, def, r);
      return;
    }
    const ws = def.on.map((p) => Math.pow(p.c.drb, 2.2) * p.tdr);
    const r = def.on[this.rng.weighted(ws)];
    r.b.drb++;
    def.tot.drb++;
    if (this.record) this.cur!.steps.push({ k: 'reb', pid: r.pid });
    this.addPbp(def.side, `Defensive rebound ${r.name}.`, 'other');
    this.ctx = 'dreb';
    this.finishPoss(off, def, this.cur?.finish ?? this.lastFinish);
  }

  private continueAfterOrb(off: ST, def: ST, rebounder: SP | null) {
    this.secondChance = true;
    if (this.clock <= 0.3) {
      this.finishPoss(off, def, 'putback');
      return;
    }
    // immediate putback for bigs near the rim
    if (rebounder && this.rng.chance(clamp(0.25 + (rebounder.r.hgt - 50) / 100 + (rebounder.c.rim - 50) / 150, 0.1, 0.65))) {
      this.tick(this.rng.uniform(0.8, 2.5));
      this.shoot(off, def, { shooter: rebounder, zone: this.rng.chance(0.75) ? 'rim' : 'paint', open: this.rng.normal(-0.3, 0.3), contest: def.anchor, assister: null, finish: 'putback' });
      return;
    }
    // reset with a 14-second shot clock
    const late = this.lateMode(off, def);
    const paceF = 1.12 - 0.24 * (off.t.offense.pace / 100);
    const setup = this.rng.uniform(1.5, 4);
    this.tick(setup);
    if (this.clock <= 0.05) {
      this.finishPoss(off, def, 'putback');
      return;
    }
    this.halfCourt(off, def, 14 - setup, late, paceF);
  }

  private score(off: ST, def: ST, sh: SP, pts: number) {
    off.score += pts;
    off.qs[off.qs.length - 1] += pts;
    off.tot.pts += pts;
    sh.b.pts += pts;
    this.possPts += pts;
    for (const p of off.on) {
      p.b.pm += pts;
      p.b.onPF += pts;
    }
    for (const p of def.on) {
      p.b.pm -= pts;
      p.b.onPA += pts;
    }
    this.lineupStat(off).ptsFor += pts;
    this.lineupStat(def).ptsAgainst += pts;
    if (!sh.starter) off.ex.bench += pts;
    if (this.secondChance) off.ex.secondChance += pts;
    if (this.cur?.kind === 'transition') off.ex.fastBreak += pts;
    if (this.possCtxForTOPts === 'steal' || this.possCtxForTOPts === 'deadTO') off.ex.offTov += pts;
    off.run += pts;
    def.run = 0;
    const lead = off.score - def.score;
    if (lead > off.ex.biggestLead) off.ex.biggestLead = lead;
  }

  private finishPoss(off: ST, _def: ST, finish: FinishType, isTO = false) {
    const key = finish;
    const pt = off.pt[key] ?? (off.pt[key] = { poss: 0, pts: 0 });
    pt.poss++;
    pt.pts += this.possPts;
    void isTO;
    if (this.cur) {
      this.cur.clockEnd = this.clock;
      this.cur.pts = this.possPts;
      this.cur.score = [this.T[0].score, this.T[1].score];
      if (!this.cur.finish) this.cur.finish = finish;
      if (!this.cur.label) this.cur.label = FINISH_LABEL[finish];
      this.logs.push(this.cur);
      this.cur = null;
    }
    this.flow.push(this.T[0].score - this.T[1].score);
    // injuries
    if (this.opts.injuries !== false) this.injuryCheck();
    this.poss = (1 - off.side) as 0 | 1;
    if (this.ctx === 'orb') this.ctx = 'dreb';
  }

  private injuryCheck() {
    const mult = this.opts.injuryMult ?? 1;
    for (const t of this.T) {
      for (const p of t.on) {
        const fatigue = p.energy < 0.6 ? 1.6 : 1;
        if (this.rng.chance(K.injuryRate * mult * t.injMult * fatigue)) {
          p.out = 2;
          p.injured = true;
          this.injuries.push({ pid: p.pid, tid: t.tid, q: this.q });
          this.addPbp(t.side, `${p.name} is injured and leaves the game.`, 'other');
          const bench = t.players.filter((x) => !x.on && x.out === 0);
          if (bench.length) {
            const rep = bench.find((b) => b.big === p.big) ?? bench[0];
            this.applySub(t, t.on.map((x) => (x === p ? rep : x)));
          }
          return;
        }
      }
    }
  }

  private addPbp(side: 0 | 1 | -1, text: string, kind: PbpEntry['kind']) {
    if (!this.record) return;
    this.pbp.push({ q: this.q, clock: Math.max(0, Math.round(this.clock * 10) / 10), t: side, text, hs: this.T?.[0]?.score ?? 0, as: this.T?.[1]?.score ?? 0, kind });
    if (this.cur) this.cur.lines.push(text);
  }

  // ------------------------------------------------------------ results

  result(gid = 0, season = 0, day = 0): GameResult {
    const box = (t: ST): TeamBox => {
      const players: BoxLine[] = t.players.map((p) => ({
        pid: p.pid,
        name: p.full,
        pos: p.pos,
        gs: p.starter,
        min: Math.round(p.b.sec / 6) / 10,
        fgm: p.b.fgm,
        fga: p.b.fga,
        tpm: p.b.tpm,
        tpa: p.b.tpa,
        ftm: p.b.ftm,
        fta: p.b.fta,
        orb: p.b.orb,
        drb: p.b.drb,
        ast: p.b.ast,
        stl: p.b.stl,
        blk: p.b.blk,
        tov: p.b.tov,
        pf: p.b.pf,
        pts: p.b.pts,
        pm: p.b.pm,
        energy: Math.round(p.energy * 100) / 100,
        dnp: p.played ? undefined : p.dnp ?? "Coach's decision",
      }));
      return {
        tid: t.tid,
        pts: t.score,
        quarters: t.qs.slice(),
        players,
        t: { ...t.tot },
        poss: t.poss,
        timeoutsLeft: t.timeouts,
        playTypes: t.pt,
        extra: { ...t.ex },
      };
    };
    // player of the game: game score
    let pog = -1;
    let best = -999;
    for (const t of this.T) {
      for (const p of t.players) {
        const b = p.b;
        const gmsc = b.pts + 0.4 * b.fgm - 0.7 * b.fga - 0.4 * (b.fta - b.ftm) + 0.7 * b.orb + 0.3 * b.drb + b.stl + 0.7 * b.ast + 0.7 * b.blk - 0.4 * b.pf - b.tov + (t.score > this.T[1 - t.side].score ? 2 : 0);
        if (gmsc > best) {
          best = gmsc;
          pog = p.pid;
        }
      }
    }
    return {
      gid,
      season,
      day,
      type: this.opts.type,
      home: box(this.T[0]),
      away: box(this.T[1]),
      ot: Math.max(0, this.q - 4),
      shots: this.shots,
      impacts: [...this.impacts.values()].filter((i) => i.pts >= 0.05).map((i) => ({ ...i, pts: Math.round(i.pts * 100) / 100 })),
      lineups: [...this.lineups.values()].filter((l) => l.sec >= 60),
      flow: this.flow,
      pbp: this.record ? this.pbp : undefined,
      pog,
    };
  }

  /** Raw per-player internal box (with on-court context) for season stat accumulation. */
  rawBoxes(): { tid: number; pid: number; b: Box; played: boolean; starter: boolean }[] {
    const out: { tid: number; pid: number; b: Box; played: boolean; starter: boolean }[] = [];
    for (const t of this.T) for (const p of t.players) out.push({ tid: t.tid, pid: p.pid, b: p.b, played: p.played, starter: p.starter });
    return out;
  }

  /** Drain recorded possession logs (for the live view). */
  drainLogs(): PossLog[] {
    const l = this.logs;
    this.logs = [];
    return l;
  }
}

function ordinal(n: number) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

export type { Box as SimBox, PossStep };
