# 10 — The Phone Commuter, 28
## Who I am and what I played
Boston Shamrocks (real 2026 rosters, East), GM + Head Coach, phone viewport 390x844 (touch). I played about 1.8 seasons in roughly 45 short sittings (open, do one thing, close). Season 1 was 55-27 and the title. Season 2 was 48-34, a playoff series win over Cleveland, then a 2-4 loss to Detroit in the conference finals. I coached 2 live games (the opener, and playoff R1 G1) and skipped to the final in both. I also opened a third live game just to look at it. I looked briefly at a tablet (820x1180) and a desktop (1280x800). About 25 minutes of real game time. `page.errors` was empty the whole run.

## Play log
- **Oct 20 2026, create:** the career took about 10 s. Today opens on a clear "Release 2 players (17 signed, 15 allowed)" action with the staff's picks and the dead money named. It's a two-tap confirm. First meaningful action took under 30 s.
- **Offline test:** I set `ctx.setOffline(true)` and reloaded. The app loaded, Team and Play options worked, and later I simmed 3 months offline (17 s) with no problem. Export backup and Import backup both work offline too. This is the strongest thing for my persona.
- **Close mid-sim:** I started "Sim 1 month", closed the browser at 0.5 s and again at 1.8 s ("Day 8 of 30"), then reopened. Both times the calendar was exactly where it was before, 0 games played, with no "your sim was interrupted" message. That's safe (nothing corrupts), but silent. I had to notice for myself that nothing happened.
- **Close mid-live-game (Oct 20):** I tapped Leave at Q1 10:20 and the Today bar became "Resume live game · Q1 BOS up 6-0". I killed the browser, reopened, and Resume brought up a toast: "Picked up where you left off: Q1 4:13". It restored the quarter and clock, but the score was reconstructed, and it was a few possessions later than where I left (the score I saw went from 6-0 to 19-20 before I looked). Resume works. It just doesn't resume to the exact frame.
- **Skip ahead menu (live):** End of Q1, Halftime, Clutch time, Sim to final. I picked Clutch time at Q1 3:33, and the game jumped straight to the final in 6 s (117-128 loss). The menu does say "a decided game goes on to the final", but a first-timer picks "Clutch time" and loses the whole game. The game report said Tactics +3.6 and shooting luck +14.7 yet I lost by 11 ("looks −21.7"), which was confusing on a phone with no room for the explanation.
- **While you were away (Nov 26 2026):** after "Sim 1 month" a full-screen digest opened: 9-5 stretch, East 6th to 5th, power rankings 15th to 10th, the staff's test-sim result, and the moment of the stretch. This is exactly what a commuter wants. It does not reopen after a reload, but it stays on Today as a card.
- **Trade offer (Nov 27):** "WAS want Cenac Jr. for Champagnie". A "Why" chip says "Staff: fair value". Two taps to decide. I turned it down.
- **Trade deadline (Feb 11 2027):** the staff called "buy Stephen Curry (87)": I send George (82), Walsh (71) and a 1st, Golden State sends Curry. One-tap plus a confirm. I accepted. After it we went 23-4 and finished 55-27 (2nd seed). The Curry deal was cheap, and I felt clever. In season 2 the same card said "buy Anthony Davis (85)" and cost Curry (81), Simons (78), two 1sts and two 2nds, still labeled "The deal should help." I stood pat. That call reads like a bad deal for a 2-for-1, and the staff's wording doesn't warn me.
- **Title (Apr 2027):** the Champions moment reads: "win the title, 4-2 over San Antonio... Series won · 4-2 over Charlotte." Two different opponents in one card, with no label for which round each line is. It's confusing.
- **Offseason:** the draft pick came as one "Take the staff's pick" button. Re-signing was a clear page (cap $174.9M, tax $213.1M, committed $216.7M, "keep everyone $227.2M, tax ≈ $24.0M"). Garza and Carter were re-signed with a two-tap flow. Free agency showed Simons (77) asking $7.85M with a "market $13.1M" label. The sheet showed "27-28 tax +$15.8M · $12.0M → $27.8M" before I confirmed. That's honest cost info on a phone.
- **Backup (preseason 2027-28):** the Today queue asked "Back up your league. Last backup: Nov 25 2026. It lives only on this device." I exported a 1.1 MB `.json.gz` (the earlier one was 744 KB). On import it offers "Restore over it" or "Keep both". I chose Keep both (offline). It took about 4 s, and a second league "My League (imported)" became the active one. A bad file gives a clear toast: "That file is not a Hoops Career backup."
- **Season 2 (2027-28):** losing five straight into the deadline, then 17-10 after. Sim to end of regular season took 11 s. The playoffs took about 8 s for the whole run.

