// The locker rooms' pulse: two quiet signals about every team, read once a week from what has
// actually happened on the floor. No conversations, no promises, no morale to manage.
//
// Role: a player good enough to expect minutes compares what he plays with what a player of his
// standing plays (a star about 32 a game, a starter 24, a sixth man 14). Short of it week after
// week he wants more; a star left there for three weeks asks for a trade, and won't sign a new deal
// with the team while the request stands. Playing him settles it; so does trading him.
//
// Direction, around the league: a star in his prime on a team that is out of it (twenty games in
// and under .400) tires of losing. Not all of them: some ride it out. One who doesn't asks for a
// trade after a month or two of it, his team puts him on the block (aiTrades.ts's sellable: the
// finder and the rumor mill show him there, AI teams and the user can deal for him), and he signs
// nothing new there. A team that climbs back gets him back. The user's own players answer only for
// what he controls, their minutes: a request he inherits with a new job is settled by winning.
//
// Cohesion: the five who play the most are the core. The longer they have played together and
// the more they win, the tighter the group; trade one away and it starts again. A tight, winning
// group forgives a short week (its players are slower to complain), and it executes a little better
// on the floor: from "Settled" up, every team's shots fall a touch more (K.cohesion in the engine,
// at most under half a point a game; games.ts's buildSimInput hands it over).
//
// It is part of the world around the games (world.ts): it reads the league and writes news, mail
// and its own state, and draws nothing from the league's random stream. What is random about it (how
// patient a star is) is a hash of the league, the season and the player.
import type { League, Player } from '../types';
import { hashString } from '../random';
import { addInbox, addNews, curTeamSeason, playerName, standardRoster, winPct } from './helpers';
import { playerAge } from '../playerGen';

/** Why a player asked out: short of his minutes, or tired of losing. */
export type AskWhy = 'role' | 'losing';

/** One team's room. */
export interface Room {
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
  /** Players who have asked for a trade: when, why, and (the user's) whether he has answered it (it then leaves Needs you). */
  asked: Record<number, { season: number; day: number; seen?: boolean; why?: AskWhy }>;
  /** Weeks in a row the team has been out of it (see OUT_OF_IT). */
  out: number;
}

export interface PulseState {
  season: number;
  /** The day of the last weekly read. */
  day: number;
  /** Every team's room, by tid. */
  rooms: Record<number, Room>;
}

/** Days between reads. */
const WEEK = 7;
/** Under this a player wants more; a star under it for ASK_WEEKS reads in a row asks out. */
export const UNHAPPY = -0.45;
export const ASK_WEEKS = 3;
/** Minutes a player must expect before he would ask for a trade: a star's. */
const STAR_MINUTES = 30;
/** Over this a request over minutes is withdrawn. */
const SETTLED = 0.1;
/** A group this tight or tighter executes better on the floor (the word for it: "Settled"). */
export const COHESION_EDGE = 0.55;
/** Where a room starts: getting to know each other. */
const NEW_ROOM = 0.35;
/** A team is out of it this many games in and under this record; back in it at `back`. */
export const OUT_OF_IT = { games: 20, pct: 0.4, back: 0.46 };
/** A star who would ask out of a losing team does after this many weeks of it, by his patience; about this share of them ever would. */
export const LOSING_WEEKS = [4, 8] as const;
const WOULD_ASK = 0.6;
/** ...and only one in his prime or past it, who has been there a while. */
const LOSING_AGE = 26;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const newRoom = (): Room => ({ core: [], cohesion: NEW_ROOM, mood: {}, low: {}, games: 0, seen: {}, asked: {}, out: 0 });

/** A team's room (null before the season's first read). */
export const roomOf = (league: League, tid: number): Room | null => league.pulse?.rooms[tid] ?? null;

/** How tight a team's core is, 0..1 (a room not read yet: getting to know each other). */
export const cohesionOf = (league: League, tid: number): number => roomOf(league, tid)?.cohesion ?? NEW_ROOM;

/** A core's cohesion settles here: how long its five have played together (0..1) and how much they win (0..1). */
const cohesionTarget = (tenure: number, winning: number) => 0.2 + 0.45 * tenure + 0.35 * winning;
/** Share of a season's games a record of `pct` counts as winning for a core (0 at .300, 1 at .700). */
const winningOf = (pct: number) => clamp((pct - 0.3) / 0.4, 0, 1);

/**
 * How tight a team's core will be over the rest of the season, on average: its room today moved
 * most of the way to where it is heading (the five who play most, or before a room is read the five
 * best, by how long they have been there; `pct` the record the team is expected to keep). The
 * season forecast reads it (analysis/odds.ts), so what a settled core is worth on the floor is in a
 * team's projection, and in the goals an owner sets from it, before the games say so.
 */
