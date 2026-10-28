# Hoops Career — product review, round 4 (October 2026)

This is the fourth full review, run on HEAD 81f1bf6 (clean). Ten Opus reviewers each took one lens. They:

- played the game in their own headless phone browser, on a dedicated dev server;
- ran the repo's checks (forecast-check, star-check, real-check, invariants, style measurement);
- ran their own paired-game experiments.

They were judged against the best in the genre (Football Manager 26/27, Basketball GM, NBA 2K MyNBA, plus the November Apple Arcade launches of 2K27 and FM27 Touch). Each played first and only then compared with [round 3](../round-3/PRODUCT-REVIEW.md). The full reports, with evidence, file:line references and screenshot paths, are in [`lenses/`](lenses/). Screenshots and scripts are in this session's scratchpad (each report gives its path).

Two rounds landed since round 3:

- **Round-3 "Now"**:
  - the two trust bugs fixed;
  - a roster-worth model that calibrates the forecast, with a CI check;
  - the tag tally retired as a decision input;
  - free-agent floors;
  - owner and call quick wins.
- **Open-P1 round**:
  - the edit ledger survives close;
  - Tactics paths and a head switch;
  - a development year with a cost;
  - live crunch stops;
  - draft-night pricing;
  - a seeded NBA record book;
  - a usage ceiling, a free-throw fit and a big-man OVR floor.

| #   | Lens                                              | R1  | R2  | R3  | R4      | One line                                                                                                                                                                                        |
| --- | ------------------------------------------------- | --- | --- | --- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [Onboarding](lenses/01-onboarding.md)             | 6.5 | 7   | 6.5 | **7.5** | The default team now keeps its promise (goal met 10/12), but the difficulty presets are inverted for it and the first 15 games are a losing run in 11/12 saves                                  |
| 2   | [Core loop](lenses/02-core-loop.md)               | 5   | 6   | 6   | **6**   | Fast, stable, honest, and still a decision desert: a contender gets 1–2 regular-season stops, none after the deadline, and empty series cards still stop the sim                                |
| 3   | [Game day](lenses/03-game-day.md)                 | 6   | 6.5 | 7.5 | **7.5** | Calibrated and well paced, but following the staff is worth about +1 point a game; crunch stops make a call 1.9% of the time and banner "nothing to change" instead                             |
| 4   | [Tactics & team](lenses/04-tactics-team.md)       | 6   | 7   | 7   | **7.5** | The best "why" layer in the genre, every pre-choice number checks out, but the role stars point the wrong way and the staff's monthly lever re-measures one rejected change all season          |
| 5   | [Front office](lenses/05-front-office.md)         | 6.5 | 7   | 7.5 | **7**   | Trade AI and draft pricing hold. Free agency now freezes: 83–90s sit out whole seasons, and losing a bid hands the player to a rival at 35% of value                                            |
| 6   | [Stakes](lenses/06-stakes.md)                     | 6   | 6.5 | 6.8 | **6.9** | The bar is fair; nothing is at risk. Passive coaches are never fired, a $468M loss grades "Good · Secure", and the debt vanishes when you change jobs                                           |
| 7   | [Career & world](lenses/07-career-world.md)       | 6   | 7   | 7.5 | **8.0** | The record book knows Wilt's 100 and the 73-9 Warriors; season pages are real. The franchise past stops at 2003: the Bulls' rafters hold Jimmy Butler, not Jordan                               |
| 8   | [UX & IA](lenses/08-ux-ia.md)                     | 7   | 7.5 | 7.8 | **7.6** | 46 routes × 4 widths with zero errors or overflow, but star names break mid-word on hero slabs and a "(role)" placeholder leaks into Tactics and the staff's mail                               |
| 9   | [Sim credibility](lenses/09-sim-credibility.md)   | 6.5 | 6.5 | 7.0 | **7.4** | Streaks, threes leaders and tiers fixed; league rates within 1–3% over 11 seeds. Perimeter defense is upside down (Maxey 86, Dort 75), stars play 31 minutes, nobody fouls down 3               |
| 10  | [Market & platform](lenses/10-market-platform.md) | 6   | 6   | 6   | **6**   | Platform about 9: no sim freezes, a mid-sim kill is safe, the "~24% slower" didn't reproduce. Market about 3.5: no store-safe build, no offer, and 2K27 Arcade and FM27 Touch land 5 and 10 Nov |

