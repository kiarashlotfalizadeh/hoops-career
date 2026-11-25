// Running scheduled games and folding results into the league.

import { formOf, legendRooms } from './legends';
import type { GameResult, League, Player, Rotation, ScheduledGame, StandingLine, Team, TeamSeason, TeamTotals } from '../types';
import { GameSim, K, type SimTeamInput } from '../sim/engine';
import { Rng, clamp } from '../random';
import { autoRotation, autoTactics, presetScores, staffPick, styleChanged } from '../ai/coachAI';
import { addNews, andList, inSeason, playerName, statsLine, teamCity, teamPlayers, teamSeason } from './helpers';
import { cohesionOf } from './pulse';
import { applyInjury, clearedToPlay, GAME_TIME_PERF, healOneGame } from './injuries';
import { gameFinances, updateHype } from './finances';
import { playerAge } from '../playerGen';
import { consumePlans, effectiveTactics, planFor } from './gamePlans';
import { confStandings } from './standings';
import { hasCoachPlans, withoutCoachPlans } from '../sim/tactics';
import { aiGamePlan, oppPlanIn, planTeam, withOppPlan } from '../ai/opponentPlan';
import { staffTactics } from '../ai/advisor';
import { projectGame } from '../analysis/projection';
import { careerOnRecord, careerTotals, marksCrossed, markText, newsworthy, type MilestoneStat } from '../analysis/milestones';
import { planAim } from '../analysis/moves';
import { recapFacts } from '../analysis/quotes';
import { recordGame, recordNews } from './records';
import { numberTeam } from './jerseys';
import { plural } from '../format';
import { playbookLabel } from '../sim/playbooks';
import { userYouth } from './youthLean';
import { curTeamSeason } from './helpers';

export function wearPerf(p: Player) {
  return 1 - clamp(p.wear - 40, 0, 60) / 1200; // up to -5% when badly worn down
}

/**
 * Extra injury risk from worn-down legs, on top of the engine's in-game risk: up to +30% at full
 * wear. (At +60% the heaviest minute loads, the stars', broke down most: in two real-league seasons
 * 4.75 of the ten best reached the 65 games awards ask for, where the NBA's six to seven do.)
 */
export function wearInjuryRisk(p: Player) {
  return (clamp(p.wear - 40, 0, 60) / 60) * 0.3;
}

/**
 * A team's injury risk with this many players already out: a training staff that is already
 * treating two or three players manages the rest's loads more carefully, and past CROWD_OUT.length
 * nobody new goes down (a few players' knocks take them out a game or two, but the team never has
 * seven to eleven players out at once, as it did with every risk independent). At [1, 1, 1, 0.75,
 * 0.5, 0.25] some team still had six to eight out at once every season (two seeds of three, the risk
 * read once before a game that then hurt two), 2-4% of all team-days with five or more: a playtester's
 * contender had seven of fifteen out and fell to 8-14. Now a third of the roster at most.
 */
const CROWD_OUT = [1, 1, 0.85, 0.6, 0.3];
/** The most players a team has out at once: past it a new injury is a scare, not an absence (see CROWD_OUT; a game can hurt two). */
export const MAX_OUT = CROWD_OUT.length;

/** Games the MVP, All-League and the other votes ask of a player (awards.ts), and the nights to spare a staff keeps before it stops resting him. */
const AWARD_GAMES = 65;
const AWARD_SPARE = 3;
/** A player good enough for the votes to matter to him (All-League and All-Defense reach this far down). */
const AWARD_OVR = 82;

/**
 * Whether a night off would put his 65 games at risk: an awards-level player who can still reach
 * the line with the games his team has left, with fewer than AWARD_SPARE to spare. A conference
 * leader six games clear rests its best player on every back-to-back's second night, and a seed
 * locked early rests its three best on alternate nights: with an injury on top, the league's best
 * player on its best team finished short of the line and the MVP went to a lesser season (a
 * playtester's 31.1-point scorer on a 62-win champion, twice in two leagues). Real staffs count the
 * games.
 */
export function awardLineAtStake(league: League, p: Player | undefined, tid: number): boolean {
  if (!p || p.ovr < AWARD_OVR || league.phase !== 'regular') return false;
  const ts = curTeamSeason(league, tid);
  const left = Math.max(0, 82 - ts.won - ts.lost);
  const gp = p.stats.reduce((a, s) => a + (s.season === league.season && !s.playoffs && !s.real ? s.gp : 0), 0);
  return gp + left >= AWARD_GAMES && gp + left - 1 < AWARD_GAMES + AWARD_SPARE;
}

/** Players out injured on a team now. */
export function injuredCount(league: League, tid: number) {
  return teamPlayers(league, tid).filter((p) => p.injury && p.injury.gamesRemaining > 0).length;
}

/** Practice intensity and the medical budget scale a team's injury risk, and the players already out (`out`) damp it. */
export function teamInjuryMult(team: Team, out = 0) {
  return (team.practice === 'intense' ? 1.18 : team.practice === 'light' ? 0.88 : 1) * (1.1 - 0.2 * (team.budget.health / 100)) * (CROWD_OUT[out] ?? 0);
}

function playedYesterday(league: League, tid: number, day: number): boolean {
  return league.schedule.some((g) => g.day === day - 1 && (g.home === tid || g.away === tid));
}

function bestPresetsChanged(team: Team, players: Player[], user: boolean, sticky: boolean): boolean {
  // (the user's staff, which picks by its read: what it would change to, in season only past STICK, so
  // two close reads trading places don't refit it every day)
  if (user) {
    const sc = presetScores(team, players, { user });
    return staffPick(sc.off, team.tactics.offPreset, sticky) !== team.tactics.offPreset || staffPick(sc.def, team.tactics.defPreset, sticky) !== team.tactics.defPreset;
  }
  // (an AI staff plays its coach's style: it refits when its personnel calls for another coverage)
  return styleChanged(team, players);
}

/**
 * The playbook the staff runs for the user (staffTactics: the roster's best fit, with the changes it
 * measured as gains this season and made), put in place. The staff's word on a change goes out when
 * it's made, with what it measured (staffLever.ts): a refit says nothing.
 */
