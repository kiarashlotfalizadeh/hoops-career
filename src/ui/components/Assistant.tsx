// The assistant's cards (see core/ai/assistant.ts): one voice for the staff's advice on every screen.
// A screen shows the cards for its own area; Today shows the most urgent of all of them.
import { Link } from 'react-router-dom';
import { ChevronRight, Lightbulb, AlertTriangle, ThumbsUp } from 'lucide-react';
import type { League } from '../../core/types';
import { applyFix, assistantFeed, type AssistantArea, type AssistantCard } from '../../core/ai/assistant';
import { act } from '../../state/actions';
import { useLeagueMemo, useStore } from '../../state/store';
import { haptic } from '../../native';
import './agenda.css';

const ICON = { issue: AlertTriangle, tip: Lightbulb, good: ThumbsUp };
const TONE = { issue: 'warn', tip: 'info', good: 'good' } as const;

export function AssistantRow({ card }: { card: AssistantCard }) {
  const Icon = ICON[card.tone];
  const fix = card.fix;
  const head = (
    <>
      <div className="grow">
        <div className="ag-title">
          <Icon size={15} aria-hidden="true" className={card.tone === 'issue' ? 'warn' : card.tone === 'good' ? 'good' : 'accent-text'} />
          {card.title}
        </div>
        <div className="ag-line">{card.line}</div>
      </div>
      {card.to && <ChevronRight size={18} className="dim" aria-hidden="true" />}
    </>
  );
  return (
    <div className={`ag-row as-row tone-${TONE[card.tone]}`}>
      {card.to ? (
        <Link to={card.to} className="ag-head">
          {head}
        </Link>
      ) : (
        <div className="ag-head">{head}</div>
      )}
      {fix && (
        <div className="ag-acts">
          <button
            className="btn xs primary"
            onClick={() => {
              let said = '';
              if (!act(card.title, (l) => void (said = applyFix(l, fix)))) return;
              haptic();
              useStore.getState().toast(said, 'good');
            }}
          >
            {fix.label}
          </button>
        </div>
      )}
    </div>
  );
}

/** The staff's cards for `areas` (all of them when omitted), the first `max`. Nothing when there's nothing to say. */
export function AssistantCards({ league, areas, max = 3 }: { league: League; areas?: AssistantArea[]; max?: number }) {
  const feed = useLeagueMemo(() => assistantFeed(league), [league]);
  const cards = feed.filter((c) => !areas || areas.includes(c.area)).slice(0, max);
  if (!cards.length) return null;
  return (
    <div className="card flush ag-list" role="list" aria-label="From your staff">
      {cards.map((c) => (
        <div role="listitem" key={c.id}>
          <AssistantRow card={c} />
        </div>
      ))}
    </div>
  );
}
