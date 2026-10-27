// A block's heading that is also its switch: the board's end (In possession / Out of possession),
// Instructions' phase, Analysis' view. The one that's on reads as the heading, the others beside it
// in a quieter ink, so the screen keeps one row of tabs and one boxed switch above what it's for
// (DESIGN: the board's heading is its in/out-of-possession switch).
import type { ReactNode } from 'react';

export function HeadSwitch<T extends string>({
  value,
  options,
  onChange,
  label,
  right,
}: {
  value: T;
  /** Each choice's name, and a small figure under it (how well the team knows a phase). */
  options: { id: T; label: string; sub?: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  /** The block's Help, at the right of the heading. */
  right?: ReactNode;
}) {
  return (
    <div className="tx-hsw">
      <div className="tx-hsw-opts" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} className={`tx-hsw-b${o.id === value ? ' on' : ''}`} aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
            <span className="tx-hsw-n">{o.label}</span>
            {o.sub !== undefined && <span className="tx-hsw-v">{o.sub}</span>}
          </button>
        ))}
      </div>
      {right}
    </div>
  );
}
