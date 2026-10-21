// Who mail is from, as a person in a role: the league's messages name a department ("Assistant GM",
// "Medical Staff"); the inbox shows the people in those jobs on the user's staff ("Dana Ruiz,
// assistant GM"), the owner and the league office as themselves. Staff names come from the league and
// the team (as the lead assistant's do), so the same desk always signs with the same name. The owner
// of a real franchise is never named: his mail is from "The owner".
import type { InboxMessage, League } from '../../core/types';
import { leadAssistant } from '../../core/ai/assistant';
import { coachName } from '../../core/teamFactory';
import { hashString, Rng } from '../../core/random';

/** The inbox's folders, by who's writing. */
export type SenderGroup = 'owner' | 'staff' | 'office' | 'league';

export const GROUP_LABEL: Record<SenderGroup, string> = { owner: 'Owner', staff: 'Coaching staff', office: 'Front office', league: 'League' };

export interface Sender {
  /** Who: "Dana Ruiz", "The owner", "League office". */
  name: string;
  /** In what job, when the name doesn't say it: "Assistant GM". */
  role?: string;
  group: SenderGroup;
  /** For the badge: "DR". */
  initials: string;
}

type Desk = { key: string; role: string; group: SenderGroup; doctor?: boolean };

/** The departments the league's messages come from, by the name they sign with. */
const DESKS: Record<string, Desk> = {
  'assistant gm': { key: 'gm', role: 'Assistant GM', group: 'office' },
  'front office': { key: 'gm', role: 'Assistant GM', group: 'office' },
  'scouting department': { key: 'scout', role: 'Director of scouting', group: 'office' },
  'media relations': { key: 'media', role: 'Media relations', group: 'office' },
  'player development': { key: 'dev', role: 'Player development', group: 'staff' },
  'medical staff': { key: 'med', role: 'Team physician', group: 'staff', doctor: true },
  'your agent': { key: 'agent', role: 'Your agent', group: 'owner' },
};

const initialsOf = (name: string) =>
  name
    .replace(/^(Dr\.|The)\s+/, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();

const names = new WeakMap<League, Map<string, string>>();

/** The name on one of the user's desks (`key`): his own for each team he runs, never a head coach's or his lead assistant's. */
function deskName(league: League, key: string, doctor = false): string {
  let byKey = names.get(league);
  if (!byKey) names.set(league, (byKey = new Map()));
  const id = `${key}:${league.userTid}`;
  const hit = byKey.get(id);
  if (hit) return hit;
  const rng = new Rng(hashString(`${league.id}:staff:${id}`));
  const taken = new Set([league.coachName, leadAssistant(league).name, ...league.teams.map((t) => t.coach?.name)]);
  let name = coachName(rng);
  for (let i = 0; i < 8 && taken.has(name); i++) name = coachName(rng);
  const out = doctor ? `Dr. ${name}` : name;
  byKey.set(id, out);
  return out;
}

/** Who a message is from, as a person in a role. */
export function senderOf(league: League, m: Pick<InboxMessage, 'from'>): Sender {
  const from = m.from.trim();
  const low = from.toLowerCase();
  if (low === 'owner')
    return { name: 'The owner', role: `${league.teams[league.userTid]?.region ?? ''} ${league.teams[league.userTid]?.name ?? ''}`.trim(), group: 'owner', initials: 'OW' };
  if (low === 'league office') return { name: 'League office', role: 'League operations', group: 'league', initials: 'LO' };
  if (low === 'assistant coach' || low === 'lead assistant') {
    const lead = leadAssistant(league);
    return { name: lead.name, role: 'Lead assistant', group: 'staff', initials: lead.initials };
  }
  const desk = DESKS[low];
  if (desk) {
    const name = deskName(league, desk.key, desk.doctor);
    return { name, role: desk.role, group: desk.group, initials: initialsOf(name) };
  }
  // "Name, role" (the lead assistant signs his debriefs so): the name, and the role as it's written
  const comma = from.indexOf(', ');
  if (comma > 0) {
    const name = from.slice(0, comma);
    const role = from.slice(comma + 2);
    return { name, role: role.charAt(0).toUpperCase() + role.slice(1), group: groupOfRole(role), initials: initialsOf(name) };
  }
  return { name: from, group: groupOfRole(from), initials: initialsOf(from) };
}

/** A folder for a sender this file doesn't know by name, from the words in his role. */
function groupOfRole(role: string): SenderGroup {
  const r = role.toLowerCase();
  if (/owner|agent|board/.test(r)) return 'owner';
  if (/league|commissioner|nba/.test(r)) return 'league';
  if (/coach|assistant(?! gm)|development|medical|trainer|physician|staff/.test(r)) return 'staff';
  return 'office';
}

/** "Dana Ruiz · Assistant GM", or just the name when it says the role. */
export const senderText = (s: Sender) => (s.role ? `${s.name} · ${s.role}` : s.name);
