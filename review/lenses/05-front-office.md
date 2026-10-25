The harness refused to save `REPORT.md`, so the full report is below. My scripts, screenshots and probe output are under `/private/tmp/claude-501/-Users-kiarash--claude-spares-spare-hVNZPT/b285bc02-5a07-46d5-a46e-e152c55fa3b7/scratchpad/review/front-office/`. Paths in the report are relative to that folder.

# Front office review (lens: `front-office`)

## 1. Verdict

On paper the Office tab is the most complete GM desk on a phone. It models the 2023 CBA (aprons, matching tiers, TPEs, Bird tiers, RFA and offer sheets, stretch, buyouts, 10-day and two-way deals, protections, swaps, cash), and almost every screen says why. The trade dock reacts live ("They'd jump at it", "Not even close · 4% of ask"). The trading block gets a package from every team. The deadline and draft night both feel like events. The AI league also moves on its own: 39 trades in season 1, with a rush at the deadline.

The economy under it is easy to beat:

- Bad contracts cost almost nothing to dump.
- In year 1 every first-round pick is priced the same.
- Free-agent prices crash by day 5.
- The draft is a sorted list with no scouting.

The worst moment was free agency. A star turned down my $49M a year "holding out for his ask", then re-signed with his old team for $17.75M the next day. That breaks the game's own promise that it explains why things happen.

**Score: 6.5/10.** The rules depth and the explanations are best in class. The value model is exploitable and one marquee free-agency outcome is broken, so a hardcore player will break this economy in a season and stop trusting it.

## 2. What's genuinely great (protect these)

- **CBA fidelity that hardcore fans will notice.** Rejections quote the rule: "Salary doesn't match: DEN takes in $107.9M, over its $59.0M limit (100% of $59.0M sent, over the first apron after it)". The cap sheet reads "$15.7M over the cap, incl. $34.6M holds". A pending cap-space bid correctly kills the mid-level ("Best exception $5.8M Bi-annual" after my Jerome bid, `t-78.txt`). The Stepien rule fires ("WAS can't be left without a first-round pick in back-to-back drafts"). Neither BBGM nor most of MyNBA's history gets this close.
- **The trade dock and counter flow.** It gives a live verdict with a progress bar (`shots/12-trade-swap-dock.png`) and notes on tax, waivers and depth ("They'd have to waive 3 players to get down to 15"). It also flags partnerships the deal would break ("Breaks Davis → Middleton (inside-out)"), which ties the GM layer to the tactics pitch. A rejected deal opens "The Suns say no. But they'd take this version now" with Accept or Edit in builder (`shots/101-counters.png`).
- **Low tap counts.**
  - Finder: Office → Trade → Find → SF filter → Kawhi → Propose is 5 taps, with the AI's ask preloaded (`shots/93-kawhi-loaded.png`).
  - My first pick swap was 4 taps from the Trade screen.
  - The builder path is about 7 taps.
- **Trading block.** "14 teams would deal for Young" lists each package and the money coming back (`shots/68-trae-block.png`, `t-25-block-chip.txt`). This beats BBGM's block for scanning.
- **The world trades on its own, on an NBA calendar.** Season 1 had 4 trades by day 8, 18 by day 98, 22 by day 109 and 39 by the deadline (day 114). There is a rumor mill ("The Knicks are listening on Jalen Brunson; the Thunder have called"), a deadline-day mail that names who is on the block, a deadline recap with the biggest deal, and columns grading signings ("Smith's new deal: a bargain").
- **AI pitches read like a GM calling.** "We need another wing for a playoff run, and George is the one we want. We'd send Aday Mara and the 2027 1st (SAS) · top-16 prot." Each pitch has an expiry and a one-tap Accept. The deadline "call" card is similar: "Playoff odds 39%. The staff's call: stand pat" (`t-91.txt`).
- **Restricted free agency works end to end.** UTA signed my qualified player to a sheet on day 1. The FA screen gated "Advance 1 day" behind "Match UTA's offer sheet for Bilal Coulibaly first", and Match took one tap (`shots/74-fa-day1.png`).
- **Draft night has some theatre.**
  - The lottery reveal goes from 14 up, with a "You slip to No. 10" hero (`shots/50-lottery-revealing.png`).
  - The mock gives odds ("SAS · Jordan Chapman 72% · or A. Becker 26%").
  - Each selection is graded ("Reach · ranked 11th").
  - Trade-down offers are sensible ("HOU: 2028 1st + #15 for #10, 91% of its value", `t-54.txt`).
