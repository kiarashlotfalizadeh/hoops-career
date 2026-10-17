import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  ArrowRight,
  Briefcase,
  Check,
  CheckCheck,
  ClipboardList,
  Crown,
  Handshake,
  Landmark,
  Mail,
  MailOpen,
  Newspaper,
  Stethoscope,
  Telescope,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import type { InboxMessage, League } from '../../core/types';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { fmtDate } from '../../core/league/helpers';
import { acceptProposal, openProposals, proposalError } from '../../core/league/proposals';
import { seasonLabel } from '../../core/constants';
import { Card, Empty, PageHeader } from '../components/ui';
import { normalizeLink, useQueryParam } from '../league/shared';
import { inAppPath } from '../nav';
import { continueDraft } from '../../core/league/season';
import { sheetDecisionBlocked, userDecideSheet } from '../../core/league/rfa';
import { liveInProgress } from '../../state/live';
import { TenDayMessage } from '../office/TenDayPanel';
import { LetGoSheet } from '../office/RfaPanel';

const SENDER_ICON: Record<string, LucideIcon> = {
  Owner: Crown,
  'Assistant Coach': ClipboardList,
  'Assistant GM': Briefcase,
  'Medical Staff': Stethoscope,
  'League Office': Landmark,
  'Player Development': TrendingUp,
  'Scouting Department': Telescope,
  'Media Relations': Newspaper,
  'Your agent': Handshake,
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
  const nav = useNavigate();
  const [filter, setFilter] = useQueryParam<'all' | 'unread'>('f', 'all', ['all', 'unread']);
  const [openId, setOpenId] = useState<number | null>(null);
  const sorted = useLeagueMemo(() => [...league.inbox].sort((a, b) => b.season - a.season || b.day - a.day || b.id - a.id), [league]);
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
        <button className={`chip ${filter === 'all' ? 'on' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          All <span className="tiny dim">{sorted.length}</span>
        </button>
        <button className={`chip ${filter === 'unread' ? 'on' : ''}`} aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>
          Unread{' '}
          {unread > 0 && (
            <span className="tiny" style={{ color: 'var(--accent-text)' }}>
              {unread}
            </span>
          )}
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
            // (an AI GM's trade offer comes from "<team> GM")
            const Icon = SENDER_ICON[m.from] ?? (m.proposal !== undefined ? ArrowLeftRight : Mail);
            const open = openId === m.id;
            const tone = m.tone ? TONE_COLOR[m.tone] : undefined;
            const paras = m.body.split(/\n+/).filter((x) => x.trim());
            const to = m.link ? inAppPath(normalizeLink(m.link), '') : '';
            return (
              <Fragment key={m.id}>
                {header && (
                  <div className="lg-date-h">
                    {fmtDate(m.season, m.day, { weekday: 'short', month: 'short', day: 'numeric' })}
                    {m.season !== league.season ? ` · ${seasonLabel(m.season)}` : ''}
                  </div>
                )}
                {/* the header toggles; the open body holds its own buttons, so the card itself isn't one */}
                <div className={`lg-msg ${m.read ? '' : 'unread'} ${open ? 'open' : ''}`} style={{ ['--tone' as string]: tone }}>
                  <button type="button" className="lg-msg-top" aria-expanded={open} onClick={() => toggle(m)}>
                    <span className="ic">
                      <Icon size={16} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="from">{m.from}</span>
                      <span className="subj">{m.subject}</span>
                      {!open && <span className="prev">{m.body.replace(/([^.!?:])\n+/g, '$1 · ').replace(/\n+/g, ' ')}</span>}
                    </span>
                    <span className="when">{!m.read && <span className="lg-dot" role="img" aria-label="Unread" />}</span>
                  </button>
                  {open && (
                    <div className="lg-msg-body">
                      {paras.map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                      {m.proposal !== undefined && <OfferStatus league={league} id={m.proposal} />}
                      {m.sheet !== undefined && <SheetStatus league={league} pid={m.sheet} />}
                      {m.tenDay !== undefined && <TenDayMessage league={league} pid={m.tenDay} />}
                      <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
                        {m.proposal !== undefined ? (
                          <OfferButtons league={league} id={m.proposal} onReview={() => nav(`/trade?proposal=${m.proposal}`)} />
                        ) : m.sheet !== undefined ? (
                          <SheetButtons league={league} pid={m.sheet} />
                        ) : (
                          to && (
                            <button className="btn sm primary" onClick={() => nav(to)}>
                              Open <ArrowRight size={15} />
                            </button>
                          )
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

/** Why an AI team's offer can't be taken now (closed, expired, rules), or null while it stands. */
function useOfferError(league: League, id: number): string | null {
  return useLeagueMemo(() => {
    const p = openProposals(league).find((x) => x.id === id);
    if (!p) return 'This offer is closed: it was taken, turned down or withdrawn, or it expired.';
    // as in the front office: the players in tonight's game stay with the team they're playing for
    if (liveInProgress(league)) return 'Finish your live game first: trades wait until the game in progress is over.';
    return proposalError(league, p);
  }, [league, id]);
}

function OfferStatus({ league, id }: { league: League; id: number }) {
  const err = useOfferError(league, id);
  return err ? <p className="small warn">{err}</p> : null;
}

/** An AI team's offer, from its message: take it here, or review it in the trade builder. */
function OfferButtons({ league, id, onReview }: { league: League; id: number; onReview: () => void }) {
  const err = useOfferError(league, id);
  const accept = () => {
    let r = { ok: false, reason: '' };
    useStore.getState().mutate((l) => {
      r = acceptProposal(l, id);
      // a pick traded on draft night: the draft moves on to the next team that picks (or yours)
      if (r.ok && l.phase === 'draft') continueDraft(l);
    });
    useStore.getState().toast(r.reason, r.ok ? 'good' : 'bad');
  };
  return (
    <>
      <button className="btn sm good" disabled={!!err} onClick={accept}>
        <Check size={15} /> Accept
      </button>
      <button className="btn sm primary" disabled={!!err} onClick={onReview}>
        Review <ArrowRight size={15} />
      </button>
    </>
  );
}

/** Where an offer sheet on the user's restricted free agent stands: decided (and how), or what keeps him from matching it. */
function SheetStatus({ league, pid }: { league: League; pid: number }) {
  const p = league.players[pid];
  const why = sheetDecisionBlocked(league, pid, true);
  if (!why) return null;
  if (!sheetDecisionBlocked(league, pid, false)) return <p className="small warn">{why}</p>;
  const where = p && p.tid >= 0 ? (p.tid === league.userTid ? 'he stayed with us' : `he joined the ${league.teams[p.tid].region} ${league.teams[p.tid].name}`) : '';
  return <p className="small dim">{where ? `This offer sheet has been decided: ${where}.` : why}</p>;
}

/** An offer sheet on the user's restricted free agent, from its message: match it or let him go (confirmed first) while it stands. */
function SheetButtons({ league, pid }: { league: League; pid: number }) {
  const [letGo, setLetGo] = useState(false);
  const p = league.players[pid];
  const open = !sheetDecisionBlocked(league, pid, false);
  const canMatch = !sheetDecisionBlocked(league, pid, true);
  const match = () => {
    let r = { ok: false, reason: '' };
    useStore.getState().mutate((l) => {
      r = userDecideSheet(l, pid, true);
    });
    useStore.getState().toast(r.reason, r.ok ? 'good' : 'bad');
  };
  return (
    <>
      <button className="btn sm good" disabled={!canMatch} onClick={match}>
        <Check size={15} /> Match
      </button>
      <button className="btn sm" disabled={!open} onClick={() => setLetGo(true)}>
        Let him go
      </button>
      {p && <LetGoSheet league={league} p={p} open={letGo} onClose={() => setLetGo(false)} />}
    </>
  );
}
