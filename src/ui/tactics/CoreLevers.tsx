// Tactics → System's core settings, front and centre under the board: the five dials whose worth
// turns on the roster and the opponent. Offense: the tempo and the shot profile. Defense: the
// ball-screen coverage (with how your starting big suits it), ball pressure and help defense. Each
// control marks the style's own setting with a dot; the line over them says how many settings have
// moved from the style, across the whole system, with Put back. Everything else is in Advanced.
import type { ReactNode } from 'react';
import { useLeague } from '../../state/store';
import type { PnrCoverage, Tactics } from '../../core/types';
import { COVERAGE_META } from '../../core/sim/tactics';
import { composites } from '../../core/ratings';
import { shortName } from '../../core/league/helpers';
import { ratingText } from '../../core/analysis/guarding';
import { Chips, Help, Section, Tag } from '../components/ui';
import { Term } from '../components/Glossary';
import { tweak } from './edit';
import { PlaybookLine, defPresetOf, offPresetOf } from './PlaybookLine';
import { Lv } from './Lv';

/** A choice's name, with the dot when it's the style's own. */
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

export function CoreLevers({ t }: { t: Tactics }) {
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
  const ov = offPresetOf(t).values;
  const dv = defPresetOf(t).values;
  return (
    <Section
      title="Core settings"
      right={
        <Help title="Core settings">
          <p>
            <b>Tempo:</b> how long you take in the half court. Faster means more possessions, turnovers and fatigue.
          </p>
          <p>
            <b>Shot profile:</b> higher turns mid-range looks into threes. It pays with shooters and costs without them.
          </p>
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
          <p>A dot marks your style&apos;s own setting. A game plan changes any of them for one opponent.</p>
        </Help>
      }
    >
      <PlaybookLine />
      <div className="card col tx-group">
        <div className="over">Offense</div>
        <Lv label="Tempo" level="pace" value={t.offense.pace} mark={ov.pace} set={(tt, x) => void (tt.offense.pace = x)} />
        <Lv label="Shot profile" level="threePoint" value={t.offense.threePoint} mark={ov.threePoint} set={(tt, x) => void (tt.offense.threePoint = x)} />
        <div className="over tx-core-h">Defense</div>
        <div className="tx-lv">
          <div className="slider-label tx-label">
            <Term id="pnr">Ball-screen coverage</Term>
          </div>
          <Chips
            label="Ball-screen coverage"
            value={t.defense.pnr}
            onChange={(x: PnrCoverage) => tweak((tt) => void (tt.defense.pnr = x))}
            options={(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => ({ id: k, label: optLabel(COVERAGE_META[k].label, k === dv.pnr) }))}
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
        <Lv label="Ball pressure" level="pressure" value={t.defense.pressure} mark={dv.pressure} set={(tt, x) => void (tt.defense.pressure = x)} />
        <Lv label="Help defense" level="help" value={t.defense.help} mark={dv.help} set={(tt, x) => void (tt.defense.help = x)} />
      </div>
    </Section>
  );
}
