# Ten-Sonnet playtest, round 2 (2026-11-24)

Same ten personas, same brief, same kit as round 1 (2026-11-23), on main `0f63f42`. That build includes the playtest fix round, the gameplay root-fix round and the perD refit. Each tester played a production build (`vite preview`) in headless Chromium through a shared Playwright kit, on a 390x844 phone unless noted. Their reports are in `reports/` and the brief is in `BRIEF.md`.

Target consumer: hardcore basketball fans aged 18 to 40 who want Football Manager coaching depth, franchise rebuilds, modern analytics and honest offline sims.

## Verdict

**7.57 overall (round 1: 7.45). Recommend-to-a-friend 7.65 (round 1: 7.5).** Every tester would pay $7.99 on phones, the same as round 1. On Steam at $14.99, three said "yes, if X is fixed", two said probably, three maybe and two probably not.

Round 1's trust bugs are gone. Live resume is exact, the margin bridge adds up, the owner is fair to winners, firing leads to a job market, import restores, and the fictional league plays like basketball. Nobody hit a page error. The scores rose most where the fixes landed: stakes +0.55, game day +0.5, sim honesty +0.4, analytics +0.4. The only area that fell was **front office, −0.5**, because the contender and the capologist hit a cap-stuck league where picks buy nothing and contested free agency can't be read.

This round's complaints are about depth, not trust:
- "Does my coaching matter?" was the game-day coach's dealbreaker-level major and the FM lifer's top miss.
- The rebuild is now **too easy**: the rebuilder won 58 and a Cup by year 5 with two picks at 91 and 87.
- Live games are still slow, and 4x is hard to find.

## Scorecard

| Area | R1 avg | **R2 avg** | Δ | R2 range | Note |
|---|---|---|---|---|---|
| A First hour | 7.3 | **7.55** | +0.25 | 7–8.5 | Guide checklist works. Steps that don't tick and live-screen tour popups cost points. |
| B Coaching depth | 7.1 | **7.44** | +0.34 | 6.5–8 | The game plan page (matchups, double, attack, hack, junk) impressed. "Does it matter?" did not. |
| C Game day | 6.8 | **7.31** | +0.5 | 7–8 | Last-possession card, honest Hack advice, exact resume. Still slow; coaching credit rounds to zero. |
| D Front office | 7.6 | **7.06** | −0.5 | 5–8.5 | Cap-stuck league, picks buy nothing, FA losses with no reason given. |
| E Rebuild & dev | 5.9 | **6.06** | +0.15 | 5–8 | Readable now, but the rebuilder's rebuild was too fast. Still the lowest area. |
| F Analytics | 7.3 | **7.7** | +0.4 | 6–9 | Box scores reconcile and real-check is 24/24. Asks: error bars, per-100. |
| G Sim honesty & realism | 6.8 | **7.2** | +0.4 | 7–8.5 | No drift over 10 seasons. Big single-game swings, high playoff scoring, foul-outs 2x the target. |
| H Stakes & story | 6.9 | **7.45** | +0.55 | 6.5–9 | Firing, the job market and a fair owner. The journeyman gave it 9. |
| I UX on device | 7.2 | **7.3** | +0.1 | 7–8 | Phone is dense but good. Tablet/desktop are a stretched phone; tap targets under 44 px. |
| **J Overall** | 7.45 | **7.57** | +0.12 | 7–8 | |
| Recommend | 7.5 | **7.65** | +0.15 | 7–8 | |

The averages count only testers who scored the area. 04 and 07 skipped B, and 04, 06 and 08 skipped C or D or E as their reports say.

## The ten players

