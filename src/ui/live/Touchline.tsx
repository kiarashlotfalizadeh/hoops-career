// The touchline, as Football Manager has it: the mentality and the half-court shape. Every change goes
// through the live game, from the next possession.
import type { OffShape, Tactics } from '../../core/types';
import { OFF_SHAPES } from '../../core/types';
import { MENTALITY_META, SHAPE_META, shapeOf } from '../../core/sim/tactics';
import { Chips, Help, Levels } from '../components/ui';
import { withMentalityOf, withShapeOf } from './pills';

const MENTALITY_NAMES = [-2, -1, 0, 1, 2].map((m) => MENTALITY_META[m as -2].label) as unknown as readonly [string, string, string, string, string];

export function Touchline({
  tactics: t,
  planned,
  apply,
  shape = true,
  busy,
}: {
  tactics: Tactics;
  /** What the game tipped off with: a setting put back to it takes the game's own value. */
  planned: Tactics;
  apply: (fn: (t: Tactics) => void) => void;
  /** Show the shape control (the Game plan view leaves it to Every setting). */
  shape?: boolean;
  busy?: boolean;
}) {
  const m = t.mentality ?? 0;
  return (
    <div className="lv-touch">
      {/* (the label with its "?": the scale itself names each step, so no line under it) */}
      <div className="slider-label lv-tp-label">
        Mentality
        <Help title="Mentality">
          {([-2, -1, 0, 1, 2] as const).map((k) => (
            <p key={k}>
              <b>{MENTALITY_META[k].label}:</b> {MENTALITY_META[k].help}
            </p>
          ))}
        </Help>
      </div>
      <Levels label="Mentality" value={(m + 2) * 25} names={MENTALITY_NAMES} disabled={busy} onChange={(v) => apply((x) => withMentalityOf(x, Math.round(v / 25) - 2, planned))} />
      {shape && (
        <div className="lv-tp-field">
          <div className="slider-label lv-tp-label">
            Shape
            <Help title="Shape">
              <p>{SHAPE_META[shapeOf(t.offense)].help}</p>
            </Help>
          </div>
          <Chips
            label="Shape"
            value={shapeOf(t.offense)}
            disabled={busy}
            onChange={(x: OffShape) => apply((tt) => withShapeOf(tt, x, planned))}
            options={OFF_SHAPES.map((k) => ({ id: k, label: SHAPE_META[k].short }))}
          />
        </div>
      )}
    </div>
  );
}
