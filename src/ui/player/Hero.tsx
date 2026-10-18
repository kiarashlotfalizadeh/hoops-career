// A player's slab, in his team's colours (a neutral kit without one): number, position and status
// over the mark, the jersey and the name, OVR over POT, his particulars, his tags (archetype, tier,
// injury, the award races he's in) and his per-game line.
import { Link } from 'react-router-dom';
import type { League, Player } from '../../core/types';
import { DRAFT_PROSPECT, FREE_AGENT, RETIRED } from '../../core/types';
import { fmtHeight, ovrColor, tierLabel } from '../../core/ratings';
import { seasonLabel } from '../../core/constants';
import { FRANCHISES } from '../../core/teams';
import { awardRaces } from '../../core/league/awards';
import { playerAge } from '../../core/playerGen';
import { useLeagueMemo } from '../../state/store';
import { Avatar, Statline, Tag, pct } from '../components/ui';
import { OvrBadge } from '../components/OvrKey';
import { TeamLogo } from '../components/TeamLogo';
import { f1, ordinal, playerSeason } from '../stats';
import { slabVars } from '../teamColors';
import { injuryName, outFor } from '../../core/format';

/** A slab for a player with no team (a free agent, a prospect, a retired player): the neutral kit's colours. */
const NO_TEAM: [string, string, string] = ['#2a3441', '#8a94a4', '#c4cfdc'];

const RACES = [
  ['mvp', 'MVP'],
  ['dpoy', 'DPOY'],
  ['roy', 'ROY'],
  ['smoy', '6MOY'],
] as const;

/**
 * The letters in a name's longest unbreakable run ("Alexander-" in Alexander-Walker): the CSS sizes the
 * name so that run fits its column, rather than splitting it mid-word.
 */
function longestRun(name: string): number {
  return Math.max(1, ...(name.match(/[^\s-]+-?/g) ?? [name]).map((w) => w.length));
}

/** Where he is: his team, or free agent, prospect, retired. */
function statusLine(league: League, p: Player): string {
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  return p.tid === FREE_AGENT
    ? p.rfa
      ? 'Restricted free agent'
      : 'Free agent'
    : p.tid === DRAFT_PROSPECT
      ? `${p.draft.year} draft prospect`
      : p.tid === RETIRED
        ? `Retired${p.retiredSeason ? ` after ${seasonLabel(p.retiredSeason)}` : ''}`
        : team
          ? `${team.region} ${team.name}`
          : '';
}

export function PlayerHero({ league, p }: { league: League; p: Player }) {
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  const age = playerAge(p, league.season);
  // this season's award ladders, as the Awards tab draws them (once games are played)
  const races = useLeagueMemo(() => {
    if (league.phase !== 'regular' || !league.teams.some((t) => t.seasons.some((s) => s.season === league.season && s.won + s.lost > 0))) return null;
    return awardRaces(league, 5);
  }, [league]);
  const cur = playerSeason(p, league.season);
  // before his first game this season, show his most recent season instead
  const lastSeason = cur ? null : Math.max(0, ...p.stats.filter((s) => !s.playoffs && s.gp > 0).map((s) => s.season));
  const line = cur ?? (lastSeason ? playerSeason(p, lastSeason) : null);
  const colors = team ? (team.colors ?? FRANCHISES[team.tid]?.colors ?? NO_TEAM) : NO_TEAM;
  const inRaces = races
    ? RACES.flatMap(([k, label]) => {
        const i = races[k].findIndex((x) => x.c.p.pid === p.pid);
        return i >= 0 ? [`${label} race · ${ordinal(i + 1)}`] : [];
      })
    : [];
  return (
    <section className="slab tm-hero" style={slabVars(colors)} aria-label={`${p.firstName} ${p.lastName}`}>
      {team && (
        <span className="slab-mark">
          <TeamLogo tid={team.tid} size={190} decorative />
        </span>
      )}
      <div className="tm-over">{[p.jersey ? `#${p.jersey}` : '', p.pos, statusLine(league, p)].filter(Boolean).join(' · ')}</div>
      <div className="tm-id">
        <Avatar p={p} size="lg" />
        <div className="tm-names">
          <span className="tm-first">{p.firstName}</span>
          <h1 className="tm-last" style={{ ['--run' as string]: longestRun(p.lastName) }}>
            {p.lastName}
          </h1>
        </div>
        {/* a tap: the OVR ladder, his band marked */}
        <OvrBadge ovr={p.ovr} pot={p.pot} size="lg" />
      </div>
      <div className="tm-meta">
        {age} yrs · {fmtHeight(p.heightIn)} · {p.weightLb} lb · {p.country}
        {p.college ? ` · ${p.college}` : ''}
        {/* (the draft slot held together: "2018 R1" then "#11" alone on the next line read oddly) */}
        {p.draft.round > 0 ? ` · ${p.draft.year}\u00a0R${p.draft.round}\u00a0#${p.draft.pick}` : p.draft.year && p.tid !== DRAFT_PROSPECT ? ' · Undrafted' : ''}
      </div>
      <div className="tm-tags">
        <Tag>{p.archetype}</Tag>
        {/* his tier in its badge's colour, so it doesn't read as an award race */}
        <span className="tag tm-tier">
          <i style={{ background: ovrColor(p.ovr) }} aria-hidden="true" />
          {tierLabel(p.ovr)}
        </span>
        {p.contract.twoWay && p.tid >= 0 && <Tag>Two-way</Tag>}
        {p.injury && (
          <Tag tone="bad">
            {injuryName(p.injury.type)} · {outFor(p.injury.gamesRemaining)}
          </Tag>
        )}
        {p.hof && <Tag tone="warn">Hall of Fame</Tag>}
        {inRaces.map((r) => (
          <Link key={r} to="/league/awards" className="tag warn">
            {r}
          </Link>
        ))}
      </div>
      <Statline
        items={[
          { k: 'PTS', v: line ? f1(line.pts) : '—' },
          { k: 'REB', v: line ? f1(line.reb) : '—' },
          { k: 'AST', v: line ? f1(line.ast) : '—' },
          // no shots, no percentage: "—", not 0.0
          { k: 'TS%', v: line && (line.fga || line.fta) ? pct(line.tsPct) : '—' },
        ]}
      />
      {!cur && line && lastSeason ? (
        <div className="tm-hero-note">
          {seasonLabel(lastSeason)} per game{p.stats.some((s) => s.season === lastSeason && s.real) ? ' (real)' : ''}
        </div>
      ) : null}
    </section>
  );
}
