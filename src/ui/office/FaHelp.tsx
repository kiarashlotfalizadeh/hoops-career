// How free agency works, in full: the Free Agents screen's "?".
import type { League } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import { CAP_FOR, OFFSEASON_ROSTER_MAX, TWO_WAY_MAX } from '../../core/league/helpers';
import { EXCEPTIONS, ROTATION_FLOOR, SUMMER_FLOOR, WAIVER_DAYS, exceptionAmount, twoWaySalary, type Exception } from '../../core/league/contracts';
import { FA_DAYS } from '../../core/league/season';
import { MARKET_HOLD_DAYS, MARKET_STEP } from '../../core/league/freeAgency';
import { COOL_FA, COOL_SEASON, LOWBALL } from '../../core/league/negotiation';
import { HARDSHIP_OUT, TEN_DAYS } from '../../core/league/tenDay';
import { HelpSheet } from './common';
import { MATCH_DAYS, SHEET_MAX_YEARS, SHEET_MIN_YEARS } from '../../core/league/rfa';
import { money, moneyExact } from '../../core/format';
import { pct } from '../../core/analysis/odds';

/** The rules of signing, behind the header's "?": `space` and `exceptions` are what's open to you now. */
export function FaHelp({ league, s, space, exceptions }: { league: League; s: number; space: number; exceptions: { k: Exception; room: number }[] }) {
  const cap = CAP_FOR(league, s);
  return (
    <HelpSheet title="How free agency works">
      <p>
        <b>Cap space.</b> Sign anyone whose deal fits under the {money(cap.salaryCap)} cap. You have <b>{money(Math.max(0, space))}</b> of room for {seasonLabel(s)}.
      </p>
      <p>
        <b>Minimum deals.</b> Over the cap, players still sign for their minimum. That is {moneyExact(cap.minContract)} in a player&apos;s first three seasons,{' '}
        {moneyExact(cap.vetMin)} after. A minimum deal for the coming season isn&apos;t guaranteed until opening night.
      </p>
      <p>
        <b>Exceptions.</b> Over the cap, each pays for one signing a season, and each hard-caps you at its apron.{' '}
        {exceptions.length ? `Open to you now: ${exceptions.map((x) => `${EXCEPTIONS[x.k].name} up to ${money(x.room)}`).join(', ')}.` : 'None is open to you now.'}
      </p>
      <p>
        The <b>mid-level</b> pays up to {money(exceptionAmount(league, 'mle', s))} for up to {EXCEPTIONS.mle.years} years. The signing must keep you under the first apron,{' '}
        {money(cap.firstApron)}. Past it, a team gets the <b>taxpayer mid-level</b> instead: up to {money(exceptionAmount(league, 'tmle', s))} for {EXCEPTIONS.tmle.years} years,
        under the second apron, {money(cap.secondApron)}.
      </p>
      <p>
        The <b>bi-annual</b> pays up to {money(exceptionAmount(league, 'bae', s))} for up to {EXCEPTIONS.bae.years} years. It needs the first apron too, and not two seasons
        running.
      </p>
      <p>
        Sign anyone with <b>cap space</b> and the mid-level is gone for the season. The <b>room exception</b> replaces it: up to {money(exceptionAmount(league, 'room', s))} for up
        to {EXCEPTIONS.room.years} years. A team uses the room exception or the bi-annual in a season, not both.
      </p>
      <p>
        <b>Negotiating.</b> His ask is open. Offer it on his terms, the years he wants and no option, and he signs on the spot. He&apos;d take a little less, but keeps how much to
        himself. Below that he counters, and he only hears so many offers.
      </p>
      <p>
        A lowball, under {Math.round(LOWBALL * 100)}% of his ask, counts twice and costs some of his interest. If talks break down, he won&apos;t take your calls for {COOL_FA} days
        in free agency. After two lowballs, that is the rest of the summer. In season it&apos;s {COOL_SEASON} days.
      </p>
      <p>
        A player option takes a little off his price, a team option adds to it. His interest in your team moves his ask too. Winning, hype, market and playing time each count, by
        what matters to him.
      </p>
      <p>
        <b>Top free agents.</b> In the summer, players worth 78+ or asking 8% of the cap or more weigh offers. Submit one at 90% of his ask or more. A day or two later he picks
        between yours and other teams&apos;. He weighs the money against his ask of each, how much he likes each team, and the years.
      </p>
      <p>
        Without an offer from you, he decides on one of his first three days, between the AI teams&apos; bids. Contenders bid up to 10% over his ask. Nobody spends cap space on
        anyone else before then. A star worth about the max asks it of everyone, so where he goes is about the team.
      </p>
      <p>Pending offers hold their cap space, exception and roster spot until he decides. Raise or withdraw them any time.</p>
      <p>
        <b>Lengths and raises.</b> Free agents sign for four years at most, with 5% raises. Five years and 8% raises are only for your own player on full Bird rights. A player you
        released this season can&apos;t sign back.
      </p>
      <p>
        <b>Restricted free agents.</b> A young player whose team qualified him signs only offer sheets. A sheet runs {SHEET_MIN_YEARS} to {SHEET_MAX_YEARS} years, with no options,
        at his ask. It&apos;s paid with cap space, the mid-level or the minimum. His team has {MATCH_DAYS} days to match on exactly those terms. Until then the sheet holds your
        room or mid-level, and a roster spot.
      </p>
      <p>
        Your own restricted free agents re-sign with Bird rights until they sign a sheet. Their holds stay on your books meanwhile. When another team signs one, the market stops so
        you can match or let him go. Unsigned at the close, he plays a season on his qualifying offer.
      </p>
      <p>
        <b>Timing.</b> The summer market lasts {FA_DAYS} days and opens for every team at once. AI teams sign their first wave on day 1 too. Prices hold for the first{' '}
        {MARKET_HOLD_DAYS} days.
      </p>
      <p>
        Then a player no team can pay drops his price {pct(MARKET_STEP)} a day. He comes down toward what the money left would pay him: cap space, an exception, or his old team on
        Bird rights. The best players are served first. When that money can&apos;t pay more, he drops straight to his floor. AI teams see each new price first.
      </p>
      <p>
        A good player, {SUMMER_FLOOR.ovr}+ OVR, never drops under {pct(SUMMER_FLOOR.early)} of his value through day {SUMMER_FLOOR.day}. After that, and through the preseason, his
        floor is {pct(SUMMER_FLOOR.late)}, or the mid-level when it pays him {pct(SUMMER_FLOOR.mle)} or more. A rotation player, {ROTATION_FLOOR.ovr}-{SUMMER_FLOOR.ovr - 1} OVR,
        holds {pct(ROTATION_FLOOR.early)}, then {pct(ROTATION_FLOOR.late)}.
      </p>
      <p>
        Past day {SUMMER_FLOOR.day}, a player held at his floor takes a one-year deal there from a team with the room. Otherwise he goes back to his old team at about it as the
        market closes. The unsigned stay available in season, when prices come down every week. An {SUMMER_FLOOR.ovr}+ player never drops under {pct(SUMMER_FLOOR.hold)} of his
        value.
      </p>
      <p>
        <b>Waivers.</b> A player released in season with guaranteed money left spends {WAIVER_DAYS} days on waivers. Teams claim him worst record first and take over his contract.
        A claim needs a roster spot, and cap space for this season&apos;s salary unless it&apos;s a minimum deal. It takes his dead money off his old team&apos;s books.
      </p>
      <p>
        <b>Roster.</b> Up to {OFFSEASON_ROSTER_MAX} players in the offseason and {CAP.rosterMax} from opening night. Up to {TWO_WAY_MAX} more on two-way deals.
      </p>
      <p>
        <b>Two-way deals.</b> Players with three seasons or fewer, open to the minimum, can take a two-way slot at {moneyExact(twoWaySalary(league, s))}. They don&apos;t use a
        roster spot or count on the cap. They sit at the end of the bench unless you run short.
      </p>
      <p>
        <b>10-day contracts.</b> From January 5 to the end of the regular season. A free agent open to the minimum takes a {TEN_DAYS}-day deal on a roster spot. He&apos;s paid his
        minimum for those days at signing. It ends by itself, with no dead money. Two with one team a season at most, then the rest of the season, or he leaves.
      </p>
      <p>
        <b>Hardship.</b> With {HARDSHIP_OUT}+ players out for three or more games, carry 10-day players past {CAP.rosterMax}. One spot opens for each player out past three.
      </p>
      <p>
        <b>Window.</b> Signings are open in the preseason, through the regular season, and in free agency.
      </p>
      <p>
        <b>Sort: value.</b> OVR, with potential counting more the younger he is, under 26. It counts less for each year past 29, and for games an injury will cost him. Sort by OVR
        for today&apos;s ability alone.
      </p>
    </HelpSheet>
  );
}
