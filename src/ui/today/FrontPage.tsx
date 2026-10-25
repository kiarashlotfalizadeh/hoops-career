// Today's front page pieces: the lead (the user's last result while it's fresh, or the top story
// about his team), the hero when there's no game today; his season as one strip of figures (the
// postseason odds, the last five, the owner's and the fans' pulse); the news in two headlines; and the
// way back to "While you were away". The numbers behind each are one tap down (the report, the
// standings, the story's page, Office → Owner).
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League, NewsItem } from '../../core/types';
import { useLeagueMemo, useStore } from '../../state/store';
import { confStandings } from '../../core/league/standings';
import { fmtDate } from '../../core/league/helpers';
import { pct } from '../../core/analysis/odds';
import { Avatar, Section, Statline } from '../components/ui';
import { madeAtt } from '../../core/format';
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
    // a story about the team: the black headline on the paper is the poster
    return (
      <Link to={storyLink(n.id)} className={`td-lead td-story w${n.weight ?? 1}`} aria-label={`${headOf(n)}. Read the story`}>
        <span className="td-lead-over over">
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
  return <ResultPoster league={league} lead={lead} />;
}

/** The figures under a result's headline, from the game's box: how it shot, from three, the bench, the biggest lead. */
function resultFigures(league: League, gid: number) {
  const g = league.games.find((x) => x.gid === gid);
  if (!g) return null;
  const us = g.home.tid === league.userTid ? g.home : g.away;
  const t = us.t;
  return [
    { k: 'FG%', v: t.fga ? ((t.fgm / t.fga) * 100).toFixed(1) : '—' },
    { k: '3P', v: madeAtt(t.tpm, t.tpa) },
    { k: 'Bench pts', v: String(us.extra.bench) },
    { k: 'Biggest lead', v: String(us.extra.biggestLead) },
  ];
}

/**
 * The last result as a poster: the score on your team's slab (yours on the left, theirs on the
 * right, the loser's figure a step back), by how much under it; then the press's headline on the
 * paper, its line, and the box score's figures under an ink rule. All of it opens the report.
 */
function ResultPoster({ league, lead }: { league: League; lead: Extract<Lead, { kind: 'result' }> }) {
  const { r, story, pog } = lead;
  const opp = league.teams[r.opp];
  const me = league.teams[league.userTid];
  const dek = story?.dek ?? pog?.text;
  const figs = useLeagueMemo(() => resultFigures(league, r.gid), [league, r.gid]);
  const ot = r.ot > 0 ? `${r.ot > 1 ? r.ot : ''}OT` : '';
  const by = Math.abs(r.us - r.them);
  const over = [story?.kicker, ...(story?.means.slice(0, 1) ?? [])].filter(Boolean).join(' · ');
  return (
    <Link
      to={`/game/${r.gid}`}
      className={`td-lead td-result ${r.won ? 'won' : 'lost'}`}
      aria-label={`${r.won ? 'Won' : 'Lost'} ${scoreText(r)} ${r.home ? 'versus' : 'at'} ${opp.name}. ${story?.head ?? ''} Game report`}
    >
      <span className="slab td-score" aria-hidden="true">
        <span className="td-score-over">
          <span>
            Final{ot && `/${ot}`} · {fmtDate(league.season, r.day, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <span className="td-lead-go">
            Report <ChevronRight size={14} />
          </span>
        </span>
        <span className="td-score-figs">
          <span className={`td-score-n ${r.won ? '' : 'lo'}`}>{r.us}</span>
          <span className={`td-score-n them ${r.won ? 'lo' : ''}`}>{r.them}</span>
        </span>
        <span className="td-score-foot">
          <span className="td-score-tm">{me.name}</span>
          <span className="td-score-by">
            {r.won ? 'Won' : 'Lost'} by {by}
          </span>
          <span className="td-score-tm them">
            {r.home ? 'vs' : 'at'} {opp.name}
          </span>
        </span>
      </span>
      {over && <span className="td-lead-kick over">{over}</span>}
      <span className="td-lead-head">{story?.head ?? plainHead(league, r)}</span>
      {dek && <span className="td-lead-dek">{dek}</span>}
      {figs && <Statline items={figs} />}
    </Link>
  );
}

const MOOD_WORD = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * His season in one strip of figures, each opening where it lives in full: the postseason odds (the
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
          // (the figure counts a play-in place too: the postseason's odds, not the playoffs', short enough for the cell)
          <Link to="/league" className="td-cell" aria-label={odds.out ? 'Out of the postseason. Standings' : `Postseason odds ${pct(odds.reach[0], odds.clinched)}. Standings`}>
            <span className="td-cell-k">Postseason</span>
            <span className={`num td-cell-v ${odds.out ? 'bad' : ''}`}>{odds.out ? 'Out' : pct(odds.reach[0], odds.clinched)}</span>
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
            <span className="td-cell-k">Last {results.length}</span>
            <span className="td-cell-v td-form" aria-hidden="true">
              {[...results].reverse().map((r) => (
                <span key={r.gid} className={r.won ? 'w' : 'l'}>
                  {r.won ? 'W' : 'L'}
                </span>
              ))}
            </span>
          </Link>
        )}
        {!league.fired && (
          <>
            <Link to="/office/owner" className="td-cell" aria-label={`The owner is ${pulse.owner.word}. Owner`}>
              <span className="td-cell-k">
                Owner <TrendMark trend={pulse.owner.trend} />
              </span>
              <span className={`td-cell-v td-word tone-${pulse.owner.tone}`}>{MOOD_WORD(pulse.owner.word)}</span>
            </Link>
            <Link to="/office/owner" className="td-cell" aria-label={`The fans are ${pulse.fans.word}. Owner`}>
              <span className="td-cell-k">
                Fans <TrendMark trend={pulse.fans.trend} />
              </span>
              <span className={`td-cell-v td-word tone-${pulse.fans.tone}`}>{MOOD_WORD(pulse.fans.word)}</span>
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
      <div className="card flush list td-news">
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
