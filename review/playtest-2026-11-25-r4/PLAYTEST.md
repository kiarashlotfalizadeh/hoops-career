# Ten-Sonnet playtest, round 4 (2026-11-25)

This round reused the ten personas, the brief and the Playwright kit from rounds 1 to 3. The build is main `dca3a6a`, which includes the round-3 fix round:
- luck spread
- vet market
- plan worth
- option to market
- walk risks
- big-game sheet
- saves
- top end
- GM-only wording

Every tester started a fresh save on a production build (`vite preview`) in headless Chromium, on a 390x844 phone unless their report says otherwise. The reports are in `reports/` and the brief is in `BRIEF.md`. Round 3's synthesis is in `../playtest-2026-11-24-r3/`.

## Verdict

**Overall 7.71, the highest of four rounds (7.45 → 7.57 → 7.41 → 7.71). Recommend-to-a-friend was 7.7, also a high.** Every tester scored between 7.5 and 8, the tightest spread yet (round 3 ran 7 to 8). All ten would pay $7.99 on phones again. On $14.99 for Steam:
- **Yes or probably, with a condition (4):** 02, 06, 07 (if the top-end drift is trimmed) and 08 (if the real names get closer).
- **Only if or maybe (5):** 01, 03, 04, 05 and 09.
- **No (1):** 10, because the desktop is a stretched phone column.

Nine of ten areas rose. Front office gained most (+0.6, to 7.83) and first hour reached 7.8. Game day (+0.4) and analytics (+0.35) recovered round 3's losses. Sim honesty was the one flat area (6.6). A per-tester change of ±0.5 is still noise, so +0.3 overall is a modest signal. That nine of ten areas moved the same way, and no tester went under 7.5, is the stronger signal.

**Round 3's two verified problems are gone from the reports:**
- No tester saw an absurd luck label. 01 saw "about a 1-in-25 shooting night", and 06's −30.7 night (8-43 from three) carried no 1-in-millions tag.
- No tester said the season coaching total and its parts disagree.

The vet market, plan worth, the big-game sheet and the walk-risk list all showed up in play (see "Fixed since round 3").

**The top problem is the same one, now measured cleanly: coaching reads as noise.**
- 06 coached 15 games live: "+2.3 pts ±3.4", and the staff's sims did no worse (5-8 against its 5-12).
- 01's timeouts logged "DAL 11-12 since", and the per-night tactics figure sat at ±0.1.
- 03 found that every staff test read "No clear edge".

Players trust the measurement (analytics 7.65, with 9s from 01 and 06) and dislike the answer. Coaching depth (6.94) and game day (6.89) are still two of the four lowest areas, with rebuild (6.57) and sim honesty (6.6).

## Scorecard

| Area | R1 | R2 | R3 | **R4** | Δ R3→R4 | R4 range | Note |
|---|---|---|---|---|---|---|---|
| A First hour | 7.3 | 7.55 | 7.35 | **7.8** | +0.45 | 7–8.5 | The checklist with "keep the staff's" exits, owner goals on day one, and a broadcast opener. Jargon on defaults is the drag (09). |
| B Coaching depth | 7.1 | 7.44 | 6.83 | **6.94** | +0.1 | 6–8 | Breadth is praised (06 8, 01 7.5). The levers measure as small and the staff's counters rhyme. |
| C Game day | 6.8 | 7.31 | 6.5 | **6.89** | +0.4 | 6–8 | Break reports, ATO and last-possession calls land. Games take 6-12 minutes and moves are "inside the noise". |
| D Front office | 7.6 | 7.06 | 7.2 | **7.83** | +0.6 | 6.5–9 | 04 gave 9: an AI that can't be fleeced and says why, FA bidding, refusal alternatives. Exploits remain. |
| E Rebuild & dev | 5.9 | 6.06 | 6.38 | **6.57** | +0.2 | 5–7.5 | Up for a fourth round running. There is still no development lever, and summers read as coin flips (02). |
| F Analytics | 7.3 | 7.7 | 7.3 | **7.65** | +0.35 | 6–9 | 9s from 01 and 06. 03 wants shot-location tables and export. Two margin figures disagree (verified). |
| G Sim honesty | 6.8 | 7.2 | 6.65 | **6.6** | −0.05 | 5–7.5 | League means hold (03, 07). The long-save top-end creep (07), the easy regular season (05) and scores reading high (09, 10) cost points. |
| H Stakes & story | 6.9 | 7.45 | 7.3 | **7.55** | +0.25 | 6–9 | The owner bites winners (05: 66 wins graded −50). The journeyman gave 9 for the firing arc. |
| I UX on device | 7.2 | 7.3 | 7.3 | **7.45** | +0.15 | 7–8 | Resume, offline play and backup are flawless. Playoff sheets trap sims, and tablet and desktop are a stretched column. |
| **J Overall** | 7.45 | 7.57 | 7.41 | **7.71** | +0.3 | 7.5–8 | |
| Recommend | 7.5 | 7.65 | 7.45 | **7.7** | +0.25 | 7–8 | |

