// Tactics → Instructions, out of possession: the headline decisions (the ball-screen coverage with how
// your starting big suits it, ball pressure and help defense: the ones whose worth turns on the
// opponent), then Fine-tune (switching off the ball, the star plan). The scheme is the board's, at its
// out-of-possession end. Each control marks the identity's own setting.
import type { ReactNode } from 'react';
import { useLeague } from '../../state/store';
import type { PnrCoverage, StarPlan, Tactics } from '../../core/types';
import { COVERAGE_META, STAR_PLAN_META } from '../../core/sim/tactics';
import { composites } from '../../core/ratings';
import { shortName } from '../../core/league/helpers';
import { ratingText } from '../../core/analysis/guarding';
import { Chips, Help, Tag, Toggle } from '../components/ui';
import { Term } from '../components/Glossary';
import { tweak } from './edit';
import { defPresetOf } from './PlaybookLine';
import { Lv } from './Lv';

/** A choice's name, with the dot when it's the identity's own. */
export const optLabel = (label: string, mine: boolean): ReactNode => (
  <>
    {label}
    {mine && (
      <>
        <i className="tx-dot" aria-hidden="true" />
        <span className="sr-only">, the style&apos;s own</span>
      </>
    )}
  </>
);

type Props = { t: Tactics };

/** Out of possession's headline decisions: the ball-screen coverage, ball pressure, help defense. */
export function OutOfPossession({ t }: Props) {
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
          <Term id="pnr">Ball-screen coverage</Term>
        </div>
        <Chips
          label="Ball-screen coverage"
          value={t.defense.pnr}
          onChange={(x: PnrCoverage) => tweak((tt) => void (tt.defense.pnr = x))}
          options={(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => ({ id: k, label: optLabel(COVERAGE_META[k].label, k === pv.pnr) }))}
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
      <Lv label="Ball pressure" level="pressure" value={t.defense.pressure} mark={pv.pressure} set={(tt, x) => void (tt.defense.pressure = x)} />
      <Lv label="Help defense" level="help" value={t.defense.help} mark={pv.help} set={(tt, x) => void (tt.defense.help = x)} />
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
          help="Stops handoffs and movement shooters. Switched bigs get driven on, and switched guards get posted up."
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
            <p>It goes at the other team&apos;s lead creator every game. To pick the player, use that opponent&apos;s game plan.</p>
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
      {(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => (
        <p key={k}>
          <b>{COVERAGE_META[k].label}:</b> {COVERAGE_META[k].help}
        </p>
      ))}
      <p>Drop needs a big who protects the rim. Switching and hedging need one who moves.</p>
      <p>
        <b>Ball pressure:</b> more steals and turnovers, and more fouls. Secure handlers blow by it.
      </p>
      <p>
        <b>Help defense:</b> packing the paint walls off drives and gives up kick-out threes. Stay home against shooters.
      </p>
      <p>Each pays against some teams and costs against others. A game plan sets them for one opponent.</p>
      <p>A dot marks your identity&apos;s own setting. The scheme is on the board, out of possession.</p>
    </Help>
  );
}
