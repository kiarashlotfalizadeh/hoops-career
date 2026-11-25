# 10 — The Phone Commuter

## Who I am and what I played
Philadelphia Founders (real league, East), GM + Head Coach, one 2026-27 season plus the start of the 2027 offseason (stopped at the Re-sign screen, not 1.5 seasons). About 45 separate launches. The distinct "sessions" were:
1. create career and release 3 players
2. rotation, playbook, plan
3. first live game
4. resume the live game
5. finish the live game
6. offline week sim
7. cold start offline at 390x844
8. backup export and import
9. a month of sims
10. trade offers
11. tablet at 820x1180
12. deadline and Find
13. close mid-sim
14. end of season
15. playoffs, with a live Game 6
16. desktop at 1280x800
17. draft
18. re-sign

Most were at 375x667. I coached 2 live games in full (one at 4x) and skipped ahead through 2 more, all in the 2D court. Final record 50-32, 5th seed. I beat TOR in 7 and was swept by CLE (61-21) in round 2. About 3 hours of wall time. Real play time per session was far shorter than a commute, because the screenshots and my scripts were the slow part.

## Play log
- **Oct 18, preseason, about 3 min.** Today shows a "Needs you: Release 3" card with a staff-picks button (Release 3 · staff's picks). Release is a two-tap confirm and the dead money ($3.4M) is stated. The owner goal moved from 44 to 45 wins after I released, which is fine. A 4-step first-games guide (rotation, playbook, plan, live game) took 6 taps, and every step had a "keep the staff's" button. Best onboarding I have seen on a phone sim. I felt hooked and understood it.
- **Oct 20, game 1 live at NYK.** The live screen is dense but readable at 375. A broadcast "Watch sideways / Keep upright" prompt comes up. A coach-tip overlay covers the scorebug. Q1 ended 31-31. Win chance moves with the game (53%, then 22% down 4 late).
- **Close mid-live, 3 times.** Resume Live is on the Continue bar and shows "Picked up where you left off: end of Q1." Resume is exact, to the game clock.
- **Skip ahead menu (at a quarter break).** End of Q2, Clutch time (5:00 left in Q4, 4.3 s) and Sim to final. Great for a commuter. But Skip ahead only exists at breaks. Once in a clutch stretch there is no skip, so I had to sit through 2.3 minutes at 2x for the last 5 minutes.
- **Last-possession call (down 2, 23.8 s).** A real decision: Iso Edgecombe, Post split Embiid, or no call, with a board diagram. Lost 120-124. The report was excellent: Tactics −1.8, Shooting luck −7.8, free throws +5, "decided by offensive rebounds PHI 15, NYK 5".
- **Oct 21 to 28, offline.** `setOffline(true)` after load: Sim 1 week took 1.5 s with no errors. Cold start offline also worked: the PWA loaded the save and every tab. 0-4 start.
- **Backup.** Export gives a 845 KB .json.gz in 1 tap. Import, then "Restore over it / Keep both", rolled me from Nov 4 (3-5) back to Oct 28 (0-4) correctly.
- **Nov 27, Sim 1 month took 3.2 s** and stopped at game 20 for a trade offer: GSW wanted Simons (77, $6M) for Horford (75, 40-year-old) plus a 2030 1st. "Why" gave a one-line staff verdict ("fair value"). I turned it down.
- **Jan 13, 19-21.** Brown out 61 games (Achilles). WAS offered Ball (75) for Jones (64) plus three 2nds. Accepted with a two-tap confirm. Then 22-7 down the stretch to 50-32.
- **Deadline, 5 days out.** A staff card: "buy a player better than your fifth best (83)". Find opens a 111-player list with a filter. I tried Giannis, flagged "Asked for a trade". The builder's answer: MIA values him at about 13 first-round picks and my side at 2. Not feasible, but I learned that in 3 taps. The verdict banner covers about 40% of a 667px screen.
- **Close mid-sim.** I closed 0.6 s after starting "Sim to end of regular season". On reopen the date was Feb 7 (one day on), the record unchanged, and no corruption. The sim did not auto-resume, and I had to tap again.
- **Playoffs.** Game 7 gets a gate sheet (Coach it live / Not yet / Sim it) every time you try to sim past it. My script sat there for several tries, but a human sees it. Beat TOR in 7, and in Game 6 TOR had 3 turnovers to my 17. Then CLE swept me with Maxey hurt.
- **Offseason.** The lottery was skipped by "Go to the draft". "Take the staff's pick" and "Auto-draft the rest" took 3 taps for the whole draft. Re-sign screen: James (83, age 42), Simons, Ball and Caldwell-Pope all walk. The text says "No Bird rights: up to $4.7M" for players I acquired mid-season. Negotiate just says "No offer can re-sign him". Rules explained, but a dead end.

## Scores
| Area | Score /10 | Why |
|---|---|---|
| A First hour | 8.5 | Guide checklist plus staff buttons; you are playing in about 3 minutes |
| B Coaching depth | 7 | Mentality/coverage/zone and last-possession plays exist; I only sampled them live |
| C Game day | 7.5 | Resume exact, skip menu, subs in one tap, last-possession calls. Long clutch at 2x with no skip |
| D Front office | 7.5 | Offers with a staff verdict, "What would make this work?", Find, 3-team tab. Re-sign rules opaque |
| E Rebuild & development | N/A | Played a contender season; only the draft auto-picked |
| F Analytics | 8 | Game reports with luck/looks/free-throw splits are the best part |
| G Sim honesty | 6.5 | Scores run high (151-152 OT, 136-129) and TOR had 3 turnovers once. Month sims never felt rigged |
| H Stakes & story | 7 | Owner goals, Game 7 gate, "moment of the stretch" |
| I UX on my device | 7.5 | Fast and reliable, but tablet and desktop are only a stretched phone column; a floating button overlaps text |
| J Overall | 7.7 | Best commute sim I have used. It respects short sessions |

## What hooked me (top 5)
1. **Resume is flawless.** Closed mid-live 3 times and always returned to the same clock with a toast. The 10-minute session never lost progress.
2. **Fully offline.** Cold start offline, sims, trades and backup all worked (s17/s18/s19).
3. **Speed.** Week 1.5 s, month 3.2 s, deadline 4.5 s, rest of the regular season 5.6 s, a whole playoff round about 3 s.
4. **Every decision has a staff default.** Release, rotation, playbook, draft and subs are one tap. I could play 90 seconds or 10 minutes.
5. **Game reports explain why**, with Four-factors splits, "shooting luck −7.8 pts" and an honest "These overlap" note.

## What pushed me away (top 5)
1. **Tablet/desktop (major for those users, minor for me).** Same single column at 820 and 1280, with huge empty areas and the Continue bar floating (s25, s48).
2. **Floating "scroll-up" circle button covers numbers and text on phones (minor).** It sits over the Rotation OVR column, the trade payroll line and the Draft header (s02, s23, s49).
3. **Long live clutch with no skip (minor-major).** Skip ahead only appears at breaks. The 4x/Keep-the-speed prompts plus tour tips interrupt (s11, s15).
4. **Re-sign "No Bird rights" mid-season-acquired players, plus a Negotiate dead end (major to confusion).** Four rotation players leave, and the screen offers no way to fix it (s52/s53).
5. **Truncation on small phone (minor).** "Anfernee Sim…", "2030 1st · proj…", and the top bar "Preseason · …".

## Bugs
- **Kit/gate quirk.** "Coach it live" at the Game 7 gate goes to the matchup preview (extra tap), then Watch & coach opens the game. Not a bug, but a scripted second tap at the gate was needed.
- **Close mid-big-sim (s31/s32).** The sim stops after 1 day and does not resume. No data loss. Minor.
- **Rotation page after the live game (s16 report).** "Hurt tonight: Simons, out 12 games" and later a 9-game injury both surfaced in the sim with no stop (stops only for the player count flagged). Unclear; no repro.
- **Realism.** A team with 3 turnovers in a playoff game (s40) and 17 for me, twice, same game. Probably an outlier; flagging it.
- No page errors were logged in any session (`page.errors` empty).

## Against the genre
- **Vs Basketball GM:** much better on a phone (BBGM's tables are painful), and it explains outcomes.
- **Vs FM:** FM Mobile is slower and heavier. Here you get depth in the live game with no commute penalty.
- **Vs MyNBA:** this wins on sims-per-minute and offline.
- **Loses to all three** on tablet and desktop layout.

## Would I pay and keep playing
$7.99 on phone: yes. $14.99 on Steam: no, because the desktop layout is a stretched phone. I would put 40-60 hours into it on the train. Recommend to a friend: 8/10.

## The one change that would most raise my score
Add a "Skip to the end" in the clutch stretch of a live game (it only exists at quarter breaks), and fix the Re-sign dead end for Bird rights. Together they would remove the two moments where I felt stuck.
