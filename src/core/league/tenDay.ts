// 10-day contracts and the hardship exception. From January 5 to the end of the regular season a
// team can sign a free agent who'd take the minimum to a 10-day contract: his minimum prorated for
// the days it runs, paid when he signs (the per-game payroll leaves him out, see gameFinances),
// holding a standard roster spot, and ending by itself after ten days (with the regular season, if
// that comes first), when he is a free agent again with no dead money. A team can give a player two
// in a season: after the second, a deal for the rest of the season (or longer) or he leaves. A team
// with four or more players out injured, each with three or more games to go, may carry 10-day
// players beyond 15, one for each player out past three (the hardship exception); they leave when
// their ten days are up, and a second one needs the team still that short or a regular spot. AI
// teams sign 10-days only to get back to 13 healthy players, and never sign one for longer.
//
// Simplified: pay is prorated over the regular season's days rather than the NBA's 174; a 10-day
// player can't be traded (his signing's trade lock runs past the deadline); and a team that a 10-day
// contract ending leaves under 13 signs the best free agent who'd take the minimum, for the rest of
// the season, at once (for the user, his Assistant GM does).

import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';
import { CAP } from '../constants';
import { CAP_FOR, addInbox, curTeamSeason, dateToDay, fmtDate, freeAgents, playerName, standardRoster } from './helpers';
import { hashString } from '../random';
import { FIRED_REASON, askingContract, releasePlayer, releasedBy, signPlayer, valueScore } from './contracts';
import { logMove } from './transactions';
import { moneyExact } from '../format';

/** Days a 10-day contract runs. */
export const TEN_DAYS = 10;
/** 10-day contracts one team can give a player in a season. */
export const TEN_DAY_MAX = 2;
/** Players out (each with HARDSHIP_GAMES or more games to go) from which the hardship exception opens spots beyond 15: one for each past three. */
export const HARDSHIP_OUT = 4;
export const HARDSHIP_GAMES = 3;

/** Season day of January 5, when 10-day contracts open. */
export const tenDayOpenDay = (league: League) => dateToDay(league.season, 0, 5);

/** Why no team can sign a 10-day contract today, or null. */
export function tenDayClosedReason(league: League): string | null {
  if (league.phase === 'regular' && league.day < tenDayOpenDay(league)) return '10-day contracts open on January 5.';
  if (league.phase !== 'regular' || league.day > league.regularSeasonDays) return '10-day contracts are signed from January 5 to the end of the regular season.';
  return null;
}

/** The hardship exception for a team now: players out with 3+ games to go, the spots beyond 15 that gives (players out past three, from four out), and the hardship 10-day players it carries. */
export function hardship(league: League, tid: number): { out: number; spots: number; used: number } {
  const roster = standardRoster(league, tid);
  const out = roster.filter((p) => (p.injury?.gamesRemaining ?? 0) >= HARDSHIP_GAMES).length;
  return { out, spots: out >= HARDSHIP_OUT ? out - (HARDSHIP_OUT - 1) : 0, used: roster.filter((p) => p.contract.tenDay?.hardship).length };
}

/** The roster spot a 10-day signing would take (not counting `exceptPid`, a player renewing his): a regular one under 15, a hardship one beyond, or none. */
export function tenDaySpot(league: League, tid: number, exceptPid = -1): 'regular' | 'hardship' | null {
  const n = standardRoster(league, tid).filter((p) => p.pid !== exceptPid).length;
  if (n < CAP.rosterMax) return 'regular';
  return n < CAP.rosterMax + hardship(league, tid).spots ? 'hardship' : null;
}

/** 10-day contracts he has signed with team `tid` this season (each team's are counted on their own: a stint elsewhere doesn't reset them). */
export const tenDaysWith = (league: League, p: Player, tid: number) => (p.tenDays?.season === league.season ? (p.tenDays.by[tid] ?? 0) : 0);

/** His minimum this season: the veteran minimum after three seasons. */
const minFor = (league: League, p: Player) => (p.experience >= 3 ? CAP_FOR(league).vetMin : CAP_FOR(league).minContract);

/** A free agent (not on waivers, not restricted) who'd sign for the minimum would take a 10-day contract: his asking price is a minimum. */
export function wantsTenDay(league: League, p: Player, tid?: number): boolean {
  return p.tid === FREE_AGENT && !p.waivers && !p.rfa && askingContract(league, p, tid).amount <= CAP_FOR(league).vetMin + 1;
}

/** The days a 10-day contract signed now (or, `from`, renewed when the current one ends) runs: ten, or to the end of the regular season. */
export const tenDayUntil = (league: League, from = league.day) => Math.min(from + TEN_DAYS, league.regularSeasonDays + 1);

