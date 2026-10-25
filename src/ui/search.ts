// Global search: one box for any player (on a team, a free agent, a prospect or retired), any team,
// any screen and any glossary word, so nothing is more than a search away. Pure apart from the
// recent-picks helpers at the end, so the ranking is unit-tested (__tests__/screens.test.ts).
import type { GameResult, League, Player } from '../core/types';
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
  {
    title: 'Settings',
    to: '/settings',
    meta: 'Difficulty, big moments, injuries, when sims stop',
    also: 'options preferences difficulty big moments injuries job security sims pause away',
  },
  {
    title: 'Live game settings',
    to: '/settings?tab=live',
    meta: 'Settings · speed, breaks, what the broadcast shows, staff calls',
    also: 'speed breaks playback win probability scores staff calls pre-game',
  },
  {
    title: 'League file',
    to: '/settings?tab=league',
    meta: 'Settings · save, backup, snapshots, glossary, god mode',
    also: 'save saves backup export import snapshot delete rename glossary teaching help',
  },
  { title: 'Roster', to: '/team', meta: 'Team · players, ratings, stats, contracts', also: 'players team' },
  {
    title: 'Contracts',
    to: '/team?view=contracts',
    meta: 'Team · every salary, season by season, with options and dead money',
    also: 'contract salaries salary payroll deals options dead money',
  },
  { title: 'Growth', to: '/team/growth', meta: 'Team · development, breakouts, rookies', also: 'development progress breakouts improving rookies young' },
  { title: 'Rotation', to: '/team/rotation', meta: 'Team · starters, minutes, closers', also: 'depth chart minutes starters starting lineup' },
  {
    title: 'Tactics',
    to: '/team/tactics',
    meta: 'Team · your system: the tactic, instructions, match plan, analysis',
    // a player's roles live on the Tactics board too: one entry, so one row
    also: 'playbook offense defense coverage sets system report grades undo instructions match analysis player roles role fit freedom screeners defensive glass',
  },
  { title: 'Lineups', to: '/team/lineups', meta: 'Team · five-man units and their ratings', also: 'units five man' },
  { title: 'Compare players', to: '/compare', meta: 'Team · two players side by side', also: 'versus vs' },
  { title: 'Schedule', to: '/games', meta: 'Games · your schedule and results', also: 'games results calendar' },
  // the next game's matchup page (or its report once it's played)
  {
    title: 'Matchup',
    to: '/preview',
    meta: 'Games · your next opponent: the preview, scouting, the game plan',
    also: 'next game preview scout scouting plan game plan opponent',
  },
  { title: 'Standings', to: '/league/standings', meta: 'League · standings and playoff odds', also: 'odds table playoff chances' },
  { title: 'Draft lottery', to: '/league/standings?view=lottery', meta: 'League · the lottery odds and the draft order', also: 'draft order lottery odds picks tank' },
  { title: 'Playoffs', to: '/league/playoffs', meta: 'League · the bracket and the play-in', also: 'bracket play-in postseason' },
  { title: 'NBA Cup', to: '/league/cup', meta: 'League · the in-season tournament', also: 'cup tournament' },
  { title: 'League stats', to: '/league/stats', meta: 'League · leaders, players, teams, ratings', also: 'leaders statistics ratings 3p fg ft three point percentages' },
  { title: 'Scores', to: '/league/schedule', meta: 'League · every game around the league', also: 'scoreboard results' },
  { title: 'Awards', to: '/league/awards', meta: 'League · MVP race and the rest', also: 'mvp races all-nba' },
  { title: 'News', to: '/league/news', meta: 'League · transactions and headlines', also: 'transactions headlines' },
  { title: 'Injuries', to: '/league/news?kind=injury', meta: 'League · injury news around the league', also: 'injured injury hurt' },
  { title: 'History', to: '/league/history', meta: 'League · seasons, records, Hall of Fame, coaches', also: 'records hall fame champions coaches' },
  { title: 'Office', to: '/office', meta: 'Office · the phase and the cap sheet', also: 'cap sheet space salary salaries payroll exceptions tax gm' },
  { title: 'Trade', to: '/office/trade', meta: 'Office · offers, the trading block, trade finder', also: 'trading block offers deadline' },
  { title: 'Free agents', to: '/office/free-agents', meta: 'Office · sign players', also: 'fa free agency signings' },
  { title: 'Re-sign', to: '/office/resign', meta: 'Office · your expiring contracts and extensions', also: 'extend extension extensions expiring contract contracts' },
  { title: 'Draft', to: '/office/draft', meta: 'Office · the board, the combine, mock drafts', also: 'prospects combine mock big board' },
  { title: 'Picks & moves', to: '/office/assets', meta: 'Office · your draft picks and transactions', also: 'picks assets' },
  { title: 'Finances', to: '/office/finances', meta: 'Office · revenue, expenses, ticket prices', also: 'money budget tickets revenue' },
  { title: 'Owner', to: '/office/owner', meta: 'Office · job security and his goals', also: 'job security goals' },
  { title: 'Career', to: '/office/career', meta: 'Office · your record and job offers', also: 'jobs offers resume' },
];

