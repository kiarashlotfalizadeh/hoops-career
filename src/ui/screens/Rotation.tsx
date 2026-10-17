import { attrDisplay } from '../../core/ratings';
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, BedDouble, ChevronRight, Undo2, Wand2 } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { rosterSorted } from '../../core/league/helpers';
import { evaluateLineup } from '../../core/ai/coachAI';
import { ensureRotation } from '../../core/league/games';
import { buildMinutePlan, normalizeMinutes, planInputs, planRoles } from '../../core/sim/rotationPlan';
import { Avatar, Help, Ovr, PageHeader, Section, Sheet, Slider, Statline, Tag, Toggle, activateOnKey } from '../components/ui';
import type { League, Player, Rotation as RotationT } from '../../core/types';
import { f1, gamesMemo, ordinal, playerSeason, rosterNames, signed, startingFive } from '../stats';
import { seasonLineups, type LineupAgg } from '../seasonAnalysis';
import { swapSpots } from '../../core/analysis/lineups';
import './team.css';

/** The minute bar's full width: the most a target can be. */
const MAX_MIN = 44;

export default function Rotation() {
  const league = useLeague();
  const team = league.teams[league.userTid];
  const rot = team.rotation;
  const players = useLeagueMemo(() => rosterSorted(league, league.userTid), [league]);
  const byId = new Map(players.map((p) => [p.pid, p]));
  const nameOf = rosterNames(players);
  const fullNameOf = rosterNames(players, { initial: true });
  const order = rot.order.filter((pid) => byId.has(pid));
  for (const p of players) if (!order.includes(p.pid)) order.push(p.pid);
  const [edit, setEdit] = useState<number | null>(null);
  // the rotation Auto replaced, until the next edit
  const [undo, setUndo] = useState<RotationT | null>(null);
  // a Play-menu sim's progress bar takes the same spot as the undo bar
  const simming = useStore((s) => !!s.sim);

  const update = (fn: (r: RotationT) => void) => {
    setUndo(null);
    useStore.getState().mutate((l) => {
      const r = l.teams[l.userTid].rotation;
      fn(r);
      r.manual = true;
    });
  };

  const healthyOrder = order.filter((pid) => !byId.get(pid)?.injury);
  const total = healthyOrder.reduce((a, pid) => a + (rot.minutes[pid] ?? 0), 0);
  const injuredMin = order.reduce((a, pid) => a + (byId.get(pid)?.injury ? (rot.minutes[pid] ?? 0) : 0), 0);
  const starters = healthyOrder.slice(0, 5).map((pid) => byId.get(pid)!);
  const startEval = starters.length === 5 ? evaluateLineup(starters) : null;
  const startMin = starters.reduce((a, p) => a + (rot.minutes[p.pid] ?? 0), 0);
  const closers = rot.closers.filter((pid) => byId.has(pid));
  // the engine starts the first five healthy players: the Bench heading goes after the fifth
  const startSet = startingFive(order.map((pid) => byId.get(pid)!));
  const benchFrom = healthyOrder.length >= 5 ? order.indexOf(healthyOrder[4]) + 1 : order.length;

  // planned stints visual: the engine's own plan inputs (injured players' minutes handed out, caps,
  // an assistant-managed rotation's shorter playoff eight)
  const playoffs = league.phase === 'playoffs';
  const plan = useLeagueMemo(() => {
    const pp = planInputs(
      order.map((pid) => {
        const p = byId.get(pid)!;
        return { pid, available: !p.injury, ...planRoles(p.ratings, p.pos), endurance: p.ratings.end };
      }),
      rot,
      { playoffs },
    );
    const norm = normalizeMinutes(pp);
    return { slots: buildMinutePlan(pp), norm: Object.fromEntries(pp.map((x, i) => [x.pid, norm[i]])) as Record<number, number> };
    // the rotation's content stands for order, byId and rot, which are new objects every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rot), playoffs]);
  const planned = healthyOrder.filter((pid) => (plan.norm[pid] ?? 0) > 0);

  const move = (pid: number, dir: -1 | 1) =>
    update((r) => {
      const o = order.slice();
      const i = o.indexOf(pid);
      const j = i + dir;
      if (j < 0 || j >= o.length) return;
      [o[i], o[j]] = [o[j], o[i]];
      r.order = o;
    });

  const ep = edit !== null ? byId.get(edit) : null;

  return (
    <main className="page">
      <PageHeader
        title="Rotation"
        back
        backTo="/roster"
        sub={rot.manual ? 'Custom rotation' : 'Assistant-managed · adjusts for injuries'}
        right={
          <button
            className="btn sm"
            onClick={() => {
              setUndo(structuredClone(rot));
              // the assistant's rotation as the next game would have it: two-way players at the end of the bench too
              useStore.getState().mutate((l) => {
                l.teams[l.userTid].rotation.manual = false;
                ensureRotation(l, l.userTid);
              });
            }}
          >
            <Wand2 size={16} /> Auto
          </button>
        }
      />

      <div className="card tm-rsum">
        <div className="row top">
          <div className="grow">
            <Statline
              items={[
                { k: 'Targets', v: total, s: total === 240 ? 'of 240 minutes' : 'scaled to 240' },
                { k: 'Starters', v: startMin, s: 'first five' },
                { k: 'Bench', v: total - startMin, s: 'the rest' },
              ]}
            />
          </div>
          <Help title="How rotations work">
            <p>
              The first five healthy players start. The coaching staff turns your minute targets into a stint plan (below), scaled to exactly 240 minutes, and follows it at dead
              balls. Fouls, fatigue, injuries and blowouts change it in the game.
            </p>
            <p>
              Closers finish the 4th quarter and overtime when healthy. Players on "rest on back-to-backs" sit the second night of back-to-backs, which lowers wear and injury risk.
            </p>
          </Help>
        </div>
        {injuredMin > 0 && <div className="tm-rsum-note warn">{injuredMin} minutes of injured players go to the healthy ones: the stint plan shows who.</div>}
        {startEval && startEval.notes.length > 0 && (
          <div className="tm-tags">
            {startEval.notes.map((n) => (
              <Tag key={n} tone="warn">
                {n}
              </Tag>
            ))}
          </div>
        )}
      </div>

      <div className="card flush">
        <div className="list">
          {order.map((pid, i) => {
            const p = byId.get(pid)!;
            const m = rot.minutes[pid] ?? 0;
            const pg = playerSeason(p, league.season);
            return (
              <Fragment key={pid}>
                {(i === 0 || i === benchFrom) && <div className="list-divider">{i === 0 ? 'Starters' : 'Bench'}</div>}
                {/* an injured player is marked Out and greyed by colour, not opacity: the OVR badge and jersey keep their contrast */}
                <div className={`listrow tm-rrow ${p.injury ? 'out' : ''}`}>
                  <div className="move-arrows">
                    <button className="iconbtn" onClick={() => move(pid, -1)} aria-label={`Move ${p.firstName} ${p.lastName} up`} disabled={i === 0}>
                      <ArrowUp size={16} />
                    </button>
                    <button className="iconbtn" onClick={() => move(pid, 1)} aria-label={`Move ${p.firstName} ${p.lastName} down`} disabled={i === order.length - 1}>
                      <ArrowDown size={16} />
                    </button>
                  </div>
                  <Avatar p={p} />
                  <div
                    className="tm-rrow-main"
                    role="button"
                    tabIndex={0}
                    aria-haspopup="dialog"
                    // named by what it shows, his name first: "A. Mitchell Closer SG · … 28 minutes 82"
                    onClick={() => setEdit(pid)}
                    onKeyDown={activateOnKey(() => setEdit(pid))}
                  >
                    <div className="grow">
                      {/* tags drop below a long name instead of cutting it off ("S. Gilgeous-Alex…") */}
                      <div className="tm-rname">
                        <span className="ellipsis">{fullNameOf(pid)}</span>
                        {p.injury && <Tag tone="bad">Out</Tag>}
                        {closers.includes(pid) && <Tag>Closer</Tag>}
                        {rot.restB2B.includes(pid) && <BedDouble size={14} className="dim" aria-label="Rests on back-to-backs" />}
                      </div>
                      <div className="lr-meta ellipsis">
                        {p.pos} · {p.injury ? `${p.injury.type} (${p.injury.gamesRemaining}g)` : pg ? `${f1(pg.min)} mpg` : p.archetype} · sta {attrDisplay(p.ratings.end)}
                        {p.wear >= 30 ? ` · wear ${Math.round(p.wear)}` : ''}
                      </div>
                      <div className="bar tm-mbar">
                        <div style={{ width: `${(m / MAX_MIN) * 100}%` }} />
                      </div>
                    </div>
                    <span className="tm-rmin">
                      <span className="tm-rmin-v num">{m}</span>
                      <span className="tm-rmin-k">min</span>
                    </span>
                    <Ovr v={p.ovr} size="sm" />
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>

      <Section
        title="Stint plan"
        right={
          <Help title="Stint plan">
            When each player is planned on the floor, minute by minute through the four quarters, from your targets scaled to 240. The staff follows it at dead balls and adjusts
            for fouls, fatigue, injuries and blowouts.
          </Help>
        }
      >
        <div className="card tm-plan">
          <div className="tm-plan-row tm-plan-head" aria-hidden="true">
            <span />
            <span className="tm-plan-qs">
              {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
                <span key={q}>{q}</span>
              ))}
            </span>
            <span>MIN</span>
          </div>
          {planned.map((pid, i) => (
            <div
              key={pid}
              className={`tm-plan-row ${i === 5 ? 'gap' : ''}`}
              role="img"
              aria-label={`${nameOf(pid)}: ${plan.norm[pid]} minutes, on the floor in minutes ${stints(plan.slots, pid)}`}
            >
              <span className="tm-plan-n ellipsis">{nameOf(pid)}</span>
              <span className="tm-plan-qs">
                {[0, 1, 2, 3].map((q) => (
                  <span key={q} className="tm-plan-q">
                    {plan.slots.slice(q * 12, q * 12 + 12).map((slot, s) => (
                      <i key={s} className={slot.includes(pid) ? 'on' : ''} />
                    ))}
                  </span>
                ))}
              </span>
              <span className="tm-plan-m num">{plan.norm[pid]}</span>
            </div>
          ))}
        </div>
      </Section>

      <LineupsCard />

      <Sheet open={!!ep} onClose={() => setEdit(null)} title={ep ? `${ep.firstName} ${ep.lastName}` : ''}>
        {ep && <EditPlayer p={ep} rot={rot} update={update} close={() => setEdit(null)} order={order} names={nameOf} starters={startSet} />}
      </Sheet>

      {undo && !simming && (
        <div className="dockbar">
          <div className="grow small">
            <div className="bold">Assistant's rotation applied</div>
            <div className="dim">{undo.manual ? 'It replaced your custom one.' : 'Refreshed for the current roster.'}</div>
          </div>
          <button
            className="btn sm"
            onClick={() => {
              useStore.getState().mutate((l) => void (l.teams[l.userTid].rotation = undo));
              setUndo(null);
            }}
          >
            <Undo2 size={16} /> Undo
          </button>
        </div>
      )}
    </main>
  );
}

/** "1-8, 20-26, 41-48": the minutes of the game a player is planned on the floor (the stint plan for screen readers). */
function stints(slots: number[][], pid: number) {
  const out: string[] = [];
  let from = -1;
  slots.forEach((slot, s) => {
    const on = slot.includes(pid);
    if (on && from < 0) from = s;
    if (from >= 0 && (!on || s === slots.length - 1)) {
      const to = on ? s : s - 1;
      out.push(from === to ? `${from + 1}` : `${from + 1}-${to + 1}`);
      from = -1;
    }
  });
  return out.join(', ');
}

const lineupLists = new WeakMap<League, { key: string; value: LineupAgg[] }>();

function LineupsCard() {
  const league = useLeague();
  // a scan of every game's lineups: worked out again when a game is played, not at every step of a minutes slider
  const lineups = gamesMemo(lineupLists, league, () =>
    seasonLineups(league)
      .filter((l) => l.min >= 8)
      .slice(0, 10),
  );
  // named from the lineups themselves: players traded or released since still read as themselves
  const names = rosterNames([...new Set(lineups.flatMap((l) => l.pids))].map((pid) => league.players[pid]).filter(Boolean));
  // the lineup screen also has last season's numbers (and on/off splits) before any five has played together this season
  const lastSeason = league.teams[league.userTid].seasons.some((s) => s.season === league.season - 1 && s.poss > 0);
  if (!lineups.length && !lastSeason) return null;
  return (
    <Section
      title={
        <h3>
          Lineups this season
          <Help title="Lineup net rating">
            Points scored minus allowed per 100 possessions while those five shared the floor. Small samples swing a lot; trust lineups with more minutes. All lineups has every
            five, the pairs and trios inside them and each player's on-off split, and can make a five your starters or closers.
          </Help>
        </h3>
      }
      right={
        <Link className="card-link" to="/lineups" aria-label="See all lineups, pairs, trios and on-off splits">
          All <ChevronRight size={14} />
        </Link>
      }
    >
      <div className="card flush list">
        {!lineups.length && <div className="tm-lu-empty small dim">No five has played 8 minutes together yet this season.</div>}
        {lineups.map((l) => (
          <div key={l.key} className="tm-lu">
            <span className={`tm-lu-net num ${l.net >= 0 ? 'good' : 'bad'}`}>{signed(l.net)}</span>
            <span className="tm-lu-names">{l.pids.map((pid) => names(pid) || '?').join(', ')}</span>
            <span className="tm-lu-min num">{Math.round(l.min)}m</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function EditPlayer({
  p,
  rot,
  update,
  close,
  order,
  names,
  starters,
}: {
  p: Player;
  rot: RotationT;
  update: (fn: (r: RotationT) => void) => void;
  close: () => void;
  order: number[];
  names: (pid: number) => string;
  /** The first five healthy players: the ones who start tonight. */
  starters: Set<number>;
}) {
  const starting = starters.has(p.pid);
  const m = rot.minutes[p.pid] ?? 0;
  const cap = rot.caps[p.pid] ?? 0;
  const at = order.indexOf(p.pid);
  // one tap instead of a run of arrow taps: trade depth-chart spots (and minutes: the role moves with the spot) with anyone
  const swap = (other: number) => update((r) => swapSpots(r, order, p.pid, other));
  return (
    <div className="tm-ed">
      <div className="tm-ed-who">
        <Avatar p={p} />
        <div className="grow">
          <div className="bold">{starting ? 'Starter' : at < 5 ? 'Starter when healthy' : 'Bench'}</div>
          <div className="lr-meta">
            {ordinal(at + 1)} on the depth chart · {p.pos}
          </div>
        </div>
        <Ovr v={p.ovr} size="sm" />
      </div>
      <Section title="Swap spot and minutes with">
        <div className="chips">
          {order
            .filter((pid) => pid !== p.pid)
            .map((pid) => {
              const j = order.indexOf(pid);
              return (
                <button key={pid} className="chip tm-swap" onClick={() => swap(pid)}>
                  <span className={`tm-swap-n ${starters.has(pid) ? 's' : ''}`}>{starters.has(pid) ? 'S' : j + 1}</span>
                  {names(pid)}
                  {/* the S badge and spot number spelled out: "S Dixon, starter", "9 Warren, 9th on the depth chart" */}
                  <span className="sr-only">{starters.has(pid) ? ', starter' : `, ${ordinal(j + 1)} on the depth chart`}</span>
                </button>
              );
            })}
        </div>
      </Section>
      <Section title="Minutes">
        <div className="tm-ed-group">
          <Slider
            label="Target minutes"
            value={m}
            min={0}
            max={MAX_MIN}
            onChange={(x) => update((r) => void (r.minutes[p.pid] = x))}
            format={(x) => `${x} min`}
            help={p.mood.expectedMin ? `He expects about ${p.mood.expectedMin}. Big gaps hurt his mood.` : undefined}
          />
          <Slider
            label="Hard minute cap"
            value={cap}
            min={0}
            max={MAX_MIN}
            onChange={(x) =>
              update((r) => {
                if (x === 0) delete r.caps[p.pid];
                else r.caps[p.pid] = x;
              })
            }
            format={(x) => (x ? `${x} min` : 'None')}
            help={cap && cap < m ? `Never more, even in close games: under his ${m}-minute target, so ${cap} at most.` : 'Load management: never more, even in close games.'}
          />
        </div>
      </Section>
      <Section title="Late game and rest">
        <div className="tm-ed-group">
          <Toggle
            on={rot.closers.includes(p.pid)}
            onChange={(on) =>
              update((r) => {
                r.closers = on ? [...r.closers.filter((x) => x !== p.pid), p.pid].slice(-5) : r.closers.filter((x) => x !== p.pid);
              })
            }
            label="Closing lineup"
            help={
              !rot.closers.includes(p.pid) && rot.closers.length >= 5 && names(rot.closers[0])
                ? `Ends the 4th and overtime. You have five: he replaces ${names(rot.closers[0])}.`
                : 'Ends the 4th quarter and overtime (up to five).'
            }
          />
          <Toggle
            on={rot.restB2B.includes(p.pid)}
            onChange={(on) => update((r) => void (r.restB2B = on ? [...r.restB2B, p.pid] : r.restB2B.filter((x) => x !== p.pid)))}
            label="Rest on back-to-backs"
            help={`Wear ${Math.round(p.wear)}. Sits the second night: less wear and injury risk, a weaker lineup.`}
          />
        </div>
      </Section>
      <button className="btn block" onClick={close}>
        Done
      </button>
    </div>
  );
}
