// The staff's call for the week: each week of the regular season, one small decision chosen by what's
// at stake in it, with the staff's pick and its number. The week's big game (its billing, else the
// strongest team on the week's schedule): the staff's best counter for it, measured over paired games
// of that game (see counterWorth.ts) when the card is shown, against keeping the plan as it is. Or the
// week's practice: tactical drills while the system is still short (after a new playbook or new
// players), recovery for a heavy week on worn legs (see practice.ts), the familiarity and the wear it
// makes worked out exactly from the practice and wear models, and what that's worth in the week's
// last game measured the same way. A week has one card: the stakes rank them (a billed big game
// first; else the practice when it's called for; else the strongest opponent's game), and a game
// whose counters measure as no gain gives way to the week's next-biggest game (WEEK_GAMES of them),
// then the practice, or to no card: a call is a choice. (Over the real league about three opponents
// in four have a counter that measures as a gain: 6 of 8 in a probe of OKC's October.)
//
// "Unanswered, the staff does it": the practice from the morning after the card opened, the counter
// on game day if it was measured (a sim that runs past a card doesn't measure: it never puts in a
// counter it hasn't measured); what the staff did on its own goes in League.staffPicks for the digest
// (staffPicksSince). A practice focus put in for the week comes out at its end. The card expires at
// the week's end or once its game is played. Nothing here draws from the league's random stream, and
// in a sim it's one plan a week and a look each morning.
//
// Not calls, because the engine says there's nothing to choose: resting a star on a back-to-back, a
// minutes cap, recovery in most weeks. Wear only costs over 40 (wearPerf), and over a simulated season
// a rotation's minutes-weighted wear stayed under 10 (its most-worn player under 40) for a contender,
// a middle team and a bad one, while a night off for a star measured about −9 points that night
// (Gilgeous-Alexander, 2027). A call whose honest answer is always "play him" isn't a choice.
import type { Familiarity, League, Player, PrepFocus, ScheduledGame } from '../types';
import { curTeamSeason, fmtDate, teamPlayers } from './helpers';
import { PREP_META, freshFamiliarity, practiceDay } from '../sim/familiarity';
import { systemFamiliarity } from './practice';
import { billingsFor } from '../analysis/gameStory';
import { setPlanItem } from './gamePlans';
import { guideOpen } from './agenda';
import { worthFresh } from './calls';
import type { LeagueChange } from '../ai/counterWorth';

/** Days in a week of calls: week `w` of the regular season runs from day 7w to day 7w + 6. */
export const WEEK_DAYS = 7;
/**
 * System familiarity (the screens' figure) under which tactical drills for the week are a call: below
 * it the team plays a step slow on every possession (see FLUID in familiarity.ts), and a week of drills
 * moves it several points; above it, a week of drills moves it one or two.
 */
export const FAM_DRILL = 85;
/**
 * The rotation's wear (minutes-weighted, 0-100) at which a heavy week makes recovery a call: wear
 * only costs over 40 (see wearPerf), and a recovery week takes about six points off every player.
 */
export const WEAR_HEAVY = 45;
/** The user's games left in a week (or a back-to-back in it) that make it heavy. */
export const HEAVY_GAMES = 4;
/** The week's games whose counters the staff measures at most, the biggest first: one with no gain gives way to the next. */
export const WEEK_GAMES = 2;
/** What the staff did on its own kept, newest last. */
const PICKS_KEPT = 30;
/** A season's day as the staff's calls read it (the wear models' daily recovery and a game's wear a minute: see season.ts and games.ts). */
const DAILY_REST = 0.75;
const WEAR_A_MINUTE = 0.06;

export type WeekKind = 'game' | 'practice';

/** One of the week's big games: its id, the opponent, its billing tag, and whether the opponent is one of the league's best. */
export interface WeekGame {
  gid: number;
  opp: number;
  tag?: string;
  top?: boolean;
}

