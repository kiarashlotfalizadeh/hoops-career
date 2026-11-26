// The season's review, read like a ceremony when the Finals end (see legacySeasonEnd): the record and
// how the season ended, against what the owner asked (his verdict is owner.ts's review, read from
// League.ownerReviews) and what the press predicted on opening night, the season's best win, its best
// player and its breakout, the records set, the honors, and what next season should bring. Built once
// a season from the league as it stands that night and kept small (a few hundred bytes), so it reads
// the same years later when the games behind it are gone.
import type { League, Player, PlayerStats, RatingKey, TacticEdit, TrainingFocus, Txn } from '../types';
import { seasonLabel } from '../constants';
import { playerName } from './helpers';
import { coachCareer, userCoach } from './coaches';
import { confStandings } from './standings';
import { SEASON_GAMES, currentGoals, leagueOutlook } from './ownerGoals';
import { teamSeasonRecords } from './records';
import { REC_LABEL, REC_STATS, TEAM_REC_STATS, recordSpan, recordWhat, youngBook } from './records';
import { playerAge } from '../playerGen';
import { bestWinOf, legacyOf, type PulsePoint, type SignatureWin } from './legacy';
import { fanScore } from './legacyPulse';
import { jobSecurity } from './jobSecurity';
import { money, ordinal, plural } from '../format';
import { CHECK_AFTER, CHECK_END_MIN, editCall, editsOf, playedSince } from '../ai/tacticEdits';
import { SINCE } from '../analysis/staffWords';
import { seasonCoachingLine } from '../analysis/debrief';
import { FOCUS_KEYS, FOCUS_META } from './progression';
import { focusChances } from './devWatch';
import { needNow } from './rosterNeed';
import { QUALITY_META, type QualityId } from '../analysis/system';

export interface SeasonReview {
  season: number;
  tid: number;
  won: number;
  lost: number;
  conf: 'E' | 'W';
  /** Where the team finished in its conference. */
  confRank?: number;
  /** The playoff seed, if it had one. */
  seed?: number;
  /** How the season ended (TeamSeason.playoffRound: −1 missed, 1-4 the round lost in, 5 champion). */
  round: number;
  /** What the press predicted on opening night, if it did. */
  press?: { wins: number; confRank: number; champ: boolean };
  /** The owner's wins goal (a full season's), if he set one on opening night. */
  ownerWins?: number;
  /** The season's best win. */
  best?: SignatureWin;
  /** The team's best player this season, and his line. */
  star?: { pid: number; name: string; line: string };
  /** A young player who broke out: his OVR a year ago and now, and his line. */
  breakout?: { pid: number; name: string; from: number; to: number; line: string };
  /** Records set ("Franchise record: 61 wins"), at most four. */
  records: string[];
  /** The season's honors for the coach and his players ("Coach of the Year", "Jalen Brunson: All-League 2nd Team"). */
  honors: string[];
  /** The owner's and the fans' pulse through the season, and where both ended. */
  pulse?: PulsePoint[];
  owner?: number;
  fans?: number;
  /** What the roster as it stands should win next season (the owner's read), unless he was fired. */
  next?: { wins: number };
  fired?: true;
  /** Job security when it was off for the season (changes wait for opening night, so one a season). */
  jobSecurity?: false;
  /**
   * The coach's own decisions and what came of them, a thread each (see decisionThreads): a move from
   * why to what's still open, his players' training, his tactical changes and his live coaching.
   */
  threads?: DecisionThread[];
  /** Reviews from before threads: the same as a line each. */
  decisions?: string[];
}

/** One decision of the coach's, told once from why to what's still open (see decisionThreads). */
export interface DecisionThread {
  title: string;
  /** Its takeaway in a short line ("Rim protection D → B; Gobert 31 MPG"); the rows are the evidence. Absent in older reviews. */
  summary?: string;
  /** Its parts in order, each said once: 'Why', 'In', 'Cost', 'Use', 'Result', 'Open' for a move; a name or a change for the rest. */
  rows: [label: string, text: string][];
}

/** Moves the review follows, at most: trades, then signings made for a need. */
const TRADES_MAX = 4;
const SIGNINGS_MAX = 2;
/** Days a focus has to have run in season before its skills are read at all. */
const FOCUS_MIN_DAYS = 30;

