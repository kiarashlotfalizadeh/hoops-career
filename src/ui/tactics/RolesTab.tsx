// Tactics → Players: each player's roles at both ends with how well he suits them (★), his shot
// freedom and glass duty, and how well he knows his pair of roles; a tap opens his role sheet. Then
// the preferred ball screeners.
import { useMemo, useState } from 'react';
import { useLeague } from '../../state/store';
import type { ShotFreedom } from '../../core/types';
import { ROLE_META, archetype } from '../../core/ratings';
import { DEF_ROLE_META, GLASS_META, defRoleOf } from '../../core/sim/tactics';
import { roleFam } from '../../core/sim/familiarity';
import { defRoleFits, fitStars, roleFits } from '../../core/analysis/system';
import type { Player } from '../../core/types';
import { Avatar, Help, Section, Sheet, Tag, activateOnKey } from '../components/ui';
import { RoleEditor } from '../components/RoleEditor';
import { Term } from '../components/Glossary';
import { rosterNames } from '../stats';
import { tweak } from './edit';
import { famTone } from './formation';
import { useFam } from './useFam';

const Stars = ({ v }: { v: number }) => (
  <span className="tx-floor-s" aria-label={`${fitStars(v)} of 5`}>
    {'★'.repeat(fitStars(v))}
    <span className="dim">{'★'.repeat(5 - fitStars(v))}</span>
  </span>
);

export function RolesTab({ players }: { players: Player[] }) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const fam = useFam();
  const nameOf = useMemo(() => rosterNames(players, { initial: true }), [players]);
  const [pick, setPick] = useState<number | null>(null);
  const p = pick !== null ? league.players[pick] : null;
  return (
    <>
      <Section
        title="Roles"
        right={
          <Help title="Roles">
            <p>
              <b>In possession:</b> which actions a player is in and how often the offense looks for him. <b>Out of possession:</b> whom he guards and what else he does (
              <Term id="defroles">defensive roles</Term>: point of attack, wing stopper, rim anchor, roamer, or hidden on their weakest player).
            </p>
            <p>
              ★ is how well he suits each role. The % is how well he knows the pair (<Term id="familiarity">familiarity</Term>): a new pair is played a step slow until drilled.
            </p>
            <p>Shot freedom scales his shot volume; glass duty sends him to the offensive boards, or back on defense, whatever the team does. Tap a player to change any of it.</p>
          </Help>
        }
      >
        <div className="card flush list">
          <div className="list-divider list-h" aria-hidden="true">
            <span>Roles · O in possession · D out</span>
            <span>Knows them</span>
          </div>
          {players.map((pl) => {
            const role = t.offense.roles[pl.pid] ?? archetype(pl.ratings).role;
            const drole = defRoleOf(t.defense, pl.pid);
            const of = roleFits(pl);
            const df = defRoleFits(pl);
            const fr = (t.offense.freedom[pl.pid] ?? 0) as ShotFreedom;
            const glass = t.offense.glass?.[pl.pid] ?? 0;
            const pair = roleFam(fam, t, pl);
            return (
              <div
                key={pl.pid}
                className="listrow clickable tx-prow"
                role="button"
                tabIndex={0}
                aria-haspopup="dialog"
                onClick={() => setPick(pl.pid)}
                onKeyDown={activateOnKey(() => setPick(pl.pid))}
              >
                <Avatar p={pl} />
                <div className="grow tx-prow-m">
                  <div className="tx-prow-top">
                    <span className="lr-name ellipsis">{nameOf(pl.pid)}</span>
                    {fr !== 0 && <Tag tone={fr === 1 ? 'good' : 'warn'}>{fr === 1 ? 'Green light' : 'Limited'}</Tag>}
                    {glass !== 0 && <Tag tone="info">{GLASS_META[glass].label}</Tag>}
                    {pl.injury && <Tag tone="bad">Out</Tag>}
                  </div>
                  <div className="tx-prow-roles">
                    <span className="tx-prow-r">
                      <span className="tx-prow-k" aria-hidden="true">
                        O
                      </span>
                      <span className="sr-only">In possession: </span>
                      <span className="ellipsis">{ROLE_META[role].label}</span>
                      <Stars v={of[role]} />
                    </span>
                    <span className="tx-prow-r">
                      <span className="tx-prow-k def" aria-hidden="true">
                        D
                      </span>
                      <span className="sr-only">Out of possession: </span>
                      <span className="ellipsis">{DEF_ROLE_META[drole].label}</span>
                      <Stars v={df[drole]} />
                    </span>
                  </div>
                </div>
                <span className={`tx-prow-fam num ${famTone(pair)}`}>
                  <span className="sr-only">Knows his roles </span>
                  {Math.round(pair)}%
                </span>
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
        {p && <RoleEditor key={p.pid} p={p} onDone={() => setPick(null)} />}
      </Sheet>
    </>
  );
}
