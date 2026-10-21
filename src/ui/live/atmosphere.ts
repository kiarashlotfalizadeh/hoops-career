// The live game's atmosphere, read from the possessions the court has drawn: the runs (a 12-0, a
// 14-2), lead changes and ties, who has the momentum, how loud the building is, clutch time, the big
// plays a broadcast calls as big plays, and the play-by-play's voice. Pure and deterministic: it folds
// the possession logs one at a time (`advance`), never draws from a random source, and picks its
// phrasings by hashing the game and the possession, so a game picked up from its journal reads the
// same as it did the first time. Nothing here changes the game: it only says what the logs show.

import { hashString } from '../../core/random';
import type { PossLog, PossStep } from '../../core/sim/log';
import { fmtClock, periodLabel } from '../stats';

/** Clutch time: the last five minutes of the 4th quarter or an overtime, within five points. */
export const CLUTCH_CLOCK = 300;
export const CLUTCH_MARGIN = 5;
/** Game seconds between two callouts over the court (a big one doesn't wait; clutch time waits less). */
export const CALL_GAP = 45;
export const CALL_GAP_CLUTCH = 15;
/** Game seconds between two crowd lines. */
export const CROWD_GAP = 180;
/** A run worth naming: the margin it's won by, and the most the other side can have scored in it (a quarter of it). */
export const RUN_MIN = 8;

export const isClutch = (q: number, clock: number, margin: number) => q >= 4 && clock <= CLUTCH_CLOCK && clock > 0.05 && Math.abs(margin) <= CLUTCH_MARGIN;

/** Game seconds played at `clock` seconds left in period `q`. */
export const gameSec = (q: number, clock: number) => (q <= 4 ? (q - 1) * 720 + 720 - clock : 2880 + (q - 5) * 300 + 300 - clock);

/** What the atmosphere knows about the night: who's playing where, and how much it means. */
export interface AtmoCtx {
  gid: number;
  /** The user's side (0 home, 1 away). */
  user: 0 | 1;
  /** Nicknames, [home, away]: "Knicks". */
  teams: [string, string];
  abbrevs: [string, string];
  /** The home arena ("Madison Square Garden"); none on a neutral floor. */
  arena?: string;
  name: (pid: number) => string;
  /** How much the night means, 0 (a regular-season game) to 3 (a Finals game): the crowd starts louder. */
  stakes: number;
}

/** A scoring play: the side, its points, game seconds, and the period. */
interface Play {
  s: 0 | 1;
  p: number;
  t: number;
  q: number;
}

/** A run: `a` for `side` against `b`, from game second `from` to `to`. */
export interface Run {
  side: 0 | 1;
  a: number;
  b: number;
  from: number;
  to: number;
  q: number;
}

/** The game as the atmosphere has folded it, after `n` possession logs. */
export interface Tally {
  n: number;
  q: number;
  /** Game seconds at the end of the last possession folded. */
  at: number;
  /** As of the logs ([home, away]). */
  score: [number, number];
  /** Each period's points, [home, away]. */
  periods: Record<number, [number, number]>;
  /** The latest scoring plays (the last 60), oldest first. */
  plays: Play[];
  /** Who leads (null: tied), and the last side that led (a tie doesn't end a lead's count). */
  leader: 0 | 1 | null;
  lastLed: 0 | 1 | null;
  /** Whether each side has led yet. */
  led: [boolean, boolean];
  leadChanges: number;
  ties: number;
  /** Each side's biggest lead. */
  big: [number, number];
  /** Each side's comeback, once called (so a deficit wiped out is said once). */
  back: [boolean, boolean];
  /** Points, this period's points, field goals made in a row, threes made in a row, blocks: by player. */
  pts: Record<number, number>;
  qpts: Record<number, number>;
  made: Record<number, number>;
  threes: Record<number, number>;
  blk: Record<number, number>;
  /** The home crowd's noise, 0..100. */
  crowd: number;
  /** Game seconds of the last crowd line, and whether its roar or its hush has been said since the building last settled. */
  crowdAt: number;
  roared: boolean;
  hushed: boolean;
  /** Who's on top lately, −1 (the away side) .. 1 (the home side). */
  momentum: number;
  /** Its running sum (points a trip, decayed). */
  mo: number;
  /** The biggest run of each period (by its margin). */
  runs: Record<number, Run>;
  /** The run last called (its start) and the margin it had then. */
  called: { key: string; m: number } | null;
  /** Clutch time at the last possession, and the periods it has been called in. */
  clutch: boolean;
  clutchQ: number[];
  /** A steal at the end of the last possession: who made it, for the breakaway. */
  stole?: { pid: number; side: 0 | 1 };
  /** Each period's buzzer-beater, by its shooter. */
  buzzers: Record<number, number>;
}

export type AtmoKind = 'run' | 'timeout' | 'lead' | 'tie' | 'clutch' | 'comeback' | 'play' | 'heat' | 'crowd';

/** Something the night says: in the play-by-play, and the bigger ones over the court. */
export interface AtmoEvent {
  id: string;
  kind: AtmoKind;
  /** The team it's about (−1: neither). */
  side: 0 | 1 | -1;
  /** 1: the play-by-play only; 2: a callout over the court; 3: a big one, up whatever came just before. */
  weight: 1 | 2 | 3;
  /** Order among the same weight (higher first). */
  pri: number;
  kicker: string;
  title: string;
  line?: string;
  /** Game seconds. */
  at: number;
  q: number;
  clock: number;
}

/** One play's call: the play-by-play's line, the court's caption, and how big it is (0 routine .. 3 the biggest). */
export interface Call {
  text: string;
  cap: string;
  tier: 0 | 1 | 2 | 3;
}

/** A possession's calls, by step index. */
export type LogVoice = (Call | undefined)[];

