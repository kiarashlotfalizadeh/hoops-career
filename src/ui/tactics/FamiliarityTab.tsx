// Tactics → Analysis → Familiarity, Football Manager's familiarity panel: how well the team knows the
// tactic it plays; each of the three phases of play (and the roles) with a word for it, the games
// until it's fluid and the parts it's read from; the practice focus that builds it between games;
// the players still learning the system or their pair of roles (everyone a tap away); and what it
// costs on the floor.
import { useMemo, useState } from 'react';
import { useLeague } from '../../state/store';
import { edit } from '../../state/actions';
import type { Player, PrepFocus } from '../../core/types';
import { FAM_DIMS, FLUID, NATURAL_PAIR, NEW_KNOW, NEW_PAIR, PREP_META, famLabel, gamesTo } from '../../core/sim/familiarity';
import type { SystemFamiliarity } from '../../core/league/practice';
import { plural } from '../../core/format';
import { inSeason } from '../../core/league/helpers';
import { rosterNames } from '../stats';
import { Avatar, Help, More, Section, Tag } from '../components/ui';
import { Term } from '../components/Glossary';
import { famTone } from './formation';
import { PHASES, phaseFam, preCamp } from './fam';

/** The games a figure needs to be fluid (FLUID: full speed), as the screen says it. */
const eta = (v: number) => (v >= FLUID ? 'Full speed' : `Fluid in ~${plural(gamesTo(v), 'game')}`);

