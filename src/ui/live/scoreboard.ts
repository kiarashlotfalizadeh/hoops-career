// Around the league: the night's other games, ticking along with the user's live game. They were
// played before it (prepareLive sims the rest of the day first), so each one's score at a moment of
// the user's game is read from its quarters: games tip at their home team's local 7:00 or 7:30, and
// all of them run at the pace of the user's (a broadcast's 48 minutes take about two and a quarter
// hours), so a West Coast game is still to come when an East Coast one ends. The ones that matter
// to the user come first: teams near his in the conference standings, his next opponent, and every
// playoff game.

import type { GameResult, League } from '../../core/types';
import { confStandings } from '../../core/league/standings';

/** Game seconds a real minute of broadcast covers (48 minutes in about 135). */
export const GAME_SEC_PER_MIN = 2880 / 135;

/** Home teams outside the Eastern time zone: their tips, in minutes after 7:00 p.m. ET (a 7:00 local tip). */
const TIP_ZONE: Record<string, number> = {
  CHI: 60,
  MIL: 60,
  MIN: 60,
  OKC: 60,
  DAL: 60,
  HOU: 60,
  MEM: 60,
  NOP: 60,
  SAS: 60,
  DEN: 120,
  UTA: 120,
  PHX: 120,
  GSW: 180,
  LAC: 180,
  LAL: 180,
  POR: 180,
  SAC: 180,
};

/** When a game tips, in minutes after 7:00 p.m. ET: its home team's local 7:00, or 7:30 for every other game id. */
export function tipMinute(league: League, home: number, gid: number): number {
  return (TIP_ZONE[league.teams[home]?.abbrev] ?? 0) + (gid % 2 ? 30 : 0);
}

/** "7:30 PM" (ET), the way a ticker gives a tip time. */
export function tipLabel(minute: number): string {
  const h = 7 + Math.floor(minute / 60);
  const m = minute % 60;
  return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} PM`;
}

export interface OtherGame {
  res: GameResult;
  /** Minutes after the user's game it tips (negative: before). */
  offset: number;
  /** Why it matters to the user, if it does ('East race', 'Next opponent', 'R1 · Game 3'). */
  why?: string;
}

/** Tonight's other games (season, day): the ones that matter first, then by tip time. */
export function otherGames(league: League, gid: number, day: number, userTid: number): OtherGame[] {
  const mine = league.schedule.find((g) => g.gid === gid);
  const myTip = mine ? tipMinute(league, mine.home, gid) : 0;
  const conf = league.teams[userTid].conf;
  const table = confStandings(league, conf);
  const myRank = table.findIndex((r) => r.tid === userTid);
  // teams within three places of the user's in his conference (once ten games make a table worth reading)
  const played = table[myRank] ? table[myRank].won + table[myRank].lost : 0;
  const near = new Set(played >= 10 ? table.filter((_, i) => Math.abs(i - myRank) <= 3 && i !== myRank).map((r) => r.tid) : []);
  // his next opponent after tonight
  const next = league.schedule.find((g) => !g.played && g.gid !== gid && g.day > day && (g.home === userTid || g.away === userTid));
  const nextOpp = next ? (next.home === userTid ? next.away : next.home) : undefined;
  const out: OtherGame[] = [];
  for (const res of league.games) {
    if (res.season !== league.season || res.day !== day || res.gid === gid || res.type === 'allstar') continue;
    const tids = [res.home.tid, res.away.tid];
    let why: string | undefined;
    if (res.type === 'playoffs' || res.type === 'playin') {
      const s = res.seriesId ? league.playoffs.find((x) => x.id === res.seriesId) : undefined;
      why = res.type === 'playin' ? 'Play-In' : s ? (s.round === 4 ? 'Finals' : s.round === 3 ? 'Conf. Finals' : `Round ${s.round}`) : 'Playoffs';
    } else if (nextOpp !== undefined && tids.includes(nextOpp)) why = 'Your next opponent';
    else if (tids.some((t) => near.has(t))) why = `${conf === 'E' ? 'East' : 'West'} race`;
    out.push({ res, offset: tipMinute(league, res.home.tid, res.gid) - myTip, ...(why && { why }) });
  }
  return out.sort((a, b) => Number(!!b.why) - Number(!!a.why) || a.offset - b.offset || a.res.gid - b.res.gid);
}

export interface TickerScore {
  /** 'break': between periods (`q` the period just ended: 2 is halftime). */
  state: 'pre' | 'live' | 'break' | 'final';
  /** [home, away] as it stands. */
  score: [number, number];
  /** Period and seconds left in it. */
  q: number;
  clock: number;
  /** Its overtimes, once final. */
  ot: number;
}

/** The breaks after each period, in game seconds of broadcast time: two minutes between quarters, fifteen at halftime. */
const breakAfter = (q: number) => (q === 2 ? 320 : 43);
const periodLen = (q: number) => (q <= 4 ? 720 : 300);

/** Broadcast time (in game seconds, breaks included) at `t` game seconds into a game. */
export function broadcastTime(t: number): number {
  let real = 0;
  let left = t;
  for (let q = 1; left > 0; q++) {
    const len = periodLen(q);
    if (left <= len) return real + left;
    real += len + breakAfter(q);
    left -= len;
  }
  return real;
}

/**
 * Where game `o` stands when the user's game has played `elapsed` game seconds (`done`: the user's
 * game is over, and so is the night as the user follows it: every game shows its final). Both games
 * run on the same broadcast clock, breaks included; inside a period the score grows evenly through
 * that period's points.
 */
export function scoreAt(o: OtherGame, elapsed: number, done = false): TickerScore {
  const h = o.res.home.quarters;
  const a = o.res.away.quarters;
  const periods = Math.max(h.length, a.length, 4);
  const final: TickerScore = { state: 'final', score: [o.res.home.pts, o.res.away.pts], q: periods, clock: 0, ot: periods - 4 };
  if (done) return final;
  let left = broadcastTime(elapsed) - o.offset * GAME_SEC_PER_MIN;
  if (left <= 0) return { state: 'pre', score: [0, 0], q: 1, clock: 720, ot: 0 };
  const score: [number, number] = [0, 0];
  for (let q = 1; q <= periods; q++) {
    const len = periodLen(q);
    if (left < len) {
      const f = left / len;
      score[0] += Math.floor((h[q - 1] ?? 0) * f);
      score[1] += Math.floor((a[q - 1] ?? 0) * f);
      return { state: 'live', score, q, clock: len - left, ot: 0 };
    }
    score[0] += h[q - 1] ?? 0;
    score[1] += a[q - 1] ?? 0;
    left -= len;
    if (q === periods) break;
    if (left < breakAfter(q)) return { state: 'break', score, q, clock: 0, ot: 0 };
    left -= breakAfter(q);
  }
  return final;
}