- **The AI prices age correctly.** It valued Curry (93, age 38) at 46 against Trae's 78. One summer later Curry was 82, Durant 77, Harden 80 and LeBron 78. A deadline rental of an old star is a real trade-off, not free value.

## 3. Findings (most severe first)

### 1. A star free agent turns down $49M as "holding out", then re-signs for $17.75M the next day (P0)

- **What you see:** I bid $49.0M × 3 for Ty Jerome (88 OVR, asking $52.47M). I was the only bidder and over 90% of his ask, the stated bar. On day 3 the inbox said: "Ty Jerome turned us down: No other team bid for Ty Jerome, so he's holding out for his asking price (3 yrs at $52.5M)…". On day 4 he re-signed with MEM for **$17.75M × 3 with a player option** (transaction log id 234, `resign`, amount 17750).
- **Evidence:**
  - Inbox text: `src/core/league/freeAgency.ts:1098`.
  - `aiMarquee` (`freeAgency.ts:~478`) takes `faInterest(...)[0]` the next day, including his old team's capped `birdRoom` (`freeAgency.ts:462`).
  - The user's bid is judged against his full ask. The AI's Bird-rights bid is judged only against the team's budget.
  - Screens: `shots/76-jerome-bid.png`, `t-79.txt`.
- **Why it matters:** This is the marquee moment of the offseason, and the outcome makes no sense. The explanation the app gives is contradicted the next day. Players will feel cheated, not out-managed.
- **Fix (M):**
  - A top free agent should never sign a lower bid than one he refused.
  - A lone user bid at or above 90% should win, or at least be re-weighed on his decision day alongside the Bird-rights offer.
  - `birdRoom` offers should go through the same `offerUtility` comparison as the user's bid.
  - Add an invariant test: no marquee signing below a bid he declined.

### 2. Bad contracts are nearly free, so cap trouble never bites (P1)

- **What you see:** I dumped Anthony Davis (84, age 33, $62.8M expiring) on Memphis for nothing. The dock said "They'd jump at it" (`shots/66-ad-dump-dock.png`, `t-66.txt`), and the headless check agreed (delta +20.0 for MEM, `b4.mts`).
- **Evidence:** A synthetic test on a 77-OVR 27-year-old (`b8.mts`, market value $13.9M):

  | Contract     | Neutral trade value |
  | ------------ | ------------------- |
  | 4 yrs × $30M | +10.8               |
  | 4 yrs × $45M | **+4.9**            |
  | 4 yrs × $60M | **−1.0**            |

  A next-year first is worth 15.6, so $185M of overpay costs about a sixteenth of a first. The causes are `SURPLUS_VALUE = 0.1` per $1M a season (`src/core/league/contracts.ts:65`) and `ROOM_VALUE` of 0.02-0.1 per $1M (`src/core/league/trades.ts:559`). Talent, through `exp((s-60)/6)`, swamps money.

- **Why it matters:** NBA front offices pay two firsts to move a negative contract. Here the cap, aprons and tax are tidy rules with no cost, so the best exploit is "sign anyone, dump him later".
- **Fix (M):**
  - Value the burden as a share of the cap and make it superlinear in years left.
  - Have cap-space teams charge for absorbing salary they don't want (an asset per X dollars of negative surplus). A "room is precious" multiplier in the summer would do it.
  - Re-run the README's tax and apron calibration afterwards.

### 3. In year 1 every first-round pick is worth the same until 15 games are played (P1)

