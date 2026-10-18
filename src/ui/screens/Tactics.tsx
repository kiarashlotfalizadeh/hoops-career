import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, FlaskConical, Sparkles, Undo2 } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import type { ActionType, DefScheme, PnrCoverage, PressMode, ShotFreedom, StarPlan, Tactics as TacticsT } from '../../core/types';
import { ACTION_META, COVERAGE_META, PRESS_META, SCHEME_META, STAR_PLAN_META, TACTIC_LEVELS, chasers, cloneTactics, isJunk, ALL_SCHEMES } from '../../core/sim/tactics';
import { effectiveTactics } from '../../core/league/gamePlans';
import { nextUserGame } from '../../core/analysis/preview';
import { autoTactics } from '../../core/ai/coachAI';
import { playbookLabel } from '../../core/sim/playbooks';
import { PresetPicker } from '../components/PresetPicker';
import { MyPlaybooksCard, PlaybookLine } from '../components/MyPlaybooks';
import { rosterSorted } from '../../core/league/helpers';
import { ROLE_META, archetype, attrDisplay, composites } from '../../core/ratings';
import { Avatar, Chips, Help, Levels, Ovr, PageHeader, Section, Segmented, Sheet, Slider, Tag, Toggle, activateOnKey } from '../components/ui';
import { RoleEditor } from '../components/RoleEditor';
import { UpcomingOpponents } from '../components/UpcomingOpponents';
import { teamAlerts } from '../../core/ai/advisor';
import { setLabBaseline } from './labBridge';
import { seasonImpacts, seasonPlayTypes } from '../seasonAnalysis';
import { IMPACT_TEXT, impactAdvice, impactSentence } from '../../core/analysis/gameReport';
import { FINISH_LABEL, type FinishType } from '../../core/sim/log';
import { rosterNames } from '../stats';
import { CrunchTimeCard } from '../tactics/CrunchTimeCard';
import { SetPackageCard } from '../tactics/SetPackageCard';
import { SituationsCard } from '../tactics/SituationsCard';
import './tactics.css';

type Tab = 'playbook' | 'offense' | 'defense' | 'roles' | 'manage' | 'insights';
type Edit = (fn: (t: TacticsT) => void) => void;

