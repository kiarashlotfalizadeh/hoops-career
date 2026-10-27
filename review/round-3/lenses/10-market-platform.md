# Hoops Career, round 3: market and platform review (`market-platform`)

**How I tested.** All scripts, logs and screenshots are in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/market-platform/`. Screenshots are in its `shots/` folder.

- **The build.** I served the existing `dist/` read-only, gzipped, on port 4893.
  - `dist/` was built at 17:28. HEAD (295684b) was committed at 17:38 and only touches the README, so `dist/` is HEAD.
  - The public Pages site serves the same chunks, for example `history-C4SqZUCr.js`.
- **The load.** The machine's load average was 21 to 59 on 14 cores while other reviewers ran. Every timing is wall-clock under that load, on an Apple M4 Pro.
- **The repo** is untouched (`git status` is clean). My server is stopped.

## 1. Verdict

The platform still runs as well as a shipped product:

- The start screen appears in 0.26 s.
- A whole regular season sims in about 14 s on this machine.
- It works fully offline, including starting a real-roster league.
- Backups are gzipped to 1.5 MB, and an import never overwrites the league you have.
- The Android and iOS shells are close to submittable.

The market side has not moved in this round, and the competition moved toward it:

- NBA 2K27 Arcade Edition (5 Nov) and FM27 Touch (10 Nov) both arrive on Apple Arcade within two weeks.
- Basketball GM made its sim engine twice as fast in September.
- AI-built GM sims are flooding the stores.

Meanwhile the product leans harder on unlicensed NBA identity:

- The new seeded past covers every Finals since 1947, every MVP and players' real honours.
- The Today card reads "No title since 2003-04".
- None of this has a store-safe path: the real seed and history download and precache even for a fictional league.

Sims are also about 30-45% slower per month than in round 2. That is still fine on this Mac, but borderline on a mid-range phone.

**Score: 6/10, unchanged.** Platform is about 8.5 (sims slower, nothing else regressed). Market, legal and store readiness are about 3.5: the product is stronger, but the blocker is the same.

## 2. What's genuinely great (protect these)

**Cold load** (`load.mjs`):

| Network                  | Start screen                           | Data                        | Then                                                                 |
| ------------------------ | -------------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| Unthrottled              | 264 ms (first contentful paint 192 ms) | 615 KB to the start screen  | Seed ready 0.28 s after tapping New league; league created in 0.29 s |
| 1.6 Mbps, 150 ms, 4× CPU | 3.55 s                                 | 1.31 MB in all, 32 requests | Seed 3.7 s; league created 0.7 s                                     |

**Sim speed** (`sims.mjs`, `seasons.log`, 390×844 mobile):

| Step                                   | Time              |
| -------------------------------------- | ----------------- |
| Day                                    | 0.34–0.49 s       |
| Week                                   | 0.52–1.25 s       |
| Month                                  | 2.0–2.4 s         |
| Rest of the regular season after 5 Dec | 9.6 s over 3 legs |
| Whole offseason, each step             | 0.3–1.3 s         |

**Offline** (`platform.log`, `offline2.mjs`):

- The service worker precaches 149 entries, including `seed-*.js` and `history-*.js`.
- An offline reload took 320 ms, and Sim 1 week offline took 1.24 s.
- Tactics, Live, History, Trade and Settings all render offline.
- New league offline shows "Real 2026-27 NBA · 544 real players" (`offline-newleague-8s.png`).
- Zero network requests after load.

**Backups and multiple saves** (`backup.mjs`):

- Mid-season-1 export took 0.52 s and produced `hoops-career-my-league-2027.json.gz` at 1.49 MB (7.2 MB of JSON).
- Import took 3.2 s and becomes "My League (imported)" beside the original.
- A "Back up your league · Last backup: never" item appears in Needs you by late December.

**Save growth is under control** (IndexedDB, `seasons.log`):

| Point           | League record | Snapshot | IndexedDB total |
| --------------- | ------------- | -------- | --------------- |
| Creation        | 3.22 MB       | –        | 2.6 MB          |
| End of season 1 | –             | –        | 7.7 MB          |
| Season 2 start  | 4.27 MB       | 5.55 MB  | 10.7 MB         |
| Season 3 start  | 4.88 MB       | –        | 16.4 MB         |
| Season 4 start  | 5.56 MB       | 6.67 MB  | 16.3 MB         |

Results are pruned at each rollover (1,231 → 89 games). The README's figures hold.

**Privacy as a feature.** No account, no analytics, no requests after load. `ios/App/App/PrivacyInfo.xcprivacy` declares nothing collected.

**Native shell basics:**

- Android: `targetSdkVersion = 36` (`android/variables.gradle`), a signed AAB workflow, and a release build that refuses to run without the key.
- iOS: light style, `ITSAppUsesNonExemptEncryption=false`, iPhone locked to portrait, all orientations on iPad, and a 1024 px icon.

**Ratings are original work.** The OVR target is impact, production and minutes (`scripts/data/reputation.ts:29`), with no 2K ratings copied. That is defensible, and a story worth telling.

## 3. Findings

### 1. The identity is unlicensed NBA IP, the new seeded past deepens it, and there is still no store-safe build — P0 for stores, P1 for the web

**What the player sees:**

- The start screen says "GM and head coach of a real NBA roster" (`start-with-league.png`).
- The Today card reads "No title since 2003-04" (`load-fast-today.png`).
- The live ticker shows an "NBA" chip (`src/ui/live/ScoreTicker.tsx:63`), and the Cup final court is painted "NBA Cup" (`Live.tsx:250`).
- "NBA Finals" and "All-NBA" appear in the moments, the final slab and the awards (`FinalSlab.tsx:36`, `league/shared.tsx:173,289`).
- Sponsor arena names come from `src/core/teams.ts` ('State Farm Arena', 'TD Garden'…).

**What is new since round 2:**

- `src/data/history.json` adds every Finals since 1947 (with era names like "Minneapolis Lakers"), 71 MVPs and real honours for 143 players.
- The fictional league is still "Real franchises, generated players". I created one and got the Boston Celtics, 76ers, Bucks and so on (`fict-step1.png`, `fict-team.png`, `fict-league.png`).
- `src/data/seedLoader.ts:10` always imports `seed.json` and `history.json` together, and the service worker precaches both. A fictional-only player still downloads 544 real players and the NBA's past.
- God mode can rename teams (`src/ui/god/TeamEditor.tsx`), but only by hand, one team at a time.

**Why it matters:**

- Team nicknames and "NBA Cup/Finals" are NBA marks, arena names are sponsor marks, and player names in groups need the players' union's group licence.
- Apple guideline 5.2.1 rejections for unlicensed league content are routine.

**Recommendation (L):**

- Make a store build flag that removes `seed.json` and `history.json` from the bundle.
- Default it to invented city/nickname/abbreviation/colour sets and generic arenas, with "Cup", "Finals" and "All-League" and no NBA chip.
- Bring real rosters in only as a user-imported league file (see Finding 9), or keep them on the web with a visible disclaimer.

### 2. The public repo and Pages site now also publish the real NBA past — P0 (live, flagged only because it is new content)

- The repo is still public with no licence: GitHub API `"visibility": "public"`, `"license": null`, pushed 2026-10-26T21:41Z. The `data-raw` branch is still listed.
- Pages returns 200 and its `sw.js` precaches `history-C4SqZUCr.js`, the same hash as `dist/`. Today's careers-back-to-2003-04 seed and the 1947+ history went public with this round.
- **Recommendation (S):** the same as round 2 (private repo, delete `data-raw`, Pages off or fictional-only). Do it before the next push.

### 3. Data provenance is still unrecorded, and the new history adds a Sports Reference dependency — P1

**Evidence:**

- The two "game files" in `data/raw/games/` (`PlayerStatisticsExtended.csv` 455 MB, `PlayByPlay.parquet` 935 MB) have no stated source or licence in the README, `scripts/data/games/sources.ts` or the app. They drive the ratings, the impact estimate, every career line and the Finals since 1996-97.
- `scripts/data/history-apply.ts:10-14` reads the honours from Basketball Reference's Awards columns.
- Sports Reference's [data use page](https://www.sports-reference.com/data_use.html) bars building tools or competing services from scraped data, and declines bulk dataset requests under $5,000.
- Facts themselves are reusable. The compilation path is the risk.

**Recommendation (S to document, M to fix):**

- Add a terms column to the README's Real data table and name the game files' origin and licence.
- For any commercial build, source honours and Finals from NBA.com facts or a licensed feed.

### 4. No offer, and the market just got tighter — P1 (business)

**Evidence:**

- There is still no price, edition plan or purchase flow; the version is 1.0.0.
- 2K27 Arcade Edition lands 5 Nov 2026 and FM27 Touch 10 Nov 2026, both inside Apple Arcade with no ads or in-app purchases ([iPhone in Canada](https://www.iphoneincanada.ca/2026/10/20/nba-2k27-football-manager-27-apple-arcade-november-2026/)). FM27 Touch adds touchline instructions during matches: that is exactly this game's "coach the game" claim, for football.
- Basketball GM is free, says "no microtransactions", and doubled its sim speed on 21 Sep 2026 ([zengm blog](https://zengm.com/blog/)).
- Its 12 Jun 2026 post is about the rise of "vibecoded" sports sims. New entrants like BBALL SIM (App Store, June 2026) crowd the free tier.

**Recommendation (M):**

- A free web build with the fictional league.
- A premium store app at $6.99–9.99 with no gameplay purchases.
- An optional yearly data edition.
- Pitch Apple Arcade or Netflix Games as a basketball counterpart to FM, which needs the fictional default from Finding 1.

### 5. The hook is still "real NBA", and the real differentiator never reaches a store visitor — P1 (store)

**Evidence:**

- Start tagline: "GM and head coach of a real NBA roster…" (`src/ui/screens/Start.tsx:124`).
- Manifest: "Run an NBA franchise as GM and head coach. Deep tactics, real 2026-27 rosters." (`vite.config.ts:34`).
- What nobody else has is the measured why: paired-game verdicts, "it worked" only from a counterfactual, a staff voice reading live measurement. It appears nowhere before install.

**Recommendation (S):**

- Hook: "The basketball sim that tells you why you won, and proves it."
- Subtitle: "GM + head coach · honest numbers · offline · no ads."
- Lead the screenshots with the game report's "What decided it" and the live staff call.

### 6. Sims are ~30-45% slower than round 2, and the UI briefly freezes after them — P2 (platform)

**Evidence:**

| Step  | Round 2 (load 38–59) | Now (load 21–56) |
| ----- | -------------------- | ---------------- |
| Month | 1.5–1.7 s            | 2.0–2.4 s        |
| Day   | 0.42–0.55 s          | 0.34–0.49 s      |
| Week  | 0.40–0.77 s          | 0.52–1.25 s      |

- `jank.mjs` measured main-thread long tasks during a month sim of 623 ms and 327 ms (four tasks, 1.19 s in all), and one main-thread round trip of 722 ms.

**Mid-range phone estimate.** I could not emulate a phone directly: CDP CPU throttling did not reach the sim worker (x4 week 1.75 s vs x1 0.7–1.25 s). Assuming JS on a mid-range Android or older iPhone runs about 3–4× slower than an M4 Pro:

| Step           | Estimate                                                       |
| -------------- | -------------------------------------------------------------- |
| Day            | 1–2 s                                                          |
| Week           | 2–5 s                                                          |
| Month          | 7–10 s                                                         |
| Regular season | 45–90 s, plus staff-call stops (5–8 per season, `seasons.log`) |
| UI freezes     | 1–2.5 s each                                                   |

That is acceptable for the genre, but it is the margin this game's "a season in seconds" promise depends on.

**Recommendation (M):**

- Profile which of the last two rounds' features (the staff's measured reads, the live-measurement voice) costs time in the worker, and cache or batch those paired games.
- Move save serialization (structuredClone of a 4–7 MB league) off the main thread, or chunk it.
- Add a per-month timing budget to CI next to the style gate.

### 7. Native saves still live only in WebView IndexedDB — P1 (still open)

**Evidence:**

- There is still no use of `Directory.Data` or `Directory.Documents` anywhere in `src/`; Filesystem only stages the backup share (`src/state/backup.ts:80`).
- `android:allowBackup="true"`, but Android Auto Backup is capped at 25 MB.
- IndexedDB was 16.4 MB at the start of season 3 in my run, and 12 MB mid-season 1 with two leagues (after the import). Two leagues, or a long career, exceed the cap; past that, backup stops with no warning.
- One uninstall, or a WebView data clear, loses the career: the genre's worst one-star review.

**Recommendation (M):** write the gzipped export (about 1.5–2 MB) to `Directory.Data` at each rollover and on app pause, and offer "Restore device copy" on the start screen.

### 8. Store paperwork is still missing — P1

**Evidence:**

- No privacy-policy URL, support URL, listing copy or screenshot set anywhere (README and `src/` searched for "privacy policy": none). Both stores require a privacy URL.
- iOS `MARKETING_VERSION = 1.0` is hard-coded while Android reads 1.0.0 from package.json.
- There is no iOS CI.
- The app is on Capacitor 7. Dependabot branches for Capacitor 8 (`dependabot/npm_and_yarn/capacitor/core-8.5.3`) sit unmerged. Builds with the iOS 26 SDK, which Apple requires for uploads, are unverified on Capacitor 7.

**Recommendation (S):**

- A one-page policy ("nothing leaves your device") linked from Settings → About.
- Take the iOS version from package.json.
- Decide on Capacitor 8 before the first upload.

### 9. Missing table stakes: faces, community files, achievements, sync — P2 (still open)

**Evidence:**

- A jersey glyph stands in for faces (`release-confirm.png`).
- No league/roster file other than your own backup, and no Game Center, Play Games or cloud sync.
- Achievement material already exists in the GM legacy: trophy cabinet, milestones, signature upsets (`src/core/league/legacy.ts:25,108`, `src/ui/office/Career.tsx`).

**Recommendation:**

- (S–M) Map legacy milestones to Game Center and Play Games achievements.
- (S) "Share league file", which doubles as the IP-safe real-roster path.
- (M) Deterministic generated faces.

### 10. No share loop — P2 (still open)

- `navigator.share` and Capacitor Share are used only for backups (`backup.ts:82,86`).
- The final slab, titles, the legacy cabinet and the new "drama-aware titles" can't be shared.
- **Recommendation (S–M):** render the final slab or title moment to a 1080×1350 PNG with a wordmark.

### 11. Phone landscape on Android and the PWA is unusable — P2 (still open)

- At 844×390 the top bar, the "Chance to win" hero and the dock leave almost nothing to scroll (`layout-phone-land-today.png`).
- The manifest still says `orientation: 'any'` (`vite.config.ts:38`), and the Android activity has no `screenOrientation`.
- **Recommendation (S):** lock phone widths to portrait and keep tablets free.

### 12. Tablets get a capped single column — P2 (still open)

- Tablet landscape Tactics is one column about 785 CSS px wide, with empty margins (`layout-tab-land-tactics.png`).
- **Recommendation (L):** two panes for Roster → Player, Standings → Team and Games → Report. This matters for iPad featuring.

### 13. The icon and the in-app mark are two brands — P2 (still open)

- The icon is an X and an arrow onto a red block (`resources/icon.png`).
- The start screen shows a line basketball (`start-with-league.png`).
- At grid size the icon reads as a UI glyph rather than basketball.
- **Recommendation (S):** pick one mark for the icon, splash and start screen.

### 14. A crash mid live game rewinds to tip-off without saying so — P3 (still open)

**Evidence** (`killlive.mjs`):

- After 95 s of live play (Q1 6:23, 17–22) I SIGKILLed the browser.
- On reopen Today read "Live · Tied 0-0", and Live showed "Q1 12:00" with no notice (`killlive-after.png`).
- Checkpoints happen only at breaks, pauses, moves and on hide (`src/ui/live/useLiveGame.ts:757,775`).
- At the default pace, a quarter is about 3–4 real minutes.

**Recommendation (S):** checkpoint every ~20 possessions, and say "picked up from Q1 12:00" when the game is rewound.

### 15. "My League" default, and start-screen figures frozen at 2026-27 — P3 (still open)

- The start screen reads "Season 2026-27" above "Continue · 2029-30" for "My League" (`start-with-league.png`; `NewLeague.tsx:49`, `Start.tsx:126-130`).
- **Recommendation (S):** name leagues "Pistons 2026-27", tag fictional ones, and show the continuing league's season.

### 16. The disclaimer is still buried — P3 (still open)

- "Not affiliated with the NBA or its teams" sits inside a collapsed "Data sources" panel in Settings → About (`Settings.tsx:422`).
- **Recommendation (S):** move it to the start-screen footer, and add the players' union and sponsor arenas.

### 17. Memory grows across seasons — P3

- Main-thread heap: 8.7 MB at creation → about 100 MB at the end of season 1 → 117–129 MB by the season 3–4 rollovers.
- Renderer RSS (page plus worker) peaked at 376 MB; the whole Chromium tree reached 538 MB during month sims.
- That is fine on current phones, but a risk on 3–4 GB Android devices whose WebView gets killed in the background.
- **Recommendation (S):** a 10-season memory soak in the smoke run.

### 18. Unminified Android release and no diagnostics — P3 (still open)

- `minifyEnabled false` (`android/app/build.gradle:45`), and there is no "copy diagnostic report" in Settings.
- **Recommendation (S):** add a diagnostics copy (version, build, save format, phase, last errors).

## 4. Since round 2

| Round-2 finding                                            | Status now                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1. Public repo, Pages, `data-raw`                          | **Still open, and worse in content**: the 1947+ history and real careers are now public (Finding 2) |
| 2. Unlicensed NBA identity; fictional uses real franchises | **Still open, and deeper**: history.json, "No title since…", seed always bundled (Finding 1)        |
| 3. Unrecorded provenance                                   | **Still open**, plus a new Sports Reference awards dependency (Finding 3)                           |
| 4. No monetization                                         | **Still open**, and the pressure is higher: 2K27 Arcade and FM27 Touch in November (Finding 4)      |
| 5. Hook "real NBA"                                         | **Still open** (Finding 5)                                                                          |
| 6. Icon vs mark                                            | **Still open**                                                                                      |
| 7. No share loop                                           | **Still open**                                                                                      |
| 8. IndexedDB-only native saves                             | **Still open**. Measured 16.4 MB by season 3 against the 25 MB backup cap                           |
| 9. Privacy policy and listing                              | **Still open**                                                                                      |
| 10. Phone landscape                                        | **Still open**                                                                                      |
| 11. Tablet single column                                   | **Still open**                                                                                      |
| 12. Live progress lost on a crash                          | **Still open**. Re-verified: rewound from Q1 6:23 to 12:00, silently                                |
| 13. "My League" default                                    | **Still open**                                                                                      |
| 14. Start figures frozen                                   | **Still open** (2026-27 above 2029-30)                                                              |
| 15. Memory                                                 | **Unchanged**, now measured over three seasons                                                      |
| 16. Table stakes                                           | **Still open**. Partial base: the GM legacy cabinet could feed achievements                         |
| 17. Report header truncation                               | Not re-verified (no report on the profile I used)                                                   |
| 18. Unminified, no diagnostics                             | **Still open**                                                                                      |
| Speed (strength)                                           | **Regressed** about 30–45% per month sim; main-thread freezes of 0.3–0.6 s (Finding 6)              |
| Offline, backups, cold load (strengths)                    | **Held**. Start screen 264 ms; real league offline works; 1.49 MB gzipped backup                    |

**New in the last two rounds, for this lens:**

- **Good:**
  - The honesty and staff-voice work strengthens the only defensible hook.
  - Original rating derivation with a reputation check.
  - The legacy and trophy cabinet as achievement material.
- **Bad:** more NBA brand surface, and a heavier sim.

## 5. What it would take to reach 9/10 in this lens

1. **Take down the public exposure and build a store-safe edition (L).** A fictional default with invented franchises and arenas, no "NBA", and the seed and history out of the bundle. Real rosters only as an imported league file or on the web with a disclaimer. Without this, no store release, Arcade pitch or paid offer is possible.
2. **Set the offer around the hook (M).** Premium at $6.99–9.99 with no gameplay purchases and "tells you why you won, and proves it" in every listing asset. Pitch Arcade or Netflix as the basketball FM. Write the privacy policy and listing alongside.
3. **Protect careers on device (M).** A gzipped autosave to `Directory.Data` at each rollover and on pause, with restore. This prevents the 1-star losses.
4. **Win back sim headroom (M).** Profile the new staff-measurement cost, move save serialization off the main thread, and add a CI timing budget, so a mid-range phone does a month in under 5 s.
5. **Growth loop and table stakes (S–M).** Share cards from the final slab and title moments, achievements from the legacy cabinet, generated faces, and one brand mark.

**Who it's for:** sim-literate basketball fans aged 18–40 who play on phones in short sessions: Basketball GM players who want coaching and the why, and FM players who want basketball.

**One-sentence hook:** "The basketball sim that tells you why you won, and proves it: GM and head coach on your phone, offline, no ads."

### Competitor table

| Product                                                                                                                                                                                                                                                                     | Platform / price                                                                                                                                                                                                                            | Real NBA                                                                                     | GM + coach                                 | Explains why      | Mobile / offline             | Vs Hoops Career                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------- | ---------------------------- | ------------------------------------------------------------- |
| **Hoops Career**                                                                                                                                                                                                                                                            | PWA live on Pages; shells unreleased; no price                                                                                                                                                                                              | Real 2026-27 plus the NBA past since 1947, unlicensed; "fictional" keeps the real franchises | GM + coach, deep tactics, live staff voice | **Yes, measured** | Phone-first, fully offline   | —                                                             |
| Basketball GM                                                                                                                                                                                                                                                               | Free web, "no microtransactions"; sim engine 2× faster (Sep 2026) ([site](https://basketball-gm.com/), [blog](https://zengm.com/blog/))                                                                                                     | Real players back to 1947 via its "real players" mode                                        | Deep GM, light coaching                    | No                | Web                          | The free bar on depth and speed; big community                |
| NBA 2K27 Arcade Edition                                                                                                                                                                                                                                                     | Apple Arcade, 5 Nov 2026 ([report](https://www.iphoneincanada.ca/2026/10/20/nba-2k27-football-manager-27-apple-arcade-november-2026/)); 2K26's listing has "The Association" GM mode ([App Store](https://apps.apple.com/app/id6746148175)) | Fully licensed, now with the WNBA                                                            | GM + coach (2K26)                          | No                | iPhone, iPad, Mac            | A licensed GM on iPhone; you are the depth and honesty option |
| NBA 2K MyNBA / MyGM (console)                                                                                                                                                                                                                                               | Full price; 2K26 added offseason scenarios and online playoffs ([report](https://gamingtrend.com/news/mynba-and-mygm-get-upgrades-in-latest-nba-2k26-blog/))                                                                                | Licensed                                                                                     | Deep                                       | No                | Not mobile                   | The licensed bar                                              |
| FM26 Mobile / FM27 Touch                                                                                                                                                                                                                                                    | Netflix-only (4 Nov 2025) / Apple Arcade (10 Nov 2026, touchline instructions) ([SEGA](https://sega.prezly.com/football-manager-26-launches-november-4))                                                                                    | Licensed soccer                                                                              | The benchmark                              | Partly            | Mobile through subscriptions | Sets the "tactics matter" bar; the basketball gap is yours    |
| Hoop Land                                                                                                                                                                                                                                                                   | iOS free + $4.99 Premium; Steam $14.99, Early Access since Oct 2025 ([Steam](https://store.steampowered.com/app/2453660/Hoop_Land/), [steambase](https://steambase.io/games/hoop-land/info))                                                | Fictional plus community files                                                               | Light GM, playable 2D                      | No                | Mobile, offline              | Price anchor and community-file model                         |
| Pro Basketball Manager 2026                                                                                                                                                                                                                                                 | PC, out 17 Nov 2025, about 70% positive ([Steam](https://store.steampowered.com/app/3585230/))                                                                                                                                              | Licensed BCL / Europe, no NBA                                                                | Deep GM + tactics, 3D                      | Some              | No mobile                    | Closest serious sim; PC only                                  |
| Draft Day Sports: Pro Basketball 2026                                                                                                                                                                                                                                       | PC, 5 Nov 2025 ([gmgames](https://gmgames.org/?p=20217))                                                                                                                                                                                    | Fictional plus community files                                                               | Deep text GM, apron rules                  | No                | No mobile                    | Hardcore audience, dated UI                                   |
| Mobile free-to-play GMs: Basketball Legacy Manager 26, Ultimate GM, Franchise Basketball, BBALL SIM (2026) ([BLM26](https://apps.apple.com/app/id6749378039), [Franchise](https://apps.apple.com/app/id1433795761), [Ultimate GM](https://apps.apple.com/app/id6473804144)) | Free + IAP / card packs                                                                                                                                                                                                                     | Mostly "inspired by"                                                                         | Shallow to medium                          | No                | Mobile, offline              | Be the honest premium alternative                             |

- **Differentiated:** the measured explanation layer and staff voice, GM and coach in one, speed, offline and privacy, the Hardwood UI.
- **Missing table stakes:** faces, community files, sharing, achievements, store presence.
- **Liabilities:** NBA, players' union and arena IP, now including the league's past; Sports Reference terms; undocumented game files; no offer.

## 6. What I couldn't verify, and how I tested

**Scripts:**

| Script                                     | What it covered                                                       |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `load.mjs`                                 | Cold load, fast and throttled                                         |
| `sims.mjs`                                 | Season 1 timings, IndexedDB sizes, heap and RSS                       |
| `advance.mjs`                              | Play-in through offseason, three times; the logs are in `seasons.log` |
| `throttle.mjs`, `jank.mjs`                 | CPU throttling, main-thread long tasks                                |
| `kill.mjs`, `killlive.mjs`, `offline2.mjs` | SIGKILL tests, offline new league                                     |
| `backup.mjs`                               | Export, import, two leagues                                           |
| `offline.mjs`                              | Offline reload, sim, routes                                           |
| `layouts.mjs`                              | 820×1180, 1180×820, 844×390, 1366×1024                                |
| `fictional.mjs`                            | Fictional league                                                      |
| `store.mjs`                                | Start screen, Settings                                                |

**Routes visited:** `/start`, `/new`, `/`, `/team`, `/team/tactics`, `/league`, `/league/history`, `/office/trade`, `/office/resign`, `/office/free-agents`, `/settings`, `/live`.

**Seasons played:** about three full seasons and offseasons in the UI (Pistons, 2026-27 to 2029-30), plus a second Pistons league into the 2027 play-in and a fictional Celtics league at creation.

**What I couldn't verify:**

- **Real-phone speed.** CPU throttling didn't reach the worker, and the phone figures are estimates from an assumed 3–4× JS slowdown.
- **A headless season.** `season-test.ts 1` took 372 s at load average 55, against about 14 s in the browser, so headless timing is unusable under this load.
- **A true kill mid-sim.** Both of my attempts landed after the sim had already stopped for a staff call (`simbar none`), so round 2's kill-safe result is not re-verified.
- **A real backgrounding checkpoint** for the live game.
- **The native apps.** No APK or IPA was built, and Capacitor 7 against the iOS 26 SDK is untested.
- **Legal conclusions** need counsel, including the game files' origin and the licence costs.
