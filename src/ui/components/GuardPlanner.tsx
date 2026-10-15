// The game plan's player-by-player defense and attack: how to guard each of their top eight (a
// scouting-report instruction, with the staff's suggestion and the numbers behind it), which of their
// defenders to attack, and a junk defense on the players their offense runs through.
import type { DefScheme, League, Player, PlayerDefense } from '../../core/types';
import { PLAYER_DEFENSES } from '../../core/types';
import { effectiveTactics, removePlanItem, setPlanItem, setPlanPlayerD } from '../../core/league/gamePlans';
import { guardingPlan, huntPick, type GuardAdvice } from '../../core/analysis/guarding';
import { projectedRotation } from '../../core/analysis/scouting';
import { PLAYER_D_META, SCHEME_META, chasers } from '../../core/sim/tactics';
import { attrDisplay, composites, fmtHeight } from '../../core/ratings';
import { useLeagueMemo, useStore } from '../../state/store';
import { rosterNames } from '../stats';
import { Card, Chips, Help, Ovr, Tag } from './ui';
import './scouting.css';

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

/** His shooting as a short line: "34.1% 3P on 5.2 a game · 71.0% FT" from his games, else nothing. */
function shootingLine(a: GuardAdvice): string {
  const l = a.line;
  if (l.source === 'ratings') return '';
  const parts = [Number.isFinite(l.tpPct) && l.tpa >= 0.5 ? `${pct1(l.tpPct)} 3P on ${l.tpa.toFixed(1)}` : `${l.tpa.toFixed(1)} 3PA`];
  if (Number.isFinite(l.ftPct) && l.fta >= 1) parts.push(`${pct1(l.ftPct)} FT`);
  return `${parts.join(' · ')} a game${l.source === 'last' ? ' (last season)' : ''}`;
}

/** How to guard them: an instruction for each of their projected top eight, the staff's suggestion starred (Advanced). */
export function GuardCard({ league, opp }: { league: League; opp: number }) {
  const mutate = useStore.getState().mutate;
  const advice = useLeagueMemo(() => guardingPlan(league, opp), [league, opp]);
  const eff = useLeagueMemo(() => effectiveTactics(league, opp), [league, opp]);
  const names = rosterNames(advice.map((a) => league.players[a.pid]));
  const set = (pid: number, d: PlayerDefense | null) => mutate((l) => setPlanPlayerD(l, opp, pid, d));
  const planned = eff.defense.playerD ?? {};
  return (
    <Card
      title="How to guard them"
      right={
        <Help title="How to guard them">
          {PLAYER_DEFENSES.map((d) => (
            <p key={d}>
              <b>{PLAYER_D_META[d].label}:</b> {PLAYER_D_META[d].help}
            </p>
          ))}
          <p>
            Each instruction is for this opponent only and plays whenever he&apos;s on the floor. ★ is the staff&apos;s suggestion, from his games when there are enough, his
            ratings otherwise.
          </p>
        </Help>
      }
    >
      {!advice.length ? (
        <div className="small dim">Their rotation isn&apos;t set yet.</div>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          {advice.map((a) => {
            const p = league.players[a.pid];
            const cur = planned[a.pid] ?? null;
            const line = shootingLine(a);
            return (
              <div key={a.pid} className="col gp-guard" style={{ gap: 6 }}>
                <div className="row between" style={{ gap: 8, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, minWidth: 0 }}>
                    <Ovr v={p.ovr} size="sm" />
                    <div style={{ minWidth: 0 }}>
                      <div className="bold ellipsis">{names(a.pid)}</div>
                      <div className="tiny dim2 ellipsis">
                        {p.pos} · {fmtHeight(p.heightIn)}
                        {line ? ` · ${line}` : ''}
                      </div>
                    </div>
                  </div>
                  {cur ? <Tag tone="info">{PLAYER_D_META[cur].short}</Tag> : <span className="tiny dim">Straight up</span>}
                </div>
                <Chips
                  label={`How to guard ${names(a.pid)}`}
                  value={cur ?? ('' as PlayerDefense)}
                  onChange={(d: PlayerDefense) => set(a.pid, d === cur ? null : d)}
                  options={PLAYER_DEFENSES.map((d) => ({ id: d, label: `${PLAYER_D_META[d].short}${d === a.suggest ? ' ★' : ''}` }))}
                />
                {a.suggest && a.why && (
                  <div className="tiny dim2">
                    ★ {PLAYER_D_META[a.suggest].label}: {a.why}
                  </div>
                )}
              </div>
            );
          })}
          <div className="tiny dim">Tap an instruction again to take it off.</div>
        </div>
      )}
    </Card>
  );
}

