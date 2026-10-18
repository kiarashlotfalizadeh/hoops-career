// A fit as a figure with a bar under it (the bar's length is the fit out of 100), in a row's fit
// column: a playbook's fit for the roster, or the best fit on the roster for a set.
export function FitScore({ v, tone = '' }: { v: number; tone?: string }) {
  return (
    <span className={`tx-fitv ${tone}`}>
      <span className="num">{v}</span>
      <span className="tx-fitbar" aria-hidden="true">
        <i style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
      </span>
    </span>
  );
}
