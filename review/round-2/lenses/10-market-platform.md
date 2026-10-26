# Hoops Career, round 2: market and platform review (`market-platform`)

Screenshots and scripts are in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/3ab7e56a-18a1-4267-8218-da731c128be7/scratchpad/review/market-platform/`. Shot names below are relative to its `shots/` folder. The repo is untouched (`git status` is clean), and my static server is stopped.

**About the build I measured.** `dist/` was built at 16:36 and HEAD (e95407b) was committed at 17:22. `src/data/seed.json` (16:21) and the UI files the HEAD commits changed are older than the build, so `dist/` is effectively HEAD. The public Pages site was redeployed at 21:23 GMT on 25 Oct and serves a different JS hash (index-CazXKiSG.js against dist's index-y0cSNOaJ.js), presumably the same commit built for the /hoops-career/ path.

**About the timings.** The machine's load average was 38–59 on 14 cores while nine other reviewers ran. All timings are wall-clock under that load and are conservative.

## 1. Verdict

The platform is now close to store-grade:

- **Engineering:**
  - It loads fast.
  - It sims a season in seconds.
  - It works fully offline.
  - It keeps sim progress through a hard kill.
  - It gzips backups to about 1/5 of their size.
- **Native shells:**
  - Android targets API 36, builds a signed AAB, and refuses to build a release without the key.
  - iOS has a light theme, a privacy manifest, an encryption key and a portrait lock.

Most of round one's platform P1s are fixed.

The market side has not moved, and part of it got worse:

- The product still leads with the unlicensed NBA: names, nicknames, colours, sponsor arenas, "NBA Cup/Finals", and an "NBA" chip on the live ticker.
- The "Fictional league" still uses the real franchises.
- **New exposure since round one:**
  - The repo is public with no licence.
  - The app is live on public GitHub Pages.
  - A public `data-raw` branch holds an 8.2 MB tarball of cached Basketball Reference pages. Sports Reference's data-use page says "you should not create websites or tools based on data you scrape from Sports Reference."
- There is still no price, no hook beyond "real NBA", no sharing loop, and the launcher icon doesn't match the in-app brand.

**Score: 6/10.** Platform about 9 (was 8.5). Market, legal and store readiness about 3.5, unchanged, because the IP and data path is still the blocker and is now publicly exposed.

## 2. What's genuinely great (protect these)

**Speed** (prod `dist/`, 390×844 mobile, loaded machine):

| What                                           | Time                                   |
| ---------------------------------------------- | -------------------------------------- |
| Sim 1 day                                      | 0.42–0.55 s                            |
| Sim 1 week                                     | 0.40–0.77 s                            |
| Sim 1 month                                    | 1.5–1.7 s                              |
| Rest of a regular season (after 2 Dec)         | ≈ 9.6 s over 5 legs (staff-call stops) |
| Whole regular season, from creation            | ≈ 13 s                                 |
| Play-in                                        | 0.35 s                                 |
| Playoffs                                       | 1.3 s                                  |
| Each offseason step                            | 0.3–0.7 s                              |
| Whole offseason, including two forced signings | 87 s, mostly my script's waits         |

**Cold load** (`load.mjs`):

- Unthrottled: start screen in 0.58 s.
- Slow 4G (1.6 Mbps, 150 ms) with 4× CPU: first contentful paint 3.2 s, start screen 3.3 s, 492 KB transferred.
- The seed loads only when you open New League: 3.8 s on slow 4G (≈ 675 KB gz).
- League creation: 0.4 s, or 0.8 s with 4× CPU.

**Offline really works** (`offline.mjs`):

- The service worker precaches 147 files.
- An offline reload took 214 ms, and "Sim 1 week" offline took 1.2 s.
- Tactics, Live, History, Trade and Settings all render offline.
- New League with the real roster works offline, with no failed requests.

**Kill-safe sims** (new):

- I sent the browser `SIGKILL` at "Sim 1 month · Day 9 of 30" (`kill-mid-sim.png`).
- On relaunch the league was 10 days on (Nov 7 → Nov 17, 400 results saved) and opened straight onto Today (`after-kill-sim.png`).
- The `checkpointSimRun`/`flush` design works.

**Backups are now small and fast** (`backup.mjs`):

- After one season plus the rollover, export took 0.32 s and produced `hoops-career-my-league-2028.json.gz` at 1.35 MB (6.59 MB of JSON). Round one measured 12.96 MB.
- Import took 0.39 s and never overwrites: the copy becomes "My League (imported)" (`start-two-leagues.png`).

**Save growth is under control:**

- On device (IndexedDB): 2.6 MB at creation, 7.7 MB at the end of season 1, 10.7 MB at the start of season 2. Old results are pruned at the rollover (games store 1,231 → 91).
- Headless, 8 seasons (`sizes.ts` / `sizes.log`): the league record grows 5.71 → 9.22 MB and the gzipped backup 1.23 → 1.97 MB, about +0.1 MB a season gzipped. The README's numbers check out.

**Native shells largely fixed:**

- Android:
  - `targetSdkVersion = 36`.
  - `bundleRelease` produces the AAB.
  - `versionName` comes from package.json.
  - A release build fails loudly without the key (`android/app/build.gradle:72-80`).
- iOS:
  - `UIUserInterfaceStyle = Light`.
  - `PrivacyInfo.xcprivacy` with the C617.1 file-timestamp reason.
  - `ITSAppUsesNonExemptEncryption = false`.
  - iPhone portrait-only, with landscape kept on iPad.
  - Launch storyboard background `#F3EFE7`.