/** "+3.1" / "−2.0": a signed figure as the review's lines read it. */
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`;

/**
 * A player's role and worth with one team in a season, not just his scoring: games, minutes, his
 * line, and the team's net per 100 possessions with him on the floor ("41 games, 28 MPG, 14/6/3,
 * +3.1 per 100 on court"). Null when he didn't play for it.
 */
function roleLine(p: Player | undefined, season: number, tid: number): string | null {
  const s = p && lineOf(p, season, tid);
  if (!s?.gp) return null;
  const box = `${Math.round(s.pts / s.gp)}/${Math.round((s.orb + s.drb) / s.gp)}/${Math.round(s.ast / s.gp)}`;
  const net = s.onPoss >= 200 ? `, ${signed(((s.onPtsFor - s.onPtsAgainst) / s.onPoss) * 100)} per 100 on court` : '';
  return `${plural(s.gp, 'game')}, ${Math.round(s.min / s.gp)} MPG, ${box}${net}`;
}

/** Who came in, in a few words: the one his team played most ("Gobert 31 MPG, +4.2 per 100"; "Gobert hasn't played"). */
function playedShort(ps: Player[], season: number, tid: number): string | null {
  const rows = ps.map((p) => ({ p, s: lineOf(p, season, tid) }));
  const top = rows.filter((x) => x.s?.gp).sort((a, b) => b.s!.min - a.s!.min)[0];
  if (!top) {
    const p = ps[0];
    return p ? `${p.lastName} ${p.tid === tid ? "hasn't played" : 'gone since'}` : null;
  }
  const s = top.s!;
  const net = s.onPoss >= 200 ? `, ${signed(((s.onPtsFor - s.onPtsAgainst) / s.onPoss) * 100)} per 100` : '';
  return `${top.p.lastName} ${Math.round(s.min / s.gp)} MPG${net}`;
}

/**
 * A traded pick as the deal named it, whose it is (the log names it as its sender held it: his own
 * plain, "2028 1st", another's with its team): "your 2028 1st", "the BOS 2029 2nd". `open`: its
 * draft is still to come, so what it turns into isn't known yet.
 */
function pickOf(label: string, season: number, owner: string | null): { text: string; open: boolean } {
  const y = Number(/^(\d{4})/.exec(label)?.[1]);
  const text = /\(\w+\)/.test(label) ? label : owner === null ? `your ${label}` : `the ${owner} ${label}`;
  return { text, open: !!y && y >= season };
}

/** What a training focus is for, measured where it shows: the stat it should move. */
const FOCUS_STAT: Partial<Record<TrainingFocus, { label: string; pct: boolean; of: (s: PlayerStats) => number | null }>> = {
  shooting: { label: '3P%', pct: true, of: (s) => (s.tpa >= 40 ? (s.tpm / s.tpa) * 100 : null) },
  finishing: { label: 'At the rim', pct: true, of: (s) => (s.rimA >= 40 ? (s.rimM / s.rimA) * 100 : null) },
  playmaking: { label: 'AST/36', pct: false, of: (s) => (s.min >= 300 ? (s.ast / s.min) * 36 : null) },
  rebounding: { label: 'REB/36', pct: false, of: (s) => (s.min >= 300 ? ((s.orb + s.drb) / s.min) * 36 : null) },
  perimeterD: { label: 'STL/36', pct: false, of: (s) => (s.min >= 300 ? (s.stl / s.min) * 36 : null) },
  interiorD: { label: 'BLK/36', pct: false, of: (s) => (s.min >= 300 ? (s.blk / s.min) * 36 : null) },
};

/** His regular-season totals for a season, every team summed (null: he didn't play). */
function seasonTotals(p: Player, season: number): PlayerStats | null {
  const rows = p.stats.filter((s) => s.season === season && !s.playoffs && !s.real);
  if (!rows.length) return null;
  const t = { ...rows[0] };
  const sum = t as unknown as Record<string, number>;
  for (const r of rows.slice(1)) for (const [k, v] of Object.entries(r)) if (typeof v === 'number' && typeof sum[k] === 'number' && k !== 'season' && k !== 'tid') sum[k] += v;
  return t;
}

/**
 * A training focus told as what's known about it: how long it has run (through last summer when
 * that summer ran under it, else since the day it was set: Player.trainingSince), what the skills it
 * trains did over that time (from his ratings the day it was set, never from before it), what the rest of his game did beside them, and the stat it should move
 * against last season's. It doesn't say the focus beat or lost to balanced work: his other skills
 * aren't that comparison (they grow and fade on their own curves), and the review never saw him on
 * balanced work. A focus set too recently (FOCUS_MIN_DAYS), or in season past 25 where growth waits
 * for the summer, says so and judges nothing. OVR isn't the measure either.
 */
function focusLine(league: League, p: Player, season: number): string | null {
  const keys = FOCUS_KEYS[p.training];
  if (!keys.length) return null;
  const hist = p.ratingsHistory;
  const open = hist.find((h) => h.season === season);
  const prev = hist.find((h) => h.season === season - 1);
  const since = p.trainingSince;
  // set this season: read from his ratings the day it was set (what moved before it isn't its doing)
  const setNow = since?.season === season ? since : null;
  // set last season (before or over the summer, which then ran under it): from that day too
  const setLast = !setNow && since?.season === season - 1 && since.r ? since : null;
  // else, the summer before this season ran under this focus: read it from before that summer
  const summer = !setNow && !setLast && open?.focus === p.training && !!prev?.r;
  const from = setNow?.r ?? setLast?.r ?? (summer ? prev!.r : open?.r);
  if (!from) return null;
  const days = setNow ? Math.max(0, league.day - setNow.day) : null;
  const span = setLast ? 'set last season' : summer ? 'in place since last summer' : days !== null ? `set ${plural(days, 'day')} ago` : 'set this season';
  // (set after the season's last development step, or at an age that waits for the summer: it had no chance to work, so nothing it did is read)
  if (setNow) {
    const { had, next } = focusChances(league, p, setNow);
    if (!had) return `${span}: no development step has run under it yet, so there is nothing to read. The next is ${next}.`;
  }
  if (days !== null && days < FOCUS_MIN_DAYS) return `${span}: too soon to read.`;
  // (a save from before the day's ratings were kept: only opening night's, so it says what it's read from)
  const base = setNow && !setNow.r ? ' (read from opening night)' : '';
  const others = (Object.keys(from) as RatingKey[]).filter((k) => k !== 'hgt' && !keys.includes(k));
  const avg = (ks: RatingKey[]) => ks.reduce((a, k) => a + (p.ratings[k] - from[k]), 0) / Math.max(1, ks.length);
  const on = avg(keys);
  const off = avg(others);
  if (!summer && !setLast && Math.abs(on) < 0.3 && playerAge(p, season) > 25) return `${span}. At his age it works over the summer: read it next year.`;
  // the stat it should move, season against season, only when the whole season ran under it
  const fs = setNow ? undefined : FOCUS_STAT[p.training];
  const now = fs ? seasonTotals(p, season) : null;
  const then = fs ? seasonTotals(p, season - 1) : null;
  const a = fs && now ? fs.of(now) : null;
  const b = fs && then ? fs.of(then) : null;
  const fmt = (x: number) => (fs!.pct ? `${Math.round(x)}%` : x.toFixed(1));
  const stat = fs && a !== null && b !== null ? ` ${fs.label} ${fmt(b)} → ${fmt(a)}.` : '';
  const read = on >= 1.5 ? 'The focused skills grew' : on <= -0.5 ? 'The focused skills slipped' : 'The focused skills barely moved';
  return `${span}${base}: its skills ${signed(on)}, the rest of his game ${signed(off)}. ${read}; what balanced work would have done isn't known.${stat}`;
}

