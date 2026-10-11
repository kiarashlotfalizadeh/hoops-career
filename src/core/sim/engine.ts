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
import { buildMinutePlan, planInputs, planRoles } from './rotationPlan';
import { FINISH_LABEL, type FinishType, type PossLog, type PossStep } from './log';
import { cloneTactics } from './tactics';

// ---------------------------------------------------------------- tuning constants

/** Who gets the block on a contested miss: mostly timing and instincts (BLK), some length and pop. */
const blockSkill = (p: { r: { blk: number; hgt: number; ath: number } }) => 0.7 * p.r.blk + 0.18 * p.r.hgt + 0.12 * p.r.ath;

export const K = {
  zoneBase: { rim: 0.638, paint: 0.458, mid: 0.42, c3: 0.383, ab3: 0.346 } as Record<ShotZone, number>,
  zoneSkill: { rim: 0.15, paint: 0.13, mid: 0.13, c3: 0.1, ab3: 0.1 } as Record<ShotZone, number>,
  zoneOpen: { rim: 0.1, paint: 0.07, mid: 0.055, c3: 0.06, ab3: 0.06 } as Record<ShotZone, number>,
  foulRate: { rim: 0.208, paint: 0.106, mid: 0.041, c3: 0.014, ab3: 0.016 } as Record<ShotZone, number>,
  /** Share of misses that are blocks, for an average contesting defender. */
  blockMiss: { rim: 0.24, paint: 0.154, mid: 0.04, c3: 0.0165, ab3: 0.0165 } as Record<ShotZone, number>,
  /** Extra share of misses blocked by the shooter's own defender (from behind, on the contest). */
  chaseBlock: { rim: 0.06, paint: 0.048, mid: 0.026, c3: 0.01, ab3: 0.01 } as Record<ShotZone, number>,
  orbBase: 0.262,
  toBase: 0.15,
  nonShootFoul: 0.17,
  /** Share of rebounds credited to the team rather than a player (NBA box scores leave these out). */
  teamReb: { orb: 0.02, drb: 0.07 },
  transitionBase: { steal: 0.62, dreb: 0.19, made: 0.035, ft: 0.03, deadTO: 0.03, start: 0, orb: 0 } as Record<string, number>,
  setup: { made: 8.6, dreb: 4.9, steal: 2.0, ft: 8.4, deadTO: 8.0, start: 5.6, orb: 1.0 } as Record<string, number>,
  actionTime: 7.6,
  continueBase: 0.38,
  injuryRate: 0.00042,
  drain: 0.00068,
  recover: 0.0012,
  home: 0.007,
  usageExp: 2.0,
  /** Usage damping counts free-throw attempts (0.44 each); fitted when it counted trips, hence the odd values. */
  usageDamp: 5.2,
  freedomGreen: 1.25,
  freedomLimited: 0.55,
  /** How strongly usage tendency tilts an actor's shoot-vs-pass choice. */
  selfShotExp: 0.6,
  /** Share of a team's actions one player can run before the ball starts finding others. */
  actCap: 0.68,
  /** Assist share of teammates' baskets past which a passer starts looking for his own shot. */
  astCap: 0.45,
  /** Star plan "deny": his share of actions, the advantage he loses catching it late and further out, extra drain on his defender. */
  denyTouch: 0.62,
  denyCatch: 0.3,
  denyDrain: 1.3,
  /** Run-outs against a team that crashed the glass: chance multiplier per unit of crash above 50, and the runners' edge. */
  crashLeak: 1.5,
  crashRunOut: 0.5,
  /** Expected points of one unit of transition advantage, for impact tags. */
  transAdvPts: 0.1,
  /** Diminishing returns on crashing past 50: offensive-board rate given back at 100. */
  crashFade: 0.11,
  /** Share of offensive boards given up at full transition-D sprint back. */
  getBackOrb: 0.08,
  /** Game-to-game conditions shared by both teams (SDs): tempo, field-goal percentage, foul calls. */
  envPace: 0.035,
  envShoot: 0.012,
  envFouls: 0.08,
  /** Score effects: past this second-half margin the leader eases off and the trailer plays
   * loose, up to this much field-goal percentage either way, reached this many points later. */
  easeFrom: 8,
  ease: 0.058,
  easeSpan: 12,
  clutchSec: 240,
  clutchEase: 0.05,
  /**
   * Team feel vs team defense: field-goal percentage per 50 points of difference between the
   * offense's feel (oiq/pas/hnd) and the defense's team defense (diq/perD/intD), past the gap at
   * which real-league scoring is unchanged. Sized so team net ratings track what the players'
   * real box plus-minus says: the OVR model weights these attributes most, and the per-player
   * matchups alone left team defense barely mattering. A matchup form, so fictional leagues
   * (whose players rate higher on both ends) keep their scoring.
   */
  feel: 0.22,
  feelGap: 3,
  /** Full-court press: turnover rate against average ball handlers. */
  pressTO: 0.06,
  /** Blitz: trap turnover rate for an average trap and handler, and the 4-on-3's openness behind it. */
  blitzTO: 0.045,
  blitz4v3: 0.65,
  /** Field-goal percentage a fully physical defense takes off every shot. */
  physContest: 0.01,
  /** Points per switched pick-and-roll the switch takes away (the screen's advantage). */
  switchScreen: 0.04,
  /** Handler's blow-by edge per unit of ball pressure, and the extra edge at full pressure. */
  blowBy: 0.15,
  blowByConvex: 0.8,
  /** Expected points of one unit of handler advantage per action, for impact tags. */
  advPts: { pnr: 0.04, handoff: 0.04, iso: 0.04, post: 0.04 },
  /** Expected points swung by an offensive board, a turnover, and a run-out over a half-court trip, for impact tags. */
  orbPts: 1.6,
  toPts: 1.45,
  runOutPts: 0.35,
};

/** Diagnostics for calibration scripts: made field goals and assisted makes by zone. */
export const engineDiag = {
  made: { rim: 0, paint: 0, mid: 0, three: 0 },
  ast: { rim: 0, paint: 0, mid: 0, three: 0 },
};
export function resetEngineDiag() {
  for (const k of ['rim', 'paint', 'mid', 'three'] as const) {
    engineDiag.made[k] = 0;
    engineDiag.ast[k] = 0;
  }
}

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
  c3M: number;
  c3A: number;
  astM: number; // assisted makes
  onPoss: number;
  onPF: number;
  onPA: number;
  tFga: number;
  tFta: number;
  tTov: number;
  /** actions run as the primary actor, and team actions while on the floor */
  acts: number;
  tActs: number;
  /** team field goals made while on the floor */
  tFgm: number;
}

