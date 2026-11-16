// The roster's need where candidates are read against it (free agents): whose opinion it is (the
// staff's read, or the coach's own priority), its grade on the rotation in use and on the staff's
// minutes when they differ (candidates are graded with the staff's minutes), the coaching alternative
// when his own settings cost it, and a sheet to make any quality the priority (weaknesses first, then
// strengths) or set the need aside as a trade-off he accepts (League.needChoice). The choice in force
// heads the sheet, so it's never lost down the list.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { League } from '../../core/types';
import { edit } from '../../state/actions';
import { needChoice, needLead, type Need, type NeedOption } from '../../core/league/rosterNeed';
import { ordinal } from '../../core/format';
import { Check } from 'lucide-react';
import { Sheet } from '../components/ui';

export function NeedNote({ league, need, options }: { league: League; need: Need | null; options: NeedOption[] }) {
  const [open, setOpen] = useState(false);
  const choice = needChoice(league);
  if (!need && !choice && !options.length) return null;
  const set = (c: string | undefined) => {
    edit((l) => {
      if (c === undefined) delete l.needChoice;
      else l.needChoice = c;
    });
    setOpen(false);
  };
  const staff = options.find((o) => o.staff);
  const weak = options.filter((o) => o.weak);
  const strong = options.filter((o) => !o.weak);
  const graded = (o: NeedOption) => `Graded ${o.grade}, ${ordinal(o.rank)} of ${o.of}`;
  const row = (key: string, on: boolean, title: string, sub: string, c: string | undefined) => (
    <button key={key} className={`listrow fo-need-opt ${on ? 'on' : ''}`} role="radio" aria-checked={on} onClick={() => set(c)}>
      <span className="grow">
        <span className="lr-name">{title}</span>
        <span className="lr-meta">{sub}</span>
      </span>
      {on && <Check size={18} aria-hidden="true" />}
    </button>
  );
  // the choice in force, in a line: what the sheet starts from
  const current =
    choice === 'none'
      ? 'No roster need: you accept your weaknesses'
      : choice
        ? `Your priority: ${options.find((o) => o.id === choice)?.label ?? 'a quality'}`
        : staff
          ? `The staff's read: ${staff.label}`
          : "The staff's read: no clear need";
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
          <p className="small dim">The staff names your weakest area. You can pick any area instead.</p>
          <div className="fo-need-now">
            <Check size={16} aria-hidden="true" /> {current}
          </div>
          <div className="card flush list" role="radiogroup" aria-label="Your roster's need">
            {row('staff', choice === undefined, "Go with the staff's read", staff ? `${staff.label}, graded ${staff.grade}` : 'No clear need right now', undefined)}
            {row('none', choice === 'none', 'No need', 'I accept my weaknesses as trade-offs', 'none')}
            {weak.length > 0 && <div className="list-divider">Weaknesses</div>}
            {weak.map((o) => row(o.id, choice === o.id, o.label, graded(o), o.id))}
            {strong.length > 0 && <div className="list-divider">Strengths</div>}
            {strong.map((o) => row(o.id, choice === o.id, o.label, graded(o), o.id))}
          </div>
        </div>
      </Sheet>
    </div>
  );
}
