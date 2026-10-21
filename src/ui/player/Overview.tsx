// A player's page, Overview: his scouting profile as percentiles among every rostered player, his
// role and how he's used, his contract with the desk's actions, a rookie's watch and the season's
// highlights, his honors and his moves.
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

export function Overview({ league, p, onRole, onExtend, onRelease }: { league: League; p: Player; onRole: () => void; onExtend: () => void; onRelease: () => void }) {
  const pctile = useSkillPercentiles(league);
  const { mine } = deskBlocks(league, p);
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  const c = composites(p.ratings);
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
  return (
    <>
      <Section
        title="Scouting profile"
        right={
          <Help title="Scouting profile">
            Each skill blends the ratings the game engine uses for it. The number is his percentile among every rostered NBA player: 90th means better than 90% of them.
          </Help>
        }
      >
        <div className="card tm-skills">
          {SKILLS.map((s) => {
            const pc = pctile(s.key, s.get(c, p));
            return (
              <div key={s.key} className="tm-skill">
                <span className="tm-skill-l">{s.label}</span>
                <Bar value={pc} color={skillColor(pc)} />
                <span className="num tm-skill-v">
                  {pc}
                  <span className="tm-sfx">{ordinalSuffix(pc)}</span>
                </span>
              </div>
            );
          })}
        </div>
        {/* what the bars' colours mean, in their colours */}
        <div className="tm-foot">
          Percentile among rostered players: <b style={{ color: skillColor(85) }}>85th+</b> · <b style={{ color: skillColor(65) }}>65th+</b> ·{' '}
          <b style={{ color: skillColor(35) }}>35th+</b> · <b style={{ color: skillColor(0) }}>below</b>
        </div>
      </Section>

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
          <div className="card tm-role">
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

      {/* his season so far: a rookie's line and race, then the season's highlights */}
      <RookieWatch league={league} p={p} />
      <SeasonHighlights league={league} p={p} />

      {/* the same honors, names and order as the league history (the Hall of Fame has its own tag above) */}
      {honors.length > 0 && (
        <Section title="Honors">
          <div className="tm-honors">
            {honors.map((a) => (
              <span key={a.label} className={`tag ${a.gold ? 'tm-gold' : ''}`}>
                {a.n > 1 ? `${a.n}× ` : ''}
                {a.label}
              </span>
            ))}
          </div>
        </Section>
      )}
      <PlayerMoves league={league} pid={p.pid} />
    </>
  );
}