Averages count only the testers who scored an area:
- **B:** 04 skipped it.
- **C:** 04 skipped it.
- **D:** 06 skipped it.
- **E:** 06, 08 and 10 skipped it.

## The ten players

| # | Persona | Team / what they did | J R1 → R2 → R3 → R4 | One-line take |
|---|---|---|---|---|
| 01 | FM lifer | DAL, 2 seasons: 40-42 (lost both play-in games), then 49-33, beat DEN, lost Game 7 at OKC | 7.5 → 7.5 → 7.8 → **7.8** | "The first basketball game that shows what the tactic did, with error bars." Live games are slow and low-leverage, and the staff's counters contradict its own post-game. |
| 02 | Rebuilder | CHI from 30th: 22 → 40 → 43 → 49 (conf. finals) → 46 | 7.5 → 8 → 7.5 → **8** | The best offseason layer in a mobile GM. A mid-level signing silently voided the Castle bid. There is no development lever. |
| 03 | Analytics | MIN, 2 seasons: 46-36 and 49-33, two first-round exits | 7.5 → 8 → 8 → **7.5** | Box scores and on/off reconcile by hand. Decisions get graded with error bars. Wants shot-location tables and an export. |
| 04 | Capologist | GSW, GM only, 3 seasons: 53-29, 44-38, 36-46 | 7.5 → 7.5 → 7.5 → **8** | "The AI will not be fleeced, and it says why." The make-it-work solver reaches for your best player, and AI teams ignore the tax. |
| 05 | Contender | OKC, 4 seasons: 63, 64, 66 and 64 wins, 2 titles | 7 → 7.5 → 7.3 → **7.5** | The owner has teeth (−50 at 66 wins). The regular season is too easy, the tax wall kills dynasties with no warning, and there is no title scene. |
| 06 | Game-day coach | PHX, 31 games (15 live), 10-20 | 7.5 → 7.7 → 7 → **7.5** | The counterfactuals and luck ledger are the best anywhere, and they prove its coaching didn't beat the staff (+2.3 ±3.4). |
| 07 | Journeyman | 11 seasons: CHA (Finals 2030), TOR, MIL, then fired | 7 → 8 → 7.5 → **8** | Career layer 9. League means are flat over 11 years. The top end creeps: a 40.8 ppg record, three 98s at once. |
| 08 | Purist | NYK GM-only (46-36), NYK GM+HC (47-35), fictional NYK | 7.5 → 7 → 7.5 → **7.6** | Real contracts, history and the 65-game award rule. The AI breaks up star teams in January, and the coaches are invented. |
| 09 | Newcomer | WAS real (30-52, lottery to #9), fictional LA (10-10) | 7.5 → 7 → 7 → **7.5** | "It never made me feel dumb." Long quiet sims, jargon on defaults and arcade-looking scores. |
| 10 | Commuter | PHI, ~18 sessions, 50-32, beat TOR in 7 | 8 → 7.5 → 8 → **7.7** | "The best commute sim I have used": exact resume, full offline play, a week in 1.5 s. No skip inside the clutch stretch. |

## Fixed since round 3 (as the testers saw it)

- **The luck labels are sane.** 01 saw "about a 1-in-25 shooting night", and 06's worst night (−30.7 on 8-43 threes) carried no absurd rarity. Nobody quoted a 1-in-millions label, where round 3 saw "1-in-900,856,495".
- **Coaching figures add up.** 06's season ledger ("live coaching +2.3 ±3.4; 36 timeouts +2.0 ±2.1; 28 subs −0.9 ±2.0") drew no total-vs-parts complaint.
- **Plans carry a measured worth.** 01 saw "Your plan: Press after makes +2.4 pts", with plans worth 1-2 points a night and "the game says so". Round 3's "plans don't move the forecast" didn't come up.
- **The vet market partly exists.**
  - 02 sold Smith (77, expiring) for Ace Bailey and a UTA first.
  - The Block tab's packages let 02 and 05 sell vets and shed salary in minutes.
  - AI offers for vets are still mostly seconds (02).
- **The big-game sheet gives the playoffs a beat.**
  - 10: "Coach it live / Not yet / Sim it" before Game 7.
  - 03: "a fun elimination game tonight sheet".
  - 05: "You can close it out tonight", and a Finals Game 2 that stopped itself for a last-possession call.
- **Walk risks are listed.** 10's Re-sign page named the four rotation players who leave, and 03 found the "Let them go and open" confirm sheet "good UX".
- **"Sim to the end" takes two taps** (06: "Skip the last 2:45? Yes, sim it").
- **Owner goals read the roster.** Nobody got round 3's youth-minutes goal for a veteran contender. 09's rebuilding Washington got a youth goal; 04's Golden State and 05's Oklahoma City did not.
- **No year-one 99s or 44-point scorers.** The scoring leaders in the first seasons were 30-33 ppg (03, 08, 07). The creep returns after year 8 (theme 3).
- **No GM-only "head coach" credit complaints** from 04 or 08, the two GM-only testers.
- **Still holding:** exact live resume (10, three closes mid-game), cold start offline, backup restore, no page errors in any session, and league means (03: pace 98, ORtg 116, eFG 54.3%, 3PA rate 41-43%).

## Themes, ranked

### 1. Coaching is measured cleanly, and it measures as noise. Major.

Round 3's coaching figures were noisy because the luck label was wrong. The labels are right now, and the answer is the same:
- **06 (15 games live):** "+2.3 pts ±3.4. The staff's bench would have done about as well." Its live record was 5-12; the staff's simmed stretch went 5-8 at the same net rating.
- **01:** timeouts logged "DAL 11-12 since", and the per-night tactics figure was −0.1 or +0.1. "Two blowouts in a row from luck alone also feels bad, and it cost me the playoffs."
- **03:** every staff test read "No clear edge", and "Your settings, net" said Drop coverage "cost you" with no size.
- **05:** the best case was "Your moves +2.1 ±1.0" in one game.

Nobody doubts the measurement, so this is now a design question rather than a bug. Real coaching is worth little per game, but a coaching game has to let the coach feel it. The testers asked for:
- a per-move verdict at the break, not only after the game (01);
- one lever whose effect can be seen and proved, such as a timeout that usually ends a run (06);
- a season figure in wins, where 1-2 points a night adds up to something.

### 2. The staff's advice contradicts itself and repeats. Major.

- **01, Game 7 at OKC:** the staff counter "2-3 zone: Should help" lost the glass 23-6 (−17.9). The post-game then advised "no zone against strong rebounding teams" while crediting the plan +1.4.
- **01:** the staff pushed Irving and Washington for a 38-year-old Curry while saying "the forecast barely moves your postseason chances".
- **09:** at 17-35, the staff's deadline "sell" sent Davis (87) for two older 82s, with "No clear edge".
- **05:** "2-3 Zone, the staff thinks this helps" came up in about 20 of its ~35 live games, sometimes at 5 points on 2 trips.
- **01:** after ten opponents, the counters "rhyme": win the glass, take care of the ball, beat the zone with motion.

A recommendation should be checked against the reasons the report will give afterwards, and a call already shown should hold back.

### 3. The top end creeps in long saves, and the contender's season is too easy. Major.

- **07 (11 seasons):**
  - The scoring leader climbed every year: 32.7, 33.8, 35.2, 37.2, 39.5, then 40.8 (a record) in 2034-35.
  - The top-10 average OVR went from about 93.4 to 96.5, and three players sat at 98 from 2033.
  - Stars barely age (SGA still 94 at 33), and Sacramento went 14-68, 68-14, then 73-9.
  - League scoring, pace and 3PA rate stayed flat throughout.
  - star-check runs eight seasons per league, so its new 40-point limit can't see a climb that peaks in years 9-11. Verified (the scripts' season count).
