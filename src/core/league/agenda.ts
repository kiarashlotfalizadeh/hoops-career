// The agenda: the decisions waiting on the user, read from the league as it stands. Required items
// are the ones the league won't move on without (the same checks the season loop makes: a roster
// over or under its limits on opening night, an offer sheet on one of his restricted free agents,
// a coach without a team, his pick on the clock); the Continue bar waits on them and names the first.
// Optional items (the staff's calls, see calls.ts: a star hurt, the playoff odds gone, the owner's
// floor in danger, the trade deadline, a playoff series starting, a losing skid gone on, the books
// in the red, a week's trade-off, the one the last sim stopped for first; offers, one
// item each, 10-day contracts running out, job offers, the guided first week) never block. Each
// item can be settled where it stands: the staff's suggestion and any quick choices are
// AgendaActions that resolveAgenda carries out, and `to` opens the screen that has the whole
// decision. Nothing here is stored except the guided week's progress (League.onboarding).
import type { League, Player } from '../types';
import { CAP } from '../constants';
import { addInbox, fmtDate, freeAgents, playerName, standardRoster, teamPlayers, twoWayRoster, TWO_WAY_MAX } from './helpers';
import { FIRED_REASON, askingContract, releaseDeadMoney, releasePlayer, releasedBy, valueScore } from './contracts';
import { marqueeFA, offerBlockedReason, signingClosedReason, userOffer } from './freeAgency';
import { acceptProposal, declineProposal, offerSubject, openProposals, proposalError } from './proposals';
import { restrictedFreeAgents, sheetDecisionBlocked, userDecideSheet } from './rfa';
import { tenDayBlockedReason, tenDayEndBlockedReason, tenDayRestBlockedReason, userEndTenDay, userTenDay, userTenDayRest } from './tenDay';
import { autoDraftUserPick, continueDraft } from './season';
import { nextPick } from './draft';
import { userGameOnDay } from './games';
import { money, plural } from '../format';
import { planByUser } from './gamePlans';
import { ultimatumVerdict } from './jobSecurity';
import { resolveCall, staffCalls, type CallAction, type CallChoice, type CallKind, type CallMeasure } from './calls';

export type AgendaKind = 'fired' | 'cuts' | 'signings' | 'twoWays' | 'offerSheet' | 'draftPick' | 'tenDay' | 'tradeOffer' | 'jobOffers' | 'ultimatum' | 'guide' | CallKind;

/** The agenda's kinds that are the staff's calls (see calls.ts): Needs you puts them first, and the digest and the Play options show them. */
export const CALL_KINDS: ReadonlySet<AgendaKind> = new Set<CallKind>(['injury', 'odds', 'floor', 'deadline', 'series', 'books', 'skid', 'week']);

/** A step of the guided first week. */
export type GuideStep = 'rotation' | 'playbook' | 'scout' | 'coach';

/** What a tap on an agenda item's suggestion or choice does (see resolveAgenda). */
export type AgendaAction =
  /** `pids`: several at once (the staff's picks for the opening-night cuts), `pid` the first of them. */
  | { kind: 'release'; pid: number; pids?: number[] }
  | { kind: 'sign'; pid: number }
  | { kind: 'sheet'; pid: number; match: boolean }
  | { kind: 'autoPick' }
  | { kind: 'tenDay'; pid: number; choice: 'again' | 'rest' | 'end' }
  | { kind: 'proposal'; id: number; accept: boolean }
  | { kind: 'guide'; step: GuideStep }
  | { kind: 'hideGuide' }
  /** A staff call's choice (see calls.ts). */
  | { kind: 'call'; call: CallAction };

export interface AgendaChoice {
  label: string;
  action: AgendaAction;
  /** Why it can't be taken now (shown, and the button is off). */
  blocked?: string;
  tone?: 'good' | 'bad';
  /** It can't be undone and costs something: a second tap confirms it, with this said first. */
  confirm?: string;
  /** The screen it opens once taken (a look for a trade): the answer is made there. */
  to?: string;
}

