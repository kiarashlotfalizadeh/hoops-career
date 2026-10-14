// The transaction log (W7): every trade with both sides, and each signing, re-signing, extension,
// release, waiver claim, buyout, two-way deal and conversion as one entry, with names and pick
// labels frozen when it happens; AI teams' quiet roster fills stay out; a new season drops other
// teams' old moves but keeps trades and the user's. Fictional leagues keep these fast.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { newSeason } from '../league/season';
import { CAP_FOR, contractSeason, curTeamSeason, freeAgents, playerName, standardRoster, twoWayRoster } from '../league/helpers';
import {
  WAIVER_DAYS,
  askingContract,
  convertTwoWay,
  decideTeamOption,
  extensionAsk,
  releasePlayer,
  resolveWaivers,
  signPlayer,
  userBuyout,
  userClaim,
  userExtend,
  wantsTwoWay,
} from '../league/contracts';
import { FA_DAYS, fillRosters, renouncePlayer, userOffer, userResign, userTwoWayOffer } from '../league/freeAgency';
import { executeTrade, pickLabel } from '../league/trades';
import { draftPlayer } from '../league/draft';
import { logTxn, playerTxns, pruneTransactions, teamTxns, tradesBetween, txnLine, txnText } from '../league/transactions';
import { loadLeague, saveLeague } from '../../state/persistence';
import { Rng } from '../random';
import type { League, Player, Txn } from '../types';
import { DRAFT_PROSPECT, FREE_AGENT } from '../types';

const U = 0;
const AI = 1;

