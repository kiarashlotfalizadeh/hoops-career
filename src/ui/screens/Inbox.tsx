import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Briefcase, CheckCheck, ClipboardList, Crown, Landmark, Mail, MailOpen, Stethoscope, Telescope, TrendingUp, type LucideIcon } from 'lucide-react';
import type { InboxMessage } from '../../core/types';
import { useLeague, useStore } from '../../state/store';
import { fmtDate } from '../../core/league/helpers';
import { seasonLabel } from '../../core/constants';
import { Card, Empty, PageHeader } from '../components/ui';
import { normalizeLink, useQueryParam } from '../league/shared';

const SENDER_ICON: Record<string, LucideIcon> = {
  Owner: Crown,
  'Assistant Coach': ClipboardList,
  'Assistant GM': Briefcase,
  'Medical Staff': Stethoscope,
  'League Office': Landmark,
  'Player Development': TrendingUp,
  'Scouting Department': Telescope,
};

const TONE_COLOR: Record<NonNullable<InboxMessage['tone']>, string | undefined> = {
  good: 'var(--good)',
  bad: 'var(--bad)',
  alert: 'var(--warn)',
  neutral: undefined,
};

function setRead(id: number, read: boolean) {
  useStore.getState().mutate((l) => {
    const m = l.inbox.find((x) => x.id === id);
    if (m) m.read = read;
  });
}

export default function Inbox() {
  const league = useLeague();
  const v = useStore((s) => s.v);
  const nav = useNavigate();
  const [filter, setFilter] = useQueryParam<'all' | 'unread'>('f', 'all', ['all', 'unread']);
  const [openId, setOpenId] = useState<number | null>(null);
  const sorted = useMemo(
    () => [...league.inbox].sort((a, b) => b.season - a.season || b.day - a.day || b.id - a.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, v],
  );
  const unread = sorted.filter((m) => !m.read).length;
  // Keep a just-read message visible in the Unread view until another one is opened.
  const list = filter === 'unread' ? sorted.filter((m) => !m.read || m.id === openId) : sorted;

  const markAll = () =>
    useStore.getState().mutate((l) => {
      for (const m of l.inbox) m.read = true;
    });

  const toggle = (m: InboxMessage) => {
    if (openId === m.id) {
      setOpenId(null);
      return;
    }
    setOpenId(m.id);
    if (!m.read) setRead(m.id, true);
  };

  let lastKey = '';
  return (
    <main className="page">
      <PageHeader
        title="Inbox"
        sub={unread ? `${unread} unread message${unread === 1 ? '' : 's'}` : 'All caught up'}
        back
        right={
          <button className="btn sm ghost" disabled={!unread} onClick={markAll}>
            <CheckCheck size={16} /> Mark all read
          </button>
        }
      />
      <div className="chips">
        <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
          All <span className="tiny dim">{sorted.length}</span>
        </button>
        <button className={`chip ${filter === 'unread' ? 'on' : ''}`} onClick={() => setFilter('unread')}>
          Unread {unread > 0 && <span className="tiny" style={{ color: 'var(--accent-text)' }}>{unread}</span>}
        </button>
      </div>
      {list.length === 0 ? (
        <Card>
          <Empty>
            <MailOpen size={28} style={{ marginBottom: 6 }} />
            <div>{filter === 'unread' ? 'No unread messages.' : 'Your inbox is empty.'}</div>
          </Empty>
        </Card>
      ) : (
        <Card className="flush lg-flat">
          {list.map((m) => {
            const key = `${m.season}:${m.day}`;
            const header = key !== lastKey;
            lastKey = key;
            const Icon = SENDER_ICON[m.from] ?? Mail;
            const open = openId === m.id;
            const tone = m.tone ? TONE_COLOR[m.tone] : undefined;
            const paras = m.body.split(/\n+/).filter((x) => x.trim());
            return (
              <Fragment key={m.id}>
                {header && (
                  <div className="lg-date-h">
                    {fmtDate(m.season, m.day, { weekday: 'short', month: 'short', day: 'numeric' })}
                    {m.season !== league.season ? ` · ${seasonLabel(m.season)}` : ''}
                  </div>
                )}
                <div
                  className={`lg-msg ${m.read ? '' : 'unread'} ${open ? 'open' : ''}`}
                  style={{ ['--tone' as string]: tone }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={open}
                  onClick={() => toggle(m)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggle(m);
                    }
                  }}
                >
                  <div className="lg-msg-top">
                    <span className="ic">
                      <Icon size={16} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="from">{m.from}</div>
                      <div className="subj">{m.subject}</div>
                      {!open && <div className="prev">{m.body.replace(/\n+/g, ' ')}</div>}
                    </div>
                    <span className="when">
                      {!m.read && <span className="lg-dot" aria-label="Unread" />}
                    </span>
                  </div>
                  {open && (
                    <div className="lg-msg-body" onClick={(e) => e.stopPropagation()}>
                      {paras.map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                      <div className="row" style={{ gap: 8, marginTop: 4 }}>
                        {m.link && (
                          <button className="btn sm primary" onClick={() => nav(normalizeLink(m.link!))}>
                            Open <ArrowRight size={15} />
                          </button>
                        )}
                        <button
                          className="btn sm ghost"
                          onClick={() => {
                            setRead(m.id, false);
                            setOpenId(null);
                          }}
                        >
                          <Mail size={15} /> Mark unread
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </Fragment>
            );
          })}
        </Card>
      )}
    </main>
  );
}
