// The coaching carousel and coach histories. Every head coach the league has had is in its registry
// (League.coaches): his name, his profile (offensive and defensive roots, development, in-game
// adjustments) and his stints, one per job: the team, the season he took over and when it ended.
// His record is read from the teams' stored seasons, so the registry stays small (about 150 bytes a
// coach): a stint that began mid-season keeps the team's record that day (those games weren't his),
// one that ended mid-season the record then (nor were the games after), and a season's playoff run
// belongs to whoever had the team when its season was over.
//
// After the playoffs AI owners review their coaches (coachingCarousel): one with two full seasons
// behind him whose team fell short of what its roster should have done may be fired, more often on
// a bad team, and very rarely one after a strong season. Each opening goes to the best of a pool of
// former head coaches out of work (their records count: a recent title or Coach of the Year helps)
// and new candidates; the new coach brings his own profile and playbook. Coaches out of work for five
// seasons retire from the pool but stay in the history. The user is in the registry too, with a
// stint per job, and the carousel never touches his team. It draws on a random stream of its own,
// never the league's, so it doesn't shift any of the league's other draws.

import type { CoachProfile, League, Phase, TeamSeason } from '../types';
import { Rng, clamp, hashString } from '../random';
import { coachName, randomCoach } from '../teamFactory';
import { autoTactics } from '../ai/coachAI';
import { defaultTactics } from '../sim/tactics';
import { seasonLabel } from '../constants';
import { addNews, andList, teamPlayers, winPct } from './helpers';

/** One head-coaching job (CoachRecord.stints). */
export interface CoachStint {
  tid: number;
  /** The season he took over: the next one when he was hired after his team's season was over. */
  from: number;
  /** The team's record in `from` when he took over mid-season: those games weren't his. */
  at?: [number, number];
  /**
   * When it ended (absent while he's in charge): the season, the team's record then (the games after
   * weren't his), and `post` when the team's season was over, so its playoff run is his.
   */
  to?: { season: number; wl: [number, number]; post?: true };
}

/** A head coach (League.coaches), the user among them; the profile is CoachProfile's in short keys. */
export interface CoachRecord {
  id: number;
  name: string;
  off: string;
  def: string;
  dev: number;
  tac: number;
  /** The user's coach. */
  user?: true;
  /**
   * Names he went by before (the user's, renamed in Settings): no new coach is given one, and an
   * award that named him then (Coach of the Year goes by name) still finds him.
   */
  aka?: string[];
  stints: CoachStint[];
}

/** Full seasons in charge before an AI coach can be fired. */
export const FULL_SEASONS = 2;
/** Seasons out of work after which a former coach retires from the pool. */
export const RETIRE_AFTER = 5;
/** New candidates interviewed for each opening, besides the former head coaches out of work. */
const CANDIDATES = 2;
/** A shortfall against the roster's expected win% that counts as one step in an owner's review. */
const SHORTFALL = 0.08;

export const profileOf = (r: CoachRecord): CoachProfile => ({ name: r.name, offPhilosophy: r.off, defPhilosophy: r.def, development: r.dev, tactics: r.tac });

function newRecord(id: number, p: CoachProfile, user: boolean): CoachRecord {
  return { id, name: p.name, off: p.offPhilosophy, def: p.defPhilosophy, dev: p.development, tac: p.tactics, ...(user ? { user: true as const } : {}), stints: [] };
}

export const openStint = (r: CoachRecord) => r.stints.find((s) => !s.to);

/** The head coach in charge of a team now. */
export const activeCoach = (league: League, tid: number) => league.coaches?.find((r) => r.stints.some((s) => !s.to && s.tid === tid));

export const userCoach = (league: League) => league.coaches?.find((r) => r.user);

/** A head coach's name no other has had: a redraw, and once the 900 names wear thin over a long career, a middle initial. */
export function uniqueName(rng: Rng, taken: ReadonlySet<string>): string {
  for (let i = 0; i < 50; i++) {
    const n = coachName(rng);
    if (!taken.has(n)) return n;
  }
  for (;;) {
    const [first, last] = coachName(rng).split(/ (.+)/);
    const n = `${first} ${String.fromCharCode(65 + rng.int(0, 25))}. ${last}`;
    if (!taken.has(n)) return n;
  }
}

/**
 * Start the registry of a league that has none: every team's head coach in charge from the league's
 * first season, the user from the first season of his current job (a new league's first; a save from
 * before the registry knows no more). Such a save could have two coaches with one name: the later
 * team's gets a new one (from a stream of its own), since Coach of the Year history goes by name.
 */
