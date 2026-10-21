// The difficulty presets side by side (Settings and New League): one row each with its key numbers
// in columns under one header, picked as a radio group. What each column means is behind the "?".
import { useId, useRef, type KeyboardEvent } from 'react';
import { DIFFICULTIES, DIFFICULTY, type Difficulty } from '../../core/league/difficulty';
import { DIFFICULTY_COLUMNS } from '../settingsOptions';
import { Help } from './ui';
import './difficulty.css';

export function DifficultyPicker({ value, onChange, disabled }: { value: Difficulty; onChange: (d: Difficulty) => void; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = Math.max(0, DIFFICULTIES.indexOf(value));
  // arrow keys move the choice, as in any radio group
  const onKey = (e: KeyboardEvent, i: number) => {
    const n = DIFFICULTIES.length;
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : step ? (i + step + n) % n : -1;
    if (j < 0) return;
    e.preventDefault();
    onChange(DIFFICULTIES[j]);
    ref.current?.querySelectorAll<HTMLElement>('[role=radio]')[j]?.focus();
  };
  return (
    <div className="dif">
      <span className="dif-title">
        <span id={id}>Difficulty</span>
        <Help title="Difficulty">
          {DIFFICULTIES.map((d) => (
            <p key={d}>
              <b>{DIFFICULTY[d].label}.</b> {DIFFICULTY[d].line}
            </p>
          ))}
          {DIFFICULTY_COLUMNS.map((c) => (
            <p key={c.id} className="small">
              <b>{c.label}:</b> {c.help.charAt(0).toLowerCase() + c.help.slice(1)}
            </p>
          ))}
        </Help>
      </span>
      {/* the columns' names, once, over the figures */}
      <div className="dif-row dif-head" aria-hidden="true">
        <span />
        {DIFFICULTY_COLUMNS.map((c) => (
          <span key={c.id} className="dif-col">
            {c.label}
          </span>
        ))}
      </div>
      <div role="radiogroup" aria-labelledby={id} ref={ref} className="dif-list">
        {DIFFICULTIES.map((d, i) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={value === d}
            aria-label={`${DIFFICULTY[d].label}: ${DIFFICULTY_COLUMNS.map((c) => `${c.label} ${c.value(d)}`).join(', ')}`}
            tabIndex={i === current ? 0 : -1}
            disabled={disabled}
            className={`dif-row dif-opt ${value === d ? 'on' : ''}`}
            onClick={() => onChange(d)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span className="dif-name">
              <span className="dif-dot" aria-hidden="true" />
              {DIFFICULTY[d].label}
            </span>
            {DIFFICULTY_COLUMNS.map((c) => (
              <span key={c.id} className="dif-v">
                {c.value(d)}
              </span>
            ))}
          </button>
        ))}
      </div>
    </div>
  );
}
