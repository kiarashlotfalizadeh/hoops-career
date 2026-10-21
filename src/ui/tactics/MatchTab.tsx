// Tactics → Match: what the team does as a game turns. Crunch time first (the go-to player, the
// after-timeout play, the assistant's adjustments), then the situational plans; the late-game rules,
// timeouts and substitutions one tap down, under More rules.
import type { Player, Tactics } from '../../core/types';
import { Chips, Help, Slider, Toggle } from '../components/ui';
import { Term } from '../components/Glossary';
import { CrunchTimeCard } from './CrunchTimeCard';
import { SituationsCard } from './SituationsCard';
import { Disclosure } from './Disclosure';
import { tweak } from './edit';

export function MatchTab({ t, players }: { t: Tactics; players: Player[] }) {
  const m = t.manage;
  return (
    <>
      <CrunchTimeCard t={t} edit={tweak} players={players} />
      <SituationsCard t={t} edit={tweak} />
      <Disclosure label="More rules" meta="Late game, timeouts and substitutions">
        <div className="list">
          <div className="list-divider list-h tx-fine-h">
            <span>Late game</span>
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
          </div>
          <div className="tx-ctl">
            <Toggle on={m.foulUp3} onChange={(x) => tweak((tt) => void (tt.manage.foulUp3 = x))} label="Foul when up 3" />
          </div>
          <div className="tx-ctl">
            <Toggle on={!!m.foulToGive} onChange={(x) => tweak((tt) => void (tt.manage.foulToGive = x))} label="Foul to give" />
          </div>
          <div className="tx-ctl">
            <Toggle on={m.foulWhenTrailing} onChange={(x) => tweak((tt) => void (tt.manage.foulWhenTrailing = x))} label="Foul when trailing late" />
          </div>
          <div className="tx-ctl">
            <Toggle on={m.twoForOne} onChange={(x) => tweak((tt) => void (tt.manage.twoForOne = x))} label="Go for 2-for-1" />
          </div>
          <div className="tx-ctl">
            <Toggle on={m.garbageTime} onChange={(x) => tweak((tt) => void (tt.manage.garbageTime = x))} label="Rest starters in blowouts" />
          </div>
          <div className="tx-ctl">
            <Slider
              label={<Term id="hack">Hack-a-player threshold</Term>}
              name="Hack-a-player threshold"
              value={m.hackThreshold}
              min={0}
              max={65}
              step={5}
              onChange={(x) => tweak((tt) => void (tt.manage.hackThreshold = x))}
              format={(x) => (x === 0 ? 'Off' : `< ${x}% FT`)}
            />
          </div>
          <div className="list-divider list-h tx-fine-h">
            <span>Timeouts and substitutions</span>
            <Help title="Timeouts and substitutions">
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
          </div>
          <div className="tx-ctl">
            <Toggle on={m.autoTimeouts} onChange={(x) => tweak((tt) => void (tt.manage.autoTimeouts = x))} label="Auto timeouts to stop runs" />
          </div>
          <div className="tx-ctl">
            <Slider
              label="Timeout after a run of"
              value={m.timeoutRun}
              disabled={!m.autoTimeouts}
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
              value={m.foulTrouble}
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
              value={Math.round(m.fatigueSub * 100)}
              min={30}
              max={80}
              onChange={(x) => tweak((tt) => void (tt.manage.fatigueSub = x / 100))}
              format={(x) => `${x}% energy`}
            />
          </div>
        </div>
      </Disclosure>
    </>
  );
}