/** The week's call, planned on its first morning (League.weekCall). */
export interface WeekCall {
  season: number;
  week: number;
  /** The user's team it was planned for (a coach who changes jobs mid-week starts the new team's week fresh). */
  tid: number;
  /** The day it was planned (a card's "unanswered" counts from it). */
  day: number;
  /** What it can be about, in the order the stakes rank them: the card is the first with a real choice left (see weekKind). */
  kinds: WeekKind[];
  /** The week's big games, the biggest first (at most WEEK_GAMES): the card is about the first still with a real choice in it. */
  games?: WeekGame[];
  /** The practice the staff would hold for the week: the focus, the one it replaces, why, and the game its worth is measured on (the week's last). */
  focus?: { to: PrepFocus; from: PrepFocus; why: 'drills' | 'recovery'; gid: number; opp: number };
  /** How it was answered: the staff's option ('staff'), things kept as they were ('kept'), the staff's own pick ('auto'), or gone by unmeasured ('lapsed'). */
  taken?: 'staff' | 'kept' | 'auto' | 'lapsed';
  /** The practice focus it put in, to come out at the week's end. */
  set?: PrepFocus;
}

/** What the staff did with a call on its own (League.staffPicks): the digest's line for it. */
export interface StaffPick {
  season: number;
  day: number;
  text: string;
  /** A call that went by in a sim without being measured (nothing changed): the digest counts these in one line. */
  lapsed?: boolean;
}

/** The week of the regular season `day` is in, or null outside the regular season. */
export function weekOf(league: League, day = league.day): number | null {
  return league.phase === 'regular' ? Math.floor(day / WEEK_DAYS) : null;
}

/** The week's call's id. */
export const weekId = (season: number, week: number) => `week:${season}:${week}`;
/** Whether a call id is a weekly call's (a long sim passes them: see runSim). */
export const isWeekId = (id: string) => id.startsWith('week:');

/** The user's regular-season games still to play from `from` through `to`, in order. */
function gamesIn(league: League, from: number, to: number): ScheduledGame[] {
  const me = league.userTid;
  return league.schedule
    .filter((g) => !g.played && g.type === 'regular' && g.day >= from && g.day <= to && (g.home === me || g.away === me))
    .sort((a, b) => a.day - b.day || a.gid - b.gid);
}

const oppOf = (league: League, g: Pick<ScheduledGame, 'home' | 'away'>) => (g.home === league.userTid ? g.away : g.home);

/** A team's win share this season (an even 0.5 before it has five games). */
function winShare(league: League, tid: number): number {
  const ts = curTeamSeason(league, tid);
  const gp = ts.won + ts.lost;
  return gp >= 5 ? ts.won / gp : 0.5;
}

/** The rotation's wear, weighted by planned minutes (players planned 10 or more). */
function rotationWear(players: Pick<Player, 'pid' | 'wear'>[], minutes: Record<number, number>, wear?: Record<number, number>): number {
  let w = 0;
  let m = 0;
  for (const p of players) {
    const mins = minutes[p.pid] ?? 0;
    if (mins < 10) continue;
    w += mins * (wear?.[p.pid] ?? p.wear);
    m += mins;
  }
  return m ? w / m : 0;
}

/**
 * The week's big games, the biggest first: by billing (a rivalry, a showdown, Christmas, a revenge
 * game), then by the opponent's record; only each opponent's next meeting (what its counters are
 * measured for); at most WEEK_GAMES.
 */
