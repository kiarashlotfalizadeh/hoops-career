# Hoops Career — product review (October 2026)

Ten Opus reviewers each looked through one lens and played the game in their own headless phone browser. Some also ran headless season and engine experiments. Their full reports, with evidence, file:line references and screenshot paths, are in [`lenses/`](lenses/). This page brings them together.

| #   | Lens                                              | Score | One line                                                                                                                                                                 |
| --- | ------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | [Onboarding](lenses/01-onboarding.md)             | 6.5   | Best first ten minutes in the genre. Then an unexplained live game, a guide step that backfires, and the hardest team as the default                                     |
| 2   | [Core loop](lenses/02-core-loop.md)               | 5     | Plumbing a 9 (a season in about 7 s, the "While you were away" digest), rhythm a 3: a winning team's first decision comes on day 93                                      |
| 3   | [Game day](lenses/03-game-day.md)                 | 6     | Broadcast-grade watching. Following the in-game assistant costs about 0.8 pts/game, and the biggest lever is a blind pick                                                |
| 4   | [Tactics & team](lenses/04-tactics-team.md)       | 6     | The deepest phone tactics screen. Its Fit score is unrelated to what a style is worth (r ≈ 0); Heliocentric quietly beats the staff's pick for 20 of 26 teams            |
| 5   | [Front office](lenses/05-front-office.md)         | 6.5   | Best-in-class CBA rules and explanations. The economy breaks within a season (bad contracts free, picks flat, a free-agency outcome that makes no sense)                 |
| 6   | [Stakes](lenses/06-stakes.md)                     | 6     | The owner machinery is an 8. Getting fired is a buried mail, Hard's owner ignores Hard's handicap, and tanking is the most profitable strategy                           |
| 7   | [Career & world](lenses/07-career-world.md)       | 6     | The archive and decade health are an 8. 0 moments in 5 seasons, no seeded history, and the press forgets after a season                                                  |
| 8   | [UX & IA](lenses/08-ux-ia.md)                     | 7     | No console errors on 88 routes, great posters and live court. The same number disagrees across screens, and the depth screens bury their tabs                            |
| 9   | [Sim credibility](lenses/09-sim-credibility.md)   | 6.5   | League averages within 1-5% of the NBA, r ≈ 0.93 on player lines. The extremes are what get screenshotted (Curry's 3P rating 80, 70-point blowouts, Achilles everywhere) |
| 10  | [Market & platform](lenses/10-market-platform.md) | 6     | Platform about 8.5 (fast, offline, robust saves). No license for the real NBA content the pitch rests on, and the native shells aren't store-ready                       |

**Overall: about 6/10, and the problem is consistent.** The systems and presentation are often 8-9 work. The product falls short where it makes promises: the numbers it shows before you choose aren't measured, the stories it writes don't reach you, and the season gives a good team almost nothing to decide.

---

## The five themes (what several lenses found independently)

### 1. "It tells you why" holds after a choice but not before it

This is the most important finding. The after-the-fact layer is honest and unusual in the genre: luck lines, "shots fell above what our looks were worth", measured pre-game counters, the Why tab. The numbers players **choose by** are mostly uncalibrated. Some are actively harmful:

- **Live assistant calls lose games.** Taking the bench's pick on every call measured −0.83 ± 0.23 pts/game over 2,400 paired games. Most of that comes from the "X is heating up → double him" call. The engine has no shooting hot hand, so this call reacts to noise and costs something real (game-day F1).
- **Quick sim's "assistant adjusts" is a net loss.** Game-day measured −0.66 ± 0.23 per game, about 1-1.5 wins a season for every simmed game. Tactics measured −0.14 ± 0.30 on a different setup. Neither found a gain, so the README's claim that it pays is unsupported (game-day F2, tactics F12).
- **The late play call** swings about 13 points of win probability in 13% of games. It is offered with no numbers, and the weakest option is listed first (game-day F3).
- **Style Fit doesn't predict worth.** Measured against engine results it scored r = 0.26 / 0.01 / −0.02. Shape "per 100" got the sign right 20 times in 37. The Spacing grade is anti-correlated with eFG%, and Rim pressure is noise (tactics F1, F3, F5). The staff's own auto-tactics inherit the same blind spot.
- **The same figure disagrees with itself.** Chance to win shows 31% or 29% depending on whether the Matchup chunk has loaded (`gameProjection` has a side effect). Playoff odds read 72/74/"75% even with a loss" on one page. Free agents: 19 vs 20. A team at "Playoff odds 100%" missed the playoffs (ux F1, sim F18).
- **The owner's numbers can't be trusted.** Goals move between the welcome mail and opening night without a roster change. "On track" appears at 0-0 against a 13-win gap. On Hard, targets ignore Hard's own court edge, about −10 wins on average for contenders. The meter reads "75 Secure" over a line saying you'll be fired whatever you win. The books copy promises a "final warning" that the rules skip (onboarding F5, core F20, stakes F2-F4).
- **Some staff calls can't fix what they raise.** The books call's main button closes 19% of the gap. "Leave it to the staff" doesn't apply the staff's plan. "Plan the series" settles the call on tap (core F6-F7).
- **You can't tell whether coaching mattered.** 85-95% of moves grade "No clear change", which is statistically honest. Nothing records a tactics change and measures it afterwards (game-day F4, tactics F4).

**The fix is one rule, applied everywhere: any number shown before a choice is either measured with the `counterWorth` paired-game machinery the game already has, or labelled as the staff's estimate. CI guards it.** Concretely:

- Measure live calls and drop the hot-hand call.
- Put measured numbers on the late play call and on stop-call subs.
- Have the staff measure a tactics edit when you tap Done, plus a "Since you changed it" ledger.
- Add a "what your moves were worth tonight" replay line in the debrief.
- Recalibrate Fit, shape and grades by regression against lab sweeps, and fail CI below r ≈ 0.6.
- Make `gameProjection` pure, with a test across lazy chunk loads.
- Add Hard's court edge to owner targets.

### 2. The world writes great stories that never reach the player

- **0 big-moment overlays in 5 simmed seasons.** `Moments.tsx:58-63` drops story moments while the digest is open, and a losing team triggers none of the moment kinds (career F1).
- **Getting fired** is under "and 2 more" in the digest. The season review is the third mail row, below an ultimatum. The ultimatum is a one-line row (stakes F1, F10; core F4; career F7).
- **All-Star weekend and the NBA Cup** pass as single mails (core F5).
- **Records are buried.** A league-record 62 by your own player got the headline "Booker leads Suns past Jazz"; Booker scored 21. LeBron, KD and Harden retired in one comma-separated line (career F2, F8).
- **Today barely changes.** The same "From your staff" card stayed on Today for 160+ days. The inbox ended a season with 50 of 55 unread. A long digest shows the newest results, not the best, and power rankings fill "your news" (core F3, F10, F12).
- **No long memory.** The press remembers about one season: no dynasties, droughts or "Nth MVP". The real league starts with no award history, so Curry's Hall of Fame entry reads "All-Star" and Anthony Davis's top chip is "2× Player of the Week". Legends' pages open on their worst, final season (career F3-F5).

**Fix:**

- New moment kinds: fired, hired, ultimatum, season verdict, league record, your All-Star, Hall of Fame class.
- A season-end screen that stays as Today's hero until the draft.
- One "moment of the stretch" card before each long digest, and best-of results in the digest.
- Staff cards on Today that age out.
- Seed real awards, champions, retired numbers and coaches from the Basketball Reference data the pipeline already scrapes.
- A per-season Chronicle kept forever.

### 3. A good team's season is mostly spectating

- **Few decisions.** The first call came on day 93 (32-13). There were 3-4 calls in 82 games. A 7-game skid passed without a stop. A playoff series asks once, before Game 1 (core F1, F2, F15).
- **Calls come only from crises and dates** (`calls.ts:1-18`), so a winning team triggers none until the deadline.
- **Small frictions.** Quick-simming a game is 3 taps, about 250 a season (core F13). Practice is set once and never revisited (core F14).

**Fix:** a weekly staff call with one **measured** choice (next big opponent's plan, schedule-load practice, a minutes cap), plus calls on skids, streaks and series deficits. Keep the existing rule that a call needs a real choice. This depends on theme 1: an unmeasured weekly call would make the trust problem worse.

### 4. The economies are easy to break or point the wrong way

- **P0: a star turned down $49M as "holding out for his ask", then re-signed with his old team for $17.75M the next day.** The Bird-rights bid isn't compared with the user's bid (front office F1).
- **Bad contracts are nearly free.** $185M of overpay costs about 1/16 of a first. Anthony Davis's $62.8M dumped for nothing: "They'd jump at it" (FO F2).
- **Every first is priced the same in year 1 until 15 games** (`trades.ts:210`), so on day 1 you can buy the worst teams' firsts at mid-round prices (FO F3).
- **Free-agent prices crash by day 5.** 80+ OVR players sign at about half their market value (FO F4).
- **The draft has no fog.** Exact OVR/POT is visible, the combine is derived from the ratings, and the AI uses the same numbers (FO F5).
- **Propose fires with no confirmation**, and a green "Deal" banner hides "you'd give up 2×" (FO F6). The "make it work" helper suggests 2× overpays (FO F7).
- **Tanking is the most profitable strategy.** It makes $50-70M a season at 99% attendance, while a back-to-back champion gets frozen and fired (stakes F8).
- **Difficulty can be switched to Easy mid-career to dodge a firing**, and the career never records it (stakes F12).
- **One offense dominates.** Heliocentric is about +1.2/100 better than the staff's pick for most teams and nobody runs it, so the league runs only Hub Big and Five-Out (tactics F2).

### 5. Real-league credibility fails at the extremes and in the IP

- **Visible ratings fans will reject.** Curry's three-point rating is 80, below Edwards' 92. Kessler has a 99 mid-range; Gobert has 84. Ty Jerome is OVR 88. The cause is the derivation priors in `scripts/data/derive.ts:270-280` (sim F1).
- **Outliers every season.** Curry (age 38) at 5.3-6.0 threes a game. Edwards at 35-37 PPG. Caruso at 3+ steals. 3-8 Achilles tears a season. 63-77-point margins. Almost no late-game timeouts or fouling, so OT runs 2.7-3.8% against the repo's own 4.7% target (sim F2-F7).
- **Generated players and coaches.** 38% of generated players share a current NBA surname, and some names match real players exactly. AI coaches are invented and start at 0-0 (career F14-F15, onboarding F16).
- **Store blocker (P0):** real players, team names, colours, arena names, "NBA Cup" and "NBA Finals" with no license. The "fictional" mode still uses the real franchises. The seed's value target is a subscription EPM projection committed to the repo (market F1-F2).

---

## Every P0

| P0                                                                                                      | Lens            | Size |
| ------------------------------------------------------------------------------------------------------- | --------------- | ---- |
| Following the in-game assistant loses about 0.8 pts/game (hot-hand call); nothing tells you             | Game day F1     | M    |
| Star FA turns down $49M, then re-signs elsewhere for $17.75M the next day                               | Front office F1 | M    |
| Getting fired is a buried mail, not a moment                                                            | Stakes F1       | M    |
| Unlicensed NBA/NBPA IP on the first screens blocks any store release; "fictional" keeps real franchises | Market F1       | L    |

## Quick wins (S, high value)

**Trust and honesty**

- Delete the hot-hand live call (game-day F1).
- Define crunch time by win probability and gate fatigue and foul calls on it (game-day F5).
- Add Hard's court edge to owner targets and the win floor (stakes F2, F9).
- Make the books copy "final warning" true; an inherited payroll's first red close only warns (stakes F4, F6).
- Have the meter go hot when the books or an ultimatum mean firing (stakes F3).
- Freeze the preseason owner goal; show "Behind his read" instead of "On track" at 0-0 (onboarding F5).
- Lock difficulty changes to the next opening night and record difficulty on the career (stakes F12).
- Use `pct()` everywhere so the game never shows "100%" (sim F18).

**Trades and money**

- Confirmation sheet on lopsided trades, with the overpay note in the folded dock (FO F6).
- Explain "Not even close" with a value comparison (FO F8).
- Hide lottery slots in the sibling tabs until the reveal (FO F14).
- Warn on contract offers above 110% of the ask (FO F12).

**Loop and Today**

- Age staff cards off Today (core F3).
- Keep power rankings out of "your news"; show best-of results in a long digest (core F10).
- Mark mail read once the digest has shown it (core F12).
- Add a Quick sim chip to the dock on game day (core F13).
- "Leave it to the staff" applies the staff's plan (core F7).

**First hour**

- Rename the live "Bench" tab to "Staff"; three first-game coach marks (onboarding F1).
- Make the default team not the Knicks (onboarding F3).
- Show the familiarity cost on each counter before Add; make "Always" neutral (onboarding F2).
- Land "Start regular season" on opening night (onboarding F9).

**Interface**

- Fix duplicate search keys and add the missing GM synonyms (ux F2, F10).
- Close sheets on Back and route change (ux F9).
- 12px text floor and 44px targets (ux F11, F12).
- Let the depth screens collapse the hero on sub-tabs (ux F3).

**Sim**

- Cut severe-injury weights 40-50% (sim F4).
- Tighten star-check guards: threes leader ≤ 5.2, steals leader ≤ 2.6, max margin ≤ 65 (sim F2, F3, F5, F9).
- Floor stars at 32-34 minutes (sim F10).

**Platform**

- Android target SDK 36 plus an AAB build and a mandatory release key (market F3).
- iOS Light mode, a Hardwood icon and splash, a privacy manifest, portrait lock (market F4).
- Gzip backups (market F10).
- Safari "Add to Home Screen" row; a backup prompt in season 1 (market F6).

## Suggested order

**Now: trust.** The quick wins above, plus making `gameProjection` pure, the Jerome free-agency fix and its invariant, and moments for fired, hired, ultimatum and season-end. These are cheap, and each removes something a player would take as the game lying or cheating them.

**Next: deliver the pitch.**

1. **Measure everything shown before a choice** (theme 1): live calls, play call, tactics on Done, a replay line in the debrief, calibrated Fit, shape and grades with CI.
2. **Decision cadence** (theme 3): a weekly measured staff call, plus skid, streak and series-deficit calls.
3. **The occasion layer** (theme 2): season-end screen, All-Star and Cup chapters, "moment of the stretch", records on the front page.
4. **Economy** (theme 4): money burden in trade value, picks priced from projected strength with "proj. #6-12" on every pick, the free-agency price floor, tank economics, a Heliocentric rebalance, and a style-diversity invariant.
5. **Rating priors and sim outliers** (theme 5), with a reputation check in `real-check.ts`.

**Later: ship and grow.**

- A store-safe fictional league as the default for store builds (invented franchises and arenas, "Cup"/"Finals"), with real names through a user-imported league file.
- Settle the data-source terms.
- A native autosave to `Directory.Data`.
- Draft fog and scouting.
- Seeded real history.
- "Your players" on Career.
- Share cards.
- Faces.
- Pricing: a free fictional web PWA plus a one-time premium store app with no gameplay IAP.

## Protect these (every reviewer named some)

- **Speed.** A season in about 7 s, a sim day in 0.3 s; offline-first; saves that survive a reload or browser kill mid-sim.
- **Honesty about luck.** "Shots falling above or below what they were worth is luck."
- **Measured pre-game counters**, which are the template for theme 1.
- **The broadcast live court.** Scorebug, win-probability bar, ticker, run callouts, the clutch slowdown.
- **"While you were away".** Calls on top with their buttons; real headlines.
- **The first ten minutes.** Calm Start screen, three-step New League, the guide that ticks on choices, owner goals on day one.
- **CBA fidelity in trades**, with rejections that quote the rule; the trade dock; the trading block; an AI league that trades on its own on an NBA calendar.
- **Archives.** The record book, Growth, the season review page, and the league's decade health (8-9 different champions in 10 seasons).
- **The Hardwood posters.** Player slab, team slabs, final-score board.

## Things reviewers couldn't verify

- Real-device performance and haptics.
- The native shells as built apps.
- The "Last possession" stop and overtime.
- Winning-team moments (titles, awards) in a multi-season UI run.
- Easy and Hard over a full season.
- Screen readers.

Each lens report lists its own gaps.
