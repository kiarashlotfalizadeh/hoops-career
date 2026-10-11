// Player valuation, contract demands and roster transactions under a simplified CBA:
// soft cap (sign FAs only with space or for the minimum), unlimited re-signing of own
// players, luxury tax, 15-man rosters, rookie scale, 125% trade salary matching.

import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';
import { CAP, ROOKIE_SCALE } from '../constants';
import { Rng, clamp } from '../random';
import { contractExp, salaryFor } from '../playerGen';
import { CAP_FOR, addInbox, addNews, age, contractSeason, curTeamSeason, inSeason, payroll, playerName, standardRoster, teamPlayers, winPct } from './helpers';

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
  // contract surplus/burden over the seasons still to be paid (next season's books in the offseason)
  const cs = contractSeason(league);
  const yrs = Math.max(1, contractExp(p.contract) - cs + 1);
  const sal = salaryFor(p, cs);
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
  [79, 0.125],
  [82, 0.18],
  [85, 0.25],
  [88, 0.3],
  [91, 0.35],
];

/** Fair annual salary ($K) for a player on the open market. */
export function marketSalary(league: League, p: Player): number {
  const cap = CAP_FOR(league, contractSeason(league));
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
  // unsigned free agents lower their price as the market dries up (see faDay)
  if (p.tid === FREE_AGENT && p.asking && p.asking.amount < amount) amount = p.asking.amount;
  const diff = league.settings.difficulty;
  const userTeam = tid === league.userTid;
  if (userTeam) amount *= diff === 'casual' ? 0.9 : diff === 'hard' ? 1.12 : 1;
  if (tid !== undefined) amount /= teamAppeal(league, tid, p);
  const cap = CAP_FOR(league, contractSeason(league));
  amount = clamp(Math.round(amount / 50) * 50, p.experience >= 3 ? cap.vetMin : cap.minContract, cap.maxContract(p.experience));
  const years = p.tid === FREE_AGENT && p.asking && p.asking.amount < marketSalary(league, p) ? p.asking.years : preferredYears(league, p);
  return { amount, years };
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

/** Pass `experience` to keep the rounded first-year salary inside that player's min/max. */
export function makeContract(league: League, amount: number, years: number, start = league.season, experience?: number) {
  const salaries: number[] = [];
  for (let i = 0; i < years; i++) salaries.push(Math.round((amount * Math.pow(1.05, i)) / 10) * 10);
  if (experience !== undefined) {
    // clamp after rounding: a max deal rounded to $10K would otherwise exceed the max by a few $K
    const cap = CAP_FOR(league, start);
    salaries[0] = clamp(salaries[0], experience >= 3 ? cap.vetMin : cap.minContract, cap.maxContract(experience));
  }
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

/** Standard roster spots in use (two-way deals don't count). */
export function rosterCount(league: League, tid: number) {
  return standardRoster(league, tid).length;
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

export function signPlayer(league: League, p: Player, tid: number, amount: number, years: number, opts: { news?: boolean; start?: number; twoWay?: boolean } = {}) {
  const prevTid = p.tid;
  p.tid = tid;
  p.contract = makeContract(league, amount, years, opts.start ?? league.season, opts.twoWay ? undefined : p.experience);
  if (opts.twoWay) p.contract.twoWay = true;
  if (prevTid !== tid) p.joinedSeason = league.season;
  p.asking = undefined;
  p.faDays = undefined;
  p.mood.tradeRequest = false;
  const team = league.teams[tid];
  if (!team.rotation.order.includes(p.pid)) team.rotation.order.push(p.pid);
  if (opts.news !== false) {
    const verb = prevTid === tid ? 're-signed with' : opts.twoWay ? 'signed a two-way deal with' : 'signed with';
    addNews(league, {
      kind: 'signing',
      text: `${playerName(p)} ${verb} the ${team.region} ${team.name}: ${years} yr / $${((amount * years) / 1000).toFixed(1)}M.`,
      tids: [tid],
      pids: [p.pid],
    });
  }
}

/** Why the user can't release this player now, or null. Two-way players never hold one of the 13. */
export function releaseBlockedReason(league: League, p: Player): string | null {
  if (p.tid < 0 || p.contract.twoWay || !inSeason(league)) return null;
  return standardRoster(league, p.tid).length <= CAP.rosterMin ? `Rosters need at least ${CAP.rosterMin} players during the season. Sign a replacement first.` : null;
}

export function releasePlayer(league: League, p: Player, opts: { news?: boolean } = {}) {
  const tid = p.tid;
  if (tid < 0) return;
  const team = league.teams[tid];
  // remaining guaranteed salary stays on the books (rookie 2nd-round deals and minimums too);
  // two-way pay sits outside the cap, so it leaves no dead money
  for (let s = league.season; s <= contractExp(p.contract) && !p.contract.twoWay; s++) {
    const amt = salaryFor(p, s);
    if (amt > 0) team.deadMoney.push({ pid: p.pid, name: playerName(p), season: s, amount: amt });
  }
  p.tid = FREE_AGENT;
  p.contract = { start: league.season, salaries: [0] };
  team.rotation.order = team.rotation.order.filter((x) => x !== p.pid);
  delete team.rotation.minutes[p.pid];
  team.rotation.closers = team.rotation.closers.filter((x) => x !== p.pid);
  p.asking = undefined;
  p.asking = askingContract(league, p);
  p.faDays = 30;
  if (opts.news !== false) addNews(league, { kind: 'release', text: `The ${team.name} released ${playerName(p)}.`, tids: [tid], pids: [p.pid] });
}

// ---------------------------------------------------------------- two-way contracts

/** Two-way pay: about half the rookie minimum. */
export function twoWaySalary(league: League, season = contractSeason(league)): number {
  return Math.round((CAP_FOR(league, season).minContract * 0.45) / 10) * 10;
}

/** Like the NBA, two-way deals are for players with fewer than four seasons in the league. */
export function twoWayEligible(p: Player): boolean {
  return p.experience <= 3;
}

/** Promote a two-way player to a standard deal at the minimum for his remaining seasons. */
export function convertTwoWay(league: League, pid: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (!p || p.tid < 0 || !p.contract.twoWay) return { ok: false, reason: 'He is not on a two-way contract.' };
  if (standardRoster(league, p.tid).length >= CAP.rosterMax) return { ok: false, reason: `No open roster spot (${CAP.rosterMax}). Release or trade someone first.` };
  const s = contractSeason(league);
  const exp = contractExp(p.contract);
  if (exp < s) return { ok: false, reason: 'His contract is up. Re-sign him to a standard deal instead.' };
  const min = (season: number) => (p.experience >= 3 ? CAP_FOR(league, season).vetMin : CAP_FOR(league, season).minContract);
  p.contract = { start: s, salaries: Array.from({ length: exp - s + 1 }, (_, i) => min(s + i)) };
  addNews(league, { kind: 'signing', text: `The ${league.teams[p.tid].name} converted ${playerName(p)} to a standard contract.`, tids: [p.tid], pids: [p.pid] });
  return { ok: true, reason: `${playerName(p)} now holds a standard roster spot.` };
}

// ---------------------------------------------------------------- contract options

/** Undecided option on next season (the contract's final year); decided after the draft. */
export function pendingOption(league: League, p: Player): 'player' | 'team' | null {
  const c = p.contract;
  return c.option && p.tid >= 0 && c.start <= league.season && contractExp(c) === league.season + 1 ? c.option : null;
}

/** Is the option-year salary worth paying? AI teams' rule and the user's default. */
export function teamOptionWorth(league: League, p: Player): boolean {
  return marketSalary(league, p) >= salaryFor(p, league.season + 1) * 0.85;
}

function exerciseOption(p: Player) {
  delete p.contract.option;
}

/** The option season goes away: the deal now ends this season, so he can be re-signed or leave. */
function dropOptionYear(p: Player) {
  p.contract.salaries = p.contract.salaries.slice(0, -1);
  delete p.contract.option;
}

export function pendingTeamOptions(league: League, tid: number): Player[] {
  return teamPlayers(league, tid).filter((p) => pendingOption(league, p) === 'team');
}

/** The user's call on one of his team options (re-signing period only). */
export function decideTeamOption(league: League, pid: number, exercise: boolean): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (league.phase !== 'resign') return { ok: false, reason: 'Options are decided during the re-signing period.' };
  if (!p || p.tid !== league.userTid || pendingOption(league, p) !== 'team') return { ok: false, reason: 'No pending team option.' };
  if (exercise) exerciseOption(p);
  else {
    dropOptionYear(p);
    p.asking = askingContract(league, p, league.userTid);
  }
  return { ok: true, reason: exercise ? `Option exercised: ${playerName(p)} is signed through next season.` : `Option declined: re-sign ${playerName(p)} now or he becomes a free agent.` };
}

/**
 * End-of-season option decisions. Players opt out when the open market clearly pays more; AI
 * teams pick up options on players worth the money. The user's team options wait for his call on
 * the Re-sign screen until free agency opens (`includeUser`), when the staff's default applies.
 */
export function resolveOptions(league: League, rng: Rng, includeUser = false) {
  const optOuts: Player[] = [];
  const staffCalls: string[] = [];
  for (const p of Object.values(league.players)) {
    const kind = pendingOption(league, p);
    if (!kind) continue;
    const sal = salaryFor(p, league.season + 1);
    if (kind === 'player') {
      if (marketSalary(league, p) * rng.uniform(0.9, 1.1) > sal * 1.15) {
        dropOptionYear(p);
        optOuts.push(p);
      } else exerciseOption(p);
      continue;
    }
    const user = p.tid === league.userTid;
    if (user && !includeUser) continue;
    const keep = teamOptionWorth(league, p);
    if (keep) exerciseOption(p);
    else dropOptionYear(p);
    if (user) staffCalls.push(`${playerName(p)}: ${keep ? 'exercised' : 'declined'} ($${(sal / 1000).toFixed(1)}M)`);
  }
  const notable = optOuts.filter((p) => p.ovr >= 74 || salaryFor(p, league.season) >= 10_000).sort((a, b) => b.ovr - a.ovr);
  if (notable.length) {
    addNews(league, {
      kind: 'general',
      text: `Player options: ${notable.slice(0, 6).map((p) => `${playerName(p)} (${league.teams[p.tid].abbrev})`).join(', ')}${notable.length > 6 ? ' and others' : ''} opt${notable.length > 1 ? '' : 's'} out.`,
      tids: [...new Set(notable.map((p) => p.tid))],
      pids: notable.map((p) => p.pid),
    });
  }
  for (const p of optOuts.filter((x) => x.tid === league.userTid)) {
    addInbox(league, {
      from: 'Assistant GM',
      subject: `${playerName(p)} opts out`,
      body: `${playerName(p)} declined his player option to test the market. We hold his Bird rights: re-sign him now, or he becomes a free agent.`,
      tone: 'alert',
      link: '/resign',
    });
  }
  if (staffCalls.length) {
    addInbox(league, { from: 'Assistant GM', subject: 'Team options decided', body: `You left these team options open, so the staff made the call:\n${staffCalls.join('\n')}`, tone: 'neutral', link: '/office' });
  }
}

export function luxuryTaxBill(league: League, tid: number): number {
  const cap = CAP_FOR(league);
  const pay = payroll(league, tid);
  return pay > cap.luxuryTax ? Math.round((pay - cap.luxuryTax) * CAP.taxRate) : 0;
}