function bigGames(league: League, games: ScheduledGame[]): WeekGame[] {
  const seen = new Set<number>();
  // the league's best by record: the top six, once each has ten games behind it, are one of the league's best
  const order = league.teams.map((t) => t.tid).sort((a, b) => winShare(league, b) - winShare(league, a));
  const played = (tid: number) => curTeamSeason(league, tid).won + curTeamSeason(league, tid).lost;
  const top = new Set(order.slice(0, 6).filter((tid) => played(tid) >= 10));
  const ranked: { g: ScheduledGame; weight: number; tag?: string; share: number }[] = [];
  for (const g of games) {
    const opp = oppOf(league, g);
    if (seen.has(opp)) continue;
    seen.add(opp);
    const b = billingsFor(league, g)[0];
    const weight = b && b.weight >= 2 ? b.weight : 0;
    ranked.push({ g, weight, tag: weight ? b!.tag : undefined, share: winShare(league, opp) });
  }
  return ranked
    .sort((a, b) => b.weight - a.weight || b.share - a.share || a.g.day - b.g.day)
    .slice(0, WEEK_GAMES)
    .map(({ g, tag }) => {
      const opp = oppOf(league, g);
      return { gid: g.gid, opp, ...(tag ? { tag } : {}), ...(top.has(opp) ? { top: true } : {}) };
    });
}

/**
 * The practice the staff would hold this week: tactical drills while the system is under FAM_DRILL;
 * with it known, recovery for a heavy week (HEAVY_GAMES or a back-to-back) on worn legs (WEAR_HEAVY);
 * only in place of the everyday balance (a focus he picked is his), and with a game left to measure it on.
 */
function weekPractice(league: League, games: ScheduledGame[]): WeekCall['focus'] | undefined {
  const last = games.at(-1);
  if (!last) return undefined;
  const me = league.userTid;
  const team = league.teams[me];
  const from = team.prep ?? 'balanced';
  // (a focus he picked himself is his: the staff only proposes one in place of the everyday balance)
  if (from !== 'balanced') return undefined;
  const fam = systemFamiliarity(league, me).overall;
  const b2b = games.some((g, i) => i > 0 && g.day - games[i - 1].day === 1);
  const heavy = games.length >= HEAVY_GAMES || b2b;
  const to: PrepFocus | null = fam < FAM_DRILL ? 'system' : heavy && rotationWear(teamPlayers(league, me), team.rotation.minutes) >= WEAR_HEAVY ? 'recovery' : null;
  if (!to) return undefined;
  return { to, from, why: to === 'system' ? 'drills' : 'recovery', gid: last.gid, opp: oppOf(league, last) };
}

/**
 * The week's call as the staff plans it on the week's first morning (pure: nothing stored). None in
 * the first week of a new coach's first season while the guide is open (its checklist plans the
 * opener), or in a week with no games of his left.
 */
export function planWeek(league: League, week: number): WeekCall {
  const call: WeekCall = { season: league.season, week, tid: league.userTid, day: league.day, kinds: [] };
  if (league.phase !== 'regular' || (week === 0 && guideOpen(league))) return call;
  const games = gamesIn(league, league.day, week * WEEK_DAYS + WEEK_DAYS - 1);
  if (!games.length) return call;
  const big = bigGames(league, games);
  const focus = weekPractice(league, games);
  if (big.length) call.games = big;
  if (focus) call.focus = focus;
  // the stakes: a billed big game first; else the practice when it's called for; the counters for the strongest opponent after
  const billed = !!big[0]?.tag;
  call.kinds = [...(billed ? (['game'] as const) : []), ...(focus ? (['practice'] as const) : []), ...(big.length && !billed ? (['game'] as const) : [])];
  return call;
}

/** This week's call: the one planned for it, else as the staff would plan it now (a screen before the week's first morning has passed in a sim). */
export function currentWeek(league: League): WeekCall | null {
  const w = weekOf(league);
  if (w === null || league.fired) return null;
  const wc = league.weekCall;
  return wc && wc.season === league.season && wc.week === w && wc.tid === league.userTid ? wc : planWeek(league, w);
}

/** Where the measurement for a kind of the week's call is kept (see calls.ts's storeWorth): a game's by its id. */
export const weekWorthId = (wc: Pick<WeekCall, 'season' | 'week'>, kind: WeekKind, gid?: number) => `${weekId(wc.season, wc.week)}|${kind}${gid !== undefined ? `:${gid}` : ''}`;

