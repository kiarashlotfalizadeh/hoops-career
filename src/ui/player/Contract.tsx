// A player's contract on his page's Overview: salary, when it ends and his market value, the notes
// that come with it (option, extension), a free agent's ask with the way to his offer, and the
// desk's actions on him (trade, extend, release), each disabled with the reason when it can't be
// done now.
import { Link } from 'react-router-dom';
import { ArrowLeftRight, PenLine } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { DRAFT_PROSPECT, FREE_AGENT } from '../../core/types';
import { contractExp, extensionStart, salaryFor } from '../../core/playerGen';
import { askingContract, extensionBlockedReason, marketSalary, releaseBlockedReason, rookieScaleDeal } from '../../core/league/contracts';
import { untradeableReason } from '../../core/league/trades';
import { money } from '../../core/format';
import { liveInProgress } from '../../state/live';
import { useStore } from '../../state/store';
import { Section, Statline } from '../components/ui';
import { capSeason, contractUpNote, forYears, openOption, salaryText, shortSeason, tradeClosedNote } from '../office/common';

/** What the desk can do with a player now, and why not when it can't (null: it can). */
export function deskBlocks(league: League, p: Player) {
  // a fired coach's old team isn't his to run
  const mine = p.tid === league.userTid && !league.fired;
  // a paused live game would record a moved player's line for his old team; a contract that's up is re-signed or let go, as in the Office
  const busyWhy = liveInProgress(league) ? 'Finish your live game first.' : null;
  const upNote = contractUpNote(league, p);
  const tradeWhy = busyWhy ?? upNote ?? tradeClosedNote(league) ?? untradeableReason(league, p);
  const releaseWhy = busyWhy ?? upNote ?? releaseBlockedReason(league, p);
  // in the final season of a standard deal: extend him, or why not yet
  const finalSeason = mine && extensionStart(p.contract) === null && contractExp(p.contract) === capSeason(league);
  const extendWhy = finalSeason ? (busyWhy ?? extensionBlockedReason(league, p)) : null;
  return { mine, busyWhy, tradeWhy, releaseWhy, finalSeason, extendWhy };
}

export function ContractSection({ league, p, onExtend, onRelease }: { league: League; p: Player; onExtend: () => void; onRelease: () => void }) {
  const simming = useStore((s) => !!s.sim);
  const { mine, tradeWhy, releaseWhy, finalSeason, extendWhy } = deskBlocks(league, p);
  const extStart = extensionStart(p.contract);
  // the season contracts count against (next season in the offseason), or this one for a contract that's up
  const salSeason = salaryFor(p, capSeason(league)) ? capSeason(league) : league.season;
  const sal = salaryFor(p, salSeason);
  const faAsk = p.tid === FREE_AGENT ? askingContract(league, p, league.userTid) : null;
  const whys = [...new Set([tradeWhy, releaseWhy, extendWhy])].filter(Boolean).join(' ');
  return (
    <Section title="Contract">
      <div className="tm-deal">
        {p.tid >= 0 ? (
          <>
            <Statline
              items={[
                { k: 'Salary', v: salaryText(league, sal), s: shortSeason(salSeason) },
                {
                  // its last season as the figure (an extension's seasons included) and what's special about it under it, as
                  // every desk's "thru 30-31 PO" / "expiring" says it: the season alone keeps the figure to one line
                  k: 'Ends',
                  v: shortSeason(Math.max(contractExp(p.contract), salSeason)),
                  s:
                    contractExp(p.contract) <= salSeason
                      ? 'expiring'
                      : extStart !== null
                        ? 'extended'
                        : openOption(league, p)
                          ? `${openOption(league, p)} option`
                          : rookieScaleDeal(p)
                            ? 'rookie scale'
                            : undefined,
                },
                { k: 'Market', v: money(marketSalary(league, p)), s: 'value' },
              ]}
            />
            {openOption(league, p) && rookieScaleDeal(p) && <div className="tm-deal-note">Rookie scale deal.</div>}
            {extStart !== null && (
              <div className="tm-deal-note">
                <span className="good bold">Extended</span> · {salaryText(league, salaryFor(p, extStart))} from {shortSeason(extStart)}
              </div>
            )}
          </>
        ) : faAsk ? (
          <>
            <div className="tm-deal-note">
              Asking {money(faAsk.amount)} {forYears(faAsk.years)} from you.
            </div>
            {/* straight to his offer on the Free Agents screen */}
            <Link className="btn sm primary tm-deal-go" to={`/office/free-agents?offer=${p.pid}`}>
              Make an offer
            </Link>
          </>
        ) : p.tid === DRAFT_PROSPECT ? (
          <div className="tm-deal-note">Eligible for the {p.draft.year} draft.</div>
        ) : (
          <div className="small dim">—</div>
        )}
        {mine ? (
          <>
            <div className="row wrap tm-acts">
              {tradeWhy || simming ? (
                <button className="btn sm" disabled>
                  <ArrowLeftRight size={15} /> Trade
                </button>
              ) : (
                <Link className="btn sm" to={`/office/trade?give=${p.pid}`}>
                  <ArrowLeftRight size={15} /> Trade
                </Link>
              )}
              {finalSeason && (
                <button className="btn sm" disabled={!!extendWhy || simming} onClick={onExtend}>
                  <PenLine size={15} /> Extend
                </button>
              )}
              <button className="btn sm danger" disabled={!!releaseWhy || simming} onClick={onRelease}>
                Release
              </button>
            </div>
            {whys && <div className="tm-why-line">{whys}</div>}
          </>
        ) : (
          p.tid >= 0 &&
          p.tid !== league.userTid && (
            <div className="row tm-acts">
              <Link className="btn sm" to={`/office/trade?with=${p.tid}&get=${p.pid}`}>
                <ArrowLeftRight size={15} /> Trade for him
              </Link>
            </div>
          )
        )}
      </div>
    </Section>
  );
}
