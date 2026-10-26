# Stakes lens: owner, money, job security, difficulty (round 2)

All my files are under `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/3ab7e56a-18a1-4267-8218-da731c128be7/scratchpad/review/stakes/`. Screenshots are in its `shots/` folder, headless logs in `out/`, and the scripts (`harness.mts`, `passive.mts`, `scenario.mts`, `concede.mts`, `ult.mts`, `targets.mts`, `dead2.mts`, `season.mjs`, …) at its top level. Nothing in the repo was touched.

## 1. Verdict

The career's big moments now work. The owner's verdict, his ultimatum, the sack and a new job each take the whole screen in team colours, quoting his own words. The rules explain themselves, tanking no longer pays, and Settings can't dodge a season under way.

What's at risk is now mostly decided by things the player doesn't control or can game:

- **The team you pick sets the difficulty more than the preset does.** The owner's win target sits 7–11 wins above the season forecast for big-payroll teams (PHI, NYK, LAC, NOP). Brooklyn gets a target 9 wins under its forecast.
- **On Hard, a bad roster is a scripted firing.** Sacramento was asked for 35 wins from a roster the owner himself rated at 16. It got a "Reach the play-in" ultimatum at 0.0% odds and was fired.
- **"Add nothing to the payroll you inherited" is usually failed before tip-off.**
- **Two one-tap moves are worth a third of a season's grade.** Lowering the ticket price and raising the budgets before opening night drops the profit target, and conceding the season to play the kids turns a miss into near-maxed minutes.

When you play well, success does feel earned. The season review reads "Asked for 40 wins, got 45 · Press picked 35".

**Score: 6.5/10** (up from 6). The drama and legibility are now an 8. Fairness and how easily it can be gamed hold it back.

## 2. What's genuinely great (protect these)

- **The four job moments.**
  - Verdict: "Good · 'I'm pleased.' Season grade +35…", with each goal's grade (`shots/d-moment0-moment_verdict.png`).
  - Ultimatum: "Reach the play-in · Miss it and you're fired, whatever else goes right." (`shots/sac2-moment0-moment_ultimatum.png`).
  - Firing: "You're fired · 'I told you at the break: reach the play-in…' 12-70 · season grade −100".
  - Hired: "Utah Jazz · Win-now owner… He can't fire you in your first season."
  - The ultimatum and the firing are must-see (`src/ui/moments.ts:52`).
- **The owner gives his reasons in his own voice.** "You have the league's 3rd-highest payroll. I expect a record to match it." "Last season I asked for 27 wins. A roster that got worse on your watch doesn't lower the bar by more than 3." Each goal shows "His read of the roster: 33 wins" next to the target, so the gap is in plain sight (`shots/b03-owner-open.png`).
- **The season review shows earned success.** "Owner: Asked for 40 wins, got 45 +5 · Press: Picked 35 wins, +10", plus "Next season: 32 wins is his read of this roster" (`/office/career?review=2027`).
- **Settings changes wait for opening night, and say so clearly.** "From next season: Easy. Hard until then, so a change can't dodge a season under way." and "Off from next season. Until then the owner can still fire you." (`shots/e01-settings-pending.png`). Difficulty is stamped on each review ("owner's grade −83, poor · Hard").
- **Tanking no longer pays.**
  - Wizards on Normal: 9-73 with every budget at 1 made +$15.7M, against +$25.6M for 40-42 played straight.
  - Heat: tanking lost $84M, against $68M played straight.
  - The floor and the rebuild clock fire a deliberate tanker exactly when grace runs out (MIA and WAS on Normal: fired after season 3).
- **Staff calls with honest prices.** "On pace for 23 wins: under the owner's floor… Chase the floor / Tell him it's a development year", with the cost shown before you confirm.

## 3. Findings (most severe first)

**F1. "Add nothing to the payroll you inherited" is failed before you do anything. P1**

