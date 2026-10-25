// What Today leads with, read from the league as it stands: the user's last result while it's
// fresh, otherwise the top story about his team; his form; and the league's top headlines. Pure
// league reading (no React), shared by Today and the "While you were away" digest.
import type { GameResult, League, NewsItem } from '../../core/types';
import { gameStoryFor, type GameStory } from '../../core/analysis/gameStory';

/** A story's page in the News tab. */
export const storyLink = (id: number) => `/league/news?story=${id}`;

/** Kinds that are about the user's team whatever weight the writer gave them. */
const ALWAYS_HIS = new Set<NewsItem['kind']>(['honor', 'milestone', 'award', 'record']);

/** How big a news item is: 3 the front page, 2 a story, 1 a brief. */
export const weightOf = (n: NewsItem) => n.weight ?? 1;

/** A news item's headline: the press's own, or its one line. */
export const headOf = (n: NewsItem) => n.head ?? n.text;

/**
 * Whether a news item is about the user's team: it names it, and for the power rankings (which name
 * every week's leader and the user's team) its headline does too ("the Thunder lead again" isn't his);
 * so does a league-wide column that only mentions his team on the way (the season's wrap, the
 * surprises), one that doesn't lead with it.
 */
function names(l: League, n: NewsItem): boolean {
  if (!n.tids.includes(l.userTid)) return false;
  const aside = n.kind === 'power' || (n.kind === 'column' && n.tids[0] !== l.userTid);
  return !aside || headOf(n).includes(l.teams[l.userTid].name);
}

/** A story about the user's team worth a place on Today or in the digest: one about it that is a story (or an honor, a milestone, a record). */
export function isHisStory(l: League, n: NewsItem): boolean {
  return names(l, n) && (weightOf(n) >= 2 || ALWAYS_HIS.has(n.kind));
}

/** A story around the league: another team's, weight 2 or more. */
export const isLeagueStory = (l: League, n: NewsItem) => !names(l, n) && weightOf(n) >= 2;

/** Bigger first, then newer. */
export const byWeight = (a: NewsItem, b: NewsItem) => weightOf(b) - weightOf(a) || b.id - a.id;

/** Today's lead story about the user's team: from the last two weeks of this season, the biggest of the newest few. */
export const STORY_DAYS = 14;
/** Days that cost a story one step of weight in the lead: a front page from ten days ago gives way to this week's story. */
const STORY_FADE = 3;

export function topStory(l: League): NewsItem | null {
  const recent: NewsItem[] = [];
  for (let i = l.news.length - 1; i >= 0 && recent.length < 6; i--) {
    const n = l.news[i];
    if (n.season !== l.season || l.day - n.day > STORY_DAYS) break;
    if (isHisStory(l, n)) recent.push(n);
  }
  // the bigger first, as long as it's news: each STORY_FADE days old costs a step
  const size = (n: NewsItem) => weightOf(n) - (l.day - n.day) / STORY_FADE;
  return recent.sort((a, b) => size(b) - size(a) || b.id - a.id)[0] ?? null;
}

/** The league's top headlines (other teams' stories) from the last week, biggest first. */
export function leagueHeadlines(l: League, n = 3, days = 7): NewsItem[] {
  const out: NewsItem[] = [];
  for (let i = l.news.length - 1; i >= 0 && out.length < 12; i--) {
    const x = l.news[i];
    if (x.season !== l.season || l.day - x.day > days) break;
    if (isLeagueStory(l, x)) out.push(x);
  }
  return out.sort(byWeight).slice(0, n);
}

/** One of the user's results, from his side. */
export interface Result {
  gid: number;
  day: number;
  won: boolean;
  us: number;
  them: number;
  opp: number;
  home: boolean;
  ot: number;
}

export function resultOf(l: League, g: GameResult): Result {
  const home = g.home.tid === l.userTid;
  const [us, them] = home ? [g.home, g.away] : [g.away, g.home];
  return { gid: g.gid, day: g.day, won: us.pts > them.pts, us: us.pts, them: them.pts, opp: them.tid, home, ot: g.ot };
}

/** The user's last `n` results this season, newest first. */
export function lastResults(l: League, n: number): Result[] {
  const out: Result[] = [];
  for (let k = l.games.length - 1; k >= 0 && out.length < n; k--) {
    const g = l.games[k];
    if (g.season !== l.season) break;
    if (g.home.tid === l.userTid || g.away.tid === l.userTid) out.push(resultOf(l, g));
  }
  return out;
}

/** "W3", "L2": the run the newest results are on (from `results`, newest first). */
export function runOf(results: Result[]): { won: boolean; n: number } | null {
  if (!results.length) return null;
  let n = 0;
  while (n < results.length && results[n].won === results[0].won) n++;
  return { won: results[0].won, n };
}

/** "128-127", with the overtimes: "128-127 OT", "131-130 2OT". */
export const scoreText = (r: Pick<Result, 'us' | 'them' | 'ot'>) => `${r.us}-${r.them}${r.ot ? ` ${r.ot > 1 ? r.ot : ''}OT` : ''}`;

/**
 * The user's last game while it's still the news: played yesterday (or today, finished live), in
 * the season's games. Its story is the press's (gameStoryFor), when there is one.
 */
export function freshResult(l: League): { r: Result; story: GameStory | null } | null {
  if (l.phase !== 'regular' && l.phase !== 'playin' && l.phase !== 'playoffs') return null;
  const [r] = lastResults(l, 1);
  if (!r || r.day < l.day - 1) return null;
  return { r, story: gameStoryFor(l, r.gid) };
}
