## Onboarding review, round 3: first launch to the end of week 1

Screenshots are in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/onboarding/shots/`. Below, `shots/x.png` means a file in that folder. Profiles:

- **a**: the default Wizards, reading nothing
- **b**: the default Wizards, following the guide
- **c**: the Nets on Hard
- **d**: a fictional league, Pacers on Easy

### 1. Verdict

The first ten minutes are now the best in the genre for a sim this deep.

- **Fast:** 7 taps from launch to tip-off. Building the league took 0.54 s.
- **A real guide:** each step has a strip on its own screen, and the plan step's main button now adds the staff's counter.
- **An honest staff:** at breaks it offers measured calls ("+1.2 to the margin (±0.3)… 320 replays each way").

The first week is the problem. The default team the game picks for a newcomer, the Wizards, is about 9-10 wins worse than the forecast says. The owner's goals and Today's odds are both built on that forecast.

- In the app, the default Wizards started 0-7 in profile a and 1-7 in profile b.
- In 8 headless seasons they averaged 1.5 wins in their first 7 games and 29 wins over the season, against owner goals of 36-41 wins.

So by game 7 the newcomer gets "Postseason odds down to 3%: Tell the owner it's a rebuild". In the same week the staff's post-game advice tells them to do what they already did.

**Score: 6.5/10.** Down from 7. The onboarding mechanics are better than in round 2, but the save the game hands a newcomer by default nearly always turns into a losing streak and a broken owner contract.

### 2. What's genuinely great (protect these)

- **Start to New League to Today.**
  - 3 calm steps with the default team pre-selected (`shots/a-01-launch.png`, `shots/a-04-team-step-full.png`).
  - Day 0 Today shows the owner's goals in his own voice, with "I'll set the final numbers on opening night" (`shots/a-06-today-day0.png`).
- **Guide strips.** "FIRST WEEK · 1 OF 4 · Set your rotation … [Keep these five]" sits on the screen where the choice is made (`shots/b-01-rotation.png`).
  - The plan strip's main button is "Add Stay home on shooters", with "No plan" second. After adding it, the win chance moves from 53% to 55% (`shots/a-10-watch-2.png`, `shots/b-13-plan-added.png`). Round-2 F2 is fixed.
- **The staff's picker agrees with the staff's default.**
  - Wizards: Grit & Grind and 2-3 Zone are at the top of "Best for your roster first" (`shots/b-08-pb-picker.png`).
  - When the default isn't on top, the picker says why: "The staff keeps Pace & Space while the team knows it: in season they change once another reads +0.8 a game better (Heliocentric: +0.3)" (profile d). Round-2 F1 is fixed.
- **Measured feedback from the first choice.**
  - A rotation swap toasts "This change: even over your next five, too close to say" (`shots/b-06-tactics.png`).
  - Swapping in a non-shooter warns "Starting five: cramped spacing" (`shots/b-04-rot-swapped.png`).
- **The first live game.**
  - Three coach marks (`shots/a-14-live-3.png`).
  - A measured staff call at the Q1 break with a one-tap button (`shots/a-23-q1-break-full.png`), confirmed by the toast "Stay home on shooters: from the next possession" (`shots/a-24-after-call.png`).
  - "Measured 5 changes from halftime: none clears the noise. Nothing to change." (`shots/b-25-half.png`)
- **How a big first loss is framed.** "We came up 18 short. Their shots fell above what their looks were worth: that part was luck, not the plan … One night's shooting swings a game either way."
  - The plan is graded on its measured worth: "Your plan: Stay home on shooters · Tonight: MIL offense 1.05 a trip… Worth +0.8 a game" (`shots/b-28-final-full.png`). Round-2 F11 is fixed.
- **Finishing the guide.** It ends with the "A normal week" note and a first-win moment (`shots/b-29-today-after.png`, `shots/b-30-moment-b.png`).
- **Owner page and Hard help.** The Owner page explains the job: "His read of the roster: 30 wins", "under 24 wins is a failed season" (`shots/c-05-owner.png`). The difficulty "?" explains every column in plain words (`shots/c-03-diff-help.png`).
- **Glossary content.** 101 entries, now including Counter, Luck, Keys, the familiarity bands, playbooks and roles (`shots/d-08-glossary.png`). Round-2 F6's content is fixed.

### 3. Findings (most severe first)

**F1. The default newcomer team is a trap: the forecast, owner goals and odds overrate the Wizards by about 10 wins (P0)**

- **What the player sees:**
  - Day 0: "Win about 37 games · Reach the play-in", projected about 37-40 wins.
  - Then 0-7 (profile a, `shots/a-37-wk2.png`) or 1-7 (profile b), outscored by 13.6 and 20.8 points a game.
  - Today drops to "Play-in 4%" (a) or "2%" (b).
- **Headless evidence** (my scripts `startrec.ts` and `projbias.ts`; the machine was under load, but timing doesn't affect results):

  | Run                        | Who controls WAS | Projected wins | Actual wins                                 | Gap                                                 |
  | -------------------------- | ---------------- | -------------- | ------------------------------------------- | --------------------------------------------------- |
  | 8 seasons, Normal          | user             | ~37.7          | 28, 32, 30, 33, 23, 29, 36, 23 (mean 29.3)  | —                                                   |
  | First 7 games of those 8   | user             | —              | 1.5 wins on average; 5 of 8 at 1-6 or worse | —                                                   |
  | 4 more seasons, Normal     | user             | 37.5–37.9      | 20, 33, 29, 26                              | **−10.7** (AI teams in the same runs: +0.4, sd 7.4) |
  | 3 seasons, Easy            | user             | ~41            | 33, 40, 24                                  | **−8.9**                                            |
  | 4 seasons, Orlando as user | AI               | 40.0–40.6      | 39, 41, 23, 22                              | **−9**                                              |
  | Same 4 seasons, control    | Orlando (user)   | ~51            | 51, 54, 49, 50                              | **+0.1**                                            |
  - The owner's win goals were 36-41. Only 1 of the 12 Normal user seasons reached its goal (seed 7: 36 wins against a goal of 36).
  - Easy rules out opponents' game plans as the cause (Easy has none).
  - The Orlando runs rule out the "user's team" path as the cause: the AI Wizards show the same gap.

- **Likely cause:** the forecast misjudges this roster. My guess is that it doesn't price injury risk:
  - Profile a lost Davis and Sarr in the opener, plus Dybantsa and Watkins.
  - Profile b lost Coulibaly, Ayton and Champagnie in week 1.
  - The AI Wizards' seasons swing between 22 and 41 wins.
- `defaultTeam` (`src/ui/newLeague.ts:46-56`) picks the team ranked nearest the middle by roster strength. It never checks how that team's results spread.
- **Why it matters:** this is the save most newcomers will play. Its first hour teaches that the owner's numbers and the odds are wrong, which undercuts the game's honesty promise at the worst moment.
- **Fix:**
  - (S) Pick a default whose projected wins (and the owner's goal) match what it actually does. Check a candidate with a headless run, as I did.
  - (M) Fold injury risk (age, history) into the projection that sets owner goals and odds (`src/core/analysis/odds.ts`), or calibrate the forecast per team in CI the way star-check does.

**F2. The quit moment: game 7 brings a rebuild call and a dense youth-minutes card at once (P1)**

- After `Sim 1 week` at 0-7, the digest led with:
  - "Postseason odds down to 3% … tell the owner now, play the young players and sell veterans before the deadline … [Tell the owner it's a rebuild] [Keep pushing]".
  - Beside it: "27 more minutes a game for the young players? It costs 1.0 pts a game (≈ −3% to win, measured vs ATL): about 0.3 wins over 10 games. It adds 270 of the owner's minutes: on pace for 9,345 of his 10,700, not 9,075…" (`shots/a-37-wk2.png`).
- Today then shows 3 "Needs you" items, one of them the still-open "Your first week" guide (`shots/a-38-today-wk2.png`).
- The design (two weekly readings under 5%, `calls.ts:322`) is fair for veterans. For someone 40 minutes in, this is where they quit.
- **Fix (S):** in the first season, hold the odds call until about 15 games have been played, or until the guide weeks end. Also put one staff line on the first slump that separates the forecast from bad luck and injuries.

**F3. The post-game advice tells you to do what you already did (P1)**

- Profile b put "Stay home on shooters" in as its plan. Profile a took the staff's own "Stay home" call at the Q1 break.
- Both post-game reports still say: "Missed key: Run them off the line … stay home on their shooters (less help), or run their best one off the line" (`shots/b-28-final-full.png`, `shots/a-29-final-full.png`).
- **Why it matters:** this is the one staff voice contradicting itself in game 1.
- **Fix (S):** the advice for a missed key should look at the plan that was played. If it already had "Stay home", say so ("Stay home was in: they hit 16 anyway: the looks, not the plan").

**F4. Losing two starters in the opener isn't mentioned afterwards (P1)**

- Profile a used Skip ahead to Clutch time. Three quarters went by without a stop, and the live screen then showed "Davis is hurt and out for the game · Sarr is hurt and out for the game" (`shots/a-26-clutch.png`).
- The game report and the Today screen after it never mention it. I searched the page text for "hurt", "injur", "Davis" and "Sarr": no matches (`shots/a-29-final-full.png`, `shots/a-31-today-g1-full.png`).
- It surfaces only on the next game's hero: "Davis out 5 games, Sarr out 3 games +1 more". Yet it was a bigger cause of the 18-point loss than anything the report lists.
- **Fix (S):**
  - Add an injury line to the post-game report and to Today ("Out: Davis 5 games, Sarr 3").
  - Have Skip ahead stop when one of your starters goes out.

**F5. The team step still hides the job (P1, round-2 F5 open)**

- Step 2 shows roster rank and the top three players only. No step shows the mandate (`shots/c-01-nets-pick.png`, `shots/a-04-team-step-full.png`).
- Fictional teams show only "Large market" (`shots/d-02-fict-team.png`). Picking the Pacers by market gave a newcomer "Win about 58 games · Win a playoff round · Add nothing to the payroll you inherited" (`shots/d-03-today0.png`).
- Football Manager shows board expectations on the job card. MyNBA shows team ratings.
- **Fix (M):** add one line per team on the poster ("Owner: about 32 wins · patient"), and a strength rank for fictional teams.
- What did improve: the Nets owner now reads "Win-now · wants results, but he'll take a rebuild this season", which agrees with his goals.

**F6. The staff's silent counter ticks the newcomer's guide step (P2, round-2 F7 open)**

- In profile d I never touched a plan. The week-1 digest said "the staff put in Switch coverage". The guide then showed "Plan for your opener (done)", and the save had `league.onboarding.done = ['scout']` (`shots/d-06-today-d.png`).
- **Cause:** `gamePlans.ts:137` marks the step done for any plan that gets used up, including the staff's (`weekCall.ts:621`).
- **Fix (S):** tag plans the staff made and ignore them for the guide.

**F7. The glossary has the words, but the first-hour screens don't link to them (P2)**

- A DOM count of `button.term` found 0 links on Today, the game report, Tactics, Rotation, Owner and Office. `<Term>` is used only inside the "?" help paragraphs (for example `Rotation.tsx:296`, `Board.tsx:151`).
- Meanwhile the lines a newcomer reads in hour one are the densest in the app:
  - "WAS 50.0% eFG on looks worth 50.0%"
  - "+1.2 to the margin (±0.3), +8% to win… 320 replays each way"
  - "MIL 1.35 a trip since (72 trips)"
  - "Bonus", "Crowded paint" (not in the glossary at all)
- **Fix (M):** auto-link glossary words in staff and report lines, as they're rendered.

**F8. "Your moves" puts a measured verdict next to a raw number that says the opposite (P2)**

- "Your moves: +12% to win tonight, measured (about ±4%)", directly above "Help defense: Balanced → Stay home · MIL 1.35 a trip since (72 trips), 1.27 before" (`shots/a-29-final-full.png`). It was a loss.
- A newcomer reads that as "my move made them better and the game says it helped".
- **Fix (S):** label the before/after as raw and unmeasured, or hide it while teaching is on.

**F9. The guide's labels go stale and it keeps counting (P2)**

- It is titled "Your first week" but runs for three weeks (`agenda.ts:181-186`, day < 21).
- "Plan for your opener" is still the step's name on Nov 3, long after the opener (`shots/a-38-today-wk2.png`).
- The finished "all 4 done · Got it" card still counts as "1 need you" (`shots/b-29-today-after.png`; round-2 F15).
- **Fix (S):**
  - Call it "Your first games".
  - Rename the step to "Plan for your next game" after the opener.
  - Don't count the "Got it" card.

**F10. Trade offers on day 0, with no staff view (P2, round-2 F9 open)**

- Preseason Today in profile d: "NOP want Lee for Campbell + Shaw · NOP GM: 'We're going for it…' [Accept] [Turn down]". No verdict, ages or ratings on the card.
- **Fix (S):** hold AI offers during the guide weeks, or put the staff's verdict on the card.

**F11. An injury card aged out without the sim stopping for it (P2, needs confirming)**

- Profile d: Wiggins went out for 11 games on Oct 24, and `Sim 1 week` still ran to Oct 27.
- The next digest said: "Nick Wiggins out: the card went unanswered for 3 games, so the staff rode it out" (`calls.ts:668`).
- `runSim` is meant to stop the day a card opens (`simCore.ts:157-171`). I couldn't find why it didn't.
- The wording blames the player for a card no sim stopped for. Check whether the injury card is really in `openCallIds` the day it opens.

**F12. The odds go by four names in week 1 (P2)**

- Matchup: "Playoff odds 39% with a win, 34% with a loss"
- Today, one day later: "Play-in 38%"
- League: "playoffs 41%"
- The call: "Postseason odds down to 3% … rather than miss his playoff goal", while the goal is actually "Reach the play-in".
- Each is technically a different quantity (`PreviewTab.tsx:86` is `reach[0]`; Today uses `goalChance`), but a newcomer sees one number moving around.
- **Fix (S):** name everything by the owner's goal while one exists, or show both side by side once.

**F13. A newcomer who reads nothing benches the #3 pick (P3)**

- The preview says "AJ Dybantsa · Sprained ankle · Clear to play · Sits unless you clear him", and he sat the opener in both a and b.
- **Fix (S):** show the staff's call ("clear him: measured +x") in the strip, or default to the staff's call.

**F14. A dead path in the advice copy (P3)**

- "Shift creation to your most secure ball handlers (Tactics → Players)" (`gameReport.ts:693`). Tactics has Tactic, Instructions, Match and Analysis, with no Players tab.
- "Instructions > In possession > Play through" does exist; I checked it.

**F15. "Revenge game" is overused (P3, round-2 F15 open)**

- 3 of the Wizards' first 8 games were billed as revenge games: TOR ("Vukcevic faces the Wizards"), CHA and ATL. Next, the Nets "at Hawks · Revenge game" (`shots/a-34-sim2.png`).
- **Fix (S):** only bill it when the player is a rotation player.

**F16. The red "No game plan yet" pill sits on every week-1 game (P3, round-2 F14 open)**

- It contradicts the handoff note's "The staff covers the rest" (`shots/a-08-after-start.png`).

**F17. Copy and layout nits (P3)**

- Step 3's Hard row still reads "−1 to −5 1 yr" (`shots/a-05-step3-full.png`).
- An empty coach name gives "Win No. 1 for Coach".
- The Matchup hero's "Today · Home" sits over the away team's half (`shots/a-10-watch-2.png`).
- "Keep this playbook" leaves you on Tactics, with no "Next" (round-2 F12 open).
- The rotation toast covers the guide strip (`shots/b-06-tactics.png`).
- The youth goal on the Today hero, "about 10,700 minutes for players 23 or under", is opaque. The Owner page's "About 89 minutes a game" (`shots/c-05-owner.png`) should be the hero line.
- The coach marks never mention Game plan or tactic switching.

### 4. Since round 2

| Round-2 finding                           | Status                          | How I verified it                                                                                           |
| ----------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| F1 Staff default not its best             | **Fixed**                       | The Wizards' picker has the staff's picks on top. Fictional: the gap is labelled with the +0.8 switch rule. |
| F2 Plan strip's only button was "no plan" | **Fixed**                       | "Add Stay home on shooters" is the main button.                                                             |
| F3 Today's odds cell not the goal's       | **Fixed (label)**               | It now reads "Play-in 38%". New: four names across screens (F12).                                           |
| F4 Big opener losses framed only as luck  | **Partly**                      | The "One night's shooting…" frame and plan grading are good. The injuries go unmentioned (F4).              |
| F5 Team pick blind to the job             | **Open**                        | F5. The Nets' persona clash is fixed.                                                                       |
| F6 Glossary gaps                          | **Content fixed, linking open** | 101 entries, but 0 linked words on first-hour screens (F7).                                                 |
| F7 Staff counter ticks the guide          | **Open**                        | Reproduced in profile d (F6).                                                                               |
| F8 Coach-live fails silently              | **Partly**                      | Taking a staff call at a break ticks the step. There is still no strip on /live.                            |
| F9 Day-0 trade offers                     | **Open**                        | F10.                                                                                                        |
| F10 Huddle gives no advice                | **Mostly fixed**                | Measured calls at breaks. A timeout huddle still gives only a read (`shots/b-19-timeout.png`).              |
| F11 Plan night vs worth                   | **Fixed**                       | Grading copy added.                                                                                         |
| F12 Keep doesn't move you on              | **Open**                        | F17.                                                                                                        |
| F14 Red "No game plan yet"                | **Open**                        | F16.                                                                                                        |
| F15 Copy nits                             | **Mostly open**                 | F9, F15, F17.                                                                                               |

**New since round 2:**

- **Regression:** the default team is now the Wizards and it collapses (F1). Round 2's default was the Hawks.
- **Also new:** F2, F3, F4, F8, F11 and F12.

### 5. What it would take to reach 9/10

1. **Make the default save tell the truth (F1).** Choose a default team whose median season meets its owner's goals, and calibrate the forecast on injury risk in CI. Impact: the first week stops being a losing streak against a broken promise. This is the single biggest lever.
2. **Protect the first 15 games (F2, F9, F10).** No odds or rebuild calls and no AI trade offers during the guide weeks. Give the first slump one plain staff line separating bad luck, injuries and the plan. Impact: removes the game-7 quit moment.
3. **One coherent staff voice after each game (F3, F4, F8).** Advice that knows what plan was played, an injury line, and raw numbers that never sit beside measured ones unlabelled. Impact: the measurement promise holds in the first report, where trust is decided.
4. **Teach the words where they are read (F7, F12).** Auto-link glossary words in staff and report lines, and use one name for the odds. Impact: the dense, honest numbers become learnable.
5. **The job on the team card (F5).** One mandate line per team, and a strength rank for fictional teams. Impact: newcomers pick a save that fits what they want, as in FM and MyNBA.

### 6. How I tested, and what I couldn't verify

**Profiles played** (Playwright at 390×844, each a fresh profile):

- **a** (default, reading nothing): 7 taps to tip-off. Watched Q1 with the coach marks, took the staff's Q1 call, skipped to clutch time, then simmed to the final. Quick-simmed to 0-4, then `Sim 1 week` to 0-7.
- **b** (followed the guide): swapped a starter, kept the playbook, added the counter, watched live with a timeout and a sub, skipped to the half, then to the final. All 4 guide steps done, then two weeks simmed to 1-7.
- **c** (Nets on Hard): Owner page, quick-simmed opener, two weeks to 1-7.
- **d** (fictional Pacers on Easy): two weeks to 3-4. Also checked the picker, the Instructions tab and glossary search.

**Headless runs:**

- `startrec.ts`: 8 Wizards seasons as user.
- `projbias.ts`: 4 Wizards seasons on Normal and 3 on Easy, plus 4 Orlando seasons tracking the AI Wizards.
- `tac.ts` / `tac2.ts`: compared the Wizards' tactics and record under user vs AI control.

**Code read:** `agenda.ts`, `newLeague.ts`, `calls.ts`, `weekCall.ts`, `gamePlans.ts`, `games.ts`, `simCore.ts`, `difficulty.ts`, `FrontPage.tsx`, `PreviewTab.tsx`, `CoachMarks.tsx`, `glossary.ts`, `gameReport.ts`.

**Not verified:**

- Teaching turned off.
- A full live game at 1× (by extrapolation, about 7-8 minutes).
- Why the sim didn't stop for the injury card (F11).
- The root cause of the Wizards' forecast miss (injuries are my best guess; this needs the sim-credibility lens).
- Tablet layout and the native shells.

Wall-clock times were taken under load from ten reviewers. Taps are counted exactly; seconds are approximate. Time to first tip-off is about 60-90 s with my script's pauses, so likely 45-60 s for a real player.

**Compared with the genre:**

- Basketball GM reaches game 1 in about 4 taps and shows team strength in its picker.
- MyNBA shows team ratings.
- Football Manager shows board expectations before you take the job, then gives preseason friendlies to learn in.

Hoops Career beats all three at teaching _why_ in game 1. It falls behind them at the first-week contract: what you were promised, and whether the team can deliver it.
