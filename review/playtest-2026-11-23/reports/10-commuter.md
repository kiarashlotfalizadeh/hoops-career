# 10 — The Phone Commuter, 28

## Who I am and what I played
- **Team and league:** Oklahoma City Twisters, real-roster league, GM + Head Coach, started 2026-27. My coach is "Playtest Coach".
- **Games played:**
  - Season 1: 82 regular-season games, then 16 playoff games. I won the title 4-0 over Boston.
  - Season 2 (2027-28): the first 23 games. The team was 8-14 when I stopped (see the injury problem below).
- **Live games coached:** 7.
  - OKC at SAS opener: full, with a halftime tactics change.
  - Cup Final vs BOS: halftime change, lost by 16.
  - vs TOR: finished with a sim to final.
  - Playoff R1 G1, R2 G1 and Conf Finals G1: each opened live, then skipped.
- **Device and sessions:** about 60 fresh `launch()` sessions, roughly 25 of them real "sittings" with a goal. 375x667 for most, 390x844 for about 6, one tablet (820x1180) and one desktop (1280x800).
- **Offline:** I used offline mode in 4 sessions, including a cold start. I also did one backup export and one import.
- **Time spent:** about 4 hours of wall clock. The game-time sessions themselves were short.

## Play log
- **Session 1, Oct 2026 preseason (first launch).** Creating a career took 3 s. Today shows the owner's goals on day one: "win about 66, conference finals, add nothing to payroll". A four-step first-games checklist sits on Today. About 5 taps to finish the checklist: rotation "Keep these five", playbook "Keep this playbook", plan, live game.
- **Sessions 2-4.** I did the checklist one item per sitting. Resume put me back on the right screen every time. The checklist only advanced because I tapped its buttons.
  - Rotation is readable at 375px: minutes, stamina, a target number and an OVR chip.
  - The playbook card says "Pace & Space · Blitz the Ball" with grades like A+ shot creation and F spacing.
  - The "Pick a playbook" guide step lives at the bottom of the Tactics page. I had to scroll a long way to find "Keep this playbook".
- **Session 5, offline after load.**
  - Offline plan editing, adding a counter and "Start regular season" all worked. The season start took 1.2 s.
  - Counters said "Staff still looking…" for the first ~5-10 s on the plan page. On the opener this made me tip off before the counters finished.
- **Session 6-14, first live game (Oct 20 at SAS).**
  - Launching the live game puts a "game is a broadcast: it plays sideways" card plus a 4-step coachmark tour over the half-sized court. It is a lot to cover a small screen.
  - I closed the app mid-live-game. Today then offers "Resume live game Q1 · Tied 0-0". Resume restarts from the last saved checkpoint, not where I closed. I closed at 11:25 Q1 and got Q1 12:00 back.
  - Skip ahead worked: End of Q1, Halftime, Clutch time (5:00 left in the 4th) and Sim to final. "Clutch time" took 1.3 s on a close game.
  - I won 119-107. The report said Tactics -8.5 pts, Shooting luck +14.4 pts. That split is a good analytics hook.
- **Session 15, close mid-sim.** I started "Sim 1 month" and closed at "Day 8 of 30". On reopen the date was back at Oct 22 with nothing corrupted. Atomic, but a full rollback.
- **Sessions 16-17, offline cold start.** With the network off before the page load, the app still loaded in 0.23 s and the service worker controlled the page. A month sim offline took 3.3 s and OKC went 12-3. "While you were away" opened with a player-of-the-week moment and "Tried Hedge in place of Blitz. No clear edge. Keeping Blitz."
- **Backup session.** Export gave `hoops-career-my-league-2027.json.gz` at 1.1 MB. Import worked: I simmed a week, imported, and was back at Nov 21. It said "Imported My League (imported)", so it seems to add a league rather than overwrite. Settings said "Last backup: never" right after my first export, but the Today card later correctly said "Nov 23, 2026". The Settings line seems stale.
- **Dec 8-10, trade offers.**
  - The 1-month sim stopped for the Cup Semifinal and for trade offers.
  - Offers used a one-tap "Accept" then a "Confirm: Accept" tap. I turned down SAC's Sabonis for Hartenstein + Caruso + a first (the card showed payroll after, tax +$6.9M, and minutes impact). I accepted PHX's Kennard for Wallace, since it moved spacing from C to B (21st to 13th) and saved tax. I liked this: a real decision in about 6 taps.
  - Two later offers (ATL for Alexander-Walker, MIA for Adebayo for three assets) repeated the same GM line, "We're rebuilding, and X doesn't fit our timeline". It felt templated by the fourth time.
- **Dec 11, Cup Final live.**
  - Yarbrough said Boston "beat the blitz with quick passes". At halftime (down 55-46) I switched ball-screen coverage to Switch, and I accidentally also set Help to Pack the Paint.
  - We lost 115-99. The report said Tactics -5.7 and Shooting luck -32.7. A 33-point luck swing in one game looked implausible to me, and the verdict also says "Lower Help defense, stay home on good shooters", the opposite of what I had set.
  - The halftime screen, with a shot chart and a "What's deciding it" list, is excellent on a phone.