export function seedCoaches(league: League) {
  if (league.coaches) return;
  const rng = new Rng(hashString(`${league.id}:coachNames`));
  const taken = new Set([league.coachName]);
  league.teams[league.userTid].coach.name = league.coachName;
  for (const t of league.teams) {
    if (t.tid === league.userTid) continue;
    if (taken.has(t.coach.name)) {
      const was = t.coach.name;
      t.coach.name = uniqueName(rng, taken);
      // a Coach of the Year he won with this team under the shared name stays his (before the registry, AI coaches never moved)
      for (const a of league.awards) if (a.coy === t.tid && a.coyCoach === was) a.coyCoach = t.coach.name;
    }
    taken.add(t.coach.name);
  }
  league.coaches = league.teams.map((t, id) => {
    const user = t.tid === league.userTid;
    const r = newRecord(id, t.coach, user);
    r.stints.push({ tid: t.tid, from: user ? (league.tenureStart ?? league.startSeason) : league.startSeason });
    return r;
  });
}

export function ensureCoaches(league: League) {
  seedCoaches(league);
  return league.coaches!;
}

// ---------------------------------------------------------------- stints

const OFFSEASON: ReadonlySet<Phase> = new Set<Phase>(['draftLottery', 'draft', 'resign', 'freeAgency']);

/** The team's season is over (the league's postseason is, or the team is out of it): its playoff run, if any, is settled. */
export function seasonOver(league: League, tid: number): boolean {
  if (OFFSEASON.has(league.phase) || league.awards.some((a) => a.season === league.season && a.champion !== undefined)) return true;
  const ts = league.teams[tid]?.seasons.find((s) => s.season === league.season);
  if (!ts) return false;
  if (league.phase === 'playin') return ts.playoffRound < 0;
  if (league.phase === 'playoffs') return ts.playoffRound < 1 || league.playoffs.some((s) => (s.high === tid || s.low === tid) && s.winner !== undefined && s.winner !== tid);
  return false;
}

const record = (s?: TeamSeason): [number, number] => [s?.won ?? 0, s?.lost ?? 0];

/** A job starting now: next season once the team's season is over, else this season, with the record so far when it has played. */
export function stintStart(league: League, tid: number): CoachStint {
  if (seasonOver(league, tid)) return { tid, from: league.season + 1 };
  const ts = league.teams[tid].seasons.find((s) => s.season === league.season);
  return ts && ts.won + ts.lost > 0 ? { tid, from: league.season, at: record(ts) } : { tid, from: league.season };
}

/** A job ending now: this season with the record so far (and its playoff run once the team's season is over), or before the team's first game, last season. */
export function stintEnd(league: League, tid: number): NonNullable<CoachStint['to']> {
  const seasons = league.teams[tid].seasons;
  const ts = seasons.find((s) => s.season === league.season);
  if (seasonOver(league, tid)) return { season: league.season, wl: record(ts), post: true };
  const prev = seasons.find((s) => s.season === league.season - 1);
  if (!(ts && ts.won + ts.lost > 0) && prev) return { season: prev.season, wl: record(prev), post: true };
  return { season: league.season, wl: record(ts) };
}

/** End a coach's job with a team; one he left before coaching a game in it leaves nothing to remember. */
function endStint(league: League, r: CoachRecord, tid: number) {
  const s = r.stints.find((x) => !x.to && x.tid === tid);
  if (!s) return;
  s.to = stintEnd(league, tid);
  if (!stintSeasons(league, s).length) r.stints.splice(r.stints.indexOf(s), 1);
}

/** A coach takes charge of a team: its `coach` becomes his, and its playbook his own, fit to the roster as an AI staff does (see takeOverTeam). */
function install(league: League, tid: number, r: CoachRecord) {
  const t = league.teams[tid];
  t.coach = profileOf(r);
  t.tactics = autoTactics({ ...t, tactics: defaultTactics(r.off, r.def) }, teamPlayers(league, tid), false);
}

/**
 * The user takes over another team (see takeOverTeam): his job with the old team ends and one with the
 * new team starts, and the coach he displaces takes the old job. Taken over after the team's season,
 * the new jobs start with the next one.
 */
export function swapJobs(league: League, from: number, to: number) {
  if (from === to) return;
  const reg = ensureCoaches(league);
  const me = reg.find((r) => r.user);
  const them = activeCoach(league, to);
  if (me) {
    endStint(league, me, from);
    me.stints.push(stintStart(league, to));
  }
  if (them && them !== me) {
    endStint(league, them, to);
    them.stints.push(stintStart(league, from));
  }
}

