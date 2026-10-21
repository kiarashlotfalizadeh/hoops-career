// The inbox: every message, newest first (older seasons under a divider), each from a person in a
// role (senders.ts). One row of filters: All, Unread, Needs you (what the bell counts), and a folder
// for each kind of sender (the owner, the coaching staff, the front office, the league). Mark all
// read, and a message opens in a sheet (marked read as it opens) with its decision settled in place;
// `?m=<id>` opens one straight away (the digest links to its mail so).
import { Fragment, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCheck } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { edit } from '../../state/actions';
import { seasonLabel } from '../../core/constants';
import { Chips, PageHeader } from '../components/ui';
import { MessageRow, MessageSheet, decisionId, markRead, needsYou, useAgendaById } from './messages';
import { GROUP_LABEL, senderOf, type SenderGroup } from './senders';
import './today.css';

type Filter = 'all' | 'unread' | 'need' | SenderGroup;
const FILTERS: Filter[] = ['all', 'unread', 'need', 'owner', 'staff', 'office', 'league'];
const PAGE = 60;

export default function Inbox() {
  const league = useLeague();
  const simming = useStore((s) => !!s.sim);
  const [sp, setSp] = useSearchParams();
  const asked = sp.get('f') as Filter | null;
  const filter: Filter = asked && FILTERS.includes(asked) ? asked : 'all';
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
  // the last message opened stays in a filtered view (now read) until another one is opened
  const [keepId, setKeepId] = useState<number | null>(null);
  const [shown, setShown] = useState(PAGE);
  const byId = useAgendaById(league);
  const sorted = useLeagueMemo(() => [...league.inbox].sort((a, b) => b.season - a.season || b.day - a.day || b.id - a.id), [league]);
  const groups = useLeagueMemo(() => new Map(league.inbox.map((m) => [m.id, senderOf(league, m).group])), [league]);
  const unread = sorted.filter((m) => !m.read).length;
  // what the bell's badge counts: big news and decisions still open
  const need = sorted.filter((m) => needsYou(m, byId, league)).length;
  const keep = (id: number) => id === keepId;
  const list = sorted.filter((m) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !m.read || keep(m.id);
    if (filter === 'need') return needsYou(m, byId, league) || keep(m.id);
    return groups.get(m.id) === filter;
  });
  // the folders that have mail in them, each with its unread count
  const counts = new Map<SenderGroup, { all: number; unread: number }>();
  for (const m of league.inbox) {
    const g = groups.get(m.id)!;
    const c = counts.get(g) ?? { all: 0, unread: 0 };
    c.all++;
    if (!m.read) c.unread++;
    counts.set(g, c);
  }
  const open = openId !== null ? league.inbox.find((m) => m.id === openId) : undefined;

  // a link to one message opens it (once: Back doesn't open it again)
  const linked = Number(sp.get('m'));
  useEffect(() => {
    if (!linked || !league.inbox.some((m) => m.id === linked)) return;
    setOpenId(linked);
    setKeepId(linked);
    markRead(linked);
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete('m');
        return n;
      },
      { replace: true },
    );
  }, [linked, league, setSp]);

  const markAll = () =>
    edit((l) => {
      for (const m of l.inbox) m.read = true;
    });

  const options: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: `Unread${unread ? ` ${unread}` : ''}` },
    ...(need || filter === 'need' ? [{ id: 'need' as const, label: `Needs you${need ? ` ${need}` : ''}` }] : []),
    ...(['owner', 'staff', 'office', 'league'] as const)
      .filter((g) => counts.has(g) || filter === g)
      .map((g) => ({ id: g, label: `${GROUP_LABEL[g]}${counts.get(g)?.unread ? ` ${counts.get(g)!.unread}` : ''}` })),
  ];

  let lastKey = '';
  return (
    <main className="page td-inbox">
      {/* (the unread count is on its filter; the sub names what the bell counts) */}
      <PageHeader
        title="Inbox"
        sub={need ? `${need} need${need === 1 ? 's' : ''} you` : unread ? undefined : 'All caught up'}
        back
        right={
          <button className="btn sm ghost" disabled={!unread || simming} onClick={markAll}>
            <CheckCheck size={16} aria-hidden="true" /> Mark all read
          </button>
        }
      />
      <div className="td-ibar">
        <Chips<Filter> label="Show" value={filter} onChange={setFilter} options={options} />
      </div>
      {list.length === 0 ? (
        <div className="empty">{filter === 'unread' ? 'No unread messages.' : filter === 'need' ? 'Nothing needs you.' : 'No messages here yet.'}</div>
      ) : (
        <div className="list td-mail">
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
                  league={league}
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
