import type { League, Player, PlayerStats, SeasonAwards } from '../types';
import { composites } from '../ratings';
import { playerAge } from '../playerGen';
import { clamp } from '../random';
import { addInbox, addNews, andList, curTeamSeason, playerName, seasonTotals, winPct } from './helpers';

/** Hollinger's game score, for a box line or a season's totals. */
export function gameScore(s: Pick<PlayerStats, 'pts' | 'fgm' | 'fga' | 'ftm' | 'fta' | 'orb' | 'drb' | 'ast' | 'stl' | 'blk' | 'tov' | 'pf'>): number {
  return s.pts + 0.4 * s.fgm - 0.7 * s.fga - 0.4 * (s.fta - s.ftm) + 0.7 * s.orb + 0.3 * s.drb + s.stl + 0.7 * s.ast + 0.7 * s.blk - 0.4 * s.pf - s.tov;
}

export interface Cand {
  p: Player;
  s: PlayerStats;
  gp: number;
  mpg: number;
  gmsc: number;
  winPct: number;
  pmPerGame: number;
}

function candidates(league: League, season = league.season): Cand[] {
  const out: Cand[] = [];
  for (const p of Object.values(league.players)) {
    const s = seasonTotals(p, season, false);
    if (!s || s.gp === 0) continue;
    const tid = s.tid;
    const ts = league.teams[tid]?.seasons.find((x) => x.season === season);
    out.push({ p, s, gp: s.gp, mpg: s.min / s.gp, gmsc: gameScore(s) / s.gp, winPct: ts ? winPct(ts) : 0.5, pmPerGame: s.pm / s.gp });
  }
  return out;
}

/** Games a player needs for the MVP, DPOY and other votes: 65 of 82 (or `games`), pro-rated to the busiest team's games so far. */
export function gamesThreshold(league: League, games = 65) {
  const played = Math.max(...league.teams.map((t) => curTeamSeason(league, t.tid).won + curTeamSeason(league, t.tid).lost));
  return Math.round(played * (games / 82));
}

/**
 * Who can win what. Since 2023-24 the MVP, DPOY, MIP, All-NBA and All-Defense need 65 games and
 * 20 minutes a game; Rookie and Sixth Man of the Year don't, so they ask for a voter's 50 games
 * (Sixth Man for the 20 minutes too), both pro rata during the season. A sixth man came off the
 * bench in more games than he started.
 */
function awardPools(league: League, season = league.season) {
  const minG = gamesThreshold(league);
  // (pro-rated too: a flat 50 late in the season left rookies on pace for it off the ladder)
  const minRegular = gamesThreshold(league, 50);
  const all = candidates(league, season);
  const regular = (c: Cand) => c.gp >= minRegular;
  return {
    eligible: all.filter((c) => c.gp >= minG && c.mpg >= 20),
    rookies: all.filter((c) => c.p.draft.year === season - 1 && regular(c)),
    bench: all.filter((c) => c.s.gs < c.gp - c.s.gs && regular(c) && c.mpg >= 20),
  };
}

/**
 * MVP: production first, then winning and on-court impact (teammates share those, so they can't
 * carry a sidekick). Voters want a contender: a 62-win team's star is worth about four points of
 * game score more than a .500 team's, and under 49 wins (.600) each win costs twice as much. At a
 * third of that, a sixth or eighth seed's scorer won it one season in three, and the average MVP's
 * team won 53; now it's 55-57 and a top-two seed, as in the NBA.
 */
export function mvpScore(c: Cand) {
  return c.gmsc * Math.pow(Math.min(1, c.gp / 70), 0.3) + c.winPct * 16 + 20 * Math.min(0, c.winPct - 0.6) + c.pmPerGame * 0.15;
}

/**
 * Defensive Player of the Year: defensive quality, rim protection and event production
 * (capped, so a gambler's steals or a backup's blocks can't carry it), how good his team's
 * defense was (within six points of the league's either way) and how much it held up with him on
 * the floor, and a real workload. Voters look past a team's go-to scorer: past 20 points a game
 * each point counts against him, or the best team's 30-point star took it most years (and the MVP
 * with it one season in six, which the NBA has seen twice).
 */
