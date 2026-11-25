# 03 — The Analytics Nerd
## Who I am and what I played
Data analyst, 29. Real league, GM + Head Coach, Minnesota Howlers (West). I picked them as "good, not best". The roster turned out top-heavy: Edwards 91, LaMelo 89, Gobert 84. Phone 390x844, headless, 3D off.
- **2026-27:** 82 games, 46-36, 6th seed, swept 0-4 in round 1 by LA (Edwards hurt).
- **2027-28:** 82 games, 49-33, 5th seed, lost round 1 to SAS (Ball out).
- **Live games:** one, opening night at MIA (about 6 minutes in, then "Sim to final"). I coached nothing else live.
- **Elsewhere:** played the offseason (re-sign, free agency, rolling to a new season) once. Roughly 90 scripted sessions. Sim speed was about 3-5 s per month.
- **Repo check:** one `npm run real-check`, with its numbers quoted below. I didn't use `season-test`.

## Play log
1. **Oct 21, opener at MIA (L 132-139).** I opened the game report and checked the sums by hand.
   - Box: 51-86 FG, 17-37 3P and 13-22 FT give exactly 132. MIA's 50-86, 13-29, 26-34 give exactly 139.
   - Player points sum to the team total. Shot-zone splits (21-26 rim, 13-23 mid, 17-37 three) sum to 51-86. The +/- column sums to -35, which is -7 × 5.
   - eFG% 69.2 and 65.7, and ORB% 5.6 and 30.8, all recompute from the box.
   - I felt clever. This is the first sim I have ever audited that held up.
2. **Oct 21 game report, "what decided it".** The report decomposes the margin three ways, and the figures don't line up:
   - "Free throws −7.8 pts" in the list.
   - "free throws −13" in "How the margin adds up".
   - A separate "looks +10.3, luck −4.3".
   - The page says the readings "overlap", which is honest, but a nerd wants one ledger.
3. **Nov 20, 11-4, net +9.7 (5th).** I read Lineups and On-off and found a clear villain.
   - Konchar: on +0.8, off +15.5. Five-man units with him ran −39 and −17.6 net.
   - Kuminga: on +14, off +4.9. The Ball/Edwards/Kuminga/McDaniels/Gobert unit was +17.2 in 94 min.
   - I hand-checked on/off against the team net, weighting by on-court minutes where the team has 48 per game, not 240. It reconciles (Edwards 556 min on at +8.5 and 212 off at +12.4 gives +9.6 against +9.7). The bookkeeping is right.
4. **My lineup decision.** I started Kuminga for Dosunmu, cut Konchar from 19 to 8 minutes, and raised Dosunmu and Lyles. My arithmetic slip left the minutes at 252 (the game scales it to 240 without complaint).
   - Konchar's edit did not persist the first time. I closed the browser right after "Done" and the target was back at 19 on reload. A redo with a pause stuck. This is probably a save race, but it is a trap.
5. **Dec 1-20, 4-9, net +9.7 down to +4.5.** The owner was furious ("Six losses in a row. I don't accept that."). Did my change cause it?
   - The coach's inbox answered with replay-based counterfactuals. Dec 13: "inconclusive, between −0.9 and +1.0 a game". Jan 3: "seems to have hurt: −0.6 a game, give or take 0.3 over 20 games. Put it back."
   - Season Analysis has a "Since you changed it" card with a Put back button. I pressed it on Jan 12.
   - This is the best feature I saw in any sports sim: it grades my decision with a margin of error, not with the record.
6. **Jan 12, still 22-19.** Konchar's season on/off finished at −10.2 on and +12.1 off over 490 min. The engine really does punish his minutes (he's a 73 with a 16th-percentile three and a 24th-percentile shot creator). His target was set to 7 after my first edit was lost (see Bugs), so I only have a few weeks of cleaner data on it.
7. **Feb 6, deadline.** "Buy a player better than your fifth best" was the staff's pitch, with "nobody the staff asked takes what you can send". I then used "Sim to end of regular season", which skipped past the deadline and a CHA offer for Dosunmu. I didn't expect a big sim to be able to skip the deadline's decisions.
8. **Apr 24, 0-3 down in round 1.** A fun "elimination game tonight" sheet with Coach it live / Not yet / Sim it. I simmed it. 86-118, out in 4.
9. **Summer re-sign.**
   - The market showed me Kuminga's ask of $14.4M "over your limit": his rights cap me at $7.3M.
   - I signed Lyles for 3 years at $8.5M. The sheet defaults to the player's wanted length, and my 1-year pick got overwritten. The default behaves like a trap for an aging bench player.
   - The Open free agency button throws a confirm sheet ("Let them go and open"), which is good UX.
