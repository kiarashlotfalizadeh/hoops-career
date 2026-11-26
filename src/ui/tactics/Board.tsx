// The tactics board, Football Manager's way with a basketball court: the starting five (the rotation's
// first five) where the formation puts them, with the ball by the offensive shape, without it by the
// defensive scheme. Each plate is a player with his role at that end and how well he suits it
// (one figure: his stars of five, as his sheet shows them); a tap opens his player sheet. The board's
// heading is its end, the switch between them. Over the court, the way into Team Instructions on that
// end's phase (tactics/instructions): the formation's name, a tap to set it and how the team plays.
import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useLeague, useLeagueMemo } from '../../state/store';
import { SlidersHorizontal } from 'lucide-react';
import type { Player, Tactics } from '../../core/types';
import { DEF_ROLES } from '../../core/types';
import { ROLE_META, archetype } from '../../core/ratings';
import { DEF_ROLE_META, SCHEME_META, SHAPE_META, defRoleOf, shapeOf } from '../../core/sim/tactics';
import { betterFit, defRoleFits, roleFits, roleScale, roleStars, type RoleScale } from '../../core/analysis/system';
import { composites } from '../../core/ratings';
import { rosterNames } from '../stats';
import { Help, Section } from '../components/ui';
import { Term } from '../components/Glossary';
import { HeadSwitch } from './HeadSwitch';
import type { Phase } from './instructions/TeamInstructions';
import { Star } from './Star';
import { BOARD_H, DEF_SPOTS, OFF_SPOTS, place, type BoardPlayer } from './formation';

export type BoardSide = 'in' | 'out';

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

/** The apron around the court on the board, in court units (the lines sit inside the card's edges). */
const APRON = 4;
const VB_W = 100 + APRON * 2;
const VB_H = BOARD_H + APRON * 2;

