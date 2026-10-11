import { useQueryParam } from '../league/shared';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftRight } from 'lucide-react';
import { useLeague, useStore } from '../../state/store';
import type { League, Player, PlayerStats, RatingKey, TrainingFocus } from '../../core/types';
import { DRAFT_PROSPECT, FREE_AGENT, RETIRED } from '../../core/types';
import { RATING_META, ROLE_META, archetype, attrDisplay, composites, fmtHeight, ovrWeights, tierLabel, type Composites } from '../../core/ratings';
import { Avatar, Bar, Card, Chips, Empty, Help, Kpi, Ovr, PageHeader, Segmented, Sheet, StatTable, Tag, type Col } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { LineChart } from '../components/charts';
import { f1, moneyM, p1, perGame, signed } from '../stats';
import { contractExp, salaryFor } from '../../core/playerGen';
import { moodLevel, MOOD_META } from '../../core/league/morale';
import { FOCUS_META, ratingMeans } from '../../core/league/progression';
import { askingContract, convertTwoWay, marketSalary, releaseBlockedReason, releasePlayer } from '../../core/league/contracts';
import { seasonLabel } from '../../core/constants';
import { BBREF_TO_TID } from '../../core/teams';

type Tab = 'overview' | 'ratings' | 'stats' | 'log' | 'dev';

interface SkillDef {
  key: string;
  label: string;
  get: (c: Composites, p: Player) => number;
  help: string;
}

const SKILLS: SkillDef[] = [
  { key: 'create', label: 'Shot creation', get: (c) => (c.create + c.pnrHandle) / 2, help: 'Beating a defender and running pick-and-roll. Drives usage in PnR and isolations.' },
  { key: 'three', label: 'Three-point shooting', get: (c) => (c.c3 + c.pu3) / 2, help: 'Catch-and-shoot and pull-up threes. Also creates spacing for teammates.' },
  { key: 'mid', label: 'Mid-range', get: (c) => c.midShot, help: 'Pull-ups and floaters, the answer to drop coverage.' },
  { key: 'rim', label: 'Finishing', get: (c) => c.rim, help: 'Converting at the rim through contact and rim protectors.' },
  { key: 'pass', label: 'Playmaking', get: (c) => c.passing, help: 'Finding the open man: punishes blitzes, doubles and heavy help.' },
  { key: 'sec', label: 'Ball security', get: (c) => c.ballSec, help: 'Avoiding turnovers under pressure and traps.' },
  { key: 'perd', label: 'Perimeter defense', get: (c) => c.perDef, help: 'Containing guards and wings on the ball. Key for switching.' },
  { key: 'intd', label: 'Interior defense', get: (c) => c.intDef, help: 'Holding position against post-ups and walling off drives.' },
  { key: 'rimp', label: 'Rim protection', get: (c) => c.rimProt, help: 'Altering shots at the rim. Anchors drop coverage and zones.' },
  { key: 'reb', label: 'Rebounding', get: (c) => (c.orb + c.drb) / 2, help: 'Securing boards on both ends.' },
  { key: 'ath', label: 'Athleticism', get: (_c, p) => (p.ratings.spd + p.ratings.ath) / 2, help: 'Speed and explosiveness. Declines from the late 20s.' },
];

function useSkillPercentiles(league: League) {
  const v = useStore((s) => s.v);
  return useMemo(() => {
    const pool = Object.values(league.players).filter((p) => p.tid >= 0);
    const sorted: Record<string, number[]> = {};
    for (const s of SKILLS) sorted[s.key] = pool.map((p) => s.get(composites(p.ratings), p)).sort((a, b) => a - b);
    return (key: string, val: number) => {
      const arr = sorted[key];
      let lo = 0;
      let hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] < val) lo = mid + 1;
        else hi = mid;
      }
      return arr.length ? Math.min(99, Math.max(1, Math.round((lo / arr.length) * 100))) : 50;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, v]);
}

/** Median OVR of rostered players (the display scale puts the 50th percentile here). */
const AVERAGE_OVR = 74;

/**
 * Where a player's OVR comes from: each attribute's weighted gap to the league average,
 * scaled so the parts add up to his distance from an average player.
 */
