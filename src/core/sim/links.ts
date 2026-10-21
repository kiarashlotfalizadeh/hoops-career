// Partnerships: what two players' roles do together, as Football Manager's role pairings. Two
// teammates on the floor whose roles complement each other form a link, and the engine plays it in
// the action it belongs to: a lead handler and a rim runner's two-man game (the roll), a handler and a
// stretch big's pick-and-pop, a post hub kicking out to a shooter, a playmaking hub handing off to a
// shooter or hitting a cutter, and on defense a point-of-attack stopper funnelling drives into a rim
// anchor. A link plays at its fit (what the two bring to it) and the pair's understanding (the
// minutes they've shared, kept in Familiarity.duo: a pair a trade just put together has little).
// Roles can also clash: two bigs who live inside (rim runners, post hubs) crowd the paint for
// everyone else, except in a double post, the shape built for them. No controls of its own: roles,
// the shape and the rotation make the links, and the board shows them. Pure.

import type { DefRole, Familiarity, OffRole, OffShape, Player, Ratings, Tactics } from '../types';
import { clamp } from '../random';
import { archetype, composites, type Composites } from '../ratings';
import { defRoleOf, shapeOf } from './tactics';

export type LinkId = 'twoMan' | 'popMan' | 'inOut' | 'dho' | 'wall';
export type ClashId = 'crowd';

export const LINK_IDS: LinkId[] = ['twoMan', 'popMan', 'inOut', 'dho', 'wall'];

/** The roles that run the ball screens a two-man game or a pick-and-pop needs. */
export const HANDLER_ROLES: OffRole[] = ['creator', 'scorer', 'playmaker'];

export const LINK_META: Record<LinkId, { label: string; end: 'off' | 'def'; a: string; b: string; help: string }> = {
  twoMan: {
    label: 'Two-man game',
    end: 'off',
    a: 'A handler (Primary Creator, Secondary Scorer or Playmaker)',
    b: 'a Rim Runner',
    help: 'The handler and his roll man find each other on the pick-and-roll: more of the screens are his, and the pocket passes and lobs land cleaner.',
  },
  popMan: {
    label: 'Pick-and-pop',
    end: 'off',
    a: 'A handler (Primary Creator, Secondary Scorer or Playmaker)',
    b: 'a Stretch Big',
    help: 'The handler and his popping big: more of the screens are his, and his catch on the pop comes in rhythm.',
  },
  inOut: {
    label: 'Inside-out',
    end: 'off',
    a: 'A Post Hub',
    b: 'a Movement Shooter or Glue Guy',
    help: 'The post hub knows where his shooter relocates: the kick-out out of the post, and out of the double, finds him readier.',
  },
  dho: {
    label: 'Handoff chain',
    end: 'off',
    a: 'A Playmaking Hub',
    b: 'a Movement Shooter or Slasher',
    help: 'The hub and his runner: handoffs come at the right moment and the backdoor pass beats the overplay.',
  },
  wall: {
    label: 'The wall',
    end: 'def',
    a: 'A Point-of-Attack Stopper',
    b: 'a Rim Anchor',
    help: 'The stopper sends the ball where his anchor waits: drives past him meet a contest at the rim that knows they’re coming.',
  },
};

export const CLASH_META: Record<ClashId, { label: string; help: string }> = {
  crowd: {
    label: 'Crowded paint',
    help: 'Two bigs who live inside (Rim Runners, Post Hubs) out of a shape built for one: everyone else’s drives and cuts find bodies in the paint. A double post is the shape for two bigs.',
  },
};

/** Understanding a pair that has never shared the floor starts at, and the level a link plays in full from. */
export const NEW_DUO = 35;
export const GELLED = 90;

/** A pair's key in Familiarity.duo: '12-345', the lower pid first. */
export const duoKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** How well two teammates understand each other (none kept: NEW_DUO; no record at all: gelled, as familiarity reads it). */
export function duoOf(fam: Familiarity | undefined, a: number, b: number): number {
  if (!fam) return 100;
  return fam.duo?.[duoKey(a, b)] ?? NEW_DUO;
}

/** A player's offensive role as the tactics give it (his archetype's when none is set). */
export const offRoleOf = (t: Tactics, p: { pid: number; ratings: Ratings }): OffRole => t.offense.roles[p.pid] ?? archetype(p.ratings).role;

/** The offensive roles that lead a link (the passer's). */
const LEADS = new Set<OffRole>([...HANDLER_ROLES, 'post', 'hub']);

/** Which link, if any, `a` forms with `b` in that order (a the passer or the stopper), from their roles. */
export function linkKind(aOff: OffRole, bOff: OffRole, aDef: DefRole, bDef: DefRole): LinkId[] {
  const out: LinkId[] = [];
  if (HANDLER_ROLES.includes(aOff) && bOff === 'roller') out.push('twoMan');
  if (HANDLER_ROLES.includes(aOff) && bOff === 'stretch') out.push('popMan');
  if (aOff === 'post' && (bOff === 'shooter' || bOff === 'glue')) out.push('inOut');
  if (aOff === 'hub' && (bOff === 'shooter' || bOff === 'slasher')) out.push('dho');
  if (aDef === 'poa' && bDef === 'anchor') out.push('wall');
  return out;
}

const geo = (x: number, y: number) => Math.sqrt(Math.max(1, x) * Math.max(1, y));
const handling = (c: Composites) => 0.5 * c.pnrHandle + 0.5 * c.passing;

