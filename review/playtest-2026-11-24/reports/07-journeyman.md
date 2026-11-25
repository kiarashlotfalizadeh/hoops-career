# 07 — The Career Journeyman
## Who I am and what I played
- Real league, GM + Head Coach, job security ON, phone 390x844 (headless Chromium).
- Started with Chicago (34-48 roster, owner "builder", goals "win 26").
- Played 10 full seasons, 2026-27 through 2035-36, about 820 regular-season games plus playoffs, with three jobs: CHI, then DEN, then CHI again. I took the Denver job from an offer, then got fired after 4 seasons.
- Only 1 live game coached (a play-in game, which I won 121-115). Everything else was sim, so this is a long-run honesty test, not a coaching test.
- About 3 hours. A season takes me about 5-8 minutes with offseason steps, mostly the offseason UI steps, not the sim.
- Honest limit: my offseasons were semi-automated. I re-signed at the ask, auto-drafted, and bid on the top "Fits your space" free agents. My Denver results below are partly my own neglect, and I say where.
- I ran `npm run season-test` once and `npm run star-check` once.

## Play log
1. **Oct 2026.** Chicago opens with a clear owner card: "Win about 26 games, give 7,400 minutes to under-24s, two seasons without playoffs." Nice, readable stakes. It started 3-18 on injuries (Wilson, Buzelis, Claxton all hurt) but finished 34-48 (18-13 after Feb 6). A real arc.
2. **Dec 2026.** Four AI trade offers lapse on their own (HOU wanted Giddey, etc.). The owner mails me a "postcard from a vineyard" and a "December check-in: warm seat". The owner-mail voice is charming and I read it.
3. **2027 offseason.** The re-sign sheet is excellent. Asks are shown against market, plus team options with the staff's recommendation. Jalen Smith (77 OVR, 26) was re-signed at $11.9M x 4. The FA market had real names (LeBron to Denver at $8.3M). Kuminga chose us over 4 bidders on day 3, which felt like a real race.
4. **2027-28.** 33-49, goals met. The "release 1 player" gate before opening night arrives with the staff's pick shown, plus dead money.
5. **2028-29.** Owner goals jumped to "43 wins, make the playoffs". We went 43-39, took the 7th seed after winning the live play-in game (I coached it), and reached the **conference finals**. Season grade +40. Best moment of the run.
6. **Jun 2029, job market.** Career > Jobs listed openings with "Rated you 44, Castellano 42", plus "Passed on you / Would hear you out". I asked DEN, they offered, and I took it. A "New job" moment followed ("He can't fire you in your first 2 seasons"). A coach swap: Castellano takes Chicago. This is the feature that sold me.
7. **Denver 2029-2033.** I inherited Jokić (93) and Murray (88) and went 28-54, 28-54, 23-59, 25-57. The owner's goals were low ("win 23-27"), so I got +11, +2, -40, -60. After a second -40-or-worse I was **fired** (2033 "You're fired" moment, quoted below). My autopilot FA could not buy anyone while over the cap. Jokić fell 93 to 86 to 82 at 36 and I re-signed him anyway.
8. **Summer 2032.** Denver had $144M of cap space and a 9-man roster. The top FA, Kalaitzakis (89/94, 24), picked New Orleans with an identical $58.5M offer ("He liked their situation better. Playing time matters most"). I was "Not keen" territory after losing. I left Edey, Murray and Jokić on the roster and ended with $172M payroll against a roughly $234M cap, below the floor. A weak spot.
9. **Trade desk test (preseason 2032).** I asked ATL for K. Cooper (84, 23, $6.5M expiring). "What would make this work?" answered "Kyrie Holland (87) + two firsts + $7.3M cash." That is a huge overask. The meter and the explain button are good UX, but the AI's value curve for its own young players is greedy.
10. **Fired, Jun 2033.** "Find a new job" was the only enabled play option, so the league waits for you. Two offers came back: UTA (17-65) and CHI (19-63, "Nobody better is calling, so they'll take a chance on you"). My rep had fallen from 44 to 35 (26th of 30). I went home to Chicago.
11. **A strange league beat.** Chicago went 43-39 and lost the 2nd round (2034-35, 5th seed), then 48-34 under the AI coach in 2031-32 while I was away, then 19-63 the year I left. Denver went 25-57 under me and **48-34 with essentially my old core under Faulkner** (he finished 138-108 over 3 years). The league reads as alive and swingy, but it also says "your coaching/GM contribution is invisible and the AI does better with the same guys."
12. **Chicago return, 2033-36.** 28-54, 43-39 (R2), 32-50. I never got the owner back above "Steady". Fans slid from Buzzing to Restless, with the Stadium at 89% full. The pulse tells the story.
13. **2036 draft board.** The #1 prospect is 84 OVR, POT 95-99 (Kyrie Greene), versus a #11 pick of about 70-74 in 2027. Classes vary visibly, which is good.
14. **Hall of Fame / Records.** 17 inducted by 2036 (Tatum, Mitchell, Jokić, Giannis, Kawhi, Embiid, Curry, Durant, SGA...). Records show a 35.1 PPG season (K. Wagler, 2034-35) and 389 threes. Franchise leaders include "C. Wilson, 10 seasons, active". This is the part that made year 10 feel like a world.

