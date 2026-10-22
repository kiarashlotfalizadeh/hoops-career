// The CBA's tiers as the game models them: Bird rights (full, Early Bird, none) and what each lets a
// team pay its own player, the five-year deal and 8% raises only on full Bird rights, the max (25,
// 30, 35% of the cap) with the Rose-rule max and the supermax a player's honors earn with his own
// team, a star asking the max of everyone, a team that released a player not signing him again that
// season, AI teams' contract options, second-rounders stashed on two-way deals, role veterans bought
// out and signed by contenders for the minimum, AI teams waiving their end of the bench after a
// trade, what AI teams pay to keep their own, and a good free agent's old team bringing him back
// over the cap. The signing exceptions: the mid-level (8.5% of the cap, 4 years, under the first
// apron), the taxpayer mid-level past it (3.7%, 2 years, under the second), the room exception that
// replaces it once a team has used cap space (5.7%, 2 years) and the bi-annual (3.3%, 2 years, under
// the first apron, not two seasons running, not after the room exception); offer sheets and the
// user's pending offers hold them, and hold a spot under the 21-man summer limit.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { CAP_FOR, OFFSEASON_ROSTER_MAX, contractSeason, freeAgents, payroll, standardRoster, statsLine, teamPlayers, twoWayRoster } from '../league/helpers';
import {
  BAE_PCT,
  EXCEPTIONS,
  MAX_ASK,
  MLE_PCT,
  ROOM_PCT,
  TMLE_PCT,
  aiBuyouts,
  aiOption,
  aiRoute,
  askingContract,
  birdTier,
  exceptionAmount,
  exceptionRoom,
  exceptionUsedReason,
  hardCapLine,
  maxYearsWith,
  marketSalary,
  mleRoom,
  payrollBudget,
  playerMax,
  releasePlayer,
  releasedBy,
  resignLimit,
  routeYears,
  signPlayer,
  signingRoute,
  spendRoute,
  summerRoster,
  teamAppeal,
  valueScore,
} from '../league/contracts';
import { FA_YEARS, aiLateReturns, faInterest, offerBlockedReason, offerRoute, userExceptionRoom, userOffer, userResign } from '../league/freeAgency';
import { aiMatchVerdict, qualifyingOffer, resolveOfferSheets, setRfaHold, sheetDecisionBlocked, signOfferSheet, userDecideSheet } from '../league/rfa';
import { aiPackage } from '../league/aiTrades';
import { executeTrade, tradeRoster, validateTrade } from '../league/trades';
import { draftPlayer, ensureFuturePicks } from '../league/draft';
import { faAdvance } from '../league/season';
import { generatePlayer, DEFAULT_SCALE, blankStats, contractExp } from '../playerGen';
import { Rng } from '../random';
import { CAP } from '../constants';
import type { League, Player } from '../types';
import { DRAFT_PROSPECT, FREE_AGENT } from '../types';

const U = 0;
const AI = 1;

