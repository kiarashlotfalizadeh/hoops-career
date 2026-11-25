// The staff's debrief after one of the user's games, as the report's Summary reads it: the edges
// that decided it, what the coach's moves in a live game were worth, how his plan's counters went,
// and what to do next time: the one-tap counter for each edge that went against him while his
// tactics still give it (as a patch, for the plan against this opponent or for good).
// Pure: it reads the stored result and the report built from it.

import type { CoachMove, GameResult, League, Tactics, TacticsPatch } from '../types';
import { plural } from '../format';
import { playerName, shortName, teamCity } from '../league/helpers';
import { playTypeBaselines } from './playTypes';
import { buildGameReport, decidingFactors, type GameReport, type Factor } from './gameReport';
import { shrinkWorth, worthCall } from '../ai/counterWorth';
import { ptsFig } from './staffWords';
import { impactCounter } from '../ai/advisor';
import { applyPatch, cloneTactics, tacticsDiff, emptyPatch } from '../sim/tactics';
import { CALL_WORTH, callCosts, callKey, callWorth, worthLine } from './callWorth';
import { CHECK_AFTER } from '../ai/tacticEdits';

export interface DebriefAdvice {
  id: string;
  title: string;
  text: string;
  /** The change, relative to the tactics now: for the plan against this opponent, or for every game. */
  patch?: TacticsPatch;
  /** What the change is called ("Switch to Hedge"). */
  label?: string;
  /** Game-plan group: it replaces the plan's item in the same group. */
  group?: string;
  /**
   * The change measured as a gain where the bench calls it (callWorth.ts): the staff's opinion of it, in
   * a few words. Only a change with one is offered for every game. For the plan against this opponent it's
   * offered only as a staff counter measured a gain against them (see sameChange): else it's the
   * staff's read, with nothing to tap.
   */
  worth?: string;
}