- **What you see:** 76ers in the UI. The preseason goal row reads "$230.9M, $0.0M over". After the staff's own pick of opening-night cuts (one leaves $3.4M of dead money), the goal reads "Behind · $228.2M, $3.4M over · weight 29%" on opening night (`shots/g04-phi-owner-open.png`).
- **How common (headless, `dead2.mts`):** of the 13 teams I checked whose owner sets this goal, 9 were over their target on opening night with no move of their own:
  - $28–47K over from rounding: MIN, TOR, BOS.
  - $0.2–0.5M over: CLE, POR.
  - $2.4–4.9M over from the forced roster cuts: GSW, NYK, ORL, PHI.
- **What it costs:** if nothing changes, the goal grades −25 to −62 instead of +15. It carries 15–29% of the review.
- **Causes:**
  - The target is rounded to the nearest $100K, so it can land below the real payroll: `ownerGoals.ts:618`.
  - `forcedPayroll` leaves out dead money, including dead money from cuts the game requires.
  - The payroll grade drops from +15 to −25 the moment you are $1 over: `ownerGoals.ts:927`.
- **Fix (S):** Round the target up. Include this season's dead money from opening-night cuts. Treat anything within $0.5M as met.

**F2. The profit target can be gamed with two sliders. P1**

- **What happens:** the profit goal is set on opening night from the budget at today's ticket price and staff budgets, then frozen (`ownerGoals.ts:639-641`). So before opening night, set tickets to $30 and every budget to 100. Once he has set the goals, put them back.
- **Results:**

| Team            | Honest target | Gamed target                 | Season grade, honest → gamed           |
| --------------- | ------------- | ---------------------------- | -------------------------------------- |
| Bulls, Normal   | $32.0M profit | "Keep the loss under $40.5M" | Profit goal +38 → +100; season −2 → +8 |
| Hornets, Hard   | $13.5M profit | Loss under $47.0M            | −56 → −24                              |
| Wizards, year 2 | $19.0M profit | Loss under $52.5M            | +16 → +41                              |

- **It saved a job:** in season 2 on Hard, the honest Hornets coach was **fired** (standing −63); the gamed one survived at −47 (`out/sc_*_3_hard.txt`).
- **It's easy to find:** the Owner page previews the target live while you move the sliders.
- **Fix (S):** Set the target from the staff's price and the league-standard budgets, or re-read the budget levers at each review.

**F3. Conceding the season plus playing the kids beats pushing by about 60 points. P1**

- **What happens:** "Tell the owner it's a rebuild" moves the whole postseason weight onto a minutes target that you control directly.
- **Results:**
  - Hawks, Normal: conceded and played the young players → 38-44, grade **+39, "Secure 69"**. Pushed → 36-46, grade **−24, "Warm seat 38"**.
  - Clippers: conceding gave a reliable +25.
- **Cost:** only 10 standing points and one season on the rebuild clock (`ownerGoals.ts:764-767`; `out/cc_*`).
- **Fix (M):** Let the conceded weight become a smaller, prorated development goal, or cap the minutes grade at +30 the way payroll is capped.

**F4. On Hard, a bad roster is fired by design, and the ultimatum is out of reach. P1**

- **Season 1 (UI, Sacramento on Hard):** "Win about 27 games / His read of the roster: 20 wins… under 27 wins is a failed season." Season 1 sets your standing outright: −83.
- **Season 2:** "Win about 35 games / His read of the roster: **16** wins" (`shots/sac2-s1pre-owner.png`).
- **The ultimatum:** "Reach the play-in" at 8-51. Headless at the same point: forecast "reach postseason 0.0%"; Hornets 3.1%.
- **The firing quoted it back:** "I told you at the break…" (`out/ult_25_hard.txt`, `out/ult_3_hard.txt`).
- **Cause:** the floor plus the rebuild-over bump (`ownerGoals.ts:543`), and `maybeUltimatum` asking at least for the play-in (`jobSecurity.ts:192`). The code comment says it asks "what the season can still deliver"; it doesn't.
- **Fix (S):**
  - Cap the floor at his own read minus a margin.
  - Pick an ultimatum the forecast gives at least about a 25% chance, or say plainly "you're done unless…".

**F5. Your team pick sets the difficulty: targets swing from −9 to +11 wins against the forecast. P1**

- **What I measured (`out/targets.txt`, Normal):**
  - Targets above the forecast: PHI 52 vs 40.8 (+11.2), NYK +10.1, LAC +7.7, NOP +7.0, MIA +5.0.
  - Targets below it: BKN 25 vs 34.3 (−9.3), MEM −5.7.