- The icon and splash are regenerated in the Hardwood look (`assets/ios-icon.png`, `assets/splash.png`).

**Save-safety prompt on iOS Safari** (new): an iPhone Safari tab shows "Add to Home Screen to keep your league safe" on Today (`ios.mjs`: install row true). Chrome's install prompt is caught and offered (`src/ui/components/InstallRow.tsx`). When storage isn't kept for good, the backup ask comes at day 30 of season 1 (`backup.ts:146,155`).

**Privacy as a feature:**

- No network calls after load, no analytics, no account.
- The privacy manifest declares nothing collected.

**The tablet live game is a real two-pane screen:** court on the left, scorebug, staff and keys on the right (`store-live-tablet-land.png`). This is store-screenshot material.

## 3. Findings

### 1. The public repo and Pages site redistribute scraped Basketball Reference pages and an unlicensed NBA product — P0 (legal, live now)

- **What happens:**
  - `github.com/kiarashlotfalizadeh/hoops-career` is public (GitHub API: `"visibility": "public"`, `"license": null`).
  - `kiarashlotfalizadeh.github.io/hoops-career/` serves the app, deployed on every push (`.github/workflows/pages.yml`).
  - Branch `data-raw` holds `data-raw.tgz` (8,209,962 bytes): the cached Basketball Reference pages plus extras (`seed.yml:7,64`).
  - `src/data/seed.json` (2.66 MB, ratings derived from those pages) is in `main`.
- **Why it matters:**
  - Sports Reference's data-use page says not to build "websites or tools based on data you scrape", nor a "material substitute" for its data stores.
  - Publicly re-hosting their pages is the easiest thing for them to act on.
  - A live public site with "Real 2026-27 NBA · 544 real players" is distribution today, not a hypothetical store release.
- **Recommendation (S, today):**
  - Make the repo private, or delete the `data-raw` branch and move that cache to a private artifact store.
  - Turn Pages off, or point it at a fictional-only build, until Finding 2 is settled.
  - Record each source's terms in README → Real data.

### 2. The product's identity still rests on unlicensed NBA and NBPA IP, and the "fictional" path doesn't remove it — P0 for stores, P1 for the web

