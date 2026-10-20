// Global search: one box for any player (on a team, a free agent, a prospect or retired), any team,
// any screen and any glossary word, so nothing is more than a search away. Pure apart from the
// recent-picks helpers at the end, so the ranking is unit-tested (__tests__/search.test.ts).
import type { League, Player } from '../core/types';
import { DRAFT_PROSPECT, FREE_AGENT, RETIRED } from '../core/types';
import { playerAge } from '../core/playerGen';
import { GLOSSARY } from './glossary';
import { normName } from './compare';

export type SearchKind = 'player' | 'team' | 'screen' | 'term';

export interface SearchEntry {
  /** Unique across kinds: "p:12", "t:3", "s:/league/stats", "g:drop". */
  id: string;
  kind: SearchKind;
  title: string;
  /** One line under the title: team · position · age, a record, what a screen holds, a definition. */
  meta: string;
  /** Where it goes (glossary words open in place instead). */
  to?: string;
  /** A second way in, beside the row: a team's matchup page. */
  alt?: { label: string; to: string };
  ovr?: number;
  /** The glossary entry's id, for words. */
  termId?: string;
  /** Normalized words the query is matched against (the title's, then aliases). */
  words: string[];
  /** The normalized title, for exact and substring matches. */
  full: string;
  /** Ties go to the likelier pick: screens, teams, your players, active ones by OVR, then glossary words. */
  boost: number;
}

/** Lower case without accents or dots, as Compare's picker reads names: "doncic" finds Dončić, "pj" P.J. */
export const normalize = normName;

const wordsOf = (s: string) =>
  normalize(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** The screens, by the names players use for them. */
const SCREENS: { title: string; to: string; meta: string; also?: string }[] = [
  { title: 'Today', to: '/', meta: 'What needs you now', also: 'home agenda to do' },
  { title: 'Inbox', to: '/inbox', meta: 'Mail and decisions', also: 'messages mail' },
  { title: 'Settings', to: '/settings', meta: 'Difficulty, live games, saves', also: 'options preferences backup export' },
  { title: 'Roster', to: '/team', meta: 'Team · players, ratings, stats, contracts', also: 'players team' },
  { title: 'Rotation', to: '/team/rotation', meta: 'Team · starters, minutes, closers', also: 'depth chart minutes starters' },
  {
    title: 'Tactics',
    to: '/team/tactics',
    meta: 'Team · your system: its report, offense, defense, players, game management',
    also: 'playbook offense defense roles sets system report grades',
  },
  {
    title: 'Player roles',
    to: '/team/tactics?tab=players',
    meta: 'Team · each player’s roles at both ends, how he fits them, his shot freedom and glass duty',
    also: 'roles role fit freedom screeners defensive role glass',
  },
  { title: 'Lineups', to: '/team/lineups', meta: 'Team · five-man units and their ratings', also: 'units five man' },
  { title: 'Compare players', to: '/compare', meta: 'Team · two players side by side', also: 'versus vs' },
  { title: 'Schedule', to: '/games', meta: 'Games · your schedule and results', also: 'games results calendar' },
  { title: 'Standings', to: '/league/standings', meta: 'League · standings and playoff odds', also: 'odds table' },
  { title: 'Playoffs', to: '/league/playoffs', meta: 'League · the bracket and the play-in', also: 'bracket play-in postseason' },
  { title: 'NBA Cup', to: '/league/cup', meta: 'League · the in-season tournament', also: 'cup tournament' },
  { title: 'League stats', to: '/league/stats', meta: 'League · leaders, players, teams, ratings', also: 'leaders statistics ratings' },
  { title: 'Scores', to: '/league/schedule', meta: 'League · every game around the league', also: 'scoreboard results' },
  { title: 'Awards', to: '/league/awards', meta: 'League · MVP race and the rest', also: 'mvp races all-nba' },
  { title: 'News', to: '/league/news', meta: 'League · transactions and headlines', also: 'transactions headlines' },
  { title: 'History', to: '/league/history', meta: 'League · seasons, records, Hall of Fame, coaches', also: 'records hall fame champions coaches' },
  { title: 'Office', to: '/office', meta: 'Office · the phase and the cap sheet', also: 'cap salary payroll exceptions gm' },
  { title: 'Trade', to: '/office/trade', meta: 'Office · offers, the trading block, trade finder', also: 'trading block offers' },
  { title: 'Free agents', to: '/office/free-agents', meta: 'Office · sign players', also: 'free agency signings' },
  { title: 'Re-sign', to: '/office/resign', meta: 'Office · your expiring contracts and extensions', also: 'extensions expiring' },
  { title: 'Draft', to: '/office/draft', meta: 'Office · the board, the combine, mock drafts', also: 'prospects combine mock lottery' },
  { title: 'Picks & moves', to: '/office/assets', meta: 'Office · your draft picks and transactions', also: 'picks assets' },
  { title: 'Finances', to: '/office/finances', meta: 'Office · revenue, expenses, ticket prices', also: 'money budget tickets revenue' },
  { title: 'Owner', to: '/office/owner', meta: 'Office · job security and his goals', also: 'job security goals' },
  { title: 'Career', to: '/office/career', meta: 'Office · your record and job offers', also: 'jobs offers resume' },
];

/** Everything findable in this league. */
export function searchIndex(league: League): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const p of Object.values(league.players)) {
    const name = `${p.firstName} ${p.lastName}`;
    out.push({
      id: `p:${p.pid}`,
      kind: 'player',
      title: name,
      meta: playerMeta(league, p),
      to: `/player/${p.pid}`,
      ovr: p.tid === RETIRED ? undefined : p.ovr,
      words: wordsOf(name),
      full: normalize(name),
      boost: (p.tid === league.userTid ? 60 : p.tid >= 0 ? 40 : p.tid === FREE_AGENT ? 25 : p.tid === DRAFT_PROSPECT ? 15 : 0) + p.ovr / 10,
    });
  }
  for (const t of league.teams) {
    const name = `${t.region} ${t.name}`;
    const mine = t.tid === league.userTid;
    const s = t.seasons.find((x) => x.season === league.season);
    out.push({
      id: `t:${t.tid}`,
      kind: 'team',
      title: name,
      meta: `${t.abbrev}${s ? ` · ${s.won}-${s.lost}` : ''}${mine ? ' · your team' : ''}`,
      to: mine ? '/team' : `/teams/${t.tid}`,
      alt: mine ? undefined : { label: 'Matchup', to: `/games/${t.tid}` },
      words: [...wordsOf(name), normalize(t.abbrev)],
      full: normalize(name),
      boost: 70 + (mine ? 10 : 0),
    });
  }
  for (const s of SCREENS) {
    out.push({
      id: `s:${s.to}`,
      kind: 'screen',
      title: s.title,
      meta: s.meta,
      to: s.to,
      words: [...wordsOf(s.title), ...wordsOf(s.also ?? '')],
      full: normalize(s.title),
      boost: 75,
    });
  }
  if (league.settings.godMode)
    out.push({
      id: 's:/god',
      kind: 'screen',
      title: 'God mode',
      meta: 'Edit players and teams',
      to: '/god',
      words: ['god', 'mode', 'editor', 'edit'],
      full: 'god mode',
      boost: 75,
    });
  for (const g of GLOSSARY) {
    out.push({ id: `g:${g.id}`, kind: 'term', title: g.term, meta: g.text, termId: g.id, words: wordsOf(g.term), full: normalize(g.term), boost: 0 });
  }
  return out;
}

