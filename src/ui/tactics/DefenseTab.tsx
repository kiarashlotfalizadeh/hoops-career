// Tactics → Instructions, out of possession: the headline decisions (the base scheme, the ball-screen
// coverage with how your starting big suits it, ball pressure and help: the ones whose worth turns on
// the opponent), then Fine-tune (switching off the ball, the star plan). Each control marks the
// identity's own setting, and every scheme and coverage shows how well the team knows it, so the cost
// of a switch is in view before you make it.
import type { ReactNode } from 'react';
import { useLeague } from '../../state/store';
import type { DefScheme, Familiarity, PnrCoverage, StarPlan, Tactics } from '../../core/types';
import { ALL_SCHEMES, COVERAGE_META, SCHEME_META, STAR_PLAN_META } from '../../core/sim/tactics';
import { optValue } from '../../core/sim/familiarity';
import { composites } from '../../core/ratings';
import { shortName } from '../../core/league/helpers';
import { ratingText } from '../../core/analysis/guarding';
import { Chips, Help, Tag, Toggle } from '../components/ui';
import { Term } from '../components/Glossary';
import { tweak } from './edit';
import { defPresetOf } from './PlaybookLine';
import { famTone } from './formation';
import { Lv } from './Lv';

/**
 * A choice's name, with the dot when it's the identity's own, and how well the team knows it
 * (`key`: its familiarity key, 'pnr:blitz'; none for a choice with nothing to learn).
 */
export const optLabel = (label: string, mine: boolean, fam?: Familiarity, key?: string | null): ReactNode => {
  const v = fam && key ? optValue(fam, key) : null;
  return (
    <>
      {label}
      {mine && (
        <>
          <i className="tx-dot" aria-hidden="true" />
          <span className="sr-only"> (the style&apos;s own)</span>
        </>
      )}
      {v !== null && (
        <span className={`tx-optfam ${famTone(v)}`}>
          <span className="sr-only">, familiarity </span>
          {Math.round(v)}%
        </span>
      )}
    </>
  );
};

type Props = { t: Tactics; fam: Familiarity };

/** Out of possession's headline decisions: the base scheme, the ball-screen coverage, ball pressure, help. */
export function OutOfPossession({ t, fam }: Props) {
  const league = useLeague();
  const team = league.teams[league.userTid];
  // personnel hints, for the five who start next: the first healthy ones in the depth chart
  const starters = team.rotation.order
    .map((pid) => league.players[pid])
    .filter((p) => p && p.tid === team.tid && !p.injury)
    .slice(0, 5);
  const big = [...starters].sort((a, b) => b.ratings.hgt - a.ratings.hgt)[0];
  const bigC = big ? composites(big.ratings) : null;
  const fit = (good: boolean, yes: string, no: string) => <Tag tone={good ? 'good' : 'warn'}>{good ? yes : no}</Tag>;
  const pv = defPresetOf(t).values;
  return (
    <div className="card col tx-group">
      <div className="tx-lv">
        <div className="slider-label tx-label">
          <Term id="zone">Scheme</Term>
        </div>
        <Chips
          label="Scheme"
          value={t.defense.scheme}
          onChange={(x: DefScheme) => tweak((tt) => void (tt.defense.scheme = x))}
          options={ALL_SCHEMES.map((k) => ({ id: k, label: optLabel(SCHEME_META[k].label, k === pv.scheme, fam, `scheme:${k}`) }))}
        />
      </div>
      <div className="tx-lv">
        <div className="slider-label tx-label">
          <Term id="pnr">Ball-screen coverage</Term>
        </div>
        <Chips
          label="Ball-screen coverage"
          value={t.defense.pnr}
          onChange={(x: PnrCoverage) => tweak((tt) => void (tt.defense.pnr = x))}
          options={(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => ({ id: k, label: optLabel(COVERAGE_META[k].label, k === pv.pnr, fam, `pnr:${k}`) }))}
        />
        {big && bigC && (t.defense.pnr === 'drop' || t.defense.pnr === 'switch' || t.defense.pnr === 'hedge') && (
          <div className="tx-bigfit">
            <span className="grow">
              <b>{shortName(league, big)}</b>: {ratingText(big, 'blk')} · {ratingText(big, 'spd')}
            </span>
            {t.defense.pnr === 'drop' && fit(bigC.rimProt >= 60, 'Built for drop', 'Weak rim deterrent')}
            {t.defense.pnr === 'switch' && fit(big.ratings.spd >= 45, 'Mobile enough', 'Guards will hunt him')}
            {t.defense.pnr === 'hedge' && fit(big.ratings.spd >= 45, 'Can show and recover', 'Slow to recover')}
          </div>
        )}
      </div>
      <Lv label="Ball pressure" k="pressure" level="pressure" t={t} fam={fam} mark={pv.pressure} set={(tt, x) => void (tt.defense.pressure = x)} />
      <Lv label="Help" k="help" level="help" t={t} fam={fam} mark={pv.help} set={(tt, x) => void (tt.defense.help = x)} />
    </div>
  );
}

