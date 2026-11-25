# 06 — The Game-Day Coach (37, youth-basketball coach)

Folder: .../scratchpad/playtest/players/06-gameday/ (logs g1..g29.log, reports g*.report.txt, 3D stills in shots3d/)

## Who I am and what I played
- Real league, GM + Head Coach, Chicago Stampede (East). I wanted a mid team. The owner's goal was "win about 26", so Chicago is a lottery-bubble roster, not a mid team. That cost me wins and I should have picked better.
- Phone 390x844 for all coaching. Desktop 1280x800 for the 3D look, plus phone 3D stills.
- 31 regular-season games coached fully live, Oct 21 to Dec 26, record 9-22. I never simmed a game. I never reached the playoffs, so no playoff games.
- Rough time: about 4 hours. A live game takes 3-8 real minutes at 4x. About 60% of that was my script waiting, so a human would feel the same.
- Staff calls were accepted by script. Timeouts followed opponent runs of 8-0 or more. Plays were picked from the timeout board. I also tried the Tactics, Players and Skip tabs by hand.
- I could not exercise real crunch-time fouling. My late-game trigger fired only after the final buzzer in the closest games (108-108 into OT, 112-110, 96-103). The tools are visible and I read them, but I never fouled live. That is a gap in my report, not a verdict.

## Play log
1. Oct 21 @TOR, game 1. I resumed into a timeout and saw the "Call the play" board: Iso Jones, Spain, Horns, Floppy, Elevator, Post split, Hammer. Each has a one-line why and a diagram, and it "runs on your next trip up the floor". This felt like a clipboard. I picked Spain and lost 94-118. The report replayed the rest of the night 200 times with and without my moves: "timeout +0.5 ±1.1, play call +0.1 ±1.1, inside the noise". Honest, and a bit deflating.
2. Oct 23 @MIL. I built a game plan: staff counter "Switch coverage" ("Should help"). I was up 98-82 and lost 113-118, with Q4 15-34. The staff card during the game said "Milwaukee hunted switches... stop switching with a slow big. Go to Drop or Ice". My script ignored it. The report graded my plan: "MIL pick-and-roll 1.76 a trip on 34 trips, 1.36 coming in". A bad plan, shown with numbers. The report also said shooting luck was +16.7 ("about a 1-in-40 shooting night") and a torn ACL ended Buzelis's season (out 87 games) on night 2.
3. Oct 26 vs BOS, a 127-123 win. The report said "looks -27, shooting luck +19, 1-in-90 night". It was my first win and the report told me it was luck.
4. Oct 30 @BOS, lost 98-123. Boston had 19 offensive boards to my 9. That became a theme: Season Analysis later showed Opp ORB% 25th of 30 and Defensive glass B+. I never found a lever that fixed it.
5. Nov 4 vs NYK, lost 104-136. NYK shot 70.7% eFG on looks worth 51.4%. The report said "about a 1-in-98,160 shooting night" and luck -33.1 pts. Game 9 of 82.
6. Nov 14 vs ATL, a 113-112 win. Luck +27.5 ("1-in-4,070"). Nov 18 @BKN, a 121-80 win. Luck +45.7, "1-in-900,856,495". I won by 41 and the game told me a billion-to-one thing had happened.
7. Staff cards I liked, all during live play:
   - "Turner has 12. Double Turner / Not now."
   - "Gordon has the hot hand. He shoots better until he misses or sits."
   - "Tired or in foul trouble: Okoro. Powell in."
   - "Powell can't come in for Okoro right now."
8. Break screens (end of quarter) show a shot chart (made/missed dots), a quarter box, and "What's deciding it". Examples: "Offensive rebounds CHI 1 TOR 5, TOR +4.2 pts" and "Toronto attacked drop with pull-up jumpers". They also show "Their coach: stops blitzing ball screens" and "Your moves: Iso Jones, ran it: 2 points. Timeout: CHI 2-3 since". This is the best coaching feedback loop I have seen in a sports game.
9. Nov 23 vs DEN, 3D desktop session. Screenshots at tip-off, half-court sets, a P&R, a break. See the 3D section.
10. Dec 8 vs PHX, a 134-? OT loss. Dec 22 vs MIA, a loss with a 33-pt game from Powell; the report said my moves were +1.0 ±0.9.
11. Dec 26 vs DET, 114-81 loss. I used Skip ahead -> "Sim to final: the game is decided". It worked. "End of Q4" stops at the break with the report. An injury to a starter stops the skip.
12. Dec 29 Season Analysis, "Your live coaching" after 29 games: +4.3 pts ±4.8, "No proof either way yet... The staff's bench would have done about as well." The components: 82 subs -5.6 ±5.2, 63 timeouts -3.1 ±5.6, 62 play calls -10.1 ±5.7, 10 tactical changes +0.7 ±3.7. The headline is positive while three of four parts are negative and big. I could not reconcile it.
13. Dec 29 Players tab, the Hack-a-player control: "77% from the line. At 77% he's no target: fouling him gives away points." That is a smart, honest nudge. I did not get to use it in a real crunch.

