// Game-day realism check: plays full regular seasons the way the app does (createLeague + simDay,
// staff-run rotations and tactics for every team, injuries on) and measures how a game is played —
// results, box, clock, the end game, timeouts, rotations, the whistle, shot types, big nights —
// against the NBA's last two regular seasons (review/GAMEDAY-REALISM.md, Appendix and body).
//
// It reads the engine from the outside: play-by-play is switched on for every league game, and a few
// GameSim methods are wrapped on the prototype (each calls straight through; the engine's draws are
// untouched, play-by-play wording comes from its own cosmetic stream). Each wrapper logs a small
// structured event with the game clock; text is read only for what has no method of its own
// (shot descriptions, technicals, jump balls, loose-ball fouls, shot-clock violations), so new pbp
// kinds or wording elsewhere don't break it. A wrapped method the engine no longer has is reported.
//
// Usage: npx tsx scripts/gameday-check.ts [--seasons N] [--seed S] [--json out.json]
//   one league per season: --seasons 3 plays rng seeds 7, 11, 23; --seed S plays seed S alone.
// Flag: OK when the sim is within the NBA range widened by 10% (relative) on each side, else OFF.
//
// Definitions where the review's text leaves a choice: a stint is unbroken time on the floor (not
// split at the breaks), and stint length is his minutes over his stints; the end-game "leader gains
// the ball" situations under 0:24 start at 0:02 (no time to foul under that); "trailing team fouls"
// counts every personal foul by the side behind at the time; "next action after an OREB" is the next
// shot, turnover or foul; the clock gaps after a DREB or a make count only with 24+ s on the game clock.
//
// Not measured (from the review's list): coach's challenges, flagrants and take fouls (the engine has
// none to hook), descriptor tags other than dunk/alley-oop/cut, and the real-data side (the NBA
// numbers below are the reviews').
//
// From the second review (review/GAMEDAY-REALISM-2.md): points per shot by how much of the shot clock
// is gone (the clock runs from the change of possession; an offensive board starts it at 10 s used;
// shots with under 24 s on the game clock are left out), shooting late in close games by who leads,
// last-second shots (heaves, which the engine names, are left out as the NBA's are), what happens
// when the leader gains the ball in the last 24 s, foul trouble (the share of the window a starter
// spends on the floor after the foul), late tempo, end-of-quarter trips and when timeouts come.
//
// From the third review (review/GAMEDAY-REALISM-3.md): who takes the last shot (a team's top scorer by
// season points a game, 20+ games, and its top two; shots for the tie or the lead in the last 24 s),
// boards credited at the horn, the two-for-one (a trip begun with 33-40 s left in Q1-Q3 whose first
// shot or turnover comes with more than 24 s left), the whistle by quarter and the home side's, how
// the two teams' shooting nights move together, starters on the floor at fixed minutes (from each
// player's stretches on it), timeouts against runs and the fourth quarter's spares, team spread (the
// SD of the teams' season margins) and the season's star lines: so a change that keeps the
// multi-season tails star-check guards can't quietly flatten a single season, or the other way round.
import { readFileSync, writeFileSync } from 'node:fs';
import { createLeague, defaultSettings, type SeedData } from '../src/core/league/create';
import { startRegularSeason, simDay } from '../src/core/league/season';
import { standardRoster } from '../src/core/league/helpers';
import { releasePlayer } from '../src/core/league/contracts';
import { CAP } from '../src/core/constants';
import { GameSim } from '../src/core/sim/engine/game';
import type { GameResult } from '../src/core/types';
import type { PossLog } from '../src/core/sim/log';

// ------------------------------------------------------------ arguments

const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const SEEDS = [7, 11, 23, 31, 47, 59, 71, 83];
const nSeasons = Number(opt('--seasons') ?? 1);
const seeds = opt('--seed') !== undefined ? [Number(opt('--seed'))] : SEEDS.slice(0, nSeasons);
const jsonOut = opt('--json');
if (!seeds.length || seeds.some((s) => !Number.isFinite(s)) || nSeasons > SEEDS.length) throw new Error('Usage: gameday-check [--seasons 1-8] [--seed S] [--json out.json]');

// ------------------------------------------------------------ events

/** The engine's team state, as far as this script reads it. */
interface Tm {
  side: 0 | 1;
  tid: number;
  score: number;
  timeouts: number;
  on: Pl[];
  players: Pl[];
  tot: { fga: number; fgm: number };
}
interface Pl {
  pid: number;
  on: boolean;
  starter: boolean;
  fouls: number;
}

type Ev = { q: number; clock: number; side: 0 | 1; hs: number; as: number } & (
  | { k: 'shot'; pid: number; zone: string; finish: string; fga: boolean; made: boolean; desc: string; fga0: number; fgm0: number }
  | { k: 'to'; steal: boolean }
  | { k: 'foul'; def: boolean }
  | { k: 'ft'; n: number }
  | { k: 'orb'; team: boolean }
  | { k: 'timeout' }
  | { k: 'end'; ctx: string }
);

/** One recorded game's state. */
interface G {
  ev: Ev[];
  pending: Extract<Ev, { k: 'shot' }> | null;
  inAddFoul: number;
  onSince: Map<number, number>;
  stints: Map<number, number[]>;
  firstOff: number[];
  /** Each player's stretches on the floor, in elapsed seconds (the open one is in onSince). */
  segs: Map<number, [number, number][]>;
  /** A starter's personal fouls: which one, and when. */
  pfs: { pid: number; n: number; q: number; clock: number; at: number }[];
  firstSub: [number, number];
  subs: [number, number];
  noStarter: [number, number];
  /** Home margin when the 4th quarter's clock crossed 2:00 (null: not yet). */
  at2: number | null;
  done: boolean;
}

const games = new WeakMap<GameSim, G>();
const tracked = (s: GameSim) => s.opts?.type === 'regular' && s.opts.injuries !== false && !!s.opts.rng;

/** A league game's state (created the first time a wrapper sees it, which turns its play-by-play on). */
function gs(s: GameSim): G | undefined {
  let g = games.get(s);
  if (!g && tracked(s)) {
    s.record = true;
    g = {
      ev: [],
      pending: null,
      inAddFoul: 0,
      onSince: new Map(),
      stints: new Map(),
      firstOff: [],
      segs: new Map(),
      pfs: [],
      firstSub: [-1, -1],
      subs: [0, 0],
      noStarter: [0, 0],
      at2: null,
      done: false,
    };
    games.set(s, g);
  }
  return g;
}

const T = (s: GameSim) => s.T as unknown as [Tm, Tm];

/** A shot's outcome is known by the time anything else happens (the box is written before any nested call). */
function resolve(s: GameSim, g: G) {
  const p = g.pending;
  if (!p) return;
  const t = T(s)[p.side];
  p.fga = t.tot.fga > p.fga0;
  p.made = t.tot.fgm > p.fgm0;
  g.pending = null;
}

function push(s: GameSim, g: G, e: Record<string, unknown> & { k: Ev['k']; side: 0 | 1 }) {
  resolve(s, g);
  const [h, a] = T(s);
  const ev = { q: s.q, clock: s.clock, hs: h.score, as: a.score, ...e } as Ev;
  g.ev.push(ev);
  return ev;
}

// ------------------------------------------------------------ hooks

const proto = GameSim.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
const missing: string[] = [];
function wrap(name: string, around: (s: GameSim, g: G, args: unknown[], call: () => unknown) => unknown) {
  const orig = proto[name];
  if (typeof orig !== 'function') {
    missing.push(name);
    return;
  }
  proto[name] = function (this: GameSim, ...args: unknown[]) {
    const g = gs(this);
    const call = () => orig.apply(this, args);
    return g && !g.done ? around(this, g, args, call) : call();
  };
}

