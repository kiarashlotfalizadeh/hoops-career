// The game: GameSim holds a game's state and plays it possession by possession. This file has the
// state, the setup (players, the stint plan, the starting five and the tip), the live controls and the
// main loop; the engine's steps are in the modules next to it, each installed on GameSim as methods
// (so every step reads and writes the same state through `this`): coach, clock, rotation, usage,
// defense, possession, transition, setPlays, the actions (pnr, isolation, postUp, handoff, motion),
// shots, rebounds, fouls and record.

import type { CallId, GameAdjustment, GameResult, LineupStat, PbpEntry, Player, SetId, SetStat, ShotRecord, ShotZone, Tactics, TacticImpact, XShots } from '../../types';
import { Rng, clamp } from '../../random';
import { archetype, composites } from '../../ratings';
import { GAME } from '../../constants';
import { type PlanPlayer, buildMinutePlan, planInputs, planRoles } from '../rotationPlan';
import type { FinishType, PossLog } from '../log';
import { cloneTactics, defRoleOf, shapeOf, withMentality } from '../tactics';
import { isCallId, readAfter } from '../sets';
import { K, ftChance, lev } from './constants';
import { execution, famPenalty } from '../familiarity';
import { LINK_META, linksAmong } from '../links';
import {
  type SP,
  type ST,
  type SetPlay,
  type SimTeamInput,
  type SimOptions,
  type InGameInjury,
  type Ctx,
  type Stint,
  newBox,
  ACTION_LIST,
  freedomMult,
  linkKey,
  mix,
} from './state';
import { coachMethods } from './coach';
import { clockMethods } from './clock';
import { rotationMethods } from './rotation';
import { usageMethods } from './usage';
import { defenseMethods } from './defense';
import { possessionMethods } from './possession';
import { transitionMethods } from './transition';
import { setPlaysMethods } from './setPlays';
import { pnrMethods } from './pnr';
import { isolationMethods } from './isolation';
import { postUpMethods } from './postUp';
import { handoffMethods } from './handoff';
import { motionMethods } from './motion';
import { shotsMethods } from './shots';
import { reboundsMethods } from './rebounds';
import { foulsMethods } from './fouls';
import { recordMethods } from './record';

/**
 * Stint plans by their inputs: a team plays most games with the same rotation and the same players
 * available, and the plan is a pure function of them (the engine only reads it), so a season builds
 * each one once rather than every game.
 */
const plans = new Map<string, number[][]>();
function cachedPlan(players: PlanPlayer[]): number[][] {
  let key = '';
  for (const p of players) key += `${p.pid},${p.minutes},${+p.starter},${+p.closer},${+p.guard},${+p.big},${p.endurance},${p.cap ?? ''};`;
  let plan = plans.get(key);
  if (!plan) {
    if (plans.size >= 256) plans.clear();
    plan = buildMinutePlan(players);
    plans.set(key, plan);
  }
  return plan;
}

function shortName(p: Player) {
  return p.lastName || p.firstName;
}

