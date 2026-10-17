import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Crown, Landmark, Trophy } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { RETIRED } from '../../core/types';
import { useLeague, useLeagueMemo } from '../../state/store';
import { seasonLabel } from '../../core/constants';
import { TeamLogo } from '../components/TeamLogo';
import { Avatar, Chips, Ovr, PageHeader, Section, Statline } from '../components/ui';
import { AccoladeChips, OutcomeTag, TabBar, accoladeScore, careerTotals, ordinal, seasonOutcome, seasonTeam, useQueryParam } from '../league/shared';
import { rosterNames } from '../stats';
import { RecordBook } from '../league/RecordBook';
import { RetiredBanners } from '../league/RetiredBanners';
import { CoachesView, winPctLabel } from '../league/Coaches';
import { slabVars } from '../teamColors';

type View = 'franchise' | 'league' | 'records' | 'coaches' | 'hof';

export default function History() {
  const league = useLeague();
  const [view, setView] = useQueryParam<View>('view', 'franchise', ['franchise', 'league', 'records', 'coaches', 'hof']);
  return (
    <main className="page lg-page">
      <PageHeader title="History" sub={`${league.name} · since ${seasonLabel(league.startSeason)}`} back />
      <TabBar
        label="History sections"
        value={view}
        onChange={setView}
        options={[
          { id: 'franchise', label: 'Franchise' },
          { id: 'league', label: 'League' },
          { id: 'records', label: 'Records' },
          { id: 'coaches', label: 'Coaches' },
          { id: 'hof', label: 'Hall of Fame' },
        ]}
      />
      {view === 'franchise' && <Franchise league={league} />}
      {view === 'league' && <LeagueHistory league={league} />}
      {view === 'records' && <RecordBook league={league} />}
      {view === 'coaches' && <CoachesView league={league} />}
      {view === 'hof' && <HallOfFame league={league} />}
    </main>
  );
}

// ---------------------------------------------------------------- franchise

type LeaderKey = 'pts' | 'reb' | 'ast' | 'gp';