wrap('step', (_s, _g, _a, call) => call());
wrap('shoot', (s, g, [off, , o], call) => {
  const so = o as { zone: string; finish: string; shooter: Pl };
  const t = off as Tm;
  const ev = push(s, g, { k: 'shot', side: t.side, pid: so.shooter.pid, zone: so.zone, finish: so.finish, fga: false, made: false, desc: '', fga0: t.tot.fga, fgm0: t.tot.fgm });
  g.pending = ev as Extract<Ev, { k: 'shot' }>;
  const r = call();
  if (g.pending === ev) resolve(s, g);
  return r;
});
// the play-by-play wording of the shot just taken (called only while recording, before anything nested)
wrap('shotDesc', (_s, g, _a, call) => {
  const d = call();
  const last = g.ev[g.ev.length - 1];
  if (last?.k === 'shot' && typeof d === 'string') last.desc = d;
  return d;
});
wrap('turnover', (s, g, [off, , , stealer], call) => {
  push(s, g, { k: 'to', side: (off as Tm).side, steal: !!stealer });
  return call();
});
wrap('freeThrows', (s, g, [off, , , n], call) => {
  push(s, g, { k: 'ft', side: (off as Tm).side, n: n as number });
  return call();
});
wrap('addFoul', (s, g, [def], call) => {
  push(s, g, { k: 'foul', side: (def as Tm).side, def: true });
  g.inAddFoul++;
  try {
    return call();
  } finally {
    g.inAddFoul--;
  }
});
// a personal foul outside addFoul is the offense's (a charge)
wrap('chargeFoul', (s, g, [t, p], call) => {
  if (!g.inAddFoul) push(s, g, { k: 'foul', side: (t as Tm).side, def: false });
  const pl = p as Pl;
  const q = s.q;
  const clock = s.clock;
  const at = s.elapsed;
  const r = call();
  if (pl.starter) g.pfs.push({ pid: pl.pid, n: pl.fouls, q, clock, at });
  return r;
});
// (`team`: nobody's board, a ball gone out of bounds to the offense: an inbound, not a rebound to put back)
wrap('continueAfterOrb', (s, g, [off, , rebounder], call) => {
  push(s, g, { k: 'orb', side: (off as Tm).side, team: !rebounder });
  return call();
});
wrap('finishPoss', (s, g, [off], call) => {
  push(s, g, { k: 'end', side: (off as Tm).side, ctx: String(s.ctx) });
  return call();
});
// a timeout counts when one is charged (one asked for in the other side's live ball waits)
wrap('callTimeout', (s, g, [side], call) => {
  const t = T(s)[side as 0 | 1];
  const before = t.timeouts;
  const clock = s.clock;
  const r = call();
  if (t.timeouts < before) push(s, g, { k: 'timeout', side: t.side }).clock = clock;
  return r;
});
wrap('applySub', (s, g, [t, lineup], call) => {
  const tm = t as Tm;
  const ins = (lineup as Pl[]).filter((p) => !p.on).length;
  if (ins) {
    g.subs[tm.side] += ins;
    if (g.firstSub[tm.side] < 0) g.firstSub[tm.side] = s.elapsed;
  }
  return call();
});
// stints: every change of the five goes through setLineup (the tip's five included)
wrap('setLineup', (s, g, [t], call) => {
  const was = [...(t as Tm).on];
  const r = call();
  const now = (t as Tm).on;
  for (const p of was) {
    if (now.includes(p)) continue;
    const from = g.onSince.get(p.pid) ?? 0;
    g.onSince.delete(p.pid);
    let l = g.stints.get(p.pid);
    if (!l) g.stints.set(p.pid, (l = []));
    l.push(s.elapsed - from);
    let sg = g.segs.get(p.pid);
    if (!sg) g.segs.set(p.pid, (sg = []));
    sg.push([from, s.elapsed]);
    if (p.starter && l.length === 1) g.firstOff.push(s.elapsed / 60);
  }
  for (const p of now) if (!was.includes(p)) g.onSince.set(p.pid, s.elapsed);
  return r;
});
wrap('tick', (s, g, _a, call) => {
  const e0 = s.elapsed;
  const c0 = s.clock;
  const r = call();
  const dt = s.elapsed - e0;
  for (const t of T(s)) if (!t.on.some((p) => p.starter)) g.noStarter[t.side] += dt;
  if (s.q === 4 && c0 > 120 && s.clock <= 120) g.at2 = T(s)[0].score - T(s)[1].score;
  return r;
});
wrap('result', (s, g, _a, call) => {
  const res = call() as GameResult;
  g.done = true;
  harvest(s, g, res);
  // league games keep no play-by-play: the season's results stay as the app makes them
  delete res.pbp;
  return res;
});
if (missing.length) console.warn(`WARNING: GameSim no longer has ${missing.join(', ')}: the measures that read them are blank`);

// ------------------------------------------------------------ the tallies

const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
const sd = (x: number[]) => {
  const m = mean(x);
  return Math.sqrt(mean(x.map((v) => (v - m) ** 2)));
};

const A = {
  games: 0,
  teamGames: 0,
  pts: 0,
  homeWins: 0,
  ot: 0,
  margins: [] as number[],
  fgm: 0,
  fga: 0,
  tpa: 0,
  tpm: 0,
  fta: 0,
  tov: 0,
  orb: 0,
  oppDrb: 0,
  pf: 0,
  pfDiff: [] as number[],
  ftaDiff: [] as number[],
  pf28: 0,
  secondChance: 0,
  drebDt: [] as number[],
  makeDt: [] as number[],
  orbNext: [0, 0],
  scv: 0,
  sit: {} as Record<string, [number, number]>,
  close: 0,
  closeTO: 0,
  closeTrailFouls: 0,
  closeFtTrips: 0,
  timeouts: 0,
  timeoutsQ4: 0,
  firstSub: [] as number[],
  subs: 0,
  stints30: [] as number[],
  stintLen30: [] as number[],
  firstOff: [] as number[],
  noStarter: 0,
  teamSec: 0,
  techs: 0,
  heldBalls: 0,
  looseBall: 0,
  shots: { fga: 0, dunk: 0, oopA: 0, oopM: 0, cut: 0, zone: {} as Record<string, number> },
  halfPoss: 0,
  zonePoss: 0,
  tripleDoubles: 0,
  fifty: 0,
  reb: 0,
  foulOuts: 0,
  ast: 0,
  doubleDoubles: 0,
  /** Shots and points by 4-second bin of the shot clock used (the seventh: past 24, after a reset). */
  clockBin: Array.from({ length: 7 }, () => [0, 0]) as [number, number][],
  /** Makes and attempts by situation: `${key}2` and `${key}3`. */
  late: {} as Record<string, [number, number]>,
  heaves: 0,
  /** The leader gains the ball in the last 24 s: what comes first, by lead. */
  lead24: {} as Record<string, Record<string, number>>,
  /** A starter's foul: seconds of the window after it, and seconds of it he was on the floor. */
  trouble: {} as Record<string, [number, number]>,
  tempo: {} as Record<string, [number, number]>,
  qEnd: [0, 0],
  toEarly: [0, 0, 0],
  q1Lead: [0, 0],
  lead2: [0, 0],
  closeAt: {} as Record<string, number>,
  hold: {} as Record<string, { n: number; change: number; ot: number; wins: number }>,
  qMargin: [[], [], []] as number[][],
  hornBoards: 0,
  twoForOne: [0, 0],
  down1: [0, 0],
  /** Personal fouls and free-throw attempts by quarter (overtime with the fourth). */
  pfQ: [0, 0, 0, 0],
  ftaQ: [0, 0, 0, 0],
  fgPct: [[], []] as number[][],
  /** Starters on the floor at the marks of STARTER_MARKS (sum over team-games, and how many). */
  startersOn: {} as Record<string, [number, number]>,
  toRun: [0, 0],
  q4Spare: [0, 0],
  deadReb: [0, 0],
  /** Per season: the SD of the teams' margins, the better team's games and wins, the star lines. */
  teamSd: [] as number[],
  better: [0, 0],
  twenty: [] as number[],
  leaderPpg: [] as number[],
  steal5: [] as number[],
  lastShot: [0, 0, 0],
  early: [0, 0, 0],
};
/** One season's games, for what is measured over a season (see closeSeason). */
let SEASON = newSeason();
function newSeason() {
  return {
    games: [] as { home: number; away: number; margin: number }[],
    /** Points by player and team, a game at a time. */
    pts: new Map<string, number[]>(),
    steal5: 0,
    /** Shots for the tie or the lead in the last 24 s, and shots earlier in games: team and shooter. */
    last: [] as [number, number][],
    early: [] as [number, number][],
  };
}
/** [label, elapsed seconds, close games only (within 6 with 6:00 left)] */
const STARTER_MARKS: [string, number, boolean][] = [
  ['q2_1130', 750, false],
  ['q2_730', 990, false],
  ['q2_130', 1350, false],
  ['q3_230', 2010, false],
  ['q4_1130', 2190, false],
  ['q4_130c', 2790, true],
];

