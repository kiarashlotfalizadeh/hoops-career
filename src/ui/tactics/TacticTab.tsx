// Tactics → Tactic, where the screen opens: the tactics board first (your five where the shape and
// the scheme put them, each with his role and how he suits it, the partnerships between them drawn on
// the floor), then the rest of the plan (the screen's: the mentality, strengths and weaknesses, the
// assistant's switch), the Partnerships card that names the links, the bench as a short list, and
// your saved playbooks as one row. A tap on any player opens his sheet (both roles, shot freedom,
// glass duty, screens). The style is the line over the sections.
import { useMemo, useState, type ReactNode } from 'react';
import type { Player } from '../../core/types';
import { useLeague, useLeagueMemo } from '../../state/store';
import { LINK_NAMED, lineupLinks } from '../../core/sim/links';
import { roleFam } from '../../core/sim/familiarity';
import { ROLE_META, archetype } from '../../core/ratings';
import { DEF_ROLE_META, defRoleOf } from '../../core/sim/tactics';
import { betterFit, defRoleFits, roleFits, roleScale } from '../../core/analysis/system';
import { Section, Sheet, Tag } from '../components/ui';
import { RoleEditor } from '../components/RoleEditor';
import { rosterNames } from '../stats';
import { MyPlaybooksRow } from './MyPlaybooks';
import { Board, type BoardSide } from './Board';
import { PartnershipsCard } from './Partnerships';
import { famTone } from './formation';
import { linkKey, startersOf } from './partners';
import { useFam } from './useFam';

const NO_ORDER: number[] = [];

export function TacticTab({ players, side, setSide, children }: { players: Player[]; side: BoardSide; setSide: (s: BoardSide) => void; children?: ReactNode }) {
  const league = useLeague();
  const team = league.teams[league.userTid];
  const t = team.tactics;
  const fam = useFam();
  const order = team.rotation?.order ?? NO_ORDER;
  const { five, bench } = useLeagueMemo(() => startersOf(order, players), [order, players]);
  const { links, clashes } = useLeagueMemo(() => lineupLinks(t, five, fam), [t, five, fam]);
  // the bench's best pair among those fit to play
  const benchLinks = useLeagueMemo(
    () =>
      // (only one worth naming: a weak pair on the bench is noise)
      lineupLinks(
        t,
        bench.filter((p) => !p.injury),
        fam,
      ).links.filter((l) => l.strength >= LINK_NAMED),
    [t, bench, fam],
  );
  const [focus, setFocus] = useState<string | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const picked = pick !== null ? players.find((p) => p.pid === pick) : undefined;
  const starter = !!picked && five.includes(picked);
  return (
    <div className="tx-tactic">
      <div className="tx-tactic-main">
        <Board
          t={t}
          players={players}
          five={five}
          fam={fam}
          side={side}
          setSide={(x) => {
            // a picked link belongs to its end
            setSide(x);
            setFocus(null);
          }}
          links={links}
          clashes={clashes}
          focus={focus}
          onPick={setPick}
        />
      </div>
      <div className="tx-tactic-side">
        {children}
        <PartnershipsCard
          players={players}
          links={links}
          clashes={clashes}
          bench={benchLinks[0]}
          focus={focus}
          setFocus={(k) => {
            setFocus(k);
            // the board shows the end the picked link plays at
            const l = links.find((x) => linkKey(x) === k);
            if (l) setSide(l.id === 'wall' ? 'out' : 'in');
          }}
        />
        <Bench players={players} bench={bench} side={side} onPick={setPick} />
        <MyPlaybooksRow />
      </div>
      <SheetFor p={picked} side={starter && side === 'out' ? 'def' : 'off'} onClose={() => setPick(null)} />
    </div>
  );
}

/** A player's sheet over the Tactic section. */
function SheetFor({ p, side, onClose }: { p: Player | undefined; side: 'off' | 'def'; onClose: () => void }) {
  return (
    <Sheet open={!!p} onClose={onClose} title={p ? `${p.firstName} ${p.lastName}` : 'Player'}>
      {p && <RoleEditor key={`${p.pid}${side}`} p={p} side={side} onDone={onClose} />}
    </Sheet>
  );
}

/** The bench as a short list: each player's roles at both ends, a mark when another role suits him better, how well he knows his pair. */
function Bench({ players, bench, side, onPick }: { players: Player[]; bench: Player[]; side: BoardSide; onPick: (pid: number) => void }) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const fam = useFam();
  const nameOf = useMemo(() => rosterNames(players), [players]);
  const scale = useLeagueMemo(() => roleScale(league), [league]);
  if (!bench.length) return null;
  return (
    <Section title="Bench" right={<span className="tiny dim">Roles · knows them</span>}>
      <div className="card flush list tx-bench">
        {bench.map((p) => {
          const off = t.offense.roles[p.pid] ?? archetype(p.ratings).role;
          const def = defRoleOf(t.defense, p.pid);
          const better = side === 'in' ? betterFit(scale.off, roleFits(p), off) : betterFit(scale.def, defRoleFits(p), def);
          const pair = roleFam(fam, t, p);
          return (
            <button key={p.pid} className="listrow clickable tx-bench-r" aria-haspopup="dialog" onClick={() => onPick(p.pid)}>
              <span className="grow tx-bench-m">
                <span className="tx-bench-n">
                  <span className="lr-name ellipsis">{nameOf(p.pid)}</span>
                  {p.injury ? <Tag tone="bad">Out</Tag> : better ? <Tag tone="warn">Better fit</Tag> : null}
                </span>
                <span className="lr-meta ellipsis">
                  {ROLE_META[off].label} · {DEF_ROLE_META[def].label}
                </span>
              </span>
              <span className={`tx-bench-f num ${famTone(pair)}`}>
                <span className="sr-only">Knows his roles </span>
                {Math.round(pair)}%
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
