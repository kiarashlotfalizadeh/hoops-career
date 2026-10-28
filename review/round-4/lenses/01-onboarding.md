I couldn't write `REPORT.md`: the harness blocks report files from subagents, so the full report is below. The playthrough scripts, screenshots and `study.jsonl` are in my scratch folder, and I deleted all browser profiles.

# Onboarding review, round 4: first launch to the end of week 4

Lens `onboarding`. Screenshots are in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/1432d099-c3e8-46a9-bd36-274882ec0af2/scratchpad/review/onboarding/shots/` (written `shots/x.png` below).

Headless data is in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/1432d099-c3e8-46a9-bd36-274882ec0af2/scratchpad/review/onboarding/study.jsonl`, made by `study.ts`, `fict.ts` and `sched.ts` in the same folder.

Everything ran at 390×844 in fresh Playwright profiles, with ten reviewers sharing the machine.

## 1. Verdict

A newcomer now gets a fair first contract. The default team (Washington, "21st of 30") is projected at 31.6 wins. Its owner asks for 30-34, and it actually wins 34.9 on average (n=12, sd 5.3), meeting the win goal in 10 of 12 seasons. Round 3's P0 is gone.

The first ten minutes are still the best in the genre for a sim this deep:

- 7 taps to tip-off, and the league builds in 0.37 s.
- The guide puts a strip on the screen where each choice is made.
- The first live game takes about 90 s a quarter at 2×, with three coach marks.
- The opener's report is honest: "One night's shooting swings a game either way…".

What holds the score down is the stretch after that:

- **Weeks 1-3 with the default team are usually a losing run.** At 15 games it is 5.6-9.4 on average, and 11 of 12 seasons are under .500.
- **The first decisions are dense.** In week 1 a youth-minutes card arrives as one long paragraph of numbers.
- **The team poster is wrong once you pick a difficulty.** It shows Normal's owner asks even if you then choose Easy or Hard.
- **Difficulty barely changes the first season for the default team,** and on Hard the owner asks the least.
- **No glossary links on the first-hour screens:** 0 linked words on Today, Tactics, Rotation, Owner or Office.

**Score: 7.5/10** (round 3: 6.5). The first-week contract is now true and the round-3 copy fixes landed. It falls short of 9 on teaching the words where they're read, on protecting the first three weeks, and on presets that mean something.

## 2. What's genuinely great (protect these)

- **The team poster now shows the job.**
  - It reads "Owner: 31 wins · rebuild · builder", plus the roster rank ("21st, roster of 30") and the top three players (`shots/03-team-step.png`).
  - Fictional teams get a strength rank too (`shots/40b-fict-team.png`).
  - With the same league id, the preview matched the welcome mail in all 28 headless seasons, and was within 0-2 wins of the opening-night goal.
- **A default team that keeps its promise.** WAS on Normal: projected 31.6, goal 30-34, actual mean 34.9 / median 37, win goal met 10/12.
  - Owner fairness holds on the other presets: met 6/6 on Easy and 6/6 on Hard.
- **The guide.**
  - It's called "Your first games · 0 of 4 done", with strips on Rotation and Tactics ("Keep these five", "Keep this playbook") (`shots/07-rotation.png`).
  - The plan step is honest: once it has measured the counters, it says "None of the staff's counters beats your playbook tonight: go in with no plan."
  - It finishes with "Your first games · all 4 done · Most days: play or sim to the next game. The staff covers the rest." That card no longer counts as a "need you" (`shots/33-today-after-game.png`).
- **The owner page explains itself.** "He expects more than his read of this roster: win 33 games … His read of the roster: 31 wins · Behind his read", and the youth goal as "About 123 minutes a game" (`shots/20-owner.png`).
- **The first live game.**
  - The starting-lineups intro, then three coach marks ("Timeout: stops play so you can sub and change the plan.") (`shots/25-live-0.png`).
  - The Q1 report says "Measured 4 changes from the end of Q1: none clears the noise. Nothing to change." and splits the margin into luck (+7.5 "shots fell") and scheme (−3.5 "zone clogged driving lanes") (`shots/25-live-7.png`).
- **The first final.**
  - Headline "Wizards beat Bucks for their new coach's first win", a player of the game, and a "first win" moment.
  - "Your moves" now says the raw numbers are raw: "Below, each move's trips since and before it, as counted: raw, not measured." (`shots/31-final.png`).
