# Hoops Career, round 4: market and platform (`market-platform`)

I couldn't save this as `REPORT.md` in my scratch folder: the tool refused the write, so the full report is below instead. Logs (`*.log`), scripts and screenshots (`shots/`) are in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/1432d099-c3e8-46a9-bd36-274882ec0af2/scratchpad/review/market-platform/`.

**How I tested.**

- **The build.** `dist/` (built 11:21 today) is newer than every file in `src/`, `public/`, `index.html` and `vite.config.ts`, so it is HEAD 81f1bf6's code. I served it read-only, gzipped, on my own port (4910). A modified copy on port 4911 tested the update flow.
- **The driver.** Playwright at a 390×844 phone viewport, with my own profiles.
- **The load.** The machine's load average was 10 to 24 on 14 cores while the other reviewers ran. Every timing is wall-clock under that load.

---

## 1. Verdict

As software, Hoops Career is ready to ship:

- The start screen appears in 0.24 s.
- A whole regular season sims in about 11–13 s.
- It works fully offline, and saves survive a hard kill in the middle of a sim.
- An update installs itself the next time you leave the app and reopens the same screen.
- The main thread no longer freezes during a month sim.

As a product in a market, it has not moved since round 3:

- **No store-safe build.** Even the "Fictional league" uses the real NBA franchises. The real NBA history it ships with grew again, with a real record book.
- **No offer.** There is no price or edition plan.
- **No store paperwork.** There is no privacy policy and no store listing.
- **The hook is invisible.** The one thing no competitor has is the measured "why", and it doesn't appear in the first minute. A new player sees "a real NBA roster" and then has to cut two players.

The competition arrives on the same phones within two weeks: NBA 2K27 Arcade Edition on 5 Nov, FM27 Touch (with touchline instructions) on 10 Nov, and Basketball GM is now twice as fast and still free.

**Score: 6/10, unchanged.**

- **Platform: about 9** (round 3: 8.5). The freezes are gone, and surviving a kill mid-sim is now verified.
- **Market, legal and store readiness: about 3.5.** The same blockers, plus a little more NBA content.

---

## 2. What's genuinely great (protect these)

**Cold load** (`load.mjs`, `load-slow.log`):

| Network                                   | Start screen                              | Data before the start screen | Then                                                         |
| ----------------------------------------- | ----------------------------------------- | ---------------------------- | ------------------------------------------------------------ |
| Unthrottled                               | 243 ms (first paint with content: 188 ms) | 630 KB                       | Seed ready 0.22 s after New league; league created in 0.23 s |
| 1.6 Mbps, 150 ms latency, 4× CPU slowdown | 3.58 s                                    | 1.35 MB in 33 requests       | Seed 3.8 s; league created in 0.5 s                          |

**Sim speed in the browser** (production build; `sims.log`, `chain.log`):

| Step                 | Time                                                        |
| -------------------- | ----------------------------------------------------------- |
| Sim 1 day            | 0.24 s                                                      |
| Sim 1 week           | 0.41–0.56 s                                                 |
| Sim 1 month          | 1.5–2.3 s                                                   |
| Whole regular season | 11.6 s (season 1), 13.1 s (season 2), about 11 s (season 3) |
| Each offseason step  | 0.24–0.5 s                                                  |

**No more freezes during sims** (`tests2.log`):

- A month sim now causes zero long main-thread tasks.
- Main-thread response time: median 2 ms, 95th percentile 13 ms, worst 115 ms.
- Round 3 measured 1.19 s of freezes per month sim, the worst one 623 ms.

**A hard kill mid-sim is safe (now verified):**

- I killed the browser while the sim bar read "Sim to end of regular season… Day 1 of 65".
- On reopening, the league was exactly where it was before the sim (Feb 2, 28-24), with the same games saved and nothing corrupted.
- Round 3 could not land a kill mid-sim.

**Updates respect the player** (`update4.mjs`, `src/main.tsx:22-82`):

- When a new build is on the server, the app shows "Update downloaded: it goes in the next time you leave the app."
- When you next leave, it saves, reloads once and comes back to the same screen (`#/league`).
- It never updates during a sim, a live game or new-league setup.

**Fully offline** (`offline.mjs`):