function league(rngSeed = 7): League {
  const l = createLeague({ name: `log${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  l.id = `txnlog_${rngSeed}`;
  return l;
}

/** A player of known value and contract (`salary` a season for `years` from the contract season), happy and healthy. */
function shape(l: League, p: Player, ovr: number, age: number, salary: number, years: number): Player {
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.injury = null;
  p.experience = 6;
  p.mood.tradeRequest = false;
  p.mood.score = 0;
  p.contract = { start: contractSeason(l), salaries: Array.from({ length: years }, () => salary) };
  return p;
}

/** The entries `act` adds to the log: exactly one. */
function one(l: League, act: () => unknown): Txn {
  const from = l.nextTxnId ?? 1;
  act();
  const added = (l.transactions ?? []).filter((t) => t.id >= from);
  expect(added.map((t) => t.kind)).toHaveLength(1);
  return added[0];
}

const text = (l: League, t: Txn, view: { tid: number } | { pid: number }) => txnText(l, txnLine(t, view));

describe('transaction log', () => {
  it('a trade logs what each side sent, with the names and pick labels of the day', () => {
    const l = league();
    l.phase = 'regular';
    l.day = 30;
    const give = standardRoster(l, U)[0];
    const get = standardRoster(l, AI).slice(0, 2);
    // the user's own first, and a second he got from team 5 earlier
    const pick = l.draftPicks.find((d) => d.tid === U && d.originalTid === U && d.round === 1)!;
    const via = l.draftPicks.find((d) => d.originalTid === 5 && d.round === 2)!;
    via.tid = U;
    const t = one(l, () => executeTrade(l, { a: { tid: U, pids: [give.pid], dpids: [pick.dpid, via.dpid] }, b: { tid: AI, pids: get.map((p) => p.pid), dpids: [] } }));
    // each pick as the team that sent it held it: its own first plain, the other team's second with where it came from
    const label = `${pick.season} 1st`;
    const viaLabel = `${via.season} 2nd (${l.teams[5].abbrev})`;
    expect(pickLabel(l, pick)).toBe(`${label} (${l.teams[U].abbrev})`);
    expect(t).toMatchObject({ kind: 'trade', season: l.season, day: 30, phase: 'regular', tids: [U, AI], user: true });
    expect(t.sides).toEqual([
      { tid: U, players: [{ pid: give.pid, name: playerName(give) }], picks: [label, viaLabel] },
      { tid: AI, players: get.map((p) => ({ pid: p.pid, name: playerName(p) })), picks: [] },
    ]);
    const [a, b] = get.map(playerName);
    const [ua, aa] = [l.teams[U].abbrev, l.teams[AI].abbrev];
    const sent = `${playerName(give)}, a ${label} and a ${viaLabel}`;
    expect(text(l, t, { tid: U })).toBe(`Acquired ${a} and ${b} from ${aa} for ${sent}`);
    expect(text(l, t, { tid: AI })).toBe(`Acquired ${sent} from ${ua} for ${a} and ${b}`);
    expect(text(l, t, { pid: give.pid })).toBe(`Acquired by ${aa} from ${ua} with a ${label} and a ${viaLabel} for ${a} and ${b}`);
    expect(text(l, t, { pid: get[0].pid })).toBe(`Acquired by ${ua} from ${aa} with ${b} for ${sent}`);
    expect(tradesBetween(l, AI, U)).toEqual([t]);
    expect(teamTxns(l, AI)).toEqual([t]);
    expect(playerTxns(l, get[1].pid)).toEqual([t]);
    // AI-to-AI trades are logged too, without the user's mark
    const c = standardRoster(l, 2)[0];
    const d = standardRoster(l, 3)[0];
    expect(one(l, () => executeTrade(l, { a: { tid: 2, pids: [c.pid], dpids: [] }, b: { tid: 3, pids: [d.pid], dpids: [] } })).user).toBeUndefined();
  });

  it('reads the same after a player is renamed, retires and leaves the save, and the pick is made', () => {
    const l = league();
    l.phase = 'regular';
    const give = standardRoster(l, U)[0];
    const get = standardRoster(l, AI)[0];
    const pick = l.draftPicks.find((d) => d.tid === AI && d.round === 2)!;
    const names = [playerName(give), playerName(get)];
    const label = pickLabel(l, pick);
    const t = one(l, () => executeTrade(l, { a: { tid: U, pids: [give.pid], dpids: [] }, b: { tid: AI, pids: [get.pid], dpids: [pick.dpid] } }));
    expect(label).toBe(`${pick.season} 2nd`);
    const before = [text(l, t, { tid: U }), text(l, t, { tid: AI }), text(l, t, { pid: give.pid })];
    expect(before[0]).toBe(`Acquired ${names[1]} and a ${label} from ${l.teams[AI].abbrev} for ${names[0]}`);
    const signing = one(l, () => signPlayer(l, freeAgents(l)[0], U, CAP_FOR(l).vetMin, 1));
    const signedName = signing.name!;
    // later: one is renamed, the other retires and leaves the save, and the pick gets its slot and is made
    get.firstName = 'Renamed';
    delete l.players[give.pid];
    delete l.players[signing.pid!];
    pick.pick = 5;
    expect(pickLabel(l, pick)).not.toBe(label);
    l.draftPicks = l.draftPicks.filter((d) => d.dpid !== pick.dpid);
    expect([text(l, t, { tid: U }), text(l, t, { tid: AI }), text(l, t, { pid: give.pid })]).toEqual(before);
    expect(playerTxns(l, give.pid)).toEqual([t]);
    expect(text(l, signing, { tid: U })).toMatch(new RegExp(`^Signed ${signedName}: 1 yr / \\$`));
    expect(text(l, signing, { pid: signing.pid! })).toMatch(new RegExp(`^Signed with ${l.teams[U].abbrev}: 1 yr / \\$`));
  });

  it("logs each of the user's moves once: signing, re-signing, extension, release, waiver claim, buyout, two-way deal, conversion", () => {
    const l = league();
    const vetMin = CAP_FOR(l).vetMin;

    // the summer: re-sign an expiring player, then sign a free agent at his price
    l.phase = 'resign';
    const exp = shape(l, standardRoster(l, U)[0], 74, 27, 5_000, 1);
    exp.contract.start = l.season;
    const ask = askingContract(l, exp, U);
    const re = one(l, () => expect(userResign(l, exp.pid, ask.amount, ask.years).ok).toBe(true));
    expect(re).toMatchObject({ kind: 'resign', tids: [U], pid: exp.pid, name: playerName(exp), amount: exp.contract.salaries[0], years: ask.years, phase: 'resign', user: true });
    const renounced = shape(l, standardRoster(l, U)[1], 66, 30, 3_000, 1);
    renounced.contract.start = l.season;
    expect(one(l, () => renouncePlayer(l, renounced.pid))).toMatchObject({ kind: 'renounce', tids: [U], pid: renounced.pid });

    l.phase = 'preseason';
    const fa = freeAgents(l).find((p) => askingContract(l, p, U).amount <= vetMin && !wantsTwoWay(l, p, U))!;
    const faAsk = askingContract(l, fa, U);
    const signed = one(l, () => expect(userOffer(l, fa.pid, faAsk.amount, faAsk.years).ok).toBe(true));
    expect(signed).toMatchObject({ kind: 'sign', tids: [U], pid: fa.pid, amount: fa.contract.salaries[0], years: faAsk.years, phase: 'preseason' });

    // a two-way deal into a free slot, then a conversion to a standard contract
    const pre = twoWayRoster(l, U).length;
    for (const p of twoWayRoster(l, U)) releasePlayer(l, p, { news: false });
    expect((l.transactions ?? []).filter((t) => t.kind === 'release')).toHaveLength(pre);
    const young = freeAgents(l).find((p) => wantsTwoWay(l, p, U))!;
    const tw = one(l, () => expect(userTwoWayOffer(l, young.pid).ok).toBe(true));
    expect(tw).toMatchObject({ kind: 'twoWay', tids: [U], pid: young.pid, years: young.contract.salaries.length });
    while (standardRoster(l, U).length >= 21) releasePlayer(l, standardRoster(l, U)[0], { news: false });
    expect(one(l, () => expect(convertTwoWay(l, young.pid).ok).toBe(true))).toMatchObject({ kind: 'convert', pid: young.pid, amount: young.contract.salaries[0] });

    // opening night on: an extension, a release onto waivers, a buyout
    while (standardRoster(l, U).length > 14) releasePlayer(l, standardRoster(l, U)[0], { news: false });
    l.phase = 'regular';
    l.day = 20;
    const ext = shape(l, standardRoster(l, U)[0], 72, 27, 8_000, 2);
    ext.contract.start = l.season - 1;
    ext.draft = { year: l.season - 6, round: 2, pick: 40, tid: null };
    const ea = extensionAsk(l, ext);
    const e = one(l, () => expect(userExtend(l, ext.pid, ea.amount, ea.years).ok).toBe(true));
    expect(e).toMatchObject({ kind: 'extend', tids: [U], pid: ext.pid, amount: ext.contract.next!.salaries[0], years: ea.years });
    expect(text(l, e, { pid: ext.pid })).toMatch(new RegExp(`^Extended by ${l.teams[U].abbrev}: ${ea.years} yrs? / \\$`));

    const cut = shape(
      l,
      standardRoster(l, U).find((p) => p !== ext)!,
      66,
      25,
      4_000,
      2,
    );
    const w = one(l, () => releasePlayer(l, cut));
    expect(cut.waivers).toBeDefined();
    expect(w).toMatchObject({ kind: 'waive', tids: [U], pid: cut.pid, amount: 8_000 });
    expect(text(l, w, { tid: U })).toBe(`Waived ${playerName(cut)} ($8.0M in dead money)`);
    // (he clears or is claimed before the claim below)
    l.day += WAIVER_DAYS;
    resolveWaivers(l);

    signPlayer(l, freeAgents(l)[0], U, vetMin, 1, { news: false });
    const vet = shape(
      l,
      standardRoster(l, U).find((p) => p !== ext)!,
      70,
      33,
      6_000,
      1,
    );
    const b = one(l, () => expect(userBuyout(l, vet.pid).ok).toBe(true));
    expect(b.kind).toBe('buyout');
    expect(b.amount).toBeGreaterThan(0);
    expect(text(l, b, { pid: vet.pid })).toMatch(new RegExp(`^Bought out by ${l.teams[U].abbrev}, giving back \\$`));

    // a claim on a player an AI team waived: the user has the worst record, so first claim
    for (const t of l.teams) Object.assign(curTeamSeason(l, t.tid), { won: 10, lost: 10 });
    Object.assign(curTeamSeason(l, U), { won: 2, lost: 18 });
    const theirs = shape(l, standardRoster(l, AI)[0], 66, 25, vetMin, 2);
    const aw = one(l, () => releasePlayer(l, theirs));
    expect(aw).toMatchObject({ kind: 'waive', tids: [AI] });
    expect(aw.user).toBeUndefined();
    expect(userClaim(l, theirs.pid).ok).toBe(true);
    l.day += WAIVER_DAYS;
    const c = one(l, () => resolveWaivers(l));
    expect(theirs.tid).toBe(U);
    expect(c).toMatchObject({ kind: 'claim', tids: [U, AI], pid: theirs.pid, amount: vetMin, years: 2, user: true });
    expect(text(l, c, { tid: U })).toMatch(new RegExp(`^Claimed ${playerName(theirs)} off waivers from ${l.teams[AI].abbrev} \\(\\$`));
    expect(text(l, c, { tid: AI })).toBe(`${playerName(theirs)} claimed off waivers by ${l.teams[U].abbrev}`);
  });

  it("logs the user's team options and draft picks, and the first round's", () => {
    const l = league();
    l.phase = 'resign';
    // a team option on next season, the last of his deal
    const p = shape(l, standardRoster(l, U)[0], 70, 24, 3_000, 2);
    p.contract.start = l.season;
    p.contract.option = 'team';
    const t = one(l, () => expect(decideTeamOption(l, p.pid, false).ok).toBe(true));
    expect(t).toMatchObject({ kind: 'option', pid: p.pid, amount: 3_000, note: 'declined' });
    expect(text(l, t, { tid: U })).toBe(`Declined ${playerName(p)}'s team option ($3.0M)`);

    l.phase = 'draft';
    const pool = Object.values(l.players).filter((x) => x.tid === DRAFT_PROSPECT);
    const pick = (round: 1 | 2, tid: number, n: number) => ({ dpid: 9_000 + n, season: l.season, round, originalTid: tid, tid, pick: n });
    const d = one(l, () => draftPlayer(l, pick(2, U, 10), pool[0].pid));
    expect(d).toMatchObject({ kind: 'draft', tids: [U], pid: pool[0].pid, note: '#40' });
    expect(text(l, d, { pid: pool[0].pid })).toBe(`Drafted #40 by ${l.teams[U].abbrev}`);
    expect(one(l, () => draftPlayer(l, pick(1, AI, 3), pool[1].pid))).toMatchObject({ kind: 'draft', tids: [AI], note: '#3' });
    const from = l.nextTxnId;
    draftPlayer(l, pick(2, AI, 4), pool[2].pid);
    expect(l.nextTxnId).toBe(from);
  });

  it("leaves AI teams' quiet roster fills out, but not the user's or the ones in the news", () => {
    const l = league();
    l.phase = 'regular';
    const from = l.nextTxnId ?? 1;
    // an AI team down to 11 and filled back to 13 with minimum deals, a quiet two-way deal
    while (standardRoster(l, AI).length > 11) releasePlayer(l, standardRoster(l, AI)[0], { news: false });
    fillRosters(l, new Rng(3));
    expect(standardRoster(l, AI).length).toBe(13);
    signPlayer(l, freeAgents(l)[0], 2, CAP_FOR(l).minContract, 2, { twoWay: true, news: false });
    expect((l.transactions ?? []).filter((t) => t.id >= from)).toEqual([]);
    // nor a minimum deal, in the news or not: camp bodies, most of them cut on opening night
    signPlayer(l, freeAgents(l)[0], 3, CAP_FOR(l).vetMin, 2);
    expect((l.transactions ?? []).filter((t) => t.id >= from)).toEqual([]);
    // a bigger signing is a move like any other
    const fa = freeAgents(l)[0];
    expect(one(l, () => signPlayer(l, fa, 3, 8_000, 2))).toMatchObject({ kind: 'sign', tids: [3], pid: fa.pid, amount: 8_000, years: 2 });
    // and the user's own quiet moves are his moves
    expect(one(l, () => signPlayer(l, freeAgents(l)[0], U, CAP_FOR(l).vetMin, 1, { news: false })).kind).toBe('sign');
    expect(one(l, () => releasePlayer(l, standardRoster(l, U)[0], { news: false })).user).toBe(true);
  });

  it("a new season keeps trades and the user's moves, and drops other teams' moves after two seasons", () => {
    const l = league();
    const S = l.season;
    const at = (season: number, kind: Txn['kind'], tids: number[], userTid = U) => {
      const [s, u] = [l.season, l.userTid];
      l.season = season;
      l.userTid = userTid;
      const t = logTxn(l, { kind, tids, pid: 1, name: 'A Player', ...(kind === 'trade' ? { sides: tids.map((tid) => ({ tid, players: [], picks: [] })) } : {}) });
      l.season = s;
      l.userTid = u;
      return t.id;
    };
    const keep = [at(S - 3, 'trade', [4, 5]), at(S - 3, 'sign', [U]), at(S - 3, 'release', [5], 5), at(S - 1, 'sign', [6]), at(S, 'extend', [7]), at(S - 2, 'claim', [8, U])];
    const drop = [at(S - 2, 'sign', [6]), at(S - 3, 'waive', [9]), at(S - 2, 'option', [10])];
    // the user's last moves from a job he has since left are his too (kept by `user`), unlike his new team's from before him
    expect(l.transactions!.find((t) => t.id === keep[2])!.user).toBe(true);
    l.phase = 'freeAgency';
    l.faDay = FA_DAYS - 1;
    expect(newSeason(l)).toBe(true);
    expect(l.season).toBe(S + 1);
    const ids = new Set(l.transactions!.map((t) => t.id));
    expect(keep.every((id) => ids.has(id))).toBe(true);
    expect(drop.some((id) => ids.has(id))).toBe(false);
    // pruning again changes nothing, and ids keep counting up
    const n = l.transactions!.length;
    pruneTransactions(l);
    expect(l.transactions!.length).toBe(n);
    expect(at(l.season, 'sign', [U])).toBeGreaterThan(Math.max(...keep, ...drop));
  });

  it('a save without a transaction log loads, and starts one at the first move', async () => {
    const l = league(9);
    const old = JSON.parse(JSON.stringify(l)) as League;
    delete old.transactions;
    delete old.nextTxnId;
    await saveLeague(old);
    const back = (await loadLeague(old.id))!;
    expect(back.transactions).toBeUndefined();
    expect(teamTxns(back, U)).toEqual([]);
    expect(playerTxns(back, standardRoster(back, U)[0].pid)).toEqual([]);
    back.phase = 'regular';
    const t = one(back, () => releasePlayer(back, standardRoster(back, U)[0]));
    expect(t.id).toBe(1);
    expect(back.nextTxnId).toBe(2);
    expect(standardRoster(back, U).some((p) => p.pid === t.pid)).toBe(false);
    expect(back.players[t.pid!].tid).toBe(FREE_AGENT);
    await saveLeague(back);
    expect((await loadLeague(back.id))!.transactions).toEqual([t]);
  });
});
