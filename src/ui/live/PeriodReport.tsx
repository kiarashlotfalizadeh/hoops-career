// The breaks, on the live screen itself (the court steps aside for them): a period's end and your
// timeout. The period report opens on the story so far in a line (the score, the run that made the
// period, who's carrying you: see atmosphere.ts breakStory), then the staff's one voice (its read, the
// moves it would make for the next period, what's deciding the game), who's tired or in foul trouble
// going into it and the keys; the rest of the game so far (the score by quarter and the scorers, the
// battle of play types, the teams side by side, both coaches' moves) sits behind one switch under it.
// The huddle is the short version for a timeout: late in the game the play call first (built around
// your closer, each play measured from where the game stands against no call, best first:
// usePlayWorth), then who to sub and the staff's top move; the last possession of a close game stops
// for the same play call without one. The staff's call says what it measured from this spot (calls.ts),
// or that nothing it measured clears the noise. The next period, or the game, goes on from the bench bar.
import { useMemo, useState } from 'react';
import { Check, FastForward, Timer } from 'lucide-react';
import type { CallId, CoachMove, GameAdjustment, League, Tactics, Team } from '../../core/types';
import { buildGameReport, decidingFactors } from '../../core/analysis/gameReport';
import { FINISH_LABEL, type FinishType } from '../../core/sim/log';
import { ACTION_META } from '../../core/sim/tactics';
import { CLEAR_OUT, SETS, atoLabel, callLabel } from '../../core/sim/sets';
import { zScore } from '../../core/analysis/playTypes';
import { gameTime, plural } from '../../core/format';
import type { GameKey } from '../../core/analysis/keys';
import { Section, Segmented } from '../components/ui';
import { QuarterTable, TeamComparison } from '../components/gameBlocks';
import { KeysLive } from '../components/GameKeys';
import { fmtClock, periodLabel, signed } from '../stats';
import { foulLimit } from './alerts';
import type { Drawn } from './drawn';
import { AssistantHead, MovesList, NoteCard } from '../components/StaffCards';
import type { StaffAction, StaffNote } from './staff';
import { keysShare } from './session';
import { playOptions, readStatus, type PlayOption } from './plays';
import { usePlayWorth, type PlayReading } from './usePlayWorth';
import { CHOICE_GAMES } from '../../state/liveWorth';
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

