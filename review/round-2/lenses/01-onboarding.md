# Onboarding review, round 2: a new player's first hour (first launch to the end of week 1)

All screenshots are in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/3ab7e56a-18a1-4267-8218-da731c128be7/scratchpad/review/onboarding/shots/`. Below I write `shots/<name>.png` for a file in that folder. Profile prefixes: pa = (a) default flow, pb/pe = (b) followed the guide, pc = (c) Bulls on Hard, pd = (d) fictional league on Easy, pf = Nets on Hard, op1-4 = four extra openers.

## 1. Verdict

Getting started is now quick and clean.

- **Default flow:** 7 taps from launch to the first possession: New league, Choose your team, Take over, Start career, Start regular season, Watch & coach, Tip off. The intro then tips off by itself after 9 s. Building the league took 308 ms.
- **Guide flow:** about 21 taps, plus one quarter watched (52 s at 4×).
- **What now works:** the default team is a sensible mid-table side, the guide has coach marks and a handoff note, the plan step names a measured counter, and the owner's voice is consistent.

The weak spot has moved. It is no longer "where do I tap". It is "can I trust what the staff and the numbers tell me in week 1".

- The staff's default playbook ranks below other options by the staff's own read. A week later the staff says that default (Blitz) is costing points.
- The plan step's only button is the "no plan" choice.
- The core words "counter", "luck", "Keys", "Fluid" and the playbook and role names are missing from the glossary.
- The morning after a first-night blowout, Today shows "Postseason 9%" when the owner asked for the play-in. My two live openers were lost by 33 and 31, and the report put 29 and 25 of those points down to luck.

**The most likely moment a newcomer quits:** the Today screen after game 1. They see a 30-point loss called "luck, not the plan", playoff odds that fell from 28% to 9% overnight, and an owner goal already marked "Behind".

**Score: 7/10** (up from 6.5). The mechanics of onboarding are now good. What's left is trust and teaching.

## 2. What's genuinely great (protect these)

- **Start → New League:** three steps. The default is now the Hawks: 20th-ranked roster, 15 players, under the tax. Both screens are calm (`shots/pa-01-launch.png`, `shots/pa-02-team-step.png`).
- **Owner goals in Today's hero on day 0, in the owner's own voice.** "I'll set the final numbers on opening night, from the roster you open with." The Owner page shows "Final on opening night · His read of the roster: 23 wins" (pf). There is no "On track" at 0-0 any more.
- **The guide's plan step now names a measured counter.** "Add the staff's counter, Turn up the pressure (about +2.6 a game)". Each row shows its familiarity cost before you add it ("−7% familiarity tonight: new to this team"). When nothing beats your playbook it says so honestly (`shots/pb-02-plan1.png`, `shots/pa-02-live-1.png`).
- **The first live game.**
  - Three coach marks cover the court tap, Lineup/Staff and Timeout (`shots/pa-04-tip1.png`).
  - The "Bench" tab is now called "Staff".
  - The intro tips off by itself after 9 s.
  - The step ticks only after your own move, or a quarter watched in full (`agenda.ts:157-171`).
- **The quarter and post-game reports.** "What's deciding it" gives points per factor. "Your moves: too close to say tonight (−0.1, about ±0.8) … played 200 times with 2 moves and without" is the owner's honesty rule shown to a newcomer in game 1 (`shots/pb-03-report.png`).
- **The handoff note after the guide.** "Most days: play or sim to the next game. The staff covers the rest. Before a big game: add the staff's counter… Once a month the owner checks his goals."
- **The weekly call card** is clear and safe: "The staff's counter: Ice coverage, about +1.5 a game (measured). Unanswered, the staff puts it in on game day." with buttons "Put it in" and "Keep your plan" (`shots/pe-02-weekcall-full.png`).
- **"Start regular season" now lands on the morning of opening night**, and Accept on a trade asks you to confirm it.

## 3. Findings (most severe first)

**F1. The staff's default playbook is not the staff's best, and the staff later criticises it (P1)**

- **What the player sees:** the welcome mail says "Your staff has set a rotation and a playbook that fit it." Then "Pick a style" ranks the alternatives above the staff's own pick, by the staff's own read:

  | Team                    | Staff's pick                | Ranked above it                  |
  | ----------------------- | --------------------------- | -------------------------------- |
  | Hawks                   | Balanced Attack (3rd)       | Five-Out +0.7, Pace & Space +0.4 |
  | Hawks defence           | Blitz (5th of 7)            | 2-3 Zone +0.6, and three others  |
  | Bulls                   | Hub Big (5th), Switch (4th) | —                                |
  | Fictional Hawks defence | Hedge (4th)                 | —                                |

  (`shots/pb-01-change.png`)

- In week 2 (pe), Today's "From your staff" says "Blitzing is costing you. It gives up 1.5 points a game… [Stop trapping]". That is the staff criticising its own default (`shots/pe-02-weekcall-full.png`).
- Five-Out Motion and 2-3 Zone come out top for every roster I checked (4 rosters). That is a cross-lens note for the tactics review.
- **Why it matters:** the first thing a newcomer learns about the one staff voice is that it contradicts itself. That breaks the owner's "measured or labelled" honesty rule at the very first choice.
- **Fix (S/M):** make the default the top of the staff's own measured list, after familiarity. If it isn't, label the gap in one line: "Kept for familiarity: Five-Out reads +0.7 once learned."

**F2. The plan step's only button is the negative choice (P1)**

- **What the player sees:** the strip says "Add the staff's counter, Ice coverage (about +0.5 a game), or go in with no plan." Its single button is "No plan this time". Adding the counter means scrolling to the Counters card and finding its "Add" (`shots/pb-02-plan1.png`, `shots/pf-01-counters.png`).
- **Cause:** `Matchup.tsx:104` always renders `keep="No plan this time"`.
- **Fix (S):** when `best` exists, make the primary button "Add Ice coverage" and the secondary "No plan".

**F3. Today's "Postseason" figure doesn't measure the owner's goal, and it swings hard after game 1 (P1)**

- **The swing:**
  - Opening night: projected 37-45, playoffs 28%; the matchup said "Playoff odds 31% with a win, 27% with a loss".
  - After one 33-point loss (plus a 10-game groin strain to Alexander-Walker): projected 31-51, and Today showed "Postseason 9%" (pa).
  - Cause: one game carries 1/16 of the weight (`projection.ts:20` PRIOR_GAMES=15, `odds.ts:129`). One −33 game moves the projection by about 5 wins.
- **The mismatch:** Today's cell is `reach[0]`, which means making the playoffs, including winning through the play-in. The owner's goal is "Reach the play-in". In the forecast table that was Top 6 3% + Play-in 18%, about 21%, not 9%. Pb at 3-3 likewise showed "Postseason 11%".
- **Why it matters:** the newcomer reads "my season is gone" on day 2, while the actual goal is about 1 in 5.
- **Fix (S):** while a play-in goal exists, label the cell by the goal ("Play-in 21%"). Add one line on the first big drop: "One game moves this a lot early."

**F4. The opener can be a 30-point loss explained as luck (P1, cross-lens with sim credibility)**

- **What I saw:** both live openers (Hawks at Orlando) were lost by 33 and 31. The staff line was "Never in it… that part was luck, not the plan" (−28.8 and −24.5 pts of shot-making luck), even though the Hawks "got the better looks (+9.8 / +10.1)" (`shots/pa-02-final.png`).
- Four quick-simmed openers finished W12, L14, L3, W3, with luck lines up to +21.6. So these were bad draws, not a fixed outcome. But ±20-point "luck" lines are common.
- **Why it matters:** the first result decides whether "tactics matter" feels true.
- **Fix (M):** with teaching on, frame the first loss: "Over 200 replays this game is about a 6-point loss; tonight's shooting made it 33." Ask the sim-credibility reviewer to check the size of the luck term.

**F5. Picking a team is still blind to the job (P1, open since round 1 F4)**

- **What the player sees:** the step-2 poster shows roster rank and the top three players only. Mandates appear only after Start career:
  - Bulls: "Win about 27 games · 6,900 young minutes · profit $22.5M"
  - Nets on Hard: "Win about 26 · His read: 23 wins"
  - Fictional teams still show only "Large market" (`shots/pc-01-pick.png`).
- The Nets' Owner page says "Win-now · wants results this season" while the goals are a rebuild ("one season without the playoffs"). The persona and the mandate contradict each other on day 0.
- **Fix (M):** add one mandate line to the poster. Generate or seed fictional strength so tiles can show a rank. Make the owner persona agree with the mandate.

**F6. Core jargon is missing from the glossary (P2)**

- I searched the Today Glossary. No result for: "counter", "luck", "Keys", "closer", "Fluid", "measured", "play-in", "impact", "Heliocentric", "Glue", "Movement" (Shooter).
- That covers the guide step's own key word, every playbook name, the offensive roles, the familiarity bands, "Keys to the game" and the "looks worth / luck" model behind every report.
- **Fix (S):** about 25 entries, linked with `Term` on Tactics, the picker, CountersCard and the report's luck line.

**F7. The staff's auto counter ticks the newcomer's guide step (P2, bug)**

- **What I saw:** in pc I never opened a plan. The week-1 call was auto-taken ("vs NYK: the staff put in Ice coverage"), and the guide went to "1 of 4 done: Plan for your opener ✓".
- **Cause:** `gamePlans.ts:136-137` pushes 'scout' when any plan is used up, and `agenda.ts:166` checks any plan. Neither looks at who made the plan.
- **Why it matters:** this contradicts the guide's promise: "ticks off when you've made the call, not when you've looked."
- **Fix (S):** tag plans made by the staff and ignore them for the guide.

**F8. "Coach a game live" fails silently when you skip ahead (P2)**

- **What I saw:** in pa I watched the intro, then "Skip ahead → End of Q1", read the report, and simmed to the final. The step stayed unticked, and nothing said why (`guideAfterLive` needs a quarter watched in full).
- The live screen still has no guide strip (GuideStrip is mounted only on Rotation, Tactics and Matchup).
- **Fix (S):** add a one-line strip on /live while the step is open: "Watch a quarter or make a move to finish the guide."

**F9. Day-one trade offers are still Accept/Turn down on Today with no staff view (P2, round 1 F10 still open)**

- Examples:
  - "CHA want Flemings for Salaün + 2 picks". Flemings is a teenage rookie, and the owner's goal is young players' minutes.
  - "NOP want Finney-Smith + 4 picks for Jones", two firsts, on opening night (pb).
- The trade screen has "Fair value / A little short" verdicts, but the Today card (`shots/pq-02-after-accept1.png`) has no verdict, ages or POT.
- **Fix (S):** hold AI offers during the guide weeks, or put the staff's verdict on the card.

**F10. The huddle has no advice when the problem is fixable (P2)**

- **What I saw:** at the first timeout (down 15, key "Get back in transition: on pace for 53, goal ≤15, Behind") the huddle said only "They're +12 in the paint" plus a luck line (`shots/pb-01-timeout.png`).
- The fix was there, under Game plan → Transition → "Sprint back", but nobody pointed to it. All game the staff said "Nothing the staff would change right now."
- **Fix (S/M):** when a key is behind and maps to a setting, the huddle should name it as a one-tap call.

**F11. The post-game "Your plan" shows a bad night beside a positive measured value, with no bridge (P3)**

- Example: "Ice coverage · Tonight: ORL pick-and-roll 1.77 a trip… league's 1.18 · Worth +0.5 a game".
- **Fix (S):** add one clause: "a bad night for it; over many games it's worth +0.5".

**F12. Guide strips sit below the hero on Tactics but above it on Rotation, and "Keep" doesn't move you on (P3, round 1 F7 partly open)**

- After "Keep these five", you stay on Rotation and must go back to Today yourself.
- **Fix (S):** after a Keep, offer "Next: Pick a playbook →".

**F13. Picking Five-Out Motion leaves the shape at "4-Out, 1-In" with "Familiarity 97% Fluid" (P3, cross-lens)**

- The list had just said "88% familiar" (`shots/pb-02-after-done.png`). A newcomer reads that as nothing changed.

**F14. "No game plan yet" is still a red pill on every game in week 1 (P3, round 1 F6 partly open)**

- It contradicts the handoff note's "The staff covers the rest" (`shots/pa-01-after-start.png`).

**F15. Copy and layout nits (P3)**

- "Down 9 after one having lost the 1st 31-22."
- "Revenge night: Finney-Smith faces the Rockets": his rotation target is 0 minutes.
- Step-3 difficulty values run together ("−1 to −5 1 yr") and still have no plain sublabels.
- Counter names wrap into three lines ("Turn up / the / pressure") under the dock.
- The completed guide's "Got it" card still counts as "1 need you".
- A reload in the middle of Q1 restarted the live game from 12:00, though it was kept at a timeout or a break (round 1 F12, partly open).

## 4. Since the first review

| Round 1 finding                                           | Status                     | How verified / what remains                                                                                                            |
| --------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| F1 Live game has no teaching                              | **Mostly fixed**           | Coach marks, "Staff" tab and the stricter tick all seen. Remaining: no strip on /live (F8), and the huddle gives no advice (F10).      |
| F2 Plan step leads into a hidden penalty                  | **Mostly fixed**           | Measured counter named, familiarity cost inline, "Always" neutral, measuring copy fixed. New issue: no Add button in the strip (F2).   |
| F3 Knicks default                                         | **Fixed**                  | Default is now the Hawks (`newLeague.ts` `defaultTeam`).                                                                               |
| F4 Team choice blind to the mandate                       | **Open**                   | F5.                                                                                                                                    |
| F5 Owner goals dishonest on day 0                         | **Fixed**                  | "about 39" became "39", owner voice fixed, "Final on opening night". New: persona contradicts mandate (Nets "Win-now").                |
| F6 No handoff note                                        | **Fixed**                  | "A normal week" mail and card. The red "No game plan yet" remains (F14).                                                               |
| F7 Jargon, glossary gaps                                  | **Open**                   | F6. EPM is gone.                                                                                                                       |
| F8 Staff default not best                                 | **Open, now more visible** | Staff numbers sit next to it, plus "Blitzing is costing you" (F1).                                                                     |
| F9 Empty taps, two Tip offs                               | **Fixed**                  | 7 taps; the intro auto-tips.                                                                                                           |
| F10 Day-0 trade offers                                    | **Partly**                 | Confirm added. Still no staff view, no ages, not held during the guide (F9).                                                           |
| F11 Edit ends assistant management                        | **Partly / not verified**  | Injured minutes go to the healthy players (`Rotation.tsx:116`). No toast seen.                                                         |
| F12 Live progress lost                                    | **Partly**                 | Kept at timeouts and breaks; lost mid-quarter.                                                                                         |
| F13-F16 copy, revenge, difficulty labels, fictional names | **Mixed**                  | Double period fixed. Revenge and difficulty-label issues remain. Fictional names are mostly generic ("Rui Watanabe" is close to real). |

**New this round:** F1 (now visible as a contradiction), F2, F3, F4, F7 (bug) and F8.

## 5. Top 5 moves

1. **Make the staff's day-0 picks agree with its own numbers (F1).** Expected impact: the first impression of the one staff voice becomes trustworthy.
2. **Give the plan strip an "Add <counter>" primary button (F2), and add the 25 glossary entries (F6).** Expected impact: the guide teaches the core lever and its vocabulary.
3. **Label Today's odds cell by the owner's goal and soften early swings (F3).** Expected impact: removes the day-2 "season's over" moment.
4. **Show the owner's mandate on team selection and fix the persona clash (F5).** Expected impact: newcomers choose a save that matches what they want.
5. **Fix the guide's integrity issues and frame the first loss (F7, F8, F4).** That means a staff-made plan doesn't tick the step, a strip on /live says what counts, and a big first loss gets the "replays say −6" line. Expected impact: the first loss teaches instead of repels.

## 6. What I couldn't verify, and how I tested

**How I played:** six fresh Playwright profiles at 390×844 (phone), plus four quick-sim opener profiles.

- **(a) default Hawks, no reading:** watched the opener live with an "End of Q1" skip, then quick-simmed to 1-5.
- **(b) guide followed:** kept the rotation, switched to Five-Out, added Ice, watched Q1 at 4×, took a timeout, changed to Sprint back, simmed to the final, then played week 1 to 3-3. A copy of this save (pe) reached the week-2 call.
- **(c) Bulls on Hard:** 4-1.
- **(d) fictional league on Easy:** 2-3.
- **Nets on Hard:** checked the owner page and the counters.

**Also inspected:** inbox, glossary search, Owner page, Odds and standings, trade offers, player page, a rotation row sheet.

**Code read:** `agenda.ts`, `weekCall.ts`, `gamePlans.ts`, `Matchup.tsx`, `FrontPage.tsx`, `odds.ts`, `projection.ts`, `CoachMarks.tsx`, `glossary.ts`.

**Not verified:**

- Teaching off.
- The guide's day-21 expiry.
- The rotation-edit toast (F11).
- 1× pace beyond 15 s.
- Tablet layout and the native shells.
- Whether ±20-point luck lines are well calibrated; that needs a headless sample by the sim-credibility reviewer.

**Comparison with the other games:**

- **Football Manager:** shows board expectations on the job card. The weak spot here (F5).
- **Basketball GM:** reaches game 1 in about 4 taps with no guide. This app is now close at 7 and teaches more.
- **NBA 2K MyNBA:** gives team difficulty ratings on selection. Missing here.
