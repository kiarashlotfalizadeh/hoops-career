// The season's review, read like a ceremony when the Finals end (see legacySeasonEnd): the record and
// how the season ended, against what the owner asked (his verdict is owner.ts's review, read from
// League.ownerReviews) and what the press predicted on opening night, the season's best win, its best
// player and its breakout, the records set, the honors, and what next season should bring. Built once
// a season from the league as it stands that night and kept small (a few hundred bytes), so it reads
// the same years later when the games behind it are gone.
import type { League, Player, PlayerStats, RatingKey, TrainingFocus } from '../types';
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
import { editCall, editsOf } from '../ai/tacticEdits';
import { SINCE } from '../analysis/staffWords';
import { seasonCoachingLine } from '../analysis/debrief';
import { FOCUS_KEYS, FOCUS_META } from './progression';
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
  /** The season's honors for the coach and his players ("Coach of the Year", "Jalen Brunson: All-NBA 2nd Team"). */
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
   * The coach's own decisions and what came of them, a line each (see decisionLines): his trades this
   * season and last with how each side has played since, his players' training focus against their
   * growth, his tactical changes with the staff's verdict, and his live coaching over the season.
   */
  decisions?: string[];
}

/** Decisions the review reconnects, at most (trades first, then development, tactics, live coaching). */
const DECISIONS_MAX = 10;

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

/**
 * A traded pick as the deal named it, whose it is (the log names it as its sender held it: his own
 * plain, "2028 1st", another's with its team), flagged when its draft is still to come ("your 2028
 * 1st, still to come", "the BOS 2029 2nd").
 */
