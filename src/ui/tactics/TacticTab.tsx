// Tactics → Tactic, where the screen opens: the tactics board first (your five where the shape and
// the scheme put them, each with his role at that end and how he suits it), then the staff's word and
// the system's strengths and weaknesses (the screen's), and the bench as a short list at the board's
// end. A tap on any player opens his sheet (both roles, shot freedom, glass duty, screens). The style
// and who runs it are the card over the sections.
import { useMemo, useState, type ReactNode } from 'react';
import type { Player } from '../../core/types';
import { useLeague, useLeagueMemo } from '../../state/store';
import { ROLE_META, archetype } from '../../core/ratings';
import { DEF_ROLE_META, defRoleOf } from '../../core/sim/tactics';
import { betterFit, defRoleFits, roleFits, roleScale, roleStars } from '../../core/analysis/system';
import { Section, Sheet, Tag } from '../components/ui';
import { RoleEditor } from '../components/RoleEditor';
import { rosterNames } from '../stats';
import { Board, type BoardSide } from './Board';
import { startersOf } from './formation';
import './bench.css';

const NO_ORDER: number[] = [];

export function TacticTab({ players, side, setSide, children }: { players: Player[]; side: BoardSide; setSide: (s: BoardSide) => void; children?: ReactNode }) {
  const league = useLeague();
  const team = league.teams[league.userTid];
  const t = team.tactics;
  const order = team.rotation?.order ?? NO_ORDER;
  const { five, bench } = useLeagueMemo(() => startersOf(order, players), [order, players]);
  const [pick, setPick] = useState<number | null>(null);
  const picked = pick !== null ? players.find((p) => p.pid === pick) : undefined;
  return (
    <div className="tx-tactic">
      <div className="tx-tactic-main">
        <Board t={t} players={players} five={five} side={side} setSide={setSide} onPick={setPick} />
      </div>
      <div className="tx-tactic-side">
        {children}
        <Bench players={players} bench={bench} side={side} onPick={setPick} />
      </div>
      {/* his sheet opens at the board's end */}
      <SheetFor p={picked} side={side === 'out' ? 'def' : 'off'} onClose={() => setPick(null)} />
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

/** The bench as a short list at the board's end: each player's role there and how he suits it, a mark when another suits him better. */
function Bench({ players, bench, side, onPick }: { players: Player[]; bench: Player[]; side: BoardSide; onPick: (pid: number) => void }) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const nameOf = useMemo(() => rosterNames(players), [players]);
  const scale = useLeagueMemo(() => roleScale(league), [league]);
  if (!bench.length) return null;
  const inPoss = side === 'in';
  return (
    <Section title="Bench" right={<span className="tiny dim">{inPoss ? 'In possession' : 'Out of possession'}</span>}>
      <div className="card flush list tx-bench">
        {bench.map((p) => {
          const off = t.offense.roles[p.pid] ?? archetype(p.ratings).role;
          const def = defRoleOf(t.defense, p.pid);
          const role = inPoss ? ROLE_META[off].label : DEF_ROLE_META[def].label;
          const stars = inPoss ? roleStars(scale.off[off], roleFits(p)[off]) : roleStars(scale.def[def], defRoleFits(p)[def]);
          const better = inPoss ? betterFit(scale.off, roleFits(p), off) : betterFit(scale.def, defRoleFits(p), def);
          return (
            <button key={p.pid} className="listrow clickable tx-bench-r" aria-haspopup="dialog" onClick={() => onPick(p.pid)}>
              <span className="grow tx-bench-m">
                <span className="tx-bench-n">
                  <span className="lr-name ellipsis">{nameOf(p.pid)}</span>
                  {p.injury ? <Tag tone="bad">Out</Tag> : better ? <Tag tone="warn">Better fit</Tag> : null}
                </span>
                <span className="lr-meta tx-bench-role">
                  <span className="ellipsis">{role}</span>
                  <span className="tx-floor-s num" aria-hidden="true">
                    {stars}
                    <i>★</i>
                  </span>
                  <span className="sr-only">, {stars} of 5 for it</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
