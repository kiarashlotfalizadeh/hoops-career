import { TabBar } from '../league/shared';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FlaskConical, Sparkles, Undo2 } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import type { ActionType, DefScheme, PnrCoverage, PressMode, ShotFreedom, StarPlan, Tactics as TacticsT } from '../../core/types';
import { ACTION_META, COVERAGE_META, PRESS_META, SCHEME_META, STAR_PLAN_META, TACTIC_LEVELS, chasers, cloneTactics, isJunk, schemesFor } from '../../core/sim/tactics';
import { effectiveTactics } from '../../core/league/gamePlans';
import { nextUserGame } from '../../core/analysis/preview';
import { autoTactics } from '../../core/ai/coachAI';
import { playbookLabel } from '../../core/sim/playbooks';
import { PresetPicker } from '../components/PresetPicker';
import { MyPlaybooksCard, PlaybookLine } from '../components/MyPlaybooks';
import { rosterSorted } from '../../core/league/helpers';
import { ROLE_META, archetype, attrDisplay, composites } from '../../core/ratings';
import { Avatar, Card, Chips, Help, Levels, Ovr, PageHeader, Sheet, Slider, Tag, Toggle, activateOnKey } from '../components/ui';
import { RoleEditor } from '../components/RoleEditor';
import { UpcomingOpponents } from '../components/UpcomingOpponents';
import { teamAlerts } from '../../core/ai/advisor';
import { setLabBaseline } from './labBridge';
import { adviceFor, seasonImpacts, seasonPlayTypes } from '../seasonAnalysis';
import { IMPACT_TEXT, impactAdvice, impactSentence } from '../../core/analysis/gameReport';
import { FINISH_LABEL, type FinishType } from '../../core/sim/log';
import { rosterNames } from '../stats';
import { CrunchTimeCard } from '../tactics/CrunchTimeCard';
import { SetPackageCard } from '../tactics/SetPackageCard';
import { SituationToggles, SituationsCard } from '../tactics/SituationsCard';

type Tab = 'playbook' | 'offense' | 'defense' | 'roles' | 'manage' | 'insights';

