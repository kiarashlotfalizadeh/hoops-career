// Player valuation, contract demands and roster transactions under a simplified CBA:
// soft cap (sign FAs only with space, the mid-level exception or for the minimum), unlimited
// re-signing of own players, luxury tax, 15-man rosters, rookie scale, 125% trade salary matching.

import type { League, Player, Team } from '../types';
import { FREE_AGENT } from '../types';
import { CAP, ROOKIE_SCALE, seasonLabel } from '../constants';
import { Rng, clamp, hashString } from '../random';
import { contractExp, extensionStart, salaryFor } from '../playerGen';
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
import { logMove } from './transactions';

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
  // contract surplus/burden season by season over up to four still to be paid (from next season's
  // books in the offseason), a signed extension's included. A later salary counts in this season's
  // money: the cap, and what he'd earn on the market, grow every season.
  const cs = contractSeason(league);
  const exp = contractExp(p.contract);
  const market = marketSalary(league, p);
  // an undecided team option (the last year) can be declined, so it never counts as a burden
  const optionSeason = teamOptionOpen(league, p) ? exp : null;
  let surplus = 0;
  for (let s = cs; s < cs + Math.min(4, Math.max(1, exp - cs + 1)); s++) {
    const x = (market - (salaryFor(p, s) * revenueScale(league, cs)) / revenueScale(league, s)) / 1000;
    if (s !== optionSeason || x >= 0) surplus += x;
  }
  return v + surplus * SURPLUS_VALUE[strategy];
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

/** What a player weighs in choosing a team, each around 1 (their mean is 1). */
export interface PlayerPrefs {
  winning: number;
  money: number;
  /** Playing time: minutes available on the roster. */
  role: number;
  /** Market size and buzz. */
  market: number;
}

export const PREF_KEYS = ['winning', 'money', 'role', 'market'] as const;

/** Everyone weighing everything the same: what teamAppeal was before players had priorities. */
export const EVEN_PREFS: PlayerPrefs = { winning: 1, money: 1, role: 1, market: 1 };

/**
 * A player's priorities, fixed for the league (a hash of its id and his): each weight is drawn
 * from 0.4 to 1.6 and the four are scaled to a mean of 1, so across players each averages 1 and
 * the market as a whole prices teams as it did before priorities.
 */
export function playerPrefs(league: League, p: Pick<Player, 'pid'>): PlayerPrefs {
  const rng = new Rng(hashString(`${league.id}:${p.pid}:prefs`));
  const raw = PREF_KEYS.map(() => 0.4 + rng.next() * 1.2);
  const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
  const [winning, money, role, market] = raw.map((x) => x / mean);
  return { winning, money, role, market };
}

/**
 * The parts of a team's appeal to a player, before his priorities weigh them: winning (this
 * season's record once 10 games are in, else last season's), market (hype and size), role (is he
 * better than the team's current rotation?) and, on his current team, his mood.
 */
export function appealTerms(league: League, tid: number, p: Player): { winning: number; market: number; role: number; mood: number; wp: number; rank: number } {
  const team = league.teams[tid];
  const ts = curTeamSeason(league, tid);
  const games = ts.won + ts.lost;
  const prev = team.seasons.find((s) => s.season === league.season - 1);
  const wp = games >= 10 ? winPct(ts) : prev ? winPct(prev) : 0.5;
  const roster = teamPlayers(league, tid)
    .filter((x) => x.pid !== p.pid)
    .sort((x, y) => y.ovr - x.ovr);
  const rank = roster.filter((x) => x.ovr > p.ovr).length;
  return {
    winning: (wp - 0.5) * 0.35,
    market: (team.hype - 0.5) * 0.15 + Math.min(0.06, (team.pop - 3) * 0.01),
    role: rank <= 4 ? 0.06 : rank >= 9 ? -0.08 : 0,
    // current team: mood matters
    mood: p.tid === tid ? p.mood.score * 0.02 : 0,
    wp,
    rank,
  };
}