export interface AgendaItem {
  /** Stable while the decision stands: `${kind}:${key}`. */
  id: string;
  kind: AgendaKind;
  /** The league waits on it: the Continue bar is off until it's settled. */
  required: boolean;
  /** A headline: "Cut 1 player", "Match BOS's offer sheet for Smith?". */
  title: string;
  /** One line under it. */
  line: string;
  /** The reasons and numbers behind it, a tap down (a staff call's Why): sentences, a paragraph a line. */
  detail?: string;
  tone: 'bad' | 'warn' | 'info' | 'good';
  /** The screen with the whole decision. */
  to?: string;
  /** The staff's call, one tap. */
  suggestion?: AgendaChoice;
  /** Other quick choices (Match / Let him go). */
  choices?: AgendaChoice[];
  /** When it lapses: "Ends Jan 14". */
  due?: string;
  /** Pids it's about (for a jersey or a link). */
  pids?: number[];
  /** A checklist (the guided first week): each step, whether it's done, and its screen. */
  steps?: { title: string; done: boolean; to: string; next: boolean }[];
  /** A staff call's number still to measure (the row runs it as it shows: see calls.ts's CallMeasure). */
  measure?: CallMeasure;
  /** Its choice waits on that measuring (the row says so, its buttons until the numbers are in). */
  measuring?: boolean;
}

/** What releasing him leaves on the books: "$2.4M dead money", or "no dead money" (camp and minimum deals before opening night). */
function deadText(league: League, p: Player): string {
  const dead = releaseDeadMoney(league, p).reduce((a, d) => a + d.amount, 0);
  return dead > 0 ? `${money(dead)} dead money` : 'no dead money';
}

/** The staff's picks released in one tap ("Release 2 · staff's picks"), confirmed when any of it stays on the books. */
function releaseAll(league: League, ps: Player[]): AgendaChoice {
  if (ps.length === 1) return { ...releaseChoice(league, ps[0]), label: `Release ${playerName(ps[0])} · staff's pick` };
  const dead = ps.reduce((a, p) => a + releaseDeadMoney(league, p).reduce((b, d) => b + d.amount, 0), 0);
  return {
    label: `Release ${ps.length} · staff's picks`,
    action: { kind: 'release', pid: ps[0].pid, pids: ps.map((p) => p.pid) },
    ...(dead > 0 ? { confirm: `${money(dead)} stays on your books as dead money.` } : {}),
  };
}

/** Releasing a player: free for camp and minimum deals before opening night; anything owed stays on the books, so it's confirmed. */
function releaseChoice(league: League, p: Player): AgendaChoice {
  const dead = releaseDeadMoney(league, p).reduce((a, d) => a + d.amount, 0);
  return {
    label: `Release ${playerName(p)}`,
    action: { kind: 'release', pid: p.pid },
    ...(dead > 0 ? { confirm: `${money(dead)} stays on your books as dead money.` } : {}),
  };
}

/**
 * The free agent the staff would sign first for an open spot: the most valuable one who'd take his
 * asking deal and whom the cap and the rules let the user sign at it now (a top free agent who weighs
 * offers, a restricted free agent and a player on waivers are decisions for the Free Agents screen).
 */
export function bestSigning(league: League): { p: Player; amount: number; years: number } | null {
  if (signingClosedReason(league)) return null;
  const me = league.userTid;
  const pool = freeAgents(league)
    .filter((p) => !p.waivers && !p.rfa && !releasedBy(league, p, me) && !marqueeFA(league, p))
    .map((p) => ({ p, v: valueScore(league, p) }))
    .sort((a, b) => b.v - a.v || a.p.pid - b.p.pid);
  for (const { p } of pool.slice(0, 60)) {
    const ask = askingContract(league, p, me);
    if (!offerBlockedReason(league, p, ask.amount, ask.years)) return { p, amount: ask.amount, years: ask.years };
  }
  return null;
}

const short = (l: League, day: number) => fmtDate(l.season, day, { month: 'short', day: 'numeric' });

/**
 * Who the staff would cut first: least value to the team, a release's dead money counted against it
 * (camp and minimum deals cost nothing before opening night), as AI teams trim theirs.
 */
