// The tactics board, Football Manager's way with a basketball court: the starting five (the rotation's
// first five) where the formation puts them, in possession by the offensive shape, out of possession
// by the defensive scheme. Each plate is a player with his role at that end and how well he suits it
// (one figure: his stars of five, as his sheet shows them); a tap opens his player sheet. The board's
// heading is its end, the switch between them. Over the court, the formation's picker: the shape, with
// each shape's fit for this roster, or the scheme (its one home; the coverage is on Instructions).
import { useMemo, type CSSProperties } from 'react';
import { useLeague, useLeagueMemo } from '../../state/store';
import type { DefScheme, OffShape, Player, Tactics } from '../../core/types';
import { DEF_ROLES, OFF_SHAPES } from '../../core/types';
import { ROLE_META, archetype } from '../../core/ratings';
import { ALL_SCHEMES, DEF_ROLE_META, SCHEME_META, SHAPE_META, defRoleOf, shapeOf } from '../../core/sim/tactics';
import { betterFit, defRoleFits, roleFits, roleScale, roleStars, type RoleScale } from '../../core/analysis/system';
import { fitRoster, shapeFits } from '../../core/ai/coachAI';
import { composites } from '../../core/ratings';
import { FIT, leanOf, leanTone, type Lean } from '../../core/analysis/staffWords';
import { rosterNames } from '../stats';
import { Help, Section } from '../components/ui';
import { Term } from '../components/Glossary';
import { PickRow } from './Pick';
import { HeadSwitch } from './HeadSwitch';
import { tweak } from './edit';
import { BOARD_H, DEF_SPOTS, OFF_SPOTS, place, type BoardPlayer } from './formation';

export type BoardSide = 'in' | 'out';

const NO_ORDER: number[] = [];

/** A player's place on the board: his roles at both ends, and how well he suits each. */
interface Row {
  p: Player;
  off: keyof typeof ROLE_META;
  def: (typeof DEF_ROLES)[number];
  /** His stars in each, against the league's rotation players at that role (roleStars). */
  offStars: number;
  defStars: number;
  /** A role at each end that suits him clearly better (miscast: two stars or more), if there is one. */
  offBetter: keyof typeof ROLE_META | null;
  defBetter: (typeof DEF_ROLES)[number] | null;
}

function rowOf(t: Tactics, p: Player, scale: RoleScale): Row {
  const of = roleFits(p);
  const df = defRoleFits(p);
  const off = t.offense.roles[p.pid] ?? archetype(p.ratings).role;
  const def = defRoleOf(t.defense, p.pid);
  return {
    p,
    off,
    def,
    offStars: roleStars(scale.off[off], of[off]),
    defStars: roleStars(scale.def[def], df[def]),
    offBetter: betterFit(scale.off, of, off),
    defBetter: betterFit(scale.def, df, def),
  };
}

/** A shape's fit against 4-Out, 1-In as a lean (shapeFits reads in tenths of a point a game). */
const shapeLean = (v: number): Lean => leanOf(Math.round(v) / 10);

const TIER: Record<Lean, number> = { gain: 0, even: 1, cost: 2 };

/** First sentence of a line of help. */
const first = (s: string) => s.split(/(?<=\.)\s/)[0];