/** Your five going into the next stretch who are tired or in foul trouble, each with the staff's sub. */
function Trouble({ view, side, tactics, names, subFor, substitute, huddle }: Common & { huddle: boolean }) {
  const q = view.q;
  const me = view.sides[side];
  // in the huddle, as things stand; at a break, going into the next period (its foul limit, the break's rest)
  const limit = foulLimit(huddle ? q : q + 1, tactics.manage.foulTrouble);
  const rest = huddle ? 0 : q === 2 ? 0.3 : 0.1;
  const fat = tactics.manage.fatigueSub;
  const trouble = me.players
    .filter((p) => me.on.includes(p.pid))
    // (one foul from where the staff sits him, and never a single foul: one in the first quarter isn't trouble)
    .map((p) => ({ p, energy: Math.min(1, p.energy + rest), fouls: p.fouls >= Math.max(2, limit - 1) }))
    .filter((x) => x.p.out === 0 && (x.energy < fat + 0.1 || x.fouls))
    .sort((a, b) => a.energy - b.energy)
    .slice(0, 4);
  if (!trouble.length) return null;
  return (
    <Section title={huddle ? 'Tired or in foul trouble' : `Into ${periodLabel(q + 1)}`}>
      <div className="card flush list">
        {trouble.map(({ p, energy, fouls }) => {
          const sub = subFor(p.pid);
          const tired = energy < fat + 0.1;
          return (
            <div key={p.pid} className="lv-bk-row">
              <div className="lv-bk-who">
                <div className="bold ellipsis">{names(p.pid)}</div>
                <div className="small num">
                  <span className={tired ? 'warn' : 'dim'}>{Math.round(energy * 100)}% energy</span>
                  <span className="dim"> · </span>
                  <span className={fouls ? 'warn' : 'dim'}>{plural(p.fouls, 'foul')}</span>
                </div>
              </div>
              {sub !== undefined ? (
                <button className="btn sm" onClick={() => substitute(p.pid, sub)}>
                  {names(sub)} in
                </button>
              ) : (
                <span className="tiny dim">No rested sub</span>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/**
 * What's deciding the game so far: the report's biggest edges (each worth so many points of the
 * margin), as reads. The counter to one going against you is the staff's to measure from here before
 * it's offered (calls.ts: its call leads the report when one clears), so an edge carries its detail,
 * not a one-tap fix with no number (or one the staff's numbers call a cost).
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
      fig: { v: `${f.pts > 0 ? '+' : f.pts < 0 ? '−' : ''}${Math.abs(f.pts).toFixed(1)}`, unit: 'pts' },
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

/** Their play types and yours, the three each runs most, against the league's. */
function Battle({ view, side, teams, baselines }: Pick<Common, 'view' | 'side' | 'teams'> & { baselines: Record<string, number> }) {
  const rows = (s: 0 | 1) =>
    Object.entries(view.sides[s].pt)
      .filter(([k, v]) => k !== 'misc' && v.poss >= 3)
      .sort((a, b) => b[1].poss - a[1].poss)
      .slice(0, 3);
  const col = (s: 0 | 1) => {
    const mine = s === side;
    return (
      <div className="lv-bt-col">
        <div className="over">{teams[s].abbrev} on offense</div>
        {rows(s).map(([k, v]) => {
          const base = baselines[k];
          const z = base !== undefined ? zScore(v, base) : 0;
          const tone = Math.abs(z) < 1 ? '' : z > 0 === mine ? 'good' : 'bad';
          return (
            <div key={k} className="lv-bt-row small">
              <span className="grow ellipsis">{FINISH_LABEL[k as FinishType]}</span>
              <span className={`num bold ${tone}`}>{(v.pts / v.poss).toFixed(2)}</span>
              <span className="tiny dim num">({v.poss})</span>
            </div>
          );
        })}
      </div>
    );
  };
  return (
    <div className="lv-bt">
      {col((1 - side) as 0 | 1)}
      {col(side)}
    </div>
  );
}

/** The game so far behind one switch: the score by quarter and the scorers, the play types, the teams side by side, the coaches' moves. */
type SoFar = 'score' | 'plays' | 'teams' | 'coaches';

/** The period's end: the report, as the staff reads the game so far. The next period starts from the bench bar. */
export function PeriodReport(
  props: Common & {
    baselines: Record<string, number>;
    /** Away, home bar colours. */
    colors: [string, string];
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
  const { view, side, teams, names, keys, assistant, read, moves, colors, oppPlan, adjustments, onSkip, story } = props;
  const [home, away] = teams;
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
  const scorers = (s: 0 | 1) =>
    [...view.sides[s].players]
      .filter((p) => p.pts > 0)
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 3)
      .map((p) => `${names(p.pid)} ${p.pts}`)
      .join(', ') || '—';
  const theirs = adjustments.filter((a) => a.t !== side);
  const abbrevs = { us: teams[side].abbrev, them: teams[1 - side].abbrev };
  const deciding = useDeciding(props.league, view, props.tactics);
  const [soFar, setSoFar] = useState<SoFar>('score');
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
      <Trouble {...props} huddle={false} />
      {keys && keys.length > 0 && <KeysLive keys={keys} box={view.box} side={side} share={keysShare(view.elapsed, q)} />}
      <Section title="So far">
        <Segmented
          value={soFar}
          onChange={setSoFar}
          label="The game so far"
          options={[
            { id: 'score', label: 'Score' },
            { id: 'plays', label: 'Play types' },
            { id: 'teams', label: 'Teams' },
            { id: 'coaches', label: 'Coaches' },
          ]}
        />
        {soFar === 'score' && (
          <>
            <QuarterTable g={view.box} abbrevs={{ [home.tid]: home.abbrev, [away.tid]: away.abbrev }} />
            <div className="lv-bk-scorers small">
              <div>
                <b>{away.abbrev}</b> <span className="dim2">{scorers(1)}</span>
              </div>
              <div>
                <b>{home.abbrev}</b> <span className="dim2">{scorers(0)}</span>
              </div>
            </div>
          </>
        )}
        {soFar === 'plays' && <Battle view={view} side={side} teams={teams} baselines={props.baselines} />}
        {soFar === 'teams' && <TeamComparison g={view.box} colors={colors} only={['fg', 'tp', 'reb', 'tov', 'paint', 'ast']} />}
        {soFar === 'coaches' && (
          <div className="lv-coaches">
            <div className="lv-coach small">
              <div className="over">Their coach</div>
              {oppPlan && oppPlan.length > 0 && (
                <div>
                  <span className="dim2">His plan tonight:</span> {oppPlan.map((x) => x.text).join(', ')}.
                </div>
              )}
              {theirs.map((a, i) => (
                <div key={i}>
                  <span className="dim2 num">{gameTime(a.q, a.clock)}</span> {a.text}.
                </div>
              ))}
              {!oppPlan?.length && !theirs.length && <div className="dim">No plan or adjustment from him yet.</div>}
            </div>
            <div className="lv-coach">
              <div className="over">Your moves</div>
              <MovesList moves={moves} abbrevs={abbrevs} nameOf={names} />
            </div>
          </div>
        )}
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

/** What one play's reading says, beside it: its win chance against no call, too close to say, or still being measured. */
function PlayWorth({ r }: { r: PlayReading | null }) {
  if (!r) return <span className="lv-pc-worth tiny dim">Measuring…</span>;
  if (!r.clear) return <span className="lv-pc-worth tiny dim">Too close to say</span>;
  return (
    <span className={`lv-pc-worth num ${r.win > 0 ? 'good' : 'bad'}`}>
      {signed(r.win * 100, 0)}%<span className="lv-pc-u">to win</span>
    </span>
  );
}

/**
 * The late play call, at the top of a late huddle and of the last possession: built around your closer
 * (who he is, in a line), his isolation and his sets first, each play saying who it's for and what it's
 * worth from here (the rest of the game played out with it against no call: usePlayWorth), best first
 * once they're measured, the one called lit; under it, when it runs.
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
  // best first once measured: the win chance, then the margin
  const rows = plays.map((p, i) => ({ p, r: readings?.[i] ?? null }));
  if (readings) rows.sort((a, b) => b.r!.win - a.r!.win || b.r!.pts - a.r!.pts);
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
        {rows.map(({ p, r }) => {
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
              <PlayWorth r={r} />
            </button>
          );
        })}
      </div>
      <div className="small dim lv-pc-foot">
        {foot}
        {readings && ` Each against no call, the rest of the game played ${CHOICE_GAMES} times.`}
      </div>
    </Section>
  );
}

/**
 * Your timeout ('timeout'): late in the game the play call first, built around your closer; then the
 * staff's read and top move, who to sub and the keys (earlier, the play out of it at the foot). The last
 * possession ('last': the game stopped for it, no timeout taken): the situation, the play call (shouted
 * from the bench), a timeout to take if one is left, and who to sub. The score and the clock are on the
 * scorebug; Resume is on the bench bar.
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
  const { kind, view, side, teams, tactics, names, keys, assistant, read, called, closer, onTimeout } = props;
  const deciding = useDeciding(props.league, view, tactics).slice(0, 1);
  const ato = tactics.manage.ato;
  const atoText = ato ? atoLabel(ato, (a) => ACTION_META[a].label, tactics.manage.atoPid != null ? names(tactics.manage.atoPid) : undefined) : null;
  // late in the game the play out of the timeout is yours to call
  const late = kind === 'last' || (view.q >= 4 && view.clock <= CLUTCH_SEC);
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
        : `Runs on your next trip up the floor${atoText ? `, in place of your after-timeout play (${atoText})` : ''}.`;
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
            {onTimeout ? 'A timeout rests legs and sets the play up, but gives their coach a chance to adjust.' : 'No timeouts left: you call it from the bench.'}
          </div>
        </div>
        {call}
        <Trouble {...props} huddle />
      </div>
    );
  }
  return (
    <div className="lv-rep huddle">
      <div className="lv-rep-head">
        <div className="lv-rep-kicker">Timeout {teams[side].abbrev}</div>
      </div>
      {call}
      <AssistantHead name={assistant.name} initials={assistant.initials} read={read} />
      <Decisions {...props} max={2} deciding={deciding} />
      <Trouble {...props} huddle />
      {keys && keys.length > 0 && <KeysLive keys={keys} box={view.box} side={side} share={keysShare(view.elapsed, view.q)} compact />}
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
