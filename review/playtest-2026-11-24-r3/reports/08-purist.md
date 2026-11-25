# 08 — The Real-NBA Purist
## Who I am and what I played
- **Career 1:** real league, Denver Prospectors, GM only. One full 2026-27 season (54-28, 5th seed, beat MIN 4-1 and MEM 4-3, lost the West Finals to OKC 1-4). I stopped in the re-sign period: my "Make offer" click on Cameron Johnson didn't visibly register.
- **Career 2:** fictional league, Boston, GM + Head Coach. About 55 games, then sim to the play-in (47-35, 5th in the East). Opened one live game.
- **Career 3:** real league, Oklahoma City, GM + Head Coach. One full season (62-20, 1st seed, won the In-Season Cup, beat SAS, LAL and CLE for the title). Opened one live game for a few minutes.
- **Device:** 390x844 phone, headless. Roughly three hours. No live games played to the end.
- **Data access:** I read my own save from IndexedDB to check all ~600 players. That is my own save, not repo files.
- **My knowledge ends about June 2026.** I flag the confidence on each fidelity claim.

## Play log
1. **Oct 2026, preseason.** The league is a speculative post-2026 offseason, not a 2025-26 snapshot. Examples: Giannis at MIA, Kawhi at TOR, Dončić at LAL, LaMelo at MIN, Kuminga at MIN, Kessler at LAL, Paul George at BOS, Zubac at IND, DeRozan at DEN, Harden at CLE, Mitchell at CLE, Ja at POR, Jaylen Brown at PHI, LeBron at PHI at 41. I can't verify the post-June moves, so I treat them as plausible fiction. The 2025-26 facts I can check all hold: Butler on GSW with a torn ACL, Harden at CLE, Tatum back from his Achilles (16 GP in 2025-26), Haliburton with no 2025-26 stats, Kornet and Hartenstein roles.
2. **Past stat lines are the best thing here.** Player pages show "2025-26 per game · real". Jokić 27.7/12.9/10.7, Wemby 25.0/11.5/3.1, SGA 31.1/4.3/6.6, Dončić 33.5/7.7/8.3, Giannis 36 GP, Curry 43 GP, Embiid 38 GP. All of it matches what I remember or is plausible.
3. **Oct 22-Nov 21.** DEN started 13-1 and was 83% to win at 13-1. Jokić was Player of the Week twice. A trade offer arrived (MEM: Russell for Cam Johnson). Sims stop for it, and the inbox explains it. I turned it down.
4. **Feb.** Jokić went down. DEN lost 7 straight, then recovered to 40-23 and finished 54-28. Jokić finished at 26.5/11.7/8.8 in 64 games. He is ruled ineligible for awards at 64 of 65 games, which is a real NBA rule and a nice touch.
5. **Season results, run 1:**
   - SAS went 68-14 (+11.5), then lost 1-4 to the 8-seed MEM in round 1. That is a huge upset for a +11.5 team. The play-in produced the 8-seed.
   - BOS beat OKC 4-2. Tatum was Finals MVP. SGA was MVP. Wemby was DPOY. Wagler was ROY. Grayson Allen was 6MOY. LaMelo was MIP. Hensley (SAS) was COY.
6. **Run 3 (OKC):** same starting league, completely different world. DEN, MIN and the rest landed elsewhere, and OKC won it all at 62-20. The sim is not on rails. That is good for replay, but for a purist it means "the real league" is only the starting point.
7. **Retirements:** LeBron retired after 24 seasons (44,380 pts, 1,678 GP) and went into the Hall of Fame. DeRozan retired (27,892 pts). Love, Klay, DeAndre Jordan, Lopez, Conley and Batum also retired. This is a lovely moment; it landed on me the way a real offseason does.
8. **Fictional league:** BOS had 89/87/87 stars and was 14th in the East at the All-Star break (22-27 in late Jan). It went 22-6 after the deadline and finished 47-35. Top scorers there are 33.8, 33.6 and 33.5 ppg with PER 32-34. Both real-league and fictional-league stars look like mid-30s ppg monsters, but the fictional ones are more numerous.
9. **Live game:** 7 timeouts each (correct for the modern NBA). A scorebug with a win bar. The coach tile read "P&R: Fox + Wembanyama vs blitz". The 2D court with jersey numbers worked fine.