- **The weekly "While you were away" digest explains a slump.**
  - "2-5, as the staff reads it: outscored by 4.0 a game. About 3.2 a game of it is shots that didn't fall (luck, not the plan); Anthony Davis, Trae Young, AJ Dybantsa and others have missed 5 games hurt between them … The forecast … has you at about 32 wins."
  - This is exactly the slump line round 3 asked for.
- **Today's "Out:" line** ("Out: Coulibaly 8 games, Davis 2, Young 1, Sarr 1"), and the difficulty "?" sheet, which explains every column (`shots/41-diff-help.png`).
- **Speed:** a sim week takes 1-3 s in the UI, even under load.

## 3. Findings (most severe first)

**F1. Difficulty presets barely change a newcomer's first season, and on Hard the default owner is the most lenient (P1)**

- **What the player sees:** they pick Hard expecting a tougher owner. For the default Wizards they get "Win 28 games" with a failure floor of about 23 wins. Normal gives "Win 30" with a floor of 25. Easy gives "Win 33-34" with a floor of 24.
  - So Easy asks for more wins than Normal, and Hard asks for the fewest.
- **Evidence** (opening-night goals; every seed has the same pattern):

  | Preset | Win goal | Floor                | Projected | Actual wins (mean) | Goal met |
  | ------ | -------- | -------------------- | --------- | ------------------ | -------- |
  | Easy   | 33-37    | .294 (24.1 wins)     | 35.0      | 37.5 (n=6)         | 6/6      |
  | Normal | 30-34    | .300 (24.6 wins)     | 31.6      | 34.9 (n=12)        | 10/12    |
  | Hard   | 28-31    | .278-.289 (≈23 wins) | 29.4      | 35.8 (n=6)         | 6/6      |
  - The difficulty help promises "a higher floor under his win goal (Easy .250, Normal .300, Hard .350)".
  - The floor is capped at the owner's read minus a margin (`src/core/league/ownerGoals.ts:676-677`), so for this team Hard's floor ends up _below_ Normal's.
  - The Hard on-court edge for a lottery roster is about 1 point (`difficulty.ts:120-129`), which projects about 2 wins lower. That is within the noise of what I measured (+0.9 ± ~2.6).

- **Why it matters:** the preset is the newcomer's one stated choice about challenge. For the team most newcomers play, Hard's only real bite in season 1 is "Owner waits 1 yr", and the help copy says something the numbers don't do.
- **Recommendation:**
  - (S) Make the help copy honest.
  - (M) Make Hard's year-1 ask and floor at least Normal's, so the order of the presets shows on the Today hero.
  - Cross-lens: `stakes`.

**F2. The first 15 games with the default team are a losing streak in almost every save (P1)**

- **What the player sees (my UI run):** 2-2 after week 1, 2-5 after week 2, then a 7-game skid to 2-9.
  - Owner mail "Six straight losses" arrives in week 3.
  - Today says "Postseason 4%".
- **Evidence (12 headless seasons, Normal, staff-managed):**
  - Day 14: 2.5 wins in 7 games on average.
  - Day 28: 5.58 wins in 15 games; 11 of 12 seasons under .500.
  - Over the rest of the season they win at .437, and finish at a 34.9 mean.
  - The real schedule front-loads them: the first 15 opponents average 43.3 projected wins, against 40.9 for the rest, with 7 home games (`sched.ts`).
  - The owner page's pace projection whipsaws: 0-7 and 1-6 starts read "proj 24-25 · behind", and those seasons finished 37, 38 and 38.
- **Why it matters:**
  - The forecast is now honest over the season. It even undersells WAS by about 3.4 wins (≈2.4 standard errors).
  - But the newcomer lives the first three weeks, not the season. Round 3's 1.5 wins in 7 is now 2.5, which is better but still a losing run.
  - The owner's losing-streak mail lands during the guide weeks (`agenda.ts:195`, day < 21).
- **Recommendation:**
  - (S) During the guide weeks, show the record with the projection beside it ("2-9 · still projected 32: tough early schedule").
  - (S) Hold the owner's pace mail until game 15.
  - (S) Mention a front-loaded schedule on the poster or in the welcome mail.
  - (M) Shrink the owner page's early pace projection toward the opening forecast harder in the first 15 games.

**F3. The team poster shows Normal's owner asks even when you then pick Easy or Hard (P2)**

