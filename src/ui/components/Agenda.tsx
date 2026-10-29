// The agenda as rows (see core/league/agenda.ts): each decision with the staff's call and its quick
// choices one tap away, settled in place, and the screen with the whole decision behind the row. A
// staff call whose number is still to measure is measured as its row shows (see today/staffPlan.ts),
// with how far the staff has got under its line.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronRight } from 'lucide-react';
import type { League } from '../../core/types';
import { agenda, resolveAgenda, type AgendaAction, type AgendaItem } from '../../core/league/agenda';
import { act, touch } from '../../state/actions';
import { markOffersSeen, openProposals } from '../../core/league/proposals';
import { useLeague, useStore } from '../../state/store';
import { haptic } from '../../native';
import { leaveToStaff, useCallWorth } from '../today/staffPlan';
import { More } from './ui';
import './agenda.css';

/** The choice waiting on its second tap, if one is (the Continue bar won't run past it: see App.tsx). */
export const pendingConfirm: { label: string | null } = { label: null };

/** Carry out an agenda choice, all or nothing, and say how it went. True when it went through. */
export function runAgenda(label: string, a: AgendaAction): boolean {
  let r = { ok: false, text: '' };
  if (!act(label, (l) => void (r = resolveAgenda(l, a)))) return false;
  haptic();
  if (r.text) useStore.getState().toast(r.text, r.ok ? 'good' : 'bad');
  return r.ok;
}

export function AgendaRow({ item }: { item: AgendaItem }) {
  const choices = [...(item.suggestion ? [item.suggestion] : []), ...(item.choices ?? [])];
  // (the league can't change while a sim runs: act would only say so)
  const simming = useStore((s) => !!s.sim);
  // a staff call's number, measured as the row shows: how far it has got
  const measuring = useCallWorth(useLeague(), item);
  const nav = useNavigate();
  // a choice that can't be undone takes a second tap, its cost said in between
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  // a trade offer shown as a row has been seen: its date stands as it reads (see markOffersSeen)
  useEffect(() => {
    const l = useStore.getState().league;
    if (item.kind === 'tradeOffer' && !simming && l && openProposals(l).some((p) => !p.seen)) touch(markOffersSeen);
  }, [item.id, item.kind, simming]);
  const armedChoice = choices.find((c) => c.label === armed);
  useEffect(() => {
    if (!armed) return;
    pendingConfirm.label = armed;
    return () => {
      if (pendingConfirm.label === armed) pendingConfirm.label = null;
    };
  }, [armed]);
  const head = (
    <>
      <div className="grow">
        <div className="ag-title">
          {item.required ? <span className="tag bad">Needs you</span> : (item.tone === 'bad' || item.tone === 'warn') && <span className="ag-dot" aria-hidden="true" />}{' '}
          {item.title}
        </div>
        <div className="ag-line">
          {/* (when it lapses first: a long line is cut on Today, a date never) */}
          {item.due && <span className="ag-due">{item.due} · </span>}
          {item.line}
          {measuring !== null && !simming && (
            <span className="ag-due" role="status">
              {' '}
              · {measuring > 0 ? `${Math.round(measuring * 100)}% measured` : 'Measuring'}
            </span>
          )}
        </div>
      </div>
      {item.to && !item.steps && <ChevronRight size={18} className="dim" aria-hidden="true" />}
    </>
  );
  return (
    <div className={`ag-row tone-${item.tone}`}>
      {item.steps ? (
        // a checklist: the steps are the links (the next one leads), the headline only says where it stands
        <>
          <div className="ag-head">{head}</div>
          <ol className="ag-steps" aria-label="Steps">
            {item.steps.map((s) => (
              <li key={s.title}>
                <Link to={s.to} className={`ag-step ${s.done ? 'done' : ''} ${s.next ? 'next' : ''}`}>
                  <span className="ag-check" aria-hidden="true">
                    {s.done && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="grow">
                    {s.title}
                    <span className="sr-only">{s.done ? ' (done)' : s.next ? ' (next)' : ''}</span>
                  </span>
                  {!s.done && <ChevronRight size={16} className="dim" aria-hidden="true" />}
                </Link>
              </li>
            ))}
          </ol>
        </>
      ) : item.to ? (
        <Link to={item.to} className="ag-head">
          {head}
        </Link>
      ) : (
        <div className="ag-head">{head}</div>
      )}
      {/* the staff's reasons and the rest of its numbers, a tap down */}
      {item.detail && (
        <More label="Why">
          <div className="ag-detail">
            {item.detail.split('\n').map((x, i) => (
              <p key={i}>{x}</p>
            ))}
          </div>
        </More>
      )}
      {choices.length > 0 && (
        <div className="ag-acts">
          {choices.map((c, i) => (
            <button
              key={c.label}
              className={`btn xs ${armed === c.label ? 'danger' : i === 0 && item.suggestion ? 'primary' : item.steps ? 'text' : ''}`}
              disabled={!!c.blocked || simming}
              title={c.blocked}
              onClick={() => {
                if (c.confirm && armed !== c.label) return setArmed(c.label);
                setArmed(null);
                // (the staff's plan for a series is measured first: see staffPlan.ts)
                if (c.action.kind === 'call' && c.action.call.kind === 'staffPlan' && !c.action.call.items) return void leaveToStaff(item.title, c.action.call);
                // (a look for a trade: the answer is made on its screen)
                if (runAgenda(item.title, c.action) && c.to) nav(c.to);
              }}
            >
              {armed === c.label ? `Confirm: ${c.label}` : c.label}
            </button>
          ))}
        </div>
      )}
      {armedChoice?.confirm && (
        <div className="ag-why" role="status">
          {armedChoice.confirm} Tap again to confirm.
        </div>
      )}
      {choices.some((c) => c.blocked) && <div className="ag-why">{[...new Set(choices.map((c) => c.blocked).filter(Boolean))].join(' ')}</div>}
    </div>
  );
}

/** The agenda, required items first. `only`: just those (the Continue bar's sheet). */
export function AgendaList({ league, only }: { league: League; only?: 'required' }) {
  const items = agenda(league)
    .filter((i) => !only || i.required)
    .sort((a, b) => Number(b.required) - Number(a.required));
  if (!items.length) return null;
  return (
    <div className="card flush ag-list" role="list" aria-label="Agenda">
      {items.map((i) => (
        <div role="listitem" key={i.id}>
          <AgendaRow item={i} />
        </div>
      ))}
    </div>
  );
}
