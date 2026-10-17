// Player valuation, contract demands and roster transactions under a simplified CBA:
// soft cap (sign FAs only with space, an exception (the mid-level, the taxpayer mid-level, the room
// exception or the bi-annual) or for the minimum), the aprons and the hard caps the exceptions bring,
// unlimited re-signing of own players, 15-man rosters, rookie scale, the buyout market's rule,
// two-way deals and their games limit, and the stretch provision for releases. The luxury tax's
// brackets are in finances.ts, trade matching by apron in trades.ts.
// Restricted free agency's rules live in rfa.ts; its holds on summer cap space are here
// (marketHolds), since every signing route counts them. The user's talks with a player (his
// walk-away price, counters, patience) are in negotiation.ts, 10-day contracts in tenDay.ts.

import type { League, Player, SigningRoute, Team } from '../types';
import { FREE_AGENT } from '../types';
import { CAP, ROOKIE_SCALE, seasonLabel } from '../constants';
import { Rng, clamp, hashString } from '../random';
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
import { numberTeam } from './jerseys';
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

/**
 * How attractive a team is to a player (0.75..1.25 multiplier on willingness), each part weighted by
 * his priorities. The user's lowballs in this season's talks with him take a little off (talksSour).
 */
export function teamAppeal(league: League, tid: number, p: Player, prefs: PlayerPrefs = playerPrefs(league, p)): number {
  const t = appealTerms(league, tid, p);
  return clamp(1 + prefs.winning * t.winning + prefs.market * t.market + prefs.role * t.role + t.mood - talksSour(league, tid, p), 0.75, 1.25);
}

/**
 * Interest in the user's team a player lost to lowballs in this contract season's talks (see
 * negotiation.ts). Only ever the user's team: AI teams' prices never move with his talks.
 */
