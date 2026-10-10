import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ChevronsRight, Hand, ListOrdered, Pause, Play, SlidersHorizontal, Timer, Users, Zap } from 'lucide-react';
import { useLeague, useStore } from '../../state/store';
import { prepareLive, clearLive, type LiveGame } from '../../state/live';
import { buildScript, type Script } from '../live/choreo';
import { Court } from '../live/Court';
import { TeamLogo } from '../components/TeamLogo';
import { Card, Chips, Empty, PageHeader, Segmented, Sheet, Slider, Tag, Toggle } from '../components/ui';
import { composites } from '../../core/ratings';
import type { PnrCoverage, PressMode, StarPlan, Tactics } from '../../core/types';
import { COVERAGE_META, PRESS_META, STAR_PLAN_META, cloneTactics } from '../../core/sim/tactics';
import { FINISH_LABEL, type FinishType, type PossLog } from '../../core/sim/log';
import { IMPACT_TEXT } from '../../core/analysis/gameReport';
import { shade } from '../components/ui';
import type { SP } from '../../core/sim/engine';

const SPEEDS = [
  { id: 1, label: '1×' },
  { id: 2, label: '2×' },
  { id: 4, label: '4×' },
];

function fmtClock(sec: number) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return s < 60 ? `${s.toFixed(1)}` : `${m}:${String(r).padStart(2, '0')}`;
}

interface Suggestion {
  id: string;
  text: string;
  action?: { label: string; run: () => void };
}

