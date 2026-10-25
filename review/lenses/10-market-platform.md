# Hoops Career: market and platform review (`market-platform`)

REPORT.md was not written: the harness refuses report files from sub-agents. This message is the full report. The repo is untouched (`git status` is clean), and I stopped my own static server.

Screenshots are in `/private/tmp/claude-501/-Users-kiarash--claude-spares-spare-hVNZPT/b285bc02-5a07-46d5-a46e-e152c55fa3b7/scratchpad/review/market-platform/shots/`. Shot names below drop that prefix.

## 1. Verdict

The engineering platform under Hoops Career is unusually good. The production build loads in 0.2 s locally and about 3 s on emulated slow 4G. It creates a league in 0.3 s and sims a full regular season in about 8 s of compute. It works fully offline. It survives a reload in the middle of a sim or a live game with no corruption, and a backup round-trips in under 1 s. That makes it faster and sturdier than most of the category.

As a product to ship and sell, it is not ready, for two reasons:

- **The pitch rests on IP it has no license for.** The hook is the real 2026-27 NBA: real players, team names, colours, sponsor-named arenas, the "NBA Cup" and "NBA Finals". The only fallback, "Fictional league", still uses the real franchises.
- **The native shells are stale and do not meet store rules.**
  - Android targets API 35, but Google Play has required API 36 since 31 Aug 2026.
  - Android builds an APK only, and Play requires an AAB.
  - iOS forces Dark mode while the app is a light design.
  - The icon and splash are from an older dark design ("Night Edition"), not the current light "Hardwood" look.

The differentiation is real and defensible: a basketball sim that explains _why_, GM and head coach in one, mobile-first, offline, no ads, no account. But there is no monetization design and no sharing loop.

**Score: 6/10.** Platform about 8.5. Market and store readiness about 3.5, until the IP path and the native shells are fixed.

## 2. What's genuinely great (protect these)

- **Speed.** On an M4 Pro, prod `dist/`:
  - Sims: 1 day ≈ 200 ms, 1 week ≈ 420 ms, 1 month ≈ 1.1 s. A whole regular season is ≈ 8.2 s of sim spread over 5 staff-call stops, and the playoffs ≈ 1.8 s.
  - Offseason phase changes take 0.4–1.2 s.
  - The sim runs in a worker; a 4× CPU throttle on the page barely changed it (1 week 719 ms vs 422 ms).
  - Basketball GM and Draft Day Sports are slower per season, so this is a selling point ("a season in seconds").
- **Offline-first PWA that really works.** The service worker precaches 146 files. Offline reload of `/`, `/team`, `/league`, `/office`, `/office/trade`, `/league/history` and `/settings` all rendered (`p3-01-offline-reload.png`). Updates are deferred until the app is left and saved (`src/main.tsx:24-74`), never mid-sim or mid-game.
- **Save robustness.**
  - Reloading during "Sim to end of regular season" (simbar "Day 10 of 174"), or killing the browser mid-sim, rolled back cleanly to the pre-sim state, with no corruption.
  - Reloading mid-live-game resumed with an honest toast: "Picked up from the last save, Q1 12:00: 10 possessions back." (`p1-15-live-after-reload.png`).
  - Other safeguards: season snapshots, revision checks across two windows, a quota-error message, and offering an export when a save fails.
- **Backup and import.**
  - Export took 233 ms and produced a 12.96 MB JSON after one season.
  - Import took 514 ms. It never overwrites: a duplicate becomes "My League (imported)" (`p3-10-start-3leagues.png`).
  - The share sheet is used on phones and inside the native app (`src/state/backup.ts:28-55`).
- **Privacy as a feature.** There are zero network calls after load, no analytics SDKs, and no account. On the App Store this qualifies for a "Data Not Collected" privacy label, a real differentiator against free-to-play GM apps.
- **Thoughtful native touches.**
  - The Android Back button closes the top sheet first and saves before exiting (`src/native.ts:42-56`).
  - The league is flushed on `pause` (`src/native.ts:58`).
  - There are 12 haptic call sites, covering moments, agenda actions and live coaching.
