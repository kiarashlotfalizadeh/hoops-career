// Draft night: the team on the clock (your pick's buttons, or the next pick's), the picks coming up,
// the best available and the selections so far.
import { useState } from 'react';
import { ArrowLeftRight, Bot, FastForward, Play, SkipForward } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { draftOrder, nextPick } from '../../core/league/draft';
import { type MockDraft } from '../../core/league/mockDraft';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Section } from '../components/ui';
import { slabVars } from '../teamColors';
import { blockOffers } from '../office/tradeBlock';
import { overallPick } from '../league/shared';
import { draftedThisYear } from './common';
import { BoardList, SelectionRow } from './rows';

export function OnTheClock({
  league,
  hasPicks,
  busy,
  canTrade,
  onAuto,
  onNext,
  onTrade,
  onSimToMine,
  onSimToEnd,
  onFinish,
}: {
  league: League;
  hasPicks: boolean;
  busy: boolean;
  canTrade: boolean;
  onAuto: () => void;
  onNext: () => void;
  onTrade: (dpid: number) => void;
  onSimToMine: () => void;
  onSimToEnd: () => void;
  onFinish: () => void;
}) {
  const np = nextPick(league);
  const user = league.userTid;
  // on the clock: how many teams would trade up into the pick (each one's best package)
  const onClock = np?.tid === user;
  const clockPick = np?.dpid;
  const offers = useLeagueMemo(
    () => (onClock && canTrade && clockPick !== undefined ? blockOffers(league, { pids: [], dpids: [clockPick] }).length : 0),
    [league, onClock, canTrade, clockPick],
  );
  if (!np) {
    return (
      <section className="card accent fo-now" aria-label="Draft complete">
        <div className="fo-now-over">Draft complete</div>
        <h2 className="fo-now-t">All picks are in</h2>
        <p className="fo-now-s">Next: re-sign your own players.</p>
        <button className="btn primary block" disabled={busy} onClick={onFinish}>
          Continue to re-signing
        </button>
      </section>
    );
  }
  const mine = np.tid === user;
  const t = league.teams[np.tid];
  const n = overallPick(league, np.round, np.pick!);
  return (
    // the team on the clock, in its colours
    <section className="slab fo-clock" style={slabVars(t.colors)} aria-label={`On the clock: pick ${n}`}>
      <span className="slab-mark">
        <TeamLogo tid={np.tid} size={170} decorative />
      </span>
      <div className="fo-clock-over">
        <span className="fo-live">On the clock</span>
        <span>
          Round {np.round} · Pick {np.pick}
        </span>
      </div>
      <div className="fo-clock-main">
        <span className="fo-clock-n num">#{n}</span>
        <div className="grow">
          <div className="fo-clock-team">{mine ? "You're up" : t.name}</div>
          <div className="fo-clock-sub">
            {mine ? `${t.region} ${t.name}` : t.region}
            {np.originalTid !== np.tid && ` · via ${league.teams[np.originalTid].abbrev}`}
          </div>
        </div>
        <TeamLogo tid={np.tid} size={52} decorative />
      </div>
      {mine ? (
        <>
          <p className="fo-clock-s">Draft from the board below, or take the staff's pick.</p>
          <div className="fo-clock-btns">
            <button className="btn sm primary" disabled={busy} onClick={onAuto}>
              <Bot size={16} /> Take the staff's pick
            </button>
            {canTrade && (
              <button className="btn sm" disabled={!offers || busy} onClick={() => onTrade(np.dpid)}>
                <ArrowLeftRight size={15} /> Offers ({offers})
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="fo-clock-btns">
          <button className="btn sm primary" disabled={busy} onClick={onNext}>
            <SkipForward size={15} /> Next pick
          </button>
          {hasPicks && (
            <button className="btn sm" disabled={busy} onClick={onSimToMine}>
              <Play size={15} fill="currentColor" /> Sim to my pick
            </button>
          )}
          {canTrade && (
            <button className="btn sm" disabled={busy} onClick={() => onTrade(np.dpid)}>
              <ArrowLeftRight size={15} /> Trade for #{n}
            </button>
          )}
          <button className="btn sm" disabled={busy} onClick={onSimToEnd}>
            <FastForward size={16} /> Auto-draft the rest
          </button>
        </div>
      )}
    </section>
  );
}

export function LiveView({
  league,
  cls,
  mock,
  onClock,
  onOpen,
  onDraft,
  onTrade,
}: {
  league: League;
  cls: Player[];
  mock: MockDraft | null;
  onClock: boolean;
  onOpen: (pid: number) => void;
  onDraft: (pid: number) => void;
  /** Open the trade sheet for a pick (absent when trading is closed). */
  onTrade?: (dpid: number) => void;
}) {
  const [all, setAll] = useState(false);
  const order = draftOrder(league);
  const picks = useLeagueMemo(() => draftedThisYear(league).reverse(), [league]);
  return (
    <>
      {order.length > 1 && (
        <Section title="Up next" right={onTrade ? <span className="tiny dim">Tap a pick to trade for it</span> : undefined}>
          <div className="hscroll">
            {order.slice(1, 13).map((d) => {
              const n = overallPick(league, d.round, d.pick!);
              const body = (
                <>
                  <span className="n num">#{n}</span>
                  <TeamLogo tid={d.tid} size={26} decorative />
                  <span className="ab">{league.teams[d.tid].abbrev}</span>
                </>
              );
              return onTrade ? (
                <button
                  key={d.dpid}
                  className={`fo-pickchip ${d.tid === league.userTid ? 'me' : ''}`}
                  aria-label={d.tid === league.userTid ? `Offers for your pick #${n}` : `Trade for #${n} (${league.teams[d.tid].abbrev})`}
                  onClick={() => onTrade(d.dpid)}
                >
                  {body}
                </button>
              ) : (
                <div key={d.dpid} className={`fo-pickchip ${d.tid === league.userTid ? 'me' : ''}`}>
                  {body}
                </div>
              );
            })}
          </div>
        </Section>
      )}
      <Section title={onClock ? 'Best available · your pick' : 'Best available'} right={<span className="tiny dim">{cls.length} left</span>}>
        <BoardList league={league} list={cls.slice(0, 30)} mock={mock} onOpen={onOpen} onDraft={onClock ? onDraft : undefined} />
      </Section>
      {picks.length > 0 && (
        <Section title="Selections">
          <div className="card flush">
            <div className="list wide2">
              {(all ? picks : picks.slice(0, 8)).map((p) => (
                <SelectionRow key={p.pid} league={league} p={p} />
              ))}
            </div>
            {picks.length > 8 && (
              <button className="btn ghost block fo-more-btn" onClick={() => setAll(!all)}>
                {all ? 'Show fewer' : `Show all ${picks.length} picks`}
              </button>
            )}
          </div>
        </Section>
      )}
    </>
  );
}