export function Board({
  t,
  players,
  five,
  side,
  setSide,
  onPick,
  onInstructions,
}: {
  t: Tactics;
  /** The whole roster (names told apart across it), and the five on the board. */
  players: Player[];
  five: Player[];
  side: BoardSide;
  setSide: (s: BoardSide) => void;
  /** Opens a player's sheet. */
  onPick: (pid: number) => void;
  /** Opens Team Instructions on a phase. */
  onInstructions: (p: Phase) => void;
}) {
  const league = useLeague();
  const nameOf = useMemo(() => rosterNames(players), [players]);
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
  // the five arrive one after another as the board opens; a plate that joins later (a swap) pops in alone
  const opened = useRef(false);
  useEffect(() => {
    opened.current = true;
  }, []);
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
              { id: 'in', label: 'With ball' },
              { id: 'out', label: 'Without ball' },
            ]}
          />
        </div>
      }
      right={
        <Help title="Tactics board">
          <p>
            Your starting five, where your tactic puts them. With the ball by your <Term id="shape">shape</Term>, without it by your scheme.
          </p>
          <p>
            Each plays a <Term id="roles">role</Term> at each end. The ★ figure rates his fit out of five, against others in that role.
          </p>
          <p>An amber edge means another role suits him two stars better. Tap a player to set his roles.</p>
          <p>Team instructions sets the shape, the scheme and how you play each phase.</p>
        </Help>
      }
    >
      {/* the board as one printed object: the formation's picker over the floor */}
      <div className="card flush tx-boardcard">
        {/* the way into Team Instructions, on this end's phase: what the formation is, and how it plays */}
        <button
          className="tx-formation tx-pickrow ti-launch"
          aria-haspopup="dialog"
          aria-label={`${inPoss ? 'Shape' : 'Scheme'}: ${inPoss ? SHAPE_META[shape].label : SCHEME_META[t.defense.scheme].label}. Open team instructions`}
          onClick={() => onInstructions(inPoss ? 'ball' : 'off')}
        >
          <span className="tx-pickrow-l">{inPoss ? 'Shape' : 'Scheme'}</span>
          <span key={inPoss ? shape : t.defense.scheme} className="tx-pickrow-v ellipsis">
            {inPoss ? SHAPE_META[shape].label : SCHEME_META[t.defense.scheme].label}
          </span>
          <SlidersHorizontal size={16} className="dim" aria-hidden="true" />
        </button>

        <div className={`tx-floor tx-board ${inPoss ? 'in' : 'out'}`} role="list" aria-label={inPoss ? 'Your five with the ball' : 'Your five without the ball'}>
          {/* a maple half court: the boards running baseline to half court, your colour in the key and
            the centre circle, the lines in white */}
          <svg className="tx-floor-court" viewBox={`${-APRON} ${-APRON} ${VB_W} ${VB_H}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <pattern id="tx-planks" x={-APRON} y={-APRON} width="7" height={VB_H} patternUnits="userSpaceOnUse">
                <rect width="7" height={VB_H} className="tx-floor-wood" />
                <rect x="3.5" width="3.5" height={VB_H} className="tx-floor-wood2" />
                <path d={`M 3.5 0 V ${VB_H} M 7 0 V ${VB_H} M 0 31 H 3.5 M 3.5 62 H 7 M 0 76 H 3.5 M 3.5 18 H 7`} className="tx-floor-seam" />
              </pattern>
            </defs>
            <rect x={-APRON} y={-APRON} width={VB_W} height={VB_H} fill="url(#tx-planks)" />
            {/* the paint: the key and the centre circle's half */}
            <rect x="34" y="0" width="32" height="27" className="tx-floor-paint" />
            <path d="M 38 84 A 12 12 0 0 1 62 84 Z" className="tx-floor-paint" />
            <g className="tx-floor-line" fill="none">
              {/* the sidelines, the baseline and half court */}
              <path d="M 0 84 V 0 H 100 V 84" />
              <path d={`M ${-APRON} 84 H ${100 + APRON}`} />
              {/* the key, its blocks and hash marks */}
              <path d="M 34 0 V 27 H 66 V 0" />
              <path d="M 32.2 9 H 34 M 32.2 13.5 H 34 M 32.2 18 H 34 M 32.2 22.5 H 34 M 66 9 H 67.8 M 66 13.5 H 67.8 M 66 18 H 67.8 M 66 22.5 H 67.8" />
              {/* the free-throw circle: drawn toward half court, dashed inside the key */}
              <path d="M 41 27 A 9 9 0 0 0 59 27" />
              <path d="M 41 27 A 9 9 0 0 1 59 27" className="tx-floor-dash" />
              {/* the three-point line: straight in the corners, then the arc */}
              <path d="M 6 0 V 14 A 44 44 0 0 0 94 14 V 0" />
              {/* the restricted area */}
              <path d="M 44 2.6 V 5 A 6 6 0 0 0 56 5 V 2.6" />
              {/* the centre circle's half, and the jump circle inside it */}
              <path d="M 38 84 A 12 12 0 0 1 62 84" />
              <path d="M 46 84 A 4 4 0 0 1 54 84" />
            </g>
            {/* the backboard, the rim and its neck */}
            <path d="M 44.5 2.6 H 55.5" className="tx-floor-board" />
            <path d="M 50 2.6 V 3.4" className="tx-floor-rim" />
            <circle cx="50" cy="5" r="1.6" className="tx-floor-rim" fill="none" />
          </svg>
          {rows.map((r) => {
            const spot = placed.get(r.p.pid);
            if (!spot) return null;
            // (the plate's short name; a screen reader hears the whole one)
            const role = inPoss ? ROLE_META[r.off].short : DEF_ROLE_META[r.def].short;
            const roleSaid = inPoss ? ROLE_META[r.off].label : DEF_ROLE_META[r.def].label;
            const fit = inPoss ? r.offStars : r.defStars;
            const better = inPoss ? r.offBetter : r.defBetter;
            const off = !!better;
            const bestName = !better ? '' : inPoss ? ROLE_META[better as keyof typeof ROLE_META].label : DEF_ROLE_META[better as (typeof DEF_ROLES)[number]].label;
            return (
              <button
                key={r.p.pid}
                role="listitem"
                className={`tx-floor-p${off ? ' off' : ''}${opened.current ? ' joined' : ''}`}
                // (plain numbers, in hundredths of the floor's width and height: the styles turn them into a `translate` that glides)
                style={{ '--x': ((spot.x + APRON) / VB_W) * 100, '--y': ((spot.y + APRON) / VB_H) * 100 } as CSSProperties}
                onClick={() => onPick(r.p.pid)}
                aria-label={`${nameOf(r.p.pid)}, ${spot.name}: ${roleSaid}, ${fit} of 5 for it${off ? `; suits ${bestName} better` : ''}`}
              >
                {/* (a long name takes the narrowest cut rather than lose its end: "Gilgeous-Alexan…") */}
                <span className={`tx-floor-n${nameOf(r.p.pid).length > 12 ? ' long' : ''}`}>
                  <span className="ellipsis">{nameOf(r.p.pid)}</span>
                </span>
                {/* (keyed by the role: a new one, or the board's other end, fades in on the plate as it travels) */}
                <span className="tx-floor-r" key={role}>
                  <span className="ellipsis">{role}</span>
                  <span className="tx-floor-s num" aria-hidden="true">
                    {fit}
                    <Star />
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