/** The settings a patch moves from `base`: each one's path, and which way it moves (+1 or −1 for a number, the new value otherwise). */
function patchMoves(base: Tactics, patch: TacticsPatch): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const walk = (a: unknown, b: unknown, path: string) => {
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
      const x = a as Record<string, unknown>;
      const y = b as Record<string, unknown>;
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${path}.${k}`);
    } else if (JSON.stringify(a) !== JSON.stringify(b)) out.set(path, typeof a === 'number' && typeof b === 'number' ? Math.sign(b - a) : JSON.stringify(b));
  };
  walk(base, applyPatch(base, patch), '');
  return out;
}

/**
 * Whether a staff counter (`counter`, the matchup page's) makes the change a debrief's advice asks for
 * (`advice`), from tactics `base`: every setting the advice moves, moved the same way (a counter may
 * move more: "Hunt mismatches" with more isolations). The debrief offers a change for the plan only as
 * that counter, measured against the opponent.
 */
export function sameChange(base: Tactics, advice: TacticsPatch, counter: TacticsPatch): boolean {
  const a = patchMoves(base, advice);
  const c = patchMoves(base, counter);
  return a.size > 0 && [...a].every(([k, v]) => c.get(k) === v);
}

/**
 * A change the bench measured as a cost under any of its calls (the switches to Hedge off Drop): not
 * next time's fix either. A cost beyond its noise, as the live bench drops a call (callCosts): one
 * below even inside it ("Stay home" off hot spot-ups, −0.5 ± 0.47 on 14 calls) is too close to say,
 * and the live staff, measuring from the spot, found Stay home a gain (+0.74 true over 21 calls,
 * round-3 game-day review).
 */
const labelCosts = (label: string) => Object.keys(CALL_WORTH).some((k) => k.endsWith(`>${label}`) && callCosts(k));

/** How one counter of the game plan went (see planGrades). */
export interface PlanGrade {
  label: string;
  /** What it was aimed at tonight against coming in: "SAS post-ups 0.75 a trip on 8 trips, 1.10 coming in". */
  line: string;
  /** Its grade: what the staff measured it worth over many games when it went in (a gain, a cost, or even). */
  call: 'gain' | 'cost' | 'even';
  /** That measured worth in points a game, when it was kept with the plan. */
  pts?: number;
  /**
   * Tonight on what it was aimed at, against coming in: 'better' / 'worse' only for a night far
   * outside a single game's noise (PLAN_Z), 'same' otherwise, 'few' with too few trips to say.
   */
  night: 'better' | 'worse' | 'same' | 'few';
  /**
   * A counter measured a gain on a night that went against it (a standard error or more): the clause
   * that bridges the two, so a bad night doesn't read as the staff being wrong.
   */
  bridge?: string;
}

export interface Debrief {
  /** The biggest edges, at most three, biggest first. */
  decided: Factor[];
  /** The live game's moves: how many (whether they worked is the replayed night's to say: see nightLine). */
  moves: { count: number } | null;
  advice: DebriefAdvice[];
  /** The game plan's counters, each graded on what it was aimed at. */
  plan: PlanGrade[];
  /** Said on a coach's first games: one night's shooting is luck, a plan shows over a stretch. */
  frame?: string;
  /** His very first game (teaching on): the plan he went in with, how it came out, and one next step (see firstLesson). */
  lesson?: FirstLesson;
  /** His players hurt in the game, and for how long: "Davis, out 5 games · Sarr, out 3 games". */
  hurt?: string;
  /** The opponent, and whether the teams meet again this season (a plan against them would be played). */
  opp: number;
  meetAgain: boolean;
}

/** The first debrief as a lesson in deciding, not in finding screens: plan, outcome, next action. */
export interface FirstLesson {
  plan: string;
  outcome: string;
  next: string;
  /** Where the next step is done, when it's on another screen. */
  to?: string;
  toLabel?: string;
}

/**
 * The coach's first game told as a decision: what he went in with (his playbook, his own or the
 * staff's, and his plan against them), how it came out (the result and what decided it, luck named
 * as luck, the plan's counters against their target), and the one next step he can take now: the
 * staff's fix below when there is one, else a plan for the next opponent (the one he made is used up).
 * The playbook named is the one that game was played with (GameResult.setup), not today's.
 */
function firstLesson(league: League, res: GameResult, side: 0 | 1, decided: Factor[], plan: PlanGrade[], advice: DebriefAdvice[]): FirstLesson {
  // (the setup that night, as the result kept it: today's playbook isn't what he went in with)
  const used = res.setup;
  const oppTid = side === 0 ? res.away.tid : res.home.tid;
  const opp = teamCity(league, oppTid);
  const mine = side === 0 ? res.home.pts : res.away.pts;
  const theirs = side === 0 ? res.away.pts : res.home.pts;
  const book = used ? `${used.own ? 'your own' : "your staff's"} playbook (${used.playbook})` : 'your playbook';
  const planText = plan.length
    ? `You went in with ${book} and a plan against ${opp}: ${plan.map((g) => g.label).join(', ')}.`
    : `You went in with ${book} and no plan of your own against ${opp}.`;
  const top = decided[0];
  // (run on after the colon in lower case, unless it opens with a team: "Toronto's shots fell above their looks")
  const named = top ? league.teams.some((t) => top.title.startsWith(t.region)) : false;
  const what = top ? top.title.replace(/\.$/, '') : '';
  const why = top ? ` What decided it: ${named ? what : what.replace(/^./, (c) => c.toLowerCase())}${top.luck ? ', which was mostly shooting luck' : ''}.` : '';
  const showed = plan.filter((g) => g.night === 'better').map((g) => g.label);
  const missed = plan.filter((g) => g.night === 'worse').map((g) => g.label);
  const planNight = showed.length
    ? ` Your plan showed on ${showed.join(', ')}.`
    : missed.length
      ? ` It went against ${missed.join(', ')} tonight.`
      : plan.length
        ? ' One night is too few to grade your plan.'
        : '';
  const outcome = `${mine > theirs ? 'You won' : 'You lost'} ${Math.max(mine, theirs)}-${Math.min(mine, theirs)}.${why}${planNight}`;
  // (a fix the staff backs where the bench calls it has its one-tap button under Next time; one it has only
  // read doesn't, and may measure as a cost against this opponent: the lesson doesn't tell him to tap what isn't there)
  const fix = advice.find((a) => a.patch && a.label && a.worth) ?? advice.find((a) => a.patch && a.label);
  if (fix)
    return {
      plan: planText,
      outcome,
      next: fix.worth
        ? `Tap the staff's fix below, ${fix.label}, and apply it for every game. After ${CHECK_AFTER} games, Tactics → Season Analysis says whether it helped.`
        : `The staff's reads are under Next time, ${fix.label} first. One it has measured as a gain has a button there; the rest are its read of one night, yours to try in Team → Tactics. After ${CHECK_AFTER} games, Season Analysis says whether a change helped.`,
    };
  if (!plan.length)
    return {
      plan: planText,
      outcome,
      next: 'Pick one counter for your next opponent on its matchup page. The staff tells you after the game how it went.',
      to: '/preview',
      toLabel: 'Next opponent',
    };
  // (a plan against an opponent is for that game and is used up: nothing to "keep")
  return {
    plan: planText,
    outcome,
    next: `That plan was for ${opp} and is used up. Make one for your next opponent on its matchup page: a plan shows over several games.`,
    to: '/preview',
    toLabel: 'Next opponent',
  };
}

/**
 * The offense's answer to a defense's edge on you (an impact key won by their defense, 'x:d'), as
 * the report's advice names it: relative nudges, so it builds on whatever playbook you run. (Moving
 * the ball instead of running pick-and-roll into a hedge isn't one: in paired engine games it cost
 * the team that took it about half a point per 100 possessions.)
 */
const OFFENSE_FIXES: Record<string, { label: string; patch: TacticsPatch }> = {
  'drop_rim:d': { label: 'More handoffs against the drop', patch: { nudge: { actions: { handoff: 25, pnr: -10 } } } },
  'switch_deny:d': { label: 'Hunt mismatches', patch: { offense: { huntMismatch: true } } },
  'switch_screen:d': { label: 'Hunt mismatches', patch: { offense: { huntMismatch: true } } },
  'zone_paint:d': { label: 'More motion & cuts against the zone', patch: { nudge: { actions: { motion: 25, iso: -15 } } } },
  'help_paint:d': { label: 'More threes against their help', patch: { nudge: { offense: { threePoint: 20 } } } },
  'pressure_to:d': { label: 'Handoffs against their pressure', patch: { nudge: { actions: { handoff: 25, iso: -10 } } } },
};