function closeSeason() {
  const S = SEASON;
  SEASON = newSeason();
  if (!S.games.length) return;
  const by = new Map<number, number[]>();
  for (const g of S.games) {
    by.set(g.home, [...(by.get(g.home) ?? []), g.margin]);
    by.set(g.away, [...(by.get(g.away) ?? []), -g.margin]);
  }
  const strength = new Map([...by].map(([tid, m]) => [tid, mean(m)]));
  A.teamSd.push(sd([...strength.values()]));
  for (const g of S.games) {
    const d = strength.get(g.home)! - strength.get(g.away)!;
    if (!d) continue;
    A.better[0]++;
    if (d > 0 === g.margin > 0) A.better[1]++;
  }
  // a season's scorers: everyone with 58+ games, by points a game over all his teams
  const all = new Map<number, number[]>();
  const tops = new Map<number, [number, number][]>();
  for (const [key, v] of S.pts) {
    const [tid, pid] = key.split(':').map(Number);
    all.set(pid, [...(all.get(pid) ?? []), ...v]);
    if (v.length >= 20) tops.set(tid, [...(tops.get(tid) ?? []), [mean(v), pid]]);
  }
  const ppg = [...all.values()]
    .filter((v) => v.length >= 58)
    .map(mean)
    .sort((a, b) => b - a);
  A.twenty.push(ppg.filter((x) => x >= 20).length);
  A.leaderPpg.push(ppg[0] ?? NaN);
  A.steal5.push(S.steal5);
  const top = (tid: number, n: number) =>
    (tops.get(tid) ?? [])
      .sort((a, b) => b[0] - a[0])
      .slice(0, n)
      .map((x) => x[1]);
  for (const [tid, pid] of S.last) {
    A.lastShot[0]++;
    if (top(tid, 1).includes(pid)) A.lastShot[1]++;
    if (top(tid, 2).includes(pid)) A.lastShot[2]++;
  }
  for (const [tid, pid] of S.early) {
    A.early[0]++;
    if (top(tid, 1).includes(pid)) A.early[1]++;
  }
}
let userTid = 0;

const sit = (key: string, yes: boolean) => {
  const c = (A.sit[key] ??= [0, 0]);
  c[0]++;
  if (yes) c[1]++;
};

/** The next shot or turnover by `side` after event i in the same period, before its possession ends; with `anyFoul`, a foul counts too. */
function nextAction(ev: Ev[], i: number, side: 0 | 1, anyFoul = false): Ev | null {
  const q = ev[i].q;
  for (let j = i + 1; j < ev.length; j++) {
    const e = ev[j];
    if (e.q !== q) return null;
    if ((e.k === 'shot' || e.k === 'to') && e.side === side) return e;
    if (anyFoul && e.k === 'foul') return e;
    if (e.k === 'end') return null;
  }
  return null;
}

/** After event i, does `fouler` commit a defensive foul before `ball`'s next shot or turnover, its possession's end, or the period's? */
function foulsFirst(ev: Ev[], i: number, fouler: 0 | 1, ball: 0 | 1): boolean {
  const q = ev[i].q;
  for (let j = i + 1; j < ev.length; j++) {
    const e = ev[j];
    if (e.q !== q) return false;
    if (e.k === 'foul' && e.def && e.side === fouler) return true;
    if (((e.k === 'shot' || e.k === 'to') && e.side === ball) || e.k === 'end') return false;
  }
  return false;
}

/** After event i (the leader gains the ball): the trailing side's foul, the leader's turnover or shot, or the clock running out. */
function firstThing(ev: Ev[], i: number, fouler: 0 | 1, ball: 0 | 1): 'foul' | 'to' | 'shot' | 'out' {
  const q = ev[i].q;
  for (let j = i + 1; j < ev.length; j++) {
    const e = ev[j];
    if (e.q !== q) return 'out';
    if (e.k === 'foul' && e.def && e.side === fouler) return 'foul';
    if (e.k === 'to' && e.side === ball) return 'to';
    if ((e.k === 'shot' || e.k === 'ft') && e.side === ball) return 'shot';
    if (e.k === 'end') return 'out';
  }
  return 'out';
}

