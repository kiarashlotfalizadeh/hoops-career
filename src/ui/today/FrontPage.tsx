// Today's front page: the lead (the user's last result while it's fresh, or the top story about his
// team), his season at a glance (the form guide, where he stands, the owner's and fans' pulse), the
// league's top headlines, and the way back to "While you were away". The story is on top; the
// numbers behind it are one tap down (the report, the standings, the story's page).
import { Link } from 'react-router-dom';
import { ChevronRight, Newspaper } from 'lucide-react';
import type { League, NewsItem } from '../../core/types';
import { useLeagueMemo, useStore } from '../../state/store';
import { confStandings } from '../../core/league/standings';
import { fmtDate } from '../../core/league/helpers';
import { pct } from '../../core/analysis/odds';
import { ordinalSuffix } from '../../core/format';
import { Avatar, Section } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { CoachPulse } from '../office/Pulse';
import { useForecast } from '../useForecast';
import { freshResult, headOf, lastResults, leagueHeadlines, runOf, scoreText, storyLink, topStory, type Result } from './front';
import { digestLine } from './digest';

/** What a news item is, over its headline. */
export const NEWS_LABEL: Partial<Record<NewsItem['kind'], string>> = {
  game: 'Final',
  power: 'Power rankings',
  honor: 'Honors',
  column: 'Column',
  preview: 'Preview',
  milestone: 'Milestone',
  record: 'Record',
  award: 'Awards',
  trade: 'Trade',
  signing: 'Signing',
  draft: 'Draft',
  injury: 'Injury',
  coach: 'Coaching',
  rumor: 'Rumor',
  retire: 'Retirement',
  release: 'Release',
};

/** "Beat the Celtics", "Lost at Boston": a result's headline when the press hasn't written one. */
function plainHead(league: League, r: Result): string {
  const t = league.teams[r.opp];
  if (r.won) return r.home ? `Beat the ${t.name} at home` : `Won at ${t.region}`;
  return r.home ? `Lost to the ${t.name} at home` : `Lost at ${t.region}`;
}

/** The player of the game's line: "Brunson: 41 pts, 7 ast". */
function pogLine(league: League, gid: number): { pid: number; text: string } | null {
  const g = league.games.find((x) => x.gid === gid);
  if (!g?.pog) return null;
  const line = [...g.home.players, ...g.away.players].find((b) => b.pid === g.pog);
  if (!line) return null;
  const reb = line.orb + line.drb;
  const figs = [`${line.pts} pts`, reb >= 8 ? `${reb} reb` : '', line.ast >= 6 ? `${line.ast} ast` : ''].filter(Boolean).join(', ');
  return { pid: line.pid, text: `Player of the game: ${line.name}, ${figs}` };
}

/**
 * The lead: the last game while it's the news (the press's story of it, or the score and the player
 * of the game), otherwise the top story about the user's team from the last two weeks.
 */