- A reload while offline takes 57 ms.
- Every screen I tried opens offline, including the home-screen shortcuts: the old `#/tactics` link correctly lands on `#/team/tactics`.
- Starting a new real-roster league works offline.
- Zero failed network requests.

**Backups** (`tests2.log`, mid-season 4):

- Export took 0.34 s and produced a 2.54 MB gzipped file (12.7 MB of JSON).
- Import took 0.43 s and adds the league beside the original as "My League (imported)", never over it.

**Save size stays controlled** (one league, `chain.log`):

| Point                          | Saved data on the device |
| ------------------------------ | ------------------------ |
| New league                     | 2.7 MB                   |
| End of season-1 regular season | 7.7 MB                   |
| Start of season 2              | 12.8 MB                  |
| Start of season 3              | 14.4 MB                  |
| Start of season 4              | 17.6 MB                  |

That is about 2.4 MB a season. Opening a four-season league takes 137 ms.

**Privacy is a selling point:**

- There are no network calls and no analytics anywhere in `src/`.
- The iOS privacy manifest (`PrivacyInfo.xcprivacy`) declares nothing collected and no tracking.

**Web platform care:**

- On iPhone Safari (which deletes a site's saves after 7 days without a visit), Today asks the player to "Add to Home Screen to keep your league safe".
- On Chrome it offers a one-tap install (`InstallRow.tsx`).
- The app asks the browser not to evict its storage.

**First impression:** the start screen and the first-game Today card look like a sports-media product, not a spreadsheet (`shots/hook-01-start.png`, `shots/hook-08-today-after1.png`).

---

## 3. Findings

### 1. No store-safe edition: even "Fictional" is NBA property, and the real history keeps growing — P0 for the stores, P1 on the web

**What the player sees:**

- The start screen says "GM and head coach of a real NBA roster" (`Start.tsx:124`).
- The second choice in New League is "Fictional league: Real franchises, generated players" (`NewLeague.tsx:217-218`, `shots/hook-02-new.png`).
- History opens on "Before this league · Since 1946-47", with every Finals and MVP.
- The live score ticker shows an "NBA" tag (`ScoreTicker.tsx:63`), and the Cup final court is painted "NBA Cup" (`Live.tsx:260`).

**What's new since round 3:**

- A real single-game record book (`src/data/records.json`, 70 KB, back to 1996-97).
- `seedLoader.ts:13` now loads the seed, the history and the record book together for every league. A player who only wants the fictional league still downloads 2.74 MB of real NBA data, and the offline cache keeps it.

**Why it matters:**

- Using real players' names in groups needs the players' union's group licence. Licensed mobile games went through both the NBA and the union ([Pocket Gamer](https://www.pocketgamer.biz/news/72612/nifty-games-nba-licensing-deal/)).
- Team nicknames, "NBA Cup" and "NBA Finals" are league trademarks.
- Apple has rejected sports apps for references to real leagues and teams ([Apple developer forums](https://developer.apple.com/forums/thread/130430)).
- Until this changes, there can be no store release, Apple Arcade pitch or price.

**Recommendation (L):**

- A clean build flag with invented cities, nicknames, abbreviations, colours and arenas.
- Plain names for events ("Cup", "Finals", "All-League") and no NBA tag.
- The seed, history and record book left out of that build.
- Real rosters only as a league file the player imports, or on the web with a visible disclaimer.

### 2. The first minute shows "real NBA" and a roster cut, not the measured why — P1

**What a new player sees in the first 12 seconds** (`hook.mjs`, `shots/hook-01…06`):

1. The tagline.
2. "Teams 30 · Games 82 · Season 2026-27".
3. The owner's targets.
4. "Needs you: Release 2 players".

**Where the differentiator is:**

- The "why" (paired-game verdicts, the staff's measured reads) first appears one tap into the first game report.
- Today after game 1 shows a recap headline, not the why.
- The web app's store description doesn't mention it either: "Run an NBA franchise as GM and head coach. Deep tactics, real 2026-27 rosters." (`vite.config.ts:34`).

**Why it matters:** 2K Arcade and Basketball GM can both say "GM of a real NBA roster". "Tells you why, and proves it" is the line nobody else can say.

**Recommendation (S):**

- Tagline: "The basketball sim that tells you why you won, and proves it."
- Replace the stat strip with three proof points: "GM + head coach · every number measured · offline, no ads".
- Make the first-week guide's first card a tactic choice with a measured preview. Do the roster cut automatically, with an undo.

### 3. No offer, while competitors land on the same phones within two weeks — P1 (business)

- `package.json` is version 1.0.0, and there is no edition, purchase or tip code anywhere.
- **NBA 2K27 Arcade Edition** arrives 5 Nov and **FM27 Touch** 10 Nov, the latter with "instructions from the touchline" ([iPhone in Canada, 20 Oct 2026](https://www.iphoneincanada.ca/2026/10/20/nba-2k27-football-manager-27-apple-arcade-november-2026/)). Apple Arcade costs $6.99 a month ([MacTech](https://www.mactech.com/2025/10/16/nba-2k26-arcade-edition-now-available-on-apple-arcade/)).
- **Basketball GM** is free with real players built in. Its sim got "about twice as fast" on 21 Sep 2026, and the developer says it is "more popular and more profitable" than in 2021 ([zengm blog](https://zengm.com/blog/)).
- **Hoop Land** is free on iOS with a $4.99 Premium Edition, and $14.99 on Steam ([App Store](https://apps.apple.com/us/app/hoop-land/id1605197976), [Steam](https://store.steampowered.com/app/2453660/Hoop_Land/)).
- **FM26 Mobile** is Netflix-only, rated 4.5★ on iOS and 3.9★ over about 109K Google Play reviews ([App Store](https://apps.apple.com/ph/app/id6446123740)).

**Recommendation (M):**

- A free web edition: the clean fictional default, with real rosters by league file.
- A premium native app at $6.99–7.99, one-time, with no ads and no gameplay purchases. Those would contradict the honesty pitch, and an offline game has no server costs to cover.
- Optionally an Apple Arcade pitch as "the basketball FM", once Finding 1 is done.

### 4. Store paperwork is still missing — P1

- There is no privacy-policy or support link, no listing text, no screenshot set and no feature graphic. `resources/` holds only `icon.png`. Both stores require a privacy-policy link.
- iOS version numbers are hard-coded (`MARKETING_VERSION = 1.0`, `CURRENT_PROJECT_VERSION = 1`), while Android reads 1.0.0 from `package.json`.
- There is no iOS build in CI.
- The app is still on Capacitor 7.6.9, and an upload built with Apple's current iOS 26 SDK has not been tried.

**Recommendation (S):**

- A one-page policy ("nothing leaves your device"), linked from Settings → About.
- Take the iOS version from `package.json`.
- Add an iOS build job to CI.

### 5. Native saves live only in the app's web storage, close to Android's 25 MB backup limit — P1

- The app never writes save files to the device's own storage (`Directory.Data` is unused). The filesystem is only used to hand a backup to the share sheet (`backup.ts:80`).
- Android backup is on (`allowBackup="true"`) with no rules for what to include.
- One league reached 17.6 MB by season 4. With a second, imported league, saved data was 20.3 MB mid-season 4.
- Past 25 MB, Android's automatic backup silently stops. After that, uninstalling the app loses the career.

**Recommendation (M):**

- Write the gzipped export (about 2.5 MB at season 4) to device storage at each season rollover and when the app is put away.
- Add "Restore device copy" to the start screen.
- Add Android backup rules that include only that file.

### 6. The data's origins are still undocumented — P1 for any paid build

- The two "game files" that drive the ratings and every career line (`data/raw/games/`, about 1.4 GB) have no named source or licence in the README or the code.
- Sports Reference's terms forbid automated access without written permission and building a database that "competes with" theirs ([terms](https://www.sports-reference.com/termsofuse.html)).

**Recommendation:**

- (S) Add a source and terms column to the README's data table, and name where the game files come from.
- (M) For a paid build, use a licensed data feed or ship rosters only as user-imported files.

### 7. Phone landscape is unusable and tablets get one narrow column — P2 (still open)

- At 844×390, the top bar, the 46% hero card and the bottom bar fill the whole screen (`shots/layout-phone-land-today.png`).
- The app allows any orientation: the web manifest says `orientation: 'any'`, and the Android shell doesn't lock it.
- On a tablet in landscape, Team is a single column about 790 px wide, with empty margins on both sides (`shots/layout-tab-land-team.png`).

**Recommendation:**

- (S) Lock phones to portrait.
- (L) Two-pane tablet layouts, such as roster beside player and schedule beside report.

### 8. No sharing, no achievements, no faces — P2 (still open)

- Sharing exists only for backups.
- There are no achievements and no Game Center or Play Games support.
- A jersey icon stands in for every player's face.

**Recommendation:**

- (S–M) Share cards made from the final score and title moments.
- (S–M) Achievements built from the existing GM legacy cabinet.
- (M) Generated faces.

### 9. The app icon and the in-app logo are two different brands — P2

- The app icon is a black X with an arrow on a red block (`public/icon-192.png`). At home-screen size it reads as a "close" or "forward" button, not basketball.
- The start screen shows a line-drawn basketball instead.

**Recommendation (S):** use one mark everywhere, and make sure it reads as basketball at 48 px.

### 10. The background sim process holds about 220 MB after every sim — P3

- Browser memory is 255 MB at rest, 472 MB once the sim worker starts, and 523 MB after two month sims. It never goes back down (`mem.mjs`).
- The cause is a deliberate design: the worker keeps a full copy of the league so it can receive small updates (`simClient.ts:54-80`).
- The main thread's memory improved a lot: 52–59 MB at season 4, against 117–129 MB in round 3.
- **Why it matters:** on 3–4 GB Android phones, an app using about half a gigabyte in the background is among the first to be killed.

**Recommendation (S):** shut the worker down when the app is hidden or after about 60 s idle, and rebuild it on the next sim.

### 11. No league files, so there is no store-safe way to get real rosters — P2

- Import accepts only this game's own backups.
- God mode can rename teams, but only one at a time by hand.
- Hoop Land ships fictional leagues and community files add the real names. That is the real-roster route that survives store review.

**Recommendation (M):** a documented league-file format (teams, names, colours, players) with Share and Import options, and an official clean file as the default.

### 12. A crash mid-quarter silently rewinds the live game — P3 (still open)

- I killed the browser at Q1 10:42 (Detroit 2, Washington 6). Today then read "Live · Tied 0-0".
- A kill at the end of Q1 resumed exactly, at 38-33.
- A quarter took about 90 s of real time at the default speed.

**Recommendation (S):**

- Save the live game every ~20 possessions.
- Say "Picked up from Q1 12:00" when it has been rewound.

### 13. The start screen shows a frozen season, and every league is "My League" — P3 (still open)

- The start screen shows "Season 2026-27" above "Continue · 2029-30".
- The default league name is "My League" (`NewLeague.tsx:49`), so after an import the list reads "My League" and "My League (imported)".

**Recommendation (S):** default names like "Pistons 2026-27", and show the continuing league's season.

### 14. The "not affiliated with the NBA" disclaimer is buried — P3 (still open)

It sits inside a collapsed "Data sources" panel in Settings → About (`Settings.tsx:434`).

**Recommendation (S):** put it on the start screen, and also name the players' union and the sponsored arena names.

### 15. An update during a player's very first visit is never applied that session — P3 (new)

- On a first visit, the offline cache installs but doesn't take control of the open page.
- An update shipped during that visit still shows the "goes in the next time you leave the app" message, but leaving never reloads the app (`update3.mjs`: 0 reloads). The update only arrives on the next launch.

**Recommendation (S):** don't show the message in that case, or reload on leave anyway.

### 16. The sim engine is downloaded twice, and the start screen waits for it — P3

- The sim engine's code appears in both the app's entry file (1.17 MB, 420 KB gzipped) and the background sim process's file (766 KB, 279 KB gzipped).
- The first visit downloads 156 files for offline use: 6.68 MB raw, about 2.25 MB gzipped.
- On a low-end phone, processing 1.17 MB of code before the menu appears may cost around a second (an estimate).

**Recommendation (M):** load the engine and league code only when the player taps Continue or New league.

### 17. No diagnostics, and the Android build isn't minified — P3 (still open)

- There is no telemetry and no way to copy a diagnostic report, so crashes in the field are invisible.
- Android code shrinking is off (`minifyEnabled false`).

**Recommendation (S):** an opt-in "Copy diagnostic report" in Settings with version, build, save format, season phase and the last errors.

### 18. No rich install screen on Android — P3 (new)

The web app's manifest has no screenshots, so Chrome shows its basic install prompt rather than the store-like one.

**Recommendation (S):** add 3–5 portrait screenshots, led by the game report's "why" and the live staff call.

---

## 4. Since round 3

| Round-3 finding                                 | Status now                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Unlicensed NBA identity, no store-safe build | **Still open, a little deeper**: the new record book, all three data files load for every league, "Fictional" still uses real franchises.                                                                                                                                                                                        |
| 2. Public repo and website                      | Not re-checked (you already know). The new record book will be published wherever the repo is.                                                                                                                                                                                                                                   |
| 3. Data origins                                 | **Still open.**                                                                                                                                                                                                                                                                                                                  |
| 4. No offer                                     | **Still open.** The 5 Nov and 10 Nov Apple Arcade launches are confirmed.                                                                                                                                                                                                                                                        |
| 5. Hook "real NBA"                              | **Still open**: same tagline, same app description.                                                                                                                                                                                                                                                                              |
| 6. Sims 30–45% slower, UI freezes               | **Fixed, and the slowdown doesn't reproduce.** A month sim takes 1.5–2.3 s (round 3: 2.0–2.4 s) with no freezes (round 3: 1.19 s). Headless, alternating runs at the same load (three each): CPU time per season was 33.3 s at HEAD vs 32.3 s for round 3's code, about 3% more. The team's "~24% slower" note didn't reproduce. |
| 7. Saves only in the app's web storage          | **Still open**: 20.3 MB with two leagues, against the 25 MB backup limit.                                                                                                                                                                                                                                                        |
| 8. Store paperwork                              | **Still open.**                                                                                                                                                                                                                                                                                                                  |
| 9. Faces, community files, achievements, sync   | **Still open.**                                                                                                                                                                                                                                                                                                                  |
| 10. Sharing                                     | **Still open.**                                                                                                                                                                                                                                                                                                                  |
| 11. Phone landscape                             | **Still open.**                                                                                                                                                                                                                                                                                                                  |
| 12. Tablet single column                        | **Still open.**                                                                                                                                                                                                                                                                                                                  |
| 13. Icon vs in-app logo                         | **Still open.**                                                                                                                                                                                                                                                                                                                  |
| 14. Live game rewinds after a crash             | **Still open**: rewound from Q1 10:42 to 0-0. A kill at a break resumes correctly.                                                                                                                                                                                                                                               |
| 15. "My League" and frozen start-screen season  | **Still open.**                                                                                                                                                                                                                                                                                                                  |
| 16. Disclaimer buried                           | **Still open.**                                                                                                                                                                                                                                                                                                                  |
| 17. Memory grows over seasons                   | **Partly fixed.** The main thread's memory halved (52–59 MB). Browser memory with the worker running is higher: 472–617 MB in my runs, against round 3's peak of 376 MB (Finding 10).                                                                                                                                            |
| 18. Unminified build, no diagnostics            | **Still open.**                                                                                                                                                                                                                                                                                                                  |
| Kill mid-sim unverified in round 3              | **Now verified safe.**                                                                                                                                                                                                                                                                                                           |
| Strengths: offline, backups, cold load          | **Held or improved**: offline reload 57 ms; season-4 backup exported in 0.34 s and imported in 0.43 s; start screen 243 ms.                                                                                                                                                                                                      |

**What the last two rounds changed for this lens:**

- **Good:** the season forecast is calibrated and checked in CI, and the staff no longer claims results from tallies. That makes the "honest numbers" hook stronger. Tactic edits now survive closing the app.
- **Bad:** more NBA content (the record book), and the first-visit update gap (Finding 15).
- **Untouched:** no Android, iOS, manifest or offline-cache files changed since round 3 (`git diff --stat 295684b HEAD`).

---

## 5. What it would take to reach 9/10 in this lens

1. **A clean edition (L).** Invented franchises and arenas, no "NBA" wording, and the real data left out of the bundle. Real rosters only by imported league file, or on the web with a disclaimer up front. This unlocks both stores, an Arcade pitch and any price; nothing below matters commercially without it.
2. **Put the hook in the first minute and in every store asset (S–M).** The new tagline, a first card that is a tactic choice with a measured preview, and screenshots led by the report's "why" and the live staff call. This is the reason to switch from Basketball GM or 2K Arcade.
3. **The offer and paperwork (M).** A $6.99–7.99 premium app with no ads or in-app purchases, a privacy page, iOS versioning and CI, a decision on Capacitor 8, and the listing text. Ideally before the November Arcade window closes.
4. **Protect careers on the device (M).** An automatic save file in device storage at each rollover and when the app is put away, a restore option, and backup rules. This prevents the genre's worst review: "lost my 10-season save".
5. **Growth and table stakes (S–M).** Share cards, achievements, generated faces, one brand mark, tablet layouts.

**One-line positioning:** "The basketball sim that tells you why you won, and proves it: GM and head coach on your phone, offline, no ads."

**Who it's for:** sim-literate fans playing in short phone sessions. Basketball GM players who want coaching and reasons, and FM players who want basketball.

| Product                  | Price / platform                              | Real NBA?                                               | Coaching depth                        | Explains why?     |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------- | ------------------------------------- | ----------------- |
| **Hoops Career**         | Web app; native apps unreleased; no price     | Real 2026-27 rosters and history since 1947, unlicensed | Deep, live staff voice                | **Yes, measured** |
| Basketball GM            | Free web; about 2× faster since Sep 2026      | Built-in real players back to 1947                      | Light                                 | No                |
| NBA 2K27 Arcade Edition  | Apple Arcade, $6.99/mo, 5 Nov                 | Licensed, adds the WNBA                                 | The Association mode                  | No                |
| NBA 2K27 MyNBA (console) | Full price                                    | Licensed; 100-year Legacy, GM Trust                     | Deep                                  | No                |
| FM26 Mobile / FM27 Touch | Netflix / Apple Arcade (10 Nov)               | Licensed football                                       | The benchmark; touchline instructions | Partly            |
| Hoop Land                | iOS free + $4.99; Steam $14.99 (Early Access) | Fictional plus community files                          | Playable 2D, light GM                 | No                |

---

## 6. What I couldn't verify, and how I tested

**Scripts (all in my scratch folder):**

| Script                                                                              | What it covered                                                  |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `load.mjs`                                                                          | Cold load, fast and throttled                                    |
| `sims.mjs`, `advance.mjs` (run by `chain.sh`)                                       | Four seasons in the UI (Pistons, 2026-27 to 2029-30)             |
| `jank.mjs`, `throttle.mjs`, `backup.mjs`, `kill.mjs` (sim and live), `killlive.mjs` | Freezes, CPU throttling, backups, crash recovery                 |
| `update3.mjs`, `update4.mjs`                                                        | The update flow, using a modified copy of the build on port 4911 |
| `offline.mjs`                                                                       | Offline reload, screens and shortcuts, a new league offline      |
| `layouts.mjs`                                                                       | Four tablet and landscape sizes                                  |
| `hook.mjs`, `hook2.mjs`                                                             | The first minute and the first game                              |
| `records.mjs`                                                                       | The History page                                                 |
| `mem.mjs`                                                                           | Main-thread and worker memory                                    |
| `openlat.mjs`                                                                       | Time to open a large save                                        |

**Headless runs:**

- `season-test.ts 2`: 19.3 s and 15.1 s per season. OKC went 68-14 and 66-16, so the OKC dominance is still there (a sim-credibility issue, outside this lens).
- An alternating speed comparison of round 3's code against HEAD (`ab.log`, `ab2.log`). Round 3's code came from `git archive 295684b`, extracted into my scratch folder.

**Screens visited:** `/start`, `/new`, `/`, `/team`, `/team/tactics`, `/tactics`, `/league`, `/league/history`, `/office`, `/settings`, `/games`, `/live`.

**What I couldn't verify:**

- **Real phones and Safari.** Playwright has no WebKit browser installed here, and CPU throttling doesn't reach the sim worker. Phone speed and iPhone behaviour are untested.
- **iOS 14–15.** The iOS app says it supports iOS 14, but the build uses newer JavaScript and background workers. Sims fall back to the main thread if the worker fails, but if the code can't load at all the screen would be blank. Untested.
- **Native builds.** I built no Android or iOS app, and didn't test Android's automatic backup on a device.
- **The "~24% slower" note.** It didn't reproduce. Wall-clock times swung by about ±8 s per season at this load, so I compared CPU time instead.
- **Legal conclusions** need a lawyer.

**Repo and cleanup:**

- I changed nothing in the repo. `git status` shows an untracked `review/round-4/` folder that I didn't create.
- My two servers are stopped, and my browser profiles and temporary copies are deleted.