export function applyStaffTactics(league: League, tid: number) {
  league.teams[tid].tactics = staffTactics(league, tid);
}

/**
 * How far an AI team has turned to its young players for the rest of the season (0 to 1): all the
 * way for a rebuilding team in its conference's bottom four from about 20 games in, and for every
 * rebuilding team out of the race after the trade deadline (11th or lower in its conference);
 * halfway for any other team that isn't contending, 12th or lower with 15 games or fewer left.
 * The young play over the veterans (youthLean) and the minutes go down the bench, and a full youth
 * movement sits its veterans some nights (restVeterans): it costs games, as it does in the NBA,
 * and the lottery pays for them. The user's team is the user's call.
 *
 * Without it the bottom of the league was too shallow: over 12 simulated seasons in four leagues,
 * teams under 25 wins 1.6 a season (the NBA's 2023-24 to 2025-26: 5-6) and a win SD of 10.5 (13).
 */
export function youthMovement(league: League, tid: number): number {
  // (the user's team turns to its young players only when he says so, or his staff does: see weekCall.ts)
  if (tid === league.userTid) return userYouth(league);
  if (tid === league.userTid || league.phase !== 'regular' || league.day < YOUTH_FROM) return 0;
  return dayStandings(league).youth.get(tid) ?? 0;
}

/**
 * Whether a team has locked up its conference's top seed (as the day began): nobody behind it can
 * reach its wins with the games they have left. Its staff rests the stars for the playoffs from then
 * on (restForPlayoffs).
 */
export function seedLocked(league: League, tid: number): boolean {
  return league.phase === 'regular' && dayStandings(league).locked.has(tid);
}

/** What the day's AI decisions read off the standings, worked out once a day. */
function dayStandings(league: League) {
  const key = `${league.season}:${league.day}`;
  let memo = dayMemo.get(league);
  if (!memo || memo.key !== key) {
    const start = dayStart(league);
    memo = { key, youth: youthLevels(league, start), locked: lockedSeeds(league, start), clear: clearLeaders(start, league) };
    dayMemo.set(league, memo);
  }
  return memo;
}

const dayMemo = new WeakMap<League, { key: string; youth: Map<number, number>; locked: Set<number>; clear: Set<number> }>();

/**
 * A conference leader well clear of the rest (CLEAR_LEAD games ahead of the second, CLEAR_FROM games
 * in): its staff rests its best player on the second night of a back-to-back, as NBA contenders do.
 * Without it a staff-run Thunder won 73 and 75 and strung together 38- and 43-game streaks in the star
 * check's leagues (the NBA's record is 33).
 */
export function clearLeader(league: League, tid: number): boolean {
  return league.phase === 'regular' && dayStandings(league).clear.has(tid);
}

function clearLeaders({ record }: DayStart, league: League): Set<number> {
  const out = new Set<number>();
  for (const conf of ['E', 'W'] as const) {
    const rows = league.teams
      .filter((t) => t.conf === conf)
      .map((t) => ({ t, r: record(t) }))
      .sort((a, b) => b.r[0] - b.r[1] - (a.r[0] - a.r[1]));
    if (rows.length < 2 || rows[0].r[0] + rows[0].r[1] < CLEAR_FROM) continue;
    if ((rows[0].r[0] - rows[0].r[1] - (rows[1].r[0] - rows[1].r[1])) / 2 >= CLEAR_LEAD) out.add(rows[0].t.tid);
  }
  return out;
}

/** Games ahead of its conference's second, and games played, before a leader rests its best player on back-to-backs (clearLeader). */
const CLEAR_LEAD = 5;
const CLEAR_FROM = 28;

/** The day of the season a rebuilding team at the bottom of its conference starts leaning toward its young players (~35 games in). */
const YOUTH_FROM = 70;

interface DayStart {
  /** Regular-season games each team has left from today on. */
  left: Map<number, number>;
  /** A team's wins and losses as the day began. */
  record: (t: Team) => [number, number];
}

/** Standings as the day began (today's games already played taken off), so every game of a day reads the same. */
function dayStart(league: League): DayStart {
  const left = new Map<number, number>();
  for (const g of league.schedule) if (g.type === 'regular' && g.day >= league.day) for (const tid of [g.home, g.away]) left.set(tid, (left.get(tid) ?? 0) + 1);
  const today = new Map<number, [number, number]>();
  for (let i = league.games.length - 1; i >= 0; i--) {
    const g = league.games[i];
    if (g.season !== league.season || g.day !== league.day) break;
    if (g.type !== 'regular') continue;
    const homeWon = g.home.pts > g.away.pts;
    for (const [tid, won] of [
      [g.home.tid, homeWon],
      [g.away.tid, !homeWon],
    ] as const) {
      const x = today.get(tid) ?? [0, 0];
      x[won ? 0 : 1]++;
      today.set(tid, x);
    }
  }
  const record = (t: Team): [number, number] => {
    const ts = teamSeason(t, league.season);
    const [w, l] = today.get(t.tid) ?? [0, 0];
    return [ts.won - w, ts.lost - l];
  };
  return { left, record };
}

function youthLevels(league: League, { left, record }: DayStart): Map<number, number> {
  const out = new Map<number, number>();
  const after = league.day > league.tradeDeadlineDay;
  const pct = (t: Team) => {
    const [w, l] = record(t);
    return w + l ? w / (w + l) : 0.5;
  };
  for (const conf of ['E', 'W'] as const) {
    const rows = league.teams
      .filter((t) => t.conf === conf)
      .map((t) => ({ t, wp: pct(t) }))
      .sort((a, b) => b.wp - a.wp || a.t.tid - b.t.tid);
    rows.forEach(({ t }, i) => {
      if (t.tid === league.userTid) return;
      if (!after) {
        // Before the deadline, bottom rebuilders give youth extra minutes without shutting veterans down completely
        if (t.strategy === 'rebuild' && i >= rows.length - 3) out.set(t.tid, 0.5);
      } else if (t.strategy === 'rebuild' && i >= 10) out.set(t.tid, 1);
      else if (t.strategy !== 'contend' && i >= 11 && (left.get(t.tid) ?? 0) <= 15) out.set(t.tid, 0.5);
    });
  }
  return out;
}