function ovrContributions(league: League, p: Player) {
  const means = league.ratingAnchors ?? ratingMeans(league);
  const w = ovrWeights(p.ratings);
  const parts = RATING_META.map((m) => {
    const k = m.key as RatingKey;
    return { key: m.key, label: m.label, raw: w[k] * (p.ratings[k] - (means[k] ?? 50)) };
  });
  const total = parts.reduce((a, x) => a + x.raw, 0);
  const gap = p.ovr - AVERAGE_OVR;
  // display points per raw point: proportional share of the gap when the signs agree
  const k = Math.abs(total) > 0.5 && Math.sign(total) === Math.sign(gap) ? gap / total : 1.6;
  return {
    gap,
    parts: parts.map((x) => ({ ...x, delta: Math.round(x.raw * k) })).sort((a, b) => b.raw - a.raw),
  };
}

function seasonsOf(p: Player) {
  const bySeason = new Map<string, PlayerStats[]>();
  for (const s of p.stats) {
    const k = `${s.season}|${s.playoffs ? 1 : 0}`;
    if (!bySeason.has(k)) bySeason.set(k, []);
    bySeason.get(k)!.push(s);
  }
  const rows: { key: string; season: number; playoffs: boolean; teams: number[]; tot: PlayerStats }[] = [];
  for (const [k, list] of bySeason) {
    const tot = { ...list[0] } as PlayerStats;
    if (list.length > 1) {
      for (const s of list.slice(1)) {
        for (const f of Object.keys(tot) as (keyof PlayerStats)[]) {
          const v = s[f];
          if (typeof v === 'number' && f !== 'season' && f !== 'tid') (tot as unknown as Record<string, number>)[f] += v;
        }
      }
      // advanced numbers from real seasons: keep the total row's (first) values
    }
    rows.push({ key: k, season: list[0].season, playoffs: list[0].playoffs, teams: list.map((s) => (typeof s.tid === 'number' ? s.tid : BBREF_TO_TID[String(s.tid)] ?? -1)), tot });
  }
  return rows.sort((a, b) => b.season - a.season || Number(a.playoffs) - Number(b.playoffs));
}

