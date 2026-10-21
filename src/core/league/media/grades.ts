// Trade grades: each side of a deal graded A to F by the core's own trade values (contracts.ts'
// tradeValue for players, trades.ts' pickValue for picks), through the team's own strategy, the
// way its front office weighed the deal: a contender is graded on what helps now, a rebuilder on
// youth and picks. Read from the transaction log after the deal, so the assets are where they went.
import type { DraftPick, League, Player, Txn, TxnSide } from '../../types';
import { tradeValue } from '../contracts';
import { DEPTH, PICK_DEPTH, PICK_LENS, pickValue, weighted } from '../trades';
import { contractSeason } from '../helpers';
import { money } from '../../format';
import { playerAge, salaryFor } from '../../playerGen';
import { gradeFor, last, type Grade } from './voice';

/** One side of a graded deal. */
export interface SideGrade {
  tid: number;
  grade: Grade;
  /** Value in and out through the team's own lens, and the score the grade comes from (about −1..1). */
  valueIn: number;
  valueOut: number;
  score: number;
  /** The best player (or pick) it got and gave. */
  got: { players: Player[]; picks: DraftPick[] };
  gave: { players: Player[]; picks: DraftPick[] };
  /** Salary this season in and out ($K). */
  salaryIn: number;
  salaryOut: number;
}

/** The picks one side sent in a trade: those the other team holds now that it traded away that season. */
function picksSent(league: League, from: number, to: number, season: number): DraftPick[] {
  return league.draftPicks.filter((dp) => dp.tid === to && dp.tradedFrom?.season === season && (dp.tradedFrom.tid === from || !!dp.tradedFrom.also?.includes(from)));
}

function playersSent(league: League, side: TxnSide): Player[] {
  return side.players.map((x) => league.players[x.pid]).filter((p): p is Player => !!p);
}

/** Grade both sides of a two-team trade (null for anything else, or when the assets can't be found any more). */
export function gradeTrade(league: League, t: Txn): [SideGrade, SideGrade] | null {
  if (t.kind !== 'trade' || t.sides?.length !== 2) return null;
  const [a, b] = t.sides;
  const cs = contractSeason(league);
  const side = (me: TxnSide, them: TxnSide): SideGrade => {
    const strategy = league.teams[me.tid].strategy;
    const gotP = playersSent(league, them);
    const gaveP = playersSent(league, me);
    const gotK = picksSent(league, them.tid, me.tid, t.season);
    const gaveK = picksSent(league, me.tid, them.tid, t.season);
    // the deal by the league's neutral values, and by the team's own strategy's (a contender's or a rebuilder's)
    const judge = (lens: 'retool' | typeof strategy) => {
      const pv = (p: Player) => tradeValue(league, p, lens);
      const kv = (dp: DraftPick) => pickValue(league, dp) * PICK_LENS[lens];
      // the bigger half's extra players count for less, and a pile of picks for less than its sum
      const vin = weighted(gotP.map(pv), gotP.length > gaveP.length ? DEPTH : null) + weighted(gotK.map(kv), PICK_DEPTH);
      const vout = weighted(gaveP.map(pv), gaveP.length > gotP.length ? DEPTH : null) + weighted(gaveK.map(kv), PICK_DEPTH);
      return { vin, vout, score: (vin - vout) / (Math.abs(vin) + Math.abs(vout) + 2) };
    };
    const neutral = judge('retool');
    const own = strategy === 'retool' ? neutral : judge(strategy);
    // mostly the value, some of it the fit: a columnist grades the deal, then the plan
    // a deal where one side sends nothing back is about roster space or money as much as value: graded gentler
    const oneWay = (!gotP.length && !gotK.length) || (!gaveP.length && !gaveK.length);
    const score = Math.max(-1, Math.min(1, (oneWay ? 0.6 : 1.1) * (0.65 * neutral.score + 0.35 * own.score)));
    const valueIn = own.vin;
    const valueOut = own.vout;
    const pv = (p: Player) => tradeValue(league, p, strategy);
    const kv = (dp: DraftPick) => pickValue(league, dp) * PICK_LENS[strategy];
    const sal = (ps: Player[]) => ps.reduce((s, p) => s + salaryFor(p, cs), 0);
    const byValue = (ps: Player[]) => [...ps].sort((x, y) => pv(y) - pv(x) || x.pid - y.pid);
    const picks = (ks: DraftPick[]) => [...ks].sort((x, y) => kv(y) - kv(x) || x.dpid - y.dpid);
    return {
      tid: me.tid,
      grade: gradeFor(score),
      valueIn,
      valueOut,
      score,
      got: { players: byValue(gotP), picks: picks(gotK) },
      gave: { players: byValue(gaveP), picks: picks(gaveK) },
      salaryIn: sal(gotP),
      salaryOut: sal(gaveP),
    };
  };
  if (!playersSent(league, a).length && !playersSent(league, b).length && !a.picks.length && !b.picks.length) return null;
  return [side(a, b), side(b, a)];
}