function pickText(label: string, season: number, owner: string | null): string {
  const y = Number(/^(\d{4})/.exec(label)?.[1]);
  const named = /\(\w+\)/.test(label) ? label : owner === null ? `your ${label}` : `the ${owner} ${label}`;
  return y && y >= season ? `${named}, still to come` : named;
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
 * A training focus graded on what it trains: the focused skills' average change against the rest of
 * his game (the cost: off-focus skills grow slower than balanced work), from the snapshot before the
 * summer it ran (when that summer ran under this focus) or from opening night (set since: in-season
 * growth only, and past 25 none, so it waits for the summer), and the stat it should move against
 * last season's. OVR isn't the measure: a shooting focus can pay off with OVR flat.
 */
function focusLine(p: Player, season: number): string | null {
  const keys = FOCUS_KEYS[p.training];
  if (!keys.length) return null;
  const hist = p.ratingsHistory;
  const open = hist.find((h) => h.season === season);
  const prev = hist.find((h) => h.season === season - 1);
  // the summer before this season ran under this focus: grade it from before that summer
  const summer = open?.focus === p.training && !!prev?.r;
  const from = summer ? prev!.r : open?.r;
  if (!from) return null;
  const others = (Object.keys(from) as RatingKey[]).filter((k) => k !== 'hgt' && !keys.includes(k));
  const avg = (ks: RatingKey[]) => ks.reduce((a, k) => a + (p.ratings[k] - from[k]), 0) / Math.max(1, ks.length);
  const on = avg(keys);
  const off = avg(others);
  const label = FOCUS_META[p.training].label;
  if (!summer && Math.abs(on) < 0.3 && playerAge(p, season) > 25)
    return `${label} focus for ${playerName(p)}: set this season. At his age it works over the summer: judge it next year.`;
  const fs = FOCUS_STAT[p.training];
  const now = fs ? seasonTotals(p, season) : null;
  const then = fs ? seasonTotals(p, season - 1) : null;
  const a = fs && now ? fs.of(now) : null;
  const b = fs && then ? fs.of(then) : null;
  const fmt = (x: number) => (fs!.pct ? `${Math.round(x)}%` : x.toFixed(1));
  const stat = fs && a !== null && b !== null ? ` ${fs.label} ${fmt(b)} → ${fmt(a)}.` : '';
  const verdict = on >= 1.5 && on - off >= 1 ? 'it paid off' : on - off < 0.5 ? 'no edge over balanced work yet' : 'a modest gain';
  return `${label} focus for ${playerName(p)}: those skills ${signed(on)}, the rest of his game ${signed(off)} ${summer ? 'since last season' : 'since opening night'}, ${verdict}.${stat}`;
}

/**
 * The coach's decisions, reconnected with what followed (the review keeps them as words, so an old
 * season reads the same): each trade of his this season and last, pick-only deals too, with what came
 * in (role and on-court worth for him since) against what went out (the same where they went), the
 * specific picks, swaps and cash each way, picks still to come flagged; each of his players on a
 * training focus, graded on the skills and stat it trains and what the rest of his game gave up; his
 * tactical changes this season, checked or not yet (an unmeasured one says so); his live coaching.
 */
export function decisionLines(league: League, season: number, tid: number): string[] {
  const out: string[] = [];
  const name = (pid: number, frozen: string) => (league.players[pid] ? playerName(league.players[pid]) : frozen);
  // trades: this season's and last's, newest first
  const trades = (league.transactions ?? []).filter((t) => t.kind === 'trade' && t.tids.includes(tid) && (t.season === season || t.season === season - 1) && t.sides);
  for (const t of [...trades].reverse().slice(0, 4)) {
    const mine = t.sides!.find((x) => x.tid === tid);
    const others = t.sides!.filter((x) => x.tid !== tid);
    if (!mine || !others.length) continue;
    const got = [
      ...others.flatMap((o) =>
        o.players.map((x) => {
          const l = roleLine(league.players[x.pid], season, tid);
          return `${name(x.pid, x.name)} (${l ? `${l} for you` : league.players[x.pid]?.tid === tid ? "hasn't played" : 'gone since'})`;
        }),
      ),
      ...others.flatMap((o) => o.picks.map((x) => pickText(x, season, league.teams[o.tid].abbrev))),
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
      ...mine.picks.map((x) => pickText(x, season, null)),
      ...(mine.swaps ?? []).map((y) => `the right to swap ${y} firsts`),
      ...(mine.cash ? [`${money(mine.cash)} cash`] : []),
    ];
    const when = t.season === season ? '' : ` (${seasonLabel(t.season)})`;
    if (got.length || gave.length) out.push(`Trade${when}: ${got.join(', ') || 'nothing'} for ${gave.join(', ') || 'nothing'}.`);
  }
  // needs: the moves he made for one, the need graded again now (the rotation he ended with)
  const needed = (league.transactions ?? []).filter((t) => t.season === season && t.need && t.tids.includes(tid)).slice(-2);
  for (const t of needed) {
    const n = t.need!;
    const label = QUALITY_META[n.id as QualityId]?.label ?? 'A need';
    const pids = t.kind === 'trade' ? (t.sides ?? []).filter((x) => x.tid !== tid).flatMap((x) => x.players.map((y) => y.pid)) : t.pid !== undefined ? [t.pid] : [];
    const who = pids.map((pid) => league.players[pid]).filter((p): p is Player => !!p);
    const names = who.map((p) => playerName(p)).join(' and ') || t.name || 'the move';
    const now = tid === league.userTid ? needNow(league, n.id as QualityId) : null;
    const role = who.map((p) => roleLine(p, season, tid)).find(Boolean);
    out.push(
      `${label}, your need: ${n.from} → ${n.to} when ${names} came in${now ? `, ${now.grade} by the season's end` : ''}.${role ? ` ${who[0].lastName}: ${role}.` : who.length && who[0].tid === tid ? ` ${who[0].lastName} hardly played.` : ''}`,
    );
  }
  // development: his players on a training focus, graded on what it trains, best players first
  const dev = Object.values(league.players)
    .filter((p) => p.tid === tid && p.training && p.training !== 'balanced')
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
    .map((p) => focusLine(p, season))
    .filter((x): x is string => !!x)
    .slice(0, 3);
  out.push(...dev);
  // tactics: his changes this season, the clearest first, then ones still unmeasured
  const edits = editsOf(league)
    .filter((e) => e.season === season)
    .map((e) => ({ e, w: e.check ?? e.worth }))
    .map((x) => ({ ...x, call: x.w ? editCall(x.w) : undefined }))
    .sort((a, b) => Number(!!b.call) - Number(!!a.call) || Number(b.call !== 'even') - Number(a.call !== 'even') || b.e.day - a.e.day)
    .slice(0, 3);
  for (const { e, w, call } of edits) {
    const what = `${e.what.split(' · ')[0]}${e.what.includes(' · ') ? ' and more' : ''}`;
    const back = e.closed === 'reverted' ? '. You put it back' : e.closed ? '. Replaced since' : '';
    out.push(call && w ? `${what}: ${SINCE[call].toLowerCase()}, over ${plural(w.games, 'game')}${back}.` : `${what}: not measured, too few games with it in place${back}.`);
  }
  // live coaching over the season
  const live = seasonCoachingLine(league, season, tid);
  if (live) out.push(`${live}.`);
  return out.slice(0, DECISIONS_MAX);
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
  return p.awards.filter((a) => a.season === season && (keep.includes(a.type) || a.type.startsWith('All-NBA'))).map((a) => a.type);
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
  if (ts.playoffRound === 5) honors.push('NBA champions');
  else if (ts.playoffRound === 4) honors.push(`${t.conf === 'E' ? 'East' : 'West'} champions`);
  if (aw?.cupWinner === tid) honors.push('NBA Cup winners');
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
  const decisions = decisionLines(league, season, tid);
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
    ...(decisions.length ? { decisions } : {}),
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
