import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ClipboardList, Lightbulb, Play } from 'lucide-react';
import type { League, Tactics, Team } from '../../core/types';
import { buildGameReport, setLineText, setLines } from '../../core/analysis/gameReport';
import { impactCounter, liveCounter } from '../../core/ai/advisor';
import { zScore } from '../../core/analysis/playTypes';
import { FINISH_LABEL, type FinishType } from '../../core/sim/log';
import { ACTION_META } from '../../core/sim/tactics';
import { atoLabel } from '../../core/sim/sets';
import { wpText } from '../../core/analysis/winProb';
import type { GameKey } from '../../core/analysis/keys';
import { More, Section, Statline } from '../components/ui';
import { QuarterTable, TeamComparison } from '../components/gameBlocks';
import { KeysLive, gameShare } from '../components/GameKeys';
import '../components/agenda.css';
import { fmtClock, periodLabel, signed } from '../stats';
import { foulLimit, type LiveAlert } from './alerts';
import type { Drawn } from './drawn';
import { callLabel, readStatus, type Calls } from './plays';

/** A fix the staff would make now: what it's about, a figure, and the change one tap away. */
interface Fix {
  id: string;
  title: string;
  line?: string;
  /** "+3.2" / "1.21": the figure the row leads with. */
  fig?: string;
  tone: 'good' | 'bad' | 'warn';
  label?: string;
  run?: () => void;
}

/**
 * The break, one screen for both stops: a period's end (`period`: the period report, then Start Q3)
 * and your timeout (`huddle`: the play out of it, then Resume). The score and your chance to win;
 * who's tired or in foul trouble with the staff's sub one tap away; what's deciding the game, each
 * with the staff's fix; the keys to the game and the score by quarter; and the rest (the teams side
 * by side, the scorers, your sets, their plan) one tap down. Every move goes through the live
 * game's journal.
 */
