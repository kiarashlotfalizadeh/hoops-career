// Team → Tactics: the playbook and its parts in six tabs (Playbook, Offense, Defense, Roles, Game
// Mgmt, Insights; advice in core names them, so their names stay). The staff's advice on tactics sits
// on top; every explanation is behind a "?". Edits save as they're made; while this visit has any,
// a compact dock offers Undo, a comparison in the Lab, and Done (which hands the Continue bar back).
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronRight, FlaskConical, Undo2 } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { edit, touch } from '../../state/actions';
import type { ActionType, DefScheme, League, PnrCoverage, PressMode, ShotFreedom, StarPlan, Tactics as TacticsT } from '../../core/types';
import { ACTION_META, COVERAGE_META, PRESS_META, SCHEME_META, STAR_PLAN_META, TACTIC_LEVELS, cloneTactics, ALL_SCHEMES } from '../../core/sim/tactics';
import { effectiveTactics } from '../../core/league/gamePlans';
import { guideVisit } from '../../core/league/agenda';
import { nextUserGame } from '../../core/analysis/preview';
import { scoutData, SCOUT_MIN_GAMES } from '../../core/analysis/scouting';
import { autoTactics } from '../../core/ai/coachAI';
import { scoutTeam } from '../../core/ai/advisor';
import { PresetPicker } from '../components/PresetPicker';
import { MyPlaybooksCard } from '../components/MyPlaybooks';
import { rosterSorted } from '../../core/league/helpers';
import { ROLE_META, archetype, attrDisplay, composites } from '../../core/ratings';
import { Avatar, Chips, Help, Levels, More, Ovr, Section, Segmented, Sheet, Slider, Tag, Toggle, activateOnKey } from '../components/ui';
import { AssistantCards } from '../components/Assistant';
import { Term } from '../components/Glossary';
import { PlayTypeTable, RankStrip, scoutSource } from '../components/scouting';
import { RoleEditor } from '../components/RoleEditor';
import { useQueryParam } from '../league/shared';
import { setLabBaseline } from './labBridge';
import { seasonImpacts } from '../seasonAnalysis';
import { IMPACT_TEXT, impactAdvice, impactSentence } from '../../core/analysis/gameReport';
import { rosterNames } from '../stats';
import { CrunchTimeCard } from '../tactics/CrunchTimeCard';
import { SetPackageCard } from '../tactics/SetPackageCard';
import { SituationsCard } from '../tactics/SituationsCard';
import './tactics.css';

type Tab = 'playbook' | 'offense' | 'defense' | 'roles' | 'manage' | 'insights';
type Edit = (fn: (t: TacticsT) => void) => void;

const TABS: { id: Tab; label: string }[] = [
  { id: 'playbook', label: 'Playbook' },
  { id: 'offense', label: 'Offense' },
  { id: 'defense', label: 'Defense' },
  { id: 'roles', label: 'Roles' },
  { id: 'manage', label: 'Game Mgmt' },
  { id: 'insights', label: 'Insights' },
];

/** A tactics edit: the coach's call from here on (the assistant stops managing them). */
const tweak: Edit = (fn) =>
  void edit((l) => {
    const tt = l.teams[l.userTid].tactics;
    fn(tt);
    tt.manual = true;
  });

/** Where Undo and Compare go back to: the tactics as this visit found them. */
const visitStart = (league: League) => {
  const tactics = cloneTactics(league.teams[league.userTid].tactics);
  return { of: league, tactics, sig: JSON.stringify(tactics) };
};