- **05 (OKC, four seasons):** 63, 64, 66 and 64 wins, a 7-11 game gap to second, 45-10 at the deadline twice. Other saves had OKC at 70-12 (08), 66-16 (03) and 68-14 (01). No rubber-banding, and no chase either.
- **09 and 10:** single games read arcade: 136-136 in regulation, 151-152 in overtime, a 35 ppg fictional leader.

### 4. Front office: the honest AI wins, and four exploits or traps remain. Major for 02, 04 and 05.

This is the most improved area (7.83), with 04 at 9: "the best transaction layer I have seen in a mobile GM game". The gaps:
- **A mid-level signing silently voids a pending cap-space bid.** Verified. `offerRoute` allows the mid-level when payroll + held bids + amount is over the cap. Signing on it raises the payroll, and the pending space bid fails at decision time. 02 lost a max offer to Castle that way and only learned from the inbox. In the NBA a team under the cap can't use the non-room mid-level at all.
- **Waiting out the market pays.**
  - 01: Thybulle asked $12.75M on day 1 and took $2.9M on day 30 (77 OVR).
  - 03: DiVincenzo went from $12.2M to $6.7M.
  - The summer floor only covers 80+ players.
- **Benching a star halves his price.** 07's 89-rated Ament asked $53.4M at 25 and $20.3M at 29, after 07 benched him for a season. The cause is the market's role-pay rule (`ROLE_PAY` in contracts.ts), which pays by minutes shown. Verified. It is a cheap re-sign exploit for the user.
- **The make-it-work solver asks for your best player and overwrites the deal.** To dump a $6.4M role player it wanted Podziemski. For Queta it wanted Curry plus three firsts (04).
- **AI teams ignore the tax.** 13 of 30 were over the line in year 1, and OKC carried $246M while going 65-17 (04).
- **The tax is a wall a champion only sees at the last minute.** The brackets and repeater rate are NBA-accurate: re-signing Wallace for $18.3M added $103.4M of tax (05). 05 asked for next summer's bill shown when signing a rookie-scale player.
- **Trade and FA cards show only this season's salary.** 02 took on George at $6.6M and found $28.7M the next year.

