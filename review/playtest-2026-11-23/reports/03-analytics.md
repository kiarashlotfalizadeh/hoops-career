# 03 — The Analytics Nerd
## Who I am and what I played
Minnesota Howlers (real league, 9th of 30 on the pick screen, West), GM + Head Coach, 390x844 phone. Two full seasons: 2026-27 went 41-41, 8th seed, lost the first round 2-4 to OKC (62-20). 2027-28 went 53-29, 5th seed, swept 0-4 by SAS with Edwards hurt. That is 164 regular-season games plus play-in and playoffs, and one live game, the play-in. I coached about 8 minutes of it, then used "Finish this game". The league was otherwise simmed. I also audited all 2,460 box scores per season out of my own save's IndexedDB. That is like exporting your own data, not reading the repo. I used one `season-test` run (the harness cannot start the user team: "Your roster has 17 players", though it still simmed two league seasons) and one `real-check` run.

## Play log
1. **Oct 20 2026, setup.** Picked MIN: Edwards 91, Ball 89, Gobert 84, DiVincenzo already out 76 games with an Achilles. The owner's goals were clear on day one (46 wins, playoffs, no payroll adds). The pre-opener guide ("Set your rotation / Pick a playbook") still read "0 of 4 done" after four games; I had not yet done the steps, so I can only say it does not tick on looking.
2. **Oct 28, 4 games in.** League leaders show Markkanen 36.5 ppg and Zion TS 87.9. Small-sample noise, but the "qualified: 2+ games" filter lets it through.
3. **Nov 27, 19 games, 10-9.** First real analytics session. Lineups tab: ON NET per player, 5/3/2-man units, on-off (min 100). I checked it by hand. On/off weighted by minutes reproduces team net exactly (McDaniels, Gobert, Ball, Dosunmu all land on +4.0), so the numbers add up. I found Cody Williams (58 OVR) at 18-19 mpg with on -3.1/off +8.4, while Clark (67) sat. I swapped them in the Rotation sheet.
4. **Dec 19.** The staff mailed "Your change seems to have helped… I'd keep it" on a sample of about 6 games. I felt clever and I'm not sure I should have.
5. **Dec 25 to Jan 8, the trap.** Edwards came back from a broken hand. I'd switched off "Let the assistant manage", so his target stayed at 0 minutes. The dump shows 0 minutes in every box from Dec 28 to Jan 8, and he played as I told the game to play him. The Rotation page eventually says "Edwards isn't getting any minutes. Your best player should play 32-36." Neither the "Edwards is back" email nor Today said it. I toggled the assistant back on and he went to 38. Worst design flaw I met.
6. **Nov 27 and Jan trade offers.** LAC offered Garland (82) for McDaniels + DiVincenzo (out for the season) + Kuminga. MIL offered Jaquez for Kuminga. HOU wanted Edwards for Giannis + 2 picks. I declined all three. The cards give a headline and no on/off, usage or lineup impact for either side.
7. **Feb 10 deadline.** The staff's card says "buy Stephen Curry… The deal should help", then "The forecast barely moves your postseason chances". The offer was Gobert + McDaniels for a 38-year-old on $178M over 3 years. Self-contradictory. I stood pat.
8. **Apr 13, play-in vs NOP (live).** Live Stats tab: team box, shots, flow, play types with PPP. Report: play-type possessions sum to the team's possessions (113 = 113). Won 120-113, then the 7-8 game, then the playoffs.
9. **Playoff series vs OKC.** Gameplan page: starting fives, "Their threats" with TS/USG/on-off, four factors with league ranks, series win chance 98%. Strong. Lost 2-4.
10. **Offseason 1.** Re-sign screen with a clear tax bar. I declined the two rookie options (Shannon, C. Williams: staff said decline). The negotiate list reorders after each signing, so I accidentally signed Shannon Jr. 4 years at $1.38M instead of Lyles. I then signed Lyles, Hyland and Kuminga (non-Bird rights meant he could only come back through the mid-level, and the sheet explained why).
11. **FA list.** Each player carries the staff's fit read: "Rim pressure C → C+ at 28 MPG", "C → D at 25 MPG". I picked Kuminga because he was the only one who moved the weak spot.
12. **Preseason 2027-28, progression.** Lyles 71 to 60 (age 32, -11). Evans (22) -4, Kuminga -2, Gobert -3. I then audited every player's ratingsHistory. The league as a whole sags (see Scores G and E).
13. **2027-28.** Edwards healthy and everything clicked: 15-9, a 7-game streak, "All 29: Nerd completes the set" (beat every franchise), 53-29, net +3.5. Season Analysis agreed with my own box-score sums (ORtg 115.2 / DRtg 111.8 vs mine 115.2 / 111.7).
14. **Apr 2028.** Swept by SAS. "Don't put the sweep on Edwards" was the headline, since he was out again. Then two teams wanted me as coach, and the owner moved on.

