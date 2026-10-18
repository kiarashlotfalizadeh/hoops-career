// The game plan's defender to attack and its junk defense on the players their offense runs through
// (the matchup page's Plan). How to guard each of their players is set with who guards him, on
// Matchups (see MatchupPlanner).
import type { DefScheme, League, Player } from '../../core/types';
import { effectiveTactics, removePlanItem, setPlanItem } from '../../core/league/gamePlans';
import { huntPick } from '../../core/analysis/guarding';
import { projectedRotation } from '../../core/analysis/scouting';
import { SCHEME_META, chasers } from '../../core/sim/tactics';
import { attrDisplay, composites } from '../../core/ratings';
import { edit } from '../../state/actions';
import { useLeagueMemo, useStore } from '../../state/store';
import { rosterNames } from '../stats';
import { Chips, Help, Section } from './ui';
import '../games/games.css';

/** Attack one of their defenders: the staff suggests their weakest perimeter defender. */
export function AttackCard({ league, opp }: { league: League; opp: number }) {
  const simming = useStore((s) => !!s.sim);
  const eff = useLeagueMemo(() => effectiveTactics(league, opp), [league, opp]);
  const theirs = useLeagueMemo(() => projectedRotation(league, opp, 8), [league, opp]);
  const pick = useLeagueMemo(() => huntPick(league, opp), [league, opp]);
  const names = rosterNames(theirs);
  const target = eff.offense.huntTarget ?? null;
  const per = (p: Player) => attrDisplay(composites(p.ratings).perDef);
  const set = (pid: number | null) =>
    edit((l) => {
      if (pid === null) removePlanItem(l, opp, 'hunt');
      else setPlanItem(l, opp, { id: 'hunt', label: `Attack ${l.players[pid]?.lastName ?? ''}`, group: 'hunt', patch: { offense: { huntTarget: pid } } });
    });
  const sorted = [...theirs].sort((a, b) => per(a) - per(b) || a.pid - b.pid);
  if (!theirs.length) return null;
  return (
    <Section
      title="Attack a defender"
      right={
        <Help title="Attack a defender">
          While he&apos;s on the floor your offense runs its isolations, post-ups and ball screens at the player he guards, and that player sets most of the ball screens, so a
          switch leaves him on your ball handler and a weak screen defender can&apos;t hold up the coverage. It costs some ball movement: motion and handoffs lose a little. Against
          a real weak link it&apos;s a small edge; against a good defender it costs points. It replaces Hunt mismatches while he plays. The numbers are perimeter defense on the
          40-99 scale; ★ is the staff&apos;s pick.
        </Help>
      }
    >
      <div className="mu-group">
        <Chips
          label="Defender to attack"
          value={target ?? -1}
          disabled={simming}
          onChange={(pid: number) => set(pid < 0 || pid === target ? null : pid)}
          options={[{ id: -1, label: 'Nobody' }, ...sorted.map((p) => ({ id: p.pid, label: `${names(p.pid)} ${per(p)}${p.pid === pick?.pid && pick.worth ? ' ★' : ''}` }))]}
        />
        {pick && !pick.worth && (
          <div className="mu-note">
            Their weakest, {names(pick.pid)} ({pick.perDef}), is close to their rotation ({pick.teamPerDef}): it may not pay.
          </div>
        )}
      </div>
    </Section>
  );
}

/** A box-and-one or triangle-and-two on the players their offense runs through. */
export function JunkCard({ league, opp }: { league: League; opp: number }) {
  const simming = useStore((s) => !!s.sim);
  const eff = useLeagueMemo(() => effectiveTactics(league, opp), [league, opp]);
  const theirs = useLeagueMemo(() => projectedRotation(league, opp, 8), [league, opp]);
  const names = rosterNames(theirs);
  const base = league.teams[league.userTid].tactics.defense.scheme;
  const scheme = eff.defense.scheme;
  const n = chasers(scheme);
  const chase = (eff.defense.chase ?? []).slice(0, n);
  // their main creators, as the engine picks them when nobody is named: most usage first
  const creators = [...theirs].sort((a, b) => creatorScore(b) - creatorScore(a) || a.pid - b.pid);
  const set = (s: DefScheme, pids: number[]) =>
    edit((l) => {
      const items = l.gamePlans?.[opp]?.items ?? [];
      for (const it of items.filter((x) => x.id === 'junk' || x.id === 'box-1' || x.id === 'tri-2')) removePlanItem(l, opp, it.id);
      // (a playbook that plays a junk defense itself needs an item to play man-to-man against them)
      if (!chasers(s)) {
        if (chasers(base)) setPlanItem(l, opp, { id: 'junk', label: SCHEME_META.man.label, group: 'coverage', patch: { defense: { scheme: 'man' } } });
        return;
      }
      const who = pids.map((pid) => l.players[pid]?.lastName ?? '').join(' and ');
      setPlanItem(l, opp, { id: 'junk', label: `${SCHEME_META[s].label} on ${who}`, group: 'coverage', patch: { defense: { scheme: s, chase: pids } } });
    });
  const pickScheme = (s: DefScheme) => {
    if (!chasers(s)) return set('man', []);
    const k = chasers(s);
    const keep = chase.filter((pid) => theirs.some((p) => p.pid === pid));
    const fill = creators.map((p) => p.pid).filter((pid) => !keep.includes(pid));
    set(s, [...keep, ...fill].slice(0, k));
  };
  const toggle = (pid: number) => {
    if (!n) return;
    const next = chase.includes(pid) ? chase.filter((x) => x !== pid) : [...chase, pid].slice(-n);
    if (!next.length) return;
    set(scheme, next);
  };
  return (
    <Section
      title="Junk defense"
      right={
        <Help title="Junk defenses">
          <p>
            <b>{SCHEME_META.box1.label}:</b> {SCHEME_META.box1.help}
          </p>
          <p>
            <b>{SCHEME_META.tri2.label}:</b> {SCHEME_META.tri2.help}
          </p>
          <p>
            Planned on named players, it plays only while one of them is on the floor: the rest of the game you play your usual defense. The staff sends your best perimeter
            defenders (or whoever you plan on Matchups) to chase; the rest play a zone behind them. Test it first.
          </p>
        </Help>
      }
    >
      <div className="mu-group">
        <Chips
          label="Junk defense"
          value={n ? scheme : 'man'}
          disabled={simming}
          onChange={pickScheme}
          options={[
            { id: 'man' as DefScheme, label: 'None' },
            { id: 'box1' as DefScheme, label: SCHEME_META.box1.label },
            { id: 'tri2' as DefScheme, label: SCHEME_META.tri2.label },
          ]}
        />
        {n > 0 && theirs.length > 0 && (
          <div className="mu-sub">
            <div className="over">Chase {n === 2 ? 'two' : 'one'}</div>
            <div className="chips" role="group" aria-label="Players to chase">
              {creators.map((p) => (
                <button key={p.pid} className={`chip ${chase.includes(p.pid) ? 'on' : ''}`} aria-pressed={chase.includes(p.pid)} disabled={simming} onClick={() => toggle(p.pid)}>
                  {names(p.pid)}
                </button>
              ))}
            </div>
            {!chase.length && <div className="mu-note">Nobody named: the chasers take their main creators on the floor, all game.</div>}
          </div>
        )}
      </div>
    </Section>
  );
}

/** How much a player creates for his team, as the engine ranks main creators (role and freedom aside). */
function creatorScore(p: Player) {
  const c = composites(p.ratings);
  return c.create + c.pnrHandle + c.postScore;
}
