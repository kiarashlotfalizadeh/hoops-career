# 03 — The Analytics Nerd

## Who I am and what I played
29-year-old data analyst. Real league, **Orlando Illusion**, GM + Head Coach, 390x844 phone, headless Chromium, 3D off. I picked Orlando because the roster is good but not the best (Bane 88, Wagner 86, Banchero 86, Suggs 85, and the owner asked for about 51 wins).

I played **two full regular seasons** (164 games), a play-in and two playoff runs. All games were simmed except one live play-in game, which I abandoned after about 6 game minutes. The brief asked for me to coach live; I only sampled it, so I can't speak to live coaching depth. I also ran the 2026 draft, re-signing and free agency, and used both of my repo checks (`real-check`, `season-test`). Time spent: roughly 4 hours.

Results:
- **Year 1 (hand-managed rotation): 36-46**, net -2.9, lost in the 2nd round after the play-in and a first-round upset of Boston (59-23). Owner verdict "Short of it", grade -17.
- **Year 2 (assistant-managed rotation): 55-27**, net +5.2, 5th. The Coach of the Year award went to me. I lost in round 1 to Boston in 6, with Wagner injured.

## Play log
1. **Opener, Oct 21 2026.** Quick-simmed to a 122-99 win. I checked everything. Box sums: points 122 = 47x2 + 11 + 17 FT. Minutes 240. Player +/- sums to 5 x margin (115). Shot zones 20+16+11 = 47 FGM. Everything reconciles for both teams. The Summary tab splits the +23 margin into "looks +7, shooting luck +15, free throws +1" and tells me it was a "1-in-20 shooting night". I was impressed; I've never seen a sim do this.
2. **First hour friction.** The game forced me to release JD Davison before the season (16/15 roster). The release took two taps (the second a "Confirm" button) and my first tap looked like it did nothing. It is a reasonable guard rail, but a first-time player gets no feedback on tap one.
3. **Nov 28, 7-10.** I opened Lineups: 17 five-man units, 68 pairs, and an on/off board with honest "faded: under 100 possessions" greying. Net-rating tabs add up. Bane on +2.7 / off -8.1 over 565 min against a team net of -0.8 checks out arithmetically (69% x 2.7 + 31% x -8.1 = -0.65).
4. **My analytics-driven move.** On/off said Carter Jr. -13, Da Silva -8.8, Black -8.5, Vucevic +17.9. I cut Carter Jr. 27 to 18 min, Da Silva to 8, Bitadze 12 to 22 and Vucevic 29 to 33. I traded Da Silva to DET (the offer came unsolicited, and the staff said it was "in your favor").
5. **Did it work? The game answered.** Gabe Tolbert (assistant) emailed at 10 games and again at 20: *"Inconclusive: the replays put it between -0.4 and +1.0 points a game and couldn't tell it apart from your old setup... the staff's last look."* Season Analysis later printed "+0.3 +-0.3 over 20 games, too close to call". This is exactly the honest answer a nerd wants. I felt clever and humbled in the same minute.
6. **On/off noise exposed.** Bane's early on/off was +13.7 (17 games). By season's end his ON NET was -2.6, and Carter Jr. at -7.4. My early reads were mostly noise. Good on me for checking, bad on the product for ranking players by raw on/off in the default view without a sample warning below 700 min.
7. **Dec 8, trade-deadline calls.** The staff's "buy Jimmy Butler" call wanted Wagner (25, 86) + Isaac for a 37-year-old expiring Butler. It backed it with "the forecast likes your postseason chances more", which is true for this season and terrible for the franchise. I stood pat. At the deadline MIL offered Herro (84) for Carter Jr. + Black + a 1st + four 2nds; I passed. Team finished 36-46.
8. **Oct 2026 sim stops.** After my manual rotation, every injury reshuffle made the sim stop with "2 regulars with no minutes... Keep them out / Give the staff's share". About 5 stops in a season. It's a guard rail against my own settings, but when a manual-rotation player dies the sim won't continue without a decision.
9. **Draft, Jun 2027.** Pick 16. The board shows projection range (e.g. "proj #17-21"), staff read vs POT range, and "places up/down since the preseason". I took Darius Wiggins (staff read 73/POT 78, "Reach - ranked 21st") and after the pick the game showed him as 74/POT 80; by preseason 77/82. The draft tools are the best-explained I've seen.
10. **Re-signing/FA.** Black asked $18.1M x5 for a 47.3 TS% guard; Bitadze $15.8M x4; Vucevic couldn't be re-signed above $3.05M with non-Bird rights. FA is where the game really shows its analytics: every free agent carries "Rim protection F -> D at 27 MPG" (what he does to *my* weakest grade with *my* minutes). The Nurkic sheet showed live bidding ("MIN's offer is ahead... leading takes $15.8M"). Paul Reed chose BOS: the inbox explained why down to "same salary counts for ~15% more from them". Prices then collapsed by half in week 1: Simons (77) went from $13.6M to $6.8M, Ayton (76 C) asked $5.75M against a $11.2M market. I signed Ayton on my mid-level plus three minimum vets.
11. **Year 2, assistant-managed.** I handed the rotation back ("Your rotation was replaced. Undo"). Result: 55-27 (+5.2), versus the manual year at -2.9. Confounded by Wagner +4, Wiggins, Ayton and fewer injuries, so I cannot claim the assistant is better. But my manual edits obviously did not help either.
12. **Year 2 odd choices by the assistant.** It started a 4-guard five (Wiggins, Suggs, Bane, Wagner, Banchero) while the Rotation page warned "too many bigs" for the version I'd hand-made. The assistant also gave minutes to Prince (on -12.4 / off +7.9) and Clarkson (-14.1 on-court), and a bench unit Richardson/Clarkson/Prince/Cain/Penda posted -42.7 net over 39 min. The game itself shows it; it doesn't fix it.
13. **Playoffs.** Year 1: first-round upset of Boston by a 36-46 team (BOS 74% favourites). Year 2: down 3-0, lost in 6, the 1 seed to the 8 seed. The staff wrote after each game: "Outscored by 14.0 a game. The box scores point to shots that didn't fall. That's luck, not the plan." Good voice, correct framing.
14. **Repo checks.** `real-check`: sim vs real correlation over 227 regulars: PPG 0.945, APG 0.923, RPG 0.948, 3PM 0.946, BPG 0.936, minutes r 0.904. `season-test`: OKC 71-11 in the seeded run, 365 injuries a season, league PPG 114.2.