export function cutOrder(league: League, players: Player[]): Player[] {
  const keep = (p: Player) => valueScore(league, p) + (0.3 * releaseDeadMoney(league, p).reduce((a, d) => a + d.amount, 0)) / 1000;
  return [...players].sort((a, b) => keep(a) - keep(b));
}

// ---------------------------------------------------------------- the guided first week

export const GUIDE_STEPS: { step: GuideStep; title: string; line: string }[] = [
  { step: 'rotation', title: 'Set your rotation', line: "Change the starters, minutes or closers, or keep the staff's." },
  { step: 'playbook', title: 'Pick a playbook', line: "Each shows how well it fits this roster. Pick one, or keep the staff's." },
  { step: 'scout', title: 'Plan for your opener', line: "Add the staff's counter, or go in with no plan." },
  { step: 'coach', title: 'Coach a game live', line: 'Call timeouts, subs and changes. The report says what they did.' },
];

/**
 * The guide's steps done, each by a real choice: the rotation or playbook changed or kept on its
 * screen (the guide strip there), a counter added for a game or no plan chosen, a live game coached:
 * a move of his own in it (a timeout, a sub, a change of tactics or a staff call taken: the report
 * keeps them), or a period of it watched whole (the live game notes that: see guideAfterLive).
 * Opening a screen, or a live game simmed to its end, ticks nothing.
 */
export function guideDone(league: League): Set<GuideStep> {
  const done = new Set<GuideStep>(league.onboarding?.done ?? []);
  const t = league.teams[league.userTid];
  if (t.rotation.manual) done.add('rotation');
  if (t.tactics.manual) done.add('playbook');
  if (Object.values(league.gamePlans ?? {}).some(planByUser)) done.add('scout');
  if (!done.has('coach') && league.games.some((r) => r.moves?.some((m) => m.by !== 'staff'))) done.add('coach');
  return done;
}

/** Note a step of the guide done (its strip's "keep", or a live game watched): it stays done. */
export function guideStepDone(league: League, step: GuideStep) {
  const o = (league.onboarding ??= { done: [] });
  if (!o.done.includes(step)) o.done.push(step);
}

/** The guide's title: it runs through the first three weeks, so "Your first games". */
export const GUIDE_TITLE = 'Your first games';

/** A step's title as it reads now: the plan step is for the opener until it's played, then for the next game. */
export function guideStepTitle(league: League, step: GuideStep): string {
  const s = GUIDE_STEPS.find((x) => x.step === step)!;
  if (step !== 'scout') return s.title;
  const ts = league.teams[league.userTid].seasons.find((x) => x.season === league.season);
  return league.phase === 'regular' && ts && ts.won + ts.lost > 0 ? 'Plan for your next game' : s.title;
}

/** The guide's weeks: the user's first season, from the preseason through its first three weeks, unless he put it away (or teaching is off). */
export function guideWeeks(league: League): boolean {
  const o = league.onboarding;
  if (!o || o.hidden || league.settings.teaching === false) return false;
  if (league.season !== league.startSeason) return false;
  return league.phase === 'preseason' || (league.phase === 'regular' && league.day < 21);
}

/** The guide shows in the user's first season, from the preseason through its first weeks, until each step is done or he puts it away. */
export function guideOpen(league: League): boolean {
  return guideWeeks(league) && guideDone(league).size < GUIDE_STEPS.length;
}

/** How a normal week goes, as the staff's note says it when the guide is done (three lines). */
const GUIDE_WEEK = [
  'Most days: play or sim to the next game. The staff covers the rest.',
  "Before a big game: add the staff's counter in Matchup → Plan.",
  'Once a month the owner checks his goals in Office → Owner.',
];
const WEEK_SUBJECT = 'A normal week';

/**
 * With every step done, the staff's note on how a normal week goes, once (the live game that coaches
 * the last step, or the guide strip's last "keep", sends it). It links home, as the welcome does: it's
 * the guide's, not something that needs him.
 */
