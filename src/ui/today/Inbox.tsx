// The inbox: every message, newest first (older seasons under a divider). All or Unread, Mark all
// read, and a message opens in a sheet (marked read as it opens) with its decision settled in place.
import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCheck } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { edit } from '../../state/actions';
import { seasonLabel } from '../../core/constants';
import { PageHeader, Segmented } from '../components/ui';
import { MessageRow, MessageSheet, decisionId, markRead, useAgendaById } from './messages';
import './today.css';

type Filter = 'all' | 'unread';
const PAGE = 60;

export default function Inbox() {
  const league = useLeague();
  const simming = useStore((s) => !!s.sim);
  const [sp, setSp] = useSearchParams();
  const filter: Filter = sp.get('f') === 'unread' ? 'unread' : 'all';
  const setFilter = (f: Filter) =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (f === 'all') n.delete('f');
        else n.set('f', f);
        return n;
      },
      { replace: true },
    );
  const [openId, setOpenId] = useState<number | null>(null);
  // the last message opened stays in the Unread view (now read) until another one is opened
  const [keepId, setKeepId] = useState<number | null>(null);
  const [shown, setShown] = useState(PAGE);
  const byId = useAgendaById(league);
  const sorted = useLeagueMemo(() => [...league.inbox].sort((a, b) => b.season - a.season || b.day - a.day || b.id - a.id), [league]);
  const unread = sorted.filter((m) => !m.read).length;
  const list = filter === 'unread' ? sorted.filter((m) => !m.read || m.id === keepId) : sorted;
  const open = openId !== null ? league.inbox.find((m) => m.id === openId) : undefined;

  const markAll = () =>
    edit((l) => {
      for (const m of l.inbox) m.read = true;
    });

  let lastKey = '';
  return (
    <main className="page td-inbox">
      {/* (the unread count is on its filter) */}
      <PageHeader title="Inbox" sub={unread ? undefined : 'All caught up'} back />
      <div className="td-ibar">
        <Segmented<Filter>
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: 'All' },
            { id: 'unread', label: `Unread${unread ? ` ${unread}` : ''}` },
          ]}
        />
        <button className="btn sm ghost" disabled={!unread || simming} onClick={markAll}>
          <CheckCheck size={16} aria-hidden="true" /> Mark all read
        </button>
      </div>
      {list.length === 0 ? (
        <div className="empty">{filter === 'unread' ? 'No unread messages.' : 'No messages yet.'}</div>
      ) : (
        <div className="card flush list">
          {list.slice(0, shown).map((m) => {
            // older seasons under a divider of their own
            const key = String(m.season);
            const header = key !== lastKey && m.season !== league.season;
            lastKey = key;
            const d = decisionId(m);
            return (
              <Fragment key={m.id}>
                {header && <div className="list-divider">{seasonLabel(m.season)} season</div>}
                <MessageRow
                  m={m}
                  open={!!d && byId.has(d)}
                  onOpen={() => {
                    setOpenId(m.id);
                    setKeepId(m.id);
                    if (!m.read) markRead(m.id);
                  }}
                />
              </Fragment>
            );
          })}
        </div>
      )}
      {list.length > shown && (
        <button className="btn sm ghost td-more" onClick={() => setShown((n) => n + PAGE)}>
          Older messages ({list.length - shown})
        </button>
      )}
      <MessageSheet league={league} m={open} onClose={() => setOpenId(null)} />
    </main>
  );
}