## Scores
| Area | Score /10 | Why (one line) |
|---|---|---|
| A First hour | 6 | Clear owner goals and a checklist; I did not test whether the checklist ticks |
| B Coaching depth | 7 | Roles, shapes, coverages, per-man matchups, staff "counters" that are actually measured; rotation sheet has a trap |
| C Game day | 6 | Only 1 live game; stats tabs and PPP are excellent, I saw too little to rate decision impact |
| D Front office | 7 | Fit-aware FA list and a clear CBA flow; trade offers lack on/off context |
| E Rebuild & development | 4 | Prospects (<=22, POT gap >=6) averaged +0.08 OVR over a summer; POT shrinks |
| F Analytics | 8 | Deep, mostly correct, in-flow; missing things listed below |
| G Sim honesty & realism | 7 | Box scores reconcile to the point; star lines faithful; long-run drift downward |
| H Stakes & story | 7 | Owner letters, honors, franchise records, "nobody had beaten 29 teams" lines are good |
| I UX on my phone | 7 | Smooth and dense; some taps need confirm sheets; a few lists reorder under you |
| J Overall | 7.5 | The best stats surface I have seen in a mobile GM game, held back by one trap and a deflating world |

## What hooked me (top 5)
1. **Numbers that reconcile.** Across 2,460 team-games a season: zero mismatches in player-to-team sums for pts, FG/3P/FT, REB, AST, TOV, STL, BLK, PF; pts = 2FG+3P+FT for every player line; quarter totals; 240 min. On/off ties to team net. Season Analysis ties to box sums. A data person never gets this.
2. **The stats surface is wide.** Team page (Stats/Ratings/Contracts), ON NET, lineups at 5/3/2-man with a "faded under 100 poss." honesty rule, on/off with a minute floor, league Teams table (Net, ORtg, DRtg, Pace, eFG, TOV, ORB, FT rate, 3PA rate, Opp eFG), game report with Four factors, Shots by zone, Flow, play types with PPP, player pages with real-season splits back to 2013 including BPM and WS/48.
3. **Analytics feed decisions.** Staff counters are tested and reported with "No clear edge / Could hurt"; FA cards say which team grade a signing moves at what MPG; the gameplan page shows matchup threats with TS/USG/on-off; "Shooting luck: +25.9 pts" in the 124-89 blowout is exactly what I want a recap to tell me.
4. **League-wide realism at the seed.** Year 1: pace 98.7, ORtg 116.1, 3PA rate 41.3%, 3P% 35.7, eFG 55.2, TS 58.5, FT rate .255, FT% 77.5, TOV% 12.6, ORB% 24.8. Rim share 32.5% at 64.6% FG; mid 10.7% at 43.5%. Win SD about 11.5, team-net to wins r=0.96, pythag residual SD 3.4. Leaders: Dončić 31.9, SGA 30.6, Wemby 3.1 blocks. Star check vs 2025-26 real: SGA 31.1/4.3/8.2 (real 31.1/4.3/6.6), Dončić 31.9/7.5/8.1 (33.5/7.7/8.3), Wemby 26.7/10.6/3.2 blk. This is the audience's bar and it clears it.
5. **Personality and records.** "50 and counting for Nerd", "All 29", franchise records, franchise playoff threes. It rewards a numbers person for noticing.

## What pushed me away (top 5)
1. **MAJOR: manual rotation freezes a returning star at 0 minutes.** (Play log 5.) A returning injured star is not auto-added to a hand-edited rotation, the warning is only on the Rotation page, and the 0-minute guy then shows "34.3 min" on the roster because it's the season average. It cost me real games. Fix: re-seat healthy players when the injury clears, or push a Today/Inbox alert.
2. **MAJOR: the league slowly deflates and prospects don't grow.** Offseason 1 across 496 players with a 2027 and 2028 rating: mean change -1.5. Age <=21: -0.36 (n=59). 22-24: -0.48. 25-27: -1.2. 28-30: -2.0. 31-33: -3.2. 34+: -5.1. Prospects age <=22 with POT gap >=6 (n=73): +0.08 OVR, POT drifted -1.4. Dybantsa 80/87 to 80/86, Clingan 22yo 85/93 to 81/87. Talent at 85+ went 46 to 39 rostered. Season 2 league ORtg fell 116.1 to 114.0, ppg 114.6 to 111.9, TOV% 12.6 to 13.5, 25+ ppg scorers 11 to 6. A rebuilder is not rewarded for patience; one sample, but it points one way.
3. **MAJOR: BPM is "—" for the sim seasons while real seasons show it.** A career table with 13 real BPM values and a blank for the one year I'm playing. Same for any on/off-based impact for non-MIN players. A nerd can't compare.
4. **MINOR: the "staff" analytics speak with more confidence than the sample.** "Seems to have helped" from about 6 games; "buy Curry, the deal should help" next to "barely moves your postseason chances". Players' ON NET prints -100.0 and 0.0% TS lines with no minute floor on the team Stats table.
5. **MINOR: awards.** 2026-27 MVP went to Murray (28.9 ppg, DEN 56-26) while SGA had 31.1 ppg, TS 67.2, WS/48 0.386 on a 62-win title team and a +12.5 net. Harness run did the same in 2028 (MVP Murray, SGA 29.9).

