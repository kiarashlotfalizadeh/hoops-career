import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';
import { Rng } from '../random';
import { CAP } from '../constants';
import { contractExp, playerAge } from '../playerGen';
import { CAP_FOR, contractSeason, addInbox, addNews, freeAgents, payroll, playerName, teamPlayers } from './helpers';
import { askingContract, marketSalary, signPlayer, valueScore, willSign } from './contracts';

export function expiringPlayers(league: League, tid: number): Player[] {
  return teamPlayers(league, tid).filter((p) => contractExp(p.contract) <= league.season);
}

/** AI teams decide whether to keep their expiring players (start of free agency). */
export function aiResign(league: League, rng: Rng) {
  for (const t of league.teams) {
    if (t.tid === league.userTid) continue;
    const exp = expiringPlayers(league, t.tid).sort((a, b) => valueScore(league, b) - valueScore(league, a));
    for (const p of exp) {
      const ask = askingContract(league, p, t.tid);
      const v = valueScore(league, p);
      const age = playerAge(p, league.season + 1);
      const roster = teamPlayers(league, t.tid).filter((x) => contractExp(x.contract) > league.season).length;
      const cap = CAP_FOR(league, league.season + 1);
      const nextPay = payroll(league, t.tid, league.season + 1);
      const worth = v >= 70 || (v >= 66 && roster < 11);
      const affordable = nextPay + ask.amount < cap.luxuryTax * (t.strategy === 'contend' ? 1.12 : 0.98);
      const wants = !p.mood.tradeRequest && p.mood.score > -5;
      if (worth && affordable && wants && age <= 35 && rng.chance(0.85)) {
        signPlayer(league, p, t.tid, ask.amount, ask.years, { start: league.season + 1 });
      }
    }
  }
}

/** Move all unsigned expiring players into the free agent pool. */
export function releaseExpiring(league: League) {
  for (const p of Object.values(league.players)) {
    if (p.tid >= 0 && contractExp(p.contract) <= league.season) {
      const prevTeam = league.teams[p.tid];
      p.tid = FREE_AGENT;
      prevTeam.rotation.order = prevTeam.rotation.order.filter((x) => x !== p.pid);
      delete prevTeam.rotation.minutes[p.pid];
    }
  }
  for (const p of freeAgents(league)) {
    p.asking = undefined;
    p.asking = askingContract(league, p);
    p.faDays = 30;
  }
}

function needScore(league: League, tid: number, p: Player): number {
  const roster = teamPlayers(league, tid);
  const better = roster.filter((x) => x.ovr >= p.ovr).length;
  let s = valueScore(league, p) - better * 0.6;
  const bigs = roster.filter((x) => x.ratings.hgt >= 60).length;
  if (bigs < 3 && p.ratings.hgt >= 60) s += 2;
  const guards = roster.filter((x) => x.ratings.hnd >= 60).length;
  if (guards < 3 && p.ratings.hnd >= 60) s += 2;
  return s;
}

/** One day of free agency: AI teams make offers, players accept the best fit. */
export function faDay(league: League, rng: Rng, intensity = 1) {
  const season = contractSeason(league);
  const cap = CAP_FOR(league, season);
  const fas = freeAgents(league).sort((a, b) => valueScore(league, b) - valueScore(league, a));
  if (!fas.length) return;
  const teams = rng.shuffle(league.teams.filter((t) => t.tid !== league.userTid));
  for (const t of teams) {
    if (!rng.chance(0.55 * intensity)) continue;
    const size = teamPlayers(league, t.tid).length;
    if (size >= CAP.rosterMax) continue;
    const pay = payroll(league, t.tid, season);
    const space = cap.salaryCap - pay;
    // best FA they can afford (or minimum guys to fill the roster)
    const pool = freeAgents(league);
    let pick: Player | undefined;
    let bs = -Infinity;
    for (const p of pool) {
      const ask = askingContract(league, p, t.tid);
      const affordable = ask.amount <= space || ask.amount <= cap.vetMin + 1;
      if (!affordable) continue;
      if (size >= 13 && valueScore(league, p) < 64) continue;
      const s = needScore(league, t.tid, p) + rng.normal(0, 1.5);
      if (s > bs) {
        bs = s;
        pick = p;
      }
    }
    if (!pick) continue;
    const ask = askingContract(league, pick, t.tid);
    // players sometimes wait for a better offer early in free agency
    const patience = (pick.faDays ?? 0) > 20 && valueScore(league, pick) >= 78 ? 0.45 : 0.9;
    if (!rng.chance(patience)) continue;
    signPlayer(league, pick, t.tid, ask.amount, ask.years, { start: season });
  }
  for (const p of freeAgents(league)) {
    if (p.faDays !== undefined) {
      p.faDays--;
      if (p.faDays <= 0) {
        // price drops as the market dries up
        p.asking = { amount: Math.max(cap.minContract, Math.round(marketSalary(league, p) * 0.8)), years: Math.max(1, (p.asking?.years ?? 2) - 1) };
        p.faDays = 10;
      }
    }
  }
}

