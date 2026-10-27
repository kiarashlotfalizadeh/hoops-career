# Front office review, round 3 (lens: `front-office`)

All paths below are under `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/front-office/`. Screenshots are in `shots/`, probe scripts are `probe-*.ts` and `long2.ts`/`long3.ts`, logs are `*.log`, and saved leagues are in `snaps/14_42` and `snaps/4_7`.

## 1. Verdict

The trade desk is the best GM experience I know of on a phone, and these rounds made the AI league credible:

- AI teams rarely re-flip players.
- Cornerstones now cost a premium.
- Dumps cost what the contract is worth.
- Scouting and a living draft class turned the draft into a season-long story.

The economy still leaks in two places, and both are big:

- **Free agency overcorrected.** Prices that used to freeze now fall 15% a day with no working floor. An 86-OVR player I could have kept for $42.6M signed elsewhere for $6.5M on day 14, and 2–7 of each summer's 78+ free agents sign for under half their market value.
- **Picks are overpriced at the moment they're on the clock.** A first on the clock sells for 1.3–1.6× the player it becomes, and rookies can be bought back cheaply the next minute.

Scouting works so well that the user's staff end up nearly all-knowing with no effort from the player.

**Score: 7.5/10** (round 2: 7). Trades, AI credibility and the draft's preparation loop are clearly better. Free agency is still the weakest part of the GM fantasy.

## 2. What's genuinely great (protect these)

- **The Find → ask → dock → confirm flow.**
  - From Find I tapped Devin Booker ("On the block"). The builder loaded PHX's ask: "Jerami Grant + Cameron Boozer + 2027 1st (UTA)".
  - The dock gave reasons ("Cameron Boozer (19) is worth more to a rebuilder · Jerami Grant (32)'s contract is a bigger burden"), what the deal breaks ("Breaks Edey → Grant (inside-out)"), salary, payroll after and "PHX would waive 1".
  - The confirm sheet read "Neutral value: you send 86 · you get 85".
  - Three taps in all (`shots/d02-dock-open.png`, `u4.log`).
- **AI offers are fair.**
  - Over two simulated seasons I got 12 and 9 offers, netting −6.1 to +4.8 in neutral value (`snaps/*/proposals.txt`).
  - In the UI: "BKN want López for Da Silva · In your favor" (`shots/c02-offers.png`).
- **The AI league reads like a league.**
  - 4 of 93 traded players moved twice in a season (round 2: 16/104).
  - Over 4 seasons × 2 seeds, only 1 player was re-traded within 60 days (`long2_*.log`).
  - The deals look sensible: SAS sent Vassell + Harper + a 1st for Trae Young; PHX sold Booker; teams made 24–42 trades a season.
- **Cornerstones are priced.**
  - Edwards, Flagg, Wembanyama, Cade and Haliburton can't be bought with MEM's whole stash.
  - Jalen Johnson costs 1.28× his value, Knueppel 1.30×, Avdija 1.98× (`probe-corner.ts`).