function Franchise({ league }: { league: League }) {
  const [tidStr, setTidStr] = useQueryParam<string>('tid', String(league.userTid));
  const tid = league.teams[Number(tidStr)] ? Number(tidStr) : league.userTid;
  const [cat, setCat] = useState<LeaderKey>('pts');
  const team = league.teams[tid];
  const seasons = [...team.seasons].sort((a, b) => b.season - a.season);
  const finished = seasons.filter((s) => s.season < league.season || !['preseason', 'regular'].includes(league.phase));
  const w = seasons.reduce((a, s) => a + s.won, 0);
  const l = seasons.reduce((a, s) => a + s.lost, 0);
  const titles = seasons.filter((s) => s.playoffRound === 5);
  const apps = finished.filter((s) => s.playoffRound >= 1).length;
  // a 3-0 start isn't a best season: only seasons of 20+ games count
  const best = [...seasons].filter((s) => s.won + s.lost >= 20).sort((a, b) => b.won / (b.won + b.lost) - a.won / (a.won + a.lost))[0];

  const leaders = useLeagueMemo(() => {
    const rows: { p: Player; pts: number; reb: number; ast: number; gp: number; seasons: number }[] = [];
    for (const p of Object.values(league.players)) {
      const t = careerTotals(p, tid);
      if (t.gp === 0) continue;
      rows.push({ p, pts: t.pts, reb: t.reb, ast: t.ast, gp: t.gp, seasons: t.seasons.size });
    }
    return rows;
  }, [league, tid]);
  const top = [...leaders].sort((a, b) => b[cat] - a[cat]).slice(0, 8);
  // teammates who share a last name read "Jal. Williams" / "Jay. Williams", as on the roster
  const name = rosterNames(
    top.map((r) => r.p),
    { initial: true },
  );

  return (
    <>
      <section className="slab lg-fr" style={slabVars(team.colors) as CSSProperties}>
        <span className="slab-mark">
          <TeamLogo tid={tid} size={190} decorative />
        </span>
        <div className="lg-fr-top">
          <TeamLogo tid={tid} size={48} decorative />
          <div className="grow">
            <div className="lg-team-region">{team.region}</div>
            <div className="lg-fr-name">{team.name}</div>
          </div>
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
        {/* (wraps: on a narrow phone the coach's name was cut) */}
        <div className="lg-fr-coach">{tid === league.userTid ? `Your franchise · Coach ${league.coachName}` : `Coach ${team.coach.name}`}</div>
        <div className="lg-fr-figs">
          <Statline
            items={[
              { k: 'Seasons', v: seasons.length, s: best ? `Best ${best.won}-${best.lost}` : undefined },
              // ".634", as a coach's record reads (the Coaches view)
              { k: 'Record', v: `${w}-${l}`, s: w + l ? winPctLabel(w, l) : undefined },
              { k: 'Playoffs', v: apps },
              { k: 'Titles', v: titles.length },
            ]}
          />
        </div>
      </section>
      {titles.length > 0 && (
        <Section
          title={
            <h3>
              <Trophy size={13} aria-hidden="true" /> Championship banners
            </h3>
          }
        >
          <div className="chips">
            {titles.map((s) => (
              <span key={s.season} className="tag lg-gold lg-title-yr">
                {seasonLabel(s.season)}
              </span>
            ))}
          </div>
        </Section>
      )}
      {(team.retired?.length ?? 0) > 0 && (
        <Section title="Retired numbers">
          <RetiredBanners league={league} tid={tid} />
        </Section>
      )}
      <div className="md-grid2">
        <Section title="Season by season">
          <div className="card flush list">
            {seasons.map((s) => (
              <div key={s.season} className="lg-season">
                <span className="yr">{seasonLabel(s.season)}</span>
                <span className="rec">
                  {s.won}-{s.lost}
                </span>
                <span className="sd ellipsis">{s.seed ? `${ordinal(s.seed)} seed` : s.season === league.season && s.won + s.lost === 0 ? 'Not started' : ''}</span>
                <OutcomeTag o={seasonOutcome(league, tid, s)} />
              </div>
            ))}
          </div>
        </Section>
        <Section title="Franchise leaders">
          <Chips
            label="Franchise leaders in"
            value={cat}
            onChange={setCat}
            options={[
              { id: 'pts', label: 'Points' },
              { id: 'reb', label: 'Rebounds' },
              { id: 'ast', label: 'Assists' },
              { id: 'gp', label: 'Games' },
            ]}
          />
          {top.length === 0 ? (
            <div className="card empty">No games recorded yet.</div>
          ) : (
            <div className="card flush list">
              {top.map((r, i) => (
                <Link key={r.p.pid} to={`/player/${r.p.pid}`} className="lg-book-row">
                  <span className="rk">{i + 1}</span>
                  {/* a long name pushes his seasons onto a line of their own rather than cutting them off */}
                  <span className="who">
                    <span className="nm">{name(r.p.pid)}</span>
                    <span className="sub">
                      {r.seasons} season{r.seasons === 1 ? '' : 's'}
                      {r.p.tid === tid ? ' · active' : r.p.tid === RETIRED ? ' · retired' : ''}
                    </span>
                  </span>
                  <span className="v num">{Math.round(r[cat]).toLocaleString()}</span>
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- league

function LeagueHistory({ league }: { league: League }) {
  const list = [...league.awards]
    .filter((a) => a.champion !== undefined || a.mvp !== undefined || a.cupWinner !== undefined || a.saturday !== undefined)
    .sort((a, b) => b.season - a.season);
  if (!list.length) {
    return (
      <div className="card lg-blank">
        <Landmark size={26} aria-hidden="true" />
        <h3>History starts here</h3>
        <p>Champions, Cup winners, MVPs and Finals MVPs are kept here as each season plays out.</p>
      </div>
    );
  }
  const name = (pid?: number) => (pid !== undefined && league.players[pid] ? league.players[pid] : undefined);
  // a team taken over later won its earlier titles under another coach
  const tenure = league.tenureStart ?? league.startSeason;
  return (
    <div className="md-grid2">
      {list.map((a) => {
        const rows: { k: string; tid?: number; p?: Player }[] = [
          { k: 'Finals MVP', p: name(a.finalsMvp) },
          { k: 'MVP', p: name(a.mvp) },
          { k: 'DPOY', p: name(a.dpoy) },
          { k: 'ROY', p: name(a.roy) },
        ];
        return (
          <Section
            key={a.season}
            title={seasonLabel(a.season)}
            right={a.champion === league.userTid && a.season >= tenure ? <span className="tag lg-gold">Your title</span> : undefined}
          >
            <div className="card flush list">
              {a.champion !== undefined ? (
                <Link to={`/team/${a.champion}`} className="lg-champ-row">
                  <TeamLogo tid={a.champion} size={42} decorative />
                  <span className="grow">
                    <span className="lg-champ-k">
                      <Trophy size={11} aria-hidden="true" /> Champion
                    </span>
                    <span className="nm">
                      {league.teams[a.champion].region} {league.teams[a.champion].name}
                    </span>
                    {a.runnerUp !== undefined && (
                      <span className="sub">
                        def. {league.teams[a.runnerUp].region} {league.teams[a.runnerUp].name}
                      </span>
                    )}
                  </span>
                </Link>
              ) : (
                <div className="lg-champ-row pending">
                  {a.season === league.season && (league.phase === 'regular' || league.phase === 'preseason') ? 'Season in progress' : 'Playoffs in progress'}
                </div>
              )}
              {a.cupWinner !== undefined && (
                <Link to={`/team/${a.cupWinner}`} className="lg-hist-row">
                  <span className="k">NBA Cup</span>
                  <span className="v">
                    <span className="bold ellipsis">{league.teams[a.cupWinner].name}</span>
                    <TeamLogo tid={a.cupWinner} size={18} decorative />
                  </span>
                </Link>
              )}
              {rows
                .filter((r) => r.p)
                .map((r) => {
                  const p = r.p!;
                  const tid = seasonTeam(league, p, a.season) ?? undefined;
                  return (
                    <Link key={r.k} to={`/player/${p.pid}`} className="lg-hist-row">
                      <span className="k">{r.k}</span>
                      <span className="v">
                        <span className="bold ellipsis">
                          {p.firstName} {p.lastName}
                        </span>
                        {tid !== undefined && <TeamLogo tid={tid} size={18} />}
                      </span>
                    </Link>
                  );
                })}
              {a.saturday?.three[0] && <ContestRow league={league} k="3-Point" e={a.saturday.three[0]} />}
              {a.saturday?.dunk[0] && <ContestRow league={league} k="Slam Dunk" e={a.saturday.dunk[0]} />}
            </div>
          </Section>
        );
      })}
    </div>
  );
}

/** An All-Star Saturday winner, by his name and team that day (linked while he's still in the save). */
function ContestRow({ league, k, e }: { league: League; k: string; e: { pid: number; name: string; tid: number } }) {
  const inner = (
    <>
      <span className="k">{k}</span>
      <span className="v">
        <span className="bold ellipsis">{e.name}</span>
        <TeamLogo tid={e.tid} size={18} />
      </span>
    </>
  );
  return league.players[e.pid] ? (
    <Link to={`/player/${e.pid}`} className="lg-hist-row">
      {inner}
    </Link>
  ) : (
    <div className="lg-hist-row">{inner}</div>
  );
}

// ---------------------------------------------------------------- hall of fame

/**
 * Is a retiree worth remembering, and how much: honours won in this league (a single All-Star
 * Saturday contest isn't enough on its own), or a long or productive career. Imported veterans have
 * only their last real seasons on record, so their years in the NBA and those seasons' win shares
 * count too.
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
  return (
    <>
      <Section
        title={
          <h3>
            <Crown size={13} aria-hidden="true" /> Hall of Fame
          </h3>
        }
        right={<span className="lg-sec-meta">{hof.length} inducted</span>}
      >
        {hof.length === 0 ? (
          <div className="card empty">No one yet. Legends go in when they retire with enough MVPs, All-NBA and All-Star nods and titles.</div>
        ) : (
          <div className="card flush list wide2">
            {hof.map((p) => (
              <LegendRow key={p.pid} league={league} p={p} hof />
            ))}
          </div>
        )}
      </Section>
      <Section
        title="Notable retirements"
        right={
          <span className="lg-sec-meta">
            {retired.length} player{retired.length === 1 ? '' : 's'}
          </span>
        }
      >
        {retired.length === 0 ? (
          <div className="card empty">Decorated and long-serving players land here when they retire.</div>
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
    </>
  );
}

function LegendRow({ league, p, hof }: { league: League; p: Player; hof?: boolean }) {
  const c = careerTotals(p);
  const peak = Math.max(p.ovr, ...p.ratingsHistory.map((r) => r.ovr));
  // a draft year the seed doesn't know (LeBron's predates its draft pages): count back his NBA seasons
  const from = p.draft.year > 0 ? p.draft.year + 1 : Math.min((p.retiredSeason ?? league.season) - p.experience, ...c.seasons);
  // imported veterans' records start with the seed's real seasons, not their rookie year
  const tracked = c.seasons.size ? Math.min(...c.seasons) : from;
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
        </span>
        <span className="line num">
          {(
            [
              [c.gp ? (c.pts / c.gp).toFixed(1) : '—', 'ppg'],
              [c.gp ? (c.reb / c.gp).toFixed(1) : '—', 'rpg'],
              [c.gp ? (c.ast / c.gp).toFixed(1) : '—', 'apg'],
              [Math.round(c.pts).toLocaleString(), 'pts'],
            ] as const
          ).map(([v, k]) => (
            <span key={k}>
              <b>{v}</b> {k}
            </span>
          ))}
        </span>
        <AccoladeChips p={p} />
      </span>
      <span className="lg-legend-r">
        <Ovr v={peak} size="sm" />
        {mainTid !== undefined && <TeamLogo tid={mainTid} size={22} />}
      </span>
    </Link>
  );
}