const newBox = (): Box => ({
  sec: 0,
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
  rimM: 0,
  rimA: 0,
  midM: 0,
  midA: 0,
  c3M: 0,
  c3A: 0,
  astM: 0,
  onPoss: 0,
  onPF: 0,
  onPA: 0,
  tFga: 0,
  tFta: 0,
  tTov: 0,
  acts: 0,
  tActs: 0,
  tFgm: 0,
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
  /** Game second he fouled out. */
  outAt?: number;
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
  /** shot-diet tendencies: mid-range, corner threes, self-creation */
  tm: number;
  tcn: number;
  tcr: number;
  b: Box;
  injured?: boolean;
  /** Played at least a second. */
  played: boolean;
  dnp?: string;
  /** Hard minute cap from the rotation (load management). */
  cap?: number;
  /** Minutes in the stint plan. */
  planMin: number;
}

export interface ST {
  side: 0 | 1;
  tid: number;
  team: Team;
  t: Tactics;
  players: SP[];
  byId: Map<number, SP>;
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
  /** The deep bench is finishing a blowout (stays on until the game is back within reach). */
  garbage: boolean;
  // caches for current lineup
  spacing: number;
  passQ: number;
  helpQ: number;
  speed: number;
  /** How much bite ball pressure has with this lineup: quick hands and on-ball defense. */
  pressQ: number;
  /** The unit's feel on offense (reads, passing, handling) and its team defense (help, on-ball, inside). */
  feelQ: number;
  defQ: number;
  /** guardOf[offensePid] = my defender (filled on the DEFENSIVE team). */
  guardOf: Map<number, SP>;
  lineupKey: string;
  ls: LineupStat | null;
  cap: Record<ActionType, number>;
  subSig: string;
  manualSubs: boolean; // user drives subs live
  injMult: number;
  subLock: Map<number, number>; // pid -> game second until which a manual sub sticks
  /** Chance an AI coach acts on what the opponent is exploiting at a break (0: never). */
  adjust: number;
  /** Period of the coach's last adjustment (one per period). */
  adjustedQ: number;
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
  /** An AI coach who may adjust the game plan at quarter breaks and timeouts (never the user's team). */
  adjust?: boolean;
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

/** Well-mixed 32-bit hash of a seed and a counter (murmur3 finalizer), for derived RNG streams. */
function mix(seed: number, n: number): number {
  let h = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// ---------------------------------------------------------------- engine

export class GameSim {
  T: [ST, ST];
  /** Simulation stream: re-seeded for every possession (see step()). */
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
  /** Index into flow where each period starts. */
  flowPeriods: number[] = [0];
  impacts = new Map<string, TacticImpact>();
  private impactSlots = new Map<string, (TacticImpact | null)[]>();
  lineups = new Map<string, LineupStat>();
  injuries: InGameInjury[] = [];
  private cur: PossLog | null = null;
  private lastShooter: SP | null = null;
  private possPts = 0;
  private possCtxForTOPts: Ctx = 'start';
  private secondChance = false;
  private inTransition = false;
  /** Play type of the possession's latest shot. */
  private possFinish: FinishType = 'misc';
  /** Game seed: every random stream in the game derives from it. */
  private seed: number;
  /** Cosmetic draws (shot spots, play-by-play wording) never touch the simulation stream. */
  private fx: Rng;
  /** Conditions both teams share in this game: tempo, shooting night, how tightly it's called. */
  private env: { pace: number; shoot: number; fouls: number };

  constructor(home: SimTeamInput, away: SimTeamInput, opts: SimOptions) {
    this.seed = Math.floor(opts.rng.next() * 4294967296) >>> 0;
    this.rng = new Rng(mix(this.seed, 0x7fffffff));
    this.fx = new Rng(mix(this.seed, 0x7ffffffe));
    const env = new Rng(mix(this.seed, 0x7ffffffd));
    this.env = {
      pace: clamp(env.normal(1, K.envPace), 0.9, 1.1),
      shoot: clamp(env.normal(0, K.envShoot), -0.04, 0.04),
      fouls: clamp(env.normal(1, K.envFouls), 0.7, 1.3),
    };
    this.opts = opts;
    this.record = !!opts.record;
    this.T = [this.makeTeam(home, 0), this.makeTeam(away, 1)];
    for (const t of this.T) {
      t.plan = this.makePlan(t);
      this.setLineup(t, this.initialLineup(t));
      // the starters are the five on the floor for the tip (the plan may have swapped one in for balance)
      for (const p of t.players) p.starter = p.on;
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
        ...planRoles(p.ratings, p.pos),
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
        useCap: p.tend ? 0.365 : 0.29,
        useDamp: p.tend ? K.usageDamp : 7.3,
        tm: p.tend?.mid ?? 1,
        tcn: p.tend?.corner ?? 1,
        tcr: p.tend?.create ?? 1,
        b: newBox(),
        played: false,
        planMin: 0,
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
    // teammates who share a last name get as much of their first names as tells them apart in
    // play-by-play: "Jal. Williams", "Jay. Williams", "K. Williams"
    roster.forEach((p, i) => {
      const first = p.firstName;
      const mates = roster.filter((o) => o !== p && shortName(o) === shortName(p));
      if (!mates.length || !first || !p.lastName) return;
      let n = 1;
      while (n < first.length && mates.some((o) => o.firstName.toLowerCase().startsWith(first.slice(0, n).toLowerCase()))) n++;
      players[i].name = n < first.length ? `${first.slice(0, n)}. ${p.lastName}` : `${first} ${p.lastName}`;
    });
    return {
      side,
      tid: input.team.tid,
      team: input.team,
      t: tactics,
      players,
      byId: new Map(players.map((p) => [p.pid, p])),
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
      garbage: false,
      spacing: 50,
      passQ: 50,
      helpQ: 50,
      speed: 50,
      pressQ: 50,
      feelQ: 50,
      defQ: 50,
      guardOf: new Map(),
      lineupKey: '',
      ls: null,
      cap: { pnr: 1, iso: 1, post: 1, handoff: 1, motion: 1 },
      injMult: input.injuryMult ?? 1,
      subSig: '',
      manualSubs: false,
      subLock: new Map(),
      adjust: input.adjust ? 0.15 + 0.6 * (input.team.coach.tactics / 100) : 0,
      adjustedQ: 0,
    };
  }

  private available(t: ST): SP[] {
    return t.players.filter((p) => p.out === 0);
  }

  private makePlan(t: ST): number[][] {
    const rot = t.team.rotation;
    const src = t.players.map((p) => ({ pid: p.pid, available: p.out === 0, guard: p.guard, big: p.big, endurance: p.r.end }));
    const planPlayers = planInputs(src, rot, { playoffs: this.opts.type === 'playoffs' });
    if (!planPlayers.length) return [];
    for (const p of t.players) p.cap = rot.caps[p.pid] || undefined;
    const plan = buildMinutePlan(planPlayers);
    for (const slot of plan) for (const pid of slot) t.byId.get(pid)!.planMin++;
    return plan;
  }

  private initialLineup(t: ST): SP[] {
    const ids = t.plan[0] ?? [];
    const lineup = ids.map((id) => t.byId.get(id)!).filter(Boolean);
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
    t.passQ = passes[0] * 0.45 + passes[1] * 0.35 + passes[2] * 0.2 || 50;
    t.helpQ = on.reduce((a, p) => a + p.c.helpD, 0) / on.length;
    t.pressQ = on.reduce((a, p) => a + (p.c.steal + p.c.perDef) / 2, 0) / on.length;
    t.feelQ = on.reduce((a, p) => a + 0.6 * p.r.oiq + 0.25 * p.r.pas + 0.15 * p.r.hnd, 0) / on.length;
    t.defQ = on.reduce((a, p) => a + 0.5 * p.r.diq + 0.3 * p.r.perD + 0.2 * p.r.intD, 0) / on.length;
    t.speed = on.reduce((a, p) => a + p.r.spd, 0) / on.length;
    t.lineupKey = on
      .map((p) => p.pid)
      .sort((a, b) => a - b)
      .join('-');
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
    this.lateTimeouts();
    if (t.timeouts <= 0) return false;
    t.timeouts--;
    for (const tm of this.T) for (const p of tm.players) p.energy = Math.min(1, p.energy + (p.on ? 0.05 : 0.02));
    this.T[0].run = 0;
    this.T[1].run = 0;
    this.addPbp(side, `Timeout ${t.team.abbrev}${reason ? ` (${reason})` : ''}.`, 'timeout');
    if (this.cur) this.cur.steps.push({ k: 'timeout' });
    this.adjust(this.T[0]);
    this.adjust(this.T[1]);
    this.checkSubs(this.T[0], true);
    this.checkSubs(this.T[1], true);
    return true;
  }

  /** Points the team on `side` has gained from an impact key (e.g. 'drop_pullup:o') so far, per 12 minutes played. */
  private gainedRate(side: 0 | 1, key: string) {
    return ((this.impacts.get(`${key}|${side}`)?.pts ?? 0) * GAME.quarterSec) / Math.max(360, this.elapsed);
  }

  /**
   * In-game adjustments by an AI coach at a break: if the opponent is exploiting something
   * (per the impact tags and play-type PPP), change one thing, more often the better the coach.
   */
  private adjust(t: ST) {
    if (!t.adjust || t.adjustedQ === this.q || this.elapsed < 360 || !this.rng.chance(t.adjust)) return;
    const opp = this.T[1 - t.side];
    const d = t.t.defense;
    const rate = (key: string) => this.gainedRate(opp.side, key);
    const ppp = (f: FinishType) => {
      const x = opp.pt[f];
      return x && x.poss >= 6 ? x.pts / x.poss : 0;
    };
    let what = '';
    if (d.scheme !== 'man') {
      if (rate('zone_3pt:o') + rate('zone_glass:o') >= 1) {
        d.scheme = 'man';
        what = 'goes back to man-to-man';
      }
    } else if (d.pnr === 'drop' && (rate('drop_pullup:o') + rate('drop_pop:o') >= 0.8 || ppp('pnrBH') >= 1.15)) {
      d.pnr = 'hedge';
      what = 'hedges ball screens instead of dropping';
    } else if (d.pnr === 'blitz' && rate('blitz_4v3:o') >= 0.6) {
      d.pnr = 'hedge';
      what = 'stops blitzing ball screens';
    } else if (d.pnr !== 'drop' && (ppp('pnrRoll') >= 1.45 || rate('switch_mismatch:o') >= 0.8 || rate('hedge_roll:o') >= 0.6)) {
      d.pnr = 'drop';
      d.switchOffBall = false;
      what = 'drops the big on ball screens';
    }
    if (!what) {
      if (rate('help_kick:o') >= 0.6 && d.help > 30) {
        d.help -= 15;
        what = 'stays home on shooters';
      } else if (rate('help_paint:o') + rate('spacing:o') >= 0.6 && d.help < 75) {
        d.help += 15;
        what = 'packs the paint';
      } else if (rate('pressure_blowby:o') + rate('pressure_backdoor:o') + rate('pressure_foul:o') >= 0.5 && d.pressure > 35) {
        d.pressure -= 15;
        what = 'backs off the ball';
      } else if (rate('crash_leak:o') >= 0.5 && t.t.offense.crashBoards > 25) {
        t.t.offense.crashBoards -= 20;
        what = 'sends fewer players to the offensive glass';
      } else if (rate('getback:o') >= 0.4 && d.getBack < 80) {
        d.getBack += 15;
        what = 'sprints back in transition';
      }
    }
    if (!what) return;
    t.adjustedQ = this.q;
    this.addPbp(t.side, `${t.team.abbrev} adjusts: ${what}.`, 'other');
  }

  // ------------------------------------------------------------ main loop

  /** Simulate one possession. Returns false when the game is over. */
  step(): boolean {
    if (this.over) return false;
    if (this.clock <= 0.05) {
      if (!this.endPeriod()) return false;
    }
    // common random numbers: each team's n-th possession draws from its own stream, so two
    // versions of the same game (Tactics Lab comparisons) stay paired possession by possession
    this.rng = new Rng(mix(this.seed, 2 * this.T[this.poss].poss + this.poss));
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
    // the last fraction of a second still counts: exactly 48 minutes (plus overtime) are played
    this.tick(this.clock);
    const [h, a] = this.T;
    if (this.q >= 4 && h.score !== a.score) {
      this.over = true;
      this.addPbp(-1, `End of game. ${h.team.abbrev} ${h.score}, ${a.team.abbrev} ${a.score}.`, 'period');
      return false;
    }
    const label = this.q <= 4 ? `${ordinal(this.q)} quarter` : `OT${this.q - 4 > 1 ? this.q - 4 : ''}`;
    this.addPbp(-1, `End of ${label}. ${h.team.abbrev} ${h.score}, ${a.team.abbrev} ${a.score}.`, 'period');
    this.q++;
    this.flowPeriods.push(this.flow.length);
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
    for (const t of this.T) this.adjust(t);
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

  /** At his hard minute cap: he sits unless nobody else can play. */
  private capped(p: SP) {
    return p.cap !== undefined && p.b.sec >= p.cap * 60 - 10;
  }

  private desiredLineup(t: ST): SP[] {
    const avail = (p: SP) => p.out === 0 && !this.capped(p);
    let desired: SP[];
    const margin = Math.abs(this.T[0].score - this.T[1].score);
    // once the bench is in it stays: a lead dipping to 14 with seconds left doesn't bring the starters back
    if (this.q >= 4 && ((this.clock < 300 && margin >= 22) || (this.clock < 150 && margin >= 16))) t.garbage = true;
    else if (margin <= 6 + this.clock / 30) t.garbage = false;
    const garbage = t.t.manage.garbageTime && this.q >= 4 && t.garbage;
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
      desired = slot.map((pid) => t.byId.get(pid)!).filter((p) => p && avail(p));
    } else {
      // overtime: closers / best players with energy
      const closers = t.team.rotation.closers.map((pid) => t.byId.get(pid)).filter((p): p is SP => !!p && avail(p));
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
    // fatigue: swap exhausted players for rested teammates of the same type (in the playoffs,
    // only players in the shortened rotation)
    const fatigueLine = t.t.manage.fatigueSub;
    const playoffs = this.opts.type === 'playoffs';
    const bench = ordered.filter((p) => !desired.includes(p) && (crunch || p.fouls < limit));
    desired = desired.map((p) => {
      if (p.energy >= fatigueLine || crunch) return p;
      const alt = bench.filter((b) => b.energy > 0.82 && b.big === p.big && (!playoffs || b.planMin > 0)).sort((a, b) => b.c.helpD + b.c.create - (a.c.helpD + a.c.create))[0];
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
    // last resort: allow players over the foul limit, then players past their minute cap
    for (const p of [...ordered, ...t.players.filter((x) => x.out === 0)]) {
      if (desired.length >= 5) break;
      if (!desired.includes(p)) desired.push(p);
    }
    return desired.slice(0, 5);
  }

  private subSignature(t: ST): string {
    const fl = t.t.manage.fatigueSub;
    let sig = `${this.q <= 4 ? this.planSlot() : 'ot' + this.q}|${this.foulLimit(t)}|`;
    for (const p of t.players) sig += p.out + (p.on ? (p.energy < fl ? 'f' : 'o') : p.energy > 0.82 ? 'r' : 'b') + p.fouls + (this.capped(p) ? 'k' : '');
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
      const lockedOut = new Set(t.players.filter((p) => !p.on && locked(p)).map((p) => p.pid));
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

  /** NBA: no more than two timeouts each after the 3:00 mark of the fourth quarter. */
  private lateTimeouts() {
    if (this.q === 4 && this.clock <= 180) for (const t of this.T) t.timeouts = Math.min(t.timeouts, 2);
  }

  private autoTimeouts() {
    this.lateTimeouts();
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
      // face-guarding the star on defense wears out his defender
      const off = this.T[1 - t.side];
      const denier = t.side !== this.poss && t.t.defense.starPlan === 'deny' ? this.starTarget(t, off) : null;
      const denyD = denier ? t.guardOf.get(denier.pid) : undefined;
      for (const p of t.players) {
        if (p.on) {
          p.b.sec += dt;
          p.stint += dt;
          let drain = K.drain * (1.4 - 0.75 * (p.r.end / 100)) * paceMult;
          if (press) drain *= 1.15;
          if (t.t.defense.press === 'always') drain *= 1.12;
          if (p === denyD) drain *= K.denyDrain;
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
    let w = roleU * p.freedom * p.tu * p.tcr * Math.pow(Math.max(5, skill) / 50, K.usageExp) * (0.75 + 0.25 * p.energy) * p.perf;
    if (t.t.offense.hotHand && p.hot >= 3) w *= 1.25;
    // defenses load up on a high-usage player as the game goes on
    const teamUse = p.b.tFga + 0.44 * p.b.tFta + p.b.tTov;
    if (teamUse >= 12.5) {
      const share = (p.b.fga + 0.44 * p.b.fta + p.b.tov) / teamUse;
      if (share > p.useCap) w *= Math.exp(-p.useDamp * (share - p.useCap));
    }
    // even a heliocentric offense moves the ball: past ~2/3 of his team's actions, others get it
    if (p.b.tActs >= 20) {
      const act = p.b.acts / p.b.tActs;
      if (act > K.actCap) w *= Math.exp(-5 * (act - K.actCap));
    }
    return w;
  }

  /**
   * Passing tendency right now: his fitted tendency, braked once he has assisted on more than
   * ~45% of his teammates' baskets in this game (real assist percentages top out near there).
   */
  private passT(p: SP): number {
    const mates = p.b.tFgm - p.b.fgm;
    if (mates < 10) return p.tp;
    const share = p.b.ast / mates;
    return share > K.astCap ? p.tp * Math.exp(-10 * (share - K.astCap)) : p.tp;
  }

  /** Shoot-vs-pass tilt for a player with the ball in an action: high-usage players hunt their own shot. */
  private selfShot(p: SP): number {
    return Math.pow(clamp(p.tu, 0.1, 25), K.selfShotExp);
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
    // star plan "deny": face-guarding keeps the ball out of his hands
    const def = this.T[1 - t.side];
    if (def.t.defense.starPlan === 'deny') {
      const i = t.on.indexOf(this.starTarget(def, t)!);
      if (i >= 0) ws[i] *= K.denyTouch;
    }
    const actor = t.on[this.rng.weighted(ws)];
    for (const p of t.on) p.b.tActs++;
    actor.b.acts++;
    return actor;
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

  /**
   * Who contests a shot at the rim: the shooter's own man or a helper, weighted by rim
   * protection (a real anchor gets to a big share of them, not all) and how hard the scheme
   * helps. `pull` scales the helpers (drop coverage parks the big at the rim; a scrambled
   * transition defense has fewer helpers back).
   */
  private rimContester(def: ST, own: SP | null, pull = 1): SP {
    const help = 1 + 0.4 * this.help(def);
    const ws = def.on.map((p) => {
      const w = Math.pow(Math.max(10, p.c.rimProt * this.dq(p)) / 50, 3);
      return p === own ? w * 2.2 : w * help * pull;
    });
    return def.on[this.rng.weighted(ws)];
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
    let ctx = this.ctx;
    this.possPts = 0;
    this.secondChance = false;
    this.inTransition = false;
    this.possFinish = 'misc';
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

    // ---- end-of-game: intentional fouls by the defense (short of the penalty, a side out)
    if (!this.opts.simple) {
      const foul = this.intentionalFoul(off, def);
      if (foul === 'ft') return;
      if (foul === 'sideout') ctx = 'deadTO';
    }

    const late = this.lateMode(off, def);
    const paceF = this.paceF(off);

    // ---- full court press
    let pressBroken = false;
    const pressOn = def.t.defense.press === 'always' || (def.t.defense.press === 'afterMade' && (ctx === 'made' || ctx === 'ft'));
    if (pressOn && (ctx === 'made' || ctx === 'ft' || ctx === 'deadTO' || ctx === 'start') && !late.hold) {
      const res = this.press(off, def);
      if (res === 'to') return;
      pressBroken = res === 'broken';
    }

    // ---- transition
    const push = 0.55 + 0.9 * (off.t.offense.transition / 100);
    let transP = (K.transitionBase[ctx] ?? 0) * push;
    transP *= 1 + (off.speed - def.speed) / 120;
    const getBack = 1.25 - 0.5 * (def.t.defense.getBack / 100);
    transP *= getBack;
    // crashing the offensive glass leaves you exposed (the defense crashed on its last
    // possession): a little below 50, a lot above it
    const crashLeak = ctx === 'dreb' ? (def.t.offense.crashBoards - 50) / 50 : 0;
    const leak = 1 + (crashLeak > 0 ? K.crashLeak : 0.35) * crashLeak;
    transP *= leak;
    if (pressBroken) transP = 0.75;
    if (late.hold || late.milk) transP *= 0.2;
    if (late.hurry) transP *= 1.5;

    if (this.clock > 2 && this.rng.chance(clamp(transP, 0, 0.85))) {
      // each setting's share of the run-outs, at ~0.25-0.35 pts per run-out over a half-court trip
      if (!pressBroken) {
        this.impact('transition', o, (0.25 * (push - 1)) / push);
        this.impact('getback', (1 - o) as 0 | 1, (K.runOutPts * (1 - getBack)) / getBack);
        if (leak !== 1) this.impact('crash_leak', o, (K.runOutPts * (leak - 1)) / leak + K.crashRunOut * Math.max(0, crashLeak) * K.transAdvPts);
      }
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
    if (late.quick || late.hurry) setup = Math.min(setup, 2.5);
    // the period is about to run out: push it up the floor and get a shot off before the buzzer
    if (this.clock >= 2.5 && setup > this.clock - 2.5) setup = Math.max(0.5, this.clock * 0.4);
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

  /** Time multiplier for setups and actions: the team's pace, in this game's tempo. */
  private paceF(off: ST) {
    return (1.12 - 0.24 * (off.t.offense.pace / 100)) / this.env.pace;
  }

  private lateMode(off: ST, def: ST) {
    const diff = off.score - def.score;
    const final = this.q >= 4;
    const clock = this.clock;
    const res = { hold: false, quick: false, milk: false, need3: false, hurry: false };
    if (final && clock <= 26 && diff >= -2 && diff <= 0) res.hold = true;
    else if (!final && clock <= 24 && clock > 3) res.hold = true;
    else if (final && clock < 50 && diff > 0) res.milk = true;
    if (final && clock <= 35 && diff <= -3 && diff >= -5) res.need3 = true;
    if (final && clock <= 12 && diff === -3) res.need3 = true;
    // two possessions or more down late, still within reach: quick shots, more of them threes
    if (final && diff <= -4 && diff >= -3 - clock / 12 && clock > 1 && clock <= 20 + 10 * -diff) res.hurry = true;
    if (off.t.manage.twoForOne && clock >= 29 && clock <= 40 && !(final && diff > 0)) res.quick = true;
    return res;
  }

  private intentionalFoul(off: ST, def: ST): 'ft' | 'sideout' | null {
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
    if (!fouled && final && def.t.manage.foulUp3 && defDiff === 3 && clock <= 7 && clock >= 1.5) {
      const ws = off.on.map((p) => this.usageWeight(p, off, 'any'));
      fouled = off.on[this.rng.weighted(ws)];
      tag = 'foul_up3';
    }
    const hack = def.t.manage.hackThreshold;
    if (!fouled && hack > 0 && !(final && clock < 120)) {
      const target = off.on.filter((p) => p.ftPct * 100 < hack).sort((a, b) => a.ftPct - b.ftPct)[0];
      if (target && this.rng.chance(0.8)) {
        fouled = target;
        tag = 'hack';
      }
    }
    if (!fouled) return null;
    if (this.cur) {
      this.cur.kind = 'ft';
      this.cur.label = tag === 'hack' ? `Hack-a-${fouled.name}` : 'Intentional foul';
    }
    // late-game fouls come right on the catch and never let the clock run out; short of the
    // penalty a foul is only a side out, so a late foul is repeated until it sends him to the line
    for (let n = 0; n < 5 && this.clock > 0.3; n++) {
      const dt = tag === 'hack' ? this.rng.uniform(3, 7) : Math.min(this.clock - 0.3, this.rng.uniform(0.6, 2.4));
      this.tick(Math.max(0.2, dt));
      const fouler = def.on.reduce((a, p) => (p.fouls < a.fouls ? p : a), def.on[0]);
      if (this.record) {
        this.cur!.steps.push({ k: 'foul', pid: fouler.pid, pid2: fouled.pid });
        this.addPbp(def.side, `${fouler.name} intentional foul on ${fouled.name}.`, 'foul');
      }
      this.addFoul(def, fouler);
      if (this.bonus(def)) {
        // expected value vs a normal possession (~1.12)
        if (tag === 'hack') this.impact('hack', def.side, 1.12 - fouled.ftPct * 2, fouled.pid);
        this.freeThrows(off, def, fouled, 2, 'misc');
        return 'ft';
      }
      // a hack away from the penalty is just a side out: the possession goes on
      if (tag === 'hack') break;
    }
    return 'sideout';
  }

  /** In the penalty: from the fifth team foul of a quarter (fourth in overtime), or the second in a period's last two minutes. */
  bonus(def: ST) {
    return def.fouls >= GAME.bonusFouls - (this.q > 4 ? 1 : 0) || (this.clock < 120 && def.foulsLast2 >= 2);
  }

  // ------------------------------------------------------------ press

  private press(off: ST, def: ST): 'to' | 'broken' | 'neutral' {
    const handlers = [...off.on].sort((a, b) => b.c.ballSec - a.c.ballSec);
    const h = handlers[0];
    const trapQ = def.on.reduce((a, p) => a + p.c.steal + p.r.spd, 0) / (def.on.length * 2);
    const secQ = (h.c.ballSec + handlers[1].c.ballSec + off.passQ) / 3;
    const adv = (secQ - trapQ) / 20;
    const pTO = clamp(K.pressTO - adv * 0.035, 0.02, 0.16);
    const pBroken = clamp(0.2 + adv * 0.08, 0.06, 0.4);
    this.tick(this.rng.uniform(3, 6));
    if (this.cur) {
      this.cur.kind = 'press';
      this.cur.steps.push({ k: 'press', pid: h.pid });
    }
    // expected value accounting: TOs forced vs easy baskets given up
    this.impact('press_to', def.side, (pTO - 0.012) * K.toPts);
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
    this.inTransition = true;
    if (this.cur) {
      this.cur.kind = 'transition';
      this.cur.label = pressBroken ? 'Press broken!' : ctx === 'steal' ? 'Run-out off the steal' : 'Transition';
    }
    const ws = off.on.map((p) => (p.r.spd + p.c.create * 0.6) * (p.guard ? 1.4 : 0.7) * Math.sqrt(p.tu));
    const h = off.on[this.rng.weighted(ws)];
    this.tick(this.rng.uniform(3, 6.5));
    if (this.record) this.cur!.steps.push({ k: 'transition', pid: h.pid });
    let adv = (off.speed - def.speed) / 25 + (ctx === 'steal' ? 0.7 : 0.15) + (pressBroken ? 0.6 : 0);
    adv -= (def.t.defense.getBack - 50) / 100;
    // fewer defenders back when they crashed the glass
    if (ctx === 'dreb') adv += K.crashRunOut * Math.max(0, (def.t.offense.crashBoards - 50) / 50);
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
      Math.pow(h.c.rim / 50, 1.5) * 0.6 * h.td * (1 + adv * 0.3) * this.selfShot(h), // attack rim
      Math.pow(trailer.c.c3 / 50, 2) * 0.55 * threePref * trailer.t3 * (this.passT(h) / h.tp), // trailing three
      Math.pow(h.c.pu3 / 50, 2) * 0.35 * threePref * h.t3 * this.selfShot(h), // pull-up three
      1.0 * Math.pow(Math.max(5, h.c.passing) / 50, 1.2) * this.passT(h), // drop-off to a runner
    ];
    const c = this.rng.weighted(opts);
    const d = this.defOf(def, h);
    if (c === 0) {
      this.shoot(off, def, { shooter: h, zone: 'rim', open: -0.08 + adv * 0.3, contest: this.rimContester(def, d, 0.8), assister: null, finish: 'transition' });
    } else if (c === 1) {
      this.passStep(h, trailer);
      this.shoot(off, def, {
        shooter: trailer,
        zone: this.rng.chance(0.4) ? 'c3' : 'ab3',
        open: 0.08 + adv * 0.25,
        contest: this.defOf(def, trailer),
        assister: h,
        finish: 'transition',
      });
    } else if (c === 2) {
      this.shoot(off, def, { shooter: h, zone: 'ab3', open: 0.1 + adv * 0.2, contest: d, assister: null, finish: 'transition', pullup: true });
    } else {
      const runners = off.on.filter((p) => p !== h);
      const runner = runners[this.rng.weighted(runners.map((p) => p.c.rim + p.r.spd))];
      this.passStep(h, runner);
      this.shoot(off, def, {
        shooter: runner,
        zone: 'rim',
        open: 0.06 + adv * 0.3,
        contest: this.rimContester(def, this.defOf(def, runner), 0.8),
        assister: h,
        finish: 'transition',
      });
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
      if (late.hurry) dt = Math.min(dt, 4);
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
        return 1.5 * Math.pow((t.passQ + t.spacing) / 2 / 50, 1.5);
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
    let three = 0.48 + 0.8 * t3;
    let mid = 1.43 - 0.95 * t3;
    const rim = 0.7 + 0.6 * (off.t.offense.rimAttack / 100);
    if (late.need3) {
      three *= 6;
      mid *= 0.1;
    } else if (late.hurry) {
      three *= 1.8;
      mid *= 0.5;
    }
    return { three, mid, rim: late.need3 ? rim * 0.15 : rim };
  }
  /**
   * Second-half score effects: a big lead makes the leader ease off and the trailer play loose;
   * late in a close game the leader plays not to lose and the trailer presses.
   */
  private scoreEffect(off: ST, def: ST) {
    if (this.q < 3) return 0;
    const m = off.score - def.score;
    let x = clamp((Math.abs(m) - K.easeFrom) / K.easeSpan, 0, 1) * K.ease;
    if (this.q >= 4 && this.clock < K.clutchSec && m !== 0 && Math.abs(m) <= 6) x += K.clutchEase;
    return m > 0 ? -x : x;
  }
  /** Star plan "deny": when the face-guarded star does get the ball, he catches it late and further out. */
  private denyCatch(def: ST, off: ST, p: SP, from: 'pnr' | 'handoff' | 'iso' | 'post'): number {
    if (def.t.defense.starPlan !== 'deny' || this.starTarget(def, off) !== p) return 0;
    this.impact('star_deny', def.side, K.denyCatch * K.advPts[from], p.pid);
    return K.denyCatch;
  }
  /** Defensive effectiveness modifier from fatigue. */
  private dq(p: SP) {
    return (0.86 + 0.14 * p.energy) * (0.97 + 0.03 * p.perf);
  }
  private spacingBonus(off: ST) {
    return (off.spacing - 45) / 100; // ~ -0.3..+0.35
  }
  private toChance(base: number, handler: SP, def: ST, extra = 0) {
    // pressing forces turnovers only as well as the defenders can: an average lineup gets about
    // half of what quick hands and feet would (containing costs turnovers whoever plays)
    const pr0 = this.pressure(def);
    const pr = pr0 > 0 ? pr0 * clamp(0.5 + (def.pressQ - 50) / 16, 0.15, 1.2) : pr0;
    const p = (base * (1 + 0.32 * pr) * (1 - (handler.c.ballSec - 50) / 140) + extra) * handler.ttv;
    if (pr !== 0) this.impact('pressure_to', def.side, base * 0.32 * pr * (1 - (handler.c.ballSec - 50) / 140) * handler.ttv * K.toPts, handler.pid);
    return clamp(p, 0.01, 0.4);
  }
  /**
   * The handler's edge against ball pressure: an overplaying defender gets beaten off the
   * dribble (more so the harder he presses), a containing one stays in front.
   */
  private blowBy(def: ST, h: SP, from: 'pnr' | 'handoff' | 'iso'): number {
    const pr = this.pressure(def);
    const edge = K.blowBy * pr + K.blowByConvex * Math.max(0, pr) ** 2;
    if (edge !== 0) this.impact('pressure_blowby', (1 - def.side) as 0 | 1, edge * K.advPts[from], h.pid);
    return edge;
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
    let dH = this.defOf(def, H);
    let dS = this.defOf(def, S);
    const zone = this.zone(def);
    let cov: PnrCoverage | 'zone' = zone ? 'zone' : def.t.defense.pnr;
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
    let advH = (H.c.pnrHandle * H.perf - dH.c.perDef * this.dq(dH)) / 22 + screen + this.rng.normal(0, 0.55) + open - this.denyCatch(def, off, H, 'pnr');

    // ---- coverage branches
    if (cov === 'switch') {
      // after the switch: H vs dS (often a big), S vs dH (often a guard). The switch takes away
      // the screen's advantage; the offense gains (or loses) whatever the new matchup is worth
      // compared with the one it had
      const isoAdv = (H.c.create - dS.c.perDef * this.dq(dS)) / 20;
      const postAdv = (S.c.postScore - dH.c.intDef * this.dq(dH)) / 20 + (S.r.hgt - dH.r.hgt) / 50;
      this.impact('switch_screen', def.side, K.switchScreen, H.pid);
      if (postAdv > isoAdv + 0.25 && S.c.postScore > 50 && this.rng.chance(0.7)) {
        const gain = ((dS.c.intDef * this.dq(dS) - dH.c.intDef * this.dq(dH)) / 20 + (dS.r.hgt - dH.r.hgt) / 70) * K.advPts.post;
        this.impact('switch_mismatch', off.side, gain, S.pid);
        this.passStep(H, S);
        return this.post(off, def, open + 0.1, forced, { actor: S, defender: dH, tag: 'switch_mismatch', entry: H });
      }
      this.impact('switch_mismatch', off.side, ((dH.c.perDef * this.dq(dH) - dS.c.perDef * this.dq(dS)) / 20) * K.advPts.iso, H.pid);
      return this.iso(off, def, open, late, forced, { actor: H, defender: dS, tag: 'switch_mismatch', fromPnr: true });
    }

    if (cov !== 'blitz') advH += this.blowBy(def, H, 'pnr');
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
      const pTrapTO = clamp(K.blitzTO + trap * 0.2 - escape * 0.3, 0.02, 0.18);
      toExtra += pTrapTO;
      this.impact('blitz_to', def.side, pTrapTO * H.ttv * K.toPts, H.pid);
      // 4-on-3 behind the trap: quality scales with the handler's passing and the short-roll big
      const fourThree = K.blitz4v3 + escape * 0.6 + (S.c.passing - 50) / 200;
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
      // the screener's man makes the play: the pocket pass to the roller (a roll-man turnover)
      const onRoll = !this.rng.chance(0.6);
      this.turnover(off, def, H, this.stealBy(onRoll ? dS : dH, 0.6), onRoll ? 'pnrRoll' : 'pnrBH');
      return 'done';
    }
    // non-shooting foul; a defender who fouled out on it has been replaced
    if (this.nonShootingFoul(off, def, H, dH, 'pnrBH')) return 'done';
    if (!dH.on || !dS.on) {
      dH = this.defOf(def, H);
      dS = this.defOf(def, S);
    }

    // decision: a high-usage handler looks for his own shot more, a low-usage one moves it on
    const fr = H.freedom * this.selfShot(H);
    const opts = [
      handlerShoots * Math.pow(H.c.pu3 / 50, 2.4) * pf.three * 0.27 * fr * H.t3 * (1 + pullOpen), // pull-up 3
      handlerShoots * Math.pow(H.c.midShot / 50, 2.2) * pf.mid * 0.22 * fr * Math.sqrt(H.tm) * (1 + pullOpen), // pull-up 2
      handlerShoots * Math.pow(H.c.rim / 50, 1.6) * pf.rim * 0.32 * fr * H.td * (1 + advH * 0.4 + rimOpen * 0.5), // drive
      Math.pow(H.c.passing / 50, 1.2) *
        this.passT(H) *
        Math.pow(Math.max(S.c.roll, 5) / 50, 1.5) *
        (Math.pow(S.tu, 0.75) / Math.sqrt(S.tcr)) *
        0.85 *
        (1 + rollOpen) *
        (S.c.pop > S.c.roll ? 0.4 : 1), // roll
      S.c.pop > 50
        ? Math.pow(H.c.passing / 50, 1.2) * this.passT(H) * Math.pow(S.c.pop / 50, 2) * (Math.pow(S.tu, 0.75) / Math.sqrt(S.tcr)) * 0.45 * pf.three * S.t3 * (1 + popOpen)
        : 0.01, // pop
      Math.pow(H.c.passing / 50, 1.3) * this.passT(H) * (off.spacing / 50) * 1.1 * (1 + kickOpen), // kick out
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
        this.shoot(off, def, {
          shooter: H,
          zone: this.midOr(H, 0.55),
          open: advOpen + pullOpen + open,
          contest: dH,
          assister: null,
          finish: 'pnrBH',
          tags: tagsPull,
          pullup: true,
        });
        return 'done';
      case 2: {
        if (this.record) this.cur!.steps.push({ k: 'drive', pid: H.pid });
        const zone: ShotZone = this.rimOr(H, 0.68);
        this.shoot(off, def, {
          shooter: H,
          zone,
          open: advOpen + rimOpen + open,
          contest: zone === 'rim' ? this.rimContester(def, dH, cov === 'drop' ? 1.5 : 1) : dS,
          assister: null,
          finish: 'pnrBH',
          tags: tagsRim,
        });
        return 'done';
      }
      case 3: {
        this.passStep(H, S);
        const shortRoll = clamp(0.04 + (S.c.passing - 50) / 300, 0.01, 0.2) * Math.sqrt(this.passT(S)) * (cov === 'blitz' || cov === 'hedge' ? 1.8 : 1);
        if (this.rng.chance(clamp(shortRoll, 0, 0.5))) {
          const sh = this.kickTarget(off, H, S);
          this.passStep(S, sh);
          const d = this.defOf(def, sh);
          this.spotUp(off, def, {
            shooter: sh,
            zone: this.cornerOrWing(off, sh),
            open: 0.12 + Math.max(0, rollOpen) * 0.5 + open,
            contest: d,
            assister: S,
            finish: 'spotup',
            tags: tagsRoll,
          });
          return 'done';
        }
        const rollAdv = (S.c.roll - dS.c.intDef * this.dq(dS)) / 25;
        this.shoot(off, def, {
          shooter: S,
          zone: this.rimOr(S, 0.75),
          open: rollAdv * 0.4 + rollOpen - 0.32 + open,
          contest: cov === 'blitz' ? this.rimContester(def, null, 1) : this.rimContester(def, dS, cov === 'drop' ? 1.3 : 1),
          assister: H,
          finish: 'pnrRoll',
          tags: tagsRoll,
        });
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
        this.spotUp(off, def, {
          shooter: sh,
          zone: this.cornerOrWing(off, sh),
          open: kickOpen + advOpen * 0.4 - closeout + open,
          contest: d,
          assister: H,
          finish: 'spotup',
          tags: tagsKick,
        });
        return 'done';
      }
      default:
        return { carry: clamp(advOpen * 0.3, -0.1, 0.2), ball: H };
    }
  }

  private kickTarget(off: ST, ...exclude: SP[]): SP {
    const ws = off.on.map((p) =>
      exclude.includes(p)
        ? 0
        : (Math.pow(Math.max(5, p.c.c3) / 50, 2) * Math.sqrt(p.t3) * Math.pow(p.tu, 0.75) * (0.6 + 0.4 * p.freedom) * (p.role === 'shooter' || p.role === 'glue' ? 1.3 : 1)) /
          Math.sqrt(p.tcr),
    );
    return off.on[this.rng.weighted(ws)];
  }

  private cornerOrWing(off: ST, sh?: SP): ShotZone {
    const base = 0.27 + (off.t.offense.threePoint - 50) / 400;
    const w = base * (sh?.tcn ?? 1);
    return this.rng.chance(w / (w + 1 - base)) ? 'c3' : 'ab3';
  }

  /** Close finish: at the rim with base probability `pRim`, else a floater/hook; tilted by his drive tendency. */
  private rimOr(p: SP, pRim: number): ShotZone {
    const w = pRim * Math.sqrt(p.td);
    return this.rng.chance(w / (w + 1 - pRim)) ? 'rim' : 'paint';
  }

  /** Pull-up / floater zone: mid-range with base probability `pMid`, tilted by his mid-range tendency. */
  private midOr(p: SP, pMid: number): ShotZone {
    const w = pMid * p.tm;
    return this.rng.chance(w / (w + 1 - pMid)) ? 'mid' : 'paint';
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
    let D = fixed?.defender ?? this.defOf(def, A);
    const finish: FinishType = fixed?.fromPnr ? 'pnrBH' : 'iso';
    if (this.cur && !fixed) this.cur.label = `Isolation: ${A.name} on ${D.name}`;
    if (this.cur && fixed) this.cur.label = `Switch! ${A.name} attacks ${D.name}`;
    const pf = this.prefs(off, late);
    const help = this.help(def);
    let adv = (A.c.create * A.perf - D.c.perDef * this.dq(D)) / 20 + (A.r.str - D.r.str) / 140 + this.rng.normal(0, 0.6) + open;
    if (!fixed) adv -= this.denyCatch(def, off, A, 'iso');
    const pr = this.pressure(def);
    // pressure: aggressive defenders get blown by, quick creators most of all
    adv += this.blowBy(def, A, 'iso');
    if (pr > 0) {
      const blow = pr * clamp((A.c.create - 55) / 50, 0, 0.5);
      adv += blow;
      this.impact('pressure_blowby', off.side, blow * K.advPts.iso, A.pid);
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
    if (this.nonShootingFoul(off, def, A, D, finish)) return 'done';
    if (!D.on) D = this.defOf(def, A);
    const spacing = this.spacingBonus(off);
    const rimOpen = adv * 0.35 + spacing * 0.5 - help * 0.25;
    const sizeEdge = (A.r.hgt - D.r.hgt) / 25;
    const ss = this.selfShot(A);
    const opts = [
      Math.pow(A.c.rim / 50, 1.7) * pf.rim * A.td * (1 + rimOpen) * ss,
      Math.pow(A.c.midShot / 50, 2.3) * pf.mid * 0.9 * Math.sqrt(A.tm) * ss,
      Math.pow(A.c.pu3 / 50, 2.5) * pf.three * 0.6 * A.t3 * ss,
      sizeEdge > 0.3 ? Math.pow(A.c.postScore / 50, 2) * sizeEdge : 0,
      Math.pow(A.c.passing / 50, 1.2) * 0.8 * this.passT(A) * (1 + Math.max(0, help)),
      forced ? 0 : K.continueBase * (adv < -0.3 ? 1.4 : 0.5),
    ];
    const c = this.rng.weighted(opts);
    const advOpen = clamp(adv * 0.35, -0.7, 0.75);
    const tagged = (extra: [string, number][]) => extra;
    switch (c) {
      case 0: {
        const zone: ShotZone = this.rimOr(A, 0.62);
        const hp = -help * 0.25;
        this.shoot(off, def, {
          shooter: A,
          zone,
          open: advOpen + spacing * 0.5 + hp - 0.08,
          contest: zone === 'rim' ? this.rimContester(def, D) : D,
          assister: null,
          finish,
          tags: tagged([
            ['help_paint', hp],
            ['spacing', spacing * 0.5],
          ]),
        });
        return 'done';
      }
      case 1:
        this.shoot(off, def, { shooter: A, zone: this.midOr(A, 0.7), open: advOpen - 0.12, contest: D, assister: null, finish, tags: tagged([]), pullup: true });
        return 'done';
      case 2:
        this.shoot(off, def, { shooter: A, zone: 'ab3', open: advOpen * 0.6 - 0.2, contest: D, assister: null, finish, tags: tagged([]), pullup: true });
        return 'done';
      case 3:
        return this.post(off, def, open, forced, { actor: A, defender: D, tag: fixed?.tag ?? 'mismatch_post', entry: null });
      case 4: {
        const sh = this.kickTarget(off, A);
        this.passStep(A, sh);
        const ko = 0.15 + Math.max(0, help) * 0.3;
        this.spotUp(off, def, {
          shooter: sh,
          zone: this.cornerOrWing(off, sh),
          open: ko + advOpen * 0.3,
          contest: this.defOf(def, sh),
          assister: A,
          finish: 'spotup',
          tags: [['help_kick', Math.max(0, help) * 0.3]],
        });
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
    const pTO = clamp((0.1 - escape * 0.25) * A.ttv, 0.03, 0.2);
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
        this.shoot(off, def, { shooter: sh, zone: 'rim', open: o * 0.6, contest: this.rimContester(def, this.defOf(def, sh), 1.2), assister: A, finish: 'cut' });
      } else {
        this.spotUp(off, def, { shooter: sh, zone: this.cornerOrWing(off, sh), open: o, contest: this.defOf(def, sh), assister: A, finish: 'spotup' });
      }
      return 'done';
    }
    // tries to split the double anyway
    this.shoot(off, def, {
      shooter: A,
      zone: this.midOr(A, 0.5),
      open: -0.55,
      contest: this.defOf(def, A),
      assister: null,
      finish: from === 'post' ? 'post' : 'iso',
      tags: [['star_double', -0.4]],
    });
    return 'done';
  }

  // POST UP ---------------------------------------------------------

  private post(
    off: ST,
    def: ST,
    open: number,
    forced: boolean,
    fixed: { actor: SP; defender: SP; tag: string; entry: SP | null } | null,
  ): 'done' | { carry: number; ball: SP | null } {
    const A = fixed?.actor ?? this.pickActor(off, 'post');
    const D = fixed?.defender ?? this.defOf(def, A);
    // the entry pass: a post score off a good feed counts as an assisted basket now and then
    let entry: SP | null = null;
    if (fixed) entry = fixed.entry;
    else {
      const feeders = off.on.filter((p) => p !== A);
      entry = feeders[this.rng.weighted(feeders.map((p) => Math.pow(Math.max(5, p.c.passing) / 50, 2) * p.tp))] ?? null;
    }
    if (this.cur && !fixed) this.cur.label = `Post-up: ${A.name} vs ${D.name}`;
    if (this.record) this.cur!.steps.push({ k: 'post', pid: A.pid });
    const help = this.help(def);
    let adv = (A.c.postScore * A.perf - D.c.intDef * this.dq(D)) / 20 + (A.r.str - D.r.str) / 80 + (A.r.hgt - D.r.hgt) / 70 + this.rng.normal(0, 0.55) + open;
    if (!fixed) adv -= this.denyCatch(def, off, A, 'post');
    if (this.zone(def)) {
      adv -= 0.25;
      this.impact('zone_paint', def.side, 0.025, A.pid);
    }
    if (fixed?.tag === 'mismatch_post') this.impact(fixed.tag, off.side, Math.max(0, (A.r.hgt - D.r.hgt) / 70) * K.advPts.post, A.pid);
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
    const ss = this.selfShot(A);
    const opts = [
      Math.pow(A.c.close / 50, 2) * 1.1 * ss, // hook / short shot
      Math.pow(A.c.rim / 50, 1.6) * 0.8 * (1 + advOpen) * ss, // drop step
      Math.pow(A.c.midShot / 50, 2) * 0.35 * ss, // fadeaway
      Math.pow(A.c.passing / 50, 1.4) * 0.45 * this.passT(A), // pass out
      forced ? 0 : K.continueBase * 0.6,
    ];
    const c = this.rng.weighted(opts);
    switch (c) {
      case 0:
        this.shoot(off, def, { shooter: A, zone: 'paint', open: advOpen - 0.05, contest: D, assister: entry, finish: 'post', forcedFoulMult: 1.3 });
        return 'done';
      case 1:
        this.shoot(off, def, { shooter: A, zone: 'rim', open: advOpen - 0.1, contest: this.rimContester(def, D), assister: entry, finish: 'post', forcedFoulMult: 1.25 });
        return 'done';
      case 2:
        this.shoot(off, def, { shooter: A, zone: 'mid', open: advOpen - 0.2, contest: D, assister: entry, finish: 'post' });
        return 'done';
      case 3: {
        const cutter = this.rng.chance(0.3);
        const tgt = cutter ? off.on.filter((p) => p !== A).sort((a, b) => b.c.cut - a.c.cut)[0] : this.kickTarget(off, A);
        this.passStep(A, tgt);
        if (cutter)
          this.shoot(off, def, { shooter: tgt, zone: 'rim', open: 0.25 + advOpen * 0.3, contest: this.rimContester(def, this.defOf(def, tgt), 1.2), assister: A, finish: 'cut' });
        else
          this.spotUp(off, def, {
            shooter: tgt,
            zone: this.cornerOrWing(off, tgt),
            open: 0.2 + Math.max(0, help) * 0.25,
            contest: this.defOf(def, tgt),
            assister: A,
            finish: 'spotup',
            tags: [['help_kick', Math.max(0, help) * 0.25]],
          });
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
    const B = hubs[this.rng.weighted(hubs.map((p) => Math.pow((p.c.passing + (p.big ? 15 : 0) + (p.role === 'hub' ? 20 : 0)) / 50, 2.5) * Math.sqrt(this.passT(p))))];
    const D = this.defOf(def, Sh);
    const dB = this.defOf(def, B);
    const pf = this.prefs(off, late);
    const finish: FinishType = Sh.role === 'shooter' || this.rng.chance(0.4) ? 'offscreen' : 'handoff';
    if (this.cur) {
      this.cur.label = `${finish === 'offscreen' ? 'Off-ball screen' : 'Handoff'}: ${B.name} to ${Sh.name}`;
      this.cur.steps.push({ k: 'handoff', pid: B.pid, pid2: Sh.pid });
    }
    let adv = (Sh.c.offBall * Sh.perf - (D.c.perDef * 0.6 + D.c.helpD * 0.4) * this.dq(D)) / 22 + (B.r.str + B.r.hgt - 100) / 200 + this.rng.normal(0, 0.55) + open;
    adv += this.blowBy(def, Sh, 'handoff') - this.denyCatch(def, off, Sh, 'handoff');
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
      this.turnover(off, def, this.rng.chance(B.ttv / (B.ttv + Sh.ttv)) ? B : Sh, this.stealBy(D, 0.5), finish);
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
        this.shoot(off, def, { shooter: Sh, zone: this.midOr(Sh, 0.5), open: advOpen - 0.05, contest: D, assister: B, finish, tags });
        return 'done';
      case 2:
        if (this.record) this.cur!.steps.push({ k: 'drive', pid: Sh.pid });
        this.shoot(off, def, {
          shooter: Sh,
          zone: 'rim',
          open: advOpen * 0.6 - this.help(def) * 0.2,
          contest: this.rimContester(def, D),
          assister: B,
          finish,
          tags: [['help_paint', -this.help(def) * 0.2]],
        });
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
    // the ball swings: after a reset it often finds the offense's hub before the next action
    const passer = ballFrom && this.rng.chance(0.5) ? ballFrom : off.on[this.rng.weighted(off.on.map((p) => Math.pow(Math.max(5, p.c.passing) / 50, 2) * this.passT(p)))];
    const pTO = this.toChance(K.toBase * 0.8, passer, def);
    if (this.rng.chance(pTO)) {
      const st = def.on[this.rng.weighted(def.on.map((p) => p.c.steal * p.tsl))];
      this.turnover(off, def, passer, this.stealBy(st, 0.6), 'spotup');
      return 'done';
    }
    const cutters = off.on.filter((p) => p !== passer);
    const cutW = cutters.map((p) => (Math.pow(p.c.cut / 50, 2.2) * Math.pow(p.tu, 0.75) * (p.role === 'slasher' || p.role === 'roller' ? 1.4 : 1)) / Math.sqrt(p.tcr));
    const advOpen = clamp(adv * 0.35, -0.6, 0.75);
    // backdoor cuts punish ball pressure / denial
    const backdoor = Math.max(0, pr) * 0.3;
    const zoneCut = zone ? -0.25 : 0;
    const opts = [
      (cutW.reduce((a, b) => a + b, 0) / 4) * 0.55 * (1 + backdoor + zoneCut) * pf.rim, // cut
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
        this.shoot(off, def, { shooter: cutter, zone: this.rimOr(cutter, 0.8), open: o, contest: this.rimContester(def, cd), assister: passer, finish: 'cut', tags });
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
        this.spotUp(off, def, {
          shooter: sh,
          zone: def.t.defense.scheme === 'zone23' && this.rng.chance(0.45) ? 'c3' : this.cornerOrWing(off, sh),
          open: o,
          contest: d,
          assister: passer,
          finish: 'spotup',
          tags,
        });
        return 'done';
      }
      case 2: {
        const drivers = off.on.filter((p) => p !== passer);
        const dr = drivers[this.rng.weighted(drivers.map((p) => Math.pow(Math.max(5, p.c.create) / 50, 2.5) * p.freedom * p.td * p.tu * Math.sqrt(p.tcr)))];
        if (this.record) this.cur!.steps.push({ k: 'drive', pid: dr.pid });
        const d = this.defOf(def, dr);
        const dAdv = (dr.c.create - d.c.perDef * this.dq(d)) / 20 + advOpen + (zone ? -0.3 : 0);
        if (this.rng.chance(clamp(0.45 + dr.c.passing / 200 + help * 0.15, 0.2, 0.8))) {
          // kick out after collapsing the defense
          const sh = this.kickTarget(off, dr);
          this.passStep(dr, sh);
          const ko = 0.12 + Math.max(0, help) * 0.3 + Math.max(0, dAdv) * 0.2;
          this.spotUp(off, def, {
            shooter: sh,
            zone: this.cornerOrWing(off, sh),
            open: ko,
            contest: this.defOf(def, sh),
            assister: dr,
            finish: 'spotup',
            tags: [['help_kick', Math.max(0, help) * 0.3]],
          });
        } else {
          const zoneS: ShotZone = this.rimOr(dr, 0.6);
          this.shoot(off, def, {
            shooter: dr,
            zone: zoneS,
            open: dAdv * 0.35 - help * 0.25 + this.spacingBonus(off) * 0.4,
            contest: zoneS === 'rim' ? this.rimContester(def, d) : d,
            assister: passer,
            finish: 'spotup',
            tags: [
              ['help_paint', -help * 0.25],
              ['spacing', this.spacingBonus(off) * 0.4],
            ],
          });
        }
        return 'done';
      }
      case 3: {
        const sh = off.on[this.rng.weighted(off.on.map((p) => Math.pow(p.c.midShot / 50, 3) * p.freedom * Math.pow(p.tu, 0.75) * p.tm))];
        this.passStep(passer, sh);
        this.shoot(off, def, { shooter: sh, zone: 'mid', open: advOpen * 0.5, contest: this.defOf(def, sh), assister: sh === passer ? null : passer, finish: 'spotup' });
        return 'done';
      }
      default:
        return { carry: clamp(advOpen * 0.25, -0.1, 0.25), ball: passer };
    }
  }

  // ------------------------------------------------------------ events

  /** Reach-in / off-ball foul on the handler: free throws in the penalty, else a side out (returns false). */
  private nonShootingFoul(off: ST, def: ST, handler: SP, defender: SP, finish: FinishType): boolean {
    const phys = (def.t.defense.physicality - 50) / 50;
    const pr = this.pressure(def);
    const p = K.nonShootFoul * (1 + 0.3 * phys + 0.25 * pr) * (0.8 + handler.c.foulDraw / 250) * this.env.fouls;
    if (!this.rng.chance(p)) return false;
    const fouler = this.rng.chance(clamp(0.7 * defender.tpf, 0.2, 0.92)) ? defender : def.on[this.rng.weighted(def.on.map((p) => p.tpf))];
    if (this.record) {
      this.addPbp(def.side, `Foul on ${fouler.name}.`, 'foul');
      this.cur!.steps.push({ k: 'foul', pid: fouler.pid, pid2: handler.pid });
    }
    this.addFoul(def, fouler);
    if (this.bonus(def)) {
      // two free throws (~1.55) instead of the rest of the possession (~1.1)
      const mult = 1 + 0.3 * phys + 0.25 * pr;
      if (phys !== 0) this.impact(phys > 0 ? 'physicality' : 'clean_defense', off.side, (0.45 * 0.3 * phys) / mult, handler.pid);
      if (pr !== 0) this.impact('pressure_foul', off.side, (0.45 * 0.25 * pr) / mult, handler.pid);
      this.freeThrows(off, def, handler, 2, finish);
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

  /** A defensive foul: counts toward the team's fouls for the penalty. */
  private addFoul(def: ST, p: SP) {
    def.fouls++;
    if (this.clock < 120) def.foulsLast2++;
    this.chargeFoul(def, p);
  }

  /** Charge a personal foul (offensive or defensive); the sixth fouls him out on the spot. */
  private chargeFoul(t: ST, p: SP) {
    p.fouls++;
    p.b.pf++;
    t.tot.pf++;
    if (p.fouls < GAME.foulOut) return;
    if (p.out === 0) {
      p.out = 1;
      p.outAt = this.elapsed;
      this.addPbp(t.side, `${p.name} has fouled out.`, 'foul');
    }
    // NBA rules: with nobody left to come in he stays on, and every foul from his sixth on adds a technical
    if (!this.replace(t, p)) this.technical(t);
  }

  /**
   * Immediate replacement for a player who can't continue: same size if possible, never one at his
   * minute cap if anyone else can go. With nobody left, an injured player is replaced by the most
   * recently disqualified one (NBA rules); a team never plays four.
   */
  private replace(t: ST, p: SP): boolean {
    let bench = t.players.filter((x) => !x.on && x.out === 0);
    if (!bench.length && p.out === 2)
      bench = t.players
        .filter((x) => !x.on && x.out === 1)
        .sort((a, b) => (b.outAt ?? 0) - (a.outAt ?? 0))
        .slice(0, 1);
    if (!bench.length) return false;
    const score = (x: SP) => (this.capped(x) ? 0 : 2) + (x.big === p.big ? 1 : 0);
    const rep = bench.reduce((a, x) => (score(x) > score(a) ? x : a), bench[0]);
    this.applySub(
      t,
      t.on.map((x) => (x === p ? rep : x)),
    );
    return true;
  }

  /** Technical foul on `t`: one free throw for the other side's best shooter on the floor; the possession carries on. */
  private technical(t: ST) {
    const opp = this.T[1 - t.side];
    const sh = opp.on.reduce((a, x) => (x.ftPct > a.ftPct ? x : a), opp.on[0]);
    sh.b.fta++;
    opp.tot.fta++;
    for (const x of opp.on) x.b.tFta++;
    const made = this.rng.chance(sh.ftPct);
    if (made) {
      sh.b.ftm++;
      opp.tot.ftm++;
      // a point for the game, not for this possession's play type or its fast-break / second-chance tallies
      const keep = { pts: this.possPts, second: this.secondChance, trans: this.inTransition, ctx: this.possCtxForTOPts };
      this.secondChance = this.inTransition = false;
      this.possCtxForTOPts = 'start';
      this.score(opp, t, sh, 1);
      this.possPts = keep.pts;
      this.secondChance = keep.second;
      this.inTransition = keep.trans;
      this.possCtxForTOPts = keep.ctx;
    }
    this.addPbp(opp.side, `Technical foul on ${t.team.abbrev} (a disqualified player stays in). ${sh.name} ${made ? 'makes' : 'misses'} the free throw.`, 'ft');
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
    const charge = !stealer && finish !== 'shotclock' && this.rng.chance(0.24);
    if (this.record) {
      const text =
        finish === 'shotclock'
          ? `Shot clock violation, ${off.team.abbrev}.`
          : stealer
            ? `${handler.name} turnover, stolen by ${stealer.name}.`
            : charge
              ? `${handler.name} offensive foul.`
              : `${handler.name} turnover (${this.fx.pick(['bad pass', 'lost ball', 'traveling', 'out of bounds', 'bad pass'])}).`;
      this.addPbp(off.side, text, 'to');
      this.cur!.steps.push({ k: stealer ? 'steal' : 'to', pid: handler.pid, pid2: stealer?.pid });
    }
    if (charge) this.chargeFoul(off, handler);
    const ft: FinishType = finish === 'press' || finish === 'shotclock' ? 'misc' : finish === 'transition' ? 'transition' : finish;
    this.ctx = live ? 'steal' : 'deadTO';
    this.finishPoss(off, def, ft, true);
  }

  private shotXY(zone: ShotZone): { x: number; y: number } {
    const r = this.fx;
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
    // the offense's feel (reads, passing, handling) against the defense's team defense (help,
    // on-ball, inside): what lets good teams get good shots and bad ones not, beyond the matchups
    p += ((off.feelQ - def.defQ - K.feelGap) / 50) * K.feel;
    // fatigue
    p -= (1 - sh.energy) * 0.12;
    // physicality: tighter contests
    const phys = (def.t.defense.physicality - 50) / 50;
    p -= phys * K.physContest;
    // home court, the game's shooting conditions and the score
    if (!this.opts.neutral) p += off.side === 0 ? K.home : -K.home * 0.3;
    p += this.env.shoot + this.scoreEffect(off, def);
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
    const pFoul = K.foulRate[zone] * draw * this.env.fouls;
    if (phys !== 0) {
      // net of the extra fouls (a trip to the line instead of the shot) and the tighter contest
      const andOne = p * (zone === 'rim' || zone === 'paint' ? 0.45 : 0.25);
      const foulGain = andOne * (value + 0.78) + (1 - andOne) * value * 0.78 - p * value;
      const extraFouls = pFoul - pFoul / (1 + 0.3 * phys);
      this.impact(phys > 0 ? 'physicality' : 'clean_defense', off.side, extraFouls * foulGain - K.physContest * phys * value * (1 - pFoul), sh.pid);
    }
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
    const xy = this.record || this.opts.keepShots ? this.shotXY(zone) : null;
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
      if (zone === 'c3') sh.b.c3A++;
      if (xy) {
        this.shots.push({ t: off.side, pid: sh.pid, x: Math.round(xy.x * 10) / 10, y: Math.round(xy.y * 10) / 10, made, zone, q: this.q });
      }
    }
    if (this.record) {
      this.cur!.steps.push({ k: 'shot', pid: sh.pid, zone, x: xy!.x, y: xy!.y, made, v: value, pid2: ast?.pid, f: s.finish });
      if (blocker) this.cur!.steps.push({ k: 'block', pid: blocker.pid, pid2: sh.pid });
    }
    if (!this.cur?.finish && this.cur) this.cur.finish = s.finish;
    this.possFinish = s.finish;
    this.lastShooter = sh;

    const desc = this.record ? this.shotDesc(zone, s.finish, s.pullup) : '';
    if (made) {
      sh.b.fgm++;
      off.tot.fgm++;
      if (three) {
        sh.b.tpm++;
        off.tot.tpm++;
      }
      if (zone === 'rim') sh.b.rimM++;
      if (zone === 'mid') sh.b.midM++;
      if (zone === 'c3') sh.b.c3M++;
      for (const pl of off.on) pl.b.tFgm++;
      const dz = three ? 'three' : zone === 'rim' ? 'rim' : zone === 'paint' ? 'paint' : 'mid';
      engineDiag.made[dz]++;
      if (ast) engineDiag.ast[dz]++;
      if (ast) {
        sh.b.astM++;
        ast.b.ast++;
        off.tot.ast++;
      }
      if (zone === 'rim' || zone === 'paint') off.ex.paint += 2;
      sh.hot = Math.min(5, sh.hot + 1);
      this.score(off, def, sh, value);
      if (this.record) this.addPbp(off.side, `${sh.name} ${desc} — good${ast ? ` (${ast.name} assist)` : ''}${fouled ? ', and one!' : '.'}`, 'make');
      if (fouled) {
        const fouler = this.shootingFouler(def, c, sh);
        this.addFoul(def, fouler);
        this.freeThrows(off, def, sh, 1, s.finish);
        return;
      }
      this.ctx = 'made';
      this.finishPoss(off, def, s.finish);
      return;
    }
    sh.hot = Math.max(0, sh.hot - 1);
    if (fouled) {
      const fouler = this.shootingFouler(def, c, sh);
      if (this.record) this.addPbp(off.side, `${sh.name} fouled on ${desc} by ${fouler.name}.`, 'foul');
      this.addFoul(def, fouler);
      if (this.record) this.cur!.steps.push({ k: 'foul', pid: fouler.pid, pid2: sh.pid });
      this.freeThrows(off, def, sh, value, s.finish);
      return;
    }
    if (blocker) {
      blocker.b.blk++;
      def.tot.blk++;
      if (this.record) this.addPbp(off.side, `${sh.name} ${desc} — blocked by ${blocker.name}.`, 'miss');
    } else if (this.record) this.addPbp(off.side, `${sh.name} misses ${desc}.`, 'miss');
    this.rebound(off, def, zone, !!blocker, false);
  }

  /** Catch on a kick-out: let it fly, or attack a hard closeout. */
  private spotUp(off: ST, def: ST, s: ShotOpts) {
    const sh = s.shooter;
    const t3 = off.t.offense.threePoint / 100;
    const wShoot = Math.pow(Math.max(5, sh.c.c3) / 50, 2.2) * (0.55 + t3) * sh.t3 * (1 + 0.6 * clamp(s.open, -0.5, 1));
    const wDrive = Math.pow(Math.max(5, sh.c.create) / 50, 2) * 0.42 * sh.td * (0.7 + 0.6 * (off.t.offense.rimAttack / 100)) * (1 - 0.35 * clamp(s.open, -0.5, 1));
    if (this.rng.weighted([wShoot, wDrive]) === 0) {
      this.shoot(off, def, s);
      return;
    }
    if (this.record) this.cur!.steps.push({ k: 'drive', pid: sh.pid });
    const d = s.contest ?? this.defOf(def, sh);
    const adv = (sh.c.create - d.c.perDef * this.dq(d)) / 20 + Math.max(0, s.open) * 0.6;
    const r = this.rng.next();
    const pMid = (0.15 * sh.tm) / (0.15 * sh.tm + 0.85);
    const zone: ShotZone = r < pMid ? 'mid' : this.rimOr(sh, 0.65);
    const help = this.help(def);
    this.shoot(off, def, {
      shooter: sh,
      zone,
      open: adv * 0.3 + this.spacingBonus(off) * 0.4 - help * 0.2,
      contest: zone === 'rim' ? this.rimContester(def, d) : d,
      assister: s.assister,
      finish: 'spotup',
      tags: [['help_paint', -help * 0.2]],
    });
  }

  /** Chance a made shot off a pass is credited as an assist (NBA: ~85% of threes, ~65% at the rim, ~40% of mid-range). */
  private assistProb(f: FinishType, zone: ShotZone) {
    const three = zone === 'c3' || zone === 'ab3';
    switch (f) {
      case 'spotup':
        return three ? 0.98 : 0.75;
      case 'cut':
        return 0.98;
      case 'pnrRoll':
        return 0.97;
      case 'offscreen':
      case 'handoff':
        return three ? 0.96 : zone === 'rim' ? 0.5 : 0.7;
      case 'transition':
        return 0.92;
      case 'post':
        return 0.25;
      default:
        return 0.6;
    }
  }

  private shotDesc(zone: ShotZone, f: FinishType, pullup?: boolean) {
    const r = this.fx;
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

  /** Free throws, booked to the play type that drew the foul. */
  private freeThrows(off: ST, def: ST, sh: SP, n: number, finish: FinishType) {
    let made = 0;
    let lastMade = false;
    const pressure = this.q >= 4 && this.clock < 60 && Math.abs(off.score - def.score) <= 4 ? 0.02 : 0;
    for (const pl of off.on) pl.b.tFta += n;
    for (let i = 0; i < n; i++) {
      const p = clamp(sh.ftPct * (0.99 + 0.01 * sh.energy) - pressure, 0.2, 0.97);
      lastMade = this.rng.chance(p);
      sh.b.fta++;
      off.tot.fta++;
      if (lastMade) {
        made++;
        sh.b.ftm++;
        off.tot.ftm++;
        this.score(off, def, sh, 1);
      }
    }
    if (this.record) {
      this.cur!.steps.push({ k: 'ft', pid: sh.pid, made: lastMade, v: made });
      this.addPbp(off.side, `${sh.name} ${made}/${n} from the line.`, 'ft');
    }
    if (lastMade) {
      this.ctx = 'ft';
      this.finishPoss(off, def, finish);
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
    // crashing wins offensive boards (the fourth and fifth crasher add less); sprinting back
    // on the shot (transition D above 50) gives some up
    const crash = (off.t.offense.crashBoards - 50) / 50;
    const glass = (1 + 0.22 * crash - K.crashFade * Math.max(0, crash) ** 2) * (1 - K.getBackOrb * Math.max(0, (off.t.defense.getBack - 50) / 50));
    let pOrb = K.orbBase * Math.pow(offR / defR, 1.05) * glass;
    if (zone === 'c3' || zone === 'ab3') pOrb *= 1.03;
    if (ft) pOrb *= 0.5;
    if (this.zone(def)) {
      pOrb *= 1.12;
      this.impact('zone_glass', off.side, K.orbBase * 0.12 * K.orbPts);
    }
    if (glass !== 1) this.impact('crash_orb', off.side, K.orbBase * (glass - 1) * K.orbPts);
    pOrb = clamp(pOrb, 0.08, 0.45);
    if (this.rng.chance(pOrb)) {
      const ws = off.on.map((p) => Math.pow(p.c.orb, 2) * p.tor * (p === this.lastShooter ? 1.3 : 1));
      const r = off.on[this.rng.weighted(ws)];
      // a few loose balls are team rebounds (out of bounds off the defense, tie-ups): no credit
      if (!this.rng.chance(K.teamReb.orb)) {
        r.b.orb++;
        off.tot.orb++;
      }
      if (this.record) this.addPbp(off.side, `Offensive rebound ${r.name}.`, 'other');
      if (this.record) this.cur!.steps.push({ k: 'reb', pid: r.pid });
      this.ctx = 'orb';
      this.continueAfterOrb(off, def, r);
      return;
    }
    const ws = def.on.map((p) => Math.pow(p.c.drb, 2.2) * p.tdr);
    const r = def.on[this.rng.weighted(ws)];
    if (!this.rng.chance(K.teamReb.drb)) {
      r.b.drb++;
      def.tot.drb++;
    }
    if (this.record) this.cur!.steps.push({ k: 'reb', pid: r.pid });
    if (this.record) this.addPbp(def.side, `Defensive rebound ${r.name}.`, 'other');
    this.ctx = 'dreb';
    this.finishPoss(off, def, this.possFinish);
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
      this.shoot(off, def, {
        shooter: rebounder,
        zone: this.rimOr(rebounder, 0.75),
        open: this.rng.normal(-0.3, 0.3),
        contest: this.rimContester(def, this.defOf(def, rebounder), 1.2),
        assister: null,
        finish: 'putback',
      });
      return;
    }
    // reset with a 14-second shot clock
    const late = this.lateMode(off, def);
    const paceF = this.paceF(off);
    const setup = Math.min(this.rng.uniform(1.5, 4), Math.max(0.3, this.clock * 0.4));
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
    if (this.inTransition) off.ex.fastBreak += pts;
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
          this.replace(t, p);
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
        dnp: p.played ? undefined : (p.dnp ?? "Coach's decision"),
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
        const gmsc =
          b.pts +
          0.4 * b.fgm -
          0.7 * b.fga -
          0.4 * (b.fta - b.ftm) +
          0.7 * b.orb +
          0.3 * b.drb +
          b.stl +
          0.7 * b.ast +
          0.7 * b.blk -
          0.4 * b.pf -
          b.tov +
          (t.score > this.T[1 - t.side].score ? 2 : 0);
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
      flowPeriods: this.flowPeriods,
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
