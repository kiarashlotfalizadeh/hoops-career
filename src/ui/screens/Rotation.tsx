// Team → Rotation: the depth chart with each player's minute target (wear and mood risks marked on
// his row), the assistant's switch, the staff's advice on the rotation, and the stint plan the
// targets make. A player's sheet sets his spot, minutes, cap, closing and rest on back-to-backs.
import { attrDisplay } from '../../core/ratings';
import { Fragment, useEffect, useState } from 'react';
import { ArrowUp, BedDouble, Undo2 } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { edit, touch } from '../../state/actions';
import { rosterSorted } from '../../core/league/helpers';
import { ensureRotation } from '../../core/league/games';
import { guideVisit } from '../../core/league/agenda';
import { shortOfMinutes } from '../../core/league/moraleView';
import { buildMinutePlan, normalizeMinutes, planInputs, planRoles } from '../../core/sim/rotationPlan';
import { Avatar, Help, Ovr, Section, Sheet, Slider, Statline, Tag, Toggle, activateOnKey } from '../components/ui';
import { AssistantCards } from '../components/Assistant';
import { Term } from '../components/Glossary';
import type { Player, Rotation as RotationT } from '../../core/types';
import { f1, ordinal, playerSeason, rosterNames, startingFive } from '../stats';
import { plural } from '../../core/format';
import { swapSpots } from '../../core/analysis/lineups';
import { MoodMark } from '../team/MoodMark';
import './team.css';