## Scores
| Area | Score /10 | Why (one line) |
|---|---|---|
| A First hour (hook + learnability) | 8 | Clear first action, first-games checklist, and a title in season 1 felt great. |
| B Coaching depth (tactics, rotation, game plans) vs FM | 6 | Good tactics and rotation screens, but I mostly let the assistant manage (to keep sessions short). |
| C Game day (live coaching: feel, and does it matter) | 6 | Court on top, controls at the bottom, resume works. Clutch skip jumping to the final is a trap. |
| D Front office (trades, free agency, draft, cap/CBA) | 8 | One-tap staff trades with plain costs, a clear re-sign page, honest tax numbers. |
| E Rebuild & development (youth growth, draft, patience) | 6 | Growth tab is clean (Cenac "7 to go to a ceiling of 78"), but I did not rebuild. |
| F Analytics (depth, usefulness, correctness) | 6 | "Looks / luck / free throws" margin split is smart, but the numbers confused me once. |
| G Sim honesty & realism (stats, outcomes, no rubber-banding, long-run world) | 7 | 55-27 and 48-34, a 2-4 conference finals loss, a streak of 5 L. Plausible. A title in year one was a bit easy. |
| H Stakes & story (owner, job, playoffs, history, moments) | 7 | Owner verdicts, "While you were away", moments. One mixed-up Champions card. |
| I UX & feel on my device | 8 | Great offline and resume story, strong thumb reach. Some floating UI collides. |
| J Overall for this audience | 7.5 | Best mobile-GM resume story I've played. |

## What hooked me (top 5, each with evidence)
1. **Offline and resume are real.** Reload offline, sim 3 months offline, and export and import offline all worked. "Resume live game · Q1 BOS up 6-0" sits right on the Continue bar.
2. **"While you were away".** One full-screen digest after any long sim (9-5, East 6th to 5th, power rankings 15th to 10th, a headline moment). It fits a 10-minute train ride.
3. **The staff's one-tap decisions with a "Why".** "Trade for Stephen Curry" and "Take the staff's pick" each took two taps, and the confirm text spells out what leaves and arrives. I won a title off the Curry call.
4. **The backup nag and the restore sheet.** "Back up your league. It lives only on this device." plus "Restore over it / Keep both" is exactly the safety net a one-device player needs.
5. **Honest money.** The offer sheet shows "27-28 tax +$15.8M · $12.0M → $27.8M" and the offer slider says "Widen the slider past $7.05M". I always knew the cost before I tapped.