export function expectedCohesion(league: League, tid: number, pct: number): number {
  const room = roomOf(league, tid);
  const now = room?.cohesion ?? NEW_ROOM;
  const core = room?.core.length
    ? room.core.map((pid) => league.players[pid]).filter((p): p is Player => !!p && p.tid === tid)
    : standardRoster(league, tid)
        .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
        .slice(0, 5);
  if (!core.length) return now;
  const tenure = core.reduce((a, p) => a + Math.min(1, gamesWith(p, tid) / 82), 0) / 5;
  // (a week closes a fifth of the gap: over a season the room sits about three quarters of the way there)
  return clamp(now + (cohesionTarget(tenure, winningOf(pct)) - now) * 0.75, 0, 1);
}

/** Is the user's team the user's to run (not after a sacking)? Its mail and its agenda are only then. */
const users = (league: League, tid: number) => tid === league.userTid && !league.fired;

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
  /** He has asked for a trade (and why): he won't sign a new deal there while it stands. */
  asked: boolean;
  why?: AskWhy;
}

/**
 * A player's role as the pulse reads it: one of the user's who expects minutes, or anyone, anywhere,
 * who has asked for a trade (null otherwise: another team's moods are its own business).
 */
export function roleRead(league: League, p: Player): RoleRead | null {
  if (p.tid < 0) return null;
  const s = roomOf(league, p.tid);
  const ask = s?.asked[p.pid];
  if (p.tid !== league.userTid && !ask) return null;
  const expects = expectedMinutes(league, p);
  if (!expects && !ask) return null;
  const mood = s?.mood[p.pid] ?? 0;
  // (a game: in the games he has played, as his page says it; a game missed hurt isn't a short night)
  const [min, gp] = playedFor(p, league.season, p.tid);
  const plays = gp ? Math.round((min / gp) * 10) / 10 : 0;
  const word: RoleWord = ask ? 'Asked for a trade' : mood <= UNHAPPY && (s?.low[p.pid] ?? 0) >= 2 ? 'Unhappy with his role' : mood <= UNHAPPY ? 'Wants more minutes' : 'Content';
  return {
    pid: p.pid,
    word,
    tone: ask || word === 'Unhappy with his role' ? 'bad' : word === 'Content' ? 'good' : 'warn',
    expects,
    plays,
    asked: !!ask,
    ...(ask ? { why: ask.why ?? 'role' } : {}),
  };
}

/** The group's cohesion in a word, the same ladder everywhere. */
export const cohesionWord = (c: number) => (c >= 0.75 ? 'Tight group' : c >= COHESION_EDGE ? 'Settled' : c >= 0.35 ? 'Getting to know each other' : 'Strangers');

/** What a group this tight gets on the floor, in words (no figure: it is small, and finding out is the game). */
export const cohesionEffect = (c: number) =>
  c >= 0.75 ? 'Executes better on the floor.' : c >= COHESION_EDGE ? 'Executes a little better on the floor.' : 'No lift on the floor yet.';

export interface PulseRead {
  cohesion: number;
  word: string;
  /** What the group's cohesion does on the floor (see cohesionEffect). */
  effect: string;
  /** One line: where the room stands. */
  line: string;
  core: number[];
  /** Everyone not content, the request first, then the unhappiest. */
  roles: RoleRead[];
}

/** The user's room as the Team screen shows it. */
export function pulseRead(league: League): PulseRead {
  const s = roomOf(league, league.userTid);
  const cohesion = s?.cohesion ?? NEW_ROOM;
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
        : cohesion >= COHESION_EDGE
          ? 'Everyone is content with his role.'
          : 'A new group, still finding itself.';
  return { cohesion, word, effect: cohesionEffect(cohesion), line, core: s?.core ?? [], roles };
}

/** Has he asked his team for a trade (any team's player)? */
export const wantsOut = (league: League, p: Player): boolean => p.tid >= 0 && !!roomOf(league, p.tid)?.asked[p.pid];

/** Why he asked (null: he hasn't). */
export const wantsOutWhy = (league: League, p: Player): AskWhy | null => (p.tid >= 0 ? (roomOf(league, p.tid)?.asked[p.pid]?.why ?? (wantsOut(league, p) ? 'role' : null)) : null);

/** Has he asked the user for a trade (and so won't sign a new deal with the user's team)? */
export const askedOut = (league: League, p: Player): boolean => p.tid === league.userTid && wantsOut(league, p);