export function dpoyScore(c: Cand, ctx: DefContext = { lgDRtg: 0, teamDRtg: new Map() }) {
  const cm = composites(c.p.ratings);
  const per = (x: number) => x / c.gp;
  const dRat = 0.25 * cm.perDef + 0.25 * cm.intDef + 0.3 * cm.rimProt + 0.2 * c.p.ratings.diq;
  // without league context (live ladders) the team terms drop out
  const teamD = ctx.lgDRtg > 0 ? (ctx.teamDRtg.get(c.s.tid) ?? ctx.lgDRtg) : 0;
  // on/off: points allowed per 100 with him on the floor vs his team's season
  const onD = ctx.lgDRtg > 0 && c.s.onPoss >= 400 ? (c.s.onPtsAgainst / c.s.onPoss) * 100 : teamD;
  return (
    dRat / 4 +
    1.2 * Math.min(per(c.s.blk), 3.5) +
    0.6 * Math.min(per(c.s.stl), 2.5) +
    0.1 * per(c.s.drb) +
    0.35 * clamp(ctx.lgDRtg - teamD, -6, 6) +
    0.2 * clamp(teamD - onD, -6, 6) +
    0.15 * (Math.min(c.mpg, 36) - 30) -
    0.15 * Math.max(0, per(c.s.pts) - 20)
  );
}

export interface DefContext {
  lgDRtg: number;
  /** Points allowed per 100 possessions by team id. */
  teamDRtg: Map<number, number>;
}

export function defContext(league: League, season = league.season): DefContext {
  const teamDRtg = new Map<number, number>();
  let pa = 0;
  let poss = 0;
  for (const t of league.teams) {
    const ts = t.seasons.find((x) => x.season === season);
    if (!ts || ts.oppPoss <= 0) continue;
    teamDRtg.set(t.tid, (ts.ptsAgainst / ts.oppPoss) * 100);
    pa += ts.ptsAgainst;
    poss += ts.oppPoss;
  }
  return { lgDRtg: poss ? (pa / poss) * 100 : 0, teamDRtg };
}

export const royScore = (c: Cand) => c.gmsc * Math.pow(Math.min(1, c.gp / 70), 0.5) + c.mpg * 0.05;
export const smoyScore = (c: Cand) => c.gmsc + c.pmPerGame * 0.2;

