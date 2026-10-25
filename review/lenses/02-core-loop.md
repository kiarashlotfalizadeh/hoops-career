# Core loop review (lens: `core-loop`)

I couldn't save this report to REPORT.md: the tool blocks report files from subagents, so the full text is here. Screenshots are in `/private/tmp/claude-501/-Users-kiarash--claude-spares-spare-hVNZPT/b285bc02-5a07-46d5-a46e-e152c55fa3b7/scratchpad/review/core-loop/shots/` (written as `shots/<name>.png` below). Every sim's time, stop reason, moment and digest text is logged in `/private/tmp/claude-501/-Users-kiarash--claude-spares-spare-hVNZPT/b285bc02-5a07-46d5-a46e-e152c55fa3b7/scratchpad/review/core-loop/log.txt`.

## 1. Verdict

The loop runs very well: it's fast, calm and honest. A whole regular season simulates in **about 7 seconds**. Every stop says why it stopped. "While you were away" is the best screen in this part of the game. Nothing interrupts you for something that doesn't need you.

The trouble is what the loop leaves out. The "sims stop only for calls" rule works, but the calls only fire on a crisis or a calendar date.

- A winning team gets **no decision at all for the first 92-93 days**. My Heat went 32-13 before the game asked me anything.
- Both teams I played got only 3-4 calls in an 82-game season.
- Between calls, Today barely changes. The same staff card ("Davion Mitchell can be extended") stayed there from preseason to the final week.
- The inbox ends the season with 50 of 55 messages unread.
- All-Star weekend, the NBA Cup and the end of your season each go by as a line of mail.

The decide → consequence → decide loop that the tactics depth promises shows up about once a month, so most of the season you're watching.

**Score: 5/10.** The plumbing is a 9 (speed, honesty, digest, one Needs-you count). The rhythm is a 3: there's very little to want to do on the next Continue.

## 2. What's genuinely great (protect these)

- **Sim speed.** I timed every sim:
  - a day takes 0.3-0.4s, a week 0.4-0.6s, a month 1.2-1.6s, and 92 days took 2.6s;
  - the Bulls' whole regular season took **6.7 seconds** across 5 sims.

  That's a real edge over FM and BBGM-style games. Never trade it away.

- **"While you were away"** (`shots/8395829-Sim1week-away.png`). One sheet holds:
  - the record over the stretch as a big figure, plus the seed and power-ranking moves;
  - results with real headlines;
  - injuries, mail and the league's stories.

  The headlines are accurate across sims. "Pistons snap Heat's 5-game win streak" counted a streak that spanned two weekly sims, and I checked it against `league.games`.

- **Every stop says why, with the answer right under it** (`shots/8673246-Simtotradede-away.png`). The call sits at the top of the digest with its buttons, before the results. FM makes you hunt for this.
- **One Needs-you count.** The bell badge and Today always matched. AI offers fold into one row.
- **Game stories as headlines.** "Heat rally from 26 down to beat Cavaliers", "Davion Mitchell's buzzer-beater sinks Thunder", "Grading all 30 at the break: Heat A+".
- **The deadline call, when it has a deal, is the best moment of the season.** The Bulls (1% playoff odds) got "The staff's call: sell. Jabari Smith Jr. (80) from the Rockets for Norman Powell (86). Sell to HOU / Stand pat". It's concrete, fits the team's situation, and takes one tap. Every call should feel like this.
- **Settings → Sims spells out exactly what stops a sim** (`shots/9915616-settings.png`). That transparency is rare and good.

## 3. Findings (most severe first)

### F1. A winning season has almost no decisions in it: the first call came on day 93 — P1

**What you get**

- **Heat (a contender), played week by week then month by month:** nothing needed me for the first **93 days / 45 games** (32-13). The first-week guide quietly went away, and Needs you was empty or held only AI trade offers.
- **Bulls (a rebuild), pressing only "Sim to end of regular season":** it ran **day 1 → 93 without a stop**. Then it stopped at day 93 (an injury), day 109 (the deadline) and day 147 (an injury).
- **Heat's whole season:** 3 calls (`callsDone: books:2027:93, deadline:2027, series:2027:E1-1`), plus one injury call I never answered.

**Evidence**

- Log: `Sim 1 month [1.2s] day 26->56 … rec 19-6` and `Sim 1 month [1.6s] day 56->86 … rec 27-13`, with no stop and no Needs you.
- Run 2: `Sim to end of regular season [2.6s] day 1->93 (92d)`.
- Cause, `src/core/league/calls.ts:1-18`: the six call kinds are
  - a top-3 player out 10+ games,
  - playoff odds under 5% two weeks running,
  - the owner's win floor,
  - the deadline's last 5 days,
  - a series starting,
  - the books.

  A good team triggers none of them until the deadline.

