import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Trophy } from 'lucide-react';
import type { GameResult, League, PlayInGame, PlayoffSeries } from '../../core/types';
import { confStandings } from '../../core/league/standings';
import { curTeamSeason, fmtDate, playerName } from '../../core/league/helpers';
import { seriesLabel } from '../../core/league/playoffs';
import { seasonLabel } from '../../core/constants';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Card, Segmented, Sheet } from '../components/ui';
import { confName, useQueryParam } from './shared';

/** A bracket slot: a real series, a projected matchup, or empty. */
interface Slot {
  series?: PlayoffSeries;
  high?: number;
  low?: number;
  highSeed?: number;
  lowSeed?: number;
  highWins?: number;
  lowWins?: number;
  winner?: number;
  /** Placeholder text for unknown teams. */
  tbdHigh?: string;
  tbdLow?: string;
}

const R1_PAIRS: [number, number][] = [
  [1, 8],
  [4, 5],
  [3, 6],
  [2, 7],
];

function fromSeries(s: PlayoffSeries | undefined): Slot {
  if (!s) return {};
  return { series: s, high: s.high, low: s.low, highSeed: s.highSeed, lowSeed: s.lowSeed, highWins: s.highWins, lowWins: s.lowWins, winner: s.winner };
}

/** Seeds 1..8 for a conference before the bracket exists (projected or post-play-in). */
function seedMap(league: League, conf: 'E' | 'W'): (number | undefined)[] {
  const out: (number | undefined)[] = [];
  if (league.phase === 'playin' || league.playIn.length) {
    for (const t of league.teams) {
      if (t.conf !== conf) continue;
      const ts = curTeamSeason(league, t.tid);
      if (ts.seed) out[ts.seed] = t.tid;
    }
    return out;
  }
  confStandings(league, conf)
    .slice(0, 8)
    .forEach((r, i) => (out[i + 1] = r.tid));
  return out;
}

function confSlots(league: League, conf: 'E' | 'W'): Slot[][] {
  const byId = new Map(league.playoffs.map((s) => [s.id, s]));
  if (league.playoffs.some((s) => s.conf === conf)) {
    return [[0, 1, 2, 3].map((i) => fromSeries(byId.get(`${conf}1-${i}`))), [0, 1].map((i) => fromSeries(byId.get(`${conf}2-${i}`))), [fromSeries(byId.get(`${conf}3-0`))]];
  }
  const seeds = seedMap(league, conf);
  const r1 = R1_PAIRS.map(([h, l]) => ({
    high: seeds[h],
    low: seeds[l],
    highSeed: h,
    lowSeed: l,
    tbdHigh: seeds[h] === undefined ? `${h} seed` : undefined,
    tbdLow: seeds[l] === undefined ? (l >= 7 ? 'Play-in' : `${l} seed`) : undefined,
  }));
  return [r1, [{}, {}], [{}]];
}

type Phase = 'none' | 'projected' | 'playin' | 'live' | 'done';

