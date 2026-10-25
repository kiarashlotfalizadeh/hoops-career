# Stakes lens: owner, money, job security, difficulty

Reviewer: `stakes`. The tool environment wouldn't let me write `REPORT.md`, so the full report is below as text. Screenshot paths are relative to `/private/tmp/claude-501/-Users-kiarash--claude-spares-spare-hVNZPT/b285bc02-5a07-46d5-a46e-e152c55fa3b7/scratchpad/review/stakes/` (`shots/…`, `out/…`). Nothing in the repo was touched.

## 1. Verdict

There is real pressure here:

- The owner sets concrete goals.
- A meter marks the firing line.
- An ultimatum arrives at the All-Star break.
- The books go through a warning → ultimatum → freeze ladder, and the freeze really blocks you.
- The staff make real-choice calls ("Tell the owner it's a rebuild / Keep pushing").

I got fired in the UI on Hard after two seasons. In headless runs I got fired both by tanking and by spending while winning titles. The rules are deep and honest, but the stakes don't land as drama, and in places they aren't fair:

- Getting fired is a mail hidden under "and 2 more" in the digest, with no moment.
- On Hard, the owner's win targets ignore Hard's own on-court handicap, so contenders start about 10 wins behind his ask.
- The "grace" season counts 100% toward your standing.
- The job-security meter can read "75 Secure" while the line under it says you'll be fired whatever you win.
- Money pushes the wrong way: tanking earns $50–70M a season, while a back-to-back champion gets frozen and then sacked.

**Score: 6/10.** The machinery is an 8. Fairness, legibility at the moment it matters, and drama bring it down.

## 2. What's genuinely great (protect these)

- **The Owner screen is one honest page.** It has a big number and a meter marked "Fired under 25" and "50: goals met". Each goal shows its status and weight. The owner gives his reasons in his own voice:
  - "You have the league's 1st-highest payroll. I expect a record to match it."
  - "A roster that got worse on your watch doesn't lower the bar by more than 3."

  See `shots/12-owner-deadline.png`, `shots/24-owner-pre2.png`.

- **The books ladder has teeth and explains itself.** The freeze really blocks raises. A headless re-sign failed with: "The budget is frozen while the books are in the red: no raises, and re-signing him at $46.3M is one (he's paid $7.8M now)." The Finances hero, "Books close −$59.8M, projected, after $75.7M tax", is the right single number (`shots/06-fin-over-pre.png`).
- **Staff calls offer real levers.** "The books are heading into the red… The staff's call: shed salary before the deadline" comes with Shed salary / Not now. "Cut the budgets" and "Price tickets at $X" appear when they apply. "Playoff odds down to 2%… Decide by Feb 11" is a fork with a cost (`shots/d0-sheet0.png`).
- **The ultimatum is concrete and fair.** "Reach the play-in. Miss it and you're fired, whatever else goes right" gets its own card (`shots/25-owner-asb6.png`). The firing mail quotes it back: "I told you at the break: reach the play-in. It didn't happen."
- **The owner's monthly voice fits his personality.** He also compares you to the press: "I asked for 55, the papers picked you for 37."
- **The job market is honest.** "The Jazz (21-61) have an opening… nobody better is calling: they'll take a chance on you." Your reputation carries over (`shots/29-career-after2.png`).
- **The rebuild clock and the win floor make tanking cost something later.** In every tank run, I was fired exactly when the grace period ran out.

## 3. Findings (most severe first)

**F1. Getting fired is a silent screen, not a moment. P0**

- **What you see:** The digest's headline is "Season wrap: the Thunder's year". "You're fired" is hidden under "and 2 more" in New mail (`shots/q0-sheet0.png`). Today then says "You are between jobs", with "You're fired" as the third list row (`shots/27-today-after2.png`). Taking the new job lands on "Back up your league" (`shots/34-today-newjob.png`).
- **Cause:** `src/ui/moments.ts:14` has no fired, hired, ultimatum or verdict kind. The firing is an ordinary agenda row (`src/core/league/agenda.ts:222`).
- **Fix (M):** Add fired, hired and ultimatum moments built from the owner's own lines. Pin "You're fired" to the top of the digest's Needs you.

