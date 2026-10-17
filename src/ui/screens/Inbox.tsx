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
import { PageHeader, Sheet } from '../components/ui';
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

/** An AI GM's trade offer comes from "<team> GM": the trade icon; anyone else unknown, a letter. */
const iconFor = (m: InboxMessage) => SENDER_ICON[m.from] ?? (m.proposal !== undefined ? ArrowLeftRight : Mail);

/** A message's lines run together for a one-line preview. */
const previewText = (body: string) => body.replace(/([^.!?:])\n+/g, '$1 · ').replace(/\n+/g, ' ');

function setRead(id: number, read: boolean) {
  useStore.getState().mutate((l) => {
    const m = l.inbox.find((x) => x.id === id);
    if (m) m.read = read;
  });
}

export default function Inbox() {
  const league = useLeague();
  const [filter, setFilter] = useQueryParam<'all' | 'unread'>('f', 'all', ['all', 'unread']);
  const [openId, setOpenId] = useState<number | null>(null);
  // the last message opened stays in the Unread view (now read) until another one is opened
  const [keepId, setKeepId] = useState<number | null>(null);
  const sorted = useLeagueMemo(() => [...league.inbox].sort((a, b) => b.season - a.season || b.day - a.day || b.id - a.id), [league]);
  const unread = sorted.filter((m) => !m.read).length;
  const list = filter === 'unread' ? sorted.filter((m) => !m.read || m.id === keepId) : sorted;
  const open = openId !== null ? league.inbox.find((m) => m.id === openId) : undefined;

  const markAll = () =>
    useStore.getState().mutate((l) => {
      for (const m of l.inbox) m.read = true;
    });

  const show = (m: InboxMessage) => {
    setOpenId(m.id);
    setKeepId(m.id);
    if (!m.read) setRead(m.id, true);
  };

  let lastKey = '';
  return (
    <main className="page lg-page">
      <PageHeader title="Inbox" sub={unread ? `${unread} unread` : 'All caught up'} back />
      <div className="lg-bar lg-inbox-bar">
        <div className="chips" role="group" aria-label="Messages">
          <button className={`chip lg-chip-xs ${filter === 'all' ? 'on' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All <span className="lg-count num">{sorted.length}</span>
          </button>
          <button className={`chip lg-chip-xs ${filter === 'unread' ? 'on' : ''}`} aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>
            Unread {unread > 0 && <span className="lg-count num lg-count-new">{unread}</span>}
          </button>
        </div>
        <button className="btn sm ghost" disabled={!unread} onClick={markAll}>
          <CheckCheck size={16} /> Mark all read
        </button>
      </div>
      {list.length === 0 ? (
        <div className="card lg-blank">
          <MailOpen size={26} aria-hidden="true" />
          <p>{filter === 'unread' ? 'No unread messages.' : 'Your inbox is empty.'}</p>
        </div>
      ) : (
        <div className="card flush">
          {list.map((m) => {
            const key = `${m.season}:${m.day}`;
            const header = key !== lastKey;
            lastKey = key;
            const Icon = iconFor(m);
            const tone = m.tone ? TONE_COLOR[m.tone] : undefined;
            return (
              <Fragment key={m.id}>
                {header && (
                  <div className="list-divider">
                    {fmtDate(m.season, m.day, { weekday: 'short', month: 'short', day: 'numeric' })}
                    {m.season !== league.season ? ` · ${seasonLabel(m.season)}` : ''}
                  </div>
                )}
                <div className={`lg-msg ${m.read ? '' : 'unread'}`} style={tone ? { ['--tone' as string]: tone } : undefined}>
                  <button type="button" className="lg-msg-top" aria-haspopup="dialog" onClick={() => show(m)}>
                    <span className="ic" aria-hidden="true">
                      <Icon size={15} />
                    </span>
                    <span className="lg-msg-t">
                      <span className="from">{m.from}</span>
                      <span className="subj">{m.subject}</span>
                      <span className="prev">{previewText(m.body)}</span>
                    </span>
                    <span className="when">{!m.read && <span className="lg-dot" role="img" aria-label="Unread" />}</span>
                  </button>
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
      <MessageSheet league={league} m={open} onClose={() => setOpenId(null)} />
    </main>
  );
}

/** A message in full, with what can be done from it: open its screen, take or review an offer, match an offer sheet, mark it unread. */
function MessageSheet({ league, m, onClose }: { league: League; m?: InboxMessage; onClose: () => void }) {
  const nav = useNavigate();
  if (!m) return null;
  const Icon = iconFor(m);
  const tone = m.tone ? TONE_COLOR[m.tone] : undefined;
  const paras = m.body.split(/\n+/).filter((x) => x.trim());
  const to = m.link ? inAppPath(normalizeLink(m.link), '') : '';
  return (
    <Sheet open onClose={onClose} label={m.subject}>
      <div className="lg-msg-body" style={tone ? { ['--tone' as string]: tone } : undefined}>
        <div className="lg-msg-head">
          <span className="ic" aria-hidden="true">
            <Icon size={16} />
          </span>
          <span>
            <span className="from">{m.from}</span>
            <span className="date">{fmtDate(m.season, m.day, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </span>
        </div>
        <h2 className="lg-msg-subj">{m.subject}</h2>
        {paras.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {m.proposal !== undefined && <OfferStatus league={league} id={m.proposal} />}
        {m.sheet !== undefined && <SheetStatus league={league} pid={m.sheet} />}
        {m.tenDay !== undefined && <TenDayMessage league={league} pid={m.tenDay} />}
        <div className="lg-msg-actions">
          {m.proposal !== undefined ? (
            <OfferButtons league={league} id={m.proposal} onReview={() => nav(`/trade?proposal=${m.proposal}`)} />
          ) : m.sheet !== undefined ? (
            <SheetButtons league={league} pid={m.sheet} />
          ) : (
            to && (
              <button className="btn primary" onClick={() => nav(to)}>
                Open <ArrowRight size={16} />
              </button>
            )
          )}
          <button
            className="btn ghost"
            onClick={() => {
              setRead(m.id, false);
              onClose();
            }}
          >
            <Mail size={16} /> Mark unread
          </button>
        </div>
      </div>
    </Sheet>
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
      <button className="btn good" disabled={!!err} onClick={accept}>
        <Check size={16} /> Accept
      </button>
      <button className="btn primary" disabled={!!err} onClick={onReview}>
        Review <ArrowRight size={16} />
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
      <button className="btn good" disabled={!canMatch} onClick={match}>
        <Check size={16} /> Match
      </button>
      <button className="btn" disabled={!open} onClick={() => setLetGo(true)}>
        Let him go
      </button>
      {p && <LetGoSheet league={league} p={p} open={letGo} onClose={() => setLetGo(false)} />}
    </>
  );
}