**Overall: about 7.1/10, up from 7.0, 6.7 and 6.2.** Five lenses rose, three held, two fell slightly. The fall in front office is free agency swinging from collapse to freeze. The fall in UX comes from two new visible bugs.

Round 3 said the forecast was the single point of failure. **That is fixed:**

- forecast-check slope 1.04, tails within ±1 win, 82% in band;
- OKC asked 65–68 and winning 64–72;
- the default Wizards meet their goal 10 of 12 times.

The honest machinery now sits on honest inputs. What separates this app from a 9 is no longer whether the numbers are true. It is two things:

- **The machinery rarely speaks.** The staff measures constantly and almost never has anything to say. A contender's regular season has one or two decisions, crunch time has almost none, and the staff's own lever has never made a move.
- **Nothing is at stake when you do nothing.** Passive play is never punished, and money can be ignored.

A third gap is the same as last time: the store and the offer.

> **Your decisions (flagged again):**
>
> 1. **Decision cadence (core F1).** Three lenses now measure the same desert from different sides. The core-loop reviewer frames the choice with numbers in [core §4](lenses/02-core-loop.md).
> 2. **The store-safe edition and an offer.** 2K27 Arcade (5 Nov) and FM27 Touch (10 Nov) launch within two weeks ([market F1, F3](lenses/10-market-platform.md)).
> 3. **How much risk Normal should carry** ([stakes F3](lenses/06-stakes.md)). Today a hands-off coach is never fired.

---

## The six themes

### 1. The staff measures everything and almost never speaks

Every lens that looked at in-season agency found the same shape. The bar for saying something (the numbers rule, enforced as "clears the minimum gain and 2 standard errors") is set so high, or measured so noisily, that the honest voice is mostly silent.

| Where                | What reviewers measured                                                                                                                                                                                         | Source                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Regular-season stops | BOS in the UI: 1 stop in 25 weeks (the deadline), 0 weekly cards. Headless, 4 non-rebuilding teams: 1 regular-season card each, 0 after the deadline. Rebuilding teams: 5–9                                     | [core F1](lenses/02-core-loop.md)                                             |
| Staff lever          | 36–42 readings over six team-seasons, 0 changes, 0 cards. In one save, 10 of 11 readings were the same rejected "Switch to Hedge", because `LEVER_STALE = LEVER_EVERY` (28 days) lets it come round every month | [tactics F2](lenses/04-tactics-team.md), [core F4–F5](lenses/02-core-loop.md) |
| Live crunch time     | 206 crunch stops measured in 36 games, 4 calls (1.9%), 0 timeout calls. The "Nothing to change" banner outnumbers real calls about 3:1, and 11 to 2 in one double-OT game                                       | [game-day F2](lenses/03-game-day.md)                                          |
| Worth of watching    | Following every live call: about +1.15 pts and about +3% win chance a game. README line 31 and `liveWorth.ts:237` still claim +11%                                                                              | [game-day F1](lenses/03-game-day.md)                                          |
| Star injuries        | Measured on one game and shrunk to near zero: Pritchard (82) gets no card ("+0.2"); Tatum (90) out 17 games is "about −0.6 a game"                                                                              | [core F3](lenses/02-core-loop.md)                                             |
| Empty series cards   | Still stop the sim with "none of the staff's counters measures as a gain". It happened on 3 of 3 cards in the UI and 9 of 12 headless; `calls.ts:648` opens them whenever no plan is set                        | [core F2](lenses/02-core-loop.md)                                             |

What does speak is the best in the genre:

- the youth-minutes week card, with its payoff line ten games later;
- the deadline card, which now carries the bill;
- the last-possession huddle;
- the edit ledger's paired verdict with Put back.

All four share a shape: **two options that pay off on different horizons, measured, then graded later.** The desert is where that shape doesn't exist yet.

**Fix direction (three lenses agree):**

1. **Remove the non-choices (S).**
   - Empty series cards become a Today line.
   - Silence banners leave the live view.
   - "Stand pat" settles the deadline card.