/** How attractive a team is to a player (0.75..1.25 multiplier on willingness), each part weighted by his priorities. */
export function teamAppeal(league: League, tid: number, p: Player, prefs: PlayerPrefs = playerPrefs(league, p)): number {
  const t = appealTerms(league, tid, p);
  return clamp(1 + prefs.winning * t.winning + prefs.market * t.market + prefs.role * t.role + t.mood, 0.75, 1.25);
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
  if (prevTid !== tid) {
    p.joinedSeason = league.season;
    // a new team: the trade-back rule was about his old one (a re-signing keeps it)
    delete p.tradedFrom;
  }
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
  // the transaction log leaves out AI teams' roster filler: quiet fills (no news) and new minimum
  // deals, camp bodies most of whom are cut on opening night
  const filler = opts.news === false || (prevTid !== tid && p.contract.salaries[0] <= CAP_FOR(league, p.contract.start).vetMin + 10);
  if (!filler || tid === league.userTid) logMove(league, prevTid === tid ? 'resign' : opts.twoWay ? 'twoWay' : 'sign', tid, p, { amount: p.contract.salaries[0], years });
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

/** Days a player released in season stays on waivers. */
export const WAIVER_DAYS = 2;

/**
 * Release a player: what's left of his guaranteed money stays on the team's books as dead money
 * (less the share he gives back in a buyout, `giveback`). In the regular season a release that
 * leaves dead money puts him on waivers for WAIVER_DAYS first: another team can claim his contract
 * and take that dead money off the books (see resolveWaivers). Bought-out players skip waivers,
 * and so do preseason cuts and minimum camp deals, which leave no dead money.
 */
export function releasePlayer(league: League, p: Player, opts: { news?: boolean; giveback?: number } = {}) {
  const tid = p.tid;
  if (tid < 0) return;
  const team = league.teams[tid];
  const keep = 1 - (opts.giveback ?? 0);
  const dead = releaseDeadMoney(league, p)
    .map((d) => ({ season: d.season, amount: opts.giveback ? Math.round((d.amount * keep) / 10) * 10 : d.amount }))
    .filter((d) => d.amount > 0);
  for (const d of dead) team.deadMoney.push({ pid: p.pid, name: playerName(p), ...d });
  const waive = league.phase === 'regular' && opts.giveback === undefined && dead.length > 0;
  const contract = p.contract;
  const lock = p.tradeLock;
  p.tid = FREE_AGENT;
  p.contract = { start: league.season, salaries: [0] };
  leaveTeam(team, p.pid);
  if (league.untouchable?.includes(p.pid)) league.untouchable = league.untouchable.filter((x) => x !== p.pid);
  // a free agent like any other: the trade-back rule and the trade lock went with the old contract
  delete p.tradedFrom;
  delete p.tradeLock;
  if (waive) p.waivers = { from: tid, until: league.day + WAIVER_DAYS, contract, dead, ...(lock ? { lock } : {}) };
  else delete p.waivers;
  p.asking = undefined;
  p.asking = askingContract(league, p);
  p.faDays = FA_PRICE_CUT_DAYS;
  if (opts.news !== false) addNews(league, { kind: 'release', text: `The ${team.name} ${waive ? 'waived' : 'released'} ${playerName(p)}.`, tids: [tid], pids: [p.pid] });
  // (a buyout logs itself)
  if ((opts.news !== false || tid === league.userTid) && opts.giveback === undefined)
    logMove(league, waive ? 'waive' : 'release', tid, p, { amount: dead.reduce((a, d) => a + d.amount, 0) || undefined });
}

// ---------------------------------------------------------------- waivers

/** Players on waivers, soonest to clear first. */
export function onWaivers(league: League): Player[] {
  return Object.values(league.players)
    .filter((p) => p.tid === FREE_AGENT && p.waivers)
    .sort((a, b) => a.waivers!.until - b.waivers!.until || a.pid - b.pid);
}

/** This season's salary on the contract a waiver claim takes over. */
export const waiverSalary = (league: League, p: Player) => (p.waivers ? salaryFor({ contract: p.waivers.contract }, league.season) : 0);

/** Waiver priority: the worst record first (ties by team id). */
export function waiverOrder(league: League): Team[] {
  return [...league.teams].sort((a, b) => winPct(curTeamSeason(league, a.tid)) - winPct(curTeamSeason(league, b.tid)) || a.tid - b.tid);
}

/**
 * Why team `tid` can't claim him, or null. A claim takes over his contract, so it needs a roster
 * spot and either cap room for this season's salary or a minimum salary, as a signing would.
 */
export function claimBlockedReason(league: League, tid: number, p: Player): string | null {
  const w = p.waivers;
  if (!w || p.tid !== FREE_AGENT) return `${playerName(p)} isn't on waivers.`;
  if (tid === w.from) return "A team can't claim a player it released.";
  if (tid === league.userTid && league.fired) return FIRED_REASON;
  if (standardRoster(league, tid).length >= CAP.rosterMax) return `No open roster spot (${CAP.rosterMax}). Release someone first.`;
  const cap = CAP_FOR(league, league.season);
  const salary = waiverSalary(league, p);
  const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
  const room = cap.salaryCap - payroll(league, tid, league.season);
  if (salary > min + 10 && salary > room)
    return `His ${seasonLabel(league.season)} salary is $${(salary / 1000).toFixed(1)}M: claiming him needs that much cap space (${room > 0 ? `$${(room / 1000).toFixed(1)}M` : 'none'} now).`;
  return null;
}

/** An AI team claims a player whose contract is worth having (positive trade value to it) and who'd make its roster: 64+ in value, or anyone when it's short of 13. */
function aiClaims(league: League, t: Team, p: Player): boolean {
  if (claimBlockedReason(league, t.tid, p)) return false;
  if (standardRoster(league, t.tid).length >= CAP.rosterMin && valueScore(league, p) < 64) return false;
  return tradeValue(league, { ...p, contract: p.waivers!.contract }, t.strategy) > 0;
}

/** Team `tid` takes over his contract; his old team's dead money for him comes off its books. */
function claimPlayer(league: League, p: Player, tid: number) {
  const w = p.waivers!;
  const old = league.teams[w.from];
  for (const d of w.dead) {
    const i = old.deadMoney.findIndex((x) => x.pid === p.pid && x.season === d.season && x.amount === d.amount);
    if (i >= 0) old.deadMoney.splice(i, 1);
  }
  const team = league.teams[tid];
  p.tid = tid;
  p.contract = w.contract;
  p.joinedSeason = league.season;
  // the contract comes with its trade lock (a deal signed this season still can't be traded or
  // extended yet), and a fresh start: whatever soured him on his old team stays there
  if (w.lock) p.tradeLock = { ...w.lock };
  p.mood.tradeRequest = false;
  p.mood.score = Math.max(p.mood.score, 0);
  delete p.waivers;
  p.asking = undefined;
  p.faDays = undefined;
  if (!team.rotation.order.includes(p.pid)) team.rotation.order.push(p.pid);
  addNews(league, { kind: 'signing', text: `The ${team.region} ${team.name} claimed ${playerName(p)} off waivers from the ${old.name}.`, tids: [tid, w.from], pids: [p.pid] });
  logMove(league, 'claim', [tid, w.from], p, { amount: salaryFor(p, league.season), years: contractExp(p.contract) - league.season + 1 });
}

/**
 * Players whose waiver days are up go to the first team in waiver order (the worst record first)
 * that claims them: the user's team when he has put in a claim, an AI team when the contract is
 * worth having and it fits. The rest clear to free agency. Outside the season everyone clears.
 */
export function resolveWaivers(league: League) {
  const due = onWaivers(league).filter((p) => p.waivers!.until <= league.day || !inSeason(league));
  if (!due.length) return;
  const order = waiverOrder(league);
  const user = league.userTid;
  for (const p of due) {
    const w = p.waivers!;
    const dead = w.dead.reduce((a, d) => a + d.amount, 0);
    const claimer = inSeason(league)
      ? order.find((t) => t.tid !== w.from && (t.tid === user ? !!w.claim && !claimBlockedReason(league, user, p) : aiClaims(league, t, p)))
      : undefined;
    const name = playerName(p);
    if (claimer) {
      // (read before the claim moves him)
      const yourClaimFailed = w.claim && claimer.tid !== user ? claimBlockedReason(league, user, p) : null;
      claimPlayer(league, p, claimer.tid);
      if (w.from === user)
        addInbox(league, {
          from: 'Assistant GM',
          subject: `${name} claimed off waivers`,
          body: `The ${teamNameOf(league, claimer.tid)} claimed ${name} and took over his contract, so the $${(dead / 1000).toFixed(1)}M in dead money he left comes off our books.`,
          tone: 'good',
          link: '/office',
        });
      else if (claimer.tid === user)
        addInbox(league, {
          from: 'Assistant GM',
          subject: `${name} claimed`,
          body: `Our waiver claim on ${name} went through: his contract ($${(salaryFor(p, league.season) / 1000).toFixed(1)}M this season, through ${seasonLabel(contractExp(p.contract))}) is ours, and the ${league.teams[w.from].name} are off the hook for it.`,
          tone: 'good',
          link: `/player/${p.pid}`,
        });
      else if (w.claim)
        addInbox(league, {
          from: 'Assistant GM',
          subject: `${name} went elsewhere`,
          body: yourClaimFailed
            ? `Our claim on ${name} fell through (${yourClaimFailed}) and the ${teamNameOf(league, claimer.tid)} claimed him.`
            : `The ${teamNameOf(league, claimer.tid)} claimed ${name} ahead of us: worse records come first in the waiver order.`,
          tone: 'neutral',
          link: `/player/${p.pid}`,
        });
      continue;
    }
    delete p.waivers;
    if (w.from === user || w.claim)
      addInbox(league, {
        from: 'Assistant GM',
        subject: `${name} cleared waivers`,
        body:
          w.from === user
            ? `Nobody claimed ${name}, so he is a free agent and his $${(dead / 1000).toFixed(1)}M stays on our books as dead money.`
            : `Our claim on ${name} fell through (${claimBlockedReason(league, user, { ...p, waivers: w }) ?? 'the claim no longer fit'}). He is a free agent now.`,
        tone: 'neutral',
        link: w.from === user ? '/office' : `/player/${p.pid}`,
      });
  }
}

const teamNameOf = (league: League, tid: number) => `${league.teams[tid].region} ${league.teams[tid].name}`;

/** Put in (or withdraw) the user's claim on a player on waivers; it is decided when he clears, in waiver order. */
export function userClaim(league: League, pid: number, claim = true): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  if (!p?.waivers) return { ok: false, reason: 'He is not on waivers.' };
  if (!claim) {
    delete p.waivers.claim;
    return { ok: true, reason: `Claim on ${playerName(p)} withdrawn.` };
  }
  const why = claimBlockedReason(league, league.userTid, p);
  if (why) return { ok: false, reason: why };
  p.waivers.claim = true;
  const days = Math.max(0, p.waivers.until - league.day);
  return { ok: true, reason: `Claim in on ${playerName(p)}: decided ${days > 1 ? `in ${days} days` : days === 1 ? 'tomorrow' : 'today'}, worst record first.` };
}