/**
 * The big game the week's card is about: the first of them whose counters haven't measured as no gain
 * (unless his plan for them changed since: then it's measured again), or null once that one is played
 * (the call came and went with it).
 */
export function weekGame(league: League, wc: WeekCall): WeekGame | null {
  const x = gameOf(league, wc);
  return x && !x.gone ? x.wg : null;
}

/** The week's game as weekGame finds it, `gone` once it was played (the week's call came and went with it: the practice doesn't take its place). */
function gameOf(league: League, wc: WeekCall): { wg: WeekGame; gone: boolean } | null {
  for (const wg of wc.games ?? []) {
    const g = league.schedule.find((x) => x.gid === wg.gid);
    if (!g) continue;
    // (measured as no gain: passed over, played or not)
    const w = league.callWorth?.[weekWorthId(wc, 'game', wg.gid)];
    if (w && !w.items?.length && w.gid === g.gid && (g.played || worthFresh(league, w, wg.opp, g))) continue;
    return { wg, gone: !!g.played };
  }
  return null;
}

/**
 * The kind the week's card is about: the first of its kinds still with a real choice in it (the
 * games: one left whose counters haven't measured as no gain; the practice: its game still to play
 * and the focus not in place already), or null.
 */
export function weekKind(league: League, wc: WeekCall): WeekKind | null {
  if (wc.taken) return null;
  const me = league.teams[league.userTid];
  for (const k of wc.kinds ?? []) {
    if (k === 'game') {
      const x = gameOf(league, wc);
      if (x?.gone) return null;
      if (x) return k;
      continue;
    }
    if (k === 'practice') {
      const g = wc.focus && league.schedule.find((x) => x.gid === wc.focus!.gid);
      if (!g || g.played || (me.prep ?? 'balanced') === wc.focus!.to) continue;
      return k;
    }
  }
  return null;
}

/** The week's call's id when its card is open now (what a sim checks each day: cheap). */
export function openWeekId(league: League): string | null {
  const wc = currentWeek(league);
  return wc && wc.kinds?.length && !league.callsDone?.includes(weekId(wc.season, wc.week)) && weekKind(league, wc) ? weekId(wc.season, wc.week) : null;
}

// ---------------------------------------------------------------- the practice, worked out

/** The team as it will stand on the morning of day `to` with `focus` held until then: its familiarity and each player's wear. */
export function projectPractice(league: League, focus: PrepFocus, to: number): { fam: Familiarity; wear: Record<number, number> } {
  const me = league.userTid;
  const team = league.teams[me];
  const roster = teamPlayers(league, me);
  const t = { ...team, prep: focus, fam: structuredClone(team.fam ?? freshFamiliarity(team, roster)) };
  const wear: Record<number, number> = {};
  for (const p of roster) wear[p.pid] = p.wear;
  const playing = new Set(league.schedule.filter((g) => g.day >= league.day && g.day < to && (g.home === me || g.away === me)).map((g) => g.day));
  const rest = PREP_META[focus].rest;
  const load = team.practice === 'intense' ? 1.15 : team.practice === 'light' ? 0.9 : 1;
  for (let d = league.day; d < to; d++) {
    // a game day's minutes (the rotation's plan), else a practice at the focus; the focus's rest and the day's every day
    if (playing.has(d)) for (const p of roster) wear[p.pid] = Math.min(100, wear[p.pid] + (team.rotation.minutes[p.pid] ?? 0) * WEAR_A_MINUTE * load);
    else practiceDay(t, roster);
    for (const p of roster) wear[p.pid] = Math.max(0, wear[p.pid] - rest - DAILY_REST);
  }
  return { fam: t.fam, wear };
}

/** The latest practiceOutlook, by league and what it read (the Continue bar draws the agenda on every render). */
const outlooks = new WeakMap<League, { key: string; value: ReturnType<typeof workOutlook> }>();

