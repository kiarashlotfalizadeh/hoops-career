// The staff's debrief at the top of a game's recap (the live final card and the report's Debrief
// tab): the lead assistant's verdict, the two edges that decided it sized in a word (a line each: the
// rest, and what each was, on the report's Why), your game plan's counters with the staff's opinion
// of each (a row each that opens on tonight), your moves in a live game (what the staff makes of
// them, from playing the night back with them and without; then what each did since), and what to do
// next time: a fix one tap away for the plan against this opponent only when the staff likes it
// against them (else it's only their read), for every game only when they back it where the bench
// calls it. All words: the readings stay under the hood (core/analysis/staffWords.ts).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import type { GameResult, League } from '../../core/types';
import type { GameReport } from '../../core/analysis/gameReport';
import { debrief, nightLine, sameChange, seasonCoachingLine, type DebriefAdvice, type PlanGrade } from '../../core/analysis/debrief';
import { measuringNight } from '../live/tonight';
import { leadAssistant } from '../../core/ai/assistant';
import { applyPatch } from '../../core/sim/tactics';
import { persistableTactics, planFor, setPlanItem } from '../../core/league/gamePlans';
import { counterCandidates } from '../../core/ai/advisor';
import { worthCall } from '../../core/ai/counterWorth';
import { SINCE, edgeWord } from '../../core/analysis/staffWords';
import { counterItem, useCounterWorth } from '../games/matchup/useCounterWorth';
import { shortName } from '../../core/league/helpers';
import { useLeagueMemo, useStore } from '../../state/store';
import { act } from '../../state/actions';
import { Section, Tag } from './ui';
import { AssistantHead, MovesList, NoteCard } from './StaffCards';

/** What to do next time, shown before "more". */
const ADVICE_SHOWN = 2;

/** A plan counter's grade: the staff's opinion of it (a single night is too noisy to grade it on). */
const PLAN_TONE: Record<PlanGrade['call'], string> = { gain: 'good', cost: 'bad', even: 'dim' };

/** Tonight, when it was far enough outside one game's noise to say. */
const PLAN_NIGHT: Partial<Record<PlanGrade['night'], string>> = {
  better: ' A night well beyond its usual: it showed.',
  worse: ' A night well off its usual: it went against it.',
};

