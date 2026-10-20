// The tactics board, Football Manager's way with a basketball court: the starting five (the rotation's
// first five) where the formation puts them, in possession by the offensive shape, out of possession
// by the defensive scheme. Each plate is a player with his role at that end, how well he suits it (★)
// and a dot for how well he knows his role pair; a tap opens his role sheet. Over the court, the
// formation's picker (the shape, or the scheme and coverage) with each choice's fit for this roster
// and how well the team knows it; under it, the bench.
import { useMemo, useState, type CSSProperties } from 'react';
import { useLeague, useLeagueMemo } from '../../state/store';
import type { DefScheme, Familiarity, OffShape, Player, PnrCoverage, Tactics } from '../../core/types';
import { DEF_ROLES, OFF_SHAPES } from '../../core/types';
import { ROLE_META, archetype } from '../../core/ratings';
import { ALL_SCHEMES, COVERAGE_META, DEF_ROLE_META, SCHEME_META, SHAPE_META, defRoleOf, shapeOf } from '../../core/sim/tactics';
import { famLabel, optValue, roleFam } from '../../core/sim/familiarity';
import { defRoleFits, fitStars, roleFits } from '../../core/analysis/system';
import { fitRoster, shapeFits } from '../../core/ai/coachAI';
import { composites } from '../../core/ratings';
import { rosterNames } from '../stats';
import { Avatar, Help, Section, Segmented, Sheet, Tag, activateOnKey } from '../components/ui';
import { RoleEditor } from '../components/RoleEditor';
import { Term } from '../components/Glossary';
import { PickRow } from './Pick';
import { tweak } from './edit';
import { BOARD_H, DEF_SPOTS, OFF_SPOTS, famTone, fitPts, place, type BoardPlayer } from './formation';

export type BoardSide = 'in' | 'out';

const NO_ORDER: number[] = [];

/** A player's place on the board: his roles at both ends, how well he suits each, his pair's familiarity. */
interface Row {
  p: Player;
  off: keyof typeof ROLE_META;
  def: (typeof DEF_ROLES)[number];
  offFit: number;
  defFit: number;
  /** His best role at each end and its fit. */
  offBest: { r: keyof typeof ROLE_META; v: number };
  defBest: { r: (typeof DEF_ROLES)[number]; v: number };
  pair: number;
}

function rowOf(t: Tactics, fam: Familiarity, p: Player): Row {
  const of = roleFits(p);
  const df = defRoleFits(p);
  const off = t.offense.roles[p.pid] ?? archetype(p.ratings).role;
  const def = defRoleOf(t.defense, p.pid);
  const ob = (Object.keys(of) as (keyof typeof of)[]).sort((a, b) => of[b] - of[a])[0];
  const db = [...DEF_ROLES].sort((a, b) => df[b] - df[a])[0];
  return { p, off, def, offFit: of[off], defFit: df[def], offBest: { r: ob, v: of[ob] }, defBest: { r: db, v: df[db] }, pair: roleFam(fam, t, p) };
}

/** A shape's fit as a tone: half a point per 100 or more either way shows. */
const fitClass = (v: number) => (v >= 5 ? 'good' : v <= -5 ? 'bad' : '');

/** First sentence of a line of help. */
const first = (s: string) => s.split(/(?<=\.)\s/)[0];

const stars = (v: number) => (
  <>
    {'★'.repeat(fitStars(v))}
    <span className="dim">{'★'.repeat(5 - fitStars(v))}</span>
  </>
);