| # | Persona | Team / mode | What they did | J R1 → R2 | One-line take |
|---|---|---|---|---|---|
| 01 | FM lifer | real, GM+HC | Two seasons, tactics experiments, counters | 7.5 → 7.5 | "The forecast ignores my tactics." 76% held through every style and counter change. |
| 02 | Rebuilder | real, tank job | Five seasons: 30 → 35 → 50 → 53 → 58 wins, a Cup | 7.5 → 8 | Loved it, but "too easy". The #4 pick went from 76 to 91 by age 22. |
| 03 | Analytics | real | Box-score audit, real-check, lineups | 7.5 → 8 | Everything reconciles. Wants error bars, per-100 and per-36, per-player shot zones. |
| 04 | Capologist | real, cap-hell team | Trades, dumps, FA bids | 7.5 → 7.5 | Tax math is right. The league is cap-stuck, the payroll goal flips after a neutral trade, and FA loses by $0.1M. |
| 05 | Contender | real, OKC | 64-win title, then a repeat attempt | 7 → 7.5 | The owner is fair now. Four firsts for an 88 got "Not even close", and the tax acts like a hard cap. |
| 06 | Game-day coach | real, CHI, 26 games live | Timeouts, ATOs, game plans, 3D | 7.5 → 7.7 | "Show me what my calls did." Timeout credit was +0.2 to +0.4 pts. |
| 07 | Journeyman | real, fired at DEN | 10 seasons, fired, Jobs tab, rehired | 7 → 8 | The firing and the job market are the round's best new feature. Stakes 9. |
| 08 | Purist | real | Ratings, minutes, history | 7.5 → 7 | Ratings too high, star minutes low (Wemby 26 mpg), invented coaches, OKC 70-12. |
| 09 | Newcomer | fictional, first time | First season | 7.5 → 7 | Jargon, no "fix it" card when losing, the fictional league has no hook. |
| 10 | Commuter | real, phone only | Short sessions, close/reopen, import | 8 → 7.5 | Resume and import work. Heavy bottom chrome, small taps, ~20-min live games. |

## What got fixed since round 1 (as the testers saw it)

- **Exact live resume.** 10 closed at Q1 9:41 and reopened at 9:20 (the last checkpoint). In round 1 that was a lost game.
- **The margin bridge adds up** (05, 06, 09, 10). For example: looks −6.6 + luck +20.6 + FT +7 = +21.
- **The owner is fair to winners.**
  - 05: a 64-win title graded +50, and security rose from 59 to 75.
  - 02: 58 wins graded "Good".
- **Firing and a job market.**
  - 07 was fired at Denver after −40 and −60 seasons.
  - He saw reputation fall from 44 to 35, got offers from Utah and Chicago, and later returned to Chicago.
- **Calm offers with the tax shown.** Sims stop only for calls.
- **Import: Restore over it / Keep both** (10).
- **The fictional league plays like basketball** (08). Round 1's broken economy and nonsense ratings did not come back.
- **Development is readable:** staff-priority mail and anchors after the roster trim.
- **No long-run drift** (07). Over 10 seasons the top-100 mean went from 84.9 to 85.3, with nine different champions.
- **Box scores reconcile; real-check passes 24/24** (03).

## Themes, ranked

### 1. "Does my coaching matter?" There's no proof (01, 06, 03). Major.
- 06 called 40+ timeouts after opponent runs. The game itself scored them "CHI 7-11 since", "9-14 since" and "8-14 since". "Your moves" credit ran +0.2 to +0.4 pts a game. The staff's quick sims went 1-2 against his ~10-14 coaching live, so neither sample says anything.
- 01: the win forecast held at 76% through style changes and counter changes. Counter cards mostly read "No clear edge". The style test never concluded in 82 games.
- 03: "Staff is watching…" with no verdict after 38 games.

The tools are deep (B rose), but the game never tells you what a call did. 06's one ask: a counterfactual line per call ("opponent scored 9-4 after, expected 9-6 without"), rolled up into a season "Your coaching: +x wins". If it's nothing, say so.

### 2. The rebuild is too easy and too fast (02). Major. This is an overcorrection.
- Wins went 30 → 35 → 50 → 53 → 58, with a conference-finals game 7 in year 3 and a Cup in year 4.
- The #4 pick went from 76 to 91/99 by age 22. The #9 pick went from 76 to 87.
- The "worst" roster still had an 83/85.
- 07's 10-season run shows no league-wide drift, so the cause is probably the user-side levers from the root-fix round: top-10 picks +2, `devPriority`, and anchors after the trim. The scouting and draft-luck side doesn't push back.
- E is still the lowest area (6.06), for the opposite reason from round 1: then development was invisible, now it is too generous.

