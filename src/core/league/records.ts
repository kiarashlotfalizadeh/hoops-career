// The record book: the best single-game performances since the league began, by a player and by a
// team, for the league and for each franchise (League.records), and each player's regular-season
// career highs (Player.highs). Results older than last season are pruned from the save, so these are
// kept as each game is recorded. Single-season and career records are read from what the save keeps
// for good: every player's and team's seasons. Only seasons played in this league count: the real
// seasons a seeded player arrives with are history from before it, and his career highs are the
// league's ("since 2026-27") unless his whole career is on record.
//
// The regular season (NBA Cup group games, quarterfinals and semifinals included) and the postseason
// (play-in and playoffs) keep separate books; the Cup championship and the All-Star Game count in
// neither, as they count in neither's stats.

import type { BoxLine, GameResult, GameType, League, Player, PlayerStats, TeamSeason } from '../types';
import { RETIRED } from '../types';
import { addInbox, addNews, playerName, seasonTotals } from './helpers';

/** The player stats the book keeps single-game marks for. */
export const REC_STATS = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm'] as const;
export type RecStat = (typeof REC_STATS)[number];

/** A team's night: most points, biggest win, most threes. */
export const TEAM_REC_STATS = ['pts', 'margin', 'tpm'] as const;
export type TeamRecStat = (typeof TEAM_REC_STATS)[number];

export const REC_LABEL: Record<RecStat, [string, string]> = {
  pts: ['Points', 'points'],
  reb: ['Rebounds', 'rebounds'],
  ast: ['Assists', 'assists'],
  stl: ['Steals', 'steals'],
  blk: ['Blocks', 'blocks'],
  tpm: ['Threes made', 'threes'],
};
export const TEAM_REC_LABEL: Record<TeamRecStat, string> = { pts: 'Points', margin: 'Winning margin', tpm: 'Threes made' };

/** One player's night in the record book. */
export interface GameMark {
  v: number;
  pid: number;
  name: string;
  tid: number;
  opp: number;
  season: number;
  day: number;
  gid: number;
}

/** One team's night in the record book, with the final score (its points first). */
export interface TeamMark {
  v: number;
  tid: number;
  opp: number;
  season: number;
  day: number;
  gid: number;
  score: [number, number];
}

/**
 * A player's night as the book stores it (a few thousand of these would be a tenth of the save as
 * objects): his name is frozen into it only when he leaves the save (see freezeRecordNames), so it
 * reads the same after he's gone.
 */
export type MarkRow = [v: number, pid: number, tid: number, opp: number, season: number, day: number, gid: number, name?: string];
/** A team's night as the book stores it, with the final score. */
export type TeamRow = [v: number, tid: number, opp: number, season: number, day: number, gid: number, pts: number, oppPts: number];
/** A career high as a player's record stores it. */
export type HighRow = [v: number, season: number, day: number, opp: number, gid: number];

export interface RecordShelf {
  players: Partial<Record<RecStat, MarkRow[]>>;
  teams: Partial<Record<TeamRecStat, TeamRow[]>>;
}

export interface RecordBook {
  /** The first season the book covers: the league's first, or, for a save from before the book, its oldest stored game's. */
  since: number;
  league: { reg: RecordShelf; post: RecordShelf };
  /** Each franchise's, by tid. */
  teams: Record<number, { reg: RecordShelf; post: RecordShelf }>;
}

/** A player's career high in one stat (regular season): the number and the game. */
export interface CareerHigh {
  v: number;
  season: number;
  day: number;
  opp: number;
  gid: number;
}

export function gameMark(league: League, r: MarkRow): GameMark {
  const p = league.players[r[1]];
  return { v: r[0], pid: r[1], name: r[7] ?? (p ? playerName(p) : 'Unknown'), tid: r[2], opp: r[3], season: r[4], day: r[5], gid: r[6] };
}

export function teamMark(r: TeamRow): TeamMark {
  return { v: r[0], tid: r[1], opp: r[2], season: r[3], day: r[4], gid: r[5], score: [r[6], r[7]] };
}

export function careerHighOf(p: Player, stat: RecStat): CareerHigh | undefined {
  const h = p.highs?.[stat];
  return h ? { v: h[0], season: h[1], day: h[2], opp: h[3], gid: h[4] } : undefined;
}

