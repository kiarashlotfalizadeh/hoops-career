// Player valuation, contract demands and roster transactions under a simplified CBA:
// soft cap (sign FAs only with space or for the minimum), unlimited re-signing of own
// players, luxury tax, 15-man rosters, rookie scale, 125% trade salary matching.

import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';
import { CAP, ROOKIE_SCALE } from '../constants';
import { clamp } from '../random';
import { contractExp, salaryFor } from '../playerGen';
import { CAP_FOR, addNews, age, curTeamSeason, payroll, playerName, teamPlayers, winPct } from './helpers';

/** Blend of current and future ability used for value judgments. */
export function valueScore(league: League, p: Player): number {
  const a = age(league, p);
  const w = clamp((26 - a) / 9, 0, 0.55);
  let s = p.ovr * (1 - w) + p.pot * w;
  if (a >= 30) s -= (a - 29) * 1.1;
  if (p.injury && p.injury.gamesRemaining > 30) s -= 2;
  return s;
}

/** Trade value on an exponential scale (one 90 ≈ five 80s). */
export function tradeValue(league: League, p: Player, strategy: 'contend' | 'retool' | 'rebuild' = 'retool'): number {
  let s = valueScore(league, p);
  const a = age(league, p);
  if (strategy === 'rebuild') {
    if (a <= 24) s += 2;
    if (a >= 29) s -= 3 + (a - 29) * 0.8;
  } else if (strategy === 'contend') {
    s = s * 0.6 + p.ovr * 0.4 + (p.ovr >= 75 ? 1.5 : 0);
  }
  let v = Math.exp((s - 60) / 6);
  // contract surplus/burden
  const yrs = Math.max(1, contractExp(p.contract) - league.season + 1);
  const sal = salaryFor(p, league.season);
  const fair = marketSalary(league, p);
  const surplus = ((fair - sal) / 1000) * Math.min(yrs, 4);
  v += surplus * (strategy === 'rebuild' ? 0.18 : 0.1);
  return Math.max(0.05, v);
}

const SALARY_CURVE: [number, number][] = [
  [66, 0],
  [70, 0.022],
  [73, 0.045],
  [76, 0.085],
  [79, 0.135],
  [82, 0.195],
  [85, 0.25],
  [88, 0.3],
  [91, 0.35],
];

/** Fair annual salary ($K) for a player on the open market. */
export function marketSalary(league: League, p: Player): number {
  const cap = CAP_FOR(league);
  const s = valueScore(league, p);
  let pct = 0;
  if (s <= SALARY_CURVE[0][0]) pct = 0;
  else if (s >= SALARY_CURVE[SALARY_CURVE.length - 1][0]) pct = 0.35;
  else {
    for (let i = 1; i < SALARY_CURVE.length; i++) {
      if (s <= SALARY_CURVE[i][0]) {
        const [x0, y0] = SALARY_CURVE[i - 1];
        const [x1, y1] = SALARY_CURVE[i];
        pct = y0 + ((s - x0) / (x1 - x0)) * (y1 - y0);
        break;
      }
    }
  }
  const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
  const max = cap.maxContract(p.experience);
  return clamp(Math.round((pct * cap.salaryCap) / 50) * 50, min, max);
}

export function preferredYears(league: League, p: Player): number {
  const a = age(league, p);
  if (a <= 24) return p.ovr >= 76 ? 5 : 3;
  if (a <= 28) return 4;
  if (a <= 31) return 3;
  if (a <= 33) return 2;
  return 1;
}

/** How attractive a team is to a player (0.85..1.2 multiplier on willingness). */
export function teamAppeal(league: League, tid: number, p: Player): number {
  const team = league.teams[tid];
  const ts = curTeamSeason(league, tid);
  const games = ts.won + ts.lost;
  const prev = team.seasons.find((s) => s.season === league.season - 1);
  const wp = games >= 10 ? winPct(ts) : prev ? winPct(prev) : 0.5;
  let a = 1 + (wp - 0.5) * 0.35 + (team.hype - 0.5) * 0.15 + Math.min(0.06, (team.pop - 3) * 0.01);
  // playing time available: is he better than the team's current rotation?
  const roster = teamPlayers(league, tid).filter((x) => x.pid !== p.pid).sort((x, y) => y.ovr - x.ovr);
  const rank = roster.filter((x) => x.ovr > p.ovr).length;
  if (rank <= 4) a += 0.06;
  else if (rank >= 9) a -= 0.08;
  if (p.tid === tid) a += p.mood.score * 0.02; // current team: mood matters
  return clamp(a, 0.75, 1.25);
}

export interface Ask {
  amount: number;
  years: number;
}

export function askingContract(league: League, p: Player, tid?: number): Ask {
  let amount = marketSalary(league, p);
  const diff = league.settings.difficulty;
  const userTeam = tid === league.userTid;
  if (userTeam) amount *= diff === 'casual' ? 0.9 : diff === 'hard' ? 1.12 : 1;
  if (tid !== undefined) amount /= teamAppeal(league, tid, p);
  const cap = CAP_FOR(league);
  amount = clamp(Math.round(amount / 50) * 50, p.experience >= 3 ? cap.vetMin : cap.minContract, cap.maxContract(p.experience));
  return { amount, years: preferredYears(league, p) };
}

