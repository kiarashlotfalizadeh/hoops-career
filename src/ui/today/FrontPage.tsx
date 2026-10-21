// Today's front page pieces: the lead (the user's last result while it's fresh, or the top story
// about his team), the hero when there's no game today; his season as one strip of figures (the
// playoff odds, the last five, the owner's and the fans' pulse); the news in two headlines; and the
// way back to "While you were away". The numbers behind each are one tap down (the report, the
// standings, the story's page, Office → Owner).
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League, NewsItem } from '../../core/types';
import { useLeagueMemo, useStore } from '../../state/store';
import { confStandings } from '../../core/league/standings';
import { fmtDate } from '../../core/league/helpers';
import { pct } from '../../core/analysis/odds';
import { Avatar, Section } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { TrendMark, usePulse } from '../office/Pulse';
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
export function useLead(league: League) {
  return useLeagueMemo(() => {
    const fresh = freshResult(league);
    if (fresh) return { kind: 'result' as const, ...fresh, pog: fresh.story ? null : pogLine(league, fresh.r.gid) };
    const n = topStory(league);
    return n ? { kind: 'story' as const, n } : null;
  }, [league]);
}
export type Lead = NonNullable<ReturnType<typeof useLead>>;

export function LeadStory({ league, lead }: { league: League; lead: Lead }) {
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
          <span className="td-lead-go">
            Story <ChevronRight size={14} aria-hidden="true" />
          </span>
        </span>
        <span className="td-lead-head">{headOf(n)}</span>
        {n.head && (
          <span className="td-lead-by">
            {p && <Avatar p={p} />}
            <span className="td-lead-dek">{n.text}</span>
          </span>
        )}
      </Link>
    );
  }
  const { r, story, pog } = lead;
  const hero = story?.hero !== undefined ? league.players[story.hero] : pog ? league.players[pog.pid] : undefined;
  const opp = league.teams[r.opp];
  const dek = story?.dek ?? pog?.text;
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
      {/* the score as the scoreboard has it: ours first, the winning side's figure in full ink */}
      <span className="td-lead-score">
        <span className="num td-lead-pts">
          <span className={r.won ? '' : 'td-lead-lose'}>{r.us}</span>
          <span className="td-lead-dash">-</span>
          <span className={r.won ? 'td-lead-lose' : ''}>{r.them}</span>
          {r.ot > 0 && <small>{r.ot > 1 ? r.ot : ''}OT</small>}
        </span>
        <span className="td-lead-vs">
          <span className={`td-lead-wl ${r.won ? 'good' : 'bad'}`}>{r.won ? 'Won' : 'Lost'}</span>
          <span className="td-lead-opp">
            {r.home ? 'vs' : 'at'} <TeamLogo tid={r.opp} size={18} decorative /> <span className="ellipsis">{opp.name}</span>
          </span>
        </span>
      </span>
      <span className="td-lead-head">{story?.head ?? plainHead(league, r)}</span>
      {dek && (
        <span className="td-lead-by">
          {hero && <Avatar p={hero} />}
          <span className="td-lead-dek">{dek}</span>
        </span>
      )}
      {!!story?.means.length && (
        <span className="td-lead-means">
          {story.means.slice(0, 2).map((m) => (
            <span key={m} className="tag">
              {m}
            </span>
          ))}
        </span>
      )}
    </Link>
  );
}

const MOOD_WORD = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * His season in one strip of figures, each opening where it lives in full: the playoff odds (the
 * standings), the last five results (the schedule), the owner's and the fans' mood (Office →
 * Owner). Where he stands and his record are on the top bar.
 */