/** Attack one of their defenders: the staff suggests their weakest perimeter defender (Advanced). */
export function AttackCard({ league, opp }: { league: League; opp: number }) {
  const mutate = useStore.getState().mutate;
  const eff = useLeagueMemo(() => effectiveTactics(league, opp), [league, opp]);
  const theirs = useLeagueMemo(() => projectedRotation(league, opp, 8), [league, opp]);
  const pick = useLeagueMemo(() => huntPick(league, opp), [league, opp]);
  const names = rosterNames(theirs);
  const target = eff.offense.huntTarget ?? null;
  const per = (p: Player) => attrDisplay(composites(p.ratings).perDef);
  const set = (pid: number | null) =>
    mutate((l) => {
      if (pid === null) removePlanItem(l, opp, 'hunt');
      else setPlanItem(l, opp, { id: 'hunt', label: `Attack ${l.players[pid]?.lastName ?? ''}`, group: 'hunt', patch: { offense: { huntTarget: pid } } });
    });
  const sorted = [...theirs].sort((a, b) => per(a) - per(b) || a.pid - b.pid);
  return (
    <Card
      title="Attack"
      right={
        <Help title="Attack a defender">
          While he&apos;s on the floor your offense runs its isolations, post-ups and ball screens at the player he guards, and that player sets most of the ball screens, so a
          switch leaves him on your ball handler and a weak screen defender can&apos;t hold up the coverage. It costs some ball movement: motion and handoffs lose a little. Against
          a real weak link it&apos;s a small edge; against a good defender it costs points. It replaces Hunt mismatches while he plays.
        </Help>
      }
    >
      {!theirs.length ? (
        <div className="small dim">Their rotation isn&apos;t set yet.</div>
      ) : (
        <>
          <Chips
            label="Defender to attack"
            value={target ?? -1}
            onChange={(pid: number) => set(pid < 0 || pid === target ? null : pid)}
            options={[{ id: -1, label: 'Nobody' }, ...sorted.map((p) => ({ id: p.pid, label: `${names(p.pid)} ${per(p)}${p.pid === pick?.pid && pick.worth ? ' ★' : ''}` }))]}
          />
          <div className="tiny dim" style={{ marginTop: 8 }}>
            Perimeter defense on the 40-99 scale.{' '}
            {pick &&
              (pick.worth
                ? `★ ${names(pick.pid)} is their weakest perimeter defender (${pick.perDef}, their rotation ${pick.teamPerDef}).`
                : `Their weakest perimeter defender, ${names(pick.pid)} (${pick.perDef}), is close to the rest of their rotation (${pick.teamPerDef}): hunting him may not pay.`)}
          </div>
        </>
      )}
    </Card>
  );
}

/** A box-and-one or triangle-and-two on the players their offense runs through (Advanced). */
export function JunkCard({ league, opp }: { league: League; opp: number }) {
  const mutate = useStore.getState().mutate;
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
    mutate((l) => {
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
    <Card
      title="Junk defense"
      right={
        <Help title="Junk defenses">
          <p>
            <b>{SCHEME_META.box1.label}:</b> {SCHEME_META.box1.help}
          </p>
          <p>
            <b>{SCHEME_META.tri2.label}:</b> {SCHEME_META.tri2.help}
          </p>
          <p>Planned on named players, it plays only while one of them is on the floor: the rest of the game you play your usual defense. Test it in the Lab first.</p>
        </Help>
      }
    >
      <Chips
        label="Junk defense"
        value={n ? scheme : 'man'}
        onChange={pickScheme}
        options={[
          { id: 'man' as DefScheme, label: 'None' },
          { id: 'box1' as DefScheme, label: SCHEME_META.box1.label },
          { id: 'tri2' as DefScheme, label: SCHEME_META.tri2.label },
        ]}
      />
      {n > 0 && theirs.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="tiny upper dim bold" style={{ marginBottom: 6 }}>
            Chase {n === 2 ? 'two' : 'one'}
          </div>
          <div className="chips" role="group" aria-label="Players to chase">
            {creators.map((p) => (
              <button key={p.pid} className={`chip ${chase.includes(p.pid) ? 'on' : ''}`} aria-pressed={chase.includes(p.pid)} onClick={() => toggle(p.pid)}>
                {names(p.pid)}
              </button>
            ))}
          </div>
          <div className="small dim" style={{ marginTop: 8 }}>
            {chase.length
              ? `The staff sends ${n === 2 ? 'two of your best perimeter defenders' : 'one of your best perimeter defenders'} (or whoever you plan in Matchups) to chase ${chase.map(names).join(' and ')}; the rest play a ${n === 2 ? 'triangle' : '2-2 box'}. While ${chase.length === 2 ? 'neither is' : "he isn't"} on the floor you play man-to-man.`
              : `Nobody named: the chaser${n === 2 ? 's take their two main creators' : ' takes their main creator'} on the floor, all game.`}
          </div>
        </div>
      )}
    </Card>
  );
}

/** How much a player creates for his team, as the engine ranks main creators (role and freedom aside). */
function creatorScore(p: Player) {
  const c = composites(p.ratings);
  return c.create + c.pnrHandle + c.postScore;
}
