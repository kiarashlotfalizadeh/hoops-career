# 04 — The Capologist and Trade Shark

## Who I am and what I played
Real 2026 league, Golden State Warlords (taxpayer, $223.3M payroll against a $201.0M tax line), **GM only** (staff coached). Three full seasons with full offseasons: 41-41 (lost the play-in), 42-40 (8th seed, lost round 1), 31-51 (Podziemski out 45 games, staff-led sell-off). No live games coached. Phone viewport 390x844, about 90 headless scripts, mostly in the Office.

## Play log
1. **Oct 2026, taxpayer inheritance.** The Cap sheet is clear: $220.1M payroll, tax line $201.0M, a bracketed tax bill, and a "How the cap works" sheet. I checked the tax by hand ($19.1M over, bracket rates 1.5/1.75/2.5/3.25x gives about $37.7M against the shown $37.9M). The rules text matches the numbers.
2. **Lopsided-trade hunt, wave 1.** A Jalen Johnson ask (88 OVR, 25) returned "Not even close" even with six firsts, two starters, and salary matched. NAW (81) cost Moody plus a 1st plus cash. AI GMs also keep the 125% + $0.3M matching rule on their own side ("They can't absorb that salary"), so you can't dump scrubs on capped teams.
3. **Dump probes.** Green (73 OVR, 36, $27.7M expiring) to a team with $33M of space cost a 2033 1st. Horford (75 OVR, 40, $6.8M thru 27-28) went for about $4.2M cash. Cash is capped ($8.3M per season, shown as "left of"), so cash can't buy stars.
4. **Pick laundering by archetype** (Gunslinger "shrugs at picks" vs Pick hoarder "treats firsts like family"). The archetypes affected offers, but I found no clean arbitrage because both sides need salary matching.
5. **Butler sale.** The Trading block ("Shop a player") showed 5 offers for the 88-OVR, 37-year-old, torn-ACL, expiring Butler. I took Siakam (83) plus McConnell plus a 2031 1st from IND for Butler plus three min guys (Niang, Payton II, Terry), with $2.9M cash. That solved the 17-to-15 roster cut. The game warned "By neutral value you'd give up more than you get". Honest.
6. **Mid-level trap.** Valančiūnas (76 OVR, 34) asked $3.65M. Signing him burned the **whole $14.0M mid-level** ("one signing a season"), and the $3.65M added $10.9M of tax. The sheet shows the tax hit but not "this uses your entire exception".
7. **Deadline, 29-26.** The staff's "Trade for NAW" action-queue card showed a package (Horford, Lendeborg, Williams and two 1sts). Confirming it returned "Atlanta has changed its mind." A staff-built deal the AI then refuses is a bug.
8. **Draft lottery.** I tried to buy the #1 pick (Ben Kennedy, 84 OVR, POT 94-99). HOU wanted far more than five firsts. The AI protects the generational pick. Not exploitable.
9. **Re-sign period (Summer 27).** Asks sit well below old contracts: Green 73 OVR at $2.54M (was $27.7M), Podziemski $17.35M x5, Melton $11.9M. A 4%-under offer lands; under 85% of the ask is a lowball (the ask even rises about $0.1M). Williams ("No Bird rights: up to $3.05M" against a $5.75M ask) couldn't be kept, which is the correct 120% rule. Re-signed players can't be traded until Dec 15 ("signed recently"), so sign-and-trade is closed.
10. **Waiting out free agency (the biggest finding).** I logged the 153-player market daily. Asks drop 30-45% in week 1 (Simons $12.0M to $7.8M, Powell 79 OVR $9.7M to $6.3M to $4.35M by day 29). The market drains: 80+ guys vanish in week 1, but 77-79 vets are still there at day 15-22 (DeRozan 79 at $2.6M, McCollum 78 at $2.8M on day 22, then gone). I signed Powell (79) on the mid-level on day 29 for $4.35M; his "market" value was $10.6M. In Summer 28 I got Paul George (79) with the mid-level at $3.45M on day 17, and DeRozan (74) plus Capela at the minimum on day 24.
11. **Cap-space summer 28** ($71.8M after declining McConnell's option). Day-1 stars are a **bidding system** ("He weighs offers and decides on day 2. Bidding: LAC... Your offer leads right now"), with a "What matters to him" panel (money, winning, market, playing time). I landed Ajay Mitchell (82/83, $26.2M) and Jaylon Tyson (80/84, $20.65M) on day 2, and Topić (80/84, $24.65M) on day 3. That was the most satisfying GM moment in the game.
12. **Cap-ballast tests, Summer 29.** Curry's expiring $60.2M plus 3 firsts for Booker (88): "By neutral value you'd give up more than you get." Giannis took Curry plus Podziemski plus a 1st. The AI doesn't treat expiring ballast as a free lunch.
13. **Year 3 collapse.** 16-30 with Podziemski out 45 games. The staff's "Sell to SAS" card sold Melton (78) for Poole (75), a 65 OVR and a 2nd, flagged "The deal could hurt." It was dull, but it was labelled.

## Scores
| Area | Score /10 | Why (one line) |
|---|---|---|
| A First hour | 7 | Preseason action queue, clear cap sheet and rules glossary. The trade screen is dense but self-explaining. |
| B Coaching depth | N/A | GM only. I touched only the staff's calls (rotation notes, test-sims). |
| C Game day | N/A | Played none; quick-simmed only. |
| D Front office | 8.5 | Best part of the game: honest verdicts, accurate CBA, bidding FA, "Make it work" counters. A few exploits (below). |
| E Rebuild & development | 6 | Drafted Moore (71/81) and Owens (74/82) at #13/#15. Growth and aging are visible (Curry 87 to 76 in two years). Thin sample. |
| F Analytics | 6 | The "neutral value", staff-rotation and tax-delta readouts are useful. I didn't dig into advanced stats. |
| G Sim honesty & realism | 6.5 | World moves (AI-AI deals, retirements, cheap FAs signed late). Contracts are inflated while asks are small, so aging stars on max deals are all negative-value (Curry, Siakam). |
| H Stakes & story | 7 | Owner letters, budgets that move at opening night, job offers, retirements and rafters give weight. |
| I UX & feel on phone | 7 | Sheets and two-tap confirms are good. Several controls have inconsistent aria labels and states (see Bugs). |
| J Overall for this audience | 7.5 | Best-in-genre CBA explanation on mobile. |

## What hooked me
1. **Every rule is explained and enforced.** Stepien ("GSW can't be left without a first-round pick in back-to-back drafts"), salary matching shown as "$29.8M limit, 125% of $23.7M sent + $0.3M", cap-room absorption ("its $60.0M of cap space + $0.3M"), and a trade lock on re-signs.
2. **"What would make this work?"** The AI's counter-offers, including cash, pick swaps and filler to match salary, make trading a conversation instead of guesswork. The deal-confirm sheet previews the staff's rotation change.
3. **Tax math is visible before you click.** "27-28 tax +$2.6M · $0.0M → $2.6M · crosses the tax line." Honest and instructive.
4. **Free agency has a texture.** Day-1 bidding, ask decay, AI teams grabbing bargains late, the mid-level as a real decision.
5. **Draft-day pick offers** ("Offers (24) for #13") and protection options on traded picks.

## What pushed me away
- **(Major) The FA-wait decay is an exploit.** Asks decay 30-45% in a week and a 78-79 OVR vet can be had near the minimum around day 17-24. You can build a roster from the leftover pool. AI teams do eventually sign them, so you must watch the calendar.
- **(Major) The mid-level is all-or-nothing.** One signing burns $14.0M-$15.8M even for a $3.65M deal, with no warning. Real MLE is divisible, and a taxpayer's MLE is smaller in the real CBA. Here a taxpayer gets the full MLE.
- **(Major) Staff-built trade cards can fail** ("Atlanta has changed its mind"). Sell-off suggestions ("Sell to SAS") return junk for a rotation starter.
- **(Minor) Re-sign asks vs contracts.** Curry's extension asks $10.3M against a $60.2M deal, Siakam asks $12.5M against $52.3M. So "value" collapses at renewal. It's consistent but makes old max deals untradeable (negative-value).
- **(Minor) No cap holds.** Re-sign precedes FA and unsigned guys walk, so the real Bird-rights-plus-cap-space trick can't happen. That's a deliberate simplification, but a CBA nerd will notice. It also stops cap-space plus Bird abuse, which is good.

## Rule audit, wrong or inconsistent
1. "Minimum deals are not guaranteed until opening night" is true only for some. Toohey ($2.19M): "no dead money." Bassey and Williams ($2.4M): "dead money $2.4M". The staff's cut list also listed Niang and Payton II at $2.4M dead money. A $2.4M deal is exactly the stated minimum, so the rule text and behaviour disagree.
2. The **salary floor** exists ("$41.0M under the salary floor. You pay it anyway at season's end.") but is absent from "How the cap works".
3. The mid-level for a taxpayer is the full amount (real CBA: smaller). The help text says "$14.0M for 4 years".
4. Mid-level shows "Used" while cap-space bids are pending, and returns once the bids resolve. Misleading label.
5. Team-option decisions on the Re-sign screen: I clicked Decline and Exercise. The screen's "Committed" number didn't change and the final confirm said "the staff will decline McConnell's". Unclear whether my choices registered.
6. One possible bug (unverified): a trade for Jokic with Lendeborg and Owens added reported a $60.3M absorption limit that had ignored the outgoing salary, while the Giannis variant didn't.

## Bugs
- "Atlanta has changed its mind." after Confirm on the staff's deadline card (Feb 11 Y1). No screenshot (toast text only).
- Trade builder resets on reload (state not persisted), so a half-built deal is lost on navigation.
- Team-option Decline/Exercise buttons are aria-labelled per player ("Decline Will Richard's option"), but the committed total didn't change. Screenshot: opts.png in my folder.

## Against the genre
- vs **Basketball GM**: this has real CBA depth (bidding, bracketed tax, cap-room absorption, trade locks) that BBGM doesn't, and the AI is much harder to rob.
- vs **NBA 2K MyGM**: far more honest and readable.
- vs **FM**: nothing like its contract-clause depth (no sell-on clauses, release clauses) but the cap model is more real than FM's wage budget.
- Loses on: little GM-only drama between games (inbox offers only); no multi-year cap planner; no cap holds.

## Would I pay and keep playing
$7.99 phone: yes. $14.99 Steam: maybe, if a full career has more GM tools (cap planner, contract clauses). I'd put in 30-60 hours for the offseason loop alone. Recommend to a friend: 7/10 (8 for cap nerds).

## The one change that would most raise my score
Fix the free-agency exploit and the mid-level: make leftover asks decay slower, and split the mid-level so a $3.65M signing leaves $10M+ of it. Then the front-office loop would be nearly flawless.
