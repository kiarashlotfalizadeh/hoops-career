// Today: what needs you now. The first screen after every sim, short enough to read at a glance:
// the next game (or where the offseason stands), practice between games (the focus, and what the team
// knows of its system when it's short), the decisions waiting, the staff's top advice, the
// owner when the seat is warm, the standings around you, your last results and new mail. Anything
// with more to it is one tap away on its own screen; nothing here repeats something else here.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League } from '../../core/types';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { edit } from '../../state/actions';
import { agenda, GUIDE_STEPS, guideDone, showGuide } from '../../core/league/agenda';
import { assistantFeed, type AssistantArea, type AssistantCard } from '../../core/ai/assistant';
import { jobSecurity, type JobSecurity } from '../../core/league/jobSecurity';
import { FIRING_LINE } from '../../core/league/owner';
import { confStandings } from '../../core/league/standings';
import { pct } from '../../core/analysis/odds';
import { AgendaList } from '../components/Agenda';
import { AssistantRow } from '../components/Assistant';
import { GlossarySheet } from '../components/Glossary';
import { Section, Sheet } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { NextGameSlab, PhaseCard, nextGame } from './NextGame';
import { PracticeCard } from './Practice';
import { MessageRow, MessageSheet, decisionId, markRead, needsYou } from './messages';
import './today.css';
import { useForecast } from '../useForecast';

/** Today's advice leaves the owner to the job-security line below it. */
const STAFF_AREAS: AssistantArea[] = ['team', 'tactics', 'games', 'office'];

const inSeason = (l: League) => l.phase === 'regular' || l.phase === 'playin' || l.phase === 'playoffs';

/** The guide was put away, but its weeks aren't over (Today offers it back). */
function guideHidden(league: League): boolean {
  if (!league.onboarding?.hidden || league.settings.teaching === false || league.season !== league.startSeason) return false;
  if (league.phase !== 'preseason' && !(league.phase === 'regular' && league.day < 21)) return false;
  return guideDone(league).size < GUIDE_STEPS.length;
}

