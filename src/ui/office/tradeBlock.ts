// "Trading block": for one of the user's players, find the best package each AI team
// would actually accept. Same idea as aiProposeToUser in core/league/trades.ts, but
// exhaustive across teams, including draft picks, and verified with evaluateTrade.
import type { League } from '../../core/types';
import { rosterMaxNow, standardRoster } from '../../core/league/helpers';
import { tradeValue } from '../../core/league/contracts';
import { MAX_FIRSTS_OUT, PICK_LENS, capSalary, evaluateTrade, pickValue, pickValueFor, playerValueFor, untradeableReason, type TradeOffer } from '../../core/league/trades';

export interface BlockOffer {
  tid: number;
  offer: TradeOffer;
  /** Value of the package to the user's team (its strategy). */
  myValue: number;
  /** Value of the user's player to the user's team. */
  targetValue: number;
}

interface Asset {
  kind: 'p' | 'd';
  id: number;
  ai: number; // value to the AI team
  mine: number; // value to the user
  sal: number;
}

function toOffer(user: number, give: number[], tid: number, pkg: Asset[]): TradeOffer {
  return {
    a: { tid: user, pids: give, dpids: [] },
    b: { tid, pids: pkg.filter((x) => x.kind === 'p').map((x) => x.id), dpids: pkg.filter((x) => x.kind === 'd').map((x) => x.id) },
  };
}

export function blockOffers(league: League, pid: number): BlockOffer[] {
  const user = league.userTid;
  const me = league.teams[user];
  const target = league.players[pid];
  if (!target || target.tid !== user) return [];
  const targetValue = tradeValue(league, target, me.strategy);
  const gen = league.settings.difficulty === 'casual' ? 0.88 : league.settings.difficulty === 'hard' ? 1.12 : 1;
  const userCount = standardRoster(league, user).length;
  const max = rosterMaxNow(league);
  const out: BlockOffer[] = [];

  for (const t of league.teams) {
    if (t.tid === user) continue;
    const want = playerValueFor(league, target, t.tid, true);
    const budget = want / gen;
    // players they can actually move (no expiring deals after the season, two-ways stay put)
    const roster = standardRoster(league, t.tid).filter((p) => !untradeableReason(league, p));
    // the AI must stay within the roster limit after taking our player
    const minPlayersOut = standardRoster(league, t.tid).length + 1 > max ? standardRoster(league, t.tid).length + 1 - max : 0;
    // and so must we
    const maxPlayersIn = Math.min(3, max - userCount + 1);
    if (maxPlayersIn < minPlayersOut) continue;
    const player = (pid: number): Asset => ({ kind: 'p', id: pid, ai: playerValueFor(league, league.players[pid], t.tid, false), mine: tradeValue(league, league.players[pid], me.strategy), sal: capSalary(league, pid) });
    const assets: Asset[] = [
      ...roster.map((p) => player(p.pid)),
      ...league.draftPicks
        .filter((d) => d.tid === t.tid)
        .map((d) => ({ kind: 'd' as const, id: d.dpid, ai: pickValueFor(league, d, t.tid, false), mine: pickValue(league, d) * PICK_LENS[me.strategy], sal: 0 })),
    ]
      // ignore throw-ins worth almost nothing
      .filter((a) => a.mine >= targetValue * 0.06)
      .sort((x, y) => y.mine - x.mine);

    const greedy = (skip: Set<number>, cap = budget): Asset[] => {
      const pkg: Asset[] = [];
      let sum = 0;
      let np = 0;
      let nd = 0;
      for (let i = 0; i < assets.length; i++) {
        if (skip.has(i)) continue;
        const a = assets[i];
        if (a.kind === 'p' && np >= maxPlayersIn) continue;
        if (a.kind === 'd' && nd >= MAX_FIRSTS_OUT) continue;
        if (sum + a.ai > cap) continue;
        pkg.push(a);
        sum += a.ai;
        if (a.kind === 'p') np++;
        else nd++;
      }
      return pkg;
    };

    // salary fillers: low-value contracts the AI is happy to send to make the money work
    const fillers = roster
      .map((p) => player(p.pid))
      .filter((a) => a.sal > 0)
      .sort((x, y) => x.ai / x.sal - y.ai / y.sal);

    let best: { pkg: Asset[]; mine: number } | null = null;
    const consider = (pkg: Asset[]) => {
      const nPlayers = pkg.filter((a) => a.kind === 'p').length;
      if (!pkg.length || nPlayers < minPlayersOut || nPlayers > maxPlayersIn) return;
      const ev = evaluateTrade(league, toOffer(user, [pid], t.tid, pkg));
      if (!ev.accept) return;
      const mine = pkg.reduce((a, x) => a + x.mine, 0);
      if (!best || mine > best.mine) best = { pkg, mine };
    };
    const variants: Set<number>[] = [new Set(), new Set([0]), new Set([1]), new Set([0, 1]), new Set([2])];
    for (const skip of variants) {
      const pkg = greedy(skip);
      consider(pkg);
      // add a salary filler or two if matching fails
      let withFill = [...pkg];
      for (let k = 0; k < 2; k++) {
        const used = new Set(withFill.map((a) => a.id));
        const used_ai = withFill.reduce((a, x) => a + x.ai, 0);
        const f = fillers.find((x) => !used.has(x.id) && used_ai + x.ai <= budget);
        if (!f || withFill.filter((a) => a.kind === 'p').length >= maxPlayersIn) break;
        withFill = [...withFill, f];
        consider(withFill);
      }
    }
    const b = best as { pkg: Asset[]; mine: number } | null;
    if (b) out.push({ tid: t.tid, offer: toOffer(user, [pid], t.tid, b.pkg), myValue: b.mine, targetValue });
  }
  return out.sort((x, y) => y.myValue - x.myValue);
}
