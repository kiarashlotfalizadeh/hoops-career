// Free agency's market, on the Free Agents screen while it runs: your pending offers, the latest signings, and the dock that moves the market on a day or a week (and,
// on its last day, starts the new season).
import { Play } from 'lucide-react';
import { seasonLabel } from '../../core/constants';
import { freeAgents, playerName, shortName } from '../../core/league/helpers';
import { withdrawBid } from '../../core/league/freeAgency';
import { faDayNumber, faOver } from '../../core/league/season';
import { agendaBlocker } from '../../core/league/agenda';
import { useLeague, useStore } from '../../state/store';
import { settle, useBusy } from '../../state/actions/office';
import { useFlowRunner } from '../useFlow';
import { More, Section } from '../components/ui';
import { forYears, useDockHeight } from './common';
import { money } from '../../core/format';

/**
 * What's moving on the market (the day is in the screen's header): your pending offers (each opens
 * its sheet) and the latest signings.
 * Nothing when there's none of it.
 */
export function FaMarket({ onOpen }: { onOpen: (pid: number) => void }) {
  const league = useLeague();
  const bids = league.faBids ?? [];
  const busy = useBusy();
  const over = faOver(league);
  const withdraw = (pid: number) => settle('Withdrawing your offer', (l) => withdrawBid(l, pid), 'neutral');
  const recent = league.news
    .filter((x) => x.kind === 'signing' && x.season === league.season)
    .slice(-4)
    .reverse();
  if (!bids.length && !recent.length && !over) return null;
  return (
    <Section title="The market">
      <div className="card fo-market">
        {over && <div className="small dim2">The market is winding down.</div>}
        {bids.length > 0 && (
          <div className="fo-pending">
            <div className="over">Your pending offers</div>
            {bids.map((b) => {
              const bp = league.players[b.pid];
              return (
                <div key={b.pid} className="fo-pending-item">
                  <button className="fo-pending-row grow" aria-haspopup="dialog" onClick={() => onOpen(b.pid)}>
                    <b>{playerName(bp)}</b> · {money(b.amount)} {forYears(b.years)}
                    <span className="dim"> · {b.decideDay > league.faDay ? `decides day ${b.decideDay + 1}` : 'decides at the close'}</span>
                  </button>
                  <button className="btn xs" disabled={busy} aria-label={`Withdraw your offer to ${playerName(bp)}`} onClick={() => withdraw(b.pid)}>
                    Withdraw
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {/* the newest signing in a line, the ones before it one tap down */}
        {recent.length > 0 && (
          <>
            <ul className="fo-notes">
              <li>{recent[0].text}</li>
            </ul>
            {recent.length > 1 && (
              <More label={`${recent.length - 1} more signing${recent.length > 2 ? 's' : ''}`}>
                <ul className="fo-notes">
                  {recent.slice(1).map((x) => (
                    <li key={x.id}>{x.text}</li>
                  ))}
                </ul>
              </More>
            )}
          </>
        )}
      </div>
    </Section>
  );
}

/** Advance the market a day or a week (a toast says what happened); on its last day, start the new season. */
export function FaDock() {
  const league = useLeague();
  const bids = league.faBids ?? [];
  const busy = useBusy();
  const over = faOver(league);
  // the market's last day: the new season is next (the Continue bar's words)
  const runFlow = useFlowRunner();
  const newSeasonLabel = `Start ${seasonLabel(league.season + 1)} season`;
  // a decision the league waits on holds the calendar, as it holds the Continue bar
  const held = agendaBlocker(league);
  // (toasts rise above the dock: see useDockHeight)
  const ref = useDockHeight<HTMLDivElement>(over);
  const advance = async (days: number) => {
    const before = freeAgents(league).map((p) => p.pid);
    const offered = bids.map((b) => b.pid);
    const from = faDayNumber(league) + 1;
    // behind the progress bar, like the Play menu's: a second tap while it runs is a no-op
    if (!(await useStore.getState().task('Free agency', { kind: 'faAdvance', days }))) return;
    const l = useStore.getState().league!;
    const signed = before
      .map((pid) => l.players[pid])
      .filter((p) => p && p.tid >= 0 && p.tid !== l.userTid)
      .sort((a, b) => b.ovr - a.ovr);
    const day = faDayNumber(l);
    const when = day > from ? `Days ${from}-${day}` : `Day ${day}`;
    // the players who decided on your offers lead (the details are in the inbox)
    const decided = offered.filter((pid) => !l.faBids?.some((b) => b.pid === pid)).map((pid) => l.players[pid]);
    const won = decided.some((p) => p?.tid === l.userTid);
    const verdicts = decided
      .filter(Boolean)
      .map((p) =>
        p.tid === l.userTid ? `${shortName(l, p)} chose you!` : p.tid >= 0 ? `${shortName(l, p)} chose ${l.teams[p.tid].abbrev}.` : `${shortName(l, p)} passed on your offer.`,
      )
      .join(' ');
    useStore.getState().toast(
      `${verdicts ? `${verdicts} ` : ''}${
        signed.length
          ? `${when}: ${signed.length} signing${signed.length > 1 ? 's' : ''}. ${signed
              .slice(0, 2)
              .map((p) => `${shortName(l, p)} (${p.ovr}) → ${l.teams[p.tid].abbrev}`)
              .join(', ')}${signed.length > 2 ? '…' : ''}`
          : `${when}: ${day > from ? (day - from >= 6 ? 'a quiet week' : 'a few quiet days') : 'a quiet day'} on the market.`
      }`,
      won ? 'good' : 'neutral',
    );
  };
  return (
    <div ref={ref} className={`fo-dock ${over ? 'fo-dock-go' : 'fo-dock-days'}`}>
      {over ? (
        <button className="btn primary block big" disabled={busy} onClick={() => void runFlow({ id: 'new', label: newSeasonLabel, cmd: 'newSeason' })}>
          <Play size={18} fill="currentColor" /> {newSeasonLabel}
        </button>
      ) : (
        <div className="grid2">
          {/* (no icons: the Play menu's words fit a phone's half width without them) */}
          <button className="btn primary" disabled={busy || !!held} onClick={() => void advance(1)}>
            Advance 1 day
          </button>
          <button className="btn" disabled={busy || !!held} onClick={() => void advance(7)}>
            Advance 1 week
          </button>
        </div>
      )}
      {held && <div className="tiny warn fo-dock-why">{`${held.title.replace(/\?$/, '')} first.`}</div>}
    </div>
  );
}