- **Store-screenshot material already exists:**
  - the player card with the giant #30 and OVR tile (`p6-player.png`);
  - the live court with win-probability bar and assistant voice (`p1-14-live-12s.png`);
  - the "Thunder erase 21-point deficit, beat Pacers" result hero (`p1-12-after-midsim-reload.png`);
  - the "While you were away" digest with the staff's one-tap calls (`p1-11-simbar-midsim.png`);
  - the cap sheet (`p7-stuck-1792899038558.png`).
- **The first 30 seconds are fast.** Main menu → New league → pick team → name → Today is 4 taps plus typing a name, with 0.3 s of creation and a clear 3-step progress bar (`p1-02b-newleague-full.png`, `p1-03-chooseteam.png`).

## 3. Findings

### 1. The product's main promise depends on unlicensed NBA and NBPA IP, and the "fictional" path doesn't remove it

**Severity: P0 for store release; P1 for the web.**

**What the player sees.** The start screen says "GM and head coach of a real NBA roster" (`p1-01-start-settled.png`). New League leads with "Real 2026-27 NBA · 544 real players and their contracts". The alternative is "Fictional league: Real franchises, generated players". It still shows Lakers name, colours and jerseys (`p3-09-fictional-roster.png`) and "Los Angeles Lakers" on the start card.

**Evidence:**

- The manifest and meta description read "Run an NBA franchise as GM and head coach. Deep tactics, real 2026-27 rosters." (`vite.config.ts:34`, `index.html:12`).
- "NBA Cup" appears 83 times and "NBA Finals" 18 times in `src/`.
- The live ticker shows an "NBA" chip.
- All 30 sponsor naming-rights arenas are hard-coded (`src/core/teams.ts:31-408`, e.g. `'Paycom Center'` :291, `'Crypto.com Arena'` :200). They surface in copy: "Milestone watch at Paycom Center" (`p1-15-live-after-reload.png`).
- The only disclaimer ("Not affiliated with the NBA or its teams", `src/ui/screens/Settings.tsx:401`) is collapsed under Settings → League → About → Data sources.

**Why it matters:**

- The NBPA controls group licensing of player names (generally three or more players).
- Team nicknames and "NBA Cup/Finals" are NBA Properties trademarks.
- Arena names are sponsor marks.
- App Review guideline 5.2.1 "resembles third-party teams/leagues" rejections are common, and a disclaimer is not accepted as proof of rights.
- Facts (stats, schedule, results) carry much less risk than names and marks.

**Recommendation (M–L), in three layers:**

- **(a) Store builds.** Default to a fictional league.
  - Give it fictional franchises: city plus an invented nickname, abbreviation and colours. The God-mode team editor already supports name, abbreviation and colours (`src/ui/god/TeamEditor.tsx`).
  - Use generic arena names.
  - Rename "NBA Cup" → "In-Season Cup", "NBA Finals" → "Finals".
  - Remove "NBA" from the name, subtitle, keywords, description and screenshots.
- **(b) A user-imported "league file"** for real names, as Basketball GM, Hoop Land and OOTP do. The backup format already is one.
- **(c) Keep the real seed on the web PWA** only with a visible disclaimer, and revisit licensing once traction justifies it.

### 2. The data-source terms may forbid a commercial release built on this seed

**Severity: P1.**

**Evidence.** The seed is calibrated from:

- Basketball Reference;
- NBA.com play-by-play and stats.nba.com;
- an ESPN injury mirror;
- RealGM pick ownership scraped through a third-party repo;
- Dunks & Threes' subscription-only EPM projection. README:121-127 says it is "exported by hand", committed under `data/epm/projection/`, and used as the value target of the engine calibration for every rating.

**Why it matters.** Several of these sources restrict commercial reuse, and an EPM subscription is almost certainly a personal licence. A paid app whose ratings derive from paid data, plus redistribution of the CSV in the repo, is a likely cease-and-desist separate from the NBA/NBPA.

**Recommendation (S to audit, M to fix):**

- Record each source's terms in README → Real data.
- Get Dunks & Threes' permission, or drop the EPM target from commercial builds.
- Move the CSV out of any public repo.

### 3. Android shell can't be submitted to Google Play today

**Severity: P1.**

**Evidence:**

