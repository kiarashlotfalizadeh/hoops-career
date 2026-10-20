// The live screen's fixed rules and small pure helpers: how long things stay up over the court,
// when a period stops for its break, the banner an event puts up, what the user's side of the game is
// built from now, who can swap places with a player, and the Tactics tab's quick changes.
import type { League, Settings, Tactics } from '../../core/types';
import type { PossLog } from '../../core/sim/log';
import type { GameSim } from '../../core/sim/engine';
import { buildSimInput } from '../../core/league/games';
import { hashString } from '../../core/random';
import type { LiveGame } from '../../state/live';
import { eventLines, type LiveEvent } from './alerts';
import type { BannerItem } from './Banner';
import type { SubOptions } from './MyPlayer';
import { drawnPlayer, subsLine, type Drawn } from './drawn';
import { HOT_STREAK } from './OnCourt';
import { livePills, type Pill } from './pills';
import { gameShare } from '../components/GameKeys';

/** The play-by-play lines the console keeps. */
export const FEED_MAX = 80;
export const NO_LOGS: PossLog[] = [];
/** Key plays mode: the pause between possessions it doesn't draw (at 1×). */
export const FF_MS = 90;
/** How long a banner stays over the court: an event, and the assistant's word (it has a line to read). */
export const EVENT_MS = 4000;
export const WORD_MS = 6500;

/** Game seconds before a key's pace is worth reading: before then a key isn't called behind on a few trips. */
export const KEYS_EARLY_SEC = 360;

/** The part of the game a key's pace is read against (GameKeys' gameShare), none before KEYS_EARLY_SEC: a minute in, a 0-for-1 isn't "behind". */
export const keysShare = (elapsed: number, q: number) => (elapsed < KEYS_EARLY_SEC ? 0 : gameShare(elapsed, q));

/** The screen: setting up, no game today, a game on, its final, or a game the Play menu simmed. */
export type Status = 'loading' | 'none' | 'live' | 'final' | 'simmed';
/** The sheet open over the live screen: one of the players (yours or theirs), skip ahead, or the scores around the league. */
export type Panel = 'none' | 'player' | 'skip' | 'scores';

/** Whether a period's buzzer stops for a break with the period report. */
export const breakAfter = (mode: NonNullable<Settings['liveBreaks']>, q: number) => (mode === 'quarters' ? true : mode === 'half' ? q === 2 : false);

/** An alert's banner, said once: a tired player's alert comes back as his legs go, but its banner doesn't. */
export const bannerKey = (id: string) => id.replace(/^(tired-\d+)-\d+$/, '$1');

const EVENT_KICKER: Record<LiveEvent['kind'], string> = { injury: 'Injury', foulout: 'Fouled out', adjust: 'Adjustment' };

/**
 * What the user's side of a live game would be built from now: its tactics (with the game plan),
 * and hashes of them and of the rotation, to spot edits made away from /live (see LiveGame.seen).
 */
export function userSetup(league: League, lg: LiveGame): { tactics: Tactics; seen: [number, number] } {
  const g = lg.game;
  const tactics = buildSimInput(league, league.userTid, g.day, g.type, lg.userSide === 0 ? g.away : g.home, g).team.tactics;
  return { tactics, seen: [hashString(JSON.stringify(tactics)), hashString(JSON.stringify(league.teams[league.userTid].rotation))] };
}

/** An injury, a foul-out or the other coach's adjustment, as its banner over the court. */
export function eventBanner(e: LiveEvent): BannerItem {
  const { title, text } = eventLines(e);
  // the kicker already says what happened: an injury or a foul-out names the player, and the line says what it means
  const who = e.kind === 'injury' ? title.replace(/ is hurt and out for the game$/, '') : e.kind === 'foulout' ? title.replace(/ has fouled out$/, '') : title;
  const line = e.kind === 'injury' && who !== title ? 'Out for the rest of the game.' : e.kind === 'foulout' && who !== title ? "He's done for the night." : text;
  return { id: e.id, tone: e.kind === 'adjust' ? 'info' : 'bad', kicker: EVENT_KICKER[e.kind], title: who, line: line || undefined };
}

/**
 * A player's sheet: who can swap places with him, as the court has drawn the game. For one on the
 * floor, the rested bench players (the staff's pick first, `staffPick`); for one on the bench, the
 * five he can come in for. `me` is your side in the game itself (who can come in now).
 */
export function subOptions(view: Drawn, userSide: 0 | 1, me: GameSim['T'][number], pid: number, staffPick: (pid: number) => number | undefined): SubOptions {
  const sp = me.byId.get(pid);
  const line = (p: NonNullable<typeof sp>) => subsLine(view, userSide, p);
  if (!sp) return { on: false, out: 0, options: [] };
  const l = line(sp);
  if (l.out) return { on: sp.on, out: l.out, dnp: sp.dnp, options: [] };
  if (sp.on) {
    const staff = staffPick(pid);
    const bench = me.players
      .filter((p) => !p.on && line(p).out === 0)
      .sort((a, b) => (a.pid === staff ? -1 : b.pid === staff ? 1 : b.energy - a.energy))
      .slice(0, 6);
    return { on: true, out: 0, options: bench.map((p) => ({ pid: p.pid, line: `${line(p).energy}%`, staff: p.pid === staff })) };
  }
  return {
    on: false,
    out: 0,
    options: me.on.map((p) => {
      const x = line(p);
      return { pid: p.pid, line: `${x.energy}%${x.fouls ? ` · ${x.fouls} PF` : ''}` };
    }),
  };
}

/**
 * The Tactics tab's quick changes for the game as the court has drawn it, against `planned` (the
 * tactics the game tipped off with). Their threat is the player already targeted, else their hottest
 * shooter, else their leading scorer.
 */
export function quickPills(view: Drawn, userSide: 0 | 1, tactics: Tactics, planned: Tactics, nameOf: (pid: number) => string): Pill[] {
  const me = view.sides[userSide];
  const them = view.sides[1 - userSide];
  const oppOn = them.on.map((pid) => ({ pid, name: nameOf(pid), ftPct: drawnPlayer(view, pid)?.ftPct ?? 0.75 }));
  const five = them.players.filter((p) => them.on.includes(p.pid));
  // the player already targeted stays the target; otherwise their hottest shooter, or their leading scorer
  const targeted = tactics.defense.starPlan !== 'none' ? five.find((p) => p.pid === tactics.defense.starTarget) : undefined;
  const hot = [...five].filter((p) => p.streak >= HOT_STREAK).sort((a, b) => b.streak - a.streak)[0];
  const top = [...five].sort((a, b) => b.pts - a.pts)[0];
  const threat = targeted ?? hot ?? top;
  return livePills(tactics, planned, {
    q: view.q,
    clock: view.clock,
    margin: me.score - them.score,
    oppOn,
    oppThreat: threat && { pid: threat.pid, name: nameOf(threat.pid) },
  });
}
