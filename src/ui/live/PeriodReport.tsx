// The breaks, on the live screen itself (the court steps aside for them): a period's end and your
// timeout. The period report reads the game so far as the staff does (its read, the moves it would
// make for the next period, who's tired or in foul trouble going into it, the keys, the score by
// quarter, the battle of play types, the teams side by side, the scorers, their coach's plan and
// adjustments, and your moves so far with what each did). The huddle is the short version for a
// timeout: who to sub, the staff's top move and the play out of it. The next
// period, or the game, goes on from the bench bar.
import { useMemo } from 'react';
import { FastForward } from 'lucide-react';
import type { CoachMove, GameAdjustment, League, Tactics, Team } from '../../core/types';
import { buildGameReport } from '../../core/analysis/gameReport';
import { impactCounter } from '../../core/ai/advisor';
import { FINISH_LABEL, type FinishType } from '../../core/sim/log';
import { ACTION_META } from '../../core/sim/tactics';
import { atoLabel } from '../../core/sim/sets';
import { zScore } from '../../core/analysis/playTypes';
import { plural } from '../../core/format';
import type { GameKey } from '../../core/analysis/keys';
import { Section } from '../components/ui';
import { QuarterTable, TeamComparison } from '../components/gameBlocks';
import { KeysLive } from '../components/GameKeys';
import { fmtClock, periodLabel } from '../stats';
import { foulLimit } from './alerts';
import type { Drawn } from './drawn';
import { AssistantHead, MovesList, NoteCard } from '../components/StaffCards';
import type { StaffAction, StaffNote } from './staff';
import { keysShare } from './session';

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
    .map((p) => ({ p, energy: Math.min(1, p.energy + rest), fouls: p.fouls >= limit - 1 }))
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
              <div className="grow" style={{ minWidth: 0 }}>
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
 * margin), the one-tap counter on each one going against you while your tactics still give it.
 */
function useDeciding(league: League, view: Drawn, tactics: Tactics): StaffNote[] {
  return useMemo(() => {
    const rep = buildGameReport(league, view.box, league.userTid, { partial: true, elapsed: view.elapsed, tactics });
    return (rep?.factors ?? []).slice(0, 3).map((f): StaffNote => {
      const fix = f.pts < 0 && f.key ? impactCounter(f.key, tactics) : undefined;
      return {
        id: `f-${f.key ?? f.title}`,
        kind: fix ? 'decision' : 'read',
        tone: f.pts >= 0 ? 'good' : 'bad',
        title: f.title,
        text: fix ? f.detail : (f.advice ?? f.detail),
        fig: { v: `${f.pts > 0 ? '+' : f.pts < 0 ? '−' : ''}${Math.abs(f.pts).toFixed(1)}`, unit: 'pts' },
        actions: fix ? [{ kind: 'tactics', label: fix.label, apply: fix.apply }] : [],
        rank: 60 + Math.abs(f.pts),
      };
    });
  }, [league, view, tactics]);
}

/** The staff's moves for the stretch ahead (its decisions, its pick first on each), then what's deciding the game. */
function Decisions({ notes, onAct, onDismiss, busy, max, deciding }: Pick<Common, 'notes' | 'onAct' | 'onDismiss' | 'busy'> & { max: number; deciding: StaffNote[] }) {
  const list = notes.filter((n) => n.kind === 'decision' && n.actions.some((a) => a.kind === 'tactics' || a.kind === 'sub')).slice(0, max);
  // (a counter the staff already offers isn't offered twice)
  const offered = new Set(list.flatMap((n) => n.actions.map((a) => a.label)));
  const edges = deciding.filter((n) => !n.actions.some((a) => offered.has(a.label)));
  return (
    <>
      {list.length > 0 && (
        <div className="lv-notes">
          {list.map((n) => (
            <NoteCard key={n.id} note={n} busy={busy} onAct={(a) => onAct(n, a)} onDismiss={() => onDismiss(n)} />
          ))}
        </div>
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
    <Section title="Points a trip by play">
      <div className="lv-bt">
        {col((1 - side) as 0 | 1)}
        {col(side)}
      </div>
    </Section>
  );
}

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
  },
) {
  const { view, side, teams, names, keys, assistant, read, moves, colors, oppPlan, adjustments, onSkip } = props;
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
        {sub.length > 0 && <div className="small dim2">{sub.join(' ')}</div>}
      </div>
      <AssistantHead name={assistant.name} initials={assistant.initials} read={read} />
      <Decisions {...props} max={3} deciding={deciding} />
      <Trouble {...props} huddle={false} />
      {keys && keys.length > 0 && <KeysLive keys={keys} box={view.box} side={side} share={keysShare(view.elapsed, q)} />}
      <Section title="By quarter">
        <QuarterTable g={view.box} abbrevs={{ [home.tid]: home.abbrev, [away.tid]: away.abbrev }} />
      </Section>
      <Battle view={view} side={side} teams={teams} baselines={props.baselines} />
      <Section title="Side by side">
        <TeamComparison g={view.box} colors={colors} only={['fg', 'tp', 'reb', 'tov', 'paint', 'ast']} />
        <div className="lv-bk-scorers small" style={{ marginTop: 10 }}>
          <div>
            <b>{away.abbrev}</b> <span className="dim2">{scorers(1)}</span>
          </div>
          <div>
            <b>{home.abbrev}</b> <span className="dim2">{scorers(0)}</span>
          </div>
        </div>
      </Section>
      {(oppPlan?.length || theirs.length > 0) && (
        <Section title="Their coach">
          <div className="small col" style={{ gap: 4 }}>
            {oppPlan && oppPlan.length > 0 && (
              <div>
                <span className="dim2">His plan tonight:</span> {oppPlan.map((x) => x.text).join(', ')}.
              </div>
            )}
            {theirs.map((a, i) => (
              <div key={i}>
                <span className="dim2 num">
                  {periodLabel(a.q)} {fmtClock(a.clock)}
                </span>{' '}
                {a.text}.
              </div>
            ))}
          </div>
        </Section>
      )}
      <Section title="Your moves">
        <MovesList moves={moves} abbrevs={abbrevs} nameOf={names} />
      </Section>
    </div>
  );
}

/** Your timeout: the staff's read and top move, who to sub, the keys and the play out of it (the score and the clock are on the scorebug). Resume is on the bench bar. */
export function Huddle(props: Common) {
  const { view, side, teams, tactics, names, keys, assistant, read } = props;
  const deciding = useDeciding(props.league, view, tactics).slice(0, 1);
  const ato = tactics.manage.ato;
  const atoText = ato ? atoLabel(ato, (a) => ACTION_META[a].label, tactics.manage.atoPid != null ? names(tactics.manage.atoPid) : undefined) : null;
  return (
    <div className="lv-rep huddle">
      <div className="lv-rep-head">
        <div className="lv-rep-kicker">Timeout {teams[side].abbrev}</div>
      </div>
      <AssistantHead name={assistant.name} initials={assistant.initials} read={read} />
      <Decisions {...props} max={2} deciding={deciding} />
      <Trouble {...props} huddle />
      {keys && keys.length > 0 && <KeysLive keys={keys} box={view.box} side={side} share={keysShare(view.elapsed, view.q)} compact />}
      <Section title="Out of the timeout">
        <div className="small">
          {atoText ? (
            <>
              Your after-timeout play: <b>{atoText}</b>
            </>
          ) : (
            <span className="dim">No play set: the team runs its offense. Set one in Tactics → Game Mgmt.</span>
          )}
        </div>
      </Section>
    </div>
  );
}
