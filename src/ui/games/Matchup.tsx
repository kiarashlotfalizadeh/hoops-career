// The matchup page: everything about one opponent in one place. Their slab (record, form, rank, the
// next meeting, the season series, your plan against them), then the sections: Preview (when the
// next game against them is the user's next game), Scout, Plan (with the staff's counters, tested in
// place), Matchups and Lab (your plan against them, projected). On game day a dock tips the game off;
// quick sim stays in the Continue bar's options.
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { useFlowRunner } from '../useFlow';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import type { League } from '../../core/types';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { touch } from '../../state/actions';
import { liveInProgress } from '../../state/live';
import { guideVisit } from '../../core/league/agenda';
import { curTeamSeason, fmtDate } from '../../core/league/helpers';
import { confStandings } from '../../core/league/standings';
import { neutralSite } from '../../core/league/games';
import { nextUserGame } from '../../core/analysis/preview';
import { Empty, PageHeader } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { slabVars } from '../teamColors';
import { ordinal } from '../stats';
import { useBack } from '../nav';
import { TabBar, useQueryParam } from '../league/shared';
import { plural } from '../../core/format';
import { liveSeries, meetings, planStatus } from './data';
import { PreviewTab } from './matchup/PreviewTab';
import { ScoutTab } from './matchup/ScoutTab';
import { PlanTab } from './matchup/PlanTab';
import { MatchupPlanner } from '../components/MatchupPlanner';
import { LabPanel } from './lab/LabPanel';
import './games.css';

type Tab = 'preview' | 'scout' | 'plan' | 'matchups' | 'lab';
const LABEL: Record<Tab, string> = { preview: 'Preview', scout: 'Scout', plan: 'Plan', matchups: 'Matchups', lab: 'Lab' };

export default function Matchup() {
  const league = useLeague();
  const { tid } = useParams();
  const [params] = useSearchParams();
  const opp = Number(tid);
  // (links from before the Lab's counters moved to the Plan: Test, and Test's counters)
  if (params.get('tab') === 'test') return <Navigate to={`/games/${tid}?tab=${params.get('lab') === 'counters' ? 'plan' : 'lab'}`} replace />;
  const team = Number.isInteger(opp) ? league.teams[opp] : undefined;
  if (!team || opp === league.userTid)
    return (
      <main className="page">
        <PageHeader title="Matchup" back backTo="/games" />
        <Empty>{team ? 'Pick an opponent from your schedule.' : 'That team does not exist.'}</Empty>
      </main>
    );
  return <MatchupScreen league={league} opp={opp} />;
}

function MatchupScreen({ league, opp }: { league: League; opp: number }) {
  // the guided first week's "scout your opener" is done once a matchup page is open
  useEffect(() => void touch((l) => void guideVisit(l, 'scout')), []);
  const next = meetings(league, opp)[0];
  const upNext = useLeagueMemo(() => nextUserGame(league), [league]);
  // the preview is for the user's next game: when that's against them
  const preview = next && upNext?.gid === next.gid ? next : undefined;
  const tabs: Tab[] = [...(preview ? (['preview'] as const) : []), 'scout', 'plan', 'matchups', 'lab'];
  const [tab, setTab] = useQueryParam<Tab>('tab', preview ? 'preview' : 'scout', tabs);
  const today = !!preview && preview.day === league.day;
  return (
    <main className="page">
      <Slab league={league} opp={opp} onPlan={tab === 'plan' ? undefined : () => setTab('plan')} />
      <TabBar value={tab} onChange={setTab} options={tabs.map((id) => ({ id, label: LABEL[id] }))} label="Matchup sections" />
      {tab === 'preview' && preview && <PreviewTab key={preview.gid} league={league} game={preview} />}
      {tab === 'scout' && <ScoutTab league={league} opp={opp} />}
      {tab === 'plan' && <PlanTab league={league} opp={opp} />}
      {tab === 'matchups' && <MatchupPlanner league={league} opp={opp} />}
      {tab === 'lab' && <LabPanel league={league} fixedOpp={opp} modes={['project']} />}
      {today && <TipOff league={league} gid={preview.gid} name={league.teams[opp].name} />}
    </main>
  );
}

