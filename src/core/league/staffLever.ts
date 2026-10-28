// The staff's in-season changes to the user's playbook, measured before they're made or offered.
//
// The engine tallies each setting's trade-off in every game (seasonLevers in advisor.ts: what drop
// coverage gave up in pull-ups against what it won at the rim), but a tally isn't a counterfactual.
// Drop against Switch over 406 paired games for each of six teams (round-3 review, 2026-10): the games
// favoured Drop for all six, by 0.8 to 2.9 a game, while the tally favoured Switch for all six, and
// every coverage tallies as a net loss, so "is costing you" never stopped and the staff kept changing
// coverages by mail. So the tally only orders where the staff looks (its worst trade-off whose
// counter changes the user's tactics first, as the rules that draft a game's counters do), and the
// change is measured: every LEVER_EVERY days of the regular season, in the sim's morning (callMeasure.ts's staffMorning,
// in the worker), over his next LEVER_AHEAD games, each played as the tactics stand and with the
// change, game for game on the same seeds, pooled and shrunk toward even (counterWorth.ts). A reading
// that clears WORTH_MIN and LEVER_Z standard errors:
// - the staff runs his tactics: it goes in, with a mail that says what was measured, the digest's
//   line and Undo on Tactics (a StaffMove: it holds while the playbook and identity it was made on
//   do; undone, the staff doesn't make it again that season);
// - he runs them himself: a card offers it with the number (leverCard, through teamAlerts).
// Anything less changes nothing, and isn't measured again that season on the same tactics and roster
// (the next look is the tally's next candidate: round 4 found the same rejected change measured six
// times a season); the staff says what it measured (the digest's staff report, and Tactics →
// Analysis's row: leverReport). AI staffs don't read the tally at all: they run their coach's fit
// (autoTactics). Nothing here draws from the league's random stream.
import type { League, Tactics, TacticsPatch } from '../types';
import { addInbox, fmtDate, teamPlayers } from './helpers';
import { hashString } from '../random';
import { applyPatch, cloneTactics, tacticsDiff } from '../sim/tactics';
import { tacticsChanges } from '../sim/playbooks';
import { WORTH_MIN, measureChanges, poolWorth, type WorthOpts } from '../ai/counterWorth';
import { STAFF_LEVERS, leverCounter, seasonLevers, type Alert } from '../ai/advisor';
import { gamesAhead } from '../ai/tacticEdits';
import { leadAssistant } from '../ai/assistant';
import { STAFF_REPORT, notePick } from './weekCall';

/**
 * The user's games ahead a change is measured on. A change that stays in plays every opponent, and
 * what one is worth spreads about ±1.2 a game from one opponent to the next (counterWorth.ts's
 * WORTH_SPREAD), so it's measured on several opponents at a few pairs each rather than one at many.
 */
export const LEVER_AHEAD = 6;
/** Paired games each configuration plays, a game. */
export const LEVER_PAIRS = 20;
/**
 * Days between the staff's measurements: six a regular season, each 240 to 480 paired games, 0.75
 * to 1.5 seconds on a laptop where a day of the league's games is 0.09 (2026-10-26): about a third
 * again on a regular season's sim time, as much as the calls' measuring (callMeasure.ts) adds.
 */
export const LEVER_EVERY = 28;
/**
 * Days a reading that clears the bar stands for the tactics it was measured on (a later one on other
 * tactics is a new reading). One that doesn't stands for the season, on those tactics and that roster.
 */
export const LEVER_STALE = 28;
/**
 * Standard errors from even a reading has to be, besides WORTH_MIN, before the staff makes the change
 * or offers it: a change that stays in for weeks is held to more than one night's counter (at six
 * games of 20 pairs a reading's error is about 0.6 to 0.9 a game, so one worth nothing clears it about
 * one time in fifty, and one worth two points a game most times).
 */
export const LEVER_Z = 2;
/** Readings and moves kept: a season's (a reading every LEVER_EVERY days), so the ones that didn't clear stay ruled out all season. */
const KEPT = 12;