/** What a tactical effect is about, so advice on the same thing isn't given twice (a factor's category). */
const IMPACT_TOPIC: Record<string, string> = {
  'crash_orb:o': 'rebounding',
  'zone_glass:o': 'rebounding',
  'shape_glass:o': 'rebounding',
  'shape_glass:d': 'rebounding',
  'role_poa:d': 'turnovers',
};

/** A four-factor edge's advice row, when its card is already up top: what to do, not the figures again. */
const DO_TITLE: Partial<Record<Factor['category'], string>> = {
  turnovers: 'Take care of the ball',
  rebounding: 'Win the glass',
  fouls: 'Stay off the line',
  shooting: 'Get better shots',
};

/**
 * What a side's looks were worth in points (GameResult.xShots): its attempts as they were taken, and
 * the shots a foul wiped out (an and-one's chance counts whether it fell or not).
 */
export function lookPts(res: GameResult, s: 0 | 1): number {
  const x = res.xShots?.[s];
  return x ? x.pts + (x.fouled ?? 0) : 0;
}

/** Points a side's shots fell above (or below) what its looks were worth. */
export function luckPts(res: GameResult, s: 0 | 1): number {
  const box = s === 0 ? res.home : res.away;
  return res.xShots?.[s] && box.t.fga ? box.t.fgm * 2 + box.t.tpm - lookPts(res, s) : 0;
}

/**
 * One game's net shooting luck as it runs night to night (points, one standard deviation), for a
 * result from before each game kept its own (XShots.sd). Every shot either falls or doesn't: two
 * teams' 88 attempts each stray about 11 points from their looks, 16 between them (luck-check, 1,500
 * games: 15.9). Until 2026-11-24 this read 7.5, so a third of all games were "past 2 SD" and an
 * ordinary +34 night was called a 1-in-900,856,495 one (playtest round 3).
 */
export const LUCK_SD = 16;

/**
 * A night's shooting luck for side `s` (its own less the other side's) in standard deviations of
 * what that game's shots could have come to: each shot's own chance, as the engine took it. Null
 * without the looks.
 */
export function luckZ(res: GameResult, s: 0 | 1): number | null {
  const x = res.xShots;
  if (!x) return null;
  const o = (1 - s) as 0 | 1;
  const sd = x[0].sd !== undefined && x[1].sd !== undefined ? Math.hypot(x[0].sd, x[1].sd) : LUCK_SD;
  return (luckPts(res, s) - luckPts(res, o)) / Math.max(1, sd);
}

/** Past this many standard deviations a night's luck is called rare, with how rare. */
const RARE_Z = 2;
/** The rarest a night is called: beyond it the count says nothing a reader can use. */
const RARE_MAX = 1000;

/**
 * "about a 1-in-20 shooting night": how rare a night's luck was, from RARE_Z standard deviations on
 * (else nothing): about one game in 22 gets a line. Past 1-in-1,000 it says "rarer than 1-in-1,000".
 */
export function luckRarity(res: GameResult, s: 0 | 1): string | null {
  const zs = luckZ(res, s);
  if (zs === null) return null;
  const z = Math.abs(zs);
  if (z < RARE_Z) return null;
  // two-sided normal tail (Abramowitz-Stegun's erfc)
  const t = 1 / (1 + 0.3275911 * (z / Math.SQRT2));
  const erfc = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-(z * z) / 2);
  const n = 1 / erfc;
  if (n > RARE_MAX) return `rarer than a 1-in-${RARE_MAX.toLocaleString('en-US')} shooting night`;
  const step = n >= 100 ? 50 : 5;
  return `about a 1-in-${(Math.round(n / step) * step).toLocaleString('en-US')} shooting night`;
}

/** Trips on what a counter was aimed at before tonight reads as anything (fewer: "too few to tell"). */
const PLAN_MIN_TRIPS = 4;
/** Trips coming in a team's own rate needs to be the baseline (fewer: the league's rate on those plays). */
const PLAN_MIN_BEFORE = 30;
/**
 * Standard errors a night has to move from coming in before the report says so: a counter worth a
 * point a game moves a night's rate by far less than one game's noise, so a single night is told
 * only when it's well outside it, and the grade is the counter's measured worth.
 */
const PLAN_Z = 3;
/** The coach's first games with teaching on: the report says what a single night can and can't show. */
const FRAME_GAMES = 5;

