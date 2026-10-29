// Player comparison (/compare): the rows that set two players side by side, which side each row
// favours and how its values read, the picker's search and quick picks, and the device's recent
// comparisons. Pure apart from the localStorage helpers at the end, so the row logic is unit-tested
// away from the screen (src/ui/__tests__/compare.test.ts).
import type { League, Player, PlayerStats } from '../core/types';
import { DRAFT_PROSPECT, FREE_AGENT, RETIRED } from '../core/types';
import { RATING_META, attrDisplay, composites, fmtHeight } from '../core/ratings';
import { REC_LABEL, REC_STATS } from '../core/league/records';
import { playerAge } from '../core/playerGen';
import { seasonLabel } from '../core/constants';
import { SKILLS, type SkillPercentile } from './playerSkills';
import { advancedView, f1, ordinal, perGame, seasonLine, signed } from './stats';
import { accolades, careerTotals } from './league/shared';

/** Which way a row is better: the higher value, the lower (turnovers, fouls, age), or neither (height, games played). */
export type Dir = 'high' | 'low' | 'none';

/** How a row's values read: a whole number, one decimal, a percentage (of 1, shown without the %), signed, a percentile, a height, pounds, or a count where none reads "—". */
export type Fmt = 'int' | 'f1' | 'pct' | 'signed' | 'pctile' | 'height' | 'lb' | 'count';

export interface CmpRow {
  key: string;
  label: string;
  /** Each side's value: null when he has none (no games, no attempts, no player there). */
  a: number | null;
  b: number | null;
  dir: Dir;
  fmt: Fmt;
  /** The heading of the group this row starts (the Ratings tab's Physical, Scoring...). */
  group?: string;
  /** Read instead of the formatted values (the season a line is from). */
  text?: [string | null, string | null];
}

export interface CmpSection {
  id: 'overview' | 'skills' | 'ratings' | 'season' | 'career' | 'highs' | 'honors';
  title: string;
  note?: string;
  rows: CmpRow[];
  /** What the section says when neither player has anything for it. */
  empty: string;
}

export type Side = 'a' | 'b';

const has = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** A value as its format shows it (a percentage to a tenth of a point, a percentile to the whole number), so two values that read the same are a tie. */
export function shown(v: number, fmt: Fmt): number {
  switch (fmt) {
    case 'f1':
    case 'signed':
      return Number(v.toFixed(1));
    case 'pct':
      return Number((v * 100).toFixed(1));
    default:
      return Math.round(v);
  }
}

/** The side a row favours: none when either value is missing, the row has no better way, or the two read the same. */
export function better(a: number | null | undefined, b: number | null | undefined, dir: Dir, fmt: Fmt = 'f1'): Side | null {
  if (dir === 'none' || !has(a) || !has(b)) return null;
  const x = shown(a, fmt);
  const y = shown(b, fmt);
  if (x === y) return null;
  return x > y === (dir === 'high') ? 'a' : 'b';
}

/** One value as the row shows it; a missing one reads "—". */
export function fmtValue(v: number | null | undefined, fmt: Fmt): string {
  if (!has(v)) return '—';
  switch (fmt) {
    case 'int':
      return Math.round(v).toLocaleString('en-US');
    case 'count':
      return Math.round(v) ? String(Math.round(v)) : '—';
    case 'f1':
      return f1(v);
    case 'pct':
      return f1(v * 100);
    case 'signed':
      return signed(v);
    case 'pctile':
      return ordinal(Math.round(v));
    case 'height':
      return fmtHeight(v);
    case 'lb':
      return `${Math.round(v)} lb`;
  }
}

/** A row as the screen draws it: both values and the side it favours. */
export function rowView(r: CmpRow): { a: string; b: string; win: Side | null } {
  return {
    a: r.text?.[0] ?? fmtValue(r.a, r.fmt),
    b: r.text?.[1] ?? fmtValue(r.b, r.fmt),
    win: better(r.a, r.b, r.dir, r.fmt),
  };
}

/** The regular-season line a comparison reads: this season's, or his latest with games before he plays this one (as his page does). */
export function compareLine(league: League, p: Player): { season: number; tot: PlayerStats } | null {
  const cur = seasonLine(p, league.season);
  if (cur && cur.gp > 0) return { season: league.season, tot: cur };
  const last = Math.max(0, ...p.stats.filter((s) => !s.playoffs && s.gp > 0).map((s) => s.season));
  const tot = last ? seasonLine(p, last) : null;
  return tot && tot.gp > 0 ? { season: last, tot } : null;
}

const RATING_GROUPS = ['Physical', 'Scoring', 'Playmaking', 'Defense', 'Rebounding'] as const;

/**
 * Every row comparing `pa` with `pb` (either may be missing: a pid no longer in the save), by
 * section. Rows neither player has a value for are left out.
 */