/** A 10-day contract's pay: his minimum prorated for its days over the regular season's (at least $10K). */
export function tenDayPay(league: League, p: Player, days: number): number {
  return Math.max(10, Math.round((minFor(league, p) * days) / (league.regularSeasonDays + 1) / 10) * 10);
}

/** Days left on his 10-day contract, today included. */
export const tenDayLeft = (league: League, p: Player) => (p.contract.tenDay ? p.contract.tenDay.until - league.day : 0);

/** The last day of his 10-day contract, as a date ("Jan 14"). */
export const tenDayEnds = (league: League, until: number) => fmtDate(league.season, until - 1);

/**
 * Why team `tid` can't sign him to a 10-day contract now, or null: the window, a free agent who'd
 * take the minimum (or a player on his first 10-day with the team, renewing it from when it ends),
 * two at most with one team a season, and a regular or hardship roster spot.
 */
export function tenDayBlockedReason(league: League, tid: number, p: Player): string | null {
  const closed = tenDayClosedReason(league);
  if (closed) return closed;
  if (tid === league.userTid && league.fired) return FIRED_REASON;
  const name = playerName(p);
  const cur = p.tid === tid ? p.contract.tenDay : undefined;
  if (!cur) {
    if (p.tid >= 0) return p.tid === tid ? `${name} is on a standard contract.` : `${name} isn't a free agent.`;
    if (p.waivers) return `${name} is on waivers: put in a claim instead.`;
    if (releasedBy(league, p, tid)) return `${tid === league.userTid ? 'You' : 'They'} released ${name} this season: no new deal with him until next season.`;
    if (p.rfa || !wantsTenDay(league, p, tid)) return `${name} wants a standard contract. He asks ${moneyExact(askingContract(league, p, tid).amount)}.`;
  }
  if (tenDaysWith(league, p, tid) >= TEN_DAY_MAX)
    return `${name} has had his two 10-days with ${tid === league.userTid ? 'you' : 'them'} this season. Next is the rest of the season, or he leaves.`;
  if (cur && cur.until > league.regularSeasonDays) return 'His 10-day contract already runs to the end of the regular season.';
  if (!tenDaySpot(league, tid, cur ? p.pid : -1)) {
    const h = hardship(league, tid);
    return `No roster spot: ${CAP.rosterMax} players${h.spots ? ` and ${h.used} on hardship 10-days` : ''}. ${
      h.out >= HARDSHIP_OUT
        ? `The hardship exception allows ${h.spots} beyond ${CAP.rosterMax} with ${h.out} players out.`
        : `Hardship spots past ${CAP.rosterMax} open with ${HARDSHIP_OUT} players out 3+ games. ${h.out} now.`
    }`;
  }
  return null;
}

/** A 10-day contract is paid when it's signed. */
function payTenDay(league: League, tid: number, pay: number) {
  curTeamSeason(league, tid).expenses += pay;
  league.teams[tid].cash -= pay;
}

/**
 * Team `tid` signs him to a 10-day contract (tenDayBlockedReason has passed): a new one, or for a
 * player on his first with the team, a second from the day it ends (its pay is added to the
 * contract's salary, as both count on the cap). Logged for the user's team only, like other
 * roster filler.
 */
function signTenDay(league: League, p: Player, tid: number) {
  const cur = p.tid === tid ? p.contract.tenDay : undefined;
  const spot = tenDaySpot(league, tid, cur ? p.pid : -1)!;
  const from = cur ? cur.until : league.day;
  const until = tenDayUntil(league, from);
  const pay = tenDayPay(league, p, until - from);
  const n = tenDaysWith(league, p, tid) + 1;
  if (cur) {
    p.contract.salaries[0] += pay;
    cur.until = until;
    if (spot === 'hardship') cur.hardship = true;
    else delete cur.hardship;
  } else signPlayer(league, p, tid, pay, 1, { news: false, log: false, tenDay: { until, ...(spot === 'hardship' ? { hardship: true } : {}) } });
  p.tenDays = { season: league.season, by: { ...(p.tenDays?.season === league.season ? p.tenDays.by : {}), [tid]: n } };
  payTenDay(league, tid, pay);
  if (tid === league.userTid) logMove(league, 'tenDay', tid, p, { amount: pay, note: n >= 2 ? 'second' : spot === 'hardship' ? 'hardship' : undefined });
}

/** His 10-day contract ends: a free agent again, with no dead money (it was paid when he signed). */
function endTenDay(league: League, p: Player) {
  const tid = p.tid;
  releasePlayer(league, p, { news: false, log: false, ended: true });
  if (tid === league.userTid) logMove(league, 'tenDay', tid, p, { note: 'ended' });
}