export default function Live() {
  const league = useLeague();
  const nav = useNavigate();
  const liveRef = useRef<LiveGame | null>(null);
  const [ready, setReady] = useState(false);
  const [none, setNone] = useState(false);
  const [script, setScript] = useState<Script | null>(null);
  const [speed, setSpeed] = useState<number>(() => league.settings.liveSpeed || 1);
  const [paused, setPaused] = useState(false);
  const [clock, setClock] = useState(720);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [feed, setFeed] = useState<PossLog[]>([]);
  const [panel, setPanel] = useState<'none' | 'subs' | 'tactics' | 'stats'>('none');
  const [tick, setTick] = useState(0);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [committedGid, setCommittedGid] = useState<number | null>(null);

  useEffect(() => {
    let lg: LiveGame | null = null;
    useStore.getState().mutate((l) => {
      lg = prepareLive(l);
    });
    if (!lg) {
      setNone(true);
      return;
    }
    liveRef.current = lg;
    const g = lg as LiveGame;
    setScore([g.sim.T[0].score, g.sim.T[1].score]);
    setClock(g.sim.clock);
    setReady(true);
  }, []);

  const live = liveRef.current;
  const userSide = live?.userSide ?? 0;
  const home = live ? league.teams[live.game.home] : null;
  const away = live ? league.teams[live.game.away] : null;

  const info = useCallback(
    (pid: number) => {
      const p = league.players[pid];
      const c = p ? composites(p.ratings) : null;
      return { pid, hgt: p?.ratings.hgt ?? 50, shoot: c?.c3 ?? 50, handle: c?.pnrHandle ?? 50 };
    },
    [league],
  );

  const finish = useCallback(() => {
    const lg = liveRef.current;
    if (!lg || lg.committed) return;
    let gid = 0;
    useStore.getState().mutate((l) => {
      const res = lg.commit(l);
      gid = res.gid;
    });
    clearLive();
    setCommittedGid(gid);
  }, []);

  const nextPossession = useCallback(() => {
    const lg = liveRef.current;
    if (!lg) return;
    if (lg.over) {
      setOver(true);
      setScore([lg.sim.T[0].score, lg.sim.T[1].score]);
      finish();
      return;
    }
    let logs: PossLog[] = [];
    let guard = 0;
    while (!logs.length && !lg.over && guard++ < 5) logs = lg.step();
    if (!logs.length) {
      setTick((t) => t + 1);
      if (lg.over) {
        setOver(true);
        setScore([lg.sim.T[0].score, lg.sim.T[1].score]);
        finish();
      }
      return;
    }
    const lastLog = logs[logs.length - 1];
    setFeed((f) => [...logs.slice().reverse(), ...f].slice(0, 60));
    setScript(buildScript(lastLog, info));
    setTick((t) => t + 1);
  }, [info, finish]);

  useEffect(() => {
    if (ready && !script) nextPossession();
  }, [ready, script, nextPossession]);

  const skip = (to: 'quarter' | 'end') => {
    const lg = liveRef.current;
    if (!lg) return;
    const logs = lg.simTo(to);
    setFeed((f) => [...logs.slice(-30).reverse(), ...f].slice(0, 60));
    setScore([lg.sim.T[0].score, lg.sim.T[1].score]);
    setClock(lg.sim.clock);
    if (lg.over) {
      setOver(true);
      finish();
    } else nextPossession();
  };

  const applyTactics = (fn: (t: Tactics) => void, persist: boolean) => {
    const lg = liveRef.current;
    if (!lg) return;
    const t = cloneTactics(lg.sim.T[userSide].t);
    fn(t);
    lg.sim.setTactics(userSide, t);
    if (persist) {
      useStore.getState().mutate((l) => {
        const tt = l.teams[l.userTid].tactics;
        fn(tt);
        tt.manual = true;
      });
    }
    setTick((x) => x + 1);
  };

  const suggestions = useMemo<Suggestion[]>(() => {
    const lg = liveRef.current;
    if (!lg || over) return [];
    const me = lg.sim.T[userSide];
    const them = lg.sim.T[1 - userSide];
    const out: Suggestion[] = [];
    if (them.run >= 8 && me.timeouts > 0) out.push({ id: `run-${them.score}`, text: `${away && home ? (userSide === 0 ? away.name : home.name) : 'They'} are on a ${them.run}-0 run.`, action: { label: 'Timeout', run: () => (lg.sim.callTimeout(userSide, 'stop the run'), setTick((x) => x + 1)) } });
    for (const p of me.on) {
      if (p.energy < 0.55) {
        const bench = me.players.filter((b) => !b.on && b.out === 0 && b.energy > 0.8).sort((a, b) => b.c.create + b.c.helpD - (a.c.create + a.c.helpD))[0];
        out.push({ id: `tired-${p.pid}-${Math.round(p.energy * 10)}`, text: `${p.name} is gassed (${Math.round(p.energy * 100)}% energy).`, action: bench ? { label: `Sub ${bench.name}`, run: () => (lg.sim.substitute(userSide, p.pid, bench.pid), setTick((x) => x + 1)) } : undefined });
      }
      if (p.fouls >= Math.min(lg.sim.q + 1, 5) && lg.sim.q < 4) out.push({ id: `fouls-${p.pid}-${p.fouls}`, text: `${p.name} has ${p.fouls} fouls.` });
    }
    // opponent play types torching us
    for (const [k, v] of Object.entries(them.pt)) {
      if (v.poss >= 8 && v.pts / v.poss >= 1.3) {
        const ft = k as FinishType;
        const cov = me.t.defense.pnr;
        let advice: Suggestion['action'];
        let text = `Their ${FINISH_LABEL[ft]} is scoring ${(v.pts / v.poss).toFixed(2)} per possession.`;
        if (ft === 'pnrBH' && cov === 'drop') {
          text += ' Drop is giving their handlers room.';
          advice = { label: 'Switch to Hedge', run: () => applyTactics((t) => void (t.defense.pnr = 'hedge'), false) };
        } else if (ft === 'spotup' && me.t.defense.help > 55) {
          text += ' Too much help is leaving shooters open.';
          advice = { label: 'Stay home', run: () => applyTactics((t) => void (t.defense.help = 35), false) };
        } else if (ft === 'transition') {
          advice = { label: 'Sprint back', run: () => applyTactics((t) => void ((t.defense.getBack = 85), (t.offense.crashBoards = Math.min(t.offense.crashBoards, 30))), false) };
        } else if (ft === 'post') {
          advice = { label: 'Double the post', run: () => applyTactics((t) => void (t.defense.help = 80), false) };
        } else if (ft === 'pnrRoll' && cov !== 'drop') {
          advice = { label: 'Go to Drop', run: () => applyTactics((t) => void (t.defense.pnr = 'drop'), false) };
        }
        out.push({ id: `pt-${k}`, text, action: advice });
      }
    }
    for (const [k, v] of Object.entries(me.pt)) {
      if (v.poss >= 9 && v.pts / v.poss <= 0.75) out.push({ id: `mypt-${k}`, text: `Our ${FINISH_LABEL[k as FinishType]} is stalling (${(v.pts / v.poss).toFixed(2)} PPP). Consider running other actions.` });
    }
    // biggest tactical edge against us so far
    const worst = [...lg.sim.impacts.values()].filter((im) => im.t !== userSide && im.pts >= 2.5 && IMPACT_TEXT[im.key]?.advice).sort((a, b) => b.pts - a.pts)[0];
    if (worst) {
      const X = (userSide === 0 ? away : home)?.name ?? 'They';
      const Y = (userSide === 0 ? home : away)?.name ?? 'You';
      out.push({ id: `imp-${worst.key}`, text: `${IMPACT_TEXT[worst.key].text(X, Y, '')} ${IMPACT_TEXT[worst.key].advice}` });
    }
    return out.filter((s) => !dismissed.includes(s.id)).slice(0, 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, dismissed, over]);

  if (none) {
    return (
      <main className="page">
        <PageHeader title="Live" back />
        <Empty>No game for your team today.</Empty>
      </main>
    );
  }
  if (!ready || !live || !home || !away) return <main className="page"><Empty>Preparing the arena…</Empty></main>;

  const sim = live.sim;
  const me = sim.T[userSide];
  const qLabel = sim.q <= 4 ? `Q${sim.q}` : `OT${sim.q - 4 > 1 ? sim.q - 4 : ''}`;
  const colors: [[string, string], [string, string]] = [
    [home.colors[0], home.colors[1] === home.colors[0] ? home.colors[2] : home.colors[1]],
    [away.colors[0], away.colors[1] === away.colors[0] ? away.colors[2] : away.colors[1]],
  ];
  if (colorDistance(colors[0][0], colors[1][0]) < 90) colors[1] = ['#f1f1f1', away.colors[0]];

  return (
    <main className="page" style={{ gap: 10 }}>
      {/* scorebug */}
      <div className="card tight" style={{ background: `linear-gradient(90deg, ${shade(away.colors[0], -0.25)}cc, var(--surface) 40%, var(--surface) 60%, ${shade(home.colors[0], -0.25)}cc)` }}>
        <div className="scorebug">
          <div className="row" style={{ gap: 8 }}>
            <TeamLogo tid={away.tid} size={38} />
            <div>
              <div className="bold">{away.abbrev}</div>
              <div className="tiny dim">TO {sim.T[1].timeouts}{sim.T[0].fouls >= 5 ? ' · BONUS' : ''}</div>
            </div>
            <span className="score" style={{ marginLeft: 'auto' }}>{score[1]}</span>
          </div>
          <div className="col center" style={{ gap: 0, minWidth: 64 }}>
            <span className="display bold" style={{ fontSize: 15 }}>{over ? 'FINAL' : qLabel}</span>
            <span className="display num" style={{ fontSize: 20 }}>{over ? '' : fmtClock(clock)}</span>
          </div>
          <div className="row" style={{ gap: 8, flexDirection: 'row-reverse' }}>
            <TeamLogo tid={home.tid} size={38} />
            <div className="right">
              <div className="bold">{home.abbrev}</div>
              <div className="tiny dim">TO {sim.T[0].timeouts}{sim.T[1].fouls >= 5 ? ' · BONUS' : ''}</div>
            </div>
            <span className="score" style={{ marginRight: 'auto' }}>{score[0]}</span>
          </div>
        </div>
      </div>

      {/* court */}
      <div style={{ position: 'relative' }}>
        <Court
          script={script}
          speed={speed}
          paused={paused || over}
          colors={colors}
          jersey={(pid) => league.players[pid]?.jersey || '0'}
          onDone={nextPossession}
          onTick={(c, s) => {
            setClock((prev) => (Math.abs(prev - c) > 0.4 ? c : prev));
            if (s) setScore((prev) => (prev[0] !== s[0] || prev[1] !== s[1] ? s : prev));
          }}
        />
        {script && !over && (
          <div className="pill" style={{ position: 'absolute', left: 8, bottom: 8, background: 'rgba(6,8,12,0.78)', maxWidth: '85%' }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: colors[script.off][0], border: `1px solid ${colors[script.off][1]}` }} />
            <span className="ellipsis small">{script.label}</span>
          </div>
        )}
      </div>

      {/* controls */}
      {!over ? (
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play' : 'Pause'}>
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <div className="seg" style={{ flex: 'none' }}>
            {SPEEDS.map((s) => (
              <button key={s.id} className={speed === s.id ? 'on' : ''} onClick={() => setSpeed(s.id)} style={{ padding: '0 10px' }}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="grow" />
          <button className="btn sm" onClick={() => skip('quarter')}>
            <ChevronsRight size={16} /> Qtr
          </button>
          <button className="btn sm" onClick={() => skip('end')}>
            End
          </button>
        </div>
      ) : (
        <Card accent>
          <div className="bold" style={{ fontSize: 18 }}>
            Final: {away.abbrev} {score[1]}, {home.abbrev} {score[0]}
          </div>
          <div className="small dim" style={{ marginBottom: 10 }}>
            {(userSide === 0 ? score[0] > score[1] : score[1] > score[0]) ? 'Win! ' : 'Loss. '}The full breakdown shows exactly why.
          </div>
          <button className="btn primary block" disabled={committedGid === null} onClick={() => committedGid !== null && nav(`/game/${committedGid}`, { replace: true })}>
            <Activity size={16} /> Game report
          </button>
        </Card>
      )}

      {suggestions.map((s) => (
        <div key={s.id} className="card tight fade-in" style={{ borderColor: 'color-mix(in srgb, var(--warn) 40%, transparent)' }}>
          <div className="row top">
            <Zap size={16} style={{ color: 'var(--warn)', flex: 'none', marginTop: 2 }} />
            <div className="grow small">{s.text}</div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
            <button className="btn xs ghost" onClick={() => setDismissed((d) => [...d, s.id])}>
              Dismiss
            </button>
            {s.action && (
              <button
                className="btn xs primary"
                onClick={() => {
                  s.action!.run();
                  setDismissed((d) => [...d, s.id]);
                }}
              >
                {s.action.label}
              </button>
            )}
          </div>
        </div>
      ))}

      {!over && (
        <div className="grid4">
          <button className="btn sm" disabled={me.timeouts <= 0} onClick={() => (sim.callTimeout(userSide), setTick((x) => x + 1))}>
            <Timer size={16} /> TO
          </button>
          <button className="btn sm" onClick={() => setPanel('subs')}>
            <Users size={16} /> Subs
          </button>
          <button className="btn sm" onClick={() => setPanel('tactics')}>
            <SlidersHorizontal size={16} /> Plan
          </button>
          <button className="btn sm" onClick={() => setPanel('stats')}>
            <ListOrdered size={16} /> Box
          </button>
        </div>
      )}

      {/* on-court strip */}
      <Card title="On the floor" right={<span className="tiny dim">energy · fouls</span>}>
        <div className="col" style={{ gap: 6 }}>
          {me.on.map((p) => (
            <PlayerStrip key={p.pid} p={p} />
          ))}
        </div>
      </Card>

      <Card title="Play-by-play">
        <div className="col" style={{ gap: 6, maxHeight: 300, overflowY: 'auto' }}>
          {feed.flatMap((f, i) =>
            f.lines
              .slice()
              .reverse()
              .map((line, j) => (
                <div key={`${i}-${j}`} className="row top small" style={{ gap: 8 }}>
                  <span className="tiny dim num" style={{ width: 54 }}>Q{f.q} {fmtClock(f.clockEnd)}</span>
                  <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, background: f.off === 0 ? colors[0][0] : colors[1][0], flex: 'none' }} />
                  <span className="grow dim2">{line}</span>
                </div>
              )),
          )}
        </div>
      </Card>

      <Sheet open={panel === 'subs'} onClose={() => setPanel('none')} title="Substitutions">
        <SubsPanel live={live} side={userSide} onChange={() => setTick((x) => x + 1)} />
      </Sheet>
      <Sheet open={panel === 'tactics'} onClose={() => setPanel('none')} title="In-game adjustments">
        <TacticsPanel live={live} side={userSide} apply={applyTactics} />
      </Sheet>
      <Sheet open={panel === 'stats'} onClose={() => setPanel('none')} title="Live box score">
        <StatsPanel live={live} side={userSide} league={league} />
      </Sheet>
    </main>
  );
}

function colorDistance(a: string, b: string) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

function PlayerStrip({ p }: { p: SP }) {
  const e = Math.round(p.energy * 100);
  return (
    <div className="row small" style={{ gap: 8 }}>
      <span className="bold ellipsis" style={{ width: 92 }}>{p.name}</span>
      <div className="grow">
        <div className="bar" style={{ height: 6 }}>
          <div style={{ width: `${e}%`, background: e < 55 ? 'var(--bad)' : e < 72 ? 'var(--warn)' : 'var(--good)' }} />
        </div>
      </div>
      <span className="num tiny" style={{ width: 30, textAlign: 'right' }}>{e}%</span>
      <span className={`num tiny ${p.fouls >= 4 ? 'bad' : 'dim'}`} style={{ width: 24, textAlign: 'right' }}>{p.fouls}F</span>
      <span className="num tiny dim2" style={{ width: 36, textAlign: 'right' }}>{p.b.pts}p</span>
    </div>
  );
}

function SubsPanel({ live, side, onChange }: { live: LiveGame; side: 0 | 1; onChange: () => void }) {
  const t = live.sim.T[side];
  const [outPid, setOut] = useState<number | null>(null);
  const [, force] = useState(0);
  const bench = t.players.filter((p) => !p.on);
  return (
    <div className="col" style={{ gap: 12 }}>
      <Toggle
        on={t.manualSubs}
        onChange={(v) => {
          t.manualSubs = v;
          force((x) => x + 1);
          onChange();
        }}
        label="I'll handle substitutions"
        help="Off: your staff follows the rotation plan. On: lineups only change when you sub (injuries and foul-outs excepted)."
      />
      <div className="small dim">{outPid === null ? 'Tap a player on the floor, then a bench player.' : 'Now pick who comes in.'}</div>
      <div className="col" style={{ gap: 6 }}>
        {t.on.map((p) => (
          <button key={p.pid} className={`card tight row ${outPid === p.pid ? 'accent' : ''}`} style={{ gap: 8 }} onClick={() => setOut(p.pid)}>
            <Tag tone="info">ON</Tag>
            <span className="bold grow" style={{ textAlign: 'left' }}>{p.name}</span>
            <span className="small num">{Math.round(p.energy * 100)}%</span>
            <span className="small dim num">{p.fouls}F · {p.b.pts}p · {(p.b.sec / 60).toFixed(0)}m</span>
          </button>
        ))}
      </div>
      <div className="col" style={{ gap: 6 }}>
        {bench.map((p) => (
          <button
            key={p.pid}
            className="card tight row"
            style={{ gap: 8, opacity: p.out ? 0.45 : 1 }}
            disabled={!!p.out || outPid === null}
            onClick={() => {
              if (outPid === null) return;
              live.sim.substitute(side, outPid, p.pid);
              setOut(null);
              onChange();
            }}
          >
            <Tag>{p.out === 1 ? 'FOULED OUT' : p.out === 2 ? (p.dnp === 'Rest' ? 'REST' : 'OUT') : 'BENCH'}</Tag>
            <span className="grow" style={{ textAlign: 'left' }}>{p.name}</span>
            <span className="small num">{Math.round(p.energy * 100)}%</span>
            <span className="small dim num">{p.fouls}F · {(p.b.sec / 60).toFixed(0)}m</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TacticsPanel({ live, side, apply }: { live: LiveGame; side: 0 | 1; apply: (fn: (t: Tactics) => void, persist: boolean) => void }) {
  const [persist, setPersist] = useState(false);
  const [, force] = useState(0);
  const t = live.sim.T[side].t;
  const opp = live.sim.T[1 - side];
  const set = (fn: (t: Tactics) => void) => {
    apply(fn, persist);
    force((x) => x + 1);
  };
  return (
    <div className="col" style={{ gap: 16 }}>
      <Toggle on={persist} onChange={setPersist} label="Keep changes after this game" help="Off: adjustments only apply to this game." />
      <div>
        <div className="small bold" style={{ marginBottom: 6 }}>Pick & roll coverage</div>
        <Chips value={t.defense.pnr} onChange={(x: PnrCoverage) => set((tt) => void (tt.defense.pnr = x))} options={(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => ({ id: k, label: COVERAGE_META[k].label }))} />
      </div>
      <Segmented value={t.defense.scheme} onChange={(x) => set((tt) => void (tt.defense.scheme = x))} options={[{ id: 'man', label: 'Man' }, { id: 'zone23', label: '2-3 Zone' }, { id: 'zone32', label: '3-2 Zone' }]} />
      <Slider label="Help defense" value={t.defense.help} onChange={(x) => set((tt) => void (tt.defense.help = x))} left="Stay home" right="Pack paint" />
      <Slider label="Ball pressure" value={t.defense.pressure} onChange={(x) => set((tt) => void (tt.defense.pressure = x))} left="Contain" right="Swarm" />
      <div>
        <div className="small bold" style={{ marginBottom: 6 }}>Press</div>
        <Chips value={t.defense.press} onChange={(x: PressMode) => set((tt) => void (tt.defense.press = x))} options={(Object.keys(PRESS_META) as PressMode[]).map((k) => ({ id: k, label: PRESS_META[k].label }))} />
      </div>
      <div>
        <div className="small bold" style={{ marginBottom: 6 }}>Star plan</div>
        <Chips value={t.defense.starPlan} onChange={(x: StarPlan) => set((tt) => void (tt.defense.starPlan = x))} options={(Object.keys(STAR_PLAN_META) as StarPlan[]).map((k) => ({ id: k, label: STAR_PLAN_META[k].label }))} />
        {t.defense.starPlan !== 'none' && (
          <div className="chips" style={{ marginTop: 8 }}>
            <button className={`chip ${t.defense.starTarget === null ? 'on' : ''}`} onClick={() => set((tt) => void (tt.defense.starTarget = null))}>
              Auto
            </button>
            {opp.on.map((p) => (
              <button key={p.pid} className={`chip ${t.defense.starTarget === p.pid ? 'on' : ''}`} onClick={() => set((tt) => void (tt.defense.starTarget = p.pid))}>
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <Slider label="Pace" value={t.offense.pace} onChange={(x) => set((tt) => void (tt.offense.pace = x))} left="Grind" right="Run" />
      <Slider label="Three-point emphasis" value={t.offense.threePoint} onChange={(x) => set((tt) => void (tt.offense.threePoint = x))} left="Mid ok" right="Threes" />
      <Slider label="Attack the rim" value={t.offense.rimAttack} onChange={(x) => set((tt) => void (tt.offense.rimAttack = x))} left="Settle" right="Downhill" />
      <Toggle on={t.offense.huntMismatch} onChange={(x) => set((tt) => void (tt.offense.huntMismatch = x))} label="Hunt mismatches" />
      <div className="tiny dim">
        <Hand size={12} style={{ verticalAlign: -2 }} /> Changes take effect on the next possession.
      </div>
    </div>
  );
}

function StatsPanel({ live, side, league }: { live: LiveGame; side: 0 | 1; league: ReturnType<typeof useLeague> }) {
  const [team, setTeam] = useState<0 | 1>(side);
  const res = live.sim.result();
  const tb = team === 0 ? res.home : res.away;
  const pt = Object.entries(tb.playTypes).sort((a, b) => b[1].poss - a[1].poss);
  return (
    <div className="col" style={{ gap: 12 }}>
      <Segmented value={String(team)} onChange={(v) => setTeam(Number(v) as 0 | 1)} options={[{ id: '1', label: league.teams[res.away.tid].abbrev }, { id: '0', label: league.teams[res.home.tid].abbrev }]} />
      <div className="tablewrap">
        <table className="stats">
          <thead>
            <tr>
              <th className="l sticky">Player</th>
              <th>MIN</th>
              <th>PTS</th>
              <th>REB</th>
              <th>AST</th>
              <th>FG</th>
              <th>3P</th>
              <th>FT</th>
              <th>+/-</th>
            </tr>
          </thead>
          <tbody>
            {tb.players
              .filter((p) => p.min > 0)
              .map((p) => (
                <tr key={p.pid}>
                  <td className="l sticky">{p.name.split(' ').slice(-1)[0]}</td>
                  <td>{Math.round(p.min)}</td>
                  <td className="bold">{p.pts}</td>
                  <td>{p.orb + p.drb}</td>
                  <td>{p.ast}</td>
                  <td>{p.fgm}-{p.fga}</td>
                  <td>{p.tpm}-{p.tpa}</td>
                  <td>{p.ftm}-{p.fta}</td>
                  <td>{p.pm > 0 ? `+${p.pm}` : p.pm}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Card title="Play types so far">
        <div className="col" style={{ gap: 4 }}>
          {pt.map(([k, v]) => (
            <div key={k} className="row small">
              <span className="grow">{FINISH_LABEL[k as FinishType] ?? k}</span>
              <span className="dim num">{v.poss} poss</span>
              <span className="num bold" style={{ width: 48, textAlign: 'right' }}>{(v.pts / Math.max(1, v.poss)).toFixed(2)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