export function newTally(ctx: Pick<AtmoCtx, 'stakes'>): Tally {
  const base = crowdBase(ctx.stakes);
  return {
    n: 0,
    q: 1,
    at: 0,
    score: [0, 0],
    periods: {},
    plays: [],
    leader: null,
    lastLed: null,
    led: [false, false],
    leadChanges: 0,
    ties: 0,
    big: [0, 0],
    back: [false, false],
    pts: {},
    qpts: {},
    made: {},
    threes: {},
    blk: {},
    crowd: base,
    crowdAt: -CROWD_GAP,
    roared: false,
    hushed: false,
    momentum: 0,
    mo: 0,
    runs: {},
    called: null,
    clutch: false,
    clutchQ: [],
    buzzers: {},
  };
}

// ------------------------------------------------------------------ small helpers

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** One of `arr`, the same every time for the same keys. */
export function pick<T>(arr: readonly T[], ...keys: (string | number)[]): T {
  return arr[hashString(keys.join(':')) % arr.length];
}

/** Fill "{P} hits from {FT}" from `vars`; a placeholder with nothing to fill reads empty. */
function fill(s: string, vars: Record<string, string | number | undefined>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

const ORD = ['th', 'st', 'nd', 'rd'];
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (ORD[n % 10] ?? 'th')}`;
const QWORD = ['', 'first', 'second', 'third', 'fourth'];
/** "second-quarter", "overtime". */
const periodAdj = (q: number) => (q <= 4 ? `${QWORD[q]}-quarter` : q === 5 ? 'overtime' : `${ordinal(q - 4)}-overtime`);
/** "the 3rd", "overtime". */
const periodThe = (q: number) => (q <= 4 ? `the ${ordinal(q)}` : q === 5 ? 'overtime' : `the ${ordinal(q - 4)} overtime`);

/** "the Celtics'", "the Thunder's". */
export const teamPoss = (name: string) => `the ${name}${name.endsWith('s') ? "'" : "'s"}`;

/** What people call the building: "The Garden" for a Garden, its name otherwise. */
export function arenaShort(arena?: string): string {
  if (!arena) return 'The crowd';
  return /garden$/i.test(arena) ? 'The Garden' : arena;
}

const shotPts = (s: PossStep) => (s.k === 'shot' && s.made ? (s.v ?? 2) : s.k === 'ft' ? (s.v ?? 0) : 0);
const feet = (s: PossStep) => Math.round(Math.hypot(s.x ?? 0, (s.y ?? 5.25) - 5.25));
const scoreText = (sc: [number, number]) => `${Math.max(...sc)}-${Math.min(...sc)}`;

// ------------------------------------------------------------------ runs

/**
 * The run `side` is on as of its latest score: the stretch since one of its baskets in which it has
 * outscored the other side by `RUN_MIN` or more while giving up no more than a quarter of what it
 * scored ("14-2", "16-4"), the biggest such margin (the longer on a tie). None unless `side` scored last.
 */
export function currentRun(plays: readonly Play[], side: 0 | 1): Run | null {
  if (!plays.length || plays[plays.length - 1].s !== side) return null;
  let a = 0;
  let b = 0;
  let best: Run | null = null;
  const end = plays[plays.length - 1];
  for (let i = plays.length - 1; i >= 0 && i >= plays.length - 40; i--) {
    const pl = plays[i];
    if (pl.s === side) a += pl.p;
    else b += pl.p;
    // (a run starts with one of its own baskets, and gives up a quarter of what it scores at most)
    if (pl.s !== side || b * 4 > a || a - b < RUN_MIN) continue;
    if (!best || a - b > best.a - best.b || (a - b === best.a - best.b && a > best.a)) best = { side, a, b, from: pl.t, to: end.t, q: end.q };
  }
  return best;
}

/** "a 12-0 run", "an 8-0 run", "a 14-2 run". */
export const runText = (r: Pick<Run, 'a' | 'b'>) => `${r.a === 8 || r.a === 11 || r.a === 18 ? 'an' : 'a'} ${r.a}-${r.b} run`;

// ------------------------------------------------------------------ the crowd

const crowdBase = (stakes: number) => 50 + stakes * 8;

/** 0 hushed, 1 quiet, 2 into it, 3 loud, 4 on its feet. */
export const crowdLevel = (v: number) => (v >= 84 ? 4 : v >= 68 ? 3 : v >= 46 ? 2 : v >= 26 ? 1 : 0);

/** How a possession moves the home crowd: its scoring, its big plays, the runs, the clutch. */
function crowdAfter(t: Tally, log: PossLog, ctx: AtmoCtx, run: Run | null, clutchNow: boolean): number {
  const neutral = !ctx.arena;
  const base = crowdBase(ctx.stakes);
  let v = t.crowd + (base - t.crowd) * 0.07;
  // (on a neutral floor both sides have fans: everything good is cheered, nothing hushes it; a road
  // team's basket quiets a building less than a home basket lifts it)
  const sign = (side: 0 | 1) => (neutral || side === 0 ? 1 : -0.45);
  const off = log.off;
  for (let i = 0; i < log.steps.length; i++) {
    const s = log.steps[i];
    const pts = shotPts(s);
    if (pts) v += sign(off) * (pts === 3 && s.k === 'shot' ? 7 : pts * 2);
    if (s.k === 'shot' && s.made && /dunk|alley/.test(s.d ?? '')) v += sign(off) * (s.d === 'alley-oop' ? 8 : 4);
    if (s.k === 'foul' && log.steps[i - 1]?.k === 'shot' && log.steps[i - 1].made) v += sign(off) * 5;
    if (s.k === 'block') v += sign((1 - off) as 0 | 1) * 6;
    if (s.k === 'steal') v += sign((1 - off) as 0 | 1) * 4;
  }
  if (run && run.a - run.b >= 10) v += sign(run.side) * (run.side === 0 ? 4 : 8);
  // a close finish: nobody sits down
  if (clutchNow) v = Math.max(v, 66);
  // a home team buried: the building empties out a little
  const down = t.score[1] - t.score[0];
  if (!neutral && down >= 18) v = Math.min(v, 30);
  return clamp(v, 4, 100);
}

const CROWD_UP = ['{A} is on its feet', '{A} is rocking', '{A} is roaring', "{A} is as loud as it's been all night", 'The noise at {N} is deafening'];
const CROWD_UP_NEUTRAL = ['The crowd is on its feet', 'The crowd is roaring', 'This crowd is into it now'];
const CROWD_HUSH = ['A hush falls over {N}', '{A} has gone quiet', 'You could hear a pin drop at {N}', 'The {H} crowd is stunned', "{A}'s gone silent"];
const CROWD_BOOS = ['Boos rain down at {N}', 'The {H} fans let them hear it', 'Fans are heading for the exits at {N}'];

/** The crowd's line when its level moves far enough, now and then. */
function crowdLine(prev: Tally, next: Tally, ctx: AtmoCtx, at: number): AtmoEvent | null {
  if (at - prev.crowdAt < CROWD_GAP) return null;
  const lv = crowdLevel(next.crowd);
  const vars = { A: arenaShort(ctx.arena), N: ctx.arena ?? 'the arena', H: ctx.teams[0] };
  const key = [ctx.gid, prev.n, 'crowd'];
  const ev = (title: string, tone: number, side: 0 | 1 | -1): AtmoEvent => ({
    id: `crowd-${prev.n}`,
    kind: 'crowd',
    side,
    weight: 1,
    pri: tone,
    kicker: 'The crowd',
    title,
    at,
    q: next.q,
    clock: 0,
  });
  if (lv >= 4 && !prev.roared) return ev(fill(pick(ctx.arena ? CROWD_UP : CROWD_UP_NEUTRAL, ...key), vars), 1, ctx.arena ? 0 : -1);
  if (!ctx.arena) return null;
  // a hush is for a road run or a road lead that's starting to hurt, after the opening minutes
  const roadRun = currentRun(next.plays, 1);
  const hurts = (roadRun && roadRun.a - roadRun.b >= RUN_MIN) || next.score[1] - next.score[0] >= 8;
  if (lv <= 1 && !prev.hushed && hurts && at >= 240) {
    const lines = next.score[1] - next.score[0] >= 15 ? CROWD_BOOS : CROWD_HUSH;
    return ev(fill(pick(lines, ...key), vars), -1, 1);
  }
  return null;
}

// ------------------------------------------------------------------ the voice

type Fam = 'dunk' | 'oop' | 'layup' | 'reverse' | 'upunder' | 'float' | 'putback' | 'post' | 'jumper' | 'three';

function family(s: PossStep): Fam {
  const d = s.d ?? '';
  if (s.v === 3) return 'three';
  if (d === 'alley-oop') return 'oop';
  if (d.includes('dunk')) return 'dunk';
  if (d.includes('reverse')) return 'reverse';
  if (d.includes('up-and-under')) return 'upunder';
  if (d === 'floater' || d === 'runner') return 'float';
  if (d === 'putback' || d === 'tip-in') return 'putback';
  if (d.includes('hook') || d.includes('fadeaway')) return 'post';
  if (d.includes('layup')) return 'layup';
  if (s.zone === 'rim') return 'layup';
  return 'jumper';
}

const MAKE: Record<Fam, string[]> = {
  dunk: ['{P} throws it down', '{P} slams it home', '{P} with the two-handed flush', '{P} hammers it down', '{P} finishes with the dunk', '{P} rattles the rim'],
  oop: ['Alley-oop, {A} to {P}', '{A} lobs, {P} slams', '{P} catches the lob from {A} and throws it down', '{A} puts it up, {P} puts it away'],
  layup: ['{P} lays it in', '{P} finishes at the rim', '{P} gets to the basket for two', '{P} scoops it in', '{P} glides in for the layup', '{P} kisses it off the glass'],
  reverse: ['{P} spins in the reverse', '{P} goes under the rim for the reverse', '{P} with the reverse, off the glass'],
  upunder: ['{P} with the up-and-under', '{P} pump-fakes and goes up and under', '{P} gets his man in the air and scores'],
  float: ['{P} drops in the {D}', '{P} floats one in', '{P} with the soft touch on the {D}', "{P}'s {D} drops"],
  putback: ['{P} cleans it up', '{P} with the putback', '{P} tips it in', 'Second chance, and {P} converts'],
  post: ['{P} drops in the {D}', '{P} scores over the top with the {D}', '{P} turns and hits the {D}'],
  jumper: ['{P} hits the {D}', '{P} knocks down {AFT}-footer', '{P} drains the {D}', '{P} buries it from {FT} feet', '{P} rises and hits from {FT}', '{P} cashes the {D}'],
  three: [
    '{P} hits from three',
    '{P} drains the {D}',
    '{P} buries a three from {FT} feet',
    '{P} lets it fly: good',
    '{P} from deep: got it',
    'Splash: {P} from three',
    '{P} knocks down the {D}',
    '{P} connects from beyond the arc',
  ],
};
/** The same plays, louder: a three or a dunk that means something. */
const MAKE_BIG: Partial<Record<Fam, string[]>> = {
  dunk: ['{P} with a thunderous dunk', '{P} rises and hammers it home', 'Oh, {P}! What a slam', '{P} throws down a monster jam'],
  three: ['Bang! {P} from {FT} feet', '{P} from way downtown... got it!', '{P} drills it from {FT}', 'Bang! {P} buries the three', '{P} pulls the trigger: splash'],
};
const ASSIST = [' ({A} assist)', ' ({A} assist)', ', {A} with the dish', ', set up by {A}', ', {A} finds him'];
const AND_ONE = ['{P} scores through contact from {F}: and one', '{P} gets it to go with {F} on him: and one', '{P} hangs in the air and scores through {F}: and one'];
const POSTER = ['{P} dunks it on {F}: and one', '{P} posterizes {F}, and the foul', 'And one! {P} throws it down right on {F}'];
const BLOCK = ['{B} sends it back', 'Rejected! {B} blocks {P}', "{B} swats away {P}'s {D}", '{B} gets a hand on it: blocked', '{B} with the block on {P}', '{B} says no to {P}'];
const STEAL = ["{S} picks {P}'s pocket", '{S} jumps the passing lane', 'Stolen by {S}', '{S} strips {P}', '{S} with the steal on {P}'];
const BREAKAWAY = ['{S} takes it the other way', '{S} steals it and goes coast to coast', 'Off the steal, {S} all alone'];
const GO_AHEAD = ['and the {T} lead {SC}', '{T} in front {SC}', 'and that puts the {T} ahead, {SC}'];
const TIE = ['tied at {N}', 'and we are tied at {N}', 'all square at {N}'];
const STREAK = ['{N} straight for {P}', "{P}'s {N}th straight make", "he's heating up: {N} in a row"];
const STREAK3 = ['{N} straight threes for {P}', "{P}'s {N}th straight three", '{P} is on fire: {N} threes in a row'];
const PTS = ["that's {N} for {P}", '{P} has {N}', '{N} tonight for {P}'];

/** The point totals worth saying as a player passes them. */
const MARKS = [20, 30, 40, 50, 60];

/**
 * A possession's calls (by step index): every made basket in a varied, energetic voice (bigger for
 * bigger moments), the blocks and the steals. Misses, rebounds and fouls keep the engine's plain lines:
 * a routine trip reads calm. `t` is the game before the possession; the words are picked from the
 * game, the possession and the step, so they never change.
 */
export function voiceLog(t: Tally, log: PossLog, ctx: AtmoCtx, idx = t.n): LogVoice {
  const out: LogVoice = [];
  const N = ctx.name;
  const off = log.off;
  const stepPts = log.steps.reduce((x, s) => x + shotPts(s), 0);
  const score: [number, number] = [...log.score];
  score[off] -= stepPts;
  const pts = { ...t.pts };
  const made = { ...t.made };
  const threes = { ...t.threes };
  const blk = { ...t.blk };
  const team = ctx.teams[off];
  const lastShot = [...log.steps].reverse().find((s) => s.k === 'shot');
  for (let i = 0; i < log.steps.length; i++) {
    const s = log.steps[i];
    const k = (salt: string) => [ctx.gid, idx, i, salt];
    if (s.k === 'shot' && s.pid !== undefined) {
      const pid = s.pid;
      const v = s.v ?? 2;
      if (!s.made) {
        made[pid] = 0;
        if (v === 3) threes[pid] = 0;
        continue;
      }
      const lead = score[off] - score[1 - off];
      score[off] += v;
      const now = score[off] - score[1 - off];
      const was = pts[pid] ?? 0;
      pts[pid] = was + v;
      made[pid] = (made[pid] ?? 0) + 1;
      if (v === 3) threes[pid] = (threes[pid] ?? 0) + 1;
      const fam = family(s);
      const clock = log.clockEnd;
      const late = log.q >= 4 && clock <= 120;
      const clutchNow = isClutch(log.q, clock, lead);
      const goAhead = lead <= 0 && now > 0;
      const ties = lead < 0 && now === 0;
      const buzzer = s === lastShot && clock <= 0.05;
      const next = log.steps[i + 1];
      const andOne = next?.k === 'foul' && next.pid !== undefined;
      const fouler = andOne ? N(next.pid!) : '';
      const breakaway = log.kind === 'transition' && t.stole?.side === off && i <= 2;
      // how big: the buzzer and a late go-ahead first, then the plays that bring a crowd up
      const tier: Call['tier'] =
        buzzer && log.q >= 4 && goAhead
          ? 3
          : (goAhead || ties) && log.q >= 4 && clock <= 24
            ? 3
            : buzzer || ((goAhead || ties) && (late || clutchNow))
              ? 2
              : andOne ||
                  fam === 'oop' ||
                  breakaway ||
                  (v === 3 && (threes[pid] ?? 0) >= 3) ||
                  MARKS.some((m) => m >= 30 && was < m && pts[pid] >= m) ||
                  (fam === 'dunk' && log.kind === 'transition')
                ? 1
                : 0;
      const vars = {
        P: N(pid),
        A: s.pid2 !== undefined ? N(s.pid2) : '',
        F: fouler,
        D: s.d ?? (v === 3 ? 'three' : 'jumper'),
        FT: feet(s),
        AFT: `${[8, 11, 18].includes(feet(s)) ? 'an' : 'a'} ${feet(s)}`,
        T: team,
        SC: scoreText(score),
        N: score[0],
        S: breakaway && t.stole ? N(t.stole.pid) : '',
      };
      let body: string;
      if (andOne && (fam === 'dunk' || fam === 'oop')) body = pick(POSTER, ...k('poster'));
      else if (andOne) body = pick(AND_ONE, ...k('and1'));
      else if (breakaway && t.stole?.pid === pid) body = pick(BREAKAWAY, ...k('break'));
      else if (fam === 'oop' && s.pid2 === undefined) body = '{P} finishes the alley-oop';
      else {
        const big = tier >= 1 ? MAKE_BIG[fam] : undefined;
        // (a long three earns the louder call; a jumper from a foot away doesn't say "from 1")
        const bank = big ?? (fam === 'jumper' && vars.FT < 8 ? ['{P} hits the {D}', '{P} knocks down the {D}'] : MAKE[fam]);
        body = pick(bank, ...k('make'));
      }
      // one thing more, the most important
      const mark = MARKS.find((m) => was < m && pts[pid] >= m);
      const extra =
        buzzer && log.q < 4
          ? `at the ${log.q === 2 ? 'half' : 'buzzer'}`
          : goAhead && (late || clutchNow || log.q >= 4)
            ? pick(GO_AHEAD, ...k('ahead'))
            : ties && log.q >= 4
              ? pick(TIE, ...k('tie'))
              : (threes[pid] ?? 0) >= 3 && v === 3
                ? pick(STREAK3, ...k('s3')).replace('{N}', String(threes[pid]))
                : mark
                  ? pick(PTS, ...k('pts')).replace('{N}', String(pts[pid]))
                  : (made[pid] ?? 0) >= 3 && (made[pid] ?? 0) % 2 === 1
                    ? pick(STREAK, ...k('st')).replace('{N}', String(made[pid]))
                    : '';
      // the assist, unless the call already named him (an alley-oop): in brackets when more follows it
      const plain = andOne || !!extra;
      const assist = s.pid2 !== undefined && fam !== 'oop' && !(breakaway && t.stole?.pid === pid) ? (plain ? ' ({A} assist)' : pick(ASSIST, ...k('ast'))) : '';
      const main = fill(body + assist, vars);
      const tail = extra ? fill(extra, vars) : '';
      const bang = tier >= 2 ? '!' : '.';
      const text = `${cap1(main)}${tail ? `, ${tail}` : ''}${bang}`;
      // (the court says "and one" on the foul itself: the caption doesn't say it twice)
      const capBody = andOne ? fill(MAKE[fam === 'oop' ? 'dunk' : fam][0] + assist, vars) : main;
      out[i] = { text, cap: `${cap1(capBody)}${tail ? `, ${tail}` : ''}${bang}`, tier };
    } else if (s.k === 'block' && s.pid !== undefined) {
      const shot = log.steps[i - 1];
      blk[s.pid] = (blk[s.pid] ?? 0) + 1;
      const n = blk[s.pid];
      const late = isClutch(log.q, log.clockEnd, score[0] - score[1]);
      const vars = { B: N(s.pid), P: s.pid2 !== undefined ? N(s.pid2) : 'him', D: shot?.d ?? 'shot' };
      const body = fill(pick(BLOCK, ...k('blk')), vars);
      const text = `${cap1(body)}${n >= 3 ? `, his ${ordinal(n)} block tonight` : ''}${late || n >= 3 ? '!' : '.'}`;
      out[i] = { text, cap: text, tier: late || n >= 3 ? 1 : 0 };
    } else if (s.k === 'steal' && s.pid2 !== undefined) {
      const vars = { S: N(s.pid2), P: s.pid !== undefined ? N(s.pid) : 'him' };
      const text = `${cap1(fill(pick(STEAL, ...k('stl')), vars))}.`;
      out[i] = { text, cap: text, tier: 0 };
    } else if (s.k === 'ft') score[off] += s.v ?? 0;
  }
  return out;
}

const cap1 = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ------------------------------------------------------------------ the fold

/**
 * One more possession: the game after it, what it said (runs, leads, ties, clutch time, timeouts after
 * a run, big plays, the crowd) and its calls. Deterministic: the same logs give the same night.
 */
export function advance(t: Tally, log: PossLog, ctx: AtmoCtx): { t: Tally; events: AtmoEvent[]; voice: LogVoice } {
  const voice = voiceLog(t, log, ctx);
  const n: Tally = {
    ...t,
    n: t.n + 1,
    q: log.q,
    at: gameSec(log.q, log.clockEnd),
    plays: t.plays.slice(-59),
    periods: { ...t.periods },
    led: [...t.led],
    big: [...t.big],
    back: [...t.back],
    pts: { ...t.pts },
    qpts: log.q !== t.q ? {} : { ...t.qpts },
    made: { ...t.made },
    threes: { ...t.threes },
    blk: { ...t.blk },
    runs: { ...t.runs },
    clutchQ: t.clutchQ,
    buzzers: t.buzzers,
    stole: undefined,
  };
  const events: AtmoEvent[] = [];
  const at = n.at;
  const off = log.off;
  const def = (1 - off) as 0 | 1;
  const ev = (e: Omit<AtmoEvent, 'at' | 'q' | 'clock'>) => events.push({ ...e, at, q: log.q, clock: log.clockEnd });
  const T = ctx.teams;
  const N = ctx.name;
  const k = (salt: string) => [ctx.gid, t.n, salt];

  // the score as the steps run (the log's own score is the truth at its end: a technical free throw has no step)
  const stepPts = log.steps.reduce((x, s) => x + shotPts(s), 0);
  const score: [number, number] = [...log.score];
  score[off] -= stepPts;
  const runBefore = currentRun(t.plays, def);
  // the last change of who leads in the possession: to whom, and the basket (or free throw) that did it
  let leadEv: { side: 0 | 1 | null; pid: number; ft: boolean } | null = null;
  let leader = t.leader;
  let lastLed = t.lastLed;
  let changed = false;
  let lastShot: PossStep | undefined;
  for (let i = 0; i < log.steps.length; i++) {
    const s = log.steps[i];
    const pts = shotPts(s);
    if (s.k === 'shot' && s.pid !== undefined) {
      lastShot = s;
      if (s.made) {
        n.made[s.pid] = (n.made[s.pid] ?? 0) + 1;
        if (s.v === 3) n.threes[s.pid] = (n.threes[s.pid] ?? 0) + 1;
      } else {
        n.made[s.pid] = 0;
        if (s.v === 3) n.threes[s.pid] = 0;
      }
    }
    if (s.k === 'block' && s.pid !== undefined) n.blk[s.pid] = (n.blk[s.pid] ?? 0) + 1;
    if (s.k === 'steal' && s.pid2 !== undefined) n.stole = { pid: s.pid2, side: def };
    if (!pts || s.pid === undefined) continue;
    score[off] += pts;
    n.pts[s.pid] = (n.pts[s.pid] ?? 0) + pts;
    n.qpts[s.pid] = (n.qpts[s.pid] ?? 0) + pts;
    n.plays.push({ s: off, p: pts, t: at, q: log.q });
    const per = (n.periods[log.q] ??= [0, 0]);
    n.periods[log.q] = off === 0 ? [per[0] + pts, per[1]] : [per[0], per[1] + pts];
    const now: 0 | 1 | null = score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : null;
    if (now !== leader) {
      if (now === null) n.ties++;
      else if (lastLed !== null && lastLed !== now) {
        n.leadChanges++;
        changed = true;
      }
      // (a tie, or a lead taken: the last one in the possession is the one it's called by)
      if (now === null || lastLed !== now) leadEv = { side: now, pid: s.pid, ft: s.k === 'ft' };
      leader = now;
      if (now !== null) lastLed = now;
    }
    for (const sd of [0, 1] as const) n.big[sd] = Math.max(n.big[sd], score[sd] - score[1 - sd]);
  }
  n.score = [...log.score];
  n.leader = log.score[0] > log.score[1] ? 0 : log.score[1] > log.score[0] ? 1 : null;
  n.lastLed = n.leader ?? lastLed;
  const margin = n.score[0] - n.score[1];

  // a timeout called into the other side's run: the bench had seen enough
  const to = log.steps.find((s) => s.k === 'timeout' && s.t !== undefined);
  if (to && to.t !== undefined) {
    const runner = (1 - to.t) as 0 | 1;
    const r = to.t === off ? runBefore : currentRun(t.plays, runner);
    if (r && r.side === runner && r.a - r.b >= RUN_MIN) {
      const home = runner === 0 && ctx.arena;
      ev({
        id: `to-${t.n}`,
        kind: 'timeout',
        side: to.t,
        // (yours is your own call: the play-by-play has it)
        weight: to.t === ctx.user ? 1 : 2,
        pri: 40,
        kicker: 'Timeout',
        title: `${T[to.t]} call timeout`,
        line: `${cap1(teamPoss(T[runner]))} ${r.a}-${r.b} run${home ? `: ${arenaShort(ctx.arena)} is on its feet` : ''}`,
      });
    }
  }

  // a buzzer-beater
  if (lastShot?.made && lastShot.pid !== undefined && log.clockEnd <= 0.05) {
    n.buzzers = { ...t.buzzers, [log.q]: lastShot.pid };
    if (!(log.q >= 4 && margin !== 0))
      ev({
        id: `buzz-${log.q}`,
        kind: 'play',
        side: off,
        weight: 2,
        pri: 70,
        kicker: 'At the buzzer',
        title: `${N(lastShot.pid)} beats the ${log.q === 2 ? 'halftime ' : ''}buzzer`,
        line: margin === 0 ? `Tied at ${n.score[0]}` : `${T[margin > 0 ? 0 : 1]} lead ${scoreText(n.score)}`,
      });
  }

  // the lead: the go-ahead late, a comeback, a first lead, a change, a tie
  if (leadEv) {
    const side = leadEv.side;
    const clutchy = log.q >= 4 && log.clockEnd <= 120;
    const who = `${N(leadEv.pid)}${leadEv.ft ? ' at the line' : ''}`;
    if (side !== null) {
      const first = !t.led[side] && log.q >= 2;
      const down = t.big[(1 - side) as 0 | 1];
      const comeback = down >= 12 && !n.back[side];
      if (comeback) n.back[side] = true;
      if (clutchy)
        ev({
          id: `ahead-${t.n}`,
          kind: 'lead',
          side,
          weight: log.clockEnd <= 24 ? 3 : 2,
          pri: 90,
          kicker: 'Go-ahead',
          title: `${who} puts the ${T[side]} in front`,
          line: `${scoreText(n.score)}, ${fmtClock(log.clockEnd)} left`,
        });
      else if (comeback)
        ev({
          id: `back-${side}`,
          kind: 'comeback',
          side,
          weight: 2,
          pri: 60,
          kicker: 'Comeback',
          title: `The ${T[side]} have wiped out a ${down}-point deficit`,
          line: `${T[side]} lead ${scoreText(n.score)}`,
        });
      else if (first)
        ev({ id: `first-${side}`, kind: 'lead', side, weight: 2, pri: 50, kicker: 'Lead change', title: `${T[side]} lead for the first time tonight`, line: scoreText(n.score) });
      else if (changed)
        ev({
          id: `lead-${t.n}`,
          kind: 'lead',
          side,
          weight: log.q >= 4 && log.clockEnd <= 360 && Math.abs(margin) <= 5 ? 2 : 1,
          pri: 45,
          kicker: 'Lead change',
          title: `${T[side]} ${t.led[side] ? 'back in front' : 'take the lead'}, ${scoreText(n.score)}`,
          line: n.leadChanges >= 2 ? `The ${ordinal(n.leadChanges)} lead change of the night` : undefined,
        });
      n.led[side] = true;
    } else if (log.q >= 4 || t.big[0] >= 12 || t.big[1] >= 12) {
      // a tie late, or a big deficit wiped out
      const back = ([0, 1] as const).find((sd) => t.big[1 - sd] >= 12 && !n.back[sd]);
      if (back !== undefined) n.back[back] = true;
      ev({
        id: `tie-${t.n}`,
        kind: back !== undefined ? 'comeback' : 'tie',
        side: back ?? off,
        weight: clutchy || back !== undefined ? 2 : 1,
        pri: back !== undefined ? 60 : 80,
        kicker: back !== undefined ? 'Comeback' : 'Tied',
        title: back !== undefined ? `The ${T[back]} have erased a ${t.big[1 - back]}-point deficit` : `Tied at ${n.score[0]}`,
        line: back !== undefined ? `Tied at ${n.score[0]}` : clutchy ? `${who} ties it with ${fmtClock(log.clockEnd)} left` : undefined,
      });
    }
  }

  // the run the scoring side is on, called as it grows (8 in the play-by-play, 10 and 15 over the court)
  const run = currentRun(n.plays, off);
  if (run) {
    const key = `${run.side}-${run.from}`;
    const m = run.a - run.b;
    const prev = t.called?.key === key ? t.called.m : 0;
    const best = n.runs[log.q];
    if (!best || m > best.a - best.b) n.runs[log.q] = run;
    const step = [20, 15, 10, RUN_MIN].find((x) => m >= x && prev < x);
    if (step) {
      n.called = { key, m };
      const other = (1 - run.side) as 0 | 1;
      const lastOther = [...n.plays].reverse().find((p) => p.s === other);
      const dry = at - (lastOther?.t ?? 0);
      const home = run.side === 0 && ctx.arena;
      const road = run.side === 1 && ctx.arena;
      const lines = [
        ...(run.b === 0 && dry >= 120 ? [`The ${T[other]} haven't scored in ${fmtClock(dry)}`] : []),
        ...(home ? [`${arenaShort(ctx.arena)} is on its feet`, `${arenaShort(ctx.arena)} is rocking`] : []),
        ...(road ? [`A hush over ${ctx.arena}`, `${arenaShort(ctx.arena)} has gone quiet`] : []),
        `${T[run.side]} ${margin === 0 ? 'level' : margin > 0 === (run.side === 0) ? 'lead' : 'trail'} ${margin === 0 ? `at ${n.score[0]}` : scoreText(n.score)}`,
      ];
      ev({
        id: `run-${key}-${step}`,
        kind: 'run',
        side: run.side,
        weight: step >= 10 ? 2 : 1,
        pri: 55 + step,
        kicker: 'Run',
        title: `${T[run.side]} on ${runText(run)}`,
        line: run.b === 0 && dry >= 120 ? lines[0] : pick(lines, ...k('run')),
      });
    }
  }

  // a shooter heating up: three straight threes, or 15 in a quarter
  for (const s of log.steps) {
    if (s.k !== 'shot' || !s.made || s.pid === undefined) continue;
    const pid = s.pid;
    if (s.v === 3 && n.threes[pid] >= 3 && n.threes[pid] !== t.threes[pid] && (n.threes[pid] === 3 || n.threes[pid] === 5))
      ev({ id: `h3-${pid}-${t.n}`, kind: 'heat', side: off, weight: 2, pri: 50, kicker: 'Heating up', title: `${N(pid)} is on fire`, line: `${n.threes[pid]} straight threes` });
    if ((n.qpts[pid] ?? 0) >= 15 && (t.q !== log.q || (t.qpts[pid] ?? 0) < 15))
      ev({
        id: `hq-${pid}-${log.q}`,
        kind: 'heat',
        side: off,
        weight: 2,
        pri: 48,
        kicker: 'Heating up',
        title: `${N(pid)} has ${n.qpts[pid]} in ${periodThe(log.q)}`,
        line: `${n.pts[pid]} on the night`,
      });
  }

  // the big plays: an alley-oop, a poster, a breakaway off a steal, a block late or a shot-blocker's third
  for (let i = 0; i < log.steps.length; i++) {
    const s = log.steps[i];
    const c = voice[i];
    if (!c || s.pid === undefined) continue;
    if (s.k === 'shot') {
      const nx = log.steps[i + 1];
      const andOne = nx?.k === 'foul' && nx.pid !== undefined;
      const fam = family(s);
      if (fam === 'oop' && s.pid2 !== undefined)
        ev({
          id: `oop-${t.n}`,
          kind: 'play',
          side: off,
          weight: 2,
          pri: 35,
          kicker: 'Alley-oop',
          title: `${N(s.pid2)} to ${N(s.pid)}`,
          line: `${T[off]} ${scoreLine(n.score, off)}`,
        });
      else if (andOne && (fam === 'dunk' || fam === 'oop'))
        ev({
          id: `post-${t.n}`,
          kind: 'play',
          side: off,
          weight: 2,
          pri: 38,
          kicker: 'And one',
          title: `${N(s.pid)} dunks on ${N(nx.pid!)}`,
          line: `${T[off]} ${scoreLine(n.score, off)}`,
        });
      else if (andOne)
        ev({
          id: `and1-${t.n}`,
          kind: 'play',
          side: off,
          // (a plain and-one is a big play when it counts: late, or into a run)
          weight: c.tier >= 2 || (run && run.side === off && run.a - run.b >= RUN_MIN) ? 2 : 1,
          pri: 30,
          kicker: 'And one',
          title: `${N(s.pid)} through the contact`,
          line: `${T[off]} ${scoreLine(n.score, off)}`,
        });
      else if (log.kind === 'transition' && t.stole?.side === off && t.stole.pid === s.pid && i <= 2)
        ev({
          id: `brk-${t.n}`,
          kind: 'play',
          side: off,
          weight: 2,
          pri: 32,
          kicker: 'Steal and score',
          title: `${N(s.pid)} picks it off and finishes`,
          line: `${T[off]} ${scoreLine(n.score, off)}`,
        });
    } else if (s.k === 'block' && c.tier >= 1) {
      const bn = n.blk[s.pid] ?? 1;
      ev({
        id: `blk-${t.n}`,
        kind: 'play',
        side: def,
        weight: 2,
        pri: 34,
        kicker: 'Rejected',
        title: `${N(s.pid)} sends it back`,
        line: bn >= 3 ? `His ${ordinal(bn)} block tonight` : `${T[def]} ${scoreLine(n.score, def)}`,
      });
    }
  }

  // clutch time, once a period
  const clutchNow = isClutch(log.q, log.clockEnd, margin);
  n.clutch = clutchNow;
  if (clutchNow && !t.clutchQ.includes(log.q)) {
    n.clutchQ = [...t.clutchQ, log.q];
    const left = fmtClock(log.clockEnd);
    ev({
      id: `clutch-${log.q}`,
      kind: 'clutch',
      side: -1,
      weight: 2,
      pri: 85,
      kicker: 'Clutch time',
      title: margin === 0 ? `Tied at ${n.score[0]}, ${left} to play` : `${T[margin > 0 ? 0 : 1]} by ${Math.abs(margin)}, ${left} to play`,
      line: log.q >= 5 ? periodLabel(log.q) : undefined,
    });
  }

  // momentum: the points a trip lately, home minus away, decayed
  const diff = off === 0 ? n.score[0] - t.score[0] : -(n.score[1] - t.score[1]);
  n.mo = t.mo * 0.85 + diff * 0.15;
  n.momentum = clamp(n.mo / 1.4, -1, 1);

  // the crowd
  n.crowd = crowdAfter(t, log, ctx, run, clutchNow);
  const cl = crowdLine(t, n, ctx, at);
  const lv = crowdLevel(n.crowd);
  if (cl) {
    n.crowdAt = at;
    if (lv >= 4) n.roared = true;
    else n.hushed = true;
    events.push({ ...cl, q: log.q, clock: log.clockEnd });
  }
  // (the building settling lets it roar, or go quiet, again)
  if (lv <= 2) n.roared = false;
  if (lv >= 2) n.hushed = false;

  return { t: n, events, voice };
}