/** One measurement of a change the tally pointed at. */
export interface LeverReading {
  /** The trade-off it answers, as the tally names it ("switching"), and the staff's change ("Go to Drop"). */
  what: string;
  label: string;
  /** The tactics it was measured against (leverSig). */
  sig: number;
  day: number;
  /** Points a game it measured over `games` of his games: shrunk toward even (shown), as read, and its standard error. */
  pts: number;
  raw: number;
  se: number;
  games: number;
  /** Each setting it moved, as the Tactics screen names it: [label, from, to] (absent in readings from before). */
  words?: [string, string, string][];
  /** The roster it was measured on (rosterSig; absent in readings from before). */
  roster?: number;
}

/** A change the staff made to the playbook it runs for the user, on a reading. */
export interface StaffMove {
  day: number;
  what: string;
  label: string;
  /** Each setting it moved, as the Tactics screen names it: [label, from, to]. */
  words: [string, string, string][];
  /** The settings it set, and the ones it moved off (Undo). */
  patch: TacticsPatch;
  back: TacticsPatch;
  /** The offensive playbook and defensive identity it was made on: it holds while they do. */
  on: { off: string; def: string };
  pts: number;
  raw: number;
  se: number;
  games: number;
  /** Put back by the user: not made again this season. */
  undone?: boolean;
}

/** The staff's measured changes this season (League.staffLever). */
export interface StaffLever {
  season: number;
  tid: number;
  /** The day the staff last measured. */
  last: number;
  readings: LeverReading[];
  moves: StaffMove[];
}

const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);

/** This season's record for the user's team (an empty one for a new season, a new team, or one damaged). */
function stateOf(league: League): StaffLever {
  const s = league.staffLever;
  const ok =
    s &&
    s.season === league.season &&
    s.tid === league.userTid &&
    num(s.last) &&
    Array.isArray(s.readings) &&
    Array.isArray(s.moves) &&
    s.readings.every((r) => r && typeof r.what === 'string' && num(r.sig) && num(r.pts) && num(r.se)) &&
    s.moves.every((m) => m && typeof m.label === 'string' && m.patch && m.back && m.on && Array.isArray(m.words));
  return ok ? s : { season: league.season, tid: league.userTid, last: -Infinity, readings: [], moves: [] };
}

/** This season's moves by the staff for the user's team, oldest first. */
export const staffMoves = (league: League): StaffMove[] => stateOf(league).moves;

/** What a reading stands on: the tactics' settings (who runs them aside) and the trade-off. */
export function leverSig(t: Tactics, what: string): number {
  return hashString(JSON.stringify({ ...t, manual: undefined, playbook: undefined }) + what);
}

/** What the user's roster comes to: a trade or a signing makes a change read short of the bar worth measuring again. */
const rosterSig = (league: League) =>
  hashString(
    teamPlayers(league, league.userTid)
      .map((p) => p.pid)
      .sort((a, b) => a - b)
      .join(','),
  );

/** Whether a reading clears the bar for a change that stays in: WORTH_MIN shrunk and LEVER_Z errors from even. */
export const leverClears = (r: Pick<LeverReading, 'pts' | 'raw' | 'se'>) => r.pts >= WORTH_MIN && r.raw >= LEVER_Z * r.se;

/** Whether the user put back the staff's change `label` for trade-off `what` this season. */
const undone = (st: StaffLever, what: string, label: string) => st.moves.some((m) => m.undone && m.what === what && m.label === label);

/**
 * The change the staff measures next on tactics `t`: the counter to the trade-off the tally has worst
 * that the tactics play (the engine saw it at work) and that isn't measured on them lately (one that
 * cleared, within LEVER_STALE days) or at all this season on this roster (one that didn't). The
 * tally only orders the search: a setting it reads as paying its way is measured in its turn.
 */