export default function Tactics() {
  const league = useLeague();
  const nav = useNavigate();
  const [tab, setTab] = useQueryParam<Tab>(
    'tab',
    'playbook',
    TABS.map((x) => x.id),
  );
  const t = league.teams[league.userTid].tactics;
  // a sim hands back a new league (where the assistant may have refit a playbook he manages): a new starting point
  const [start, setStart] = useState(() => visitStart(league));
  if (start.of !== league) setStart(visitStart(league));
  const changed = start.sig !== JSON.stringify(t);
  // a Play-menu sim's progress bar takes the same spot as the changes dock
  const simming = useStore((s) => !!s.sim);
  const players = useLeagueMemo(() => rosterSorted(league, league.userTid), [league]);
  // the guided first week's "pick a playbook" is done once it's been looked at
  useEffect(() => void touch((l) => void guideVisit(l, 'playbook')), []);

  return (
    <>
      <AssistantCards league={league} areas={['tactics']} max={2} />
      <div className="tx-tabs">
        <Segmented value={tab} onChange={setTab} options={TABS} label="Tactics sections" />
      </div>

      {/* while a sim plays on a copy of the league, nothing here can change it */}
      <fieldset className="tx-fieldset" disabled={simming}>
        {tab === 'playbook' && (
          <>
            {/* the assistant's switch sits with the playbooks he picks (any edit on any tab turns it off) */}
            <div className="tx-auto">
              <Toggle
                on={!t.manual}
                onChange={(on) =>
                  edit((l) => {
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
            <Section
              title="Offense"
              right={
                <Help title="Playbooks">
                  <p>A playbook sets pace, shot profile and which actions you run. Tap one to run it; ⓘ tells you what it is and who it&apos;s for.</p>
                  <p>
                    <Term id="fit">Fit</Term> scores how well your current roster suits it: creators, shooters, passers, bigs and athleticism. Tap a fit score to see what it is
                    made of. Fine-tune any playbook on the Offense tab.
                  </p>
                </Help>
              }
            >
              <PresetPicker kind="off" />
            </Section>
            <Section
              title="Defense"
              right={
                <Help title="Defensive identities">
                  <p>
                    A defensive identity sets your scheme, ball-screen coverage, help, pressure and press. Fit scores how well your roster suits it; tap a fit score to see why.
                  </p>
                  <p>Fine-tune any of them on the Defense tab.</p>
                </Help>
              }
            >
              <PresetPicker kind="def" />
            </Section>
            <MyPlaybooksCard />
          </>
        )}

        {tab === 'offense' && (
          <>
            <OffenseTab t={t} />
            <SetPackageCard t={t} edit={tweak} players={players} />
            <ShotProfile t={t} />
          </>
        )}
        {tab === 'defense' && <DefenseTab t={t} />}
        {tab === 'roles' && <RolesTab />}
        {tab === 'manage' && (
          <>
            <ManageTab t={t} />
            <CrunchTimeCard t={t} edit={tweak} players={players} />
            <SituationsCard t={t} edit={tweak} />
          </>
        )}
        {tab === 'insights' && <InsightsTab />}
      </fieldset>

      <Link to="/lab" className="tx-lablink">
        <FlaskConical size={16} aria-hidden="true" />
        <span className="grow">Test your tactics in the Lab</span>
        <ChevronRight size={16} className="dim" aria-hidden="true" />
      </Link>

      {changed && !simming && (
        <div className="dockbar tx-dock" role="region" aria-label="Your changes">
          <span className="grow tx-dock-l">Edited</span>
          <button className="btn sm ghost" aria-label="Undo your changes" onClick={() => edit((l) => void (l.teams[l.userTid].tactics = cloneTactics(start.tactics)))}>
            <Undo2 size={16} />
          </button>
          <button
            className="btn sm"
            onClick={() => {
              setLabBaseline(cloneTactics(start.tactics), league);
              nav('/lab?compare=1');
            }}
          >
            <FlaskConical size={16} /> Compare
          </button>
          <button className="btn sm primary" aria-label="Done: keep the changes" onClick={() => setStart(visitStart(league))}>
            <Check size={16} /> Done
          </button>
        </div>
      )}
    </>
  );
}

function OffenseTab({ t }: { t: TacticsT }) {
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
          <Levels label="Pace" value={t.offense.pace} names={TACTIC_LEVELS.pace} onChange={(x) => tweak((tt) => void (tt.offense.pace = x))} />
          <Levels label="Push in transition" value={t.offense.transition} names={TACTIC_LEVELS.transition} onChange={(x) => tweak((tt) => void (tt.offense.transition = x))} />
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
              onChange={(x) => tweak((tt) => void (tt.offense.actions[a] = x))}
            />
          ))}
        </div>
      </Section>
    </>
  );
}