- **Feb 6, trade deadline (OKC 44-9).** The Action queue showed "Deadline in 5 days · staff's call: stand pat" with a "Why" disclosure (Anthony Davis for Jalen Williams + Caruso, forecast barely moves). I stood pat with one tap. This is the best commuter UI in the game.
- **Regular season end.** "Sim to end of regular season" took 5.4 s and ended on Play-In day. OKC finished 64-18, 1st seed.
  - The owner then said "Job security 40 · Warm seat · Missed: win 65 games". The goal was "about 66" on day one. That is harsh for a 64-win team.
- **Playoffs.** The sim stops at each series start with "Plan the series / Leave it to the staff". I ran R1 G1 live and won 144-112. SGA got hurt in R2 G1 ("Skip stopped: Gilgeous-Alexander is hurt"). I swept the Finals. No big title moment appeared in my script, and the "While you were away" digest listed the Finals results and the title.
- **Draft.** I held pick #2 (via LAC). The lottery had "Reveal the order" and "Skip to the order". I took C Jabari Price (78/POT 86-88). He then showed up in the Growth tab at 83/POT 91.
  - The pick card flagged "Reach · ranked 4th".
  - The pick-confirm sheet is thumb-friendly.
  - "Auto-draft the rest" worked.
- **Re-sign and free agency.** Committed payroll was $258.7M and the tax bill $143M. Re-sign explained Bird and non-Bird caps in plain text: "Your non-Bird rights allow $7.25M". I exercised the 4 team options with 4 taps.
  - "Open free agency" asks you to confirm. "Advance 1 week" on the FA page works, but a sheet pops up after each advance and blocks the next tap.
  - I was over the cap and stood pat.
- **Season 2.** The owner's goal rose to "Win about 68 games". "Release 2 players" (17/15) was a one-tap confirm.
  - The staff's pick of Stirtz carried $10.1M dead money. Stirtz had also fallen -11 OVR at 24 in one summer.
  - A 1-month sim offline then stopped at Nov 13, 22 and 29, each time on an injury or trade-offer call.
  - OKC fell to 8-14 (10th West). Seven of 15 players were injured at once: two torn ACLs, a torn meniscus, a hamstring strain and others. Holmgren was out 21 games.

## Scores
| Area | Score /10 | Why (one line) |
|---|---|---|
| A First hour (hook + learnability) | 8 | Checklist, owner goals and glossary taught me fast. The sideways-broadcast card and 4-step tour crowd the first live game. |
| B Coaching depth (tactics, rotation, game plans) vs FM | 7 | Playbook, shape, roles, counters, matchups and special plans all exist and are readable. I used only a slice on a phone. |
| C Game day (live coaching: feel, and does it matter) | 7.5 | Skip ahead, halftime report and two-tap moves are brilliant for a commute. Resume rolls back to a checkpoint, and the 667px screen leaves one panel row visible. |
| D Front office (trades, free agency, draft, cap/CBA) | 8 | Trade cards show minutes, payroll, tax and give-ups. Re-sign explains Bird rights. Templated GM chatter and a sheet blocking FA "Advance" cost points. |
| E Rebuild & development (youth growth, draft, patience) | 7 | Growth tab and pick #2 to a +5 OVR rookie worked. Random -11 on a 24-year-old and heavy injuries hurt trust. |
| F Analytics (depth, usefulness, correctness) | 7 | "Tactics vs Shooting luck" and four factors are a hook. The -32.7 luck line and the advice-versus-my-setting mismatch looked off. |
| G Sim honesty & realism | 6 | 64-18, a Cup Final loss and a sweep felt plausible. 7 of 15 injured at once and OKC 44-9 then 20-9 are less so. |
| H Stakes & story | 6.5 | Owner goals, playoffs, awards and history are rich. The owner marking a 64-18 title team "Warm seat" felt arbitrary. |
| I UX & feel on my device | 8 | Offline and resume are rock solid, bottom sheets and confirm-taps suit one thumb. Tap targets are 36-42px and the court area is small. |
| J Overall for this audience | 8 | A Football-Manager-style GM sim that actually fits a 10-minute commute. |

