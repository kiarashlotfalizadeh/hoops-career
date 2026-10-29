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
        <b>Salary matching.</b> A team over the {money(cap.salaryCap)} cap after the trade can take back only so much. Sending up to {money(cap.salaryCap * MATCH_SMALL_PCT)}: 200%
        of it, plus {money(cap.salaryCap * CAP.tradeMatchBufferPct)}. Sending up to {money(cap.salaryCap * MATCH_MID_PCT)}: what it sends, plus{' '}
        {money(cap.salaryCap * MATCH_SMALL_PCT)}. Above that: 125%, plus {money(cap.salaryCap * CAP.tradeMatchBufferPct)}. Teams under the cap absorb salary freely.
      </p>
      <p>
        <b>Aprons.</b> Past the first apron after the trade, {money(cap.firstApron)}, a team takes back no more salary than it sends. Past the second, {money(cap.secondApron)}, it
        can&apos;t combine salaries to take back a bigger one. It can&apos;t send cash or trade its first in the furthest draft on the books.
      </p>
      <p>A team that used its mid-level or bi-annual this season is hard-capped at the first apron. The taxpayer mid-level hard-caps it at the second.</p>
      <p>
        <b>Traded player exceptions.</b> A team over the cap that sends out more salary than it takes back keeps the difference as an exception. For a year, it can take in that
        much plus {money(cap.salaryCap * CAP.tradeMatchBufferPct)} without sending salary back. It must stay under the first apron. The cap sheet lists yours.
      </p>
      <p>
        <b>Rosters.</b> A team taking in more players than it sends can&apos;t go over {CAP.rosterMax} in season, or {OFFSEASON_ROSTER_MAX} in the offseason. You release first. An
        AI team waives its end of the bench, up to {TRADE_WAIVE_MAX}. In season no team drops below {CAP.rosterMin}. Two-way players don&apos;t count, but each team has{' '}
        {TWO_WAY_MAX} two-way slots.
      </p>
      <p>
        <b>Expiring contracts.</b> After the season, players whose deals are up can only be re-signed or let go. A player with a player option on next season can&apos;t be traded
        until he decides, after the draft. Until free agency opens, the expiring players a team plans to keep count against its cap at about their ask. Those are cap holds.
      </p>
      <p>
        <b>No trade-backs.</b> A team can&apos;t get back a player or pick it traded away until next season.
      </p>
      <p>
        <b>Draft picks.</b> No team can be left without a first in two drafts in a row. No AI team gives up more than {MAX_FIRSTS_OUT} firsts in one deal.
      </p>
      <p>
        <b>Protections.</b> A team can protect its own first as it trades it: top 4, 8, 10, 14 or 20. If it lands there, it stays home and nothing more is owed. It&apos;s worth
        less to the team getting it. A pick already protected, or acquired from another team, keeps its terms. A pick in a swap can&apos;t be protected.
      </p>
      <p>
        <b>Pick swaps.</b> A team can give another the right to swap firsts in a future draft. Each must hold its own unprotected first of it. When the lottery sets the order, the
        holder takes the higher of the two. The right goes with the pick that carries it, and each first can be in one swap. AI GMs value it by how likely and how big the gain is.
      </p>
      <p>
        <b>Cash.</b> Each team can send, and receive, up to {moneyExact(cashRoom(league, league.userTid).limit)} in trades a season. Cash isn&apos;t salary: it doesn&apos;t match
        or count against the cap. It comes out of the sender&apos;s profit. AI GMs value $2-3M about like a typical second-round pick. Rebuilders value it a little more, contenders
        less.
      </p>
      <p>
        <b>Timing.</b> No trades after the deadline or in the postseason. Trading reopens with the draft lottery.
      </p>
      <p>
        <b>How AI GMs judge deals.</b> Ability, age, potential and contract all count. A bad contract counts against a package, and salary over the tax costs them. Contenders want
        help now. Rebuilders pay more for youth and picks, less for veterans. A star is worth more than several lesser players. Players they&apos;d have to waive count for nothing.
      </p>
      {league.settings.godMode && (
        <p>
          <b>God mode.</b> Force this trade puts a deal through whatever their GM and the rules say. Only its shape and five players to dress are checked.
        </p>
      )}
      <p>
        <b>Negotiating.</b> Under the meter they give their main reasons. They warn you when you&apos;d give far more than you get. When they say no, they offer versions they would
        take: more from you, one of their pieces left out, or a bad contract of theirs for you to absorb.
      </p>
    </HelpSheet>
  );
}
