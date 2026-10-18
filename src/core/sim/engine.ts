// Possession-by-possession game engine.
//
// Every possession is resolved through concrete basketball actions (pick-and-roll,
// isolation, post-up, handoffs, motion, transition) with explicit actors, defenders
// and defensive coverages. Each tactical modifier is tagged, and its expected-points
// effect is accumulated so post-game reports can say *why* a game was won or lost.
//
// This is the engine's public entry point; the engine itself is in engine/:
//   game.ts        GameSim: the game's state, setup, live controls and main loop
//   state.ts       the per-player and per-team state, the inputs, shared types and helpers
//   constants.ts   the tuning constants (K) and the calibration diagnostics
//   coach.ts       situational plans, timeouts, AI coaches' adjustments at the breaks
//   clock.ts       time and fatigue, the ends of periods, late-game modes
//   rotation.ts    substitutions, replacements, in-game injuries
//   usage.ts       who gets the ball and which action the offense runs
//   defense.ts     matchups, schemes, junk defenses, star plans, instructions, hunting, help, pressure
//   possession.ts  a possession from the start: the press, the run-out decision, the half court
//   transition.ts  the full-court press and the open floor
//   setPlays.ts    sets as the engine runs them (the library is sets.ts)
//   pnr.ts, isolation.ts, postUp.ts, handoff.ts, motion.ts: the half-court actions
//   shots.ts       shot outcomes, the spot-up catch, shot locations
//   rebounds.ts    rebounds, putbacks and resets
//   fouls.ts       late-game fouls, reach-ins, the penalty, foul-outs, free throws
//   record.ts      impact tags, scoring, turnovers, the end of a possession, the result

export { GameSim } from './engine/game';
export { K, engineDiag, resetEngineDiag } from './engine/constants';
export type { InGameInjury, SP, ST, SimOptions, SimTeamInput } from './engine/state';
