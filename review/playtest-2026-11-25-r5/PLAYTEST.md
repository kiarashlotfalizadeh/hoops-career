# Ten-Sonnet playtest, round 5 (2026-11-25)

This round reused the ten personas, the brief and the kit from rounds 1 to 4. The build is main `ee9d0cf`, the round-4 fix round:
- a cap on simultaneous 98s, a usage retune, and star-check extended to 12 seasons
- AI teams keep franchise icons in season 1
- the mid-level is blocked while a cap-space bid is pending
- benching an 85+ star no longer cuts his market price
- free-agency floors for 72-79 players
- "Make it work" protects your core
- one unit for free throws in the report
- no zone call against a strong rebounding team
- a confirm on "Take the job"
- "Sim to end of playoffs" skips the playoff sheets
- a deadline-day stop
- an always-visible Skip ahead with last-2-minutes, final-minute and final-24-seconds stops
- staff calls that hold long enough to read, with Apply on the bar
- rotation edits saved after 150 ms

Every tester started a fresh save on a production build (`vite preview`) in headless Chromium, on a 390x844 phone unless their report says otherwise. The reports are in `reports/` and the brief is in `BRIEF.md`. Round 4's synthesis is in `../playtest-2026-11-25-r4/`.

**Two changes to the setup.**
- The session moved from the desktop to a cloud container with 4 cores shared by ten testers, so the kit was rewritten (same API).
- The per-tester persona prompts weren't saved after round 4, so they were rebuilt from the testers' own descriptions in rounds 1-4: the same ten roles, team types and goals, with different wording.

## Verdict

**Overall 7.90, the highest of five rounds (7.45 → 7.57 → 7.41 → 7.71 → 7.90). Recommend-to-a-friend was also 7.9.**
- Eight testers scored 8 and two scored 7.5 (09 and 10). That's the tightest spread yet; round 4 ran 7.5 to 8.
- All ten would pay $7.99 on phones.
- On $14.99 for Steam:
  - **Yes or probably, with a condition (8):** 01, 02, 03, 04, 05, 06, 07 and 09.
  - **Only if (1):** 08, if the draft classes and aging get fixed.
  - **Not yet (1):** 10, because the desktop is still a stretched phone column.

**The fixes landed where the testers looked:**
- **AI teams kept real stars together.** The purist (08), who lost Curry to Memphis in round 4, didn't report one break-up.
- **The top end held.**
  - In 07's ten seasons, the scoring leader peaked at 38.0 ppg (round 4: a record 40.8 in year 9).
  - star-check over 96 seasons: the leader never passed 37.1 ppg, none were at 40+, and there were no 99s.
- **The regular season pushed back.** The contender (05) won 54, 64 and 53 games, against round 4's 63-66 every year. It was 7-8 after a month and got graded −51 in year 3.
- **"Sim to end of playoffs" ran straight through** for 08.
- **The deadline stop worked.** 03's sims stopped at the deadline.
- **Round 4's exploits didn't come back.**
  - Nobody lost a cap-space bid to a mid-level signing.
  - Benching didn't cheapen a star.
  - "Make it work" never reached for a tester's best player.

**Areas.** Seven of ten rose. Analytics rose most (+0.25, to 7.90, with 9s from 01, 03, 06 and 08). First hour rose to 7.9. Game day fell (−0.33, to 6.56), but that is mostly who coached: four testers coached one or two games each and scored it 5-6. The two who coached 12 and 35 games scored it 7 and 8.

A per-tester change of ±0.5 is still noise, and +0.19 overall is a small step. The steadier signal is that every tester scored 7.5 or more for a second round running, and eight of ten scored 8.

**The top problem is unchanged: coaching measures as noise, and the testers now say the game proves it.**
- 01, about 35 games coached: "−2.8 pts ±1.5 over 10 games … the staff's bench would have done about as well."
- 06: "−2.9 ±1.5 over 6 games"; 3 tactical changes "Costing you" −3.0.

Both praise the audit (analytics 9) and want a move that wins. Game day (6.56), sim honesty (6.75) and rebuild (6.62) are the three lowest areas.

## Scorecard

