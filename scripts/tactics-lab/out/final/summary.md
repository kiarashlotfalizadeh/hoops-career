# Tactics lab: final

Engine commit 3bf220c (with uncommitted changes under src/), node v23.10.0. Runtimes: levers 16.7s, coverage 13.7s, league 46s, whole run 47.1s (12 workers, league part beside the lab parts). Started 2026-11-10T12:02:30.268Z.

Re-run: `npx tsx scripts/tactics-lab/run.ts <label>` (all three parts; `levers.ts`, `coverage.ts`, `league.ts` alone; `--quick` for small sizes).

## Part 1: levers

200 paired games in each of 6 matchups (side A first; seeds CLE-GSW 4247, LAL-PHI 4255, ATL-BOS 4242, TOR-CHA 4269, DEN-OKC 4249, NYK-MIL 4261). Net is side A's change in points per 100 possessions against its own settings, the mean of the six paired deltas; ± is that mean's standard error. "+/6": matchups where it came out positive. "Inert": matchups where the patched games were exactly the base games (the setting changed nothing there). The other columns are mean changes: possessions a game, rates in percentage points (3PA rate, rim share and FT rate per FGA, TOV per possession, ORB%, eFG).

Base (six matchups averaged): side A net +4.27, 97.0 possessions. Side A: 3PA rate 0.412, rim 0.300, FT rate 0.260, TOV 0.132, ORB 0.260, eFG 0.561. Opponents: 3PA rate 0.466, rim 0.258, FT rate 0.226, TOV 0.132, ORB 0.238, eFG 0.542.

The teams' own settings (offensive/defensive preset, scheme, coverage): CLE helio/drop (man, drop); GSW balanced/blitz (man, blitz); LAL grind/drop (man, drop); PHI helio/drop (man, drop); ATL balanced/switch (man, switch); BOS helio/drop (man, drop); TOR balanced/drop (man, drop); CHA helio/switch (man, switch); DEN grind/hedge (man, hedge); OKC helio/ice (man, ice); NYK grind/ice (man, ice); MIL grind/drop (man, drop).

Reading across runs: two runs (other seeds, or another engine) don't share their games, so a setting's net differs between them by about √2 × its SE by chance alone (here 0.57 for the median SE): differences under about 1.1 per 100 are noise.

| Setting | Net/100 | +/6 | Inert | A poss | A 3PAr | A rim | A FTr | A TOV | A ORB | A eFG | Opp poss | Opp 3PAr | Opp rim | Opp FTr | Opp TOV | Opp ORB | Opp eFG |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| pace 0 | -0.47 ± 0.42 | 1/6 |  | -3.7 | -0.1 | +0.0 | +0.0 | +0.4 | +0.0 | +0.3 | -3.7 | +0.1 | +0.1 | -0.4 | -0.1 | -0.3 | +0.2 |
| pace 100 | +0.29 ± 0.40 | 4/6 |  | +5.5 | -0.0 | +0.3 | +0.5 | -0.3 | +0.1 | -0.4 | +5.4 | +0.0 | -0.0 | +0.3 | +0.1 | +0.2 | -0.3 |
| transition 0 | -0.49 ± 0.38 | 1/6 |  | -0.8 | +0.3 | -2.0 | -0.4 | +0.3 | +0.0 | +0.1 | -0.9 | +0.1 | +0.1 | -0.1 | -0.1 | -0.1 | -0.1 |
| transition 100 | -0.17 ± 0.34 | 3/6 |  | +0.7 | +0.0 | +0.6 | -0.1 | -0.0 | +0.1 | -0.1 | +0.6 | -0.0 | +0.1 | +0.1 | -0.1 | -0.0 | +0.0 |
| threePoint 0 | -0.38 ± 0.41 | 2/6 |  | +0.2 | -11.6 | +2.5 | +2.2 | -0.0 | -0.5 | -0.5 | +0.2 | +0.2 | -0.5 | -0.1 | +0.1 | -0.2 | -0.3 |
| threePoint 100 | +0.01 ± 0.40 | 2/6 |  | +0.2 | +7.9 | -0.8 | -0.7 | +0.1 | -0.2 | -0.1 | +0.1 | +0.1 | +0.1 | +0.0 | -0.1 | -0.0 | -0.1 |
| rimAttack 0 | -0.27 ± 0.38 | 2/6 |  | -0.0 | +2.5 | -2.9 | -1.1 | +0.1 | +0.1 | -0.1 | -0.0 | -0.1 | -0.0 | +0.2 | -0.1 | -0.2 | -0.2 |
| rimAttack 100 | +0.45 ± 0.36 | 3/6 |  | +0.5 | -1.5 | +1.4 | +0.9 | +0.1 | -0.1 | +0.2 | +0.5 | +0.1 | +0.0 | +0.4 | +0.0 | +0.0 | -0.1 |
| crashBoards 0 | -1.05 ± 0.38 | 1/6 |  | +0.6 | +0.5 | -0.4 | +0.2 | -0.3 | -6.2 | +0.3 | +0.6 | -0.2 | -0.1 | +0.2 | +0.1 | -0.0 | -0.9 |
| crashBoards 100 | -1.26 ± 0.38 | 0/6 |  | -0.1 | -0.1 | +0.2 | +0.2 | +0.1 | +1.1 | -1.1 | -0.1 | +0.1 | +0.0 | +0.6 | -0.0 | +0.1 | +0.0 |
| getBack 0 | -0.46 ± 0.39 | 1/6 |  | +0.4 | -0.0 | -0.0 | +0.2 | +0.1 | +0.3 | +0.3 | +0.5 | +0.1 | +0.7 | +0.6 | +0.1 | +0.0 | +0.5 |
| getBack 100 | +0.54 ± 0.36 | 5/6 |  | +0.0 | +0.2 | -0.2 | -0.0 | +0.0 | -1.9 | +0.3 | -0.0 | +0.2 | -0.7 | -0.5 | +0.1 | +0.0 | -0.3 |
| iso 0 | +0.14 ± 0.40 | 3/6 |  | +0.0 | -0.5 | +0.8 | -0.3 | +0.2 | -0.0 | +0.3 | -0.0 | +0.1 | -0.2 | -0.2 | -0.0 | -0.1 | -0.0 |
| iso 100 | +0.30 ± 0.41 | 3/6 |  | +0.0 | +0.3 | -1.0 | +0.7 | -0.2 | +0.3 | -0.3 | -0.0 | +0.1 | -0.0 | +0.4 | -0.1 | -0.2 | -0.1 |
| post 0 | -0.07 ± 0.38 | 3/6 |  | -0.0 | +0.6 | -0.0 | +0.0 | +0.0 | +0.2 | +0.0 | -0.1 | +0.0 | +0.0 | -0.0 | -0.0 | +0.3 | +0.1 |
| post 100 | +0.17 ± 0.39 | 5/6 |  | +0.1 | -1.3 | +0.2 | +0.4 | -0.0 | +0.0 | -0.0 | +0.1 | +0.0 | -0.0 | +0.1 | +0.0 | -0.0 | -0.1 |
| pnr 0 | -1.85 ± 0.45 | 1/6 |  | +0.1 | -4.4 | +2.8 | -1.8 | +0.4 | +0.2 | -0.9 | +0.0 | -0.1 | +0.1 | -0.2 | -0.1 | -0.1 | -0.1 |
| pnr 100 | +0.00 ± 0.42 | 4/6 |  | +0.1 | +1.7 | -1.4 | +0.9 | +0.0 | -0.2 | -0.2 | +0.0 | -0.1 | -0.0 | -0.2 | -0.1 | -0.2 | -0.1 |
| handoff 0 | +0.14 ± 0.42 | 4/6 |  | -0.0 | -0.9 | -0.4 | +1.1 | +0.3 | +0.2 | +0.1 | -0.1 | +0.1 | -0.1 | -0.2 | +0.0 | -0.1 | -0.0 |
| handoff 100 | -0.28 ± 0.41 | 3/6 |  | +0.2 | +1.1 | +0.5 | -1.1 | +0.0 | -0.1 | -0.4 | +0.1 | -0.1 | +0.0 | +0.1 | -0.1 | -0.1 | -0.2 |
| motion 0 | +0.39 ± 0.45 | 3/6 |  | +0.0 | +3.4 | -3.1 | +3.2 | -0.2 | +0.3 | -0.8 | -0.0 | +0.1 | -0.1 | +0.1 | +0.0 | -0.1 | -0.2 |
| motion 100 | -0.40 ± 0.43 | 2/6 |  | +0.2 | -2.1 | +1.3 | -0.5 | +0.4 | -0.2 | +0.2 | +0.2 | -0.1 | +0.1 | +0.1 | +0.0 | -0.2 | -0.0 |
| help 0 | -1.54 ± 0.41 | 0/6 |  | -0.0 | +0.2 | -0.3 | +0.0 | +0.1 | +0.1 | +0.2 | -0.1 | -9.3 | +5.8 | +3.4 | -0.0 | -0.5 | +1.4 |
| help 100 | -1.56 ± 0.42 | 1/6 |  | +0.1 | -0.1 | +0.3 | +0.0 | -0.0 | +0.3 | +0.5 | +0.1 | +7.2 | -2.9 | -3.3 | -0.3 | -0.0 | +1.4 |
| pressure 0 | +0.33 ± 0.39 | 4/6 |  | -0.2 | +0.1 | -0.2 | +0.0 | +0.1 | +0.2 | +0.1 | -0.2 | +0.6 | -0.8 | -2.5 | -1.3 | -0.1 | -0.9 |
| pressure 100 | -2.07 ± 0.42 | 1/6 |  | +1.0 | +0.2 | -0.1 | +0.1 | +0.0 | -0.1 | +0.1 | +0.9 | -2.0 | +2.9 | +3.5 | +3.0 | -0.1 | +4.1 |
| physicality 0 | +0.81 ± 0.36 | 5/6 |  | +0.0 | +0.1 | -0.1 | +0.1 | -0.1 | +0.1 | +0.3 | -0.0 | -0.3 | +0.3 | -4.3 | -0.0 | +0.1 | +0.6 |
| physicality 100 | +0.57 ± 0.36 | 4/6 |  | +0.1 | +0.2 | +0.0 | +0.2 | +0.0 | +0.1 | -0.0 | +0.1 | +0.1 | -0.2 | +5.0 | -0.1 | -0.1 | -1.0 |
| press afterMade | -0.88 ± 0.45 | 2/6 |  | +3.0 | -0.2 | +0.4 | +0.4 | +0.1 | -0.1 | -1.8 | +3.0 | -0.4 | +3.2 | +0.7 | +1.4 | -0.1 | -0.3 |
| press always | -3.07 ± 0.47 | 1/6 |  | +3.6 | +0.3 | +0.2 | -0.2 | +0.4 | -0.5 | -2.7 | +3.7 | -0.3 | +3.5 | +1.5 | +1.6 | +0.7 | -0.4 |
| mentality -2 | -0.25 ± 0.41 | 2/6 |  | -2.1 | -0.8 | -0.8 | -0.1 | -0.2 | -1.9 | +0.3 | -2.1 | +0.4 | -0.6 | -1.7 | -0.5 | -0.1 | -0.4 |
| mentality +2 | -1.43 ± 0.42 | 2/6 |  | +2.4 | +0.9 | +0.2 | +0.4 | +0.9 | +1.5 | -0.5 | +2.4 | -0.3 | +0.9 | +2.3 | +1.0 | -0.3 | +1.0 |
| drop | +0.78 ± 0.31 | 2/6 | CLE-GSW LAL-PHI TOR-CHA | +0.1 | +0.0 | +0.1 | +0.2 | +0.0 | +0.1 | -0.0 | +0.0 | +1.8 | -1.9 | -0.8 | +0.2 | -0.2 | -0.2 |
| hedge | +0.60 ± 0.36 | 5/6 | DEN-OKC | +0.2 | -0.1 | +0.2 | +0.1 | +0.0 | +0.1 | -0.1 | +0.1 | -0.6 | +2.1 | +0.9 | +0.5 | -0.4 | +0.0 |
| ice | +0.67 ± 0.37 | 4/6 | NYK-MIL | +0.2 | +0.1 | +0.0 | +0.4 | -0.0 | -0.2 | +0.1 | +0.2 | +2.1 | -0.7 | -0.0 | +0.1 | -0.4 | -0.0 |
| blitz | +0.04 ± 0.41 | 3/6 |  | +0.7 | +0.1 | +0.3 | +0.2 | -0.1 | +0.2 | +0.3 | +0.6 | +2.5 | +2.6 | -0.3 | +3.5 | -0.4 | +3.6 |
| switch | +0.38 ± 0.40 | 3/6 | ATL-BOS | +0.3 | -0.2 | -0.2 | +0.3 | +0.0 | +0.3 | +0.0 | +0.3 | -5.1 | +2.0 | +1.5 | -0.2 | +0.5 | -0.5 |
| zone23 | -0.55 ± 0.44 | 3/6 |  | -0.7 | -0.2 | +0.1 | -0.0 | +0.1 | +0.3 | +0.2 | -0.7 | +6.8 | -3.1 | -3.0 | +0.9 | +3.5 | -0.1 |
| zone32 | -0.77 ± 0.45 | 0/6 |  | -0.6 | -0.0 | -0.0 | +0.2 | -0.2 | +0.1 | +0.1 | -0.6 | -3.4 | +4.8 | +0.9 | +0.5 | +4.8 | -0.9 |
| box1 | -0.81 ± 0.43 | 3/6 |  | -0.3 | -0.2 | +0.3 | +0.1 | +0.1 | +0.4 | -0.0 | -0.3 | +6.5 | -2.2 | -2.9 | +0.7 | +1.0 | +0.9 |
| tri2 | -0.95 ± 0.43 | 2/6 |  | -0.2 | +0.0 | +0.1 | -0.1 | +0.1 | +0.0 | +0.0 | -0.2 | +3.8 | +0.1 | -1.4 | +1.0 | +1.9 | +0.5 |
| starPlan double | -0.07 ± 0.41 | 3/6 |  | +0.4 | +0.0 | +0.1 | +0.2 | -0.0 | +0.2 | +0.4 | +0.4 | +2.3 | +1.1 | -1.4 | +1.4 | -0.2 | +2.1 |
| switchOffBall true | +0.47 ± 0.39 | 3/6 | ATL-BOS | +0.0 | +0.1 | -0.0 | +0.3 | +0.0 | -0.0 | +0.2 | -0.0 | -0.4 | +0.1 | +1.0 | +0.3 | +0.5 | +0.0 |
| huntMismatch true | +0.33 ± 0.39 | 4/6 |  | -0.0 | -0.1 | -0.1 | +0.4 | -0.1 | -0.0 | +0.1 | -0.1 | +0.1 | -0.0 | -0.3 | +0.0 | +0.1 | +0.1 |
| shape fiveOut | +0.04 ± 0.36 | 4/6 |  | +0.3 | -0.1 | +0.7 | +0.5 | -0.1 | -1.2 | +0.2 | +0.3 | -0.2 | +0.1 | +0.1 | -0.0 | -0.2 | +0.1 |
| shape horns | +0.09 ± 0.44 | 3/6 |  | +0.3 | +0.2 | -1.2 | +0.8 | -0.0 | +0.0 | -0.1 | +0.2 | +0.1 | +0.0 | +0.3 | +0.0 | +0.1 | -0.1 |
| shape twoIn | +0.28 ± 0.37 | 4/6 |  | -0.1 | -0.1 | -0.3 | +0.1 | +0.0 | +1.1 | -0.3 | -0.1 | -0.1 | +0.0 | -0.4 | +0.0 | -0.1 | +0.0 |

