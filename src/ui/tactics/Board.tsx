// The tactics board, Football Manager's way with a basketball court: the starting five (the rotation's
// first five) where the formation puts them, in possession by the offensive shape, out of possession
// by the defensive scheme. Each plate is a player with his role at that end, how well he suits it (★)
// and a dot for how well he knows his role pair; a tap opens his player sheet. Lines join the
// partners whose roles link at that end (heavier the more of it the engine plays), a red dashed one
// the bigs who crowd the paint. Over the court, the formation's picker (the shape, or the scheme and
// coverage) with each choice's fit for this roster and how well the team knows it.
import { useMemo, type CSSProperties } from 'react';
import { useLeague, useLeagueMemo } from '../../state/store';
import type { DefScheme, Familiarity, OffShape, Player, PnrCoverage, Tactics } from '../../core/types';
import { DEF_ROLES, OFF_SHAPES } from '../../core/types';
import { ROLE_META, archetype } from '../../core/ratings';
import { ALL_SCHEMES, COVERAGE_META, DEF_ROLE_META, SCHEME_META, SHAPE_META, defRoleOf, shapeOf } from '../../core/sim/tactics';
import { famLabel, optValue, roleFam } from '../../core/sim/familiarity';
import { defRoleFits, fitStars, miscast, roleFits } from '../../core/analysis/system';
import { fitRoster, shapeFits } from '../../core/ai/coachAI';
import { composites } from '../../core/ratings';
import { rosterNames } from '../stats';
import { LINK_META, type Clash, type Link } from '../../core/sim/links';
import { Help, Section, Segmented } from '../components/ui';
import { Term } from '../components/Glossary';
import { PickRow } from './Pick';
import { tweak } from './edit';
import { BOARD_H, DEF_SPOTS, OFF_SPOTS, famTone, fitPts, place, type BoardPlayer, type Spot } from './formation';
import { linkKey, linkLine, linksOnSide, plateAt } from './partners';

export type BoardSide = 'in' | 'out';

const NO_ORDER: number[] = [];

/** A player's place on the board: his roles at both ends, how well he suits each, his pair's familiarity. */
interface Row {
  p: Player;
  off: keyof typeof ROLE_META;
  def: (typeof DEF_ROLES)[number];
  offFit: number;
  defFit: number;
  /** A role at each end that suits him clearly better (miscast: two stars or more), if there is one. */
  offBetter: keyof typeof ROLE_META | null;
  defBetter: (typeof DEF_ROLES)[number] | null;
  pair: number;
}

function rowOf(t: Tactics, fam: Familiarity, p: Player): Row {
  const of = roleFits(p);
  const df = defRoleFits(p);
  const off = t.offense.roles[p.pid] ?? archetype(p.ratings).role;
  const def = defRoleOf(t.defense, p.pid);
  return { p, off, def, offFit: of[off], defFit: df[def], offBetter: miscast(of, off), defBetter: miscast(df, def), pair: roleFam(fam, t, p) };
}

/** A shape's fit as a tone: half a point a game or more either way shows. */
const fitClass = (v: number) => (v >= 5 ? 'good' : v <= -5 ? 'bad' : '');

/** First sentence of a line of help. */
const first = (s: string) => s.split(/(?<=\.)\s/)[0];

const stars = (v: number) => (
  <>
    {'★'.repeat(fitStars(v))}
    <span className="dim">{'★'.repeat(5 - fitStars(v))}</span>
  </>
);