### 3. Front office: a cap-stuck league and contested free agency you can't read (04, 05, 02, 07, 01). Major. This is why D fell.
- **Picks buy nothing** (05). Four firsts for an 88 got "Not even close". The tax works like a hard cap: a $12.8M signing cost $65M in tax. No AI team has space, so dumps are impossible (04).
- **"What would make this work?"** still overasks or does nothing (04, 07).
- **Contested FA losses with no reason given:**
  - 02 bid $15.8M for Black against Detroit's $14.8M and lost, with the message "money matters most".
  - 04 lost LaVine at $14.8M against $14.7M.
  - 01 lost Black by $0.1M.
  - 07 lost to identical offers.

  Whatever decides it (role, team, years, mood), the player never says it.
- **The payroll goal flips after a neutral trade (04). Verified in code.**
  - `forcedPayroll` (src/core/league/ownerGoals.ts:545) counts only inherited contracts.
  - Trading Draymond + Niang for Beal turns inherited salary into "his own".
  - `forcedPay` then falls under the line, and the target snaps from about $223.9M to the $201M tax line.
  - The goal scored −100, then −72. It is capped at weight 0.2, but it reads as unfair.

### 4. Live games are still slow, and the fast controls are hidden (01, 05, 06, 07, 09, 10). Major.
- A full game took about 12 minutes for 01, 4-7 for 06, and about 20 at 1x for 10.
- 4x is only in Settings → Live games, so 06 found it after about 20 games. The pause bar offers 2x and Key plays but not 4x.
- Skip ahead sits behind Pause (05, 07, 09).
- Live-screen overlays stack: the tour, staff calls, run cards and tired cards. The Timeout button is grey while a card is open (06).

### 5. The playoff sim doesn't stop (10, 01, 05). Verified.
- "Sim to end of playoffs" can run the whole postseason without stopping.
- Settings (`src/ui/Settings.tsx:246`) promises a stop for "a starter hurt … and a playoff series". The rules in calls.ts stop only for top-`STARTER_RANK` players out `STAR_OUT`+ games, and make no series call when the staff measured no gaining counter.
- There are dead days after a sweep with no "Sim to next game" (05).
- There is still no title-celebration moment (05).

### 6. Sim swings and realism nits (06, 03, 05, 07, 08). Minor to major.
- **Large single-game swings.** A 32-0 first-quarter run, 96% eFG on 57% looks in a quarter, a 1-in-165 night and a 1-in-35 night in 25 games (06). The game labels the luck, so nobody felt cheated, but 06 felt a half lead meant nothing.
- **High playoff scoring** (05: 149-133).
- **Foul-outs about 2x the target** (07): 257 a season against 130.
- **03's numbers:**
  - Stars about 3 TS points low.
  - Threes under-assisted, 73% against 85%.
  - A 29th-ranked defense won 59.
  - Coach of the Year went to a 48-34 coach over a 61-21 one.
- **08's numbers:**
  - Ratings too high: most of the league is 70+.
  - Star minutes low: a 36-minute target for Wemby was silently scaled to 26.4 mpg, and he then asked for a trade.
  - OKC went 70-12.

### 7. Analytics asks (03, 06). Wants, not bugs.
- Error bars on lineup and on/off numbers.
- Per-100 and per-36 views, and per-player shot zones.
- An assistant that uses the game's own analytics.
- **The report shows two "luck" figures. Verified.** In `src/ui/games/report/SummaryTab.tsx`, the header strip (scheme, luck and "Your moves") shows `luckPts` net, while the factor list shows a separate luck estimate. One report showed +10.4 and +10.1. The three-figure strip also looks like it should add up, and it doesn't.

### 8. Fictional-league and newcomer onboarding (09, 08). Minor.
- No "fix it" card when losing early.
- Jargon.
- A guide step that won't tick.
- The fictional league has no hook: no story or stars to care about.
- The setup wizard's owner-goal text changes between steps (27 wins/win-now, then 26/builder).
- Invented coaches and nicknames bother the purist (this is store-safe by design).
- GM-only careers credit the user as head coach (08).

### 9. Owner oddities (07, 05). Minor; maybe the automation.
- A win-now Denver owner with Jokić at 93 and Murray at 88 asked for 23-27 wins.
- The team went 28-54 and 23-59 under 07, then 48-34 under the AI with the same core. This may be how 07's script set the rotation; it's worth a look.
- The owner is soft on a 41-41 season (05: −10).

### 10. Bigger screens and tap targets (10). Minor.
- Heavy bottom chrome at 375 px and tap targets under 44 px.
- Tablet and desktop are a stretched phone, except the game-day desktop rail, which 06 liked.
- 3D at 1280 under software rendering ran at 3-4 fps with the "running slowly" bar. It looks like a broadcast on a real GPU (06).

