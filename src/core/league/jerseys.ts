// Jersey numbers: every player on a team wears his own number, and a franchise retires the number
// its legends wore there when they retire. A team's numbers are settled whenever a player joins it
// (a signing, a waiver claim, a trade or the draft) and before each of its games (see
// ensureRotation): the players it has already numbered keep theirs, and an arrival whose number is
// taken, or retired there, picks a free one. Nothing here draws on the league's random stream.

import type { AwardRecord, League, Player, Team } from '../types';
import { addInbox, addNews, playerName, seasonTid, teamPlayers } from './helpers';
import { careerLeaders } from './records';

/** Numbers a newcomer picks from first (any free number from 0-99 after that). */
export const JERSEYS = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '17',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '30',
  '31',
  '32',
  '33',
  '34',
  '35',
  '41',
  '44',
  '55',
];

const ALL = Array.from({ length: 100 }, (_, i) => String(i));

/** The numbers a team has retired. */
export function retiredNumbers(team: Team): Set<string> {
  return new Set((team.retired ?? []).map((r) => r.jersey));
}

/**
 * One number per player on a team: players it already numbered keep theirs (then the
 * longest-serving), and a draftee, signing or trade arrival whose number is taken, or retired here,
 * picks a free one. A retired number stays with a player who wore it here when it went up, until he
 * leaves, as in the NBA. Each player's number is kept by team (Player.jerseys), so a franchise that
 * retires it after he has moved on knows which it was.
 */
export function numberTeam(league: League, tid: number, players: Player[] = teamPlayers(league, tid)) {
  const team = league.teams[tid];
  // (a team never numbered: its rotation order, which arrivals are already in)
  const incumbents = new Set(team.numbered ?? team.rotation.order);
  const retired = retiredNumbers(team);
  const order = [...players].sort((a, b) => Number(incumbents.has(b.pid)) - Number(incumbents.has(a.pid)) || a.joinedSeason - b.joinedSeason || a.pid - b.pid);
  const used = new Set<string>();
  for (const p of order) {
    if (!p.jersey || used.has(p.jersey) || (retired.has(p.jersey) && !incumbents.has(p.pid))) p.jersey = freeNumber(p, used, retired);
    used.add(p.jersey);
    (p.jerseys ??= {})[tid] = p.jersey;
  }
  team.numbered = players.map((p) => p.pid);
}

/**
 * A number nobody on the team wears and it hasn't retired: the usual ones first, then any from 0 to
 * 99, picked by his pid. A roster never comes near a hundred, but if every number were worn or
 * retired a retired one would come back before two players shared one, and past that a number over 99.
 */
function freeNumber(p: Player, used: Set<string>, retired: Set<string>): string {
  const open = (j: string) => !used.has(j) && !retired.has(j);
  const free = [JERSEYS.filter(open), ALL.filter(open), ALL.filter((j) => !used.has(j))].find((list) => list.length);
  return free ? free[(Math.imul(p.pid, 0x9e3779b1) >>> 0) % free.length] : String(used.size);
}

// ---------------------------------------------------------------- retired numbers

/** Seasons a player needs with a franchise before it retires his number. */
export const LEGEND_SEASONS = 5;

/** Points for a franchise in this league's seasons its career scoring leader needs before that alone makes him a legend there. */
export const LEADER_POINTS = 15_000;

/** Why a franchise retires a player's number (see legendReason). */
export type LegendReason = 'Hall of Fame' | 'MVP' | 'Finals MVP' | 'title and All-NBA' | 'All-NBA' | 'All-Star' | 'scoring leader';

/** The team he won an award with: his postseason team for a title or the Finals MVP, otherwise the team he finished that regular season with. */
export function awardTeam(p: Player, a: AwardRecord): number | null {
  const post = a.type === 'Champion' || a.type === 'Finals MVP';
  return (post ? seasonTid(p, a.season, true) : null) ?? seasonTid(p, a.season);
}

/** Seasons he played for a team: his regular-season lines with it (a seeded player's real seasons count: they carry the team). */
export function seasonsWith(p: Player, tid: number): number {
  return new Set(p.stats.filter((s) => !s.playoffs && s.tid === tid && s.gp > 0).map((s) => s.season)).size;
}

