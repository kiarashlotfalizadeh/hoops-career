// League → History (/league/history): the seasons and their champions, each franchise's history
// (?tid=), the record book, the Hall of Fame and the coaches. A season's winners in full are on the
// Awards tab; this is the league's memory.
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Crown } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { RETIRED } from '../../core/types';
import { useLeague, useLeagueMemo } from '../../state/store';
import { seasonLabel } from '../../core/constants';
import { TeamLogo } from '../components/TeamLogo';
import { Avatar, Ovr, Section, Segmented } from '../components/ui';
import { AccoladeChips, accoladeScore, careerTotals, shortName, useQueryParam, useSetParams } from '../league/shared';
import { RecordBook } from '../league/RecordBook';
import { CoachesView } from '../league/Coaches';
import { FranchiseFigures, FranchiseHistory } from '../league/Franchise';
import { slabVars } from '../teamColors';

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
      <Segmented label="History" value={view} onChange={(v) => setParams({ view: v === 'seasons' ? null : v, tid: null, coach: null, rec: null, book: null })} options={VIEWS} />
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
  if (!list.length) {
    return <div className="card empty">No seasons finished yet: each season&apos;s champion and MVPs land here.</div>;
  }
  // a team taken over later won its earlier titles under another coach
  const tenure = league.tenureStart ?? league.startSeason;
  const name = (pid?: number) => (pid !== undefined && league.players[pid] ? shortName(league.players[pid]) : undefined);
  return (
    <div className="card flush list">
      {list.map((a) => {
        const champ = a.champion !== undefined ? league.teams[a.champion] : undefined;
        const winners = [
          name(a.mvp) && `MVP ${name(a.mvp)}`,
          name(a.finalsMvp) && `Finals MVP ${name(a.finalsMvp)}`,
          a.cupWinner !== undefined && `Cup ${league.teams[a.cupWinner].abbrev}`,
        ].filter(Boolean);
        return (
          <Link key={a.season} to={`/league/awards?aseason=${a.season}`} className={`lg-yr-row ${a.champion === league.userTid && a.season >= tenure ? 'me' : ''}`}>
            <span className="yr">{seasonLabel(a.season)}</span>
            {champ ? <TeamLogo tid={champ.tid} size={34} decorative /> : <span className="lg-yr-none" />}
            <span className="lg-yr-t">
              <span className="nm ellipsis">
                {champ ? champ.name : a.season === league.season ? 'In progress' : 'No champion'}
                {champ && a.runnerUp !== undefined && <span className="dim"> def. {league.teams[a.runnerUp].abbrev}</span>}
              </span>
              {winners.length > 0 && <span className="sub ellipsis">{winners.join(' · ')}</span>}
            </span>
            <ChevronRight size={16} className="dim" aria-hidden="true" />
          </Link>
        );
      })}
    </div>
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
        <div className="lg-fr-figs">
          <FranchiseFigures league={league} tid={tid} />
        </div>
      </section>
      <FranchiseHistory league={league} tid={tid} />
    </>
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
          <div className="card empty">No one yet: legends go in when they retire.</div>
        ) : (
          <div className="card flush list wide2">
            {hof.map((p) => (
              <LegendRow key={p.pid} league={league} p={p} hof />
            ))}
          </div>
        )}
      </Section>
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
        <AccoladeChips p={p} max={4} />
      </span>
      <span className="lg-legend-r">
        <Ovr v={peak} size="sm" />
        {mainTid !== undefined && <TeamLogo tid={mainTid} size={22} />}
      </span>
    </Link>
  );
}
