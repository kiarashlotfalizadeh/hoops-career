// Today: the front page of your season, calm enough to read at a glance. One hero: on game day the
// next game, over the All-Star break the weekend, otherwise the lead (your last result while it's
// fresh, or the top story about your team); from the night your season is over until the draft, the
// season's end as a ceremony; or, outside the season's games, where the season stands. Then a few blocks in order of use: what
// needs you (the staff's calls first and always on the page, then the decisions waiting, AI teams'
// offers as one row, the trade deadline, mail that needs you, once a season a backup: see needs.ts)
// in one list; from your staff (the owner when the seat is warm, the staff's top advice); the next
// game when it isn't today; your season as a strip of figures; the news in two headlines; and More
// (practice, the way back to "While you were away", the glossary, the guide). Anything with more to
// it is one tap away; nothing here repeats something else here or on the top bar.
import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { League } from '../../core/types';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { edit } from '../../state/actions';
import { CALL_KINDS, GUIDE_STEPS, guideDone, showGuide } from '../../core/league/agenda';
import { assistantFeed, type AssistantArea, type AssistantCard } from '../../core/ai/assistant';
import { jobSecurity } from '../../core/league/jobSecurity';
import { AssistantRow } from '../components/Assistant';
import { GlossarySheet } from '../components/Glossary';
import { InstallRow } from '../components/InstallRow';
import { Section, Sheet } from '../components/ui';
import { NextGameRow, NextGameSlab, PhaseCard, nextGame } from './NextGame';
import { AllStarHero, DigestRow, Headlines, LeadStory, SeasonEndHero, YourSeason, useLead } from './FrontPage';
import { allStarPhase, seasonOver } from './occasions';
import { PracticeRow, PracticeSheet } from './Practice';
import { MessageSheet, markRead } from './messages';
import { useNeedsYou } from './needs';
import { NeedRow, needRows } from './NeedsList';
import './today.css';
import { useForecast } from '../useForecast';
import { dayStamp, freshAdvice, noteSeen, readSeen } from './staffAge';

/** Today's advice leaves the owner to the job-security row. */
const STAFF_AREAS: AssistantArea[] = ['team', 'tactics', 'games', 'office'];

const inSeason = (l: League) => l.phase === 'regular' || l.phase === 'playin' || l.phase === 'playoffs';

/** The most of the staff's cards in Needs you (the rest are behind All advice): fewer when the list is long already. */
const STAFF_SHOWN = 2;
/** The most rows Needs you shows on the page (the staff's calls and required decisions always show); the rest, mail included, are in its sheet. */
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
  const { items } = needs;
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

  // (a card sat on Today a week without being acted on gives way to newer ones: see staffAge.ts)
  const now = dayStamp(league.season, league.day);
  const seen = useLeagueMemo(() => readSeen(league.id), [league]);
  const advice = freshAdvice(feed, seen, now).slice(0, needs.count + (seat ? 1 : 0) >= 3 ? 1 : STAFF_SHOWN);
  const shownIds = advice.map((c) => c.id).join('|');
  const feedIds = full.map((c) => c.id).join('|');
  useEffect(() => noteSeen(league.id, shownIds ? shownIds.split('|') : [], feedIds.split('|'), now), [league.id, shownIds, feedIds, now]);
  const onToday = new Set([...advice.map((c) => c.id), `plan:${opp}`, ...(seat ? ['owner'] : [])]);
  const moreAdvice = full.filter((c) => !onToday.has(c.id)).length;

  // the hero: the game on game day; over the All-Star break, the weekend; between games the lead (or
  // the next game); from the night his season is over until the draft, the season's end as a
  // ceremony; otherwise, outside the season's games, where the season stands (the lead goes to the news)
  const allStar = !!g && !gameDay && !!allStarPhase(league);
  const leadIsHero = !!g && !gameDay && !!lead && !allStar;
  const hero = !g ? (
    seasonOver(league) ? (
      <SeasonEndHero league={league} />
    ) : (
      <PhaseCard league={league} linked={items.map((i) => i.to)} />
    )
  ) : allStar ? (
    <AllStarHero league={league} />
  ) : leadIsHero ? (
    <LeadStory league={league} lead={lead} />
  ) : (
    <NextGameSlab league={league} g={g} noPlan={noPlan} />
  );
  // every row of Needs you, in order (see needs.ts); a message opens here
  const rows = needRows(league, needs, (m) => {
    setOpenMsg(m.id);
    markRead(m.id);
  });
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
  // a few on the front page (every call and every required one: they come first), the rest one tap away in a sheet
  const shownNeeds = Math.max(NEEDS_SHOWN, items.filter((i) => i.required || CALL_KINDS.has(i.kind)).length);
  const hiddenNeeds = Math.max(0, rows.length - shownNeeds);

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
            {rows.slice(0, shownNeeds)}
          </div>
        </Section>
      )}

      <InstallRow />

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

      {/* the next game, when the lead or the weekend has the top */}
      {(leadIsHero || allStar) && g && (
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
          {rows}
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
