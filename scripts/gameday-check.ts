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
// numbers below are the review's).
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
  tot: { fga: number; fgm: number };
}
interface Pl {
  pid: number;
  on: boolean;
  starter: boolean;
}

type Ev = { q: number; clock: number; side: 0 | 1; hs: number; as: number } & (
  | { k: 'shot'; zone: string; finish: string; fga: boolean; made: boolean; desc: string; fga0: number; fgm0: number }
  | { k: 'to'; steal: boolean }
  | { k: 'foul'; def: boolean }
  | { k: 'ft'; n: number }
  | { k: 'orb' }
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
    g = { ev: [], pending: null, inAddFoul: 0, onSince: new Map(), stints: new Map(), firstOff: [], firstSub: [-1, -1], subs: [0, 0], noStarter: [0, 0], at2: null, done: false };
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
  const so = o as { zone: string; finish: string };
  const t = off as Tm;
  const ev = push(s, g, { k: 'shot', side: t.side, zone: so.zone, finish: so.finish, fga: false, made: false, desc: '', fga0: t.tot.fga, fgm0: t.tot.fgm });
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
wrap('chargeFoul', (s, g, [t], call) => {
  if (!g.inAddFoul) push(s, g, { k: 'foul', side: (t as Tm).side, def: false });
  return call();
});
wrap('continueAfterOrb', (s, g, [off], call) => {
  push(s, g, { k: 'orb', side: (off as Tm).side });
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
};
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
  for (const [i, b] of box.entries()) {
    const o = box[1 - i];
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
    let top = 0;
    for (const p of b.players) {
      top = Math.max(top, p.pts);
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
  }

  // zone defense: AI defenses' half-court possessions
  for (const l of s.logs as PossLog[]) {
    if (l.kind !== 'half' || box[1 - l.off].tid === userTid) continue;
    A.halfPoss++;
    if (l.scheme !== 'man') A.zonePoss++;
  }

  const close = g.at2 !== null && Math.abs(g.at2) <= 5;
  if (close) A.close++;
  for (const [i, e] of ev.entries()) {
    const lead = (side: 0 | 1) => (side === 0 ? e.hs - e.as : e.as - e.hs);
    if (e.k === 'timeout') {
      A.timeouts++;
      if (e.q === 4) A.timeoutsQ4++;
      if (close && e.q === 4 && e.clock <= 120) A.closeTO++;
    }
    if (close && e.q === 4 && e.clock <= 120 && e.k === 'ft') A.closeFtTrips++;
    if (close && e.q === 4 && e.clock <= 60 && e.k === 'foul' && lead(e.side) < 0) A.closeTrailFouls++;
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
    if (e.k === 'orb') {
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
    if (e.q < 4) continue;
    // the end game: the leader gains the ball (a defensive board, a steal, the other side's score)
    const up = lead(ball);
    if (['dreb', 'steal', 'made', 'ft'].includes(e.ctx) && up > 0) {
      const fouled = foulsFirst(ev, i, e.side, ball);
      // (from 2 s: under that there's no time to foul, and the engine doesn't try)
      if (e.clock <= 24 && e.clock >= 2 && up === 3) sit('up3_24', fouled);
      if (e.clock <= 24 && e.clock >= 2 && up <= 2) sit('up12_24', fouled);
      if (e.clock > 24 && e.clock <= 40 && up === 3) sit('up3_40', fouled);
      if (e.clock > 24 && e.clock <= 40 && up >= 4 && up <= 6) sit('up46_40', fouled);
    }
    // the trailing side gains the ball, down three, in the last 12 seconds: does the leader foul?
    if (up === -3 && e.clock <= 12 && e.clock > 0) sit('leaderFoul3', foulsFirst(ev, i, e.side, ball));
  }
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
  console.log(`seed ${rngSeed}: ${A.games - before} games in ${((performance.now() - ts) / 1000).toFixed(1)}s`);
}

// ------------------------------------------------------------ the table

const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
const sd = (x: number[]) => {
  const m = mean(x);
  return Math.sqrt(mean(x.map((v) => (v - m) ** 2)));
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
const rows: Row[] = [
  ['Results', 'Points per team-game', 113.8, 115.6, A.pts / tg],
  ['Results', 'Home win %', 54.4, 55.5, pct(A.homeWins, gm), '%'],
  ['Results', 'OT rate', 4.4, 4.9, pct(A.ot, gm), '%'],
  ['Results', 'Final margin <=3', 14.4, 15.0, share(abs, (m) => m <= 3), '%'],
  ['Results', 'Final margin >=20', 21.1, 22.9, share(abs, (m) => m >= 20), '%'],
  ['Results', 'Final margin >=30', 6.5, 7.8, share(abs, (m) => m >= 30), '%'],
  ['Results', 'Margin SD', 15.9, 16.4, sd(A.margins)],
  ['Box', 'Possessions per team-game (box)', 100.4, 101.1, (A.fga + 0.44 * A.fta - A.orb + A.tov) / tg],
  ['Box', 'Points per 100 possessions', 111.7, 112.3, (100 * A.pts) / (A.fga + 0.44 * A.fta - A.orb + A.tov)],
  ['Box', 'FG%', 46.9, 47.1, pct(A.fgm, A.fga), '%'],
  ['Box', '3PA per team-game', 37.0, 37.3, A.tpa / tg],
  ['Box', '3P%', 36.0, 36.3, pct(A.tpm, A.tpa), '%'],
  ['Box', 'FTA per team-game', 21.7, 23.5, A.fta / tg],
  ['Box', 'Turnovers per team-game', 14.3, 14.5, A.tov / tg],
  ['Box', 'OREB%', 25.0, 25.8, pct(A.orb, A.orb + A.oppDrb), '%'],
  ['Box', 'Personal fouls per team-game', 18.6, 19.9, A.pf / tg],
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
