// The matchup page: everything about one opponent in one place. Their slab (record, form, rank, the
// next meeting, the season series, your plan against them), then the sections: Preview (when the
// next game against them is the user's next game), Scout, Plan (with the staff's counters) and
// Matchups. On game day a dock tips the game off or sims it, and a sim lands on the result: the game's
// report, which opens on the night's story. The night after a meeting, its result leads the page.
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import type { GameResult, League } from '../../core/types';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { touch } from '../../state/actions';
import { liveInProgress } from '../../state/live';
import { guideVisit } from '../../core/league/agenda';
import { curTeamSeason, fmtDate } from '../../core/league/helpers';
import { confStandings } from '../../core/league/standings';
import { neutralSite } from '../../core/league/games';
import { nextUserGame } from '../../core/analysis/preview';
import { gameStoryFor } from '../../core/analysis/gameStory';
import { TeamForm } from './occasion';
import { Empty, PageHeader } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { slabVars } from '../teamColors';
import { ordinal } from '../stats';
import { useBack } from '../nav';
import { TabBar, useQueryParam } from '../league/shared';
import { liveSeries, meetings, planStatus } from './data';
import { lastTenText, seasonSeries, seriesParts, streakText } from './series';
import { PreviewTab } from './matchup/PreviewTab';
import { ScoutTab } from './matchup/ScoutTab';
import { PlanTab } from './matchup/PlanTab';
import { MatchupPlanner } from '../components/MatchupPlanner';
import './games.css';

type Tab = 'preview' | 'scout' | 'plan' | 'matchups';
const LABEL: Record<Tab, string> = { preview: 'Preview', scout: 'Scout', plan: 'Plan', matchups: 'Matchups' };

export default function Matchup() {
  const league = useLeague();
  const { tid } = useParams();
  const [params] = useSearchParams();
  const opp = Number(tid);
  // (links from before the Lab was retired: Test, its counters and the Lab tab open the Plan)
  if (params.get('tab') === 'test' || params.get('tab') === 'lab') return <Navigate to={`/games/${tid}?tab=plan`} replace />;
  const team = Number.isInteger(opp) ? league.teams[opp] : undefined;
  if (!team || opp === league.userTid)
    return (
      <main className="page">
        <PageHeader title="Matchup" back backTo="/games" />
        <div className="card">
          <Empty>{team ? 'Pick an opponent from your schedule.' : 'That team does not exist.'}</Empty>
        </div>
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
  const tabs: Tab[] = [...(preview ? (['preview'] as const) : []), 'scout', 'plan', 'matchups'];
  const [tab, setTab] = useQueryParam<Tab>('tab', preview ? 'preview' : 'scout', tabs);
  const today = !!preview && preview.day === league.day;
  return (
    <main className="page">
      <Slab league={league} opp={opp} onPlan={tab === 'plan' ? undefined : () => setTab('plan')} />
      <JustPlayed league={league} opp={opp} />
      <TabBar value={tab} onChange={setTab} options={tabs.map((id) => ({ id, label: LABEL[id] }))} label="Matchup sections" />
      {tab === 'preview' && preview && <PreviewTab key={preview.gid} league={league} game={preview} onPlan={() => setTab('plan')} />}
      {tab === 'scout' && <ScoutTab league={league} opp={opp} />}
      {tab === 'plan' && <PlanTab league={league} opp={opp} />}
      {tab === 'matchups' && <MatchupPlanner league={league} opp={opp} />}
      {today && <TipOff league={league} gid={preview.gid} name={league.teams[opp].name} />}
    </main>
  );
}

/** Game day: tip off (or get back to the game under way), or sim it from here (this dock stands in for the Continue bar). */
function TipOff({ league, gid, name }: { league: League; gid: number; name: string }) {
  const nav = useNavigate();
  const simming = useStore((s) => !!s.sim);
  // (also finishes the game under way, from its current score) the result is the moment: its report
  const quick = async () => {
    const st = useStore.getState();
    if (st.sim) return;
    await st.simulate({ kind: 'days', n: 1 });
    if (useStore.getState().league?.games.some((g) => g.gid === gid)) nav(`/game/${gid}`);
  };
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
      <button className="btn" disabled={simming} onClick={() => void quick()}>
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
  const h2h = useLeagueMemo(() => seasonSeries(league, opp), [league, opp]);
  const form = played ? [lastTenText(ts.lastTen ?? []), streakText(ts.streak)].filter(Boolean).join(' · ') : '';
  const where = (g: (typeof next)[number]) => (neutralSite(g) ? 'neutral floor' : g.home === me ? 'home' : 'away');
  // (the preseason's calendar is the regular season's: its day 0 is opening night, not today)
  const pre = league.phase === 'preseason';
  const day = (d: number) =>
    !pre && d === league.day ? 'Today' : !pre && d === league.day + 1 ? 'Tomorrow' : fmtDate(league.season, d, { weekday: 'short', month: 'short', day: 'numeric' });
  const sp = seriesParts(h2h);
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
        {form && (
          <Fact k="Form">
            <span className="mu-form">
              <TeamForm league={league} tid={opp} />
              <span>{form}</span>
            </span>
          </Fact>
        )}
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
            <span className="num">{sp.record}</span>
            {sp.left && ` · ${sp.left}`}
            {h2h.last && (
              <>
                {' · last '}
                <Link to={`/game/${h2h.last.gid}`}>{sp.last}</Link>
              </>
            )}
          </Fact>
        )}
        {/* (the Plan tab shows the plan itself) */}
        {next.length > 0 && onPlan && (
          <Fact k="Plan">
            <button className={`mu-planlink${plan.set ? ' set' : ''}`} onClick={onPlan}>
              {plan.detail} <ChevronRight size={14} aria-hidden="true" />
            </button>
          </Fact>
        )}
      </dl>
    </section>
  );
}

/** The day after a meeting with them: its result and headline lead the page, a tap from the report. */
function JustPlayed({ league, opp }: { league: League; opp: number }) {
  const me = league.userTid;
  const last = useLeagueMemo(() => {
    let r: GameResult | undefined;
    for (let i = league.games.length - 1; i >= 0 && !r; i--) {
      const g = league.games[i];
      if (g.home.tid === me || g.away.tid === me) r = g;
    }
    return r && r.season === league.season && r.day >= league.day - 1 && [r.home.tid, r.away.tid].includes(opp) ? r : undefined;
  }, [league, me, opp]);
  const story = useLeagueMemo(() => (last ? gameStoryFor(league, last.gid) : null), [league, last]);
  if (!last || !story) return null;
  const [us, them] = last.home.tid === me ? [last.home.pts, last.away.pts] : [last.away.pts, last.home.pts];
  return (
    <Link to={`/game/${last.gid}`} className={`mu-last ${story.won ? 'w' : 'l'}`} aria-label={`Final, ${story.won ? 'won' : 'lost'} ${us}-${them}: ${story.head}. Game report`}>
      <span className="mu-last-score">
        <span className="mu-last-wl">{story.won ? 'W' : 'L'}</span>
        <span className="num">
          {us}-{them}
        </span>
      </span>
      <span className="mu-last-t">
        <span className="mu-last-k">Final{last.ot ? ` · ${last.ot > 1 ? `${last.ot}OT` : 'OT'}` : ''}</span>
        <span className="mu-last-h">{story.head}</span>
      </span>
      <ChevronRight size={16} aria-hidden="true" />
    </Link>
  );
}
