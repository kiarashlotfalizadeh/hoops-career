// A player's hero: a poster in his team's colours (a neutral kit without one). His position and team
// as a kicker, his jersey number and his OVR as the two giant figures (the OVR on a white card in
// his tier's colour, his change this season and POT with it), the name in the headline cut, and his
// line a game across its foot; under
// it, his two most pressing marks (hurt, an award race, development...). His particulars, the rest
// of his marks and where his career stands are on his Overview (bioFacts, usePlayerTags).
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { League, Player } from '../../core/types';
import { DRAFT_PROSPECT, FREE_AGENT, RETIRED } from '../../core/types';
import { fmtHeight, ovrColor, tierLabel } from '../../core/ratings';
import { seasonLabel } from '../../core/constants';
import { FRANCHISES } from '../../core/teams';
import { awardRaces } from '../../core/league/awards';
import { playerAge } from '../../core/playerGen';
import { useLeagueMemo } from '../../state/store';
import { Statline, Tag, pct } from '../components/ui';
import { OvrSheet } from '../components/OvrKey';
import { TeamLogo } from '../components/TeamLogo';
import { f1, ordinal, playerSeason } from '../stats';
import { contrast, slabVars, teamLook } from '../teamColors';
import { injuryName, outFor } from '../../core/format';
import { baseLabel, devBase, devTag, ovrChange } from '../../core/league/devWatch';
import { DevDelta, DevTagChip } from './dev';

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

/** His marks in the order they matter (hurt, an award race, development, the Hall, a two-way deal, his archetype, his tier): the hero shows two, his Overview the rest. */
export function usePlayerTags(league: League, p: Player): { key: string; node: ReactNode }[] {
  // this season's award ladders, as the Awards tab draws them (once games are played)
  const races = useLeagueMemo(() => {
    if (league.phase !== 'regular' || !league.teams.some((t) => t.seasons.some((s) => s.season === league.season && s.won + s.lost > 0))) return null;
    return awardRaces(league, 5);
  }, [league]);
  const dev = p.tid >= 0 ? devTag(league, p) : null;
  const inRaces = races
    ? RACES.flatMap(([k, label]) => {
        const i = races[k].findIndex((x) => x.c.p.pid === p.pid);
        return i >= 0 ? [`${label} race · ${ordinal(i + 1)}`] : [];
      })
    : [];
  return [
    ...(p.injury
      ? [
          {
            key: 'injury',
            node: (
              <Tag tone="bad">
                {injuryName(p.injury.type)} · {outFor(p.injury.gamesRemaining)}
              </Tag>
            ),
          },
        ]
      : []),
    ...inRaces.map((r) => ({
      key: r,
      node: (
        <Link to="/league/awards" className="tag warn">
          {r}
        </Link>
      ),
    })),
    ...(dev ? [{ key: 'dev', node: <DevTagChip tag={dev} /> }] : []),
    ...(p.hof ? [{ key: 'hof', node: <Tag tone="warn">Hall of Fame</Tag> }] : []),
    ...(p.contract.twoWay && p.tid >= 0 ? [{ key: 'twoway', node: <Tag>Two-way</Tag> }] : []),
    { key: 'arch', node: <Tag>{p.archetype}</Tag> },
    {
      key: 'tier',
      // his tier in its badge's colour, so it doesn't read as an award race
      node: (
        <span className="tag tm-tier">
          <i style={{ background: ovrColor(p.ovr) }} aria-hidden="true" />
          {tierLabel(p.ovr)}
        </span>
      ),
    },
  ];
}

/** His particulars, each whole on its line: age, height, weight, country, college, where he was drafted. */
export function bioFacts(league: League, p: Player): string[] {
  return [
    `${playerAge(p, league.season)} yrs`,
    fmtHeight(p.heightIn),
    `${p.weightLb} lb`,
    p.country,
    p.college,
    // the draft slot in the picks' words: "2018 1st round #11"
    p.draft.round > 0 ? `${p.draft.year} ${p.draft.round === 1 ? '1st' : '2nd'} round #${p.draft.pick}` : p.draft.year && p.tid !== DRAFT_PROSPECT ? 'Undrafted' : '',
  ].filter(Boolean);
}

