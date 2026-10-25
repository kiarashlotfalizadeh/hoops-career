# Game-day review: lens `game-day`

I couldn't save this as `REPORT.md` in the scratch folder: the harness blocked the write and told me to return the report as text. The full report is below.

The scratch folder is `/private/tmp/claude-501/-Users-kiarash--claude-spares-spare-hVNZPT/b285bc02-5a07-46d5-a46e-e152c55fa3b7/scratchpad/review/game-day/`. It holds the screenshots (`shots/`), the per-game logs (`g*.log`, `c*.log`, `po1.log`), and the headless experiment `exp.ts` with its outputs `exp-big.txt` and `exp-break.txt`. All `shots/...` paths below are relative to that folder. The repo is untouched (`git status` is clean).

## 1. Verdict

Watching a game looks and feels like a real broadcast. The scorebug, the win-probability bar, the ticker of other games, the play captions, the run callouts ("Heat on a 24-6 run · Spectrum Center has gone quiet") and the offer to slow down for clutch time are good. The reports are unusually honest about luck.

The coaching layer does not deliver its promise. I watched 10+ live games and ran a headless experiment of 2,400 paired games per policy across 8 opponents:

- **Following the bench's in-game calls costs about 0.8 points a game.**
- **Handing those calls to the staff ("Let the staff make tactics calls") costs about the same.**
- **The assistant's in-game adjustments, which quick sim uses, cost about 0.7 points a game.** Watching and doing nothing beats quick sim.
- **The one late lever that really swings games, the last-possession play call, is offered blind.** Nothing on screen says which option is better.

After the game, 85-95% of moves are graded "No clear change". That grading is honest, but it means you can almost never tell whether your coaching mattered, and the staff never admits that its own live advice is unmeasured.

**Score: 6/10.**

- Presentation, pacing options and luck-honesty are 8/10 work.
- Agency is real (moves change about 95% of games) but net-negative when you follow the in-game assistant, and invisible in the feedback.
- That breaks the pitch: "a reason to watch" and "coaching that measurably matters".

## 2. What's genuinely great (protect these)

- **Luck told as luck, everywhere.**
  - Breaks, huddles and debriefs split "got the better looks" from "shots fell", and say "Shots falling above or below what they were worth is luck: nothing to change for it".
  - The debrief verdicts are honest. After a 24-point win: "Our shots fell above what our looks were worth: the luck went our way" (g1.log FINAL). On a missed key: "that part was luck, not your plan" (`shots/po1deb-s2.png`).
  - No sports game I know does this. It is the right foundation for "honest feedback".
- **Pre-game counters are measured, and the projection moves with them.**
  - The preview offers "3-2 zone · About +0.5 a game". Tapping "Use the staff's plan" moves the line from "A toss-up" 49/51 to "MIA by 1.0 projected" 47/53 (`shots/g4-preview-s0.png`).
  - The debrief grades the plan on that measured worth: "Your plan · 3-2 zone · Worth +0.5 a game", with tonight's number beside it.
- **The broadcast package.**
  - Team-colour scorebug blocks, the "To win" bar, and the bottom ticker of other games.
  - Captions per play ("P&R: Antetokounmpo + Hardaway Jr. vs blitz", `shots/g1-p13.png`).
  - The starting-lineups intro ("Game 1 at Paycom Center", `shots/po1-01-intro.png`), run callouts, and the playoff series framing.
- **Clutch-time offer.** At 4× with Key plays on, the game offers "Clutch time · Watch at 1× · Always" at Q4 4:30 (`shots/g3-clutch.png`). g3 played a full game in 168 s, with the last 4:30 of a tie game at 1×. That is the best way to watch today.
- **Journaled live games survive anything.** I left mid-game and reloaded the app. The Continue bar read "Resume live game · End of Q1 · MIA up 28-26" and the game picked up exactly there (`shots/g4-today-midgame.png`).
- **Stop calls only in close games** (mostly). A fifth foul or a gassed closer pauses a close game once and opens his sheet with the subs (`shots/g3-sheet11.png`). This is the right shape for simple agency.
- **Final card and the highlights reel on the court** (`shots/g1-final.png`, `shots/g4-hl-1.png`). They give a live game a closing beat that quick sim doesn't have.

## 3. Findings (most severe first)

### F1. Following the bench's live calls loses games, and nothing tells you. P0

**What the player experiences:**

