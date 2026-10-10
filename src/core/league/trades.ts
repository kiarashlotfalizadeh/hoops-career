// Trades: validation (roster size, 125% salary matching when over the cap), AI valuation
// with team strategy and difficulty, a "what would make this work?" helper, and occasional
// AI-initiated offers.

import type { DraftPick, League, Player } from '../types';
import { CAP } from '../constants';
import { Rng, clamp } from '../random';
import { salaryFor } from '../playerGen';
import { CAP_FOR, contractSeason, addInbox, addNews, curTeamSeason, payroll, playerName, teamPlayers, winPct } from './helpers';
import { tradeValue } from './contracts';

export interface TradeSide {
  tid: number;
  pids: number[];
  dpids: number[];
}

export interface TradeOffer {
  a: TradeSide; // usually the user
  b: TradeSide; // counterparty
}

export interface TradeEval {
  ok: boolean;
  errors: string[];
  /** Value the AI side (b) receives minus what it gives, after its biases. */
  delta: number;
  valueIn: number;
  valueOut: number;
  accept: boolean;
  message: string;
}

function season(league: League) {
  return contractSeason(league);
}

export function pickValue(league: League, dp: DraftPick): number {
  const orig = league.teams[dp.originalTid];
  const ts = curTeamSeason(league, orig.tid);
  const games = ts.won + ts.lost;
  const prev = orig.seasons.find((s) => s.season === league.season - 1);
  const wp = games >= 15 ? winPct(ts) : prev ? winPct(prev) * 0.6 + 0.2 : 0.5;
  const yearsOut = dp.season - league.season;
  // projected slot 1..30, regressing toward the middle for future years
  let slot = dp.pick ?? 1 + (1 - clamp(1 - wp, 0, 1)) * 29;
  if (dp.pick === undefined) slot = slot * Math.pow(0.75, yearsOut) + 15.5 * (1 - Math.pow(0.75, yearsOut));
  if (dp.round === 2) slot += 30;
  // expected prospect value score: #1 ~ 79, #15 ~ 70, #30 ~ 66, #45 ~ 62
  const score = slot <= 30 ? 80 - Math.log(slot) * 4.2 : 66 - (slot - 30) * 0.28;
  return Math.exp((score - 60) / 6) * Math.pow(0.93, Math.max(0, yearsOut));
}

function sideValue(league: League, side: TradeSide, receiverStrategy: 'contend' | 'retool' | 'rebuild'): number {
  let v = 0;
  for (const pid of side.pids) v += tradeValue(league, league.players[pid], receiverStrategy);
  for (const dpid of side.dpids) {
    const dp = league.draftPicks.find((d) => d.dpid === dpid);
    if (dp) v += pickValue(league, dp) * (receiverStrategy === 'rebuild' ? 1.35 : receiverStrategy === 'contend' ? 0.7 : 1);
  }
  return v;
}

export function validateTrade(league: League, offer: TradeOffer): string[] {
  const errors: string[] = [];
  const s = season(league);
  const cap = CAP_FOR(league, s);
  if (league.phase === 'regular' && league.day > league.tradeDeadlineDay) errors.push('The trade deadline has passed.');
  if (league.phase === 'playoffs' || league.phase === 'playin') errors.push('No trades during the postseason.');
  for (const [mine, other] of [
    [offer.a, offer.b],
    [offer.b, offer.a],
  ] as const) {
    for (const pid of mine.pids) {
      const p = league.players[pid];
      if (!p || p.tid !== mine.tid) errors.push('A player in the deal is no longer on that team.');
    }
    for (const dpid of mine.dpids) {
      const dp = league.draftPicks.find((d) => d.dpid === dpid);
      if (!dp || dp.tid !== mine.tid) errors.push('A draft pick in the deal is no longer owned by that team.');
    }
    const size = teamPlayers(league, mine.tid).length - mine.pids.length + other.pids.length;
    if (size > CAP.rosterMax) errors.push(`${league.teams[mine.tid].abbrev} would have ${size} players (max ${CAP.rosterMax}).`);
    const outSal = mine.pids.reduce((a, pid) => a + salaryFor(league.players[pid], s), 0);
    const inSal = other.pids.reduce((a, pid) => a + salaryFor(league.players[pid], s), 0);
    const after = payroll(league, mine.tid, s) - outSal + inSal;
    if (after > cap.salaryCap && inSal > outSal * CAP.tradeMatchPct + CAP.tradeMatchBuffer) {
      errors.push(`${league.teams[mine.tid].abbrev} is over the cap and can take back at most 125% of outgoing salary ($${((outSal * CAP.tradeMatchPct + CAP.tradeMatchBuffer) / 1000).toFixed(1)}M) — incoming is $${(inSal / 1000).toFixed(1)}M.`);
    }
  }
  if (!offer.a.pids.length && !offer.a.dpids.length && !offer.b.pids.length && !offer.b.dpids.length) errors.push('The trade is empty.');
  return [...new Set(errors)];
}