/** Game day: tip off (or get back to the game under way), or sim it from here (this dock stands in for the Continue bar). */
function TipOff({ league, gid, name }: { league: League; gid: number; name: string }) {
  const nav = useNavigate();
  const run = useFlowRunner();
  const simming = useStore((s) => !!s.sim);
  const live = liveInProgress(league);
  const resume = live?.gid === gid;
  return (
    <div className="dockbar mu-dock" role="group" aria-label="Game day">
      <button
        className="btn primary big grow"
        disabled={simming}
        onClick={() => nav('/live')}
        aria-label={resume ? `Resume the game against the ${name}` : `Tip off against the ${name}`}
      >
        <Eye size={18} /> {resume ? 'Resume the game' : 'Tip off'}
      </button>
      <button className="btn" disabled={simming} onClick={() => void run({ id: 'quick', label: 'Quick sim this game', cmd: 'quickGame' })}>
        {resume ? 'Finish it' : 'Quick sim'}
      </button>
    </div>
  );
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** Their slab: who they are, how they stand, the next meeting, how the season series stands and your plan for them (`onPlan`: a tap to it; none on the Plan tab). */
function Slab({ league, opp, onPlan }: { league: League; opp: number; onPlan?: () => void }) {
  const goBack = useBack('/games');
  const me = league.userTid;
  const t = league.teams[opp];
  const ts = curTeamSeason(league, opp);
  const played = ts.won + ts.lost > 0;
  const rank = useLeagueMemo(() => confStandings(league, t.conf).find((r) => r.tid === opp)?.confRank ?? 0, [league, t.conf, opp]);
  const next = meetings(league, opp);
  const series = liveSeries(league, opp);
  const h2h = useLeagueMemo(() => seasonMeetings(league, opp), [league, opp]);
  const l10 = ts.lastTen ?? [];
  const form = played
    ? [
        l10.length ? `${l10.filter((x) => x === 1).length}-${l10.filter((x) => x === 0).length} in last ${l10.length}` : '',
        ts.streak ? (ts.streak > 0 ? `won ${ts.streak}` : `lost ${-ts.streak}`) : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const where = (g: (typeof next)[number]) => (neutralSite(g) ? 'neutral floor' : g.home === me ? 'home' : 'away');
  // (the preseason's calendar is the regular season's: its day 0 is opening night, not today)
  const pre = league.phase === 'preseason';
  const day = (d: number) =>
    !pre && d === league.day ? 'Today' : !pre && d === league.day + 1 ? 'Tomorrow' : fmtDate(league.season, d, { weekday: 'short', month: 'short', day: 'numeric' });
  const last = h2h.games[h2h.games.length - 1];
  const plan = planStatus(league, opp, next[0]);
  return (
    <section className="slab mu-slab" style={slabVars(t.colors) as CSSProperties} aria-label={`Matchup: the ${t.region} ${t.name}`}>
      <span className="slab-mark">
        <TeamLogo tid={opp} size={200} decorative />
      </span>
      <div className="mu-top">
        <button className="iconbtn" onClick={goBack} aria-label="Back">
          <ChevronLeft size={24} />
        </button>
        <span className="mu-over grow">Matchup</span>
        <Link to={`/teams/${opp}`} className="card-link">
          Team page <ChevronRight size={14} />
        </Link>
      </div>
      <div className="mu-id">
        <TeamLogo tid={opp} size={56} decorative />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="mu-region">{t.region}</div>
          <h1 className="mu-name ellipsis">{t.name}</h1>
        </div>
        <div className="mu-rec">
          <div className="v num">
            {ts.won}-{ts.lost}
          </div>
          {/* no rank before anyone has played */}
          {rank > 0 && played && (
            <div className="s">
              {ordinal(rank)} {t.conf === 'E' ? 'East' : 'West'}
            </div>
          )}
        </div>
      </div>
      <dl className="mu-facts">
        {form && <Fact k="Form">{form}</Fact>}
        <Fact k="Next">
          {next.length
            ? `${day(next[0].day)}, ${where(next[0])}${
                next.length > 1
                  ? ` · then ${next
                      .slice(1, 3)
                      .map((g) => fmtDate(league.season, g.day))
                      .join(', ')}`
                  : ''
              }`
            : 'No games left against them'}
        </Fact>
        {series && (
          <Fact k="Series">
            {league.teams[series.high].abbrev} {series.highWins}-{series.lowWins} {league.teams[series.low].abbrev}
          </Fact>
        )}
        {h2h.total > 0 && (
          <Fact k="Season">
            {/* (no record before the first meeting: just how many there are) */}
            {h2h.games.length ? (
              <>
                <span className="num">
                  {h2h.won}-{h2h.lost}
                </span>
                {h2h.left > 0 ? ` · ${h2h.left} left` : ''}
              </>
            ) : (
              plural(h2h.total, 'meeting')
            )}
            {last && (
              <>
                {' · last '}
                <Link to={`/game/${last.gid}`}>
                  {last.won ? 'W' : 'L'} {last.us}-{last.them}
                </Link>
              </>
            )}
          </Fact>
        )}
        {/* (the Plan tab shows the plan itself) */}
        {next.length > 0 && onPlan && (
          <Fact k="Plan">
            <button className={`mu-planlink${plan.set ? ' set' : ''}`} onClick={onPlan}>
              {plan.set ? plan.text : 'None yet: set one'} <ChevronRight size={14} aria-hidden="true" />
            </button>
          </Fact>
        )}
      </dl>
    </section>
  );
}

/** This season's regular-season meetings with them: played (oldest first), won, lost, left. */
function seasonMeetings(league: League, opp: number) {
  const me = league.userTid;
  const games: { gid: number; us: number; them: number; won: boolean }[] = [];
  for (const g of league.games) {
    if (g.season !== league.season || g.type !== 'regular') continue;
    if (!((g.home.tid === me && g.away.tid === opp) || (g.home.tid === opp && g.away.tid === me))) continue;
    const us = g.home.tid === me ? g.home : g.away;
    const them = us === g.home ? g.away : g.home;
    games.push({ gid: g.gid, us: us.pts, them: them.pts, won: us.pts > them.pts });
  }
  const total = league.schedule.filter((g) => g.type === 'regular' && ((g.home === me && g.away === opp) || (g.home === opp && g.away === me))).length;
  const won = games.filter((g) => g.won).length;
  return { games, won, lost: games.length - won, left: Math.max(0, total - games.length), total };
}
