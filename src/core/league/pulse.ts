// The locker room's pulse: two quiet signals about the user's team, read once a week from what has
// actually happened on the floor. No conversations, no promises, no morale to manage.
//
// Role: a player good enough to expect minutes compares what he plays with what a player of his
// standing plays (a star about 32 a game, a starter 24, a sixth man 14). Short of it week after
// week he wants more; a star left there for three weeks asks for a trade, and won't sign a new deal
// with the team while the request stands. Playing him settles it; so does trading him.
//
// Cohesion: the five who play the most are the core. The longer they have played together here and
// the more they win, the tighter the group; trade one away and it starts again. A tight, winning
// group forgives a short week: its players are slower to complain.
//
// It is part of the world around the games (world.ts): it reads the league and writes news, mail and
// its own state, draws nothing from the league's random stream and changes nothing in the sim. The
// games play out the same with or without it; what it changes is what the user has to weigh.
import type { League, Player } from '../types';
import { addInbox, addNews, curTeamSeason, playerName, standardRoster } from './helpers';
import { playerAge } from '../playerGen';

export interface PulseState {
  season: number;
  /** The day of the last weekly read. */
  day: number;
  /** The five who play the most, as last read, and how tight a group they are (0..1). */
  core: number[];
  cohesion: number;
  /** Each player's standing with his role, -1 (wants out) .. 1 (content). */
  mood: Record<number, number>;
  /** Weeks in a row a player has been short of his minutes. */
  low: Record<number, number>;
  /** The team's games at the last read, and each player's minutes and games then: the week between two reads is what he played. */
  games: number;
  seen: Record<number, [min: number, gp: number]>;
  /** Players who have asked for a trade: when, and whether the user has answered it (it then leaves Needs you). */
  asked: Record<number, { season: number; day: number; seen?: boolean }>;
}

/** Days between reads. */
const WEEK = 7;
/** Under this a player wants more; a star under it for ASK_WEEKS reads in a row asks out. */
export const UNHAPPY = -0.45;
export const ASK_WEEKS = 3;
/** Minutes a player must expect before he would ask for a trade over them: a star's. */
const STAR_MINUTES = 30;
/** Over this a request is withdrawn. */
const SETTLED = 0.1;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const fresh = (league: League): PulseState => ({ season: league.season, day: league.day, core: [], cohesion: 0.35, mood: {}, low: {}, games: 0, seen: {}, asked: {} });

/** His minutes and games this season for this team (the regular season's). */
function playedFor(p: Player, season: number, tid: number): [min: number, gp: number] {
  let min = 0;
  let gp = 0;
  for (const s of p.stats)
    if (s.season === season && !s.playoffs && s.tid === tid) {
      min += s.min;
      gp += s.gp;
    }
  return [min, gp];
}

/** Games he has played for this team, every season counted: how long he has been part of it. */
function gamesWith(p: Player, tid: number): number {
  return p.stats.filter((s) => !s.playoffs && s.tid === tid).reduce((a, s) => a + s.gp, 0);
}

/**
 * The minutes a game a player of his standing plays: by where he ranks on his own team and how good
 * he is. A star about 32, a starter 24, the first men off the bench 14; an old head takes a little
 * less, a teenager far less; the end of the bench expects nothing.
 */
export function expectedMinutes(league: League, p: Player): number {
  if (p.tid < 0 || p.contract.twoWay || p.contract.tenDay) return 0;
  const roster = standardRoster(league, p.tid).sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
  const rank = roster.findIndex((x) => x.pid === p.pid);
  if (rank < 0) return 0;
  const base = rank < 2 && p.ovr >= 84 ? 32 : rank < 5 && p.ovr >= 74 ? 24 : rank < 8 && p.ovr >= 70 ? 14 : 0;
  if (!base) return 0;
  const age = playerAge(p, league.season);
  return Math.round(base * (age <= 20 ? 0.6 : age >= 34 ? 0.85 : 1));
}

/** How he stands with his role, in the words the screens use. */
export type RoleWord = 'Content' | 'Wants more minutes' | 'Unhappy with his role' | 'Asked for a trade';

export interface RoleRead {
  pid: number;
  word: RoleWord;
  tone: 'good' | 'warn' | 'bad';
  /** What he expects a game and what he has played this season. */
  expects: number;
  plays: number;
  /** He has asked for a trade: he won't sign a new deal here while it stands. */
  asked: boolean;
}

