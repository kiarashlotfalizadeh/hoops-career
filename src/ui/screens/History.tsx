// League → History (/league/history): the seasons and their champions (the user's titles marked),
// each a page of its own (?season=: its champion, its stories as the league's memory kept them, its
// playoff bracket, its standings, its scoring, rebounding and assist leaders, its winners, his
// season), each franchise's history (?tid=, his seasons with it marked), the record book, the Hall
// of Fame and the coaches (his row marked). A season's winners in full are on the Awards tab; this
// is the league's memory.
import { Fragment, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Crown } from 'lucide-react';
import type { League, Player, PlayoffSeries } from '../../core/types';
import { RETIRED } from '../../core/types';
import { useLeague, useLeagueMemo } from '../../state/store';
import { seasonLabel } from '../../core/constants';
import { TeamLogo } from '../components/TeamLogo';
import { Avatar, Ovr, Section } from '../components/ui';
import { ViewChips } from '../league/Views';
import { Poster, accolades, TitleSlab, accoladeScore, careerTotals, confName, confOrder, shortName, useQueryParam, useSetParams } from '../league/shared';
import { RecordBook } from '../league/RecordBook';
import { CoachesView } from '../league/Coaches';
import { FranchiseFigures, FranchiseHistory } from '../league/Franchise';
import { slabVars } from '../teamColors';
import { careerOnRecord } from '../../core/analysis/milestones';
import { coachCareer, userCoach } from '../../core/league/coaches';
import { chronicleOf } from '../../core/league/media/chronicle';
import { franchiseTitles } from '../../core/league/media/past';
import { reviewPath, seasonReviewOf } from '../../core/league/legacy';
import { endText } from '../../core/league/legacyReview';
import { fmtDate, seasonTotals } from '../../core/league/helpers';
import { qualifies } from '../../core/league/records';
import { Bracket, FinalsCard, seriesSlots } from '../league/PlayoffsTab';
import { keepFigures } from '../../core/format';
import { KIND_ONE } from '../league/news/kinds';
import '../league/news/news.css';
import '../league/legacy.css';

type View = 'seasons' | 'franchise' | 'records' | 'hof' | 'coaches';
const VIEWS: { id: View; label: string }[] = [
  { id: 'seasons', label: 'Seasons' },
  { id: 'franchise', label: 'Teams' },
  { id: 'records', label: 'Records' },
  { id: 'hof', label: 'Hall of Fame' },
  { id: 'coaches', label: 'Coaches' },
];

export default function History() {
  const league = useLeague();
  const [raw] = useQueryParam<string>('view', '');
  const [tidStr] = useQueryParam<string>('tid', '');
  const [coach] = useQueryParam<string>('coach', '');
  const [seasonStr] = useQueryParam<string>('season', '');
  const setParams = useSetParams();
  // a past season opens as its own page (?season=): its champion, its stories, its awards, your season
  const season = Number(seasonStr);
  if (seasonStr && league.awards.some((a) => a.season === season)) return <SeasonPage league={league} season={season} />;
  // a link to a franchise (?tid=) or a coach (?coach=) opens its view; "league" was the seasons' old name
  const view: View = raw === 'league' ? 'seasons' : VIEWS.some((v) => v.id === raw) ? (raw as View) : tidStr ? 'franchise' : coach ? 'coaches' : 'seasons';
  return (
    <>
      <ViewChips label="History" value={view} onChange={(v) => setParams({ view: v === 'seasons' ? null : v, tid: null, coach: null, rec: null, book: null })} options={VIEWS} />
      {view === 'seasons' && <Seasons league={league} />}
      {view === 'franchise' && <Franchise league={league} />}
      {view === 'records' && <RecordBook league={league} />}
      {view === 'hof' && <HallOfFame league={league} />}
      {view === 'coaches' && <CoachesView league={league} />}
    </>
  );
}

// ---------------------------------------------------------------- seasons

