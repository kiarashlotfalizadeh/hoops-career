# 10 — The Phone Commuter
## Who I am and what I played
- Boston (real league, East), GM + Head Coach, one difficulty. 28, plays on the train in 10-15 minute bursts, one-handed, often offline.
- I ran about 20 short sessions (each a fresh `launch()` that closes). Most were 375x667. Two were 390x844, one 820x1180 tablet, one 1280x800 desktop.
- Played one full season (57-25, 2nd seed, won round 1 over PHI 4-2, lost round 2 to ORL 1-4), then the 2027 offseason (lottery, draft, re-sign, free agency day 1) and the 2027-28 preseason. About 105 games, 9 of them coached live.
- Edge tests: offline sim, cold start offline, hard reload offline, close mid-live-game, close mid-sim, close right after a draft pick, backup export, and import into a fresh profile.
- Rough time: about 2.5 hours of real play, which is about 18 train rides.

## Play log
1. **Oct 20, session 1 (12 min).** New career took 4 s. Action queue said "Release 2 players" (roster 17 of 15). That took 2 taps plus a Confirm. A "first games" checklist walked me through rotation, playbook, plan and live. I tapped "Keep these five", "Keep this playbook" and "No plan this time", then Start regular season. Every step was one tap. Very good for a commuter.
2. **Close mid-live-game.** I left at tip-off. Today showed a "Resume live game · Q1 · Tied 0-0" bar. Resuming later says "Picked up where you left off: Q1 7:37" and it was exact. I closed and resumed about 8 times in total and it never lost my place. This is the game's best commuter feature.
3. **Oct 20, session 2 (10 min).** I lost 124-133 to DET. I took a timeout during a 13-3 run and switched to Aggressive. "Skip ahead → Clutch time" took 5 s to reach 4:33 left, then "Sim to final". The report said tactics +3.4, shooting luck -10.2, and was honest that it was mostly luck. I felt informed, not cheated.
4. **Sim 1 week takes 1.6 s, Sim 1 month about 2.7 s.** The "While you were away" sheet recaps results, standings and the best moment. A 10-minute ride covers about 2 weeks of league time plus a decision or two.
5. **Offline (Oct 28 to Nov 4).** After `setOffline(true)` I simmed a week in 2.1 s and browsed Team, League and FA with no problem. A cold start offline took 224 ms. A hard reload offline also worked. The service worker holds up.
6. **Nov 19, 7-8.** The 1-month sim stopped at Nov 18 for an ATL trade offer, Carter + González for Wiggins (75). The offer card has an inline "Why", the staff's read ("in your favor"), and Accept / Confirm. It also opens a full card showing payroll and tax savings. It fixed my roster crunch (2 out, 1 in). It was a good 90-second decision.
7. **Backup export works** (`hoops-career-my-league-2027.json.gz`, 1 MB). Import into a fresh profile restored the exact day and the pending offer. But "Back up your league · Last backup: never" stayed on Today for the rest of the run. I exported once and it never marked itself done.
8. **Close mid-sim.** I started "Sim to end of regular season" and closed at "Day 5 of 135". On reopen the league was back at Nov 28, clean. No corruption, but nothing was saved partway. In a tunnel I'd lose that progress.
9. **Tablet (820x1180).** Sim to trade deadline took 6 s (Nov 28 to Feb 6, 35-17, 2nd in the East). Tactics gets a decent two-column layout. Today is just the phone column stretched, with a lot of dead space.
10. **Feb 6, deadline.** The staff's call was "buy Stephen Curry" (38 years old, $178M over 3 years) for Paul George plus two firsts and two seconds. The same card says "the forecast barely moves your postseason chances." I stood pat. That is a strange recommendation.
11. **Feb 7, live at PHI (390x844).** I was down 40-50 at the half. The halftime panel has a shot chart and "What's deciding it", and it flagged shooting luck. I accepted the staff's 2-3 zone in 1 tap. I won 105-100, and the report credited the zone +7.0. I felt clever.
12. **Sim to end of regular season** took 4.2 s: 57-25, 2nd seed. I started 7-8, so the stretch of 50-17 is a lot. Tatum came back and I think the sim runs a bit hot.
13. **Playoffs R1 vs PHI (7th).** G1 (skip to clutch, then final) lost 109-111. G2 was tied at 4:02. I switched to Ice (the P&R handler had 28 points on 28 trips) and lost 92-96. G5: the skip stopped because Queta was hurt, which is a good stop. I won, and then won G6 at PHI (George hurt in it).
14. **R2 vs ORL.** Tatum, George and Queta were all in and out with injuries. I lost 1-4. The injuries were realistic but heavy. Without the Needs-you stops I'd have missed a few.
15. **Offseason.**
    - The lottery has "Skip to the order".
    - The draft is "Take the staff's pick" in 1 tap, at #27.
    - The re-sign screen is very clear. Keep-everyone cost is $233.6M and the tax is about $41M.
    - Garza (72) asked $4.8M × 4 years but would add +$12.0M of tax. Henderson (76/82) on my mid-level would add +$46.1M of tax. Both were turned down. The game made me feel the tax; it is no free lunch.
16. **Bug:** I took the staff's draft pick and closed the browser about 1-2 s later. The pick was not saved, and I was back on the clock at #27. Waiting 2.5 s fixed it.
17. **Desktop (1280x800).** One narrow centred column. Everything works, but it is just the phone UI with margins.

