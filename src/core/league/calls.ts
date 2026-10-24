// The staff's calls: the moments in a season that need the user's answer, each a Needs-you card on
// Today with the staff's call one tap away (see agenda.ts for how cards are drawn and settled). A
// star goes down for ten games or more (the call: a 10-day for cover, or the staff's rotation); the
// playoff odds collapse under 5% for a team the owner expects in the postseason (the call: tell him
// it's a rebuild, before the deadline); the deadline's last five days (the call: the staff's best
// deal, buying or selling as the odds say, or standing pat); and the books in the red (the call: the
// budgets down to the league standard). A long sim stops the day a new one opens (see runSim), and
// for nothing else that doesn't need an answer. A card is settled by its call or a choice; it is
// remembered (League.callsDone) so it doesn't come back. Nothing here draws from the league's
// random stream.
import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';
import { playerName, standardRoster } from './helpers';
import { money, plural } from '../format';
import { currentGoals, concedeBlockedReason, concedeSeason, CONCEDE_COST } from './ownerGoals';
import { tenDayBlockedReason, tenDayClosedReason, userTenDay, wantsTenDay } from './tenDay';
import { booksOf, FROZEN_BUDGET, RED_FREEZE } from './books';
import { budgetCostPerSeason } from './finances';
import { tradeTargets } from './tradeFinder';
import { makeItWork } from './tradeHelp';
import { packageFor } from './tradePackages';
import { executeTrade, teamAccepts, validateTrade, type TradeOffer } from './trades';
import { tradeValue } from './contracts';
import { assetText, cleanProposals } from './proposals';
import { ensureRotation } from './games';
import { playerAge } from '../playerGen';

/** A star: one of the team's three best players by OVR. */
export const STAR_RANK = 3;
/** Games out that make a star's injury a call. */
export const STAR_OUT = 10;
/** The playoff odds (tenths of a percent, as League.oddsTrail keeps them) under which the season is a call. */
export const ODDS_LOW = 50;
/** ...for a team the owner expects in the postseason, or that was at least this likely to get there this season. */
export const ODDS_WAS = 250;
/** Days before the deadline its call opens (and a long sim stops). */
export const DEADLINE_DAYS = 5;
/** Settled calls kept, newest last. */
const DONE_KEPT = 60;

export type CallKind = 'injury' | 'odds' | 'deadline' | 'books';

/** The staff's deadline call, worked out once when its card opens (League.deadlineCall). */
export interface DeadlineCall {
  season: number;
  mode: 'buy' | 'sell' | 'hold';
  /** The deal the staff would make (side a the user's), if one was found that the other team takes. */
  offer?: TradeOffer;
  /** The playoff odds then, tenths of a percent. */
  odds: number;
}

const settled = (league: League, id: string) => !!league.callsDone?.includes(id);

/** Remember a call as settled. */
export function settleCall(league: League, id: string) {
  const done = (league.callsDone ?? []).filter((x) => x !== id);
  done.push(id);
  league.callsDone = done.slice(-DONE_KEPT);
}

/** The user's playoff odds as of the latest weekly point this season (tenths of a percent), and the best point before it. */
function oddsNow(league: League): { now: number; best: number } | null {
  const t = league.oddsTrail;
  if (!t || t.season !== league.season || t.tid !== league.userTid || !t.pts.length) return null;
  const now = t.pts[t.pts.length - 1][1];
  return { now, best: Math.max(...t.pts.slice(0, -1).map((p) => p[1]), 0) };
}

/** The user's stars out for STAR_OUT games or more, each with the id of his call (one per injury). */
function hurtStars(league: League): { p: Player; id: string }[] {
  const roster = standardRoster(league, league.userTid).sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
  return roster
    .slice(0, STAR_RANK)
    .filter((p) => p.injury && p.injury.gamesTotal >= STAR_OUT && p.injury.gamesRemaining > 2)
    .map((p) => ({ p, id: `injury:${p.pid}:${p.injuryCount}` }));
}

const oddsId = (league: League) => `odds:${league.season}`;
const deadlineId = (league: League) => `deadline:${league.season}`;
const booksId = (league: League) => `books:${league.books!.season}:${league.books!.day}`;

/** Whether the deadline's call is open: its last DEADLINE_DAYS days, deadline day included. */
const deadlineOpen = (league: League) => league.phase === 'regular' && league.day <= league.tradeDeadlineDay && league.tradeDeadlineDay - league.day <= DEADLINE_DAYS;