export function guideFinished(league: League) {
  const o = league.onboarding;
  if (!o || league.settings.teaching === false || league.season !== league.startSeason || guideDone(league).size < GUIDE_STEPS.length) return;
  if (league.inbox.some((m) => m.subject === WEEK_SUBJECT && m.season === league.season)) return;
  addInbox(league, { from: 'Assistant Coach', subject: WEEK_SUBJECT, body: GUIDE_WEEK.join('\n\n'), tone: 'good', link: '/' });
}

/** A live game over: a period of it watched whole coaches it (a move of his own does too: see guideDone), and the last step done sends the staff's note. */
export function guideAfterLive(league: League, watched: boolean) {
  if (!league.onboarding) return;
  if (watched) guideStepDone(league, 'coach');
  guideFinished(league);
}

/** Bring the guide back (Today's "Guide" link): it shows again while the first weeks last. */
export function showGuide(league: League) {
  league.onboarding = { done: league.onboarding?.done ?? [], hidden: false };
}

/** Whether a step of the guide is open and not done yet (its screen shows the guide strip). */
export function guideStepOpen(league: League, step: GuideStep): boolean {
  return guideOpen(league) && !guideDone(league).has(step);
}

/** Where a guide step is done: its screen (step 4: game day's preview, where Tip off is). */
export function guideStepTo(league: League, step: GuideStep): string {
  const opener = nextOpponent(league);
  if (step === 'rotation') return '/team/rotation';
  if (step === 'playbook') return '/team/tactics';
  if (opener === undefined) return '/games';
  return step === 'scout' ? `/games/${opener}?tab=plan` : `/games/${opener}`;
}

function guideItems(league: League): AgendaItem[] {
  if (!guideWeeks(league)) return [];
  const done = guideDone(league);
  const noted = league.inbox.some((m) => m.subject === WEEK_SUBJECT && m.season === league.season);
  if (done.size >= GUIDE_STEPS.length)
    return [
      {
        id: 'guide:done',
        kind: 'guide',
        required: false,
        title: `${GUIDE_TITLE} · all ${GUIDE_STEPS.length} done`,
        // (Today shows two lines of it: the staff's note has all three)
        line: noted ? `${GUIDE_WEEK[0]} More in the staff's note.` : GUIDE_WEEK.join(' '),
        ...(noted ? { to: '/inbox' } : {}),
        tone: 'good',
        choices: [{ label: 'Got it', action: { kind: 'hideGuide' } }],
      },
    ];
  const next = GUIDE_STEPS.find((s) => !done.has(s.step))!;
  return [
    {
      id: 'guide',
      kind: 'guide',
      required: false,
      title: `${GUIDE_TITLE} · ${done.size} of ${GUIDE_STEPS.length} done`,
      line: `Next: ${next.line}`,
      tone: 'info',
      to: guideStepTo(league, next.step),
      steps: GUIDE_STEPS.map((s) => ({ title: guideStepTitle(league, s.step), done: done.has(s.step), to: guideStepTo(league, s.step), next: s === next })),
      choices: [{ label: 'Hide the guide', action: { kind: 'hideGuide' } }],
    },
  ];
}

/** The user's next opponent (tid), today's included. */
export function nextOpponent(league: League): number | undefined {
  const me = league.userTid;
  const g = league.schedule.filter((x) => !x.played && x.day >= league.day && (x.home === me || x.away === me) && x.type !== 'allstar').sort((a, b) => a.day - b.day)[0];
  return g ? (g.home === me ? g.away : g.home) : undefined;
}

// ---------------------------------------------------------------- the agenda

/** The staff's call for an open spot: sign the best free agent who fits, at his asking deal. */
function signingSuggestion(league: League): Pick<AgendaItem, 'suggestion'> {
  const b = bestSigning(league);
  if (!b) return {};
  const pos = b.p.pos;
  return {
    suggestion: {
      label: `Sign ${playerName(b.p)} (${pos} · ${b.p.ovr} OVR)`,
      action: { kind: 'sign', pid: b.p.pid },
      confirm: `${money(b.amount)} × ${plural(b.years, 'yr')}.`,
    },
  };
}