export function compareSections(league: League, pa: Player | undefined, pb: Player | undefined, pctile: SkillPercentile): CmpSection[] {
  const both = (f: (p: Player) => number | null) => [pa ? f(pa) : null, pb ? f(pb) : null] as const;
  const row = (key: string, label: string, f: (p: Player) => number | null, dir: Dir, fmt: Fmt, extra: Partial<CmpRow> = {}): CmpRow => {
    const [a, b] = both(f);
    return { key, label, a, b, dir, fmt, ...extra };
  };

  // being younger is an edge between two players with careers ahead of them, not against a retired one
  const retired = pa?.tid === RETIRED || pb?.tid === RETIRED;
  // (OVR and POT are each side's big figures, in its head: not a second time here)
  const overview: CmpRow[] = [
    row('age', 'Age', (p) => playerAge(p, league.season), retired ? 'none' : 'low', 'int'),
    row('hgt', 'Height', (p) => p.heightIn, 'none', 'height'),
    row('wt', 'Weight', (p) => p.weightLb, 'none', 'lb'),
    row('exp', 'NBA seasons', (p) => p.experience, 'none', 'int'),
  ];

  const skills = SKILLS.map((s) => row(s.key, s.label, (p) => pctile(s.key, s.get(composites(p.ratings), p)), 'high', 'pctile'));

  const ratings = RATING_GROUPS.flatMap((g) =>
    RATING_META.filter((m) => m.group === g).map((m, i) => row(m.key, m.label, (p) => attrDisplay(p.ratings[m.key]), 'high', 'int', i === 0 ? { group: g } : {})),
  );

  // this season's line, or the latest one before he has played this season
  const lines = new Map<Player, ReturnType<typeof compareLine>>();
  for (const p of [pa, pb]) if (p) lines.set(p, compareLine(league, p));
  const onLine = (f: (t: PlayerStats) => number | null) => (p: Player) => {
    const t = lines.get(p)?.tot;
    return t ? f(t) : null;
  };
  const stat = (key: string, label: string, f: (t: PlayerStats) => number | null, dir: Dir, fmt: Fmt, group?: string) =>
    row(key, label, onLine(f), dir, fmt, group ? { group } : {});
  const pg = (t: PlayerStats) => perGame(t)!;
  // (a real season he split between teams is still marked real)
  const seasonName = (p: Player | undefined) => {
    const l = p && lines.get(p);
    return l ? `${seasonLabel(l.season)}${p.stats.some((x) => x.season === l.season && x.real) ? ' · real' : ''}` : null;
  };
  const season: CmpRow[] = [
    // which season each line is from, once either isn't this one
    ...([pa, pb].some((p) => p && lines.get(p) && lines.get(p)!.season !== league.season)
      ? [row('season', 'Season', (p) => lines.get(p)?.season ?? null, 'none', 'int', { text: [seasonName(pa), seasonName(pb)] })]
      : []),
    stat('gp', 'Games', (t) => t.gp, 'none', 'int', 'Per game'),
    stat('min', 'Minutes', (t) => pg(t).min, 'high', 'f1'),
    stat('pts', 'Points', (t) => pg(t).pts, 'high', 'f1'),
    stat('reb', 'Rebounds', (t) => pg(t).reb, 'high', 'f1'),
    stat('ast', 'Assists', (t) => pg(t).ast, 'high', 'f1'),
    stat('stl', 'Steals', (t) => pg(t).stl, 'high', 'f1'),
    stat('blk', 'Blocks', (t) => pg(t).blk, 'high', 'f1'),
    stat('tov', 'Turnovers', (t) => pg(t).tov, 'low', 'f1'),
    stat('pf', 'Fouls', (t) => pg(t).pf, 'low', 'f1'),
    // no attempts, no percentage: "—", not 0.0
    stat('fg', 'FG%', (t) => (t.fga ? pg(t).fgPct : null), 'high', 'pct', 'Shooting'),
    stat('tp', '3P%', (t) => (t.tpa ? pg(t).tpPct : null), 'high', 'pct'),
    stat('tpa', '3PA', (t) => pg(t).tpa, 'none', 'f1'),
    stat('ft', 'FT%', (t) => (t.fta ? pg(t).ftPct : null), 'high', 'pct'),
    stat('ts', 'TS%', (t) => (t.fga || t.fta ? pg(t).tsPct : null), 'high', 'pct'),
    // a bigger role isn't a better player: usage is shown, not judged
    stat('usg', 'USG%', (t) => pg(t).usg, 'none', 'pct', 'Advanced'),
    // (a real season from a seed before the game files has no plus-minus or on-court numbers)
    stat('pm', '+/-', (t) => (t.real && !t.pm ? null : pg(t).pm), 'high', 'signed'),
    stat('net', 'On net', (t) => (t.onPoss ? pg(t).onOff : null), 'high', 'signed'),
    // PER and win shares for a season played here too (worked out from its box score); BPM only for real ones
    row('per', 'PER', (p) => (lines.get(p) ? (advancedView(league, p, lines.get(p)!.tot)?.per ?? null) : null), 'high', 'f1'),
    stat('bpm', 'BPM', (t) => t.adv?.bpm ?? null, 'high', 'signed'),
    row('ws', 'Win shares', (p) => (lines.get(p) ? (advancedView(league, p, lines.get(p)!.tot)?.ws ?? null) : null), 'high', 'f1'),
  ];

  // career totals: a player who hasn't played reads "—", not a row of zeros
  type Career = ReturnType<typeof careerTotals>;
  const careers = new Map<Player, Career>();
  for (const p of [pa, pb]) if (p) careers.set(p, careerTotals(p));
  const onCareer = (f: (c: Career) => number) => (p: Player) => {
    const c = careers.get(p)!;
    return c.gp ? f(c) : null;
  };
  const car = (key: string, label: string, f: (c: Career) => number, dir: Dir = 'high', fmt: Fmt = 'int') => row(key, label, onCareer(f), dir, fmt);
  const careerRows: CmpRow[] = [
    car('seasons', 'Seasons', (c) => c.seasons.size, 'none'),
    car('cgp', 'Games', (c) => c.gp, 'none'),
    car('cpts', 'Points', (c) => c.pts),
    car('creb', 'Rebounds', (c) => c.reb),
    car('cast', 'Assists', (c) => c.ast),
    car('cstl', 'Steals', (c) => c.stl),
    car('cblk', 'Blocks', (c) => c.blk),
    car('cppg', 'Points a game', (c) => c.pts / c.gp, 'high', 'f1'),
  ];

  // a stat he has never put up in a game the book counts is a high of 0; no highs at all, no games
  const highs = REC_STATS.map((k) => row(`hi-${k}`, REC_LABEL[k][0], (p) => (p.highs && Object.keys(p.highs).length ? (p.highs[k]?.[0] ?? 0) : null), 'high', 'int'));

  // the honors either has, in the league history's order (read off both players' awards at once);
  // none counts as 0 against the other's
  const counts = (p: Player | undefined) => new Map((p ? accolades(p) : []).map((x) => [x.label, x.n]));
  const [ca, cb] = [counts(pa), counts(pb)];
  const honors: CmpRow[] = accolades({ awards: [...(pa?.awards ?? []), ...(pb?.awards ?? [])] }).map((x) => ({
    key: `hon-${x.label}`,
    label: x.label,
    a: pa ? (ca.get(x.label) ?? 0) : null,
    b: pb ? (cb.get(x.label) ?? 0) : null,
    dir: 'high',
    fmt: 'count',
  }));
  if (pa?.hof || pb?.hof) honors.unshift({ key: 'hof', label: 'Hall of Fame', a: pa ? (pa.hof ? 1 : 0) : null, b: pb ? (pb.hof ? 1 : 0) : null, dir: 'high', fmt: 'count' });

  const since = league.records?.since ?? league.startSeason;
  const sections: CmpSection[] = [
    { id: 'overview', title: 'Overview', rows: overview, empty: 'Pick two players to compare.' },
    { id: 'skills', title: 'Scouting profile', note: 'Percentile among rostered players.', rows: skills, empty: '' },
    { id: 'ratings', title: 'Ratings', rows: ratings, empty: '' },
    {
      id: 'season',
      title: 'This season',
      note: 'Per game in the regular season. Before he plays this season, his latest one.',
      rows: season,
      empty: 'No NBA games yet.',
    },
    {
      id: 'career',
      title: 'Career',
      note:
        league.careersFrom !== undefined
          ? 'Regular-season totals on record. A real player’s NBA career before this league counts too.'
          : 'Regular-season totals on record. A real veteran’s last three seasons before this league count too.',
      rows: careerRows,
      empty: 'No NBA games yet.',
    },
    {
      id: 'highs',
      title: 'Career highs',
      note: league.realHighs
        ? `Regular-season games. A real player's whole NBA career, anyone else's since ${seasonLabel(since)}.`
        : `Regular-season games since ${seasonLabel(since)}.`,
      rows: highs,
      empty: 'No games in this league yet.',
    },
    { id: 'honors', title: 'Honors', rows: honors, empty: 'No honors yet.' },
  ];
  // rows neither has a value for say nothing (PER and win shares between two simulated seasons)
  for (const s of sections) s.rows = s.rows.filter((r) => has(r.a) || has(r.b));
  return sections;
}