/** Each conference's leader when nobody behind it can still reach its wins. */
function lockedSeeds(league: League, { left, record }: DayStart): Set<number> {
  const out = new Set<number>();
  for (const conf of ['E', 'W'] as const) {
    const rows = league.teams.filter((t) => t.conf === conf).map((t) => ({ t, won: record(t)[0], most: record(t)[0] + (left.get(t.tid) ?? 0) }));
    if (!rows.length) continue;
    const top = rows.reduce((a, b) => (b.won > a.won ? b : a));
    if (rows.every((r) => r === top || r.most < top.won)) out.add(top.t.tid);
  }
  return out;
}

/**
 * A youth movement's lean (OVR points) toward a player in the rotation: up to 7 for the
 * 22-and-unders it is building around, down 3 at 28-29, 6 at 30-31 and 8 after that. With the
 * veterans' nights off it costs a team about 3 points per 100 (2 in the real league, whose
 * rebuilders are already young), measured over paired games against the league.
 */
export function youthLean(age: number): number {
  if (age <= 22) return 7;
  if (age <= 25) return [5, 3, 1][age - 23];
  if (age <= 27) return 0;
  return age <= 29 ? -3 : age <= 31 ? -6 : -8;
}

/**
 * A full youth movement's veterans sit some nights: the 30-and-ups every other night, the
 * 28-and-ups and its two best players 24 or older every third (load management, a sore knee), but
 * never so many that fewer than YOUTH_DRESSED healthy players dress: a rebuilder with eight
 * hurt had sat its three best healthy players too and sent out nine, who
 * lost by 77 (and another such night by 86). Nor more than YOUTH_TOP_REST of its five best healthy
 * players on one night (the league's participation rules): a rebuilder with three 87-90 veterans
 * sat all of them on some nights, scored 53 and lost by 78.
 */
export function restVeterans(league: League, players: Player[], day: number, rest: number[]) {
  const best = players
    .filter((p) => playerAge(p, league.season) >= 24)
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
    .slice(0, 2);
  const top = new Set(
    players
      .filter((p) => !p.injury)
      .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
      .slice(0, 5)
      .map((p) => p.pid),
  );
  let topOut = rest.filter((pid) => top.has(pid)).length;
  let dressed = players.filter((p) => !p.injury && !rest.includes(p.pid)).length;
  for (const p of players) {
    const age = playerAge(p, league.season);
    if (rest.includes(p.pid) || (age < 28 && !best.includes(p))) continue;
    if ((p.pid + day) % (age >= 30 ? 2 : 3) !== 0) continue;
    const counts = !p.injury;
    if (counts && dressed <= YOUTH_DRESSED) continue;
    if (top.has(p.pid) && topOut >= YOUTH_TOP_REST) continue;
    rest.push(p.pid);
    if (counts) dressed--;
    if (top.has(p.pid)) topOut++;
  }
}

/** The most of a youth movement's five best healthy players its nights off sit at once (see restVeterans). */
const YOUTH_TOP_REST = 2;

/** The fewest healthy players a youth movement's nights off leave dressed (see restVeterans). */
const YOUTH_DRESSED = 10;

/**
 * A team that has locked up its conference's top seed saves its stars for the playoffs, as NBA
 * coaches do once the seeding can't change: its three best players each sit every other night
 * (staggered, so most nights two of them dress). Without it a deep young core kept together ran
 * past anything the league has seen: with the Thunder run by the staff, 8 of 48 seasons over 73
 * wins (77-5 three years running in one league); 1 of 48 with it.
 */
export function restForPlayoffs(players: Player[], day: number, rest: number[]) {
  const best = players
    .filter((p) => !p.injury)
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
    .slice(0, PLAYOFF_REST);
  for (const p of best) if (!rest.includes(p.pid) && (p.pid + day) % 2 === 0) rest.push(p.pid);
}

/** How many of a team's best players restForPlayoffs sits on alternate nights. */
const PLAYOFF_REST = 3;

/** The day a team turns to its young players, a word in the news (once a season). */
export function youthNews(league: League) {
  for (const t of league.teams) {
    if (youthMovement(league, t.tid) < 1) continue;
    if (league.news.some((n) => n.season === league.season && n.kind === 'general' && n.tids[0] === t.tid && YOUTH_NEWS.test(n.text))) continue;
    const young = teamPlayers(league, t.tid)
      .filter((p) => playerAge(p, league.season) <= 23)
      .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
      .slice(0, 2);
    addNews(league, {
      kind: 'general',
      text: `${teamCity(league, t)} turns to its young players.${young.length ? ` More minutes for ${andList(young.map(playerName))}.` : ''} Their veterans will sit some nights.`,
      tids: [t.tid],
      pids: young.map((p) => p.pid),
    });
  }
}

/** The line youthNews writes (and, in older saves, wrote with the nickname: "turn to their young players"). */
const YOUTH_NEWS = /turns? to (its|their) young players/;

/**
 * The user's own rotation after the roster changes under it (a trade, a signing): his order and
 * minutes kept, departed players dropped, new ones at the end of the depth chart with no minutes set
 * (the trade screen's impact reads the same, see tradeImpact).
 */
export function keepManualRotation(rot: Rotation, players: Player[]) {
  const pids = new Set(players.map((p) => p.pid));
  rot.order = rot.order.filter((pid) => pids.has(pid));
  for (const p of [...players].sort((a, b) => b.ovr - a.ovr)) if (!rot.order.includes(p.pid)) rot.order.push(p.pid);
  for (const k of Object.keys(rot.minutes)) if (!pids.has(+k)) delete rot.minutes[+k];
  rot.closers = rot.closers.filter((pid) => pids.has(pid));
  rot.restB2B = rot.restB2B.filter((pid) => pids.has(pid));
  for (const k of Object.keys(rot.caps)) if (!pids.has(+k)) delete rot.caps[+k];
  if (rot.set) {
    rot.set = rot.set.filter((pid) => pids.has(pid));
    if (!rot.set.length) delete rot.set;
  }
}

