// AI front offices: each team's strategy (contend, retool, rebuild), AI-to-AI trades during the
// season and the rumours of who is on the block (the AI's offers to the user are in proposals.ts).
import type { DraftPick, League, Player } from '../types';
import { CAP } from '../constants';
import { Rng, clamp } from '../random';
import { CAP_FOR, contractSeason, curTeamSeason, standardRoster, winPct } from './helpers';
import { taxCapped } from './contracts';
import { capPayroll, withHoldsMemo } from './freeAgency';
import {
  MAX_FIRSTS_OUT,
  TradeOffer,
  capSalary,
  executeTrade,
  pickValueFor,
  playerValueFor,
  salaryMatchGap,
  stepienError,
  teamAccepts,
  tradedAwayBy,
  tradingClosedReason,
  untradeable,
  validateTrade,
} from './trades';
import { MAX_PICKS_OUT } from './tradePackages';

// ---------------------------------------------------------------- AI front offices

/**
 * Strategy by league rank, not fixed thresholds: real rosters bunch within a few OVR points, so
 * thresholds put nearly everyone in one bucket and nobody sells. Talent (top-8 OVR) decides in
 * the preseason; as games are played the record counts too, up to about two-thirds by the trade
 * deadline. About ten teams contend, the bottom nine (and young mid-table teams) rebuild, the
 * rest retool.
 */
export function teamStrategyUpdate(league: League) {
  const rows = league.teams.map((t) => {
    const top = standardRoster(league, t.tid)
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 8);
    const ts = curTeamSeason(league, t.tid);
    return {
      t,
      talent: top.reduce((a, p) => a + p.ovr, 0) / Math.max(1, top.length),
      ageAvg: top.reduce((a, p) => a + (league.season - p.bornYear), 0) / Math.max(1, top.length),
      wp: winPct(ts),
      gp: ts.won + ts.lost,
    };
  });
  const z = (xs: number[]) => {
    const mean = xs.reduce((a, x) => a + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length) || 1;
    return xs.map((x) => (x - mean) / sd);
  };
  const w = clamp(rows.reduce((a, r) => a + r.gp, 0) / rows.length / 75, 0, 0.65);
  const zt = z(rows.map((r) => r.talent));
  const zw = z(rows.map((r) => r.wp));
  const ranked = rows.map((r, i) => ({ ...r, score: zt[i] * (1 - w) + zw[i] * w })).sort((a, b) => b.score - a.score || a.t.tid - b.t.tid);
  ranked.forEach(({ t, ageAvg }, i) => {
    t.strategy = i < 10 ? 'contend' : i >= 21 || (i >= 15 && ageAvg <= 24.5) ? 'rebuild' : 'retool';
  });
}

/**
 * A team's chance of an AI-to-AI deal attempt today, and how many it gets: deals cluster toward the
 * deadline (9% a day early, 15% in the last three weeks, 30% in the last week and three tries at
 * 40% on deadline day): about 13 attempts a season, as when the chance was a flat 12%.
 */
export function aiTradeChance(league: League): { p: number; attempts: number } {
  const left = league.tradeDeadlineDay - league.day;
  if (left <= 0) return { p: 0.4, attempts: 3 };
  return { p: left < 7 ? 0.3 : left < 21 ? 0.15 : 0.09, attempts: 1 };
}

/** Players a team will move to a contender: a rebuilder's veterans (27 or older, 74+). Only players the rules let move. */
function sellable(league: League, tid: number): Player[] {
  if (league.teams[tid].strategy !== 'rebuild') return [];
  return standardRoster(league, tid).filter((p) => league.season - p.bornYear >= 27 && p.ovr >= 74 && !untradeable(league, p));
}

/**
 * AI-to-AI deals (a few a season, most near the deadline): contenders buy rebuilding teams'
 * veterans. The buyer matches salary first (without sending
 * an over-the-cap seller more than it can take back, or taking its own payroll past the tax after
 * using the mid-level), then adds its two most valuable young players and picks from the cheapest
 * up (three at most, so better ones replace the cheapest; two firsts at most) until the seller
 * agrees, and the deal only goes through if the buyer likes it too. Only assets the rules let move
 * are offered. Up to three players are tried.
 */
export function aiToAiTrade(league: League, rng: Rng) {
  if (league.phase !== 'regular' || league.day > league.tradeDeadlineDay) return;
  const { p, attempts } = aiTradeChance(league);
  for (let i = 0; i < attempts; i++) if (rng.chance(p)) aiTradeAttempt(league, rng);
}

function aiTradeAttempt(league: League, rng: Rng) {
  const ai = league.teams.filter((t) => t.tid !== league.userTid);
  const sellers = ai.filter((t) => t.strategy === 'rebuild');
  const s = sellers.length ? rng.pick(sellers) : undefined;
  const buyers = ai.filter((t) => t.strategy === 'contend' && t !== s);
  if (!s || !buyers.length) return;
  const b = rng.pick(buyers);
  for (const vet of rng.shuffle(sellable(league, s.tid)).slice(0, 3)) {
    const deal = aiPackage(league, b.tid, s.tid, vet);
    if (deal) {
      executeTrade(league, deal);
      return;
    }
  }
}

export interface BlockRumor {
  tid: number;
  pid: number;
  /** Contenders with a deal for him the seller would take. */
  suitors: number[];
}