export default function Tactics() {
  const league = useLeague();
  const nav = useNavigate();
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
  // what Undo and Compare go back to: the tactics as this visit found them (copied once, not every render)
  const [snapshot] = useState(() => {
    const tactics = cloneTactics(t);
    return { tactics, sig: JSON.stringify(tactics) };
  });
  const changed = snapshot.sig !== JSON.stringify(t);
  // a Play-menu sim's progress bar takes the same spot as the changes bar
  const simming = useStore((s) => !!s.sim);
  const alerts = useLeagueMemo(() => teamAlerts(league, league.userTid).filter((a) => a.link === '/tactics'), [league]);
  // the go-to player is picked from the roster
  const players = useLeagueMemo(() => rosterSorted(league, league.userTid), [league]);

  const edit = (fn: (t: TacticsT) => void) =>
    useStore.getState().mutate((l) => {
      const tt = l.teams[l.userTid].tactics;
      fn(tt);
      tt.manual = true;
    });

  // personnel hints, for the five who start next: the first healthy ones in the depth chart
  const starters = team.rotation.order
    .map((pid) => league.players[pid])
    .filter((p) => p && p.tid === team.tid && !p.injury)
    .slice(0, 5);
  const big = [...starters].sort((a, b) => b.ratings.hgt - a.ratings.hgt)[0];
  const bigC = big ? composites(big.ratings) : null;
  // the defender the game plan for the next opponent attacks (game by game: never in these tactics)
  const hunt = useLeagueMemo(() => {
    const g = nextUserGame(league);
    if (!g) return null;
    const opp = g.home === league.userTid ? g.away : g.home;
    const pid = effectiveTactics(league, opp, g).offense.huntTarget;
    return pid != null && league.players[pid] ? { opp, name: league.players[pid].lastName } : null;
  }, [league]);
  const schemes = schemesFor(complexity).concat(schemesFor(complexity).includes(t.defense.scheme) ? [] : [t.defense.scheme]);

  return (
    <main className="page">
      <PageHeader
        title="Tactics"
        sub={
          <>
            <PlaybookLine />
            {`${playbookLabel(t)}${t.manual ? ' · Coach-managed' : ' · Assistant-managed'}`}
          </>
        }
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
                // his refits make it his playbook, not a saved one
                tm.tactics.playbook = null;
              } else tm.tactics.manual = true;
            })
          }
          label="Let the assistant coach manage tactics"
          help={
            !t.manual ? 'He re-fits the playbook whenever the roster changes. Any edit you make switches this off.' : 'You are in control. Turn this on to hand the clipboard back.'
          }
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
      {tabs.length > 1 && <TabBar value={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} options={tabs} label="Tactics sections" />}

      {tab === 'playbook' && (
        <>
          <UpcomingOpponents />
          <Card
            title="Offensive playbook"
            right={
              <Help title="Playbooks">
                A playbook sets pace, shot profile and which actions you run. "Fit" scores how well your current roster suits it: creators, shooters, passers, bigs and athleticism.
                Tap a fit score to see what it is made of. You can fine-tune any playbook in the Offense tab.
              </Help>
            }
          >
            <PresetPicker kind="off" />
          </Card>
          <Card title="Defensive identity">
            <PresetPicker kind="def" />
          </Card>
          {complexity === 'simple' && (
            <Card title="Tempo">
              <Levels
                label="Pace"
                value={t.offense.pace}
                names={TACTIC_LEVELS.pace}
                onChange={(x) => edit((tt) => void (tt.offense.pace = x))}
                help="Faster pace means more possessions and transition chances, but more turnovers and fatigue."
              />
            </Card>
          )}
          <MyPlaybooksCard />
        </>
      )}

      {tab === 'offense' && (
        <>
          <Card title="Tempo">
            <div className="col" style={{ gap: 16 }}>
              <Levels
                label="Pace"
                value={t.offense.pace}
                names={TACTIC_LEVELS.pace}
                onChange={(x) => edit((tt) => void (tt.offense.pace = x))}
                help="Seconds you take per half-court possession. Faster = more possessions, slightly more turnovers, more fatigue."
              />
              <Levels
                label="Push in transition"
                value={t.offense.transition}
                names={TACTIC_LEVELS.transition}
                onChange={(x) => edit((tt) => void (tt.offense.transition = x))}
                help="How often you attack before the defense sets after rebounds and steals. Transition is the most efficient offense in basketball."
              />
            </div>
          </Card>
          <Card
            title="Actions"
            right={
              <Help title="How actions are chosen">
                Each half-court trip, the offense picks an action weighted by these settings and by how well the players on the floor can run it. A pick-and-roll-heavy plan with no
                ball handler on the floor will naturally drift to other actions.
              </Help>
            }
          >
            <div className="col" style={{ gap: 16 }}>
              {(Object.keys(ACTION_META) as ActionType[]).map((a) => (
                <Levels
                  key={a}
                  label={ACTION_META[a].label}
                  value={t.offense.actions[a]}
                  names={TACTIC_LEVELS.action}
                  onChange={(x) => edit((tt) => void (tt.offense.actions[a] = x))}
                  help={ACTION_META[a].help}
                />
              ))}
            </div>
          </Card>
          <SetPackageCard t={t} edit={edit} players={players} />
          <Card title="Shot profile">
            <div className="col" style={{ gap: 16 }}>
              <Levels
                label="Three-point emphasis"
                value={t.offense.threePoint}
                names={TACTIC_LEVELS.threePoint}
                onChange={(x) => edit((tt) => void (tt.offense.threePoint = x))}
                help="Higher settings turn mid-range looks into threes. Great with shooters; bad shooting teams lose efficiency."
              />
              <Levels
                label="Attack the rim"
                value={t.offense.rimAttack}
                names={TACTIC_LEVELS.rimAttack}
                onChange={(x) => edit((tt) => void (tt.offense.rimAttack = x))}
                help="How often ball handlers drive to the basket. Draws fouls and opens kick-outs, but runs into rim protectors."
              />
              <Levels
                label="Crash the offensive glass"
                value={t.offense.crashBoards}
                names={TACTIC_LEVELS.crashBoards}
                onChange={(x) => edit((tt) => void (tt.offense.crashBoards = x))}
                help="More offensive rebounds and second chances, but more fast breaks allowed the other way."
              />
              <Toggle
                on={t.offense.huntMismatch}
                onChange={(x) => edit((tt) => void (tt.offense.huntMismatch = x))}
                label="Hunt mismatches"
                help="Target the weakest defender with isolations and ball screens. Strong against switching defenses. A game plan can name the defender to attack instead (Attack)."
              />
              {hunt && (
                <div className="small dim2" style={{ marginTop: -6 }}>
                  Next game:{' '}
                  <Link to={`/gameplan/${hunt.opp}`} style={{ color: 'var(--accent-text)', fontWeight: 650 }}>
                    your game plan vs {league.teams[hunt.opp].abbrev}
                  </Link>{' '}
                  attacks {hunt.name} while he plays (in place of Hunt mismatches).
                </div>
              )}
              <Toggle
                on={t.offense.hotHand}
                onChange={(x) => edit((tt) => void (tt.offense.hotHand = x))}
                label="Feed the hot hand"
                help="Players who have made several shots in a row get more touches."
              />
            </div>
          </Card>
        </>
      )}

      {tab === 'defense' && (
        <>
          <Card
            title="Base scheme"
            right={
              <Help title="Schemes">
                {schemes.map((k) => (
                  <p key={k}>
                    <b>{SCHEME_META[k].label}:</b> {SCHEME_META[k].help}
                  </p>
                ))}
              </Help>
            }
          >
            <Chips
              label="Base scheme"
              value={t.defense.scheme}
              onChange={(x: DefScheme) => edit((tt) => void (tt.defense.scheme = x))}
              options={schemes.map((k) => ({ id: k, label: SCHEME_META[k].label }))}
            />
            <div className="small dim" style={{ marginTop: 8 }}>
              {SCHEME_META[t.defense.scheme].help}
            </div>
            {isJunk(t.defense.scheme) && (
              <div className="small" style={{ marginTop: 8 }}>
                <span className="dim">
                  As your base scheme the chaser{chasers(t.defense.scheme) === 2 ? 's take their two main creators' : ' takes their main creator'} on the floor, every game. To name
                  who, and play it only while {chasers(t.defense.scheme) === 2 ? 'they are' : "he's"} on the floor, use a game plan (Junk defense) or the live Adjust sheet.
                </span>
              </div>
            )}
          </Card>
          <Card
            title="Pick-and-roll coverage"
            right={
              <Help title="Coverages explained">
                {(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => (
                  <p key={k}>
                    <b>{COVERAGE_META[k].label}:</b> {COVERAGE_META[k].help}
                  </p>
                ))}
              </Help>
            }
          >
            <Chips
              label="Pick-and-roll coverage"
              value={t.defense.pnr}
              onChange={(x: PnrCoverage) => edit((tt) => void (tt.defense.pnr = x))}
              options={(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => ({ id: k, label: COVERAGE_META[k].label }))}
            />
            <div className="small dim" style={{ marginTop: 8 }}>
              {COVERAGE_META[t.defense.pnr].help}
            </div>
            {big && bigC && (
              <div className="small" style={{ marginTop: 8 }}>
                <span className="dim">
                  Your starting big, {big.lastName}: rim protection {attrDisplay(bigC.rimProt)}, speed {attrDisplay(big.ratings.spd)}.{' '}
                </span>
                {t.defense.pnr === 'drop' &&
                  (bigC.rimProt >= 60 ? <span className="good">Built for drop.</span> : <span className="warn">Not much of a rim deterrent for drop.</span>)}
                {t.defense.pnr === 'switch' &&
                  (big.ratings.spd >= 45 ? <span className="good">Mobile enough to switch.</span> : <span className="warn">Guards will hunt him on switches.</span>)}
                {t.defense.pnr === 'hedge' &&
                  (big.ratings.spd >= 45 ? <span className="good">Can show and recover.</span> : <span className="warn">May be slow to recover to the roller.</span>)}
                {t.defense.pnr === 'blitz' && <span className="dim2">Blitzing needs length and quick hands on the back line.</span>}
                {t.defense.pnr === 'ice' && <span className="dim2">Ice needs disciplined guards to force sideline.</span>}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <Toggle
                on={t.defense.switchOffBall}
                onChange={(x) => edit((tt) => void (tt.defense.switchOffBall = x))}
                label="Switch off-ball screens"
                help="Neutralizes handoffs and movement shooters, but a big switched onto a guard gets attacked off the dribble, and a guard switched onto a big gets posted up (and fouls)."
              />
            </div>
          </Card>
          <Card title="Help & pressure">
            <div className="col" style={{ gap: 16 }}>
              <Levels
                label="Help defense"
                value={t.defense.help}
                names={TACTIC_LEVELS.help}
                onChange={(x) => edit((tt) => void (tt.defense.help = x))}
                help="Packing the paint walls off drives and post-ups but gives up kick-out threes. Stay home against good shooting teams."
              />
              <Levels
                label="Ball pressure"
                value={t.defense.pressure}
                names={TACTIC_LEVELS.pressure}
                onChange={(x) => edit((tt) => void (tt.defense.pressure = x))}
                help="More steals and turnovers, but quick creators blow by and backdoor cuts open up. Also more fouls."
              />
              <Levels
                label="Physicality"
                value={t.defense.physicality}
                names={TACTIC_LEVELS.physicality}
                onChange={(x) => edit((tt) => void (tt.defense.physicality = x))}
                help="Tighter contests vs more free throws for the opponent."
              />
              <Levels
                label="Transition defense"
                value={t.defense.getBack}
                names={TACTIC_LEVELS.getBack}
                onChange={(x) => edit((tt) => void (tt.defense.getBack = x))}
                help="How hard you sprint back after your own shots. Sprinting back limits fast breaks but gives up some offensive rebounds; Crash the offensive glass (Offense) sets how many players go after them."
              />
            </div>
          </Card>
          <Card title="Full-court press">
            <Chips
              label="Full-court press"
              value={t.defense.press}
              onChange={(x: PressMode) => edit((tt) => void (tt.defense.press = x))}
              options={(Object.keys(PRESS_META) as PressMode[]).map((k) => ({ id: k, label: PRESS_META[k].label }))}
            />
            <div className="small dim" style={{ marginTop: 8 }}>
              {PRESS_META[t.defense.press].help}
            </div>
          </Card>
          <Card
            title="Star plan"
            right={
              <Help title="Star plan">
                Applies to the opponent's primary creator each game. To go after a specific player, set a star plan in that opponent's game plan (from Upcoming opponents, or the
                Game plan button on their Scouting tab), or change it during a live game.
              </Help>
            }
          >
            <Chips
              label="Star plan"
              value={t.defense.starPlan}
              onChange={(x: StarPlan) => edit((tt) => void (tt.defense.starPlan = x))}
              options={(Object.keys(STAR_PLAN_META) as StarPlan[]).map((k) => ({ id: k, label: STAR_PLAN_META[k].label }))}
            />
            <div className="small dim" style={{ marginTop: 8 }}>
              {STAR_PLAN_META[t.defense.starPlan].help}
            </div>
          </Card>
        </>
      )}

      {tab === 'roles' && <RolesTab />}
      {tab === 'insights' && <InsightsTab />}
      {tab === 'manage' && <ManageTab edit={edit} t={t} />}
      {tab === 'manage' && <CrunchTimeCard t={t} edit={edit} players={players} />}
      {tab === 'manage' && <SituationsCard t={t} edit={edit} />}
      {tab === 'playbook' && complexity === 'advanced' && <SituationToggles t={t} edit={edit} />}

      {changed && !simming && (
        <div className="dockbar">
          <div className="grow small">
            <div className="bold">Changes saved</div>
            <div className="dim">Test them before tip-off.</div>
          </div>
          <button
            className="btn sm"
            aria-label="Undo"
            onClick={() =>
              useStore.getState().mutate((l) => {
                l.teams[l.userTid].tactics = cloneTactics(snapshot.tactics);
              })
            }
          >
            <Undo2 size={16} />
          </button>
          <button
            className="btn sm primary"
            onClick={() => {
              setLabBaseline(cloneTactics(snapshot.tactics), league);
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
  const pts = useLeagueMemo(() => seasonPlayTypes(league), [league]);
  // the games the effects were tracked in, whether or not any effect is big enough to list
  const { games, effects } = useLeagueMemo(() => seasonImpacts(league), [league]);
  const imps = effects.filter((x) => IMPACT_TEXT[x.key] && x.perGame >= 0.3);
  const helping = imps.filter((x) => x.forUser).slice(0, 5);
  const hurting = imps.filter((x) => !x.forUser).slice(0, 5);
  if (!pts.length)
    return (
      <Card>
        <div className="small dim">Insights appear once your team has played a few games: what your tactics are winning, what they are giving up, and which play types work.</div>
      </Card>
    );
  const row = (x: { key: string; perGame: number; forUser: boolean }) => {
    // no "go to Hedge" once you already play Hedge
    const advice = x.forUser ? undefined : impactAdvice(x.key, league.teams[league.userTid].tactics);
    const X = x.forUser ? 'your team' : 'the opposition';
    const Y = x.forUser ? 'the opposition' : 'your team';
    return (
      <div key={`${x.key}${x.forUser}`} className="row top small" style={{ gap: 10 }}>
        <span className={`num bold ${x.forUser ? 'good' : 'bad'}`} style={{ width: 44, flex: 'none' }}>
          {x.forUser ? '+' : '-'}
          {x.perGame.toFixed(1)}
        </span>
        <div className="grow">
          <div>{impactSentence(x.key, X, Y)}</div>
          {advice && (
            <div className="tiny" style={{ color: 'var(--warn)' }}>
              {adviceFor(advice, league.settings.complexity)}
            </div>
          )}
        </div>
      </div>
    );
  };
  return (
    <>
      <Card title="What's working" right={<span className="tiny dim">pts per game{games > 0 && ` · ${games} game${games === 1 ? '' : 's'}`}</span>}>
        <div className="col" style={{ gap: 8 }}>
          {helping.length ? helping.map(row) : <div className="small dim">Nothing stands out yet.</div>}
        </div>
      </Card>
      <Card title="What's hurting you">
        <div className="col" style={{ gap: 8 }}>
          {hurting.length ? hurting.map(row) : <div className="small dim">Nothing stands out yet.</div>}
        </div>
      </Card>
      <Card
        title="Play types this season"
        right={
          <Help title="Points per possession">
            PPP = points scored per possession that ended in that play type (including turnovers and free throws). League average is about 1.13; above 1.2 is excellent, below 0.95
            is poor. Defense shows what opponents score against you.
          </Help>
        }
      >
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
                <span className="num" style={{ width: 92, textAlign: 'right' }}>
                  <span className="dim">{p.off.poss}</span>{' '}
                  <b style={{ color: o >= 1.2 ? 'var(--good)' : o < 0.95 ? 'var(--bad)' : undefined }}>{p.off.poss ? o.toFixed(2) : '—'}</b>
                </span>
                <span className="num" style={{ width: 92, textAlign: 'right' }}>
                  <span className="dim">{p.def.poss}</span>{' '}
                  <b style={{ color: d <= 0.95 ? 'var(--good)' : d > 1.2 ? 'var(--bad)' : undefined }}>{p.def.poss ? d.toFixed(2) : '—'}</b>
                </span>
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
  const team = league.teams[league.userTid];
  const t = team.tactics;
  const players = useLeagueMemo(() => rosterSorted(league, league.userTid), [league]);
  const nameOf = useMemo(() => rosterNames(players, { initial: true }), [players]);
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
      <Card
        title="Roles & shot freedom"
        right={
          <Help title="Roles and freedom">
            A role decides which actions a player is involved in and how often the offense looks for him. Shot freedom scales his shot volume: green light for scorers, limited for
            players who should keep it moving.
          </Help>
        }
      >
        <div className="list" style={{ margin: '0 -14px' }}>
          {players.map((pl) => {
            const role = t.offense.roles[pl.pid] ?? archetype(pl.ratings).role;
            const fr = (t.offense.freedom[pl.pid] ?? 0) as ShotFreedom;
            return (
              <div
                key={pl.pid}
                className="listrow clickable"
                role="button"
                tabIndex={0}
                aria-haspopup="dialog"
                onClick={() => setPick(pl.pid)}
                onKeyDown={activateOnKey(() => setPick(pl.pid))}
              >
                <Avatar p={pl} />
                <div className="grow">
                  <div className="bold small ellipsis">{nameOf(pl.pid)}</div>
                  <div className="tiny dim">
                    {ROLE_META[role].label}
                    {archetype(pl.ratings).role !== role ? ' (out of position)' : ''}
                  </div>
                </div>
                <Tag tone={fr === 1 ? 'good' : fr === -1 ? 'warn' : undefined}>{fr === 1 ? 'Green light' : fr === -1 ? 'Limited' : 'Normal'}</Tag>
                <Ovr v={pl.ovr} size="sm" />
              </div>
            );
          })}
        </div>
      </Card>
      <Card
        title="Preferred screeners"
        right={
          <Help title="Screeners">Who sets ball screens in your pick-and-roll. Rollers dive to the rim; poppers stretch the defense. Leave empty to let the offense choose.</Help>
        }
      >
        <div className="chips">
          {players
            .filter((pl) => pl.ratings.hgt >= 50)
            .map((pl) => {
              const on = t.offense.screeners.includes(pl.pid);
              return (
                <button
                  key={pl.pid}
                  className={`chip ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  onClick={() => edit((tt) => void (tt.offense.screeners = on ? tt.offense.screeners.filter((x) => x !== pl.pid) : [...tt.offense.screeners, pl.pid]))}
                >
                  {nameOf(pl.pid)}
                </button>
              );
            })}
        </div>
      </Card>
      <Sheet open={!!p} onClose={() => setPick(null)} title={p ? `${p.firstName} ${p.lastName}` : ''}>
        {p && <RoleEditor p={p} onDone={() => setPick(null)} />}
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
          {row(
            <Toggle
              on={t.manage.foulUp3}
              onChange={(x) => edit((tt) => void (tt.manage.foulUp3 = x))}
              label="Foul when up 3"
              help="In the final seconds, foul before the opponent can attempt a tying three."
            />,
          )}
          {row(
            <Toggle
              on={!!t.manage.foulToGive}
              onChange={(x) => edit((tt) => void (tt.manage.foulToGive = x))}
              label="Foul to give"
              help="With 3 to 8 seconds left in a quarter and the ball theirs, foul at once when it's only a side out (it won't put them in the bonus): they inbound with less time and a worse first look. In the 4th and overtime only when you're tied or up by 3 or less (Foul when up 3 goes first). About one in twenty is called on the shot: two free throws."
            />,
          )}
          {row(
            <Toggle
              on={t.manage.foulWhenTrailing}
              onChange={(x) => edit((tt) => void (tt.manage.foulWhenTrailing = x))}
              label="Foul when trailing late"
              help="Stop the clock with intentional fouls when behind in the final minute."
            />,
          )}
          {row(
            <Toggle
              on={t.manage.twoForOne}
              onChange={(x) => edit((tt) => void (tt.manage.twoForOne = x))}
              label="Go for 2-for-1"
              help="Take a quick shot with ~35 seconds left in a quarter to get the last possession too."
            />,
          )}
          {row(
            <Toggle
              on={t.manage.garbageTime}
              onChange={(x) => edit((tt) => void (tt.manage.garbageTime = x))}
              label="Rest starters in blowouts"
              help="Empty the bench late in lopsided games to save legs and avoid injuries."
            />,
          )}
          <Slider
            label="Hack-a-player threshold"
            value={t.manage.hackThreshold}
            min={0}
            max={65}
            step={5}
            onChange={(x) => edit((tt) => void (tt.manage.hackThreshold = x))}
            format={(x) => (x === 0 ? 'Off' : `< ${x}% FT`)}
            help="Intentionally foul opposing players who shoot below this free-throw percentage (never in the last two minutes of a period, where the rules punish it)."
          />
        </div>
      </Card>
      <Card title="Timeouts & substitutions">
        <div className="col" style={{ gap: 14 }}>
          <Toggle
            on={t.manage.autoTimeouts}
            onChange={(x) => edit((tt) => void (tt.manage.autoTimeouts = x))}
            label="Auto timeouts to stop runs"
            help="A timeout rests legs (a little energy back) and resets the run, but it also gives their coach a chance to adjust."
          />
          <Slider
            label="Timeout after a run of"
            value={t.manage.timeoutRun}
            disabled={!t.manage.autoTimeouts}
            min={6}
            max={14}
            onChange={(x) => edit((tt) => void (tt.manage.timeoutRun = x))}
            format={(x) => `${x}-0`}
          />
          <div>
            <div className="small bold" style={{ marginBottom: 6 }}>
              Foul trouble
            </div>
            <Chips
              label="Foul trouble"
              value={t.manage.foulTrouble}
              onChange={(x: TacticsT['manage']['foulTrouble']) => edit((tt) => void (tt.manage.foulTrouble = x))}
              options={[
                { id: 'loose', label: 'Loose' },
                { id: 'standard', label: 'Standard' },
                { id: 'strict', label: 'Strict' },
              ]}
            />
            <div className="small dim" style={{ marginTop: 6 }}>
              Standard sits a player at 2 fouls in Q1, 3 in Q2, 4 in Q3 and 5 in Q4 (until the last six minutes).
            </div>
          </div>
          <Slider
            label="Sub out tired players at"
            value={Math.round(t.manage.fatigueSub * 100)}
            min={30}
            max={80}
            onChange={(x) => edit((tt) => void (tt.manage.fatigueSub = x / 100))}
            format={(x) => `${x}% energy`}
            help="Fatigue lowers shooting and defense and raises injury risk. Higher values = shorter stints."
          />
        </div>
      </Card>
    </>
  );
}
