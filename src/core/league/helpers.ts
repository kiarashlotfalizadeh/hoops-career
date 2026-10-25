import type { InboxMessage, League, NewsItem, Player, PlayerStats, Team, TeamSeason } from '../types';
import { DRAFT_PROSPECT, FREE_AGENT } from '../types';
import { CAP } from '../constants';
import { blankStats, playerAge, salaryFor } from '../playerGen';
import { Rng } from '../random';
import { newTeamSeason } from '../teamFactory';

export function withRng<T>(league: League, fn: (rng: Rng) => T): T {
  const rng = new Rng(league.rng);
  const out = fn(rng);
  league.rng = rng.state;
  return out;
}

export function teamPlayers(league: League, tid: number): Player[] {
  const out: Player[] = [];
  for (const p of Object.values(league.players)) if (p.tid === tid) out.push(p);
  return out;
}

/** Players holding one of the 15 standard roster spots (two-way deals sit outside them). */
export function standardRoster(league: League, tid: number): Player[] {
  return teamPlayers(league, tid).filter((p) => !p.contract.twoWay);
}

export function twoWayRoster(league: League, tid: number): Player[] {
  return teamPlayers(league, tid).filter((p) => p.contract.twoWay);
}

/** Two-way slots per team. */
export const TWO_WAY_MAX = 3;
/** Standard roster limit between seasons (camp bodies, draftees); 15 applies from opening night. */
export const OFFSEASON_ROSTER_MAX = 21;

export function inSeason(league: League): boolean {
  return league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs';
}

/** Standard roster limit right now. */
export function rosterMaxNow(league: League): number {
  return inSeason(league) ? CAP.rosterMax : OFFSEASON_ROSTER_MAX;
}

/** Free agents who can be signed: a player still on waivers can only be claimed (see resolveWaivers). */
export function freeAgents(league: League): Player[] {
  return Object.values(league.players).filter((p) => p.tid === FREE_AGENT && !p.waivers);
}

export function prospects(league: League, year?: number): Player[] {
  return Object.values(league.players).filter((p) => p.tid === DRAFT_PROSPECT && (year === undefined || p.draft.year === year));
}

export function age(league: League, p: Player) {
  return playerAge(p, league.season);
}

export function teamSeason(team: Team, season: number): TeamSeason {
  let ts = team.seasons.find((s) => s.season === season);
  if (!ts) {
    ts = newTeamSeason(season, team.pop);
    team.seasons.push(ts);
  }
  return ts;
}

export function curTeamSeason(league: League, tid: number): TeamSeason {
  return teamSeason(league.teams[tid], league.season);
}

/** Cap payroll: two-way deals are paid but don't count against the cap or tax. */
export function payroll(league: League, tid: number, season = league.season): number {
  let total = 0;
  for (const p of Object.values(league.players)) if (p.tid === tid && !p.contract.twoWay) total += salaryFor(p, season);
  for (const d of league.teams[tid].deadMoney) if (d.season === season) total += d.amount;
  return total;
}

/** Season new contracts and offseason payroll refer to (next season during the offseason). */
export function contractSeason(league: League): number {
  return league.phase === 'draftLottery' || league.phase === 'draft' || league.phase === 'resign' || league.phase === 'freeAgency' ? league.season + 1 : league.season;
}

/**
 * League money grows with the cap: revenues, ticket prices, costs and the owner's expectations
 * are quoted in first-season dollars and multiplied by this (1 in the league's first season).
 */
export function revenueScale(league: League, season = league.season) {
  return Math.pow(1 + CAP.growth, Math.max(0, season - league.startSeason));
}

/** Cap figures grow each season from the 2026-27 baseline. */
export function CAP_FOR(league: League, season = league.season) {
  const g = revenueScale(league, season);
  return {
    salaryCap: Math.round(CAP.salaryCap * g),
    luxuryTax: Math.round(CAP.luxuryTax * g),
    firstApron: Math.round(CAP.firstApron * g),
    secondApron: Math.round(CAP.secondApron * g),
    minPayroll: Math.round(CAP.minPayroll * g),
    minContract: Math.round(CAP.minContract * g),
    vetMin: Math.round(CAP.vetMinContract * g),
    maxContract: (exp: number) => Math.round(CAP.salaryCap * g * CAP.maxPct(exp)),
  };
}

export function statsLine(p: Player, season: number, tid: number, playoffs: boolean): PlayerStats {
  for (let i = p.stats.length - 1; i >= 0; i--) {
    const s = p.stats[i];
    if (s.season === season && s.tid === tid && s.playoffs === playoffs && !s.real) return s;
  }
  const s = blankStats(season, tid, playoffs);
  p.stats.push(s);
  return s;
}

/** Combined (all teams) stats for a season: the regular season, or with `playoffs` the postseason (play-in included). */
export function seasonTotals(p: Player, season: number, playoffs = false): PlayerStats | null {
  const rows = p.stats.filter((s) => s.season === season && s.playoffs === playoffs);
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];
  const t = blankStats(season, rows[rows.length - 1].tid, playoffs);
  for (const r of rows) {
    for (const k of Object.keys(t) as (keyof PlayerStats)[]) {
      const v = r[k];
      if (typeof v === 'number' && k !== 'season' && k !== 'tid') (t as unknown as Record<string, number>)[k] += v;
    }
  }
  t.real = rows[0].real;
  return t;
}

type Adv = NonNullable<PlayerStats['adv']>;

/**
 * A season's totals across all his teams, imported advanced numbers included: a player traded
 * during a real season has a row per team, and adding the rows up dropped them (his usage read
 * 0.0, and his page showed his first team's PER, BPM and win shares as the season's).
 */