2. **Fix the lever's loop (S).**
   - A change read ≤ 0 is excluded for the season.
   - Walk down to the next candidate.
   - Publish the readings ("measured Hedge −0.6, keeping Drop") in a weekly staff-report row and on Analysis, so the staff is seen working.
3. **Measure absences the way the lever is measured (M).** Over up to 6 of the games he'll miss, with the spread shown. Open a card for any top-3 player out 10+ games.
4. **Horizon trade-offs for contenders every 2–3 weeks (L).**
   - Playoff rotation vs regular-season legs.
   - Rest vs the seed race.
   - Development minutes vs wins.
   - The lever's best reading as a card for manual-tactics users, at the minimum gain with the error shown. The 2-SE bar stays for changes the staff makes unasked.
5. **Crunch levers judged by win chance (M).** Foul up or down 3, two-for-one, going small or big, a timeout to advance. They need the engine fix in theme 5 first.

The core reviewer's estimate for the "middle path" is 4–6 real stops a season for a contender, each with options that differ on horizon, not on noise.

### 2. Nothing is at stake when you do nothing

The targets are fair now. The consequences behind them are not.

- **Passive play is never punished.** No passive coach was fired in 12 five-season careers on Normal, the Clippers included. Every hands-off UI season graded "Good" or "Excellent" (6 of 6). There is no in-season dismissal, and Normal has two years of grace ([stakes F3](lenses/06-stakes.md)).
- **The user's team beats its own forecast.** It wins about +3 over the forecast (+3.2 ± 0.8 with the staff's daily measuring, +2.7 without; AI teams −0.1), and meets the win goal 78% of the time.
  - Onboarding found the same thing independently: the default Wizards are forecast 31.6 and win 34.9 ([onboarding F2](lenses/01-onboarding.md)).
  - forecast-check runs headless without the staff, so CI can't see it ([stakes F7](lenses/06-stakes.md)).
- **Money never reaches the grade.**
  - A $468.5M loss and a frozen budget graded "Good · +16 · Secure 65 · The owner is happy with the direction", with the quote "I can't carry that" on the same card ([stakes F1](lenses/06-stakes.md)).
  - A first-season red is always only a warning, blamed on "the payroll you inherited" even when the coach caused it ([stakes F4–F5](lenses/06-stakes.md)).
  - The re-sign sheet's "Max" button bypasses the 1.5×-ask guard: Payton II signed at about 20× his ask.
- **Debt doesn't follow you.** A coach $538M in the hole was offered two jobs and took the Hawks job with clean books and a frugal owner ([stakes F2](lenses/06-stakes.md)). `takeOverTeam` deletes the books. That is an exploit.
- **Difficulty is felt on the court, not in the office.**
  - Hard's grades were no lower than Normal's (+17 vs Normal in year 1).
  - For the default Wizards, Hard asks the fewest wins and has the lowest floor: 28 wins with a floor of about 23, against Normal's 30 and 25. The help copy promises "Hard .350" ([onboarding F1](lenses/01-onboarding.md), [stakes F6](lenses/06-stakes.md)).
  - The team poster shows Normal's asks, because difficulty is picked on the next step ([onboarding F3](lenses/01-onboarding.md)).
  - The court edge is invisible in the UI.
- **Free points:**
  - youth goals handed out by the staff's own rotation;
  - inherited-payroll goals already met (+29 for staying under a tax line you were $9M under);
  - profit goals met 82% of the time passively ([stakes F10–F11](lenses/06-stakes.md)).
- **Two edges that cut the wrong way:**
  - a one-win floor cliff worth about 50 standing points;
  - a rebuild-clock cap that grades −60 after beating the win target ([stakes F8–F9](lenses/06-stakes.md)).

**Fix direction:**

- Grade the close on every season. Tie the verdict word to the books. "Secure" should be impossible under a freeze.
- Debt follows the coach's reputation and appears on job offers.
- An owner sign-off on deals that push the projected close into the red.
- Fold the user's measured +3 into the target, or gate it in CI with the staff running.
- Normal gets a one-season grace and an in-season dismissal for collapse.
- Hard asks above the read and shows its court edge before each game.
- Then simplify. The owner is now about 15 interacting rules ([stakes F20](lenses/06-stakes.md)); keep three or four a player can say back.