## What hooked me (top 5, each with evidence)
1. **It is built for tunnels.** Cold start offline loaded in 0.23 s, and an offline month sim took 3.3 s. Closing mid-sim rolled back cleanly, and Today shows "Resume live game" after a mid-game close.
2. **The Action queue.** It turns the deadline, trade offers, injuries and series starts into one card with one or two buttons ("Stand pat" / "Trade for Anthony Davis", "Accept" / "Turn down"). Risky buttons ask for a second tap ("Confirm: Accept").
3. **Skip ahead plus the reports.** "Clutch time" took 1.3 s. The halftime sheet with a shot chart, FG%, threes, turnovers and "What's deciding it" gave me one real adjustment per game. The post-game "Tactics -8.5 pts / Shooting luck +14.4 pts" line is the best analytic hook I saw.
4. **The cap is taught in plain words.** "Your non-Bird rights allow $7.25M. He goes to free agency where cap space or your mid-level can still sign him." Trade cards show payroll after, tax change and the staff's rotation read ("spacing C to B, 21st to 13th").
5. **The draft is a good evening.** Lottery reveal, "Reach · ranked 4th" tags, a pick-offer sheet, a confirm sheet and a "Rookie watch" in Growth.

## What pushed me away (top 5, each marked dealbreaker / major / minor, with evidence)
1. **Injury load in season 2 (major).** Seven of 15 players injured at once at 8-14: two torn ACLs, a torn meniscus, Holmgren out 21 games. Each "Sim 1 month" then stopped after 7-9 days on an injury or trade-offer call, so a month cost me three taps.
2. **Resume loses live progress (major for commuters).** Closing at 11:25 of Q1 resumed at 12:00. I lost the last quarter of what I watched, and my Cup Final resume went back to Q1 11:31.
3. **Cramped live screen on 375x667 (major).** The half-court takes the top half, the staff note and "Watch Fox" sit under it, and the Players list shows about one row until you toggle "Smaller court". The first launch stacks the sideways-broadcast card and a 4-step tour on the court. On the tablet and desktop the live layout is good (full court, side panel on desktop).
4. **Owner stakes feel arbitrary (minor to major).** A 64-18 title team got "Job security 40 · Warm seat · Missed: win 65 games". The day-one goal said "about 66". In season 2 the goal went up to 68 for a team with seven injured.
5. **Small friction (minor each).** Counters say "Staff still looking…" for the first 5-10 s and restart after each add. GM offer chatter repeats ("doesn't fit our timeline"). The FA "Advance 1 week" sheet blocks the next tap. A "Last backup: never" line in Settings after an export. A fade-in at launch shows a blank hero for about 1 s.

## Bugs (repro steps, screenshot path)
- **Settings "Last backup: never" stale.** Export from Settings, League tab (`backup2.mjs`), then read Settings again. It still says never. Today later said "Nov 23, 2026". Shots: `players/10-commuter/shots/backup-league.png`.
- **Import adds a league.** Import after a sim: it said "Imported My League (imported)" and I was on the imported copy at Nov 21. Shot: `players/10-commuter/shots/restore-confirm.png`.
- **Halftime advice contradiction.** The Cup Final report said "Lower Help defense to stay home on good shooting teams" right after I had set "Pack the paint" at halftime. Shot: `players/10-commuter/shots/s29-changed.png`.
- **Shooting luck -32.7 in one game (Cup Final, 115-99 loss).** The same report said OKC "got the better looks: 55.4% eFG vs 53.4%". The numbers read as inconsistent. Shot: `players/10-commuter/shots/s29-final.png`.
- **Stirtz -11 OVR at age 24 in one summer** (72 to 61). Seen in the Growth tab. Shot: `players/10-commuter/shots/s60-growth.png`.
- **Draft card layout.** The big "#2" overlaps the "1st round · pick 2" header at 375px. Shot: `players/10-commuter/shots/s47-draft.png`.
- **Guide step buried.** "Pick a playbook" lands at the bottom of Tactics, below the full page. Shot: `players/10-commuter/shots/s03-playbook.png`.
- **No console or page errors** (`page.errors` was empty in every session).

## Against the genre (FM / BBGM / MyNBA / Hoop Land: where it wins and loses for me)
- **Wins vs Basketball GM:** much better handholding and storytelling (digest, moments, staff calls), a real live game with halftime coaching, and a better phone UI. It also teaches the CBA.
- **Wins vs FM:** the commute fit. FM mobile sessions are slower and need more taps; this one had a 1-2 s week sim and an Action queue.
- **Loses vs FM:** I never felt depth in training or scouting beyond the Growth tab. The Rotation, Tactics and Lineups tabs are good but I used only a slice.
- **Loses vs MyNBA:** no 3D feel on my headless phone run (the kit forced 2D, so I cannot judge it).
- **Loses vs BBGM:** none on sim speed. It ties.

## Would I pay and keep playing
- **$7.99 phone unlock:** yes, a clear yes. It is the first GM sim that fits a train ride, and offline works.
- **$14.99 Steam:** maybe. The desktop layout is the same phone UI in a column with a floating dock. The live-game desktop layout is good. I would want a wider Team and Trade screen first.
- **Hours:** about 40 to 60 on phone over a few weeks.
- **Recommend to a friend:** 8/10.

## The one change that would most raise my score
Make a mid-live-game close resume exactly where I left off (save every few possessions). On a train I get cut off all the time. Right now the best part of the game (live coaching) is also the part that punishes the commute most.
