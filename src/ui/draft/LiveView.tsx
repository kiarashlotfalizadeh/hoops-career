// Draft night: the team on the clock (your pick's buttons, or the next pick's), the announcer for
// the picks as they're made, your latest pick, the picks coming up, the best available and the
// selections so far (each graded against the big board).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { draftedThisYear, pickWords } from './common';
import { BoardList, GradeTag, SelectionRow } from './rows';
import { playerName } from '../../core/league/helpers';
import { OvrPot } from '../office/common';
import './draft-night.css';

/** How long each pick holds the stage, and the beat before the name. */
const PICK_MS = 1300;
const NAME_MS = 420;
/** A run of picks made at once (a sim to the user's pick) announces only its last few. */
const ANNOUNCE_MAX = 4;

/**
 * Draft night's announcer: each pick made since the screen opened takes the stage in turn, "With
 * the 5th pick, the Charlotte Hornets select..." and, a beat later, the name, with his grade
 * against the big board. A tap skips the rest; the picks already on the board when the screen
 * opened aren't announced again.
 */
function Announcer({ league, picks }: { league: League; picks: Player[] }) {
  const seen = useRef(picks.length);
  const [queue, setQueue] = useState<number[]>([]);
  const [named, setNamed] = useState(false);
  useEffect(() => {
    if (picks.length < seen.current) seen.current = picks.length;
    if (picks.length === seen.current) return;
    const fresh = picks.slice(seen.current).map((p) => p.pid);
    seen.current = picks.length;
    setQueue((q) => [...q, ...fresh].slice(-ANNOUNCE_MAX));
  }, [picks]);
  const cur = queue[0];
  useEffect(() => {
    if (cur === undefined) return;
    setNamed(false);
    const a = window.setTimeout(() => setNamed(true), NAME_MS);
    // the user's own pick holds the stage longer
    const mine = league.players[cur]?.draft.tid === league.userTid;
    const b = window.setTimeout(() => setQueue((q) => q.slice(1)), mine ? PICK_MS * 2 : PICK_MS);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = cur !== undefined ? league.players[cur] : undefined;
  if (!p || p.draft.tid === null) return null;
  const t = league.teams[p.draft.tid];
  const n = overallPick(league, p.draft.round, p.draft.pick);
  const mine = t.tid === league.userTid;
  return (
    <button
      type="button"
      className={`slab dn-stage ${mine ? 'mine' : ''}`}
      style={slabVars(t.colors)}
      onClick={() => setQueue([])}
      aria-live="polite"
      aria-label="Skip the announcements"
    >
      <span className="dn-stage-over">
        With the {pickWords(n)} in the {league.season} draft, {mine ? 'you select' : `the ${t.region} ${t.name} select`}
        {named ? '' : '…'}
      </span>
      <span className="dn-stage-pick num" aria-hidden="true">
        #{n}
      </span>
      {named ? (
        <span className="dn-stage-name fade-in">
          <span className="dn-stage-n">{playerName(p)}</span>
          <span className="dn-stage-meta">
            {p.pos} · {p.college || p.country} <GradeTag league={league} p={p} />
          </span>
        </span>
      ) : (
        <span className="dn-stage-name dn-wait" aria-hidden="true">
          <span className="dn-dot" />
          <span className="dn-dot" />
          <span className="dn-dot" />
        </span>
      )}
      {queue.length > 1 && <span className="dn-stage-skip">Tap to skip · {queue.length - 1} more</span>}
    </button>
  );
}

/** The user's latest pick in this draft, as its moment: the pick, the player, the grade, his page. */
function YourPick({ league, picks }: { league: League; picks: Player[] }) {
  const mine = picks.filter((p) => p.draft.tid === league.userTid);
  const p = mine[mine.length - 1];
  if (!p) return null;
  const n = overallPick(league, p.draft.round, p.draft.pick);
  return (
    <Link to={`/player/${p.pid}`} className="card dn-yours">
      <span className="dn-yours-over">Your pick · #{n}</span>
      <span className="row" style={{ gap: 12, alignItems: 'center' }}>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="dn-yours-n">{playerName(p)}</span>
          <span className="dn-yours-meta">
            {p.pos} · {p.archetype} <GradeTag league={league} p={p} />
          </span>
          {/* what the staff read before the pick, beside what he is now he's ours */}
          {p.draft.read?.staff && (
            <span className="dn-yours-meta">
              Staff read {p.draft.read.staff.ovr} · POT {p.draft.read.staff.pot}
            </span>
          )}
        </span>
        <OvrPot p={p} />
      </span>
    </Link>
  );
}

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
      <div className="fo-clock-over">
        <span className="fo-live">On the clock</span>
        <span>
          {np.round === 1 ? '1st' : '2nd'} round · pick {np.pick}
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
              <Play size={15} fill="currentColor" /> Sim to your pick
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
  const inOrder = useLeagueMemo(() => draftedThisYear(league), [league]);
  return (
    <>
      <Announcer league={league} picks={inOrder} />
      <YourPick league={league} picks={inOrder} />
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
