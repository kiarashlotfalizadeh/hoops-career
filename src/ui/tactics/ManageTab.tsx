// Tactics → Game Mgmt: late-game rules, timeouts and substitutions, crunch time (the go-to player,
// the after-timeout play, the assistant's adjustments) and situational plans.
import type { Player, Tactics } from '../../core/types';
import { Chips, Help, Section, Slider, Toggle } from '../components/ui';
import { Term } from '../components/Glossary';
import { CrunchTimeCard } from './CrunchTimeCard';
import { SituationsCard } from './SituationsCard';
import { tweak } from './edit';

export function ManageTab({ t, players }: { t: Tactics; players: Player[] }) {
  return (
    <>
      <Section
        title="Late-game rules"
        right={
          <Help title="Late-game rules">
            <p>
              <b>Foul when up 3:</b> in the final seconds, foul before the opponent can attempt a tying three.
            </p>
            <p>
              <b>Foul to give:</b> with 3 to 8 seconds left in a quarter and the ball theirs, foul at once when it&apos;s only a side out (it won&apos;t put them in the bonus):
              they inbound with less time and a worse first look. In the 4th and overtime only when you&apos;re tied or up by 3 or less (Foul when up 3 goes first). About one in
              twenty is called on the shot: two free throws.
            </p>
            <p>
              <b>Foul when trailing late:</b> stop the clock with intentional fouls when behind in the final minute.
            </p>
            <p>
              <b>Go for 2-for-1:</b> take a quick shot with ~35 seconds left in a quarter to get the last possession too.
            </p>
            <p>
              <b>Rest starters in blowouts:</b> empty the bench late in lopsided games to save legs and avoid injuries.
            </p>
            <p>
              <b>Hack-a-player threshold:</b> intentionally foul opposing players who shoot below this free-throw percentage (never in the last two minutes of a period, where the
              rules punish it).
            </p>
          </Help>
        }
      >
        <div className="card flush list">
          <div className="tx-ctl">
            <Toggle on={t.manage.foulUp3} onChange={(x) => tweak((tt) => void (tt.manage.foulUp3 = x))} label="Foul when up 3" />
          </div>
          <div className="tx-ctl">
            <Toggle on={!!t.manage.foulToGive} onChange={(x) => tweak((tt) => void (tt.manage.foulToGive = x))} label="Foul to give" />
          </div>
          <div className="tx-ctl">
            <Toggle on={t.manage.foulWhenTrailing} onChange={(x) => tweak((tt) => void (tt.manage.foulWhenTrailing = x))} label="Foul when trailing late" />
          </div>
          <div className="tx-ctl">
            <Toggle on={t.manage.twoForOne} onChange={(x) => tweak((tt) => void (tt.manage.twoForOne = x))} label="Go for 2-for-1" />
          </div>
          <div className="tx-ctl">
            <Toggle on={t.manage.garbageTime} onChange={(x) => tweak((tt) => void (tt.manage.garbageTime = x))} label="Rest starters in blowouts" />
          </div>
          <div className="tx-ctl">
            <Slider
              label={<Term id="hack">Hack-a-player threshold</Term>}
              name="Hack-a-player threshold"
              value={t.manage.hackThreshold}
              min={0}
              max={65}
              step={5}
              onChange={(x) => tweak((tt) => void (tt.manage.hackThreshold = x))}
              format={(x) => (x === 0 ? 'Off' : `< ${x}% FT`)}
            />
          </div>
        </div>
      </Section>
      <Section
        title="Timeouts & substitutions"
        right={
          <Help title="Timeouts & substitutions">
            <p>
              <b>Auto timeouts:</b> a timeout rests legs (a little energy back) and resets the run, but it also gives their coach a chance to adjust.
            </p>
            <p>
              <b>Foul trouble:</b> Standard sits a player at 2 fouls in Q1, 3 in Q2, 4 in Q3 and 5 in Q4 (until the last six minutes). Loose leaves him in longer; Strict sits him
              sooner.
            </p>
            <p>
              <b>Sub out tired players:</b> fatigue lowers shooting and defense and raises injury risk. Higher values mean shorter stints.
            </p>
          </Help>
        }
      >
        <div className="card flush list">
          <div className="tx-ctl">
            <Toggle on={t.manage.autoTimeouts} onChange={(x) => tweak((tt) => void (tt.manage.autoTimeouts = x))} label="Auto timeouts to stop runs" />
          </div>
          <div className="tx-ctl">
            <Slider
              label="Timeout after a run of"
              value={t.manage.timeoutRun}
              disabled={!t.manage.autoTimeouts}
              min={6}
              max={14}
              onChange={(x) => tweak((tt) => void (tt.manage.timeoutRun = x))}
              format={(x) => `${x}-0`}
            />
          </div>
          <div className="tx-ctl tx-ctl-chips">
            <div className="slider-label">Foul trouble</div>
            <Chips
              label="Foul trouble"
              value={t.manage.foulTrouble}
              onChange={(x: Tactics['manage']['foulTrouble']) => tweak((tt) => void (tt.manage.foulTrouble = x))}
              options={[
                { id: 'loose', label: 'Loose' },
                { id: 'standard', label: 'Standard' },
                { id: 'strict', label: 'Strict' },
              ]}
            />
          </div>
          <div className="tx-ctl">
            <Slider
              label="Sub out tired players at"
              value={Math.round(t.manage.fatigueSub * 100)}
              min={30}
              max={80}
              onChange={(x) => tweak((tt) => void (tt.manage.fatigueSub = x / 100))}
              format={(x) => `${x}% energy`}
            />
          </div>
        </div>
      </Section>
      <CrunchTimeCard t={t} edit={tweak} players={players} />
      <SituationsCard t={t} edit={tweak} />
    </>
  );
}
