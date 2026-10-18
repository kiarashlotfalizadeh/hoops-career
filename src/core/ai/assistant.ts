// The assistant: one voice for the staff's advice. Everything the staff would tell the user about
// his team (the advisor's alerts on fit, lineups, coverages, minutes, wear and morale), his next
// opponent, his roster spots and contracts, and the owner's mood comes through this feed as cards
// of one shape, each tagged with the area it's about so a screen can show its own (Today shows the
// most urgent). A card can carry a one-tap fix the staff makes (applyFix) and the screen to open.
// The live game's alerts are about the game in progress and stay with it (src/ui/live/alerts.ts),
// drawn with the same card.
import type { League } from '../types';
import { teamAlerts, type AlertFix } from './advisor';
import { applyDefPreset, applyOffPreset } from '../sim/tactics';
import { CAP } from '../constants';
import { contractSeason, playerName, standardRoster, teamPlayers } from '../league/helpers';
import { contractExp, salaryFor } from '../playerGen';
import { extensionBlockedReason, marketSalary } from '../league/contracts';
import { money } from '../format';
import { jobSecurity } from '../league/jobSecurity';
import { nextOpponent } from '../league/agenda';

export type AssistantArea = 'team' | 'tactics' | 'games' | 'office' | 'owner';

export interface AssistantCard {
  id: string;
  area: AssistantArea;
  /** issue: something is costing the team; tip: something worth doing; good: news worth a nod. */
  tone: 'issue' | 'tip' | 'good';
  title: string;
  line: string;
  to?: string;
  fix?: AlertFix;
  /** Higher first. */
  weight: number;
}

const AREA_OF = (link: string | undefined): AssistantArea => (link?.startsWith('/team/tactics') ? 'tactics' : link?.startsWith('/office') ? 'office' : 'team');

/** The staff's advice for the user's team, most urgent first. */
export function assistantFeed(league: League): AssistantCard[] {
  if (league.fired) return [];
  const me = league.userTid;
  const cards: AssistantCard[] = [];

  for (const a of teamAlerts(league, me))
    cards.push({
      id: `alert:${a.id}`,
      area: AREA_OF(a.link),
      tone: a.tone === 'good' ? 'good' : a.tone === 'bad' ? 'issue' : 'tip',
      title: a.title,
      line: a.body,
      to: a.link,
      fix: a.fix,
      weight: a.tone === 'bad' ? 80 : 60,
    });

  // the owner, when the seat is getting warm
  const js = jobSecurity(league);
  if (!js.off && (js.heat === 'warm' || js.heat === 'hot'))
    cards.push({
      id: 'owner',
      area: 'owner',
      tone: 'issue',
      title: js.heat === 'hot' ? 'You are on the hot seat' : 'The owner is getting restless',
      line: js.line,
      to: '/office/owner',
      weight: js.heat === 'hot' ? 95 : 70,
    });

  // the next opponent with no plan made yet
  const opp = nextOpponent(league);
  const inSeason = league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs';
  if (inSeason && opp !== undefined && !league.gamePlans?.[opp])
    cards.push({
      id: `plan:${opp}`,
      area: 'games',
      tone: 'tip',
      title: `No game plan for ${league.teams[opp].abbrev} yet`,
      line: 'The staff’s counters are ready on the Plan tab, each one testable.',
      to: `/games/${opp}?tab=plan`,
      weight: 40,
    });

  // roster spots and contracts
  const std = standardRoster(league, me).length;
  if (league.phase === 'regular' && std < CAP.rosterMax)
    cards.push({
      id: 'open-spot',
      area: 'office',
      tone: 'tip',
      title: `${CAP.rosterMax - std} open roster spot${CAP.rosterMax - std === 1 ? '' : 's'}`,
      line:
        std < CAP.rosterMin
          ? `Below the ${CAP.rosterMin}-man minimum: the league fills it if you don't.`
          : 'A minimum deal or a 10-day contract fills it without touching the cap.',
      to: '/office/free-agents',
      weight: std < CAP.rosterMin ? 85 : 20,
    });
  if (league.phase === 'preseason' || league.phase === 'regular') {
    const season = contractSeason(league);
    const due = teamPlayers(league, me)
      .filter((p) => p.ovr >= 75 && contractExp(p.contract) === season && !extensionBlockedReason(league, p))
      .sort((a, b) => b.ovr - a.ovr);
    if (due.length) {
      // what the call turns on: how good he is, what he makes now and what the market says he's worth
      const p = due[0];
      const more = due.length > 1 ? ` · ${due.length - 1} more in a final season` : '';
      cards.push({
        id: `extend:${p.pid}`,
        area: 'office',
        tone: 'tip',
        title: `${playerName(p)} can be extended`,
        line: `${p.ovr} OVR · ${money(salaryFor(p, season))} in his final season · market ${money(marketSalary(league, p))}${more}`,
        to: `/player/${p.pid}`,
        weight: 30,
      });
    }
  }

  return cards.sort((a, b) => b.weight - a.weight);
}

/** The staff makes a card's fix. Returns what to say. */
export function applyFix(league: League, fix: AlertFix): string {
  const t = league.teams[league.userTid];
  switch (fix.kind) {
    case 'offPreset':
      t.tactics.offense = applyOffPreset(t.tactics.offense, fix.id);
      t.tactics.offPreset = fix.id;
      t.tactics.manual = true;
      return `${fix.label}: done.`;
    case 'defPreset':
      t.tactics.defense = applyDefPreset(t.tactics.defense, fix.id);
      t.tactics.defPreset = fix.id;
      t.tactics.manual = true;
      return `${fix.label}: done.`;
    case 'coverage':
      t.tactics.defense.pnr = fix.pnr;
      t.tactics.manual = true;
      return `Ball screens: ${fix.pnr} coverage.`;
    case 'restB2B':
      if (!t.rotation.restB2B.includes(fix.pid)) t.rotation.restB2B.push(fix.pid);
      return `${playerName(league.players[fix.pid])} rests on back-to-backs.`;
  }
}
