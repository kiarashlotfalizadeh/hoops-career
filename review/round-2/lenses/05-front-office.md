I played a full season as Memphis on Normal: a preseason cap-space trade, the trade deadline, the lottery, draft night, re-signing and 30 days of free agency. My verdict: the trade economy is now mostly sound, but free agency barely functions at the top and the draft has no scouting. My score is **7/10**, up from 6.5.

All paths below are under `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/3ab7e56a-18a1-4267-8218-da731c128be7/scratchpad/review/front-office/` (screenshots in `shots/`, probe scripts `probe-*.ts`, saved leagues in `snaps/`).

# Front office review, round 2 (lens: `front-office`)

## 1. Verdict

The trading desk is now the best GM experience on a phone I know of, and it is mostly honest:

- Bad contracts cost real assets to dump.
- Every pick carries a projected range, and the price follows it.
- All 13 AI offers I received in a season were within ±5 neutral value.
- Rejections explain themselves ("Shedding $24.1M saves them $48.1M in luxury tax").

What still breaks the fantasy is around the trades:

- **Free agency's top end is dead.** The 9 best free agents asking $24-49M sat unsigned all summer while their prices dropped ~4% every five days (only Melton, the 10th, signed, on day 24). They then went back to their old teams at a discount. Players rated 75-77 crashed to the minimum by day 9.
- **The draft has no scouting.** Exact OVR/POT are visible from October, unchanged until June.
- **Cap space is the cheapest asset in the game.** With $31M of room I turned about 26 value into 75 in one preseason deal.
- **The AI league churns.** 16 of 104 players traded in a season moved two or more times.

**Score: 7/10.** The value model, the explanations and the deadline and draft-night flows are now strong. The market around them is thin, and one pricing channel (tax relief) is still exploitable.

## 2. What's genuinely great (protect these)