function harvest(s: GameSim, g: G, res: GameResult) {
  const ev = g.ev;
  const box = [res.home, res.away];
  A.games++;
  A.teamGames += 2;
  const margin = res.home.pts - res.away.pts;
  A.margins.push(margin);
  if (margin > 0) A.homeWins++;
  if (res.ot > 0) A.ot++;
  A.pfDiff.push(res.home.t.pf - res.away.t.pf);
  A.ftaDiff.push(res.home.t.fta - res.away.t.fta);
  SEASON.games.push({ home: res.home.tid, away: res.away.tid, margin });
  A.fgPct[0].push(res.home.t.fgm / res.home.t.fga);
  A.fgPct[1].push(res.away.t.fgm / res.away.t.fga);
  for (const [i, b] of box.entries()) {
    const o = box[1 - i];
    for (const p of b.players) {
      if (p.min <= 0) continue;
      const key = `${b.tid}:${p.pid}`;
      SEASON.pts.set(key, [...(SEASON.pts.get(key) ?? []), p.pts]);
      if (p.stl >= 5) SEASON.steal5++;
    }
    A.pts += b.pts;
    A.fgm += b.t.fgm;
    A.fga += b.t.fga;
    A.tpa += b.t.tpa;
    A.tpm += b.t.tpm;
    A.fta += b.t.fta;
    A.tov += b.t.tov;
    A.orb += b.t.orb;
    A.oppDrb += o.t.drb;
    A.pf += b.t.pf;
    if (b.t.pf >= 28) A.pf28++;
    A.secondChance += b.extra?.secondChance ?? 0;
    A.foulOuts += b.players.filter((p) => p.pf >= 6).length;
    A.reb += b.t.orb + b.t.drb;
    A.ast += b.t.ast;
    let top = 0;
    for (const p of b.players) {
      top = Math.max(top, p.pts);
      if ([p.pts, p.orb + p.drb, p.ast, p.stl, p.blk].filter((x) => x >= 10).length >= 2) A.doubleDoubles++;
      if ([p.pts, p.orb + p.drb, p.ast, p.stl, p.blk].filter((x) => x >= 10).length >= 3) A.tripleDoubles++;
    }
    if (top >= 50) A.fifty++;
  }

  // rotation: stints of everyone still on at the final horn end there
  for (const [pid, from] of g.onSince) {
    let l = g.stints.get(pid);
    if (!l) g.stints.set(pid, (l = []));
    l.push(s.elapsed - from);
  }
  for (const b of box)
    for (const p of b.players) {
      if (p.min < 30) continue;
      const l = (g.stints.get(p.pid) ?? []).filter((x) => x > 0);
      A.stints30.push(l.length);
      // (stint length as the review takes it: his minutes over his stints)
      A.stintLen30.push(p.min / Math.max(1, l.length));
    }
  A.firstOff.push(...g.firstOff);
  for (const side of [0, 1] as const) {
    if (g.firstSub[side] >= 0) A.firstSub.push(g.firstSub[side] / 60);
    A.subs += g.subs[side];
    A.noStarter += g.noStarter[side];
  }
  A.teamSec += 2 * s.elapsed;

  // text-only events: technicals, jump balls, loose-ball fouls, shot-clock violations
  for (const p of res.pbp ?? []) {
    if (/technical foul/i.test(p.text)) A.techs++;
    if (/jump ball|held ball/i.test(p.text)) A.heldBalls++;
    if (/loose[- ]ball foul/i.test(p.text)) A.looseBall++;
    if (/shot[- ]clock/i.test(p.text) && p.kind !== 'foul') A.scv++;
    // a player's board at 0:00.0
    if (/rebound/i.test(p.text) && !/team rebound/i.test(p.text) && p.clock <= 0.05) A.hornBoards++;
  }

  // zone defense: AI defenses' half-court possessions
  for (const l of s.logs as PossLog[]) {
    if (l.kind !== 'half' || box[1 - l.off].tid === userTid) continue;
    A.halfPoss++;
    if (l.scheme !== 'man') A.zonePoss++;
  }

  // foul trouble: the share of the window after a starter's foul that he spends on the floor
  for (const [pid, from] of g.onSince) {
    let sg = g.segs.get(pid);
    if (!sg) g.segs.set(pid, (sg = []));
    sg.push([from, s.elapsed]);
  }
  // starters on the floor at fixed minutes (regulation), the fourth quarter's late one in close games only
  {
    let at6 = 0;
    for (const e of ev) {
      if (e.q > 4 || (e.q === 4 && e.clock < 360)) break;
      at6 = e.hs - e.as;
    }
    for (const t of T(s)) {
      const starters = t.players.filter((p) => p.starter);
      for (const [label, at, closeOnly] of STARTER_MARKS) {
        if (closeOnly && Math.abs(at6) > 6) continue;
        const c = (A.startersOn[label] ??= [0, 0]);
        c[0] += starters.filter((p) => (g.segs.get(p.pid) ?? []).some(([a, b]) => a <= at && at < b)).length;
        c[1]++;
      }
    }
  }
  for (const f of g.pfs) {
    const key =
      f.n === 2 && f.q === 1 && f.clock >= 150
        ? 'q1'
        : f.n === 3 && f.q === 2 && f.clock >= 180
          ? 'q2'
          : f.n === 4 && f.q === 3 && f.clock >= 180
            ? 'q3'
            : f.n === 5 && f.q === 4 && f.clock >= 420
              ? 'q4'
              : '';
    if (!key) continue;
    const to = key === 'q1' ? 1440 : key === 'q2' ? 1440 : key === 'q3' ? 2160 : 2880 - 240;
    let on = 0;
    for (const [a, b] of g.segs.get(f.pid) ?? []) on += Math.max(0, Math.min(b, to) - Math.max(a, f.at));
    const c = (A.trouble[key] ??= [0, 0]);
    c[0] += to - f.at;
    c[1] += on;
  }

  // the shot clock: points per shot by how much of it is gone
  {
    let q = 0;
    let start = 0;
    for (const e of ev) {
      if (e.q !== q) {
        q = e.q;
        start = q <= 4 ? 720 : 300;
      }
      if (e.k === 'shot' && e.fga && e.clock >= 24 && !/heave/i.test(e.desc)) {
        const bin = Math.min(6, Math.max(0, Math.floor((start - e.clock) / 4)));
        A.clockBin[bin][0]++;
        if (e.made) A.clockBin[bin][1] += e.zone === 'c3' || e.zone === 'ab3' ? 3 : 2;
      }
      if (e.k === 'end') start = e.clock;
      else if (e.k === 'orb') start = e.clock + 10;
    }
  }
  // how close the game is at the late checkpoints (the score at the last event before each)
  {
    const at = (q: number, clock: number) => {
      let d = 0;
      for (const e of ev) {
        if (e.q > q || (e.q === q && e.clock < clock)) break;
        d = e.hs - e.as;
      }
      return Math.abs(d);
    };
    const marks: [string, number, number, number][] = [
      ['q3', 3, -1, 5],
      ['4:00', 4, 240, 5],
      ['2:00', 4, 120, 5],
      ['0:24', 4, 24, 3],
    ];
    for (const [k, q, c, w] of marks) if (at(q, c) <= w) A.closeAt[k] = (A.closeAt[k] ?? 0) + 1;
    // a lead of 1-6 late in the fourth: what becomes of it by the end of regulation
    const signed = (q: number, clock: number) => {
      let d = 0;
      for (const e of ev) {
        if (e.q > q || (e.q === q && e.clock < clock)) break;
        d = e.hs - e.as;
      }
      return d;
    };
    const reg = signed(4, -1);
    for (const [k, c] of [
      ['4:00', 240],
      ['2:00', 120],
    ] as const) {
      const d = signed(4, c);
      if (Math.abs(d) < 1 || Math.abs(d) > 6) continue;
      const o = (A.hold[k] ??= { n: 0, change: 0, ot: 0, wins: 0 });
      o.n++;
      o.change += Math.sign(d) * reg - Math.abs(d);
      if (res.ot > 0) o.ot++;
      if (d > 0 === margin > 0) o.wins++;
    }
    // the home margin at the end of each of the first three quarters
    let d = 0;
    let q = 1;
    for (const e of ev) {
      if (e.q > q && q <= 3) A.qMargin[q++ - 1].push(d);
      d = e.hs - e.as;
    }
  }
  // the first quarter's leader
  {
    const last = ev.filter((e) => e.q === 1).pop();
    const d = last ? last.hs - last.as : 0;
    if (Math.abs(d) >= 10 && Math.abs(d) <= 14) {
      A.q1Lead[0]++;
      if (d > 0 === margin > 0) A.q1Lead[1]++;
    }
  }
  const lateShot = (key: string, e: Extract<Ev, { k: 'shot' }>) => {
    const c = (A.late[key + (e.zone === 'c3' || e.zone === 'ab3' ? '3' : '2')] ??= [0, 0]);
    c[1]++;
    if (e.made) c[0]++;
  };
  const tempo = (key: string, yes: boolean) => {
    const c = (A.tempo[key] ??= [0, 0]);
    c[0]++;
    if (yes) c[1]++;
  };

  const close = g.at2 !== null && Math.abs(g.at2) <= 5;
  if (close) A.close++;
  if (close && g.at2) {
    A.lead2[0]++;
    if (g.at2 > 0 === margin > 0) A.lead2[1]++;
  }
  // unanswered points by each side as the events go by (the score an event carries is the one before it)
  const run = [0, 0];
  let seen = [0, 0];
  let runQ = 1;
  let spare = 0;
  const tids = [res.home.tid, res.away.tid];
  for (const [i, e] of ev.entries()) {
    const lead = (side: 0 | 1) => (side === 0 ? e.hs - e.as : e.as - e.hs);
    if (e.q !== runQ) {
      runQ = e.q;
      run[0] = run[1] = 0;
    }
    for (const side of [0, 1] as const) {
      const d = (side === 0 ? e.hs : e.as) - seen[side];
      if (d > 0) {
        run[side] += d;
        run[1 - side] = 0;
      }
    }
    seen = [e.hs, e.as];
    if (e.k === 'foul') A.pfQ[Math.min(e.q, 4) - 1]++;
    if (e.k === 'ft') A.ftaQ[Math.min(e.q, 4) - 1] += e.n;
    if (e.k === 'timeout' && e.q <= 3) {
      A.toRun[0]++;
      if (run[1 - e.side] >= 8) A.toRun[1]++;
    }
    if (e.k === 'timeout' && e.q === 4 && e.clock <= 420 && e.clock > 300) spare++;
    if (e.k === 'shot' && e.fga && !/heave/i.test(e.desc)) {
      const up = lead(e.side);
      if (e.q >= 4 && e.clock <= 24 && up <= 0 && up >= -3) SEASON.last.push([tids[e.side], e.pid]);
      else if (e.q <= 3 || e.clock > 300) SEASON.early.push([tids[e.side], e.pid]);
    }
    if (e.k === 'timeout') {
      A.timeouts++;
      if (e.q === 4) A.timeoutsQ4++;
      if (close && e.q === 4 && e.clock <= 120) A.closeTO++;
      if (e.q <= 3) {
        A.toEarly[0]++;
        if ((e.clock > 360 && e.clock <= 420) || (e.clock > 120 && e.clock <= 180)) A.toEarly[1]++;
        if (e.clock > 420) A.toEarly[2]++;
      }
    }
    if (close && e.q === 4 && e.clock <= 120 && e.k === 'ft') A.closeFtTrips++;
    if (close && e.q === 4 && e.clock <= 60 && e.k === 'foul' && lead(e.side) < 0) A.closeTrailFouls++;
    if (e.k === 'shot' && e.fga && /heave/i.test(e.desc)) A.heaves++;
    else if (e.k === 'shot' && e.fga) {
      const up = lead(e.side);
      if (e.q >= 4) {
        if (e.clock <= 240 && e.clock > 24 && up !== 0 && Math.abs(up) <= 6) lateShot(up > 0 ? 'lead' : 'trail', e);
        if (e.clock <= 24 && up < 0 && up >= -6) lateShot('trail24', e);
        if (up <= 0 && up >= -3) lateShot(e.clock <= 5 ? 'last5' : e.clock <= 24 ? 'last24' : '-', e);
      } else if (e.clock <= 5) lateShot('qend5', e);
    }
    if (e.k === 'shot' && e.fga) {
      A.shots.fga++;
      A.shots.zone[e.zone] = (A.shots.zone[e.zone] ?? 0) + 1;
      // (the NBA's dunks include alley-oop dunks; the engine calls those just "alley-oop")
      if (/dunk|alley/i.test(e.desc)) A.shots.dunk++;
      if (/alley/i.test(e.desc)) {
        A.shots.oopA++;
        if (e.made) A.shots.oopM++;
      }
      if (e.finish === 'cut') A.shots.cut++;
    }
    if (e.k === 'orb' && !e.team) {
      const n = nextAction(ev, i, e.side, true);
      if (n) {
        A.orbNext[0]++;
        if (e.clock - n.clock <= 2) A.orbNext[1]++;
      }
    }
    if (e.k !== 'end') continue;
    // the clock after a change of possession (only with a full shot clock's worth of game clock left)
    const ball = (1 - e.side) as 0 | 1;
    if ((e.ctx === 'dreb' || e.ctx === 'made') && e.clock > 24) {
      const n = nextAction(ev, i, ball);
      if (n) (e.ctx === 'dreb' ? A.drebDt : A.makeDt).push(e.clock - n.clock);
    }
    // a dead-ball team rebound: the trip after it starts with an inbound
    if (e.ctx === 'oob' && e.clock > 24) {
      const n = nextAction(ev, i, ball);
      if (n) {
        A.deadReb[0]++;
        if (e.clock - n.clock <= 4) A.deadReb[1]++;
      }
    }
    // the two-for-one: a trip begun with 33-40 seconds left whose first shot or turnover leaves time for another
    if (e.q < 4 && e.clock >= 33 && e.clock <= 40) {
      const n = nextAction(ev, i, ball);
      if (n) {
        A.twoForOne[0]++;
        if (n.clock > 24) A.twoForOne[1]++;
      }
    }
    // a trip begun with 1-6 seconds left in the first three quarters: does it get a shot off?
    if (e.q < 4 && e.clock >= 1 && e.clock <= 6) {
      A.qEnd[0]++;
      if (ev.slice(i + 1).some((x) => x.q === e.q && x.k === 'shot' && x.side === ball)) A.qEnd[1]++;
    }
    if (e.q < 4) continue;
    // the end game: the leader gains the ball (a defensive board, a steal, the other side's score)
    const up = lead(ball);
    // late tempo, a game within 8 in the last 3:00 (with a shot clock's worth of game clock left)
    if (e.clock <= 180 && e.clock > 30 && Math.abs(up) >= 1 && Math.abs(up) <= 8 && (e.ctx === 'made' || e.ctx === 'dreb')) {
      const n = nextAction(ev, i, ball);
      if (n) {
        const dt = e.clock - n.clock;
        if (up > 0 && e.ctx === 'made') tempo('leadMade', dt >= 18);
        if (up > 0 && e.ctx === 'dreb') tempo('leadDreb', dt >= 18);
        if (up < 0 && e.ctx === 'dreb') tempo('trailDreb', dt <= 8);
        if (up < 0 && e.ctx === 'made') tempo('trailMade', dt <= 8);
      }
    }
    if (['dreb', 'steal', 'made', 'ft'].includes(e.ctx) && up > 0 && up <= 6 && e.clock <= 24 && e.clock >= 2) {
      const c = (A.lead24[up <= 2 ? 'up12' : up === 3 ? 'up3' : 'up46'] ??= {});
      const what = firstThing(ev, i, e.side, ball);
      c.n = (c.n ?? 0) + 1;
      c[what] = (c[what] ?? 0) + 1;
    }
    if (['dreb', 'steal', 'made', 'ft'].includes(e.ctx) && up > 0) {
      const fouled = foulsFirst(ev, i, e.side, ball);
      // (from 2 s: under that there's no time to foul, and the engine doesn't try)
      if (e.clock <= 24 && e.clock >= 2 && up === 3) sit('up3_24', fouled);
      if (e.clock <= 24 && e.clock >= 2 && up <= 2) sit('up12_24', fouled);
      if (e.clock > 24 && e.clock <= 40 && up === 3) sit('up3_40', fouled);
      if (e.clock > 24 && e.clock <= 40 && up >= 4 && up <= 6) sit('up46_40', fouled);
    }
    // down one with the ball in the last 12 seconds: a three, or something else
    if (up === -1 && e.clock <= 12 && e.clock >= 1) {
      A.down1[0]++;
      for (let j = i + 1; j < ev.length; j++) {
        const x = ev[j];
        if (x.q !== e.q || (x.k === 'foul' && x.side !== ball) || (x.k === 'to' && x.side === ball)) break;
        if (x.k === 'shot' && x.side === ball) {
          if (x.zone === 'c3' || x.zone === 'ab3') A.down1[1]++;
          break;
        }
      }
    }
    // the trailing side gains the ball, down three, in the last 12 seconds: does the leader foul?
    if (up === -3 && e.clock <= 12 && e.clock > 0) sit('leaderFoul3', foulsFirst(ev, i, e.side, ball));
  }
  A.q4Spare[0] += spare;
  if (spare >= 3) A.q4Spare[1]++;
}