// ---------------------------------------------------------------- picking players

/** A name as search reads it: no accents, case or punctuation ("Dončić" is found by "doncic", "O'Neale" by "oneale"). */
export function normName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/[.'’]/g, '').replace(/\s+/g, ' ').trim();
}

/** Whether a search finds him: part of his name, or his team's abbreviation ("bos"). */
export function matchesQuery(league: League, p: Player, q: string): boolean {
  const n = normName(q);
  if (!n) return false;
  if (normName(`${p.firstName} ${p.lastName}`).includes(n)) return true;
  return p.tid >= 0 && league.teams[p.tid]?.abbrev.toLowerCase() === n;
}

/** The draft phases, when this year's prospects can be picked for a comparison. */
export const draftPhase = (league: League) => league.phase === 'draftLottery' || league.phase === 'draft';

/** Who the picker searches: every active player and free agent, and this year's prospects in the draft phases (or when comparing with one). */
export function pickerPool(league: League, withProspects: boolean): Player[] {
  return Object.values(league.players).filter((p) => p.tid >= 0 || p.tid === FREE_AGENT || (withProspects && p.tid === DRAFT_PROSPECT && p.draft.year === league.season));
}

/** A search over the pool: the best players first. */
export function searchPlayers(league: League, pool: Player[], q: string, limit = 30): { list: Player[]; total: number } {
  const hits = pool.filter((p) => matchesQuery(league, p, q)).sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
  return { list: hits.slice(0, limit), total: hits.length };
}