/** Whether a player is out hurt (not cleared for the next game). */
const hurt = (p: Player) => (p.injury?.gamesRemaining ?? 0) > 0;

/**
 * Give `pids` the minutes the staff would give them (between 10 and 30): out of `spare` first (the
 * minutes of players who just left the roster), then from the rest of a manual rotation in
 * proportion to theirs, so the total stays where it was. A target the coach set himself
 * (Rotation.set) gives only what the others can't (they give up to half of theirs): taken from
 * everyone alike (until 2026-11-24), a star set to 36 read 32 after two teammates came back from
 * injuries and 31 by midseason. Returns what is left of `spare`.
 */
export function giveShare(league: League, tid: number, pids: number[], spare = 0): number {
  const team = league.teams[tid];
  const rot = team.rotation;
  const players = teamPlayers(league, tid);
  const staff = autoRotation(
    players.filter((p) => !hurt(p)),
    rot,
  ).minutes;
  const take = (from: [string, number][], amount: number) => {
    const pool = from.reduce((a, [, m]) => a + m, 0);
    if (pool > 0 && amount > 0) for (const [k, m] of from) rot.minutes[+k] = Math.max(0, Math.round(m - (amount * m) / pool));
  };
  for (const pid of pids) {
    const want = clamp(Math.round(staff[pid] ?? 16), 10, 30);
    const free = Math.min(want, Math.max(0, Math.round(spare)));
    spare -= free;
    const need = want - free;
    const others = Object.entries(rot.minutes).filter(([k, m]) => +k !== pid && m > 0);
    const own = others.filter(([k]) => rot.set?.includes(+k));
    const rest = others.filter(([k]) => !rot.set?.includes(+k));
    const fromRest = own.length ? Math.min(need, Math.floor(rest.reduce((a, [, m]) => a + m, 0) / 2)) : need;
    take(rest, fromRest);
    take(own, need - fromRest);
    rot.minutes[pid] = want;
    rot.held = rot.held?.filter((x) => x !== pid);
    rot.benched = rot.benched?.filter((x) => x !== pid);
    rot.set = rot.set?.filter((x) => x !== pid);
    if (rot.set && !rot.set.length) delete rot.set;
  }
  return spare;
}

/** What a rotation's minutes add up to before the plan scales them (rotationPlan.ts). */
const PLAN_TOTAL = 240;
/** Minutes gone from a manual rotation at once that read as a starter's (see ensureRotation). */
const STARTER_GONE = 26;

/**
 * Make a manual rotation whole again: hand out `spare` minutes (by default, what its targets fall
 * short of 240), as a coach would the minutes of players who left. A starter who plays less than a
 * player who left (`vacated`: the departed players' minutes) takes his minutes, the reserve who moved
 * into the first five before anyone, then the bench's regulars play up to 22, then everyone who
 * plays up to 34, then the next in line up to 16, then anyone up to 38.
 * The targets the coach set himself, the players he keeps out and the ones out hurt stay as they are.
 * Before it (2026-11-24) the minutes of a player who left went with him: a tester's rotation added up
 * to 173 after his offseason, and the plan's scaling had his starters at 46 (a probe of the same: 178
 * and 156 after two summers that nobody was re-signed in, 240 both opening nights with it).
 */
export function makeWhole(league: League, tid: number, spare?: number, vacated: number[] = []) {
  const rot = league.teams[tid].rotation;
  const byId = new Map(teamPlayers(league, tid).map((p) => [p.pid, p]));
  const order = rot.order.filter((pid) => byId.has(pid));
  const at = (pid: number) => rot.minutes[pid] ?? 0;
  let left = Math.round(spare ?? PLAN_TOTAL - order.reduce((a, pid) => a + at(pid), 0));
  if (left <= 0) return;
  const skip = new Set([...(rot.set ?? []), ...(rot.benched ?? []), ...(rot.held ?? [])]);
  const fit = order.filter((pid) => !hurt(byId.get(pid)!));
  const open = fit.filter((pid) => !skip.has(pid));
  const give = (pid: number, upTo: number) => {
    const add = Math.min(left, Math.max(0, Math.round(upTo) - at(pid)));
    if (add <= 0) return;
    rot.minutes[pid] = at(pid) + add;
    left -= add;
  };
  const five = fit.slice(0, 5);
  const gone = [...vacated].sort((a, b) => b - a);
  for (const pid of five.filter((x) => open.includes(x)).sort((a, b) => at(a) - at(b))) if (gone.length && at(pid) < gone[0]) give(pid, gone.shift()!);
  for (const pid of open) if (!five.includes(pid) && at(pid) > 0) give(pid, 22);
  for (const pid of open) if (at(pid) > 0) give(pid, 34);
  for (const pid of open) if (!(at(pid) > 0)) give(pid, 16);
  for (const pid of open) give(pid, 38);
}

/**
 * A manual rotation's healthy regulars left at 0 minutes (by OVR, his eight best): a player who came
 * back from an injury, signed, re-signed or traded for and never given any. The coach's own choice to
 * keep one out (`benched`) isn't asked about.
 */
export function noMinutes(league: League, tid = league.userTid): Player[] {
  const rot = league.teams[tid].rotation;
  if (!rot.manual) return [];
  const healthy = teamPlayers(league, tid)
    .filter((p) => !hurt(p))
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 8);
  return healthy.filter((p) => !(rot.minutes[p.pid] > 0) && !rot.benched?.includes(p.pid));
}

