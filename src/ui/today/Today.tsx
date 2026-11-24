// Today: three things, in order of use. The next game (who's favoured and by how much, who's out),
// or outside the season's games the phase the league is in; one action queue (what the league waits
// on, AI teams' trade offers, players' trade requests, a starter hurt, the owner's warnings, the
// deadline and a playoff series: see needs.ts), each settled in place; and your season as a compact
// strip of figures. Nothing else leads the page: no stories, no headlines, no advice feed. The way
// back to "While you were away", the guide and the glossary sit under More.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League } from '../../core/types';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { edit } from '../../state/actions';
import { GUIDE_STEPS, guideDone, showGuide, stopsSim } from '../../core/league/agenda';
import { jobSecurity } from '../../core/league/jobSecurity';
import { slideNote } from '../../core/league/calls';
import { planFor } from '../../core/league/gamePlans';
import { GlossarySheet } from '../components/Glossary';
import { InstallRow } from '../components/InstallRow';
import { Section, Sheet } from '../components/ui';
import { NextGameSlab, PhaseCard, nextGame } from './NextGame';
import { DigestRow, YourSeason } from './FrontPage';
import { MessageSheet, markRead } from './messages';
import { useNeedsYou } from './needs';
import { NeedRow, needRows } from './NeedsList';
import './today.css';
import { useForecast } from '../useForecast';
import { useChanged } from '../motion';

const inSeason = (l: League) => l.phase === 'regular' || l.phase === 'playin' || l.phase === 'playoffs';

/** The most rows the queue shows on the page (what a sim stops for always shows); the rest, mail included, are in its sheet. */
const QUEUE_SHOWN = 4;

/** The guide was put away, but its weeks aren't over (Today offers it back). */
function guideHidden(league: League): boolean {
  if (!league.onboarding?.hidden || league.settings.teaching === false || league.season !== league.startSeason) return false;
  if (league.phase !== 'preseason' && !(league.phase === 'regular' && league.day < 21)) return false;
  return guideDone(league).size < GUIDE_STEPS.length;
}

type Opened = null | 'glossary' | 'queue';

export default function Today() {
  const league = useLeague();
  const simming = useStore((s) => !!s.sim);
  const digest = useStore((s) => !!s.digest);
  const [sheet, setSheet] = useState<Opened>(null);
  const [openMsg, setOpenMsg] = useState<number | null>(null);

  const g = nextGame(league);
  // what needs him (the bell counts the same: see needs.ts)
  const needs = useNeedsYou(league);
  const { items } = needs;
  const opp = g ? (g.home === league.userTid ? g.away : g.home) : undefined;
  const noPlan = !!g && opp !== undefined && !planFor(league, opp, g);
  // the owner's warning: his seat warm or hot, unless his ultimatum is in the queue already
  const forecast = useForecast(league);
  const js = useLeagueMemo(() => jobSecurity(league, forecast), [league, forecast]);
  const seat = !league.fired && !js.off && (js.heat === 'warm' || js.heat === 'hot') && !items.some((i) => i.kind === 'ultimatum');
  const hidden = guideHidden(league);
  const msg = openMsg !== null ? league.inbox.find((m) => m.id === openMsg) : undefined;

  const slide = useLeagueMemo(() => slideNote(league), [league]);
  // motion: the count pops when a decision is settled or a new one lands
  const count = needs.count + (seat ? 1 : 0);
  const counted = useChanged(count);
  // every row of the queue, in order (see needs.ts), the owner's warning after the decisions; a message opens here
  const decisions = needRows(league, needs, (m) => {
    setOpenMsg(m.id);
    markRead(m.id);
  });
  const rows = [
    ...decisions.slice(0, items.length),
    ...(seat
      ? [
          <div role="listitem" className="td-need" key="owner">
            <NeedRow to="/office/owner" tone={js.heat === 'hot' ? 'bad' : 'warn'} title={`Job security ${js.score} · ${js.label}`} line={js.line} />
          </div>,
        ]
      : []),
    ...decisions.slice(items.length),
  ];
  // a few on the page (everything a sim would stop for: they come first), the rest one tap away in a sheet
  const shown = Math.max(QUEUE_SHOWN, items.filter(stopsSim).length);
  const more = Math.max(0, rows.length - shown);

  return (
    <main className="page td-page">
      {g ? <NextGameSlab key={g.gid} league={league} g={g} noPlan={noPlan} /> : <PhaseCard league={league} linked={items.map((i) => i.to)} />}

      {/* a losing slide: what the staff reads behind it and what it put in for the next game, a tap from that plan */}
      {slide && (
        <Link to={slide.to} className="card clickable td-slide" aria-label={`${slide.title}. ${slide.line} Open the ${slide.toLabel}.`}>
          <span className="over">The slide · {slide.title}</span>
          <span className="small">{slide.line}</span>
          <span className="card-link">
            {slide.toLabel} <ChevronRight size={14} aria-hidden="true" />
          </span>
        </Link>
      )}

      {rows.length > 0 && (
        <Section
          title="Action queue"
          right={
            more > 0 ? (
              <button type="button" className="card-link" aria-haspopup="dialog" onClick={() => setSheet('queue')}>
                All {count} <ChevronRight size={14} aria-hidden="true" />
              </button>
            ) : (
              count > 0 && (
                <span key={counted.key} className={`td-count num ${counted.changed ? 'badge-pop' : ''}`} aria-hidden="true">
                  {count}
                </span>
              )
            )
          }
        >
          <div className="td-needs" role="list" aria-label="Action queue">
            {rows.slice(0, shown)}
          </div>
        </Section>
      )}

      <InstallRow />

      {inSeason(league) && !league.fired && <YourSeason league={league} />}

      {(digest || hidden || league.settings.teaching !== false) && (
        <Section title="More">
          <div className="card flush td-more">
            <DigestRow />
            {hidden && (
              <button type="button" className="td-mrow" disabled={simming} onClick={() => edit((l) => showGuide(l))}>
                <span className="grow td-mrow-k">Show the first-week guide</span>
                <ChevronRight size={18} className="dim" aria-hidden="true" />
              </button>
            )}
            {league.settings.teaching !== false && (
              <button type="button" className="td-mrow" aria-haspopup="dialog" onClick={() => setSheet('glossary')}>
                <span className="grow td-mrow-k">Glossary</span>
                <ChevronRight size={18} className="dim" aria-hidden="true" />
              </button>
            )}
          </div>
        </Section>
      )}

      <Sheet open={sheet === 'queue'} onClose={() => setSheet(null)} title="Action queue">
        <div className="td-needs" role="list" aria-label="Action queue">
          {rows}
        </div>
      </Sheet>
      <GlossarySheet open={sheet === 'glossary'} onClose={() => setSheet(null)} />
      <MessageSheet league={league} m={msg} onClose={() => setOpenMsg(null)} />
    </main>
  );
}
