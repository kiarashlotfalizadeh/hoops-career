# 04 — The Capologist and Trade Shark

## Who I am and what I played
- Team and role: Cleveland Lancers, real league, GM only (staff coached). Start payroll $207.2M against a $201.0M tax line, so a taxpayer on day one.
- Seasons: three full ones (2026-27 to 2028-29), each with its full offseason (draft, re-sign, free agency).
- Results: 53-29 and the 1st seed, then swept in round 1 with three stars hurt. Then 33-49. Then 39-43 and no play-in.
- Live games coached: 0. I simmed everything from Play options, because my game was the front office.
- Device: 390x844 phone, headless Chromium.
- Time: one very long sitting, over 100 short scripts. Screenshots are in `.../players/04-capologist/shots/`.

## Play log
1. **Oct 20, 2026, preseason.**
   - The cap sheet is excellent. It showed the $165.0M cap, the $201.0M tax line, the $9.2M tax bill ("over by $6.2M") and each future year's commitments.
   - "How the cap works" covered the CBA with no wiki needed: 125% plus $0.3M, one mid-level, Bird/Early Bird/non-Bird, and tax brackets of $6.1M at 1.5x/1.75x/2.5x/3.25x.
   - I felt clever within five minutes.
2. **Refusal tests.**
   - I tried to dump Watson (74 OVR, $20.5M through 29-30) on Atlanta for nothing.
     - Refused, and the reason was exact: "ATL takes in $20.5M against a $0.3M limit".
   - I tried to buy Jalen Johnson (86) with two negative-value players plus picks.
     - The AI said "They value Jalen Johnson far more than your side".
   - I tried to buy Giannis (then on Miami's block) with Harden + Watson, and with Mobley.
     - Refused: "Harden (37) is worth less to a rebuilder". For Mobley: "saves them $27M in tax, but they count only what dumping would cost them, about half a first".
   - Every refusal reason was honest and clear.
3. **Stepien rule.**
   - Every pick offer I made from my thin pick stash died on "CLE can't be left without a first-round pick in back-to-back drafts (2027 and 2028)".
   - I started with only four firsts (2028, 2030, 2032, 2033), so year 1 picks were effectively untradeable.
   - Later I hit "No team gives up more than 2 first-round picks in one deal". Both rules are real, but I only learned them by bouncing off the message.
4. **Cash dump (the shark move).**
   - Watson + Bryant + $8.1M cash went to Memphis, which had $33M of cap space.
   - That saved $9.2M of luxury tax plus $22.9M of payroll. The confirm sheet even showed my staff's rotation change.
   - I felt like a genius.
   - Prices I discovered later:

     | Player dumped | Contract | Price |
     |---|---|---|
     | Merrill | $9.8M | $0.3M cash |
     | Butler | $5.5M expiring | $1.9M cash |
     | Finney-Smith | $13.3M × 2 years | $7.5M cash + a 2nd |

   - Cash caps at about $8.4M a year. That limit is the real brake.
5. **Free-agent haggling.**
   - Lowball under 85% of the ask and he counters about 7% under his original ask. I got Powell at $6.35M against a $6.8M ask, Vukcevic at $7.95M against $8.45M, and Giannis's re-sign at $61.85M against $63.85M.
   - A second lowball locks talks until a date ("two lowballs were too many"). That is clean, fair design.
6. **Signed with the mid-level plus Bird rights.**
   - I stayed $4.0M under the tax, then collected a $20.9M share of the league's tax pot (revenue-sharing letter, Apr 12).
   - Owner grade: +21 for "stay under the tax". Staying under paid.
7. **Offers that came to me.**
   - OKC wanted Tyson for McCain. TOR wanted Mobley for Sabonis.
     - Sabonis was about equal value: the AI said "close, add a little more" for Mobley to Sabonis plus a 1st.
   - CHA offered Diabaté + Vanderbilt + a top-11 1st for Allen. I accepted it.
   - IND offered Siakam for Harden + Vanderbilt + my 1st. I declined.
   - The AI's offers target my young cheap players over and over (Vukcevic got asked for five times).
8. **Arbitrage.**
   - July 2027: Houston would give Giannis (90, 33, $62.8M expiring) for Mitchell (89, $60.9M through 30-31) and called it "They'd jump at it". I added a DAL 1st and sent Diop to stay under the tax.
   - June 2028: Curry (83, 39, $60.2M expiring, tagged negative value) for Harden (78, 38) was "jump at it: you're overpaying".
   - So the AI discounts age and contract length too hard, and an under-the-cap team can mine "negative value" stars for free.
9. **Draft.**
   - There is a draft-pick auction: "Offers for #8", each team's best package, with an Overpay/Fair/Below label.
   - Brooklyn paid Aday Mara (74) + a 1st + a 2nd for the #8 pick. Phoenix offered two firsts.
   - This was a great feature.
10. **Cap-space offseason, June 2028.**
    - Payroll dropped to $141.9M with $43.5M of space. I used it before re-signing, because trades are open in the re-sign phase.
    - I turned Harden into Curry and Diabaté into WAS's 2032 1st. I got LaVine (82) for Mara + a 2nd. Then I re-signed Giannis over the cap.
    - This is exactly the real-NBA trick, and the game allows it.
11. **I wrecked my own team.**
    - Age cliffs were brutal. Harden fell 89 to 78 at age 38. Vanderbilt fell 69 to 59 at age 29. Butler went 79 to 72, and Giannis 90 to 87.
    - Plus huge injuries (Giannis out 16, then 8, then 21 games).
    - My shark roster won 33, then 39 games. Owner season grade was -28.
12. **I accidentally took a terrible counter.**
    - I clicked "What would make this work?" on a tiny Thomas dump to Atlanta. The counter swapped my starter Tyson (75/77) plus Proctor and Thomas for Finney-Smith's bad contract. My script auto-confirmed it, which is my error.
    - But note the AI's counter is greedy, not minimal. It also asked for Vukcevic or a 1st to dump a $13M contract.
13. **Three-team trade.**
    - The UI is gorgeous: a destination chip per asset, and live answers from both teams.
    - But I could not construct one that satisfied matching, the 13-player in-season minimum, and the 15-player maximum. "Make it work" did nothing visible in three tries.

## Scores
| Area | Score /10 | Why (one line) |
|---|---|---|
| A First hour (hook + learnability) | 8 | Cap sheet and "How the cap works" teach the CBA in one screen; a shark feels clever in minutes. |
| B Coaching depth | N/A | GM only. Staff's "your need / minutes both ways" lines on every trade were a nice touch. |
| C Game day | N/A | No live games. |
| D Front office (trades, FA, draft, cap/CBA) | 8.5 | Best part of the game. Honest refusals, Block, draft auction, Bird flow and clean haggling; greedy counters and the Giannis/Curry mispricing hold it back. |
| E Rebuild & development | 6 | Draft auction and development reports are good; prospects swing a lot (Thomas lost 4 OVR and 6 POT in a year). |
| F Analytics | 6 | "Minutes a game: X to Y" per trade is great; "forecast barely moves" lines are vague. |
| G Sim honesty & realism | 6.5 | AI payrolls are believable (14 taxpayers to 6), Booker-to-Charlotte style 3-for-1s make sense; age cliffs are harsh and noisy. |
| H Stakes & story | 7 | Owner letters, grades per goal and coach job offers all land; the owner's goal changed each year, which kept it fresh. |
| I UX & feel on my device | 7 | Clean and fast, but the Make-offer counter is below the fold and quotes disagree with tiers. |
| J Overall for this audience | 7.5 | A cap-nerd's playground; make counters honest and fix age/rating volatility. |

## What hooked me (top 5)
1. **The AI tells me why it said no, in dollars.**
   - "Taking on $0.8M takes them to $17.0M over the tax line".
   - "Shedding $8.4M saves them $27.0M in luxury tax, but they count only what dumping would cost them, about half a first".
   - "CLE takes in $60.2M against a $43.4M limit, $4.4M sent + its $38.6M of cap space + $0.3M".
   - I could reverse-engineer the AI's valuations from the text alone.
2. **Cap space, Bird rights and trades interlock like the real thing.**
   - Under-the-cap teams can absorb salary in the re-sign window.
   - Recently signed players are locked until Dec 15 (a clear message).
   - Roster minimum 13 and maximum 15, Stepien and "max 2 firsts" are all enforced.
   - The game punishes sloppy sharking in believable ways.
3. **Block and the draft auction.**
   - Block shows every team's best package for a player, tagged Fair/Below/Lowball.
   - The draft auction gave me an Overpay on #8.
   - Both are things Basketball GM and 2K make you do by hand.
4. **Owner and tax-share feedback.**
   - I got $20.9M back from the tax pot for staying $4M under the line.
   - Going $15.9M over cost $16.7M, and the owner replied: "For a team that missed the postseason. That can't happen again."
5. **A living league.**
   - The news feed showed Charlotte sending Reid, White, Kalkbrenner and three 2nds to Phoenix for Booker (grades B/B).
   - Memphis used its cap space to absorb Adebayo.
   - Teams shed payroll from $226M to under $190M over a summer, then re-bloated.

## What pushed me away (top 5)
1. **Major — "What would make this work?" is greedy.**
   - It grabbed my 75/77 starter plus two prospects for a $13M dump, and asked for Vukcevic or a 1st to dump small deals.
   - The text said "you're overpaying" and still offered it. A shark can read it; a casual player will click it and get fleeced.
   - In 3-team, "Make it work" silently did nothing (no explanation).
2. **Major — Age and rating volatility wrecked the "smart" plan.**
   - Eleven-point drops in a year (Harden 89 to 78, Vanderbilt 69 to 59 at 29, Clarkson 71 to 62) turned every old-star arbitrage into a trap.
   - Realistic direction, harsh magnitude.
3. **Minor — Quotes and tiers disagree.**
   - "Close: add a little more" next to "Even I cannot make that one work".
   - "Not even close" next to "Close, but it is not even".
   - The flavour line looks random against the verdict.
4. **Minor — Free-agent offers have no feedback.**
   - Tapping "Make offer" on a lowball changes nothing visible. The counter is inline below the fold.
   - Tags are also confusing: a $4.8M player is tagged "Mid-level" and burns the whole mid-level slot.
5. **Minor — AI contracts and trades can look silly.**
   - GSW gave Podziemski $108.8M for a 75. BKN gave Lively $240.5M.
   - Dallas sent Flagg (86/93, age 21), Jerome, Bamba and a 1st to Indiana for Haliburton.
   - Staff advice: "buy Derrick White" meant sending Harden (89) for White (83) and "the forecast barely moves".

## Bugs (repro steps, screenshot path)
- **Counter asks too much.** Atlanta (over the cap), offer Thomas for nothing, tap "What would make this work?". The counter adds Tyson + Proctor for Finney-Smith. Screenshots `shots/white2.png` (the "can't find a version" toast) and `shots/fs.png`.
- **3-team "Make it work" is a silent no-op.** `shots/3t_f.png`, `shots/3t_g.png`.
- **Unexplained salary step.** Mitchell showed $50.1M in 26-27 and $60.9M in 27-28 (+21%) with no extension and no UI note, while Mobley went +7% and Harden +5%. `shots/mitchell.png`.
- **Count-up animation.** Payroll and tax numbers animate for about a second. A screen read mid-animation shows wrong totals (cosmetic).
- **Staff trade call contradicts itself.** "The staff's call: buy Derrick White… The deal should help" is Harden (89) for White (83). `shots/white_why.png`. Its text also names the owner's line as $201.0M while the owner's goal said $209.1M (different thresholds, same label).

## Against the genre
- **BBGM:** BBGM's trade AI is a value calculator, but it never tells you why. Hoops Career tells you in dollars and wins on clarity. Hoops Career's AI also makes more believable trades and handles the cap better. BBGM still wins on speed, and its trade-AI "what do you want for him" button is less greedy.
- **FM (Football Manager):** FM's contract and registration screens are wiki-level. Here the cap screens are simpler and just as meaningful. The staff's "need" read per trade is FM-like.
- **2K MyNBA:** 2K's AI trades are easy to exploit with Bird/hard-cap tricks. This game closes most of that with locks, Stepien and cash limits. It still lets sign-and-dump-style arbitrage through at a price.
- **Hoop Land / Draft Day Sports:** a deeper CBA than either, with the draft-pick auction as a standout.

## Would I pay and keep playing
- $7.99 phone unlock: yes, easily. For a cap nerd this is already the best mobile front-office game I know.
- $14.99 on Steam: yes if counters get honest and ratings volatility is tuned. Without that I'd want the price lower.
- Hours I'd put in: 40+.
- Recommend to a friend: 8/10, for cap-nerd friends. 6/10 for casual ones, who will get fleeced by the counter button.

## The one change that would most raise my score
Make "What would make this work?" return the smallest ask, ideally cash or a pick, never your best young starter. Show the AI's real price (say "they want a 1st, or $7M and a 2nd") before pre-filling anything.