/** Every season that has a champion (or its winners named): who won it, whom they beat, the MVPs. Its awards in full on the Awards tab. */
function Seasons({ league }: { league: League }) {
  const list = [...league.awards].filter((a) => a.champion !== undefined || a.mvp !== undefined || a.cupWinner !== undefined).sort((a, b) => b.season - a.season);
  // the user's titles, whichever team he won them with (a team taken over later won its earlier titles under another coach)
  const mine = useLeagueMemo(() => {
    const me = userCoach(league);
    return new Set(
      me
        ? coachCareer(league, me, new Map())
            .lines.filter((l) => l.round === 5)
            .map((l) => l.season)
        : [],
    );
  }, [league]);
  const past = league.past;
  if (!list.length && !past) {
    return <Poster over="Seasons" head="No champions yet" dek="Each season's champion and MVPs land here." />;
  }
  const name = (pid?: number) => (pid !== undefined && league.players[pid] ? shortName(league.players[pid]) : undefined);
  // the poster: the last champions, in their colours (the season's whole story is a tap away, on Awards)
  const last = list.find((a) => a.champion !== undefined);
  // (with the NBA's past, a franchise's titles in all; otherwise this league's)
  const titles = last?.champion !== undefined ? (past ? franchiseTitles(league, last.champion, last.season + 1).n : list.filter((a) => a.champion === last.champion).length) : 0;
  const titlesLabel = past ? 'titles' : 'titles in this league';
  const reigning = !last && past ? past.finals.at(-1) : undefined;
  return (
    <>
      {last?.champion !== undefined && (
        <TitleSlab
          league={league}
          tid={last.champion}
          over={`${seasonLabel(last.season)} champions${mine.has(last.season) ? ' · your title' : ''}`}
          // (their count of titles, once there's more than the one this slab is about)
          fig={titles > 1 ? titles : undefined}
          figLabel={titles > 1 ? titlesLabel : undefined}
        >
          {last.runnerUp !== undefined ? `def. ${league.teams[last.runnerUp].name}` : ''}
          {name(last.finalsMvp) ? `${last.runnerUp !== undefined ? ' · ' : ''}Finals MVP ${name(last.finalsMvp)}` : ''}
        </TitleSlab>
      )}
      {/* the league's first season: the real champions defend their title */}
      {reigning && reigning[1] >= 0 && (
        <TitleSlab
          league={league}
          tid={reigning[1]}
          over={`${seasonLabel(reigning[0])} champions · defending`}
          fig={franchiseTitles(league, reigning[1]).n > 1 ? franchiseTitles(league, reigning[1]).n : undefined}
          figLabel="titles"
        >
          {reigning[2] >= 0 ? keepFigures(`def. ${league.teams[reigning[2]].name} ${reigning[3]}-${reigning[4]}`) : ''}
          {reigning[5] ? ` · Finals MVP ${reigning[5]}` : ''}
        </TitleSlab>
      )}
      {list.length > 0 && (
        <div className="card flush list">
          {list.map((a) => {
            const champ = a.champion !== undefined ? league.teams[a.champion] : undefined;
            const winners = [
              name(a.mvp) && `MVP ${name(a.mvp)}`,
              name(a.finalsMvp) && `Finals MVP ${name(a.finalsMvp)}`,
              a.cupWinner !== undefined && `Cup ${league.teams[a.cupWinner].abbrev}`,
            ].filter(Boolean);
            return (
              <Link
                key={a.season}
                to={a.season === league.season && a.champion === undefined ? `/league/awards?aseason=${a.season}` : `/league/history?season=${a.season}`}
                className={`lg-yr-row ${mine.has(a.season) ? 'me' : ''}`}
              >
                <span className="yr">{seasonLabel(a.season)}</span>
                {champ ? <TeamLogo tid={champ.tid} size={34} decorative /> : <span className="lg-yr-none" />}
                <span className="lg-yr-t">
                  <span className="nm ellipsis">
                    {champ ? champ.name : a.season === league.season ? 'In progress' : 'No champion'}
                    {champ && a.runnerUp !== undefined && (
                      <span className="dim">
                        {' '}
                        def. {league.teams[a.runnerUp].abbrev}
                        {finalsScore(league, a.season, champ.tid) && ` ${finalsScore(league, a.season, champ.tid)}`}
                      </span>
                    )}
                    {mine.has(a.season) && <span className="tag lg-gold lg-yr-you">Your title</span>}
                  </span>
                  {/* each award whole, wrapping between them rather than cutting a name short */}
                  {winners.length > 0 && (
                    <span className="sub">
                      {/* (the separator outside the unbreakable award: a line can break after it) */}
                      {winners.map((w, i) => (
                        <Fragment key={i}>
                          {i > 0 ? ' · ' : ''}
                          <span className="nowrap">{w}</span>
                        </Fragment>
                      ))}
                    </span>
                  )}
                </span>
                <ChevronRight size={16} className="dim" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      )}
      {past && <PastSeasons league={league} />}
    </>
  );
}

/** Past seasons shown before "Show all": the last ten. */
const PAST_SHOWN = 10;

/**
 * The NBA before this league (League.past): every Finals since 1947, newest first, with the Finals
 * MVP and the MVP. Rows don't open (the league keeps no more of those seasons); the last ten, then
 * all on a tap.
 */
function PastSeasons({ league }: { league: League }) {
  const [all, setAll] = useState(false);
  const past = league.past!;
  const rows = [...past.finals].reverse();
  const mvp = new Map(past.mvps);
  return (
    <Section title="Before this league" right={<span className="lg-sec-meta">Since {seasonLabel(past.finals[0][0])}</span>}>
      <div className="card flush list">
        {rows.slice(0, all ? rows.length : PAST_SHOWN).map(([season, champ, runner, w, l, fmvp, champAs, runnerAs]) => {
          const t = champ >= 0 ? league.teams[champ] : undefined;
          // (by the name they won it under: "Seattle SuperSonics")
          const nm = champAs ?? t?.name ?? '';
          const opp = runnerAs ?? (runner >= 0 ? league.teams[runner].name : '');
          const winners = [fmvp && `Finals MVP ${fmvp}`, mvp.get(season) && `MVP ${mvp.get(season)}`].filter(Boolean);
          return (
            <div key={season} className="lg-yr-row lg-yr-past">
              <span className="yr">{seasonLabel(season)}</span>
              {t ? <TeamLogo tid={t.tid} size={34} decorative /> : <span className="lg-yr-none" />}
              <span className="lg-yr-t">
                <span className="nm">
                  {nm}
                  {opp && (
                    <span className="dim">
                      {' '}
                      def. {opp} {w}-{l}
                    </span>
                  )}
                </span>
                {winners.length > 0 && (
                  <span className="sub">
                    {winners.map((x, i) => (
                      <Fragment key={i}>
                        {i > 0 ? ' · ' : ''}
                        <span className="nowrap">{x}</span>
                      </Fragment>
                    ))}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {!all && rows.length > PAST_SHOWN && (
        <button className="btn sm ghost lg-showmore" onClick={() => setAll(true)}>
          <ChevronDown size={15} /> All {rows.length} champions
        </button>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- a season's page

/**
 * A past season as a page: its champion on a slab, its stories as the league's memory kept them
 * (League.chronicle: its biggest headlines, its farewells, each opening while the news still has it),
 * its winners, and the user's season with its review. Year 5 reads its own story, not year 1's.
 */
function SeasonPage({ league, season }: { league: League; season: number }) {
  const setParams = useSetParams();
  const a = league.awards.find((x) => x.season === season)!;
  const c = chronicleOf(league, season);
  const onFile = useLeagueMemo(() => new Set(league.news.map((n) => n.id)), [league]);
  const name = (pid?: number) => (pid !== undefined && league.players[pid] ? `${league.players[pid].firstName} ${league.players[pid].lastName}` : undefined);
  const winners: [string, string][] = [];
  for (const [k, v] of [
    ['MVP', name(a.mvp)],
    ['Finals MVP', name(a.finalsMvp)],
    ['Defensive Player of the Year', name(a.dpoy)],
    ['Rookie of the Year', name(a.roy)],
    ['NBA Cup', a.cupWinner !== undefined ? `${league.teams[a.cupWinner].region} ${league.teams[a.cupWinner].name}` : undefined],
  ] as const)
    if (v) winners.push([k, v]);
  const me = userCoach(league);
  const line = me ? coachCareer(league, me, new Map()).lines.find((l) => l.season === season) : undefined;
  const review = seasonReviewOf(league, season);
  // (with the NBA's past, a franchise's titles in all to that season; otherwise this league's)
  const titles =
    a.champion === undefined
      ? 0
      : league.past
        ? franchiseTitles(league, a.champion, season + 1).n
        : league.awards.filter((x) => x.champion === a.champion && x.season <= season).length;
  const stories = c?.stories ?? [];
  const score = a.champion !== undefined ? finalsScore(league, season, a.champion) : undefined;
  return (
    <>
      <div className="lg-season-top">
        <button type="button" className="card-link" onClick={() => setParams({ season: null })}>
          <ChevronLeft size={14} aria-hidden="true" /> All seasons
        </button>
      </div>
      {a.champion !== undefined ? (
        <TitleSlab
          league={league}
          tid={a.champion}
          over={`${seasonLabel(season)} champions`}
          fig={titles > 1 ? titles : undefined}
          figLabel={titles > 1 ? (league.past ? 'titles' : 'titles in this league') : undefined}
        >
          {a.runnerUp !== undefined ? keepFigures(`def. ${league.teams[a.runnerUp].name}${score ? ` ${score}` : ''}`) : ''}
        </TitleSlab>
      ) : (
        <Poster over={seasonLabel(season)} head="No champion" />
      )}
      <Section title="The season's stories" right={<span className="lg-sec-meta">{stories.length}</span>}>
        {stories.length ? (
          <div className="card lg-chron">
            <div className="lg-fp-hls">
              {stories.map((x) => {
                // (the story's own team: its first, whoever the user is)
                const tid = x.tids[0];
                const body = (
                  <>
                    <span className="lg-fp-hl-head">{x.head}</span>
                    <span className="lg-fp-hl-meta">
                      {tid !== undefined && league.teams[tid] && <TeamLogo tid={tid} size={16} decorative />}
                      {KIND_ONE[x.kind]} · {fmtDate(season, x.day)}
                    </span>
                  </>
                );
                return onFile.has(x.id) ? (
                  <Link key={x.id} to={`/league/news?story=${x.id}`} className={`lg-fp-hl ${x.weight === 3 ? 'strong' : ''}`}>
                    {body}
                  </Link>
                ) : (
                  <div key={x.id} className={`lg-fp-hl ${x.weight === 3 ? 'strong' : ''}`}>
                    {body}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="card empty">No stories were kept from this season.</div>
        )}
      </Section>
      <SeasonPlayoffs league={league} season={season} />
      <SeasonStandings league={league} season={season} />
      <SeasonLeaders league={league} season={season} />
      {winners.length > 0 && (
        <Section
          title="Winners"
          right={
            <Link to={`/league/awards?aseason=${season}`} className="card-link">
              All awards <ChevronRight size={14} aria-hidden="true" />
            </Link>
          }
        >
          <div className="card flush list">
            {winners.map(([k, v]) => (
              <div key={k} className="lg-season-win">
                <span className="dim">{k}</span>
                <span className="bold">{v}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
      {line && (
        <Section title="Your season">
          <Link to={review ? reviewPath(season) : `/league/history?tid=${line.tid}`} className="card lg-season-you">
            <TeamLogo tid={line.tid} size={30} decorative />
            <span className="grow">
              <span className="bold">
                {line.won}-{line.lost} with the {league.teams[line.tid].name}
              </span>
              <span className="sub">{endText({ round: line.round ?? -1 })}</span>
            </span>
            <span className="card-link">
              {review ? 'Review' : 'Franchise'} <ChevronRight size={14} aria-hidden="true" />
            </span>
          </Link>
        </Section>
      )}
    </>
  );
}

/** The champion's Finals in games ("4-2"), from the chronicle's series (the playoffs while they're on). */
function finalsScore(league: League, season: number, champ: number): string | undefined {
  const f = seasonSeries(league, season).find((s) => s.round === 4);
  if (!f) return undefined;
  const [w, l] = f.high === champ ? [f.highWins, f.lowWins] : [f.lowWins, f.highWins];
  return `${w}-${l}`;
}

/**
 * A season's playoff series as the bracket draws them: the playoffs while they're on, then the
 * chronicle's (kept in the order they were drawn: each round's East, then West, the Finals last), each
 * team with its seed that season.
 */
function seasonSeries(league: League, season: number): PlayoffSeries[] {
  if (season === league.season && league.playoffs.length) return league.playoffs;
  const seedOf = (tid: number) => league.teams[tid]?.seasons.find((x) => x.season === season)?.seed ?? 0;
  const at = new Map<string, number>();
  return (chronicleOf(league, season)?.series ?? []).map(([round, high, low, highWins, lowWins]) => {
    const conf = round === 4 ? 'F' : (league.teams[high]?.conf ?? 'E');
    const key = `${conf}${round}`;
    const i = at.get(key) ?? 0;
    at.set(key, i + 1);
    const done = Math.max(highWins, lowWins) >= 4;
    return {
      id: `${key}-${i}`,
      round,
      conf,
      high,
      low,
      highSeed: seedOf(high),
      lowSeed: seedOf(low),
      highWins,
      lowWins,
      ...(done ? { winner: highWins > lowWins ? high : low } : {}),
    };
  });
}

/** A past season's bracket: both conferences (one at a time on a phone, as on Playoffs) and the Finals. */
function SeasonPlayoffs({ league, season }: { league: League; season: number }) {
  const userConf = league.teams[league.userTid].conf;
  const [conf, setConf] = useQueryParam<'E' | 'W'>('conf', userConf, ['E', 'W']);
  const series = useLeagueMemo(() => seasonSeries(league, season), [league, season]);
  if (!series.some((s) => s.round === 1)) return null;
  return (
    <>
      <div className="bk-only-narrow">
        <ViewChips
          label="Conference"
          value={conf}
          onChange={setConf}
          options={[
            { id: 'E', label: 'East' },
            { id: 'W', label: 'West' },
          ]}
        />
      </div>
      <div className="bk-panel-wrap">
        {confOrder(conf).map((c) => (
          <div key={c} className={`bk-conf bk-${c} ${c !== conf ? 'bk-hide-narrow' : ''}`}>
            <Section title={`${confName(c)} playoffs`}>
              <div className="card bk-card">
                <Bracket league={league} slots={seriesSlots(series, c)} />
              </div>
            </Section>
          </div>
        ))}
      </div>
      <FinalsCard league={league} finals={series.find((s) => s.round === 4)} />
    </>
  );
}

/** A season's standings from each team's stored season, both conferences side by side (best record first, the playoff teams marked). */
function SeasonStandings({ league, season }: { league: League; season: number }) {
  const rows = useLeagueMemo(
    () =>
      league.teams
        .map((t) => ({ t, s: t.seasons.find((x) => x.season === season) }))
        .filter((r): r is { t: (typeof league.teams)[number]; s: NonNullable<typeof r.s> } => !!r.s && r.s.won + r.s.lost > 0)
        .sort((a, b) => b.s.won / (b.s.won + b.s.lost) - a.s.won / (a.s.won + a.s.lost) || (a.s.seed ?? 99) - (b.s.seed ?? 99)),
    [league, season],
  );
  if (!rows.length) return null;
  return (
    <Section title="Standings">
      <div className="card lg-st2">
        {(['E', 'W'] as const).map((c) => (
          <div key={c} className="lg-st2-col" role="table" aria-label={`${confName(c)}ern Conference standings`}>
            <div className="lg-st2-h" role="row">
              <span role="columnheader">{confName(c)}</span>
              <span role="columnheader">W-L</span>
            </div>
            {rows
              .filter((r) => r.t.conf === c)
              .map((r, i) => (
                <div key={r.t.tid} role="row" className={`lg-st2-row ${r.s.playoffRound >= 1 ? '' : 'out'} ${r.t.tid === league.userTid ? 'me' : ''}`}>
                  <span role="cell" className="rk">
                    {i + 1}
                  </span>
                  <span role="cell" className="nm">
                    <TeamLogo tid={r.t.tid} size={16} decorative />
                    {r.t.abbrev}
                  </span>
                  <span role="cell" className="wl num">
                    {r.s.won}-{r.s.lost}
                  </span>
                </div>
              ))}
          </div>
        ))}
      </div>
      <div className="lg-note">Teams that missed the playoffs are dimmed.</div>
    </Section>
  );
}

const LEAD_STATS = [
  ['pts', 'Points'],
  ['reb', 'Rebounds'],
  ['ast', 'Assists'],
] as const;

/** A season's per-game leaders in points, rebounds and assists (the regular season; qualified as the league's leaders are, see records.ts qualifies). */
function SeasonLeaders({ league, season }: { league: League; season: number }) {
  const leaders = useLeagueMemo(() => {
    const games = (tid: number) => {
      const s = league.teams[tid]?.seasons.find((x) => x.season === season);
      return s ? s.won + s.lost : 82;
    };
    const rows: { p: Player; tid: number; pts: number; reb: number; ast: number }[] = [];
    for (const p of Object.values(league.players)) {
      const lines = p.stats.filter((s) => !s.real && !s.playoffs && s.season === season && s.gp > 0);
      if (!lines.length) continue;
      const s = lines.length === 1 ? lines[0] : seasonTotals(p, season, false);
      if (!s || !qualifies(s, 'ppg', Math.max(...lines.map((x) => games(x.tid))), false)) continue;
      rows.push({ p, tid: lines[lines.length - 1].tid, pts: s.pts / s.gp, reb: (s.orb + s.drb) / s.gp, ast: s.ast / s.gp });
    }
    return LEAD_STATS.map(([k, label]) => ({ k, label, top: [...rows].sort((a, b) => b[k] - a[k])[0] })).filter((x) => !!x.top);
  }, [league, season]);
  if (!leaders.length) return null;
  return (
    <Section title="Leaders" right={<span className="lg-sec-meta">Per game</span>}>
      <div className="card flush list">
        {leaders.map(({ k, label, top }) => (
          <Link key={k} to={`/player/${top.p.pid}`} className="lg-rec">
            <span className="k">{label}</span>
            <span className="who">
              <span className="nm">
                <TeamLogo tid={top.tid} size={16} decorative />
                <span className="ellipsis">{shortName(top.p)}</span>
              </span>
            </span>
            <span className="v num">{top[k].toFixed(1)}</span>
            <ChevronRight size={15} className="dim" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- franchise

function Franchise({ league }: { league: League }) {
  const [tidStr, setTidStr] = useQueryParam<string>('tid', String(league.userTid));
  const tid = league.teams[Number(tidStr)] ? Number(tidStr) : league.userTid;
  const team = league.teams[tid];
  return (
    <>
      <section className="slab lg-fr" style={slabVars(team.colors) as CSSProperties}>
        <div className="lg-fr-top">
          <p className="over lg-title-over">Franchise history</p>
          <select className="lg-select" value={tid} onChange={(e) => setTidStr(e.target.value)} aria-label="Team">
            {[...league.teams]
              .sort((a, b) => a.abbrev.localeCompare(b.abbrev))
              .map((t) => (
                <option key={t.tid} value={t.tid}>
                  {t.abbrev}
                </option>
              ))}
          </select>
        </div>
        <div className="lg-fr-id">
          <TeamLogo tid={tid} size={52} decorative />
          <div className="grow">
            <div className="lg-team-region">{team.region}</div>
            <div className="lg-fr-name">{team.name}</div>
          </div>
        </div>
        <div className="lg-fr-figs">
          <FranchiseFigures league={league} tid={tid} onSlab />
        </div>
      </section>
      <FranchiseHistory league={league} tid={tid} />
    </>
  );
}

// ---------------------------------------------------------------- hall of fame

/**
 * Is a retiree worth remembering, and how much: honours won in this league (a single All-Star
 * Saturday contest isn't enough on its own), or a long or productive career. Real veterans' win
 * shares are those of the seasons on record (the whole career, in a league seeded with them; else
 * the last three before it), so their years in the NBA count too.
 */
function careerValue(p: Player) {
  const c = careerTotals(p);
  const ws = p.stats.reduce((s, x) => s + (!x.playoffs && x.adv ? x.adv.ws : 0), 0);
  const honours = accoladeScore(p);
  const notable = honours >= 0.5 || p.experience >= 12 || c.gp >= 600 || c.pts >= 10000 || ws >= 15;
  return { notable, score: honours + c.pts / 2000 + p.experience / 3 + ws / 4 };
}

function HallOfFame({ league }: { league: League }) {
  const [limit, setLimit] = useState(25);
  const { hof, retired } = useLeagueMemo(() => {
    const all = Object.values(league.players);
    const hof = all.filter((p) => p.hof).sort((a, b) => (b.retiredSeason ?? 0) - (a.retiredSeason ?? 0) || accoladeScore(b) - accoladeScore(a));
    const value = new Map(all.filter((p) => p.tid === RETIRED && !p.hof).map((p) => [p, careerValue(p)] as const));
    const retired = [...value.entries()]
      .filter(([, v]) => v.notable)
      .sort(([a, va], [b, vb]) => (b.retiredSeason ?? 0) - (a.retiredSeason ?? 0) || vb.score - va.score)
      .map(([p]) => p);
    return { hof, retired };
  }, [league]);
  const latest = hof[0];
  return (
    <>
      <Poster
        over={`Hall of Fame · ${league.startSeason < league.season ? `since ${seasonLabel(league.startSeason)}` : 'this league'}`}
        head={latest ? `Latest in: ${latest.firstName} ${latest.lastName}` : 'Nobody inducted yet'}
        dek={latest ? undefined : 'Legends go in when they retire.'}
        // (a count of none would only repeat the headline)
        fig={hof.length ? { v: hof.length, k: 'inducted' } : undefined}
      />
      {hof.length > 0 && (
        <div className="card flush list wide2">
          {hof.map((p) => (
            <LegendRow key={p.pid} league={league} p={p} hof />
          ))}
        </div>
      )}
      {/* (no section until someone has retired: an empty one would only say so) */}
      {retired.length > 0 && (
        <Section title="Notable retirements" right={<span className="lg-sec-meta">{retired.length}</span>}>
          <div className="card flush list wide2">
            {retired.slice(0, limit).map((p) => (
              <LegendRow key={p.pid} league={league} p={p} />
            ))}
          </div>
          {retired.length > limit && (
            <button className="btn sm ghost lg-showmore" onClick={() => setLimit(limit + 25)}>
              <ChevronDown size={15} /> Show more ({retired.length - limit})
            </button>
          )}
        </Section>
      )}
      {hof.length + retired.length > 0 && <div className="lg-note">Regular-season careers, per game · the badge is his peak OVR here</div>}
    </>
  );
}

function LegendRow({ league, p, hof }: { league: League; p: Player; hof?: boolean }) {
  const c = careerTotals(p);
  const peak = Math.max(p.ovr, ...p.ratingsHistory.map((r) => r.ovr));
  // his record starts with his first season when it's all there (a draftee who stayed overseas came
  // later); a real veteran's in a league seeded with only his last three seasons starts with those
  const first = c.seasons.size ? Math.min(...c.seasons) : undefined;
  // otherwise from his draft, or a draft the seed doesn't know: count back his NBA seasons
  const from =
    first !== undefined && careerOnRecord(league, p) ? first : p.draft.year > 0 ? p.draft.year + 1 : Math.min((p.retiredSeason ?? league.season) - p.experience, ...c.seasons);
  const tracked = first ?? from;
  // Most-played team for the jersey and the mark
  const byTeam = new Map<number, number>();
  for (const s of p.stats) if (!s.playoffs && typeof s.tid === 'number' && league.teams[s.tid]) byTeam.set(s.tid, (byTeam.get(s.tid) ?? 0) + s.gp);
  const mainTid = [...byTeam.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  // the number he wore there (LeBron's 23 in Cleveland, not the 32 his last stop handed him)
  const jersey = (mainTid !== undefined && (league.teams[mainTid].retired?.find((r) => r.pid === p.pid)?.jersey ?? p.jerseys?.[mainTid])) || p.jersey;
  // his peak OVR only when he played his prime here: a veteran who came with the league peaked before it
  const showPeak = !p.stats.some((s) => s.real);
  // his biggest honour beside his name (every one is on his page)
  const top = accolades(p)[0];
  return (
    <Link to={`/player/${p.pid}`} className="lg-legend-row">
      <Avatar p={{ ...p, tid: mainTid ?? -1, jersey }} />
      <span className="lg-legend-t">
        <span className="nm">
          <span className="ellipsis">
            {p.firstName} {p.lastName}
          </span>
          {hof && <Crown size={14} className="lg-crown" aria-label="Hall of Famer" />}
          {top && (
            <span className={`tag ${top.gold ? 'lg-gold' : ''}`}>
              {top.n > 1 ? `${top.n}× ` : ''}
              {top.label}
            </span>
          )}
        </span>
        <span className="sub">
          {p.pos} · {seasonLabel(from).slice(0, 4)}–{p.retiredSeason ? String(p.retiredSeason).slice(2) : 'now'} · {c.gp.toLocaleString('en-US')} game{c.gp === 1 ? '' : 's'}
          {tracked > from ? ` since ${seasonLabel(tracked)}` : ''}
          <span className="sr-only">, {Math.round(c.pts).toLocaleString('en-US')} points</span>
        </span>
        <span className="line num">
          {(
            [
              [c.gp ? (c.pts / c.gp).toFixed(1) : '—', 'PTS'],
              [c.gp ? (c.reb / c.gp).toFixed(1) : '—', 'REB'],
              [c.gp ? (c.ast / c.gp).toFixed(1) : '—', 'AST'],
            ] as const
          ).map(([v, k]) => (
            <span key={k}>
              <b>{v}</b> {k}
            </span>
          ))}
        </span>
      </span>
      <span className="lg-legend-r">
        {showPeak && <Ovr v={peak} size="sm" />}
        {mainTid !== undefined && <TeamLogo tid={mainTid} size={22} />}
      </span>
    </Link>
  );
}