/** Points and trips on these play types in a box, and the same over the season's games before this one (theirs on offense, or against them). */
function typeTally(league: League, res: GameResult, tid: number, types: string[]) {
  const sum = (box: GameResult['home']) =>
    types.reduce((a, k) => ({ poss: a.poss + (box.playTypes?.[k]?.poss ?? 0), pts: a.pts + (box.playTypes?.[k]?.pts ?? 0) }), { poss: 0, pts: 0 });
  const box = res.home.tid === tid ? res.home : res.away;
  const before = { poss: 0, pts: 0 };
  for (const g of league.games) {
    if (g.season !== res.season || g.gid === res.gid || g.day > res.day) continue;
    const b = g.home.tid === tid ? g.home : g.away.tid === tid ? g.away : null;
    if (!b) continue;
    const t = sum(b);
    before.poss += t.poss;
    before.pts += t.pts;
  }
  return { night: sum(box), before };
}

/** Points a trip across the league this season (engine-typical before any games). */
function leaguePpp(league: League): number {
  let pts = 0;
  let poss = 0;
  for (const g of league.games)
    if (g.season === league.season)
      for (const b of [g.home, g.away]) {
        pts += b.pts;
        poss += b.poss;
      }
  return poss >= 2_000 ? pts / poss : 1.12;
}

/** What a play type set is called in a line ("post-ups", "pick-and-roll"). */
function typesLabel(types: string[]): string {
  if (types.includes('pnrBH')) return 'pick-and-roll';
  if (types.includes('transition')) return 'transition';
  if (types.includes('iso')) return 'isolations';
  if (types.includes('post')) return 'post-ups';
  if (types.includes('handoff')) return 'handoffs';
  if (types.includes('spotup')) return 'spot-ups';
  return 'cuts';
}

/**
 * The game plan's counters, each graded on its measured worth (what the staff's paired games made
 * of it when it went in: see counterWorth.ts), with tonight on what it was aimed at beside it: their
 * points a trip on those plays (ours, for a counter on offense) against their rate coming in (the
 * league's, early in the season), or their player's points against his average. A night reads as
 * going for or against it only when the gap is PLAN_Z standard errors (a trip's points spread about
 * 1.1 either way); a counter with no play of its own to measure is told on the whole end of the floor.
 */
export function planGrades(league: League, res: GameResult, side: 0 | 1): PlanGrade[] {
  const me = side === 0 ? res.home.tid : res.away.tid;
  const opp = side === 0 ? res.away.tid : res.home.tid;
  const abbrev = (tid: number) => league.teams[tid].abbrev;
  const base = playTypeBaselines(league);
  return (res.plan ?? []).map((u) => {
    const call = worthCall({ pts: u.pts ?? 0 });
    // (a bad night for a counter measured a gain: one clause says both are true)
    const graded = (x: { label: string; line: string; night: PlanGrade['night'] }, against = false): PlanGrade => ({
      ...x,
      call,
      ...(u.pts !== undefined && { pts: u.pts }),
      ...(against && call === 'gain' ? { bridge: 'A bad night for it. Over many games it should still help.' } : {}),
    });
    // one of theirs: his points tonight against his average coming in
    if (u.pid !== undefined) {
      const p = league.players[u.pid];
      const line = (side === 0 ? res.away : res.home).players.find((b) => b.pid === u.pid);
      const before = league.games
        .filter((g) => g.season === res.season && g.gid !== res.gid && g.day <= res.day)
        .flatMap((g) => [...g.home.players, ...g.away.players].filter((b) => b.pid === u.pid && b.min > 0));
      const avg = before.length ? before.reduce((a, b) => a + b.pts, 0) / before.length : null;
      const name = p ? playerName(p) : 'Their player';
      if (!line || line.min <= 0) return graded({ label: u.label, line: `${name} didn't play.`, night: 'few' });
      // (a scorer's night spreads about 7 points either way: told past PLAN_Z of it)
      const d = avg === null ? 0 : avg - line.pts;
      const night = avg === null || before.length < 3 ? 'few' : d > 7 * PLAN_Z ? 'better' : d < -7 * PLAN_Z ? 'worse' : 'same';
      return graded({ label: u.label, line: `${name} ${line.pts} points${avg !== null ? `, ${avg.toFixed(1)} a game coming in` : ''}.`, night }, night !== 'few' && d < -7);
    }
    // play types, or the whole end of the floor
    const off = u.end === 'off';
    const tid = off ? me : opp;
    const types = u.types?.length ? u.types : null;
    const all = Object.keys(base);
    const t = typeTally(league, res, tid, types ?? all);
    if (u.end === 'both' && !types) return graded({ label: u.label, line: 'It changes both ends: a stretch of games shows it, not a night.', night: 'few' });
    // (with too few trips of their own coming in: the league's rate on those plays)
    const lgRate = types ? types.reduce((a, k) => a + (base[k] ?? 1), 0) / types.length : leaguePpp(league);
    const wasRate = t.before.poss >= PLAN_MIN_BEFORE ? t.before.pts / t.before.poss : lgRate;
    const what = `${abbrev(tid)} ${types ? typesLabel(types) : 'offense'}`;
    if (t.night.poss < PLAN_MIN_TRIPS || wasRate === null)
      return graded({ label: u.label, line: `${what}: ${plural(t.night.poss, 'trip')} tonight, too few to tell.`, night: 'few' });
    const now = t.night.pts / t.night.poss;
    const wasTrips = t.before.poss >= PLAN_MIN_BEFORE ? t.before.poss : 200;
    const se = 1.1 * Math.sqrt(1 / t.night.poss + 1 / wasTrips);
    const d = (now - wasRate) * (off ? 1 : -1);
    const night = d > PLAN_Z * se ? 'better' : d < -PLAN_Z * se ? 'worse' : 'same';
    const was = t.before.poss >= PLAN_MIN_BEFORE ? `${wasRate.toFixed(2)} coming in` : `the league's ${wasRate.toFixed(2)}`;
    return graded({ label: u.label, line: `Tonight: ${what} ${now.toFixed(2)} a trip on ${plural(t.night.poss, 'trip')}, ${was}.`, night }, d < -se);
  });
}

