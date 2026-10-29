// The staff's live voice: at a stop in play (a period's end, the middle of a period, a timeout of either
// side, a run of theirs, and in crunch time every dead ball: stopAfter) it drafts the few changes the
// game in front of it suggests and measures them
// from where the game stands (state/liveWorth.ts measureCalls: each played out from this spot, the best
// played again on fresh seeds), and proposes the best one only when that reading clears its noise, with
// its number. None clears: it says so in a line, and calls nothing. The drafts come from the game: the
// counter to what's hurting you (the bench's notes: their play type running hot, their tactical edge,
// their run), then the defense's big levers the way the game points (the scheme, the coverage on their
// ball screens, a double or your best defender on their hot scorer, the help, the pressure), one of
// theirs in foul trouble, the penalty, the mentality and the pace toward the score's need, a cold
// shooter given less rope; when you make the subs, the sub the bench would
// make; and in crunch time a timeout and fresh legs for your most tired player, whoever makes the subs
// (the staff plays through legs there: the measurement says when that's wrong). Pure.

import type { Tactics } from '../../core/types';
import type { GameSim } from '../../core/sim/engine';
import { cloneTactics, COVERAGE_META, MENTALITY_META, SCHEME_META } from '../../core/sim/tactics';
import { CALL_CONFIRM, CALL_CONFIRM_CRUNCH, CALL_CONFIRM_LATE, forkSim, type CallsMeasured, type LiveChoice } from '../../state/liveWorth';
import type { PossLog } from '../../core/sim/log';
import { tacticsDiff, crunchTime, foulLimit, DECIDED_WIN, LEVER_TRIPS } from './alerts';
import { crunchTime as coreCrunch, winProb } from '../../core/analysis/winProb';
import { GAME } from '../../core/constants';
import { staffNotes, type StaffInput, type StaffNote } from './staff';
import { signed } from '../stats';

/** Most changes measured at a stop (the brief's three to five: what the game suggests, the likeliest first). */
export const CALL_DRAFTS = 5;
/** In crunch time, with a timeout and a sub among them: a few minutes left cost little to play out. */
export const CALL_DRAFTS_CRUNCH = 7;
/** The middle of a period: its first trip under this many seconds is a stop the staff measures from (the broadcast's timeout). */
export const MID_STOP_SEC = 360;
/** Trips a change the coach turned down is left alone before the staff measures it again. */
export const DECLINED_TRIPS = 40;

/** A change the staff drafts at a stop: what it is, why, and the move as the game makes it. */
export interface CallDraft {
  id: string;
  /** The change, as its button says it: "Go to Drop", "Pack the paint", "Timeout". */
  label: string;
  /** Why the staff looked at it, in a few words: "Their P&R ball handler plays are hot". */
  why: string;
  /** The move, as plain data (what the measurement plays). */
  choice: LiveChoice;
  /** A tactics change: the change made to the tactics as they stand (what the screen applies). */
  apply?: (t: Tactics) => void;
}

/** The stops the staff has measured from tonight (useLiveGame keeps one): the run of theirs it last stopped for (where it started), the period whose end and whose middle it took. */
export interface StopSeen {
  run: number;
  q: number;
  mid: number;
}
export const noStops = (): StopSeen => ({ run: -1, q: 0, mid: 0 });

/** The ball is dead (a make, a foul, a ball out of bounds, a timeout): not a steal or a defensive board being run out, where only the side with it may stop play. */
export const deadBall = (sim: GameSim) => sim.mayCallTimeout((1 - sim.poss) as 0 | 1);

/**
 * Whether the game as `sim` stands after a possession is a stop the staff measures from, and how much
 * it weighs (0: none): 2 a period's end; 1 a timeout either side took (`timeouts`: each side's left
 * before the possession), a run of theirs reaching 8-0, the middle of a period (its first trip under
 * MID_STOP_SEC, where a broadcast takes its timeout), and in crunch time (the engine's: the last six
 * minutes of a game in reach) every dead ball, where a close finish is decided. Each period end,
 * middle and run is a stop once (`seen`, marked).
 */
