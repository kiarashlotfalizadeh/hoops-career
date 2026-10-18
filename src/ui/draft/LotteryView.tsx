// The lottery's result: the top 14 in order, each team's odds for #1 and how far it moved.
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { League } from '../../core/types';
import { curTeamSeason } from '../../core/league/helpers';
import { draftOrder, lotteryOdds } from '../../core/league/draft';
import { TeamLogo } from '../components/TeamLogo';
import { Empty, Section } from '../components/ui';

export function LotteryView({ league, onTrade }: { league: League; onTrade?: (dpid: number) => void }) {
  const order = draftOrder(league).filter((d) => d.round === 1 && (d.pick ?? 99) <= 14);
  if (!order.length) return <Empty>Lottery results appear here after the playoffs.</Empty>;
  // the same pre-lottery order and chances the lottery used (tied teams split theirs)
  const pre = new Map(lotteryOdds(league).map((x) => [x.tid, x]));
  return (
    // (the rows' percentages need their caption while trading is open too)
    <Section title="Lottery order" right={<span className="tiny dim">Odds for #1{onTrade ? ' · tap a pick to trade' : ''}</span>}>
      <div className="card flush list">
        {order.map((d) => {
          const p0 = pre.get(d.originalTid)?.pre ?? d.pick!;
          const move = p0 - d.pick!;
          const ts = curTeamSeason(league, d.originalTid);
          const odds = (pre.get(d.originalTid)?.w ?? 0) / 10;
          const mine = d.tid === league.userTid;
          // a row opens the trade sheet for its pick while trading is open
          const Row = onTrade ? 'button' : 'div';
          return (
            <Row key={d.dpid} className={`listrow fo-sel ${mine ? 'me' : ''}`} onClick={onTrade ? () => onTrade(d.dpid) : undefined}>
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
  );
}