/** The team he played the most seasons for (the most games among those tied), or null without a season played. */
export function mainTeam(p: Player): number | null {
  const by = new Map<number, { seasons: Set<number>; gp: number }>();
  for (const s of p.stats) {
    if (s.playoffs || s.gp <= 0) continue;
    const t = by.get(s.tid) ?? { seasons: new Set<number>(), gp: 0 };
    t.seasons.add(s.season);
    t.gp += s.gp;
    by.set(s.tid, t);
  }
  let best: number | null = null;
  for (const [tid, t] of by) {
    const b = best === null ? undefined : by.get(best)!;
    if (!b || t.seasons.size > b.seasons.size || (t.seasons.size === b.seasons.size && t.gp > b.gp)) best = tid;
  }
  return best;
}

/**
 * Why a franchise retires a retiring player's number, or null: he gave it five seasons and a career
 * it remembers there. A Hall of Famer's goes up with the team he played the most seasons for; anyone's
 * with a team he won an MVP or a Finals MVP for, a title with two All-NBA selections there, three
 * All-NBA or five All-Star selections there, or whose scoring record he holds (the most points for it
 * in this league's seasons, 15,000 at least). Played out for sixteen seasons (two real leagues and a
 * fictional one), that came to none in the first four seasons, 1.4 a season from the fifth to the
 * twelfth (none to three in a season), and about four a season from the thirteenth to the sixteenth,
 * as the generation of stars a league opens with retires, most of them Hall of Famers. A Hall of Famer
 * at every team he gave five seasons, a title with one All-NBA selection and a 10,000-point scoring
 * record made it a quarter more.
 */
export function legendReason(league: League, p: Player, tid: number): LegendReason | null {
  if (seasonsWith(p, tid) < LEGEND_SEASONS) return null;
  if (p.hof && mainTeam(p) === tid) return 'Hall of Fame';
  const here = p.awards.filter((a) => awardTeam(p, a) === tid);
  const won = (type: string) => here.filter((a) => a.type === type).length;
  const allNba = here.filter((a) => a.type.startsWith('All-NBA')).length;
  if (won('MVP')) return 'MVP';
  if (won('Finals MVP')) return 'Finals MVP';
  if (won('Champion') && allNba >= 2) return 'title and All-NBA';
  if (allNba >= 3) return 'All-NBA';
  if (won('All-Star') >= 5) return 'All-Star';
  const leader = careerLeaders(league, 'pts', { tid, n: 1 })[0];
  if (leader?.pid === p.pid && leader.v >= LEADER_POINTS) return 'scoring leader';
  return null;
}

/**
 * The number he wore for a team: the one it last gave him, or for a save from before numbers were
 * kept by team, the one he wears now, which is only known to be the last team's he played for.
 */
function numberWith(p: Player, tid: number, lastTid: number | null): string | undefined {
  const kept = p.jerseys?.[tid];
  if (kept) return kept;
  // (numbered by another team since, he may wear its number now)
  const renumbered = Object.keys(p.jerseys ?? {}).length > 0;
  return tid === lastTid && !renumbered && p.jersey ? p.jersey : undefined;
}

/**
 * A player has just retired (tid RETIRED, the Hall of Fame decided): every franchise he was a legend
 * for retires the number he wore there, in the news ("The Celtics will retire Jayson Tatum's No.
 * 0."), and the owner tells the GM when it's his. Returns the franchises that did.
 */
export function retireNumbers(league: League, p: Player): number[] {
  const out: number[] = [];
  const lastTid = p.stats.length ? p.stats[p.stats.length - 1].tid : null;
  const teams = [...new Set(p.stats.filter((s) => !s.playoffs && s.gp > 0 && league.teams[s.tid]).map((s) => s.tid))];
  for (const tid of teams) {
    const team = league.teams[tid];
    const jersey = numberWith(p, tid, lastTid);
    if (!jersey || team.retired?.some((r) => r.pid === p.pid) || !legendReason(league, p, tid)) continue;
    const name = playerName(p);
    (team.retired ??= []).push({ jersey, pid: p.pid, name, season: league.season });
    out.push(tid);
    addNews(league, { kind: 'retire', text: `The ${team.name} will retire ${name}'s No. ${jersey}.`, tids: [tid], pids: [p.pid] });
    if (tid === league.userTid)
      addInbox(league, {
        from: 'Owner',
        subject: `No. ${jersey} to the rafters`,
        body: `${name}'s No. ${jersey} goes up to the rafters at the home opener, and nobody wears it for the ${team.name} again.`,
        tone: 'good',
        link: `/league/history?tid=${tid}`,
      });
  }
  // the numbers he wore by team were kept for this
  delete p.jerseys;
  return out;
}