### 5. The AI breaks up real teams in season 1. Major for 08.

08 saw Curry traded from GSW to MEM, Booker from PHX to HOU, Adebayo from MIA to SAS and Sabonis from SAC to CHA, all in the first January. GSW then went 27-55 and PHX 28-54. "Curry traded to Memphis in January costs a purist more trust than any rating mistake." The living-league three-team deals need a first-season brake on franchise stars. The real head coaches are still invented (08, a second round running).

### 6. Live games: slow, and the controls hide. Major for 01 and 06, minor for others.

- **Length.** 06 took 9-12 minutes a game. 01 measured about 2.5 minutes a quarter at 4x. 09 took 6-10 minutes at 4x.
- **No skip inside the clutch stretch.** Skip ahead appears only at breaks, so 10 sat through about 2.3 minutes at 2x.
- **Skip ahead is hidden** until you tap the speed control (08).
- **The staff-call card sits under the bottom nav** and expires before you can scroll to it (01).
- **Phone 3D upright is a ~210px strip** under a "Watch sideways" prompt (06), and the 2D court is "thin" (01).

### 7. Two margin figures in one report disagree. Major for 03, minor for others. Verified.

- **The bug.** The "What decided it" list prices free throws at 0.6 a make (`ftSwing` in gameReport.ts). "How the margin adds up" counts them at a full point each (SummaryTab `MarginSum`). So one report says "Free throws −7.8 pts" and "free throws −13" (03), and another says +13.2 against "free throws +22" (02).
- **The same overlap elsewhere.**
  - 07 saw "Tactics 0.0 pts" beside +4.2, +3.5 and +3.0 items.
  - 05 saw "zone clogged driving lanes +21.6" beside "Your moves +2.1" and "Tactics −0.5".