Per matchup (net per 100, side A):

| Setting | CLE-GSW | LAL-PHI | ATL-BOS | TOR-CHA | DEN-OKC | NYK-MIL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| pace 0 | -1.41 | -1.06 | -0.24 | -0.01 | +1.39 | -1.52 |
| pace 100 | +0.54 | +1.15 | -1.04 | -0.66 | +1.55 | +0.18 |
| transition 0 | -0.45 | -0.04 | -0.48 | -1.47 | +0.57 | -1.05 |
| transition 100 | -1.24 | +0.28 | +0.63 | -0.18 | +0.14 | -0.62 |
| threePoint 0 | -1.01 | +1.72 | -1.03 | -0.45 | +1.25 | -2.76 |
| threePoint 100 | -0.24 | +0.56 | -0.42 | -0.23 | +0.75 | -0.35 |
| rimAttack 0 | -0.79 | -0.33 | +0.74 | -1.57 | +0.95 | -0.63 |
| rimAttack 100 | -0.57 | -0.15 | +1.12 | +0.19 | +2.55 | -0.42 |
| crashBoards 0 | -1.72 | -0.83 | -1.71 | +0.14 | -0.08 | -2.09 |
| crashBoards 100 | -1.32 | -0.85 | -2.62 | -1.24 | -0.21 | -1.35 |
| getBack 0 | -1.79 | -0.26 | -0.13 | -0.70 | +0.68 | -0.54 |
| getBack 100 | +0.76 | +0.65 | +0.33 | +0.32 | +2.27 | -1.12 |
| iso 0 | -0.64 | +0.94 | +1.00 | -1.23 | +0.85 | -0.06 |
| iso 100 | -0.30 | +0.91 | +0.34 | -1.03 | +2.06 | -0.15 |
| post 0 | +0.01 | +0.39 | -0.07 | -0.88 | +0.92 | -0.78 |
| post 100 | -1.05 | +0.26 | +0.45 | +0.41 | +0.56 | +0.38 |
| pnr 0 | -6.71 | -1.56 | -0.11 | -0.83 | +0.10 | -1.98 |
| pnr 100 | -0.84 | +0.97 | +0.05 | +0.42 | +0.76 | -1.36 |
| handoff 0 | -0.47 | +0.31 | +0.40 | -0.85 | +1.19 | +0.23 |
| handoff 100 | -1.63 | +0.69 | -0.39 | +0.77 | +0.72 | -1.86 |
| motion 0 | -0.73 | +0.44 | -0.54 | +1.96 | +2.57 | -1.37 |
| motion 100 | -1.56 | -0.95 | +0.39 | -1.27 | +1.94 | -0.93 |
| help 0 | -0.88 | -1.20 | -2.24 | -0.10 | -3.16 | -1.69 |
| help 100 | +0.65 | -1.23 | -3.24 | -2.73 | -0.62 | -2.18 |
| pressure 0 | +0.46 | +0.92 | +1.67 | -2.54 | +1.61 | -0.17 |
| pressure 100 | -2.43 | -4.16 | -3.63 | +2.63 | -2.78 | -2.04 |
| physicality 0 | +0.07 | +1.55 | -0.12 | +1.86 | +1.30 | +0.21 |
| physicality 100 | +0.88 | -0.53 | +1.98 | +0.68 | +0.65 | -0.26 |
| press afterMade | -1.42 | -1.36 | +0.55 | +4.69 | -4.89 | -2.83 |
| press always | -4.19 | -2.92 | -1.40 | +1.58 | -6.95 | -4.56 |
| mentality -2 | -0.72 | -0.96 | +0.89 | -1.09 | +1.33 | -0.93 |
| mentality +2 | -2.96 | -1.67 | -1.66 | +1.50 | +0.21 | -4.00 |
| drop | inert | inert | +3.08 | inert | +2.08 | -0.49 |
| hedge | +0.58 | +0.28 | +2.11 | +0.45 | inert | +0.16 |
| ice | +0.51 | +1.79 | -0.66 | +0.10 | +2.30 | inert |
| blitz | -0.34 | +1.05 | -0.29 | +0.85 | -1.09 | +0.07 |
| switch | +0.88 | -0.89 | inert | -1.15 | +2.74 | +0.68 |
| zone23 | +1.82 | +2.71 | -3.39 | -2.75 | +0.47 | -2.16 |
| zone32 | -0.28 | -0.25 | -0.60 | -2.86 | -0.37 | -0.28 |
| box1 | +0.55 | +0.90 | -2.72 | -2.83 | +3.66 | -4.42 |
| tri2 | +1.00 | -0.40 | -2.09 | -2.61 | +1.56 | -3.17 |
| starPlan double | -0.57 | +1.09 | +0.65 | +1.29 | -0.94 | -1.91 |
| switchOffBall true | +0.41 | +0.00 | inert | +0.67 | +1.77 | -0.06 |
| huntMismatch true | -0.15 | +0.80 | +0.76 | +0.16 | +0.60 | -0.20 |
| shape fiveOut | +0.30 | -0.25 | +0.41 | -1.45 | +1.09 | +0.13 |
| shape horns | -0.06 | -0.42 | +0.29 | +0.10 | +1.44 | -0.81 |
| shape twoIn | -0.28 | +0.92 | +0.60 | +0.50 | +1.38 | -1.43 |

