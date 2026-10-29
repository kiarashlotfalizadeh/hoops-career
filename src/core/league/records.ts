// The record book: the best single-game performances since the league began, by a player and by a
// team, for the league and for each franchise (League.records), and each player's regular-season
// career highs (Player.highs). Results older than last season are pruned from the save, so these are
// kept as each game is recorded. Single-season and career records are read from what the save keeps
// for good: every player's and team's seasons. Only seasons played in this league count: the real
// seasons a seeded player arrives with are history from before it, and his career highs are the
// league's ("since 2026-27") unless his whole career is on record or the seed brought his real ones
// (League.realHighs: from every NBA game he had played, as a seed from the game files does; a real
// high has no game in this league to open, game id -1). Career totals follow the same
// rule: a real player whose whole career is on record counts it all (LeBron James's points lead the
// list from the first day, as his franchises' leaders do on their pages).
//
// The regular season (NBA Cup group games, quarterfinals and semifinals included) and the postseason
// (play-in and playoffs) keep separate books; the Cup championship and the All-Star Game count in
// neither, as they count in neither's stats.

import type { BoxLine, GameResult, GameType, League, Player, PlayerStats, TeamSeason } from '../types';
import { RETIRED } from '../types';
import { addInbox, addNews, dateToDay, playerName, seasonTotals } from './helpers';
import { realCareerOnRecord } from '../analysis/milestones';
import { seasonLabel } from '../constants';
import { plural } from '../format';

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
  /** The first season the book covers: the league's first, or, for a save from before the book, the season it was read back in (see backfillRecords). */
  since: number;
  /**
   * In a real league, the first season of the NBA's single games the book opened with (1997: every
   * game since 1996-97, from the game files: see seedRecords). Its lists then reach back that far;
   * career highs and the "first season" rule still go by `since`.
   */
  from?: number;
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
 *
 * Each list is judged once, against its best from before the game: the night's best mark on it is
 * the record (two players can't both set one by passing the old best in turn), and a list the book
 * had nothing on yet (a franchise's first postseason) only starts.
 */
export function recordGame(league: League, res: GameResult): RecordNote[] {
  const kind = bookOf(res.type);
  if (!kind) return [];
  const book = (league.records ??= emptyBook(res.season));
  const notes: RecordNote[] = [];
  const tonight = (k: RowKey) => k.gid === res.gid && k.season === res.season;
  // every list the game touches, with how to judge it once all its rows are in (the order lists were first touched: the league's before the franchise's)
  const judged = new Map<unknown[], () => void>();
  const put = <R>(list: R[], row: R, keep: number, key: (r: R) => RowKey, note: (r: R, kind: 'record' | 'tie') => void) => {
    if (!judged.has(list)) {
      const before = list.length ? key(list[0]).v : undefined;
      judged.set(list, () => {
        if (before === undefined || !list.length) return;
        const top = key(list[0]);
        // a new best: whoever reached it tonight; else whoever equalled the old one (a tie stays first with whoever set it)
        const at = tonight(top) && top.v > before ? top.v : top.v === before ? before : undefined;
        if (at === undefined) return;
        for (const r of list) {
          const k = key(r);
          if (k.v !== at) break;
          if (tonight(k)) note(r, at > before ? 'record' : 'tie');
        }
      });
    }
    insertMark(list, row, keep, key);
  };
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
        const note = (scope: RecordNote['scope']) => (r: MarkRow, k: RecordNote['kind']) => notes.push({ scope, book: kind, kind: k, stat, tid: r[2], pid: r[1], v: r[0] });
        put((lg.players[stat] ??= []), row(), KEEP.league[kind], markKey, note('league'));
        put((fr.players[stat] ??= []), row(), KEEP.team[kind], markKey, note('team'));
        if (kind === 'reg' && p) careerHigh(p, stat, [v, res.season, res.day, them.tid, res.gid]);
      }
    }
    for (const stat of TEAM_REC_STATS) {
      const v = stat === 'pts' ? us.pts : stat === 'margin' ? us.pts - them.pts : us.t.tpm;
      if (v <= 0) continue;
      const row = (): TeamRow => [v, us.tid, them.tid, res.season, res.day, res.gid, us.pts, them.pts];
      const note = (scope: RecordNote['scope']) => (r: TeamRow, k: RecordNote['kind']) => notes.push({ scope, book: kind, kind: k, stat, team: true, tid: r[1], v: r[0] });
      put((book.league[kind].teams[stat] ??= []), row(), KEEP.league[kind], teamKey, note('league'));
      put((fr.teams[stat] ??= []), row(), KEEP.team[kind], teamKey, note('team'));
    }
  }
  for (const judge of judged.values()) judge();
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
export function recordNews(league: League, res: GameResult, notes0: RecordNote[]) {
  const book = league.records;
  if (!book) return;
  seasonMarkNews(league, res);
  // (in the book's first season only a night of BIG_NIGHT points is news: SGA's 67 made none; a book opened with the NBA's games is past that)
  const notes = youngBook(book, res.season) ? notes0.filter(bigNight) : notes0;
  if (!notes.length) return;
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
    // a stat that set or tied the league's record names the number once: a franchise record set with a share of the league's goes with it
    const shown = list.filter((n) => n.scope === 'league' || !list.some((m) => m.scope === 'league' && m.stat === n.stat));
    // (how far back it reaches: "a Bulls record since 1996-97", in a league that has the NBA's past)
    const whose = (n: RecordNote) => `${n.scope === 'league' ? 'league' : (league.teams[n.tid]?.name ?? 'franchise')} ${post(n)}record${recordSpan(league, n)}`;
    const parts = shown.map((n) => {
      const also = n.kind === 'tie' && list.find((m) => m.scope === 'team' && m.stat === n.stat && m.kind === 'record');
      return `${recordWhat(n)} (${n.kind === 'tie' ? `tying the ${whose(n)}${also ? `, a ${whose(also)}` : ''}` : `a ${whose(n)}`})`;
    });
    const who = first.team
      ? (league.teams[first.tid]?.region ?? ab(first.tid))
      : first.pid !== undefined && league.players[first.pid]
        ? playerName(league.players[first.pid])
        : '?';
    const text = `${who}${first.team ? '' : ` (${ab(first.tid)})`}: ${partsList(parts)} vs ${ab(opp)}.`;
    // a league record set in another team's game is the front page (the user's own games tell theirs:
    // their story leads with it, see gameStory.ts), with a headline about the record
    const lg = shown.find((n) => n.scope === 'league' && n.book === 'reg' && n.kind === 'record');
    const userGame = res.home.tid === user || res.away.tid === user;
    if (lg && !userGame && remarkable(lg)) {
      const what = recordWhat({ stat: lg.stat, team: lg.team, v: lg.v });
      const oppName = league.teams[opp]?.name ?? ab(opp);
      const span = recordSpan(league, lg);
      const teamName = league.teams[first.tid]?.name ?? who;
      // (a real league's record short of the NBA's older one is the most since 1996-97, and says whose stands)
      const head = span
        ? lg.team
          ? `The ${teamName} put up ${what}, the most${span}`
          : `${who} scores ${what}, the most${span}`
        : lg.team
          ? `The ${teamName} set a league record: ${what}`
          : `${who} sets a league record: ${what}`;
      addNews(league, {
        kind: 'record',
        head,
        text: `${lg.team ? `Against the ${oppName}` : `For the ${league.teams[first.tid]?.name ?? ab(first.tid)} against the ${oppName}`}: the most in a game ${recordReach(league, lg, res.season)}${pastMarkWords(league, lg)}.`,
        tids: [first.tid, opp],
        pids: first.pid !== undefined ? [first.pid] : [],
        weight: 3,
      });
    } else addNews(league, { kind: 'record', text, tids: [first.tid], pids: first.pid !== undefined ? [first.pid] : [] });
    if (first.tid === user)
      addInbox(league, {
        from: 'Media Relations',
        // whose record, in the subject
        subject: `${shown.some((n) => n.scope === 'league') ? 'League' : 'Franchise'} record: ${who}`,
        body: `${text} The record book has it now.`,
        tone: 'good',
        link: '/league/history?view=records',
      });
  }
}