- **What you see:** In the opening preseason every 2027 first was valued at 15.9: Sacramento's (21-61, the eventual worst record) the same as OKC's (68-14). Protected and swap-encumbered picks priced lower. The AI took my own 2027 first for Utah's straight up ("Deal!", delta 0.0, `battery-normal.txt`). It would sell SAC's or NOP's first for my first plus two 2nds.
- **Evidence:** `outlook` uses `wp = games >= 15 ? winPct(ts) : prev ? … : 0.5` (`src/core/league/trades.ts:210`). Real-roster leagues start with no previous season (`team seasons sample: ATL:2027/0-0`).
- **Why it matters:** The best exploit in the game is open on day 1: buy the worst teams' firsts at mid-round prices. The same flaw makes top-N protections on bad teams' picks too cheap. A top-14-protected SAC first was priced at about a third of a first while its true top-14 odds were near certain (`b7.mts`). The projection also ignores roster changes: a team that just traded its stars keeps its old record's price.
- **Fix (M):** Project slots from the preseason power or projected-wins model the media layer already uses ("the papers picked you for 32"), blended with record as games accrue. Feed it into `outlook`.

### 4. Free-agent prices crash by day 5, and 80+ players sign at about half price (P1)

- **What you see:** With $50.6M of room on day 5 I signed three players at their asks. All three "chose us" (`t-80-*.txt`, `t-82-fa-day8.txt`):

  | Player       | OVR | Signed at   | Market value shown |
  | ------------ | --- | ----------- | ------------------ |
  | Marcus Smart | 83  | $15.95M × 2 | $24.0M             |
  | Zach LaVine  | 82  | $16.5M × 3  | —                  |
  | Jalen Smith  | 80  | $15.8M × 3  | —                  |

  Smart's trade value right after signing was 34.2 against a cost of nothing but room. From Dec 15, MEM would give Wendell Carter Jr. (81) for him (`b6.mts`).

- **Evidence:** Price cuts toward "what a team that wants them can still pay" (README; `freeAgency.ts` price-cut clock). Day 1 had 174 free agents. By day 5 there were 101 and AI teams had spent their room.
- **Why it matters:** Waiting a few days beats the market every summer, and newly signed bargains become trade chips.
- **Fix (S-M):**
  - Have the price floor reflect the best offer any team could make with an exception, not just room.
  - Keep a few AI teams' room unspent past day 3, and let contenders use the mid-level on 80+ players.
  - Cap the cut for 80+ players at about 75% of market value before day 15.

### 5. The draft has no scouting, so it reduces to sorting a list (P1)

- **What you see:**
  - All 72 prospects show exact OVR and POT from the moment the class arrives (`t-04-draft.txt`, `shots/42-draft-Combine.png`).
  - The AI drafts with `draftScore = pot*0.65 + ovr*0.35 + noise` (`src/core/league/draft.ts:308`), and the consensus board uses `pot*0.62 + ovr*0.38` (`draft.ts:87`). Both are the same numbers the user sees.
  - The combine is generated from the ratings (`draft.ts:14-27`), so it carries no new information.
  - "Scout prospects" in the Play menu just opens the board.
  - The hidden truth is `growth`. A year later the top 30's POT moved by ±2.6 on average (#20 Ariel Fischer 68/79 → 76/87; #1 Chapman 81/91 → 78/86), and the user has no way to find it.
  - The prospect sheet is a one-line blurb plus combine numbers (`t-55.txt`).
- **Why it matters:** "Is scouting meaningful?" No. BBGM fogs prospect ratings by scouting budget. MyNBA has scouts assigned to prospects, workouts and interviews. Here the user and every AI see the same truth.
- **Fix (L):**
  - Show prospect OVR and POT as ranges that a scouting budget (Finances) or per-prospect scouting narrows.
  - Give the combine and workouts a real signal: let them reveal a hint of `growth` ("motor", "coachability" is off-limits per the no-people rule, so use "frame" or "feel").
  - Give each AI team its own noisy board so reaches and steals happen.
  - Add pre-draft stat lines.

### 6. Propose fires instantly, and the green "Deal" banner hides the overpay warning (P1)

- **What you see:**
  - The finder loaded "TOR's ask for Kawhi Leonard: Trae Young + Will Riley". The folded dock showed a green "They'd jump at it · Deal" (`shots/93-kawhi-loaded.png`).
  - The warning "By neutral value you'd give up about 2 times what you get" appears only in the expanded dock (`t-93.txt`, `shots/93b-kawhi-dock.png`).
  - Propose executed the trade with no confirmation (`src/ui/screens/Trade.tsx:184-189`). Same for the pick swap (`shots/14-trade-after-propose.png`).
