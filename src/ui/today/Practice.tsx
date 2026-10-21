// Practice between games, as Football Manager's training focus: the focus the days between games are
// spent on (balanced, tactical drills, opponent prep, recovery), set from Today, and what the team
// knows of what it plays (the system's familiarity, an option it hasn't drilled, players still
// learning it), shown when it's short. The matchup page's briefing reads the same for tonight's
// tactics (its game plan on top) and offers the focus that answers a gap, one tap away.
import type { League, PrepFocus } from '../../core/types';
import { useLeagueMemo, useStore } from '../../state/store';
import { edit } from '../../state/actions';
import { PREP_META, famLabel } from '../../core/sim/familiarity';
import { famReadout, type FamReadout } from '../../core/ai/advisor';
import { andList, shortName } from '../../core/league/helpers';
import { Bar, Chips, Help, Section } from '../components/ui';
import './today.css';

const FOCUSES: PrepFocus[] = ['balanced', 'system', 'opponent', 'recovery'];

/** Below this the system's familiarity is worth a line on Today. */
const LOW = 90;

const tone = (v: number) => (v >= LOW ? 'var(--good)' : v >= 75 ? 'var(--text-2)' : v >= 55 ? 'var(--warn)' : 'var(--bad)');

/** Set the practice focus from the next practice day. */
export function setPrep(focus: PrepFocus) {
  if (edit((l) => void (l.teams[l.userTid].prep = focus))) useStore.getState().toast(`Practice: ${PREP_META[focus].label}.`, 'good');
}

/** Every focus explained, behind the "?". */
function PrepHelp() {
  return (
    <Help title="Practice focus">
      {FOCUSES.map((f) => (
        <p key={f}>
          <b>{PREP_META[f].label}.</b> {PREP_META[f].help}
        </p>
      ))}
      <p>Familiarity is how well the team knows what it plays: below 95% it plays a step slow (worse shots and more turnovers on offense, more open looks given up on defense).</p>
    </Help>
  );
}

/** The four focuses as chips. */
export function PrepChips({ league, label = 'Practice focus' }: { league: League; label?: string }) {
  const simming = useStore((s) => !!s.sim);
  const cur = league.teams[league.userTid].prep ?? 'balanced';
  return (
    <Chips label={label} value={cur} disabled={simming} onChange={(f: PrepFocus) => f !== cur && setPrep(f)} options={FOCUSES.map((f) => ({ id: f, label: PREP_META[f].label }))} />
  );
}

/** "System 84% · Familiar", with a bar. */
function FamMeter({ v, label = 'System' }: { v: number; label?: string }) {
  return (
    <div className="pr-meter">
      <span className="pr-meter-k">{label}</span>
      <span className="pr-meter-bar" aria-hidden="true">
        <Bar value={v} color={tone(v)} height={5} />
      </span>
      <span className="pr-meter-v num">
        {Math.round(v)}% · {famLabel(v)}
      </span>
    </div>
  );
}

/** What the readout says is short, a line each: an option the system plays that the team hasn't drilled, then players still learning it. */
function gaps(league: League, r: FamReadout): string[] {
  const out: string[] = [];
  const sys = r.risks.filter((x) => !x.plan);
  if (sys.length) {
    const what = andList(sys.map((x) => `${x.name} (${Math.round(x.v)}%)`));
    out.push(`${what.charAt(0).toUpperCase()}${what.slice(1)} still ${sys.length > 1 ? 'need' : 'needs'} drilling: a step slow until it's learned.`);
  }
  if (r.learning.length) {
    const names = r.learning.slice(0, 3).map((x) => `${league.players[x.pid] ? shortName(league, league.players[x.pid]) : '?'} (${Math.round(x.know)}%)`);
    out.push(`Still learning the system: ${andList(names)}.`);
  }
  return out;
}

/** Today's practice card: the focus, and the system's familiarity when it's short. */
export function PracticeCard({ league }: { league: League }) {
  const r = useLeagueMemo(() => famReadout(league), [league]);
  const lines = gaps(league, r);
  const low = r.overall < LOW || lines.length > 0;
  return (
    <Section title="Practice" right={<PrepHelp />} className="td-prac">
      <div className="pr-card">
        <PrepChips league={league} />
        <p className="pr-help">{PREP_META[r.prep].help}</p>
        {low && (
          <div className="pr-fam">
            <FamMeter v={r.overall} />
            {lines.map((l) => (
              <div key={l} className="small dim2">
                {l}
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

/**
 * The lead assistant on what the team knows of tonight's tactics (its plan against `opp` on top):
 * the figure and the focus, an option the plan calls for that the team hasn't drilled (opponent prep
 * drills it for the game: offered when `tonight` is the team's next game), and one the system
 * itself hasn't (tactical drills).
 */
export function FamBrief({ league, opp, tonight, chips }: { league: League; opp: number; tonight: boolean; chips?: boolean }) {
  const simming = useStore((s) => !!s.sim);
  const r = useLeagueMemo(() => famReadout(league, opp), [league, opp]);
  const plan = r.risks.filter((x) => x.plan);
  const sys = r.risks.filter((x) => !x.plan);
  const prepped = r.prep === 'opponent';
  const offer = (f: PrepFocus) =>
    r.prep !== f && (
      <button className="btn xs" disabled={simming} onClick={() => setPrep(f)}>
        {PREP_META[f].label}
      </button>
    );
  return (
    <div className="pr-brief">
      <FamMeter v={r.overall} label="Tonight" />
      {plan.length > 0 && (
        <div className="pr-risk">
          <span className="grow small">
            {prepped && tonight
              ? `Opponent prep has ${andList(plan.map((x) => x.name))} drilled for tonight (${Math.round(plan[0].v)}% otherwise).`
              : `We're ${Math.round(plan[0].v)}% familiar with ${plan[0].name} your plan calls for${plan.length > 1 ? ` (and ${andList(plan.slice(1).map((x) => x.name))})` : ''}${tonight ? ': opponent prep drills it for tonight.' : '.'}`}
          </span>
          {tonight && offer('opponent')}
        </div>
      )}
      {sys.length > 0 && (
        <div className="pr-risk">
          <span className="grow small">
            We&apos;re {Math.round(sys[0].v)}% familiar with {sys[0].name}: a step slow until it&apos;s drilled.
          </span>
          {offer('system')}
        </div>
      )}
      {chips ? (
        <div className="pr-chips">
          <span className="over">Practice</span>
          <PrepChips league={league} />
        </div>
      ) : (
        <div className="tiny dim">Practice between games: {PREP_META[r.prep].label}.</div>
      )}
    </div>
  );
}