- **Two causes:**
  - The payroll-rank raise (`ownerGoals.ts:570-571`) holds the coach to a payroll the owner also calls "inherited". He says "You inherited this payroll…" and "I expect a record to match it" on the same screen.
  - His own read (minutes-weighted OVR) now differs from the forecast (impact-based) by 4–8 wins for BKN, MEM, PHI, NYK and DET. The code comment claims an SD of 1.6.
- **Two numbers on screen disagree:** Miami's news says "Heat projected for 35 wins" while the owner says "His read: 33" and asks for 40.
- **Why it matters:** this breaks the honest-numbers rule.
- **Fix (M):**
  - Set the owner's read from the season forecast.
  - Drop the payroll raise for a payroll he calls inherited, or cap it at about +3 wins.

**F6. An inherited payroll's sign-off hides real losses and makes overspending free. P2**

- **What I saw (Miami, Hard, every budget at 100 = $30M a season):** the Finances hero showed "Cash −$58.6M · Books closed $26.5M · the $85.1M he signed off on doesn't count". The season lost $118.6M, and the owner was "pleased" with no books step.
- **Cause:** `allowedThisSeason` signs off not just the tax but also the inherited salary above his line (`books.ts:110`), a $25.6M cushion on top of the tax.
- **Fix (S):** Sign off on the tax only. Show "You're $X in the red; he's covering $Y" as one line.

**F7. The Finances hero's text overlaps. P2**

- **What you see:** at the end of the regular season, the "−$58.6M" cash figure and "the owner reads this, after $59.5M tax; the $85.1M he signed off on…" print on top of each other (`shots/c02-fin-endreg.png`; `Finances.tsx:99-117`).
- **Fix (S):** Stack the caption under the books figure.

**F8. After taking a new job, Today's season-review card mixes two teams. P2**

- **What you see:** after taking the Jazz job, Today showed "2027-28 Season review · Missed the playoffs · 21-61" in Jazz colours (`shots/i03-today-newjob.png`). That's Utah's record (the Kings went 12-70).
  - Its lines were the Kings' season: "Player of the season: Domantas Sabonis", "Breakout: Darius Acuff Jr.", "Franchise record: …Keegan Murray".
  - It also said "The owner gives his verdict when the Finals end", after the Finals had ended.
- **Fix (S):** After a takeover, show the season review of the job you left, or none.

**F9. Re-signing your own players under "Add nothing to the payroll you inherited" sinks you. P2**

- **What happened:** a passive Thunder that re-signed its own expiring rotation players at their ask went from $216M to $272M:
  - Payroll goal: −100.
  - The season lost $217–245M, on top of a title.
  - Books: ultimatum.
- **The ladder ignores size:** a $245M loss gets the same first step as a $5M one, and the owner says "I'm thrilled".
- **Caveat:** my script re-signed everyone rated 72+ at his ask, and its roster cuts added dead money, so the later $400M payrolls are partly my doing.
- **Fix (M):** Scale the ladder step, and the owner's tone, with the size of the hole. Show the goal's "−100" in the re-sign sheet.

**F10. The meter reads "Steady 50" while most goals are behind on opening night. P2**

- **Examples:** PHI showed "50 Steady" over "Behind: win 48 games, make the playoffs and add nothing to the payroll…" (`shots/g04-phi-owner-open.png`). Sacramento: "Steady 50 · The owner is happy with the direction" while his own read was below his floor.
- **Cause:** the season counts 0% on opening night (`jobSecurity.ts:129`).
- **Fix (S):** Lead with "He expects more than his read of this roster" whenever a goal opens behind his read.

**F11. The off-season hot-seat line doesn't say what you need. P2 (round-1 F18, still open)**

- **What you see:** "9 · Hot seat · The owner wants a better season than the last" sits under "Fired under 25" before a game is played (`shots/sac2-s1pre-owner.png`), so it reads as if you're already fired.
- **Fix (S):** "Next review needs a grade of −X or better: about N wins and the play-in."

**F12. Being fired costs almost nothing. P2 (round-1 F17, still open)**