/** Another coach in the league's history has had this name (the user can't take it). Reads the league only. */
export function coachNameTaken(league: League, name: string): boolean {
  return league.coaches
    ? league.coaches.some((r) => !r.user && (r.name === name || !!r.aka?.includes(name)))
    : league.teams.some((t) => t.tid !== league.userTid && t.coach.name === name);
}

/**
 * The user's new name (Settings): his team's coach and his registry entry take it, and the old one
 * is kept with his entry (see CoachRecord.aka). A name another coach has had is refused (false).
 */
export function renameUserCoach(league: League, name: string): boolean {
  ensureCoaches(league);
  if (coachNameTaken(league, name)) return false;
  const me = userCoach(league);
  if (me && me.name !== name) {
    const aka = [...(me.aka ?? []).filter((n) => n !== name), me.name];
    me.aka = aka;
    me.name = name;
  }
  league.coachName = name;
  league.teams[league.userTid].coach.name = name;
  return true;
}

// ---------------------------------------------------------------- records

/** One season of a job: the team's record while he had it, and the playoff round reached when the run was his (−1 none, 1-4 the round, 5 champion). */
export interface CoachSeason {
  season: number;
  tid: number;
  won: number;
  lost: number;
  round?: number;
  /** He had the team for part of the regular season only. */
  part?: true;
}

/** The seasons of a job he coached a game in (or whose playoff run was his), oldest first. */
export function stintSeasons(league: League, s: CoachStint): CoachSeason[] {
  const team = league.teams[s.tid];
  if (!team) return [];
  const last = s.to?.season ?? league.season;
  const out: CoachSeason[] = [];
  for (const ts of team.seasons) {
    if (ts.season < s.from || ts.season > last) continue;
    const ends = s.to?.season === ts.season;
    let [won, lost] = ends ? s.to!.wl : record(ts);
    let part = won + lost < ts.won + ts.lost;
    if (ts.season === s.from && s.at) {
      won = Math.max(0, won - s.at[0]);
      lost = Math.max(0, lost - s.at[1]);
      part ||= s.at[0] + s.at[1] > 0;
    }
    const run = !ends || !!s.to!.post;
    if (won + lost === 0 && !(run && ts.playoffRound >= 1)) continue;
    out.push({ season: ts.season, tid: s.tid, won, lost, ...(run ? { round: ts.playoffRound } : {}), ...(part ? { part: true as const } : {}) });
  }
  return out.sort((a, b) => a.season - b.season);
}

/** A record over some seasons: regular-season W-L, playoff appearances, the best round reached (−1 none, 5 a title) and titles. */
export interface CoachTotals {
  lines: CoachSeason[];
  won: number;
  lost: number;
  playoffs: number;
  best: number;
  titles: number;
}

function totals(lines: CoachSeason[]): CoachTotals {
  const rounds = lines.map((l) => l.round ?? -1);
  return {
    lines,
    won: lines.reduce((a, l) => a + l.won, 0),
    lost: lines.reduce((a, l) => a + l.lost, 0),
    playoffs: rounds.filter((r) => r >= 1).length,
    best: Math.max(-1, ...rounds),
    titles: rounds.filter((r) => r === 5).length,
  };
}

export const stintTotals = (league: League, s: CoachStint): CoachTotals & { stint: CoachStint } => ({ stint: s, ...totals(stintSeasons(league, s)) });

export interface CoachCareer extends CoachTotals {
  stints: (CoachTotals & { stint: CoachStint })[];
  /** Seasons coached: one split between two jobs counts once. */
  seasons: number;
  /** The seasons he was Coach of the Year. */
  coy: number[];
}

export function coachCareer(league: League, r: CoachRecord, coy = coyWinners(league)): CoachCareer {
  const stints = r.stints.map((s) => stintTotals(league, s));
  const lines = stints.flatMap((s) => s.lines).sort((a, b) => a.season - b.season);
  return {
    ...totals(lines),
    stints,
    seasons: new Set(lines.map((l) => l.season)).size,
    coy: [...coy].filter(([, id]) => id === r.id).map(([season]) => season),
  };
}