/** Why he won't talk about a new deal with his team, or null. */
export function askedOutReason(league: League, p: Player): string | null {
  if (!wantsOut(league, p)) return null;
  return wantsOutWhy(league, p) === 'losing'
    ? `${playerName(p)} has asked for a trade. He won't sign a new deal while the team is losing.`
    : `${playerName(p)} has asked for a trade. He won't sign a new deal until his role is settled.`;
}

/** Everyone around the league who has asked his team for a trade (the user's own are on his agenda), best first. */
export function tradeRequests(league: League): Player[] {
  const rooms = league.pulse?.rooms ?? {};
  return Object.entries(rooms)
    .filter(([tid]) => !users(league, Number(tid)))
    .flatMap(([tid, r]) => Object.keys(r.asked).map((pid) => ({ tid: Number(tid), p: league.players[Number(pid)] })))
    .filter((x): x is { tid: number; p: Player } => !!x.p && x.p.tid === x.tid)
    .map((x) => x.p)
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
}

/** The user has seen a request (shopped him, went to the rotation, or said he stays): it leaves Needs you and stands on Team. */
export function answerRequest(league: League, pid: number) {
  const a = roomOf(league, league.userTid)?.asked[pid];
  if (a) a.seen = true;
}

/** Requests the user hasn't answered yet, for the agenda. */
export function openRequests(league: League): Player[] {
  const s = roomOf(league, league.userTid);
  if (!s || league.fired) return [];
  return Object.entries(s.asked)
    .filter(([, a]) => !a.seen)
    .map(([pid]) => league.players[Number(pid)])
    .filter((p): p is Player => !!p && p.tid === league.userTid);
}

/** A number 0..1 that is this player's own for the season: the same every time it is asked. */
const draw = (league: League, pid: number, what: string) => (hashString(`${league.id}:${league.season}:${pid}:${what}`) >>> 0) / 2 ** 32;

/**
 * How many weeks of a team being out of it a star takes before he asks out (LOSING_WEEKS), or
 * Infinity for one who rides it out: under LOSING_AGE, or only just arrived (this season, by a
 * trade or a signing), or one of the share who never would.
 */
export function losingPatience(league: League, p: Player): number {
  if (playerAge(p, league.season) < LOSING_AGE || (p.joinedSeason ?? 0) >= league.season) return Infinity;
  if (draw(league, p.pid, 'asks') >= WOULD_ASK) return Infinity;
  return LOSING_WEEKS[0] + Math.floor(draw(league, p.pid, 'patience') * (LOSING_WEEKS[1] - LOSING_WEEKS[0] + 1));
}

/**
 * The week's read (worldDay calls it every day; it acts every seventh of the regular season).
 * Every team's room is read the same way: once ten games are in, each player's role moves toward
 * what the week said, the core and its cohesion are taken again, and a star short for three weeks
 * asks out. Around the league a star also asks out of a team that has been out of it too long
 * (see losingPatience). A request is withdrawn once its cause is gone (his minutes back, the team
 * back in it), and forgotten when he is no longer on the team.
 */
export function pulseDay(league: League) {
  if (league.phase !== 'regular') return;
  if (!league.pulse || league.pulse.season !== league.season) {
    // a new season: each group carries over with its requests, last season's minutes don't
    const was = league.pulse?.rooms ?? {};
    league.pulse = { season: league.season, day: league.day, rooms: {} };
    for (const [tid, r] of Object.entries(was)) {
      const room = (league.pulse.rooms[Number(tid)] = { ...newRoom(), core: r.core, cohesion: r.cohesion, asked: r.asked });
      for (const [pid, m] of Object.entries(r.mood)) room.mood[Number(pid)] = m * 0.5;
    }
  }
  const s = league.pulse;
  if (league.day - s.day < WEEK) return;
  s.day = league.day;
  for (const t of league.teams) readRoom(league, t.tid, (s.rooms[t.tid] ??= newRoom()));
}

