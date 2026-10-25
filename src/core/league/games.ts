// Running scheduled games and folding results into the league.

import type { GameResult, League, Player, Rotation, ScheduledGame, StandingLine, Team, TeamSeason, TeamTotals } from '../types';
import { GameSim, K, type SimTeamInput } from '../sim/engine';
import { Rng, clamp } from '../random';
import { autoRotation, autoTactics, rankedPresets } from '../ai/coachAI';
import { addInbox, addNews, andList, inSeason, playerName, statsLine, teamName, teamPlayers, teamSeason } from './helpers';
import { applyInjury, clearedToPlay, GAME_TIME_PERF, healOneGame } from './injuries';
import { gameFinances, updateHype } from './finances';
import { playerAge } from '../playerGen';
import { consumePlans, effectiveTactics, planFor } from './gamePlans';
import { confStandings } from './standings';
import { hasCoachPlans, withoutCoachPlans } from '../sim/tactics';
import { aiGamePlan, oppPlanIn, planTeam, withOppPlan } from '../ai/opponentPlan';
import { staffLeverChanges, staffTactics } from '../ai/advisor';
import { leadAssistant } from '../ai/assistant';
import { projectGame } from '../analysis/projection';
import { careerOnRecord, careerTotals, marksCrossed, markText, newsworthy, type MilestoneStat } from '../analysis/milestones';
import { learnFromGame } from './practice';
import { prepared } from '../sim/familiarity';
import { withSlotPlans } from '../sim/slots';
import { gameKeys, gradeKey } from '../analysis/keys';
import { planAim } from '../analysis/moves';
import { recapFacts } from '../analysis/quotes';
import { recordGame, recordNews } from './records';
import { numberTeam } from './jerseys';
import { plural } from '../format';
import { courtEdge } from './difficulty';

export function wearPerf(p: Player) {
  return 1 - clamp(p.wear - 40, 0, 60) / 1200; // up to -5% when badly worn down
}

/** Extra injury risk from worn-down legs, on top of the engine's in-game risk: up to +60% at full wear. */
export function wearInjuryRisk(p: Player) {
  return (clamp(p.wear - 40, 0, 60) / 60) * 0.6;
}

/** Practice intensity and the medical budget scale a team's injury risk. */
export function teamInjuryMult(team: Team) {
  return (team.practice === 'intense' ? 1.18 : team.practice === 'light' ? 0.88 : 1) * (1.1 - 0.2 * (team.budget.health / 100));
}

function playedYesterday(league: League, tid: number, day: number): boolean {
  return league.schedule.some((g) => g.day === day - 1 && (g.home === tid || g.away === tid));
}

/**
 * Two-way players are deep bench: last in the order with no planned minutes (their share goes to
 * the standard players), unless the team is down to fewer than nine healthy standard players.
 */
function benchTwoWays(rot: Rotation, players: Player[]) {
  const twoWay = new Set(players.filter((p) => p.contract.twoWay).map((p) => p.pid));
  if (!twoWay.size || players.filter((p) => !p.contract.twoWay && !p.injury).length < 9) return;
  rot.order = [...rot.order.filter((pid) => !twoWay.has(pid)), ...rot.order.filter((pid) => twoWay.has(pid))];
  let freed = [...twoWay].reduce((a, pid) => a + (rot.minutes[pid] ?? 0), 0);
  for (const pid of twoWay) rot.minutes[pid] = 0;
  // hand the freed minutes to the lightest-used rotation players first, never past 38
  const kept = rot.order.filter((pid) => !twoWay.has(pid) && (rot.minutes[pid] ?? 0) > 0);
  while (freed > 0) {
    const next = kept.filter((pid) => (rot.minutes[pid] ?? 0) < 38).sort((a, b) => (rot.minutes[a] ?? 0) - (rot.minutes[b] ?? 0))[0];
    if (next === undefined) break;
    rot.minutes[next] = (rot.minutes[next] ?? 0) + 1;
    freed--;
  }
  rot.closers = rot.closers.filter((pid) => !twoWay.has(pid));
}

function bestPresetsChanged(team: Team, players: Player[]): boolean {
  const best = rankedPresets(team, players);
  return best.off[0] !== team.tactics.offPreset || best.def[0] !== team.tactics.defPreset;
}

/**
 * The playbook the staff runs for the user (staffTactics: the roster's best fit, with its changes from
 * this season's evidence), put in place, with a word from the lead assistant for each setting the
 * evidence moved it off.
 */
