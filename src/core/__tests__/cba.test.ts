// The CBA as the game models it: a soft cap, the luxury tax, one mid-level exception and Bird
// rights. Bird rights (full, Early Bird, none) and what each lets a team pay its own player, the
// five-year deal and 8% raises only on full Bird rights, the max (25, 30, 35% of the cap) with the
// Rose-rule max and the supermax a player's honors earn with his own team, a star asking the max
// of everyone, a team that released a player not signing him again that season, AI teams' contract
// options, role veterans bought out and signed by contenders for the minimum, AI teams releasing
// their end of the bench after a trade, what AI teams pay to keep their own, a good free agent's
// old team bringing him back over the cap, and the mid-level (8.5% of the cap, 4 years, one signing
// a season, whatever the payroll), which a pending offer holds.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { CAP_FOR, contractSeason, freeAgents, payroll, standardRoster } from '../league/helpers';
import {
  EXCEPTIONS,
  MAX_ASK,
  MLE_PCT,
  aiBuyouts,
  aiOption,
  aiMleRoom,
  aiRoute,
  askingContract,
  birdTier,
  exceptionAmount,
  exceptionRoom,
  exceptionUsedReason,
  maxYearsWith,
  marketSalary,
  mleRoom,
  payrollBudget,
  aiTopLine,
  keepCeiling,
  playerMax,
  releasePlayer,
  releasedBy,
  resignLimit,
  routeYears,
  signPlayer,
  signingRoute,
  spendRoute,
  teamAppeal,
  summerFloor,
  valueScore,
} from '../league/contracts';
import {
  FA_YEARS,
  aiLateReturns,
  bidFloor,
  bidRivals,
  bidStanding,
  faInterest,
  offerBlockedReason,
  offerRoute,
  userExceptionRoom,
  userOffer,
  userResign,
} from '../league/freeAgency';
import { aiPackage } from '../league/aiTrades';
import { executeTrade, tradeRoster, validateTrade } from '../league/trades';
import { blankStats } from '../playerGen';
import { CAP } from '../constants';
import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';

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
  const p = freeAgents(l)[i];
  p.ovr = p.pot = ovr;
  p.bornYear = l.season - 27;
  p.experience = 5;
  p.injury = null;
  return p;
}