/** A player's role as the pulse reads it (null: not the user's, or nobody who expects minutes). */
export function roleRead(league: League, p: Player): RoleRead | null {
  if (p.tid !== league.userTid) return null;
  const s = league.pulse;
  const asked = !!s?.asked[p.pid];
  const expects = expectedMinutes(league, p);
  if (!expects && !asked) return null;
  const mood = s?.mood[p.pid] ?? 0;
  // (a game: in the games he has played, as his page says it; a game missed hurt isn't a short night)
  const [min, gp] = playedFor(p, league.season, p.tid);
  const plays = gp ? Math.round((min / gp) * 10) / 10 : 0;
  const word: RoleWord = asked ? 'Asked for a trade' : mood <= UNHAPPY && (s?.low[p.pid] ?? 0) >= 2 ? 'Unhappy with his role' : mood <= UNHAPPY ? 'Wants more minutes' : 'Content';
  return { pid: p.pid, word, tone: asked || word === 'Unhappy with his role' ? 'bad' : word === 'Content' ? 'good' : 'warn', expects, plays, asked };
}

/** The group's cohesion in a word, the same ladder everywhere. */
export const cohesionWord = (c: number) => (c >= 0.75 ? 'Tight group' : c >= 0.55 ? 'Settled' : c >= 0.35 ? 'Getting to know each other' : 'Strangers');

export interface PulseRead {
  cohesion: number;
  word: string;
  /** One line: where the room stands. */
  line: string;
  core: number[];
  /** Everyone not content, the request first, then the unhappiest. */
  roles: RoleRead[];
}

/** The room as the Team screen shows it. */
export function pulseRead(league: League): PulseRead {
  const s = league.pulse;
  const cohesion = s?.cohesion ?? 0.35;
  const roles = standardRoster(league, league.userTid)
    .map((p) => roleRead(league, p))
    .filter((r): r is RoleRead => !!r && r.word !== 'Content')
    .sort((a, b) => Number(b.asked) - Number(a.asked) || (s?.mood[a.pid] ?? 0) - (s?.mood[b.pid] ?? 0));
  const asked = roles.filter((r) => r.asked).length;
  const more = roles.length - asked;
  const word = cohesionWord(cohesion);
  const line = asked
    ? `${asked === 1 ? 'One player has' : `${asked} players have`} asked for a trade.`
    : more
      ? `${more === 1 ? 'One player wants' : `${more} players want`} more minutes.`
      : cohesion >= 0.75
        ? 'A core that has played and won together.'
        : cohesion >= 0.55
          ? 'Everyone is content with his role.'
          : 'A new group, still finding itself.';
  return { cohesion, word, line, core: s?.core ?? [], roles };
}

/** Has he asked for a trade (and so won't sign a new deal with the user's team)? */
export const askedOut = (league: League, p: Player): boolean => p.tid === league.userTid && !!league.pulse?.asked[p.pid];

/** Why he won't talk about a new deal, or null. */
export const askedOutReason = (league: League, p: Player): string | null =>
  askedOut(league, p) ? `${playerName(p)} has asked for a trade. He won't sign a new deal until his role is settled.` : null;

/** The user has seen a request (shopped him, went to the rotation, or said he stays): it leaves Needs you and stands on Team. */
export function answerRequest(league: League, pid: number) {
  const a = league.pulse?.asked[pid];
  if (a) a.seen = true;
}

/** Requests the user hasn't answered yet, for the agenda. */
export function openRequests(league: League): Player[] {
  const s = league.pulse;
  if (!s || league.fired) return [];
  return Object.entries(s.asked)
    .filter(([, a]) => !a.seen)
    .map(([pid]) => league.players[Number(pid)])
    .filter((p): p is Player => !!p && p.tid === league.userTid);
}

/**
 * The week's read (worldDay calls it every day; it acts every seventh of the regular season, once
 * ten games are in). Each player's role moves toward what the week said, the core and its cohesion
 * are taken again, and a star short for three weeks asks out; a request is withdrawn once he is
 * playing his minutes again, and forgotten when he is no longer on the team.
 */