/** "lead 54-50", "trail 50-54", "level at 50". */
function scoreLine(sc: [number, number], side: 0 | 1): string {
  const m = sc[side] - sc[1 - side];
  return m === 0 ? `level at ${sc[0]}` : `${m > 0 ? 'lead' : 'trail'} ${sc[side]}-${sc[1 - side]}`;
}

/** The whole night so far: the tally after `logs`, every call by log index, and every event. */
export function foldAll(logs: readonly PossLog[], ctx: AtmoCtx, from: Tally = newTally(ctx)): { t: Tally; voices: LogVoice[]; events: AtmoEvent[][] } {
  let t = from;
  const voices: LogVoice[] = [];
  const events: AtmoEvent[][] = [];
  for (let i = from.n; i < logs.length; i++) {
    const r = advance(t, logs[i], ctx);
    t = r.t;
    voices[i] = r.voice;
    events[i] = r.events;
  }
  return { t, voices, events };
}

// ------------------------------------------------------------------ what goes over the court

/**
 * The callout to put up over the court for a possession's events, if any: the biggest, and only now
 * and then (one every `CALL_GAP` game seconds, less in clutch time; a big one whenever). `last` is
 * when the last one went up.
 */
export function pickCall(events: readonly AtmoEvent[], last: number | null): AtmoEvent | null {
  const top = events.filter((e) => e.weight >= 2 && e.kind !== 'crowd').sort((a, b) => b.weight - a.weight || b.pri - a.pri)[0];
  if (!top) return null;
  if (top.weight >= 3 || last === null) return top;
  const gap = top.q >= 4 && top.clock <= CLUTCH_CLOCK ? CALL_GAP_CLUTCH : CALL_GAP;
  return top.at - last >= gap ? top : null;
}