10. **Free agency, Day 1 to 9.**
    - I bid on Kuminga with the mid-level ($14.4M × 4). Denver won at $14.9M. The inbox told me exactly why: "DEN paid more. Winning him would have taken about $15.2M a season from us."
    - Prices fall a lot across 9 days (DiVincenzo $12.2M to $6.7M, Ayton $5.6M). I took Powell (79) at $5.3M with the MLE and two 1-year vets at the minimum. I'm unsure whether that deflation is real market behavior or a game-the-clock exploit.
11. **2027-28, 11-4 start, then 9th in the West on Feb 5, then 21-7 to finish 49-33.** My team's net was +4.1 (9th). The owner's goal had dropped to 40 wins after a year of aging (Gobert 84 to 80, McDaniels ACL).
    - Edwards had on +9.1 and off −9.1 over 2,850 min. Payton II was on −14.7, Clark on −24.7 and Evans on −7.1. I never found a lever for any of them beyond the Rotation sliders.
12. **End-of-season-2 star check.** Edwards 31.0/5.3/5.2 on 63.1 TS. Dončić 32.7. SGA 31.3. Jokić only 25.6/11.3/8.6, 40.4% from three (63.1 TS). Giannis hit 0.3 threes a game at 19.6%.

## Scores
| Area | Score /10 | Why (one line) |
|---|---|---|
| A First hour (hook + learnability) | 7.5 | Clear checklist, owner goals up front, instant game; Play options sheet is unusual but fine. |
| B Coaching depth (tactics, rotation, game plans) vs FM | 7 | Real levers (shape, coverage, roles, stint plan, closers) and honest test cards; every "staff test" I saw read "no clear edge", so little felt decisive. |
| C Game day (live coaching: feel, and does it matter) | 6 | One live game: live box with play types and PPP is excellent; I did not coach enough to judge. |
| D Front office (trades, free agency, draft, cap/CBA) | 7 | Day-by-day bidding with reasons for losses and a price slide is deep; Bird-rights limit text is confusing; skipped trades and draft (no picks). |
| E Rebuild & development (youth growth, draft, patience) | 5 | Only saw an aging contender; no picks both years; "Summer development" mail exists. Mostly N/A. |
| F Analytics (depth, usefulness, correctness) | 8 | Numbers reconcile and decisions get graded; missing shot-zone and opponent tables, and some leaders are off. |
| G Sim honesty & realism (stats, outcomes, no rubber-banding, long-run world) | 7 | League averages close to real; star lines compressed a touch low; a 66-16 and a 20-62 team look right. Rim FG% is the weak spot. |
| H Stakes & story (owner, job, playoffs, history, moments) | 7.5 | Owner mail and "elimination game tonight" land; slump and goal movement feel real. |
| I UX & feel on my device | 7 | Readable on a phone, but the Play sheet and long text tables make number-work slow. |
| J Overall for this audience | 7.5 | The best analytics-led GM loop I've seen in a sim; thin where the nerd wants raw tables. |

## What hooked me
1. **The game grades my decisions with error bars.** "Seems to hurt: −0.6 a game ±0.3 over 20 games", with a Put back button and a second look scheduled (Jan 3, Dec 13, Jan 8 inbox). This is where the game *uses* analytics rather than displaying them.
2. **Box scores that reconcile exactly.** Opener at MIA: box, shots, Four Factors and +/- all sum. I could not find a single contradiction in numbers I could check.
3. **Lineups plus a real on/off screen.**
   - 5/3/2-man tabs, "Faded: under 100 possessions, too few to trust", and a "Starters"/"Closers" button on units.
   - One tap tells me Konchar is a −10.2 on/off at 490 min. This is Cleaning the Glass on my phone.