export function pulseDay(league: League) {
  if (league.fired || league.phase !== 'regular') return;
  const tid = league.userTid;
  if (!league.pulse || league.pulse.season !== league.season) {
    // a new season: the group carries over, last season's minutes don't
    const was = league.pulse;
    league.pulse = { ...fresh(league), core: was?.core ?? [], cohesion: was?.cohesion ?? 0.35, asked: was?.asked ?? {} };
    for (const [pid, m] of Object.entries(was?.mood ?? {})) league.pulse.mood[Number(pid)] = m * 0.5;
  }
  const s = league.pulse;
  if (league.day - s.day < WEEK) return;
  const ts = curTeamSeason(league, tid);
  const games = ts.won + ts.lost;
  const played = games - s.games;
  const roster = standardRoster(league, tid);
  const here = new Set(roster.map((p) => p.pid));
  s.day = league.day;
  // (whoever left takes his request and his mood with him)
  for (const rec of [s.mood, s.low, s.seen, s.asked] as Record<number, unknown>[]) for (const pid of Object.keys(rec)) if (!here.has(Number(pid))) delete rec[Number(pid)];
  const stats = new Map(roster.map((p) => [p.pid, playedFor(p, league.season, tid)]));
  const minutes = new Map(roster.map((p) => [p.pid, stats.get(p.pid)![0]]));
  if (played >= 2 && games >= 10) {
    // the core: the five who have played the most this season
    const core = [...roster]
      .sort((a, b) => minutes.get(b.pid)! - minutes.get(a.pid)! || a.pid - b.pid)
      .slice(0, 5)
      .map((p) => p.pid);
    const kept = s.core.length ? core.filter((pid) => s.core.includes(pid)).length / 5 : 1;
    const tenure = core.reduce((a, pid) => a + Math.min(1, gamesWith(league.players[pid], tid) / 82), 0) / 5;
    const winning = clamp((ts.won / Math.max(1, games) - 0.3) / 0.4, 0, 1);
    const target = 0.2 + 0.45 * tenure + 0.35 * winning;
    // a core member gone: the group starts again by that much
    const base = s.cohesion * kept;
    s.cohesion = Math.round(clamp(base + (target - base) * 0.2, 0, 1) * 100) / 100;
    s.core = core;
    // each role: the week's minutes against what he expects, a winning, tight group forgiving some of it
    const ease = (winning > 0.8 ? 0.15 : 0) + s.cohesion * 0.2;
    for (const p of roster) {
      const expects = expectedMinutes(league, p);
      const now = stats.get(p.pid)!;
      const before = Array.isArray(s.seen[p.pid]) ? s.seen[p.pid] : undefined;
      s.seen[p.pid] = now;
      // (the first read of him, a season's first or a new arrival's: there is no week to read yet.
      // Hurt, he isn't being held out: the week says nothing)
      if (!expects || p.injury || before === undefined) {
        if (!expects) delete s.low[p.pid];
        continue;
      }
      // his minutes a game in the games he played this week; fit and never used, none at all
      const week = (now[0] - before[0]) / Math.max(1, now[1] - before[1]);
      const target = clamp((week - expects) / (expects * 0.35) + ease, -1, 1);
      const mood = Math.round(((s.mood[p.pid] ?? 0) * 0.55 + target * 0.45) * 100) / 100;
      s.mood[p.pid] = mood;
      s.low[p.pid] = mood <= UNHAPPY ? (s.low[p.pid] ?? 0) + 1 : 0;
      const asked = s.asked[p.pid];
      if (!asked && expects >= STAR_MINUTES && s.low[p.pid] >= ASK_WEEKS) request(league, p, expects, week);
      else if (asked && mood >= SETTLED) settle(league, p);
    }
  } else for (const p of roster) s.seen[p.pid] ??= stats.get(p.pid)!;
  s.games = games;
}

function request(league: League, p: Player, expects: number, week: number) {
  const t = league.teams[league.userTid];
  league.pulse!.asked[p.pid] = { season: league.season, day: league.day };
  const name = playerName(p);
  addNews(league, {
    kind: 'rumor',
    head: `${name} asks the ${t.name} for a trade`,
    text: `He has played ${Math.round(week)} minutes a game lately. A player of his standing plays about ${expects}.`,
    body: `${name} has told the ${t.name} he wants out.\n\nHe has been short of a star's minutes for three weeks. He won't talk about a new deal while it stands.\n\nPlaying him settles it. So does a trade.`,
    tids: [t.tid],
    pids: [p.pid],
    weight: 3,
  });
  addInbox(league, {
    from: 'Assistant GM',
    subject: `${name} has asked for a trade`,
    body: `He expects about ${expects} minutes a game and has had ${Math.round(week)} lately. He won't sign a new deal while the request stands. Give him his minutes for a few weeks and he withdraws it.`,
    link: `/player/${p.pid}`,
    tone: 'bad',
    important: true,
  });
}

function settle(league: League, p: Player) {
  delete league.pulse!.asked[p.pid];
  const name = playerName(p);
  addNews(league, { kind: 'general', text: `${name} has withdrawn his trade request: he has his minutes back.`, tids: [league.userTid], pids: [p.pid] });
  addInbox(league, {
    from: 'Assistant GM',
    subject: `${name} has withdrawn his request`,
    body: 'He is playing his minutes again, and will talk about a new deal.',
    link: `/player/${p.pid}`,
    tone: 'good',
  });
}