- **Why it matters:** An irreversible, franchise-altering action is one stray tap away, and the colour coding celebrates the AI's win. "They'd jump at it" reads as good news for you.
- **Fix (S):**
  - Show a confirmation sheet ("You send / You get / neutral value / cap after") whenever the warn note fires or a first-round pick moves.
  - Show the overpay note in the folded dock.
  - Phrase eagerness from the user's side ("They'd jump at it: you're overpaying").

### 7. "What would make this work?" proposes 2× overpays to fix salary matching (P2)

- **What you see:**
  - Kawhi: give Trae + Riley, neutral 61 vs 29.
  - Embiid: Trae + Coulibaly, 71 vs 17.
  - Paul George: Trae + Carrington, 82 vs 21.
  - MPJ: Trae, 78 vs 38.

  Source: `battery-normal.txt`, `b6.mts`.

- **Evidence:** When over the cap, `findWork` first adds "the least valuable player (or pair) whose salary fixes the matching" (`tradeHelp.ts:93-120`). On a roster with one big salary that is always the star.
- **Why it matters:** The helper teaches bad trades.
- **Fix (M):** Have the search prefer combinations that minimise the user's neutral overpay, including asking the AI to add salary back. Say plainly when matching forces a bad deal: "Only Young's salary matches: this costs you about 2×."

### 8. "Not even close" gives no reason (P2)

- **What you see:** Ayton for Knueppel showed "Not even close · 4% of ask" with an empty notes area (`shots/22-after-propose.png`). Coulibaly for Gillespie showed "Not even close · 28% of ask", also with no notes (`t-100-dock.txt`). The toast just says "CHA: Not even close." The notes only cover modifiers (tax, lens, waivers), never the basic talent gap.
- **Fix (S):** Always lead with a value line: "They value Knueppel about 30× Ayton. Cornerstones move only for a star plus picks." Also show the value tier pair ("Franchise vs Depth").

### 9. "Overpay / 141% of his value" is measured by a strategy the user never sees or sets (P2)

- **What you see:** The block called HOU's package for Trae "Overpay · 141% of his value" (`t-68.txt`). In neutral value it was 69 vs 78, about 89% (`b3.mts`).
- **Evidence:** `mineValue` uses `league.teams[userTid].strategy` (`src/core/league/tradePackages.ts:59`). That strategy is assigned silently and flipped from rebuild to contend to retool across my two seasons.
- **Fix (S):** Show percentages in neutral value. Or expose "Our direction: Contend / Retool / Rebuild" as a visible, settable Office choice that labels the lens ("141% to a rebuilder like you").

### 10. Pick value is invisible everywhere (P2)

- **What you see:** Pick rows show only a label ("2027 1st (UTA)"). The trade UI and Picks & moves show no projected slot, lottery odds or value tier, even though the core computes `topOdds` and `outlook`. `grep -rn projected src/ui/trade src/ui/office` finds nothing.
- **Why it matters:** The user can't judge pick trades, which is half the GM game. Hardcore fans expect "proj. #4-9, 31% top-4".
- **Fix (S):** Add a meta line on every pick: projected range and value tier ("Proj. 6-12 · Starter value"). Use it in the dock and on the Assets screen.

### 11. Negotiation mostly punishes trying (P2)

- **What you see:** Coulibaly ("Lukewarm") asked $11.15M.

  | Offer  | Result                                        |
  | ------ | --------------------------------------------- |
  | $9.85M | Counter at the full ask                       |
  | $10.3M | Same counter                                  |
  | $10.7M | Talks broke down: ask went to $11.75M, "firm" |

  Source: `t-63-c1..c3.txt`.

- **Evidence:** The walk-away discount is 2-6% plus a quarter of appeal (`negotiation.ts:162-176`), so a lukewarm player's floor is about his ask. A counter "between your offer and his ask" then collapses to the ask.
- **Why it matters:** The expected saving is a few percent against a 5% penalty, so the right play is always "His ask". The mini-game reads as hostile, not clever.
- **Fix (S):** Counters should move toward the user ("$10.9M and he signs"). Show a "room to negotiate" hint from interest (Keen / Lukewarm). Make the first sub-ask offer free.