export function applyStaffTactics(league: League, tid: number) {
  const team = league.teams[tid];
  const next = staffTactics(league, tid);
  const lead = leadAssistant(league);
  for (const c of staffLeverChanges(league, tid, team.tactics, next))
    addInbox(league, {
      from: `${lead.name}, lead assistant`,
      subject: `Staff change: ${c.label}`,
      body: `Our ${c.what} has given up ${c.lost.toFixed(1)} points a game and won ${c.won.toFixed(1)} back over ${plural(c.games, 'game')}, so I've changed it. Team → Tactics has it; set the tactics yourself to take it back.`,
      link: '/team/tactics',
    });
  team.tactics = next;
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
    memo = { key, youth: youthLevels(league, start), locked: lockedSeeds(league, start) };
    dayMemo.set(league, memo);
  }
  return memo;
}

const dayMemo = new WeakMap<League, { key: string; youth: Map<number, number>; locked: Set<number> }>();

/** The day of the season a rebuilding team at the bottom of its conference starts to play its young players (about 20 games in). */
const YOUTH_FROM = 40;

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
        if (t.strategy === 'rebuild' && i >= rows.length - 4) out.set(t.tid, 1);
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
 * 28-and-ups and its two best players 24 or older every third (load management, a sore knee).
 */
export function restVeterans(league: League, players: Player[], day: number, rest: number[]) {
  const best = players
    .filter((p) => playerAge(p, league.season) >= 24 && !p.contract.twoWay)
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
    .slice(0, 2);
  for (const p of players) {
    const age = playerAge(p, league.season);
    if (rest.includes(p.pid) || (age < 28 && !best.includes(p))) continue;
    if ((p.pid + day) % (age >= 30 ? 2 : 3) === 0) rest.push(p.pid);
  }
}

/**
 * A team that has locked up its conference's top seed saves its stars for the playoffs, as NBA
 * coaches do once the seeding can't change: its three best players each sit every other night
 * (staggered, so most nights two of them dress). Without it a deep young core kept together ran
 * past anything the league has seen: with the Thunder run by the staff, 8 of 48 seasons over 73
 * wins (77-5 three years running in one league); 1 of 48 with it.
 */
export function restForPlayoffs(players: Player[], day: number, rest: number[]) {
  const best = players
    .filter((p) => !p.contract.twoWay && !p.injury)
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
    if (league.news.some((n) => n.season === league.season && n.kind === 'general' && n.tids[0] === t.tid && n.text.includes(YOUTH_NEWS))) continue;
    const young = teamPlayers(league, t.tid)
      .filter((p) => playerAge(p, league.season) <= 23)
      .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
      .slice(0, 2);
    addNews(league, {
      kind: 'general',
      text: `The ${teamName(t)} ${YOUTH_NEWS}${young.length ? `: more minutes for ${andList(young.map(playerName))}` : ''}, and their veterans will sit some nights.`,
      tids: [t.tid],
      pids: young.map((p) => p.pid),
    });
  }
}