/** The user signs a free agent to a 10-day contract, or his player on his first 10-day to a second. */
export function userTenDay(league: League, pid: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (!p) return { ok: false, reason: 'Player not found.' };
  const why = tenDayBlockedReason(league, league.userTid, p);
  if (why) return { ok: false, reason: why };
  signTenDay(league, p, league.userTid);
  const c = p.contract.tenDay!;
  const second = tenDaysWith(league, p, league.userTid) >= 2;
  return {
    ok: true,
    reason: `${playerName(p)} signs ${second ? 'a second' : 'a'} 10-day contract${c.hardship ? ' (hardship)' : ''}: through ${tenDayEnds(league, c.until)}.`,
  };
}

/** Why the user can't sign his 10-day player for the rest of the season (or longer) now, or null: it takes a regular roster spot. */
export function tenDayRestBlockedReason(league: League, p: Player): string | null {
  if (league.fired) return FIRED_REASON;
  if (p.tid !== league.userTid || !p.contract.tenDay) return `${playerName(p)} isn't on a 10-day contract with you.`;
  if (league.phase !== 'regular') return 'The regular season is over.';
  const roster = standardRoster(league, p.tid);
  const hardshipOthers = roster.filter((x) => x.pid !== p.pid && x.contract.tenDay?.hardship).length;
  if (roster.length - hardshipOthers > CAP.rosterMax) return `He's on a hardship 10-day and your ${CAP.rosterMax} spots are taken. Release someone to give him a regular one.`;
  return null;
}

/**
 * The user signs his 10-day player for the rest of the season (`years` 2: through next season too)
 * at his minimum: a standard contract from today, paid game by game like any in-season signing.
 */
export function userTenDayRest(league: League, pid: number, years = 1): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (!p) return { ok: false, reason: 'Player not found.' };
  const why = tenDayRestBlockedReason(league, p);
  if (why) return { ok: false, reason: why };
  const amount = minFor(league, p);
  signPlayer(league, p, p.tid, amount, years, { news: false, log: false });
  logMove(league, 'sign', p.tid, p, { amount: p.contract.salaries[0], years });
  return { ok: true, reason: `${playerName(p)} signs ${years > 1 ? 'through next season' : 'for the rest of the season'} at the minimum.` };
}

/** Why the user can't let his 10-day player go now, or null: in season the roster can't drop under 13. */
export function tenDayEndBlockedReason(league: League, p: Player): string | null {
  if (league.fired) return FIRED_REASON;
  if (p.tid !== league.userTid || !p.contract.tenDay) return `${playerName(p)} isn't on a 10-day contract with you.`;
  return standardRoster(league, p.tid).length <= CAP.rosterMin ? `Rosters need at least ${CAP.rosterMin} players during the season. Sign a replacement first.` : null;
}

/** The user lets his 10-day player go now: a free agent again, no dead money. */
export function userEndTenDay(league: League, pid: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (!p) return { ok: false, reason: 'Player not found.' };
  const why = tenDayEndBlockedReason(league, p);
  if (why) return { ok: false, reason: why };
  endTenDay(league, p);
  return { ok: true, reason: `${playerName(p)}'s 10-day contract is over: he's a free agent.` };
}

/** Free agents who'd take a 10-day from an AI team, best first: healthy, would sign for the minimum. */
const tenDayPool = (league: League) =>
  freeAgents(league)
    .filter((p) => !p.injury && !p.rfa && askingContract(league, p).amount <= CAP_FOR(league).vetMin + 1)
    .sort((a, b) => valueScore(league, b) - valueScore(league, a) || a.pid - b.pid);

/**
 * A team a 10-day contract ending left under 13 signs the best healthy free agent who'd take the
 * minimum (when none would, the best of the rest worth under 76: a better player holds out for real
 * money) for the rest of the season, at his minimum, never one it released this season. The user
 * hears from his Assistant GM.
 */
function fillAfterTenDay(league: League, tid: number, left: string) {
  while (standardRoster(league, tid).length < CAP.rosterMin) {
    const healthy = freeAgents(league).filter((x) => !x.injury && !x.rfa && !releasedBy(league, x, tid) && valueScore(league, x) < 76);
    const willing = tenDayPool(league).filter((x) => !releasedBy(league, x, tid));
    const p = willing[0] ?? healthy.sort((a, b) => valueScore(league, b) - valueScore(league, a) || a.pid - b.pid)[0];
    if (!p) return;
    signPlayer(league, p, tid, minFor(league, p), 1, { news: false, log: tid === league.userTid });
    if (tid === league.userTid)
      addInbox(league, {
        from: 'Assistant GM',
        subject: `${playerName(p)} signed to fill the roster`,
        body: `${left}'s 10-day contract ended and left us under the league's ${CAP.rosterMin}-man minimum. We signed ${playerName(p)}, ${p.ovr} OVR, for the rest of the season at the minimum, ${moneyExact(p.contract.salaries[0])}.`,
        tone: 'neutral',
        link: `/player/${p.pid}`,
      });
  }
}