export function Break({
  mode,
  league,
  view,
  side,
  teams,
  tactics,
  names,
  baselines,
  colors,
  apply,
  alerts,
  runAlert,
  subFor,
  substitute,
  calls,
  drawUp,
  keys,
  win,
  oppPlan,
  onGo,
}: {
  mode: 'period' | 'huddle';
  league: League;
  view: Drawn;
  side: 0 | 1;
  /** [home, away]. */
  teams: [Team, Team];
  /** The user's tactics now. */
  tactics: Tactics;
  names: (pid: number) => string;
  /** This season's points per possession by play type. */
  baselines: Record<string, number>;
  /** Away, home bar colours. */
  colors: [string, string];
  apply: (fn: (t: Tactics) => void) => void;
  /** The assistant's alerts up now (his tactical ones come with a fix). */
  alerts: LiveAlert[];
  runAlert: (a: LiveAlert) => void;
  /** The rested bench player the staff would send in for one of yours. */
  subFor: (pid: number) => number | undefined;
  substitute: (out: number, inn: number) => boolean;
  calls: Calls;
  /** The Calls tab, for the play out of the timeout. */
  drawUp: ReactNode;
  keys?: GameKey[];
  /** Your chance to win now (absent when it's switched off). */
  win?: number;
  /** The game plan the other coach brought tonight, if he game-planned. */
  oppPlan?: readonly { text: string }[];
  /** Start the next period, or resume after the timeout. */
  onGo: () => void;
}) {
  const [drawing, setDrawing] = useState(false);
  const huddle = mode === 'huddle';
  const report = useMemo(() => buildGameReport(league, view.box, league.userTid, { partial: true, elapsed: view.elapsed, tactics }), [league, view, tactics]);
  const q = view.q;
  const next = periodLabel(q + 1);
  const [home, away] = teams;
  const me = view.sides[side];
  const them = view.sides[1 - side];
  const meTeam = teams[side];

  // trouble: in the huddle, as things stand; at a break, going into the next period (its foul limit, the break's rest)
  const limit = foulLimit(huddle ? q : q + 1, tactics.manage.foulTrouble);
  const rest = huddle ? 0 : q === 2 ? 0.3 : 0.1;
  const fat = tactics.manage.fatigueSub;
  // (the five on the floor: the ones who start the next period, or come out of the timeout)
  const trouble = me.players
    .filter((p) => me.on.includes(p.pid))
    .map((p) => ({ p, energy: Math.min(1, p.energy + rest), fouls: p.fouls >= limit - 1 }))
    .filter((x) => x.p.out === 0 && (x.energy < fat + 0.1 || x.fouls))
    .sort((a, b) => a.energy - b.energy)
    .slice(0, 4);

  // what's deciding it, each with the staff's fix: the report's biggest edges, their play types running hot, his tactical alerts
  const fixes: Fix[] = [];
  const seen = new Set<string>();
  for (const f of (report?.factors ?? []).slice(0, 3)) {
    const fix = f.pts < 0 && f.key ? impactCounter(f.key, tactics) : undefined;
    if (fix) seen.add(fix.label);
    fixes.push({
      id: `f-${f.key ?? f.title}`,
      title: f.title,
      line: fix ? undefined : f.advice,
      fig: signed(f.pts),
      tone: f.pts >= 0 ? 'good' : 'bad',
      label: fix?.label,
      run: fix && (() => apply(fix.apply)),
    });
  }
  const hot = Object.entries(them.pt)
    .filter(([k, v]) => k !== 'misc' && baselines[k] !== undefined && v.poss >= 6 && zScore(v, baselines[k]) > 1.5)
    .sort((a, b) => zScore(b[1], baselines[b[0]]) - zScore(a[1], baselines[a[0]]))
    .slice(0, 2);
  for (const [k, v] of hot) {
    const c = liveCounter(k as FinishType, tactics);
    if (c && seen.has(c.label)) continue;
    if (c) seen.add(c.label);
    fixes.push({
      id: `pt-${k}`,
      title: `Their ${FINISH_LABEL[k as FinishType]}`,
      line: `${(v.pts / v.poss).toFixed(2)} points a trip on ${v.poss} (league ${baselines[k].toFixed(2)}).${c?.note ? ` ${c.note}` : ''}`,
      fig: (v.pts / v.poss).toFixed(2),
      tone: 'warn',
      label: c?.label,
      run: c && (() => apply(c.apply)),
    });
  }
  for (const a of alerts) {
    if (a.action?.kind !== 'tactics' || seen.has(a.action.label)) continue;
    seen.add(a.action.label);
    fixes.push({ id: a.id, title: a.title, line: a.text, tone: 'warn', label: a.action.label, run: () => runAlert(a) });
  }
  // in the huddle, the one that matters most: a fix first
  const shown = huddle ? fixes.filter((f) => f.run).slice(0, 1) : fixes.slice(0, 4);

  // the fourth quarter keeps at most four timeouts, each overtime brings two
  const timeouts = huddle ? me.timeouts : q + 1 >= 5 ? 2 : q + 1 === 4 ? Math.min(4, me.timeouts) : me.timeouts;
  const scorers = (s: 0 | 1) =>
    [...view.sides[s].players]
      .filter((p) => p.pts > 0)
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 2)
      .map((p) => `${names(p.pid)} ${p.pts}`)
      .join(', ') || '—';
  const sets = setLines(view.box, side);
  const ato = tactics.manage.ato;
  const atoText = ato ? atoLabel(ato, (a) => ACTION_META[a].label, tactics.manage.atoPid != null ? names(tactics.manage.atoPid) : undefined) : null;
  const lead = me.score - them.score;

  return (
    <div className="bk">
      <div className="bk-fig">
        <Statline
          items={[
            { k: meTeam.abbrev, v: `${me.score}-${them.score}`, color: lead > 0 ? 'var(--good)' : lead < 0 ? 'var(--bad)' : undefined },
            ...(huddle ? [{ k: periodLabel(q), v: fmtClock(view.clock) }] : []),
            ...(win !== undefined ? [{ k: 'To win', v: wpText(win) }] : []),
            { k: huddle ? 'TO left' : `TO ${next}`, v: timeouts },
          ]}
        />
        {!huddle && report && <div className="bk-headline">{report.headline}</div>}
      </div>

      {trouble.length > 0 && (
        <Section title={huddle ? 'Tired or in foul trouble' : `Into ${next}`}>
          <div className="card flush list">
            {trouble.map(({ p, energy, fouls }) => {
              const sub = subFor(p.pid);
              const tired = energy < fat + 0.1;
              return (
                <div key={p.pid} className="bk-row">
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="bold ellipsis">{names(p.pid)}</div>
                    <div className="small num">
                      <span className={tired ? 'warn' : 'dim'}>{Math.round(energy * 100)}% energy</span>
                      <span className="dim"> · </span>
                      <span className={fouls ? 'warn' : 'dim'}>
                        {p.fouls} foul{p.fouls === 1 ? '' : 's'}
                      </span>
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
      )}

      {shown.length > 0 && (
        <Section title={huddle ? 'From your staff' : "What's deciding it"}>
          <div className="card flush ag-list">
            {shown.map((f) => (
              <div key={f.id} className={`ag-row as-row tone-${f.tone === 'good' ? 'good' : f.tone === 'bad' ? 'bad' : 'warn'} bk-fix`}>
                <div className="ag-head">
                  {f.fig ? (
                    <span className={`bk-fix-fig num ${f.tone}`}>{f.fig}</span>
                  ) : f.tone === 'warn' ? (
                    <AlertTriangle size={15} className="warn" aria-hidden="true" />
                  ) : (
                    <Lightbulb size={15} className="accent-text" aria-hidden="true" />
                  )}
                  <div className="grow">
                    <div className="ag-title">{f.title}</div>
                    {f.line && <div className="ag-line">{f.line}</div>}
                  </div>
                  {f.run && f.label && (
                    <button className="btn xs primary" onClick={f.run}>
                      {f.label}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {keys && keys.length > 0 && <KeysLive keys={keys} box={view.box} side={side} share={gameShare(view.elapsed, q)} compact={huddle} />}

      {huddle ? (
        <Section title="Out of the timeout">
          {!drawing && (
            <div className="small">
              {calls.pending ? (
                <>
                  Drawn up: <b>{callLabel(calls.pending, names)}</b>
                </>
              ) : atoText ? (
                <>
                  Your after-timeout play: <b>{atoText}</b>
                </>
              ) : (
                <span className="dim">No play drawn up: the team runs its offense.</span>
              )}
            </div>
          )}
          {drawing ? (
            drawUp
          ) : (
            <button className="btn block" onClick={() => setDrawing(true)}>
              <ClipboardList size={16} aria-hidden="true" /> Draw up a play
            </button>
          )}
        </Section>
      ) : (
        <>
          <Section title="By quarter">
            <QuarterTable g={view.box} abbrevs={{ [home.tid]: home.abbrev, [away.tid]: away.abbrev }} />
          </Section>
          <More label="Teams, scorers, sets">
            <div className="bk-more">
              <TeamComparison g={view.box} colors={colors} only={['fg', 'tp', 'reb', 'tov']} />
              <div className="bk-scorers small">
                <div>
                  <b>{away.abbrev}</b> <span className="dim2">{scorers(1)}</span>
                </div>
                <div>
                  <b>{home.abbrev}</b> <span className="dim2">{scorers(0)}</span>
                </div>
              </div>
              {sets.length > 0 && (
                <div className="col" style={{ gap: 4 }}>
                  <div className="over">Your sets so far</div>
                  {sets.map((s) => {
                    const read = s.id === 'iso' ? null : readStatus(me, s.id);
                    return (
                      <div key={s.id} className="row small" style={{ gap: 8 }}>
                        <span className="grow">
                          {s.name} <span className="dim">· {setLineText({ ...s, readAt: undefined })}</span>
                        </span>
                        {read?.onIt && <span className="tag bad">They&apos;re on it</span>}
                      </div>
                    );
                  })}
                </div>
              )}
              {oppPlan && oppPlan.length > 0 && (
                <div className="small">
                  <span className="dim2">Their game plan:</span> {oppPlan.map((x) => x.text).join(', ')}.
                </div>
              )}
            </div>
          </More>
        </>
      )}

      <div className="bk-go">
        <button className="btn primary block big" onClick={onGo}>
          <Play size={18} fill="currentColor" aria-hidden="true" /> {huddle ? 'Resume' : `Start ${next}`}
        </button>
        {!huddle && <div className="tiny dim center">Subs and changes count from its first possession.</div>}
      </div>
    </div>
  );
}
