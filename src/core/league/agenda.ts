// The agenda: the decisions waiting on the user, read from the league as it stands. Required items
// are the ones the league won't move on without (the same checks the season loop makes: a roster
// over or under its limits on opening night, an offer sheet on one of his restricted free agents,
// a coach without a team, his pick on the clock); the Continue bar waits on them and names the first.
// Optional items (offers, 10-day contracts running out, unhappy players, job offers, the guided first
// week) never block. Each item can be settled where it stands: the staff's suggestion and any quick
// choices are AgendaActions that resolveAgenda carries out, and `to` opens the screen that has the
// whole decision. Nothing here is stored except the guided week's progress (League.onboarding).
import type { League, Player } from '../types';
import { CAP } from '../constants';
import { addInbox, fmtDate, playerName, standardRoster, teamPlayers, twoWayRoster, TWO_WAY_MAX } from './helpers';
import { FIRED_REASON, releaseDeadMoney, releasePlayer, valueScore } from './contracts';
import { acceptProposal, declineProposal, openProposals, proposalError } from './proposals';
import { restrictedFreeAgents, sheetDecisionBlocked, userDecideSheet } from './rfa';
import { tenDayBlockedReason, tenDayEndBlockedReason, tenDayRestBlockedReason, userEndTenDay, userTenDay, userTenDayRest } from './tenDay';
import { autoDraftUserPick, continueDraft } from './season';
import { nextPick } from './draft';
import { userGameOnDay } from './games';

export type AgendaKind = 'fired' | 'cuts' | 'signings' | 'twoWays' | 'offerSheet' | 'draftPick' | 'tenDay' | 'tradeOffer' | 'tradeRequest' | 'jobOffers' | 'ultimatum' | 'guide';

/** A step of the guided first week. */
export type GuideStep = 'rotation' | 'playbook' | 'scout' | 'coach';

/** What a tap on an agenda item's suggestion or choice does (see resolveAgenda). */
export type AgendaAction =
  | { kind: 'release'; pid: number }
  | { kind: 'sheet'; pid: number; match: boolean }
  | { kind: 'autoPick' }
  | { kind: 'tenDay'; pid: number; choice: 'again' | 'rest' | 'end' }
  | { kind: 'proposal'; id: number; accept: boolean }
  | { kind: 'guide'; step: GuideStep }
  | { kind: 'hideGuide' };

export interface AgendaChoice {
  label: string;
  action: AgendaAction;
  /** Why it can't be taken now (shown, and the button is off). */
  blocked?: string;
  tone?: 'good' | 'bad';
  /** It can't be undone and costs something: a second tap confirms it, with this said first. */
  confirm?: string;
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
}

/** Releasing a player: free for camp and minimum deals before opening night; anything owed stays on the books, so it's confirmed. */
function releaseChoice(league: League, p: Player): AgendaChoice {
  const dead = releaseDeadMoney(league, p).reduce((a, d) => a + d.amount, 0);
  return {
    label: `Release ${playerName(p)}`,
    action: { kind: 'release', pid: p.pid },
    ...(dead > 0 ? { confirm: `$${(dead / 1000).toFixed(1)}M stays on your books as dead money.` } : {}),
  };
}

const short = (l: League, day: number) => fmtDate(l.season, day, { month: 'short', day: 'numeric' });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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
  { step: 'rotation', title: 'Check your rotation', line: 'Starters, minutes and who closes. The staff set it from the roster.' },
  { step: 'playbook', title: 'Pick a playbook', line: 'Every playbook shows how well it fits this roster.' },
  { step: 'scout', title: 'Scout your opener', line: 'What they do best, where to attack them, and a plan for the night.' },
  { step: 'coach', title: 'Coach a game live', line: 'Timeouts, subs and adjustments, then the report says why it went that way.' },
];

/** The guide's steps done: ticked off on the guided item, or done anyway (the rotation or playbook changed, a plan made, a live game coached). */
export function guideDone(league: League): Set<GuideStep> {
  const done = new Set<GuideStep>(league.onboarding?.done ?? []);
  const t = league.teams[league.userTid];
  if (t.rotation.manual) done.add('rotation');
  if (t.tactics.manual) done.add('playbook');
  if (Object.keys(league.gamePlans ?? {}).length) done.add('scout');
  // the latest live game's highlights are kept with the save
  if (league.reel) done.add('coach');
  return done;
}

/** The guide shows in the user's first season, from the preseason through its first weeks, until each step is done or he puts it away. */
export function guideOpen(league: League): boolean {
  const o = league.onboarding;
  if (!o || o.hidden) return false;
  if (league.season !== league.startSeason) return false;
  if (league.phase !== 'preseason' && !(league.phase === 'regular' && league.day < 21)) return false;
  return guideDone(league).size < GUIDE_STEPS.length;
}

/** Bring the guide back (Today's "Guide" link): it shows again while the first weeks last. */
export function showGuide(league: League) {
  league.onboarding = { done: league.onboarding?.done ?? [], hidden: false };
}