export function Board({
  t,
  players,
  five,
  side,
  setSide,
  onPick,
}: {
  t: Tactics;
  /** The whole roster (the shapes' fits), and the five on the board. */
  players: Player[];
  five: Player[];
  side: BoardSide;
  setSide: (s: BoardSide) => void;
  /** Opens a player's sheet. */
  onPick: (pid: number) => void;
}) {
  const league = useLeague();
  const team = league.teams[league.userTid];
  const nameOf = useMemo(() => rosterNames(players), [players]);
  const order = team.rotation?.order ?? NO_ORDER;
  const scale = useLeagueMemo(() => roleScale(league), [league]);
  const rows = five.map((p) => rowOf(t, p, scale));
  const inPoss = side === 'in';
  const shape = shapeOf(t.offense);
  const spots = inPoss ? OFF_SPOTS[shape] : DEF_SPOTS[t.defense.scheme];
  const placed = place(
    spots,
    rows.map((r): BoardPlayer => {
      const c = composites(r.p.ratings);
      return { pid: r.p.pid, hgt: r.p.ratings.hgt, role: inPoss ? r.off : r.def, handle: c.pnrHandle, shoot: c.c3 };
    }),
  );
  const fits = useLeagueMemo(() => shapeFits(fitRoster(players), t, order), [players, t, order]);
  return (
    <Section
      className="tx-boardsec"
      // the board's end is its head (a row of its own once stacked a fourth row of controls over the board)
      title={
        <div className="tx-boardsec-h">
          <h3 className="sr-only">Tactics board</h3>
          <HeadSwitch
            value={side}
            onChange={setSide}
            label="Phase on the board"
            options={[
              { id: 'in', label: 'In possession' },
              { id: 'out', label: 'Out of possession' },
            ]}
          />
        </div>
      }
      right={
        <Help title="Tactics board">
          <p>
            Your starting five, where your tactic puts them. In possession by your <Term id="shape">shape</Term>, out of it by your scheme.
          </p>
          <p>
            Each plays a <Term id="roles">role</Term> at each end. The ★ figure rates his fit out of five, against others in that role.
          </p>
          <p>An amber edge means another role suits him two stars better. Tap a player to set his roles.</p>
        </Help>
      }
    >
      {/* the board as one printed object: the formation's picker over the floor */}
      <div className="card flush tx-boardcard">
        <div className="tx-formation">
          {inPoss ? (
            <PickRow<OffShape>
              label="Shape"
              value={shape}
              onChange={(s) =>
                tweak((tt) => {
                  if (s === 'fourOut') delete tt.offense.shape;
                  else tt.offense.shape = s;
                })
              }
              help={<>Where your five stand in the half court, with any playbook. Each read is the staff&apos;s, for this roster against 4-Out, 1-In.</>}
              // (better fits first, the list's own order inside each: the order says no more than the words)
              options={[...OFF_SHAPES]
                .sort((a, b) => TIER[shapeLean(fits[a])] - TIER[shapeLean(fits[b])])
                .map((s) => ({
                  id: s,
                  label: SHAPE_META[s].label,
                  sub: (
                    <>
                      {s !== 'fourOut' && (
                        <>
                          <b className={leanTone(shapeLean(fits[s]))}>{FIT[shapeLean(fits[s])]}</b> ·{' '}
                        </>
                      )}
                      {first(SHAPE_META[s].help)}
                      <span className="tx-shape-gb">
                        <span>
                          <b className="good">+</b> {SHAPE_META[s].good}
                        </span>
                        <span>
                          <b className="bad">−</b> {SHAPE_META[s].bad}
                        </span>
                      </span>
                    </>
                  ),
                }))}
              note={
                shape === 'fourOut' ? undefined : (
                  <>
                    Staff&apos;s read: <b className={leanTone(shapeLean(fits[shape]))}>{FIT[shapeLean(fits[shape])].toLowerCase()}</b>
                    {shapeLean(fits[shape]) === 'even' ? ' to' : ' than'} 4-Out, 1-In
                  </>
                )
              }
            />
          ) : (
            <PickRow<DefScheme>
              label="Scheme"
              value={t.defense.scheme}
              onChange={(x) => tweak((tt) => void (tt.defense.scheme = x))}
              help={<>Your base defense, and where your five stand. A game plan&apos;s junk defense picks who the chasers guard.</>}
              options={ALL_SCHEMES.map((k) => ({ id: k, label: SCHEME_META[k].label, sub: SCHEME_META[k].help }))}
            />
          )}
        </div>

        <div className={`tx-floor tx-board ${inPoss ? 'in' : 'out'}`} role="list" aria-label={inPoss ? 'Your five in possession' : 'Your five out of possession'}>
          {/* a maple half court: the boards running baseline to half court, your colour in the key and
            the centre circle, the lines in white */}
          <svg className="tx-floor-court" viewBox={`0 0 100 ${BOARD_H}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <pattern id="tx-planks" width="7" height={BOARD_H} patternUnits="userSpaceOnUse">
                <rect width="7" height={BOARD_H} className="tx-floor-wood" />
                <rect x="3.5" width="3.5" height={BOARD_H} className="tx-floor-wood2" />
                <path d="M 3.5 0 V 84 M 7 0 V 84 M 0 31 H 3.5 M 3.5 62 H 7 M 0 76 H 3.5 M 3.5 18 H 7" className="tx-floor-seam" />
              </pattern>
            </defs>
            <rect x="0" y="0" width="100" height={BOARD_H} fill="url(#tx-planks)" />
            <rect x="33" y="0" width="34" height="27" className="tx-floor-paint" />
            <circle cx="50" cy="94" r="12" className="tx-floor-paint" />
            <g className="tx-floor-line" fill="none">
              <rect x="33" y="0" width="34" height="27" />
              <path d="M 6 0 L 6 14 A 44 44 0 0 0 94 14 L 94 0" />
              <path d="M 41 27 A 9 9 0 0 0 59 27" />
              <path d="M 41 27 A 9 9 0 0 1 59 27" strokeDasharray="1.6 1.4" />
              <path d="M 45 5 A 5 5 0 0 0 55 5" />
              <circle cx="50" cy="94" r="12" />
              <path d="M 0 84 H 100" />
            </g>
            <path d="M 44 2.6 H 56" className="tx-floor-board" />
            <circle cx="50" cy="4.6" r="1.6" className="tx-floor-rim" fill="none" />
          </svg>
          {rows.map((r) => {
            const spot = placed.get(r.p.pid);
            if (!spot) return null;
            const role = inPoss ? ROLE_META[r.off].label : DEF_ROLE_META[r.def].short;
            const fit = inPoss ? r.offStars : r.defStars;
            const better = inPoss ? r.offBetter : r.defBetter;
            const off = !!better;
            const bestName = !better ? '' : inPoss ? ROLE_META[better as keyof typeof ROLE_META].label : DEF_ROLE_META[better as (typeof DEF_ROLES)[number]].label;
            return (
              <button
                key={r.p.pid}
                role="listitem"
                className={`tx-floor-p${off ? ' off' : ''}`}
                style={{ '--x': `${spot.x}%`, '--y': `${(spot.y / BOARD_H) * 100}%` } as CSSProperties}
                onClick={() => onPick(r.p.pid)}
                aria-label={`${nameOf(r.p.pid)}, ${spot.name}: ${role}, ${fit} of 5 for it${off ? `; suits ${bestName} better` : ''}`}
              >
                <span className="tx-floor-n">
                  <span className="ellipsis">{nameOf(r.p.pid)}</span>
                </span>
                <span className="tx-floor-r">
                  <span className="ellipsis">{role}</span>
                  <span className="tx-floor-s num" aria-hidden="true">
                    {fit}
                    <i>★</i>
                  </span>
                </span>
                {r.p.injury && <span className="tx-floor-best">Out</span>}
              </button>
            );
          })}
        </div>
      </div>
    </Section>
  );
}