const YOUTH_NEWS = 'turn to their young players';

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
  } else if (stale) {
    // keep the user's order, drop departed players, append new ones at the end
    rot.order = rot.order.filter((pid) => pids.has(pid));
    for (const p of players.sort((a, b) => b.ovr - a.ovr)) if (!rot.order.includes(p.pid)) rot.order.push(p.pid);
    for (const k of Object.keys(rot.minutes)) if (!pids.has(+k)) delete rot.minutes[+k];
    rot.closers = rot.closers.filter((pid) => pids.has(pid));
    rot.restB2B = rot.restB2B.filter((pid) => pids.has(pid));
    for (const k of Object.keys(rot.caps)) if (!pids.has(+k)) delete rot.caps[+k];
  }
  // (a youth movement plays its two-way prospects too)
  if ((!isUser || !team.rotation.manual) && youthMovement(league, tid) < 1) benchTwoWays(team.rotation, players);
  const missingRoles = players.some((p) => team.tactics.offense.roles[p.pid] === undefined);
  // an assistant-run playbook follows the healthy roster: a long injury starting or ending can change
  // the best fit (the Tactics screen's fit scores count the same players)
  const refit = (!isUser || !team.tactics.manual) && !stale && !missingRoles && bestPresetsChanged(team, players);
  if ((!isUser || !team.tactics.manual) && (stale || missingRoles || refit)) {
    // the user's staff-run playbook also carries the staff's changes from this season's evidence
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

/** All-Star Games and the NBA Cup championship are on a neutral floor. */
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
  const team = league.teams[tid];
  const players = teamPlayers(league, tid);
  const rest: number[] = [];
  if (type === 'regular' && playedYesterday(league, tid, day)) {
    for (const pid of team.rotation.restB2B) rest.push(pid);
    // AI load management for older stars
    if (tid !== league.userTid) {
      for (const p of players) {
        if (p.ovr >= 82 && playerAge(p, league.season) >= 33 && !rest.includes(p.pid) && p.wear > 45) rest.push(p.pid);
      }
    }
  }
  if (type === 'regular' && youthMovement(league, tid) >= 1) restVeterans(league, players, day, rest);
  // (the user's stars only when his staff runs the rotation)
  if (type === 'regular' && (tid !== league.userTid || !team.rotation.manual) && seedLocked(league, tid)) restForPlayoffs(players, day, rest);
  const perf: Record<number, number> = {};
  for (const p of players) perf[p.pid] = wearPerf(p);
  // practice intensity: intense camps build skills but add wear and injury risk
  const injuryMult = teamInjuryMult(team);
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
      benchTwoWays(rotation, ready);
    }
    const extra = play.length ? { play } : {};
    // opponent-specific game plan for the user's team (drilled for tonight after a day of opponent
    // prep); situational plans that switch to another tactic slot carry its changes. The assistant
    // adjusts at breaks unless switched off (Tactics: crunch time), whoever runs the tactics, leaving
    // alone the kinds that cost the user's side (ASSISTANT_SKIPS in engine/coach.ts: the team played
    // carries `assistant` to say they're his): measured over 17,280 paired games, +0.47 ± 0.09 points
    // a game against no adjustments (with every kind, as AI coaches make them: +0.31 ± 0.09)
    const adjust = team.tactics.manage.assistantAdjusts !== false;
    const marked = adjust ? { assistant: true as const } : {};
    if (opp !== undefined && planFor(league, opp, game)) {
      const tactics = withSlotPlans(team, effectiveTactics(league, opp, game));
      const fam = team.prep === 'opponent' && team.fam ? { fam: prepared(team.fam, team.tactics, tactics) } : {};
      return { team: { ...team, tactics, rotation, ...marked }, players, perf, rest, injuryMult, adjust, ...extra, ...fam };
    }
    const tactics = withSlotPlans(team, team.tactics);
    const same = rotation === team.rotation && tactics === team.tactics && !adjust;
    return { team: same ? team : { ...team, tactics, rotation, ...marked }, players, perf, rest, injuryMult, adjust, ...extra };
  }
  // an AI coach never plays the situational plans or crunch-time calls a user left on this team
  const t = team.tactics;
  const userPlans = hasCoachPlans(t);
  const tactics = userPlans ? withoutCoachPlans(t) : t;
  // against the user's team its coach may bring a game plan for tonight (never in a game between AI teams)
  const plan = opp === league.userTid && game?.gid !== undefined && game.day !== undefined ? aiGamePlan(league, tid, opp, { gid: game.gid, day: game.day }) : null;
  // (a coach who comes in with a plan has drilled it)
  if (plan) {
    const planned = withOppPlan(tactics, plan);
    return { team: planTeam(team, planned, plan), players, perf, rest, injuryMult, adjust: true, ...(team.fam && { fam: prepared(team.fam, tactics, planned) }) };
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
      edge: courtEdge(league, g.home, g.away),
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
  // and how the keys to the game went (set from the games before tonight, as the preview showed them)
  if (g.type !== 'allstar' && (g.home === league.userTid || g.away === league.userTid)) {
    const keys = gameKeys(league, g);
    if (keys.length) res.keys = keys.map((k) => gradeKey(k, res, g.home === league.userTid ? 0 : 1));
    // and the game plan's counters it was played with (used up just below), for the report's grade of the plan
    const plan = planFor(league, g.home === league.userTid ? g.away : g.home, g);
    const base = league.teams[league.userTid].tactics;
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
  // both teams learn from the tactics they played (an All-Star game teaches nobody anything)
  if (g.type !== 'allstar') learnFromGame(league, sim);
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
      if (p) applyInjury(league, p, rng);
    }
    // worn-down legs: a heavy load can end in a knock after the final buzzer (the engine's
    // in-game risk is per player on the floor, about two checks per offensive possession)
    if (league.settings.injuries) {
      for (const rb of sim.rawBoxes()) {
        const p = league.players[rb.pid];
        const team = league.teams[rb.tid];
        if (!p || !team || p.injury || !rb.played || !wearInjuryRisk(p)) continue;
        if (rng.chance(K.injuryRate * 2 * rb.b.onPoss * teamInjuryMult(team) * wearInjuryRisk(p))) applyInjury(league, p, rng);
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
          text: `${playerName(p)} (${team.abbrev}) ${STAT_NEWS[stat]} ${markText(stat, mark)}.`,
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
        const reb = bl.orb + bl.drb;
        const text = tdbl
          ? `${playerName(p)} (${team.abbrev}) had a triple-double vs ${opp.abbrev}: ${[
              `${bl.pts} points`,
              `${reb} rebounds`,
              `${bl.ast} assists`,
              ...(bl.stl >= 10 ? [`${bl.stl} steals`] : []),
              ...(bl.blk >= 10 ? [`${bl.blk} blocks`] : []),
            ].join(', ')}.`
          : `${playerName(p)} (${team.abbrev}) scored ${bl.pts} vs ${opp.abbrev}, with ${plural(reb, 'rebound')} and ${plural(bl.ast, 'assist')}.`;
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