**F2. On Hard, the owner's targets ignore Hard's on-court handicap. P1**

- **The test:** Same seed, opening night, owner target vs the season forecast (`targets.mts`).
- **Normal is close:** OKC 60 vs 62, BOS 55 vs 54, SAS 61 vs 60.
- **Hard targets don't change, but the forecasts drop:** OKC 60 vs 53, PHI 57 vs 43, NYK 54 vs 40, DEN 55 vs 42, SAS 61 vs 52, BOS 55 vs 47. That's about −10 wins on average, so the wins goal grades about −0.5 before tip-off.
- **The UI run:** The 76ers (shown as the "4th of 30" roster) went 32-50 against an ask of 58, then 29-53 against 55. His own mail: "I asked for 55, the papers picked you for 37."
- **Cause:** `leagueOutlook` and `expectedWinPct` (`ownerGoals.ts:241-258`) never read `userCourtPoints` (`difficulty.ts:122`), but the forecast does (`odds.ts:128`). WIN_SLIDE then anchors next year's target to this year's impossible one ("His read of the roster: 48 wins", target 55).
- **Fix (S):** Add the court edge to the user's expected win% when setting goals.

**F3. The meter says "Secure" while the line says you'll be fired. P1**

- **What happened:** Back-to-back-champion OKC opened season 3 at "75 Secure — …close there and you're fired, whatever you win". At the All-Star break, 37-21, it read "61 Steady" with the same line (`out/okc-normal-auto.txt:153,176`). He was fired after a Finals run.
- **Today shows nothing:** The job row only appears when the heat is warm or hot (`Today.tsx:71`).
- **Fix (S):** Force the heat to hot and pin the score under the line when the books outlook means firing, or when an ultimatum is live.

**F4. The books copy promises a "final warning" the rules skip. P1**

- **What it says:** The freeze call (`calls.ts:577`) and the Owner books card (`Owner.tsx:368`) both say "…deeper, and it's his final warning".
- **What it does:** Past `DEBT_LIMIT`, the review fires you directly (`books.ts` `booksVerdict`). OKC went freeze → fired. The firing mail claims "I told you what that meant".
- **Fix (S):** When past the limit, the copy should say "…deeper and you're fired".

**F5. The "grace" season counts the most. P1**

- **What you see:** "He can't fire you this season" (`shots/05-owner-pre.png`). Yet that season sets your standing at 100% weight (`jobSecurity.ts:48-50`).
- **What happened:** The Hard 76ers went from 50 to "0 Hot seat · no grace left" (`shots/20-owner-review.png`).
- **Fix (S/M):** Either weight the first season like any other, starting from 0, or say plainly that this season sets your standing.

**F6. Your inherited payroll puts you on the books ladder on day one. P1**

- **How common:** 9 of 30 teams project red books on opening day: DEN −28M, GSW −17M, MIA −41M, MIN −4M, NYK −4M, OKC −18M, ORL −30M, PHI −40M, POR −13M.
- **Champions get it too:** OKC received "Champions" and "The books: an ultimatum" on the same day.
- **New jobs repeat it:** After a firing, the Heat hired me at −$57.6M cash, and I got an ultimatum after year 1.
- **Fix (S):** The first close in the red for an inherited payroll can only warn.

**F7. Two money systems disagree about whether a contender may pay tax. P1**

- **76ers:** The win-now owner's goal "Stay under the first apron" was met (+23). The tax still pushed the books into the red, which brought an ultimatum.
- **OKC:** The frugal owner's luxury-tax goal (40% weight) put a 46-13 team on a "41 Warm seat".
- **Fix (M):** One money story per season. Either the books ladder honours the tax the goal allows, or the payroll goal is dropped while the ladder is active.

**F8. Tanking is the most profitable strategy. P1**

