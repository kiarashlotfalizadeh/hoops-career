// The agenda as rows (see core/league/agenda.ts): each decision with the staff's call and its quick
// choices one tap away, settled in place, and the screen with the whole decision behind the row.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronRight } from 'lucide-react';
import type { League } from '../../core/types';
import { agenda, resolveAgenda, type AgendaAction, type AgendaItem } from '../../core/league/agenda';
import { act } from '../../state/actions';
import { useStore } from '../../state/store';
import { haptic } from '../../native';
import './agenda.css';

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
  const nav = useNavigate();
  // a choice that can't be undone takes a second tap, its cost said in between
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  const armedChoice = choices.find((c) => c.label === armed);
  const head = (
    <>
      <div className="grow">
        <div className="ag-title">
          {item.required ? <span className="tag bad">Needs you</span> : (item.tone === 'bad' || item.tone === 'warn') && <span className="ag-dot" aria-hidden="true" />}{' '}
          {item.title}
        </div>
        <div className="ag-line">
          {item.line}
          {item.due && <span className="ag-due"> · {item.due}</span>}
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