/** A tactical change as far as it has been read: checked on played games, or not yet. */
function editStatus(league: League, e: TacticEdit): string {
  const back = e.closed === 'reverted' ? ' You put it back.' : e.closed ? ' Replaced since.' : '';
  if (e.check) return `Checked on ${plural(e.check.games, 'game')} played with it${e.check.recheck ? ', a second look' : ''}: ${SINCE[editCall(e.check)!].toLowerCase()}.${back}`;
  // (the review is read when his season is over: a check never run is one the season ran out on)
  const played = playedSince(league, e).length;
  const pending = e.closed
    ? 'It was never checked on played games.'
    : !played
      ? 'No games played with it, so nothing to check.'
      : played < CHECK_END_MIN
        ? `Only ${plural(played, 'game')} played with it: too few to check.`
        : `The check on played games is still to come (after ${CHECK_AFTER}).`;
  return `${pending}${back}`;
}

/**
 * The coach's decisions as threads, each told once from why to what's still open (the review keeps
 * them as words, so an old season reads the same). A move (each trade of his this season and last,
 * pick-only deals too, and each signing made for a need) says why (the need it was made for, the
 * staff's or the coach's own priority as its log line kept it), what came in, what it cost (who went out and how they've played where they
 * went, picks, swaps, cash), how he used who came in (role and on-court worth), the result (the
 * need as forecast when the move was made, and as it stands on the rotation he ended with), and what
 * is still open (picks whose draft is to come, either way). Then his players' training, his tactical
 * changes (checked, forecast only, or unread: see editStatus) and his live coaching, a thread each.
 */