// ------------------------------------------------------------ the seasons

const seed: SeedData = JSON.parse(readFileSync('src/data/seed.json', 'utf8'));
const t0 = performance.now();
for (const rngSeed of seeds) {
  const ts = performance.now();
  const league = createLeague({ name: 'Gameday', userTid: 0, coachName: 'Check', settings: defaultSettings(), seed, rngSeed });
  userTid = league.userTid;
  // AI teams are cut to 15 at creation, the user's team isn't (as in real-check)
  const roster = standardRoster(league, userTid).sort((a, b) => a.ovr - b.ovr);
  while (standardRoster(league, userTid).length > CAP.rosterMax) releasePlayer(league, roster.shift()!, { news: false });
  const errs = startRegularSeason(league);
  if (errs.length) throw new Error(errs.join('; '));
  const before = A.games;
  while (league.phase === 'regular') simDay(league);
  closeSeason();
  console.log(`seed ${rngSeed}: ${A.games - before} games in ${((performance.now() - ts) / 1000).toFixed(1)}s`);
}

// ------------------------------------------------------------ the table

const corr = (a: number[], b: number[]) => {
  const ma = mean(a);
  const mb = mean(b);
  return mean(a.map((x, i) => (x - ma) * (b[i] - mb))) / (sd(a) * sd(b));
};
const median = (x: number[]) => {
  const s = [...x].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};
