// Restricted free agency: who can be qualified and for how much, qualifying offers extended and
// withdrawn, cap holds that stay on through free agency, offer sheets (the user's and AI teams'),
// matching on both sides, free agency stopping for the user's call, qualifying offers taken when the
// market closes, and the log. Fictional leagues with hand-shaped teams keep these fast.
import { describe, expect, it } from 'vitest';
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
  revenueScale,
  standardRoster,
  statsLine,
  teamPlayers,
} from '../league/helpers';
import { askingContract, capSpace, leaveTeam, makeContract, marketHolds, releasePlayer, signPlayer, signingRoute, summerRoster, wantsTwoWay } from '../league/contracts';
import { contractExp } from '../playerGen';
import { capHolds, capPayroll, fillRosters, marqueeFA, offerRoute, renouncePlayer, userBid, userOffer, userResign, userTwoWayOffer } from '../league/freeAgency';
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
import { txnLine, txnText } from '../league/transactions';
import { Rng } from '../random';
import type { League, Player, Txn } from '../types';
import { FREE_AGENT, RETIRED } from '../types';

const U = 0;
const R = 1;
const B = 2;

function league(rngSeed = 5): League {
  const l = createLeague({ name: `rfa${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  // priorities and the offer noise hash the league id: a fixed one keeps runs identical
  l.id = `rfa_${rngSeed}`;
  return l;
}

/**
 * A young player of team `tid` whose deal (`final` a season) runs out this season: OVR = POT, happy,
 * healthy, `exp` seasons before this one and (unless `played` is false) games this season. A first-round
 * `pick` makes it a rookie-scale deal.
 */
function young(l: League, p: Player, tid: number, o: { ovr?: number; age?: number; exp?: number; final?: number; pick?: number; played?: boolean } = {}): Player {
  p.tid = tid;
  p.ovr = p.pot = o.ovr ?? 76;
  p.bornYear = l.season - (o.age ?? 23);
  p.injury = null;
  p.experience = o.exp ?? 2;
  p.mood.tradeRequest = false;
  p.mood.score = 2;
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
  const l = league(rngSeed);
  l.phase = 'resign';
  const p = young(l, teamPlayers(l, U)[0], U);
  return { l, p };
}

/**
 * Free agency where nobody has room but the teams opened up: everyone is over the cap with the
 * mid-level used; an opened team plays its roster on minimums (lots of space, or `space`).
 */
function summer(rngSeed = 5) {
  const l = league(rngSeed);
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

describe('who can be restricted, and the qualifying offer', () => {
  it('a first-round pick finishing his rookie scale, or a player with three seasons or fewer counting this one; never a two-way, a deal still running, or one coming off a qualifying offer', () => {
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
  });

  it('is 130% of a #1 pick’s final salary rising to 150% for #30, and 125% for anyone else, never under the minimum plus $200K', () => {
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
  });
});

describe('qualifying offers', () => {
  it('the user extends one in the re-sign period: logged, held at the larger of the offer and his ask, and withdrawn or renounced away', () => {
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
  });

  it('a release takes his qualifying offer with it, as renouncing does: he is unrestricted, with no cap hold on the team that let him go', () => {
    const { l, p } = resignPhase();
    expect(userQualify(l, p.pid).ok).toBe(true);
    releasePlayer(l, p, { news: false });
    expect(p.tid).toBe(FREE_AGENT);
    expect(p.rfa).toBeUndefined();
    l.phase = 'freeAgency';
    expect(restrictedFreeAgents(l, U)).toEqual([]);
    expect(marketHolds(l, U, l.season + 1)).toEqual([]);
  });

  it('only in the re-sign period, only for eligible players of his own team; a player who asked out can still be qualified, and holds room', () => {
    const { l, p } = resignPhase();
    l.phase = 'draft';
    expect(userQualify(l, p.pid).reason).toMatch(/re-sign period/);
    l.phase = 'resign';
    const vet = young(l, teamPlayers(l, U)[1], U, { exp: 6 });
    expect(userQualify(l, vet.pid).reason).toMatch(/rookie-scale deal, or a player with 3 seasons or fewer/);
    const theirs = young(l, teamPlayers(l, R)[0], R);
    expect(userQualify(l, theirs.pid).reason).toBe('Not on your team.');
    p.mood.tradeRequest = true;
    expect(capHolds(l, U).some((h) => h.p.pid === p.pid)).toBe(false);
    expect(userQualify(l, p.pid).ok).toBe(true);
    expect(capHolds(l, U).some((h) => h.p.pid === p.pid)).toBe(true);
  });

  it('free agency opens with him restricted: his hold stays on his team’s cap through it (capPayroll and space too) until it is withdrawn, and he never weighs bids', () => {
    const { l, p } = resignPhase();
    p.ovr = p.pot = 86;
    userQualify(l, p.pid);
    const qo = p.rfa!.qo;
    const ask = askingContract(l, p, U).amount;
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
  });

  it('his team re-signs him with Bird rights in free agency, over the cap, until he signs an offer sheet; one who asked out won’t', () => {
    const { l, s, cap } = summer();
    const p = rfa(l, U);
    expect(capSpace(l, U, s)).toBeLessThan(0);
    const ask = askingContract(l, p, U);
    const [t] = logged(l, () => expect(userOffer(l, p.pid, ask.amount, ask.years).ok).toBe(true));
    expect(t.kind).toBe('resign');
    expect(p.tid).toBe(U);
    expect(p.rfa).toBeUndefined();
    expect(p.contract.start).toBe(s);
    const q = rfa(l, U);
    q.mood.tradeRequest = true;
    expect(userResign(l, q.pid, cap.maxContract(q.experience), 3).reason).toMatch(/wants out/);
  });
});

describe('offer sheets', () => {
  it('the user signs one at his asking price for two to five seasons, paid for like any signing: the room and a roster spot stay held until his team decides', () => {
    const { l, s, open } = summer();
    open(U, 40_000);
    const p = rfa(l, R);
    expect(userOffer(l, p.pid, atAsk(l, p, 1), 1).reason).toBe('Offer sheets run 2 to 5 years.');
    // well under his ask: he counters (see negotiation.test.ts)
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
  });

  it('a pending sheet and offers to top free agents share the user’s room and roster spots, so neither is spent twice', () => {
    const { l, s, cap, open } = summer();
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
  });

  it('his AI team matches a sheet worth having that fits its payroll: he stays on exactly its terms and the user’s room is free again', () => {
    const { l, s, open } = summer();
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
  });

  it('an overpay that busts its payroll is let go: he joins the user, who hears why', () => {
    const { l, s, cap, open } = summer();
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
  });

  it('a mid-level sheet reserves the exception, and a match gives it back', () => {
    const { l, s, open } = summer();
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
  });

  it('an AI sheet on the user’s restricted free agent asks him in the inbox; matching needs a roster spot but not cap room, and he can let him go', () => {
    const { l, s, cap, open } = summer();
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
  });

  it('left unanswered past its last match day, the sheet lets him go, and the inbox says so', () => {
    const { l, open } = summer();
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
  });

  it('free agency stops for an AI sheet on the user’s restricted free agent, and the new season waits for his call', () => {
    const { l, open } = summer(8);
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
  });
});

describe('AI teams and restricted free agents', () => {
  it('qualify the young players worth keeping that they let go, not the busts whose offer would overpay them', () => {
    const l = league();
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
  });

  it('come to terms with their restricted free agent after ten days without an offer sheet when it fits, never under his qualifying offer', () => {
    const { l, s, open } = summer();
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
  });

  it('never sign a rival’s restricted free agent outright: roster fills and two-way deals pass him by, and sheets are one at a time', () => {
    const { l, s, open } = summer(6);
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
  });
});

describe('the close of free agency', () => {
  it('a restricted free agent still unsigned takes his qualifying offer: one season with his team, unrestricted next summer; with his team at 21 it lapses', () => {
    const { l, s, cap, open } = summer();
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
  });

  it('newSeason decides the sheets still pending, then the qualifying offers, before the season turns', () => {
    const { l, open } = summer();
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
  });
});

describe('the log', () => {
  it('reads each move from both teams and the player', () => {
    const { l, open } = summer();
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
  });
});

describe('outside free agency', () => {
  it('the market holds nothing and signing routes are as before', () => {
    const { l, s } = summer();
    const p = rfa(l, R);
    l.phase = 'preseason';
    expect(marketHolds(l, R, s)).toEqual([]);
    expect(signingRoute(l, R, 1_000_000, s, p)).toBeNull();
    l.phase = 'freeAgency';
    expect(marketHolds(l, R, s)).toHaveLength(1);
  });
});