/** A win by this many has no "next time": the advice is for nights that were in reach. */
const ROUT = 15;

/** "+2.1", "−0.4", "0.0": a reading in points with its sign (a true minus). */
const sgn1 = (x: number) => ptsFig(x, false);

/** Moves this late (the fourth quarter's or an overtime's last six minutes, crunch time) are judged by the win chance: a point of margin there isn't the question. */
const LATE_CLOCK = 360;

/**
 * What the night's moves were worth (GameResult.movesWorth, measured after the final by playing the
 * night back with them and without), as a figure: the points of margin they added, or the chance to
 * win for moves made only in crunch time (a late play call) and for a night whose win-chance reading
 * is clearer than its points, as the bench's late calls are judged (CallWorth.by 'win'): a call that
 * won the game moves the margin by a point or two and the result by much more. `detail`: the
 * reading's give or take, whether it's inside one night's noise, and the move that mattered most
 * when one clearly did. The tone is good or bad only clear of even (two standard errors). Null for a
 * game with none measured. `staff`: every move was the staff's (the bench handed to it).
 */
export function nightLine(res: GameResult, staff = false): { text: string; detail: string; tone: 'good' | 'bad' | 'dim' } | null {
  const w = res.movesWorth;
  if (!w || !Number.isFinite(w.pts) || !Number.isFinite(w.se)) return null;
  const moves = res.moves ?? [];
  // (one play called: the call)
  const call = moves.length === 1 && moves[0].kind === 'play';
  const who = staff ? (call ? "The staff's call" : "The staff's moves") : call ? 'Your call' : 'Your moves';
  const top = w.top && typeof w.top.text === 'string' ? ` Mattered most: ${w.top.text} (${ptsFig(w.top.pts)}).` : '';
  const line = (fig: string, spread: string, clear: boolean, up: boolean): { text: string; detail: string; tone: 'good' | 'bad' | 'dim' } => ({
    text: `${who}: ${fig}`,
    detail: `Give or take ${spread}${clear ? '' : ", inside one night's noise"}.${top}`,
    tone: !clear ? 'dim' : up ? 'good' : 'bad',
  });
  // by the win chance: late moves, or a reading clearer in it than in points (a reading from before its noise was kept is read by the points)
  const winSe = w.winSe;
  if (winSe !== undefined && Number.isFinite(winSe) && winSe > 0 && Number.isFinite(w.win)) {
    const late = moves.length > 0 && moves.every((m) => m.q >= 4 && m.clock < LATE_CLOCK);
    const zWin = Math.abs(w.win) / winSe;
    const clearWin = zWin >= 2 && Math.round(w.win * 100) !== 0;
    if (late || (clearWin && zWin > Math.abs(w.raw) / Math.max(w.se, 1e-9))) {
      const pc = Math.round(w.win * 100);
      return line(`${pc > 0 ? '+' : pc < 0 ? '−' : ''}${Math.abs(pc)}% to win`, `${Math.max(1, Math.round(winSe * 100))}%`, clearWin, w.win > 0);
    }
  }
  return line(ptsFig(w.pts), `${Math.max(0.1, w.se).toFixed(1)}`, Math.abs(w.raw) >= 2 * w.se && Math.abs(w.pts) >= 0.05, w.pts > 0);
}

/** A move's kind in the plural, for the readings by kind. */
const KIND_WORD: Record<CoachMove['kind'], [string, string]> = {
  timeout: ['timeout', 'timeouts'],
  sub: ['sub', 'subs'],
  tactics: ['tactical change', 'tactical changes'],
  play: ['play call', 'play calls'],
};
const kindWord = (kind: CoachMove['kind'], n: number) => `${n} ${KIND_WORD[kind][n === 1 ? 0 : 1]}`;

/** A reading of what a move (or a kind of move) was worth, as it's said: the figure, its give or take, and whether it's clear of the night's noise. */
export interface MoveWorthRead {
  /** "+0.4 pts": shrunk toward even by its noise, as every measured figure is. */
  fig: string;
  /** "±0.9". */
  pm: string;
  clear: boolean;
  up: boolean;
}