Side A's play-type shares (base, %), and each setting's change (pp):

| Setting | trans | iso | pnrBH | roll | post | spot | hand | offscr | cut | putb | misc |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| base | 11.1 | 5.5 | 14.7 | 8.2 | 4.2 | 30.9 | 5.5 | 3.2 | 9.4 | 4.7 | 2.6 |
| pace 0 | +0.1 | -0.1 | -0.2 | -0.1 | -0.1 | +0.1 | +0.1 | -0.1 | -0.1 | -0.2 | +0.6 |
| pace 100 | +0.2 | -0.1 | -0.1 | +0.1 | +0.0 | +0.4 | +0.0 | +0.0 | -0.1 | -0.1 | -0.3 |
| transition 0 | -4.8 | +0.2 | +0.9 | +0.4 | +0.3 | +2.0 | +0.3 | +0.2 | +0.5 | -0.1 | +0.1 |
| transition 100 | +2.2 | -0.2 | -0.4 | -0.3 | -0.2 | -0.6 | -0.2 | -0.1 | -0.3 | -0.0 | +0.1 |
| threePoint 0 | +0.3 | +0.1 | +0.5 | -0.6 | -0.1 | +0.3 | -0.0 | +0.0 | -0.3 | -0.4 | +0.1 |
| threePoint 100 | -0.0 | -0.3 | -0.9 | +0.4 | +0.0 | +0.6 | -0.0 | +0.0 | +0.1 | -0.0 | +0.2 |
| rimAttack 0 | +0.1 | -0.2 | -0.3 | +0.1 | +0.0 | +1.7 | -0.1 | -0.0 | -1.7 | +0.0 | +0.2 |
| rimAttack 100 | +0.1 | +0.0 | +0.1 | -0.0 | -0.0 | -0.7 | +0.1 | +0.0 | +0.6 | -0.1 | +0.0 |
| crashBoards 0 | +0.4 | +0.0 | +0.0 | -0.0 | -0.1 | +0.6 | +0.1 | +0.1 | -0.0 | -1.3 | +0.1 |
| crashBoards 100 | +0.0 | -0.0 | +0.0 | +0.0 | -0.1 | +0.0 | -0.0 | -0.1 | -0.1 | +0.2 | -0.0 |
| getBack 0 | +0.0 | +0.0 | -0.0 | +0.0 | -0.1 | +0.1 | +0.0 | -0.0 | -0.1 | -0.1 | +0.0 |
| getBack 100 | +0.3 | -0.1 | +0.1 | -0.0 | -0.1 | +0.4 | +0.0 | +0.0 | -0.1 | -0.6 | +0.1 |
| iso 0 | +0.1 | -4.8 | +1.3 | +0.8 | +0.3 | +0.7 | +0.5 | +0.3 | +0.7 | -0.2 | +0.1 |
| iso 100 | +0.1 | +5.7 | -1.7 | -0.8 | -0.5 | -0.4 | -0.8 | -0.4 | -1.0 | -0.1 | +0.0 |
| post 0 | -0.1 | +0.3 | +0.8 | +0.4 | -3.3 | +1.0 | +0.3 | +0.1 | +0.1 | +0.1 | +0.1 |
| post 100 | +0.1 | -0.4 | -1.1 | -0.5 | +4.0 | -0.8 | -0.5 | -0.3 | -0.3 | -0.2 | +0.1 |
| pnr 0 | +0.0 | +3.3 | -14.3 | -6.4 | +1.8 | +4.5 | +3.4 | +1.9 | +5.5 | -0.1 | +0.2 |
| pnr 100 | +0.2 | -1.2 | +6.0 | +2.0 | -0.9 | -1.5 | -1.4 | -0.8 | -2.3 | -0.2 | +0.0 |
| handoff 0 | +0.0 | +0.6 | +2.3 | -0.3 | +0.3 | +4.4 | -5.4 | -3.1 | +1.3 | -0.1 | +0.1 |
| handoff 100 | +0.1 | -0.9 | -4.2 | +0.1 | -0.8 | -7.8 | +10.7 | +5.3 | -2.6 | -0.1 | +0.1 |
| motion 0 | +0.2 | +2.5 | +6.9 | +3.8 | +1.7 | -10.8 | +2.6 | +1.6 | -8.5 | -0.0 | +0.0 |
| motion 100 | +0.0 | -1.0 | -3.1 | -1.6 | -0.8 | +5.0 | -1.2 | -0.7 | +3.4 | -0.2 | +0.2 |
| help 0 | -0.4 | +0.1 | +0.1 | +0.0 | -0.0 | +0.2 | +0.1 | +0.0 | -0.1 | -0.1 | +0.1 |
| help 100 | +0.3 | -0.0 | -0.2 | -0.0 | -0.0 | +0.1 | +0.1 | +0.0 | -0.2 | -0.1 | +0.1 |
| pressure 0 | -0.1 | -0.0 | +0.0 | -0.0 | -0.1 | +0.2 | +0.0 | +0.0 | -0.1 | -0.0 | +0.1 |
| pressure 100 | +0.4 | -0.0 | -0.1 | +0.1 | -0.1 | +0.1 | +0.0 | -0.0 | -0.2 | -0.2 | +0.1 |
| physicality 0 | -0.0 | -0.0 | -0.1 | -0.0 | -0.0 | +0.2 | +0.0 | -0.0 | -0.0 | -0.1 | +0.1 |
| physicality 100 | +0.1 | -0.1 | -0.0 | +0.0 | -0.1 | +0.1 | +0.0 | -0.0 | -0.0 | -0.1 | +0.1 |
| press afterMade | +0.8 | -0.1 | -0.5 | -0.2 | -0.1 | +0.3 | +0.0 | +0.0 | -0.2 | +0.0 | -0.1 |
| press always | +1.0 | -0.0 | -0.5 | -0.1 | -0.2 | +0.4 | +0.1 | +0.1 | -0.4 | -0.1 | -0.2 |
| mentality -2 | -1.4 | +0.1 | +0.3 | +0.1 | -0.0 | +1.1 | +0.1 | +0.0 | +0.1 | -0.5 | +0.2 |
| mentality +2 | +1.0 | -0.0 | -0.2 | -0.0 | -0.0 | -0.3 | +0.0 | -0.1 | -0.4 | +0.2 | -0.2 |
| drop | +0.3 | +0.0 | -0.2 | -0.1 | -0.0 | -0.0 | +0.0 | +0.0 | -0.1 | -0.0 | +0.1 |
| hedge | +0.3 | +0.0 | -0.2 | -0.0 | -0.1 | -0.1 | +0.1 | -0.0 | -0.1 | -0.0 | +0.1 |
| ice | +0.1 | +0.0 | -0.0 | +0.0 | -0.0 | -0.1 | +0.1 | +0.0 | -0.0 | -0.2 | +0.1 |
| blitz | +0.7 | +0.0 | -0.3 | -0.1 | -0.1 | -0.1 | -0.1 | +0.0 | -0.1 | -0.1 | +0.1 |
| switch | -0.2 | -0.1 | +0.1 | -0.1 | -0.1 | +0.3 | -0.1 | +0.0 | -0.0 | -0.0 | +0.1 |
| zone23 | +0.4 | -0.1 | -0.0 | -0.1 | -0.1 | -0.0 | -0.0 | +0.0 | -0.1 | -0.1 | +0.1 |
| zone32 | +0.1 | +0.1 | -0.1 | -0.1 | -0.0 | +0.1 | -0.0 | +0.1 | -0.0 | -0.1 | +0.0 |
| box1 | +0.4 | -0.0 | -0.1 | -0.1 | -0.1 | +0.0 | +0.0 | +0.0 | -0.1 | -0.0 | +0.1 |
| tri2 | +0.5 | +0.0 | -0.1 | -0.1 | -0.2 | +0.1 | +0.1 | -0.0 | -0.1 | -0.2 | +0.1 |
| starPlan double | +0.4 | +0.1 | -0.1 | -0.1 | -0.1 | +0.1 | -0.0 | -0.1 | -0.1 | -0.1 | +0.1 |
| switchOffBall true | -0.0 | -0.0 | +0.1 | -0.1 | -0.1 | +0.2 | -0.0 | +0.0 | -0.1 | -0.1 | +0.1 |
| huntMismatch true | +0.2 | +1.2 | -0.4 | -0.0 | -0.3 | -0.2 | -0.2 | -0.0 | -0.3 | -0.2 | +0.1 |
| shape fiveOut | +0.0 | +0.2 | +0.5 | +0.1 | -1.4 | -0.1 | +0.1 | +0.1 | +0.7 | -0.3 | +0.1 |
| shape horns | +0.1 | +0.6 | +2.9 | +0.9 | +0.4 | -3.6 | +0.2 | +0.0 | -1.6 | -0.1 | +0.1 |
| shape twoIn | +0.0 | -0.2 | -0.6 | -0.1 | +1.2 | -0.1 | -0.2 | -0.0 | -0.2 | +0.2 | +0.1 |