export function decisionThreads(league: League, season: number, tid: number): DecisionThread[] {
  const out: DecisionThread[] = [];
  const name = (pid: number, frozen: string) => (league.players[pid] ? playerName(league.players[pid]) : frozen);
  const needRows = (t: Txn, who: Player[]): { why?: string; result?: string; short?: string } => {
    const n = t.need;
    if (!n) return {};
    const label = QUALITY_META[n.id as QualityId]?.label ?? 'A need';
    const now = tid === league.userTid && who.some((p) => p.tid === tid) ? needNow(league, n.id as QualityId) : null;
    return {
      short: `${label} ${n.from} → ${now ? now.grade : `${n.to} (forecast)`}`,
      // (whose it was, as the move's log line kept it: an older line doesn't say, and neither does this)
      why:
        n.by === 'you'
          ? `${label} was the priority you set, graded ${n.from}.`
          : n.by === 'staff'
            ? `${label} was the need the staff named, graded ${n.from}.`
            : `${label} was the roster's need, graded ${n.from}.`,
      result: `Forecast with the staff's minutes: ${label.toLowerCase()} ${n.from} → ${n.to}.${now ? ` Observed on the rotation you ended with: ${now.grade}.` : ''}`,
    };
  };
  const roleOf = (pids: number[]) =>
    pids
      .map((pid) => {
        const p = league.players[pid];
        if (!p) return null;
        const l = roleLine(p, season, tid);
        return `${p.lastName}: ${l ?? (p.tid === tid ? "hasn't played" : 'gone since')}`;
      })
      .filter((x): x is string => !!x)
      .join(' · ');
  const row = (rows: DecisionThread['rows'], label: string, text: string | undefined) => {
    if (text) rows.push([label, text]);
  };
  // trades: this season's and last's, newest first
  const trades = (league.transactions ?? []).filter((t) => t.kind === 'trade' && t.tids.includes(tid) && (t.season === season || t.season === season - 1) && t.sides);
  for (const t of [...trades].reverse().slice(0, TRADES_MAX)) {
    const mine = t.sides!.find((x) => x.tid === tid);
    const others = t.sides!.filter((x) => x.tid !== tid);
    if (!mine || !others.length) continue;
    const inPids = others.flatMap((o) => o.players.map((x) => x.pid));
    const inPicks = others.flatMap((o) => o.picks.map((x) => pickOf(x, season, league.teams[o.tid].abbrev)));
    const outPicks = mine.picks.map((x) => pickOf(x, season, null));
    const got = [
      ...others.flatMap((o) => o.players.map((x) => name(x.pid, x.name))),
      ...inPicks.map((x) => x.text),
      ...others.flatMap((o) => (o.swaps ?? []).map((y) => `the right to swap ${y} firsts`)),
      ...(others.some((o) => o.cash) ? [`${money(others.reduce((a, o) => a + (o.cash ?? 0), 0))} cash`] : []),
    ];
    const gave = [
      ...mine.players.map((x) => {
        const p = league.players[x.pid];
        const to = p && p.tid >= 0 ? p.tid : others[0].tid;
        const l = p ? roleLine(p, season, to) : null;
        return `${name(x.pid, x.name)}${l ? ` (${l} for ${league.teams[to].abbrev})` : ''}`;
      }),
      ...outPicks.map((x) => x.text),
      ...(mine.swaps ?? []).map((y) => `the right to swap ${y} firsts`),
      ...(mine.cash ? [`${money(mine.cash)} cash`] : []),
    ];
    if (!got.length && !gave.length) continue;
    const who = inPids.map((pid) => league.players[pid]).filter((p): p is Player => !!p);
    const need = needRows(t, who);
    const open = [...inPicks.filter((x) => x.open).map((x) => `${x.text} (coming to you)`), ...outPicks.filter((x) => x.open).map((x) => `${x.text} (owed)`)];
    const rows: DecisionThread['rows'] = [];
    row(rows, 'Why', need.why);
    row(rows, 'In', got.join(', ') || 'nothing');
    row(rows, 'Cost', gave.join(', ') || 'nothing');
    row(rows, 'Use', roleOf(inPids) || undefined);
    row(rows, 'Result', need.result);
    row(rows, 'Open', open.length ? `Draft still to come: ${open.join(', ')}.` : undefined);
    const short = [need.short, who.length ? playedShort(who, season, tid) : null].filter(Boolean).join('; ');
    const summary = short ? `${short}.` : open.length ? `No players: ${plural(open.length, 'pick')} still to come.` : 'No players in it.';
    out.push({ title: `Trade with ${others.map((o) => league.teams[o.tid].abbrev).join(', ')}${t.season === season ? '' : ` (${seasonLabel(t.season)})`}`, summary, rows });
  }
  // signings made for a need
  const signings = (league.transactions ?? [])
    .filter((t) => t.kind !== 'trade' && t.season === season && t.need && t.tids.includes(tid) && t.pid !== undefined)
    .slice(-SIGNINGS_MAX);
  for (const t of signings) {
    const p = league.players[t.pid!];
    const need = needRows(t, p ? [p] : []);
    const rows: DecisionThread['rows'] = [];
    row(rows, 'Why', need.why);
    row(rows, 'Cost', t.amount ? `${money(t.amount)} this season${t.years ? `, ${plural(t.years, 'year')}` : ''}` : undefined);
    row(rows, 'Use', roleOf([t.pid!]) || undefined);
    row(rows, 'Result', need.result);
    const short = [need.short, p ? playedShort([p], season, tid) : null].filter(Boolean).join('; ');
    out.push({ title: `Signed ${name(t.pid!, t.name ?? 'a player')}`, ...(short ? { summary: `${short}.` } : {}), rows });
  }
  // development: his players on a training focus, best players first
  const dev = Object.values(league.players)
    .filter((p) => p.tid === tid && p.training && p.training !== 'balanced')
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
    .map((p): [string, string] | null => {
      const l = focusLine(league, p, season);
      return l ? [`${playerName(p)}, ${FOCUS_META[p.training].label.toLowerCase()}`, l.replace(/^./, (c) => c.toUpperCase())] : null;
    })
    .filter((x): x is [string, string] => !!x)
    .slice(0, 3);
  if (dev.length)
    out.push({
      title: 'Training focus',
      summary: tally(
        dev.length === 1 ? '1 focus' : `${dev.length} focuses`,
        dev.map(([, l]) => focusRead(l)),
      ),
      rows: dev,
    });
  const tactics = editThread(league, season);
  if (tactics) out.push(tactics);
  // live coaching over the season
  const live = seasonCoachingLine(league, season, tid);
  if (live) out.push({ title: 'Live coaching', summary: `${live}.`, rows: [['Measured', `${live}.`]] });
  return out;
}

