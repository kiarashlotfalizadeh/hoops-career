// The trade rules in full, behind the Trade screen's "?".
import type { League } from '../../core/types';
import { CAP, MATCH_MID_PCT, MATCH_SMALL_PCT } from '../../core/constants';
import { CAP_FOR, OFFSEASON_ROSTER_MAX, TWO_WAY_MAX } from '../../core/league/helpers';
import { MAX_FIRSTS_OUT, TRADE_WAIVE_MAX, cashRoom } from '../../core/league/trades';
import { HelpSheet } from '../office/common';
import { money, moneyExact } from '../../core/format';

/** The trade rules in full, behind the header's "?". */
export function TradeHelp({ league, season }: { league: League; season: number }) {
  const cap = CAP_FOR(league, season);
  return (
    <HelpSheet title="Trade rules">
      <p>
        <b>Salary matching.</b> A team over the cap ({money(cap.salaryCap)}) after the trade takes back up to 200% of a small salary it sends (up to{' '}
        {money(cap.salaryCap * MATCH_SMALL_PCT)}) plus {money(cap.salaryCap * CAP.tradeMatchBufferPct)}, what it sends plus {money(cap.salaryCap * MATCH_SMALL_PCT)} up to{' '}
        {money(cap.salaryCap * MATCH_MID_PCT)}, and 125% plus {money(cap.salaryCap * CAP.tradeMatchBufferPct)} above that. Teams under it absorb salary freely.
      </p>
      <p>
        <b>Aprons.</b> Past the first apron ({money(cap.firstApron)}) after the trade, a team takes back no more salary than it sends. Past the second ({money(cap.secondApron)}) it
        can't combine two or more salaries to take back a bigger one, send cash, or trade its first in the furthest draft on the books. A team that used its mid-level or bi-annual
        this season is hard-capped at the first apron; the taxpayer mid-level, at the second.
      </p>
      <p>
        <b>Traded player exceptions.</b> A team over the cap that sends out more salary than it takes back keeps the difference as an exception for a year: it can take in that much
        (plus {money(cap.salaryCap * CAP.tradeMatchBufferPct)}) without sending salary back, while it stays under the first apron. The cap sheet lists yours.
      </p>
      <p>
        <b>Rosters.</b> A team taking in more players than it sends can't go over {CAP.rosterMax} in season ({OFFSEASON_ROSTER_MAX} in the offseason): you release first, an AI team
        waives its end of the bench (up to {TRADE_WAIVE_MAX}). In season no team drops below {CAP.rosterMin}. Two-way players don't count, but each team has {TWO_WAY_MAX} two-way
        slots.
      </p>
      <p>
        <b>Expiring contracts.</b> After the season, players whose deals are up can only be re-signed or let go, and a player with a player option on next season can't be traded
        until he decides after the draft. Until free agency opens, each team's expiring players it plans to keep count against its cap at about their ask (cap holds).
      </p>
      <p>
        <b>No trade-backs.</b> A team can't reacquire a player or pick it traded away until the next season.
      </p>
      <p>
        <b>Draft picks.</b> No team can be left without a first in two drafts in a row, and no AI team gives up more than {MAX_FIRSTS_OUT} firsts in one deal.
      </p>
      <p>
        <b>Protections.</b> A team can protect its own first as it trades it (top 4, 8, 10, 14 or 20): if it lands there, it stays home and nothing more is owed. It's worth less to
        the team getting it. A pick already protected, or acquired from another team, keeps its terms; a pick in a swap can't be protected.
      </p>
      <p>
        <b>Pick swaps.</b> A team can give another the right to swap firsts in a future draft when each holds its own unprotected first of it. When the lottery sets the order, the
        holder takes the other first if it landed higher. The right goes with the pick that carries it, and each first can be in one swap. AI GMs value it by how likely the swap is
        and what it would gain.
      </p>
      <p>
        <b>Cash.</b> Each team can send, and receive, up to {moneyExact(cashRoom(league, league.userTid).limit)} in trades a season (about 5% of the cap). Cash isn't salary: it
        doesn't match or count against the cap. It comes out of the sender's profit. AI GMs value $2-3M about like a typical second-round pick, rebuilders a little more and
        contenders less.
      </p>
      <p>
        <b>Timing.</b> No trades after the deadline or in the postseason. Trading reopens with the draft lottery.
      </p>
      <p>
        <b>How AI GMs judge deals.</b> Ability, age, potential and contract: a bad contract counts against a package, and salary over the tax costs them. Contenders want help now;
        rebuilders pay more for youth and picks, less for veterans. A star is worth more than several lesser players, and players they'd have to waive count for nothing.
        {league.settings.difficulty === 'easy' ? ' On easy they take a little less than fair value, but not for players or picks you got in a trade this season.' : ''}
      </p>
      {league.settings.godMode && (
        <p>
          <b>God mode.</b> Force this trade puts a deal through whatever their GM and the trade rules say: only its shape and five players to dress are checked.
        </p>
      )}
      <p>
        <b>Negotiating.</b> Under the meter they give their main reasons, and warn you when you'd give far more than you get. When they say no, they offer the versions they would
        take: more from you, one of their pieces left out, or one of their bad contracts for you to absorb.
      </p>
    </HelpSheet>
  );
}
