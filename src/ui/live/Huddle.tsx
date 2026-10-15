import { useMemo, useState } from 'react';
import { ClipboardList, Lightbulb, Play } from 'lucide-react';
import type { League, Tactics, Team } from '../../core/types';
import { ACTION_META } from '../../core/sim/tactics';
import { atoLabel } from '../../core/sim/sets';
import { wpText } from '../../core/analysis/winProb';
import { buildGameReport } from '../../core/analysis/gameReport';
import { impactCounter } from '../../core/ai/advisor';
import { fmtClock, periodLabel } from '../stats';
import { Kpi } from '../components/ui';
import { foulLimit, type LiveAlert } from './alerts';
import type { Drawn } from './drawn';
import { PlayPicker } from './PlayPicker';
import { callLabel, type Calls } from './plays';
import type { GameKey } from '../../core/analysis/keys';
import { KeysLive, gameShare } from '../components/GameKeys';

/**
 * The timeout huddle, while your timeout is taken (the court has caught up with the game and waits):
 * the score, clock and your chance to win, your tired and foul-troubled players with the staff's sub
 * for each, the assistant's top suggestion with its fix, and the play out of the timeout (one drawn
 * up now replaces your standing after-timeout play). Every move goes through the live game's journal.
 */
export function Huddle({
  league,
  view,
  side,
  teams,
  tactics,
  nameOf,
  win,
  subFor,
  substitute,
  alerts,
  runAlert,
  apply,
  calls,
  onResume,
  keys,
}: {
  league: League;
  view: Drawn;
  side: 0 | 1;
  /** [home, away]. */
  teams: [Team, Team];
  tactics: Tactics;
  nameOf: (pid: number) => string;
  /** Your chance to win now (absent when it's switched off). */
  win?: number;
  /** The rested bench player the staff would send in for one of yours. */
  subFor: (pid: number) => number | undefined;
  substitute: (out: number, inn: number) => boolean;
  /** The assistant's alerts up now (his tactical ones come with a fix). */
  alerts: LiveAlert[];
  runAlert: (a: LiveAlert) => void;
  /** A tactics change through the live game. */
  apply: (fn: (t: Tactics) => void) => void;
  calls: Calls;
  onResume: () => void;
  /** Tonight's keys to the game. */
  keys?: GameKey[];
}) {
  const [drawing, setDrawing] = useState(false);
  const me = view.sides[side];
  const them = view.sides[1 - side];
  const meTeam = teams[side];
  const limit = foulLimit(view.q, tactics.manage.foulTrouble);
  const fat = tactics.manage.fatigueSub;
  const onFloor = me.players.filter((p) => me.on.includes(p.pid));
  // a step from the staff's lines: tired below their sub-out mark plus a little, or a foul from sitting
  const trouble = onFloor
    .map((p) => ({ p, tired: p.energy < fat + 0.1, fouls: p.fouls >= limit - 1 }))
    .filter((x) => x.tired || x.fouls)
    .sort((a, b) => a.p.energy - b.p.energy);
  // the assistant's top suggestion: a tactical alert of his, else the biggest edge against you with its counter
  const report = useMemo(() => buildGameReport(league, view.box, league.userTid, { partial: true, elapsed: view.elapsed, tactics }), [league, view, tactics]);
  const alert = alerts.find((a) => a.action?.kind === 'tactics');
  const edge = alert ? undefined : report?.factors.find((f) => f.pts < 0 && f.key && impactCounter(f.key, tactics));
  const fix = edge?.key ? impactCounter(edge.key, tactics) : undefined;
  const suggestion = alert
    ? { text: alert.text, label: alert.action!.label, run: () => runAlert(alert) }
    : edge && fix
      ? { text: edge.title, label: fix.label, run: () => apply(fix.apply) }
      : null;
  const ato = tactics.manage.ato;
  const atoText = ato ? atoLabel(ato, (a) => ACTION_META[a].label, tactics.manage.atoPid != null ? nameOf(tactics.manage.atoPid) : undefined) : null;
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="grid3">
        <Kpi k={meTeam.abbrev} v={`${me.score}-${them.score}`} />
        <Kpi k={periodLabel(view.q)} v={fmtClock(view.clock)} />
        <Kpi k="Win prob." v={win === undefined ? '—' : wpText(win)} />
      </div>
      <div className="tiny dim">
        {me.timeouts} timeout{me.timeouts === 1 ? '' : 's'} left.
      </div>

      <div className="col" style={{ gap: 8 }}>
        <div className="tiny dim upper bold">On the floor</div>
        {trouble.length === 0 ? (
          <div className="small dim">Nobody is tired or in foul trouble.</div>
        ) : (
          trouble.map(({ p, tired, fouls }) => {
            const sub = subFor(p.pid);
            return (
              <div key={p.pid} className="row" style={{ gap: 8 }}>
                <div className="grow small">
                  <b>{nameOf(p.pid)}</b> <span className={tired ? 'warn' : 'dim'}>{Math.round(p.energy * 100)}% energy</span>
                  {' · '}
                  <span className={fouls ? 'warn' : 'dim'}>
                    {p.fouls} foul{p.fouls === 1 ? '' : 's'}
                  </span>
                </div>
                {sub !== undefined ? (
                  <button className="btn xs" onClick={() => substitute(p.pid, sub)}>
                    {nameOf(sub)} in
                  </button>
                ) : (
                  <span className="tiny dim">No rested sub</span>
                )}
              </div>
            );
          })
        )}
      </div>

      {keys && keys.length > 0 && <KeysLive keys={keys} box={view.box} side={side} share={gameShare(view.elapsed, view.q)} compact />}

      {suggestion && (
        <div className="row top" style={{ gap: 8 }}>
          <Lightbulb size={16} style={{ color: 'var(--warn)', flex: 'none', marginTop: 2 }} aria-hidden="true" />
          <div className="grow small">{suggestion.text}</div>
          <button className="btn xs primary" onClick={suggestion.run}>
            {suggestion.label}
          </button>
        </div>
      )}

      <div className="col" style={{ gap: 8 }}>
        <div className="tiny dim upper bold">Out of the timeout</div>
        <div className="small">
          {calls.pending ? (
            <>
              Drawn up: <b>{callLabel(calls.pending, nameOf)}</b>
            </>
          ) : atoText ? (
            <>
              Your after-timeout play: <b>{atoText}</b>
            </>
          ) : (
            <span className="dim">No play drawn up: the team runs its offense.</span>
          )}
        </div>
        {drawing ? (
          <PlayPicker
            league={league}
            tactics={tactics}
            me={me}
            calls={calls}
            nameOf={nameOf}
            late={view.q >= 4 && view.clock <= 120}
            sets={league.settings.complexity !== 'simple'}
          />
        ) : (
          <button className="btn block" onClick={() => setDrawing(true)}>
            <ClipboardList size={16} /> Draw up a play
          </button>
        )}
      </div>

      <button className="btn primary block" onClick={onResume}>
        <Play size={16} fill="currentColor" /> Resume
      </button>
    </div>
  );
}
