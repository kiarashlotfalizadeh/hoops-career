# 10 — The Phone Commuter, 28
## Who I am and what I played
Real 2026 league, East, Boston Shamrocks, GM + Head Coach. About 1.3 seasons (82 games plus a failed playoff run, a full offseason, then 16 games of 2027-28). I coached 1 game live in a close-and-reopen pattern and quick-simmed the rest. Device: 390x844 phone, touch. Also checked 820x1180 and 1280x800. I forced airplane mode (`ctx.setOffline(true)`) for almost every session after load. About 30 short scripts, each a "train ride". Roughly 90 minutes of wall-clock time, nearly all of it waiting on my own scripts.

## Play log
1. **Create (Oct 2026):** New career took 9 s. Today opens with owner goals (51 wins, win a round, payroll under $225.6M). The queue says "Release 2 players" and nothing else is allowed until then. Two taps: "Release 2 - staff's picks", then a red "Confirm" that warns of $2.4M dead money. Clear and fast. Start season is disabled with the reason printed.
2. **Offline from the start:** After load I went offline. Reload offline worked, sims worked, trades, draft, and re-signs all worked. No network errors anywhere. The PWA is genuinely offline.
3. **Live game, close mid-game (Oct 20 @ DET):** I closed the browser at 7-8 in Q1. Reopen: Today shows "Resume live game, Q1 tied 0-0" (stale label), but resuming put me at 9:12 and 7-10. Saves happen about every few seconds, not every possession. Closing again at a quarter break and again at 100-101 in Q4 both resumed exactly (25-24, 100-101). I lost about 15 seconds of play, no corruption. Skip ahead menu: End of Q2, Clutch time (5:00 left in Q4), Sim to final. I used Clutch time and got a tight 102-105 Q4 with a proper clutch badge, then a timeout sheet (iso Tatum / hammer Pritchard). Lost 113-114.
4. **Post-game analysis:** "How the margin adds up: looks +9.4, shooting luck -7.4, free throws -3 = -1" plus ranked "what decided it". It told me I lost to luck and not to panic. This is the best "why" feature I saw and works great in a 2-minute session.
5. **Close mid-sim:** I started "Sim 1 month" (bar: "Day 1 of 30, Stop") and killed the browser 350 ms in. Reopen: clean, still Oct 21, game 2, nothing half-applied. Sim is atomic. Good, but the whole month is lost, not resumed.
6. **Month sims in bursts:** 1 month took 5-10 s each. Oct 21 to Nov 20: 7-8. By Dec 20: 15-13. Jan 19: 22-20, then Feb 6: 30-22 (6th East). Each stop opened a "While you were away" bottom sheet: moment of the stretch, record in the stretch (8-2), "Needs you" cards with one-tap Accept / Turn down. This is exactly the commuter loop. One screen, one thumb.
7. **Deadline:** The staff proposed "Buy Josh Hart" with a "Why" drawer. I sim'd past it by picking a bigger sim, and the sim stopped on deadline day with the same card in the Play sheet. Good: the game protected me from missing it. I chose to stand pat. Finished 49-33, 5th seed, play-in skipped.
8. **Playoffs:** "Sim to end of playoffs" is one tap. Lost 1-4 to DET in round 1 (told in a moment: "Detroit takes 3-1 lead"). Job security 43, warm seat. It never made me coach any playoff game; that was my choice but the game didn't push me either.
9. **Offseason on a phone:** Draft: "on the clock" sheet "Take the staff's pick" (pick 22). Re-sign page is a proper phone design: payroll bar with cap and tax markers ($222.7M committed, tax line $213.1M, "Keep everyone $233.1M, tax ~ $39.5M"). Negotiate sheet has slider, years, options, "Make offer 4 yrs $21.2M". I re-signed Garza and Carter, then bid on Julian Reese (77/81) with the mid-level. "He decides on day 2. Bidding: NYK, MIN, +23." I lost him, silently (just saw the roster not fill).
10. **Season 2 (2027-28):** Sim 1 month took 9 s: 11-5, 1st East at Nov 20. A "Back up your league" card appears on Today with Export/Not now. I took it.
11. **Backup export/import, offline:** Export gave `hoops-career-my-league-2027.json.gz` (743 KB) and "Last backup" updated. Import: file picker, then "Restore this backup? ... Restore over it / Keep both". I chose Keep both: 2.6 s, opens the old league as "My League (imported)", and the Start screen lists both. Well designed. The "Last backup" date shows the real-world date (Nov 25, 2026) next to a game season, mildly confusing.
12. **Tablet/desktop:** Tablet (820) is the phone layout stretched: big empty Today, content hugging the left, bottom bar left-aligned and not full width. Desktop (1280) gets a real two-column Tactics page. No horizontal overflow, no console or page errors in any session (`page.errors` was empty throughout).