- **Profit:** Every tank made $50–70M a season (LAL 10-72: +$64.7M; BKN 5-77: +$70.6M), and the profit goal graded +100 each time.
- **Crowds:** The 10-72 Lakers drew 18,883 a night, 99% full.
- **Winners lose money:** OKC's title season lost $23M; the next lost $239M.
- **Copy:** The win-now owner tells a $61M-payroll team "I didn't build this payroll to watch this" (`legacyPulse.ts:205`).
- **Cause:** `fanInterest` (`finances.ts:50`) barely moves with win%.
- **Fix (M):** Make losing cost gate money. Don't set a profit goal for a team under the salary floor. Condition that payroll line on the team's actual payroll rank.

**F9. Rebuild teams on Hard are set up to fail on day one. P2**

- **Example:** Brooklyn's floor is 29 wins against a forecast of 20, which grades −0.72 at best before a game. Hard's grace is one season.
- **Fix (S):** Same as F2: include the court edge in the floor.

**F10. The ultimatum and the season verdict arrive as one-line rows. P2**

- **Ultimatum:** It appears in the digest as "Stopped for news: An ultimatum" (`shots/s6-sheet0.png`).
- **Season verdict:** The ceremony in SeasonReview.tsx never opens on its own (only a mail links to it, `legacy.ts:714`).
- **Fix (S):** Auto-open the verdict once after the review, the way Moments do.

**F11. Office leads with cash, not the number the owner judges. P2**

- **The gap:** The hub row says "Finances · Cash $60.0M" (`shots/04-office.png`) while the books project −$59.8M.
- **Late warning:** The owner warns only at day 93, three weeks before the deadline.
- **Fix (S):** The hub row should show "Books close −$59.8M". Each budget slider should show its effect on the close.

**F12. Difficulty and Job security can be flipped any time to dodge a firing. P2**

- **The loophole:** The difficulty picker is never disabled mid-career (`Settings.tsx:150`), and `canBeFired` reads the current setting at review time (`jobSecurity.ts:54`).
  - A hot-seat Hard coach in season 3 can switch to Easy before the review. Easy's grace is 3 seasons, so he can't be fired.
  - The same switch removes Hard's on-court penalty that night.
- **Not recorded:** Unlike god-mode edits, neither change is counted, and the career never stores difficulty.
- **Fix (S/M):** Apply difficulty changes at the next opening night, and stamp the career with its difficulty.

**F13. Hard's biggest lever is invisible. P2**

- **What you see:** A 4th-best roster is an 11–21% underdog at home. Those wins then show up as "Signature wins" (`shots/21-career.png`).
- **Why:** The edge goes silently into the odds; no pregame card or report explains it.
- **Fix (S):** Add a line: "Hard: they play 3.8 better against you."

**F14. The difficulty picker shows "−1 to 5" for Hard. P3**

- **Cause:** The sign is applied only to the first number (`settingsOptions.ts:71`). It should read "−1 to −5".
- **Fix (S):** Put the sign on both numbers.

**F15. The owner's voice ignores the books crisis. P2**

- **Example:** A frugal owner, months before sacking you over −$432M: "Full seats and wins: the best kind of month."
- **Cause:** His opener follows the seat score, which ignores the books (see F3).
- **Fix (S):** Give him books-crisis openers when the books are frozen.

**F16. Job offers hide what you're walking into. P2**

- **Missing:** The offer card doesn't show the owner's personality, the team's books (Miami was at −$57.6M), your grace, or your starting standing (−30).
- **After taking a job:** The new Owner page opens on "35 Warm seat · Uneasy", with the old team's fan mood ("Boos at Delta Center", `shots/35-owner-newjob.png`).
- **Fix (S):** Add one meta line per offer: "Win-now owner · books −$12M · you'd start at 35".

**F17. Being fired costs little. P2**

- **Pattern:** Across 8 firings you always got 2+ offers. Your standing resets to at worst −0.30 (`jobs.ts:34`), and a fresh grace period starts.
- **Fix (M):** Make firings accumulate: worse offers, or a season out, plus "Fired ×N" on the Career slab.

**F18. The offseason hot-seat line doesn't say what you need. P2**

- **What it says:** At 0/100 with no grace left: "The owner wants a better season than the last."
- **Fix (S):** Show the break-even season, e.g. "a season graded −4 or better, roughly 46 wins and the play-in".

**F19. The Owner page is over the complexity budget. P2**