export function stopAfter(sim: GameSim, side: 0 | 1, timeouts: readonly [number, number], seen: StopSeen): number {
  if (sim.over) return 0;
  if (sim.clock <= 0.05) {
    if (seen.q === sim.q) return 0;
    seen.q = sim.q;
    return 2;
  }
  const them = sim.T[1 - side];
  const run = them.run >= 8 && seen.run !== them.score - them.run;
  if (run) seen.run = them.score - them.run;
  const mid = sim.clock <= MID_STOP_SEC && seen.mid !== sim.q;
  if (mid) seen.mid = sim.q;
  const crunch = coreCrunch(sim.q, sim.clock, sim.T[0].score - sim.T[1].score) && deadBall(sim);
  return run || mid || crunch || sim.T[0].timeouts < timeouts[0] || sim.T[1].timeouts < timeouts[1] ? 1 : 0;
}

/**
 * The next stop the game comes to if nothing is changed, within `ahead` possessions (null: none so
 * soon): a copy of the game played on, each possession as the Live screen plays it (its steps up to one
 * with a log) and checked as stopAfter checks it. The engine draws each possession from the game's
 * seed and the possessions played, so the copy plays the very possessions the game will: the copy at
 * the stop is the game there, its possessions' logs with it.
 */
export function nextStop(sim: GameSim, side: 0 | 1, seen: StopSeen, ahead: number): { sim: GameSim; k: number; prio: number; logs: PossLog[]; timeouts: [number, number] } | null {
  if (sim.over) return null;
  const s = forkSim(sim);
  // (recorded, for the logs the staff's notes read)
  s.record = true;
  s.opts = { ...s.opts, record: true };
  const mine = { ...seen };
  const logs: PossLog[] = [];
  let k = 0;
  for (let n = 0; n < ahead && !s.over; n++) {
    const timeouts: [number, number] = [s.T[0].timeouts, s.T[1].timeouts];
    let got: PossLog[] = [];
    let guard = 0;
    while (!got.length && !s.over && guard++ < 5) {
      s.step();
      k++;
      got = s.drainLogs();
      logs.push(...got);
    }
    const prio = stopAfter(s, side, timeouts, mine);
    if (prio) return { sim: s, k, prio, logs, timeouts };
  }
  return null;
}

/**
 * Who the staff would send in for player `pid` of `side`: a rested bench player, the same size if
 * possible, and never one in foul trouble (at the staff's limit for the period, the next one's at a
 * break): sending him in only brings the next sub, or a foul-out.
 */
export function benchFor(sim: GameSim, side: 0 | 1, pid: number): number | undefined {
  const t = sim.T[side];
  const out = t.byId.get(pid);
  const limit = foulLimit(sim.atBuzzer() ? sim.q + 1 : sim.q, t.t.manage.foulTrouble);
  const score = (p: (typeof t.players)[number]) => (p.big === out?.big ? 100 : 0) + p.c.create + p.c.helpD + p.energy * 40;
  return t.players.filter((p) => !p.on && p.out === 0 && p.energy > 0.75 && p.fouls < limit).sort((a, b) => score(b) - score(a))[0]?.pid;
}

/** Why the staff measures nothing now, if it doesn't: the game is decided, or the period's last seconds. */
export function callQuiet(sim: GameSim, edge: number): 'decided' | 'late' | 'over' | null {
  if (sim.over) return 'over';
  const p = winProb({ margin: sim.T[0].score - sim.T[1].score, q: sim.q, clock: sim.clock, ball: null, edge });
  if (p > DECIDED_WIN || p < 1 - DECIDED_WIN) return 'decided';
  // (at a period's buzzer the next period is in front of it: the break is the best stop of all)
  if (sim.clock > 0.05 && sim.clock <= GAME.shotClock) return 'late';
  return null;
}

/** What the staff's call is judged by: late in a close game the result (a point of margin isn't the question), else the margin. */
export const callBy = (v: StaffInput['view']): 'pts' | 'win' => (crunchTime(v) ? 'win' : 'pts');

