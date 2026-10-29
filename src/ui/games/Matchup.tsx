// The matchup page: everything about one opponent in one place. The hero is the next meeting as a
// board (the two teams in their colours, each one's chance to win, the projected margin), what the
// night is billed as, the season series and your plan against them; then the sections: Preview (when
// the next game against them is the user's next game), Scout, Plan (with the staff's counters) and
// Matchups. On game day a dock tips the game off or sims it, and a sim lands on the result: the game's
// report, which opens on the night's story. The night after a meeting, its result leads the page.
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, Eye } from 'lucide-react';
import type { GameResult, League } from '../../core/types';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { liveInProgress } from '../../state/live';
import { guideStepOpen, nextOpponent } from '../../core/league/agenda';
import { counterCandidates } from '../../core/ai/advisor';
import { worthCall } from '../../core/ai/counterWorth';
import { byWorth, counterItem, useCounterWorth, worthText } from './matchup/useCounterWorth';
import { setPlanItem } from '../../core/league/gamePlans';
import { act } from '../../state/actions';
import { GuideStrip } from '../components/GuideStrip';
import { curTeamSeason, fmtDate } from '../../core/league/helpers';
import { confStandings } from '../../core/league/standings';
import { neutralSite } from '../../core/league/games';
import { gameProjection, nextUserGame } from '../../core/analysis/preview';
import { gameStoryFor } from '../../core/analysis/gameStory';
import { GameTop, nightTitle, useBillings } from './occasion';
import { Empty, Help, PageHeader, keep } from '../components/ui';
import { GameBoard, type BoardSide } from '../components/FinalSlab';
import { ordinal } from '../stats';
import { TabBar, useQueryParam } from '../league/shared';
import { gameTag, liveSeries, meetings, planStatus } from './data';
import { seasonSeries, seriesParts } from './series';
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
  const next = meetings(league, opp)[0];
  const upNext = useLeagueMemo(() => nextUserGame(league), [league]);
  // the preview is for the user's next game: when that's against them
  const preview = next && upNext?.gid === next.gid ? next : undefined;
  const tabs: Tab[] = [...(preview ? (['preview'] as const) : []), 'scout', 'plan', 'matchups'];
  const [tab, setTab] = useQueryParam<Tab>('tab', preview ? 'preview' : 'scout', tabs);
  const today = !!preview && preview.day === league.day;
  return (
    <main className="page">
      <GameTop
        title="Matchup"
        backTo="/games"
        right={
          <Link to={`/teams/${opp}`} className="card-link">
            Team page <ChevronRight size={14} aria-hidden="true" />
          </Link>
        }
      />
      {/* the full poster on the first section; on the others it's one line, so the section starts on the first screen */}
      <Hero league={league} opp={opp} onPlan={tab === 'plan' ? undefined : () => setTab('plan')} compact={tab !== tabs[0]} />
      {tab === tabs[0] && <JustPlayed league={league} opp={opp} />}
      {opp === nextOpponent(league) && guideStepOpen(league, 'scout') && <ScoutGuide league={league} opp={opp} />}
      <TabBar value={tab} onChange={setTab} options={tabs.map((id) => ({ id, label: LABEL[id] }))} label="Matchup sections" />
      {tab === 'preview' && preview && <PreviewTab key={preview.gid} league={league} game={preview} onPlan={() => setTab('plan')} />}
      {tab === 'scout' && <ScoutTab league={league} opp={opp} />}
      {tab === 'plan' && <PlanTab league={league} opp={opp} />}
      {tab === 'matchups' && <MatchupPlanner league={league} opp={opp} />}
      {today && <TipOff league={league} gid={preview.gid} opp={opp} name={league.teams[opp].name} />}
    </main>
  );
}

/**
 * The guide's plan step on the opener's page: the staff's counter by name and measured worth, or that
 * none of them beats the playbook tonight (until it's measured, the guide's own words).
 */