const EDIT_TITLE = 'Tactical changes';

/** His tactical changes this season as a thread: checked ones first, then forecasts, then unread. */
function editThread(league: League, season: number): DecisionThread | null {
  const edits = editsOf(league)
    .filter((e) => e.season === season)
    .sort((a, b) => Number(!!b.check) - Number(!!a.check) || b.day - a.day)
    .slice(0, 3);
  if (!edits.length) return null;
  const read = (e: TacticEdit) => {
    if (!e.check) return 'not checked';
    const c = editCall(e.check);
    return c === 'gain' ? 'helped' : c === 'cost' ? 'hurt' : 'too close to call';
  };
  return {
    title: EDIT_TITLE,
    summary: tally(edits.length === 1 ? '1 change' : `${edits.length} changes`, edits.map(read)),
    rows: edits.map((e) => [`${e.what.split(' · ')[0]}${e.what.includes(' · ') ? ' and more' : ''}`, editStatus(league, e)]),
  };
}

/** "2 changes: 1 helped, 1 not checked." (each read counted, in the order first seen; one read for all: "1 change: helped.") */
function tally(what: string, reads: string[]): string {
  const n = new Map<string, number>();
  for (const r of reads) n.set(r, (n.get(r) ?? 0) + 1);
  if (n.size === 1) return `${what}: ${reads.length > 1 ? 'all ' : ''}${reads[0]}.`;
  return `${what}: ${[...n].map(([r, k]) => `${k} ${r}`).join(', ')}.`;
}