/** This season's award races so far, each with the award's own eligibility, best first. */
export function awardRaces(league: League, n = 5) {
  const { eligible, rookies, bench } = awardPools(league);
  const dctx = defContext(league, league.season);
  const rank = (arr: Cand[], f: (c: Cand) => number) =>
    arr
      .map((c) => ({ c, score: f(c) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  return { mvp: rank(eligible, mvpScore), dpoy: rank(eligible, (c) => dpoyScore(c, dctx)), roy: rank(rookies, royScore), smoy: rank(bench, smoyScore) };
}

/** Top of the MVP / DPOY ladders with the award's own eligibility and context. */
export function awardLadder(league: League, award: 'mvp' | 'dpoy', n = 5): { pid: number; score: number }[] {
  return awardRaces(league, n)[award].map(({ c, score }) => ({ pid: c.p.pid, score }));
}

export function computeRegularSeasonAwards(league: League): SeasonAwards {
  const season = league.season;
  const { eligible, rookies, bench } = awardPools(league, season);
  const rank = <T>(arr: T[], f: (x: T) => number) => [...arr].sort((a, b) => f(b) - f(a));
  const mvp = rank(eligible, mvpScore);
  const dctx = defContext(league, season);
  const dpoy = rank(eligible, (c) => dpoyScore(c, dctx));
  const roy = rank(rookies, royScore);
  const smoy = rank(bench, smoyScore);
  // Most Improved needs a season to improve on (none in a fictional league's first season)
  const before = new Map<Cand, number>();
  for (const c of eligible) {
    const prev = seasonTotals(c.p, season - 1, false);
    // a real role last season (12 minutes a game) to improve on, and a real one now: a bench
    // player handed minutes isn't a breakout (by game score alone, players who went from 2 points a
    // game in 3 minutes to 10 won it most years)
    if (c.p.draft.year === season - 1 || !prev || prev.gp < 20 || prev.min / prev.gp < 12 || c.gmsc < 10) continue;
    const g = gameScore(prev) / prev.gp;
    // voters reward a breakout, not an established star bouncing back
    if (g < 15) before.set(c, g);
  }
  // the jump, how good he became (winners score 17-26 a game), and youth: a veteran's career year rarely wins it
  const mip = rank([...before.keys()], (c) => c.gmsc - before.get(c)! + 0.25 * c.gmsc - 0.4 * Math.max(0, playerAge(c.p, season) - 26));
  const coy = [...league.teams].sort((a, b) => {
    const imp = (tid: number) => {
      const t = league.teams[tid];
      const cur = winPct(curTeamSeason(league, tid));
      const prev = t.seasons.find((s) => s.season === season - 1);
      return cur * 0.6 + (prev ? cur - winPct(prev) : 0);
    };
    return imp(b.tid) - imp(a.tid);
  })[0];
  const allNba = [mvp.slice(0, 5), mvp.slice(5, 10), mvp.slice(10, 15)].map((t) => t.map((c) => c.p.pid));
  const allDef = [dpoy.slice(0, 5), dpoy.slice(5, 10)].map((t) => t.map((c) => c.p.pid));
  // 1st team then 2nd team, flat: the first five are the 1st team
  const allRookie = roy.slice(0, 10).map((c) => c.p.pid);
  const existing = league.awards.find((a) => a.season === season);
  const awards: SeasonAwards = {
    ...(existing ?? { allStars: { E: [], W: [] } }),
    season,
    mvp: mvp[0]?.p.pid,
    dpoy: dpoy[0]?.p.pid,
    roy: roy[0]?.p.pid,
    smoy: smoy[0]?.p.pid,
    mip: mip[0]?.p.pid,
    coy: coy?.tid,
    coyCoach: coy ? (coy.tid === league.userTid ? league.coachName : coy.coach.name) : undefined,
    allNba,
    allDefense: allDef,
    allRookie,
  };
  league.awards = league.awards.filter((a) => a.season !== season);
  league.awards.push(awards);
  const won = new Map<number, string[]>();
  const give = (pid: number | undefined, type: string) => {
    if (pid === undefined) return;
    league.players[pid].awards.push({ season, type });
    won.set(pid, [...(won.get(pid) ?? []), type]);
  };
  give(awards.mvp, 'MVP');
  give(awards.dpoy, 'Defensive Player of the Year');
  give(awards.roy, 'Rookie of the Year');
  give(awards.smoy, 'Sixth Man of the Year');
  give(awards.mip, 'Most Improved Player');
  allNba.forEach((team, i) => team.forEach((pid) => give(pid, `All-NBA ${['1st', '2nd', '3rd'][i]} Team`)));
  allDef.forEach((team, i) => team.forEach((pid) => give(pid, `All-Defensive ${['1st', '2nd'][i]} Team`)));
  allRookie.forEach((pid, i) => give(pid, `All-Rookie ${i < 5 ? '1st' : '2nd'} Team`));
  const nm = (pid?: number) => (pid !== undefined ? playerName(league.players[pid]) : '—');
  addNews(league, {
    kind: 'award',
    text: `Awards: MVP ${nm(awards.mvp)} · DPOY ${nm(awards.dpoy)} · ROY ${nm(awards.roy)} · 6MOY ${nm(awards.smoy)} · MIP ${nm(awards.mip)} · COY ${coy ? `${awards.coyCoach} (${coy.abbrev})` : '—'}.`,
    tids: coy ? [coy.tid] : [],
    pids: [awards.mvp, awards.dpoy, awards.roy, awards.smoy, awards.mip].filter((x): x is number => x !== undefined),
  });
  // "Name (MVP, All-NBA 1st Team)" for each of the user's winners
  const mine = [...won].filter(([pid]) => league.players[pid].tid === league.userTid).map(([pid, types]) => `${playerName(league.players[pid])} (${types.join(', ')})`);
  if (coy?.tid === league.userTid) mine.push('Coach of the Year (you)');
  if (mine.length) {
    addInbox(league, {
      from: 'League Office',
      subject: 'Season awards',
      body: `Your team collected hardware: ${andList(mine)}.`,
      tone: 'good',
      link: '/league/awards',
    });
  }
  return awards;
}

/** A knock this short heals over the All-Star break: the player keeps his place and plays. */
const ALL_STAR_KNOCK_GAMES = 2;

/** Hurt worse than a knock the break heals: an All-Star who sits the game out and is replaced. */
export const missesAllStarGame = (p: Player) => (p.injury?.gamesRemaining ?? 0) > ALL_STAR_KNOCK_GAMES;

/** The reserves are named about two and a half weeks before the game: some seven games. */
const ALL_STAR_VOTE_GAMES = 7;

/** Already out when the coaches voted and not back for the game: they pass him over (one hurt since is picked, then replaced). */
const outAtTheVote = (p: Player) => missesAllStarGame(p) && p.injury!.gamesTotal - p.injury!.gamesRemaining >= ALL_STAR_VOTE_GAMES;

export function selectAllStars(league: League): SeasonAwards['allStars'] {
  const all = candidates(league).filter((c) => c.gp >= 15 && c.p.tid >= 0 && !outAtTheVote(c.p));
  const out: SeasonAwards['allStars'] = { E: [], W: [] };
  const replacements: { text: string; pid: number }[] = [];
  for (const conf of ['E', 'W'] as const) {
    const pool = all.filter((c) => league.teams[c.p.tid]?.conf === conf);
    const ranked = [...pool].sort((a, b) => b.gmsc + b.winPct * 6 + b.p.ovr * 0.1 - (a.gmsc + a.winPct * 6 + a.p.ovr * 0.1));
    // the NBA's format: two guards and three frontcourt players start, and the reserves are two
    // more guards, three more frontcourt players and two wild cards
    const chosen = new Set<Cand>();
    const take = (n: number, fits: (c: Cand) => boolean) => {
      for (const c of ranked) {
        if (n === 0 || chosen.size === 12) return;
        if (chosen.has(c) || !fits(c)) continue;
        chosen.add(c);
        n--;
      }
    };
    const guard = (c: Cand) => c.p.pos === 'PG' || c.p.pos === 'SG';
    take(4, guard);
    take(6, (c) => !guard(c));
    take(12, () => true);
    const picks = ranked.filter((c) => chosen.has(c));
    // those hurt since the vote keep the honor; the next healthy players in the conference take their spots
    const hurt = picks.filter((c) => missesAllStarGame(c.p));
    const subs = ranked.filter((c) => !chosen.has(c) && !missesAllStarGame(c.p)).slice(0, hurt.length);
    subs.forEach((c, i) => replacements.push({ text: `${playerName(c.p)} replaces the injured ${playerName(hurt[i].p)}`, pid: c.p.pid }));
    out[conf] = [...picks, ...subs].map((c) => c.p.pid);
  }
  let aw = league.awards.find((a) => a.season === league.season);
  if (!aw) {
    aw = { season: league.season, allNba: [], allDefense: [], allRookie: [], allStars: out };
    league.awards.push(aw);
  } else aw.allStars = out;
  for (const pid of [...out.E, ...out.W]) league.players[pid].awards.push({ season: league.season, type: 'All-Star' });
  const mine = [...out.E, ...out.W].filter((pid) => league.players[pid].tid === league.userTid);
  // the first five of each conference by name, the rest counted
  const named = (pids: number[]) => {
    const names = pids.slice(0, 5).map((pid) => league.players[pid].lastName);
    return pids.length > 5 ? `${names.join(', ')} and ${pids.length - 5} more` : andList(names);
  };
  addNews(league, {
    kind: 'award',
    text: `All-Stars announced. East: ${named(out.E)}. West: ${named(out.W)}.`,
    tids: [],
    pids: [...out.E, ...out.W],
  });
  if (replacements.length)
    addNews(league, { kind: 'award', text: `All-Star replacements: ${replacements.map((r) => r.text).join('; ')}.`, tids: [], pids: replacements.map((r) => r.pid) });
  if (mine.length) {
    addInbox(league, {
      from: 'League Office',
      subject: 'All-Star selections',
      body: `${andList(mine.map((pid) => playerName(league.players[pid])))} made the All-Star team.`,
      tone: 'good',
      link: '/league/awards',
    });
  }
  return out;
}

export function finalsMvp(league: League, champTid: number): number | undefined {
  let best: number | undefined;
  let bs = -Infinity;
  const finals = league.games.filter((g) => g.season === league.season && g.type === 'playoffs' && g.seriesId === 'F4-0');
  const totals = new Map<number, number>();
  for (const g of finals) {
    const side = g.home.tid === champTid ? g.home : g.away.tid === champTid ? g.away : null;
    if (!side) continue;
    for (const bl of side.players) totals.set(bl.pid, (totals.get(bl.pid) ?? 0) + gameScore(bl));
  }
  for (const [pid, v] of totals) {
    if (v > bs) {
      bs = v;
      best = pid;
    }
  }
  return best;
}