### 3. Free agency swung from collapse to freeze

Round 3's market collapsed (an 86 for $6.5M). The new floors hold, but nothing clears them. Four lenses saw it independently:

- **Front office:**
  - Herro (86) unsigned for two straight seasons; Jerome, Bane and Ajay Mitchell for one each.
  - Tatum, Trae Young and Dybantsa unsigned at day 30 of one preseason.
  - About 0.9 AI-originated 80+ players unsigned at every deadline ([front office F1](lenses/05-front-office.md)).
- **Tactics:** in season 2 the staff's one-tap fix was to sign the 87-rated Ty Jerome for the minimum ([tactics, cross-lens](lenses/04-tactics-team.md)).
- **Stakes:** Jerome was available at $30.4M and lifted a 25-win Kings forecast to 41-41 ([stakes, cross-lens](lenses/06-stakes.md)).
- **Core loop:** Jerome (86) and VanVleet (82) were unsigned on day 29 of 30 ([core F9](lenses/02-core-loop.md)).

**The cause** is two rules that never meet. An 80+ player holds 55% of value in season (`contracts.ts:458`), and his price falls only toward what AI room can pay (`freeAgency.ts:554`). When no AI team has that room, nothing clears.

Two more problems sit on top:

- **Bug: losing a bid bypasses the floor.** Bid on Barrett at his allowed minimum, lose, and on day 3 TOR signs him for $9.3M, 35% of market. `decideBid` signs the rival without `summerFloor`. The invariants can't see it, because their user never bids ([front office F2](lenses/05-front-office.md)).
- **"Lead with $X" isn't true.** It said "Lead with $33.85M". The ask ($29.15M) won. For Jerome it showed $18.1M against a $45.45M minimum bid ([front office F3](lenses/05-front-office.md)).

**Fix (M):**

- From day 20, a held player takes the best one-year deal at or above the larger of the room exception and about 35% of value.
- On the eve of the season, every 80+ player goes to the team with the most room or to his Bird team.
- Fix `decideBid`, clamp "Lead with" to the floor, and add a user-bid case to the invariants.

The rest of the economy is close:

- Cap-space laundering still pays +4 to +14 a flip, and about +30 over a chain ([front office F4](lenses/05-front-office.md)).
- The #1 pick has one buyer, at 60% ([F5](lenses/05-front-office.md)).
- "Trade for #N" moves two firsts with no confirm ([F6](lenses/05-front-office.md)).
- Scouting is still free omniscience ([F7](lenses/05-front-office.md)).
- Offer sheets are always matched, even by a team in the tax ([F8](lenses/05-front-office.md)).

### 4. The numbers rule has gaps at its edges

The core calls are now calibrated:

- live calls shown +0.73 against a true +0.83;
- tactics reads within noise of paired games;
- defensive reads at r 0.92;
- the forecast at slope 1.04.

The leftover violations sit on secondary surfaces, and each is cheap to fix:

| Surface                     | What is shown                                                                | What is true                                                             | Source                                       |
| --------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- |
| Late play call              | Top option +10.8% to win (raw)                                               | +8.0 ± 0.9%; 2 "clear" options truly negative                            | [game-day F4](lenses/03-game-day.md)         |
| Live sub chips              | Raw win chance, best of six; the lightbulb sits on an option measured at −5% | —                                                                        | [game-day F4–F5](lenses/03-game-day.md)      |
| README / `liveWorth.ts:237` | "+2.2 points and +11% win chance" from following                             | about +1.15 points, +3%                                                  | [game-day F1](lenses/03-game-day.md)         |
| FA "Lead with $X"           | $33.85M                                                                      | The ask won                                                              | [front office F3](lenses/05-front-office.md) |
| Difficulty help             | "Hard .350 floor"                                                            | The default team's Hard floor is below Normal's                          | [onboarding F1](lenses/01-onboarding.md)     |
| Role stars                  | 1★ = a fix to make                                                           | Following offensive stars −0.27 a game; defensive stars +0.35 and unused | [tactics F1](lenses/04-tactics-team.md)      |
| System grades               | "Forcing turnovers F, 30th"                                                  | Opp TOV% 3rd that season                                                 | [tactics F7](lenses/04-tactics-team.md)      |
| Season tally                | Red "Your settings, net −2.2"                                                | The staff measured the alternative worse 4 of 5 times                    | [tactics F8](lenses/04-tactics-team.md)      |
| Ledger                      | A measured −0.6                                                              | Silently overwritten by a same-day second edit                           | [tactics F5](lenses/04-tactics-team.md)      |
| Youth goal                  | Owner page "On track"                                                        | The card, the same morning: "on pace for 4,683 of his 5,300"             | [core F8](lenses/02-core-loop.md)            |
| Deadline odds               | "buy … odds about 98% with it"                                               | Odds fall on a buy; the stakes are the wrong goal                        | [core F6](lenses/02-core-loop.md)            |
| Books card                  | "Heading into the red"                                                       | Next season projects $75M in the black                                   | [stakes F13](lenses/06-stakes.md)            |
| Shape reads                 | "±0 a game" for all four Kings shapes                                        | Measured spread 0.56, up to 1.1                                          | [tactics F4](lenses/04-tactics-team.md)      |

