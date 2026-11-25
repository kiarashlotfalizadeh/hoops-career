# Hoops Career playtest: shared brief

You are one of ten playtesters. Each plays the game as a different player from the target audience, then writes an honest report. A lead will merge the ten reports, so stick to the report format at the bottom.

## The audience you speak for

Hardcore basketball fans aged 18 to 40. They want Football Manager-level coaching depth, franchise rebuilds, modern analytics and honest offline sims. They know the genre: Football Manager 26/27, Basketball GM, NBA 2K MyNBA/MyGM, Hoop Land, Draft Day Sports: Pro Basketball and Pro Basketball Manager. They are hard to impress, and they also play for fun. Your report is your experience as a player, not a code review.

## The game

Hoops Career is a mobile-first basketball GM and head-coach game. It is an offline PWA with a possession-by-possession engine and a tactics layer that tries to tell you why things happen. It starts in the 2026-27 season. You can pick real rosters (on teams with invented nicknames and arenas) or a fictional league in the same 30 cities. Your role is either "GM + Head Coach" or "GM only". The game's three pillars are Gameday, Tactics and Transactions. Its stakes are the owner's goals, job security and the locker room. The CBA is simple: soft cap, luxury tax, one mid-level a season, Bird rights, 125% salary matching, and two- and three-team trades.

## How you play (headless phone browser)

- The production build is served at **http://127.0.0.1:5197**. Never stop or restart it. Don't start other servers, don't build, and don't change anything in the repo.
- Use the kit at `/tmp/claude-0/-home-user-hoops-career/ab24f4d7-2083-5558-9c59-0f226efc62e3/scratchpad/playtest/kit/kit.mjs`. Read it first, since it is short. It gives you:
  - `launch(profileDir, {width,height})`: a persistent Chromium profile. Your save lives in IndexedDB there, so every script you run continues the same career.
  - `newCareer(page, {kind, conf, team, role, coach})`.
  - `go(page, '/route')`, `read(page)` (the screen's text), `shot(page, path)`, `status(page)`.
  - `playOptions(page)` (lists the Play sheet's options), `play(page, 'Sim 1 week')`, `waitSim`.
  - `clearMoments(page)`, which returns the text of the full-screen story moments it dismisses. Log them, because they are part of the experience.
  - `set3D(page, on)`.
  - `page.errors`, which collects page and console errors.
- Your folder is `/tmp/claude-0/-home-user-hoops-career/ab24f4d7-2083-5558-9c59-0f226efc62e3/scratchpad/playtest/players/<your NN-slug>/`. Put your scripts, your `profile/` dir and your screenshots there. Write your report to `/tmp/claude-0/-home-user-hoops-career/ab24f4d7-2083-5558-9c59-0f226efc62e3/scratchpad/playtest/reports/<NN-slug>.md`. **Also return the full report as your final message.**
- Your scripts must import the kit by its absolute path. Run them with `node yourscript.mjs` from your folder. Keep each script under about 8 minutes (the Bash timeout is 10 minutes). Play in sessions: one script per sitting, and read the output before deciding the next move, the way a player would.
- **Look at the game.** Take screenshots and open them with the Read tool (it shows images). Judge what a player sees, not only the DOM text. Use `getByRole` / `getByText` to click things, and read the screen text to find out what's there.
- Main routes:
  - Home/Today: `/`. Preview: `/preview`.
  - Team: `/team`, `/team/rotation`, `/team/lineups`, `/team/tactics`.
  - Another team: `/team/<tid>`, with `?tab=scouting` for scouting. Game plan: `/gameplan/<tid>`.
  - League: `/league`, `?tab=stats`, `?tab=ratings`. History: `/league/history`, `/history?view=records`.
  - Office: `/office`, `/office/trade`, `/office/free-agents`, `/office/draft`.
  - Other: `/inbox`, `/settings`, `/player/<pid>`, `/compare?a=&b=`.
  - Use the app's own navigation too. A real player taps; they don't type routes.
- The calendar moves through the **Play options** sheet (the arrow on the Continue bar). Its options include "Start regular season", "Sim to next game", "Watch & coach live", "Sim 1 week / 1 month / to trade deadline / to end of regular season", plus the playoff and offseason steps. Big sims stop on their own for staff calls, trade offers, injuries and the deadline. Handle what comes up the way your persona would. If Play is disabled, the Today screen says what is required first.
- **Speed:** a new career takes about 5-60 s to create. The machine has 4 CPU cores shared by ten testers, so expect sims to run slower than the numbers below when everyone is busy. A week sims in about 1-2 s. A full regular season takes well under a minute. Live games are slower, so use the live game's "Skip ahead" menu when you've seen enough of one.
- **Live games:** headless Chromium draws the 3D court at 3-4 fps, so the kit turns 3D off and you watch the 2D court. Only the game-day tester judges the 3D look, from screenshots.
- **Don't read** `review/`, any memory files, or other testers' folders. Stay unanchored. You may read `src/` only to confirm or explain a bug you hit in play, after you hit it.
- **Never kill, stop or restart any process** (no `pkill`, `killall` or `kill`, and nothing that matches `headless_shell` or `chromium`). Nine other testers share this machine, and killing browsers ends their sessions. Close only your own browser, with `close()` in a `finally` block. If one of your scripts hangs, let the Bash timeout end it.
- Testers 03 and 07 may also run read-only repo checks (`npm run season-test`, `npm run real-check`) from the repo dir, at most twice each. Nobody else runs repo scripts.

## Play like a person

Make real decisions with a plan, the way your persona would. Keep a play log as you go: date in game, what you did, what you expected and what happened. Note when you felt clever, bored, confused, cheated or hooked. Write down numbers: records, ratings, salaries, win chances, sim times and stats. "Extremely comprehensive" means you play deep into your persona's area and touch the rest of the game too. Don't stop at the first season unless your persona says so.

## Report format (markdown, about 1,500-2,500 words)

```
# NN — <persona>
## Who I am and what I played
team, role, league kind, seasons and games played, live games coached, device size, rough time spent
## Play log
the 10-20 beats that mattered, good and bad, with game dates and numbers
## Scores
| Area | Score /10 | Why (one line) |
A First hour (hook + learnability)
B Coaching depth (tactics, rotation, game plans) vs FM
C Game day (live coaching: feel, and does it matter)
D Front office (trades, free agency, draft, cap/CBA)
E Rebuild & development (youth growth, draft, patience)
F Analytics (depth, usefulness, correctness)
G Sim honesty & realism (stats, outcomes, no rubber-banding, long-run world)
H Stakes & story (owner, job, playoffs, history, moments)
I UX & feel on my device
J Overall for this audience
(Score only what you really exercised. Write N/A otherwise.)
## What hooked me (top 5, each with evidence)
## What pushed me away (top 5, each marked dealbreaker / major / minor, with evidence)
## Bugs (repro steps, screenshot path)
## Against the genre (FM / BBGM / MyNBA / Hoop Land: where it wins and loses for me)
## Would I pay and keep playing
$7.99 phone unlock? $14.99 on Steam? Hours I'd put in. Recommend to a friend, 0-10.
## The one change that would most raise my score
```

Be blunt and specific. Praise that isn't earned is useless to the lead. So is a complaint without evidence.
