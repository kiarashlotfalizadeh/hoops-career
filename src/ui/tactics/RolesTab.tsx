// Tactics → Roles: each player's offensive role and shot freedom (a tap opens his editor), and the
// preferred ball screeners.
import { useMemo, useState } from 'react';
import { useLeague, useLeagueMemo } from '../../state/store';
import type { ShotFreedom } from '../../core/types';
import { rosterSorted } from '../../core/league/helpers';
import { ROLE_META, archetype } from '../../core/ratings';
import { Avatar, Help, Ovr, Section, Sheet, Tag, activateOnKey } from '../components/ui';
import { RoleEditor } from '../components/RoleEditor';
import { rosterNames } from '../stats';
import { tweak } from './edit';

export function RolesTab() {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const players = useLeagueMemo(() => rosterSorted(league, league.userTid), [league]);
  const nameOf = useMemo(() => rosterNames(players, { initial: true }), [players]);
  const [pick, setPick] = useState<number | null>(null);
  const p = pick !== null ? league.players[pick] : null;
  return (
    <>
      <Section
        title="Roles & shot freedom"
        right={
          <Help title="Roles and freedom">
            A role decides which actions a player is involved in and how often the offense looks for him. Shot freedom scales his shot volume: green light for scorers, limited for
            players who should keep it moving. Tap a player to change his.
          </Help>
        }
      >
        <div className="card flush list wide2">
          {players.map((pl) => {
            const role = t.offense.roles[pl.pid] ?? archetype(pl.ratings).role;
            const fr = (t.offense.freedom[pl.pid] ?? 0) as ShotFreedom;
            const off = archetype(pl.ratings).role !== role;
            return (
              <div
                key={pl.pid}
                className="listrow clickable"
                role="button"
                tabIndex={0}
                aria-haspopup="dialog"
                onClick={() => setPick(pl.pid)}
                onKeyDown={activateOnKey(() => setPick(pl.pid))}
              >
                <Avatar p={pl} />
                <div className="grow">
                  <div className="lr-name ellipsis">{nameOf(pl.pid)}</div>
                  <div className={`lr-meta ellipsis ${off ? 'warn' : ''}`}>
                    {ROLE_META[role].label}
                    {off ? ' · out of position' : ''}
                  </div>
                </div>
                {fr !== 0 && <Tag tone={fr === 1 ? 'good' : 'warn'}>{fr === 1 ? 'Green light' : 'Limited'}</Tag>}
                <Ovr v={pl.ovr} size="sm" />
              </div>
            );
          })}
        </div>
      </Section>
      <Section
        title="Preferred screeners"
        right={
          <Help title="Screeners">Who sets ball screens in your pick-and-roll. Rollers dive to the rim; poppers stretch the defense. With none picked, the offense chooses.</Help>
        }
      >
        <div className="card col tx-group tight">
          <div className="chips">
            {players
              .filter((pl) => pl.ratings.hgt >= 50)
              .map((pl) => {
                const on = t.offense.screeners.includes(pl.pid);
                return (
                  <button
                    key={pl.pid}
                    className={`chip ${on ? 'on' : ''}`}
                    aria-pressed={on}
                    onClick={() => tweak((tt) => void (tt.offense.screeners = on ? tt.offense.screeners.filter((x) => x !== pl.pid) : [...tt.offense.screeners, pl.pid]))}
                  >
                    {nameOf(pl.pid)}
                  </button>
                );
              })}
          </div>
          {!t.offense.screeners.length && <div className="tx-note">None picked: the offense chooses.</div>}
        </div>
      </Section>
      <Sheet open={!!p} onClose={() => setPick(null)} title={p ? `${p.firstName} ${p.lastName}` : ''}>
        {p && <RoleEditor p={p} onDone={() => setPick(null)} />}
      </Sheet>
    </>
  );
}