export default function Tactics() {
  const league = useLeague();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tabs: { id: Tab; label: string }[] = [
    { id: 'playbook', label: 'Playbook' },
    { id: 'offense', label: 'Offense' },
    { id: 'defense', label: 'Defense' },
    { id: 'roles', label: 'Roles' },
    { id: 'manage', label: 'Game Mgmt' },
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
  const alerts = useLeagueMemo(() => teamAlerts(league, league.userTid).filter((a) => a.link === '/team/tactics'), [league]);
  // the go-to player is picked from the roster
  const players = useLeagueMemo(() => rosterSorted(league, league.userTid), [league]);

  const edit: Edit = (fn) =>
    useStore.getState().mutate((l) => {
      const tt = l.teams[l.userTid].tactics;
      fn(tt);
      tt.manual = true;
    });

  return (
    <main className="page">
      <PageHeader
        title="Tactics"
        sub={
          <>
            <PlaybookLine />
            {`${playbookLabel(t)} · ${t.manual ? 'Coach-managed' : 'Assistant-managed'}`}
          </>
        }
        right={
          <Link to="/lab" className="btn sm">
            <FlaskConical size={16} /> Lab
          </Link>
        }
      />
      {/* the assistant's switch sits with the playbooks he picks (any edit on any tab turns it off) */}
      {tab === 'playbook' && (
        <div className="card tx-auto">
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
            label="Let the assistant manage"
            help={!t.manual ? 'He refits the playbook as the roster changes. Your next edit takes over.' : 'You call it. Turn on to hand back the clipboard.'}
          />
        </div>
      )}
      {alerts.length > 0 && (
        <div className="card flush list">
          {alerts.map((a) => (
            <div key={a.id} className="tx-alert">
              <Sparkles size={18} className="tx-alert-ic" aria-hidden="true" />
              <span className="grow">
                <span className="tx-alert-t">{a.title}</span>
                <span className="lr-meta">{a.body}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {tabs.length > 1 && <Segmented tabs value={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} options={tabs} label="Tactics sections" />}

      {tab === 'playbook' && (
        <>
          <Section
            title="Offensive playbook"
            right={
              <Help title="Playbooks">
                <p>A playbook sets pace, shot profile and which actions you run. Tap one to run it; ⓘ tells you what it is and who it&apos;s for.</p>
                <p>
                  Fit scores how well your current roster suits it: creators, shooters, passers, bigs and athleticism. Tap a fit score to see what it is made of. You can fine-tune
                  any playbook in the Offense tab.
                </p>
              </Help>
            }
          >
            <PresetPicker kind="off" />
          </Section>
          <Section
            title="Defensive identity"
            right={
              <Help title="Defensive identities">
                <p>A defensive identity sets your scheme, ball-screen coverage, help, pressure and press. Fit scores how well your roster suits it; tap a fit score to see why.</p>
                <p>You can fine-tune any of them in the Defense tab.</p>
              </Help>
            }
          >
            <PresetPicker kind="def" />
          </Section>
          <UpcomingOpponents />
          <MyPlaybooksCard />
        </>
      )}

      {tab === 'offense' && <OffenseTab t={t} edit={edit} />}
      {tab === 'offense' && <SetPackageCard t={t} edit={edit} players={players} />}
      {tab === 'offense' && <ShotProfile t={t} edit={edit} />}
      {tab === 'defense' && <DefenseTab t={t} edit={edit} />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'insights' && <InsightsTab />}
      {tab === 'manage' && <ManageTab edit={edit} t={t} />}
      {tab === 'manage' && <CrunchTimeCard t={t} edit={edit} players={players} />}
      {tab === 'manage' && <SituationsCard t={t} edit={edit} />}

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

function OffenseTab({ t, edit }: { t: TacticsT; edit: Edit }) {
  return (
    <>
      <Section
        title="Tempo"
        right={
          <Help title="Tempo">
            <p>
              <b>Pace:</b> seconds you take per half-court possession. Faster means more possessions, slightly more turnovers and more fatigue.
            </p>
            <p>
              <b>Push in transition:</b> how often you attack before the defense sets after rebounds and steals. Transition is the most efficient offense in basketball.
            </p>
          </Help>
        }
      >
        <div className="card col tx-group">
          <Levels label="Pace" value={t.offense.pace} names={TACTIC_LEVELS.pace} onChange={(x) => edit((tt) => void (tt.offense.pace = x))} />
          <Levels label="Push in transition" value={t.offense.transition} names={TACTIC_LEVELS.transition} onChange={(x) => edit((tt) => void (tt.offense.transition = x))} />
        </div>
      </Section>
      <Section
        title="Actions"
        right={
          <Help title="How actions are chosen">
            <p>
              Each half-court trip, the offense picks an action weighted by these settings and by how well the players on the floor can run it. A pick-and-roll-heavy plan with no
              ball handler on the floor will naturally drift to other actions.
            </p>
            {(Object.keys(ACTION_META) as ActionType[]).map((a) => (
              <p key={a}>
                <b>{ACTION_META[a].label}:</b> {ACTION_META[a].help}
              </p>
            ))}
          </Help>
        }
      >
        <div className="card col tx-group">
          {(Object.keys(ACTION_META) as ActionType[]).map((a) => (
            <Levels
              key={a}
              label={ACTION_META[a].label}
              value={t.offense.actions[a]}
              names={TACTIC_LEVELS.action}
              onChange={(x) => edit((tt) => void (tt.offense.actions[a] = x))}
            />
          ))}
        </div>
      </Section>
    </>
  );
}

function ShotProfile({ t, edit }: { t: TacticsT; edit: Edit }) {
  const league = useLeague();
  // the defender the game plan for the next opponent attacks (game by game: never in these tactics)
  const hunt = useLeagueMemo(() => {
    const g = nextUserGame(league);
    if (!g) return null;
    const opp = g.home === league.userTid ? g.away : g.home;
    const pid = effectiveTactics(league, opp, g).offense.huntTarget;
    return pid != null && league.players[pid] ? { opp, name: league.players[pid].lastName } : null;
  }, [league]);
  return (
    <Section
      title="Shot profile"
      right={
        <Help title="Shot profile">
          <p>
            <b>Three-point emphasis:</b> higher settings turn mid-range looks into threes. Great with shooters; bad shooting teams lose efficiency.
          </p>
          <p>
            <b>Attack the rim:</b> how often ball handlers drive to the basket. Draws fouls and opens kick-outs, but runs into rim protectors.
          </p>
          <p>
            <b>Crash the offensive glass:</b> more offensive rebounds and second chances, but more fast breaks allowed the other way.
          </p>
          <p>
            <b>Hunt mismatches:</b> target the weakest defender with isolations and ball screens. Strong against switching defenses. A game plan can name the defender to attack
            instead (Attack).
          </p>
          <p>
            <b>Feed the hot hand:</b> players who have made several shots in a row get more touches.
          </p>
        </Help>
      }
    >
      <div className="card col tx-group">
        <Levels label="Three-point emphasis" value={t.offense.threePoint} names={TACTIC_LEVELS.threePoint} onChange={(x) => edit((tt) => void (tt.offense.threePoint = x))} />
        <Levels label="Attack the rim" value={t.offense.rimAttack} names={TACTIC_LEVELS.rimAttack} onChange={(x) => edit((tt) => void (tt.offense.rimAttack = x))} />
        <Levels
          label="Crash the offensive glass"
          value={t.offense.crashBoards}
          names={TACTIC_LEVELS.crashBoards}
          onChange={(x) => edit((tt) => void (tt.offense.crashBoards = x))}
        />
        <div className="tx-toggles">
          <Toggle
            on={t.offense.huntMismatch}
            onChange={(x) => edit((tt) => void (tt.offense.huntMismatch = x))}
            label="Hunt mismatches"
            help="Isos and ball screens at their weakest defender."
          />
          {hunt && (
            <Link to={`/gameplan/${hunt.opp}`} className="tx-hunt">
              <span className="grow">
                Next game: your plan vs {league.teams[hunt.opp].abbrev} attacks {hunt.name} while he plays (in place of Hunt mismatches).
              </span>
              <ChevronRight size={15} aria-hidden="true" />
            </Link>
          )}
          <Toggle on={t.offense.hotHand} onChange={(x) => edit((tt) => void (tt.offense.hotHand = x))} label="Feed the hot hand" help="More touches for a player on a run." />
        </div>
      </div>
    </Section>
  );
}

function DefenseTab({ t, edit }: { t: TacticsT; edit: Edit }) {
  const league = useLeague();
  const team = league.teams[league.userTid];
  // personnel hints, for the five who start next: the first healthy ones in the depth chart
  const starters = team.rotation.order
    .map((pid) => league.players[pid])
    .filter((p) => p && p.tid === team.tid && !p.injury)
    .slice(0, 5);
  const big = [...starters].sort((a, b) => b.ratings.hgt - a.ratings.hgt)[0];
  const bigC = big ? composites(big.ratings) : null;
  const schemes = ALL_SCHEMES;
  const fit = (good: boolean, yes: string, no: string) => <Tag tone={good ? 'good' : 'warn'}>{good ? yes : no}</Tag>;
  const two = chasers(t.defense.scheme) === 2;
  return (
    <>
      <Section
        title="Base scheme"
        right={
          <Help title="Schemes">
            {schemes.map((k) => (
              <p key={k}>
                <b>{SCHEME_META[k].label}:</b> {SCHEME_META[k].help}
              </p>
            ))}
            <p>
              A box-and-one or triangle-and-two as your base scheme sends its chasers at their main creators on the floor, every game. To name who, and play it only while
              they&apos;re on the floor, use a game plan (Junk defense) or the live Adjust sheet.
            </p>
          </Help>
        }
      >
        <div className="card col tx-group tight">
          <Chips
            label="Base scheme"
            value={t.defense.scheme}
            onChange={(x: DefScheme) => edit((tt) => void (tt.defense.scheme = x))}
            options={schemes.map((k) => ({ id: k, label: SCHEME_META[k].label }))}
          />
          <div className="tx-note">{SCHEME_META[t.defense.scheme].help}</div>
          {isJunk(t.defense.scheme) && (
            <div className="tx-note">
              The chaser{two ? 's take their two main creators' : ' takes their main creator'} every game. To name who, use a game plan (Junk defense) or the live Adjust sheet.
            </div>
          )}
        </div>
      </Section>
      <Section
        title="Pick-and-roll coverage"
        right={
          <Help title="Coverages explained">
            {(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => (
              <p key={k}>
                <b>{COVERAGE_META[k].label}:</b> {COVERAGE_META[k].help}
              </p>
            ))}
            <p>
              <b>Switch off-ball screens:</b> neutralizes handoffs and movement shooters, but a big switched onto a guard gets attacked off the dribble, and a guard switched onto a
              big gets posted up (and fouls).
            </p>
          </Help>
        }
      >
        <div className="card col tx-group tight">
          <Chips
            label="Pick-and-roll coverage"
            value={t.defense.pnr}
            onChange={(x: PnrCoverage) => edit((tt) => void (tt.defense.pnr = x))}
            options={(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => ({ id: k, label: COVERAGE_META[k].label }))}
          />
          <div className="tx-note">{COVERAGE_META[t.defense.pnr].help}</div>
          {big && bigC && (
            <div className="tx-bigfit">
              <span className="grow">
                Your big, <b>{big.lastName}</b>: rim protection {attrDisplay(bigC.rimProt)} · speed {attrDisplay(big.ratings.spd)}
              </span>
              {t.defense.pnr === 'drop' && fit(bigC.rimProt >= 60, 'Built for drop', 'Weak rim deterrent')}
              {t.defense.pnr === 'switch' && fit(big.ratings.spd >= 45, 'Mobile enough', 'Guards will hunt him')}
              {t.defense.pnr === 'hedge' && fit(big.ratings.spd >= 45, 'Can show and recover', 'Slow to recover')}
            </div>
          )}
          {big && t.defense.pnr === 'blitz' && <div className="tx-note">Blitzing needs length and quick hands on the back line.</div>}
          {big && t.defense.pnr === 'ice' && <div className="tx-note">Ice needs disciplined guards to force sideline.</div>}
          <div className="tx-toggles">
            <Toggle
              on={t.defense.switchOffBall}
              onChange={(x) => edit((tt) => void (tt.defense.switchOffBall = x))}
              label="Switch off-ball screens"
              help="Kills handoffs; invites mismatches."
            />
          </div>
        </div>
      </Section>
      <Section
        title="Help & pressure"
        right={
          <Help title="Help & pressure">
            <p>
              <b>Help defense:</b> packing the paint walls off drives and post-ups but gives up kick-out threes. Stay home against good shooting teams.
            </p>
            <p>
              <b>Ball pressure:</b> more steals and turnovers, but quick creators blow by and backdoor cuts open up. Also more fouls.
            </p>
            <p>
              <b>Physicality:</b> tighter contests vs more free throws for the opponent.
            </p>
            <p>
              <b>Transition defense:</b> how hard you sprint back after your own shots. Sprinting back limits fast breaks but gives up some offensive rebounds; Crash the offensive
              glass (Offense) sets how many players go after them.
            </p>
          </Help>
        }
      >
        <div className="card col tx-group">
          <Levels label="Help defense" value={t.defense.help} names={TACTIC_LEVELS.help} onChange={(x) => edit((tt) => void (tt.defense.help = x))} />
          <Levels label="Ball pressure" value={t.defense.pressure} names={TACTIC_LEVELS.pressure} onChange={(x) => edit((tt) => void (tt.defense.pressure = x))} />
          <Levels label="Physicality" value={t.defense.physicality} names={TACTIC_LEVELS.physicality} onChange={(x) => edit((tt) => void (tt.defense.physicality = x))} />
          <Levels label="Transition defense" value={t.defense.getBack} names={TACTIC_LEVELS.getBack} onChange={(x) => edit((tt) => void (tt.defense.getBack = x))} />
        </div>
      </Section>
      <Section title="Full-court press">
        <div className="card col tx-group tight">
          <Chips
            label="Full-court press"
            value={t.defense.press}
            onChange={(x: PressMode) => edit((tt) => void (tt.defense.press = x))}
            options={(Object.keys(PRESS_META) as PressMode[]).map((k) => ({ id: k, label: PRESS_META[k].label }))}
          />
          <div className="tx-note">{PRESS_META[t.defense.press].help}</div>
        </div>
      </Section>
      <Section
        title="Star plan"
        right={
          <Help title="Star plan">
            Applies to the opponent&apos;s primary creator each game. To go after a specific player, set a star plan in that opponent&apos;s game plan (from Upcoming opponents, or
            the Game plan button on their Scouting tab), or change it during a live game.
          </Help>
        }
      >
        <div className="card col tx-group tight">
          <Chips
            label="Star plan"
            value={t.defense.starPlan}
            onChange={(x: StarPlan) => edit((tt) => void (tt.defense.starPlan = x))}
            options={(Object.keys(STAR_PLAN_META) as StarPlan[]).map((k) => ({ id: k, label: STAR_PLAN_META[k].label }))}
          />
          <div className="tx-note">{STAR_PLAN_META[t.defense.starPlan].help}</div>
        </div>
      </Section>
    </>
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
  if (!pts.length) return <div className="card tx-empty">Insights come in after a few games: what your tactics win, what they give up, and which play types work.</div>;
  const row = (x: { key: string; perGame: number; forUser: boolean }) => {
    // no "go to Hedge" once you already play Hedge
    const advice = x.forUser ? undefined : impactAdvice(x.key, league.teams[league.userTid].tactics);
    const X = x.forUser ? 'your team' : 'the opposition';
    const Y = x.forUser ? 'the opposition' : 'your team';
    return (
      <div key={`${x.key}${x.forUser}`} className="tx-imp">
        <span className={`tx-imp-v num ${x.forUser ? 'good' : 'bad'}`}>
          {x.forUser ? '+' : '-'}
          {x.perGame.toFixed(1)}
        </span>
        <span className="grow">
          <span className="tx-imp-t">{impactSentence(x.key, X, Y)}</span>
          {advice && <span className="tx-imp-a">{advice}</span>}
        </span>
      </div>
    );
  };
  const tone = (good: boolean, bad: boolean) => (good ? 'good' : bad ? 'bad' : undefined);
  return (
    <>
      <Section title="What's working" right={<span className="tiny dim">pts per game{games > 0 && ` · ${games} game${games === 1 ? '' : 's'}`}</span>}>
        <div className="card flush list">{helping.length ? helping.map(row) : <div className="tx-empty">Nothing stands out yet.</div>}</div>
      </Section>
      <Section title="What's hurting you">
        <div className="card flush list">{hurting.length ? hurting.map(row) : <div className="tx-empty">Nothing stands out yet.</div>}</div>
      </Section>
      <Section
        title="Play types this season"
        right={
          <Help title="Points per possession">
            PPP = points scored per possession that ended in that play type (including turnovers and free throws). League average is about 1.13; above 1.2 is excellent, below 0.95
            is poor. Defense shows what opponents score against you. The small number is the possessions.
          </Help>
        }
      >
        <div className="card flush tx-table">
          <div className="tx-tr tx-th">
            <span>Type</span>
            <span>Offense</span>
            <span>Defense</span>
          </div>
          {pts.map((p) => {
            const o = p.off.poss ? p.off.pts / p.off.poss : 0;
            const d = p.def.poss ? p.def.pts / p.def.poss : 0;
            return (
              <div key={p.key} className="tx-tr">
                <span className="ellipsis">{FINISH_LABEL[p.key as FinishType] ?? p.key}</span>
                <span className="num">
                  <small>{p.off.poss}</small> <b className={tone(o >= 1.2, o < 0.95)}>{p.off.poss ? o.toFixed(2) : '—'}</b>
                </span>
                <span className="num">
                  <small>{p.def.poss}</small> <b className={tone(d <= 0.95, d > 1.2)}>{p.def.poss ? d.toFixed(2) : '—'}</b>
                </span>
              </div>
            );
          })}
        </div>
      </Section>
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
  const edit: Edit = (fn) =>
    useStore.getState().mutate((l) => {
      const tt = l.teams[l.userTid].tactics;
      fn(tt);
      tt.manual = true;
    });
  const p = pick !== null ? league.players[pick] : null;
  return (
    <>
      <Section
        title="Roles & shot freedom"
        right={
          <Help title="Roles and freedom">
            A role decides which actions a player is involved in and how often the offense looks for him. Shot freedom scales his shot volume: green light for scorers, limited for
            players who should keep it moving. Tap a player to change his.
          </Help>
        }
      >
        <div className="card flush list wide2">
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
                  <div className="lr-name ellipsis">{nameOf(pl.pid)}</div>
                  <div className="lr-meta ellipsis">
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
      </Section>
      <Section
        title="Preferred screeners"
        right={
          <Help title="Screeners">Who sets ball screens in your pick-and-roll. Rollers dive to the rim; poppers stretch the defense. Leave empty to let the offense choose.</Help>
        }
      >
        <div className="card col tx-group tight">
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
          <div className="tx-note">{t.offense.screeners.length ? `${t.offense.screeners.length} picked.` : 'None picked: the offense chooses.'}</div>
        </div>
      </Section>
      <Sheet open={!!p} onClose={() => setPick(null)} title={p ? `${p.firstName} ${p.lastName}` : ''}>
        {p && <RoleEditor p={p} onDone={() => setPick(null)} />}
      </Sheet>
    </>
  );
}

function ManageTab({ t, edit }: { t: TacticsT; edit: Edit }) {
  return (
    <>
      <Section
        title="Late-game rules"
        right={
          <Help title="Late-game rules">
            <p>
              <b>Foul when up 3:</b> in the final seconds, foul before the opponent can attempt a tying three.
            </p>
            <p>
              <b>Foul to give:</b> with 3 to 8 seconds left in a quarter and the ball theirs, foul at once when it&apos;s only a side out (it won&apos;t put them in the bonus):
              they inbound with less time and a worse first look. In the 4th and overtime only when you&apos;re tied or up by 3 or less (Foul when up 3 goes first). About one in
              twenty is called on the shot: two free throws.
            </p>
            <p>
              <b>Foul when trailing late:</b> stop the clock with intentional fouls when behind in the final minute.
            </p>
            <p>
              <b>Go for 2-for-1:</b> take a quick shot with ~35 seconds left in a quarter to get the last possession too.
            </p>
            <p>
              <b>Rest starters in blowouts:</b> empty the bench late in lopsided games to save legs and avoid injuries.
            </p>
            <p>
              <b>Hack-a-player threshold:</b> intentionally foul opposing players who shoot below this free-throw percentage (never in the last two minutes of a period, where the
              rules punish it).
            </p>
          </Help>
        }
      >
        <div className="card flush list">
          <div className="tx-ctl">
            <Toggle on={t.manage.foulUp3} onChange={(x) => edit((tt) => void (tt.manage.foulUp3 = x))} label="Foul when up 3" />
          </div>
          <div className="tx-ctl">
            <Toggle on={!!t.manage.foulToGive} onChange={(x) => edit((tt) => void (tt.manage.foulToGive = x))} label="Foul to give" />
          </div>
          <div className="tx-ctl">
            <Toggle on={t.manage.foulWhenTrailing} onChange={(x) => edit((tt) => void (tt.manage.foulWhenTrailing = x))} label="Foul when trailing late" />
          </div>
          <div className="tx-ctl">
            <Toggle on={t.manage.twoForOne} onChange={(x) => edit((tt) => void (tt.manage.twoForOne = x))} label="Go for 2-for-1" />
          </div>
          <div className="tx-ctl">
            <Toggle on={t.manage.garbageTime} onChange={(x) => edit((tt) => void (tt.manage.garbageTime = x))} label="Rest starters in blowouts" />
          </div>
          <div className="tx-ctl">
            <Slider
              label="Hack-a-player threshold"
              value={t.manage.hackThreshold}
              min={0}
              max={65}
              step={5}
              onChange={(x) => edit((tt) => void (tt.manage.hackThreshold = x))}
              format={(x) => (x === 0 ? 'Off' : `< ${x}% FT`)}
            />
          </div>
        </div>
      </Section>
      <Section
        title="Timeouts & substitutions"
        right={
          <Help title="Timeouts & substitutions">
            <p>
              <b>Auto timeouts:</b> a timeout rests legs (a little energy back) and resets the run, but it also gives their coach a chance to adjust.
            </p>
            <p>
              <b>Foul trouble:</b> Standard sits a player at 2 fouls in Q1, 3 in Q2, 4 in Q3 and 5 in Q4 (until the last six minutes). Loose leaves him in longer; Strict sits him
              sooner.
            </p>
            <p>
              <b>Sub out tired players:</b> fatigue lowers shooting and defense and raises injury risk. Higher values mean shorter stints.
            </p>
          </Help>
        }
      >
        <div className="card flush list">
          <div className="tx-ctl">
            <Toggle on={t.manage.autoTimeouts} onChange={(x) => edit((tt) => void (tt.manage.autoTimeouts = x))} label="Auto timeouts to stop runs" />
          </div>
          <div className="tx-ctl">
            <Slider
              label="Timeout after a run of"
              value={t.manage.timeoutRun}
              disabled={!t.manage.autoTimeouts}
              min={6}
              max={14}
              onChange={(x) => edit((tt) => void (tt.manage.timeoutRun = x))}
              format={(x) => `${x}-0`}
            />
          </div>
          <div className="tx-ctl tx-ctl-chips">
            <div className="slider-label">Foul trouble</div>
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
          </div>
          <div className="tx-ctl">
            <Slider
              label="Sub out tired players at"
              value={Math.round(t.manage.fatigueSub * 100)}
              min={30}
              max={80}
              onChange={(x) => edit((tt) => void (tt.manage.fatigueSub = x / 100))}
              format={(x) => `${x}% energy`}
            />
          </div>
        </div>
      </Section>
    </>
  );
}
