// Scouting numbers as a matchup page's Scout and Tactics → Report show them: league ranks, play
// types against the league, key players with on/off, the user's meetings with the team and what its
// coach has planned for the next one. Colours always rate the team shown: green where it is better
// than the league, red where it is worse, whoever's team it is.
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League } from '../../core/types';
import type { PlayTypeRow, Ranked, ScoutData, ScoutPlayer } from '../../core/analysis/scouting';
import type { OppPlanItem } from '../../core/ai/opponentPlan';
import { FINISH_LABEL } from '../../core/sim/log';
import { IMPACT_TEXT, impactSentence, teamRef } from '../../core/analysis/gameReport';
import { fmtDate } from '../../core/league/helpers';
import { seasonLabel } from '../../core/constants';
import { StatTable, type Col } from './ui';
import { f1, ordinal, p0, p1, signed } from '../stats';
import './scouting.css';

/** A rank's color: the top third reads good, the bottom third bad; style numbers (pace, shot mix) stay neutral. */
function rankTone(r: Ranked, teams: number, style: boolean) {
  if (style || !isFinite(r.v)) return 'var(--text-dim)';
  return r.rank <= teams / 3 ? 'var(--good)' : r.rank > (2 * teams) / 3 ? 'var(--bad)' : 'var(--text-dim)';
}

interface Cell {
  k: string;
  r: Ranked;
  fmt: (v: number) => string;
  style?: boolean;
  help: string;
}

/** Where the numbers come from, for a heading: "12 games", "Last season, 82 games". */
export const scoutSource = (d: ScoutData) => `${d.lastSeason ? `${seasonLabel(d.season)} season, ` : ''}${d.gp} game${d.gp === 1 ? '' : 's'}`;

/**
 * League ranks: the ratings, the four factors at both ends and the shot mix. `part`: the ratings
 * alone ('main'), or the rest ('rest'), for a summary with the detail a tap down.
 */