// ---------------------------------------------------------------- buyouts

/**
 * What a buyout would look like: a veteran (28+) with guaranteed money left gives some of it back
 * to be let go, 0-35%: more when he's unhappy or has asked out, at 32+, or when the team isn't
 * contending, plus a little that is his own (a hash, so the terms hold still). null when he isn't
 * a candidate.
 */
export function buyoutTerms(league: League, p: Player): { giveback: number; owed: number; saved: number; dead: number } | null {
  if (p.tid < 0 || p.contract.twoWay || age(league, p) < 28) return null;
  const owed = releaseDeadMoney(league, p).reduce((a, d) => a + d.amount, 0);
  if (owed <= 0) return null;
  let g = 0.02 + 0.05 * (hashString(`${league.id}:${p.pid}:buyout`) / 4294967296);
  if (p.mood.tradeRequest) g += 0.15;
  else if (p.mood.score <= -2) g += 0.1;
  if (age(league, p) >= 32) g += 0.08;
  if (league.teams[p.tid].strategy !== 'contend') g += 0.07;
  const giveback = Math.min(0.35, g);
  const dead = releaseDeadMoney(league, p).reduce((a, d) => a + Math.round((d.amount * (1 - giveback)) / 10) * 10, 0);
  return { giveback, owed, saved: owed - dead, dead };
}