function ShotProfile({ t }: { t: TacticsT }) {
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
            <b>Hunt mismatches:</b> isolations and ball screens at the weakest defender. Strong against switching defenses. A game plan can name the defender to attack instead.
          </p>
          <p>
            <b>Feed the hot hand:</b> players who have made several shots in a row get more touches.
          </p>
        </Help>
      }
    >
      <div className="card col tx-group">
        <Levels label="Three-point emphasis" value={t.offense.threePoint} names={TACTIC_LEVELS.threePoint} onChange={(x) => tweak((tt) => void (tt.offense.threePoint = x))} />
        <Levels label="Attack the rim" value={t.offense.rimAttack} names={TACTIC_LEVELS.rimAttack} onChange={(x) => tweak((tt) => void (tt.offense.rimAttack = x))} />
        <Levels
          label="Crash the offensive glass"
          value={t.offense.crashBoards}
          names={TACTIC_LEVELS.crashBoards}
          onChange={(x) => tweak((tt) => void (tt.offense.crashBoards = x))}
        />
        <div className="tx-toggles">
          <Toggle on={t.offense.huntMismatch} onChange={(x) => tweak((tt) => void (tt.offense.huntMismatch = x))} label="Hunt mismatches" />
          {hunt && (
            <Link to={`/games/${hunt.opp}`} className="tx-hunt">
              <span className="grow">
                Next game: your plan vs {league.teams[hunt.opp].abbrev} attacks {hunt.name} instead.
              </span>
              <ChevronRight size={15} aria-hidden="true" />
            </Link>
          )}
          <Toggle on={t.offense.hotHand} onChange={(x) => tweak((tt) => void (tt.offense.hotHand = x))} label="Feed the hot hand" />
        </div>
      </div>
    </Section>
  );
}