- **Trade value now prices contracts and picks like a front office.**
  - Dumping Rudy Gobert ($36.5M, two years, value −26.8) costs about 27 value, roughly two firsts. Embiid (−33.9) fits only into a team with cap room.
  - Opening-night firsts are spread by projection: SAC 35.3 (proj. #2-6) and CHI 34.0, against OKC 6.2 (#28-30) and DEN 8.5.
  - Projections react to roster moves: my 2027 first went from "proj. #11-23" to "#17-27" right after I acquired Suggs.
  - Source: `survey.ts`, `probe-dump.ts`, `shots/c04-make-it-work.png`.
- **The dock explains itself.** "They value Jalen Suggs about 8% more than your side · Shedding $24.1M saves them $48.1M in luxury tax · 93% of ask", plus payroll after, rosters and tax (`shots/b02-suggs-dock-open.png`). The counter sheet ("The Magic say no. But they'd take this version now: Add $5.4M in cash") turns a no into one tap (`shots/b03-suggs-confirm.png`).
- **The confirmation sheet exists.** It shows "Neutral value: you send 26 · you get 75" and "A first-round pick moves in this deal" before an irreversible trade.
- **AI offers are fair and read like GMs calling.** 13 offers in a season, net −2.9 to +5.4 neutral for me (`snaps/14_42/proposals.txt`). The deadline call was good GM advice: "Postseason odds 1%. The staff's call: sell. Dylan Harper (81), the 2031 1st (SAC) and the 2033 1st from the Spurs for Ty Jerome (87)" (`shots/e02-stop-3.png`).
- **Trading block.** "12 teams would deal for Suggs", each package labelled in neutral terms ("85% of his value · Below value", "Lowball") (`shots/c06-block-suggs.png`).
- **Draft night has real theatre and stakes.**
  - "You jump to No. 2 · Up 6 places from 8th" (`shots/g01-lottery-reveal.png`).
  - Then a gut punch: Orlando won #1 with the UTA pick I had paid them for Suggs.
  - The mock gives odds ("Kendrick Cox 72% · or E. Hunter 26%"), the board shows "70% gone by your #2", and "Stop before every pick" works (`shots/g03-mock.png`, `shots/g07-draft-live.png`).
- **The draft still matters over time.** Over four simulated drafts, slot predicted later OVR at r = −0.59 to −0.80. Busts and steals happen: in the 2027 class, #1 became a 76 and #2 a 70, while #18 became an 86 and #44 an 80 (`long.ts`).
- **Free-agency explanations are now truthful.** I bid Jimmy Butler's full ask ($47.35M) and the inbox said: "Jimmy Butler chose the Golden State Warriors over us. Their offer: 1 yr at $36.4M. Our offer: 1 yr at $47.4M. He liked their situation better; market size matters most to him."

## 3. Findings (most severe first)

### 1. The top of free agency is a dead market: stars sit for 30 days, then go home cheap (P1)

- **What you see:** On FA day 1, Ty Jerome, Luke Kennard, Miles McBride, Cameron Johnson, Chaney Johnson, Grayson Allen, Fred VanVleet and Jimmy Butler all read "More than your space" (`shots/j02-fa-day1.png`).
  - I advanced day by day in the UI to day 29. None of them signed anywhere.
  - Prices fell 4% every five days: McBride $35.9M → $31.7M, Jerome $49.4M → $43.7M.
  - The headless run agrees: 10 of the top 11 free agents were unsigned at day 29 (`probe-fa.ts` on `snaps/14_42/fa0.json`).
  - At the season rollover, `aiLateReturns` hands them back to their old teams on two-year deals at the reduced price, "past its budget even": VanVleet to HOU at $24.4M (ask $34.3M), Butler to GSW at $34.05M. Code: `src/core/league/freeAgency.ts:946-958`.
- **Why it matters:** The marquee feature (competing bids, a decision day, "who he chose and why") almost never fires for the best players. Rival bids I measured for Kennard and VanVleet were $7.3M and $3.6M.
  - A user with room is the only real buyer. He signs any star at 90% of ask on day 1: Kennard at $42.9M, McBride at $36.6M, both "decides on day 2" and signed.
  - A user without room watches 30 days of nothing.
  - Root causes: AI teams have almost no cap space in this seed (payrolls $132-232M, only MEM under the cap), and the seed's 87-OVR role players ask 30% of the cap.
- **Fix (M):**
  - Let over-cap AI contenders bid with the mid-level, plus sign-and-trade-style Bird bids, from day 1.
  - Let old teams re-sign during the market, not after it.
  - Show the market state on the FA screen ("No team can pay his ask; his price drops ~4% every 5 days").

### 2. Free agents rated under 80 crash to the minimum by day 9 (P1)

- **What you see:** Players with a market value of $8-10M signed for $2.5M on days 9-10 (`probe-fa.ts`):
  - Josh Hart 77 (market $9.6M) with MIN, for one year.
  - Goga Bitadze 75 with DET, Lonzo Ball 75 with OKC, D'Angelo Russell 76 with BOS.
  - Bagley, Matković and Ziaire Williams.
  - Thomas Bryant 77 and Keldon Johnson 76 were still available at 38% of market on day 29.
- **Evidence:** The floor applies only at 80+ (`SUMMER_FLOOR.ovr = 80`, `contracts.ts:419`). Below it the cut is `Math.min(ask*0.85, roomFor(p))` (`freeAgency.ts:579`), and with no AI room left, `roomFor` is about the minimum.
- **Why it matters:** The old "prices crash by day 5" finding is fixed only for 80+. Rotation players become near-free surplus contracts, and the user can scoop the leftovers.
- **Fix (S):** Give 72-79 OVR a floor too (about 50% of market until day 20) and let them sign one-year "prove it" deals near it.

### 3. Cap space is the cheapest asset: absorb a tax team's good player, resell at full value (P1)

- **What you see:** In the UI, Orlando (over the second apron) gave me Jalen Suggs (85 OVR, 25) for Quinten Post, the UTA first and $5.4M cash. The confirmation sheet read "Neutral value: you send 26 · you get 75" (`shots/b03-suggs-confirm.png`).
- **Evidence:** Headless (`probe-dump.ts`, opening night):

  | Taken from               | Paid (value)      | Best resale                   | Resale value | Profit              |
  | ------------------------ | ----------------- | ----------------------------- | ------------ | ------------------- |
  | Suggs (ORL)              | 26.1              | DET: Duren + 2029 1st         | 66.5         | +40.5 (~2.9 firsts) |
  | Wendell Carter Jr. (ORL) | 2.4 (Micah Peavy) | CHI: Norman Powell + 2028 1st | 25.9         | +23.4               |
  | Bam Adebayo (MIA)        | 0.3               | best resale                   | 30.0         | +29.7               |
  - The AI books tax savings as value: ORL's money term was −48.3 for "$48.1M less tax" (`TAX_VALUE`, `APRON_VALUE`, `trades.ts:589-656`).
  - A random search found the only accepted deals that favour the user (13 of 511) all ran through this tax channel (`probe-trades.ts`).
  - Hard's 12% trade premium doesn't close a +150% margin.

- **Why it matters:** This is NBA-plausible in direction (cap room has value), but here a tax-saving deal hands the user good players plus surplus worth up to ~3 firsts. The only limit is how much room you have, and you can refill it by reselling for picks.
- **Fix (M):**
  - Have a tax team prefer dumping its worst-value contract, not its best-value player, to save tax (`aiTaxDumps` already does this for AI deals).
  - Or count tax savings only up to what the salary actually costs above the player's worth.

### 4. Scouting doesn't exist, and the class is frozen from October to June (P1)

- **What you see:**
  - The board shows exact OVR/POT from the preseason (`shots/a09-draft-mock.png`), the same numbers the AI drafts on: `pot*0.65 + ovr*0.35 + noise 1.5` (`draft.ts:307`).
  - Kendrick Cox was 80/88 in October and 80/88 on draft night (`shots/i01-on-clock.png`). Every top-5 prospect was unchanged, so there are no risers or fallers.
  - The combine is generated from the visible ratings (`draft.ts:14-27`) and adds no information.
  - The prospect sheet is a one-line blurb plus combine numbers (`shots/g05-prospect-sheet.png`).
  - The real unknown, `growth`, is invisible to everyone.
- **Why it matters:** It is still open from round 1. The draft is exciting at the lottery and on the clock but has no preparation loop. BBGM fogs prospects by scouting budget; MyNBA has scouting points.
- **Fix (L):**
  - Show prospect ratings as ranges narrowed by a scouting budget or scouting focus.
  - Let a college season move prospects (risers and fallers news).
  - Let workouts or the combine hint at `growth`.
  - Give each AI team its own noisy board.

### 5. "Trade for #1" says "Nothing you can offer" when the real blocker is a rule (P2)

- **What you see:** On draft night: "Nothing you can offer gets the Magic to move the 2027 1st #1 (UTA)" (`shots/h01-trade-for-1.png`).
- **Evidence:** Headless on my UI save (`why1.ts`), every package fails with "MEM traded the 2027 1st #1 (UTA) away this season and can't get it back until next season." Value alone would have cleared at 7 picks. `PickTradeSheet.tsx:55-60` maps every non-salary failure to the value message.
- **Why it matters:** It misstates the reason on one of the biggest decisions of the year. The trade-back rule (no reacquiring a pick you traded away that season) is also stricter than the NBA's for picks.
- **Fix (S):** Surface `validateTrade`'s error in the sheet. Consider dropping the same-season trade-back rule for picks.

### 6. The AI league churns players like hot potatoes (P2, still open)

- **What you see:**
  - In season 1, 16 of 104 traded players moved at least twice; across four seasons it was 13 / 10 / 8 / 20 (`aitrades.ts`, `long.ts`).
  - Luguentz Dort went ATL → GSW → CHA → PHX in 40 days. De'Andre Hunter went SAC → CHA → NOP → CLE.
  - Jrue Holiday and Shaedon Sharpe went POR → PHI → UTA within two days.
  - On draft day, MIL received Duncan Robinson "for nothing" and flipped him to LAL the same day.
  - Plenty of lateral swaps, e.g. Hield for Vanderbilt, Bamba for Bogdanović.
- **Why it matters:** The news feed reads as noise and undercuts the "credible world".
- **Fix (S):** No re-trading an acquired player for 60 days in AI deals (and the NBA's two-month aggregation rule for everyone). Require a minimum value gain for AI-to-AI lateral swaps.

### 7. AI teams still never use protections, swaps or cash (P3, still open)

README line 79: "AI teams never use these terms." The user has tools the league lacks, and AI offers are always unprotected firsts. **Fix (M):** Let `packageFor` and `counterOffers` protect the AI's own firsts to close a gap.

### 8. Cornerstones still go for two or three good players (P2)

- **What you see:** Minnesota accepts Ty Jerome (87/29) + Cam Spencer (87/26) + Cameron Boozer for Anthony Edwards (91/94, age 25): "Deal!", delta +4.5. Orlando is "eager" (+64) to swap Desmond Bane for Jerome + Javon Small + Zach Edey (`probe-dump.ts`).
- **Evidence:** The depth weights are only `[1, 0.7, 0.5]`, and the finder's "Cornerstone" tag has no effect on acceptance.
- **Fix (S):** A franchise premium in `judge` for a team's top player under 27 (for example ×1.3 outgoing), plus a note: "They build around Edwards."

### 9. The helper and counters still propose big overpays to rebuilders (P2, partly fixed)

- **What you see:** `makeItWork(best)` asks for:
  - Ty Jerome (v107) for Darryn Peterson (v51), and Jerome for Tre Johnson (v53), both about 2×.
  - Cam Spencer (v111) for AJ Dybantsa (v73).
  - Boozer + Wells + Russell + the UTA first (v119) for Julian Champagnie (v61).

  Source: `probe-trades.ts`. In the UI, the counter for Bane wanted Grant + Spencer + Coward + Edey + two firsts (`shots/c03-lowball-counter.png`), with no warning because the neutral overpay was under the 25% threshold (`trades.ts:1176`).

- **Fix (S):** Say when the partner's strategy is the reason ("Rebuilders discount 29-year-olds: Jerome counts 40% less to Utah"). Lower the warning threshold to about 15%.

### 10. The new seed's cheap 87s dominate the trade economy (P2, cross-lens with sim-credibility)

- **What you see:** Cam Spencer (87, $2.4M, v111), Ty Jerome (87, $9.2M, v107), Isaiah Joe (87, $11.3M) and Luke Kennard (87, $6.1M) are worth more than Brunson or Booker.
  - In the buying probe, the helper asked for Spencer or Jerome in 14 of the deals it built.
  - In free agency the same players ask $47-52M (`shots/j03-fa-sheet.png`).
  - Javon Small (80 OVR, 3.7 minutes a game, 21 games) asks $23.1M × 4, up from $0.68M (`shots/i06-resign.png`).
- **Fix (M):** Blend observed role or minutes into `valueScore` and asks for re-signing players. Revisit the seed's ratings for low-usage shooters.

### 11. A draft-night pick sells for less than the player it becomes (P3)

- **Evidence:** At the snapshot's draft start (`probe-draft.ts`):
  - #10's pick value was 23; the player drafted there was worth 34 right after.
  - #9: 28 → 34.
  - #18: 13 → 21.

  AI teams draft on POT-weighted score while value uses `valueScore`, so the best-value prospect is often still on the board.

- **Why it matters:** Buy mid-firsts on the clock, draft the best-value prospect, flip him: about +10 value a pick.
- **Fix (S):** Price on-the-clock picks from the same ordering AI teams draft by.

### 12. The staff's roster cuts pay dead money without trying a dump trade (P3)

"Release 3 · staff's picks" would release Walter Clayton (23, first-rounder) and Kris Murray and leave "$13.9M … on your books as dead money" (`shots/d02-release-action.png`). **Fix (S):** Offer "Find a taker" (the trading block for a salary dump) next to Release.

### 13. Lesser polish (P3)

- **Truncated asset name.** One trade-builder row shows "H. …" (`shots/a03-trade-build.png`). Fix (S): don't truncate names in asset rows.
- **The Mock tab is missing in the preseason.** `mockAvailable` requires games played, so the board has ranges but there's no tab until opening night. Fix (S): mock by projected record before then.
- **The block still shops one player at a time.** You can't shop a player plus a pick, or a pick outside draft night. Fix (S): allow multi-select; `blockOffers` already accepts several assets.
- **No market read on the FA sheet.** There's no "nobody else can afford him" line; you learn the market only by waiting. Fix (S): add the line, tied to finding 1.

## 4. Since the first review

| #   | Round-1 finding                                     | Status                | How verified                                                                                                                                      |
| --- | --------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Jerome turns down $49M, re-signs for $17.75M        | **Fixed**             | Kennard and McBride bids at 90% signed with me. Butler at full ask chose GSW at $36.4M with a truthful inbox reason. Spirit lingers in finding 1. |
| 2   | Bad contracts nearly free                           | **Fixed**             | Gobert costs ~27 value to dump. Embiid fits only into room. Burden in `contracts.ts:84-141`.                                                      |
| 3   | Year-1 picks all priced the same                    | **Fixed**             | Opening firsts range 6.2-35.3 by projection.                                                                                                      |
| 4   | FA prices crash by day 5                            | **Partly fixed**      | 80+ never fall below 75% (then 60%); 75-79 still hit the minimum by day 9 (finding 2). New problem: the frozen top end (finding 1).               |
| 5   | No scouting                                         | **Still open**        | Plus a frozen class (finding 4).                                                                                                                  |
| 6   | Propose fires instantly, green banner hides overpay | **Fixed**             | Confirmation sheet with neutral value; overpay note stays in the folded dock (`Dock.tsx:146`).                                                    |
| 7   | Helper proposes 2× overpays                         | **Partly fixed**      | `best` mode exists, but rebuilder-lens cases stay about 2× (finding 9).                                                                           |
| 8   | "Not even close" gives no reason                    | **Fixed**             | "They value Desmond Bane about 2.4× Micah Peavy".                                                                                                 |
| 9   | Block % of value uses a hidden strategy             | **Fixed**             | Neutral basis (`tradeBlock.ts:15-35`).                                                                                                            |
| 10  | Pick value invisible                                | **Fixed**             | "proj. #3-12" on every pick row.                                                                                                                  |
| 11  | Negotiation punishes trying                         | **Partly fixed**      | Counters now meet halfway and never rise (`negotiation.ts:268-275`). Breakdown in the re-sign period still costs +5%.                             |
| 12  | Fat-finger overpays                                 | **Fixed**             | Slider max equals his ask (`shots/j03-fa-sheet.png`).                                                                                             |
| 13  | FA warning below the fold                           | **Mostly fixed**      | Cap warning and exception routes are inline.                                                                                                      |
| 14  | Lottery spoilers in sibling tabs                    | **Fixed**             | `lotteryHidden` in Mock and Picks.                                                                                                                |
| 15  | AI never uses protections, swaps or cash            | **Still open**        | README line 79.                                                                                                                                   |
| 16  | CBA gaps (sign-and-trade, kickers, Arenas)          | **Still open**        | `grep` finds none.                                                                                                                                |
| 17  | Block shops one player                              | **Still open (UI)**   | Core supports several assets.                                                                                                                     |
| 18  | AI churn                                            | **Still open, worse** | 16/104 multi-traded; same-day flips.                                                                                                              |
| 19  | Re-sign asks ignore tiny samples                    | **Still open**        | Javon Small, 3.7 minutes a game, asks $23.1M.                                                                                                     |
| 20  | Thin prospect sheet                                 | **Still open**        | —                                                                                                                                                 |
| 21  | Office hero repeats itself                          | **Fixed**             | Shows "Cap space $31.2M · Under the tax $67.2M".                                                                                                  |

**New in these rounds:**

- The tax-relief laundering channel (finding 3) is a side effect of pricing burden and tax properly.
- The seed's cheap 87s distort values (finding 10).
- "Tell the owner it's a rebuild" and the deadline sell call give the GM layer real stakes (good).

## 5. Top 5 moves

1. **Restart the free-agent market** (findings 1 and 2, M). Let AI teams bid with exceptions, let old teams re-sign during the market, and add a 72-79 OVR floor. The summer becomes a contest, not a 30-day wait.
2. **Close the cap-space laundering channel** (finding 3, M). Tax teams dump their worst contracts, not their best-value players. Trades stay fair while cap room keeps a sensible, smaller price.
3. **Add scouting and a living draft class** (finding 4, L). Fogged ratings, in-season risers and fallers, and AI boards that disagree give the draft a preparation loop and a payoff for good scouting.
4. **AI credibility pass** (findings 6, 7 and 8, S-M). A re-flip cooldown, a franchise-player premium, and AI use of protected picks make the news feed read like a real league.
5. **Honest messages on blocked deals** (findings 5 and 9, S). Name the rule or strategy that blocks a deal and lower the overpay threshold. This keeps the "it tells you why" promise.

## 6. What I couldn't verify, and how I tested

**UI play** (Playwright, 390×844 phone, own profile, real league, Memphis, Normal):

- Preseason: the Suggs trade through the counter sheet, a lowball for Bane, "What would make this work?", the block.
- Roster cuts. Simmed to the deadline with stops for the skid, the owner-rebuild call and the deadline call; took both calls (sold Jerome to SAS).
- Simmed through the playoffs. Lottery reveal (jumped to #2), mock, board, prospect sheet, combine.
- Draft night with "stop before every pick", the failed "Trade for #1", drafted Cox at #2, auto-drafted the rest.
- Re-sign screen. Free agency day 1 to day 29, one day at a time.
- Routes: `/office`, `/trade` (Build, Find, Block, Offers), `/office/draft` (every tab), `/office/resign`, `/office/free-agents`, `/inbox`, `/`.

**Headless probes:**

- `survey.ts`: values and pick projections.
- `snap.ts`: a full season saving snapshots and AI offers.
- `probe-trades.ts`: helper for every team's top assets, selling packages, and 3,000 random deals.
- `probe-dump.ts`: dumps, laundering, consolidation.
- `probe-fa.ts` and `probe-bid.ts`: market over 30 days, marquee bids.
- `probe-draft.ts`: pick vs drafted-player value.
- `aitrades.ts`: AI deal list.
- `long.ts`: four seasons of draft outcomes, churn, and profit vs wins. Profit doesn't track winning (r = −0.10): 25-35-win teams made +$12.4M, 55+ win teams −$34.9M, under 25 wins −$14.7M, so tanking isn't a profit exploit.

**Not verified:**

- Hard and Easy trade asks in play.
- Offer sheets I make, and an AI sheet on my restricted free agent.
- 10-day, two-way, waiver claims and stretch in the UI.
- Extension talks.
- Fictional league.
- Desktop layout.
- More than one UI season.
