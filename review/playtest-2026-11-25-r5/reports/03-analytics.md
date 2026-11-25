# 03 — The Analytics Nerd
## Who I am and what I played
Denver Prospectors (real 2026 league, West, picked 9th of 30), GM + Head Coach, phone 390x844. Two seasons: 2026-27 (57-25, 2nd West, swept 0-4 by SAS in round 2) and 2027-28 (37-45, missed the playoffs; rotation went stale, see log). 164 regular-season games, 1 live game (the opener, to halftime then "Sim to final"), the rest quick-simmed. About 3 hours. Repo checks: `season-test` once (worked), `star-check` once (printed nothing after the npm header, so I got no data from it). I did not run `real-check`.

## Play log
1. Oct 22: New career took 6 s. Today screen is clean and tells me owner goals (49 wins, win a round, payroll under $237.6M; later reset to 47 wins and $221.6M "on opening night"). Opening-night sim stopped for nothing; "Sim 1 month" = 14 games in 9.5 s.
2. Oct 22 live game at OKC: 144-148 in OT. The halftime report showed "Denver's shots fell above their looks: 65.9% eFG on looks worth 57.6%, luck +14.1 pts". I loved this. Box sums reconcile exactly (points 144, minutes 265 = 240 + 25 OT).
3. Nov 22, 10-4: league team table (ORtg/DRtg/Pace/four factors, rank-colored) is excellent. League means at game 53: ORtg 116.37 vs DRtg 116.40, eFG 54.2, TOV 12.95, pace 98.1, W = L = 778. Net +5.7 at 35-17 matches the Pythagorean win rate. That is realistic and honest.
4. Nov 22 lineups: 5-man, 3-man, 2-man and on/off tabs with a "faded: under 100 possessions" warning. On/off said Walker IV was -15.5 on/off (22.8 mpg, 74 OVR). I cut him from 18 to 10 target minutes and gave S. Jones/Holmes 14 each. Felt like a real analyst.
5. The game then tracked my change: "−0.2 a game ±0.5 over 10 games, too close to call, second look in 7 games", then ±0.3 over 20 games "final". Best feedback loop I have seen in a sports sim. It also told me honestly that my change did nothing measurable.
6. Dec 22 trades: DET offered Duren (86) + Joe for Murray (89). The "with the deal" panel projected Jokić 39 → 46 mpg and "a little short on value". Declined. Accepted NYK's Eubanks + 2nd for Walker (cost nothing, saved tax). The 5-minute analysis of ATL's Okongwu + Dort for Gordon: "What would make this work?" priced it at two firsts plus cash. I passed, stood pat at the deadline (35-17).
7. Season 1 end: 57-25. Net +5.7 → +7.2. DEN grades A+ ball movement/security, F three-point D, F transition D, DRtg 28th. The team never fixed defense and no trade tool pointed me to a fix.
8. Playoffs: beat DAL 4-0, then lost 0-4 to SAS. Game reports had "looks −21.1, luck +21.1, FT −3" for the last game, which was confusing (see bugs). Owner verdict: "Excellent: I will remember this group for the rest of my life" after a 0-4 sweep. Odd tone, but the grade math (47 wins +50, a round +60, payroll +16) was shown.
9. Offseason: skipped straight to a live draft at #37; took Trey Bryant (SG 19, 65/74 → 68/76 after summer). Re-sign screen was great: Johnson's ask fell from $23.1M to $12.3M, projected tax shown per signing. DeRozan (37, 79 OVR) could only be paid 120% of $2.45M, so he hit the market and I re-bought him with the mid-level for $4.35M. Added two minimum guys (V. Williams Jr., Tshiebwe) after a 3-week FA wait.
10. FA market realism: 166 free agents on day 1 included 80 OVR LaVine at $13.2M, 78 OVR Paul Reed at $10.1M, Valančiūnas 76 for $3.1M. Wildly cheap compared to the trade market.
11. 2027-28: owner asks 43 wins (down from 47). Jokić age 32 (95), Murray 90. I used "Sim 1 month" repeatedly with a script that auto-accepted "Give the staff's share" and declined offers. Result: 0-2 start, 8th, 9th, then 37-45. Team net −3.2 (23rd), eFG 52.7 (24th), shot creation and spacing graded F. Murray played 23.6 mpg and Jokić 21.0 mpg (65 GP), both then demanded trades "He expects 32 minutes a game".
12. Root cause I could find (not fully proven): my season-1 manual rotation stayed in place after the roster turned over, "Let the assistant manage" was off, and the Team page rotation showed targets such as Murray 20 and Jokić 21. The game flagged "no minutes" for bench guys but never "your two best players have 20-minute targets". This cost me the season. Partly my fault, but a nerd who set one manual edit in year 1 deserves a louder warning.
13. Offers to coach UTA and MIA arrived at the 2028 draft lottery. Job security 44, "warm seat". Good stakes.