/**
 * How far back a record reaches, said after "a league record" or "a Bulls record": nothing in a
 * fictional league (its book is its whole history) or for a real league's record past the NBA's
 * all-time mark; else " since 1996-97" (" since 2026-27" in a book from before the NBA's games were in
 * it): every franchise record, and a league record short of an older mark (82 points would be the
 * most since 1996-97, not Wilt Chamberlain's 100).
 */
export function recordSpan(league: League, n: Pick<RecordNote, 'scope' | 'book' | 'stat' | 'team' | 'v'>): string {
  const book = league.records;
  if (!book || !league.past) return '';
  const since = ` since ${seasonLabel(bookFrom(book))}`;
  if (n.scope === 'team' || book.from === undefined) return since;
  const past = pastMark(n.book, n.stat, n.team);
  return past && n.v < past.v ? since : '';
}

/**
 * Where a league record stands, said after "the most in a game": "in league history" (a real
 * league's past the NBA's all-time mark), "since 1996-97" (short of it), "in this league" (a young
 * book's), or since the book began (a fictional league's, or a book from before the NBA's games).
 */
export function recordReach(league: League, n: Pick<RecordNote, 'book' | 'stat' | 'team' | 'v'>, season = league.season): string {
  const book = league.records;
  if (!book || youngBook(book, season)) return 'in this league';
  const span = recordSpan(league, { ...n, scope: 'league' });
  return span ? span.trim() : book.from !== undefined ? 'in league history' : `since ${seasonLabel(book.since)}`;
}