/** The stint had its team when that season's regular season ended (when Coach of the Year is voted). */
function atSeasonEnd(league: League, s: CoachStint, season: number): boolean {
  const ts = league.teams[s.tid]?.seasons.find((x) => x.season === season);
  if (!ts || s.from > season || (s.to && s.to.season < season)) return false;
  const games = ts.won + ts.lost;
  if (s.from === season && s.at && s.at[0] + s.at[1] >= games) return false;
  return !s.to || s.to.season > season || !!s.to.post || s.to.wl[0] + s.to.wl[1] >= games;
}

/**
 * Who won each Coach of the Year (season -> coach id): the coach the award names (SeasonAwards.coyCoach,
 * his name then), preferring one who had that team; for a coach renamed since, or a save from before the
 * name was kept, whoever had the team when the regular season ended.
 */
export function coyWinners(league: League): Map<number, number> {
  const reg = league.coaches ?? [];
  const out = new Map<number, number>();
  for (const a of league.awards) {
    const tid = a.coy;
    if (tid === undefined) continue;
    const had = (r: CoachRecord) => r.stints.some((s) => s.tid === tid && atSeasonEnd(league, s, a.season));
    const named = reg.filter((r) => r.name === a.coyCoach || (a.coyCoach !== undefined && !!r.aka?.includes(a.coyCoach)));
    const w = named.find(had) ?? named[0] ?? reg.find(had);
    if (w) out.set(a.season, w.id);
  }
  return out;
}

/** Where a coach stands: in charge of a team, out of work and in the pool, or retired (out of work RETIRE_AFTER seasons). */
export function coachStatus(league: League, r: CoachRecord): 'active' | 'available' | 'retired' {
  if (openStint(r)) return 'active';
  const last = Math.max(-Infinity, ...r.stints.map((s) => s.to!.season));
  return league.season - last < RETIRE_AFTER ? 'available' : 'retired';
}