/** A focus line's read in a word or two, for the thread's summary. */
function focusRead(line: string): string {
  if (/too soon/.test(line)) return 'too soon to read';
  if (/no development step/.test(line)) return 'no development step yet';
  if (/next year/.test(line)) return 'read next year';
  if (/grew/.test(line)) return 'grew';
  if (/slipped/.test(line)) return 'slipped';
  return 'barely moved';
}

/**
 * A check that came in after the season's review was kept (the Finals ended the night it came due):
 * the review's tactical changes are told again as they stand. The rest of the review stays as it was.
 */
export function refreshEditThread(league: League, season: number) {
  const r = legacyOf(league).reviews.find((x) => x.season === season && x.tid === league.userTid);
  if (!r?.threads) return;
  const t = editThread(league, season);
  const at = r.threads.findIndex((x) => x.title === EDIT_TITLE);
  if (!t) return;
  if (at >= 0) r.threads[at] = t;
  else {
    // (before the live coaching, as a review built now has it)
    const live = r.threads.findIndex((x) => x.title === 'Live coaching');
    r.threads.splice(live >= 0 ? live : r.threads.length, 0, t);
  }
}

/** A player's line for a season with one team, regular season. */
function lineOf(p: Player, season: number, tid: number): PlayerStats | undefined {
  return p.stats.find((s) => s.season === season && s.tid === tid && !s.playoffs && !s.real);
}

const per = (v: number, gp: number) => (gp ? v / gp : 0).toFixed(1);
const statText = (s: PlayerStats) => `${per(s.pts, s.gp)} PTS, ${per(s.orb + s.drb, s.gp)} REB, ${per(s.ast, s.gp)} AST`;

/** A season's value for picking its best player: production a game, counted fully from 50 games. */
function seasonValue(s: PlayerStats): number {
  if (!s.gp) return 0;
  const g = s.gp;
  return ((s.pts + 0.5 * (s.orb + s.drb) + 0.7 * s.ast + s.stl + s.blk - 0.7 * s.tov) / g) * Math.min(1, g / 50);
}

/** The awards a player won this season (the regular season's and the Finals MVP), in the order they're named. */
function awardsOf(p: Player, season: number): string[] {
  const keep = ['MVP', 'Finals MVP', 'Defensive Player of the Year', 'Rookie of the Year', 'Sixth Man of the Year', 'Most Improved Player'];
  return p.awards.filter((a) => a.season === season && (keep.includes(a.type) || a.type.startsWith('All-League'))).map((a) => a.type);
}