function ScoutGuide({ league, opp }: { league: League; opp: number }) {
  const drafted = useLeagueMemo(() => counterCandidates(league, league.userTid, opp), [league, opp]);
  const worth = useCounterWorth(league, opp)?.worth;
  const best = worth && byWorth(drafted, worth).find((c) => worth.get(c.id) && worthCall(worth.get(c.id)!) === 'gain');
  const line = !worth
    ? undefined
    : best
      ? `${best.label} helps, ${worthText(worth.get(best.id)!).short}. Add it, or go in with no plan.`
      : "None of the staff's counters beats your playbook tonight. Go in with no plan.";
  // (the measured counter is the step's move: Add does what the Counters card's Add does, and ticks the step)
  const add = best && {
    label: `Add ${best.label}`,
    run: () => {
      if (act('Game plan', (l) => setPlanItem(l, opp, counterItem(best, worth.get(best.id)))))
        useStore.getState().toast(`Plan vs ${league.teams[opp].abbrev}: ${best.label}`, 'good');
    },
  };
  return <GuideStrip step="scout" keep={add ? 'No plan' : 'No plan this time'} line={line} act={add || undefined} />;
}

/** Game day: tip off (or get back to the game under way), or sim it from here (this dock stands in for the Continue bar). */
function TipOff({ league, gid, opp, name }: { league: League; gid: number; opp: number; name: string }) {
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
  // the staff's counters for tonight still being measured: said on the button, so a quick tap doesn't skip the plan unseen
  const measuring = useCounterWorth(league, opp);
  const pending = !resume && !!measuring && !measuring.worth;
  // (never "100%" while it's still at it: the last games round up before the reading lands)
  const pct = pending ? Math.min(99, Math.floor(measuring!.progress * 100)) : 0;
  return (
    <div className="dockbar mu-dock" role="group" aria-label="Game day">
      <button
        className="btn primary big grow"
        disabled={simming}
        onClick={() => nav('/live')}
        aria-label={resume ? `Resume the game against the ${name}` : `Tip off against the ${name}${pending ? `. The staff is still measuring its counters: ${pct}%` : ''}`}
      >
        <span className="mu-dock-tip">
          <span>
            <Eye size={18} /> {resume ? 'Resume the game' : 'Tip off'}
          </span>
          {pending && <span className="mu-dock-sub">Staff still measuring · {pct}%</span>}
        </span>
      </button>
      <button className="btn" disabled={simming} onClick={() => void quick()}>
        {resume ? 'Finish it' : 'Quick sim'}
      </button>
    </div>
  );
}

/**
 * The hero: the next meeting as a board (away on the left, each team's chance to win, the projected
 * margin under it; with no meeting left, the two records), what the night is billed as, the season
 * series and your plan for them (`onPlan`: a tap to it; none on the Plan tab).
 */
