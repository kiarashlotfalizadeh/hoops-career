// Tactics → System's way into Team Instructions, beside the board: the three phases of a trip as three
// rows, each saying how the team plays it now, each opening the surface on that phase. Over them, how
// far the settings have moved from the style (with Put back).
import { ChevronRight } from 'lucide-react';
import type { Tactics } from '../../../core/types';
import { COVERAGE_META, PRESS_META, SCHEME_META, SHAPE_META, glassLevel, GLASS_LEVELS, levelName, shapeOf } from '../../../core/sim/tactics';
import { Section } from '../../components/ui';
import { PlaybookLine } from '../PlaybookLine';
import { PHASES, type Phase } from './TeamInstructions';

/** A level's name beside its setting's: "Balanced tempo", but never "Up-tempo tempo" or "Pressure pressure". */
const named = (name: string, of: string) => (name === 'Balanced' ? `Balanced ${of}` : name === 'Pressure' ? 'Pressure on the ball' : name);

/** How the team plays a phase now, in its controls' own words. */
export function phaseLine(t: Tactics, phase: Phase): string {
  const o = t.offense;
  const d = t.defense;
  if (phase === 'ball') return [SHAPE_META[shapeOf(o)].label, named(levelName('pace', o.pace), 'tempo'), named(levelName('threePoint', o.threePoint), 'shots')].join(' · ');
  if (phase === 'trans')
    return [named(levelName('transition', o.transition), 'after a stop'), named(GLASS_LEVELS[glassLevel(t)].label, 'on the glass'), PRESS_META[d.press].label].join(' · ');
  return [SCHEME_META[d.scheme].label, `${COVERAGE_META[d.pnr].label} coverage`, named(levelName('pressure', d.pressure), 'pressure')].join(' · ');
}

export function InstructionsCard({ t, onOpen }: { t: Tactics; onOpen: (p: Phase) => void }) {
  return (
    <Section title="Team instructions">
      <PlaybookLine />
      <div className="card flush list ti-card">
        {PHASES.map((p) => (
          <button key={p.id} className="listrow clickable ti-card-r" aria-haspopup="dialog" onClick={() => onOpen(p.id)}>
            <span className="grow">
              <span className="lr-name">{p.label}</span>
              <span className="lr-meta">{phaseLine(t, p.id)}</span>
            </span>
            <ChevronRight size={16} className="dim" aria-hidden="true" />
          </button>
        ))}
      </div>
    </Section>
  );
}