export function LeadStory({ league }: { league: League }) {
  const lead = useLeagueMemo(() => {
    const fresh = freshResult(league);
    if (fresh) return { kind: 'result' as const, ...fresh, pog: fresh.story ? null : pogLine(league, fresh.r.gid) };
    const n = topStory(league);
    return n ? { kind: 'story' as const, n } : null;
  }, [league]);
  if (!lead) return null;
  if (lead.kind === 'story') {
    const n = lead.n;
    const pid = n.pids.find((p) => league.players[p]?.tid === league.userTid);
    const p = pid !== undefined ? league.players[pid] : undefined;
    return (
      <Link to={storyLink(n.id)} className={`td-lead w${n.weight ?? 1}`} aria-label={`${headOf(n)}. Read the story`}>
        <span className="td-lead-over">
          <span>
            {NEWS_LABEL[n.kind] ?? 'Your team'} · {fmtDate(n.season, n.day)}
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </span>
        <span className="td-lead-main">
          {p && <Avatar p={p} />}
          <span className="grow">
            <span className="td-lead-head">{headOf(n)}</span>
            {n.head && <span className="td-lead-dek">{n.text}</span>}
          </span>
        </span>
      </Link>
    );
  }
  const { r, story, pog } = lead;
  const hero = story?.hero !== undefined ? league.players[story.hero] : pog ? league.players[pog.pid] : undefined;
  const opp = league.teams[r.opp];
  return (
    <Link
      to={`/game/${r.gid}`}
      className={`td-lead result ${r.won ? 'won' : 'lost'}`}
      aria-label={`${r.won ? 'Won' : 'Lost'} ${scoreText(r)} ${r.home ? 'versus' : 'at'} ${opp.name}. ${story?.head ?? ''} Game report`}
    >
      <span className="td-lead-over">
        <span>Final · {fmtDate(league.season, r.day, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        <span className="td-lead-go">
          Report <ChevronRight size={14} aria-hidden="true" />
        </span>
      </span>
      <span className="td-lead-score">
        <span className={`td-wl ${r.won ? 'w' : 'l'}`} aria-hidden="true">
          {r.won ? 'W' : 'L'}
        </span>
        <span className="num td-lead-pts">{scoreText(r)}</span>
        <span className="dim">{r.home ? 'vs' : '@'}</span>
        <TeamLogo tid={r.opp} size={24} decorative />
        <span className="ellipsis">{opp.name}</span>
      </span>
      <span className="td-lead-main">
        {hero && <Avatar p={hero} />}
        <span className="grow">
          <span className="td-lead-head">{story?.head ?? plainHead(league, r)}</span>
          {(story?.dek || pog) && <span className="td-lead-dek">{story?.dek ?? pog?.text}</span>}
        </span>
      </span>
      {!!story?.means.length && (
        <span className="td-lead-means">
          {story.means.slice(0, 3).map((m) => (
            <span key={m} className="tag">
              {m}
            </span>
          ))}
        </span>
      )}
    </Link>
  );
}

/**
 * His season at a glance: the last five results (newest on the right, as a form guide reads), the
 * run he's on, where he stands in his conference with the playoff odds, and the owner's and fans'
 * pulse. The standings and the schedule are a tap away.
 */
export function YourSeason({ league }: { league: League }) {
  const me = league.userTid;
  const conf = league.teams[me].conf;
  const results = useLeagueMemo(() => lastResults(league, 5), [league]);
  const row = useLeagueMemo(() => (league.phase === 'regular' ? confStandings(league, conf).find((r) => r.tid === me) : undefined), [league, conf, me]);
  const fc = useForecast(league);
  const odds = fc?.teams[me];
  const run = runOf(results);
  const played = !!row && row.won + row.lost > 0;
  const confName = conf === 'E' ? 'East' : 'West';
  return (
    <Section
      title="Your season"
      right={
        <Link className="card-link" to={league.phase === 'regular' ? '/league' : '/games'}>
          {league.phase === 'regular' ? 'Standings' : 'Schedule'} <ChevronRight size={14} aria-hidden="true" />
        </Link>
      }
    >
      {results.length > 0 && (
        <div className="td-form">
          <ol className="td-form-l" aria-label="Last results, oldest first">
            {[...results].reverse().map((r) => (
              <li key={r.gid}>
                <Link
                  to={`/game/${r.gid}`}
                  className="td-form-g"
                  aria-label={`${r.won ? 'Won' : 'Lost'} ${scoreText(r)} ${r.home ? 'versus' : 'at'} ${league.teams[r.opp].abbrev}`}
                >
                  <span className={`td-wl ${r.won ? 'w' : 'l'}`} aria-hidden="true">
                    {r.won ? 'W' : 'L'}
                  </span>
                  <span className="td-form-o" aria-hidden="true">
                    {r.home ? '' : '@'}
                    {league.teams[r.opp].abbrev}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          {run && run.n >= 2 && (
            <span className={`td-run ${run.won ? 'good' : 'bad'}`}>
              {run.won ? 'Won' : 'Lost'} {run.n} straight
            </span>
          )}
        </div>
      )}
      {played && row && (
        <div className="td-stand">
          <span className="num td-stand-rank">
            {row.confRank}
            <small>{ordinalSuffix(row.confRank)}</small>
          </span>
          <span className="grow">
            in the {confName}
            {row.gb > 0 && <span className="dim"> · {row.gb.toFixed(1)} GB</span>}
          </span>
          {odds && <span className="td-stand-odds">{odds.out ? 'Out of the playoffs' : `Playoff odds ${pct(odds.reach[0], odds.clinched)}`}</span>}
        </div>
      )}
      <CoachPulse league={league} />
    </Section>
  );
}

/** The league's top two or three headlines from the last week (other teams' stories), each opening its page. */
export function Headlines({ league }: { league: League }) {
  const items = useLeagueMemo(() => leagueHeadlines(league, 3), [league]);
  if (!items.length) return null;
  return (
    <Section
      title="Around the league"
      right={
        <Link className="card-link" to="/league/news">
          News <ChevronRight size={14} aria-hidden="true" />
        </Link>
      }
    >
      <div className="list td-flat">
        {items.map((n) => (
          <Link key={n.id} to={storyLink(n.id)} className="td-hl">
            <span className="td-hl-over">
              {NEWS_LABEL[n.kind] ?? 'News'} · {fmtDate(n.season, n.day)}
            </span>
            <span className="td-hl-head">{headOf(n)}</span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

/** The way back to the latest "While you were away", until the next sim. */
export function DigestLink() {
  const digest = useStore((s) => s.digest);
  const open = useStore((s) => s.showDigest);
  if (!digest) return null;
  return (
    <button type="button" className="td-away" aria-haspopup="dialog" onClick={() => open(true)}>
      <Newspaper size={18} aria-hidden="true" />
      <span className="grow">
        <span className="td-away-t">While you were away</span>
        <span className="td-away-l">
          {digest.span} · {digestLine(digest)}
        </span>
      </span>
      <ChevronRight size={18} className="dim" aria-hidden="true" />
    </button>
  );
}
