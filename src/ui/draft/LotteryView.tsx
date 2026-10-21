// The lottery's result: the top 14 in order, each team's odds for #1 and how far it moved. The
// first time it's opened the order is revealed from the 14th pick up, the four drawn picks slower,
// and the user's slot gets its moment; a tap skips to the whole order. (Whether it has been seen is
// remembered in this browser only: the league is the same either way.)
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FastForward, Sparkles } from 'lucide-react';
import type { DraftPick, League } from '../../core/types';
import { curTeamSeason } from '../../core/league/helpers';
import { draftOrder, lotteryOdds } from '../../core/league/draft';
import { ordinal, plural } from '../../core/format';
import { TeamLogo } from '../components/TeamLogo';
import { Empty, Section } from '../components/ui';
import { lotterySeen, markLotterySeen } from './common';
import './draft-night.css';

/** The pause before each pick is revealed: the drawn top four take longer. */
const BEAT_MS = 520;
const DRAWN_MS = 1100;

/** The user's slot in words: where he picks, and how the lottery moved him. */
function userLine(league: League, order: DraftPick[], pre: Map<number, { pre: number }>): { head: string; sub: string; up: boolean } | null {
  const mine = order.filter((d) => d.tid === league.userTid);
  if (!mine.length) return null;
  const d = mine[0];
  const from = pre.get(d.originalTid)?.pre ?? d.pick!;
  const move = from - d.pick!;
  const via = d.originalTid !== d.tid ? ` with ${league.teams[d.originalTid].abbrev}'s pick` : '';
  if (d.pick === 1) return { head: 'You won the lottery', sub: `The No. 1 pick${via}, from ${ordinal(from)} in the odds.`, up: true };
  if (move > 0) return { head: `You jump to No. ${d.pick}`, sub: `Up ${plural(move, 'place')} from ${ordinal(from)}${via}.`, up: true };
  if (move < 0) return { head: `You slip to No. ${d.pick}`, sub: `Down ${plural(-move, 'place')} from ${ordinal(from)}${via}: the balls didn't bounce your way.`, up: false };
  return { head: `You pick ${ordinal(d.pick!)}`, sub: `Right where the odds had you${via}.`, up: true };
}