- `android/variables.gradle` has `targetSdkVersion = 35`. Play has required API 36 for new apps and updates since 31 Aug 2026; the extension runs only to 1 Nov 2026.
- `.github/workflows/android.yml` builds APKs only (`assembleDebug`/`assembleRelease`). New Play apps need an AAB.
- `versionName "1.0"` is hard-coded.
- `minifyEnabled false`.
- Without keystore secrets, each CI build is signed with a new debug key, so updating means uninstalling, which deletes saves (README:209).

**Recommendation (S):**

- Target and compile SDK 36, then recheck edge-to-edge.
- Add a `bundleRelease` step that produces an `.aab`.
- Take `versionName` from `package.json`.
- Make the release keystore mandatory before any public build.

### 4. iOS shell is stale: forced Dark mode, an old-design splash and icon, no app privacy manifest

**Severity: P1.**

**Evidence:**

- `ios/App/App/Info.plist` sets `UIUserInterfaceStyle = Dark`, but `index.html` declares `color-scheme: light` and the app is light bone paper. The share sheet, Import file picker, keyboard and alerts will render dark over a light app.
- `LaunchScreen.storyboard:18` uses `systemBackgroundColor` (black under forced Dark).
- The splashes are black with an orange ball and a _serif_ wordmark (`ios-splash.png`, `android-splash.png`), left over from the earlier dark design. The web view then paints `#f3efe7`, so every launch goes black → bone with an off-brand logo.
- The icon (`public/icon.svg`, `ios-icon.png`) is a flat orange ball on near-black. It matches neither the in-app Hardwood mark nor README:106's "coach's chalk, an X and a play" description.
- iPhone landscape is enabled.
- There is no app `PrivacyInfo.xcprivacy`, although `@capacitor/filesystem` is used (`backup.ts:31`). Capacitor's guidance is to declare the file-timestamp reason; verify with an App Store Connect upload.
- There is no `ITSAppUsesNonExemptEncryption` key, so every upload gets the export-compliance prompt.

**Recommendation (S–M):**

- Light style, and launch background `#f3efe7`.
- Regenerate the icon and splashes from a Hardwood mark (`scripts/qa/native-assets.mjs` exists).
- Add the privacy manifest and the encryption key.
- Lock iPhone to portrait.

### 5. Native saves live only in WebView IndexedDB

**Severity: P1.**

**Evidence.** In the native shells the league lives only in the WebView's IndexedDB (`src/state/persistence.ts:92`). Filesystem is used only to stage a share (`Directory.Cache`). Capacitor's storage guidance warns that web storage in the native shell can be reclaimed by the OS, especially on iOS.

`android:allowBackup="true"` relies on Auto Backup, which caps at 25 MB. IndexedDB measured 14.0 MB by the start of season 3 (about +3.2 MB a season), so the cap is exceeded around season 5.

**Why it matters.** Losing a multi-season career is the genre's unforgivable bug, and it produces "lost my 10-year save" 1-star reviews.

**Recommendation (M).** Keep a native rolling autosave (gzipped `exportLeague` JSON) in `Directory.Data` each season and on `pause`. Offer "Restore from device copy" on the start screen.

### 6. On the web, Safari players can lose everything after 7 days away, and the first backup prompt comes a season too late

**Severity: P1.**

**Evidence:**

- There is no install prompt and no Add-to-Home-Screen guidance anywhere in `src/`.
- Safari evicts IndexedDB for sites not visited in 7 days unless installed to the Home Screen.
- `persist()` is requested (`main.tsx:78`). My Chromium profile showed `persisted: false`.
- `backupDue` only asks from season 2 (`backup.ts:94-96`, `league.season > league.startSeason`). A season-1 Safari-tab player who takes a week off loses everything, with no warning.

**Recommendation (S):**

- On iOS Safari, when not standalone, show a one-time row on Today: "Add to Home Screen to keep your league safe". Hook `beforeinstallprompt` on Android.
- When `persist()` is denied, ask for a backup after the first month of season 1.

### 7. There is no monetization design, and the obvious "roster update pass" is blocked by IP

**Severity: P1 (business).**

**Evidence.** The package is private at version 1.0.0. There is no purchase flow, store build or data-update channel: zero `fetch(` calls, and the seed is frozen at 2026-27 opening night.

**Why it matters.** The fair, expected models in this niche are:

| Model                                    | Price anchor                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Premium one-off                          | Hoop Land: free + $4.99 Premium; FM Touch on Apple Arcade; Pro Basketball Manager $29.99 on PC |
| Ad-free web with optional supporter tier | Basketball GM model                                                                            |
| Yearly edition                           | FM / 2K cadence                                                                                |

A "real-roster season pass" sells exactly the unlicensed thing (Finding 1).

**Recommendation (M).** Recommended model:

1. Free fictional web PWA, no ads.
2. Store app at a one-time ~$7.99–9.99, with no gameplay IAP.
3. An optional yearly edition ("Hoops Career 27") from the `data:build` pipeline.
4. An optional supporter tip.

Never sell any of these:

- ratings or boosts;
- sim speed or energy;
- draft or pack luck;
- difficulty relief;
- God mode;
- ads between sims.

### 8. No way to share a moment, so no word-of-mouth loop

**Severity: P2.**

**Evidence.** Share is used only for backups (`backup.ts:33,38`). The "Champions" moment, the game headlines and the player card can't be shared.

**Recommendation (S–M).** Add a "Share" button on the report hero, title and season moments, and the player card. Render a 1080×1350 PNG of the existing slab, watermarked with "Hoops Career" and the URL. Reddit and Discord (r/BasketballGM, r/HoopLand) are where this genre grows.

### 9. Tablet and landscape are a stretched phone; iPhone landscape is nearly unusable

**Severity: P2.**

**Evidence:**

- **Tablet portrait (820×1180).** The Today hero card stretches the full width in a single column (`p3-11-tablet_.png`). README's "same column, centred" is true on desktop (`p3-11-desktop_league.png`) but not on tablet.
- **Phone landscape (844×390).** The Continue bar plus tab bar take ~190 of 390 px, leaving just the hero visible (`p3-11-phoneland_team.png`). The manifest says `orientation: 'any'`, and the iOS plist allows landscape.
- **320×568.** There is no horizontal overflow, but zero roster rows show above the fold (`p3-11-small_team.png`).

**Recommendation:**

- (S) Lock phones to portrait, and cap the content column at about 640 px on tablet.
- (L, later) A two-pane tablet layout for Roster/Player, Trade, and Standings.

### 10. Saves and backups are bigger than they need to be

**Severity: P2.**

**Measurements:**

| When              | IndexedDB | Backup file |
| ----------------- | --------- | ----------- |
| Creation          | 1.8 MB    | —           |
| End of season 1   | 7.8 MB    | 12.96 MB    |
| Start of season 2 | 10.8 MB   | 5.0 MB      |
| End of season 2   | —         | 16.4 MB     |
| Start of season 3 | 14.0 MB   | 5.4 MB      |

At the end of season 1 the stores were: games (1,322 records) ≈ 9.7 MB of JSON, league 3.3 MB, snapshot 2.4 MB. README:206's "about 0.4 MB a season" holds for the league record, not for what the device stores.

**Recommendation (S–M):**

- Gzip backups with `CompressionStream` and accept both formats on import; expect about 85% smaller.
- Prune old box scores and play-by-play on device after the season rollover.
- Correct the README number.

### 11. Reload or crash mid-sim silently throws away the sim

**Severity: P2.**

**Evidence.** I reloaded 350 ms into "Sim to end of regular season" (simbar "Day 10 of 174"). The league returned at Oct 20, 0-0, with no message (`p5-02-after-reload.png`). Closing the browser mid-sim gave the same result. The live game, by contrast, explains its rollback.

**Why it matters.** On a desktop a season is ~8 s, so this is minor. On a low-end phone the season could take ~30–40 s (my estimate), and a background kill means a rerun with different results and no explanation.

**Recommendation (S–M).** Checkpoint the worker's league every ~2 sim-weeks, and show a toast after a rollback.

### 12. Live-game resume can go back a whole quarter

**Severity: P3.**

**Evidence.** Checkpoints are written only at breaks, on pause, with moves, and when the app is hidden (`src/state/live.ts:303-308`). Twelve seconds of watching lost 10 possessions. An OOM kill or browser crash loses up to a quarter.

**Recommendation (S).** Also checkpoint every ~20 possessions.

### 13. Store metadata leans on "NBA"; the actual hook is buried

**Severity: P2.**