function candidate(league: League, t: Tactics) {
  const st = stateOf(league);
  const roster = rosterSig(league);
  for (const e of seasonLevers(league, league.userTid)) {
    if (e.lost + e.won <= 0) continue;
    // (the staff makes only the changes it can stand behind on its own; the user is offered any)
    if (!t.manual && !STAFF_LEVERS.has(e.what)) continue;
    const c = leverCounter(e.what, t);
    if (!c || undone(st, e.what, c.label)) continue;
    const sig = leverSig(t, e.what);
    const after = cloneTactics(t);
    c.apply(after);
    // (a change read short is the same change while it moves the same settings the same way, whatever
    // else the staff's refits have moved since: the matchups and the like as players come and go)
    const words = JSON.stringify(changeWords(league, t, after));
    const short = (r: LeverReading) => r.what === e.what && r.label === c.label && (r.words ? JSON.stringify(r.words) === words : r.sig === sig) && (r.roster ?? roster) === roster;
    if (st.readings.some((r) => (leverClears(r) ? r.sig === sig && league.day - r.day < LEVER_STALE : short(r)))) continue;
    return { what: e.what, label: c.label, sig, after };
  }
  return null;
}

/** "Ball-screen coverage: Switch → Drop": a change in the Tactics screen's words. */
function changeWords(league: League, a: Tactics, b: Tactics): [string, string, string][] {
  const name = (pid: number) => league.players[pid]?.lastName ?? `#${pid}`;
  return tacticsChanges(a, b, name).map((c) => [c.label, c.from, c.to]);
}

/** The one setting a change moves, when it moves one the screen names from and to. */
const oneSetting = (words: [string, string, string][] | undefined) => (words?.length === 1 && words[0][1] && words[0][2] ? words[0] : null);
/** A setting moved between named options ("Drop" to "Hedge"), not between levels shown as numbers. */
const named = (w: [string, string, string]) => Number.isNaN(Number(w[1])) && Number.isNaN(Number(w[2]));

