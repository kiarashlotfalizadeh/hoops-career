// "Untouchable": the user takes one of his players off the table. AI teams stop asking for him (in
// their offers, "what would make this work?" and counters), and an open offer asking for him is
// withdrawn.
import { LockKeyhole } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { isUntouchable, setUntouchable } from '../../core/league/proposals';
import { edit } from '../../state/actions';
import { Toggle } from '../components/ui';

export function UntouchableToggle({ league, p }: { league: League; p: Player }) {
  // two-way players are never asked for anyway
  if (p.tid !== league.userTid || p.contract.twoWay) return null;
  const on = isUntouchable(league, p.pid);
  return (
    <Toggle
      on={on}
      onChange={(v) => edit((l) => setUntouchable(l, p.pid, v))}
      label={
        <span className="fo-untouch">
          <LockKeyhole size={15} className={on ? 'accent-text' : 'dim'} />
          Untouchable
        </span>
      }
      help={on ? `AI teams won't ask for ${p.lastName}.` : `Take ${p.lastName} off the table: AI teams stop asking for him.`}
    />
  );
}