export function RankStrip({ d, part }: { d: ScoutData; part?: 'main' | 'rest' }) {
  const n = d.teams;
  const all: Cell[] = [
    { k: 'Pace', r: d.pace, fmt: f1, style: true, help: 'Possessions a game (1st = fastest)' },
    { k: 'ORtg', r: d.ortg, fmt: f1, help: 'Offensive rating: points per 100 possessions' },
    { k: 'DRtg', r: d.drtg, fmt: f1, help: 'Defensive rating: points allowed per 100 possessions (1st = fewest)' },
    { k: 'Net', r: d.net, fmt: (v) => signed(v), help: 'Net rating: ORtg minus DRtg' },
  ];
  all.push(
    { k: 'eFG%', r: d.off.efg, fmt: p1, help: 'Effective field-goal percentage' },
    { k: 'TOV%', r: d.off.tov, fmt: p1, help: 'Turnovers per possession (1st = fewest)' },
    { k: 'ORB%', r: d.off.orb, fmt: p1, help: 'Share of their misses they rebound' },
    { k: 'FTR', r: d.off.ftr, fmt: (v) => v.toFixed(2), help: 'Free-throw attempts per shot' },
    { k: 'Opp eFG%', r: d.def.efg, fmt: p1, help: "Opponents' effective field-goal percentage (1st = lowest)" },
    { k: 'Opp TOV%', r: d.def.tov, fmt: p1, help: 'Turnovers they force per opponent possession' },
    { k: 'Opp ORB%', r: d.def.orb, fmt: p1, help: 'Share of opponents’ misses they let opponents rebound (1st = fewest)' },
    { k: 'Opp FTR', r: d.def.ftr, fmt: (v) => v.toFixed(2), help: 'Free throws they allow per opponent shot (1st = fewest)' },
    { k: '3PA rate', r: d.threeRate, fmt: p0, style: true, help: 'Share of their shots from three (1st = most)' },
    { k: 'Rim rate', r: d.rimRate, fmt: p0, style: true, help: 'Share of their shots at the rim (1st = most)' },
  );
  const cells = part === 'main' ? all.slice(0, 4) : part === 'rest' ? all.slice(4) : all;
  return (
    <div className="scout-ranks" role="list" aria-label="League ranks">
      {cells.map((c) => (
        <div key={c.k} role="listitem" title={c.help} aria-label={`${c.k}: ${isFinite(c.r.v) ? c.fmt(c.r.v) : 'no games'}, ${ordinal(c.r.rank)} of ${n}. ${c.help}.`}>
          <span className="k">{c.k}</span>
          <span className="v num">{isFinite(c.r.v) ? c.fmt(c.r.v) : '—'}</span>
          <span className="r num" style={{ color: rankTone(c.r, n, !!c.style) }}>
            {ordinal(c.r.rank)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Beyond this many standard errors from the league a play type's PPP is coloured: more than chance. */
const PT_Z = 1.5;

/**
 * Play types at one end against the league's points per possession: how often (and where that ranks
 * in the league), the points per possession and how far from the league's that is. Four columns, so
 * a phone shows them all.
 */
export function PlayTypeTable({ rows, defense }: { rows: PlayTypeRow[]; defense: boolean }) {
  const tone = (r: PlayTypeRow) => {
    // good for the team shown: scoring above the league on offense, allowing below it on defense
    const z = defense ? -r.z : r.z;
    return Math.abs(z) < PT_Z ? undefined : z > 0 ? 'var(--good)' : 'var(--bad)';
  };
  const cols: Col<PlayTypeRow>[] = [
    { key: 'type', label: 'Play type', get: (r) => FINISH_LABEL[r.key], left: true, sticky: true, width: 112, help: 'How the possession finished' },
    {
      key: 'share',
      label: defense ? 'Faced' : 'Freq',
      get: (r) => r.share,
      // the share, and where it ranks in the league (1st = most)
      fmt: (v, r) => (
        <>
          {p0(+v)} <span className="dim">{ordinal(r.shareRank)}</span>
        </>
      ),
      help: defense ? 'Share of opponent possessions, and its league rank (1st = faces it most)' : 'Share of their possessions, and its league rank (1st = runs it most)',
    },
    { key: 'ppp', label: 'PPP', get: (r) => r.ppp, fmt: (v, r) => <span style={{ color: tone(r) }}>{(+v).toFixed(2)}</span>, help: 'Points per possession' },
    {
      key: 'diff',
      label: 'vs lg',
      get: (r) => r.ppp - r.base,
      fmt: (v, r) => <span title={`League ${r.base.toFixed(2)}`}>{signed(+v, 2)}</span>,
      help: 'Points per possession against the league’s',
    },
  ];
  return (
    <>
      <StatTable rows={rows.filter((r) => r.key !== 'misc')} cols={cols} rowKey={(r) => r.key} initialSort="share" />
      <div className="tiny dim">
        {defense ? 'Faced' : 'Freq'}: share of {defense ? 'opponent' : 'their'} possessions, then its rank in the league. PPP in <span className="good">green</span>:{' '}
        {defense ? 'allows less' : 'scores more'} than the league, in <span className="bad">red</span>: {defense ? 'more' : 'less'}, where the gap is more than chance.
      </div>
    </>
  );
}

/** Key players: minutes, scoring and efficiency, and how the team does with them on and off the floor. */
export function KeyPlayers({ d }: { d: ScoutData }) {
  const onOff = (p: ScoutPlayer) => (p.on !== undefined && p.off !== undefined ? p.on - p.off : NaN);
  const cols: Col<ScoutPlayer>[] = [
    { key: 'name', label: 'Player', get: (p) => p.name, fmt: (_, p) => <Link to={`/player/${p.pid}`}>{p.name}</Link>, left: true, sticky: true, width: 130 },
    { key: 'min', label: 'MIN', get: (p) => p.min, fmt: (v) => f1(+v), help: 'Minutes per game' },
    { key: 'pts', label: 'PTS', get: (p) => p.pts, fmt: (v) => f1(+v), help: 'Points per game' },
    { key: 'ts', label: 'TS%', get: (p) => p.ts, fmt: (v) => p1(+v), help: 'True shooting percentage' },
  ];
  cols.push(
    { key: 'usg', label: 'USG', get: (p) => p.usg, fmt: (v) => p1(+v), help: 'Share of team possessions used on the floor' },
    { key: 'ft', label: 'FT%', get: (p) => p.ft, fmt: (v, p) => (p.fta > 0 ? p1(+v) : '—'), help: 'Free-throw percentage' },
  );
  cols.push({
    key: 'onoff',
    label: 'On/off',
    get: onOff,
    fmt: (v) => <span style={{ color: !isFinite(+v) ? undefined : +v >= 3 ? 'var(--good)' : +v <= -3 ? 'var(--bad)' : undefined }}>{isFinite(+v) ? signed(+v) : '—'}</span>,
    help: 'Net rating per 100 possessions with him on the floor minus with him off (this team only)',
  });
  cols.push({ key: 'on', label: 'On', get: (p) => p.on ?? NaN, fmt: (v) => (isFinite(+v) ? signed(+v) : '—'), help: 'Net rating with him on the floor' });
  return <StatTable rows={d.players} cols={cols} rowKey={(p) => p.pid} />;
}

/** The user's meetings with the team (this season and last), and the tactical effects that decided them (the season's record is on the matchup's slab). */
export function HeadToHead({ league, d }: { league: League; d: ScoutData }) {
  const opp = league.teams[d.tid];
  const me = league.teams[league.userTid];
  if (!d.h2h.games.length) return <div className="small dim">No meetings with the {opp.name} this season or last.</div>;
  const effects = d.h2h.effects.filter((e) => e.perGame >= 0.8).slice(0, 4);
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="card flush list">
        {[...d.h2h.games].reverse().map((g) => (
          <Link key={g.gid} to={`/game/${g.gid}`} className="scout-h2h">
            <span className="grow dim2">
              {fmtDate(g.season, g.day, { month: 'short', day: 'numeric', year: g.season === league.season ? undefined : 'numeric' })} ·{' '}
              {/* the Cup final is on a neutral floor: nobody's home */}
              {g.cupFinal ? `vs ${opp.abbrev} · Cup final` : `${g.home ? 'vs' : '@'} ${opp.abbrev}`}
            </span>
            <span className={`bold num ${g.won ? 'good' : 'bad'}`}>
              {g.won ? 'W' : 'L'} {g.us}-{g.them}
            </span>
            <ChevronRight size={16} className="dim" aria-hidden="true" />
          </Link>
        ))}
      </div>
      {effects.length > 0 && (
        <div className="col" style={{ gap: 6 }}>
          <div className="over">What decided them</div>
          {/* the figures in a column of their own, the sentences beside them */}
          <div className="scout-imps">
            {effects.map((e) => (
              <Fragment key={`${e.key}|${e.forUser}`}>
                <span className={`num ${e.forUser ? 'good' : 'bad'}`}>
                  {e.forUser ? '+' : '−'}
                  {e.perGame.toFixed(1)}
                </span>
                <span>{IMPACT_TEXT[e.key] && impactSentence(e.key, e.forUser ? `the ${me.name}` : teamRef(opp), e.forUser ? teamRef(opp) : `the ${me.name}`)}</span>
              </Fragment>
            ))}
          </div>
          <div className="tiny dim">Points a game, from your side.</div>
        </div>
      )}
    </div>
  );
}

/** "tonight", "tomorrow", "on Nov 3". */
const gameDayWord = (league: League, day: number) =>
  day <= league.day ? 'tonight' : day === league.day + 1 ? 'tomorrow' : `on ${fmtDate(league.season, day, { weekday: 'short', month: 'short', day: 'numeric' })}`;

/**
 * What the other coach has planned for his next game against you: "Expect from them tonight: hedges
 * ball screens, denies Brunson the ball", with the numbers of yours each answers. Nothing when he hasn't game-planned for it.
 */
export function OppPlanNote({ league, items, day }: { league: League; items: readonly OppPlanItem[] | null | undefined; day: number }) {
  if (!items?.length) return null;
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="small">
        <b>Expect from them {gameDayWord(league, day)}:</b> {items.map((it) => it.text).join(', ')}.
      </div>
      {items.map((it) => (
        <div key={it.id} className="tiny dim">
          {it.why}
        </div>
      ))}
    </div>
  );
}
