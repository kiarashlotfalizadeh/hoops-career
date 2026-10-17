// Picks a player to compare (or, in god mode, to edit): a search over every active player and free
// agent (this year's prospects in the draft phases, or against a prospect), and quick picks around
// the player he'll be set against: his teammates at his position, the user's players there, the
// prospects ranked nearest him and the players in this device's recent comparisons (with no one to
// set him against, the user's roster and those recent players).
import { useState } from 'react';
import { Search } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { DRAFT_PROSPECT, FREE_AGENT, RETIRED } from '../../core/types';
import { playerName } from '../../core/league/helpers';
import { useLeague, useLeagueMemo } from '../../state/store';
import { Avatar, Ovr, Sheet } from './ui';
import { playerMeta } from '../office/common';
import { boardNeighbors, draftPhase, loadRecent, pickerPool, playersAt, recentPids, searchPlayers } from '../compare';
import '../league/league.css';
import '../screens/team.css';

const QUICK = 6;

/** Where he is: his team, or free agent, prospect (with his board rank) or retired. */
function where(league: League, p: Player) {
  if (p.tid >= 0) return league.teams[p.tid]?.abbrev ?? '';
  if (p.tid === FREE_AGENT) return p.waivers ? 'On waivers' : 'Free agent';
  if (p.tid === DRAFT_PROSPECT) return `Prospect #${p.prospect?.rank ?? '—'}`;
  return p.tid === RETIRED ? 'Retired' : '';
}

export function PlayerPicker({
  open,
  onClose,
  onPick,
  anchor,
  except = [],
  title,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (pid: number) => void;
  /** The player the pick will be set against: the quick picks are built around him. */
  anchor?: Player;
  /** Players the quick picks leave out (the ones already on the screen); search still finds them. */
  except?: number[];
  title: string;
}) {
  const league = useLeague();
  const [q, setQ] = useState('');
  const withProspects = draftPhase(league) || anchor?.tid === DRAFT_PROSPECT;
  const pool = useLeagueMemo(() => (open ? pickerPool(league, withProspects) : []), [league, open, withProspects]);
  const close = () => (setQ(''), onClose());
  const pick = (pid: number) => (setQ(''), onPick(pid));

  const skip = new Set([...(anchor ? [anchor.pid] : []), ...except]);
  const groups: { title: string; list: Player[] }[] = [];
  if (open && !q.trim()) {
    const me = league.userTid;
    if (anchor?.tid === DRAFT_PROSPECT) groups.push({ title: 'Near him on the big board', list: boardNeighbors(league, anchor, QUICK + 2) });
    if (anchor && anchor.tid >= 0 && anchor.tid !== me) groups.push({ title: `His teammates at ${anchor.pos}`, list: playersAt(league, anchor.tid, anchor.pos) });
    if (anchor) groups.push({ title: `Your players at ${anchor.pos}`, list: playersAt(league, me, anchor.pos) });
    else
      groups.push({
        title: 'Your roster',
        list: Object.values(league.players)
          .filter((p) => p.tid === me)
          .sort((a, b) => b.ovr - a.ovr),
      });
    groups.push({
      title: 'Recent comparisons',
      list: recentPids(loadRecent(league.id), [...skip])
        .map((pid) => league.players[pid])
        .filter((p): p is Player => !!p),
    });
    // each player once, in the first group he's in
    const seen = new Set(skip);
    for (const g of groups) {
      g.list = g.list.filter((p) => !seen.has(p.pid)).slice(0, QUICK);
      for (const p of g.list) seen.add(p.pid);
    }
  }
  const quick = groups.filter((g) => g.list.length);
  const found = open && q.trim() ? searchPlayers(league, pool, q) : null;

  const row = (p: Player) => (
    <button key={p.pid} className="tm-pick" onClick={() => pick(p.pid)}>
      <Avatar p={p} />
      <span className="grow">
        <span className="tm-pick-n">{playerName(p)}</span>
        <span className="tm-pick-m">{playerMeta(league, p, where(league, p))}</span>
      </span>
      <span className="tm-ovr">
        <Ovr v={p.ovr} size="sm" />
        <span className="pot">POT {p.pot}</span>
      </span>
    </button>
  );

  return (
    <Sheet open={open} onClose={close} title={title}>
      <div className="col tm-picker">
        <div className="lg-search">
          <Search size={15} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={withProspects ? 'Name, team (BOS) or prospect' : 'Name or team (BOS)'}
            aria-label="Search players"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        {found ? (
          found.list.length ? (
            <>
              <div className="card flush">
                <div className="list">{found.list.map(row)}</div>
              </div>
              {found.total > found.list.length && (
                <div className="tm-foot">
                  The best {found.list.length} of {found.total}: type more to narrow it.
                </div>
              )}
            </>
          ) : (
            <div className="empty">No player matches “{q.trim()}”.</div>
          )
        ) : quick.length ? (
          <div className="card flush">
            <div className="list">
              {quick.flatMap((g) => [
                <div key={`h-${g.title}`} className="list-divider">
                  {g.title}
                </div>,
                ...g.list.map(row),
              ])}
            </div>
          </div>
        ) : (
          <div className="empty">Search for any player or free agent.</div>
        )}
      </div>
    </Sheet>
  );
}
