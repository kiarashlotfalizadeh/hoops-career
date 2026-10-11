import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import type { CupTie, League } from '../../core/types';
import { cupSeeds, cupTables, type CupGroupTable } from '../../core/league/cup';
import { dayToDate, fmtDate, playerName } from '../../core/league/helpers';
import { seasonLabel } from '../../core/constants';
import { useStore } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Card, Segmented } from '../components/ui';
import { confName, useQueryParam } from './shared';

/** "Dec 4–11", or "Nov 28 – Dec 3" across months. */
function dateRange(league: League, a: number, b: number) {
  if (a === b) return fmtDate(league.season, a);
  const end = dayToDate(league.season, b);
  return dayToDate(league.season, a).getUTCMonth() === end.getUTCMonth()
    ? `${fmtDate(league.season, a)}–${end.getUTCDate()}`
    : `${fmtDate(league.season, a)} – ${fmtDate(league.season, b)}`;
}

type Seeds = { E: number[]; W: number[] };

/** A knockout tie as the bracket shows it: a scheduled (or played) game, or a projected pairing. */
type Tie = Pick<CupTie, 'round' | 'high' | 'low' | 'highSeed' | 'lowSeed'> & Partial<CupTie>;

export function CupTab({ league }: { league: League }) {
  const v = useStore((s) => s.v);
  const cup = league.cup && league.cup.season === league.season ? league.cup : null;
  const userConf = league.teams[league.userTid].conf;
  const [conf, setConf] = useQueryParam<'E' | 'W'>('cconf', userConf, ['E', 'W']);
  const { tables, projected } = useMemo(
    () => {
      const tables = cup ? cupTables(league) : [];
      // during the group stage: who goes through if it ended today (leaders plus the best runner-up)
      const started = tables.some((t) => t.rows.some((r) => r.won + r.lost > 0));
      return { tables, projected: cup && !cup.seeds && started ? cupSeeds(league) : undefined };
    },
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
        {lastWinner?.cupWinner !== undefined && (
          <CupBanner league={league} season={lastWinner.season} tid={lastWinner.cupWinner} runnerUp={lastWinner.cupRunnerUp} mvp={lastWinner.cupMvp} />
        )}
      </>
    );
  }

  const groupGamesLeft = league.schedule.filter((g) => g.cup === 'group' && !g.played).length;
  const final = cup.bracket.find((t) => t.round === 'final');
  const seeds = cup.seeds ?? projected;
  // each knockout round is drawn once the one before it is over
  const koRound = final ? 'Championship' : cup.bracket.some((t) => t.round === 'sf') ? 'Semifinals' : 'Quarterfinals';
  const status =
    cup.champion !== undefined
      ? `${seasonLabel(cup.season)} NBA Cup complete`
      : cup.seeds
        ? `Knockouts · ${koRound}`
        : projected
          ? `Group stage · ${groupGamesLeft} group game${groupGamesLeft === 1 ? '' : 's'} left`
          : `Group stage starts ${fmtDate(league.season, cup.nights[0])}`;

  return (
    <>
      {cup.champion !== undefined && (
        <CupBanner
          league={league}
          season={cup.season}
          tid={cup.champion}
          runnerUp={final ? (final.winner === final.high ? final.low : final.high) : undefined}
          mvp={cup.mvp}
          final={final}
        />
      )}
      {/* until the new groups tip off, last season's winner holds the Cup */}
      {!projected && !cup.seeds && lastWinner?.cupWinner !== undefined && lastWinner.season < cup.season && (
        <CupBanner league={league} season={lastWinner.season} tid={lastWinner.cupWinner} runnerUp={lastWinner.cupRunnerUp} mvp={lastWinner.cupMvp} />
      )}
      <div className="row between" style={{ gap: 8 }}>
        <span className="small dim">{status}</span>
        <span className="tiny dim">Knockouts {dateRange(league, cup.qfDays[0], cup.finalDay)}</span>
      </div>
      <div className="bk-only-narrow">
        <ConfToggle value={conf} onChange={setConf} />
      </div>

      {seeds ? (
        <>
          <div className="bk-panel-wrap">
            {(['E', 'W'] as const).map((c) => (
              <div key={c} className={c !== conf ? 'bk-hide-narrow' : ''}>
                <Card title={`${confName(c)} knockouts`} right={projected ? <span className="tag info">Projected</span> : undefined}>
                  <KnockoutBracket league={league} conf={c} projected={projected} />
                </Card>
              </div>
            ))}
          </div>
          <CupFinal league={league} final={final} />
        </>
      ) : (
        <Card title="How the knockouts work">
          <div className="small dim2" style={{ lineHeight: 1.5 }}>
            The three group winners and the best runner-up in each conference advance. Quarterfinals ({dateRange(league, cup.qfDays[0], cup.qfDays[1])}) and semifinals (
            {fmtDate(league.season, cup.sfDay)}) are hosted by the better seed and count in the standings. The championship ({fmtDate(league.season, cup.finalDay)}) is on a neutral
            floor and doesn&apos;t. Teams that don&apos;t advance play their last two regular-season games in the knockout window.
          </div>
        </Card>
      )}

      <div className="bk-panel-wrap">
        {(['E', 'W'] as const).map((c) => (
          <div key={c} className={`col ${c !== conf ? 'bk-hide-narrow' : ''}`} style={{ gap: 14 }}>
            {tables
              .filter((t) => t.group.conf === c)
              .map((t) => (
                <GroupCard key={t.group.id} league={league} table={t} seeds={seeds} decided={!!cup.seeds} />
              ))}
          </div>
        ))}
      </div>
      <div className="lg-note">
        {seeds &&
          (cup.seeds
            ? 'Group winners (seeds 1-3) and the best runner-up in each conference (WC) went through. '
            : 'Tags mark who would go through if the group stage ended today: the group winners (seeds 1-3) and the best runner-up in each conference (WC). ')}
        Cup nights: {cup.nights.map((d) => fmtDate(league.season, d)).join(', ')}. Group ties break on head-to-head, then point differential and points scored in group games, then
        last season&apos;s record.
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

function GroupCard({ league, table, seeds, decided }: { league: League; table: CupGroupTable; seeds?: Seeds; decided: boolean }) {
  const seedOf = (tid: number) => {
    const i = seeds?.[table.group.conf].indexOf(tid) ?? -1;
    return i < 0 ? undefined : i + 1;
  };
  return (
    <Card title={table.group.id} className="flush lg-flat lg-st mode-cup">
      <div className="lg-st-row lg-st-head">
        <span style={{ textAlign: 'right' }}>#</span>
        <span />
        <span>Team</span>
        <span>W-L</span>
        <span title="Point differential in group games">PD</span>
        <span title="Points scored in group games">PF</span>
        <span />
      </div>
      {table.rows.map((r) => {
        const seed = seedOf(r.tid);
        const out = decided && seed === undefined;
        return (
          <Link key={r.tid} to={`/team/${r.tid}`} className={`lg-st-row ${r.tid === league.userTid ? 'me' : ''} ${out ? 'cup-out' : ''}`}>
            <span className="rk">{r.won + r.lost ? r.rank : '–'}</span>
            <TeamLogo tid={r.tid} size={22} />
            <span className="nm">
              <span>
                <span className="nm-full">{league.teams[r.tid].name}</span>
                <span className="nm-ab">{league.teams[r.tid].abbrev}</span>
              </span>
            </span>
            <span className="wl">
              {r.won}-{r.lost}
            </span>
            <span className={r.pd > 0 ? 'good' : r.pd < 0 ? 'bad' : 'dim'}>{r.won + r.lost ? (r.pd > 0 ? `+${r.pd}` : r.pd) : '–'}</span>
            <span className="dim2">{r.won + r.lost ? r.pf : '–'}</span>
            <span>{seed !== undefined && <span className={`tag ${!decided ? '' : seed === 4 ? 'info' : 'good'}`}>{seed === 4 ? 'WC' : `#${seed}`}</span>}</span>
          </Link>
        );
      })}
    </Card>
  );
}

function TieCard({ league, tie }: { league: League; tie?: Tie }) {
  if (!tie) {
    return (
      <div className="bk-s tbd">
        {[0, 1].map((i) => (
          <div key={i} className="bk-t">
            <span />
            <span />
            <span className="tb">TBD</span>
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
  const label = `${league.teams[tie.low].abbrev} at ${league.teams[tie.high].abbrev}${tie.day !== undefined ? `, ${fmtDate(league.season, tie.day)}` : ''}`;
  return tie.winner !== undefined && tie.gid !== undefined ? (
    <Link to={`/game/${tie.gid}`} className={`bk-s cup-tie ${me ? 'me' : ''}`} aria-label={`Box score: ${label}`}>
      {body}
    </Link>
  ) : (
    <div className={`bk-s cup-tie ${me ? 'me' : ''}`} title={label}>
      {body}
    </div>
  );
}

function KnockoutBracket({ league, conf, projected }: { league: League; conf: 'E' | 'W'; projected?: Seeds }) {
  const cup = league.cup!;
  const s = projected?.[conf];
  const qf: Tie[] = s
    ? [
        { round: 'qf', high: s[0], low: s[3], highSeed: 1, lowSeed: 4 },
        { round: 'qf', high: s[1], low: s[2], highSeed: 2, lowSeed: 3 },
      ]
    : cup.bracket.filter((t) => t.round === 'qf' && t.conf === conf).sort((a, b) => a.highSeed - b.highSeed);
  const sf = cup.bracket.find((t) => t.round === 'sf' && t.conf === conf);
  // which conference plays which quarterfinal night is drawn at seeding
  const qfDate = qf[0]?.day !== undefined ? fmtDate(league.season, qf[0].day) : dateRange(league, cup.qfDays[0], cup.qfDays[1]);
  return (
    <>
      <div className="bk-head two">
        <span>Quarterfinals · {qfDate}</span>
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
      {tid !== undefined && <div className="tiny dim">{label}</div>}
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
