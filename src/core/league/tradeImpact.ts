// What a deal does to the user's team, for the last look before it's made (the trade's confirm
// sheet): the rotation his staff would play with it against the one he has (who starts, who loses
// minutes), the need it fills and the one it opens (the roster qualities the playbooks' fits read,
// best eight before and after), and the future he gives up (firsts and seconds, swap rights, and
// young players with room to grow). Words and plain minutes only: no value figures.
import type { League, Player, Rotation } from '../types';
import type { TradeOffer } from './trades';
import { playerAge } from '../playerGen';
import { autoRotation, fitRoster, rosterProfile, type ProfileKey } from '../ai/coachAI';
import { shortName, teamPlayers } from './helpers';
import { keepManualRotation } from './games';
import { needCache, needMove, teamNeed, type NeedMove } from './rosterNeed';
import { normalizeMinutes, planInputs, planRoles } from '../sim/rotationPlan';

/** A player whose role the deal changes: minutes a game now and with it, and whether he starts each way. */
export interface RotationMove {
  pid: number;
  name: string;
  from: number;
  to: number;
  startsNow: boolean;
  startsWith: boolean;
  /** Joining (in the deal) or leaving (sent away). */
  dealt?: 'in' | 'out';
}

export interface TradeImpact {
  moves: RotationMove[];
  /** The quality the deal adds most of, and the one it costs most (best eight), in words; null when it moves none by much. */
  adds: string | null;
  costs: string | null;
  /** What he gives up for later, in words: picks, swap rights, young players. */
  future: string[];
  /**
   * Read for his own rotation (he set it): the deal keeps his order and minutes, the players coming
   * in go to the end of his depth chart with no minutes set, until he places them.
   */
  manual: boolean;
  /** The roster's need (Team → Tactics's weakest quality) as the deal moves it, when he has one. */
  need?: NeedMove;
}

/** The minutes a rotation actually plays for these players (the engine's plan: unset starters get a starter's share, the total scaled to 240). */
function planned(rot: Rotation, players: Player[]): Record<number, number> {
  const order = new Map(rot.order.map((pid, i) => [pid, i]));
  const roster = [...players].sort((a, b) => (order.get(a.pid) ?? 99) - (order.get(b.pid) ?? 99));
  const pp = planInputs(
    roster.map((p) => ({ pid: p.pid, available: !(p.injury && p.injury.gamesRemaining > 0), ...planRoles(p.ratings, p.pos), endurance: p.ratings.end })),
    rot,
  );
  const mins = normalizeMinutes(pp);
  return Object.fromEntries(pp.map((p, i) => [p.pid, mins[i]]));
}

/** Each roster quality in a few words, as the deal moves it. */
const QUALITY: Record<ProfileKey, string> = {
  starCreator: 'a lead creator',
  creatorGap: 'a clear first option',
  shooting: 'shooting',
  passing: 'passing',
  bigPassing: 'a passing big',
  postScoring: 'post scoring',
  rimProtection: 'rim protection',
  athleticism: 'speed and athleticism',
  size: 'size',
  perimeterD: 'perimeter defense',
  depth: 'depth',
  steals: 'quick hands',
  bigMobility: 'a mobile big',
};

/** A quality moved this much (its own scale, ratings-like) reads as the need the deal is about. */
const QUALITY_MIN = 2;

/** A young player with room to grow: what he is to the future, not tonight. */
const YOUNG = 24;

const healthy = (ps: Player[]) => ps.filter((p) => !(p.injury && p.injury.gamesRemaining > 0));

/** The user's side of the deal is `a` (the trade screen's), else `b`. */
const sides = (league: League, offer: TradeOffer) => (offer.a.tid === league.userTid ? { mine: offer.a, theirs: offer.b } : { mine: offer.b, theirs: offer.a });

