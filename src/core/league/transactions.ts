// The transaction log: a durable record of roster moves (trades, signings, re-signings,
// extensions, releases and waivers (stretched or not), waiver claims, buyouts, two-way deals and
// conversions, renounced rights, options, draft picks, exercised pick swaps, restricted free
// agency's qualifying offers, offer sheets and matches, and 10-day contracts) behind the team and
// player histories. The news log keeps about a year of stories; this keeps every trade (and pick
// swap) and every move of the user's team for good, and other teams' moves for two seasons. Entries
// hold names and pick labels as they were, so they read the same after the player retires and his
// record is compacted away, or the pick is made.

import type { League, Player, Txn, TxnKind, TxnSide } from '../types';
import { seasonLabel } from '../constants';
import { playerName } from './helpers';
import { money } from '../format';

/** Seasons other teams' moves stay in the log, besides the current one (trades and the user's moves stay for good). */
export const TXN_KEEP_SEASONS = 2;

/** Add a move to the log, dated today. Fields left undefined aren't stored. */
export function logTxn(league: League, t: Omit<Txn, 'id' | 'season' | 'day' | 'phase' | 'user'>): Txn {
  const log = (league.transactions ??= []);
  const id = league.nextTxnId ?? (log.length ? log[log.length - 1].id + 1 : 1);
  league.nextTxnId = id + 1;
  const txn: Txn = { id, season: league.season, day: league.day, phase: league.phase, ...t };
  for (const k of Object.keys(txn) as (keyof Txn)[]) if (txn[k] === undefined) delete txn[k];
  if (t.tids.includes(league.userTid)) txn.user = true;
  log.push(txn);
  return txn;
}

/** Log one player's move with team `tid` (a waiver claim: [claiming team, waiving team]). */
export function logMove(league: League, kind: TxnKind, tid: number | number[], p: Player, extra: Pick<Txn, 'amount' | 'years' | 'note'> = {}): Txn {
  return logTxn(league, { kind, tids: Array.isArray(tid) ? tid : [tid], pid: p.pid, name: playerName(p), ...extra });
}

type TradedSide = { tid: number; pids: number[]; dpids: number[]; swaps?: number[]; cash?: number };

/** Log a trade: what each team sent, its players' names and its picks' labels (`pickName`) as they are now, the swap rights it gave and its cash. */
export function logTrade<S extends TradedSide>(league: League, sides: S[], pickName: (dpid: number, side: S) => string): Txn {
  return logTxn(league, {
    kind: 'trade',
    tids: sides.map((s) => s.tid),
    sides: sides.map((s) => ({
      tid: s.tid,
      players: [...new Set(s.pids)].filter((pid) => league.players[pid]).map((pid) => ({ pid, name: playerName(league.players[pid]) })),
      picks: [...new Set(s.dpids)].map((d) => pickName(d, s)),
      ...(s.swaps?.length ? { swaps: [...s.swaps] } : {}),
      ...((s.cash ?? 0) > 0 ? { cash: s.cash } : {}),
    })),
  });
}

/** Log a pick swap exercised at the lottery: `up` held the right and moved up, giving up `upPick` (its label then) for `downPick`, the other team's. */
export function logSwap(league: League, up: number, upPick: string, down: number, downPick: string): Txn {
  return logTxn(league, {
    kind: 'swap',
    tids: [up, down],
    sides: [
      { tid: up, players: [], picks: [upPick] },
      { tid: down, players: [], picks: [downPick] },
    ],
  });
}

/**
 * New season: other teams' moves older than TXN_KEEP_SEASONS seasons leave the log. Trades (and
 * pick swaps) stay, and so does every move of the user's team, the one he ran then or the one he runs now.
 */
export function pruneTransactions(league: League) {
  if (!league.transactions) return;
  const first = league.season - TXN_KEEP_SEASONS;
  league.transactions = league.transactions.filter((t) => t.season >= first || t.kind === 'trade' || t.kind === 'swap' || t.user || t.tids.includes(league.userTid));
}

const newestFirst = (a: Txn, b: Txn) => b.id - a.id;

/** Moves a team was in, newest first. */
export function teamTxns(league: League, tid: number): Txn[] {
  return (league.transactions ?? []).filter((t) => t.tids.includes(tid)).sort(newestFirst);
}

/** A player's moves, newest first: his own, and the trades he was in. */
export function playerTxns(league: League, pid: number): Txn[] {
  return (league.transactions ?? []).filter((t) => t.pid === pid || t.sides?.some((s) => s.players.some((x) => x.pid === pid))).sort(newestFirst);
}

/** Trades between two teams, newest first. */
export function tradesBetween(league: League, a: number, b: number): Txn[] {
  return (league.transactions ?? []).filter((t) => t.kind === 'trade' && t.tids.includes(a) && t.tids.includes(b)).sort(newestFirst);
}