/**
 * A game in progress. Callers construct it and play it with step() or simToEnd(), steer a live game
 * with the controls below (baseTactics, setTactics, callTimeout, substitute) and
 * read it through result(), rawBoxes(), drainLogs(), setReads() and the state the live view shows (T,
 * q, clock, poss, pbp, shots, flow, impacts, injuries, adjustments...). Every other field and method is
 * the engine's own, shared by its modules.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below
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
  /** Each side's attempts as expected to fall (see GameResult.xShots). */
  xShots: [XShots, XShots] = [
    { pts: 0, tpm: 0 },
    { pts: 0, tpm: 0 },
  ];
  /**
   * Each side's fouled misses as expected to fall: xShots leaves out a shot the foul wiped out (it
   * isn't an attempt) but keeps a fouled make, so over the fouled shots it counts only the ones that
   * fell. A measurement by shot value adds these back (see counterWorth.ts), else a change that draws
   * more fouls reads as a cost. Not kept on the result.
   */
  xFouledMiss: [number, number] = [0, 0];
  flow: number[] = [];
  /** Index into flow where each period starts. */
  flowPeriods: number[] = [0];
  /** Game seconds played at each flow sample (rounded): when each possession ended, for the win-probability chart. */
  flowT: number[] = [];
  /** The side with the first possession of each period (possessions alternate within one), so who had the ball at each flow sample is known. */
  flowPoss: (0 | 1)[] = [];
  impacts = new Map<string, TacticImpact>();
  lineups = new Map<string, LineupStat>();
  /** Possessions and points by the offense's five and the defense's (only with opts.stints). */
  stints: Map<string, Stint> | null = null;
  injuries: InGameInjury[] = [];
  /** Coaches' in-game adjustments so far, in order (recorded in every game, play-by-play or not). */
  adjustments: GameAdjustment[] = [];

  // the engine's own state, shared by its modules: the possession in progress and the game's streams
  /** Each impact key's four tallies (by beneficiary and his role in the possession), as impacts holds them. */
  impactSlots = new Map<string, (TacticImpact | null)[]>();
  /** The possession being logged (recorded games only). */
  cur: PossLog | null = null;
  /** A timeout called between possessions: the court shows it as the next possession's first beat. */
  timeoutStep = false;
  /** The team that called it. */
  timeoutSide: 0 | 1 = 0;
  /** This possession's last shooter (he has a step on his own miss), its points, how it started, and whether it's a second chance or a run-out. */
  lastShooter: SP | null = null;
  possPts = 0;
  possCtxForTOPts: Ctx = 'start';
  secondChance = false;
  inTransition = false;
  /** Play type of the possession's latest shot. */
  possFinish: FinishType = 'misc';
  /** The player an after-timeout isolation is for: the next pickActor hands it to him. */
  calledActor: SP | null = null;
  /** The defense fouled to give: this trip's first half-court action is an inbounds play. */
  inbound = false;
  /** Openness this trip's first half-court action starts with (a defense set because it didn't crash the glass). */
  firstOpen = 0;
  /** Game-clock seconds left when this trip began: one begun with the period nearly over gets a scrambled look (see halfCourt). */
  tripClock = Infinity;
  /** This trip's make-probability factor for a scrambled look (1: none; see halfCourt). */
  scramble = 1;
  /** A side-out foul in this action: the shot clock restarts at 14 or more (see halfCourt). */
  sideOut = false;
  /** A set handed to the action about to run (it takes it: see takePlay). */
  play: SetPlay | null = null;
  /** The tally of the set (or clear-out isolation) this possession runs: its points go to it. */
  possSet: SetStat | null = null;
  /** Each side's sets tonight, by `${side}:${id}`. */
  setStats = new Map<string, SetStat>();
  /** Game seed: every random stream in the game derives from it. */
  seed: number;
  /** Cosmetic draws (shot spots, play-by-play wording) never touch the simulation stream. */
  fx: Rng;
  /** Conditions both teams share in this game: tempo, shooting night, how tightly it's called. */
  env: { pace: number; shoot: number; fouls: number };

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
    if (opts.stints) this.stints = new Map();
    this.T = [this.makeTeam(home, 0), this.makeTeam(away, 1)];
    // each coach's read of a blowout, from a stream of its own: the simulation's draws stay where they were
    const gar = new Rng(mix(this.seed, 0x7ffffffc));
    for (const t of this.T) {
      t.gLine = gar.uniform(K.garbage.patience[0], K.garbage.patience[1]);
      t.gDepth = Math.floor(gar.uniform(0, K.garbage.depth + 1));
      t.gLate = gar.uniform(K.garbage.late[0], K.garbage.late[1]);
    }
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
    this.flowPoss.push(this.poss);
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
    const play = new Set(input.play ?? []);
    const players: SP[] = roster.map((p) => {
      const role = tactics.offense.roles[p.pid] ?? archetype(p.ratings).role;
      const sp: SP = {
        drole: defRoleOf(tactics.defense, p.pid),
        glass: tactics.offense.glass?.[p.pid] ?? 0,
        pid: p.pid,
        name: shortName(p),
        full: `${p.firstName} ${p.lastName}`.trim(),
        pos: p.pos,
        r: p.ratings,
        c: composites(p.ratings),
        role,
        freedom: freedomMult(tactics.offense.freedom[p.pid] ?? 0),
        energy: 1,
        fouls: 0,
        on: false,
        out: 0,
        starter: false,
        ftPct: ftChance(p.ratings.ft),
        hot: 0,
        perf: input.perf?.[p.pid] ?? 1,
        ...planRoles(p.ratings, p.pos),
        tu: p.tend?.use ?? 1,
        t3: p.tend?.three ?? 1,
        t3o: p.tend?.three ?? 1,
        td: p.tend?.drive ?? 1,
        tp: p.tend?.pass ?? 1,
        tbk: p.tend?.blk ?? 1,
        tsl: p.tend?.stl ?? 1,
        tor: p.tend?.orb ?? 1,
        tdr: p.tend?.drb ?? 1,
        ttv: p.tend?.tov ?? 1,
        tpf: p.tend?.pf ?? 1,
        useCap: K.useLevel,
        useDamp: K.usageDamp,
        tm: p.tend?.mid ?? 1,
        tcn: p.tend?.corner ?? 1,
        tcr: p.tend?.create ?? 1,
        b: newBox(),
        played: false,
        planMin: 0,
        risk: 1,
      };
      const hurt = !!p.injury && p.injury.gamesRemaining > 0;
      if (hurt && !play.has(p.pid)) {
        sp.out = 2;
        sp.dnp = `Injured (${p.injury!.type})`;
      } else if (rest.has(p.pid)) {
        sp.out = 2;
        sp.dnp = 'Rest';
      } else if (hurt) {
        // a game-time decision: he plays through it, at a higher risk of getting hurt
        sp.risk = K.gameTimeRisk;
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
      t: withMentality(tactics),
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
      gLine: 1,
      gDepth: 0,
      gLate: 0,
      restedLate: new Set(),
      spacing: 50,
      passQ: 50,
      helpQ: 50,
      speed: 50,
      pressQ: 50,
      secQ: 55,
      feelQ: 50,
      defQ: 50,
      guardOf: new Map(),
      lineupKey: '',
      ls: null,
      cap: { pnr: 1, iso: 1, post: 1, handoff: 1, motion: 1 },
      injMult: input.injuryMult ?? 1,
      subSig: [],
      manualSubs: false,
      subLock: new Map(),
      adjust: input.adjust ? 0.15 + 0.6 * (input.team.coach.tactics / 100) : 0,
      adjustedQ: 0,
      base: cloneTactics(tactics),
      drilled: cloneTactics(tactics),
      fam: input.fam ?? input.team.fam,
      famOff: 0,
      famDef: 0,
      links: null,
      wall: null,
      crowd: null,
      sit: null,
      hacked: new Map(),
      nextSet: null,
      toWait: null,
      atoNext: false,
      setRuns: new Map(),
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
    const plan = cachedPlan(planPlayers);
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

  setLineup(t: ST, lineup: SP[]) {
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
    t.spacing = this.shapeSpacing(t);
    const passes = on.map((p) => p.c.passing).sort((a, b) => b - a);
    t.passQ = passes[0] * 0.45 + passes[1] * 0.35 + passes[2] * 0.2 || 50;
    t.helpQ = on.reduce((a, p) => a + p.c.helpD, 0) / on.length;
    t.pressQ = on.reduce((a, p) => a + (p.c.steal + p.c.perDef) / 2, 0) / on.length;
    t.secQ = on.reduce((a, p) => a + p.c.ballSec, 0) / on.length;
    t.feelQ = on.reduce((a, p) => a + 0.6 * p.r.oiq + 0.25 * p.r.pas + 0.15 * p.r.hnd, 0) / on.length;
    t.defQ = on.reduce((a, p) => a + 0.5 * p.r.diq + 0.3 * p.r.perD + 0.2 * p.r.intD, 0) / on.length;
    t.speed = on.reduce((a, p) => a + p.r.spd, 0) / on.length;
    t.lineupKey = on
      .map((p) => p.pid)
      .sort((a, b) => a - b)
      .join('-');
    t.ls = null;
    for (const a of ACTION_LIST) t.cap[a] = this.capability(t, a);
    this.refreshFam(t);
  }

  /** The lineup's spacing: its five's average (horns crowds it a little, see K.shape). */
  shapeSpacing(t: ST): number {
    const avg = t.on.reduce((a, p) => a + p.c.spacing, 0) / t.on.length;
    return shapeOf(t.t.offense) === 'horns' ? avg + lev(K.shape.horns.space) : avg;
  }

  /**
   * The openness the offense's shape gives a half-court shot (none in transition or on a putback):
   * five-out's open paint for shots at the rim and in the paint, as much as the five's shooting
   * keeps the defense out of it; the double post's crowded paint for everyone but its bigs, who
   * finish better inside.
   */
  shapeOpen(t: ST, sh: SP, zone: ShotZone, finish: FinishType): number {
    if (finish === 'transition' || finish === 'putback' || (zone !== 'rim' && zone !== 'paint')) return 0;
    const shape = shapeOf(t.t.offense);
    if (shape === 'fiveOut') {
      let exposed = 0;
      for (const p of t.on) exposed += Math.max(0, 40 - p.c.spacing) / 40;
      return lev(K.shape.fiveOut.rim * (1 - K.shape.fiveOut.exposed * exposed));
    }
    if (shape === 'twoIn') {
      const [a, b] = this.bigTwo(t);
      if (sh === a || sh === b) return lev(K.shape.twoIn.bigs);
      const waste = Math.max(0, a.c.spacing - K.shape.twoIn.inside) + Math.max(0, b.c.spacing - K.shape.twoIn.inside);
      return -lev(K.shape.twoIn.crowd + K.shape.twoIn.waste * waste);
    }
    return 0;
  }

  /** The two biggest players on the floor (by height, then rebounding): a double post's bigs, horns' elbows. */
  bigTwo(t: ST): [SP, SP] {
    const s = [...t.on].sort((a, b) => b.r.hgt - a.r.hgt || b.c.orb - a.c.orb);
    return [s[0], s[1] ?? s[0]];
  }

  /**
   * How the five on the floor execute what they play: the familiarity penalty at each end (see
   * src/core/sim/familiarity.ts), and their partnerships (src/core/sim/links.ts); none of either for a
   * team without a record of what it knows.
   */
  refreshFam(t: ST) {
    if (!t.fam || !t.on.length) {
      t.famOff = 0;
      t.famDef = 0;
      t.links = t.wall = t.crowd = null;
      return;
    }
    const e = execution(
      t.fam,
      t.drilled,
      t.on.map((p) => ({ pid: p.pid, ratings: p.r })),
    );
    t.famOff = famPenalty(e.off);
    t.famDef = famPenalty(e.def);
    const { links, clashes } = linksAmong(
      t.on.map((p) => ({ pid: p.pid, off: p.role, def: p.drole, c: p.c })),
      shapeOf(t.t.offense),
      t.fam,
    );
    t.links = t.wall = null;
    for (const l of links) {
      if (l.strength <= 0) continue;
      if (LINK_META[l.id].end === 'def') {
        t.wall ??= new Map();
        t.wall.set(l.a, Math.max(t.wall.get(l.a) ?? 0, l.strength));
      } else {
        t.links ??= new Map();
        // (links come strongest first: a pair with two keeps the stronger)
        if (!t.links.has(linkKey(l.a, l.b))) t.links.set(linkKey(l.a, l.b), { id: l.id, s: l.strength });
      }
    }
    t.crowd = clashes.length ? new Set(clashes[0].pids) : null;
  }

  /** The team's offensive crashing (0-100) with the five on the floor: the team's setting, and each player's glass duty on top. */
  crashOf(t: ST): number {
    let duty = 0;
    for (const p of t.on) duty += p.glass;
    return duty ? clamp(t.t.offense.crashBoards + K.glassDuty.team * duty, 0, 100) : t.t.offense.crashBoards;
  }

  // ------------------------------------------------------------ public control API (live games)

  /** A copy of the tactics the team on `side` plays from: what its coach set, to edit and hand back to setTactics. */
  baseTactics(side: 0 | 1): Tactics {
    return cloneTactics(this.T[side].base);
  }

  /** New base tactics for the team on `side`; a situational plan in effect stays on top of them. */
  setTactics(side: 0 | 1, tactics: Tactics) {
    const t = this.T[side];
    t.base = cloneTactics(tactics);
    this.situate(t, true);
  }

  /** The situational plan in effect for the team on `side`, if any. */
  situation(side: 0 | 1): { id: string; label: string } | null {
    const s = this.T[side].sit;
    return s && { ...s };
  }

  /**
   * Run set `id` (or 'iso': a clear-out isolation, as the after-timeout isolation runs one) on this
   * side's next half-court trip this period, for `pid` while he's on the floor (else for the best fit
   * there, or whoever the isolation finds): the user's play calls in a live game, and the engine's
   * tests and measurement scripts. The staff calls no plays.
   */
  runSet(side: 0 | 1, id: CallId, pid?: number): boolean {
    const t = this.T[side];
    if (!isCallId(id) || (pid != null && !t.byId.has(pid))) return false;
    t.nextSet = { id, pid: pid ?? null };
    return true;
  }

  /** The period has run out and the next one hasn't started (the sim is at a break, or at the final buzzer). */
  atBuzzer(): boolean {
    return this.clock <= 0.05;
  }

  /**
   * The sets the team on `side` has run tonight: how often, and the openness the other defense's read
   * would take off each one's look on its next run (see readAfter).
   */
  setReads(side: 0 | 1): { id: SetId; runs: number; read: number }[] {
    const coach = this.T[1 - side].team.coach?.tactics ?? 50;
    return [...this.T[side].setRuns].map(([id, runs]) => ({ id, runs, read: readAfter(id, runs, coach) }));
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

  /**
   * A timeout for the team on `side`: false when it has none left, or the period has run out (the break
   * is a stop of its own, and a timeout there would be charged for nothing). NBA: in a live ball only the
   * team with the ball may call one, so one asked for while the other side has the ball after a steal or
   * a defensive board waits for the next dead ball (see takeWaitingTimeouts); it counts as called.
   */
  callTimeout(side: 0 | 1, reason = '') {
    const t = this.T[side];
    this.lateTimeouts();
    if (t.timeouts <= 0 || this.over || this.atBuzzer()) return false;
    if (!this.mayCallTimeout(side)) {
      t.toWait = reason;
      return true;
    }
    t.toWait = null;
    t.timeouts--;
    for (const tm of this.T) for (const p of tm.players) p.energy = Math.min(1, p.energy + (p.on ? 0.05 : 0.02));
    this.T[0].run = 0;
    this.T[1].run = 0;
    this.addPbp(side, `Timeout ${t.team.abbrev}${reason ? ` (${reason})` : ''}.`, 'timeout');
    this.timeoutStep = true;
    this.timeoutSide = side;
    if (t.t.manage.ato) t.atoNext = true;
    this.adjust(this.T[0]);
    this.adjust(this.T[1]);
    this.checkSubs(this.T[0], true);
    this.checkSubs(this.T[1], true);
    return true;
  }

  /** The team on `side` asked for a timeout that waits for the next dead ball. */
  timeoutWaiting(side: 0 | 1): boolean {
    return this.T[side].toWait !== null;
  }

  /** The side whose timeout opens the next possession (one taken since the last possession), or null. */
  timeoutOpens(): 0 | 1 | null {
    return this.timeoutStep ? this.timeoutSide : null;
  }

  // ------------------------------------------------------------ main loop

  /** Simulate one possession. Returns false when the game is over. */
  step(): boolean {
    if (this.over) return false;
    if (this.clock <= 0.05) {
      if (!this.endPeriod()) return false;
    }
    // common random numbers: each team's n-th possession draws from its own stream, so two
    // versions of the same game (paired batch comparisons) stay paired possession by possession
    this.rng = new Rng(mix(this.seed, 2 * this.T[this.poss].poss + this.poss));
    // substitutions at stoppages
    if (this.ctx !== 'steal' && this.ctx !== 'dreb') {
      this.checkSubs(this.T[0]);
      this.checkSubs(this.T[1]);
    } else if (this.rng.chance(0.15)) {
      // no stoppage after a steal or a defensive board, but now and then a pending sub gets in anyway
      this.checkSubs(this.T[0]);
      this.checkSubs(this.T[1]);
    }
    this.autoTimeouts();
    this.possession();
    this.takeWaitingTimeouts();
    return !this.over;
  }

  simToEnd(): GameResult {
    let guard = 0;
    while (this.step() && guard++ < 2000);
    return this.result();
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- the modules' methods are installed below
export interface GameSim
  extends
    CoachMethods,
    ClockMethods,
    RotationMethods,
    UsageMethods,
    DefenseMethods,
    PossessionMethods,
    TransitionMethods,
    SetPlaysMethods,
    PnrMethods,
    IsolationMethods,
    PostUpMethods,
    HandoffMethods,
    MotionMethods,
    ShotsMethods,
    ReboundsMethods,
    FoulsMethods,
    RecordMethods {}

type CoachMethods = typeof coachMethods;
type ClockMethods = typeof clockMethods;
type RotationMethods = typeof rotationMethods;
type UsageMethods = typeof usageMethods;
type DefenseMethods = typeof defenseMethods;
type PossessionMethods = typeof possessionMethods;
type TransitionMethods = typeof transitionMethods;
type SetPlaysMethods = typeof setPlaysMethods;
type PnrMethods = typeof pnrMethods;
type IsolationMethods = typeof isolationMethods;
type PostUpMethods = typeof postUpMethods;
type HandoffMethods = typeof handoffMethods;
type MotionMethods = typeof motionMethods;
type ShotsMethods = typeof shotsMethods;
type ReboundsMethods = typeof reboundsMethods;
type FoulsMethods = typeof foulsMethods;
type RecordMethods = typeof recordMethods;

// each module's methods go on GameSim's prototype as the class's own would (a name defined twice is a bug)
for (const part of [
  coachMethods,
  clockMethods,
  rotationMethods,
  usageMethods,
  defenseMethods,
  possessionMethods,
  transitionMethods,
  setPlaysMethods,
  pnrMethods,
  isolationMethods,
  postUpMethods,
  handoffMethods,
  motionMethods,
  shotsMethods,
  reboundsMethods,
  foulsMethods,
  recordMethods,
]) {
  for (const [name, fn] of Object.entries(part)) {
    if (name in GameSim.prototype) throw new Error(`GameSim.${name} is defined twice`);
    Object.defineProperty(GameSim.prototype, name, { value: fn, writable: true, configurable: true });
  }
}
