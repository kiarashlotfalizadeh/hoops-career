// Partnerships (src/core/sim/links.ts): which roles link and which clash, what a link plays at (its
// fit and the pair's understanding), how minutes together and practice build understanding, what the
// engine makes of links, and the headline decisions over the action weights and the glass.
import { describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { afterGame, freshFamiliarity, practiceDay, sharedSeconds } from '../sim/familiarity';
import { GELLED, NEW_DUO, duoKey, duoOf, duoShare, fitShare, lineupLinks, linkState, linksByRole } from '../sim/links';
import { FOCUS_META, GLASS_LEVELS, PLAY_FOCI, applyFocus, cloneTactics, focusOf, glassLevel, setGlassLevel } from '../sim/tactics';
import { teamPlayers } from '../league/helpers';
import { GameSim } from '../sim/engine';
import { Rng } from '../random';
import { autoRoles, partnerRoles, shapeFits } from '../ai/coachAI';
import { roleFits } from '../analysis/system';
import { teamAlerts } from '../ai/advisor';
import type { League, Player, Tactics } from '../types';

const user = (l: League) => l.teams[l.userTid];
const roster = (l: League) => teamPlayers(l, l.userTid);
const five = (l: League) => {
  const ps = roster(l);
  return user(l)
    .rotation.order.slice(0, 5)
    .map((pid) => ps.find((p) => p.pid === pid)!);
};
/** Tactics with every one of `ps` a Glue Guy and a Position Defender but the roles given. */
function cast(t: Tactics, ps: Player[], off: Record<number, string>, def: Record<number, string> = {}): Tactics {
  const out = cloneTactics(t);
  for (const p of ps) out.offense.roles[p.pid] = (off[p.pid] ?? 'glue') as never;
  out.defense.roles = Object.fromEntries(ps.map((p) => [p.pid, (def[p.pid] ?? 'standard') as never]));
  delete out.offense.shape;
  return out;
}

describe('partnerships', () => {
  it('link complementary roles, both ways round only where the action has a passer and a finisher', () => {
    const l = testLeague();
    const [a, b, c, d, e] = five(l);
    const t = cast(
      user(l).tactics,
      five(l),
      { [a.pid]: 'creator', [b.pid]: 'roller', [c.pid]: 'hub', [d.pid]: 'shooter', [e.pid]: 'stretch' },
      { [a.pid]: 'poa', [b.pid]: 'anchor' },
    );
    const { links, clashes } = lineupLinks(t, five(l));
    const has = (id: string, x: Player, y: Player) => links.some((k) => k.id === id && k.a === x.pid && k.b === y.pid);
    expect(has('twoMan', a, b)).toBe(true);
    expect(has('popMan', a, e)).toBe(true);
    expect(has('dho', c, d)).toBe(true);
    expect(has('wall', a, b)).toBe(true);
    // (the roll man doesn't run the two-man game for his handler)
    expect(has('twoMan', b, a)).toBe(false);
    expect(clashes).toEqual([]);
    // no record of what the team knows: gelled, as familiarity reads it
    expect(links.every((k) => k.understanding === 100)).toBe(true);
    expect(links[0].strength).toBeGreaterThanOrEqual(links.at(-1)!.strength);
  });

  it('crowd the paint with two inside bigs, except in the double post built for them', () => {
    const l = testLeague();
    const [a, b, c] = five(l);
    const t = cast(user(l).tactics, five(l), { [a.pid]: 'creator', [b.pid]: 'roller', [c.pid]: 'post' });
    expect(lineupLinks(t, five(l)).clashes).toEqual([{ id: 'crowd', pids: [b.pid, c.pid] }]);
    t.offense.shape = 'twoIn';
    expect(lineupLinks(t, five(l)).clashes).toEqual([]);
    // the staff's shape fit for the double post counts the crowd it spares
    t.offense.shape = undefined;
    const crowded = shapeFits(five(l), t).twoIn;
    t.offense.roles[c.pid] = 'glue';
    expect(crowded).toBeGreaterThan(shapeFits(five(l), t).twoIn);
  });

  it('play at their fit and the pair’s understanding: nothing for strangers, all of it once they’ve gelled', () => {
    expect(duoShare(NEW_DUO)).toBe(0);
    expect(duoShare(GELLED)).toBe(1);
    expect(fitShare(45)).toBe(0);
    expect(fitShare(75)).toBe(1);
    const l = testLeague();
    const [a, b] = five(l);
    const t = cast(user(l).tactics, five(l), { [a.pid]: 'creator', [b.pid]: 'roller' });
    const fam = freshFamiliarity(user(l), roster(l), 97);
    const gelled = lineupLinks(t, five(l), fam).links.find((k) => k.id === 'twoMan')!;
    expect(gelled.understanding).toBe(90);
    fam.duo = {};
    const fresh = lineupLinks(t, five(l), fam).links.find((k) => k.id === 'twoMan')!;
    expect(fresh.understanding).toBe(NEW_DUO);
    expect(fresh.strength).toBe(0);
    expect(linkState(fresh).word).toMatch(/Building|Weak/);
    // the role picker: what each of his roles would make with the five
    const byRole = linksByRole(t, five(l), b.pid, fam);
    expect(byRole.roller?.[0].id).toBe('twoMan');
    expect(byRole.glue).toBeUndefined();
  });

  it('build understanding from minutes shared on the floor and in practice, and forget pairs with a player gone', () => {
    const l = testLeague();
    const ps = roster(l);
    const [a, b, c] = five(l);
    const fam = freshFamiliarity(user(l), ps, 97);
    fam.duo = {};
    const shared = sharedSeconds(
      [
        { t: 0, pids: [a.pid, b.pid, c.pid, 1, 2], sec: 1000 },
        { t: 0, pids: [a.pid, b.pid, 3, 4, 5], sec: 440 },
        { t: 1, pids: [a.pid, c.pid, 6, 7, 8], sec: 900 },
      ],
      0,
    );
    expect(shared[duoKey(a.pid, b.pid)]).toBe(1440);
    expect(shared[duoKey(a.pid, c.pid)]).toBe(1000);
    afterGame(fam, user(l).tactics, ps, {}, shared);
    const ab = duoOf(fam, a.pid, b.pid);
    const ac = duoOf(fam, a.pid, c.pid);
    expect(ab).toBeGreaterThan(ac);
    expect(ac).toBeGreaterThan(NEW_DUO);
    // practice: the rotation's pairs a little; a departed player's pairs are forgotten
    const team = { ...user(l), fam };
    practiceDay(team, ps);
    expect(duoOf(fam, a.pid, b.pid)).toBeGreaterThan(ab);
    practiceDay(
      team,
      ps.filter((p) => p.pid !== b.pid),
    );
    expect(fam.duo![duoKey(a.pid, b.pid)]).toBeUndefined();
  });

  it('starts a team’s rotation gelled after camp', () => {
    const l = testLeague();
    const fam = freshFamiliarity(user(l), roster(l), 97);
    const [a, b] = five(l);
    expect(duoOf(fam, a.pid, b.pid)).toBe(90);
  });

  it('are played by the engine only with a record of understanding, and tagged for the reports', () => {
    const l = testLeague();
    const ps = roster(l);
    const [a, b] = five(l);
    const tactics = cast(user(l).tactics, five(l), { [a.pid]: 'creator', [b.pid]: 'roller' });
    const team = { ...user(l), tactics };
    const opp = l.teams.find((t) => t.tid !== l.userTid)!;
    const play = (fam: ReturnType<typeof freshFamiliarity> | undefined) => {
      const sim = new GameSim(
        { team: { ...team, fam }, players: ps },
        { team: { ...opp, fam: undefined }, players: teamPlayers(l, opp.tid) },
        { rng: new Rng(41), type: 'regular' },
      );
      sim.simToEnd();
      return [...sim.impacts.keys()].filter((k) => k.startsWith('link_') || k.startsWith('clash_'));
    };
    expect(play(undefined)).toEqual([]);
    expect(play(freshFamiliarity(team, ps, 97)).some((k) => k.startsWith('link_twoMan:o'))).toBe(true);
    const strangers = freshFamiliarity(team, ps, 97);
    strangers.duo = {};
    expect(play(strangers).some((k) => k.startsWith('link_twoMan'))).toBe(false);
  });

  it('are what the user’s staff casts for: a big beside a handler takes the role that partners him, if it suits him as well', () => {
    const l = testLeague();
    const ps = roster(l);
    const order = user(l).rotation.order;
    const { roles } = autoRoles(ps);
    const starters = five(l);
    const handler = starters.find((p) => ['creator', 'scorer', 'playmaker'].includes(roles[p.pid]));
    // a starting big made a glue guy who'd be an excellent rim runner, the five without a roller or a popper
    const big = [...starters].sort((a, b) => b.ratings.hgt - a.ratings.hgt).find((p) => p !== handler)!;
    for (const p of starters) if (roles[p.pid] === 'roller' || roles[p.pid] === 'stretch' || roles[p.pid] === 'post') roles[p.pid] = 'glue';
    Object.assign(big.ratings, { ins: 90, ath: 85, str: 85, hgt: Math.max(big.ratings.hgt, 70), oiq: 80, tp: 20 });
    big.ovr = 40; // (not one of the two focal players, whose roles the staff keeps)
    expect(roleFits(big).roller).toBeGreaterThan(roleFits(big).glue);
    expect(handler).toBeDefined();
    partnerRoles(roles, ps, order);
    expect(roles[big.pid]).toBe('roller');
  });

  it('show up in the staff’s advice: two bigs crowding the paint, with the fix', () => {
    const l = testLeague();
    const [a, b, c] = five(l);
    const t = user(l);
    t.tactics = cast(t.tactics, five(l), { [a.pid]: 'creator', [b.pid]: 'roller', [c.pid]: 'post' });
    t.tactics.manual = true;
    const alert = teamAlerts(l, l.userTid).find((x) => x.id === 'link-crowd');
    expect(alert?.fix?.kind).toBe('patch');
  });
});

describe('headline decisions', () => {
  it('read and set what the half court plays through', () => {
    const l = testLeague();
    const o = cloneTactics(user(l).tactics).offense;
    for (const f of PLAY_FOCI) {
      applyFocus(o, f);
      expect(o.actions).toEqual(FOCUS_META[f].actions);
      expect(focusOf(o)).toBe(f);
    }
    // a mix far from every focus is its own
    o.actions = { pnr: 100, iso: 0, post: 100, handoff: 0, motion: 100 };
    expect(focusOf(o)).toBeNull();
  });

  it('read and set when a shot goes up, both ends at once', () => {
    const l = testLeague();
    const t = cloneTactics(user(l).tactics);
    GLASS_LEVELS.forEach((lv, i) => {
      setGlassLevel(t, i);
      expect([t.offense.crashBoards, t.defense.getBack]).toEqual([lv.crash, lv.getBack]);
      expect(glassLevel(t)).toBe(i);
    });
  });
});
