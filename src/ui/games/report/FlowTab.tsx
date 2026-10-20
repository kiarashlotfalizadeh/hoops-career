// The game report's Flow: win probability over the game with its three biggest swings named, the
// score margin, and the play-by-play one period at a time.
import { useMemo, useState } from 'react';
import type { GameResult, League, PbpEntry } from '../../../core/types';
import { GAME } from '../../../core/constants';
import { biggestSwings, marginWords, playAt, swingWords, wpSeries, wpText } from '../../../core/analysis/winProb';
import { Chips, Help, More, Section } from '../../components/ui';
import { FlowChart, WinProbChart } from '../../components/charts';
import { Term } from '../../components/Glossary';
import { gameTime } from '../../../core/format';
import { pbpOpacity, periodLabel } from '../../stats';

/**
 * `side` is whose view the charts take (your team in your games, else the home team's); `kits` the
 * home and away colours.
 */
export function FlowTab({ g, league, side, kits }: { g: GameResult; league: League; side: 0 | 1; kits: [string, string] }) {
  const [home, away] = [league.teams[g.home.tid], league.teams[g.away.tid]];
  const pbp = g.pbp ?? [];
  return (
    <>
      {g.flow && <WinProbCard g={g} league={league} side={side} kits={kits} />}
      {g.flow && (
        <Section
          title="Score margin"
          right={<span className="tiny dim">{side === 0 ? `${home.abbrev} above · ${away.abbrev} below` : `${away.abbrev} above · ${home.abbrev} below`}</span>}
        >
          <div className="card">
            <FlowChart
              flow={side === 1 ? g.flow.map((m) => -m) : g.flow}
              colorA={kits[side]}
              colorB={kits[1 - side]}
              periods={[...Array(4).fill(GAME.quarterSec), ...Array(g.ot).fill(GAME.otSec)]}
              periodStarts={g.flowPeriods}
              height={150}
            />
            <div className="small dim" style={{ marginTop: 8 }}>
              {leadsText(away.abbrev, g.away.extra.biggestLead, home.abbrev, g.home.extra.biggestLead)}
            </div>
          </div>
        </Section>
      )}
      {pbp.length > 0 && (g.flow ? <More label="Play-by-play">{<PlayByPlay pbp={pbp} />}</More> : <PlayByPlay pbp={pbp} />)}
    </>
  );
}

/** "Largest leads: BOS 12, NYK 7.", or "Largest lead: OKC 41 (LAC never led)." */
function leadsText(a: string, la: number, b: string, lb: number) {
  if (la > 0 && lb > 0) return `Largest leads: ${a} ${la}, ${b} ${lb}.`;
  if (!la && !lb) return '';
  const [lead, n, other] = la > 0 ? [a, la, b] : [b, lb, a];
  return `Largest lead: ${lead} ${n} (${other} never led).`;
}

/**
 * Win probability over the game, from `side`'s view, with the three biggest swings marked and
 * named (the play itself while the play-by-play is kept, else what it did to the score).
 */
function WinProbCard({ g, league, side, kits }: { g: GameResult; league: League; side: 0 | 1; kits: [string, string] }) {
  const series = useMemo(() => wpSeries(g), [g]);
  if (!series || series.length < 3) return null;
  const abbrevs = [league.teams[g.home.tid].abbrev, league.teams[g.away.tid].abbrev] as const;
  const me = abbrevs[side];
  const mine = (v: number) => (side === 0 ? v : 1 - v);
  const pct = wpText;
  // numbered in the order they happened
  const swings = biggestSwings(series, 3).sort((a, b) => a.at - b.at);
  const say = (at: number) => {
    const p = series[at];
    const prev = series[at - 1];
    // from the side it went for
    const gainer: 0 | 1 = p.wp >= prev.wp ? 0 : 1;
    const m = (x: number) => (gainer === 0 ? x : -x);
    const play = playAt(g, p);
    return `${gameTime(p.q, p.clock)} · ${play ? play.text.replace(/\.$/, '') : `${abbrevs[gainer]} ${swingWords(m(prev.margin), m(p.margin))}`}`;
  };
  return (
    <Section
      title={
        <h3>
          <Term id="winprob">Win probability</Term>
        </h3>
      }
      right={
        <span className="row" style={{ gap: 6 }}>
          <span className="tiny dim">{me} above 50%</span>
          <Help title="Win probability">
            <p>
              {me} {pct(mine(series[0].wp))} to win at tip-off{g.edge === undefined ? ' (home court alone: this game kept no projection)' : ', from the pre-game projection'}.
            </p>
            <p>After each possession: the score, the time left{g.flowPoss ? ', who has the ball' : ''} and that projection.</p>
            {!g.flowT && <p>Possession times weren&apos;t kept for this game, so they are spread evenly over each period.</p>}
          </Help>
        </span>
      }
    >
      <div className="card">
        <WinProbChart
          points={series.map((p) => ({ t: p.t, wp: mine(p.wp) }))}
          periods={[...Array(4).fill(GAME.quarterSec), ...Array(g.ot).fill(GAME.otSec)]}
          color={kits[side]}
          colorOther={kits[1 - side]}
          marks={swings.map((x) => x.at)}
          describe={(i) => {
            const p = series[i];
            return p.i < 0 ? 'Tip-off' : `${gameTime(p.q, p.clock)} · ${marginWords(me, side === 0 ? p.margin : -p.margin)}`;
          }}
          label={`${me} win probability over the game: ${pct(mine(series[0].wp))} at tip-off${swings.length ? `; biggest swings: ${swings.map((x) => `${say(x.at)}, ${pct(mine(x.from))} to ${pct(mine(x.to))}`).join('; ')}` : ''}`}
          height={140}
        />
        <div className="gv-swings">
          <div className="over">Biggest swings</div>
          {swings.length === 0 && <div className="small dim2">No possession moved it 5% or more.</div>}
          {swings.map((x, k) => (
            <div key={x.at} className="gv-swing">
              <span className="gv-swing-n num">{k + 1}</span>
              <span className="grow dim2">{say(x.at)}</span>
              <span className="num nowrap">
                {pct(mine(x.from))} → <b>{pct(mine(x.to))}</b>
              </span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/** A coached game's play-by-play runs to hundreds of lines: one period at a time on request. */
function PlayByPlay({ pbp }: { pbp: PbpEntry[] }) {
  const [q, setQ] = useState(0);
  const periods = Math.max(4, ...pbp.map((e) => e.q));
  const rows = q ? pbp.filter((e) => e.q === q) : pbp;
  return (
    <div className="col" style={{ gap: 10, marginTop: 6 }}>
      <Chips
        label="Period"
        value={q}
        onChange={setQ}
        options={[{ id: 0, label: 'All' }, ...Array.from({ length: periods }, (_, i) => ({ id: i + 1, label: periodLabel(i + 1) }))]}
      />
      <div className="card flush list">
        {rows.map((e, i) => (
          <div key={i} className={`gv-pbp${e.kind === 'period' ? ' strong' : ''}`} style={{ opacity: pbpOpacity(e.kind) }}>
            <span className="gv-pbp-when num">{gameTime(e.q, e.clock)}</span>
            <span className="grow">{e.text}</span>
            <span className="gv-pbp-sc num">
              {e.as}-{e.hs}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