## Scores
| Area | Score /10 | Why (one line) |
|---|---|---|
| A First hour | 8 | Owner goals up front, queue checklist, readable Play sheet. A quick sim to the end of the regular season took 37 s. |
| B Coaching depth | N/A | I mostly sim. The staff's plan, "Ice coverage" and the rotation are visible, and I did not test them. |
| C Game day | 7 (one game) | Live play-in at 390 wide: clean 2D court, hot-hand and switch-hunt callouts, a closing "Double Allen?" prompt, post-game report with luck vs tactics. "Skip ahead" menu was hard to reach mid-play (see Bugs). |
| D Front office | 7.5 | Re-sign sheets, FA bidding with rival offers and decision day, trade meter, GM personalities, deal history. Weak: AI overasks, bidding gives no way to out-woo stars when "Not keen", and I could not spend cap space. |
| E Rebuild & development | 6.5 | Summer-development mail is excellent ("Staff priority +1.4 to López"). But my rebuild never worked, and prospects top out quickly. |
| F Analytics | 7 | Team stats table has ORtg/DRtg/Pace/eFG/3PA rate, net rating and records. Game report separates looks vs shooting luck. No season-over-season league trend page. |
| G Sim honesty / long-run world | 8.5 | Over 10 seasons: no drift (see numbers), real aging, retirements and a Hall of Fame. Slightly flat and parity-heavy. |
| H Stakes & story | 9 | Owner cards, review grades, hot seat, firing, job market, new-job moment, reputation, coach list. Best layer in the game. |
| I UX on my device | 7.5 | Cards clean, tap targets fine. Offseason is a lot of taps, and the screen is dense. |
| J Overall for this audience | 8 | A GM-career sim that is honest at year 10 and gives me reasons to keep going. |