## League-wide realism (after full seasons)
| Metric | Y1 sim league avg | Y2 | Real recent NBA |
|---|---|---|---|
| ORtg | 115.9 | 116.4 | ~115-116 |
| Pace | 97.9 | 98.0 | ~99-100 (a touch slow) |
| eFG% | 54.0 | 54.5 | ~54-55 |
| 3PA rate | 41.7 | 42.5 | ~41-43 |
| TOV% | 13.1 | 13.3 | ~13-14 |
| ORB% | 24.7 | 24.9 | ~26-27 (a touch low) |
| FT rate | .249 | .246 | ~.24-.25 |
| Team PPG | 113.4 | 114.1 | ~114-116 |

The league mean is excellent. The spread is the issue: **OKC 71-11 at +12.9 net** (best-ever tier) and that dominance repeats across seeds (season-test also shows OKC 71-11). Worst net -9.9, team eFG range 49.1 to 59.5. That is wider at the bottom than I like (BKN eFG 49.3 in Y1).

**Star lines** (2026-27, real mode, vs real 2025-26 in brackets): SGA 30.2/4.4/6.4 on 66.6 TS, PER 32.7, +15.3 (30.8 PER) is spot on, and in Y2 34.0 pts, .682 TS, WS 17.2, which is MVP-of-all-time territory. Doncic 31.5/7.8/7.6 (33.5/7.7/8.3) is a touch low. Wembanyama 24.5/10.6/3.1 stk / 3.1 blk, PER 29.8 (29.9) is perfect; Giannis 28.1/9.9/6.0 with 59.8 FG% and 28% 3P is credible. **Jokic is the problem**: 24.0/11.7/8.9, PER 28.0 (real 27.7/12.9/10.7, PER 32.3) in Y1, then 21.4/9.8/9.1 in 51 GP in Y2 while Jamal Murray scored 30.0 on 64.0 TS and 4.1 threes. Jokic is rated 96 but his output sits well under his rating. Real-check admits a gap too (Jokic 25.3 vs 27.5, Jaylen Brown 24.6 vs 28.4, Embiid 18.4 vs 26.7 at sim minutes). Rim FG% correlates only r=0.32 with real life, which is the weakest line in the check.

