// The breaks, on the live screen itself (the court steps aside for them): a period's end and your
// timeout. The period report opens on the story so far in a few short sentences (the score, the run
// that made the period, who's carrying you: see atmosphere.ts breakStory), then the staff's one voice
// (its read, the moves it would make for the next period, what's deciding the game), who's tired or in
// foul trouble going into it, the keys, and both benches (their coach's plan and adjustments, your
// moves). The box score, the team numbers and the play types are the Stats and Game plan views', a tap
// away on the bench bar.
// The huddle is the short version for a timeout: late in a close game the play call first (built around
// your closer, with the staff's pick marked: usePlayWorth), then who to sub and the staff's top move; the
// last possession of a close game stops for the same play call without one. The staff's call says what
// it would do from this spot (calls.ts), or that it would change nothing. The next period, or the game,
// goes on from the bench bar.
import { useMemo } from 'react';
import { Check, FastForward, Lightbulb, Timer } from 'lucide-react';
import type { CallId, CoachMove, GameAdjustment, League, Tactics, Team } from '../../core/types';
import { buildGameReport, decidingFactors } from '../../core/analysis/gameReport';
import { ACTION_META } from '../../core/sim/tactics';
import { CLEAR_OUT, SETS, atoLabel, callLabel } from '../../core/sim/sets';
import { gameTime, plural } from '../../core/format';
import type { GameKey } from '../../core/analysis/keys';
import { Section } from '../components/ui';
import { KeysLive } from '../components/GameKeys';
import { fmtClock, periodLabel } from '../stats';
import { edgeWord } from '../../core/analysis/staffWords';
import { closeGame } from './alerts';
import { Trouble } from './Trouble';
import type { Drawn } from './drawn';
import { AssistantHead, MovesList, NoteCard } from '../components/StaffCards';
import type { StaffAction, StaffNote } from './staff';
import { keysShare } from './session';
import { playOptions, readStatus, type PlayOption } from './plays';
import { favoured, usePlayWorth, type PlayReading } from './usePlayWorth';
import { CLUTCH_SEC, pendingLive } from '../../state/live';

interface Common {
  league: League;
  view: Drawn;
  side: 0 | 1;
  /** [home, away]. */
  teams: [Team, Team];
  tactics: Tactics;
  names: (pid: number) => string;
  assistant: { name: string; initials: string };
  read: string;
  /** The staff's notes now (decisions first). */
  notes: StaffNote[];
  onAct: (n: StaffNote, a: StaffAction) => void;
  onDismiss: (n: StaffNote) => void;
  /** The rested bench player the staff would send in for one of yours. */
  subFor: (pid: number) => number | undefined;
  substitute: (out: number, inn: number) => boolean;
  keys?: GameKey[];
  moves: CoachMove[];
  busy?: boolean;
  /** The staff's line when it measured and found nothing to change, or while it measures (useStaffCall). */
  quiet?: string | null;
}

/**
 * What's deciding the game so far: the report's biggest edges, sized in a word, as reads. The counter
 * to one going against you is the staff's to measure from here before it's offered (calls.ts: its call
 * leads the report when one clears), so an edge carries its detail, not a one-tap fix.
 */
function useDeciding(league: League, view: Drawn, tactics: Tactics): StaffNote[] {
  return useMemo(() => {
    const rep = buildGameReport(league, view.box, league.userTid, { partial: true, elapsed: view.elapsed, tactics });
    return decidingFactors(rep?.factors ?? []).map((f): StaffNote => ({
      id: `f-${f.key ?? f.title}`,
      kind: 'read',
      tone: f.pts >= 0 ? 'good' : 'bad',
      title: f.title,
      text: f.detail,
      tag: edgeWord(f.pts),
      actions: [],
      rank: 60 + Math.abs(f.pts),
    }));
  }, [league, view, tactics]);
}

