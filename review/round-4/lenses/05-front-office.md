# Front office review, round 4 (lens: `front-office`)

The harness blocked me from writing `REPORT.md` (subagents may not write report files), so the full report is below and nothing is in the scratch folder under that name.

All paths are under `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/1432d099-c3e8-46a9-bd36-274882ec0af2/scratchpad/review/front-office/`:

- `shots/*.png` are phone screenshots (390×844).
- `u*.mjs` are the Playwright drivers.
- `*.ts` are the headless probes; their output is in the `*.log` files.
- Kept saves: `snaps/ui_*.json` (my UI league at the lottery, on the clock, and at re-signing).

For disk space I deleted the profile folders and the large `snaps/25_42/*.json` files after the probes ran. Their logs are kept.

## 1. Verdict

Trading is still the best GM desk I know of on a phone, and it is honest:

- The AI is hard to fleece, and the offers it sends you are fair.
- Teams charge a premium for their cornerstone player, and the dock tells you why.
- Draft-night pick pricing, round 3's big leak, is fixed.

Free agency is still the weak part, but now it fails the other way. Round 3's market collapsed; this one freezes:

- Stars rated 83-90 sit unsigned into the season, sometimes for the whole season. Tyler Herro sat out two straight seasons, and Tatum and Trae Young were unsigned in one preseason.
- Bidding has a real bug: if you bid on a top free agent and lose, a rival can sign him for 35% of his value.
- The "Lead with $X" figure shown before you bid is not true.

Cap-space laundering still pays. Scouting still makes your staff nearly all-knowing with no effort from you.

**Score: 7/10** (round 3: 7.5). The trade and draft gains are real. But an 87 sitting at home all season, or a bid that hands a player to a rival cheaply, breaks the sense that the league is real, which the trade AI otherwise earns.

## 2. What's genuinely great (protect these)

- **The trade AI holds.**
  - Of 1,051 legal user deals tried in the preseason, the AI accepted 627. Only 8 gave me any neutral-value gain, the best +8.6 (`pt_pre.log`).
  - Cornerstones can't be bought: Jalen Johnson, Knueppel, Flagg, Cade and Wembanyama all came back "none (value)".
  - The AI's own offers to me came in at net −2.5 to 0.0 (n=5, `snaps/25_42/proposals.txt`). In the UI: "ORL want Simmons for Richardson + 1 pick · A little short" (`shots/d03-offers.png`).
- **Draft-night pricing is fixed.** Across all 60 picks, pick values on the clock summed to 635 and the players taken were worth 702 just after. 15 of 30 first-rounders were worth less than their pick (`probe-draft2.ts` on `ui_clock.json`).
- **Cap legibility on a phone is genre-best.**
  - One tap opens the cap sheet: cap, tax and both aprons on one bar, plus exceptions and three seasons ahead (`shots/l01-capsheet.png`).
  - FA sheets spell out the cost: "26-27 tax +$3.8M ($0.0M → $3.8M) · crosses the tax line" and the hard-cap note for the mid-level.
  - The FA screen now says "$19.1M under the salary floor: you pay it anyway at season's end" (`shots/j01-fa-day1.png`).
- **The FA sheet explains the player.** It shows what matters to him (winning 29%, market, role, money), who is bidding, and "No other team can pay his ask now: the most one could is about $13.7M" (`shots/k02-barrett-mid.png`).
- **The draft is a story.**
  - The lottery reveal: "You won the lottery · from 2nd in the odds".
  - Honest reads: Navarro read 78 · POT 89-93, revealed at 77/89, graded "Fair".
  - "Trade for #N" works (`shots/h04-trade-for-2.png`).
- **The re-sign desk** shows season lines, the ask against the old salary, Bird limits, holds and options in one scroll.
- **The league stays sound.** `league-invariants.ts 4 7 25 0` reported "No violations" over 4 seasons. The 72-79 summer floor holds: lowest 42%, none under 40%.

## 3. Findings

### 1. Stars sit unsigned for whole seasons (P1)

