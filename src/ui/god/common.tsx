// What the god-mode editor's sheets share: when edits can be saved, how they're applied, the
// fields, and the list of what stops an edit or what rule it bends.
import type { ReactNode } from 'react';
import { AlertTriangle, Ban } from 'lucide-react';
import type { League } from '../../core/types';
import { FREE_AGENT } from '../../core/types';
import { fmtHeight } from '../../core/ratings';
import { GOD_LIMITS, type EditCheck } from '../../core/league/godMode';
import { liveInProgress } from '../../state/live';
import { useStore } from '../../state/store';
import '../league/league.css';
import './god.css';

/**
 * Why god-mode edits can't be saved right now, or null: not while a sim is running (it would be
 * playing on the league being edited), nor while a live game is in progress (it replays from its
 * journal with the rosters it tipped off with).
 */
export function useEditBlock(league: League): string | null {
  // a sim, or a one-shot job such as opening night or training camp
  const busy = useStore((s) => s.sim?.label);
  if (busy) return busy === 'Simulating' ? 'The simulation is running: edits wait for it to stop.' : `The league is busy with ${busy.toLowerCase()}: edits wait for it to finish.`;
  if (liveInProgress(league)) return 'Your live game is in progress: edits wait until it is over, so it plays on as it tipped off.';
  return null;
}

/**
 * Apply a god-mode change to the open league: all of it, or (if it throws) none of it, with a toast
 * saying so. Returns whether it worked.
 */
export const applyEdit = (fn: (l: League) => void): boolean => useStore.getState().attempt('The edit', fn);

/** A labelled field: the label names the control inside it. */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="god-field">
      <span className="tiny dim upper bold">{label}</span>
      {children}
      {hint && <span className="tiny dim">{hint}</span>}
    </label>
  );
}

/** A drop-down field (the League screens' select). */
export function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <Field label={label}>
      <select className="lg-select" value={String(value)} onChange={(e) => onChange(options.find((o) => String(o.id) === e.target.value)!.id)}>
        {options.map((o) => (
          <option key={String(o.id)} value={String(o.id)}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Free agency, then every team by city. */
export function teamOptions(league: League, withFreeAgency = true): { id: number; label: string }[] {
  const teams = [...league.teams].sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name)).map((t) => ({ id: t.tid, label: `${t.region} ${t.name}` }));
  return withFreeAgency ? [{ id: FREE_AGENT, label: 'Free agent' }, ...teams] : teams;
}

/** Every height an edit can set, as 6'7". */
export const HEIGHTS = Array.from({ length: GOD_LIMITS.heightIn[1] - GOD_LIMITS.heightIn[0] + 1 }, (_, i) => {
  const inches = GOD_LIMITS.heightIn[0] + i;
  return { id: inches, label: fmtHeight(inches) };
});

/** What stops the edit (it can't be saved while there's any), the save block, then the rules it bends. */
export function Problems({ check, block }: { check: EditCheck; block?: string | null }) {
  const stop = [...(block ? [block] : []), ...check.errors];
  if (!stop.length && !check.warnings.length) return null;
  return (
    <div className="col small" style={{ gap: 4 }} role="status">
      {stop.slice(0, 2).map((e) => (
        <div key={e} className="row top bad" style={{ gap: 6 }}>
          <Ban size={15} style={{ flex: 'none', marginTop: 2 }} aria-hidden="true" />
          <span>{e}</span>
        </div>
      ))}
      {check.warnings.map((w) => (
        <div key={w} className="row top warn" style={{ gap: 6 }}>
          <AlertTriangle size={15} style={{ flex: 'none', marginTop: 2 }} aria-hidden="true" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}

/** Save and Cancel, pinned to the bottom of the sheet, with what stands in the way above them. */
export function Foot({
  check,
  block,
  onCancel,
  onSave,
  saveLabel = 'Save',
  dirty = true,
}: {
  check: EditCheck;
  block?: string | null;
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  dirty?: boolean;
}) {
  return (
    <div className="god-foot">
      <Problems check={check} block={block} />
      <div className="row">
        <button className="btn grow" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary grow" disabled={!dirty || !!block || check.errors.length > 0} onClick={onSave}>
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

/** A whole number from a text field (NaN when it isn't one, which the checks turn into a message). */
export const whole = (s: string) => (/^-?\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);