/** The review of the season just ended for the user's team (null when he coached none of it). */
export function buildSeasonReview(league: League): SeasonReview | null {
  const season = league.season;
  const tid = league.userTid;
  const t = league.teams[tid];
  const ts = t?.seasons.find((s) => s.season === season);
  const me = userCoach(league);
  if (!ts || !me) return null;
  const line = coachCareer(league, me, new Map()).lines.find((l) => l.season === season && l.tid === tid);
  if (!line) return null;
  const row = confStandings(league, t.conf).find((r) => r.tid === tid);
  const pre = league.media?.preseason;
  const picked = pre && pre.season === season ? pre.rows.find((r) => r.tid === tid) : undefined;
  const og = currentGoals(league) ?? (league.ownerGoals?.season === season && league.ownerGoals.tid === tid ? league.ownerGoals : undefined);
  const ownerWins = og && !og.from ? og.goals.find((g) => g.kind === 'wins')?.target : undefined;
  const players = Object.values(league.players).filter((p) => lineOf(p, season, tid)?.gp);
  // the best player: production, and the hardware that says so
  const star = players
    .map((p) => ({ p, s: lineOf(p, season, tid)!, a: awardsOf(p, season) }))
    .sort((a, b) => seasonValue(b.s) + b.a.length * 2 - (seasonValue(a.s) + a.a.length * 2))[0];
  // a breakout: 25 or under, the biggest jump in OVR since a year ago with his scoring up (or the Most Improved Player)
  const breakout = players
    .filter((p) => playerAge(p, season) <= 25 && p.pid !== star?.p.pid)
    .map((p) => {
      const hist = p.ratingsHistory;
      const before = hist.find((h) => h.season === season - 1) ?? hist.find((h) => h.season === season);
      const s = lineOf(p, season, tid)!;
      const prev = p.stats.filter((x) => x.season === season - 1 && !x.playoffs).reduce((a, x) => ({ pts: a.pts + x.pts, gp: a.gp + x.gp }), { pts: 0, gp: 0 });
      const jump = (s.gp ? s.pts / s.gp : 0) - (prev.gp ? prev.pts / prev.gp : 0);
      const mip = p.awards.some((a) => a.season === season && a.type === 'Most Improved Player');
      return { p, s, from: before?.ovr ?? p.ovr, jump, mip, prevPpg: prev.gp ? prev.pts / prev.gp : null };
    })
    .filter((x) => x.mip || (x.p.ovr - x.from >= 3 && x.jump >= 2 && x.s.gp >= 30))
    .sort((a, b) => Number(b.mip) - Number(a.mip) || b.p.ovr - b.from + b.jump / 3 - (a.p.ovr - a.from + a.jump / 3))[0];
  const records = recordsSet(league, season, tid);
  const honors: string[] = [];
  const aw = league.awards.find((a) => a.season === season);
  if (ts.playoffRound === 5) honors.push('League champions');
  else if (ts.playoffRound === 4) honors.push(`${t.conf === 'E' ? 'East' : 'West'} champions`);
  if (aw?.cupWinner === tid) honors.push('In-Season Cup winners');
  if (aw?.coy === tid && (aw.coyCoach === undefined || aw.coyCoach === league.coachName || !!me.aka?.includes(aw.coyCoach))) honors.push('Coach of the Year');
  const cotm = legacyOf(league).honors.filter((h) => h.season === season && h.tid === tid).length;
  if (cotm) honors.push(cotm > 1 ? `Coach of the Month ×${cotm}` : 'Coach of the Month');
  for (const p of players) for (const a of awardsOf(p, season)) honors.push(`${playerName(p)}: ${a}`);
  // next season, from the roster as it stands: what the owner would expect of it
  let next: SeasonReview['next'];
  if (!league.fired) {
    // (his read: the edge on the court in it, as the goals he sets will have it)
    next = { wins: Math.round(leagueOutlook(league)[tid].pct * SEASON_GAMES) };
  }
  const s = legacyOf(league);
  const pulse = s.pulse && s.pulse.season === season && s.pulse.tid === tid ? s.pulse.pts : undefined;
  const threads = decisionThreads(league, season, tid);
  return {
    season,
    tid,
    won: line.won,
    lost: line.lost,
    conf: t.conf,
    ...(row ? { confRank: row.confRank } : {}),
    ...(ts.seed ? { seed: ts.seed } : {}),
    round: ts.playoffRound,
    ...(picked ? { press: { wins: picked.wins, confRank: picked.confRank, champ: pre?.champ === tid } } : {}),
    ...(ownerWins !== undefined ? { ownerWins } : {}),
    ...(bestWinOf(league, season, tid) ? { best: bestWinOf(league, season, tid) } : {}),
    ...(star ? { star: { pid: star.p.pid, name: playerName(star.p), line: `${statText(star.s)}${star.a.length ? ` · ${star.a.join(', ')}` : ''}` } } : {}),
    ...(breakout
      ? {
          breakout: {
            pid: breakout.p.pid,
            name: playerName(breakout.p),
            from: breakout.from,
            to: breakout.p.ovr,
            line: `${breakout.prevPpg !== null ? `${breakout.prevPpg.toFixed(1)} → ` : ''}${per(breakout.s.pts, breakout.s.gp)} PTS a game${breakout.mip ? ' · Most Improved Player' : ''}`,
          },
        }
      : {}),
    records,
    honors,
    ...(pulse ? { pulse: [...pulse] } : {}),
    ...(league.fired ? {} : { owner: jobSecurity(league).score }),
    fans: fanScore(league, tid),
    ...(next ? { next } : {}),
    ...(league.fired ? { fired: true as const } : {}),
    ...(league.settings.jobSecurity ? {} : { jobSecurity: false as const }),
    ...(threads.length ? { threads } : {}),
  };
}