## Scores
| Area | Score /10 | Why (one line) |
|---|---|---|
| A First hour (hook + learnability) | 8.5 | 4 s to create, a checklist where every step is one tap, and no wall of text. Opening roster over 15 is slightly fiddly. |
| B Coaching depth vs FM | 7 | Mentality, ball-screen coverage, zone, matchups and the "how to play him" read are real and explained. I only skimmed lineups and slots. |
| C Game day | 8 | Portrait court, Skip ahead menu (End of Q1, Halftime, Clutch, Sim to final) and Resume are made for commuters. Live decisions show up in the report. The tiny controls at the top are the weak spot. |
| D Front office | 7.5 | Offer cards with a "Why", honest tax numbers and day-3 FA bidding are clear. The staff's "buy Curry" call was weak and cap pricing is brutal. |
| E Rebuild & development | 5 | I played one offseason and a preseason. The summer growth mail looked fine (Cenac Jr. +2). Not enough to judge. |
| F Analytics | 7.5 | Tactics / luck / free throws split with an honest "they don't add up" note. Four factors and shot chart. Sometimes too much text on a 375px phone. |
| G Sim honesty & realism | 7 | The 7-8 to 57-25 swing felt too steep, and the injuries came in clusters. Shooting luck is called out honestly. |
| H Stakes & story | 7 | Owner goals up front, "While you were away" moments, and a job-security number. A playoff run with real stops. |
| I UX & feel on my device | 7.5 | Fast, offline-safe and thumb-friendly in the bottom half. Weak: Leave, sound, 3D and playback buttons at the top of the live screen are 32-36 px, and the save race. |
| J Overall for this audience | 8 | The best commuter management sim I have used, with caveats. |

## What hooked me (top 5)
1. **Resume is exact.** I closed mid-live-game about 8 times and "Picked up where you left off: Q1 7:37" put me back on the same possession each time.
2. **Skip ahead.** Clutch time in 5 s, and big sims in 1.4-6 s. A 10-minute ride has real content: a week or a month plus a decision.
3. **Offline.** Cold start offline in 224 ms, and sims offline. I never saw a network error.
4. **Every card explains itself.** The trade offer, the Why, the post-game "what decided it" and the re-sign tax maths all explain what changed and by how much.
5. **Needs-you stops.** The sim stopped for the Queta injury, the PHI series and the trade deadline instead of running past them.

## What pushed me away (top 5)
1. **Minor, save race.** A draft pick I made was lost when I closed within about 2 s. For a train commuter who gets cut off, this is the scariest bug. (Major if it hits a trade or a signing.)
2. **Minor, tap targets at the top of the live screen.** Leave 68x26, Game sound 32x32, Watch sideways 32x32, 3D 58x32, "Smaller court" 343x30. Those are small and in the hardest place to reach one-handed.
3. **Minor, tablet and desktop.** Today and Office are single phone columns with a lot of empty space. Tactics does use two columns on the tablet.
4. **Minor, backup nag never clears.** "Last backup: never" stayed after I exported. I'd think the export failed.
5. **Minor, the staff gave me a weak recommendation.** "Buy Curry" for George plus two firsts, with the card saying it barely moves the forecast. The tax cost (+$46M for a $14.8M signing) is steep, but at least it is shown honestly.

## Bugs (repro steps, screenshot path)
- **Draft pick not saved if you close ~1-2 s after it.** Repro: Draft screen, tap "Take the staff's pick", close the page immediately, reopen. You are back on the clock at #27. Waiting about 2.5 s saves it. No screenshot of the failure; the toast screenshot is `shots/s38-board.png`.
- **Backup banner never clears.** Export backup (works, 1 MB gz), go back to Today, and it still says "Last backup: never". Screenshot: `shots/s08-today.png`.
- **Committed payroll jumped.** On the re-sign screen it went from $219.4M to $227.5M after I opened and cancelled the Decline sheet. Probably the draft pick's contract landing late, but unexplained. Screenshots: `shots/s46.png`, `shots/s48.png`.
- **Timeout count.** After calling a timeout the count dropped again on resume (6 to 5 at the same clock). Unconfirmed, and I may have double-tapped. Screenshots: `shots/s02-timeout.png`, `shots/s02-players.png`.
- **"Needs you" pill with an empty queue** early on (Nov 4). It counted the guide or inbox, but the Action queue showed nothing. Screenshot: `shots/s05-cold.png` text.
- **"Watch & coach live" is only offered on game day**, not the day before. That is probably intended, but it surprised me.

## Against the genre (FM / BBGM / MyNBA / Hoop Land)
- **Versus FM:** Hoops Career has less depth, but it is far faster. A match day is a 5 s skip, not 20 minutes. The explanations ("why") are as good as FM's assistant manager reports. I had no staff morale or training layer, but I didn't miss it on a train.
- **Versus BBGM:** BBGM is also fast and offline, but its mobile layout is table-heavy. Hoops Career's cards, Resume and recaps are far friendlier on a phone. BBGM wins on raw sim speed (a whole season in 4 s here is comparable).
- **Versus MyNBA 2K:** nothing on my phone compares. 2K can't be played in a tunnel.
- **Versus Hoop Land:** this has far more explained decisions and a tactics layer. Not the same genre of speed.

## Would I pay and keep playing
- **$7.99 phone unlock:** yes, I'd pay without much thought. It is a commute game and it fits. I'd pay $9.99.
- **$14.99 on Steam:** maybe. On desktop it looks like a stretched phone app. I'd want a wider layout first.
- **Hours:** I'd put in about 40-60 hours across 3-4 seasons on the train, then stop if the sim ran as hot as my first season.
- **Recommend to a friend:** 8/10 for a commuter friend, 6.5/10 for a desktop FM fan.

## The one change that would most raise my score
Make every action save immediately, on tap and before the toast, and show a small "Saved" tick. Then a train going into a tunnel, or a quick lock-screen, can never cost me a pick, a signing or a trade. A close second is moving Leave, sound and the playback controls into thumb reach at 44 px.