/** Whether the odds call stands: under ODDS_LOW for a team expected in the postseason, before the deadline. */
function oddsCall(league: League): { now: number } | null {
  if (league.phase !== 'regular' || league.day > league.tradeDeadlineDay) return null;
  const o = oddsNow(league);
  if (!o || o.now >= ODDS_LOW) return null;
  const expected = !!currentGoals(league)?.goals.some((g) => g.kind === 'postseason');
  return expected || o.best >= ODDS_WAS ? { now: o.now } : null;
}

/** The ids of the calls open now (cheap: what a long sim checks each day). */
export function openCallIds(league: League): string[] {
  if (league.fired) return [];
  const ids: string[] = [];
  if (league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs') for (const s of hurtStars(league)) ids.push(s.id);
  if (oddsCall(league)) ids.push(oddsId(league));
  if (deadlineOpen(league)) ids.push(deadlineId(league));
  if (booksOf(league)) ids.push(booksId(league));
  return ids.filter((id) => !settled(league, id));
}

/** The user's budgets over the league standard (what a cut would save). */
function overStandard(league: League): boolean {
  const b = league.teams[league.userTid].budget;
  return b.coaching > FROZEN_BUDGET || b.health > FROZEN_BUDGET || b.facilities > FROZEN_BUDGET;
}

// ---------------------------------------------------------------- the deadline's call

/**
 * The staff's deadline call (once a season, the day its card opens): buy with the playoffs likely
 * (the best player better than the team's fifth best that his team would move for what "make it
 * work" says, the team's two most valuable players kept), sell with them unlikely or for a rebuilder
 * (the best package a contender sends for one of the veterans, 28 or older), hold otherwise or when
 * nothing works.
 */
export function planDeadlineCall(league: League): DeadlineCall {
  const me = league.userTid;
  const odds = oddsNow(league)?.now ?? 500;
  const rebuild = league.teams[me].strategy === 'rebuild';
  const mode: DeadlineCall['mode'] = !rebuild && odds >= 500 ? 'buy' : rebuild || odds < 150 ? 'sell' : 'hold';
  const call: DeadlineCall = { season: league.season, mode, odds };
  const roster = standardRoster(league, me);
  const works = (o: TradeOffer | null) => !!o && !validateTrade(league, o).length && teamAccepts(league, o, o.b.tid);
  if (mode === 'buy') {
    const keep = [...roster]
      .sort((a, b) => tradeValue(league, b) - tradeValue(league, a))
      .slice(0, 2)
      .map((p) => p.pid);
    const bar = [...roster].sort((a, b) => b.ovr - a.ovr)[4]?.ovr ?? 0;
    const targets = tradeTargets(league)
      .filter((t) => t.p.ovr > bar && t.avail !== 'franchise' && !t.p.injury)
      .sort((a, b) => Number(b.avail === 'block') - Number(a.avail === 'block') || b.p.ovr - a.p.ovr || a.p.pid - b.p.pid)
      .slice(0, 6);
    for (const t of targets) {
      const ask = makeItWork(league, { a: { tid: me, pids: [], dpids: [] }, b: { tid: t.p.tid, pids: [t.p.pid], dpids: [] } }, keep);
      if (works(ask.offer)) {
        call.offer = ask.offer!;
        break;
      }
    }
  } else if (mode === 'sell') {
    const vets = roster
      .filter((p) => playerAge(p, league.season) >= 28 && p.ovr >= 70)
      .sort((a, b) => tradeValue(league, b) - tradeValue(league, a) || a.pid - b.pid)
      .slice(0, 3);
    const buyers = league.teams.filter((t) => t.tid !== me && t.strategy === 'contend').slice(0, 10);
    let best = 0;
    for (const v of vets)
      for (const t of buyers) {
        const pkg = packageFor(league, t.tid, { pids: [v.pid], dpids: [] });
        if (pkg && pkg.myValue - pkg.giveValue > best && works(pkg.offer)) {
          best = pkg.myValue - pkg.giveValue;
          call.offer = pkg.offer;
        }
      }
  }
  if (!call.offer) call.mode = mode === 'sell' || mode === 'buy' ? mode : 'hold';
  return call;
}

/** Each day of the regular season: the deadline's call worked out the day its card opens. */
export function callsDaily(league: League) {
  if (league.fired || !deadlineOpen(league)) return;
  if (league.deadlineCall?.season === league.season) return;
  league.deadlineCall = planDeadlineCall(league);
}

// ---------------------------------------------------------------- the cards

/** The card's shape, as agenda.ts draws it (kept structural here so agenda.ts can import this file). */
export interface CallCard {
  id: string;
  kind: CallKind;
  title: string;
  line: string;
  tone: 'bad' | 'warn' | 'info';
  to?: string;
  due?: string;
  pids?: number[];
  suggestion?: CallChoice;
  choices?: CallChoice[];
}

export type CallAction =
  | { kind: 'settle'; id: string }
  | { kind: 'tenDay'; id: string; pid: number }
  | { kind: 'staffRotation'; id: string }
  | { kind: 'concede'; id: string }
  | { kind: 'trade'; id: string; offer: TradeOffer }
  | { kind: 'budgetCut'; id: string };

export interface CallChoice {
  label: string;
  action: CallAction;
  blocked?: string;
  tone?: 'good' | 'bad';
  confirm?: string;
}

/** The best free agent who'd take a 10-day contract now, for cover (null when none can be signed). */
function tenDayCover(league: League, pos: string): Player | null {
  if (tenDayClosedReason(league)) return null;
  const me = league.userTid;
  const pool = Object.values(league.players).filter((p) => p.tid === FREE_AGENT && !p.waivers && wantsTenDay(league, p, me));
  const same = (p: Player) => (p.pos === pos ? 1 : 0);
  return pool.sort((a, b) => b.ovr + 2 * same(b) - (a.ovr + 2 * same(a)) || a.pid - b.pid).find((p) => !tenDayBlockedReason(league, me, p)) ?? null;
}

/** The staff's calls open now, as cards. */
export function staffCalls(league: League): CallCard[] {
  const open = new Set(openCallIds(league));
  if (!open.size) return [];
  const cards: CallCard[] = [];
  const me = league.userTid;
  const team = league.teams[me];

  for (const { p, id } of hurtStars(league)) {
    if (!open.has(id)) continue;
    const cover = tenDayCover(league, p.pos);
    const manual = team.rotation.manual;
    const out = p.injury!.gamesRemaining;
    const suggestion: CallChoice = cover
      ? { label: `Sign ${playerName(cover)} to a 10-day`, action: { kind: 'tenDay', id, pid: cover.pid }, confirm: `${cover.pos} · ${cover.ovr} OVR, for ten days at the minimum.` }
      : manual
        ? { label: 'Let the staff redo the rotation', action: { kind: 'staffRotation', id } }
        : { label: 'Ride it out', action: { kind: 'settle', id } };
    cards.push({
      id,
      kind: 'injury',
      title: `${playerName(p)} is out ${plural(out, 'game')}`,
      line: cover
        ? `The staff's call: a 10-day for cover while he's out. ${manual ? 'Your rotation is set by hand: his minutes need a home.' : 'The staff spreads his minutes meanwhile.'}`
        : manual
          ? "The staff's call: hand them the rotation while he's out, so his minutes go where they should."
          : "The staff's call: ride it out. His minutes go to the healthy players; a trade is the other way.",
      tone: 'bad',
      to: league.day <= league.tradeDeadlineDay && league.phase === 'regular' ? '/office/trade' : '/team',
      pids: [p.pid],
      suggestion,
      choices: suggestion.action.kind === 'settle' ? undefined : [{ label: 'Ride it out', action: { kind: 'settle', id } }],
    });
  }

  const odds = oddsCall(league);
  if (odds && open.has(oddsId(league))) {
    const id = oddsId(league);
    const blocked = concedeBlockedReason(league);
    const concede: CallChoice = {
      label: "Tell the owner it's a rebuild",
      action: { kind: 'concede', id },
      blocked: blocked ?? undefined,
      confirm: `The postseason goal becomes a development goal, the season counts toward his rebuild limit, and your standing drops ${Math.round(CONCEDE_COST * 100)} points.`,
    };
    const push: CallChoice = { label: 'Keep pushing', action: { kind: 'settle', id } };
    cards.push({
      id,
      kind: 'odds',
      title: `Playoff odds down to ${odds.now < 10 ? '<1' : Math.round(odds.now / 10)}%`,
      line: blocked
        ? `The staff's call: keep pushing. ${blocked}`
        : "The staff's call: tell the owner now, play the young players and sell veterans before the deadline, rather than miss his playoff goal.",
      tone: 'warn',
      to: '/office/owner',
      ...(blocked ? { suggestion: push } : { suggestion: concede, choices: [push] }),
    });
  }

  if (open.has(deadlineId(league))) {
    const id = deadlineId(league);
    const call = league.deadlineCall?.season === league.season ? league.deadlineCall : null;
    const left = league.tradeDeadlineDay - league.day;
    const offer = call?.offer;
    const other = offer ? league.teams[offer.b.tid] : null;
    const pct = call ? `Playoff odds ${Math.round(call.odds / 10)}%. ` : '';
    const stand: CallChoice = { label: 'Stand pat', action: { kind: 'settle', id } };
    const deal: CallChoice | null =
      offer && other
        ? {
            label: call!.mode === 'buy' ? `Trade for ${playerName(league.players[offer.b.pids[0]])}` : `Sell to ${other.abbrev}`,
            action: { kind: 'trade', id, offer },
            confirm: `You send ${assetText(league, offer.a)}; the ${other.name} send ${assetText(league, offer.b)}.`,
          }
        : null;
    cards.push({
      id,
      kind: 'deadline',
      title: left === 0 ? 'Trade deadline: today' : `Trade deadline in ${plural(left, 'day')}`,
      line:
        deal && other
          ? `${pct}The staff's call: ${call!.mode === 'buy' ? 'buy' : 'sell'}. ${assetText(league, offer!.b)} from the ${other.name} for ${assetText(league, offer!.a)}.`
          : `${pct}The staff's call: ${call?.mode === 'buy' ? 'buy, but nothing they found works: stand pat or look yourself.' : call?.mode === 'sell' ? 'sell, but no contender bites: stand pat or look yourself.' : 'stand pat. The team is where it is.'}`,
      tone: 'warn',
      to: '/office/trade',
      due: left === 0 ? 'Deals by the end of the day' : undefined,
      ...(deal ? { suggestion: deal, choices: [stand] } : { suggestion: stand }),
    });
  }

  const b = booksOf(league);
  if (b && open.has(booksId(league))) {
    const id = booksId(league);
    const save = (['coaching', 'health', 'facilities'] as const).reduce(
      (a, k) => a + Math.max(0, budgetCostPerSeason(league, team.budget[k]) - budgetCostPerSeason(league, Math.min(team.budget[k], FROZEN_BUDGET))),
      0,
    );
    const red = money(-team.cash);
    const cut: CallChoice | null =
      b.stage !== 'freeze' && overStandard(league)
        ? { label: 'Cut the budgets', action: { kind: 'budgetCut', id }, confirm: `Coaching, health and facilities go to the league standard (${FROZEN_BUDGET}).` }
        : null;
    const noted: CallChoice = { label: cut ? 'Not now' : 'Understood', action: { kind: 'settle', id } };
    const call = cut ? `cut the staff budgets to the league standard (saves ${money(save)} a season)` : 'shed salary (the budgets are at the standard already)';
    cards.push({
      id,
      kind: 'books',
      title: b.stage === 'warning' ? `In the red: ${red}` : b.stage === 'ultimatum' ? "The owner's ultimatum: the books" : 'The budget is frozen',
      line:
        b.stage === 'warning'
          ? `The owner wants the books back in the black. The staff's call: ${call}.`
          : b.stage === 'ultimatum'
            ? `${red} in the red. Back in the black by the next review, or he freezes the budget (at once at ${money(RED_FREEZE)} in the red). The staff's call: ${call}.`
            : `${red} in the red: minimum deals only, no raises, no trade that takes on salary, until the books are back in the black.`,
      tone: 'bad',
      to: '/office/finances',
      ...(cut ? { suggestion: cut, choices: [noted] } : { suggestion: noted }),
    });
  }
  return cards;
}

/** Carry out a call's choice (resolveAgenda passes it here); the card is settled when it goes through. */
export function resolveCall(league: League, a: CallAction): { ok: boolean; text: string } {
  let r: { ok: boolean; text: string };
  switch (a.kind) {
    case 'settle':
      r = { ok: true, text: '' };
      break;
    case 'tenDay': {
      const t = userTenDay(league, a.pid);
      r = { ok: t.ok, text: t.reason };
      break;
    }
    case 'staffRotation':
      league.teams[league.userTid].rotation.manual = false;
      ensureRotation(league, league.userTid);
      r = { ok: true, text: 'The staff has the rotation.' };
      break;
    case 'concede': {
      const why = concedeBlockedReason(league);
      if (!why) concedeSeason(league);
      r = why ? { ok: false, text: why } : { ok: true, text: 'The owner knows: a rebuilding season.' };
      break;
    }
    case 'trade': {
      const t = league.teams[a.offer.b.tid];
      const errors = validateTrade(league, a.offer);
      if (errors.length) r = { ok: false, text: errors[0] };
      else if (!teamAccepts(league, a.offer, t.tid)) r = { ok: false, text: `The ${t.name} have changed their mind.` };
      else {
        executeTrade(league, a.offer);
        // the deal can make open offers impossible (the same player, a full roster)
        cleanProposals(league);
        r = { ok: true, text: `Trade done with the ${t.region} ${t.name}.` };
      }
      break;
    }
    case 'budgetCut': {
      const budget = league.teams[league.userTid].budget;
      for (const k of ['coaching', 'health', 'facilities'] as const) budget[k] = Math.min(budget[k], FROZEN_BUDGET);
      r = { ok: true, text: 'Budgets cut to the league standard.' };
      break;
    }
  }
  if (r.ok) settleCall(league, a.id);
  return r;
}
