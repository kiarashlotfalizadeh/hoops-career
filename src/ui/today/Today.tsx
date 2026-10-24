// Today: the front page of your season, calm enough to read at a glance. One hero: on game day the
// next game, otherwise the lead (your last result while it's fresh, or the top story about your team)
// or, outside the season's games, where the season stands. Then a few blocks in order of use: what
// needs you (the decisions waiting, the trade deadline, mail that needs you, the owner when the seat
// is warm, once a season a backup, the staff's top advice) in one list; the next game when it isn't today; your season as a
// strip of figures; the news in two headlines; and More (practice, the way back to "While you were
// away", the glossary, the guide). Anything with more to it is one tap away; nothing here repeats
// something else here or on the top bar.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { InboxMessage, League } from '../../core/types';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { edit } from '../../state/actions';
import { GUIDE_STEPS, guideDone, showGuide, type AgendaItem } from '../../core/league/agenda';
import { assistantFeed, type AssistantArea, type AssistantCard } from '../../core/ai/assistant';
import { jobSecurity } from '../../core/league/jobSecurity';
import { fmtDate } from '../../core/league/helpers';
import { AgendaRow } from '../components/Agenda';
import { BackupRow } from '../components/Backup';
import { AssistantRow } from '../components/Assistant';
import { GlossarySheet } from '../components/Glossary';
import { Section, Sheet } from '../components/ui';
import { NextGameRow, NextGameSlab, PhaseCard, deadlineText, nextGame } from './NextGame';
import { DigestRow, Headlines, LeadStory, YourSeason, useLead } from './FrontPage';
import { PracticeRow, PracticeSheet } from './Practice';
import { MessageSheet, markRead, previewText } from './messages';
import { useNeedsYou } from './needs';
import { senderOf } from './senders';
import './today.css';
import { useForecast } from '../useForecast';

/** Today's advice leaves the owner to the job-security row. */
const STAFF_AREAS: AssistantArea[] = ['team', 'tactics', 'games', 'office'];

const inSeason = (l: League) => l.phase === 'regular' || l.phase === 'playin' || l.phase === 'playoffs';

/** Needs you's order: what the league waits on, then the first week's checklist, then the rest. */
const rank = (i: AgendaItem) => (i.required ? 2 : i.kind === 'guide' ? 1 : 0);

/** The most of the staff's cards in Needs you (the rest are behind All advice): fewer when the list is long already. */
const STAFF_SHOWN = 2;
/** The most rows Needs you shows on the page (required decisions always show); the rest, mail included, are in its sheet. */
const NEEDS_SHOWN = 3;

/** The guide was put away, but its weeks aren't over (Today offers it back). */
function guideHidden(league: League): boolean {
  if (!league.onboarding?.hidden || league.settings.teaching === false || league.season !== league.startSeason) return false;
  if (league.phase !== 'preseason' && !(league.phase === 'regular' && league.day < 21)) return false;
  return guideDone(league).size < GUIDE_STEPS.length;
}

type Opened = null | 'advice' | 'glossary' | 'practice' | 'needs';

