# Game-day visuals review (2026-11-10)

**Score: 64 / 100 strict · about 70 as a game.**

Scope: visuals only, on the live game (`/live`) and the screens on either side of it (matchup preview,
intro, breaks, huddle, final). Seen by eye on two full games (MIL at WAS, TOR at WAS) at 375×812,
844×390 landscape and 1280×800, plus a code read of `src/ui/live/**`, `teamColors.ts` and DESIGN.md.
Not seen by eye: 1920×1080, reduced motion, dark OS theme, the playoff and Cup floors.

## Scorecard

| Area                                      | Weight |  Score | One line                                                                |
| ----------------------------------------- | -----: | -----: | ----------------------------------------------------------------------- |
| Court, players and motion                 |     30 |     20 | Clean, smooth and readable, but half court only and the swaps are muddy |
| Scorebug and broadcast graphics           |     15 |     11 | Best part: a real broadcast bug. No score pop, banners stack            |
| Team colour identity                      |     10 |      5 | One team can wear three colours on one screen                           |
| Console views (Now/Players/Tactics/Stats) |     15 |     11 | Consistent Hardwood cards, but a 300px window under the court           |
| Breaks, huddle, final                     |     10 |      5 | The court disappears into paper text; no buzzer moment                  |
| Responsive (phone, sideways, desktop)     |     10 |      7 | Layouts hold; the sideways console is one card tall                     |
| Accessibility and motion polish           |     10 |      5 | Reduced motion drops every play label; sub-12px canvas text             |
| **Total**                                 |    100 | **64** |                                                                         |

## What works

- **The scorebug.** An ink bar with team slabs, big condensed scores, mono clock, labelled timeouts
  and fouls, a Bonus chip, a run line ("WAS 10-2" in amber) and a win bar. It reads like TV.
- **The floor.** A maple canvas with planks, the home team's paint in the key and centre circle,
  their mark at centre court and boards behind the baseline. It looks like a place, not a diagram.
- **Motion.** Players glide on Hermite curves, the ball spins and casts a shadow, shots arc with a
  trail, the net sways on a make and the rim shakes on a miss. At 1× it is calm and legible.
- **On-court captions.** One pill at the bottom-left says the play ("P&R: Young + Sarr vs drop"),
  with ink pills over the action for STEAL, MISS, +3, TEAM REBOUND.
- **The intro.** "Season opener at Capital One Arena" over a dimmed court, the two starting fives
  side by side in team colours. A strong first frame.
- **One system.** The console, sheets and post-game pages all use the Hardwood paper, ink pills and
  Archivo heads. Nothing looks borrowed from another app.
- **Desktop.** At 1280×800 the court sits left and the scorebug and console sit right. It is the
  best-looking layout of the three.

## Problems, worst first

### P1 · The court

1. **Half court only, every possession.** Both teams attack the one basket at the top
   (`Court.tsx:41-48`). Nobody runs the floor, so "pushes it in transition", fast breaks and
   steals that go the other way all look like half-court sets. This is the single biggest gap
   between the captions and the picture.
2. **Possession changes show 20 players.** The 200 ms cross-fade (`Court.tsx:55-56, 181-211`)
   leaves the old ten at half alpha under the new ten. In stills it reads as ghosts. A cut, or
   the old ten fading faster, would be cleaner.
3. **Offence and defence look alike.** The only difference is a 0.32-alpha ink ring
   (`Court.tsx:554-560`). With TOR red vs WAS navy-with-red-trim, both sides carry red and the
   tokens blur together on maple.
4. **Clusters at the rim.** On drives and rebounds 4-6 tokens stack into one blob (seen at 5:04 Q1
   and 4:16 Q4); numbers and the ball-handler tag overlap. No nudge-apart pass.
5. **The playback overlay sits on the action.** The 88px red pause and the skip button land on the
   top of the key, where most of the play is. The scrim darkens the court but not the captions
   (z 2 under z 3, `court.css:16, 166`).
