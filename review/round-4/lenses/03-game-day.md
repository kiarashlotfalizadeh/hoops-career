# Game-day review, round 4 (lens `game-day`)

I couldn't save this as `REPORT.md` because the harness blocks subagents from writing report files, so the full report is below.

My scratch folder is `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/1432d099-c3e8-46a9-bd36-274882ec0af2/scratchpad/review/game-day/`. It holds:

- `shots/`: screenshots
- `logs/`: one log per watched game
- `runs/`: headless output (`polA.json`, `polB.json`, `late.log`)
- Scripts: `watch.mjs`, `pol.mts`, `an.mjs`, `late.mts`, `peek.mjs`

The repo is untouched (the untracked `review/round-4/` folder isn't mine). My browser profile is deleted. Timings were taken on a shared, heavily loaded machine.

## 1. Verdict

Game day is now polished, honest and well paced.

- **What works:**
  - 2× is the default speed.
  - Clutch skip and the late play call only appear when the game is close.
  - The first-game coach mark gets out of the way.
  - The "Your moves" verdict survives reloads and an immediate Next game.
  - The staff's numbers hold up when re-measured on fresh seeds.
- **What's missing is a reason to watch:**
  - Taking every staff call is worth about **+1 point and about +3% win chance a game** (1.39 calls a game × a true +0.83 each).
  - Watching without acting is worth exactly 0.
  - At game level, 36 paired games can't tell following apart from quick sim: +2.6 ± 2.5 points.
- **Crunch time is still mostly silent:**
  - 206 measured crunch-time stops in 36 games produced 4 calls (1.9%).
  - The new "Staff call · Nothing to change" banner outnumbers real calls about 3:1 in close finishes. It appeared 11 times in one double-overtime game.
- **The best moment is still the last-possession play call.** In g5 the iso I called tied the game, and the story said so. It only comes up in about 1 game in 6.

**Score: 7.5/10, unchanged.** The trust and pacing fixes are real. But "why watch instead of sim?" still has a 1-point answer that no player can feel.

## 2. What's genuinely great (protect these)

- **The calls are calibrated, slightly on the conservative side.** I re-measured 118 calls on 500 fresh seeds each (36 games, 12 teams, fresh league seeds):

  | Calls           | Shown (shrunk) | True (by shot value) |
  | --------------- | -------------- | -------------------- |
  | Followed (n=50) | +0.73          | +0.83 ± 0.10         |
  | Ignored (n=68)  | +0.84          | +0.98 ± 0.08         |
  - None of the 118 was truly below even beyond its noise.
  - Margin calls no longer print an unshrunk win chance (`calls.ts:325`).

- **The last-possession huddle** (`shots/g8-stop-24.png`, `shots/g5-stop-6.png`):
  - Options are sorted by measured worth ("Spain: Bitadze +12% to win", the rest "Too close to say").
  - It names the closer: "No go-to set: Black is the best closer out there."
  - It explains what a timeout trades away.
  - Headless, over 60 spots: the top-listed option is truly worth **+4.5 ± 0.6%** to win, against an oracle best of +5.0.
  - The story credits you: "The iso you called for Black tied it with 4 seconds left in regulation."
- **The verdict is honest and now persists:**
  - Examples: "Your moves: too close to say tonight (+0.7, about ±0.8)" (g2), "Your moves were worth +1.2 points tonight (about ±1.0)" (g8), "Your live coaching this season: +3.9 points over 8 games, measured (about ±2.1)" (p2).
  - It survives a reload in a new browser session (`/game/24?tab=debrief`).
  - In g9 I tapped Next game the moment the final landed; the verdict was there right away and again after 60 seconds plus a reload.
  - Each move's counts under it are labelled "raw, not measured".
- **Luck is named as luck.** Example: "A 29-point rout. Our shots fell above what our looks were worth", next to "−6.9 The Hawks got the better looks."
- **The broadcast package:**
  - The starting-lineups intro, the scorebug, the scores ticker, the court captions and the final card.
  - A game killed mid-Q4 resumed exactly: "Resume live game · Q4 · ORL down 88-91" (g5).
- **Pacing:**
  - A watched game takes 5.5 to 5.9 minutes at 2× (8.1 for double overtime) and 0.7 to 1.0 minute at 4× with Key plays.
  - Speed and Key plays stick between games.
  - Clutch skip in a decided game goes straight to the final (g4).

## 3. Findings (most severe first)

### 1. Following the staff is worth about a point a game, and nothing makes the player feel it. P1

- **Paired results** (`pol.mts`, 36 games, fresh seeds):

  | Comparison                     | Points            | Shot value | Win chance  |
  | ------------------------------ | ----------------- | ---------- | ----------- |
  | Follow every call vs ignore    | +1.4 ± 1.8        | −0.2 ± 1.2 | −5.6 ± 8.9% |
  | Follow vs quick sim            | +2.6 ± 2.5        | +1.2 ± 1.5 | —           |
  | Quick sim vs ignore            | −1.2 ± 2.5        | —          | —           |
  | Watch without acting vs ignore | 0 by construction | —          | —           |

- **Per-call truth** implies about +1.15 points and +3% win chance per followed game.
- **The README overstates it.** README line 31 and the comment at `liveWorth.ts:237` still claim "+2.2 ± 0.7 points and +11 ± 3% win chance". The win figure is about 3 to 4× too high.
- **Fix (M):**
  - Add levers worth more where they're pulled (see #2).
  - Show a season coaching ledger: games watched, points added, implied wins.
  - Correct the README and the code comment (S).

### 2. Crunch-time stops exist but almost never produce a call, and the silence is bannered as noise. P1

- **Calls by period** (follow policy, 36 games):

  | Q1  | Q2  | Q3  | Q4 before crunch | Crunch |
  | --- | --- | --- | ---------------- | ------ |
  | 23  | 8   | 10  | 5                | 4      |
  - That puts 46% of calls in Q1 and 8% in crunch time.
  - Crunch stops measured: 206 (5.7 a game). Crunch calls: 4. Games with a crunch call: 4 of 36.
  - Timeout calls: 0.
  - Crunch calls are tiny: shown +0.22, true +0.15 ± 0.11, worth +1.6% to win.

- **Seen live:**
  - In p2, the season-ending play-in (down 5 at 4:49, lost by 3), the only crunch-time call was "Stay home on shooters · +0.1 to the margin (±0.1)".
  - "Nothing to change" banners vs real calls: g8 (double OT) 11 vs 2; g5 (OT) 7 vs 1.
- **Cause:** the banner is posted every `NONE_BEAT` = 4 possessions (`useLiveGame.ts:900-915`, constant at `:1018`).
- **Fix (M):**
  - Drop the banner and keep the line in the Staff view.
  - Draft crunch-specific levers and judge them by win chance: foul up 3, the hack, two-for-one, going small or big, a timeout to advance or to ice.
  - Show a shrunk win-chance band.

### 3. Manual subs plus Skip ahead plays your starters into the ground. P2

- **What happens:** in g5 (Skip ahead to clutch time with "I'll handle substitutions" on) nobody subbed. In a 53-minute game Suggs played 44 minutes, Bane 44, Banchero 44, Vučević 43, and Wagner 41 before fouling out. Bane reached 20% energy.
- **The debrief then gives the wrong cause:** "The Magic wore down… (−7.3)", with advice to "Shorten stints". g4 showed the same −7.4.
- **The copy promises otherwise:** the Skip sheet says "with your plan and rotation as they are" (`skip.ts:71`).
- **Fix (S):** hand the subs back to the staff during a skip, or warn on the Skip sheet.

### 4. The play call and the crunch-time sub chips still show raw, unshrunk win chances. P2 (numbers rule)

- **Play call** (`late.mts`, 60 last-possession spots, 1,600 fresh seeds each):
  - Green top option: shown **+10.8 ± 1.0% vs a true +8.0 ± 0.9%** (n=23).
  - Any option shown as clear: shown +8.7 vs a true +6.5 (n=46).
  - 2 options shown clear and positive were truly negative.
- **Sub chips** (`MyPlayer.tsx:14-18`): raw win chance, picked from six options, e.g. "Black −5%", "Bitadze −6%".
- **The inconsistency:** `calls.ts:316-324` documents this exact bias and removed the figure from calls. `PeriodReport.tsx:335-339` (play call) and `SubWorth` keep it.
- **Fix (S):** shrink both the same way calls are shrunk.

### 5. The sub sheet's "staff's pick" lightbulb can sit on an option its own measurement says loses. P2

- **Example:** "Black 100% **−5%** (the staff's pick)", while three other options read "even" (`shots/g5-sheet-1.png`).
- **Cause:** the pick comes from the `benchFor` heuristic (`calls.ts:122`), independent of the readings next to it (`MyPlayer.tsx:113-130`).
- **Fix (S):** follow the readings once they're in.

### 6. With manual subs on, the bench becomes a fatigue nag. P2

- **Volume:** g6, g7 and g8 had 13 to 17 staff notes each. Of those, 8, 12 and 13 were "X is gassed · 54% energy · [Y for X] · The staff's read: not measured yet". In g8 four arrived within 8 seconds.
- **Contradiction:** they sit next to a measured "Nothing to change" (`shots/g5-paused-3.png`).
- **Fix (M):** batch them into one row, or measure the sub and drop it when it doesn't clear.

### 7. Textbook banners mid-game: a second, unmeasured voice (open since round 3). P2

- "The Wizards' zone clogged driving lanes and post-ups · Beat zones with Motion & cuts (Instructions > In possession > Play through)…" appeared in g2, g8 and p2. It has no number, no button, and points to a screen you can't reach from the live game.
- **Fix (S):** fold it into the reads list, or turn it into a measured call.

### 8. Crunch-time numbers come in a unit that looks worthless. P2

- Examples: "+0.1 to the margin (±0.0), and clear on the win chance too" (g8, OT 1:52) and "+0.2 (±0.0)".
- **Fix (S):** lead with a shrunk win band and never print ±0.0.

### 9. A play called with 0.6 seconds left never runs, and the final card says "Not run yet". P3

- g8, Q4, 0.6 s left, tied: I called Iso: Bane. Afterwards the card read "Iso: Bane · Not run yet." (`StaffCards.tsx:75`).
- In OT with 2.2 s left, the top option was "Spain: Bitadze" (a full pick-and-roll action), which is implausible in that time.
- **Fix (S):** offer inbound and catch-and-shoot sets only under about 3 seconds. Say "time ran out" after the final.

### 10. The live "Timeout · Measured: about even" comes from a static season table, not from the spot. P3

- Source: `callWorth.ts:48-63`. Label it "over past games", or measure it at the spot.

### 11. The clutch-time skip lands after 5:00. P3

- It entered at Q4 4:15 to 4:40 (g3, g5), while the staff said "Measuring… from Q4 4:53".

### 12. Reloading `/live` after the final loses the final card. P3

- It shows "No game for your team today. · Sim to next game" with no link to the report (`Final.tsx:26`).

### 13. "Staff still measuring · 100%". P3

- The pre-game dock (`Matchup.tsx:149`) shows this at 100%.
- In the play-in I could tip off at 63% with no warning that the staff's plan wasn't finished.

### 14. Live banners lack team names and repeat. P3

- Injury banners have no team, and are red even for the opponent's players (`session.ts:56-61`).
- "Fouled out · White" showed 3 times in 8 seconds (g6).
- A call made at a break is bannered again at the next period's tip (g1).

### 15. "Next time" advice appears on a season-ending loss. P3

- It shows on the "Season over" card (p2).
- Advice is given as menu paths, e.g. "(Instructions > Transition > After a stop)", not one-tap fixes.

### 16. Contradictory opponent-adjustment reads stay up together. P3

- "Drops the big…" and "Hedges… instead of dropping" were both shown at Q4 (`shots/g3-clutch.png`).

### 17. The verdict mixes units and over-reads one move. P3

- "too close to say tonight (+2% to win, about ±4%)… The one that mattered most: [subs] (+1.0)" (g5). The headline is in win chance, the top move in points, and a move is singled out on a night the whole verdict calls too close.

### 18. Cross-lens (sim-credibility, P2)

- NYK had 29 turnovers in the play-in (p1, a 115-77 loss).
- Free-throw attempt gaps of 34 vs 10 (g3) and 37 vs 16 (g6).

## 4. Since round 3

| #   | Round-3 finding                      | Status                              | Evidence                                                                                                     |
| --- | ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Moves verdict lost on reload         | **Fixed**                           | Verdict present after reload (g2) and after immediate Next game plus reload (g9); season line counts 8 games |
| 2   | Crunch time silent                   | **Partly**                          | Stops now exist, but only 1.9% produce a call, no timeout calls, and the silence banner is noise             |
| 3   | Slow-phone budget                    | **Partly, not device-verified**     | Measuring ahead of the stop, 30-second budget at breaks                                                      |
| 4   | Win chance overstated beside calls   | **Fixed for calls; open elsewhere** | Still raw in the play call and sub chips (#4)                                                                |
| 5   | Pacing                               | **Fixed**                           | 2× default, Key plays on the scorebug, speed sticks                                                          |
| 6   | Clutch skip into decided games       | **Fixed**                           | g4 went to the final; skip lands late (#11)                                                                  |
| 7   | Play call in decided games           | **Fixed**                           | Gated on close games                                                                                         |
| 8   | Coach mark covering banners          | **Fixed**                           | Gone by Q1 6:08                                                                                              |
| 9   | Ignored calls repeating              | **Mostly fixed**                    | One double remains (#14)                                                                                     |
| 10  | Playoff blowout minutes              | **Fixed (play-in)**                 | Starters played 12-23 minutes in a 38-point win                                                              |
| 11  | Verdict blaming their plan           | **Partly**                          | p2: "They won the tactical battle" next to our zone at +10.1                                                 |
| 12  | Static call-worth table              | **Partly**                          | Still used for the live timeout read                                                                         |
| 13  | Live voice never feeds the next game | **Open**                            | —                                                                                                            |
| 14  | Two voices                           | **Open, worse with manual subs**    | #6, #7                                                                                                       |
| 15  | Copy                                 | **Mixed**                           | New: "±0.0", "Not run yet", "still measuring · 100%"                                                         |
| —   | README "+11% win" claim              | **Still there**                     | About +3% per my per-call truth                                                                              |

**New in the last two rounds:**

- The crunch "Nothing to change" beat.
- Fifth-foul and gassed-closer stops. These fire only with manual subs on, so default players never see them.
- Measured sub chips with raw win chance and a lightbulb on the losing option.
- The skip-plus-manual-subs trap.
- "No game today" after reloading a finished game.

## 5. What it would take to reach 9/10

1. **Make the finish the game.** Draft crunch levers judged by win chance, stop only for the ones that clear, show a shrunk win band, and delete the silence banners. That would take crunch decisions from about 0.1 a game to 1 or 2 real ones. That moment belongs to 2K's coach mode today.
2. **Give watching a felt payoff.** A season coaching ledger, plus a debrief prompt: "this call cleared 3 nights running: make it your default?"
3. **One honest number everywhere.** Shrink the play-call and sub win chances, align the lightbulb with the readings, fix the README claim, drop ±0.0.
4. **A tame manual-subs mode.** Batch the fatigue reads, measure or drop the unmeasured buttons, and hand subs back during skips.
5. **Pacing polish.** Land clutch skip at 5:00, show the final card after a reload, and ask "Tip off without the plan?" when the staff isn't done.

## 6. What I couldn't verify, and how I tested

**UI** (Playwright at 390×844, ORL, my own profile; I used `window.__hc` only to read a game id). 11 live games:

| Game | Setup                                    | Outcome                                          |
| ---- | ---------------------------------------- | ------------------------------------------------ |
| g1   | Defaults, reload                         | 29-point win                                     |
| g2   | Followed calls                           | 15-point loss; verdict persisted                 |
| g3   | Clutch skip                              | Win by 9                                         |
| g4   | Manual subs, decided skip                | Skipped to final                                 |
| g5   | Manual subs, clutch skip, Cup            | OT loss; my iso call tied it; killed and resumed |
| g6   | Manual subs, full game                   | 2-point loss; "+8%" play call; my starter hurt   |
| g7   | Manual subs                              | Win by 4; star hurt                              |
| g8   | Manual subs                              | Double-overtime win; two last-possession calls   |
| g9   | 4× with Key plays, Next game immediately | Verdict persisted                                |
| p1   | Play-in, staff's plan                    | 38-point win                                     |
| p2   | Play-in elimination, 2×                  | Lost by 3                                        |

- The season was simmed through Play options to 40-42.
- Routes visited: `/games/:tid` (all four tabs), `/live` (all views, breaks, huddles, the Skip sheet, player sheets) and `/game/:gid`.

**Headless:**

- `pol.mts`: 36 paired games, 12 teams, league seeds 2027 and 909, with the current stop rules including crunch dead balls. Policies were ignore, quick sim, follow and watch-only, with 500-seed truth for each call.
- `late.mts`: 60 last-possession spots, 400 replays shown against 1,600 for truth.

**Not verified:**

- Real phone timing.
- Landscape, haptics, the GAME WINNER flash.
- Auto mode ("Let the staff make tactics calls").
- A full playoff series: the season ended in the play-in.
- Sub-chip overstatement: inferred from the same mechanism as the play call, not measured.
- Game-level follow vs quick sim is underpowered at n=36, so I relied on the per-call truth.
