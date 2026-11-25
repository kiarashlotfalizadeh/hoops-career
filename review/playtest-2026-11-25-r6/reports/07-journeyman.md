# 07 — The Career Journeyman
## Who I am and what I played
Real league, GM + Head Coach, job security on (default), 390x844 phone, headless. I started at Charlotte (East, 2026-27), then moved on through the game's job market: **CHA (1 season) → BKN (2) → BOS (3) → DET (5, fired in 2037) → OKC (took the job, did not play it)**. That is 11 full seasons (2026-27 to 2036-37), 5 playoff trips, 0 titles, 371-531. I drafted three times, re-signed players, won two big free-agent bidding wars, lost two, dumped salary and shopped stars. I coached one game live (BOS at LAC, 8x, then "Sim to final") and simmed everything else. A full regular season cost about 40-60 s of sim time. I ran `npm run season-test` and `npm run real-check` once each, read-only. About 5 hours of play time.

## Play log
1. **Oct 2026, CHA.** The owner wanted 39 wins, the play-in and 4,200 youth minutes. I released two players on a two-tap confirm and simmed. 42-40, 7th seed, lost 2-4 to BOS. Season grade +35. Season-1 league: OKC 67-15, Dončić 33.7 ppg, Jokić MVP, NYK champions.
2. **Jun 2027, first job offer.** "3 openings would hear you out". I asked BKN and took them. The offer text said "He would take over your old team", which was a nice touch. I left a team with Knueppel 85/93 and Miller 85/88 for a 21-61 team, and I knew the cost. **I then watched Charlotte win the 2029-30 title under my replacement, and Tolbert finish 297-113.** That stung and it was great drama.
3. **Jul 2027, FA bidding war.** Miller hit the market, so I dumped Randle (+$2.1M cash, "What would make this work?" built it for me) to clear $46M. The inbox then told me why I lost: "He rates CHA higher, for their record (.512 against our .256), so the same salary counts for about 7% more." That is the best explanation of a lost signing I've seen in this genre. I signed Barrett and Hart with the leftover space.
4. **2027-28, BKN 40-42.** The owner wanted 28 wins, so +60 and "Excellent". Summer development explained itself ("Staff priority added +0.5 to Dëmin... cost Clowney, Minott... about 0.3 each").
5. **2029-30, BOS.** I took the contender (46-36, Tatum 91). I went 49-33 twice with Tatum 88 and Boozer, lost round 1 and then round 2, and never got past the East.
6. **Jun 2030, Boozer (89/94, age 22).** I needed $52M of space and had $41M. My first dump partner was a taxpayer who sent salary back, which was my mistake, because the partner picker shows no cap space. I redid it with Miami's $75M of space. Boozer signed on day 3 ("no rival bids, he's yours"). He never won me anything. BOS lineups showed the starting five at −4.9 net while bench units ran +35, and I didn't fix it.
7. **Summer 2031 tank test.** I gave Tatum, Boozer and Barnes to MIA for next to nothing. The owner's goal reset to "win about 8 games" and the 25-57 team graded **+62, "He'll take a rebuild this season"**. You cannot get fired by tanking. Miami became a superteam.
8. **2032, DET (56-26, Cunningham 93).** The new job reset my protection ("can't fire you in your first 2 seasons"). I signed Jokić (36, 82) for the mid-level at $18.4M after a "Lead with $18.45M" hint. Then I benched every star in the rotation: 20-62, grade −100, job security 36. Duren and Cunningham demanded trades, and the owner's goal bar stayed at 47 ("the bar does not come down with the roster").
9. **2033-34.** The staff rebuilt my rotation after roster changes and the team went 44-38 with the stars playing. My sabotage silently expired. I was angry at the game, then impressed.
10. **2034-35 to 2036-37.** I re-benched the stars each time (25-57, then 20-62). By then Cunningham "asks $96M, Not keen". The tanked star holds a grudge, which I liked.
11. **2035 summer.** With $222M of cap space I signed Brown, Okorie and Duren in one FA day at about $70-80M each. I did it to raise the owner's goals, and it worked ("win about 33").
12. **Apr 2037, fired.** Two poor seasons in a row (−64, then −65/−35). "I said after the first that I would not take a second." The screen was "Between jobs", with OKC (18-64) and SAC offering, and "the league waits until you take one". Career rep fell to 40 (27th of 30 coaches). I took OKC, a $334M payroll with Nikolić 79/91 and Foster 86/91.
13. **Repo checks.** `season-test` shows league ppg 115.5, then 116.3, in its seasons 2 and 3. `real-check` gave 24 of 24 reputation anchors holding.