/** Continuations the best change is confirmed on: more when only a few minutes are left (each costs little then), most in crunch time (judged by the result). */
export const confirmGames = (v: Pick<StaffInput['view'], 'q' | 'clock' | 'sides'>) =>
  crunchTime(v) ? CALL_CONFIRM_CRUNCH : v.q >= 4 && v.clock <= 360 ? CALL_CONFIRM_LATE : CALL_CONFIRM;

/**
 * The changes the staff measures now, the likeliest first, at most CALL_DRAFTS (the order above: the
 * bench's own calls, then the levers that move a game most). None that changes a setting changed fewer
 * than LEVER_TRIPS trips ago, none the coach turned down lately (`skip`), none that changes nothing.
 */
export function callDrafts(input: StaffInput, sim: GameSim, skip: Set<string> = new Set()): CallDraft[] {
  const { view, side, tactics: t, names } = input;
  const out: CallDraft[] = [];
  const seen = new Set<string>([JSON.stringify(t)]);
  const recent = input.recent ?? {};
  const fresh = (x: Tactics) => !tacticsDiff(t, x).some((k) => (recent[k] ?? Infinity) < LEVER_TRIPS);
  const addTactics = (id: string, label: string, why: string, apply: (x: Tactics) => void) => {
    if (skip.has(id)) return;
    const x = cloneTactics(t);
    apply(x);
    const key = JSON.stringify(x);
    if (seen.has(key) || !fresh(x)) return;
    seen.add(key);
    out.push({ id, label, why, choice: { kind: 'tactics', tactics: x }, apply });
  };

  // the bench's calls on the game: each a place to look (the measurement says whether to make it)
  const notes: StaffNote[] = staffNotes(input).filter((n) => n.kind === 'decision' && !n.id.startsWith('late-'));
  for (const n of notes) {
    const a = n.actions[0];
    if (!a) continue;
    if (a.kind === 'tactics') addTactics(n.id, a.label, n.title, a.apply);
    else if (a.kind === 'timeout' && !input.atBreak && !skip.has(n.id)) out.push({ id: n.id, label: 'Timeout', why: n.title, choice: { kind: 'timeout' } });
    else if (a.kind === 'sub' && !skip.has(n.id)) out.push({ id: n.id, label: a.label, why: n.title, choice: { kind: 'sub', out: a.out, in: a.in } });
  }

  const me = view.sides[side];
  const them = view.sides[1 - side];
  const margin = me.score - them.score;
  const crunch = crunchTime(view);

  // crunch time: a timeout (legs back, their run stopped, the play after it), and fresh legs for your
  // most tired player, the staff's own line under which it would sit him anywhere else (it plays through
  // them now): whoever makes the subs, the measurement says whether either is worth it from here
  if (crunch) {
    const left = `${Math.floor(view.clock / 60)}:${String(Math.floor(view.clock % 60)).padStart(2, '0')} left`;
    const say = margin > 0 ? `Up ${margin}, ${left}` : margin < 0 ? `Down ${-margin}, ${left}` : `Level, ${left}`;
    if (me.timeouts > 0 && !input.atBreak && !input.timeoutPending && !skip.has('crunch-to') && !out.some((x) => x.choice.kind === 'timeout'))
      out.push({ id: 'crunch-to', label: 'Timeout', why: them.run >= 6 ? `${say}, ${them.run}-0 to them` : say, choice: { kind: 'timeout' } });
    const tired = me.on
      .map((pid) => me.players.find((p) => p.pid === pid))
      .filter((p) => !!p && p.out === 0 && p.energy < t.manage.fatigueSub)
      .sort((a, b) => a!.energy - b!.energy)[0];
    const fresh = tired && input.subFor(tired.pid);
    const id = tired ? `crunch-sub-${tired.pid}` : '';
    if (tired && fresh !== undefined && !skip.has(id) && !out.some((x) => x.choice.kind === 'sub'))
      out.push({
        id,
        label: `${names(fresh)} for ${names(tired.pid)}`,
        why: `${names(tired.pid)} at ${Math.round(tired.energy * 100)}% energy`,
        choice: { kind: 'sub', out: tired.pid, in: fresh },
      });
  }
  const ours = sim.T[side];
  const d = t.defense;
  const man = d.scheme === 'man';
  // (at a break the benches come back: their scorer counts whether he's on the floor now or not)
  const avail = (sd: typeof them, p: (typeof them.players)[number]) => p.out === 0 && (input.atBreak || sd.on.includes(p.pid));

  // The big levers first: over 54 quarter breaks (round/ten/live levers.mts, 2026-10-26) the defense's
  // structure is what moves the rest of a game (a change of scheme or of ball-screen coverage, the help,
  // the pressure, a double on their scorer: true worth spread ±0.7 to ±1.3 points), the mentality and the
  // pace hardly at all (±0 to ±0.4). Each is drafted the way the game in front of it points.
  const trips = Object.values(them.pt).reduce((a, v) => a + v.poss, 0);
  const tb = side === 0 ? view.box.away : view.box.home;
  const threesLine = `Their threes: ${tb.t.tpm} of ${tb.t.tpa}`;
  const scoring = `${them.score} points on ${trips} trips`;
  const paint = Object.entries(them.pt)
    .filter(([k]) => k === 'post' || k === 'cut' || k === 'pnrRoll')
    .reduce((a, [, v]) => ({ poss: a.poss + v.poss, pts: a.pts + v.pts }), { poss: 0, pts: 0 });

  // the scheme: out of a zone to man-to-man; out of man-to-man to the 2-3 zone (the 3-2 from the 2-3)
  if (!man) addTactics('man', 'Man-to-man', scoring, (x) => void (x.defense.scheme = 'man'));
  const zone = (['zone23', 'zone32'] as const).find((z) => z !== d.scheme);
  if (zone)
    addTactics(
      zone,
      SCHEME_META[zone].label,
      zone === 'zone32' ? threesLine : paint.poss ? `${paint.pts} points inside on ${paint.poss} trips` : scoring,
      (x) => void (x.defense.scheme = zone),
    );

  // their ball screens: the first of drop, hedge, switch, ice and blitz besides this one
  const pnr = (them.pt.pnrBH?.poss ?? 0) + (them.pt.pnrRoll?.poss ?? 0);
  const pnrPts = (them.pt.pnrBH?.pts ?? 0) + (them.pt.pnrRoll?.pts ?? 0);
  if (man && pnr >= 4) {
    const cov = (['drop', 'hedge', 'switch', 'ice', 'blitz'] as const).find((c) => c !== d.pnr);
    if (cov) addTactics(`cov-${cov}`, `${COVERAGE_META[cov].label} on ball screens`, `Their ball screens: ${pnrPts} points on ${pnr} trips`, (x) => void (x.defense.pnr = cov));
  }

  // their scorer on a big night: double him, or put your best defender on him
  const star = them.players.filter((p) => avail(them, p) && p.pts >= (view.q === 1 ? 8 : 12)).sort((a, b) => b.pts - a.pts)[0];
  if (star && man) {
    if (!(d.starPlan === 'double' && d.starTarget === star.pid))
      addTactics(`double-${star.pid}`, `Double ${names(star.pid)}`, `${names(star.pid)} has ${star.pts}`, (x) => {
        x.defense.starPlan = 'double';
        x.defense.starTarget = star.pid;
      });
    const onHim = ours.guardOf.get(star.pid)?.pid;
    const best = ours.players.filter((p) => p.out === 0 && (input.atBreak ? p.starter : p.on)).sort((a, b) => b.c.perDef - a.c.perDef)[0];
    if (best && best.pid !== onHim && d.matchups[star.pid] !== best.pid)
      addTactics(`guard-${star.pid}-${best.pid}`, `${names(best.pid)} on ${names(star.pid)}`, `${names(star.pid)} has ${star.pts}`, (x) => {
        for (const k of Object.keys(x.defense.matchups)) if (x.defense.matchups[+k] === best.pid) delete x.defense.matchups[+k];
        x.defense.matchups[star.pid] = best.pid;
      });
  }

  // the help: stay home on shooters from a packed paint, pack it from staying home
  if (d.help > 50) addTactics('home', 'Stay home on shooters', threesLine, (x) => void (x.defense.help = 30));
  else addTactics('pack', 'Pack the paint', paint.poss ? `${paint.pts} points inside on ${paint.poss} trips` : scoring, (x) => void (x.defense.help = 70));

  // the pressure on the ball: back off from a lot of it, get into the ball from a little
  if (d.pressure >= 60) addTactics('backoff', 'Back off the ball', scoring, (x) => void (x.defense.pressure = 45));
  else addTactics('pressure', 'Pressure the ball', `${tb.t.tov} turnovers from them`, (x) => void (x.defense.pressure = 70));

  // one of theirs in foul trouble on the floor: go at him (he plays softer, or sits)
  const limit = Math.min(view.q, 4) + 1;
  const soft = them.players.filter((p) => p.out === 0 && them.on.includes(p.pid) && p.fouls >= limit - 1 && p.fouls >= 2).sort((a, b) => b.fouls - a.fouls)[0];
  if (soft && t.offense.huntTarget !== soft.pid)
    addTactics(`hunt-${soft.pid}`, `Go at ${names(soft.pid)}`, `${names(soft.pid)} has ${soft.fouls} fouls`, (x) => void (x.offense.huntTarget = soft.pid));

  // them in the penalty: attack the rim, every foul is two shots
  if (them.fouls >= 4 && !input.atBreak && t.offense.rimAttack < 80)
    addTactics('rim', 'Attack the rim', `They have ${them.fouls} team fouls`, (x) => void (x.offense.rimAttack = Math.min(100, x.offense.rimAttack + 25)));

  // the mentality a step toward what the score needs: chase a deficit, protect a lead (level: a step up)
  const m = t.mentality ?? 0;
  const to = margin > 3 ? m - 1 : m + 1;
  const scoreWhy = margin > 0 ? `Up ${margin}` : margin < 0 ? `Down ${-margin}` : 'Level';
  if (to >= -2 && to <= 2)
    addTactics(`ment${to}`, `Go ${MENTALITY_META[to as -2].label.toLowerCase()}`, scoreWhy, (x) => {
      if (to === 0) delete x.mentality;
      else x.mentality = to as Tactics['mentality'];
    });
  // the pace the same way
  const pace = margin > 3 ? Math.max(0, t.offense.pace - 20) : Math.min(100, t.offense.pace + 20);
  addTactics(margin > 3 ? 'slower' : 'faster', margin > 3 ? 'Slow it down' : 'Push the pace', scoreWhy, (x) => void (x.offense.pace = pace));

  // a shooter of yours off tonight with the green light: less rope (the engine has no cold hand, so the
  // measurement will say if his shots are worse than the team's others)
  const cold = me.players.filter((p) => avail(me, p) && p.fga >= 8 && (t.offense.freedom[p.pid] ?? 0) > 0 && p.fgm / p.fga < 0.34).sort((a, b) => a.fgm / a.fga - b.fgm / b.fga)[0];
  if (cold) addTactics(`rope-${cold.pid}`, `Less rope for ${names(cold.pid)}`, `${names(cold.pid)} ${cold.fgm} of ${cold.fga}`, (x) => void (x.offense.freedom[cold.pid] = 0));

  return out.slice(0, crunch ? CALL_DRAFTS_CRUNCH : CALL_DRAFTS);
}