**Evidence.** The tagline "GM and head coach of a real NBA roster…" describes the mode. The real differentiator, "a tactics layer that tells you _why_ things happen" (README:3), appears on no first screen and not in the manifest.

**Recommendation (S).** Store-safe hook: **"The basketball sim that tells you why you won."** Subtitle: "GM + head coach. Deep tactics. Offline, no ads."

First three screenshots:

1. The live court with the assistant.
2. The "staff's call" digest.
3. The player card.

### 14. The icon doesn't stand out in a store full of orange balls

**Severity: P2.**

**Evidence.** The icon is a generic flat orange ball on black, while the in-app identity (black Archivo type on bone paper plus team-colour blocks) is far more distinctive.

**Recommendation (S).** Build the icon from the Hardwood system: bone background, black "HC" or a chalk X-and-O, and one colour block. Test it at 60 px against competitors.

### 15. Multiple saves all default to "My League"

**Severity: P3.**

**Evidence.** The list shows "My League", "My League (imported)" and "My League" (the fictional Lakers league). The backup is named `hoops-career-my-league-2027.json`.

**Recommendation (S).** Default the name to "Thunder 2026-27" and mark fictional leagues "(fictional)".

### 16. Missing table stakes vs the genre: faces, community files, sync, achievements

**Severity: P2 (market).**

**Evidence:**

- Players are a jersey glyph plus text (`p6-player.png`). Basketball GM has cartoon faces and Hoop Land has pixel players.
- There is no league-file sharing beyond backups, no cross-device sync, and no Game Center / Play Games achievements.

**Recommendation:**

- (M) Deterministic SVG faces or silhouettes coloured by team.
- (S) "Share league file" that reuses the backup.
- (M) Achievements tied to the existing Big moments.
- (L, later) Optional iCloud or Drive sync.

### 17. The first load pulls the whole app and seed, then precaches 7.4 MB

**Severity: P3.**

**Measurements** (prod `dist/`, with a 4× CPU throttle):

| Network                     | Time to usable start screen |
| --------------------------- | --------------------------- |
| None (localhost)            | 551 ms                      |
| Fast 4G (9 Mbps / 60 ms)    | 850 ms                      |
| Slow 4G (1.6 Mbps / 150 ms) | 3.15 s                      |

About 1.3 MB of gzipped files is transferred before the start screen is usable. The service worker then precaches 146 files (7.4 MB).

**Bundle sizes:**

| File                        | Raw        | Gzipped |
| --------------------------- | ---------- | ------- |
| `seed`                      | 1.99 MB    | 410 KB  |
| `index`                     | 992 KB     | 355 KB  |
| `sim.worker`                | 631 KB     | 229 KB  |
| `vendor`                    | 199 KB     | 66 KB   |
| `Live`                      | 149 KB     | 52 KB   |
| main CSS                    | 133 KB     | —       |
| Archivo woff2 (two subsets) | 90 + 86 KB | —       |