- **What the player sees:**
  - The start screen says "GM and head coach of a real NBA roster" (`load-slow-start.png`).
  - New League leads with "Real 2026-27 NBA · 544 real players and their contracts", with the alternative "Fictional league: Real franchises, generated players" (`load-slow-newleague.png`, `NewLeague.tsx:203-205`).
  - The live ticker shows an "NBA" chip, and the court is painted "76ERS" (`store-live-play.png`).
  - The manifest and meta read "Run an NBA franchise as GM and head coach… real 2026-27 rosters" (`vite.config.ts:34`, `index.html`).
- **Evidence in code:**
  - "NBA Cup" (14 literals), "NBA Finals" (9), "All-NBA" (14) are hard-coded for every league, fictional included (`ui/moments.ts:86`, `league/shared.tsx:173`, `FinalSlab.tsx:35`, `Live.tsx:247`).
  - Sponsor arena names are in `core/teams.ts` ('State Farm Arena', 'TD Garden'…). They reach copy through the crowd lines ("{arena} is on its feet", `ui/live/atmosphere.ts:284-608`) and the team hero (`league/team/Hero.tsx:29`).
  - The only disclaimer is still collapsed at Settings → About → Data sources (`Settings.tsx:422`).
- **Why it matters:**
  - Player names in groups are NBPA group licensing; that arm has been renamed PLYRS UNTD (formerly THINK450).
  - Team nicknames and "NBA Cup/Finals" are NBA Properties marks; arena names are sponsor marks.
  - Apple 5.2.1 and 4.1 rejections for content "resembling third-party sports teams/leagues" are routine, and reviewers ask for documentary rights.
  - Basketball GM, the closest free comparison, ships real players without real team names, logos or photos by default; users add them.
- **Recommendation (L):**
  - Store builds default to a truly fictional league: invented nicknames, abbreviations and colours, generic arenas, "Cup", "Finals" and "All-League" without "NBA", and no NBA chip.
  - Real rosters only through a user-imported league file (the backup format already is one), or only on the web with a visible disclaimer.
  - Move "Not affiliated with the NBA, NBPA or any team" to the start screen footer.

### 3. The seed's inputs have unrecorded provenance and terms — P1

- **Evidence:**
  - The EPM target is gone (good: `94a0b6d`).
  - The seed now rests on "game files… kept by hand, ~1.4 GB" of NBA.com box scores and play-by-play (README → Real data), with no stated origin or licence.
  - The other inputs are Basketball Reference (scraped at 1 request every 3.7 s), stats.nba.com through a mirror, ESPN injuries through a mirror, and RealGM picks through a third-party scrape repo.
- **Why it matters:** a paid app whose every rating derives from these inputs needs a written basis for each.
- **Recommendation (S to audit, M to fix):**
  - Add a terms column to the Real data table.
  - Name where the game files came from and under what licence.
  - For a commercial build, prefer NBA.com facts (stats are facts) over Sports Reference-derived fields, or license a feed.

### 4. No monetization design, and the one obvious product (a real-roster pass) is what you can't sell — P1 (business)

- **Evidence:**
  - Still no price, purchase flow or edition plan.
  - Version 1.0.0, no store metadata, no fastlane or store folder.
- **Why it matters:** the price anchors are clear:

| Product                                                                                 | Price                                  |
| --------------------------------------------------------------------------------------- | -------------------------------------- |
| Hoop Land                                                                               | iOS free + $4.99 Premium; Steam $14.99 |
| Pro Basketball Manager 2026                                                             | £29.99                                 |
| iBasketball Manager 26                                                                  | $6.99                                  |
| Free-to-play GMs                                                                        | $4.99 "Pro" upgrades                   |
| FM26 Touch                                                                              | inside Apple Arcade                    |
| FM26 Mobile                                                                             | Netflix only                           |
| NBA 2K26 Arcade Edition (licensed NBA, includes "The Association" GM + coach on iPhone) | inside Apple Arcade                    |

