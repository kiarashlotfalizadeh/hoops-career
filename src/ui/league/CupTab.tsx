import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import type { CupTie, League } from '../../core/types';
import { cupTables, type CupGroupTable } from '../../core/league/cup';
import { fmtDate, playerName } from '../../core/league/helpers';
import { seasonLabel } from '../../core/constants';
import { useStore } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Card, Segmented } from '../components/ui';
import { confName, useQueryParam } from './shared';

const dateRange = (league: League, a: number, b: number) => (a === b ? fmtDate(league.season, a) : `${fmtDate(league.season, a)} – ${fmtDate(league.season, b)}`);

export function CupTab({ league }: { league: League }) {
  const v = useStore((s) => s.v);
  const cup = league.cup && league.cup.season === league.season ? league.cup : null;
  const userConf = league.teams[league.userTid].conf;
  const [conf, setConf] = useQueryParam<'E' | 'W'>('cconf', userConf, ['E', 'W']);
  const tables = useMemo(
    () => (cup ? cupTables(league) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, cup, v],
  );
  const lastWinner = [...league.awards].filter((a) => a.cupWinner !== undefined).sort((a, b) => b.season - a.season)[0];

  if (!cup) {
    return (
      <>
        <Card>
          <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 8, padding: '12px 0' }}>
            <Trophy size={30} className="dim" />
            <h3>No NBA Cup this season</h3>
            <div className="small dim" style={{ maxWidth: 340 }}>
              The in-season tournament is drawn with each new schedule: six groups of five play on Cup nights in November, and the best eight meet in December knockouts.
            </div>
          </div>
        </Card>
        {lastWinner?.cupWinner !== undefined && <CupBanner league={league} season={lastWinner.season} tid={lastWinner.cupWinner} runnerUp={lastWinner.cupRunnerUp} mvp={lastWinner.cupMvp} />}
      </>
    );
  }

  const groupGamesLeft = league.schedule.filter((g) => g.cup === 'group' && !g.played).length;
  const final = cup.bracket.find((t) => t.round === 'final');
  const status =
    cup.champion !== undefined
      ? `${seasonLabel(cup.season)} NBA Cup complete`
      : cup.seeds
        ? 'Knockout round'
        : league.phase === 'preseason'
          ? `Group stage starts ${fmtDate(league.season, cup.nights[0])}`
          : `Group stage · ${groupGamesLeft} group game${groupGamesLeft === 1 ? '' : 's'} left`;

  return (
    <>
      {cup.champion !== undefined && <CupBanner league={league} season={cup.season} tid={cup.champion} runnerUp={final ? (final.winner === final.high ? final.low : final.high) : undefined} mvp={cup.mvp} final={final} />}
      <div className="row between" style={{ gap: 8 }}>
        <span className="small dim">{status}</span>
        <span className="tiny dim">
          Knockouts {dateRange(league, cup.qfDays[0], cup.finalDay)}
        </span>
      </div>
      <div className="bk-only-narrow">
        <ConfToggle value={conf} onChange={setConf} />
      </div>

      {cup.seeds ? (
        <>
          <div className="bk-panel-wrap">
            {(['E', 'W'] as const).map((c) => (
              <div key={c} className={c !== conf ? 'bk-hide-narrow' : ''}>
                <Card title={`${confName(c)} knockouts`}>
                  <KnockoutBracket league={league} conf={c} />
                </Card>
              </div>
            ))}
          </div>
          <CupFinal league={league} final={final} />
        </>
      ) : (
        <Card title="How the knockouts work">
          <div className="small dim2" style={{ lineHeight: 1.5 }}>
            The three group winners and the best runner-up in each conference advance. Quarterfinals ({dateRange(league, cup.qfDays[0], cup.qfDays[1])}) and semifinals ({fmtDate(league.season, cup.sfDay)}) are hosted by the better seed and count in the standings. The championship ({fmtDate(league.season, cup.finalDay)}) is on a neutral floor and doesn't. Teams that don't advance play their last two regular-season games in the knockout window.
          </div>
        </Card>
      )}

      <div className="bk-panel-wrap">
        {(['E', 'W'] as const).map((c) => (
          <div key={c} className={`col ${c !== conf ? 'bk-hide-narrow' : ''}`} style={{ gap: 14 }}>
            {tables
              .filter((t) => t.group.conf === c)
              .map((t) => (
                <GroupCard key={t.group.id} league={league} table={t} decided={!!cup.seeds} />
              ))}
          </div>
        ))}
      </div>
      <div className="tiny dim" style={{ lineHeight: 1.5 }}>
        Cup nights: {cup.nights.map((d) => fmtDate(league.season, d)).join(', ')}. Group ties break on head-to-head, then point differential and points scored in group games, then last season&apos;s record.
      </div>
    </>
  );
}

