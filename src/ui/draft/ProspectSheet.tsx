// A prospect's scouting report: who he is, your staff's read of him and the scouts on him, his
// season, his combine, and Draft him when you're on the clock.
import { Link } from 'react-router-dom';
import { Binoculars, Scale } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { DRAFT_PROSPECT } from '../../core/types';
import { fmtDate, playerName } from '../../core/league/helpers';
import { SCOUT_SLOTS, combineIn, scoutDays, scoutList, seenRange, toggleScout } from '../../core/league/prospects';
import { fmtHeight } from '../../core/ratings';
import { playerAge } from '../../core/playerGen';
import { useLeague, useStore } from '../../state/store';
import { edit } from '../../state/actions';
import { Avatar, Ovr, Section, Sheet } from '../components/ui';
import { overallPick } from '../league/shared';
import { boardNeighbors, compareHref } from '../compare';
import { boardRank, fmtIn } from './common';
import { StockMove } from './read';

/** His season so far, month by month: "A hot December (+2), an injury in February (−2)". */
function seasonLine(league: League, p: Player): string | null {
  const moves = p.prospect?.moves ?? [];
  if (!moves.length) return null;
  const month = (day: number) => fmtDate(league.season, day - 5, { month: 'long' });
  const one = (m: (typeof moves)[number]) => `${m.kind === 'hurt' ? `an injury in ${month(m.day)}` : `a ${m.kind} ${month(m.day)}`} (${m.d > 0 ? '+' : '−'}${Math.abs(m.d)})`;
  const text = moves.map(one).join(', ');
  return text[0].toUpperCase() + text.slice(1) + '.';
}

/** The staff's read and the scouts: the ranges, the days watched, and Scout him / Call the scout back while the season runs. */
function StaffRead({ league, p }: { league: League; p: Player }) {
  const r = seenRange(league, p);
  const list = scoutList(league);
  const me = list.find((s) => s.pid === p.pid);
  const sent = list.filter((s) => !s.auto).length;
  const days = scoutDays(league, p.pid);
  // the scouting runs through the season; by the lottery the reads are what they are
  const open = league.phase !== 'draftLottery' && league.phase !== 'draft';
  const toggle = () => {
    if (!me?.auto && !me && sent >= SCOUT_SLOTS) {
      useStore.getState().toast(`All ${SCOUT_SLOTS} scouts are out. Call one back first.`, 'bad');
      return;
    }
    edit((l) => void toggleScout(l, p.pid));
  };
  const status = me ? (me.auto ? "The staff's scouts are on him, near your pick" : 'Your scouts are on him') : days ? 'No scout on him now' : 'Not scouted yet';
  return (
    <div className="dn-scout">
      <div className="fo-meta">
        Staff read: OVR {r.ovrLo}-{r.ovrHi} · POT {r.potLo}-{r.potHi}
      </div>
      <div className="tiny dim">
        {status}
        {days ? ` · ${days} ${days === 1 ? 'day' : 'days'} watched` : ''}. The more they watch, the narrower the range.
      </div>
      {open && (
        <button className={`btn sm ${me && !me.auto ? '' : 'primary'}`} onClick={toggle}>
          <Binoculars size={14} /> {me && !me.auto ? 'Call the scout back' : `Scout him (${sent} of ${SCOUT_SLOTS} out)`}
        </button>
      )}
    </div>
  );
}

export function ProspectSheet({ pid, onClose, canDraft, onDraft }: { pid: number | null; onClose: () => void; canDraft: boolean; onDraft: (pid: number) => void }) {
  const league = useLeague();
  const p = pid !== null ? league.players[pid] : undefined;
  // the combine's figures only once it's held, in May
  const c = p && (p.tid !== DRAFT_PROSPECT || combineIn(league)) ? p.prospect?.combine : undefined;
  const prospect = p?.tid === DRAFT_PROSPECT;
  const r = p && prospect ? seenRange(league, p) : null;
  const season = p && prospect ? seasonLine(league, p) : null;
  const fig = (k: string, val: string) => (
    <div>
      <div className="k">{k}</div>
      <div className="v num">{val}</div>
    </div>
  );
  return (
    <Sheet open={!!p} onClose={onClose} label={p ? playerName(p) : undefined}>
      {p && (
        <div className="col fo-sheet">
          <div className="fo-prospect-h">
            <Avatar p={p} size="lg" />
            <div className="grow">
              <div className="over">
                {boardRank(league, p) ? `Rank ${boardRank(league, p)}` : 'Unranked'} {prospect && <StockMove p={p} />}
              </div>
              <div className="fo-prospect-first">{p.firstName}</div>
              <h2 className="fo-prospect-last">{p.lastName}</h2>
            </div>
            <div className="fo-prospect-r">
              <Ovr v={r ? r.ovr : p.ovr} size="lg" />
              <span className="pot">POT {r ? (r.potLo === r.potHi ? r.pot : `${r.potLo}-${r.potHi}`) : p.pot}</span>
            </div>
          </div>
          <div className="fo-meta fo-wrap">
            {p.pos} · {playerAge(p, league.season)} · {fmtHeight(p.heightIn)} · {p.weightLb} lb · {p.college ? `${p.college} · ${p.country}` : p.country}
          </div>
          <div className="chips">
            {/* (his scouting blurb usually opens with it: then once is enough) */}
            {!p.prospect?.blurb?.startsWith(p.archetype) && <span className="tag info">{p.archetype}</span>}
            {p.tid >= 0 && (
              <span className="tag good">
                Drafted #{overallPick(league, p.draft.round, p.draft.pick)} by {league.teams[p.tid].abbrev}
              </span>
            )}
            {/* side by side with the prospect ranked next to him (either can be changed there) */}
            <Link to={compareHref(p.pid, boardNeighbors(league, p, 1)[0]?.pid)} className="btn xs fo-push" onClick={onClose}>
              <Scale size={13} /> Compare
            </Link>
          </div>
          {p.prospect?.blurb && <p className="fo-lede">{p.prospect.blurb}</p>}
          {prospect && <StaffRead league={league} p={p} />}
          {season && <div className="tiny dim">{season}</div>}
          {c && (
            <Section title="Combine">
              <div className="fo-combine">
                {fig('Height', fmtIn(c.heightNoShoes))}
                {fig('Wingspan', fmtIn(c.wingspan))}
                {fig('Reach', fmtIn(c.standingReach))}
                {fig('Weight', `${c.weight} lb`)}
                {fig('Vert', `${c.maxVert.toFixed(1)}"`)}
                {fig('Lane', `${c.laneAgility.toFixed(2)}s`)}
                {fig('Sprint', `${c.sprint.toFixed(2)}s`)}
                {fig('Shooting', `${c.shootingDrill}/25`)}
              </div>
              <div className="tiny dim">
                Wingspan {c.wingspan - c.heightNoShoes >= 0 ? '+' : '−'}
                {Math.abs(c.wingspan - c.heightNoShoes)
                  .toFixed(2)
                  .replace(/\.?0+$/, '')}
                " vs height{c.wingspan - c.heightNoShoes >= 4 ? ': plus length' : c.wingspan - c.heightNoShoes < 1 ? ': short arms for his size' : ''}.
              </div>
            </Section>
          )}
          <div className="row">
            <Link to={`/player/${p.pid}`} className="btn grow" onClick={onClose}>
              Full profile
            </Link>
            {canDraft && p.tid < 0 && (
              <button className="btn primary grow" onClick={() => onDraft(p.pid)}>
                Draft him
              </button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