function guideItems(league: League): AgendaItem[] {
  if (!guideOpen(league)) return [];
  const done = guideDone(league);
  const step = GUIDE_STEPS.find((s) => !done.has(s.step));
  if (!step) return [];
  const opener = nextOpponent(league);
  const to =
    step.step === 'rotation'
      ? '/team/rotation'
      : step.step === 'playbook'
        ? '/team/tactics'
        : step.step === 'scout'
          ? opener !== undefined
            ? `/games/${opener}`
            : '/games'
          : undefined;
  const keep = step.step === 'rotation' ? "Keep the staff's rotation" : step.step === 'playbook' ? "Keep the staff's playbook" : step.step === 'scout' ? 'Skip for now' : undefined;
  return [
    {
      id: `guide:${step.step}`,
      kind: 'guide',
      required: false,
      title: `${done.size + 1} of ${GUIDE_STEPS.length} · ${step.title}`,
      line: step.line,
      tone: 'info',
      to,
      suggestion: keep ? { label: keep, action: { kind: 'guide', step: step.step } } : undefined,
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

export function agenda(league: League): AgendaItem[] {
  const items: AgendaItem[] = [];
  const me = league.userTid;
  if (league.fired) {
    items.push({
      id: 'fired',
      kind: 'fired',
      required: true,
      title: 'Find a new job',
      line: 'Take over another team. The league waits until you do.',
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
      const first = cutOrder(league, std)[0];
      items.push({
        id: 'cuts',
        kind: 'cuts',
        required: true,
        title: `Cut ${plural(over, 'player')}`,
        line: `${std.length} on standard deals; ${CAP.rosterMax} allowed on opening night.`,
        tone: 'bad',
        to: '/team',
        suggestion: releaseChoice(league, first),
        pids: cutOrder(league, std)
          .slice(0, over)
          .map((p) => p.pid),
      });
    }
    const under = CAP.rosterMin - std.length;
    if (under > 0)
      items.push({
        id: 'signings',
        kind: 'signings',
        required: true,
        title: `Sign ${plural(under, 'player')}`,
        line: `${std.length} on standard deals; ${CAP.rosterMin} needed on opening night. Minimum deals always fit.`,
        tone: 'bad',
        to: '/office/free-agents',
      });
    const tw = twoWayRoster(league, me);
    if (tw.length > TWO_WAY_MAX) {
      const first = cutOrder(league, tw)[0];
      items.push({
        id: 'twoWays',
        kind: 'twoWays',
        required: true,
        title: `Release ${plural(tw.length - TWO_WAY_MAX, 'two-way player')}`,
        line: `${tw.length} on two-way deals; ${TWO_WAY_MAX} allowed.`,
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
    const them = league.teams[pr.tid];
    const want = pr.offer.a.pids.map((pid) => league.players[pid]).filter(Boolean);
    const what = want.length ? `for ${want.map((p) => p.lastName).join(' and ')}` : pr.offer.a.dpids.length ? 'for a pick' : '';
    items.push({
      id: `tradeOffer:${pr.id}`,
      kind: 'tradeOffer',
      required: false,
      title: `${them.abbrev} offer a trade ${what}`.trim(),
      line: pr.note,
      tone: 'info',
      to: `/office/trade?offer=${pr.id}`,
      due: `Stands until ${short(league, pr.expires)}`,
      choices: [
        { label: 'Accept', action: { kind: 'proposal', id: pr.id, accept: true }, tone: 'good' },
        { label: 'Turn down', action: { kind: 'proposal', id: pr.id, accept: false } },
      ],
      pids: want.map((p) => p.pid),
    });
  }

  // players who want out
  for (const p of teamPlayers(league, me))
    if (p.mood.tradeRequest)
      items.push({
        id: `tradeRequest:${p.pid}`,
        kind: 'tradeRequest',
        required: false,
        title: `${playerName(p)} wants a trade`,
        line: 'Meet him: promise a role, promise a trade, or ask for patience.',
        tone: 'warn',
        to: `/player/${p.pid}?meet=1`,
        pids: [p.pid],
      });

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

  // the owner's ultimatum
  const ult = league.ownerGoals?.season === league.season ? league.ownerGoals.ultimatum : undefined;
  if (ult && league.settings.jobSecurity)
    items.push({
      id: 'ultimatum',
      kind: 'ultimatum',
      required: false,
      title: `Owner: ${ult.text}`,
      line: "Miss it and you're fired, whatever else goes right.",
      tone: 'bad',
      to: '/office/owner',
    });

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
      const p = league.players[a.pid];
      if (!p || p.tid !== league.userTid) return { ok: false, text: 'He is no longer on your roster.' };
      if (league.fired) return { ok: false, text: FIRED_REASON };
      releasePlayer(league, p);
      return { ok: true, text: `${playerName(p)} released.` };
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
    case 'guide': {
      const o = (league.onboarding ??= { done: [] });
      if (!o.done.includes(a.step)) o.done.push(a.step);
      return { ok: true, text: '' };
    }
    case 'hideGuide': {
      league.onboarding = { done: league.onboarding?.done ?? [], hidden: true };
      return { ok: true, text: 'Guide hidden. Bring it back from Today.' };
    }
  }
}

/** Tick a guide step off as its screen is opened (a no-op once done or with no guide). */
export function guideVisit(league: League, step: GuideStep) {
  const o = league.onboarding;
  if (!o || o.done.includes(step)) return false;
  o.done.push(step);
  return true;
}

/** Start a new league's guide (createLeague), with a welcome from the staff. */
export function startGuide(league: League) {
  league.onboarding = { done: [] };
  addInbox(league, {
    from: 'Assistant Coach',
    subject: 'Your first week',
    body: 'Four things before opening night: your rotation, your playbook, a look at your first opponent, and a game coached live. Today lists them one at a time.',
    tone: 'good',
    link: '/',
  });
}

/** Today's game for the user, if any (a convenience for screens that show the agenda next to it). */
export const gameToday = (league: League) => userGameOnDay(league, league.day);
export { FIRED_REASON };