**Evidence** (`long4.ts`, 2 seeds × 4 seasons with the user passive):

- **Seed 42:**
  - Herro (86, then 85) was unsigned through all of 2027-28 and 2028-29.
  - Jerome (83) sat out 2027-28.
  - Bane (87/31) sat out 2029-30.
  - Preseason 2031 had Tatum (90/32), Trae Young (88/32) and Dybantsa (86/23) still unsigned at day 30.
- **Seed 7:**
  - Jerome sat out 2027-28.
  - Ajay Mitchell (84/26) sat out 2028-29.
- **Rate:** about 0.9 AI-originated 80+ players are still unsigned at each deadline (7 in 8 league-seasons, rising in later years). I excluded the user's own expiring players.
- **My UI league:**
  - 8 of 21 free agents rated 78+ were unsigned at day 30.
  - RJ Barrett (83/27) and Josh Hart (81) were still unsigned on day 120 of the next season (`fa-probe.ts`).

**Cause:**

- An 80+ player holds 55% of his value in season (`contracts.ts:458`, `SUMMER_FLOOR.hold`).
- His price never comes down below what `marketMoneyMap` thinks the AI teams' room can pay (`freeAgency.ts:554`). When no AI team has that room, nothing clears.

**Why it matters:**

- It breaks credibility: BBGM and MyNBA always clear their markets.
- It is also a mid-season scoop for any user with space: Bane for $28.4M, Herro for $22.4M.

**Fix (M):**

- From day 20, a held player takes the best one-year deal at or above the larger of the room exception and about 35% of his value.
- On the eve of the season, every 80+ player goes to the AI team with the most room, or to his old team on Bird rights.

### 2. Losing a bid hands the player to a rival below his floor (P1, bug)

**Evidence** (`bid-probe.ts`):

- Barrett asks $29.15M (market $26.3M). The sheet says "never under $14.9M".
- With no bid, he stays unsigned.
- If I bid at the minimum allowed ($26.25M), on day 3 he signs with TOR for $9.30M: 35% of market.

**Cause:** `decideBid` (`freeAgency.ts:~1262`) signs the best rival offer without applying `summerFloor`. The user's bid is what triggers it.

**Why it matters:** the invariants script can't catch this, because its user never bids.

**Fix (S):** sign the rival only at or above the player's floor, and add a user-bid case to the invariants.

### 3. "Lead with $X" before a bid isn't true (P1, numbers rule)

**Evidence:**

- Barrett's sheet said "TOR's offer is ahead. Lead with $33.85M".
- I bid his ask, $29.15M, in the UI and won: "RJ Barrett chose us over TOR" (`shots/n02-inbox.png`). The figure overstated the need by $4.7M+ a season.
- Waiting would have cost $16.5M from day 5.
- For Ty Jerome the figure was $18.1M, while the game refuses any bid under $45.45M.

**Cause:** `bidStanding` reads today's rival offer, isn't clamped to `bidFloor`, and ignores how rival offers drift by decision day ($11.85M became $9.30M).

**Fix (S):**

- Clamp it to `bidFloor`.
- Label it as the staff's read.
- When no AI team can pay his ask, say "his price falls from day 5".

### 4. Cap-space laundering still pays (P2, round-3 #6 still open)

**Evidence** (Memphis, the only team with room; `launder2nc.log`, `chain_mem.log`):

- **Single flips (no cash), +4 to +14 each:**
  - Ingram (82, worth 23) for Post + Cole Anthony (worth 5.3), resold for 19.2.
  - Herbert Jones for a 2nd, resold to DET for Robinson + a 1st.
  - Camara for nothing.
- **A 6-step greedy chain:** total assets 558.8 → 588.4 (+29.6, about two and a half mid firsts), payroll +$46M.

**Fix (S):** apply the user relief cap to the AI's side in `makeItWork(best)`, and make tax teams shed their worst contract first.

### 5. The #1 pick has one buyer, at 60% (P2)

**Evidence:**