export function talksSour(league: League, tid: number, p: Pick<Player, 'talks'>): number {
  const t = p.talks;
  return t?.sour && tid === league.userTid && t.tid === tid && t.season === contractSeason(league) ? t.sour : 0;
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
  if (wantsOut(p) && p.tid === tid) return { ok: false, reason: wantsOutReason(p) };
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
/** Taxpayer mid-level exception, as a share of the cap: for a signing the mid-level can't take without going past the first apron. */
export const TMLE_PCT = 0.037;
/** Room exception, as a share of the cap: for a team that has used its cap space, in place of the mid-level. */
export const ROOM_PCT = 0.057;
/** Bi-annual exception, as a share of the cap. */
export const BAE_PCT = 0.033;

export type Exception = 'mle' | 'tmle' | 'room' | 'bae';

/** The exceptions a team can sign free agents with over the cap: share of the cap, longest deal, names. */
export const EXCEPTIONS: Record<Exception, { pct: number; years: number; name: string; short: string }> = {
  bae: { pct: BAE_PCT, years: 2, name: 'bi-annual exception', short: 'Bi-annual' },
  tmle: { pct: TMLE_PCT, years: 2, name: 'taxpayer mid-level exception', short: 'Taxpayer mid-level' },
  room: { pct: ROOM_PCT, years: 2, name: 'room exception', short: 'Room exception' },
  mle: { pct: MLE_PCT, years: MLE_YEARS, name: 'mid-level exception', short: 'Mid-level' },
};

/**
 * The order a signing looks for an exception that covers it: the smallest first, so a cheap signing
 * doesn't use up the mid-level, and the taxpayer mid-level last: it only pays what the mid-level
 * can't without taking the team past the first apron (see exceptionCovers).
 */
export const EXCEPTION_ORDER: Exception[] = ['bae', 'room', 'mle', 'tmle'];

/** The exceptions as lists show them: the mid-levels first. */
export const EXCEPTION_LIST: Exception[] = ['mle', 'tmle', 'room', 'bae'];

export const isException = (r: SigningRoute | null | undefined): r is Exception => r === 'mle' || r === 'tmle' || r === 'room' || r === 'bae';

/** The two mid-levels: a team gets one of them a season. */
export const isMidLevel = (r: SigningRoute | null | undefined): r is 'mle' | 'tmle' => r === 'mle' || r === 'tmle';

/** Longest deal a signing route allows. */
export const routeYears = (r: SigningRoute) => (isException(r) ? EXCEPTIONS[r].years : 5);

/** An exception's full amount in a contract season. */
export const exceptionAmount = (league: League, kind: Exception, season = contractSeason(league)) =>
  Math.round((CAP_FOR(league, season).salaryCap * EXCEPTIONS[kind].pct) / 10) * 10;

/**
 * Why a team can't use this exception at all this contract season, or null (the aprons and its hard
 * cap are exceptionRoom's call). One mid-level a season, the mid-level or the taxpayer mid-level,
 * and neither once the team has signed a free agent with cap space: it gets the room exception
 * instead, once. An offer sheet it signed on cap space counts as using its space while it waits for
 * a decision (the user's pending offers on cap space do the same, see userExceptionRoom), as a
 * pending mid-level offer keeps the space shut: otherwise a team could hold its space, sign over the
 * cap with the mid-level, and then land the space signing too. The bi-annual not two seasons
 * running, and it and the room exception don't mix in a season.
 */
export function exceptionUsedReason(league: League, tid: number, kind: Exception, season = contractSeason(league)): string | null {
  const t = league.teams[tid];
  switch (kind) {
    case 'mle':
    case 'tmle':
      if ((kind === 'mle' ? t.mleSeason : t.tmleSeason) === season) return 'Used this season.';
      if ((kind === 'mle' ? t.tmleSeason : t.mleSeason) === season)
        return `Not after the ${kind === 'mle' ? 'taxpayer mid-level' : 'mid-level'}: a team gets one mid-level a season.`;
      if (t.spaceSeason === season || t.roomSeason === season) return 'Gone this season: a free agent was signed with cap space, so the room exception replaces it.';
      if (spaceSheetPending(league, tid, season)) return 'Gone while an offer sheet on cap space is pending: a team that uses its cap space gets the room exception instead.';
      return null;
    case 'room':
      if (t.roomSeason === season) return 'Used this season.';
      if (t.mleSeason === season || t.tmleSeason === season) return 'Not after a mid-level: a team gets one or the other.';
      if (t.baeSeason === season) return 'Not after the bi-annual this season.';
      if (t.spaceSeason !== season) return 'Only after signing a free agent with cap space this season (it replaces the mid-level).';
      return null;
    case 'bae':
      if (t.baeSeason === season) return 'Used this season.';
      if (t.baeSeason === season - 1) return 'Used last season: not two seasons running.';
      if (t.roomSeason === season) return 'Not after the room exception this season.';
      return null;
  }
}

/**
 * Most a team can pay one free agent with an exception this contract season: its amount (the
 * mid-level 8.5% of the cap, the room exception 5.7%, the taxpayer mid-level 3.7%, the bi-annual
 * 3.3%), and for the mid-level and the bi-annual only while the signing keeps the team at or under
 * the first apron, for the taxpayer mid-level the second, and never past a hard cap it already has
 * (see hardCap). The payroll counts the offer sheets it has signed, which land on it unless matched,
 * and `extra`: other commitments the caller counts, such as the user's pending offers. The taxpayer
 * mid-level is for a team the mid-level can't take where it would go: 0 while the mid-level pays
 * as much under the first apron. 0 when it can't be used.
 */
export function exceptionRoom(league: League, tid: number, kind: Exception, season = contractSeason(league), extra = 0): number {
  if (exceptionUsedReason(league, tid, kind, season)) return 0;
  const full = exceptionAmount(league, kind, season);
  // (a team that has just used its cap space is nowhere near the aprons)
  if (kind === 'room') return full;
  const cap = CAP_FOR(league, season);
  const sheets = marketHolds(league, tid, season).reduce((a, h) => a + (h.kind === 'sheet' ? h.amount : 0), 0);
  const committed = payroll(league, tid, season) + sheets + extra;
  const limit = Math.min(kind === 'tmle' ? cap.apron2 : cap.apron1, hardCap(league, tid, season)?.amount ?? Infinity);
  const room = Math.min(full, limit - committed);
  if (kind === 'tmle' && room <= cap.apron1 - committed) return 0;
  return Math.max(0, room);
}

/**
 * Does this exception pay one free agent `amount` this contract season (see exceptionRoom; `extra`
 * as there)? The taxpayer mid-level only pays what the mid-level can't under the first apron: a
 * signing the mid-level takes there is the mid-level's, so a team can't pick the smaller exception
 * to put its hard cap at the second apron instead.
 */
export function exceptionCovers(league: League, tid: number, kind: Exception, amount: number, season = contractSeason(league), extra = 0): boolean {
  return amount <= exceptionRoom(league, tid, kind, season, extra) && (kind !== 'tmle' || amount > exceptionRoom(league, tid, 'mle', season, extra));
}

/** Most a team can pay one free agent with its mid-level exception (see exceptionRoom): 0 once used, replaced by the room exception, or past the first apron. */
export const mleRoom = (league: League, tid: number, season = contractSeason(league)) => exceptionRoom(league, tid, 'mle', season);

/** The most any of a team's exceptions (`kinds`) would pay one free agent now. */
export const bestExceptionRoom = (league: League, tid: number, season = contractSeason(league), kinds: readonly Exception[] = EXCEPTION_ORDER) =>
  Math.max(0, ...kinds.map((k) => exceptionRoom(league, tid, k, season)));

/** A hard cap: the payroll a team can't pass by a trade or a signing this contract season, which apron it is and the exception that set it. */
export interface HardCap {
  amount: number;
  apron: 1 | 2;
  route: 'mle' | 'bae' | 'tmle';
}

/**
 * A team's hard cap for a contract season, or null: the first apron once it used the mid-level or
 * the bi-annual, the second once it used the taxpayer mid-level (the lower one when both apply; the
 * room exception sets none). No trade or signing can take its payroll past it (see
 * hardCapBlockedReason), but a minimum deal that gets it back to 13 healthy players, so a roster can
 * always be filled.
 */
export function hardCap(league: League, tid: number, season = contractSeason(league)): HardCap | null {
  const t = league.teams[tid];
  const cap = CAP_FOR(league, season);
  if (t.mleSeason === season) return { amount: cap.apron1, apron: 1, route: 'mle' };
  if (t.baeSeason === season) return { amount: cap.apron1, apron: 1, route: 'bae' };
  if (t.tmleSeason === season) return { amount: cap.apron2, apron: 2, route: 'tmle' };
  return null;
}

/** "the first apron", "the second apron". */
export const apronName = (n: 1 | 2) => `the ${n === 1 ? 'first' : 'second'} apron`;

/** The hard cap a signing on this route brings, for the inbox: " (it hard-caps us at the first apron, $209.0M, for the season)", or nothing. */
export function hardCapNote(league: League, route: SigningRoute, season = contractSeason(league)): string {
  if (route !== 'mle' && route !== 'bae' && route !== 'tmle') return '';
  const cap = CAP_FOR(league, season);
  const apron = route === 'tmle' ? 2 : 1;
  return ` (it hard-caps us at ${apronName(apron)}, $${((apron === 1 ? cap.apron1 : cap.apron2) / 1000).toFixed(1)}M, for the season)`;
}

/** Healthy players under a standard contract for a contract season: a hard-capped team short of 13 can still sign minimum deals past its hard cap. */
const healthyFor = (league: League, tid: number, season: number) => standardRoster(league, tid).filter((p) => !p.injury && contractExp(p.contract) >= season).length;

/**
 * Why a signing that adds `amount` to team `tid`'s payroll for a contract season would break its
 * hard cap (see hardCap), or null. Past it nothing goes through, Bird rights included: a minimum
 * deal, a 10-day, a waiver claim, a two-way conversion, a restricted free agent's new deal, a
 * matched offer sheet or a qualifying offer (exception signings stop at it in exceptionRoom, trades
 * in validateTrade). The payroll counts the offer sheets the team has signed, which land on it
 * unless matched. The one way past is a minimum-sized deal for a team with fewer than 13 healthy
 * players under contract that season, so a roster can always be filled.
 */
export function hardCapBlockedReason(league: League, tid: number, amount: number, season = contractSeason(league)): string | null {
  const hard = hardCap(league, tid, season);
  if (!hard || amount <= 0) return null;
  const sheets = marketHolds(league, tid, season).reduce((a, h) => a + (h.kind === 'sheet' ? h.amount : 0), 0);
  const after = payroll(league, tid, season) + sheets + amount;
  if (after <= hard.amount) return null;
  if (amount <= CAP_FOR(league, season).vetMin + 10 && healthyFor(league, tid, season) < CAP.rosterMin) return null;
  const [who, whose, them] = tid === league.userTid ? ['You are', 'your', 'you'] : [`The ${league.teams[tid].name} are`, 'their', 'them'];
  return `${who} hard-capped at ${apronName(hard.apron)} ($${(hard.amount / 1000).toFixed(1)}M) after the ${EXCEPTIONS[hard.route].name}: this would take ${whose} payroll to $${(after / 1000).toFixed(1)}M. Only a minimum deal that gets ${them} back to ${CAP.rosterMin} healthy players can go past it.`;
}

/** Where a payroll stands against the cap's lines. */
export type CapStatus = 'under' | 'over' | 'tax' | 'apron1' | 'apron2';

export function capStatus(cap: Pick<ReturnType<typeof CAP_FOR>, 'salaryCap' | 'luxuryTax' | 'apron1' | 'apron2'>, pay: number): CapStatus {
  return pay > cap.apron2 ? 'apron2' : pay > cap.apron1 ? 'apron1' : pay > cap.luxuryTax ? 'tax' : pay > cap.salaryCap ? 'over' : 'under';
}

export const CAP_STATUS_LABEL: Record<CapStatus, string> = {
  under: 'Under the cap',
  over: 'Over the cap',
  tax: 'Taxpayer',
  apron1: 'Over the 1st apron',
  apron2: 'Over the 2nd apron',
};

export type { SigningRoute };

/**
 * How a team can pay free agent `p` this much a season: the minimum (his own: the veteran minimum
 * only after 3 seasons in the league), cap space (net of what the summer market holds, see
 * marketHolds), an exception (the smallest that covers it, or `via` when that one does; given
 * `years`, only one that allows a deal that long), or not at all.
 */
export function signingRoute(
  league: League,
  tid: number,
  amount: number,
  season = contractSeason(league),
  p?: Pick<Player, 'experience'>,
  years?: number,
  via?: Exception,
): SigningRoute | null {
  const cap = CAP_FOR(league, season);
  // (a minimum deal fits over the cap, but not past a hard cap: see hardCapBlockedReason)
  if (amount <= (p && p.experience < 3 ? cap.minContract : cap.vetMin) + 1) return hardCapBlockedReason(league, tid, amount, season) ? null : 'min';
  const pay = payroll(league, tid, season);
  // (the holds are only worth adding up when the payroll alone leaves the room)
  if (pay + amount <= cap.salaryCap && pay + heldSalary(league, tid, season) + amount <= cap.salaryCap) return 'space';
  for (const k of via ? [via, ...EXCEPTION_ORDER.filter((x) => x !== via)] : EXCEPTION_ORDER)
    if ((years === undefined || years <= EXCEPTIONS[k].years) && exceptionCovers(league, tid, k, amount, season)) return k;
  return null;
}

/**
 * How an AI team pays a free agent who wants `years`: a route that allows his length if one does,
 * else the one with the longest deal it can (his length then cut to it, see routeYears). Only a
 * contender takes the taxpayer mid-level: anyone else stops at the first apron (see aiExceptions).
 */
export function aiRoute(league: League, tid: number, amount: number, season: number, p: Pick<Player, 'experience'>, years: number): SigningRoute | null {
  const r =
    signingRoute(league, tid, amount, season, p, years) ??
    (years > MLE_YEARS ? signingRoute(league, tid, amount, season, p, MLE_YEARS) : null) ??
    signingRoute(league, tid, amount, season, p);
  // (the taxpayer mid-level comes last, so nothing else would have paid him)
  return r === 'tmle' && league.teams[tid].strategy !== 'contend' ? null : r;
}

/** The exceptions an AI team signs with: a contender all of them, anyone else all but the taxpayer mid-level, whose bill only a contender pays. */
export const aiExceptions = (t: Team): Exception[] => (t.strategy === 'contend' ? EXCEPTION_ORDER : EXCEPTION_ORDER.filter((k) => k !== 'tmle'));

/** A signing used this route: cap space (then no mid-level for the rest of the season, the room exception instead) or an exception. */
export function spendRoute(league: League, tid: number, route: SigningRoute | null, season = contractSeason(league)) {
  const t = league.teams[tid];
  if (route === 'space') t.spaceSeason = season;
  else if (route === 'mle') t.mleSeason = season;
  else if (route === 'tmle') t.tmleSeason = season;
  else if (route === 'room') t.roomSeason = season;
  else if (route === 'bae') t.baeSeason = season;
}

/** A signing route in running text: "a minimum deal", "cap space", "the bi-annual exception". */
export const routeName = (r: SigningRoute) => (r === 'min' ? 'a minimum deal' : r === 'space' ? 'cap space' : `the ${EXCEPTIONS[r].name}`);

/** A team's cap space for a signing now: under the cap net of its payroll and what the summer market holds (see marketHolds). */
export function capSpace(league: League, tid: number, season = contractSeason(league)): number {
  return CAP_FOR(league, season).salaryCap - payroll(league, tid, season) - heldSalary(league, tid, season);
}

/** Something held against a team's cap space in the summer market: its restricted free agent's cap hold, or an offer sheet it signed. */
export interface MarketHold {
  p: Player;
  amount: number;
  kind: 'rfa' | 'sheet';
}

/**
 * What a team has held against its cap space in free agency besides its payroll (next season's
 * books; see rfa.ts): the cap hold of each of its restricted free agents, the larger of his
 * qualifying offer and his asking price when the market opened, until he signs or the offer is
 * withdrawn; and each offer sheet it has signed, until his team decides. Unlike the re-sign
 * period's holds these stay on through free agency, for AI teams as for the user's.
 */
export function marketHolds(league: League, tid: number, season = contractSeason(league)): MarketHold[] {
  if (league.phase !== 'freeAgency' || season !== league.season + 1) return [];
  const out: MarketHold[] = [];
  for (const p of Object.values(league.players)) {
    const r = p.rfa;
    if (!r || p.tid !== FREE_AGENT) continue;
    if (r.tid === tid) out.push({ p, amount: r.hold ?? r.qo, kind: 'rfa' });
    if (r.sheet?.tid === tid) out.push({ p, amount: r.sheet.amount, kind: 'sheet' });
  }
  return out;
}

/** Has the team signed an offer sheet on cap space that waits for a decision (see marketHolds)? */
export const spaceSheetPending = (league: League, tid: number, season = contractSeason(league)) =>
  marketHolds(league, tid, season).some((h) => h.kind === 'sheet' && h.p.rfa?.sheet?.route === 'space');

/** Total of a team's market holds (see marketHolds). */
export const heldSalary = (league: League, tid: number, season = contractSeason(league)) => marketHolds(league, tid, season).reduce((a, h) => a + h.amount, 0);

/**
 * A team's roster as the offseason limit (21) counts it: its standard players under contract for
 * next season, plus each offer sheet it has signed that waits for a decision and, for the user, each
 * pending offer to a top free agent. Those hold a spot until decided, since either can land on the
 * roster without another check: every re-signing, match, signing and conversion counts them.
 */
export function summerRoster(league: League, tid: number): number {
  const next = league.season + 1;
  const signed = standardRoster(league, tid).filter((p) => contractExp(p.contract) >= next).length;
  const sheets = marketHolds(league, tid, next).filter((h) => h.kind === 'sheet').length;
  return signed + sheets + (tid === league.userTid ? (league.faBids?.length ?? 0) : 0);
}

/** A player who asked for a trade won't sign with his team, nor while a promise only has the request on hold (see meetPlayer). */
export const wantsOut = (p: Player) => p.mood.tradeRequest || !!p.promise?.request;

/** Why he won't re-sign: he wants out, or his request is only on hold while a promise runs. */
export const wantsOutReason = (p: Player) =>
  p.mood.tradeRequest
    ? `${playerName(p)} wants out and won't re-sign.`
    : `${playerName(p)} asked for a trade: your promise has him holding off, but he won't re-sign while it stands.`;

/**
 * The payroll an AI team will go to for keeping a player worth `v`. It follows the strategy and
 * the aprons: contenders go into the tax up to the first apron, to the second for a player worth
 * 82+ and a little past it only for a franchise player (86+); retooling teams stop halfway between
 * cap and tax, rebuilders near the cap, either stretching to the tax line for an 82+ player and to
 * the first apron for a franchise player. Re-signing, extensions, qualifying offers and matching
 * offer sheets all budget with it.
 */
export function payrollBudget(cap: ReturnType<typeof CAP_FOR>, t: Team, v: number): number {
  if (t.strategy === 'contend') return v >= 86 ? cap.apron2 * 1.03 : v >= 82 ? cap.apron2 : cap.apron1;
  if (v >= 86) return cap.apron1;
  if (v >= 82) return cap.luxuryTax;
  return t.strategy === 'retool' ? (cap.salaryCap + cap.luxuryTax) / 2 : cap.salaryCap * 1.05;
}

/** Season day of December 15 (day 0 is October 20). */
export const DEC_15 = 56;

/**
 * `log: false`: the caller logs the move itself (restricted free agency's matches and qualifying
 * offers, 10-day contracts). `option`: a player or team option on the final season (the user's
 * signings only). `tenDay`: a 10-day contract, whose one salary is `amount` as given (see tenDay.ts).
 */
export function signPlayer(
  league: League,
  p: Player,
  tid: number,
  amount: number,
  years: number,
  opts: { news?: boolean; start?: number; twoWay?: boolean; log?: boolean; option?: 'player' | 'team'; tenDay?: { until: number; hardship?: boolean } } = {},
) {
  const prevTid = p.tid;
  // his own team re-signs him: from its roster, or as its restricted free agent (it kept his rights)
  const own = prevTid === tid || p.rfa?.tid === tid;
  p.tid = tid;
  p.contract = opts.tenDay
    ? { start: opts.start ?? league.season, salaries: [amount], tenDay: { ...opts.tenDay } }
    : makeContract(league, amount, years, opts.start ?? league.season, opts.twoWay ? undefined : p.experience);
  if (opts.twoWay) p.contract.twoWay = true;
  if (opts.option && years >= 2) p.contract.option = opts.option;
  // whatever he signs, his talks with the user are over
  delete p.talks;
  if (!own) {
    p.joinedSeason = league.season;
    // a new team: the trade-back rule was about his old one (a re-signing keeps it)
    delete p.tradedFrom;
  }
  // whatever he signs, restricted free agency is over (a matched offer sheet included), and so is
  // the buyout market's hold on him: waived again, it's the salary of this deal that counts
  delete p.rfa;
  delete p.waivedSalary;
  // like the NBA's: no trading him until December 15 of his first season, or three months after
  // an in-season signing if that is later (otherwise a free agent could be signed and flipped for
  // more value); a summer or training-camp signing waits for December 15
  p.tradeLock = league.phase === 'regular' ? { season: league.season, day: Math.max(DEC_15, league.day + 90) } : { season: p.contract.start, day: DEC_15 };
  p.asking = undefined;
  p.faDays = undefined;
  p.mood.tradeRequest = false;
  const team = league.teams[tid];
  if (!team.rotation.order.includes(p.pid)) team.rotation.order.push(p.pid);
  // a newcomer takes a number nobody there wears (nor has retired) now, not at the next game
  numberTeam(league, tid);
  if (opts.news !== false) {
    const verb = own ? 're-signed with' : opts.twoWay ? 'signed a two-way deal with' : 'signed with';
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
  const filler = opts.news === false || (!own && p.contract.salaries[0] <= CAP_FOR(league, p.contract.start).vetMin + 10);
  if (opts.log !== false && (!filler || tid === league.userTid))
    logMove(league, own ? 'resign' : opts.twoWay ? 'twoWay' : 'sign', tid, p, { amount: p.contract.salaries[0], years });
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
  // (a 10-day contract's pay was all paid when he signed)
  if (p.contract.twoWay || p.contract.tenDay || nonGuaranteed(league, p)) return [];
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
  // he's numbered there no more: back later, he's a newcomer (a retired number he wore stays retired)
  if (team.numbered) team.numbered = team.numbered.filter((x) => x !== pid);
  const r = team.rotation;
  r.order = r.order.filter((x) => x !== pid);
  r.closers = r.closers.filter((x) => x !== pid);
  r.restB2B = r.restB2B.filter((x) => x !== pid);
  delete r.minutes[pid];
  delete r.caps[pid];
  delete team.tactics.offense.roles[pid];
  delete team.tactics.offense.freedom[pid];
}

/** Free agency lasts FA_DAYS days: opening day is day 1 (faDay 0), so the market closes at faDay FA_DAYS - 1. */
export const FA_DAYS = 30;

/** Days between a free agent's price cuts while he goes unsigned (see faDay). */
export const FA_PRICE_CUT_DAYS = 5;

/** Days a player released in season stays on waivers. */
export const WAIVER_DAYS = 2;

/** A season of dead money; `stretched`: spread there by the stretch provision. */
export interface DeadSeason {
  season: number;
  amount: number;
  stretched?: true;
}

/**
 * The stretch provision: a release's dead money spread evenly over twice the seasons left plus one.
 * Once a season is under way (from the preseason) its salary is paid as usual and only the later
 * seasons stretch, from the next one; in the summer every season left does (as the NBA's does from
 * July 1). In $10K steps, the last season taking the rounding, so the total stays the same. Null
 * when there's nothing to stretch.
 */
export function stretchDeadMoney(league: League, dead: { season: number; amount: number }[]): DeadSeason[] | null {
  const underway = contractSeason(league) === league.season;
  const now = dead.filter((d) => underway && d.season === league.season);
  const rest = dead.filter((d) => !now.includes(d)).sort((a, b) => a.season - b.season);
  if (!rest.length) return null;
  const n = rest[rest.length - 1].season - rest[0].season + 1;
  const spread = 2 * n + 1;
  const total = rest.reduce((a, d) => a + d.amount, 0);
  const each = Math.floor(total / spread / 10) * 10;
  if (each <= 0) return null;
  const out: DeadSeason[] = now.map((d) => ({ season: d.season, amount: d.amount }));
  for (let i = 0; i < spread; i++) out.push({ season: rest[0].season + i, amount: i === spread - 1 ? total - each * (spread - 1) : each, stretched: true });
  return out;
}

/** The seasons a stretched schedule spreads over (its stretched entries). */
export const stretchedSeasons = (dead: DeadSeason[]) => dead.filter((d) => d.stretched).length;

/**
 * What releasing him leaves on the books, season by season: his guaranteed money (less what he gives
 * back in a buyout, `giveback`), stretched when asked and there's something to stretch.
 */
export function releaseSchedule(league: League, p: Player, opts: { giveback?: number; stretch?: boolean } = {}): DeadSeason[] {
  const keep = 1 - (opts.giveback ?? 0);
  const plain = releaseDeadMoney(league, p)
    .map((d) => ({ season: d.season, amount: opts.giveback ? Math.round((d.amount * keep) / 10) * 10 : d.amount }))
    .filter((d) => d.amount > 0);
  return (opts.stretch && stretchDeadMoney(league, plain)) || plain;
}

/**
 * Release a player: what's left of his guaranteed money stays on the team's books as dead money
 * (less the share he gives back in a buyout, `giveback`), or with `stretch` spread by the stretch
 * provision (see stretchDeadMoney). In the regular season a release that leaves dead money puts him
 * on waivers for WAIVER_DAYS first: another team can claim his contract and take that dead money,
 * stretched or not, off the books (see resolveWaivers). Bought-out players skip waivers, and so do
 * preseason cuts and minimum camp deals, which leave no dead money. `log: false`: the caller logs
 * the move itself (a buyout, a 10-day contract that ended).
 */
export function releasePlayer(league: League, p: Player, opts: { news?: boolean; giveback?: number; stretch?: boolean; log?: boolean } = {}) {
  const tid = p.tid;
  if (tid < 0) return;
  const team = league.teams[tid];
  const dead = releaseSchedule(league, p, opts);
  const spread = stretchedSeasons(dead);
  for (const d of dead) team.deadMoney.push({ pid: p.pid, name: playerName(p), ...d });
  const waive = league.phase === 'regular' && opts.giveback === undefined && dead.length > 0;
  const contract = p.contract;
  const lock = p.tradeLock;
  p.tid = FREE_AGENT;
  p.contract = { start: league.season, salaries: [0] };
  leaveTeam(team, p.pid);
  if (league.untouchable?.includes(p.pid)) league.untouchable = league.untouchable.filter((x) => x !== p.pid);
  // a free agent like any other: the trade-back rule and the trade lock went with the old contract,
  // his old team's rights to him (a qualifying offer) with it, and, as after a trade, what his old
  // GM promised him and their meetings stay behind
  delete p.tradedFrom;
  delete p.tradeLock;
  delete p.rfa;
  delete p.promise;
  delete p.meeting;
  if (waive) p.waivers = { from: tid, until: league.day + WAIVER_DAYS, contract, dead, ...(lock ? { lock } : {}) };
  else delete p.waivers;
  // waived or bought out in the regular season off a deal paying more than the mid-level: the
  // buyout market's rule follows him for the rest of it (see buyoutBlockedReason)
  const before = contract.twoWay ? 0 : salaryFor({ contract }, league.season);
  if (league.phase === 'regular' && before > exceptionAmount(league, 'mle', league.season)) p.waivedSalary = { season: league.season, salary: before };
  else delete p.waivedSalary;
  // a free agent again: whatever he was talking about with the user is over
  delete p.talks;
  p.asking = undefined;
  p.asking = askingContract(league, p);
  p.faDays = FA_PRICE_CUT_DAYS;
  if (opts.news !== false) addNews(league, { kind: 'release', text: `The ${team.name} ${waive ? 'waived' : 'released'} ${playerName(p)}.`, tids: [tid], pids: [p.pid] });
  // (a buyout logs itself)
  if ((opts.news !== false || tid === league.userTid) && opts.giveback === undefined && opts.log !== false)
    logMove(league, waive ? 'waive' : 'release', tid, p, { amount: dead.reduce((a, d) => a + d.amount, 0) || undefined, ...(spread ? { note: 'stretched', years: spread } : {}) });
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
 * spot and either cap room for this season's salary or a minimum salary, as a signing would (and
 * like one it can't take a hard-capped team past its hard cap, or break the buyout market's rule),
 * and like a signing it is made in the regular season: once the postseason starts, a player still
 * on waivers clears to free agency (see resolveWaivers).
 */
export function claimBlockedReason(league: League, tid: number, p: Player): string | null {
  const w = p.waivers;
  if (!w || p.tid !== FREE_AGENT) return `${playerName(p)} isn't on waivers.`;
  if (tid === w.from) return "A team can't claim a player it released.";
  if (tid === league.userTid && league.fired) return FIRED_REASON;
  if (league.phase !== 'regular') return 'Waiver claims close with the regular season, as signings do.';
  if (standardRoster(league, tid).length >= CAP.rosterMax) return `No open roster spot (${CAP.rosterMax}). Release someone first.`;
  const cap = CAP_FOR(league, league.season);
  const salary = waiverSalary(league, p);
  const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
  const room = cap.salaryCap - payroll(league, tid, league.season);
  if (salary > min + 10 && salary > room)
    return `His ${seasonLabel(league.season)} salary is $${(salary / 1000).toFixed(1)}M: claiming him needs that much cap space (${room > 0 ? `$${(room / 1000).toFixed(1)}M` : 'none'} now).`;
  return hardCapBlockedReason(league, tid, salary, league.season) ?? buyoutBlockedReason(league, tid, p, salary);
}

/**
 * The buyout market's rule, as in the NBA: a player waived (or bought out) during this regular
 * season off a deal that paid him more than the mid-level can't join a team whose payroll would be
 * over the first apron with `amount` (his new salary, or the contract a claim takes over) added,
 * by any signing or a waiver claim. Why team `tid` can't add him, or null. Summer signings are for
 * next season, which the rule doesn't reach.
 */
export function buyoutBlockedReason(league: League, tid: number, p: Player, amount: number): string | null {
  const w = p.waivedSalary;
  if (!w || w.season !== contractSeason(league) || w.salary <= exceptionAmount(league, 'mle', w.season)) return null;
  const apron = CAP_FOR(league, w.season).apron1;
  if (payroll(league, tid, w.season) + amount <= apron) return null;
  return `${playerName(p)} was waived this season off a $${(w.salary / 1000).toFixed(1)}M deal, more than the mid-level: a team over the first apron ($${(apron / 1000).toFixed(1)}M) with him on its payroll can't add him.`;
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
  delete p.waivedSalary;
  delete p.talks;
  p.asking = undefined;
  p.faDays = undefined;
  if (!team.rotation.order.includes(p.pid)) team.rotation.order.push(p.pid);
  numberTeam(league, tid);
  addNews(league, { kind: 'signing', text: `The ${team.region} ${team.name} claimed ${playerName(p)} off waivers from the ${old.name}.`, tids: [tid, w.from], pids: [p.pid] });
  logMove(league, 'claim', [tid, w.from], p, { amount: salaryFor(p, league.season), years: contractExp(p.contract) - league.season + 1 });
}

/**
 * Players whose waiver days are up go to the first team in waiver order (the worst record first)
 * that claims them: the user's team when he has put in a claim, an AI team when the contract is
 * worth having and it fits. The rest clear to free agency. Claims are made in the regular season,
 * as signings are: once it's over (the play-in and playoffs included) everyone left clears.
 */
export function resolveWaivers(league: League) {
  const claims = league.phase === 'regular';
  const due = onWaivers(league).filter((p) => p.waivers!.until <= league.day || !claims);
  if (!due.length) return;
  const order = waiverOrder(league);
  const user = league.userTid;
  for (const p of due) {
    const w = p.waivers!;
    const dead = w.dead.reduce((a, d) => a + d.amount, 0);
    const claimer = claims ? order.find((t) => t.tid !== w.from && (t.tid === user ? !!w.claim && !claimBlockedReason(league, user, p) : aiClaims(league, t, p))) : undefined;
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

/**
 * Buy out one of the user's veterans: released at once (no waivers), with the dead money cut by what
 * he gives back, and with `stretch` what's left spread by the stretch provision.
 */
export function userBuyout(league: League, pid: number, stretch = false): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  if (!p || p.tid !== league.userTid) return { ok: false, reason: 'Not on your team.' };
  const blocked = releaseBlockedReason(league, p);
  if (blocked) return { ok: false, reason: blocked };
  const terms = buyoutTerms(league, p);
  if (!terms) return { ok: false, reason: `${playerName(p)} isn't a buyout candidate: buyouts are for veterans (28+) with guaranteed money left.` };
  const team = league.teams[p.tid];
  const spread = stretch ? stretchedSeasons(releaseSchedule(league, p, { giveback: terms.giveback, stretch })) : 0;
  releasePlayer(league, p, { news: false, giveback: terms.giveback, stretch });
  addNews(league, {
    kind: 'release',
    text: `The ${team.name} bought out ${playerName(p)}, who gave back $${(terms.saved / 1000).toFixed(1)}M.`,
    tids: [team.tid],
    pids: [p.pid],
  });
  logMove(league, 'buyout', team.tid, p, { amount: terms.saved, ...(spread ? { note: 'stretched', years: spread } : {}) });
  return {
    ok: true,
    reason: `${playerName(p)} takes the buyout: he gives back $${(terms.saved / 1000).toFixed(1)}M, and $${(terms.dead / 1000).toFixed(1)}M stays on your books${spread ? `, ${stretchPhrase(league, spread)}` : ''}.`,
  };
}

/** How a stretched release reads: "stretched over 5 seasons", or once a season is under way "this season's as usual, the rest stretched over 5 seasons". */
export const stretchPhrase = (league: League, seasons: number) =>
  `${contractSeason(league) === league.season ? "this season's as usual and the rest " : ''}stretched over ${seasons} seasons`;

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

/**
 * A free agent who'd take a two-way deal from this team: young enough, and minimum-level on the
 * open market. Not a restricted free agent: his team holds his rights (an offer sheet or a
 * re-signing, see rfa.ts).
 */
export function wantsTwoWay(league: League, p: Player, tid?: number): boolean {
  return !p.rfa && twoWayEligible(p) && askingContract(league, p, tid).amount <= CAP_FOR(league, contractSeason(league)).vetMin + 1;
}

/** Two-way deals run two seasons, one for a player in his last season of eligibility. */
export const twoWayYears = (p: Player) => (p.experience >= 3 ? 1 : 2);

/** Regular-season games a two-way player can play in a season (the NBA's active-list limit): then he sits until he's converted to a standard contract. */
export const TWO_WAY_GAMES = 50;
/** When the user hears that one of his two-way players is near the limit (and again when he reaches it). */
export const TWO_WAY_WARN = 40;

/** Regular-season games he has played this season, for every team (Cup group games and knockouts included, the championship not, as in the stats). */
export function seasonGames(p: Pick<Player, 'stats'>, season: number): number {
  let n = 0;
  for (const s of p.stats) if (s.season === season && !s.playoffs && !s.real) n += s.gp;
  return n;
}

/** A two-way player who has played his TWO_WAY_GAMES this season: he can't play another regular-season game on that deal. */
export const twoWayLimitReached = (league: League, p: Player) => !!p.contract.twoWay && seasonGames(p, league.season) >= TWO_WAY_GAMES;

/** After a regular-season game he played in: the user hears when one of his two-way players has used 40 of his 50 games, and when he has used them all. */
export function twoWayGamesNote(league: League, p: Player) {
  if (p.tid !== league.userTid || !p.contract.twoWay) return;
  const n = seasonGames(p, league.season);
  if (n !== TWO_WAY_WARN && n !== TWO_WAY_GAMES) return;
  const name = playerName(p);
  const convert = 'Convert him to a standard contract (a roster spot, at the minimum) to keep playing him.';
  addInbox(league, {
    from: 'Assistant GM',
    subject: n === TWO_WAY_GAMES ? `${name} reached the two-way limit` : `${name}: ${TWO_WAY_GAMES - n} two-way games left`,
    body:
      n === TWO_WAY_GAMES
        ? `${name} has played his ${TWO_WAY_GAMES} games on a two-way deal, so he sits out the rest of the regular season. ${convert}`
        : `${name} has played ${n} of the ${TWO_WAY_GAMES} regular-season games a two-way deal allows. After the ${TWO_WAY_GAMES}th he can't play. ${convert}`,
    tone: n === TWO_WAY_GAMES ? 'alert' : 'neutral',
    link: `/player/${p.pid}`,
  });
}

/** Minutes a game, over his regular-season games this season, from which an AI team counts on a two-way player (see aiTwoWayLimits). */
const TWO_WAY_RELIED_MPG = 10;

/**
 * Every day of the regular season: an AI team converts a two-way player who has reached his games
 * limit to a standard contract when it relies on him (10+ minutes a game) and has a roster spot for
 * him (and room for his minimum under a hard cap); otherwise he sits out the rest of the regular
 * season (see buildSimInput). The user's two-way players are his call: the inbox says when one
 * nears the limit (see twoWayGamesNote).
 */
export function aiTwoWayLimits(league: League) {
  if (league.phase !== 'regular') return;
  for (const p of Object.values(league.players)) {
    if (p.tid < 0 || p.tid === league.userTid || !twoWayLimitReached(league, p)) continue;
    const rows = p.stats.filter((s) => s.season === league.season && !s.playoffs && !s.real);
    const min = rows.reduce((a, s) => a + s.min, 0);
    if (min < TWO_WAY_RELIED_MPG * seasonGames(p, league.season) || standardRoster(league, p.tid).length >= CAP.rosterMax) continue;
    // (convertTwoWay turns it down when the minimum would take a hard-capped team past its hard cap)
    convertTwoWay(league, p.pid);
  }
}

/** Promote a two-way player to a standard deal at the minimum for his remaining seasons (a roster spot, and room under a hard cap as a minimum signing needs). */
export function convertTwoWay(league: League, pid: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (league.fired && p?.tid === league.userTid) return { ok: false, reason: FIRED_REASON };
  if (!p || p.tid < 0 || !p.contract.twoWay) return { ok: false, reason: 'He is not on a two-way contract.' };
  const max = rosterMaxNow(league);
  const s = contractSeason(league);
  // after the season the spots are next season's: expiring deals are leaving or being re-signed, and
  // pending offer sheets (and the user's offers) hold theirs
  if ((s > league.season ? summerRoster(league, p.tid) : standardRoster(league, p.tid).filter((x) => contractExp(x.contract) >= s).length) >= max)
    return { ok: false, reason: `No open roster spot (${max}). Release or trade someone first.` };
  const exp = contractExp(p.contract);
  if (exp < s) return { ok: false, reason: 'His contract is up. Re-sign him to a standard deal instead.' };
  const min = (season: number) => (p.experience >= 3 ? CAP_FOR(league, season).vetMin : CAP_FOR(league, season).minContract);
  // his minimum joins the payroll, as a minimum signing's would: not past a hard cap
  const hard = hardCapBlockedReason(league, p.tid, min(s), s);
  if (hard) return { ok: false, reason: hard };
  p.contract = { start: s, salaries: Array.from({ length: exp - s + 1 }, (_, i) => min(s + i)), converted: true };
  // like a minimum signing, it doesn't count against the user's pending free-agent offers on cap space (see slackForBids)
  if (p.tid === league.userTid) for (const b of league.faBids ?? []) if (b.route === 'space') b.slack = (b.slack ?? 0) + p.contract.salaries[0];
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
  if (p.promise?.request) return `${playerName(p)} asked for a trade: while your promise has it on hold, he won't sign an extension.`;
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
  // (the user's extension talks with him are over: see userExtend in negotiation.ts)
  delete p.talks;
}