export function agenda(league: League): AgendaItem[] {
  const items: AgendaItem[] = [];
  const me = league.userTid;
  if (league.fired) {
    items.push({
      id: 'fired',
      kind: 'fired',
      required: true,
      title: 'Find a new job',
      line: 'Your agent has the offers. The league waits until you take one.',
      tone: 'bad',
      to: '/office/career',
    });
    return items;
  }

  // opening night: the roster limits
  if (league.phase === 'preseason') {
    const std = standardRoster(league, me);
    const over = std.length - CAP.rosterMax;
    if (over > 0) {
      const picks = cutOrder(league, std).slice(0, over);
      items.push({
        id: 'cuts',
        kind: 'cuts',
        required: true,
        title: `Release ${plural(over, 'player')}`,
        line: `${std.length} signed · ${CAP.rosterMax} allowed on opening night. The staff's ${over === 1 ? 'pick' : 'picks'}, least value first: ${picks.map((p) => `${playerName(p)}, ${deadText(league, p)}`).join(' · ')}.`,
        tone: 'bad',
        to: '/team',
        suggestion: releaseAll(league, picks),
        pids: picks.map((p) => p.pid),
      });
    }
    const under = CAP.rosterMin - std.length;
    if (under > 0)
      items.push({
        id: 'signings',
        kind: 'signings',
        required: true,
        title: `Sign ${plural(under, 'player')}`,
        line: `${std.length} signed · ${CAP.rosterMin} needed on opening night. Minimum deals always fit.`,
        tone: 'bad',
        to: '/office/free-agents',
        ...signingSuggestion(league),
      });
    const tw = twoWayRoster(league, me);
    if (tw.length > TWO_WAY_MAX) {
      const first = cutOrder(league, tw)[0];
      items.push({
        id: 'twoWays',
        kind: 'twoWays',
        required: true,
        title: `Release ${plural(tw.length - TWO_WAY_MAX, 'two-way player')}`,
        line: `${tw.length} on two-way deals · ${TWO_WAY_MAX} allowed.`,
        tone: 'bad',
        to: '/team',
        suggestion: releaseChoice(league, first),
      });
    }
  }

  // an offer sheet on one of his restricted free agents: the summer waits for his answer
  for (const p of teamlessRfas(league)) {
    const sheet = p.rfa!.sheet!;
    const team = league.teams[sheet.tid];
    items.push({
      id: `offerSheet:${p.pid}`,
      kind: 'offerSheet',
      required: true,
      title: `Match ${team.abbrev}'s offer sheet for ${playerName(p)}?`,
      line: `Matching keeps him on exactly those terms. Two days to decide.`,
      tone: 'warn',
      to: '/office/free-agents',
      due: `Decide by ${short(league, sheet.until)}`,
      choices: [
        { label: 'Match', action: { kind: 'sheet', pid: p.pid, match: true }, blocked: sheetDecisionBlocked(league, p.pid, true) ?? undefined, tone: 'good' },
        {
          label: 'Let him go',
          action: { kind: 'sheet', pid: p.pid, match: false },
          blocked: sheetDecisionBlocked(league, p.pid, false) ?? undefined,
          confirm: `${playerName(p)} joins ${team.abbrev}.`,
        },
      ],
      pids: [p.pid],
    });
  }

  // the draft: his pick on the clock
  if (league.phase === 'draft') {
    const dp = nextPick(league);
    if (dp && dp.tid === me)
      items.push({
        id: `draftPick:${dp.dpid}`,
        kind: 'draftPick',
        required: true,
        title: `You're on the clock: pick ${dp.pick ?? ''}`.trim(),
        line: 'Take a prospect from the board, or let the staff pick for you.',
        tone: 'warn',
        to: '/office/draft',
        suggestion: { label: "Take the staff's pick", action: { kind: 'autoPick' } },
      });
  }

  // 10-day contracts: the one ending next decides on its last day (by itself he just leaves)
  for (const p of teamPlayers(league, me)) {
    const c = p.contract.tenDay;
    if (!c || c.until - league.day > 2) continue;
    items.push({
      id: `tenDay:${p.pid}`,
      kind: 'tenDay',
      required: false,
      title: `${playerName(p)}'s 10-day contract ends`,
      line: 'Sign him again, keep him for the rest of the season, or let him go.',
      tone: 'info',
      to: `/player/${p.pid}`,
      due: `Ends ${short(league, c.until)}`,
      choices: [
        { label: 'Second 10-day', action: { kind: 'tenDay', pid: p.pid, choice: 'again' }, blocked: tenDayBlockedReason(league, me, p) ?? undefined },
        { label: 'Rest of season', action: { kind: 'tenDay', pid: p.pid, choice: 'rest' }, blocked: tenDayRestBlockedReason(league, p) ?? undefined, tone: 'good' },
        { label: 'Let him go', action: { kind: 'tenDay', pid: p.pid, choice: 'end' }, blocked: tenDayEndBlockedReason(league, p) ?? undefined },
      ],
      pids: [p.pid],
    });
  }

  // trade offers from AI teams
  for (const pr of openProposals(league)) {
    const err = proposalError(league, pr);
    if (err) continue;
    const want = pr.offer.a.pids.map((pid) => league.players[pid]).filter(Boolean);
    items.push({
      id: `tradeOffer:${pr.id}`,
      kind: 'tradeOffer',
      required: false,
      // the inbox's subject, and the other GM's pitch in his name (it isn't your staff talking)
      title: offerSubject(league, pr.offer),
      line: `${league.teams[pr.tid].abbrev} GM: “${pr.note}”`,
      tone: 'info',
      to: `/office/trade?offer=${pr.id}`,
      due: `Stands until ${short(league, pr.expires)}`,
      choices: [
        // (a trade from a row on Today: the second tap is the handshake)
        { label: 'Accept', action: { kind: 'proposal', id: pr.id, accept: true }, tone: 'good', confirm: 'The trade goes through at once.' },
        { label: 'Turn down', action: { kind: 'proposal', id: pr.id, accept: false } },
      ],
      pids: want.map((p) => p.pid),
    });
  }

  // the summer's job offers
  const offers = league.jobOffers?.season === league.season ? league.jobOffers.offers : [];
  if (offers.length)
    items.push({
      id: 'jobOffers',
      kind: 'jobOffers',
      required: false,
      title: `${plural(offers.length, 'team')} ${offers.length === 1 ? 'wants' : 'want'} you as coach`,
      line: offers.map((o) => league.teams[o.tid].abbrev).join(', ') + '. Offers lapse at the draft.',
      tone: 'info',
      to: '/office/career',
    });

  // the owner's ultimatum: in season, while it's still to meet (met, or once the review is in, it's settled)
  const og = league.ownerGoals?.season === league.season && league.ownerGoals.tid === league.userTid ? league.ownerGoals : undefined;
  const ult = og?.ultimatum;
  const live =
    (league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs') &&
    ultimatumVerdict(league, og) !== 'met' &&
    !(league.ownerReviews ?? []).some((r) => r.season === league.season && r.tid === league.userTid);
  if (ult && live && league.settings.jobSecurity)
    items.push({
      id: 'ultimatum',
      kind: 'ultimatum',
      required: false,
      title: `Owner: ${ult.text}`,
      line: "Miss it and you're fired, whatever else goes right.",
      tone: 'bad',
      to: '/office/owner',
    });

  // the staff's calls: what the season needs an answer to now, the one the last sim stopped for first (that day)
  const stop = league.stopCall?.season === league.season && league.stopCall.day === league.day ? league.stopCall.id : null;
  for (const c of staffCalls(league).sort((x, y) => Number(y.id === stop) - Number(x.id === stop))) {
    const wrap = (x: CallChoice): AgendaChoice => ({ ...x, action: { kind: 'call', call: x.action } });
    items.push({ ...c, required: false, suggestion: c.suggestion && wrap(c.suggestion), choices: c.choices?.map(wrap) });
  }

  items.push(...guideItems(league));
  return items;
}

/** The user's restricted free agents with an offer sheet waiting on his answer (as newSeasonBlockedReason reads them). */
function teamlessRfas(league: League): Player[] {
  if (league.phase !== 'freeAgency') return [];
  return restrictedFreeAgents(league, league.userTid).filter((p) => !!p.rfa!.sheet);
}

/** The first required item's headline, or null when the league can move on. */
export function agendaBlocker(league: League): AgendaItem | null {
  return agenda(league).find((i) => i.required) ?? null;
}

/** Carry out an agenda choice. Returns what to tell the user, and whether it went through. */
export function resolveAgenda(league: League, a: AgendaAction): { ok: boolean; text: string } {
  switch (a.kind) {
    case 'release': {
      const ps = (a.pids ?? [a.pid]).map((pid) => league.players[pid]);
      if (ps.some((p) => !p || p.tid !== league.userTid))
        return { ok: false, text: ps.length > 1 ? 'One of them is no longer on your roster.' : 'He is no longer on your roster.' };
      if (league.fired) return { ok: false, text: FIRED_REASON };
      for (const p of ps) releasePlayer(league, p);
      return { ok: true, text: `${ps.map((p) => playerName(p)).join(' and ')} released.` };
    }
    case 'sign': {
      const p = league.players[a.pid];
      if (!p) return { ok: false, text: 'He is no longer a free agent.' };
      const ask = askingContract(league, p, league.userTid);
      const r = userOffer(league, a.pid, ask.amount, ask.years);
      return { ok: r.ok, text: r.ok ? `${playerName(p)} signed: ${money(ask.amount)} × ${plural(ask.years, 'yr')}.` : r.reason };
    }
    case 'sheet': {
      const r = userDecideSheet(league, a.pid, a.match);
      return { ok: r.ok, text: r.reason };
    }
    case 'autoPick': {
      const dp = nextPick(league);
      if (!dp || dp.tid !== league.userTid) return { ok: false, text: 'It is not your pick.' };
      const mine = new Set(teamPlayers(league, league.userTid).map((p) => p.pid));
      autoDraftUserPick(league);
      const took = teamPlayers(league, league.userTid).find((p) => !mine.has(p.pid));
      return { ok: true, text: took ? `The staff took ${playerName(took)}.` : 'The staff made your pick.' };
    }
    case 'tenDay': {
      const r = a.choice === 'again' ? userTenDay(league, a.pid) : a.choice === 'rest' ? userTenDayRest(league, a.pid) : userEndTenDay(league, a.pid);
      return { ok: r.ok, text: r.reason };
    }
    case 'proposal': {
      if (!a.accept) {
        declineProposal(league, a.id);
        return { ok: true, text: 'Offer turned down.' };
      }
      const r = acceptProposal(league, a.id);
      // a pick traded on draft night: the draft moves on to the next team that picks (or yours)
      if (r.ok && league.phase === 'draft') continueDraft(league);
      return { ok: r.ok, text: r.reason };
    }
    case 'guide':
      // (the guide strip's "keep" on its step's screen: keeping the staff's choice is a choice)
      guideStepDone(league, a.step);
      guideFinished(league);
      return { ok: true, text: '' };
    case 'hideGuide': {
      // (the last card's "Got it": nothing left to bring back)
      const finished = guideDone(league).size >= GUIDE_STEPS.length;
      league.onboarding = { done: league.onboarding?.done ?? [], hidden: true };
      return { ok: true, text: finished ? '' : 'Guide hidden. Bring it back from Today.' };
    }
    case 'call':
      if (league.fired) return { ok: false, text: FIRED_REASON };
      return resolveCall(league, a.call);
  }
}

/** Start a new league's guide (createLeague), with a welcome from the staff (none with teaching off). */
export function startGuide(league: League) {
  league.onboarding = { done: [] };
  if (league.settings.teaching === false) return;
  addInbox(league, {
    from: 'Assistant Coach',
    subject: GUIDE_TITLE,
    body: 'Four choices to make in your first games. Set your rotation, pick a playbook, plan for the opener and coach a game live. Today keeps the checklist. Each one ticks off when you make the call, not when you look.',
    tone: 'good',
    link: '/',
  });
}

/** Today's game for the user, if any (a convenience for screens that show the agenda next to it). */
export const gameToday = (league: League) => userGameOnDay(league, league.day);
export { FIRED_REASON };
