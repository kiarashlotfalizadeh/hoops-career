// Team → Growth: the development report as it stands (the monthly mail links here). A hero with
// where the report stands (the check-in, the next one), the one to watch and the development coach's
// word on the setup; then the young players Rising, Holding and Slipping with a short reason each
// (the whole of it on his page), the veterans (who hold until the summer), the
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

/**
 * The coach's reason, short for a row: its first sentence, without the group's word the section
 * already says ("Holding; shot blocking +1 since opening night. 29 minutes..." reads "Shot blocking +1
 * since opening night."). The whole of it is on his Growth tab.
 */
function shortWhy(why: string): string {
  const first = why.split(/(?<=\.)\s/)[0];
  const t = first.replace(/^(Rising|Holding|Slipping)[;:,]\s*/i, '');
  return t ? t[0].toUpperCase() + t.slice(1) : first;
}

/** One player in the report: his jersey, name and tag, then his age and the coach's reason in a line; OVR with this season's change. */
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
        <span className="dv-row-why">
          <span className="sr-only">
            {p.pos}, POT {p.pot},{' '}
          </span>
          {playerAge(p, league.season)} · {shortWhy(why)}
        </span>
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
      {/* the hero: where the report stands, and the one to watch */}
      <section className="card dv-hero" aria-label="Development report">
        <div className="dv-hero-top">
          <span className="over">
            {r.check ? `After the ${nth} check-in` : league.phase === 'preseason' ? 'The summer’s work is in' : 'Between check-ins'}
            {next ? ` · next ${next}` : ''}
          </span>
          <Help title="How players develop">
            <p>
              Most of a player&apos;s year happens over the summer: young players climb, veterans fade, and the arrows here measure from where each ended last season. In season the
              staff checks in three times; players 26 and younger move a little each time. Minutes (25 a night or more), coaching, the coaching budget, practice intensity and his
              training focus all push the same way. Breakout: well past what his age alone would add.
            </p>
          </Help>
        </div>
        {r.watch ? (
          <Link to={`/player/${r.watch.pid}?tab=dev`} className="dv-watch">
            <Avatar p={league.players[r.watch.pid]} size="lg" />
            <span className="dv-watch-t">
              <span className="over">The one to watch</span>
              <span className="dv-watch-n">{playerName(league.players[r.watch.pid])}</span>
              <span className="dv-watch-why">{r.watch.why[0].toUpperCase() + r.watch.why.slice(1)}.</span>
            </span>
            <Ovr v={league.players[r.watch.pid].ovr} />
          </Link>
        ) : (
          <div className="dv-coach-h">From the development coach</div>
        )}
        <p className="dv-setup">{r.setup}</p>
      </section>

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