/** Keep AI rotations/tactics fresh (injuries, trades) and validate the user's. */
export function ensureRotation(league: League, tid: number) {
  const team = league.teams[tid];
  const players = teamPlayers(league, tid);
  const pids = new Set(players.map((p) => p.pid));
  const rot = team.rotation;
  numberTeam(league, tid, players);
  const stale = rot.order.some((pid) => !pids.has(pid)) || players.some((p) => !rot.order.includes(p.pid));
  const isUser = tid === league.userTid;
  if (!isUser || !rot.manual) {
    const youth = youthMovement(league, tid);
    // (a youth movement also spreads the minutes: nobody past 30, the end of the bench plays)
    team.rotation = autoRotation(players, rot, youth ? { lean: (p) => youth * youthLean(playerAge(p, league.season)), maxMinutes: 38 - 8 * youth } : {});
  } else {
    // a manual rotation: who's new to the roster, and who was out at 0 and is fit again, gets the
    // staff's share of minutes (the coach changes it from there), not a silent 0 (the playtest's trap)
    const arrived = players.filter((p) => !rot.order.includes(p.pid) && !hurt(p) && !(rot.minutes[p.pid] > 0)).map((p) => p.pid);
    // the minutes of the players who left (a trade, a contract's end, a retirement) stay in the rotation: a
    // newcomer's share comes out of them first, and the rest is handed out (makeWhole). A player who
    // leaves takes his line out of the rotation there and then (contracts.ts leaveTeam), so what left is
    // read off the total: what it was when the coach or the staff last left it (Rotation.whole), less
    // what it is now. (A line still here for a player who isn't: the same, never past a whole rotation.)
    const strays = Object.keys(rot.minutes)
      .filter((k) => !pids.has(+k) && rot.minutes[+k] > 0)
      .map((k) => rot.minutes[+k]);
    if (stale || strays.length) keepManualRotation(rot, players);
    const total = () => players.reduce((a, p) => a + (rot.minutes[p.pid] ?? 0), 0);
    const now = total();
    const freed = Math.max(0, Math.max(rot.whole ?? 0, Math.min(PLAN_TOTAL, now + strays.reduce((a, m) => a + m, 0))) - now);
    // (a starter's worth of minutes gone: the reserve who moved into the five takes them first)
    const vacated = strays.length ? strays : freed >= STARTER_GONE ? [Math.min(freed, 38)] : [];
    for (const p of players) if (hurt(p) && !(rot.minutes[p.pid] > 0) && !rot.held?.includes(p.pid)) rot.held = [...(rot.held ?? []), p.pid];
    const back = (rot.held ?? []).filter((pid) => pids.has(pid) && !hurt(league.players[pid]) && !(rot.minutes[pid] > 0));
    rot.held = rot.held?.filter((pid) => pids.has(pid) && !(rot.minutes[pid] > 0) && !back.includes(pid));
    if (!rot.held?.length) delete rot.held;
    rot.benched = rot.benched?.filter((pid) => pids.has(pid) && !(rot.minutes[pid] > 0));
    if (!rot.benched?.length) delete rot.benched;
    // (only the ones good enough for the rotation: a fifteenth man signed for depth stays at 0)
    const top = new Set(
      players
        .filter((p) => !hurt(p))
        .sort((a, b) => b.ovr - a.ovr)
        .slice(0, 9)
        .map((p) => p.pid),
    );
    const due = [...arrived, ...back].filter((pid) => top.has(pid));
    const spare = due.length ? giveShare(league, tid, due, freed) : freed;
    if (spare > 0) makeWhole(league, tid, spare, vacated);
    rot.whole = total();
  }
  const missingRoles = players.some((p) => team.tactics.offense.roles[p.pid] === undefined);
  // an assistant-run playbook follows the healthy roster: a long injury starting or ending can change
  // the best fit (the Tactics screen's fit scores count the same players)
  const refit = (!isUser || !team.tactics.manual) && !stale && !missingRoles && bestPresetsChanged(team, players, isUser, inSeason(league));
  if ((!isUser || !team.tactics.manual) && (stale || missingRoles || refit)) {
    // the user's staff-run playbook also carries the changes the staff measured and made (staffLever.ts)
    if (isUser) applyStaffTactics(league, tid);
    else team.tactics = autoTactics(team, players, false, { sticky: inSeason(league) });
  } else if (missingRoles) {
    // manual tactics: fill roles/freedom for newly acquired players only
    const auto = autoTactics({ ...team, tactics: { ...team.tactics, manual: false } }, players, false);
    for (const p of players) {
      if (team.tactics.offense.roles[p.pid] === undefined) {
        team.tactics.offense.roles[p.pid] = auto.offense.roles[p.pid];
        team.tactics.offense.freedom[p.pid] = auto.offense.freedom[p.pid] ?? 0;
      }
    }
  }
}

/** All-Star Games and the In-Season Cup championship are on a neutral floor. */
export function neutralSite(g: Pick<ScheduledGame, 'type' | 'cup'>) {
  return g.type === 'allstar' || g.cup === 'final';
}

/**
 * A team's side of a game as the engine takes it. `game` picks out the playoff series a series game
 * plan was made for, and with its id and day, the game an AI coach game-plans for against the user.
 */
export function buildSimInput(
  league: League,
  tid: number,
  day: number,
  type: ScheduledGame['type'],
  opp?: number,
  game?: Pick<ScheduledGame, 'seriesId'> & Partial<Pick<ScheduledGame, 'gid' | 'day'>>,
): SimTeamInput {
  // (how tight its core is, as the pulse last read it: the engine turns it into a touch of execution)
  const input = teamSimInput(league, tid, day, type, opp, game);
  // each player's form that day (a stretch above or below himself: legends.ts), and the room at the
  // top of the rare player past the league's best (the engine's FEEL.tails)
  if (input.perf) for (const p of input.players) input.perf[p.pid] = (input.perf[p.pid] ?? 1) * formOf(league, p.pid, day);
  const legend = legendRooms(league, input.players);
  return { ...input, cohesion: cohesionOf(league, tid), ...(legend ? { legend } : {}) };
}