## Scores
| Area | Score /10 | Why (one line) |
|---|---|---|
| A First hour | 8 | Fast create, clear owner goals, action queue guide; analytics visible from game one |
| B Coaching depth vs FM | 7 | Playbooks, coverages, matchups, stint plan, closer, counters; "Staff still looking…" counters never filled in |
| C Game day | 6 | Only one live game; halftime report with looks vs luck is superb; skip-ahead menu good |
| D Front office | 7 | Honest value labels, salary projections and tax per move; FA prices too cheap, no defensive-need filters |
| E Rebuild & development | 5 | Only a #37 pick and one summer; progression numbers seen (+3 to Bryant, −4 DeRozan) but little exercised |
| F Analytics | 9 | Box scores reconcile, league means realistic, lineup/on-off with sample warnings, change-tracking is unique |
| G Sim honesty & realism | 7 | Pace/ORtg/eFG league means real; star games played too high; scoring creeps up in `season-test` (112.9 → 117.0 ppg) |
| H Stakes & story | 7 | Owner goals, job security, coach offers, Cup win; verdict wording after a sweep felt off |
| I UX on phone | 7 | Clear, fast; many confirm taps, sheet buttons hard to script, moments dismiss fine |
| J Overall for this audience | 8 | Best analytics layer I have seen in a mobile sim; fixes needed in rotation safeguards |

## What hooked me (top 5)
1. "Looks vs luck" decomposition in every report: halftime opener said +14.1 pts luck; final said eFG 62.0% on looks worth 55.9%. It actually teaches shot quality.
2. The change tracker: Walker IV 18 → 10 min became "−0.2 ±0.5, too close to call" and later "final". It admits when my analysis was noise.
3. Reconciling data: box score FG/3P/FT/REB/AST/TOV/STL/BLK/PF all summed correctly in game 522 for both teams; W = L = 778 league-wide; league ORtg 116.37 vs DRtg 116.40.
4. Re-sign and FA screens price the real cost: "27-28 tax +$21.8M, $5.0M → $26.7M" for a $11.9M MLE deal; age warnings ("38: −7 to +1 OVR").
5. Scouting: "Their threats", on/off with a usage line, "worse with Sergio de Larrea on floor −8.9 net", defender matchup lines like "Finishing 87 vs interior defense 59".

## What pushed me away (top 5)
1. Stale manual rotation silently wrecked season 2 (major, nearly dealbreaker): stars at 20-21 min targets, no alert, two trade demands. A warning like "Your top 2 players have under 28 min" is needed.
2. Two "looks" numbers in one report (major for analysts): game 1285 says "Denver got better looks +6.3" in the list but the margin line says "looks −2.6"; game 1297 shows "looks −21.1 · shooting luck +21.1" cancelling exactly. Hard to trust the decomposition.
3. "Staff still looking…" on every Counter in the series plan, even after waiting (minor/major): the playoff plan feature looked dead.
4. Free-agent market too cheap and no stat filters (minor): 80 OVR at $13.2M, bargain min signings at 72 OVR; I can't filter by defense, three-point or rim protection, only OVR/position.
5. Large FT swings: OKC took 49 FTA vs my 26 in game 1; Denver's opponent FTR was 30th all year (0.32-0.33). Plausible for a foul-prone defense, but tuning hints felt thin (minor).

## Bugs (repro steps, screenshot path)
- Rotation staleness after the offseason: edit minutes in season 1, run the offseason, start 2027-28, then check `/team/rotation` (Murray target 20, Jokić 21, assistant off). Screenshot: `/tmp/claude-0/-home-user-hoops-career/ab24f4d7-2083-5558-9c59-0f226efc62e3/scratchpad/playtest/players/03-analytics/rot3.png` .
- Report arithmetic mismatch: `/game/1285` and `/game/1297` (playoffs) and the opener (looks −5.4 headline vs −11.0 listed).
- "Sim to end of regular season: 80 of your games · 1,186 in the league" shown on game 1 with 82 scheduled; counts do not match the first-night games.
- Series plan "Staff still looking…" never resolves (`/games/6?tab=plan`).
- Draft screen: clicking "Take the staff's pick" via text did nothing the first two times; only the `button` locator worked (possibly a tap-target problem).
- `npm run star-check` printed only its header and exited with no output (not tested further).
- Scouting says "Points per possession over 83 games" for a team with 82 games.

## Against the genre (FM / BBGM / MyNBA / Hoop Land)
Wins vs BBGM: shot-quality explanations, change tracking, signing cost projections, readable on a phone. Wins vs FM: the "why" layer is clearer than FM's reports. Loses vs BBGM: no custom stat filters, no league-wide advanced player table with BPM/VORP columns (I saw PER, WS, WS/48, TS%, USG%), no trade-finder by need. Loses vs MyNBA: fewer live-game moments (I only played one). Loses vs FM: rotation changes feel brittle across seasons, no "squad planning" summary of aging stars.

## Would I pay and keep playing
$7.99 phone unlock: yes. $14.99 on Steam: yes if rotation safeguards and a stat-filter FA/trade finder arrive. Hours: 40-60 to run a full dynasty. Recommend to a friend: 8/10 (analytics fans), 6/10 casual.

## The one change that would most raise my score
Make every analytic claim self-consistent and every manual setting expire gracefully: one "margin" decomposition with a single looks number across Summary and margin line, and a roster-change check that warns when manual rotation targets no longer fit the roster (e.g., stars under 28 minutes).