## League drift check (10 seasons)
- **Ratings (top-100 list):** mean top-100 OVR stayed 84.9 (2027), 85.3 (2029), 85.0 (2030), 85.2 (2032), 85.3 (2034) and 85.3 (2036). Top-10 mean 92.8 to 93.2. Players >=90: 11, 15, 17, 16, 16. **No inflation or deflation.**
- **Ages:** mean age of the top 30 held at 26.2-26.9, with new stars rising (Flagg 89/96 at 21 in 2027, Harper 91/95 in 2029, White 92/96 in 2034, Anderson 91/95 and Myers 88/98 at 21 in 2036). Wembanyama stays about 94-98 through age 32.
- **Aging stars (star-check run, 8 leagues x 8 seasons):** Jokić 96 to 70 and retired, Giannis retired at 37, Kawhi retired at 38. Real stars age and leave.
- **Scoring and style (2035-36 team table):** about 114-121 ORtg, team PTS about 108-121, pace 95-100, eFG 52-60%, 3PA rate 36-49%. season-test also showed 115.5 and 113.7 ppg in earlier years. It is a hot, three-heavy league but stable.
- **Economy:** cap went $174.9M (2027) to about $234M (2032), around 6% a year. Payroll/cap median 1.13-1.21, tax line near $265M. Salary asks scale steeply with OVR (86 asked $46M, 82 asked $21M a year later). Players on rookie scales are cheap. I saw no broken economy.
- **Dynasties:** champions CLE, PHI, CHA, OKC, WAS, MIN, SAS, LAC (twice) and BKN, so 9 teams in 10 years. star-check says OKC 18 of 64 seasons across seeds, within its "a third or less" target. It feels parity-heavy, with no real dynasty in my save.
- **Records:** Wagler 35.1 PPG and 389 threes are plausible. A 177-174 game, a 69-13 and a 12-70 are in range.
- **Draft classes:** vary (the 2037 #1 is 84 with POT 95-99; the 2027 class was thinner, with picks 13-18 at 67-74).
- **Watch from star-check:** foul-outs 257 a season against a target of 130 (flagged "not failing, missed").

## What hooked me (top 5)
1. **Job market and firing flow.** Reputation 44 to 35 with named openings and "Rated you 44, Castellano 42"; the "You're fired" moment; "Find a new job" as the only enabled play option; returning to the old club. This is the feature no other sim has.
2. **A world with memory.** Hall of Fame (17 inducted), franchise leaders, a coaches table, record book, team seasons with "Lost Conf. Finals / Lost Play-In" tags. By year 8 I was reading history pages for fun.
3. **Honest long-run numbers.** Flat rating distribution, stars retire on a believable curve, new generational youngsters at 21-22 every few years.
4. **Owner voice and grading.** Goals reset each season and respond to the roster ("43 wins and playoffs" after a 33-win year), with "last season graded poor: a second in a row and he fires you" as a clear threat.
5. **Post-game "what decided it".** Looks +4.6, shooting luck -10.6, free throws +12 = +6. It explains a 2-point swing in words, not vibes.

## What pushed me away (top 5)
1. **(major) Owner goals are inconsistent with the stated type.** Denver was "Win-now · wants results" but set goals of 23-27 wins on a roster with Jokić and Murray, which let me coast to 28 wins and sit at "Season grade +2" while the franchise rotted. Then a -40 and a -60 got me fired quickly.
2. **(major) The AI beats the user with the same roster.** Denver went 48-34 under Faulkner a year after my 25-57. Chicago went from 19-63 (after I left) to 43-39 when I returned, and 48-34 under another coach. As a long-game player it is demoralising when my "development / tactics" ratings (77 / 56) never visibly translate.
3. **(major) Cap space is hard to use.** Stars said "Not keen" because I was losing, one chose another team on an identical offer, and the trade market asked for Holland (87) plus two firsts for an 84 on an expiring deal. I ended the summer $60M under the cap and below the floor, with nothing to buy.
4. **(minor) Offseason tap volume.** About 6-8 screens (lottery, draft, re-sign, FA bids, days of FA, release picks) per year, repeated for 10 years. Fine at first, a chore by year 6. A "run my summer, staff decides" option would help a journeyman.
5. **(minor) Parity.** Nine different champions in ten seasons. A true dynasty or a Warriors-style run never emerged in my save, though star-check says 18/64 for OKC across seeds.

## Bugs (repro steps)
- **Play-in leaves a live game resumable but "Skip ahead" is not in the accessibility tree for a moment.** In a live play-in, `getByRole('button',{name:'Skip ahead'})` timed out when the game was running. It only appeared after Pause. Screenshot: `.../07-journeyman/shots/err.png`. Minor, since a phone user would tap Pause first.
- **Owner/Goal contradiction:** DEN card says "Win-now owner: wants results this season" but opening-night goals were "Win about 27 games, ... two seasons without the playoffs." Screenshot: `shots/s28a.png` and the text in `playlog.txt`.
- **Hall of Fame rows show "Latest in: Shai Gilgeous-Alexander" while the first row index reads "2"**, a small display quirk in the HoF list header.
- **Re-sign at "Not keen":** Jokić was re-signed at 36 for $21M, and I could not tell from the sheet that his OVR drop was baked in (82 to 77 within one summer). The sheet shows the age but no aging warning.
- No page errors seen in `page.errors` during the runs I looked at.

## Against the genre (FM / BBGM / MyNBA / Hoop Land)
- **vs Basketball GM:** BBGM is faster to sim 20 seasons and has deeper league history pages, but Hoops Career wins on presentation, real names with invented nicknames, the owner and fan layer, the FA bidding with named rivals, and the job market. BBGM has no job market.
- **vs FM:** The career layer (reputation, openings, "rated you 44, Castellano 42", being fired) is FM-like and the best I have seen outside FM. FM still wins on scouting depth and staff, and on letting a managerial reputation actually move.
- **vs MyNBA/MyGM:** wins on honesty of outcome. 2K's world drifts into nonsense by year 8, and this one stayed flat. Loses on pageantry.
- **vs Hoop Land / Draft Day:** better feeling of consequence.

## Would I pay and keep playing
- **$7.99 on phone:** yes. The first 3 seasons are the hook and the career layer is the reason to stay.
- **$14.99 on Steam:** probably yes if I could set the summer to "staff handles it", and if there were a multi-decade league-trends page.
- **Hours:** 40-60 over a month, spread across 3-4 careers. My fired-at-Denver arc is the story I would tell.
- **Recommend to a friend:** 8/10.

## The one change that would most raise my score
Make the user's GM and coaching decisions visibly matter at the table level, and let a bad owner goal bite sooner. Two concrete steps: (1) tie owner goals to the roster and owner type (a "win-now" owner never asks for 23 wins when he has Jokić), and (2) make the AI trade and FA markets sell cap space for real value (stars should accept the best offer when it is the same as a rival's, and a rebuilt team should be able to buy talent). Then a 10-season career would be earned by the user, not carried or sunk by random AI luck.
