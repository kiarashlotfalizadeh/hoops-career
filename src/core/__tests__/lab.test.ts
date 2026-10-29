import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers, wholeMinutes } from '../league/helpers';
import { applyPatch, pairedDelta, runLab, type TacticsPatch } from '../ai/lab';
import { counterCandidates, liveCounter, scoutTeam, teamAlerts } from '../ai/advisor';
import { buildGameReport, impactAdvice } from '../analysis/gameReport';
import { buildSimInput, ensureRotation, playGame } from '../league/games';
import { leverSig } from '../league/staffLever';
import { FINISH_LABEL, type FinishType } from '../sim/log';
import { cloneTactics } from '../sim/tactics';
import type { GameResult, Tactics } from '../types';

describe('batch sims & reports', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
  const side = (tid: number) => ({ team: league.teams[tid], players: teamPlayers(league, tid) });
  it('runs paired Lab batches and writes the post-game report, alerts, counters and scouting the staff can stand behind', () => {
    // Lab games are paired possession by possession: a small change keeps margins correlated
    {
      const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
      for (const t of league.teams) ensureRotation(league, t.tid);
      const corr = (x: number[], y: number[]) => {
        const mx = x.reduce((a, b) => a + b, 0) / x.length;
        const my = y.reduce((a, b) => a + b, 0) / y.length;
        let sxy = 0;
        let sxx = 0;
        let syy = 0;
        for (let i = 0; i < x.length; i++) {
          sxy += (x[i] - mx) * (y[i] - my);
          sxx += (x[i] - mx) ** 2;
          syy += (y[i] - my) ** 2;
        }
        return sxy / Math.sqrt(sxx * syy);
      };

      const a = buildSimInput(league, 0, 1, 'regular', 1);
      const b = buildSimInput(league, 1, 1, 'regular', 0);
      const base = runLab({ a, b, games: 60, seed: 7 });
      const noop = runLab({ a, b, games: 60, seed: 7, patch: { manage: { hackThreshold: 5 } } });
      expect(noop.margins).toEqual(base.margins);
      const help = runLab({ a, b, games: 60, seed: 7, patch: { defense: { help: Math.min(100, a.team.tactics.defense.help + 10) } } });
      // paired: the same seeds keep the games alike (unpaired, about 0). A help change touches every
      // pick-and-roll, so the games drift apart as they go: 0.42 over 600 games, 0.34-0.62 over 60 (round 2026-10-25)
      expect(corr(base.margins, help.margins)).toBeGreaterThan(0.3);
    }
    // is deterministic and paired
    {
      const a = runLab({ a: side(0), b: side(1), games: 6, seed: 42 });
      const b = runLab({ a: side(0), b: side(1), games: 6, seed: 42 });
      expect(pairedDelta(a, b)).toEqual({ delta: 0, se: 0 });
      const c = runLab({ a: side(0), b: side(1), games: 6, seed: 42, patch: { defense: { pnr: 'blitz' } } });
      expect(c.margins.length).toBe(6);
    }
    // plays playoff games when asked: the assistants shorten the rotation to eight, as in real playoff games
    {
      // the ninth man's minutes: a regular-season rotation plays ten, a playoff one leaves him garbage time
      // (over 24 games: six can hold a blowout or two of garbage time, 3.8 a game with the user's opening tactics of 2026-10-25)
      const ninth = (type?: 'playoffs') =>
        Object.values(runLab({ a: side(0), b: side(1), games: 24, seed: 42, type }).players)
          .map((p) => p.min)
          .sort((x, y) => y - x)[8];
      expect(league.teams[0].rotation.manual).toBeFalsy();
      expect(ninth()).toBeGreaterThan(5);
      expect(ninth('playoffs')).toBeLessThan(3);
    }
    // builds a post-game report for the user team
    {
      const g = league.schedule.find((x) => x.home === 0 || x.away === 0)!;
      league.phase = 'regular';
      const res = playGame(league, g);
      const rep = buildGameReport(league, res)!;
      expect(rep.headline.length).toBeGreaterThan(10);
      expect(rep.playTypes.length).toBeGreaterThan(3);
      expect(rep.grades.length).toBeGreaterThan(4);
    }
    // quotes the box score's whole minutes in the player grades
    {
      league.phase = 'regular';
      const res = playGame(
        league,
        league.schedule.find((x) => !x.played && (x.home === 0 || x.away === 0))!,
      );
      const box = res.home.tid === 0 ? res.home : res.away;
      // 240 at the tenth; rounding each line alone gives 242 (31.5 reads 32, the box score's 31)
      const mins = [36.5, 35.5, 33.5, 31.5, 30.5, 22.4, 18.3, 15.2, 10.6, 6.0];
      box.players.forEach((p, i) => (p.min = mins[i] ?? 0));
      const shown = wholeMinutes(box.players);
      const grades = buildGameReport(league, res)!.grades;
      expect(grades).toHaveLength(10);
      for (const g of grades) expect(g.note).toMatch(new RegExp(` in ${shown(g.pid)} min$`));
      expect(grades.find((g) => g.pid === box.players[3].pid)!.note).toMatch(/ in 31 min$/);
    }
    // headlines a factor that went the winner's way, with one colon, and no nail-biter in overtime
    {
      league.phase = 'regular';
      const g = playGame(
        league,
        league.schedule.find((x) => !x.played && (x.home === 0 || x.away === 0))!,
      );
      const side = g.home.tid === 0 ? 'home' : 'away';
      const oppSide = side === 'home' ? 'away' : 'home';
      const [me, them]: (0 | 1)[] = side === 'home' ? [0, 1] : [1, 0];
      // a one-point overtime loss where the biggest effect by far went the user's way
      const res: GameResult = {
        ...g,
        ot: 1,
        [side]: { ...g[side], pts: 120 },
        [oppSide]: { ...g[oppSide], pts: 121 },
        impacts: [
          { key: 'drop_pullup:o', t: me, count: 30, pts: 40, players: {} },
          { key: 'help_kick:o', t: them, count: 1, pts: 0.9, players: {} },
        ],
      };
      const rep = buildGameReport(league, res)!;
      expect(rep.userWon).toBe(false);
      expect(rep.factors[0].pts).toBeGreaterThan(0);
      expect(rep.headline).toMatch(/^The .+ fell to the .+ 121-120 in OT\. Biggest factor: /);
      expect(rep.headline).not.toMatch(/pull-up|nail-biter/);
      expect(rep.headline.split(':')).toHaveLength(2);
      expect(rep.factors.find((f) => f.title.includes('kick-out'))!.detail).toMatch(/^Over 1 play\.$/);
      // an opposing star's big night isn't a row of what decided it (its points of the margin were made
      // up, and "double him" answered what the staff never measured): the box score has his line
      const star: GameResult = { ...res, [oppSide]: { ...res[oppSide], players: res[oppSide].players.map((p, i) => (i === 0 ? { ...p, pts: 45 } : p)) } };
      expect(buildGameReport(league, star)!.factors.map((f) => f.title)).toEqual(rep.factors.map((f) => f.title));
    }
    // only gives advice the team still needs: no "try Hedge" for a team already hedging
    {
      const t = league.teams[0].tactics;
      const drop = applyPatch(t, { defense: { scheme: 'man', pnr: 'drop', starPlan: 'none' } });
      const hedge = applyPatch(t, { defense: { scheme: 'man', pnr: 'hedge', starPlan: 'none' } });
      expect(impactAdvice('drop_pullup:o', drop)).toMatch(/Hedge/);
      expect(impactAdvice('drop_pullup:o', hedge)).toBeUndefined();
      expect(impactAdvice('blitz_4v3:o', hedge)).toBeUndefined();
      expect(impactAdvice('blitz_4v3:o', applyPatch(hedge, { defense: { starPlan: 'double' } }))).toMatch(/Star plan/);
      expect(impactAdvice('fatigue:d', hedge)).toMatch(/sooner/);
      // in the post-game report, against the user's current plan
      league.phase = 'regular';
      const g = playGame(
        league,
        league.schedule.find((x) => !x.played && (x.home === 0 || x.away === 0))!,
      );
      const opp: 0 | 1 = g.home.tid === 0 ? 1 : 0;
      const res = { ...g, impacts: [{ key: 'drop_pullup:o', t: opp, count: 12, pts: 3.2, players: {} }] };
      league.teams[0].tactics = hedge;
      expect(buildGameReport(league, res)!.factors.find((f) => f.title.includes('pull-up'))!.advice).toBeUndefined();
      league.teams[0].tactics = drop;
      expect(buildGameReport(league, res)!.factors.find((f) => f.title.includes('pull-up'))!.advice).toMatch(/Hedge/);
      league.teams[0].tactics = t;
    }
    // never flags a setting on the engine's tally alone: only a change measured in paired games, with the change as its fix
    {
      const team = league.teams[0];
      const [saved, games] = [team.tactics, league.games];
      const mine = league.games.find((g) => g.home.tid === 0 || g.away.tid === 0)!;
      const me: 0 | 1 = mine.home.tid === 0 ? 0 : 1;
      const im = (key: string, t: 0 | 1, pts: number) => ({ key, t, pts, count: 6, players: {} });
      const season = (n: number, lost: number, won: number) =>
        (league.games = Array.from({ length: n }, (_, i) => ({
          ...mine,
          gid: 90000 + i,
          impacts: [im('pressure_to:o', (1 - me) as 0 | 1, lost), im('pressure_blowby:d', me, won)],
        })));
      const lever = () => teamAlerts(league, 0).find((a) => a.id.startsWith('lever-'));
      team.tactics = { ...applyPatch(saved, { defense: { pressure: 40 } }), manual: true };
      season(10, 1.5, 0.3);
      expect(lever()).toBeUndefined();
      // measured on these tactics: a gain clear of the noise is a card, its number the measurement's
      const t = team.tactics;
      const at = (pts: number, raw: number, se: number) =>
        (league.staffLever = {
          season: league.season,
          tid: 0,
          last: league.day,
          moves: [],
          readings: [{ what: 'soft ball pressure', label: 'Pressure the ball', sig: leverSig(t, 'soft ball pressure'), day: league.day, pts, raw, se, games: 2 }],
        });
      at(1.3, 1.6, 0.7);
      const a = lever()!;
      expect(a.title).toBe('Pressure the ball: helps +1.3 a game');
      expect(a.body).toMatch(/^Ball pressure: Balanced → Pressure\. Measured [A-Z][a-z]{2} \d+ on your next two games\.$/);
      expect(a.fix).toMatchObject({ kind: 'patch', label: 'Pressure the ball' });
      expect(applyPatch(team.tactics, (a.fix as { patch: TacticsPatch }).patch).defense.pressure).toBe(65);
      // too close to say, or the staff's own tactics: nothing to say
      at(0.4, 0.8, 0.7);
      expect(lever()).toBeUndefined();
      at(1.3, 1.6, 0.7);
      team.tactics = { ...team.tactics, manual: false };
      expect(lever()).toBeUndefined();
      league.staffLever = undefined;
      // and no playbook swap on its fit alone (it didn't predict what a playbook is worth)
      team.tactics = { ...applyPatch(saved), offPreset: 'grind', defPreset: 'chaos', manual: true };
      expect(teamAlerts(league, 0).some((x) => x.id === 'off-fit' || x.id === 'def-fit')).toBe(false);
      [team.tactics, league.games] = [saved, games];
    }
    // warns about a slow big only where the engine hunts him: on switched ball screens, not off-ball switches
    {
      const team = league.teams[1];
      const saved = team.tactics;
      const big = league.players[team.rotation.order[0]];
      const r = { ...big.ratings };
      big.ratings.hgt = 70;
      big.ratings.spd = 30;
      const ids = () => teamAlerts(league, 1).map((a) => a.id);
      const slowWeakness = () => scoutTeam(league, 1).weaknesses.some((w) => w.startsWith('Switching with a slow big'));
      // drop coverage that switches off the ball: "use Drop or Ice" would be advice it already follows
      team.tactics = applyPatch(saved, { defense: { scheme: 'man', pnr: 'drop', switchOffBall: true } });
      expect(ids()).not.toContain('switch-slow');
      expect(slowWeakness()).toBe(false);
      expect(counterCandidates(league, 0, 1).find((c) => c.id === 'vs-switch')!.why).toMatch(/^They switch off-ball screens\./);
      // the staff's own coverage isn't flagged: only one the user chose
      team.tactics = { ...applyPatch(saved, { defense: { scheme: 'man', pnr: 'switch', switchOffBall: true } }), manual: false };
      expect(ids()).not.toContain('switch-slow');
      team.tactics = { ...applyPatch(saved, { defense: { scheme: 'man', pnr: 'switch', switchOffBall: true } }), manual: true };
      expect(teamAlerts(league, 1).find((a) => a.id === 'switch-slow')!.body).toContain(big.lastName);
      expect(slowWeakness()).toBe(true);
      expect(counterCandidates(league, 0, 1).find((c) => c.id === 'vs-switch')!.why).toMatch(/^They switch everything\./);
      big.ratings = r;
      team.tactics = saved;
    }
    // judges the five healthy starters and counts an injured player's minutes, as the engine does
    {
      const team = league.teams[1];
      const [tactics, rotation] = [team.tactics, team.rotation];
      const big = league.players[team.rotation.order[0]];
      const r = { ...big.ratings };
      big.ratings.hgt = 70;
      big.ratings.spd = 30;
      team.tactics = { ...applyPatch(tactics, { defense: { scheme: 'man', pnr: 'switch' } }), manual: true };
      // a custom rotation whose targets add up to 240, the slow big starting
      const minutes = Object.fromEntries(rotation.order.map((pid, i) => [pid, [36, 34, 33, 31, 29, 24, 20, 16, 12, 5][i] ?? 0]));
      team.rotation = { ...rotation, minutes, manual: true };
      const ids = () => teamAlerts(league, 1).map((a) => a.id);
      expect(ids()).toContain('switch-slow');
      expect(ids()).not.toContain('min-total');
      // out injured, he neither starts nor takes his 36 minutes away from the total
      big.injury = { type: 'Sprained ankle', gamesRemaining: 4, gamesTotal: 4, severity: 'minor' };
      expect(ids()).not.toContain('switch-slow');
      expect(ids()).not.toContain('min-total');
      big.injury = null;
      big.ratings = r;
      [team.tactics, team.rotation] = [tactics, rotation];
    }
    // only tells you to rest a worn-down player on back-to-backs when he does not already
    {
      const rotation = league.teams[2].rotation;
      const p = teamPlayers(league, 2)[0];
      const wear = p.wear;
      p.wear = 70;
      const body = () => teamAlerts(league, 2).find((a) => a.id === `wear-${p.pid}`)!.body;
      league.teams[2].rotation = { ...rotation, restB2B: [], caps: {} };
      expect(body()).toMatch(/^Season wear 70\. .* Rest him on back-to-backs, on Rotation\.$/);
      league.teams[2].rotation = { ...rotation, restB2B: [p.pid], caps: {} };
      expect(body()).toMatch(/already rests on back-to-backs\. A hard minute cap on Rotation/);
      league.teams[2].rotation = { ...rotation, restB2B: [p.pid], caps: { [p.pid]: 28 } };
      expect(body()).toMatch(/Lowering his 28-minute cap on Rotation/);
      // the postseason has no back-to-backs, a team that's out has no load to manage, and the summer has none
      const ts = league.teams[2].seasons.find((s) => s.season === league.season)!;
      const round = ts.playoffRound;
      league.phase = 'playoffs';
      ts.playoffRound = 1;
      league.teams[2].rotation = { ...rotation, restB2B: [], caps: {} };
      expect(body()).toMatch(/^Season wear 70\. .* A hard minute cap on Rotation lightens his load\.$/);
      ts.playoffRound = -1;
      expect(teamAlerts(league, 2).some((a) => a.id === `wear-${p.pid}`)).toBe(false);
      league.phase = 'draft';
      expect(teamAlerts(league, 2).some((a) => a.id === `wear-${p.pid}`)).toBe(false);
      league.phase = 'regular';
      ts.playoffRound = round;
      league.teams[2].rotation = rotation;
      p.wear = wear;
    }
    // doesn't flag the holes in a five the staff picked, nor any lineup in the offseason
    {
      const lineupAlerts = (tid: number) => teamAlerts(league, tid).filter((a) => a.id.startsWith('lineup-') || a.id === 'star-min');
      const saved = league.teams.map((t) => t.rotation);
      let flagged = 0;
      for (const t of league.teams) {
        t.rotation = { ...t.rotation, manual: false };
        expect(lineupAlerts(t.tid)).toEqual([]);
        t.rotation = { ...t.rotation, manual: true };
        flagged += lineupAlerts(t.tid).length;
      }
      // the same fives, the user's own: some have holes worth a word
      expect(flagged).toBeGreaterThan(0);
      const phase = league.phase;
      league.phase = 'freeAgency';
      for (const t of league.teams) expect(lineupAlerts(t.tid)).toEqual([]);
      league.phase = phase;
      league.teams.forEach((t, i) => (t.rotation = saved[i]));
    }
    // leaves a newcomer's minutes to an assistant-run rotation, and names a star a manual one leaves out
    {
      const rotation = league.teams[2].rotation;
      const best = teamPlayers(league, 2)
        .filter((p) => !p.injury)
        .sort((a, b) => b.ovr - a.ovr)[0];
      const others = Object.fromEntries(Object.entries(rotation.minutes).filter(([pid]) => +pid !== best.pid));
      const star = () => teamAlerts(league, 2).find((a) => a.id === 'star-min');
      // not planned yet (signed in the summer, traded for today): the assistant plans him at the next game
      league.teams[2].rotation = { ...rotation, minutes: others, manual: false };
      expect(star()).toBeUndefined();
      league.teams[2].rotation = { ...rotation, minutes: others, manual: true };
      expect(star()!.title).toBe(`${best.lastName} isn't getting any minutes`);
      league.teams[2].rotation = { ...rotation, minutes: { ...others, [best.pid]: 1 }, manual: true };
      expect(star()!.title).toBe(`${best.lastName} is only playing 1 minute`);
      league.teams[2].rotation = rotation;
    }
    // only offers a live game's quick counter when it changes something, and never pulls a slider back
    {
      const at = (patch: TacticsPatch) => applyPatch(league.teams[0].tactics, patch);
      const after = (ft: FinishType, t: Tactics) => {
        const x = cloneTactics(t);
        liveCounter(ft, t)!.apply(x);
        return x;
      };
      // already getting back and off the glass: "Sprint back" would do nothing
      expect(liveCounter('transition', at({ defense: { getBack: 85 }, offense: { crashBoards: 45 } }))).toBeUndefined();
      expect(liveCounter('transition', at({ defense: { getBack: 95 }, offense: { crashBoards: 10 } }))).toBeUndefined();
      // still crashing: it pulls back from the glass to the middle (crashing less than that gives up more
      // second chances than the run-outs it saves) and keeps the faster transition defense
      const crashing = after('transition', at({ defense: { getBack: 95 }, offense: { crashBoards: 60 } }));
      expect([crashing.defense.getBack, crashing.offense.crashBoards]).toEqual([95, 45]);
      // already doubling the post: no "Double the post" that would lower help from 90 to 80
      expect(liveCounter('post', at({ defense: { help: 80 } }))).toBeUndefined();
      expect(liveCounter('post', at({ defense: { help: 90 } }))).toBeUndefined();
      expect(after('post', at({ defense: { help: 60 } })).defense.help).toBe(80);
      // whatever the tactics, an offered counter changes them
      for (const ft of Object.keys(FINISH_LABEL) as FinishType[])
        for (const patch of [
          {},
          { defense: { scheme: 'man', pnr: 'drop', help: 70 } },
          { defense: { scheme: 'zone23', help: 40 } },
          { defense: { scheme: 'man', pnr: 'switch', help: 85 } },
        ] as TacticsPatch[]) {
          const t = at(patch);
          if (liveCounter(ft, t)) expect(JSON.stringify(after(ft, t))).not.toBe(JSON.stringify(t));
        }
    }
    // only offers counters that change something
    {
      const [mine, opp] = [league.teams[0], league.teams[1]];
      const saved = [mine.tactics, opp.tactics];
      opp.tactics = applyPatch(opp.tactics, { defense: { scheme: 'man', pnr: 'drop' } });
      mine.tactics = applyPatch(mine.tactics, { offense: { actions: { ...mine.tactics.offense.actions, pnr: 60, handoff: 60 } } });
      expect(counterCandidates(league, 0, 1).map((c) => c.id)).toContain('vs-drop');
      mine.tactics = applyPatch(mine.tactics, { offense: { actions: { ...mine.tactics.offense.actions, pnr: 100, handoff: 100 } } });
      expect(counterCandidates(league, 0, 1).map((c) => c.id)).not.toContain('vs-drop');
      [mine.tactics, opp.tactics] = saved;
    }
    // gives a zone no ball-screen coverage advice, and says when a coverage counter leaves your zone
    {
      const [mine, opp] = [league.teams[0], league.teams[1]];
      const saved = [mine.tactics, opp.tactics];
      // a zone keeps the coverage it had in man-to-man, but the engine ignores it
      opp.tactics = applyPatch(opp.tactics, { defense: { scheme: 'zone23', pnr: 'drop', switchOffBall: true } });
      const rep = scoutTeam(league, 1);
      expect(rep.defense[0]).toMatch(/no ball-screen coverage/);
      expect(rep.weaknesses.join(' ')).not.toMatch(/Drop|Switching|Blitz/);
      expect(counterCandidates(league, 0, 1).map((c) => c.id)).not.toContain('vs-switch');
      expect(teamAlerts(league, 1).map((a) => a.id)).not.toContain('drop-noprot');
      // from a zone, a coverage counter is a move to man-to-man too, and only Switch switches off the ball
      mine.tactics = applyPatch(mine.tactics, { defense: { scheme: 'zone23', pnr: 'switch', switchOffBall: false } });
      const covs = counterCandidates(league, 0, 1).filter((c) => c.id.startsWith('cov-'));
      expect(covs.map((c) => c.id)).toContain('cov-switch');
      for (const c of covs) {
        expect(c.patch.defense).toMatchObject({ scheme: 'man' });
        expect(c.patch.defense?.switchOffBall).toBe(c.id === 'cov-switch' ? true : undefined);
        expect(c.why).toMatch(/man-to-man instead of your zone/);
      }
      [mine.tactics, opp.tactics] = saved;
    }
    // reads spacing as scouting does: packs the paint against the poor spacing it flags, never suggests a zone, never pack the paint and stay home at once
    {
      const mine = league.teams[0];
      const saved = mine.tactics;
      mine.tactics = applyPatch(saved, { defense: { scheme: 'man', help: 55 } });
      let flagged = 0;
      for (let tid = 1; tid < 30; tid++) {
        const poor = scoutTeam(league, tid).weaknesses.some((w) => w.startsWith('Few shooters in their five'));
        const ids = counterCandidates(league, 0, tid).map((c) => c.id);
        // (a 2-3 zone lost points even against the cramped post-up teams it's built for: the staff leaves it to the Defense tab)
        expect(ids).not.toContain('zone');
        if (poor) expect(ids).toContain('help-high');
        expect(ids.includes('help-high') && ids.includes('help-low')).toBe(false);
        flagged += +poor;
      }
      expect(flagged).toBeGreaterThan(0);
      expect(flagged).toBeLessThan(15);
      mine.tactics = saved;
    }
    // scouts in plain English: plural team names, the creator role named once
    {
      for (let tid = 1; tid < 30; tid++) {
        for (const t of scoutTeam(league, tid).threats) expect(t.why).not.toMatch(/Primary creator, Primary Creator/);
        for (const c of counterCandidates(league, 0, tid)) expect(c.why).not.toMatch(new RegExp(`^${league.teams[tid].name} (is|spaces)\\b`));
      }
    }
  });
});