**Why it matters**

- The pitch is a coach whose choices matter.
- FM's inbox hands you a small decision every few in-game days: the next opponent's report, a training-load warning, a scouting result.
- Here a good team's season is a spectator sport from opening night to the deadline. DESIGN.md:77 says "Every Continue should land on something new about the user's team"; that holds for news, but not for decisions.

**Fix (M)**
Add one **weekly staff call with a real, measured choice**, using machinery that already exists (counterWorth, game plans, practice, rotation). For example:

- "This week's big one is @BOS on Thursday. The staff's plan is worth +1.1. Use it / Your own / Skip."
- "4 games in 6 nights: Recovery practice until Sunday? (−0.3 familiarity, less wear)."
- "Mitchell's minutes are up 6 since he came back. Cap him at 30?"

Keep the existing rule that a call needs a real choice. It shouldn't stop a sim, and it shows at the top of the digest. Also add opportunity calls, not only crises: a 6-game win streak, a rival's star hurt, a buyer's market before the deadline.

### F2. Losing streaks never reach you: a 7-game skid passed silently — P1

**What you get**

- In March the Heat lost 7 in a row ("Losing streak hits 4 for Heat" … "Heat end 7-game skid"), fell from 2nd to 4th, and the owner's mood went to "falling".
- "Sim to the next big night" ran **35 days (day 125 → 160)** through most of it without stopping.
- Nothing on Today explained it or offered a fix. "From your staff" still said "Davion Mitchell can be extended".

**Evidence**

- `shots/9043969-Simtothenext-away.png`: "7-8 in the stretch · 2nd → 4th".
- `shots/9045905-bignight.png`: last 5 W-L-L-L-L, with the same staff card.
- The odds call needs odds under 5% (`ODDS_LOW = 50`, calls.ts:44). A top-4 seed never gets there.

