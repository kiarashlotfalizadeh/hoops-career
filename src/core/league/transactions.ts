// The transaction log: a durable record of roster moves (trades, signings, re-signings,
// extensions, releases and waivers, waiver claims, buyouts, two-way deals and conversions,
// renounced rights, options and draft picks) behind the team and player histories. The news log
// keeps about a year of stories; this keeps every trade and every move of the user's team for good,
// and other teams' moves for two seasons. Entries hold names and pick labels as they were, so they
// read the same after the player retires and his record is compacted away, or the pick is made.

import type { League, Player, Txn, TxnKind, TxnSide } from '../types';
import { seasonLabel } from '../constants';
import { playerName } from './helpers';

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

/** Log a trade: what each team sent, its players' names and its picks' labels (`pickName`) as they are now. */
export function logTrade(league: League, sides: { tid: number; pids: number[]; dpids: number[] }[], pickName: (dpid: number) => string): Txn {
  return logTxn(league, {
    kind: 'trade',
    tids: sides.map((s) => s.tid),
    sides: sides.map((s) => ({
      tid: s.tid,
      players: [...new Set(s.pids)].filter((pid) => league.players[pid]).map((pid) => ({ pid, name: playerName(league.players[pid]) })),
      picks: [...new Set(s.dpids)].map(pickName),
    })),
  });
}

/**
 * New season: other teams' moves older than TXN_KEEP_SEASONS seasons leave the log. Trades stay,
 * and so does every move of the user's team, the one he ran then or the one he runs now.
 */
export function pruneTransactions(league: League) {
  if (!league.transactions) return;
  const first = league.season - TXN_KEEP_SEASONS;
  league.transactions = league.transactions.filter((t) => t.season >= first || t.kind === 'trade' || t.user || t.tids.includes(league.userTid));
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

const money = (k: number) => `$${(k / 1000).toFixed(1)}M`;
const yrs = (n: number) => `${n} yr${n === 1 ? '' : 's'}`;

/** A deal's total over its years, with the 5% raises new contracts carry (see makeContract), as the news quotes it. */
export function txnTotal(amount: number, years: number): number {
  let total = 0;
  for (let i = 0; i < years; i++) total += i ? Math.round((amount * Math.pow(1.05, i)) / 10) * 10 : amount;
  return total;
}

const deal = (t: Txn) => (t.amount !== undefined && t.years ? `${yrs(t.years)} / ${money(txnTotal(t.amount, t.years))}` : '');

/** "A", "A and B", "A, B and C" over parts. */
function listParts(items: TxnPart[]): TxnPart[] {
  return items.flatMap((x, i) => (i === 0 ? [x] : [i === items.length - 1 ? ' and ' : ', ', x]));
}

/** What a side sent: its players, then its picks ("a 2029 1st (BOS)"). */
function assets(side: TxnSide | undefined, except?: number): TxnPart[] {
  if (!side) return [];
  return [...side.players.filter((x) => x.pid !== except), ...side.picks.map((label) => `a ${label}`)];
}

/**
 * One line for a move, from a team's point of view (`{ tid }`: "Acquired X from BOS for Y") or a
 * player's (`{ pid }`: "Acquired by NYK from BOS with a 2029 1st for Y").
 */
export function txnLine(t: Txn, view: { tid: number } | { pid: number }): TxnPart[] {
  const P: TxnPart = { pid: t.pid ?? -1, name: t.name ?? 'Unknown player' };
  const tid = t.tids[0];
  const T: TxnPart = { tid };
  const forPlayer = 'pid' in view;
  const money$ = t.amount ? ` (${money(t.amount)})` : '';
  switch (t.kind) {
    case 'trade': {
      const sides = t.sides ?? [];
      if (forPlayer) {
        const mine = sides.find((s) => s.players.some((x) => x.pid === view.pid));
        const other = sides.find((s) => s !== mine);
        if (!mine || !other) return ['Traded'];
        const w = assets(mine, view.pid);
        const f = assets(other);
        return ['Acquired by ', { tid: other.tid }, ' from ', { tid: mine.tid }, ...(w.length ? [' with ', ...listParts(w)] : []), ...(f.length ? [' for ', ...listParts(f)] : [])];
      }
      const own = sides.find((s) => s.tid === view.tid);
      const other = sides.find((s) => s !== own);
      if (!own || !other) return ['Trade'];
      const get = assets(other);
      const give = assets(own);
      return get.length
        ? ['Acquired ', ...listParts(get), ' from ', { tid: other.tid }, ...(give.length ? [' for ', ...listParts(give)] : [])]
        : ['Traded ', ...listParts(give), ' to ', { tid: other.tid }, ' for nothing back'];
    }
    case 'sign':
      return forPlayer ? ['Signed with ', T, `: ${deal(t)}`] : ['Signed ', P, `: ${deal(t)}`];
    case 'resign':
      return forPlayer ? ['Re-signed with ', T, `: ${deal(t)}`] : ['Re-signed ', P, `: ${deal(t)}`];
    case 'extend':
      return forPlayer ? ['Extended by ', T, `: ${deal(t)}`] : ['Extended ', P, `: ${deal(t)}`];
    case 'twoWay': {
      const len = t.years ? ` (${yrs(t.years)})` : '';
      return forPlayer ? ['Signed a two-way deal with ', T, len] : ['Signed ', P, ` to a two-way deal${len}`];
    }
    case 'convert':
      return forPlayer ? ['Converted to a standard contract by ', T] : ['Converted ', P, ' from a two-way to a standard contract'];
    case 'release':
    case 'waive': {
      const verb = t.kind === 'waive' ? 'Waived' : 'Released';
      const dead = t.amount ? ` (${money(t.amount)} in dead money)` : '';
      return forPlayer ? [`${verb} by `, T, dead] : [`${verb} `, P, dead];
    }
    case 'claim': {
      const from: TxnPart = { tid: t.tids[1] };
      const terms = t.amount !== undefined ? ` (${money(t.amount)}${t.years ? `, through ${seasonLabel(t.season + t.years - 1)}` : ''})` : '';
      if (forPlayer) return ['Claimed off waivers by ', T, ' from ', from, terms];
      return view.tid === tid ? ['Claimed ', P, ' off waivers from ', from, terms] : [P, ' claimed off waivers by ', T];
    }
    case 'buyout': {
      const back = t.amount ? `, ${forPlayer ? 'giving' : 'who gave'} back ${money(t.amount)}` : '';
      return forPlayer ? ['Bought out by ', T, back] : ['Bought out ', P, back];
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
      return forPlayer ? [t.note ? `Drafted ${t.note} by ` : 'Drafted by ', T] : ['Drafted ', P, t.note ? ` (${t.note})` : ''];
  }
}

/** The line as plain text: players by their names then, teams by abbreviation. */
export function txnText(league: League, parts: TxnPart[]): string {
  return parts.map((x) => (typeof x === 'string' ? x : 'tid' in x ? (league.teams[x.tid]?.abbrev ?? '?') : x.name)).join('');
}
