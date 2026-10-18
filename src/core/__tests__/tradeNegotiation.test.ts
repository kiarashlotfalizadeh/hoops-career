// Trade negotiation: the reasons behind an AI verdict, the counter-offers it would take instead,
// and the trade finder's value tiers, availability and filters. Fictional leagues with hand-shaped
// players keep these fast and deterministic.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { startRegularSeason } from '../league/season';
import { CAP_FOR, contractSeason, freeAgents, standardRoster } from '../league/helpers';
import { marketSalary, tradeValue } from '../league/contracts';
import { capPayroll } from '../league/freeAgency';
import { ensureFuturePicks } from '../league/draft';
import { capSalary, evaluateTrade, neutralSplit, tradeRoster, untradeable, validateTrade, type TradeOffer } from '../league/trades';
import { availability, filterTargets, maxTakeBack, tradeTargets, valueTier, type ValueTier } from '../league/tradeFinder';
import { counterOffers } from '../league/tradeHelp';
import { CAP } from '../constants';
import { contractExp } from '../playerGen';
import { Rng } from '../random';
import type { League, Player } from '../types';

const U = 0;
const AI = 1;

function league(rngSeed = 5): League {
  const l = createLeague({ name: `neg${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  l.settings.difficulty = 'normal';
  return l;
}

/** Give a player a known value: OVR = POT, age, healthy, and a contract at his market price unless `salary` is set. */
function shape(l: League, p: Player, ovr: number, age: number, salary?: number, years = 2): Player {
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.injury = null;
  p.mood.tradeRequest = false;
  p.contract = { start: contractSeason(l), salaries: Array.from({ length: years }, () => salary ?? marketSalary(l, p)) };
  return p;
}

const offer = (give: number[], get: number[], giveDp: number[] = [], getDp: number[] = [], tid = AI): TradeOffer => ({
  a: { tid: U, pids: give, dpids: giveDp },
  b: { tid, pids: get, dpids: getDp },
});

const texts = (l: League, o: TradeOffer) => evaluateTrade(l, o).notes.map((n) => n.text);

describe('why an AI team says yes or no', () => {
  it('adds up its verdict from the parts it reports', () => {
    const l = league();
    expect(startRegularSeason(l)).toEqual([]);
    const r = new Rng(4);
    for (let i = 0; i < 60; i++) {
      const b = 1 + r.int(0, 28);
      const o = offer(
        r
          .shuffle(standardRoster(l, U))
          .slice(0, r.int(0, 2))
          .map((p) => p.pid),
        r
          .shuffle(standardRoster(l, b))
          .slice(0, r.int(1, 2))
          .map((p) => p.pid),
        [],
        [],
        b,
      );
      const ev = evaluateTrade(l, o);
      const x = ev.parts;
      expect(ev.valueIn).toBeCloseTo(x.playersIn + x.picksIn - x.money - x.cut, 9);
      expect(ev.valueOut).toBeCloseTo(x.playersOut + x.picksOut, 9);
      expect(ev.delta).toBeCloseTo(ev.valueIn - ev.valueOut - x.slack, 9);
      expect(x.incoming.map((a) => a.id)).toEqual(o.a.pids);
      expect(x.outgoing.map((a) => a.id)).toEqual(o.b.pids);
    }
  });

  it('says when taking on salary puts them into the luxury tax, and what it costs', () => {
    const l = league();
    l.phase = 'regular';
    const p = shape(l, standardRoster(l, U)[0], 74, 27, 20_000);
    const tax = CAP_FOR(l).luxuryTax;
    // $1M under the tax line before the deal
    l.teams[AI].deadMoney.push({ pid: -1, name: 'x', season: l.season, amount: tax - capPayroll(l, AI, l.season) - 1_000 });
    const ev = evaluateTrade(l, offer([p.pid], []));
    expect(ev.parts.taxCost).toBeGreaterThan(0);
    expect(ev.parts.payAfter - tax).toBeCloseTo(19_000, 0);
    const note = ev.notes.find((n) => /tax/.test(n.text));
    expect(note).toEqual({ tone: 'bad', text: 'Taking on $20.0M puts them $19.0M into the tax' });
    // already over it: how far over the deal takes them
    l.teams[AI].deadMoney.push({ pid: -2, name: 'y', season: l.season, amount: 5_000 });
    expect(texts(l, offer([p.pid], []))).toContain('Taking on $20.0M takes them to $24.0M over the tax line');
    // and shedding salary over the line saves them tax
    const theirs = shape(l, standardRoster(l, AI)[0], 70, 27, 15_000);
    expect(texts(l, offer([], [theirs.pid])).some((t) => /^Shedding \$15\.0M saves them \$[\d.]+M in luxury tax$/.test(t))).toBe(true);
  });

  it("gives a rebuilder's and a contender's view of picks for a veteran", () => {
    const l = league();
    l.phase = 'regular';
    const vet = shape(l, standardRoster(l, AI)[0], 78, 31, CAP_FOR(l).vetMin);
    const firsts = l.draftPicks
      .filter((d) => d.tid === U && d.round === 1 && d.season > l.season)
      .sort((a, b) => a.season - b.season)
      .filter((_, i) => i % 2 === 0)
      .slice(0, 2)
      .map((d) => d.dpid);
    const deal = offer([], [vet.pid], firsts);
    l.teams[AI].strategy = 'rebuild';
    expect(evaluateTrade(l, deal).notes).toContainEqual({ tone: 'good', text: 'Picks count extra for them' });
    l.teams[AI].strategy = 'contend';
    expect(evaluateTrade(l, deal).notes).toContainEqual({ tone: 'bad', text: "Picks don't help them win now" });
    l.teams[AI].strategy = 'retool';
    expect(texts(l, deal).filter((t) => /Picks/.test(t))).toEqual([]);
    // a veteran coming in is worth less to a rebuilder
    l.teams[AI].strategy = 'rebuild';
    const mine = shape(l, standardRoster(l, U)[0], 80, 31, CAP_FOR(l).vetMin);
    const young = shape(l, standardRoster(l, AI)[1], 74, 23, CAP_FOR(l).vetMin);
    expect(texts(l, offer([mine.pid], [young.pid]))).toContain(`${mine.firstName} ${mine.lastName} (31) is worth less to a rebuilder`);
  });

  it("warns you when you'd give up much more than you get, even when they say yes", () => {
    const l = league();
    l.phase = 'regular';
    l.teams[AI].strategy = 'retool';
    const vetMin = CAP_FOR(l).vetMin;
    const star = shape(l, standardRoster(l, U)[0], 88, 26, vetMin);
    const scrub = shape(l, standardRoster(l, AI)[0], 66, 30, vetMin);
    const ev = evaluateTrade(l, offer([star.pid], [scrub.pid]));
    expect(ev.accept).toBe(true);
    expect(ev.notes[0].tone).toBe('warn');
    expect(ev.notes[0].text).toMatch(/^By neutral value you'd give up /);
    // a fair one-for-one has no such warning
    const equal = shape(l, standardRoster(l, AI)[1], 88, 26, vetMin);
    expect(evaluateTrade(l, offer([star.pid], [equal.pid])).notes.filter((n) => n.tone === 'warn')).toEqual([]);
  });

  it('names depth for talent, waivers in the offseason and the two-firsts limit', () => {
    const l = league();
    l.phase = 'regular';
    l.teams[AI].strategy = 'retool';
    const vetMin = CAP_FOR(l).vetMin;
    const star = shape(l, standardRoster(l, AI)[0], 90, 27, vetMin);
    const four = standardRoster(l, U)
      .slice(0, 4)
      .map((p) => shape(l, p, 82, 27, vetMin).pid);
    expect(evaluateTrade(l, offer(four, [star.pid])).notes).toContainEqual({ tone: 'bad', text: "Depth doesn't add up to talent for them" });
    // after the season, with 15 under contract for next season: four players in for one is three to waive
    l.phase = 'draft';
    for (const p of standardRoster(l, AI)) if (contractExp(p.contract) < contractSeason(l)) shape(l, p, 70, 27, vetMin, 3);
    while (tradeRoster(l, AI).length < CAP.rosterMax) {
      const p = freeAgents(l)[0];
      p.tid = AI;
      shape(l, p, 70, 27, vetMin, 3);
    }
    for (const pid of four) shape(l, l.players[pid], 82, 27, vetMin, 3);
    shape(l, star, 90, 27, vetMin, 3);
    const ev = evaluateTrade(l, offer(four, [star.pid]));
    expect(ev.parts.cuts).toBe(3);
    expect(ev.notes.map((n) => n.text)).toContain("They'd have to waive 3 players to get down to 15");
    // the two-firsts limit
    l.phase = 'regular';
    ensureFuturePicks(l, l.season + 6);
    const firsts = l.draftPicks.filter((d) => d.tid === AI && d.round === 1 && (d.season - l.season) % 2 === 0).slice(0, 3);
    expect(
      evaluateTrade(
        l,
        offer(
          [four[0]],
          [],
          [],
          firsts.map((d) => d.dpid),
        ),
      ).notes,
    ).toContainEqual({ tone: 'bad', text: 'No team gives up more than 2 first-round picks in one deal' });
  });
});

describe('counter-offers', () => {
  /** Every counter passes the rules and the AI's yes, moves only what each side owns, and comes best for you first. */
  function check(l: League, o: TradeOffer) {
    const cs = counterOffers(l, o);
    let prev = Infinity;
    for (const c of cs) {
      expect(validateTrade(l, c.offer)).toEqual([]);
      const ev = evaluateTrade(l, c.offer);
      expect(ev.accept).toBe(true);
      expect(c.offer.a.tid).toBe(o.a.tid);
      expect(c.offer.b.tid).toBe(o.b.tid);
      for (const side of [c.offer.a, c.offer.b]) {
        for (const pid of side.pids) expect(l.players[pid].tid).toBe(side.tid);
        for (const d of side.dpids) expect(l.draftPicks.find((x) => x.dpid === d)!.tid).toBe(side.tid);
      }
      // nothing of yours that wasn't already in the deal goes away by itself: only what "add" adds
      if (c.kind !== 'add' && !c.label.includes(', add ')) {
        expect(c.offer.a).toEqual(o.a);
      }
      const { give, get } = neutralSplit(ev.parts, c.offer);
      expect(get - give).toBeLessThanOrEqual(prev + 1e-9);
      prev = get - give;
      expect(c.label.length).toBeGreaterThan(0);
    }
    return cs;
  }

  it('are always deals the AI takes, with only assets each side owns, best for you first', () => {
    const kinds = new Set<string>();
    let n = 0;
    for (const seed of [3, 7]) {
      const l = league(seed);
      expect(startRegularSeason(l)).toEqual([]);
      const r = new Rng(seed);
      for (let i = 0; i < 80; i++) {
        const b = 1 + r.int(0, 28);
        const o = offer(
          r
            .shuffle(standardRoster(l, U))
            .slice(0, r.int(0, 2))
            .map((p) => p.pid),
          r
            .shuffle(standardRoster(l, b))
            .slice(0, r.int(1, 2))
            .map((p) => p.pid),
          r.chance(0.3) ? [r.pick(l.draftPicks.filter((d) => d.tid === U)).dpid] : [],
          r.chance(0.3) ? [r.pick(l.draftPicks.filter((d) => d.tid === b)).dpid] : [],
          b,
        );
        const ev = evaluateTrade(l, o);
        if (!ev.ok) continue;
        const cs = check(l, o);
        if (ev.accept) expect(cs).toEqual([]);
        for (const c of cs) kinds.add(c.kind);
        n += cs.length;
      }
    }
    expect(n).toBeGreaterThan(5);
    expect(kinds.has('add')).toBe(true);
  });

  it('can leave one of their assets home, or have you take a bad contract off their hands', () => {
    const l = league();
    l.phase = 'regular';
    l.teams[AI].strategy = 'retool';
    const vetMin = CAP_FOR(l).vetMin;
    const mine = shape(l, standardRoster(l, U)[0], 80, 27, vetMin);
    const theirs = shape(l, standardRoster(l, AI)[0], 80, 27, vetMin);
    const extra = shape(l, standardRoster(l, AI)[1], 76, 25, vetMin);
    // a fair swap plus a good young player on top: they'd keep the extra
    const greedy = offer([mine.pid], [theirs.pid, extra.pid]);
    expect(evaluateTrade(l, greedy).accept).toBe(false);
    const cs = check(l, greedy);
    expect(cs.find((c) => c.kind === 'remove')?.label).toBe(`Without ${extra.firstName} ${extra.lastName}`);

    // a little short, and they have an overpaid veteran to move: taking him closes the gap (and
    // your minimum-salary roster has the cap room for him)
    for (const p of standardRoster(l, U)) if (p !== mine) shape(l, p, 70, 27, vetMin);
    const short = shape(
      l,
      standardRoster(l, U).find((p) => p !== mine)!,
      79,
      27,
      vetMin,
    );
    const bad = shape(l, standardRoster(l, AI)[2], 66, 32, Math.round(CAP_FOR(l).salaryCap * 0.2), 3);
    expect(tradeValue(l, bad)).toBeLessThan(-3);
    const ask = offer([short.pid], [theirs.pid]);
    expect(evaluateTrade(l, ask).accept).toBe(false);
    const absorb = check(l, ask).find((c) => c.kind === 'absorb');
    expect(absorb).toBeDefined();
    expect(absorb!.offer.b.pids).toEqual([theirs.pid, bad.pid]);
    expect(absorb!.label).toMatch(new RegExp(`^Take ${bad.firstName} ${bad.lastName}'s contract \\(\\$[\\d.]+M thru \\d{4}-\\d{2}\\)$`));
  });
});