- **What the player sees:**
  - Thunder: the poster says "Owner: 65 wins · Finals · builder". After choosing Hard on step 3, Today says "Win about 56 games · Win a playoff round".
  - Nets: the poster says "Owner: 26 wins · rebuild". After choosing Easy, Today says "Win about 29 games".
  - (`shots/50-Thunder-Hard-poster.png`, `shots/51-Thunder-Hard-today.png`.)
- **Cause:**
  - The preview is keyed on the difficulty (`NewLeague.tsx:91`), but difficulty is picked on step 3, after the team step.
  - Step 3's card has no owner line, so nothing ever shows the corrected asks before Start career.
- **Recommendation (S):**
  - Show the owner line on the step-3 card, and recompute it live as the difficulty changes (the preview builds in about 0.6 s).
  - Or move Difficulty to step 2.

**F4. In a fictional league the default team is a random draw, from champion to worst (P2)**

- **What the player sees:** the fictional team step pre-selects "Wizards · 29th of 30 · Owner: 23 wins · rebuild · frugal" (`shots/40-fict-team-early.png`).
- **Evidence:**
  - `defaultTeam` reads the _real_ seed's ranks for both kinds of league (`src/ui/newLeague.ts:57-66`, `NewLeague.tsx:107`).
  - Over 20 fictional seeds, the default team's rank ran from 1st to 30th (mean 15.3; 6 in the bottom ten, 6 in the top ten), with owner asks from 26 to 64 wins.
- **Why it matters:** a newcomer who taps through gets a random job. Round 3's calibration work was done for the real league only.
- **Recommendation (S):** pick the fictional default from the preview's own ranks: the middle rank, with a legal roster under the tax.

**F5. The first-hour screens still link no glossary words (P2, round-3 F7 still open)**

- **Evidence:** 0 `.term` elements on `/`, `/team/tactics`, `/team/rotation`, `/office/owner` and `/office`.
- Meanwhile the first hour shows:
  - "WAS 70.6% eFG on looks worth 54.4%" and "+0.6 to the margin (±0.4)… 320 replays each way"
  - On one Tactics screen: "Heliocentric · 2-3 Zone · 97% fluid · 4-Out, 1-In · Rim Runner 4★ · Glue Guy · Post Hub · Crowded paint · Stretch Big"
  - On the final: "Your moves: too close to say tonight (−0.3, about ±0.7) … WAS 8-8 since (0); outscoring them by 0.63 a trip before."
- The Glossary has all of these words (21k characters), but it sits at the bottom of Today.
- **Recommendation (M):** auto-link the first glossary term in staff lines, report lines and Tactics labels while Teaching is on.

**F6. Week 1's first real decision is a paragraph of numbers (P2, round-3 F2 partly fixed)**

- **What the player sees:** at game 4 a card arrives with:
  > "34 more minutes a game for the young players? It costs 1.9 pts a game (≈ −5% to win, measured @ CLE): about 0.5 wins over 10 games. It adds 340 of the owner's minutes: on pace for 10,333 of his 10,100, not 9,993…"
- **What improved:** the rebuild/odds call no longer fires at game 7. None appeared in 4 UI weeks or in 12 headless months.
- **Why it matters:** it's an honest choice, but it's six numbers in four units (points, %, wins, minutes) for someone 15 minutes in.
- **Recommendation (S):**
  - While Teaching is on, lead with one plain line ("Play the kids more? About half a win over 10 games; puts the youth goal on track").
  - Put the arithmetic under "Details", or hold optional cards until the guide is done.

**F7. AI trade offers still arrive in the guide weeks, with only the other GM's quote on the card (P2, round-3 F10 still open)**

- **What the player sees:** in week 2, Today shows "CHA want Johnson for Steinbach + 2 picks · 'Johnson would fit right in…' · [Accept] [Turn down]".
- Johnson is the 20-year-old 76/83 prospect.
- There is a confirm (`agenda.ts:449`), but no staff read of value before it.
- **Recommendation (S):** hold AI offers until `guideWeeks` ends, or add the staff's read as the row's meta line.

**F8. On Tactics the guide strip is below the fold, under a staff default that warns about itself (P2)**