/** Buy out one of the user's veterans: released at once (no waivers), with the dead money cut by what he gives back. */
export function userBuyout(league: League, pid: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  if (!p || p.tid !== league.userTid) return { ok: false, reason: 'Not on your team.' };
  const blocked = releaseBlockedReason(league, p);
  if (blocked) return { ok: false, reason: blocked };
  const terms = buyoutTerms(league, p);
  if (!terms) return { ok: false, reason: `${playerName(p)} isn't a buyout candidate: buyouts are for veterans (28+) with guaranteed money left.` };
  const team = league.teams[p.tid];
  releasePlayer(league, p, { news: false, giveback: terms.giveback });
  addNews(league, {
    kind: 'release',
    text: `The ${team.name} bought out ${playerName(p)}, who gave back $${(terms.saved / 1000).toFixed(1)}M.`,
    tids: [team.tid],
    pids: [p.pid],
  });
  logMove(league, 'buyout', team.tid, p, { amount: terms.saved });
  return {
    ok: true,
    reason: `${playerName(p)} takes the buyout: he gives back $${(terms.saved / 1000).toFixed(1)}M, and $${(terms.dead / 1000).toFixed(1)}M stays on your books.`,
  };
}

/**
 * After the trade deadline, rebuilding AI teams may buy out a veteran on an expiring deal (30+,
 * OVR 70+) so he can join a contender, about half of them, but only from a roster of 15 so it
 * stays at 14 or more until the weekly fill.
 */