- **Count:** In season it stacks 6–7 blocks: seat, ultimatum, books, pulse, goals with "why" lines, and past reviews. The "?" sheet is 9 dense paragraphs.
- **Fix (S):** Merge ultimatum and books into one "What can cost you the job" card. Move past reviews to Career.

**F20. The team picker shows nothing about the job. P2**

- **Example:** PHI looks like a contender. It actually starts with a 57–58-win ask, −$60M projected books and a win-now owner.
- **Fix (S):** Add one line to the picker slab: owner type, payroll vs tax, and his win target.

**F21. Success doesn't open better jobs. P3**

- **Example:** After two titles, the only approaches came from the 35-47 Hornets and the 20-62 Trail Blazers.
- **Fix (M):** Let approaches include any job that rates you above its hire, including the occasional contender.

**F22. Your ticket price starts below the best price. P3**

- **The gap:** AI teams auto-price at peak gate. The user starts at $95 against a $105 peak, about $6M a year left on the table.
- **Fix (S):** Start the user at the staff's price.

## 4. Top 5 moves

1. **Make firing, hiring, the ultimatum and the verdict into moments (F1, F10).** These are the career's peaks, and right now a player can sim straight past being fired.
2. **Make the owner's targets honest on Hard (F2, F9).** Add the court edge to his targets and floor, so Hard feels hard rather than rigged.
3. **One truthful danger signal (F3, F4, F15, F18).** The meter, the books copy and the owner's voice should agree when you're about to be fired, and say what would save you.
4. **Fix the money incentives (F6, F7, F8).** No ladder step for an inherited payroll's first season, one money story per season, and losing should cost gate money.
5. **Make the career remember (F5, F12, F17).** Real grace, difficulty locked at opening night and stamped on the career, and firings that accumulate.

## 5. How I tested, and what I couldn't verify

**UI (Playwright, phone viewport, my own profile):**

- New league on Hard as the 76ers. Viewed Today, Office, Owner, Finances (overview and budget), Settings and Career in preseason.
- Made the cuts, then simmed to the deadline (books warning and "rebuild" call), the end of the regular season, and the playoffs. Got the season review: −100, 0 Hot seat.
- Played through the offseason and season 2, including the ultimatum at the break. Got fired at the review.
- Viewed the digest, Today and Career, took the Jazz job, and viewed the new Owner page.
- Script: `ui.mjs`; logs: `ui-*.log`.

**Headless (`run.mts`, 11 scenarios × 6 seasons):**

| Scenario                            | Outcome                                       |
| ----------------------------------- | --------------------------------------------- |
| PHI Hard                            | Fired year 2                                  |
| MIA Normal                          | Inherited red books, then recovered           |
| OKC Normal                          | Two titles, then a books freeze, fired year 3 |
| OKC Hard                            | Fired year 3, fired again at the Wizards      |
| DET Hard, peak ticket pricing       | Kept the job                                  |
| LAL tank on Easy / Normal / Hard    | Fired at year 4 / 3 / 2, exactly at grace end |
| LAL tank on Normal, eased the floor | Still fired at year 3                         |
| NYK overspend                       | Ultimatum, freeze, fired year 3               |
| BKN tank, budgets at 1              | Fired at years 3 and 6                        |

Plus `targets.mts`, which compares owner targets with the forecast on Normal and Hard.

**Caveats:**

- The headless tank moves players to other teams directly, which simulates salary dumps rather than real trades.
- The OKC $271M payroll came from my script re-signing everyone 70+ OVR at their ask, not from anything the game did.
- I didn't flip difficulty or job security in the UI; F12 comes from reading the code.
- I didn't try "Tell the owner it's a rebuild" or "Cut the budgets" in the UI, or job security off combined with the books.
- Moments and digest behaviour was seen with default settings only.

All of these files are in `/private/tmp/claude-501/-Users-kiarash--claude-spares-spare-hVNZPT/b285bc02-5a07-46d5-a46e-e152c55fa3b7/scratchpad/review/stakes/`:

- Screenshots: `shots/`
- Headless logs: `out/`
- Scripts: `run.mts`, `ui.mjs`, `targets.mts`