/** Make sure every AI team can field a legal roster (13+) with minimum signings. */
export function fillRosters(league: League, rng: Rng, season = league.season) {
  const cap = CAP_FOR(league, season);
  for (const t of league.teams) {
    if (t.tid === league.userTid) continue;
    let size = teamPlayers(league, t.tid).length;
    while (size < CAP.rosterMin) {
      const pool = freeAgents(league).sort((a, b) => valueScore(league, b) - valueScore(league, a));
      const p = pool[Math.min(pool.length - 1, Math.floor(rng.uniform(0, 4)))];
      if (!p) break;
      signPlayer(league, p, t.tid, p.experience >= 3 ? cap.vetMin : cap.minContract, 1, { news: false, start: season });
      size++;
    }
  }
}

/** Trim AI rosters to 15 by releasing the least valuable players. */
export function trimRosters(league: League, release: (p: Player) => void) {
  for (const t of league.teams) {
    if (t.tid === league.userTid) continue;
    const roster = teamPlayers(league, t.tid).sort((a, b) => valueScore(league, a) - valueScore(league, b));
    while (roster.length > CAP.rosterMax) {
      const p = roster.shift()!;
      release(p);
    }
  }
}

export function userOffer(league: League, pid: number, amount: number, years: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (!p || p.tid !== FREE_AGENT) return { ok: false, reason: 'Not a free agent.' };
  const season = contractSeason(league);
  const tid = league.userTid;
  if (teamPlayers(league, tid).length >= CAP.rosterMax) return { ok: false, reason: 'Your roster is full (15).' };
  const cap = CAP_FOR(league, season);
  const isMin = amount <= cap.vetMin + 1;
  if (!isMin && payroll(league, tid, season) + amount > cap.salaryCap) {
    return { ok: false, reason: `Not enough cap space. You have $${((cap.salaryCap - payroll(league, tid, season)) / 1000).toFixed(1)}M; over the cap you can only offer minimum deals ($${(cap.vetMin / 1000).toFixed(2)}M).` };
  }
  const res = willSign(league, p, tid, amount, years);
  if (!res.ok) return res;
  signPlayer(league, p, tid, amount, years, { start: season });
  addInbox(league, { from: 'Assistant GM', subject: `${playerName(p)} signed`, body: `${playerName(p)} agreed to ${years} year${years > 1 ? 's' : ''} at $${(amount / 1000).toFixed(1)}M per season. He has been added to the end of your rotation.`, tone: 'good', link: `/player/${p.pid}` });
  return { ok: true, reason: `${playerName(p)} accepts!` };
}

export function userResign(league: League, pid: number, amount: number, years: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (!p || p.tid !== league.userTid) return { ok: false, reason: 'Not on your team.' };
  const res = willSign(league, p, league.userTid, amount, years);
  if (!res.ok) return res;
  signPlayer(league, p, league.userTid, amount, years, { start: league.season + 1 });
  addNews(league, { kind: 'signing', text: `${playerName(p)} re-signs with the ${league.teams[league.userTid].name}.`, tids: [league.userTid], pids: [p.pid] });
  return { ok: true, reason: `${playerName(p)} re-signs!` };
}
