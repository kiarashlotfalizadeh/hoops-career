// The matchup page: everything about one opponent in one place. The hero is the next meeting as a
// board (the two teams in their colours, their records, the favourite's chance to win: rosters,
// results and home court, never moved by a plan not yet played), the season series and your plan
// against them; then two sections: Brief (the two teams as numbers: league
// ranks side by side, the starting fives and who's out, their threats, the scouting a tap down) and
// Game Plan (your plan, the staff's counters, who guards whom, the special plans). On game day a dock
// tips the game off or sims it, and a sim lands on the result: the game's report. The night after a
// meeting, its result leads the page.
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, Eye } from 'lucide-react';
import type { GameResult, League } from '../../core/types';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { liveInProgress } from '../../state/live';
import { guideStepOpen, nextOpponent } from '../../core/league/agenda';
import { counterCandidates } from '../../core/ai/advisor';
import { CHECK_AFTER } from '../../core/ai/tacticEdits';
import { counterItem, useCounterWorth } from './matchup/useCounterWorth';
import { setPlanItem } from '../../core/league/gamePlans';
import { act } from '../../state/actions';
import { GuideStrip } from '../components/GuideStrip';
import { curTeamSeason, fmtDate, teamCity } from '../../core/league/helpers';
import { confStandings } from '../../core/league/standings';
import { neutralSite } from '../../core/league/games';
import { gameProjection, nextUserGame } from '../../core/analysis/preview';
import { GameTop } from './occasion';
import { favoriteOf } from './favorite';
import { Empty, Help, PageHeader, keep } from '../components/ui';
import { GameBoard, type BoardSide } from '../components/FinalSlab';
import { ordinal } from '../stats';
import { TabBar, useQueryParam } from '../league/shared';
import { gameTag, liveSeries, meetings, planStatus } from './data';
import { seasonSeries, seriesParts } from './series';
import { BriefTab } from './matchup/BriefTab';
import { PlanTab } from './matchup/PlanTab';
import './games.css';

type Tab = 'brief' | 'plan';
const TABS: { id: Tab; label: string }[] = [
  { id: 'brief', label: 'Brief' },
  { id: 'plan', label: 'Game Plan' },
];
/** Links from before the page had two sections: the Lab, its counters and Matchups are the Game Plan's (Preview and Scout open the Brief). */
const OLD_PLAN_TABS = ['test', 'lab', 'matchups'];

export default function Matchup() {
  const league = useLeague();
  const { tid } = useParams();
  const [params] = useSearchParams();
  const opp = Number(tid);
  if (OLD_PLAN_TABS.includes(params.get('tab') ?? '')) return <Navigate to={`/games/${tid}?tab=plan`} replace />;
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
  // the user's next game is against them: its fives are set as it will tip off, and it can be played from here
  const mine = !!next && upNext?.gid === next.gid;
  const [tab, setTab] = useQueryParam<Tab>(
    'tab',
    'brief',
    TABS.map((t) => t.id),
  );
  const today = mine && next.day === league.day;
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
      {/* the full board on the Brief; on the Game Plan it's one line, so the plan starts on the first screen */}
      <Hero league={league} opp={opp} onPlan={tab === 'plan' ? undefined : () => setTab('plan')} compact={tab !== 'brief'} />
      {tab === 'brief' && <JustPlayed league={league} opp={opp} />}
      {opp === nextOpponent(league) && guideStepOpen(league, 'scout') && <ScoutGuide league={league} opp={opp} />}
      <TabBar value={tab} onChange={setTab} options={TABS} label="Matchup sections" />
      {tab === 'brief' && <BriefTab key={next?.gid ?? -1} league={league} opp={opp} game={next} next={mine} />}
      {tab === 'plan' && <PlanTab league={league} opp={opp} />}
      {today && <TipOff league={league} gid={next.gid} name={teamCity(league, opp)} />}
    </main>
  );
}

/**
 * The guide's plan step on the opener's page: the first counter the staff's scouting drafts, by name
 * and with its reason (its idea, not a verdict: nothing says ahead of the game what a counter is
 * worth), or that it has none.
 */
function ScoutGuide({ league, opp }: { league: League; opp: number }) {
  const drafted = useLeagueMemo(() => counterCandidates(league, league.userTid, opp), [league, opp]);
  // (measured under the hood, for the report: an item added carries its reading there)
  const worth = useCounterWorth(league, opp)?.worth;
  const first = drafted[0];
  const line = first
    ? `The staff's first idea: ${first.label}. ${first.why} Add it, pick another, or go in with no plan. The report says what it was worth.`
    : 'The staff has no counter for them. Go in with no plan.';
  // (Add does what the Counters card's Add does, and ticks the step)
  const add = first && {
    label: `Add ${first.label}`,
    run: () => {
      if (act('Game plan', (l) => setPlanItem(l, opp, counterItem(first, worth?.get(first.id)))))
        useStore.getState().toast(`Plan vs ${league.teams[opp].abbrev}: ${first.label}`, 'good');
    },
  };
  return <GuideStrip step="scout" keep={add ? 'No plan' : 'No plan this time'} line={line} act={add || undefined} />;
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
      <button className="btn primary big grow" disabled={simming} onClick={() => nav('/live')} aria-label={resume ? `Resume the game against ${name}` : `Tip off against ${name}`}>
        <Eye size={18} /> {resume ? 'Resume the game' : 'Tip off'}
      </button>
      <button className="btn" disabled={simming} onClick={() => void quick()}>
        {resume ? 'Finish it' : 'Quick sim'}
      </button>
    </div>
  );
}