## Bugs (repro steps, screenshot path)
- **Rotation freeze (above).** Rotation page, turn off "Let the assistant manage", edit anyone, have a starter get hurt, wait for return. Screenshot: shots/rot_warn.png in my folder.
- **Not a confirmed bug:** the first-games guide still said "0 of 4 done" after 4 games because I had not acted on it; I did not retest after acting. shots/home.png.
- **Negotiate list reorders after a signing.** Resign screen: signing one removes it, the next "Negotiate" index points at a different player. I signed Shannon Jr. 4 years by accident.
- **Today's Matchup says "Cup 14-5 / 10-9 / MEM 53%"** with two records for the same team (Cup vs league record) with no labels. shots/games.png.
- **Playoff series prob vs per-game prob.** OKC 98% for the series vs 80% G1. Plausible but I couldn't see the math; it matched a 2-4 result, so I'd call it fine.
- **season-test harness:** "cannot start: Your roster has 17 players" for the user team. Not player-facing.
- **Live game Stats tab:** reads fine; a mid-stream refresh is not resumable (I lost the 2D view once). "Resume live game" worked.

## Against the genre
- **BBGM:** BBGM has far more advanced stats everywhere (BPM, VORP, shot-zone tables). This game has the better *teaching*: each number explains itself and drives a choice. BBGM's progression gives prospects +3 a year, so this loses on rebuilds.
- **FM:** FM's analytics (xG, heatmaps) come with a data-hub and scouting-to-recruit pipeline. This game's "Staff's read of your need" on every FA card is the same idea in one line, and I liked it more than I expected.
- **MyNBA:** zero competition on stats honesty. 2K never shows lineup nets.
- **Hoop Land / Draft Day:** this is deeper on lineups and play types than either.
- **Loses on:** no shot-zone league tables for players (only per game), no pace-adjusted/per-100 toggles on the player stats table, no exports.

## Would I pay and keep playing
$7.99 phone unlock: yes, immediately, for the stats alone. $14.99 Steam: yes if exports, BPM-for-sim-seasons and a per-100/Adjusted toggle existed; without them, maybe. Hours: I'd put in 40+ if progression felt like a world I could trust, 15 as it is. Recommend to a friend: **8/10** for a stats-minded friend, 6/10 for a casual one.

## The one change that would most raise my score
Make player development match the league's own ratings anchors: young high-POT players should go up, not sideways, and the 85+ pool should hold steady across seasons. Everything else on my list is polish; this one decides whether a ten-year dynasty save is worth starting.

---

### Appendix: what a nerd wishes were there
- Per-100 and adjusted (pace/league) toggles on player stats; team Opp TOV% and DRB% in the table (they are on Season Analysis but not the league Teams table).
- Shot-zone frequency and FG% by team and player (rim / short mid / long mid / corner 3 / above-break 3), and a shot quality / expected eFG line.
- BPM/VORP/EPM-style impact for sim seasons; RAPM or on/off with SE bars so noise is honest. The "faded under 100 possessions" rule is the right instinct and should extend to ON NET on the roster table.
- Lineup tab filters by opponent quality, home/away, with/without star; the 5-man list should show net + net per 100 with a confidence marker.
- CSV export of box scores and a league history table of per-season team ratings. I had to read IndexedDB to get at the numbers.
- Awards that follow WS/BPM/EPM and a visible voting table.

### Appendix: misleading numbers
- ON NET on the roster table with 1 or 2 minutes (-100.0).
- "Shooting luck +25.9 pts" and "Tactics -4.3 pts" side by side in a 35-point win: both defensible, together they overclaim.
- Roster season-average minutes printed next to a 0-minute target, which hides the freeze.
- Possessions: box `poss` averages 98.7, but FGA + 0.44 FTA - ORB + TOV gives 101.6. Team ORtg is quoted against the lower number, so my self-calc ORtg runs 2.5% lower than the game's.