export function seasonLine(p: Player, season: number, playoffs = false): PlayerStats | null {
  const t = seasonTotals(p, season, playoffs);
  if (!t || t.adv) return t;
  const rows = p.stats.filter((s) => s.season === season && s.playoffs === playoffs && s.adv);
  if (!rows.length) return t;
  // rates by minutes played, counts added up
  const min = rows.reduce((a, r) => a + r.min, 0);
  const rate = (k: keyof Adv) => rows.reduce((a, r) => a + r.adv![k] * r.min, 0) / Math.max(1e-9, min);
  const sum = (k: keyof Adv) => rows.reduce((a, r) => a + r.adv![k], 0);
  const keys: (keyof Adv)[] = ['per', 'ts', 'usg', 'astPct', 'trbPct', 'stlPct', 'blkPct', 'tovPct', 'obpm', 'dbpm', 'bpm'];
  const adv = Object.fromEntries(keys.map((k) => [k, rate(k)])) as Adv;
  adv.ws = sum('ws');
  adv.vorp = sum('vorp');
  adv.ws48 = min ? (adv.ws * 48) / min : 0;
  return { ...t, adv };
}

/**
 * The team he finished a season with: the team of his last line of it (the regular season's, or with
 * `playoffs` the postseason's), or null without one. Award records carry only the season, so this is
 * the team an award was won with.
 */
export function seasonTid(p: Player, season: number, playoffs = false): number | null {
  for (let i = p.stats.length - 1; i >= 0; i--) {
    const s = p.stats[i];
    if (s.season === season && s.playoffs === playoffs) return s.tid;
  }
  return null;
}

/** News items the save keeps, and how many of the latest routine ones always stay. */
const NEWS_MAX = 600;
const ROUTINE_KEEP = 150;
/** Routine: injuries, big games, records and briefs on games; a story (weight 2 or more) never is. */
const routineNews = (n: NewsItem) => (n.weight ?? 1) < 2 && (n.kind === 'injury' || n.kind === 'milestone' || n.kind === 'record' || n.kind === 'game');

/**
 * Add a news item. Over the limit the oldest routine item goes first (injuries, big games and game
 * briefs: there are hundreds a season), so stories, trades, signings and the season's results stay
 * a year; the latest routine ones always show too.
 */
export function addNews(league: League, n: Omit<NewsItem, 'id' | 'season' | 'day'>) {
  league.news.push({ id: league.nextMsgId++, season: league.season, day: league.day, ...n });
  while (league.news.length > NEWS_MAX) {
    const routine = league.news.filter(routineNews).length > ROUTINE_KEEP;
    league.news.splice(
      league.news.findIndex((x) => routineNews(x) === routine),
      1,
    );
  }
}

export function addInbox(league: League, m: Omit<InboxMessage, 'id' | 'season' | 'day' | 'read'>) {
  league.inbox.unshift({ id: league.nextMsgId++, season: league.season, day: league.day, read: false, ...m });
  if (league.inbox.length > 150) league.inbox.length = 150;
}

/** A list for running text: "A", "A and B", "A, B and C". */
export function andList(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : (items[0] ?? '');
}

/** A sentence with its closing period, unless it already ends a sentence (a protected pick's "top-10 prot."). */
export const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/**
 * A team's box-score minutes as whole numbers that still add up to the team's total (240, plus 25
 * per overtime): rounded down, then the leftover minutes go to the largest remainders.
 */
export function wholeMinutes(players: { pid: number; min: number }[]): (pid: number) => number {
  const total = Math.round(players.reduce((a, p) => a + p.min, 0));
  const out = new Map(players.map((p) => [p.pid, Math.floor(p.min)]));
  let left = total - [...out.values()].reduce((a, b) => a + b, 0);
  for (const p of [...players].sort((a, b) => (b.min % 1) - (a.min % 1))) {
    if (left <= 0) break;
    out.set(p.pid, out.get(p.pid)! + 1);
    left--;
  }
  return (pid) => out.get(pid) ?? 0;
}

export function playerName(p: Player) {
  return `${p.firstName} ${p.lastName}`.trim();
}

/**
 * His last name, or his full name when a teammate shares it ("Jalen Williams" on a team with Jaylin
 * and Kenrich): for a line of text that names one player.
 */
export function shortName(league: League, p: Player): string {
  const twin = Object.values(league.players).some((o) => o.pid !== p.pid && o.tid === p.tid && o.lastName === p.lastName);
  return twin ? playerName(p) : p.lastName;
}

export function teamName(t: Team) {
  return `${t.region} ${t.name}`;
}

export function rosterSorted(league: League, tid: number): Player[] {
  const team = league.teams[tid];
  const idx = new Map(team.rotation.order.map((pid, i) => [pid, i]));
  return teamPlayers(league, tid).sort((a, b) => (idx.get(a.pid) ?? 100 - a.ovr / 100) - (idx.get(b.pid) ?? 100 - b.ovr / 100));
}

export function winPct(ts: TeamSeason) {
  const g = ts.won + ts.lost;
  return g ? ts.won / g : 0;
}

/** Calendar date for a season day (day 0 = Oct 20 of the season's first year). */
export function dayToDate(season: number, day: number): Date {
  const d = new Date(Date.UTC(season - 1, 9, 20));
  d.setUTCDate(d.getUTCDate() + day);
  return d;
}

/** Season day of a date (month 0-based): October to December in the season's first year, other months in its second. */
export function dateToDay(season: number, month: number, date: number): number {
  return Math.round((Date.UTC(month >= 9 ? season - 1 : season, month, date) - Date.UTC(season - 1, 9, 20)) / 86_400_000);
}

export function fmtDate(season: number, day: number, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  return dayToDate(season, day).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}
