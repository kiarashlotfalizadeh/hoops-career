// The Skip ahead sheet's choices (see skip.ts): the end of the period, halftime, clutch time, the final.
// A row a choice: where it stops in bold, what that means in a sentence under it (the body face: mono
// is for figures). All but the final stop sooner for one of your starters hurt (useLiveGame.skip), and
// the sheet says so; with your subs on, it says the staff makes them along the way.
import { FastForward } from 'lucide-react';
import type { SkipChoice, SkipTo } from './skip';

export function SkipSheet({ choices, onPick, manualSubs }: { choices: SkipChoice[]; onPick: (to: SkipTo) => void; manualSubs?: boolean }) {
  return (
    <div className="lv-sk">
      <div className="lv-sk-list card flush list">
        {choices.map((o) => (
          <button type="button" key={o.id} className="lv-sk-opt" onClick={() => onPick(o.id)}>
            <span className="lv-sk-tx">
              <span className="lv-sk-l">{o.label}</span>
              <span className="lv-sk-s">{o.sub}</span>
            </span>
            <FastForward size={18} className="lv-sk-c" aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className="lv-sk-note">
        An injury to one of your starters stops the skip. Sim to final plays on.
        {manualSubs && ' The staff makes your subs until it stops.'}
      </p>
    </div>
  );
}