export default function Today() {
  const league = useLeague();
  const simming = useStore((s) => !!s.sim);
  const digest = useStore((s) => !!s.digest);
  const [sheet, setSheet] = useState<Opened>(null);
  const [openMsg, setOpenMsg] = useState<number | null>(null);

  const g = nextGame(league);
  const gameDay = !!g && g.day <= league.day;
  const lead = useLead(league);
  // what needs him (the bell counts the same: see needs.ts)
  const needs = useNeedsYou(league);
  const { items, mail, deadline, backup: askBackup } = needs;
  // the whole feed for the sheet. Today's own cards leave the owner to the job-security row, and the
  // next opponent's missing plan to the slab
  const full = useLeagueMemo(() => assistantFeed(league), [league]);
  const opp = g ? (g.home === league.userTid ? g.away : g.home) : undefined;
  const noPlan = opp !== undefined && full.some((c) => c.id === `plan:${opp}`);
  // (and what the team knows of its system to Practice, which carries the focus that answers it)
  const feed = full.filter((c) => STAFF_AREAS.includes(c.area) && c.id !== `plan:${opp}` && !(g && c.id.startsWith('alert:fam-')));
  const forecast = useForecast(league);
  const js = useLeagueMemo(() => jobSecurity(league, forecast), [league, forecast]);
  const seat = !league.fired && !js.off && (js.heat === 'warm' || js.heat === 'hot') && !items.some((i) => i.kind === 'ultimatum');
  const hidden = guideHidden(league);
  const msg = openMsg !== null ? league.inbox.find((m) => m.id === openMsg) : undefined;

  const advice = feed.slice(0, needs.count + (seat ? 1 : 0) >= 3 ? 1 : STAFF_SHOWN);
  const onToday = new Set([...advice.map((c) => c.id), `plan:${opp}`, ...(seat ? ['owner'] : [])]);
  const moreAdvice = full.filter((c) => !onToday.has(c.id)).length;

  // the hero: the game on game day; between games the lead (or the next game); outside the season's
  // games, where the season stands (the lead goes to the news)
  const leadIsHero = !!g && !gameDay && !!lead;
  const hero = !g ? (
    <PhaseCard league={league} linked={items.map((i) => i.to)} />
  ) : leadIsHero ? (
    <LeadStory league={league} lead={lead} />
  ) : (
    <NextGameSlab league={league} g={g} noPlan={noPlan} />
  );
  // every row of Needs you, in order: the decisions (required first), the deadline, mail, a backup
  const needRows = [
    ...[...items]
      .sort((a, b) => rank(b) - rank(a))
      .map((i) => (
        <div role="listitem" className="td-need" key={i.id}>
          <AgendaRow item={i} />
        </div>
      )),
    ...(deadline !== null
      ? [
          <div role="listitem" className="td-need" key="deadline">
            <NeedRow
              to="/office/trade"
              tone="warn"
              title={deadlineText(deadline)}
              line={deadline === 0 ? 'Deals have to be done by the end of the day.' : `The last day for deals: ${fmtDate(league.season, league.tradeDeadlineDay)}.`}
            />
          </div>,
        ]
      : []),
    ...mail.map((m) => (
      <div role="listitem" className="td-need" key={`mail:${m.id}`}>
        <MailRow
          league={league}
          m={m}
          onOpen={() => {
            setOpenMsg(m.id);
            markRead(m.id);
          }}
        />
      </div>
    )),
    ...(askBackup
      ? [
          <div role="listitem" className="td-need" key="backup">
            <BackupRow league={league} />
          </div>,
        ]
      : []),
  ];
  // beside it, what doesn't wait on an answer: the owner when the seat is warm, and the staff's top advice
  const staffRows = [
    ...(seat
      ? [
          <div role="listitem" className="td-need" key="owner">
            <NeedRow to="/office/owner" tone={js.heat === 'hot' ? 'bad' : 'warn'} title={`Job security ${js.score} · ${js.label}`} line={js.line} />
          </div>,
        ]
      : []),
    ...advice.map((c) => (
      <div role="listitem" className="td-need" key={c.id}>
        <AssistantRow card={c} />
      </div>
    )),
  ];
  // a few on the front page (every required one), the rest one tap away in a sheet
  const shownNeeds = Math.max(NEEDS_SHOWN, items.filter((i) => i.required).length);
  const hiddenNeeds = Math.max(0, needRows.length - shownNeeds);

  return (
    <main className="page td-page">
      {hero}

      {needs.count > 0 && (
        <Section
          title="Needs you"
          right={
            hiddenNeeds > 0 ? (
              <button type="button" className="card-link" aria-haspopup="dialog" onClick={() => setSheet('needs')}>
                All {needs.count} <ChevronRight size={14} aria-hidden="true" />
              </button>
            ) : (
              <span className="td-count num" aria-hidden="true">
                {needs.count}
              </span>
            )
          }
        >
          <div className="td-needs" role="list" aria-label="Needs you">
            {needRows.slice(0, shownNeeds)}
          </div>
        </Section>
      )}

      {staffRows.length > 0 && (
        <Section
          title="From your staff"
          right={
            moreAdvice > 0 && (
              <button type="button" className="card-link" aria-haspopup="dialog" onClick={() => setSheet('advice')}>
                All advice <ChevronRight size={14} aria-hidden="true" />
              </button>
            )
          }
        >
          <div className="td-needs" role="list" aria-label="From your staff">
            {staffRows}
          </div>
        </Section>
      )}

      {/* the next game, when the lead has the top */}
      {leadIsHero && g && (
        <Section title="Next game">
          <NextGameRow league={league} g={g} />
        </Section>
      )}

      {inSeason(league) && !league.fired && <YourSeason league={league} />}

      <Headlines league={league} lead={leadIsHero ? null : lead} />

      {(g || digest || (moreAdvice > 0 && !staffRows.length) || hidden || league.settings.teaching !== false) && (
        <Section title="More">
          <div className="card flush td-more">
            {g && <PracticeRow league={league} onOpen={() => setSheet('practice')} />}
            <DigestRow />
            {moreAdvice > 0 && !staffRows.length && (
              <button type="button" className="td-mrow" aria-haspopup="dialog" onClick={() => setSheet('advice')}>
                <span className="grow td-mrow-k">From your staff</span>
                <span className="td-mrow-v">{moreAdvice}</span>
                <ChevronRight size={18} className="dim" aria-hidden="true" />
              </button>
            )}
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

      <Sheet open={sheet === 'needs'} onClose={() => setSheet(null)} title="Needs you">
        <div className="td-needs" role="list" aria-label="Needs you">
          {needRows}
        </div>
      </Sheet>
      <Sheet open={sheet === 'advice'} onClose={() => setSheet(null)} title="From your staff">
        <AllAdvice feed={full} />
      </Sheet>
      {g && <PracticeSheet league={league} open={sheet === 'practice'} onClose={() => setSheet(null)} />}
      <GlossarySheet open={sheet === 'glossary'} onClose={() => setSheet(null)} />
      <MessageSheet league={league} m={msg} onClose={() => setOpenMsg(null)} />
    </main>
  );
}

/** The whole feed, the owner's word included. */
function AllAdvice({ feed }: { feed: AssistantCard[] }) {
  if (!feed.length) return <div className="empty">Nothing from the staff right now.</div>;
  return (
    <div className="card flush ag-list" role="list" aria-label="All advice">
      {feed.map((c) => (
        <div role="listitem" key={c.id}>
          <AssistantRow card={c} />
        </div>
      ))}
    </div>
  );
}

/** A row of Needs you that isn't a decision or advice (the deadline, the owner): drawn as the agenda's rows are. */
function NeedRow({ to, tone, title, line }: { to: string; tone: 'warn' | 'bad'; title: string; line: string }) {
  return (
    <div className={`ag-row tone-${tone}`}>
      <Link to={to} className="ag-head">
        <div className="grow">
          <div className="ag-title">
            <span className="ag-dot" aria-hidden="true" /> {title}
          </div>
          <div className="ag-line">{line}</div>
        </div>
        <ChevronRight size={18} className="dim" aria-hidden="true" />
      </Link>
    </div>
  );
}

/** Mail that needs him, as a row of Needs you: the subject, then who and the first words; it opens in its sheet. */
function MailRow({ league, m, onOpen }: { league: League; m: InboxMessage; onOpen: () => void }) {
  return (
    <div className="ag-row tone-brand">
      <button type="button" className="ag-head td-mailrow" aria-haspopup="dialog" onClick={onOpen}>
        <div className="grow">
          <div className="ag-title">
            <span className="ag-dot" aria-hidden="true" />
            <span className="sr-only">Unread: </span> {m.subject}
          </div>
          <div className="ag-line td-one">
            {senderOf(league, m).name} · {previewText(m.body)}
          </div>
        </div>
        <ChevronRight size={18} className="dim" aria-hidden="true" />
      </button>
    </div>
  );
}