const byOvr = (a: Player, b: Player) => b.ovr - a.ovr || a.pid - b.pid;

/** A team's players at a position, best first, but one. */
export function playersAt(league: League, tid: number, pos: Player['pos'], except?: number): Player[] {
  return Object.values(league.players)
    .filter((p) => p.tid === tid && p.pos === pos && p.pid !== except)
    .sort(byOvr);
}

/** The user's best player at his position: who a free agent or a trade target is weighed against. */
export function counterpart(league: League, p: Player): Player | null {
  return playersAt(league, league.userTid, p.pos, p.pid)[0] ?? null;
}

/** The prospects ranked nearest him on this year's big board. */
export function boardNeighbors(league: League, p: Player, n = 5): Player[] {
  const rank = p.prospect?.rank ?? 99;
  return Object.values(league.players)
    .filter((x) => x.tid === DRAFT_PROSPECT && x.draft.year === p.draft.year && x.pid !== p.pid)
    .sort((x, y) => Math.abs((x.prospect?.rank ?? 99) - rank) - Math.abs((y.prospect?.rank ?? 99) - rank) || (x.prospect?.rank ?? 99) - (y.prospect?.rank ?? 99))
    .slice(0, n);
}

/** The comparison's query (?a=<pid>&b=<pid>); a side left out is picked on the screen. */
export function compareQuery(a?: number | null, b?: number | null): URLSearchParams {
  const q = new URLSearchParams();
  if (a !== null && a !== undefined) q.set('a', String(a));
  if (b !== null && b !== undefined) q.set('b', String(b));
  return q;
}

export function compareHref(a?: number | null, b?: number | null): string {
  const s = compareQuery(a, b).toString();
  return s ? `/compare?${s}` : '/compare';
}

/** A side's pid from the query: anything but a whole number is no player. */
export function pidParam(s: string | null): number | null {
  const n = Number(s);
  return s !== null && s.trim() !== '' && Number.isInteger(n) ? n : null;
}

// ---------------------------------------------------------------- recent comparisons

/** A comparison made on this device: the two pids. */
export type Pair = [number, number];

const RECENT_MAX = 8;

/** The list with this comparison first (the same two either way round count once). */
export function addRecent(list: Pair[], a: number, b: number, max = RECENT_MAX): Pair[] {
  return [[a, b] as Pair, ...list.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a)))].slice(0, max);
}

/** The players in recent comparisons, latest first, each once. */
export function recentPids(list: Pair[], except: number[] = []): number[] {
  const out: number[] = [];
  for (const [x, y] of list) for (const pid of [x, y]) if (!out.includes(pid) && !except.includes(pid)) out.push(pid);
  return out;
}

const recentKey = (leagueId: string) => `hc:compare:${leagueId}`;

/** This league's recent comparisons on this device (a convenience: none when storage is unavailable). */
export function loadRecent(leagueId: string): Pair[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(recentKey(leagueId)) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is Pair => Array.isArray(x) && x.length === 2 && x.every((v) => Number.isInteger(v))).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function rememberComparison(leagueId: string, a: number, b: number) {
  try {
    localStorage.setItem(recentKey(leagueId), JSON.stringify(addRecent(loadRecent(leagueId), a, b)));
  } catch {
    /* private mode or storage full: recent comparisons are a convenience */
  }
}