The opponents' play-type shares (base, %), and each setting's change (pp):

| Setting | trans | iso | pnrBH | roll | post | spot | hand | offscr | cut | putb | misc |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| base | 9.1 | 8.3 | 19.3 | 7.0 | 2.7 | 30.7 | 5.4 | 3.1 | 7.3 | 4.4 | 2.7 |
| pace 0 | +0.1 | -0.0 | +0.0 | -0.1 | -0.0 | -0.0 | -0.0 | +0.1 | -0.0 | -0.1 | +0.1 |
| pace 100 | +0.1 | +0.1 | +0.1 | -0.0 | -0.0 | +0.1 | -0.1 | -0.1 | -0.1 | +0.0 | -0.1 |
| transition 0 | +0.3 | -0.0 | -0.1 | -0.0 | +0.0 | -0.0 | -0.1 | +0.0 | -0.1 | +0.0 | +0.0 |
| transition 100 | +0.1 | -0.1 | -0.1 | -0.0 | +0.0 | +0.2 | -0.0 | +0.1 | -0.1 | +0.0 | -0.0 |
| threePoint 0 | -0.3 | -0.1 | +0.1 | +0.0 | +0.0 | +0.3 | -0.1 | +0.1 | -0.0 | -0.0 | +0.1 |
| threePoint 100 | +0.3 | -0.1 | -0.1 | -0.1 | -0.0 | -0.0 | -0.0 | +0.1 | -0.1 | +0.0 | +0.0 |
| rimAttack 0 | +0.2 | -0.1 | +0.0 | +0.0 | +0.0 | -0.1 | -0.0 | +0.0 | +0.0 | -0.0 | -0.0 |
| rimAttack 100 | -0.0 | -0.0 | +0.0 | +0.0 | +0.0 | -0.0 | +0.0 | +0.0 | -0.0 | -0.0 | +0.1 |
| crashBoards 0 | -0.4 | -0.0 | +0.1 | +0.0 | +0.0 | +0.3 | +0.0 | +0.0 | -0.1 | +0.0 | +0.0 |
| crashBoards 100 | +0.7 | -0.1 | -0.2 | -0.1 | +0.0 | -0.2 | -0.1 | +0.1 | -0.2 | +0.0 | +0.0 |
| getBack 0 | +2.3 | -0.2 | -0.5 | -0.3 | -0.0 | -0.6 | -0.2 | -0.1 | -0.3 | -0.1 | +0.0 |
| getBack 100 | -1.9 | +0.1 | +0.4 | +0.2 | +0.0 | +0.8 | +0.1 | +0.1 | +0.1 | +0.0 | +0.0 |
| iso 0 | +0.0 | -0.0 | -0.1 | -0.1 | -0.0 | +0.0 | +0.1 | +0.1 | +0.1 | +0.1 | -0.0 |
| iso 100 | +0.0 | -0.1 | -0.0 | +0.0 | -0.0 | +0.2 | -0.1 | -0.0 | -0.0 | -0.1 | +0.1 |
| post 0 | +0.1 | -0.0 | -0.2 | -0.0 | +0.0 | +0.0 | +0.0 | +0.0 | -0.1 | +0.1 | -0.0 |
| post 100 | -0.1 | -0.1 | +0.0 | -0.0 | +0.0 | +0.1 | -0.1 | +0.1 | -0.1 | +0.0 | +0.0 |
| pnr 0 | -0.0 | -0.1 | -0.1 | -0.1 | -0.0 | +0.2 | -0.0 | +0.1 | +0.1 | -0.0 | +0.0 |
| pnr 100 | +0.1 | +0.1 | -0.1 | -0.0 | -0.0 | +0.1 | -0.1 | +0.0 | +0.0 | +0.0 | -0.0 |
| handoff 0 | +0.1 | -0.0 | +0.1 | -0.1 | -0.0 | +0.1 | -0.1 | -0.0 | -0.0 | +0.0 | -0.0 |
| handoff 100 | +0.1 | -0.1 | +0.1 | -0.1 | -0.0 | -0.1 | -0.0 | +0.1 | -0.1 | -0.0 | +0.1 |
| motion 0 | -0.1 | -0.1 | -0.0 | +0.0 | -0.0 | +0.4 | -0.1 | -0.0 | -0.1 | +0.0 | +0.0 |
| motion 100 | +0.1 | -0.0 | +0.0 | -0.1 | -0.0 | +0.0 | +0.1 | +0.0 | -0.1 | -0.0 | +0.0 |
| help 0 | +0.1 | +1.1 | +4.6 | +0.8 | +0.1 | -6.3 | +0.0 | +0.1 | -0.1 | -0.4 | +0.1 |
| help 100 | +0.1 | -3.0 | -5.0 | -0.5 | -1.2 | +9.3 | -0.1 | -0.0 | +0.5 | +0.1 | -0.1 |
| pressure 0 | +0.1 | -0.1 | -0.7 | -0.0 | +0.0 | +0.8 | -0.1 | -0.0 | -0.2 | +0.2 | +0.2 |
| pressure 100 | -0.0 | +0.0 | +1.0 | -0.1 | -0.1 | -2.1 | +0.0 | +0.0 | +1.8 | -0.5 | -0.1 |
| physicality 0 | +0.0 | -0.1 | -0.2 | +0.1 | +0.0 | +0.2 | -0.1 | +0.0 | -0.0 | +0.0 | +0.1 |
| physicality 100 | +0.0 | -0.1 | +0.4 | -0.1 | +0.0 | -0.0 | -0.1 | +0.0 | -0.1 | +0.0 | -0.0 |
| press afterMade | +7.8 | -1.0 | -2.3 | -0.9 | -0.3 | -3.4 | -0.7 | -0.3 | -0.8 | -0.1 | +2.0 |
| press always | +9.5 | -1.3 | -2.8 | -1.1 | -0.4 | -4.2 | -0.8 | -0.3 | -1.1 | -0.1 | +2.5 |
| mentality -2 | -0.8 | +0.0 | -0.1 | +0.0 | -0.0 | +0.8 | +0.0 | -0.0 | -0.0 | +0.1 | +0.0 |
| mentality +2 | +1.1 | -0.2 | +0.1 | -0.0 | -0.0 | -1.1 | -0.1 | -0.0 | +0.4 | -0.1 | -0.0 |
| drop | +0.1 | -0.2 | +1.8 | -1.1 | -0.7 | -0.3 | +0.3 | +0.1 | +0.0 | -0.0 | -0.0 |
| hedge | +0.1 | -0.1 | -4.1 | +2.8 | -0.7 | +2.0 | +0.2 | +0.1 | -0.1 | -0.2 | -0.0 |
| ice | +0.0 | -0.3 | -1.8 | -0.3 | -0.7 | +2.7 | +0.2 | +0.1 | +0.0 | -0.0 | +0.0 |
| blitz | +0.0 | -0.2 | -12.7 | +7.3 | -0.8 | +6.7 | +0.2 | +0.1 | -0.1 | -0.5 | +0.0 |
| switch | -0.0 | +0.9 | +0.7 | -3.1 | +4.6 | -0.6 | -1.5 | -0.9 | -0.0 | +0.1 | -0.1 |
| zone23 | -0.2 | -2.9 | -6.6 | -1.3 | -1.2 | +11.8 | +0.9 | +0.5 | -2.3 | +1.0 | +0.3 |
| zone32 | -0.3 | -2.7 | -3.7 | +2.4 | -1.2 | +1.9 | +0.4 | +0.3 | +1.7 | +1.1 | +0.1 |
| box1 | +0.0 | -2.9 | -7.7 | -1.5 | -1.2 | +12.3 | +0.8 | +0.6 | -1.0 | +0.3 | +0.2 |
| tri2 | -0.1 | -2.8 | -7.9 | -1.4 | -1.2 | +10.9 | +0.7 | +0.6 | +0.6 | +0.5 | +0.1 |
| starPlan double | -0.0 | -1.9 | -6.9 | +3.7 | -0.5 | +5.5 | +0.1 | -0.1 | +0.2 | -0.1 | +0.1 |
| switchOffBall true | +0.1 | +0.9 | +0.2 | -0.3 | +1.8 | -0.0 | -1.5 | -0.9 | -0.3 | +0.1 | +0.0 |
| huntMismatch true | -0.0 | -0.0 | +0.1 | -0.1 | +0.0 | +0.1 | -0.1 | +0.0 | -0.1 | +0.1 | -0.0 |
| shape fiveOut | +0.1 | -0.1 | +0.0 | -0.0 | +0.0 | +0.0 | -0.1 | +0.0 | +0.1 | -0.1 | +0.0 |
| shape horns | -0.1 | -0.0 | -0.1 | -0.0 | +0.1 | +0.3 | -0.0 | -0.0 | -0.2 | +0.0 | +0.1 |
| shape twoIn | -0.1 | +0.0 | +0.1 | -0.1 | -0.0 | +0.0 | -0.0 | +0.0 | -0.1 | +0.1 | +0.0 |

