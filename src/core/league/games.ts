// Running scheduled games and folding results into the league.

import type { GameResult, League, Player, Rotation, ScheduledGame, TeamSeason, TeamTotals } from '../types';
import { GameSim, type SimTeamInput } from '../sim/engine';
import { Rng, clamp } from '../random';
import { autoRotation, autoTactics } from '../ai/coachAI';
import { addInbox, addNews, playerName, statsLine, teamPlayers, teamSeason } from './helpers';
import { applyInjury, healOneGame } from './injuries';
import { gameFinances, updateHype } from './finances';
import { moodPerf } from './morale';
import { playerAge } from '../playerGen';
import { applyPatch } from '../ai/lab';

export function wearPerf(p: Player) {
  return 1 - clamp(p.wear - 40, 0, 60) / 1200; // up to -5% when badly worn down
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

/** Keep AI rotations/tactics fresh (injuries, trades) and validate the user's. */
export function ensureRotation(league: League, tid: number) {
  const team = league.teams[tid];
  const players = teamPlayers(league, tid);
  const pids = new Set(players.map((p) => p.pid));
  const rot = team.rotation;
  const stale = rot.order.some((pid) => !pids.has(pid)) || players.some((p) => !rot.order.includes(p.pid));
  const isUser = tid === league.userTid;
  if (!isUser || !rot.manual) {
    team.rotation = autoRotation(players, rot);
  } else if (stale) {
    // keep the user's order, drop departed players, append new ones at the end
    rot.order = rot.order.filter((pid) => pids.has(pid));
    for (const p of players.sort((a, b) => b.ovr - a.ovr)) if (!rot.order.includes(p.pid)) rot.order.push(p.pid);
    for (const k of Object.keys(rot.minutes)) if (!pids.has(+k)) delete rot.minutes[+k];
    rot.closers = rot.closers.filter((pid) => pids.has(pid));
  }
  if (!isUser || !team.rotation.manual) benchTwoWays(team.rotation, players);
  const missingRoles = players.some((p) => team.tactics.offense.roles[p.pid] === undefined);
  if ((!isUser || !team.tactics.manual) && (stale || missingRoles)) {
    team.tactics = autoTactics(team, players, isUser);
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
export function neutralSite(g: ScheduledGame) {
  return g.type === 'allstar' || g.cup === 'final';
}

export function buildSimInput(league: League, tid: number, day: number, type: ScheduledGame['type'], opp?: number): SimTeamInput {
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
  const perf: Record<number, number> = {};
  for (const p of players) perf[p.pid] = moodPerf(p) * wearPerf(p);
  // practice intensity: intense camps build skills but add wear and injury risk
  const injuryMult = (team.practice === 'intense' ? 1.18 : team.practice === 'light' ? 0.88 : 1) * (1.1 - 0.2 * (team.budget.health / 100));
  // opponent-specific game plan for the user's team
  const plan = league.gamePlan;
  if (tid === league.userTid && plan && opp !== undefined && plan.oppTid === opp && plan.items.length) {
    let t = team.tactics;
    for (const it of plan.items) t = applyPatch(t, it.patch);
    return { team: { ...team, tactics: t }, players, perf, rest, injuryMult };
  }
  return { team, players, perf, rest, injuryMult, adjust: tid !== league.userTid };
}

function addTotals(a: TeamTotals, b: TeamTotals) {
  for (const k of Object.keys(a) as (keyof TeamTotals)[]) a[k] += b[k];
}

function recordTeamGame(ts: TeamSeason, won: boolean, home: boolean, sameConf: boolean, sameDiv: boolean, pf: number, pa: number, poss: number, oppPoss: number, t: TeamTotals, o: TeamTotals) {
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
  record?: boolean;
  /** Use an already-finished live sim instead of simulating. */
  sim?: GameSim;
}

export function playGame(league: League, g: ScheduledGame, opts: PlayOpts = {}): GameResult {
  const rng = new Rng(league.rng);
  const userGame = g.home === league.userTid || g.away === league.userTid;
  let sim = opts.sim;
  if (!sim) {
    ensureRotation(league, g.home);
    ensureRotation(league, g.away);
    sim = new GameSim(buildSimInput(league, g.home, g.day, g.type, g.away), buildSimInput(league, g.away, g.day, g.type, g.home), {
      rng,
      type: g.type,
      record: opts.record ?? false,
      keepShots: userGame,
      injuries: league.settings.injuries,
      neutral: neutralSite(g),
    });
    sim.simToEnd();
  }
  league.rng = rng.state;
  const res = sim.result(g.gid, league.season, g.day);
  res.seriesId = g.seriesId;
  if (g.cup) res.cup = g.cup;
  applyResult(league, g, sim, res, rng);
  league.rng = rng.state;
  return res;
}

function applyResult(league: League, g: ScheduledGame, sim: GameSim, res: GameResult, rng: Rng) {
  g.played = true;
  // a game plan is used up once the user plays that opponent
  if (league.gamePlan && (g.home === league.userTid || g.away === league.userTid) && (g.home === league.gamePlan.oppTid || g.away === league.gamePlan.oppTid)) league.gamePlan = null;
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
      s.min += b.sec / 60;
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
    // finances & hype: play-in games are postseason gate-only games, like the playoffs; the Cup
    // championship is the league's event on a neutral floor
    const postseason = g.type !== 'regular';
    if (g.type !== 'cup') {
      res.att = gameFinances(league, home, true, postseason);
      gameFinances(league, away, false, postseason);
    }
    updateHype(home, homeWon, playoffs);
    updateHype(away, !homeWon, playoffs);
  }
  // storage policy: keep detail only for the user's games
  const userGame = g.home === league.userTid || g.away === league.userTid;
  if (!userGame) {
    delete res.shots;
    delete res.impacts;
    delete res.lineups;
    delete res.flow;
    delete res.pbp;
  }
  league.games.push(res);
  // trim play-by-play from older user games
  if (userGame) {
    const userGames = league.games.filter((x) => x.pbp);
    if (userGames.length > 6) delete userGames[0].pbp;
  }
  notableNews(league, res);
  if (userGame && g.type !== 'allstar') userGameInbox(league, res);
}

function notableNews(league: League, res: GameResult) {
  for (const side of [res.home, res.away]) {
    for (const bl of side.players) {
      const p = league.players[bl.pid];
      if (!p) continue;
      const tdbl = [bl.pts, bl.orb + bl.drb, bl.ast, bl.stl, bl.blk].filter((x) => x >= 10).length >= 3;
      if (bl.pts >= 50 || tdbl && bl.pts >= 20 && (bl.orb + bl.drb >= 12 || bl.ast >= 12) || bl.pts >= 45) {
        const team = league.teams[side.tid];
        const opp = league.teams[side === res.home ? res.away.tid : res.home.tid];
        const line = `${bl.pts} pts, ${bl.orb + bl.drb} reb, ${bl.ast} ast`;
        addNews(league, { kind: 'milestone', text: `${playerName(p)} (${team.abbrev}) put up ${line} vs ${opp.abbrev}.`, tids: [team.tid], pids: [p.pid] });
      }
    }
  }
}

function userGameInbox(league: League, res: GameResult) {
  void res;
  void league;
  // Post-game reports are generated on demand in the UI (analysis/gameReport), so no inbox spam here.
}

export function gamesOnDay(league: League, day: number): ScheduledGame[] {
  return league.schedule.filter((g) => g.day === day && !g.played);
}

export function userGameOnDay(league: League, day: number): ScheduledGame | undefined {
  return league.schedule.find((g) => g.day === day && !g.played && (g.home === league.userTid || g.away === league.userTid));
}

export { addInbox };
