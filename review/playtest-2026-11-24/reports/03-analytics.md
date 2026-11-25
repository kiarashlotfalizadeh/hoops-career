# 03 — The Analytics Nerd
## Who I am and what I played
Data analyst, 29, CTG / B-Ref / PBP Stats brain. Denver Prospectors (real league, 9th of 30 roster rank, Jokic + Murray), GM + Head Coach, phone 390x844. Two full regular seasons plus playoffs: 2026-27 went 59-23 (+6.2 net), beat DAL 4-3 after trailing 3-2, swept 0-4 by SAS. 2027-28 went 54-28 (+5.1 net) and lost in round 1 to DAL. One live game coached (opener at OKC, won 128-119), everything else simmed. I also ran `npm run real-check` once as supplementary evidence. Roughly 3 hours.

## Play log
1. **Oct 22 2026, opener (live).** Staff suggested a 2-3 zone off "4 points inside on 3 trips", a tiny sample. Halftime card: "OKC made 48.9% eFG on looks worth 57.0%, luck, nothing to change." Accepted "Drop on ball screens" at the half off "19 points on 13 trips" (1.46 PPP). The report later said "Hedge→Drop: DEN 70-65 since". Felt clever; the shot-quality vs eFG split is the best thing I've seen in a sports sim.
2. **Box audit, game 1.** Summed every column by hand: PTS 128, FG 50-92, 3P 16-36, FT 12-17, REB 40, AST 33, TOV 13, PF 18, MIN 240 all match team lines. Four factors recomputed (eFG 63.0, TOV% 11.6, ORB% 33.3, FT/FGA 13.0) match. Shot-zone split 24-36 / 10-20 / 16-36 sums to 50-92. Clean. One wart: the margin bridge says "looks +5.6, luck +10.4, FT −7 = +9" but the header strip shows "Tactics +6.5, luck +10.4, moves +1.0" (=17.9) and "What decided it" shows luck as +10.1. Three versions of the same decomposition on one screen.
3. **Nov 22 (14 games, 10-4).** Opened Lineups and On-off. The starting five (Murray-Johnson-DeRozan-Gordon-Jokic) was -4.4 net over 92 min. Swapping Braun for Gordon in the same unit was +31.9 over 47 min. S. Jones was on -8.1 / off +15.7. Gordon was on +3.0 / off +17.6. I started Braun for Gordon and cut Jones to 0 minutes. Faded text "under 100 possessions, too few to trust" is exactly the caveat I want.
4. **Did it move the numbers?** By Feb 6 (52 games) the new five was +15.5 net over 281 min (ORtg 134.9, DRtg 119.4) versus the old five -0.6 over 233 min (127.5 / 128.2). Part of that is noise: Braun for Gordon barely changes perimeter D ratings, yet DRtg improved 9 points. I can't tell skill from variance, and the game doesn't give an error bar. Season Analysis still said "The staff is watching…" on my change at game 52, 38 games after I made it.
5. **Nov 28 / Jan 8 nags.** The sim stopped twice on "Spencer Jones / Julian Strawther has no minutes, healthy and among your eight best". Strawther was 68 OVR, T. Jones was 68. Annoying but it understood my intent after "Keep him out". Jones still logged 408 min (injuries), which skews his on/off.
6. **Feb 6 deadline.** Staff: "buy a player better than your fifth best (79)... nobody the staff asked takes what you can send". Stood pat. The FA list line "Pick-and-roll D, F with your rotation (29th of 30)" is real decision support.
7. **End of 2026-27, league table.** 30-team table with Net/ORtg/DRtg/Pace/eFG/TOV/ORB/FTR/3PA/Opp eFG. OKC 68-14 (+12.2), SAC 17-65 (-12.4). Realistic spread, a bit wide at the bottom. Denver: ORtg 126.1 (1st), DRtg 120.0 (29th). A 29th-ranked defence winning 59 is not something real data produces. Opp eFG 56.0% is 28th, Season Analysis defence grades are D/D/F/F.
8. **Star check.** Jokic 26.0/11.9/9.1, TS 63.4, 3P 32.7%, PER 30.9 (real 2025-26: 27.7/12.9/10.7, TS 67.0, 3P 38.0). SGA 30.8, TS 61.1, 3P 30.0% (real ~66.5 TS and mid-30s 3P). Luka 31.5 / USG 35.4 / TOV 3.9 looks right. Wemby 24.7/11.3/3.1 blk right. Stars shoot threes and finish about 3 TS points worse than real.
9. **Player pages.** Jokic page has a full real career table with BPM/PER/WS/USG, the 3-MVP honors, and "Impact going into 2026-27: +9.3 per 100". The 2026-27 row shows BPM as "—" while all real seasons have one. The "+/-" column for real seasons reads +8.5 on the first four rows, which is plainly the current-season number copied down.
10. **Offseason.** Re-sign: Johnson asked $12.7M (was $23.1M) and re-signed. Walker IV and Bagley III could not be re-signed (non-Bird rights capped at $3.9M/$3.0M, he asked $7.1M), so they walked. FA: my Mathurin bid (mid-level, 14+ rivals) lost on day 2, then Thybulle signed 3 yrs / $37.5M. The staff's FA line "Three-point D F → C at 26 MPG" showed my grade moving after the signing. That is the best analytics-to-action loop in the game.
11. **Trap after summer.** My hand-built rotation was stale: "Minutes add up to 173", starters scaled to 46/44/42 min each. Only a small yellow strip warned me; the action queue had no "Needs you". Toggling "Let the assistant manage" fixed it, but it put Gordon back in the starting five despite last year's -14.6 on-off.
12. **2027-28.** Assistant refit my playbook from Hedge to "Blitz the Ball". Season Analysis then showed Opp TOV% 15.6% (1st) but Opp eFG 56.1% (28th). My Depth-order change got a final "Seems to help" in 10 games. Starters (Murray-Braun-Johnson-Gordon-Jokic) +0.4 net over 219 min, while the unit with S. Jones for Gordon was +25.8 over 197. I could see it in the tables but the season was over before I acted.
13. **History.** 2027-28 champs CLE (4-0 over MIN), MVP Jokic 27.0/12.9/10.2, Coach of the Year to ATL at 48-34 (+2.1 net) while DET went 61-21. Awards screen lists 65-game ineligibles with their games count. Good.
14. **`npm run real-check`.** Sim vs 2025-26 NBA per team game: pace 97.8 (99.6), pts 113.0 (114.4), fg% .462 (.471), 3pa 37.5 (37.5), 3p% .354 (.359), ast 25.0 (26.6, -6%), tov 12.8 (13.9, -8%), orb 11.0 (10.8). Assisted share of threes 73% vs NBA ~85%. 24 of 24 reputation anchors hold.

