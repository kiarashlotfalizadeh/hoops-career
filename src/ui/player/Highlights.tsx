// A player's season so far, on his Overview: the rookie watch (his line and his place in the rookie
// of the year race) and the season's highlights: career highs set this season, honors (the
// league's awards and the press's weekly and monthly ones) and the news that named him (milestones,
// big nights, a breakout). Each links to where it lives.
import { Link } from 'react-router-dom';
import type { League, Player } from '../../core/types';
import { REC_LABEL, REC_STATS, type RecStat } from '../../core/league/records';
import { fmtDate } from '../../core/league/helpers';
import { baseLabel, devBase, isRookie, ovrChange, rookieLine, royRace } from '../../core/league/devWatch';
import { signedInt } from './dev';
import { useLeagueMemo } from '../../state/store';
import { ordinal } from '../../core/format';
import { Section, Statline } from '../components/ui';
import { f1 } from '../stats';

/** A career high worth a line: below these it's a career only a few games old talking. */
const HIGH_FLOOR: Record<RecStat, number> = { pts: 15, reb: 10, ast: 8, stl: 4, blk: 4, tpm: 4 };
/** The figures' short names, as the box score's columns. */
const UNIT: Record<RecStat, string> = { pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', tpm: '3PM' };

interface Highlight {
  key: string;
  fig: string;
  unit: string;
  text: string;
  sub?: string;
  to?: string;
}

/** The season's highlights for a player, newest first within each kind. */
export function seasonHighlights(league: League, p: Player): Highlight[] {
  const out: Highlight[] = [];
  const games = new Set(league.games.map((g) => g.gid));
  for (const stat of REC_STATS) {
    const h = p.highs?.[stat];
    if (!h || h[1] !== league.season || h[0] < HIGH_FLOOR[stat]) continue;
    const [v, , day, opp, gid] = h;
    const team = league.teams[opp];
    out.push({
      key: `high-${stat}`,
      fig: String(v),
      unit: UNIT[stat],
      text: `Career high in ${REC_LABEL[stat][1]}`,
      sub: `${team ? `vs ${team.abbrev} · ` : ''}${fmtDate(league.season, day)}`,
      to: games.has(gid) ? `/game/${gid}` : undefined,
    });
  }
  const honors = (league.media?.honors ?? []).filter((x) => x.season === league.season && x.pid === p.pid);
  const HONOR: Record<string, string> = { potw: 'Player of the Week', potm: 'Player of the Month', rotm: 'Rookie of the Month', cotm: 'Coach of the Month' };
  for (const x of honors)
    out.push({
      key: `honor-${x.kind}-${x.day}`,
      fig: '★',
      unit: 'Honor',
      text: `${HONOR[x.kind] ?? 'Honor'}${x.conf ? ` (${x.conf === 'E' ? 'East' : 'West'})` : ''}`,
      sub: `${fmtDate(league.season, x.day)} · ${x.line}`,
    });
  // the league's awards this season, less the press's honors already listed
  const named = new Set(honors.map((x) => HONOR[x.kind]));
  for (const a of p.awards.filter((x) => x.season === league.season && !named.has(x.type)))
    out.push({ key: `award-${a.type}`, fig: '★', unit: 'Award', text: a.type, to: '/league/awards' });
  for (const n of league.news
    .filter((x) => x.season === league.season && x.pids.includes(p.pid) && (x.kind === 'milestone' || x.kind === 'record' || (x.kind === 'general' && x.head)))
    .slice(-6)
    .reverse())
    out.push({
      key: `news-${n.id}`,
      fig: '•',
      unit: n.kind === 'record' ? 'Record' : 'News',
      text: n.head ?? n.text,
      sub: `${fmtDate(n.season, n.day)}${n.head ? ` · ${n.text}` : ''}`,
      to: n.head ? `/league/news?story=${n.id}` : undefined,
    });
  return out;
}

function Row({ h }: { h: Highlight }) {
  const body = (
    <>
      <span className="dv-hl-fig num">
        {h.fig}
        <small>{h.unit}</small>
      </span>
      <span className="dv-hl-t">
        {h.text}
        {h.sub && <span className="dim">{h.sub}</span>}
      </span>
    </>
  );
  return h.to ? (
    <Link to={h.to} className="dv-hl-row">
      {body}
    </Link>
  ) : (
    <div className="dv-hl-row">{body}</div>
  );
}

export function SeasonHighlights({ league, p }: { league: League; p: Player }) {
  const list = useLeagueMemo(() => seasonHighlights(league, p), [league, p]);
  if (!list.length) return null;
  return (
    <Section title="This season’s highlights">
      <div className="dv-hl">
        {list.map((h) => (
          <Row key={h.key} h={h} />
        ))}
      </div>
    </Section>
  );
}

/** A rookie's season: his line a game and his place in the rookie of the year race. */
export function RookieWatch({ league, p }: { league: League; p: Player }) {
  const races = useLeagueMemo(() => (isRookie(league, p) ? royRace(league) : []), [league, p]);
  const r = rookieLine(league, p, races);
  if (!r) return null;
  const won = league.awards.find((a) => a.season === league.season)?.roy !== undefined;
  const change = ovrChange(league, p);
  const since = baseLabel(devBase(league, p)).replace('since ', '');
  return (
    <Section
      title="Rookie watch"
      right={
        <Link to="/league/awards" className="card-link">
          ROY race
        </Link>
      }
    >
      <div>
        {/* (his points and rebounds are on the slab: here what a rookie's season is measured by) */}
        <Statline
          items={[
            { k: 'Games', v: r.gp },
            { k: 'MIN', v: r.gp ? f1(r.mpg) : '—', s: 'a game' },
            { k: 'ROY', v: r.roy ? ordinal(r.roy) : '—', s: won ? (r.roy === 1 ? 'won it' : 'the race') : r.roy ? 'in the race' : 'not top 10' },
            { k: 'OVR', v: change ? signedInt(change) : '0', s: since, color: change > 0 ? 'var(--good)' : change < 0 ? 'var(--bad)' : undefined },
          ]}
        />
      </div>
    </Section>
  );
}