function playerMeta(league: League, p: Player): string {
  const age = playerAge(p, league.season);
  if (p.tid >= 0) return `${league.teams[p.tid]?.abbrev ?? ''} · ${p.pos} · ${age}`;
  if (p.tid === FREE_AGENT) return `Free agent · ${p.pos} · ${age}`;
  if (p.tid === DRAFT_PROSPECT) return `Draft prospect · ${p.pos} · ${age}`;
  return `Retired · ${p.pos}`;
}

/**
 * How well an entry matches: the whole name > an exact abbreviation > every word of the query
 * starting a word of the entry (any order: "jal wil", "wil jal") > the query inside the name.
 * 0 means no match.
 */
export function matchScore(e: SearchEntry, q: string): number {
  if (!q) return 0;
  if (e.full === q) return 1000;
  if (e.kind === 'team' && e.words.includes(q) && q.length <= 4) return 900;
  const qs = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (qs.length && qs.every((w) => e.words.some((x) => x.startsWith(w)))) {
    // the first word typed starting the name scores a little higher ("jalen" over "williams, jalen")
    return 600 + (e.words[0]?.startsWith(qs[0]) ? 40 : 0) + (e.full.startsWith(q) ? 20 : 0);
  }
  if (q.length >= 3 && e.full.includes(q)) return 300;
  return 0;
}

/** The best matches for a query, at most `limit`, best first. */
export function search(index: SearchEntry[], query: string, limit = 30): SearchEntry[] {
  const q = normalize(query);
  if (!q) return [];
  const hits: { e: SearchEntry; s: number }[] = [];
  for (const e of index) {
    const s = matchScore(e, q);
    if (s) hits.push({ e, s: s + e.boost });
  }
  return hits
    .sort((a, b) => b.s - a.s || a.e.title.localeCompare(b.e.title))
    .slice(0, limit)
    .map((h) => h.e);
}

// ---------------------------------------------------------------- recent picks (this device, per league)

const recentKey = (leagueId: string) => `hc:search:${leagueId}`;

export function loadRecent(leagueId: string): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(recentKey(leagueId)) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function saveRecent(leagueId: string, id: string) {
  try {
    localStorage.setItem(recentKey(leagueId), JSON.stringify([id, ...loadRecent(leagueId).filter((x) => x !== id)].slice(0, 8)));
  } catch {
    /* ignore */
  }
}