## Scores
| Area | Score /10 | Why (one line) |
|---|---|---|
| A First hour | 7 | Clear guide and fast, but the two-tap confirms and a forced "release 2" before anything else feel fussy. |
| B Coaching depth | 6 | Rotation, stint plan and lineup nets are real, but the assistant silently re-takes control and there is no opponent prep depth I could feel. |
| C Game day | 5 | Only one game coached; the win-probability readout and "shooting luck +14" report are great, but the 8x view had stacked coach-mark popups. |
| D Front office | 8 | Block, "What would make this work?", cap-space dumps, mid-level, bid explanations. The best part. |
| E Rebuild & development | 7 | Growth page and summer reports are honest; autodrafted rookies were mostly forgettable (Osman 74 on the board, 71 on arrival). |
| F Analytics | 7 | Lineup net/ORtg/DRtg, margin decomposition, staff reads. Useful and correct-looking. |
| G Sim honesty & long-run world | 7 | Plausible league (115-116 ppg, stable stars, dynasties rise and fall), but the same four scorers lead every year. |
| H Stakes & story | 9 | Job market, firing, owner arcs, "your old team" jobs and the grudge logic are what Football Manager does. |
| I UX on my phone | 6 | Dense and mostly readable; some confirm flows are inconsistent and a few numbers wrap. |
| J Overall | 7.5 | The career layer is excellent. The tactical layer asks for less effort than it rewards. |

## What hooked me
1. **The Miller loss message.** The inbox gave exact reasons and prices ("Winning him would have taken about $45.9M"). It turns a lost signing into a decision, not noise.
2. **My old team becoming a dynasty.** Charlotte won in 2029-30 after I left. A living league beats a static one.
3. **Block and "What would make this work?"** One tap showed 23 teams' best packages for Tatum, and another built a cap-space dump. This is better than BBGM's trade AI.
4. **Firing as a real arc.** The two-strikes rule is telegraphed on the owner page ("Next review needs −69 or better: about 22 wins"), and the firing happens in the offseason with a genuine job-market screen.
5. **Players remember how you treated them.** Benched stars asked for trades, Cunningham went from happy to "Not keen" and asked $10M over market.

## What pushed me away
1. **(Major) The owner's goal bar tracks the roster you open with.** After I gutted the BOS roster, the goal fell to 9 wins and the grade was +62. You can't tank into a firing. The "bar doesn't come down" rule only applies after a poor season, which you don't need to have. Getting fired took me 6 seasons of deliberate work.
2. **(Major) My rotation edits silently lapse.** Roster changes in the offseason reset it to "Let the assistant manage". I lost a whole sabotage season (44-38) without a warning, though the page text says "Your next edit takes over". A real coach would be bitten by this.
3. **(Major) The mid-level offers lose to the richest team.** Embiid went to OKC for $400K more and "Isaiah Stewart chose SAS" the same way. That is realistic, but when a player is "Very interested" and you offer max-of-your-space, you get no counter or second chance.
4. **(Minor) Trade partner picker shows no cap space.** I picked a taxpayer as a dump partner and got salary back. The picker lists only record and GM type.
5. **(Minor) "Go to the draft" closes the job window silently.** I skipped a Denver opening in 2028 because the button said nothing about it. The jobs window is only mentioned in an inbox message.

## Bugs
- **Staff-suggested signing is injured.** The "Sign Darnell Stone (SG · 71 OVR)" action-queue button signed a player who was out for 57 games, with no mention of it on the button. (2031 preseason, BOS.)
- **Career hero number wraps badly on a phone.** "371-" and "531" break across two lines on 390px (`career_final.png`).
- **Extend and Re-sign confirm inconsistently.** Re-sign needs "Confirm: sign him", while Extend signs on the first tap (my script thought extensions failed until I checked the contract list).
- **Play options sheet breaks after you're eliminated.** The Continue sheet's "Sim to end of playoffs" is a different element (`dg-done`) that the Play sheet click can't reach, so I had to click it from Today.
- **Sim stops loop on deliberate-bench seasons.** Each "Keep as set / He stays" stop interrupted the sim about 10 times a season. Not a bug, but it feels like a bug if you coach unconventionally.
- **Page text loses state on reload.** The trade builder resets when you navigate away or reload, which is fine, but "What would make this work → Accept" doesn't execute; you also need "Propose" and then "Make the trade". Three taps after the sheet felt like one too many.

## Against the genre
- **Versus Football Manager.** The job market, owner reviews and "your old team" hiring make this closer to FM than any basketball game I've played. FM's depth is in training, scouting staff and match plans, and this game thins out there. FM never silently resets your tactics.
- **Versus Basketball GM.** Better trade AI and FA explanations. BBGM's league history and records are as good; here they exist but feel less rich (there's a coaches page and a franchise page, but no all-time lists I could dig into). Neither game gave me a firing arc this good.
- **Versus MyNBA/MyGM.** More honest and more text, no animation spectacle. The long-run world is steadier than 2K's, which blows up under repeated sims.
- **Versus Hoop Land.** The front office and career layers are stronger; I can't compare the coaching layer.

## Would I pay and keep playing
Yes at $7.99 on a phone. At $14.99 on Steam I'd want more tactics reward and a tank-proof owner. I played 11 seasons in roughly 5 hours and I would play a second career with the lessons I learned. Recommend to a friend: **8/10** for GM and career fans, 6/10 for pure coaches.

## The one change that would most raise my score
Make owner goals independent of the roster you open with, or at least tie them to payroll and prior seasons, so a rebuild must be agreed with the owner and a quiet tank can't be graded +62. That would make the firing and job-hopping arc, which is already the best thing in the game, something you can't accidentally exploit.