## What pushed me away (top 5, each marked dealbreaker / major / minor, with evidence)
1. **Closing mid-sim discards the sim silently (minor to major).** "Sim 1 month" at "Day 8 of 30", then reopen: date unchanged, no notice. A commuter hitting the tunnel does this daily. A toast "Your last sim didn't finish, tap to redo" would fix it.
2. **"Clutch time" skip is a footgun (major for the live game).** Chosen at Q1 3:33 of a 22-20 game, it went straight to a final 117-128 in about 6 s. The sheet says "a decided game goes on to the final", but the label promises something else.
3. **Floating UI covers content (minor).** The Continue bar sits over the confirm warning text ("Tap Confirm to go ahead. You send Paul George (82)...") on Today, so I had to scroll to read what I was giving up. The "Advance 1 day / 1 week" buttons float over the free-agent list. A round up-arrow button also floats over the Team court and the bottom nav.
4. **Tablet and desktop are a stretched phone (minor).** At 820 wide the Today screen is a left-aligned column with a big empty area. At 1280 the layout is a centred phone-width column with a floating dock that cuts off the bottom row of the roster table.
5. **The staff's deadline advice isn't weighed (major for trust).** "Buy Anthony Davis. The deal should help." for Curry (81), Simons (78), two 1sts and two 2nds. Same wording as the great Curry deal. A phone user just taps the primary button.

## Bugs (repro steps, screenshot path)
- **Champions card mixes opponents.** Win the title (2026-27, BOS). The card says "4-2 over San Antonio" and also "Series won · 4-2 over Charlotte" with no round labels. Same on season 2's card: "4-3 over Cleveland. Then out in the conference finals, 2-4 to Detroit" followed by "Series won · 4-2 over Atlanta." (text only, no screenshot).
- **Owner payroll line changed after a restore.** The original 2027-28 preseason said "Keep the payroll under $235.1M". The imported (Keep both) copy of the same backup said "$234.4M". I didn't dig into why. Screenshots: `/tmp/claude-0/-home-user-hoops-career/ab24f4d7-2083-5558-9c59-0f226efc62e3/scratchpad/playtest/players/10-commuter/qq-preseason.png`, `.../vp-tab-today.png`.
- **Resume replays a few possessions.** Leave at Q1 10:20 (BOS up 6-0). Reopening and Resume told me "Picked up where you left off: Q1 4:13" with a different score (19-20). The saved state was ahead of the Leave score, so I'm not sure what I lost. Screenshot: `.../n-state.png`.
- **Play options sheet blocks the Skip ahead button in the live game (script-only).** A stuck dialog backdrop blocked my click once after Resume while the game was paused by a stoppage. I couldn't repro it by hand. Not confirmed as a player-facing bug.
- **Backup filename uses the next calendar year.** `hoops-career-my-league-2027.json.gz` was exported on Nov 25 2026 in the 2026-27 season; the 2027-28 one was named `...-2028`. Cosmetic.

## Against the genre (FM / BBGM / MyNBA / Hoop Land: where it wins and loses for me)
- **Wins vs BBGM:** the phone experience. BBGM is a fine offline web game, but it has no staff voice, no "while you were away", and no one-tap deadline calls. Hoops Career tells me why things happen.
- **Wins vs MyNBA:** real offline play and fast sims (a full regular season in about 11-17 s; MyNBA takes minutes).
- **Wins vs FM:** the Today screen as an inbox of decisions is a lot like FM's, but shorter and easier on a phone.
- **Loses vs FM:** depth. I never needed to touch a team talk, opposition instruction or set piece. The auto assistant was good enough to win a title, so the depth stayed optional.
- **Loses vs Hoop Land / Draft Day Sports:** none that I saw, but I didn't use their live-game feel to compare.

## Would I pay and keep playing
- **$7.99 phone unlock: yes.** The resume and offline loop alone is worth it.
- **$14.99 on Steam: not yet.** The desktop layout is a stretched phone page with the dock in the way.
- **Hours I'd put in:** about 40 over two months, on the train. The first season took me under 2 hours of real play to finish with a title.
- **Recommend to a friend: 8/10.**

## The one change that would most raise my score
Make closing the app mid-sim feel safe and visible: auto-save at the day boundary, and on reopen show "Your last sim stopped at Oct 28. Continue?" with a tap to finish. Right now the work vanishes silently, and for someone who closes the app twice a ride that is the biggest gap in an otherwise excellent commuter loop.
