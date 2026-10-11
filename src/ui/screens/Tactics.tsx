import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FlaskConical, Sparkles, Undo2 } from 'lucide-react';
import { useLeague, useStore } from '../../state/store';
import type { ActionType, DefScheme, OffRole, PnrCoverage, PressMode, ShotFreedom, StarPlan, Tactics as TacticsT } from '../../core/types';
import { ACTION_META, COVERAGE_META, DEF_PRESETS, OFF_PRESETS, PRESS_META, SCHEME_META, STAR_PLAN_META, applyDefPreset, applyOffPreset, cloneTactics } from '../../core/sim/tactics';
import { autoTactics, defPresetFit, offPresetFit, rosterProfile } from '../../core/ai/coachAI';
import { rosterSorted } from '../../core/league/helpers';
import { ROLE_META, archetype, attrDisplay, composites } from '../../core/ratings';
import { Avatar, Card, Chips, Help, Ovr, PageHeader, Segmented, Sheet, Slider, Tag, Toggle, activateOnKey } from '../components/ui';
import { teamAlerts } from '../../core/ai/advisor';
import { setLabBaseline } from './labBridge';
import { seasonImpacts, seasonPlayTypes } from '../seasonAnalysis';
import { IMPACT_TEXT } from '../../core/analysis/gameReport';
import { FINISH_LABEL, type FinishType } from '../../core/sim/log';

type Tab = 'playbook' | 'offense' | 'defense' | 'roles' | 'manage' | 'insights';

function fitScale(fits: Record<string, number>) {
  const vals = Object.values(fits);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  return (k: string) => Math.round(45 + ((fits[k] - min) / Math.max(1, max - min)) * 55);
}

function FitTag({ v }: { v: number }) {
  const tone = v >= 88 ? 'good' : v >= 70 ? 'info' : v >= 58 ? 'warn' : 'bad';
  return <Tag tone={tone}>Fit {v}</Tag>;
}