function league(rngSeed = 3): League {
  const l = createLeague({ name: `cba${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  l.id = `cba_${rngSeed}`;
  return l;
}

/** One of team `tid`'s players whose deal runs out this season, in the re-sign period: OVR = POT, `age`, on `salary`, with the team since `since`. */
function expiring(l: League, tid: number, ovr: number, age: number, salary: number, since: number, i = 0): Player {
  const p = standardRoster(l, tid)[i];
  p.ovr = p.pot = ovr;
  p.bornYear = l.season - age;
  p.injury = null;
  p.experience = 6;
  p.contract = { start: l.season, salaries: [salary] };
  p.birdSince = since;
  return p;
}

/** Team AI's player, worth about 84, out of contract and on the market this summer after `seasons` with it. */
function onTheMarket(l: League, i: number, seasons: number): Player {
  const p = standardRoster(l, AI)[i];
  Object.assign(p, { ovr: 84, pot: 84, bornYear: l.season - 27, injury: null, experience: 6, birdSince: l.season + 1 - seasons });
  p.stats.push(blankStats(l.season, AI, false));
  p.tid = FREE_AGENT;
  p.contract = { start: l.season, salaries: [0] };
  return p;
}

/** A free agency (or `phase`) league for the exceptions. */
function excLeague(phase: League['phase'] = 'freeAgency'): League {
  const l = createLeague({ name: 'exc', userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
  l.id = 'exc_9';
  l.phase = phase;
  l.faDay = 1;
  return l;
}

/** Set a team's payroll for the contract season to exactly `amount` (dead money makes up the rest). */
function payTo(l: League, tid: number, amount: number) {
  const s = contractSeason(l);
  l.teams[tid].deadMoney = [];
  const now = payroll(l, tid, s);
  l.teams[tid].deadMoney.push({ pid: -1, name: 'x', season: s, amount: amount - now });
  expect(payroll(l, tid, s)).toBe(amount);
}

function freeAgent(l: League, ovr = 70, i = 0): Player {
  const p = freeAgents(l).filter((x) => !x.rfa)[i];
  p.ovr = p.pot = ovr;
  p.bornYear = l.season - 27;
  p.experience = 5;
  p.injury = null;
  return p;
}

/** Free agency with every team over the cap and without the mid-level; `open` gives a team room. */
function summer() {
  const l = createLeague({ name: 'sr5', userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 5 });
  l.id = 'rfa_5';
  l.phase = 'freeAgency';
  l.faDay = 0;
  const s = contractSeason(l);
  const cap = CAP_FOR(l, s);
  for (const t of l.teams) {
    t.deadMoney = [{ pid: -1, name: 'x', season: s, amount: cap.salaryCap }];
    t.mleSeason = s;
    t.baeSeason = s;
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

/** A restricted free agent of team `tid`: a young 76 off a cheap deal, qualified. */
function rfa(l: League, tid: number): Player {
  const p = freeAgents(l).find((x) => !x.rfa)!;
  p.ovr = p.pot = 76;
  p.bornYear = l.season - 23;
  p.injury = null;
  p.experience = 2;
  p.contract = { start: l.season - 1, salaries: [3000, 3000] };
  p.draft = { year: l.season - 3, round: 2, pick: 40, tid };
  p.stats = p.stats.filter((x) => x.season !== l.season);
  p.tid = tid;
  statsLine(p, l.season, tid, false).gp = 60;
  p.rfa = { tid, qo: qualifyingOffer(l, p) };
  setRfaHold(l, p);
  p.tid = FREE_AGENT;
  p.asking = undefined;
  p.asking = askingContract(l, p);
  p.faDays = 5;
  return p;
}

const fillTo = (l: League, tid: number, n: number, s: number) => {
  while (standardRoster(l, tid).length < n) signPlayer(l, freeAgents(l).filter((x) => !x.rfa)[0], tid, CAP_FOR(l, s).vetMin, 1, { news: false, start: s });
};
const atAsk = (l: League, p: Player, years: number) => Math.ceil((askingContract(l, p, U).amount * (1 + Math.abs(years - askingContract(l, p, U).years) * 0.03)) / 50) * 50;

describe('the CBA', () => {
  it('Bird rights, the max, releases, AI options, two-way stashes, buyouts, keeping their own, the signing exceptions and aprons, offer sheets', () => {
    // Bird rights: full after three seasons with the team, Early Bird after two, none after one, and a trade keeps the clock
    {
      const l = league();
      l.phase = 'resign';
      const p = expiring(l, U, 74, 27, 5_000, l.season - 2);
      expect(birdTier(l, p)).toBe('full');
      p.birdSince = l.season - 1;
      expect(birdTier(l, p)).toBe('early');
      p.birdSince = l.season;
      expect(birdTier(l, p)).toBe('non');
      // traded: same clock
      l.phase = 'regular';
      p.birdSince = l.season - 2;
      const other = standardRoster(l, AI)[0];
      other.contract = { start: l.season, salaries: [p.contract.salaries[0]] };
      const deal = { a: { tid: U, pids: [p.pid], dpids: [] }, b: { tid: AI, pids: [other.pid], dpids: [] } };
      expect(validateTrade(l, deal)).toEqual([]);
      executeTrade(l, deal);
      expect(p.birdSince).toBe(l.season - 2);
      // a new team's signing starts it again, with his first season there
      l.phase = 'freeAgency';
      const fa = freeAgents(l)[0];
      signPlayer(l, fa, U, CAP_FOR(l).vetMin, 1, { start: l.season + 1, news: false });
      expect(fa.birdSince).toBe(l.season + 1);
    }

    // they limit what his team can re-sign him for: his max on full Bird rights, 175% (or 105% of the average) on Early Bird, 120% without
    {
      const l = league();
      l.phase = 'resign';
      const p = expiring(l, U, 80, 26, 10_000, l.season - 2);
      const s = contractSeason(l);
      expect(resignLimit(l, p, U)).toBe(playerMax(l, p, s, U));
      p.birdSince = l.season - 1;
      expect(resignLimit(l, p, U)).toBeGreaterThanOrEqual(17_500 - 50);
      expect(resignLimit(l, p, U)).toBeLessThan(playerMax(l, p, s, U));
      p.birdSince = l.season;
      expect(resignLimit(l, p, U)).toBe(12_000);
      // his market value is past that: he won't re-sign, he goes to the market
      expect(askingContract(l, p, U).amount).toBeGreaterThan(12_000);
      expect(userResign(l, p.pid, 12_000, 2).reason).toMatch(/Without Bird rights.*up to \$12\.0M/);
    }

    // five-year deals and 8% raises only re-signing on full Bird rights; free agents sign for four years at most, with 5% raises
    {
      const l = league();
      l.phase = 'resign';
      const p = expiring(l, U, 74, 24, 5_000, l.season - 3);
      expect(maxYearsWith(l, p, U)).toBe(5);
      const ask = askingContract(l, p, U);
      expect(userResign(l, p.pid, ask.amount * 2, 5).ok).toBe(true);
      expect(p.contract.salaries[1]).toBe(Math.round((p.contract.salaries[0] * 1.08) / 10) * 10);
      const q = expiring(l, U, 72, 27, 5_000, l.season - 1, 1);
      expect(maxYearsWith(l, q, U)).toBe(4);
      expect(userResign(l, q.pid, 1_000_000, 5).reason).toMatch(/4 years at most/);
      // a free agent
      l.phase = 'freeAgency';
      l.faDay = 5;
      const fa = freeAgents(l).find((x) => !x.rfa && askingContract(l, x, U).amount <= CAP_FOR(l, l.season + 1).vetMin)!;
      expect(maxYearsWith(l, fa, U)).toBe(4);
      expect(userOffer(l, fa.pid, CAP_FOR(l, l.season + 1).vetMin * 2, FA_YEARS + 1).reason).toMatch(/1 to 4 years/);
    }

    // the max runs 25% of the cap to six seasons in the league, 30% to nine, 35% after; honors with his own team earn the Rose-rule max and the supermax
    {
      const l = league();
      l.phase = 'resign';
      const cap = CAP_FOR(l, l.season + 1).salaryCap;
      const p = expiring(l, U, 92, 25, 10_000, l.season - 3);
      for (const [exp, pct] of [
        [3, 0.25],
        [8, 0.3],
        [11, 0.35],
      ] as const) {
        p.experience = exp;
        expect(playerMax(l, p, l.season + 1, U)).toBe(Math.round(cap * pct));
      }
      // All-NBA last season: the supermax for seven to nine seasons, with his own team only
      p.experience = 8;
      p.awards.push({ season: l.season, type: 'All-NBA 1st Team' });
      expect(playerMax(l, p, l.season + 1, U)).toBe(Math.round(cap * 0.35));
      expect(playerMax(l, p, l.season + 1, AI)).toBe(Math.round(cap * 0.3));
      // off his rookie-scale deal: 30% (the Rose rule)
      p.experience = 4;
      p.contract.rookie = true;
      p.draft = { year: l.season - 4, round: 1, pick: 3, tid: U };
      expect(playerMax(l, p, l.season + 1, U)).toBe(Math.round(cap * 0.3));
      p.awards = [];
      expect(playerMax(l, p, l.season + 1, U)).toBe(Math.round(cap * 0.25));
    }

    // a star worth the max asks it of every team, so his interest decides where he signs; anyone else's moves his price 10% at most
    {
      const l = league();
      l.phase = 'freeAgency';
      const [star, mid] = freeAgents(l).filter((p) => !p.rfa);
      for (const [p, ovr] of [
        [star, 94],
        [mid, 79],
      ] as const) {
        p.ovr = p.pot = ovr;
        p.bornYear = l.season - 27;
        p.experience = 5;
        p.injury = null;
        p.asking = undefined;
      }
      const s = contractSeason(l);
      expect(marketSalary(l, star)).toBeGreaterThanOrEqual(CAP_FOR(l, s).maxContract(5) * MAX_ASK);
      for (const t of l.teams) expect(askingContract(l, star, t.tid).amount).toBe(playerMax(l, star, s, t.tid));
      for (const t of l.teams) {
        const ratio = askingContract(l, mid, t.tid).amount / marketSalary(l, mid);
        expect(ratio).toBeGreaterThanOrEqual(0.9 - 0.01);
        expect(ratio).toBeLessThanOrEqual((t.tid === U ? 1.15 : 1.1) + 0.01);
        if (teamAppeal(l, t.tid, mid) > 1.12) expect(ratio).toBeLessThan(0.95);
      }
    }

    // releases bar the team that released a player from signing him again that season, but not a 10-day contract that ran out
    {
      const l = league();
      l.phase = 'regular';
      const p = standardRoster(l, U)[3];
      releasePlayer(l, p, { news: false });
      expect(releasedBy(l, p, U)).toBe(true);
      expect(releasedBy(l, p, AI)).toBe(false);
      delete p.waivers;
      expect(userOffer(l, p.pid, CAP_FOR(l).vetMin * 3, 1).reason).toMatch(/released .* this season/);
      l.season++;
      expect(releasedBy(l, p, U)).toBe(false);
      l.season--;
      const q = standardRoster(l, U)[4];
      releasePlayer(l, q, { news: false, ended: true });
      expect(q.released).toBeUndefined();
    }

    // AI options: a player option on the final season for a good player 32 or younger, likelier the better he is; a team option on a cheap deal for a young one; nothing on one-year deals
    {
      const l = league();
      l.phase = 'freeAgency';
      const pool = Object.values(l.players)
        .filter((p) => p.tid >= 0)
        .slice(0, 200);
      const share = (ovr: number, age: number, amount: number) => {
        let po = 0;
        let to = 0;
        for (const p of pool) {
          const was = { ovr: p.ovr, pot: p.pot, bornYear: p.bornYear, injury: p.injury };
          Object.assign(p, { ovr, pot: ovr, bornYear: l.season + 1 - age, injury: null });
          const o = aiOption(l, p, amount, 3);
          Object.assign(p, was);
          if (o === 'player') po++;
          if (o === 'team') to++;
        }
        return { po: po / pool.length, to: to / pool.length };
      };
      expect(share(72, 27, 20_000).po).toBe(0);
      expect(share(90, 34, 20_000).po).toBe(0);
      const star = share(90, 27, 40_000);
      const good = share(80, 27, 20_000);
      expect(star.po).toBeGreaterThan(good.po);
      expect(star.po).toBeLessThan(0.75);
      expect(share(70, 22, 3_000).to).toBeGreaterThan(0.2);
      expect(share(70, 27, 3_000).to).toBe(0);
      expect(aiOption(l, pool[0], 30_000, 1)).toBeUndefined();
    }

    // the draft stashes an AI team's second-rounder on a two-way deal when a two-way slot is open for next season, counting only next season's deals
    {
      const l = league();
      l.phase = 'draft';
      const tid = AI;
      // three two-ways whose deals run out this season: they don't hold next season's slots
      for (const p of twoWayRoster(l, tid)) p.contract = { start: l.season, salaries: [600], twoWay: true };
      while (twoWayRoster(l, tid).length < 3) signPlayer(l, freeAgents(l)[0], tid, 600, 1, { twoWay: true, news: false });
      for (const p of twoWayRoster(l, tid)) p.contract = { start: l.season, salaries: [600], twoWay: true };
      ensureFuturePicks(l, l.season);
      const p = generatePlayer(new Rng(5), { pid: l.nextPid++, season: l.season, tid: DRAFT_PROSPECT, age: 20, talent: -1.5, scale: DEFAULT_SCALE });
      l.players[p.pid] = p;
      Object.assign(p, { ovr: 48, pot: 56 });
      p.draft = { year: l.season, round: 0, pick: 0, tid: null };
      const dp = { dpid: 99_999, season: l.season, round: 2 as const, originalTid: tid, tid, pick: 15 };
      l.draftPicks.push(dp);
      expect(valueScore(l, p)).toBeLessThan(64);
      draftPlayer(l, dp, p.pid);
      expect(p.contract.twoWay).toBe(true);
      expect(contractExp(p.contract)).toBe(l.season + 2);
    }

    // non-contenders buy out role veterans only (30+, deal up within a season, outside their six best, under 82), who sign with a contender for the minimum
    {
      let found = false;
      for (let seed = 1; seed <= 8 && !found; seed++) {
        const l = league(seed);
        l.phase = 'regular';
        l.day = l.tradeDeadlineDay + 1;
        for (const t of l.teams) t.strategy = t.tid % 3 === 0 ? 'contend' : 'rebuild';
        l.teams[U].strategy = 'retool';
        for (const t of l.teams) {
          const roster = standardRoster(l, t.tid);
          while (roster.length < CAP.rosterMax) roster.push(signPlayer(l, freeAgents(l)[0], t.tid, CAP_FOR(l).vetMin, 1, { news: false }) ?? standardRoster(l, t.tid).at(-1)!);
        }
        const vets = new Map<number, number>();
        for (const t of l.teams.filter((x) => x.strategy === 'rebuild')) {
          const roster = standardRoster(l, t.tid).sort((a, b) => valueScore(l, a) - valueScore(l, b));
          const v = roster[0];
          Object.assign(v, { ovr: 74, pot: 74, bornYear: l.season - 32, injury: null, experience: 10 });
          v.contract = { start: l.season, salaries: [8_000] };
          vets.set(v.pid, t.tid);
        }
        aiBuyouts(l);
        const bought = [...vets].filter(([pid, tid]) => l.players[pid].tid !== tid);
        if (!bought.length) continue;
        found = true;
        for (const [pid, from] of bought) {
          const p = l.players[pid];
          expect(releasedBy(l, p, from)).toBe(true);
          if (p.tid >= 0) {
            expect(l.teams[p.tid].strategy).toBe('contend');
            expect(p.contract.salaries).toEqual([CAP_FOR(l).vetMin]);
          } else expect(p.tid).toBe(FREE_AGENT);
        }
      }
      expect(found).toBe(true);
    }

    // an AI team a trade takes past 15 waives its end of the bench; the user never goes past 15
    {
      const l = league();
      l.phase = 'regular';
      l.day = 60;
      const [B, S] = [2, 3];
      for (const t of l.teams) t.strategy = 'retool';
      l.teams[B].strategy = 'contend';
      l.teams[S].strategy = 'rebuild';
      for (const t of [B, S]) {
        while (standardRoster(l, t).length < CAP.rosterMax) signPlayer(l, freeAgents(l)[0], t, CAP_FOR(l).vetMin, 1, { news: false });
        for (const p of standardRoster(l, t)) delete p.tradeLock;
      }
      const vet = standardRoster(l, S).sort((a, b) => b.ovr - a.ovr)[0];
      Object.assign(vet, { ovr: 84, pot: 84, bornYear: l.season - 31, injury: null });
      vet.contract = { start: l.season, salaries: [12_000, 12_000] };
      // three of the buyer's bench, young and paid enough to match: a 3-for-1 for the seller to make room for
      const bench = standardRoster(l, B)
        .sort((a, b) => b.ovr - a.ovr)
        .slice(3, 6);
      for (const p of bench) {
        Object.assign(p, { ovr: 70, pot: 76, bornYear: l.season - 22, injury: null });
        p.contract = { start: l.season, salaries: [4_500, 4_500] };
      }
      const deal = aiPackage(l, B, S, vet);
      expect(deal).not.toBeNull();
      executeTrade(l, deal!);
      expect(tradeRoster(l, S).length).toBeLessThanOrEqual(CAP.rosterMax);
      expect(tradeRoster(l, B).length).toBeGreaterThanOrEqual(CAP.rosterMin);
      // the user's side is held to the limit
      while (standardRoster(l, U).length < CAP.rosterMax) signPlayer(l, freeAgents(l)[0], U, CAP_FOR(l).vetMin, 1, { news: false });
      const two = standardRoster(l, AI).slice(0, 2);
      for (const p of two) {
        delete p.tradeLock;
        p.contract = { start: l.season, salaries: [CAP_FOR(l).vetMin] };
      }
      const one = standardRoster(l, U)[0];
      delete one.tradeLock;
      expect(
        validateTrade(l, { a: { tid: U, pids: [one.pid], dpids: [] }, b: { tid: AI, pids: two.map((p) => p.pid), dpids: [] } }).some((e) => /would have 16 players/.test(e)),
      ).toBe(true);
    }

    // AI teams pay a young star past the second apron, a contender's 80+ starter to the tax line, and a rebuilder's veteran less than its young players
    {
      const l = league();
      const cap = CAP_FOR(l, l.season);
      const t = l.teams[AI];
      for (const strategy of ['contend', 'retool', 'rebuild'] as const) {
        t.strategy = strategy;
        expect(payrollBudget(cap, t, 88, { core: true, young: true })).toBe(cap.secondApron + cap.salaryCap * 0.1);
      }
      t.strategy = 'contend';
      expect(payrollBudget(cap, t, 84, { core: true, young: false })).toBe(cap.firstApron);
      expect(payrollBudget(cap, t, 80, { core: false, young: false })).toBe(cap.luxuryTax);
      expect(payrollBudget(cap, t, 76, { core: false, young: false })).toBeLessThan(cap.luxuryTax);
      t.strategy = 'rebuild';
      expect(payrollBudget(cap, t, 74, { core: false, young: false })).toBeLessThan(payrollBudget(cap, t, 74, { core: false, young: true }));
    }

    // a top free agent's old team bids on his Bird rights over the cap, within what it pays to keep its core
    {
      const l = league();
      l.phase = 'freeAgency';
      l.faDay = 5;
      const s = contractSeason(l);
      const cap = CAP_FOR(l, s);
      const t = l.teams[AI];
      t.strategy = 'contend';
      const p = onTheMarket(l, 0, 4);
      expect(valueScore(l, p)).toBeGreaterThanOrEqual(82);
      // a payroll for next season of `pay` (one player's deal carries it)
      const anchor = standardRoster(l, AI)[0];
      const books = (pay: number) => {
        anchor.contract = { start: l.season, salaries: [anchor.contract.salaries[0] ?? 1_000, 0] };
        anchor.contract.salaries[1] = pay - payroll(l, AI, s);
      };
      // over the cap, his ask still within the first apron (a contender's budget for its core)
      books(cap.salaryCap + 5_000);
      const bid = () => faInterest(l, p).find((o) => o.tid === AI);
      expect(bid()?.bird).toBe(true);
      expect(bid()!.amount).toBe(askingContract(l, p, AI).amount);
      // past its budget for him: no bid on his rights (and no space or exception to pay him with)
      books(cap.firstApron);
      expect(bid()).toBeUndefined();
    }

    // a good free agent nobody could pay goes back to his old team on his Bird rights as the market closes, past its budget even; not to a team that released him
    {
      const l = league();
      l.phase = 'freeAgency';
      const s = contractSeason(l);
      const p = onTheMarket(l, 0, 4);
      const q = onTheMarket(l, 1, 4);
      q.released = { tid: AI, season: l.season };
      const anchor = standardRoster(l, AI)[0];
      anchor.contract = { start: l.season, salaries: [anchor.contract.salaries[0] ?? 1_000, CAP_FOR(l, s).secondApron] };
      aiLateReturns(l);
      expect(p.tid).toBe(AI);
      expect(p.contract.start).toBe(s);
      expect(p.contract.salaries.length).toBeLessThanOrEqual(2);
      expect(p.contract.salaries[0]).toBe(Math.min(askingContract(l, { ...p, tid: FREE_AGENT, contract: { start: l.season, salaries: [0] } }, AI).amount, resignLimit(l, p, AI)));
      expect(q.tid).toBe(FREE_AGENT);
    }

    // the room exception replaces the mid-level once a team has signed a free agent with cap space: 5.7% of the cap, two years, once
    {
      const l = excLeague();
      const s = contractSeason(l);
      const cap = CAP_FOR(l, s);
      payTo(l, U, cap.salaryCap - 5_000);
      const p = freeAgent(l);
      expect(exceptionAmount(l, 'room', s)).toBe(Math.round((cap.salaryCap * ROOM_PCT) / 10) * 10);
      expect(exceptionRoom(l, U, 'room', s)).toBe(0);
      expect(exceptionUsedReason(l, U, 'room', s)).toMatch(/Only after signing a free agent with cap space/);
      expect(mleRoom(l, U, s)).toBe(Math.round((cap.salaryCap * MLE_PCT) / 10) * 10);
      expect(signingRoute(l, U, 4_000, s, p)).toBe('space');
      spendRoute(l, U, 'space', s);
      expect(l.teams[U].spaceSeason).toBe(s);
      expect(mleRoom(l, U, s)).toBe(0);
      expect(exceptionUsedReason(l, U, 'mle', s)).toMatch(/room exception replaces it/);
      expect(exceptionRoom(l, U, 'room', s)).toBe(exceptionAmount(l, 'room', s));
      // beyond the space left: the room exception, for two years at most
      const amount = exceptionAmount(l, 'bae', s) + 500;
      expect(signingRoute(l, U, amount, s, p, 2)).toBe('room');
      expect(signingRoute(l, U, amount, s, p, 3)).toBeNull();
      spendRoute(l, U, 'room', s);
      expect(exceptionRoom(l, U, 'room', s)).toBe(0);
      // and no bi-annual after it that season
      expect(exceptionUsedReason(l, U, 'bae', s)).toMatch(/Not after the room exception/);
      expect(signingRoute(l, U, amount, s, p, 2)).toBeNull();
    }

    // a team that used the mid-level first gets no room exception
    {
      const l = excLeague();
      const s = contractSeason(l);
      spendRoute(l, U, 'mle', s);
      spendRoute(l, U, 'space', s);
      expect(exceptionUsedReason(l, U, 'room', s)).toMatch(/one or the other/);
    }

    // the bi-annual: 3.3% of the cap for two years, under the first apron after signing, the smallest exception first
    {
      const l = excLeague();
      const s = contractSeason(l);
      const cap = CAP_FOR(l, s);
      payTo(l, U, cap.salaryCap + 1_000);
      const p = freeAgent(l);
      const bae = Math.round((cap.salaryCap * BAE_PCT) / 10) * 10;
      expect(exceptionRoom(l, U, 'bae', s)).toBe(bae);
      expect(EXCEPTIONS.bae.years).toBe(2);
      // a cheap signing doesn't use up the mid-level; a longer or bigger one does
      expect(signingRoute(l, U, bae, s, p)).toBe('bae');
      expect(signingRoute(l, U, bae, s, p, 3)).toBe('mle');
      expect(signingRoute(l, U, bae + 10, s, p)).toBe('mle');
      expect(signingRoute(l, U, bae, s, p, 2, 'mle')).toBe('mle');
      // past the tax line the full mid-level and the bi-annual still pay, up to the first apron
      payTo(l, U, cap.luxuryTax + 1_000);
      expect(exceptionRoom(l, U, 'bae', s)).toBe(bae);
      payTo(l, U, cap.firstApron - 2_000);
      expect(exceptionRoom(l, U, 'bae', s)).toBe(2_000);
      expect(mleRoom(l, U, s)).toBe(2_000);
    }

    // the bi-annual: not two seasons running, and it hard-caps the team at the first apron in trades like the mid-level
    {
      const l = excLeague('regular');
      const s = l.season;
      spendRoute(l, U, 'bae', s);
      expect(exceptionUsedReason(l, U, 'bae', s)).toBe('Used this season.');
      expect(exceptionUsedReason(l, U, 'bae', s + 1)).toMatch(/not two seasons running/);
      expect(exceptionUsedReason(l, U, 'bae', s + 2)).toBeNull();
      const cap = CAP_FOR(l, s);
      expect(hardCapLine(l, U, s)).toMatchObject({ amount: cap.firstApron, name: 'first apron' });
      // a trade that takes the payroll past the first apron is refused
      payTo(l, U, cap.firstApron - 1_000);
      const big = standardRoster(l, AI).sort((a, b) => b.contract.salaries[0] - a.contract.salaries[0])[0];
      big.contract = { start: s, salaries: [20_000, 20_000] };
      big.tradeLock = undefined;
      const errs = validateTrade(l, { a: { tid: U, pids: [], dpids: [] }, b: { tid: AI, pids: [big.pid], dpids: [] } });
      expect(errs.some((e) => /used the bi-annual exception this season, so it's hard-capped at the first apron/.test(e))).toBe(true);
    }

    // the taxpayer mid-level pays 3.7% of the cap for two years for a team the full mid-level would take past the first apron, up to the second, and hard-caps it there
    {
      const l = excLeague();
      const s = contractSeason(l);
      const cap = CAP_FOR(l, s);
      const p = freeAgent(l);
      const tmle = Math.round((cap.salaryCap * TMLE_PCT) / 10) * 10;
      expect(EXCEPTIONS.tmle.years).toBe(2);
      // under the first apron the full mid-level pays: the taxpayer one is only the fallback (last in the order)
      payTo(l, U, cap.luxuryTax);
      expect(signingRoute(l, U, tmle, s, p, 2)).toBe('mle');
      // past it, only the taxpayer mid-level, and no bi-annual
      payTo(l, U, cap.firstApron + 1_000);
      expect(mleRoom(l, U, s)).toBe(0);
      expect(exceptionRoom(l, U, 'bae', s)).toBe(0);
      expect(exceptionRoom(l, U, 'tmle', s)).toBe(tmle);
      expect(signingRoute(l, U, tmle, s, p, 2)).toBe('tmle');
      expect(signingRoute(l, U, tmle, s, p, 3)).toBeNull();
      // up to the second apron
      payTo(l, U, cap.secondApron - 1_500);
      expect(exceptionRoom(l, U, 'tmle', s)).toBe(1_500);
      payTo(l, U, cap.secondApron + 1);
      expect(exceptionRoom(l, U, 'tmle', s)).toBe(0);
      // one mid-level or the other, and the taxpayer one hard-caps at the second apron
      spendRoute(l, U, 'tmle', s);
      expect(exceptionUsedReason(l, U, 'mle', s)).toMatch(/one or the other/);
      expect(hardCapLine(l, U, s)).toMatchObject({ amount: cap.secondApron, name: 'second apron' });
    }

    // AI teams take the exception that allows the length a player wants, cut to the longest otherwise
    {
      const l = excLeague();
      const s = contractSeason(l);
      const cap = CAP_FOR(l, s);
      payTo(l, AI, cap.salaryCap + 1_000);
      const p = freeAgent(l);
      const bae = exceptionAmount(l, 'bae', s);
      expect(aiRoute(l, AI, bae, s, p, 2)).toBe('bae');
      expect(aiRoute(l, AI, bae, s, p, 3)).toBe('mle');
      expect(aiRoute(l, AI, bae, s, p, 5)).toBe('mle');
      expect(routeYears('mle')).toBe(4);
      spendRoute(l, AI, 'mle', s);
      expect(aiRoute(l, AI, bae, s, p, 4)).toBe('bae');
    }

    // an offer sheet on an exception reserves it, and gets it back when it's matched
    {
      const R = 2;
      const l = excLeague();
      const s = contractSeason(l);
      payTo(l, U, CAP_FOR(l, s).salaryCap + 1_000);
      const p = freeAgent(l, 74);
      p.bornYear = l.season - 23;
      p.rfa = { tid: R, qo: 3_000, hold: 3_000 };
      // a young player on a cheap sheet: his team matches
      signOfferSheet(l, p, U, 3_000, 2, 'bae', l.faDay);
      expect(l.teams[U].baeSeason).toBe(s);
      expect(exceptionRoom(l, U, 'bae', s)).toBe(0);
      resolveOfferSheets(l);
      expect(p.tid).toBe(R);
      expect(l.teams[U].baeSeason).toBeUndefined();
    }

    // an offer sheet on cap space ends the team's mid-level while it waits: matched, it's back; not, the room exception replaces it
    {
      const l = excLeague();
      const s = contractSeason(l);
      const cap = CAP_FOR(l, s);
      payTo(l, AI, cap.salaryCap - 20_000);
      const [p, p2] = [0, 2].map((i) => {
        const x = freeAgent(l, 74, i);
        x.bornYear = l.season - 23;
        x.rfa = { tid: U, qo: 3_000, hold: 3_000 };
        return x;
      });
      const q = freeAgent(l, 70, 1);
      signOfferSheet(l, p, AI, 15_000, 3, 'space', l.faDay);
      // the $5M of space it leaves can't be topped up with the mid-level
      expect(exceptionUsedReason(l, AI, 'mle', s)).toMatch(/offer sheet on cap space is pending/);
      expect(mleRoom(l, AI, s)).toBe(0);
      expect(signingRoute(l, AI, 10_000, s, q)).toBeNull();
      // matched: the space was never used
      expect(userDecideSheet(l, p.pid, true).ok).toBe(true);
      expect(exceptionUsedReason(l, AI, 'mle', s)).toBeNull();
      expect(signingRoute(l, AI, 10_000, s, q)).toBe('space');
      // not matched: he joins on the space, and the room exception replaces the mid-level
      signOfferSheet(l, p2, AI, 15_000, 3, 'space', l.faDay);
      expect(userDecideSheet(l, p2.pid, false).ok).toBe(true);
      expect(p2.tid).toBe(AI);
      expect(l.teams[AI].spaceSeason).toBe(s);
      expect(exceptionUsedReason(l, AI, 'mle', s)).toMatch(/room exception replaces it/);
      expect(payroll(l, AI, s)).toBeLessThanOrEqual(cap.salaryCap);
    }

    // a pending offer leans on its exception, and cap space can't be used while one needs the mid-level
    {
      const l = excLeague();
      const s = contractSeason(l);
      const cap = CAP_FOR(l, s);
      payTo(l, U, cap.salaryCap - 20_000);
      const star = freeAgent(l, 80, 0);
      const role = freeAgent(l, 66, 1);
      l.faBids = [{ pid: star.pid, amount: 12_000, years: 3, day: 0, decideDay: 2, route: 'mle' }];
      expect(userExceptionRoom(l, 'mle', s, role.pid)).toBe(0);
      expect(userExceptionRoom(l, 'bae', s, role.pid)).toBe(exceptionAmount(l, 'bae', s));
      expect(offerRoute(l, role, 4_000, s)).toBeNull();
      expect(offerBlockedReason(l, role, 4_000, 2)).toMatch(/cost you the mid-level exception .* pending mid-level offer to/);
      l.faBids = [];
      expect(offerRoute(l, role, 4_000, s)).toBe('space');
    }

    // a user signing on the bi-annual records it and says so
    {
      const l = excLeague('regular');
      const s = l.season;
      while (standardRoster(l, U).length > 13) standardRoster(l, U)[0].tid = FREE_AGENT;
      payTo(l, U, CAP_FOR(l, s).salaryCap + 1_000);
      const p = freeAgent(l, 66);
      p.asking = { amount: 4_000, years: 2 };
      const ask = { amount: 4_000, years: 2 };
      const res = userOffer(l, p.pid, ask.amount + 1_000, 2);
      expect(res.ok).toBe(true);
      expect(l.teams[U].baeSeason).toBe(s);
      expect(l.teams[U].mleSeason).toBeUndefined();
      expect(l.inbox[0].body).toMatch(/using our bi-annual exception/);
    }

    // a pending offer sheet holds a summer roster spot on every path that adds a player
    {
      const [R, B] = [1, 2];

      // the user's own: re-signing his restricted free agent waits for a spot, so the sheet can't take him to 22
      {
        const { l, s, cap, open } = summer();
        open(U, 40_000);
        open(R);
        const mine = rfa(l, U);
        const theirs = rfa(l, R);
        // R can't match (its payroll is past what it will spend)
        l.teams[R].deadMoney.push({ pid: -4, name: 'z', season: s, amount: cap.luxuryTax });
        fillTo(l, U, OFFSEASON_ROSTER_MAX - 1, s);
        expect(userOffer(l, theirs.pid, atAsk(l, theirs, 3), 3).ok).toBe(true);
        expect(summerRoster(l, U)).toBe(OFFSEASON_ROSTER_MAX);
        const ask = askingContract(l, mine, U);
        expect(userResign(l, mine.pid, ask.amount, ask.years).reason).toMatch(/roster is full for next season \(21, counting your pending offers and offer sheets\)/);
        // nor can he match a sheet on his own man
        signOfferSheet(l, mine, B, askingContract(l, mine, B).amount, 3, 'min', 0);
        expect(sheetDecisionBlocked(l, mine.pid, true)).toMatch(/Matching needs a roster spot/);
        expect(userDecideSheet(l, mine.pid, true).ok).toBe(false);
        resolveOfferSheets(l);
        expect(theirs.tid).toBe(U);
        expect(standardRoster(l, U).length).toBe(OFFSEASON_ROSTER_MAX);
      }

      // an AI team with a sheet of its own pending at 20 can't match another, and stays at 21
      {
        const { l, s, open } = summer();
        open(U, 40_000);
        open(R);
        open(B);
        const rRfa = rfa(l, R);
        const bRfa = rfa(l, B);
        l.teams[B].deadMoney.push({ pid: -4, name: 'z', season: s, amount: CAP_FOR(l, s).luxuryTax });
        fillTo(l, R, OFFSEASON_ROSTER_MAX - 1, s);
        signOfferSheet(l, bRfa, R, askingContract(l, bRfa, R).amount, 3, 'min', 1);
        expect(summerRoster(l, R)).toBe(OFFSEASON_ROSTER_MAX);
        expect(userOffer(l, rRfa.pid, atAsk(l, rRfa, 3), 3).ok).toBe(true);
        expect(aiMatchVerdict(l, rRfa)).toMatchObject({ match: false, why: expect.stringMatching(/no roster spot/) });
        resolveOfferSheets(l);
        expect(rRfa.tid).toBe(U);
        expect(bRfa.tid).toBe(R);
        expect(standardRoster(l, R).length).toBe(OFFSEASON_ROSTER_MAX);
      }

      // advancing a week goes a day at a time while a sheet on your restricted free agent waits for your call
      {
        const { l, open } = summer();
        open(U, 40_000);
        open(B, 40_000);
        const mine = rfa(l, U);
        l.faDay = 3;
        signOfferSheet(l, mine, B, askingContract(l, mine, B).amount, 3, 'space', 3);
        expect(mine.rfa!.sheet!.until).toBe(4);
        faAdvance(l, 7);
        // one day on, his last match day: still his to decide
        expect(l.faDay).toBe(4);
        expect(mine.tid).toBe(FREE_AGENT);
        expect(mine.rfa?.sheet).toBeDefined();
        // left unanswered, the next day lets him go
        faAdvance(l, 7);
        expect(mine.tid).toBe(B);
        expect(l.faDay).toBeGreaterThan(5);
      }
    }
  }, 180_000);
});