| Area | R1 | R2 | R3 | R4 | **R5** | Δ R4→R5 | R5 range | Note |
|---|---|---|---|---|---|---|---|---|
| A First hour | 7.3 | 7.55 | 7.35 | 7.8 | **7.9** | +0.1 | 7–8 | Nine 8s. The roster-rank picker, owner goals, the release gate with dead money and the 4-step guide. 09 is the 7: jargon and a checklist that never ticks. |
| B Coaching depth | 7.1 | 7.44 | 6.83 | 6.94 | **7.06** | +0.1 | 6–8 | 8s from 01, 06 and 08, the testers who used the game plan and live panel. The 6s let the assistant run things and still won. |
| C Game day | 6.8 | 7.31 | 6.5 | 6.89 | **6.56** | −0.33 | 5–8 | Who coached: 02, 03, 07 and 10 coached 1-2 games each and gave 5-6. 01 (~35 games) gave 8 and 09 gave 8. Clutch skip "eats" a game (05, 10). |
| D Front office | 7.6 | 7.06 | 7.2 | 7.83 | **7.78** | −0.05 | 7–8 | Eight 8s. FA bidding that names the rival ceiling, trade rules explained. 04 found new CBA gaps (no cap holds, full taxpayer MLE). |
| E Rebuild & dev | 5.9 | 6.06 | 6.38 | 6.57 | **6.62** | +0.05 | 5–8 | 02 gave 8: 30th to the conference finals in four years, owner goals that follow the plan. 08 and 03 gave 5 for aging swings. |
| F Analytics | 7.3 | 7.7 | 7.3 | 7.65 | **7.9** | +0.25 | 6–9 | Four 9s. Box scores reconcile, league means are real, the change tracker grades your rotation edit. Two "looks" numbers still read as a contradiction (verified, see theme 6). |
| G Sim honesty | 6.8 | 7.2 | 6.65 | 6.6 | **6.75** | +0.15 | 6–7 | No top-end runaway. Scores reading hot (140-145, 161, 156) and injuries deciding too much cost points. |
| H Stakes & story | 6.9 | 7.45 | 7.3 | 7.55 | **7.5** | −0.05 | 6–9 | 07 gave 9 again (job market, firing by the owner's stated rule). 05 gave 8 but wants a title ceremony. 06 gave 6 (saw little pressure in 12 games). |
| I UX on device | 7.2 | 7.3 | 7.3 | 7.45 | **7.55** | +0.1 | 7–8 | Offline, backup and resume hold. Two-tap confirms are missed, and tablet and desktop are still a phone column. |
| **J Overall** | 7.45 | 7.57 | 7.41 | 7.71 | **7.90** | +0.19 | 7.5–8 | |
| Recommend | 7.5 | 7.65 | 7.45 | 7.7 | **7.9** | +0.2 | 7–8 | |

Averages count only the testers who scored an area:
- **B and C:** 04 skipped them (GM only).
- **D:** 06 skipped it.
- **E:** 05 and 06 skipped it.

## The ten players

| # | Persona | Team / what they did | J R1 → R5 | One-line take |
|---|---|---|---|---|
| 01 | FM lifer | DAL, 2 seasons: 51-31 and 49-33, two Game 7 losses in round 1; ~35 games coached live, 30+ game plans | 7.5 → 7.5 → 7.8 → 7.8 → **8** | "The game audits me": the best live panel in the genre, and it says my moves were −2.8 ±1.5. |
| 02 | Rebuilder | CHI from 30th: 21 → 28 → 46 (COY) → 50 (conf. finals) → 44 | 7.5 → 8 → 7.5 → 8 → **8** | A real rebuild that pays off in year 3. Then a tax wall a winning team can't trade out of. |
| 03 | Analytics | DEN, 2 seasons: 57-25 (round 2), then 37-45 | 7.5 → 8 → 8 → 7.5 → **8** | Box scores reconcile and the change tracker is unique. A stale year-1 minutes edit silently wrecked year 2. |
| 04 | Capologist | GSW, GM only, 3 seasons: 48-34, 33-49 (#2 pick, 83 → 94), 43-39 | 7.5 → 7.5 → 7.5 → 8 → **8** | The FA bidding is real front-office play. No cap holds and a full taxpayer MLE make the cleverest line one the CBA forbids. |
| 05 | Contender | OKC, 3 seasons: 54 (title), 64 (lost a Game 7), 53 (owner −51) | 7 → 7.5 → 7.3 → 7.5 → **8** | Winning has teeth now. The title arrived as an inbox line, and "Clutch time" can skip a game to its final. |
| 06 | Game-day coach | CHA, 12 games live, 6-6 | 7.5 → 7.7 → 7 → 7.5 → **8** | A real coaching tool that proves its own moves barely matter. The staff's foul-trouble card swaps two bigs ~25 times. |
| 07 | Journeyman | 10 seasons: CHA, LA Cutters (8), fired on purpose, WAS | 7 → 8 → 7.5 → 8 → **8** | Career layer 9 again. Owed picks are hidden when you take a job, and there's no way to clear cap space. |
| 08 | Purist | NYK GM-only (52-30), SAS GM+HC (52-30, Finals), fictional BOS | 7.5 → 7 → 7.5 → 7.6 → **8** | Real rosters feel right and AI no longer breaks them up. Year two has an invented draft class and stars aging fast. |
| 09 | Newcomer | WAS real (28-54, then 47-35 and a series win), fictional WAS (10-7) | 7.5 → 7 → 7 → 7.5 → **7.5** | "I understood why I won." A $20.5M tax hit sat in one grey line, and the jargon is unexplained. |
| 10 | Commuter | BOS, ~45 sittings, 1.8 seasons: title, then conf. finals | 8 → 7.5 → 8 → 7.7 → **7.5** | "The best mobile-GM resume story." Closing mid-sim silently drops the sim, and desktop is a phone column. |

## Fixed since round 4 (as the testers saw it)

- **Real teams stay together in season 1.** 08 named no franchise-star trades; its round-4 complaint was Curry to MEM and Booker to HOU in the first January.
- **The long-save top end holds.**
  - 07's scoring leaders over ten seasons: 33.3, 33.6, 37.0, 33.4, 35.8, 38.0, 35.9, 34.4 (round 4 climbed every year to 40.8).
  - star-check (8 leagues × 12 seasons, run by the lead): leader max 37.1, median 33.2, 0 seasons at 40+, no 99s, stars age out (SGA 96 → 71 by 38).
- **The contender's season pushes back.** 05: 54, 64 and 53 wins; 7-8 after a month of injuries; Topić lost to the tax; −51 from the owner. Round 4 had 63-66 wins every year with no chase.
- **Front-office exploits from round 4 are gone from the reports.**
  - No silent cap-space bid lost to a mid-level signing (02 and 04 both used cap space).
  - No cheap re-sign after benching.
  - "Make it work" built counters with cash and picks rather than a tester's best player (01, 02, 04).
- **Playoffs.** "Sim to end of playoffs" ran through without stopping on each sheet (08). Round 4 had four testers trapped.
- **Deadline.** 03's sims stopped at the deadline. Round 4's "Sim to end of regular season" passed it.
- **Free throws in one unit.** Nobody reported the "−7.8 vs −13" free-throw mismatch. (A different "looks" mismatch remains: theme 6.)
- **Staff zone calls.** No zone recommendation against a rebounding team. Round 4's "2-3 zone: Should help" lost the glass 23-6.
- **Skip ahead is visible.** 01, 05, 06 and 08 used it without hunting for it; 08 called it "great".
- **Still holding:** offline play, backup and restore, and resume (10); no page errors in any session; league means (03: ORtg 116.4 vs DRtg 116.4, eFG 54.2, pace 98.1).

Not reached in play: the "Take the job" confirm (07 took offers but didn't comment), the late-clutch stops (no tester was in a close fourth quarter when they used Skip), and rotation saves (nobody closed right after an edit).

## Themes, ranked

### 1. Coaching is audited honestly, and the audit says it doesn't matter. Major.

The same finding as round 4, from more games:
- **01 (~35 games live, 30+ game plans):** "−2.8 pts ±1.5 over 10 games. 19 tactical changes. Nothing clear in them." Later −2.3 ±1.7, then 0.0 ±1.0. "If the honest answer is that you cannot beat the staff's bench, the depth feels decorative."
- **06 (12 games):** "−2.9 ±1.5 over 6 games"; 47 subs ≈ 0, 15 timeouts +0.9, 8 play calls −0.7, 3 tactical changes −3.0. "Nothing the staff would change right now" sat on nearly every card.
- **02, 07 and 10** let the assistant run the team and still won 50 games or a title. "I could skip nearly everything and still win, which FM never allows" (02).

Testers 01 and 06 both drove the live loop with simple rule-based bots, so a thinking human might do better; neither could prove it. Their asks:
- one spot where a call visibly swings a game, such as a mismatch hunt, a rebounding plan or a foul-trouble gamble (01);
- staff advice that's specific and measurable ("their P&R is scoring 1.35 against drop, switch Reid"), with one-tap apply and a replay figure for each accepted call (06).

### 2. Staff advice: bad deadline deals and a sub card that loops. Major.

- **Deadline cards.**
  - 01: "Trade for Jimmy Butler" for Irving, Gafford and three firsts.
  - 05: "Trade for Curry / KAT" always cost Jalen Williams.
  - 10: "Buy Anthony Davis. The deal should help." for Curry, Simons, two firsts and two seconds, in the same words as a good Curry deal a year earlier.
  - A card that recommends a move should check value, age and the user's window, and say so when it's a bad deal.
- **The foul-trouble sub card loops (06).** Verified:
  - In Q2 the "Tired or in foul trouble" panel (`Trouble.tsx`) flags a player at 2 fouls (`max(2, limit − 1)`).
  - The staff's replacement (`benchFor` in `calls.ts`) only excludes players at the limit (3).
  - So it sends in another big with 2 fouls, who is flagged on the next possession. 06's bot accepted ~25 Reid ↔ Diabaté swaps in one game (`players/06-gameday/game3.log`).

### 3. The cap wall after success, and CBA gaps. Major for 02, 04, 05 and 07.

- **No way to clear cap space.**
  - 02, after a successful rebuild: "Every counter-offer for Buzelis ($30.4M) sent back as much salary as I sent." It ate $43.6M of tax and got −92 on the tax goal.
  - 07: a 98/99 free agent was "Very interested", and no AI team could absorb salary.
  - Both ask for a "salary dump with sweetener" route, or a staff-built tax-clearing deal.
- **No cap holds (04).** Use cap space first (trade or FA), then re-sign your own players over the cap with Bird rights: $48M of space became $205.8M of payroll. This is the sequence the real CBA closes with holds.
- **Taxpayers get the full rules.** The full 8.5% mid-level ($14.0M at $223M payroll) and 125% + $0.3M matching with no taxpayer limit (04).
- **Old stars are overpaid.** Butler (37, expiring, hurt) fetched George and Queta from BOS (04).
- **Waiting out free agency still pays.** Vets lose ~50% of their ask by day 29 (04: Powell $9.7M → $4.3M); 03 found an 80 for $13.2M. The new 72-79 floor slowed this but didn't end it.
- **Spending below the salary floor is free** (04).

### 4. Clutch-time skip finishes the game for you. Major for 05 and 10.

- **What happened:**
  - 10 picked "Clutch time" at Q1 3:33 of a 22-20 game and landed on a final, 117-128.
  - 05 saw 10-point halftime leads become finals "before I could act".
- **Verified, by design.** `useLiveGame.skip` sims to 5:00 left in the fourth. If one side is then 95% to win (`CLOSE_WIN`, about a 10-point lead), it toasts "No clutch time tonight… On to the final" and plays out the game.
- **Why it hurts.** The label promises clutch time, and the coach never gets the comeback attempt.
- **Fix.** Stop at 5:00 anyway, with "Sim to final" offered there.

### 5. Long-run realism: hot scores, injuries, aging, invented drafts. Major for 08, minor for others.

- **Scores read hot.**
  - 06: 140-145, 132-115. 08: the Knicks scored 161 and 156, labelled "franchise records". 01: "110-135 common". 05: 137 and 148 against a top-ranked defence.
  - League means are normal (03), so this is single-game spread, not the average.
  - star-check's team-score max is 168 (mean 157.6 for the season's highest).
- **Injuries decide too much (05).** SGA missed 14 + 8 + 6 + 5 games in S1, was hurt in a home Game 7 and missed 32 games in S3. Each star-check league averages 3.6 injuries of 60+ games a season.
- **Aging is steep.**
  - 08: Curry 87 → 81 in one summer, Brunson 86 → 83 at 31.
  - 04: Holiday −7, Green −6, Queta −3 at 28.
- **The 2027 draft class is all invented in the real league (08).** A real 2026 rookie class sits beside a made-up one a year later. The 2027 FA class topped out at 78.
- **A slight upward drift.** season-test shows league ppg 112.9 → 117.0 in two seasons (03, 07). One generated MVP won five years running (07).

### 6. Analytics: two "looks" figures and stale rotations. Major for 03.

- **Two numbers called "looks" (03).** Verified.
  - The "What decided it" row (`gameReport.ts`) prices shot quality at the two teams' average attempts.
  - "How the margin adds up" (`SummaryTab` `MarginSum`) counts total look points, which include shot volume.
  - So one report reads "better looks +6.3" in the list and "looks −2.6" in the margin. The round-4 free-throw unit fix landed; this is the same kind of overlap under one name.
  - Rename one ("shot quality" vs "looks") or show both on one basis.
- **Stale manual minutes (03).**
  - A year-1 minutes edit carried into year 2 after the roster turned over, leaving Jokić at 21 and Murray at 20.
  - The team went 37-45 and both stars asked for trades.
  - The game warns about bench players with no minutes but not about stars under 28.
- **The series plan's counters stay on "Staff still looking…"** (03, 09, and 01's "Staff still looking"), as in round 4.

### 7. Story beats: the title, owner copy, and luck blamed for your own doing. Major for 05.

- **No title ceremony (05).** A 2-3 comeback with four players out ended in "inbox mail and a history row… the next screen was the draft lottery". The same complaint as round 4.
- **The Champions card mixes opponents (10).** "4-2 over San Antonio" and "Series won · 4-2 over Charlotte", with no round labels.
- **The Today card blamed a slide on luck (07).** It read "That's luck, not the plan" while the user had benched every star, beside a staff note saying "your change seems to have hurt −5.3 a game".
- **Owner copy repeats.** "An honest season from an honest team" appeared four times in a decade (07), and "I didn't buy this team to be in the middle" repeats (08).
- **Owed picks are hidden on taking a job (07).** It learned at the lottery that its #3 pick belonged to PHI.

### 8. Money and words for newcomers. Major for 09.

- **Tax hits are quiet.** A $20.5M tax hit showed as one grey line on the signing sheet, against an owner goal of getting under the tax (09). 05 and 01 read the same line and liked it, so the line is right but too quiet for a newcomer.
- **Jargon.** Bird rights, mid-level, team option, rookie scale and OVR/POT have no tap-to-explain where they appear (09).
- **The first-games checklist stays at 0 of 4** after "Keep these five" and "Keep this playbook" (09), as in round 4.
- **A red "Widen the slider past $X" line** sits under offers that are fine, so it reads like an error (09).

### 9. Flow on a phone. Minor to major.

- **Closing mid-sim drops the sim silently (10).** Nothing is corrupted, but there is no notice on reopen. 10 asks for "Your last sim stopped at Oct 28. Continue?"
- **Two-tap confirms get missed.** Trade Accept → "Confirm: Accept" (05 turned an offer down by accident), release, re-sign "Make offer", and "Open free agency" (02).
- **Live resume is inconsistent.** 10 resumed a few possessions later, 02 resumed at 0-0, and 05's game played on while the screen loaded.
- **Live playback.** The game keeps running while you open Players, Tactics or Stats (01), and speed resets to 1x after every timeout (06).
- **Tablet and desktop are a phone column (10)**, for a fourth round.

## Bugs (deduplicated)

Repro steps and screenshots are in each report's Bugs section. "Verified" means I confirmed it in the code.

**Game day and reports**
- **The staff's foul-trouble sub card ping-pongs** between two 2-foul players (06). Verified, see theme 2.
- **"Clutch time" skip plays a decided game to the final** (05, 10). Verified as designed behaviour, see theme 4.
- **Two "looks" figures in one report** (03). Verified, see theme 6.
- **Tapping "Full-court press"** on the halftime Tactics tab opens the help sheet instead of setting it (06).
- **After an injury stop**, the next Skip option sometimes did nothing (05).
- **"Your moves"** shows "playing the night back…" for several seconds after the final (01).
- **One black 3D frame** on a phone (06, likely headless).

**Front office**
- **Dead money on $2.4M minimum deals** cut in preseason, though the rules text says minimum deals aren't guaranteed until opening night. The release count also went from 2 to 3 after one signing (04).
- **The mid-level shows "Used" while offers are pending** (04).
- **Players asking under the minimum are labelled "Mid-level"** and become unsignable once it's used (04).
- **The contract total differs** between the confirm sheet ($129.9M) and the news item ($122.4M) (04). Same as round 4.
- **Trade cards show only this season's salary** (Queta "$2.7M thru 30-31", then $12.5M) (04). Same as round 4.
- **The re-sign "Keep everyone… tax ≈" headline doesn't update** as players are re-signed (08).
- **The Negotiate sheet lists a Mid-level button** for an ask already over the exception (05).

**Season, flow and world**
- **The Champions card mixes opponents** with no round labels (10).
- **The Today card calls a self-inflicted slide luck** (07).
- **Owed picks aren't shown** when taking a job (07).
- **A stale manual rotation carries across seasons** with no warning for stars on low minutes (03).
- **The first-games checklist stays at 0 of 4** (09).
- **The owner label differs** between setup steps ("win-now" vs "frugal") (09), and owner targets differ between the Today card and the letter (07).
- **"PHI | PHI" in standings**, and the rebounds leaders table flips name and team columns (08).
- **`#/office/draft` during the draft loads Today** on a direct URL (07).
- **"Sim to end of regular season: 80 of your games"** on game 1 of 82 (03).
- **Scouting text says "over 83 games"** (03).
- **The owner payroll line changed** ($235.1M → $234.4M) in a "Keep both" restore of the same backup (10).
- **The backup filename uses the season's end year** (10).
- **The Play options sheet** stays open or blocks taps after a staff call or the close-out sheet (05, 07, 09).

**Not a game bug.** star-check now runs 8 leagues × 12 seasons, which took 744 s here, past a tester's 10-minute Bash limit. 03 and 07 saw only its header or its last lines. Shorten the default run, or give it a `--quick`.

## Suggested order

1. **Make coaching felt** (theme 1, the top theme for a third round). Measure first, as the luck fix did:
   - find one or two levers whose true effect is big enough to see in a handful of games;
   - make the staff's live advice specific, with one-tap apply and a replay figure for each accepted call.
2. **Fix the staff** (theme 2).
   - Make the foul-trouble replacement use the panel's own threshold.
   - Check deadline buy cards against value, age and the window, and label bad ones as bad.
3. **Open the cap market** (theme 3).
   - Add a salary-dump-with-sweetener route, or a staff-built tax-clearing deal.
   - Add cap holds (or Bird re-signs before cap-space use).
   - Add a taxpayer mid-level and a taxpayer matching limit.
   - Price old expiring stars lower.
4. **Clutch skip** (theme 4): stop at 5:00 even when it's decided, and offer the final there.
5. **One basis for "looks" and a rotation guard** (theme 6).
   - Rename or reconcile the two looks figures.
   - Warn when manual targets leave a top-two player under ~28 minutes, or reset them on a roster turnover.
6. **Long-run realism** (theme 5).
   - Trim the single-game score spread.
   - Look at star injury volume and aging rates for 30+.
   - Consider named, real-style prospects for the first real-league drafts.
7. **Story and flow** (themes 7-9).
   - A title ceremony.
   - Round labels on the Champions card.
   - Stop blaming luck when the user benched the stars.
   - Show owed picks on a job offer.
   - A loud tax line on signings.
   - Tap-to-explain for CBA terms.
   - A "last sim didn't finish" notice.
   - The front-office bugs above.

## Caveats

- **Fresh saves each round.** Per-tester deltas of ±0.5 are noise. Five rounds read 7.45 → 7.57 → 7.41 → 7.71 → 7.90.
- **The persona prompts were rewritten** from the testers' own descriptions (see the top), and the machine changed. Both are small next to fresh saves, but the round isn't a perfect replication.
- **Who coached shapes B, C and G.**
  - 01 (~35 games) and 06 (12) coached the most, both through rule-based bots.
  - 05 coached ~35, mostly clutch stretches.
  - 02, 03, 07, 08 and 10 coached one or two games, and 04 none.
  - Game day's fall is mostly the light coaches' 5s and 6s.
- **Headless Chromium with software rendering, on 4 shared cores.** 3D and live-game speed judgements are a floor (06 saw 4-8 minutes a game at 8x).
- **Short of brief.** 05 played 3 seasons, not 4. 06 coached 12 live games, not 25. 07 played 10 seasons.
- **Sonnet testers cluster at 7-8.** Eight 8s is a ceiling effect as much as a verdict. The verified findings (themes 2, 4 and 6) and the repeated ones (theme 3 from four testers, theme 1 from three) carry more weight than the decimals.