export function PlayoffsTab({ league }: { league: League }) {
  const userConf = league.teams[league.userTid].conf;
  const [conf, setConf] = useQueryParam<'E' | 'W'>('conf', userConf, ['E', 'W']);
  const [open, setOpen] = useState<PlayoffSeries | null>(null);
  const finals = league.playoffs.find((s) => s.round === 4);
  const champ = finals?.winner;
  // a projection needs results: on opening day every seed would be arbitrary
  const played = league.games.some((g) => g.season === league.season && g.type === 'regular');
  const phase: Phase =
    champ !== undefined ? 'done' : league.playoffs.length ? 'live' : league.playIn.length ? 'playin' : league.phase === 'regular' && played ? 'projected' : 'none';
  const slots = useLeagueMemo(() => ({ E: confSlots(league, 'E'), W: confSlots(league, 'W') }), [league]);
  const lastAw = [...league.awards].filter((a) => a.champion !== undefined).sort((a, b) => b.season - a.season)[0];

  if (phase === 'none') {
    return (
      <>
        <Card>
          <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 8, padding: '12px 0' }}>
            <Trophy size={30} className="dim" />
            <h3>Playoffs start after the regular season</h3>
            <div className="small dim" style={{ maxWidth: 340 }}>
              The top six in each conference qualify directly; seeds 7-10 battle it out in the play-in tournament. A projected bracket appears once games are played.
            </div>
          </div>
        </Card>
        {lastAw?.champion !== undefined && <ChampionBanner league={league} season={lastAw.season} tid={lastAw.champion} runnerUp={lastAw.runnerUp} fmvp={lastAw.finalsMvp} />}
      </>
    );
  }

  const status =
    phase === 'projected'
      ? 'Projected bracket if the season ended today'
      : phase === 'playin'
        ? 'Play-in tournament: seeds 7 and 8 are on the line'
        : phase === 'live'
          ? `${seasonLabel(league.season)} playoffs in progress`
          : `${seasonLabel(league.season)} playoffs complete`;

  return (
    <>
      {champ !== undefined && (
        <ChampionBanner
          league={league}
          season={league.season}
          tid={champ}
          runnerUp={finals ? (finals.high === champ ? finals.low : finals.high) : undefined}
          fmvp={league.awards.find((a) => a.season === league.season)?.finalsMvp}
        />
      )}
      <div className="row between" style={{ gap: 8 }}>
        <span className="small dim">{status}</span>
        {phase === 'projected' && <span className="tag info">Projected</span>}
      </div>
      <div className="bk-only-narrow">
        <Segmented
          value={conf}
          onChange={setConf}
          options={[
            { id: 'E', label: 'East' },
            { id: 'W', label: 'West' },
          ]}
        />
      </div>
      <div className="bk-panel-wrap">
        {(['E', 'W'] as const).map((c) => (
          <div key={c} className={`col ${c !== conf ? 'bk-hide-narrow' : ''}`} style={{ gap: 14 }}>
            <Card title={`${confName(c)}ern Conference`}>
              <Bracket league={league} slots={slots[c]} onOpen={setOpen} />
            </Card>
            <PlayIn league={league} conf={c} projected={phase === 'projected'} />
          </div>
        ))}
      </div>
      <FinalsCard league={league} finals={finals} onOpen={setOpen} />
      <SeriesSheet league={league} series={open} onClose={() => setOpen(null)} />
    </>
  );
}

