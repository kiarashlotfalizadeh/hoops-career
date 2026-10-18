// A prospect's scouting report: who he is, his combine, and Draft him when you're on the clock.
import { Link } from 'react-router-dom';
import { Scale } from 'lucide-react';
import { playerName } from '../../core/league/helpers';
import { fmtHeight } from '../../core/ratings';
import { playerAge } from '../../core/playerGen';
import { useLeague } from '../../state/store';
import { Avatar, Ovr, Section, Sheet } from '../components/ui';
import { overallPick } from '../league/shared';
import { boardNeighbors, compareHref } from '../compare';
import { fmtIn } from './common';

export function ProspectSheet({ pid, onClose, canDraft, onDraft }: { pid: number | null; onClose: () => void; canDraft: boolean; onDraft: (pid: number) => void }) {
  const league = useLeague();
  const p = pid !== null ? league.players[pid] : undefined;
  const c = p?.prospect?.combine;
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
              <div className="over">Big board #{p.prospect?.rank ?? '—'}</div>
              <div className="fo-prospect-first">{p.firstName}</div>
              <h2 className="fo-prospect-last">{p.lastName}</h2>
            </div>
            <div className="fo-prospect-r">
              <Ovr v={p.ovr} size="lg" />
              <span className="pot">POT {p.pot}</span>
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
