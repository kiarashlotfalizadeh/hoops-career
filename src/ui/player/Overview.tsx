// A player's page, Overview, a few blocks in order of use: his role and how he's used, his contract
// with the desk's actions, what he's best at (his whole scouting profile leads Ratings), a rookie's
// watch and the season's highlights, then who he is (his particulars, where his career stands, his
// marks and honors) and his moves.
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { ROLE_META, archetype, composites } from '../../core/ratings';
import { DEF_ROLE_META, defRoleOf } from '../../core/sim/tactics';
import { Bar, Help, Section, Statline, Tag, pct } from '../components/ui';
import { Term } from '../components/Glossary';
import { ordinalSuffix, playerSeason, signed } from '../stats';
import { SKILLS, skillColor, useSkillPercentiles } from '../playerSkills';
import { PlayerMoves } from '../league/MovesTab';
import { accolades } from '../league/shared';
import { ContractSection, deskBlocks } from './Contract';
import { RookieWatch, SeasonHighlights } from './Highlights';
import { bioFacts, usePlayerTags } from './Hero';
import { growthStory } from '../../core/league/devWatch';

/** His scouting profile: each skill as a percentile among every rostered player, best first when `top` trims it. */
export function ScoutingProfile({ league, p, top, onAll }: { league: League; p: Player; top?: number; onAll?: () => void }) {
  const pctile = useSkillPercentiles(league);
  const c = composites(p.ratings);
  const all = SKILLS.map((s) => ({ s, pc: pctile(s.key, s.get(c, p)) }));
  // trimmed: his best, in his profile's order
  const shown = top ? [...all].sort((x, y) => y.pc - x.pc).slice(0, top) : all;
  return (
    <Section
      title={top ? 'Best at' : 'Scouting profile'}
      right={
        top && onAll ? (
          <button className="card-link" onClick={onAll}>
            All {all.length} skills <ChevronRight size={14} />
          </button>
        ) : (
          <Help title="Scouting profile">
            <p>Each skill blends the ratings the game engine uses for it. The number is his percentile among every rostered NBA player: 90th means better than 90% of them.</p>
            <p>
              The bars&apos; colours: <b style={{ color: skillColor(85) }}>85th and up</b>, <b style={{ color: skillColor(65) }}>65th and up</b>,{' '}
              <b style={{ color: skillColor(35) }}>35th and up</b>, <b style={{ color: skillColor(0) }}>below</b>.
            </p>
          </Help>
        )
      }
    >
      <div className="tm-skills">
        {shown.map(({ s, pc }) => (
          <div key={s.key} className="tm-skill">
            <span className="tm-skill-l">{s.label}</span>
            <Bar value={pc} color={skillColor(pc)} />
            <span className="num tm-skill-v">
              {pc}
              <span className="tm-sfx">{ordinalSuffix(pc)}</span>
            </span>
          </div>
        ))}
      </div>
      {!top && <div className="tm-foot">Percentile among rostered players</div>}
    </Section>
  );
}

export function Overview({
  league,
  p,
  onRole,
  onExtend,
  onRelease,
  onRatings,
}: {
  league: League;
  p: Player;
  onRole: () => void;
  onExtend: () => void;
  onRelease: () => void;
  /** Opens his Ratings tab, where the whole scouting profile is. */
  onRatings: () => void;
}) {
  const { mine } = deskBlocks(league, p);
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  const arch = archetype(p.ratings);
  const role = team ? (team.tactics.offense.roles[p.pid] ?? arch.role) : arch.role;
  const cur = playerSeason(p, league.season);
  const freedom = team ? ['Limited', 'Normal', 'Green light'][(team.tactics.offense.freedom[p.pid] ?? 0) + 1] : null;
  const usage = [
    ...(team ? [{ k: 'Minutes', v: p.injury ? 'Out' : String(team.rotation.minutes[p.pid] ?? 0), s: p.injury ? 'injured' : 'planned' }] : []),
    ...(cur
      ? [
          { k: 'USG%', v: pct(cur.usg), s: 'usage' },
          { k: <Term id="onnet">On net</Term>, v: signed(cur.onOff), s: 'per 100', color: cur.onOff >= 0 ? 'var(--good)' : 'var(--bad)' },
          { k: '+/-', v: signed(cur.pm), s: 'a game' },
        ]
      : []),
  ];
  const honors = accolades(p);
  // the hero shows his first two marks; the rest are here with his particulars
  const tags = usePlayerTags(league, p).slice(2);
  const story = p.tid >= -1 ? growthStory(league, p) : '';
  return (
    <>
      <div className="md-grid2">
        <Section
          title="Role & usage"
          right={
            mine && (
              <span className="tm-links-r">
                <button className="card-link" aria-haspopup="dialog" onClick={onRole}>
                  Set role
                </button>
                <Link to="/team/rotation" className="card-link">
                  Minutes <ChevronRight size={14} />
                </Link>
              </span>
            )
          }
        >
          <div className="tm-role">
            <div className="row between top">
              <div className="grow">
                <div className="tm-role-name">{ROLE_META[role].label}</div>
                {team && <div className="small dim">Out of possession: {DEF_ROLE_META[defRoleOf(team.tactics.defense, p.pid)].label}</div>}
                {arch.role !== role && <div className="small warn">Natural role: {ROLE_META[arch.role].label}</div>}
              </div>
              {freedom && freedom !== 'Normal' && <Tag tone={freedom === 'Green light' ? 'good' : 'warn'}>{freedom}</Tag>}
            </div>
            {usage.length > 0 && <Statline items={usage} />}
          </div>
        </Section>

        <ContractSection league={league} p={p} onExtend={onExtend} onRelease={onRelease} />
      </div>

      {/* his best skills; all of them lead his Ratings tab */}
      <ScoutingProfile league={league} p={p} top={4} onAll={onRatings} />

      {/* his season so far: a rookie's line and race, then the season's highlights */}
      <RookieWatch league={league} p={p} />
      <SeasonHighlights league={league} p={p} />

      {/* who he is: his particulars, where his career stands, his other marks and his honors (the same
          names and order as the league history) */}
      <Section title="About him">
        <div className="tm-about">
          <div className="tm-meta">
            <span className="tm-meta-in">
              {bioFacts(league, p).map((x, i) => (
                <span key={i}>{x}</span>
              ))}
            </span>
          </div>
          {story && <div className="dv-story">{story}</div>}
          {(tags.length > 0 || honors.length > 0) && (
            <div className="tm-honors">
              {tags.map((t) => (
                <span key={t.key} className="tm-tagw">
                  {t.node}
                </span>
              ))}
              {honors.map((a) => (
                <span key={a.label} className={`tag ${a.gold ? 'tm-gold' : ''}`}>
                  {a.n > 1 ? `${a.n}× ` : ''}
                  {a.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </Section>
      <PlayerMoves league={league} pid={p.pid} />
    </>
  );
}
