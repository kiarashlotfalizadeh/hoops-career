// Today: the front page of your season, calm enough to read at a glance. One hero: on game day the
// next game, otherwise the lead (your last result while it's fresh, or the top story about your team)
// or, outside the season's games, where the season stands. Then a few blocks in order of use: what
// needs you (the decisions waiting, the trade deadline, mail that needs you, the owner when the seat
// is warm, the staff's top advice) in one list; the next game when it isn't today; your season as a
// strip of figures; the news in two headlines; and More (practice, the way back to "While you were
// away", the glossary, the guide). Anything with more to it is one tap away; nothing here repeats
// something else here or on the top bar.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { InboxMessage, League } from '../../core/types';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { edit } from '../../state/actions';
import { agenda, GUIDE_STEPS, guideDone, showGuide } from '../../core/league/agenda';
import { assistantFeed, type AssistantArea, type AssistantCard } from '../../core/ai/assistant';
import { jobSecurity } from '../../core/league/jobSecurity';
import { fmtDate } from '../../core/league/helpers';
import { AgendaRow } from '../components/Agenda';
import { AssistantRow } from '../components/Assistant';
import { GlossarySheet } from '../components/Glossary';
import { Section, Sheet } from '../components/ui';
import { NextGameRow, NextGameSlab, PhaseCard, deadlineIn, deadlineText, nextGame } from './NextGame';
import { DigestRow, Headlines, LeadStory, YourSeason, useLead } from './FrontPage';
import { PracticeRow, PracticeSheet } from './Practice';
import { MessageSheet, decisionId, markRead, needsYou, previewText } from './messages';
import { senderOf } from './senders';
import './today.css';
import { useForecast } from '../useForecast';

/** Today's advice leaves the owner to the job-security row. */
const STAFF_AREAS: AssistantArea[] = ['team', 'tactics', 'games', 'office'];

const inSeason = (l: League) => l.phase === 'regular' || l.phase === 'playin' || l.phase === 'playoffs';

/** The most of the staff's cards in Needs you (the rest are behind All advice): fewer when the list is long already. */
const STAFF_SHOWN = 2;
/** The most mail in Needs you (the rest is in the inbox, behind the bell). */
const MAIL_SHOWN = 2;

/** The guide was put away, but its weeks aren't over (Today offers it back). */
function guideHidden(league: League): boolean {
  if (!league.onboarding?.hidden || league.settings.teaching === false || league.season !== league.startSeason) return false;
  if (league.phase !== 'preseason' && !(league.phase === 'regular' && league.day < 21)) return false;
  return guideDone(league).size < GUIDE_STEPS.length;
}

type Opened = null | 'advice' | 'glossary' | 'practice';

export default function Today() {
  const league = useLeague();
  const simming = useStore((s) => !!s.sim);
  const [sheet, setSheet] = useState<Opened>(null);
  const [openMsg, setOpenMsg] = useState<number | null>(null);

  const g = nextGame(league);
  const gameDay = !!g && g.day <= league.day;
  const lead = useLead(league);
  const items = useLeagueMemo(() => agenda(league), [league]);
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

  // mail that needs him and isn't a decision (those are agenda rows), newest first
  const open = new Map(items.map((i) => [i.id, true]));
  const mail = league.inbox
    .filter((m) => needsYou(m, open, league) && !decisionId(m) && m.link !== '/')
    .sort((a, b) => b.season - a.season || b.day - a.day || b.id - a.id)
    .slice(0, MAIL_SHOWN);
  // the deadline's last week, unless its mail is in the list already
  const deadline = deadlineIn(league);
  const showDeadline = deadline !== null && !league.fired && !mail.some((m) => m.link?.startsWith('/office/trade'));
  const before = items.length + mail.length + (showDeadline ? 1 : 0) + (seat ? 1 : 0);
  const advice = feed.slice(0, before >= 3 ? 1 : STAFF_SHOWN);
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
  const needs = before + advice.length > 0;

  return (
    <main className="page td-page">
      {hero}

      {needs && (
        <Section
          title="Needs you"
          right={
            moreAdvice > 0 && (
              <button type="button" className="card-link" aria-haspopup="dialog" onClick={() => setSheet('advice')}>
                All advice <ChevronRight size={14} aria-hidden="true" />
              </button>
            )
          }
        >
          <div className="ag-list td-rows" role="list" aria-label="Needs you">
            {[...items]
              .sort((a, b) => Number(b.required) - Number(a.required))
              .map((i) => (
                <div role="listitem" key={i.id}>
                  <AgendaRow item={i} />
                </div>
              ))}
            {showDeadline && (
              <div role="listitem">
                <NeedRow
                  to="/office/trade"
                  tone="warn"
                  title={deadlineText(deadline)}
                  line={deadline === 0 ? 'Deals have to be done by the end of the day.' : `The last day for deals: ${fmtDate(league.season, league.tradeDeadlineDay)}.`}
                />
              </div>
            )}
            {mail.map((m) => (
              <div role="listitem" key={m.id}>
                <MailRow
                  league={league}
                  m={m}
                  onOpen={() => {
                    setOpenMsg(m.id);
                    markRead(m.id);
                  }}
                />
              </div>
            ))}
            {seat && (
              <div role="listitem">
                <NeedRow to="/office/owner" tone={js.heat === 'hot' ? 'bad' : 'warn'} title={`Job security ${js.score} · ${js.label}`} line={js.line} />
              </div>
            )}
            {advice.map((c) => (
              <div role="listitem" key={c.id}>
                <AssistantRow card={c} />
              </div>
            ))}
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

      <Section title="More">
        <div className="td-more">
          {g && <PracticeRow league={league} onOpen={() => setSheet('practice')} />}
          <DigestRow />
          {!needs && moreAdvice > 0 && (
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