function teamSimInput(
  league: League,
  tid: number,
  day: number,
  type: ScheduledGame['type'],
  opp?: number,
  game?: Pick<ScheduledGame, 'seriesId'> & Partial<Pick<ScheduledGame, 'gid' | 'day'>>,
): SimTeamInput {
  const team = league.teams[tid];
  const players = teamPlayers(league, tid);
  let rest: number[] = [];
  // (the nights off the user set himself are his: the award line below guards a staff's rest only)
  const own = new Set(type === 'regular' && tid === league.userTid ? team.rotation.restB2B : []);
  if (type === 'regular' && playedYesterday(league, tid, day)) {
    for (const pid of team.rotation.restB2B) rest.push(pid);
    // AI load management for older stars
    if (tid !== league.userTid) {
      for (const p of players) {
        if (p.ovr >= 82 && playerAge(p, league.season) >= 33 && !rest.includes(p.pid) && p.wear > 45) rest.push(p.pid);
      }
    }
    // a conference leader well clear rests its best player on the second night (the user's only when his staff runs the rotation)
    if ((tid !== league.userTid || !team.rotation.manual) && clearLeader(league, tid)) {
      const best = players.filter((p) => !p.injury).sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)[0];
      if (best && !rest.includes(best.pid)) rest.push(best.pid);
    }
  }
  if (type === 'regular' && youthMovement(league, tid) >= 1) restVeterans(league, players, day, rest);
  // (the user's stars only when his staff runs the rotation)
  if (type === 'regular' && (tid !== league.userTid || !team.rotation.manual) && seedLocked(league, tid)) restForPlayoffs(players, day, rest);
  // no staff rests a player out of the awards: the nights off stop while his 65 games are at stake
  if (type === 'regular' && rest.length) rest = rest.filter((pid) => own.has(pid) || !awardLineAtStake(league, league.players[pid], tid));
  const perf: Record<number, number> = {};
  for (const p of players) perf[p.pid] = wearPerf(p);
  // practice intensity: intense camps build skills but add wear and injury risk
  const injuryMult = teamInjuryMult(team, injuredCount(league, tid));
  if (tid === league.userTid) {
    // game-time decisions: questionable players the user cleared to play tonight dress, a step slow
    // (the engine raises their injury risk), and an assistant-run rotation plans their minutes as if
    // they were healthy (the staff's left them out); a rotation the user runs keeps his minutes
    const play = game?.gid !== undefined ? clearedToPlay(league, game.gid) : [];
    for (const pid of play) perf[pid] *= GAME_TIME_PERF;
    let rotation = team.rotation;
    if (play.length && !rotation.manual) {
      const ready = players.map((p) => (play.includes(p.pid) ? { ...p, injury: null } : p));
      rotation = autoRotation(ready, team.rotation);
    }
    const extra = play.length ? { play } : {};
    // opponent-specific game plan for the user's team. The assistant adjusts at breaks unless switched off (Tactics: crunch time), whoever runs the tactics, leaving
    // alone the kinds that cost the user's side (ASSISTANT_SKIPS in engine/coach.ts: the team played
    // carries `assistant` to say they're his): about even against no adjustments, +0.05 ± 0.15 points
    // a game over 28,160 paired games with injuries on (2026-10-26; the card says so without a number)
    const adjust = team.tactics.manage.assistantAdjusts !== false;
    const marked = adjust ? { assistant: true as const } : {};
    if (opp !== undefined && planFor(league, opp, game)) {
      const tactics = effectiveTactics(league, opp, game);
      return { team: { ...team, tactics, rotation, ...marked }, players, perf, rest, injuryMult, adjust, ...extra };
    }
    const same = rotation === team.rotation && !adjust;
    return { team: same ? team : { ...team, rotation, ...marked }, players, perf, rest, injuryMult, adjust, ...extra };
  }
  // an AI coach never plays the crunch-time calls a user left on this team
  const t = team.tactics;
  const userPlans = hasCoachPlans(t);
  const tactics = userPlans ? withoutCoachPlans(t) : t;
  // its coach may bring a game plan for tonight, the same way against the user's team as against another AI team
  const plan =
    tid !== league.userTid && opp !== undefined && game?.gid !== undefined && game.day !== undefined ? aiGamePlan(league, tid, opp, { gid: game.gid, day: game.day }) : null;
  if (plan) {
    const planned = withOppPlan(tactics, plan);
    return { team: planTeam(team, planned, plan), players, perf, rest, injuryMult, adjust: true };
  }
  return { team: userPlans ? { ...team, tactics } : team, players, perf, rest, injuryMult, adjust: true };
}

function addTotals(a: TeamTotals, b: TeamTotals) {
  for (const k of Object.keys(a) as (keyof TeamTotals)[]) a[k] += b[k];
}

function recordTeamGame(
  ts: TeamSeason,
  won: boolean,
  home: boolean,
  sameConf: boolean,
  sameDiv: boolean,
  pf: number,
  pa: number,
  poss: number,
  oppPoss: number,
  t: TeamTotals,
  o: TeamTotals,
) {
  if (won) ts.won++;
  else ts.lost++;
  if (home) {
    if (won) ts.homeWon++;
    else ts.homeLost++;
  }
  if (sameConf) {
    if (won) ts.confWon++;
    else ts.confLost++;
  }
  if (sameDiv) {
    if (won) ts.divWon++;
    else ts.divLost++;
  }
  ts.streak = won ? (ts.streak > 0 ? ts.streak + 1 : 1) : ts.streak < 0 ? ts.streak - 1 : -1;
  ts.lastTen.push(won ? 1 : 0);
  if (ts.lastTen.length > 10) ts.lastTen.shift();
  ts.ptsFor += pf;
  ts.ptsAgainst += pa;
  ts.poss += poss;
  ts.oppPoss += oppPoss;
  addTotals(ts.t, t);
  addTotals(ts.o, o);
}

export interface PlayOpts {
  /** Use an already-finished live sim instead of simulating. */
  sim?: GameSim;
  /** With `sim`: the projected home margin it tipped off with (see tipoffEdge). */
  edge?: number;
}

/**
 * The projected home margin of a game about to tip off in `sim` (the preview's projection, from the
 * rotations as the game plans them), to two decimals: what the user's games keep as GameResult.edge,
 * the starting point of their win probability. Reads the league only.
 */
export function tipoffEdge(league: League, g: ScheduledGame, sim: GameSim): number {
  return Math.round(projectGame(league, sim, neutralSite(g)).margin * 100) / 100;
}