/** How many marks each list keeps: the league's top ten (five in the postseason), each franchise's top three (its best in the postseason). */
export const KEEP = { league: { reg: 10, post: 5 }, team: { reg: 3, post: 1 } } as const;

export type BookKind = 'reg' | 'post';

/** Which book a game goes in, if any. */
export function bookOf(type: GameType): BookKind | null {
  return type === 'regular' ? 'reg' : type === 'playoffs' || type === 'playin' ? 'post' : null;
}

const shelf = (): RecordShelf => ({ players: {}, teams: {} });

export function emptyBook(since: number): RecordBook {
  return { since, league: { reg: shelf(), post: shelf() }, teams: {} };
}

export function lineStat(b: Pick<BoxLine, 'pts' | 'orb' | 'drb' | 'ast' | 'stl' | 'blk' | 'tpm'>, stat: RecStat): number {
  return stat === 'reb' ? b.orb + b.drb : b[stat];
}

/** What ranks a row on its list: the number, when it happened, and whose it is (a night recorded twice counts once). */
export interface RowKey {
  v: number;
  season: number;
  day: number;
  gid: number;
  who: number;
}
export const markKey = (r: MarkRow): RowKey => ({ v: r[0], season: r[4], day: r[5], gid: r[6], who: r[1] });
export const teamKey = (r: TeamRow): RowKey => ({ v: r[0], season: r[3], day: r[4], gid: r[5], who: r[1] });

/** Earlier first among equals: a record tied isn't taken from whoever set it. */
const earlier = (a: Omit<RowKey, 'v' | 'who'>, b: Omit<RowKey, 'v' | 'who'>) => a.season - b.season || a.day - b.day || a.gid - b.gid;

/**
 * Put a mark on a list kept best first, at most `keep` long. Returns how it stands against the list
 * as it was: 'record' (it beats the best), 'tie' (it equals it), 'listed' (it made the list) or null.
 */
export function insertMark<R>(list: R[], row: R, keep: number, key: (r: R) => RowKey): 'record' | 'tie' | 'listed' | null {
  const m = key(row);
  if (m.v <= 0) return null;
  // the same night recorded again changes nothing
  if (
    list.some((x) => {
      const k = key(x);
      return k.gid === m.gid && k.season === m.season && k.who === m.who;
    })
  )
    return null;
  const best = list.length ? key(list[0]).v : undefined;
  if (list.length >= keep && m.v <= key(list[list.length - 1]).v) return null;
  let i = list.findIndex((x) => {
    const k = key(x);
    return k.v < m.v || (k.v === m.v && earlier(m, k) < 0);
  });
  if (i < 0) i = list.length;
  list.splice(i, 0, row);
  if (list.length > keep) list.length = keep;
  return best === undefined || m.v > best ? 'record' : m.v === best ? 'tie' : 'listed';
}

/** What a game did to the book: each record set or tied, by whom. */
export interface RecordNote {
  scope: 'league' | 'team';
  book: BookKind;
  kind: 'record' | 'tie';
  /** A player's stat, or a team's (`team`). */
  stat: RecStat | TeamRecStat;
  team?: true;
  tid: number;
  pid?: number;
  v: number;
}

function franchise(book: RecordBook, tid: number) {
  return (book.teams[tid] ??= { reg: shelf(), post: shelf() });
}

/**
 * Write one game into the book (League.records, started on the first) and its players' career
 * highs, and return the records it set or tied. A game the book doesn't count returns nothing.
 */
