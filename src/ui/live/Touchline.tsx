// The touchline, as Football Manager has it: the coach's three tactics one tap away (each with the
// team's familiarity with it, so a switch to something unpracticed is visibly a gamble), the
// mentality, and the half-court shape with how well the team knows each. Every change goes through
// the live game, from the next possession.
import type { OffShape, Tactics, Team } from '../../core/types';
import { OFF_SHAPES } from '../../core/types';
import { MENTALITY_META, SHAPE_META, shapeOf } from '../../core/sim/tactics';
import { SLOT_LETTERS, slotName } from '../../core/sim/slots';
import { famLabel } from '../../core/sim/familiarity';
import { Chips, Help, Levels } from '../components/ui';
import { FAM_OK, OPT, famSuffix, withMentalityOf, withShapeOf, type LiveSlot } from './familiar';
import type { ChangeWorth } from './useStaffCall';
import { readingLine } from './calls';
import { clearOf } from '../../state/liveWorth';

/** A familiarity figure's tone: fluid reads good, learning a warning, new or awkward bad. */
export const famTone = (v: number) => (v >= FAM_OK ? 'good' : v >= 75 ? '' : v >= 55 ? 'warn' : 'bad');

const MENTALITY_NAMES = [-2, -1, 0, 1, 2].map((m) => MENTALITY_META[m as -2].label) as unknown as readonly [string, string, string, string, string];

export function Touchline({
  team,
  slots,
  cur,
  onSwitch,
  tactics: t,
  planned,
  apply,
  famOf,
  shape = true,
  busy,
  measured,
}: {
  team: Team;
  slots: LiveSlot[];
  /** The slot in play. */
  cur: number;
  onSwitch: (i: number) => void;
  tactics: Tactics;
  /** What the game tipped off with: a setting put back to it takes the game's own value. */
  planned: Tactics;
  apply: (fn: (t: Tactics) => void) => void;
  /** How well the team knows a discrete option ('shape:fiveOut'). */
  famOf: (key: string) => number;
  /** Show the shape control (the Game plan view leaves it to Every setting). */
  shape?: boolean;
  busy?: boolean;
  /** Your last change, measured from where you made it (useStaffCall). */
  measured?: ChangeWorth | null;
}) {
  const m = t.mentality ?? 0;
  const filled = slots.filter((s) => s.tactics).length;
  return (
    <div className="lv-touch">
      <div className="lv-touch-h">
        <span className="over">Tactics</span>
        <Help title="Tactics A, B and C">
          <p>
            Your three tactics from the Tactics screen. A switch plays the whole tactic from the next possession, with tonight&apos;s game plan on top and your orders on their
            players kept.
          </p>
          <p>
            The figure is how familiar the team is with it: practice and games build it. Below 95% the team plays it a step slow: worse shots and more turnovers on offense, more
            open looks given up on defense. A tactic the team hasn&apos;t drilled is a gamble.
          </p>
        </Help>
      </div>
      <div className="lv-slots" role="group" aria-label="Your tactics">
        {slots.map((s) => {
          const on = s.i === cur;
          const name = slotName(team, s.i);
          return (
            <button
              key={s.i}
              className={`lv-slot ${on ? 'on' : ''}`}
              aria-pressed={on}
              disabled={busy || !s.tactics || on}
              onClick={() => onSwitch(s.i)}
              aria-label={s.tactics ? `Tactic ${SLOT_LETTERS[s.i]}, ${name}: ${Math.round(s.fam)}% familiar${on ? ', in play' : ''}` : `Tactic ${SLOT_LETTERS[s.i]}: empty`}
            >
              <span className="lv-slot-top">
                <span className="lv-slot-l" aria-hidden="true">
                  {SLOT_LETTERS[s.i]}
                </span>
                <span className="lv-slot-n">{s.tactics ? name : 'Empty'}</span>
              </span>
              {s.tactics && (
                <span className={`lv-slot-f num ${famTone(s.fam)}`}>
                  {Math.round(s.fam)}% · {famLabel(s.fam)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {filled < 2 && <div className="tiny dim">A Tactic B or C is set up between games: then you can switch to it here.</div>}
      <Levels
        label="Mentality"
        value={(m + 2) * 25}
        names={MENTALITY_NAMES}
        disabled={busy}
        onChange={(v) => apply((x) => withMentalityOf(x, Math.round(v / 25) - 2, planned))}
        help={MENTALITY_META[m].help}
      />
      {shape && (
        <div className="lv-tp-field">
          <div className="slider-label lv-tp-label">
            Shape
            <Help title="Shape">
              <p>{SHAPE_META[shapeOf(t.offense)].help}</p>
              <p>The figure beside a shape is how familiar the team is with it: one it hasn&apos;t drilled costs a step on every half-court trip.</p>
            </Help>
          </div>
          <Chips
            label="Shape"
            value={shapeOf(t.offense)}
            disabled={busy}
            onChange={(x: OffShape) => apply((tt) => withShapeOf(tt, x, planned))}
            options={OFF_SHAPES.map((k) => ({ id: k, label: `${SHAPE_META[k].short}${famSuffix(famOf(OPT.shape(k)))}` }))}
          />
        </div>
      )}
      {measured && <ChangeLine c={measured} />}
    </div>
  );
}

/**
 * Your last change, as measured from where you made it: the rest of the game played with it and without
 * it, game for game. Clear of its noise, its number; inside it, too close to say (with the reading).
 */
export function ChangeLine({ c }: { c: ChangeWorth }) {
  const r = c.reading;
  const who = c.call ? "The staff's call" : 'Your change';
  if (!r)
    return (
      <div className="lv-touch-worth small dim" role="status">
        {who} ({c.what}): measuring from {c.at}…
      </div>
    );
  const clear = clearOf(r.raw, r.se);
  return (
    <div className="lv-touch-worth small" role="status">
      <span className="dim2">
        {who} ({c.what}), from {c.at}:{' '}
      </span>
      {clear ? (
        <b className={`num ${r.raw > 0 ? 'good' : 'bad'}`}>{readingLine(r, 'pts')}</b>
      ) : (
        <span className="num">
          too close to say ({r.pts > 0 ? '+' : r.pts < 0 ? '−' : ''}
          {Math.abs(r.pts).toFixed(1)}, ±{r.band.toFixed(1)})
        </span>
      )}
      <span className="dim">. {r.n} replays each way.</span>
    </div>
  );
}