function Hero({ league, opp, onPlan, compact }: { league: League; opp: number; onPlan?: () => void; compact?: boolean }) {
  const me = league.userTid;
  const t = league.teams[opp];
  const next = meetings(league, opp);
  const g = next[0];
  const series = liveSeries(league, opp);
  const h2h = useLeagueMemo(() => seasonSeries(league, opp), [league, opp]);
  const ranks = useLeagueMemo(() => new Map([...confStandings(league, 'E'), ...confStandings(league, 'W')].map((r) => [r.tid, r.confRank])), [league]);
  // the preview's chance to win, from the home side (the same number the Preview and the game use)
  const proj = useLeagueMemo(() => (g ? gameProjection(league, g) : null), [league, g]);
  const [bill] = useBillings(league, g);
  // (the preseason's calendar is the regular season's: its day 0 is opening night, not today)
  const pre = league.phase === 'preseason';
  const day = (d: number) =>
    !pre && d === league.day ? 'Today' : !pre && d === league.day + 1 ? 'Tomorrow' : fmtDate(league.season, d, { weekday: 'short', month: 'short', day: 'numeric' });
  const sp = seriesParts(h2h);
  const plan = planStatus(league, opp, g);
  const [awayTid, homeTid] = g ? [g.away, g.home] : [opp, me];
  const rec = (tid: number) => {
    const ts = curTeamSeason(league, tid);
    return `${ts.won}-${ts.lost}`;
  };
  const rank = (tid: number) => {
    const ts = curTeamSeason(league, tid);
    const r = ranks.get(tid);
    // no rank before anyone has played
    return r && ts.won + ts.lost > 0 ? `${ordinal(r)} ${league.teams[tid].conf === 'E' ? 'East' : 'West'}` : undefined;
  };
  const side = (tid: number): BoardSide => {
    if (!proj) return { tid, fig: <span className="mu-rec">{rec(tid)}</span>, sub: rank(tid) };
    const win = tid === homeTid ? proj.win : 1 - proj.win;
    // (as shown: 50% against 50% is neither side's)
    return {
      tid,
      fig: (
        <>
          {Math.round(win * 100)}
          <small>%</small>
        </>
      ),
      sub: rec(tid),
      lost: Math.round(win * 100) < 50,
    };
  };
  const where = g ? (neutralSite(g) ? 'Neutral floor' : g.home === me ? 'Home' : 'Away') : '';
  const tag = g ? gameTag(league, g) : '';
  const seriesNow = series ? `${league.teams[series.high].abbrev} ${series.highWins}-${series.lowWins} ${league.teams[series.low].abbrev}` : '';
  // the projected margin, from the favourite's side
  const margin = proj ? proj.margin : 0;
  const fav = league.teams[margin >= 0 ? homeTid : awayTid];
  if (compact)
    return (
      <section className="mu-hero" aria-label={`Matchup: the ${t.region} ${t.name}`}>
        <GameBoard league={league} compact away={side(awayTid)} home={side(homeTid)} over={['']} mid={<span className="gd-bd-k">{proj ? 'To win' : 'Record'}</span>} />
      </section>
    );
  return (
    <section className="mu-hero" aria-label={`Matchup: the ${t.region} ${t.name}`}>
      <GameBoard
        league={league}
        away={side(awayTid)}
        home={side(homeTid)}
        over={g ? [`${day(g.day)} · ${where}`, [tag, seriesNow && `Series ${seriesNow}`].filter(Boolean).join(' · ')] : ['No games left against them']}
        mid={<span className="gd-bd-k">{proj ? 'To win' : 'Record'}</span>}
      >
        {proj && (
          <div className="gd-bd-foot">
            {Math.abs(margin) < 0.5 ? (
              <span>A toss-up</span>
            ) : (
              <span>
                <b className="num">
                  {fav.abbrev} by {Math.abs(margin).toFixed(1)}
                </b>{' '}
                projected
              </span>
            )}
            <Help title="Projection">
              <p>From both teams&apos; net ratings, pace and home court, and early on their rotations. One game swings well either side of it.</p>
            </Help>
          </div>
        )}
      </GameBoard>
      {/* the poster's headline: what the night is billed as, or on an ordinary night who and where */}
      {g && (
        <div className="mu-hero-bill">
          <h2 className={`mu-hero-h w${bill ? bill.weight : 1}`}>{bill ? bill.tag : nightTitle(league, g, neutralSite(g))}</h2>
          {bill && <div className="mu-hero-l">{bill.line}</div>}
        </div>
      )}
      {(h2h.total > 0 || (g && onPlan)) && (
        <div className="mu-hero-foot">
          {h2h.total > 0 && (
            <span className="mu-hero-ss">
              {h2h.won + h2h.lost ? 'Season ' : ''}
              <span className="num">{keep(sp.record)}</span>
              {sp.left && ` · ${sp.left}`}
              {h2h.last && (
                <>
                  {' · last '}
                  <Link to={`/game/${h2h.last.gid}`} className="num">
                    {sp.last}
                  </Link>
                </>
              )}
            </span>
          )}
          {/* (the Plan tab shows the plan itself) */}
          {g && onPlan && (
            <button className={`mu-planlink${plan.set ? ' set' : ''}`} onClick={onPlan}>
              {plan.text} <ChevronRight size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
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
