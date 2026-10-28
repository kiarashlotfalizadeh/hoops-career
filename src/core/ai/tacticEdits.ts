// "Since you changed it": the staff's ledger of the user's changes to his tactics and rotation
// (League.tacticEdits). A change is kept as the settings it moved (each one's path in the team, what
// it was and what it became), so it can be measured, measured again and put back on its own, whatever
// else has changed since.
//
// Measured twice, both times by measureChanges (counterWorth.ts), paired games on the same seeds:
// - as it's made (the user taps Done, or leaves the Team screens with a change): over the user's next
//   EDIT_AHEAD games, each played with the change and with the settings it replaced (tonight's
//   familiarity included: a coverage the team hasn't drilled is played a step slow), pooled into one
//   number a game. A change the team doesn't know yet is also played as it will be once it's drilled
//   (the team knowing it as well as what it replaced: drilledAs), so the line can say what learning it
//   costs tonight and that it fades.
// - about CHECK_AFTER games later, on the games actually played since (those opponents, those floors,
//   with tonight's rosters), with and without it, the old way known as well as the new one is now: so a
//   verdict ("It worked: +0.9 a game over 12 games") is a measurement, never the record. A game's
//   margin has an SD of about 13: ten games of results can't tell a point a game from nothing, and
//   paired replays can (12 games × 40 pairs each read to about ±0.5).
// Both readings are pooled over the games and shrunk toward even as one (poolWorth), and read as a
// gain, a cost or "too close to say" by worthCall's WORTH_MIN.
// Pure: the functions here plan a measurement, read it and record it; the worker runs the games
// (src/ui/tactics/editWatch.ts).

import type { League, Player, Rotation, ScheduledGame, Tactics, TacticEdit } from '../types';
import { tacticsChanges } from '../sim/playbooks';
import { drilledAs, execution } from '../sim/familiarity';
import { addInbox, playerName, teamPlayers } from '../league/helpers';
import { plural } from '../format';
import { poolWorth, worthCall, type CounterWorth, type LeagueChange } from './counterWorth';
import { leadAssistant } from './assistant';

/** The user's games ahead a change is measured on as it's made. */
export const EDIT_AHEAD = 5;
/**
 * Paired games each configuration plays over all of them (at least EDIT_MIN_GAMES a game): five
 * games of 60 read to about ±0.45 a game, as one opponent's 240 do, in 10-20 seconds on a phone.
 */
export const EDIT_GAMES = 300;
export const EDIT_MIN_GAMES = 40;
/** The user's games played since a change before the staff measures it again on them. */
export const CHECK_AFTER = 10;
/** The most of them it's measured on (the first played after the change). */
export const CHECK_MAX = 15;
/** Paired games each configuration plays over all of them, for the check (at least CHECK_MIN_GAMES a game). */
export const CHECK_GAMES = 480;
export const CHECK_MIN_GAMES = 30;
/** Changes the ledger keeps (the oldest goes first). */
export const EDITS_KEPT = 6;
/**
 * Points of familiarity (the five's execution, either end) a change has to cost before the staff also
 * plays it as it will be once drilled: below that, learning it costs a few hundredths of a point.
 */
const DRILL_GAP = 2;

/** The parts of the user's team a change moves. */
export interface TeamPart {
  tactics: Tactics;
  rotation: Rotation;
}

// ---------------------------------------------------------------- the settings a change moved

type Diff = TacticEdit['diff'];
/** Switches, not settings: who runs them, and the saved playbook they came from. */
const IGNORED = new Set(['tactics.manual', 'tactics.playbook', 'rotation.manual']);
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const copy = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

