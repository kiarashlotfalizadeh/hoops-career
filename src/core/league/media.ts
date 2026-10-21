// The league's press: power rankings, weekly and monthly honors, the season's predictions,
// columns on trades and starts, and the stories of other teams' big games (see world.ts). The
// writing lives in media/*: nights.ts (other teams' games and the nightly roundup), power.ts,
// honors.ts, preseason.ts, columns.ts (trade grades, signings, the season's columns, the
// playoffs' previews, the wrap) and voice.ts (names, figures and phrasing). Nothing here draws from
// the league's random stream, and nothing the press writes feeds back into a game, a trade or a
// signing: the league plays out exactly as it would without it.
import type { League, NewsItem, ScheduledGame } from '../types';
import { pressGame, roundup, ROUNDUP } from './media/nights';
import { powerRankings } from './media/power';
import { monthlyHonors, playersOfTheWeek } from './media/honors';
import { seasonPreview } from './media/preseason';
import { midseasonColumn, moveColumns, playoffPreviews, seasonWrap, surprisesColumn } from './media/columns';
import { aboutUser } from './media/voice';

/**
 * A weekly or monthly honor, by conference where the league names two: Player of the Week, Player,
 * Rookie and Coach of the Month. A coach's honor names his team (`tid`) and no player.
 */
export interface Honor {
  season: number;
  /** The day it was announced. */
  day: number;
  kind: 'potw' | 'potm' | 'rotm' | 'cotm';
  conf?: 'E' | 'W';
  tid: number;
  pid?: number;
  /** Why, in one line ("31.5 points a game as the Knicks went 4-0"). */
  line: string;
}

/** One team in a week's power rankings. */
export interface PowerRow {
  tid: number;
  rank: number;
  /** Last week's rank, if there was one. */
  prev?: number;
  /** The press's line on them. */
  blurb: string;
  /** The record when they were published (absent in rankings from before it was kept). */
  w?: number;
  l?: number;
}

export interface MediaState {
  /** This season's and last season's honors, oldest first (the user's coach honors are kept for good by legacy.ts). */
  honors?: Honor[];
  /** The latest power rankings. */
  power?: { season: number; day: number; rows: PowerRow[] };
  /**
   * What the press predicted on opening night: each team's projected wins and conference rank, the
   * pick to win it all and the MVP favourites (pids, the favourite first).
   */
  preseason?: { season: number; rows: { tid: number; wins: number; confRank: number }[]; champ?: number; mvp?: number[] };
  /** Each team's streak after its last regular-season game, by tid: what it carries into the next (a streak snapped is read from it). */
  streaks?: { season: number; s: number[] };
  /** The last transaction the columns have read (its id). */
  txn?: number;
  /** The monthly honors' window: the first day of the month not yet honored, and whether the season's last went out. */
  month?: { season: number; from: number; done?: true };
  /** This season's one-off columns already run ('surprises', 'midseason', 'r1'..'r4', 'wrap'). */
  done?: { season: number; keys: string[] };
  /** The day (season × 1000 + day) the last nightly roundup covered. */
  roundup?: number;
  /** Phrasings used lately ("key:index"), so the next story reaches for another. */
  recent?: string[];
}

/** Stories that keep their bodies; older ones keep their headline and dek. */
export const BODIES_KEPT = 80;
/** Days a nightly roundup stays in the news. */
const ROUNDUP_DAYS = 14;
/** Weekly items kept in the news (the latest of them): power rankings, players of the week. */
const POWER_KEPT = 8;
const WEEKLY_HONORS_KEPT = 10;

/** The latest power rankings, if this season has had any. */
export function latestPower(league: League): PowerRow[] | null {
  const p = league.media?.power;
  return p && p.season === league.season ? p.rows : null;
}

const HONOR_ORDER: Honor['kind'][] = ['potw', 'potm', 'rotm', 'cotm'];

/** A season's honors, newest first; on one day the players, then the rookies, then the coaches, East before West. */
export function seasonHonors(league: League, season = league.season): Honor[] {
  return (league.media?.honors ?? [])
    .filter((h) => h.season === season)
    .sort((a, b) => b.day - a.day || HONOR_ORDER.indexOf(a.kind) - HONOR_ORDER.indexOf(b.kind) || (a.conf ?? '').localeCompare(b.conf ?? ''));
}

const pressOn = (league: League) => league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs';

export function mediaGame(league: League, g: ScheduledGame) {
  if (!pressOn(league)) return;
  pressGame(league, g, (league.media ??= {}));
}