export function Debrief({ res, league, report }: { res: GameResult; league: League; report: GameReport }) {
  const d = useMemo(() => debrief(league, res, report), [league, res, report]);
  const [allAdvice, setAllAdvice] = useState(false);
  const assistant = useMemo(() => leadAssistant(league), [league]);
  const simming = useStore((s) => !!s.sim);
  const me = league.userTid;
  const opp = league.teams[d.opp];
  const nameOf = (pid: number) => (league.players[pid] ? shortName(league, league.players[pid]) : `#${pid}`);
  const inPlan = new Set(planFor(league, d.opp)?.items.map((it) => it.id));
  /** A change measured as a gain where the bench calls it, into your tactics for every game. */
  const always = (a: DebriefAdvice) => {
    if (!a.patch) return;
    const ok = act('Tactics', (l) => {
      const tm = l.teams[l.userTid];
      tm.tactics = { ...persistableTactics(applyPatch(tm.tactics, a.patch), tm.tactics), manual: true };
    });
    if (ok) useStore.getState().toast(`Your tactics: ${a.label}`, 'good');
  };
  const us = res.home.tid === me ? league.teams[res.home.tid] : league.teams[res.away.tid];
  // (a move a live game made: its team's abbreviations for the lines)
  const abbrevs = { us: us.abbrev, them: opp.abbrev };
  // what the night's moves were worth, measured after the final (it lands on the result a few seconds
  // after it: read on every render), and the season's so far
  const night = res.moves?.length
    ? nightLine(
        res,
        res.moves.every((m) => m.by === 'staff'),
      )
    : null;
  const season = night ? seasonCoachingLine(league, res.season) : null;
  // (the move that mattered most and the season's, a tap down when there's either)
  const nightMore = [night?.detail, season && `${season}.`].filter(Boolean).join(' ');
  return (
    <div className="gd-debrief">
      <AssistantHead name={assistant.name} initials={assistant.initials} read={d.headline} />

      {d.decided.length > 0 && (
        <div className="lv-notes reads">
          {/* (the two biggest, a line each: the rest, and what each one was, are on the report's Why) */}
          {d.decided.slice(0, 2).map((f) => (
            <NoteCard
              key={f.title}
              note={{
                id: f.title,
                kind: 'read',
                tone: f.pts >= 0 ? 'good' : 'bad',
                title: f.title,
                text: '',
                tag: edgeWord(f.pts),
                actions: [],
                rank: 0,
              }}
              onAct={() => {}}
            />
          ))}
          <Link to={`/game/${res.gid}?tab=report`} className="gd-why-link card-link">
            What decided it <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}

      {d.hurt && (
        <p className="gd-hurt small">
          <b>Hurt tonight:</b> {d.hurt}.
        </p>
      )}

      {d.frame && <p className="gd-frame small dim2">{d.frame}</p>}

      {d.plan.length > 0 && (
        <Section title="Your plan">
          {/* a row each: the counter and the staff's opinion of it, opening on what tonight did */}
          <div className="card flush list">
            {d.plan.map((g) => (
              <details key={g.label} className="gd-fold">
                <summary>
                  <span className="grow gd-fold-t">
                    <span className="lr-name">{g.label}</span>
                    <span className={`gd-plan-v ${PLAN_TONE[g.call]}`}>
                      {g.call === 'gain' && <Check size={12} aria-hidden="true" />}
                      {SINCE[g.call]}
                    </span>
                  </span>
                  <ChevronDown size={16} className="gd-fold-c" aria-hidden="true" />
                </summary>
                <div className="gd-fold-b">
                  <p className="gd-plan-line small dim2">
                    {g.line}
                    {g.bridge ? ` ${g.bridge}` : (PLAN_NIGHT[g.night] ?? '')}
                  </p>
                </div>
              </details>
            ))}
          </div>
        </Section>
      )}

      {res.moves && res.moves.length > 0 && (
        <Section title="Your moves">
          {night ? (
            nightMore ? (
              <details className={`gd-night tone-${night.tone}`}>
                <summary>
                  <span className="grow gd-night-t">{night.text}</span>
                  <ChevronDown size={16} className="gd-fold-c" aria-hidden="true" />
                </summary>
                <p className="small dim2">{nightMore}</p>
              </details>
            ) : (
              <div className={`gd-night tone-${night.tone}`}>
                <span className="gd-night-t">{night.text}</span>
              </div>
            )
          ) : (
            measuringNight(res.gid) && <div className="gd-night small dim">The staff is going back over your moves…</div>
          )}
          <MovesList moves={res.moves} abbrevs={abbrevs} nameOf={nameOf} />
        </Section>
      )}

      {d.advice.length > 0 && (
        <Section title="Next time">
          <div className="gd-next card flush list">
            {(allAdvice ? d.advice : d.advice.slice(0, ADVICE_SHOWN)).map((a) => (
              <div key={a.id} className="gd-next-row">
                <div className="gd-next-t">{a.title}</div>
                <div className="gd-next-x small dim2">{a.text}</div>
                {a.patch && (d.meetAgain || a.worth) && (
                  <div className="gd-next-acts">
                    {d.meetAgain && <PlanFix league={league} opp={d.opp} a={a} inPlan={inPlan} quiet={!!a.worth} />}
                    {/* (for every game only a change the staff backs: one night's tags are no reason to change them all) */}
                    {a.worth && (
                      <button className="btn xs" disabled={simming} onClick={() => always(a)}>
                        {a.label}: every game
                      </button>
                    )}
                    {a.worth && <span className="lv-note-worth tiny">{a.worth}</span>}
                  </div>
                )}
              </div>
            ))}
            {!allAdvice && d.advice.length > ADVICE_SHOWN && (
              <button className="gv-more" onClick={() => setAllAdvice(true)}>
                <ChevronDown size={15} aria-hidden="true" /> {d.advice.length - ADVICE_SHOWN} more
              </button>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

/**
 * A next-time fix for the plan against this opponent: one tap only as the staff's counter that makes
 * the same change (sameChange), measured a gain against them on the matchup page's games. Otherwise
 * the staff's read, said as such, with nothing to tap (`quiet`: the row already carries the bench's
 * opinion, so this one says nothing).
 */
function PlanFix({ league, opp, a, inPlan, quiet }: { league: League; opp: number; a: DebriefAdvice; inPlan: Set<string>; quiet: boolean }) {
  const simming = useStore((s) => !!s.sim);
  const drafted = useLeagueMemo(() => counterCandidates(league, league.userTid, opp), [league, opp]);
  const measuring = useCounterWorth(league, opp);
  const abbrev = league.teams[opp].abbrev;
  const base = league.teams[league.userTid].tactics;
  const c = a.patch ? drafted.find((x) => sameChange(base, a.patch!, x.patch)) : undefined;
  const w = c ? measuring?.worth?.get(c.id) : undefined;
  if (inPlan.has(a.id) || (c && inPlan.has(c.id))) return <Tag tone="good">In the plan vs {abbrev}</Tag>;
  if (c && w && worthCall(w) === 'gain') {
    const add = () => {
      if (act('Game plan', (l) => setPlanItem(l, opp, counterItem(c, w)))) useStore.getState().toast(`Plan vs ${abbrev}: ${c.label}`, 'good');
    };
    return (
      <>
        <button className="btn xs" disabled={simming} onClick={add}>
          {c.label}: vs {abbrev}
        </button>
        <span className="lv-note-worth tiny">Should help against {abbrev}</span>
      </>
    );
  }
  if (quiet) return null;
  const note =
    c && measuring && !measuring.worth
      ? `The staff is looking at it against ${abbrev}…`
      : w
        ? worthCall(w) === 'cost'
          ? `Could hurt against ${abbrev}. Not one for the plan.`
          : `No clear edge against ${abbrev}. Not one for the plan.`
        : `Only the staff's read against ${abbrev}`;
  return <span className="lv-note-worth tiny">{note}</span>;
}