- **Dumps cost the burden.** Patrick Williams (58, $18M × 3) costs about a late first to move. Curry ($62.6M through 2029) costs 27–31 value (`probe-dump2.ts`).
- **Scouting and a living class make the draft a story.**
  - Marc García (#1 on the board, consensus 98% to go #1) read **OVR 78-84 · POT 91-99** in February. After I sent scouts, he read **72-74 · 85-89** at the lottery, plus "An injury in February (−3)". His true rating is 75/87 before the injury, so my staff spotted a bust the league missed (`f02`, `h02`, `u8.log`).
  - Ratings moved during the season for 57 of 65 prospects, with 7–9 news items on risers and fallers (`scout_*.log`).
  - The mock gives odds per pick ("93% gone by your #15").
- **Contract talks are real and honest.**
  - A lowball on Javon Small got "Under 85% of his ask: Small takes it as a lowball", then a counter at $3.3M.
  - On Ty Jerome the sheet was plain about the limit: "your Early Bird rights allow $16.1M … No offer can re-sign him."
  - Role pay fixed round 2's absurd ask: Small (5.9 minutes a game) now asks $3.4M, not $23M (`u13*.log`, `u14.log`).
- **Draft night has theatre.** "Offers (28)" for my #12, the best at "111% of its value", plus pick-by-pick grades and the lottery reveal (`u9.log`, `h01`).

## 3. Findings

### 1. The free-agent market collapses: stars sign for scraps if you wait (P1)

- **What you see:**
  - I withdrew my bid for Ty Jerome (86/29, ask $45.5M) and advanced day by day. His ask went 45.5 → 38.6 (day 4) → 27.9 (day 6) → 14.6 (day 10) → 8.9 (day 13). UTA signed him for **$6.5M × 2** on day 14 (`u17.log`).
  - LeBron James (84) and Josh Hart (80) signed for $2.5M. Fred VanVleet (82) signed for $6.2M.
  - Across 4 seasons × 2 seeds, every summer 2–7 of the 13–20 free agents rated 78+ signed for under 50% of market (`long2_7.log`, `long2_99.log`):

    | Player              | Signed | Market value |
    | ------------------- | ------ | ------------ |
    | Trey Murphy III, 88 | $23.0M | $59.0M       |
    | Dyson Daniels, 87   | $17.7M | $58.9M       |
    | Saddiq Bey, 84      | $6.8M  | $39.8M       |
    | Giannis, 84/35      | $3.0M  | $27.4M       |

- **Cause:** `SUMMER_FLOOR` (75% of market until day 20) is switched off as soon as the market's money can't pay it: `summerFloor` returns 0 when `p.asking.amount < floor` (`src/core/league/contracts.ts:456-462`). The floor disappears in exactly the case it exists for.
- **Why it matters:**
  - Any team with room, or with the mid-level once an 86's ask drops under $14.9M around day 10, gets a star for nothing.
  - The FA sheet even announces the timetable ("From day 5 his price drops 15% a day").
  - The user can't lose this game. Neither BBGM's mood-based market nor MyNBA lets an 86 fall to 14% of value.
- **Fix (M):**
  - Make the 80+ floor hard until day 20.
  - After that, a player unsigned at his floor takes a one-year "prove-it" deal at the floor from any team with an exception, or goes home at the floor.
  - Have AI teams bid with their mid-level the day an ask fits it.
  - Add a CI invariant: no 80+ signs under 55% of market.

### 2. Players rated 72–79 still fall to the minimum (P1, round-2 #2 still open)

- **What you see:**
  - On day 15: Jamir Watkins (77/25) at **$2.2M × 3** with "market $13.1M" on his own sheet, and Chaney Johnson (76/24) at $2.15M with market $12.5M. I signed both (`u18.log`).
  - Headless runs: Josh Hart went for the minimum in 3 of 4 summers. Grayson Allen, Norman Powell, Valančiūnas, Mikal Bridges (78), Hunter and DiVincenzo all went for $2.5–3.0M (`long2_*.log`, `probe-fa` output).
- **Why it matters:** Late free agency is a free-starter vending machine. Round 2 asked for this floor and it hasn't arrived.
- **Fix (S):** Give 72–79 a floor of about 50% of market until day 20, then one-year deals near it.

### 3. Draft night: picks on the clock are overpriced, rookies afterwards are cheap (P1/P2, the reverse of round-2 #11)

- **Evidence:**
  - Across first rounds, the clock value summed to 588 and the players drafted with those picks were worth 378 right after. In the other seed, 616 vs 458. In 19 of 23 first-rounders the player was worth less than his pick (`probe-draft2.ts`).
  - Values move in steps: picks #9–#14 were all about 31 and #15–#19 about 25. #12 became Ben Butler, worth 9.0.
- **Exploit, round trip (`probe-roundtrip.ts`):**
  - I sold MEM's #8 on the clock for Kevin Porter Jr. (84, v52.9).
  - Minutes later, the #1 overall pick (74/85) could be bought for Post + Pippen + a 2030 1st (v34). #9 Carter Gray cost v34.8, and #16 Kelechi Okoro (72/78) cost Cole Anthony (v6.3).
  - Buying back your own former pick is correctly blocked ("traded … away this season").
- **Why it matters:** The best draft strategy is to sell every first on the clock and buy rookies afterwards. That empties the draft of meaning.
- **Fix (S-M):**
  - Price a pick on the clock at the expected consensus value of whoever the team's board would take.
  - Keep a rookie valued on the consensus read until his first summer, rather than switching to his true ratings the moment he's drafted.

### 4. Scouting makes your staff all-knowing for free (P2, new)

- **Evidence** (`probe-scout.ts`, two leagues, top-45 prospects):

  | Reader                           | Error (MAE) |
  | -------------------------------- | ----------- |
  | Consensus                        | 2.7–3.0     |
  | Your staff, budget 50, unscouted | 2.5         |
  | Your staff, budget 50, 90 days   | 0.69–0.75   |
  | Your staff, budget 50, 175 days  | 0.63–0.68   |
  | Best AI front office             | 1.77–2.04   |
  - Your fully scouted read is about 3× sharper than the sharpest AI team (`prospects.ts:85-92`: the user's q reaches 0.85, the AI's caps at 0.4).
  - Truth score of the player chosen over 14 slots (truth-best 77.68):
    - Consensus: 73.91
    - **The staff's automatic scouting alone: 76.92**
    - Every prospect scouted 175 days: 77.44

- **Why it matters:** Scouting changes outcomes, but the player's own choices barely do: manual scouting adds at most about 0.5. The auto-list (prospects near your pick) does nearly all the work. BBGM makes you pay for scouting budget; MyNBA makes you spend scouting points.
- **Fix (M):**
  - Cap the user's correction near the sharp AI teams' (q about 0.55).
  - Make the auto-fill slower or smaller, so rotating scouts is a real decision.
  - Optionally let the scouting budget, not the coaching budget, buy precision.

### 5. A staff read can be off the rating scale (P2)

- **What you see:**
  - In the preseason the board showed García at **88 · POT 89-99** in the All-NBA badge colour (`shots/a08-draft.png`). His truth was 75/87, and the class's true best was 79.
  - In February, after 33 days of watching, his "4 in 5" range (POT 91-99) still didn't contain the truth (87).
- **Why it matters:** The bust drama is great. But an 88 shown on a 19-year-old breaks the 40-99 tier ladder and the numbers rule's spirit.
- **Fix (S):** Shrink reads toward the class's distribution (a Bayesian prior), so a wild read shows as a wide range rather than an 88.

### 6. Cap-space laundering is smaller but still works (P2, round-2 #3 partly fixed)

- **Evidence** (`probe-launder.ts` on `deadline_eve`; flip profit means the resale value minus what I paid):

  | Bought from (tax team) | Player (OVR)       | Flip profit |
  | ---------------------- | ------------------ | ----------- |
  | GSW                    | Jalen Smith (80)   | +8.9        |
  | MIN                    | Joan Beringer      | +8.1        |
  | HOU                    | Keegan Murray (81) | +7.6        |
  | GSW                    | Kristaps Porziņģis | +7.3        |
  | WAS                    | Justin Champagnie  | +7.1        |
  | CLE                    | Jarrett Allen (83) | +6.3        |
  - The top 12 flips totalled +45, about two mid firsts. Round 2's best single flip was +40.
  - The random search found 9 of 729 accepted deals with a 20%+ gain for me, all through retooling tax teams: Mikal Bridges (83, $33.5M) for GG Jackson II + a 2nd, net +17 (`pt_14.log`).

- **Fix (S):** Tax teams should shed their worst contract first. Cap relief value should come off the overpaid part only (already true for deals with the user; extend it to `makeItWork`'s buys).

### 7. The salary floor is invisible until it's too late (P2)

- **What you see:** I finished free agency with $53.1M unused. Office says "Under the cap · Cap space $53.1M". Only Finances shows "**Salary floor shortfall $35.6M**" (`u21.log`, `src/core/league/finances.ts:224`).
- **Why it matters:** $35.6M was free money to spend on one-year deals, and the FA screen never says so.
- **Fix (S):** Add a line under the FA hero and the Office card: "$35.6M under the floor: you pay it anyway at season's end."

### 8. The FA sheet's market prediction is wrong (P2, numbers rule)

- **What you see:** Jerome's sheet said "No other team can pay his ask: the most one could is about **$16.4M**. From day 5 his price drops 15% a day toward it." He signed for $6.5M (`u16.log`, `u17.log`).
- **Why it matters:** A number shown before a choice turned out false. The target keeps falling as other teams spend their money.
- **Fix (S):** Show a range from a quick projection of the market, or say "falls until someone bites" without a number. Better, fix #1 so the floor is the number.

### 9. AI payrolls go past the second apron despite the README's rule (P2)

- **What you see:** On opening nights, 1–4 AI teams were past the second apron:
  - OKC at $250M and $261M: it matched offer sheets for Cason Wallace ($14.8M) and McCain ($11.6M) and re-signed Ajay Mitchell ($16.3M).
  - SAS at up to $270M, TOR at $253M, MIN at $269M (`long3_7.log`, `long2_99.log`).
- **Why it matters:** This is NBA-plausible, but the README says "nobody is brought back past it". The apron discipline isn't what's documented, and these teams then can't trade (PHI showed "none: salary" for every cornerstone).
- **Fix (S):** Count offer-sheet matches and re-signings against the 2nd-apron budget, or correct the README.

### 10. The dock doesn't say what a deal does to your team (P2)

- **What you see:** The Booker deal showed value, salary and partnerships, but no strength change. MEM went 28-26 → 41-41 after it.
- **Comparison:** BBGM shows team ovr before/after; MyNBA shows team rating.
- **Fix (M):** Add a "Staff's read: about +1.8 net · +3 projected wins" line from the forecast's `ROSTER_NET`, labelled as the staff's read.

### 11. The staff's roster cuts still pay dead money without trying a trade (P3, round-2 #12 open)

"Release 3 · staff's picks" cut Taylor Hendricks (22, $7.8M dead) and Kris Murray ($5.3M dead) in one tap. The toast read "Micah Peavy and Kris Murray and Taylor Hendricks released." (`shots/b03-resign-preseason.png`). **Fix (S):** Add "Find a taker" (a dump through the trading block) before Release, and fix the list grammar.

### 12. Remaining polish, mostly still open from round 2 (P3)

- **"Trade for #N" still blames value.** It says "Nothing you can offer…" when the real blocker is a rule (`PickTradeSheet.tsx:55-58`, unchanged).
- **AI teams never use protections, swaps or cash** (`tradePackages.ts` has no protection logic).
- **No Mock tab in the preseason.** The draft page has only Board, Combine and Picks (`a08`).
- **Truncated names.** "H. …" still appears in the ATL asset list (`a03`).
- **No injury warning on the trade confirm.** Booker was "Out 8 games" in Find, but the confirm sheet doesn't say so (value does discount injuries: `contracts.ts:119`).
- **The draft-night grade contradicts the reveal.** It calls my scouted pick "Big reach · ranked 19th" (Radović) while the same screen shows his true 73/82, above the consensus read of 70/77. Suggest "your scouts had him 73/81".
- **The deadline call for a bubble team is empty.** At 61–71% odds: "stand pat. The team is where it is."

## 4. Since round 2

| #   | Round-2 finding                                     | Status                        | How verified                                                                                                                                                    |
| --- | --------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Dead top of the market                              | **Fixed, then overcorrected** | Barrett, Butler and LaVine signed on days 1–3. The top now collapses instead (#1).                                                                              |
| 2   | 72-79 crash to the minimum                          | **Still open**                | Watkins and Chaney Johnson for about $2.2M; Hart and others for the minimum (#2).                                                                               |
| 3   | Cap-space laundering                                | **Partly fixed**              | +6–9 per flip vs +40 (#6).                                                                                                                                      |
| 4   | No scouting, frozen class                           | **Fixed**                     | Ranges narrow with days, risers and fallers appear, the combine sharpens reads, each AI team has its own board. New problem: too strong and automatic (#4, #5). |
| 5   | "Trade for #1" message                              | **Still open**                | The code is unchanged.                                                                                                                                          |
| 6   | AI churn                                            | **Fixed**                     | 4/93 traded twice in a season; 1 re-trade within 60 days over 4 seasons.                                                                                        |
| 7   | AI never uses protections                           | **Still open**                | —                                                                                                                                                               |
| 8   | Cornerstones too cheap                              | **Fixed**                     | 1.2–2.0×, and Edwards and Flagg can't be had.                                                                                                                   |
| 9   | Helper overpays to rebuilders                       | **Partly open**               | `makeItWork(best)` still builds −20 to −57 neutral deals (Giddey −45.5, Fox −57.5, `pt_14.log`). The dock's overpay warning catches some.                       |
| 10  | Cheap 87s / tiny-sample asks                        | **Mostly fixed**              | Spencer is now 81, and Small asks $3.4M.                                                                                                                        |
| 11  | Picks priced below their draftee                    | **Regressed (now above)**     | #3.                                                                                                                                                             |
| 12  | Staff cuts pay dead money                           | **Still open**                | #11.                                                                                                                                                            |
| 13  | Polish (truncation, preseason mock, FA market line) | **Partly**                    | The market line now exists (but mispredicts, #8). Truncation and the preseason mock are still open.                                                             |

**New in these rounds:**

- Good: offer-sheet drama among AI teams ("Offer sheet · ATL · OKC decide by day 3"), the "What matters to him" panel, and AI deadline consolidation.
- Problems: the FA collapse (#1), draft-night pricing (#3) and the scouting asymmetry (#4).

## 5. What it would take to reach 9/10 in this lens

1. **A free-agent market with real floors** (#1, #2, #8; M). No 80+ player under about 55% of market and no 72-79 at the minimum before day 20; AI teams bid with exceptions as soon as an ask fits. This would make the summer an auction rather than a waiting game, and it's the biggest gain available.
2. **One value scale across draft night** (#3; S-M). Price the pick on the clock and the fresh rookie on the same consensus basis. Draft position would matter again, and the sell-and-rebuy loop would close.
3. **Scouting as a budgeted choice** (#4, #5; M). Bounded reads, sharper AI teams, and the scouts' days as a scarce resource. MyNBA-level preparation without the free edge.
4. **Decision numbers in the dock and the FA sheet** (#7, #10; M). A team-impact read, floor and tax consequences, and an honest market projection, so every GM move shows what it does, in the app's own numbers-rule style.
5. **AI parity in tools** (#12; M). AI teams protect picks and use swaps and cash, plus sign-and-trade, so the league uses the same rulebook the user does.

## 6. What I couldn't verify, and how I tested

**UI play** (Playwright, 390×844 phone, own profile; real league, Memphis, Normal; one full season into the 2027-28 preseason):

- Preseason: staff cuts and the extension list.
- Sim to the deadline: two stops; offers, Find, Block; made the Booker trade; a "What would make this work?" for Kawhi.
- Sent 5 scouts in February, simmed through the play-in, the lottery reveal, board and mock, and pick offers.
- Drafted #12 (staff's pick, Radović) and #14 (Maxwell, by hand).
- Re-signing: options, Jerome's Early Bird wall, a lowball and counter with Small.
- Opened free agency: bid for Jerome, then withdrew it and tracked 14 days; Whitmore lost to a rival; signed Watkins and C. Johnson.
- Next preseason: office, the Edey extension sheet, Booker on the block, Finances.
- Sims were fast even with ten reviewers on the machine: to the deadline in about 9 seconds; season plus playoffs in about 30 seconds.

**Headless runs** (reused round 2's methods):

- `snap.ts`: 2 seasons, 2 seeds.
- `probe-trades.ts`: 4,000 random deals.
- `probe-launder.ts`, `probe-dump2.ts`, `probe-corner.ts`.
- `probe-scout.ts`: reads by budget and days, and pick quality.
- `probe-draft2.ts` and `probe-roundtrip.ts`.
- `probe-fa.ts`.
- `long2.ts` and `long3.ts`: 4 seasons × 2 seeds for payrolls, aprons, churn and FA bargains.
- `aitrades.ts`.

**Not verified:**

- Hard and Casual difficulty.
- My own restricted free agent receiving an offer sheet, and offer sheets I make.
- 10-day contracts, waivers, stretch, two-way conversions.
- Which exception each AI signing used.
- The fictional league, the desktop layout, and a second UI season.
