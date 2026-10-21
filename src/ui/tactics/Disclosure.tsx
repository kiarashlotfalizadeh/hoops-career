// A card that opens: a row with its name and what's inside, the rest under it once tapped. The
// Tactics tabs' depth one tap down (Instructions' Fine-tune, Match's More rules).
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function Disclosure({ label, meta, children, open }: { label: string; meta?: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="card flush tx-fine" open={open}>
      <summary>
        <span className="grow">
          <span className="tx-fine-l">{label}</span>
          {meta && <span className="tx-fine-m">{meta}</span>}
        </span>
        <ChevronDown size={18} className="tx-fine-c" aria-hidden="true" />
      </summary>
      <div className="tx-fine-body">{children}</div>
    </details>
  );
}