## Scores
| Area | Score /10 | Why (one line) |
|---|---|---|
| A First hour (hook + learnability) | 7 | Checklist guide, owner goals up front, but the opener gate (release, confirm) and "Pick a playbook" with no explanation of what the 14 grades mean cost me ten minutes. |
| B Coaching depth (tactics, rotation, game plans) vs FM | 7 | Deep, with fit grades, shapes, roles, matchup assignments, counters and series plans. "Staff still looking..." on counters for 20+ games was unhelpful. |
| C Game day (live coaching: feel, and does it matter) | 6 | Only sampled 6 game-minutes: live PPP by play type, who-guards-whom, timeouts, bonus counters are all there. I can't speak to whether decisions matter. |
| D Front office (trades, free agency, draft, cap/CBA) | 8.5 | The strongest layer: bidding with explained losses, mid-level, Bird/non-Bird rights shown in the UI, draft projection ranges. AI deals are sensible. |
| E Rebuild & development (youth growth, draft, patience) | 6.5 | Growth tab is clear (Wiggins +3/+2 in a summer, "ceiling reached") but I did not run a long rebuild. |
| F Analytics (depth, usefulness, correctness) | 8.5 | Reconciles to the possession, has shooting luck vs looks, four factors, on/off, lineups to 5-man, honest intervals. Misses: shot zones per player, ORtg/DRtg per player, clutch, BPM for the live season. |
| G Sim honesty & realism (stats, outcomes, no rubber-banding, long-run world) | 7.5 | League means are within 1-2% of NBA. Superstar spread and Jokic underperformance, OKC 71-11 every time, and thin FA market after day 7 hold it back. |
| H Stakes & story (owner, job, playoffs, history, moments) | 7.5 | Owner gives a graded verdict, playoff narratives and staff voice are good. "Can't fire you for 2 seasons" removed my fear. |
| I UX & feel on my device | 7 | Dense but readable on a phone. Several sheets block the Play button with no obvious way out, and count-up animations make early reads look like two numbers at once. |
| J Overall for this audience | 8 | The best-explained sim I've played. It would win a hardcore analytics fan if the hidden "how much do I trust this" layer were louder. |

## What hooked me (top 5, each with evidence)
1. **The margin decomposition.** "looks +7, shooting luck +15, free throws +1 = +23, about a 1-in-20 shooting night". It makes the sim feel scientific, and it let me ignore a 23-point win.
2. **Honest "did my change work" loop.** Staff replays 10 and 20 games after a rotation change and print a confidence interval (-0.4 to +1.0) and a verdict "too close to call, last look". No other game tells you your hunch was untestable.
3. **Free agency ties to my own grades.** "Rim protection F -> D at 27 MPG" per candidate; the lost bid email explained a 15% market-and-winning discount.
4. **Everything adds up.** Box score, team totals, shot zones, +/- and on/off all reconcile in the games I audited. Team on/off net weighted by minutes matches team net rating.
5. **League realism by default.** ORtg 115.9, eFG 54.0, 3PA 41.7%, FT rate .249, TOV 13.1% and real-player correlations above 0.9 mean the leaderboards look like a real league page.