function DefenseTab({ t }: { t: TacticsT }) {
  const league = useLeague();
  const team = league.teams[league.userTid];
  // personnel hints, for the five who start next: the first healthy ones in the depth chart
  const starters = team.rotation.order
    .map((pid) => league.players[pid])
    .filter((p) => p && p.tid === team.tid && !p.injury)
    .slice(0, 5);
  const big = [...starters].sort((a, b) => b.ratings.hgt - a.ratings.hgt)[0];
  const bigC = big ? composites(big.ratings) : null;
  const fit = (good: boolean, yes: string, no: string) => <Tag tone={good ? 'good' : 'warn'}>{good ? yes : no}</Tag>;
  return (
    <>
      <Section
        title="Base scheme"
        right={
          <Help title="Schemes">
            {ALL_SCHEMES.map((k) => (
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
            onChange={(x: DefScheme) => tweak((tt) => void (tt.defense.scheme = x))}
            options={ALL_SCHEMES.map((k) => ({ id: k, label: SCHEME_META[k].label }))}
          />
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
            <p>Drop needs a big who protects the rim; switching and hedging need one who moves. Blitzing needs length and quick hands behind it; ice needs disciplined guards.</p>
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
            onChange={(x: PnrCoverage) => tweak((tt) => void (tt.defense.pnr = x))}
            options={(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => ({ id: k, label: COVERAGE_META[k].label }))}
          />
          {big && bigC && (t.defense.pnr === 'drop' || t.defense.pnr === 'switch' || t.defense.pnr === 'hedge') && (
            <div className="tx-bigfit">
              <span className="grow">
                <b>{big.lastName}</b>: rim protection {attrDisplay(bigC.rimProt)} · speed {attrDisplay(big.ratings.spd)}
              </span>
              {t.defense.pnr === 'drop' && fit(bigC.rimProt >= 60, 'Built for drop', 'Weak rim deterrent')}
              {t.defense.pnr === 'switch' && fit(big.ratings.spd >= 45, 'Mobile enough', 'Guards will hunt him')}
              {t.defense.pnr === 'hedge' && fit(big.ratings.spd >= 45, 'Can show and recover', 'Slow to recover')}
            </div>
          )}
          <div className="tx-toggles">
            <Toggle on={t.defense.switchOffBall} onChange={(x) => tweak((tt) => void (tt.defense.switchOffBall = x))} label="Switch off-ball screens" />
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
          <Levels label="Help defense" value={t.defense.help} names={TACTIC_LEVELS.help} onChange={(x) => tweak((tt) => void (tt.defense.help = x))} />
          <Levels label="Ball pressure" value={t.defense.pressure} names={TACTIC_LEVELS.pressure} onChange={(x) => tweak((tt) => void (tt.defense.pressure = x))} />
          <Levels label="Physicality" value={t.defense.physicality} names={TACTIC_LEVELS.physicality} onChange={(x) => tweak((tt) => void (tt.defense.physicality = x))} />
          <Levels label="Transition defense" value={t.defense.getBack} names={TACTIC_LEVELS.getBack} onChange={(x) => tweak((tt) => void (tt.defense.getBack = x))} />
        </div>
      </Section>
      <Section
        title="Full-court press"
        right={
          <Help title="Full-court press">
            {(Object.keys(PRESS_META) as PressMode[]).map((k) => (
              <p key={k}>
                <b>{PRESS_META[k].label}:</b> {PRESS_META[k].help}
              </p>
            ))}
          </Help>
        }
      >
        <div className="card col tx-group tight">
          <Chips
            label="Full-court press"
            value={t.defense.press}
            onChange={(x: PressMode) => tweak((tt) => void (tt.defense.press = x))}
            options={(Object.keys(PRESS_META) as PressMode[]).map((k) => ({ id: k, label: PRESS_META[k].label }))}
          />
        </div>
      </Section>
      <Section
        title="Star plan"
        right={
          <Help title="Star plan">
            {(Object.keys(STAR_PLAN_META) as StarPlan[]).map((k) => (
              <p key={k}>
                <b>{STAR_PLAN_META[k].label}:</b> {STAR_PLAN_META[k].help}
              </p>
            ))}
            <p>
              It applies to the opponent&apos;s primary creator each game. To go after a specific player, set a star plan in that opponent&apos;s game plan (on its matchup page),
              or change it during a live game.
            </p>
          </Help>
        }
      >
        <div className="card col tx-group tight">
          <Chips
            label="Star plan"
            value={t.defense.starPlan}
            onChange={(x: StarPlan) => tweak((tt) => void (tt.defense.starPlan = x))}
            options={(Object.keys(STAR_PLAN_META) as StarPlan[]).map((k) => ({ id: k, label: STAR_PLAN_META[k].label }))}
          />
        </div>
      </Section>
    </>
  );
}

function InsightsTab() {
  const league = useLeague();
  // the games the effects were tracked in, whether or not any effect is big enough to list
  const { games, effects } = useLeagueMemo(() => seasonImpacts(league), [league]);
  const imps = effects.filter((x) => IMPACT_TEXT[x.key] && x.perGame >= 0.3);
  const helping = imps.filter((x) => x.forUser).slice(0, 5);
  const hurting = imps.filter((x) => !x.forUser).slice(0, 5);
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
  return (
    <>
      {games > 0 ? (
        <>
          <Section title="What's working" right={<span className="tiny dim">pts a game · {`${games} game${games === 1 ? '' : 's'}`}</span>}>
            <div className="card flush list">{helping.length ? helping.map(row) : <div className="tx-empty">Nothing stands out yet.</div>}</div>
          </Section>
          <Section title="What's hurting you">
            <div className="card flush list">{hurting.length ? hurting.map(row) : <div className="tx-empty">Nothing stands out yet.</div>}</div>
          </Section>
        </>
      ) : (
        <div className="tx-empty">What your tactics win and give up comes in after your first games.</div>
      )}
      <SeenBy league={league} />
    </>
  );
}

/** How teams see you: your scouting report as an opponent reads it (league ranks, play types at both ends, what they'll go after). */
function SeenBy({ league }: { league: League }) {
  const tid = league.userTid;
  const data = useLeagueMemo(() => scoutData(league, tid), [league, tid]);
  const weak = useLeagueMemo(() => scoutTeam(league, tid).weaknesses, [league, tid]);
  const [end, setEnd] = useState<'off' | 'def'>('off');
  return (
    <Section
      title={
        <h3>
          How teams see you
          <Help title="How teams see you">
            <p>Your numbers as other coaches scout them: league ranks (1st is the best, or the most for style numbers like pace) and your play types at both ends.</p>
            <p>
              <Term id="ppp">PPP</Term> is points per possession by how the possession finished, against the league&apos;s. The colours are an opponent&apos;s: red marks a strength
              of yours he has to stop, green a weakness he can attack.
            </p>
          </Help>
        </h3>
      }
      right={data.enough ? <span className="tiny dim">{scoutSource(data)}</span> : undefined}
    >
      {!data.enough ? (
        <div className="tx-empty">Your scouting numbers come in after {SCOUT_MIN_GAMES} games.</div>
      ) : (
        <div className="col tx-seen">
          <RankStrip d={data} />
          {data.playTypes.length > 0 && (
            <>
              <Segmented
                label="Play types at which end"
                value={end}
                onChange={setEnd}
                options={[
                  { id: 'off', label: 'Your offense' },
                  { id: 'def', label: 'Your defense' },
                ]}
              />
              <PlayTypeTable rows={end === 'off' ? data.playTypes : data.defPlayTypes} defense={end === 'def'} />
            </>
          )}
          {weak.length > 0 && (
            <More label={`What they'll go after (${weak.length})`}>
              <ul className="tx-bullets">
                {weak.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </More>
          )}
        </div>
      )}
    </Section>
  );
}

function RolesTab() {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const players = useLeagueMemo(() => rosterSorted(league, league.userTid), [league]);
  const nameOf = useMemo(() => rosterNames(players, { initial: true }), [players]);
  const [pick, setPick] = useState<number | null>(null);
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
            const off = archetype(pl.ratings).role !== role;
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
                  <div className={`lr-meta ellipsis ${off ? 'warn' : ''}`}>
                    {ROLE_META[role].label}
                    {off ? ' · out of position' : ''}
                  </div>
                </div>
                {fr !== 0 && <Tag tone={fr === 1 ? 'good' : 'warn'}>{fr === 1 ? 'Green light' : 'Limited'}</Tag>}
                <Ovr v={pl.ovr} size="sm" />
              </div>
            );
          })}
        </div>
      </Section>
      <Section
        title="Preferred screeners"
        right={
          <Help title="Screeners">Who sets ball screens in your pick-and-roll. Rollers dive to the rim; poppers stretch the defense. With none picked, the offense chooses.</Help>
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
                    onClick={() => tweak((tt) => void (tt.offense.screeners = on ? tt.offense.screeners.filter((x) => x !== pl.pid) : [...tt.offense.screeners, pl.pid]))}
                  >
                    {nameOf(pl.pid)}
                  </button>
                );
              })}
          </div>
          {!t.offense.screeners.length && <div className="tx-note">None picked: the offense chooses.</div>}
        </div>
      </Section>
      <Sheet open={!!p} onClose={() => setPick(null)} title={p ? `${p.firstName} ${p.lastName}` : ''}>
        {p && <RoleEditor p={p} onDone={() => setPick(null)} />}
      </Sheet>
    </>
  );
}

