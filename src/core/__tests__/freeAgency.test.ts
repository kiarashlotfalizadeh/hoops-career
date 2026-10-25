// Free agency: cap holds, the mid-level, minimums, roster limits and the market's prices over the
// summer; competing offers for top free agents (W5) and player priorities; restricted free agency
// (qualifying offers, offer sheets, matching on both sides, the close of the market, the log).
// Fictional leagues with hand-shaped teams keep these fast: each scenario builds the league it needs.
import { expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { faAdvance, newSeason, newSeasonBlockedReason, startFreeAgency } from '../league/season';
import {
  CAP_FOR,
  OFFSEASON_ROSTER_MAX,
  contractSeason,
  curTeamSeason,
  freeAgents,
  payroll,
  playerName,
  prospects,
  revenueScale,
  standardRoster,
  statsLine,
  teamPlayers,
  twoWayRoster,
} from '../league/helpers';
import {
  EVEN_PREFS,
  FA_DAYS,
  FIRED_REASON,
  MLE_YEARS,
  PREF_KEYS,
  askingContract,
  capSpace,
  convertTwoWay,
  decideTeamOption,
  exceptionAmount,
  heldSalary,
  leaveTeam,
  makeContract,
  marketHolds,
  marketSalary,
  mleRoom,
  nonGuaranteed,
  playerPrefs,
  releaseBlockedReason,
  releaseDeadMoney,
  releasePlayer,
  rookieContract,
  rookieScaleDeal,
  signPlayer,
  signingRoute,
  summerRoster,
  teamAppeal,
  twoWaySalary,
  valueScore,
  wantsTwoWay,
} from '../league/contracts';
import {
  bidFloor,
  bidStanding,
  capHolds,
  capPayroll,
  faDay,
  faInterest,
  fillRosters,
  marqueeFA,
  offerBlockedReason,
  offerRoute,
  pendingBid,
  renouncePlayer,
  resolveBids,
  userBid,
  userMleRoom,
  userOffer,
  userResign,
  userTwoWayOffer,
  withdrawBid,
} from '../league/freeAgency';
import {
  AI_TERMS_DAY,
  acceptQualifyingOffers,
  aiMatchVerdict,
  aiQualify,
  aiRfaTerms,
  qualifyBlockedReason,
  qualifyingOffer,
  resolveOfferSheets,
  restrictedFreeAgents,
  rfaEligible,
  serviceYears,
  setRfaHold,
  sheetBlockedReason,
  sheetDecisionBlocked,
  signOfferSheet,
  userDecideSheet,
  userQualify,
  userWithdrawQualifying,
} from '../league/rfa';
import { validateTrade, type TradeOffer } from '../league/trades';
import { draftPlayer, draftStandings, ensureFuturePicks } from '../league/draft';
import { txnLine, txnText } from '../league/transactions';
import { CAP } from '../constants';
import { contractExp } from '../playerGen';
import { moneyExact } from '../format';
import { Rng } from '../random';
import type { League, Player, Txn } from '../types';
import { DRAFT_PROSPECT, FREE_AGENT, RETIRED } from '../types';

const U = 0;
const AI = 1;
const R = 1;
const B = 2;

function txLeague(rngSeed = 5): League {
  return createLeague({ name: `tx${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
}

/** Give a player a known value: OVR = POT, age, healthy, and a contract at his market price unless `salary` is set. */
function shape(l: League, p: Player, ovr: number, age: number, salary?: number, years = 2): Player {
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.injury = null;
  p.contract = { start: contractSeason(l), salaries: Array.from({ length: years }, () => salary ?? marketSalary(l, p)) };
  // with his team for years: full Bird rights
  p.birdSince = l.season - 4;
  return p;
}

/** This season's prospects still on the board, most valuable first. */
const prospectsBy = (l: League) => prospects(l, l.season).sort((a, b) => valueScore(l, b) - valueScore(l, a));

const offer = (give: number[], get: number[]): TradeOffer => ({ a: { tid: U, pids: give, dpids: [] }, b: { tid: AI, pids: get, dpids: [] } });

/** Just over the cap, well under the tax: the mid-level is open. */
function overCap(l: League, tid: number) {
  const s = contractSeason(l);
  l.teams[tid].deadMoney.push({ pid: -1, name: 'x', season: s, amount: Math.max(0, CAP_FOR(l, s).salaryCap - payroll(l, tid, s)) + 1_000 });
}

function bidsLeague(rngSeed = 5): League {
  const l = createLeague({ name: `bids${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  // priorities and the offer noise hash the league id: a fixed one keeps runs identical
  l.id = `bids_${rngSeed}`;
  return l;
}

/** A free agent of known value: OVR = POT, age, healthy, unsigned, at his market price. */
function freeAgent(l: League, p: Player, ovr: number, age = 27): Player {
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.injury = null;
  p.experience = 6;
  p.contract = { start: l.season, salaries: [0] };
  p.asking = undefined;
  p.asking = askingContract(l, p);
  return p;
}

/**
 * Summer free agency where nobody can bid but the teams opened up: everyone is over the cap with
 * the mid-level used; an opened team plays its roster on minimums (lots of space) and has the
 * record and hype given.
 */
function bidsSummer(rngSeed = 5) {
  const l = bidsLeague(rngSeed);
  l.phase = 'freeAgency';
  l.faDay = 0;
  const s = contractSeason(l);
  const cap = CAP_FOR(l, s);
  for (const t of l.teams) {
    t.deadMoney = [{ pid: -1, name: 'x', season: s, amount: cap.salaryCap }];
    // (no exceptions either: the mid-level and the bi-annual used)
    t.mleSeason = s;
    t.baeSeason = s;
  }
  const open = (tid: number, won: number, hype: number, space?: number) => {
    const t = l.teams[tid];
    t.deadMoney = [];
    t.hype = hype;
    t.pop = 3;
    t.strategy = 'retool';
    for (const p of teamPlayers(l, tid)) p.contract = { start: s, salaries: [cap.vetMin] };
    const ts = curTeamSeason(l, tid);
    ts.won = won;
    ts.lost = 82 - won;
    if (space !== undefined) t.deadMoney.push({ pid: -2, name: 'y', season: s, amount: cap.salaryCap - payroll(l, tid, s) - space });
  };
  return { l, s, cap, open };
}

const stars = (l: League, n: number, ovr = 86) =>
  freeAgents(l)
    .slice(0, n)
    .map((p) => freeAgent(l, p, ovr));

const bidAtAsk = (l: League, p: Player) => {
  const ask = askingContract(l, p, U);
  return userBid(l, p.pid, ask.amount, ask.years);
};

function rfaLeague(rngSeed = 5): League {
  const l = createLeague({ name: `rfa${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  // priorities and the offer noise hash the league id: a fixed one keeps runs identical
  l.id = `rfa_${rngSeed}`;
  return l;
}

/**
 * A young player of team `tid` whose deal (`final` a season) runs out this season: OVR = POT,
 * healthy, `exp` seasons before this one and (unless `played` is false) games this season. A
 * first-round `pick` makes it a rookie-scale deal.
 */
function young(l: League, p: Player, tid: number, o: { ovr?: number; age?: number; exp?: number; final?: number; pick?: number; played?: boolean } = {}): Player {
  p.tid = tid;
  p.ovr = p.pot = o.ovr ?? 76;
  p.bornYear = l.season - (o.age ?? 23);
  p.injury = null;
  p.experience = o.exp ?? 2;
  // with his team since he came into the league: full Bird rights from his third season
  p.birdSince = l.season - (o.exp ?? 2);
  delete p.rfa;
  p.contract = { start: l.season - 1, salaries: [o.final ?? 3000, o.final ?? 3000], ...(o.pick ? { rookie: true } : {}) };
  p.draft = { year: l.season - 3, round: o.pick ? 1 : 2, pick: o.pick ?? 40, tid };
  p.stats = p.stats.filter((s) => s.season !== l.season);
  if (o.played !== false) statsLine(p, l.season, tid, false).gp = 60;
  if (tid >= 0 && !l.teams[tid].rotation.order.includes(p.pid)) l.teams[tid].rotation.order.push(p.pid);
  return p;
}

/** Re-sign period with the user's expiring young player. */
function resignPhase(rngSeed = 5) {
  const l = rfaLeague(rngSeed);
  l.phase = 'resign';
  const p = young(l, teamPlayers(l, U)[0], U);
  return { l, p };
}

/**
 * Free agency where nobody has room but the teams opened up: everyone is over the cap with the
 * mid-level used; an opened team plays its roster on minimums (lots of space, or `space`).
 */
function rfaSummer(rngSeed = 5) {
  const l = rfaLeague(rngSeed);
  l.phase = 'freeAgency';
  l.faDay = 0;
  const s = contractSeason(l);
  const cap = CAP_FOR(l, s);
  for (const t of l.teams) {
    t.deadMoney = [{ pid: -1, name: 'x', season: s, amount: cap.salaryCap }];
    t.mleSeason = s;
  }
  const open = (tid: number, space?: number) => {
    const t = l.teams[tid];
    t.deadMoney = [];
    t.strategy = 'retool';
    for (const p of teamPlayers(l, tid)) p.contract = { start: s, salaries: [cap.vetMin] };
    if (space !== undefined) t.deadMoney.push({ pid: -2, name: 'y', season: s, amount: cap.salaryCap - payroll(l, tid, s) - space });
  };
  return { l, s, cap, open };
}

/** A restricted free agent of team `tid` in free agency, qualified as the market opened (a free agent reshaped, or the last team's player when none is left). */
function rfa(l: League, tid: number, o: Parameters<typeof young>[3] = {}): Player {
  const donor = l.teams.length - 1;
  const from = freeAgents(l).find((x) => !x.rfa) ?? teamPlayers(l, donor)[0];
  if (from.tid === donor) leaveTeam(l.teams[donor], from.pid);
  const p = young(l, from, tid, o);
  p.rfa = { tid, qo: qualifyingOffer(l, p) };
  setRfaHold(l, p);
  l.teams[tid].rotation.order = l.teams[tid].rotation.order.filter((x) => x !== p.pid);
  p.tid = FREE_AGENT;
  p.asking = undefined;
  p.asking = askingContract(l, p);
  p.faDays = 5;
  return p;
}

/** The entries `act` adds to the log. */
function logged(l: League, act: () => unknown): Txn[] {
  const from = l.nextTxnId ?? 1;
  act();
  return (l.transactions ?? []).filter((t) => t.id >= from);
}

const text = (l: League, t: Txn, view: { tid: number } | { pid: number }) => txnText(l, txnLine(t, view));
const atAsk = (l: League, p: Player, years: number) => Math.ceil((askingContract(l, p, U).amount * (1 + Math.abs(years - askingContract(l, p, U).years) * 0.03)) / 50) * 50;

it('the market: cap holds, the mid-level, minimums, roster limits, prices over the summer, rookie and camp deals, and the leagues it starts from', () => {
  // holds room for expiring players until they are renounced
  {
    const l = txLeague();
    l.phase = 'resign';
    const next = l.season + 1;
    // most of our roster is up this summer
    for (const p of standardRoster(l, U).slice(0, 10)) shape(l, p, 80, 27, 15_000, 1).contract.start = l.season;
    const holds = capHolds(l, U);
    expect(holds.length).toBeGreaterThanOrEqual(10);
    expect(capPayroll(l, U, next)).toBeGreaterThan(payroll(l, U, next));
    // the holds take us over the cap, so taking on salary for nothing breaks salary matching
    const target = shape(l, standardRoster(l, AI)[0], 72, 27, 25_000, 3);
    expect(capPayroll(l, U, next) + 25_000).toBeGreaterThan(CAP_FOR(l, next).salaryCap);
    expect(validateTrade(l, offer([], [target.pid])).some((e) => e.includes("Salary doesn't match"))).toBe(true);
    for (const h of holds) expect(renouncePlayer(l, h.p.pid).ok).toBe(true);
    expect(capHolds(l, U)).toEqual([]);
    expect(validateTrade(l, offer([], [target.pid])).filter((e) => e.includes("Salary doesn't match"))).toEqual([]);
  }

  // holds an AI team's room for the players it would re-sign
  {
    const l = txLeague();
    l.phase = 'draft';
    const keep = shape(l, standardRoster(l, AI)[0], 84, 26, 20_000, 1);
    keep.contract.start = l.season;
    expect(capHolds(l, AI).some((h) => h.p.pid === keep.pid)).toBe(true);
    l.phase = 'freeAgency';
    expect(capHolds(l, AI)).toEqual([]);
  }

  // lets a team under the tax use the mid-level once a season (T2)
  {
    const l = txLeague();
    l.phase = 'regular';
    while (standardRoster(l, U).length > 12) releasePlayer(l, standardRoster(l, U)[0], { news: false });
    l.teams[U].deadMoney = [];
    overCap(l, U);
    const cap = CAP_FOR(l);
    const mle = mleRoom(l, U);
    expect(mle).toBe(Math.round((cap.salaryCap * 0.085) / 10) * 10);
    // a starter-level free agent asking more than the minimum but less than the mid-level
    const [a, b] = freeAgents(l).sort((x, y) => valueScore(l, y) - valueScore(l, x));
    shape(l, a, 76, 27).asking = undefined;
    expect(askingContract(l, a, U).amount).toBeGreaterThan(cap.vetMin);
    expect(userOffer(l, a.pid, mle, MLE_YEARS + 1).ok).toBe(false);
    expect(userOffer(l, a.pid, mle, 2).ok).toBe(true);
    // used up for the season
    expect(mleRoom(l, U)).toBe(0);
    expect(userOffer(l, b.pid, cap.vetMin * 2, 1).ok).toBe(false);
  }

  // a minimum deal pays each season's minimum, which grows faster than a 5% raise
  {
    const l = txLeague();
    const [vet, young] = freeAgents(l);
    vet.experience = 5;
    young.experience = 1;
    signPlayer(l, vet, U, CAP_FOR(l).vetMin, 3, { news: false });
    signPlayer(l, young, U, CAP_FOR(l).minContract, 2, { news: false });
    expect(vet.contract.salaries).toEqual([0, 1, 2].map((i) => CAP_FOR(l, l.season + i).vetMin));
    expect(young.contract.salaries).toEqual([0, 1].map((i) => CAP_FOR(l, l.season + i).minContract));
  }

  // over the cap, the minimum is the player's own: the veteran minimum only after three seasons
  {
    const l = txLeague();
    l.phase = 'regular';
    while (standardRoster(l, U).length > 13) releasePlayer(l, standardRoster(l, U)[0], { news: false });
    overCap(l, U);
    const s = contractSeason(l);
    const cap = CAP_FOR(l, s);
    l.teams[U].mleSeason = s;
    l.teams[U].baeSeason = s;
    expect(signingRoute(l, U, cap.minContract, s, { experience: 1 })).toBe('min');
    expect(signingRoute(l, U, cap.vetMin, s, { experience: 1 })).toBeNull();
    expect(signingRoute(l, U, cap.vetMin, s, { experience: 5 })).toBe('min');
    const young = freeAgents(l)[0];
    young.experience = 1;
    young.asking = undefined;
    const no = userOffer(l, young.pid, cap.vetMin, 1);
    expect(no.ok).toBe(false);
    expect(no.reason).toBe(`No cap space. Over the cap you can offer his minimum (${moneyExact(cap.minContract)}).`);
  }

  // a fired coach can't sign, re-sign, release, convert or decide options for his old team (T7)
  {
    const l = txLeague();
    l.phase = 'regular';
    l.fired = true;
    const fa = freeAgents(l)[0];
    expect(userOffer(l, fa.pid, CAP_FOR(l).vetMin, 1).reason).toBe(FIRED_REASON);
    expect(userTwoWayOffer(l, fa.pid).reason).toBe(FIRED_REASON);
    expect(releaseBlockedReason(l, standardRoster(l, U)[0])).toBe(FIRED_REASON);
    expect(convertTwoWay(l, twoWayRoster(l, U)[0].pid).reason).toBe(FIRED_REASON);
    l.phase = 'resign';
    const p = standardRoster(l, U)[0];
    p.contract = { start: l.season, salaries: [5_000] };
    expect(userResign(l, p.pid, 50_000, 2).reason).toBe(FIRED_REASON);
    expect(renouncePlayer(l, p.pid).reason).toBe(FIRED_REASON);
    expect(decideTeamOption(l, p.pid, true).reason).toBe(FIRED_REASON);
  }

  // re-signing a player is one news item
  {
    const l = txLeague();
    l.phase = 'resign';
    const p = shape(l, standardRoster(l, U)[0], 74, 27);
    p.contract = { start: l.season, salaries: [5_000] };
    const ask = askingContract(l, p, U);
    expect(userResign(l, p.pid, ask.amount, ask.years).ok).toBe(true);
    expect(l.news.filter((n) => n.pids.includes(p.pid))).toHaveLength(1);
  }

  // allows 21 players in the offseason and 15 in season (T12)
  {
    const l = txLeague();
    l.phase = 'freeAgency';
    const cheap = () => freeAgents(l).find((p) => askingContract(l, p, U).amount <= CAP_FOR(l, contractSeason(l)).vetMin)!;
    while (standardRoster(l, U).length < 16) signPlayer(l, cheap(), U, CAP_FOR(l, contractSeason(l)).vetMin, 1, { news: false, start: contractSeason(l) });
    const p = cheap();
    const ask = askingContract(l, p, U);
    expect(userOffer(l, p.pid, ask.amount, ask.years).ok).toBe(true);
    while (standardRoster(l, U).length < 21) signPlayer(l, cheap(), U, CAP_FOR(l, contractSeason(l)).vetMin, 1, { news: false, start: contractSeason(l) });
    const q = cheap();
    expect(userOffer(l, q.pid, askingContract(l, q, U).amount, askingContract(l, q, U).years).reason).toMatch(/full \(21\)/);
  }

  // a re-signing takes one of next season's 21 spots
  {
    const l = txLeague();
    l.phase = 'resign';
    const cs = contractSeason(l);
    const p = shape(l, standardRoster(l, U)[0], 74, 27);
    p.contract = { start: l.season, salaries: [5_000] };
    const signed = () => standardRoster(l, U).filter((x) => contractExp(x.contract) >= cs);
    while (signed().length < 21) signPlayer(l, freeAgents(l)[0], U, CAP_FOR(l, cs).vetMin, 1, { news: false, start: cs });
    const ask = askingContract(l, p, U);
    expect(userResign(l, p.pid, ask.amount, ask.years).reason).toMatch(/full for next season \(21\)/);
    releasePlayer(l, signed()[0], { news: false });
    expect(userResign(l, p.pid, ask.amount, ask.years).ok).toBe(true);
    expect(signed().length).toBe(21);
  }

  // after the season, converting a two-way counts next season's roster, not the expiring deals
  {
    const l = txLeague();
    l.phase = 'resign';
    const cs = contractSeason(l);
    const signed = () => standardRoster(l, U).filter((x) => contractExp(x.contract) >= cs);
    for (const p of standardRoster(l, U).slice(0, 2)) p.contract = { start: l.season, salaries: [5_000] };
    while (signed().length < 20) signPlayer(l, freeAgents(l)[0], U, CAP_FOR(l, cs).vetMin, 1, { news: false, start: cs });
    expect(standardRoster(l, U).length).toBeGreaterThan(21);
    const tw = twoWayRoster(l, U)[0];
    tw.contract = { start: l.season, salaries: [twoWaySalary(l), twoWaySalary(l, cs)], twoWay: true };
    expect(convertTwoWay(l, tw.pid).ok).toBe(true);
    expect(signed().length).toBe(21);
    expect(convertTwoWay(l, twoWayRoster(l, U)[0].pid).reason).toMatch(/No open roster spot \(21\)/);
  }

  // a star holds his price over the first days of free agency, and takes the best money there is when no team could pay most of his value
  {
    const l = txLeague();
    l.phase = 'freeAgency';
    l.faDay = 0;
    for (const t of l.teams) overCap(l, t.tid);
    const star = shape(l, freeAgents(l)[0], 88, 27);
    star.contract = { start: l.season, salaries: [0] };
    star.asking = askingContract(l, star);
    star.faDays = 1;
    const start = star.asking.amount;
    const rng = new Rng(4);
    faDay(l, rng, 0, 1);
    expect(star.asking.amount).toBe(start);
    // every team over the cap: no one can pay him 60% of his value, so he doesn't wait for the summer's money to be spent
    l.faDay = 15;
    star.faDays = 1;
    faDay(l, rng, 0, 16);
    const now = star.tid === FREE_AGENT ? star.asking!.amount : star.contract.salaries[0];
    expect(now).toBeLessThan(marketSalary(l, star) * 0.6);
  }

  // cuts prices every 5 days until the market can pay, and the market clears (T1)
  {
    const l = txLeague();
    l.phase = 'freeAgency';
    l.faDay = 0;
    for (const t of l.teams) overCap(l, t.tid);
    // (a player under star level, no top free agent: a star holds his price a while, see above)
    const star = shape(l, freeAgents(l)[0], 76, 27);
    star.contract = { start: l.season, salaries: [0] };
    star.asking = askingContract(l, star);
    star.faDays = 5;
    const start = star.asking.amount;
    const rng = new Rng(4);
    for (let d = 0; d < 4; d++) faDay(l, rng, 0);
    expect(star.asking.amount).toBe(start);
    faDay(l, rng, 0);
    // nobody can pay more than the mid-level (at his interest in the team), so that's where his price goes
    expect(star.asking.amount).toBeLessThanOrEqual(Math.max(...l.teams.map((t) => mleRoom(l, t.tid) * teamAppeal(l, t.tid, star))) + 10);
    expect(star.asking.years).toBeLessThanOrEqual(3);
    for (let d = 0; d < 10 && star.tid === FREE_AGENT; d++) faDay(l, rng);
    expect(star.tid).toBeGreaterThanOrEqual(0);
  }

  // only room on teams that would take him holds a free agent's price up
  {
    const l = txLeague();
    l.phase = 'freeAgency';
    const s = contractSeason(l);
    for (const t of l.teams) {
      overCap(l, t.tid);
      t.mleSeason = s;
      t.baeSeason = s;
    }
    // one team has cap space but a full roster he wouldn't crack
    const rich = l.teams[AI];
    rich.deadMoney = [];
    const vetMin = CAP_FOR(l, s).vetMin;
    for (const p of standardRoster(l, AI)) shape(l, p, 85, 27, vetMin, 2);
    while (standardRoster(l, AI).length < CAP.rosterMax) signPlayer(l, freeAgents(l)[0], AI, vetMin, 2, { news: false, start: s });
    for (const p of standardRoster(l, AI)) shape(l, p, 85, 27, vetMin, 2);
    expect(CAP_FOR(l, s).salaryCap - payroll(l, AI, s)).toBeGreaterThan(30_000);
    const fa = shape(l, freeAgents(l)[0], 75, 27);
    fa.contract = { start: l.season, salaries: [0] };
    fa.experience = 5;
    fa.asking = { amount: 20_000, years: 3 };
    fa.faDays = 1;
    faDay(l, new Rng(2), 0);
    expect(fa.asking.amount).toBe(vetMin);
  }

  // a full AI roster adds a clearly better free agent: a swap in season, a camp body in the summer (T1)
  {
    for (const phase of ['regular', 'freeAgency'] as const) {
      const l = txLeague();
      l.phase = phase;
      for (const t of l.teams) {
        overCap(l, t.tid);
        while (standardRoster(l, t.tid).length < CAP.rosterMax)
          signPlayer(l, freeAgents(l).sort((a, b) => a.ovr - b.ovr)[0], t.tid, CAP_FOR(l, contractSeason(l)).vetMin, 1, { news: false, start: contractSeason(l) });
      }
      const fa = shape(l, freeAgents(l)[0], 82, 27);
      fa.contract = { start: l.season, salaries: [0] };
      fa.asking = { amount: CAP_FOR(l, contractSeason(l)).vetMin, years: 1 };
      const rng = new Rng(6);
      for (let d = 0; d < 10 && fa.tid === FREE_AGENT; d++) faDay(l, rng);
      expect(fa.tid).toBeGreaterThanOrEqual(0);
      // in season the weakest cheap player goes now; in the summer the cuts wait for opening night
      expect(standardRoster(l, fa.tid).length).toBe(phase === 'regular' ? CAP.rosterMax : CAP.rosterMax + 1);
    }
  }

  // a released or renounced player leaves nothing behind in his old team's rotation or tactics
  {
    const l = txLeague();
    const t = l.teams[U];
    const [a, b] = standardRoster(l, U);
    for (const p of [a, b]) {
      t.rotation.closers.push(p.pid);
      t.rotation.restB2B.push(p.pid);
      t.rotation.caps[p.pid] = 20;
      t.rotation.minutes[p.pid] = 24;
      t.tactics.offense.roles[p.pid] = 'glue';
      t.tactics.offense.freedom[p.pid] = 1;
    }
    releasePlayer(l, a, { news: false });
    l.phase = 'resign';
    b.contract = { start: l.season, salaries: [5_000] };
    expect(renouncePlayer(l, b.pid).ok).toBe(true);
    for (const pid of [a.pid, b.pid]) {
      expect([t.rotation.order, t.rotation.closers, t.rotation.restB2B].some((xs) => xs.includes(pid))).toBe(false);
      expect([t.rotation.caps[pid], t.rotation.minutes[pid], t.tactics.offense.roles[pid], t.tactics.offense.freedom[pid]]).toEqual([undefined, undefined, undefined, undefined]);
    }
  }

  // rookie deals grow with the cap: a pick drafted two years on signs for 6% a year more
  {
    const l = txLeague();
    const now = rookieContract(l, 1, 1, l.season + 1);
    const later = rookieContract(l, 1, 1, l.season + 3);
    expect(later.salaries[0] / now.salaries[0]).toBeCloseTo((1 + CAP.growth) ** 2, 2);
    // a second-rounder gets each season's minimum
    expect(rookieContract(l, 5, 2, l.season + 3).salaries).toEqual([CAP_FOR(l, l.season + 3).minContract, CAP_FOR(l, l.season + 4).minContract]);
  }

  // only a first-round pick's deal is on the rookie scale (the Office's R tag): a second-rounder's minimum seasons aren't
  {
    const l = txLeague();
    l.phase = 'draft';
    const [first, second] = [1, 2].map((round) => {
      const dp = l.draftPicks.find((d) => d.season === l.season && d.round === round && d.tid === U)!;
      dp.pick = 20;
      const p = prospectsBy(l)[0];
      draftPlayer(l, dp, p.pid);
      return p;
    });
    // both are rookie deals (no contract grumbles, the team wants to keep them)
    expect([first.contract.rookie, second.contract.rookie]).toEqual([true, true]);
    expect(rookieScaleDeal(first)).toBe(true);
    expect(rookieScaleDeal(second)).toBe(false);
    // re-signed, he's off it
    first.contract = { start: l.season + 1, salaries: [10_000] };
    expect(rookieScaleDeal(first)).toBe(false);
  }

  // camp deals are free to cut before opening night; releases count from the contract season (T10, UI2-5)
  {
    const l = txLeague();
    const p = standardRoster(l, U)[0];
    p.contract = { start: l.season, salaries: [CAP_FOR(l).vetMin, CAP_FOR(l).vetMin] };
    expect(nonGuaranteed(l, p)).toBe(true);
    expect(releaseDeadMoney(l, p)).toEqual([]);
    l.phase = 'regular';
    expect(releaseDeadMoney(l, p).length).toBe(2);
    // after the season, only next season's salary is still owed
    l.phase = 'freeAgency';
    const vet = shape(l, standardRoster(l, U)[1], 75, 30, 10_000, 3);
    vet.contract.start = l.season;
    expect(releaseDeadMoney(l, vet).map((d) => d.season)).toEqual([l.season + 1, l.season + 2]);
  }

  // AI teams with full rosters stash second-round picks on two-way deals (T10)
  {
    const l = txLeague();
    l.phase = 'draft';
    ensureFuturePicks(l, l.season);
    const ai = l.teams.find((t) => t.tid !== U && twoWayRoster(l, t.tid).length < 3)!;
    for (const p of standardRoster(l, ai.tid)) if (p.contract.start + p.contract.salaries.length - 1 <= l.season) p.contract.salaries.push(p.contract.salaries[0]);
    while (standardRoster(l, ai.tid).length < 14) signPlayer(l, freeAgents(l)[0], ai.tid, CAP_FOR(l).vetMin, 2, { news: false });
    const dp = l.draftPicks.find((d) => d.season === l.season && d.round === 2 && d.originalTid === ai.tid)!;
    dp.tid = ai.tid;
    dp.pick = 15;
    const prospect = Object.values(l.players).find((p) => p.tid === -2 && p.draft.year === l.season)!;
    draftPlayer(l, dp, prospect.pid);
    expect(prospect.contract.twoWay).toBe(true);
  }

  // fictional leagues pay by value, with a center, rookie deals, options and two-ways on every team (T15)
  {
    const l = txLeague(3);
    const cap = CAP_FOR(l);
    const rows = l.teams.map((t) => {
      const r = standardRoster(l, t.tid);
      return {
        talent: [...r]
          .sort((a, b) => b.ovr - a.ovr)
          .slice(0, 8)
          .reduce((a, p) => a + p.ovr, 0),
        pay: payroll(l, t.tid),
        hasC: r.some((p) => p.pos === 'C'),
        rookies: r.filter((p) => p.contract.rookie).length,
        twoWays: twoWayRoster(l, t.tid).length,
        overMax: r.filter((p) => p.contract.salaries[0] > cap.maxContract(p.experience)).length,
      };
    });
    const corr = (xs: number[], ys: number[]) => {
      const mx = xs.reduce((a, b) => a + b) / xs.length;
      const my = ys.reduce((a, b) => a + b) / ys.length;
      let n = 0;
      let dx = 0;
      let dy = 0;
      xs.forEach((x, i) => ((n += (x - mx) * (ys[i] - my)), (dx += (x - mx) ** 2), (dy += (ys[i] - my) ** 2)));
      return n / Math.sqrt(dx * dy);
    };
    expect(rows.every((r) => r.hasC && r.rookies >= 2 && r.rookies <= 3 && r.twoWays === 2 && r.overMax === 0)).toBe(true);
    expect(
      corr(
        rows.map((r) => r.talent),
        rows.map((r) => r.pay),
      ),
    ).toBeGreaterThan(0.4);
    expect(Object.values(l.players).some((p) => p.contract.option && !p.contract.rookie)).toBe(true);
    // only this summer's prospects are still to be drafted: the free-agent veterans aren't next year's rookies
    for (const p of Object.values(l.players)) if (p.tid !== DRAFT_PROSPECT) expect(p.draft.year).toBeLessThan(l.season);
  }

  // breaks lottery ties with a seeded draw, the same on every call (T17)
  {
    const orders = [1, 2, 3, 4].map((seed) => {
      const l = txLeague(seed);
      for (const t of l.teams) {
        const ts = t.seasons[t.seasons.length - 1];
        ts.won = 41;
        ts.lost = 41;
      }
      const a = draftStandings(l).map((x) => x.tid);
      expect(draftStandings(l).map((x) => x.tid)).toEqual(a);
      return a.join();
    });
    expect(new Set(orders).size).toBeGreaterThan(1);
  }
}, 120_000);

it('competing offers for top free agents (W5, B2), and the player priorities they weigh', () => {
  // only top free agents weigh offers, and only in the summer
  {
    const { l, open } = bidsSummer();
    open(U, 41, 0.5);
    const [star] = stars(l, 1);
    const role = freeAgent(l, freeAgents(l)[1], 70);
    expect(marqueeFA(l, star)).toBe(true);
    expect(marqueeFA(l, role)).toBe(false);
    // a role player signs on the spot
    const ask = askingContract(l, role, U);
    expect(userOffer(l, role.pid, ask.amount, ask.years).ok).toBe(true);
    expect(role.tid).toBe(U);
    // the star waits for his decision day
    const res = bidAtAsk(l, star);
    expect(res.ok).toBe(true);
    expect(res.reason).toMatch(/decides on day [23]/);
    expect(star.tid).toBe(FREE_AGENT);
    expect(pendingBid(l, star.pid)!.decideDay).toBeGreaterThan(l.faDay);
    l.phase = 'preseason';
    expect(marqueeFA(l, star)).toBe(false);
  }

  // an offer at his asking price beats a team he likes less
  {
    const { l, open } = bidsSummer();
    open(U, 60, 0.9);
    open(R, 22, 0.1);
    const [star] = stars(l, 1);
    expect(faInterest(l, star).map((o) => o.tid)).toEqual([R]);
    expect(teamAppeal(l, U, star)).toBeGreaterThan(teamAppeal(l, R, star) + 0.05);
    const ask = askingContract(l, star, U);
    expect(bidStanding(l, star, ask.amount, ask.years).leads).toBe(true);
    expect(bidAtAsk(l, star).ok).toBe(true);
    resolveBids(l);
    expect(star.tid).toBe(U);
    expect(l.inbox[0].subject).toMatch(/chose us/);
    expect(l.inbox[0].body).toMatch(new RegExp(`over ${l.teams[R].abbrev}`));
    expect(l.faBids).toBeUndefined();
  }

  // a much more appealing team beats an offer at the asking price, and the inbox compares terms
  {
    const { l, open } = bidsSummer();
    open(U, 20, 0.1);
    open(R, 62, 0.95);
    const [star] = stars(l, 1);
    const ask = askingContract(l, star, U);
    const standing = bidStanding(l, star, ask.amount, ask.years);
    expect(standing.leads).toBe(false);
    // (null: not even a max offer would top theirs)
    expect(standing.toLead === null || standing.toLead > ask.amount).toBe(true);
    expect(bidAtAsk(l, star).ok).toBe(true);
    resolveBids(l);
    expect(star.tid).toBe(R);
    expect(l.inbox[0].subject).toBe(`${star.firstName} ${star.lastName} signed with ${l.teams[R].abbrev}`.trim());
    expect(l.inbox[0].body).toMatch(/Their offer: .* Our offer: /);
  }

  // refuses offers under 90% of his asking price, states his floor, and a raised offer replaces the first
  {
    const { l, open } = bidsSummer();
    open(U, 41, 0.5);
    const [star] = stars(l, 1);
    const ask = askingContract(l, star, U);
    const floor = bidFloor(l, star, ask.years);
    expect(floor).toBeGreaterThanOrEqual(ask.amount * 0.9);
    expect(floor).toBeLessThan(ask.amount);
    const low = userBid(l, star.pid, floor - 50, ask.years);
    expect(low.ok).toBe(false);
    expect(low.reason).toContain(`$${(floor / 1000).toFixed(1)}M`);
    expect(userBid(l, star.pid, floor, ask.years).ok).toBe(true);
    const first = { ...pendingBid(l, star.pid)! };
    l.faDay = 1;
    expect(userBid(l, star.pid, ask.amount, ask.years).reason).toMatch(/^Offer raised/);
    expect(l.faBids).toHaveLength(1);
    expect(pendingBid(l, star.pid)).toMatchObject({ amount: ask.amount, day: first.day, decideDay: first.decideDay });
    expect(withdrawBid(l, star.pid).ok).toBe(true);
    expect(l.faBids).toBeUndefined();
  }

  // below his asking price an offer wins against rival bids he likes less, and alone: with nobody
  // else's money there, he doesn't hold out (to take less a day later)
  {
    for (const rival of [true, false]) {
      const { l, open } = bidsSummer();
      open(U, 60, 0.9);
      if (rival) open(R, 22, 0.1);
      const [star] = stars(l, 1);
      const ask = askingContract(l, star, U);
      const bid = Math.ceil((ask.amount * 0.95) / 50) * 50;
      if (!rival) expect(bidStanding(l, star, bid, ask.years)).toMatchObject({ leads: true, toLead: bidFloor(l, star, ask.years) });
      expect(userBid(l, star.pid, bid, ask.years).ok).toBe(true);
      resolveBids(l);
      expect(star.tid).toBe(U);
    }
  }

  // counts pending offers against cap space, the mid-level and roster spots, so they can't be spent twice
  {
    const { l, s, open } = bidsSummer();
    const [a, b] = stars(l, 2);
    const role = freeAgent(l, freeAgents(l)[2], 75);
    expect(marqueeFA(l, role)).toBe(false);
    const askA = askingContract(l, a, U).amount;
    open(U, 41, 0.5, askA + 5_000);
    expect(bidAtAsk(l, a).ok).toBe(true);
    expect(pendingBid(l, a.pid)!.route).toBe('space');
    // the space a holds is gone for b, and for an on-the-spot signing too
    const second = bidAtAsk(l, b);
    expect(second.ok).toBe(false);
    expect(second.reason).toMatch(/after your pending offers/);
    const roleAsk = askingContract(l, role, U);
    expect(roleAsk.amount).toBeGreaterThan(5_000);
    expect(offerBlockedReason(l, role, roleAsk.amount, roleAsk.years)).toMatch(/after your pending offers/);
    expect(userOffer(l, role.pid, roleAsk.amount, roleAsk.years).ok).toBe(false);
    // the mid-level: while a's offer holds the cap space it's gone (using the space ends it, as a
    // pending mid-level offer keeps the space shut)
    l.teams[U].mleSeason = undefined;
    const c = freeAgent(
      l,
      freeAgents(l).find((p) => ![a.pid, b.pid, role.pid].includes(p.pid))!,
      78,
    );
    const cAsk = askingContract(l, c, U);
    expect(marqueeFA(l, c)).toBe(true);
    expect(userMleRoom(l, s, c.pid)).toBe(0);
    expect(userBid(l, c.pid, cAsk.amount, cAsk.years).ok).toBe(false);
    // over the cap with a's offer withdrawn, a third top player can lean on it, and then nothing else can
    expect(withdrawBid(l, a.pid).ok).toBe(true);
    l.teams[U].deadMoney.push({ pid: -4, name: 'w', season: s, amount: askA + 5_000 });
    const mle = userMleRoom(l, s, c.pid);
    expect(mle).toBeGreaterThanOrEqual(bidFloor(l, c, cAsk.years));
    expect(userBid(l, c.pid, Math.min(mle, cAsk.amount), cAsk.years).ok).toBe(true);
    expect(pendingBid(l, c.pid)!.route).toBe('mle');
    expect(userMleRoom(l, s)).toBe(0);
    expect(offerBlockedReason(l, role, roleAsk.amount, roleAsk.years)).toMatch(/Over the cap you can offer his minimum \(\$[\d.]+M\)\.$/);
    withdrawBid(l, c.pid);
    l.teams[U].mleSeason = s;
    l.teams[U].deadMoney.pop();
    // with a's offer withdrawn, its room is free again
    expect(userOffer(l, role.pid, roleAsk.amount, roleAsk.years).ok).toBe(true);
    // roster spots: 20 signed and one pending offer fill the 21
    l.teams[U].deadMoney = [];
    expect(bidAtAsk(l, a).ok).toBe(true);
    while (standardRoster(l, U).length < 20)
      signPlayer(l, freeAgents(l).filter((p) => p.pid !== a.pid && p.pid !== b.pid)[0], U, CAP_FOR(l, s).vetMin, 1, { news: false, start: s });
    expect(bidAtAsk(l, b).reason).toMatch(/full \(21\) counting your 1 pending offer/);
  }

  // an offer the user can no longer pay for falls through, with an explanation
  {
    for (const rival of [true, false]) {
      const { l, s, cap, open } = bidsSummer();
      open(U, 60, 0.9);
      if (rival) open(R, 22, 0.1);
      const [star] = stars(l, 1);
      expect(bidAtAsk(l, star).ok).toBe(true);
      // say a trade took on salary meanwhile: the space is gone
      l.teams[U].deadMoney.push({ pid: -3, name: 'z', season: s, amount: cap.salaryCap });
      resolveBids(l);
      expect(star.tid).toBe(rival ? R : FREE_AGENT);
      expect(l.inbox[0].body).toMatch(/fell through: we no longer have the cap space/);
      expect(l.faBids).toBeUndefined();
    }
  }

  // a minimum signing while an offer is pending does not void it: it could have come after
  {
    const { l, s, open } = bidsSummer();
    const [star] = stars(l, 1);
    const ask = askingContract(l, star, U).amount;
    open(U, 60, 0.9, ask + 500);
    expect(bidAtAsk(l, star).ok).toBe(true);
    const cheap = freeAgents(l).find((p) => p.pid !== star.pid && askingContract(l, p, U).amount <= CAP_FOR(l, s).vetMin)!;
    const min = askingContract(l, cheap, U);
    expect(userOffer(l, cheap.pid, min.amount, min.years).reason).toMatch(/signed|accepts/);
    expect(payroll(l, U, s) + ask).toBeGreaterThan(CAP_FOR(l, s).salaryCap);
    resolveBids(l);
    expect(star.tid).toBe(U);
  }

  // a pending offer on cap space ends the mid-level: no signing on it can land beside the space signing
  {
    const { l, s, cap, open } = bidsSummer();
    const [star] = stars(l, 1);
    open(U, 41, 0.5);
    const ask = askingContract(l, star, U).amount;
    l.teams[U].deadMoney.push({ pid: -2, name: 'y', season: s, amount: cap.salaryCap - payroll(l, U, s) - ask - 2_000 });
    l.teams[U].mleSeason = undefined;
    // a player the room exception can't pay but the mid-level could
    const role = freeAgent(
      l,
      freeAgents(l).find((p) => p.pid !== star.pid)!,
      76,
    );
    const roleAsk = askingContract(l, role, U);
    expect(marqueeFA(l, role)).toBe(false);
    expect(roleAsk.amount).toBeGreaterThan(exceptionAmount(l, 'room', s));
    expect(roleAsk.amount).toBeLessThan(exceptionAmount(l, 'mle', s));
    expect(userMleRoom(l, s, role.pid)).toBeGreaterThan(roleAsk.amount);
    expect(bidAtAsk(l, star).ok).toBe(true);
    expect(pendingBid(l, star.pid)!.route).toBe('space');
    expect(userMleRoom(l, s, role.pid)).toBe(0);
    const res = userOffer(l, role.pid, roleAsk.amount, Math.min(4, roleAsk.years));
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/uses your cap space, and a team that uses its space loses the mid-level/);
    expect(role.tid).toBe(FREE_AGENT);
    resolveBids(l);
    expect(star.tid).toBe(U);
    expect(l.teams[U]).toMatchObject({ spaceSeason: s, mleSeason: undefined });
    expect(payroll(l, U, s)).toBeLessThanOrEqual(cap.salaryCap);
  }

  // an exception signing counts against a pending offer on cap space; only a minimum signing could have come after it
  {
    const { l, s, cap, open } = bidsSummer();
    const [star] = stars(l, 1);
    open(U, 41, 0.5);
    const ask = askingContract(l, star, U).amount;
    l.teams[U].deadMoney.push({ pid: -2, name: 'y', season: s, amount: cap.salaryCap - payroll(l, U, s) - ask - 1_000 });
    l.teams[U].baeSeason = undefined;
    expect(bidAtAsk(l, star).ok).toBe(true);
    const others = freeAgents(l).filter((p) => p.pid !== star.pid);
    const bae = exceptionAmount(l, 'bae', s);
    const cheap = others.find((p) => askingContract(l, p, U).amount <= CAP_FOR(l, s).vetMin)!;
    const role = freeAgent(
      l,
      others.find((p) => p !== cheap)!,
      70,
    );
    const roleAsk = askingContract(l, role, U);
    expect(roleAsk.amount).toBeGreaterThan(1_000);
    expect(roleAsk.amount * 1.1).toBeLessThanOrEqual(bae);
    // (a bi-annual deal runs two years: his price for that length)
    const years = Math.min(2, roleAsk.years);
    expect(userOffer(l, role.pid, Math.min(bae, Math.ceil((roleAsk.amount * (1 + 0.03 * (roleAsk.years - years))) / 50) * 50), years).ok).toBe(true);
    expect(l.teams[U].baeSeason).toBe(s);
    expect(pendingBid(l, star.pid)!.slack).toBeUndefined();
    const min = askingContract(l, cheap, U);
    expect(userOffer(l, cheap.pid, min.amount, min.years).ok).toBe(true);
    expect(pendingBid(l, star.pid)!.slack).toBe(cheap.contract.salaries[0]);
  }

  // a contender's offer stays within the cap space its market holds leave, and wins only on a route it can pay with
  {
    const { l, s, cap, open } = bidsSummer();
    open(U, 20, 0.1);
    open(R, 60, 0.9);
    l.teams[R].strategy = 'contend';
    const [star] = stars(l, 1);
    const askR = askingContract(l, star, R);
    // space for his ask and 5% more, before a restricted free agent's cap hold of $1M
    const more = Math.round((askR.amount * 1.05) / 50) * 50;
    l.teams[R].deadMoney.push({ pid: -5, name: 'v', season: s, amount: cap.salaryCap - payroll(l, R, s) - more - 200 });
    const rfa = freeAgents(l).find((p) => p.pid !== star.pid)!;
    rfa.rfa = { tid: R, qo: 1_000, hold: 1_000 };
    const space = capSpace(l, R, s);
    expect(space).toBeGreaterThanOrEqual(askR.amount);
    expect(space).toBeLessThan(more);
    const [offer] = faInterest(l, star);
    expect(offer).toMatchObject({ tid: R, route: 'space' });
    expect(offer.amount).toBeGreaterThanOrEqual(askR.amount);
    expect(offer.amount).toBeLessThanOrEqual(space);
    // the user's floor loses to it, and R pays with its space
    expect(userBid(l, star.pid, bidFloor(l, star, askR.years), askR.years).ok).toBe(true);
    resolveBids(l);
    expect(star.tid).toBe(R);
    expect(star.contract.salaries[0]).toBe(offer.amount);
    expect(l.teams[R].spaceSeason).toBe(s);
    expect(payroll(l, R, s) + heldSalary(l, R, s)).toBeLessThanOrEqual(cap.salaryCap);
  }

  // AI teams never sign a player weighing the user's offer before his decision day
  {
    const { l, open } = bidsSummer();
    // every team can pay him
    for (const t of l.teams) open(t.tid, 41, 0.5);
    const [star] = stars(l, 1, 90);
    const control = structuredClone(l);
    expect(bidAtAsk(l, star).ok).toBe(true);
    pendingBid(l, star.pid)!.decideDay = 4;
    const run = (x: League, days: number) => {
      const rng = new Rng(3);
      for (let d = 0; d < days; d++) {
        faDay(x, rng, 5);
        x.faDay++;
      }
    };
    // without the offer somebody signs him within three days
    run(control, 3);
    expect(control.players[star.pid].tid).toBeGreaterThanOrEqual(0);
    run(l, 3);
    expect(star.tid).toBe(FREE_AGENT);
    expect(pendingBid(l, star.pid)).toBeDefined();
    // the fourth day's market opens with his decision
    run(l, 1);
    expect(star.tid).toBeGreaterThanOrEqual(0);
    expect(l.faBids).toBeUndefined();
  }

  // advancing free agency to its end decides every offer, and offers made on the last day are decided as it closes
  {
    const l = bidsLeague(7);
    l.phase = 'resign';
    startFreeAgency(l);
    const s = contractSeason(l);
    const give = () => {
      l.teams[U].deadMoney = [];
      l.teams[U].mleSeason = undefined;
      for (const p of standardRoster(l, U)) p.contract = { start: s, salaries: [CAP_FOR(l, s).vetMin] };
    };
    give();
    // (restricted free agents sign offer sheets instead: AI teams may already have signed some)
    const pool = freeAgents(l)
      .filter((p) => !p.rfa)
      .sort((a, b) => b.ovr - a.ovr);
    const targets = pool.slice(0, 3).map((p) => freeAgent(l, p, 84));
    for (const p of targets) expect(bidAtAsk(l, p).ok).toBe(true);
    faAdvance(l, 1);
    const late = freeAgent(l, freeAgents(l).filter((p) => !pendingBid(l, p.pid) && !p.rfa)[0], 84);
    expect(bidAtAsk(l, late).ok).toBe(true);
    faAdvance(l, FA_DAYS);
    expect(l.faBids).toBeUndefined();
    for (const p of [...targets, late]) expect(pendingBid(l, p.pid)).toBeUndefined();
    // the last day: decided when the market closes
    give();
    const last = freeAgent(l, freeAgents(l)[0], 86);
    const res = bidAtAsk(l, last);
    expect(res.reason).toMatch(/when free agency closes/);
    expect(newSeason(l)).toBe(true);
    expect(l.faBids).toBeUndefined();
    expect(last.waivers).toBeUndefined();
  }

  // opens free agency for every team at once: AI teams make their first wave of signings with the user, but no top free agent decides before the second day
  {
    const l = bidsLeague(9);
    l.phase = 'resign';
    const before = new Map(Object.values(l.players).map((p) => [p.pid, p.tid]));
    startFreeAgency(l);
    const moved = Object.values(l.players).filter((p) => p.tid >= 0 && p.tid !== l.userTid && before.get(p.pid) !== p.tid);
    expect(moved.length).toBeGreaterThan(0);
    // the top free agents (worth 78+) decide from the market's second day: all still there for the user's bids
    expect(moved.filter((p) => valueScore(l, p) >= 78)).toEqual([]);
    expect(freeAgents(l).some((p) => marqueeFA(l, p))).toBe(true);
  }

  // are fixed for a player in a league, average 1, and price teams as before on average
  {
    const l = bidsLeague();
    const ps = Object.values(l.players).filter((p) => p.tid >= FREE_AGENT);
    expect(ps.length).toBeGreaterThan(300);
    const copy = structuredClone(l);
    for (const p of ps.slice(0, 40)) {
      const w = playerPrefs(l, p);
      expect(playerPrefs(copy, p)).toEqual(w);
      expect(PREF_KEYS.reduce((a, k) => a + w[k], 0) / PREF_KEYS.length).toBeCloseTo(1, 10);
    }
    // another league, another personality
    const other = { ...l, id: 'elsewhere' };
    expect(ps.slice(0, 20).some((p) => playerPrefs(other, p).winning !== playerPrefs(l, p).winning)).toBe(true);
    for (const k of PREF_KEYS) expect(Math.abs(ps.reduce((a, p) => a + playerPrefs(l, p)[k], 0) / ps.length - 1)).toBeLessThan(0.05);
    // shape a spread of records and markets, so the terms the priorities weigh aren't all zero
    l.teams.forEach((t, i) => {
      const ts = curTeamSeason(l, t.tid);
      ts.won = 20 + ((i * 7) % 43);
      ts.lost = 82 - ts.won;
      t.hype = (i % 10) / 10;
    });
    for (const tid of [0, 7, 13, 22]) {
      const mean = (f: (p: Player) => number) => ps.reduce((a, p) => a + f(p), 0) / ps.length;
      expect(Math.abs(mean((p) => teamAppeal(l, tid, p)) - mean((p) => teamAppeal(l, tid, p, EVEN_PREFS)))).toBeLessThan(0.01);
    }
    // a player who cares about winning likes a winner more than one who doesn't
    const p = ps[0];
    const winner = l.teams.map((t) => t.tid).sort((a, b) => curTeamSeason(l, b).won - curTeamSeason(l, a).won)[0];
    expect(teamAppeal(l, winner, p, { ...EVEN_PREFS, winning: 1.6 })).toBeGreaterThan(teamAppeal(l, winner, p, { ...EVEN_PREFS, winning: 0.4 }));
  }
}, 120_000);

it('restricted free agency: qualifying offers, cap holds, offer sheets and matching on both sides, AI teams, the close of free agency and the log', () => {
  // a first-round pick finishing his rookie scale, or a player with three seasons or fewer counting this one; never a two-way, a deal still running, or one coming off a qualifying offer
  {
    const { l } = resignPhase();
    const [a, b, c, d] = teamPlayers(l, U).slice(1, 5);
    young(l, a, U, { pick: 5, exp: 3 });
    expect(serviceYears(l, a)).toBe(4);
    expect(rfaEligible(l, a)).toBe(true);
    young(l, b, U, { exp: 2 });
    expect(rfaEligible(l, b)).toBe(true);
    young(l, c, U, { exp: 3 });
    expect(rfaEligible(l, c)).toBe(false);
    // a season he didn't play doesn't count
    young(l, c, U, { exp: 3, played: false });
    expect(serviceYears(l, c)).toBe(3);
    expect(rfaEligible(l, c)).toBe(true);
    young(l, d, U, { exp: 1 });
    d.contract.twoWay = true;
    expect(rfaEligible(l, d)).toBe(false);
    d.contract = { start: l.season, salaries: [3000, 3000] };
    expect(rfaEligible(l, d)).toBe(false);
    young(l, d, U, { exp: 1 });
    d.contract.qualifying = true;
    expect(rfaEligible(l, d)).toBe(false);
    expect(qualifyBlockedReason(l, d)).toMatch(/qualifying offer: he is unrestricted/);
  }

  // is 130% of a #1 pick’s final salary rising to 150% for #30, and 125% for anyone else, never under the minimum plus $200K
  {
    const { l } = resignPhase();
    const p = teamPlayers(l, U)[1];
    const next = l.season + 1;
    young(l, p, U, { pick: 1, final: 10_000 });
    expect(qualifyingOffer(l, p)).toBe(13_000);
    young(l, p, U, { pick: 30, final: 3_000 });
    expect(qualifyingOffer(l, p)).toBe(4_500);
    young(l, p, U, { pick: 15, final: 4_000 });
    expect(qualifyingOffer(l, p)).toBe(Math.round((4_000 * (1.3 + (0.2 * 14) / 29)) / 10) * 10);
    young(l, p, U, { final: 4_000 });
    expect(qualifyingOffer(l, p)).toBe(5_000);
    young(l, p, U, { exp: 1, final: CAP_FOR(l).minContract });
    const floor = CAP_FOR(l, next).minContract + Math.round((200 * revenueScale(l, next)) / 10) * 10;
    expect(qualifyingOffer(l, p)).toBe(Math.max(floor, Math.round((CAP_FOR(l).minContract * 1.25) / 10) * 10));
    expect(qualifyingOffer(l, p)).toBeGreaterThanOrEqual(floor);
  }

  // the user extends one in the re-sign period: logged, held at the larger of the offer and his ask, and withdrawn or renounced away
  {
    const { l, p } = resignPhase();
    const before = capHolds(l, U).find((h) => h.p.pid === p.pid)!.amount;
    const [t] = logged(l, () => expect(userQualify(l, p.pid).ok).toBe(true));
    expect(t).toMatchObject({ kind: 'qualify', note: 'extended', amount: p.rfa!.qo, tids: [U] });
    expect(text(l, t, { tid: U })).toBe(`Extended a qualifying offer to ${playerName(p)} ($${(p.rfa!.qo / 1000).toFixed(1)}M)`);
    expect(p.rfa).toMatchObject({ tid: U });
    expect(capHolds(l, U).find((h) => h.p.pid === p.pid)!.amount).toBe(Math.max(before, p.rfa!.qo));
    expect(userQualify(l, p.pid).reason).toMatch(/already has a qualifying offer/);
    const [w] = logged(l, () => expect(userWithdrawQualifying(l, p.pid).ok).toBe(true));
    expect(w.note).toBe('withdrawn');
    expect(p.rfa).toBeUndefined();
    // renouncing his rights takes the offer with them
    userQualify(l, p.pid);
    expect(renouncePlayer(l, p.pid).ok).toBe(true);
    expect(p.rfa).toBeUndefined();
    expect(p.tid).toBe(FREE_AGENT);
  }

  // a release takes his qualifying offer with it, as renouncing does: he is unrestricted, with no cap hold on the team that let him go
  {
    const { l, p } = resignPhase();
    expect(userQualify(l, p.pid).ok).toBe(true);
    releasePlayer(l, p, { news: false });
    expect(p.tid).toBe(FREE_AGENT);
    expect(p.rfa).toBeUndefined();
    l.phase = 'freeAgency';
    expect(restrictedFreeAgents(l, U)).toEqual([]);
    expect(marketHolds(l, U, l.season + 1)).toEqual([]);
  }

  // only in the re-sign period, only for eligible players of his own team, and he holds room
  {
    const { l, p } = resignPhase();
    l.phase = 'draft';
    expect(userQualify(l, p.pid).reason).toMatch(/re-sign period/);
    l.phase = 'resign';
    const vet = young(l, teamPlayers(l, U)[1], U, { exp: 6 });
    expect(userQualify(l, vet.pid).reason).toMatch(/rookie-scale deal, or a player with 3 seasons or fewer/);
    const theirs = young(l, teamPlayers(l, R)[0], R);
    expect(userQualify(l, theirs.pid).reason).toBe('Not on your team.');
    expect(userQualify(l, p.pid).ok).toBe(true);
    expect(capHolds(l, U).find((h) => h.p.pid === p.pid)?.amount).toBe(Math.max(p.rfa!.qo, askingContract(l, p, U).amount));
  }

  // free agency opens with him restricted: his hold stays on his team’s cap through it (capPayroll and space too) until it is withdrawn, and he never weighs bids
  {
    const { l, p } = resignPhase();
    p.ovr = p.pot = 86;
    userQualify(l, p.pid);
    const qo = p.rfa!.qo;
    const ask = askingContract(l, p, U).amount;
    // AI teams move as the market opens: here none of them can pay for an offer sheet
    for (const t of l.teams.filter((x) => x.tid !== U)) {
      t.deadMoney = [{ pid: -1, name: 'x', season: l.season + 1, amount: CAP_FOR(l, l.season + 1).secondApron }];
      t.mleSeason = l.season + 1;
    }
    startFreeAgency(l);
    const s = contractSeason(l);
    expect(p.tid).toBe(FREE_AGENT);
    expect(p.rfa).toMatchObject({ tid: U, qo, hold: Math.max(qo, ask) });
    expect(restrictedFreeAgents(l, U)).toEqual([p]);
    expect(capHolds(l, U)).toEqual([{ p, amount: p.rfa!.hold, kind: 'rfa' }]);
    expect(capPayroll(l, U, s)).toBe(payroll(l, U, s) + p.rfa!.hold!);
    expect(capSpace(l, U, s)).toBe(CAP_FOR(l, s).salaryCap - payroll(l, U, s) - p.rfa!.hold!);
    expect(marqueeFA(l, p)).toBe(false);
    expect(wantsTwoWay(l, p)).toBe(false);
    expect(userTwoWayOffer(l, p.pid).reason).toMatch(/your restricted free agent/);
    expect(userWithdrawQualifying(l, p.pid).reason).toMatch(/unrestricted free agent, and his \$[\d.]+M cap hold is off your books/);
    expect(capHolds(l, U)).toEqual([]);
    expect(capPayroll(l, U, s)).toBe(payroll(l, U, s));
  }

  // his team re-signs him with Bird rights in free agency, over the cap, until he signs an offer sheet
  {
    const { l, s } = rfaSummer();
    const p = rfa(l, U);
    expect(capSpace(l, U, s)).toBeLessThan(0);
    const ask = askingContract(l, p, U);
    const [t] = logged(l, () => expect(userOffer(l, p.pid, ask.amount, ask.years).ok).toBe(true));
    expect(t.kind).toBe('resign');
    expect(p.tid).toBe(U);
    expect(p.rfa).toBeUndefined();
    expect(p.contract.start).toBe(s);
  }

  // the user signs one at his asking price for two to four seasons, paid for like any signing: the room and a roster spot stay held until his team decides
  {
    const { l, s, open } = rfaSummer();
    open(U, 40_000);
    const p = rfa(l, R);
    expect(userOffer(l, p.pid, atAsk(l, p, 1), 1).reason).toBe('Offer sheets run 2 to 4 years.');
    expect(userOffer(l, p.pid, atAsk(l, p, 5), 5).reason).toBe('Offer sheets run 2 to 4 years.');
    // well under his ask: he counters (see contracts.test.ts)
    expect(userOffer(l, p.pid, Math.round((atAsk(l, p, 3) * 0.8) / 50) * 50, 3).reason).toMatch(/counters at/);
    const amount = atAsk(l, p, 3);
    const space = capSpace(l, U, s);
    const [t] = logged(l, () => expect(userOffer(l, p.pid, amount, 3).reason).toMatch(/Offer sheet signed: the .* have until the end of day 2 to match/));
    expect(t).toMatchObject({ kind: 'offerSheet', tids: [U, R], amount, years: 3 });
    expect(text(l, t, { tid: U })).toBe(
      `Signed ${playerName(p)} to an offer sheet: 3 yrs / $${((amount + Math.round((amount * 1.05) / 10) * 10 + Math.round((amount * 1.1025) / 10) * 10) / 1000).toFixed(1)}M (${l.teams[R].abbrev} can match)`,
    );
    expect(p.tid).toBe(FREE_AGENT);
    expect(p.rfa!.sheet).toMatchObject({ tid: U, amount, years: 3, route: 'space', day: 0, until: 1 });
    expect(capSpace(l, U, s)).toBe(space - amount);
    expect(marketHolds(l, U).map((h) => h.kind)).toEqual(['sheet']);
    // nobody else can sign him meanwhile, the user included
    expect(sheetBlockedReason(l, p, 3)).toMatch(/has signed an offer sheet with the .*: the .* decide by the end of day 2/);
    expect(userBid(l, p.pid, amount, 3).ok).toBe(false);
  }

  // a pending sheet and offers to top free agents share the user’s room and roster spots, so neither is spent twice
  {
    const { l, s, cap, open } = rfaSummer();
    const p = rfa(l, R);
    const amount = atAsk(l, p, 3);
    open(U, amount + 3_000);
    expect(userOffer(l, p.pid, amount, 3).ok).toBe(true);
    // a top free agent: the space the sheet holds is gone for an offer to him
    const star = freeAgents(l).find((x) => !x.rfa)!;
    star.ovr = star.pot = 86;
    star.bornYear = l.season - 27;
    star.experience = 6;
    star.asking = undefined;
    star.asking = askingContract(l, star);
    expect(marqueeFA(l, star)).toBe(true);
    const ask = askingContract(l, star, U);
    expect(userBid(l, star.pid, ask.amount, ask.years).reason).toMatch(/after your pending offers/);
    // roster spots: 20 signed and the sheet fill the 21
    while (standardRoster(l, U).length < OFFSEASON_ROSTER_MAX - 1) signPlayer(l, freeAgents(l).filter((x) => !x.rfa && x !== star)[0], U, cap.vetMin, 1, { news: false, start: s });
    expect(userBid(l, star.pid, cap.maxContract(star.experience), ask.years).reason).toMatch(/full \(21\) counting your 1 pending offer/);
  }

  // his AI team matches a sheet worth having that fits its payroll: he stays on exactly its terms and the user’s room is free again
  {
    const { l, s, open } = rfaSummer();
    open(U, 40_000);
    open(R);
    const p = rfa(l, R);
    const amount = atAsk(l, p, 3);
    userOffer(l, p.pid, amount, 3);
    expect(aiMatchVerdict(l, p).match).toBe(true);
    // decided at the end of its last match day (day 2, faDay 1), not before
    resolveOfferSheets(l, 0);
    expect(p.rfa?.sheet).toBeDefined();
    const [t] = logged(l, () => resolveOfferSheets(l, 1));
    expect(t).toMatchObject({ kind: 'match', note: 'matched', tids: [R, U], years: 3 });
    expect(text(l, t, { pid: p.pid })).toMatch(new RegExp(`^Offer sheet from ${l.teams[U].abbrev} matched by ${l.teams[R].abbrev}: 3 yrs`));
    expect(p.tid).toBe(R);
    expect(p.rfa).toBeUndefined();
    expect(p.contract).toEqual(makeContract(l, amount, 3, s, p.experience));
    expect(p.tradeLock).toEqual({ season: s, day: 56 });
    expect(l.inbox[0].subject).toMatch(/matched our offer sheet/);
    expect(capSpace(l, U, s)).toBe(40_000);
  }

  // an overpay that busts its payroll is let go: he joins the user, who hears why
  {
    const { l, s, cap, open } = rfaSummer();
    open(U, 40_000);
    open(R);
    l.teams[R].deadMoney.push({ pid: -4, name: 'z', season: s, amount: cap.luxuryTax });
    const p = rfa(l, R);
    userOffer(l, p.pid, atAsk(l, p, 4), 4);
    expect(aiMatchVerdict(l, p)).toEqual({ match: false, why: 'it would take their payroll past what they will spend' });
    resolveOfferSheets(l);
    expect(p.tid).toBe(U);
    expect(p.contract.salaries).toHaveLength(4);
    expect(l.inbox[0].subject).toBe(`${playerName(p)} is ours`);
    expect(l.inbox[0].body).toMatch(/declined to match our offer sheet: it would take their payroll past what they will spend/);
  }

  // a mid-level sheet reserves the exception, and a match gives it back
  {
    const { l, s, open } = rfaSummer();
    open(R);
    open(U, 0);
    l.teams[U].mleSeason = undefined;
    const p = rfa(l, R, { ovr: 74 });
    const amount = atAsk(l, p, 3);
    expect(offerRoute(l, p, amount, s)).toBe('mle');
    expect(userOffer(l, p.pid, amount, 3).ok).toBe(true);
    expect(p.rfa!.sheet!.route).toBe('mle');
    expect(l.teams[U].mleSeason).toBe(s);
    expect(aiMatchVerdict(l, p).match).toBe(true);
    resolveOfferSheets(l);
    expect(p.tid).toBe(R);
    expect(l.teams[U].mleSeason).toBeUndefined();
  }

  // an AI sheet on the user’s restricted free agent asks him in the inbox; matching needs a roster spot but not cap room, and he can let him go
  {
    const { l, s, cap, open } = rfaSummer();
    open(R);
    const p = rfa(l, U);
    expect(capSpace(l, U, s)).toBeLessThan(0);
    signOfferSheet(l, p, R, 12_000, 4, 'space', 1);
    expect(l.inbox[0]).toMatchObject({ important: true, sheet: p.pid, tone: 'alert' });
    expect(l.inbox[0].body).toMatch(/Match it by the end of day 3 and he stays with us on exactly those terms/);
    // full roster for next season (players under contract for it): no match until a spot opens
    while (summerRoster(l, U) < OFFSEASON_ROSTER_MAX) signPlayer(l, freeAgents(l).filter((x) => !x.rfa)[0], U, cap.vetMin, 1, { news: false, start: s });
    expect(sheetDecisionBlocked(l, p.pid, true)).toMatch(/roster spot: yours is full \(21\)/);
    expect(userDecideSheet(l, p.pid, true).ok).toBe(false);
    teamPlayers(l, U).find((x) => contractExp(x.contract) >= s)!.tid = RETIRED;
    const [t] = logged(l, () => expect(userDecideSheet(l, p.pid, true).reason).toMatch(/^Matched: .* stays on 4 yrs/));
    expect(text(l, t, { tid: U })).toMatch(new RegExp(`^Matched ${l.teams[R].abbrev}'s offer sheet for ${playerName(p)}: 4 yrs`));
    expect(p.tid).toBe(U);
    expect(p.contract).toEqual(makeContract(l, 12_000, 4, s, p.experience));
    expect(sheetDecisionBlocked(l, p.pid, false)).toBe('This offer sheet has been decided.');
    // the next one he lets go
    const q = rfa(l, U);
    signOfferSheet(l, q, R, 9_000, 3, 'space', 1);
    expect(userDecideSheet(l, q.pid, false).ok).toBe(true);
    expect(q.tid).toBe(R);
    expect(q.contract).toEqual(makeContract(l, 9_000, 3, s, q.experience));
    // one signed on the next-to-last day runs to the close, and the mail and the news say so
    const z = rfa(l, U);
    signOfferSheet(l, z, R, 9_000, 3, 'space', FA_DAYS - 2);
    expect(l.inbox[0].body).toMatch(new RegExp(`Match it by the end of day ${FA_DAYS} \\(when free agency closes\\) and he stays with us`));
    expect(l.news.at(-1)!.text).toMatch(new RegExp(`can match it by the end of day ${FA_DAYS} \\(when free agency closes\\)\\.$`));
  }

  // left unanswered past its last match day, the sheet lets him go, and the inbox says so
  {
    const { l, open } = rfaSummer();
    open(R);
    const p = rfa(l, U);
    signOfferSheet(l, p, R, 12_000, 4, 'space', 3);
    resolveOfferSheets(l, 3);
    expect(p.rfa?.sheet).toBeDefined();
    const [t] = logged(l, () => resolveOfferSheets(l, 4));
    expect(t).toMatchObject({ kind: 'match', note: 'declined', tids: [U, R] });
    expect(text(l, t, { tid: R })).toMatch(new RegExp(`^Got ${playerName(p)} when ${l.teams[U].abbrev} declined to match the offer sheet: 4 yrs`));
    expect(p.tid).toBe(R);
    expect(l.inbox[0].subject).toBe(`${playerName(p)} joins ${l.teams[R].abbrev}`);
    expect(l.inbox[0].body).toMatch(/didn't match .* by the deadline/);
  }

  // free agency stops for an AI sheet on the user’s restricted free agent, and the new season waits for his call
  {
    const { l, open } = rfaSummer(8);
    // every team has room, and he is the one player on the market
    for (const t of l.teams) open(t.tid);
    const p = rfa(l, U, { ovr: 76 });
    for (const x of freeAgents(l)) if (x !== p) x.tid = RETIRED;
    faAdvance(l, 7);
    const sheet = p.rfa?.sheet;
    expect(sheet).toBeDefined();
    expect(l.faDay).toBe(sheet!.day);
    expect(l.faDay).toBeLessThan(7);
    expect(sheet!.until).toBe(sheet!.day + 1);
    expect(l.inbox[0].sheet).toBe(p.pid);
    expect(newSeasonBlockedReason(l)).toMatch(/signed .* to an offer sheet: match it or let him go first/);
    expect(newSeason(l)).toBe(false);
    expect(l.phase).toBe('freeAgency');
    userDecideSheet(l, p.pid, true);
    expect(newSeasonBlockedReason(l)).toBeNull();
    expect(newSeason(l)).toBe(true);
    expect(p.tid).toBe(U);
  }

  // qualify the young players worth keeping that they let go, not the busts whose offer would overpay them
  {
    const l = rfaLeague();
    l.phase = 'resign';
    const t = l.teams[R];
    const [good, bust, vet] = teamPlayers(l, R);
    young(l, good, R, { ovr: 74, pick: 25, final: 3_000 });
    // a #1 pick whose qualifying offer is far above what he's worth
    young(l, bust, R, { ovr: 66, pick: 1, final: 12_000 });
    young(l, vet, R, { ovr: 78, exp: 6 });
    const log = logged(l, () => aiQualify(l, t));
    expect(log.map((x) => [x.pid, x.note])).toEqual([[good.pid, 'extended']]);
    expect(good.rfa).toMatchObject({ tid: R, qo: qualifyingOffer(l, good) });
    expect(bust.rfa).toBeUndefined();
    expect(vet.rfa).toBeUndefined();
  }

  // come to terms with their restricted free agent after ten days without an offer sheet when it fits, never under his qualifying offer
  {
    const { l, s, open } = rfaSummer();
    open(R);
    const p = rfa(l, R);
    l.faDay = AI_TERMS_DAY - 1;
    aiRfaTerms(l);
    expect(p.rfa).toBeDefined();
    l.faDay = AI_TERMS_DAY;
    const ask = askingContract(l, p, R);
    const qo = p.rfa!.qo;
    const [t] = logged(l, () => aiRfaTerms(l));
    expect(t).toMatchObject({ kind: 'resign', tids: [R], years: ask.years });
    expect(p.tid).toBe(R);
    expect(p.contract.salaries[0]).toBe(makeContract(l, Math.max(ask.amount, qo), 1, s, p.experience).salaries[0]);
    // over what his team will pay to keep him, he waits for the close
    const q = rfa(l, R);
    l.teams[R].deadMoney.push({ pid: -4, name: 'z', season: s, amount: CAP_FOR(l, s).luxuryTax });
    aiRfaTerms(l);
    expect(q.rfa).toBeDefined();
  }

  // never sign a rival’s restricted free agent outright: roster fills and two-way deals pass him by, and sheets are one at a time
  {
    const { l, s, open } = rfaSummer(6);
    const p = rfa(l, R, { ovr: 60, exp: 0 });
    for (const t of l.teams) for (const x of standardRoster(l, t.tid).slice(10)) x.tid = RETIRED;
    for (const x of freeAgents(l)) if (x !== p) x.ovr = x.pot = 40;
    fillRosters(l, new Rng(1), s);
    expect(p.tid).toBe(FREE_AGENT);
    expect(wantsTwoWay(l, p)).toBe(false);
    // a team with a sheet pending signs no second one: B, the one team with room, signs one of
    // them within ten days without it
    open(B);
    const q = rfa(l, R, { ovr: 76 });
    const other = rfa(l, R, { ovr: 76 });
    for (const x of freeAgents(l)) if (x !== other && x !== q) x.tid = RETIRED;
    const sheetsBy = (x: League) => (x.transactions ?? []).filter((t) => t.kind === 'offerSheet' && t.tids[0] === B).length;
    const control = structuredClone(l);
    faAdvance(control, 10);
    expect(sheetsBy(control)).toBeGreaterThan(0);
    // (decided at the end of day 11: pending all ten days)
    signOfferSheet(l, q, B, 15_000, 4, 'space', 9);
    faAdvance(l, 10);
    expect(sheetsBy(l)).toBe(1);
    expect(other.tid).toBe(FREE_AGENT);
    expect(other.rfa?.sheet).toBeUndefined();
    expect(q.rfa?.sheet?.tid).toBe(B);
  }

  // a restricted free agent still unsigned takes his qualifying offer: one season with his team, unrestricted next summer; with his team at 21 it lapses
  {
    const { l, s, cap, open } = rfaSummer();
    open(R);
    const mine = rfa(l, U);
    const theirs = rfa(l, R);
    const lapses = rfa(l, B);
    while (summerRoster(l, B) < OFFSEASON_ROSTER_MAX) signPlayer(l, freeAgents(l).filter((x) => !x.rfa)[0], B, cap.vetMin, 1, { news: false, start: s });
    const qo = mine.rfa!.qo;
    const log = logged(l, () => acceptQualifyingOffers(l));
    expect(log.map((t) => [t.pid, t.kind, t.note, t.years]).sort((a, b) => (a[0] as number) - (b[0] as number))).toEqual(
      [
        [mine.pid, 'qualify', 'accepted', 1],
        [theirs.pid, 'qualify', 'accepted', 1],
      ].sort((a, b) => (a[0] as number) - (b[0] as number)),
    );
    expect(mine.tid).toBe(U);
    expect(mine.contract).toEqual({ start: s, salaries: [qo], qualifying: true });
    expect(theirs.tid).toBe(R);
    expect(lapses.tid).toBe(FREE_AGENT);
    expect(lapses.rfa).toBeUndefined();
    expect(
      text(
        l,
        log.find((t) => t.pid === mine.pid)!,
        { pid: mine.pid },
      ),
    ).toBe(`Took his qualifying offer from ${l.teams[U].abbrev}: 1 yr / $${(qo / 1000).toFixed(1)}M`);
    expect(l.inbox[0].body).toMatch(/signed his qualifying offer: one season at .* He'll be an unrestricted free agent next summer/);
    // a year on, his deal is up and he's unrestricted
    l.season++;
    expect(rfaEligible(l, mine)).toBe(false);
  }

  // newSeason decides the sheets still pending, then the qualifying offers, before the season turns
  {
    const { l, open } = rfaSummer();
    open(R);
    open(B);
    const sheeted = rfa(l, R);
    const left = rfa(l, R);
    l.faDay = 29;
    signOfferSheet(l, sheeted, B, 9_000, 2, 'space', 29);
    expect(sheeted.rfa!.sheet!.until).toBe(29);
    expect(newSeason(l)).toBe(true);
    expect([sheeted.tid === R || sheeted.tid === B, left.tid]).toEqual([true, R]);
    expect(Object.values(l.players).some((x) => x.rfa)).toBe(false);
    expect(curTeamSeason(l, R).season).toBe(l.season);
  }

  // reads each move from both teams and the player
  {
    const { l, open } = rfaSummer();
    open(R);
    open(B);
    const p = rfa(l, R);
    const [sheet] = logged(l, () => signOfferSheet(l, p, B, 10_000, 2, 'space', 1));
    const [ab, ar] = [l.teams[B].abbrev, l.teams[R].abbrev];
    expect(text(l, sheet, { tid: R })).toBe(`${playerName(p)} signed an offer sheet with ${ab}: 2 yrs / $20.5M`);
    expect(text(l, sheet, { pid: p.pid })).toBe(`Signed an offer sheet with ${ab}: 2 yrs / $20.5M`);
    const [m] = logged(l, () => resolveOfferSheets(l));
    expect(text(l, m, { tid: B })).toMatch(
      new RegExp(`^(${ar} matched the offer sheet for ${playerName(p)}|Got ${playerName(p)} when ${ar} declined to match the offer sheet: 2 yrs / \\$20.5M)$`),
    );
    const q = rfa(l, R);
    q.rfa!.tid = U;
    const [w] = logged(l, () => userWithdrawQualifying(l, q.pid));
    expect(text(l, w, { pid: q.pid })).toBe(`Qualifying offer withdrawn by ${l.teams[U].abbrev}`);
    expect(text(l, w, { tid: U })).toBe(`Withdrew ${playerName(q)}'s qualifying offer`);
  }

  // the market holds nothing and signing routes are as before
  {
    const { l, s } = rfaSummer();
    const p = rfa(l, R);
    l.phase = 'preseason';
    expect(marketHolds(l, R, s)).toEqual([]);
    expect(signingRoute(l, R, 1_000_000, s, p)).toBeNull();
    l.phase = 'freeAgency';
    expect(marketHolds(l, R, s)).toHaveLength(1);
  }
}, 120_000);