## Scores
| Area | Score /10 | Why (one line) |
|---|---|---|
| A First hour | 8 | 9 s to a team, clear first-week guide, one-thing-at-a-time queue, disabled Play says why |
| B Coaching depth | 6 | Only touched playbook/tactics page; looks rich (shape, grades, bench roles), but I didn't tune it |
| C Game day | 7 | Skip-ahead menu and exact resume are great for phones; sideways-court prompt covers the upright court |
| D Front office | 7 | Re-sign and FA sheets are excellent on phone; lost a bid with no feedback I could find |
| E Rebuild & development | 5 | Only one offseason; "Summer development: Pritchard +2" mail was nice |
| F Analytics | 8 | Margin decomposition (looks vs luck vs FT) is useful and honest |
| G Sim honesty | 7 | 49-33 for a decent roster, a 4-1 playoff loss, no obvious rubber-band; small sample |
| H Stakes & story | 7 | Moments ("51 points", "From 18 down"), owner goals, job security 43 warm seat |
| I UX on my device | 8 | Bottom Play bar, bottom sheets, big targets; tablet layout is lazy |
| J Overall for this audience | 8 | Best commuter loop I've seen in a sim; resume-ability is the standout |

## What hooked me
1. **"While you were away" sheet** after every sim: moment, record in stretch, then "Needs you" with Accept/Turn down. One thumb, 20 seconds per month.
2. **Session safety**: live game resumes to the second (25-24, 100-101); a killed sim leaves a clean state; offline reload works.
3. **Post-game "how the margin adds up"** with luck vs looks. Rare in the genre.
4. **Backup UX**: export with a nudge card, import offers "Restore over it / Keep both" and works offline in 2.6 s.
5. **Deadline protection**: a big sim stops on deadline day and the Play sheet itself holds the trade card.

## What pushed me away
1. **Stale resume label (minor):** Today said "Resume live game, Q1 tied 0-0" when the saved game was ~7-10. Lowers trust until you resume.
2. **Sideways prompt over the upright court (minor/major on phone):** "The game is a broadcast: it plays sideways" card sits on the court, stacked with a coach tip card, and reappeared on my first two live opens. Court action is hidden until dismissed. I never found it asking again after "Keep upright" but I only checked once.
3. **Tablet layout (minor):** 820 px is a stretched phone page, left-aligned content, empty lower half, bottom Play bar not full width.
4. **FA bid outcome is silent (minor):** Reese bid "decides on day 2"; I only inferred the loss from the roster count. A message would help.
5. **Killed sims are lost, not resumed (minor):** a month sim closed at day 1 restarts from zero. Fine at 5-10 s, but not ideal if a season sim is 40 s on a real phone.

## Bugs
- Resume card on Today shows score at the start of the quarter/game ("Q1 tied 0-0") instead of the saved score. Repro: Watch & coach live, play to 7-8, close browser, reopen Today. Screenshot: `players/10-commuter/06-resume.png`. Resumed game itself is correct.
- "Last backup: Nov 25, 2026, in 2026-27" mixes a real date and a game season. Minor.
- In the live game's bottom nav, my generic role-based click on the "Players/Tactics/Stats" tabs timed out (`11-players.png` shows the timeout sheet only). Could be a harness naming issue, not confirmed; those tabs were visible and tappable in screenshots.

## Against the genre
- vs **Basketball GM**: BBGM is the offline king, but its UI isn't one-thumb. Hoops Career wins on phone UX, "why it happened" analysis, and the away-sheet loop. BBGM wins on sheer depth of league tools and speed for multi-season sims.
- vs **FM**: FM Mobile's inbox-and-tap loop is the benchmark; this matches it for session shape. FM wins on tactical depth that I could see; I only tested the surface here.
- vs **2K MyGM**: no network, no microtransactions, honest sims. I'd take this on a train every time.

## Would I pay and keep playing
Yes to $7.99 on a phone; it feels built for exactly my life. $14.99 on Steam only if the desktop layout gets more than a two-column Tactics page (I only saw Tactics and Today there). I'd put 40-80 hours in. Recommend to a friend: 8/10.

## The one change that would most raise my score
Make the live-game resume truly seamless and the broadcast overlay dismissible once and for all: show the saved score on the Today resume card, and remember "Keep upright" so the first live open of every session isn't a stack of cards covering the court.
