// The Skip ahead sheet's choices (see skip.ts): the end of the period, halftime, clutch time, the final.
import { FastForward } from 'lucide-react';
import type { SkipChoice, SkipTo } from './skip';

export function SkipSheet({ choices, onPick }: { choices: SkipChoice[]; onPick: (to: SkipTo) => void }) {
  return (
    <div className="lv-skip">
      {choices.map((o) => (
        <button key={o.id} className="flow-opt" onClick={() => onPick(o.id)}>
          <span className="fo-l">{o.label}</span>
          <span className="fo-s">{o.sub}</span>
          <FastForward size={18} className="fo-c" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
