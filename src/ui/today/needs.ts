// What Needs you is, worked out the same way for Today's list and the top bar's bell, so the two
// counts are one: the decisions on the agenda, mail that needs him and isn't one of them, the trade
// deadline's last week, and once a season a backup. The staff's advice and the owner's seat sit
// beside it on Today, but aren't counted: neither waits on an answer.
import type { InboxMessage, League } from '../../core/types';
import { agenda, type AgendaItem } from '../../core/league/agenda';
import { useLeagueMemo } from '../../state/store';
import { backupDue } from '../../state/backup';
import { decisionId, needsYou } from './messages';
import { deadlineIn } from './NextGame';

export interface NeedsYou {
  items: AgendaItem[];
  /** Newest first. */
  mail: InboxMessage[];
  /** Days to the deadline when its row shows (its mail or the staff's deadline call isn't in the list already). */
  deadline: number | null;
  backup: boolean;
  count: number;
}

export function needsYouOf(league: League): NeedsYou {
  const items = agenda(league);
  const open = new Map(items.map((i) => [i.id, true]));
  // (the welcome mail links home: it's the guide's)
  const mail = league.inbox.filter((m) => needsYou(m, open, league) && !decisionId(m) && m.link !== '/').sort((a, b) => b.season - a.season || b.day - a.day || b.id - a.id);
  const d = deadlineIn(league);
  const deadline = d !== null && !league.fired && !mail.some((m) => m.link?.startsWith('/office/trade')) && !items.some((i) => i.kind === 'deadline') ? d : null;
  const backup = backupDue(league);
  return { items, mail, deadline, backup, count: items.length + mail.length + (deadline !== null ? 1 : 0) + (backup ? 1 : 0) };
}

export const useNeedsYou = (league: League) => useLeagueMemo(() => needsYouOf(league), [league]);