**Why it matters:** a slump is the most natural moment for a coach to act. The engine already knows why games are being lost (the post-game Why factors, the counters' measured worth), and the loop never asks.

**Fix (S-M):** add a "skid" call at 4-5 straight losses, or when net rating drops by a set amount over 10 games.

- It shows the staff's diagnosis: the top Why factor across the stretch, e.g. "drop coverage has given up +3.1 a game on pull-ups".
- It offers one measured change: "Make the change / Leave it".
- Keep the existing two-readings rule so one bad week doesn't trigger it.

### F3. "From your staff" never changes: one card for 160+ days — P1

**What you get:** every Today screen from day 0 to day 160 had the same top card: "Davion Mitchell can be extended · 80 OVR · $12.4M, expiring · market value $18.9M · 2 more expiring". It stayed through the 3-0 start, the 6-game streak, the deadline, the All-Star break and the 7-game skid, and only went away in the playoffs.

**Evidence:** every `TODAY:` line in log.txt; `shots/8520026-after-month2.png`. `Today.tsx:75` takes the top of `assistantFeed`, and no card ever ages out.

**Why it matters:** Today is the screen a player sees 500 times. A block that never changes trains the eye to skip it, including on the day it finally says something urgent. It also makes the staff read as a static checklist, not a voice following the season.

**Fix (S):**

- Age the cards: once a card has been on Today for 7 days without action, newer cards go above it and it moves to "All advice".
- Prefer cards about the next 7 days (opponent, schedule, injuries).
- Contract extensions belong on an Office badge, not on Today all season.

### F4. The season's payoff is an unread mail — P1

**What you get**

- I lost the first round 1-4. Today's hero then said only "Playoffs · Your season is over at 52-30" (`shots/9811627-after-r1.png`): no series result, no verdict, nothing to do. The dock offered only "Sim to end of playoffs", 45 days to the draft lottery.
- The owner's **Season review** (goals graded −100 to +100) was the third line under "New mail" in the digest (`shots/9865713-Simtoendofpl-away.png`).
- That same digest led with "The owner's ultimatum: the books", so "I'm pleased" sits right under an ultimatum.

**Evidence**

- `shots/9914095-season-review-msg.png`: "I'm pleased. Season grade +11 … Reach the play-in — lost in the first round (+60) … Get under the first apron … (-100)".
- The README promises "a season review when the Finals end". In practice it's only mail.

**Why it matters:** the end of a season is where a career game turns a year of play into meaning and a reason to start the next. Right now the most important verdict in the game is easy to miss.

**Fix (M):** when the user's season ends, show a **season-end screen**, either as a big-moment takeover or as Today's hero until the draft. It covers:

- the series result;
- the owner's grade per goal, with his line;
- the record against the projection ("40 projected, 52 won");
- your players' awards. Portis won Sixth Man of the Year with no moment, because the clinch moment that came out at the same time outranked it;
- what's next: draft slot, expiring deals, a link to the offseason.

Show the ultimatum after the review, as its consequence.

### F5. All-Star weekend and the NBA Cup are non-events — P1

**All-Star**

- "Sim to All-Star break" stops the day before the game "so the user can act first" (`simCore.ts:51-53`), but there's nothing to act on.
- Selections, both contests and the game all happen on the same sim day (`season.ts:264-271`).
- I simmed that day and got two mails ("All-Star selections: Giannis Antetokounmpo made the All-Star team", "All-Star break check-in"). There was no moment, no Today hero, and no digest, because a 1-day sim doesn't make one.

**NBA Cup**

- The Heat were out in the group stage by day 38.
- The only trace was a mail, "NBA Cup: out in the group stage", which I found by reading the inbox.
- Today never showed a Cup table or Cup stakes. The game label just reads "Game N of 82 · Cup group" (`NextGame.tsx:71-78`).

**Why it matters:** these are the season's natural chapter breaks between opening night and the deadline, the stretch F1 shows is empty. Right now they're invisible.

**Fix (M)**

- All-Star: announce reserves about 10 days early, with news and a moment when your player makes it. Make the break a Today hero ("All-Star weekend: Giannis starts for the East"). Play Saturday's contests on the day before the game, so "Sim to All-Star break" lands on something.
- Cup: during the group stage, add a Cup cell to Today's season strip ("Cup: 2-1, needs a win by 6 vs NYK"). Give deciding group nights a bigger billing. Put advancing or going out in the digest's stop line.

### F6. Some calls can't fix what they raise — P2

**What you get**

- **Books (day 93):** "Projected $37.0M in the red … the owner gives you an ultimatum. The staff's call: price tickets at $115 … ($7.1M more)". The main button closes **19%** of the gap. I took it. The books closed $32.3M in the red and the ultimatum came anyway.
- **Deadline (Heat):** "Playoff odds 94%. The staff's call: buy, but nothing they found works: stand pat or look yourself." The biggest GM week of the year ends in "nothing works".

**Evidence:** `shots/8673246-Simtotradede-away.png`; calls.ts:555-569.

**Why it matters:** this breaks the honest-numbers promise in spirit. A main button that can't change the outcome teaches players to distrust the staff's calls.

**Fix (S-M)**

- Show how much of the gap the call covers: "closes $7.1M of $37.0M".
- When it can't change the outcome, make the main button the real fix: a salary-dump package from `tradePackages`/`makeItWork`.
- For a contender's deadline with no deal, name the need and the targets instead of "look yourself".

### F7. Call buttons don't do what their labels say — P2

- **"Plan the series"** settles the call the moment you tap it (`calls.ts:393-396`: a settle action plus a link). I tapped it, saw "Measuring…" on the counters, went back to Today, and the call was gone. Today still said "No game plan yet", with no reminder.
- **"Leave it to the staff"** (calls.ts:406) only dismisses the call. It doesn't apply the staff's plan, even though "Use the staff's plan" exists one screen away on the Preview.
- **"Look for a deal"** closes the deadline call and drops you in an empty trade builder aimed at an arbitrary team (ATL, "You send: Nothing yet"). It doesn't point at what the staff said you need.

**Fix (S)**

- Settle a navigating choice only once its action is done, or bring the call back the next morning.
- "Leave it to the staff" applies the staff's plan and says what it set.
- "Look for a deal" opens Trade → Find, filtered for the staff's buy/sell need.

### F8. The injury call ignores the team's plan and carries no number — P2

**What you get**

- The rebuilding Bulls had owner goals of 25 wins and "3,900 minutes for players 23 or under".
- When Jalen Smith went out for 20 games, the call was "Sign **Nicolas Batum** to a 10-day", a 38-year-old.
- The Heat got "Sign Dwight Powell", later "Sign Al Horford".
- None of these say what the injury costs or what the cover gets back.

**Evidence:** `calls.ts:410-440`. `tenDayCover(league, p.pos)` takes no account of team strategy or owner goals.

**Fix (S)**

- For a rebuild or a youth-minutes goal, the call becomes "his minutes go to Buzelis/Wilson".
- Show the measured cost and recovery, in the same voice as the counters ("about −1.4 wins; Batum gets back 0.2").

### F9. Confirm taps are easy to lose — P2

**What you get:** tapping "Price tickets at $115" turns the button into a pink "Confirm: Price tickets at $115" (`shots/8703478-after-books-call.png`). Hit Continue in the dock right below and the choice is silently dropped. The call came back 16 days later with a new price ($117). I fell for this on my first try.

**Fix (S):** ticket prices can be changed back, so drop the confirm for them. Where a confirm is needed, block the dock while it's pending, or confirm in a sheet.

### F10. A long sim's digest shows the newest results, not the best, and power rankings fill your news — P2

**What you get**

- The Dec 15 – Jan 13 digest showed the 5 newest of 15 results.
- "Heat take Christmas from Celtics" and "Davion Mitchell's buzzer-beater sinks Thunder" were hidden behind "All 15".
- In both month-long digests, "The Heat in the news" was mostly power-ranking moves.

**Evidence**

- `digest.ts:113-131`: results newest first, `RESULTS_SHOWN = 5` (AwaySheet.tsx:23).
- News log: `42 w3 power: Power rankings: the Heat slip to 16th`. That's a front-page-weight story while the Heat were 14-6 and 1st-2nd in the East. The sim-credibility lens should look at the ranking itself.

**Why it matters:** the digest is the loop's main reward, and over a long sim it shows the least interesting items.

**Fix (S)**

- For stretches of more than 7 results, show the 2 newest plus the 3 with the biggest stories (by `gameStoryFor` weight).
- Keep power rankings out of "in the news" (they're already shown as a figure), or cap their weight at 2.

### F11. "Sim to the next big night" can land on an ordinary night — P2

**What you get**

- On day 125 the next big night was 35 days out. The sim ran to @CLE on day 160.
- By then the billing had gone, because the Heat had slid from 2nd to 4th.
- Today's hero just said "On the road in Cleveland", with no reason to coach it (`shots/9045905-bignight.png`).

**Evidence:** the `bigNight` target is a fixed day (`simCore.ts targetDone`), and the billing is picked once in `flow.ts nextBigNight`.

**Fix (S):** re-check the billing every simulated day. Stop at the first night that is big now, or say when the target stopped being big ("The Showdown with CLE fell away: you're 4th now").

### F12. The inbox is a log nobody reads — P2

**What you get**

- At season's end the inbox held 55 messages, **50 unread**: Owner 13, Coaching staff 20, Front office 10, League 7.
- Most coaching-staff mail is injury notices for role players, plus three copies of "Development report: a quiet month".
- The good mail is buried with it: the owner's check-ins, the season development report, the season review.
- Nothing in the loop needs the inbox, so "Unread 50" just grows.

**Evidence:** `shots/9912079-inbox-end.png`.

**Fix (S)**

- Mark mail read once the digest has shown it.
- Send short role-player injuries only to the digest's Injuries block.
- Drop "a quiet month" reports.
- Give the season review and the owner's check-ins more prominence (see F4).

### F13. Quick sim, the most common per-game action, is two taps deep — P2

**What you get**

- "Sim to next game" stops on game morning and never plays the game.
- On game day the dock's main action is "Watch & coach".
- So a player who quick-sims needs three taps per game (Sim to next game → Play options → Quick sim this game), **about 250 taps a season**.
- The only one-tap route game by game is "Sim 1 day", which doesn't say it plays your game.

**Evidence:** `shots/p3-gameday-playoptions.png`; `flow.ts:228-249`.

**Fix (S):** add a secondary "Quick sim" chip to the dock on game day, or a long press on the play button.

### F14. Practice is set once and forgotten — P2

**What you get:** Practice read "Balanced · System 98% · Fluid" all season. Nothing ever suggested changing it: not before 4-games-in-6-nights stretches, not before the playoffs, not during the skid.

**Fix (S):** make practice part of F1's weekly call, driven by the schedule and player wear.

### F15. A playoff series has one decision point — P2

**What you get:** the series call fires only on the morning of Game 1. The Heat went L, W, L, L. Nothing asked "Down 1-3: change something?" before the elimination game.

**Evidence:** `calls.ts seriesStart` requires the series to be 0-0.

**Fix (M):** bring the series call back when trailing (0-2, 1-3, any elimination game), with the staff's measured adjustment from the series so far.

### F16. Today's lead story can be 11 days old — P3

On Feb 19 the hero was "Final · Feb 8 · Heat top Hawks behind Portis", while the Heat had lost 2 of their last 4. `topStory` picks by weight within `STORY_DAYS = 14` (front.ts:40-49). **Fix (S):** prefer recency once the last result isn't fresh.

### F17. Duplicate and mis-filed stories — P3

- The same game produced "50 wins for Loop Reviewer's Heat" and "50 and counting for Loop Reviewer", as both news and mail.
- "Season wrap: the Spurs' year" was filed under "The Heat in the news" (`shots/9865713-Simtoendofpl-away.png`).

**Fix (S):** merge the two milestones when their counts match, and check `isHisStory` for league-wide columns.

### F18. AI offer deadlines move under the player — P3

The CHI offer on Today read "Stands until Oct 26", then "Oct 27", then "Oct 30". MEM's went from "Jan 19" to "Jan 24". `holdUnseen` (proposals.ts:76-84) extends an offer while its mail is unread, even though the offer was on Today with Accept and Turn down buttons. **Fix (S):** count the Today row as seen.

### F19. Moment text repeats itself — P3

The first-win moment's sub-line repeats its title ("133-128 over the Timberwolves" twice), and it's faint over the court lines (`shots/8147317-Quicksimthis-moment0.png`). **Fix (S):** make the sub-line add something (who scored, what's next).

### F20. Owner goals differ a day apart (cross-lens, stakes) — P3

- The welcome mail says "Win 50 games … 3rd-highest payroll"; the opening-night mail says "Win 51 … 2nd-highest".
- The goals also pair "Win 51" with "Reach the play-in", which reads oddly together.

**Fix (S):** say "Final goals after the league's cuts: 51 wins (was 50)."

## 4. Top 5 moves

1. **A weekly staff call with a real, measured choice** (F1, F14). The season goes from about 4 decisions to about 25 small ones. The weekly sim becomes coaching, and the tactics depth gets a pulse.
2. **Calls for skids, streaks and series deficits** (F2, F15). The most emotional stretches become decisions instead of results.
3. **Honest, working calls** (F6, F7, F8, F9):
   - show how much of the problem the staff's call covers;
   - settle a call only when its action is done;
   - have "Leave it to the staff" actually apply the staff's plan;
   - remove or pin confirm taps.

   This builds trust in the staff's voice, the game's main selling point.

4. **Give the season chapters** (F4, F5): an All-Star build-up with a moment for your All-Star, a Cup race on Today, and a season-end review screen. That's a reason to keep going in the middle of the season and to start season two.
5. **Keep Today and the digest fresh** (F3, F10, F12, F16):
   - age staff cards out;
   - show the best results in a long digest;
   - keep power rankings out of "your news";
   - mark mail read once shown.

   Every Continue then lands somewhere visibly new.

## 5. What I couldn't verify, and how I tested

**Setup.** Playwright on a phone viewport (390×844, touch), my own persistent browser profiles, driven only through the play dock and the Play options sheet. Scripts are in my review folder: `drive.mjs` (a command-driven player that logs each sim), `q.mjs` (read-only store checks) and `opts.mjs`. I read the store only to check what I'd seen on screen.

**Run 1, Heat: one full season.**

- Start → 4 games quick-simmed one by one.
- 3 × Sim 1 week, then 2 × Sim 1 month.
- Sim to trade deadline (stopped twice on the way) → Sim to All-Star break → 2 × Sim 1 day across All-Star day.
- Sim to next big night → Sim to end of regular season → play-in.
- First-round series quick-simmed game by game (lost 1-4) → Sim to end of playoffs → draft lottery.
- Calls answered: the books (ticket price), the deadline ("Look for a deal") and the series ("Plan the series").

**Run 2, Bulls:** pressed only "Sim to end of regular season" to count stops. 4 stops, 6.7s total.

**Run 3, Hawks:** the game-day dock, Play options, and the first screen of Watch & coach.

**Routes visited:** Today, inbox, settings, the trade screen (from a call), a matchup's plan and preview tabs, and the Practice sheet.

**Not verified**

- Live games; I didn't coach any (game-day lens).
- The odds and owner-floor calls; neither of my teams triggered them.
- Stops for job offers or offer sheets.
- Whether a front-page story ever stops a sim; none came up.
- Moments for titles, Cup wins or big signings.
- The loop across multiple seasons; I stopped at the draft lottery.
- Easy and Hard difficulty.
- Sim times on a real phone; mine are desktop Chromium on an Apple Silicon Mac.