## Fidelity audit (2026-27)
**What is good**
- Past-season stat lines are real.
- Records are real. "Points in a game 83, B. Adebayo vs WAS, Mar 10, 2026" is in the book. Klay's 14 threes, MEM 152-79 OKC (+73, Dec 2, 2021) and Rondo's 25 assists match my memory.
- Champions history 2016-17 to 2024-25 matches (GSW, GSW, TOR, LAL, MIL, GSW, DEN, BOS, OKC). I can't confirm "2025-26 NYK def. SAS 4-1, Finals MVP Brunson"; it may be real or invented.
- Positions are mostly right. Jokić C, Giannis PF, Doncic PG, Tatum PF, Wemby C, Embiid C, Curry PG. Heights and weights are right (Wemby 7'4").
- Ages are shown as season-start age.
- Injuries are mostly real (Butler ACL, Beal knee, DiVincenzo Achilles), plus minor day-to-day ones. 54 of 444 players are hurt in the preseason, which is plausible.
- Rookie/2026 class names are used (Dybantsa, Boozer, Peterson, Acuff, Wagler, Flemings). Draft-year 2027 prospects are generated (Vasilije Ilić, Rashad Wood).

**What looks wrong or dated**
- Ratings are generous at the top. Kawhi 92 at 35, Murray 89 (25.4 ppg, ahead of Brunson 86), Anunoby 87 at 16.7 ppg, Adebayo 88, Harden 88 at 37, Queta 82 for a 10-ppg Celtics backup, Kornet 78 (21 mpg), Thybulle 77 at 5.8 ppg, Gobert 84-85. Medium confidence on "too high".
- Westbrook is listed as an SF and Lonzo Ball as a free agent at 75. Low confidence.
- Franchise history only counts the recent era. Denver's franchise leaders are Jokić, Murray, Porter, Gordon, Harris. Nobody from the English/Issel/Carmelo era shows. The text admits "Leaders count real seasons before 2026-27 too", but it clearly starts around 2010.
- Single-game records start in 1996-97, so Barkley's 33 boards is listed as the record, then the all-time section lists Wilt. Two overlapping record lists confuse a purist.
- Coaches are all invented (Evan Hensley at SAS, Joe Novak at DET, Mark Forsythe at CLE...). Real players with fake coaches is the biggest immersion crack. No Mitch Johnson, no Mazzulla, no Daigneault.
- Nicknames and arenas: Redtails, Shamrocks, Twine, Wasps, Stampede, Lancers, Wranglers, Prospectors, Engines, Warlords, Boosters, Racers, Cutters, Lagoons, Kodiaks, Inferno, Antlers, Howlers, Petrels, Knights, Twisters, Illusion, Founders, Flares, Pathfinders, Crowns, Stirrups, Claws, Swing, Mages. Some wink at the original ("Stirrups" for Spurs, "Warlords" for Warriors, "Shamrocks" for Celtics). "Stirrups" and "Twine" are the two that made me wince. I got used to them after an hour. They don't stop me playing, but they stop me feeling it's the NBA. Arenas such as "Denver Arena" or "Phoenix Arena" read as placeholders.
- Fictional league leaks real surnames. "Shane Şengün", "Seth Dort", "Damon Dort", "Damon Russell". That feels like a bug, not a nod.

## Scores
| Area | Score /10 | Why (one line) |
|---|---|---|
| A First hour (hook + learnability) | 7 | Owner goals, first-week guide and Today are clear; the role choice isn't revisitable |
| B Coaching depth | 7 | Roles, shapes, coverages, per-series plans, a staff that explains calls; shot-profile sliders are coarse |
| C Game day | 6 | Win bar, call bar and 7 timeouts are good; I saw only minutes of it |
| D Front office | 6 | Cheap re-sign asks (Cam Johnson asks $13.1M for a 79), offer sheet UI; one click on "Make offer" didn't register |
| E Rebuild & development | N/A | Didn't reach it |
| F Analytics | 7 | TS, PER, WS in leaders and records; staff counters are plain English |
| G Sim honesty & realism | 8 | League averages are real-looking (47% FG, 36% 3P, 114 ppg, 12.7 TOV/48); stars slightly inflated in the fictional league |
| H Stakes & story | 8 | Retirements, awards, cup, records, owner mail; first playoff series lines read well |
| I UX & feel on my device | 8 | Readable, quick; sheets stop sims cleanly |
| J Overall for this audience | 7.5 | The real data is the hook; the invented shell is the drag |

## What hooked me
1. The real past: 2025-26 lines on player cards and records like Adebayo's 83.
2. A season sim that produces real-looking leader boards. Dončić 33.4 ppg, Wemby 3.6 bpg, Clingan leading the league in rebounds, Daniels leading in steals.
3. LeBron's and DeRozan's retirements with career totals and a Hall of Fame class.
4. Different outcomes between runs. SAS went 68-14 in one world and lost in round 4 in another. I won the title with OKC, not the one I'd expect from the preview.
5. Staff calls with exact numbers ("outscored by 11.0 a game... that's luck, not the plan").

## What pushed me away
1. **Invented coaches and nicknames on real players.** Major.
2. **Rating inflation at the top.** Kawhi 92 at 35, Murray 89, Queta 82. Major for a purist.
3. **Fictional leagues have star clutter.** A dozen 89+ players and PER 32-34 scorers; Boston with three stars was 14th. Minor/major.
4. **The "as a head coach" quote in GM-only mode.** The news said "Purist gets to 50 ... 50-27 as a head coach" and "first playoff trip of his career" even though I only ran the front office. Minor.
5. **A 68-14 team losing in round 1 to the 8-seed.** Minor; looks like too much playoff variance.

## Bugs
- GM-only career: news and the Coaches tab credit the user as head coach (record 54-28 under "Purist"). Repro: new real career, GM only, sim a season, open the inbox and /league/history Coaches tab.
- Re-sign sheet: tapping "Make offer · 3 yrs · $42.5M" for Cameron Johnson left the sheet open and the contract unsigned in my headless run (/office/resign). Not confirmed on a real phone.
- A modal dialog (class `dg-res`) sat over the Play options button after the first monthly sim in the DEN save, blocking the kit's click. A reload cleared it. I couldn't reproduce it.
- Fictional league names reuse real surnames (Şengün, Dort, Russell).
- Records page shows Clingan at 12.2 RPG over 77 games while Leaders showed 12.9 over 60 games (traded POR to MIA). Probably a combined-team vs single-team difference, but it reads as a contradiction.
- Screenshots: /private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career--claude-worktrees-nba-video-gameplay-animations-5339f5/edd87ff4-b19e-41b5-b0c8-571b9ed31a31/scratchpad/playtest/players/08-purist/standings.png, player2.png, live1.png, c_live.png, sheet_p3b.png.

## Against the genre
- **vs Basketball GM:** much deeper real-player fidelity and stats. BBGM's real-roster files don't carry real 2025-26 lines or real records.
- **vs NBA 2K MyNBA:** loses on names (coaches, nicknames, arenas), wins on sim honesty and explanations.
- **vs FM:** the staff-call writing and counter model are FM-like. The tactic board is smaller. I can't judge match-engine depth from a few minutes of live play.
- **vs Hoop Land / Draft Day:** better looking and better explained.

## Would I pay and keep playing
- **$7.99 on phone:** yes, mostly because of the real data.
- **$14.99 on Steam:** only with real coaches, or a mod/import for team names.
- **Hours:** about 40 if names were real; 15 as is.
- **Recommend to a friend:** 7/10.

## The one change that would most raise my score
Let me swap in real team names, arenas and head coaches (as a local or user-file option), and recalibrate the top-end ratings so stars like Kawhi, Murray and Anunoby sit where their production says they should.