- **What happened:** after 15-67 and 12-70 (standing −92), I got two offers. The new job opened at "35 Warm seat" with a fresh grace period.
- **The offer and hired screens leave out** the Jazz's −$31M projected books, the win-now owner, and the starting standing. The offer card shows only strategy, record and payroll (`Career.tsx:405-437`).
- **Fix (M):** Add one meta line per offer. Make firings carry forward (a lower reputation cap per firing).

**F13. A difficulty change still buys back grace. P3**

- **How:** grace is read from the difficulty in force at each review (`jobSecurity.ts`, `canBeFired`). So a Hard coach at −83 after season 1 can pick Easy in the off-season and get seasons 2–3 with no firing possible.
- **Fix (S):** Count grace from the difficulty each season was played on.

**F14. Accepting the staff's ticket-price call ends staff pricing for good. P3**

- **How:** the call sets `priceSet: true` (`calls.ts:1177`), and nothing sets it back. The user's price then only grows with the cap.
- **Fix (S):** Add a "Let the staff price tickets" toggle on Finances.

**F15. The Office hub still leads with cash. P2 (round-1 F11, still open)**

- **What you see:** the hub row says "Finances · Cash $60.0M" while the books project −$40.6M (`shots/a04-office-pre.png`; `Office.tsx:670`).
- **Fix (S):** Show "Books close −$40.6M".

**F16. The team picker shows nothing about the job. P2 (round-1 F20, still open)**

- **What you see:** "76ers 18th of 30" (`shots/f00-picker-raptors.png`), while that job asks about 52 wins from a 41-win forecast, inherits a payroll over the second apron, and comes with a frugal owner.
- **Fix (S):** One line on the picker slab: owner type · win target vs forecast · payroll vs tax.

**F17. Hard's on-court handicap is still invisible. P2 (round-1 F13, still open)**

- **What you see:** nothing in the game UI reads `userCourtPoints`. A Hard Sacramento coach's "signature wins" are 17–25% underdog wins.
- **Fix (S):** Add a line to the pregame card: "Hard: they play 2.4 better against you."

**F18. The Owner page carries the same number twice. P3**

- **What you see:** the hero shows "50 Steady" and the Pulse card shows "Owner Watchful 50 of 100" (the same `jobSecurity` score, `legacyPulse.ts:160`). There are five or six blocks (seat, books/ultimatum, pulse, goals, why-lines, past reviews).
- **Fix (S):** Drop the owner half of Pulse from this page.

**F19. A contender's dominant season reads as "pleased". P3**

- **Example:** Thunder on Easy went 75-7, lost in the conference finals, and graded +14 "pleased". A 46-36 Wizards season graded +40.
- **It's by design**, but a 75-win season deserves a line like "Best record in the league: that counts" (for example, a `crowned`-style floor for a top seed).
- **Fix (S).**

## 4. Since the first review

| Round-1 finding                       | Now                                                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 firing not a moment                | **Fixed.** I saw the verdict, ultimatum, fired and hired moments in the UI.                                                                          |
| F2 Hard targets ignore the court edge | **Partly fixed.** The edge is in now (Hard OKC target 49 vs forecast 53). The payroll-rank raise and read-vs-forecast gaps remain (F5).              |
| F3 meter "Secure" while doomed        | **Fixed in code** (`danger` pins the score, `jobSecurity.ts`). I didn't reach a books-sack state in the UI.                                          |
| F4 "final warning" copy               | **Fixed** (`deeperText`).                                                                                                                            |
| F5 grace season counts 100%           | **Partly fixed.** Now said: "he can't fire you this season, but this one sets your standing". Unchanged in effect: Sacramento started season 2 at 9. |
| F6 inherited books → ladder on day 1  | **Fixed, but overcorrected** (F6 above).                                                                                                             |
| F7 two money stories                  | **Fixed** (`sanctionedTax`).                                                                                                                         |
| F8 tanking most profitable            | **Fixed** (tank +$15.7M vs +$25.6M played straight).                                                                                                 |
| F9 Hard rebuild teams fail day 1      | **Still open, and worse in season 2** (F4).                                                                                                          |
| F10 ultimatum and verdict as rows     | **Fixed.**                                                                                                                                           |
| F11 hub shows cash                    | **Still open** (F15).                                                                                                                                |
| F12 flip settings to dodge            | **Fixed.** Small grace loophole left (F13).                                                                                                          |
| F13 Hard edge invisible               | **Still open** (F17).                                                                                                                                |
| F14 "−1 to 5"                         | **Fixed.** Now reads "−1 to −5".                                                                                                                     |
| F15 owner voice ignores books         | **Fixed in code** (frozen-budget openers, `legacyPulse.ts:232`). Not seen in the UI.                                                                 |
| F16 offers hide the job               | **Partly fixed.** Strategy, record and payroll show; owner type, books and starting standing don't.                                                  |
| F17 firing costs little               | **Still open** (F12).                                                                                                                                |
| F18 off-season line                   | **Still open** (F11).                                                                                                                                |
| F19 Owner page complexity             | **Mostly open** (F18).                                                                                                                               |
| F20 picker shows nothing              | **Still open** (F16).                                                                                                                                |
| F21 success doesn't open better jobs  | **Partly fixed.** Back-to-back champion OKC got Sacramento/Orlando and Portland/LA Clippers; one Houston/Milwaukee pair.                             |
| F22 ticket below peak                 | **Fixed** (staff prices at opening night), with the new trap in F14.                                                                                 |

