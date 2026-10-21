// Team → Growth: the development report as it stands (the monthly mail links here). The player
// development coach's word on the setup and the next check-in, the one to watch, the young players
// Rising, Holding and Slipping with a reason each, the veterans (who hold until the summer), the
// rookie watch, and the breakouts around the league. Every name opens his page.
import { Link } from 'react-router-dom';
import type { League, Player } from '../../core/types';
import { CHECK_DAYS, GROUP_LABEL, YOUNG, devReport, devTag, isBreakout, ovrChange, rookieText, type DevLine } from '../../core/league/devWatch';
import { fmtDate, playerName, shortName } from '../../core/league/helpers';
import { playerAge } from '../../core/playerGen';
import { useLeague, useLeagueMemo } from '../../state/store';
import { Avatar, Help, Ovr, Section } from '../components/ui';
import { DevDelta, DevTagChip } from '../player/dev';
import '../player/growth.css';

/** One player in the report: his jersey, name and tag, age and position, the coach's reason; OVR with this season's change. */
function DevRow({ league, p, why }: { league: League; p: Player; why: string }) {
  const tag = devTag(league, p);
  return (
    <Link to={`/player/${p.pid}?tab=dev`} className="dv-row">
      <Avatar p={p} />
      <span className="dv-row-t">
        <span className="dv-row-name">
          <span className="ellipsis">{playerName(p)}</span>
          {tag && <DevTagChip tag={tag} />}
        </span>
        <span className="dv-row-meta">
          {p.pos} · {playerAge(p, league.season)} · POT {p.pot}
        </span>
        <span className="dv-row-why">{why}</span>
      </span>
      <span className="dv-row-ovr">
        <Ovr v={p.ovr} size="sm" />
        <DevDelta d={ovrChange(league, p)} since="this season" />
      </span>
    </Link>
  );
}

/** The next check-in's date this season, if one is still to come. */
function nextCheck(league: League): string | null {
  if (league.phase !== 'regular' && league.phase !== 'preseason') return null;
  const day = CHECK_DAYS.find((d) => d >= league.day || league.phase === 'preseason');
  return day === undefined ? null : fmtDate(league.season, day);
}

/** Young players around the league well past what their age adds this season, the best first. */
function leagueBreakouts(league: League, n = 6): Player[] {
  return Object.values(league.players)
    .filter((p) => p.tid >= 0 && p.tid !== league.userTid && playerAge(p, league.season) <= YOUNG && isBreakout(league, p))
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, n);
}

export default function GrowthView() {
  const league = useLeague();
  const r = useLeagueMemo(() => devReport(league), [league]);
  const around = useLeagueMemo(() => leagueBreakouts(league), [league]);
  const next = nextCheck(league);
  const groups = (['rising', 'holding', 'slipping'] as const).filter((g) => r[g].length);
  const row = (x: DevLine) => <DevRow key={x.pid} league={league} p={league.players[x.pid]} why={x.reason} />;
  const nth = ['first', 'second', 'third'][r.check - 1];
  return (
    <>
      <Section
        title="From the development coach"
        right={
          <Help title="How players develop">
            Most of a player&apos;s year happens over the summer: young players climb, veterans fade, and the arrows here measure from where each ended last season. In season the
            staff checks in three times; players 26 and younger move a little each time. Minutes (25 a night or more), coaching, the coaching budget, practice intensity and his
            training focus all push the same way. Breakout: well past what his age alone would add.
          </Help>
        }
      >
        <div className="dv-coach">
          <div className="dv-coach-h">{r.check ? `After the ${nth} check-in` : league.phase === 'preseason' ? 'The summer’s work is in' : 'Between check-ins'}</div>
          <p>
            {r.setup}
            {next ? ` Next check-in ${next}.` : ''}
          </p>
        </div>
      </Section>

      {r.watch && (
        <Section title="The one to watch">
          <Link to={`/player/${r.watch.pid}?tab=dev`} className="dv-watch">
            <Avatar p={league.players[r.watch.pid]} size="lg" />
            <span className="dv-watch-t">
              <span className="dv-watch-n">{playerName(league.players[r.watch.pid])}</span>
              <span className="dv-watch-why">{r.watch.why[0].toUpperCase() + r.watch.why.slice(1)}.</span>
            </span>
            <Ovr v={league.players[r.watch.pid].ovr} />
          </Link>
        </Section>
      )}

      {groups.map((g) => (
        <Section key={g} title={`${GROUP_LABEL[g]} · ${r[g].length}`}>
          <div className="dv-list">{r[g].map(row)}</div>
        </Section>
      ))}

      {r.rookies.length > 0 && (
        <Section title="Rookie watch">
          <div className="dv-list">
            {r.rookies.map((x) => (
              <DevRow key={x.pid} league={league} p={league.players[x.pid]} why={`${rookieText(x.line)[0].toUpperCase()}${rookieText(x.line).slice(1)}. ${x.dev.reason}`} />
            ))}
          </div>
        </Section>
      )}

      {r.veterans.length > 0 && (
        <div className="dv-vets">
          The veterans hold until the summer:{' '}
          {r.veterans.map((pid, i) => (
            <span key={pid}>
              {i ? ', ' : ''}
              <Link to={`/player/${pid}?tab=dev`}>{shortName(league, league.players[pid])}</Link>
            </span>
          ))}
          .
        </div>
      )}

      {around.length > 0 && (
        <Section title="Breakouts around the league">
          <div className="dv-list">
            {around.map((p) => (
              <DevRow key={p.pid} league={league} p={p} why={`${league.teams[p.tid].region} ${league.teams[p.tid].name}`} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
