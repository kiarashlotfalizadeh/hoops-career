# Onboarding lens: the first hour (reviewer `onboarding`)

The tool would not let me save `REPORT.md` (subagents can't write report files), so the full report is below. Screenshots are under `/private/tmp/claude-501/-Users-kiarash--claude-spares-spare-hVNZPT/b285bc02-5a07-46d5-a46e-e152c55fa3b7/scratchpad/review/onboarding/shots/`. I cite them as `r1/NN-name.png`. Each run folder has a `log.txt` with every tap, the on-screen text and state dumps.

- r1: real league, Wizards (23rd roster, rebuilding), Normal. I followed the guide through the first live game, then simmed week 1.
- r2: fictional league, default Knicks, Easy. I skipped the guide and went straight to tip-off, then timed a quarter at 1×.
- r3: real league, default Knicks (no team change), Hard. Two forced cuts, then simmed a month with the guide hidden.
- r4: real league, Nets (30th roster), Hard. Owner goals only.

## 1. Verdict

The first ten minutes are the best I've seen in a mobile GM sim. The Start screen is calm and New League is three clear steps. Today opens with the owner's goals and a four-item "Your first week" checklist that ticks off only when you make a real choice. The staff voice is there from minute one. The first live game's halftime and post-game reports are a real "aha": they tell you concretely why you are winning and what to try.

The weak spots sit around that core. Team selection is blind to what matters. Fictional teams show no strength at all, and no team shows what the owner will demand. The default team is the hardest start in the game.

Guide step 3 ("Plan for your opener") leads a newcomer into a counter that quietly drops familiarity from 97% to 86%. Step 4 ("Coach a game live") hands you over to the live screen with no teaching at all. There, "Bench" means your staff, speed controls are hidden, and the timeout huddle points you to another screen. Once the four ticks are done, the guide simply disappears. Nothing explains the daily loop.

A first-timer will have fun by game 1. Many will be confused about what they did, and some will be set up to fail by the default team and owner goals they never saw coming.

**Score: 6.5/10.** The skeleton is excellent: guide, staff, owner, reports. Three P1 gaps sit exactly at the moments a newcomer decides whether they understand the game.

## 2. What's genuinely great (protect these)

- **Start screen and New League flow.**
  - One hero, one primary button, and "GM and head coach of a real NBA roster: build it in the office, coach it on the floor." (`r1/01-first-launch.png`).
  - Three steps with a progress bar. Steps live in the URL, so system Back works (`NewLeague.tsx:36-57`).
  - About 12-15 s from launch to Today; 7 taps including typing a name.
- **The team poster on step 2 (real league).**
  - Top three players with OVR, "23rd · roster of 30", division, market, and a roster-limit line such as "14 players · 1 open spot" or "17 players · 2 to cut before opening night" (`r1/04-step2-wizards.png`).
  - That is more decision-relevant than BBGM's team list.
- **The guide's design.**
  - Four steps, done by choices, not views: "each one ticks off when you've made the call, not when you've looked" (welcome mail).
  - A strip on each step's own screen with a one-tap "Keep these five" or "Keep this playbook" (`r1/10-rotation.png`, `r1/14-tactics.png`). Hide and restore both work.
- **Owner expectations on day one, in the hero.**
  - "Win 32 games / Play your young players: 10,000 minutes… / Stay under the luxury tax" (`r1/06-today-day0.png`).
  - The Owner page tracks pace: "105 so far, projected 9,900 · weight 46%". This is FM's board-expectations idea done well.
- **The first live game's reports are the hook.**
  - At halftime: "Herro is heating up… [Double Herro]", "We're beating Kuzma, 1.44 a trip… [Attack Kuzma]", and "What's deciding it" with points attached (`r1/34-after-q1.png`).
  - Post-game: "Shots falling above or below what they were worth is luck: nothing to change for it." Then "Next time: Drill the game plan… Practice: Opponent prep" (`r1/36-final-full.png`).
  - The first-games framing ("One night's shooting swings a game…", `debrief.ts:275`) teaches the game's philosophy at exactly the right moment.
- **Release confirmation shows the cost.** "Confirm: Release Bruce Brown. $2.4M stays on your books as dead money. Tap again to confirm."
- **Sims stop for real decisions only.** In r3, "Sim 1 month" stopped at day 27 for "OG Anunoby is out 30 games. The staff's call: ride it out." The "While you were away" digest summarises the rest (`r1/49-today-week1-full.png`).
- **The glossary.**
  - 81 entries. "OVR and POT" names the badge tiers ("gold 89+ superstar… purple 82+ quality starter…").
  - Dotted `Term` words throughout. The Difficulty "?" sheet explains every column in plain words.

## 3. Findings (most severe first)

### F1. The live game, guide step 4, has no teaching at all (P1)

**What the player experiences.** The guide promises "Timeouts, subs and adjustments, then the report says what your plan did." After two Tip off taps you land on the court with nothing that points at any of those (`r1/26-live-intro.png`, `r1/27-live-10s.png`).

- **The bottom bar's labels mislead.**
  - "Bench" (robot icon) is your lead assistant's feed, not your substitutes.
  - Subs live under "Lineup".
  - The glossary has an entry "The bench (live games)", but nothing on screen links to it.
- **Speed controls are hidden.** Speed (1×), Skip ahead and Key plays only appear after you tap the court. Nothing hints at this (`r1/30-bench.png`).
- **The game is long at 1×.** Q1 took 200 s, so a whole game is about 13-14 minutes (r2 log, "Q1 done after 200.124s").
- **My first timeout was wasted.**
  - The huddle screen's only advice: "Out of the timeout: No play set: the team runs its offense. Set one in Tactics → Match." (`r1/29-timeout.png`).
  - That points to a screen outside the live game. It is a dead end mid-game.
- **The step can tick without any coaching.** It ticks as soon as any live game finishes (`agenda.ts:145`, `if (league.reel) done.add('coach')`). Tapping "Sim to final" on the first possession completes "Coach a game live."
- **The step has no strip.** `GuideStrip` is mounted only on Rotation, Tactics and Matchup (`Rotation.tsx:106`, `Tactics.tsx:89`, `Matchup.tsx:76`). Neither game day nor the live screen shows it.

**Why it matters.** This is the moment of first fun and the core differentiator ("tells you why"). A newcomer who doesn't find subs or speed in the first two minutes either quick-sims or quits. FM's first match shows an overlay of the touchline controls. 2K's first MyNBA game uses coach-mode callouts.

**Recommendation (M).**

- Add a first-live-game layer, with teaching on and the guide step open. Three one-time coach-mark cards, dismissed by tap:
  - "Tap the court for speed and Skip ahead."
  - "Lineup: subs. Bench: your assistant's read and his calls."
  - "Timeout: stops play so you can sub and change the plan."
- Rename the "Bench" tab to "Staff" or "Assistant" (S).
- Tick `coach` only when the user has made at least one move (timeout, sub, accepted call) or watched a full quarter.
- Replace "Set one in Tactics → Match" with an inline action or remove the line (S).

### F2. Guide step 3 leads newcomers into a hidden familiarity penalty (P1)

**What the player experiences.** "Plan for your opener: Add a counter to their best play, or go in with no plan." No play is named as "their best play" on the Scout or Plan tab.

- **The Plan tab shows no values.** It lists four counters with jargon descriptions ("Pick-and-roll coverage: Hedge → Drop") and nothing in points (`r1/16-plan-full.png`).
- **I picked the best-explained one.** I added "3-2 zone" ("The Bucks live on threes (spacing 66): run their shooters off the arc").
- **The cost is buried.** Familiarity for tonight fell from "97% · Fluid" to "86% · Familiar". The note "We're 20% familiar with the 3-2 zone your plan calls for" sits far below the fold, in the Familiarity block. The win chance stayed at 52%.
- **The Preview tab is no help either.** Its text read "The staff is playing your game against them out with each counter: 38%." (`Briefing.tsx:94`). That reads as a 38% win chance; it is measurement progress.
- **Values appear later, on a different tab.** On game day the Preview tab showed "Stay home on shooters · About +0.5 a game" (`r1/24-gameday-full.png`).
- **The report confirms the cost.** "Playing a step slow cost us 1.1 points: tonight we played things we haven't drilled", and "The Bucks won second chances off the zone's loose box-outs… −9.0 pts" (`r1/37-report-full`).
- **The red "Always" next to "Add" is a trap.** It looks like a warning label but is a second button that writes the counter into your permanent tactics for every game (`CountersCard.tsx:75,97`). One mis-tap and a newcomer has changed their base defence.

**Why it matters.** The guide's whole promise is "make a real choice and see what it did." The default choice the guide steers toward is net-negative, and the cost only shows after the game. That teaches "the plan is a trap," not "the plan is a lever."

**Recommendation (M).**

- In the guide step, show the staff's single recommended counter with its value ("+0.5 a game"), or "None of the counters beats your playbook tonight".
- Show the familiarity cost inline on every counter row before Add ("−11% familiarity tonight: new to this team").
- Rewrite the step line to "Add the staff's counter, or go in with no plan."
- Move "Always" behind a "⋯" or give it a neutral, non-red style with a confirm (S).
- Fix the 38% copy to "The staff is still measuring each counter (38%)" (S).

### F3. The default team is the hardest start in the game (P1)

**What the player experiences.** Step 2 preselects the Knicks (`NewLeague.tsx:48`, `tidParam === null ? 19`). A newcomer who taps "Choose your team → Take over the Knicks" without browsing hits all of this:

- **A required cut.** "Needs you: Cut 2 players · 17 signed · 15 allowed on opening night" blocks the Continue bar ("Needs you first" sheet, `r3/03-knicks-bar-tap.png`).
- **No reason for the staff's pick.** The one-tap staff suggestion "Release Bruce Brown" doesn't say why him (`r3/02-knicks-today-full.png`).
- **"Cut" vs "Release".** The task says "Cut", the button says "Release".
- **A redundant tag.** A "Needs you" tag sits inside the "Needs you" section.
- **Day-one cap pressure.** The league's highest payroll, and an owner goal "Get under the first apron". "Apron" is never explained on Today.
- **Hard owner goals above the owner's own read.**
  - "Win 57 games · His read of the roster: 49 wins" and "Win a playoff round".
  - "You have the league's 1st-highest payroll. I expect a record to match it."
  - Hard gives 1 season of patience.

**Why it matters.** The default is what a non-browsing newcomer gets. It front-loads the cap, the roster limit and contender pressure before the first tip-off.

**Recommendation (S).**

- Default to no preselection, or to a mid-table team with a legal roster and no apron issues (e.g. a 12th-18th roster with 14-15 players).
- In the cut item, add one line of why ("least value to the team; $X dead money") and say "Release 2 (staff's picks)".

### F4. Picking a team is blind to what will be asked of you (P1)

**What the player experiences.**

- **Real league.** Step 2 shows roster rank and top 3, but nothing about the owner's mandate ("Rebuild: wants 10,000 young minutes", "Win-now: 57 wins"), the cap position, or how hard this team is on the chosen difficulty.
  - Difficulty is picked on step 3, after the team. The two interact a lot.
  - Nets on Hard: "Win 29 games · His read of the roster: 17 wins", "Rebuilding: season 1 of the 1… After that I want the play-in", "Whatever the plan, under 29 wins is a failed season" (r4 log).
- **Fictional league.** Step 2 shows only "Large market / Mid-size market" per tile and "New players, generated at the start". No strength, no stars, no rank (`r2/01-fict-team.png`). It is a lottery.
  - The owner then demands "Win 44 games · Make the playoffs · … Turn a $91.0M profit" (`r2/03-fict-today.png`). A newcomer has no idea whether that is easy.

**Why it matters.** FM puts "Board expectation: avoid relegation / challenge for the title" and the budget on the team-select card. That is the single most useful onboarding signal for choosing a save.

**Recommendation (M).**

- Add one mandate line to the step-2 poster ("Owner: rebuilding · wants young players' minutes" or "Owner: win now · 57 wins expected").
- Generate the fictional league before step 2, or at least seed its strength. Then the tiles can show rank like the real league's.
- Add a one-word difficulty hint per team on step 3 ("Nets on Hard: the owner wants 29 wins from a 17-win roster").

### F5. Owner goals look dishonest on day one (P1/P2)

**What the player experiences.**

- **The goal moves with no roster change.**
  - The preseason hero and the welcome mail say "Win 32 games" (Wizards).
  - After "Start regular season", the "My goals for this season" mail and the Owner page say "Win 31 games" (r1 inbox text).
  - The card itself says "He sets them on opening night, from the roster you open with", but the roster didn't change.
- **"On track" contradicts the owner's own read.** Nets on Hard at 0-0: "3 of 3 on track · Win 29 games · On track · His read of the roster: 16 wins" (r4 owner text).
- **The copy switches voice mid-paragraph.** "Rebuilding: season 1 of the 2 without the postseason I'll give it. After that I want the play-in. He sets them on opening night…" (`NextGame.tsx:346` appends a third-person line to the owner's first-person quote).
  - "Season 1 of the 2 without the postseason I'll give it" is also hard to parse.

**Why it matters.** The owner is the stakes system. A newcomer who sees the goal move and "On track" next to a 13-win gap learns to distrust the numbers on day one.

**Recommendation (S).**

- Freeze the preseason display to the number that will actually be set, or label it "about 32 (final on opening night)".
- Show "Not started" or "Behind his read" instead of "On track" at 0-0 when the read is under the goal.
- Rewrite the line as the owner: "I'll set the final numbers on opening night, from the roster you open with."
- Rephrase the rebuild clause: "I'll give you two seasons without the playoffs. After that, I want the play-in."

### F6. The guide ends silently; nobody explains the daily loop (P2)

**What the player experiences.** After step 4 the checklist vanishes from Today. No "you're set" message, nothing on what a normal day or week looks like (`r1/38-today-after-game.png`).

- Hidden or unfinished, the guide also disappears at day 21 (`agenda.ts:153`).
- What remains on Today from game 2 on:
  - A red "No game plan yet" tag on every game (`r1/41-after-bar2.png`), which implies a duty 82 times a season.
  - "From your staff: 1 open roster spot", every day.
  - A trade offer.
  - A Play options sheet with nine sims, including "Sim to the next big night · Revenge game · Thu, Mar 11" in week 1 (`r1/43-options-gameday2.png`).

**Why it matters.** The player knows four screens but not the rhythm: when to plan, when to quick-sim, when the owner checks in, what the bell is for. BBGM's spare dashboard and FM's "assistant handles it" defaults both make "you can just play" explicit. Here the red tag implies the opposite.

**Recommendation (S/M).**

- On completing the guide, send one staff message and show a one-time Today card with three lines:
  - "Most days: play or sim to the next game. The staff covers the rest."
  - "Before big games: add their counter (Matchup → Plan)."
  - "Once a month the owner checks his goals (Office → Owner)."
- Make "No game plan yet" neutral, not red, after the first week. Or show it only when the staff has a counter worth at least +0.5.

### F7. Jargon density on the Tactics screen, with glossary gaps (P2)

**What the player experiences.** Guide step 2 lands on Tactics (`r1/14-tactics-full.png`). In one scroll:

- "Heliocentric", "Hedge & Recover", "Familiarity 97% Fluid".
- "A+ Rim pressure, F Pick-and-roll D".
- "5-Out · +0.9 per 100 vs 4-out · 97% fluid".
- Roles "Playmaker / Movement Shooter / Post Hub / Glue Guy / Rim Runner / Slasher · Position Defender".
- "Partnerships: Davis → Middleton · Inside-out · understanding 90%".
- "Roles · knows them 94%", slots "A Main / B + / C +".

What the glossary (`src/ui/glossary.ts`, 81 terms) does not cover:

- None of the 13 playbook names (Heliocentric, Hub Big, Grit & Grind…).
- The offensive roles (Glue Guy, Post Hub, Movement Shooter…).
- The familiarity bands ("Fluid", "Familiar", "learning").
- "Counter", "Penalty" (scorebug), and EPM.
- EPM is used on New League step 1 ("Dunks & Threes' 2026-27 EPM projection has the last word") and in stats tables.

**Why it matters.** The guide's line "Each one shows how well it fits this roster. Pick one, or keep the staff's" assumes the player reads this screen. Most newcomers will tap Keep without understanding a word, so the step teaches nothing.

**Recommendation (S/M).**

- Add glossary entries for playbooks (one line each, pulled from the picker's taglines), roles, familiarity bands, counter, penalty and EPM. Wrap them in `Term` on Tactics and on the picker.
- Make the guide strip say what to tap: "Tap Change to see every playbook with its fit."
- With the guide open, put the strip above the hero, not below the fold. It sits below the hero on Tactics but above it on Rotation.

### F8. The staff's default playbook isn't the "best fit", and nothing says why (P2)

**What the player experiences.** In "Pick a style", Defense is sorted "Best fit for your roster first": Ice & Contain 100, Switch Everything 97, then Hedge & Recover 93. Hedge & Recover is the one the staff chose and the guide says to "keep" (`r1/15-playbook-picker.png`). The reason is presumably familiarity, but the picker doesn't say so. Hedge has no "% familiar" tag while the others do.

**Why it matters.** The first thing a newcomer learns about the staff is that its pick ranks third. "Fit" vs "familiar" is exactly the nuance onboarding should explain once.

**Recommendation (S).**

- Tag the current pick "Your team knows it (100%)".
- Add one line under the header: "Fit: how well it suits the roster. Familiar: how well they know it. A new one costs a few weeks of learning."

### F9. Two empty taps and two Tip off buttons before the first game (P2)

Taps from launch to first tip-off:

| Path                                     | Taps     | Sequence                                                                                                                                            |
| ---------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real league, default team, guide ignored | 8        | New league → Choose your team → Take over → Start career → Start regular season → Sim to next game → Tip off (matchup dock) → Tip off (court intro) |
| Following the guide (r1)                 | about 20 | The above plus about 9 checklist taps and the conference/team picks                                                                                 |

- **"Start regular season" leads to an empty day.** It moves to day 0 of the regular season, where nothing happens except a trade offer and the "Preview" lead story. A second tap, "Sim to next game", is needed to reach opening night (`r1/21-after-start-moment.png`).
- **Tip off twice.** The matchup dock's "Tip off" opens the court intro, which has its own "Tip off" (`r1/25-after-watchcoach.png`, `r1/26-live-intro.png`).
- **Speed compares well.** BBGM reaches game 1 in about 4 taps; FM puts friendlies before anything counts.

**Recommendation (S).**

- Make "Start regular season" land on the morning of opening night.
- On the very first game, let the dock's Tip off skip the intro's second button, or auto-tip after the lineups animate.

### F10. A day-0 trade offer for a teenager, with Accept one tap away and no staff view (P2)

**What the player experiences.** Before game 1, "Needs you" shows "PHX want Johnson for Goodwin + Maluach + 1 pick" with big Accept and Turn down buttons (`r1/22-opening-night-today-full.png`).

- **No youth context.** Tre Johnson is one of the team's young players under a rebuild whose biggest goal (46% weight) is young players' minutes. Neither the card nor the trade screen shows ages or POT.
- **No staff opinion on the card.** The trade screen's verdict is the ambiguous "A little short" (`r1/50-trade-offer.png`).
- **The "stands until" date drifts.** The mail says "It stands until Oct 25". Today later shows Oct 27, then Oct 28, then Nov 4 (unread offers are extended, `proposals.ts:82`).

**Why it matters.** A first-hour Accept can gut the rebuild the owner just asked for, and the newcomer never got the staff's view that the game otherwise always gives.

**Recommendation (S).**

- During the guide weeks, hold AI trade offers, or show them under "From your staff" with the staff's call ("Turn down: he's one of your young players the owner counts").
- Show age and POT on trade rows.
- Keep the mail's deadline in sync with the card.

### F11. One rotation edit for the guide quietly ends assistant management (P2)

Guide step 1 says "change one, or keep the five the staff picked." The toggle right above, "Let the assistant manage" (on), says in its help: "He sets the starters and minutes… and adjusts for injuries. Your next edit takes over." (`Rotation.tsx:125`).

A newcomer who follows the guide literally ("change one") turns off the assistant's injury handling for the rest of the save, without being told at the moment of the edit. The guide also ticks on `rotation.manual` (`agenda.ts:141`).

**Recommendation (S).**

- When the first edit flips manual on, toast "You're managing the rotation now. Turn 'Let the assistant manage' back on any time".
- Or keep injury cover automatic even in manual mode.

### F12. Live game progress is lost when the app closes mid-quarter (P2, cross-lens)

In r1 I reached 8-19 with 7:20 left in Q1, then closed the browser. "Resume live game" came back as "Q1 · Tied 0-0" and the game replayed from the start of the quarter (r1 log, r1k run).

On a phone, backgrounding during a 13-minute first game is normal. Losing three minutes of the first game is a bad first impression.

**Recommendation (M).** Save the live session every possession or on `visibilitychange`, at least during the first game.

### F13. Small copy bugs a newcomer reads in the first hour (P2/P3)

- "Watch Kevin Porter Jr.. Best shot creator…": a double period after "Jr." (`Briefing.tsx:59`; strip a trailing period from the name before adding ". ").
- "3 more threes than them (3-3)" reads as tied 3-3. It means 3-of-3 (`live/staff.ts:367`). Use "(3 of 3)".
- "Keys to the game: Make Herro work" while the Scout tab's "Key players" lists Porter Jr., Green and Turner, not Herro, and the staff says "Watch Kevin Porter Jr." The first matchup page names three different threats (`r1/24-gameday-full.png`).
- On the post-game report, "Missed key: Make Herro work… or double him (Star plan)" right after I doubled Herro at halftime. The advice repeats the move just made (`r1/36-final-full.png`).
- "Needs you" appears as a tag on a row inside the "Needs you" section (`r3/02`).
- Counts disagree on day 0: the bell badge says 1, Needs you says 1, and the Inbox says "2 unread" (`r1/07-bell.png`).

### F14. "Revenge" occasions about players who don't play (P3)

Week 2 Today hero: "Revenge night vs the Hornets: Mann faces the Hornets for the first time since he left". Tre Mann is a 57-OVR 12th man averaging 1.8 minutes. The Play options sheet in week 1 offers "Sim to the next big night · Revenge game · Thu, Mar 11" (4.5 months out).

For a newcomer, "big night" framing should mean something.

**Recommendation (S).** Require a rotation player (or 15+ minutes) for revenge or homecoming occasions. Skip "next big night" when it is more than about a month away.

### F15. Difficulty is shown as a table of mechanics, with no beginner hint (P3)

On step 3 the picker reads "Trade asks −12% / Contract asks −10% / Opponent plans None / On court +1.5 / Owner waits 3 yrs" (`r1/05-step3.png`). "On court: −1 to 5" and "Opponent plans: Half" are opaque until you open the "?".

The "?" sheet is excellent; it just isn't read.

**Recommendation (S).** Add one plain sublabel per row: "Easy: learn the game", "Normal: the real NBA", "Hard: the owner and the league push back". Optionally preselect Easy when teaching is on.

### F16. Fictional players carry real players' surnames (P3)

The fictional Knicks start A. Murray, Wade, Jokubaitis, Hartenstein and Gil (`r2/07-fict-intro.png`). "Hartenstein on the Knicks" in a fictional league makes a newcomer wonder whether it's real.

**Recommendation (S).** Exclude current NBA surnames from the generator's pool, at least for the user's own team.

### F17. "Player of the game" ignores the best line (P3, cross-lens)

Opener: Young had 36 points and 11 assists (+19, grade A+). Davis had 32 and 12. Player of the game was Davis, and Three stars ordered "Davis 32 · Young 36" (`r1/36-final-full.png`).

The first post-game headline should feel right.

## 4. Top 5 moves for this lens

1. **Teach the first live game (F1).**
   - Three one-time coach marks (speed/skip, Lineup = subs, Timeout).
   - Rename "Bench" to "Staff".
   - Tick the step only after a real move.
   - _Impact:_ the moment of first fun stops being the moment of first confusion. Most likely to cut quick-sim-and-quit in game 1.
2. **Make guide step 3 a sure win (F2).**
   - Show the staff's one counter with its value and familiarity cost inline.
   - Make "Always" non-red and confirmed.
   - Fix the "38%" copy.
   - _Impact:_ the first plan the player adds visibly helps, so the core "tactics tell you why" promise lands in the first game instead of backfiring.
3. **Fix team selection (F3 + F4).**
   - Drop the Knicks default.
   - Show the owner mandate on the poster.
   - Give fictional teams a strength rank.
   - _Impact:_ newcomers choose a save that matches what they want (rebuild or contend) and stop starting with forced cuts and an apron goal they can't parse.
4. **Make owner goals honest on day one (F5).**
   - Freeze the preseason number.
   - Change "On track" at 0-0 to "Behind his read" when it is.
   - Rewrite the I/He copy.
   - _Impact:_ the stakes system earns trust from day one instead of losing it.
5. **Close the guide with a handoff (F6, plus F9 and F10 as quick wins).**
   - One "how a normal week works" card.
   - Neutral "No game plan yet".
   - Hold AI trade offers during the guide weeks.
   - Land "Start regular season" on opening night.
   - _Impact:_ after the four ticks the player knows the rhythm, and two empty taps plus a risky day-0 Accept are gone.

## 5. What I couldn't verify, and how I tested

**How I played.** Four fresh Playwright profiles under `/private/tmp/claude-501/-Users-kiarash--claude-spares-spare-hVNZPT/b285bc02-5a07-46d5-a46e-e152c55fa3b7/scratchpad/review/onboarding/`, all at the 390×844 phone viewport. Scripts are `r1a.mjs`…`r4a.mjs` in that folder, with a shared `lib.mjs` that counts taps and logs page text. Playwright was imported by absolute path, so nothing was written to the repo.

- **r1, real league, Wizards, Normal.**
  - Start, New League, and all three steps (ratings blurb, East, Wizards).
  - Today day 0, bell, Glossary, Play options.
  - Rotation (row sheet, Keep), Tactics (picker, Keep), Plan (Scout tab, added the 3-2 zone).
  - Start regular season, Sim to next game, matchup preview, Tip off.
  - Live: timeout and huddle, Bench tab, Skip to halftime, accepted "Double Herro", Sim to final.
  - Final screen and game report, Today after the game, inbox, Owner and Office pages, roster, player page, trade offer.
  - Sim 1 week (1-4), and the "While you were away" digest.
- **r2, fictional league, Knicks, Easy.**
  - Guide skipped, straight to tip-off.
  - Watched Q1 at 1× (200 s).
  - Left mid-game (the game is kept), then Settings.
- **r3, real league, Knicks (default), Hard.**
  - Difficulty "?" sheet, forced cuts with the confirm, Hide the guide.
  - Sim 1 month (stopped at day 27 for an injury call).
- **r4, real league, Nets, Hard.** Owner goals before and after opening night.

**Not verified:**

- **The Easy and Hard feel over a full week.** I only checked goal-setting and patience.
- **The guide's day-21 expiry in a live save.** I read it from `agenda.ts:150-155` but didn't sim to it with the guide still open.
- **Teaching off.** I didn't play a career with it off; I only read the code (no welcome mail, no glossary row on Today).
- **Whether a manual rotation leaves an injury hole (F11).** That is inferred from the on-screen help copy, not observed.
- **The live game at 2×/4× and Key plays mode.** Not tried.
- **Tablet layout, the native shells, and the install/PWA first launch.**
- **Real-time reading load.** My tap counts are mechanical; a first-timer reading every card will take several minutes longer than the 12-15 s machine time to Today.
