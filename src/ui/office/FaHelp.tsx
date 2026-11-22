// How free agency works: the Free Agents screen's "?".
import type { League } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import { CAP_FOR, OFFSEASON_ROSTER_MAX } from '../../core/league/helpers';
import { EXCEPTIONS, exceptionAmount } from '../../core/league/contracts';
import { FA_DAYS } from '../../core/league/season';
import { MARKET_HOLD_DAYS, MARKET_STEP } from '../../core/league/freeAgency';
import { COOL_FA, COOL_SEASON, LOWBALL } from '../../core/league/negotiation';
import { HelpSheet } from './common';
import { money, moneyExact } from '../../core/format';
import { pct } from '../../core/analysis/odds';

/** The rules of signing, behind the header's "?": `space` and `mle` are what's open to you now. */
export function FaHelp({ league, s, space, mle }: { league: League; s: number; space: number; mle: number }) {
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
        <b>Mid-level.</b> Over the cap, it pays for one signing a season: up to {money(exceptionAmount(league, 'mle', s))} for up to {EXCEPTIONS.mle.years} years.{' '}
        {mle > 0 ? `Yours is open: ${money(mle)}.` : 'Yours is used, or held for a pending offer.'}
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
      <p>Pending offers hold their cap space or your mid-level, and a roster spot, until he decides. Raise or withdraw them any time.</p>
      <p>
        <b>Lengths and raises.</b> Free agents sign for four years at most, with 5% raises. Five years and 8% raises are only for your own player on full Bird rights. A player you
        released this season can&apos;t sign back.
      </p>
      <p>
        <b>Timing.</b> The summer market lasts {FA_DAYS} days and opens for every team at once. Prices hold for the first {MARKET_HOLD_DAYS} days. Then a player no team can pay
        drops his price {pct(MARKET_STEP)} a day. The unsigned stay available in season, when prices come down every week.
      </p>
      <p>
        <b>Roster.</b> Up to {OFFSEASON_ROSTER_MAX} players in the offseason and {CAP.rosterMax} from opening night. Signings are open in the preseason, through the regular season,
        and in free agency.
      </p>
      <p>
        <b>Sort: value.</b> OVR, with potential counting more the younger he is, under 26. It counts less for each year past 29, and for games an injury will cost him. Sort by OVR
        for today&apos;s ability alone.
      </p>
    </HelpSheet>
  );
}