/** ", past Kobe Bryant's 81 in 2005-06" (the mark it beat), and when an older record still stands, whose: a league record's front page. */
function pastMarkWords(league: League, n: RecordNote): string {
  const book = league.records!;
  const kind = n.book;
  const label = (season: number) => seasonLabel(season);
  let out = '';
  if (n.team) {
    const prev = (book.league[kind].teams[n.stat as TeamRecStat] ?? []).map(teamMark).find((m) => m.v < n.v);
    if (prev) out += `, past ${prev.v} by the ${league.teams[prev.tid]?.name ?? '?'} in ${label(prev.season)}`;
  } else {
    const prev = (book.league[kind].players[n.stat as RecStat] ?? []).map((r) => gameMark(league, r)).find((m) => m.v < n.v);
    if (prev) out += `, past ${prev.name}'s ${prev.v} in ${label(prev.season)}`;
  }
  const past = book.from !== undefined ? pastMark(kind, n.stat, n.team) : undefined;
  if (past && n.v < past.v) out += `. The record is still ${past.who ? `${past.who}'s ${past.v} for the ${past.as}` : `${past.v}, by the ${past.as},`} in ${label(past.season)}`;
  return out;
}

/**
 * A season's marks as they're reached, for any team (the user's too: his front page is his moment):
 * the wins that equal or pass the most in a regular season (a real league's past the 73-9 Warriors and
 * the 72-10 Bulls: 72 is level with the Bulls, 73 with the Warriors, 74 the most ever; this league's own
 * finished seasons count too), and a winning streak that equals or passes the Lakers' 33 (a real
 * league's). Each is reached once in a season: a win adds one.
 */