New since round 1: F1 (the inherited-payroll goal), F2 (profit exploit), F3 (concede exploit), F6 (sign-off cushion), F7 (overlap), F8 (mixed review card), F14 (ticket trap).

## 5. Top 5 moves

1. **Fix the inherited-payroll goal (F1).** Round up, count dead money from forced cuts, add a tolerance. That's a 40–90-point swing on a 15–29% goal for many of the teams that carry it, today taken away for doing nothing.
2. **Close the two cheap levers (F2, F3).** Set the profit target from standard levers, and make conceding prorated and capped. That restores "every point of standing is earned".
3. **Set one honest expectation (F5).** The owner's read should come from the forecast, with no raise for an inherited payroll. Then picking a team no longer quietly sets the difficulty.
4. **Make Hard demanding but reachable (F4).** Cap the floor at his read, and only give ultimatums the forecast says can be met. Then Hard bad teams become a challenge instead of a two-season script.
5. **Answer the job questions on screen (F10, F11, F12, F16).** "What does he need from me next season", plus owner, books and starting standing on the picker and on offers. Players will see the stakes before they're committed to them.

## 6. What I couldn't verify, and how I tested

**UI (Playwright, phone viewport, four profiles of my own):**

- **Heat on Hard:** maxed the budgets, played season 1 through the deadline (rebuild call at 4% odds), the end of the regular season, the playoffs and the verdict moment. Checked Owner, Finances, Career, the season review and Settings (pending difficulty and job-security changes).
- **Kings on Hard:** two seasons through the floor calls, the ultimatum moment, the fired moment and the job offers. Took the Jazz job: hired moment, new Owner, Today and Finances.
- **Raptors and 76ers on Normal:** opening night, including the 76ers' staff-picked cuts.

**Headless (`harness.mts`), about 30 runs and roughly 80 simulated seasons:**

- Passive coach: OKC, MIA, WAS × Easy/Normal/Hard × 4–5 seasons; PHI on Normal; SAC on Hard.
- Overspend: MIA on Normal and Hard.
- Tank with the rotation, conceding and easing the floor: MIA and WAS on Normal.
- Profit exploit vs control: MIA, WAS, CHI on Normal; CHA on Hard.
- Concede-and-kids vs push: ATL and LAC on Normal.
- Ultimatum reachability: SAC, CHA, CHI on Hard; LAC on Normal.
- Every team's targets vs forecast per difficulty (`targets.mts`), and payroll-goal state on opening night (`dead2.mts`).

**Caveats:**

- The headless coach re-signs everyone rated 72+ at his ask and cuts by OVR, which inflates later-season payroll and dead money (F9).
- I didn't see a books freeze, final warning or books-sack in the UI, so the F3/F15 fixes are verified from code only.
- I didn't test the staff's "Cut the budgets" or ticket-price calls in the UI.
- One random seed per scenario: concede-vs-push comparisons carry luck (LAC pushing reached the second round through the play-in).