The role-stars row is the biggest:

- The board's main signal says "fix the 1★ roles". That costs points on offense.
- On defense, the screen's percentile stars point to a real +0.35 a game. The staff's absolute scale (`DEF_ROLE_MIN = 66`) never claims it, for 11 of 12 teams. That is about a win a season for every managed team.

It connects to theme 5's perimeter-defense ratings, so fix the two together.

**Fix (mostly S):**

- Shrink the play-call and sub-chip win chances the way calls are shrunk.
- Align the lightbulb with the readings.
- Correct the README.
- Clamp "Lead with".
- Put bands on reads and verdicts.
- Give the screen and the staff one star scale.
- Merge only edits to the same control.

### 5. The basketball is right for a night and a season, not yet for a fan's eye or a decade

Round 3's tail problems are fixed:

- streaks max 25;
- the threes leader averages 4.8 and is ≤ 5.2 in 81% of seasons;
- no 35-PPG seasons;
- All-Star at 86;
- titles spread across 14 champions in 36 seasons.

League rates sit within 1–3% of 2025-26 across 11 seeds ([sim §2](lenses/09-sim-credibility.md)).

What a fan still catches:

- **Perimeter defense is upside down** ([sim F1](lenses/09-sim-credibility.md)).
  - Maxey 86 "elite", 99th, "Point-of-Attack Stopper"; Trae Young 78; Dort 75.
  - Draymond is 72 with a $2.4M market value on a card that says "DPOY, 9× All-Defense".
  - Dort, Herb Jones, Caruso, Draymond, Holiday, Anunoby and Bridges got 0 of 180 All-Defense first-team slots.
  - Cause: matchup points saved isn't adjusted for who you guard (`derive.ts:292`), and the reputation check exempts these players.
  - It also misleads the staff's matchups and the "why" layer.
- **Stars play 31 minutes** ([sim F2](lenses/09-sim-credibility.md)).
  - 25+ PPG scorers: 6.7 a season against 13 real.
  - Scoring leader median 29.7 against a real 33–34.
  - The usage ceiling fixed the runaway seasons; the binding limit now is the rotation AI's minutes.
- **The endgame** ([sim F3](lenses/09-sim-credibility.md)).
  - A team down 3 with the leader holding the ball and under 24 seconds left never fouls (54% of 56 spots ran out the clock; `fouls.ts:19-31`).
  - The AI calls 0.18 late timeouts.
  - OT is 2.9–3.5% against a 4.7% target.
  - This is also why live crunch time has no levers (theme 1).
- **The decade** ([sim F4–F5](lenses/09-sim-credibility.md), [career F4](lenses/07-career-world.md)).
  - Opening-season OKC hits 70+ in 4 of 22 seeds; one later season had a 77-5.
  - Over five seasons the league drifts small: 10-RPG players go from 7.5 to about 1.5, and the 3PA share rises 42.5% → 45%.
  - The NBA's team-threes record (29) falls in season one of every league.
  - Nothing in CI watches year five.

Smaller items:

- archetype labels ("Franz Wagner · Traditional Big");
- players who missed 2025-26 rated as healthy stars (Haliburton 92, Lillard leading the league in minutes at 36);
- foul-outs about 1.5× high;
- real surnames in generated players ("Kevin Bryant", "Emeka Okafor"; [career F8](lenses/07-career-world.md)).

### 6. Visible polish bugs, the franchise past, and shipping

**Two new bugs that look like an unfinished app** ([ux F1–F2](lenses/08-ux-ia.md)):

- **Hero names break mid-word.**
  - "Antetokounmp / o" on Giannis's page at 390, "Cunningha / m" on Compare, "Piston / s" on your own Team hero at 360.
  - `longWord` guards by character count, not width (`components/ui.tsx:660`).
  - Fix with fit-to-width headlines and a CI check on the longest names at 320/360/390.
- **"(role): Playmaker → Auto" leaks** into the Tactics report and a staff mail after a release.
  - `playbooks.ts:279` can't name a departed player.
  - The release is also logged as a tactics edit the player made.

**UX leftovers** ([ux F3–F14](lenses/08-ux-ia.md)):

- Tactics still stacks three switches.
- Search misses 15 of 54 queries ("fired" finds Fred VanVleet).
- Staff calls run 7 lines with 6 figures, and the deadline card's solid button contradicts the call.
- Slab labels sit at 3.8–4.0:1 contrast and the live ticker at 2.5:1.
- About 900 controls are under 44px.
- About 20 complexity-budget violations.
- Tablet is a stretched phone.

**The franchise past** ([career F1–F2, F5, F7](lenses/07-career-world.md)):

- **Retired numbers and leaders.**
  - The Bulls' only retired number is Jimmy Butler's (2028-29).
  - The Lakers' all-time scorer is LeBron with 12,402.
  - Each leaders table is captioned "count the real seasons before 2026-27 too", which tells a fan it's complete.
- **The Hall of Fame** starts empty. It leaves out Gobert (4× DPOY) and George, and lets in Sabonis and Markkanen.
- **Draft history.** There's no past-drafts view, though `draftHindsight()` is already written and unused.
- **Endings.** A career still can't end.

This is the one big gap left in the best-scoring lens.

**Shipping** ([market](lenses/10-market-platform.md)):

- **Platform: ready.**
  - 243 ms to the start screen.
  - A season sims in 11–13 s.
  - A month sim causes zero long tasks.
  - A mid-sim kill is safe.
  - Updates wait for you to leave.
  - Fully offline.
- **Market: blocked.**
  - Even "Fictional" uses the real franchises.
  - The real data (now with records.json) loads for every league.
  - No offer, no privacy policy, no listing.
  - The hook ("tells you why, and proves it") is absent from the first minute and the store text.
  - Native saves live only in WebView storage, at 20 MB with two leagues against Android's 25 MB backup cap.
  - Phone landscape is unusable.

---

## Cross-lens confirmations worth trusting

These were found independently by two or more reviewers, so they are the safest to act on first:

- **The decision desert:** core-loop, game-day and tactics (theme 1).
- **The user team beats its forecast by about +3 wins:** stakes and onboarding.
- **Unsigned stars, Ty Jerome in particular:** front office, tactics, stakes and core-loop.
- **The staff lever's dead loop:** tactics and core-loop.
- **Defensive under-valuation:** sim (ratings) and tactics (unused defensive roles).
- **Real names in generated players:** career and sim.
- **Team threes inflation:** career and sim.

One disagreement worth noting:

- Market measured HEAD vs round-3 code at about +3% CPU per season, alternating runs, so the team's "~24% slower" note didn't reproduce.
- Core-loop measured the staff's morning work at 76–100% of the day's game time.

Both can be true: the cost was already in round-3 code. Either way, sims feel fast in the UI (a week in about 1 s).

## Suggested order

**Now: bugs and honest edges (mostly S, a day or two each).**

- Visible bugs:
  - fit-to-width hero names, plus the CI check;
  - the "(role)" leak, and keeping roster moves out of the edit ledger.
- Free agency:
  - `decideBid` respects the floor;
  - "Lead with" clamped to the floor;
  - a user-bid invariant.
