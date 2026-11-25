// Tactics → System's Advanced drawer: the game's management in one place, closed until asked for,
// under plain headings (no drawers inside it). Crunch time: the go-to player and the after-timeout
// play. Late game: fouling, 2-for-1, late subs, blowouts. Timeouts and substitutions. Simmed games:
// the assistant's adjustments. How the team plays is Team Instructions (tactics/instructions).
// Nothing here names an opponent: a star to double, a defender to target and players to hack are an
// opponent's Game Plan (Games → the matchup → Game Plan).
import type { ReactNode } from 'react';
import type { Player, Tactics } from '../../core/types';
import { Chips, Help, Slider, Toggle } from '../components/ui';
import { CrunchTimeCard } from './CrunchTimeCard';
import { Disclosure } from './Disclosure';
import { tweak } from './edit';

/** A heading inside the drawer, with its Help. */
function Head({ children, help }: { children: ReactNode; help?: ReactNode }) {
  return (
    <div className="tx-fine-h tx-fine-sub">
      <span className="over">{children}</span>
      {help}
    </div>
  );
}

export function Advanced({ t, players }: { t: Tactics; players: Player[] }) {
  const m = t.manage;
  return (
    <Disclosure label="Advanced" meta="Crunch time, late game, timeouts, simmed games">
      <div className="col tx-group tx-fine-pad">
        <CrunchTimeCard t={t} edit={tweak} players={players} />

        <Head
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
                <b>Offense-defense subs late:</b> your best bench defender comes in on defense in the last seconds of a close game.
              </p>
              <p>
                <b>Rest starters in blowouts:</b> empty the bench late in lopsided games.
              </p>
            </Help>
          }
        >
          Late game
        </Head>
        <div className="tx-toggles">
          <Toggle on={m.foulUp3} onChange={(x) => tweak((tt) => void (tt.manage.foulUp3 = x))} label="Foul when up 3" />
          <Toggle on={!!m.foulToGive} onChange={(x) => tweak((tt) => void (tt.manage.foulToGive = x))} label="Foul to give" />
          <Toggle on={m.foulWhenTrailing} onChange={(x) => tweak((tt) => void (tt.manage.foulWhenTrailing = x))} label="Foul when trailing late" />
          <Toggle on={m.twoForOne} onChange={(x) => tweak((tt) => void (tt.manage.twoForOne = x))} label="Go for 2-for-1" />
          <Toggle on={m.odSubs !== false} onChange={(x) => tweak((tt) => void (tt.manage.odSubs = x))} label="Offense-defense subs late" />
          <Toggle on={m.garbageTime} onChange={(x) => tweak((tt) => void (tt.manage.garbageTime = x))} label="Rest starters in blowouts" />
        </div>

        <Head
          help={
            <Help title="Timeouts and substitutions">
              <p>
                <b>Auto timeouts:</b> a team on a run shoots better until a basket or a timeout ends it. A timeout rests legs too, and lets their coach adjust.
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
          Timeouts and substitutions
        </Head>
        <div className="tx-toggles">
          <Toggle on={m.autoTimeouts} onChange={(x) => tweak((tt) => void (tt.manage.autoTimeouts = x))} label="Auto timeouts to stop runs" />
        </div>
        <Slider
          label="Timeout after a run of"
          value={m.timeoutRun}
          disabled={!m.autoTimeouts}
          min={6}
          max={14}
          onChange={(x) => tweak((tt) => void (tt.manage.timeoutRun = x))}
          format={(x) => `${x}-0`}
        />
        <div className="tx-lv">
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
        <Slider
          label="Sub out tired players at"
          value={Math.round(m.fatigueSub * 100)}
          min={30}
          max={80}
          onChange={(x) => tweak((tt) => void (tt.manage.fatigueSub = x / 100))}
          format={(x) => `${x}% energy`}
        />

        <Head>Simmed games</Head>
        <div className="tx-toggles">
          <Toggle
            // (on unless switched off, whoever runs the tactics: taking over the tactics doesn't turn it
            // off; see buildSimInput). The assistant has the AI coaches' menu at both ends, each kind
            // measured alone (scripts/tactics-lab/adjustments.ts) at about even or better and the losing
            // kinds never made, so the help says so and quotes no number (DESIGN.md)
            on={m.assistantAdjusts !== false}
            onChange={(x) =>
              tweak((tt) => {
                if (x) delete tt.manage.assistantAdjusts;
                else tt.manage.assistantAdjusts = false;
              })
            }
            label="Assistant adjusts in simmed games"
            help="At breaks he fixes what the other team cashes in on, as AI coaches do. Never in games you coach live."
          />
        </div>
      </div>
    </Disclosure>
  );
}
