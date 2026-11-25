# 06 — The Game-Day Coach
## Who I am and what I played
Youth-basketball coach, here for the sideline. Real 2026 league, GM + Head Coach, Charlotte Wasps (East, mid team: owner wants about 40 wins and the play-in). Phone viewport 390x844 for the career. A copy of the save went to separate profiles for the 3D stills, at 390x844 and 1280x800.

I coached 12 games live (Oct 21 to Nov 12, about 5-6 s of real time per game-minute at 8x, 4-8 minutes of wall time per game while the machine was busy). I did not reach the 25 I aimed for. A bot I wrote drove most of the live loop, so my "decisions" were rule-based. The rules were: timeout on a 6-0 run, slow to 2x in the last 4 minutes, a halftime adjustment by margin, and accept or decline the staff's sub cards. Record when I stopped: 6-6, 7th in the East, play-in range. Roughly 4 hours of play and waiting in total.

## Play log
- **Oct 21, Release 2 (staff's picks).** Opening-night roster cut: 17 signed, 15 allowed. The staff picked Connaughton and Salaün and said up front that $12.1M stays as dead money. Clear, fair, and a good first decision. The guide card ("Your first games 0 of 4") walked me through rotation, playbook, game plan and "Coach a game live."
- **Oct 21, @BKN (L 120-124), game 1.** I used the timeout to call "Hammer: Allen." The log read "Ran it: 3 points." Allen hit 4-4 from three early. The Q1 break report was good: 64% FG, a shot-quality line, and "CHA +6.0 pts luck." I skipped to the clutch, lost by 4, and the post-game screen read Tactics +4.5, Shooting luck −16.5, Your moves 0.0.
- **Oct 23, vs ATL (W 126-116), game 2.** I set a pre-game plan: double-team their top creator. The staff said "Staff still looking at counters." The game was tied at 90 after Q3 and I won by 10. The staff card said "ATL on a 6-0 run... A timeout ends it."
- **Oct 24, vs MIA (L 140-145), game 3.** Down 41-24 after Q1 because Miami shot 87.5% eFG on looks worth 53%. The report said "That part is luck, with nothing to change." Honest, but it left me nothing to do. I lost by 5 with 285 combined points.
- **Oct 24, vs ATL, then WAS (W 127-100, a 31-point halftime lead).** Nothing to coach.
- **Oct 28 and 30 (L 118-123 at DET, L 99-109 at WAS).** Both were runs where I changed things at the half and the game still slid away.
- **Oct 31, vs PHI (W 132-115).** Miller scored 40.
- **Nov 2 to Nov 12.** W 97-90, W 114-100 (accepted the staff's "Pressure the ball," which looked like it worked), L 101-116 (Cup game vs 5-0 BOS; I was −19 at half and tried a press after makes, which did nothing), W 119-105, L 117-126 at PHX (2-3 zone at the half, still lost).
- **Nov 13, Season Analysis.** "Your live coaching −2.9 pts ±1.5 over 6 games coached live... inside the noise... The staff's bench would have done about as well." It broke that down: 47 subs ≈ nothing, 15 timeouts +0.9, 8 play calls −0.7, 3 tactical changes −3.0 ("Costing you"). Zone defense "Cost you." Humbling and excellent. It told me the truth about my coaching and made me want to do better.
- **3D stills:** Taken on both viewports; the verdict is in the Game day score.

## Scores
| Area | Score /10 | Why (one line) |
|---|---|---|
| A First hour (hook + learnability) | 8 | A guided first-games card, honest cut/dead-money text, and a clear Play sheet. A beginner can find "Watch & coach live" in minutes. |
| B Coaching depth (tactics, rotation, game plans) vs FM | 8 | Per-defender matchups, double a star, hack-a-player, junk defense, per-player shot freedom, role, crunch-time go-to, who-he-guards, scheme and press. FM-level breadth for a basketball game. |
| C Game day (live coaching: feel, and does it matter) | 7 | Feels like coaching: timeouts with a named play, sub sheet, staff cards, break reports with luck separated out. But the staff's "Not now"-style cards are thin, headless speed controls were hard to drive, and the game said my moves barely matter (see below). |
| D Front office | N/A | Barely touched (roster cut only). |
| E Rebuild & development | N/A | Not exercised. |
| F Analytics | 9 | "What's deciding it," four factors, luck vs looks, a 200-replay "Your moves" counterfactual, and Season Analysis that scores my own live decisions with error bars. The best part of the game for me. |
| G Sim honesty & realism | 6 | Honest about luck and about me, but scores run hot (140-145, 132-115, 285 combined in one game) and one game had 87.5% eFG for a whole quarter. Details below. |
| H Stakes & story | 6 | The owner goals are clear (40 wins, play-in, minutes for under-23s), but in 12 games I saw little of job-security or locker-room pressure. |
| I UX & feel on my device | 7 | Phone UI is clean and the tabs are well organised, but play controls collapse and the half-screen of staff cards pushes the court up. Notes below. |
| J Overall for this audience | 8 | A real coaching tool that is honest about itself. |

### 3D court (judged as stills; headless draws it slowly)
- **Desktop 1280x800: really good.** Packed crowd in team colours, benches with suited coaches, a referee, a floor that reflects, "WASPS" and "CHA" in the arena trim, and a play caption ("Alley-oop · Charlotte up 7-0"). The tip-off screen adds per-game lines for each starter (Cunningham 22.8/5.8/9.5). It looks like a mid-budget basketball game.
- **Phone 390x844: also good, but cramped.** Players read clearly in jersey colours with a name tag on the ball handler. The 3D area is only about 390x380, so the view is tight and you see five or six players at a time. A "3D is running slowly on this device" banner covers the top of the court for the whole time (in a headless browser; a real phone will differ). One of three stills was a black frame mid-game (headless drawing, not necessarily a real bug).
- **Verdict:** more polished than I expected from a PWA. It is a good place to watch a game, not a place to coach one: all the coaching happens in the 2D tabs below it.

## What hooked me (top 5)
1. **Season Analysis grades my live coaching with error bars** ("−2.9 pts ±1.5... the staff's bench would have done about as well"). That is the most honest thing any sports sim has ever told me.
2. **Break reports separate looks from luck.** "Charlotte's shots fell above their looks: made 128.6% eFG on looks worth 60%" (a 120-124 loss with −16.5 luck). It made me stop being angry at one night.
3. **Timeouts that call a named play** ("Hammer: Allen, a corner three on the kick-out"). It was a one-tap sideline decision with a diagram, and the log recorded "Ran it: 3 points."
4. **The sub sheet is deep:** the energy of each bench player, the staff's pick, shot freedom, role, crunch-time go-to and who he guards, all from tapping one name.
5. **Skip ahead is well designed** (End of Q2, Clutch time, Sim to final, with "an injury to a starter stops the skip"). It let me watch the minutes that mattered.

## What pushed me away (top 5)
1. **Major: live coaching does not seem to matter, and the game says so.** In 12 games my 47 subs and 3 tactical changes came out at −3 points. It is honest, but a game-day fan wants the lever to work. The staff's "Nothing the staff would change right now" showed on nearly every card.
2. **Major: foul-trouble card ping-pongs.** In game 3 the staff's "Tired or in foul trouble" card kept offering "Reid 2 fouls, Diabaté in," then "Diabaté 2 fouls, Reid in," over and over (my bot accepted about 25 swaps in one game before I added a guard). Swapping one 2-foul big for another is not advice.
3. **Major: scores run hot.** Combined scores of 285 (140-145), 247 (132-115) and 242 (126-116). The NBA's real average is around 230. Shooting luck of ±16 points a night showed up repeatedly.
4. **Minor: after-timeout play list is hard to scan.** Eight named sets with one-line descriptions and no recommendation, and "Ran it" came back for every pick.
5. **Minor: tab buttons in the Tactics panel are tiny and the press button's label opens a help sheet instead of the setting** (see Bugs).

## Bugs
- **Staff card flip-flop:** play a game with two bigs at 2 fouls in Q2. The "Tired or in foul trouble" card offers each as the sub for the other repeatedly. Log: `players/06-gameday/game3.log`, lines 13-47.
- **Press label opens help:** on the halftime Tactics tab, tap the words "Full-court press" and a "Press" help sheet slides up. The real settings are "No press / After makes / Always." Screenshot: `players/06-gameday/g6end.png`.
- **Speed control resets to 1x after every timeout** and the collapsed bar reads "Speed 1×: playback controls" with no hint that it expands. In headless, 2x became the default after my first timeout and I had to expand the bar to set 8x.
- **Break "undefined" clock:** during quarter breaks the scorebug shows "Break / End Q1," which is correct, but the live text exposes no clock and my parser got "undefined." Probably fine for players.
- **One black 3D frame** on the phone profile (`3d-phone-c.png`), probably headless.
- No page errors were logged by the kit during any game I looked at.

## Against the genre (FM / BBGM / MyNBA / Hoop Land)
- **Wins vs BBGM:** BBGM's live game is a play-by-play text log with a few sliders. This has a court, a staff, named plays and per-player roles.
- **Wins vs FM:** FM's match day has more tactical sliders than this, but FM never tells you with error bars that your own substitutions were noise. This does.
- **Loses vs MyNBA/2K:** 3D here is a viewer, not a controller. I never touched the ball.
- **Hoop Land comparison:** closer in spirit, but with a better analytics layer.
- **Loses on depth of reaction:** the staff's calls are rare and generic ("ATL on a 6-0 run... a timeout ends it").

## Would I pay and keep playing
- **$7.99 phone unlock:** yes, on the strength of the analytics.
- **$14.99 on Steam:** probably, if the scoring is tuned and the staff gets smarter.
- **Hours:** about 30 for a season of live games.
- **Recommend to a friend:** 7/10.

## The one change that would most raise my score
Make the staff's sideline advice specific and measurable. For example, say "Their pick-and-roll is scoring 1.35 per possession against drop, switch Reid" with a one-tap apply, and show what each accepted call was worth in the same replay model Season Analysis already uses. Today the game proves my moves barely matter. It should also give me moves that do.
