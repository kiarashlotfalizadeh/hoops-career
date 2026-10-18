// Tactics → Defense: the base scheme, pick-and-roll coverage (with how your starting big suits it),
// help and pressure, the full-court press and the star plan.
import { useLeague } from '../../state/store';
import type { DefScheme, PnrCoverage, PressMode, StarPlan, Tactics } from '../../core/types';
import { ALL_SCHEMES, COVERAGE_META, PRESS_META, SCHEME_META, STAR_PLAN_META, TACTIC_LEVELS } from '../../core/sim/tactics';
import { attrDisplay, composites } from '../../core/ratings';
import { Chips, Help, Levels, Section, Tag, Toggle } from '../components/ui';
import { tweak } from './edit';

export function DefenseTab({ t }: { t: Tactics }) {
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
  return (
    <>
      <Section
        title="Base scheme"
        right={
          <Help title="Schemes">
            {ALL_SCHEMES.map((k) => (
              <p key={k}>
                <b>{SCHEME_META[k].label}:</b> {SCHEME_META[k].help}
              </p>
            ))}
            <p>
              A box-and-one or triangle-and-two as your base scheme sends its chasers at their main creators on the floor, every game. To name who, and play it only while
              they&apos;re on the floor, use a game plan (Junk defense) or the live Adjust sheet.
            </p>
          </Help>
        }
      >
        <div className="card col tx-group tight">
          <Chips
            label="Base scheme"
            value={t.defense.scheme}
            onChange={(x: DefScheme) => tweak((tt) => void (tt.defense.scheme = x))}
            options={ALL_SCHEMES.map((k) => ({ id: k, label: SCHEME_META[k].label }))}
          />
        </div>
      </Section>
      <Section
        title="Pick-and-roll coverage"
        right={
          <Help title="Coverages explained">
            {(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => (
              <p key={k}>
                <b>{COVERAGE_META[k].label}:</b> {COVERAGE_META[k].help}
              </p>
            ))}
            <p>Drop needs a big who protects the rim; switching and hedging need one who moves. Blitzing needs length and quick hands behind it; ice needs disciplined guards.</p>
            <p>
              <b>Switch off-ball screens:</b> neutralizes handoffs and movement shooters, but a big switched onto a guard gets attacked off the dribble, and a guard switched onto a
              big gets posted up (and fouls).
            </p>
          </Help>
        }
      >
        <div className="card col tx-group tight">
          <Chips
            label="Pick-and-roll coverage"
            value={t.defense.pnr}
            onChange={(x: PnrCoverage) => tweak((tt) => void (tt.defense.pnr = x))}
            options={(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => ({ id: k, label: COVERAGE_META[k].label }))}
          />
          {big && bigC && (t.defense.pnr === 'drop' || t.defense.pnr === 'switch' || t.defense.pnr === 'hedge') && (
            <div className="tx-bigfit">
              <span className="grow">
                <b>{big.lastName}</b>: rim protection {attrDisplay(bigC.rimProt)} · speed {attrDisplay(big.ratings.spd)}
              </span>
              {t.defense.pnr === 'drop' && fit(bigC.rimProt >= 60, 'Built for drop', 'Weak rim deterrent')}
              {t.defense.pnr === 'switch' && fit(big.ratings.spd >= 45, 'Mobile enough', 'Guards will hunt him')}
              {t.defense.pnr === 'hedge' && fit(big.ratings.spd >= 45, 'Can show and recover', 'Slow to recover')}
            </div>
          )}
          <div className="tx-toggles">
            <Toggle on={t.defense.switchOffBall} onChange={(x) => tweak((tt) => void (tt.defense.switchOffBall = x))} label="Switch off-ball screens" />
          </div>
        </div>
      </Section>
      <Section
        title="Help & pressure"
        right={
          <Help title="Help & pressure">
            <p>
              <b>Help defense:</b> packing the paint walls off drives and post-ups but gives up kick-out threes. Stay home against good shooting teams.
            </p>
            <p>
              <b>Ball pressure:</b> more steals and turnovers, but quick creators blow by and backdoor cuts open up. Also more fouls.
            </p>
            <p>
              <b>Physicality:</b> tighter contests vs more free throws for the opponent.
            </p>
            <p>
              <b>Transition defense:</b> how hard you sprint back after your own shots. Sprinting back limits fast breaks but gives up some offensive rebounds; Crash the offensive
              glass (Offense) sets how many players go after them.
            </p>
          </Help>
        }
      >
        <div className="card col tx-group">
          <Levels label="Help defense" value={t.defense.help} names={TACTIC_LEVELS.help} onChange={(x) => tweak((tt) => void (tt.defense.help = x))} />
          <Levels label="Ball pressure" value={t.defense.pressure} names={TACTIC_LEVELS.pressure} onChange={(x) => tweak((tt) => void (tt.defense.pressure = x))} />
          <Levels label="Physicality" value={t.defense.physicality} names={TACTIC_LEVELS.physicality} onChange={(x) => tweak((tt) => void (tt.defense.physicality = x))} />
          <Levels label="Transition defense" value={t.defense.getBack} names={TACTIC_LEVELS.getBack} onChange={(x) => tweak((tt) => void (tt.defense.getBack = x))} />
        </div>
      </Section>
      <Section
        title="Full-court press"
        right={
          <Help title="Full-court press">
            {(Object.keys(PRESS_META) as PressMode[]).map((k) => (
              <p key={k}>
                <b>{PRESS_META[k].label}:</b> {PRESS_META[k].help}
              </p>
            ))}
          </Help>
        }
      >
        <div className="card col tx-group tight">
          <Chips
            label="Full-court press"
            value={t.defense.press}
            onChange={(x: PressMode) => tweak((tt) => void (tt.defense.press = x))}
            options={(Object.keys(PRESS_META) as PressMode[]).map((k) => ({ id: k, label: PRESS_META[k].label }))}
          />
        </div>
      </Section>
      <Section
        title="Star plan"
        right={
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
        }
      >
        <div className="card col tx-group tight">
          <Chips
            label="Star plan"
            value={t.defense.starPlan}
            onChange={(x: StarPlan) => tweak((tt) => void (tt.defense.starPlan = x))}
            options={(Object.keys(STAR_PLAN_META) as StarPlan[]).map((k) => ({ id: k, label: STAR_PLAN_META[k].label }))}
          />
        </div>
      </Section>
    </>
  );
}