/** The staff's moves for the stretch ahead (its decisions, its pick first on each), then what's deciding the game. */
function Decisions({
  notes,
  onAct,
  onDismiss,
  busy,
  max,
  deciding,
  quiet,
}: Pick<Common, 'notes' | 'onAct' | 'onDismiss' | 'busy' | 'quiet'> & { max: number; deciding: StaffNote[] }) {
  const list = notes.filter((n) => n.kind === 'decision' && n.actions.some((a) => a.kind === 'tactics' || a.kind === 'sub')).slice(0, max);
  // (a counter the staff already offers isn't offered twice)
  const offered = new Set(list.flatMap((n) => n.actions.map((a) => a.label)));
  const edges = deciding.filter((n) => !n.actions.some((a) => offered.has(a.label)));
  return (
    <>
      {list.length > 0 ? (
        <div className="lv-notes">
          {list.map((n) => (
            <NoteCard key={n.id} note={n} busy={busy} onAct={(a) => onAct(n, a)} onDismiss={() => onDismiss(n)} />
          ))}
        </div>
      ) : (
        quiet && (
          <div className="lv-calm small dim" role="status">
            {quiet}
          </div>
        )
      )}
      {edges.length > 0 && (
        <Section title="What's deciding it">
          <div className="lv-notes reads">
            {edges.map((n) => (
              <NoteCard key={n.id} note={n} busy={busy} onAct={(a) => onAct(n, a)} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

/** The period's end: the report, as the staff reads the game so far. The next period starts from the bench bar. */
export function PeriodReport(
  props: Common & {
    /** The game plan the other coach brought tonight, if he game-planned. */
    oppPlan?: readonly { text: string }[];
    /** The other coach's adjustments so far. */
    adjustments: GameAdjustment[];
    /** Skip ahead from here. */
    onSkip?: () => void;
    /** The story so far, in a line. */
    story?: string;
  },
) {
  const { view, side, teams, names, keys, assistant, read, moves, oppPlan, adjustments, onSkip, story } = props;
  const me = view.sides[side];
  const them = view.sides[1 - side];
  const lead = me.score - them.score;
  const q = view.q;
  // the timeouts the next period starts with, when its rule cuts them (the scorebug has the ones left now)
  const timeouts = q + 1 >= 5 ? 2 : q + 1 === 4 ? Math.min(4, me.timeouts) : me.timeouts;
  const sub = [
    ...(q >= 4 && lead === 0 ? [`Tied at ${me.score}: overtime next.`] : []),
    ...(timeouts !== me.timeouts ? [`${plural(timeouts, 'timeout')} for ${q + 1 >= 5 ? 'overtime' : periodLabel(q + 1)}.`] : []),
  ];
  const theirs = adjustments.filter((a) => a.t !== side);
  const abbrevs = { us: teams[side].abbrev, them: teams[1 - side].abbrev };
  const deciding = useDeciding(props.league, view, props.tactics);
  return (
    <div className="lv-rep">
      {/* (the score, the chance to win and the timeouts are on the scorebug just above: said once) */}
      <div className="lv-rep-head">
        <div className="lv-rep-kicker">
          <span>{q === 2 ? 'Halftime' : q === 4 ? 'End of regulation' : `End of ${periodLabel(q)}`}</span>
          {onSkip && (
            <button className="lv-rep-skip" onClick={onSkip} aria-haspopup="dialog">
              <FastForward size={14} aria-hidden="true" /> Skip ahead
            </button>
          )}
        </div>
        {story && <p className="lv-rep-story">{story}</p>}
        {sub.length > 0 && <div className="small dim2">{sub.join(' ')}</div>}
      </div>
      <AssistantHead name={assistant.name} initials={assistant.initials} read={read} />
      <Decisions {...props} max={3} deciding={deciding} />
      <Trouble view={view} side={side} tactics={props.tactics} names={names} subFor={props.subFor} substitute={props.substitute} ahead />
      {keys && keys.length > 0 && <KeysLive keys={keys} box={view.box} side={side} share={keysShare(view.elapsed, q)} />}
      <Section title="Both benches">
        <div className="lv-coaches">
          <div className="lv-coach small">
            <div className="over">Their coach</div>
            {oppPlan && oppPlan.length > 0 && (
              <div>
                <span className="dim2">Plan:</span> {oppPlan.map((x) => x.text).join(', ')}.
              </div>
            )}
            {theirs.map((a, i) => (
              <div key={i}>
                <span className="dim2 num">{gameTime(a.q, a.clock)}</span> {a.text}.
              </div>
            ))}
            {!oppPlan?.length && !theirs.length && <div className="dim">No plan or adjustment yet.</div>}
          </div>
          <div className="lv-coach">
            <div className="over">Your moves</div>
            <MovesList moves={moves} abbrevs={abbrevs} nameOf={names} />
          </div>
        </div>
      </Section>
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What one of the late plays goes for, in a line: an isolation's matchup, a set's look (and how far their defense has read it tonight). */
function playLook(p: PlayOption, view: Drawn, side: 0 | 1, names: (pid: number) => string, defenderOf: (pid: number) => number | undefined): string {
  if (p.id === 'iso') {
    const d = defenderOf(p.pid);
    return d !== undefined ? `One-on-one against ${names(d)}` : cap(CLEAR_OUT.look);
  }
  const r = readStatus(view.sides[side], p.id);
  return `${r.runs ? `${r.text} · ` : ''}${cap(SETS[p.id].look)}`;
}

/**
 * The late play call, at the top of a late huddle and of the last possession: built around your closer
 * (who he is, in a line), his isolation and his sets first, each play saying who it's for, the staff's
 * pick marked once it has one (the rest of the game played out against no call: usePlayWorth), the one
 * called lit; under it, when it runs.
 */
function PlayCall({
  plays,
  closer,
  view,
  side,
  tactics,
  names,
  called,
  onCall,
  busy,
  defenderOf,
  foot,
  readings,
}: Pick<Common, 'view' | 'side' | 'tactics' | 'names' | 'busy'> & {
  plays: PlayOption[];
  closer: number;
  called: { set: CallId; pid: number | null } | null;
  onCall: (id: CallId, pid: number) => void;
  defenderOf: (pid: number) => number | undefined;
  foot: string;
  /** Each play's reading, in `plays` order (null while it's measured). */
  readings: PlayReading[] | null;
}) {
  const goTo = tactics.manage.goTo;
  const pick = favoured(readings);
  const who =
    goTo === closer
      ? `${names(closer)} is your go-to.`
      : goTo != null
        ? `${names(goTo)} sits: ${names(closer)} is the best closer out there.`
        : `No go-to set: ${names(closer)} is the best closer out there.`;
  return (
    <Section title="Call the play">
      <div className="small dim2 lv-pc-who">{who}</div>
      <div className="card flush list" role="group" aria-label="Call the play">
        {plays.map((p, i) => {
          const on = called?.set === p.id && (called.pid === null || called.pid === p.pid);
          return (
            <button key={`${p.id}-${p.pid}`} className={`lv-pc${on ? ' on' : ''}`} aria-pressed={on} disabled={busy} onClick={() => onCall(p.id, p.pid)}>
              <span className="lv-pc-mark" aria-hidden="true">
                {on && <Check size={14} strokeWidth={3} />}
              </span>
              <span className="grow">
                <span className="lr-name">{callLabel(p.id, names(p.pid))}</span>
                <span className="lr-meta ellipsis">{playLook(p, view, side, names, defenderOf)}</span>
              </span>
              {pick === i && (
                <span className="lv-pc-pick">
                  <Lightbulb size={13} aria-hidden="true" /> Staff&apos;s pick
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="small dim lv-pc-foot">{foot}</div>
    </Section>
  );
}

/**
 * Your timeout ('timeout'): late in a close game (closeGame) the play call first, built around your
 * closer; then the staff's read and top move, who to sub and the keys (earlier, or in a decided game,
 * the play out of it at the foot). The last possession ('last': the game stopped for it, no timeout
 * taken): the situation, the play call (shouted from the bench), a timeout to take if one is left, and
 * who to sub. The score and the clock are on the scorebug; Resume is on the bench bar.
 */
export function Huddle(
  props: Common & {
    kind: 'timeout' | 'last';
    called: { set: CallId; pid: number | null } | null;
    onCall: (id: CallId, pid: number) => void;
    /** Who the late call is built around (GameSim.closer): your go-to while he's on the floor, else the best closer out there. */
    closer?: number;
    /** Their defender on one of yours. */
    defenderOf: (pid: number) => number | undefined;
    /** At the last possession, with a timeout left: take it (the huddle opens, the call kept). */
    onTimeout?: () => void;
  },
) {
  const { kind, view, side, tactics, names, keys, assistant, read, called, closer, onTimeout } = props;
  const deciding = useDeciding(props.league, view, tactics).slice(0, 1);
  const ato = tactics.manage.ato;
  const atoText = ato ? atoLabel(ato, (a) => ACTION_META[a].label, tactics.manage.atoPid != null ? names(tactics.manage.atoPid) : undefined) : null;
  // late in a close game the play out of the timeout is yours to call (decided, there's none worth calling)
  const late = kind === 'last' || (view.q >= 4 && view.clock <= CLUTCH_SEC && closeGame(view, pendingLive(props.league)?.edge ?? 0));
  const five = view.sides[side].on;
  const plays = useMemo(() => (late && closer !== undefined ? playOptions(props.league, five, tactics, closer) : []), [late, props.league, five, tactics, closer]);
  // (in a huddle the sim is where the court is: the options are measured from there)
  const readings = usePlayWorth(pendingLive(props.league), plays, late && closer !== undefined);
  const callName = called ? callLabel(called.set, called.pid != null ? names(called.pid) : undefined) : '';
  const foot =
    kind === 'last'
      ? called
        ? `Called: ${callName}.`
        : `No call: they run the offense, through ${closer !== undefined ? names(closer) : 'your closer'}.`
      : called
        ? `Called: ${callName}, on your next trip up the floor.`
        : `Runs on your next trip up the floor${atoText ? `, in place of your after-timeout play, ${atoText}` : ''}.`;
  const call = plays.length > 0 && closer !== undefined ? <PlayCall {...props} plays={plays} closer={closer} foot={foot} readings={readings} /> : null;
  if (kind === 'last') {
    const me = view.sides[side];
    const margin = me.score - view.sides[1 - side].score;
    return (
      <div className="lv-rep huddle">
        <div className="lv-rep-head">
          <div className="lv-rep-kicker">
            <span>Last possession</span>
            {onTimeout && (
              <button className="lv-rep-skip" onClick={onTimeout} disabled={props.busy}>
                <Timer size={14} aria-hidden="true" /> Timeout
              </button>
            )}
          </div>
          <div className="small dim2">
            {margin === 0 ? `Tied at ${me.score}` : `Down ${-margin}`}, {fmtClock(view.clock)} left, your ball.{' '}
            {onTimeout ? 'A timeout sets up the play, but lets them adjust.' : 'No timeouts left: call it from the bench.'}
          </div>
        </div>
        {call}
        <Trouble view={view} side={side} tactics={tactics} names={names} subFor={props.subFor} substitute={props.substitute} />
      </div>
    );
  }
  return (
    <div className="lv-rep huddle">
      <div className="lv-rep-head">
        <div className="lv-rep-kicker">Your timeout</div>
      </div>
      {call}
      <AssistantHead name={assistant.name} initials={assistant.initials} read={read} />
      <Decisions {...props} max={2} deciding={deciding} />
      <Trouble view={view} side={side} tactics={tactics} names={names} subFor={props.subFor} substitute={props.substitute} />
      {keys && keys.length > 0 && <KeysLive keys={keys} box={view.box} side={side} share={keysShare(view.elapsed, view.q)} />}
      {/* (the saved after-timeout play, read-only: it's set away from the game, so with none there's nothing to say) */}
      {!call && atoText && (
        <Section title="Out of the timeout">
          <div className="small">
            Your after-timeout play: <b>{atoText}</b>
          </div>
        </Section>
      )}
    </div>
  );
}