## Scores
| Area | Score /10 | Why |
|---|---|---|
| A First hour | 7 | The first-games checklist ("Set your rotation, Pick a playbook, Plan for your opener, Coach a game live") is clear. The live game's coach-marks are good ("Tap the court for playback"). Opening a live game from the Play sheet is easy. |
| B Coaching depth vs FM | 8 | Tactics has style, shape, roles, mentality, coverage (Drop/Switch/Hedge/Blitz/Ice), ball pressure, help, tempo, shot profile, hot hand, crash glass, foul rules, 2-for-1, game plans (counters, who guards whom, double a star, hack, junk defense). That is more than BBGM and near FM. The depth is real and readable. |
| C Game day | 6 | The tools are excellent (timeouts, ATO board, subs, staff calls, tactics tab, hack, skip). The feel is a coach who watches a very good broadcast: results are mostly luck, and my moves are "inside the noise". |
| D Front office | 4 | Barely exercised. Free agents were all minimum deals. Trade offers kept arriving (MEM: Coward 79 + Anthony 72 + 2nd for Wilson 77). I did not accept any. |
| E Rebuild & development | N/A | Not exercised in 31 games. |
| F Analytics | 7 | Four-factor report, "looks vs luck", per-move replay, season tally and "how teams see you" are strong. The luck numbers look miscalibrated (see Bugs). |
| G Sim honesty & realism | 5 | Box scores and flow look right. The shooting variance is far too wide for an honest sim: luck swings of +45.7 and -33.1 pts, and "1-in-900 million" nights. |
| H Stakes & story | 6 | Owner check-in at Dec 1: "You've gone 6-13... on pace for 26 wins." Fans "falling". An ACL on night 2 hurts. Not reached: playoffs. |
| I UX & feel on my device | 8 | Phone portrait half-court is clear. The desktop right-hand coach panel is strong. Staff cards are readable. A few headless-only slowdowns. |
| J Overall for this audience | 7 | The best gameday-explanation layer I know. It does not yet make me feel like my calls decide games. |

## What hooked me (top 5)
1. "Your moves" with 200-run replays after every game. It answers "did my timeout work?" with numbers and error bars, e.g. "Timeout (-1.3 pts) mattered most". No other sports game does this.
2. Break screens and report. "What decided it" (turnovers, offensive rebounds, drop-coverage pull-ups), a shot chart per quarter, and "luck vs looks" explain why I lost. Example: Nov 4 NYK 70.7% eFG on 51.4% looks.
3. The timeout board. The ATO plays are named, have a diagram, and are tied to a player ("Spain: Smith", "Hammer: Williams"). "Runs on your next trip" feels like a real set.
4. Staff cards with real basketball logic. "Milwaukee hunted switches... go to Drop or Ice" is exactly a youth-coach assistant's note. "Hack-a-player: 77% from the line, no target" is smart.
5. 3D court. Referees, benches, scorer's tables, LED boards, a crowd, readable numbered kits. On desktop it is a real broadcast; the app even offers "3D is running slowly on this device: Use 2D / Keep 3D".

## What pushed me away (top 5)
1. Luck swings (major, honesty). In my reports: +16.7, -0.2, +19.0, +15.9, -21.2, -33.1, +13.0, -4.9, +27.5, -8.3, +45.7, +8.4, -7.4. Seven of 14 reports read as "1-in-30" or rarer. Real NBA shooting luck has a standard deviation near 7 pts. This sim sits near 20.
2. My coaching doesn't read as mattering (major, feel). Every single move is "inside the noise". Over 29 games my play calls read -10.1 pts and subs -5.6. I can't learn what works because the error bar is wider than any move. As a coach I felt like a very well-informed spectator.
3. The opponent-glass problem (major). Opp ORB% 25th-28th. I saw 19-9 and 14-5 offensive-board splits; the staff said "nothing the staff measured helps from here" while the glass decided the game three times. I had no lever that changed it.
4. Staff cards expire if you aren't watching (minor). The Milwaukee "Go to Drop or Ice" card was shown at 98-82 and I lost the lead. That is fair, but at 4x you can't read and act. A "review the last 3 staff calls" log would help.
5. A mismatched team pick (minor, mine). Chicago's owner goal is 26 wins; I wanted "mid".