/**
 * The week's practice as the staff works it out: the team on the morning of the game it's measured on
 * with the focus it has and with the staff's (exact, from the models), and the two as changes for
 * measureChanges: `base` laid over the league, `change` measured against it.
 */
export function practiceOutlook(league: League, f: NonNullable<WeekCall['focus']>) {
  const key = `${league.season}|${league.day}|${league.games.length}|${league.userTid}|${f.gid}|${f.to}|${f.from}`;
  const hit = outlooks.get(league);
  if (hit?.key === key) return hit.value;
  const value = workOutlook(league, f);
  outlooks.set(league, { key, value });
  return value;
}

function workOutlook(league: League, f: NonNullable<WeekCall['focus']>) {
  const me = league.userTid;
  const g = league.schedule.find((x) => x.gid === f.gid)!;
  const roster = teamPlayers(league, me);
  const minutes = league.teams[me].rotation.minutes;
  const side = (focus: PrepFocus, id: string) => {
    const p = projectPractice(league, focus, g.day);
    const change: LeagueChange = { id, teams: { [me]: { fam: p.fam, prep: focus } }, players: Object.fromEntries(roster.map((x) => [x.pid, { wear: p.wear[x.pid] }])) };
    return { change, wear: rotationWear(roster, minutes, p.wear) };
  };
  const a = side(f.from, 'base');
  const b = side(f.to, 'focus');
  const fam = (c: LeagueChange) => systemFamiliarity({ ...league, teams: league.teams.map((t) => (t.tid === me ? { ...t, ...c.teams![me] } : t)) }, me).overall;
  return {
    g,
    base: a.change,
    change: b.change,
    fam: [fam(a.change), fam(b.change)] as const,
    wear: [a.wear, b.wear] as const,
    now: systemFamiliarity(league, me).overall,
    wearNow: rotationWear(roster, minutes),
  };
}

// ---------------------------------------------------------------- each morning

/** Note something the staff did on its own (the digest says it). */
export function notePick(league: League, text: string, lapsed = false) {
  const picks = league.staffPicks ?? [];
  picks.push({ season: league.season, day: league.day, text, ...(lapsed ? { lapsed } : {}) });
  league.staffPicks = picks.slice(-PICKS_KEPT);
}

/** The practice focus a call puts in for the week (the card's choice, or the staff's own). */
export function holdPractice(league: League, wc: WeekCall) {
  const team = league.teams[league.userTid];
  team.prep = wc.focus!.to;
  wc.set = wc.focus!.to;
}

/** "vs BOS", "@ BOS". */
export const vsAt = (league: League, g: Pick<ScheduledGame, 'home' | 'away'>) => `${g.home === league.userTid ? 'vs' : '@'} ${league.teams[oppOf(league, g)].abbrev}`;

/** "Friday", or "tonight". */
export const whenText = (league: League, day: number) => (day === league.day ? 'tonight' : `on ${fmtDate(league.season, day, { weekday: 'long' })}`);

/**
 * Each morning of the season (callsDaily): a week that's over takes out the practice its call put in
 * (if it's still the focus) and the next week's call is planned; then a call still unanswered when it
 * matters is the staff's to make: the practice from the morning after the card opened, the counter on
 * game day if it was measured (a card measured is a card shown); a big game that came and went
 * unmeasured is noted as gone by, nothing changed.
 */