export function mediaDay(league: League) {
  const m = (league.media ??= {});
  if (pressOn(league)) {
    roundup(league, m);
    if (league.phase === 'regular') {
      const d = league.day;
      if (d >= 7 && d % 7 === 0 && (m.power?.season !== league.season || m.power.day !== d)) powerRankings(league, m);
      if (d >= 8 && d % 7 === 1) playersOfTheWeek(league, m);
      if (d === 21) surprisesColumn(league, m);
      if (d === league.allStarDay + 1) midseasonColumn(league, m);
    }
    monthlyHonors(league, m);
    playoffPreviews(league, m);
  }
  moveColumns(league, m);
  prune(league);
}

export function mediaSeasonStart(league: League) {
  const m = (league.media ??= {});
  m.honors = (m.honors ?? []).filter((h) => h.season >= league.season - 1);
  m.month = { season: league.season, from: 0 };
  m.streaks = { season: league.season, s: league.teams.map(() => 0) };
  delete m.done;
  // the columns read moves from here on (on a save from before the press, nothing older)
  if (m.txn === undefined) m.txn = league.transactions?.length ? league.transactions[league.transactions.length - 1].id : 0;
  // last season's weekly items have had their day: its rankings and roundups go (the honors stay on record)
  league.news = league.news.filter((n) => n.season >= league.season || !(n.kind === 'power' || isRoundup(n) || isWeekly(n)));
  seasonPreview(league, m);
  prune(league);
}

export function mediaSeasonEnd(league: League) {
  const m = (league.media ??= {});
  seasonWrap(league, m);
  prune(league);
}

const isRoundup = (n: NewsItem) => n.kind === 'game' && !n.head && n.text.startsWith(ROUNDUP);
/** The players of the week (their dek names the conferences first; a month's names its honors). */
const isWeekly = (n: NewsItem) => n.kind === 'honor' && /^(East|West): /.test(n.text);

/**
 * Keep the save's size sane: only the latest BODIES_KEPT stories keep their bodies (the headline
 * and dek stay), and a nightly roundup leaves after a fortnight.
 */
export function prune(league: League) {
  let kept = 0;
  for (let i = league.news.length - 1; i >= 0; i--) {
    const n = league.news[i];
    if (n.body === undefined) continue;
    if (kept < BODIES_KEPT) kept++;
    else delete n.body;
  }
  // the weekly items past the latest few, and roundups past a fortnight, leave
  let power = 0;
  let weekly = 0;
  const gone = new Set<NewsItem>();
  for (let i = league.news.length - 1; i >= 0; i--) {
    const n = league.news[i];
    if (n.kind === 'power' && ++power > POWER_KEPT) gone.add(n);
    else if (isWeekly(n) && ++weekly > WEEKLY_HONORS_KEPT) gone.add(n);
    else if (isRoundup(n) && (n.season < league.season || n.day < league.day - ROUNDUP_DAYS)) gone.add(n);
  }
  if (gone.size) league.news = league.news.filter((n) => !gone.has(n));
}

// ---------------------------------------------------------------- the front page

/** Days a story stays front-page news. */
const FRESH_DAYS = 10;

/**
 * The front page: the lead (the biggest recent story, the user's team's first at equal size) and
 * the next headlines, newest first. Only stories, the briefs stay on the wire.
 */
export function frontPage(league: League, n = 6, only?: (x: NewsItem) => boolean): { lead: NewsItem | null; headlines: NewsItem[] } {
  const stories = league.news.filter((x) => x.head && (!only || only(x)));
  if (!stories.length) return { lead: null, headlines: [] };
  // "now" is the newest story's date when the season is over (the summer shouldn't empty the page)
  const newest = stories.reduce((a, b) => (b.season > a.season || (b.season === a.season && b.day >= a.day) ? b : a));
  const age = (x: NewsItem) => (x.season === newest.season ? Math.max(0, newest.day - x.day) : 365);
  const size = (x: NewsItem) => (x.weight ?? 1) * 10 + (aboutUser(league, x) ? 6 : 0) - age(x) * 1.5;
  const fresh = stories.filter((x) => age(x) <= FRESH_DAYS);
  const pool = fresh.length ? fresh : stories.slice(-n - 1);
  const lead = [...pool].sort((a, b) => size(b) - size(a) || b.id - a.id)[0] ?? null;
  const headlines = stories
    .filter((x) => x !== lead && (x.weight ?? 1) >= 2)
    .sort((a, b) => b.season - a.season || b.day - a.day || b.id - a.id)
    .slice(0, n);
  return { lead, headlines };
}

/** A story by its id, if it's still on file. */
export function storyById(league: League, id: number): NewsItem | undefined {
  return league.news.find((x) => x.id === id);
}