const readOf = (raw: number, se: number): MoveWorthRead => {
  const pts = Math.round(shrinkWorth(raw, se) * 10) / 10;
  return { fig: ptsFig(pts), pm: `±${Math.max(0.1, se).toFixed(1)}`, clear: Math.abs(raw) >= 2 * se && Math.abs(pts) >= 0.05, up: raw > 0 };
};

/**
 * What move `i` of the night (its place in GameResult.moves) was worth on its own: the night replayed
 * without just it against the night as coached (MovesWorth.each). Undefined for a move that wasn't
 * measured one by one (an older reading, or a move before the night's last few).
 */
export function moveWorthRead(res: GameResult, i: number): MoveWorthRead | undefined {
  const x = res.movesWorth?.each?.find((e) => e.move === i);
  return x && Number.isFinite(x.raw) && Number.isFinite(x.se) ? readOf(x.raw, x.se) : undefined;
}

/** "Replayed without it: +0.4 pts ±0.9, inside the noise." */
export const moveWorthText = (r: MoveWorthRead) => `Replayed without it: ${r.fig} ${r.pm}${r.clear ? '' : ', inside the noise'}.`;

/**
 * The night's moves by kind, each kind's share of the replayed night as measured: "3 timeouts −0.2 pts
 * ±0.7 · 5 subs +0.6 pts ±0.8 = +0.4 as measured". The shares add up to the night's reading before
 * it's shrunk toward even (a reading from before 2026-11-24 left each kind alone out, and has no sum).
 * Null for a night of one kind (the night's own figure is that kind's) or one measured before the
 * kinds were kept.
 */
export function nightKindsLine(res: GameResult): string | null {
  const w = res.movesWorth;
  const ks = (w?.kinds ?? []).filter((k) => Number.isFinite(k.raw) && Number.isFinite(k.se));
  if (!w || ks.length < 2) return null;
  const parts = ks.map((k) => `${kindWord(k.kind, k.moves)} ${sgn1(k.raw)} pts ±${Math.max(0.1, k.se).toFixed(1)}`).join(' · ');
  return w.shared ? `${parts} = ${sgn1(w.raw)} as measured` : parts;
}

/** A season's live coaching by kind of move: the points as measured, their standard error, the moves and the games they were in. */
export interface KindSum {
  kind: CoachMove['kind'];
  raw: number;
  se: number;
  moves: number;
  games: number;
}

/**
 * The coach's live coaching over a season, as measured game by game (GameResult.movesWorth): the
 * points his moves added (`raw`, as measured; `pts`, each night shrunk toward even first), the standard
 * error of that sum, the wins they added (each night's change in the chance to win, summed) and the
 * games it's over; and the same by kind of move (`kinds`), which add up to `raw` less `unsplit`: the
 * nights measured before the kinds were shares of the night (`unsplitGames` of them, MovesWorth.shared).
 * Null before a coached game was measured. The line reads where a coach's record is (Career: see
 * seasonCoachingLine).
 */
export function seasonCoaching(
  league: League,
  season = league.season,
  tid = league.userTid,
): { pts: number; raw: number; se: number; games: number; wins: number; winsSe: number; kinds: KindSum[]; unsplit: number; unsplitGames: number } | null {
  let pts = 0;
  let raw = 0;
  let v = 0;
  let games = 0;
  let wins = 0;
  let wv = 0;
  let unsplit = 0;
  let unsplitGames = 0;
  const kinds = new Map<CoachMove['kind'], { raw: number; v: number; moves: number; games: number }>();
  for (const g of league.games) {
    const w = g.movesWorth;
    if (g.season !== season || (g.home.tid !== tid && g.away.tid !== tid) || !w || !Number.isFinite(w.pts) || !Number.isFinite(w.raw) || !Number.isFinite(w.se)) continue;
    // (a night the staff ran is its coaching, not his)
    if (g.moves?.length && g.moves.every((m) => m.by === 'staff')) continue;
    pts += w.pts;
    raw += w.raw;
    v += w.se ** 2;
    games++;
    if (Number.isFinite(w.win)) wins += w.win;
    if (w.winSe !== undefined && Number.isFinite(w.winSe)) wv += w.winSe ** 2;
    // the night by kind, when its kinds add up to it: shares of the night, or a night of one kind
    const ks = (w.kinds ?? []).filter((k) => Number.isFinite(k.raw) && Number.isFinite(k.se));
    if (!ks.length || (!w.shared && ks.length > 1)) {
      unsplit += w.raw;
      unsplitGames++;
      continue;
    }
    for (const k of ks) {
      const cur = kinds.get(k.kind) ?? { raw: 0, v: 0, moves: 0, games: 0 };
      kinds.set(k.kind, { raw: cur.raw + k.raw, v: cur.v + k.se ** 2, moves: cur.moves + k.moves, games: cur.games + 1 });
    }
  }
  const r1 = (x: number) => Math.round(x * 10) / 10;
  if (!games) return null;
  return {
    pts: r1(pts),
    raw: r1(raw),
    se: r1(Math.sqrt(v)),
    games,
    wins: r1(wins),
    winsSe: r1(Math.sqrt(wv)),
    kinds: [...kinds].map(([kind, k]) => ({ kind, raw: r1(k.raw), se: r1(Math.sqrt(k.v)), moves: k.moves, games: k.games })),
    unsplit: r1(unsplit),
    unsplitGames,
  };
}

