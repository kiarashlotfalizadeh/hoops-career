// How free agency works, in full: the Free Agents screen's "?".
import type { League } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import { CAP_FOR, OFFSEASON_ROSTER_MAX, TWO_WAY_MAX } from '../../core/league/helpers';
import { EXCEPTIONS, WAIVER_DAYS, exceptionAmount, twoWaySalary, type Exception } from '../../core/league/contracts';
import { FA_DAYS } from '../../core/league/season';
import { COOL_FA, COOL_SEASON, LOWBALL } from '../../core/league/negotiation';
import { HARDSHIP_OUT, TEN_DAYS } from '../../core/league/tenDay';
import { HelpSheet } from './common';
import { MATCH_DAYS, SHEET_MIN_YEARS } from '../../core/league/rfa';
import { money } from '../../core/format';

/** The rules of signing, behind the header's "?": `space` and `exceptions` are what's open to you now. */
export function FaHelp({ league, s, space, exceptions }: { league: League; s: number; space: number; exceptions: { k: Exception; room: number }[] }) {
  const cap = CAP_FOR(league, s);
  return (
    <HelpSheet title="How free agency works">
      <p>
        <b>Cap space.</b> Sign anyone whose deal fits under the {money(cap.salaryCap)} cap. You have <b>{money(Math.max(0, space))}</b> of room for {seasonLabel(s)}.
      </p>
      <p>
        <b>Minimum deals.</b> Over the cap, players still sign for their minimum: {money(cap.minContract, 2)} in a player's first three seasons, {money(cap.vetMin, 2)} after. A
        minimum deal for the coming season isn't guaranteed until opening night.
      </p>
      <p>
        <b>Exceptions.</b> Over the cap, each pays for one signing a season. The <b>mid-level</b>: up to {money(exceptionAmount(league, 'mle', s))} for up to {EXCEPTIONS.mle.years}{' '}
        years, if the signing keeps you under the tax line ({money(cap.luxuryTax)}). The <b>bi-annual</b>: up to {money(exceptionAmount(league, 'bae', s))} for up to{' '}
        {EXCEPTIONS.bae.years} years, under the tax line too, and not two seasons running. After either, trades can't take you past the tax line that season. Sign anyone with{' '}
        <b>cap space</b> and the mid-level is gone for the season: the <b>room exception</b> replaces it, up to {money(exceptionAmount(league, 'room', s))} for up to{' '}
        {EXCEPTIONS.room.years} years (a team uses the room exception or the bi-annual in a season, not both).{' '}
        {exceptions.length ? `Open to you now: ${exceptions.map((x) => `${EXCEPTIONS[x.k].name} up to ${money(x.room)}`).join(', ')}.` : 'None is open to you now.'}
      </p>
      <p>
        <b>Negotiating.</b> His ask is open: offer it on his terms (the years he wants, no option) and he signs on the spot. He'd take a little less, how much he keeps to himself;
        below that he counters, and he only hears so many offers. A lowball (under {Math.round(LOWBALL * 100)}% of his ask) counts twice and costs some of his interest. If talks
        break down he won't take your calls for {COOL_FA} days in free agency (the rest of the summer after two lowballs), or {COOL_SEASON} days in season. A player option takes a
        little off his price, a team option adds to it. His interest in your team (winning, hype, market, playing time, each weighed by what matters to him) moves his ask.
      </p>
      <p>
        <b>Top free agents.</b> In the summer, players worth 78+ or asking 8% of the cap or more weigh offers: submit one (at least 90% of his ask) and a day or two later he picks
        between yours and other teams' by the money against his ask of each, how much he likes each team, and the years. Pending offers hold their cap space, mid-level and roster
        spot until he decides; raise or withdraw them any time.
      </p>
      <p>
        <b>Restricted free agents.</b> A young player whose team qualified him signs only offer sheets: {SHEET_MIN_YEARS} to 5 years, no options, at his ask, paid with cap space,
        the mid-level or the minimum. His team has {MATCH_DAYS} days to match on exactly those terms; until then the sheet holds your room (or mid-level) and a roster spot. Your
        own restricted free agents re-sign with Bird rights until they sign a sheet, their holds stay on your books meanwhile, and the market stops when another team signs one so
        you can match or let him go. Unsigned at the close, a restricted free agent plays a season on his qualifying offer.
      </p>
      <p>
        <b>Timing.</b> The summer market lasts {FA_DAYS} days and you get the first look: AI teams start signing on day 2, and stars go fast. Unsigned players cut their price every
        few days, and stay available in season.
      </p>
      <p>
        <b>Waivers.</b> A player released in season with guaranteed money left spends {WAIVER_DAYS} days on waivers. Teams can claim him, worst record first, and take over his
        contract (with a roster spot, and cap space for this season's salary unless it's a minimum deal), which takes his dead money off his old team's books.
      </p>
      <p>
        <b>Roster.</b> Up to {OFFSEASON_ROSTER_MAX} players in the offseason, {CAP.rosterMax} from opening night, plus up to {TWO_WAY_MAX} on two-way deals.
      </p>
      <p>
        <b>Two-way deals.</b> Players with three seasons or fewer who'd sign for the minimum can take a two-way slot at {money(twoWaySalary(league, s), 2)}. They don't use a roster
        spot or count on the cap, and sit at the end of the bench unless you run short.
      </p>
      <p>
        <b>10-day contracts.</b> From January 5 to the end of the regular season, a free agent who'd sign for the minimum takes a {TEN_DAYS}-day deal: his minimum prorated, paid at
        signing, on a roster spot. It ends by itself, with no dead money. Two with one team a season at most; then the rest of the season, or he leaves. With {HARDSHIP_OUT}+
        players out for three or more games (the <b>hardship exception</b>), you can carry 10-day players beyond {CAP.rosterMax}, one for each player out past three.
      </p>
      <p>
        <b>Window.</b> Signings are open in the preseason, through the end of the regular season, and in free agency.
      </p>
    </HelpSheet>
  );
}