- Draft night showed "Offers (1)" for the #1: OKC, Ajay Mitchell + 2032 1st, "60% of its value" (`shots/h02-offers-for-1.png`).
- Headless, `packageFor` across 29 teams found only that package for a pick worth 83.8.
- The same pick plus Sabonis buys Brunson, Booker or LaMelo outright, so the value is there.
- Round 3 saw 28 offers for a #12.

**Cause:** the user is over the cap and sends no salary. `findPackage` never adds a user salary filler and tries only 5 variants (`tradePackages.ts:73`).

**Fix (M):** add user fillers, explain "add salary to take players back", and try more variants for big assets.

### 6. Draft-day "Trade for #N" moves two firsts in one tap, with no verdict (P2)

**Evidence:**

- For #2 (worth 38.5) the sheet asked 2028 1st + 2030 1st + #33 + #48, worth 52.6: a 37% overpay.
- The green Accept calls `makeTrade` directly (`PickTradeSheet.tsx:20`), with no confirm and no neutral value.
- The builder confirms every deal that moves a first.

**Fix (S):** route it through `ConfirmSheet` and show the neutral split.

### 7. Scouting is still all-knowing for free (P2, round-3 #4 still open)

**Evidence** (`probe-scout.ts`):

- Staff error is 0.60 MAE, against 2.03 for the best AI team.
- Truth score of the player chosen across 14 slots (best possible 77.70):
  - Consensus: 72.13
  - Passive automatic scouting: 76.22
  - Budget 0 but 175 days on everyone: 77.35

So the budget barely matters, and the automatic list does almost all the work.

**Fix (M):** cap precision near the best AI's, shrink the automatic list, and tie precision to a scouting budget or points.

### 8. Your offer sheets are always matched (P2)

**Evidence:**

- All 4 restricted free agents rated 72+ were matched at 1.0×, 1.15×, 1.3× and 1.5× their ask. Podziemski was matched at $30M (167% of market) by a GSW team already in the tax.
- Yet without a sheet, GSW let him sit 11 days and re-signed him at 66% of market (`rfa-probe.ts`, `fa-probe`).

**Cause:** `aiMatchVerdict` (`rfa.ts:310`) ignores tax, apron cost and the overpay.

**Fix (S):** weigh the sheet's tax and apron cost and its burden at the team's lens.

### 9. "What would make this work?" builds silent overpays (P2, partly open)

**Evidence:**

- For Avdija it built Acuff + three firsts + $5M cash.
- The dock said a green "They'd take it". Only the confirm sheet showed "you send 104 · you get 83": 24% over, just under the 25% warning (`trades.ts:1351`; `shots/m02-avdija-dock.png`, `shots/m03-confirm.png`).

**Fix (S):** warn from about 12%, and show the neutral split in the dock itself.

### 10. The dock doesn't say what a deal does to your team (P2, round-3 #10 still open)

There is still no strength or wins line in `Dock.tsx` or `ConfirmSheet.tsx`. **Fix (M):** add a staff-read net/wins line from `worth.ts`.

### 11. AI teams past the second apron (P2, partly open)

- Invariants: 4 teams past it at the 2028 opening, then 2, then 0.
- Rebuilding POR showed "over · 2nd apron · payroll $239.3M with holds".

### 12. The trading block shows negative percentages (P3)

LaVine's offers read "−72% of his value" and "−226% of his value" (`TradingBlock.tsx:108`, `shots/e02-block-lavine.png`). **Fix:** describe them as "you'd take on $X of bad money", or hide them.

### 13. Truncated names in trade rows (P3, still open)

"A. Wiggi…", "H. …" (squeezed by an "Out over a season" badge), "Jera…", "Mitchell R…" (`shots/a03-trade.png`, `shots/e02-block-lavine.png`).

### 14. In-season 79s at the minimum (P3)

VanVleet, Powell and Nurkić (all 79) signed for $2.5M in season. The 72-79 floor applies only in the summer.

### 15. Picks gain value from preseason to draft night (P3)

League-wide first-round value rose 398 → 463 (+16%) between the preseason and draft night. Lottery picks rose 20-90% (CHI 18.4 → 27.3). It is a mild "buy in the fall" arbitrage (`pickdrift.ts`).

