// The inbox's pieces, shared by the Inbox screen and Today's unread list: a message row, and the
// message in full in a sheet. A message that carries a decision (a trade offer, an offer sheet, a
// 10-day contract ending) shows that decision's agenda row, settled in place; once it's off the
// agenda, one dim line says how it was settled.
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { InboxMessage, League } from '../../core/types';
import { agenda, type AgendaItem } from '../../core/league/agenda';
import { fmtDate, sentence } from '../../core/league/helpers';
import { openProposals, proposalError } from '../../core/league/proposals';
import { edit, touch } from '../../state/actions';
import { useLeagueMemo, useStore } from '../../state/store';
import { AgendaRow } from '../components/Agenda';
import { Sheet } from '../components/ui';
import { inAppPath } from '../nav';

/** The agenda item a message's decision is, by its id (`tradeOffer:<id>`, `offerSheet:<pid>`, `tenDay:<pid>`). */
export function decisionId(m: InboxMessage): string | null {
  if (m.proposal !== undefined) return `tradeOffer:${m.proposal}`;
  if (m.sheet !== undefined) return `offerSheet:${m.sheet}`;
  if (m.tenDay !== undefined) return `tenDay:${m.tenDay}`;
  return null;
}

/** Big news needs the user for this many days; after that (or once a new season starts) it's just unread mail. */
export const NEWS_DAYS = 14;

/**
 * Unread mail that needs the user: recent big news (`important`) or a decision still open. The rest
 * is unread in the list but doesn't feed the top bar's badge or Today's count: a season of injury
 * notes and check-ins would bury the two that matter, and last June's title mail isn't news in
 * October. `now`: the league's date (without it, big news never goes stale).
 */
export const needsYou = (m: InboxMessage, open: ReadonlyMap<string, unknown>, now?: Pick<League, 'season' | 'day'>) => {
  if (m.read) return false;
  const d = decisionId(m);
  if (d) return open.has(d);
  return !!m.important && (!now || (m.season === now.season && now.day - m.day <= NEWS_DAYS));
};

/** The agenda by id, worked out once per league change. */
export function useAgendaById(league: League): Map<string, AgendaItem> {
  return useLeagueMemo(() => new Map(agenda(league).map((i) => [i.id, i])), [league]);
}

/** A message's lines run together for a one-line preview. */
export const previewText = (body: string) =>
  body
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (x.endsWith(':') ? x : sentence(x)))
    .join(' ');

/** Mark a message read as it's opened: a light mark, saved with the next change. */
export const markRead = (id: number) =>
  touch((l) => {
    const m = l.inbox.find((x) => x.id === id);
    if (m) m.read = true;
  });

const shortDate = (m: InboxMessage) => fmtDate(m.season, m.day, { month: 'short', day: 'numeric' });

/**
 * One message in a list, as mail apps show it: unread dot, subject (two lines at most: a headline
 * like "BKN want Williams + McCain + 1 pick" is read whole) and date, then who it's from and its
 * first words. `open`: its decision is still on the agenda.
 */
export function MessageRow({ m, open, onOpen }: { m: InboxMessage; open?: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`td-msg ${m.read ? '' : 'unread'}`} aria-haspopup="dialog" onClick={onOpen}>
      <span className="td-msg-dot" aria-hidden="true" />
      <span className="grow">
        <span className="td-msg-subj">
          {!m.read && <span className="sr-only">Unread: </span>}
          <span className="td-msg-s">{m.subject}</span>
          {open && <span className="tag warn">Decide</span>}
          <span className="td-msg-date">{shortDate(m)}</span>
        </span>
        <span className="td-msg-prev ellipsis">
          <span className="td-msg-from">{m.from}</span> · {previewText(m.body)}
        </span>
      </span>
    </button>
  );
}