/**
 * Who AI teams are shopping before the deadline: each seller's best player it would move (see
 * sellable), best first, with the contenders that have a package the seller would take for him
 * (as aiToAiTrade builds them), up to three of each.
 */
export function onTheBlock(league: League, max = 3): BlockRumor[] {
  if (tradingClosedReason(league)) return [];
  return withHoldsMemo(() => {
    const cands = league.teams
      .filter((t) => t.tid !== league.userTid)
      .flatMap((t) => sellable(league, t.tid).map((p) => ({ tid: t.tid, p })))
      .sort((x, y) => y.p.ovr - x.p.ovr || x.p.pid - y.p.pid);
    const seen = new Set<number>();
    const out: BlockRumor[] = [];
    for (const { tid, p } of cands) {
      if (out.length >= max) break;
      if (seen.has(tid)) continue;
      seen.add(tid);
      const suitors = league.teams.filter((b) => b.tid !== tid && b.tid !== league.userTid && b.strategy === 'contend' && aiPackage(league, b.tid, tid, p)).map((b) => b.tid);
      out.push({ tid, pid: p.pid, suitors: suitors.slice(0, 3) });
    }
    return out;
  });
}

function aiPackage(league: League, buyer: number, seller: number, vet: Player): TradeOffer | null {
  const sal = (p: Player) => capSalary(league, p.pid);
  // nothing the rules hold back: a recent signing, or an asset the seller traded away this season
  const movable = (a: Player | DraftPick) => !tradedAwayBy(league, a, seller) && !('pid' in a && untradeable(league, a));
  // the buyer's three best players are off the table
  const roster = standardRoster(league, buyer).sort((x, y) => y.ovr - x.ovr);
  const avail = roster.slice(3).filter((p) => p.ovr < vet.ovr && movable(p));
  // bodies going out for one coming back: keep the seller at 15 and the buyer at 13 or more
  const maxPkg = Math.min(4, CAP.rosterMax - standardRoster(league, seller).length + 1, roster.length - CAP.rosterMin + 1);
  if (maxPkg < 1) return null;
  const pkg: Player[] = [];
  const dps: DraftPick[] = [];
  const offer = (p?: Player): TradeOffer => ({
    a: { tid: buyer, pids: [...pkg, ...(p ? [p] : [])].map((x) => x.pid), dpids: dps.map((d) => d.dpid) },
    b: { tid: seller, pids: [vet.pid], dpids: [] },
  });
  // an over-the-cap seller can only take back so much salary
  const sellerFits = (p: Player) => salaryMatchGap(league, offer(p), 'b') === 0;
  // an over-the-cap buyer must send back salary first (125% rule), and one that used the
  // mid-level or the bi-annual enough that the deal doesn't take it past the tax (as validateTrade
  // has it: one already past it only can't add salary): the smallest contract that covers the gap,
  // else the biggest and keep going
  const s = contractSeason(league);
  const taxGap = () => {
    if (!taxCapped(league.teams[buyer], s)) return 0;
    const net = sal(vet) - pkg.reduce((a, p) => a + sal(p), 0);
    return Math.min(net, capPayroll(league, buyer, s) + net - CAP_FOR(league, s).luxuryTax);
  };
  const gapNow = () => Math.max(salaryMatchGap(league, offer(), 'a'), taxGap());
  while (gapNow() > 0) {
    const gap = gapNow();
    const rest = avail.filter((x) => !pkg.includes(x) && sellerFits(x));
    const p = rest.filter((x) => sal(x) >= gap).sort((x, y) => sal(x) - sal(y))[0] ?? rest.sort((x, y) => sal(y) - sal(x))[0];
    if (!p || pkg.length >= maxPkg) return null;
    pkg.push(p);
  }
  // then value, until the seller says yes: young players first, then picks from the cheapest up
  const youth = avail
    .filter((p) => !pkg.includes(p) && league.season - p.bornYear <= 25)
    .sort((x, y) => playerValueFor(league, y, seller, true) - playerValueFor(league, x, seller, true));
  const picks = league.draftPicks.filter((d) => d.tid === buyer && movable(d)).sort((x, y) => pickValueFor(league, x, seller, true) - pickValueFor(league, y, seller, true));
  for (const x of [...youth.slice(0, 2), ...picks]) {
    if (teamAccepts(league, offer(), seller)) break;
    if (!('pid' in x)) {
      // three picks at most: past that the cheapest one in makes way for this better one (else
      // three second-rounders would be as far as an offer ever got)
      const out = dps.length >= MAX_PICKS_OUT ? dps[0] : null;
      if (x.round === 1 && dps.filter((d) => d !== out && d.round === 1).length >= MAX_FIRSTS_OUT) continue;
      if (out) dps.shift();
      dps.push(x);
      // the Stepien rule: not if it leaves the buyer without a first in back-to-back drafts
      if (stepienError(league, offer(), offer().a)) {
        dps.pop();
        if (out) dps.unshift(out);
      }
    } else if (pkg.length < maxPkg && sellerFits(x)) pkg.push(x);
  }
  const deal = offer();
  return !validateTrade(league, deal).length && teamAccepts(league, deal, seller) && teamAccepts(league, deal, buyer) ? deal : null;
}