### 12. No guard against fat-finger overpays in contract sheets (P2)

- **What you see:** Anthony Gill (57 OVR, age 34) asked $2.54M × 1. His slider runs to "Max $43.73M". A stray offer of $9.85M (4× his ask) signed instantly with no warning, and the staff later cut him for $9.85M of dead money (`t-62.txt`).
- **Fix (S):** Warn above 110% of ask ("$7.3M over his ask: he'd sign for $2.54M"). Cap the slider at about 1.5× the ask unless expanded.

### 13. The key free-agency warning sits below the fold (P2)

- **What you see:** On Jerome's sheet the visible callout said only "No other team is bidding yet" (`shots/76-jerome-bid.png`). "No rival bids, so he'll hold out for his ask. Offer $52.5M" sat below, under the sticky Submit. The sheet also never said I couldn't afford the ask: $49.4M of room because of a $12.4M RFA hold. It should have suggested "Let Coulibaly go or renounce to clear $3.1M".
- **Fix (S):** Put the verdict line ("He'll take: $52.5M. You can offer: $49.4M") at the top next to "His ask", with the fix inline.

### 14. Lottery spoilers in the sibling tabs (P2)

- **What you see:** Before I pressed "Reveal the order", the "Your picks" tab already showed "2027 1st #10 (UTA)" (`t-42-draft-Yourpicks.txt`). The Mock tab listed "1 SAS · via ATL" (`t-42-draft-Mock.txt`).
- **Fix (S):** Hide slot numbers in Picks and Mock until `markLotterySeen` (`src/ui/draft/LotteryView.tsx`), or default to the Lottery tab with a "Reveal" gate.

### 15. AI teams never use protections, swaps or cash (P3)

- **What you see:** README: "AI teams never use these terms". Every AI pick offered is unprotected and no AI deal uses cash or swap rights. The user has tools the league doesn't. Real 2026 trades are full of protected picks.
- **Fix (M):** Let `packageFor` and `counterOffers` protect the AI's own firsts when that closes a gap (the valuation already exists).

### 16. CBA gaps a hardcore fan will name (P3)

- No sign-and-trade, trade kickers, Arenas provision or over-38 rule (`grep` finds none).
- Odd pick labels: "2028 2nd (DEN) · top-33 prot." for a second-rounder, and "top-16 prot." outside the five allowed protections (from the real-data import).
- **Fix (S-M):** Add the Arenas provision to offer sheets and sign-and-trade for Bird-rights players. Label second-round protections "top-3 of the 2nd".

### 17. The trading block shops one player at a time (P3)

- **What you see:** "Shop a player" chips only (`src/ui/trade/TradingBlock.tsx:44`). You can't shop a pick (except on draft night), a player plus a pick, or a "salary out" ask. BBGM's block takes any asset set.
- **Fix (S):** Allow multi-select across players and picks. `blockOffers` already accepts `{pids, dpids}` (`src/ui/office/tradeBlock.ts:18`).

### 18. AI-to-AI churn sometimes reads as noise (P3, overlaps sim-credibility)

- **What you see:**
  - On day 106 of season 2, Herbert Jones went from PHX to ORL and then from ORL to NOP the same day.
  - In season 1, DET took Zion for Duren and five days later sent Zion plus two firsts to NYK for OG Anunoby.
  - ORL sent Paolo Banchero, Wendell Carter Jr. and a first for Jaren Jackson Jr.
  - Many deals are paid in "2033 1st".
- **Fix (S):** Add a short no-reflip window for AI teams (30 days). Penalise a contender selling a 24-year-old cornerstone.

### 19. Re-sign asks ignore injuries and tiny samples (P3)

- **What you see:** Two-way player Jamir Watkins (3 GP, out 76 games) asked $9.8M × 4, up from $0.68M (`t-60-resign.txt`).
- **Fix (S):** Discount the ask for games missed or limited minutes.

### 20. The prospect sheet is thin for the biggest decision of the summer (P3)