/** Where a call was measured from, in a few words: "Q3 6:12", "the end of Q2", "halftime". */
export function spotLabel(q: number, clock: number): string {
  const per = q <= 4 ? `Q${q}` : `OT${q - 4 > 1 ? q - 4 : ''}`;
  if (clock <= 0.05) return q === 2 ? 'halftime' : `the end of ${per}`;
  const m = Math.floor(clock / 60);
  const s = Math.floor(clock % 60);
  return `${per} ${m}:${String(s).padStart(2, '0')}`;
}

/**
 * A measured reading in a sentence, for the tap under a verdict: "About +1.4 points to the margin, give
 * or take 0.5": the margin shrunk toward even by its noise, with what's left of its uncertainty
 * (CallReading.band). A crunch-time call also cleared on the result, and says so without a figure:
 * picked for clearing its noise the win chance reads high (over 28 calls judged by the margin it read
 * +7.4% against a true +4.3%, round-3 game-day review; over 16 crunch-time calls in games where every
 * call was taken, +2.6% against +0.2), and no one shrink held in games followed and not (scratch
 * p1/live, 2026-10-27).
 */
export function readingLine(r: { pts: number; band: number }, by: 'pts' | 'win'): string {
  return `About ${signed(r.pts, 1)} points to the margin, give or take ${r.band.toFixed(1)}${by === 'win' ? ', and a better chance to win' : ''}.`;
}

