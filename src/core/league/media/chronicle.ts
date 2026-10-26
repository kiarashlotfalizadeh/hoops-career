// The league's memory (League.chronicle): when a season's Finals end, its biggest stories (the
// awards, the records, the league's biggest nights and columns, the user's team's biggest moments)
// and its playoff series are kept for good, a few lines a season, after the news that told them is
// gone (the news keeps about a season). The summer's farewells join their season the day they're
// written, and the next opening night reads the season once more, its draft and free agency
// included. The press reads it back (history.ts: dynasties, droughts, rematches, anniversaries), and
// History opens a season's page from it. Nothing here draws from any random stream.
import type { ChronicleSeason, ChronicleStory, League, NewsItem } from '../../types';
import { aboutUser } from './voice';

/** A season's stories the chronicle keeps (the summer's farewells may add a few more). */
export const CHRONICLE_STORIES = 8;
/** Of them, at most this many about the user's team: a season's page is the league's, his are in his reviews. */
const MINE_MAX = 3;
/** Farewells kept on top of a season's stories. */
const FAREWELLS_MAX = 4;
/** A retirement's line is kept to this many characters (most are shorter): the save keeps the headline whole. */
const DEK_MAX = 120;

/** The kinds that never make the chronicle: the press's weekly opinions and previews, the injury wire, the weekly and monthly honors. */
const SKIP = new Set<NewsItem['kind']>(['power', 'preview', 'injury', 'rumor', 'honor']);

/** A losing streak's story ("Losing streak hits 5 for Clippers", "Clippers end 7-game skid"): a week's news, not a season's. */
const STREAKY = /\bskid\b|losing streak|\bdrop \w+ straight\b/i;

/**
 * The user's team's stories, in the order a season remembers them: its records, then its playoff
 * nights, then its awards and milestones, then the rest (a regular-season game last).
 */
function mineRank(league: League, s: ChronicleStory): number {
  if (s.kind === 'record') return 5;
  if (s.kind === 'game' && s.day > league.regularSeasonDays) return 4;
  if (s.kind === 'award') return 3;
  if (s.kind === 'milestone') return 2;
  return s.kind === 'game' ? 0 : 1;
}

/**
 * How much a story says about its season, for choosing the few kept: its weight first (a front page
 * is ten points ahead of a story), then what kind of news it is (the awards, the records and the
 * farewells are what a season is remembered by; a trade or a coach fired less so).
 */
const KIND_BONUS: Partial<Record<NewsItem['kind'], number>> = { award: 6, record: 5, retire: 5, column: 2, milestone: 2, game: 1, trade: 1 };

function size(league: League, n: Pick<NewsItem, 'kind' | 'weight' | 'tids' | 'pids'>): number {
  return (n.weight ?? 1) * 10 + (KIND_BONUS[n.kind] ?? 0) + (aboutUser(league, n) ? 3 : 0);
}

/** The most of one kind among the league's stories a season keeps (two of any other). */
const KIND_MAX: Partial<Record<NewsItem['kind'], number>> = { record: 2, game: 2, award: 2, column: 2, trade: 1, milestone: 1, coach: 1, general: 1 };

/** A number going up at a home opener (media/legends.ts): a story of the season it's in, not a summer's farewell. */
const isJerseyNight = (s: Pick<ChronicleStory, 'kind' | 'dek'>) => s.kind === 'retire' && !!s.dek?.startsWith('Before the home opener');

const clip = (s: string) => (s.length <= DEK_MAX ? s : `${s.slice(0, DEK_MAX - 1).replace(/\s+\S*$/, '')}…`);

/** A news item as the chronicle keeps it: the headline, who it's about (the first few), and for a retirement its line (the career); not the body. */
export function chronicleStory(n: NewsItem): ChronicleStory {
  return {
    id: n.id,
    day: n.day,
    kind: n.kind,
    head: n.head ?? n.text,
    ...(n.head && n.text && n.kind === 'retire' ? { dek: clip(n.text) } : {}),
    tids: n.tids.slice(0, 3),
    pids: n.pids.slice(0, 3),
    weight: n.weight ?? 1,
  };
}