/** The most a target can be. */
const MAX_MIN = 44;
/** Season wear the staff flags (as the advisor does). */
const WORN = 55;

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
  const [editing, setEditing] = useState<number | null>(null);
  // the rotation the assistant replaced, until the next edit
  const [undo, setUndo] = useState<RotationT | null>(null);
  const simming = useStore((s) => !!s.sim);
  // the guided first week's "check your rotation" is done once it's been looked at
  useEffect(() => void touch((l) => void guideVisit(l, 'rotation')), []);

  const update = (fn: (r: RotationT) => void) => {
    setUndo(null);
    edit((l) => {
      const r = l.teams[l.userTid].rotation;
      fn(r);
      r.manual = true;
    });
  };
  const setAssistant = (on: boolean) => {
    if (on) {
      const before = structuredClone(rot);
      // the assistant's rotation as the next game would have it: two-way players at the end of the bench too
      if (
        edit((l) => {
          l.teams[l.userTid].rotation.manual = false;
          ensureRotation(l, l.userTid);
        })
      )
        setUndo(before);
    } else if (edit((l) => void (l.teams[l.userTid].rotation.manual = true))) setUndo(null);
  };

  const healthyOrder = order.filter((pid) => !byId.get(pid)?.injury);
  const total = healthyOrder.reduce((a, pid) => a + (rot.minutes[pid] ?? 0), 0);
  const injuredMin = order.reduce((a, pid) => a + (byId.get(pid)?.injury ? (rot.minutes[pid] ?? 0) : 0), 0);
  const startMin = healthyOrder.slice(0, 5).reduce((a, pid) => a + (rot.minutes[pid] ?? 0), 0);
  const closers = rot.closers.filter((pid) => byId.has(pid));
  // the engine starts the first five healthy players: the Bench heading goes after the fifth
  const startSet = startingFive(order.map((pid) => byId.get(pid)!));
  const benchFrom = healthyOrder.length >= 5 ? order.indexOf(healthyOrder[4]) + 1 : order.length;

  // planned stints: the engine's own plan inputs (injured players' minutes handed out, caps, an
  // assistant-managed rotation's shorter playoff eight)
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

  // one arrow a row: he trades places with the player above (to move one down, move the next one up)
  const moveUp = (pid: number) =>
    update((r) => {
      const o = order.slice();
      const i = o.indexOf(pid);
      if (i < 1) return;
      [o[i - 1], o[i]] = [o[i], o[i - 1]];
      r.order = o;
    });

  const ep = editing !== null ? byId.get(editing) : null;

  return (
    <>
      <div className="tm-auto">
        <Toggle
          on={!rot.manual}
          disabled={simming}
          onChange={setAssistant}
          label="Let the assistant manage"
          help={
            !rot.manual
              ? 'He sets the starters and minutes from the roster and adjusts for injuries. Your next edit takes over.'
              : 'You set it. Turn on to hand it back: he rebuilds it from the roster.'
          }
        />
        {undo && !simming && (
          <div className="tm-undo">
            <span className="grow">{undo.manual ? 'Your rotation was replaced.' : 'Rotation refreshed.'}</span>
            <button
              className="btn xs"
              onClick={() => {
                if (edit((l) => void (l.teams[l.userTid].rotation = undo))) setUndo(null);
              }}
            >
              <Undo2 size={14} /> Undo
            </button>
          </div>
        )}
      </div>

      <AssistantCards league={league} areas={['team']} max={2} />

      <div className="tm-rsum">
        <Statline
          items={[
            { k: 'Targets', v: total, s: total === 240 ? 'of 240 min' : 'min, scaled to 240' },
            { k: 'Starters', v: startMin, s: 'min, first five' },
            { k: 'Bench', v: total - startMin, s: 'min, the rest' },
          ]}
        />
        {injuredMin > 0 && <div className="tm-rsum-note warn">{injuredMin} injured minutes go to the healthy players.</div>}
      </div>

      <Section
        title="Depth chart"
        right={
          <Help title="How rotations work">
            <p>
              The first five healthy players start. The staff turns your minute targets into a stint plan (below), scaled to exactly 240 minutes, and follows it at dead balls.
              Fouls, fatigue, injuries and blowouts change it in the game.
            </p>
            <p>
              Closers finish the 4th quarter and overtime when healthy. Players who rest on back-to-backs sit the second night, which lowers <Term id="wear">wear</Term> and injury
              risk.
            </p>
            <p>
              The arrow on a row swaps him with the player above. A row marks a worn-down player (wear {WORN}+) and one whose target is well short of the minutes he expects, which
              costs his mood.
            </p>
          </Help>
        }
      >
        <div className="card flush">
          <div className="list">
            {order.map((pid, i) => {
              const p = byId.get(pid)!;
              const m = rot.minutes[pid] ?? 0;
              const pg = playerSeason(p, league.season);
              const short = shortOfMinutes(p, m);
              return (
                <Fragment key={pid}>
                  {(i === 0 || i === benchFrom) && <div className="list-divider">{i === 0 ? 'Starters' : 'Bench'}</div>}
                  {/* an injured player is marked Out and greyed by colour, not opacity: the OVR badge and jersey keep their contrast */}
                  <div className={`listrow tm-rrow ${p.injury ? 'out' : ''}`}>
                    <button
                      className="iconbtn tm-rup"
                      onClick={() => moveUp(pid)}
                      aria-label={i > 0 ? `Move ${p.firstName} ${p.lastName} up, above ${fullNameOf(order[i - 1])}` : `${p.firstName} ${p.lastName} is first`}
                      disabled={i === 0 || simming}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <Avatar p={p} />
                    <div
                      className="tm-rrow-main"
                      role="button"
                      tabIndex={0}
                      aria-haspopup="dialog"
                      onClick={() => setEditing(pid)}
                      onKeyDown={activateOnKey(() => setEditing(pid))}
                    >
                      <div className="grow">
                        {/* tags drop below a long name instead of cutting it off */}
                        <div className="tm-rname">
                          <span className="ellipsis">{fullNameOf(pid)}</span>
                          {p.injury && <Tag tone="bad">Out</Tag>}
                          {closers.includes(pid) && <Tag>Closer</Tag>}
                          {rot.restB2B.includes(pid) && <BedDouble size={14} className="dim" aria-label="Rests on back-to-backs" />}
                          <MoodMark p={p} />
                        </div>
                        {/* the risks first, so a narrow row cuts the stamina, not them */}
                        <div className="lr-meta ellipsis">
                          {p.pos} · {p.injury ? `${p.injury.type}, ${plural(p.injury.gamesRemaining, 'game')}` : pg ? `${f1(pg.min)} mpg` : p.archetype}
                          {p.wear >= WORN && <span className="warn"> · wear {Math.round(p.wear)}</span>}
                          {short && <span className="warn"> · wants {p.mood.expectedMin} min</span>}
                          {` · stamina ${attrDisplay(p.ratings.end)}`}
                          {p.wear >= 30 && p.wear < WORN ? ` · wear ${Math.round(p.wear)}` : ''}
                        </div>
                      </div>
                      <span className="tm-rmin">
                        <span className={`tm-rmin-v num ${short ? 'warn' : ''}`}>{m}</span>
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
      </Section>

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

      <Sheet open={!!ep} onClose={() => setEditing(null)} title={ep ? `${ep.firstName} ${ep.lastName}` : ''}>
        {ep && <EditPlayer p={ep} rot={rot} update={update} close={() => setEditing(null)} order={order} names={nameOf} starters={startSet} busy={simming} />}
      </Sheet>
    </>
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

function EditPlayer({
  p,
  rot,
  update,
  close,
  order,
  names,
  starters,
  busy,
}: {
  p: Player;
  rot: RotationT;
  update: (fn: (r: RotationT) => void) => void;
  close: () => void;
  order: number[];
  names: (pid: number) => string;
  /** The first five healthy players: the ones who start tonight. */
  starters: Set<number>;
  /** A sim is running: the league can't change. */
  busy: boolean;
}) {
  const starting = starters.has(p.pid);
  const m = rot.minutes[p.pid] ?? 0;
  const cap = rot.caps[p.pid] ?? 0;
  const at = order.indexOf(p.pid);
  // one tap instead of a run of arrow taps: trade depth-chart spots (and minutes: the role moves with the spot) with anyone
  const swap = (other: number) => update((r) => swapSpots(r, order, p.pid, other));
  const short = shortOfMinutes(p, m);
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
                <button key={pid} className="chip tm-swap" disabled={busy} onClick={() => swap(pid)}>
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
            disabled={busy}
            onChange={(x) => update((r) => void (r.minutes[p.pid] = x))}
            format={(x) => `${x} min`}
            help={p.mood.expectedMin ? <span className={short ? 'warn' : undefined}>He expects about {p.mood.expectedMin}.</span> : undefined}
          />
          <Slider
            label="Hard minute cap"
            value={cap}
            min={0}
            max={MAX_MIN}
            disabled={busy}
            onChange={(x) =>
              update((r) => {
                if (x === 0) delete r.caps[p.pid];
                else r.caps[p.pid] = x;
              })
            }
            format={(x) => (x ? `${x} min` : 'None')}
            help={cap && cap < m ? `Under his ${m}-minute target: ${cap} at most, even in close games.` : 'Never more, even in close games.'}
          />
        </div>
      </Section>
      <Section title="Late game and rest">
        <div className="tm-ed-group">
          <Toggle
            on={rot.closers.includes(p.pid)}
            disabled={busy}
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
            disabled={busy}
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