4. **Season Analysis "How teams see you".** It shows Net, ORtg, DRtg, pace, eFG%, TOV%, ORB%, FTR, opp versions, 3PA rate and rim rate, each with a league rank (mine: 3PA rate 45%, 10th; rim rate 33%, 7th).
5. **Honest free agency.**
   - The reason I lost Kuminga was spelled out ($14.4M against Denver's $14.9M).
   - FA cards show "Rim pressure D → C at 28 MPG", so the staff scores a signing against my own weak grade.

## What pushed me away
1. **No raw shot-location and opponent data (major).**
   - Teams table has only ORtg, DRtg, pace, eFG, TOV, ORB, FT rate, 3PA rate, opp eFG. No rim/mid/three frequency and accuracy, no opp TOV/ORB/FT rate in the league table, no per-100 player stats, no shot charts for players, no clutch splits.
   - The only per-game shot-zone view is a three-line "Shots" tab in a game report. I can't ask "does Edwards shoot 40% from three on pull-ups?".
2. **Staff tests mostly say nothing (major).**
   - Every "staff's latest test" I saw ("Ice their screens", "Stop doubling", "Stay home") read "No clear edge". "Your settings, net" lists Drop coverage, Shape and Switching as "Cost you" with no size.
   - I never got a number I could act on, besides my own rotation change.
3. **Minutes and rotation plumbing (major).** The assistant silently redoes my rotation after injuries. My edit to Konchar did not persist once. Minutes totals of 252 and 253 were allowed with only a banner. There are no stagger rules (Ball and Edwards on the floor together was the weakest star pair; I couldn't separate them).
4. **A big sim can skip the deadline (minor).** "Sim to end of regular season" passed Feb 11, a CHA offer and my "buy" suggestion. It stopped at the first staff call, and I assumed it would stop at the deadline.
5. **Star lines are compressed a little (minor).**
   - Jokić's real-check line is 25.3/12.2/9.2 against 27.5/12.9/10.6 real. In my game he was 25.6/11.3/8.6 in season 2 with 40% from three, and 27.4 in season 1 at 35.6%.
   - Giannis 19.6% from three on 0.3 attempts is plausible. Real-check TS% correlation is only 0.63; rim FG% r is 0.32.

## Bugs
- **Konchar minute edit did not persist (once).** Rotation, tap Konchar, type 8 in the minutes field, Tab, Done, then close the browser immediately. On reload the target was 19. Repeating with a 3-second wait persisted at 7.
- **Re-sign sheet length.** I chose "1 yr" for Lyles and the confirm said "3 yrs · $8.5M", so the signed length was not my choice. I re-picked and it stuck on "wants". The length selection reset after Make offer.
- **Margin decomposition inconsistency.** Oct 21 game report: "Free throws −7.8 pts" in the list against "free throws −13" in the margin line. Screenshot: `players/03-analytics/gr_Summary.png`.
- **Compare screen.** Edwards vs Konchar rates Konchar "Athleticism 90th", and the "(better)" tag lands on Age. Minor.
- **Most Improved Player.** LaMelo Ball (89 OVR, 24.0 ppg) won MIP on 2026-27. He is a former All-Star on a 20 ppg career line.
- No page errors in `page.errors` through any session.

## Against the genre (FM / BBGM / MyNBA / Hoop Land)
- **Beats BBGM** on explanation (why a game was lost, why a bid failed, whether my change worked) and on lineup tools. BBGM has more raw columns, shot tables and a trade AI I can poke at, and nothing here exports stats.
- **Beats FM** on turnaround and the clarity of the decision grading. FM has deeper tactics, more scouting data and an opposition-instruction report. FM's "Analytics" tab is a spreadsheet; this game's is a coach.
- **Beats MyNBA** on honesty. 2K's stats are noise by comparison.
- **Loses to all of them** on volume: no CSV, no custom filters beyond a few, and the 2D court is the only live view I used.
- Real-check backs the realism claim: correlation with real 2025-26 lines over 227 regulars is PPG 0.945, APG 0.923, RPG 0.948, BPG 0.936, 3PM 0.946; minutes 0.904 (MAE 3.05); shot-diet share r 0.96/0.93/0.98. All 24 "reputation anchors" held. Gaps: TS% r 0.630, rim FG% r 0.319, and low-minute vets like Ace Bailey (14.2 vs 27.6 real).

## League-wide realism (after a full season, from the Teams and Players tables)
| Metric | 2026-27 league avg (range) | 2027-28 league avg (range) | Real NBA norm |
|---|---|---|---|
| Pace | 97.9 (94.2-101.4) | 98.4 (94.6-101.1) | ~99-100, a touch slow |
| ORtg / DRtg | 116.7 | 116.0 | ~115-116 |
| Points per team | 114.2 (104.5-122.5) | 114.1 (102.1-122.9) | ~114-115 |
| eFG% | 54.3 (50.3-58.2) | 54.4 (50.9-59.0) | ~54.5 |
| TOV% | 12.9 (9.5-16.4) | 13.3 (10.7-18.0) | ~13 |
| ORB% | 25.2 (20.4-31.7) | 24.8 (20.1-30.8) | ~24-27, depends on definition |
| FT rate | 25.2 (20.2-30.3) | 23.9 (19.6-28.8) | ~0.24-0.26 |
| 3PA rate | 41.3 (33.8-48.1) | 43.1 (34.6-49.1) | ~42-43 |
| Net rating, best / worst | +13.0 / −10.2 | +7.7 / −10.0 | best about +9-11 |
- Season 1's best team was OKC at 66-16 (+13.0), which is a bit extreme. Season 2's top net of +7.7 is flatter than the real league's top.
- Leaders: Dončić 32.0 ppg, SGA 31.5, Edwards 28.5; Wembanyama 3.6 blk; Jokić 12.7 reb and 18.5 WS. These look right.
- Season-1 MVP (SGA), DPOY (Wembanyama) and champion (OKC over CLE) are believable. LeBron retired after the 2026-27 season in the news feed.
- Real-check's "most over-played/under-played" lists show roles for some bench players are off (Ace Bailey 14.2 min against 27.6 real), a known weak spot for the minutes model.

## Does the game drive decisions, or just display?
- **Drives:** the coach's counterfactual grade of my own changes, the "Starters/Closers" buttons on lineups, FA cards that price a signing in grade points at my minutes, the owner's goals, and the Needs-you queue (an injury stops sims and offers "Let the staff redo the rotation").
- **Only displays:** Teams-table ranks, on/off, and most Season Analysis grades. Nothing says what to do with a "Rim pressure D" or a "Three-point D: D" besides a tactics tweak with a "No clear edge" test.
- **What I wish was there:**
  1. Lineup net with opponent-adjusted strength and a "with/without" table by pair that I can sort on a sample size.
  2. Shot charts and zone frequencies and accuracy per player and team; shot quality (xeFG) next to actual.
  3. Per-100 and adjusted stats; clutch; opponent-by-play-type PPP (the live game shows play types and PPP, and it vanished afterwards).
  4. A stagger tool and a "minutes together" cap in Rotation.
  5. Season-to-season on/off (the lineup tab can show last season but I never saw a two-year view).
  6. Export of every table.

## Would I pay and keep playing
- **$7.99 phone unlock:** yes. The loop (read numbers, make a change, get graded) is worth it.
- **$14.99 Steam:** only with an export button and shot charts; as it stands, probably not.
- **Hours:** 40-60 if the decision grading keeps finding new things; about 15 hours otherwise.
- **Recommend to a friend:** 7.5/10.

## The one change that would most raise my score
Put shot-location data (rim/mid/three frequency and FG%, for each player, lineup and team, with league rank) into the Teams, Players and Lineups tables and the Season Analysis grades, and make the staff's "Rim pressure: D" style grades link straight to the table behind them. The game already grades decisions better than anything else I've played; it just shows me too few of the numbers it is grading.