## Bugs (deduplicated, with who saw them)

Repro steps and screenshots are in each report's Bugs section.

**Game day**
- **Play-call spam (06). Likely.** Tapping a play card repeatedly journals each tap. `LiveGame.callPlay` (`src/state/live.ts:243`) records every op with no dedupe, and the report then listed about 70 identical "Iso: Giddey – Ran it: 3 points" rows at Q1 5:30.
- **Game plan mismatch (06, unconfirmed).** The page said "Double-team Maxey", but the report's Your plan said "Double-team Brown", which was an earlier pick.
- **Early foul-out banner in 3D (06).** "Giddey has fouled out" at Q1 5:21 with 3 team fouls.
- **A live game finished while away (06).** He left at Q4 1:25 and came back to a final. This may be the intended leave behaviour; if so, say so.
- **A stale Final on Watch & coach** until the next game loads (06).
- **Sub card lingers** after a tap with manual subs (06).
- **Timeout button unclickable** while the Last-possession card is open (06, script-only so far).

**Season and flow**
- **Guide steps don't tick.** Rotation (10) and plan (09). Plan ticked while Games showed none (01).
- **Counter stuck** on "Staff still looking…" (10).
- **Digest sheet blocks Play** (02, 05, 09).
- **Stale rotation after the summer** (173 minutes) with no queue alert (03).
- **Games list skips the next game** (03).
- **Sim to end of playoffs never stops**, against the Settings text (verified, theme 5).

**Front office**
- **Dead buttons.** The team-option "Decline" (01) and "Open free agency" on the Today bar (01).
- **"Make offer" signs without a confirm** (04). Lowball penalties stack silently (04).
- **The two-tap release looks dead** after the first tap (10, 08).
- **NYK accept possibly a no-op** (01, unverified).
- **Payroll goal flip** (verified, theme 3).
- **No aging warning on a re-sign** (07). Holiday's salary looks odd (08).

**Reports and stats**
- **Two luck figures on one report** (verified, theme 7).
- **Real-season +/- column** repeats +8.5, and current BPM shows "—" (03).
- **Shots tab draws a half court** (03).
- **SGA, 0 rebounds in 40 minutes** (05).
- **Score count-up text** captured mid-animation (10).
- **Stale injury line** on an old report (10).

**History**
- **Westbrook shown as SF** (08).
- **"Latest in" index quirk** (07).
- **GM-only credited as head coach** in awards and history (08).

## Suggested order

1. **Show what coaching did** (theme 1).
   - Per-call before/after lines with an expected baseline, and a season "Your coaching: ±x wins" against the staff.
   - Let the forecast move when tactics really change the matchup, or say why it doesn't.
   - Make style tests conclude, or say they won't at this sample size.
   - This is the audience's core promise, and it's the top ask of 01 and 06.
2. **Pull the rebuild back** (theme 2). Check the user-side development levers (top-10 +2, `devPriority`, anchors) against an AI team's picks over 5 seasons, and aim for a 4-to-6-year rebuild, not 3.
3. **Unstick the front office** (theme 3).
   - Give the AI some cap space and let picks buy players.
   - Have the losing FA bid say why it lost.
   - Fix the `forcedPayroll` flip by counting traded-in salary that replaced inherited salary.
4. **Live speed** (theme 4). Put 4x on the bar, put Skip ahead next to it, and keep one card at a time.
5. **Make the playoff sim stop** for every user series, or change the Settings text to match (theme 5). Add a title moment.
6. **The bug list.** Play-call dedupe, dead buttons, guide ticks, the digest blocking Play, one luck figure per report.
7. **Realism nits** where cheap: foul-out rate, star minutes honoured or explained, playoff scoring.

## Caveats

- Same personas and brief as round 1, but each tester played different seeds and teams, so the per-tester deltas are noisy. The area averages are the better signal.
- Headless Chromium with software rendering. The 3D and frame-rate judgements are a floor, not a real phone.
- Scripted play: some bugs (06's timeout button, 07's Denver collapse, 01's NYK accept) may be artefacts of the automation. They are marked unverified.
- Sonnet testers rate generously and cluster at 7–8. Read the direction and the reasons, not the decimals.
- Not covered this round: long-run multi-season fictional leagues and real phones or GPUs.
