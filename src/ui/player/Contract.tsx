// A player's contract on his page's Overview: salary, when it ends and his market value, the notes
// that come with it (option, extension, two-way, 10-day, qualifying offer), a free agent's ask with
// the way to his offer sheet, and the desk's actions on him (trade, extend, convert, release), each
// disabled with the reason when it can't be done now.
import { Link } from 'react-router-dom';
import { ArrowLeftRight, PenLine } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { DRAFT_PROSPECT, FREE_AGENT } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { contractExp, extensionStart, salaryFor } from '../../core/playerGen';
import { askingContract, convertTwoWay, extensionBlockedReason, marketSalary, releaseBlockedReason, rookieScaleDeal } from '../../core/league/contracts';
import { untradeableReason } from '../../core/league/trades';
import { deadlineLabel } from '../../core/league/rfa';
import { money } from '../../core/format';
import { liveInProgress } from '../../state/live';
import { act } from '../../state/actions';
import { useStore } from '../../state/store';
import { Section, Statline } from '../components/ui';
import { Term } from '../components/Glossary';
import { capSeason, contractEnd, contractUpNote, openOption, salaryText, shortSeason, tradeClosedNote } from '../office/common';
import { sheetTerms } from '../office/RfaPanel';
import { TenDayActions, tenDayLine } from '../office/TenDayPanel';

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
  const finalSeason = mine && !p.contract.twoWay && extensionStart(p.contract) === null && contractExp(p.contract) === capSeason(league);
  const extendWhy = finalSeason ? (busyWhy ?? extensionBlockedReason(league, p)) : null;
  return { mine, busyWhy, tradeWhy, releaseWhy, finalSeason, extendWhy };
}

export function ContractSection({ league, p, onExtend, onRelease }: { league: League; p: Player; onExtend: () => void; onRelease: () => void }) {
  const simming = useStore((s) => !!s.sim);
  const { mine, busyWhy, tradeWhy, releaseWhy, finalSeason, extendWhy } = deskBlocks(league, p);
  const extStart = extensionStart(p.contract);
  // the season contracts count against (next season in the offseason), or this one for a contract that's up
  const salSeason = salaryFor(p, capSeason(league)) ? capSeason(league) : league.season;
  const sal = salaryFor(p, salSeason);
  const faAsk = p.tid === FREE_AGENT ? askingContract(league, p, league.userTid) : null;
  const whys = [...new Set([tradeWhy, releaseWhy, extendWhy])].filter(Boolean).join(' ');
  const convert = () => {
    let res = { ok: false, reason: '' };
    if (!act('Convert his deal', (l) => void (res = convertTwoWay(l, p.pid)))) return;
    useStore.getState().toast(res.reason, res.ok ? 'good' : 'bad');
  };
  return (
    <Section title="Contract">
      <div className="card tm-deal">
        {p.tid >= 0 ? (
          <>
            <Statline
              items={[
                { k: 'Salary', v: salaryText(league, sal), s: shortSeason(salSeason) },
                {
                  // when it ends as every desk says it ("thru 30-31 PO", "expiring"), an extension's seasons included
                  k: 'Contract',
                  v: contractEnd(league, p, salSeason),
                  s: extStart !== null ? 'extended' : openOption(league, p) ? `${openOption(league, p)} option` : rookieScaleDeal(p) ? 'rookie scale' : undefined,
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
            {p.contract.twoWay && (
              <div className="tm-deal-note">
                <Term id="twoway">Two-way</Term>: off the 15-man roster and the cap.
              </div>
            )}
            {p.contract.tenDay && <div className="tm-deal-note">{tenDayLine(league, p)}</div>}
            {p.rfa && (
              <div className="tm-deal-note">
                <Term id="qo">Qualifying offer</Term> out ({money(p.rfa.qo)} for {seasonLabel(league.season + 1)}): restricted when free agency opens.
              </div>
            )}
          </>
        ) : faAsk ? (
          <>
            <div className="tm-deal-note">
              {p.waivers
                ? `On waivers: any team can claim his contract until he clears ${p.waivers.until - league.day > 1 ? `in ${p.waivers.until - league.day} days` : 'tomorrow'}.`
                : p.rfa?.sheet
                  ? `Signed an offer sheet with ${league.teams[p.rfa.sheet.tid].abbrev} (${sheetTerms(league, p)}). ${league.teams[p.rfa.tid].abbrev} can match until the end of ${deadlineLabel(p.rfa.sheet.until)}.`
                  : p.rfa?.tid === league.userTid
                    ? `Your restricted free agent: asking ${money(faAsk.amount)} × ${faAsk.years} yr${faAsk.years === 1 ? '' : 's'}. Unsigned at the close, he takes his ${money(p.rfa.qo)} qualifying offer.`
                    : p.rfa
                      ? `Restricted: ${league.teams[p.rfa.tid].abbrev} can match any offer sheet. Asking ${money(faAsk.amount)} × ${faAsk.years} yr${faAsk.years === 1 ? '' : 's'} from you.`
                      : `Asking ${money(faAsk.amount)} × ${faAsk.years} yr${faAsk.years === 1 ? '' : 's'} from you.`}
            </div>
            {/* straight to his offer (or claim) sheet on the Free Agents screen */}
            {!p.rfa?.sheet && (
              <Link className="btn sm primary tm-deal-go" to={`/office/free-agents?offer=${p.pid}`}>
                {p.waivers ? 'Claim off waivers' : p.rfa?.tid === league.userTid ? 'Re-sign' : p.rfa ? 'Offer sheet' : 'Make an offer'}
              </Link>
            )}
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
              {p.contract.twoWay && (
                <button className="btn sm" disabled={!!busyWhy || simming} onClick={convert}>
                  Convert to standard
                </button>
              )}
              <button className="btn sm danger" disabled={!!releaseWhy || simming} onClick={onRelease}>
                Release
              </button>
            </div>
            {whys && <div className="tm-why-line">{whys}</div>}
            {p.contract.tenDay && <TenDayActions league={league} p={p} />}
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