- Non-choices that stop the sim or nag:
  - empty series cards don't stop;
  - "Stand pat" settles the card;
  - no silence banners;
  - the ultimatum card leaves Today after the season.
- The staff lever:
  - exclude rejected changes, walk the candidates;
  - a weekly staff-report row.
- Numbers on screen:
  - shrink the play call and sub chips, and align the lightbulb;
  - correct the README claim;
  - fix the difficulty help copy and the poster's preset;
  - one youth projection.
- The live game: manual subs hand back to the staff during Skip ahead.
- The ledger: same-day merges only for the same control.

**Next: the two systemic gaps.**

1. **Cadence (your decision first).** Then:
   - horizon cards for contenders;
   - injuries measured over the absence;
   - lever cards for manual-tactics users;
   - deadline odds for the owner's actual goal, with the deal pre-loaded (theme 1).
2. **Stakes.** Each with its own fix in theme 2:
   - money in every grade;
   - debt follows the coach;
   - an owner sign-off on deals;
   - absorb the +3;
   - Normal grace and in-season dismissal;
   - Hard asks more.
3. **Free agency clears (theme 3).** On top of that:
   - laundering closed;
   - pick packages with user fillers;
   - RFA matching that weighs tax.
4. **Defense, end to end.**
   - Assignment-adjusted perimeter defense and All-Defense anchors.
   - One star scale.
   - The staff assigns defensive roles when they measure positive (themes 4–5).
5. **The engine's finish and stars' minutes.**
   - Foul down 3, late timeouts, a re-measured OT rate.
   - Star minute floors, with star-check guards on 25-PPG scorers.
   - Then crunch levers in the live game (themes 1, 5).

**Later: memory, depth, ship.**

- The franchise past: real retired numbers, all-time leaders, the real Hall of Fame. Then Hall of Fame classes, a draft history from `draftHindsight`, and a retire-and-be-inducted ending (theme 6).
- Year-5 guards in star-check: 73-win cap, rebounders, 3PA share, OKC 70+ under 1 in 10.
- Tactics as one tab row; search vocabulary; 44px hit areas and slab contrast; a tablet two-pane layout.
- A clean edition, the offer and the store paperwork, a device save file, share cards and achievements ([market §5](lenses/10-market-platform.md)).

## Protect these

- **The edit loop.** Read before, measured after five games, paired verdict at the check, Put back, and it survives close.
- **The calibrated live voice and the last-possession huddle.** The top option is truly worth +4.5% against an oracle +5.0, and the story credits your call.
- **The forecast and owner targets.** Slope 1.04, tails within a win, OKC asked 65–68. The owner says when he asks above his read.
- **The best calls:** the youth-minutes card with its payoff line, and the deadline card with the bill.
- **The "While you were away" digest**, which explains a slump as luck plus injuries in numbers.
- **The trade AI and draft night:**
  - 8 neutral gains in 1,051 deals;
  - cornerstones priced;
  - fair AI offers;
  - picks on the clock priced 635 against 702;
  - the lottery reveal.
- **The record book and season pages.** Wilt's 100 beside this league's nights, the all-time table updating, the farewells and banner nights.
- **League rates within 1–3% of the NBA across 11 seeds.** Players' lines at r 0.92–0.95, no engine exploits.
- **The platform:** offline, fast, safe on a kill, polite updates, no analytics, and zero console errors over 46 routes × 4 widths.
- **The cap sheet and FA sheets**, the clearest on a phone.

## What reviewers couldn't verify

- **Hardware:** real-device performance, Safari/WebKit (no WebKit browser installed), native builds and Android auto-backup on a device.
- **Accessibility:** a real screen reader (axe and ARIA snapshots only).
- **Coverage:**
  - more than two UI seasons for most lenses;
  - Easy in the UI;
  - auto-tactics mode in the live game;
  - a full playoff series watched live;
  - the Combine tab.
- **Methodology:**
  - held-out-seed tactics reads (the style measurements used the league they were fitted on);
  - game-level "follow vs quick sim" (n=36 is underpowered; per-call truth was used instead).
- **Legal conclusions,** which need counsel.

All timings were taken with ten reviewers loading one machine (load average 10–57 on 14 cores). Each lens report lists its own gaps.