- **What the testers want.** The page does say the readings overlap. A nerd wants one ledger: the same unit for the same thing, and the factor rows marked as reasons rather than points of the margin.

### 8. Playoff sheets trap sims, and the title has no scene. Minor to major.

- **The big-game sheet blocks the sim.** It is the right idea, but "Sim to end of playoffs" does nothing until the sheet is answered, and the sheet opens a beat later (08, 02, 05, 04). 02, who never meant to coach, called every elimination game's confirm a chore.
- **Close-out quick sims loop.** 05's script looped seven times on one game. 07's re-sign loop spun 80 times on "Keep negotiating".
- **No title scene for 05.** After two rings it saw an inbox line and an owner email. Its script cleared moments, so a scene may exist; worth checking.
- **The deadline can be skipped.** 03's "Sim to end of regular season" passed the deadline and an offer. A card already open when a sim starts doesn't stop it again (`runSim`'s `before` set). Plausible, not verified.

### 9. Newcomers: quiet sims and jargon on defaults. Major for 09.

- **Quiet sims.** "Sim to trade deadline" took 09 from 3-9 to 16-30 over 34 games with no decision asked, which is where a newcomer drifts off.
- **Jargon on defaults.** About 20 terms hit at once: "Drop coverage", "4-Out, 1-In", "Post Hub", "Bird rights", "mid-level". There are also F grades on the defaults the game tells you to keep.
- **Thin "Why".** "Your staff has you ahead on value" teaches nothing.
- **What 09 asked for.** A "this month's one thing" stop, and a plain-English line about the default system.

### 10. Analytics and rebuild wishes. Major for 03 and 02.

- **03:**
  - rim, mid and three frequency and FG% per player, lineup and team, with league ranks;
  - per-100 and clutch stats;
  - a stagger tool;
  - export of every table;
  - letter grades that link to the table behind them.
- **02:** the staff's "Development coaching 22nd of 30: +0.0" never moved in five years. Staff priority is worth +0.3 to +0.6 OVR a year against summer swings of −4 to +4, so a development budget or staff lever would turn a dice roll into a plan.

## Bugs (deduplicated)

Repro steps and screenshots are in each report's Bugs section. "Verified" means I confirmed it in the code.

**Front office**
- **Mid-level signing voids a pending cap-space bid,** with no warning on the sheet (02). Verified, see theme 4.
- **"Take the job" switches teams on one tap,** with no confirm sheet (07; `OfferRow` in Career.tsx calls `takeTeam` directly). Verified. 07 left a Finals roster by accident.
- **The inbox relabels old mail after a job move.** Charlotte's lottery and development mail appear under Toronto staff names (07).
- **Re-sign sheet length resets** to the player's wanted years after Make offer (03).
- **A trade offer's Accept lapses silently** if you leave after the first tap (09).
- **Butler retired with no warning** and vanished from the re-sign room (04).
- **The payroll count-up** reads $210.2M mid-animation against $223.3M final (04). The same kind of count-up showed a 75-90 final score (06).
- **The make-it-work solver overwrites your deal** with a names-only toast (04).
- **Development-year call.** The text says "standing drops 10 points"; job security went 42 to 39 (02).
- **"Reach · ranked 7th"** on a #4 pick the mock gave 68% at #4 (02).
- **The contract total differs** between the offer sheet ($256.5M) and the news item ($241.6M) (07).
- **A cuts message says camp deals "cost nothing"** while releasing Niang left $2.4M of dead money; a salary-floor line appears that the cap explainer never mentions (04).
- **The opener counters all read "Staff still looking…",** so guide step 3 can only be skipped (09).
- **Re-sign Negotiate buttons hide behind the dock** (09).

**Game day and reports**
- **Two free-throw figures in one report** (03, 02). Verified, see theme 7.
- **The staff-call card is hidden by the bottom nav** (01).
- **Win probability read 99% at a 24-point Q2 lead,** and OKC won by 3 (05). One game, worth a calibration check.
- **"Watch & coach live" is missing the day before a game,** so a script simmed a game meant for coaching (01).
- **The "Now" tab's accessible name** becomes "1 Now : 1 calls waiting" (06).

**Season, flow and world**
- **Playoff sheets block "Sim to end of playoffs"** (08, 02, 05, 04). See theme 8.
- **Closing mid-sim advances one day** and doesn't resume. No data loss (10).
- **A rotation edit was lost** when 03 closed the browser right after Done. Plain edits save 0.8 s after the change (`store.ts` debounce), and only `attempt` actions save at once. Verified as the mechanism.
- **"PHI" shows where other rows show city names** in standings on a phone. Names over 10 characters collapse to the abbreviation by design (Table.tsx), which reads as a bug next to "Toronto" (08, 07). Verified.
- **The landing screen flashes** "New league / Import backup" while the save loads (08).
- **Team card contradiction at setup:** "rebuild · frugal" on step 2, "rebuild · win-now" on step 3 (09).
- **Owner goal shift:** the first card said 39 wins, the review said 38 (07).
- **Seed label:** the matchup card said "8th East" after a play-in win made it the 7th (07).
- **Ages are year-based:** LeBron shows 42 at tip-off (08).
- **A released 66 OVR lands in the Hall of Fame "Notable retirements" list,** and some player pages show both "All-League" and "2× All-League" (08).
- **The franchise-leaders footer contradicts itself** (08).
- **The floating scroll-up circle** covers the Rotation OVR column, the trade payroll line and the Draft header (10).
- **Tablet and desktop** show the phone column (10).

## Suggested order

1. **Make coaching felt** (themes 1 and 2).
   - Give the break screen a per-move verdict.
   - Put the season coaching figure in wins.
   - Check staff counters against the post-game's reasons, and stop repeating a call the user has seen.
   - Look for one or two levers whose true effect is large enough to prove in a handful of games (late-game fouling, matchup hunting, ATO sets). Measure first, as the luck fix did.
2. **Close the front-office exploits** (theme 4).
   - Block the mid-level while cap-space bids are pending (or warn on the sheet).
   - Floor late FA prices for good players below 80.
   - Stop benching from cheapening a user's re-sign.
   - Keep the make-it-work solver off your best player.
   - Show year-by-year salaries on trade and FA cards.
   - Warn about next summer's tax when a rookie-scale player is extended.
3. **Rein in the long-save top end** (theme 3).
   - Extend star-check past eight seasons, or add a 12-season run.
   - Fix the climb in the leader's ppg and the cluster of 98s.
   - Make 30+ stars decline.
   - Give a 64-win contender a regular season that pushes back.
4. **Protect real teams in season 1** (theme 5): no franchise-star trades in the first season's living-league deals.
5. **One margin ledger** (theme 7): the same unit for free throws in both places, with factor rows marked as reasons.
6. **Flow and guard rails.**
   - A confirm on "Take the job".
   - Playoff sheets that don't trap "Sim to end of playoffs".
   - Skip ahead inside the clutch stretch and visible without a tap.
   - The staff-call card above the nav.
   - Save rotation edits at once.
7. **Newcomer and nerd wishes** (themes 9 and 10): a monthly "one thing" stop in long sims, plain-English defaults, shot-location tables, export, and a development lever.

## Caveats

- **Fresh saves each round.** Each tester played different teams with different luck, so per-tester deltas of ±0.5 are noise. Four rounds read 7.45 → 7.57 → 7.41 → 7.71. This round's rise is broad (nine of ten areas, every tester at 7.5 or more) but modest.
- **Who coached shapes B, C and G.** 06 again took a lottery team (10-20). 04 coached nothing. 02, 07 and 08 coached one game each.
- **Headless Chromium with software rendering.** 3D and frame-rate judgements are a floor. Several flow bugs (playoff sheets, the "Now" tab name, Negotiate under the dock) partly come from scripts.
- **Two testers fell short of their brief.** 10 played one season, not 1.5. 06 coached 15 live games, not 25, because each took 9-12 minutes.
- **Sonnet testers cluster at 7-8.** The verified code findings (themes 3, 4 and 7, and the bugs marked Verified) carry more weight than the decimals.
