// League → History (/league/history): the seasons and their champions (the user's titles marked),
// each franchise's history (?tid=, his seasons with it marked), the record book, the Hall of Fame
// and the coaches (his row marked). A season's winners in full are on the
// Awards tab; this is the league's memory.
import { Fragment, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Crown } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { RETIRED } from '../../core/types';
import { useLeague, useLeagueMemo } from '../../state/store';
import { seasonLabel } from '../../core/constants';
import { TeamLogo } from '../components/TeamLogo';
import { Avatar, Ovr, Section } from '../components/ui';
import { ViewChips } from '../league/Views';
import { AccoladeChips, Poster, TitleSlab, accoladeScore, careerTotals, shortName, useQueryParam, useSetParams } from '../league/shared';
import { RecordBook } from '../league/RecordBook';
import { CoachesView } from '../league/Coaches';
import { FranchiseFigures, FranchiseHistory } from '../league/Franchise';
import { slabVars } from '../teamColors';
import { careerOnRecord } from '../../core/analysis/milestones';
import { coachCareer, userCoach } from '../../core/league/coaches';

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
  const setParams = useSetParams();
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
  if (!list.length) {
    return <Poster over="Seasons" head="No champions yet" dek="Each season's champion and MVPs land here." />;
  }
  const name = (pid?: number) => (pid !== undefined && league.players[pid] ? shortName(league.players[pid]) : undefined);
  // the poster: the last champions, in their colours (the season's whole story is a tap away, on Awards)
  const last = list.find((a) => a.champion !== undefined);
  const titles = last ? list.filter((a) => a.champion === last.champion).length : 0;
  return (
    <>
      {last?.champion !== undefined && (
        <TitleSlab
          league={league}
          tid={last.champion}
          over={`${seasonLabel(last.season)} champions${mine.has(last.season) ? ' · your title' : ''}`}
          // (their count of titles here, once there's more than the one this slab is about)
          fig={titles > 1 ? titles : undefined}
          figLabel={titles > 1 ? 'titles in this league' : undefined}
        >
          {last.runnerUp !== undefined ? `def. ${league.teams[last.runnerUp].name}` : ''}
          {name(last.finalsMvp) ? `${last.runnerUp !== undefined ? ' · ' : ''}Finals MVP ${name(last.finalsMvp)}` : ''}
        </TitleSlab>
      )}
      <div className="card flush list">
        {list.map((a) => {
          const champ = a.champion !== undefined ? league.teams[a.champion] : undefined;
          const winners = [
            name(a.mvp) && `MVP ${name(a.mvp)}`,
            name(a.finalsMvp) && `Finals MVP ${name(a.finalsMvp)}`,
            a.cupWinner !== undefined && `Cup ${league.teams[a.cupWinner].abbrev}`,
          ].filter(Boolean);
          return (
            <Link key={a.season} to={`/league/awards?aseason=${a.season}`} className={`lg-yr-row ${mine.has(a.season) ? 'me' : ''}`}>
              <span className="yr">{seasonLabel(a.season)}</span>
              {champ ? <TeamLogo tid={champ.tid} size={34} decorative /> : <span className="lg-yr-none" />}
              <span className="lg-yr-t">
                <span className="nm ellipsis">
                  {champ ? champ.name : a.season === league.season ? 'In progress' : 'No champion'}
                  {champ && a.runnerUp !== undefined && <span className="dim"> def. {league.teams[a.runnerUp].abbrev}</span>}
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
    </>
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
        fig={{ v: hof.length, k: 'inducted' }}
      />
      {hof.length > 0 && (
        <div className="card flush list wide2">
          {hof.map((p) => (
            <LegendRow key={p.pid} league={league} p={p} hof />
          ))}
        </div>
      )}
      <Section title="Notable retirements" right={<span className="lg-sec-meta">{retired.length}</span>}>
        {retired.length === 0 ? (
          <div className="card empty">None yet.</div>
        ) : (
          <>
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
          </>
        )}
      </Section>
      {hof.length + retired.length > 0 && <div className="lg-note">Regular-season careers, figures per game; the badge is his peak OVR; every honour on his page.</div>}
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
  return (
    <Link to={`/player/${p.pid}`} className="lg-legend-row">
      <Avatar p={{ ...p, tid: mainTid ?? -1 }} />
      <span className="lg-legend-t">
        <span className="nm">
          <span className="ellipsis">
            {p.firstName} {p.lastName}
          </span>
          {hof && <Crown size={14} className="lg-crown" aria-label="Hall of Famer" />}
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
        <AccoladeChips p={p} max={2} />
      </span>
      <span className="lg-legend-r">
        <Ovr v={peak} size="sm" />
        {mainTid !== undefined && <TeamLogo tid={mainTid} size={22} />}
      </span>
    </Link>
  );
}
