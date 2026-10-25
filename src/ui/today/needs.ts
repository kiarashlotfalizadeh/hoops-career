// What Needs you is, worked out the same way for Today's list and the bell's sheet, so the two counts
// are one: the decisions on the agenda, mail that needs him and isn't one of them, the trade
// deadline's last week, and once a season a backup. The decisions come in one order everywhere: the
// staff's calls first (a long sim stops for one when it opens and once more before it's due, not
// every day it waits), then what the league waits on, the first week's checklist and the rest, AI
// teams' unsolicited trade offers last and as one row (a row each, they pushed a call off Today's
// first rows). The staff's advice and the owner's seat sit beside it on Today, but aren't counted:
// neither waits on an answer.
import type { InboxMessage, League } from '../../core/types';
import { agenda, CALL_KINDS, type AgendaItem } from '../../core/league/agenda';
import { openProposals } from '../../core/league/proposals';
import { fmtDate } from '../../core/league/helpers';
import { useLeagueMemo } from '../../state/store';
import { backupDue } from '../../state/backup';
import { decisionId, needsYou } from './messages';
import { deadlineIn } from './NextGame';

export interface NeedsYou {
  /** The decisions in Needs you's order (see `rank`), AI teams' offers as one row. */
  items: AgendaItem[];
  /** Newest first. */
  mail: InboxMessage[];
  /** Days to the deadline when its row shows (its mail or the staff's deadline call isn't in the list already). */
  deadline: number | null;
  backup: boolean;
  count: number;
}

/** Needs you's order: the staff's calls, what the league waits on, the first week's checklist, the rest. */
const rank = (i: AgendaItem) => (CALL_KINDS.has(i.kind) ? 0 : i.required ? 1 : i.kind === 'guide' ? 2 : 3);

/**
 * AI teams' open offers as one row: one offer stays its own row (Accept and Turn down in reach);
 * more become "3 trade offers: BOS, NYK, MIA" (the first to lapse first), opening the trade screen's
 * Offers tab.
 */
function offersRow(league: League, offers: AgendaItem[]): AgendaItem[] {
  if (offers.length < 2) return offers;
  const ids = new Set(offers.map((i) => i.id));
  const open = openProposals(league)
    .filter((p) => ids.has(`tradeOffer:${p.id}`))
    .sort((a, b) => a.expires - b.expires || a.id - b.id);
  return [
    {
      id: 'tradeOffers',
      kind: 'tradeOffer',
      required: false,
      title: `${open.length} trade offers: ${open.map((p) => league.teams[p.tid].abbrev).join(', ')}`,
      line: `Each lapses on its own; the first on ${fmtDate(league.season, open[0].expires)}.`,
      tone: 'info',
      to: '/office/trade?tab=offers',
      pids: offers.flatMap((i) => i.pids ?? []),
    },
  ];
}

/** The agenda's decisions in Needs you's order (see `rank`), AI teams' offers last of the rest and as one row. */
export function needsItems(league: League, all: AgendaItem[]): AgendaItem[] {
  // (a stable sort: the agenda's own order within each rank)
  const offers = all.filter((i) => i.kind === 'tradeOffer');
  return [...all.filter((i) => i.kind !== 'tradeOffer'), ...offersRow(league, offers)].sort((a, b) => rank(a) - rank(b));
}

export function needsYouOf(league: League): NeedsYou {
  const all = agenda(league);
  const open = new Map(all.map((i) => [i.id, true]));
  const items = needsItems(league, all);
  // (the welcome mail links home: it's the guide's)
  const mail = league.inbox.filter((m) => needsYou(m, open, league) && !decisionId(m) && m.link !== '/').sort((a, b) => b.season - a.season || b.day - a.day || b.id - a.id);
  const d = deadlineIn(league);
  const deadline = d !== null && !league.fired && !mail.some((m) => m.link?.startsWith('/office/trade')) && !items.some((i) => i.kind === 'deadline') ? d : null;
  const backup = backupDue(league);
  return { items, mail, deadline, backup, count: items.length + mail.length + (deadline !== null ? 1 : 0) + (backup ? 1 : 0) };
}

export const useNeedsYou = (league: League) => useLeagueMemo(() => needsYouOf(league), [league]);
