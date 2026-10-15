// Competing offers for top free agents (W5): the user's offer against AI teams' on the player's
// decision day, player priorities, cap and roster holds for pending offers, and the user's first
// look at the market on opening day (B2). Fictional leagues with hand-shaped teams keep these fast.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { faAdvance, newSeason, startFreeAgency } from '../league/season';
import { CAP_FOR, contractSeason, curTeamSeason, freeAgents, payroll, standardRoster, teamPlayers } from '../league/helpers';
import { EVEN_PREFS, PREF_KEYS, askingContract, capSpace, exceptionAmount, heldSalary, playerPrefs, signPlayer, teamAppeal } from '../league/contracts';
import {
  FA_DAYS,
  bidFloor,
  bidStanding,
  faDay,
  faInterest,
  marqueeFA,
  offerBlockedReason,
  pendingBid,
  resolveBids,
  userBid,
  userMleRoom,
  userOffer,
  withdrawBid,
} from '../league/freeAgency';
import { Rng } from '../random';
import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';

const U = 0;
const R = 1;

function league(rngSeed = 5): League {
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
  p.mood.tradeRequest = false;
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
function summer(rngSeed = 5) {
  const l = league(rngSeed);
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

describe('competing offers for top free agents', () => {
  it('only top free agents weigh offers, and only in the summer', () => {
    const { l, open } = summer();
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
  });

  it('an offer at his asking price beats a team he likes less', () => {
    const { l, open } = summer();
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
  });

  it('a much more appealing team beats an offer at the asking price, and the inbox compares terms', () => {
    const { l, open } = summer();
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
  });

  it('refuses offers under 90% of his asking price, states his floor, and a raised offer replaces the first', () => {
    const { l, open } = summer();
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
  });

  it('below his asking price an offer only wins against rival bids he likes less; alone he holds out', () => {
    for (const rival of [true, false]) {
      const { l, open } = summer();
      open(U, 60, 0.9);
      if (rival) open(R, 22, 0.1);
      const [star] = stars(l, 1);
      const ask = askingContract(l, star, U);
      expect(userBid(l, star.pid, Math.ceil((ask.amount * 0.95) / 50) * 50, ask.years).ok).toBe(true);
      resolveBids(l);
      expect(star.tid).toBe(rival ? U : FREE_AGENT);
      if (!rival) expect(l.inbox[0].subject).toMatch(/turned us down/);
    }
  });

  it("counts pending offers against cap space, the mid-level and roster spots, so they can't be spent twice", () => {
    const { l, s, open } = summer();
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
  });

  it('an offer the user can no longer pay for falls through, with an explanation', () => {
    for (const rival of [true, false]) {
      const { l, s, cap, open } = summer();
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
  });

  it('a minimum signing while an offer is pending does not void it: it could have come after', () => {
    const { l, s, open } = summer();
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
  });

  it('a pending offer on cap space ends the mid-level: no signing on it can land beside the space signing', () => {
    const { l, s, cap, open } = summer();
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
  });

  it('an exception signing counts against a pending offer on cap space; only a minimum signing could have come after it', () => {
    const { l, s, cap, open } = summer();
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
  });

  it("a contender's offer stays within the cap space its market holds leave, and wins only on a route it can pay with", () => {
    const { l, s, cap, open } = summer();
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
  });

  it("AI teams never sign a player weighing the user's offer before his decision day", () => {
    const { l, open } = summer();
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
  });

  it('advancing free agency to its end decides every offer, and offers made on the last day are decided as it closes', () => {
    const l = league(7);
    l.phase = 'resign';
    startFreeAgency(l);
    const s = contractSeason(l);
    const give = () => {
      l.teams[U].deadMoney = [];
      l.teams[U].mleSeason = undefined;
      for (const p of standardRoster(l, U)) p.contract = { start: s, salaries: [CAP_FOR(l, s).vetMin] };
    };
    give();
    const pool = freeAgents(l).sort((a, b) => b.ovr - a.ovr);
    const targets = pool.slice(0, 3).map((p) => freeAgent(l, p, 84));
    for (const p of targets) expect(bidAtAsk(l, p).ok).toBe(true);
    faAdvance(l, 1);
    const late = freeAgent(l, freeAgents(l).filter((p) => !pendingBid(l, p.pid))[0], 84);
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
  });

  it('opens free agency with the user getting the first look: nobody changes teams before he has seen the market (B2)', () => {
    const l = league(9);
    l.phase = 'resign';
    const before = new Map(Object.values(l.players).map((p) => [p.pid, p.tid]));
    startFreeAgency(l);
    const moved = Object.values(l.players).filter((p) => p.tid >= 0 && p.tid !== before.get(p.pid));
    expect(moved).toEqual([]);
    const best = freeAgents(l).sort((a, b) => b.ovr - a.ovr)[0];
    expect(best).toBeDefined();
    // the market opens for AI teams the next day
    faAdvance(l, 1);
    expect(Object.values(l.players).filter((p) => p.tid >= 0 && before.get(p.pid) !== p.tid && p.tid !== l.userTid).length).toBeGreaterThan(0);
  });
});

describe('player priorities', () => {
  it('are fixed for a player in a league, average 1, and price teams as before on average', () => {
    const l = league();
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
  });
});