- **What you see:** Rank, OVR/POT, a one-line blurb ("Utility Wing. Best tools: athleticism and shooting. Needs work: playmaking."), combine numbers and "Full profile" (`t-55.txt`). There are no percentiles against the class (only wingspan vs height), no pre-draft stats and no comparable player.
- **Fix (S):** Add combine percentiles, a "plays like" comparable and his rank in each skill within the class.

### 21. The Office hero repeats itself (P3)

- **What you see:** An "Over the cap" pill sits next to "Over the cap $26.5M" (`shots/01-office.png`). There is no first-apron or tax-line distance on the hero, and that's the number a contender cares about.
- **Fix (S):** Make the second figure the next threshold ("$9.5M to the tax").

## 4. Top 5 moves

1. **Fix the Jerome outcome and add an invariant test** (finding 1, M). It removes the one outcome that makes the market feel rigged, and protects the "it tells you why" promise.
2. **Make money matter in trade value** (finding 2, M). With a superlinear contract burden and paid cap-space absorption, aprons and tax become real constraints, dumps cost assets, and "sign anyone and dump later" dies.
3. **Price picks from projected strength, and show it** (findings 3 and 10, M). This closes the day-1 pick exploit and gives every pick a "proj. #6-12" line. Pick trading becomes skill rather than luck.
4. **Add fog and scouting to the draft** (finding 5, L). Rating ranges narrowed by scouting, combine signals for hidden growth and noisy AI boards would make the draft exciting and give the Finances budget a GM payoff.
5. **Make trades safer and clearer** (findings 6, 7, 8 and 9, S-M):
   - a confirmation sheet when a deal is lopsided;
   - overpay notes visible while the dock is folded;
   - "Not even close" always explained with a value comparison;
   - "% of value" shown in neutral terms;
   - a helper that minimises overpay.

   Together these keep the 5-tap flow without letting it walk players into 2× losses.

## 5. What I couldn't verify, and how I tested

**What I played (UI, Playwright, 390×844 phone, own persistent profile):**

- Created a real-league career as the Wizards (Normal) and played two full seasons.
- Season 1:
  - Swapped my own 2027 first for Utah's in the preseason. It backfired: UTA landed #10 and my own pick #8.
  - Simmed week by week past the deadline. AI offers and AI-to-AI trades were logged throughout.
  - Lottery reveal, draft night (drafted #10, staff picks in round 2), draft-night trade sheets.
- Re-sign period:
  - Option decisions (declines with confirm sheets), renounces, a negotiation to breakdown, a qualifying offer.
  - Dumped AD to MEM in the UI.
- Free agency:
  - Matched UTA's offer sheet.
  - Lost the Jerome bid.
  - Signed Smart, LaVine and Jalen Smith on day 5.
  - Simmed to day 22.
- Season 2:
  - Cut to 15.
  - Simmed to deadline day (27-30). Took the deadline call and traded Trae + Riley for Kawhi through the finder (5 taps).
  - Finished 39-43.
  - Probed the counter sheet in the next lottery phase.
- Routes visited: `/office`, `/office/trade` (Build, Find, Block, Offers), `/office/free-agents`, `/office/resign`, `/office/draft` (Lottery, Board, Combine, Mock, Picks, Live), `/office/assets`, `/team?view=contracts`, `/inbox`, `/player/:pid`, and the cap sheet.

**Headless probes** (`npx tsx` on fresh leagues and on JSON exports of my live save: `battery.mts`, `b2-b8.mts`):

- `makeItWork` for every team's best player.
- Salary dumps and bad-contract valuation.
- Pick values by team and protection.
- Trading-block packages.
- Old-star ask prices.
- Prospect POT drift after a season.

**Not verified:**

- Hard and Easy trade asks in play.
- Extension talks in the UI (only the asks were seen).
- 10-day flow (the "Sign LeBron James to a 10-day" call appeared but wasn't taken).
- Two-way signing and conversion.
- Waiver claims and buyouts.
- Stretch on release.
- TPE usage.
- Second-apron restrictions in the UI.
- God-mode Force.
- Behaviour beyond two seasons.
- Fictional league.
- Desktop layout.

One accidental user error (a $9.85M Gill signing caused by my locator) is itself evidence for finding 12.