/**
 * Records the team set this season: league single-game records, the franchise's (once the book has a
 * season behind it), and the franchise's best record or net rating in this league (from its third
 * season on, so a first season isn't a record by default). At most four.
 */
function recordsSet(league: League, season: number, tid: number): string[] {
  const out: string[] = [];
  const book = league.records;
  const name = (pid: number, frozen?: string) => (league.players[pid] ? playerName(league.players[pid]) : (frozen ?? 'Unknown'));
  if (book) {
    for (const stat of REC_STATS) {
      const top = book.league.reg.players[stat]?.[0];
      if (top && top[4] === season && top[2] === tid)
        out.push(
          `League record${recordSpan(league, { scope: 'league', book: 'reg', stat, v: top[0] })}: ${top[0]} ${REC_LABEL[stat][1] ?? REC_LABEL[stat][0].toLowerCase()} by ${name(top[1], top[7])}`,
        );
    }
    for (const stat of TEAM_REC_STATS) {
      const top = book.league.reg.teams[stat]?.[0];
      if (top && top[3] === season && top[1] === tid)
        out.push(`League record${recordSpan(league, { scope: 'league', book: 'reg', stat, team: true, v: top[0] })}: ${recordWhat({ stat, team: true, v: top[0] })} in a game`);
    }
    const mine = book.teams[tid];
    // (a franchise's book says how far back it reaches in a real league: "since 1996-97")
    if (mine && !youngBook(book, season)) {
      for (const stat of REC_STATS) {
        const top = mine.reg.players[stat]?.[0];
        if (top && top[4] === season && !out.some((x) => x.includes(name(top[1], top[7])) && x.startsWith('League')))
          out.push(
            `Franchise record${recordSpan(league, { scope: 'team', book: 'reg', stat, v: top[0] })}: ${top[0]} ${REC_LABEL[stat][1] ?? REC_LABEL[stat][0].toLowerCase()} by ${name(top[1], top[7])}`,
          );
      }
    }
  }
  const seasons = league.teams[tid].seasons.filter((s) => s.season <= season && s.won + s.lost > 0).length;
  if (seasons >= 3) {
    const best = teamSeasonRecords(league, 'wins', { tid, n: 1 })[0];
    if (best?.season === season) out.push(`The franchise's best record since ${seasonLabel(league.startSeason)}: ${best.won}-${best.lost}`);
    const net = teamSeasonRecords(league, 'net', { tid, n: 1 })[0];
    if (net?.season === season) out.push(`The franchise's best net rating since ${seasonLabel(league.startSeason)}`);
  }
  return out.slice(0, 4);
}

/** A season grade (−1..1) in a word, for the verdict's headline. */
export function gradeWord(g: number): string {
  return g >= 0.4 ? 'Excellent' : g >= 0.1 ? 'Good' : g > -0.1 ? 'As expected' : g > -0.4 ? 'Short of it' : 'Poor';
}

/** How a season ended, in words: "Won the title", "Lost in the second round", "Missed the playoffs". */
export function endText(r: Pick<SeasonReview, 'round'>): string {
  return r.round === 5
    ? 'Won the title'
    : r.round === 4
      ? 'Lost in the Finals'
      : r.round === 3
        ? 'Lost in the conference finals'
        : r.round === 2
          ? 'Lost in the second round'
          : r.round === 1
            ? 'Lost in the first round'
            : 'Missed the playoffs';
}

/** The season against the press's prediction, in a line ("+7 wins on the prediction, 3rd in the West where they picked 8th"). */
export function vsPress(r: SeasonReview): string | null {
  if (!r.press) return null;
  const d = r.won - r.press.wins;
  const conf = r.conf === 'E' ? 'East' : 'West';
  const wins = d === 0 ? 'Right on the prediction' : `${d > 0 ? '+' : '−'}${plural(Math.abs(d), 'win')} on the prediction`;
  return r.confRank ? `${wins} · ${ordinal(r.confRank)} in the ${conf}, picked ${ordinal(r.press.confRank)}` : wins;
}
