// The roster's need where candidates are read against it (free agents): whose opinion it is (the
// staff's read, or the coach's own priority), its grade on the rotation in use and on the staff's
// minutes when they differ (candidates are graded with the staff's minutes), the coaching alternative
// when his own settings cost it, and a sheet to make another weakness the priority or set the need
// aside as a trade-off he accepts (League.needChoice).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { League } from '../../core/types';
import { edit } from '../../state/actions';
import { needChoice, needLead, type Need } from '../../core/league/rosterNeed';
import { ordinal } from '../../core/format';
import { Check } from 'lucide-react';
import { Sheet } from '../components/ui';

type Option = Pick<Need, 'id' | 'label' | 'grade' | 'rank' | 'of'>;

export function NeedNote({ league, need, options }: { league: League; need: Need | null; options: Option[] }) {
  const [open, setOpen] = useState(false);
  const choice = needChoice(league);
  // nothing to say: no weakness in the bottom half, and nothing he chose
  if (!need && !choice && !options.length) return null;
  const set = (c: string | undefined) => {
    edit((l) => {
      if (c === undefined) delete l.needChoice;
      else l.needChoice = c;
    });
    setOpen(false);
  };
  const row = (key: string, on: boolean, title: string, sub: string, c: string | undefined) => (
    <button key={key} className={`listrow fo-need-opt ${on ? 'on' : ''}`} role="radio" aria-checked={on} onClick={() => set(c)}>
      <span className="grow">
        <span className="lr-name">{title}</span>
        <span className="lr-meta">{sub}</span>
      </span>
      {on && <Check size={18} aria-hidden="true" />}
    </button>
  );
  return (
    <div className="tiny dim fo-need">
      {need ? (
        <>
          {needLead(need)}: <b>{need.label}</b>, {need.grade} with your rotation ({ordinal(need.rank)} of {need.of})
          {need.staff ? `, ${need.staff.grade} with the staff's minutes` : ''}. Players are graded with the staff&apos;s minutes for them.
          {need.coach && (
            <>
              {' '}
              Coaching alternative: your setting “{need.coach.text}” costs it. Without such settings: {need.coach.to}. <Link to="/team/tactics">Tactics</Link>
            </>
          )}
        </>
      ) : choice === 'none' ? (
        <>You set no roster need: your weaknesses are trade-offs you accept.</>
      ) : (
        <>The staff sees no clear roster need.</>
      )}{' '}
      <button className="btn xs fo-need-btn" onClick={() => setOpen(true)}>
        {need?.by === 'staff' ? 'Not my priority' : 'Change'}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="What should signings fix?">
        <div className="col">
          <p className="small dim">The staff names your weakest area. You decide whether it matters.</p>
          <div className="card flush list" role="radiogroup" aria-label="Your roster's need">
            {row('staff', choice === undefined, "Go with the staff's read", options[0] ? `${options[0].label}, graded ${options[0].grade}` : 'No clear need right now', undefined)}
            {options.map((o) => row(o.id, choice === o.id, o.label, `Graded ${o.grade}, ${ordinal(o.rank)} of ${o.of}`, o.id))}
            {row('none', choice === 'none', 'None of these', 'I accept these weaknesses as trade-offs', 'none')}
          </div>
        </div>
      </Sheet>
    </div>
  );
}