function ConfToggle({ value, onChange }: { value: 'E' | 'W'; onChange: (v: 'E' | 'W') => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { id: 'E', label: 'East' },
        { id: 'W', label: 'West' },
      ]}
    />
  );
}

function GroupCard({ league, table, decided }: { league: League; table: CupGroupTable; decided: boolean }) {
  return (
    <Card title={table.group.id} className="flush">
      <table className="stats cup-group">
        <thead>
          <tr>
            <th className="l">Team</th>
            <th>W-L</th>
            <th>PD</th>
            <th>PF</th>
            <th aria-label="Status" />
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => {
            const out = decided && r.seed === undefined;
            return (
              <tr key={r.tid} className={`${r.tid === league.userTid ? 'me' : ''} ${out ? 'cup-out' : ''}`}>
                <td className="l">
                  <Link to={`/team/${r.tid}`} className="lg-tcell">
                    <span className="tiny dim" style={{ width: 10, textAlign: 'right' }}>
                      {r.rank}
                    </span>
                    <TeamLogo tid={r.tid} size={20} />
                    {league.teams[r.tid].abbrev}
                  </Link>
                </td>
                <td className="num">
                  {r.won}-{r.lost}
                </td>
                <td className="num">{r.pd > 0 ? `+${r.pd}` : r.pd}</td>
                <td className="num">{r.pf}</td>
                <td>{r.seed !== undefined && <span className={`tag ${r.seed === 4 ? 'info' : 'good'}`}>{r.seed === 4 ? 'WC' : `#${r.seed}`}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function TieCard({ league, tie, tbd }: { league: League; tie?: CupTie; tbd?: string }) {
  if (!tie) {
    return (
      <div className="bk-s tbd">
        {[0, 1].map((i) => (
          <div key={i} className="bk-t">
            <span />
            <span />
            <span className="tb">{tbd ?? 'TBD'}</span>
            <span />
          </div>
        ))}
      </div>
    );
  }
  const me = tie.high === league.userTid || tie.low === league.userTid;
  const line = (tid: number, seed: number, pts: number | undefined) => (
    <div className={`bk-t ${tie.winner === undefined ? '' : tie.winner === tid ? 'win' : 'lose'}`}>
      <span className="sd">{tie.round === 'final' ? '' : seed}</span>
      <TeamLogo tid={tid} size={18} />
      <span className="ellipsis">{league.teams[tid].abbrev}</span>
      <span className="w">{pts ?? ''}</span>
    </div>
  );
  const body = (
    <>
      {line(tie.high, tie.highSeed, tie.highPts)}
      {line(tie.low, tie.lowSeed, tie.lowPts)}
    </>
  );
  const label = `${league.teams[tie.low].abbrev} at ${league.teams[tie.high].abbrev}, ${fmtDate(league.season, tie.day)}`;
  return tie.winner !== undefined ? (
    <Link to={`/game/${tie.gid}`} className={`bk-s cup-tie ${me ? 'me' : ''}`} aria-label={`Box score: ${label}`}>
      {body}
    </Link>
  ) : (
    <div className={`bk-s cup-tie ${me ? 'me' : ''}`} title={label}>
      {body}
    </div>
  );
}

function KnockoutBracket({ league, conf }: { league: League; conf: 'E' | 'W' }) {
  const cup = league.cup!;
  const qf = cup.bracket.filter((t) => t.round === 'qf' && t.conf === conf).sort((a, b) => a.highSeed - b.highSeed);
  const sf = cup.bracket.find((t) => t.round === 'sf' && t.conf === conf);
  return (
    <>
      <div className="bk-head two">
        <span>Quarterfinals · {fmtDate(league.season, qf[0]?.day ?? cup.qfDays[0])}</span>
        <span>Semifinal · {fmtDate(league.season, cup.sfDay)}</span>
      </div>
      <div className="bk two">
        <div className="bk-col r1">
          <div className="bk-pair">
            <div className="bk-slot">
              <TieCard league={league} tie={qf[0]} />
            </div>
            <div className="bk-slot">
              <TieCard league={league} tie={qf[1]} />
            </div>
          </div>
        </div>
        <div className="bk-col r2">
          <div className="bk-slot">
            <TieCard league={league} tie={sf} />
          </div>
        </div>
      </div>
    </>
  );
}

function CupFinal({ league, final }: { league: League; final?: CupTie }) {
  const cup = league.cup!;
  const sfE = cup.bracket.find((t) => t.round === 'sf' && t.conf === 'E');
  const sfW = cup.bracket.find((t) => t.round === 'sf' && t.conf === 'W');
  const eTid = final ? (league.teams[final.high].conf === 'E' ? final.high : final.low) : sfE?.winner;
  const wTid = final ? (eTid === final.high ? final.low : final.high) : sfW?.winner;
  const ptsOf = (tid: number | undefined) => (final && tid !== undefined && final.winner !== undefined ? (tid === final.high ? final.highPts : final.lowPts) : undefined);
  const side = (tid: number | undefined, label: string) => (
    <div className={`side ${final?.winner !== undefined && final.winner !== tid ? 'lose' : ''}`}>
      {tid !== undefined ? <TeamLogo tid={tid} size={46} /> : <div style={{ width: 46, height: 46, borderRadius: '50%', border: '1.5px dashed var(--line-2)' }} />}
      <div className="bold ellipsis" style={{ maxWidth: '100%' }}>
        {tid !== undefined ? league.teams[tid].name : `${label} winner`}
      </div>
      <div className="tiny dim">{label}</div>
      {ptsOf(tid) !== undefined && <div className="score">{ptsOf(tid)}</div>}
    </div>
  );
  const body = (
    <div className="bk-finals">
      {side(eTid, 'East')}
      <div className="display dim" style={{ fontSize: 18 }}>
        vs
      </div>
      {side(wTid, 'West')}
    </div>
  );
  return (
    <Card
      title={
        <h3>
          <Trophy size={14} style={{ verticalAlign: -2 }} /> Championship
        </h3>
      }
      right={<span className="small dim">{final?.winner !== undefined ? 'Final' : `${fmtDate(league.season, cup.finalDay)} · neutral floor`}</span>}
    >
      {final?.winner !== undefined ? (
        <Link to={`/game/${final.gid}`} aria-label="Championship box score" style={{ display: 'block', color: 'inherit' }}>
          {body}
        </Link>
      ) : (
        body
      )}
      <div className="tiny dim" style={{ marginTop: 8, textAlign: 'center' }}>
        The championship doesn&apos;t count in the standings or season stats.
      </div>
    </Card>
  );
}

export function CupBanner({ league, season, tid, runnerUp, mvp, final }: { league: League; season: number; tid: number; runnerUp?: number; mvp?: number; final?: CupTie }) {
  const t = league.teams[tid];
  const p = mvp !== undefined ? league.players[mvp] : undefined;
  const score = final?.highPts !== undefined && final.lowPts !== undefined ? ` ${Math.max(final.highPts, final.lowPts)}-${Math.min(final.highPts, final.lowPts)}` : '';
  return (
    <div className="lg-champ">
      <div className="row" style={{ gap: 14 }}>
        <TeamLogo tid={tid} size={60} />
        <div className="grow">
          <div className="kicker">
            <Trophy size={12} style={{ verticalAlign: -1 }} /> {seasonLabel(season)} NBA Cup
          </div>
          <div className="display bold" style={{ fontSize: 26, textTransform: 'uppercase', lineHeight: 1.05 }}>
            {t.region} {t.name}
          </div>
          <div className="small dim2" style={{ marginTop: 3 }}>
            {runnerUp !== undefined && (
              <>
                def. {league.teams[runnerUp].name}
                {score}
              </>
            )}
            {p && (
              <>
                {runnerUp !== undefined ? ' · ' : ''}Cup MVP{' '}
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