const share = (x: number[], f: (v: number) => boolean) => (x.length ? (100 * x.filter(f).length) / x.length : NaN);
const pct = (a: number, b: number) => (b ? (100 * a) / b : NaN);
const tg = A.teamGames;
const gm = A.games;
const abs = A.margins.map(Math.abs);
const z = (k: string) => pct(A.shots.zone[k] ?? 0, A.shots.fga);
const sitPct = (k: string) => pct(A.sit[k]?.[1] ?? 0, A.sit[k]?.[0] ?? 0);

type Row = [area: string, measure: string, lo: number, hi: number, sim: number, unit?: '%' | '', digits?: number, note?: string];
const pps = (i: number) => A.clockBin[i][1] / A.clockBin[i][0];
const binShots = A.clockBin.reduce((a, b) => a + b[0], 0);
const latePct = (k: string) => pct(A.late[k]?.[0] ?? 0, A.late[k]?.[1] ?? 0);
const lateN = (k: string) => `n=${A.late[k]?.[1] ?? 0}`;
const l24 = (k: string, what: string) => pct(A.lead24[k]?.[what] ?? 0, A.lead24[k]?.n ?? 0);
const trouble = (k: string) => pct(A.trouble[k]?.[1] ?? 0, A.trouble[k]?.[0] ?? 0);
const tempoPct = (k: string) => pct(A.tempo[k]?.[1] ?? 0, A.tempo[k]?.[0] ?? 0);
const st = (k: string) => (A.startersOn[k]?.[0] ?? NaN) / (A.startersOn[k]?.[1] ?? 1);
const rows: Row[] = [
  ['Results', 'Points per team-game', 113.8, 115.6, A.pts / tg],
  ['Results', 'Home win %', 54.4, 55.5, pct(A.homeWins, gm), '%'],
  ['Results', 'OT rate', 4.4, 4.9, pct(A.ot, gm), '%'],
  ['Results', 'Final margin <=3', 14.4, 15.0, share(abs, (m) => m <= 3), '%'],
  ['Results', 'Final margin <=5', 24.5, 25.1, share(abs, (m) => m <= 5), '%'],
  ['Results', 'Leader at 2:00 (within 5) wins', 71.6, 75.8, pct(A.lead2[1], A.lead2[0]), '%'],
  ['Results', 'Within 5 after three quarters', 28.8, 30.2, pct(A.closeAt.q3 ?? 0, gm), '%'],
  ['Results', 'Within 5 at 4:00 of the fourth', 28.2, 28.3, pct(A.closeAt['4:00'] ?? 0, gm), '%'],
  ['Results', 'Within 5 at 2:00', 28.6, 29.3, pct(A.closeAt['2:00'] ?? 0, gm), '%'],
  ['Results', 'Within 3 at 0:24', 21.5, 21.7, pct(A.closeAt['0:24'] ?? 0, gm), '%'],
  [
    'Results',
    'Lead of 1-6 at 4:00: change by the end of regulation',
    -0.54,
    -0.29,
    (A.hold['4:00']?.change ?? NaN) / (A.hold['4:00']?.n ?? 1),
    '',
    2,
    `n=${A.hold['4:00']?.n ?? 0}`,
  ],
  ['Results', '... leader wins', 69.0, 72.4, pct(A.hold['4:00']?.wins ?? 0, A.hold['4:00']?.n ?? 0), '%'],
  ['Results', '... goes to overtime', 10.3, 10.5, pct(A.hold['4:00']?.ot ?? 0, A.hold['4:00']?.n ?? 0), '%'],
  [
    'Results',
    'Lead of 1-6 at 2:00: change by the end of regulation',
    -0.09,
    -0.05,
    (A.hold['2:00']?.change ?? NaN) / (A.hold['2:00']?.n ?? 1),
    '',
    2,
    `n=${A.hold['2:00']?.n ?? 0}`,
  ],
  ['Results', '... leader wins', 76.9, 79.1, pct(A.hold['2:00']?.wins ?? 0, A.hold['2:00']?.n ?? 0), '%'],
  ['Results', '... goes to overtime', 12.8, 13.6, pct(A.hold['2:00']?.ot ?? 0, A.hold['2:00']?.n ?? 0), '%'],
  ['Results', 'Final margin >=20', 21.1, 22.9, share(abs, (m) => m >= 20), '%'],
  ['Results', 'Final margin >=30', 6.5, 7.8, share(abs, (m) => m >= 30), '%'],
  ['Results', 'Final margin >=40', 1.5, 2.3, share(abs, (m) => m >= 40), '%', 2, `biggest ${Math.max(...abs)}`],
  ['Results', 'Margin SD', 15.9, 16.4, sd(A.margins)],
  ['Results', '... after one quarter', 8.6, 8.7, sd(A.qMargin[0])],
  ['Results', '... at the half', 11.6, 12.2, sd(A.qMargin[1])],
  ['Results', '... after three quarters', 14.6, 15.1, sd(A.qMargin[2])],
  [
    'Results',
    'Q4 margin against the lead after three (corr)',
    -0.11,
    -0.1,
    corr(
      A.qMargin[2],
      A.margins.map((m, i) => m - A.qMargin[2][i]),
    ),
    '',
    2,
  ],
  ['Box', 'Possessions per team-game (box)', 100.4, 101.1, (A.fga + 0.44 * A.fta - A.orb + A.tov) / tg],
  ['Box', 'Points per 100 possessions', 111.7, 112.3, (100 * A.pts) / (A.fga + 0.44 * A.fta - A.orb + A.tov)],
  ['Box', 'FG%', 46.9, 47.1, pct(A.fgm, A.fga), '%'],
  ['Box', '3PA per team-game', 37.0, 37.3, A.tpa / tg],
  ['Box', '3P%', 36.0, 36.3, pct(A.tpm, A.tpa), '%'],
  ['Box', 'FTA per team-game', 21.7, 23.5, A.fta / tg],
  ['Box', 'Turnovers per team-game', 14.3, 14.5, A.tov / tg],
  ['Box', 'OREB%', 25.0, 25.8, pct(A.orb, A.orb + A.oppDrb), '%'],
  ['Box', 'Personal fouls per team-game', 18.6, 19.9, A.pf / tg],
  ['Box', 'FGA per team-game', 89.0, 89.1, A.fga / tg],
  ['Box', '2P%', 54.5, 55.0, pct(A.fgm - A.tpm, A.fga - A.tpa), '%'],
  ['Box', 'Rebounds per team-game', 43.8, 44.1, A.reb / tg],
  ['Box', 'Offensive rebounds per team-game', 11.1, 11.4, A.orb / tg],
  ['Box', 'Assists per team-game', 26.5, 26.7, A.ast / tg],
  ['Box', 'Double-doubles per team-game', 0.78, 0.91, A.doubleDoubles / tg, '', 2],
  ['Results', 'Up 10-14 after Q1: wins', 73, 75, pct(A.q1Lead[1], A.q1Lead[0]), '%', 1, `n=${A.q1Lead[0]}`],
  ['Shot clk', 'Points per shot, 0-4 s used', 1.34, 1.39, pps(0), '', 2, `${pct(A.clockBin[0][0], binShots).toFixed(1)}% of shots (NBA 4.1%)`],
  ['Shot clk', '... 4-8 s', 1.18, 1.19, pps(1), '', 2],
  ['Shot clk', '... 8-12 s', 1.12, 1.13, pps(2), '', 2],
  ['Shot clk', '... 12-16 s', 1.09, 1.1, pps(3), '', 2],
  ['Shot clk', '... 16-20 s', 1.05, 1.06, pps(4), '', 2],
  ['Shot clk', '... 20-24 s', 0.99, 1.01, pps(5), '', 2, `${pct(A.clockBin[5][0], binShots).toFixed(1)}% of shots (NBA 10.7%)`],
  ['Crunch', 'Leader 2P%, 4:00-0:24, within 6', 50.2, 51.0, latePct('lead2'), '%', 1, lateN('lead2')],
  ['Crunch', 'Leader 3P%, same', 32.3, 33.7, latePct('lead3'), '%', 1, lateN('lead3')],
  ['Crunch', 'Trailer 2P%, same', 52.8, 54.3, latePct('trail2'), '%', 1, lateN('trail2')],
  ['Crunch', 'Trailer 3P%, same', 34.1, 34.7, latePct('trail3'), '%', 1, lateN('trail3')],
  ['Crunch', 'Trailer 3P%, last 0:24, within 6', 23.1, 26.7, latePct('trail243'), '%', 1, lateN('trail243')],
  ['Crunch', 'Tied or down 1-3, last 0:05: 2P%', 33, 34, latePct('last52'), '%', 1, lateN('last52')],
  ['Crunch', '... 3P%', 20, 21, latePct('last53'), '%', 1, lateN('last53')],
  ['Crunch', 'Tied or down 1-3, 0:05-0:24: 2P%', 51, 54, latePct('last242'), '%', 1, lateN('last242')],
  ['Crunch', '... 3P%', 23, 27, latePct('last243'), '%', 1, lateN('last243')],
  ['Crunch', 'End of Q1-Q3, last 0:05: 2P%', 42, 43, latePct('qend52'), '%', 1, lateN('qend52')],
  ['Crunch', '... 3P%', 25, 26, latePct('qend53'), '%', 1, lateN('qend53')],
  ['Crunch', 'Heaves per game', 0.9, 0.9, A.heaves / gm, '', 2],
  ['Crunch', 'Trip begun 0:01-0:06 of Q1-Q3 gets a shot', 57, 69, pct(A.qEnd[1], A.qEnd[0]), '%'],
  ['End game', 'Leader up 1-2, last 0:24: clock runs out', 1, 2, l24('up12', 'out'), '%', 1, `n=${A.lead24.up12?.n ?? 0}`],
  ['End game', '... leader turns it over', 8, 12, l24('up12', 'to'), '%'],
  ['End game', 'Leader up 3, last 0:24: clock runs out', 4, 4, l24('up3', 'out'), '%', 1, `n=${A.lead24.up3?.n ?? 0}`],
  ['End game', '... leader turns it over', 7, 8, l24('up3', 'to'), '%'],
  ['End game', 'Leader up 4-6, last 0:24: fouled', 64, 65, l24('up46', 'foul'), '%', 1, `n=${A.lead24.up46?.n ?? 0}`],
  ['End game', '... clock runs out', 21, 23, l24('up46', 'out'), '%'],
  ['End game', '... leader turns it over', 5, 7, l24('up46', 'to'), '%'],
  ['Tempo', 'Last 3:00 within 8: leader 18 s+ after a score', 58, 59, tempoPct('leadMade'), '%'],
  ['Tempo', '... leader 18 s+ after a defensive board', 33, 36, tempoPct('leadDreb'), '%'],
  ['Tempo', '... trailer within 8 s after a defensive board', 48, 51, tempoPct('trailDreb'), '%'],
  ['Tempo', '... trailer within 8 s after a score', 16, 16, tempoPct('trailMade'), '%'],
  ['Fouls', 'Starter on floor after 2nd foul in Q1 (rest of half)', 41, 43, trouble('q1'), '%'],
  ['Fouls', '... after 3rd in Q2 (rest of Q2)', 20, 22, trouble('q2'), '%'],
  ['Fouls', '... after 4th in Q3 (rest of Q3)', 21, 22, trouble('q3'), '%'],
  ['Fouls', '... after 5th in Q4, 7:00+ left (until 4:00)', 38, 40, trouble('q4'), '%'],
  ['Coaching', 'Q1-Q3 timeouts in the minute after 7:00 or 3:00', 33, 33, pct(A.toEarly[1], A.toEarly[0]), '%'],
  ['Coaching', 'Q1-Q3 timeouts before 7:00', 34, 34, pct(A.toEarly[2], A.toEarly[0]), '%'],
  ['Clock', 'Secs to shot/TO after DREB', 9.4, 9.5, mean(A.drebDt)],
  ['Clock', '... within 6 s', 34.4, 35.4, share(A.drebDt, (d) => d <= 6), '%'],
  ['Clock', 'Secs to shot/TO after a make', 16.0, 16.2, mean(A.makeDt)],
  ['Clock', '... in 8-12 s', 15.7, 16.4, share(A.makeDt, (d) => d >= 8 && d < 12), '%'],
  ['Clock', '... in 16-20 s', 25.5, 25.9, share(A.makeDt, (d) => d >= 16 && d < 20), '%'],
  ['Clock', 'Next action within 2 s of OREB', 61.6, 62.9, pct(A.orbNext[1], A.orbNext[0]), '%'],
  ['Clock', 'Shot-clock violations per team-game', 0.67, 0.74, A.scv / tg, '', 2],
  ['End game', 'Trailer fouls, leader up 3, 0:02-0:24', 81, 86, sitPct('up3_24'), '%', 1, `n=${A.sit.up3_24?.[0] ?? 0}`],
  ['End game', 'Trailer fouls, leader up 1-2, 0:02-0:24', 81, 82, sitPct('up12_24'), '%', 1, `n=${A.sit.up12_24?.[0] ?? 0}`],
  ['End game', 'Trailer fouls, leader up 3, 0:24-0:40', 30, 37, sitPct('up3_40'), '%', 1, `n=${A.sit.up3_40?.[0] ?? 0}`],
  ['End game', 'Trailer fouls, leader up 4-6, 0:24-0:40', 71, 72, sitPct('up46_40'), '%', 1, `n=${A.sit.up46_40?.[0] ?? 0}`],
  ['End game', 'Leader fouls when up 3, last 0:12', 28, 30, sitPct('leaderFoul3'), '%', 1, `n=${A.sit.leaderFoul3?.[0] ?? 0}`],
  ['End game', 'Timeouts, last 2:00, within 5 at 2:00', 2.16, 2.25, A.closeTO / A.close, '', 2, `games=${A.close}`],
  ['End game', 'Trailing team fouls, last 1:00 (same)', 1.2, 1.27, A.closeTrailFouls / A.close, '', 2],
  ['End game', 'FT trips, last 2:00 (same)', 2.56, 2.62, A.closeFtTrips / A.close, '', 2],
  ['Coaching', 'Timeouts per team-game', 5.39, 5.42, A.timeouts / tg, '', 2],
  ['Coaching', 'Share of timeouts in Q4', 35.0, 35.6, pct(A.timeoutsQ4, A.timeouts), '%'],
  ['Rotation', "Minutes before a team's first sub", 5.3, 5.6, mean(A.firstSub)],
  ['Rotation', 'Substitutions per team-game', 28.6, 31.1, A.subs / tg],
  ['Rotation', 'Stints, players with 30+ min', 3.82, 4.05, mean(A.stints30), '', 2],
  ['Rotation', 'Stint length, 30+ min players (min)', 9.2, 9.8, mean(A.stintLen30)],
  ['Rotation', "Starter's first trip to bench (median min)", 7.3, 7.3, median(A.firstOff)],
  ['Rotation', 'Time with no starter on the floor', 5, 5, pct(A.noStarter, A.teamSec), '%'],
  ['Whistle', 'Technicals per game', 1.04, 1.07, A.techs / gm, '', 2],
  ['Whistle', 'Foul-difference SD per game', 5.0, 5.0, sd(A.pfDiff)],
  ['Whistle', 'FTA-difference SD per game', 9.2, 9.2, sd(A.ftaDiff)],
  ['Whistle', 'Games with a 15+ FTA gap', 11.4, 11.4, share(A.ftaDiff.map(Math.abs), (d) => d >= 15), '%'],
  ['Whistle', 'Foul-outs per game', 0.18, 0.21, A.foulOuts / gm, '', 2],
  ['Whistle', 'Team-games with 28+ fouls', 2.4, 3.9, pct(A.pf28, tg), '%'],
  ['Whistle', 'Held balls per game', 0.74, 0.81, A.heldBalls / gm, '', 2],
  ['Whistle', 'Loose-ball fouls per team-game', 1.19, 1.42, A.looseBall / tg, '', 2],
  ['Shots', 'Dunks, share of FGA', 6.1, 6.2, pct(A.shots.dunk, A.shots.fga), '%'],
  ['Shots', 'Alley-oop FG%', 82, 83, pct(A.shots.oopM, A.shots.oopA), '%', 1, `${(A.shots.oopA / tg).toFixed(2)}/tm-g`],
  ['Shots', 'Restricted-area share of FGA', 28.5, 28.8, z('rim'), '%'],
  ['Shots', 'Paint (non-RA) share', 18.4, 18.7, z('paint'), '%'],
  ['Shots', 'Mid-range share', 10.8, 11.2, z('mid'), '%'],
  ['Shots', 'Corner-3 share', 10.8, 10.8, z('c3'), '%'],
  ['Shots', 'Above-break-3 share', 30.6, 31.1, z('ab3'), '%'],
  ['Shots', 'Cut share of FGA', 4, 8, pct(A.shots.cut, A.shots.fga), '%'],
  ['Shots', 'Zone D, share of AI half-court poss', 1, 5, pct(A.zonePoss, A.halfPoss), '%'],
  ['Shots', 'Second-chance points', 14.1, 15.0, A.secondChance / tg],
  ['Crunch', 'Last 0:24, tied or down 1-3: shots by the top scorer', 30, 32, pct(A.lastShot[1], A.lastShot[0]), '%', 1, `n=${A.lastShot[0]}`],
  ['Crunch', '... by the top two', 47, 51, pct(A.lastShot[2], A.lastShot[0]), '%'],
  ['Crunch', "Top scorer's share of shots earlier in games", 15, 15, pct(A.early[1], A.early[0]), '%'],
  ['Crunch', 'Down 1, last 0:12 with the ball: shoots a three', 19, 21, pct(A.down1[1], A.down1[0]), '%', 1, `n=${A.down1[0]}`],
  ['End game', 'Leader up 1-2, last 0:24: gets a shot off', 5, 6, l24('up12', 'shot'), '%'],
  ['End game', 'Leader up 4-6, last 0:24: gets a shot off', 6, 7, l24('up46', 'shot'), '%'],
  ['Clock', 'Two-for-one taken (trip begun 0:33-0:40, Q1-Q3)', 64, 65.3, pct(A.twoForOne[1], A.twoForOne[0]), '%', 1, `n=${A.twoForOne[0]}`],
  ['Clock', 'After a dead-ball team rebound: shot/TO within 4 s', 0.7, 0.7, pct(A.deadReb[1], A.deadReb[0]), '%', 1, `n=${A.deadReb[0]}`],
  ['Box', 'Rebounds credited at the horn, per game', 0.04, 0.04, A.hornBoards / gm, '', 2],
  ['Whistle', 'Fouls per team, Q1', 3.52, 3.85, A.pfQ[0] / tg, '', 2],
  ['Whistle', '... Q4 (and overtime)', 4.82, 5.02, A.pfQ[3] / tg, '', 2],
  ['Whistle', 'Free-throw attempts per team, Q1', 4.2, 4.79, A.ftaQ[0] / tg, '', 2],
  ['Whistle', '... Q4 (and overtime)', 6.08, 6.38, A.ftaQ[3] / tg, '', 2],
  ['Whistle', 'Home minus away: fouls', -0.39, -0.07, mean(A.pfDiff), '', 2],
  ['Whistle', '... free-throw attempts', 0.25, 0.57, mean(A.ftaDiff), '', 2],
  ['Results', "Correlation of the two teams' FG%", -0.05, 0.05, corr(A.fgPct[0], A.fgPct[1]), '', 2],
  ['Results', 'Team strength: SD of season margins', 5.9, 6.1, mean(A.teamSd), '', 2],
  ['Results', 'Better team (by season margin) wins', 68.7, 69.3, pct(A.better[1], A.better[0]), '%'],
  ['Rotation', 'Starters on the floor: Q2 at 11:30', 1.94, 2.13, st('q2_1130'), '', 2],
  ['Rotation', '... Q2 at 7:30', 2.82, 2.87, st('q2_730'), '', 2],
  ['Rotation', '... Q2 at 1:30', 3.7, 3.8, st('q2_130'), '', 2],
  ['Rotation', '... Q3 at 2:30', 1.63, 1.79, st('q3_230'), '', 2],
  ['Rotation', '... Q4 at 11:30', 2.07, 2.21, st('q4_1130'), '', 2],
  ['Rotation', '... Q4 at 1:30, within 6 at 6:00', 3.82, 3.84, st('q4_130c'), '', 2],
  ['Coaching', 'Q1-Q3 timeouts called down an 8+ run', 11, 12, pct(A.toRun[1], A.toRun[0]), '%'],
  ['Coaching', 'Q4 timeouts between 7:00 and 5:00, per game', 0.62, 0.67, A.q4Spare[0] / gm, '', 2],
  ['Coaching', '... games with 3+', 0.3, 0.3, pct(A.q4Spare[1], gm), '%'],
  ['Players', 'Players averaging 20+ points, per season', 33, 34, mean(A.twenty)],
  ['Players', 'Scoring leader, points a game', 32.7, 33.5, mean(A.leaderPpg)],
  ['Players', '5-steal games per season', 122, 144, mean(A.steal5), '', 0],
  ['Players', 'Triple-doubles per game', 0.111, 0.121, A.tripleDoubles / gm, '', 3],
  ['Players', 'Team-games with a 50-pt scorer', 0.69, 0.73, pct(A.fifty, tg), '%', 2],
];