function ManageTab({ t }: { t: TacticsT }) {
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
            <Toggle on={t.manage.foulUp3} onChange={(x) => tweak((tt) => void (tt.manage.foulUp3 = x))} label="Foul when up 3" />
          </div>
          <div className="tx-ctl">
            <Toggle on={!!t.manage.foulToGive} onChange={(x) => tweak((tt) => void (tt.manage.foulToGive = x))} label="Foul to give" />
          </div>
          <div className="tx-ctl">
            <Toggle on={t.manage.foulWhenTrailing} onChange={(x) => tweak((tt) => void (tt.manage.foulWhenTrailing = x))} label="Foul when trailing late" />
          </div>
          <div className="tx-ctl">
            <Toggle on={t.manage.twoForOne} onChange={(x) => tweak((tt) => void (tt.manage.twoForOne = x))} label="Go for 2-for-1" />
          </div>
          <div className="tx-ctl">
            <Toggle on={t.manage.garbageTime} onChange={(x) => tweak((tt) => void (tt.manage.garbageTime = x))} label="Rest starters in blowouts" />
          </div>
          <div className="tx-ctl">
            <Slider
              label={<Term id="hack">Hack-a-player threshold</Term>}
              name="Hack-a-player threshold"
              value={t.manage.hackThreshold}
              min={0}
              max={65}
              step={5}
              onChange={(x) => tweak((tt) => void (tt.manage.hackThreshold = x))}
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
            <Toggle on={t.manage.autoTimeouts} onChange={(x) => tweak((tt) => void (tt.manage.autoTimeouts = x))} label="Auto timeouts to stop runs" />
          </div>
          <div className="tx-ctl">
            <Slider
              label="Timeout after a run of"
              value={t.manage.timeoutRun}
              disabled={!t.manage.autoTimeouts}
              min={6}
              max={14}
              onChange={(x) => tweak((tt) => void (tt.manage.timeoutRun = x))}
              format={(x) => `${x}-0`}
            />
          </div>
          <div className="tx-ctl tx-ctl-chips">
            <div className="slider-label">Foul trouble</div>
            <Chips
              label="Foul trouble"
              value={t.manage.foulTrouble}
              onChange={(x: TacticsT['manage']['foulTrouble']) => tweak((tt) => void (tt.manage.foulTrouble = x))}
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
              onChange={(x) => tweak((tt) => void (tt.manage.fatigueSub = x / 100))}
              format={(x) => `${x}% energy`}
            />
          </div>
        </div>
      </Section>
    </>
  );
}