export default function PlayerView() {
  const league = useLeague();
  const nav = useNavigate();
  const { pid } = useParams();
  const p = league.players[Number(pid)];
  const [tab, setTab] = useQueryParam<Tab>('tab', 'overview', ['overview', 'ratings', 'stats', 'log', 'dev']);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [openRating, setOpenRating] = useState<string | null>(null);
  const pctile = useSkillPercentiles(league);
  if (!p) {
    return (
      <main className="page">
        <PageHeader title="Player" back />
        <Empty>Player not found.</Empty>
      </main>
    );
  }
  const age = league.season - p.bornYear;
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  const mine = p.tid === league.userTid;
  const c = composites(p.ratings);
  const arch = archetype(p.ratings);
  const role = team ? team.tactics.offense.roles[p.pid] ?? arch.role : arch.role;
  const mood = MOOD_META[moodLevel(p.mood.score)];
  const seasonLine = (season: number) => perGame(p.stats.filter((s) => s.season === season && !s.playoffs).reduce<PlayerStats | null>((a, s) => (a ? { ...a, ...sumStats(a, s) } : s), null));
  const cur = seasonLine(league.season);
  // before his first game this season, show his most recent season instead
  const lastSeason = cur ? null : Math.max(0, ...p.stats.filter((s) => !s.playoffs && s.gp > 0).map((s) => s.season));
  const line = cur ?? (lastSeason ? seasonLine(lastSeason) : null);
  const sal = salaryFor(p, league.season) || salaryFor(p, league.season + 1);
  const status = p.tid === FREE_AGENT ? 'Free agent' : p.tid === DRAFT_PROSPECT ? `${p.draft.year} draft prospect` : p.tid === RETIRED ? `Retired ${p.retiredSeason ?? ''}` : team ? `${team.region} ${team.name}` : '';
  const contribs = ovrContributions(league, p);

  return (
    <main className="page">
      <PageHeader title={p.lastName} sub={status} back />
      <Card accent>
        <div className="row top" style={{ gap: 14 }}>
          <Avatar p={p} size="lg" />
          <div className="grow">
            <div className="bold" style={{ fontSize: 19 }}>
              {p.firstName} {p.lastName}
            </div>
            <div className="small dim2">
              {p.pos} · #{p.jersey || '—'} · {age} yrs · {fmtHeight(p.heightIn)} · {p.weightLb} lb
            </div>
            <div className="small dim">
              {p.country}
              {p.college ? ` · ${p.college}` : ''}
              {p.draft.round > 0 ? ` · ${p.draft.year} R${p.draft.round} #${p.draft.pick}` : p.draft.year ? ` · Undrafted` : ''}
            </div>
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
              <Tag tone="info">{p.archetype}</Tag>
              <Tag>{tierLabel(p.ovr)}</Tag>
              {p.contract.twoWay && p.tid >= 0 && <Tag>Two-way</Tag>}
              {p.injury && <Tag tone="bad">{p.injury.type} · {p.injury.gamesRemaining}g</Tag>}
              {p.hof && <Tag tone="warn">Hall of Fame</Tag>}
            </div>
          </div>
          <div className="col" style={{ alignItems: 'center', gap: 4 }}>
            <Ovr v={p.ovr} size="lg" />
            <span className="pot">POT {p.pot}</span>
            {team && <TeamLogo tid={team.tid} size={28} />}
          </div>
        </div>
        <div className="grid4" style={{ marginTop: 12 }}>
          <Kpi k="PTS" v={line ? f1(line.pts) : '-'} />
          <Kpi k="REB" v={line ? f1(line.reb) : '-'} />
          <Kpi k="AST" v={line ? f1(line.ast) : '-'} />
          <Kpi k="TS%" v={line ? p1(line.tsPct).replace('%', '') : '-'} />
        </div>
        {!cur && line && lastSeason ? <div className="tiny dim" style={{ marginTop: 6 }}>{seasonLabel(lastSeason)} per game{p.stats.some((s) => s.season === lastSeason && s.real) ? ' (real)' : ''}</div> : null}
      </Card>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: 'overview', label: 'Overview' },
          { id: 'ratings', label: 'Ratings' },
          { id: 'stats', label: 'Stats' },
          { id: 'log', label: 'Games' },
          { id: 'dev', label: 'Growth' },
        ]}
      />

      {tab === 'overview' && (
        <>
          <Card title="Scouting profile" right={<Help title="How skills are measured">Each skill is a blend of underlying ratings, the same blend the game engine uses. Percentiles compare him with every rostered NBA player.</Help>}>
            <div className="col" style={{ gap: 9 }}>
              {SKILLS.map((s) => {
                const val = s.get(c, p);
                const pc = pctile(s.key, val);
                return (
                  <div key={s.key} className="ratingrow" style={{ gridTemplateColumns: '128px 1fr 44px' }}>
                    <span className="dim2">{s.label}</span>
                    <Bar value={pc} color={pc >= 85 ? 'var(--tier-elite)' : pc >= 65 ? 'var(--good)' : pc >= 35 ? 'var(--info)' : 'var(--bad)'} />
                    <span className="num right small">{pc}<span className="dim tiny">th</span></span>
                  </div>
                );
              })}
            </div>
          </Card>
          <div className="md-grid2">
            <Card title="Why he's a" right={<Ovr v={p.ovr} size="sm" />}>
              <div className="small dim" style={{ marginBottom: 8 }}>
                {contribs.gap >= 0 ? `${contribs.gap} points above` : `${-contribs.gap} points below`} an average NBA player ({AVERAGE_OVR}). Biggest reasons, in OVR points:
              </div>
              <div className="col" style={{ gap: 6 }}>
                {contribs.parts.filter((x) => x.delta > 0).slice(0, 4).map((x) => (
                  <div key={x.key} className="row between small">
                    <span>{x.label}</span>
                    <span className="good num">+{x.delta}</span>
                  </div>
                ))}
                <div className="divider" />
                {contribs.parts
                  .filter((x) => x.delta < 0)
                  .slice(-3)
                  .reverse()
                  .map((x) => (
                    <div key={x.key} className="row between small">
                      <span>{x.label}</span>
                      <span className="bad num">{x.delta}</span>
                    </div>
                  ))}
              </div>
            </Card>
            <Card title="Role & usage">
              <div className="col" style={{ gap: 8 }}>
                <div>
                  <div className="bold">{ROLE_META[role].label}</div>
                  <div className="small dim">{ROLE_META[role].help}</div>
                </div>
                {arch.role !== role && (
                  <div className="small warn">
                    His natural role is {ROLE_META[arch.role].label}.
                  </div>
                )}
                {team && (
                  <div className="small dim2">
                    Shot freedom: {['Limited', 'Normal', 'Green light'][(team.tactics.offense.freedom[p.pid] ?? 0) + 1]} · Planned minutes: {team.rotation.minutes[p.pid] ?? 0}
                  </div>
                )}
                {cur && (
                  <div className="small dim2">
                    Usage {p1(cur.usg)} · On-court net {signed(cur.onOff)} · +/- {signed(cur.pm)}
                  </div>
                )}
                {mine && (
                  <div className="row" style={{ gap: 6 }}>
                    <Link to="/tactics?tab=roles" className="btn xs">
                      Set role
                    </Link>
                    <Link to="/rotation" className="btn xs">
                      Minutes
                    </Link>
                  </div>
                )}
              </div>
            </Card>
          </div>
          <div className="md-grid2">
            <Card title="Mood">
              <div className="row" style={{ gap: 8 }}>
                <span style={{ color: mood.color, fontSize: 18 }}>{mood.emoji}</span>
                <span className="bold">{mood.label}</span>
                {p.mood.tradeRequest && <Tag tone="bad">Wants a trade</Tag>}
              </div>
              <div className="col small dim2" style={{ marginTop: 8, gap: 4 }}>
                {p.mood.notes.length ? p.mood.notes.map((n) => <div key={n}>• {n}</div>) : <div>No complaints.</div>}
                {p.mood.expectedMin > 0 && <div className="dim">Expects about {p.mood.expectedMin} minutes a night.</div>}
              </div>
            </Card>
            <Card title="Contract">
              {p.tid >= 0 ? (
                <div className="col" style={{ gap: 6 }}>
                  <div className="row between">
                    <span className="dim2 small">This season</span>
                    <span className="bold num">{moneyM(sal)}</span>
                  </div>
                  <div className="row between">
                    <span className="dim2 small">Expires</span>
                    <span className="num">{seasonLabel(contractExp(p.contract))}{p.contract.option ? ` (${p.contract.option} option)` : ''}{p.contract.rookie ? ' · rookie scale' : ''}</span>
                  </div>
                  {p.contract.twoWay && <div className="small dim2">Two-way deal: outside the 15-man roster and the cap. He only plays when the team is short-handed.</div>}
                  <div className="row between">
                    <span className="dim2 small">Market value</span>
                    <span className="num">{moneyM(marketSalary(league, p))}</span>
                  </div>
                </div>
              ) : p.tid === FREE_AGENT ? (
                <div className="col" style={{ gap: 8 }}>
                  <div className="small dim2">Asking {moneyM(askingContract(league, p, league.userTid).amount)} × {askingContract(league, p, league.userTid).years} yrs from you.</div>
                  <Link className="btn sm primary" to="/free-agents">
                    Make an offer
                  </Link>
                </div>
              ) : (
                <div className="small dim">—</div>
              )}
              {p.tid >= 0 && (
                <div className="row" style={{ marginTop: 10, gap: 6 }}>
                  {mine ? (
                    <>
                      <Link className="btn xs" to={`/trade?give=${p.pid}`}>
                        <ArrowLeftRight size={14} /> Trade
                      </Link>
                      {p.contract.twoWay && (
                        <button
                          className="btn xs"
                          onClick={() => {
                            let res = { ok: false, reason: '' };
                            useStore.getState().mutate((l) => void (res = convertTwoWay(l, p.pid)));
                            useStore.getState().toast(res.reason, res.ok ? 'good' : 'bad');
                          }}
                        >
                          Convert to standard
                        </button>
                      )}
                      <button
                        className="btn xs danger"
                        onClick={() => {
                          const why = releaseBlockedReason(league, p);
                          if (why) useStore.getState().toast(why, 'bad');
                          else setConfirmRelease(true);
                        }}
                      >
                        Release
                      </button>
                    </>
                  ) : (
                    <Link className="btn xs" to={`/trade?with=${p.tid}&get=${p.pid}`}>
                      <ArrowLeftRight size={14} /> Trade for him
                    </Link>
                  )}
                </div>
              )}
            </Card>
          </div>
          {p.awards.length > 0 && (
            <Card title="Honors">
              <div className="chips">
                {summarizeAwards(p).map((a) => (
                  <span key={a} className="tag warn">{a}</span>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'ratings' && (
        <>
          <div className="tiny dim" style={{ margin: '0 2px 8px' }}>Tap a rating to see what it does in the engine.</div>
          {(['Physical', 'Scoring', 'Playmaking', 'Defense', 'Rebounding'] as const).map((g) => (
            <Card key={g} title={g}>
              <div className="col" style={{ gap: 6 }}>
                {RATING_META.filter((m) => m.group === g).map((m) => {
                  const val = attrDisplay(p.ratings[m.key as RatingKey]);
                  const prev = p.ratingsHistory.length > 1 ? attrDisplay(p.ratingsHistory[p.ratingsHistory.length - 2].r[m.key as RatingKey]) : null;
                  const open = openRating === m.key;
                  return (
                    <div key={m.key}>
                      <button className="ratingrow block" style={{ gridTemplateColumns: '108px 1fr 54px', width: '100%', textAlign: 'left' }} onClick={() => setOpenRating(open ? null : m.key)} aria-expanded={open}>
                        <span className="dim2">{m.label}</span>
                        <Bar value={((val - 40) / 59) * 100} color={val >= 85 ? 'var(--tier-elite)' : val >= 75 ? 'var(--good)' : val >= 64 ? 'var(--info)' : 'var(--text-dim)'} />
                        <span className="num right bold">
                          {val}
                          {prev !== null && val !== prev && <span className={`tiny ${val > prev ? 'good' : 'bad'}`}> {val > prev ? '+' : ''}{val - prev}</span>}
                        </span>
                      </button>
                      {open && <div className="tiny dim fade-in" style={{ padding: '2px 0 6px' }}>{m.help}</div>}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </>
      )}

      {tab === 'stats' && <StatsTab p={p} league={league} />}
      {tab === 'log' && <GameLog p={p} league={league} onOpen={(gid) => nav(`/game/${gid}`)} />}
      {tab === 'dev' && <DevTab p={p} league={league} mine={mine} />}

      <Sheet open={confirmRelease} onClose={() => setConfirmRelease(false)} title={`Release ${p.lastName}?`}>
        <p className="dim2">
          {p.contract.twoWay
            ? 'Two-way pay sits outside the cap, so releasing him leaves no dead money. He becomes a free agent.'
            : `His remaining salary (${moneyM(Array.from({ length: Math.max(0, contractExp(p.contract) - league.season + 1) }, (_, i) => salaryFor(p, league.season + i)).reduce((a, b) => a + b, 0))}) stays on your books as dead money. He becomes a free agent.`}
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn grow" onClick={() => setConfirmRelease(false)}>
            Cancel
          </button>
          <button
            className="btn danger grow"
            onClick={() => {
              useStore.getState().mutate((l) => releasePlayer(l, l.players[p.pid]));
              setConfirmRelease(false);
              useStore.getState().toast(`${p.lastName} released.`);
              nav('/roster');
            }}
          >
            Release
          </button>
        </div>
      </Sheet>
    </main>
  );
}

function sumStats(a: PlayerStats, b: PlayerStats): Partial<PlayerStats> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(a) as (keyof PlayerStats)[]) {
    const va = a[k];
    const vb = b[k];
    if (typeof va === 'number' && typeof vb === 'number' && k !== 'season' && k !== 'tid') out[k] = va + vb;
  }
  return out as Partial<PlayerStats>;
}

function summarizeAwards(p: Player) {
  const counts = new Map<string, number>();
  for (const a of p.awards) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  return [...counts.entries()].map(([k, n]) => (n > 1 ? `${n}× ${k}` : k));
}

function StatsTab({ p, league }: { p: Player; league: League }) {
  const [po, setPo] = useState(false);
  const rows = seasonsOf(p).filter((r) => r.playoffs === po);
  type R = (typeof rows)[number];
  const pg = (r: R) => perGame(r.tot)!;
  const cols: Col<R>[] = [
    { key: 'season', label: 'Season', left: true, sticky: true, get: (r) => r.season, fmt: (_, r) => <span className="bold">{seasonLabel(r.season)}{r.tot.real ? <span className="tiny dim"> real</span> : ''}</span> },
    { key: 'tm', label: 'Team', left: true, get: (r) => r.teams.map((t) => league.teams[t]?.abbrev ?? '?').join('/') },
    { key: 'gp', label: 'GP', get: (r) => r.tot.gp },
    { key: 'min', label: 'MIN', get: (r) => pg(r).min, fmt: (v) => f1(v as number) },
    { key: 'pts', label: 'PTS', get: (r) => pg(r).pts, fmt: (v) => f1(v as number) },
    { key: 'reb', label: 'REB', get: (r) => pg(r).reb, fmt: (v) => f1(v as number) },
    { key: 'ast', label: 'AST', get: (r) => pg(r).ast, fmt: (v) => f1(v as number) },
    { key: 'stl', label: 'STL', get: (r) => pg(r).stl, fmt: (v) => f1(v as number) },
    { key: 'blk', label: 'BLK', get: (r) => pg(r).blk, fmt: (v) => f1(v as number) },
    { key: 'tov', label: 'TOV', get: (r) => pg(r).tov, fmt: (v) => f1(v as number) },
    { key: 'fg', label: 'FG%', get: (r) => pg(r).fgPct, fmt: (v) => p1(v as number) },
    { key: 'tp', label: '3P%', get: (r) => pg(r).tpPct, fmt: (v) => p1(v as number) },
    { key: 'tpa', label: '3PA', get: (r) => pg(r).tpa, fmt: (v) => f1(v as number) },
    { key: 'ft', label: 'FT%', get: (r) => pg(r).ftPct, fmt: (v) => p1(v as number) },
    { key: 'ts', label: 'TS%', get: (r) => pg(r).tsPct, fmt: (v) => p1(v as number) },
    { key: 'usg', label: 'USG', get: (r) => pg(r).usg, fmt: (v) => p1(v as number) },
    { key: 'per', label: 'PER', get: (r) => r.tot.adv?.per ?? NaN, fmt: (v) => (isNaN(v as number) ? '—' : f1(v as number)) },
    { key: 'bpm', label: 'BPM', get: (r) => r.tot.adv?.bpm ?? NaN, fmt: (v) => (isNaN(v as number) ? '—' : signed(v as number)) },
    { key: 'ws', label: 'WS', get: (r) => r.tot.adv?.ws ?? NaN, fmt: (v) => (isNaN(v as number) ? '—' : f1(v as number)) },
    { key: 'pm', label: '+/-', get: (r) => pg(r).pm, fmt: (v) => signed(v as number) },
  ];
  return (
    <>
      <Segmented value={po ? 'po' : 'rs'} onChange={(v) => setPo(v === 'po')} options={[{ id: 'rs', label: 'Regular season' }, { id: 'po', label: 'Playoffs' }]} />
      {rows.length ? <StatTable rows={rows} cols={cols} rowKey={(r) => r.key} /> : <Empty>No stats.</Empty>}
      <div className="tiny dim">“real” seasons are imported from Basketball Reference; PER, BPM and WS exist only for those.</div>
    </>
  );
}

function GameLog({ p, league, onOpen }: { p: Player; league: League; onOpen: (gid: number) => void }) {
  const rows = league.games
    .filter((g) => g.season === league.season)
    .map((g) => {
      const side = g.home.players.some((b) => b.pid === p.pid) ? 'home' : g.away.players.some((b) => b.pid === p.pid) ? 'away' : null;
      if (!side) return null;
      const box = (side === 'home' ? g.home : g.away).players.find((b) => b.pid === p.pid)!;
      if (!box.min) return null;
      const opp = side === 'home' ? g.away : g.home;
      const us = side === 'home' ? g.home : g.away;
      return { g, box, opp, won: us.pts > opp.pts, home: side === 'home' };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .reverse();
  if (!rows.length) return <Empty>No games this season.</Empty>;
  type R = (typeof rows)[number];
  const cols: Col<R>[] = [
    { key: 'opp', label: 'Opp', left: true, sticky: true, get: (r) => r.g.gid, fmt: (_, r) => <span className="row" style={{ gap: 4 }}><span className={r.won ? 'good' : 'bad'}>{r.won ? 'W' : 'L'}</span> {r.home ? 'vs' : '@'} {league.teams[r.opp.tid].abbrev}</span> },
    { key: 'min', label: 'MIN', get: (r) => r.box.min, fmt: (v) => f1(v as number) },
    { key: 'pts', label: 'PTS', get: (r) => r.box.pts },
    { key: 'reb', label: 'REB', get: (r) => r.box.orb + r.box.drb },
    { key: 'ast', label: 'AST', get: (r) => r.box.ast },
    { key: 'fg', label: 'FG', get: (r) => r.box.fgm, fmt: (_, r) => `${r.box.fgm}-${r.box.fga}` },
    { key: '3p', label: '3P', get: (r) => r.box.tpm, fmt: (_, r) => `${r.box.tpm}-${r.box.tpa}` },
    { key: 'ft', label: 'FT', get: (r) => r.box.ftm, fmt: (_, r) => `${r.box.ftm}-${r.box.fta}` },
    { key: 'stl', label: 'STL', get: (r) => r.box.stl },
    { key: 'blk', label: 'BLK', get: (r) => r.box.blk },
    { key: 'tov', label: 'TOV', get: (r) => r.box.tov },
    { key: 'pm', label: '+/-', get: (r) => r.box.pm, fmt: (v) => signed(v as number, 0) },
  ];
  return <StatTable rows={rows} cols={cols} rowKey={(r) => r.g.gid} onRow={(r) => onOpen(r.g.gid)} />;
}

function DevTab({ p, league, mine }: { p: Player; league: League; mine: boolean }) {
  const hist = p.ratingsHistory;
  const age = league.season - p.bornYear;
  return (
    <>
      <Card title="Overall by season">
        {hist.length > 1 ? (
          <LineChart points={hist.map((h) => h.ovr)} labels={hist.map((h) => `'${String(h.season).slice(2)}`)} />
        ) : (
          <div className="small dim">History builds as seasons pass. Current: {p.ovr} OVR, potential {p.pot}.</div>
        )}
      </Card>
      <Card title="Outlook" right={<Help title="How development works">Players follow age curves: skills and IQ improve into the late 20s, while speed and explosiveness peak around 24-27 and then decline. On top of that come a hidden personal growth tendency, coaching quality (coach + coaching budget), practice intensity, playing time for young players (25+ minutes helps), and each player's training focus.</Help>}>
        <div className="small dim2">
          {age <= 22
            ? 'Young and raw. Expect big jumps with minutes and good coaching.'
            : age <= 26
              ? 'Still improving, especially skills and decision-making.'
              : age <= 30
                ? 'In his prime. Skill gains offset early athletic decline.'
                : age <= 33
                  ? 'Veteran. Athleticism is fading; IQ and shooting hold up.'
                  : 'Late career. Expect steady decline; conditioning work slows it.'}
        </div>
        <div className="row" style={{ marginTop: 10, gap: 14 }}>
          <Kpi k="Age" v={age} />
          <Kpi k="Potential" v={p.pot} />
          <Kpi k="Season wear" v={Math.round(p.wear)} sub={p.wear > 50 ? 'Needs rest' : 'Fresh'} color={p.wear > 50 ? 'var(--warn)' : undefined} />
        </div>
      </Card>
      {mine && (
        <Card title="Training focus">
          <Chips
            value={p.training}
            onChange={(f: TrainingFocus) => useStore.getState().mutate((l) => void (l.players[p.pid].training = f))}
            options={(Object.keys(FOCUS_META) as TrainingFocus[]).map((k) => ({ id: k, label: FOCUS_META[k].label }))}
          />
          <div className="small dim" style={{ marginTop: 8 }}>
            {FOCUS_META[p.training].help} Focused areas grow faster; others grow a little slower.
          </div>
        </Card>
      )}
    </>
  );
}
