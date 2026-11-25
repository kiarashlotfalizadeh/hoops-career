// The matchup page: everything about one opponent in one place. The hero is the next meeting as a
// board (the two teams in their colours, their records, the favourite's chance to win), the season
// series and your plan against them; then two sections: Brief (the two teams as numbers: league
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
import { worthCall } from '../../core/ai/counterWorth';
import { CHECK_AFTER } from '../../core/ai/tacticEdits';
import { byWorth, counterItem, useCounterWorth, worthText } from './matchup/useCounterWorth';
import { planFor, planWorth, setPlanItem } from '../../core/league/gamePlans';
import { act } from '../../state/actions';
import { GuideStrip } from '../components/GuideStrip';
import { curTeamSeason, fmtDate, teamCity } from '../../core/league/helpers';
import { confStandings } from '../../core/league/standings';
import { neutralSite } from '../../core/league/games';
import { gameProjection, nextUserGame, winChance } from '../../core/analysis/preview';
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
      {today && <TipOff league={league} gid={next.gid} opp={opp} name={teamCity(league, opp)} />}
    </main>
  );
}

/**
 * The guide's plan step on the opener's page: the staff's counter by name, or that none of them beats
 * the playbook tonight (until they've looked, the guide's own words).
 */
function ScoutGuide({ league, opp }: { league: League; opp: number }) {
  const drafted = useLeagueMemo(() => counterCandidates(league, league.userTid, opp), [league, opp]);
  const worth = useCounterWorth(league, opp)?.worth;
  const best = worth && byWorth(drafted, worth).find((c) => worth.get(c.id) && worthCall(worth.get(c.id)!) === 'gain');
  const line = !worth
    ? undefined
    : best
      ? `${best.label} ${worthText(worth.get(best.id)!).short}. Add it, or go in with no plan.`
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
  // the staff still looking at tonight's counters: said on the button, so a quick tap doesn't skip the plan unseen
  const measuring = useCounterWorth(league, opp);
  const pending = !resume && !!measuring && !measuring.worth;
  return (
    <div className="dockbar mu-dock" role="group" aria-label="Game day">
      <button
        className="btn primary big grow"
        disabled={simming}
        onClick={() => nav('/live')}
        aria-label={resume ? `Resume the game against ${name}` : `Tip off against ${name}${pending ? '. The staff is still looking at its counters' : ''}`}
      >
        <span className="mu-dock-tip">
          <span>
            <Eye size={18} /> {resume ? 'Resume the game' : 'Tip off'}
          </span>
          {pending && <span className="mu-dock-sub">Staff still looking at counters</span>}
        </span>
      </button>
      <button className="btn" disabled={simming} onClick={() => void quick()}>
        {resume ? 'Finish it' : 'Quick sim'}
      </button>
    </div>
  );
}

/**
 * What of the coach's own work is in the forecast, in a line: his plan as the staff measured it whole
 * (its figure and give-or-take, also when it comes to nothing, so a forecast that didn't move says
 * why) and his checked tactical changes, in points; with neither, that tactics aren't in it until
 * they're measured. `plan`: the plan's points in the forecast; `whole`: its measurement, once in;
 * `measuring`: there's a plan and the staff is still on it.
 */
function forecastIn(plan: number, edits: number, whole?: { pts: number; raw: number; se: number }, measuring?: boolean): string {
  const f = (v: number) => `${v > 0.04 ? '+' : v < -0.04 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
  const win = (v: number) => {
    const pc = Math.round((winChance(v) - 0.5) * 100);
    return pc ? `, about ${pc > 0 ? '+' : '−'}${Math.abs(pc)}% to win in an even game` : '';
  };
  const ed = Math.abs(edits) >= 0.05 ? `your checked changes ${f(edits)} pts` : '';
  if (measuring) return `The staff is measuring your plan: the forecast moves by what it finds.${ed ? ` In it now: ${ed}.` : ''}`;
  if (whole) {
    const pm = `give or take ${Math.max(0.1, whole.se).toFixed(1)}`;
    const said =
      Math.abs(whole.pts) >= 0.05
        ? `your plan ${f(whole.pts)} pts a game (${pm}${win(whole.pts)})`
        : `your plan measured about even against no plan (${f(whole.raw)} pts, ${pm}), so it doesn't move the forecast`;
    return `In the forecast: ${[said, ed].filter(Boolean).join('; ')}.`;
  }
  const parts = [Math.abs(plan) >= 0.05 && `your plan ${f(plan)} pts`, ed].filter(Boolean);
  return parts.length
    ? `In the forecast: ${parts.join(', ')}.`
    : `Rosters, results and home court. Tactics move it once the staff has measured them: your game plan, or a change checked after ${CHECK_AFTER} games.`;
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
  // the plan as the staff measured it whole (the counters' run measures it too), or still measuring
  const made = g ? planFor(league, opp, g) : null;
  const whole = planWorth(made);
  const measuring = useCounterWorth(league, opp);
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
              <p>
                From both teams&apos; net ratings, tonight&apos;s rotations and home court. Your game plan counts by what the staff measures it worth: the same game played a few
                hundred times with the whole plan (counters and matchups) and without it. Most plans are worth under a point a game, and a point is about 3% to win. A change to
                your tactics counts once the staff has checked it on played games (Tactics, Season Analysis). Until then, what it does is found out on the floor.
              </p>
            </Help>
          </div>
        )}
        {proj && (
          // what of the coach's own work is in the number, so a forecast that doesn't move says why
          <div className="mu-hero-in small dim2">
            {forecastIn(g?.home === me ? proj.plan : -proj.plan, g?.home === me ? proj.edits : -proj.edits, whole, !!made && !whole && !!measuring && !measuring.worth)}
          </div>
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