function readRoom(league: League, tid: number, s: Room) {
  const mine = users(league, tid);
  const ts = curTeamSeason(league, tid);
  const games = ts.won + ts.lost;
  const played = games - s.games;
  const roster = standardRoster(league, tid);
  const here = new Set(roster.map((p) => p.pid));
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
    const winning = winningOf(ts.won / Math.max(1, games));
    const target = cohesionTarget(tenure, winning);
    // a core member gone: the group starts again by that much
    const base = s.cohesion * kept;
    s.cohesion = Math.round(clamp(base + (target - base) * 0.2, 0, 1) * 100) / 100;
    s.core = core;
    // out of it: twenty games in and well under .500; back in it a little higher, so a team on the line doesn't flicker
    const pct = winPct(ts);
    s.out = games >= OUT_OF_IT.games && pct < OUT_OF_IT.pct ? s.out + 1 : pct >= OUT_OF_IT.back ? 0 : s.out;
    // each role: the week's minutes against what he expects, a winning, tight group forgiving some of it
    const ease = (winning > 0.8 ? 0.15 : 0) + s.cohesion * 0.2;
    for (const p of roster) {
      const expects = expectedMinutes(league, p);
      const now = stats.get(p.pid)!;
      const before = Array.isArray(s.seen[p.pid]) ? s.seen[p.pid] : undefined;
      s.seen[p.pid] = now;
      const asked = s.asked[p.pid];
      // tired of losing (other teams' stars; a request the user inherited is settled the same way)
      if (asked?.why === 'losing') {
        if (s.out === 0) settle(league, tid, p, 'losing');
        continue;
      }
      if (!mine && !asked && expects >= STAR_MINUTES && !p.injury && s.out >= losingPatience(league, p)) {
        request(league, tid, p, 'losing', expects, 0);
        continue;
      }
      // (the first read of him, a season's first or a new arrival's: there is no week to read yet.
      // Hurt, he isn't being held out: the week says nothing)
      if (!expects || p.injury || before === undefined) {
        if (!expects) delete s.low[p.pid];
        continue;
      }
      // his minutes a game in the games he played this week; fit and never used, none at all
      const week = (now[0] - before[0]) / Math.max(1, now[1] - before[1]);
      const want = clamp((week - expects) / (expects * 0.35) + ease, -1, 1);
      const mood = Math.round(((s.mood[p.pid] ?? 0) * 0.55 + want * 0.45) * 100) / 100;
      s.mood[p.pid] = mood;
      s.low[p.pid] = mood <= UNHAPPY ? (s.low[p.pid] ?? 0) + 1 : 0;
      if (!asked && expects >= STAR_MINUTES && s.low[p.pid] >= ASK_WEEKS) request(league, tid, p, 'role', expects, week);
      else if (asked && mood >= SETTLED) settle(league, tid, p, 'role');
    }
  } else for (const p of roster) s.seen[p.pid] ??= stats.get(p.pid)!;
  s.games = games;
}

function request(league: League, tid: number, p: Player, why: AskWhy, expects: number, week: number) {
  const t = league.teams[tid];
  const mine = users(league, tid);
  roomOf(league, tid)!.asked[p.pid] = { season: league.season, day: league.day, why };
  const name = playerName(p);
  const ts = curTeamSeason(league, tid);
  const text =
    why === 'losing'
      ? `The ${t.name} are ${ts.won}-${ts.lost}. He wants to play for a winner.`
      : `He has played ${Math.round(week)} minutes a game lately. A player of his standing plays about ${expects}.`;
  const body =
    why === 'losing'
      ? `${name} has told the ${t.name} he wants out.\n\nThey are ${ts.won}-${ts.lost} and going nowhere this season. He won't talk about a new deal while it stands.\n\nThe ${t.name} are taking calls. Winning would settle it. So would a trade.`
      : `${name} has told the ${t.name} he wants out.\n\nHe has been short of a star's minutes for three weeks. He won't talk about a new deal while it stands.\n\nPlaying him settles it. So does a trade.`;
  addNews(league, { kind: 'rumor', head: `${name} asks the ${t.name} for a trade`, text, body, tids: [t.tid], pids: [p.pid], weight: mine ? 3 : 2 });
  if (!mine) return;
  addInbox(league, {
    from: 'Assistant GM',
    subject: `${name} has asked for a trade`,
    body: `He expects about ${expects} minutes a game and has had ${Math.round(week)} lately. He won't sign a new deal while the request stands. Give him his minutes for a few weeks and he withdraws it.`,
    link: `/player/${p.pid}`,
    tone: 'bad',
    important: true,
  });
}

function settle(league: League, tid: number, p: Player, why: AskWhy) {
  delete roomOf(league, tid)!.asked[p.pid];
  const name = playerName(p);
  addNews(league, {
    kind: 'general',
    text:
      why === 'losing'
        ? `${name} has withdrawn his trade request: the ${league.teams[tid].name} are winning again.`
        : `${name} has withdrawn his trade request: he has his minutes back.`,
    tids: [tid],
    pids: [p.pid],
  });
  if (!users(league, tid)) return;
  addInbox(league, {
    from: 'Assistant GM',
    subject: `${name} has withdrawn his request`,
    body: why === 'losing' ? 'The team is back in it, and he will talk about a new deal.' : 'He is playing his minutes again, and will talk about a new deal.',
    link: `/player/${p.pid}`,
    tone: 'good',
  });
}