describe('the CBA', () => {
  it('Bird rights, the max, releases, AI options, buyouts, keeping their own, the mid-level exception', () => {
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
      expect(userResign(l, p.pid, 12_000, 2).reason).toMatch(/Non-Bird rights.*up to \$12\.0M/);
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
      const fa = freeAgents(l).find((x) => askingContract(l, x, U).amount <= CAP_FOR(l, l.season + 1).vetMin)!;
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
      // All-League last season: the supermax for seven to nine seasons, with his own team only
      p.experience = 8;
      p.awards.push({ season: l.season, type: 'All-League 1st Team' });
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
      const [star, mid] = freeAgents(l);
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

    // a release makes him a free agent at once, and bars the team that released him from signing him again that season
    {
      const l = league();
      l.phase = 'regular';
      const p = standardRoster(l, U)[3];
      releasePlayer(l, p, { news: false });
      expect(releasedBy(l, p, U)).toBe(true);
      expect(releasedBy(l, p, AI)).toBe(false);
      expect(p.tid).toBe(FREE_AGENT);
      expect(userOffer(l, p.pid, CAP_FOR(l).vetMin * 3, 1).reason).toMatch(/released .* this season/);
      l.season++;
      expect(releasedBy(l, p, U)).toBe(false);
      l.season--;
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

    // an AI team a trade takes past 15 releases its end of the bench; the user never goes past 15
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

    // AI teams pay a young star up to just under their top line (never past it), a contender's 80+ starter to the tax line, and a rebuilder's veteran less than its young players
    {
      const l = league();
      const cap = CAP_FOR(l, l.season);
      const t = l.teams[AI];
      for (const strategy of ['contend', 'retool', 'rebuild'] as const) {
        t.strategy = strategy;
        expect(payrollBudget(cap, t, 88, { core: true, young: true })).toBe(aiTopLine(cap));
        expect(aiTopLine(cap)).toBeLessThan(cap.spendTop);
      }
      t.strategy = 'contend';
      expect(payrollBudget(cap, t, 84, { core: true, young: false })).toBe(cap.spendLine);
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
      // over the cap, his ask still within a contender's budget for its core
      books(cap.salaryCap + 5_000);
      const bid = () => faInterest(l, p).find((o) => o.tid === AI);
      expect(bid()?.bird).toBe(true);
      expect(bid()!.amount).toBe(askingContract(l, p, AI).amount);
      // past its budget for him: no bid on his rights (and no space or mid-level to pay him with)
      books(cap.spendLine);
      l.teams[AI].mleSeason = s;
      expect(bid()).toBeUndefined();
      // and what its budget leaves under his summer floor isn't an offer he weighs against the user's
      // either (bidRivals): losing the user's floor bid to it signed RJ Barrett for 35% of his value
      const floor = summerFloor(l, p);
      books(keepCeiling(cap, t) - Math.round(floor / 2));
      expect(bidRivals(l, p).some((o) => o.tid === AI)).toBe(false);
      for (const o of bidRivals(l, p)) expect(o.amount).toBeGreaterThanOrEqual(floor - 50);
      // (the lead it shows is never under what he'd consider from the user)
      const ask = askingContract(l, p, U);
      expect(bidStanding(l, p, ask.amount, ask.years).toLead ?? Infinity).toBeGreaterThanOrEqual(bidFloor(l, p, ask.years));
      // just past his floor, it is
      books(keepCeiling(cap, t) - floor - 500);
      expect(bidRivals(l, p).find((o) => o.tid === AI)).toMatchObject({ bird: true });
    }

    // a good free agent nobody could pay goes back to his old team on his Bird rights as the market
    // closes (and bids on them in the market, see birdRoom), within what it pays to keep one
    // (keepCeiling: never past the AI's top line); not to a team that released him
    {
      const l = league();
      l.phase = 'freeAgency';
      const s = contractSeason(l);
      const cap = CAP_FOR(l, s);
      l.teams[AI].strategy = 'contend';
      const p = onTheMarket(l, 0, 4);
      const q = onTheMarket(l, 1, 4);
      q.released = { tid: AI, season: l.season };
      const anchor = standardRoster(l, AI)[0];
      const books = (pay: number) => {
        anchor.contract = { start: l.season, salaries: [anchor.contract.salaries[0] ?? 1_000, 0] };
        anchor.contract.salaries[1] = pay - payroll(l, AI, s);
      };
      books(cap.spendTop);
      l.teams[AI].mleSeason = s;
      expect(faInterest(l, p).some((o) => o.tid === AI)).toBe(false);
      aiLateReturns(l);
      expect(p.tid).toBe(FREE_AGENT);
      books(cap.salaryCap);
      // (and in the market's first days it bids his price on them, as his decision day comes)
      expect(faInterest(l, p).find((o) => o.tid === AI)?.bird).toBe(true);
      aiLateReturns(l);
      expect(p.tid).toBe(AI);
      expect(p.contract.start).toBe(s);
      expect(p.contract.salaries.length).toBeLessThanOrEqual(2);
      expect(p.contract.salaries[0]).toBe(Math.min(askingContract(l, { ...p, tid: FREE_AGENT, contract: { start: l.season, salaries: [0] } }, AI).amount, resignLimit(l, p, AI)));
      expect(payroll(l, AI, s)).toBeLessThanOrEqual(keepCeiling(cap, l.teams[AI]));
      expect(q.tid).toBe(FREE_AGENT);
    }

    // the mid-level: 8.5% of the cap for up to four years, one signing a season, whatever the payroll
    {
      const l = excLeague();
      const s = contractSeason(l);
      const cap = CAP_FOR(l, s);
      const p = freeAgent(l);
      const mle = Math.round((cap.salaryCap * MLE_PCT) / 10) * 10;
      expect(exceptionAmount(l, 'mle', s)).toBe(mle);
      expect(EXCEPTIONS.mle.years).toBe(4);
      expect(routeYears('mle')).toBe(4);
      // under the cap a signing uses the space, and the mid-level stays
      payTo(l, U, cap.salaryCap - 5_000);
      expect(signingRoute(l, U, 4_000, s, p)).toBe('space');
      spendRoute(l, U, 'space', s);
      expect(mleRoom(l, U, s)).toBe(mle);
      // past the space left: the mid-level, for four years at most; the minimum fits anywhere
      expect(signingRoute(l, U, 6_000, s, p, 4)).toBe('mle');
      expect(signingRoute(l, U, 6_000, s, p, 5)).toBeNull();
      expect(signingRoute(l, U, mle + 10, s, p)).toBeNull();
      expect(signingRoute(l, U, cap.vetMin, s, p, 5)).toBe('min');
      // no line above the cap closes it: past the tax it still pays in full
      payTo(l, U, cap.luxuryTax + 20_000);
      expect(mleRoom(l, U, s)).toBe(mle);
      expect(exceptionRoom(l, U, 'mle', s)).toBe(mle);
      // once a season
      spendRoute(l, U, 'mle', s);
      expect(mleRoom(l, U, s)).toBe(0);
      expect(exceptionUsedReason(l, U, s)).toBe('Used this season.');
      expect(exceptionUsedReason(l, U, s + 1)).toBeNull();
      expect(signingRoute(l, U, 6_000, s, p, 2)).toBeNull();
      // an AI team takes it for the length a player wants, cut to its four years otherwise
      payTo(l, AI, cap.salaryCap + 1_000);
      expect(aiRoute(l, AI, 6_000, s, p, 3)).toBe('mle');
      expect(aiRoute(l, AI, 6_000, s, p, 5)).toBe('mle');
      // but an AI front office doesn't take it past its top line: the rules allow it, its habits don't
      payTo(l, AI, aiTopLine(cap) - 4_000);
      expect(signingRoute(l, AI, 6_000, s, p, 3)).toBe('mle');
      expect(aiMleRoom(l, AI, s)).toBe(4_000);
      expect(aiRoute(l, AI, 6_000, s, p, 3)).toBeNull();
      expect(aiRoute(l, AI, 4_000, s, p, 3)).toBe('mle');
      spendRoute(l, AI, 'mle', s);
      expect(aiRoute(l, AI, 4_000, s, p, 3)).toBeNull();
    }

    // a pending offer on the mid-level holds it: no second signing leans on it until it's decided
    {
      const l = excLeague();
      const s = contractSeason(l);
      const cap = CAP_FOR(l, s);
      payTo(l, U, cap.salaryCap + 1_000);
      const star = freeAgent(l, 80, 0);
      const role = freeAgent(l, 66, 1);
      l.faBids = [{ pid: star.pid, amount: 12_000, years: 3, day: 0, decideDay: 2, route: 'mle' }];
      expect(userExceptionRoom(l, 'mle', s, role.pid)).toBe(0);
      expect(userExceptionRoom(l, 'mle', s, star.pid)).toBe(exceptionAmount(l, 'mle', s));
      expect(offerRoute(l, role, 4_000, s)).toBeNull();
      expect(offerBlockedReason(l, role, 4_000, 2)).toMatch(/Your pending offer to .* uses your mid-level exception/);
      l.faBids = [];
      expect(offerRoute(l, role, 4_000, s)).toBe('mle');
    }

    // a user signing on the mid-level records it and says so
    {
      const l = excLeague('regular');
      const s = l.season;
      while (standardRoster(l, U).length > 13) standardRoster(l, U)[0].tid = FREE_AGENT;
      payTo(l, U, CAP_FOR(l, s).salaryCap + 1_000);
      const p = freeAgent(l, 66);
      p.asking = { amount: 4_000, years: 2 };
      const res = userOffer(l, p.pid, 5_000, 2);
      expect(res.ok).toBe(true);
      expect(l.teams[U].mleSeason).toBe(s);
      expect(l.inbox[0].body).toMatch(/using our mid-level exception/);
    }
  }, 180_000);
});
