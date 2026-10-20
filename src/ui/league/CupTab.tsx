import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import type { CupTie, League } from '../../core/types';
import { cupSeeds, cupTables, type CupGroupTable } from '../../core/league/cup';
import { dayToDate, fmtDate, playerName } from '../../core/league/helpers';
import { seasonLabel } from '../../core/constants';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Help, Section, Segmented } from '../components/ui';
import { TitleSlab, Toolbar, confName, confOrder, teamPath, useQueryParam } from './shared';
import { plural } from '../../core/format';

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
  const cup = league.cup && league.cup.season === league.season ? league.cup : null;
  const userConf = league.teams[league.userTid].conf;
  const [conf, setConf] = useQueryParam<'E' | 'W'>('cconf', userConf, ['E', 'W']);
  const { tables, projected } = useLeagueMemo(() => {
    const tables = cup ? cupTables(league) : [];
    // during the group stage: who goes through if it ended today (leaders plus the best runner-up)
    const started = tables.some((t) => t.rows.some((r) => r.won + r.lost > 0));
    return { tables, projected: cup && !cup.seeds && started ? cupSeeds(league) : undefined };
  }, [league, cup]);
  const lastWinner = [...league.awards].filter((a) => a.cupWinner !== undefined).sort((a, b) => b.season - a.season)[0];

  if (!cup) {
    return (
      <>
        {lastWinner?.cupWinner !== undefined && (
          <CupBanner league={league} season={lastWinner.season} tid={lastWinner.cupWinner} runnerUp={lastWinner.cupRunnerUp} mvp={lastWinner.cupMvp} />
        )}
        <div className="card empty">No NBA Cup this season: it&apos;s drawn with each new schedule (groups in November, knockouts in December).</div>
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
      ? `Decided ${fmtDate(league.season, cup.finalDay)}` // (who won: the winners' slab says it)
      : cup.seeds
        ? `Knockouts · ${koRound}`
        : projected
          ? `Group stage · ${plural(groupGamesLeft, 'game')} left`
          : `Groups start ${fmtDate(league.season, cup.nights[0])}`;

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
      {/* the knockouts' dates: on the bracket's heads once it's drawn, on the line under the switch until then */}
      <Toolbar right={<CupHelp league={league} />}>{status}</Toolbar>
      <div className="bk-only-narrow">
        <Segmented
          label="Conference"
          value={conf}
          onChange={setConf}
          options={[
            { id: 'E', label: 'East' },
            { id: 'W', label: 'West' },
          ]}
        />
      </div>

      {seeds ? (
        <>
          <div className="bk-panel-wrap">
            {confOrder(conf).map((c) => (
              <div key={c} className={`bk-${c} ${c !== conf ? 'bk-hide-narrow' : ''}`}>
                <Section title={`${confName(c)} knockouts`} right={projected ? <span className="tag info">Projected</span> : undefined}>
                  <div className="card bk-card">
                    <KnockoutBracket league={league} conf={c} projected={projected} />
                  </div>
                </Section>
              </div>
            ))}
          </div>
          <CupFinal league={league} final={final} />
        </>
      ) : (
        <div className="lg-legend">
          <span>QF {dateRange(league, cup.qfDays[0], cup.qfDays[1])}</span>
          <span>SF {fmtDate(league.season, cup.sfDay)}</span>
          <span>Final {fmtDate(league.season, cup.finalDay)}, neutral floor</span>
        </div>
      )}

      <div className="bk-panel-wrap">
        {confOrder(conf).map((c) => (
          <div key={c} className={`bk-${c} ${c !== conf ? 'bk-hide-narrow' : ''}`}>
            <Section title={`${confName(c)} groups`}>
              <GroupTables league={league} tables={tables.filter((t) => t.group.conf === c)} seeds={seeds} decided={!!cup.seeds} />
            </Section>
          </div>
        ))}
      </div>
      {seeds && (
        <div className="lg-note">
          {cup.seeds ? 'Went through' : 'Would go through today'}: group winners (seeds 1-3) and the best runner-up (WC). +/- and PTS count group games only.
        </div>
      )}
    </>
  );
}

/** How the Cup works: who goes through, what counts, the Cup nights and the group tiebreakers. */
function CupHelp({ league }: { league: League }) {
  const cup = league.cup!;
  return (
    <Help title="NBA Cup">
      <p className="lg-p">
        The three group winners and the best runner-up in each conference advance. Quarterfinals ({dateRange(league, cup.qfDays[0], cup.qfDays[1])}) and semifinals (
        {fmtDate(league.season, cup.sfDay)}) are hosted by the better seed and count in the standings. The championship ({fmtDate(league.season, cup.finalDay)}) is on a neutral
        floor and doesn&apos;t count in the standings or season stats. Teams that don&apos;t advance play their last two regular-season games in the knockout window.
      </p>
      <p className="lg-p">Cup nights: {cup.nights.map((d) => fmtDate(league.season, d)).join(', ')}.</p>
      <p className="lg-p">Group ties break on head-to-head, then point differential and points scored in group games, then last season&apos;s record.</p>
    </Help>
  );
}

