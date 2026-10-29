// The touchline, as Football Manager has it: the mentality and the half-court shape. Every change goes
// through the live game, from the next possession.
import type { OffShape, Tactics } from '../../core/types';
import { OFF_SHAPES } from '../../core/types';
import { MENTALITY_META, SHAPE_META, shapeOf } from '../../core/sim/tactics';
import { Chips, Help, Levels } from '../components/ui';
import type { ChangeWorth } from './useStaffCall';
import { measuredFrom, readingLine, verdictLine } from './calls';
import { clearOf } from '../../state/liveWorth';
import { withMentalityOf, withShapeOf } from './pills';

const MENTALITY_NAMES = [-2, -1, 0, 1, 2].map((m) => MENTALITY_META[m as -2].label) as unknown as readonly [string, string, string, string, string];

export function Touchline({
  tactics: t,
  planned,
  apply,
  shape = true,
  busy,
  measured,
}: {
  tactics: Tactics;
  /** What the game tipped off with: a setting put back to it takes the game's own value. */
  planned: Tactics;
  apply: (fn: (t: Tactics) => void) => void;
  /** Show the shape control (the Game plan view leaves it to Every setting). */
  shape?: boolean;
  busy?: boolean;
  /** Your last change, measured from where you made it (useStaffCall). */
  measured?: ChangeWorth | null;
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
      {measured && <ChangeLine c={measured} />}
    </div>
  );
}

/**
 * Your last change, as measured from where you made it: the rest of the game played with it and without
 * it, game for game. A verdict and its number (no real change inside its noise), how it was measured a
 * tap down.
 */
export function ChangeLine({ c }: { c: ChangeWorth }) {
  const r = c.reading;
  // (what it changed is in "Changed tonight" just under it, and in the "?")
  const who = c.call ? "Staff's call" : 'Your last change';
  const clear = !!r && clearOf(r.raw, r.se);
  return (
    <div className="lv-touch-worth small" role="status">
      <span className="dim2">{who} · </span>
      {!r ? (
        <span className="dim">measuring…</span>
      ) : (
        <>
          <b className={`num${clear ? (r.raw > 0 ? ' good' : ' bad') : ''}`}>{verdictLine(r, clear)}.</b>
          <Help title="How the staff measured it">
            <p>{c.what}.</p>
            <p>
              {measuredFrom(c.at, r.n)} {readingLine(r, 'pts')}
            </p>
          </Help>
        </>
      )}
    </div>
  );
}
