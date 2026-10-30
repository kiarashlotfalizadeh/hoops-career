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
import { goalChance, goalWord } from '../../core/league/ownerGoals';
import { Avatar, Section, Statline, keep } from '../components/ui';
import { madeAtt } from '../../core/format';
import { seasonLabel } from '../../core/constants';
import { curTeamSeason } from '../../core/league/helpers';
import { reviewPath, seasonReviewOf } from '../../core/league/legacy';
import { endText, gradeWord } from '../../core/league/legacyReview';
import { cupTables } from '../../core/league/cup';
import { allStarPhase, allStarRead, allStarResults, seasonEndLine } from './occasions';
import { TrendMark, usePulse } from '../office/Pulse';
import { useForecast } from '../useForecast';
import { headOf, lastResults, leadOf, leagueHeadlines, runOf, scoreText, storyLink, type Result } from './front';
import { digestLine } from './digest';
import { tenureOf } from '../../core/league/media/tenure';
import '../league/legacy.css';

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
 * of the game), otherwise the top story about the user's team from the last two weeks, unless his
 * last game is newer than it by more than a few days (see leadOf).
 */
export function useLead(league: League) {
  return useLeagueMemo(() => {
    const lead = leadOf(league);
    if (lead?.kind === 'result') return { ...lead, pog: lead.story ? null : pogLine(league, lead.r.gid) };
    return lead;
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
        <span className="td-lead-head">{keep(headOf(n))}</span>
        {n.head && (
          <span className="td-lead-by">
            {p && <Avatar p={p} />}
            <span className="td-lead-dek">{keep(n.text)}</span>
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
      {over && <span className="td-lead-kick over">{keep(over)}</span>}
      <span className="td-lead-head">{keep(story?.head ?? plainHead(league, r))}</span>
      {dek && <span className="td-lead-dek">{keep(dek)}</span>}
      {figs && <Statline items={figs} />}
    </Link>
  );
}

const MOOD_WORD = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * His season in one strip, each cell opening where it lives in full: his chance at the postseason goal
 * in a word (the standings), the last five results (the schedule), the owner's and the fans' mood (Office →
 * Owner). Where he stands and his record are on the top bar.
 */
export function YourSeason({ league }: { league: League }) {
  const me = league.userTid;
  const conf = league.teams[me].conf;
  const results = useLeagueMemo(() => lastResults(league, 5), [league]);
  const row = useLeagueMemo(() => (league.phase === 'regular' ? confStandings(league, conf).find((r) => r.tid === me) : undefined), [league, conf, me]);
  const fc = useForecast(league);
  const odds = fc?.teams[me];
  const chance = odds ? goalChance(league, odds) : null;
  const pulse = usePulse(league);
  const cup = useCupCell(league);
  const played = !!row && row.won + row.lost > 0;
  const run = runOf(results);
  return (
    <Section title="Your season">
      <div className="td-strip">
        {played && odds && chance && (
          // (the chance at the owner's postseason goal while he has one, named by it: "Play-in: In reach")
          <Link to="/league" className="td-cell" aria-label={odds.out ? 'Out of the postseason. Standings' : `${chance.label}: ${goalWord(chance.p, chance.sure)}. Standings`}>
            <span className="td-cell-k">{chance.label}</span>
            <span className={`td-cell-v td-word ${odds.out ? 'bad' : ''}`}>{odds.out ? 'Out' : goalWord(chance.p, chance.sure)}</span>
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
            <Link to="/office/owner" className="td-cell" aria-label={`Owner: ${pulse.owner.word}. Owner`}>
              <span className="td-cell-k">
                Owner <TrendMark trend={pulse.owner.trend} />
              </span>
              <span className={`td-cell-v td-word tone-${pulse.owner.tone}`}>{MOOD_WORD(pulse.owner.word)}</span>
            </Link>
            {/* while the Cup runs, its cell takes the fans' place (they're on Office → Owner) */}
            {cup ? (
              <Link to="/league/cup" className="td-cell" aria-label={`${cup.label}. The Cup`}>
                <span className="td-cell-k">Cup</span>
                <span className="td-cell-v">{cup.v}</span>
              </Link>
            ) : (
              <Link to="/office/owner" className="td-cell" aria-label={`The fans are ${pulse.fans.word}. Owner`}>
                <span className="td-cell-k">
                  Fans <TrendMark trend={pulse.fans.trend} />
                </span>
                <span className={`td-cell-v td-word tone-${pulse.fans.tone}`}>{MOOD_WORD(pulse.fans.word)}</span>
              </Link>
            )}
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

/**
 * The season's end as a ceremony, Today's hero from the night his season is over until the draft:
 * how it ended and the record against opening night's pick, then, once the Finals are done, the
 * owner's word and the season's best (its best win, its best player, its breakout, its records and
 * honors), with the full review a tap away. Before the Finals end, the honors so far and when the
 * verdict comes.
 */
export function SeasonEndHero({ league }: { league: League }) {
  const me = league.userTid;
  const ts = curTeamSeason(league, me);
  const review = seasonReviewOf(league, league.season);
  const verdict = league.ownerReviews?.find((r) => r.season === league.season && r.tid === me);
  const pre = league.media?.preseason;
  const picked = pre?.season === league.season ? pre.rows.find((r) => r.tid === me) : undefined;
  const end = useLeagueMemo(() => seasonEndLine(league), [league]);
  // the season's best, from the review (kept for good), or its honors so far
  const best = review
    ? [
        review.best && `Best win: ${review.best.line}`,
        review.star && `Player of the season: ${review.star.name}, ${review.star.line}`,
        review.breakout && `Breakout: ${review.breakout.name}, ${review.breakout.from} → ${review.breakout.to} OVR`,
        review.records[0],
        ...review.honors.slice(0, 2),
      ].filter((x): x is string => !!x)
    : Object.values(league.players)
        .filter((p) => p.tid === me)
        .flatMap((p) =>
          p.awards
            .filter(
              (a) => a.season === league.season && ['MVP', 'Defensive Player of the Year', 'Rookie of the Year', 'Sixth Man of the Year', 'Most Improved Player'].includes(a.type),
            )
            .map((a) => `${p.firstName} ${p.lastName}: ${a.type}`),
        );
  return (
    <section className="slab td-phase td-end" aria-label="The season's end">
      <div className="td-score-over">
        <span>
          {seasonLabel(league.season)} · {review ? 'Season review' : 'Season over'}
        </span>
        {review ? (
          <Link to={reviewPath(league.season)} className="card-link">
            Review <ChevronRight size={14} aria-hidden="true" />
          </Link>
        ) : (
          <Link to="/league/playoffs" className="card-link">
            Bracket <ChevronRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
      <h2 className="td-phase-t">{endText({ round: ts.playoffRound })}</h2>
      <p className="td-phase-l">
        <span className="num">
          {ts.won}-{ts.lost}
        </span>
        {' · '}
        {end}
        {picked ? ` Picked for ${picked.wins} wins.` : ''}
      </p>
      <div className="td-phase-goals">
        <div className="td-phase-gk">
          <span className="grow">{verdict ? `The owner: ${gradeWord(verdict.grade)}` : 'The verdict'}</span>
          {league.phase === 'draftLottery' && (
            <Link to="/office/draft" className="card-link">
              Draft board <ChevronRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
        {verdict ? verdict.said && <p className="td-end-said">“{verdict.said}”</p> : <p className="td-phase-gn">The owner gives his verdict when the Finals end.</p>}
        {best.length > 0 && (
          <ul className="td-phase-gl td-end-best">
            {best.slice(0, 4).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * All-Star weekend as a chapter, Today's hero over the break: on its eve the staff's read of who of
 * his is in line (the vote as it stands tonight: a read, not the result), then the weekend's results
 * until his next game.
 */
export function AllStarHero({ league }: { league: League }) {
  const phase = allStarPhase(league);
  const read = useLeagueMemo(() => (phase === 'eve' ? allStarRead(league) : []), [league, phase]);
  const results = useLeagueMemo(() => (phase === 'after' ? allStarResults(league) : null), [league, phase]);
  if (!phase) return null;
  const date = fmtDate(league.season, league.allStarDay, { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <section className="slab td-phase td-allstar" aria-label="All-Star weekend">
      <div className="td-score-over">
        <span>All-Star weekend · {date}</span>
        <Link to="/league/awards" className="card-link">
          Awards <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <h2 className="td-phase-t">{phase === 'eve' ? 'All-Star weekend' : (results?.head ?? 'All-Star weekend')}</h2>
      <p className="td-phase-l">
        {phase === 'eve'
          ? `${league.day < league.allStarDay ? 'Tomorrow' : 'Today'}: the All-Stars named, the Three-Point Contest, the Slam Dunk Contest and the game.`
          : (results?.lines[0] ?? '')}
      </p>
      <div className="td-phase-goals">
        <div className="td-phase-gk">
          <span className="grow">{phase === 'eve' ? "The staff's read, as the vote stands" : 'The weekend'}</span>
        </div>
        {phase === 'eve' ? (
          read.length ? (
            <ul className="td-phase-gl">
              {read.map((r) => (
                <li key={r.p.pid}>
                  {r.p.firstName} {r.p.lastName}: {r.status === 'in' ? 'in line' : 'on the bubble'}
                </li>
              ))}
            </ul>
          ) : (
            <p className="td-phase-gn">None of yours is in line this year.</p>
          )
        ) : (
          <ul className="td-phase-gl">
            {(results?.lines.slice(1) ?? []).map((x) => (
              <li key={x}>{x}</li>
            ))}
            {results?.mine.map((p) => (
              <li key={p.pid}>
                {p.firstName} {p.lastName}: All-Star
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** The NBA Cup as a cell of the season's strip while it runs: his group record and place, then his knockout round. */
export function useCupCell(league: League): { v: string; label: string } | null {
  return useLeagueMemo(() => {
    const cup = league.cup;
    const me = league.userTid;
    if (!cup || cup.season !== league.season || cup.champion !== undefined || league.phase !== 'regular') return null;
    if (cup.seeds) {
      const alive = cup.bracket.filter((t) => t.high === me || t.low === me);
      const live = alive.find((t) => t.winner === undefined);
      if (!live) return null;
      const round = live.round === 'final' ? 'Final' : live.round === 'sf' ? 'Semis' : 'QF';
      return { v: round, label: `NBA Cup: in the ${live.round === 'final' ? 'final' : live.round === 'sf' ? 'semifinals' : 'quarterfinals'}` };
    }
    const t = cupTables(league).find((x) => x.group.tids.includes(me));
    const row = t?.rows.find((r) => r.tid === me);
    if (!t || !row) return null;
    return { v: `${row.won}-${row.lost}`, label: `NBA Cup group ${t.group.id}: ${row.won}-${row.lost}, ${row.rank} of ${t.rows.length}` };
  }, [league]);
}

/**
 * The weight of time, in the preseason: how long he has had the team and what the years added up to
 * ("Year 7 with the Thunder · Two titles, one Finals loss. Defending champions."), his titles here as
 * banners; in year one, the franchise's past (see media/tenure.ts). Nothing when there's nothing to say.
 */
export function TenureKicker({ league }: { league: League }) {
  const t = useLeagueMemo(() => tenureOf(league), [league]);
  if (!t) return null;
  return (
    <section className="td-tenure" aria-label={t.over}>
      <p className="over">{t.over}</p>
      <p className="small">{t.line}</p>
      {t.banners.length > 0 && (
        <div className="chips">
          {t.banners.map((s) => (
            <span key={s} className="tag td-tenure-b">
              {seasonLabel(s)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