### 16. AI trade volume fades (P3)

Invariants counted 37, 25, 31, then 19 AI trades a season. The README claims about 40 (32-46).

### 17. Leftovers (P3)

- "Trade for #N" still blames value when value isn't the blocker (it now does name salary correctly).
- The AI never protects its picks.
- The trade confirm has no injury warning.
- The mock shows "SAC Navarro 100%" for your own pick.

## 4. Since round 3

| #   | Round-3 finding               | Status                          | Evidence                                                                                                             |
| --- | ----------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | FA collapse                   | Fixed, then overcorrected       | The floor holds (lowest 57%), but stars now freeze (#1), and a bid bypasses the floor (#2)                           |
| 2   | 72-79 at the minimum          | Fixed in summer, open in season | Lowest 42% in summer; in-season 79s at $2.5M (#14)                                                                   |
| 3   | Picks on the clock overpriced | Fixed                           | 635 vs 702                                                                                                           |
| 4   | Scouting all-knowing          | Still open                      | #7                                                                                                                   |
| 5   | Staff read off the scale      | Looks fixed                     | 78/89-93 read vs 77/89 true                                                                                          |
| 6   | Laundering                    | Still open                      | #4                                                                                                                   |
| 7   | Salary floor invisible        | Fixed                           | FA screen line                                                                                                       |
| 8   | FA prediction wrong           | Partly                          | Floor figure is right; "Lead with" is wrong (#3)                                                                     |
| 9   | AI past the 2nd apron         | Partly                          | #11                                                                                                                  |
| 10  | Dock lacks team impact        | Still open                      | #10                                                                                                                  |
| 11  | Staff cuts pay dead money     | Not re-tested                   | —                                                                                                                    |
| 12  | Polish                        | Partly                          | Mock now exists before the draft; salary blocker now named; truncation, AI protections and injury warning still open |

New since round 3: #2, #3, #5, #6, #8 and #12.

## 5. What it would take to reach 9/10

1. **Make free agency clear like a real market.** Every 80+ player signed by opening night on one-year fallback deals, `decideBid` fixed to respect the floor, and a true lead figure. This alone is roughly the difference between a 7 and an 8.5.
2. **Close laundering.** Cap relief counts only the overpaid part in the AI's sells to users, and tax teams shed bad money first.
3. **Give big assets a market.** User fillers in packages, confirm and neutral value on draft-day deals, and RFA matching that weighs cost.
4. **Make scouting a decision**, with a budget or points.
5. **Show team impact in the dock** as a staff-read line.

## 6. What I couldn't verify, and how I tested

**UI** (Playwright, phone, port 5191, my own profile): one full real-league Sacramento season.

- **Office:** cap sheet, trade builder, a cornerstone ask, the Avdija make-it-work, deadline Offers, Find and Block.
- **Draft:** lottery (won #1), board, prospect sheet, mock, Offers for #1, Trade for #2, the pick and its reveal.
- **Re-sign desk and free agency:** day-1 market, the Barrett and Herro sheets, a winning bid on Barrett.
- **Sim speed:** a full season took about 25 s in the UI.

**Headless:**

- A seed-42 SAC season (34 s).
- `league-invariants` 4 seasons, no violations (2:18 under shared load).
- The probes:
  - Trades: `probe-trades`, `launder2`/`launder2nc`/`chain`, `pick1`.
  - Draft: `probe-draft2`, `probe-scout`, `pickdrift`.
  - FA and RFA: `fa-probe`, `bid-probe`, `rfa-probe`.
  - Multi-season: `long4` (2 seeds × 4 seasons).

**Not verified:**

- More than one season in the UI.
- Extension talks in the UI.
- Buyouts and waivers.
- Staff-cut dead money.
- Casual and hard difficulty.
- The fictional league.
- God mode.
- Tablet layout.
- How often stars freeze when the user does re-sign his own players (`long4` re-signed nobody, so I excluded the user's own expiring players from the rate).
