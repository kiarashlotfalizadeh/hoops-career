// A row that opens: its name and what's inside, the rest under it once tapped. The Tactics sections'
// depth one tap down (Instructions' Fine-tune, Match's late-game rules). On its own it's a card;
// `bare`, a row in a list card. Its Help sits beside the chevron, outside the row's tap.
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function Disclosure({
  label,
  meta,
  children,
  open,
  bare,
  help,
}: {
  label: string;
  meta?: ReactNode;
  children: ReactNode;
  open?: boolean;
  /** A row in a list card, not a card of its own. */
  bare?: boolean;
  /** What's inside explained (a `Help`), beside the chevron. */
  help?: ReactNode;
}) {
  return (
    <div className={`tx-fine-wrap${bare ? '' : ' card flush'}${help ? ' has-help' : ''}`}>
      <details className="tx-fine" open={open}>
        <summary>
          <span className="grow">
            <span className="tx-fine-l">{label}</span>
            {meta && <span className="tx-fine-m">{meta}</span>}
          </span>
          <ChevronDown size={18} className="tx-fine-c" aria-hidden="true" />
        </summary>
        <div className="tx-fine-body">{children}</div>
      </details>
      {help && <span className="tx-fine-help">{help}</span>}
    </div>
  );
}