// ---------------------------------------------------------------- one line per move

/** A piece of a move's line: text, a player (his name then, linked when he is still in the league) or a team. */
export type TxnPart = string | { pid: number; name: string } | { tid: number };

const yrs = (n: number) => `${n} yr${n === 1 ? '' : 's'}`;

/** A deal's total over its years, with the 5% raises new contracts carry (see makeContract), as the news quotes it. */
export function txnTotal(amount: number, years: number): number {
  let total = 0;
  for (let i = 0; i < years; i++) total += i ? Math.round((amount * Math.pow(1.05, i)) / 10) * 10 : amount;
  return total;
}

const deal = (t: Txn) => (t.amount !== undefined && t.years ? `${yrs(t.years)} / ${money(txnTotal(t.amount, t.years))}` : '');

/** A stretched release's dead money: ", stretched over 7 seasons". */
const stretched = (t: Txn) => (t.note === 'stretched' && t.years ? `, stretched over ${t.years} seasons` : '');

/** "A", "A and B", "A, B and C" over parts. */
function listParts(items: TxnPart[]): TxnPart[] {
  return items.flatMap((x, i) => (i === 0 ? [x] : [i === items.length - 1 ? ' and ' : ', ', x]));
}

/** What a side sent: its players, then its picks ("a 2029 1st (BOS)"), the swap rights it gave and its cash. */
function assets(side: TxnSide | undefined, except?: number): TxnPart[] {
  if (!side) return [];
  return [
    ...side.players.filter((x) => x.pid !== except),
    ...side.picks.map((label) => `a ${label}`),
    ...(side.swaps ?? []).map((y) => `the right to swap ${y} firsts`),
    ...(side.cash ? [`${money(side.cash)} in cash`] : []),
  ];
}

/**
 * One line for a move, from a team's point of view (`{ tid }`: "Acquired X from BOS. Sent Y") or a
 * player's (`{ pid }`: "Acquired by NYK from BOS with a 2029 1st. BOS got Y"): one side a sentence.
 */