## Scores
| Area | Score /10 | Why (one line) |
|---|---|---|
| A First hour | 7 | Owner goals up front, guide checklist; analytics density is intimidating but readable |
| B Coaching depth | 8 | Plays-through, coverages, crunch time, hunt-mismatch; measured effect of each setting |
| C Game day | 7 | Luck/looks split, staff calls with sample sizes, "since" scoreboard; I only coached one live game |
| D Front office | 7 | Need-graded FA with "grade → grade at N MPG"; Bird-rights wall felt abrupt |
| E Rebuild & development | 5 | Not my path: contender; growth tab and breakouts look good |
| F Analytics | 8.5 | Deepest sim I've used, internally consistent; gaps in per-100, shot zones, error bars |
| G Sim honesty & realism | 7.5 | League aggregates within 2-3% of real; star efficiency low; Denver 29th D winning 59 |
| H Stakes & story | 7 | Player-of-week blurbs, awards with eligibility rules, coach offers |
| I UX on my device | 7.5 | Dense tables fit on 390 wide; Shots tab half-court map for a full game; calls sheet worked |
| J Overall for this audience | 8 | Best analytics layer in the genre; needs honesty on noise |

## What hooked me
1. **"Looks vs results" accounting.** Every game and halftime report splits margin into shot quality, shooting luck, free throws, and "your moves", with eFG on looks worth X%. Example: "63.0% eFG on looks worth 56.9%, mostly luck." It stops me over-crediting a good night.
2. **Internally consistent numbers.** Box lines, team totals, shot zones, four factors, and on/off all reconcile. Murray's "ON NET +10.6" on the stats page equals the On-off tab. In 2+ seasons I found no sum that failed.
3. **Lineups tab depth.** 5/3/2-man and on/off with ORtg/DRtg/Net, minutes filters, Starters/Closers chips, and fading for small samples. It found the Gordon/Jones problem for me.
4. **Staff analytics wired into decisions.** FA rows show "Three-point D F → C at 26 MPG"; Season Analysis ranks each of my tactical settings as "Helped / Cost you"; moves get "DEN 70-65 since".
5. **Real history.** Jokic's real career line back to 2015-16, real records, real 83-point Adebayo game, honors. Makes comparisons natural.

