// Tactics → Season Analysis, one page top to bottom: what your recent changes measured ("Since you
// changed it"), the season (the engine's tally of what your tactics won and gave up, how teams see
// you), then all fourteen grades of the system, each a tap from what it's made of.
import type { SystemReport } from '../../core/analysis/system';
import { seasonCoachingRead } from '../../core/analysis/debrief';
import { plural } from '../../core/format';
import { useLeague, useLeagueMemo } from '../../state/store';
import { Help, Section, Tag } from '../components/ui';
import { SinceYouChanged } from './EditLedger';
import { InsightsTab } from './InsightsTab';
import { SystemReportCard } from './SystemReport';

export function AnalysisTab({ report, was }: { report: SystemReport; was?: SystemReport }) {
  const league = useLeague();
  return (
    <>
      {/* what your changes measured, as made and on the games since (tactics/EditLedger) */}
      <SinceYouChanged league={league} />
      <LiveCoaching />
      <InsightsTab />
      <SystemReportCard report={report} was={was} />
    </>
  );
}

/**
 * What the coach's in-game moves have been worth this season: every live game's night replayed with
 * his moves and without them (GameResult.movesWorth), added up in points and wins, then by kind of
 * move. It says so when there's nothing to see. Nothing until two live games are measured.
 */
function LiveCoaching() {
  const league = useLeague();
  const c = useLeagueMemo(() => seasonCoachingRead(league), [league]);
  if (!c) return null;
  return (
    <Section
      title="Your live coaching"
      right={
        <Help title="Your live coaching">
          <p>
            After each game you coach live, the staff replays the night many times with your timeouts, subs, tactical changes and play calls, and without them, on the same luck.
            The difference is what your moves were worth. One night is mostly noise; a season adds up.
          </p>
        </Help>
      }
    >
      <div className="card flush list">
        <div className="listrow">
          <span className="grow tx-swrow-m">
            <span className="lr-name">
              {c.worth} pts {c.pm} · {c.wins} wins {c.winsPm}
            </span>
            <span className="lr-meta tx-edmeta">
              Over {plural(c.games, 'game')} coached live. {c.verdict}
            </span>
          </span>
        </div>
        {c.kinds.map((k) => (
          <div key={k.label} className="listrow tx-edrow">
            <span className="grow tx-swrow-m">
              <span className="lr-name">{k.label}</span>
              <span className="lr-meta tx-edmeta">{k.note}</span>
            </span>
            <Tag tone={k.tone === 'dim' ? undefined : k.tone}>{k.fig}</Tag>
          </div>
        ))}
      </div>
    </Section>
  );
}