**Recommendation (S).** Load the seed only for New League (Continue doesn't need it), and lazy-load the `latin-ext` font subset. Note: `dist/` dates from 18:15 and HEAD from 23:02, so these sizes are slightly stale.

### 18. Ratings risk: what a store reviewer or rater will flag

**Severity: P3.**

**Evidence.** Content is mild (4+ / Everyone): no violence, gambling, chat or purchases. The issues are branding that imitates the league and the buried disclaimer.

**Recommendation (S).** Put "Not affiliated with the NBA, NBPA or any team" on the start screen footer and in the store description.

### 19. Android release build ships unminified and with no crash signal

**Severity: P3.**

**Evidence.** `minifyEnabled false`. There is no crash or ANR reporting, which is privacy-good but leaves no field signal. An ErrorBoundary exists (`App.tsx:621,645`).

**Recommendation (S).** Add "Copy diagnostic report" in Settings → About: version and build, save format, the last 20 console errors, and the league phase and day.

## 4. Top 5 moves

1. **Make a store-safe default league (Finding 1).** Fictional franchise names, colours and arenas, "Cup" and "Finals" without "NBA", and real names only through a user-imported league file or the web build. Size: L. Impact: it is the precondition for any store release and removes the takedown risk.
2. **Fix the native shells (Findings 3, 4, 14).** API 36 plus AAB plus a mandatory release key; iOS Light mode, privacy manifest and portrait lock; a Hardwood icon and splash. Size: S–M. Impact: Android becomes submittable now, and the first launch looks like the product.
3. **Make saves loss-proof (Findings 5, 6, 10).** A native autosave to `Directory.Data`, gzipped backups, an iOS Safari install prompt, and a backup prompt in season 1. Size: M. Impact: prevents the most damaging review in the genre.
4. **Set the price and the hook (Findings 7, 13).** Free fictional web PWA, plus a ~$7.99–9.99 premium store app with no gameplay IAP, plus a yearly edition. Lead with "tells you why you won". Size: S–M. Impact: a clear, honest offer for Basketball GM, FM and MyNBA players.
5. **Add share cards, then faces (Findings 8, 16).** Size: S–M. Impact: an organic acquisition loop, and humans in the store screenshots.

## 5. Competitor comparison

**Who it's for.** Sim-literate NBA fans aged 18-40 who play on their phones in short sessions: Basketball GM players who want coaching and an explanation of why, FM fans who love basketball, and MyNBA players who want depth away from the console.

**One-sentence hook.** _"The only basketball sim that tells you why you won: GM and head coach on your phone, a season in seconds, offline, no ads."_

| Product                                                                                  | Platform / price (Oct 2026)              | Real NBA data                                                                                                           | GM + coach depth                                              | Explains _why_        | Mobile / offline                 | Vs Hoops Career                                                                 |
| ---------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------- | -------------------------------- | ------------------------------------------------------------------------------- |
| **Hoops Career**                                                                         | PWA + Capacitor (unreleased)             | Real 2026-27 seed, unlicensed                                                                                           | GM + head coach, tactics, live coaching                       | **Yes, core feature** | Phone-first, fully offline       | —                                                                               |
| Basketball GM                                                                            | Free web / PWA                           | Random by default; "Real Players" mode **omits real team names, logos and photos by default**; community files add them | Deep GM, light coaching                                       | No                    | Web, offline                     | The IP model to copy; huge community; little coaching                           |
| Football Manager 26 (PC) / FM26 Mobile (Netflix-only) / FM26 Touch (Apple Arcade)        | Paid / subscription                      | Licensed (soccer)                                                                                                       | Benchmark tactics + GM                                        | Partly                | Mobile via subscription services | Sets the "tactics matter" bar; no basketball equivalent, which is the gap       |
| NBA 2K27 MyNBA / MyGM                                                                    | Console/PC, full price                   | Fully licensed                                                                                                          | Deep (CBA negotiation, GM Trust, 4-team trades, second apron) | No                    | Not mobile                       | Licensed but slow, console-bound, opaque                                        |
| Hoop Land                                                                                | iOS free + $4.99 Premium; Steam paid     | Fictional + community rosters                                                                                           | Light GM, playable 2D                                         | No                    | Mobile, offline                  | Mobile price anchor and community-file model; arcade-first                      |
| Pro Basketball Manager 2026                                                              | PC/Mac, $29.99 list                      | Licensed Europe (53 teams, BCL); no NBA licence confirmed                                                               | Deep GM + tactics, 3D                                         | Some                  | No mobile                        | Closest serious sim; PC only                                                    |
| Draft Day Sports: Pro Basketball 2026                                                    | PC (Steam, 5 Nov 2025)                   | Fictional default + community files                                                                                     | Deep text GM                                                  | No                    | No mobile                        | Hardcore text-sim audience; dated UI                                            |
| Ultimate Pro Basketball GM / Basketball Legacy Manager 26 / Franchise Basketball: Pro GM | Mobile free + IAP ($1.99–$14.99 bundles) | Mostly fictional or "inspired by"                                                                                       | Shallow to medium                                             | No                    | Mobile                           | Free-to-play competition; position against it as the honest premium alternative |
| Sorare NBA / fantasy apps                                                                | Free + paid cards                        | Licensed real-world stats                                                                                               | None                                                          | No                    | Mobile                           | A different job; a possible "what-if" companion                                 |

- **Differentiated:** the explanation layer and staff voice, GM and coach in one, speed, offline and privacy-first, a polished mobile UI, and real opening-night contracts, picks, schedule and Cup (defensible only on the web or with a licence).
- **Table stakes it lacks:** faces, community files, store presence, achievements, sync, sharing.
- **Liabilities:** unlicensed NBA and NBPA IP on the first screens, data-source terms (especially the EPM target), and stale native shells.

## 6. What I couldn't verify, and how I tested

**How I tested.**

- I served the existing prod `dist/` read-only from my own static server on port 4399 and drove it with Playwright at 390×844 (mobile, touch). I also ran 820×1180, 1180×820, 844×390, 1440×900 and 320×568, and compared load against the dev server.
- The scripts are in `/private/tmp/claude-501/-Users-kiarash--claude-spares-spare-hVNZPT/b285bc02-5a07-46d5-a46e-e152c55fa3b7/scratchpad/review/market-platform/`:
  - `p1-load.mjs`: cold load, CPU throttling, network throttling, creation, storage.
  - `p2-sim.mjs`: sim timings, live reload, a full season plus playoffs, store sizes.
  - `p3-platform.mjs`: offline, export/import, multiple saves, fictional league, layouts.
  - `p4-midsim.mjs` and `p5-reload.mjs`: reload and browser kill mid-sim, the Stop button.
  - `p6-store.mjs`: store-candidate screens.
  - `p7-offseason.mjs`: two seasons and two offseasons, backup growth.
- Routes visited: `/start`, `/`, `/team`, `/team/tactics`, `/player/:id`, `/league` (standings, playoffs, awards, history), `/games`, `/office`, `/office/trade`, `/office/resign`, `/office/free-agents`, `/settings?tab=league`, `/live`.
- Seasons simmed: 2 full seasons plus offseasons (Thunder, Normal), and one more full season in another profile.

**What I couldn't verify.**

- **Real phone performance.** CPU throttling slowed only the page; the sim worker was effectively unthrottled, so phone sim times are estimates.
- **The native apps themselves.** I built no APK or IPA (read-only rule). Haptics, Back button, the share-sheet backup, the status bar and WebView storage eviction are checked from code only.
- **iOS Safari specifics.** Eviction and `persist()` weren't tested on a device.
- **Legal and store specifics.** ITMS-91053 for the Filesystem plugin, the exact data-source terms and licensing costs need an App Store Connect upload or a lawyer.
- **Competitor details.** Basketball GM's ad/supporter pricing, Hoop Land's Android price, Draft Day Sports' price and Pro Basketball Manager's NBA naming were not confirmed.
- **Build freshness.** `dist/` is about 5 hours older than HEAD.

**Sources:**

- [Hoop Land App Store](https://apps.apple.com/app/id1605197976), [Hoop Land IAP tracker](https://apppricinglab.com/iap/apple/1605197976)
- [Basketball GM real-players data](https://basketball-gm.com/manual/customization/team-player-data-real/), [Basketball GM Chrome Web Store](https://chrome.google.com/webstore/detail/basketball-gm/mjkkihncmpbegfapfieiamdkgliooecl)
- [Pro Basketball Manager 2026, Steam](https://store.steampowered.com/app/3585230/), [gg.deals](https://gg.deals/steam/app/3585230/)
- [Draft Day Sports: Pro Basketball 26](https://gmgames.org/?p=20217), [isthereanydeal](https://isthereanydeal.com/game/draft-day-sports-pro-basketball-2026/info/)
- [FM26 out now (Mobile on Netflix, Touch on Arcade)](https://www.footballmanager.com/index.php/news/football-manager-26-out-now-across-platforms)
- [NBA 2K27 MyNBA](https://nba.2k.com/2k27/features/mynba/)
- [Ultimate Pro Basketball GM](https://apps.apple.com/app/id1552760865), [Franchise Basketball: Pro GM](https://apps.apple.com/app/id1433795761), [Basketball Legacy Manager 26](https://apps.apple.com/app/id6749378039)
- [Google Play target API requirements](https://developer.android.com/google/play/requirements/target-sdk), [Play Console help](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Apple forums: NBA content](https://developer.apple.com/forums/thread/130430), [Apple forums: 5.2.1](https://developer.apple.com/forums/thread/718427)
- [NBPA group licensing (SBD)](https://www.sportsbusinessdaily.com/Daily/Issues/2017/02/16/Marketing-and-Sponsorship/NBPA.aspx)
