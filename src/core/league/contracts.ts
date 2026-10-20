// Player valuation, contract demands and roster transactions under a simplified CBA:
// soft cap (sign FAs only with space, an exception (the mid-level, the room exception or the
// bi-annual) or for the minimum), unlimited re-signing of own players, luxury tax, 15-man rosters,
// rookie scale, 125% trade salary matching, and the stretch provision for releases.
// Restricted free agency's rules live in rfa.ts; its holds on summer cap space are here
// (marketHolds), since every signing route counts them. The user's talks with a player (his
// walk-away price, counters, patience) are in negotiation.ts, 10-day contracts in tenDay.ts.

import type { League, Player, SigningRoute, Team } from '../types';
import { preset } from './difficulty';
import { FREE_AGENT } from '../types';
import { CAP, ROOKIE_SCALE, seasonLabel } from '../constants';
import { Rng, clamp, hashString } from '../random';
import { contractExp, playerAge, salaryFor } from '../playerGen';
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
import { money } from '../format';

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
// would earn roughly matches the league's total cap, rising steeply at the top as the NBA's does:
// an 86 is worth a 25% max, an 89 a 30% one, a 92 the 35% one (each capped by his own max).
const SALARY_CURVE: [number, number][] = [
  [66, 0],
  [70, 0.019],
  [73, 0.038],
  [76, 0.072],
  [79, 0.106],
  [82, 0.16],
  [84, 0.21],
  [86, 0.25],
  [89, 0.3],
  [92, 0.35],
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
 * better than the team's current rotation?).
 */
export function appealTerms(league: League, tid: number, p: Player): { winning: number; market: number; role: number; wp: number; rank: number } {
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
  return clamp(1 + prefs.winning * t.winning + prefs.market * t.market + prefs.role * t.role - talksSour(league, tid, p), 0.75, 1.25);
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

// ---------------------------------------------------------------- the max and Bird rights

/** Is team `tid` his own: the one he plays for, or that holds his rights as a restricted free agent? */
const ownTeam = (p: Player, tid: number) => p.tid === tid || p.rfa?.tid === tid;

/**
 * Honors that earn a bigger max with his own team: All-NBA in his last season or two of his last
 * three, MVP in one of them, or Defensive Player of the Year in the last.
 */
export function maxHonors(league: League, p: Player): boolean {
  const last = contractSeason(league) - 1;
  const recent = p.awards.filter((a) => a.season <= last && a.season >= last - 2);
  const allNba = recent.filter((a) => a.type.startsWith('All-NBA'));
  return (
    allNba.some((a) => a.season === last) ||
    allNba.length >= 2 ||
    recent.some((a) => a.type === 'MVP') ||
    recent.some((a) => a.type === 'Defensive Player of the Year' && a.season === last)
  );
}

/**
 * The most a player can earn a season from team `tid` in `season`: 25% of the cap up to six seasons
 * in the league, 30% for seven to nine, 35% from ten. With his own team and the honors (see
 * maxHonors) a player coming off his rookie-scale deal can earn 30% (the "Rose rule"), and one with
 * seven to nine seasons 35% (the supermax).
 */
export function playerMax(league: League, p: Player, season = contractSeason(league), tid?: number): number {
  const cap = CAP_FOR(league, season);
  let pct = CAP.maxPct(p.experience);
  if (tid !== undefined && ownTeam(p, tid) && maxHonors(league, p)) {
    if (p.experience <= 6 && rookieScaleDeal(p)) pct = 0.3;
    else if (p.experience >= 7 && p.experience <= 9) pct = 0.35;
  }
  return Math.round(cap.salaryCap * pct);
}

/** A player whose market value is this share of his max or more asks the max of everyone. */
export const MAX_ASK = 0.95;

/** His Bird rights with his team: full after three seasons there, Early Bird after two, otherwise none. */
export type BirdTier = 'full' | 'early' | 'non';

/** Seasons on his Bird clock with his team by the contract season ahead (see Player.birdSince). */
export const birdSeasons = (league: League, p: Player) => contractSeason(league) - (p.birdSince ?? p.joinedSeason);

export function birdTier(league: League, p: Player): BirdTier {
  const n = birdSeasons(league, p);
  return n >= 3 ? 'full' : n === 2 ? 'early' : 'non';
}

/** League-average salary of the standard contracts in `season` ($K). */
export function averageSalary(league: League, season = contractSeason(league)): number {
  let total = 0;
  let n = 0;
  for (const p of Object.values(league.players)) {
    if (p.tid < 0 || p.contract.twoWay || p.contract.tenDay) continue;
    const s = salaryFor(p, season);
    if (s > 0) {
      total += s;
      n++;
    }
  }
  return n ? total / n : 0;
}

/**
 * The most his own team can re-sign him for, by his Bird rights: up to his max with full Bird
 * rights; with Early Bird the larger of 175% of his last salary and 105% of the league's average;
 * without them 120% of his last salary (or of the minimum).
 */
export function resignLimit(league: League, p: Player, tid: number): number {
  const cs = contractSeason(league);
  const max = playerMax(league, p, cs, tid);
  const tier = birdTier(league, p);
  if (tier === 'full') return max;
  const prior = salaryFor(p, cs - 1);
  const cap = CAP_FOR(league, cs);
  const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
  const lim = tier === 'early' ? Math.max(prior * 1.75, averageSalary(league, cs - 1) * 1.05) : Math.max(prior, min) * 1.2;
  return Math.min(max, Math.max(min, Math.floor(lim / 50) * 50));
}

/** Longest deal he signs: five years re-signing with his own team on full Bird rights, four for anyone else. */
export const maxYearsWith = (league: League, p: Player, tid: number) => (ownTeam(p, tid) && birdTier(league, p) === 'full' ? 5 : 4);

/** Raises on a deal: 8% a season re-signing with his own team on (Early) Bird rights, 5% otherwise. */
export const raiseWith = (league: League, p: Player, tid: number) => (ownTeam(p, tid) && birdTier(league, p) !== 'non' ? 0.08 : 0.05);

/**
 * What he asks of team `tid` (of the market, without one): his market value, an unsigned free
 * agent's price as it has come down (see faDay), over the years he wants. A star worth nearly the
 * max (MAX_ASK) asks his max of everyone, so his interest in a team decides where he signs (see
 * offerUtility) rather than his price; anyone else's interest moves his price up to 10% either way.
 */
export function askingContract(league: League, p: Player, tid?: number): Ask {
  const market = marketSalary(league, p);
  let amount = market;
  // unsigned free agents lower their price as the market dries up (see faDay)
  const marked = p.tid === FREE_AGENT && !!p.asking && p.asking.amount < market;
  if (marked) amount = p.asking!.amount;
  const years = Math.min(marked ? p.asking!.years : preferredYears(league, p), tid === undefined ? 5 : maxYearsWith(league, p, tid));
  const cs = contractSeason(league);
  const cap = CAP_FOR(league, cs);
  const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
  // a minimum-level player takes the minimum from anyone
  if (amount <= min) return { amount: min, years };
  const max = playerMax(league, p, cs, tid);
  if (!marked && market >= cap.maxContract(p.experience) * MAX_ASK) amount = max;
  else if (tid !== undefined) amount *= clamp(1 / teamAppeal(league, tid, p), 1 / 1.1, 1 / 0.9);
  if (tid === league.userTid) amount *= preset(league).contractAsk;
  return { amount: clamp(Math.round(amount / 50) * 50, min, max), years };
}

export function willSign(league: League, p: Player, tid: number, amount: number, years: number): { ok: boolean; reason: string } {
  const ask = askingContract(league, p, tid);
  const most = maxYearsWith(league, p, tid);
  if (years < 1 || years > most) return { ok: false, reason: `Contracts must be 1 to ${most} years.` };
  const yearPenalty = Math.abs(years - ask.years) * 0.03;
  if (amount >= ask.amount * (1 + yearPenalty) - 1) return { ok: true, reason: 'Deal!' };
  const gap = ask.amount * (1 + yearPenalty) - amount;
  return {
    ok: false,
    reason: `Asking for about ${money(ask.amount)}/yr over ${ask.years} year${ask.years === 1 ? '' : 's'} (you're ${money(gap)} short).`,
  };
}

/**
 * Pass `experience` to keep the rounded first-year salary inside that player's min/max (`max`: his
 * own, when it isn't his years' standard max, see playerMax). `raise`: each season's raise (5%, or
 * 8% re-signing on Bird rights, see raiseWith).
 */
export function makeContract(league: League, amount: number, years: number, start = league.season, experience?: number, opts: { raise?: number; max?: number } = {}) {
  const salaries: number[] = [];
  const raise = 1 + (opts.raise ?? 0.05);
  for (let i = 0; i < years; i++) salaries.push(Math.round((amount * Math.pow(raise, i)) / 10) * 10);
  if (experience !== undefined) {
    const min = (season: number) => (experience >= 3 ? CAP_FOR(league, season).vetMin : CAP_FOR(league, season).minContract);
    // clamp after rounding: a max deal rounded to $10K would otherwise exceed the max by a few $K
    salaries[0] = clamp(salaries[0], min(start), opts.max ?? CAP_FOR(league, start).maxContract(experience));
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
/** Room exception, as a share of the cap: for a team that has used its cap space, in place of the mid-level. */
export const ROOM_PCT = 0.057;
/** Bi-annual exception, as a share of the cap. */
export const BAE_PCT = 0.033;
/** Taxpayer mid-level exception, as a share of the cap: the mid-level for a team it takes past the first apron. */
export const TMLE_PCT = 0.037;

export type Exception = 'mle' | 'tmle' | 'room' | 'bae';

/** The exceptions a team can sign free agents with over the cap: share of the cap, longest deal, names. */
export const EXCEPTIONS: Record<Exception, { pct: number; years: number; name: string; short: string }> = {
  bae: { pct: BAE_PCT, years: 2, name: 'bi-annual exception', short: 'Bi-annual' },
  room: { pct: ROOM_PCT, years: 2, name: 'room exception', short: 'Room exception' },
  mle: { pct: MLE_PCT, years: MLE_YEARS, name: 'mid-level exception', short: 'Mid-level' },
  tmle: { pct: TMLE_PCT, years: 2, name: 'taxpayer mid-level exception', short: 'Taxpayer mid-level' },
};

/**
 * The order a signing looks for an exception that covers it: the smallest first, so a cheap signing
 * doesn't use up the mid-level, and the taxpayer mid-level last: only when the full one can't stay
 * under the first apron.
 */
export const EXCEPTION_ORDER: Exception[] = ['bae', 'room', 'mle', 'tmle'];

export const isException = (r: SigningRoute | null | undefined): r is Exception => r === 'mle' || r === 'tmle' || r === 'room' || r === 'bae';

/** Longest deal a signing route allows. */
export const routeYears = (r: SigningRoute) => (isException(r) ? EXCEPTIONS[r].years : 5);

/** An exception's full amount in a contract season. */
export const exceptionAmount = (league: League, kind: Exception, season = contractSeason(league)) =>
  Math.round((CAP_FOR(league, season).salaryCap * EXCEPTIONS[kind].pct) / 10) * 10;

/**
 * Why a team can't use this exception at all this contract season, or null (the tax line is
 * exceptionRoom's call). The mid-level once a season, and not once the team has signed a free agent
 * with cap space: it gets the room exception instead, once. An offer sheet it signed on cap space
 * counts as using its space while it waits for a decision (the user's pending offers on cap space
 * do the same, see userExceptionRoom), as a pending mid-level offer keeps the space shut: otherwise
 * a team could hold its space, sign over the cap with the mid-level, and then land the space
 * signing too. The bi-annual not two seasons running, and it and the room exception don't mix in
 * a season.
 */
export function exceptionUsedReason(league: League, tid: number, kind: Exception, season = contractSeason(league)): string | null {
  return exceptionClosed(league, tid, kind, season)?.why ?? null;
}

/** The same reason in a few words for a cap sheet's line ("used", "used last season"), or null. */
export function exceptionUsedShort(league: League, tid: number, kind: Exception, season = contractSeason(league)): string | null {
  return exceptionClosed(league, tid, kind, season)?.short ?? null;
}

function exceptionClosed(league: League, tid: number, kind: Exception, season: number): { why: string; short: string } | null {
  const t = league.teams[tid];
  const r = (why: string, short: string) => ({ why, short });
  switch (kind) {
    case 'tmle':
      if (t.taxMleSeason === season) return r('Used this season.', 'used');
      if (t.mleSeason === season) return r('Not after the mid-level: a team gets one or the other.', 'not after the mid-level');
      if (t.spaceSeason === season || t.roomSeason === season)
        return r('Gone this season: a free agent was signed with cap space, so the room exception replaces it.', 'gone: cap space was used');
      if (spaceSheetPending(league, tid, season))
        return r(
          'Gone while an offer sheet on cap space is pending: a team that uses its cap space gets the room exception instead.',
          'gone while an offer sheet holds your space',
        );
      return null;
    case 'mle':
      if (t.mleSeason === season) return r('Used this season.', 'used');
      if (t.taxMleSeason === season) return r('Not after the taxpayer mid-level: a team gets one or the other.', 'not after the taxpayer mid-level');
      if (t.spaceSeason === season || t.roomSeason === season)
        return r('Gone this season: a free agent was signed with cap space, so the room exception replaces it.', 'gone: cap space was used');
      if (spaceSheetPending(league, tid, season))
        return r(
          'Gone while an offer sheet on cap space is pending: a team that uses its cap space gets the room exception instead.',
          'gone while an offer sheet holds your space',
        );
      return null;
    case 'room':
      if (t.roomSeason === season) return r('Used this season.', 'used');
      if (t.mleSeason === season || t.taxMleSeason === season) return r('Not after the mid-level: a team gets one or the other.', 'not after the mid-level');
      if (t.baeSeason === season) return r('Not after the bi-annual this season.', 'not after the bi-annual');
      if (t.spaceSeason !== season) return r('Only after signing a free agent with cap space this season (it replaces the mid-level).', 'only after a cap-space signing');
      return null;
    case 'bae':
      if (t.baeSeason === season) return r('Used this season.', 'used');
      if (t.baeSeason === season - 1) return r('Used last season: not two seasons running.', 'used last season');
      if (t.roomSeason === season) return r('Not after the room exception this season.', 'not after the room exception');
      return null;
  }
}

/**
 * Most a team can pay one free agent with an exception this contract season: its amount (the
 * mid-level 8.5% of the cap, the room exception 5.7%, the taxpayer mid-level 3.7%, the bi-annual
 * 3.3%), and for the mid-level and the bi-annual only while the signing keeps the team under the
 * first apron, the taxpayer mid-level under the second (counting the offer sheets it has signed,
 * which land on its payroll unless matched, and `extra`: other commitments the caller counts, such
 * as the user's pending offers). Using one hard-caps the team at that line for the season (see
 * hardCapLine). 0 when it can't be used.
 */
export function exceptionRoom(league: League, tid: number, kind: Exception, season = contractSeason(league), extra = 0): number {
  if (exceptionUsedReason(league, tid, kind, season)) return 0;
  const full = exceptionAmount(league, kind, season);
  // (a team that has just used its cap space is nowhere near an apron)
  if (kind === 'room') return full;
  const sheets = marketHolds(league, tid, season).reduce((a, h) => a + (h.kind === 'sheet' ? h.amount : 0), 0);
  const cap = CAP_FOR(league, season);
  const line = kind === 'tmle' ? cap.secondApron : cap.firstApron;
  return Math.max(0, Math.min(full, line - payroll(league, tid, season) - sheets - extra));
}

/** Most a team can pay one free agent with its mid-level exception (see exceptionRoom): 0 once used, replaced by the room exception, or past the tax. */
export const mleRoom = (league: League, tid: number, season = contractSeason(league)) => exceptionRoom(league, tid, 'mle', season);

/** The most any of a team's exceptions would pay one free agent now. */
export const bestExceptionRoom = (league: League, tid: number, season = contractSeason(league)) =>
  Math.max(0, ...EXCEPTION_ORDER.map((k) => exceptionRoom(league, tid, k, season)));

/**
 * The line a team is hard-capped at this contract season, or null: the first apron after it used the
 * mid-level or the bi-annual, the second after the taxpayer mid-level. Trades can't take its
 * payroll past it for the rest of the season.
 */
export function hardCapLine(league: League, tid: number, season = contractSeason(league)): { amount: number; name: string; what: string } | null {
  const t = league.teams[tid];
  const cap = CAP_FOR(league, season);
  if (t.mleSeason === season || t.baeSeason === season)
    return { amount: cap.firstApron, name: 'first apron', what: t.mleSeason === season ? 'mid-level exception' : 'bi-annual exception' };
  if (t.taxMleSeason === season) return { amount: cap.secondApron, name: 'second apron', what: 'taxpayer mid-level exception' };
  return null;
}

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
  if (amount <= (p && p.experience < 3 ? cap.minContract : cap.vetMin) + 1) return 'min';
  const pay = payroll(league, tid, season);
  // (the holds are only worth adding up when the payroll alone leaves the room)
  if (pay + amount <= cap.salaryCap && pay + heldSalary(league, tid, season) + amount <= cap.salaryCap) return 'space';
  for (const k of via ? [via, ...EXCEPTION_ORDER.filter((x) => x !== via)] : EXCEPTION_ORDER)
    if ((years === undefined || years <= EXCEPTIONS[k].years) && amount <= exceptionRoom(league, tid, k, season)) return k;
  return null;
}

/**
 * How an AI team pays a free agent who wants `years`: a route that allows his length if one does,
 * else the one with the longest deal it can (his length then cut to it, see routeYears).
 */
export function aiRoute(league: League, tid: number, amount: number, season: number, p: Pick<Player, 'experience'>, years: number): SigningRoute | null {
  return (
    signingRoute(league, tid, amount, season, p, years) ??
    (years > MLE_YEARS ? signingRoute(league, tid, amount, season, p, MLE_YEARS) : null) ??
    signingRoute(league, tid, amount, season, p)
  );
}

/** A signing used this route: cap space (then no mid-level for the rest of the season, the room exception instead) or an exception. */
export function spendRoute(league: League, tid: number, route: SigningRoute | null, season = contractSeason(league)) {
  const t = league.teams[tid];
  if (route === 'space') t.spaceSeason = season;
  else if (route === 'mle') t.mleSeason = season;
  else if (route === 'tmle') t.taxMleSeason = season;
  else if (route === 'room') t.roomSeason = season;
  else if (route === 'bae') t.baeSeason = season;
}

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

/**
 * The payroll an AI team will go to for keeping a player worth `v`. Its core (its three best and
 * its young stars, `core`, see teamCore) it keeps at almost any price its strategy allows: a
 * contender up to the first apron, a retooling team up to the tax line, a rebuilder its young core
 * (28 or under) up to the tax line; a star worth 86+ up to the second apron, and a young one (28
 * or under) on any team to 10% of the cap past it: a franchise keeps its young star and sheds
 * salary around him later (see dumpDeal).
 * Anyone else: a good young player (80+, 28 or under), an asset to keep and trade later rather
 * than let walk, to the first apron on a contender and the tax line elsewhere; otherwise a
 * contender up to a little under the tax line (a starter worth 80+ to the line), a retooling team
 * halfway between cap and tax (80+ a little under the line), a rebuilder under the cap (its
 * veterans past 28 further under), keeping room for the dumps it takes picks for (halfway to the
 * tax for 82+). Re-signing, extensions, qualifying offers and matching offer sheets all budget
 * with it.
 */
export function payrollBudget(cap: ReturnType<typeof CAP_FOR>, t: Team, v: number, who: { core: boolean; young: boolean } = { core: false, young: true }): number {
  const star = v >= 86;
  if (who.core) {
    if (star && who.young) return cap.secondApron + cap.salaryCap * 0.1;
    if (t.strategy === 'contend') return star ? cap.secondApron : cap.firstApron;
    if (t.strategy === 'retool') return star ? cap.secondApron : cap.luxuryTax;
    if (who.young) return cap.luxuryTax;
  }
  const mid = (cap.salaryCap + cap.luxuryTax) / 2;
  const under = cap.luxuryTax - cap.salaryCap * 0.02;
  if (v >= 80 && who.young) return t.strategy === 'contend' ? cap.firstApron : cap.luxuryTax;
  if (t.strategy === 'contend') return v >= 80 ? cap.luxuryTax : under;
  if (t.strategy === 'retool') return v >= 80 ? under : mid;
  return v >= 82 ? mid : cap.salaryCap * (who.young ? 0.95 : 0.85);
}

/** A team's core for its payroll budget (see payrollBudget): its three most valuable players, and any young star (25 or younger, worth 82+). */
export function teamCore(league: League, tid: number): Set<number> {
  return new Set(
    teamPlayers(league, tid)
      .filter((p) => !p.contract.twoWay)
      .sort((a, b) => valueScore(league, b) - valueScore(league, a) || a.pid - b.pid)
      .filter((p, i) => i < 3 || (age(league, p) <= 25 && valueScore(league, p) >= 82))
      .map((p) => p.pid),
  );
}

/** Season day of December 15 (day 0 is October 20). */
export const DEC_15 = 56;

/**
 * The option an AI team's signing of `years` (two or more) carries: a player option on the final
 * season for a player 32 or younger, likelier the better he is (none under 75, up to 60% from 86),
 * as stars get them; else a team option on a cheap (5% of the cap or less) two- or three-year deal
 * for a player 24 or younger, about a third of the time. A hash of the league, season and player,
 * so the league's random stream is left alone.
 */
export function aiOption(league: League, p: Player, amount: number, years: number): 'player' | 'team' | undefined {
  if (years < 2) return undefined;
  const s = contractSeason(league);
  const roll = hashString(`${league.id}:${league.season}:${p.pid}:option`) / 4294967296;
  const a = playerAge(p, s);
  if (a <= 32 && roll < clamp((valueScore(league, p) - 74) / 20, 0, 0.6)) return 'player';
  if (a <= 24 && years <= 3 && amount <= CAP_FOR(league, s).salaryCap * 0.05 && roll > 0.65) return 'team';
  return undefined;
}

/** Did team `tid` release (waive or buy out) him this season? Then it can't sign him again until next season. */
export const releasedBy = (league: League, p: Pick<Player, 'released'>, tid: number) => p.released?.tid === tid && p.released.season === league.season;

/**
 * `log: false`: the caller logs the move itself (restricted free agency's matches and qualifying
 * offers, 10-day contracts). `option`: a player or team option on the final season (the user's
 * choice, or an AI team's, see aiOption). `tenDay`: a 10-day contract, whose one salary is `amount`
 * as given (see tenDay.ts). `raise`: the raises set by terms already written (a matched offer sheet's).
 */
export function signPlayer(
  league: League,
  p: Player,
  tid: number,
  amount: number,
  years: number,
  opts: {
    news?: boolean;
    start?: number;
    twoWay?: boolean;
    log?: boolean;
    option?: 'player' | 'team';
    tenDay?: { until: number; hardship?: boolean };
    bird?: boolean;
    raise?: number;
  } = {},
) {
  const prevTid = p.tid;
  // his own team re-signs him: from its roster, as its restricted free agent (it kept his rights),
  // or bringing him back from the market on his Bird rights (`bird`)
  const own = prevTid === tid || p.rfa?.tid === tid || !!opts.bird;
  const start = opts.start ?? league.season;
  // (read before he joins: Bird rights are his old team's, and so is a bigger max)
  const terms = opts.tenDay || opts.twoWay ? {} : { raise: opts.raise ?? (opts.bird ? 0.08 : raiseWith(league, p, tid)), max: playerMax(league, p, start, tid) };
  p.tid = tid;
  p.contract = opts.tenDay ? { start, salaries: [amount], tenDay: { ...opts.tenDay } } : makeContract(league, amount, years, start, opts.twoWay ? undefined : p.experience, terms);
  if (opts.twoWay) p.contract.twoWay = true;
  if (opts.option && years >= 2) p.contract.option = opts.option;
  // whatever he signs, his talks with the user are over
  delete p.talks;
  if (!own) {
    p.joinedSeason = league.season;
    // his Bird clock with the new team starts with his first season there
    p.birdSince = start;
    // a new team: the trade-back rule was about his old one (a re-signing keeps it)
    delete p.tradedFrom;
  }
  // whatever he signs, restricted free agency is over (a matched offer sheet included)
  delete p.rfa;
  // like the NBA's: no trading him until December 15 of his first season, or three months after
  // an in-season signing if that is later (otherwise a free agent could be signed and flipped for
  // more value); a summer or training-camp signing waits for December 15
  p.tradeLock = league.phase === 'regular' ? { season: league.season, day: Math.max(DEC_15, league.day + 90) } : { season: p.contract.start, day: DEC_15 };
  p.asking = undefined;
  p.faDays = undefined;
  const team = league.teams[tid];
  if (!team.rotation.order.includes(p.pid)) team.rotation.order.push(p.pid);
  // a newcomer takes a number nobody there wears (nor has retired) now, not at the next game
  numberTeam(league, tid);
  if (opts.news !== false) {
    const verb = own ? 're-signed with' : opts.twoWay ? 'signed a two-way deal with' : 'signed with';
    addNews(league, {
      kind: 'signing',
      // the total includes the yearly raises, as on the offer sheet
      text: `${playerName(p)} ${verb} the ${team.region} ${team.name}: ${years} yr${years === 1 ? '' : 's'} / ${money(p.contract.salaries.reduce((a, x) => a + x, 0))}.`,
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
 * preseason cuts and minimum camp deals, which leave no dead money. The team can't sign him again
 * that season (see releasedBy), unless his 10-day contract simply ran out (`ended`). `log: false`:
 * the caller logs the move itself (a buyout, a 10-day contract that ended).
 */
export function releasePlayer(league: League, p: Player, opts: { news?: boolean; giveback?: number; stretch?: boolean; log?: boolean; ended?: boolean } = {}) {
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
  // his old team's rights to him (a qualifying offer) with it
  delete p.tradedFrom;
  delete p.tradeLock;
  delete p.rfa;
  if (opts.ended) delete p.released;
  else p.released = { tid, season: league.season };
  if (waive) p.waivers = { from: tid, until: league.day + WAIVER_DAYS, contract, dead, ...(lock ? { lock } : {}) };
  else delete p.waivers;
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
 * spot and either cap room for this season's salary or a minimum salary, as a signing would, and
 * like a signing it is made in the regular season: once the postseason starts, a player still on
 * waivers clears to free agency (see resolveWaivers).
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
    return `His ${seasonLabel(league.season)} salary is ${money(salary)}: claiming him needs that much cap space (${room > 0 ? `${money(room)}` : 'none'} now).`;
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
  // extended yet)
  if (w.lock) p.tradeLock = { ...w.lock };
  delete p.waivers;
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
          body: `The ${teamNameOf(league, claimer.tid)} claimed ${name} and took over his contract, so the ${money(dead)} in dead money he left comes off our books.`,
          tone: 'good',
          link: '/office',
        });
      else if (claimer.tid === user)
        addInbox(league, {
          from: 'Assistant GM',
          subject: `${name} claimed`,
          body: `Our waiver claim on ${name} went through: his contract (${money(salaryFor(p, league.season))} this season, through ${seasonLabel(contractExp(p.contract))}) is ours, and the ${league.teams[w.from].name} are off the hook for it.`,
          tone: 'good',
          link: `/player/${p.pid}`,
        });
      else if (w.claim)
        addInbox(league, {
          from: 'Assistant GM',
          subject: `${name} went elsewhere`,
          body: yourClaimFailed
            ? `Our claim on ${name} fell through, and the ${teamNameOf(league, claimer.tid)} claimed him. ${yourClaimFailed}`
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
            ? `Nobody claimed ${name}, so he is a free agent and his ${money(dead)} stays on our books as dead money.`
            : `Our claim on ${name} fell through. ${claimBlockedReason(league, user, { ...p, waivers: w }) ?? 'The claim no longer fit.'} He is a free agent now.`,
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
 * to be let go, 2-22%: more at 32+ or when the team isn't contending, plus a little that is his
 * own (a hash, so the terms hold still). null when he isn't a candidate.
 */
export function buyoutTerms(league: League, p: Player): { giveback: number; owed: number; saved: number; dead: number } | null {
  if (p.tid < 0 || p.contract.twoWay || age(league, p) < 28) return null;
  const owed = releaseDeadMoney(league, p).reduce((a, d) => a + d.amount, 0);
  if (owed <= 0) return null;
  let g = 0.02 + 0.05 * (hashString(`${league.id}:${p.pid}:buyout`) / 4294967296);
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
    text: `The ${team.name} bought out ${playerName(p)}, who gave back ${money(terms.saved)}.`,
    tids: [team.tid],
    pids: [p.pid],
  });
  logMove(league, 'buyout', team.tid, p, { amount: terms.saved, ...(spread ? { note: 'stretched', years: spread } : {}) });
  return {
    ok: true,
    reason: `${playerName(p)} takes the buyout: he gives back ${money(terms.saved)}, and ${money(terms.dead)} stays on your books${spread ? `, ${stretchPhrase(league, spread)}` : ''}.`,
  };
}

/** How a stretched release reads: "stretched over 5 seasons", or once a season is under way "this season's as usual, the rest stretched over 5 seasons". */
export const stretchPhrase = (league: League, seasons: number) =>
  `${contractSeason(league) === league.season ? "this season's as usual and the rest " : ''}stretched over ${seasons} seasons`;

/**
 * The day after the trade deadline, when no trade has found a taker: AI teams out of contention
 * (rebuilding half the time, retooling a third) buy out a role veteran so he can join a contender:
 * 30 or older, his deal up this season or next, outside the team's six best, under 82. Only from a
 * roster of 15, so it stays at 14 or more. Then the buyout market (see buyoutMarket).
 */
export function aiBuyouts(league: League) {
  const out: Player[] = [];
  for (const t of league.teams) {
    if (t.tid === league.userTid || t.strategy === 'contend') continue;
    const roster = standardRoster(league, t.tid);
    if (roster.length - 1 < 14) continue;
    const top = new Set(
      [...roster]
        .sort((a, b) => valueScore(league, b) - valueScore(league, a))
        .slice(0, 6)
        .map((p) => p.pid),
    );
    const vet = roster
      .filter((p) => !top.has(p.pid) && age(league, p) >= 30 && contractExp(p.contract) <= league.season + 1 && p.ovr >= 68 && p.ovr < 82 && buyoutTerms(league, p))
      .sort((a, b) => b.ovr - a.ovr)[0];
    if (!vet || !new Rng(hashString(`${league.id}:${league.season}:${league.day}:buyout:${t.tid}`)).chance(t.strategy === 'rebuild' ? 0.5 : 0.33)) continue;
    const terms = buyoutTerms(league, vet)!;
    releasePlayer(league, vet, { news: false, giveback: terms.giveback });
    addNews(league, { kind: 'release', text: `The ${t.name} bought out ${playerName(vet)}, who gave back ${money(terms.saved)}.`, tids: [t.tid], pids: [vet.pid] });
    logMove(league, 'buyout', t.tid, vet, { amount: terms.saved });
    out.push(vet);
  }
  buyoutMarket(league, out);
}

/**
 * Bought-out veterans take the minimum to chase a ring: each signs with the contender he likes best
 * (its appeal to him, see teamAppeal) that has an open spot, or a 15th man worth 3 points less on a
 * deal it can drop for little (dead money of 2.2× the veteran minimum at most). One left unsigned
 * asks the minimum of anyone, the user included.
 */
export function buyoutMarket(league: League, players: Player[]) {
  const cap = CAP_FOR(league, league.season);
  for (const p of [...players].sort((a, b) => valueScore(league, b) - valueScore(league, a))) {
    const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
    p.asking = { amount: min, years: 1 };
    let best: { tid: number; appeal: number; cut?: Player } | null = null;
    for (const t of league.teams) {
      if (t.tid === league.userTid || t.strategy !== 'contend' || releasedBy(league, p, t.tid)) continue;
      const roster = standardRoster(league, t.tid).filter((x) => !x.contract.tenDay?.hardship);
      const cut =
        roster.length >= CAP.rosterMax
          ? roster
              .filter((x) => releaseDeadMoney(league, x).reduce((a, d) => a + d.amount, 0) <= cap.vetMin * 2.2 && valueScore(league, x) <= valueScore(league, p) - 3)
              .sort((a, b) => valueScore(league, a) - valueScore(league, b))[0]
          : undefined;
      if (roster.length >= CAP.rosterMax && !cut) continue;
      const appeal = teamAppeal(league, t.tid, p);
      if (!best || appeal > best.appeal) best = { tid: t.tid, appeal, cut };
    }
    if (!best) continue;
    if (best.cut) releasePlayer(league, best.cut, { news: false });
    signPlayer(league, p, best.tid, min, 1);
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

/** Promote a two-way player to a standard deal at the minimum for his remaining seasons. */
export function convertTwoWay(league: League, pid: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
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
  p.contract = { start: s, salaries: Array.from({ length: exp - s + 1 }, (_, i) => min(s + i)), converted: true };
  // like a minimum signing, it doesn't count against the user's pending free-agent offers (see slackForBids)
  if (p.tid === league.userTid) for (const b of league.faBids ?? []) if (b.route === 'space' || isException(b.route)) b.slack = (b.slack ?? 0) + p.contract.salaries[0];
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
      staffCalls.push(`${playerName(p)}: ${keep ? 'exercised' : 'declined'} (${money(sal)})`);
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
      link: '/office/resign',
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
 * once any option on it is decided, and never twice. Whether he'd talk is extensionRefusal's call.
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
  const market = marketSalary(league, p);
  let amount = (market * revenueScale(league, start)) / revenueScale(league, contractSeason(league));
  if (amount <= min) return { amount: min, years };
  const max = playerMax(league, p, start, p.tid >= 0 ? p.tid : undefined);
  // a star worth nearly the max asks it (see askingContract): the supermax or Rose-rule max when he has earned it
  if (market >= CAP_FOR(league, contractSeason(league)).maxContract(p.experience) * MAX_ASK) amount = max;
  else {
    const a = age(league, p);
    if (rookieScaleDeal(p) || a >= 31) amount *= 0.95;
    else if (a <= 27 && valueScore(league, p) >= 82) amount *= 1.05;
    if (p.tid >= 0) amount *= clamp(1 / teamAppeal(league, p.tid, p), 1 / 1.1, 1 / 0.9);
  }
  if (p.tid === league.userTid) amount *= preset(league).contractAsk;
  return { amount: clamp(Math.round(amount / 50) * 50, min, max), years };
}

/**
 * Why he won't extend at any price, or null. A star (worth 80+) on a team he doesn't fancy
 * (interest under 0.94: the less he likes it, the likelier) may wait for the market, unless he's
 * coming off his rookie-scale deal, when his team could match any offer. The call is one roll per
 * contract season, so asking again gets the same answer until his interest changes.
 */
export function extensionRefusal(league: League, p: Player): string | null {
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
    reason: `Asking for about ${money(ask.amount)}/yr over ${ask.years} year${ask.years === 1 ? '' : 's'} (you're ${money(need - amount)} short).`,
  };
}

/**
 * Sign an extension: `years` seasons from the one after his deal ends, with 8% raises (Bird rights). Any option
 * on the deal is picked up (it would read as the extension's last season), and like a signing he
 * can't be traded until December 15, or three months on in season.
 */
export function extendContract(league: League, p: Player, amount: number, years: number) {
  const start = contractExp(p.contract) + 1;
  p.contract.next = { salaries: makeContract(league, amount, years, start, p.experience, { raise: 0.08, max: playerMax(league, p, start, p.tid) }).salaries };
  delete p.contract.option;
  p.tradeLock = league.phase === 'regular' ? { season: league.season, day: Math.max(DEC_15, league.day + 90) } : { season: contractSeason(league), day: DEC_15 };
  const team = league.teams[p.tid];
  addNews(league, {
    kind: 'signing',
    text: `${playerName(p)} signed a ${years}-year, ${money(p.contract.next.salaries.reduce((a, x) => a + x, 0))} extension with the ${team.region} ${team.name}.`,
    tids: [p.tid],
    pids: [p.pid],
  });
  logMove(league, 'extend', p.tid, p, { amount: p.contract.next.salaries[0], years });
  // (the user's extension talks with him are over: see userExtend in negotiation.ts)
  delete p.talks;
}