## Bugs (repro steps, screenshot path)
1. Season Analysis "Your live coaching" total does not match its parts. +4.3 ±4.8 headline vs 82 subs -5.6, 63 timeouts -3.1, 62 play calls -10.1, 10 tactical changes +0.7. Open /team/tactics/analysis after ~29 live games.
2. Shooting-luck band is implausible. Nov 18 CHI 121-80 BKN: luck +45.7, "about a 1-in-900,856,495 shooting night". Nov 4 NYK: -33.1, "1-in-98,160". Reports at .../06-gameday/g14.report.txt and g9.report.txt. One quarter's luck line also looked too big: Nov 23 DEN end of Q1, 13-of-24 shooting on 51.3% looks was labeled "+15.1 pts luck"; by eFG alone that is about 8-9 pts (.../shots3d/d3_28.png).
3. A "Sim to the end" button sits in the top playback bar near the end of a game (seen at 108-103, 4:59 Q4). I clicked it by script by accident. A real player could lose the final 5 minutes to a mis-tap. No confirmation. The tap area is small.
4. Resuming a game after leaving it lands you inside a "Your timeout" screen if you left during a timeout. Fine, but there is no indication that the clock is stopped.
5. Headless-only: the 3D court ran at about 1/4 real speed (clock moved 12:00 -> 9:51 in ~70 s at 4x). The game offered "Use 2D" itself.

## Against the genre
- vs FM: on par for post-game "why" and for tactics breadth. Behind in live manipulation. FM lets me tweak individual instructions on the fly and see the shape change; here my changes are few and graded as noise.
- vs BBGM: far deeper live game. BBGM has no timeouts or ATO.
- vs 2K MyNBA: better analytics and coaching depth; visuals are in the same class on desktop 3D, with fewer animations.
- vs Hoop Land: richer tactical options and an honest results ledger.
- Where it loses: no sense that a hunch beats the staff. The replay ledger says it often doesn't.

## 3D court (desktop 1280x800 and phone 390x844)
Stills: .../06-gameday/shots3d/d3_07.png (tip-off, referee, tip), d3_09.png (half-court set), d3_11.png and d3_14.png (P&R, ball handler named "Murray"), d3_20.png (Powell isolated vs defender, crowd), d3_28.png (end-of-Q1 break with shot chart on the right), p3_08.png / p3_17.png / p3_21.png (phone).
- Look: warm maple floor, arena-specific "CHI" inlay, bench rows of staff, LED ribbon boards, a dense crowd with exit signs, shorts and jerseys that read as teams. The camera rotates (Broadcast, Sideline, Baseline, End zone).
- Readability: on desktop, numbers and names are clear; the ball carrier gets a name tag ("Powell", "Murray"). On the phone the half-court view is smaller but still readable; there is a "+2" and "Miss" bubble over a shot; "Claxton, putback dunk... Miss" caption.
- Issues: the first frame showed players clipped at the left edge (d3_07). No replay ever played in my 3D stills; I did not catch the final frame in 3D because 3D slowed the game. In one frame a camera sits in the crowd with dark head shapes in the foreground (d3_14, bottom).
- Verdict: the 3D court is the nicest part of the product for a hardcore viewer. Headless can't judge motion.

## Would I pay and keep playing
- $7.99 phone unlock: yes for the analytics and live layer, if I believed the luck numbers. The odd variance makes me doubt the sim.
- $14.99 on Steam: maybe. It needs real-time pace controls (at 4x I can't react), and a clearer sense that my choices matter.
- Hours I'd put in: ~40 if wins feel earned, ~10 if I keep seeing 1-in-a-million nights.
- Recommend to a friend: 7/10.

## The one change that would most raise my score
Make my decisions visibly count: widen the lever a coach has (glass duties, matchup hunting, late-game fouling with proper win-probability numbers) and fix the shooting-variance calibration, so that "luck" is a small part of a night and "my moves" a measurable part.