export function LotteryView({ league, onTrade }: { league: League; onTrade?: (dpid: number) => void }) {
  const order = draftOrder(league).filter((d) => d.round === 1 && (d.pick ?? 99) <= 14);
  const n = order.length;
  const [shown, setShown] = useState(() => (lotterySeen(league) ? n : -1));
  const timer = useRef<number | undefined>(undefined);
  // the reveal runs a pick a beat once started (shown 0..n); -1 waits for the tap that starts it
  useEffect(() => {
    if (shown < 0 || shown >= n) return;
    const next = n - shown - 1; // the index of the pick about to show (bottom first)
    timer.current = window.setTimeout(() => setShown((s) => s + 1), next < 4 ? DRAWN_MS : BEAT_MS);
    return () => window.clearTimeout(timer.current);
  }, [shown, n]);
  useEffect(() => {
    if (shown >= n && n) markLotterySeen(league);
  }, [shown, n, league]);
  if (!order.length) return <Empty>Lottery results appear here after the playoffs.</Empty>;
  // the same pre-lottery order and chances the lottery used (tied teams split theirs)
  const pre = new Map(lotteryOdds(league).map((x) => [x.tid, x]));
  const done = shown >= n;
  const me = userLine(league, order, pre);
  const myRevealed = order.some((d, i) => d.tid === league.userTid && i >= n - Math.max(0, shown));
  const top = order[0];
  const topFrom = pre.get(top.originalTid)?.pre ?? 1;
  return (
    <>
      {shown < 0 && (
        <section className="card accent dn-start" aria-label="The lottery">
          <div className="fo-now-over">Draft lottery</div>
          <h2 className="fo-now-t">The balls have been drawn</h2>
          <p className="fo-now-s">Fourteen teams, four drawn picks. The order is revealed from the 14th pick up.</p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary grow" onClick={() => setShown(0)}>
              <Sparkles size={16} aria-hidden="true" /> Reveal the order
            </button>
            <button className="btn grow" onClick={() => setShown(n)}>
              Skip to the order
            </button>
          </div>
        </section>
      )}
      {me && myRevealed && (
        <section className={`dn-moment ${me.up ? 'up' : 'down'}`} aria-live="polite">
          <TeamLogo tid={league.userTid} size={40} decorative />
          <div className="grow">
            <div className="dn-moment-h">{me.head}</div>
            <div className="dn-moment-s">{me.sub}</div>
          </div>
        </section>
      )}
      {done && top.tid !== league.userTid && (
        <p className="dn-line">
          <b>
            {league.teams[top.tid].region} {league.teams[top.tid].name}
          </b>{' '}
          {topFrom > 1 ? `jump from ${ordinal(topFrom)} to win the No. 1 pick.` : 'keep the No. 1 pick the odds gave them.'}
        </p>
      )}
      {/* (the rows' percentages need their caption while trading is open too) */}
      <Section
        title="Lottery order"
        right={
          shown >= 0 && !done ? (
            <button className="card-link" onClick={() => setShown(n)}>
              <FastForward size={14} aria-hidden="true" /> Skip
            </button>
          ) : done ? (
            <span className="tiny dim">Odds for #1{onTrade ? ' · tap a pick to trade' : ''}</span>
          ) : null
        }
      >
        <div className="card flush list" aria-busy={!done}>
          {order.map((d, i) => {
            const visible = i >= n - Math.max(0, shown);
            if (!visible)
              return (
                <div key={d.dpid} className={`listrow fo-sel dn-hidden ${i === n - shown - 1 ? 'next' : ''}`}>
                  <span className="fo-rank">{d.pick}</span>
                  <span className="dn-q" aria-hidden="true">
                    ?
                  </span>
                  <div className="grow">
                    <div className="fo-name dim">{i < 4 ? 'Drawn pick' : 'To be revealed'}</div>
                  </div>
                </div>
              );
            const p0 = pre.get(d.originalTid)?.pre ?? d.pick!;
            const move = p0 - d.pick!;
            const ts = curTeamSeason(league, d.originalTid);
            const odds = (pre.get(d.originalTid)?.w ?? 0) / 10;
            const mine = d.tid === league.userTid;
            // a row opens the trade sheet for its pick while trading is open (once the order is out)
            const Row = onTrade && done ? 'button' : 'div';
            return (
              <Row key={d.dpid} className={`listrow fo-sel ${mine ? 'me' : ''} ${done ? '' : 'dn-in'}`} onClick={onTrade && done ? () => onTrade(d.dpid) : undefined}>
                <span className="fo-rank">{d.pick}</span>
                <TeamLogo tid={d.tid} size={30} decorative />
                <div className="grow">
                  <div className="fo-name">
                    {league.teams[d.tid].region} {league.teams[d.tid].name}
                  </div>
                  <div className="fo-meta">
                    {ts.won}-{ts.lost}
                    {d.originalTid !== d.tid ? ` · via ${league.teams[d.originalTid].abbrev}` : ''} · {odds.toFixed(1)}%
                  </div>
                </div>
                <span className={`fo-move ${move > 0 ? 'good' : move < 0 ? 'bad' : 'dim'}`}>
                  {move > 0 ? <ArrowUp size={14} /> : move < 0 ? <ArrowDown size={14} /> : null}
                  {move !== 0 ? Math.abs(move) : '—'}
                  {move !== 0 && <span className="sr-only">{move > 0 ? ' places up' : ' places down'}</span>}
                </span>
              </Row>
            );
          })}
        </div>
      </Section>
    </>
  );
}
