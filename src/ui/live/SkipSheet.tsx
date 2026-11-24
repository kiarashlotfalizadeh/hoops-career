// The Skip ahead sheet's choices (see skip.ts): the end of the period, halftime, clutch time, the final.
// A row a choice: where it stops in bold, what that means in a sentence under it (the body face: mono
// is for figures). All but the final stop sooner for one of your starters hurt (useLiveGame.skip), and
// the sheet says so; with your subs on, it says the staff makes them along the way.
import { FastForward } from 'lucide-react';
import type { SkipChoice, SkipTo } from './skip';

export function SkipSheet({ choices, onPick, manualSubs }: { choices: SkipChoice[]; onPick: (to: SkipTo) => void; manualSubs?: boolean }) {
  // the final apart from the stops, under the note: a skip to a stop is never a slip away from the whole game simmed
  const stops = choices.filter((o) => o.id !== 'end');
  const end = choices.find((o) => o.id === 'end');
  const row = (o: SkipChoice) => (
    <button type="button" key={o.id} className="lv-sk-opt" onClick={() => onPick(o.id)}>
      <span className="lv-sk-tx">
        <span className="lv-sk-l">{o.label}</span>
        <span className="lv-sk-s">{o.sub}</span>
      </span>
      <FastForward size={18} className="lv-sk-c" aria-hidden="true" />
    </button>
  );
  return (
    <div className="lv-sk">
      {stops.length > 0 && <div className="lv-sk-list card flush list">{stops.map(row)}</div>}
      <p className="lv-sk-note">
        An injury to one of your starters stops the skip.
        {manualSubs && ' The staff makes your subs until it stops.'}
      </p>
      {end && (
        <div className="lv-sk-list lv-sk-end card flush list" style={{ marginTop: 18 }}>
          {row(end)}
        </div>
      )}
    </div>
  );
}
