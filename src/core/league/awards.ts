import type { League, Player, PlayerStats, SeasonAwards } from '../types';
import { composites } from '../ratings';
import { clamp } from '../random';
import { addInbox, addNews, curTeamSeason, playerName, seasonTotals, teamName, winPct } from './helpers';

export function gameScore(s: PlayerStats): number {
  return s.pts + 0.4 * s.fgm - 0.7 * s.fga - 0.4 * (s.fta - s.ftm) + 0.7 * s.orb + 0.3 * s.drb + s.stl + 0.7 * s.ast + 0.7 * s.blk - 0.4 * s.pf - s.tov;
}

interface Cand {
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

function gamesThreshold(league: League) {
  const played = Math.max(...league.teams.map((t) => curTeamSeason(league, t.tid).won + curTeamSeason(league, t.tid).lost));
  return Math.round(played * (65 / 82));
}

/** MVP: production first; winning and on-court impact break ties (teammates share those, so they can't carry a sidekick). */
export function mvpScore(c: Cand) {
  return c.gmsc * Math.pow(Math.min(1, c.gp / 70), 0.3) + c.winPct * 8 + c.pmPerGame * 0.15;
}

/**
 * Defensive Player of the Year: defensive quality, rim protection and event production
 * (capped, so a gambler's steals or a backup's blocks can't carry it), how good his team's
 * defense was and how much it held up with him on the floor, and a real workload.
 */
export function dpoyScore(c: Cand, ctx: DefContext = { lgDRtg: 0, teamDRtg: new Map() }) {
  const cm = composites(c.p.ratings);
  const per = (x: number) => x / c.gp;
  const dRat = 0.25 * cm.perDef + 0.25 * cm.intDef + 0.3 * cm.rimProt + 0.2 * c.p.ratings.diq;
  // without league context (live ladders) the team terms drop out
  const teamD = ctx.lgDRtg > 0 ? ctx.teamDRtg.get(c.s.tid) ?? ctx.lgDRtg : 0;
  // on/off: points allowed per 100 with him on the floor vs his team's season
  const onD = ctx.lgDRtg > 0 && c.s.onPoss >= 400 ? (c.s.onPtsAgainst / c.s.onPoss) * 100 : teamD;
  return (
    dRat / 4 +
    1.2 * Math.min(per(c.s.blk), 3.5) +
    0.6 * Math.min(per(c.s.stl), 2.5) +
    0.1 * per(c.s.drb) +
    0.5 * (ctx.lgDRtg - teamD) +
    0.2 * clamp(teamD - onD, -6, 6) +
    0.15 * (Math.min(c.mpg, 36) - 30)
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

/** Top of the MVP / DPOY ladders with the award's own eligibility and context. */
export function awardLadder(league: League, award: 'mvp' | 'dpoy', n = 5): { pid: number; score: number }[] {
  const minG = gamesThreshold(league);
  const eligible = candidates(league).filter((c) => c.gp >= minG && c.mpg >= 20);
  const dctx = defContext(league, league.season);
  const f = award === 'mvp' ? mvpScore : (c: Cand) => dpoyScore(c, dctx);
  return eligible
    .map((c) => ({ pid: c.p.pid, score: f(c) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

export function computeRegularSeasonAwards(league: League): SeasonAwards {
  const season = league.season;
  const minG = gamesThreshold(league);
  const all = candidates(league);
  const eligible = all.filter((c) => c.gp >= minG && c.mpg >= 20);
  const rank = <T>(arr: T[], f: (x: T) => number) => [...arr].sort((a, b) => f(b) - f(a));
  const mvp = rank(eligible, mvpScore);
  const dctx = defContext(league, season);
  const dpoy = rank(eligible, (c) => dpoyScore(c, dctx));
  const rookies = all.filter((c) => c.p.draft.year === season - 1 && c.gp >= Math.min(minG, 50));
  const roy = rank(rookies, (c) => c.gmsc * Math.pow(Math.min(1, c.gp / 70), 0.5) + c.mpg * 0.05);
  const bench = eligible.filter((c) => c.s.gs <= c.gp / 2);
  const smoy = rank(bench, (c) => c.gmsc + c.pmPerGame * 0.2);
  const mip = rank(eligible.filter((c) => c.p.draft.year !== season - 1), (c) => {
    const prev = seasonTotals(c.p, season - 1, false);
    if (!prev || prev.gp < 20) return -99;
    const before = gameScore(prev) / prev.gp;
    // voters reward a breakout, not an established star bouncing back
    if (before >= 15) return -99;
    return c.gmsc - before;
  });
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
  const allRookie = roy.slice(0, 5).map((c) => c.p.pid);
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
    allNba,
    allDefense: allDef,
    allRookie,
  };
  league.awards = league.awards.filter((a) => a.season !== season);
  league.awards.push(awards);
  const give = (pid: number | undefined, type: string) => {
    if (pid === undefined) return;
    league.players[pid].awards.push({ season, type });
  };
  give(awards.mvp, 'MVP');
  give(awards.dpoy, 'Defensive Player of the Year');
  give(awards.roy, 'Rookie of the Year');
  give(awards.smoy, 'Sixth Man of the Year');
  give(awards.mip, 'Most Improved Player');
  allNba.forEach((team, i) => team.forEach((pid) => give(pid, `All-NBA ${['1st', '2nd', '3rd'][i]} Team`)));
  allDef.forEach((team, i) => team.forEach((pid) => give(pid, `All-Defensive ${['1st', '2nd'][i]} Team`)));
  allRookie.forEach((pid) => give(pid, 'All-Rookie Team'));
  const nm = (pid?: number) => (pid !== undefined ? playerName(league.players[pid]) : '—');
  addNews(league, {
    kind: 'award',
    text: `Awards: MVP ${nm(awards.mvp)} · DPOY ${nm(awards.dpoy)} · ROY ${nm(awards.roy)} · 6MOY ${nm(awards.smoy)} · MIP ${nm(awards.mip)} · COY ${coy ? teamName(coy) : '—'}.`,
    tids: [],
    pids: [awards.mvp, awards.dpoy, awards.roy].filter((x): x is number => x !== undefined),
  });
  const mine = [awards.mvp, awards.dpoy, awards.roy, awards.smoy, awards.mip, ...allNba.flat()].filter((pid) => pid !== undefined && league.players[pid].tid === league.userTid);
  if (mine.length || coy?.tid === league.userTid) {
    addInbox(league, {
      from: 'League Office',
      subject: 'Season awards',
      body: `Your team collected hardware: ${[...new Set(mine)].map((pid) => playerName(league.players[pid!])).join(', ')}${coy?.tid === league.userTid ? ' and Coach of the Year for you!' : ''}.`,
      tone: 'good',
      link: '/league?tab=awards',
    });
  }
  return awards;
}

export function selectAllStars(league: League): SeasonAwards['allStars'] {
  const all = candidates(league).filter((c) => c.gp >= 15 && c.p.tid >= 0);
  const out: SeasonAwards['allStars'] = { E: [], W: [] };
  for (const conf of ['E', 'W'] as const) {
    const pool = all.filter((c) => league.teams[c.p.tid]?.conf === conf);
    const ranked = [...pool].sort((a, b) => b.gmsc + b.winPct * 6 + b.p.ovr * 0.1 - (a.gmsc + a.winPct * 6 + a.p.ovr * 0.1));
    out[conf] = ranked.slice(0, 12).map((c) => c.p.pid);
  }
  let aw = league.awards.find((a) => a.season === league.season);
  if (!aw) {
    aw = { season: league.season, allNba: [], allDefense: [], allRookie: [], allStars: out };
    league.awards.push(aw);
  } else aw.allStars = out;
  for (const pid of [...out.E, ...out.W]) league.players[pid].awards.push({ season: league.season, type: 'All-Star' });
  const mine = [...out.E, ...out.W].filter((pid) => league.players[pid].tid === league.userTid);
  addNews(league, { kind: 'award', text: `All-Stars announced. East: ${out.E.slice(0, 5).map((pid) => league.players[pid].lastName).join(', ')}... West: ${out.W.slice(0, 5).map((pid) => league.players[pid].lastName).join(', ')}...`, tids: [], pids: [...out.E, ...out.W] });
  if (mine.length) {
    addInbox(league, { from: 'League Office', subject: 'All-Star selections', body: `${mine.map((pid) => playerName(league.players[pid])).join(' and ')} made the All-Star team.`, tone: 'good', link: '/league?tab=awards' });
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
    for (const bl of side.players) {
      const v = bl.pts + 0.4 * bl.fgm - 0.7 * bl.fga + 0.7 * bl.orb + 0.3 * bl.drb + bl.stl + 0.7 * bl.ast + 0.7 * bl.blk - bl.tov;
      totals.set(bl.pid, (totals.get(bl.pid) ?? 0) + v);
    }
  }
  for (const [pid, v] of totals) {
    if (v > bs) {
      bs = v;
      best = pid;
    }
  }
  return best;
}
