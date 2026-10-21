// The glossary: the game's jargon in plain words. <Term id="drop"> marks a word in a line and opens
// its entry; GlossarySheet is the whole list, searchable (Today and Settings open it).
import { useMemo, useState, type ReactNode } from 'react';
import { GLOSSARY, glossaryEntry, type GlossaryGroup } from '../glossary';
import { Sheet } from './ui';
import './ovrKey.css';

export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const e = glossaryEntry(id);
  if (!e) return <>{children}</>;
  return (
    <>
      <button
        type="button"
        className="term"
        onClick={(ev) => (ev.stopPropagation(), setOpen(true))}
        aria-label={`${typeof children === 'string' ? children : e.term}: what it means`}
      >
        {children ?? e.term}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={e.term}>
        <p className="help-body" style={{ color: 'var(--text-2)', margin: 0 }}>
          {e.text}
        </p>
      </Sheet>
    </>
  );
}

const GROUPS: GlossaryGroup[] = ['Offense', 'Defense', 'Numbers', 'Contracts', 'Roster', 'The game'];

export function GlossarySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? GLOSSARY.filter((g) => g.term.toLowerCase().includes(s) || g.text.toLowerCase().includes(s)) : GLOSSARY;
  }, [q]);
  return (
    <Sheet open={open} onClose={onClose} title="Glossary">
      <input
        className="input sheet-filter"
        type="search"
        placeholder="Search: drop, MLE, eFG..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search the glossary"
      />
      <div className="gl-list">
        {GROUPS.map((grp) => {
          const rows = hits.filter((g) => g.group === grp);
          if (!rows.length) return null;
          return (
            <section key={grp} className="gl-grp">
              <h3 className="gl-h">{grp}</h3>
              <dl className="card flush list gl-terms">
                {rows.map((g) => (
                  <div key={g.id} className="gl-term">
                    <dt>{g.term}</dt>
                    <dd>{g.text}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
        {!hits.length && <div className="empty">Nothing matches “{q}”.</div>}
      </div>
    </Sheet>
  );
}