export function evaluateTrade(league: League, offer: TradeOffer): TradeEval {
  const errors = validateTrade(league, offer);
  const ai = league.teams[offer.b.tid];
  const valueIn = sideValue(league, offer.a, ai.strategy);
  const valueOut = sideValue(league, offer.b, ai.strategy);
  const diff = league.settings.difficulty;
  // casual AIs accept slightly unfavorable deals; hard AIs want a premium
  const generosity = diff === 'casual' ? 0.88 : diff === 'hard' ? 1.12 : 1.0;
  // roster consolidation penalty: receiving many low-value pieces for one star
  const consolidation = offer.a.pids.length > offer.b.pids.length + 1 ? 0.92 : 1;
  const adjIn = valueIn * consolidation;
  const delta = adjIn - valueOut * generosity;
  const accept = errors.length === 0 && delta >= -0.01 && (valueIn > 0 || valueOut === 0);
  let message: string;
  if (errors.length) message = errors[0];
  else if (accept) message = delta > valueOut * 0.25 ? 'Deal! (They seem eager.)' : 'Deal!';
  else {
    const gap = valueOut * generosity - adjIn;
    const pct = valueOut > 0 ? gap / valueOut : 1;
    message = pct > 0.6 ? 'Not even close.' : pct > 0.25 ? 'You need to add significant value.' : 'Close — add a little more.';
  }
  return { ok: errors.length === 0, errors, delta, valueIn, valueOut, accept, message };
}

export function executeTrade(league: League, offer: TradeOffer) {
  const move = (pids: number[], to: number) => {
    for (const pid of pids) {
      const p = league.players[pid];
      const from = league.teams[p.tid];
      from.rotation.order = from.rotation.order.filter((x) => x !== pid);
      delete from.rotation.minutes[pid];
      from.rotation.closers = from.rotation.closers.filter((x) => x !== pid);
      from.rotation.restB2B = from.rotation.restB2B.filter((x) => x !== pid);
      delete from.tactics.offense.roles[pid];
      delete from.tactics.offense.freedom[pid];
      p.tid = to;
      p.joinedSeason = league.season;
      p.mood.tradeRequest = false;
      p.mood.score = Math.max(p.mood.score, 0);
      league.teams[to].rotation.order.push(pid);
    }
  };
  const movePicks = (dpids: number[], to: number) => {
    for (const dpid of dpids) {
      const dp = league.draftPicks.find((d) => d.dpid === dpid);
      if (dp) dp.tid = to;
    }
  };
  move(offer.a.pids, offer.b.tid);
  move(offer.b.pids, offer.a.tid);
  movePicks(offer.a.dpids, offer.b.tid);
  movePicks(offer.b.dpids, offer.a.tid);
  const ta = league.teams[offer.a.tid];
  const tb = league.teams[offer.b.tid];
  const desc = (side: TradeSide) =>
    [
      ...side.pids.map((pid) => playerName(league.players[pid])),
      ...side.dpids.map((dpid) => {
        const dp = league.draftPicks.find((d) => d.dpid === dpid)!;
        return pickLabel(league, dp);
      }),
    ].join(', ') || 'nothing';
  addNews(league, { kind: 'trade', text: `Trade: ${ta.abbrev} send ${desc(offer.a)} to ${tb.abbrev} for ${desc(offer.b)}.`, tids: [ta.tid, tb.tid], pids: [...offer.a.pids, ...offer.b.pids] });
}