/** What's wrong with the registry (empty when it's sound): one open job per team, held by its coach, one user with his team, unique names. */
export function registryProblems(league: League): string[] {
  const reg = league.coaches;
  if (!reg) return ['no coach registry'];
  const out: string[] = [];
  const ids = new Set<number>();
  const names = new Set<string>();
  for (const r of reg) {
    if (ids.has(r.id)) out.push(`coach id ${r.id} twice`);
    if (names.has(r.name)) out.push(`two coaches named ${r.name}`);
    ids.add(r.id);
    names.add(r.name);
    if (r.stints.filter((s) => !s.to).length > 1) out.push(`${r.name} has two jobs`);
    if (r.stints.some((s) => !league.teams[s.tid] || (s.to && s.to.season < s.from))) out.push(`${r.name} has a job out of shape`);
  }
  const users = reg.filter((r) => r.user);
  if (users.length !== 1) out.push(`${users.length} user coaches`);
  else if (users[0].name !== league.coachName || openStint(users[0])?.tid !== league.userTid) out.push(`the user's entry (${users[0].name}) isn't in charge of his team`);
  for (const t of league.teams) {
    const held = reg.filter((r) => r.stints.some((s) => !s.to && s.tid === t.tid));
    if (held.length !== 1) out.push(`${t.abbrev} has ${held.length} head coaches`);
    else {
      const c = t.coach;
      const r = held[0];
      if (r.name !== c.name || r.off !== c.offPhilosophy || r.def !== c.defPhilosophy || r.dev !== c.development || r.tac !== c.tactics)
        out.push(`${t.abbrev}'s coach isn't ${r.name}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- the carousel

/**
 * How far each team's win% fell short of (negative) or beat what its roster should have done in a
 * season: the league's least-squares line of win% on the minutes-weighted OVR of the players who
 * played for it (their rating that season), so the injuries and trades it had count in what was
 * expected of it.
 */
export function rosterResiduals(league: League, season: number): Map<number, number> {
  const acc = league.teams.map(() => ({ sum: 0, min: 0 }));
  for (const p of Object.values(league.players))
    for (const s of p.stats) {
      if (s.season !== season || s.playoffs || s.real || !(s.min > 0) || !acc[s.tid]) continue;
      const ovr = p.ratingsHistory.find((h) => h.season === season)?.ovr ?? p.ovr;
      acc[s.tid].sum += ovr * s.min;
      acc[s.tid].min += s.min;
    }
  const rows = league.teams.flatMap((t) => {
    const ts = t.seasons.find((x) => x.season === season);
    return ts && ts.won + ts.lost > 0 && acc[t.tid].min > 0 ? [{ tid: t.tid, x: acc[t.tid].sum / acc[t.tid].min, y: winPct(ts) }] : [];
  });
  const out = new Map<number, number>();
  if (rows.length < 3) return out;
  const mx = rows.reduce((a, r) => a + r.x, 0) / rows.length;
  const my = rows.reduce((a, r) => a + r.y, 0) / rows.length;
  const vx = rows.reduce((a, r) => a + (r.x - mx) ** 2, 0);
  const b = vx > 0 ? rows.reduce((a, r) => a + (r.x - mx) * (r.y - my), 0) / vx : 0;
  for (const r of rows) out.set(r.tid, r.y - (my + b * (r.x - mx)));
  return out;
}

/**
 * The chance an AI coach is fired after this season's playoffs. None before two full seasons in
 * charge (the league's first coaches came with jobs they already had, so one is enough for them, at
 * half the odds: otherwise the whole league comes up for review at once); then a logistic in how far
 * his team fell short of its roster over the last season or two (the last counting 60%; each 0.08 of
 * win% is a step) and how far it finished under .400. A contender out by the first round wanted
 * more; a title in the last three seasons buys time. After a strong season (.600, or the conference
 * finals) it's 0.5 to 2.5%.
 */
export function firingOdds(league: League, r: CoachRecord, resid: (season: number) => Map<number, number>): number {
  const s = openStint(r);
  if (!s || r.user || s.tid === league.userTid) return 0;
  const season = league.season;
  const lines = stintSeasons(league, s);
  const cur = lines.find((l) => l.season === season);
  if (!cur || cur.won + cur.lost === 0) return 0;
  const whole = lines.filter((l) => !l.part);
  const first = whole.length < FULL_SEASONS;
  if (first && !(s.from === league.startSeason && !s.at && whole.length + 1 >= FULL_SEASONS)) return 0;
  const wp = cur.won / (cur.won + cur.lost);
  const now = resid(season).get(s.tid) ?? 0;
  const before = whole.some((l) => l.season === season - 1) ? resid(season - 1).get(s.tid) : undefined;
  const short = -(before === undefined ? now : 0.6 * now + 0.4 * before) / SHORTFALL;
  const round = cur.round ?? -1;
  let logit = -1.9 + short + 10 * Math.max(0, 0.4 - wp);
  if (league.teams[s.tid].strategy === 'contend' && round <= 1) logit += 0.5;
  if (lines.some((l) => l.round === 5 && l.season >= season - 2)) logit -= 2;
  const p = (first ? 0.5 : 1) / (1 + Math.exp(-logit));
  return wp >= 0.6 || round >= 3 ? clamp(p, 0.005, 0.025) : p;
}

/** How a former head coach's record reads in the news: his titles, a Coach of the Year, or his record and teams. */
function resume(league: League, k: CoachCareer): string {
  const teams = (tids: number[]) => andList([...new Set(tids)].map((tid) => league.teams[tid].abbrev));
  if (k.titles) return `${k.titles} title${k.titles > 1 ? 's' : ''} with ${teams(k.lines.filter((l) => l.round === 5).map((l) => l.tid))}`;
  const rec = `${k.won}-${k.lost} in ${k.seasons} season${k.seasons === 1 ? '' : 's'} with ${teams(k.lines.map((l) => l.tid))}`;
  return k.coy.length ? `Coach of the Year in ${seasonLabel(k.coy[k.coy.length - 1])}, ${rec}` : rec;
}

/** A candidate for an opening: a former head coach (his record) or a new one. */
interface Candidate {
  profile: CoachProfile;
  rec?: CoachRecord;
  career?: CoachCareer;
}

/**
 * How much an owner likes a candidate (plus some noise). A new one is judged on his development and
 * adjustments ratings (his name as an assistant); a former head coach mostly on his record (shrunk
 * toward .450 by a season of games), titles, Coaches of the Year and playoff runs of the last six
 * seasons, with a little for experience (more to a contender) and less for one fired this summer. A
 * rebuilding team gives a first-timer a little more of a look.
 */
function hireScore(league: League, tid: number, c: Candidate, firedNow: boolean, rng: Rng): number {
  const strategy = league.teams[tid].strategy;
  const k = c.career;
  let s = (((c.profile.development + c.profile.tactics) / 2 - 60) / 12.5) * (k ? 0.25 : 0.5);
  if (k) {
    const recent = k.lines.filter((l) => l.season > league.season - 6);
    s += ((k.won + 0.45 * 82) / (k.won + k.lost + 82) - 0.5) * 10 + 0.25;
    s += 0.7 * Math.min(2, recent.filter((l) => l.round === 5).length);
    s += 0.4 * Math.min(2, k.coy.filter((y) => y > league.season - 6).length);
    s += 0.1 * Math.min(4, recent.filter((l) => (l.round ?? -1) >= 1).length);
    if (strategy === 'contend') s += 0.3;
    if (firedNow) s -= 0.3;
  } else if (strategy === 'rebuild') s += 0.2;
  return s + rng.normal(0, 0.45);
}

export interface CarouselMoves {
  fired: { tid: number; coach: number }[];
  hired: { tid: number; coach: number; first: boolean }[];
}

/**
 * The coaching carousel, after the playoffs (and the owner's review of the user): AI owners fire the
 * coaches who fell short (see firingOdds) and hire their replacements for next season from former
 * head coaches out of work and new candidates (see hireScore), the better jobs (by this season's
 * record) choosing first. Every firing and hiring makes the news. The user's team is left alone.
 */
export function coachingCarousel(league: League): CarouselMoves {
  const reg = ensureCoaches(league);
  const season = league.season;
  const rng = new Rng(hashString(`${league.id}:${season}:coaching`));
  const fits = new Map<number, Map<number, number>>();
  const resid = (s: number) => {
    if (!fits.has(s)) fits.set(s, rosterResiduals(league, s));
    return fits.get(s)!;
  };
  const moves: CarouselMoves = { fired: [], hired: [] };
  for (const t of league.teams) {
    if (t.tid === league.userTid) continue;
    const r = activeCoach(league, t.tid);
    if (!r || r.user) continue;
    const odds = firingOdds(league, r, resid);
    if (!(odds > 0 && rng.chance(odds))) continue;
    const s = openStint(r)!;
    s.to = stintEnd(league, t.tid);
    const k = stintTotals(league, s);
    const n = k.lines.length;
    const last = k.lines[n - 1];
    const tenure = `${n} season${n === 1 ? '' : 's'}`;
    const text =
      last && last.won >= 0.6 * (last.won + last.lost)
        ? `The ${t.name} parted ways with ${r.name} after a ${last.won}-${last.lost} season (${tenure}, ${k.won}-${k.lost}).`
        : `The ${t.name} fired ${r.name} after ${tenure} (${k.won}-${k.lost}).`;
    addNews(league, { kind: 'coach', text, tids: [t.tid], pids: [] });
    moves.fired.push({ tid: t.tid, coach: r.id });
  }
  if (!moves.fired.length) return moves;
  const coy = coyWinners(league);
  // (the user's former names too: an award that named him then must still find him)
  const taken = new Set(reg.flatMap((r) => [r.name, ...(r.aka ?? [])]));
  const fresh: CoachProfile[] = [];
  for (let i = 0; i < moves.fired.length * CANDIDATES; i++) {
    const p = randomCoach(rng);
    p.name = uniqueName(rng, taken);
    taken.add(p.name);
    fresh.push(p);
  }
  const firedNow = new Set(moves.fired.map((f) => f.coach));
  const pct = (tid: number) => {
    const ts = league.teams[tid].seasons.find((x) => x.season === season);
    return ts ? winPct(ts) : 0;
  };
  const jobs = [...moves.fired].sort((a, b) => pct(b.tid) - pct(a.tid) || a.tid - b.tid);
  let nextId = Math.max(-1, ...reg.map((r) => r.id)) + 1;
  for (const job of jobs) {
    const pool: Candidate[] = [
      ...reg
        .filter((r) => r.id !== job.coach && !r.user && coachStatus(league, r) === 'available')
        .map((r) => ({ profile: profileOf(r), rec: r, career: coachCareer(league, r, coy) })),
      ...fresh.map((profile) => ({ profile })),
    ];
    let best = pool[0];
    let top = -Infinity;
    for (const c of pool) {
      const score = hireScore(league, job.tid, c, !!c.rec && firedNow.has(c.rec.id), rng);
      if (score > top) [best, top] = [c, score];
    }
    let r = best.rec;
    if (!r) {
      r = newRecord(nextId++, best.profile, false);
      reg.push(r);
      fresh.splice(fresh.indexOf(best.profile), 1);
    }
    r.stints.push({ tid: job.tid, from: season + 1 });
    install(league, job.tid, r);
    const t = league.teams[job.tid];
    addNews(league, { kind: 'coach', text: `The ${t.name} hired ${r.name}, ${best.career ? resume(league, best.career) : 'a first-time head coach'}.`, tids: [job.tid], pids: [] });
    moves.hired.push({ tid: job.tid, coach: r.id, first: !best.rec });
  }
  return moves;
}