6. **Two overlays at once.** A caption plus a stat banner ("Scoring · Jaquez Jr. has scored MIL's
   last 9 points", "Shooting · Coulibaly 4 of 4") stack over the lower third of the court and
   cover players. DESIGN.md says one banner at a time.
7. **Captions sit on the centre-court mark.** The caption pill and the ball-handler tag both
   collide with the WAS logo at the bottom of the floor.
8. **Empty court when paused by a stop.** After the injury stop the floor showed no players at all.
9. **Nothing changes for clutch time.** At 4:16 Q4, down 8, the court, the colours and the bug look
   the same as 12:00 Q1. There is no crowd, no tightening of the graphics, no light change.
10. **The ball moves in straight lines on passes.** Every shot uses the same 7 ft arc, whatever the
    distance (`Court.tsx:283`).

### P1 · Team colours

11. **Milwaukee is three colours on one screen.** The clash check (`teamColors.ts:61`, RGB distance
    under 90) calls MIL green vs WAS navy a clash. `matchupLooks` falls through to Milwaukee's third
    colour, **#006db1 blue**, for the scorebug and the preview slab. `jerseyColors` puts them in
    **white** on the court, and the lower third uses `teamLook` with no clash check, so it is
    **green**. The Bucks were blue, white and green within one frame.
12. **The key is the home team's, not yours.** DESIGN.md:327 says "your colours painted in the key".
    The code paints the home team (`Court.tsx:8, 325-330`). On the road you play on their paint.
    Either is fine; the doc and code disagree.
13. **The win bar does not match the slabs.** `nightFill` lifts WAS navy to a muddy #526f90
    (`ScoreBug.tsx:102`).
14. **The possession dot vanishes with a white kit.** A white dot in a white ring looks the same as
    the no-team fallback (`court.css:33-41`).

### P2 · Breaks, huddle and final

15. **Every break throws the court away.** Timeout, end of quarter and the huddle replace the court
    with a paper page of headings and sentences. The period report has no line score, no chart and
    no court. It is the most broadcast moment and it looks like a settings page.
16. **"What's deciding it" uses red and green dots with no key.** "Big edge" in red and "Edge" in green
    sit side by side, and it isn't clear whose edge each colour means.
17. **No buzzer.** Both games left the court for the Games page with no final frame on the floor.
    There is no horn, no freeze and no score slam.
18. **The loser's score is low contrast.** On the final slab the losing figure is pale grey on navy
    or red, so "123" barely reads.

### P2 · Console and responsive

19. **The console is a 300px window.** In portrait the court takes about 60% of the screen and the
    console scrolls in what is left. Players, Tactics and Stats each show about 2.5 rows before
    scrolling.
20. **Sideways, the console is one card tall** (844×390).
21. **Smaller court is letterboxed.** It floats with paper gutters and a hairline frame instead of
    filling the width.
22. **Likely desktop overflow at 1920×1080 (from code, not seen):** the stage width formula
    (`landscape.css:23`) can exceed what fits beside the 320px console inside the 1240px `main`.
23. **Ticker gaps.** The scores ticker showed an empty "NBA" item at 3/10 and a Q2 score during our
    Q3.
24. **Mono for sentences.** The Skip ahead sheet sets its descriptions in IBM Plex Mono, which
    DESIGN.md keeps for figures.

### P2 · Accessibility and motion

25. **Reduced motion hides every play label** (`Court.tsx:295`). STEAL, +3 and FOUL are lost, not
    just made still. Players also jump between spots every few hundred ms.
26. **Canvas text under 12px.** Baseline boards and floor name are about 9px on a phone, and the
    name tag is 10.5px (`Court.tsx:367, 633, 691`). Floor name on the apron is 3.67:1.
27. **Focus rings disappear on ink.** `--accent-text` on the playback plates (`tokens.css:247`).
28. **Layout-triggering animation.** `.lv-stage` animates `width` (`page.css:39`), which resizes and
    redraws the canvas floor every frame of the toggle. `.lv-slow` animates `top`.
29. **Off-system values.** Canvas colours hard-coded, a second amber for hot players (#ffb21e vs
    `--warn`), the 532/494 ratio copied in three files, all-caps play labels against the
    sentence-case rule.

## Top six fixes, in order

1. **Show transition.** Let the camera (or the token set) flip ends on a change of possession, with a
   short run up the floor on fast breaks and steals. Closes the biggest caption/picture gap.
2. **One colour per team per game.** Make `jerseyColors`, the lower third and the scorebug read from
   one `matchupLooks` result, and loosen CLASH (or use a perceptual distance) so green vs navy isn't
   a clash.
3. **Split offence and defence.** Solid fill for offence, outlined or hollow tokens for defence, plus a
   small collision nudge so rim clusters read.
4. **Keep the court in the breaks.** Show the frozen court (or a shot chart in team colours) at the
   top of the period report and the huddle, with a line score under the bug.
5. **A final frame.** Freeze the floor at 0:00 with the final score over it for a beat before the
   report.
6. **Reduced motion keeps the labels.** Show them still instead of dropping them.

Doing 1-4 would likely move this to the high 70s.