function ChampionBanner({ league, season, tid, runnerUp, fmvp }: { league: League; season: number; tid: number; runnerUp?: number; fmvp?: number }) {
  const t = league.teams[tid];
  const p = fmvp !== undefined ? league.players[fmvp] : undefined;
  return (
    <div className="lg-champ">
      <div className="row" style={{ gap: 14 }}>
        <TeamLogo tid={tid} size={60} />
        <div className="grow">
          <div className="kicker">
            <Trophy size={12} style={{ verticalAlign: -1 }} /> {seasonLabel(season)} Champions
          </div>
          <div className="display bold" style={{ fontSize: 26, textTransform: 'uppercase', lineHeight: 1.05 }}>
            {t.region} {t.name}
          </div>
          <div className="small dim2" style={{ marginTop: 3 }}>
            {runnerUp !== undefined && <>def. {league.teams[runnerUp].name}</>}
            {p && (
              <>
                {runnerUp !== undefined ? ' · ' : ''}Finals MVP{' '}
                <Link to={`/player/${p.pid}`} className="lg-name-link">
                  {playerName(p)}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bracket({ league, slots, onOpen }: { league: League; slots: Slot[][]; onOpen: (s: PlayoffSeries) => void }) {
  const [r1, r2, r3] = slots;
  const card = (s: Slot, key: string) => <SeriesCard key={key} league={league} s={s} onOpen={onOpen} />;
  return (
    <>
      <div className="bk-head">
        <span>1st Round</span>
        <span>Semifinals</span>
        <span>Conf. Finals</span>
      </div>
      <div className="bk">
        <div className="bk-col r1">
          {[0, 2].map((i) => (
            <div key={i} className="bk-pair">
              <div className="bk-slot">{card(r1[i], `a${i}`)}</div>
              <div className="bk-slot">{card(r1[i + 1], `b${i}`)}</div>
            </div>
          ))}
        </div>
        <div className="bk-col r2">
          <div className="bk-pair">
            <div className="bk-slot">{card(r2[0], 'r2a')}</div>
            <div className="bk-slot">{card(r2[1], 'r2b')}</div>
          </div>
        </div>
        <div className="bk-col r3">
          <div className="bk-slot">{card(r3[0], 'r3')}</div>
        </div>
      </div>
    </>
  );
}

function SeriesCard({ league, s, onOpen }: { league: League; s: Slot; onOpen: (s: PlayoffSeries) => void }) {
  const known = s.high !== undefined || s.low !== undefined || s.tbdHigh || s.tbdLow;
  if (!known) {
    return (
      <div className="bk-s tbd">
        <div className="bk-t">
          <span />
          <span />
          <span className="tb">TBD</span>
          <span />
        </div>
        <div className="bk-t">
          <span />
          <span />
          <span className="tb">TBD</span>
          <span />
        </div>
      </div>
    );
  }
  const me = s.high === league.userTid || s.low === league.userTid;
  const live = !!s.series && s.winner === undefined && (s.highWins ?? 0) + (s.lowWins ?? 0) > 0;
  const line = (tid: number | undefined, seed: number | undefined, wins: number | undefined, tbd: string | undefined) => {
    const cls = s.winner === undefined ? '' : s.winner === tid ? 'win' : 'lose';
    return (
      <div className={`bk-t ${cls}`}>
        <span className="sd">{seed ?? ''}</span>
        {tid !== undefined ? (
          <>
            <TeamLogo tid={tid} size={18} />
            <span className="ellipsis">{league.teams[tid].abbrev}</span>
          </>
        ) : (
          // no logo yet: "Play-in" gets the logo's room too, so it fits a phone-width bracket
          <span className="tb ellipsis" style={{ gridColumn: 'span 2' }}>
            {tbd ?? 'TBD'}
          </span>
        )}
        <span className="w">{s.series ? wins : ''}</span>
      </div>
    );
  };
  const body = (
    <>
      {line(s.high, s.highSeed, s.highWins, s.tbdHigh)}
      {line(s.low, s.lowSeed, s.lowWins, s.tbdLow)}
    </>
  );
  const cls = `bk-s ${me ? 'me' : ''} ${live ? 'live' : ''}`;
  if (s.series) {
    const ser = s.series;
    return (
      <button
        className={cls}
        onClick={() => onOpen(ser)}
        aria-label={`${seriesLabel(ser)}: ${league.teams[ser.high].abbrev} ${ser.highWins}, ${league.teams[ser.low].abbrev} ${ser.lowWins}. Series details`}
      >
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

function FinalsCard({ league, finals, onOpen }: { league: League; finals?: PlayoffSeries; onOpen: (s: PlayoffSeries) => void }) {
  const side = (tid: number | undefined, wins: number, conf: string) => (
    <div className={`side ${finals?.winner !== undefined && finals.winner !== tid ? 'lose' : ''}`}>
      {tid !== undefined ? <TeamLogo tid={tid} size={46} /> : <div style={{ width: 46, height: 46, borderRadius: '50%', border: '1.5px dashed var(--line-2)' }} />}
      <div className="bold ellipsis" style={{ maxWidth: '100%' }}>
        {tid !== undefined ? league.teams[tid].name : `${conf} champion`}
      </div>
      {tid !== undefined && <div className="tiny dim">{conf}</div>}
      {finals && <div className="score">{wins}</div>}
    </div>
  );
  const eTid = finals ? (league.teams[finals.high].conf === 'E' ? finals.high : finals.low) : undefined;
  const wTid = finals ? (eTid === finals.high ? finals.low : finals.high) : undefined;
  const winsOf = (tid: number | undefined) => (finals && tid !== undefined ? (tid === finals.high ? finals.highWins : finals.lowWins) : 0);
  return (
    <Card
      title={
        <h3>
          <Trophy size={14} style={{ verticalAlign: -2 }} /> NBA Finals
        </h3>
      }
      right={
        finals ? (
          <span className="small dim">
            {finals.winner !== undefined ? 'Final' : finals.highWins + finals.lowWins ? `Game ${finals.highWins + finals.lowWins + 1} next` : 'Best of 7'}
          </span>
        ) : (
          <span className="small dim">Best of 7</span>
        )
      }
      onClick={finals ? () => onOpen(finals) : undefined}
    >
      <div className="bk-finals">
        {side(eTid, winsOf(eTid), 'East')}
        <div className="display dim" style={{ fontSize: 18 }}>
          vs
        </div>
        {side(wTid, winsOf(wTid), 'West')}
      </div>
    </Card>
  );
}

function piGameFor(league: League, id: string): GameResult | undefined {
  return league.games.find((g) => g.season === league.season && g.type === 'playin' && g.seriesId === id);
}

function PlayIn({ league, conf, projected }: { league: League; conf: 'E' | 'W'; projected: boolean }) {
  const META: Record<string, [string, string]> = {
    '78': ['7 vs 8', 'Winner is the 7 seed'],
    '910': ['9 vs 10', 'Loser is eliminated'],
    '8': ['For the 8 seed', 'Loser 7/8 vs winner 9/10'],
  };
  let games: { id: string; title: string; sub: string; home?: number; away?: number; pi?: PlayInGame }[];
  if (projected) {
    const st = confStandings(league, conf);
    const mk = (k: string, home?: number, away?: number) => ({ id: `${conf}-${k}`, title: META[k][0], sub: META[k][1], home, away });
    games = [mk('78', st[6]?.tid, st[7]?.tid), mk('910', st[8]?.tid, st[9]?.tid), mk('8')];
  } else {
    const byId = new Map(league.playIn.filter((p) => p.conf === conf).map((p) => [p.id, p]));
    const mk = (k: string) => {
      const id = `${conf}-${k}`;
      const pi = byId.get(id);
      return { id, title: META[k][0], sub: META[k][1], home: pi?.home, away: pi?.away, pi };
    };
    games = [mk('78'), mk('910'), mk('8')];
  }
  const seedOf = new Map(confStandings(league, conf).map((r) => [r.tid, r.confRank]));
  return (
    <Card title={`${confName(conf)} play-in`} right={projected ? <span className="tag info">Projected</span> : undefined}>
      <div className="lg-pi">
        {games.map((g) => {
          const res = g.pi ? piGameFor(league, g.id) : undefined;
          const winner = g.pi?.winner;
          const line = (tid: number | undefined, pts: number | undefined, tbd: string) => (
            <div className={`bk-t ${winner === undefined ? '' : winner === tid ? 'win' : 'lose'}`}>
              <span className="sd">{tid !== undefined ? (seedOf.get(tid) ?? '') : ''}</span>
              {tid !== undefined ? <TeamLogo tid={tid} size={18} /> : <span />}
              {tid !== undefined ? (
                <span className="ellipsis">
                  {league.teams[tid].abbrev}{' '}
                  <span className="tiny dim">
                    {curTeamSeason(league, tid).won}-{curTeamSeason(league, tid).lost}
                  </span>
                </span>
              ) : (
                <span className="tb">{tbd}</span>
              )}
              <span className="w" style={{ fontSize: 14 }}>
                {pts ?? ''}
              </span>
            </div>
          );
          const card = (
            <div className={`bk-s pi ${g.home === league.userTid || g.away === league.userTid ? 'me' : ''}`}>
              {line(g.home, res?.home.pts, 'TBD')}
              {line(g.away, res?.away.pts, 'TBD')}
            </div>
          );
          return (
            <div key={g.id} className="lg-pi-game">
              <span className="lbl">
                <b>{g.title}</b>
                <span>{g.sub}</span>
              </span>
              {res ? (
                <Link to={`/game/${res.gid}`} style={{ display: 'block' }}>
                  {card}
                </Link>
              ) : (
                card
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SeriesSheet({ league, series, onClose }: { league: League; series: PlayoffSeries | null; onClose: () => void }) {
  const games = useMemo(() => {
    if (!series) return [];
    return league.games.filter((g) => g.season === league.season && g.type === 'playoffs' && g.seriesId === series.id).sort((a, b) => a.day - b.day || a.gid - b.gid);
  }, [league, series]);
  const leaders = useMemo(() => {
    const m = new Map<number, { pid: number; name: string; tid: number; pts: number; reb: number; ast: number; gp: number }>();
    for (const g of games) {
      for (const side of [g.home, g.away]) {
        for (const bl of side.players) {
          if (bl.min <= 0) continue;
          const e = m.get(bl.pid) ?? { pid: bl.pid, name: bl.name, tid: side.tid, pts: 0, reb: 0, ast: 0, gp: 0 };
          e.pts += bl.pts;
          e.reb += bl.orb + bl.drb;
          e.ast += bl.ast;
          e.gp++;
          m.set(bl.pid, e);
        }
      }
    }
    return [...m.values()].sort((a, b) => b.pts / b.gp - a.pts / a.gp).slice(0, 4);
  }, [games]);
  if (!series) return null;
  const hi = league.teams[series.high];
  const lo = league.teams[series.low];
  const lead =
    series.highWins === series.lowWins
      ? `Series tied ${series.highWins}-${series.lowWins}`
      : `${(series.highWins > series.lowWins ? hi : lo).abbrev} ${series.winner !== undefined ? 'won' : 'leads'} ${Math.max(series.highWins, series.lowWins)}-${Math.min(series.highWins, series.lowWins)}`;
  const upcoming = league.schedule.find((g) => g.seriesId === series.id && !g.played);
  return (
    <Sheet open={!!series} onClose={onClose} title={seriesLabel(series)}>
      <div className="col" style={{ gap: 14 }}>
        <div className="bk-finals">
          {[series.high, series.low].map((tid, i) => (
            <div key={tid} className={`side ${series.winner !== undefined && series.winner !== tid ? 'lose' : ''}`} style={{ order: i === 0 ? 0 : 2 }}>
              <TeamLogo tid={tid} size={44} />
              <div className="bold">{league.teams[tid].name}</div>
              <div className="tiny dim">{i === 0 ? series.highSeed : series.lowSeed} seed</div>
            </div>
          ))}
          <div className="col" style={{ alignItems: 'center', gap: 2, order: 1 }}>
            <div className="display bold num" style={{ fontSize: 34, lineHeight: 1 }}>
              {series.highWins}-{series.lowWins}
            </div>
          </div>
        </div>
        <div className="center small dim2">{lead}</div>
        <Card className="flush lg-flat">
          {games.length === 0 && !upcoming && <div className="empty small">No games yet.</div>}
          {games.map((g, i) => {
            const homeWon = g.home.pts > g.away.pts;
            return (
              <Link key={g.gid} to={`/game/${g.gid}`} className="lg-g-row" style={{ gridTemplateColumns: '34px minmax(0,1fr) auto 16px' }} onClick={onClose}>
                <span className="small dim bold">G{i + 1}</span>
                <span className="small">
                  <span className={homeWon ? 'dim' : 'bold'}>
                    {league.teams[g.away.tid].abbrev} {g.away.pts}
                  </span>
                  <span className="dim"> @ </span>
                  <span className={homeWon ? 'bold' : 'dim'}>
                    {league.teams[g.home.tid].abbrev} {g.home.pts}
                  </span>
                  {g.ot ? <span className="dim"> · OT</span> : null}
                </span>
                <span className="tiny dim">{fmtDate(league.season, g.day)}</span>
                <ChevronRight size={15} className="dim" />
              </Link>
            );
          })}
          {upcoming && (
            <div className="lg-g-row" style={{ gridTemplateColumns: '34px minmax(0,1fr) auto' }}>
              <span className="small dim bold">G{games.length + 1}</span>
              <span className="small">
                {league.teams[upcoming.away].abbrev} @ {league.teams[upcoming.home].abbrev}
              </span>
              <span className="tiny" style={{ color: 'var(--accent-text)', fontWeight: 700 }}>
                {upcoming.day === league.day ? 'Today' : fmtDate(league.season, upcoming.day)}
              </span>
            </div>
          )}
        </Card>
        {leaders.length > 0 && (
          <div className="col" style={{ gap: 6 }}>
            <div className="lg-section-label">Series leaders</div>
            {leaders.map((l) => (
              <Link key={l.pid} to={`/player/${l.pid}`} className="row" onClick={onClose} style={{ gap: 8 }}>
                <TeamLogo tid={l.tid} size={20} />
                <span className="grow ellipsis bold small">{l.name}</span>
                <span className="small num dim2">
                  {(l.pts / l.gp).toFixed(1)} pts · {(l.reb / l.gp).toFixed(1)} reb · {(l.ast / l.gp).toFixed(1)} ast
                </span>
              </Link>
            ))}
          </div>
        )}
        <button className="btn block" onClick={onClose}>
          Close
        </button>
      </div>
    </Sheet>
  );
}