/** What the two bring to a link (0-100, on the ratings' scale): each one's half of it, as a geometric mean (a link is only as good as both). */
export function linkFit(id: LinkId, a: Composites, b: Composites): number {
  switch (id) {
    case 'twoMan':
      return geo(handling(a), b.roll);
    case 'popMan':
      return geo(handling(a), b.pop);
    case 'inOut':
      return geo(0.5 * a.postScore + 0.5 * a.passing, b.c3);
    case 'dho':
      return geo(a.passing, Math.max(b.offBall, b.cut));
    case 'wall':
      return geo(a.perDef, b.rimProt);
  }
}

/** A partnership worth naming outside the board (the matchup preview, the trade dock, the bench's best pair): at least this strong. */
export const LINK_NAMED = 0.3;

/** A fit's share of a link's full effect: none at 45, all of it at 75, a little more past it. */
export const fitShare = (fit: number) => clamp((fit - 45) / 30, 0, 1.3);
/** Understanding's share of a link's full effect: none for a pair new to each other, all of it once they've gelled. */
export const duoShare = (u: number) => clamp((u - NEW_DUO) / (GELLED - NEW_DUO), 0, 1);

export interface Link {
  id: LinkId;
  /** The passer (the handler, the post hub, the hub) or the stopper, and his partner. */
  a: number;
  b: number;
  fit: number;
  understanding: number;
  /** What the engine plays it at: fitShare times duoShare. */
  strength: number;
}

export interface Clash {
  id: ClashId;
  pids: number[];
}

/** The links and clashes among players on the floor together with tactics `t` (all of them: `five` can be any group). */
export function lineupLinks(t: Tactics, five: Pick<Player, 'pid' | 'ratings'>[], fam?: Familiarity): { links: Link[]; clashes: Clash[] } {
  const rows = five.map((p) => ({ pid: p.pid, off: offRoleOf(t, p), def: defRoleOf(t.defense, p.pid), c: composites(p.ratings) }));
  return linksAmong(rows, shapeOf(t.offense), fam);
}

/** A player as links read him: his roles at both ends and his composites. */
export interface LinkRow {
  pid: number;
  off: OffRole;
  def: DefRole;
  c: Composites;
}

/** The links (strongest first) and clashes among `rows` in shape `shape` (what lineupLinks and the engine share). */
export function linksAmong(rows: LinkRow[], shape: OffShape, fam?: Familiarity): { links: Link[]; clashes: Clash[] } {
  const links: Link[] = [];
  for (const a of rows) {
    // (only a handler, a post hub, a hub or a point-of-attack stopper leads a link: the engine runs this at every substitution)
    if (!LEADS.has(a.off) && a.def !== 'poa') continue;
    for (const b of rows) {
      if (a === b) continue;
      for (const id of linkKind(a.off, b.off, a.def, b.def)) {
        const fit = linkFit(id, a.c, b.c);
        const understanding = duoOf(fam, a.pid, b.pid);
        links.push({ id, a: a.pid, b: b.pid, fit, understanding, strength: fitShare(fit) * duoShare(understanding) });
      }
    }
  }
  links.sort((x, y) => y.strength - x.strength || y.fit - x.fit);
  const clashes: Clash[] = [];
  const inside = rows.filter((r) => r.off === 'roller' || r.off === 'post');
  if (inside.length >= 2 && crowds(shape)) clashes.push({ id: 'crowd', pids: inside.map((r) => r.pid) });
  return { links, clashes };
}

/** Shapes two inside bigs crowd (all but the double post, built for them). */
export const crowds = (s: OffShape) => s !== 'twoIn';

/** A link in a few words: "Brunson → Towns · Pick-and-pop". */
export function linkText(l: Link, name: (pid: number) => string): string {
  return `${name(l.a)} → ${name(l.b)} · ${LINK_META[l.id].label}`;
}

/** A link's standing, as the screens say it: by what the engine plays it at, and why it isn't more. */
export function linkState(l: Link): { word: 'Strong' | 'Good' | 'Building' | 'Weak'; why: string } {
  if (fitShare(l.fit) < 0.35) return { word: 'Weak', why: 'The two don’t bring enough to it' };
  if (duoShare(l.understanding) < 0.7) return { word: 'Building', why: `Understanding ${Math.round(l.understanding)}%: it grows with minutes together` };
  return l.strength >= 0.85 ? { word: 'Strong', why: 'A fit, and they know each other' } : { word: 'Good', why: 'They know each other' };
}

/**
 * The links a player would have with the others in `five` in each offensive role (his defensive one as
 * it is): what the role picker shows next to each role. Only roles that make at least one.
 */
export function linksByRole(t: Tactics, five: Pick<Player, 'pid' | 'ratings'>[], pid: number, fam?: Familiarity): Partial<Record<OffRole, Link[]>> {
  const me = five.find((p) => p.pid === pid);
  if (!me) return {};
  const out: Partial<Record<OffRole, Link[]>> = {};
  const roles: OffRole[] = ['creator', 'scorer', 'playmaker', 'shooter', 'slasher', 'roller', 'stretch', 'post', 'hub', 'glue'];
  for (const role of roles) {
    const tt: Tactics = { ...t, offense: { ...t.offense, roles: { ...t.offense.roles, [pid]: role } } };
    const mine = lineupLinks(tt, five, fam).links.filter((l) => (l.a === pid || l.b === pid) && LINK_META[l.id].end === 'off');
    if (mine.length) out[role] = mine;
  }
  return out;
}