/** A conference's three groups in one table: a head, then each group under its name. */
function GroupTables({ league, tables, seeds, decided }: { league: League; tables: CupGroupTable[]; seeds?: Seeds; decided: boolean }) {
  return (
    <div className="card flush lg-st mode-cup">
      <div className="lg-st-row lg-st-head">
        <span>#</span>
        <span />
        <span>Team</span>
        <span>W-L</span>
        <span title="Point differential in group games">+/-</span>
        <span title="Points scored in group games">PTS</span>
        <span title="Knockout seed">Seed</span>
      </div>
      {tables.map((table) => {
        const seedOf = (tid: number) => {
          const i = seeds?.[table.group.conf].indexOf(tid) ?? -1;
          return i < 0 ? undefined : i + 1;
        };
        return (
          <Fragment key={table.group.id}>
            <div className="list-divider">{table.group.id}</div>
            {table.rows.map((r) => {
              const seed = seedOf(r.tid);
              const out = decided && seed === undefined;
              return (
                <Link key={r.tid} to={teamPath(r.tid)} className={`lg-st-row ${r.tid === league.userTid ? 'me' : ''} ${out ? 'cup-out' : ''}`}>
                  <span className="rk">{r.won + r.lost ? r.rank : '—'}</span>
                  <TeamLogo tid={r.tid} size={22} decorative />
                  <span className="nm">
                    <span>
                      <span className="nm-full">{league.teams[r.tid].name}</span>
                      <span className="nm-ab">{league.teams[r.tid].abbrev}</span>
                    </span>
                  </span>
                  <span className="wl">
                    {r.won}-{r.lost}
                  </span>
                  <span className={r.pd > 0 ? 'good' : r.pd < 0 ? 'bad' : ''}>{r.won + r.lost ? (r.pd > 0 ? `+${r.pd}` : r.pd) : '—'}</span>
                  <span>{r.won + r.lost ? r.pf : '—'}</span>
                  <span>{seed !== undefined && <span className={`tag ${!decided ? '' : seed === 4 ? 'info' : 'good'}`}>{seed === 4 ? 'WC' : seed}</span>}</span>
                </Link>
              );
            })}
          </Fragment>
        );
      })}
    </div>
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
    // (the spaces between the grid cells only space out what a screen reader reads: "1 LAL 127")
    <div className={`bk-t ${tie.winner === undefined ? '' : tie.winner === tid ? 'win' : 'lose'}`}>
      <span className="sd">{tie.round === 'final' ? '' : seed}</span> <TeamLogo tid={tid} size={18} decorative /> <span className="ellipsis">{league.teams[tid].abbrev}</span>{' '}
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
    // named by what it shows, then where it goes: "1 LAL 127 4 SAS 142. Box score, LAL at SAS, Dec 5"
    <Link to={`/game/${tie.gid}`} className={`bk-s cup-tie ${me ? 'me' : ''}`}>
      {body}
      <span className="sr-only">. Box score, {label}</span>
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
        <span>QF · {qfDate}</span>
        <span>SF · {fmtDate(league.season, cup.sfDay)}</span>
      </div>
      <div className="bk-grid two">
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
      {tid !== undefined ? <TeamLogo tid={tid} size={46} decorative /> : <span className="bk-ghost" />}
      <div className="bk-fname ellipsis">{tid !== undefined ? league.teams[tid].name : `${label} winner`}</div>
      {tid !== undefined && <div className="bk-fconf">{label}</div>}
      {ptsOf(tid) !== undefined && <div className="score">{ptsOf(tid)}</div>}
    </div>
  );
  const body = (
    <div className="bk-finals">
      {side(eTid, 'East')}
      <div className="bk-vs">vs</div>
      {side(wTid, 'West')}
    </div>
  );
  return (
    <Section
      title={
        <h3>
          <Trophy size={13} aria-hidden="true" /> Championship
        </h3>
      }
      right={<span className="lg-sec-meta">{final?.winner !== undefined ? 'Final' : `${fmtDate(league.season, cup.finalDay)} · neutral floor`}</span>}
    >
      {final?.winner !== undefined ? (
        <Link to={`/game/${final.gid}`} className="card bk-fcard">
          {body}
          <span className="sr-only">. Championship box score</span>
        </Link>
      ) : (
        <div className="card bk-fcard">{body}</div>
      )}
      <div className="lg-note">Doesn&apos;t count in the standings or season stats.</div>
    </Section>
  );
}

export function CupBanner({ league, season, tid, runnerUp, mvp, final }: { league: League; season: number; tid: number; runnerUp?: number; mvp?: number; final?: CupTie }) {
  const p = mvp !== undefined ? league.players[mvp] : undefined;
  const score = final?.highPts !== undefined && final.lowPts !== undefined ? ` ${Math.max(final.highPts, final.lowPts)}-${Math.min(final.highPts, final.lowPts)}` : '';
  return (
    <TitleSlab league={league} tid={tid} over={`${seasonLabel(season)} NBA Cup`}>
      {runnerUp !== undefined && (
        <>
          def. {league.teams[runnerUp].name}
          {score}
        </>
      )}
      {p && (
        <>
          {runnerUp !== undefined ? ' · ' : ''}Cup MVP{' '}
          <Link to={`/player/${p.pid}`} className="lg-slab-link">
            {playerName(p)}
          </Link>
        </>
      )}
    </TitleSlab>
  );
}
