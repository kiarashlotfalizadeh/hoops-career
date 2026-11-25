# 03 - The Analytics Nerd
## Who I am and what I played
Real league, Denver Prospectors (9th of 30 by roster rank, Jokic 96 and Murray 89), GM + Head Coach, phone 390x844. I played two full seasons with the offseason between: 2026-27 (57-25, 2nd West seed, swept POR 4-0, beat HOU 4-1, then lost the conference finals; OKC won the title) and 2027-28 (36-46, lost the play-in; Jokic missed 29 games). That is 164 regular-season games plus the play-in and a deep 2026-27 playoff run. I coached one playoff game live (R1 G1, 145-124 win, used Skip ahead then Sim to final). Everything else was Quick sim, Sim 1 month or Sim to end. I checked box scores, the team and player tables, lineups and on-off, Season Analysis, game reports, the owner and trade screens, re-signing and free agency. About 30 scripted sittings. I also ran `npm run season-test` and `npm run real-check` once each.

## Play log
1. **Preseason, Oct 2026.** The team page shows last year's per-game lines (Jokic 27.7/12.9/10.7, believable). Rotation and Tactics both open with "keep the staff's" quick wins. The owner wants 48 wins, a playoff round and payroll under $237.6M.
2. **Game 1, Oct 22 at OKC, lost 106-124.** I reconciled the box score by hand. Points, minutes (240), FG/FGA, 3P, FT, rebounds, assists, turnovers and the +/- sum (-90 = 5 x -18) all tie out for both teams. eFG 47.8 / 61.9 and FT/FGA 20.9 are right. The report says OKC's shooting luck was -24.9 pts (61.9% eFG on looks worth 54.5%). It also says "Tactics +15.0", then "looks +7.9" in the margin identity (7.9 - 24.9 - 1 = -18). Two labels for what looks like the same number.
3. **Nov 22, 12-2 after a 12-game streak.** "Ahead of every projection." League table: mean ORtg 117.1 and DRtg 117.1, net sums to 0.0, wins sum equals losses (241/241), pace 98.0, eFG 54.1, TOV 12.7, 3PA rate 41%. All realistic.
4. **On-off check.** Murray on +11.3 / off -9.8, 543 of 672 team minutes. Weighted: 0.81 x 11.3 + 0.19 x -9.8 = 7.3, which is exactly the team net. Johnson also ties out (7.28). The analytics are internally honest.
5. **Data-driven calls.** Braun (-11.7), Walker IV (-12.6) and Holmes (-17.0) were bad on-off after 14 games (150-280 min, noise). I did not cut their minutes, because 14 games is far too few. By season's end the "bad" players had flipped (Braun +10.2 ON NET). The game says "faded under 100 possessions" on lineups, but on-off has no such warning.
6. **Trade deadline, Feb 6, 35-17.** The staff priced out Mikal Bridges (83) for Gordon (80) plus two 1sts and three 2nds. Verdict: "forecast barely moves your postseason chances", stand pat. I agreed. This was the best analytics moment: payroll with and without, contract years, and an honest "no".
7. **Regular season finished 57-25, +7.2 net.** League wins total 1230, every team's net is internally consistent (DEN PTS-OPP 7.2 vs standings +7.1 vs Net +7.3, which is per-100 vs per-game rounding).
8. **Playoff Game 1 live, Apr 18.** Staff and "To win" probability (74%) worked. The live Stats tab (box, play types, PPP) is real analytics. End-of-Q1 said "POR +11.3 pts luck" from one quarter, which is overconfident. Final box reconciled (+/- sums to 105 = 21 x 5).
9. **Offseason, Jun 2027.** The re-sign screen is excellent: Bird-rights limits, a tax line, "Keep everyone $224.7M, tax about $18.7M", Johnson's ask dropping from $23.1M to $12.3M. I extended Jokic ($64.9M x 3, 8% raises, totals check). The Free Agents tab shows staff-minutes grades ("PnR D: F to D at 27 MPG").
10. **I lost Mathurin (78/81) on a tie.** Our $14.8M x 4 matched Toronto's exactly, the inbox said "as good as level to him", and winning would have taken $15.2M. Clear and fair.
11. **Thybulle test.** The page said signing him at $7.85M would add $15.2M of tax ($10.7M to $25.9M) while still not fixing PnR D. I passed. Real cost-benefit data that changed my decision.
12. **2027-28 owner expectations.** After a 57-win conference-finals team: "Win about 34 games, reach the play-in, get under the tax". It had lost DeRozan (retired) and Walker/Bagley. Murray fell 89 to 86.
13. **Dec 2027 collapse.** Jokic out 29 games (MCL). 12-12 became 14-38 (2-26 in 28 games). Jokic on +11.7 / off -10.2, a 22-point swing. Then 19-8 after he returned. The sim was honest here (a 96 with 35% usage is the whole team), but the stretch is brutal.
14. **Owner review.** Season grade +7. "Get under the luxury tax: $7.0M over (-50)" even though I deliberately kept the payroll for the stretch.
15. **Repo checks.** `season-test` showed league PPG 115.5-116.3 and OKC champion in all simulated seasons; `real-check` passed 24 of 24 reputation anchors.