export function playGame(league: League, g: ScheduledGame, opts: PlayOpts = {}): GameResult {
  const rng = new Rng(league.rng);
  const userGame = g.home === league.userTid || g.away === league.userTid;
  let sim = opts.sim;
  let edge = opts.edge;
  if (!sim) {
    ensureRotation(league, g.home);
    ensureRotation(league, g.away);
    sim = new GameSim(buildSimInput(league, g.home, g.day, g.type, g.away, g), buildSimInput(league, g.away, g.day, g.type, g.home, g), {
      rng,
      type: g.type,
      keepShots: userGame,
      injuries: league.settings.injuries,
      neutral: neutralSite(g),
    });
    // (read before the game is played: the projection counts the players the plan has on the floor)
    if (userGame) edge = tipoffEdge(league, g, sim);
    sim.simToEnd();
  }
  league.rng = rng.state;
  const res = sim.result(g.gid, league.season, g.day);
  res.seriesId = g.seriesId;
  if (g.cup) res.cup = g.cup;
  if (userGame && edge !== undefined) res.edge = edge;
  applyResult(league, g, sim, res, rng);
  league.rng = rng.state;
  // a recorded game has nothing left to pick up, however it was finished (live, or simmed from the Play menu)
  if (league.live?.gid === g.gid) delete league.live;
  // and its game-time decisions are made
  if (league.gameTime?.gid === g.gid) delete league.gameTime;
  return res;
}

/** Where a team stands in its conference right now. */
function standingLine(league: League, tid: number): StandingLine {
  const row = confStandings(league, league.teams[tid].conf).find((r) => r.tid === tid)!;
  return { rank: row.confRank, gb: row.gb, ...(row.clinched ? { clinched: row.clinched } : {}) };
}

function applyResult(league: League, g: ScheduledGame, sim: GameSim, res: GameResult, rng: Rng) {
  // the user's regular-season games keep where his team stood before and after, for the recap
  // (taken while this game still counts as unplayed: a stored result isn't written again once saved)
  const stakesTid = g.type === 'regular' && (g.home === league.userTid || g.away === league.userTid) ? league.userTid : undefined;
  const before = stakesTid !== undefined ? standingLine(league, stakesTid) : undefined;
  // the game plan's counters it was played with (used up just below), for the report's grade of the plan
  if (g.type !== 'allstar' && (g.home === league.userTid || g.away === league.userTid)) {
    const plan = planFor(league, g.home === league.userTid ? g.away : g.home, g);
    const base = league.teams[league.userTid].tactics;
    res.setup = { playbook: playbookLabel(base), own: !!base.manual, help: base.defense.help };
    if (plan?.items.length) res.plan = plan.items.map((it) => ({ label: it.label, ...planAim(base, it.patch), ...(it.pts !== undefined ? { pts: it.pts } : {}) }));
    // and what its quotes read that the save doesn't keep for good (who got hurt, the winner's low point)
    Object.assign(
      res,
      recapFacts(
        res,
        sim.injuries.filter((i) => i.tid === league.userTid).map((i) => i.pid),
      ),
    );
  }
  g.played = true;
  // a next-game plan is used up once the user plays that opponent, a series plan once its series is decided
  consumePlans(league, g);
  const playoffs = g.type === 'playoffs';
  const home = league.teams[g.home];
  const away = league.teams[g.away];
  const homeWon = res.home.pts > res.away.pts;
  if (g.type !== 'allstar') {
    if (g.type === 'regular') {
      const sameConf = home.conf === away.conf;
      const sameDiv = home.div === away.div;
      recordTeamGame(teamSeason(home, league.season), homeWon, true, sameConf, sameDiv, res.home.pts, res.away.pts, res.home.poss, res.away.poss, res.home.t, res.away.t);
      recordTeamGame(teamSeason(away, league.season), !homeWon, false, sameConf, sameDiv, res.away.pts, res.home.pts, res.away.poss, res.home.poss, res.away.t, res.home.t);
    }
    // player stats (the Cup championship doesn't count in season stats, but it still wears legs)
    for (const rb of sim.rawBoxes()) {
      const p = league.players[rb.pid];
      if (!p) continue;
      if (!rb.played || rb.b.sec <= 0) continue;
      const b = rb.b;
      const tm = league.teams[rb.tid];
      // wear accumulates with minutes (more under an intense practice regime)
      p.wear = clamp(p.wear + (b.sec / 60) * 0.06 * (tm?.practice === 'intense' ? 1.15 : tm?.practice === 'light' ? 0.9 : 1), 0, 100);
      if (g.type === 'cup') continue;
      const s = statsLine(p, league.season, rb.tid, playoffs || g.type === 'playin');
      s.gp++;
      if (rb.starter) s.gs++;
      s.min = Math.round((s.min + b.sec / 60) * 10) / 10;
      s.fgm += b.fgm;
      s.fga += b.fga;
      s.tpm += b.tpm;
      s.tpa += b.tpa;
      s.ftm += b.ftm;
      s.fta += b.fta;
      s.orb += b.orb;
      s.drb += b.drb;
      s.ast += b.ast;
      s.stl += b.stl;
      s.blk += b.blk;
      s.tov += b.tov;
      s.pf += b.pf;
      s.pts += b.pts;
      s.pm += b.pm;
      s.rimM += b.rimM;
      s.rimA += b.rimA;
      s.midM += b.midM;
      s.midA += b.midA;
      s.onPoss += b.onPoss;
      s.onPtsFor += b.onPF;
      s.onPtsAgainst += b.onPA;
      s.teamFga += b.tFga;
      s.teamFta += b.tFta;
      s.teamTov += b.tTov;
    }
    // rested players
    for (const t of [home, away]) {
      const side = t === home ? res.home : res.away;
      for (const bl of side.players) if (bl.dnp === 'Rest') league.players[bl.pid].restedGames++;
    }
    // injuries & healing
    for (const tid of [g.home, g.away]) {
      for (const p of teamPlayers(league, tid)) {
        if (p.injury && !sim.injuries.some((i) => i.pid === p.pid)) healOneGame(league, p, rng);
      }
    }
    for (const inj of sim.injuries) {
      const p = league.players[inj.pid];
      // (a team with MAX_OUT players out already: he got up, see CROWD_OUT; the risk was read before a game that can hurt two)
      if (p && injuredCount(league, p.tid) < MAX_OUT) applyInjury(league, p, rng);
    }
    // worn-down legs: a heavy load can end in a knock after the final buzzer (the engine's
    // in-game risk is per player on the floor, about two checks per offensive possession)
    if (league.settings.injuries) {
      for (const rb of sim.rawBoxes()) {
        const p = league.players[rb.pid];
        const team = league.teams[rb.tid];
        if (!p || !team || p.injury || !rb.played || !wearInjuryRisk(p)) continue;
        if (rng.chance(K.injuryRate * 2 * rb.b.onPoss * teamInjuryMult(team, injuredCount(league, team.tid)) * wearInjuryRisk(p))) applyInjury(league, p, rng);
      }
    }
    // finances & hype: play-in games are postseason gate-only games, like the playoffs; the Cup
    // championship is the league's event on a neutral floor
    const postseason = g.type !== 'regular';
    if (g.type !== 'cup') {
      res.att = gameFinances(league, home, true, postseason, { opp: away, gid: g.gid });
      gameFinances(league, away, false, postseason);
    }
    updateHype(home, homeWon, playoffs);
    updateHype(away, !homeWon, playoffs);
  }
  // storage policy: keep detail only for the user's games; a season of other games keeps only
  // the players who got on the floor (DNP lines were a fifth of the save mid-season)
  const userGame = g.home === league.userTid || g.away === league.userTid;
  if (!userGame) {
    delete res.shots;
    delete res.xShots;
    delete res.impacts;
    delete res.lineups;
    delete res.flow;
    delete res.flowPeriods;
    delete res.flowT;
    delete res.flowPoss;
    delete res.pbp;
    delete res.adjustments;
    for (const side of [res.home, res.away]) side.players = side.players.filter((b) => b.min > 0);
  } else {
    const side = g.home === league.userTid ? 0 : 1;
    // the game plan the other coach brought (kept before the first save: a stored result isn't written again)
    const plan = oppPlanIn(sim, (1 - side) as 0 | 1);
    if (plan) res.oppPlan = plan.items.map((it) => it.text);
    // the lineup screen reads the user's own units, every one of them (the other side's aren't read)
    if (res.lineups) res.lineups = res.lineups.filter((l) => l.t === side);
  }
  league.games.push(res);
  if (stakesTid !== undefined && before) res.stakes = { tid: stakesTid, before, after: standingLine(league, stakesTid) };
  // trim play-by-play from older user games
  if (userGame) {
    const userGames = league.games.filter((x) => x.pbp);
    if (userGames.length > 6) delete userGames[0].pbp;
  }
  notableNews(league, res);
  if (g.type === 'regular') milestoneNews(league, sim);
  // the record book and career highs (results older than last season are pruned, so it's kept now)
  recordNews(league, res, recordGame(league, res));
}