export function YourSeason({ league }: { league: League }) {
  const me = league.userTid;
  const conf = league.teams[me].conf;
  const results = useLeagueMemo(() => lastResults(league, 5), [league]);
  const row = useLeagueMemo(() => (league.phase === 'regular' ? confStandings(league, conf).find((r) => r.tid === me) : undefined), [league, conf, me]);
  const fc = useForecast(league);
  const odds = fc?.teams[me];
  const pulse = usePulse(league);
  const played = !!row && row.won + row.lost > 0;
  const run = runOf(results);
  return (
    <Section title="Your season">
      <div className="td-strip">
        {played && odds && (
          <Link to="/league" className="td-cell" aria-label={odds.out ? 'Out of the playoffs. Standings' : `Playoff odds ${pct(odds.reach[0], odds.clinched)}. Standings`}>
            <span className={`num td-cell-v ${odds.out ? 'bad' : ''}`}>{odds.out ? 'Out' : pct(odds.reach[0], odds.clinched)}</span>
            <span className="td-cell-k">{odds.out ? 'Of the playoffs' : 'Playoff odds'}</span>
          </Link>
        )}
        {results.length > 0 && (
          <Link
            to="/games"
            className="td-cell"
            aria-label={`Last ${results.length}, oldest first: ${[...results]
              .reverse()
              .map((r) => `${r.won ? 'won' : 'lost'} ${scoreText(r)} ${r.home ? 'versus' : 'at'} ${league.teams[r.opp].abbrev}`)
              .join(', ')}${run && run.n >= 2 ? `. ${run.won ? 'Won' : 'Lost'} ${run.n} straight` : ''}. Schedule`}
          >
            <span className="td-cell-v td-form" aria-hidden="true">
              {[...results].reverse().map((r) => (
                <span key={r.gid} className={r.won ? 'w' : 'l'}>
                  {r.won ? 'W' : 'L'}
                </span>
              ))}
            </span>
            <span className="td-cell-k">Last {results.length}</span>
          </Link>
        )}
        {!league.fired && (
          <>
            <Link to="/office/owner" className="td-cell" aria-label={`The owner is ${pulse.owner.word}. Owner`}>
              <span className={`td-cell-v td-word tone-${pulse.owner.tone}`}>{MOOD_WORD(pulse.owner.word)}</span>
              <span className="td-cell-k">
                Owner <TrendMark trend={pulse.owner.trend} />
              </span>
            </Link>
            <Link to="/office/owner" className="td-cell" aria-label={`The fans are ${pulse.fans.word}. Owner`}>
              <span className={`td-cell-v td-word tone-${pulse.fans.tone}`}>{MOOD_WORD(pulse.fans.word)}</span>
              <span className="td-cell-k">
                Fans <TrendMark trend={pulse.fans.trend} />
              </span>
            </Link>
          </>
        )}
      </div>
    </Section>
  );
}

/** The lead as a headline in the news (the game is the hero today): its kind and date, then its headline. */
function LeadRow({ league, lead }: { league: League; lead: Lead }) {
  if (lead.kind === 'story') {
    const n = lead.n;
    return (
      <Link to={storyLink(n.id)} className="td-hl">
        <span className="td-hl-over">
          {NEWS_LABEL[n.kind] ?? 'Your team'} · {fmtDate(n.season, n.day)}
        </span>
        <span className="td-hl-head">{headOf(n)}</span>
      </Link>
    );
  }
  const { r, story } = lead;
  return (
    <Link to={`/game/${r.gid}`} className="td-hl">
      <span className="td-hl-over">
        Final · <span className={r.won ? 'good' : 'bad'}>{r.won ? 'Won' : 'Lost'}</span> <span className="num">{scoreText(r)}</span> {r.home ? 'vs' : 'at'}{' '}
        {league.teams[r.opp].abbrev}
      </span>
      <span className="td-hl-head">{story?.head ?? plainHead(league, r)}</span>
    </Link>
  );
}

/** The news in two headlines: the lead about his team when the game has the top of Today, then the league's biggest. */
export function Headlines({ league, lead }: { league: League; lead?: Lead | null }) {
  const n = lead ? 1 : 2;
  const items = useLeagueMemo(() => leagueHeadlines(league, n), [league, n]);
  if (!items.length && !lead) return null;
  return (
    <Section
      title="News"
      right={
        <Link className="card-link" to="/league/news">
          All news <ChevronRight size={14} aria-hidden="true" />
        </Link>
      }
    >
      <div className="list td-rows">
        {lead && <LeadRow league={league} lead={lead} />}
        {items.map((x) => (
          <Link key={x.id} to={storyLink(x.id)} className="td-hl">
            <span className="td-hl-over">
              {NEWS_LABEL[x.kind] ?? 'News'} · {fmtDate(x.season, x.day)}
            </span>
            <span className="td-hl-head">{headOf(x)}</span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

/** The way back to the latest "While you were away", until the next sim: a row in Today's More. */
export function DigestRow() {
  const digest = useStore((s) => s.digest);
  const open = useStore((s) => s.showDigest);
  if (!digest) return null;
  return (
    <button type="button" className="td-mrow" aria-haspopup="dialog" onClick={() => open(true)}>
      <span className="grow">
        <span className="td-mrow-k">While you were away</span>
        <span className="td-mrow-m">
          {digest.span} · {digestLine(digest)}
        </span>
      </span>
      <ChevronRight size={18} className="dim" aria-hidden="true" />
    </button>
  );
}