- **Recommendation (M):**
  - Free web PWA with a fictional league.
  - A premium store app at about $6.99–9.99, with no gameplay IAP and no ads.
  - An optional yearly edition built by the `data:build` pipeline.
  - Never sell ratings, sim speed, luck or difficulty relief.
  - Consider pitching Apple Arcade or Netflix Games, which is how FM reaches phones.

### 5. The hook is still "real NBA", and the real differentiator is invisible before install — P1 (store)

- **Evidence:**
  - Start screen: "GM and head coach of a real NBA roster: build it in the office, coach it on the floor."
  - Manifest: "Run an NBA franchise…"
  - The thing nobody else does is the report that says what decided the game ("What decided it · +12.6 Turnover battle… −11.2 The 76ers' shots fell… luck: nothing to change for it", `store-report.png`) plus the staff voice. It isn't in any metadata.
- **Recommendation (S):**
  - Hook: "The basketball sim that tells you why you won."
  - Subtitle: "GM + head coach. Deep tactics. Offline. No ads."
  - Screenshots in order:
    1. The "What decided it" report.
    2. The live court with the assistant (`store-live-play.png`).
    3. The tablet two-pane live game.
    4. The Today result hero (`layout-tab-land-today.png`).
    5. The staff-call card.
  - Strip "NBA" from all of them.

### 6. The launcher icon and the in-app mark are two different brands, and the icon doesn't read as basketball — P2

- **Evidence:**
  - Icon and splash: a black X with a chalk arrow onto a red block (`public/icon.svg`, `assets/ios-icon.png`).
  - The app opens on a one-line basketball mark (`BrandMark.tsx`, `load-slow-start.png`).
  - At grid size the icon reads like a "close/forward" UI glyph, with nothing saying basketball among the orange-ball icons.
- **Recommendation (S):**
  - Pick one mark: an X-and-O with a ball, or the line ball on a team-colour block.
  - Use it for the icon, splash and start screen alike.
  - Test it at 60 px next to competitors.

### 7. No share loop — P2 (still open)

- **Evidence:** `@capacitor/share` and `navigator.share` are used only for backups (`backup.ts:80,87`). The final slab, the "What decided it" card, the champions moment and the player card can't be shared.
- **Recommendation (S–M):** a Share button that renders the existing slab as a 1080×1350 PNG with a small "Hoops Career" wordmark. This is the genre's growth channel (Reddit and Discord).

### 8. Native saves live only in WebView IndexedDB, with no device-file autosave — P1 (still open)

- **Evidence:**
  - No `Directory.Data` or `Directory.Documents` use anywhere. Filesystem only stages the backup share in `Directory.Cache` (`backup.ts:80`).
  - Android Auto Backup (`allowBackup="true"`) caps at 25 MB. One league is ~10.7 MB on device at the start of season 2. The league record grows to 9.2 MB by season 9, plus a full snapshot copy and the season's results, so it passes 25 MB around season 8, sooner with two leagues.
- **Recommendation (M):** write the gzipped `exportLeague` file (≈1.3–2 MB) to `Directory.Data` at each rollover and on `pause`, and offer "Restore device copy" on the start screen. It's cheap now that backups are small.

### 9. No privacy policy, support URL or store listing assets — P1 (store readiness)