## What pushed me away
1. **No error bars on lineup and on/off numbers (major).** Net ratings like +51.9 over 25 min sit in the main list; the "faded" caveat is the only guard. At 281 min my own "improvement" (-0.6 to +15.5) is mostly variance and the game credits it anyway. The preview shows "on/off +65.4, −50.9" after one game.
2. **Missing views a nerd expects (major).** Stats offer only Per game / Totals (no per-36, per-100). No per-player shot zones or rim/mid/3 frequencies, no assist/rebound %, no ORtg/DRtg or BPM for the current season in the player table (BPM shows "—"). Zones exist only inside single game reports. No team defensive splits (opp rim FG%, opp 3PA rate) or opponent TOV% in the league table.
3. **Assistant ignores analytics (major).** "Let the assistant manage" started Gordon again (on-off −14.6 the year before) and re-picked a defence that had my D 28th in opp eFG. The game shows me the data but its own helper does not use it. After the summer my own rotation silently broke (173 minutes) with no queue alert.
4. **Realism skew (minor to major).** Stars finish ~3 TS points under real (Jokic 63.4 vs 67.0, SGA 61.1), threes under-assisted (73% vs ~85%), TOV 8% low, assists 6% low. A 29th-ranked defence winning 59. COY to a 48-34 team over a 61-21 one.
5. **Conflicting decomposition (minor).** "Shooting luck +10.4" and "+10.1" and a strip that totals 17.9 against a +9 margin on one page.

## Bugs
- **Real-season +/- column on player Stats tab repeats +8.5 for 2025-26 through 2023-24** (and 2026-27) — `/player/2`, Stats tab. Also BPM "—" for the current row. Screenshot: shots/jokic-Stats.png.
- **Game report header numbers don't sum** (Tactics +6.5 / Luck +10.4 / Moves +1.0 vs margin +9; luck +10.1 in the list). `/game/15`, Summary. Screenshot: shots/gr-Shots.png (header visible).
- **Upcoming list skips the next game.** Today says "Tomorrow · Home vs NOP", the Games list starts at Oct 26 GSW then Oct 28 @ NOP. Screenshot: shots/games.png.
- **"Staff is watching…" never resolved in 2026-27.** My Nov 22 rotation change had no verdict at game 52 (Season Analysis, shots/sa-b.png). In 2027-28 a change got a final verdict in 10 games.
- **Stale rotation after offseason** (minutes sum 173, starters scaled to 46 min) with no alert. `/team/rotation`, shots/rot3.png / state before toggling assistant.
- **Shots tab draws a half court for a whole game.** shots/gr-Shots.png.

## Against the genre
- **vs BBGM:** BBGM's box scores and advanced stats table are broader (per-36, per-100, WS, VORP, shot-zone "efficiency" views), but this game's looks-versus-luck decomposition, play-type grades and "your settings, net" have no BBGM equivalent. It wins on explaining; BBGM wins on raw breadth.
- **vs FM:** FM's data hub (xG, heat maps) is the right comparison. This is the first basketball sim that tries it. xG here is "looks worth X%", which is the same idea. FM still has more filters and exports.
- **vs 2K MyNBA / Hoop Land / DDS:** Nothing close. 2K's stats are shallow and not decision-driving.

## Would I pay and keep playing
$7.99 on phone: yes, easily, if only for the Season Analysis and Lineups tabs. $14.99 on Steam: yes if per-100 and zone splits are added; borderline without. I'd put 40-60 hours in, probably more if on/off error bars and per-possession views arrive. Recommend to a basketball-nerd friend: 8/10.

## The one change that would most raise my score
Attach confidence to every impact number (lineups, on/off, "since you changed it", staff recommendations) as "likely real / could be noise" using possession counts, and let the assistant's rotation and playbook choices use the same numbers. That turns a great display layer into a decision engine.
