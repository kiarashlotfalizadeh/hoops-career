// AI front offices in the market: an old team bringing back its own free agent on his Bird rights,
// who a team shops, a star's price on the trade market, and the mail a new job starts with.
// Fictional leagues with hand-shaped teams keep these fast.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { CAP_FOR, addInbox, contractSeason, curTeamSeason, freeAgents, payroll, standardRoster, statsLine, teamPlayers } from '../league/helpers';
import { askingContract, releasePlayer } from '../league/contracts';
import { faDay, marqueeFA } from '../league/freeAgency';
import { aiPackage, sellable } from '../league/aiTrades';
import { takeOverTeam } from '../league/owner';
import { startRegularSeason } from '../league/season';
import { Rng } from '../random';
import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';

const U = 0;
const R = 1;

function league(rngSeed = 5): League {
  const l = createLeague({ name: `fo${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  l.id = `fo_${rngSeed}`;
  return l;
}

/** A player of known value: OVR = POT, age, healthy. */
function shape(l: League, p: Player, ovr: number, age: number): Player {
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.injury = null;
  p.experience = 6;
  return p;
}

/**
 * Summer free agency where nobody can pay more than the minimum: every team over the cap with its
 * exceptions used, except team R, which is a little over the cap and well under what it would pay
 * to keep a role player (see payrollBudget).
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
    t.baeSeason = s;
    t.strategy = 'retool';
  }
  const r = l.teams[R];
  for (const p of teamPlayers(l, R)) p.contract = { start: s, salaries: [cap.vetMin] };
  r.deadMoney = [];
  r.deadMoney = [{ pid: -1, name: 'x', season: s, amount: cap.salaryCap * 1.05 - payroll(l, R, s) }];
  return { l, s, cap };
}

/** One of the market's free agents made a role player (worth 75, not a top free agent) who played last season for `tid`. */
function ownFreeAgent(l: League, tid: number): Player {
  const p = shape(l, freeAgents(l)[0], 75, 27);
  p.contract = { start: l.season - 2, salaries: [8_000, 8_000, 8_000] };
  p.birdSince = l.season - 2;
  p.joinedSeason = l.season - 2;
  statsLine(p, l.season, tid, false).gp = 70;
  p.asking = undefined;
  p.asking = askingContract(l, p);
  return p;
}

describe('the old team on Bird rights in the open market', () => {
  it('brings back its own role player over the cap at his price, where nobody else could pay him more than the minimum', () => {
    const { l, cap } = summer();
    const p = ownFreeAgent(l, R);
    expect(marqueeFA(l, p)).toBe(false);
    expect(payroll(l, R, contractSeason(l))).toBeGreaterThan(cap.salaryCap);
    const ask = askingContract(l, p, R).amount;
    expect(ask).toBeGreaterThan(cap.vetMin * 2);
    for (let d = 1; d <= 12 && p.tid === FREE_AGENT; d++) {
      faDay(l, new Rng(d), 1, d);
      l.faDay = d;
    }
    expect(p.tid).toBe(R);
    // on his Bird rights: his price (his old team's room holds a cut to 15%), with his Bird clock kept
    expect(p.contract.salaries[0]).toBeGreaterThanOrEqual(ask * 0.85 - 50);
    expect(p.birdSince).toBe(l.season - 2);
  });
});

describe('who a team shops', () => {
  function shop(strategy: 'retool' | 'rebuild', won: number, lost: number, star: { ovr: number; age: number }) {
    const l = league(3);
    l.phase = 'regular';
    const t = l.teams[R];
    t.strategy = strategy;
    const ts = curTeamSeason(l, R);
    ts.won = won;
    ts.lost = lost;
    const roster = standardRoster(l, R).sort((a, b) => b.ovr - a.ovr);
    for (const p of roster) {
      p.tradeLock = undefined;
      p.contract = { start: l.season, salaries: [10_000, 10_000] };
    }
    const best = shape(l, roster[0], star.ovr, star.age);
    // everyone else younger and worse
    for (const p of roster.slice(1)) shape(l, p, Math.min(p.ovr, star.ovr - 6), 23);
    return { l, best };
  }

  it('a retooling team out of it sells its veteran star; one in the race keeps him', () => {
    const fading = shop('retool', 10, 20, { ovr: 86, age: 31 });
    expect(sellable(fading.l, R).map((p) => p.pid)).toContain(fading.best.pid);
    const racing = shop('retool', 20, 10, { ovr: 86, age: 31 });
    expect(sellable(racing.l, R).map((p) => p.pid)).not.toContain(racing.best.pid);
  });

  it("a rebuilder sells its best player once he's 28, and keeps a 27-year-old franchise player", () => {
    const old = shop('rebuild', 15, 15, { ovr: 85, age: 28 });
    expect(sellable(old.l, R).map((p) => p.pid)).toContain(old.best.pid);
    const young = shop('rebuild', 15, 15, { ovr: 85, age: 27 });
    expect(sellable(young.l, R).map((p) => p.pid)).not.toContain(young.best.pid);
  });
});

describe("a star's price", () => {
  it('a contender sends its third-best player for a star (85+), not for anyone less', () => {
    const l = league(17);
    l.phase = 'regular';
    l.day = 60;
    const [S, B] = [3, 4];
    for (const t of l.teams) t.strategy = 'retool';
    l.teams[S].strategy = 'rebuild';
    l.teams[B].strategy = 'contend';
    const cap = CAP_FOR(l);
    const deal = (ovr: number) => {
      const x = structuredClone(l);
      for (const t of [S, B])
        for (const p of standardRoster(x, t)) {
          delete p.tradeLock;
          p.contract = { start: x.season, salaries: [cap.vetMin, cap.vetMin] };
        }
      const star = shape(x, standardRoster(x, S)[0], ovr, 30);
      star.contract = { start: x.season, salaries: [cap.salaryCap * 0.3, cap.salaryCap * 0.3] };
      for (const p of standardRoster(x, S)) if (p !== star) p.ovr = Math.min(p.ovr, 72);
      // the buyer: two better stars, then a young starter paid enough to match, the rest on the minimum
      const roster = standardRoster(x, B);
      roster.forEach((p, i) => shape(x, p, i < 2 ? 92 : i === 2 ? 83 : 70, i === 2 ? 23 : 27));
      roster[2].contract = { start: x.season, salaries: [cap.salaryCap * 0.25, cap.salaryCap * 0.25] };
      roster[2].pot = 90;
      // (the stars on big deals: over the cap, the buyer has to match salaries)
      for (const p of roster.slice(0, 2)) p.contract = { start: x.season, salaries: [cap.salaryCap * 0.3, cap.salaryCap * 0.3] };
      const third = roster[2];
      return { d: aiPackage(x, B, S, star), third };
    };
    const star = deal(88);
    expect(star.d).not.toBeNull();
    expect(star.d!.a.pids).toContain(star.third.pid);
    // a lesser player isn't worth the buyer's third-best: without him the salaries don't match
    const lesser = deal(84);
    expect(lesser.d?.a.pids ?? []).not.toContain(lesser.third.pid);
  });
});

describe('a new job', () => {
  it("leaves the old job's mail behind, read; the new owner's goals come in unread", () => {
    const l = league(13);
    while (standardRoster(l, U).length > 15) releasePlayer(l, standardRoster(l, U)[0], { news: false });
    expect(startRegularSeason(l)).toEqual([]);
    addInbox(l, { from: 'Assistant GM', subject: 'Extension candidates', body: 'x', tone: 'neutral' });
    expect(l.inbox.some((m) => !m.read)).toBe(true);
    takeOverTeam(l, 7);
    const unread = l.inbox.filter((m) => !m.read);
    expect(unread.length).toBeGreaterThan(0);
    expect(unread.every((m) => m.from === 'Owner')).toBe(true);
    expect(l.inbox.find((m) => m.subject === 'Extension candidates')!.read).toBe(true);
  });
});
