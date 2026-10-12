import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Crown, Landmark, Trophy } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { RETIRED } from '../../core/types';
import { useLeague, useLeagueMemo } from '../../state/store';
import { seasonLabel } from '../../core/constants';
import { TeamLogo } from '../components/TeamLogo';
import { Avatar, Card, Chips, Empty, Kpi, Ovr, PageHeader, Segmented } from '../components/ui';
import { AccoladeChips, OutcomeTag, SectionLabel, accoladeScore, careerTotals, ordinal, seasonOutcome, seasonTeam, shortName, useQueryParam } from '../league/shared';

type View = 'franchise' | 'league' | 'hof';

export default function History() {
  const league = useLeague();
  const [view, setView] = useQueryParam<View>('view', 'franchise', ['franchise', 'league', 'hof']);
  return (
    <main className="page">
      <PageHeader title="History" sub={`${league.name} · since ${seasonLabel(league.startSeason)}`} back />
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { id: 'franchise', label: 'Franchise' },
          { id: 'league', label: 'League' },
          { id: 'hof', label: 'Hall of Fame' },
        ]}
      />
      {view === 'franchise' && <Franchise league={league} />}
      {view === 'league' && <LeagueHistory league={league} />}
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
  const rec = `${w}-${l}`;
  const titles = seasons.filter((s) => s.playoffRound === 5);
  const apps = finished.filter((s) => s.playoffRound >= 1).length;
  const best = [...seasons].filter((s) => s.won + s.lost > 0).sort((a, b) => b.won / Math.max(1, b.won + b.lost) - a.won / Math.max(1, a.won + a.lost))[0];

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

  return (
    <>
      <div className="row" style={{ gap: 12 }}>
        <TeamLogo tid={tid} size={48} />
        <div className="grow">
          <div className="display bold" style={{ fontSize: 22, textTransform: 'uppercase', lineHeight: 1.05 }}>
            {team.region} {team.name}
          </div>
          <div className="small dim ellipsis">{tid === league.userTid ? `Your franchise · Coach ${league.coachName}` : `Coach ${team.coach.name}`}</div>
        </div>
        <select className="lg-select" value={tid} onChange={(e) => setTidStr(e.target.value)} aria-label="Team" style={{ maxWidth: 96 }}>
          {[...league.teams]
            .sort((a, b) => a.abbrev.localeCompare(b.abbrev))
            .map((t) => (
              <option key={t.tid} value={t.tid}>
                {t.abbrev}
              </option>
            ))}
        </select>
      </div>
      <div className="grid4">
        <Kpi k="Seasons" v={seasons.length} sub={best && best.won + best.lost >= 20 ? `Best ${best.won}-${best.lost}` : undefined} />
        <Kpi
          k="Record"
          // a multi-season record stays on one line in a phone-width tile
          v={<span style={{ fontSize: rec.length > 7 ? 15 : rec.length > 5 ? 17 : 20, whiteSpace: 'nowrap' }}>{rec}</span>}
          sub={w + l ? `${((w / (w + l)) * 100).toFixed(1)}%` : ''}
        />
        <Kpi k="Playoffs" v={apps} />
        <Kpi k="Titles" v={titles.length} color={titles.length ? 'var(--tier-elite)' : undefined} />
      </div>
      {titles.length > 0 && (
        <div className="lg-champ">
          <div className="kicker">
            <Trophy size={12} style={{ verticalAlign: -1 }} /> Championship banners
          </div>
          <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
            {titles.map((s) => (
              <span key={s.season} className="tag lg-gold" style={{ height: 26, fontSize: 12 }}>
                {seasonLabel(s.season)}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="md-grid2" style={{ display: 'grid', gap: 14 }}>
        <div className="col" style={{ gap: 6 }}>
          <SectionLabel>Season by season</SectionLabel>
          <Card className="flush lg-flat">
            {seasons.map((s) => (
              <div key={s.season} className="lg-season">
                <span className="yr">{seasonLabel(s.season)}</span>
                <span className="rec">
                  {s.won}-{s.lost}
                </span>
                <span className="tiny dim ellipsis">{s.seed ? `${ordinal(s.seed)} seed` : s.season === league.season && s.won + s.lost === 0 ? 'Not started' : ''}</span>
                <OutcomeTag o={seasonOutcome(league, tid, s)} />
              </div>
            ))}
          </Card>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <SectionLabel>Franchise leaders</SectionLabel>
          <Card>
            <Chips
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
              <div className="small dim" style={{ marginTop: 12 }}>
                No games recorded yet.
              </div>
            ) : (
              <div className="lg-team5" style={{ marginTop: 10 }}>
                {top.map((r, i) => (
                  <Link key={r.p.pid} to={`/player/${r.p.pid}`} className="row5">
                    <span className="tiny dim bold" style={{ textAlign: 'right' }}>
                      {i + 1}
                    </span>
                    <span className="ellipsis">
                      <span className="bold">{shortName(r.p)}</span>{' '}
                      <span className="tiny dim">
                        {r.seasons} season{r.seasons === 1 ? '' : 's'}
                        {r.p.tid === tid ? ' · active' : r.p.tid === RETIRED ? ' · retired' : ''}
                      </span>
                    </span>
                    <span className="num bold">{Math.round(r[cat]).toLocaleString()}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- league

function LeagueHistory({ league }: { league: League }) {
  const list = [...league.awards].filter((a) => a.champion !== undefined || a.mvp !== undefined || a.cupWinner !== undefined).sort((a, b) => b.season - a.season);
  if (!list.length) {
    return (
      <Card>
        <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 8, padding: '14px 0' }}>
          <Landmark size={30} className="dim" />
          <h3>History starts here</h3>
          <div className="small dim" style={{ maxWidth: 320 }}>
            Champions, NBA Cup winners, MVPs and Finals MVPs are recorded here as each season plays out.
          </div>
        </div>
      </Card>
    );
  }
  const name = (pid?: number) => (pid !== undefined && league.players[pid] ? league.players[pid] : undefined);
  // a team taken over later won its earlier titles under another coach
  const tenure = league.tenureStart ?? league.startSeason;
  return (
    <div className="md-grid2" style={{ display: 'grid', gap: 14 }}>
      {list.map((a) => {
        const rows: { k: string; tid?: number; p?: Player }[] = [
          { k: 'Finals MVP', p: name(a.finalsMvp) },
          { k: 'MVP', p: name(a.mvp) },
          { k: 'DPOY', p: name(a.dpoy) },
          { k: 'ROY', p: name(a.roy) },
        ];
        return (
          <Card
            key={a.season}
            title={seasonLabel(a.season)}
            right={a.champion === league.userTid && a.season >= tenure ? <span className="tag lg-gold">Your title</span> : undefined}
          >
            {a.champion !== undefined ? (
              <Link to={`/team/${a.champion}`} className="row" style={{ gap: 12, marginBottom: 8 }}>
                <TeamLogo tid={a.champion} size={42} />
                <div className="grow">
                  <div className="tiny upper bold" style={{ color: 'var(--tier-elite)', letterSpacing: '0.1em' }}>
                    <Trophy size={11} style={{ verticalAlign: -1 }} /> Champion
                  </div>
                  <div className="bold" style={{ fontSize: 16 }}>
                    {league.teams[a.champion].region} {league.teams[a.champion].name}
                  </div>
                  {a.runnerUp !== undefined && (
                    <div className="tiny dim">
                      def. {league.teams[a.runnerUp].region} {league.teams[a.runnerUp].name}
                    </div>
                  )}
                </div>
              </Link>
            ) : (
              <div className="small dim" style={{ marginBottom: 8 }}>
                {a.season === league.season && (league.phase === 'regular' || league.phase === 'preseason') ? 'Season in progress' : 'Playoffs in progress'}
              </div>
            )}
            {a.cupWinner !== undefined && (
              <Link to={`/team/${a.cupWinner}`} className="lg-hist-row">
                <span className="k">NBA Cup</span>
                <span className="row" style={{ gap: 8, minWidth: 0 }}>
                  <span className="bold ellipsis">{league.teams[a.cupWinner].name}</span>
                  <TeamLogo tid={a.cupWinner} size={18} />
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
                    <span className="row" style={{ gap: 8, minWidth: 0 }}>
                      <span className="bold ellipsis">
                        {p.firstName} {p.lastName}
                      </span>
                      {tid !== undefined && <TeamLogo tid={tid} size={18} />}
                    </span>
                  </Link>
                );
              })}
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- hall of fame

/**
 * Is a retiree worth remembering, and how much: honours won in this league, or a long or productive
 * career. Imported veterans have only their last real seasons on record, so their years in the NBA
 * and those seasons' win shares count too.
 */
function careerValue(p: Player) {
  const c = careerTotals(p);
  const ws = p.stats.reduce((s, x) => s + (!x.playoffs && x.adv ? x.adv.ws : 0), 0);
  const honours = accoladeScore(p);
  const notable = honours > 0 || p.experience >= 12 || c.gp >= 600 || c.pts >= 10000 || ws >= 15;
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
      <SectionLabel right={<span className="tiny dim">{hof.length} inducted</span>}>
        <Crown size={12} style={{ verticalAlign: -1 }} /> Hall of Fame
      </SectionLabel>
      {hof.length === 0 ? (
        <Card>
          <Empty>No one has been inducted yet. Legends are enshrined when they retire with enough MVPs, All-NBA selections, All-Star nods and titles.</Empty>
        </Card>
      ) : (
        <div className="md-grid2" style={{ display: 'grid', gap: 10 }}>
          {hof.map((p) => (
            <LegendCard key={p.pid} league={league} p={p} hof />
          ))}
        </div>
      )}
      <SectionLabel
        right={
          <span className="tiny dim">
            {retired.length} player{retired.length === 1 ? '' : 's'}
          </span>
        }
      >
        Notable retirements
      </SectionLabel>
      {retired.length === 0 ? (
        <Card>
          <Empty>Decorated and long-serving players who retire will be listed here.</Empty>
        </Card>
      ) : (
        <>
          <div className="md-grid2" style={{ display: 'grid', gap: 10 }}>
            {retired.slice(0, limit).map((p) => (
              <LegendCard key={p.pid} league={league} p={p} />
            ))}
          </div>
          {retired.length > limit && (
            <button className="btn sm ghost" style={{ alignSelf: 'center' }} onClick={() => setLimit(limit + 25)}>
              <ChevronDown size={15} /> Show more ({retired.length - limit})
            </button>
          )}
        </>
      )}
    </>
  );
}

function LegendCard({ league, p, hof }: { league: League; p: Player; hof?: boolean }) {
  const c = careerTotals(p);
  const peak = Math.max(p.ovr, ...p.ratingsHistory.map((r) => r.ovr));
  // a draft year the seed doesn't know (LeBron's predates its draft pages): count back his NBA seasons
  const from = p.draft.year > 0 ? p.draft.year + 1 : Math.min((p.retiredSeason ?? league.season) - p.experience, ...c.seasons);
  // imported veterans' records start with the seed's real seasons, not their rookie year
  const tracked = c.seasons.size ? Math.min(...c.seasons) : from;
  // Most-played team for the logo
  const byTeam = new Map<number, number>();
  for (const s of p.stats) if (!s.playoffs && typeof s.tid === 'number' && league.teams[s.tid]) byTeam.set(s.tid, (byTeam.get(s.tid) ?? 0) + s.gp);
  const mainTid = [...byTeam.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return (
    <Link to={`/player/${p.pid}`} className={`card ${hof ? 'accent' : ''}`} style={{ padding: 12, display: 'block' }}>
      <div className="row" style={{ gap: 10 }}>
        <Avatar p={{ ...p, tid: mainTid ?? -1 }} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="bold ellipsis">
              {p.firstName} {p.lastName}
            </span>
            {hof && <Crown size={14} style={{ color: 'var(--tier-elite)', flex: 'none' }} />}
          </div>
          <div className="tiny dim ellipsis">
            {p.pos} · {seasonLabel(from).slice(0, 4)}–{p.retiredSeason ? String(p.retiredSeason).slice(2) : 'now'} · {c.gp} games
            {tracked > from ? ` since ${seasonLabel(tracked)}` : ''}
          </div>
        </div>
        {mainTid !== undefined && <TeamLogo tid={mainTid} size={26} />}
        <Ovr v={peak} size="sm" />
      </div>
      <div className="row tiny dim2 num" style={{ gap: 10, margin: '8px 0 8px 50px' }}>
        <span>
          <b>{c.gp ? (c.pts / c.gp).toFixed(1) : '—'}</b> ppg
        </span>
        <span>
          <b>{c.gp ? (c.reb / c.gp).toFixed(1) : '—'}</b> rpg
        </span>
        <span>
          <b>{c.gp ? (c.ast / c.gp).toFixed(1) : '—'}</b> apg
        </span>
        <span>
          <b>{Math.round(c.pts).toLocaleString()}</b> pts
        </span>
      </div>
      <div style={{ marginLeft: 50 }}>
        <AccoladeChips p={p} />
      </div>
    </Link>
  );
}