function seasonMarkNews(league: League, res: GameResult) {
  if (res.type !== 'regular') return;
  const won = res.home.pts > res.away.pts ? res.home : res.away;
  const lost = won === res.home ? res.away : res.home;
  const tid = won.tid;
  const team = league.teams[tid];
  const ts = team?.seasons.find((x) => x.season === res.season);
  if (!ts) return;
  const user = league.userTid;
  const left = Math.max(0, 82 - ts.won - ts.lost);
  const score = `${won.pts}-${lost.pts} over the ${league.teams[lost.tid]?.name ?? '?'}`;
  const tell = (head: string, text: string) => {
    addNews(league, { kind: 'record', head, text, tids: [tid], pids: [], weight: 3 });
    if (tid === user) addInbox(league, { from: 'Media Relations', subject: head, body: text, tone: 'good', link: '/league/history?view=records' });
  };
  if (ts.won >= 70) {
    const bar = winsBar(league, res.season);
    const top = bar[0];
    const second = bar.find((b) => b.won < (top?.won ?? 0));
    const them = (b: WinsMark) => `the ${seasonLabel(b.season)} ${b.as} (${b.won}-${b.lost})`;
    const tail = left ? ` ${plural(left, 'game')} left.` : ' The regular season is over.';
    if (top && ts.won === top.won + 1)
      tell(`${ts.won} wins: the ${team.name} pass the record`, `No. ${ts.won} came ${score}: the most wins in a season in league history, past ${them(top)}.${tail}`);
    else if (top && ts.won === top.won)
      tell(`${ts.won} wins: the ${team.name} tie the record`, `No. ${ts.won} came ${score}. It ties ${them(top)} for the most wins in league history.${tail}`);
    else if (second && ts.won === second.won)
      tell(`${ts.won} wins for the ${team.name}`, `No. ${ts.won} came ${score}, level with ${them(second)}. Only ${them(top!)} won more.${tail}`);
  }
  const streak = ALL_TIME_TEAM.streak;
  if (league.past && (ts.streak === streak.v || ts.streak === streak.v + 1)) {
    const lakers = `the ${seasonLabel(streak.season)} ${streak.as} (${streak.v})`;
    if (ts.streak === streak.v)
      tell(
        `${ts.streak} straight: the ${team.name} match the record`,
        `The run reached ${ts.streak} with ${score}. It ties ${lakers} for the longest winning streak in league history.`,
      );
    else tell(`${ts.streak} straight: the longest winning streak ever`, `The ${team.name} made it ${ts.streak} in a row with ${score}, past ${lakers}.`);
  }
}

/** A season's wins on the record: the NBA's or this league's. */
export interface WinsMark {
  won: number;
  lost: number;
  tid?: number;
  /** The team's name then: "Golden State Warriors". */
  as: string;
  season: number;
}

/** The most wins in a regular season, most first (earlier first among equals): a real league's NBA past (the 73-9 Warriors, the 72-10 Bulls) and this league's finished seasons of 70 or more before `season`. */
export function winsBar(league: League, season = league.season): WinsMark[] {
  const tidOf = new Map(league.teams.map((t) => [t.abbrev, t.tid]));
  const out: WinsMark[] = league.past ? ALL_TIME_TEAM.wins.map((w) => ({ won: w.won, lost: w.lost, tid: tidOf.get(w.team), as: w.as, season: w.season })) : [];
  for (const t of league.teams)
    for (const s of t.seasons) if (s.season < season && s.won >= 70) out.push({ won: s.won, lost: s.lost, tid: t.tid, as: `${t.region} ${t.name}`, season: s.season });
  return out.sort((a, b) => b.won - a.won || a.season - b.season);
}

/**
 * A league record big enough for the front page on its own: in a league's first seasons the book is
 * young and its records fall often (a ninth steal can be "a league record" in the second season), so
 * the front page waits for a night the NBA would notice too, about its own all-time top ten: 60
 * points, 25 rebounds, 20 assists, 9 steals, 10 blocks, 13 threes; a team's 160 points, 28 threes or a
 * 55-point win. Lesser records stay the wire's line.
 */
const REMARKABLE: Record<string, number> = { pts: 60, reb: 25, ast: 20, stl: 9, blk: 10, tpm: 13, 'team-pts': 160, 'team-tpm': 28, 'team-margin': 55 };
/** Points in a game that are news from the league's first night: a record book that young still remembers a 60-point game. */
export const BIG_NIGHT = 60;
const bigNight = (n: RecordNote) => n.scope === 'league' && n.kind === 'record' && n.stat === 'pts' && !n.team && n.v >= BIG_NIGHT;

const remarkable = (n: RecordNote) => n.v >= (REMARKABLE[n.team ? `team-${n.stat}` : n.stat] ?? Infinity);