/** How a reading was taken, in a sentence: "Measured from Q3 6:12: the rest of the game played 320 times each way." */
export const measuredFrom = (at: string, n: number) => `Measured from ${at}: the rest of the game played ${n} times each way.`;

/**
 * A measured reading as a verdict, the way the screens say it (decision 8: a verdict and one number,
 * the rest a tap down): "Helps: about +1.4 points", "Hurts: about −0.8 points", "No real change" (inside
 * its noise, as Tactics and the counters say it).
 */
export function verdictLine(r: { pts: number }, clear: boolean): string {
  if (!clear) return 'No real change';
  return `${r.pts > 0 ? 'Helps' : 'Hurts'}: about ${signed(r.pts, 1)} points`;
}

/** What the staff found at the last stop: measuring, a call (with its number), or none that clears. */
export type StaffCall =
  | { state: 'measuring'; tried: number; at: string; done?: number }
  | { state: 'call'; draft: CallDraft; m: CallsMeasured; at: string; base: string; steps: number }
  | { state: 'none'; tried: number; at: string; m?: CallsMeasured; steps?: number };

/**
 * The call as a bench note: why the staff looked (the evidence, its headline), its number, the change
 * on its button, and how it was measured a tap down (`detail`). Its line is the verdict: a call is only
 * made once its reading clears its noise.
 */