/** The screen a message links to, by the name it has elsewhere ("Player page", "Rotation"), or "Open". */
const LINK_LABELS: [RegExp, string][] = [
  [/^\/player\//, 'Player page'],
  [/^\/teams\//, 'Team page'],
  [/^\/games\/\d/, 'Matchup'],
  [/^\/game\//, 'Game report'],
  [/^\/team\/tactics/, 'Tactics'],
  [/^\/team\/rotation/, 'Rotation'],
  [/^\/team\/?$/, 'Roster'],
  [/^\/office\/owner/, 'Owner'],
  [/^\/office\/resign/, 'Re-signing'],
  [/^\/office\/free-agents/, 'Free agents'],
  [/^\/office\/draft/, 'Draft board'],
  [/^\/office\/career/, 'Your career'],
  [/^\/office\/trade/, 'Trade'],
  [/^\/office\/finances/, 'Finances'],
  [/^\/office\/?$/, 'Office'],
  [/^\/league\/cup/, 'NBA Cup'],
  [/^\/league\/awards/, 'Awards'],
  [/^\/league\/playoffs/, 'Bracket'],
  [/^\/league\/news/, 'News'],
  [/^\/league\/history\?view=records/, 'Records'],
  [/^\/league\/history/, 'History'],
  [/^\/$/, 'Today'],
];
export const linkLabel = (to: string) => LINK_LABELS.find(([re]) => re.test(to))?.[1] ?? 'Open';

/** How a decision a message carried was settled, once it's off the agenda. */
function settledLine(league: League, m: InboxMessage): string {
  const me = league.userTid;
  if (m.proposal !== undefined) {
    const p = openProposals(league).find((x) => x.id === m.proposal);
    const err = p && proposalError(league, p);
    if (err) return `Can't be taken now: ${err}`;
    // gone from the open offers: taken (a trade with that team since), or turned down or lapsed
    const from = Object.values(league.teams).find((t) => m.from.startsWith(`${t.region} ${t.name}`));
    const took = from && (league.transactions ?? []).some((t) => t.kind === 'trade' && t.season === m.season && t.day >= m.day && t.tids.includes(me) && t.tids.includes(from.tid));
    return took ? `Settled: you made a deal with the ${from.name}.` : 'This offer is no longer open.';
  }
  const pid = m.sheet ?? m.tenDay;
  const p = pid !== undefined ? league.players[pid] : undefined;
  if (!p) return 'Settled.';
  if (p.tid === me) return m.sheet !== undefined ? 'Settled: he stayed with us.' : p.contract.tenDay ? 'Settled: he is on a 10-day contract.' : 'Settled: he is signed with us.';
  if (p.tid >= 0) return `Settled: he joined the ${league.teams[p.tid].name}.`;
  return 'Settled: he is a free agent.';
}

/** A message in full: subject, who and when, the text, its decision (or how it was settled), its screen, and Mark unread. */
export function MessageSheet({ league, m, onClose }: { league: League; m?: InboxMessage; onClose: () => void }) {
  const byId = useAgendaById(league);
  const simming = useStore((s) => !!s.sim);
  if (!m) return null;
  const did = decisionId(m);
  const item = did ? byId.get(did) : undefined;
  const to = m.link ? inAppPath(m.link, '') : '';
  const paras = m.body.split(/\n+/).filter((x) => x.trim());
  return (
    <Sheet open onClose={onClose} title={m.subject}>
      <div className="td-sheet col">
        <div className="td-sheet-meta">
          {m.from} · {fmtDate(m.season, m.day, { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
        <div className="td-sheet-body">
          {paras.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        {item ? (
          <div className="card flush ag-list">
            <AgendaRow item={item} />
          </div>
        ) : (
          did && <p className="td-settled">{settledLine(league, m)}</p>
        )}
        <div className="td-sheet-acts">
          {/* a decision still open links to its screen from its row */}
          {to && !item && (
            <Link to={to} className="btn sm primary" onClick={onClose}>
              {linkLabel(to)} <ArrowRight size={15} aria-hidden="true" />
            </Link>
          )}
          <button
            className="btn sm ghost"
            disabled={simming}
            onClick={() => {
              if (
                edit((l) => {
                  const x = l.inbox.find((y) => y.id === m.id);
                  if (x) x.read = false;
                })
              )
                onClose();
            }}
          >
            Mark unread
          </button>
        </div>
      </div>
    </Sheet>
  );
}