export function weekDaily(league: League) {
  if (league.fired) return;
  const w = weekOf(league);
  const old = league.weekCall;
  if (old && (w === null || old.season !== league.season || old.week !== w || old.tid !== league.userTid)) {
    const team = league.teams[old.tid ?? league.userTid];
    if (old.set && team?.prep === old.set) team.prep = old.focus!.from;
    league.weekCall = undefined;
  }
  if (w === null) return;
  const wc = (league.weekCall ??= planWeek(league, w));
  if (wc.taken || league.callsDone?.includes(weekId(wc.season, wc.week))) return;
  const kind = weekKind(league, wc);
  // its big game came and went unanswered (a sim ran past it, or it was played without a word): nothing changed
  const at = !kind && wc.kinds?.includes('game') ? gameOf(league, wc) : null;
  if (at?.gone) {
    wc.taken = 'lapsed';
    const g = league.schedule.find((x) => x.gid === at.wg.gid)!;
    // (measured, its card was shown: he let it go; unmeasured, a sim ran past it)
    const seen = !!league.callWorth?.[weekWorthId(wc, 'game', at.wg.gid)];
    notePick(league, seen ? `${vsAt(league, g)}: the staff's counter went unanswered, and your plan stood.` : vsAt(league, g), !seen);
    return;
  }
  if (kind === 'practice' && league.day > wc.day) {
    const f = wc.focus!;
    holdPractice(league, wc);
    wc.taken = 'auto';
    const why = f.why === 'drills' ? `the system was at ${Math.round(systemFamiliarity(league, league.userTid).overall)}%` : 'a heavy week on worn legs';
    const m = league.callWorth?.[weekWorthId(wc, 'practice')];
    const worth =
      m && m.gid === f.gid && m.pts !== undefined
        ? `measured at about ${m.pts >= 0 ? '+' : '−'}${Math.abs(m.pts).toFixed(1)} a game in the week's last game`
        : 'its worth not measured';
    notePick(league, `Practice: ${PREP_META[f.to].label} for the rest of the week (${why}; the staff's call, ${worth}).`);
    return;
  }
  // the morning of the game, if the card was measured since it opened (one nobody has seen isn't the staff's to answer)
  const wg = kind === 'game' && league.day > wc.day ? weekGame(league, wc) : null;
  const g = wg && league.schedule.find((x) => x.gid === wg.gid);
  if (!wg || !g || g.day !== league.day) return;
  // measured on his plan as it was: a plan of his own since was his answer
  const m = league.callWorth?.[weekWorthId(wc, 'game', wg.gid)];
  if (!m) return;
  const item = worthFresh(league, m, wg.opp, g) ? m.items?.[0] : undefined;
  if (!item) {
    wc.taken = 'kept';
    return;
  }
  setPlanItem(league, wg.opp, item);
  wc.taken = 'auto';
  notePick(league, `${wg.tag ? `${wg.tag} ` : ''}${vsAt(league, g)}: the staff put in ${item.label}, measured at about +${(item.pts ?? 0).toFixed(1)} a game against them.`);
}

/**
 * What the staff did on its own in a sim that started on `day` of `season` (a digest's stretch), as
 * lines: each pick, then one line for the weekly calls that went by unmeasured (a sim doesn't stop to
 * measure them). A pick is made in a sim's mornings, so the one on the morning it started was the
 * sim before's.
 */
export function staffPicksSince(league: League, season: number, day: number): string[] {
  const picks = (league.staffPicks ?? []).filter((p) => p.season > season || (p.season === season && p.day > day));
  const out = picks.filter((p) => !p.lapsed).map((p) => p.text);
  const lapsed = picks.filter((p) => p.lapsed);
  if (lapsed.length)
    out.push(
      `${lapsed.length === 1 ? `The week's big game (${lapsed[0].text}) went` : `${lapsed.length} weeks' big games (${lapsed.map((p) => p.text).join(', ')}) went`} by in the sim: the staff doesn't put in counters it hasn't measured, so your plan stood.`,
    );
  return out;
}

/** The week's call answered (calls.ts's resolveCall): 'staff' for the staff's option, 'kept' for things as they were. */
export function answerWeek(league: League, how: 'staff' | 'kept') {
  const wc = currentWeek(league);
  if (!wc) return;
  league.weekCall = wc;
  wc.taken = how;
}