## What pushed me away (top 5, each marked dealbreaker / major / minor, with evidence)
1. **Major: noisy on/off is presented as a verdict.** Bane read +13.7 on/off (565 min) and ended -2.6 ON NET. Okongwu showed on/off +54.7 on the scouting card after about one game. The "faded <100 possessions" grey exists in Lineups but not on the team table, the scouting cards or the player cards. It trains users to trust small samples.
2. **Major: the assistant, not me, picks bad minutes.** Y2: Prince -12.4 on, Clarkson -14.1, a bench unit at -42.7 per 100 over 39 min, and the "too many bigs" warning applies to my own settings but not the assistant's 4-guard starters. The analytics show the problem; the game never offers to fix it.
3. **Major: superstar output compresses.** Jokic (96 OVR) plays like a 90: 21.4 pts in Y2, PER 26.6 while a 89 OVR Murray scores 30. Rim FG% r=0.32 with real. A hardcore fan checks Jokic first.
4. **Minor: displays disagree.** Inbox said the second look was "-0.4 to +1.0" (width 1.4), while Season Analysis printed "+0.3 +-0.3 over 20 games" (width 0.6). One of them is wrong or they mean different things; the UI doesn't say. Also "Ball pressure: Pressure costs it" in FA text with no way to see the cost.
5. **Minor: missing nerd stats.** League tables lack on/off, per-player ORtg/DRtg, per-player shot zones, FT rate, rim share, and 2026-27 BPM (shows "—" while past real seasons have it). Team table lacks opponent TOV/ORB/FTR; those exist only for my own team in Season Analysis.

## Bugs (repro steps, screenshot path)
- **Digest/staff-call sheets blocking Play** (scripted): after a big sim the "While you were away" or "Starting: Wiggins for Carter Jr." sheet covers the Continue bar, the Play options button can't be clicked until Close. A human would just tap Close, but the sheet has no backdrop hint. Screens: `sheet-*.png` in my folder.
- **/games list**: Oct 28 and Oct 30 (the Cup game) vs TOR both link to `#/games/27`. Possibly two games sharing one id, possibly a link error. Not verified further.
- **Count-up animations double text**: reading the player card early gives "19.6 18.6", "Salary $39.4M $37.5M". Cosmetic, visible in a screenshot taken during the first 1.5 s.
- **Possible**: league hot take "Brunson is scoring 37.2 a night" (Apr 3 2028) vs a 29.9 season average. Might be a recent-week stat; I couldn't confirm.
- No page errors were collected by the kit during play.

## Against the genre (FM / BBGM / MyNBA / Hoop Land: where it wins and loses for me)
- **vs Basketball GM:** BBGM has more raw data tables (per-possession, shot-type splits, play-by-play) and a faster sim UI. Hoops Career wins on *explanation*: why a game went the way it did, why a bid lost, and whether my tweak worked.
- **vs FM26:** FM's data hub is deeper (xG-like, heatmaps, role suitability). Hoops Career's "staff replay with an interval" is closer to FM's assistant reports than anything in BBGM, and its fit grades per FA beat FM's scouting reports for clarity.
- **vs MyNBA/2K:** 2K sims nothing in the offline-stat sense. This one is more honest.
- **vs Hoop Land / PBM:** much more modern and analytics-first.
- **Loses on:** no per-player zone data, no clutch splits, no lineup filters by opponent, no export of tables to CSV.

## Would I pay and keep playing
**$7.99 phone unlock: yes, immediately.** **$14.99 on Steam: yes if shot-zone/stat splits and CSV export arrive; as it stands, probably yes.** I'd put 40-60 hours in, mostly through the stats and trade surfaces, then I'd stay for the draft/FA loop. Recommend to a friend: **8/10** (a basketball-analytics friend, 9; a casual one, 6).

## The one change that would most raise my score
Put the confidence layer everywhere. Every on/off, lineup net, and player rating ("on +13.7") should carry the same "faded: too few possessions" treatment that Lineups already has, and show the interval next to the number. The game already knows how to say "inconclusive, -0.4 to +1.0"; it should refuse to hand me a clean -13.0 on 305 minutes. That one change turns the best feature (honest verdicts) into the whole product's voice.