/**
 * What the forecast is made of, in a line: rosters, results and home court, plus his tactical changes
 * the staff has checked on played games (facts, in points). His plan for the game is not in it and
 * the line says so when he has one: the number doesn't move as counters go in and out, so it can't be
 * swept for the best plan.
 */
function forecastIn(edits: number, planned: boolean): string {
  const f = (v: number) => `${v > 0.04 ? '+' : v < -0.04 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
  const base = Math.abs(edits) >= 0.05 ? `Rosters, results and home court, and your checked changes (${f(edits)} pts).` : 'Rosters, results and home court.';
  return planned
    ? `${base} Your plan isn't in it: what it does is found out on the floor, and the report says what it was worth.`
    : `${base} A game plan doesn't move it. A change to your tactics counts once the staff has checked it on ${CHECK_AFTER} played games.`;
}

/**
 * The hero: the next meeting as a board (away on the left, the two records, the favourite's chance to
 * win under them when there's a meeting left), the season series and your plan for them (`onPlan`: a tap to it; none on the Game Plan tab).
 */
function Hero({ league, opp, onPlan, compact }: { league: League; opp: number; onPlan?: () => void; compact?: boolean }) {
  const me = league.userTid;
  const t = league.teams[opp];
  const next = meetings(league, opp);
  const g = next[0];
  const series = liveSeries(league, opp);
  const h2h = useLeagueMemo(() => seasonSeries(league, opp), [league, opp]);
  const ranks = useLeagueMemo(() => new Map([...confStandings(league, 'E'), ...confStandings(league, 'W')].map((r) => [r.tid, r.confRank])), [league]);
  // the chance to win, from the home side (the same reading the game's own win chance starts from)
  const proj = useLeagueMemo(() => (g ? gameProjection(league, g) : null), [league, g]);
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
  const side = (tid: number): BoardSide => ({ tid, fig: <span className="mu-rec">{rec(tid)}</span>, sub: rank(tid) });
  const where = g ? (neutralSite(g) ? 'Neutral floor' : g.home === me ? 'Home' : 'Away') : '';
  const tag = g ? gameTag(league, g) : '';
  const seriesNow = series ? `${league.teams[series.high].abbrev} ${series.highWins}-${series.lowWins} ${league.teams[series.low].abbrev}` : '';
  if (compact)
    return (
      <section className="mu-hero" aria-label={`Matchup: the ${t.region} ${t.name}`}>
        <GameBoard league={league} compact away={side(awayTid)} home={side(homeTid)} over={['']} mid={<span className="gd-bd-k">Record</span>} />
      </section>
    );
  return (
    <section className="mu-hero" aria-label={`Matchup: the ${t.region} ${t.name}`}>
      <GameBoard
        league={league}
        away={side(awayTid)}
        home={side(homeTid)}
        over={g ? [`${day(g.day)} · ${where}`, [tag, seriesNow && `Series ${seriesNow}`].filter(Boolean).join(' · ')] : ['No games left against them']}
        mid={<span className="gd-bd-k">Record</span>}
      >
        {proj && (
          <div className="gd-bd-foot">
            <span>
              <b>{favoriteOf(league, { home: homeTid, away: awayTid }, proj.win).line} to win</b>
              {` · by ${Math.abs(proj.margin).toFixed(1)}`}
            </span>
            <Help title="Chance to win">
              <p>From both teams&apos; net ratings, tonight&apos;s rotations and home court.</p>
              <p>
                Your game plan doesn&apos;t move it. What a plan does is found out on the floor, and the game report says what it was worth. A change to your tactics counts once
                the staff has checked it on played games (Tactics, Season Analysis).
              </p>
            </Help>
          </div>
        )}
        {proj && (
          // what the number is made of, and that his plan isn't in it
          <div className="mu-hero-in small dim2">{forecastIn(g?.home === me ? proj.edits : -proj.edits, plan.set)}</div>
        )}
      </GameBoard>
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
          {/* (the Game Plan tab shows the plan itself) */}
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

/** The day after a meeting with them: its result leads the page, a tap from the report. */
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
  if (!last) return null;
  const [us, them] = last.home.tid === me ? [last.home.pts, last.away.pts] : [last.away.pts, last.home.pts];
  const won = us > them;
  return (
    <Link to={`/game/${last.gid}`} className={`mu-last ${won ? 'w' : 'l'}`} aria-label={`Final, ${won ? 'won' : 'lost'} ${us}-${them}. Game report`}>
      <span className="mu-last-score">
        <span className="mu-last-wl">{won ? 'W' : 'L'}</span>
        <span className="num">
          {us}-{them}
        </span>
      </span>
      <span className="mu-last-t">
        <span className="mu-last-k">Final{last.ot ? ` · ${last.ot > 1 ? `${last.ot}OT` : 'OT'}` : ''}</span>
        <span className="mu-last-h">Game report</span>
      </span>
      <ChevronRight size={16} aria-hidden="true" />
    </Link>
  );
}