/** A season's chronicle, if it has one. */
export function chronicleOf(league: League, season: number): ChronicleSeason | undefined {
  return league.chronicle?.find((c) => c.season === season);
}

/**
 * Write (or read again) the season's chronicle from the news as it stands: its biggest stories, at
 * most MINE_MAX of them the user's, kept in the order they ran, and its playoff series. A story the
 * news has since pruned stays as it was kept. Run when the Finals end and again on the next opening
 * night, before the news lets last season's weekly items go.
 */
export function chronicleSeason(league: League, season = league.season, wrap?: number) {
  const old = chronicleOf(league, season);
  const pin = wrap ?? old?.wrap;
  const pool = new Map<number, ChronicleStory>();
  // (the earlier reading's stories, the farewells among them, stand: the news may not have them any more)
  for (const s of old?.stories ?? []) pool.set(s.id, s);
  for (const n of league.news) {
    if (n.season !== season || !n.head || (n.weight ?? 1) < 2 || SKIP.has(n.kind) || (n.kind === 'game' && STREAKY.test(n.head))) continue;
    pool.set(n.id, chronicleStory(n));
  }
  const all = [...pool.values()];
  const bySize = (a: ChronicleStory, b: ChronicleStory) => size(league, b) - size(league, a) || a.id - b.id;
  const farewells = all.filter((s) => s.kind === 'retire' && !isJerseyNight(s)).sort(bySize);
  // (the wrap first, whoever it names)
  const wrapped = all.find((s) => s.id === pin);
  const rest = all.filter((s) => s !== wrapped && (s.kind !== 'retire' || isJerseyNight(s))).sort(bySize);
  const mine = rest
    .filter((s) => aboutUser(league, s))
    .sort((a, b) => mineRank(league, b) - mineRank(league, a) || bySize(a, b))
    .slice(0, MINE_MAX);
  // the league's, a few of a kind at most (a young record book's records, the nights of 60 points)
  const count = new Map<string, number>();
  const theirs = rest
    // (another team's game is the season's only on the front page: a close finish in January isn't)
    .filter((s) => !aboutUser(league, s) && (s.kind !== 'game' || s.weight === 3))
    .filter((s) => {
      const n = (count.get(s.kind) ?? 0) + 1;
      count.set(s.kind, n);
      return n <= (KIND_MAX[s.kind] ?? 2);
    })
    .slice(0, CHRONICLE_STORIES - mine.length - (wrapped ? 1 : 0));
  const stories = [...(wrapped ? [wrapped] : []), ...theirs, ...mine].sort((a, b) => a.day - b.day || a.id - b.id);
  // (a season read again in the next one: its playoffs are gone from the league by then)
  const series: ChronicleSeason['series'] =
    season === league.season && league.playoffs.length ? league.playoffs.map((s) => [s.round, s.high, s.low, s.highWins, s.lowWins]) : (old?.series ?? []);
  const entry: ChronicleSeason = { season, stories: [...stories, ...farewells.slice(0, FAREWELLS_MAX)], series, ...(pin !== undefined && pool.has(pin) ? { wrap: pin } : {}) };
  league.chronicle = [...(league.chronicle ?? []).filter((c) => c.season !== season), entry].sort((a, b) => a.season - b.season);
}

/** A farewell written in the summer joins its season's chronicle (the biggest few: see chronicleSeason). */
export function chronicleFarewell(league: League, n: NewsItem) {
  const c = chronicleOf(league, n.season);
  if (!c || c.stories.some((s) => s.id === n.id)) return;
  const farewells = [...c.stories.filter((s) => s.kind === 'retire' && !isJerseyNight(s)), chronicleStory(n)].sort((a, b) => size(league, b) - size(league, a) || a.id - b.id);
  c.stories = [...c.stories.filter((s) => s.kind !== 'retire' || isJerseyNight(s)), ...farewells.slice(0, FAREWELLS_MAX)];
}
