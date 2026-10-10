import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BedDouble, Wand2 } from 'lucide-react';
import { useLeague, useStore } from '../../state/store';
import { rosterSorted } from '../../core/league/helpers';
import { autoRotation, evaluateLineup } from '../../core/ai/coachAI';
import { buildMinutePlan, normalizeMinutes, type PlanPlayer } from '../../core/sim/rotationPlan';
import { Avatar, Card, Help, Ovr, PageHeader, Sheet, Slider, Tag, Toggle } from '../components/ui';
import type { Player, Rotation as RotationT } from '../../core/types';
import { f1, playerSeason } from '../stats';

export default function Rotation() {
  const league = useLeague();
  const v = useStore((s) => s.v);
  const team = league.teams[league.userTid];
  const rot = team.rotation;
  const players = useMemo(() => rosterSorted(league, league.userTid), [league, v]);
  const byId = new Map(players.map((p) => [p.pid, p]));
  const order = rot.order.filter((pid) => byId.has(pid));
  for (const p of players) if (!order.includes(p.pid)) order.push(p.pid);
  const [edit, setEdit] = useState<number | null>(null);

  const update = (fn: (r: RotationT) => void) =>
    useStore.getState().mutate((l) => {
      const r = l.teams[l.userTid].rotation;
      fn(r);
      r.manual = true;
    });

  const healthyOrder = order.filter((pid) => !byId.get(pid)?.injury);
  const total = healthyOrder.reduce((a, pid) => a + (rot.minutes[pid] ?? 0), 0);
  const starters = healthyOrder.slice(0, 5).map((pid) => byId.get(pid)!);
  const startEval = starters.length === 5 ? evaluateLineup(starters) : null;
  const closers = rot.closers.filter((pid) => byId.has(pid));

  // planned stints visual (what the engine will follow)
  const plan = useMemo(() => {
    const pp: PlanPlayer[] = healthyOrder.map((pid, i) => {
      const p = byId.get(pid)!;
      return { pid, minutes: rot.minutes[pid] ?? 0, starter: i < 5, closer: closers.includes(pid), guard: p.ratings.hnd >= 55 || p.pos === 'PG' || p.pos === 'SG', big: p.ratings.hgt >= 60 || p.pos === 'C', endurance: p.ratings.end };
    });
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
    <main className="page">
      <PageHeader
        title="Rotation"
        back
        sub={rot.manual ? 'Custom rotation' : 'Assistant-managed (updates for injuries automatically)'}
        right={
          <button
            className="btn sm"
            onClick={() =>
              useStore.getState().mutate((l) => {
                l.teams[l.userTid].rotation = autoRotation(rosterSorted(l, l.userTid), l.teams[l.userTid].rotation);
              })
            }
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
          </div>
          <Help title="How rotations work">
            <p>The first five players start. The coaching staff turns your minute targets into a stint plan (shown below) and follows it at dead balls, pulling players early for foul trouble or fatigue.</p>
            <p>Closers finish the 4th quarter and overtime when healthy. Players on "rest on back-to-backs" sit the second night of back-to-backs, which lowers wear and injury risk.</p>
          </Help>
        </div>
        {startEval && startEval.notes.length > 0 && (
          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
            {startEval.notes.map((n) => (
              <Tag key={n} tone="warn">{n}</Tag>
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
              <div key={pid} className="listrow" style={{ opacity: p.injury ? 0.55 : 1, background: i < 5 ? 'color-mix(in srgb, var(--accent) 7%, transparent)' : undefined }}>
                <div className="col" style={{ gap: 2 }}>
                  <button className="iconbtn" style={{ width: 30, height: 26 }} onClick={() => move(pid, -1)} aria-label="Move up" disabled={i === 0}>
                    <ArrowUp size={16} />
                  </button>
                  <button className="iconbtn" style={{ width: 30, height: 26 }} onClick={() => move(pid, 1)} aria-label="Move down" disabled={i === order.length - 1}>
                    <ArrowDown size={16} />
                  </button>
                </div>
                <Avatar p={p} />
                <div className="grow" onClick={() => setEdit(pid)} style={{ cursor: 'pointer' }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="bold ellipsis">{p.firstName[0]}. {p.lastName}</span>
                    {i < 5 && <Tag tone="info">Starter</Tag>}
                    {closers.includes(pid) && <Tag>Closer</Tag>}
                    {rot.restB2B.includes(pid) && <BedDouble size={14} className="dim" />}
                  </div>
                  <div className="tiny dim">
                    {p.pos} · {p.injury ? `${p.injury.type} (${p.injury.gamesRemaining}g)` : pg ? `${f1(pg.min)} mpg actual` : p.archetype} · stamina {Math.round(p.ratings.end)}{p.wear >= 30 ? ` · wear ${Math.round(p.wear)}` : ''}
                  </div>
                  <div className="bar" style={{ marginTop: 5, height: 5 }}>
                    <div style={{ width: `${(m / 44) * 100}%` }} />
                  </div>
                </div>
                <div className="col" style={{ alignItems: 'flex-end', gap: 2 }} onClick={() => setEdit(pid)}>
                  <span className="display num" style={{ fontSize: 22 }}>{m}</span>
                  <Ovr v={p.ovr} size="sm" />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Stint plan" right={<span className="tiny dim">48 minutes →</span>}>
        <div className="col" style={{ gap: 3 }}>
          {healthyOrder
            .filter((pid) => (plan.norm[pid] ?? 0) > 0)
            .map((pid) => {
              const p = byId.get(pid)!;
              return (
                <div key={pid} className="row" style={{ gap: 6 }}>
                  <span className="tiny ellipsis" style={{ width: 70 }}>{p.lastName}</span>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(48, 1fr)', gap: 1 }}>
                    {plan.slots.map((slot, s) => (
                      <div key={s} style={{ height: 12, borderRadius: 2, background: slot.includes(pid) ? 'var(--accent)' : 'var(--surface-3)', marginLeft: s % 12 === 0 && s ? 3 : 0 }} />
                    ))}
                  </div>
                  <span className="tiny num dim" style={{ width: 20, textAlign: 'right' }}>{plan.norm[pid]}</span>
                </div>
              );
            })}
        </div>
        <div className="row between tiny dim" style={{ marginTop: 6, paddingLeft: 76, paddingRight: 26 }}>
          <span>Q1</span>
          <span>Q2</span>
          <span>Q3</span>
          <span>Q4</span>
        </div>
      </Card>

      <Sheet open={!!ep} onClose={() => setEdit(null)} title={ep ? `${ep.firstName} ${ep.lastName}` : ''}>
        {ep && <EditPlayer p={ep} rot={rot} update={update} close={() => setEdit(null)} />}
      </Sheet>
    </main>
  );
}

function EditPlayer({ p, rot, update, close }: { p: Player; rot: RotationT; update: (fn: (r: RotationT) => void) => void; close: () => void }) {
  const m = rot.minutes[p.pid] ?? 0;
  const cap = rot.caps[p.pid] ?? 0;
  return (
    <div className="col" style={{ gap: 16 }}>
      <Slider label="Target minutes" value={m} min={0} max={44} onChange={(x) => update((r) => void (r.minutes[p.pid] = x))} format={(x) => `${x} min`} help={p.mood.expectedMin ? `He expects about ${p.mood.expectedMin} minutes. Big gaps hurt his mood.` : undefined} />
      <Slider label="Hard minute cap" value={cap} min={0} max={44} onChange={(x) => update((r) => { if (x === 0) delete r.caps[p.pid]; else r.caps[p.pid] = x; })} format={(x) => (x ? `${x} min` : 'None')} help="Load management: never exceed this, even in close games." />
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
      <Toggle on={rot.restB2B.includes(p.pid)} onChange={(on) => update((r) => void (r.restB2B = on ? [...r.restB2B, p.pid] : r.restB2B.filter((x) => x !== p.pid)))} label="Rest on back-to-backs" help={`Season wear: ${Math.round(p.wear)}. Resting lowers wear and injury risk at the cost of a weaker lineup that night.`} />
      <button className="btn block" onClick={close}>
        Done
      </button>
    </div>
  );
}