/** What's in Out of possession's Fine-tune, in a few words. */
export const OUT_POSS_FINE = 'Off-ball switches, star plan';

/** Out of possession's fine-tuning: switching off the ball, the star plan. */
export function OutOfPossessionFine({ t }: Props) {
  return (
    <>
      <div className="tx-toggles">
        <Toggle
          on={t.defense.switchOffBall}
          onChange={(x) => tweak((tt) => void (tt.defense.switchOffBall = x))}
          label="Switch off-ball screens"
          help="Neutralizes handoffs and movement shooters, but a big switched onto a guard gets attacked off the dribble, and a guard switched onto a big gets posted up (and fouls)."
        />
      </div>
      <div className="tx-lv tx-toggles">
        <div className="slider-label tx-label">
          Star plan
          <Help title="Star plan">
            {(Object.keys(STAR_PLAN_META) as StarPlan[]).map((k) => (
              <p key={k}>
                <b>{STAR_PLAN_META[k].label}:</b> {STAR_PLAN_META[k].help}
              </p>
            ))}
            <p>
              It applies to the opponent&apos;s primary creator each game. To go after a specific player, set a star plan in that opponent&apos;s game plan (on its matchup page),
              or change it during a live game.
            </p>
          </Help>
        </div>
        <Chips
          label="Star plan"
          value={t.defense.starPlan}
          onChange={(x: StarPlan) => tweak((tt) => void (tt.defense.starPlan = x))}
          options={(Object.keys(STAR_PLAN_META) as StarPlan[]).map((k) => ({ id: k, label: STAR_PLAN_META[k].label }))}
        />
      </div>
    </>
  );
}

/** Out of possession's Help: what each of its headline decisions does. */
export function OutOfPossessionHelp() {
  return (
    <Help title="Out of possession">
      {ALL_SCHEMES.map((k) => (
        <p key={k}>
          <b>{SCHEME_META[k].label}:</b> {SCHEME_META[k].help}
        </p>
      ))}
      <p>
        A box-and-one or triangle-and-two as your scheme sends its chasers at their main creators on the floor, every game. To name who, and play it only while they&apos;re on the
        floor, use a game plan (Junk defense) or the live game&apos;s tactics.
      </p>
      {(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => (
        <p key={k}>
          <b>{COVERAGE_META[k].label}:</b> {COVERAGE_META[k].help}
        </p>
      ))}
      <p>Drop needs a big who protects the rim; switching and hedging need one who moves. Blitzing needs length and quick hands behind it; ice needs disciplined guards.</p>
      <p>
        These turn on who you play: a 2-3 zone or packing the paint pays against a team that can&apos;t shoot and costs against one that can (the open looks they leave count by who
        takes them), drop pays against a handler who can&apos;t shoot off the dribble and costs against one who can, and ball pressure pays against loose handlers and gets beaten
        by secure ones. A game plan sets them for one opponent; the staff measures each against the next game (Games → matchup → Plan).
      </p>
      <p>
        <b>Ball pressure:</b> more steals and turnovers, but secure handlers blow by and backdoor cuts open up. Also more fouls. <b>Help:</b> packing the paint walls off drives and
        post-ups but gives up kick-out threes. Stay home against good shooting teams.
      </p>
      <p>
        The % on a scheme or coverage is how well your team knows it (<Term id="familiarity">familiarity</Term>): below 95 they play it a step slow.
      </p>
    </Help>
  );
}