const STAT_NEWS: Record<MilestoneStat, string> = { pts: 'scored his', reb: 'grabbed his', ast: 'handed out his' };

/**
 * Round career marks reached in a regular-season game make the news when they're big (see
 * newsworthy): only players who played, and only careers the game has whole (careerOnRecord).
 */
function milestoneNews(league: League, sim: GameSim) {
  for (const rb of sim.rawBoxes()) {
    if (!rb.played || rb.b.sec <= 0) continue;
    const p = league.players[rb.pid];
    if (!p || !careerOnRecord(league, p)) continue;
    const after = careerTotals(p);
    for (const stat of ['pts', 'reb', 'ast'] as const) {
      const tonight = stat === 'pts' ? rb.b.pts : stat === 'reb' ? rb.b.orb + rb.b.drb : rb.b.ast;
      if (tonight <= 0) continue;
      // (by 500s: the round thousands alone would skip 7,500 and 12,500)
      for (const mark of marksCrossed(after[stat] - tonight, after[stat], 500)) {
        if (!newsworthy(stat, mark)) continue;
        const team = league.teams[rb.tid];
        addNews(league, {
          kind: 'milestone',
          text: `${playerName(p)} of ${teamCity(league, team)} ${STAT_NEWS[stat]} ${markText(stat, mark)}.`,
          tids: [team.tid],
          pids: [p.pid],
        });
      }
    }
  }
}

function notableNews(league: League, res: GameResult) {
  for (const side of [res.home, res.away]) {
    for (const bl of side.players) {
      const p = league.players[bl.pid];
      if (!p) continue;
      const tdbl = [bl.pts, bl.orb + bl.drb, bl.ast, bl.stl, bl.blk].filter((x) => x >= 10).length >= 3;
      if (bl.pts >= 45 || (tdbl && bl.pts >= 20 && (bl.orb + bl.drb >= 12 || bl.ast >= 12))) {
        const team = league.teams[side.tid];
        const opp = league.teams[side === res.home ? res.away.tid : res.home.tid];
        // in words, as a story reads: a triple-double named as one, a scoring night led by its points
        // (two short sentences: who and against whom, then the line)
        const reb = bl.orb + bl.drb;
        const text = tdbl
          ? `${playerName(p)} had a triple-double for ${teamCity(league, team)} against ${teamCity(league, opp)}. ${andList([
              plural(bl.pts, 'point'),
              plural(reb, 'rebound'),
              plural(bl.ast, 'assist'),
              ...(bl.stl >= 10 ? [plural(bl.stl, 'steal')] : []),
              ...(bl.blk >= 10 ? [plural(bl.blk, 'block')] : []),
            ]).replace(/^./, (c) => c.toUpperCase())}.`
          : `${playerName(p)} scored ${bl.pts} for ${teamCity(league, team)} against ${teamCity(league, opp)}. He added ${plural(reb, 'rebound')} and ${plural(bl.ast, 'assist')}.`;
        addNews(league, { kind: 'milestone', text, tids: [team.tid], pids: [p.pid] });
      }
    }
  }
}

export function gamesOnDay(league: League, day: number): ScheduledGame[] {
  return league.schedule.filter((g) => g.day === day && !g.played);
}

export function userGameOnDay(league: League, day: number): ScheduledGame | undefined {
  return league.schedule.find((g) => g.day === day && !g.played && (g.home === league.userTid || g.away === league.userTid));
}