export function recordGame(league: League, res: GameResult): RecordNote[] {
  const kind = bookOf(res.type);
  if (!kind) return [];
  const book = (league.records ??= emptyBook(res.season));
  const notes: RecordNote[] = [];
  const sides = [
    [res.home, res.away],
    [res.away, res.home],
  ] as const;
  for (const [us, them] of sides) {
    const fr = franchise(book, us.tid)[kind];
    const lg = book.league[kind];
    for (const b of us.players) {
      if (!(b.min > 0)) continue;
      const p = league.players[b.pid];
      for (const stat of REC_STATS) {
        const v = lineStat(b, stat);
        if (v <= 0) continue;
        // a player no longer in the save (a backfill from older results) carries his name from the box score
        const row = (): MarkRow => (p ? [v, b.pid, us.tid, them.tid, res.season, res.day, res.gid] : [v, b.pid, us.tid, them.tid, res.season, res.day, res.gid, b.name]);
        const atL = insertMark((lg.players[stat] ??= []), row(), KEEP.league[kind], markKey);
        const atT = insertMark((fr.players[stat] ??= []), row(), KEEP.team[kind], markKey);
        if (atL === 'record' || atL === 'tie') notes.push({ scope: 'league', book: kind, kind: atL, stat, tid: us.tid, pid: b.pid, v });
        if (atT === 'record' || atT === 'tie') notes.push({ scope: 'team', book: kind, kind: atT, stat, tid: us.tid, pid: b.pid, v });
        if (kind === 'reg' && p) careerHigh(p, stat, [v, res.season, res.day, them.tid, res.gid]);
      }
    }
    for (const stat of TEAM_REC_STATS) {
      const v = stat === 'pts' ? us.pts : stat === 'margin' ? us.pts - them.pts : us.t.tpm;
      if (v <= 0) continue;
      const row = (): TeamRow => [v, us.tid, them.tid, res.season, res.day, res.gid, us.pts, them.pts];
      const atL = insertMark((book.league[kind].teams[stat] ??= []), row(), KEEP.league[kind], teamKey);
      const atT = insertMark((fr.teams[stat] ??= []), row(), KEEP.team[kind], teamKey);
      if (atL === 'record' || atL === 'tie') notes.push({ scope: 'league', book: kind, kind: atL, stat, team: true, tid: us.tid, v });
      if (atT === 'record' || atT === 'tie') notes.push({ scope: 'team', book: kind, kind: atT, stat, team: true, tid: us.tid, v });
    }
  }
  return notes;
}

/** A new career high replaces the old one; one equalled keeps the first. */
function careerHigh(p: Player, stat: RecStat, h: HighRow) {
  const cur = p.highs?.[stat];
  const at = (r: HighRow) => ({ season: r[1], day: r[2], gid: r[4] });
  if (cur && (cur[0] > h[0] || (cur[0] === h[0] && earlier(at(cur), at(h)) <= 0))) return;
  (p.highs ??= {})[stat] = h;
}

/** A player leaving the save (a fringe retiree compacted away) leaves his name on his marks in the book. */
export function freezeRecordNames(league: League, p: Player) {
  const book = league.records;
  if (!book) return;
  const name = playerName(p);
  const shelves = [book.league.reg, book.league.post, ...Object.values(book.teams).flatMap((t) => [t.reg, t.post])];
  for (const sh of shelves) for (const list of Object.values(sh.players)) for (const r of list ?? []) if (r[1] === p.pid && r[7] === undefined) r[7] = name;
}

/**
 * The records a game set make the news once the book has a full season behind it (on the first
 * nights every big game is "a record"): league records in every stat (and a share of the league's
 * scoring record), a franchise's scoring record of 45 or more, and the user's team's franchise
 * records in points, rebounds, assists and threes and its team scoring and winning margin, which
 * the GM hears about too. They're routine news (see addNews): the book keeps them for good.
 */
export function recordNews(league: League, res: GameResult, notes: RecordNote[]) {
  const book = league.records;
  if (!book || res.season <= book.since || !notes.length) return;
  const user = league.userTid;
  const ab = (tid: number) => league.teams[tid]?.abbrev ?? '?';
  const post = (n: RecordNote) => (n.book === 'post' ? 'playoff ' : '');
  // one line per player (or team): the league's records before the franchise's
  const byWho = new Map<string, RecordNote[]>();
  for (const n of notes) {
    const newsworthy =
      n.scope === 'league'
        ? n.kind === 'record' || (n.stat === 'pts' && !n.team)
        : n.kind === 'record' && (n.tid === user ? !['stl', 'blk'].includes(n.stat) && !(n.team && n.stat === 'tpm') : n.stat === 'pts' && !n.team && n.v >= 45);
    if (!newsworthy) continue;
    const key = n.team ? `t${n.tid}` : `p${n.pid}`;
    byWho.set(key, [...(byWho.get(key) ?? []), n]);
  }
  for (const list of byWho.values()) {
    const first = list[0];
    const opp = first.tid === res.home.tid ? res.away.tid : res.home.tid;
    // a stat that set the league's record doesn't also claim the franchise's
    const shown = list.filter((n) => n.scope === 'league' || !list.some((m) => m.scope === 'league' && m.stat === n.stat && m.kind === 'record'));
    const parts = shown.map((n) => {
      const what = recordWhat(n);
      const whose = n.scope === 'league' ? 'league' : `${league.teams[n.tid]?.name ?? 'franchise'}`;
      return `${what} (${n.kind === 'tie' ? 'tying the' : 'a'} ${whose} ${post(n)}record)`;
    });
    const who = first.team
      ? (league.teams[first.tid]?.region ?? ab(first.tid))
      : first.pid !== undefined && league.players[first.pid]
        ? playerName(league.players[first.pid])
        : '?';
    const text = `${who}${first.team ? '' : ` (${ab(first.tid)})`}: ${partsList(parts)} vs ${ab(opp)}.`;
    addNews(league, { kind: 'record', text, tids: [first.tid], pids: first.pid !== undefined ? [first.pid] : [] });
    if (first.tid === user)
      addInbox(league, {
        from: 'Media Relations',
        subject: shown.some((n) => n.scope === 'league') ? 'A league record' : 'A franchise record',
        body: `${text} The record book has it now.`,
        tone: 'good',
        link: '/history?view=records',
      });
  }
}

