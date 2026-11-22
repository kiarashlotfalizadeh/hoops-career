// One player in the free-agent list: his rating, name and tag (your bid, an injury), his interest
// in your team and how you could pay him, and his ask.
import type { League, Player, SigningRoute } from '../../core/types';
import { playerName } from '../../core/league/helpers';
import type { Ask } from '../../core/league/contracts';
import { playerAge } from '../../core/playerGen';
import { OvrPot, appealInfo, forYears, outTag, salaryText } from './common';

export function FaRow({
  league,
  p,
  ask,
  appeal,
  route,
  space,
  fill,
  onOpen,
}: {
  league: League;
  p: Player;
  ask: Ask;
  appeal: number;
  route: SigningRoute | null;
  /** Your cap space (after pending offers). */
  space: number;
  /** What he'd do to your roster's need ("Rim protection D → B"), when he'd move it: `good` when he'd fill it. */
  fill?: { text: string; good: boolean };
  onOpen: () => void;
}) {
  const ai = appealInfo(appeal);
  const bid = (league.faBids ?? []).find((b) => b.pid === p.pid);
  const tag: { label: string; tone: string } | null = bid
    ? { label: `Bidding · ${bid.decideDay > league.faDay ? `decides day ${bid.decideDay + 1}` : 'decides at the close'}`, tone: 'info' }
    : p.injury
      ? { label: outTag(p)!, tone: 'bad' }
      : null;
  const how =
    route === 'min' ? (
      <span className="good">Min deal</span>
    ) : route === 'space' ? (
      <span className="good">Fits your space</span>
    ) : route === 'mle' ? (
      <span className="good">Mid-level</span>
    ) : space > 0 ? (
      <span className="warn">More than your space</span>
    ) : (
      <span className="dim">Needs cap space</span>
    );
  return (
    <button className="fo-prow" onClick={onOpen}>
      <OvrPot p={p} />
      <div className="grow">
        <div className="fo-prow-name">
          <span className="fo-name">{playerName(p)}</span>
          {/* one tag, the one that changes what you can do: your bid, an injury */}
          {tag && <span className={`fo-flag ${tag.tone}`}>{tag.label}</span>}
        </div>
        <div className="fo-meta">
          {p.pos} · {playerAge(p, league.season)}
          {' · '}
          <span className="fo-interest" style={{ ['--note' as string]: ai.color }}>
            {ai.label}
          </span>
          {fill && (
            <>
              {' · '}
              <span className={fill.good ? 'good' : 'warn'} aria-label={`The need: ${fill.text}`}>
                {fill.text}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="fo-fa-end">
        <div className="fo-money">
          <div className="a">{salaryText(league, ask.amount)}</div>
          <div className="b">{forYears(ask.years)}</div>
        </div>
        {/* how you'd pay him (or why you can't), under his terms */}
        <div className="fo-route">{how}</div>
      </div>
    </button>
  );
}
