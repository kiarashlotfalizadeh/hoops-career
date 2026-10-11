import { attrDisplay } from '../../core/ratings';
import { Fragment, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BedDouble, Undo2, Wand2 } from 'lucide-react';
import { useLeague, useStore } from '../../state/store';
import { rosterSorted } from '../../core/league/helpers';
import { autoRotation, evaluateLineup } from '../../core/ai/coachAI';
import { buildMinutePlan, normalizeMinutes, planInputs, planRoles } from '../../core/sim/rotationPlan';
import { Avatar, Card, Help, Ovr, PageHeader, Sheet, Slider, Tag, Toggle, activateOnKey } from '../components/ui';
import type { Player, Rotation as RotationT } from '../../core/types';
import { f1, ordinal, playerSeason, rosterNames } from '../stats';
import { seasonLineups } from '../seasonAnalysis';

export default function Rotation() {
  const league = useLeague();
  const v = useStore((s) => s.v);
  const team = league.teams[league.userTid];
  const rot = team.rotation;
  const players = useMemo(() => rosterSorted(league, league.userTid), [league, v]);
  const byId = new Map(players.map((p) => [p.pid, p]));
  const nameOf = rosterNames(players);
  const fullNameOf = rosterNames(players, { initial: true });
  const order = rot.order.filter((pid) => byId.has(pid));
  for (const p of players) if (!order.includes(p.pid)) order.push(p.pid);
  const [edit, setEdit] = useState<number | null>(null);
  // the rotation Auto replaced, until the next edit
  const [undo, setUndo] = useState<RotationT | null>(null);

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
  const closers = rot.closers.filter((pid) => byId.has(pid));
  // the engine starts the first five healthy players: the Bench heading goes after the fifth
  const startSet = new Set(healthyOrder.slice(0, 5));
  const benchFrom = healthyOrder.length >= 5 ? order.indexOf(healthyOrder[4]) + 1 : order.length;

  // planned stints visual: the engine's own plan inputs (injured players' minutes handed out, caps)
  const plan = useMemo(() => {
    const pp = planInputs(
      order.map((pid) => {
        const p = byId.get(pid)!;
        return { pid, available: !p.injury, ...planRoles(p.ratings, p.pos), endurance: p.ratings.end };
      }),
      rot,
    );
    const norm = normalizeMinutes(pp);
    return { slots: buildMinutePlan(pp), norm: Object.fromEntries(pp.map((x, i) => [x.pid, norm[i]])) as Record<number, number> };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rot), v]);

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
    <main className="page" style={{ paddingBottom: undo ? 'calc(var(--nav-h) + 96px)' : undefined }}>
      <PageHeader
        title="Rotation"
        back
        backTo="/roster"
        sub={rot.manual ? 'Custom rotation' : 'Assistant-managed (updates for injuries automatically)'}
        right={
          <button
            className="btn sm"
            onClick={() => {
              setUndo(structuredClone(rot));
              useStore.getState().mutate((l) => {
                l.teams[l.userTid].rotation = autoRotation(rosterSorted(l, l.userTid), l.teams[l.userTid].rotation);
              });
            }}
          >
            <Wand2 size={16} /> Auto
          </button>
        }
      />
      <Card>
        <div className="row between">
          <div>
            <div className="bold">Minutes: {total} / 240</div>
            <div className="small dim">Targets are scaled to exactly 240. Fouls, fatigue, injuries and blowouts adjust them in-game.</div>
            {injuredMin > 0 && <div className="small warn">Injured players' {injuredMin} minutes go to the healthy ones: the stint plan shows who gets them.</div>}
          </div>
          <Help title="How rotations work">
            <p>
              The first five players start. The coaching staff turns your minute targets into a stint plan (shown below) and follows it at dead balls, pulling players early for
              foul trouble or fatigue.
            </p>
            <p>
              Closers finish the 4th quarter and overtime when healthy. Players on "rest on back-to-backs" sit the second night of back-to-backs, which lowers wear and injury risk.
            </p>
          </Help>
        </div>
        {startEval && startEval.notes.length > 0 && (
          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
            {startEval.notes.map((n) => (
              <Tag key={n} tone="warn">
                {n}
              </Tag>
            ))}
          </div>
        )}
      </Card>

      <Card className="flush">
        <div className="list">
          {order.map((pid, i) => {
            const p = byId.get(pid)!;
            const m = rot.minutes[pid] ?? 0;
            const pg = playerSeason(p, league.season);
            return (
              <Fragment key={pid}>
                {(i === 0 || i === benchFrom) && <div className="list-divider">{i === 0 ? 'Starters' : 'Bench'}</div>}
                <div className="listrow" style={{ opacity: p.injury ? 0.55 : 1, background: startSet.has(pid) ? 'color-mix(in srgb, var(--accent) 7%, transparent)' : undefined }}>
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
                    className="grow"
                    role="button"
                    tabIndex={0}
                    aria-label={`Edit ${p.firstName} ${p.lastName}: ${m} minutes`}
                    onClick={() => setEdit(pid)}
                    onKeyDown={activateOnKey(() => setEdit(pid))}
                    style={{ cursor: 'pointer', minWidth: 0 }}
                  >
                    {/* tags drop below a long name instead of cutting it off ("S. Gilgeous-Alex…") */}
                    <div className="row wrap" style={{ gap: '2px 6px', minWidth: 0 }}>
                      <span className="bold ellipsis" style={{ minWidth: 0 }}>
                        {fullNameOf(pid)}
                      </span>
                      {p.injury && i < benchFrom && <Tag tone="bad">Out</Tag>}
                      {closers.includes(pid) && <Tag>Closer</Tag>}
                      {rot.restB2B.includes(pid) && <BedDouble size={14} className="dim" />}
                    </div>
                    <div className="tiny dim">
                      {p.pos} · {p.injury ? `${p.injury.type} (${p.injury.gamesRemaining}g)` : pg ? `${f1(pg.min)} mpg actual` : p.archetype} · stamina {attrDisplay(p.ratings.end)}
                      {p.wear >= 30 ? ` · wear ${Math.round(p.wear)}` : ''}
                    </div>
                    <div className="bar" style={{ marginTop: 5, height: 5 }}>
                      <div style={{ width: `${(m / 44) * 100}%` }} />
                    </div>
                  </div>
                  <div className="col" style={{ alignItems: 'flex-end', gap: 2, cursor: 'pointer' }} onClick={() => setEdit(pid)}>
                    <span className="display num" style={{ fontSize: 22 }}>
                      {m}
                    </span>
                    <Ovr v={p.ovr} size="sm" />
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      </Card>

      <Card title="Stint plan" right={<span className="tiny dim">48 minutes →</span>}>
        <div className="col" style={{ gap: 3 }}>
          {healthyOrder
            .filter((pid) => (plan.norm[pid] ?? 0) > 0)
            .map((pid) => {
              return (
                <div key={pid} className="row" style={{ gap: 6 }}>
                  <span className="tiny ellipsis" style={{ width: 110, flex: 'none' }}>
                    {nameOf(pid)}
                  </span>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(48, 1fr)', gap: 1 }}>
                    {plan.slots.map((slot, s) => (
                      <div
                        key={s}
                        style={{ height: 12, borderRadius: 2, background: slot.includes(pid) ? 'var(--accent)' : 'var(--surface-3)', marginLeft: s % 12 === 0 && s ? 3 : 0 }}
                      />
                    ))}
                  </div>
                  <span className="tiny num dim" style={{ width: 20, textAlign: 'right' }}>
                    {plan.norm[pid]}
                  </span>
                </div>
              );
            })}
        </div>
        <div className="tiny dim" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', textAlign: 'center', marginTop: 6, paddingLeft: 116, paddingRight: 26 }}>
          <span>Q1</span>
          <span>Q2</span>
          <span>Q3</span>
          <span>Q4</span>
        </div>
      </Card>

      <LineupsCard />

      <Sheet open={!!ep} onClose={() => setEdit(null)} title={ep ? `${ep.firstName} ${ep.lastName}` : ''}>
        {ep && <EditPlayer p={ep} rot={rot} update={update} close={() => setEdit(null)} order={order} names={nameOf} starting={startSet.has(ep.pid)} />}
      </Sheet>

      {undo && (
        <div className="simbar fade-in" style={{ bottom: 'calc(var(--nav-h) + var(--safe-b) + 10px)' }}>
          <div className="grow small">
            <div className="bold">Assistant's rotation applied</div>
            <div className="dim">{undo.manual ? 'Your custom rotation was replaced.' : 'Refreshed for the current roster.'}</div>
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

function LineupsCard() {
  const league = useLeague();
  const v = useStore((s) => s.v);
  const lineups = useMemo(
    () =>
      seasonLineups(league)
        .filter((l) => l.min >= 8)
        .slice(0, 10),
    [league, v],
  );
  const names = rosterNames(Object.values(league.players).filter((p) => p.tid === league.userTid));
  if (!lineups.length) return null;
  return (
    <Card
      title="Lineups this season"
      right={
        <Help title="Lineup net rating">
          Points scored minus allowed per 100 possessions while those five shared the floor. Small samples swing a lot; trust lineups with more minutes.
        </Help>
      }
    >
      <div className="col" style={{ gap: 8 }}>
        {lineups.map((l) => (
          <div key={l.key} className="row small top">
            <span className={`num bold ${l.net >= 0 ? 'good' : 'bad'}`} style={{ width: 46 }}>
              {l.net >= 0 ? '+' : ''}
              {l.net.toFixed(1)}
            </span>
            <span className="grow dim2">{l.pids.map((pid) => names(pid) || '?').join(', ')}</span>
            <span className="tiny dim num">{Math.round(l.min)}m</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function EditPlayer({
  p,
  rot,
  update,
  close,
  order,
  names,
  starting,
}: {
  p: Player;
  rot: RotationT;
  update: (fn: (r: RotationT) => void) => void;
  close: () => void;
  order: number[];
  names: (pid: number) => string;
  /** Among the first five healthy players, the ones who start tonight. */
  starting: boolean;
}) {
  const m = rot.minutes[p.pid] ?? 0;
  const cap = rot.caps[p.pid] ?? 0;
  const at = order.indexOf(p.pid);
  // one tap instead of a run of arrow taps: trade depth-chart spots with anyone
  const swap = (other: number) =>
    update((r) => {
      const o = order.slice();
      const j = o.indexOf(other);
      if (at < 0 || j < 0) return;
      [o[at], o[j]] = [o[j], o[at]];
      r.order = o;
      // the role moves with the spot: he takes the other player's minutes and vice versa
      const mine = r.minutes[p.pid] ?? 0;
      r.minutes[p.pid] = r.minutes[other] ?? 0;
      r.minutes[other] = mine;
    });
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="col" style={{ gap: 6 }}>
        <div className="small bold">
          {starting ? 'Starter' : at < 5 ? 'Starter when healthy' : 'Bench'}, {ordinal(at + 1)} on the depth chart · swap spot and minutes with
        </div>
        <div className="chips">
          {order
            .filter((pid) => pid !== p.pid)
            .map((pid) => {
              const j = order.indexOf(pid);
              return (
                <button key={pid} className="chip" onClick={() => swap(pid)}>
                  {j < 5 ? (
                    <span className="tag info" style={{ height: 16, padding: '0 4px' }}>
                      S
                    </span>
                  ) : (
                    <span className="dim tiny">{j + 1}</span>
                  )}{' '}
                  {names(pid)}
                </button>
              );
            })}
        </div>
      </div>
      <Slider
        label="Target minutes"
        value={m}
        min={0}
        max={44}
        onChange={(x) => update((r) => void (r.minutes[p.pid] = x))}
        format={(x) => `${x} min`}
        help={p.mood.expectedMin ? `He expects about ${p.mood.expectedMin} minutes. Big gaps hurt his mood.` : undefined}
      />
      <Slider
        label="Hard minute cap"
        value={cap}
        min={0}
        max={44}
        onChange={(x) =>
          update((r) => {
            if (x === 0) delete r.caps[p.pid];
            else r.caps[p.pid] = x;
          })
        }
        format={(x) => (x ? `${x} min` : 'None')}
        help="Load management: never exceed this, even in close games."
      />
      <Toggle
        on={rot.closers.includes(p.pid)}
        onChange={(on) =>
          update((r) => {
            r.closers = on ? [...r.closers.filter((x) => x !== p.pid), p.pid].slice(-5) : r.closers.filter((x) => x !== p.pid);
          })
        }
        label="Closing lineup"
        help="Closers play the end of the 4th quarter and overtime (up to five)."
      />
      <Toggle
        on={rot.restB2B.includes(p.pid)}
        onChange={(on) => update((r) => void (r.restB2B = on ? [...r.restB2B, p.pid] : r.restB2B.filter((x) => x !== p.pid)))}
        label="Rest on back-to-backs"
        help={`Season wear: ${Math.round(p.wear)}. Resting lowers wear and injury risk at the cost of a weaker lineup that night.`}
      />
      <button className="btn block" onClick={close}>
        Done
      </button>
    </div>
  );
}