const partsList = (parts: string[]) => (parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/**
 * A book for a save from before the record book: read back from the results it still has (this
 * season's and last season's), so it covers those seasons; career highs come with it.
 */
export function backfillRecords(league: League) {
  if (league.records) return;
  const games = [...league.games].filter((g) => bookOf(g.type)).sort((a, b) => a.season - b.season || a.day - b.day || a.gid - b.gid);
  league.records = emptyBook(games[0]?.season ?? league.season);
  for (const g of games) recordGame(league, g);
}

// ---------------------------------------------------------------- single-season records

/** The single-season records a stat line can set: per game, a total, or a percentage. */
export type SeasonStat = 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'pts' | 'tpm' | 'fg' | 'tp' | 'ft';

export const SEASON_STAT_LABEL: Record<SeasonStat, string> = {
  ppg: 'Points per game',
  rpg: 'Rebounds per game',
  apg: 'Assists per game',
  spg: 'Steals per game',
  bpg: 'Blocks per game',
  pts: 'Points',
  tpm: 'Threes made',
  fg: 'Field goal %',
  tp: 'Three-point %',
  ft: 'Free throw %',
};

/**
 * A player's season qualifies for a per-game or percentage record the way the NBA's leaders do:
 * 70% of his team's games (58 of 82), and for the percentages 300 field goals, 82 threes or 125
 * free throws made (the regular season; in the playoffs, half his team's games and a tenth of those).
 * A season still being played counts its games so far.
 */
export function qualifies(s: PlayerStats, stat: SeasonStat, teamGames: number, playoffs: boolean): boolean {
  if (stat === 'pts' || stat === 'tpm') return s.gp > 0;
  if (!playoffs && s.gp < Math.ceil(teamGames * 0.7)) return false;
  if (playoffs && s.gp < Math.max(4, Math.ceil(teamGames * 0.5))) return false;
  const scale = playoffs ? 0.1 : Math.min(1, teamGames / 82);
  if (stat === 'fg') return s.fgm >= 300 * scale;
  if (stat === 'tp') return s.tpm >= 82 * scale;
  if (stat === 'ft') return s.ftm >= 125 * scale;
  return true;
}

export function seasonStatValue(s: PlayerStats, stat: SeasonStat): number {
  const g = Math.max(1, s.gp);
  switch (stat) {
    case 'ppg':
      return s.pts / g;
    case 'rpg':
      return (s.orb + s.drb) / g;
    case 'apg':
      return s.ast / g;
    case 'spg':
      return s.stl / g;
    case 'bpg':
      return s.blk / g;
    case 'pts':
      return s.pts;
    case 'tpm':
      return s.tpm;
    case 'fg':
      return s.fga ? s.fgm / s.fga : 0;
    case 'tp':
      return s.tpa ? s.tpm / s.tpa : 0;
    case 'ft':
      return s.fta ? s.ftm / s.fta : 0;
  }
}

export interface SeasonMark {
  v: number;
  pid: number;
  /** Where he played it: the team of the line, or for a season split between teams in the league's book, the last he played for (`teams`: all of them). */
  tid: number;
  teams?: number[];
  season: number;
  gp: number;
}

/** Games each team played in each season: the regular season's from its stored seasons, the postseason's the most any of its players played. */
function teamGamesBy(league: League, playoffs: boolean): (tid: number, season: number) => number {
  const post = new Map<string, number>();
  if (playoffs)
    for (const p of Object.values(league.players))
      for (const s of p.stats) {
        if (!s.playoffs || s.real) continue;
        const key = `${s.tid}:${s.season}`;
        if (s.gp > (post.get(key) ?? 0)) post.set(key, s.gp);
      }
  return (tid, season) => {
    if (playoffs) return post.get(`${tid}:${season}`) ?? 0;
    const ts = league.teams[tid]?.seasons.find((x) => x.season === season);
    return ts ? ts.won + ts.lost : 82;
  };
}

/**
 * The best single seasons in a stat: the league's (a season split between teams counts whole) or
 * one franchise's (its lines only), regular season or postseason, played in this league.
 */
export function seasonRecords(league: League, stat: SeasonStat, opts: { tid?: number; playoffs?: boolean; n?: number } = {}): SeasonMark[] {
  const playoffs = !!opts.playoffs;
  const games = teamGamesBy(league, playoffs);
  const out: SeasonMark[] = [];
  for (const p of Object.values(league.players)) {
    const seasons = new Set(p.stats.filter((s) => !s.real && s.playoffs === playoffs && s.gp > 0).map((s) => s.season));
    for (const season of seasons) {
      const lines = p.stats.filter((s) => !s.real && s.playoffs === playoffs && s.season === season && s.gp > 0);
      if (opts.tid !== undefined) {
        const s = lines.find((x) => x.tid === opts.tid);
        if (s && qualifies(s, stat, games(s.tid, season), playoffs)) out.push({ v: seasonStatValue(s, stat), pid: p.pid, tid: s.tid, season, gp: s.gp });
        continue;
      }
      const s = lines.length === 1 ? lines[0] : seasonTotals(p, season, playoffs);
      if (!s) continue;
      const last = lines[lines.length - 1];
      // a split season qualifies on the most games any of his teams played
      const tg = Math.max(...lines.map((x) => games(x.tid, season)));
      if (!qualifies(s, stat, tg, playoffs)) continue;
      out.push({ v: seasonStatValue(s, stat), pid: p.pid, tid: last.tid, ...(lines.length > 1 ? { teams: lines.map((x) => x.tid) } : {}), season, gp: s.gp });
    }
  }
  return out.sort((a, b) => b.v - a.v || a.season - b.season).slice(0, opts.n ?? 10);
}

// ---------------------------------------------------------------- team seasons

export type TeamSeasonStat = 'wins' | 'losses' | 'net' | 'ortg' | 'drtg' | 'ppg';

export const TEAM_SEASON_LABEL: Record<TeamSeasonStat, string> = {
  wins: 'Best record',
  losses: 'Worst record',
  net: 'Net rating',
  ortg: 'Offensive rating',
  drtg: 'Defensive rating',
  ppg: 'Points per game',
};

export interface TeamSeasonMark {
  v: number;
  tid: number;
  season: number;
  won: number;
  lost: number;
}

export function teamSeasonValue(s: TeamSeason, stat: TeamSeasonStat): number {
  const g = Math.max(1, s.won + s.lost);
  const per100 = (pts: number, poss: number) => (poss > 0 ? (pts / poss) * 100 : 0);
  switch (stat) {
    case 'wins':
      return s.won / g;
    case 'losses':
      return s.lost / g;
    case 'net':
      return per100(s.ptsFor, s.poss) - per100(s.ptsAgainst, s.oppPoss);
    case 'ortg':
      return per100(s.ptsFor, s.poss);
    case 'drtg':
      return per100(s.ptsAgainst, s.oppPoss);
    case 'ppg':
      return s.ptsFor / g;
  }
}

/**
 * The best (for the defensive rating and the worst record, the lowest) regular seasons by a team,
 * the league's or one franchise's: finished seasons only (the current one once the regular season
 * is over), so a hot start isn't a record.
 */
export function teamSeasonRecords(league: League, stat: TeamSeasonStat, opts: { tid?: number; n?: number } = {}): TeamSeasonMark[] {
  const over = !['preseason', 'regular'].includes(league.phase);
  const out: TeamSeasonMark[] = [];
  for (const t of league.teams) {
    if (opts.tid !== undefined && t.tid !== opts.tid) continue;
    for (const s of t.seasons) {
      if (s.won + s.lost === 0 || (s.season === league.season && !over) || s.season > league.season) continue;
      out.push({ v: teamSeasonValue(s, stat), tid: t.tid, season: s.season, won: s.won, lost: s.lost });
    }
  }
  const low = stat === 'drtg';
  return out.sort((a, b) => (low ? a.v - b.v : b.v - a.v) || a.season - b.season).slice(0, opts.n ?? 10);
}

// ---------------------------------------------------------------- careers

export type CareerStat = 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'tpm' | 'gp';

export const CAREER_LABEL: Record<CareerStat, string> = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', stl: 'Steals', blk: 'Blocks', tpm: 'Threes made', gp: 'Games' };

export interface CareerMark {
  v: number;
  pid: number;
  /** Active (on a team or a free agent), or retired. */
  active: boolean;
  seasons: number;
}

/** Career totals in this league's seasons (regular season or playoffs, play-in included), the league's or for one franchise. */
export function careerLeaders(league: League, stat: CareerStat, opts: { tid?: number; playoffs?: boolean; n?: number } = {}): CareerMark[] {
  const out: CareerMark[] = [];
  for (const p of Object.values(league.players)) {
    let v = 0;
    const seasons = new Set<number>();
    for (const s of p.stats) {
      if (s.real || s.playoffs !== !!opts.playoffs || (opts.tid !== undefined && s.tid !== opts.tid) || s.gp <= 0) continue;
      v += stat === 'reb' ? s.orb + s.drb : s[stat];
      seasons.add(s.season);
    }
    if (v > 0) out.push({ v, pid: p.pid, active: p.tid !== RETIRED, seasons: seasons.size });
  }
  return out.sort((a, b) => b.v - a.v).slice(0, opts.n ?? 10);
}

/** A record a game holds now: the best in the league's or a franchise's book. */
export interface HeldRecord {
  scope: 'league' | 'team';
  book: BookKind;
  stat: RecStat | TeamRecStat;
  team?: true;
  tid: number;
  pid?: number;
  v: number;
}

/**
 * The records a game holds now (the recap's "Record" line): the top of the league's or a franchise's
 * list, for a game played once the book has a full season behind it (as with the news). A franchise
 * record that's also the league's is named once, as the league's.
 */
export function recordsHeld(league: League, res: GameResult): HeldRecord[] {
  const book = league.records;
  const kind = bookOf(res.type);
  if (!book || !kind || res.season <= book.since) return [];
  const out: HeldRecord[] = [];
  const top = <R>(list: R[] | undefined, key: (r: R) => RowKey) => {
    const k = list?.[0] !== undefined ? key(list[0]) : undefined;
    return k && k.gid === res.gid && k.season === res.season ? k : undefined;
  };
  for (const stat of REC_STATS) {
    const lg = top(book.league[kind].players[stat], markKey);
    const lgTid = book.league[kind].players[stat]?.[0]?.[2];
    if (lg && lgTid !== undefined) out.push({ scope: 'league', book: kind, stat, tid: lgTid, pid: lg.who, v: lg.v });
    for (const tid of [res.home.tid, res.away.tid]) {
      const m = top(book.teams[tid]?.[kind].players[stat], markKey);
      if (m && !(lg && lg.who === m.who)) out.push({ scope: 'team', book: kind, stat, tid, pid: m.who, v: m.v });
    }
  }
  for (const stat of TEAM_REC_STATS) {
    const lg = top(book.league[kind].teams[stat], teamKey);
    if (lg) out.push({ scope: 'league', book: kind, stat, team: true, tid: lg.who, v: lg.v });
    for (const tid of [res.home.tid, res.away.tid]) {
      const m = top(book.teams[tid]?.[kind].teams[stat], teamKey);
      if (m && !(lg && lg.who === m.who)) out.push({ scope: 'team', book: kind, stat, team: true, tid, v: m.v });
    }
  }
  return out;
}

/** "52 points", "a 41-point win", "24 threes": a held record's number, said as the recap and news say it. */
export function recordWhat(r: Pick<HeldRecord, 'stat' | 'team' | 'v'>): string {
  if (r.team) return r.stat === 'margin' ? `a ${r.v}-point win` : `${r.v} ${r.stat === 'pts' ? 'points' : 'threes'}`;
  return `${r.v} ${REC_LABEL[r.stat as RecStat][1]}`;
}