export default function Tactics() {
  const league = useLeague();
  const nav = useNavigate();
  const v = useStore((s) => s.v);
  const [params, setParams] = useSearchParams();
  const complexity = league.settings.complexity;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'playbook', label: 'Playbook' },
    ...(complexity !== 'simple'
      ? [
          { id: 'offense' as Tab, label: 'Offense' },
          { id: 'defense' as Tab, label: 'Defense' },
        ]
      : []),
    ...(complexity === 'expert'
      ? [
          { id: 'roles' as Tab, label: 'Roles' },
          { id: 'manage' as Tab, label: 'Game Mgmt' },
        ]
      : []),
    { id: 'insights', label: 'Insights' },
  ];
  const tab = (tabs.find((t) => t.id === params.get('tab'))?.id ?? 'playbook') as Tab;
  const team = league.teams[league.userTid];
  const t = team.tactics;
  const snapshot = useRef<TacticsT>(cloneTactics(t));
  const changed = JSON.stringify(snapshot.current) !== JSON.stringify(t);
  const players = useMemo(() => rosterSorted(league, league.userTid), [league, v]);
  const healthy = useMemo(() => players.filter((p) => !p.injury), [players]);
  const prof = useMemo(() => rosterProfile(healthy), [healthy]);
  const offFit = useMemo(() => fitScale(offPresetFit(prof)), [prof]);
  const defFit = useMemo(() => fitScale(defPresetFit(prof)), [prof]);
  const alerts = useMemo(() => teamAlerts(league, league.userTid).filter((a) => a.link === '/tactics'), [league, v]);

  const edit = (fn: (t: TacticsT) => void) =>
    useStore.getState().mutate((l) => {
      const tt = l.teams[l.userTid].tactics;
      fn(tt);
      tt.manual = true;
    });

  // personnel hints
  const starters = team.rotation.order.slice(0, 5).map((pid) => league.players[pid]).filter(Boolean);
  const big = [...starters].sort((a, b) => b.ratings.hgt - a.ratings.hgt)[0];
  const bigC = big ? composites(big.ratings) : null;

  return (
    <main className="page" style={{ paddingBottom: changed ? 'calc(var(--nav-h) + 96px)' : undefined }}>
      <PageHeader
        title="Tactics"
        sub={`${OFF_PRESETS.find((x) => x.id === t.offPreset)?.name ?? 'Custom'} · ${DEF_PRESETS.find((x) => x.id === t.defPreset)?.name ?? 'Custom'}${t.manual ? ' · Custom' : ' · Assistant-managed'}`}
        right={
          <Link to="/lab" className="btn sm">
            <FlaskConical size={16} /> Lab
          </Link>
        }
      />
      <Card>
        <Toggle
          on={!t.manual}
          onChange={(on) =>
            useStore.getState().mutate((l) => {
              const tm = l.teams[l.userTid];
              if (on) {
                tm.tactics = autoTactics({ ...tm, tactics: { ...tm.tactics, manual: false } }, rosterSorted(l, l.userTid), false);
              } else tm.tactics.manual = true;
            })
          }
          label="Let the assistant coach manage tactics"
          help={!t.manual ? 'He re-fits the playbook whenever the roster changes. Any edit you make switches this off.' : 'You are in control. Turn this on to hand the clipboard back.'}
        />
      </Card>
      {alerts.map((a) => (
        <Card key={a.id}>
          <div className="row top">
            <Sparkles size={18} style={{ color: 'var(--warn)', flex: 'none', marginTop: 2 }} />
            <div className="grow">
              <div className="bold small">{a.title}</div>
              <div className="small dim">{a.body}</div>
            </div>
          </div>
        </Card>
      ))}
      {tabs.length > 1 && <Segmented value={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} options={tabs} />}

      {tab === 'playbook' && (
        <>
          <Card title="Offensive playbook" right={<Help title="Playbooks">A playbook sets pace, shot profile and which actions you run. "Fit" scores how well your current roster suits it: creators, shooters, passers, bigs and athleticism. You can fine-tune any playbook in the Offense tab.</Help>}>
            <div className="col grid-md2" style={{ gap: 8 }}>
              {OFF_PRESETS.map((p) => (
                <button
                  key={p.id}
                  aria-pressed={t.offPreset === p.id}
                  className="card tight"
                  style={{ textAlign: 'left', borderColor: t.offPreset === p.id ? 'var(--accent)' : undefined, background: t.offPreset === p.id ? 'color-mix(in srgb, var(--accent) 16%, var(--surface))' : undefined }}
                  onClick={() =>
                    edit((tt) => {
                      tt.offense = applyOffPreset(tt.offense, p.id);
                      tt.offPreset = p.id;
                    })
                  }
                >
                  <div className="row between">
                    <span className="bold">{p.name}</span>
                    <FitTag v={offFit(p.id)} />
                  </div>
                  <div className="small dim2">{p.tagline}. {p.description}</div>
                  <div className="tiny dim" style={{ marginTop: 4 }}>Best for: {p.bestFor}</div>
                </button>
              ))}
            </div>
          </Card>
          <Card title="Defensive identity">
            <div className="col grid-md2" style={{ gap: 8 }}>
              {DEF_PRESETS.map((p) => (
                <button
                  key={p.id}
                  aria-pressed={t.defPreset === p.id}
                  className="card tight"
                  style={{ textAlign: 'left', borderColor: t.defPreset === p.id ? 'var(--accent)' : undefined, background: t.defPreset === p.id ? 'color-mix(in srgb, var(--accent) 16%, var(--surface))' : undefined }}
                  onClick={() =>
                    edit((tt) => {
                      tt.defense = applyDefPreset(tt.defense, p.id);
                      tt.defPreset = p.id;
                    })
                  }
                >
                  <div className="row between">
                    <span className="bold">{p.name}</span>
                    <FitTag v={defFit(p.id)} />
                  </div>
                  <div className="small dim2">{p.tagline}. {p.description}</div>
                  <div className="tiny dim" style={{ marginTop: 4 }}>Best for: {p.bestFor}</div>
                </button>
              ))}
            </div>
          </Card>
          {complexity === 'simple' && (
            <Card title="Tempo">
              <Slider label="Pace" value={t.offense.pace} onChange={(x) => edit((tt) => void (tt.offense.pace = x))} left="Grind" right="Run & gun" help="Faster pace means more possessions and transition chances, but more turnovers and fatigue." />
            </Card>
          )}
        </>
      )}

      {tab === 'offense' && (
        <>
          <Card title="Tempo">
            <div className="col" style={{ gap: 16 }}>
              <Slider label="Pace" value={t.offense.pace} onChange={(x) => edit((tt) => void (tt.offense.pace = x))} left="Grind" right="Run & gun" help="Seconds you take per half-court possession. Faster = more possessions, slightly more turnovers, more fatigue." />
              <Slider label="Push in transition" value={t.offense.transition} onChange={(x) => edit((tt) => void (tt.offense.transition = x))} left="Walk it up" right="Always run" help="How often you attack before the defense sets after rebounds and steals. Transition is the most efficient offense in basketball." />
            </div>
          </Card>
          <Card title="Actions" right={<Help title="How actions are chosen">Each half-court trip, the offense picks an action weighted by these sliders and by how well the players on the floor can run it. A PnR-heavy plan with no ball handler on the floor will naturally drift to other actions.</Help>}>
            <div className="col" style={{ gap: 16 }}>
              {(Object.keys(ACTION_META) as ActionType[]).map((a) => (
                <Slider key={a} label={ACTION_META[a].label} value={t.offense.actions[a]} onChange={(x) => edit((tt) => void (tt.offense.actions[a] = x))} left="Rarely" right="Constantly" help={ACTION_META[a].help} />
              ))}
            </div>
          </Card>
          <Card title="Shot profile">
            <div className="col" style={{ gap: 16 }}>
              <Slider label="Three-point emphasis" value={t.offense.threePoint} onChange={(x) => edit((tt) => void (tt.offense.threePoint = x))} left="Mid-range ok" right="Rim & 3s only" help="Higher values turn mid-range looks into threes. Great with shooters; bad shooting teams lose efficiency." />
              <Slider label="Attack the rim" value={t.offense.rimAttack} onChange={(x) => edit((tt) => void (tt.offense.rimAttack = x))} left="Settle" right="Downhill" help="How often ball handlers drive to the basket. Draws fouls and opens kick-outs, but runs into rim protectors." />
              <Slider label="Crash the offensive glass" value={t.offense.crashBoards} onChange={(x) => edit((tt) => void (tt.offense.crashBoards = x))} left="Get back" right="Crash" help="More offensive rebounds and second chances, but more fast breaks allowed the other way." />
              <Toggle on={t.offense.huntMismatch} onChange={(x) => edit((tt) => void (tt.offense.huntMismatch = x))} label="Hunt mismatches" help="Target the weakest defender with isolations and ball screens. Strong against switching defenses." />
              <Toggle on={t.offense.hotHand} onChange={(x) => edit((tt) => void (tt.offense.hotHand = x))} label="Feed the hot hand" help="Players who have made several shots in a row get more touches." />
            </div>
          </Card>
        </>
      )}

      {tab === 'defense' && (
        <>
          <Card title="Base scheme">
            <Chips value={t.defense.scheme} onChange={(x: DefScheme) => edit((tt) => void (tt.defense.scheme = x))} options={(Object.keys(SCHEME_META) as DefScheme[]).map((k) => ({ id: k, label: SCHEME_META[k].label }))} />
            <div className="small dim" style={{ marginTop: 8 }}>{SCHEME_META[t.defense.scheme].help}</div>
          </Card>
          <Card title="Pick & roll coverage" right={<Help title="Coverages explained">{(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => <p key={k}><b>{COVERAGE_META[k].label}:</b> {COVERAGE_META[k].help}</p>)}</Help>}>
            <Chips value={t.defense.pnr} onChange={(x: PnrCoverage) => edit((tt) => void (tt.defense.pnr = x))} options={(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => ({ id: k, label: COVERAGE_META[k].label }))} />
            <div className="small dim" style={{ marginTop: 8 }}>{COVERAGE_META[t.defense.pnr].help}</div>
            {big && bigC && (
              <div className="small" style={{ marginTop: 8 }}>
                <span className="dim">Your starting big, {big.lastName}: rim protection {attrDisplay(bigC.rimProt)}, speed {attrDisplay(big.ratings.spd)}. </span>
                {t.defense.pnr === 'drop' && (bigC.rimProt >= 60 ? <span className="good">Built for drop.</span> : <span className="warn">Not much of a rim deterrent for drop.</span>)}
                {t.defense.pnr === 'switch' && (big.ratings.spd >= 45 ? <span className="good">Mobile enough to switch.</span> : <span className="warn">Guards will hunt him on switches.</span>)}
                {t.defense.pnr === 'hedge' && (big.ratings.spd >= 45 ? <span className="good">Can show and recover.</span> : <span className="warn">May be slow to recover to the roller.</span>)}
                {t.defense.pnr === 'blitz' && <span className="dim2">Blitzing needs length and quick hands on the back line.</span>}
                {t.defense.pnr === 'ice' && <span className="dim2">Ice needs disciplined guards to force sideline.</span>}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <Toggle on={t.defense.switchOffBall} onChange={(x) => edit((tt) => void (tt.defense.switchOffBall = x))} label="Switch off-ball screens" help="Neutralizes handoffs and movement shooters; can create mismatches." />
            </div>
          </Card>
          <Card title="Help & pressure">
            <div className="col" style={{ gap: 16 }}>
              <Slider label="Help defense" value={t.defense.help} onChange={(x) => edit((tt) => void (tt.defense.help = x))} left="Stay home" right="Pack the paint" help="Packing the paint walls off drives and post-ups but gives up kick-out threes. Stay home against good shooting teams." />
              <Slider label="Ball pressure" value={t.defense.pressure} onChange={(x) => edit((tt) => void (tt.defense.pressure = x))} left="Contain" right="Swarm" help="More steals and turnovers, but quick creators blow by and backdoor cuts open up. Also more fouls." />
              <Slider label="Physicality" value={t.defense.physicality} onChange={(x) => edit((tt) => void (tt.defense.physicality = x))} left="Clean" right="Physical" help="Tighter contests vs more free throws for the opponent." />
              <Slider label="Transition defense" value={t.defense.getBack} onChange={(x) => edit((tt) => void (tt.defense.getBack = x))} left="Crash glass" right="Sprint back" help="How hard you sprint back after shots. Limits fast breaks." />
            </div>
          </Card>
          <Card title="Full-court press">
            <Chips value={t.defense.press} onChange={(x: PressMode) => edit((tt) => void (tt.defense.press = x))} options={(Object.keys(PRESS_META) as PressMode[]).map((k) => ({ id: k, label: PRESS_META[k].label }))} />
            <div className="small dim" style={{ marginTop: 8 }}>{PRESS_META[t.defense.press].help}</div>
          </Card>
          <Card title="Star plan" right={<Help title="Star plan">Applies to the opponent's primary creator each game (you can target a specific player in the Tactics Lab and during live games).</Help>}>
            <Chips value={t.defense.starPlan} onChange={(x: StarPlan) => edit((tt) => void (tt.defense.starPlan = x))} options={(Object.keys(STAR_PLAN_META) as StarPlan[]).map((k) => ({ id: k, label: STAR_PLAN_META[k].label }))} />
            <div className="small dim" style={{ marginTop: 8 }}>{STAR_PLAN_META[t.defense.starPlan].help}</div>
          </Card>
        </>
      )}

      {tab === 'roles' && <RolesTab />}
      {tab === 'insights' && <InsightsTab />}
      {tab === 'manage' && <ManageTab edit={edit} t={t} />}

      {changed && (
        <div className="simbar fade-in" style={{ bottom: 'calc(var(--nav-h) + var(--safe-b) + 10px)' }}>
          <div className="grow small">
            <div className="bold">Changes saved</div>
            <div className="dim">See what they do before tip-off.</div>
          </div>
          <button
            className="btn sm"
            aria-label="Undo"
            onClick={() =>
              useStore.getState().mutate((l) => {
                l.teams[l.userTid].tactics = cloneTactics(snapshot.current);
              })
            }
          >
            <Undo2 size={16} />
          </button>
          <button
            className="btn sm primary"
            onClick={() => {
              setLabBaseline(cloneTactics(snapshot.current));
              nav('/lab?compare=1');
            }}
          >
            <FlaskConical size={16} /> Compare
          </button>
        </div>
      )}
    </main>
  );
}

function InsightsTab() {
  const league = useLeague();
  const v = useStore((s) => s.v);
  const pts = useMemo(() => seasonPlayTypes(league), [league, v]);
  const imps = useMemo(() => seasonImpacts(league).filter((x) => IMPACT_TEXT[x.key] && x.perGame >= 0.3), [league, v]);
  const helping = imps.filter((x) => x.forUser).slice(0, 5);
  const hurting = imps.filter((x) => !x.forUser).slice(0, 5);
  const games = imps[0]?.games ?? 0;
  if (!pts.length) return <Card><div className="small dim">Insights appear once your team has played a few games: what your tactics are winning, what they are giving up, and which play types work.</div></Card>;
  const row = (x: { key: string; perGame: number; forUser: boolean }) => {
    const tpl = IMPACT_TEXT[x.key];
    const X = x.forUser ? 'your team' : 'the opposition';
    const Y = x.forUser ? 'the opposition' : 'your team';
    const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
    return (
      <div key={`${x.key}${x.forUser}`} className="row top small" style={{ gap: 10 }}>
        <span className={`num bold ${x.forUser ? 'good' : 'bad'}`} style={{ width: 44, flex: 'none' }}>{x.forUser ? '+' : '-'}{x.perGame.toFixed(1)}</span>
        <div className="grow">
          <div>{cap(tpl.text(X, Y, ''))}</div>
          {!x.forUser && tpl.advice && <div className="tiny" style={{ color: 'var(--warn)' }}>{tpl.advice}</div>}
        </div>
      </div>
    );
  };
  return (
    <>
      <Card title="What's working" right={<span className="tiny dim">pts per game · {games} games</span>}>
        <div className="col" style={{ gap: 8 }}>{helping.length ? helping.map(row) : <div className="small dim">Nothing stands out yet.</div>}</div>
      </Card>
      <Card title="What's hurting you">
        <div className="col" style={{ gap: 8 }}>{hurting.length ? hurting.map(row) : <div className="small dim">Nothing stands out yet.</div>}</div>
      </Card>
      <Card title="Play types this season" right={<Help title="Points per possession">PPP = points scored per possession that ended in that play type (including turnovers and free throws). League average is about 1.13; above 1.2 is excellent, below 0.95 is poor. Defense shows what opponents score against you.</Help>}>
        <div className="col" style={{ gap: 6 }}>
          <div className="row tiny dim upper bold">
            <span className="grow">Type</span>
            <span style={{ width: 92, textAlign: 'right' }}>Offense</span>
            <span style={{ width: 92, textAlign: 'right' }}>Defense</span>
          </div>
          {pts.map((p) => {
            const o = p.off.poss ? p.off.pts / p.off.poss : 0;
            const d = p.def.poss ? p.def.pts / p.def.poss : 0;
            return (
              <div key={p.key} className="row small">
                <span className="grow">{FINISH_LABEL[p.key as FinishType] ?? p.key}</span>
                <span className="num" style={{ width: 92, textAlign: 'right' }}><span className="dim">{p.off.poss}</span> <b style={{ color: o >= 1.2 ? 'var(--good)' : o < 0.95 ? 'var(--bad)' : undefined }}>{p.off.poss ? o.toFixed(2) : '-'}</b></span>
                <span className="num" style={{ width: 92, textAlign: 'right' }}><span className="dim">{p.def.poss}</span> <b style={{ color: d <= 0.95 ? 'var(--good)' : d > 1.2 ? 'var(--bad)' : undefined }}>{p.def.poss ? d.toFixed(2) : '-'}</b></span>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

function RolesTab() {
  const league = useLeague();
  const v = useStore((s) => s.v);
  const team = league.teams[league.userTid];
  const t = team.tactics;
  const players = useMemo(() => rosterSorted(league, league.userTid), [league, v]);
  const [pick, setPick] = useState<number | null>(null);
  const edit = (fn: (tt: TacticsT) => void) =>
    useStore.getState().mutate((l) => {
      const tt = l.teams[l.userTid].tactics;
      fn(tt);
      tt.manual = true;
    });
  const p = pick !== null ? league.players[pick] : null;
  return (
    <>
      <Card title="Roles & shot freedom" right={<Help title="Roles and freedom">A role decides which actions a player is involved in and how often the offense looks for him. Shot freedom scales his shot volume: green light for scorers, limited for players who should keep it moving.</Help>}>
        <div className="list" style={{ margin: '0 -14px' }}>
          {players.map((pl) => {
            const role = t.offense.roles[pl.pid] ?? archetype(pl.ratings).role;
            const fr = (t.offense.freedom[pl.pid] ?? 0) as ShotFreedom;
            return (
              <div key={pl.pid} className="listrow clickable" role="button" tabIndex={0} onClick={() => setPick(pl.pid)} onKeyDown={activateOnKey(() => setPick(pl.pid))}>
                <Avatar p={pl} />
                <div className="grow">
                  <div className="bold small ellipsis">{pl.firstName[0]}. {pl.lastName}</div>
                  <div className="tiny dim">{ROLE_META[role].label}{archetype(pl.ratings).role !== role ? ' (out of position)' : ''}</div>
                </div>
                <Tag tone={fr === 1 ? 'good' : fr === -1 ? 'warn' : undefined}>{fr === 1 ? 'Green light' : fr === -1 ? 'Limited' : 'Normal'}</Tag>
                <Ovr v={pl.ovr} size="sm" />
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Preferred screeners" right={<Help title="Screeners">Who sets ball screens in your pick-and-roll. Rollers dive to the rim; poppers stretch the defense. Leave empty to let the offense choose.</Help>}>
        <div className="chips">
          {players
            .filter((pl) => pl.ratings.hgt >= 50)
            .map((pl) => {
              const on = t.offense.screeners.includes(pl.pid);
              return (
                <button key={pl.pid} className={`chip ${on ? 'on' : ''}`} onClick={() => edit((tt) => void (tt.offense.screeners = on ? tt.offense.screeners.filter((x) => x !== pl.pid) : [...tt.offense.screeners, pl.pid]))}>
                  {pl.lastName}
                </button>
              );
            })}
        </div>
      </Card>
      <Sheet open={!!p} onClose={() => setPick(null)} title={p ? `${p.firstName} ${p.lastName}` : ''}>
        {p && (
          <div className="col" style={{ gap: 14 }}>
            <div className="small dim2">Natural fit: {ROLE_META[archetype(p.ratings).role].label} ({p.archetype}).</div>
            <div className="col" style={{ gap: 6 }}>
              {(Object.keys(ROLE_META) as OffRole[]).map((r) => {
                const on = (t.offense.roles[p.pid] ?? archetype(p.ratings).role) === r;
                return (
                  <button key={r} className="card tight" style={{ textAlign: 'left', borderColor: on ? 'var(--accent)' : undefined }} onClick={() => edit((tt) => void (tt.offense.roles[p.pid] = r))}>
                    <div className="bold small">{ROLE_META[r].label}</div>
                    <div className="tiny dim">{ROLE_META[r].help}</div>
                  </button>
                );
              })}
            </div>
            <div>
              <div className="small bold" style={{ marginBottom: 6 }}>Shot freedom</div>
              <Segmented
                value={String(t.offense.freedom[p.pid] ?? 0)}
                onChange={(x) => edit((tt) => void (tt.offense.freedom[p.pid] = Number(x) as ShotFreedom))}
                options={[
                  { id: '-1', label: 'Limited' },
                  { id: '0', label: 'Normal' },
                  { id: '1', label: 'Green light' },
                ]}
              />
            </div>
            <button className="btn block" onClick={() => setPick(null)}>
              Done
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}

function ManageTab({ t, edit }: { t: TacticsT; edit: (fn: (t: TacticsT) => void) => void }) {
  const row = (children: ReactNode) => <div style={{ padding: '4px 0' }}>{children}</div>;
  return (
    <>
      <Card title="Late-game rules">
        <div className="col" style={{ gap: 12 }}>
          {row(<Toggle on={t.manage.foulUp3} onChange={(x) => edit((tt) => void (tt.manage.foulUp3 = x))} label="Foul when up 3" help="In the final seconds, foul before the opponent can attempt a tying three." />)}
          {row(<Toggle on={t.manage.foulWhenTrailing} onChange={(x) => edit((tt) => void (tt.manage.foulWhenTrailing = x))} label="Foul when trailing late" help="Stop the clock with intentional fouls when behind in the final minute." />)}
          {row(<Toggle on={t.manage.twoForOne} onChange={(x) => edit((tt) => void (tt.manage.twoForOne = x))} label="Go for 2-for-1" help="Take a quick shot with ~35 seconds left in a quarter to get the last possession too." />)}
          {row(<Toggle on={t.manage.garbageTime} onChange={(x) => edit((tt) => void (tt.manage.garbageTime = x))} label="Rest starters in blowouts" help="Empty the bench late in lopsided games to save legs and avoid injuries." />)}
          <Slider label="Hack-a-player threshold" value={t.manage.hackThreshold} min={0} max={65} step={5} onChange={(x) => edit((tt) => void (tt.manage.hackThreshold = x))} format={(x) => (x === 0 ? 'Off' : `< ${x}% FT`)} help="Intentionally foul opposing players who shoot below this free-throw percentage (not allowed in the last 2 minutes)." />
        </div>
      </Card>
      <Card title="Timeouts & substitutions">
        <div className="col" style={{ gap: 14 }}>
          <Toggle on={t.manage.autoTimeouts} onChange={(x) => edit((tt) => void (tt.manage.autoTimeouts = x))} label="Auto timeouts to stop runs" help="Timeouts restore a little energy and break the opponent's momentum." />
          <Slider label="Timeout after a run of" value={t.manage.timeoutRun} min={6} max={14} onChange={(x) => edit((tt) => void (tt.manage.timeoutRun = x))} format={(x) => `${x}-0`} />
          <div>
            <div className="small bold" style={{ marginBottom: 6 }}>Foul trouble</div>
            <Chips value={t.manage.foulTrouble} onChange={(x: TacticsT['manage']['foulTrouble']) => edit((tt) => void (tt.manage.foulTrouble = x))} options={[{ id: 'loose', label: 'Loose' }, { id: 'standard', label: 'Standard' }, { id: 'strict', label: 'Strict' }]} />
            <div className="small dim" style={{ marginTop: 6 }}>Standard sits a player at 2 fouls in Q1, 3 in Q2, 4 in Q3 and 5 in Q4 (until the last six minutes).</div>
          </div>
          <Slider label="Sub out tired players at" value={Math.round(t.manage.fatigueSub * 100)} min={30} max={80} onChange={(x) => edit((tt) => void (tt.manage.fatigueSub = x / 100))} format={(x) => `${x}% energy`} help="Fatigue lowers shooting and defense and raises injury risk. Higher values = shorter stints." />
        </div>
      </Card>
    </>
  );
}