/** "Mikal Bridges (78, 29)", "a 2028 1st". */
function assetText(league: League, x: { players: Player[]; picks: DraftPick[] }, n = 2): string {
  const ps = x.players.slice(0, n).map((p) => `${last(league, p)} (${p.ovr} OVR, ${playerAge(p, league.season)})`);
  const firsts = x.picks.filter((d) => d.round === 1).length;
  const seconds = x.picks.length - firsts;
  const picks = [firsts ? (firsts === 1 ? 'a first' : `${firsts} firsts`) : '', seconds ? (seconds === 1 ? 'a second' : `${seconds} seconds`) : ''].filter(Boolean);
  const all = [...ps, ...picks];
  return all.length > 1 ? `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}` : (all[0] ?? 'nothing');
}

/** Why a side got its grade, in a sentence or two grounded in what moved, its strategy and its money. */
export function gradeReason(league: League, g: SideGrade, pick: (opts: string[]) => string): string {
  const t = league.teams[g.tid];
  const got = assetText(league, g.got);
  const gave = assetText(league, g.gave);
  const best = g.got.players[0];
  const age = best ? playerAge(best, league.season) : 0;
  const A = g.grade.startsWith('A');
  const B = g.grade.startsWith('B');
  const C = g.grade.startsWith('C');
  const none = (x: { players: Player[]; picks: DraftPick[] }) => !x.players.length && !x.picks.length;
  const lead = none(g.got)
    ? pick([`${gave} goes out, and nothing comes back.`, `They moved ${gave} for nothing in return.`])
    : none(g.gave)
      ? pick([`${got}, for nothing.`, `They added ${got} without giving up a thing.`])
      : A
        ? pick([`${got} for ${gave} is a win.`, `They got the better of it: ${got}, and all it cost was ${gave}.`, `Strong work: ${got} for ${gave}.`])
        : B
          ? pick([`Fair value: ${got} for ${gave}.`, `${got} for ${gave} is a reasonable price.`, `A sensible deal: ${got} in, ${gave} out.`])
          : C
            ? pick([`${gave} for ${got} is a lot to give.`, `Hard to love it: ${gave} out for ${got}.`, `A shrug: ${got} for ${gave}.`])
            : pick([`${gave} for ${got}? They gave up too much.`, `This one hurts: ${gave} out, and only ${got} back.`, `Hard to see what they saw: ${gave} for ${got}.`]);
  const why: string[] = [];
  if (t.strategy === 'contend' && best && best.ovr >= 76 && age >= 29) why.push(`a win-now move for a contender`);
  else if (t.strategy === 'rebuild' && (g.got.picks.length > 0 || (best && age <= 23))) why.push(`it fits the rebuild`);
  else if (t.strategy === 'rebuild' && best && age >= 30) why.push(`a ${age}-year-old is an odd buy for a rebuilding team`);
  else if (t.strategy === 'contend' && g.gave.players[0] && g.gave.players[0].ovr >= 76 && (!best || best.ovr < g.gave.players[0].ovr - 4))
    why.push(`a contender getting weaker this season`);
  const dSal = g.salaryIn - g.salaryOut;
  if (dSal <= -5000) why.push(`it clears ${money(-dSal)} off this season's books`);
  else if (dSal >= 5000) why.push(`it adds ${money(dSal)} to the payroll`);
  if (!why.length) return lead;
  return `${lead} ${why[0].charAt(0).toUpperCase()}${why[0].slice(1)}${why[1] ? `, and ${why[1]}` : ''}.`;
}