- **What the player sees:** tapping "Pick a playbook" lands on the court diagram. The "Keep this playbook" strip is off-screen behind the play bar (`shots/11-tactics-viewport.png`).
- Under it, the staff's own default shows:
  - "Davis → Coulibaly · Weak"
  - "Crowded paint · Fix: a Double Post [Double Post]", with no measured worth
  - F grades in Perimeter D and Spacing (`shots/09-tactics.png`)
- This contradicts the welcome mail: "Your staff has set a … playbook that fit[s]".
- **Recommendation (S):**
  - Put the strip above the board, as on Rotation.
  - Have the staff own any warning on its default ("measured −0.2; kept for Davis's post game").

**F9. "Keep" leaves you where you are, and nothing moves you to the next step (P3, round-3 F17 still open)**

- After "Keep these five" the URL stays `/team/rotation`; after "Keep this playbook" it stays `/team/tactics`.
- **Recommendation (S):** turn the strip into "Done · Next: Pick a playbook →".

**F10. A starter the newcomer never cleared sits the opener (P3, round-3 F13 still open)**

- Matchup says "AJ Dybantsa · Clear to play · Sits unless you clear him" (`shots/23-matchup.png`). Today only says "Dybantsa questionable".
- **Recommendation (S):** default to the staff's call, or put the clear button on Today.

**F11. The Today hero's youth goal is still a season total (P3, round-3 F17 still open)**

- Today reads "about 10,100 minutes for players 23 or under", while the Owner page says "About 123 minutes a game".
- **Recommendation (S):** use the per-game line on the hero.

**F12. The welcome's number moves on opening night (P3)**

- The welcome mail says "Win about 34"; the opening-night goal is "Win 33".
- Headless, the goal was one below the preview in 15 of 28 seasons.
- **Recommendation (S):** round the welcome the same way, or give a range.

**F13. Copy nits a newcomer trips on (P3)**

- Rotation's first card reads "Targets 241 · min, scaled to 240": the staff's own default doesn't add up.
- The live Staff tab says "1 calls waiting".
- The next-game row "Game 16 of 82 · 11-2" shows the _opponent's_ record, which reads as yours.
- In week 1 the play sheet's "next big night" is a revenge game in March, five months away.
- The matchup hero wraps to two lines under "Matchup ›" (`shots/62-today-day35.png`).
- Step 3's Hard row still runs together: "−1 to −5 1 yr".
- The dead "(Tactics → Players)" advice path is still there (`gameReport.ts:695`).
- Fictional rosters show "—" for every stat before the season, and one roster has both "Joel Mbappé" and "Ralph Mbappé".

**F14. A contender newcomer is asked for a 65-68-win season (P3, note)**

- OKC: goal 65-68 wins plus the Finals, against a 66 projection.
- They won 63-73 and the title in 4 of 8 seasons, but met the win number in only 4 of 8.
- Grading is continuous, so a 63-win title season isn't a failure. Still, Today said "behind" at 11-3 or 12-2 in 3 of 8 seasons at day 28.
- **Recommendation (S):** state the contender's win goal as a band.

## 4. Since round 3

| Round-3 finding                      | Status             | How I verified it                                                                                                                                                                                |
| ------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1 Default team a trap               | **Fixed**          | 12 Normal seasons: projected 31.6, actual 34.9, goal met 10/12. New problems: the early slump (F2) and the presets (F1).                                                                         |
| F2 Game-7 quit moment                | **Partly fixed**   | No rebuild/odds call in 4 UI weeks or 12 headless months, and the digest now explains luck and injuries. The youth card is still dense (F6), and the owner's losing-streak mail comes in week 3. |
| F3 Advice repeats your plan          | **Not reproduced** | n=1.                                                                                                                                                                                             |
| F4 Opener injuries unmentioned       | **Fixed on Today** | The "Out:" line works. Not checked in the report.                                                                                                                                                |
| F5 Team step hides the job           | **Fixed**          | Owner line plus a fictional rank. New: it shows Normal's asks whatever preset you pick (F3).                                                                                                     |
| F6 Staff counter ticks the guide     | **Fixed (n=1)**    | The OKC Hard save still showed 0 of 4 at day 14.                                                                                                                                                 |
| F7 Glossary not linked               | **Open**           | F5.                                                                                                                                                                                              |
| F8 Raw vs measured in "Your moves"   | **Fixed**          | The "raw, not measured" line is there.                                                                                                                                                           |
| F9 Guide labels / done card counted  | **Fixed**          | Renamed, and the done card isn't counted.                                                                                                                                                        |
| F10 Trade offers in guide weeks      | **Open**           | F7.                                                                                                                                                                                              |
| F11 Injury card not stopping the sim | **Not verified**   | —                                                                                                                                                                                                |
| F12 Odds under four names            | **Partly fixed**   | Fewer names. A rebuild owner's Today still shows "Postseason".                                                                                                                                   |
| F13 Dybantsa sits unless cleared     | **Open**           | F10.                                                                                                                                                                                             |
| F14 Dead "Tactics → Players" path    | **Open**           | —                                                                                                                                                                                                |
| F15 Revenge game overused            | **Changed**        | Now billed 5 months out (F13).                                                                                                                                                                   |
| F16 Red "No game plan yet" pill      | **Fixed (tone)**   | Now a grey chip.                                                                                                                                                                                 |
| F17 Copy/layout nits                 | **Mostly open**    | F9, F11, the Hard row.                                                                                                                                                                           |