export function pickLabel(league: League, dp: DraftPick) {
  const orig = league.teams[dp.originalTid];
  return `${dp.season} ${dp.round === 1 ? '1st' : '2nd'}${dp.pick ? ` (#${dp.pick})` : ''}${dp.originalTid !== dp.tid ? ` (${orig.abbrev})` : ''}`;
}

/** Ask the AI what it would need from side A to accept. Returns an adjusted offer or null. */
export function makeItWork(league: League, offer: TradeOffer): TradeOffer | null {
  let cur: TradeOffer = { a: { ...offer.a, pids: [...offer.a.pids], dpids: [...offer.a.dpids] }, b: { ...offer.b, pids: [...offer.b.pids], dpids: [...offer.b.dpids] } };
  for (let iter = 0; iter < 6; iter++) {
    const ev = evaluateTrade(league, cur);
    if (ev.accept) return cur;
    if (!ev.ok && !ev.errors.every((e) => e.includes('125%'))) return null;
    const ai = league.teams[cur.b.tid];
    // candidate assets from side A not already included
    const players = teamPlayers(league, cur.a.tid).filter((p) => !cur.a.pids.includes(p.pid));
    const picks = league.draftPicks.filter((d) => d.tid === cur.a.tid && !cur.a.dpids.includes(d.dpid));
    const need = -ev.delta;
    type Cand = { kind: 'p' | 'd'; id: number; v: number };
    const cands: Cand[] = [
      ...players.map((p) => ({ kind: 'p' as const, id: p.pid, v: tradeValue(league, p, ai.strategy) })),
      ...picks.map((d) => ({ kind: 'd' as const, id: d.dpid, v: pickValue(league, d) * (ai.strategy === 'rebuild' ? 1.35 : ai.strategy === 'contend' ? 0.7 : 1) })),
    ];
    if (!cands.length) return null;
    // smallest asset that covers the gap, else the biggest one
    const covering = cands.filter((c) => c.v >= need).sort((a, b) => a.v - b.v);
    const pick = covering[0] ?? cands.sort((a, b) => b.v - a.v)[0];
    if (pick.kind === 'p') cur.a.pids.push(pick.id);
    else cur.a.dpids.push(pick.id);
    cur = { a: cur.a, b: cur.b };
  }
  return evaluateTrade(league, cur).accept ? cur : null;
}

export function teamStrategyUpdate(league: League) {
  for (const t of league.teams) {
    const roster = teamPlayers(league, t.tid).sort((a, b) => b.ovr - a.ovr);
    const top = roster.slice(0, 8);
    const avg = top.reduce((a, p) => a + p.ovr, 0) / Math.max(1, top.length);
    const ageAvg = top.reduce((a, p) => a + (league.season - p.bornYear), 0) / Math.max(1, top.length);
    if (avg >= 78) t.strategy = 'contend';
    else if (avg <= 73 || (ageAvg <= 24.5 && avg < 76)) t.strategy = 'rebuild';
    else t.strategy = 'retool';
  }
}

/** Occasionally an AI team pitches a trade to the user. */
export function aiProposeToUser(league: League, rng: Rng) {
  if (league.phase !== 'regular' || league.day > league.tradeDeadlineDay) return;
  if (!rng.chance(0.06)) return;
  const user = league.userTid;
  const mine = teamPlayers(league, user).filter((p) => p.ovr >= 70);
  if (!mine.length) return;
  const target = rng.pick(mine);
  const partners = league.teams.filter((t) => t.tid !== user);
  const t = rng.pick(partners);
  const theirs = teamPlayers(league, t.tid).sort((a, b) => tradeValue(league, b, 'retool') - tradeValue(league, a, 'retool'));
  const want = tradeValue(league, target, t.strategy);
  // build a package of roughly equal value
  const pkg: Player[] = [];
  let v = 0;
  for (const p of theirs) {
    if (p.ovr >= target.ovr + 3) continue;
    const pv = tradeValue(league, p, league.teams[user].strategy);
    if (v + pv > want * 1.15) continue;
    pkg.push(p);
    v += pv;
    if (v >= want * 0.92 || pkg.length >= 3) break;
  }
  if (!pkg.length || v < want * 0.85) return;
  const offer: TradeOffer = { a: { tid: user, pids: [target.pid], dpids: [] }, b: { tid: t.tid, pids: pkg.map((p) => p.pid), dpids: [] } };
  if (validateTrade(league, offer).length) return;
  addInbox(league, {
    from: `${t.region} ${t.name} GM`,
    subject: `Interest in ${playerName(target)}`,
    body: `We'd offer ${pkg.map((p) => `${playerName(p)} (${p.ovr})`).join(', ')} for ${playerName(target)} (${target.ovr}). Open the Trade screen to review.`,
    tone: 'neutral',
    link: `/trade?with=${t.tid}&give=${target.pid}&get=${pkg.map((p) => p.pid).join(',')}`,
  });
}

/** Rare AI-to-AI trades to keep the league moving. */
export function aiToAiTrade(league: League, rng: Rng) {
  if (league.phase !== 'regular' || league.day > league.tradeDeadlineDay) return;
  if (!rng.chance(0.035)) return;
  const sellers = league.teams.filter((t) => t.tid !== league.userTid && t.strategy === 'rebuild');
  const buyers = league.teams.filter((t) => t.tid !== league.userTid && t.strategy === 'contend');
  if (!sellers.length || !buyers.length) return;
  const s = rng.pick(sellers);
  const b = rng.pick(buyers);
  const vets = teamPlayers(league, s.tid).filter((p) => league.season - p.bornYear >= 27 && p.ovr >= 74);
  if (!vets.length) return;
  const vet = rng.pick(vets);
  const want = tradeValue(league, vet, 'rebuild');
  const youth = teamPlayers(league, b.tid).filter((p) => league.season - p.bornYear <= 25 && p.ovr < vet.ovr).sort((x, y) => tradeValue(league, y, 'rebuild') - tradeValue(league, x, 'rebuild'));
  const picks = league.draftPicks.filter((d) => d.tid === b.tid && d.round === 1);
  const pkg: Player[] = [];
  const dps: DraftPick[] = [];
  let v = 0;
  for (const p of youth) {
    if (v >= want) break;
    pkg.push(p);
    v += tradeValue(league, p, 'rebuild');
    if (pkg.length >= 2) break;
  }
  for (const d of picks) {
    if (v >= want) break;
    dps.push(d);
    v += pickValue(league, d) * 1.35;
  }
  const offer: TradeOffer = { a: { tid: b.tid, pids: pkg.map((p) => p.pid), dpids: dps.map((d) => d.dpid) }, b: { tid: s.tid, pids: [vet.pid], dpids: [] } };
  if (v < want * 0.95 || validateTrade(league, offer).length) return;
  executeTrade(league, offer);
}
