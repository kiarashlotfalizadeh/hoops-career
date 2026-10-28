import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { GameResult, League, PlayInGame, PlayoffSeries } from '../../core/types';
import { confStandings } from '../../core/league/standings';
import { curTeamSeason, fmtDate, playerName } from '../../core/league/helpers';
import { seriesLabel } from '../../core/league/playoffs';
import { seasonLabel } from '../../core/constants';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Section, Sheet, Fit } from '../components/ui';
import { periodLabel } from '../stats';
import { ViewChips } from './Views';
import { Poster, TitleSlab, confName, confOrder, ordinal, roundName, useQueryParam } from './shared';

/** A bracket slot: a real series, a projected matchup, or empty. */
export interface Slot {
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

/** A conference's bracket from its series (the season's, or a past one's: see History's season page), by round. */
export function seriesSlots(list: PlayoffSeries[], conf: 'E' | 'W'): Slot[][] {
  const byId = new Map(list.map((s) => [s.id, s]));
  return [[0, 1, 2, 3].map((i) => fromSeries(byId.get(`${conf}1-${i}`))), [0, 1].map((i) => fromSeries(byId.get(`${conf}2-${i}`))), [fromSeries(byId.get(`${conf}3-0`))]];
}

function confSlots(league: League, conf: 'E' | 'W'): Slot[][] {
  if (league.playoffs.some((s) => s.conf === conf)) return seriesSlots(league.playoffs, conf);
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
  const playInDone = phase === 'live' || phase === 'done';
  const lastAw = [...league.awards].filter((a) => a.champion !== undefined).sort((a, b) => b.season - a.season)[0];

  if (phase === 'none') {
    return (
      <>
        {lastAw?.champion !== undefined && <ChampionSlab league={league} season={lastAw.season} tid={lastAw.champion} runnerUp={lastAw.runnerUp} fmvp={lastAw.finalsMvp} />}
        <div className="card empty">No bracket yet: it&apos;s projected here once games are played. Seeds 1-6 go straight in, 7-10 play in.</div>
      </>
    );
  }

  // (the poster says a projection is one)
  const status = phase === 'projected' || phase === 'playin' ? '' : phase === 'live' ? 'In progress' : 'Complete';

  return (
    <>
      {champ !== undefined && (
        <ChampionSlab
          league={league}
          season={league.season}
          tid={champ}
          runnerUp={finals ? (finals.high === champ ? finals.low : finals.high) : undefined}
          result={finals ? `${Math.max(finals.highWins, finals.lowWins)}-${Math.min(finals.highWins, finals.lowWins)}` : undefined}
          fmvp={league.awards.find((a) => a.season === league.season)?.finalsMvp}
        />
      )}
      <div className="bk-only-narrow">
        <ViewChips
          label="Conference"
          value={conf}
          onChange={setConf}
          options={[
            { id: 'E', label: 'East' },
            { id: 'W', label: 'West' },
          ]}
        />
      </div>
      {champ === undefined && <PlayoffsPoster league={league} phase={phase} />}
      <div className="bk-panel-wrap">
        {confOrder(conf).map((c) => (
          <div key={c} className={`bk-conf bk-${c} ${c !== conf ? 'bk-hide-narrow' : ''}`}>
            {/* (where the bracket stands, on its head: "If the season ended today") */}
            <Section title={`${confName(c)}ern Conference`} right={phase !== 'done' && status ? <span className="lg-sec-meta">{status}</span> : undefined}>
              <div className="card bk-card">
                <Bracket league={league} slots={slots[c]} onOpen={setOpen} />
              </div>
            </Section>
            {!playInDone && <PlayIn league={league} conf={c} projected={phase === 'projected'} />}
          </div>
        ))}
      </div>
      <FinalsCard league={league} finals={finals} onOpen={setOpen} />
      {/* once the bracket is set, the play-in is its prologue: under the Finals */}
      {playInDone && (
        <div className="bk-panel-wrap">
          {confOrder(conf).map((c) => (
            <div key={c} className={`bk-conf bk-${c} ${c !== conf ? 'bk-hide-narrow' : ''}`}>
              <PlayIn league={league} conf={c} projected={false} />
            </div>
          ))}
        </div>
      )}
      <SeriesSheet league={league} series={open} onClose={() => setOpen(null)} />
    </>
  );
}

/**
 * The bracket's poster while there's no champion: your series (or the deepest one still going once
 * you're out) with its score as the figure, else where you'd stand if the season ended today.
 */
function PlayoffsPoster({ league, phase }: { league: League; phase: Phase }) {
  const me = league.userTid;
  const name = (tid: number) => league.teams[tid].name;
  if (phase === 'live') {
    const mine = league.playoffs.filter((s) => s.high === me || s.low === me).sort((a, b) => b.round - a.round)[0];
    const out = mine && mine.winner !== undefined && mine.winner !== me;
    const open = league.playoffs.filter((s) => s.winner === undefined).sort((a, b) => b.round - a.round || b.highWins + b.lowWins - (a.highWins + a.lowWins))[0];
    const s = mine && !out ? mine : (open ?? mine);
    if (!s) return null;
    const [hw, lw] = [s.highWins, s.lowWins];
    const lead = hw >= lw ? s.high : s.low;
    const trail = lead === s.high ? s.low : s.high;
    const head =
      s.winner !== undefined
        ? `${name(s.winner)} beat the ${name(s.winner === s.high ? s.low : s.high)}`
        : hw === lw
          ? hw === 0
            ? `${name(s.high)} vs ${name(s.low)}`
            : `${name(s.high)} and ${name(s.low)} tied`
          : `${name(lead)} lead the ${name(trail)}`;
    const dek = out ? `${league.teams[me].region} ${name(me)}: out in the ${roundName(mine.round)}` : s.winner === undefined && hw + lw === 0 ? 'Game 1 next' : undefined;
    return <Poster over={`${seasonLabel(league.season)} playoffs`} head={head} dek={dek} fig={{ v: `${Math.max(hw, lw)}-${Math.min(hw, lw)}`, k: seriesLabel(s) }} />;
  }
  const conf = league.teams[me].conf;
  if (phase === 'playin') {
    const seed = curTeamSeason(league, me).seed;
    const dek = seed && seed <= 6 ? `${name(me)} wait as the ${ordinal(seed)} seed` : undefined;
    return <Poster over={`${confName(conf)} play-in`} head="Seeds 7 and 8 on the line" dek={dek} />;
  }
  // projected: where you'd open if it ended today
  const st = confStandings(league, conf);
  const i = st.findIndex((r) => r.tid === me);
  const seed = i + 1;
  const pair = R1_PAIRS.find(([h, l]) => h === seed || l === seed);
  const opp = pair && seed <= 6 ? st[(pair[0] === seed ? pair[1] : pair[0]) - 1] : undefined;
  const head = opp ? `${name(me)} would open with the ${name(opp.tid)}` : seed <= 10 ? `${name(me)} would be in the play-in` : `${name(me)} would miss the playoffs`;
  return <Poster over="If the season ended today" head={head} fig={{ v: ordinal(seed), k: `seed in the ${confName(conf)}` }} />;
}

function ChampionSlab({ league, season, tid, runnerUp, result, fmvp }: { league: League; season: number; tid: number; runnerUp?: number; result?: string; fmvp?: number }) {
  const p = fmvp !== undefined ? league.players[fmvp] : undefined;
  const beat = runnerUp !== undefined ? `def. ${league.teams[runnerUp].name}` : undefined;
  return (
    <TitleSlab league={league} tid={tid} over={`${seasonLabel(season)} champions`} fig={result} figLabel={result ? `${beat ?? 'Won'} in the Finals` : undefined}>
      {!result && beat}
      {p && (
        <>
          {!result && beat ? ' · ' : ''}
          <span className="nowrap">
            Finals MVP{' '}
            <Link to={`/player/${p.pid}`} className="lg-slab-link">
              {playerName(p)}
            </Link>
          </span>
        </>
      )}
    </TitleSlab>
  );
}

/** A conference's bracket; its series open their sheet (`onOpen`) when the season still has their games. */
export function Bracket({ league, slots, onOpen }: { league: League; slots: Slot[][]; onOpen?: (s: PlayoffSeries) => void }) {
  const [r1, r2, r3] = slots;
  const card = (s: Slot, key: string) => <SeriesCard key={key} league={league} s={s} onOpen={onOpen} />;
  return (
    <>
      <div className="bk-head">
        {[1, 2, 3].map((r) => (
          <span key={r}>{roundName(r, true)}</span>
        ))}
      </div>
      <div className="bk-grid">
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

function SeriesCard({ league, s, onOpen }: { league: League; s: Slot; onOpen?: (s: PlayoffSeries) => void }) {
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
            <TeamLogo tid={tid} size={18} decorative />
            <span className="ellipsis">{league.teams[tid].abbrev}</span>
          </>
        ) : (
          // no logo yet: "Play-in" gets the logo's room too, so it fits a phone-width bracket
          <span className="tb ellipsis bk-wide">{tbd ?? 'TBD'}</span>
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
  if (s.series && onOpen) {
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

export function FinalsCard({ league, finals, onOpen }: { league: League; finals?: PlayoffSeries; onOpen?: (s: PlayoffSeries) => void }) {
  const side = (tid: number | undefined, wins: number, conf: string) => (
    <div className={`side ${finals?.winner !== undefined && finals.winner !== tid ? 'lose' : ''}`}>
      {tid !== undefined ? <TeamLogo tid={tid} size={46} decorative /> : <span className="bk-ghost" />}
      {/* (two lines at most: "East champion"; "Timberwolves" as much smaller as it needs to fit whole) */}
      <Fit className="bk-fname" min={11}>
        {tid !== undefined ? league.teams[tid].name : `${conf} champion`}
      </Fit>
      {tid !== undefined && <div className="bk-fconf">{conf}</div>}
      {finals && <div className="score">{wins}</div>}
    </div>
  );
  const eTid = finals ? (league.teams[finals.high].conf === 'E' ? finals.high : finals.low) : undefined;
  const wTid = finals ? (eTid === finals.high ? finals.low : finals.high) : undefined;
  const winsOf = (tid: number | undefined) => (finals && tid !== undefined ? (tid === finals.high ? finals.highWins : finals.lowWins) : 0);
  const body = (
    <div className="bk-finals">
      {side(eTid, winsOf(eTid), 'East')}
      <div className="bk-vs">vs</div>
      {side(wTid, winsOf(wTid), 'West')}
    </div>
  );
  return (
    <Section
      title="NBA Finals"
      right={
        <span className="lg-sec-meta">
          {finals ? (finals.winner !== undefined ? 'Final' : finals.highWins + finals.lowWins ? `Game ${finals.highWins + finals.lowWins + 1} next` : 'Best of 7') : 'Best of 7'}
        </span>
      }
    >
      {finals && onOpen ? (
        <button className="card bk-fcard" onClick={() => onOpen(finals)} aria-label={`${seriesLabel(finals)}: series details`}>
          {body}
        </button>
      ) : (
        <div className="card bk-fcard">{body}</div>
      )}
    </Section>
  );
}

function piGameFor(league: League, id: string): GameResult | undefined {
  return league.games.find((g) => g.season === league.season && g.type === 'playin' && g.seriesId === id);
}

function PlayIn({ league, conf, projected }: { league: League; conf: 'E' | 'W'; projected: boolean }) {
  const META: Record<string, [string, string]> = {
    '78': ['7 vs 8', 'Winner: 7 seed'],
    '910': ['9 vs 10', 'Loser is out'],
    '8': ['8 seed game', 'Loser 7/8 vs winner 9/10'],
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
    <Section title={`${confName(conf)} play-in`}>
      <div className="card flush lg-pi">
        {games.map((g) => {
          const res = g.pi ? piGameFor(league, g.id) : undefined;
          const winner = g.pi?.winner;
          const line = (tid: number | undefined, pts: number | undefined, tbd: string) => (
            <div className={`bk-t ${winner === undefined ? '' : winner === tid ? 'win' : 'lose'}`}>
              <span className="sd">{tid !== undefined ? (seedOf.get(tid) ?? '') : ''}</span>
              {tid !== undefined ? <TeamLogo tid={tid} size={18} decorative /> : <span />}
              {tid !== undefined ? (
                <span className="ellipsis">
                  {league.teams[tid].abbrev}{' '}
                  <span className="bk-rec">
                    {curTeamSeason(league, tid).won}-{curTeamSeason(league, tid).lost}
                  </span>
                </span>
              ) : (
                <span className="tb">{tbd}</span>
              )}
              <span className="w">{pts ?? ''}</span>
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
                <Link to={`/game/${res.gid}`} className="bk-link">
                  {card}
                </Link>
              ) : (
                card
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function SeriesSheet({ league, series, onClose }: { league: League; series: PlayoffSeries | null; onClose: () => void }) {
  // games keep arriving while the sheet is open during a sim
  const games = useLeagueMemo(() => {
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
  // the score is the big figure above it: the line says only who has it
  const lead =
    series.highWins === series.lowWins
      ? series.highWins
        ? 'Series tied'
        : 'Not started'
      : `${(series.highWins > series.lowWins ? hi : lo).abbrev} ${series.winner !== undefined ? 'won the series' : 'leads'}`;
  const upcoming = league.schedule.find((g) => g.seriesId === series.id && !g.played);
  return (
    <Sheet open={!!series} onClose={onClose} title={seriesLabel(series)}>
      <div className="col lg-sheet">
        <div className="bk-finals">
          {[series.high, series.low].map((tid, i) => (
            <div key={tid} className={`side ${series.winner !== undefined && series.winner !== tid ? 'lose' : ''} ${i === 0 ? '' : 'second'}`}>
              <TeamLogo tid={tid} size={44} decorative />
              <div className="bk-fname">{league.teams[tid].name}</div>
              <div className="bk-fconf">{ordinal(i === 0 ? series.highSeed : series.lowSeed)} seed</div>
            </div>
          ))}
          <div className="bk-sscore">
            <span className="num">
              {series.highWins}-{series.lowWins}
            </span>
            <span className="bk-fconf">{lead}</span>
          </div>
        </div>
        <div className="card flush">
          {games.length === 0 && !upcoming && <div className="empty small">No games yet.</div>}
          {games.map((g, i) => {
            const homeWon = g.home.pts > g.away.pts;
            return (
              <Link key={g.gid} to={`/game/${g.gid}`} className="lg-sr-row" onClick={onClose}>
                <span className="g">G{i + 1}</span>
                <span className="small">
                  <span className={homeWon ? 'dim' : 'bold'}>
                    {league.teams[g.away.tid].abbrev} {g.away.pts}
                  </span>
                  <span className="dim"> @ </span>
                  <span className={homeWon ? 'bold' : 'dim'}>
                    {league.teams[g.home.tid].abbrev} {g.home.pts}
                  </span>
                  {g.ot ? <span className="dim"> · {periodLabel(4 + g.ot)}</span> : null}
                </span>
                <span className="tiny dim">{fmtDate(league.season, g.day)}</span>
                <ChevronRight size={15} className="dim" />
              </Link>
            );
          })}
          {upcoming && (
            <div className="lg-sr-row">
              <span className="g">G{games.length + 1}</span>
              <span className="small">
                {league.teams[upcoming.away].abbrev} @ {league.teams[upcoming.home].abbrev}
              </span>
              <span className="tiny lg-next">{upcoming.day === league.day ? 'Today' : fmtDate(league.season, upcoming.day)}</span>
              <span />
            </div>
          )}
        </div>
        {leaders.length > 0 && (
          <Section title="Series leaders" right={<span className="lg-sec-meta">Per game</span>}>
            <div className="card flush">
              <div className="list-divider lg-sr-lead lg-sr-head" aria-hidden="true">
                <span />
                <span className="grow" />
                <span>PTS</span>
                <span>REB</span>
                <span>AST</span>
              </div>
              {leaders.map((l) => (
                <Link key={l.pid} to={`/player/${l.pid}`} className="lg-sr-lead" onClick={onClose}>
                  <TeamLogo tid={l.tid} size={20} />
                  <span className="grow ellipsis bold">{l.name}</span>
                  {(['pts', 'reb', 'ast'] as const).map((k) => (
                    <span key={k} className="num dim2">
                      {(l[k] / l.gp).toFixed(1)}
                      <span className="sr-only"> {k === 'pts' ? 'points' : k === 'reb' ? 'rebounds' : 'assists'}</span>
                    </span>
                  ))}
                </Link>
              ))}
            </div>
          </Section>
        )}
        <button className="btn block" onClick={onClose}>
          Close
        </button>
      </div>
    </Sheet>
  );
}
