// A team's draft picks: the ones it owns (its own and others', with their protections and where
// this season's would land today) and its own that other teams own. Any team's, the user's too:
// another team's page shows it, and so does the Office for the user's own. PickRow is every pick
// list's row (the Draft screen's too): one name, one order, one projection.
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { DraftPick, League } from '../../core/types';
import { useLeagueMemo } from '../../state/store';
import { pickLabel, pickTermsNote } from '../../core/league/trades';
import { TeamLogo } from '../components/TeamLogo';
import { Help, Section, Statline } from '../components/ui';
import { PICK_RANGE_NOTE, pickOrder, pickProjText, projectedSlot } from '../draft/common';
import { teamPath } from './shared';

/**
 * One draft pick: whose it was (its team's mark) and its name ("2027 1st #4 (LAC)"), the team behind
 * it in words, its terms, and where it projects until its slot is set ("proj. #6-12", see
 * pickProjText; neutral: a projection, not a grade; `hidden` while the lottery's reveal is still to
 * be watched). Every row reads the same way: one owed to another team (`owner`) names its owner, and
 * either kind from or to another team links to it. The label names the team a pick came from ("(BKN)"),
 * so the meta line doesn't say it again; a team's own pick has its terms there, or nothing.
 */
export function PickRow({ league, d, hidden = false, owner = false }: { league: League; d: DraftPick; hidden?: boolean; owner?: boolean }) {
  const terms = pickTermsNote(league, d);
  const proj = hidden ? undefined : pickProjText(league, d);
  // the other team in the pick's story: its owner, or the team whose record decides it
  const other = owner ? d.tid : d.originalTid !== d.tid ? d.originalTid : undefined;
  // (the owner by its name alone: its mark is beside it, so the line stays one line)
  const meta = [owner ? `Owned by the ${league.teams[d.tid].name}.` : '', terms ?? ''].filter(Boolean).join(' ');
  const body = (
    <>
      <TeamLogo tid={owner ? d.tid : d.originalTid} size={28} decorative />
      <span className="lg-pick-t">
        <span className="lr-name">{pickLabel(league, d)}</span>
        {meta && <span className="lr-meta">{meta}</span>}
      </span>
      <span className="row lg-pick-r">
        {proj !== undefined && <span className="tiny dim num nowrap">{proj}</span>}
        {other !== undefined && <ChevronRight size={16} className="dim" />}
      </span>
    </>
  );
  return other !== undefined ? (
    <Link to={teamPath(other)} className="lg-pick">
      {body}
    </Link>
  ) : (
    <div className="lg-pick">{body}</div>
  );
}

export function PicksList({ league, tid }: { league: League; tid: number }) {
  const proj = useLeagueMemo(() => projectedSlot(league), [league]);
  // a pick whose slot is set carries its number in its name, and every pick its year: only a projection is added
  const order = pickOrder(league, proj);
  const owned = league.draftPicks.filter((d) => d.tid === tid).sort(order);
  const away = league.draftPicks.filter((d) => d.originalTid === tid && d.tid !== tid).sort(order);
  const firsts = owned.filter((d) => d.round === 1).length;
  return (
    <>
      <div className="card lg-strip">
        <Statline
          items={[
            { k: 'Owned', v: owned.length },
            { k: '1st round', v: firsts },
            { k: 'Owed to others', v: away.length, color: away.length ? 'var(--warn)' : undefined },
          ]}
        />
      </div>
      <Section title="Owned" right={owned.some((d) => proj(d) !== undefined) ? <Help title="Projected picks">{PICK_RANGE_NOTE}</Help> : undefined}>
        <div className="card flush list">
          {owned.length === 0 ? <div className="empty">No draft picks.</div> : owned.map((d) => <PickRow key={d.dpid} league={league} d={d} />)}
        </div>
      </Section>
      {away.length > 0 && (
        <Section title="Owed to others">
          <div className="card flush list">
            {away.map((d) => (
              <PickRow key={d.dpid} league={league} d={d} owner />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