## Part 2: defensive choices by opponent

Defenses CHI, MIA, SAC (patched, side A) against nine offenses, 250 paired games a cell. Each cell: the defense's net per 100 with the choice against drop coverage (positive: better for the defense), averaged over the three defenses; ± is that mean's standard error. Drop, hedge, ice and blitz are played without off-ball switches, switch with them.

The defenses' own settings: CHI hedge (man, hedge, switchOffBall false); MIA switch (man, switch, switchOffBall true); SAC drop (man, drop, switchOffBall false).
Across runs (other seeds or another engine), differences under about 1.5 per 100 in a row, or 0.5 in the 27-cell average, are noise.

| Offense | hedge | ice | blitz | switch | zone23 | box1 | tri2 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| GSW | +0.82 ± 0.51 | +0.42 ± 0.49 | +0.32 ± 0.54 | -0.60 ± 0.55 | +0.70 ± 0.53 | +1.69 ± 0.55 | +1.10 ± 0.56 |
| OKC | -1.55 ± 0.46 | -0.74 ± 0.47 | -3.57 ± 0.48 | -1.61 ± 0.50 | -1.37 ± 0.48 | -1.38 ± 0.50 | -1.64 ± 0.53 |
| LAL | +0.20 ± 0.54 | +0.03 ± 0.55 | -2.60 ± 0.54 | -1.48 ± 0.59 | -2.35 ± 0.55 | -1.44 ± 0.57 | -0.95 ± 0.56 |
| NYK | +1.62 ± 0.53 | +0.89 ± 0.50 | -0.51 ± 0.55 | +1.57 ± 0.58 | -0.14 ± 0.57 | -0.82 ± 0.58 | -1.94 ± 0.60 |
| WAS | -3.19 ± 0.54 | -0.92 ± 0.54 | -6.99 ± 0.55 | -1.77 ± 0.57 | -3.15 ± 0.54 | -3.92 ± 0.54 | -3.93 ± 0.55 |
| IND | -1.31 ± 0.53 | -0.47 ± 0.49 | -3.94 ± 0.52 | -1.93 ± 0.56 | -2.35 ± 0.54 | -1.76 ± 0.57 | -2.36 ± 0.57 |
| MEM | +0.16 ± 0.51 | +0.16 ± 0.47 | +0.44 ± 0.55 | +0.54 ± 0.56 | -2.27 ± 0.57 | -1.81 ± 0.57 | -1.58 ± 0.58 |
| BOS | +0.33 ± 0.53 | -0.70 ± 0.54 | -2.21 ± 0.56 | -1.44 ± 0.60 | -5.08 ± 0.59 | -4.42 ± 0.61 | -3.94 ± 0.57 |
| CLE | -1.57 ± 0.50 | +0.26 ± 0.48 | -3.90 ± 0.53 | -0.29 ± 0.56 | -0.23 ± 0.53 | +0.02 ± 0.52 | -0.40 ± 0.54 |
| **All 27 cells** | **-0.50 ± 0.17** | **-0.12 ± 0.17** | **-2.55 ± 0.18** | **-0.78 ± 0.19** | **-1.80 ± 0.18** | **-1.54 ± 0.19** | **-1.74 ± 0.19** |
| cells positive | 12/27 | 11/27 | 5/27 | 8/27 | 5/27 | 5/27 | 4/27 |

## Part 3: the AI league as it plays

