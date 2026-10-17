// A setting with many choices as one row, its name and the current choice, that opens a sheet of the
// choices (a go-to player, an after-timeout play): a short page instead of a wall of chips.
import { useState, type ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Sheet } from '../components/ui';
import '../screens/tactics.css';

export interface PickOption<T> {
  id: T;
  label: string;
  /** A line under the choice in the sheet. */
  sub?: ReactNode;
  /** A heading the choice sits under in the sheet ("Sets"). */
  group?: string;
}

export function PickRow<T extends string | number>({
  label,
  value,
  options,
  onChange,
  help,
  note,
}: {
  label: string;
  value: T;
  options: PickOption<T>[];
  onChange: (v: T) => void;
  /** What the setting does, at the top of the sheet. */
  help?: ReactNode;
  /** A line under the row (what the current choice does). */
  note?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.id === value);
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  return (
    <div className="tx-pick">
      <button className="tx-pickrow" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="tx-pickrow-l">{label}</span>
        <span className="tx-pickrow-v ellipsis">{cur?.label ?? '—'}</span>
        <ChevronRight size={16} className="dim" aria-hidden="true" />
      </button>
      {note && <div className="tx-note">{note}</div>}
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        {help && <div className="tx-sheet-lead">{help}</div>}
        {groups.map((g) => (
          <div key={g} className="tx-optgroup" role="group" aria-label={g || label}>
            {g && <div className="over">{g}</div>}
            <div className="card flush list">
              {options
                .filter((o) => (o.group ?? '') === g)
                .map((o) => {
                  const on = o.id === value;
                  return (
                    <button
                      key={String(o.id)}
                      className={`tx-opt ${on ? 'on' : ''}`}
                      aria-pressed={on}
                      onClick={() => {
                        onChange(o.id);
                        setOpen(false);
                      }}
                    >
                      <span className="grow">
                        <span className="tx-opt-l">{o.label}</span>
                        {o.sub && <span className="tx-opt-s">{o.sub}</span>}
                      </span>
                      {on && <Check size={18} className="tx-opt-c" aria-hidden="true" />}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </Sheet>
    </div>
  );
}