/** The names a few players go by that their initials don't give ("SGA", "KAT" and "JJJ" come from the name itself). */
const NICKNAMES: Record<string, string> = {
  'victor wembanyama': 'wemby',
  'nikola jokic': 'joker',
  'kevin durant': 'kd',
  'anthony davis': 'ad',
  'chris paul': 'cp3',
};

/** A player's words: his name's, then his initials when the name runs to three words or more, then a nickname. */
function playerWords(name: string): string[] {
  const words = wordsOf(name);
  const nick = NICKNAMES[words.join(' ')];
  return [...words, ...(words.length >= 3 ? [words.map((w) => w[0]).join('')] : []), ...(nick ? [nick] : [])];
}

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
      words: playerWords(name),
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
  // your last game's report, this season
  let last: GameResult | undefined;
  for (let k = league.games.length - 1; k >= 0 && league.games[k].season === league.season; k--) {
    const g = league.games[k];
    if (g.home.tid === league.userTid || g.away.tid === league.userTid) {
      last = g;
      break;
    }
  }
  if (last)
    out.push({
      id: 's:/game/last',
      kind: 'screen',
      title: 'Last game',
      meta: 'Games · the report: box score, shots, flow',
      to: `/game/${last.gid}`,
      words: ['last', 'game', 'box', 'score', 'boxscore', 'report', 'recap', 'result'],
      full: 'last game',
      boost: 75,
    });
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

/** One slip apart: a letter wrong, missing or extra, or two side by side swapped ("holmgrn", "shia"). */
export function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length > b.length) return a.slice(i + 1) === b.slice(i);
  if (a.length < b.length) return a.slice(i) === b.slice(i + 1);
  return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
}

/**
 * How well an entry matches: the whole name > an exact abbreviation > every word of the query
 * starting a word of the entry (any order: "jal wil", "wil jal"; whole words a little higher) > the
 * query inside the name > a slip in a word of four letters or more ("gilgeus"). 0 means no match.
 */
export function matchScore(e: SearchEntry, q: string): number {
  if (!q) return 0;
  if (e.full === q) return 1000;
  if (e.kind === 'team' && e.words.includes(q) && q.length <= 4) return 900;
  const qs = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (qs.length && qs.every((w) => e.words.some((x) => x.startsWith(w)))) {
    // the first word typed starting the name scores a little higher ("jalen" over "williams, jalen")
    // whole words beat the start of one ("fa" is Free agents' word, and only the start of "Hall of Fame")
    return 600 + (e.words[0]?.startsWith(qs[0]) ? 40 : 0) + (e.full.startsWith(q) ? 20 : 0) + (qs.every((w) => e.words.includes(w)) ? 20 : 0);
  }
  if (q.length >= 3 && e.full.includes(q)) return 300;
  // the typo match: each word a start of one of the entry's or, from four letters, one slip from one
  if (qs.some((w) => w.length >= 4) && qs.every((w) => e.words.some((x) => x.startsWith(w) || (w.length >= 4 && oneEdit(w, x))))) return 200;
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