**New since round 3:** the difficulty-preset inversion (F1), the random fictional default (F4) and the poster/preset mismatch (F3).

## 5. What it would take to reach 9/10 in this lens

1. **Make the presets mean something on day one (F1, F3).** Hard asks at least Normal's number and has the higher floor its help promises, and the owner line updates live on step 3. _Impact:_ the one choice a newcomer makes about challenge visibly changes the contract. Today it is invisible or backwards.
2. **Protect the first three weeks (F2, F6, F7).** Show "record · still projected N" during the guide weeks. No owner pace mail, optional cards or AI offers until game 15. Plain-language versions of the first cards. _Impact:_ the near-certain early skid reads as "on plan" rather than "the game is lying to me".
3. **Teach the words where they're read (F5, F8).** Glossary auto-links, a guide strip above the fold on Tactics, and the staff owning any warning on its own default. _Impact:_ the honest, dense numbers become learnable. This is the hook FM and BBGM can't match, but only if a newcomer can read it.
4. **A calibrated default everywhere (F4, F10).** A middle-rank default in fictional leagues, and the staff's call on game-time decisions. _Impact:_ every newcomer who taps through gets a fair job.
5. **Finish the guide's flow (F9, F11, F12).** "Next →" after each Keep, the per-game youth line, one consistent welcome number. _Impact:_ small, but it's what makes the first ten minutes feel designed.

**Genre comparison:**

- **FM:** shows board expectations on the job card and has preseason friendlies to learn in. Hoops now matches the job card and explains the first game better, but has no low-stakes warm-up: game 1 counts.
- **BBGM:** about 4 taps to game 1, a team picker with ratings, and very little jargon. Hoops takes 7 taps and is far deeper, but far heavier on words.
- **2K MyNBA:** team ratings and a soft tutorial. Hoops explains _why_ things happen better, but its presets do less in year 1 than 2K's sliders.

## 6. What I couldn't verify, and how I tested

**Played in the UI (Playwright, phone viewport, fresh profiles):**

- **Real league, default Wizards, following the guide:**
  - The full creation flow, then Rotation kept and the playbook picker opened and kept.
  - The staff counters measured and "Attack Ware" added.
  - The opener live: Q1 at 2×, then a timeout, the Lineup tab, Skip ahead → Sim to final, and the report.
  - Then 4 × Sim 1 week to 6-12 at day 35, with each digest read.
- **Fictional league, default team:** team step, difficulty help, Today, roster.
- **Thunder on Hard and Nets on Easy:** poster vs Today, the Owner page, 2 sim weeks each.
- **Glossary and Settings,** plus a count of glossary links on the first-hour screens.

**Headless (my `study.ts`, using the same id and seed as the team step):**

- Full seasons: WAS on Normal × 12, Easy × 6 and Hard × 6; OKC × 8; BKN × 8. Checkpoints at days 7, 14 and 28.
- The fictional default team's rank over 20 seeds (`fict.ts`).
- The WAS early schedule (`sched.ts`).

**Not verified:**

- Teaching turned off.
- A full live game at 1×.
- Crunch stops in my opener (it was a 28-point rout).
- An in-game starter injury showing in the report.
- Round-3 F11.
- Tablet and the native shells.

**Caveats:**

- Headless seasons run the user's team on staff defaults, with no user moves. The UI run matched them: 2-9 at day 21, 6-12 at day 35.
- Timings were taken under load from ten reviewers.
