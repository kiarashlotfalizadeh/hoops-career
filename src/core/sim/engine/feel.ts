// The game's feel (FEEL): where the engine is played louder than life on purpose. K and the tactics'
// true-to-life sizes (tk.ts's LIFE) are fitted to the NBA; this table is what the game adds on top so
// that a coach's choices and a great player's nights can be felt: tactics at a multiple of their real
// size, a hot hand that is real, momentum a timeout can break, a drawn-up play out of a timeout that
// pays, and room at the very top for the rare player the league's ceilings would otherwise hold to
// 2025-26's best. Written November 2026 at the user's ask ("exaggerated tactics", "a slightly louder
// coaching signal", "wider tails for rare legends").
//
// `FEEL.purist` is the same table with every dial at life size. The realism harnesses that compare the
// engine with NBA play-by-play can run on it (env HC_FEEL=purist, or a JSON patch by path: the
// measuring scripts' worker processes inherit it); the game itself always plays FEEL as written.

export interface Feel {
  /**
   * The tactics gain: every tactical edge in tk.ts is played at this many times its true-to-life
   * size (`edge`), every tactical multiplier at its life size to the power `mult`, and a look's room
   * counts by who gets it this much more sharply (`fit`: TK.use's step divided by it). At life size
   * a setting's worth is about half a point per 100 possessions, under the noise of a week of games;
   * at this gain the right coverage, shape or pace for a roster and an opponent is worth two to five.
   */
  tactics: { edge: number; mult: number; fit: number };
  /**
   * The hot hand. A player's streak is his makes in a row tonight (a miss takes `miss` off it, a
   * stint on the bench `sit`); from `from` straight makes each one adds `per` to his make
   * probability, up to `max`. Cold: from `coldFrom` straight misses each takes `coldPer` off, down to
   * `coldMax`, until one falls. A hot player draws the ball: his usage weight times `feed` (times
   * `feedCall` when the offense is told to feed the hot hand). At life size none of it exists.
   */
  hot: { from: number; per: number; max: number; miss: number; sit: number; coldFrom: number; coldPer: number; coldMax: number; feed: number; feedCall: number };
  /**
   * Momentum: a side on a run of `from` unanswered points or more shoots `per` better for each two
   * points past it, up to `max` (`home` times as much in its own building), and the side it is
   * running on turns it over `to` more often at the top of it. A timeout ends the run, as a basket
   * does: stopping one is what a timeout is for.
   */
  momentum: { from: number; per: number; max: number; home: number; to: number };
  /**
   * Out of a timeout: the first half-court trip's first action starts `open` more open when the
   * bench drew something up for it (an after-timeout play, a called set, an AI coach's set), `plain`
   * when it just got organised; as much as the coach's tactics rating makes of it (`at` of it at 50,
   * `per` more a point), less `set` when it was the defense that called time and is set for it. Its
   * turnovers come at `to` of the usual rate. An AI coach's own set keeps `aiSet` more of its edge
   * than at life size (TK.aiSet).
   */
  ato: { open: number; plain: number; at: number; per: number; set: number; to: number; aiSet: number };
  /**
   * Room at the top. A player whose ratings are past the best the league had when it was made (see
   * legendRoom: his raw overall over the top of the league's scale, all of the room `span` raw points
   * past it) gets, at full room: `use` more of his team's possessions before the ball is steered to
   * others, `ceil` more before the hard ceiling, `contest` of the tougher looks a high share brings
   * taken away, `three` more of his team's threes before his are run off the line, and his team
   * runs `feature` more of its offense through him (his usage tendency times 1 + it). So the
   * league's ceilings hold everyone the real league has seen and give way for the one player in a
   * generation who is past it (league/legends.ts makes and keeps those).
   *
   * Sized 2026-11-24 to the legends the league now makes (legends.ts: a peak of 3.5 raw points at
   * most, so `span` is that, and a legend at his peak has all of it). Until then: span 6, use 0.09,
   * ceil 0.11, contest 0.7, three 0.05, feature 0.9, with peaks to 7. A legend at 0.6 of that room
   * used 46% of his team's possessions and scored 41.8 to 45.9 a game, one at all of it 47-48% and
   * 49.1 (star-check, 16 real and 8 generated leagues of eight seasons; the real league's two
   * highest shares since 2004 are 0.408 and 0.406). The whole room is now a little under what 0.3
   * of it was (the same player, 40% and 37.8): at use 0.03, ceil 0.03, contest 0.2 and feature 0.25
   * a legend with all of it still used 42% and scored 40.8, and a founding one 41.2 on 39%. A legend
   * at his peak now leads the league at 35 to 39 (38.2 for that player, 38.9 for the founding one),
   * on a share only Westbrook's and Harden's seasons have reached.
   */
  tails: { span: number; use: number; ceil: number; contest: number; three: number; feature: number };
}

