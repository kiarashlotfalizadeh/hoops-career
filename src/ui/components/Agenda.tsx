// The agenda as rows (see core/league/agenda.ts): each decision with the staff's call and its quick
// choices one tap away, settled in place, and the screen with the whole decision behind the row.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League } from '../../core/types';
import { agenda, resolveAgenda, type AgendaAction, type AgendaItem } from '../../core/league/agenda';
import { act } from '../../state/actions';
import { useStore } from '../../state/store';
import { haptic } from '../../native';
import './agenda.css';

/** Carry out an agenda choice, all or nothing, and say how it went. */
export function runAgenda(label: string, a: AgendaAction) {
  let r = { ok: false, text: '' };
  if (!act(label, (l) => void (r = resolveAgenda(l, a)))) return;
  haptic();
  if (r.text) useStore.getState().toast(r.text, r.ok ? 'good' : 'bad');
}

export function AgendaRow({ item }: { item: AgendaItem }) {
  const choices = [...(item.suggestion ? [item.suggestion] : []), ...(item.choices ?? [])];
  // (the league can't change while a sim runs: act would only say so)
  const simming = useStore((s) => !!s.sim);
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
          {item.required && <span className="tag bad">Needs you</span>} {item.title}
        </div>
        <div className="ag-line">
          {item.line}
          {item.due && <span className="ag-due"> · {item.due}</span>}
        </div>
      </div>
      {item.to && <ChevronRight size={18} className="dim" aria-hidden="true" />}
    </>
  );
  return (
    <div className={`ag-row tone-${item.tone}`}>
      {item.to ? (
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
              className={`btn xs ${armed === c.label ? 'danger' : i === 0 && item.suggestion ? 'primary' : c.tone === 'good' ? 'good' : ''}`}
              disabled={!!c.blocked || simming}
              title={c.blocked}
              onClick={() => {
                if (c.confirm && armed !== c.label) return setArmed(c.label);
                setArmed(null);
                runAgenda(item.title, c.action);
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