// ------------------------------------------------------------------ the breaks

/**
 * The story so far in one line, for a break: where the user's team stands, the run that made the
 * period (or the lead changes, or the period's score), and who's carrying them.
 * "Down 9 at the half after the Celtics' 16-4 second-quarter run; Brunson has 18."
 */
export function breakStory(t: Tally, ctx: AtmoCtx, q: number, scorers: [{ pid: number; pts: number }[], { pid: number; pts: number }[]]): string {
  const u = ctx.user;
  const o = (1 - u) as 0 | 1;
  const lead = t.score[u] - t.score[o];
  const key = [ctx.gid, q, 'story'];
  const when = q === 1 ? 'after one' : q === 2 ? 'at the half' : q === 3 ? 'after three' : q === 4 ? 'after regulation' : `after ${periodLabel(q)}`;
  const state =
    lead === 0
      ? `Tied at ${t.score[0]} ${when}`
      : lead > 0
        ? `${pick(['Up', 'Ahead by'], ...key, 's')} ${lead} ${when}`
        : `${pick(['Down', 'Trailing by'], ...key, 's')} ${-lead} ${when}`;
  const run = t.runs[q];
  const per = t.periods[q] ?? [0, 0];
  const pm = per[u] - per[o];
  let cause = '';
  if (run && run.a - run.b >= 10) {
    const mine = run.side === u;
    const what = `${run.a}-${run.b} ${periodAdj(q)} run`;
    // ("after one after a run" reads badly: after a quarter's "after", the run follows)
    const after = when.startsWith('after') ? 'following' : 'after';
    const an = run.a === 8 || run.a === 11 || run.a === 18 ? 'an' : 'a';
    if (mine) cause = lead >= 0 ? `${after} ${an} ${what}` : `despite ${an} ${what}`;
    else cause = lead <= 0 ? `${after} ${teamPoss(ctx.teams[o])} ${what}` : `despite ${teamPoss(ctx.teams[o])} ${what}`;
  } else if (t.leadChanges >= 6 && Math.abs(lead) <= 6) cause = `in a game with ${t.leadChanges} lead changes`;
  else if (Math.abs(pm) >= 6 && q <= 4) cause = pm > 0 ? `having taken ${periodThe(q)} ${per[u]}-${per[o]}` : `having lost ${periodThe(q)} ${per[o]}-${per[u]}`;
  else if (t.buzzers[q] !== undefined) cause = `with ${ctx.name(t.buzzers[q])}'s shot at the buzzer to end it`;
  const mine = scorers[u][0];
  const theirs = scorers[o][0];
  let star = '';
  if (theirs && theirs.pts >= 20 && (!mine || theirs.pts >= mine.pts + 6)) star = `${ctx.name(theirs.pid)} has ${theirs.pts} for the ${ctx.teams[o]}`;
  else if (mine && mine.pts >= 8) star = pick([`${ctx.name(mine.pid)} has ${mine.pts}`, `${ctx.name(mine.pid)} leads you with ${mine.pts}`], ...key, 'star');
  return `${state}${cause ? ` ${cause}` : ''}${star ? `; ${star}` : ''}.`;
}
