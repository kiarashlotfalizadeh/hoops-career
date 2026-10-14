// Player valuation, contract demands and roster transactions under a simplified CBA:
// soft cap (sign FAs only with space, the mid-level exception or for the minimum), unlimited
// re-signing of own players, luxury tax, 15-man rosters, rookie scale, 125% trade salary matching.

import type { League, Player, Team } from '../types';
import { FREE_AGENT } from '../types';
import { CAP, ROOKIE_SCALE } from '../constants';
import { Rng, clamp } from '../random';
import { contractExp, salaryFor } from '../playerGen';
import {
  CAP_FOR,
  addInbox,
  addNews,
  age,
  contractSeason,
  curTeamSeason,
  inSeason,
  payroll,
  playerName,
  revenueScale,
  rosterMaxNow,
  standardRoster,
  teamPlayers,
  winPct,
} from './helpers';

export type Strategy = Team['strategy'];

/** Playoff games a team plays for, counted into what's left of a season. */
const PLAYOFF_GAMES = 12;

/**
 * Share (0..1) of what's left of the season, playoffs included, that a player's injury costs him.
 * In the offseason it is next season's share, after the summer heals 35 games (see newSeason).
 */
export function injuryShare(league: League, p: Player): number {
  if (!p.injury) return 0;
  let left = 82 + PLAYOFF_GAMES;
  if (league.phase === 'regular') left = 82 * Math.max(0, 1 - league.day / Math.max(1, league.regularSeasonDays)) + PLAYOFF_GAMES;
  else if (league.phase === 'playin' || league.phase === 'playoffs') left = PLAYOFF_GAMES;
  const offseason = contractSeason(league) > league.season;
  return clamp((p.injury.gamesRemaining - (offseason ? 35 : 0)) / left, 0, 1);
}

/** Blend of current and future ability used for value judgments. */
export function valueScore(league: League, p: Player): number {
  const a = age(league, p);
  const w = clamp((26 - a) / 9, 0, 0.55);
  let s = p.ovr * (1 - w) + p.pot * w;
  if (a >= 30) s -= (a - 29) * 1.1;
  s -= 3 * injuryShare(league, p);
  return s;
}

/** Trade value per $1M a season of salary below (or above) what a player is worth. */
const SURPLUS_VALUE: Record<Strategy, number> = { contend: 0.1, retool: 0.1, rebuild: 0.18 };

/** A team option on the contract's last season that is still to be decided: not guaranteed money. */
const teamOptionOpen = (league: League, p: Player) => p.contract.option === 'team' && contractExp(p.contract) > league.season;

/**
 * Trade value on an exponential scale (one 90 ≈ five 80s), with a premium for stars and the
 * contract's surplus or burden. A bad enough contract makes it negative: a liability.
 */
export function tradeValue(league: League, p: Player, strategy: Strategy = 'retool'): number {
  let s = valueScore(league, p);
  const a = age(league, p);
  if (strategy === 'rebuild') {
    if (a <= 24) s += 2;
    if (a >= 29) s -= 3 + (a - 29) * 0.8;
  } else if (strategy === 'contend') {
    s = s * 0.6 + p.ovr * 0.4 + (p.ovr >= 75 ? 1.5 : 0);
  }
  let v = Math.exp((s - 60) / 6);
  // a star is worth more than the lesser players adding up to his value
  if (s > 85) v *= 1 + (s - 85) * 0.05;
  // the part of this season he'll miss matters most to a team playing for now
  v *= 1 - injuryShare(league, p) * (strategy === 'contend' ? 0.55 : strategy === 'retool' ? 0.3 : 0.1);
  // contract surplus/burden over the seasons still to be paid (next season's books in the offseason)
  const cs = contractSeason(league);
  const yrs = Math.max(1, contractExp(p.contract) - cs + 1);
  const surplus = (marketSalary(league, p) - salaryFor(p, cs)) / 1000;
  // an undecided team option (the last year) can be declined, so it never counts as a burden
  const optionYear = teamOptionOpen(league, p) && yrs <= 4;
  return v + surplus * (optionYear && surplus < 0 ? yrs - 1 : Math.min(yrs, 4)) * SURPLUS_VALUE[strategy];
}

// Share of the cap a value score earns on the open market. Sized so that what rostered players
// would earn roughly matches the league's total cap (0.85× the first curve, which came to ~1.4×),
// easing back to the max for superstars.
const SALARY_CURVE: [number, number][] = [
  [66, 0],
  [70, 0.019],
  [73, 0.038],
  [76, 0.072],
  [79, 0.106],
  [82, 0.153],
  [85, 0.213],
  [88, 0.265],
  [91, 0.31],
  [94, 0.35],
];

