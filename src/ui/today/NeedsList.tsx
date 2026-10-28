// Needs you as rows (see needs.ts for what's in it and in what order), for Today's section and the
// bell's sheet: each decision as its agenda row, settled in place (the staff's calls first, AI
// teams' offers as one row), then the deadline's last week, mail that needs him and a backup due.
// The bell opens it over any screen, with the inbox a row away. And the calls alone, for the digest
// and the Play options: over the sims that would pass them by.
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { InboxMessage, League } from '../../core/types';
import type { AgendaItem } from '../../core/league/agenda';
import { fmtDate } from '../../core/league/helpers';
import { useLeague } from '../../state/store';
import { AgendaRow } from '../components/Agenda';
import { BackupRow } from '../components/Backup';
import { Sheet } from '../components/ui';
import { deadlineText } from './NextGame';
import { previewText } from './messages';
import { useNeedsYou, type NeedsYou } from './needs';
import { senderOf } from './senders';
import './today.css';

/** Every row of Needs you, in order. `openMail`: what a tap on a message does (Today opens it in place; the bell's sheet in the inbox). */
export function needRows(league: League, needs: NeedsYou, openMail: (m: InboxMessage) => void): ReactNode[] {
  const { items, mail, deadline, backup } = needs;
  return [
    ...items.map((i) => (
      <div role="listitem" className="td-need" key={i.id}>
        <AgendaRow item={i} />
      </div>
    )),
    ...(deadline !== null
      ? [
          <div role="listitem" className="td-need" key="deadline">
            <NeedRow
              to="/office/trade"
              tone="warn"
              title={deadlineText(deadline)}
              line={deadline === 0 ? 'Deals have to be done by the end of the day.' : `The last day for deals: ${fmtDate(league.season, league.tradeDeadlineDay)}.`}
            />
          </div>,
        ]
      : []),
    ...mail.map((m) => (
      <div role="listitem" className="td-need" key={`mail:${m.id}`}>
        <MailRow league={league} m={m} onOpen={() => openMail(m)} />
      </div>
    )),
    ...(backup
      ? [
          <div role="listitem" className="td-need" key="backup">
            <BackupRow league={league} />
          </div>,
        ]
      : []),
  ];
}

/** The bell's sheet: all of Needs you, in its order, and the inbox under it. A link in it leaves the sheet (the top bar closes it on the way). */
export function NeedsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const league = useLeague();
  const needs = useNeedsYou(league);
  const nav = useNavigate();
  const unread = league.inbox.filter((m) => !m.read).length;
  return (
    <Sheet open={open} onClose={onClose} title="Needs you">
      <div className="col td-bell">
        {needs.rows > 0 ? (
          <div className="td-needs" role="list" aria-label="Needs you">
            {needRows(league, needs, (m) => nav(`/inbox?m=${m.id}`))}
          </div>
        ) : (
          <div className="empty">Nothing needs you right now.</div>
        )}
        <div className="card flush td-more">
          <Link to="/inbox" className="td-mrow">
            <span className="grow td-mrow-k">Inbox</span>
            {unread > 0 && <span className="td-mrow-v">{unread} unread</span>}
            <ChevronRight size={18} className="dim" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * The staff's calls open now, each with its one-tap answer, under a "Needs you" head: shown over what
 * would pass them by (the digest after a sim, the Play options before one). `picks`: what the staff
 * did with the calls a sim ran past (the digest's), a line each under them.
 */
export function OpenCalls({ calls, picks = [] }: { calls: AgendaItem[]; picks?: string[] }) {
  if (!calls.length && !picks.length) return null;
  return (
    <section className="dg-sec">
      <div className="dg-sec-h">
        <h3 className="dg-h">{calls.length ? 'Needs you' : "The staff's calls"}</h3>
      </div>
      {calls.length > 0 && (
        <div className="card flush ag-list" role="list" aria-label="Needs you">
          {calls.map((i) => (
            <div role="listitem" key={i.id}>
              <AgendaRow item={i} />
            </div>
          ))}
        </div>
      )}
      {picks.length > 0 && (
        <div className="card flush dg-list">
          {picks.map((x, i) => (
            // (two readings can say the same words)
            <div key={`${i}:${x}`} className="dg-line">
              {x}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** A row of Needs you that isn't a decision or advice (the deadline, the owner): drawn as the agenda's rows are. */
export function NeedRow({ to, tone, title, line }: { to: string; tone: 'warn' | 'bad'; title: string; line: string }) {
  return (
    <div className={`ag-row tone-${tone}`}>
      <Link to={to} className="ag-head">
        <div className="grow">
          <div className="ag-title">
            <span className="ag-dot" aria-hidden="true" /> {title}
          </div>
          <div className="ag-line">{line}</div>
        </div>
        <ChevronRight size={18} className="dim" aria-hidden="true" />
      </Link>
    </div>
  );
}

/** Mail that needs him, as a row of Needs you: the subject, then who and the first words. */
function MailRow({ league, m, onOpen }: { league: League; m: InboxMessage; onOpen: () => void }) {
  return (
    <div className="ag-row tone-brand">
      <button type="button" className="ag-head td-mailrow" aria-haspopup="dialog" onClick={onOpen}>
        <div className="grow">
          <div className="ag-title">
            <span className="ag-dot" aria-hidden="true" />
            <span className="sr-only">Unread: </span> {m.subject}
          </div>
          <div className="ag-line td-one">
            {senderOf(league, m).name} · {previewText(m.body)}
          </div>
        </div>
        <ChevronRight size={18} className="dim" aria-hidden="true" />
      </button>
    </div>
  );
}