/**
 * "Your live coaching this season: +4.2 pts ±1.1, over 9 games": the season's sum as measured game by
 * game, with its standard error. Null with fewer than two games measured (one is the night's own line).
 */
export function seasonCoachingLine(league: League, season = league.season, tid = league.userTid): string | null {
  const c = seasonCoachingRead(league, season, tid);
  if (!c) return null;
  return `Your live coaching this season: ${c.worth} pts ${c.pm}, over ${plural(c.games, 'game')}`;
}

/** Moves of a kind in a season before the staff will say there's nothing in them. */
export const KIND_SAY_MOVES = 15;

/**
 * The season's live coaching as the line reads it, in parts (Career's record row, the report and
 * Season Analysis): its worth ("+4.2"), whether it's clear of even, its ± and the games; the same in
 * wins ("+0.3"); the verdict in a sentence, which says so when there's nothing to see yet; and a line
 * for each kind of move, with the plain word on one that has had enough tries (KIND_SAY_MOVES) to
 * show something and hasn't. The worth is the sum as measured, and the kinds are shares of the same
 * replays, so the rows add up to it (`sums` says so; `rest` is the nights measured before they did).
 * Null under two games.
 */
export function seasonCoachingRead(
  league: League,
  season = league.season,
  tid = league.userTid,
): {
  worth: string;
  clear: boolean;
  pm: string;
  games: number;
  wins: string;
  winsPm: string;
  verdict: string;
  kinds: { label: string; fig: string; note: string; tone: 'good' | 'bad' | 'dim' }[];
  /** How the rows relate to the total, in a sentence (absent with fewer than two rows). */
  sums?: string;
} | null {
  const c = seasonCoaching(league, season, tid);
  if (!c || c.games < 2) return null;
  const clear = Math.abs(c.raw) >= 2 * c.se && Math.abs(c.raw) >= 0.05;
  const wins = `${c.wins > 0.04 ? '+' : c.wins < -0.04 ? '−' : ''}${Math.abs(c.wins).toFixed(1)}`;
  const verdict = clear
    ? c.raw > 0
      ? `Your in-game moves have helped: about ${wins} wins over ${plural(c.games, 'game')} against the same nights replayed without them.`
      : `Your in-game moves have cost you: about ${wins} wins over ${plural(c.games, 'game')} against the same nights replayed without them.`
    : `No proof either way yet: over ${plural(c.games, 'game')} your in-game moves read ${sgn1(c.raw)} pts, inside the noise (±${Math.max(0.1, c.se).toFixed(1)}). The staff's bench would have done about as well.`;
  const kinds = c.kinds
    .filter((k) => k.moves > 0)
    .sort((a, b) => b.moves - a.moves)
    .map((k) => {
      const kClear = Math.abs(k.raw) >= 2 * k.se && Math.abs(k.raw) >= 0.05;
      const note = kClear
        ? k.raw > 0
          ? 'Helping.'
          : 'Costing you.'
        : k.moves >= KIND_SAY_MOVES
          ? k.kind === 'timeout'
            ? 'Nothing in them so far: a timeout rests legs and sets a play, it has not turned games.'
            : 'Nothing clear in them so far.'
          : 'Too few to say.';
      return {
        label: kindWord(k.kind, k.moves),
        fig: `${sgn1(k.raw)} pts ±${Math.max(0.1, k.se).toFixed(1)}`,
        note,
        tone: (kClear ? (k.raw > 0 ? 'good' : 'bad') : 'dim') as 'good' | 'bad' | 'dim',
      };
    });
  // (nights measured before the kinds were shares of the night: said as one row, so the rows still add up)
  if (c.unsplitGames && kinds.length)
    kinds.push({ label: `${plural(c.unsplitGames, 'earlier game')}`, fig: `${sgn1(c.unsplit)} pts`, note: 'Measured before the kinds were split.', tone: 'dim' });
  const sums =
    kinds.length > 1
      ? `The rows add up to the ${sgn1(c.raw)}: each kind's figure is its share of the same replays (what adding it to the night was worth, averaged over every order the kinds could go in).`
      : undefined;
  return { worth: sgn1(c.raw), clear, pm: `±${Math.max(0.1, c.se).toFixed(1)}`, games: c.games, wins, winsPm: `±${Math.max(0.1, c.winsSe).toFixed(1)}`, verdict, kinds, sums };
}

/**
 * The user's players hurt in a game (GameResult.hurt), each with the games he's out as things stand:
 * "Davis, out 5 games · Sarr, out 3 games", one back already "back now". Undefined: none, or an
 * older result that didn't keep them.
 */
export function hurtLine(league: League, res: GameResult): string | undefined {
  const parts = (res.hurt ?? []).flatMap((pid) => {
    const p = league.players[pid];
    if (!p) return [];
    return [`${shortName(league, p)}, ${p.injury ? `out ${plural(p.injury.gamesRemaining, 'game')}` : 'back now'}`];
  });
  return parts.length ? parts.join(' · ') : undefined;
}

