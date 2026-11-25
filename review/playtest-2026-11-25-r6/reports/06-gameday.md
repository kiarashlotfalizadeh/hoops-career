# 06 — The Game-Day Coach
## Who I am and what I played
Real 2026 league, East, Atlanta Redtails (owner: win about 34, 6,300 minutes to players 23 or under, stay under the tax), GM + Head Coach. 9 live games coached (game 9 at 113-80 with 2:12 left, then my tooling stalled), 0 skipped-ahead games, 0 full seasons. Record 4-5 (3-5 plus the WAS blowout). Phone 390x844 for coaching, plus two extra profiles for 3D stills (phone and 1280x800 desktop). About 3 hours wall time, a lot of it lost to my own automation, not the game.
I did not reach 25 games. My scripts polled the live screen and twice sat on a paused timeout screen for ~13 minutes each (my bug: I called a timeout and did not click Resume). The game itself waited patiently each time.

## Play log
1. Oct 21 opener @ ORL. Day-one Today screen is strong: owner goals, "Your first games 0 of 4" checklist, one big Start button. Lost 96-105. Staff card said "They're winning the glass by 7". Post-game card: Tactics -2.6, Shooting luck -19.9, Your moves +0.2, and "How the margin adds up". That is the best thing in the game.
2. Subbed Johnson (88) in for Wiggins at the Q1 break via Players tab. Sheet shows energy, shot freedom, role, crunch-time toggle, who he guards. The "Your moves" log then shows "ATL 28-25 since", so my sub is graded on the spot. That is coaching feedback FM does not give.
3. Q1 report said "Orlando beat the blitz with quick passes into 4-on-3s: Stop trapping good passers: Hedge or Drop". I switched Blitz to Hedge live. Logged as "Blitz → Hedge, ATL 4-2 since". Felt clever, though 2 possessions is noise.
4. Oct 23 @ CHA, 96-134 loss. Staff-recommended "Blitz the Ball" was torched all night ("beat the blitz" every break) and Charlotte shot 85% eFG in Q1 on looks worth 68%. Margin split: looks -8.8, shooting luck -29.2. Honest, and also a 38-point loss that was mostly "luck" is a hard pill.
5. Switched team defense to Drop & Protect (the staff rated it "slightly worse" than Blitz). Next games: L 124-130 HOU (blitz era, -9 from free throws), L 102-120 HOU (-17 free throws: ATL 13-16 fouls vs 7-9), W 116-113 MIA, W 112-111 CLE, L 96-118 NOP, W 121-119 IND, W vs WAS by 33.
6. Oct 28 vs MIA, tied 113-113, 3.8s, our ball: the game stopped on a "Last possession" panel: Timeout / Iso McCollum / Hammer (flagged "Run 2×, they're on it") / Elevator. I took Elevator: McCollum, three at the buzzer, won 116-113. Best moment of the session. Hooked.
7. Plays I had already run are flagged as scouted ("Run 2×, they're on it"). Smart, it stops me spamming one set.
8. Nov 3: IND win 121-119 after an after-timeout Iso: Johnson at Q4 9:00. Decent, but I cannot say my call decided it.
9. Opponent staff acts too: "Their coach puts Thompson on Johnson" shows at breaks. Good, the other bench is alive.
10. Timeouts: 7 per game, scripted run-timeouts burned them fast; then I had 1 left in crunch. Real coaches feel that tension. The timeout screen has 8 diagrammed sets (Spain, Horns, Floppy, Chicago...) with a mini-board. Very good.
11. 3D stills (see below): looks genuinely good.