export function tradeImpact(league: League, offer: TradeOffer): TradeImpact {
  const { mine, theirs } = sides(league, offer);
  const team = league.teams[league.userTid];
  const before = teamPlayers(league, league.userTid);
  const out = new Set(mine.pids);
  const inc = theirs.pids.map((pid) => league.players[pid]).filter(Boolean);
  const after = [...before.filter((p) => !out.has(p.pid)), ...inc];
  // the rotation he has against the one he'd have after the deal, as the game will run it: his own
  // when he set it (ensureRotation keeps it: new players at the end, no minutes), else his staff's
  // both ways, so only the deal moves anyone
  const manual = !!team.rotation.manual;
  let now: Rotation;
  let next: Rotation;
  if (manual) {
    const kept = structuredClone(team.rotation);
    keepManualRotation(kept, after);
    now = { ...team.rotation, minutes: planned(team.rotation, before) };
    next = { ...kept, minutes: planned(kept, after) };
  } else {
    now = autoRotation(healthy(before), team.rotation);
    next = autoRotation(healthy(after), team.rotation);
  }
  const starts = (r: Rotation, pid: number) => r.order.slice(0, 5).includes(pid);
  const all = [...before, ...inc];
  const moves = all
    .map((p): RotationMove => {
      const dealt = out.has(p.pid) ? 'out' : inc.includes(p) ? 'in' : undefined;
      return {
        pid: p.pid,
        name: shortName(league, p),
        from: dealt === 'in' ? 0 : Math.round(now.minutes[p.pid] ?? 0),
        to: dealt === 'out' ? 0 : Math.round(next.minutes[p.pid] ?? 0),
        startsNow: dealt !== 'in' && starts(now, p.pid),
        startsWith: dealt !== 'out' && starts(next, p.pid),
        ...(dealt && { dealt }),
      };
    })
    // (anyone dealt who plays, anyone whose start changes, anyone whose minutes move 4 or more)
    .filter((m) => (m.dealt && (m.from > 0 || m.to > 0)) || m.startsNow !== m.startsWith || Math.abs(m.to - m.from) >= 4)
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from) || a.pid - b.pid);
  // the need: the best eight's qualities before and after
  const pb = rosterProfile(fitRoster(before));
  const pa = rosterProfile(fitRoster(after));
  const keys = Object.keys(QUALITY) as ProfileKey[];
  const diffs = keys.map((k) => ({ k, d: pa[k] - pb[k] })).sort((x, y) => y.d - x.d);
  const top = diffs[0];
  const low = diffs[diffs.length - 1];
  const cache = needCache(league);
  const named = teamNeed(league, cache);
  const need = named ? needMove(league, named.id, theirs.pids, mine.pids, cache) : undefined;
  const future: string[] = [];
  for (const dpid of mine.dpids) {
    const dp = league.draftPicks.find((x) => x.dpid === dpid);
    if (!dp) continue;
    const prot = mine.protect?.[dpid];
    const own = dp.originalTid === league.userTid ? 'Your' : `The ${league.teams[dp.originalTid]?.abbrev ?? ''}`;
    future.push(`${own} ${dp.season} ${dp.round === 1 ? 'first' : 'second'}${prot ? `, top-${prot} protected` : ''}`);
  }
  for (const y of mine.swaps ?? []) future.push(`The right to swap firsts in ${y}`);
  for (const pid of mine.pids) {
    const p = league.players[pid];
    if (p && playerAge(p, league.season) <= YOUNG && p.pot > p.ovr + 2) future.push(`${shortName(league, p)}, ${playerAge(p, league.season)}, still growing`);
  }
  return {
    moves,
    adds: top && top.d >= QUALITY_MIN ? QUALITY[top.k] : null,
    costs: low && low.d <= -QUALITY_MIN ? QUALITY[low.k] : null,
    future,
    manual,
    ...(need && { need }),
  };
}

/** Whether the deal changes who starts for the user (a reason to look at it once more before it's made). */
export const changesStarters = (impact: TradeImpact) => impact.moves.some((m) => m.startsNow !== m.startsWith);