export function Board({
  t,
  players,
  five,
  fam,
  side,
  setSide,
  links,
  clashes,
  focus,
  onPick,
}: {
  t: Tactics;
  /** The whole roster (the shapes' fits), and the five on the board. */
  players: Player[];
  five: Player[];
  fam: Familiarity;
  side: BoardSide;
  setSide: (s: BoardSide) => void;
  /** The five's partnerships and clashes (lineupLinks). */
  links: Link[];
  clashes: Clash[];
  /** A link picked in the Partnerships card (linkKey): its line stands out and is named. */
  focus?: string | null;
  /** Opens a player's sheet. */
  onPick: (pid: number) => void;
}) {
  const league = useLeague();
  const team = league.teams[league.userTid];
  const nameOf = useMemo(() => rosterNames(players), [players]);
  const order = team.rotation?.order ?? NO_ORDER;
  const rows = five.map((p) => rowOf(t, fam, p));
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
  // the lines: this end's links, and in possession the bigs who crowd the paint
  const shown = linksOnSide(links, side);
  const crowd = inPoss ? clashes.filter((c) => c.id === 'crowd') : [];
  const clashed = new Set(crowd.flatMap((c) => c.pids));
  const at = (pid: number) => {
    const sp = placed.get(pid);
    return sp ? plateAt(sp) : null;
  };
  const named = shown.find((l) => linkKey(l) === focus);
  const famOf = (key: string) => optValue(fam, key);
  const famSub = (key: string, extra?: string) => {
    const v = famOf(key);
    return (
      <>
        <span className={famTone(v)}>
          {Math.round(v)}% {famLabel(v).toLowerCase()}
        </span>
        {extra && <> · {extra}</>}
      </>
    );
  };

  return (
    <Section
      title="Tactics board"
      right={
        <Help title="Tactics board">
          <p>
            Your starting five (the rotation&apos;s first five) where your tactic puts them: in possession by your <Term id="shape">shape</Term>, out of possession by your scheme
            and each player&apos;s <Term id="defroles">defensive role</Term>.
          </p>
          <p>
            ★ is how well he suits his role at that end (★★★★★ the best); an amber edge means another role suits him clearly better (two stars or more). The dot is how well he
            knows his pair of roles (<Term id="familiarity">familiarity</Term>): green fluid or familiar, amber learning, red new to it.
          </p>
          <p>
            A line joins two players whose roles make a <Term id="partnership">partnership</Term> at that end: the heavier and darker, the more of it they play (it grows with their{' '}
            <Term id="understanding">understanding</Term>). A red dashed line is two bigs crowding the paint.
          </p>
          <p>Tap a player for his roles, shot freedom, glass duty and screens.</p>
        </Help>
      }
    >
      <Segmented
        value={side}
        onChange={setSide}
        label="Phase on the board"
        options={[
          { id: 'in', label: 'In possession' },
          { id: 'out', label: 'Out of possession' },
        ]}
      />
      {/* the board as one printed object: the formation's pickers, the floor, the row to the bench */}
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
              help={
                <>
                  Where your five stand in the half court. The figure is the staff&apos;s read of what the shape is worth a game for this roster against 4-out, 1-in, once drilled;
                  the % is how well your team knows it. Change it and the staff measures it on your next games.
                </>
              }
              options={[...OFF_SHAPES]
                .sort((a, b) => fits[b] - fits[a])
                .map((s) => ({
                  id: s,
                  label: SHAPE_META[s].label,
                  sub: (
                    <>
                      <b className={fitClass(fits[s])}>{fitPts(fits[s])} a game</b> · {famSub(`shape:${s}`, first(SHAPE_META[s].help))}
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
                shape === 'fourOut' ? (
                  <>The baseline shape · {famSub('shape:fourOut')}</>
                ) : (
                  <>
                    <b className={fitClass(fits[shape])}>{fitPts(fits[shape])}</b> a game vs 4-out · {famSub(`shape:${shape}`)}
                  </>
                )
              }
            />
          ) : (
            <>
              <PickRow<DefScheme>
                label="Scheme"
                value={t.defense.scheme}
                onChange={(x) => tweak((tt) => void (tt.defense.scheme = x))}
                help="Your base defense. The % is how well your team knows each."
                options={ALL_SCHEMES.map((k) => ({ id: k, label: SCHEME_META[k].label, sub: famSub(`scheme:${k}`, first(SCHEME_META[k].help)) }))}
                note={famSub(`scheme:${t.defense.scheme}`)}
              />
              <PickRow<PnrCoverage>
                label="Ball screens"
                value={t.defense.pnr}
                onChange={(x) => tweak((tt) => void (tt.defense.pnr = x))}
                help="How you guard the pick-and-roll. The % is how well your team knows each."
                options={(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => ({
                  id: k,
                  label: COVERAGE_META[k].label,
                  sub: famSub(`pnr:${k}`, first(COVERAGE_META[k].help)),
                }))}
                note={famSub(`pnr:${t.defense.pnr}`)}
              />
            </>
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
          {/* the partnerships and the clash, under the plates */}
          <svg className="tx-floor-links" viewBox={`0 0 100 ${BOARD_H}`} preserveAspectRatio="none" aria-hidden="true">
            {crowd.map((c) =>
              c.pids.slice(1).map((pid, i) => {
                const a = at(c.pids[i]);
                const b = at(pid);
                return a && b ? <line key={`crowd${pid}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="tx-clash-l" /> : null;
              }),
            )}
            {shown.map((l) => {
              const a = at(l.a);
              const b = at(l.b);
              if (!a || !b) return null;
              const st = linkLine(l.strength);
              const k = linkKey(l);
              return (
                <line
                  key={k}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className={`tx-link-l${focus ? (k === focus ? ' on' : ' off') : ''}`}
                  strokeWidth={k === focus ? Math.max(1.4, st.width) : st.width}
                  strokeOpacity={k === focus ? 1 : st.opacity}
                  strokeDasharray={st.dashed ? '1.4 1.2' : undefined}
                />
              );
            })}
          </svg>
          {named && <LinkTag spot={mid(at(named.a), at(named.b))} label={LINK_META[named.id].label} />}
          {rows.map((r) => {
            const spot = placed.get(r.p.pid);
            if (!spot) return null;
            const role = inPoss ? ROLE_META[r.off].label : DEF_ROLE_META[r.def].short;
            const fit = inPoss ? r.offFit : r.defFit;
            const better = inPoss ? r.offBetter : r.defBetter;
            const off = !!better;
            const bestName = !better ? '' : inPoss ? ROLE_META[better as keyof typeof ROLE_META].label : DEF_ROLE_META[better as (typeof DEF_ROLES)[number]].label;
            return (
              <button
                key={r.p.pid}
                role="listitem"
                className={`tx-floor-p${off ? ' off' : ''}${clashed.has(r.p.pid) ? ' clash' : ''}`}
                style={{ '--x': `${spot.x}%`, '--y': `${(spot.y / BOARD_H) * 100}%` } as CSSProperties}
                onClick={() => onPick(r.p.pid)}
                aria-label={`${nameOf(r.p.pid)}, ${spot.name}: ${role}, ${fitStars(fit)} of 5 for it${off ? `; suits ${bestName} better` : ''}${clashed.has(r.p.pid) ? '; crowds the paint' : ''}; knows his roles ${Math.round(r.pair)}%`}
              >
                <span className="tx-floor-n">
                  <i className={`tx-famdot ${famTone(r.pair)}`} aria-hidden="true" />
                  <span className="ellipsis">{nameOf(r.p.pid)}</span>
                </span>
                <span className="tx-floor-r">{role}</span>
                <span className="tx-floor-s" aria-hidden="true">
                  {stars(fit)}
                </span>
                {r.p.injury && <span className="tx-floor-best">Injured</span>}
              </button>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

/** The middle of two plates, where a picked link is named. */
const mid = (a: { x: number; y: number } | null, b: { x: number; y: number } | null) => (a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null);

/** A picked link's name on the court, at the middle of its line. */
function LinkTag({ spot, label }: { spot: Pick<Spot, 'x' | 'y'> | null; label: string }) {
  if (!spot) return null;
  return (
    <span className="tx-link-tag" style={{ '--x': `${spot.x}%`, '--y': `${(spot.y / BOARD_H) * 100}%` } as CSSProperties}>
      {label}
    </span>
  );
}