describe('trade finder', () => {
  const RANK: ValueTier[] = ['Franchise', 'All-Star', 'Starter', 'Rotation', 'Depth', 'Negative'];

  it('ranks value tiers in order of trade value', () => {
    const l = league(9);
    expect(startRegularSeason(l)).toEqual([]);
    // a couple of bad contracts for the bottom tier
    shape(l, standardRoster(l, 4)[0], 64, 33, Math.round(CAP_FOR(l).salaryCap * 0.2), 3);
    shape(l, standardRoster(l, 6)[0], 66, 32, Math.round(CAP_FOR(l).salaryCap * 0.15), 3);
    const players = Object.values(l.players)
      .filter((p) => p.tid >= 0)
      .map((p) => ({ v: tradeValue(l, p), tier: RANK.indexOf(valueTier(l, p)) }))
      .sort((a, b) => b.v - a.v);
    for (let i = 1; i < players.length; i++) expect(players[i].tier).toBeGreaterThanOrEqual(players[i - 1].tier);
    for (const x of players) expect(x.tier === RANK.indexOf('Negative')).toBe(x.v < 0);
    const count = (t: ValueTier) => players.filter((x) => x.tier === RANK.indexOf(t)).length;
    expect(count('Franchise')).toBeGreaterThan(5);
    expect(count('Franchise')).toBeLessThan(count('All-Star'));
    expect(count('Negative')).toBeGreaterThanOrEqual(2);
  });

  it('marks who a team would move and who it builds around, never your own players', () => {
    const l = league();
    l.phase = 'regular';
    l.teams[AI].strategy = 'rebuild';
    l.teams[2].strategy = 'contend';
    const vet = shape(l, standardRoster(l, AI)[0], 76, 30);
    expect(availability(l, vet)).toBe('block');
    const same = shape(l, standardRoster(l, 2)[0], 76, 30);
    expect(availability(l, same)).toBe(null);
    same.mood.tradeRequest = true;
    expect(availability(l, same)).toBe('block');
    const kid = shape(l, standardRoster(l, 2)[1], 92, 22);
    expect(availability(l, kid)).toBe('franchise');
    const bad = shape(l, standardRoster(l, 2)[2], 64, 32, Math.round(CAP_FOR(l).salaryCap * 0.2), 3);
    expect(availability(l, bad)).toBe('block');
    const mine = shape(l, standardRoster(l, U)[0], 92, 22);
    expect(availability(l, mine)).toBe(null);
  });

  it('lists every tradeable player on AI teams and filters and sorts them', () => {
    const l = league(4);
    expect(startRegularSeason(l)).toEqual([]);
    const locked = standardRoster(l, AI)[0];
    locked.tradeLock = { season: l.season, day: l.day + 30 };
    const rows = tradeTargets(l);
    expect(rows.some((x) => x.p.tid === U)).toBe(false);
    expect(rows.some((x) => x.p.pid === locked.pid)).toBe(false);
    const all = Object.values(l.players).filter((p) => p.tid >= 0 && p.tid !== U && !untradeable(l, p));
    expect(rows.length).toBe(all.length);

    const f = filterTargets(rows, { pos: 'C', minOvr: 70, maxAge: 28, maxSalary: 20_000, sort: 'ovr' });
    expect(f.length).toBeGreaterThan(0);
    for (const x of f) {
      expect(x.p.pos).toBe('C');
      expect(x.p.ovr).toBeGreaterThanOrEqual(70);
      expect(x.age).toBeLessThanOrEqual(28);
      expect(x.salary).toBeLessThanOrEqual(20_000);
    }
    for (let i = 1; i < f.length; i++) expect(f[i].p.ovr).toBeLessThanOrEqual(f[i - 1].p.ovr);
    expect(f.length).toBe(rows.filter((x) => x.p.pos === 'C' && x.p.ovr >= 70 && x.age <= 28 && x.salary <= 20_000).length);

    const avail = filterTargets(rows, { available: true, sort: 'salary' });
    expect(avail.length).toBeGreaterThan(0);
    expect(avail.every((x) => x.avail === 'block')).toBe(true);
    for (let i = 1; i < avail.length; i++) expect(avail[i].salary).toBeLessThanOrEqual(avail[i - 1].salary);
    const byValue = filterTargets(rows, {});
    expect(byValue.length).toBe(rows.length);
    for (let i = 1; i < byValue.length; i++) expect(byValue[i].value).toBeLessThanOrEqual(byValue[i - 1].value);
  });

  it('presets the salary you can take back to what two of your contracts can match', () => {
    const l = league();
    l.phase = 'regular';
    const roster = standardRoster(l, U)
      .filter((p) => !untradeable(l, p))
      .sort((a, b) => capSalary(l, b.pid) - capSalary(l, a.pid));
    const out = capSalary(l, roster[0].pid) + capSalary(l, roster[1].pid);
    const room = CAP_FOR(l).salaryCap - capPayroll(l, U, l.season);
    expect(maxTakeBack(l, U)).toBeCloseTo(Math.max(room + out, out * 1.25 + 100), 6);
    // a recent signing can't go out, so it doesn't count
    roster[0].tradeLock = { season: l.season, day: l.day + 30 };
    expect(maxTakeBack(l, U)).toBeLessThan(Math.max(room + out, out * 1.25 + 100));
  });

  it('keeps a team that used the mid-level at the tax line', () => {
    const l = league();
    l.phase = 'regular';
    const top = standardRoster(l, U)
      .filter((p) => !untradeable(l, p))
      .sort((a, b) => capSalary(l, b.pid) - capSalary(l, a.pid));
    // $1M under the tax, the top contract taking up the rest
    const tax = CAP_FOR(l).luxuryTax;
    const raise = tax - 1000 - capPayroll(l, U, l.season);
    top[0].contract = { start: l.season, salaries: [capSalary(l, top[0].pid) + raise, capSalary(l, top[0].pid) + raise] };
    const out = capSalary(l, top[0].pid) + capSalary(l, top[1].pid);
    expect(maxTakeBack(l, U)).toBeCloseTo(out * 1.25 + 100, 6);
    l.teams[U].mleSeason = l.season;
    expect(maxTakeBack(l, U)).toBeCloseTo(out + 1000, 6);
    // the most it allows passes the rules, a dollar more doesn't
    const them = standardRoster(l, AI).sort((a, b) => capSalary(l, b.pid) - capSalary(l, a.pid))[0];
    them.contract = { start: l.season, salaries: [out + 1000, out + 1000] };
    const deal = offer([top[0].pid, top[1].pid], [them.pid]);
    const taxError = (o: TradeOffer) => validateTrade(l, o).some((e) => e.includes('tax line'));
    expect(taxError(deal)).toBe(false);
    them.contract.salaries = [out + 1001, out + 1001];
    expect(taxError(deal)).toBe(true);
  });
});