- **Evidence:** none in the repo or the app. Both stores require a privacy-policy URL. Play's Data safety form and Apple's privacy label need declaring ("Data Not Collected" is a selling point). The iOS project has no `DEVELOPMENT_TEAM`, `MARKETING_VERSION = 1.0` is hard-coded (Android takes package.json's 1.0.0), and there is no iOS CI.
- **Recommendation (S):**
  - A one-page privacy policy ("no data leaves your device") on Pages.
  - Settings → About links to it and to a support channel.
  - Take the iOS marketing version from package.json.
  - Write the listing copy from Finding 5.

### 10. Phone landscape on Android (and the PWA) is nearly unusable — P2 (partly fixed)

- **Evidence:**
  - iOS locks iPhone to portrait, but the Android activity sets no `screenOrientation` and the manifest says `orientation: "any"`.
  - At 844×390 the top bar plus the Continue dock and tab bar leave about 120 px of content, just the score hero (`layout-phone-land-today.png`).
- **Recommendation (S):** set `android:screenOrientation` to portrait for phone widths only (or `sensorPortrait`, with tablets allowed through resource qualifiers), and use `orientation: portrait` in the PWA manifest.

### 11. Tablets get a capped single column, not a tablet app — P2 (partly fixed)

- **Evidence:**
  - Tablet landscape centres a column about 790 CSS px wide, with empty margins (`layout-tab-land-today.png`, `layout-ipadpro-land-*.png`).
  - Tablet portrait Team is a stretched phone list (`layout-tab-port-team.png`).
  - Only the live game uses two panes.
- **Recommendation (L, later):** two panes for Roster → Player, Trade, Standings → Team and Games → Report. It matters for iPad featuring and for the premium price.

### 12. Live-game progress since the last checkpoint is lost on a crash — P3 (still open)

- **Evidence:**
  - I sent `SIGKILL` after 12 s of live play (Q1 10:56, 2-2, `kill-mid-live.png`). On relaunch Today read "Live · Tied 0-0" (`after-kill-live.png`).
  - Checkpoints are written at breaks, on pause, with moves and on hide (`live.ts:315-336`, `App.tsx:110`), so a real phone backgrounding is covered. An OOM kill or crash is not.
- **Recommendation (S):** also checkpoint every ~20 possessions.

### 13. Saves still default to "My League" — P3 (still open)

- **Evidence:** `NewLeague.tsx:49,128`. The start list showed "My League (imported)" over "My League" (`start-two-leagues.png`), and the backup was named `hoops-career-my-league-2028.json.gz`.
- **Recommendation (S):** default the name to "Pistons 2026-27" and tag fictional leagues "(fictional)".

### 14. The start screen's figures are frozen at the seed — P3

- **Evidence:** "Teams 30 · Games 82 · Season 2026-27" stays above a Continue card reading "2027-28" (`start-two-leagues.png`).
- **Recommendation (S):** show the continuing league's season, or drop the stat row once a league exists.

### 15. Memory is fine on desktop but unmeasured on a phone — P3

- **Evidence:**
  - Main-thread JS heap: 11–68 MB.
  - Renderer RSS (page plus sim worker): 79–380 MB; whole Chromium tree up to 521 MB during week sims (`sims2.log`).
  - The worker holds a second copy of the league during a sim.
- **Why it matters:** fine for current phones; a risk on 3 GB Android devices in long careers.
- **Recommendation (S):** add a 10-season memory soak test to the smoke run, and a low-memory path that drops old play-by-play from memory.

### 16. Missing table stakes: faces, community league files, achievements, sync — P2 (market, still open)

- **Evidence:** a jersey glyph stands in for faces (`ios-fictional-team.png`; despite the name this shot shows the real league, see section 6). Basketball GM has generated faces; Hoop Land has pixel players and community rosters; FM and 2K have achievements. There is no "share league file" beyond backups, no Game Center or Play Games, and no cloud sync.
- **Recommendation:**
  - (M) Deterministic SVG faces.
  - (S) "Share league file", which is also the IP-safe real-roster path in Finding 2.
  - (M) Achievements from the existing Big moments.

### 17. The game report header truncates both team names at phone width — P3 (screenshot polish)

- **Evidence:** "D… 122 · Won by 5 · 117 P…" (`store-report.png`), which is a likely first store screenshot.
- **Recommendation (S):** use abbreviations (DET/PHI) at this width.

### 18. Android release ships unminified with no diagnostic path — P3 (still open)

- **Evidence:**
  - `minifyEnabled false` (`build.gradle:41`).
  - No "copy diagnostics" in Settings; there is no telemetry (deliberately).
- **Recommendation (S):** Settings → About → "Copy diagnostic report": version and build, save format, phase and day, the last 20 errors.

## 4. Since the first review

| #   | First-round finding                                                                   | Status now                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Unlicensed NBA/NBPA IP; fictional keeps the real franchises                           | **Still open**, and worse in exposure: now public on Pages and in a public repo (Findings 1–2)                                                                      |
| 2   | Data-source terms (EPM)                                                               | **EPM fixed**: removed in 94a0b6d. **New**: the Basketball Reference cache is published on `data-raw`, and the game files' provenance is unrecorded (Findings 1, 3) |
| 3   | Android API 35, APK only, versionName, keystore                                       | **Fixed**: API 36, AAB, versionName from package.json, release refuses without the key. minify is still off                                                         |
| 4   | iOS dark mode, old splash/icon, no privacy manifest, encryption key, iPhone landscape | **Fixed**: all five. The new icon has a brand mismatch (Finding 6)                                                                                                  |
| 5   | Native saves only in WebView IndexedDB                                                | **Still open** (Finding 8)                                                                                                                                          |
| 6   | No install prompt; backup ask a season late                                           | **Fixed**: iOS row shown (verified with an iPhone UA), Chrome prompt caught, ask at day 30 when storage isn't kept                                                  |
| 7   | No monetization                                                                       | **Still open** (Finding 4)                                                                                                                                          |
| 8   | No share loop                                                                         | **Still open** (Finding 7)                                                                                                                                          |
| 9   | Tablet stretched, landscape unusable                                                  | **Partly**: column capped, iPhone locked, tablet live game two-pane. Android/PWA phone landscape and tablet panes still open                                        |
| 10  | Saves and backups too big                                                             | **Fixed**: backup 12.96 → 1.35 MB gz, results pruned at rollover, README accurate                                                                                   |
| 11  | A kill mid-sim discards the sim                                                       | **Fixed**: SIGKILL at day 9 of 30 kept 10 days                                                                                                                      |
| 12  | Live resume can lose a quarter                                                        | **Still open** on a crash; covered when the app is backgrounded                                                                                                     |
| 13  | Metadata leans on NBA, hook buried                                                    | **Still open** (Finding 5)                                                                                                                                          |
| 14  | Generic orange-ball icon                                                              | **Fixed** to Hardwood, but it doesn't match the in-app mark or read as basketball (Finding 6)                                                                       |
| 15  | "My League" defaults                                                                  | **Still open**                                                                                                                                                      |
| 16  | Faces, community files, achievements, sync                                            | **Still open**                                                                                                                                                      |
| 17  | First load pulls the seed                                                             | **Fixed**: 492–598 KB to the start screen; the seed loads only for New League                                                                                       |
| 18  | Disclaimer buried                                                                     | **Still open**                                                                                                                                                      |
| 19  | Unminified, no crash signal                                                           | **Still open**                                                                                                                                                      |

**New this round:**

- Positive:
  - Gzipped backups.
  - Kill-safe sims.
  - The install row.
- Negative:
  - Public Pages deployment and a public repo with a data cache.
  - The competitive picture moved: NBA 2K26 Arcade Edition now puts a licensed GM + coach mode ("The Association") on iPhone through Apple Arcade.

## 5. Top 5 moves

1. **Take down the public exposure today (S).** Private repo, delete `data-raw`, Pages off or fictional-only. This removes the most actionable legal risk at once.
2. **Build a store-safe identity (L).** Fictional franchise names and arenas, "Cup" and "Finals" without "NBA", no NBA chip. Real rosters only through an imported league file or the web with a disclaimer. This is the precondition for any store release.
3. **Set the offer and the hook (S–M).** Premium about $6.99–9.99, no IAP, an optional yearly edition. Lead with "tells you why you won" and the "What decided it" screenshot. Write the privacy policy and listing. This gives the product a reason to exist next to 2K Arcade and Basketball GM.
4. **Loss-proof native saves (M).** A gzipped autosave to `Directory.Data` at each rollover and on pause, plus "Restore device copy". This guards against the genre's worst one-star review.
5. **Share cards, then faces and one brand mark (S–M).** An organic acquisition loop, humans in the screenshots, and an icon that matches the app.

**Who it's for:** sim-literate NBA fans aged 18–40 who play on their phones in short sessions: Basketball GM players who want coaching and the _why_, and FM players who want basketball.

**One-sentence hook:** "The basketball sim that tells you why you won: GM and head coach on your phone, a season in seconds, offline, no ads."

**Competitor comparison:**

| Product                                                                                    | Platform / price                                 | Real NBA                                                    | GM + coach                              | Explains _why_    | Mobile / offline             | Vs Hoops Career                                                               |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------- | ----------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| **Hoops Career**                                                                           | PWA live on Pages; Android/iOS shells unreleased | Real 2026-27, unlicensed; "fictional" keeps real franchises | GM + coach, deep tactics, live coaching | **Yes, the core** | Phone-first, fully offline   | —                                                                             |
| Basketball GM                                                                              | Free web                                         | Real players, but no team names, logos or photos by default | Deep GM, light coaching                 | No                | Web, offline                 | The IP model to copy; big community                                           |
| NBA 2K26 Arcade Edition                                                                    | Apple Arcade subscription                        | Fully licensed                                              | "The Association": GM + coach, NBA Eras | No                | iPhone, iPad, Mac            | Licensed GM on iPhone; shallow on _why_; you are the depth and honesty option |
| NBA 2K MyNBA / MyGM (console)                                                              | Full price                                       | Licensed                                                    | Deep                                    | No                | Not mobile                   | The licensed bar; console-bound                                               |
| FM26 Touch / FM26 Mobile                                                                   | Apple Arcade / Netflix only                      | Licensed (soccer)                                           | Benchmark tactics + GM                  | Partly            | Mobile through subscriptions | Sets the "tactics matter" bar; the basketball gap is yours                    |
| Hoop Land                                                                                  | iOS free + $4.99; Steam $14.99                   | Fictional + community files                                 | Light GM, playable 2D                   | No                | Mobile, offline              | Price anchor and community-file model                                         |
| Pro Basketball Manager 2026                                                                | PC, £29.99 (out 17 Nov 2025)                     | Licensed BCL and 20+ European leagues; no NBA               | Deep GM + tactics, 3D                   | Some              | No mobile                    | Closest serious sim; PC only                                                  |
| Draft Day Sports: Pro Basketball 2026                                                      | PC, Steam (5 Nov 2025)                           | Fictional + community files                                 | Deep text GM                            | No                | No mobile                    | Hardcore text-sim audience; dated UI                                          |
| Basketball Legacy Manager 26 / Ultimate GM / Franchise Basketball / iBasketball Manager 26 | iOS free + IAP ($4.99 Pro), or $6.99             | Mostly fictional or "inspired by"                           | Shallow to medium                       | No                | Mobile, offline              | Position as the honest premium alternative                                    |

- **Differentiated:** the explanation layer and staff voice, GM and coach in one, speed, offline and privacy, and the polished Hardwood UI.
- **Table stakes missing:** faces, community files, sharing, achievements, store presence.
- **Liabilities:** NBA, NBPA and arena IP; Sports Reference terms and the public data cache; no offer.

## 6. What I couldn't verify, and how I tested

**How I tested.** I served `dist/` read-only from my own gzip static server on port 4793 and drove it with Playwright at 390×844 mobile in my own persistent profile. Scripts in my scratch folder:

- `load.mjs`: cold load, fast and Slow 4G with 4× CPU.
- `sims.mjs`: a full regular season of sims with sizes, heap and RSS.
- `advance.mjs`: play-in through the offseason into 2027-28.
- `backup.mjs`: export, import, multiple saves.
- `kill.mjs`: SIGKILL mid-sim and mid-live.
- `offline.mjs`, `layouts.mjs` (820×1180, 1180×820, 844×390, 1366×1024), `store.mjs`, `throttle.mjs`, `ios.mjs` (iPhone 13 UA).
- `sizes.ts` (a copy of season-test with size logging): 8 headless seasons.

**Routes visited:** `/start`, `/new`, `/`, `/team`, `/team/tactics`, `/league`, `/league/history`, `/office/trade`, `/office/free-agents`, `/settings?tab=league`, `/live`, `/game/:gid`.

**Seasons simmed:** one full season plus offseason in the UI (Pistons), plus 8 seasons headless.

**What I couldn't verify:**

- **Real-phone sim speed:** CDP CPU throttling didn't clearly reach the worker (1 week 0.4–0.6 s unthrottled, 1.0 s throttled, noisy). My estimate for a mid-range phone is ≈ 40–60 s per regular season.
- **Headless season times** swung from 137–231 s to 25 s as machine load fell, so treat absolute numbers as loaded-machine figures.
- **The native apps themselves:** no APK or IPA was built. Back button, haptics, the share sheet, WebView eviction, Xcode 26 / iOS 26 SDK compatibility of Capacitor 7 (required for uploads since 28 Apr 2026) and Android 16 KB page-size compliance are checked from code only.
- **The real Android install prompt** (headless Chromium never fires `beforeinstallprompt`).
- **The fictional league:** my `ios.mjs` run meant to pick it, but the selector missed and it built the real league (the `ios-*` shots show the real Hawks). I relied on code and round one for the fictional league keeping real franchises.
- **Legal conclusions:** need counsel. These include the game files' origin, NBPA licence cost, and whether Apple would accept an imported-league design.

**Sources:**

- [Basketball GM: real-players data](https://basketball-gm.com/manual/customization/team-player-data-real/)
- [Sports Reference data use](https://www.sports-reference.com/data_use.html)
- [Hoop Land IAP tracker](https://apppricinglab.com/iap/apple/1605197976), [Hoop Land Steam info](https://steambase.io/games/hoop-land/info)
- [FM26 launch: Mobile on Netflix, Touch on Arcade](https://sega.prezly.com/football-manager-26-launches-november-4), [FM26 out now](https://www.footballmanager.com/index.php/news/football-manager-26-out-now-across-platforms)
- [NBA 2K26 Arcade Edition, App Store](https://apps.apple.com/app/id6746148175), [2K newsroom](https://newsroom-anz.2k.com/news/nba-2k26-arcade-edition-now-available)
- [Pro Basketball Manager 2026, Steam](https://store.steampowered.com/app/3585230/), [Fanatical price](https://www.fanatical.com/en/game/pro-basketball-manager-2026)
- [Draft Day Sports: Pro Basketball 26](https://gmgames.org/?p=20217), [isthereanydeal](https://isthereanydeal.com/game/draft-day-sports-pro-basketball-2026/info/)
- Mobile GMs: [Basketball Legacy Manager 26](https://apps.apple.com/app/id6749378039), [iBasketball Manager 26](https://apps.apple.com/app/id6758005110), [Franchise Basketball](https://apps.apple.com/app/id1433795761), [Ultimate GM Basketball Manager](https://apps.apple.com/app/id6473804144)
- Player licensing: [PLYRS UNTD (formerly THINK450), Sportico](https://www.sportico.com/leagues/basketball/2026/nba-players-union-plyrs-untd-1234936539/), [License Global](https://www.licenseglobal.com/sports/inside-the-nbpa-s-launch-of-plyrs-untd)
- [Apple forums: NBA content](https://developer.apple.com/forums/thread/130430), [Apple forums: 5.2.1](https://developer.apple.com/forums/thread/718427)
- [Google Play target SDK](https://developer.android.com/google/play/requirements/target-sdk), [Apple SDK minimums](https://www.developer.apple.com/news/upcoming-requirements/), [Capacitor 8 announcement](https://ionic.io/blog/announcing-capacitor-8)