export default function Today() {
  const league = useLeague();
  const simming = useStore((s) => !!s.sim);
  const [allAdvice, setAllAdvice] = useState(false);
  const [glossary, setGlossary] = useState(false);
  const [openMsg, setOpenMsg] = useState<number | null>(null);

  const g = nextGame(league);
  const items = useLeagueMemo(() => agenda(league), [league]);
  // the whole feed for the sheet. Today's own cards leave the owner to the job-security line, and the
  // next opponent's missing plan to the slab
  const full = useLeagueMemo(() => assistantFeed(league), [league]);
  const opp = g ? (g.home === league.userTid ? g.away : g.home) : undefined;
  const noPlan = opp !== undefined && full.some((c) => c.id === `plan:${opp}`);
  // (and what the team knows of its system to the practice card, which carries the focus that answers it)
  const feed = full.filter((c) => STAFF_AREAS.includes(c.area) && c.id !== `plan:${opp}` && !(g && c.id.startsWith('alert:fam-')));
  const forecast = useForecast(league);
  const js = useLeagueMemo(() => jobSecurity(league, forecast), [league, forecast]);
  const seat = !league.fired && !js.off && (js.heat === 'warm' || js.heat === 'hot') && !items.some((i) => i.kind === 'ultimatum');
  // "All advice" when the feed says more than Today shows somewhere
  const onToday = new Set([...feed.slice(0, 3).map((c) => c.id), `plan:${opp}`, ...(seat ? ['owner'] : [])]);
  const more = full.some((c) => !onToday.has(c.id));
  const hidden = guideHidden(league);
  const msg = openMsg !== null ? league.inbox.find((m) => m.id === openMsg) : undefined;

  return (
    <main className="page td-page">
      {g ? <NextGameSlab league={league} g={g} noPlan={noPlan} /> : <PhaseCard league={league} linked={items.map((i) => i.to)} />}

      {g && <PracticeCard league={league} />}

      {(items.length > 0 || hidden) && (
        <Section
          title="To do"
          right={
            hidden && (
              <button type="button" className="card-link" disabled={simming} onClick={() => edit((l) => showGuide(l))}>
                Show the guide
              </button>
            )
          }
        >
          {items.length > 0 ? <AgendaList league={league} /> : <div className="td-none">Nothing waiting on you.</div>}
        </Section>
      )}

      {feed.length > 0 && (
        <Section
          title="From your staff"
          right={
            more && (
              <button type="button" className="card-link" aria-haspopup="dialog" onClick={() => setAllAdvice(true)}>
                All advice ({full.length}) <ChevronRight size={14} aria-hidden="true" />
              </button>
            )
          }
        >
          <div className="card flush ag-list" role="list" aria-label="From your staff">
            {feed.slice(0, 3).map((c) => (
              <div role="listitem" key={c.id}>
                <AssistantRow card={c} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {seat && <JobSecurityLine js={js} />}

      {league.phase === 'regular' && <StandingsNearby league={league} />}
      {inSeason(league) && <LastResults league={league} />}

      <UnreadMail league={league} agendaIds={items.map((i) => i.id)} onOpen={setOpenMsg} />

      {league.settings.teaching !== false && (
        <div className="td-foot">
          <button type="button" className="btn sm ghost" aria-haspopup="dialog" onClick={() => setGlossary(true)}>
            Glossary
          </button>
        </div>
      )}

      <Sheet open={allAdvice} onClose={() => setAllAdvice(false)} title="From your staff">
        <AllAdvice feed={full} />
      </Sheet>
      <GlossarySheet open={glossary} onClose={() => setGlossary(false)} />
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

/**
 * The bands of Office → Owner's meter, as widths on 0-100 (jobSecurity's heat: hot under 32, warm
 * to 44, steady to 64, secure 65+), so the two meters read the same.
 */
const SEAT_BANDS = [
  ['hot', 32],
  ['warm', 13],
  ['steady', 20],
  ['secure', 35],
] as const;

/** The owner's patience, shown when the seat is warm or hot (and no ultimatum in To do says it already): the Owner's meter, compact. */
function JobSecurityLine({ js }: { js: JobSecurity }) {
  const line = Math.round(50 + 50 * FIRING_LINE);
  return (
    <Link to="/office/owner" className={`card td-seat ${js.heat}`} aria-label={`Job security: ${js.label}, ${js.score} of 100. ${js.line}`}>
      <span className="td-seat-top">
        <span className="over">Job security</span>
        <span className="td-seat-v">
          <span className="num">{js.score}</span> {js.label}
        </span>
        <ChevronRight size={16} className="dim" aria-hidden="true" />
      </span>
      <span className="td-meter" aria-hidden="true">
        <span className="td-meter-track">
          {SEAT_BANDS.map(([z, w]) => (
            <i key={z} className={z} style={{ width: `${w}%` }} />
          ))}
        </span>
        <span className="td-meter-line" style={{ left: `${line}%` }}>
          <span>Fired</span>
        </span>
        <span className="td-meter-pin" style={{ left: `${Math.max(1, Math.min(99, js.score))}%` }} />
      </span>
      <span className="td-seat-l">{js.line}</span>
    </Link>
  );
}

/** Your conference rank with the two teams above and below, and the playoff odds in one figure. */
function StandingsNearby({ league }: { league: League }) {
  const me = league.userTid;
  const conf = league.teams[me].conf;
  const rows = useLeagueMemo(() => confStandings(league, conf), [league, conf]);
  const fc = useForecast(league);
  const played = rows.some((r) => r.won + r.lost > 0);
  if (!played) return null;
  const i = rows.findIndex((r) => r.tid === me);
  const from = Math.max(0, Math.min(i - 2, rows.length - 5));
  const odds = fc?.teams[me];
  return (
    <Section
      title={
        <h3>
          {conf === 'E' ? 'East' : 'West'}
          {odds && <span className="td-odds">{odds.out ? 'Out of the playoffs' : `Playoff odds ${pct(odds.reach[0], odds.clinched)}`}</span>}
        </h3>
      }
      right={
        <Link className="card-link" to="/league">
          Standings <ChevronRight size={14} aria-hidden="true" />
        </Link>
      }
    >
      <div className="list td-flat">
        {rows.slice(from, from + 5).map((r) => (
          <Link key={r.tid} to={r.tid === me ? '/team' : `/teams/${r.tid}`} className={`td-st ${r.tid === me ? 'me' : ''}`}>
            <span className="num td-st-rank">{r.confRank}</span>
            <TeamLogo tid={r.tid} size={22} decorative />
            <span className="grow ellipsis">{league.teams[r.tid].name}</span>
            <span className="num td-st-rec">
              {r.won}-{r.lost}
            </span>
            {/* games behind the conference leader, named once a row: the list has no header */}
            <span className="num td-st-gb">
              {r.gb === 0 ? '—' : r.gb.toFixed(1)}
              <small> GB</small>
            </span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

/** Your last three games this season, newest first. */
function LastResults({ league }: { league: League }) {
  const me = league.userTid;
  const games = useLeagueMemo(() => {
    const out = [];
    for (let k = league.games.length - 1; k >= 0 && out.length < 3; k--) {
      const x = league.games[k];
      if (x.season === league.season && (x.home.tid === me || x.away.tid === me)) out.push(x);
    }
    return out;
  }, [league, me]);
  if (!games.length) return null;
  return (
    <Section
      title="Last games"
      right={
        <Link className="card-link" to="/games">
          Schedule <ChevronRight size={14} aria-hidden="true" />
        </Link>
      }
    >
      <div className="list td-flat">
        {games.map((x) => {
          const home = x.home.tid === me;
          const us = home ? x.home : x.away;
          const them = home ? x.away : x.home;
          const won = us.pts > them.pts;
          return (
            <Link key={x.gid} to={`/game/${x.gid}`} className="td-game">
              <span className={`td-wl ${won ? 'w' : 'l'}`}>
                <span aria-hidden="true">{won ? 'W' : 'L'}</span>
                <span className="sr-only">{won ? 'Won' : 'Lost'}</span>
              </span>
              <span className="num td-score">
                {us.pts}-{them.pts}
              </span>
              <span className="td-ha dim">{home ? 'vs' : '@'}</span>
              <TeamLogo tid={them.tid} size={22} decorative />
              <span className="grow ellipsis">{league.teams[them.tid].name}</span>
              <ChevronRight size={16} className="dim" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

/** The newest unread mail, leaving out what Today already shows: decisions in To do, and messages that point at Today. */
function UnreadMail({ league, agendaIds, onOpen }: { league: League; agendaIds: string[]; onOpen: (id: number) => void }) {
  const open = new Set(agendaIds);
  const all = league.inbox.filter((m) => !m.read);
  // the count is what needs him (as on the bell); the rows are the newest unread, whatever they are
  const decisions = new Map(agendaIds.map((id) => [id, true]));
  const need = all.filter((m) => needsYou(m, decisions)).length;
  const shown = all
    .filter((m) => {
      const d = decisionId(m);
      return m.link !== '/' && (!d || !open.has(d));
    })
    .sort((a, b) => b.season - a.season || b.day - a.day || b.id - a.id)
    .slice(0, 3);
  if (!shown.length) return null;
  return (
    <Section
      title="Inbox"
      right={
        <Link className="card-link" to="/inbox?f=unread">
          {need ? `${need} need${need === 1 ? 's' : ''} you` : 'All unread'} <ChevronRight size={14} aria-hidden="true" />
        </Link>
      }
    >
      <div className="list td-flat">
        {shown.map((m) => (
          <MessageRow
            key={m.id}
            m={m}
            onOpen={() => {
              onOpen(m.id);
              markRead(m.id);
            }}
          />
        ))}
      </div>
    </Section>
  );
}