export function PlayerHero({ league, p }: { league: League; p: Player }) {
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  const cur = playerSeason(p, league.season);
  // before his first game this season, show his most recent season instead
  const lastSeason = cur ? null : Math.max(0, ...p.stats.filter((s) => !s.playoffs && s.gp > 0).map((s) => s.season));
  const line = cur ?? (lastSeason ? playerSeason(p, lastSeason) : null);
  const colors = team ? (team.colors ?? FRANCHISES[team.tid]?.colors ?? NO_TEAM) : NO_TEAM;
  const look = teamLook(colors);
  // his number printed in the team's trim where it stands out from the slab (large type: 3:1), else white
  const numColor = contrast(look.trim, look.slab) >= 3 ? look.trim : undefined;
  const tags = usePlayerTags(league, p).slice(0, 2);
  return (
    <section className="tm-hero" aria-label={`${p.firstName} ${p.lastName}`}>
      {/* his poster in his team's colours: who he plays for, his number and his OVR as the two big figures, the name, his line */}
      <div className="slab tm-hero-slab" style={slabVars(colors)}>
        <div className="tm-over over">
          {team && <TeamLogo tid={team.tid} size={20} decorative />}
          <span>{[p.pos, statusLine(league, p)].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="tm-hero-big">
          {/* his number, or his position when he has none (a prospect, a free agent) */}
          <span className={`tm-jno${p.jersey ? '' : ' pos'}`} style={numColor ? { color: numColor } : undefined}>
            {p.jersey ? (
              <>
                <span className="tm-jno-h" aria-hidden="true">
                  #
                </span>
                {p.jersey}
              </>
            ) : (
              p.pos
            )}
            {p.jersey && <span className="sr-only">, number {p.jersey}</span>}
          </span>
          {/* a tap: the OVR ladder, his band marked; under it, his change this season */}
          <HeroOvr league={league} p={p} />
        </div>
        <div className="tm-names">
          <span className="tm-first">{p.firstName}</span>
          <h1 className="tm-last" style={{ ['--run' as string]: longestRun(p.lastName) }}>
            {p.lastName}
          </h1>
        </div>
        <div className="tm-hero-figs">
          <Statline
            items={[
              { k: 'PTS', v: line ? f1(line.pts) : '—' },
              { k: 'REB', v: line ? f1(line.reb) : '—' },
              { k: 'AST', v: line ? f1(line.ast) : '—' },
              // no shots, no percentage: "—", not 0.0
              { k: 'TS%', v: line && (line.fga || line.fta) ? pct(line.tsPct) : '—' },
            ]}
          />
          {/* what the figures are, always: this season's, or his last one's before he plays */}
          {line ? (
            <div className="tm-hero-note">
              {seasonLabel(cur ? league.season : lastSeason!)} per game{!cur && p.stats.some((s) => s.season === lastSeason && s.real) ? ' (real)' : ''}
            </div>
          ) : null}
        </div>
      </div>
      {/* two marks at most; the rest, his particulars and where his career stands are on his Overview */}
      {tags.length > 0 && (
        <div className="tm-tags">
          {tags.map((t) => (
            <span key={t.key} className="tm-tagw">
              {t.node}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/** His OVR as the poster's second big figure, printed on a white card in his tier's colour with a rule of it under, his change this season and his POT; a tap opens the ladder. */
function HeroOvr({ league, p }: { league: League; p: Player }) {
  const [open, setOpen] = useState(false);
  const ovr = Math.round(p.ovr);
  return (
    <div className="tm-hovr">
      <button type="button" className="tm-hovr-b" aria-haspopup="dialog" onClick={() => setOpen(true)} aria-label={`OVR ${ovr}, ${tierLabel(ovr)}; potential ${p.pot}`}>
        <span className="tm-hovr-k" aria-hidden="true">
          OVR
          <DevDelta d={ovrChange(league, p)} since={baseLabel(devBase(league, p))} size="md" />
        </span>
        <span className="tm-hovr-v num" aria-hidden="true" style={{ color: ovrColor(ovr) }}>
          {ovr}
        </span>
        <span className="tm-hovr-rule" style={{ background: ovrColor(ovr) }} aria-hidden="true" />
        <span className="tm-hovr-k" aria-hidden="true">
          POT <b className="num">{p.pot}</b>
        </span>
      </button>
      <OvrSheet open={open} onClose={() => setOpen(false)} ovr={p.ovr} pot={p.pot} />
    </div>
  );
}
