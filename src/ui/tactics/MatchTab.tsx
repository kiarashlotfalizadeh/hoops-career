// Tactics → Match: what the team does as a game turns. Crunch time first (the go-to player, the
// after-timeout play); then game management as one card: the assistant's adjustments in simmed games,
// and the late-game rules and the timeouts and substitutions, each a row that opens.
import type { Player, Tactics } from '../../core/types';
import { Chips, Help, Section, Slider, Toggle } from '../components/ui';
import { Term } from '../components/Glossary';
import { CrunchTimeCard } from './CrunchTimeCard';
import { Disclosure } from './Disclosure';
import { tweak } from './edit';

export function MatchTab({ t, players }: { t: Tactics; players: Player[] }) {
  const m = t.manage;
  return (
    <>
      <CrunchTimeCard t={t} edit={tweak} players={players} />
      <Section title="Game management">
        <div className="card flush list">
          <div className="tx-ctl">
            <Toggle
              // (on unless switched off, whoever runs the tactics: taking over the tactics doesn't turn it
              // off; see buildSimInput). Measured again with injuries on (2026-10-25: 32 team runs over two
              // leagues, 28,160 paired games, each team's first 10-12): +0.05 ± 0.15 a game, about even, so
              // the help says so and quotes no number (DESIGN.md)
              on={m.assistantAdjusts !== false}
              onChange={(x) =>
                tweak((tt) => {
                  if (x) delete tt.manage.assistantAdjusts;
                  else tt.manage.assistantAdjusts = false;
                })
              }
              label="Assistant adjusts in simmed games"
              help={
                <>
                  <p>At breaks he fixes what the other team cashes in on, as AI coaches do. Never in games you coach live.</p>
                  <p>By the staff&apos;s measurements it comes out about even.</p>
                </>
              }
            />
          </div>
          <Disclosure
            bare
            label="Late game"
            meta="Fouling late, 2-for-1, blowouts, hack-a-player"
            help={
              <Help title="Late game">
                <p>
                  <b>Foul when up 3:</b> in the final seconds, foul before they can try a tying three.
                </p>
                <p>
                  <b>Foul to give:</b> late in a quarter, foul when it only gives them a side out. They inbound with less time.
                </p>
                <p>
                  <b>Foul when trailing late:</b> stop the clock with fouls when behind in the final minute.
                </p>
                <p>
                  <b>Go for 2-for-1:</b> shoot early with about 35 seconds left, to get the last trip.
                </p>
                <p>
                  <b>Rest starters in blowouts:</b> empty the bench late in lopsided games.
                </p>
                <p>
                  <b>Hack-a-player:</b> foul their players who shoot free throws below this. Never in a period&apos;s last two minutes.
                </p>
              </Help>
            }
          >
            <div className="list">
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
            </div>
          </Disclosure>
          <Disclosure
            bare
            label="Timeouts and substitutions"
            meta="Auto timeouts, foul trouble, tired legs"
            help={
              <Help title="Timeouts and substitutions">
                <p>
                  <b>Auto timeouts:</b> a timeout rests legs and stops the run. It also lets their coach adjust.
                </p>
                <p>
                  <b>Foul trouble:</b> Standard sits a player at 2 fouls in Q1, one more each quarter. Loose leaves him in longer, Strict sits him sooner.
                </p>
                <p>
                  <b>Sub out tired players:</b> tired legs shoot and defend worse and get hurt more. Higher means shorter stints.
                </p>
              </Help>
            }
          >
            <div className="list">
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
        </div>
      </Section>
    </>
  );
}