export function willSign(league: League, p: Player, tid: number, amount: number, years: number): { ok: boolean; reason: string } {
  const ask = askingContract(league, p, tid);
  if (p.mood.tradeRequest && p.tid === tid) return { ok: false, reason: `${playerName(p)} wants out and won't re-sign.` };
  if (years < 1 || years > 5) return { ok: false, reason: 'Contracts must be 1 to 5 years.' };
  const yearPenalty = Math.abs(years - ask.years) * 0.03;
  if (amount >= ask.amount * (1 + yearPenalty) - 1) return { ok: true, reason: 'Deal!' };
  const gap = ask.amount * (1 + yearPenalty) - amount;
  return { ok: false, reason: `Asking for about ${(ask.amount / 1000).toFixed(1)}M/yr over ${ask.years} years (you're ${(gap / 1000).toFixed(1)}M short).` };
}

export function makeContract(league: League, amount: number, years: number, start = league.season) {
  const salaries: number[] = [];
  for (let i = 0; i < years; i++) salaries.push(Math.round((amount * Math.pow(1.05, i)) / 10) * 10);
  return { start, salaries };
}

export function rookieContract(league: League, pick: number, round: number, start: number) {
  const g = Math.pow(1 + CAP.growth, Math.max(0, start - league.startSeason));
  if (round === 1) {
    const base = ROOKIE_SCALE[Math.min(29, pick - 1)] * g;
    return { start, salaries: [0, 1, 2, 3].map((i) => Math.round((base * Math.pow(1.045, i)) / 10) * 10), rookie: true, option: 'team' as const };
  }
  const min = CAP.minContract * g;
  return { start, salaries: [Math.round(min), Math.round(min * 1.05)], rookie: true };
}

export function rosterCount(league: League, tid: number) {
  return teamPlayers(league, tid).length;
}

export function canSignFA(league: League, tid: number, amount: number): { ok: boolean; reason: string } {
  if (rosterCount(league, tid) >= CAP.rosterMax) return { ok: false, reason: 'Roster is full (15). Release or trade someone first.' };
  const cap = CAP_FOR(league);
  const minLike = amount <= cap.vetMin + 1;
  const after = payroll(league, tid) + amount;
  if (!minLike && after > cap.salaryCap) {
    return { ok: false, reason: `Over the cap after signing (${(after / 1000).toFixed(1)}M vs ${(cap.salaryCap / 1000).toFixed(1)}M). Only minimum contracts allowed.` };
  }
  return { ok: true, reason: '' };
}

export function signPlayer(league: League, p: Player, tid: number, amount: number, years: number, opts: { news?: boolean; start?: number } = {}) {
  const prevTid = p.tid;
  p.tid = tid;
  p.contract = makeContract(league, amount, years, opts.start ?? league.season);
  if (prevTid !== tid) p.joinedSeason = league.season;
  p.asking = undefined;
  p.faDays = undefined;
  p.mood.tradeRequest = false;
  const team = league.teams[tid];
  if (!team.rotation.order.includes(p.pid)) team.rotation.order.push(p.pid);
  if (opts.news !== false) {
    const verb = prevTid === tid ? 're-signed with' : 'signed with';
    addNews(league, {
      kind: 'signing',
      text: `${playerName(p)} ${verb} the ${team.region} ${team.name}: ${years} yr / $${((amount * years) / 1000).toFixed(1)}M.`,
      tids: [tid],
      pids: [p.pid],
    });
  }
}

export function releasePlayer(league: League, p: Player, opts: { news?: boolean } = {}) {
  const tid = p.tid;
  if (tid < 0) return;
  const team = league.teams[tid];
  // remaining guaranteed salary stays on the books (rookie 2nd-round deals and minimums too)
  for (let s = league.season; s <= contractExp(p.contract); s++) {
    const amt = salaryFor(p, s);
    if (amt > 0) team.deadMoney.push({ pid: p.pid, name: playerName(p), season: s, amount: amt });
  }
  p.tid = FREE_AGENT;
  p.contract = { start: league.season, salaries: [0] };
  team.rotation.order = team.rotation.order.filter((x) => x !== p.pid);
  delete team.rotation.minutes[p.pid];
  team.rotation.closers = team.rotation.closers.filter((x) => x !== p.pid);
  const ask = askingContract(league, p);
  p.asking = ask;
  p.faDays = 30;
  if (opts.news !== false) addNews(league, { kind: 'release', text: `The ${team.name} released ${playerName(p)}.`, tids: [tid], pids: [p.pid] });
}

export function luxuryTaxBill(league: League, tid: number): number {
  const cap = CAP_FOR(league);
  const pay = payroll(league, tid);
  return pay > cap.luxuryTax ? Math.round((pay - cap.luxuryTax) * CAP.taxRate) : 0;
}