export function FamiliarityTab({ sys, players }: { sys: SystemFamiliarity; players: Player[] }) {
  const league = useLeague();
  const team = league.teams[league.userTid];
  const nameOf = useMemo(() => rosterNames(players), [players]);
  const prep: PrepFocus = team.prep ?? 'balanced';
  const camp = preCamp(league);
  const byPid = new Map(sys.players.map((x) => [x.pid, x]));
  const order = team.rotation?.order ?? [];
  const roster = [...players].sort((a, b) => (order.indexOf(a.pid) + 1 || 99) - (order.indexOf(b.pid) + 1 || 99));
  const fresh = roster.filter((p) => (byPid.get(p.pid)?.know ?? 100) < 60);
  // the players still learning (the system or their roles) are the list; the rest are one tap away
  const learning = roster.filter((p) => {
    const x = byPid.get(p.pid);
    return !!x && (x.know < FLUID || x.role < FLUID);
  });
  const [allPlayers, setAllPlayers] = useState(false);
  return (
    <>
      <Section
        title="By phase"
        right={
          <Help title="Familiarity by phase">
            <p>
              How well your team knows the tactic it plays (<Term id="familiarity">familiarity</Term>), by phase of play. At {FLUID} and up it&apos;s played as drawn up; below
              that, a step slow: worse shots and more turnovers on offense, more open shots given up on defense. Games and practice build it; whatever you stop running fades.
            </p>
            <p>Each phase is read from its parts:</p>
            {FAM_DIMS.map((d) => (
              <p key={d.id}>
                <b>{d.label}:</b> {d.help}
              </p>
            ))}
            <p>
              The word beside each figure is its band (<Term id="fambands">Fluid, Familiar, Learning, Awkward, New</Term>). The games to fluid assume a balanced practice focus;
              tactical drills build it about twice as fast.
            </p>
          </Help>
        }
      >
        <div className="card flush list">
          {[...PHASES.map((ph) => ({ id: ph.id, label: ph.label, v: phaseFam(sys.dims, ph.id), dims: ph.dims })), { id: 'roles', label: 'Roles', v: sys.dims.roles, dims: [] }].map(
            (row) => (
              <div key={row.id} className="tx-famrow">
                <div className="tx-famrow-top">
                  <span className="grow tx-famrow-n">{row.label}</span>
                  <span className="tx-famrow-w">{famLabel(row.v)}</span>
                  <span className={`num tx-famrow-v ${famTone(row.v)}`}>{Math.round(row.v)}%</span>
                </div>
                <span className="tx-fambar" aria-hidden="true">
                  <i className={famTone(row.v)} style={{ width: `${Math.round(row.v)}%` }} />
                </span>
                <div className="tx-famrow-s">
                  <span className="ellipsis">
                    {row.dims.length
                      ? row.dims.map((d) => `${FAM_DIMS.find((x) => x.id === d)!.label} ${Math.round(sys.dims[d])}`).join(' · ')
                      : 'Each player in his pair of roles'}
                  </span>
                  <span className="tx-famrow-eta">{eta(row.v)}</span>
                </div>
              </div>
            ),
          )}
        </div>
        {camp ? (
          <div className="tx-note">Before opening night: training camp drills whatever you open with, so these are the figures camp will leave.</div>
        ) : fresh.length > 0 ? (
          <div className="tx-note">
            {plural(fresh.length, 'player')} still learning the system: {fresh.map((p) => nameOf(p.pid)).join(', ')}.
          </div>
        ) : null}
      </Section>

      <Section
        title="Practice focus"
        right={
          <Help title="Practice focus">
            <p>
              What your days between games are for (<Term id="practice">practice focus</Term>). Training camp is always tactical drills.
            </p>
            {(Object.keys(PREP_META) as PrepFocus[]).map((k) => (
              <p key={k}>
                <b>{PREP_META[k].label}:</b> {PREP_META[k].help}
              </p>
            ))}
          </Help>
        }
      >
        <div className="card flush list tx-presets tx-prep" role="radiogroup" aria-label="Practice focus">
          {(Object.keys(PREP_META) as PrepFocus[]).map((k) => {
            const on = prep === k;
            return (
              <div key={k} className={`tx-preset ${on ? 'on' : ''}`}>
                <button
                  role="radio"
                  aria-checked={on}
                  className="tx-preset-pick"
                  onClick={() =>
                    edit((l) => {
                      const tm = l.teams[l.userTid];
                      if (k === 'balanced') delete tm.prep;
                      else tm.prep = k;
                    })
                  }
                >
                  <span className="tx-radio" aria-hidden="true" />
                  <span className="grow">
                    <span className="tx-preset-n">{PREP_META[k].label}</span>
                    {/* what it does, for the one that's on (each one's in the Help) */}
                    {on && <span className="tx-preset-t">{PREP_META[k].help}</span>}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        {!inSeason(league) && <div className="tx-note">No practice between seasons: training camp drills your tactics before opening night, then this focus takes over.</div>}
      </Section>

      <Section
        title="Your players"
        right={
          <Help title="Your players' familiarity">
            <p>
              <b>System:</b> how well he knows your playbook as a whole. A new arrival starts at {NEW_KNOW} and learns it with his minutes and practice; the five on the floor play
              their tactic a step slower while one of them is still learning it.
            </p>
            <p>
              <b>Roles:</b> how well he knows the pair of roles you give him (offense and defense). Change either and he starts that pair over ({NEW_PAIR}, or {NATURAL_PAIR} when
              the offensive one is his natural role), keeping some of it when one of the two stays.
            </p>
          </Help>
        }
      >
        <div className="card flush list">
          <div className="list-divider list-h tx-famp-h" aria-hidden="true">
            <span>Player</span>
            <span>System</span>
            <span>Roles</span>
          </div>
          {(allPlayers ? roster : learning).map((p) => {
            const x = byPid.get(p.pid);
            if (!x) return null;
            return (
              <div key={p.pid} className="listrow tx-famp">
                <Avatar p={p} />
                <span className="grow lr-name ellipsis">
                  {nameOf(p.pid)} {x.know < 60 && <Tag tone="warn">New</Tag>}
                </span>
                <span className="tx-famp-c">
                  <span className={`num ${famTone(x.know)}`}>{Math.round(x.know)}%</span>
                  <span className="tx-fambar" aria-hidden="true">
                    <i className={famTone(x.know)} style={{ width: `${Math.round(x.know)}%` }} />
                  </span>
                </span>
                <span className="tx-famp-c">
                  <span className={`num ${famTone(x.role)}`}>{Math.round(x.role)}%</span>
                  <span className="tx-fambar" aria-hidden="true">
                    <i className={famTone(x.role)} style={{ width: `${Math.round(x.role)}%` }} />
                  </span>
                </span>
              </div>
            );
          })}
          {!allPlayers && learning.length < roster.length && (
            <button className="tx-famp-all" onClick={() => setAllPlayers(true)}>
              {learning.length ? `${roster.length - learning.length} more at full speed` : `All ${roster.length} at full speed`}: show
            </button>
          )}
        </div>
      </Section>

      <More label="What it costs, and how it's built">
        <ul className="tx-bullets">
          <li>
            A unit below {FLUID} plays a step slow, and the further below, the slower. A whole new system costs the most, then a new offense with new roles for everyone; a new
            zone, coverage or shape on its own costs much less.
          </li>
          <li>Each game drills the tactic it was played with; each practice day drills it again at your focus, and your other tactic slots a little less.</li>
          <li>Moving a setting off where it&apos;s drilled costs that part of the tactic until it&apos;s drilled again: the Instructions tab says what each change costs.</li>
          <li>Training camp drills whatever you open the season with: a new system is around 80 by opening night.</li>
          <li>Opponent prep drills tonight&apos;s game-plan changes for that game, so a coverage you only play against one team has no learning curve.</li>
        </ul>
      </More>
    </>
  );
}