export function Board({ t, players, fam, side, setSide }: { t: Tactics; players: Player[]; fam: Familiarity; side: BoardSide; setSide: (s: BoardSide) => void }) {
  const league = useLeague();
  const team = league.teams[league.userTid];
  const nameOf = useMemo(() => rosterNames(players), [players]);
  const [pick, setPick] = useState<number | null>(null);
  const order = team.rotation?.order ?? NO_ORDER;
  const byId = new Map(players.map((p) => [p.pid, p]));
  const inOrder = [...order.map((pid) => byId.get(pid)).filter((p): p is Player => !!p), ...players.filter((p) => !order.includes(p.pid))];
  const five = inOrder.slice(0, 5);
  const bench = inOrder.slice(5);
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
  const picked = pick !== null ? byId.get(pick) : undefined;
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
            ★ is how well he suits his role at that end (★★★★★ the best); a warning edge means another role suits him better. The dot is how well he knows his pair of roles (
            <Term id="familiarity">familiarity</Term>): green fluid or familiar, amber learning, red new to it.
          </p>
          <p>Tap a player to change his roles, shot freedom and glass duty.</p>
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
      <div className="card flush tx-formation">
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
                Where your five stand in the half court. The figure is what the shape should be worth for this roster against 4-out, 1-in, in points per 100 possessions; the % is
                how well your team knows it.
              </>
            }
            options={[...OFF_SHAPES]
              .sort((a, b) => fits[b] - fits[a])
              .map((s) => ({
                id: s,
                label: SHAPE_META[s].label,
                sub: (
                  <>
                    <b className={fitClass(fits[s])}>{fitPts(fits[s])} per 100</b> · {famSub(`shape:${s}`, first(SHAPE_META[s].help))}
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
              <>
                <b className={fitClass(fits[shape])}>{fitPts(fits[shape])}</b> per 100 vs 4-out · {famSub(`shape:${shape}`)}
              </>
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
              options={(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => ({ id: k, label: COVERAGE_META[k].label, sub: famSub(`pnr:${k}`, first(COVERAGE_META[k].help)) }))}
              note={famSub(`pnr:${t.defense.pnr}`)}
            />
          </>
        )}
      </div>

      <div className={`tx-floor tx-board ${inPoss ? 'in' : 'out'}`} role="list" aria-label={inPoss ? 'Your five in possession' : 'Your five out of possession'}>
        <svg className="tx-floor-court" viewBox={`0 0 100 ${BOARD_H}`} preserveAspectRatio="none" aria-hidden="true">
          <rect x="0" y="0" width="100" height={BOARD_H} className="tx-floor-wood" />
          <rect x="33" y="0" width="34" height="27" className="tx-floor-paint" />
          <path d="M 6 0 L 6 14 A 44 44 0 0 0 94 14 L 94 0" className="tx-floor-line" fill="none" />
          <circle cx="50" cy="27" r="9" className="tx-floor-line" fill="none" />
          <circle cx="50" cy="5" r="1.6" className="tx-floor-rim" fill="none" />
        </svg>
        <span className="tx-board-tag" aria-hidden="true">
          {inPoss ? SHAPE_META[shape].label : `${SCHEME_META[t.defense.scheme].label} · ${COVERAGE_META[t.defense.pnr].label}`}
        </span>
        {rows.map((r) => {
          const spot = placed.get(r.p.pid);
          if (!spot) return null;
          const role = inPoss ? ROLE_META[r.off].label : DEF_ROLE_META[r.def].short;
          const fit = inPoss ? r.offFit : r.defFit;
          const best = inPoss ? r.offBest : r.defBest;
          const off = fitStars(best.v) > fitStars(fit);
          const bestName = inPoss ? ROLE_META[best.r as keyof typeof ROLE_META].label : DEF_ROLE_META[best.r as (typeof DEF_ROLES)[number]].label;
          return (
            <button
              key={r.p.pid}
              role="listitem"
              className={`tx-floor-p${off ? ' off' : ''}`}
              style={{ '--x': `${spot.x}%`, '--y': `${(spot.y / BOARD_H) * 100}%` } as CSSProperties}
              onClick={() => setPick(r.p.pid)}
              aria-label={`${nameOf(r.p.pid)}, ${spot.name}: ${role}, ${fitStars(fit)} of 5 for it${off ? `; best as ${bestName}` : ''}; knows his roles ${Math.round(r.pair)}%`}
            >
              <span className="tx-floor-n">
                <i className={`tx-famdot ${famTone(r.pair)}`} aria-hidden="true" />
                {nameOf(r.p.pid)}
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
      <div className="tx-legend tx-note">
        <span>
          <span className="tx-floor-s">★</span> suits his role
        </span>
        <span>
          <i className="tx-famdot good" /> <i className="tx-famdot warn" /> <i className="tx-famdot bad" /> knows his roles
        </span>
        <span>
          <i className="tx-legend-off" /> better in another role
        </span>
      </div>

      {bench.length > 0 && (
        <div className="card flush list wide2 tx-bench" aria-label="The bench">
          <div className="list-divider list-h" aria-hidden="true">
            <span>Bench</span>
            <span>{inPoss ? 'In possession' : 'Out of possession'}</span>
          </div>
          {bench.map((p) => {
            const r = rowOf(t, fam, p);
            const role = inPoss ? ROLE_META[r.off].label : DEF_ROLE_META[r.def].label;
            const fit = inPoss ? r.offFit : r.defFit;
            return (
              <div
                key={p.pid}
                className="listrow clickable tx-benchrow"
                role="button"
                tabIndex={0}
                aria-haspopup="dialog"
                onClick={() => setPick(p.pid)}
                onKeyDown={activateOnKey(() => setPick(p.pid))}
              >
                <Avatar p={p} />
                <span className="grow">
                  <span className="lr-name ellipsis">{nameOf(p.pid)}</span>
                  <span className="lr-meta tx-rolemeta">
                    <span className="ellipsis">{role}</span>
                    <span className="tx-floor-s" aria-label={`${fitStars(fit)} of 5`}>
                      {stars(fit)}
                    </span>
                    {p.injury && <Tag tone="bad">Out</Tag>}
                  </span>
                </span>
                <i className={`tx-famdot ${famTone(r.pair)}`} aria-label={`Knows his roles ${Math.round(r.pair)}%`} />
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={!!picked} onClose={() => setPick(null)} title={picked ? `${picked.firstName} ${picked.lastName}` : 'Player'}>
        {picked && <RoleEditor key={`${picked.pid}${side}`} p={picked} side={inPoss ? 'off' : 'def'} onDone={() => setPick(null)} />}
      </Sheet>
    </Section>
  );
}