## Scores
| Area | Score /10 | Why (one line) |
|---|---|---|
| A First hour | 7 | Clean start, action queue guides you; the 12-game streak hooked me. Real names + invented nicknames fine. |
| B Coaching depth | 7 | Playbooks, Tactics board, Season Analysis with grades, staff tests; no per-opponent plan came up in my sims. |
| C Game day | 6 | One live game only. Win probability, Hardin calls with est. +0.7 pts, Skip ahead menu are strong. 3D skipped. |
| D Front office | 8 | Trades, re-signing, FA with tax math are the best part. Competing offers and "decides day 3" are good drama. |
| E Rebuild & development | 5 | Growth tab is clear but I played a win-now team. Draft was skipped (no picks). |
| F Analytics | 8 | Box scores reconcile exactly, league means realistic, on-off ties to team net. Loses points for label inconsistency and no on-off noise warning. |
| G Sim honesty & realism | 7 | Ratings, scoring and efficiency are credible. Paint pts 72 of OKC's 74 two-point points and 29/33 at the rim are not. The Jokic-less 2-26 stretch is brutal. |
| H Stakes & story | 7 | Owner letters, awards, history, news are excellent. Expectations (34 wins after 57) and "Power rankings 23rd while 6-3" bug feel wrong. |
| I UX & feel | 7 | Fast, readable, dense. Sheet-based flows can trip bots, humans fine. Some stat tables are wide to scroll. |
| J Overall for this audience | 7.5 | The analytics honesty is rare in the genre. |

## What hooked me (top 5, each with evidence)
1. **The numbers reconcile.** Box score for game 1 sums on every line, +/- sums to margin x 5, league ORtg/DRtg mean 117.1/117.1, net sums to zero, wins sum to 1230, on-off weights to team net 7.3.
2. **"Shooting luck" vs "looks" split.** OKC 61.9% eFG on looks worth 54.5%, with the margin identity (looks + luck + FTs = margin). It tells you "don't change anything."
3. **Cost-benefit transparency.** Bridges deal "barely moves your odds"; Thybulle +$15.2M tax; Reed 4 yrs $45.3M; extension 8% raises all add up.
4. **Honest sample-size cues.** "Faded: under 100 possessions, too few to trust" on lineups; "One night's shooting is luck."
5. **Season Analysis grades with ranks.** ORtg 1st, DRtg 19th, Opp eFG 27th, grades F in Three-point D, Perimeter D and Transition D, with a "how teams see you" panel I could act on.

## What pushed me away (top 5, each marked dealbreaker / major / minor, with evidence)
1. **Owner expectations after the breakout (major).** 57-25 and a conference final, then "win about 34, reach the play-in", with a tax goal I could not meet without selling my core.
2. **Margin-reading labels (minor).** Summary shows "Tactics +15.0" but the identity line says "looks +7.9". Playoff G1 shows Tactics +1.8, looks +24.5. Two names, two numbers, one reading.
3. **On-off with no uncertainty (minor).** On-off shows Holmes -17.0 on 148 min with no CI, while lineups gets a faded flag. A new user will bench the wrong guy.
4. **Rim/paint realism (minor).** OKC 29-33 at the rim (87.9%) and 72 paint points of 74 two-point points in one game. An analyst sees this as a shot-zone model quirk.
5. **Long-run concentration (minor).** OKC won the title in my league and in every simulated `season-test` seed; sim mean ORtg is fine but the dynasty feels baked in.

## Bugs (repro steps, screenshot path)
- **Power rankings 23rd while DEN was 6-3, +6.1 net, 8th (Nov 9, 2027).** Today screen "Power rankings 23rd" vs the Teams table (+6.1, 8th). Screenshot: not captured; text from /tmp/claude-0/-home-user-hoops-career/ab24f4d7-2083-5558-9c59-0f226efc62e3/scratchpad/playtest/players/03-analytics/s48.mjs output.
- **Standings margin +7.1 vs Teams table PTS-OPP +7.2 for the same 14 games.** Minor rounding mismatch.
- **"Mid-level: Used" while a Mathurin offer was only pending.** The summary says Used, which could mislead.
- **Game report player-grades table lists 12 of 13 players who played** (Wiseman was left out) while the box score has 13. /tmp/.../players/03-analytics/box2.txt.
- **Live game "Play options" sheet sometimes keeps "Sim 1 day" over the primary Done button when the season is over** (found while scripting; may only bite automation).

## Against the genre (FM / BBGM / MyNBA / Hoop Land: where it wins and loses for me)
**vs Basketball GM:** much better "why did that happen" layer (looks vs luck, tactic effects, staff advice), better contract negotiation clarity. BBGM still has deeper stats tables (play-by-play shot chart exports, per-36 splits). **vs FM:** the game-report "What decided it" cards and the staff voice are FM-like, and the owner/inbox flavor is great, but FM has far deeper scouting and set-piece tuning. **vs MyNBA 2K:** no visuals comparison from me, but the sim's honesty is closer to BBGM than 2K. **vs Hoop Land:** more transparent about why.

## Would I pay and keep playing
$7.99 phone unlock: yes, easily. $14.99 on Steam: yes if the stat tables get CSV export and a few more advanced splits (clutch, lineup vs lineup). I would put in 40-60 hours. Recommend to a friend: 8/10.

## The one change that would most raise my score
Make the analytics consistently self-explaining: one name and one number for the margin reading (call it "Looks" everywhere), sample-size shading on on-off, and make owner expectations track the last season's result so the story matches the data.