The real league on rngSeed 307, 3 season(s) through the season runner, every team on automatic tactics (the user's team, tid 19, run by its staff). Sampled twice a season (day 14, and the day after the All-Star Game): every team 12 games against random opponents, built as the season builds them, nothing written back; 2160 sampled games in all. Season simulation 2027 17.9s, 2028 10.2s, 2029 7.7s; sampling 4.3s, 3.1s, 2.2s.

### Ball-screen coverage and schemes

Share of trips with a ball screen, by the coverage on it (%):

| Seasons | trips | drop | switch | hedge | ice | zone | blitz |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2027 | 52360 | 55.1 | 18.5 | 12.7 | 5.8 | 4.5 | 3.4 |
| 2028 | 51358 | 58.4 | 13.8 | 13.2 | 5.3 | 4.7 | 4.6 |
| 2029 | 51324 | 50.7 | 28.7 | 6.8 | 6.2 | 4.8 | 2.8 |
| all | 155042 | 54.7 | 20.3 | 10.9 | 5.8 | 4.7 | 3.6 |

Share of half-court trips by the defense played (%):

| Seasons | trips | man | zone23 | zone32 | box1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2027 | 124152 | 94.97 | 5.03 | 0.00 | 0.00 |
| 2028 | 123647 | 94.72 | 5.07 | 0.06 | 0.14 |
| 2029 | 123767 | 94.74 | 4.89 | 0.33 | 0.04 |
| all | 371566 | 94.81 | 5.00 | 0.13 | 0.06 |

### In-game adjustments

0.56 a game (both teams; 0.28 a team-game), 1212 in 2160 games (by season: 2027 0.51, 2028 0.60, 2029 0.57).

| Adjustment | count | share |
| --- | ---: | ---: |
| pushes the pace to chase the game | 182 | 15.0% |
| attacks the zone with ball movement | 161 | 13.3% |
| backs off the ball | 129 | 10.6% |
| drops the big on ball screens | 112 | 9.2% |
| stops blitzing ball screens | 83 | 6.8% |
| hunts the mismatches the switches leave | 35 | 2.9% |
| goes back to man-to-man | 34 | 2.8% |
| ices McConnell's ball screens instead of dropping | 22 | 1.8% |
| ices Brunson's ball screens instead of dropping | 18 | 1.5% |
| ices Tatum's ball screens instead of dropping | 17 | 1.4% |
| ices George's ball screens instead of dropping | 14 | 1.2% |
| ices Portis's ball screens instead of dropping | 13 | 1.1% |
| stays home on shooters | 12 | 1.0% |
| ices Monk's ball screens instead of dropping | 11 | 0.9% |
| ices Russell's ball screens instead of dropping | 10 | 0.8% |
| ices Harris's ball screens instead of dropping | 10 | 0.8% |
| ices Caldwell-Pope's ball screens instead of dropping | 10 | 0.8% |
| ices Poole's ball screens instead of dropping | 9 | 0.7% |
| packs the paint | 9 | 0.7% |
| ices Stone's ball screens instead of dropping | 9 | 0.7% |
| ices Mitchell's ball screens instead of dropping | 8 | 0.7% |
| ices Embiid's ball screens instead of dropping | 8 | 0.7% |
| ices McCollum's ball screens instead of dropping | 7 | 0.6% |
| ices Miller's ball screens instead of dropping | 7 | 0.6% |
| ices Sexton's ball screens instead of dropping | 7 | 0.6% |
| ices Jerome's ball screens instead of dropping | 7 | 0.6% |
| ices Flagg's ball screens instead of dropping | 7 | 0.6% |
| ices Do. Mitchell's ball screens instead of dropping | 7 | 0.6% |
| ices Brooks's ball screens instead of dropping | 7 | 0.6% |
| ices Thomas's ball screens instead of dropping | 6 | 0.5% |
| ices Simons's ball screens instead of dropping | 6 | 0.5% |
| ices Pritchard's ball screens instead of dropping | 6 | 0.5% |
| ices Allen's ball screens instead of dropping | 5 | 0.4% |
| ices White's ball screens instead of dropping | 5 | 0.4% |
| ices Booker's ball screens instead of dropping | 5 | 0.4% |
| hides <player> on <player> | 5 | 0.4% |
| goes at George in foul trouble | 5 | 0.4% |
| goes at Johnson in foul trouble | 5 | 0.4% |
| ices Young's ball screens instead of dropping | 4 | 0.3% |
| goes at Fox in foul trouble | 4 | 0.3% |
| ices Harden's ball screens instead of dropping | 4 | 0.3% |
| ices Dončić's ball screens instead of dropping | 4 | 0.3% |
| goes at Mara in foul trouble | 4 | 0.3% |
| ices Bailey's ball screens instead of dropping | 4 | 0.3% |
| ices Cunningham's ball screens instead of dropping | 4 | 0.3% |
| goes at Holland in foul trouble | 3 | 0.2% |
| goes at LaRavia in foul trouble | 3 | 0.2% |
| goes at Bane in foul trouble | 3 | 0.2% |
| ices Johnson's ball screens instead of dropping | 3 | 0.2% |
| goes at Edgecombe in foul trouble | 3 | 0.2% |
| goes at Williams in foul trouble | 3 | 0.2% |
| ices Ball's ball screens instead of dropping | 3 | 0.2% |
| goes at Dëmin in foul trouble | 3 | 0.2% |
| goes at West in foul trouble | 3 | 0.2% |
| ices D. Murray's ball screens instead of dropping | 3 | 0.2% |
| goes at Kuzma in foul trouble | 2 | 0.2% |
| ices Porter Jr.'s ball screens instead of dropping | 2 | 0.2% |
| goes at Reed in foul trouble | 2 | 0.2% |
| goes at Thompson in foul trouble | 2 | 0.2% |
| goes at Randle in foul trouble | 2 | 0.2% |
| goes at Diabaté in foul trouble | 2 | 0.2% |
| goes at McDaniels in foul trouble | 2 | 0.2% |
| goes at Gobert in foul trouble | 2 | 0.2% |
| goes at Miller in foul trouble | 2 | 0.2% |
| goes at Traoré in foul trouble | 2 | 0.2% |
| goes at Wagler in foul trouble | 2 | 0.2% |
| ices Maxey's ball screens instead of dropping | 2 | 0.2% |
| goes at Cunningham in foul trouble | 2 | 0.2% |
| goes at Edey in foul trouble | 2 | 0.2% |
| ices Payne's ball screens instead of dropping | 2 | 0.2% |
| goes at Ball in foul trouble | 2 | 0.2% |
| goes at Risacher in foul trouble | 2 | 0.2% |
| ices Powell's ball screens instead of dropping | 2 | 0.2% |
| ices Nembhard's ball screens instead of dropping | 2 | 0.2% |
| goes at Brown Jr. in foul trouble | 2 | 0.2% |
| goes at Irving in foul trouble | 2 | 0.2% |
| goes at Black in foul trouble | 2 | 0.2% |
| ices Carrington's ball screens instead of dropping | 2 | 0.2% |
| goes at Essengue in foul trouble | 2 | 0.2% |
| goes at Bernard in foul trouble | 2 | 0.2% |
| goes at Sharp in foul trouble | 2 | 0.2% |
| goes at Quickley in foul trouble | 2 | 0.2% |
| goes at Ejiofor in foul trouble | 2 | 0.2% |
| goes at Okongwu in foul trouble | 1 | 0.1% |
| goes at Buzelis in foul trouble | 1 | 0.1% |
| goes at Santos in foul trouble | 1 | 0.1% |
| goes at Allen in foul trouble | 1 | 0.1% |
| goes at Dunn in foul trouble | 1 | 0.1% |
| goes at Burries in foul trouble | 1 | 0.1% |
| ices Sensabaugh's ball screens instead of dropping | 1 | 0.1% |
| goes at Jerome in foul trouble | 1 | 0.1% |
| goes at Spencer in foul trouble | 1 | 0.1% |
| goes at Mitchell in foul trouble | 1 | 0.1% |
| goes at Joe in foul trouble | 1 | 0.1% |
| goes at Vanderbilt in foul trouble | 1 | 0.1% |
| goes at Flagg in foul trouble | 1 | 0.1% |
| goes at Maxey in foul trouble | 1 | 0.1% |
| goes at Walker in foul trouble | 1 | 0.1% |
| goes at Edwards in foul trouble | 1 | 0.1% |
| goes at Morant in foul trouble | 1 | 0.1% |
| goes at Kispert in foul trouble | 1 | 0.1% |
| goes at Boozer in foul trouble | 1 | 0.1% |
| goes at Wilson in foul trouble | 1 | 0.1% |
| goes at Rollins in foul trouble | 1 | 0.1% |
| goes at Jokić in foul trouble | 1 | 0.1% |
| goes at Castle in foul trouble | 1 | 0.1% |
| ices Jokić's ball screens instead of dropping | 1 | 0.1% |
| goes at S. Jones in foul trouble | 1 | 0.1% |
| goes at Carr in foul trouble | 1 | 0.1% |
| goes at Krejčí in foul trouble | 1 | 0.1% |
| goes at Walker IV in foul trouble | 1 | 0.1% |
| goes at Graves in foul trouble | 1 | 0.1% |
| goes at Goodwin in foul trouble | 1 | 0.1% |
| goes at Mathurin in foul trouble | 1 | 0.1% |
| goes at McNeeley in foul trouble | 1 | 0.1% |
| goes at Wagner in foul trouble | 1 | 0.1% |
| goes at Suggs in foul trouble | 1 | 0.1% |
| goes at Coulibaly in foul trouble | 1 | 0.1% |
| goes at Dybantsa in foul trouble | 1 | 0.1% |
| goes at Toppin in foul trouble | 1 | 0.1% |
| ices Vassell's ball screens instead of dropping | 1 | 0.1% |
| goes at Harris in foul trouble | 1 | 0.1% |
| goes at Porziņģis in foul trouble | 1 | 0.1% |
| ices Hunter's ball screens instead of dropping | 1 | 0.1% |
| goes at Haliburton in foul trouble | 1 | 0.1% |
| goes at Vassell in foul trouble | 1 | 0.1% |
| goes at DiVincenzo in foul trouble | 1 | 0.1% |
| ices DiVincenzo's ball screens instead of dropping | 1 | 0.1% |
| goes at Murray in foul trouble | 1 | 0.1% |
| goes at Green in foul trouble | 1 | 0.1% |
| goes at Banchero in foul trouble | 1 | 0.1% |
| goes at Murphy III in foul trouble | 1 | 0.1% |
| goes at Payne in foul trouble | 1 | 0.1% |
| ices K. Porter Jr.'s ball screens instead of dropping | 1 | 0.1% |
| goes at Pritchard in foul trouble | 1 | 0.1% |
| ices Bogdanović's ball screens instead of dropping | 1 | 0.1% |
| goes at Jones in foul trouble | 1 | 0.1% |
| goes at Bailey in foul trouble | 1 | 0.1% |
| goes at Grimes in foul trouble | 1 | 0.1% |
| goes at Wells in foul trouble | 1 | 0.1% |
| goes at Murray-Boyles in foul trouble | 1 | 0.1% |
| goes at Eason in foul trouble | 1 | 0.1% |
| goes at Thomas in foul trouble | 1 | 0.1% |
| goes at Sheppard in foul trouble | 1 | 0.1% |
| goes at Nesmith in foul trouble | 1 | 0.1% |
| ices Edwards's ball screens instead of dropping | 1 | 0.1% |
| goes at de Larrea in foul trouble | 1 | 0.1% |
| goes at Topić in foul trouble | 1 | 0.1% |
| goes at Champagnie in foul trouble | 1 | 0.1% |
| goes at Adebayo in foul trouble | 1 | 0.1% |
| goes at Queta in foul trouble | 1 | 0.1% |
| goes at M. Porter Jr. in foul trouble | 1 | 0.1% |
| goes at Sarr in foul trouble | 1 | 0.1% |
| goes at Smith Jr. in foul trouble | 1 | 0.1% |
| goes at K. Porter Jr. in foul trouble | 1 | 0.1% |
| goes at Ellis in foul trouble | 1 | 0.1% |
| ices McDaniels's ball screens instead of dropping | 1 | 0.1% |
| ices McBride's ball screens instead of dropping | 1 | 0.1% |
| goes at Avdija in foul trouble | 1 | 0.1% |
| goes at Alexander-Walker in foul trouble | 1 | 0.1% |
| goes at Richardson in foul trouble | 1 | 0.1% |
| goes at Giddey in foul trouble | 1 | 0.1% |
| goes at Brown in foul trouble | 1 | 0.1% |
| goes at Z. Williams in foul trouble | 1 | 0.1% |
| goes at Collier in foul trouble | 1 | 0.1% |
| goes at Peterson in foul trouble | 1 | 0.1% |
| goes at D. Murray in foul trouble | 1 | 0.1% |
| ices Dosunmu's ball screens instead of dropping | 1 | 0.1% |

### Team stats from the seasons' results (30 teams)

| Season | pace (poss/g) mean (SD) | 3PA rate mean (SD) | ORB% mean (SD) | TOV/poss mean (SD) | FT rate mean (SD) | opp TOV/poss mean (SD) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2027 | 97.8 (1.78) | 0.433 (0.046) | 0.256 (0.024) | 0.144 (0.017) | 0.242 (0.032) | 0.144 (0.009) |
| 2028 | 98.3 (1.35) | 0.433 (0.045) | 0.254 (0.024) | 0.144 (0.016) | 0.242 (0.029) | 0.144 (0.009) |
| 2029 | 97.8 (1.40) | 0.434 (0.040) | 0.257 (0.024) | 0.144 (0.017) | 0.234 (0.028) | 0.144 (0.005) |

### Presets and the glass

Offensive presets over the samples (team-samples): helio 82, balanced 58, grind 34, paceSpace 6. Defensive: drop 117, switch 28, hedge 20, ice 10, blitz 5.

Correlation across teams of crashBoards with the opponents' transition share (Synergy finish): 2027 early +0.34, 2027 postASB +0.38, 2028 early +0.07, 2028 postASB +0.28, 2029 early +0.17, 2029 postASB +0.11; pooled +0.22 (n 180). With the opponents' run-outs (the log's transition trips): pooled +0.21. getBack with the opponents' transition share: pooled -0.11.

By team at the first sample (2027 early); the opponents' transition share is that sample's; the last column lists the presets at every sample in order, when they changed:

| Team | off preset | def preset | scheme | pnr | pace | crash | getBack | opp trans % | presets over the samples |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ATL | paceSpace | hedge | man | hedge | 72 | 44 | 58 | 12.2 | paceSpace/hedge → paceSpace/drop → grind/switch → grind/drop → grind/switch |
| BOS | helio | drop | man | drop | 18 | 70 | 58 | 13.3 | same |
| BKN | balanced | drop | man | drop | 28 | 34 | 58 | 12.3 | balanced/drop → balanced/hedge → grind/drop |
| CHA | helio | switch | man | switch | 35 | 81 | 58 | 12.2 | helio/switch → helio/drop → helio/switch → helio/drop → helio/switch |
| CHI | paceSpace | hedge | man | hedge | 77 | 24 | 58 | 9.8 | paceSpace/hedge → paceSpace/drop → helio/switch |
| CLE | helio | drop | man | drop | 55 | 57 | 58 | 10.8 | same |
| DAL | helio | drop | man | drop | 64 | 28 | 58 | 9.3 | same |
| DEN | grind | drop | man | drop | 47 | 40 | 58 | 10.0 | grind/drop → grind/hedge |
| DET | balanced | switch | man | switch | 53 | 82 | 58 | 10.7 | balanced/switch → balanced/blitz → balanced/drop → balanced/switch |
| GSW | balanced | blitz | man | blitz | 48 | 55 | 58 | 12.7 | balanced/blitz → balanced/drop → balanced/blitz → balanced/drop |
| HOU | grind | drop | man | drop | 33 | 88 | 58 | 10.1 | grind/drop → balanced/drop |
| IND | grind | drop | man | drop | 60 | 15 | 58 | 10.6 | grind/drop → balanced/drop → balanced/switch |
| LAC | grind | drop | man | drop | 29 | 33 | 58 | 10.5 | grind/drop → grind/hedge → balanced/drop → balanced/blitz → balanced/drop |
| LAL | grind | drop | man | drop | 39 | 32 | 58 | 12.0 | grind/drop → helio/drop |
| MEM | balanced | drop | man | drop | 76 | 53 | 58 | 8.9 | same |
| MIA | helio | drop | man | drop | 64 | 38 | 58 | 9.4 | helio/drop → helio/switch → helio/ice → helio/blitz → helio/switch |
| MIL | grind | drop | man | drop | 38 | 15 | 58 | 9.7 | grind/drop → grind/hedge → grind/drop → helio/drop |
| MIN | helio | drop | man | drop | 52 | 50 | 58 | 10.4 | helio/drop → helio/switch |
| NOP | helio | switch | man | switch | 57 | 60 | 58 | 9.3 | helio/switch → helio/drop |
| NYK | balanced | ice | man | ice | 52 | 55 | 60 | 11.9 | balanced/ice → balanced/drop |
| OKC | helio | ice | man | ice | 52 | 25 | 58 | 9.3 | helio/ice → helio/drop → helio/ice → helio/drop → helio/ice → helio/drop |
| ORL | helio | hedge | man | hedge | 46 | 44 | 58 | 12.6 | helio/hedge → helio/switch |
| PHI | helio | drop | man | drop | 48 | 46 | 58 | 8.9 | same |
| PHX | helio | switch | man | switch | 33 | 60 | 58 | 11.6 | helio/switch → grind/ice |
| POR | helio | drop | man | drop | 59 | 88 | 58 | 13.4 | same |
| SAC | grind | drop | man | drop | 47 | 50 | 58 | 10.7 | grind/drop → grind/switch → grind/hedge |
| SAS | balanced | drop | man | drop | 54 | 49 | 58 | 10.8 | same |
| TOR | balanced | drop | man | drop | 46 | 53 | 58 | 8.6 | balanced/drop → balanced/switch → balanced/drop → balanced/hedge |
| UTA | balanced | drop | man | drop | 71 | 56 | 58 | 10.8 | same |
| WAS | helio | drop | man | drop | 67 | 31 | 58 | 10.9 | same |

Coverage by team over every sample (% of its defensive trips with a ball screen; non-man: % of its half-court trips in a zone or junk defense):

| Team | trips | drop | switch | hedge | ice | zone | blitz | non-man |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ATL | 5531 | 28.1 | 40.1 | 21.2 | 2.1 | 5.5 | 2.9 | 6.4 |
| BOS | 4560 | 77.3 | 10.4 | 2.5 | 3.6 | 3.7 | 2.4 | 4.3 |
| BKN | 4901 | 40.2 | 10.0 | 37.6 | 4.9 | 4.0 | 3.4 | 4.5 |
| CHA | 4654 | 41.3 | 47.4 | 1.9 | 3.3 | 5.1 | 1.1 | 5.3 |
| CHI | 5437 | 15.5 | 37.1 | 39.0 | 1.2 | 5.8 | 1.3 | 6.2 |
| CLE | 4877 | 73.6 | 9.3 | 2.9 | 6.8 | 4.8 | 2.6 | 5.2 |
| DAL | 5480 | 72.0 | 10.1 | 4.3 | 6.9 | 5.0 | 1.7 | 5.5 |
| DEN | 5634 | 16.5 | 14.1 | 63.0 | 2.3 | 2.6 | 1.5 | 3.0 |
| DET | 5625 | 28.0 | 51.7 | 0.4 | 4.0 | 4.0 | 11.8 | 4.6 |
| GSW | 5070 | 58.7 | 11.6 | 2.1 | 4.3 | 6.3 | 17.0 | 7.1 |
| HOU | 4979 | 74.7 | 12.6 | 2.6 | 3.6 | 4.8 | 1.7 | 5.4 |
| IND | 5229 | 46.1 | 39.1 | 2.0 | 5.4 | 4.7 | 2.6 | 4.8 |
| LAC | 5173 | 55.8 | 10.6 | 17.1 | 3.4 | 4.6 | 8.5 | 5.2 |
| LAL | 5189 | 77.4 | 10.3 | 2.7 | 3.7 | 4.0 | 1.9 | 5.2 |
| MEM | 4848 | 76.4 | 10.8 | 2.3 | 3.9 | 3.9 | 2.6 | 4.4 |
| MIA | 5203 | 26.2 | 43.1 | 2.6 | 7.2 | 10.4 | 10.5 | 11.5 |
| MIL | 4945 | 63.1 | 9.4 | 17.1 | 3.2 | 4.8 | 2.3 | 5.4 |
| MIN | 4662 | 51.6 | 33.7 | 1.3 | 3.4 | 7.1 | 3.0 | 7.2 |
| NOP | 5004 | 63.6 | 20.5 | 5.1 | 3.6 | 5.3 | 1.8 | 6.0 |
| NYK | 5146 | 71.9 | 12.5 | 0.0 | 15.6 | 0.0 | 0.0 | 0.0 |
| OKC | 5837 | 61.1 | 8.4 | 2.5 | 20.2 | 4.6 | 3.4 | 5.2 |
| ORL | 5007 | 7.7 | 35.0 | 44.5 | 4.8 | 4.6 | 3.5 | 5.2 |
| PHI | 5103 | 78.2 | 10.1 | 2.5 | 3.4 | 3.3 | 2.6 | 4.1 |
| PHX | 4860 | 32.9 | 30.1 | 7.4 | 23.8 | 3.4 | 2.5 | 3.9 |
| POR | 5053 | 76.4 | 10.4 | 2.6 | 4.2 | 3.7 | 2.6 | 4.3 |
| SAC | 5024 | 56.0 | 22.8 | 12.4 | 2.2 | 2.8 | 3.8 | 3.0 |
| SAS | 5656 | 74.0 | 9.3 | 2.3 | 5.8 | 4.9 | 3.5 | 5.5 |
| TOR | 5424 | 57.9 | 18.1 | 12.5 | 3.8 | 6.0 | 1.8 | 6.3 |
| UTA | 6000 | 74.3 | 11.1 | 2.0 | 6.5 | 4.9 | 1.2 | 5.4 |
| WAS | 4931 | 70.3 | 10.6 | 6.7 | 4.2 | 4.9 | 3.3 | 5.2 |

### Play types against real NBA Synergy data

Shares of the ten Synergy kinds, percent: the sim's possessions by their last finish as each game result tallies them (the box score's and the lab's play types), its misc left out; NBA.com's plays, renormalised to the ten. Real: /Users/kiarash/Downloads/hoops-career/data/raw/synergy/teams.json. r = correlation across the 30 teams; "sim1" is the first simulated season (2027). The sim counts possessions, Synergy plays (an offensive board starts a new one): compare order and spread, not exact levels.

| Kind | sim1 mean | real 25-26 | real 24-25 | sim1 SD | real SD 25-26 | real SD 24-25 | r sim1~real 25-26 | r sim1~real 24-25 | r real 24-25~25-26 | r sim1~sim2 | r sim2~sim3 | sim PPP | real PPP 25-26 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| isolation | 6.9 | 7.6 | 7.4 | 2.41 | 2.04 | 2.03 | +0.85 | +0.75 | +0.73 | +0.80 | +0.89 | 0.986 | 0.929 |
| transition | 10.9 | 19.6 | 19.6 | 1.62 | 2.54 | 2.37 | +0.74 | +0.50 | +0.48 | +0.53 | +0.71 | 1.359 | 1.136 |
| pnrBH | 17.2 | 16.2 | 16.9 | 3.65 | 3.11 | 2.46 | +0.71 | +0.47 | +0.31 | +0.67 | +0.73 | 1.053 | 0.879 |
| pnrRoll | 7.2 | 5.7 | 6.1 | 1.29 | 1.17 | 1.09 | +0.23 | -0.27 | +0.25 | +0.67 | +0.46 | 1.118 | 1.111 |
| post | 3.3 | 3.6 | 3.7 | 1.40 | 1.47 | 1.69 | +0.75 | +0.55 | +0.74 | +0.55 | +0.60 | 0.992 | 1.004 |
| spotup | 31.5 | 25.8 | 24.3 | 3.83 | 3.39 | 2.64 | +0.27 | -0.10 | +0.59 | +0.51 | +0.54 | 1.113 | 1.048 |
| handoff | 5.7 | 4.8 | 5.2 | 1.68 | 1.52 | 1.43 | +0.54 | +0.33 | +0.51 | +0.78 | +0.73 | 1.043 | 0.946 |
| offscreen | 4.1 | 4.0 | 3.9 | 1.74 | 1.41 | 1.36 | +0.30 | +0.32 | +0.61 | +0.63 | +0.88 | 1.146 | 0.979 |
| cut | 8.5 | 7.2 | 7.3 | 2.19 | 1.58 | 1.35 | +0.47 | +0.30 | +0.61 | +0.65 | +0.64 | 1.459 | 1.310 |
| putback | 4.7 | 5.6 | 5.5 | 0.85 | 0.79 | 0.93 | +0.39 | +0.42 | +0.62 | +0.66 | +0.41 | 1.397 | 1.123 |

Play-type shares by team, 2027 (percent of the ten kinds; misc as a share of all possessions):

| Team | iso | trans | pnrBH | roll | post | spot | hand | offscr | cut | putb | misc | poss |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ATL | 4.4 | 11.8 | 15.1 | 6.0 | 1.7 | 36.6 | 5.6 | 5.9 | 8.4 | 4.6 | 2.6 | 5453 |
| BOS | 10.7 | 6.7 | 22.1 | 5.8 | 1.9 | 31.9 | 6.1 | 3.5 | 4.7 | 6.6 | 3.1 | 3794 |
| BKN | 5.7 | 11.2 | 15.3 | 5.4 | 3.5 | 30.1 | 8.9 | 6.7 | 9.1 | 4.3 | 3.3 | 3962 |
| CHA | 5.7 | 9.3 | 18.8 | 6.4 | 2.1 | 34.7 | 5.7 | 6.6 | 5.4 | 5.2 | 2.9 | 4844 |
| CHI | 4.5 | 13.2 | 20.2 | 8.4 | 2.5 | 31.7 | 4.1 | 2.8 | 8.9 | 3.8 | 2.6 | 4868 |
| CLE | 6.2 | 9.4 | 20.8 | 8.1 | 1.7 | 30.4 | 4.3 | 3.6 | 11.2 | 4.3 | 2.6 | 4185 |
| DAL | 9.4 | 10.6 | 18.0 | 8.9 | 3.5 | 27.1 | 5.3 | 4.3 | 8.0 | 4.9 | 2.6 | 4964 |
| DEN | 5.0 | 9.4 | 15.3 | 5.7 | 7.0 | 33.7 | 6.7 | 3.5 | 9.2 | 4.5 | 2.4 | 4319 |
| DET | 5.1 | 13.4 | 13.6 | 7.7 | 2.8 | 30.0 | 6.7 | 4.1 | 11.8 | 4.9 | 2.5 | 5223 |
| GSW | 6.2 | 10.7 | 13.9 | 9.7 | 1.6 | 31.1 | 7.6 | 4.3 | 11.4 | 3.5 | 2.5 | 4347 |
| HOU | 8.7 | 9.8 | 14.3 | 6.4 | 7.6 | 34.1 | 4.0 | 3.6 | 5.9 | 5.5 | 2.9 | 4620 |
| IND | 3.8 | 12.5 | 17.2 | 10.0 | 2.9 | 36.0 | 4.5 | 2.0 | 6.9 | 4.2 | 2.5 | 5425 |
| LAC | 11.2 | 9.8 | 13.9 | 6.9 | 3.4 | 36.1 | 4.6 | 3.2 | 7.0 | 3.9 | 2.5 | 4779 |
| LAL | 8.3 | 11.7 | 16.2 | 6.9 | 4.8 | 31.7 | 4.9 | 3.7 | 7.6 | 4.3 | 3.1 | 4861 |
| MEM | 4.6 | 11.2 | 14.7 | 8.9 | 4.0 | 36.7 | 4.0 | 3.4 | 7.5 | 4.9 | 2.5 | 5069 |
| MIA | 7.3 | 13.3 | 11.2 | 5.5 | 4.1 | 35.2 | 5.7 | 3.0 | 10.8 | 4.0 | 3.4 | 4779 |
| MIL | 7.4 | 9.6 | 19.3 | 6.4 | 2.9 | 34.3 | 5.1 | 4.9 | 6.3 | 3.9 | 2.5 | 4914 |
| MIN | 13.3 | 10.2 | 16.3 | 6.4 | 2.8 | 23.1 | 7.8 | 7.1 | 8.2 | 4.9 | 2.5 | 4484 |
| NOP | 9.8 | 11.8 | 20.3 | 7.9 | 4.0 | 21.7 | 5.0 | 2.3 | 11.2 | 6.0 | 2.4 | 4623 |
| NYK | 4.5 | 11.4 | 10.8 | 8.1 | 3.1 | 29.0 | 10.9 | 8.6 | 8.6 | 5.0 | 2.7 | 4441 |
| OKC | 8.7 | 12.1 | 21.6 | 7.0 | 2.6 | 33.7 | 3.5 | 1.5 | 5.3 | 4.1 | 3.0 | 4911 |
| ORL | 5.9 | 11.3 | 18.4 | 6.3 | 4.0 | 30.7 | 5.1 | 3.2 | 9.9 | 5.3 | 2.6 | 4434 |
| PHI | 10.4 | 11.0 | 20.1 | 6.4 | 4.3 | 27.0 | 4.2 | 2.3 | 10.6 | 3.7 | 2.4 | 4541 |
| PHX | 7.1 | 9.9 | 25.4 | 5.6 | 1.9 | 30.2 | 6.4 | 3.8 | 5.9 | 3.7 | 2.8 | 4223 |
| POR | 6.2 | 11.0 | 22.2 | 7.9 | 2.0 | 32.9 | 4.2 | 1.8 | 6.2 | 5.5 | 2.2 | 5484 |
| SAC | 6.6 | 8.3 | 15.2 | 8.4 | 3.6 | 34.9 | 4.3 | 5.4 | 8.9 | 4.3 | 2.6 | 4326 |
| SAS | 6.0 | 11.8 | 17.2 | 7.0 | 2.9 | 30.3 | 7.0 | 3.2 | 9.8 | 4.7 | 2.5 | 4440 |
| TOR | 3.8 | 14.4 | 13.5 | 6.3 | 3.1 | 34.3 | 5.6 | 4.2 | 10.0 | 4.8 | 3.0 | 5084 |
| UTA | 6.2 | 10.8 | 13.4 | 9.1 | 1.8 | 25.6 | 8.1 | 7.0 | 13.2 | 4.7 | 2.1 | 5476 |
| WAS | 4.9 | 9.6 | 22.6 | 7.5 | 3.7 | 29.0 | 5.1 | 3.2 | 7.2 | 7.1 | 2.6 | 5020 |
| league | 6.8 | 11.0 | 17.2 | 7.3 | 3.2 | 31.5 | 5.7 | 4.1 | 8.5 | 4.7 | 2.7 | 141893 |

Points per possession by kind, 2027, league: iso 0.986, trans 1.359, pnrBH 1.053, roll 1.118, post 0.992, spot 1.113, hand 1.043, offscr 1.146, cut 1.459, putb 1.397, misc 0.254.

The possession log's own finish field is the first shot's play type (a putback is never first), so the play types above come from the game results. By the log's field, all samples (% of possessions): spotup 33.4, pnrBH 16.9, transition 12.1, cut 8.1, pnrRoll 6.9, iso 6.5, handoff 6.0, offscreen 4.1, post 3.4, misc 2.5.