/**
 * AI teams short of 13 healthy players sign the best free agents who'd take the minimum to 10-day
 * contracts (into an open spot, or a hardship one beyond 15), until they're back to 13 or out of
 * spots. They never renew one: a player can come back for a second when he's still the best left.
 * From March a rebuilder with an open spot takes a look at a young prospect (24 or younger, potential
 * 66+) on a 10-day, about once a week.
 */
function aiTenDays(league: League) {
  if (tenDayClosedReason(league)) return;
  let pool: Player[] | null = null;
  const march = league.day >= dateToDay(league.season, 2, 1);
  for (const t of league.teams) {
    if (t.tid === league.userTid) continue;
    let healthy = standardRoster(league, t.tid).filter((p) => !p.injury).length;
    while (healthy < CAP.rosterMin && tenDaySpot(league, t.tid)) {
      pool ??= tenDayPool(league);
      const i = pool.findIndex((p) => p.tid === FREE_AGENT && tenDaysWith(league, p, t.tid) < TEN_DAY_MAX && !releasedBy(league, p, t.tid));
      if (i < 0) break;
      const [p] = pool.splice(i, 1);
      signTenDay(league, p, t.tid);
      healthy++;
    }
    if (march && t.strategy === 'rebuild' && tenDaySpot(league, t.tid) === 'regular' && !standardRoster(league, t.tid).some((p) => p.contract.tenDay)) {
      if (hashString(`${league.id}:${league.season}:${league.day}:look:${t.tid}`) % 7 !== 0) continue;
      pool ??= tenDayPool(league);
      const i = pool.findIndex(
        (p) => p.tid === FREE_AGENT && league.season - p.bornYear <= 24 && p.pot >= 66 && tenDaysWith(league, p, t.tid) < TEN_DAY_MAX && !releasedBy(league, p, t.tid),
      );
      if (i < 0) continue;
      const [p] = pool.splice(i, 1);
      signTenDay(league, p, t.tid);
    }
  }
}

/**
 * A new day of the season: 10-day contracts whose days are up end (a team left under 13 fills its
 * roster, see fillAfterTenDay), the user hears on his player's last day that it ends after the day's
 * games, and AI teams short of 13 healthy players sign 10-days.
 */
export function tenDayDaily(league: League) {
  if (league.phase !== 'regular' && league.phase !== 'playin' && league.phase !== 'playoffs') return;
  const user = league.userTid;
  const short = new Map<number, string>();
  for (const p of Object.values(league.players)) {
    const td = p.contract.tenDay;
    if (!td || p.tid < 0) continue;
    if (league.day >= td.until) {
      const tid = p.tid;
      endTenDay(league, p);
      if (standardRoster(league, tid).length < CAP.rosterMin) short.set(tid, playerName(p));
    } else if (league.day === td.until - 1 && p.tid === user && !league.fired) tenDayNotice(league, p);
  }
  for (const [tid, name] of short) fillAfterTenDay(league, tid, name);
  aiTenDays(league);
}

/** The user's player starts the last day of his 10-day contract: what he can do about it, from the inbox. */
function tenDayNotice(league: League, p: Player) {
  const name = playerName(p);
  const n = tenDaysWith(league, p, league.userTid);
  const again = !tenDayBlockedReason(league, league.userTid, p);
  const rest = tenDayRestBlockedReason(league, p);
  const left = tenDayEndBlockedReason(league, p);
  const lines = [
    `${name}'s ${n >= 2 ? 'second' : 'first'} 10-day contract with us ends after today's games.`,
    n >= 2
      ? `That's his second 10-day with us. Sign him for the rest of the season at his minimum, ${moneyExact(minFor(league, p))}, or he's a free agent tomorrow.`
      : `Sign him to a second 10-day${again ? `, ${moneyExact(tenDayPay(league, p, tenDayUntil(league, p.contract.tenDay!.until) - p.contract.tenDay!.until))} through ${tenDayEnds(league, tenDayUntil(league, p.contract.tenDay!.until))},` : ''} or for the rest of the season at ${moneyExact(minFor(league, p))}. Doing nothing lets him go tomorrow, with no dead money.`,
    p.contract.tenDay?.hardship && !again && n < 2 ? 'The hardship exception no longer covers him. A second 10-day needs a regular roster spot.' : '',
    rest ?? '',
    left ? `Letting him go leaves us under ${CAP.rosterMin}. The staff would sign the best free agent left, for the season.` : '',
  ];
  addInbox(league, {
    from: 'Assistant GM',
    subject: `${name}'s 10-day contract ends tonight`,
    body: lines.filter(Boolean).join('\n'),
    tone: 'alert',
    link: `/player/${p.pid}`,
    tenDay: p.pid,
  });
}