const partsList = (parts: string[]) => (parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/**
 * A book for a save from before the record book: read back from this season's results, the only
 * ones the save still has whole (of last season's it keeps only the user's games, which would make
 * a book of their best nights), so it covers this season on; career highs come with it.
 */
export function backfillRecords(league: League) {
  if (league.records) return;
  const games = [...league.games].filter((g) => g.season === league.season && bookOf(g.type)).sort((a, b) => a.day - b.day || a.gid - b.gid);
  // (with nothing to read the book starts with the first game, as a new league's does: a save comes back as it went)
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
 * Could one of his seasons in this league stand in a single-season record list (see seasonRecords)?
 * A regular season of 70% of his teams' games (split between teams, as the league's list counts it)
 * qualifies for the per-game and percentage lists, and a playoff run of four games may on a
 * franchise's short postseason lists. A cheap test before holdsSeasonRecord reads the lists.
 */
export function mayHoldSeasonRecord(league: League, p: Player): boolean {
  const reg = new Map<number, { gp: number; games: number }>();
  for (const s of p.stats) {
    if (s.real || s.gp <= 0) continue;
    if (s.playoffs) {
      if (s.gp >= 4) return true;
      continue;
    }
    const ts = league.teams[s.tid]?.seasons.find((x) => x.season === s.season);
    const r = reg.get(s.season) ?? { gp: 0, games: 0 };
    r.gp += s.gp;
    r.games = Math.max(r.games, ts ? ts.won + ts.lost : 82);
    reg.set(s.season, r);
  }
  return [...reg.values()].some((r) => r.gp >= Math.ceil(r.games * 0.7));
}

/**
 * Does one of his seasons stand in a single-season record list, the league's or a franchise's he
 * played for, in the regular season or the playoffs? Compaction keeps such a fringe retiree, since
 * the lists are read from the players the save keeps (a big total season without the games to
 * qualify for the per-game lists is let go: see mayHoldSeasonRecord).
 */
export function holdsSeasonRecord(league: League, p: Player): boolean {
  if (!mayHoldSeasonRecord(league, p)) return false;
  const tids = [...new Set(p.stats.filter((s) => !s.real).map((s) => s.tid))];
  for (const playoffs of [false, true])
    for (const stat of Object.keys(SEASON_STAT_LABEL) as SeasonStat[])
      for (const tid of [undefined, ...tids]) if (seasonRecords(league, stat, { tid, playoffs }).some((m) => m.pid === p.pid)) return true;
  return false;
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

/**
 * Career totals (regular season or playoffs, play-in included), the league's or for one franchise:
 * this league's seasons, and with `real` the real seasons before it of a player whose whole career
 * is on record (see realCareerOnRecord).
 */
export function careerLeaders(league: League, stat: CareerStat, opts: { tid?: number; playoffs?: boolean; n?: number; real?: boolean } = {}): CareerMark[] {
  const out: CareerMark[] = [];
  for (const p of Object.values(league.players)) {
    let v = 0;
    const seasons = new Set<number>();
    const real = !!opts.real && realCareerOnRecord(league, p);
    for (const s of p.stats) {
      if ((s.real && !real) || s.playoffs !== !!opts.playoffs || (opts.tid !== undefined && s.tid !== opts.tid) || s.gp <= 0) continue;
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
  if (!book || !kind) return [];
  // (the book's first season: only a night of BIG_NIGHT points, as with the news)
  if (youngBook(book, res.season)) {
    const top = book.league[kind].players.pts?.[0];
    return top && top[0] >= BIG_NIGHT && top[6] === res.gid && top[4] === res.season ? [{ scope: 'league', book: kind, stat: 'pts', tid: top[2], pid: top[1], v: top[0] }] : [];
  }
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

/** "52 points", "a 41-point win" ("an 18-point win"), "24 threes": a held record's number, said as the recap and news say it. */
export function recordWhat(r: Pick<HeldRecord, 'stat' | 'team' | 'v'>): string {
  const an = r.v === 8 || r.v === 11 || r.v === 18 || (r.v >= 80 && r.v < 90);
  if (r.team) return r.stat === 'margin' ? `${an ? 'an' : 'a'} ${r.v}-point win` : `${r.v} ${r.stat === 'pts' ? 'points' : 'threes'}`;
  return `${r.v} ${REC_LABEL[r.stat as RecStat][1]}`;
}

// ---------------------------------------------------------------- the NBA before the league

/** A player's night as records.json keeps it: the number, his NBA.com person id, his team and the opponent (today's franchise codes), the season, the date (yyyymmdd) and NBA.com's game id. */
export type SeedMarkRow = [v: number, nbaId: number, team: string, opp: string, season: number, date: number, gid: number];
/** A team's night as records.json keeps it, with the final score. */
export type SeedTeamRow = [v: number, team: string, opp: string, season: number, date: number, gid: number, pts: number, oppPts: number];
export interface SeedShelf {
  players: Partial<Record<RecStat, SeedMarkRow[]>>;
  teams: Partial<Record<TeamRecStat, SeedTeamRow[]>>;
}

/** src/data/records.json (written by scripts/data/records-apply.ts): the book's lists from every NBA game since 1996-97. */
export interface RecordsData {
  /** The first season the files cover, and the last before the league. */
  from: number;
  through: number;
  league: { reg: SeedShelf; post: SeedShelf };
  /** By franchise code. */
  teams: Record<string, { reg: SeedShelf; post: SeedShelf }>;
  /** The listed players' names, by NBA.com person id. */
  names: Record<number, string>;
}

/**
 * Open a real league's book with the NBA's single games since 1996-97 (records.json): the league's
 * lists and each franchise's, as long as the book keeps them, so a 60-point night in its first week
 * is measured against Kobe Bryant's 81. A player still in the league is linked by his NBA.com id;
 * one long gone carries his name, under a pid of his own below zero (-his NBA.com id), and every such
 * night a game id below zero (no game in this league to open). Once only: a book that has them keeps them.
 */
export function seedRecords(league: League, data: RecordsData) {
  const book = (league.records ??= emptyBook(league.startSeason));
  if (book.from !== undefined) return;
  const tidOf = new Map(league.teams.map((t) => [t.abbrev, t.tid]));
  const pidOf = new Map<number, number>();
  for (const p of Object.values(league.players)) if (p.nbaId) pidOf.set(p.nbaId, p.pid);
  const before = league.startSeason;
  const day = (season: number, d: number) => dateToDay(season, (Math.floor(d / 100) % 100) - 1, d % 100);
  const fill = (to: RecordShelf, from: SeedShelf, keep: number) => {
    for (const stat of REC_STATS)
      for (const [v, nba, team, opp, season, d, gid] of from.players[stat] ?? []) {
        const tid = tidOf.get(team);
        const o = tidOf.get(opp);
        if (tid === undefined || o === undefined || season >= before) continue;
        const pid = pidOf.get(nba);
        const row: MarkRow = pid !== undefined ? [v, pid, tid, o, season, day(season, d), -gid] : [v, -nba, tid, o, season, day(season, d), -gid, data.names[nba] || 'Unknown'];
        insertMark((to.players[stat] ??= []), row, keep, markKey);
      }
    for (const stat of TEAM_REC_STATS)
      for (const [v, team, opp, season, d, gid, pts, oppPts] of from.teams[stat] ?? []) {
        const tid = tidOf.get(team);
        const o = tidOf.get(opp);
        if (tid === undefined || o === undefined || season >= before) continue;
        insertMark((to.teams[stat] ??= []), [v, tid, o, season, day(season, d), -gid, pts, oppPts], keep, teamKey);
      }
  };
  for (const kind of ['reg', 'post'] as const) {
    fill(book.league[kind], data.league[kind], KEEP.league[kind]);
    for (const [code, t] of Object.entries(data.teams)) {
      const tid = tidOf.get(code);
      if (tid !== undefined) fill(franchise(book, tid)[kind], t[kind], KEEP.team[kind]);
    }
  }
  book.from = data.from;
}

/** The first season the book's single games reach back to: 1996-97 in a real league's (the NBA's games), else its own first. */
export const bookFrom = (book: RecordBook) => book.from ?? book.since;

/**
 * A book in its first season with nothing before it: every big night would be "a record" (see
 * BIG_NIGHT). A book opened with the NBA's games isn't young.
 */
export const youngBook = (book: RecordBook, season: number) => book.from === undefined && season <= book.since;

/** A record from before the game files (1996-97), public record: the number, who, his franchise today and its name then, the season. */
export interface PastMark {
  v: number;
  who?: string;
  team: string;
  as: string;
  season: number;
  /** A team's night: the final score. */
  score?: [number, number];
}

/**
 * The single-game records older than the game files, the NBA's all-time marks (a record since
 * 1996-97 is the all-time one where none is listed: Klay Thompson's 14 threes, the Grizzlies' 73-point
 * win). Team marks are keyed `team-<stat>`.
 */
export const ALL_TIME: Record<BookKind, Partial<Record<RecStat | `team-${TeamRecStat}`, PastMark>>> = {
  reg: {
    pts: { v: 100, who: 'Wilt Chamberlain', team: 'GSW', as: 'Philadelphia Warriors', season: 1962 },
    reb: { v: 55, who: 'Wilt Chamberlain', team: 'GSW', as: 'Philadelphia Warriors', season: 1961 },
    ast: { v: 30, who: 'Scott Skiles', team: 'ORL', as: 'Orlando Magic', season: 1991 },
    stl: { v: 11, who: 'Larry Kenon', team: 'SAS', as: 'San Antonio Spurs', season: 1977 },
    blk: { v: 17, who: 'Elmore Smith', team: 'LAL', as: 'Los Angeles Lakers', season: 1974 },
    'team-pts': { v: 186, team: 'DET', as: 'Detroit Pistons', season: 1984, score: [186, 184] },
  },
  post: {
    pts: { v: 63, who: 'Michael Jordan', team: 'CHI', as: 'Chicago Bulls', season: 1986 },
    reb: { v: 41, who: 'Wilt Chamberlain', team: 'PHI', as: 'Philadelphia 76ers', season: 1967 },
    ast: { v: 24, who: 'Magic Johnson', team: 'LAL', as: 'Los Angeles Lakers', season: 1984 },
    'team-pts': { v: 157, team: 'BOS', as: 'Boston Celtics', season: 1990, score: [157, 128] },
  },
};

/** The NBA's single-game record from before the game files, if it's older than theirs. */
export const pastMark = (kind: BookKind, stat: RecStat | TeamRecStat, team?: boolean): PastMark | undefined =>
  ALL_TIME[kind][team ? (`team-${stat as TeamRecStat}` as const) : (stat as RecStat)];

/** The NBA's single-season records (regular season, public record), for the all-time list beside this league's. */
export const ALL_TIME_SEASON: Partial<Record<SeasonStat, PastMark>> = {
  ppg: { v: 50.4, who: 'Wilt Chamberlain', team: 'GSW', as: 'Philadelphia Warriors', season: 1962 },
  rpg: { v: 27.2, who: 'Wilt Chamberlain', team: 'GSW', as: 'Philadelphia Warriors', season: 1961 },
  apg: { v: 14.5, who: 'John Stockton', team: 'UTA', as: 'Utah Jazz', season: 1990 },
  spg: { v: 3.67, who: 'Alvin Robertson', team: 'SAS', as: 'San Antonio Spurs', season: 1986 },
  bpg: { v: 5.56, who: 'Mark Eaton', team: 'UTA', as: 'Utah Jazz', season: 1985 },
  pts: { v: 4029, who: 'Wilt Chamberlain', team: 'GSW', as: 'Philadelphia Warriors', season: 1962 },
  tpm: { v: 402, who: 'Stephen Curry', team: 'GSW', as: 'Golden State Warriors', season: 2016 },
};

/** A team's season as the NBA's records keep it. */
export interface PastTeamSeason {
  won: number;
  lost: number;
  team: string;
  as: string;
  season: number;
}

/** The NBA's best regular seasons (the two over 70 wins), its worst, and its longest winning streak (public record). */
export const ALL_TIME_TEAM: { wins: PastTeamSeason[]; worst: PastTeamSeason; streak: { v: number; team: string; as: string; season: number } } = {
  wins: [
    { won: 73, lost: 9, team: 'GSW', as: 'Golden State Warriors', season: 2016 },
    { won: 72, lost: 10, team: 'CHI', as: 'Chicago Bulls', season: 1996 },
  ],
  worst: { won: 7, lost: 59, team: 'CHA', as: 'Charlotte Bobcats', season: 2012 },
  streak: { v: 33, team: 'LAL', as: 'Los Angeles Lakers', season: 1972 },
};