export function aiBuyouts(league: League) {
  for (const t of league.teams) {
    if (t.tid === league.userTid || t.strategy !== 'rebuild') continue;
    const roster = standardRoster(league, t.tid);
    if (roster.length - 1 < 14) continue;
    const vet = roster.filter((p) => age(league, p) >= 30 && contractExp(p.contract) === league.season && p.ovr >= 70 && buyoutTerms(league, p)).sort((a, b) => b.ovr - a.ovr)[0];
    if (!vet || !new Rng(hashString(`${league.id}:${league.season}:${league.day}:buyout:${t.tid}`)).chance(0.5)) continue;
    const terms = buyoutTerms(league, vet)!;
    releasePlayer(league, vet, { news: false, giveback: terms.giveback });
    addNews(league, { kind: 'release', text: `The ${t.name} bought out ${playerName(vet)}, who gave back $${(terms.saved / 1000).toFixed(1)}M.`, tids: [t.tid], pids: [vet.pid] });
    logMove(league, 'buyout', t.tid, vet, { amount: terms.saved });
  }
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
  p.contract = { start: s, salaries: Array.from({ length: exp - s + 1 }, (_, i) => min(s + i)), converted: true };
  // like a minimum signing, it doesn't count against the user's pending free-agent offers (see slackForBids)
  if (p.tid === league.userTid) for (const b of league.faBids ?? []) if (b.route === 'space' || b.route === 'mle') b.slack = (b.slack ?? 0) + p.contract.salaries[0];
  addNews(league, { kind: 'signing', text: `The ${league.teams[p.tid].name} converted ${playerName(p)} to a standard contract.`, tids: [p.tid], pids: [p.pid] });
  logMove(league, 'convert', p.tid, p, { amount: p.contract.salaries[0], years: p.contract.salaries.length });
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
  logMove(league, 'option', p.tid, p, { amount: salaryFor(p, league.season + 1), note: exercise ? 'exercised' : 'declined' });
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
  // opt-outs that make the news
  const newsworthy = (p: Player) => p.ovr >= 74 || salaryFor(p, league.season) >= 10_000;
  for (const p of Object.values(league.players)) {
    const kind = pendingOption(league, p);
    if (!kind) continue;
    const sal = salaryFor(p, league.season + 1);
    const user = p.tid === league.userTid;
    if (kind === 'player') {
      const out = marketSalary(league, p) * rng.uniform(0.9, 1.1) > sal * 1.15;
      if (out) {
        dropOptionYear(p);
        optOuts.push(p);
      } else exerciseOption(p);
      // the log has the user's players' calls and the opt-outs in the news
      if (user || (out && newsworthy(p))) logMove(league, 'option', p.tid, p, { amount: sal, note: out ? 'opted out' : 'opted in' });
      continue;
    }
    if (user && !includeUser) continue;
    const keep = teamOptionWorth(league, p);
    if (keep) exerciseOption(p);
    else dropOptionYear(p);
    if (user) {
      staffCalls.push(`${playerName(p)}: ${keep ? 'exercised' : 'declined'} ($${(sal / 1000).toFixed(1)}M)`);
      logMove(league, 'option', p.tid, p, { amount: sal, note: keep ? 'exercised' : 'declined' });
    }
  }
  const notable = optOuts.filter(newsworthy).sort((a, b) => b.ovr - a.ovr);
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

// ---------------------------------------------------------------- extensions

/** Longest extension a player signs: five seasons coming off his rookie-scale deal, four for anyone else. */
export const extensionMaxYears = (p: Player) => (rookieScaleDeal(p) ? 5 : 4);

/** Phases extensions are signed in: from the re-signing period through the regular season. */
const EXTENSION_PHASES: League['phase'][] = ['resign', 'freeAgency', 'preseason', 'regular'];

/**
 * Why no team could extend this player now, or null: only in the final season of a standard deal
 * (next season's from the re-signing period until opening night) that he didn't sign this season,
 * once any option on it is decided, never twice, and not while he wants out. Whether he'd talk is
 * extensionRefusal's call.
 */
export function extensionClosedReason(league: League, p: Player): string | null {
  if (!EXTENSION_PHASES.includes(league.phase))
    return league.phase === 'playin' || league.phase === 'playoffs'
      ? 'No extensions during the postseason: they reopen with the re-signing period after the draft.'
      : 'Extensions reopen with the re-signing period after the draft.';
  const c = p.contract;
  if (p.tid < 0) return `${playerName(p)} isn't under contract.`;
  if (c.twoWay) return "Two-way deals can't be extended: convert him to a standard contract first.";
  const exp = contractExp(c);
  if (c.next) return `${playerName(p)} is already extended through ${seasonLabel(exp)}.`;
  const cs = contractSeason(league);
  if (exp < cs) return 'His contract is up: re-sign him in the re-signing period instead.';
  if (exp > cs) return `Extensions open in the final season of his deal (${seasonLabel(exp)}).`;
  // a signing carries a trade lock for its first season; the seed's deals all start in the
  // league's first season, but weren't signed in it
  if (c.start === cs && p.tradeLock?.season === cs) return `${playerName(p)} signed this deal this season: it can't be extended.`;
  if (pendingOption(league, p)) return `Decide his ${pendingOption(league, p)} option on ${seasonLabel(exp)} first.`;
  if (p.mood.tradeRequest) return `${playerName(p)} wants a trade: he won't sign an extension.`;
  return null;
}

/** Why the user can't extend this player now, or null (see extensionClosedReason; his answer is extensionRefusal's). */
export function extensionBlockedReason(league: League, p: Player): string | null {
  if (league.fired) return FIRED_REASON;
  if (p.tid !== league.userTid) return 'Only your own players can be extended.';
  return extensionClosedReason(league, p);
}

/**
 * What he asks to extend: his market value in the money of the extension's first season (the cap
 * grows every season), ~5% less for the security when he's coming off his rookie-scale deal or is
 * 31 or older, 5% more for a young star (27 or under, worth 82+) who knows what he'd get, then
 * moved by the difficulty and his liking for the team like any asking price. The length is the one
 * he'd want on the market, at most extensionMaxYears. Between that season's minimum and max for
 * his years in the league now (like a re-signing, the max doesn't count seasons still to play).
 */
export function extensionAsk(league: League, p: Player): Ask {
  const start = contractExp(p.contract) + 1;
  const cap = CAP_FOR(league, start);
  const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
  const years = Math.min(extensionMaxYears(p), preferredYears(league, p));
  let amount = (marketSalary(league, p) * revenueScale(league, start)) / revenueScale(league, contractSeason(league));
  if (amount <= min) return { amount: min, years };
  const a = age(league, p);
  if (rookieScaleDeal(p) || a >= 31) amount *= 0.95;
  else if (a <= 27 && valueScore(league, p) >= 82) amount *= 1.05;
  const diff = league.settings.difficulty;
  if (p.tid === league.userTid) amount *= diff === 'casual' ? 0.9 : diff === 'hard' ? 1.12 : 1;
  if (p.tid >= 0) amount /= teamAppeal(league, p.tid, p);
  return { amount: clamp(Math.round(amount / 50) * 50, min, cap.maxContract(p.experience)), years };
}

/**
 * Why he won't extend at any price, or null. An unhappy player waits for the market, and so may a
 * star (worth 80+) on a team he doesn't fancy (interest under 0.94: the less he likes it, the
 * likelier) unless he's coming off his rookie-scale deal, when his team could match any offer. The
 * star's call is one roll per contract season, so asking again gets the same answer until his
 * interest changes.
 */
export function extensionRefusal(league: League, p: Player): string | null {
  // (unhappy and furious moods: below "content")
  if (p.mood.score < -2) return `${playerName(p)} is unhappy here: he won't talk about an extension.`;
  if (p.tid < 0 || rookieScaleDeal(p) || valueScore(league, p) < 80) return null;
  const appeal = teamAppeal(league, p.tid, p);
  if (appeal >= 0.94) return null;
  const roll = new Rng(hashString(`${league.id}:${contractSeason(league)}:extension:${p.pid}`)).next();
  return roll < 0.5 + (0.94 - appeal) * 2.5 ? `${playerName(p)} wants to test free agency when his deal is up.` : null;
}

/** Would he sign this extension? As with willSign, each year away from the length he wants adds ~3% to his price. */
export function willExtend(league: League, p: Player, amount: number, years: number): { ok: boolean; reason: string } {
  const no = extensionRefusal(league, p);
  if (no) return { ok: false, reason: no };
  const maxYears = extensionMaxYears(p);
  if (years < 1 || years > maxYears) return { ok: false, reason: `His extension can run 1 to ${maxYears} years.` };
  const ask = extensionAsk(league, p);
  const need = ask.amount * (1 + Math.abs(years - ask.years) * 0.03);
  if (amount >= need - 1) return { ok: true, reason: 'Deal!' };
  return {
    ok: false,
    reason: `Asking for about $${(ask.amount / 1000).toFixed(1)}M/yr over ${ask.years} year${ask.years === 1 ? '' : 's'} (you're $${((need - amount) / 1000).toFixed(1)}M short).`,
  };
}

/**
 * Sign an extension: `years` seasons from the one after his deal ends, with 5% raises. Any option
 * on the deal is picked up (it would read as the extension's last season), and like a signing he
 * can't be traded until December 15, or three months on in season.
 */
export function extendContract(league: League, p: Player, amount: number, years: number) {
  const start = contractExp(p.contract) + 1;
  p.contract.next = { salaries: makeContract(league, amount, years, start, p.experience).salaries };
  delete p.contract.option;
  p.tradeLock = league.phase === 'regular' ? { season: league.season, day: Math.max(DEC_15, league.day + 90) } : { season: contractSeason(league), day: DEC_15 };
  const team = league.teams[p.tid];
  addNews(league, {
    kind: 'signing',
    text: `${playerName(p)} signed a ${years}-year, $${(p.contract.next.salaries.reduce((a, x) => a + x, 0) / 1000).toFixed(1)}M extension with the ${team.region} ${team.name}.`,
    tids: [p.tid],
    pids: [p.pid],
  });
  logMove(league, 'extend', p.tid, p, { amount: p.contract.next.salaries[0], years });
}

/** The user extends one of his players (see extensionBlockedReason and willExtend). */
export function userExtend(league: League, pid: number, amount: number, years: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (!p) return { ok: false, reason: 'Player not found.' };
  const blocked = extensionBlockedReason(league, p);
  if (blocked) return { ok: false, reason: blocked };
  const res = willExtend(league, p, amount, years);
  if (!res.ok) return res;
  extendContract(league, p, amount, years);
  const salaries = p.contract.next!.salaries;
  const start = extensionStart(p.contract)!;
  addInbox(league, {
    from: 'Assistant GM',
    subject: `${playerName(p)} signs a ${years}-year, $${(salaries.reduce((a, x) => a + x, 0) / 1000).toFixed(1)}M extension`,
    body: `${playerName(p)} is now signed through ${seasonLabel(contractExp(p.contract))}. The extension starts in ${seasonLabel(start)} at $${(salaries[0] / 1000).toFixed(1)}M with 5% annual raises, and counts against that season's cap; his current salary doesn't change.`,
    tone: 'good',
    link: `/player/${p.pid}`,
  });
  return { ok: true, reason: `${playerName(p)} signs his extension!` };
}