function walk(a: unknown, b: unknown, path: string, out: Diff) {
  if (IGNORED.has(path)) return;
  // (an object on one side and nothing on the other: each of its settings, against nothing)
  if ((isObj(a) || a === undefined) && (isObj(b) || b === undefined) && (isObj(a) || isObj(b))) {
    const x = (a ?? {}) as Record<string, unknown>;
    const y = (b ?? {}) as Record<string, unknown>;
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${path}.${k}`, out);
    return;
  }
  if (!same(a, b)) out.push([path, copy(a), copy(b)]);
}

/** Every setting that differs from `a` to `b`, by its path in the team (lists, like the depth order, as one setting). */
export function partDiff(a: TeamPart, b: TeamPart): Diff {
  const out: Diff = [];
  walk(a.tactics, b.tactics, 'tactics', out);
  walk(a.rotation, b.rotation, 'rotation', out);
  return out;
}

function getPath(root: unknown, path: string): unknown {
  let v = root;
  for (const k of path.split('.')) v = isObj(v) ? v[k] : undefined;
  return v;
}

function setPath(root: Record<string, unknown>, path: string, value: unknown) {
  const ks = path.split('.');
  let v = root;
  for (const k of ks.slice(0, -1)) {
    if (!isObj(v[k])) v[k] = {};
    v = v[k] as Record<string, unknown>;
  }
  const last = ks[ks.length - 1];
  if (value === undefined) delete v[last];
  else v[last] = copy(value);
}

/**
 * `part` with a change's settings put back as they were, each only where it still holds what the
 * change set (one moved again since stays as it is), and how many went back. A depth order put back
 * keeps only the players still on the team, the newcomers after them.
 */
export function putBack(part: TeamPart, diff: Diff, roster: Pick<Player, 'pid'>[]): { part: TeamPart; n: number } {
  const root = structuredClone(part) as unknown as Record<string, unknown>;
  let n = 0;
  for (const [path, from, to] of diff) {
    if (!same(getPath(root, path), to)) continue;
    setPath(root, path, from);
    n++;
  }
  const out = root as unknown as TeamPart;
  const on = new Set(roster.map((p) => p.pid));
  const order = out.rotation.order.filter((pid) => on.has(pid));
  out.rotation.order = [
    ...order,
    ...part.rotation.order.filter((pid) => on.has(pid) && !order.includes(pid)),
    ...roster.map((p) => p.pid).filter((pid) => !order.includes(pid) && !part.rotation.order.includes(pid)),
  ];
  out.rotation.closers = out.rotation.closers.filter((pid) => on.has(pid));
  return { part: out, n };
}

/** Two changes one after the other as one: each setting from where the first found it to where the second left it (ones back where they started drop out). */
function compose(a: Diff, b: Diff): Diff {
  const m = new Map<string, [unknown, unknown]>(a.map(([p, f, t]) => [p, [f, t]]));
  for (const [p, f, t] of b) m.set(p, [m.has(p) ? m.get(p)![0] : f, t]);
  return [...m].filter(([, [f, t]]) => !same(f, t)).map(([p, [f, t]]) => [p, f, t]);
}

/** A player's own settings, by his pid: the ones a player leaving the team takes with him (leaveTeam). */
const LEAVES_WITH = /^(?:rotation\.(?:minutes|caps)|tactics\.offense\.(?:roles|freedom))\.(\d+)$/;
/** The lists a player leaving drops out of (and, for the order, one arriving is added at the end of). */
const ROSTER_LISTS = new Set(['rotation.order', 'rotation.closers', 'rotation.restB2B']);

/**
 * `diff` without what the user's roster moves did to his team (a release, a trade, a signing), which
 * he didn't do on the Tactics screens: a player who left takes his minutes, cap, role and shot freedom
 * with him and drops out of the order, the closers and the rest days; one who came is at the end of
 * the order. What's left is the user's own change. `on`: the players on the team now.
 */
export function withoutRosterMoves(diff: Diff, on: ReadonlySet<number>): Diff {
  const out: Diff = [];
  for (const [path, from, to] of diff) {
    const own = LEAVES_WITH.exec(path);
    if (own && to === undefined && !on.has(+own[1])) continue;
    if (ROSTER_LISTS.has(path) && Array.isArray(from) && Array.isArray(to)) {
      // (the list as the moves alone would have left it)
      const was = [...from.filter((pid) => on.has(pid as number) || to.includes(pid)), ...(path === 'rotation.order' ? to.filter((pid) => !from.includes(pid)) : [])];
      if (!same(was, to)) out.push([path, was, to]);
      continue;
    }
    out.push([path, from, to]);
  }
  return out;
}

/** `part` with each of a change's settings set to what it was (`side` 1) or became (2). */
function setAll(part: TeamPart, diff: Diff, side: 1 | 2): TeamPart {
  const root = structuredClone(part) as unknown as Record<string, unknown>;
  for (const d of diff) setPath(root, d[0], d[side]);
  return root as unknown as TeamPart;
}

/** Two changes touch the same control: a setting both moved. */
const sameControl = (a: Diff, b: Diff) => a.some(([p]) => b.some(([q]) => q === p));

// ---------------------------------------------------------------- what it is, in words

/** A rotation change in a few words: who starts, minutes that moved by two or more, the closers, rest and caps. */
function rotationWords(a: Rotation, b: Rotation, nameOf: (pid: number) => string): string[] {
  const out: string[] = [];
  const five = (r: Rotation) => r.order.slice(0, 5);
  const ins = five(b).filter((p) => !five(a).includes(p));
  const outs = five(a).filter((p) => !five(b).includes(p));
  if (ins.length) out.push(`Starting: ${ins.map(nameOf).join(', ')} for ${outs.map(nameOf).join(', ')}`);
  else if (!same(a.order, b.order)) out.push('Depth order');
  const moved = [...new Set([...Object.keys(a.minutes), ...Object.keys(b.minutes)])]
    .map(Number)
    .map((pid) => ({ pid, x: Math.round(a.minutes[pid] ?? 0), y: Math.round(b.minutes[pid] ?? 0) }))
    .filter((m) => Math.abs(m.y - m.x) >= 2)
    .sort((m, n) => Math.abs(n.y - n.x) - Math.abs(m.y - m.x));
  for (const m of moved.slice(0, 3)) out.push(`${nameOf(m.pid)} ${m.x} → ${m.y} min`);
  if (moved.length > 3) out.push(`${plural(moved.length - 3, 'more minute target')}`);
  if (!same(a.closers, b.closers)) out.push('Closers');
  if (!same(a.restB2B, b.restB2B)) out.push('Rest on back-to-backs');
  if (!same(a.caps, b.caps)) out.push('Minute caps');
  return out;
}

/** "Ball-screen coverage: Drop → Ice · Starting: Okongwu for Capela": what a change moved, as the screens name it. */
export function editWords(a: TeamPart, b: TeamPart, nameOf: (pid: number) => string): string {
  const t = tacticsChanges(a.tactics, b.tactics, nameOf).map((c) => (c.from || c.to ? `${c.label}: ${c.from} → ${c.to}` : `${c.label} changes`));
  const r = rotationWords(a.rotation, b.rotation, nameOf);
  const all = [...t, ...r];
  if (!all.length) return 'Your tactics';
  return all.length > 4 ? `${all.slice(0, 3).join(' · ')} · ${plural(all.length - 3, 'more change')}` : all.join(' · ');
}

// ---------------------------------------------------------------- the ledger

const userPart = (league: League): TeamPart => {
  const t = league.teams[league.userTid];
  return { tactics: t.tactics, rotation: t.rotation };
};

/** The ledger, oldest first (an empty one for a save from before it, or one damaged). */
export const editsOf = (league: League): TacticEdit[] => (Array.isArray(league.tacticEdits) ? league.tacticEdits : []);

const isUsers = (league: League, g: ScheduledGame) => g.home === league.userTid || g.away === league.userTid;

/** The user's next `n` games on the schedule (none outside the season's games). */
export function gamesAhead(league: League, n = EDIT_AHEAD): ScheduledGame[] {
  if (league.phase !== 'preseason' && league.phase !== 'regular' && league.phase !== 'playin' && league.phase !== 'playoffs') return [];
  return league.schedule
    .filter((g) => !g.played && g.day >= league.day && isUsers(league, g))
    .sort((a, b) => a.day - b.day || a.gid - b.gid)
    .slice(0, n);
}

/** The user's games played since a change was made, in order (the season's: a new season starts it over). */
export function playedSince(league: League, e: TacticEdit): ScheduledGame[] {
  if (e.season !== league.season) return [];
  return league.schedule.filter((g) => g.played && g.day >= e.day && isUsers(league, g)).sort((a, b) => a.day - b.day || a.gid - b.gid);
}

/** Where a change was made, when it's recorded later (a sim started first): the team as it left it, the day and the games then ahead. */
export interface EditAt {
  now: TeamPart;
  day: number;
  ahead: number[];
}

/** The user's team as a change made now leaves it, today and the games ahead (what recordEdit reads by default). */
export const editAt = (league: League): EditAt => ({ now: structuredClone(userPart(league)), day: league.day, ahead: gamesAhead(league).map((g) => g.gid) });

/** `nameOf`, and for a player it doesn't know (one who has left the team since), his name from the league. */
const namesWith = (league: League, nameOf: (pid: number) => string) => (pid: number) => {
  const p = league.players[pid];
  return nameOf(pid) || (p ? playerName(p) : '');
};

/**
 * Record the user's change from `before` to his team as it is now (or as `at` says it was: null when
 * nothing moved). What his roster moves did meanwhile isn't his change and stays out. A second
 * change to the same setting on the same day as the last one, before a game, is the same change: the
 * two become one, measured again; a change to anything else is a change of its own, so the first
 * keeps its reading. Kept to EDITS_KEPT.
 */
export function recordEdit(league: League, before: TeamPart, nameOf: (pid: number) => string, at?: EditAt): TacticEdit | null {
  const { now, day, ahead } = at ?? { now: userPart(league), day: league.day, ahead: gamesAhead(league).map((g) => g.gid) };
  const on = new Set([...teamPlayers(league, league.userTid).map((p) => p.pid), ...now.rotation.order]);
  const diff = withoutRosterMoves(partDiff(before, now), on);
  if (!diff.length) return null;
  const name = namesWith(league, nameOf);
  const list = (league.tacticEdits = [...editsOf(league)]);
  const last = list[list.length - 1];
  // (no game of the user's between the two: one recorded later, after a sim, came before that day's game)
  if (last && !last.closed && !last.check && last.season === league.season && last.day === day && (at || !playedSince(league, last).length) && sameControl(last.diff, diff)) {
    const merged = compose(last.diff, diff);
    // (back where it started: nothing to measure any more)
    if (!merged.length) {
      list.pop();
      return null;
    }
    const e: TacticEdit = { id: last.id, season: league.season, day, what: editWords(setAll(now, merged, 1), now, name), diff: merged, ahead };
    list[list.length - 1] = e;
    return e;
  }
  const e: TacticEdit = { id: (last?.id ?? 0) + 1, season: league.season, day, what: editWords(setAll(now, diff, 1), now, name), diff, ahead };
  list.push(e);
  while (list.length > EDITS_KEPT) list.shift();
  return e;
}

/** A change's words leaked an empty name: a player who had left by then (saves from before withoutRosterMoves). */
const NAMELESS = /(?:^| · )\((?:role|shot freedom|defensive role|glass)\)/;

/**
 * A save from before roster moves stayed out of the ledger: a change recorded with a player who had
 * left in it ("(role): Playmaker → Auto · Depth order") loses what his leaving did, and goes if
 * that's all it was; the staff's note on it names him.
 */
export function cleanLeakedEdits(league: League, nameOf: (pid: number) => string) {
  const list = editsOf(league);
  if (!list.some((e) => NAMELESS.test(e.what))) return;
  const name = namesWith(league, nameOf);
  const now = userPart(league);
  const on = new Set([...teamPlayers(league, league.userTid).map((p) => p.pid), ...now.rotation.order]);
  const words = (diff: Diff) => {
    const b = setAll(now, diff, 2);
    return editWords(setAll(b, diff, 1), b, name);
  };
  league.tacticEdits = list.filter((e) => {
    if (!NAMELESS.test(e.what)) return true;
    // (the note's first setting, with the name it missed)
    const old = shortWhat(e);
    const named = words(e.diff)
      .split(' · ')
      .find((w) => w !== old && w.endsWith(old));
    if (named) for (const m of league.inbox) if (m.link === '/team/tactics/analysis' && m.body.startsWith(old)) m.body = named + m.body.slice(old.length);
    e.diff = withoutRosterMoves(e.diff, on);
    if (!e.diff.length) return false;
    e.what = words(e.diff);
    return true;
  });
}

// ---------------------------------------------------------------- measuring it

/** One of the user's games a measurement plays, its share of the stretch (identical games, the same opponent on the same floor, count as one). */
export interface PlannedGame {
  gid: number;
  opp: number;
  w: number;
}

export interface EditPlan {
  games: PlannedGame[];
  /** What each game plays besides the team as it stands: the change taken out ('without'), and for a change still being learned, the team knowing it ('drilled'). */
  changes: LeagueChange[];
  /** Paired games each configuration plays, per game. */
  perGame: number;
  /** The user's games it's over (identical ones counted each time). */
  count: number;
}

function planGames(league: League, list: ScheduledGame[]): PlannedGame[] {
  const me = league.userTid;
  const byKey = new Map<string, PlannedGame>();
  for (const g of list) {
    const opp = g.home === me ? g.away : g.home;
    const key = `${opp}:${g.home === me ? 'h' : 'a'}:${g.type}`;
    const cur = byKey.get(key);
    if (cur) cur.w += 1 / list.length;
    else byKey.set(key, { gid: g.gid, opp, w: 1 / list.length });
  }
  return [...byKey.values()];
}

/**
 * How to measure change `e` now: as it's made ('made': the games it was made before, the ones still
 * ahead, else the next ones) or on the games played since ('check'). Null when there's nothing to
 * play: no games, or none of its settings still in place (`replaced` then says so).
 */
export function editPlan(league: League, e: TacticEdit, kind: 'made' | 'check'): { plan?: EditPlan; replaced?: boolean } {
  const me = league.userTid;
  const team = league.teams[me];
  const roster = teamPlayers(league, me);
  const now = userPart(league);
  const back = putBack(now, e.diff, roster);
  if (!back.n) return { replaced: true };
  const byGid = new Map(league.schedule.map((g) => [g.gid, g]));
  let list: ScheduledGame[];
  if (kind === 'made') {
    const ahead = e.ahead.map((gid) => byGid.get(gid)).filter((g): g is ScheduledGame => !!g && !g.played);
    list = ahead.length ? ahead : gamesAhead(league);
  } else list = playedSince(league, e).slice(0, CHECK_MAX);
  if (!list.length) return {};
  const games = planGames(league, list);
  const [total, least] = kind === 'made' ? [EDIT_GAMES, EDIT_MIN_GAMES] : [CHECK_GAMES, CHECK_MIN_GAMES];
  const perGame = Math.max(least, Math.round(total / games.length));
  const fam = team.fam;
  const five = (r: Rotation) => roster.filter((p) => r.order.slice(0, 5).includes(p.pid));
  const without: LeagueChange = { id: 'without', teams: { [me]: { tactics: back.part.tactics, rotation: back.part.rotation } } };
  const changes: LeagueChange[] = [without];
  if (fam && kind === 'check') {
    // the old way known as well as the new one is now: the verdict is the change, not the drilling since
    without.teams![me].fam = drilledAs(fam, now.tactics, back.part.tactics, roster);
  } else if (fam) {
    const a = execution(fam, back.part.tactics, five(back.part.rotation));
    const b = execution(fam, now.tactics, five(now.rotation));
    if (Math.max(a.off - b.off, a.def - b.def) >= DRILL_GAP) changes.push({ id: 'drilled', teams: { [me]: { fam: drilledAs(fam, back.part.tactics, now.tactics, roster) } } });
  }
  return { plan: { games, changes, perGame, count: list.length } };
}

/** A game's readings from measureChanges, by change id. */
export type GameReadings = { w: number; worth: CounterWorth[] }[];

/**
 * A measurement's readings pooled into what the change is worth (the team as it stands against
 * 'without', so the sign is the change's), and for 'drilled', what it's worth once learned.
 */
export function readEdit(readings: GameReadings): { worth: CounterWorth; drilled?: CounterWorth } {
  const by = (id: string) => readings.map((r) => ({ w: r.w, x: r.worth.find((c) => c.id === id) }));
  const out = by('without').map(({ w, x }) => ({ w, raw: -(x?.raw ?? 0), se: x?.se ?? 0 }));
  const worth = poolWorth('edit', out);
  const d = by('drilled');
  if (!d.every((r) => r.x)) return { worth };
  // drilled against the old way: what the team gains knowing it, plus the change tonight (the two readings' errors added)
  const drilled = poolWorth(
    'drilled',
    d.map(({ w, x }, i) => ({ w, raw: x!.raw + out[i].raw, se: Math.hypot(x!.se, out[i].se) })),
  );
  return { worth, drilled };
}

/** Put a measurement as it's made on change `id` (still in the ledger). */
export function saveMade(league: League, id: number, r: ReturnType<typeof readEdit>, games: number) {
  const e = editsOf(league).find((x) => x.id === id);
  if (!e) return;
  const { pts, raw, se } = r.worth;
  e.worth = { pts, raw, se, games, ...(r.drilled && { drilled: { pts: r.drilled.pts, raw: r.drilled.raw, se: r.drilled.se } }) };
}

/** Changes still to measure as they were made, newest first. */
export const unmeasured = (league: League) =>
  editsOf(league)
    .filter((e) => !e.worth && !e.closed && e.season === league.season)
    .reverse();

/** Changes due their check: CHECK_AFTER of the user's games played since, not checked, not closed. */
export const checksDue = (league: League) => editsOf(league).filter((e) => e.worth && !e.check && !e.closed && playedSince(league, e).length >= CHECK_AFTER);

/**
 * Put a check on change `id`, and send the staff's note on it (once): the verdict, its number and the
 * games it's over, and for a change that cost, where to put it back.
 */
export function saveCheck(league: League, id: number, w: CounterWorth, games: number) {
  const e = editsOf(league).find((x) => x.id === id);
  if (!e) return;
  e.check = { pts: w.pts, raw: w.raw, se: w.se, games, day: league.day };
  if (e.told) return;
  e.told = true;
  const lead = leadAssistant(league);
  const call = worthCall(w);
  const n = Math.abs(w.pts).toFixed(1);
  const over = `the ${plural(games, 'game')} we've played since`;
  const body =
    call === 'gain'
      ? `I've measured your change on ${over}, each one replayed with it and without it: it's worth +${n} a game to us. It's working; I'd keep it.`
      : call === 'cost'
        ? `I've measured your change on ${over}, each one replayed with it and without it: it's cost us ${n} a game. Team → Tactics → Analysis has it, with a tap to put it back.`
        : `I've measured your change on ${over}, each one replayed with it and without it: it comes out within a few tenths of even, too close to say either way. Nothing to undo.`;
  addInbox(league, {
    from: `${lead.name}, lead assistant`,
    subject: `Since you changed it: ${call === 'gain' ? `it worked, +${n} a game` : call === 'cost' ? `it cost ${n} a game` : 'too close to say'}`,
    body: `${shortWhat(e)}${e.what.includes(' · ') ? ' and more' : ''}. ${body}`,
    link: '/team/tactics/analysis',
    tone: call === 'gain' ? 'good' : call === 'cost' ? 'bad' : 'neutral',
  });
}

/** The change's first setting, for a subject line ("Ball-screen coverage: Drop → Ice"). */
const shortWhat = (e: TacticEdit) => e.what.split(' · ')[0];

/** Mark change `id` closed (put back, or replaced). */
export function closeEdit(league: League, id: number, why: NonNullable<TacticEdit['closed']>) {
  const e = editsOf(league).find((x) => x.id === id);
  if (e) e.closed = why;
}

/** Put change `e`'s settings back on the user's team (the check's "want it back?"): the coach's call from then on. */
export function revertEdit(league: League, e: TacticEdit): boolean {
  const team = league.teams[league.userTid];
  const back = putBack(userPart(league), e.diff, teamPlayers(league, league.userTid));
  if (!back.n) return false;
  team.tactics = back.part.tactics;
  team.rotation = back.part.rotation;
  if (e.diff.some(([p]) => p.startsWith('tactics.'))) team.tactics.manual = true;
  if (e.diff.some(([p]) => p.startsWith('rotation.'))) team.rotation.manual = true;
  e.closed = 'reverted';
  e.closedDay = league.day;
  return true;
}

// ---------------------------------------------------------------- the lines

const ahead = (n: number) => (n === 1 ? 'your next game' : `your next ${['', 'one', 'two', 'three', 'four', 'five'][n] ?? n}`);

/**
 * The staff's line on a change as it's made: "This change: +1.2 a game over your next five
 * (measured)", "This change: even over your next five, too close to say", "This change costs 0.8 a
 * game over your next five (measured)". A change the team is still learning says too what it's worth
 * once drilled ("; +1.4 once drilled"): tonight's number includes the learning, which fades.
 */
export function madeLine(e: TacticEdit): string {
  const w = e.worth;
  if (!w) return 'The staff is measuring this change.';
  const call = worthCall(w);
  const n = Math.abs(w.pts).toFixed(1);
  const over = ahead(w.games);
  const head =
    call === 'gain'
      ? `This change: +${n} a game over ${over} (measured)`
      : call === 'cost'
        ? `This change costs ${n} a game over ${over} (measured)`
        : `This change: even over ${over}, too close to say`;
  const d = w.drilled;
  if (!d || d.pts - w.pts < 0.3) return head;
  const dc = worthCall(d);
  if (dc === 'even' && call === 'even') return head;
  const dn = Math.abs(d.pts).toFixed(1);
  return `${head}; ${dc === 'gain' ? `+${dn}` : dc === 'cost' ? `still −${dn}` : 'about even'} once drilled`;
}

const signedPts = (x: number) => `${x > 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`;

/** The same in a few words, for a row: "+1.2 a game over the next five", "Even over the next five, +0.9 once drilled". */
export function madeShort(e: TacticEdit): string {
  const w = e.worth;
  if (!w) return '';
  const over = w.games === 1 ? 'the next game' : `the next ${['', 'one', 'two', 'three', 'four', 'five'][w.games] ?? w.games}`;
  const call = worthCall(w);
  const head = call === 'even' ? `Even over ${over}` : `${signedPts(w.pts)} a game over ${over}`;
  const d = w.drilled;
  if (!d || d.pts - w.pts < 0.3 || (call === 'even' && worthCall(d) === 'even')) return head;
  return `${head}, ${worthCall(d) === 'even' ? 'even' : signedPts(d.pts)} once drilled`;
}

/** The check's verdict: "It worked: +0.9 a game over 12 games", "Too close to say over 12 games", "It cost: −0.6 a game over 12 games". */
export function checkLine(e: TacticEdit): string {
  const c = e.check;
  if (!c) return '';
  const call = worthCall(c);
  const n = Math.abs(c.pts).toFixed(1);
  const over = `over ${plural(c.games, 'game')}`;
  return call === 'gain' ? `It worked: +${n} a game ${over}` : call === 'cost' ? `It cost: −${n} a game ${over}` : `Too close to say: even ${over}`;
}

/** The call of a reading, for its tone. */
export const editCall = (w: Pick<CounterWorth, 'pts'> | undefined) => (w ? worthCall(w) : undefined);