const fmt = (v: number, unit = '', d = 1) => (Number.isFinite(v) ? `${v.toFixed(d)}${unit}` : '-');
// (OK: within the NBA's range, give or take 4% of it)
const flag = (lo: number, hi: number, v: number) => (!Number.isFinite(v) ? 'n/a' : v >= lo * 0.96 && v <= hi * 1.04 ? 'OK' : 'OFF');
const out = rows.map(([area, measure, lo, hi, v, unit = '', d = 1, note = '']) => ({
  area,
  measure,
  nba: lo === hi ? fmt(lo, unit, d) : `${fmt(lo, '', d)}-${fmt(hi, unit, d)}`,
  sim: fmt(v, unit, d),
  flag: flag(lo, hi, v),
  note,
  lo,
  hi,
  value: Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null,
}));
const w = [8, Math.max(...out.map((r) => r.measure.length)), 13, 8, 4];
const line = (c: string[]) => c.map((x, i) => (i === 3 ? x.padStart(w[i]) : x.padEnd(w[i] ?? 0))).join('  ');
console.log(`\n${gm} games (${seeds.length} season${seeds.length > 1 ? 's' : ''}, seeds ${seeds.join(', ')}) in ${((performance.now() - t0) / 1000).toFixed(1)}s\n`);
console.log(line(['Area', 'Measure', 'NBA', 'Sim', 'Flag']));
console.log(line(w.map((n) => '-'.repeat(n))));
for (const r of out) console.log(line([r.area, r.measure, r.nba, r.sim, r.flag, r.note]).trimEnd());
const off = out.filter((r) => r.flag === 'OFF').length;
console.log(`\n${out.length - off} OK, ${off} OFF`);
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ seeds, games: gm, missingHooks: missing, rows: out }, null, 2));
  console.log(`wrote ${jsonOut}`);
}