const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`;
const games = (n: number) => (n === 1 ? 'game' : `${['', 'one', 'two', 'three', 'four', 'five', 'six'][n] ?? n} games`);

/**
 * "Drop measured +1.1 a game against Switch over our next six games…": the reading, as the staff says
 * it (`pts` false: without the number, under a title that has it; `brief`: the digest's few words).
 */
function measuredLine(words: [string, string, string][], r: Pick<LeverReading, 'pts' | 'games'>, us: 'our' | 'your', pts = true, brief = false): string {
  const one = oneSetting(words);
  const worth = pts ? ` measured ${signed(r.pts)} a game` : '';
  // (a level the screen shows as a number reads as the setting moved: "Crash boards 42 → 60")
  const head = one ? (named(one) ? `${one[2]}${worth} against ${one[1]}` : `${one[0]} ${one[1]} → ${one[2]}${worth}`) : `The change${worth}`;
  return `${head} over ${us} next ${games(r.games)}, ${brief ? 'played both ways' : 'each played both ways on the same seeds'}`;
}

/**
 * The staff's measuring for the morning (staffMorning runs it each morning of a sim): every
 * LEVER_EVERY days of the regular season, the change the tally points at, measured over his next
 * games; then the change a standing reading clears the bar for is made, when the staff runs his
 * tactics (leverDecide). False if it was stopped.
 */
export async function leverMorning(league: League, opts: WorthOpts & { onMeasure?: () => void } = {}): Promise<boolean> {
  if (league.fired || league.phase !== 'regular') return true;
  const ok = await measureLever(league, opts);
  leverDecide(league);
  return ok;
}

/** The measurement, when one is due: false if it was stopped. */
async function measureLever(league: League, opts: WorthOpts & { onMeasure?: () => void }): Promise<boolean> {
  const st = stateOf(league);
  if (league.day - st.last < LEVER_EVERY) return true;
  const team = league.teams[league.userTid];
  const c = candidate(league, team.tactics);
  const ahead = gamesAhead(league, LEVER_AHEAD);
  if (!c || !ahead.length) return true;
  opts.onMeasure?.();
  const change = { id: 'lever', teams: { [league.userTid]: { tactics: c.after } } };
  const parts: { w: number; raw: number; se: number }[] = [];
  for (const g of ahead) {
    const opp = g.home === league.userTid ? g.away : g.home;
    const out = await measureChanges(league, opp, [change], g, { ...opts, games: LEVER_PAIRS });
    if (!out?.[0]) return false;
    parts.push({ w: 1 / ahead.length, raw: out[0].raw, se: out[0].se });
  }
  const w = poolWorth('lever', parts);
  const words = changeWords(league, team.tactics, c.after);
  const r: LeverReading = { what: c.what, label: c.label, sig: c.sig, day: league.day, pts: w.pts, raw: w.raw, se: w.se, games: ahead.length, words, roster: rosterSig(league) };
  league.staffLever = { ...st, last: league.day, readings: [...st.readings, r].slice(-KEPT) };
  // (one that clears is a change or a card, said there; one that doesn't changes nothing, and the staff says what it measured)
  if (!leverClears(r)) {
    const from = keptWords(words);
    notePick(league, `${STAFF_REPORT} ${measuredLine(words, r, 'our', true, true)}; ${r.pts > 0 ? 'too close to call, so ' : ''}keeping ${from}.`);
  }
  return true;
}

/** What a change read short of the bar left as it was: "Drop", or "the playbook as it is". */
const keptWords = (words: [string, string, string][] | undefined) => {
  const one = oneSetting(words);
  return !one ? 'the playbook as it is' : named(one) ? one[1] : `${one[0].charAt(0).toLowerCase()}${one[0].slice(1)} at ${one[1]}`;
};

/**
 * The staff's latest reading this season, as Tactics → Analysis lists it: the change, what it
 * measured a game, and one line (when, on what, and what came of it). Null before the first.
 */
export function leverReport(league: League): { pts: number; title: string; meta: string } | null {
  const st = stateOf(league);
  const r = st.readings[st.readings.length - 1];
  if (!r) return null;
  const one = oneSetting(r.words);
  const made = st.moves.some((m) => m.what === r.what && m.label === r.label && m.day >= r.day);
  const came = made
    ? one
      ? `changed to ${named(one) ? one[2] : `${one[0].toLowerCase()} ${one[2]}`}`
      : 'made the change'
    : leverClears(r)
      ? 'yours to make on Team'
      : `kept ${keptWords(r.words)}`;
  return { pts: r.pts, title: r.label, meta: `${fmtDate(league.season, r.day)} · ${r.games === 1 ? '1 game' : `${r.games} games`} both ways · ${came}` };
}

/**
 * The latest reading on tactics `t` as they stand that clears the bar (within LEVER_STALE days), with
 * the change it measured as `t` gives it now; null without one.
 */
function standing(league: League, t: Tactics) {
  const st = stateOf(league);
  for (const r of [...st.readings].reverse()) {
    if (league.day - r.day >= LEVER_STALE || r.sig !== leverSig(t, r.what) || !leverClears(r) || undone(st, r.what, r.label)) continue;
    const c = leverCounter(r.what, t);
    if (!c || c.label !== r.label) continue;
    const after = cloneTactics(t);
    c.apply(after);
    return { r, after, words: changeWords(league, t, after) };
  }
  return null;
}

/**
 * The staff makes the change a standing reading clears the bar for in the playbook it runs for the
 * user, and says so (mail, digest, Undo on Tactics): the move, or null when there's none to make.
 */
export function leverDecide(league: League): StaffMove | null {
  const team = league.teams[league.userTid];
  if (league.fired || team.tactics.manual) return null;
  const s = standing(league, team.tactics);
  if (!s) return null;
  const { r, after, words } = s;
  const before = team.tactics;
  const m: StaffMove = {
    day: league.day,
    what: r.what,
    label: r.label,
    words,
    patch: tacticsDiff(before, after),
    back: tacticsDiff(after, before),
    on: { off: before.offPreset, def: before.defPreset },
    pts: r.pts,
    raw: r.raw,
    se: r.se,
    games: r.games,
  };
  team.tactics = { ...after, manual: false };
  const st = stateOf(league);
  league.staffLever = { ...st, moves: [...st.moves, m].slice(-KEPT) };
  const lead = leadAssistant(league);
  const what = words.map((w) => (w[1] || w[2] ? `${w[0]}: ${w[1]} → ${w[2]}` : w[0])).join(' · ');
  addInbox(league, {
    from: `${lead.name}, lead assistant`,
    subject: `Staff change: ${r.label}`,
    body: `${what}. ${measuredLine(words, r, 'our')}, so I've changed it. Team → Tactics has it, with Undo if you'd rather keep it as it was.`,
    link: '/team/tactics',
  });
  notePick(league, `${moveShort(m)} (measured ${signed(r.pts)} a game over the next ${games(r.games)})`);
  return m;
}

/** "Ball-screen coverage to Drop": a move in a few words. */
export function moveShort(m: Pick<StaffMove, 'words' | 'label'>): string {
  const w = m.words[0];
  if (!w || m.words.length > 1 || !w[2]) return m.label;
  return `${w[0]} to ${w[2]}`;
}

/** Whether every setting a move set is still in tactics `t` (the user hasn't moved it again). */
const holds = (m: StaffMove, t: Tactics) => JSON.stringify(applyPatch(t, m.patch)) === JSON.stringify(cloneTactics(t));

/** The staff's latest move this season still in the user's tactics (the Tactics screens name it, with Undo), or null. */
export function staffMoveNow(league: League): StaffMove | null {
  const t = league.teams[league.userTid].tactics;
  const ms = stateOf(league).moves.filter((m) => !m.undone && holds(m, t));
  return ms[ms.length - 1] ?? null;
}

/** "Staff moved ball-screen coverage to Drop on Nov 10 · measured +1.1 a game": a move as the screens name it. */
export function moveLine(league: League, m: StaffMove): string {
  const s = moveShort(m);
  return `Staff moved ${s.charAt(0).toLowerCase()}${s.slice(1)} on ${fmtDate(league.season, m.day)} · measured ${signed(m.pts)} a game`;
}

/** Put a move's settings back (Undo): the staff doesn't make it again this season. False if it isn't in force. */
export function undoStaffMove(league: League, day: number): boolean {
  const st = stateOf(league);
  const team = league.teams[league.userTid];
  const m = st.moves.find((x) => x.day === day && !x.undone);
  if (!m || !holds(m, team.tactics)) return false;
  team.tactics = { ...applyPatch(team.tactics, m.back), manual: team.tactics.manual };
  league.staffLever = { ...st, moves: st.moves.map((x) => (x === m ? { ...x, undone: true } : x)) };
  return true;
}

/** Tactics `t` (the staff's refit) with this season's moves that still stand on its playbook and identity. */
export function withStaffMoves(league: League, t: Tactics): Tactics {
  let out = t;
  for (const m of stateOf(league).moves) if (!m.undone && m.on.off === out.offPreset && m.on.def === out.defPreset) out = { ...applyPatch(out, m.patch), manual: out.manual };
  return out;
}

/**
 * The card for tactics the user runs himself: the latest reading on them that clears the bar, while
 * it stands (LEVER_STALE days, the tactics unchanged), with the change as its one-tap fix.
 */
export function leverCard(league: League): Alert | null {
  const t = league.teams[league.userTid].tactics;
  if (!t.manual) return null;
  const s = standing(league, t);
  if (!s) return null;
  const { r, after, words } = s;
  const patch = tacticsDiff(t, after);
  return {
    id: `lever-${r.what}`,
    tone: 'alert',
    title: `${r.label}: measured ${signed(r.pts)} a game`,
    body: `${measuredLine(words, r, 'your', false)} (measured ${fmtDate(league.season, r.day)}).`,
    // (the Instructions phase the change is made in)
    link: `/team/tactics/instructions${patch.defense ? '?phase=outPoss' : ''}`,
    fix: { kind: 'patch', patch, label: r.label },
  };
}