export function callNote(c: Extract<StaffCall, { state: 'call' }>): StaffNote {
  const r = c.m.reading!;
  const by = c.m.by;
  const a = c.draft;
  return {
    id: `call-${a.id}`,
    kind: 'decision',
    tone: 'good',
    title: a.why,
    text: by === 'win' ? 'Helps the chance to win from here.' : 'Helps from here.',
    detail: `${measuredFrom(c.at, r.n)} ${readingLine(r, by)}`,
    fig: { v: signed(r.pts, 1), unit: 'pts' },
    actions: [
      a.choice.kind === 'timeout'
        ? { kind: 'timeout', label: a.label }
        : a.choice.kind === 'sub'
          ? { kind: 'sub', label: a.label, out: a.choice.out, in: a.choice.in }
          : { kind: 'tactics', label: a.label, apply: a.apply ?? (() => {}) },
    ],
    rank: 99,
    auto: a.choice.kind === 'tactics',
  };
}

/** The staff's call over the court, in a line: its verdict and its number ("Helps: about +1.4 points."). */
export const callBannerLine = (c: Extract<StaffCall, { state: 'call' }>) => `${verdictLine(c.m.reading!, true)}.`;

/** The staff's line when it measured and found nothing to change, or while it measures. */
export function callQuietLine(c: StaffCall | null): string | null {
  if (!c) return null;
  if (c.state === 'measuring') return `Measuring ${c.tried === 1 ? 'a change' : `${c.tried} changes`} from ${c.at}…`;
  if (c.state === 'none')
    return c.tried
      ? `Nothing to change: ${c.tried === 1 ? `the one change from ${c.at} doesn't` : `none of ${c.tried} changes from ${c.at}`} clearly help${c.tried === 1 ? '' : 's'}.`
      : null;
  return null;
}