export function txnLine(t: Txn, view: { tid: number } | { pid: number }): TxnPart[] {
  const P: TxnPart = { pid: t.pid ?? -1, name: t.name ?? 'Unknown player' };
  const tid = t.tids[0];
  const T: TxnPart = { tid };
  const forPlayer = 'pid' in view;
  const money$ = t.amount ? ` · ${money(t.amount)}` : '';
  switch (t.kind) {
    case 'trade': {
      const sides = t.sides ?? [];
      if (forPlayer) {
        const mine = sides.find((s) => s.players.some((x) => x.pid === view.pid));
        const other = sides.find((s) => s !== mine);
        if (!mine || !other) return ['Traded'];
        const w = assets(mine, view.pid);
        const f = assets(other);
        return [
          'Acquired by ',
          { tid: other.tid },
          ' from ',
          { tid: mine.tid },
          ...(w.length ? [' with ', ...listParts(w)] : []),
          ...(f.length ? ['. ', { tid: mine.tid }, ' got ', ...listParts(f)] : []),
        ];
      }
      const own = sides.find((s) => s.tid === view.tid);
      const other = sides.find((s) => s !== own);
      if (!own || !other) return ['Trade'];
      const get = assets(other);
      const give = assets(own);
      return get.length
        ? ['Acquired ', ...listParts(get), ' from ', { tid: other.tid }, ...(give.length ? ['. Sent ', ...listParts(give)] : [])]
        : ['Traded ', ...listParts(give), ' to ', { tid: other.tid }, ' for nothing back'];
    }
    case 'swap': {
      // sides: the team that held the right and moved up, then the other; each lists the pick it gave up
      const [up, down] = t.sides ?? [];
      if (!up || !down || forPlayer) return ['Pick swap'];
      const took = down.picks[0] ?? 'a pick';
      const gave = up.picks[0] ?? 'a pick';
      return view.tid === up.tid
        ? ['Swapped firsts with ', { tid: down.tid }, `: took the ${took} for the ${gave}`]
        : [{ tid: up.tid }, ` swapped firsts: took the ${took} for the ${gave}`];
    }
    case 'sign':
      return forPlayer ? ['Signed with ', T, `: ${deal(t)}`] : ['Signed ', P, `: ${deal(t)}`];
    case 'resign':
      return forPlayer ? ['Re-signed with ', T, `: ${deal(t)}`] : ['Re-signed ', P, `: ${deal(t)}`];
    case 'extend':
      return forPlayer ? ['Extended by ', T, `: ${deal(t)}`] : ['Extended ', P, `: ${deal(t)}`];
    case 'twoWay': {
      const len = t.years ? ` · ${yrs(t.years)}` : '';
      return forPlayer ? ['Signed a two-way deal with ', T, len] : ['Signed ', P, ` to a two-way deal${len}`];
    }
    case 'convert':
      return forPlayer ? ['Converted to a standard contract by ', T] : ['Converted ', P, ' from a two-way to a standard contract'];
    case 'release':
    case 'waive': {
      const verb = t.kind === 'waive' ? 'Waived' : 'Released';
      const dead = t.amount ? ` · ${money(t.amount)} in dead money${stretched(t)}` : '';
      return forPlayer ? [`${verb} by `, T, dead] : [`${verb} `, P, dead];
    }
    case 'claim': {
      const from: TxnPart = { tid: t.tids[1] };
      const terms = t.amount !== undefined ? ` · ${money(t.amount)}${t.years ? ` through ${seasonLabel(t.season + t.years - 1)}` : ''}` : '';
      if (forPlayer) return ['Claimed off waivers by ', T, ' from ', from, terms];
      return view.tid === tid ? ['Claimed ', P, ' off waivers from ', from, terms] : [P, ' claimed off waivers by ', T];
    }
    case 'buyout': {
      const back = t.amount ? `, ${forPlayer ? 'giving' : 'who gave'} back ${money(t.amount)}` : '';
      const rest = t.note === 'stretched' && t.years ? `, the rest stretched over ${t.years} seasons` : '';
      return forPlayer ? ['Bought out by ', T, back, rest] : ['Bought out ', P, back, rest];
    }
    case 'tenDay': {
      if (t.note === 'ended') return forPlayer ? ['10-day contract with ', T, ' ended'] : [P, "'s 10-day contract ended"];
      const which = t.note === 'second' ? 'a second 10-day contract' : t.note === 'hardship' ? 'a hardship 10-day contract' : 'a 10-day contract';
      return forPlayer ? [`Signed ${which} with `, T, money$] : ['Signed ', P, ` to ${which}${money$}`];
    }
    case 'renounce':
      return forPlayer ? ['Rights renounced by ', T] : ['Renounced the rights to ', P];
    case 'option': {
      if (t.note === 'opted in' || t.note === 'opted out') {
        const verb = t.note === 'opted in' ? 'opted into' : 'opted out of';
        return forPlayer ? [`${verb[0].toUpperCase()}${verb.slice(1)} his player option with `, T, money$] : [P, ` ${verb} his player option${money$}`];
      }
      const declined = t.note === 'declined';
      return forPlayer ? [`Team option ${declined ? 'declined' : 'exercised'} by `, T, money$] : [declined ? 'Declined ' : 'Exercised ', P, `'s team option${money$}`];
    }
    case 'draft':
      return forPlayer ? [t.note ? `Drafted ${t.note} by ` : 'Drafted by ', T] : ['Drafted ', P, t.note ? ` · ${t.note}` : ''];
    case 'qualify':
      if (t.note === 'accepted') return forPlayer ? ['Took his qualifying offer from ', T, `: ${deal(t)}`] : [P, ` took his qualifying offer: ${deal(t)}`];
      if (t.note === 'withdrawn') return forPlayer ? ['Qualifying offer withdrawn by ', T] : ['Withdrew ', P, "'s qualifying offer"];
      return forPlayer ? ['Qualifying offer from ', T, money$] : ['Extended a qualifying offer to ', P, money$];
    case 'offerSheet': {
      // [the team that signed him to it, his team]
      const own: TxnPart = { tid: t.tids[1] };
      if (forPlayer) return ['Signed an offer sheet with ', T, `: ${deal(t)}`];
      return view.tid === tid ? ['Signed ', P, ` to an offer sheet: ${deal(t)}. `, own, ' can match'] : [P, ' signed an offer sheet with ', T, `: ${deal(t)}`];
    }
    case 'match': {
      // [his team, the team that signed him to the offer sheet]
      const by: TxnPart = { tid: t.tids[1] };
      const matched = t.note !== 'declined';
      if (forPlayer) return matched ? ['Offer sheet from ', by, ' matched by ', T, `: ${deal(t)}`] : ['Joined ', by, ' when ', T, ` declined to match his offer sheet: ${deal(t)}`];
      if (view.tid === tid) return matched ? ['Matched ', by, "'s offer sheet for ", P, `: ${deal(t)}`] : ['Declined to match ', by, "'s offer sheet for ", P];
      return matched ? [T, ' matched the offer sheet for ', P] : ['Got ', P, ' when ', T, ` declined to match the offer sheet: ${deal(t)}`];
    }
  }
}

/** The line as plain text: players by their names then, teams by abbreviation. */
export function txnText(league: League, parts: TxnPart[]): string {
  return parts.map((x) => (typeof x === 'string' ? x : 'tid' in x ? (league.teams[x.tid]?.abbrev ?? '?') : x.name)).join('');
}