/** Fair annual salary ($K) for a player on the open market. */
export function marketSalary(league: League, p: Player): number {
  return salaryForScore(league, valueScore(league, p), p.experience);
}

/** Fair annual salary ($K) for a value score, within the minimum and max for his years in the league. */
export function salaryForScore(league: League, s: number, experience: number): number {
  const cap = CAP_FOR(league, contractSeason(league));
  let pct = 0;
  if (s <= SALARY_CURVE[0][0]) pct = 0;
  else if (s >= SALARY_CURVE[SALARY_CURVE.length - 1][0]) pct = SALARY_CURVE[SALARY_CURVE.length - 1][1];
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
  const min = experience >= 3 ? cap.vetMin : cap.minContract;
  const max = cap.maxContract(experience);
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

/** How attractive a team is to a player (0.75..1.25 multiplier on willingness). */
export function teamAppeal(league: League, tid: number, p: Player): number {
  const team = league.teams[tid];
  const ts = curTeamSeason(league, tid);
  const games = ts.won + ts.lost;
  const prev = team.seasons.find((s) => s.season === league.season - 1);
  const wp = games >= 10 ? winPct(ts) : prev ? winPct(prev) : 0.5;
  let a = 1 + (wp - 0.5) * 0.35 + (team.hype - 0.5) * 0.15 + Math.min(0.06, (team.pop - 3) * 0.01);
  // playing time available: is he better than the team's current rotation?
  const roster = teamPlayers(league, tid)
    .filter((x) => x.pid !== p.pid)
    .sort((x, y) => y.ovr - x.ovr);
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
  const market = marketSalary(league, p);
  let amount = market;
  // unsigned free agents lower their price as the market dries up (see faDay)
  const marked = p.tid === FREE_AGENT && !!p.asking && p.asking.amount < market;
  if (marked) amount = p.asking!.amount;
  const years = marked ? p.asking!.years : preferredYears(league, p);
  const cap = CAP_FOR(league, contractSeason(league));
  const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
  // a minimum-level player takes the minimum from anyone
  if (amount <= min) return { amount: min, years };
  const diff = league.settings.difficulty;
  if (tid === league.userTid) amount *= diff === 'casual' ? 0.9 : diff === 'hard' ? 1.12 : 1;
  if (tid !== undefined) amount /= teamAppeal(league, tid, p);
  return { amount: clamp(Math.round(amount / 50) * 50, min, cap.maxContract(p.experience)), years };
}

export function willSign(league: League, p: Player, tid: number, amount: number, years: number): { ok: boolean; reason: string } {
  const ask = askingContract(league, p, tid);
  if (p.mood.tradeRequest && p.tid === tid) return { ok: false, reason: `${playerName(p)} wants out and won't re-sign.` };
  if (years < 1 || years > 5) return { ok: false, reason: 'Contracts must be 1 to 5 years.' };
  const yearPenalty = Math.abs(years - ask.years) * 0.03;
  if (amount >= ask.amount * (1 + yearPenalty) - 1) return { ok: true, reason: 'Deal!' };
  const gap = ask.amount * (1 + yearPenalty) - amount;
  return {
    ok: false,
    reason: `Asking for about $${(ask.amount / 1000).toFixed(1)}M/yr over ${ask.years} year${ask.years === 1 ? '' : 's'} (you're $${(gap / 1000).toFixed(1)}M short).`,
  };
}

/** Pass `experience` to keep the rounded first-year salary inside that player's min/max. */
export function makeContract(league: League, amount: number, years: number, start = league.season, experience?: number) {
  const salaries: number[] = [];
  for (let i = 0; i < years; i++) salaries.push(Math.round((amount * Math.pow(1.05, i)) / 10) * 10);
  if (experience !== undefined) {
    const min = (season: number) => (experience >= 3 ? CAP_FOR(league, season).vetMin : CAP_FOR(league, season).minContract);
    // clamp after rounding: a max deal rounded to $10K would otherwise exceed the max by a few $K
    salaries[0] = clamp(salaries[0], min(start), CAP_FOR(league, start).maxContract(experience));
    // and a minimum deal's raises (5%) trail the minimum's growth with the cap (6%)
    for (let i = 1; i < years; i++) salaries[i] = Math.max(salaries[i], min(start + i));
  }
  return { start, salaries };
}

export function rookieContract(league: League, pick: number, round: number, start: number) {
  if (round === 1) {
    const base = ROOKIE_SCALE[Math.min(29, pick - 1)] * revenueScale(league, start);
    return { start, salaries: [0, 1, 2, 3].map((i) => Math.round((base * Math.pow(1.045, i)) / 10) * 10), rookie: true, option: 'team' as const };
  }
  // a second-rounder's two minimum seasons: the minimum grows with the cap, faster than a 5% raise
  return { start, salaries: [0, 1].map((i) => CAP_FOR(league, start + i).minContract), rookie: true };
}

/**
 * A first-round pick on his rookie-scale deal. A second-rounder's two minimum seasons are rookie
 * deals too (`contract.rookie`), but they aren't on the scale.
 */
export const rookieScaleDeal = (p: Player) => !!p.contract.rookie && p.draft.round === 1;

// ---------------------------------------------------------------- signing exceptions

/** Non-taxpayer mid-level exception, as a share of the cap. */
export const MLE_PCT = 0.085;
/** Longest deal the mid-level exception allows. */
export const MLE_YEARS = 4;

/**
 * Most a team can pay one free agent with its mid-level exception this season: once a season, up
 * to 8.5% of the cap, and only while the signing keeps it under the luxury tax. 0 when used up.
 */
export function mleRoom(league: League, tid: number, season = contractSeason(league)): number {
  if (league.teams[tid].mleSeason === season) return 0;
  const cap = CAP_FOR(league, season);
  return Math.max(0, Math.min(Math.round((cap.salaryCap * MLE_PCT) / 10) * 10, cap.luxuryTax - payroll(league, tid, season)));
}

export type SigningRoute = 'min' | 'space' | 'mle';

/**
 * How a team can pay free agent `p` this much a season: the minimum (his own: the veteran minimum
 * only after 3 seasons in the league), cap space, the mid-level exception, or not at all.
 */
export function signingRoute(league: League, tid: number, amount: number, season = contractSeason(league), p?: Pick<Player, 'experience'>): SigningRoute | null {
  const cap = CAP_FOR(league, season);
  if (amount <= (p && p.experience < 3 ? cap.minContract : cap.vetMin) + 1) return 'min';
  if (payroll(league, tid, season) + amount <= cap.salaryCap) return 'space';
  if (amount <= mleRoom(league, tid, season)) return 'mle';
  return null;
}

/** Season day of December 15 (day 0 is October 20). */
export const DEC_15 = 56;

export function signPlayer(league: League, p: Player, tid: number, amount: number, years: number, opts: { news?: boolean; start?: number; twoWay?: boolean } = {}) {
  const prevTid = p.tid;
  p.tid = tid;
  p.contract = makeContract(league, amount, years, opts.start ?? league.season, opts.twoWay ? undefined : p.experience);
  if (opts.twoWay) p.contract.twoWay = true;
  if (prevTid !== tid) p.joinedSeason = league.season;
  // like the NBA's: no trading him until December 15 of his first season, or three months after
  // an in-season signing if that is later (otherwise a free agent could be signed and flipped for
  // more value); a summer or training-camp signing waits for December 15
  p.tradeLock = league.phase === 'regular' ? { season: league.season, day: Math.max(DEC_15, league.day + 90) } : { season: p.contract.start, day: DEC_15 };
  p.asking = undefined;
  p.faDays = undefined;
  p.mood.tradeRequest = false;
  const team = league.teams[tid];
  if (!team.rotation.order.includes(p.pid)) team.rotation.order.push(p.pid);
  if (opts.news !== false) {
    const verb = prevTid === tid ? 're-signed with' : opts.twoWay ? 'signed a two-way deal with' : 'signed with';
    addNews(league, {
      kind: 'signing',
      // the total includes the yearly raises, as on the offer sheet
      text: `${playerName(p)} ${verb} the ${team.region} ${team.name}: ${years} yr / $${(p.contract.salaries.reduce((a, x) => a + x, 0) / 1000).toFixed(1)}M.`,
      tids: [tid],
      pids: [p.pid],
    });
  }
}

/** Why a fired coach can't run his old team's roster (see owner.ts). */
export const FIRED_REASON = 'You were fired: take over another team first.';

/** Why the user can't release this player now, or null. Two-way players never hold one of the 13. */
export function releaseBlockedReason(league: League, p: Player): string | null {
  if (league.fired && p.tid === league.userTid) return FIRED_REASON;
  if (p.tid < 0 || p.contract.twoWay || !inSeason(league)) return null;
  return standardRoster(league, p.tid).length <= CAP.rosterMin ? `Rosters need at least ${CAP.rosterMin} players during the season. Sign a replacement first.` : null;
}

/**
 * A minimum deal signed for the season ahead is a camp deal: like the NBA's, it isn't guaranteed
 * until opening night, so a preseason cut costs nothing.
 */
export function nonGuaranteed(league: League, p: Player): boolean {
  const c = p.contract;
  // stored salaries are rounded to $10K, so a minimum deal can sit a few $K above the minimum
  return !inSeason(league) && !c.twoWay && c.start === contractSeason(league) && salaryFor(p, c.start) <= CAP_FOR(league, c.start).vetMin + 10;
}

/**
 * Salary a release leaves on the books, by season: everything still to be paid from the current
 * contract season (next season's books in the offseason). Two-way pay sits outside the cap, camp
 * deals and an undecided team option year aren't guaranteed, so none of those leaves dead money.
 */
export function releaseDeadMoney(league: League, p: Player): { season: number; amount: number }[] {
  if (p.contract.twoWay || nonGuaranteed(league, p)) return [];
  const out: { season: number; amount: number }[] = [];
  const exp = contractExp(p.contract);
  const last = teamOptionOpen(league, p) ? exp - 1 : exp;
  for (let s = contractSeason(league); s <= last; s++) {
    const amount = salaryFor(p, s);
    if (amount > 0) out.push({ season: s, amount });
  }
  return out;
}

/** A player leaves the team: out of its rotation (order, minutes, caps, closers, rest days) and its tactics' roles. */
export function leaveTeam(team: Team, pid: number) {
  const r = team.rotation;
  r.order = r.order.filter((x) => x !== pid);
  r.closers = r.closers.filter((x) => x !== pid);
  r.restB2B = r.restB2B.filter((x) => x !== pid);
  delete r.minutes[pid];
  delete r.caps[pid];
  delete team.tactics.offense.roles[pid];
  delete team.tactics.offense.freedom[pid];
}

/** Days between a free agent's price cuts while he goes unsigned (see faDay). */
export const FA_PRICE_CUT_DAYS = 5;

export function releasePlayer(league: League, p: Player, opts: { news?: boolean } = {}) {
  const tid = p.tid;
  if (tid < 0) return;
  const team = league.teams[tid];
  for (const d of releaseDeadMoney(league, p)) team.deadMoney.push({ pid: p.pid, name: playerName(p), ...d });
  p.tid = FREE_AGENT;
  p.contract = { start: league.season, salaries: [0] };
  leaveTeam(team, p.pid);
  if (league.untouchable?.includes(p.pid)) league.untouchable = league.untouchable.filter((x) => x !== p.pid);
  // a free agent like any other: the trade-back rule and the trade lock went with the old contract
  delete p.tradedFrom;
  delete p.tradeLock;
  p.asking = undefined;
  p.asking = askingContract(league, p);
  p.faDays = FA_PRICE_CUT_DAYS;
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

/** A free agent who'd take a two-way deal from this team: young enough, and minimum-level on the open market. */
export function wantsTwoWay(league: League, p: Player, tid?: number): boolean {
  return twoWayEligible(p) && askingContract(league, p, tid).amount <= CAP_FOR(league, contractSeason(league)).vetMin + 1;
}

/** Two-way deals run two seasons, one for a player in his last season of eligibility. */
export const twoWayYears = (p: Player) => (p.experience >= 3 ? 1 : 2);

/** Promote a two-way player to a standard deal at the minimum for his remaining seasons. */
export function convertTwoWay(league: League, pid: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  if (!p || p.tid < 0 || !p.contract.twoWay) return { ok: false, reason: 'He is not on a two-way contract.' };
  const max = rosterMaxNow(league);
  const s = contractSeason(league);
  // after the season the spots are next season's: expiring deals are leaving or being re-signed
  if (standardRoster(league, p.tid).filter((x) => contractExp(x.contract) >= s).length >= max)
    return { ok: false, reason: `No open roster spot (${max}). Release or trade someone first.` };
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
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  if (league.phase !== 'resign') return { ok: false, reason: 'Options are decided during the re-signing period.' };
  if (!p || p.tid !== league.userTid || pendingOption(league, p) !== 'team') return { ok: false, reason: 'No pending team option.' };
  if (exercise) exerciseOption(p);
  else {
    dropOptionYear(p);
    p.asking = askingContract(league, p, league.userTid);
  }
  return {
    ok: true,
    reason: exercise ? `Option exercised: ${playerName(p)} is signed through next season.` : `Option declined: re-sign ${playerName(p)} now or he becomes a free agent.`,
  };
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
      text: `Player options: ${notable
        .slice(0, 6)
        .map((p) => `${playerName(p)} (${league.teams[p.tid].abbrev})`)
        .join(', ')}${notable.length > 6 ? ' and others' : ''} opt${notable.length > 1 ? '' : 's'} out.`,
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
    addInbox(league, {
      from: 'Assistant GM',
      subject: 'Team options decided',
      body: `You left these team options open, so the staff made the call:\n${staffCalls.join('\n')}`,
      tone: 'neutral',
      link: '/office',
    });
  }
}