- The Bench is the "big in-game assistant" the owner wants.
- A player who trusts it (taps the staff's pick, or turns on "Let the staff make tactics calls") does measurably worse than one who ignores it.
- The debrief then grades those moves "No clear change", so the player never finds out.

**Evidence:** `exp.ts` runs headless, on the same seeds, with `LiveGame` exactly as the Live screen drives it and notes from `staffNotes()`. MIA vs 8 real opponents, 300 games each:

| Policy                                               | Mean vs doing nothing (pts/game) | Win % change |
| ---------------------------------------------------- | -------------------------------- | ------------ |
| Take the staff's pick on every call (`staff`)        | **−0.83 ± 0.23**                 | −2.1         |
| "Let the staff make tactics calls" (`auto`)          | **−0.82 ± 0.23**                 | −1.6         |
| Tactics calls only                                   | −1.02 ± 0.25                     |              |
| Subs and timeouts only                               | −0.12 ± 0.09                     |              |
| **"X is heating up" → "Y on him" / "Double X" only** | **−0.94 ± 0.23 (4σ)**            |              |
| "We're beating X → Attack X" only                    | −0.15 ± 0.19                     |              |
| Play-type / tactical-edge counters only              | −0.21 ± 0.11                     |              |

**The cause is the hot-hand call.**

- `src/ui/live/staff.ts:181` fires on any scorer with ≥10 points on ≥55% shooting or 3 straight makes.
- Seen in play: "Edwards is heating up · 12 points on 4-6 · Double Edwards" at Q1 1:51 (`shots/g1-call6.png`), and "Curry is heating up · 49 points" (c6.log).
- The engine has no shooting hot hand. The only streak effect is a usage boost when the _offense_ enables hotHand (`src/core/sim/engine/usage.ts:41`). So the call reacts to noise with a real cost: a double, or a worse defender on someone else.
- It contradicts the pre-game staff's own standard. `src/core/ai/counterWorth.ts:1-20` says rule-drafted counters measured "about nothing" and that "a wrong one costs as much"; that's why pre-game counters are measured. Live calls never are.

**Why it matters:** this is the core promise. Right now the honest advice to players is "ignore your assistant during games".

**Recommendation (M):**

1. Delete the hot-scorer call, or base it on matchup ratings, never on the streak.
2. Score every live tactics call the way pre-game counters are scored: play the rest of the game from the current state about 100 times with and without the change, on the same seeds, in the sim worker. Show "About +0.4 for the rest of the game", and propose only gains. The engine does 400 games in about 4 s headless, so this fits between possessions or at a break.
3. Until then, label live calls "the staff's read, not measured".

### F2. Quick sim (assistant adjusts) is worse than watching and doing nothing. P1

**Evidence:**

- A live game sets `adjust: false` for the user (`src/state/live.ts:105,114`).
- Quick sim sets `adjust = assistantAdjusts || !manual` (`src/core/league/games.ts:370`), which is on by default.
- Turning the same adjustment rate on in a live game (policy `adjust`, rate 0.15 + 0.6 × 77) cost **−0.66 ± 0.23 pts/game** across 8 opponents. Per opponent: −1.08 MIN, −1.49 DET, −0.40 CHA, −1.01 DAL, +0.81 ATL, −1.23 IND, −0.95 LAL, +0.05 LAC.

**Why it matters:**

- The README says that without the assistant "the other bench kept cashing in on what it found". The data says the adjustments are a net loss.
- Every simmed game of every career pays it: about 1-1.5 wins a season.

**Recommendation (M):** measure the adjustment choices in `coach.ts:98` the same way and only switch when the change pays. Otherwise default the user to no adjustments. This can share code with F1.

### F3. The late play call is the biggest lever in the game, and it's a blind pick. P1

**What the player experiences:** the late huddle offers "Iso: Smith · One-on-one against K. Hayes" and "Hammer: Fontecchio · A corner three on the kick-out" (`shots/lh1-late-huddle.png`), with nothing saying which is better.

**Evidence** (`exp.ts`, same seeds, games identical until the call): last-possession spots came up in 321 of 2,400 games (13%).

- Calling the best set for a player _other_ than the closer (listed last): **net +41 results flipped**, about **+13 points of win probability** in those spots.
- The closer's isolation (listed first, reads as the default): +5 (+1.6).
- The closer's best set: about +8.

So the choice is worth more than everything else on the bench combined, and the UI ranks the weakest option first.

**Recommendation (M):** measure each option's points per trip from the current state (one possession × about 200 seeds is instant). Show it on each row ("Hammer: Fontecchio · 1.18 a trip") and sort by it. Keep the closer framing as copy, not as the default order.

### F4. Your moves almost always read "No clear change", so you can't tell whether coaching mattered. P1

**Evidence:**

- All 15 moves across g1, g2 and po1 read "No clear change/difference" (`shots/po1deb-s1.png`, `shots/po1deb-s2.png`).
- Headless, 600 games of staff-policy moves:
  - Tactics moves: same 84%, too early 9%, working 4.0%, not working 2.6%.
  - Subs: same 74%, too early 21%.
- `moveVerdict`'s z = 2 threshold (`src/core/analysis/moves.ts:182-212`) is statistically honest. One game simply can't grade one move.

**Recommendation (M-L):** add one game-level line to the debrief, "What your moves were worth tonight".

- Replay the game from its journal seed about 100 times with and without your moves (`League.live` ops already hold everything).
- Report something like "Your moves: +1.4 ± 0.9 points; the Hammer call won it in 31% of replays".
- Keep the per-move rows as detail.

### F5. Crunch time ignores the score: starters run on fumes in decided games, and the bench spams calls. P1

**What the player experiences:**

- Playoff game, up 15 at Q4 3:24 (>99% to win): the bench lists SGA, Jal. Williams and Holmgren at 20% energy and Hartenstein at 26% (po1.log).
- After a skip to clutch, up 12: Dončić at 20% plus three more (c3.log).
- Holmgren played 37 minutes in a +15 playoff win, and Mitchell 37 in a +24 opener.

**Evidence:**

- `src/core/sim/engine/rotation.ts:73,83`: `crunch = q >= 4 && clock < 360` keeps tired players on whatever the margin.
- Garbage time only starts at +22 inside 5:00 or +16 inside 2:30 (`rotation.ts:35-38`).

**Recommendation (S):** define crunch time with the existing `closeGame()` win-probability band (`src/ui/live/alerts.ts:71`), and apply the same gate to the bench's fatigue and foul calls.

### F6. Staff calls ignore the game state and the staff's own earlier calls. P2

**Evidence:**

- "Lopez is heating up · Double Lopez" at Q4 1:50 with LAL 99% to win (c5.log).
- "Attack Dunn" with 4.3 s left (c5.log).
- "Sit Wiggins" with 1.4 s left, down 14 (g2.log).
- Whiplash in g2: the huddle's top call at Q3 11:22 was "Go to Drop" (ice → drop). At Q4 8:22 the bench said "Drop is giving their handlers room · Switch to Hedge". Both reads were based on 6-7 trips.

**Recommendation (S):**

- Suppress decision notes outside 3-97% win probability, and in the last 24 s except timeout and foul decisions.
- No counter-call on the same lever within about 15 trips unless its measured worth flips.

### F7. "Skip to Clutch time" usually lands in a blowout, and blowouts have no exit. P2

**What the player experiences:**

- Of about 13 clutch skips, 9 landed with one side at 94% or more ("GSW 105, LAL 128, Q4 4:46" in c1.log; "TOR 127, LAL 91" in c7.log). You then sit through 80 s of garbage time.
- g1 was 99% decided at halftime and still played Q3-Q4 at 1×: 6 minutes of dead air with no "decided, sim to final?" prompt.

**Recommendation (S):**

- Show the projected state in the Skip sheet, or offer "Skip to the finish if it's close": stop at 5:00 only when the game is close, otherwise go to the final.
- After a full quarter above 98%, show a quiet "Sim to final" chip on the court.

### F8. A timeout's huddle points to a screen you can't reach. P2

**Evidence:** every huddle outside the last 5:00 ends with "No play set: the team runs its offense. Set one in Tactics → Match." (`src/ui/live/PeriodReport.tsx:451`). That screen can't be opened from inside the live game.

**Recommendation (S):** since live play calls were cut on purpose, remove the line or show the saved after-timeout play read-only.

### F9. The keys' live pace projection is noise, and it nags from Q1. P2

**Evidence:**

- "Make Edwards work · 4 so far · on pace for 29 · goal ≤ 27 · Behind" at Q1 5:26 (`shots/g1-p04.png`).
- Edwards finished with 22, so the key was met, after reading "Behind" for three quarters.
- "0% so far · On track" appears before the tip (`shots/po1-01-intro.png`).
- `KEYS_EARLY_SEC = 360` (`src/ui/live/session.ts:28`): extrapolation starts after 6 minutes.

**Recommendation (S):** show "so far" only until halftime, then a pace with a tolerance band. Never show a status before the tip.

### F10. "What's deciding it" counts a star's points as margin, double-counting luck. P2

**Evidence:**

- At end of Q1 the report lists "+3.8 · Bam Adebayo has 13 points (4-6 FG). On pace for 52" right beside the luck line (`shots/g1-brk9.png`).
- The value is invented: `pts: sign * (star.pts − 22 × played) × 0.5` (`gameReport.ts:752`).
- Its advice ("put your best defender on him, or double him") is the same noise-chasing as F1.

**Recommendation (S):** drop star rows from the "deciding" list (keep them in the story), or derive them from that player's shot value against his looks.

### F11. The debrief contradicts the preview's plan. P2

**Evidence:**

- In g4 I took the staff's plan, a 3-2 zone measured at +0.5 a game.
- The debrief then said both "Your plan · 3-2 zone · Worth +0.5 a game" and "Drill the game plan · Playing a step slow cost us 0.9 points" (`shots/g4-hl-1.png`).
- The player reads "the plan was good" and "the plan cost me" for one change.
- Separately, the README line "He never suggests a zone" is out of date with `advisor.ts:258-274`.

**Recommendation (S):** when the unfamiliar thing was a measured counter, fold the familiarity line into the counter's line.

### F12. The stop-call sheet asks for a sub without the information to choose. P2

**What the player experiences:**

- Tied at Q4 1:51, "Paused: Mitchell is gassed (54% energy)" opens his sheet.
- It lists the subs with energy and fouls, plus shot freedom, role and matchups (`shots/g3-sheet11.png`).
- Nothing compares what 54% energy costs against the sub's value, which is the only question.

**Recommendation (S):** put one comparison line at the top, using the same measurement as F3. Collapse the other controls under "More".

### F13. Five layers stack over the court at the clutch moment. P2

**Evidence:** `shots/g3-clutch.png`. The clutch offer bar, the "Heat by 5, 4:36 to play" callout, the pause/skip buttons, the Key plays/4× chips and the play caption all cover the court. The ball handler is hidden.

**Recommendation (S):** queue the callout behind the offer, fold the offer into the playback chips, and don't auto-show playback controls while a callout is up.

### F14. Period reports and huddles are over the complexity budget and repeat themselves. P2

**Evidence:**

- An end-of-quarter report runs 3+ phone screens with 7 blocks: story, assistant read, deciding factors, subs, keys, "So far" with 4 tabs, and moves (`shots/g2-brk16*.png`).
- The timeout huddle repeats the same luck paragraph verbatim (`shots/g1-huddle17.png`).

**Recommendation (S):**

- At a break: the story, one deciding line, the staff's one (measured) call, and the subs. Everything else goes behind "Full report".
- In a huddle: show only what changed since the last stop.

### F15. Game-day billing is overused. P2

**Evidence:**

- Lakers: "Revenge game" three games running (c2-c4).
- Heat: "Revenge game" on two of its first ten games (vs DAL, and vs MIL as the next big night).
- "Milestone watch" two games running (g6, g7).
- "Rivalry night" for OKC's second game of the season.
- Source: `gameStory.ts:1131,1144`.

**Recommendation (S):** budget kickers to about one in five games. Require a real stake: a starter facing his old team for the first time, or a newsworthy milestone.

### F16. Pacing: the 1× default is long, and the best mode is hidden. P2

**Timings measured on a phone viewport:**

| How                                             | Real time                            |
| ----------------------------------------------- | ------------------------------------ |
| 1×, full game, breaks clicked through instantly | 693 s (11.5 min); quarters 166-185 s |
| 2×                                              | 420-509 s (7-8.5 min)                |
| 4× + Key plays, clutch slowed to 1×             | 168 s                                |
| Skip to clutch, then 1×                         | 80-170 s                             |
| Quick sim                                       | about 1 s                            |

- The 1× figure becomes about 15 min with a human reading the breaks.
- FM's key-highlights mode runs 3-5 minutes, which matches 4× + Key plays + clutch at 1× here.
- New players start at 1× with Key plays off.
- The Key plays toggle persists silently: my g3 toggle carried into g5-g8 without any visible sign.

**Recommendation (S):** default new careers to Key plays at 2× with "Always" slow-for-clutch, and show the speed and Key plays state on the scorebug.

### F17. The live final looks identical to a quick-sim result. P3

**Evidence:** `shots/g1-final.png` and `shots/qs-1-after.png` are the same card. The live extras (moves, highlights) sit below the fold, and "Game report" opens on the Why tab rather than Debrief.

**Recommendation (S):** add a "Your night" line to the card on coached games, and open the report on Debrief.

### F18. The flow chart doesn't show your moves. P3

**Evidence:** the win-probability chart marks the three biggest swings but none of your moves (`shots/po1flow-s1.png`).

**Recommendation (S):** pin your moves on the line with their verdicts.

### F19. Preview and live disagree on who to watch, and tip-off doesn't wait for the staff's numbers. P3

**Evidence:**

- The preview says "Watch LaMelo Ball"; the live bench card says "Watching Edwards" (g1).
- The preview says "Watch Cam Spencer", who came off the bench; live says "Watching Coward" (po1).
- The preview shows "The staff is playing your game against them out with each counter: 63%" for about 4 s (`shots/g1-preview.png`). Tip off is live the whole time, so a quick tap skips the staff's plan unseen.

**Recommendation (S):** use one "watch" pick for the night, and flag or disable Tip off until the measurement finishes.

### F20. Post-game advice for blowout wins is generic. P3

**Evidence:**

- After a 25-point win: "The Thunder wore down: tired legs cost them shooting accuracy · Shorten stints".
- After a 3-point win: a "For every game" button that permanently changes tactics off one night's impact tags (unmeasured, the same family as F1).

**Recommendation (S):** hide "Next time" after wins by 15 or more, and gate "For every game" buttons on a measured worth.

### F21. Weak player-of-the-game picks and confusing labels. P3

**Evidence:**

- "Best of the night · Pelle Larsson · 11 pts" in a loss (g7).
- "Today · Home" sits on the _away_ team's panel in the games hub and preview hero (`shots/p2games-s0.png`, `shots/g1-preview.png`).
- The scorebug shows "Penalty 9" under the fouling team, but it means the _other_ team is in the bonus (`shots/g2-view-Gameplan.png`).
- "Plan for your opener" appears on the previews for game 2 and game 4 (g2, g4).

**Recommendation (S):** fix the copy, use game score or plus-minus for the "best" pick on a losing side, and put "Home" on the home panel.

### F22. Cross-lens, sim-credibility: foul disparities large enough to decide games

**Evidence:** g2 ended with personal fouls MIA 36, DET 16 and free throws 15-17 vs 39-48. The report could only say "Not from how physical you played".

## 4. Top 5 moves

1. **Measure live calls like pre-game counters, and cut the hot-hand call** (F1, F6). The assistant goes from −0.8 points a game to a voice worth hearing.
2. **Put measured numbers on the late play call and the stop-call sub** (F3, F12). That one tap swings about 13 points of win probability; showing it is the clearest reason to watch rather than quick sim.
3. **A game-level "what your moves were worth" replay in the debrief, with moves pinned on the flow chart** (F4, F18, F17). One honest answer to "did my decisions matter?".
4. **Fix quick-sim adjustments and make crunch time depend on the score** (F2, F5). Quick sim stops costing about a win a season, and decided games stop running stars to 20% energy.
5. **Pacing defaults and dead-air exits** (F16, F7, F13, F14). A watched game becomes 3-5 tense minutes instead of 12-15 with a decided third quarter.

## 5. What I couldn't verify, and how I tested

**Played in the UI** (Playwright, phone viewport 390×844, three of my own profiles: MIA, OKC and LAL real-league careers):

- g1: full game at 1×, coached, a blowout, 693 s.
- g2: full game at 2×, coached, close until Q4, then a 14-point loss.
- po1: West R1 Game 1 at 2×, coached.
- g3: 4× + Key plays with clutch at 1×; a tie at 1:51, won by 3.
- g4: left mid-game, reloaded and resumed, then skipped to the final; used the staff's plan; played the highlights reel.
- About 13 clutch-skip finishes (g5-g10, c1-c8), two of them close.
- lh1: a late-game huddle with the play call.
- 3 quick sims (OKC).

**Routes visited:**

- `/`, `/games`, `/games/:tid` (Preview, Scout, Plan, Matchups).
- `/live`: Bench, Game plan, Lineup, Stats, Every setting, the Skip sheet, stop-call sheets, period reports and huddles.
- `/game/:gid`: Debrief, Why, Box, Shots, Flow.

**Headless** (`exp.ts` via `npx tsx`):

- Real seed, MIA as the user, its first 8 schedule games, 300-400 seeded games per policy.
- Games are paired on the same seeds, so a game only diverges after the first move.

**Not verified:**

- **The "Last possession" stop screen** (down 0-3, your ball, under 24 s). It never came up in about 15 watched finishes; the experiment says it happens in about 13% of games. I saw the late-timeout "Call the play" huddle and read the code path (`useLiveGame.ts:891-933`, `PeriodReport.tsx:395-430`).
- **Overtime and the GAME WINNER flash:** never reached.
- **Bot vs human:** my bot took the staff's top-ranked pick on every call. A selective human may do better, but the per-call-type split shows which calls hurt.
- **Real-device performance** of the court, haptics, and the landscape layout: not tested.