## Scores
| Area | Score /10 | Why |
|---|---|---|
| A First hour | 8 | Clear owner goals, checklist, a one-tap path to a live game; the broadcast-sideways prompt and tip cards stack up |
| B Coaching depth | 8 | Playbooks ranked by roster fit, per-play-type defense, matchups, mentality, hack-a-player, double-a-star, scouting counters; not FM-deep on set pieces |
| C Game day | 8 | Breaks with a "what's deciding it" report, subs, timeouts with plays, last-possession call, staff voice; moves are graded. But runs stay hard to react to at 4-8x |
| D Front office | N/A | Not exercised |
| E Rebuild | N/A | Not exercised |
| F Analytics | 8.5 | Looks vs luck vs tactics is genuinely novel and mostly believable; sometimes says "luck" for 20+ points |
| G Sim honesty | 6 | 130-124 and 134-96 swings, 85% eFG quarters, ATL outfouled badly several games; the staff's "best fit" defense got shredded |
| H Stakes & story | 6 | Owner card and "Last 4 LLLL" are clear; only 9 games so little story |
| I UX on phone | 7.5 | Dense but legible; sub sheet, timeout sheet work; some overlay stacking at game start |
| J Overall | 7.5 | The sideline is the real thing |

## What hooked me (top 5)
1. The post-game "Tactics / Shooting luck / Your moves" numbers with a margin breakdown. It answers "did my coaching matter" directly (e.g. -2.6 / -19.9 / +0.2 vs ORL).
2. "Last possession" panel at tied 113, 3.8s: pick the set, win on a buzzer three (116-113 MIA).
3. "Your moves" ledger with "since" splits on every sub and tactic change.
4. Break reports in coach language ("Orlando beat the blitz with quick passes into 4-on-3s: Hedge or Drop instead of Blitz") that name the cause and a fix.
5. 3D court stills: refs, benches, crowd, shot close-up cam.

## What pushed me away (top 5)
1. Staff-recommended Blitz defense lost by 38, 6 and 18 (major). The assistant's "best fit" and the staff's own live advice contradicted each other every break. Evidence: CHA game, "beat the blitz" in all three break reports.
2. Free-throw deficits: ATL fouled far more than opponents in several games (FT -9, -17; PF 16 vs 9 vs HOU) (major). Pressure/blitz seemingly drives fouls; no clear warning.
3. Live pacing: at 4-8x a 10-0 run can pass before I react, and the game does not auto-pause on runs (major for a coach). Timeout is one tap, but I only saw the run from the header.
4. Luck-heavy verdicts (minor to major): 17 and 29 points of "luck" in one game makes the sim feel arbitrary even if honest.
5. Default tips/overlays at game start ("watch sideways", 3D running slowly, camera tips) cover the court on a phone (minor).

## Bugs (repro steps, screenshot path)
- Sub list on a starter's sheet omitted Johnson and Alexander-Walker as options for Wiggins (Q1 break, game 1). Possibly position/energy filtering with no explanation. Screenshot: players/06-gameday/sub1.png.
- Starters shown on Team page changed after I picked Heliocentric (Dort replaced Johnson in my starting five, per /team/tactics); Today still said "Set your rotation next". Possibly the assistant refit; I did not verify.
- Not a bug but a trap: a timeout called with nothing else to do leaves the game on the timeout screen until you tap Resume; a non-visible Resume on phones can strand you. Screenshot: v.png.
- page.errors: none seen in the sessions I read.

## Against the genre (FM / BBGM / MyNBA / Hoop Land)
Wins: live sideline coaching is deeper than anything in BBGM (no live coaching) and cleaner than 2K's coach mode; the explanation layer beats FM's match analysis for readability. Loses: FM has far more set-piece and individual-instruction depth, and less random-looking swings on bad nights. Hoop Land's pacing is easier to follow.

## Would I pay and keep playing
$7.99 phone unlock: yes, for the sideline alone. $14.99 Steam: probably, if the long-run season holds up. I would play 20-40 hours on game days. Recommend to a friend: 7/10.

## The one change that would most raise my score
Auto-pause (or a bell) when the opponent starts a run so a coach can call the timeout, and stop the staff recommending a defense its own break reports say is being beaten.

## 3D look (stills)
Phone (390x844) 3d_p_2.png: arena, benches, crowd, LED boards, sharp players, readable name tags; 3D "running slowly" banner appears in headless only. Desktop (1280x800) 3d_d_1.png and 3d_d_2.png: two-column layout with court left, coach panel right; broadcast wide shot and a shooting close-up with jersey numbers, good lighting and shadows. As stills, strong; only the phone view crowds players near the basket.