/** The coach's games so far with his team this season (tonight's included). */
const gamesIn = (league: League, res: GameResult, me: number) =>
  league.games.filter((g) => g.season === res.season && g.day <= res.day && (g.home.tid === me || g.away.tid === me)).length;

export function debrief(league: League, res: GameResult, report: GameReport): Debrief {
  const me = league.userTid;
  const side: 0 | 1 = res.home.tid === me ? 0 : 1;
  const opp = side === 0 ? res.away.tid : res.home.tid;
  const tactics = league.teams[me].tactics;
  const advice: DebriefAdvice[] = [];
  const seen = new Set<string>();
  // what the advice so far is about, so the same fix isn't given twice in other words
  const topics = new Set<string>();
  const decided = decidingFactors(report.factors);
  // a standing cost the staff named after the last game too isn't said again every night (once it
  // adds up over the season, the staff's card on Tactics carries it), unless it's one of tonight's
  // deciding edges
  const prev = league.games.filter((g) => g.season === res.season && g.gid !== res.gid && g.day < res.day && (g.home.tid === me || g.away.tid === me)).pop();
  const prevRep = prev?.impacts ? buildGameReport(league, prev) : null;
  const saidLast = new Set((prevRep?.factors ?? []).filter((f) => f.key && f.pts <= -0.8).map((f) => f.key!));
  for (const f of report.factors) {
    if (f.pts > -0.8) continue;
    if (f.key && saidLast.has(f.key) && !decided.includes(f)) continue;
    const fix = f.key ? impactCounter(f.key, tactics) : undefined;
    const off = f.key ? OFFENSE_FIXES[f.key] : undefined;
    if (!fix && off && !seen.has(off.label) && !labelCosts(off.label)) {
      const patch = tacticsDiff(tactics, applyPatch(tactics, off.patch));
      if (!emptyPatch(patch)) {
        seen.add(off.label);
        topics.add(f.key!);
        advice.push({ id: `fix-${f.key}`, title: f.title.replace(/\.$/, ''), text: f.advice ?? f.detail, patch, label: off.label, group: `debrief-${off.label}` });
      }
      continue;
    }
    if (fix) {
      if (seen.has(fix.label)) continue;
      seen.add(fix.label);
      // (a counter that measured as a cost where the bench calls it, off this edge or another, isn't
      // next time's fix either: the switch to Hedge off a Drop their handlers pulled up over)
      const key = callKey(`imp-${f.key}`, fix.label);
      if (callCosts(key) || labelCosts(fix.label)) continue;
      const after = cloneTactics(tactics);
      fix.apply(after);
      const patch = tacticsDiff(tactics, after);
      if (emptyPatch(patch)) continue;
      topics.add((f.key && IMPACT_TOPIC[f.key]) || f.key!);
      const m = callWorth(key);
      const worth = m && m.pts >= 2 * m.ptsSe ? worthLine(key) : undefined;
      advice.push({
        id: `fix-${f.key}`,
        title: f.title.replace(/\.$/, ''),
        text: f.advice ?? f.detail,
        patch,
        label: fix.label,
        group: `debrief-${fix.label}`,
        ...(worth && { worth }),
      });
    } else if (f.advice && advice.length < 4) {
      const topic = (f.key && IMPACT_TOPIC[f.key]) || (f.key ? f.key : f.category);
      if (topics.has(topic)) continue;
      topics.add(topic);
      // (its card is up top: the row says what to do, not the figures again)
      const title = decided.includes(f) && !f.key ? (DO_TITLE[f.category] ?? f.title) : f.title;
      advice.push({ id: `adv-${f.title}`, title: title.replace(/\.$/, ''), text: f.advice });
    }
  }
  const moves = res.moves?.length ? { count: res.moves.length } : null;
  const meetAgain = league.schedule.some((g) => !g.played && g.day >= league.day && ((g.home === me && g.away === opp) || (g.away === me && g.home === opp)));
  // a win by 15 or more has no lesson in it: whatever cost a few points didn't decide anything
  const mine = side === 0 ? res.home.pts - res.away.pts : res.away.pts - res.home.pts;
  if (mine >= ROUT) advice.length = 0;
  const plan = planGrades(league, res, side);
  // a coach's first nights: what one game can and can't say, so "luck" doesn't read as "nothing you do matters"
  const first = league.settings.teaching !== false && league.season === league.startSeason && gamesIn(league, res, me) <= FRAME_GAMES;
  // (the luck half only on a night luck decided)
  const lucky = decided.some((f) => f.luck);
  const frame = first ? `${lucky ? "One night's shooting is luck. " : ''}A plan shows over a stretch of games, not one night.` : undefined;
  const hurt = hurtLine(league, res);
  const lesson = first && gamesIn(league, res, me) === 1 ? firstLesson(league, res, side, decided, plan, advice) : undefined;
  return { decided, moves, advice: advice.slice(0, 5), plan, frame, ...(lesson && { lesson }), ...(hurt && { hurt }), opp, meetAgain };
}