const LOUD: Feel = {
  tactics: { edge: 2, mult: 1.5, fit: 1.5 },
  hot: { from: 3, per: 0.025, max: 0.075, miss: 2, sit: 2, coldFrom: 4, coldPer: 0.012, coldMax: 0.036, feed: 1.2, feedCall: 1.7 },
  momentum: { from: 6, per: 0.015, max: 0.06, home: 1.3, to: 0.15 },
  ato: { open: 0.55, plain: 0.2, at: 0.75, per: 0.01, set: 0.15, to: 0.6, aiSet: 1.5 },
  tails: { span: 3.5, use: 0.02, ceil: 0.02, contest: 0.15, three: 0.015, feature: 0.15 },
};

const PURIST: Feel = {
  tactics: { edge: 1, mult: 1, fit: 1 },
  hot: { from: 3, per: 0, max: 0, miss: 2, sit: 2, coldFrom: 4, coldPer: 0, coldMax: 0, feed: 1, feedCall: 1.25 },
  momentum: { from: 6, per: 0, max: 0, home: 1, to: 0 },
  ato: { open: 0, plain: 0, at: 1, per: 0, set: 0, to: 1, aiSet: 1 },
  tails: { span: 3.5, use: 0, ceil: 0, contest: 0, three: 0, feature: 0 },
};

/** The measuring scripts' override (see the header): 'purist', or a JSON object of values by dotted path. */
function fromEnv(): Feel {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.HC_FEEL;
  if (!env) return LOUD;
  if (env === 'purist') return PURIST;
  const out = structuredClone(LOUD) as unknown as Record<string, Record<string, number>>;
  for (const [path, v] of Object.entries(JSON.parse(env) as Record<string, number>)) {
    const [block, key] = path.split('.');
    if (!out[block] || !(key in out[block])) throw new Error(`HC_FEEL: no such dial "${path}"`);
    out[block][key] = v;
  }
  return out as unknown as Feel;
}

export const FEEL: Feel & { purist: Feel } = { ...fromEnv(), purist: PURIST };

/** A hot (positive) or cold (negative) streak's change to a shooter's make probability: see FEEL.hot. */
export function heat(streak: number, misses: number): number {
  const h = FEEL.hot;
  if (streak >= h.from) return Math.min(h.max, h.per * (streak - h.from + 1));
  if (misses >= h.coldFrom) return -Math.min(h.coldMax, h.coldPer * (misses - h.coldFrom + 1));
  return 0;
}

/** What a run of `run` unanswered points adds to the make probability of the side on it (see FEEL.momentum). */
export function momentum(run: number, home: boolean): number {
  const m = FEEL.momentum;
  if (run < m.from || !m.per) return 0;
  return Math.min(m.max, m.per * (1 + Math.floor((run - m.from) / 2))) * (home ? m.home : 1);
}

/** A run's momentum in a word for the screens: 0 none, 1 on, 2 at its top (see FEEL.momentum; none at all at life size). */
export function momentumLevel(run: number): 0 | 1 | 2 {
  const m = FEEL.momentum;
  if (run < m.from || !m.per) return 0;
  return m.per * (1 + Math.floor((run - m.from) / 2)) >= m.max ? 2 : 1;
}

/** Whether a shooter's streak is a hot hand, and whether his misses are a cold spell, as the engine counts them (see heat). */
export const isHot = (streak: number) => streak >= FEEL.hot.from;
export const isCold = (misses: number) => misses >= FEEL.hot.coldFrom;

/**
 * How much of the room at the top a player has, 0..1 (see FEEL.tails): his raw overall past the top
 * of the league's scale (the best player it had when it was made), all of it FEEL.tails.span past.
 */
export function legendRoom(raw: number, top: number): number {
  return Math.min(1, Math.max(0, (raw - top) / FEEL.tails.span));
}
